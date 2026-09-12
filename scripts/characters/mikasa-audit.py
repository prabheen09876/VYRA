"""Source-preservation and geometric checks for the Mikasa GLB variants."""
import importlib.util
from pathlib import Path
import hashlib
import json
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
s=importlib.util.spec_from_file_location('mikasa',ROOT/'scripts/characters/mikasa-progression.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
source,b0=m.G.read_glb(m.SOURCE)
p0=m.G.accessor(source,b0,0).copy()
tri=m.G.accessor(source,b0,source['meshes'][0]['primitives'][0]['indices']).reshape(-1,3)
c0=np.cross(p0[tri[:,1]]-p0[tri[:,0]],p0[tri[:,2]]-p0[tri[:,0]])
sourcearea=np.linalg.norm(c0,axis=1)
reports=[]
for stage in m.STAGES:
    path=m.OUT/f'Female_Mikasa_{stage}.glb';d,b=m.G.read_glb(path)
    p=m.G.accessor(d,b,0);n=m.G.accessor(d,b,1)
    immutable=[]
    for idx in range(len(d['accessors'])):
        if idx not in [0,1]:
            assert np.array_equal(m.G.accessor(source,b0,idx),m.G.accessor(d,b,idx)),idx
            immutable.append(idx)
    image_hashes=[]
    for img in d['images']:
        vi=img['bufferView'];v=d['bufferViews'][vi];off=v.get('byteOffset',0);length=v['byteLength']
        assert b[off:off+length]==b0[off:off+length]
        image_hashes.append(hashlib.sha256(b[off:off+length]).hexdigest())
    for key in ['nodes','scenes','materials','textures','samplers']:
        assert d.get(key)==source.get(key),key
    fixed=(p0[:,2]<=25)|(p0[:,2]>=307)
    assert np.array_equal(p[fixed],p0[fixed])
    t=(np.abs(p0[:,0])-31)*.585019+(p0[:,2]-284)*-.811020
    hands=(t>=99)&(np.abs(p0[:,0])>=84)
    expected=p0[hands].copy();expected[:,0]+=np.where(expected[:,0]<0,-1,1)*m.STAGES[stage]['arm_shift']
    assert np.max(np.abs(p[hands]-expected))<.00002
    assert np.array_equal(p[hands,1:],p0[hands,1:])
    cross=np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]])
    area=np.linalg.norm(cross,axis=1)
    mask=sourcearea>1e-6
    assert (area[mask]>1e-6).all()
    flips=int(((cross*c0).sum(1)[mask]<=0).sum())
    assert flips==0
    report={'stage':stage,'immutableAccessorCount':len(immutable),
      'embeddedImageSha256':image_hashes,'preservedNodesMaterialsTextures':True,
      'fixedBodyVertexCount':int(fixed.sum()),'rigidHandVertexCount':int(hands.sum()),
      'newDegenerateTriangles':0,'reversedTrianglesComparedToSource':flips,
      'triangleCount':int(len(tri)),'sourceDegenerateTriangles':int((~mask).sum()),
      'normalLengthMaximumError':float(np.max(np.abs(np.linalg.norm(n,axis=1)-1))),
      'fileSha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    print(json.dumps(report));reports.append(report)
(m.OUT/'preservation-audit.json').write_text(json.dumps(reports,indent=2)+'\n')
