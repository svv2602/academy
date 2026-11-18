// Runs in `npm test`. tools/hero/fix_skirt.mjs on a small synthetic skinned model (seven triangles, a 64² texture), and
// the guard that the child model in models-src/ is already fixed (a second run of the script paints nothing).
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { Document } from '@gltf-transform/core';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ROOT, SRC_DIR, createIO } from '../assets.mjs';
import { fixDocument, isBrown, isDress, isHair, isSkin, meshOf } from './fix_skirt.mjs';

const N = 64;
const SKIN = [253, 186, 159], WHITE = [250, 245, 245], BROWN = [80, 40, 20], GREEN = [170, 220, 140], GREY = [120, 120, 120];
// Triangles in the quadrants of the texture: [bone, height of the centre, quadrant x, quadrant y, half]. The lower-left
// half of a quadrant is (1,1) (1,31) (31,31); the upper-right one (3,1) (31,1) (31,29). The rest is gutter.
const TRIS = [
  ['thigh_l', 0.4, 0, 0, 'low'],    // under the skirt: skin, a white smear (-> skin), the brown briefs (stay)
  ['calf_l', 0.1, 1, 0, 'low'],     // below the knee (a sock): white, stays
  ['thigh_r', 0.4, 0, 1, 'low'],    // a thigh triangle of the dress: green, stays
  ['Head', 1.0, 1, 1, 'low'],       // hair: brown, stays
  ['thigh_r', 0.4, 1, 1, 'high'],   // under the skirt: skin with a brown speck of 2 texels (stays: brown is never painted)
  ['calf_l', 0.195, 1, 0, 'high'],  // the back of the knee (in KNEE_BAND below the knee): skin with a white streak (-> skin)
  ['calf_r', 0.16, 0, 1, 'high'],   // just below that band: the white top of a sock, stays
];
const BONES = ['root', 'pelvis', 'thigh_l', 'calf_l', 'thigh_r', 'calf_r', 'Head'];
const KNEE = 0.2;

const inside = (x, y, qx, qy, half = 'low') => {
  const lx = x - qx * 32 + 0.5, ly = y - qy * 32 + 0.5;
  return half === 'low' ? lx >= 1 && ly <= 31 && ly >= lx : lx <= 31 && ly >= 1 && ly <= lx - 2;
};
const BRIEFS = (x, y) => x > 12 && x < 18 && y > 14;                          // in quadrant (0,0)
const SMEAR = (x, y) => x < 8 && y > 20;
const SPECK = (x, y) => (x === 60 && y === 40) || (x === 61 && y === 40);   // in the upper-right triangle of (1,1)
const STREAK = (x, y) => x > 55 && y < 12;                                    // in the upper-right triangle of (1,0)
function texture() {
  const d = Buffer.alloc(N * N * 3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const qx = x >> 5, qy = y >> 5;
    let c;
    if (qx === 0 && qy === 0) c = x > y + 2 ? GREY : SMEAR(x, y) ? WHITE : BRIEFS(x, y) ? BROWN : SKIN;
    else if (qx === 1 && qy === 0) c = inside(x, y, 1, 0, 'high') ? (STREAK(x, y) ? WHITE : SKIN) : WHITE;
    else if (qx === 0 && qy === 1) c = inside(x, y, 0, 1, 'high') ? WHITE : GREEN;
    else c = inside(x, y, 1, 1, 'high') ? (SPECK(x, y) ? BROWN : SKIN) : BROWN;
    d.set(c, 3 * (y * N + x));
  }
  return d;
}
const corners = (qx, qy, half) => (half === 'low' ? [[1, 1], [1, 31], [31, 31]] : [[3, 1], [31, 1], [31, 29]]).map(([u, v]) => [qx * 32 + u, qy * 32 + v]);

async function model() {
  const doc = new Document(), buf = doc.createBuffer();
  const pos = [], uv = [], joints = [], weights = [];
  TRIS.forEach(([bone, h, qx, qy, half], t) => {
    for (const [u, v] of corners(qx, qy, half)) {
      pos.push(t, h + (v - qy * 32 - 16) * 0.001, u * 0.001); uv.push(u / N, v / N);
      joints.push(BONES.indexOf(bone), 0, 0, 0); weights.push(1, 0, 0, 0);
    }
  });
  const acc = (type, arr, ctor) => doc.createAccessor().setType(type).setArray(new ctor(arr)).setBuffer(buf);
  const png = await sharp(texture(), { raw: { width: N, height: N, channels: 3 } }).png().toBuffer();
  const tex = doc.createTexture('T_Test').setImage(new Uint8Array(png)).setMimeType('image/png');
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', pos, Float32Array)).setAttribute('TEXCOORD_0', acc('VEC2', uv, Float32Array))
    .setAttribute('JOINTS_0', acc('VEC4', joints, Uint16Array)).setAttribute('WEIGHTS_0', acc('VEC4', weights, Float32Array))
    .setIndices(acc('SCALAR', [...Array(TRIS.length * 3).keys()], Uint16Array))
    .setMaterial(doc.createMaterial().setBaseColorTexture(tex));
  // joints straight above the origin; the inverse bind matrix of a joint at height y is a translation by -y
  const heights = { root: 0, pelvis: 0.5, thigh_l: 0.5, calf_l: KNEE, thigh_r: 0.5, calf_r: KNEE - 0.05, Head: 1 };
  const nodes = BONES.map((b) => doc.createNode(b).setTranslation([0, heights[b], 0]));
  const ibm = BONES.flatMap((b) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -heights[b], 0, 1]);
  const skin = doc.createSkin().setInverseBindMatrices(acc('MAT4', ibm, Float32Array));
  for (const n of nodes) skin.addJoint(n);
  const mesh = doc.createNode('m').setMesh(doc.createMesh().addPrimitive(prim)).setSkin(skin);
  doc.createScene().addChild(mesh).addChild(nodes[0]);
  return doc;
}
const pixels = async (doc) => (await sharp(Buffer.from(meshOf(doc).texture.getImage())).raw().toBuffer());
const at = (d, x, y) => [...d.subarray(3 * (y * N + x), 3 * (y * N + x) + 3)];

describe('tools/hero/fix_skirt.mjs on a synthetic model', () => {
  it('reads the knee height from the inverse bind matrices (the higher knee)', async () => {
    expect(meshOf(await model()).kneeY).toBeCloseTo(KNEE, 5);
  });

  it('the colour tests agree with the synthetic colours', () => {
    expect(isSkin(...SKIN)).toBe(true);
    for (const c of [WHITE, BROWN, GREEN, GREY]) expect(isSkin(...c), String(c)).toBe(false);
    expect(isDress(...GREEN)).toBe(true);
    expect(isHair(...BROWN)).toBe(true);
    expect(isBrown(...BROWN)).toBe(true);
    for (const c of [SKIN, WHITE, GREEN, GREY]) expect(isBrown(...c), String(c)).toBe(false);
    expect(isDress(...SKIN) || isHair(...SKIN), 'the skin colour is in no region of the look').toBe(false);
  });

  it('the smear becomes skin, the briefs and every other triangle stay bit for bit', async () => {
    const doc = await model(), before = texture();
    const r = await fixDocument(doc);
    const after = await pixels(doc);
    expect(r.triangles).toBe(3);
    expect(r.skin).toEqual(SKIN);
    expect(r.dress).toBe(0);
    let changed = 0, briefs = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const was = at(before, x, y), now = at(after, x, y), same = String(was) === String(now);
      if (!same) changed++;
      if (inside(x, y, 0, 0)) {
        if (BRIEFS(x, y)) { briefs++; expect(now, `texel ${x},${y} of the briefs`).toEqual(BROWN); } else expect(now, `texel ${x},${y} of the thigh`).toEqual(SKIN);
      } else if (inside(x, y, 1, 1, 'high')) { if (SPECK(x, y)) briefs++; expect(same, `texel ${x},${y} of the thigh with a speck`).toBe(true); }
      else if (inside(x, y, 1, 0, 'high')) expect(now, `texel ${x},${y} of the back of the knee`).toEqual(SKIN);
      else if (inside(x, y, 0, 1, 'high')) expect(same, `texel ${x},${y} of the sock below the knee band`).toBe(true);
      else if (inside(x, y, 1, 0) || inside(x, y, 0, 1) || inside(x, y, 1, 1)) expect(same, `texel ${x},${y} of another triangle`).toBe(true);
    }
    expect(changed).toBe(r.changed);
    expect(r.briefs).toBe(briefs);
    // gutter: next to the thigh triangle it takes the nearest colour, far from it it is kept
    expect(at(after, 6, 2)).toEqual(SKIN);
    expect(at(after, 18, 15)).toEqual(BROWN);          // just right of the briefs, outside the triangle
    expect(at(after, 30, 2)).toEqual(GREY);            // 3 texels from the sock triangle, much farther from the thigh
    expect(at(after, 20, 3)).toEqual(GREY);            // 17 texels from the thigh: beyond the gutter
    expect(STREAK(60, 3) && inside(60, 3, 1, 0, 'high') && String(at(before, 60, 3)) === String(WHITE)).toBe(true);
  });

  it('a second run paints nothing (the output does not change)', async () => {
    const io = await createIO(), doc = await model();
    await fixDocument(doc);
    const once = await io.writeBinary(doc);
    const again = await io.readBinary(once);
    const r = await fixDocument(again);
    expect(r.changed).toBe(0);
    expect(Buffer.from(await io.writeBinary(again)).equals(Buffer.from(once))).toBe(true);
  });
});

describe('models-src/hero/child.glb', () => {
  it('is already fixed: tools/hero/fix_skirt.mjs paints nothing (see tools/hero/README.md)', async () => {
    const r = await fixDocument(await (await createIO()).read(join(ROOT, SRC_DIR, 'hero/child.glb')));
    expect(r.triangles).toBeGreaterThan(500);
    expect(r.briefs, 'the briefs are there').toBeGreaterThan(10_000);
    expect(r.dress, 'texels under the skirt in DRESS of region()').toBe(0);
    expect(r.changed).toBe(0);
  }, 120_000);
});
