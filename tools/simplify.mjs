// node tools/simplify.mjs [--check] : the models the game draws with fewer triangles than their kit gives (TECH-06,
// docs/perf.md «Треугольники у грибного короля»), written into models-src/ as sources: npm run assets then ships
// them as it ships every source, losslessly (tools/assets.test.mjs compares the shipped file with this one).
//
// Each row of SIMPLIFIED: the kit's model `from` (models-src/), the file `to` (models-src/; the same path - the kit's
// model is replaced, it is the conversion's output and is made again by its tool), the attributes kept, and the
// meshoptimizer simplification (`ratio` of the triangles aimed at, `error` the largest deviation allowed, a share of
// the model's size). A model written here carries `asset.extras.simplified`; a source that carries it already is not
// simplified twice (a row whose `from` is its `to` reads the kit's model again only after its tool wrote it anew).
//   --check: write nothing, fail if a row's output is missing or not marked.
import { simplify, weld, dequantize, normals, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SRC_DIR, createIO, readGlb, writeGlb } from './assets.mjs';

export const SIMPLIFIED = [
  // the stepping stones of the first world's path (9 cm high, ~1000 triangles each): only the fairy world takes them;
  // tools/usd2glb.py writes the kit's model (RockPathRoundSmall_N), this then simplifies it in place
  ...[1, 2, 3].map((n) => ({ from: `nature2/RockPathRoundSmall${n}.glb`, to: `nature2/RockPathRoundSmall${n}.glb`, keep: ['POSITION', 'TEXCOORD_0'], ratio: 0.25, error: 0.01, smooth: true })),
  // the far ring of the first world (64-120 m away, in the fog, flat colours): copies of their own - the hub and the
  // forest draw the kit's trees near; no normals kept, src/core/assets.ts staticGeo gives every face its own (flat). Not
  // the spruce: the core would then ship the kit's PineTree_1 for the forest alone, which loads the core's models only
  ...['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4'].map((n) => ({ from: `nature_pack/${n}.glb`, to: `nature_pack/${n}_far.glb`, keep: ['POSITION'], ratio: 0.35, error: 0.01, smooth: false })),
];

const triangles = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
const marked = (doc) => !!doc.getRoot().getAsset().extras?.simplified;

async function main() {
  const check = process.argv.includes('--check');
  await MeshoptSimplifier.ready;
  const io = await createIO();
  let bad = 0;
  for (const row of SIMPLIFIED) {
    const to = join(ROOT, SRC_DIR, row.to);
    if (check) {
      if (!existsSync(to) || !marked(await io.read(to))) { console.log(`not simplified: ${row.to}`); bad++; }
      continue;
    }
    const doc = await io.read(join(ROOT, SRC_DIR, row.from));
    doc.setLogger({ debug() {}, info() {}, warn: console.warn, error: console.error });
    if (marked(doc)) { console.log(`${row.from}: simplified already, kept`); continue; }
    const before = triangles(doc);
    const drop = (d) => { for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) for (const s of p.listSemantics()) if (!row.keep.includes(s)) p.setAttribute(s, null); };
    // the textures stay files beside it, referenced as the kit's model references them (tools/usd2glb.py): the .glb
    // would else carry its image inside
    const uris = doc.getRoot().listTextures().map((t) => { const uri = t.getURI(); t.setImage(null); return uri; });
    await doc.transform(dequantize(), drop, weld(), simplify({ simplifier: MeshoptSimplifier, ratio: row.ratio, error: row.error }), ...(row.smooth ? [normals({ overwrite: true })] : []), prune({ propertyTypes: ['Accessor'] }));
    const asset = doc.getRoot().getAsset();
    asset.extras = { ...(asset.extras ?? {}), simplified: { from: row.from, ratio: row.ratio, error: row.error, triangles: before, tool: 'tools/simplify.mjs' } };
    const { json, bin } = readGlb(await io.writeBinary(doc));
    (json.images ?? []).forEach((image, i) => { delete image.bufferView; delete image.mimeType; image.uri = uris[i]; });
    writeFileSync(to, writeGlb(json, bin));
    console.log(`${row.from} -> ${row.to}: ${before} -> ${triangles(doc)} triangles`);
  }
  if (bad) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
