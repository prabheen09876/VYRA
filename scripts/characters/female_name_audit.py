"""Blender BVH diagnostic for new nonadjacent rest-surface crossings."""
from pathlib import Path
import sys,hashlib,json
import numpy as np
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from female_name_generate import SOURCE,OUT,STAGES,read_glb,accessor

def mesh(path):
 raw,d,b=read_glb(path);positions=[];faces=[];offset=0
 for m in d['meshes']:
  for p in m['primitives']:
   v=accessor(d,b,p['attributes']['POSITION']).copy().astype(float);t=accessor(d,b,p['indices']).copy().reshape(-1,3).astype(int)
   positions.append(v);faces.append(t+offset);offset+=len(v)
 return np.concatenate(positions),np.concatenate(faces),hashlib.sha256(raw).hexdigest()
source,faces,source_hash=mesh(SOURCE);_,weld=np.unique(source,axis=0,return_inverse=True);wfaces=weld[faces]
base=None;rows=[]
for name,path in [('Source',SOURCE)]+[(s,OUT/f'Female_Name_{s}.glb') for s in STAGES]:
 p,t,sha=mesh(path);tree=BVHTree.FromPolygons(p.tolist(),t.tolist(),all_triangles=True,epsilon=0)
 pairs=np.array([(a,b) for a,b in tree.overlap(tree) if a<b],dtype=int).reshape(-1,2)
 adjacent=np.zeros(len(pairs),dtype=bool)
 for a in range(3):
  for b in range(3):adjacent|=wfaces[pairs[:,0],a]==wfaces[pairs[:,1],b]
 crossing=set(map(tuple,pairs[~adjacent].tolist()))
 if base is None:base=crossing
 new=crossing-base
 row={'stage':name,'sha256':sha,'nonadjacentOverlapPairs':len(crossing),'newVersusSource':len(new),
      'examples':[{'faces':[a,b],'sourceCenter':source[faces[[a,b]]].mean(axis=(0,1)).tolist()} for a,b in sorted(new)[:20]]}
 rows.append(row);print(json.dumps(row),flush=True)
(OUT/'surface-audit.json').write_text(json.dumps({'sourceSha256':source_hash,'scope':'Blender BVH in original bind-space. Excludes shared exact-welded vertices; source overlap pairs are tracked separately. Does not prove collision-free animation.','results':rows},indent=2)+'\n')
