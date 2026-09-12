"""Blender review of Female_Name GLBs; does not change source or export geometry."""
import argparse, math, sys, json
from pathlib import Path
import bpy
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True);parser.add_argument('--output',required=True)
parser.add_argument('--clip',default='');parser.add_argument('--time',type=float,default=.35)
parser.add_argument('--view',choices=['front','quarter','side','back'],default='front')
parser.add_argument('--clay',action='store_true');parser.add_argument('--width',type=int,default=900)
parser.add_argument('--height',type=int,default=1200);parser.add_argument('--samples',type=int,default=16)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
armatures=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
print('ACTIONS',json.dumps([{'name':a.name,'frames':list(a.frame_range),'slots':[s.identifier for s in a.slots]} for a in bpy.data.actions]),flush=True)
for obj in armatures:
    if obj.animation_data:
        for track in obj.animation_data.nla_tracks:track.mute=True
        obj.animation_data.action=None
    obj.data.pose_position='REST'
if args.clip:
    action=next((a for a in bpy.data.actions if a.name==args.clip or a.name.endswith('_'+args.clip) or args.clip in a.name),None)
    if action is None:raise RuntimeError(f'Clip {args.clip} not found')
    for obj in armatures:
        obj.data.pose_position='POSE';obj.animation_data_create();obj.animation_data.action=action
        if len(action.slots):obj.animation_data.action_slot=action.slots[0]
    bpy.context.scene.frame_set(int(round(args.time*bpy.context.scene.render.fps)))
    print('PLAYING',action.name,'frame',bpy.context.scene.frame_current,flush=True)
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render and not any(c.hide_render for c in o.users_collection)]
points=[]
for obj in objects:
    if any('Weapon' in m.name for m in obj.data.materials if m):continue
    evaluated=obj.evaluated_get(deps); mesh=evaluated.to_mesh()
    points.extend(evaluated.matrix_world@v.co for v in mesh.vertices);evaluated.to_mesh_clear()
lo=Vector([min(v[k] for v in points) for k in range(3)]);hi=Vector([max(v[k] for v in points) for k in range(3)])
print('BOUNDS',list(lo),list(hi),flush=True)
height=2.099174;target=Vector((-.26661,0,1.049587))
if args.clay:
    mat=bpy.data.materials.new('Review_clay');mat.diffuse_color=(.38,.47,.52,1);mat.use_nodes=True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.38,.47,.52,1)
    for obj in objects:obj.data.materials.clear();obj.data.materials.append(mat)
angle={'front':0,'quarter':-.38,'side':-math.pi/2,'back':math.pi}[args.view]
front=Vector((math.sin(angle),-math.cos(angle),0));right=Vector((math.cos(angle),math.sin(angle),0))
bpy.ops.object.camera_add(location=target+front*height*4)
camera=bpy.context.object;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=height*1.23;bpy.context.scene.camera=camera
def light(name,pos,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=pos
    o.rotation_euler=(target-pos).to_track_quat('-Z','Y').to_euler()
light('Key',target+front*height*2-right*height*1.5+Vector((0,0,height*1.8)),650,height*2,(1,.9,.8))
light('Fill',target+front*height*2+right*height*2,360,height*2,(.7,.82,1))
light('Rim',target-front*height+Vector((0,0,height*1.5)),600,height*1.5,(.8,.9,1))
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.16,.2,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=True
scene.render.resolution_x=args.width;scene.render.resolution_y=args.height;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.view_settings.view_transform='AgX';scene.render.filepath=str(Path(args.output).resolve())
Path(scene.render.filepath).parent.mkdir(parents=True,exist_ok=True)
bpy.ops.render.render(write_still=True)
