"""Create Sakura's five actual physique meshes from the supplied static GLB.

Source remains immutable. Coincident duplicate character copies are removed,
legacy specular/glossiness materials migrate to modern glTF PBR, and a smooth
localized deformation changes arms, torso, thighs and calves in her original pose.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import math
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT/'resources/Female_Sakura.glb'
OUT = ROOT/'resources/female-sakura-progression'
STAGES = {
 'Starter': dict(shoulder=.96,chest=.97,waist=.98,hip=.98,upper=.92,fore=.94,thigh=.94,calf=.96,definition=0.),
 'Developing': dict(shoulder=1.05,chest=1.04,waist=1.,hip=1.02,upper=1.16,fore=1.10,thigh=1.12,calf=1.08,definition=.16),
 'Strong': dict(shoulder=1.14,chest=1.10,waist=1.035,hip=1.07,upper=1.40,fore=1.28,thigh=1.30,calf=1.20,definition=.35),
 'Elite': dict(shoulder=1.28,chest=1.20,waist=1.07,hip=1.13,upper=1.72,fore=1.52,thigh=1.50,calf=1.36,definition=.65),
 'Legendary': dict(shoulder=1.38,chest=1.30,waist=1.12,hip=1.20,upper=2.0,fore=1.74,thigh=1.72,calf=1.55,definition=1.),
}
HEAD_CUTOFF=127.0

def fixed_head(p):
 return ((p[:,1]>=HEAD_CUTOFF)&(np.abs(p[:,0])<=17))|(p[:,1]>=135)

def sha(data): return hashlib.sha256(data).hexdigest()

def read_glb(path):
 raw=path.read_bytes();magic,version,total=struct.unpack_from('<III',raw)
 assert (magic,version,total)==(0x46546c67,2,len(raw))
 size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size])
 bsize=struct.unpack_from('<I',raw,20+size)[0]
 return raw,doc,raw[28+size:28+size+bsize]

def accessor(doc,binary,index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
 dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
 return np.ndarray((a['count'],w),dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),
  strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()

def write_glb(path,doc,binary):
 doc=copy.deepcopy(doc);doc['buffers']=[{'byteLength':len(binary)}]
 js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*(-len(js)%4);binary+=b'\0'*(-len(binary)%4)
 output=struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(output);return sha(output)

def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)

def curve(x,knots):
 xp=np.array([k[0] for k in knots]);yp=np.array([k[1] for k in knots]);i=np.clip(np.searchsorted(xp,x,side='right')-1,0,len(xp)-2)
 t=smooth(xp[i],xp[i+1],x);return yp[i]*(1-t)+yp[i+1]*t

def bell(x,c,r):return np.exp(-.5*((x-c)/r)**2)

def deform(p,s):
 x,y,z=p.T;a=np.abs(x);sign=np.where(x<0,-1.,1.)
 fixed=fixed_head(p)|(y<=13)
 gate=smooth(13,20,y)*(1-smooth(120,HEAD_CUTOFF,y))
 width=curve(y,[(0,s['hip']),(85,s['hip']),(97,s['waist']),(106,s['waist']),(117,s['chest']),(124,s['shoulder']),(132,1)])
 depth=curve(y,[(0,s['hip']),(85,s['hip']),(98,s['waist']),(106,s['waist']),(118,1+(s['chest']-1)*.45),(128,1)])
 torso_x=x*width
 torso_z=1+(z-1)*depth
 leg_center=curve(y,[(0,22),(20,19),(40,15.8),(55,12.4),(70,10.6),(85,8.8),(96,8)])
 leg_depth=curve(y,[(0,1),(20,-1.5),(40,-.5),(60,1),(85,0)])
 leg_scale=curve(y,[(0,1),(13,1),(29,s['calf']),(40,1+(s['calf']-1)*.5),
   (55,s['thigh']),(63,s['thigh']),(73,1+(s['thigh']-1)*.5),(86,s['hip']),(96,s['hip'])])
 leg_x=x+(x-np.tanh(x/8)*leg_center)*(leg_scale-1)
 leg_z=leg_depth+(z-leg_depth)*(1+(leg_scale-1)*.90)
 leg_mix=1-smooth(70,94,y)
 body_x=torso_x*(1-leg_mix)+leg_x*leg_mix
 body_z=torso_z*(1-leg_mix)+leg_z*leg_mix
 # Broad clothed chest and back, with smaller waist growth; no breast-specific
 # exaggeration or change to the source costume or coverage.
 chest=bell(y,116,6)*bell(a,6.8,5.5)
 lats=bell(y,111,9)*bell(a,10.5,4)
 core=bell(y,103,5)*bell(a,4,3.5)
 front=smooth(-1,8,z);back=1-smooth(-7,0,z)
 body_z+=s['definition']*(front*(.25*chest+.35*core)-back*1.4*lats)
 body_x+=sign*s['definition']*.55*lats
 body_z+=s['definition']*.75*bell(y,57,8)*leg_mix*front
 # A-pose arm axis, from shoulder towards wrist. Radial growth preserves limb
 # length and tapers to the unchanged hands and shoulder attachment.
 t=((a-13.4)-(y-127))/math.sqrt(2)
 r=((a-13.4)+(y-127))/math.sqrt(2)
 arm_scale=curve(t,[(-20,1),(-6,1),(0,1+(s['upper']-1)*.85),(7,s['upper']),(17,s['upper']),
   (26,1+(s['upper']-1)*.62),(34,s['fore']),(42,1+(s['fore']-1)*.52),(49,1),(90,1)])
 arm_gate=smooth(-6,4,t)*(1-smooth(43,49,t))
 radial=(arm_scale-1)*arm_gate
 # Distinct biceps/triceps and forearm fullness; the radial axis is unchanged.
 delta_r=r*radial
 delta_z=(z+.65)*radial
 delta_z+=s['definition']*.7*bell(t,17,5)*arm_gate*smooth(-3,2,z)
 arm_x=x+sign*delta_r/math.sqrt(2)
 arm_y=y+delta_r/math.sqrt(2)
 arm_z=z+delta_z
 arm_weight=smooth(12,22,a)*(1-smooth(7,13,np.abs(r)))*smooth(-1,5,t)
 # The chest field extends gently into the shoulder instead of ending abruptly
 # at the armpit. This keeps the deformation injective during large growth.
 body_weight=(1-smooth(70,95,y)*smooth(12,33,a))*(1-smooth(35,49,t)*arm_weight)
 out=np.column_stack([x+(body_x-x)*body_weight*gate+(arm_x-x)*arm_weight,
  y+(arm_y-y)*arm_weight,
  z+(body_z-z)*body_weight*gate+(arm_z-z)*arm_weight])
 out[fixed]=p[fixed]
 return out

def deformed_normals(p,n,s):
 jac=[];epsilon=.001
 for axis in range(3):
  delta=np.zeros(3);delta[axis]=epsilon
  jac.append((deform(p+delta,s)-deform(p-delta,s))/(2*epsilon))
 jac=np.stack(jac,axis=2);det=np.linalg.det(jac)
 result=np.linalg.solve(np.swapaxes(jac,1,2),n[...,None])[...,0]
 result/=np.maximum(np.linalg.norm(result,axis=1,keepdims=True),1e-15)
 fixed=fixed_head(p)|(p[:,1]<=13);result[fixed]=n[fixed]
 return result,det

def refine(p,n,uv,faces,parts,max_edge=1.5):
 original=len(faces);passes=[]
 for step in range(9):
  _,weld=np.unique(p,axis=0,return_inverse=True)
  edges=np.stack([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]],axis=1)
  ep=p[edges].astype(np.float64);length=np.linalg.norm(ep[:,:,0]-ep[:,:,1],axis=2);y=ep[:,:,:,1]
  selected=(length>max_edge)&(y.max(axis=2)>14)&(y.min(axis=2)<127)&(parts[:,None]<6)
  ge=np.sort(weld[edges],axis=2);marked={tuple(v) for v in ge[selected].tolist()}
  if not marked:break
  masks=[sum(1<<k for k,e in enumerate(row) if tuple(e) in marked) for row in ge.tolist()]
  op=p.tolist();on=n.tolist();ot=uv.tolist();of=[];om=[];cache={}
  def mid(a,b):
   key=(min(a,b),max(a,b))
   if key not in cache:
    ix=len(op);pos=((p[a].astype(np.float64)+p[b])/2).astype(np.float32);norm=n[a].astype(np.float64)+n[b]
    norm/=max(np.linalg.norm(norm),1e-15);tex=((uv[a].astype(np.float64)+uv[b])/2).astype(np.float32)
    op.append(pos.tolist());on.append(norm.tolist());ot.append(tex.tolist());cache[key]=ix
   return cache[key]
  for (a,b,c),mask,part in zip(faces.tolist(),masks,parts.tolist()):
   if not mask:new=[(a,b,c)]
   else:
    ab=mid(a,b) if mask&1 else None;bc=mid(b,c) if mask&2 else None;ca=mid(c,a) if mask&4 else None
    if mask==1:new=[(a,ab,c),(ab,b,c)]
    elif mask==2:new=[(b,bc,a),(bc,c,a)]
    elif mask==4:new=[(c,ca,b),(ca,a,b)]
    elif mask==7:new=[(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)]
    else:
     corner,start,end,m1,m2={3:(b,a,c,ab,bc),6:(c,b,a,bc,ca),5:(a,c,b,ca,ab)}[mask]
     new=[(corner,m2,m1)];d1=sum((u-v)**2 for u,v in zip(op[start],op[m2]));d2=sum((u-v)**2 for u,v in zip(op[m1],op[end]))
     new+=([(start,m1,m2),(start,m2,end)] if d1<=d2 else [(start,m1,end),(m1,m2,end)])
   of.extend(new);om.extend([part]*len(new))
  p=np.array(op,dtype='<f4');n=np.array(on,dtype='<f4');uv=np.array(ot,dtype='<f4');faces=np.array(of,dtype=np.int64);parts=np.array(om,dtype=np.int32)
  passes.append({'pass':step+1,'triangles':len(faces),'vertices':len(p)});print('REFINEMENT',passes[-1],flush=True)
 else:raise RuntimeError('Refinement did not converge')
 return p,n,uv,faces,parts,{'sourceTriangles':original,'outputTriangles':len(faces),'maxBodyEdge':max_edge,'passes':passes}

def pack(doc,images,p,n,uv,faces,part_ids):
 out=copy.deepcopy(doc);out['bufferViews']=[];out['accessors']=[];binary=bytearray()
 def view(data,target=None):
  i=len(out['bufferViews']);v={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
  if target:v['target']=target
  out['bufferViews'].append(v);binary.extend(data);binary.extend(b'\0'*(-len(binary)%4));return i
 def acc(array,kind,ctype,bounds=False):
  a={'bufferView':view(array.tobytes(),34963 if kind=='SCALAR' else 34962),'componentType':ctype,'count':len(array),'type':kind}
  if bounds:a.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
  out['accessors'].append(a);return len(out['accessors'])-1
 for i,mesh in enumerate(out['meshes']):
  ff=faces[part_ids==i];used,inverse=np.unique(ff,return_inverse=True);prim=mesh['primitives'][0]
  prim['attributes']={'POSITION':acc(p[used].astype('<f4'),'VEC3',5126,True),'NORMAL':acc(n[used].astype('<f4'),'VEC3',5126),'TEXCOORD_0':acc(uv[used].astype('<f4'),'VEC2',5126)}
  prim['indices']=acc(inverse.astype('<u4').reshape(-1),'SCALAR',5125)
 for image,data in zip(out['images'],images):image['bufferView']=view(data)
 return out,binary

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--stages',nargs='*',default=list(STAGES));parser.add_argument('--base-only',action='store_true');args=parser.parse_args()
 raw,doc,binary=read_glb(SOURCE);source_sha=sha(raw)
 assert not doc.get('skins') and not doc.get('animations')
 # All mesh nodes share this unchanged transform chain and identity leaf transforms.
 mesh_nodes={node['mesh']:i for i,node in enumerate(doc['nodes']) if 'mesh' in node}
 for i in range(20):
  node=doc['nodes'][mesh_nodes[i]]
  assert not any(k in node for k in ['matrix','translation','rotation','scale'])
 copies=[]
 for i in range(6):
  pp=doc['meshes'][i]['primitives'][0]
  for j in [i+6,i+12]:
   other=doc['meshes'][j]['primitives'][0]
   for sem in pp['attributes']:
    assert np.array_equal(accessor(doc,binary,pp['attributes'][sem]),accessor(doc,binary,other['attributes'][sem]))
   assert np.array_equal(accessor(doc,binary,pp['indices']),accessor(doc,binary,other['indices']))
   copies.append(j)
 retained=list(range(6))+[18,19]
 images=[]
 for image in doc['images']:
  v=doc['bufferViews'][image['bufferView']];start=v.get('byteOffset',0);images.append(binary[start:start+v['byteLength']])
 points=[];normals=[];tex=[];faces=[];parts=[];offset=0
 for i,old in enumerate(retained):
  prim=doc['meshes'][old]['primitives'][0];p=accessor(doc,binary,prim['attributes']['POSITION']);n=accessor(doc,binary,prim['attributes']['NORMAL']);t=accessor(doc,binary,prim['attributes']['TEXCOORD_0']);f=accessor(doc,binary,prim['indices']).reshape(-1,3).astype(np.int64)
  points.append(p);normals.append(n);tex.append(t);faces.append(f+offset);parts.append(np.full(len(f),i,dtype=np.int32));offset+=len(p)
  doc['nodes'][mesh_nodes[old]]['mesh']=i
 for old in copies:del doc['nodes'][mesh_nodes[old]]['mesh']
 doc['meshes']=[doc['meshes'][i] for i in retained]
 original_materials=doc['materials'];doc['materials']=[copy.deepcopy(original_materials[i]) for i in retained]
 converted=[]
 for i,(mesh,material) in enumerate(zip(doc['meshes'],doc['materials'])):
  mesh['primitives'][0]['material']=i
  ext=material['extensions'].pop('KHR_materials_pbrSpecularGlossiness')
  f0=float(np.mean(ext['specularFactor']));ior=(1+math.sqrt(f0))/(1-math.sqrt(f0))
  material['pbrMetallicRoughness']={'baseColorFactor':ext.get('diffuseFactor',[1,1,1,1]),'baseColorTexture':ext['diffuseTexture'],'metallicFactor':0,'roughnessFactor':1-ext.get('glossinessFactor',1)}
  material['extensions']['KHR_materials_ior']={'ior':ior}
  material.setdefault('extras',{})['sourceSpecularGlossiness']=ext
  converted.append({'sourceMaterial':retained[i],'outputMaterial':i,'ior':ior,'roughness':1-ext['glossinessFactor'],'baseColorTexture':ext['diffuseTexture']['index']})
 doc['extensionsUsed']=['KHR_materials_ior'];doc.pop('extensionsRequired',None)
 doc['asset']['generator']='VYRA Sakura physique progression / localized surface deformation'
 p=np.concatenate(points);n=np.concatenate(normals);uv=np.concatenate(tex);f=np.concatenate(faces);part=np.concatenate(parts)
 p,n,uv,f,part,refinement=refine(p,n,uv,f,part)
 base_extras={'sourceAsset':'resources/Female_Sakura.glb','sourceSha256':source_sha,'derivation':'Duplicate coincident copies removed; source diffuse texture bytes preserved, materials migrated to modern PBR, source surface locally refined and deformed.','sakuraIdentity':{'headCutoffLocalY':HEAD_CUTOFF,'headMask':'(localY>=127 and abs(localX)<=17) or localY>=135; includes every face and hair piece while allowing outer deltoids to grow.','fixedFeetThroughLocalY':13,'coordinateUpAxis':'Y','restFacing':'+Z','removedDuplicateMeshIndices':sorted(copies),'retainedSourceMeshIndices':retained,'refinement':refinement}}
 doc.setdefault('extras',{}).update(base_extras)
 OUT.mkdir(parents=True,exist_ok=True);bd,bb=pack(doc,images,p,n,uv,f,part)
 base_sha=write_glb(OUT/'work/Sakura_base.glb',bd,bb)
 original_bounds={'min':p.min(axis=0).tolist(),'max':p.max(axis=0).tolist()}
 reports=[]
 if not args.base_only:
  for name in args.stages:
   params=STAGES[name];q=deform(p.astype(np.float64),params);qn,det=deformed_normals(p.astype(np.float64),n.astype(np.float64),params)
   print('STAGE',name,'MIN_JACOBIAN',float(det.min()),flush=True)
   if np.any(det<=0):raise RuntimeError(f'{name}: deformation has a local fold (minimum determinant {det.min()})')
   assert np.array_equal(q[fixed_head(p)],p[fixed_head(p)])
   # Auxiliary source pieces are tiny and near the floor; they remain untouched.
   dd,db=pack(doc,images,q,qn,uv,f,part);dd['extras']['stage']=name;dd['extras']['parameters']=params
   output=OUT/f'Female_Sakura_{name}.glb';digest=write_glb(output,dd,db)
   reports.append({'stage':name,'file':output.name,'sha256':digest,'bytes':output.stat().st_size,'triangles':len(f),'vertices':len(p),
    'minJacobianDeterminant':float(det.min()),'maxDisplacement':float(np.linalg.norm(q-p,axis=1).max()),'changedVertices':int(np.any(np.abs(q-p)>1e-6,axis=1).sum()),
    'headExactlyPreserved':True,'groundAndPoseOriginPreserved':True,'bounds':{'min':q.min(axis=0).tolist(),'max':q.max(axis=0).tolist()},'parameters':params})
 report={'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':source_sha,'sourceBytes':len(raw),'sourceAttribution':doc['asset'].get('extras'),
  'baseFile':'work/Sakura_base.glb','baseSha256':base_sha,'baseBounds':original_bounds,'baseTriangles':len(f),'baseVertices':len(p),'removedCoincidentMeshIndices':sorted(copies),
  'emptyPreservedNodeIndices':[mesh_nodes[i] for i in sorted(copies)],'retainedSourceMeshIndices':retained,'sourceHierarchyAndMatricesPreserved':True,
  'materialMigration':converted,'materialMigrationNote':'Original diffuse texture/factors and gloss-to-roughness conversion retained; modern dielectric IOR matches original neutral F0. Different renderer BRDFs may still produce small highlight differences.',
  'imagesSha256':[sha(i) for i in images],'refinement':refinement,'headCutoffLocalY':HEAD_CUTOFF,'fixedFeetThroughLocalY':13,'stages':reports}
 (OUT/'generation-report.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'output':str(OUT),'stages':len(reports),'baseTriangles':len(f),'baseVertices':len(p)},indent=2),flush=True)

if __name__=='__main__':main()
