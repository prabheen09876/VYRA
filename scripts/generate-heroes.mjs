import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO, Accessor } from '@gltf-transform/core';
import { SphereGeometry, CylinderGeometry, BoxGeometry, Color } from 'three';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'apps/mobile/assets/heroes');
await mkdir(out, { recursive: true });
const presets = [
  ['starter', .78, .91, 1], ['developing', .92, .95, 2],
  ['strong', 1.10, 1, 3], ['elite', 1.35, 1.05, 4], ['legendary', 1.62, 1.10, 5]
];
const manifest = [];
for (const [stage, bulk, stature, abs] of presets) {
  const doc = new Document();
  const buffer = doc.createBuffer('HeroGeometry');
  const scene = doc.createScene('VYRA');
  const hero = doc.createNode('Hero').setScale([1, stature, 1]).setExtras({ stage, author: 'VYRA', procedural: true });
  scene.addChild(hero);
  const mat = (name, hex, metal = 0) => doc.createMaterial(name)
    .setBaseColorFactor([...new Color(hex).toArray(), 1]).setMetallicFactor(metal).setRoughnessFactor(.58);
  // Baked to match the Halo palette in apps/mobile/src/theme.ts and the cosmetic colors in
  // packages/core/src/catalog.ts. These live in the GLB, so editing the catalog alone does NOT
  // change them — `npm run assets:generate && npm run assets:verify` has to be re-run.
  //   `coral` is the Cosmetic_Bracer_* meshes and the head Crest -> catalog pulse-bracers #FF6B3D
  //   `gold`  is the Buckle and the legendary-only Crown_*/LegendTrim_* -> catalog nova-aura #5EEAD4
  // (The material KEYS keep their historical names so the mesh-assignment code below is untouched;
  // only the colors move. The `name` strings are what HeroView matches on and must not change.)
  //
  // The GLBs currently committed under apps/mobile/assets/heroes still carry the previous Nocturne
  // bake — nothing in apps/mobile/src references that directory any more (the app renders the
  // apps/mobile/assets/characters families instead), so the repalette was applied here and the
  // binaries were deliberately left alone rather than churned. Re-run assets:generate before these
  // procedural heroes are ever put back on screen.
  const materials = {
    skin: mat('HeroSkin', '#9AA3B0', .1), suit: mat('HeroSuit', '#1E2633', .22),
    boot: mat('HeroBoot', '#12171F', .1), trim: mat('HeroTrim', '#E2E9F2', .3),
    coral: mat('HeroCoral', '#FF6B3D'), gold: mat('HeroGold', '#5EEAD4', .3),
    visor: mat('HeroVisor', '#8FB4FF', .2).setEmissiveFactor([.10,.16,.34])
  };
  const geometries = {
    sphere: new SphereGeometry(1, 16, 12), box: new BoxGeometry(2, 2, 2),
    torso: new CylinderGeometry(.91, .60, 2, 14, 1),
    cone: new CylinderGeometry(0, 1, 2, 8)
  };
  const meshCache = new Map();
  function meshFor(shape, material) {
    const key = shape + material;
    if (meshCache.has(key)) return meshCache.get(key);
    const g = geometries[shape];
    const primitive = doc.createPrimitive().setMaterial(materials[material]);
    for (const [name, semantic] of [['position','POSITION'], ['normal','NORMAL']]) {
      primitive.setAttribute(semantic, doc.createAccessor(key + name).setType(Accessor.Type.VEC3)
        .setArray(new Float32Array(g.attributes[name].array)).setBuffer(buffer));
    }
    if (g.index) primitive.setIndices(doc.createAccessor(key + 'indices').setType(Accessor.Type.SCALAR)
      .setArray(new Uint16Array(g.index.array)).setBuffer(buffer));
    const mesh = doc.createMesh(key).addPrimitive(primitive); meshCache.set(key, mesh); return mesh;
  }
  function part(parent, name, shape, material, pos, scale) {
    const n = doc.createNode(name).setMesh(meshFor(shape, material)).setTranslation(pos).setScale(scale);
    parent.addChild(n); return n;
  }
  function pivot(parent, name, pos, angle = 0) {
    const n = doc.createNode(name).setTranslation(pos).setRotation([0, 0, Math.sin(angle/2), Math.cos(angle/2)]);
    parent.addChild(n); return n;
  }
  part(hero, 'Torso', 'torso', 'skin', [0,1.92,0], [.48*bulk,.61,.34*bulk]);
  part(hero, 'Pelvis', 'sphere', 'suit', [0,1.36,0], [.34*bulk,.26,.29*bulk]);
  part(hero, 'Belt', 'box', 'boot', [0,1.51,.018], [.36*bulk,.065,.28*bulk]);
  part(hero, 'Buckle', 'box', 'gold', [0,1.51,.30*bulk], [.08,.06,.022]);
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'L' : 'R';
    part(hero, 'Pectoral_' + label, 'sphere', 'skin', [side*.215*bulk,2.16,.22*bulk], [.255*bulk,.25,.16*bulk]);
    part(hero, 'ChestTrim_' + label, 'box', 'trim', [side*.225*bulk,2.335,.26*bulk], [.19*bulk,.027,.025]);
    const shoulder = pivot(hero, 'Shoulder_' + label, [side*.51*bulk,2.21,0], side*.14);
    part(shoulder, 'Deltoid_' + label, 'sphere', 'skin', [0,-.02,0], [.23*bulk,.235,.22*bulk]);
    part(shoulder, 'ShoulderPlate_' + label, 'sphere', 'suit', [side*.055,.08,-.015], [.235*bulk,.115,.23*bulk]);
    part(shoulder, 'Bicep_' + label, 'sphere', 'skin', [0,-.265,0], [.178*bulk,.31,.19*bulk]);
    const elbow = pivot(shoulder, 'Elbow_' + label, [0,-.52,0]);
    part(elbow, 'Forearm_' + label, 'sphere', 'skin', [0,-.21,.025], [.158*bulk,.245,.17*bulk]);
    part(elbow, 'Glove_' + label, 'sphere', 'boot', [0,-.47,.035], [.175*bulk,.18,.18*bulk]);
    const wrist = pivot(elbow, 'Attachment_Wrist_' + label, [0,-.32,0]);
    part(wrist, 'Cosmetic_Bracer_' + label, 'box', 'coral', [0,0,0], [.185*bulk,.09,.19*bulk]);
    const hip = pivot(hero, 'Hip_' + label, [side*.205*bulk,1.27,0], side*.035);
    part(hip, 'Thigh_' + label, 'sphere', 'skin', [0,-.285,0], [.18*bulk,.33,.205*bulk]);
    const knee = pivot(hip, 'Knee_' + label, [0,-.57,.01]);
    part(knee, 'Shin_' + label, 'sphere', 'suit', [0,-.235,0], [.153*bulk,.285,.165*bulk]);
    part(knee, 'Kneecap_' + label, 'sphere', 'trim', [0,-.025,.15*bulk], [.125*bulk,.12,.045]);
    part(knee, 'Boot_' + label, 'sphere', 'boot', [0,-.51,.095], [.195*bulk,.13,.285*bulk]);
  }
  for (let row = 0; row < abs; row++) {
    const y = 2.03 - row * (.44 / Math.max(abs-1, 1));
    for (const side of [-1,1]) part(hero, `Abs_${row}_${side}`, 'sphere', 'skin', [side*.105*bulk,y,.293*bulk], [.101*bulk,.08,.09*bulk]);
  }
  part(hero, 'Neck', 'sphere', 'skin', [0,2.51,0], [.145,.18,.14]);
  const head = pivot(hero, 'Head', [0,2.79,.012]);
  part(head, 'Face', 'sphere', 'skin', [0,0,0], [.245,.285,.23]);
  part(head, 'Helmet', 'sphere', 'suit', [0,.10,-.017], [.267,.23,.25]);
  part(head, 'Brow', 'box', 'trim', [0,.052,.208], [.228,.035,.036]);
  part(head, 'Visor', 'box', 'visor', [0,-.014,.225], [.198,.043,.035]);
  part(head, 'Jaw', 'box', 'skin', [0,-.176,.10], [.16,.067,.135]);
  part(head, 'Mouth', 'box', 'boot', [0,-.135,.241], [.063,.013,.009]);
  part(head, 'Crest', 'box', 'coral', [0,.288,-.032], [.041,.115,.195]);
  pivot(head, 'Attachment_Head', [0,.34,0]);
  pivot(hero, 'Attachment_Back', [0,2.18,-.30*bulk]);
  if (stage === 'legendary') {
    for (const side of [-1,1]) {
      part(head, 'Crown_' + side, 'cone', 'gold', [side*.18,.335,-.03], [.07,.15,.07]);
      part(hero, 'LegendTrim_' + side, 'box', 'gold', [side*.28*bulk,2.335,.28*bulk], [.22*bulk,.025,.025]);
    }
  }
  const path = resolve(out, `${stage}.glb`);
  await new NodeIO().write(path, doc);
  const triangleCount = [...meshCache.values()].reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((n,p) => n + (p.getIndices()?.getCount() ?? 0)/3,0),0);
  manifest.push({ stage, file: `${stage}.glb`, bulk, stature, absPairs: abs, uniqueGeometryTriangles: triangleCount, generator: 'scripts/generate-heroes.mjs', license: 'Original VYRA procedural artwork' });
  console.log(`Generated ${stage}.glb`);
  Object.values(geometries).forEach(g=>g.dispose());
}
await writeFile(resolve(out,'manifest.json'), JSON.stringify(manifest,null,2)+'\n');
