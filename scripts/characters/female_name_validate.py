"""Independent byte-preservation and geometry checks for the Female_Name variants."""
from pathlib import Path
import hashlib, json
import numpy as np
from female_name_generate import SOURCE,OUT,STAGES,read_glb,accessor,setup

def sha(b):return hashlib.sha256(b).hexdigest()
def stats(doc,data):
 vertices=triangles=zero=0;norm_min=10.;norm_max=0.
 for mesh in doc['meshes']:
  for p in mesh['primitives']:
   v=accessor(doc,data,p['attributes']['POSITION']).astype(float);n=accessor(doc,data,p['attributes']['NORMAL']).astype(float)
   t=accessor(doc,data,p['indices']).reshape(-1,3)
   assert np.isfinite(v).all() and np.isfinite(n).all()
   lengths=np.linalg.norm(n,axis=1);norm_min=min(norm_min,float(lengths.min()));norm_max=max(norm_max,float(lengths.max()))
   area=np.linalg.norm(np.cross(v[t[:,1]]-v[t[:,0]],v[t[:,2]]-v[t[:,0]]),axis=1)
   zero+=int((area<1e-14).sum());vertices+=len(v);triangles+=len(t)
 return dict(vertices=vertices,triangles=triangles,zeroAreaTriangles=zero,normalLengthMin=norm_min,normalLengthMax=norm_max)

source_raw,source_doc,source_data=read_glb(SOURCE)
primitive,points,normals,ibm,bind,names,influence=setup(source_doc,source_data)
source_stats=stats(source_doc,source_data)
allowed=np.zeros(len(source_data),dtype=bool)
for semantic in ('POSITION','NORMAL'):
 a=source_doc['accessors'][primitive['attributes'][semantic]];v=source_doc['bufferViews'][a['bufferView']]
 start=a.get('byteOffset',0)+v.get('byteOffset',0);stride=v.get('byteStride',12)
 for i in range(a['count']):allowed[start+i*stride:start+i*stride+12]=True
head=(influence[:,[i for i,n in enumerate(names) if n.startswith(('Head','head','neck'))]].sum(axis=1)>.005)|(points[:,1]>=1.42)
breast=(points[:,1]>=1.215)&(points[:,1]<=1.342)&(points[:,2]>=.100)&(np.abs(points[:,0]+.20829)<=.12)
report={'source':str(SOURCE),'sourceSha256':sha(source_raw),'sourceStats':source_stats,'stages':[]}
hashes=set();profiles=[]
for stage in STAGES:
 path=OUT/f'Female_Name_{stage}.glb';raw,doc,data=read_glb(path)
 assert len(data)==len(source_data)
 assert np.array_equal(np.frombuffer(data,dtype='u1')[~allowed],np.frombuffer(source_data,dtype='u1')[~allowed]),'Only body positions/normals may change'
 for key in ('nodes','skins','animations','scenes','scene','meshes','materials','textures','images','samplers','buffers'):
  assert doc.get(key)==source_doc.get(key),f'{stage}: original {key} retained'
 for i,(v,original) in enumerate(zip(doc['bufferViews'],source_doc['bufferViews'])):
  expected=dict(original)
  if i in (7,8):expected.pop('byteStride',None)
  assert v==expected,'Only redundant illegal animation stride metadata is repaired'
 for key in ('author','license','source','title'):
  assert doc['asset']['extras'][key]==source_doc['asset']['extras'][key]
 new=accessor(doc,data,primitive['attributes']['POSITION']).astype(float)
 newnorm=accessor(doc,data,primitive['attributes']['NORMAL']).astype(float)
 assert np.array_equal(points[head],new[head]) and np.array_equal(normals[head],newnorm[head]),'Head/neck exact'
 assert np.array_equal(points[breast],new[breast]),'Protected bust surface exact'
 assert np.array_equal(points[points[:,1]<=.14],new[points[:,1]<=.14]),'Feet/ground exact'
 assert new[:,1].min()==points[:,1].min() and new[:,1].max()==points[:,1].max(),'Source height/ground retained'
 current=stats(doc,data);assert current['zeroAreaTriangles']<=source_stats['zeroAreaTriangles']
 assert current['normalLengthMin']>.999 and current['normalLengthMax']<1.001
 body_hash=sha(new.astype('<f4').tobytes());hashes.add(body_hash)
 regional={}
 for bone in ('LeftArm','RightArm','LeftForeArm','RightForeArm','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'):
  i=names.index(bone);sel=influence[:,i]>.65
  oldlocal=points@ibm[i,:3,:3].T+ibm[i,:3,3];newlocal=new@ibm[i,:3,:3].T+ibm[i,:3,3]
  radial=np.linalg.norm(oldlocal[:,[0,2]],axis=1)
  sel&=radial>.004
  regional[bone]=float(np.median(np.linalg.norm(newlocal[sel][:,[0,2]],axis=1)/radial[sel]))
 profiles.append(regional)
 item={'stage':stage,'file':path.name,'bytes':len(raw),'sha256':sha(raw),**current,
  'bodyPositionSha256':body_hash,'changedBodyVertices':int((np.linalg.norm(new-points,axis=1)>1e-8).sum()),
  'exactProtectedHeadVertices':int(head.sum()),'exactProtectedBustVertices':int(breast.sum()),
  'preservedMeshes':[0,2,3,4],'preservedJoints':len(names),'preservedAnimations':len(doc['animations']),
  'unchangedAllOtherBinaryData':True,'boneMedianRadialScale':regional}
 report['stages'].append(item);print(json.dumps(item),flush=True)
assert len(hashes)==5
for before,after in zip(profiles,profiles[1:]):
 for key in before:assert after[key]>before[key]+.001,f'{key} grows across stages'
report['status']='passed';report['animationClips']=[a['name'] for a in source_doc['animations']]
report['scope']='Byte-exact preservation of rig, animation, UV, texture, material, face, hair, accessory and weapon data; finite geometry and progressive bone cross-sections. Actual clip rendering is reviewed separately.'
(OUT/'validation-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('All five Female_Name variants passed validation.')
