"""Render the supplied Goku and derived GLBs with Blender in background mode."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--input', default=str(ROOT / 'resources/Female_Sakura.glb'))
parser.add_argument('--output', required=True)
parser.add_argument('--view', choices=['front', 'quarter', 'side', 'back'], default='front')
parser.add_argument('--clay', action='store_true')
parser.add_argument('--width', type=int, default=1000)
parser.add_argument('--height', type=int, default=1400)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.input)

# GLTF is Y-up; the Blender importer converts it to Z-up. Preserve asset placement.
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [o.matrix_world @ v.co for o in objects for v in o.data.vertices]
lo = Vector(tuple(min(v[k] for v in points) for k in range(3)))
hi = Vector(tuple(max(v[k] for v in points) for k in range(3)))
print('IMPORTED_BOUNDS', list(lo), list(hi), flush=True)
height = hi.z - lo.z
target = Vector((0, 0, (hi.z + lo.z) * .5))
if args.clay:
    mat = bpy.data.materials.new('Review clay')
    mat.diffuse_color = (.40, .46, .52, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (.40, .46, .52, 1)
    bsdf.inputs['Roughness'].default_value = .72
    for obj in objects:
        obj.data.materials.clear()
        obj.data.materials.append(mat)

# Source character faces predominantly +X (glTF rest yaw about 1.37 radians).
angle = 0 + {'front': 0, 'quarter': -.42, 'side': -math.pi/2, 'back': math.pi}[args.view]
front = Vector((math.sin(angle), -math.cos(angle), 0))
right = Vector((math.cos(angle), math.sin(angle), 0))
bpy.ops.object.camera_add(location=target + front * height * 4.0 + Vector((0,0,height*.025)))
camera = bpy.context.object
camera.rotation_euler = (target - camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = height * 1.13
bpy.context.scene.camera = camera

def area(name, location, power, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power * height * height
    data.shape = 'DISK'
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (target-obj.location).to_track_quat('-Z','Y').to_euler()

area('Key', target+front*height*2-right*height*1.5+Vector((0,0,height*1.9)), 240, height*2.5, (1,.89,.77))
area('Fill', target+front*height*1.7+right*height*2+Vector((0,0,height*.5)), 125, height*2, (.64,.78,1))
area('Rim', target-front*height*1.4+Vector((0,0,height*1.7)), 230, height*1.5, (.75,.87,1))
scene = bpy.context.scene
scene.world = bpy.data.worlds.new('Review world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.16,.19,.24,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = args.width
scene.render.resolution_y = args.height
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX'
scene.render.filepath = str(Path(args.output).resolve())
Path(scene.render.filepath).parent.mkdir(parents=True, exist_ok=True)
bpy.ops.render.render(write_still=True)

