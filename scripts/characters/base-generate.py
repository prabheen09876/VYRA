"""Character-specific physique surfaces for the supplied low-poly female and rigged male.
All rest transforms/rig data remain unchanged. Skinning is evaluated and inverted
per vertex so anatomical edits are authored in the displayed rest frame.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import numpy as np
from character_io import Glb,smooth,curve,bell

ROOT=Path(__file__).resolve().parents[2]
STAGES={
    'Starter':dict(chest=.76,depth=.80,waist=.85,hip=.89,arm=.66,forearm=.72,thigh=.73,calf=.75,definition=-.1),
    'Developing':dict(chest=.92,depth=.94,waist=.96,hip=.97,arm=.89,forearm=.91,thigh=.91,calf=.92,definition=.10),
    'Strong':dict(chest=1.12,depth=1.16,waist=1.03,hip=1.05,arm=1.23,forearm=1.18,thigh=1.15,calf=1.12,definition=.38),
    'Elite':dict(chest=1.36,depth=1.43,waist=1.13,hip=1.14,arm=1.63,forearm=1.45,thigh=1.40,calf=1.32,definition=.78),
    'Legendary':dict(chest=1.66,depth=1.78,waist=1.25,hip=1.29,arm=2.10,forearm=1.85,thigh=1.73,calf=1.60,definition=1.28),
}


def subdivide(base,path,rounds):
    """Conforming linear subdivisions retain source surface and rig influence data."""
    for _,prim in base.visible_primitives():
        attrs={k:base.array(i).copy() for k,i in prim['attributes'].items()}
        faces=base.array(prim['indices']).reshape(-1,3).copy().astype(int)
        for _ in range(rounds):
            edges=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
            edges.sort(1);unique,inverse=np.unique(edges,axis=0,return_inverse=True)
            count=len(attrs['POSITION']);m=inverse.reshape(3,-1).T+count
            nxt={}
            for key,values in attrs.items():
                if key in {'JOINTS_0','WEIGHTS_0'}:continue
                mid=(values[unique[:,0]].astype(float)+values[unique[:,1]])*.5
                if key=='NORMAL':mid/=np.maximum(np.linalg.norm(mid,axis=1,keepdims=True),1e-15)
                nxt[key]=np.concatenate([values,mid.astype(values.dtype)])
            if 'JOINTS_0' in attrs:
                oldj=attrs['JOINTS_0'];oldw=attrs['WEIGHTS_0']
                nj=[];nw=[]
                for a,b in unique:
                    weights={}
                    for joint,w in zip(np.concatenate([oldj[a],oldj[b]]),np.concatenate([oldw[a],oldw[b]])):
                        weights[int(joint)]=weights.get(int(joint),0)+float(w)*.5
                    chosen=sorted(weights.items(),key=lambda p:-p[1])[:4]
                    chosen+= [(0,0.)]*(4-len(chosen));total=sum(w for j,w in chosen)
                    nj.append([j for j,w in chosen]);nw.append([w/total for j,w in chosen])
                nxt['JOINTS_0']=np.concatenate([oldj,np.array(nj,dtype=oldj.dtype)])
                nxt['WEIGHTS_0']=np.concatenate([oldw,np.array(nw,dtype=oldw.dtype)])
            a,b,c=faces.T;ab,bc,ca=m.T
            faces=np.concatenate([np.column_stack([a,ab,ca]),np.column_stack([ab,b,bc]),
                                  np.column_stack([ca,bc,c]),np.column_stack([ab,bc,ca])])
            attrs=nxt
        for key,values in attrs.items():base.replace(prim['attributes'][key],values)
        idx=prim['indices'];base.doc['accessors'][idx]['componentType']=5125
        base.replace(idx,faces.reshape(-1,1).astype('<u4'))
    base.doc.setdefault('extras',{})['surfaceRefinement']={'rounds':rounds,'method':'Linear midpoint surface refinement; original positions retained as a prefix'}
    base.save(path)


def deform(q,s,female):
    u,h,v=q.T;a=np.abs(u);sgn=np.where(u<0,-1.,1.)
    neck=.810 if female else .837
    gate=smooth(.055,.12,h)*(1-smooth(neck-.060,neck,h)*(1-smooth(.095,.15,a)))
    chest_h=.743 if female else .754
    waist_h=.656 if female else .629
    pelvis_h=.547 if female else .488
    female_factor=.88 if female else 1.
    c=1+(s['chest']-1)*female_factor;dep=1+(s['depth']-1)*female_factor
    xscale=curve(h,[(0,s['hip']),(pelvis_h,s['hip']),(waist_h,s['waist']),
        (chest_h-.025,c),(chest_h+.035,c),(neck,1)])
    dscale=curve(h,[(0,s['hip']),(pelvis_h,s['hip']), (waist_h,1+(s['waist']-1)*.7),
        (chest_h,dep),(neck,1)])
    vu=u*xscale;vv=v*dscale;hh=h.copy()
    # Independent leg axes. Preserve the foot positions; thigh/calf masses grow
    # around the existing stance with a smooth inner-thigh transition.
    legaxis=curve(h,[(0,.044 if female else .195),(.14,.043 if female else .169),
        (.29,.047 if female else .146),(.42,.050 if female else .114),(.56,.048 if female else .092)])
    legscale=curve(h,[(0,1),(.065,1),(.18,s['calf']),(.28,1+(s['thigh']-1)*.62),
        (.40,s['thigh']),(.51,s['thigh']),(.59,s['hip'])])
    soft=np.tanh(u/(.022 if female else .047))
    shift=(s['thigh']-1)*(.018 if female else .028)*smooth(.09,.40,h)
    lu=u+(u-soft*legaxis)*(legscale-1)+soft*shift
    lv=v*(1+(legscale-1)*.80)
    legmix=1-smooth(pelvis_h-.035,pelvis_h+.055,h)
    vu=vu*(1-legmix)+lu*legmix;vv=vv*(1-legmix)+lv*legmix
    front=smooth(-.003,.036,v);back=1-smooth(-.036,.003,v)
    bodymask=1-smooth(.090 if female else .15,.145 if female else .205,a)
    # Deliberate pec, upper-back and abdominal surface forms.
    absx=.025 if female else .035
    core=bell(a,absx,.018)*(bell(h,waist_h+.025,.014)+.9*bell(h,waist_h-.008,.014)+.65*bell(h,waist_h-.040,.014))
    pec=bell(a,.047 if female else .074,.031)*bell(h,chest_h,.025)
    lat=bell(a,.064 if female else .105,.033)*bell(h,chest_h-.039,.039)
    vv+=s['definition']*bodymask*(front*(.005*core+(.003 if female else .009)*pec)-back*.008*lat)
    vv+=s['definition']*.009*legmix*bell(a,legaxis,.035)*bell(h,.44,.05)*front
    vv-=s['definition']*.006*legmix*bell(a,legaxis,.028)*bell(h,.20,.045)*back

    if female:
        # Source-specific A-pose: arm axes expand with rigid hand translation.
        ax=curve(h,[(0,.240),(.545,.227),(.644,.163),(.767,.079),(.83,.065)])
        arm_profile=curve(h,[(0,1),(.542,1),(.591,s['forearm']),(.643,1+(s['arm']-1)*.63),(.708,s['arm']),(.767,s['arm']*.80+.20),(.83,1)])
        # Cross-sectional direction perpendicular to the downward/outward arm.
        n_u=.80;n_h=.60
        delta=(a-ax)*n_u
        arm_offset=(s['arm']-1)*.070
        au=u+sgn*(delta*n_u*(arm_profile-1)+arm_offset)
        ah=h+delta*n_h*(arm_profile-1)
        av=v*arm_profile
        inner=curve(h,[(0,.13),(.565,.13),(.62,.083),(.73,.065),(.81,.06)])
        arm_mix=smooth(inner,inner+.026,a)*(1-smooth(.755,.806,h))
        # Preserve the unrigged hands rigidly and smooth shoulder attachment.
    else:
        # T-pose arms: cross-sectional growth and lateral shoulder translation.
        # Finger shape and all existing rig data are retained.
        axis_h=curve(a,[(0,.795),(.23,.795),(.38,.788),(.53,.784),(.67,.775),(.9,.76)])
        axis_v=curve(a,[(0,0),(.24,-.010),(.42,-.014),(.59,-.010),(.9,0)])
        profile=curve(a,[(0,1),(.15,s['arm']*.80+.20),(.25,s['arm']),(.385,1+(s['arm']-1)*.62),
            (.47,s['forearm']),(.60,1),(.94,1)])
        au=u+sgn*(c-1)*.145;ah=axis_h+(h-axis_h)*profile;av=axis_v+(v-axis_v)*profile
        arm_mix=smooth(.135,.235,a)*smooth(.665,.73,h)
    vu=vu*(1-arm_mix)+au*arm_mix
    vv=vv*(1-arm_mix)+av*arm_mix
    hh=hh*(1-arm_mix)+ah*arm_mix
    if not female:
        hand_mask=smooth(.585,.635,a)*smooth(.66,.72,h)
    else:
        hand_mask=smooth(.20,.225,a)*(1-smooth(.548,.570,h))
    # Head and feet are anchors. Hands translate rigidly with the shoulders;
    # their fingers and the source skin weights remain unchanged.
    result=np.column_stack([u+(vu-u)*gate,h+(hh-h)*gate,v+(vv-v)*gate])
    fixed=((h>=neck)&(a<=.115))|(h<=.055)
    result[fixed]=q[fixed]
    return result,fixed


def generate(name):
    source=ROOT/'resources'/f'{name}.glb';source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    folder=ROOT/'resources'/f'{name.lower().replace("_","-")}-progression';folder.mkdir(parents=True,exist_ok=True)
    female=name=='Base_Female';base=Glb(source)
    base.doc.setdefault('extras',{})['sourceSha256']=source_hash
    # Low-poly female needs more local sampling; male already has 15k triangles
    # and rig weights, which we retain byte-for-byte without retessellation.
    if female:subdivide(base,folder/'work/base.glb',2)
    else:base.save(folder/'work/base.glb')
    records=[];allworld=[]
    for ni,prim in base.visible_primitives():
        p=base.array(prim['attributes']['POSITION']).copy().astype(float)
        n=base.array(prim['attributes']['NORMAL']).copy().astype(float)
        mats=base.skin_matrices(ni,prim);lin=mats[:,:3,:3];trans=mats[:,:3,3]
        world=np.einsum('nij,nj->ni',lin,p)+trans
        records.append((prim,p,n,lin,trans,world));allworld.append(world)
    world=np.concatenate(allworld);lo=world.min(0);hi=world.max(0);height=hi[1]-lo[1]
    center=np.array([(lo[0]+hi[0])*.5,lo[1],(lo[2]+hi[2])*.5])
    reports=[]
    for stage,params in STAGES.items():
        output=copy.deepcopy(base);details=[]
        for prim,p,n,lin,trans,world in records:
            q=(world-center)/height
            changed,fixed=deform(q,params,female)
            jac=[];epsilon=1e-5
            for k in range(3):
                delta=np.zeros(3);delta[k]=epsilon
                jac.append((deform(q+delta,params,female)[0]-deform(q-delta,params,female)[0])/(2*epsilon))
            jac=np.stack(jac,axis=2);det=np.linalg.det(jac)
            transformed=np.linalg.solve(lin,(changed*height+center-trans)[...,None])[...,0]
            worldn=np.linalg.solve(lin.transpose(0,2,1),n[...,None])[...,0]
            nextn=np.linalg.solve(jac.transpose(0,2,1),worldn[...,None])[...,0]
            nextn=np.einsum('nji,nj->ni',lin,nextn)
            nextn/=np.maximum(np.linalg.norm(nextn,axis=1,keepdims=True),1e-15)
            transformed[fixed]=p[fixed];nextn[fixed]=n[fixed]
            if not np.isfinite(transformed).all() or not np.isfinite(nextn).all():raise RuntimeError('Nonfinite geometry')
            if (det<=0).any():raise RuntimeError(f'{name}/{stage}: local deformation folds')
            pi=prim['attributes']['POSITION'];ni=prim['attributes']['NORMAL']
            actual=output.array(pi);actual[:]=transformed
            output.doc['accessors'][pi]['min']=actual.min(0).tolist();output.doc['accessors'][pi]['max']=actual.max(0).tolist()
            output.array(ni)[:]=nextn
            output.doc['accessors'][ni].pop('min',None)
            output.doc['accessors'][ni].pop('max',None)
            details.append({'vertices':len(p),'fixedVertices':int(fixed.sum()),'jacobianMin':float(det.min()),'nonPositiveJacobians':int((det<=0).sum()),
                'canonicalBoundsMin':changed.min(0).tolist(),'canonicalBoundsMax':changed.max(0).tolist()})
        output.doc['asset'].setdefault('extras',{})['vyraProgression']={'stage':stage,'character':name,'sourceSha256':source_hash,
            'method':'Anatomical rest-surface edit with preserved source rig, materials and identity',
            'headHeightFraction':.810 if female else .837,'parameters':params,'restBounds':{'min':lo.tolist(),'max':hi.tolist()}}
        output.doc['asset']['extras']['vyraProgression'].update({'localUpAxis':2 if female else 1,
            'headCutoffLocalZ' if female else 'headCutoffLocalY':2.0 if female else 17.75})
        path=folder/f'{name}_{stage}.glb';output.save(path)
        report={'stage':stage,'file':path.name,'bytes':path.stat().st_size,'sourceSha256':source_hash,'geometry':details}
        reports.append(report);print(json.dumps(report),flush=True)
    (folder/'generation-report.json').write_text(json.dumps({'character':name,'sourceSha256':source_hash,'stages':reports},indent=2)+'\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--character',choices=['Base_Male','Base_Female'],required=True)
    generate(parser.parse_args().character)
