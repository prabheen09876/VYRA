"""Create anatomically localized Mikasa physique variants without re-exporting assets.

Only Body POSITION and NORMAL streams change. Face, hair, UVs, textures, indices,
materials, transforms, licenses and hair tangents are retained exactly.
"""
from pathlib import Path
import copy
import hashlib
import importlib.util
import json
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('goku_glb_helpers',ROOT/'scripts/goku/generate-progression.py')
G=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(G)
OUT=ROOT/'resources/female-mikasa-progression'
SOURCE=ROOT/'resources/Female_Mikasa.glb'

STAGES={
 'Starter':dict(shoulder=.94,chest=.95,waist=.97,hip=.96,front=.97,back=.94,
                upper_arm=.82,forearm=.88,elbow=.94,arm_shift=-1.8,thigh=.84,calf=.90,leg_shift=-.4,definition=-.15),
 'Developing':dict(shoulder=1.00,chest=1.00,waist=1.00,hip=1.00,front=1.00,back=1.00,
                upper_arm=1.00,forearm=1.00,elbow=1.00,arm_shift=0.,thigh=1.00,calf=1.00,leg_shift=0.,definition=0.),
 'Strong':dict(shoulder=1.11,chest=1.09,waist=1.02,hip=1.05,front=1.025,back=1.11,
                upper_arm=1.25,forearm=1.15,elbow=1.07,arm_shift=3.0,thigh=1.16,calf=1.11,leg_shift=2.1,definition=.30),
 'Elite':dict(shoulder=1.26,chest=1.20,waist=1.06,hip=1.12,front=1.05,back=1.26,
                upper_arm=1.57,forearm=1.36,elbow=1.16,arm_shift=6.8,thigh=1.36,calf=1.25,leg_shift=5.0,definition=.67),
 'Legendary':dict(shoulder=1.43,chest=1.33,waist=1.11,hip=1.21,front=1.08,back=1.43,
                upper_arm=1.96,forearm=1.62,elbow=1.29,arm_shift=11.2,thigh=1.59,calf=1.41,leg_shift=8.1,definition=1.05),
}

smooth=G.smooth
curve=G.curve
bell=G.bell

def deform(p,s):
    x,y,z=p.T;a=np.abs(x);sign=np.where(x<0,-1.,1.)
    gate=smooth(25,47,z)*(1-smooth(294,307,z))
    width=curve(z,[(0,s['hip']),(185,s['hip']),(203,s['hip']),
                  (226,s['waist']),(242,s['waist']),(266,s['chest']),
                  (285,s['shoulder']),(300,1.),(307,1.)])
    # The jacket gains volume through lats, shoulders and back. Chest-front
    # depth stays close to the source, avoiding enlarged breast geometry.
    fd=curve(z,[(0,s['hip']),(193,s['hip']),(221,s['waist']),(244,s['front']),
                (270,1+(s['front']-1)*.42),(287,s['front']),(307,1.)])
    bd=curve(z,[(0,s['hip']),(193,s['hip']),(224,s['waist']),
                (248,s['back']),(279,s['back']),(307,1.)])
    front=1-smooth(-4,4,y)
    center=curve(z,[(0,8),(190,1),(225,0),(266,0),(290,3),(307,3)])
    depth=fd*front+bd*(1-front)
    tx=x*width;ty=center+(y-center)*depth

    # Independent leg axes preserve foot spacing and ankle/boot transitions.
    lc=curve(z,[(0,31),(30,30),(65,27),(105,24),(145,22),(172,20),(200,18)])
    ly=curve(z,[(0,7),(45,10),(85,8),(113,2),(155,0),(185,1),(205,1)])
    ls=curve(z,[(0,1),(28,1),(64,s['calf']),(92,1+(s['calf']-1)*.72),
               (115,1+(s['thigh']-1)*.32),(151,s['thigh']),(174,s['thigh']),(207,s['hip'])])
    softsign=np.tanh(x/8.)
    shift=s['leg_shift']*smooth(36,123,z)
    lx=x+(x-softsign*lc)*(ls-1)+softsign*shift
    lyout=ly+(y-ly)*(1+(ls-1)*.87)
    legmix=1-smooth(174,207,z)
    tx=tx*(1-legmix)+lx*legmix
    ty=ty*(1-legmix)+lyout*legmix

    # Shallow muscle tension on the existing clothing, not added geometry.
    torsomask=1-smooth(25,42,a)
    lats=bell(a,25,9)*bell(z,264,19)
    core=bell(a,8,6)*(bell(z,224,5)+.8*bell(z,236,5))
    tx+=np.tanh(x/5.)*s['definition']*1.4*lats*torsomask
    ty+=s['definition']*torsomask*(2.1*lats*(1-front)-.9*core*front)
    ty-=s['definition']*1.25*bell(z,154,17)*bell(a,lc,13)*front*legmix
    ty+=s['definition']*.95*bell(z,67,14)*bell(a,lc,12)*(1-front)*legmix

    # A-pose arm coordinates: longitudinal t and perpendicular r. Widening is
    # radial around each upper-arm/forearm axis, not a horizontal body scale.
    dx=.585019;dz=-.811020
    t=(a-31)*dx+(z-284)*dz
    r=(a-31)*(-dz)+(z-284)*dx
    rc=curve(t,[(-25,0),(-7,2),(5,-2),(28,-3),(54,-3),(77,-1),(95,0),(140,0)])
    yc=curve(t,[(-25,4),(0,4),(25,7),(49,4),(69,0),(80,-3),(94,-16),(140,-25)])
    scale=curve(t,[(-30,1),(-13,1+(s['shoulder']-1)*.55),(0,s['upper_arm']),
                   (25,s['upper_arm']),(53,s['elbow']),(74,s['forearm']),
                   (88,1+(s['forearm']-1)*.30),(97,1),(145,1)])
    dr=(r-rc)*(scale-1)
    armshift=s['arm_shift']*smooth(-26,3,t)
    ax=sign*(a+dr*(-dz)+armshift)
    az=z+dr*dx
    ay=yc+(y-yc)*scale
    # Keep the jacket folds while giving the upper sleeves a biceps/triceps form.
    ay+=s['definition']*.95*bell(t,27,12)*np.tanh((y-yc)/7)
    armmix=smooth(-31,-15,r)*smooth(22,42,a)
    q=np.column_stack([tx*(1-armmix)+ax*armmix,
                       ty*(1-armmix)+ay*armmix,
                       z*(1-armmix)+az*armmix])
    q=p+(q-p)*gate[:,None]
    fixed=gate==0
    q[fixed]=p[fixed]
    # Hands and fingers are rigidly translated. No hand/finger scaling occurs.
    hands=(t>=99)&(armmix==1)&(gate==1)
    q[hands]=p[hands]
    q[hands,0]+=sign[hands]*s['arm_shift']
    return q

def shading(p,n,s):
    eps=.002
    cols=[]
    for k in range(3):
        d=np.zeros(3);d[k]=eps
        cols.append((deform(p+d,s)-deform(p-d,s))/(2*eps))
    jac=np.stack(cols,axis=2)
    det=np.linalg.det(jac)
    out=np.linalg.solve(jac.transpose(0,2,1),n[...,None])[...,0]
    out/=np.maximum(np.linalg.norm(out,axis=1,keepdims=True),1e-15)
    fixed=(p[:,2]<=25)|(p[:,2]>=307)
    t=(np.abs(p[:,0])-31)*.585019+(p[:,2]-284)*-.811020
    fixed|=(t>=99)&(np.abs(p[:,0])>=84)
    out[fixed]=n[fixed]
    return out,det

def attach_pocket_buttons(p,n,q,qn,faces):
    """Carry two tiny isolated buttons with their actual coarse jacket panel.

    A continuous field sampled on a large coat triangle and a small button can
    make their piecewise linear surfaces cross. Using the panel's affine frame
    keeps the original button-panel clearance and original triangle topology.
    """
    _,weld=np.unique(p,axis=0,return_inverse=True)
    parent=np.arange(int(weld.max())+1)
    def root(x):
        while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
        return x
    for face in weld[faces]:
        a=root(face[0])
        for b in face[1:]:parent[root(b)]=a
    labels=np.array([root(i) for i in weld])
    records=[]
    for button_face,panel_face in [(800,53),(818,240)]:
        mask=labels==labels[faces[button_face,0]]
        assert int(mask.sum())==20
        a=p[faces[panel_face]];b=q[faces[panel_face]]
        e1=a[1]-a[0];e2=a[2]-a[0];f1=b[1]-b[0];f2=b[2]-b[0]
        n0=np.cross(e1,e2);n0/=np.linalg.norm(n0)
        n1=np.cross(f1,f2);n1/=np.linalg.norm(n1)
        A=np.column_stack([f1,f2,n1])@np.linalg.inv(np.column_stack([e1,e2,n0]))
        q[mask]=(p[mask]-a[0])@A.T+b[0]
        normals=n[mask]@np.linalg.inv(A)
        qn[mask]=normals/np.linalg.norm(normals,axis=1,keepdims=True)
        # The left button straddles a second small pocket panel. Preserve its
        # positive original clearance from that panel as the jacket expands.
        clearance_shift=0.
        if button_face==818:
            a2=p[faces[5094]];b2=q[faces[5094]]
            n2=np.cross(a2[1]-a2[0],a2[2]-a2[0]);n2/=np.linalg.norm(n2)
            m2=np.cross(b2[1]-b2[0],b2[2]-b2[0]);m2/=np.linalg.norm(m2)
            if n2[1]>0:n2=-n2
            if m2[1]>0:m2=-m2
            old_clearance=float(np.min((p[mask]-a2[0])@n2))
            new_clearance=float(np.min((q[mask]-b2[0])@m2))
            clearance_shift=max(0.,old_clearance-new_clearance)
            q[mask]+=m2*clearance_shift
        records.append({'buttonSeedTriangle':button_face,'supportTriangle':panel_face,
                        'vertices':int(mask.sum()),'affineDeterminant':float(np.linalg.det(A)),
                        'additionalClearanceTranslation':clearance_shift})
    return records

def main():
    doc,raw=G.read_glb(SOURCE)
    prim=doc['meshes'][0]['primitives'][0]
    pi=prim['attributes']['POSITION'];ni=prim['attributes']['NORMAL']
    p=G.accessor(doc,raw,pi).astype(float)
    n=G.accessor(doc,raw,ni).astype(float)
    faces=G.accessor(doc,raw,prim['indices']).reshape(-1,3)
    originalhash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    OUT.mkdir(parents=True,exist_ok=True)
    report={'source':SOURCE.name,'sourceSha256':originalhash,'static':True,
       'changedMeshes':[0],'unchangedMeshes':[1,2],
       'unchangedStreams':'All streams except body POSITION/NORMAL; all node transforms, materials and embedded images unchanged.',
       'bodyFixedBelowZ':25,'bodyFixedAboveZ':307,
       'handsRigidBeyondArmT':99,'stages':[]}
    for stage,s in STAGES.items():
        q=deform(p,s);normals,det=shading(p,n,s)
        buttons=attach_pocket_buttons(p,n,q,normals,faces) if stage!='Developing' else []
        if not (np.isfinite(q).all() and np.isfinite(normals).all()):
            raise ValueError(f'{stage}: nonfinite geometry')
        if np.min(det)<=0:
            raise ValueError(f'{stage}: folded deformation, min determinant {np.min(det)}')
        d=copy.deepcopy(doc);b=bytearray(raw)
        pos=G.accessor(d,b,pi);pos[:]=q
        nn=G.accessor(d,b,ni);nn[:]=normals
        for idx in [pi,ni]:
            arr=G.accessor(d,b,idx);acc=d['accessors'][idx]
            if idx==pi or 'min' in acc:acc['min']=arr.min(0).tolist()
            if idx==pi or 'max' in acc:acc['max']=arr.max(0).tolist()
        d['asset'].setdefault('extras',{})['vyraProgression']={
            'character':'Female_Mikasa','stage':stage,'sourceSha256':originalhash,
            'method':'Localized anatomical surface deformation of clothed body only',
            'parameters':s,'rigged':False,'animationClips':0,
            'faceAndHairUnchanged':True,'handsRigid':True,'originalHeightUnchanged':True}
        dst=OUT/f'Female_Mikasa_{stage}.glb';G.write_glb(dst,d,b)
        item={'stage':stage,'file':dst.name,'bytes':dst.stat().st_size,
              'bodyBoundsMin':pos.min(0).tolist(),'bodyBoundsMax':pos.max(0).tolist(),
              'bodyVertices':len(p),'changedVertices':int(np.any(pos!=p.astype(np.float32),axis=1).sum()),
              'jacobianMin':float(det.min()),'jacobianNonPositive':int((det<=0).sum()),
              'maximumDisplacement':float(np.linalg.norm(q-p,axis=1).max()),
              'pocketButtonAttachments':buttons}
        print(json.dumps(item),flush=True);report['stages'].append(item)
    (OUT/'generation-report.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
