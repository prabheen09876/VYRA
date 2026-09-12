"""Anatomically localized, topology-preserving physique edits for the supplied Goku.

The source character is a static textured surface. This edits that surface rather than
adding anatomy primitives, changing materials, globally scaling, or inventing a rig.
Run optimize-source.mjs and refine-base.py first; all five outputs then share
exactly the same topology, including the fine collar and fabric transitions.
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
OUT = ROOT / 'resources/goku-progression'
YAW = 1.37
GROUND = -0.499847412109375
HEAD_CUTOFF = .270
R = np.array([[math.cos(YAW), math.sin(YAW), 0],
              [math.sin(YAW), -math.cos(YAW), 0], [0, 0, 1]])
DTYPES = {5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
WIDTHS = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

# Independent shoulder, chest, waist, hip, arm, forearm, quad and calf controls.
STAGES = {
    'Starter': dict(shoulder=.70, chest=.67, waist=.77, hip=.85,
                    chest_depth=.70, core_depth=.77, upper_arm=.54, forearm=.58,
                    elbow=.69, cuff=.91, arm_shift=-.027, thigh=.62, calf=.65,
                    hip_shift=-.008, definition=-.42),
    'Developing': dict(shoulder=.85, chest=.84, waist=.87, hip=.92,
                    chest_depth=.86, core_depth=.88, upper_arm=.78, forearm=.79,
                    elbow=.86, cuff=.96, arm_shift=-.014, thigh=.82, calf=.83,
                    hip_shift=-.004, definition=-.17),
    'Strong': dict(shoulder=1.04, chest=1.05, waist=1.00, hip=1.00,
                    chest_depth=1.07, core_depth=1.03, upper_arm=1.08, forearm=1.06,
                    elbow=1.04, cuff=1.01, arm_shift=.004, thigh=1.05, calf=1.04,
                    hip_shift=.001, definition=.20),
    'Elite': dict(shoulder=1.31, chest=1.38, waist=1.08, hip=1.14,
                    chest_depth=1.40, core_depth=1.16, upper_arm=1.57, forearm=1.42,
                    elbow=1.30, cuff=1.09, arm_shift=.049, thigh=1.32, calf=1.26,
                    hip_shift=.011, definition=.74),
    'Legendary': dict(shoulder=1.64, chest=1.76, waist=1.19, hip=1.31,
                    chest_depth=1.81, core_depth=1.34, upper_arm=2.12, forearm=1.87,
                    elbow=1.64, cuff=1.18, arm_shift=.097, thigh=1.69, calf=1.53,
                    hip_shift=.023, definition=1.28),
}


def read_glb(path):
    raw = path.read_bytes()
    magic,version,total = struct.unpack_from('<III',raw)
    assert magic == 0x46546c67 and version == 2 and total == len(raw)
    length,kind = struct.unpack_from('<II',raw,12)
    doc = json.loads(raw[20:20+length])
    size,kind = struct.unpack_from('<II',raw,20+length)
    return doc, bytearray(raw[28+length:28+length+size])


def accessor(doc, binary, index):
    a=doc['accessors'][index]; v=doc['bufferViews'][a['bufferView']]
    dtype=np.dtype(DTYPES[a['componentType']]); width=WIDTHS[a['type']]
    return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,
        offset=v.get('byteOffset',0)+a.get('byteOffset',0),
        strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize))


def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)


def curve(x, knots):
    """C1 interpolation: no sharp creases at anatomical region boundaries."""
    xp=np.array([k[0] for k in knots]); yp=np.array([k[1] for k in knots])
    i=np.clip(np.searchsorted(xp,x,side='right')-1,0,len(xp)-2)
    t=smooth(xp[i],xp[i+1],x)
    return yp[i]*(1-t)+yp[i+1]*t


def bell(x,center,radius):
    return np.exp(-.5*((x-center)/radius)**2)


def arm_components(points,triangles):
    """Topology classifies hands/forearms independently of the nearby pants.

    Below the elbows the arms are disconnected from the torso. Welding positions
    for classification connects GLB chunks and UV seams without altering export UVs.
    """
    unique,inverse=np.unique(np.round(points,6),axis=0,return_inverse=True)
    h=unique[:,2]-GROUND
    ids=inverse[triangles]
    edges=np.concatenate([ids[:,[0,1]],ids[:,[1,2]],ids[:,[2,0]]])
    edges=edges[(h[edges[:,0]] < .595)&(h[edges[:,1]] < .595)]
    parent=np.arange(len(unique),dtype=np.int32)
    def find(a):
        while parent[a]!=a:
            parent[a]=parent[parent[a]]; a=parent[a]
        return a
    for a,b in edges:
        a=find(a);b=find(b)
        if a!=b: parent[b]=a
    roots=np.array([find(i) for i in range(len(unique))])
    canonical=unique@R.T
    selected=[]
    for sign in [-1,1]:
        region=(h>.515)&(h<.58)&(canonical[:,0]*sign>.13)
        comps,counts=np.unique(roots[region],return_counts=True)
        selected.append(int(comps[np.argmax(counts)]))
    if selected[0]==selected[1]:
        raise RuntimeError('Arm classification reached the torso; lower the armpit cut.')
    labels=np.zeros(len(unique),dtype=np.int8)
    labels[roots==selected[0]]=-1;labels[roots==selected[1]]=1
    print('Arm component sizes',[(v,int((labels==v).sum())) for v in [-1,1]],flush=True)
    return labels[inverse]


def deform(points, labels, s):
    q=points@R.T
    u,v,z=q.T; h=z-GROUND; a=np.abs(u); sign=np.where(u<0,-1.,1.)
    # Fixed feet and head; a C1 taper joins the neck into developing traps.
    body_gate=smooth(.112,.17,h)*(1-smooth(.735,HEAD_CUTOFF-GROUND,h))
    torso_x=curve(h,[(0,s['hip']),(.48,s['hip']),(.545,s['waist']),
        (.585,s['waist']),(.635,s['chest']),(.690,s['chest']),
        (.735,s['shoulder']),(.80,1.)])
    torso_d=curve(h,[(0,s['hip']),(.48,s['hip']),(.55,s['core_depth']),
        (.59,s['core_depth']),(.65,s['chest_depth']),(.71,s['chest_depth']),(.78,1.)])
    vcenter=curve(h,[(0,.01),(.43,.023),(.54,.020),(.62,.005),(.74,-.013),(.80,0.)])
    torso_u=u*torso_x
    torso_v=vcenter+(v-vcenter)*torso_d

    # Two leg axes, tapered into the original boots. Thighs and calves grow
    # radially around their own axes, rather than widening the whole lower body.
    leg_center=curve(h,[(0,.119),(.13,.105),(.22,.088),(.32,.072),(.43,.060),(.52,.050)])
    leg_depth=curve(h,[(0,.013),(.15,-.003),(.25,.010),(.35,.025),(.45,.027),(.52,.020)])
    leg_scale=curve(h,[(0,1),(.12,1),(.205,s['calf']),(.285,1+(s['thigh']-1)*.69),
        (.37,s['thigh']),(.44,s['thigh']),(.53,s['hip'])])
    leg_shift=s['hip_shift']*smooth(.12,.38,h)
    soft_sign=np.tanh(u/.025)
    leg_u=u+(u-soft_sign*leg_center)*(leg_scale-1)+soft_sign*leg_shift
    leg_v=leg_depth+(v-leg_depth)*(1+(leg_scale-1)*.84)
    leg_mix=1-smooth(.43,.515,h)
    out_u=torso_u*(1-leg_mix)+leg_u*leg_mix
    out_v=torso_v*(1-leg_mix)+leg_v*leg_mix

    # Anatomical cloth surface forms: pecs, lats, core, quadriceps and calves.
    # The existing gi is kept; muscle shapes subtly tension its actual surface.
    front=smooth(-.005,.055,v)
    back=1-smooth(-.055,.005,v)
    torso_mask=1-smooth(.086,.117,a)
    pectoral=bell(a,.048,.030)*bell(h,.691,.027)
    upper_pec=bell(a,.045,.034)*bell(h,.724,.016)
    core=(bell(a,.026,.016)*(bell(h,.614,.010)+.7*bell(h,.641,.010)))
    lats=bell(a,.078,.021)*bell(h,.656,.047)
    trap=bell(a,.044,.024)*bell(h,.739,.018)
    out_v+=s['definition']*torso_mask*(front*(.008*pectoral+.004*upper_pec+.0025*core)
                                            -back*(.007*lats+.004*trap))
    out_u+=sign*s['definition']*.004*lats*torso_mask
    leg_bulge=bell(a,leg_center,.032)*bell(h,.394,.057)*leg_mix
    out_v+=s['definition']*.007*leg_bulge*front
    out_v-=s['definition']*.004*bell(a,leg_center,.030)*bell(h,.217,.036)*back*leg_mix

    # The hand/cuff boundary is intentionally rigid through h=.484. Hand vertices
    # receive the same translation, retaining fingers and fists at every stage.
    arm_center=curve(h,[(0,.148),(.48,.148),(.52,.154),(.565,.150),
        (.610,.141),(.646,.138),(.69,.132),(.735,.123),(.78,.100)])
    arm_depth=curve(h,[(0,.017),(.48,.017),(.525,-.001),(.575,-.014),
        (.635,-.020),(.69,-.014),(.74,-.017),(.80,0.)])
    arm_scale=curve(h,[(0,1),(.484,1),(.504,s['cuff']),(.551,s['forearm']),
        (.591,s['elbow']),(.645,s['upper_arm']),(.691,s['upper_arm']*.94+.06),
        (.735,s['shoulder']),(.80,1)])
    displacement=s['arm_shift']*curve(h,[(0,1),(.56,1),(.645,1),(.725,.91),(.78,0)])
    arm_u=sign*(arm_center+displacement+(a-arm_center)*arm_scale)
    arm_v=arm_depth+(v-arm_depth)*arm_scale
    arm_bulge=s['definition']*.0045*bell(h,.648,.021)*bell(a,arm_center,.035)
    arm_v+=arm_bulge*front-arm_bulge*.65*back
    analytic=smooth(.091,.122,a)*(1-smooth(.700,.746,h))*smooth(.40,.44,h)
    lower=(labels!=0).astype(float)
    blend=smooth(.570,.590,h)
    arm_mix=lower*(1-blend)+analytic*blend
    out_u=out_u*(1-arm_mix)+arm_u*arm_mix
    out_v=out_v*(1-arm_mix)+arm_v*arm_mix
    out=np.column_stack([u+(out_u-u)*body_gate,v+(out_v-v)*body_gate,z])@R
    # Exact identity above the neck and at the feet, including float32 round trips.
    out[body_gate==0]=points[body_gate==0]
    return out


def normals_after_deformation(points,normals,labels,stage):
    # Push the original split normals through the deformation Jacobian. This
    # preserves hard edges and smooth UV/chunk seams, unlike per-chunk recompute.
    epsilon=2.e-5
    jac=[]
    for k in range(3):
        delta=np.zeros(3);delta[k]=epsilon
        jac.append((deform(points+delta,labels,stage)-deform(points-delta,labels,stage))/(2*epsilon))
    jac=np.stack(jac,axis=2)
    determinant=np.linalg.det(jac)
    result=np.linalg.solve(np.swapaxes(jac,1,2),normals[...,None])[...,0]
    result/=np.maximum(np.linalg.norm(result,axis=1,keepdims=True),1e-15)
    fixed=(points[:,2]>=HEAD_CUTOFF)|(points[:,2]-GROUND<=.112)
    result[fixed]=normals[fixed]
    return result,determinant


def write_glb(path,doc,binary):
    encoded=json.dumps(doc,separators=(',',':')).encode()
    encoded+=b' '*((-len(encoded))%4)
    binary+=b'\x00'*((-len(binary))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+
        struct.pack('<II',len(encoded),0x4e4f534a)+encoded+
        struct.pack('<II',len(binary),0x004e4942)+binary)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',type=Path,default=OUT/'work/goku-web-base.glb')
    parser.add_argument('--output',type=Path,default=OUT)
    parser.add_argument('--stages',nargs='*',default=list(STAGES))
    args=parser.parse_args()
    doc,binary=read_glb(args.input)
    if args.input == OUT/'work/goku-web-base.glb' and not doc.get('extras',{}).get('gokuSurfaceRefinement'):
        raise RuntimeError('Run python scripts/goku/refine-base.py before generating the web variants.')
    positions=[];normal_arrays=[];triangles=[];primitives=[];offset=0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            p=accessor(doc,binary,primitive['attributes']['POSITION']).copy()
            positions.append(p)
            normal_arrays.append(accessor(doc,binary,primitive['attributes']['NORMAL']).copy())
            triangles.append(accessor(doc,binary,primitive['indices']).reshape(-1,3).astype(np.int64)+offset)
            primitives.append(primitive);offset+=len(p)
    points=np.concatenate(positions).astype(np.float64)
    normals=np.concatenate(normal_arrays).astype(np.float64)
    faces=np.concatenate(triangles)
    labels=arm_components(points,faces)
    args.output.mkdir(parents=True,exist_ok=True)
    reports=[]
    for name in args.stages:
        s=STAGES[name]
        changed=deform(points,labels,s)
        shading,determinant=normals_after_deformation(points,normals,labels,s)
        if not np.isfinite(changed).all() or not np.isfinite(shading).all():
            raise RuntimeError(f'{name}: nonfinite geometry or normals')
        if (determinant <= 0).any():
            raise RuntimeError(f'{name}: deformation folds locally; inspect the anatomical controls')
        result=copy.deepcopy(doc);data=bytearray(binary);offset=0
        for primitive,p in zip(primitives,positions):
            count=len(p);idx=primitive['attributes']['POSITION']
            actual=accessor(result,data,idx)
            actual[:]=changed[offset:offset+count]
            result['accessors'][idx]['min']=actual.min(axis=0).tolist()
            result['accessors'][idx]['max']=actual.max(axis=0).tolist()
            normalidx=primitive['attributes']['NORMAL']
            accessor(result,data,normalidx)[:]=shading[offset:offset+count]
            # Normal min/max are optional; recompute if they were authored.
            na=result['accessors'][normalidx]
            if 'min' in na: na['min']=accessor(result,data,normalidx).min(axis=0).tolist()
            if 'max' in na: na['max']=accessor(result,data,normalidx).max(axis=0).tolist()
            offset+=count
        result['asset'].setdefault('extras',{})['vyraProgression']={
            'stage':name,'source':'../goku.glb','geometryBase':str(args.input.name),
            'sourceSha256':hashlib.sha256((ROOT/'resources/goku.glb').read_bytes()).hexdigest(),
            'headCutoffLocalZ':HEAD_CUTOFF,'fixedFeetBelowLocalZ':GROUND+.112,
            'localHeightUnchanged':True,'frontYawRadians':YAW,
            'rigged':False,'animationClips':0,'anatomyParameters':s,
            'method':'Localized anatomical surface deformation; original UVs, texture, material and head retained',
        }
        path=args.output/f'Goku_{name}.glb'
        write_glb(path,result,data)
        report={'stage':name,'bytes':path.stat().st_size,'vertices':len(points),'triangles':len(faces),
                'boundsMin':changed.min(0).tolist(),'boundsMax':changed.max(0).tolist(),
                'jacobianMin':float(determinant.min()),
                'jacobianNonPositive':int((determinant<=0).sum()),
                'maxDisplacement':float(np.linalg.norm(changed-points,axis=1).max())}
        reports.append(report);print(json.dumps(report),flush=True)
    (args.output/'generation-report.json').write_text(json.dumps(reports,indent=2)+'\n')


if __name__=='__main__':
    main()
