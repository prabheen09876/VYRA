"""Blender BVH plus exact narrow-phase check for Sakura's derived surfaces."""
from pathlib import Path
import hashlib
import importlib.util
import json
import time
import numpy as np
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
FOLDER=ROOT/'resources/female-sakura-progression'
spec=importlib.util.spec_from_file_location('sakura_generate',HERE/'sakura-generate.py')
io=importlib.util.module_from_spec(spec);spec.loader.exec_module(io)

def geometry(path):
 _,doc,binary=io.read_glb(path);points=[];faces=[];offset=0
 for mesh in doc['meshes']:
  prim=mesh['primitives'][0];p=io.accessor(doc,binary,prim['attributes']['POSITION']);f=io.accessor(doc,binary,prim['indices']).reshape(-1,3)
  points.append(p);faces.append(f.astype(np.int64)+offset);offset+=len(p)
 return np.concatenate(points).astype(float),np.concatenate(faces)

def segment_hits_triangle(a,b,tri):
 direction=b-a;e1=tri[:,1]-tri[:,0];e2=tri[:,2]-tri[:,0]
 h=np.cross(direction,e2);det=np.einsum('ij,ij->i',e1,h);valid=np.abs(det)>1e-12
 inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=a-tri[:,0]
 u=np.einsum('ij,ij->i',s,h)*inv;q=np.cross(s,e1)
 v=np.einsum('ij,ij->i',direction,q)*inv;t=np.einsum('ij,ij->i',e2,q)*inv
 return valid&(u>=-1e-8)&(v>=-1e-8)&(u+v<=1+1e-8)&(t>1e-7)&(t<1-1e-7)

base,base_faces=geometry(FOLDER/'work/Sakura_base.glb')
_,weld=np.unique(base,axis=0,return_inverse=True);welded=weld[base_faces]
report=[];baseline=None;started=time.monotonic()
for stage,path in [('Base',FOLDER/'work/Sakura_base.glb')]+[(s,FOLDER/f'Female_Sakura_{s}.glb') for s in io.STAGES]:
 points,faces=geometry(path);assert np.array_equal(faces,base_faces)
 bvh=BVHTree.FromPolygons(points.tolist(),faces.tolist(),all_triangles=True,epsilon=0)
 pairs=np.array([(a,b) for a,b in bvh.overlap(bvh) if a<b],dtype=np.int32).reshape(-1,2)
 adjacent=np.zeros(len(pairs),dtype=bool)
 for a in range(3):
  for b in range(3):adjacent|=welded[pairs[:,0],a]==welded[pairs[:,1],b]
 pairs=pairs[~adjacent];ta=points[faces[pairs[:,0]]];tb=points[faces[pairs[:,1]]]
 hits=np.zeros(len(pairs),dtype=bool)
 for edge in range(3):
  hits|=segment_hits_triangle(ta[:,edge],ta[:,(edge+1)%3],tb)
  hits|=segment_hits_triangle(tb[:,edge],tb[:,(edge+1)%3],ta)
 actual=set(map(tuple,pairs[hits].tolist()))
 if baseline is None:
  baseline=actual
  baseline_pair_array=np.array(sorted(baseline),dtype=int).reshape(-1,2)
  baseline_centroids=base[base_faces[baseline_pair_array]].mean(axis=(1,2))
  contact_vertices=np.unique(welded[np.unique(baseline_pair_array)])
  contact_neighborhood=np.any(np.isin(welded,contact_vertices),axis=1)
 new=actual-baseline
 outside=[pair for pair in sorted(new) if not np.all(contact_neighborhood[list(pair)])]
 if new and len(baseline_centroids):
  new_centroids=base[base_faces[np.array(sorted(new),dtype=int)]].mean(axis=(1,2))
  distances=np.sqrt(((new_centroids[:,None,:]-baseline_centroids[None,:,:])**2).sum(axis=2).min(axis=1))
 else:distances=np.zeros(0)
 row={'stage':stage,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'intersections':len(actual),'newPairsVersusBase':len(new),
  'newPairsOutsideExistingContactPatches':len(outside),'outsideExistingContactPairs':[list(pair) for pair in outside],
  'maxNewPairDistanceFromExistingContactSourceUnits':float(distances.max()) if len(distances) else 0,
  'newPairs':[list(pair) for pair in sorted(new)],'examples':[{'triangles':list(pair),'sourceCentroid':base[base_faces[list(pair)]].mean(axis=(0,1)).tolist()} for pair in sorted(new)[:30]]}
 report.append(row);print(json.dumps({k:v for k,v in row.items() if k not in ('newPairs','examples')}),flush=True)
(FOLDER/'intersection-audit.json').write_text(json.dumps({'method':'Blender BVH plus noncoplanar segment-triangle tests; source-vertex-adjacent triangles excluded.',
 'limitations':'Excludes coplanar overlaps, adjacent triangles and contacts at segment endpoints; source clothing intersections are measured separately from new pairs.',
 'seconds':round(time.monotonic()-started,2),'results':report},indent=2)+'\n')
