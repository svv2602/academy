// Packs the heroine from Quaternius CC0 sources into compact GLBs under models-src/hero/ (the sources of
// `npm run assets`, which compresses them into public/models/hero/).
//   node tools/pack_hero.mjs <src_dir>
// <src_dir> holds the original glTF files: Superhero_Female_FullBody, Female_Ranger, Hair_*, UAL1.glb and their
// textures (Universal Base Characters, Modular Character Outfits - Fantasy, Universal Animation Library).
// Drops what the game does not use (ORM/roughness maps, hood and pauldrons, 30+ combat animations, the
// mannequin mesh) so the whole character is a few MB instead of 20.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample } from '@gltf-transform/functions';

const src = process.argv[2], out = 'models-src/hero';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const KEEP_ANIMS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Jump_Loop', 'Jump_Land', 'Interact', 'Dance_Loop', 'Idle_Talking_Loop', 'Spell_Simple_Shoot'];

async function mesh(name, outName, drop = /$^/, keepNormal = true) {
  const doc = await io.read(`${src}/${name}.gltf`);
  for (const node of doc.getRoot().listNodes()) if (node.getMesh() && drop.test(node.getName())) node.dispose();
  for (const m of doc.getRoot().listMaterials()) {
    m.setMetallicRoughnessTexture(null).setOcclusionTexture(null).setMetallicFactor(0).setRoughnessFactor(0.8);
    if (!keepNormal) m.setNormalTexture(null);
  }
  await doc.transform(prune(), dedup());
  await io.write(`${out}/${outName}.glb`, doc);
  console.log(outName, doc.getRoot().listMeshes().length, 'meshes,', doc.getRoot().listTextures().map((t) => t.getURI() || t.getName()).join(' '));
}

await mesh('Superhero_Female_FullBody', 'base');
await mesh('Female_Ranger', 'ranger', /Hood|Pauldron/);
for (const h of ['Long', 'Buns', 'SimpleParted']) await mesh(`Hair_${h}`, `hair_${h.toLowerCase()}`, /$^/, false);

const anim = await io.read(`${src}/UAL1.glb`);
for (const a of anim.getRoot().listAnimations()) {
  if (KEEP_ANIMS.includes(a.getName())) continue;
  for (const smp of a.listSamplers()) smp.dispose();
  for (const ch of a.listChannels()) ch.dispose();
  a.dispose();
}
for (const n of anim.getRoot().listNodes()) { if (n.getMesh()) { n.setMesh(null); n.setSkin(null); } }
for (const s of anim.getRoot().listSkins()) s.dispose();
// Keep rotations only (plus the hip translation that carries the bounce); fingers stay in their rest pose.
for (const a of anim.getRoot().listAnimations()) for (const ch of a.listChannels()) {
  const bone = ch.getTargetNode()?.getName() ?? '', path = ch.getTargetPath();
  const finger = /^(index|middle|ring|pinky|thumb)_/.test(bone);
  if (finger || path === 'scale' || (path === 'translation' && bone !== 'pelvis')) { ch.getSampler()?.dispose(); ch.dispose(); }
}
await anim.transform(resample(), prune({ keepLeaves: true }), dedup());
// Samplers of the removed clips leave their keyframe data behind; drop every accessor nothing points at.
for (const acc of anim.getRoot().listAccessors()) if (acc.listParents().length <= 1) acc.dispose();
await io.write(`${out}/anims.glb`, anim);
console.log('anims', anim.getRoot().listAnimations().map((a) => a.getName()).join(' '));
