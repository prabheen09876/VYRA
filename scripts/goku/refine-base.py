"""Conforming midpoint refinement before nonlinear physique deformation.

Run after optimize-source.mjs and before generate-progression.py. Existing source
vertices, normals, UVs, image bytes, material and transforms remain unchanged.
Subdividing long triangles samples the deformation between their old vertices.
"""
from pathlib import Path
import argparse
import hashlib
import json
import struct

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASE = ROOT / 'resources/goku-progression/work/goku-web-base.glb'
PATCH_FILE = Path(__file__).with_name('refinement-patches.json')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path):
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from('<III', raw)
    assert magic == 0x46546c67 and version == 2 and total == len(raw)
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+size])
    binary_size = struct.unpack_from('<I', raw, 20+size)[0]
    return raw, doc, raw[28+size:28+size+binary_size]


def read_accessor(doc, binary, index):
    acc = doc['accessors'][index]
    view = doc['bufferViews'][acc['bufferView']]
    dtype = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2'}[acc['componentType']])
    width = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[acc['type']]
    return np.ndarray((acc['count'], width), dtype, buffer=binary,
        offset=view.get('byteOffset', 0)+acc.get('byteOffset', 0),
        strides=(view.get('byteStride', width*dtype.itemsize), dtype.itemsize)).copy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, default=DEFAULT_BASE)
    parser.add_argument('--max-edge', type=float, default=.004)
    parser.add_argument('--hot-edge', type=float, default=.001)
    parser.add_argument('--max-passes', type=int, default=12)
    parser.add_argument('--max-triangles', type=int, default=240000)
    parser.add_argument('--rebuild', action='store_true', help='Rebuild an already-refined base from its preserved unrefined backup.')
    args = parser.parse_args()
    raw, doc, binary = read_glb(args.input)
    backup = args.input.with_name(args.input.stem+'-unrefined.glb')
    if doc.get('extras', {}).get('gokuSurfaceRefinement'):
        if args.rebuild:
            raw, doc, binary = read_glb(backup)
            assert not doc.get('extras', {}).get('gokuSurfaceRefinement'), 'Expected an unrefined backup.'
        else:
            print('Already refined; leaving the base unchanged (idempotent).', flush=True)
            return
    source_sha = sha(raw)
    primitives = [p for m in doc['meshes'] for p in m['primitives']]
    assert len(primitives) == 1, 'Run the joined source optimizer first.'
    primitive = primitives[0]
    positions = read_accessor(doc, binary, primitive['attributes']['POSITION'])
    normals = read_accessor(doc, binary, primitive['attributes']['NORMAL'])
    uv = read_accessor(doc, binary, primitive['attributes']['TEXCOORD_0'])
    faces = read_accessor(doc, binary, primitive['indices']).reshape(-1, 3).astype(np.int64)
    original_positions = positions.copy()
    original_normals = normals.copy()
    original_uv = uv.copy()
    source_face_count = len(faces)
    images = []
    for image in doc['images']:
        view = doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        images.append(binary[start:start+view['byteLength']])

    # Freeze the original audit's face indices for deterministic reproduction;
    # later audits refer to the refined topology and must not replace this set.
    if PATCH_FILE.exists():
        patches = json.loads(PATCH_FILE.read_text())
        assert patches['unrefinedBaseSha256'] == source_sha, 'Patch manifest does not match this unrefined base.'
    else:
        audit = json.loads((ROOT / 'resources/goku-progression/intersection-audit.json').read_text())
        bad_faces = sorted({face for row in audit['results'] for pair in row['intersectionPairs'] for face in pair})
        patches = {
            'unrefinedBaseSha256': source_sha,
            'purpose': 'Original nonadjacent intersection face patches, plus one geometric vertex ring, refined before nonlinear deformation.',
            'originalFaceIndices': bad_faces,
        }
        PATCH_FILE.write_text(json.dumps(patches, indent=2)+'\n')
    bad_faces = np.array(patches['originalFaceIndices'], dtype=np.int64)
    assert len(bad_faces) and bad_faces.max() < len(faces)
    _, weld = np.unique(positions, axis=0, return_inverse=True)
    affected_vertices = np.unique(weld[faces[bad_faces]])
    original_hot = np.any(np.isin(weld[faces], affected_vertices), axis=1)
    hot = original_hot.copy()
    # A second exact intersection audit identified two tiny rear-collar patches
    # in the extreme stage. Spatial selection stays stable when topology changes.
    collar_centers = np.array([[-.0655, .0957, .241], [-.07366, -.03021, .24007]])
    collar_radius, collar_edge = .006, .0005
    face_low = positions[faces].min(axis=1)
    face_high = positions[faces].max(axis=1)
    collar_hot = np.zeros(len(faces), dtype=bool)
    for center in collar_centers:
        distance = np.linalg.norm(np.maximum(np.maximum(face_low-center, center-face_high), 0), axis=1)
        collar_hot |= distance <= collar_radius
    original_collar_hot_count = int(collar_hot.sum())
    history = []
    broad_low, broad_high = .036, .275
    yaw = 1.37

    for iteration in range(args.max_passes):
        # Select edges geometrically, not by split UV/normal indices. Every
        # coincident seam edge therefore receives the same subdivision pattern.
        _, weld = np.unique(positions, axis=0, return_inverse=True)
        edges = np.stack((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]), axis=1)
        endpoints = positions[edges].astype(np.float64)
        lengths = np.linalg.norm(endpoints[:, :, 0]-endpoints[:, :, 1], axis=2)
        z = endpoints[:, :, :, 2]
        u = endpoints[:, :, :, 0]*np.cos(yaw)+endpoints[:, :, :, 1]*np.sin(yaw)
        collar = (z.max(axis=2) > .225) & (z.min(axis=2) < broad_high)
        arms = (z.max(axis=2) > broad_low) & (z.min(axis=2) < .205) & (np.abs(u).max(axis=2) > .08)
        in_band = collar | arms
        selected = ((lengths > args.max_edge) & in_band) | ((lengths > args.hot_edge) & hot[:, None]) | \
            ((lengths > collar_edge) & collar_hot[:, None])
        welded_edges = np.sort(weld[edges], axis=2)
        selected_edges = {tuple(edge) for edge in welded_edges[selected].tolist()}
        if not selected_edges:
            break
        masks = np.array([sum((1 << k) if tuple(edge) in selected_edges else 0 for k, edge in enumerate(row))
                          for row in welded_edges.tolist()], dtype=np.uint8)
        projected_count = len(faces)+sum(int(mask).bit_count() for mask in masks)
        print(json.dumps({'pass': iteration+1, 'selectedGeometricEdges': len(selected_edges),
            'beforeTriangles': len(faces), 'afterTriangles': projected_count,
            'maximumSelectedEdge': float(lengths[selected].max())}), flush=True)
        if projected_count > args.max_triangles:
            raise RuntimeError(f'Refinement would make {projected_count} triangles; raise --max-triangles or narrow refinement.')

        out_positions = positions.tolist()
        out_normals = normals.tolist()
        out_uv = uv.tolist()
        midpoint_cache = {}

        def midpoint(a, b):
            key = (min(a, b), max(a, b))
            if key not in midpoint_cache:
                index = len(out_positions)
                # Float64 arithmetic followed by one float32 rounding is shared
                # across all attribute copies of each exact-position edge.
                p = ((positions[a].astype(np.float64)+positions[b])/2).astype(np.float32)
                n = normals[a].astype(np.float64)+normals[b]
                length = np.linalg.norm(n)
                n = n/length if length > 1e-12 else normals[a]
                t = ((uv[a].astype(np.float64)+uv[b])/2).astype(np.float32)
                out_positions.append(p.tolist())
                out_normals.append(n.tolist())
                out_uv.append(t.tolist())
                midpoint_cache[key] = index
            return midpoint_cache[key]

        out_faces = []
        out_hot = []
        out_collar_hot = []
        for face, mask, hot_face, collar_face in zip(faces.tolist(), masks.tolist(), hot.tolist(), collar_hot.tolist()):
            a, b, c = face
            if mask == 0:
                new = [face]
            else:
                ab = midpoint(a, b) if mask & 1 else None
                bc = midpoint(b, c) if mask & 2 else None
                ca = midpoint(c, a) if mask & 4 else None
                if mask == 1:
                    new = [(a, ab, c), (ab, b, c)]
                elif mask == 2:
                    new = [(b, bc, a), (bc, c, a)]
                elif mask == 4:
                    new = [(c, ca, b), (ca, a, b)]
                elif mask == 7:
                    new = [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
                else:
                    # Corner triangle plus the better diagonal of the quad.
                    if mask == 3:
                        corner, start, end, mid1, mid2 = b, a, c, ab, bc
                    elif mask == 6:
                        corner, start, end, mid1, mid2 = c, b, a, bc, ca
                    else:
                        corner, start, end, mid1, mid2 = a, c, b, ca, ab
                    new = [(corner, mid2, mid1)]
                    p = out_positions
                    d1 = sum((x-y)**2 for x, y in zip(p[start], p[mid2]))
                    d2 = sum((x-y)**2 for x, y in zip(p[mid1], p[end]))
                    if d1 <= d2:
                        new += [(start, mid1, mid2), (start, mid2, end)]
                    else:
                        new += [(start, mid1, end), (mid1, mid2, end)]
            out_faces.extend(new)
            out_hot.extend([hot_face]*len(new))
            out_collar_hot.extend([collar_face]*len(new))
        positions = np.array(out_positions, dtype='<f4')
        normals = np.array(out_normals, dtype='<f4')
        uv = np.array(out_uv, dtype='<f4')
        faces = np.array(out_faces, dtype=np.int64)
        hot = np.array(out_hot, dtype=bool)
        collar_hot = np.array(out_collar_hot, dtype=bool)
        history.append({'pass': iteration+1, 'selectedGeometricEdges': len(selected_edges),
            'triangles': len(faces), 'vertices': len(positions)})
    else:
        raise RuntimeError('Refinement did not converge within --max-passes.')

    assert np.array_equal(positions[:len(original_positions)], original_positions)
    assert np.array_equal(normals[:len(original_normals)], original_normals)
    assert np.array_equal(uv[:len(original_uv)], original_uv)
    assert np.array_equal(positions.min(axis=0), original_positions.min(axis=0))
    assert np.array_equal(positions.max(axis=0), original_positions.max(axis=0))
    triangle_points = positions[faces].astype(np.float64)
    areas = np.linalg.norm(np.cross(triangle_points[:, 1]-triangle_points[:, 0], triangle_points[:, 2]-triangle_points[:, 0]), axis=1)
    assert np.all(areas > 1e-14), 'Refinement introduced a degenerate face.'

    metadata = {
        'algorithm': 'Conforming edge-midpoint subdivision, welded geometric edge decisions; interpolated UV and normalized split normals.',
        'unrefinedBaseSha256': source_sha,
        'broadBandLocalZ': [broad_low, broad_high],
        'broadRegion': 'Collar z .225-.275; arm-side |canonicalU|>.08 at z .036-.205; all audit patches include one geometric vertex ring.',
        'broadBandMaximumEdgeLength': args.max_edge,
        'auditedPatchMaximumEdgeLength': args.hot_edge,
        'rearCollarSpatialPatches': {'centers': collar_centers.tolist(), 'radius': collar_radius,
            'maximumEdgeLength': collar_edge, 'sourceFaces': original_collar_hot_count},
        'auditedSourceFaces': len(bad_faces),
        'sourceFacesIncludingOneRing': int(original_hot.sum()),
        'sourceVertices': len(original_positions), 'sourceTriangles': source_face_count,
        'outputVertices': len(positions), 'outputTriangles': len(faces),
        'addedVertices': len(positions)-len(original_positions),
        'addedTriangles': len(faces)-source_face_count,
        'originalVerticesAndAttributesPreserved': True,
        'sourceBoundsPreserved': True, 'imageSha256': [sha(image) for image in images],
        'passes': history,
    }
    doc.setdefault('extras', {})['gokuSurfaceRefinement'] = metadata
    doc['bufferViews'] = []
    doc['accessors'] = []
    out_binary = bytearray()

    def add_view(data, target=None):
        index = len(doc['bufferViews'])
        view = {'buffer': 0, 'byteOffset': len(out_binary), 'byteLength': len(data)}
        if target:
            view['target'] = target
        doc['bufferViews'].append(view)
        out_binary.extend(data)
        out_binary.extend(b'\x00'*(-len(out_binary) % 4))
        return index

    def add_accessor(values, kind, component, bounds=False):
        view = add_view(values.tobytes(), 34963 if kind == 'SCALAR' else 34962)
        index = len(doc['accessors'])
        acc = {'bufferView': view, 'componentType': component, 'count': len(values), 'type': kind}
        if bounds:
            acc.update(min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist())
        doc['accessors'].append(acc)
        return index

    primitive['attributes']['POSITION'] = add_accessor(positions, 'VEC3', 5126, True)
    primitive['attributes']['NORMAL'] = add_accessor(normals, 'VEC3', 5126)
    primitive['attributes']['TEXCOORD_0'] = add_accessor(uv, 'VEC2', 5126)
    primitive['indices'] = add_accessor(faces.astype('<u4').reshape(-1), 'SCALAR', 5125)
    for image, data in zip(doc['images'], images):
        image['bufferView'] = add_view(data)
    doc['buffers'] = [{'byteLength': len(out_binary)}]
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' '*(-len(encoded) % 4)
    output = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(out_binary)) + \
        struct.pack('<II', len(encoded), 0x4e4f534a)+encoded + \
        struct.pack('<II', len(out_binary), 0x004e4942)+out_binary
    if backup.exists():
        assert sha(backup.read_bytes()) == source_sha, 'Refusing to replace a different unrefined backup.'
    else:
        backup.write_bytes(raw)
    args.input.write_bytes(output)
    report = {**metadata, 'outputSha256': sha(output), 'outputBytes': len(output),
              'backup': str(backup.relative_to(ROOT)).replace('\\', '/')}
    args.input.with_suffix('.refinement.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
