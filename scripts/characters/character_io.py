"""Small lossless GLB reader/writer with glTF node and rest-skin transforms."""
import json
import struct
from pathlib import Path
import numpy as np

DT={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}


class Glb:
    def __init__(self,path):
        raw=Path(path).read_bytes();size=struct.unpack_from('<I',raw,12)[0]
        self.doc=json.loads(raw[20:20+size]);self.binary=bytearray(raw[28+size:])
    def array(self,index):
        a=self.doc['accessors'][index];v=self.doc['bufferViews'][a['bufferView']]
        dtype=np.dtype(DT[a['componentType']]);width=NC[a['type']]
        return np.ndarray((a['count'],width),dtype=dtype,buffer=self.binary,
            offset=v.get('byteOffset',0)+a.get('byteOffset',0),
            strides=(v.get('byteStride',dtype.itemsize*width),dtype.itemsize))
    def replace(self,index,array):
        a=self.doc['accessors'][index]
        array=np.asarray(array,dtype=DT[a['componentType']])
        self.binary+=b'\0'*((-len(self.binary))%4)
        view={'buffer':0,'byteOffset':len(self.binary),'byteLength':array.nbytes}
        self.doc['bufferViews'].append(view);a['bufferView']=len(self.doc['bufferViews'])-1
        a.pop('byteOffset',None);a['count']=len(array)
        if a['type']=='VEC3' and ('min' in a or 'max' in a):
            a['min']=array.min(0).tolist();a['max']=array.max(0).tolist()
        self.binary+=array.tobytes()
    def save(self,path):
        self.doc['buffers'][0]['byteLength']=len(self.binary)
        data=json.dumps(self.doc,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
        binary=self.binary+b'\0'*((-len(self.binary))%4)
        raw=struct.pack('<III',0x46546c67,2,28+len(data)+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(binary),0x004e4942)+binary
        Path(path).parent.mkdir(parents=True,exist_ok=True);Path(path).write_bytes(raw)
    def worlds(self):
        nodes=self.doc['nodes'];parent={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
        out={}
        def visit(i):
            if i in out:return out[i]
            n=nodes[i]
            if 'matrix'in n:m=np.array(n['matrix'],float).reshape(4,4).T
            else:
                x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.eye(4)
                m[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],
                    [2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],
                    [2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])@np.diag(n.get('scale',[1,1,1]))
                m[:3,3]=n.get('translation',[0,0,0])
            out[i]=visit(parent[i])@m if i in parent else m
            return out[i]
        for i in range(len(nodes)):visit(i)
        return out
    def skin_matrices(self,node_index,primitive):
        worlds=self.worlds();node=self.doc['nodes'][node_index]
        count=self.doc['accessors'][primitive['attributes']['POSITION']]['count']
        if 'skin' not in node:return np.broadcast_to(worlds[node_index],(count,4,4)).copy()
        skin=self.doc['skins'][node['skin']]
        ibm=self.array(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float)
        mats=np.stack([worlds[j] for j in skin['joints']])@ibm
        joints=self.array(primitive['attributes']['JOINTS_0']).astype(int)
        weights=self.array(primitive['attributes']['WEIGHTS_0']).astype(float)
        info=self.doc['accessors'][primitive['attributes']['WEIGHTS_0']]
        if info.get('normalized'):weights/=np.iinfo(np.dtype(DT[info['componentType']])).max
        return np.sum(mats[joints]*weights[:,:,None,None],axis=1)
    def visible_primitives(self):
        for ni,node in enumerate(self.doc['nodes']):
            if 'mesh' in node:
                for p in self.doc['meshes'][node['mesh']]['primitives']:yield ni,p


def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)


def curve(x,knots):
    xp=np.array([k[0] for k in knots]);yp=np.array([k[1] for k in knots])
    i=np.clip(np.searchsorted(xp,x,side='right')-1,0,len(xp)-2)
    t=smooth(xp[i],xp[i+1],x);return yp[i]*(1-t)+yp[i+1]*t


def bell(x,center,radius):return np.exp(-.5*((x-center)/radius)**2)
