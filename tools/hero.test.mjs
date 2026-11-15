// Runs in `npm test`. Guards the packing of the child heroine (TECH-14, docs/15-tech.md): the model that
// tools/hero/ builds, packed in memory by the game's own pipeline (packModel of tools/assets.mjs), keeps the 65 UAL
// bones of the game's skeleton, stays within 25 000 triangles, ships its texture as WebP no larger than 1024², and
// every shipped file fits MAX_FILE. Nothing is written to disk.
// The source is the first that exists of models-src/hero/child.glb (once the game loads it) and
// models-unused/hero/child.glb (until then); with neither the test fails, it never skips.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_FILE, MAX_TEXTURE, ROOT, SRC_DIR, createIO, overBudget, packModel, readGlb, webpSize } from './assets.mjs';

const REL = 'hero/child.glb';
const CANDIDATES = [join(ROOT, SRC_DIR), join(ROOT, 'models-unused')];
const MAX_TRIANGLES = 25_000;
const FILE_LIMIT = MAX_FILE;
const TEXTURE = 'hero/tex/T_Child_BaseColor.webp';

/** Joint names of every skin of a parsed .glb, sorted. */
const skinBones = (json) => (json.skins ?? []).flatMap((s) => s.joints.map((i) => json.nodes[i].name)).sort();
const UAL = skinBones(readGlb(readFileSync(join(ROOT, SRC_DIR, 'hero/base.glb'))).json);

/** @type {Map<string, Buffer>} */
let files;
/** @type {any} */
let json;

beforeAll(async () => {
  const srcDir = CANDIDATES.find((d) => existsSync(join(d, REL)));
  if (!srcDir) throw new Error(`no ${REL} in ${CANDIDATES.join(' or ')}: see tools/hero/README.md`);
  files = await packModel(await createIO(), REL, new Map(), srcDir);
  json = readGlb(files.get(REL)).json;
}, 120_000);

describe('child heroine, packed by tools/assets.mjs', () => {
  it('has the 65 UAL bones of the game skeleton (models-src/hero/base.glb)', () => {
    expect(UAL.length, 'the reference skeleton models-src/hero/base.glb').toBe(65);
    expect(skinBones(json)).toEqual(UAL);
  });

  it(`has at most ${MAX_TRIANGLES} triangles`, () => {
    const prims = json.meshes.flatMap((m) => m.primitives);
    expect(prims.every((p) => (p.mode ?? 4) === 4), 'only triangle lists are counted').toBe(true);
    const triangles = prims.reduce((s, p) => s + (p.indices === undefined
      ? json.accessors[p.attributes.POSITION].count : json.accessors[p.indices].count) / 3, 0);
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(MAX_TRIANGLES);
  });

  it(`ships its texture as ${TEXTURE}, WebP no larger than ${MAX_TEXTURE}²`, () => {
    expect((json.images ?? []).map((i) => i.mimeType)).toEqual(['image/webp']);
    const textures = [...files.keys()].filter((p) => p !== REL);
    expect(textures).toEqual([TEXTURE]);
    for (const p of textures) {
      const [w, h] = webpSize(files.get(p));
      expect(Math.max(w, h), p).toBeLessThanOrEqual(MAX_TEXTURE);
    }
  });

  it('fits the size limit of one shipped file', () => {
    for (const [p, bytes] of files) expect(bytes.length, p).toBeLessThanOrEqual(FILE_LIMIT);
    expect(overBudget([...files].map(([path, b]) => ({ path, size: b.length })))).toEqual([]);
  });
});
