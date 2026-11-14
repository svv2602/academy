// Runs in `npm test`. Guards the asset budget of docs/15-tech.md (TECH-02) and the contract of tools/assets.mjs:
// public/models holds exactly what `npm run assets` makes from models-src/, every file and the whole directory fit
// the size limits, textures are WebP no larger than 1024, and compression loses nothing — the triangles, skins and
// animations the game reads are bit-identical to the sources.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  FIT, MAX_FILE, MAX_TEXTURE, MAX_TOTAL, OUT_DIR, ROOT, SRC_DIR,
  createIO, encodeTexture, listFiles, listSources, modelTextures, overBudget, readGlb, webpSize,
} from './assets.mjs';

const RUN = 'Run: npm run assets (rebuilds public/models from models-src), then commit both directories.';
const srcDir = join(ROOT, SRC_DIR), outDir = join(ROOT, OUT_DIR);
const sources = listSources(), shipped = listFiles(outDir);
const shippedGlb = shipped.filter((f) => f.endsWith('.glb'));
const json = new Map(shippedGlb.map((f) => [f, readGlb(readFileSync(join(outDir, f))).json]));

describe('public/models is the output of npm run assets', () => {
  it('has a compressed model for every source model and nothing without a source', () => {
    expect(sources.length, `${SRC_DIR}/ holds no .glb`).toBeGreaterThan(0);
    const missing = sources.filter((f) => !shippedGlb.includes(f));
    expect(missing, `${missing.length} source model(s) without a result in ${OUT_DIR}: ${missing.join(', ')}. ${RUN}`).toEqual([]);
    const orphans = shippedGlb.filter((f) => !sources.includes(f));
    expect(orphans, `${orphans.length} model(s) in ${OUT_DIR} without a source in ${SRC_DIR}: ${orphans.join(', ')}. `
      + `Put the source into ${SRC_DIR}/ (never edit ${OUT_DIR} by hand). ${RUN}`).toEqual([]);
  });

  it('ships exactly the textures its models reference, and no other file', () => {
    const referenced = new Set();
    for (const [f, j] of json) for (const image of j.images ?? []) referenced.add(posix.join(posix.dirname(f), image.uri ?? '?'));
    const missing = [...referenced].filter((p) => !shipped.includes(p)).sort();
    expect(missing, `texture(s) a model references but ${OUT_DIR} lacks: ${missing.join(', ')}. ${RUN}`).toEqual([]);
    const extra = shipped.filter((p) => !p.endsWith('.glb') && !referenced.has(p));
    expect(extra, `file(s) in ${OUT_DIR} no model references: ${extra.join(', ')}. ${RUN}`).toEqual([]);
  });

  it('holds only compressed models: meshopt geometry, no embedded images, WebP textures', () => {
    const bad = [];
    for (const [f, j] of json) {
      if (!(j.extensionsRequired ?? []).includes('EXT_meshopt_compression')) bad.push(`${f}: geometry is not meshopt-compressed`);
      if ((j.extensionsUsed ?? []).includes('KHR_mesh_quantization')) bad.push(`${f}: quantized attributes (src/core/assets.ts reads Float32 only)`);
      for (const image of j.images ?? []) {
        if (image.bufferView !== undefined) bad.push(`${f}: image "${image.name}" is embedded`);
        else if (!/^tex\/[\w-]+\.webp$/.test(image.uri ?? '')) bad.push(`${f}: image URI "${image.uri}" is not tex/<name>.webp`);
      }
    }
    expect(bad, `${bad.join('; ')}. ${RUN}`).toEqual([]);
  });
});

describe('asset budget (docs/15-tech.md)', () => {
  it(`keeps every file within ${MAX_FILE} bytes and public/models within ${MAX_TOTAL} bytes`, () => {
    const problems = overBudget(shipped.map((path) => ({ path, size: statSync(join(outDir, path)).size })));
    expect(problems, `${problems.join('; ')}. A file from ${SRC_DIR}/ copied as is? ${RUN}`).toEqual([]);
  });

  it(`keeps every texture within ${MAX_TEXTURE} pixels on its longest side`, () => {
    const textures = shipped.filter((f) => !f.endsWith('.glb'));
    const big = textures.map((f) => [f, webpSize(readFileSync(join(outDir, f)))]).filter(([, [w, h]]) => Math.max(w, h) > MAX_TEXTURE);
    expect(big.map(([f, size]) => `${f} ${size.join('x')}`), `texture(s) above ${MAX_TEXTURE} px. ${RUN}`).toEqual([]);
  });

  it('reports a file over the limit and a directory over the total', () => {
    expect(overBudget([{ path: 'a.glb', size: MAX_FILE }])).toEqual([]);
    expect(overBudget([{ path: 'a.glb', size: MAX_FILE + 1 }])).toHaveLength(1);
    const many = Array.from({ length: 10 }, (_, i) => ({ path: `${i}.glb`, size: MAX_TOTAL / 10 + 1 }));
    expect(overBudget(many).join()).toContain('in total');
  });
});

describe('encodeTexture', () => {
  const image = (width, height, channels, background) => sharp({ create: { width, height, channels, background } }).png().toBuffer();

  it('shrinks a larger image to 1024 on the longest side and keeps the proportions', async () => {
    expect(MAX_TEXTURE).toBe(1024);   // the requirement itself: "не больше 1024 по большей стороне"
    const out = await encodeTexture(await image(2048, 1536, 3, { r: 200, g: 120, b: 40 }));
    expect(webpSize(out)).toEqual([1024, 768]);
    expect(webpSize(await encodeTexture(await image(600, 2400, 3, { r: 9, g: 9, b: 9 })))).toEqual([256, 1024]);
  });

  it('keeps a normal map bit-exact (lossless) and still within the size limit', async () => {
    // Noise is the worst case for a lossy encoder; a normal map must come back texel for texel.
    const w = 96, h = 64, raw = Buffer.alloc(w * h * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919 + (i >> 3) * 104729) & 255;
    const out = await encodeTexture(await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(), 'normal');
    const back = await sharp(out).removeAlpha().raw().toBuffer();
    expect(back.equals(raw), 'a normal map changed in encoding').toBe(true);
    const lossy = await encodeTexture(await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(), 'color');
    expect((await sharp(lossy).removeAlpha().raw().toBuffer()).equals(raw), 'colour maps are expected to be lossy').toBe(false);
    expect(webpSize(await encodeTexture(await image(2048, 2048, 3, { r: 128, g: 128, b: 255 }), 'normal'))).toEqual([1024, 1024]);
  });

  it('never enlarges a small image', async () => {
    expect(webpSize(await encodeTexture(await image(64, 48, 3, { r: 1, g: 2, b: 3 })))).toEqual([64, 48]);
  });

  it('keeps the alpha channel exact and the colour under transparent texels', async () => {
    // Left half opaque red, right half fully transparent green. The hidden green stands for the "bleed" that stops
    // mip-mapping from pulling a dark or light fringe around leaf cut-outs; an encoder free to overwrite hidden
    // texels (the WebP default) replaces it, so the colours differ on purpose.
    const w = 64, h = 64, raw = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) raw.set(i % w < w / 2 ? [200, 40, 40, 255] : [60, 180, 70, 0], i * 4);
    const out = await encodeTexture(await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer());
    const back = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(back.info.channels).toBe(4);
    const px = (x, y) => [...back.data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];
    expect(px(5, 5)[3]).toBe(255);
    const hidden = px(w - 5, h / 2);
    expect(hidden[3]).toBe(0);
    for (const [k, want] of [60, 180, 70].entries()) expect(Math.abs(hidden[k] - want), `colour under alpha 0: ${hidden}`).toBeLessThan(12);
  });

  it('keeps the colour under transparent texels when it has to shrink the image', async () => {
    // The same picture four times larger than the limit: a resize that premultiplies by alpha turns the hidden green black.
    const w = 4096, h = 64, raw = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) raw.set(i % w < w / 2 ? [200, 40, 40, 255] : [60, 180, 70, 0], i * 4);
    const out = await encodeTexture(await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer());
    expect(webpSize(out)).toEqual([1024, 16]);
    const back = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(back.info.channels).toBe(4);
    const px = (x, y) => [...back.data.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4)];
    expect(px(100, 8)[3]).toBe(255);
    const hidden = px(900, 8);
    expect(hidden[3]).toBe(0);
    for (const [k, want] of [60, 180, 70].entries()) expect(Math.abs(hidden[k] - want), `colour under alpha 0 after a resize: ${hidden}`).toBeLessThan(12);
  });
});

// --- lossless check -------------------------------------------------------------------------------------------------

const sha = (parts) => { const h = createHash('sha1'); for (const p of parts) h.update(p); return h.digest('hex'); };
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

/** Hash of a primitive as a triangle soup: independent of vertex order, triangle order and welding. */
function soup(prim) {
  const attrs = prim.listSemantics().sort().map((s) => {
    const acc = prim.getAttribute(s), array = acc.getArray();
    return { data: bytes(array).toString('latin1'), size: acc.getElementSize() * array.BYTES_PER_ELEMENT, tag: `${s}:${acc.getComponentType()}:${acc.getNormalized()}` };
  });
  const corner = (v) => attrs.map((a) => a.data.substr(v * a.size, a.size)).join('');
  const index = prim.getIndices()?.getArray(), count = index ? index.length : prim.getAttribute('POSITION').getCount();
  const triangles = [];
  for (let i = 0; i < count; i += 3) {
    const k = [0, 1, 2].map((j) => corner(index ? index[i + j] : i + j));
    // The codec may rotate a triangle (never flip it): start every triangle from its smallest corner.
    const first = k[0] <= k[1] && k[0] <= k[2] ? 0 : k[1] <= k[2] ? 1 : 2;
    triangles.push(k[first] + k[(first + 1) % 3] + k[(first + 2) % 3]);
  }
  triangles.sort();
  return { triangles: triangles.length, hash: sha([attrs.map((a) => a.tag).join(), ...triangles.map((t) => Buffer.from(t, 'latin1'))]) };
}

/** Everything the game reads from a model, in a form that survives lossless compression only. */
function signature(doc) {
  const root = doc.getRoot();
  const array = (acc) => (acc ? `${acc.getType()}:${acc.getComponentType()}:${sha([bytes(acc.getArray())])}` : '-');
  // The one thing the glTF writer does change: a rest transform within 1e-5 of identity (a bone scale of 0.99999994)
  // is written as the default. Node transforms are therefore compared to 4 decimals; all buffer data stays exact.
  const near = (v) => v.map((x) => Math.round(x * 1e4) / 1e4 + 0);
  return {
    nodes: root.listNodes().map((n) => [n.getName(), near(n.getTranslation()), near(n.getRotation()), near(n.getScale()), n.getMesh()?.getName() ?? null,
      n.getSkin()?.getName() ?? null, n.listChildren().map((c) => c.getName())]),
    meshes: root.listMeshes().map((m) => [m.getName(), m.listPrimitives().map((p) => ({ material: p.getMaterial()?.getName() ?? null, ...soup(p) }))]),
    materials: root.listMaterials().map((m) => [m.getName(), m.getAlphaMode(), m.getAlphaCutoff(), m.getDoubleSided(), m.getBaseColorFactor(), m.getMetallicFactor(), m.getRoughnessFactor(),
      m.getBaseColorTexture()?.getName() ?? null, m.getNormalTexture()?.getName() ?? null]),
    skins: root.listSkins().map((s) => [s.getName(), s.listJoints().map((j) => j.getName()), array(s.getInverseBindMatrices())]),
    animations: root.listAnimations().map((a) => [a.getName(), a.listChannels().map((c) => {
      const s = c.getSampler();
      return [c.getTargetNode()?.getName() ?? null, c.getTargetPath(), s.getInterpolation(), array(s.getInput()), array(s.getOutput())].join(' ');
    }).sort()]),
  };
}

describe('compression is lossless', () => {
  it('keeps every triangle, skin, material and animation of every model bit-identical to its source', async () => {
    const io = await createIO(), changed = [];
    let triangles = 0;
    for (const f of sources.filter((s) => shippedGlb.includes(s))) {
      const before = signature(await io.read(join(srcDir, f))), after = signature(await io.read(join(outDir, f)));
      triangles += after.meshes.flatMap(([, prims]) => prims).reduce((n, p) => n + p.triangles, 0);
      for (const part of Object.keys(before)) if (JSON.stringify(before[part]) !== JSON.stringify(after[part])) changed.push(`${f}: ${part}`);
    }
    expect(changed, `${OUT_DIR} differs from ${SRC_DIR} in: ${changed.join(', ')}. Stale output or a lossy step in tools/assets.mjs. ${RUN}`).toEqual([]);
    expect(triangles).toBeGreaterThan(0);
  }, 120_000);
});

// The requirement is "no visible loss of quality": how far a shipped colour map may be from its source.
const MIN_PSNR = 38;          // dB over the visible texels; the first world measures 40.8-51.2
const MAX_HIDDEN_ERROR = 12;  // mean colour error under fully transparent texels (the edge bleed); measured 2.9-4.6

describe('textures keep their quality', () => {
  it(`ships every normal map bit-exact and every colour map within ${MIN_PSNR} dB of its source, alpha untouched`, async () => {
    const io = await createIO(), seen = new Set(), bad = [];
    const rgba = (input) => sharp(input).resize(FIT).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const f of sources) {
      for (const { texture, role, path } of modelTextures(await io.read(join(srcDir, f)), f)) {
        if (seen.has(path) || !shipped.includes(path)) continue;   // a missing file is reported by the tests above
        seen.add(path);
        const a = await rgba(texture.getImage()), b = await sharp(readFileSync(join(outDir, path))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        if (a.info.width !== b.info.width || a.info.height !== b.info.height) { bad.push(`${path}: ${b.info.width}x${b.info.height}, the source gives ${a.info.width}x${a.info.height}`); continue; }
        if (role === 'normal') { if (!a.data.equals(b.data)) bad.push(`${path}: a normal map must be lossless, it differs from its source`); continue; }
        let visible = 0, squares = 0, hidden = 0, hiddenError = 0, alpha = 0;
        for (let i = 0; i < a.data.length; i += 4) {
          const d0 = a.data[i] - b.data[i], d1 = a.data[i + 1] - b.data[i + 1], d2 = a.data[i + 2] - b.data[i + 2], e = d0 * d0 + d1 * d1 + d2 * d2;
          alpha = Math.max(alpha, Math.abs(a.data[i + 3] - b.data[i + 3]));
          if (a.data[i + 3] > 0) { visible += 3; squares += e; } else { hidden++; hiddenError += Math.sqrt(e / 3); }
        }
        const psnr = squares === 0 ? Infinity : 10 * Math.log10(255 * 255 / (squares / visible));
        if (alpha > 0) bad.push(`${path}: alpha channel differs from the source by up to ${alpha}`);
        if (psnr < MIN_PSNR) bad.push(`${path}: ${psnr.toFixed(1)} dB`);
        if (hidden && hiddenError / hidden > MAX_HIDDEN_ERROR) bad.push(`${path}: colour under transparent texels is off by ${(hiddenError / hidden).toFixed(1)} on average`);
      }
    }
    expect(bad, `${bad.join('; ')}. Stale output or a weaker setting in tools/assets.mjs. ${RUN}`).toEqual([]);
    expect(seen.size).toBeGreaterThan(0);
  }, 120_000);
});
