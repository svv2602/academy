// Packs the clips a world brings for the heroine (her "world clips": the swimming of a water world) from the Universal
// Animation Library into one small GLB in the folder of that world - clips only, no mesh, no skin.
//   node tools/pack_world_clips.mjs <UAL1.glb> <out.glb> <clip> [<clip>...]
// e.g. node tools/pack_world_clips.mjs ~/ual/UAL1.glb worlds-test/probe/models/probe/swim.glb Swim_Fwd_Loop Swim_Idle_Loop
// The clips are cut exactly as tools/pack_hero.mjs cuts the shared hero/anims.glb (its end: rotations of every bone but
// the fingers, the translation of the pelvis only, resample, prune, dedup), then compressed the way `npm run assets`
// compresses the core's models (packModel of tools/assets.mjs: EXT_meshopt_compression, lossless). The game reads the
// file with src/game/hero.ts `worldClips` (the pelvis scaled to the heroine, as for the shared clips).
// UAL1.glb is CC0 1.0 (Quaternius, see CREDITS.md: the public mirror the heroine's clips were taken from); it is never
// put into the repository - only what this script writes is.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample } from '@gltf-transform/functions';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createIO, packModel } from './assets.mjs';

/** Cuts `keep` out of the UAL document `doc` in place, as tools/pack_hero.mjs does for hero/anims.glb. */
export async function cutClips(doc, keep) {
  const all = doc.getRoot().listAnimations().map((a) => a.getName());
  for (const name of keep) if (!all.includes(name)) throw new Error(`no clip "${name}" in the source (it has ${all.length} clips)`);
  for (const a of doc.getRoot().listAnimations()) {
    if (keep.includes(a.getName())) continue;
    for (const smp of a.listSamplers()) smp.dispose();
    for (const ch of a.listChannels()) ch.dispose();
    a.dispose();
  }
  for (const n of doc.getRoot().listNodes()) { if (n.getMesh()) { n.setMesh(null); n.setSkin(null); } }
  for (const s of doc.getRoot().listSkins()) s.dispose();
  // Keep rotations only (plus the hip translation that carries the bounce); fingers stay in their rest pose.
  for (const a of doc.getRoot().listAnimations()) for (const ch of a.listChannels()) {
    const bone = ch.getTargetNode()?.getName() ?? '', path = ch.getTargetPath();
    const finger = /^(index|middle|ring|pinky|thumb)_/.test(bone);
    if (finger || path === 'scale' || (path === 'translation' && bone !== 'pelvis')) { ch.getSampler()?.dispose(); ch.dispose(); }
  }
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
  // Samplers of the removed clips leave their keyframe data behind; drop every accessor nothing points at.
  for (const acc of doc.getRoot().listAccessors()) if (acc.listParents().length <= 1) acc.dispose();
  return doc;
}

async function main() {
  const [src, out, ...keep] = process.argv.slice(2);
  if (!src || !out || !keep.length) {
    console.error('Usage: node tools/pack_world_clips.mjs <UAL1.glb> <out.glb> <clip> [<clip>...]');
    process.exit(2);
  }
  const doc = await cutClips(await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(src), keep);
  // packModel reads its source from a folder: the cut clips go through a temporary one.
  const tmp = mkdtempSync(join(tmpdir(), 'world-clips-'));
  try {
    await new NodeIO().registerExtensions(ALL_EXTENSIONS).write(join(tmp, 'clips.glb'), doc);
    const bytes = (await packModel(await createIO(), 'clips.glb', new Map(), tmp)).get('clips.glb');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bytes);
    console.log(`${out}: ${bytes.length} bytes`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  for (const a of doc.getRoot().listAnimations()) {
    let dur = 0;
    for (const s of a.listSamplers()) { const t = s.getInput().getArray(); dur = Math.max(dur, t[t.length - 1]); }
    console.log(`${a.getName().padEnd(20)} ${dur.toFixed(3)} s  ${a.listChannels().length} channels`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
