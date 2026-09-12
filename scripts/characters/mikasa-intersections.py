"""Blender BVH/narrow-phase audit of new nonadjacent Mikasa triangle crossings."""
from pathlib import Path
import hashlib,json,struct,time,sys
from datetime import datetime,timezone
import numpy as np
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[2]
FOLDER=ROOT/'resources/female-mikasa-progression'
START=time.monotonic()
def load(path):
 raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
 def accessor(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]);w={'VEC3':3,'SCALAR':1}[a['type']]
  return np.ndarray((a['count'],w),dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*w),dt.itemsize)).copy()
 pp=[];ff=[];offset=0
 # All three meshes have the same transform chain and local coordinate frame.
 for mesh in doc['meshes']:
  for prim in mesh['primitives']:
   p=accessor(prim['attributes']['POSITION']);f=accessor(prim['indices']).reshape(-1,3)
   pp.append(p);ff.append(f+offset);offset+=len(p)
 return np.concatenate(pp).astype(float),np.concatenate(ff)
def segment(a,b,tri):
 direction=b-a;e1=tri[:,1]-tri[:,0];e2=tri[:,2]-tri[:,0];h=np.cross(direction,e2);det=np.einsum('ij,ij->i',e1,h);valid=np.abs(det)>1e-12
 inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=a-tri[:,0];u=np.einsum('ij,ij->i',s,h)*inv;q=np.cross(s,e1);v=np.einsum('ij,ij->i',direction,q)*inv;t=np.einsum('ij,ij->i',e2,q)*inv
 return valid&(u>=-1e-8)&(v>=-1e-8)&(u+v<=1+1e-8)&(t>1e-7)&(t<1-1e-7)
base,faces=load(ROOT/'resources/Female_Mikasa.glb');_,weld=np.unique(base,axis=0,return_inverse=True);welded=weld[faces]
vertex_faces={}
for fi,row in enumerate(welded):
 for vertex in row:vertex_faces.setdefault(int(vertex),set()).add(fi)
neighbors=[{fi}.union(*(vertex_faces[int(v)] for v in row)) for fi,row in enumerate(welded)]
rows=[];basepairs=None
for stage,path in [('Source',ROOT/'resources/Female_Mikasa.glb')]+[(s,FOLDER/f'Female_Mikasa_{s}.glb') for s in ['Starter','Developing','Strong','Elite','Legendary']]:
 points,triangles=load(path);bvh=BVHTree.FromPolygons(points.tolist(),triangles.tolist(),all_triangles=True,epsilon=0)
 pairs=np.array([(a,b) for a,b in bvh.overlap(bvh) if a<b],dtype=np.int32).reshape(-1,2)
 adjacent=np.zeros(len(pairs),bool)
 for a in range(3):
  for b in range(3):adjacent|=welded[pairs[:,0],a]==welded[pairs[:,1],b]
 pairs=pairs[~adjacent];true=np.zeros(len(pairs),bool);ta=points[triangles[pairs[:,0]]];tb=points[triangles[pairs[:,1]]]
 for edge in range(3):true|=segment(ta[:,edge],ta[:,(edge+1)%3],tb)|segment(tb[:,edge],tb[:,(edge+1)%3],ta)
 crossings=set(map(tuple,pairs[true].tolist()))
 if basepairs is None:basepairs=crossings
 new=crossings-basepairs
 old_contact_neighbors={}
 for a,b in basepairs:old_contact_neighbors.setdefault(a,set()).add(b);old_contact_neighbors.setdefault(b,set()).add(a)
 one_ring=[];two_ring=[];outside=[]
 for a,b in new:
  if any(old_contact_neighbors.get(n,set())&neighbors[b] for n in neighbors[a]):one_ring.append((a,b));continue
  na=set.union(*(neighbors[n] for n in neighbors[a]));nb=set.union(*(neighbors[n] for n in neighbors[b]))
  if any(old_contact_neighbors.get(n,set())&nb for n in na):two_ring.append((a,b))
  else:outside.append((a,b))
 row={'stage':stage,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'nonadjacentBvhCandidates':len(pairs),'nonadjacentNoncoplanarIntersectionPairs':len(crossings),'newPairsVersusSource':len(new),
 'changedPairsWithinOneTriangleRingOfOriginalContact':len(one_ring),'additionalChangedPairsWithinTwoTriangleRingsOfOriginalContact':len(two_ring),'changedPairsOutsideTwoTriangleRings':len(outside),
 'outsideTwoRingExamples':[{'triangles':[int(a),int(b)],'sourceCentroid':base[faces[[a,b]]].mean(axis=(0,1)).tolist()} for a,b in sorted(outside)],
 'intersectionPairs':[[int(a),int(b)] for a,b in sorted(crossings)],'examples':[{'triangles':[int(a),int(b)],'sourceCentroid':base[faces[[a,b]]].mean(axis=(0,1)).tolist()} for a,b in sorted(new)[:24]],'elapsedSeconds':round(time.monotonic()-START,2)}
 rows.append(row);print(json.dumps({k:v for k,v in row.items() if k not in ['intersectionPairs','examples','outsideTwoRingExamples']}),flush=True)
has_new=any(r['newPairsVersusSource'] for r in rows)
report={'createdAt':datetime.now(timezone.utc).isoformat(),'method':'Blender BVHTree broad phase with segment-triangle narrow phase for all three meshes; pairs sharing an exact-welded source vertex excluded. Two-ring statistics distinguish nearby changes in inherited contact patches from other triangle pairs; they are not a proof that a residual contact is invisible.','limitations':'Excludes coplanar overlaps, endpoint-only contacts and adjacent-triangle crossings. Source already contains 2099 crossing pairs in layered clothing/head surfaces. Exact pair identities can change under deformation.','status':'residual-contacts-recorded' if has_new else 'no-new-triangle-pairs','strictZeroNewPairsPassed':not has_new,'results':rows}
(FOLDER/'intersection-audit.json').write_text(json.dumps(report,indent=2)+'\n')
if has_new and '--strict' in sys.argv:raise RuntimeError('New nonadjacent crossing pairs remain; see recorded residuals')
