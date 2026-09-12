"""Offline GLB asset contact sheet. This does not exercise Expo GL or measure FPS."""
from pathlib import Path
import json
import struct
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
STAGES = ['starter', 'developing', 'strong', 'elite', 'legendary']
WIDTH, HEIGHT, SCALE = 1600, 720, 2
# Halo ground, matching apps/mobile/src/theme.ts `colors.background`.
image = Image.new('RGB', (WIDTH * SCALE, HEIGHT * SCALE), '#05070A')
draw = ImageDraw.Draw(image)

def font(size, bold=False):
    candidates = [Path('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf'),
                  Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size * SCALE)
    return ImageFont.load_default()

def label(x, y, text, size, color, bold=False):
    draw.text((x * SCALE, y * SCALE), text, font=font(size, bold), fill=color)

def matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix']).reshape(4, 4).T
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    rotation = np.array([[1-2*y*y-2*z*z, 2*x*y-2*z*w, 2*x*z+2*y*w],
                         [2*x*y+2*z*w, 1-2*x*x-2*z*z, 2*y*z-2*x*w],
                         [2*x*z-2*y*w, 2*y*z+2*x*w, 1-2*x*x-2*y*y]])
    result = np.eye(4)
    result[:3, :3] = rotation @ np.diag(node.get('scale', [1, 1, 1]))
    result[:3, 3] = node.get('translation', [0, 0, 0])
    return result

def load_triangles(path):
    raw = path.read_bytes()
    json_length, = struct.unpack_from('<I', raw, 12)
    document = json.loads(raw[20:20+json_length])
    binary_offset = 20 + json_length + 8
    binary = raw[binary_offset:]
    dtypes = {5126: '<f4', 5123: '<u2', 5125: '<u4', 5121: 'u1'}
    widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
    def accessor(index):
        item = document['accessors'][index]
        view = document['bufferViews'][item['bufferView']]
        offset = view.get('byteOffset', 0) + item.get('byteOffset', 0)
        dtype = np.dtype(dtypes[item['componentType']])
        width = widths[item['type']]
        stride = view.get('byteStride', dtype.itemsize * width)
        return np.ndarray((item['count'], width), dtype=dtype, buffer=binary,
                          offset=offset, strides=(stride, dtype.itemsize)).copy()
    triangles = []
    def visit(index, parent):
        node = document['nodes'][index]
        if node.get('name', '').startswith('Cosmetic_Bracer_'):
            return
        world = parent @ matrix(node)
        if 'mesh' in node:
            for primitive in document['meshes'][node['mesh']]['primitives']:
                vertices = accessor(primitive['attributes']['POSITION'])
                points = (world @ np.column_stack([vertices, np.ones(len(vertices))]).T).T[:, :3]
                indices = accessor(primitive['indices']).reshape(-1, 3)
                color = document['materials'][primitive['material']]['pbrMetallicRoughness']['baseColorFactor'][:3]
                for tri in indices:
                    p = points[tri]
                    normal = np.cross(p[1]-p[0], p[2]-p[0])
                    length = np.linalg.norm(normal)
                    if length > 1e-9:
                        triangles.append((p, normal/length, np.array(color)))
        for child in node.get('children', []):
            visit(child, world)
    for index in document['scenes'][document.get('scene', 0)]['nodes']:
        visit(index, np.eye(4))
    return triangles

# Chrome colors mirror theme.ts: brand mint wordmark (10.83:1 on the ground), accent mint eyebrow
# (13.63:1), muted silver body (9.22:1).
label(44, 26, 'VYRA', 32, '#2DD4BF', True)
label(44, 71, 'VANGUARD / FIVE EVOLUTIONS', 14, '#5EEAD4', True)
label(850, 44, 'Real effort. A deliberately impossible hero.', 20, '#A8B0BC')
eye = np.array([1.0, 1.9, 8.6])
target = np.array([0, 1.6, 0])
forward = target-eye; forward /= np.linalg.norm(forward)
right = np.cross(forward, [0, 1, 0]); right /= np.linalg.norm(right)
up = np.cross(right, forward)
light = np.array([-.3, .8, 1]); light /= np.linalg.norm(light)
# Mirrors the stage ramp in packages/core/src/catalog.ts — this file does not import it, so the
# two drift silently. Keep them in step when the ramp is re-cut.
colors = ['#8494A6', '#6FA8B8', '#4FC3C3', '#2DD4BF', '#5EEAD4']
requirements = ['0 XP / Start here', '100 XP / 1 active day', '1,000 XP / 5 active days', '3,000 XP / 14 active days', '7,500 XP / 30 active days']
for column, stage in enumerate(STAGES):
    left, top, card_width, card_height = 28 + column*314, 118, 298, 527
    # `colors.surface`; the stage number on it climbs 5.95:1 -> 12.49:1 across the ramp.
    draw.rounded_rectangle((left*SCALE, top*SCALE, (left+card_width)*SCALE, (top+card_height)*SCALE), radius=22*SCALE, fill='#10141A')
    center = np.array([left+card_width/2, top+235]) * SCALE
    focal = 510*SCALE / (2*np.tan(np.deg2rad(32)/2))
    rendered = []
    for vertices, normal, color in load_triangles(ROOT/'apps/mobile/assets/heroes'/f'{stage}.glb'):
        if np.dot(normal, eye-vertices.mean(axis=0)) <= 0:
            continue
        relative = vertices-eye
        depth = relative @ forward
        x, y = relative @ right, relative @ up
        projected = np.column_stack([center[0]+focal*x/depth, center[1]-focal*y/depth])
        shaded = np.clip(color * (.35 + .65*max(0, np.dot(normal, light))), 0, 1)
        srgb = np.where(shaded <= .0031308, 12.92*shaded, 1.055*shaded**(1/2.4)-.055)
        rendered.append((depth.mean(), projected, tuple((srgb*255).astype(int))))
    ground = -eye
    ground_center = center + focal*np.array([np.dot(ground, right), -np.dot(ground, up)])/np.dot(ground, forward)
    gx, gy = ground_center
    draw.ellipse((gx-87*SCALE, gy-6*SCALE, gx+87*SCALE, gy+10*SCALE), fill='#0A0D12')
    for _, points, color in sorted(rendered, key=lambda entry: -entry[0]):
        draw.polygon([tuple(point) for point in points], fill=color)
    label(left+21, top+24, f'0{column+1}', 13, colors[column], True)
    label(left+21, top+462, stage.capitalize(), 24, '#F2F5F8', True)
    label(left+21, top+497, requirements[column], 12, '#A8B0BC')
label(34, 674, 'Original procedural GLB assets. Offline asset study; Expo rendering and device performance still require validation.', 13, '#A8B0BC')
output = ROOT/'docs/assets/vanguard-evolutions.png'
output.parent.mkdir(parents=True, exist_ok=True)
image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS).save(output)
print(output)
