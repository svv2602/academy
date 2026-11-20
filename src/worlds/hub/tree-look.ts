import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gltf, staticGeo } from '../../core/assets';
import { fadeAtCamera, propMaterial } from '../../core/materials';
import { mulberry32 } from '../../core/util';
import { PORTALS, TREE, trunkR } from './layout';

/**
 * The look of the Great Tree (WORLD-01, docs/worlds/hub.md «Как Древо меняется», «Модели»): the grey trunk of two
 * cylinders and the crown of spheres (WORLD-12) become a trunk of noisy rings with six roots and its limbs, under a
 * crown of the leaf clusters of CommonTree_1..4 (nature_pack, already part of the installation through the first
 * world: no files of the hub's own, R31) blown up to clumps of metres. The footprint and the heights are the map's
 * (./layout.ts): the trunk keeps the radius `trunkR(y)` - the nests (NESTS) still sit on its surface - and is TREE.h
 * tall, the crown stands at TREE.crown and covers the glade to about 12 m from the trunk.
 *
 * Four discrete looks by the number of artifacts back (R33: «четыре дискретных облика, не непрерывная магия»), each
 * one the one before plus more:
 *   1 - a sparse crown of dull leaves (and the debug launch with no artifact at all);
 *   2 - flowers on the low branches, fireflies round the trunk;
 *   3 - a denser, greener crown; grass and mushrooms round the roots;
 *   4 - lantern fruits under the crown, birds on the low branches.
 * Five artifacts are the final (WORLD-06), not this file: until then they look as four. In every look, up close where
 * she stands by the roots: the bark of the MegaKit (T_BarkTwistedTree_D over the bark's colours, flat facets kept), a
 * hollow at a child's eyes between two arches (`treeHollow`), moss on the roots and the foot, a few mushrooms on the
 * roots, the mossy stump with a ring of softly glowing mushrooms (`STUMP`), butterflies and a handful of fireflies.
 *
 * The API, as the hub (./index.ts) uses it:
 *   `treeStage(artifacts)` - the look for a number of artifacts back (pure);
 *   `loadTreeLook()` - the models the look is made from (`TreeLoads`: the four crowns, a mushroom, the stump, the bark
 *     picture), in the hub's load;
 *   `buildTreeLook(scene, stage, loads, block)` - puts the tree of that look into the scene and the trunk's collider
 *     and the stump's colliders into the ground (`block`: `ground.block` of the hub); returns its `root` and
 *     `update(time)`, called from the frame's `animate`: the leaves sway, the fireflies drift and blink, the butterflies
 *     flit, the ring of mushrooms breathes, the lanterns glow, the birds peck.
 * The stage is read once, as the hub is built: a new artifact comes back in its world, so the hub is built anew for it.
 *
 * TECH-06, the S22: every repeated thing is one draw call (one merged geometry or one InstancedMesh), nothing is
 * allocated per frame, the lanterns, fireflies and mushrooms glow by their colour (no light of their own), only the
 * bark (with the stump) and the crown cast shadows. `lookCost` counts what a look draws; TREE_BUDGET is what stage 4 stays under (the test checks it).
 * The trunk and the crown dissolve at the lens (`fadeAtCamera`, src/core/materials.ts): the camera never shows a wall
 * of bark or leaves, and what stands between the camera and her is looked through.
 */

/** The look of the tree: 1..4 (./tree-look.ts header). */
export type TreeStage = 1 | 2 | 3 | 4;

/** The look for `artifacts` back: 0 (a debug launch) and 1 - the first; 5 and more - the fourth (the final is WORLD-06). */
export function treeStage(artifacts: number): TreeStage {
  if (!(artifacts >= 2)) return 1;
  return Math.min(4, Math.floor(artifacts)) as TreeStage;
}

/**
 * What the look is made from. `crowns`: leaf clusters, each non-indexed with position, normal and color, centred on
 * the origin and one metre in radius across x/z (`crownOf`); `mushroom`: one geometry standing on y = 0, 1 m tall;
 * `stump`: the mossy stump, vertex-coloured, standing on y = 0, STUMP.h tall; `bark`: the bark picture the trunk,
 * the roots and the limbs are drawn with (null: a test, the flat colours of the bark alone).
 */
export interface TreeLoads { crowns: THREE.BufferGeometry[]; mushroom: THREE.BufferGeometry; stump: THREE.BufferGeometry; bark: THREE.Texture | null }

/**
 * The models of the crown (their leaves only), the mushroom and the mossy stump of the fairy meadow (as its giant
 * mushrooms are coloured), and the bark of its TwistedTree1 (Stylized Nature MegaKit, T_BarkTwistedTree_D): all of
 * them the first world's, already in the installation.
 */
export async function loadTreeLook(): Promise<TreeLoads> {
  const [[t1, t2, t3, t4, mushroom, stump], twisted] = await Promise.all([
    Promise.all([
      ...[1, 2, 3, 4].map((i) => staticGeo(`nature_pack/CommonTree_${i}`, 7)),
      staticGeo('extra/mush1', 1, { LightRed: '#ff6f91', White: '#fff6e8' }),
      staticGeo('nature_pack/TreeStump_Moss', STUMP.h),
    ]),
    gltf('nature2/TwistedTree1'),
  ]);
  let bark: THREE.Texture | null = null;
  twisted.scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (mat && !Array.isArray(mat) && mat.map && /bark/i.test(mat.name)) bark = mat.map;
  });
  if (bark) {
    const t = bark as THREE.Texture;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  }
  return { crowns: [t1, t2, t3, t4].map(crownOf), mushroom, stump, bark };
}

/**
 * The leaves of a tree of `staticGeo` without its wood: the triangles whose colour is green over red (the storybook
 * Green and DarkGreen against Wood, src/core/assets.ts), centred on the origin and scaled to 1 m in radius across x/z.
 */
export function crownOf(tree: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = tree.index ? tree.toNonIndexed() : tree;
  const pos = src.getAttribute('position'), nrm = src.getAttribute('normal'), col = src.getAttribute('color');
  const p: number[] = [], n: number[] = [], c: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    let green = false;
    for (let k = t; k < t + 3; k++) if (col.getY(k) > col.getX(k)) green = true;
    if (!green) continue;
    for (let k = t; k < t + 3; k++) {
      p.push(pos.getX(k), pos.getY(k), pos.getZ(k));
      n.push(nrm.getX(k), nrm.getY(k), nrm.getZ(k));
      c.push(col.getX(k), col.getY(k), col.getZ(k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  out.computeBoundingBox();
  const bb = out.boundingBox!, s = 2 / Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, 1e-6);
  out.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  out.scale(s, s, s);
  return out;
}

/**
 * What the tree may draw per frame at stage 4 (`lookCost`: the sun's shadow pass included): the +40k triangles and
 * +25 draw calls TECH-06 left over the grey hub (≈57k, ≈131 on the S22), and +5k of the up-close detail of the trunk
 * (the hollow, the moss, the stump, the mushrooms by the roots and round the stump, the butterflies; the customer's
 * +15k for the trunk and the arches together). With the real crowns (CommonTree_1..4: 528, 590, 640, 343 triangles of
 * leaves), the mushroom (138) and the stump (232) the looks draw, triangles / draw calls:
 *   1 - 24.9k / 7 (the bark 4.1k - trunk, roots, limbs, hollow, moss, stump - and a crown of 12 clumps 6.3k, both twice
 *       for the shadow; 8 fireflies of 8, 10 butterflies of 12, 28 mushrooms of 138: 8 on the roots, 20 in the ring);
 *   2 - 26.0k / 8 (+ 64 flowers of 15, the fireflies 36);
 *   3 - 40.3k / 9 (a crown of 20 clumps 10.5k; + 280 tufts of 10, 22 more mushrooms);
 *   4 - 42.1k / 11 (+ 30 lanterns of 38, 8 birds of 82).
 * Before the detail: 19.0k / 4, 20.3k / 6, 34.5k / 8, 36.3k / 10. The grey tree drew ≈1.5k / 28 (14 meshes, each in
 * the shadow pass too).
 */
export const TREE_BUDGET = { triangles: 45_000, draws: 25 };

/**
 * m: the radius of the bark at height `y`, angle `a` (0 = +z, as the arches): the map's `trunkR(y)` with a few
 * shallow ridges (at most ≈5 %, so a nest's ring still sits on it) and the foot flaring into the roots - the flare
 * stays inside the trunk's collider, trunkR(0) + 0.4.
 */
export function barkRadius(y: number, a: number): number {
  const ridges = 0.032 * Math.sin(5 * a + y * 0.55) + 0.018 * Math.sin(11 * a - y * 1.3 + 1.3);
  const flare = y < 1.4 ? 0.22 * ((1.4 - Math.max(y, 0)) / 1.4) ** 2 : 0;
  return trunkR(y) * (1 + ridges) + flare;
}

/** The trunk's faces round, its ring step in metres, how far above TREE.h it runs up into the crown. */
const TRUNK = { sides: 18, step: 0.55, over: 2 };

/**
 * The bark's colours: what the bark picture (T_BarkTwistedTree_D, grey, ≈0.08 linear on average) is multiplied by -
 * vertex colours over 1 lift it to the warm brown of the grey build's bark (#8a6142); a little darker in the grooves.
 * Moss the same way: a green that comes out at the meadow's moss over the picture.
 */
const BARK = new THREE.Color(2.7, 1.75, 1.15), BARK_DARK = new THREE.Color(1.75, 1.05, 0.7);
const MOSS = [new THREE.Color(1.15, 3.3, 0.7), new THREE.Color(1.45, 3.6, 0.6), new THREE.Color(0.95, 2.7, 0.75)];
/** m of bark one repeat of the picture covers, round and along. */
const BARK_TILE = 2.4;

/** The trunk: rings of `barkRadius` from just under the ground up into the crown (indexed, position + color + uv). */
function trunkGeo(): THREE.BufferGeometry {
  const { sides, step, over } = TRUNK, rings = Math.ceil((TREE.h + over + 0.3) / step) + 1;
  const p: number[] = [], c: number[] = [], uv: number[] = [], idx: number[] = [], col = new THREE.Color();
  // a whole number of repeats round, so the seam closes; along: by the height
  const round = Math.max(1, Math.round((2 * Math.PI * trunkR(0)) / BARK_TILE));
  for (let j = 0; j < rings; j++) {
    const y = -0.3 + j * step;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2, r = barkRadius(y, a);
      p.push(Math.sin(a) * r, y, Math.cos(a) * r);
      col.copy(BARK).lerp(BARK_DARK, 0.5 + 0.5 * Math.sin(7 * a + y * 0.8));
      c.push(col.r, col.g, col.b);
      uv.push((i / sides) * round, y / BARK_TILE);
    }
  }
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * (sides + 1) + i, b = a + sides + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);   // facing out
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * A limb: a tube along `points` narrowing from `r0` to `r1`, `sides` round, `segs` along (indexed, position + color +
 * uv: the picture runs along the limb, a whole number of repeats round it, so it is not stretched).
 */
function limbGeo(points: THREE.Vector3[], r0: number, r1: number, sides: number, segs: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points), frames = curve.computeFrenetFrames(segs, false), len = curve.getLength();
  const round = Math.max(1, Math.round((2 * Math.PI * (r0 + r1) / 2) / BARK_TILE));
  const p: number[] = [], c: number[] = [], uv: number[] = [], idx: number[] = [], at = new THREE.Vector3(), v = new THREE.Vector3();
  for (let j = 0; j <= segs; j++) {
    const t = j / segs, r = r0 + (r1 - r0) * t;
    curve.getPointAt(t, at);
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      v.copy(frames.normals[j]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[j], Math.sin(a));
      p.push(at.x + v.x * r, at.y + v.y * r, at.z + v.z * r);
      const k = 0.35 + 0.35 * Math.sin(3 * a + t * 5);
      c.push(BARK.r + (BARK_DARK.r - BARK.r) * k, BARK.g + (BARK_DARK.g - BARK.g) * k, BARK.b + (BARK_DARK.b - BARK.b) * k);
      uv.push((i / sides) * round, (t * len) / BARK_TILE);
    }
  }
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * (sides + 1) + i, b = a + sides + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const dir = (a: number, r: number, y: number) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);

/** A low branch (flowers and birds sit on it): its curve and its radius at the trunk and at the tip. */
interface Branch { curve: THREE.CatmullRomCurve3; r0: number; r1: number }

/**
 * The tree's shape, the same for every look (from its own randomness): the six roots as in the grey build, the six
 * limbs up into the crown, the five low branches - each between two arches, so between two nests (a nest is on the
 * side of its arch) - and where the clumps of the crown stand: [x, y, z, radius, from stage].
 */
export function treeShape() {
  const rnd = mulberry32(1307);
  const roots = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + 0.5, bend = (rnd() - 0.5) * 0.35, far = TREE.r + 3.3 + rnd() * 0.8;
    return [dir(a, trunkR(0) * 0.7, 1.3), dir(a + bend * 0.3, trunkR(0) + 0.5, 0.75), dir(a + bend, far - 1.4, 0.2), dir(a + bend * 1.3, far, -0.25)];
  });
  const limbs = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + 0.25 + (rnd() - 0.5) * 0.3, y = 11.2 + rnd() * 1.6, out = 6.2 + rnd() * 1.4;
    return { a, y, out, points: [dir(a, trunkR(y) * 0.5, y - 0.6), dir(a, trunkR(y) + 1.2, y + 0.6), dir(a, out * 0.7, y + 1.8), dir(a, out, TREE.crown - 0.2 + rnd() * 0.6)] };
  });
  const branches: Branch[] = PORTALS.map((p, i) => {
    const a = p.facing + Math.PI / 5 + (rnd() - 0.5) * 0.25, y = 6.1 + ((i * 3) % 5) * 0.45, out = 4.6 + rnd() * 0.9;
    const curve = new THREE.CatmullRomCurve3([dir(a, trunkR(y) * 0.55, y - 0.3), dir(a, trunkR(y) + 0.6, y + 0.15), dir(a + 0.08, out * 0.75, y + 0.75), dir(a + 0.12, out, y + 1.5)]);
    return { curve, r0: 0.42, r1: 0.1 };
  });
  // The crown: the top, a clump at the end of every limb (the sparse crown of the first look), then the outer ring
  // between them and two more on top (the denser crown of the third). The outer ring reaches ≈12.5 m from the trunk.
  const clumps: [number, number, number, number, TreeStage][] = [[0, TREE.crown + 3.2, 0, 4.6, 1]];
  for (const l of limbs) { const at = dir(l.a, l.out, 0); clumps.push([at.x, TREE.crown + 0.4 + rnd() * 0.6, at.z, 3.5 + rnd() * 0.4, 1]); }
  for (const l of limbs) { const at = dir(l.a + Math.PI / 6, 9.4 + rnd() * 0.5, 0); clumps.push([at.x, TREE.crown - 0.9 + rnd() * 0.6, at.z, 3.1 + rnd() * 0.3, 3]); }
  for (const a of [1.1, 4.2]) { const at = dir(a, 3.2, 0); clumps.push([at.x, TREE.crown + 2.2, at.z, 3.9, 3]); }
  // and a small clump at the tip of every low branch, in every look
  for (const b of branches) { const t = b.curve.getPointAt(1); clumps.push([t.x, t.y + 0.5, t.z, 1.55, 1]); }
  return { roots, limbs, branches, clumps };
}

/**
 * The hollow (дупло) of the trunk, at a child's eyes on the side of the glade between the two arches whose gap the
 * roots leave freest (in this tree: between the third and the fourth, the north of the glade): `a` its side (0 = +z,
 * as the arches), `y` the middle of its mouth, `w` and `h` the half-width and half-height of the mouth, `r` how far
 * from the axis its mouth stands - the outermost the bark gets behind it, so the mouth lies on the bark, never in it.
 */
export function treeHollow(shape: ReturnType<typeof treeShape> = treeShape()) {
  const exits = shape.roots.map((pts) => Math.atan2(pts[1].x, pts[1].z));
  const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  let a = 0, clear = -1;
  for (const p of PORTALS) {
    const mid = p.facing + Math.PI / PORTALS.length, near = Math.min(...exits.map((e) => gap(mid, e)));
    if (near > clear) { clear = near; a = mid; }
  }
  const y = 1.3, w = 0.4, h = 0.52;
  // how far out along its side the bark gets behind the mouth: the bark's own radius and the flat faces of the built
  // trunk between its vertices (`trunkGeo`), sampled over the mouth
  const { sides, step } = TRUNK, built = (yy: number, aa: number) => {
    const j = Math.floor((yy + 0.3) / step), fy = (yy + 0.3) / step - j, u = ((aa % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * sides;
    const i = Math.floor(u), fx = u - i, at = (jj: number, ii: number) => barkRadius(-0.3 + jj * step, (ii / sides) * Math.PI * 2);
    return (at(j, i) * (1 - fx) + at(j, i + 1) * fx) * (1 - fy) + (at(j + 1, i) * (1 - fx) + at(j + 1, i + 1) * fx) * fy;
  };
  let r = 0;
  for (let yy = y - h; yy <= y + h + 1e-9; yy += h / 10) {
    for (let k = -10; k <= 10; k++) {
      const da = (k / 10) * (w / trunkR(yy));
      r = Math.max(r, barkRadius(yy, a + da) * Math.cos(da), built(yy, a + da) * Math.cos(da));
    }
  }
  return { a, y, w, h, r };
}

/**
 * The mossy stump (nature_pack/TreeStump_Moss) by the roots and the ring of glowing mushrooms round it: between the
 * second and the third arches, just past the tip of the root there - clear of both passages, of the spots she arrives
 * at and of the tour's camera (the test holds them apart). `a`: its side, `d`: m from the trunk's middle, `h`: m tall,
 * `ring`: m from its middle to the ring, `r`: its collider.
 */
export const STUMP = { a: PORTALS[1].facing + Math.PI / PORTALS.length, d: 6.8, h: 0.8, ring: 1.2, r: 0.6 } as const;
/** Where the stump stands (the map's metres). */
export const stumpAt = () => ({ x: TREE.x + Math.sin(STUMP.a) * STUMP.d, z: TREE.z + Math.cos(STUMP.a) * STUMP.d });

/** How the clumps are squashed: flatter than round, as the crowns of the valley. */
const CLUMP_Y = 0.72;
/** The leaves of each look: how much grey (toward an olive of their own brightness) and how bright. */
const LEAF_TONE: Record<TreeStage, { dull: number; bright: number }> = {
  1: { dull: 0.55, bright: 0.82 }, 2: { dull: 0.32, bright: 0.92 }, 3: { dull: 0.06, bright: 1.02 }, 4: { dull: 0, bright: 1.06 },
};

/** The time the leaves of the crown sway by, the wings beat by and the ring of mushrooms breathes by (set in `update`). */
const uLeaf = { value: 0 };

/**
 * The bark: the MegaKit picture times the vertex colours (BARK), flat-shaded - the big facets stay. Without the
 * picture (a test) the colour stands in for its average, so the bark is the same brown.
 */
function barkMaterial(map: THREE.Texture | null) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true, map, color: map ? '#ffffff' : new THREE.Color(0.085, 0.075, 0.065) });
  m.onBeforeCompile = (sh) => fadeAtCamera(sh);
  m.customProgramCacheKey = () => 'tree-bark|fade';
  return m;
}

/** The crown: a slow sway that grows with the height over the limbs (no bend at all under 10 m), and the lens fade. */
function crownMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLeaf = uLeaf;
    sh.vertexShader = 'uniform float uLeaf;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float leafK = clamp((position.y - 6.0) / 10.0, 0.0, 1.0) * 0.14;
      transformed.x += sin(uLeaf * 0.9 + position.x * 0.21 + position.z * 0.17) * leafK;
      transformed.z += cos(uLeaf * 0.7 + position.z * 0.23 - position.x * 0.11) * leafK;`);
    fadeAtCamera(sh);
  };
  m.customProgramCacheKey = () => 'tree-crown|fade';
  return m;
}

/** The crown of a look: every clump of that look in one geometry, its leaves toned for the look (LEAF_TONE). */
function crownGeo(crowns: THREE.BufferGeometry[], clumps: ReturnType<typeof treeShape>['clumps'], stage: TreeStage): THREE.BufferGeometry {
  const rnd = mulberry32(31), tone = LEAF_TONE[stage], m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const olive = new THREE.Color(), c = new THREE.Color();
  const parts: THREE.BufferGeometry[] = [];
  clumps.forEach(([x, y, z, r, from], i) => {
    const turn = rnd() * Math.PI * 2, tint = 0.92 + rnd() * 0.16, kind = crowns[i % crowns.length];
    if (from > stage) return;
    const g = (kind.index ? kind.toNonIndexed() : kind.clone());
    g.applyMatrix4(m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, turn), new THREE.Vector3(r, r * CLUMP_Y, r)));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    let col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!col) { col = new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(0.5), 3); g.setAttribute('color', col); }
    for (let k = 0; k < col.count; k++) {
      c.setRGB(col.getX(k), col.getY(k), col.getZ(k));
      const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
      olive.setRGB(lum * 0.95, lum * 0.92, lum * 0.7);
      c.lerp(olive, tone.dull).multiplyScalar(tone.bright * tint);
      col.setXYZ(k, c.r, c.g, c.b);
    }
    parts.push(g);
  });
  const out = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return out;
}

/**
 * Takes a shape into the bark: placed by `m`, painted `colour` (or per vertex by `paint`), with the picture laid on
 * it from the side (`tile`: m per repeat; 0 - one spot of the picture, for moss and the dark of the hollow).
 */
function barkPart(src: THREE.BufferGeometry, m: THREE.Matrix4, colour: THREE.Color | ((c: THREE.Color, i: number) => void), tile = BARK_TILE): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(), flat = src.index ? src.toNonIndexed() : src;
  g.setAttribute('position', flat.getAttribute('position').clone());
  g.applyMatrix4(m);
  const pos = g.getAttribute('position'), n = pos.count, col = new Float32Array(n * 3), uv = new Float32Array(n * 2), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if (typeof colour === 'function') colour(c.setRGB(0, 0, 0), i); else c.copy(colour);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv[i * 2] = tile ? (x + z) / tile : 0.5 + x * 0.02; uv[i * 2 + 1] = tile ? y / tile : 0.5 + z * 0.02;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (flat !== src) flat.dispose();
  src.dispose();
  return g;
}

const _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _hv = new THREE.Vector3(), _hs = new THREE.Vector3();

/**
 * The hollow (`treeHollow`): a dark cup with its deepest point on the bark, under a ring of swollen bark lips and a
 * thicker lip at its foot - its own shapes, in the bark's mesh. The cup faces the glade (its concave side out).
 */
function hollowParts(h: ReturnType<typeof treeHollow>): THREE.BufferGeometry[] {
  const n = new THREE.Vector3(Math.sin(h.a), 0, Math.cos(h.a)), t = new THREE.Vector3(Math.cos(h.a), 0, -Math.sin(h.a)), up = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4().makeBasis(t, up, n);
  const at = (d: number) => new THREE.Vector3(0, h.y, 0).addScaledVector(n, d);
  // the cup: a fan from its deepest point (on the bark) to the edge of the mouth, a little out of the bark
  const sides = 12, deep = at(h.r + 0.01), p: number[] = [], dark: number[] = [];
  for (let k = 0; k < sides; k++) {
    for (const [kk, isDeep] of [[-1, true], [k, false], [k + 1, false]] as const) {
      if (isDeep) { p.push(deep.x, deep.y, deep.z); dark.push(0.04); continue; }
      const th = (kk / sides) * Math.PI * 2, q = at(h.r + 0.11).addScaledVector(t, Math.cos(th) * h.w).addScaledVector(up, Math.sin(th) * h.h);
      p.push(q.x, q.y, q.z); dark.push(0.2);
    }
  }
  const cup = new THREE.BufferGeometry();
  cup.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const lips = new THREE.TorusGeometry(1, 0.22, 4, 12);
  _hm.copy(basis).setPosition(at(h.r + 0.05)).multiply(new THREE.Matrix4().makeScale(h.w + 0.1, h.h + 0.1, 0.85));
  const foot = new THREE.IcosahedronGeometry(1, 0);
  const footM = new THREE.Matrix4().copy(basis).setPosition(at(h.r + 0.1).addScaledVector(up, -h.h - 0.06)).multiply(new THREE.Matrix4().makeScale(h.w + 0.2, 0.16, 0.24));
  return [
    barkPart(cup, new THREE.Matrix4(), (c, i) => c.copy(BARK).multiplyScalar(dark[i]), 0),
    barkPart(lips, _hm, (c, i) => c.copy(BARK).lerp(BARK_DARK, (i % 5) / 5)),
    barkPart(foot, footM, BARK),
  ];
}

/** Moss on the roots (on their top, along them) and round the foot of the trunk: flat lumps of green. */
function mossParts(shape: ReturnType<typeof treeShape>): THREE.BufferGeometry[] {
  const rnd = mulberry32(77), parts: THREE.BufferGeometry[] = [], tan = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3();
  shape.roots.forEach((pts) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    for (const t0 of [0.18, 0.42, 0.63]) {
      const t = t0 + (rnd() - 0.5) * 0.08, r = 0.85 + (0.14 - 0.85) * t, s = 1 - t * 0.6;
      curve.getPointAt(t, _hv); curve.getTangentAt(t, tan);
      _hq.setFromAxisAngle(up, Math.atan2(tan.x, tan.z) + (rnd() - 0.5) * 0.4);
      _hv.y += r * 0.86;
      parts.push(barkPart(new THREE.IcosahedronGeometry(1, 0), _hm.compose(_hv, _hq, _hs.set(r * 0.9 * s + 0.12, 0.08, (0.4 + rnd() * 0.15) * s + 0.1)), MOSS[Math.floor(rnd() * MOSS.length)], 0));
    }
  });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rnd() * 0.4, y = 0.15 + rnd() * 0.4;
    side.set(Math.sin(a) * 0.75, 0.66, Math.cos(a) * 0.75).normalize();
    _hq.setFromUnitVectors(up, side);
    _hv.set(Math.sin(a), 0, Math.cos(a)).multiplyScalar(barkRadius(y, a) - 0.03).setY(y);
    parts.push(barkPart(new THREE.IcosahedronGeometry(1, 0), _hm.compose(_hv, _hq, _hs.set(0.5 + rnd() * 0.2, 0.09, 0.38 + rnd() * 0.12)), MOSS[k % MOSS.length], 0));
  }
  return parts;
}

/** The stump, its wood in the bark's picture and colours, its moss in the moss's: one more part of the bark's mesh. */
function stumpPart(stump: THREE.BufferGeometry): THREE.BufferGeometry {
  const col = stump.getAttribute('color'), at = stumpAt(), src = stump.clone();
  _hq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), STUMP.a + 1.1);
  return barkPart(src, _hm.compose(_hv.set(at.x - TREE.x, -0.04, at.z - TREE.z), _hq, _hs.set(1, 1, 1)), (c, i) => {
    const flat = stump.index ? stump.index.getX(i) : i;
    const green = col ? col.getY(flat) > col.getX(flat) : false;
    c.copy(green ? MOSS[0] : BARK);
  });
}

/** The bark: the trunk, the roots, the limbs, the low branches, the hollow, the moss and the stump as one geometry. */
function barkGeo(shape: ReturnType<typeof treeShape>, stump: THREE.BufferGeometry): THREE.BufferGeometry {
  const tubes = [
    trunkGeo(),
    ...shape.roots.map((pts) => limbGeo(pts, 0.85, 0.14, 8, 10)),
    ...shape.limbs.map((l) => limbGeo(l.points, 0.62, 0.2, 7, 8)),
    ...shape.branches.map((b) => limbGeo(b.curve.points, b.r0, b.r1, 7, 8)),
  ];
  const parts = [...tubes.map((g) => { if (!g.index) return g; const f = g.toNonIndexed(); g.dispose(); return f; }), ...hollowParts(treeHollow(shape)), ...mossParts(shape), stumpPart(stump)];
  const out = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  out.computeVertexNormals();
  return out;
}

/** A flower of the low branches: five petals round a heart, facing +y, ≈0.22 m across its petals. */
function flowerGeo(): THREE.BufferGeometry {
  const p: number[] = [], c: number[] = [], petal = [1, 1, 1], heart = [1, 0.82, 0.3];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, s = Math.sin(a), co = Math.cos(a), sx = Math.sin(a + 0.55), cx = Math.cos(a + 0.55), sy = Math.sin(a - 0.55), cy = Math.cos(a - 0.55);
    const tip = [s * 0.22, 0.02, co * 0.22], l = [sx * 0.11, 0.01, cx * 0.11], r = [sy * 0.11, 0.01, cy * 0.11];
    p.push(0, 0, 0, ...l, ...tip, 0, 0, 0, ...tip, ...r);
    for (let k = 0; k < 6; k++) c.push(...petal);
    const b = (a + (Math.PI * 2) / 5);
    p.push(0, 0.04, 0, Math.sin(a) * 0.05, 0.03, Math.cos(a) * 0.05, Math.sin(b) * 0.05, 0.03, Math.cos(b) * 0.05);
    for (let k = 0; k < 3; k++) c.push(...heart);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

/** A grass tuft round the roots: five blades as the meadow of the first world grows them (src/worlds/fairy/scenery.ts). */
function tuftGeo(rnd: () => number): THREE.BufferGeometry {
  const v: number[] = [], c: number[] = [], nrm: number[] = [];
  const base = new THREE.Color('#5fb64c'), tip = new THREE.Color('#c9ee7c');
  for (let b = 0; b < 5; b++) {
    const a = rnd() * 6.28, ox = (rnd() - 0.5) * 0.34, oz = (rnd() - 0.5) * 0.34, h = 0.22 + rnd() * 0.24, w = 0.04;
    const lx = Math.cos(a) * 0.14, lz = Math.sin(a) * 0.14, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    v.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + lx, h, oz + lz, ox + px, 0, oz + pz, ox - px, 0, oz - pz, ox + lx, h, oz + lz);
    for (let k = 0; k < 2; k++) { c.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b); nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

/** Paints a whole shape one colour (for merging shapes of several colours into one geometry). */
function painted(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const s = g.index ? g.toNonIndexed() : g, col = new THREE.Color(hex), n = s.getAttribute('position').count;
  s.deleteAttribute('uv');
  s.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => [col.r, col.g, col.b][i % 3]), 3));
  return s;
}

/** A lantern fruit: a glowing body under a little cap on its string; the string's top is at the origin, it hangs down. */
function lanternGeo(): THREE.BufferGeometry {
  const string = painted(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 3, 1, true).translate(0, -0.3, 0), '#4a3a2a');
  const cap = painted(new THREE.ConeGeometry(0.11, 0.1, 6).translate(0, -0.62, 0), '#6b4a2f');
  const body = painted(new THREE.IcosahedronGeometry(0.17, 0).scale(1, 1.3, 1).translate(0, -0.84, 0), '#ffffff');
  return mergeGeometries([string, cap, body], false)!;
}

/** A small bird of the branches, facing +z, standing on y = 0: a body, a head, a beak, a tail and folded wings. */
function birdGeo(): THREE.BufferGeometry {
  const body = painted(new THREE.IcosahedronGeometry(0.11, 0).scale(0.85, 0.8, 1.25).translate(0, 0.11, 0), '#ffffff');
  const head = painted(new THREE.IcosahedronGeometry(0.075, 0).translate(0, 0.2, 0.1), '#ffffff');
  const beak = painted(new THREE.ConeGeometry(0.025, 0.07, 4).rotateX(Math.PI / 2).translate(0, 0.195, 0.19), '#ffc04a');
  const tail = painted(new THREE.ConeGeometry(0.05, 0.16, 3).rotateX(-Math.PI / 2 - 0.4).translate(0, 0.13, -0.17), '#d9d9d9');
  const wing = (side: number) => painted(new THREE.ConeGeometry(0.06, 0.2, 3).scale(0.4, 1, 1).rotateX(-Math.PI / 2 + 0.2).translate(side * 0.085, 0.13, -0.03), '#cfcfcf');
  const eye = (side: number) => painted(new THREE.OctahedronGeometry(0.014, 0).translate(side * 0.05, 0.215, 0.145), '#222222');
  return mergeGeometries([body, head, beak, tail, wing(-1), wing(1), eye(-1), eye(1)], false)!;
}

/** What `buildTreeLook` puts into the scene: the tree under `root`, `update(time)` for the frame's animate. */
export interface TreeLook { root: THREE.Group; update(time: number): void }

const FLOWERS = 64, FIREFLIES = 36, TUFTS = 280, MUSHROOMS = 22, LANTERNS = 30, BIRDS = 8;
/** Every look: the fireflies of the first (the second has FIREFLIES), the butterflies, the mushrooms on the roots and in the ring round the stump. */
const EARLY_FIREFLIES = 8, BUTTERFLIES = 10, ROOT_MUSHROOMS = 8, RING_MUSHROOMS = 20;
/** The glow of a mushroom: the meadow's faint pink at the roots, the ring's soft lilac (breathing), emissive only. */
const MUSH_GLOW = new THREE.Color('#ff5f8f').multiplyScalar(0.16), RING_GLOW = new THREE.Color('#d9a6ff').multiplyScalar(0.55);

/**
 * A butterfly, facing +z: two wings, a quad each, hinged on its body (x = 0) - the material flaps them (`flapMaterial`),
 * the body a thin dark spindle. White: each takes its colour from its instance.
 */
function butterflyGeo(): THREE.BufferGeometry {
  const p: number[] = [], c: number[] = [];
  for (const s of [-1, 1]) {
    const hf = [0, 0, 0.07], hb = [0, 0, -0.09], of = [s * 0.21, 0, 0.14], ob = [s * 0.17, 0, -0.13];
    // both triangles wound to face up (the material draws both sides)
    const tris = s > 0 ? [hf, ob, of, hf, hb, ob] : [hf, of, ob, hf, ob, hb];
    for (const v of tris) { p.push(...v); const k = v[0] === 0 ? 0.8 : 1; c.push(k, k, k); }
  }
  const body = new THREE.OctahedronGeometry(1, 0).scale(0.022, 0.022, 0.12), bp = body.getAttribute('position');
  for (let i = 0; i < bp.count; i++) { p.push(bp.getX(i), bp.getY(i), bp.getZ(i)); c.push(0.22, 0.2, 0.25); }
  body.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

/** The wings beat: every vertex off the body turns about it, each butterfly in its own phase (by its instance). */
function flapMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLeaf = uLeaf;
    sh.vertexShader = 'uniform float uLeaf;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      if (abs(position.x) > 0.03) {
        float beat = 0.35 + 0.85 * sin(uLeaf * 13.0 + float(gl_InstanceID) * 2.3);
        transformed.x = position.x * cos(beat);
        transformed.y = position.y + abs(position.x) * sin(beat);
      }`);
  };
  m.customProgramCacheKey = () => 'tree-butterfly';
  return m;
}

/**
 * The mushrooms: vertex-coloured, each glowing by its own emissive (`aGlow`, per instance; the strong ones breathe
 * slowly), no light of their own; and the lens fade.
 */
function mushMaterial() {
  const m = propMaterial(0, { emissive: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLeaf = uLeaf;
    sh.vertexShader = 'uniform float uLeaf;\nattribute vec3 aGlow;\nvarying vec3 vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vGlow = aGlow * (1.0 + 0.3 * step(0.5, aGlow.r + aGlow.g + aGlow.b) * sin(uLeaf * 1.3 + float(gl_InstanceID) * 2.1));`);
    sh.fragmentShader = 'varying vec3 vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance = vGlow;`);
    fadeAtCamera(sh);
  };
  m.customProgramCacheKey = () => 'tree-mush|fade';
  return m;
}

/**
 * The Great Tree of look `stage` (./tree-look.ts header), built from `loads` (`loadTreeLook`, or any geometries of
 * the same shape in a test); `block(x, z, r)` gets the trunk's collider. Deterministic: the same picture every time.
 */
export function buildTreeLook(scene: THREE.Scene, stage: TreeStage, loads: TreeLoads, block: (x: number, z: number, r: number) => void): TreeLook {
  const root = new THREE.Group();
  root.name = 'tree-look';
  root.position.set(TREE.x, 0, TREE.z);
  const shape = treeShape(), rnd = mulberry32(4711 + stage);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), at = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  const bark = new THREE.Mesh(barkGeo(shape, loads.stump), barkMaterial(loads.bark));
  const crown = new THREE.Mesh(crownGeo(loads.crowns, shape.clumps, stage), crownMaterial());
  for (const o of [bark, crown]) { o.castShadow = true; o.receiveShadow = true; root.add(o); }
  block(TREE.x, TREE.z, trunkR(0) + 0.4);
  const stumpSpot = stumpAt();
  block(stumpSpot.x, stumpSpot.z, STUMP.r);

  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.castShadow = false; im.receiveShadow = false;
    root.add(im);
    return im;
  };
  const finish = (im: THREE.InstancedMesh) => { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); };
  const updates: ((time: number) => void)[] = [(time) => { uLeaf.value = time; }];

  if (stage >= 2) {
    // Flowers along the top of the low branches and over their clumps, facing out; white and pinks.
    const tints = ['#ffd1e8', '#fff4fb', '#ffb8d6', '#ffe9b0'].map((h) => new THREE.Color(h));
    const flowers = inst(flowerGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, emissive: '#ffd6ea', emissiveIntensity: 0.18 }), FLOWERS);
    const out = new THREE.Vector3(), tan = new THREE.Vector3();
    for (let i = 0; i < FLOWERS; i++) {
      const b = shape.branches[i % shape.branches.length];
      if (i % 2 === 0) {
        // on the branch: a little over its top side, tilted out of it
        const t = 0.25 + rnd() * 0.7, r = b.r0 + (b.r1 - b.r0) * t;
        b.curve.getPointAt(t, at); b.curve.getTangentAt(t, tan);
        out.set(rnd() - 0.5, 1.2, rnd() - 0.5).normalize();
        at.addScaledVector(out, r * 0.9);
      } else {
        // on the clump at its tip: the outer and lower side
        const tip = b.curve.getPointAt(1), a = rnd() * Math.PI * 2, h = -0.6 + rnd() * 1.1;
        out.set(Math.sin(a), h, Math.cos(a)).normalize();
        at.set(tip.x, tip.y + 0.5, tip.z).add(sc.copy(out).multiply(new THREE.Vector3(1.4, 1.4 * CLUMP_Y, 1.4)));
      }
      q.setFromUnitVectors(up, out);
      const s = 0.8 + rnd() * 0.6;
      flowers.setMatrixAt(i, m.compose(at, q, sc.set(s, s, s)));
      flowers.setColorAt(i, tints[Math.floor(rnd() * tints.length)]);
    }
    finish(flowers);
  }

  {
    // Fireflies: each drifts round its own point by the trunk and under the crown, blinking. Their paths in one array.
    // A handful in the first look (the tree is not dead), all of them from the second.
    const flyN = stage >= 2 ? FIREFLIES : EARLY_FIREFLIES;
    const flies = inst(new THREE.OctahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: '#f4ff8a' }), flyN);
    flies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const path = new Float32Array(flyN * 6);   // angle, radius, height, phase, speed, blink
    for (let i = 0; i < flyN; i++) path.set([rnd() * Math.PI * 2, trunkR(0) + 0.8 + rnd() * 6.5, 0.8 + rnd() * 7, rnd() * 6.28, 0.6 + rnd() * 0.8, 1.5 + rnd() * 2], i * 6);
    const fly = (time: number) => {
      for (let i = 0; i < flyN; i++) {
        const o = i * 6, ph = path[o + 3], w = path[o + 4];
        const a = path[o] + 0.08 * Math.sin(time * 0.21 * w + ph), r = path[o + 1] + 0.5 * Math.sin(time * 0.53 * w + ph * 2);
        const y = path[o + 2] + 0.4 * Math.sin(time * 0.8 * w + ph);
        const s = 0.3 + 0.7 * Math.max(0, Math.sin(time * path[o + 5] + ph));
        flies.setMatrixAt(i, m.makeScale(s, s, s).setPosition(Math.sin(a) * r, y, Math.cos(a) * r));
      }
      flies.instanceMatrix.needsUpdate = true;
    };
    fly(0);
    // round the trunk under the crown, whatever the time: drawn from a sphere that holds every path
    flies.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4.5, 0), 11.5);
    updates.push(fly);
  }

  {
    // Butterflies over the roots and the glade near the trunk, in every look: each loops round the tree on its own
    // circle, rising and dipping; the wings beat in the material. Their paths in one array.
    const tints = ['#ffd24a', '#ff9ed2', '#7fd8ff', '#ffffff', '#ff8a5c', '#c79bff'].map((h) => new THREE.Color(h));
    const brnd = mulberry32(2024), flutter = inst(butterflyGeo(), flapMaterial(), BUTTERFLIES);
    flutter.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const path = new Float32Array(BUTTERFLIES * 6);   // angle, radius, height, phase, speed, way round
    for (let i = 0; i < BUTTERFLIES; i++) {
      path.set([brnd() * Math.PI * 2, trunkR(0) + 1.2 + brnd() * 5, 0.7 + brnd() * 1.6, brnd() * 6.28, 0.7 + brnd() * 0.6, brnd() < 0.5 ? -1 : 1], i * 6);
      flutter.setColorAt(i, tints[i % tints.length]);
    }
    const flit = (time: number) => {
      for (let i = 0; i < BUTTERFLIES; i++) {
        const o = i * 6, ph = path[o + 3], w = path[o + 4], way = path[o + 5];
        const a = path[o] + way * time * 0.11 * w + 0.15 * Math.sin(time * 0.9 * w + ph);
        const r = path[o + 1] + 0.8 * Math.sin(time * 0.31 * w + ph * 2);
        const y = path[o + 2] + 0.3 * Math.sin(time * 1.7 * w + ph) + 0.12 * Math.sin(time * 4.1 + ph);
        // heading along the circle, the way it goes round
        q.setFromEuler(e.set(0.15 * Math.sin(time * 2.3 + ph), a + way * Math.PI / 2, 0, 'YXZ'));
        flutter.setMatrixAt(i, m.compose(at.set(Math.sin(a) * r, y, Math.cos(a) * r), q, sc.set(1.4, 1.4, 1.4)));
      }
      flutter.instanceMatrix.needsUpdate = true;
    };
    flit(0);
    finish(flutter);
    flutter.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), trunkR(0) + 8);
    updates.push(flit);
  }

  // The mushrooms, one InstancedMesh: a few on the roots and the ring round the stump in every look, the meadow's
  // groups by the roots from the third (`stage >= 3` below adds them).
  const mushAt: THREE.Matrix4[] = [], mushGlow: THREE.Color[] = [];
  {
    const mrnd = mulberry32(5150);
    for (let i = 0; i < ROOT_MUSHROOMS; i++) {
      // on the top of a root, toward its tip, in pairs on four roots
      const pts = shape.roots[[0, 2, 3, 5][i % 4]], curve = new THREE.CatmullRomCurve3(pts);
      const t = (i < 4 ? 0.52 : 0.7) + mrnd() * 0.08, r = 0.85 + (0.14 - 0.85) * t, s = 0.26 + mrnd() * 0.16;
      curve.getPointAt(t, at);
      at.y += r * 0.8;
      mushAt.push(m.compose(at, q.setFromAxisAngle(up, mrnd() * 6.28), sc.set(s, s, s)).clone());
      mushGlow.push(MUSH_GLOW);
    }
    const c = stumpAt();
    for (let i = 0; i < RING_MUSHROOMS; i++) {
      const a = (i / RING_MUSHROOMS) * Math.PI * 2 + (mrnd() - 0.5) * 0.18, d = STUMP.ring + (mrnd() - 0.5) * 0.22, s = 0.24 + mrnd() * 0.18;
      at.set(c.x - TREE.x + Math.sin(a) * d, -0.02, c.z - TREE.z + Math.cos(a) * d);
      mushAt.push(m.compose(at, q.setFromAxisAngle(up, mrnd() * 6.28), sc.set(s, s, s)).clone());
      mushGlow.push(RING_GLOW);
    }
  }

  if (stage >= 3) {
    // Grass round the roots, thicker by the trunk; a tuft never stands inside it.
    const tufts = inst(tuftGeo(rnd), propMaterial(3.2, { roughness: 1 }), TUFTS);
    for (let i = 0; i < TUFTS; i++) {
      const a = rnd() * Math.PI * 2, r = trunkR(0) + 0.35 + Math.pow(rnd(), 1.6) * 5.2, s = 0.8 + rnd() * 0.9;
      tufts.setMatrixAt(i, m.compose(at.set(Math.sin(a) * r, -0.03, Math.cos(a) * r), q.setFromAxisAngle(up, rnd() * 6.28), sc.set(s, s, s)));
      tufts.setColorAt(i, new THREE.Color().setHSL(0.24 + rnd() * 0.06, 0.25, 0.86 + rnd() * 0.14));
    }
    finish(tufts);

    // Mushrooms in little groups by the tips of the roots and between them, glowing a little as the meadow's.
    for (let i = 0; i < MUSHROOMS; i++) {
      const root0 = shape.roots[i % 6], end = root0[root0.length - 1];
      const near = i < 12, a = Math.atan2(end.x, end.z) + (near ? (rnd() - 0.5) * 0.5 : Math.PI / 6 + (rnd() - 0.5) * 0.4);
      const r = near ? Math.hypot(end.x, end.z) - 0.4 + rnd() * 1.2 : trunkR(0) + 0.6 + rnd() * 1.8, s = 0.3 + rnd() * rnd() * 0.45;
      at.set(Math.sin(a) * r, -0.02, Math.cos(a) * r);
      // not into the stump and its ring: out past the ring
      const st = stumpAt(), dx = at.x + TREE.x - st.x, dz = at.z + TREE.z - st.z, d = Math.hypot(dx, dz);
      if (d < STUMP.ring + 0.4) at.set(st.x - TREE.x + (dx / d) * (STUMP.ring + 0.45), -0.02, st.z - TREE.z + (dz / d) * (STUMP.ring + 0.45));
      mushAt.push(m.compose(at, q.setFromAxisAngle(up, rnd() * 6.28), sc.set(s, s, s)).clone());
      mushGlow.push(MUSH_GLOW);
    }
  }
  {
    const geo = loads.mushroom.clone(), glow = new Float32Array(mushAt.length * 3);
    mushGlow.forEach((g, i) => g.toArray(glow, i * 3));
    geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 3));
    const mush = inst(geo, mushMaterial(), mushAt.length);
    mushAt.forEach((x, i) => mush.setMatrixAt(i, x));
    finish(mush);
  }

  if (stage >= 4) {
    // Lantern fruits hang under the clumps of the crown (the top excluded: nobody sees under it) and the low ones.
    const warm = ['#ffd27a', '#ffb35c', '#fff0a0', '#ff9e7a'].map((h) => new THREE.Color(h));
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    const lanterns = inst(lanternGeo(), glow, LANTERNS);
    const hang = shape.clumps.slice(1);
    for (let i = 0; i < LANTERNS; i++) {
      const [x, y, z, r] = hang[i % hang.length], a = rnd() * Math.PI * 2, d = r * (0.2 + rnd() * 0.5);
      const under = y - r * CLUMP_Y * Math.sqrt(1 - (d / r) ** 2) * 0.8;
      lanterns.setMatrixAt(i, m.compose(at.set(x + Math.sin(a) * d, under, z + Math.cos(a) * d), q.setFromAxisAngle(up, rnd() * 6.28), sc.set(1, 1, 1)));
      lanterns.setColorAt(i, warm[i % warm.length]);
    }
    finish(lanterns);
    updates.push((time) => { glow.color.setScalar(0.86 + 0.14 * Math.sin(time * 1.3)); });

    // Birds on the low branches: one by the middle of each, three more toward the tips; they turn, bob and peck.
    const colours = ['#5b9be0', '#ff8a5c', '#ffd24a', '#8fd16a', '#c79bff'].map((h) => new THREE.Color(h));
    const birds = inst(birdGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), BIRDS);
    birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const perch = new Float32Array(BIRDS * 5);   // x, y, z, heading, phase
    for (let i = 0; i < BIRDS; i++) {
      const b = shape.branches[i % shape.branches.length], t = i < shape.branches.length ? 0.5 + rnd() * 0.1 : 0.78 + rnd() * 0.08;
      b.curve.getPointAt(t, at);
      const r = b.r0 + (b.r1 - b.r0) * t;
      perch.set([at.x, at.y + r * 0.92, at.z, rnd() * Math.PI * 2, rnd() * 6.28], i * 5);
      birds.setColorAt(i, colours[i % colours.length]);
    }
    const hop = (time: number) => {
      for (let i = 0; i < BIRDS; i++) {
        const o = i * 5, ph = perch[o + 4];
        const heading = perch[o + 3] + 0.7 * Math.sin(time * 0.37 + ph);
        const peck = 0.55 * Math.pow(Math.max(0, Math.sin(time * 1.7 + ph * 1.3)), 8);
        const bob = 0.05 * Math.pow(Math.max(0, Math.sin(time * 0.9 + ph)), 16);
        q.setFromEuler(e.set(peck, heading, 0, 'YXZ'));
        birds.setMatrixAt(i, m.compose(at.set(perch[o], perch[o + 1] + bob, perch[o + 2]), q, sc.set(1.3, 1.3, 1.3)));
      }
      birds.instanceMatrix.needsUpdate = true;
    };
    hop(0);
    birds.computeBoundingSphere();
    birds.boundingSphere!.radius += 0.5;
    updates.push(hop);
  }

  scene.add(root);
  return { root, update: (time) => { for (const u of updates) u(time); } };
}

/**
 * What a look draws per frame: triangles (an InstancedMesh: its triangles times its instances; a shadow caster twice,
 * once more in the sun's shadow pass) and draw calls (a shadow caster: two). What the test holds against TREE_BUDGET.
 */
export function lookCost(root: THREE.Object3D): { triangles: number; draws: number; instances: number } {
  let triangles = 0, draws = 0, instances = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry, tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    const n = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1, passes = mesh.castShadow ? 2 : 1;
    triangles += tris * n * passes; draws += passes; instances += n;
  });
  return { triangles, draws, instances };
}
