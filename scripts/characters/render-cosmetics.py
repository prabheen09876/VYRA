"""Render the actual posed vertex geometry exported by review-cosmetics.mjs."""
import sys, math
from pathlib import Path
import bpy
from mathutils import Vector
stage = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'starter'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=str(Path(f'tmp/cosmetics-review/{stage}.obj').resolve()))
# OBJ is authored Y-up; the importer default maps to Blender Z-up.
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in objects:
    for p in o.data.polygons: p.use_smooth = True
target = Vector((0, 0, 1.1))
bpy.ops.object.camera_add(location=(0, -18, 4.3))
camera = bpy.context.object
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'; camera.data.ortho_scale = 13.0
bpy.context.scene.camera = camera
for name, pos, energy, size in [('Key',(-3,-7,7),1900,8),('Fill',(6,-4,4),1000,7),('Rim',(0,4,6),1500,8)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
    light=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(light); light.location=pos
    light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene; scene.world=bpy.data.worlds.new('World');scene.world.color=(.16,.16,.16)
scene.render.engine='CYCLES'; scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=2200;scene.render.resolution_y=600;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.view_settings.view_transform='AgX'
scene.render.filepath=str(Path(f'tmp/cosmetics-review/{stage}.png').resolve()); bpy.ops.render.render(write_still=True)
