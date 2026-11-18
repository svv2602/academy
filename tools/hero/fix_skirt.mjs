// Heroine (TECH-14), texture step after name_texture.mjs: the part of the child model that shows under the skirt
// (Idle seen from below, the run, the swim). Meshy left white smears on the inner thighs and white streaks at the back
// of the knees: they become plain skin.
// The dark briefs stay exactly as they are - the HAIR rule of src/game/hero.ts `region()` paints them in the hair
// colour of the look, so they never blend into the dress (the customer's choice, 2026-11-18). Nothing else of the
// texture changes, bit for bit.
//
//   node tools/hero/fix_skirt.mjs [in.glb=models-src/hero/child.glb] [out.glb=in.glb]
//
// Which texels:
//   1. triangles under the skirt: not dress (less than half of their texels in the DRESS colour range of `region()`),
//      driven mostly by thigh_l + thigh_r + pelvis (mean weight of the three corners > 0.5), centre above the knees
//      (the bind-pose height of calf_l / calf_r); and, in the band KNEE_BAND below the knees (the back of the knee,
//      above the socks), driven mostly by the bones of the legs;
//   2. their texels (texel centre inside the triangle in UV) plus the gutter around them: texels inside no triangle
//      at all, at most GUTTER texels away, nearer to these triangles than to any other (what bilinear filtering and
//      the mip levels bleed in);
//   3. kept: clean skin (`isSkin`) and every brown texel (`isBrown`: the briefs with their soft edge into the skin).
//      Every other texel of step 1 (the white smears, pale and grey seams, green specks) gets the skin colour: the
//      median of the clean skin of those triangles;
//   4. a gutter texel takes the colour of the nearest texel of step 3.
// The image is written back as PNG, so every other texel stays exactly as it decoded from the source. A second run
// finds nothing to paint and leaves the file as it is (no write when nothing changed and in === out).
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT, SRC_DIR, createIO } from '../assets.mjs';

/** Bones of the thighs and the hips: a triangle mostly driven by them is a leg under the skirt (or the crotch). */
export const HIP_BONES = ['thigh_l', 'thigh_r', 'pelvis'];
export const KNEE_BONES = ['calf_l', 'calf_r'];
/** Bones of the legs: the band just below the knees (the back of the knee) is chosen on them. */
export const LEG_BONES = ['thigh_l', 'thigh_r', 'calf_l', 'calf_r'];
/**
 * Height of that band below the knee joints, in model units (the model is 1.2 tall). On the child model the white
 * streaks at the back of the knee lie at 0.20-0.23 and the socks with their ragged top end at 0.20 (seen on the model
 * with each height painted its own colour), so the band stops where the socks begin.
 */
export const KNEE_BAND = 0.03;
/** Texels of gutter painted around the chosen triangles. */
export const GUTTER = 8;
/** HSL of an sRGB byte triple, h in [0, 1). */
export function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
/** The DRESS range of `region()` in src/game/hero.ts. */
export const isDress = (r, g, b) => { const [h, s, l] = hsl(r, g, b); return h > 0.17 && h < 0.45 && s > 0.15 && l > 0.3; };
/** The HAIR range of `region()` in src/game/hero.ts. */
export const isHair = (r, g, b) => { const [h, s, l] = hsl(r, g, b); return l < 0.36 && (h < 0.12 || h > 0.95) && !(l < 0.12 && s < 0.2); };
/** Brown of the briefs and its soft edge into the skin. */
export const isBrown = (r, g, b) => { const [h, s, l] = hsl(r, g, b); return (h < 0.12 || h > 0.95) && s > 0.15 && l < 0.74; };
/**
 * Clean skin of the thighs of this texture: saturated light peach. The thighs have it in 90% of their texels
 * (h 0.042-0.054, s 0.79-1, l 0.78-0.82 for 5-95%); greyish or pale texels there are the seams of the brown patch
 * and the smears, and are painted.
 */
export function isSkin(r, g, b) {
  const [h, s, l] = hsl(r, g, b);
  return h >= 0.03 && h <= 0.07 && s >= 0.75 && l >= 0.74 && l <= 0.84;
}

/** Calls fn(x, y) for every texel whose centre lies inside the triangle (u, v in texels). */
function raster(u, v, fn) {
  const area = (u[1] - u[0]) * (v[2] - v[0]) - (u[2] - u[0]) * (v[1] - v[0]);
  if (area === 0) return;
  const x0 = Math.floor(Math.min(...u)), x1 = Math.ceil(Math.max(...u)), y0 = Math.floor(Math.min(...v)), y1 = Math.ceil(Math.max(...v));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w0 = ((u[1] - px) * (v[2] - py) - (u[2] - px) * (v[1] - py)) / area;
    const w1 = ((u[2] - px) * (v[0] - py) - (u[0] - px) * (v[2] - py)) / area;
    if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
    fn(x, y);
  }
}

/**
 * The texels to consider: mask 1 - inside a chosen triangle, 2 - gutter next to one, 0 - not ours; owner - the
 * triangle of each covered texel (-1 for none).
 * mesh: { position, uv, joints, weights, index, jointNames, kneeY }; image: { width, height, channels, data }.
 */
export function chooseTexels(mesh, image) {
  const { position: P, uv: UV, joints: J, weights: Wt, index: I, jointNames, kneeY } = mesh;
  const { width: W, height: H, channels: C, data } = image;
  const hip = new Set(HIP_BONES.map((n) => jointNames.indexOf(n)).filter((i) => i >= 0));
  const leg = new Set(LEG_BONES.map((n) => jointNames.indexOf(n)).filter((i) => i >= 0));
  const owner = new Int32Array(W * H).fill(-1);             // triangle of each texel (UVs of this model do not overlap)
  const chosen = new Uint8Array(I.length / 3);
  const at = (v, i) => Math.min(i ? H - 1 : W - 1, Math.max(0, i ? UV[2 * v + 1] * H : UV[2 * v] * W));
  for (let t = 0; t < I.length / 3; t++) {
    const vs = [I[3 * t], I[3 * t + 1], I[3 * t + 2]];
    const texels = [];
    raster(vs.map((v) => UV[2 * v] * W), vs.map((v) => UV[2 * v + 1] * H), (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      texels.push(y * W + x);
    });
    if (!texels.length) { const o = Math.floor(at(vs[0], 1)) * W + Math.floor(at(vs[0], 0)); texels.push(o); }  // a sliver: its corner texel
    for (const o of texels) if (owner[o] < 0) owner[o] = t;
    let hipW = 0, legW = 0;
    for (const v of vs) for (let k = 0; k < 4; k++) { if (hip.has(J[4 * v + k])) hipW += Wt[4 * v + k]; if (leg.has(J[4 * v + k])) legW += Wt[4 * v + k]; }
    const cy = (P[3 * vs[0] + 1] + P[3 * vs[1] + 1] + P[3 * vs[2] + 1]) / 3;
    const thigh = cy > kneeY && hipW / 3 > 0.5;
    const knee = cy > kneeY - KNEE_BAND && cy <= kneeY && legW / 3 > 0.5;
    if (!thigh && !knee) continue;
    let dress = 0; for (const o of texels) if (isDress(data[C * o], data[C * o + 1], data[C * o + 2])) dress++;
    if (dress * 2 < texels.length) chosen[t] = 1;
  }
  const mask = new Uint8Array(W * H);
  for (let o = 0; o < W * H; o++) if (owner[o] >= 0 && chosen[owner[o]]) mask[o] = 1;
  // Gutter: a breadth-first walk from every covered texel over uncovered ones; the nearest triangle decides, and a
  // texel as near to another triangle as to ours stays as it is.
  const side = new Int8Array(W * H).fill(-1);               // -1 not reached, 0 nearest is another triangle, 1 ours
  const dist = new Uint8Array(W * H);
  let front = [];
  for (let o = 0; o < W * H; o++) if (owner[o] >= 0) { side[o] = mask[o]; front.push(o); }
  for (let d = 1; d <= GUTTER; d++) {
    const next = [];
    for (const o of front) {
      const x = o % W, y = (o - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (side[n] < 0) { side[n] = side[o]; dist[n] = d; next.push(n); } else if (dist[n] === d && side[o] === 0) side[n] = 0;
      }
    }
    front = next;
  }
  for (let o = 0; o < W * H; o++) if (owner[o] < 0 && side[o] === 1) mask[o] = 2;
  return { mask, owner, triangles: chosen.reduce((s, c) => s + c, 0) };
}

/**
 * Paints the chosen texels (step 3 of the header) and their gutter (step 4) in place.
 * Returns { changed, skin: K, briefs: the kept brown texels }.
 */
export function paint(image, mask) {
  const { width: W, height: H, channels: C, data } = image;
  const px = (o) => [data[C * o], data[C * o + 1], data[C * o + 2]];
  const good = [[], [], []];
  for (let o = 0; o < W * H; o++) {
    if (mask[o] !== 1) continue;
    const c = px(o);
    if (isSkin(...c)) for (let k = 0; k < 3; k++) good[k].push(c[k]);
  }
  if (!good[0].length) throw new Error('fix_skirt: no skin texel among the chosen triangles to paint with');
  const K = good.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
  if (!isSkin(...K)) throw new Error(`fix_skirt: the median skin ${K} is not skin`);
  let changed = 0, briefs = 0;
  const set = (o, c) => { if (c.some((v, k) => v !== data[C * o + k])) { for (let k = 0; k < 3; k++) data[C * o + k] = c[k]; changed++; } };
  for (let o = 0; o < W * H; o++) {
    if (mask[o] !== 1) continue;
    const c = px(o);
    if (isSkin(...c)) continue;
    if (isBrown(...c)) { briefs++; continue; }
    set(o, K);
  }
  // gutter: the colour of the nearest chosen texel (breadth-first, in scan order)
  const done = new Uint8Array(W * H); let front = [];
  for (let o = 0; o < W * H; o++) if (mask[o] === 1) { done[o] = 1; front.push(o); }
  while (front.length) {
    const next = [];
    for (const o of front) {
      const x = o % W, y = (o - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (mask[n] !== 2 || done[n]) continue;
        done[n] = 1; set(n, px(o)); next.push(n);
      }
    }
    front = next;
  }
  return { changed, skin: K, briefs };
}

/** The arrays of the one skinned primitive of the child model and the height of its knees in the bind pose. */
export function meshOf(doc) {
  const root = doc.getRoot();
  const prims = root.listMeshes().flatMap((m) => m.listPrimitives());
  if (prims.length !== 1) throw new Error(`fix_skirt: expected one primitive, found ${prims.length}`);
  const [p] = prims, skin = root.listSkins()[0];
  const joints = skin.listJoints(), ibm = skin.getInverseBindMatrices().getArray();
  const jointNames = joints.map((j) => j.getName());
  // The joint's bind position is the translation of the inverse of its inverse bind matrix [A | b]: -A^-1 b.
  const yOf = (i) => {
    const m = ibm.subarray(16 * i, 16 * i + 16), a = (r, c) => m[4 * c + r];   // column-major
    const det = a(0, 0) * (a(1, 1) * a(2, 2) - a(1, 2) * a(2, 1)) - a(0, 1) * (a(1, 0) * a(2, 2) - a(1, 2) * a(2, 0)) + a(0, 2) * (a(1, 0) * a(2, 1) - a(1, 1) * a(2, 0));
    // row y of A^-1 (cofactors of column 1 of A), times b
    const r0 = -(a(1, 0) * a(2, 2) - a(1, 2) * a(2, 0)), r1 = a(0, 0) * a(2, 2) - a(0, 2) * a(2, 0), r2 = -(a(0, 0) * a(1, 2) - a(0, 2) * a(1, 0));
    return -(r0 * m[12] + r1 * m[13] + r2 * m[14]) / det;
  };
  const knees = KNEE_BONES.map((n) => jointNames.indexOf(n));
  if (knees.some((i) => i < 0)) throw new Error(`fix_skirt: the skin has no ${KNEE_BONES.join(' / ')}`);
  return {
    position: p.getAttribute('POSITION').getArray(), uv: p.getAttribute('TEXCOORD_0').getArray(),
    joints: p.getAttribute('JOINTS_0').getArray(), weights: p.getAttribute('WEIGHTS_0').getArray(),
    index: p.getIndices().getArray(), jointNames, kneeY: Math.max(...knees.map(yOf)),
    texture: p.getMaterial().getBaseColorTexture(),
  };
}

/** Fixes a document in place. Returns what was done; the texture is replaced only if a texel changed. */
export async function fixDocument(doc) {
  const mesh = meshOf(doc);
  if (!mesh.texture) throw new Error('fix_skirt: the material has no base colour texture');
  const { data, info } = await sharp(Buffer.from(mesh.texture.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const image = { width: info.width, height: info.height, channels: info.channels, data };
  const { mask, triangles } = chooseTexels(mesh, image);
  const { changed, skin, briefs } = paint(image, mask);
  let inside = 0, gutter = 0, dress = 0;
  for (let o = 0; o < mask.length; o++) {
    if (!mask[o]) continue;
    if (mask[o] === 1) inside++; else gutter++;
    const c = [data[3 * o], data[3 * o + 1], data[3 * o + 2]];
    if (isDress(...c)) dress++;
  }
  if (changed) {
    const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    mesh.texture.setImage(new Uint8Array(png)).setMimeType('image/png');
  }
  return { triangles, inside, gutter, changed, skin, briefs, dress, total: info.width * info.height, kneeY: mesh.kneeY };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [src = join(ROOT, SRC_DIR, 'hero/child.glb'), dest = src] = process.argv.slice(2);
  const io = await createIO();
  const doc = await io.read(src);
  const r = await fixDocument(doc);
  console.log(`${src}: knees at ${r.kneeY.toFixed(3)}, ${r.triangles} triangles under the skirt, ${r.inside} texels in them + ${r.gutter} of gutter; `
    + `briefs kept: ${r.briefs} texels; ${r.changed} painted rgb(${r.skin}) or gutter (${(100 * r.changed / r.total).toFixed(3)}% of ${r.total}); in DRESS of region(): ${r.dress}`);
  if (r.dress) throw new Error(`${src}: ${r.dress} texels under the skirt fall into DRESS of region() in src/game/hero.ts`);
  if (r.changed) await io.write(dest, doc);
  else if (dest !== src) copyFileSync(src, dest);
  console.log(r.changed ? `${dest}: written` : `${dest}: nothing to paint, unchanged`);
}
