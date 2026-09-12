"""Actual Blender GLB review renders; use one saved framing file for all stages."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector, Quaternion

parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--view',choices=['front','quarter','side','back'],default='front')
parser.add_argument('--yaw',type=float,default=0.)
parser.add_argument('--width',type=int,default=1000)
parser.add_argument('--height',type=int,default=1200)
parser.add_argument('--frame-config')
parser.add_argument('--write-frame-config')
parser.add_argument('--fit',type=float,default=1.18)
parser.add_argument('--animation')
parser.add_argument('--seconds',type=float,default=.4)
parser.add_argument('--clay',action='store_true')
parser.add_argument('--pose-left-forearm',type=float,default=0.,help='Diagnostic bend in degrees; does not change the GLB')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
scene=bpy.context.scene
for obj in list(scene.objects):
    if obj.type in {'CAMERA','LIGHT'}:
        bpy.data.objects.remove(obj,do_unlink=True)
        continue
    if obj.animation_data:
        obj.animation_data.action=None
        for track in obj.animation_data.nla_tracks:track.mute=True
if args.animation:
    choices=[a for a in bpy.data.actions if args.animation==a.name or args.animation.lower() in a.name.lower()]
    if not choices:raise RuntimeError(f'Animation {args.animation!r} not found; available: {[a.name for a in bpy.data.actions]}')
    for obj in scene.objects:
        if obj.type=='ARMATURE':
            obj.animation_data_create();obj.animation_data.action=choices[0]
            if choices[0].slots:obj.animation_data.action_slot=choices[0].slots[0]
    scene.frame_set(round(args.seconds*scene.render.fps))
if args.pose_left_forearm:
    posed=[]
    for obj in scene.objects:
        if obj.type=='ARMATURE':
            for bone in obj.pose.bones:
                if 'leftforearm' in bone.name.lower():
                    bone.rotation_mode='QUATERNION'
                    bone.rotation_quaternion=Quaternion((0,0,1),math.radians(args.pose_left_forearm))
                    posed.append(bone.name)
    if not posed:raise RuntimeError('Requested diagnostic pose but no LeftForeArm bone found')
    print(json.dumps({'diagnosticPose':{'bones':posed,'localZDegrees':args.pose_left_forearm}}),flush=True)
scene.view_layers[0].update()
deps=bpy.context.evaluated_depsgraph_get()
objects=[o for o in scene.objects if o.type=='MESH' and not o.hide_render and o.visible_get()
         and not any(c.hide_render for c in o.users_collection)]
points=[]
for obj in objects:
    ev=obj.evaluated_get(deps);mesh=ev.to_mesh()
    points.extend(ev.matrix_world@v.co for v in mesh.vertices)
    ev.to_mesh_clear()
lo=Vector(tuple(min(p[k] for p in points) for k in range(3)))
hi=Vector(tuple(max(p[k] for p in points) for k in range(3)))
height=hi.z-lo.z
angle=args.yaw+{'front':0,'quarter':-.40,'side':-math.pi/2,'back':math.pi}[args.view]
front=Vector((math.sin(angle),-math.cos(angle),0))
right=Vector((math.cos(angle),math.sin(angle),0))
target=(lo+hi)*.5
width=max(p.dot(right) for p in points)-min(p.dot(right) for p in points)
frame={'target':list(target),'height':height,'orthoScale':max(height,width*args.height/args.width)*args.fit,
       'sourceBounds':{'min':list(lo),'max':list(hi)},'yaw':args.yaw}
if args.frame_config:frame=json.loads(Path(args.frame_config).read_text())
if args.write_frame_config:
    Path(args.write_frame_config).parent.mkdir(parents=True,exist_ok=True)
    Path(args.write_frame_config).write_text(json.dumps(frame,indent=2)+'\n')
target=Vector(frame['target']);height=frame['height']
print(json.dumps({'input':args.input,'bounds':{'min':list(lo),'max':list(hi)},'frame':frame,'animations':[a.name for a in bpy.data.actions]}),flush=True)
if args.clay:
    mat=bpy.data.materials.new('Review clay');mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(.37,.45,.52,1)
    bsdf.inputs['Roughness'].default_value=.68
    for obj in objects:
        obj.data.materials.clear();obj.data.materials.append(mat)
bpy.ops.object.camera_add(location=target+front*height*4+Vector((0,0,height*.018)))
camera=bpy.context.object
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=frame['orthoScale']
camera.data.clip_end=height*100;camera.data.clip_start=height*.0001
scene.camera=camera
def area(name,position,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power*height*height
    data.shape='DISK';data.size=size*height;data.color=color
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    obj.location=position;obj.rotation_euler=(target-position).to_track_quat('-Z','Y').to_euler()
area('Key',target+front*height*2-right*height*1.4+Vector((0,0,height*1.9)),230,2.5,(1,.91,.82))
area('Fill',target+front*height*1.8+right*height*2+Vector((0,0,height*.5)),120,2,(.68,.81,1))
area('Rim',target-front*height*1.5+Vector((0,0,height*1.7)),210,1.6,(.8,.89,1))
scene.world=bpy.data.worlds.new('Review world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.19,.24,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.resolution_x=args.width;scene.render.resolution_y=args.height;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True;scene.view_settings.view_transform='AgX'
scene.render.filepath=str(Path(args.output).resolve())
Path(scene.render.filepath).parent.mkdir(parents=True,exist_ok=True)
bpy.ops.render.render(write_still=True)
