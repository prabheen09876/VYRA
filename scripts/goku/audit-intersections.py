"""Audit nonadjacent triangle crossings against the shared base without editing GLBs.

Run with Blender: --background --python-exit-code 1 --python scripts/goku/audit-intersections.py
"""
from pathlib import Path
import hashlib, json, struct, time
from datetime import datetime, timezone
import numpy as np
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[2]
FOLDER=ROOT/'resources/goku-progression'
START=time.monotonic()

def load(path):
    raw=path.read_bytes(); size=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+size]); binary=raw[28+size:]
    def accessor(idx):
        a=doc['accessors'][idx]; v=doc['bufferViews'][a['bufferView']]
        dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']])
        width={'VEC3':3,'SCALAR':1}[a['type']]
        return np.ndarray((a['count'],width),dt,buffer=binary,
            offset=v.get('byteOffset',0)+a.get('byteOffset',0),
            strides=(v.get('byteStride',dt.itemsize*width),dt.itemsize)).copy()
    p=doc['meshes'][0]['primitives'][0]
    return accessor(p['attributes']['POSITION']).astype(np.float64),accessor(p['indices']).reshape(-1,3)

def segment_hits_triangle(a,b,tri):
    direction=b-a; e1=tri[:,1]-tri[:,0];e2=tri[:,2]-tri[:,0]
    h=np.cross(direction,e2);det=np.einsum('ij,ij->i',e1,h)
    valid=np.abs(det)>1e-16
    inv=np.divide(1,det,out=np.zeros_like(det),where=valid)
    s=a-tri[:,0];u=np.einsum('ij,ij->i',s,h)*inv;q=np.cross(s,e1)
    v=np.einsum('ij,ij->i',direction,q)*inv;t=np.einsum('ij,ij->i',e2,q)*inv
    return valid&(u>=-1e-8)&(v>=-1e-8)&(u+v<=1+1e-8)&(t>1e-7)&(t<1-1e-7)

base,faces=load(FOLDER/'work/goku-web-base.glb')
_,weld=np.unique(base,axis=0,return_inverse=True)
welded= weld[faces]
results=[];base_pairs=None
for stage,path in [('Base',FOLDER/'work/goku-web-base.glb')]+[(s,FOLDER/f'Goku_{s}.glb') for s in ['Starter','Developing','Strong','Elite','Legendary']]:
    points,triangles=load(path)
    bvh=BVHTree.FromPolygons(points.tolist(),triangles.tolist(),all_triangles=True,epsilon=0)
    overlaps=bvh.overlap(bvh)
    pairs=np.array([(a,b) for a,b in overlaps if a<b],dtype=np.int32).reshape(-1,2)
    adjacent=np.zeros(len(pairs),dtype=bool)
    for a in range(3):
        for b in range(3): adjacent|=welded[pairs[:,0],a]==welded[pairs[:,1],b]
    pairs=pairs[~adjacent]
    true=np.zeros(len(pairs),dtype=bool)
    tri_a=points[triangles[pairs[:,0]]];tri_b=points[triangles[pairs[:,1]]]
    for edge in range(3):
        true|=segment_hits_triangle(tri_a[:,edge],tri_a[:,(edge+1)%3],tri_b)
        true|=segment_hits_triangle(tri_b[:,edge],tri_b[:,(edge+1)%3],tri_a)
    crossing=set(map(tuple,pairs[true].tolist()))
    if base_pairs is None:base_pairs=crossing
    new=crossing-base_pairs
    row={'stage':stage,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'nonadjacentBvhCandidates':int(len(pairs)),
        'nonadjacentNoncoplanarIntersectionPairs':len(crossing),'newPairsVersusBase':len(new),
        'intersectionPairs':[[int(a),int(b)] for a,b in sorted(crossing)],
        'examples':[{'triangles':[int(a),int(b)],'baseCentroid':base[faces[[a,b]]].mean(axis=(0,1)).tolist()} for a,b in sorted(new)[:12]],
        'elapsedSeconds':round(time.monotonic()-START,2)}
    results.append(row);print(json.dumps(row),flush=True)
report={'createdAt':datetime.now(timezone.utc).isoformat(),'method':'Blender BVHTree broad phase then segment-triangle exact narrow phase; pairs sharing any exact-welded source vertex excluded.',
    'limitations':'Does not detect coplanar overlaps, contacts confined to segment endpoints, intersections between adjacent triangles, or prove an embedded source surface is watertight.',
    'status':'failed' if any(row['newPairsVersusBase'] for row in results) else 'passed',
    'results':results}
(FOLDER/'intersection-audit.json').write_text(json.dumps(report,indent=2)+'\n')
if report['status']=='failed':
    raise RuntimeError('New nonadjacent triangle crossings detected; see intersection-audit.json')
