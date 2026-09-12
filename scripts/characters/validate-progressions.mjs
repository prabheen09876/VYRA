/** Independent structural/geometry/identity validation of the 25 new variants.
 * node scripts/characters/validate-progressions.mjs [--character Female_Mikasa]
 * Add --allow-missing during generation. The default final run requires all 25.
 * Three's image decoding is explicitly stubbed: Blender renders verify pixels.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2);
function option(name,fallback){const i=args.indexOf(name);if(i<0)return fallback;assert.ok(args[i+1]&&!args[i+1].startsWith('--'),`${name} requires a value`);return args[i+1];}
const ALL=['Base_Male','Base_Female','Female_Mikasa','Female_Name','Female_Sakura'];
const chosen=option('--character',null);
assert.ok(!chosen||ALL.includes(chosen),'--character must name one of the five supplied source files');
const CHARACTERS=chosen?[chosen]:ALL;
const STAGES=['Starter','Developing','Strong','Elite','Legendary'];
const allowMissing=args.includes('--allow-missing');
const REPORT=resolve(option('--report',join(ROOT,'resources/character-progressions-validation.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
const exists=p=>access(p).then(()=>true,()=>false);
const CB={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const CC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const TYPES={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};

async function readGlb(path){
 const raw=await readFile(path);assert.equal(raw.toString('ascii',0,4),'glTF','GLB signature');
 assert.equal(raw.readUInt32LE(4),2,'glTF 2');assert.equal(raw.readUInt32LE(8),raw.length,'GLB total length');
 let doc,binary;
 for(let off=12;off<raw.length;){assert.ok(off+8<=raw.length,'complete chunk header');const n=raw.readUInt32LE(off),type=raw.readUInt32LE(off+4);assert.equal(n%4,0,'four-byte chunk alignment');assert.ok(off+8+n<=raw.length,'chunk within file');
  const bytes=raw.subarray(off+8,off+8+n);if(type===0x4e4f534a){assert.ok(!doc,'one JSON chunk');doc=JSON.parse(bytes.toString('utf8'));}if(type===0x004e4942){assert.ok(!binary,'one BIN chunk');binary=bytes;}off+=8+n;}
 assert.ok(doc&&binary,'embedded JSON and BIN');assert.equal(doc.buffers?.length,1,'one self-contained buffer');assert.ok(!doc.buffers[0].uri,'embedded buffer');assert.ok(doc.buffers[0].byteLength<=binary.length,'BIN declared length');
 for(const im of doc.images??[])assert.ok(im.bufferView!==undefined&&!im.uri,'embedded texture image');
 return {path,raw,doc,binary};
}
function bytes(a,index){
 const ac=a.doc.accessors[index];assert.ok(ac&&ac.bufferView!==undefined&&!ac.sparse,`accessor ${index} is stored`);const v=a.doc.bufferViews[ac.bufferView];
 const width=CB[ac.componentType]*CC[ac.type];assert.ok(width>0&&v.buffer===0,'supported accessor');const stride=v.byteStride??width,off=(v.byteOffset??0)+(ac.byteOffset??0);
 assert.ok(stride>=width&&off+Math.max(0,ac.count-1)*stride+width<=a.binary.length,'accessor byte range');
 if(stride===width)return a.binary.subarray(off,off+ac.count*width);
 const out=Buffer.alloc(ac.count*width);for(let i=0;i<ac.count;i++)a.binary.copy(out,i*width,off+i*stride,off+i*stride+width);return out;
}
function array(a,index){const b=bytes(a,index),T=TYPES[a.doc.accessors[index].componentType];return new T(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
function fingerprint(a,index){const ac=a.doc.accessors[index];return {componentType:ac.componentType,count:ac.count,type:ac.type,normalized:ac.normalized??false,sha256:hash(bytes(a,index))};}
function images(a){return(a.doc.images??[]).map(im=>{const v=a.doc.bufferViews[im.bufferView],off=v.byteOffset??0;return{mimeType:im.mimeType,bytes:v.byteLength,sha256:hash(a.binary.subarray(off,off+v.byteLength))};});}
function skins(a){return(a.doc.skins??[]).map(s=>({...s,inverseBindMatrices:s.inverseBindMatrices===undefined?undefined:fingerprint(a,s.inverseBindMatrices)}));}
function animations(a){return(a.doc.animations??[]).map(an=>({...an,samplers:an.samplers.map(s=>({...s,input:fingerprint(a,s.input),output:fingerprint(a,s.output)}))}));}
function metadata(a){return{...(a.doc.extras??{}),...(a.doc.asset.extras?.vyraProgression??{})};}
function topology(g){return g.parts.map(p=>({mesh:p.mi,primitive:p.pi,vertexCount:p.positions.length/3,indicesHash:hash(p.indexBytes),attributes:Object.keys(p.primitive.attributes).sort()}));}
function compareWorkBase(base,bgeo,source,sgeo,name){
 const extent=Math.max(...sgeo.stats.localBounds.max.map((v,i)=>v-sgeo.stats.localBounds.min[i]));
 for(const end of['min','max'])for(let axis=0;axis<3;axis++)assert.ok(Math.abs(bgeo.stats.localBounds[end][axis]-sgeo.stats.localBounds[end][axis])<Math.max(1e-6,extent*1e-6),'work base retains complete source bounds');
 let originalVerticesRetained=0;
 if(name!=='Female_Sakura'){
  assert.equal(bgeo.parts.length,sgeo.parts.length,'work base preserves source primitive count');
  for(let k=0;k<sgeo.parts.length;k++){
   const p=sgeo.parts[k],q=bgeo.parts[k];assert.ok(q.positions.length>=p.positions.length,'refined base includes original vertices');
   for(let i=0;i<p.positions.length;i++)assert.equal(q.positions[i],p.positions[i],'original source vertex prefix exactly preserved by common base');
   originalVerticesRetained+=p.positions.length/3;
   for(const[semantic,idx]of Object.entries(p.primitive.attributes)){
    if(['POSITION','NORMAL','TANGENT'].includes(semantic))continue;
    const original=bytes(source,idx),shared=bytes(base,q.primitive.attributes[semantic]);
    assert.ok(shared.subarray(0,original.length).equals(original),`source ${semantic} prefix retained by refined base`);
   }
  }
 }else{
  const retained=metadata(base).sakuraIdentity?.retainedSourceMeshIndices;assert.ok(retained,'Sakura source mesh map');
  for(let k=0;k<retained.length;k++){
   const p=sgeo.parts[retained[k]].positions,q=bgeo.parts[k].positions,set=new Set();for(let i=0;i<q.length;i+=3)set.add(`${q[i]},${q[i+1]},${q[i+2]}`);
   for(let i=0;i<p.length;i+=3)if((p[i+1]>=127&&Math.abs(p[i])<=17)||p[i+1]>=135){assert.ok(set.has(`${p[i]},${p[i+1]},${p[i+2]}`),'Sakura base contains every original head position');originalVerticesRetained++;}
  }
 }
 return{sourceBoundsPreserved:true,sourceVertexCheck:name==='Female_Sakura'?'All original head points exist in retained/refined meshes':'All original position and non-shading attribute prefixes retained',originalVerticesVerified:originalVerticesRetained};
}

function geometry(a,{strict=true}={}){
 const parts=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let vertices=0,triangles=0,degenerate=0,minNormal=Infinity,maxNormal=0,tangents=0;
 const positionsHash=createHash('sha256');
 for(let mi=0;mi<(a.doc.meshes??[]).length;mi++)for(let pi=0;pi<a.doc.meshes[mi].primitives.length;pi++){
  const primitive=a.doc.meshes[mi].primitives[pi];assert.equal(primitive.mode??4,4,'triangle primitive');assert.ok(primitive.indices!==undefined,'indexed triangles');
  const positions=array(a,primitive.attributes.POSITION),normals=array(a,primitive.attributes.NORMAL),indices=array(a,primitive.indices);
  assert.ok(positions instanceof Float32Array&&normals instanceof Float32Array,'float position/normal');assert.equal(positions.length,normals.length,'matching position and normal counts');assert.equal(indices.length%3,0,'whole triangles');
  const pmin=[Infinity,Infinity,Infinity],pmax=[-Infinity,-Infinity,-Infinity];
  positionsHash.update(bytes(a,primitive.attributes.POSITION));
  for(let i=0;i<positions.length;i+=3){for(let k=0;k<3;k++){assert.ok(Number.isFinite(positions[i+k])&&Number.isFinite(normals[i+k]),'finite positions and normals');pmin[k]=Math.min(pmin[k],positions[i+k]);pmax[k]=Math.max(pmax[k],positions[i+k]);min[k]=Math.min(min[k],positions[i+k]);max[k]=Math.max(max[k],positions[i+k]);}const n=Math.hypot(normals[i],normals[i+1],normals[i+2]);minNormal=Math.min(minNormal,n);maxNormal=Math.max(maxNormal,n);}
  const ac=a.doc.accessors[primitive.attributes.POSITION];assert.ok(ac.min&&ac.max,'POSITION accessor bounds declared');
  for(let k=0;k<3;k++){const tol=Math.max(1,Math.abs(pmin[k]),Math.abs(pmax[k]))*2e-6;assert.ok(Math.abs(ac.min[k]-pmin[k])<=tol&&Math.abs(ac.max[k]-pmax[k])<=tol,'POSITION declared bounds match actual data');}
  if(primitive.attributes.TANGENT!==undefined){const ta=array(a,primitive.attributes.TANGENT);assert.equal(ta.length,positions.length/3*4,'tangent count');for(let i=0;i<ta.length;i+=4){assert.ok([ta[i],ta[i+1],ta[i+2],ta[i+3]].every(Number.isFinite),'finite tangents');if(strict){assert.ok(Math.abs(Math.hypot(ta[i],ta[i+1],ta[i+2])-1)<.001,'unit tangent');assert.ok(Math.abs(Math.abs(ta[i+3])-1)<.001,'tangent handedness');}}tangents+=ta.length/4;}
  const degenerates=new Set();
  for(let i=0;i<indices.length;i+=3){const ia=indices[i]*3,ib=indices[i+1]*3,ic=indices[i+2]*3;assert.ok(Math.min(ia,ib,ic)>=0&&Math.max(ia,ib,ic)+2<positions.length,'triangle indices inside vertex buffer');const ax=positions[ib]-positions[ia],ay=positions[ib+1]-positions[ia+1],az=positions[ib+2]-positions[ia+2],bx=positions[ic]-positions[ia],by=positions[ic+1]-positions[ia+1],bz=positions[ic+2]-positions[ia+2];if(Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)<=1e-14)degenerates.add(i/3);}
  vertices+=positions.length/3;triangles+=indices.length/3;degenerate+=degenerates.size;
  parts.push({mi,pi,primitive,positions,normals,indices,indexBytes:bytes(a,primitive.indices),degenerates});
 }
 assert.ok(parts.length,'nonempty geometry');if(strict)assert.ok(minNormal>.999&&maxNormal<1.001,`normalized normals (${minNormal}..${maxNormal})`);
 return{parts,stats:{vertices,triangles,primitives:parts.length,degenerateTriangles:degenerate,tangentVertices:tangents,minNormalLength:minNormal,maxNormalLength:maxNormal,localBounds:{min,max},positionsSha256:positionsHash.digest('hex')}};
}
function preservation(asset,base,source,name){
 for(const key of ['nodes','scenes','scene','materials','textures','samplers','extensionsUsed','extensionsRequired'])assert.deepEqual(asset.doc[key],base.doc[key],`${key} identical across stages and shared base`);
 assert.deepEqual(images(asset),images(source),'source embedded image bytes preserved');
 assert.deepEqual(skins(asset),skins(source),'source joints and inverse bind matrices preserved');
 assert.deepEqual(animations(asset),animations(source),'source animation channels, sampler times and values preserved');
 const stripMesh=nodes=>nodes?.map(({mesh,...node})=>node);
 assert.deepEqual(stripMesh(asset.doc.nodes),stripMesh(source.doc.nodes),'original scene transform and bone hierarchy preserved');
 for(const key of ['author','license','source','title'])assert.deepEqual(asset.doc.asset.extras?.[key],source.doc.asset.extras?.[key],`original ${key} attribution preserved`);
 if(name!=='Female_Sakura')assert.deepEqual(asset.doc.materials,source.doc.materials,'original materials preserved');
 else{
  const retained=metadata(asset).sakuraIdentity?.retainedSourceMeshIndices;
  assert.ok(Array.isArray(retained)&&retained.length===asset.doc.materials.length,'Sakura retained source material mapping');
  for(let i=0;i<retained.length;i++){const old=source.doc.materials[retained[i]],now=asset.doc.materials[i],ext=old.extensions.KHR_materials_pbrSpecularGlossiness;
   assert.deepEqual(now.pbrMetallicRoughness.baseColorTexture,ext.diffuseTexture,'Sakura original diffuse texture binding');assert.deepEqual(now.pbrMetallicRoughness.baseColorFactor,ext.diffuseFactor??[1,1,1,1],'Sakura original diffuse factor');assert.equal(now.pbrMetallicRoughness.metallicFactor,0,'Sakura dielectric material');assert.ok(Math.abs(now.pbrMetallicRoughness.roughnessFactor-(1-(ext.glossinessFactor??1)))<1e-10,'Sakura glossiness converted to roughness');assert.deepEqual(now.extras?.sourceSpecularGlossiness,ext,'Sakura legacy material settings retained as metadata');
   for(const key of ['alphaMode','alphaCutoff','doubleSided','normalTexture','occlusionTexture','emissiveTexture','emissiveFactor'])assert.deepEqual(now[key],old[key],`Sakura ${key} preserved`);
  }
 }
 const recorded=metadata(asset).sourceSha256;assert.ok(recorded,'original source checksum recorded');assert.equal(recorded,hash(source.raw),'source byte checksum matches generation snapshot');
 return{sourceChecksumVerified:true,originalImageBytesPreserved:true,originalRigAndAnimationsPreserved:true,originalTransformHierarchyPreserved:true,materialPolicy:name==='Female_Sakura'?'Verified diffuse-preserving legacy specular/glossiness migration to dielectric PBR':'Exact original material JSON'};
}
function headRule(name,asset,report){
 const md=metadata(asset),identity=md.sakuraIdentity??{};
 if(name==='Female_Mikasa')return{axis:2,cutoff:307,preservedMeshes:[1,2]};
 if(name==='Female_Name')return{axis:1,cutoff:1.42,preservedMeshes:md.preservedMeshIndices??[0,2,3,4]};
 if(name==='Female_Sakura')return{axis:1,cutoff:identity.headCutoffLocalY??127,preservedMeshes:[],lateralLimit:identity.headMask?17:undefined,unrestrictedCutoff:identity.headMask?135:undefined};
 const cutY=md.headCutoffLocalY??report?.headCutoffLocalY,cutZ=md.headCutoffLocalZ??report?.headCutoffLocalZ;
 if(cutY!==undefined)return{axis:1,cutoff:cutY,preservedMeshes:[]};
 if(cutZ!==undefined)return{axis:2,cutoff:cutZ,preservedMeshes:[]};
 if(name==='Base_Male')return{axis:1,cutoff:17.75,preservedMeshes:[]};
 if(name==='Base_Female')return{axis:2,cutoff:2.,preservedMeshes:[]};
 const axis=md.localUpAxis??md.coordinateUpAxis??report?.localUpAxis;
 if(md.headCutoff!==undefined&&axis)return{axis:String(axis).toUpperCase()==='Y'?1:2,cutoff:md.headCutoff,preservedMeshes:[]};
 return null;
}
function compareGeometry(asset,geo,base,bgeo,rule){
 assert.deepEqual(topology(geo),topology(bgeo),'topology and vertex correspondence preserved');
 const sums=Array.from({length:3},()=>({n:0,x:0,y:0,xx:0,xy:0}));let changed=0,headVertices=0,headDelta=0,headNormalDelta=0,protectedMeshVertices=0,newDegenerates=0;
 for(let k=0;k<geo.parts.length;k++){const p=geo.parts[k],q=bgeo.parts[k];assert.equal(p.primitive.material,q.primitive.material,'primitive material assignment');
  for(const [semantic,idx]of Object.entries(p.primitive.attributes)){const old=q.primitive.attributes[semantic];if(!['POSITION','NORMAL','TANGENT'].includes(semantic))assert.deepEqual(fingerprint(asset,idx),fingerprint(base,old),`${semantic} values unchanged from common base`);}
  assert.deepEqual(p.primitive.targets,q.primitive.targets,'morph target structure unchanged');
  for(let i=0;i<p.positions.length;i+=3){const d=Math.hypot(p.positions[i]-q.positions[i],p.positions[i+1]-q.positions[i+1],p.positions[i+2]-q.positions[i+2]);if(d>1e-9)changed++;
   const wholeMesh=rule?.preservedMeshes.includes(p.mi),above=rule&&q.positions[i+rule.axis]>=rule.cutoff,
     head=rule&&(wholeMesh||(above&&(rule.lateralLimit===undefined||Math.abs(q.positions[i])<=rule.lateralLimit))||(rule.unrestrictedCutoff!==undefined&&q.positions[i+rule.axis]>=rule.unrestrictedCutoff));
   if(head){headVertices++;if(wholeMesh)protectedMeshVertices++;headDelta=Math.max(headDelta,d);headNormalDelta=Math.max(headNormalDelta,Math.hypot(p.normals[i]-q.normals[i],p.normals[i+1]-q.normals[i+1],p.normals[i+2]-q.normals[i+2]));}
   for(let j=0;j<3;j++){const s=sums[j],x=q.positions[i+j],y=p.positions[i+j];s.n++;s.x+=x;s.y+=y;s.xx+=x*x;s.xy+=x*y;}}
  for(const f of p.degenerates)if(!q.degenerates.has(f))newDegenerates++;
 }
 assert.equal(newDegenerates,0,'no newly degenerate triangles');
 if(rule){assert.ok(headVertices>0,'head identity sample exists');assert.equal(headDelta,0,'head and protected mesh positions exactly preserved');assert.ok(headNormalDelta<1e-4,'head and protected mesh normals preserved');}
 const fit=sums.map(s=>{const denom=s.n*s.xx-s.x*s.x,scale=Math.abs(denom)>1e-20?(s.n*s.xy-s.x*s.y)/denom:1;return{scale,translation:(s.y-scale*s.x)/s.n};});let error=0,n=0;
 for(let k=0;k<geo.parts.length;k++){const p=geo.parts[k].positions,q=bgeo.parts[k].positions;for(let i=0;i<p.length;i++){error+=(p[i]-q[i]*fit[i%3].scale-fit[i%3].translation)**2;n++;}}
 const rms=Math.sqrt(error/n),extent=Math.max(...bgeo.stats.localBounds.max.map((v,i)=>v-bgeo.stats.localBounds.min[i]));
 if(changed)assert.ok(rms>extent*1e-7,'anatomical changes exceed global axis scaling/translation');
 return{changedVertices:changed,newDegenerateTriangles:newDegenerates,headCheck:rule?{...rule,headVertices,protectedMeshVertices,maximumPositionDifference:headDelta,maximumNormalDifference:headNormalDelta}:{status:'missing-metadata'},globalDiagonalFit:fit,nonGlobalDeformationResidualRms:rms};
}

let validator;
for(const from of[import.meta.url,pathToFileURL(join(tmpdir(),'vyra-goku-validation-tools/package.json'))])try{validator=createRequire(from)('gltf-validator');break;}catch{}
assert.ok(validator,'Khronos gltf-validator must be installed in the repo or %TEMP%/vyra-goku-validation-tools');
async function khronos(a){
 // Unlimited scan is required: Female_Name inherits thousands of harmless
 // zero-weight-joint warnings which would exhaust a small issue cap early.
 const r=await validator.validateBytes(new Uint8Array(a.raw),{uri:a.path,maxIssues:0});
 const codes={};for(const message of r.issues.messages){const group=codes[message.code]??={severity:message.severity,count:0,examples:[]};group.count++;if(group.examples.length<3)group.examples.push(message);}
 return{status:r.issues.numErrors?'failed':'passed',version:validator.version(),errors:r.issues.numErrors,warnings:r.issues.numWarnings,infos:r.issues.numInfos,scanIssueLimit:'unlimited',issueGroups:codes,messages:Object.values(codes).flatMap(g=>g.examples)};
}
async function three(a){
 globalThis.self??=globalThis;globalThis.ProgressEvent??=class{constructor(type,init){this.type=type;Object.assign(this,init);}};
 globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
 const parsed=await new GLTFLoader().parseAsync(a.raw.buffer.slice(a.raw.byteOffset,a.raw.byteOffset+a.raw.byteLength),'');parsed.scene.updateMatrixWorld(true);
 let meshes=0,skinnedMeshes=0,vertices=0,triangles=0,textureBindings=0;const geos=new Set(),mats=new Set(),texs=new Set();
 parsed.scene.traverse(o=>{if(!o.isMesh)return;meshes++;if(o.isSkinnedMesh)skinnedMeshes++;vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;geos.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material])){mats.add(m);for(const v of Object.values(m))if(v?.isTexture){textureBindings++;texs.add(v);}}});
 const bounds=new Box3().setFromObject(parsed.scene),size=bounds.getSize(new Vector3());assert.ok(meshes>0&&size.toArray().every(x=>Number.isFinite(x)&&x>0),'Three loader finite nonempty scene bounds');
 const result={status:'passed',meshes,skinnedMeshes,vertices,triangles,textureBindings,animationClips:parsed.animations.length,animationNames:parsed.animations.map(a=>a.name),worldBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},limitation:'ImageBitmap decode uses a 1x1 placeholder. Verifies loader structure, bindings, skeleton/clip parsing and scene bounds; does not test real image pixels, WebGL, animation quality or runtime performance.'};
 for(const x of geos)x.dispose();for(const x of mats)x.dispose();for(const x of texs)x.dispose();return result;
}
async function findBase(dir,gen,source){
 if(gen?.baseFile&&await exists(join(dir,gen.baseFile)))return join(dir,gen.baseFile);
 if(await exists(join(dir,'work'))){const names=(await readdir(join(dir,'work'))).filter(n=>n.endsWith('.glb')&&!n.includes('unrefined'));if(names.length===1)return join(dir,'work',names[0]);const preferred=names.filter(n=>/base/i.test(n));if(preferred.length===1)return join(dir,'work',preferred[0]);assert.ok(!names.length,'ambiguous work base; generation-report.json must provide baseFile');}
 return source;
}

const report={createdAt:new Date().toISOString(),requestedCharacters:CHARACTERS,allowMissing,expectedVariants:CHARACTERS.length*5,characters:[],failures:[],missing:[],limitations:['Nonadjacent intersections are audited separately where an intersection-audit.json exists; this structural check does not prove watertightness or absence of all clipping.','Three loader uses explicitly stubbed image decoding. Actual textures and deformation appearance require the accompanying Blender previews.']};
for(const name of CHARACTERS){
 const dir=join(ROOT,'resources',name.toLowerCase().replaceAll('_','-')+'-progression'),sourcePath=join(ROOT,'resources',name+'.glb');
 const entry={character:name,directory:dir,stages:[],failures:[]};report.characters.push(entry);
 try{
  const source=await readGlb(sourcePath),sourceGeo=geometry(source,{strict:false});const gen=await exists(join(dir,'generation-report.json'))?JSON.parse(await readFile(join(dir,'generation-report.json'),'utf8')):null;
  const basePath=await findBase(dir,gen,sourcePath),base=basePath===sourcePath?source:await readGlb(basePath),bgeo=geometry(base);
  const baseSmoke=await three(base);entry.source={file:sourcePath,bytes:source.raw.length,sha256:hash(source.raw),...sourceGeo.stats,images:images(source),skinCount:source.doc.skins?.length??0,clipCount:source.doc.animations?.length??0,khronos:await khronos(source)};
  entry.commonBase={file:basePath,bytes:base.raw.length,sha256:hash(base.raw),...bgeo.stats,sourceGeometryComparison:compareWorkBase(base,bgeo,source,sourceGeo,name),threeLoader:baseSmoke,khronos:base===source?entry.source.khronos:await khronos(base)};
  if(base!==source){assert.deepEqual(images(base),images(source),'work base retains source images');assert.deepEqual(skins(base),skins(source),'work base retains original skin rig');assert.deepEqual(animations(base),animations(source),'work base retains original clips');}
  for(const stage of STAGES){const path=join(dir,`${name}_${stage}.glb`);if(!await exists(path)){report.missing.push({character:name,stage,file:path});if(!allowMissing)entry.failures.push({stage,message:'Expected GLB missing'});continue;}
   const row={stage,file:path};entry.stages.push(row);
   try{
    const asset=await readGlb(path);Object.assign(row,{bytes:asset.raw.length,sha256:hash(asset.raw)});row.khronos=await khronos(asset);assert.equal(row.khronos.errors,0,'Khronos glTF validation has errors');
    const geo=geometry(asset);Object.assign(row,geo.stats);row.preservation=preservation(asset,base,source,name);row.geometryComparison=compareGeometry(asset,geo,base,bgeo,headRule(name,asset,gen));
    assert.ok(row.geometryComparison.changedVertices>0||stage==='Developing','Only Developing may use the exact source physique baseline');
    row.threeLoader=await three(asset);assert.equal(row.threeLoader.animationClips,source.doc.animations?.length??0,'Three parses all original clips');
    const height=baseSmoke.worldBounds.max[1]-baseSmoke.worldBounds.min[1],tol=Math.max(height*2e-6,2e-6);
    for(const end of['min','max'])assert.ok(Math.abs(row.threeLoader.worldBounds[end][1]-baseSmoke.worldBounds[end][1])<=tol,'world ground and full height match shared base');
    row.status='passed';console.log(`${name} ${stage}: PASS, ${geo.stats.triangles} triangles, ${(asset.raw.length/1e6).toFixed(2)} MB, ${row.threeLoader.animationClips} clips`);
   }catch(e){row.status='failed';row.error=e.message;entry.failures.push({stage,message:e.message});console.error(`${name} ${stage}: FAIL ${e.message}`);}
  }
  const passed=entry.stages.filter(s=>s.status==='passed');if(passed.length===5)assert.equal(new Set(passed.map(s=>s.positionsSha256)).size,5,'All five stages must have distinct valid position buffers');
  const after=hash(await readFile(sourcePath));assert.equal(after,entry.source.sha256,'original source unchanged during validation');entry.source.sha256AfterValidation=after;
  if(await exists(join(dir,'intersection-audit.json')))entry.intersectionAudit=JSON.parse(await readFile(join(dir,'intersection-audit.json'),'utf8'));
 }catch(e){entry.failures.push({message:e.message});console.error(`${name}: FAIL ${e.message}`);}
 entry.status=entry.failures.length?'failed':entry.stages.length===5?'passed':'incomplete';report.failures.push(...entry.failures.map(f=>({character:name,...f})));
}
report.passedVariants=report.characters.reduce((n,c)=>n+c.stages.filter(s=>s.status==='passed').length,0);
report.status=report.failures.length?'failed':report.missing.length?'incomplete':'passed';
await writeFile(REPORT,JSON.stringify(report,null,2)+'\n');console.log(`Validation ${report.status}: ${report.passedVariants}/${report.expectedVariants} variants; ${REPORT}`);
if(report.failures.length||(!allowMissing&&report.missing.length))process.exitCode=1;
