"""Five physique variants of Female_Name.glb, retaining its existing animated skin.

Only body POSITION/NORMAL bytes change. Bone inverse-bind frames drive muscle growth;
the 29-joint rig, 14 clips, face, hair, glass accessory, and weapon remain untouched.
"""
from pathlib import Path
import copy, hashlib, json, math, struct
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'resources/Female_Name.glb'
OUT=ROOT/'resources/female-name-progression'
STAGES={
 'Starter':dict(arm=.70,forearm=.77,shoulder=.80,lat=.86,core=.88,hip=.91,thigh=.81,calf=.84,shift=-.008,definition=-.2),
 'Developing':dict(arm=.96,forearm=.96,shoulder=.98,lat=.98,core=.98,hip=.98,thigh=.98,calf=.98,shift=-.001,definition=.0),
 'Strong':dict(arm=1.24,forearm=1.17,shoulder=1.21,lat=1.12,core=1.06,hip=1.04,thigh=1.14,calf=1.14,shift=.009,definition=.25),
 'Elite':dict(arm=1.65,forearm=1.43,shoulder=1.49,lat=1.26,core=1.14,hip=1.11,thigh=1.32,calf=1.31,shift=.020,definition=.65),
 'Legendary':dict(arm=2.10,forearm=1.74,shoulder=1.82,lat=1.43,core=1.23,hip=1.20,thigh=1.54,calf=1.52,shift=.034,definition=1.0),
}
DTYPES={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}
WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def read_glb(path):
 raw=path.read_bytes();assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,4)[0]==2
 size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);bsize=struct.unpack_from('<I',raw,20+size)[0]
 return raw,doc,bytearray(raw[28+size:28+size+bsize])
def accessor(doc,data,index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dt=np.dtype(DTYPES[a['componentType']]);width=WIDTH[a['type']]
 return np.ndarray((a['count'],width),dt,buffer=data,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*width),dt.itemsize))
def write_glb(path,doc,data):
 js=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*((-len(js))%4)
 data=bytes(data);data+=b'\0'*((-len(data))%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(data))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data)
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)

def setup(doc,data):
 primitive=doc['meshes'][1]['primitives'][0]
 points=accessor(doc,data,primitive['attributes']['POSITION']).copy().astype(np.float64)
 normals=accessor(doc,data,primitive['attributes']['NORMAL']).copy().astype(np.float64)
 joints=accessor(doc,data,primitive['attributes']['JOINTS_0']).copy();weights=accessor(doc,data,primitive['attributes']['WEIGHTS_0']).copy()
 skin=doc['skins'][0];ibm=accessor(doc,data,skin['inverseBindMatrices']).copy().reshape(-1,4,4).transpose(0,2,1).astype(np.float64)
 bind=np.linalg.inv(ibm);names=[doc['nodes'][n]['name'].rsplit('_',1)[0] for n in skin['joints']]
 influence=np.zeros((len(points),len(names)))
 for k in range(joints.shape[1]):np.add.at(influence,(np.arange(len(points)),joints[:,k]),weights[:,k])
 return primitive,points,normals,ibm,bind,names,influence

def deform(points,stage,ibm,bind,names,influence):
 delta=np.zeros_like(points)
 for index,name in enumerate(names):
  w=influence[:,index]
  if not np.any(w):continue
  category=None
  if name.endswith('Shoulder'):category='shoulder'
  elif name.endswith('ForeArm'):category='forearm'
  elif name.endswith('Arm'):category='arm'
  elif name.endswith('UpLeg'):category='thigh'
  elif name.endswith('Leg'):category='calf'
  elif name=='Hips':category='hip'
  elif name=='Spine02':category='core'
  elif name in ('Spine01','Spine'):category='lat'
  if category is None:continue
  local=points@ibm[index,:3,:3].T+ibm[index,:3,3]
  scale=np.full(len(points),stage[category],dtype=float)
  if category in ('arm','forearm','thigh','calf'):
   child_node=next((j for j,n in enumerate(names) if n=={'LeftArm':'LeftForeArm','RightArm':'RightForeArm','LeftForeArm':'LeftHand','RightForeArm':'RightHand','LeftUpLeg':'LeftLeg','RightUpLeg':'RightLeg','LeftLeg':'LeftFoot','RightLeg':'RightFoot'}[name]),None)
   length=float(np.linalg.norm(bind[child_node,:3,3]-bind[index,:3,3]))
   t=np.clip(local[:,1]/length,0,1)
   if category=='arm':shape=.65+.35*np.sin(np.pi*t)**2
   elif category=='forearm':shape=(.38+.62*np.exp(-.5*((t-.35)/.29)**2))*(1-.65*smooth(.70,1.0,t))
   elif category=='thigh':shape=.68+.32*np.sin(np.pi*t)**2
   else:shape=(.65+.35*np.exp(-.5*((t-.35)/.30)**2))*(1-.60*smooth(.72,1.,t))
   scale=1+(scale-1)*shape
  # Growth across each bone's cross-section preserves its length and joint center.
  changed=np.zeros_like(local);changed[:,0]=local[:,0]*(scale-1)
  depth=1+(scale-1)*({'lat':.55,'core':.65,'hip':.70,'thigh':.82}.get(category,1.))
  changed[:,2]=local[:,2]*(depth-1)
  world=changed@bind[index,:3,:3].T
  if category in ('shoulder','arm'):
   world[:,0]+=(1 if name.startswith('Left') else -1)*stage['shift']*(1 if category=='shoulder' else .6)
  delta+=world*w[:,None]
 # Preserve bust shape and volume: front breast surface is not a muscle-growth target.
 breast=smooth(1.145,1.215,points[:,1])*(1-smooth(1.342,1.405,points[:,1]))*smooth(-.040,.100,points[:,2])
 breast*=1-smooth(.12,.16,np.abs(points[:,0]+.20829))
 # Keep hands/accessory fittings and feet fixed, and leave the neck/head connection intact.
 protected=[i for i,n in enumerate(names) if n.startswith(('Head','head','neck')) or 'Hand' in n or 'Foot' in n or 'Toe' in n]
 protected_weight=np.clip(influence[:,protected].sum(axis=1),0,1)
 mask=(1-protected_weight)**2*(1-breast)
 mask*=1-smooth(1.385,1.42,points[:,1]);mask*=smooth(.14,.20,points[:,1])
 delta*=mask[:,None]
 # Shallow abdominal form follows the dress fabric, below the preserved bust.
 core=smooth(1.025,1.07,points[:,1])*(1-smooth(1.16,1.195,points[:,1]))*smooth(.055,.08,points[:,2])
 core*=1-smooth(.07,.10,np.abs(points[:,0]+.20829))
 rows=sum(np.exp(-.5*((points[:,1]-y)/.012)**2) for y in (1.075,1.105,1.135,1.16))
 columns=np.exp(-.5*((np.abs(points[:,0]+.20829)-.027)/.015)**2)
 delta[:,2]+=.0025*stage['definition']*rows*columns*core*mask
 result=points+delta
 # Vertices with any substantive head influence, plus original ground contacts, are exact.
 head=(influence[:,[i for i,n in enumerate(names) if n.startswith(('Head','head','neck'))]].sum(axis=1)>.005)|(points[:,1]>=1.42)
 result[head]=points[head]
 return result,head

def main():
 raw,doc,data=read_glb(SOURCE);primitive,points,normals,ibm,bind,names,influence=setup(doc,data)
 OUT.mkdir(parents=True,exist_ok=True);report=[]
 for name,stage in STAGES.items():
  changed,head=deform(points,stage,ibm,bind,names,influence)
  eps=1e-5;jac=np.empty((len(points),3,3))
  for axis in range(3):
   shift=np.zeros_like(points);shift[:,axis]=eps
   plus=deform(points+shift,stage,ibm,bind,names,influence)[0];minus=deform(points-shift,stage,ibm,bind,names,influence)[0]
   jac[:,:,axis]=(plus-minus)/(2*eps)
  determinant=np.linalg.det(jac)
  shading=np.linalg.solve(jac.transpose(0,2,1),normals[...,None]).squeeze(-1)
  shading/=np.maximum(np.linalg.norm(shading,axis=1,keepdims=True),1e-20)
  fixed=np.all(changed==points,axis=1);shading[fixed]=normals[fixed]
  result=copy.deepcopy(doc);binary=bytearray(data)
  # Legacy source exporter wrote redundant vertex-only byteStride on animation data.
  # These VEC3/VEC4 arrays are tightly packed; remove only that illegal metadata.
  animation_accessors={s[k] for a in result['animations'] for s in a['samplers'] for k in ('input','output')}
  repaired_views=[]
  for view_index in {result['accessors'][i]['bufferView'] for i in animation_accessors}:
   view=result['bufferViews'][view_index]
   if 'byteStride' not in view:continue
   referring=[a for a in result['accessors'] if a.get('bufferView')==view_index]
   assert all(view['byteStride']==np.dtype(DTYPES[a['componentType']]).itemsize*WIDTH[a['type']] for a in referring)
   del view['byteStride'];repaired_views.append(view_index)
  p=accessor(result,binary,primitive['attributes']['POSITION']);p[:]=changed
  n=accessor(result,binary,primitive['attributes']['NORMAL']);n[:]=shading
  pa=result['accessors'][primitive['attributes']['POSITION']];pa['min']=p.min(0).tolist();pa['max']=p.max(0).tolist()
  na=result['accessors'][primitive['attributes']['NORMAL']]
  if 'min' in na:na['min']=n.min(0).tolist()
  if 'max' in na:na['max']=n.max(0).tolist()
  result['asset'].setdefault('extras',{})['vyraProgression']={'stage':name,'source':'../Female_Name.glb','sourceSha256':hashlib.sha256(raw).hexdigest(),
   'method':'Weighted inverse-bind bone-frame cross-section deformation of body mesh only','parameters':stage,
   'preservedMeshIndices':[0,2,3,4],'preservedRigJoints':len(names),'preservedAnimationClips':len(doc['animations']),
   'bustGrowth':False,'fixedHeadBodyVertices':int(head.sum()),'globalScaleUnchanged':True,
   'repairedAnimationBufferViews':repaired_views,'animationValuesUnchanged':True}
  path=OUT/f'Female_Name_{name}.glb';write_glb(path,result,binary)
  item={'stage':name,'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
   'bodyVertices':len(points),'changedBodyVertices':int((np.linalg.norm(changed-points,axis=1)>1e-8).sum()),
   'headBodyVertices':int(head.sum()),'jacobianMin':float(determinant.min()),'nonPositiveJacobian':int((determinant<=0).sum()),
   'bodyBounds':{'min':p.min(0).tolist(),'max':p.max(0).tolist()},'maxBodyDisplacement':float(np.linalg.norm(changed-points,axis=1).max())}
  report.append(item);print(json.dumps(item),flush=True)
 (OUT/'generation-report.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
