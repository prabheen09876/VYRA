"""Fixed-frame Blender review renderer for the Mikasa physique variants."""
import argparse
import sys
import math
from pathlib import Path
import bpy
from mathutils import Vector

p=argparse.ArgumentParser()
p.add_argument('--input',required=True)
p.add_argument('--output',required=True)
p.add_argument('--view',choices=['front','side','back','quarter'],default='front')
p.add_argument('--clay',action='store_true')
p.add_argument('--width',type=int,default=600)
p.add_argument('--height',type=int,default=900)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(a.input).resolve()))
objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
points=[o.matrix_world@v.co for o in objs for v in o.data.vertices]
lo=Vector(tuple(min(v[i] for v in points) for i in range(3)))
hi=Vector(tuple(max(v[i] for v in points) for i in range(3)))
print('IMPORTED_BOUNDS',list(lo),list(hi),flush=True)
if a.clay:
    mat=bpy.data.materials.new('Review clay');mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(.44,.49,.55,1)
    bsdf.inputs['Roughness'].default_value=.78
    for o in objs:
        o.data.materials.clear();o.data.materials.append(mat)
target=Vector((0,0,1.78744))
angle={'front':0,'quarter':.50,'side':math.pi/2,'back':math.pi}[a.view]
front=Vector((math.sin(angle),-math.cos(angle),0))
right=Vector((math.cos(angle),math.sin(angle),0))
bpy.ops.object.camera_add(location=target+front*12+Vector((0,0,.03)))
cam=bpy.context.object;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=4.10
bpy.context.scene.camera=cam
def light(name,loc,energy,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc
    o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
light('Key',target+front*5-right*4+Vector((0,0,5)),650,5,(1,.90,.80))
light('Fill',target+front*4+right*5+Vector((0,0,1)),330,4,(.67,.80,1))
light('Rim',target-front*4+Vector((0,0,5)),700,3,(.80,.88,1))
s=bpy.context.scene;s.world=bpy.data.worlds.new('Review world');s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.18,.24,1)
s.world.node_tree.nodes['Background'].inputs[1].default_value=.40
s.render.engine='CYCLES';s.cycles.samples=20;s.cycles.use_denoising=True
s.render.resolution_x=a.width;s.render.resolution_y=a.height;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA'
s.render.film_transparent=True;s.view_settings.view_transform='AgX'
s.render.filepath=str(Path(a.output).resolve());Path(s.render.filepath).parent.mkdir(parents=True,exist_ok=True)
bpy.ops.render.render(write_still=True)
