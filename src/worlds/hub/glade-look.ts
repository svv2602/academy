import * as THREE from 'three';
import { texturedParts, type Part } from '../../core/assets';
import type { Placement } from '../../core/instancing';
import { fadeAtCamera, propMaterial, uSway, uTime } from '../../core/materials';
import { mulberry32 } from '../../core/util';
import { HUB_FLYOVER } from './flyover-path';
import { PORTALS, RADIUS, TREE, arrivalAt, trunkR } from './layout';
import { STUMP, stumpAt } from './tree-look';

/**
 * The dress of the glade round the Great Tree (WORLD-01, docs/worlds/hub.md «Облик (H)»): what the grass between the
 * arches and the roots had nothing of. Everything is the Stylized Nature MegaKit of the installation
 * (`public/models/nature2`, textured, as the first world draws it - src/worlds/fairy/scenery.ts): no files of the
 * hub's own, nothing downloaded (R31).
 *   - paths: from just inside every OPEN arch to the edge of the roots, a slightly winding line of twelve flat round
 *     pebbles (PebbleRound1-3); a sleeping arch has only a stub of three, sunk and grown over with clover;
 *   - bushes (BushCommon, BushCommonFlowers) along the edge of the glade between the arches, r 15-19 m;
 *   - a carpet of ferns, clover and flower groups (Fern1, Clover1-2, Flower3Group) beside the arches and between the
 *     ends of the roots - it casts no shadow;
 *   - rocks (RockMedium1-3) at the feet of the arches, beside the posts, and at the edge;
 *   - pollen and leaf motes drifting up in the light: one THREE.Points with a shader of its own.
 * Nothing stands in a passage (±1.6 m across an arch, 3 m before and behind it), on a path, near the spot she
 * arrives at through an arch (`arrivalAt`, the spawn among them) or on the camera's tour (HUB_FLYOVER: 2.5 m clear).
 *
 * The API, as the hub (./index.ts) uses it:
 *   `loadGladeLook(): Promise<GladeLoads>` - the twelve models, through `texturedParts` (in the hub's load: the
 *     scope of the hub owns them);
 *   `buildGladeLook(scene, loads, openArches, block): GladeLook` - puts the glade's dress into the scene under one
 *     group (`root`); `openArches` are the arches whose world is not null (their `x`, `z`, `facing`: the `Arch`es of
 *     ./arch-look.ts fit as they are), the others are the sleeping ones of PORTALS; `block(x, z, r)` (`ground.block`
 *     of the hub) gets a collider for every bush and every rock. `update(time)`, from the frame's `animate`, moves
 *     the motes; the plants sway with the shared wind (`uTime`, src/core/materials.ts) on their own.
 *   `placeGlade(openArches)` and `placeMotes(n)` are the pure placements the build draws (the test checks them);
 *   `bakeParts`, `gladeCost` - the merge and the count, exported for the test.
 *
 * The budget (TECH-06, the S22; `GLADE_BUDGET`, the test checks it with fakes of the real triangle counts): every
 * kind of material is ONE merged, static mesh for the whole glade - the pebbles (PathRocks), the rocks (Rocks), the
 * leafy body of the plain bush (untextured), the leaves of the flowering bush, the flowers (of the bushes and of the
 * flower groups together), the leaves of the carpet (fern, clover, the stems of the flower groups) - so 6 calls, and
 * the motes are a 7th. The instanced cells of src/core/instancing.ts would cost a call per 44 m cell per part (up
 * to four here) and twice that for a shadow. Shadows: the bushes and the rocks cast them through one merged mesh of
 * low-poly stand-ins (an icosahedron, 20 triangles, a little inside each bush and rock), invisible in the frame and
 * drawn only into the sun's shadow map - the real ones would draw their 900-triangle leaves a second time. That is
 * 2 more calls: 9 in all. With all five arches open (the heaviest: five paths) and the real models, triangles:
 *   pebbles 60 x 126 = 7.6k; rocks 12 x 369 = 4.4k; bushes 7 x 900 + 7 x (900 + 468) = 15.9k;
 *   carpet 24 ferns x 288 + 16 + 8 clover x 379 / 615 + 10 flower groups x 755 = 24.9k;
 *   shadow stand-ins 26 x 20 x 2 = 1.0k; motes 150 points (no triangles)  ->  ≈ 53.8k triangles, 9 draw calls.
 * The counts are a little under the brief's (8 + 8 bushes, 30 + 30 + 15 of the carpet): those came to ≈ 70k.
 *
 * Deterministic: every placement comes from a seeded generator (mulberry32), one per kind, so the picture is the same
 * at every run and the bushes, rocks and carpet do not move as more arches open. Nothing allocates per frame:
 * `update` writes a number into a uniform; the motes' pixel size is read in `onBeforeRender` into a vector made once.
 */

/** m: the heights the models are loaded at (as the first world loads them, the clover bigger: a carpet, not a dot). */
const H = { pebble: 0.09, rock: 0.8, bush: 1.2, bushFlowers: 1.3, fern: 0.6, clover: 0.22, flowers: 0.6 } as const;

/** What the glade is made of: the parts of every model (`texturedParts`), one array of parts per model. */
export interface GladeLoads {
  pebbles: Part[][];
  rocks: Part[][];
  /** [BushCommon, BushCommonFlowers] */
  bushes: Part[][];
  /** [Fern1, Clover1, Clover2, Flower3Group] - the kinds of `GladePlan.carpet` */
  carpet: Part[][];
}

/** Loads the twelve MegaKit models of the glade (already in the installation, the first world's). */
export async function loadGladeLook(): Promise<GladeLoads> {
  const N = (n: string, h: number, normals: 'model' | 'up' | 'sphere' = 'model') => texturedParts('nature2/' + n, h, normals);
  const [pebbles, rocks, bushes, carpet] = await Promise.all([
    Promise.all([1, 2, 3].map((i) => N(`PebbleRound${i}`, H.pebble))),
    Promise.all([1, 2, 3].map((i) => N(`RockMedium${i}`, H.rock))),
    Promise.all([N('BushCommon', H.bush, 'sphere'), N('BushCommonFlowers', H.bushFlowers, 'sphere')]),
    Promise.all([N('Fern1', H.fern, 'up'), N('Clover1', H.clover, 'up'), N('Clover2', H.clover, 'up'), N('Flower3Group', H.flowers, 'up')]),
  ]);
  return { pebbles, rocks, bushes, carpet };
}

/** An arch as the glade reads it: where it stands and the way it faces (out of the middle). */
export interface ArchSpot { readonly x: number; readonly z: number; readonly facing: number }

/** One thing placed: where, its scale (of the model as loaded), its turn and which model of its kind. */
export interface GladeItem extends Placement { kind: number }

/** What the glade puts where (`placeGlade`). */
export interface GladePlan {
  /** the pebbles of every open arch's path, in the order of `openArches`, from the arch to the roots */
  paths: GladeItem[][];
  /** the sunk stubs before the sleeping arches */
  stubs: GladeItem[];
  /** kind 0 - BushCommon, 1 - BushCommonFlowers */
  bushes: GladeItem[];
  /** kind 0..2 - RockMedium1..3 */
  rocks: GladeItem[];
  /** kind 0 - Fern1, 1 - Clover1, 2 - Clover2, 3 - Flower3Group */
  carpet: GladeItem[];
  /** what `block` gets: one per bush and rock */
  colliders: { x: number; z: number; r: number }[];
}

/** How many of each (the header's budget). */
export const COUNTS = { pebbles: 12, stub: 3, bushes: [7, 7], rocksAtArches: 7, rocksAtEdge: 5, carpet: [24, 16, 8, 10] } as const;

/** m: where a path ends - just past the tips of the roots (./tree-look.ts `treeShape`: they reach TREE.r + 4.1). */
export const ROOTS_EDGE = TREE.r + 4.4;
/** m from the arch's middle inward where a path begins: just inside the arch, past the depth of its stones. */
const PATH_FROM = 1.1;
/** The passage of an arch kept free: half its width across, its reach before and behind (the test's numbers). */
export const PASSAGE = { across: 1.6, along: 3 } as const;
/** m: how far the bushes and rocks keep from the camera's tour points (in x, z) and from an arrival spot. */
export const TOUR_CLEAR = 2.5, ARRIVAL_CLEAR = 1.5;
/** m: the band of the edge the bushes stand in. */
const EDGE = { from: 15, to: 19 } as const;
/** The radius of a collider per unit of scale: a bush's leaves give a little, a rock does not. */
const BUSH_R = 0.6, ROCK_R = 0.5;

/** The arch's own frame at (x, z): `across` its width, `along` out of the glade (negative - on the glade's side). */
function archFrame(a: ArchSpot, x: number, z: number) {
  const dx = x - a.x, dz = z - a.z, s = Math.sin(a.facing), c = Math.cos(a.facing);
  return { across: dx * c - dz * s, along: dx * s + dz * c };
}
/** The point `along` out of the glade and `across` its width of the arch `a` (the inverse of `archFrame`). */
function fromArch(a: ArchSpot, across: number, along: number) {
  const s = Math.sin(a.facing), c = Math.cos(a.facing);
  return { x: a.x + across * c + along * s, z: a.z - across * s + along * c };
}
/** True when a circle of radius `r` at (x, z) reaches into the passage of the arch `a`. */
export function inPassage(a: ArchSpot, x: number, z: number, r = 0) {
  const f = archFrame(a, x, z);
  return Math.abs(f.across) < PASSAGE.across + r && Math.abs(f.along) < PASSAGE.along + r;
}

/** The place of the shelf an arch stands at (the nearest of PORTALS). */
const shelfOf = (a: ArchSpot) => PORTALS.reduce((best, p, i) => (Math.hypot(p.x - a.x, p.z - a.z) < Math.hypot(PORTALS[best].x - a.x, PORTALS[best].z - a.z) ? i : best), 0);

/** The flyover points over the glade, in x, z. */
const TOUR = HUB_FLYOVER.points.map((p) => ({ x: p.pos[0], z: p.pos[2] }));
/** The spots she arrives at, one per arch (the first is the spawn). */
const ARRIVALS = PORTALS.map((p) => arrivalAt(p.shelf));

/**
 * Where everything of the glade stands, for these open arches (the others of PORTALS sleep). Pure and deterministic.
 * The bushes and rocks do not depend on which arches are open; the carpet only keeps off the paths that are there.
 */
/** Clear of the mossy stump and its ring of glowing mushrooms (./tree-look.ts): nothing grows into the ring. */
const STUMP_AT = stumpAt();
const nearStump = (x: number, z: number, r: number) => Math.hypot(x - STUMP_AT.x, z - STUMP_AT.z) < STUMP.ring + 0.4 + r;

export function placeGlade(openArches: readonly ArchSpot[]): GladePlan {
  const opened = new Set(openArches.map(shelfOf));
  const paths = openArches.map((a) => placePath(a, mulberry32(3001 + shelfOf(a) * 97)));
  const stubs = PORTALS.filter((p) => !opened.has(p.shelf)).flatMap((p) => placeStub(p, mulberry32(3501 + p.shelf * 97)));
  const pebbles = paths.flat();
  const onPath = (x: number, z: number, r: number) => pebbles.some((p) => Math.hypot(p.x - x, p.z - z) < r);

  // Bushes and the edge rocks share the gaps between the arches: neither in a passage nor on the tour.
  const colliders: GladePlan['colliders'] = [];
  const solid: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, r: number) =>
    !PORTALS.some((p) => inPassage(p, x, z, r)) &&
    // and not on the line out behind an arch either: the veil's light is seen from the glade over it
    !PORTALS.some((p) => { const f = archFrame(p, x, z); return f.along > 0 && Math.abs(f.across) < PASSAGE.across + r + 0.4; }) &&
    !TOUR.some((t) => Math.hypot(t.x - x, t.z - z) < TOUR_CLEAR + r) &&
    !ARRIVALS.some((s) => Math.hypot(s.x - x, s.z - z) < ARRIVAL_CLEAR + r) &&
    !onPath(x, z, r + 0.5) &&
    !nearStump(x, z, r) &&
    !solid.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 0.5);
  const gap = (Math.PI * 2) / PORTALS.length;
  const atEdge = (rnd: () => number, n: number, scale: () => number, radius: number, kinds: number, kind0 = (i: number) => i % kinds) => {
    const out: GladeItem[] = [];
    for (let tries = 0; out.length < n && tries < n * 60; tries++) {
      const g = (out.length + tries) % PORTALS.length;   // spread over the five gaps in turn
      const a = PORTALS[g].facing + gap * (0.12 + rnd() * 0.76), r = EDGE.from + rnd() * (EDGE.to - EDGE.from);
      const x = Math.sin(a) * r, z = Math.cos(a) * r, s = scale(), cr = radius * s;
      if (!free(x, z, cr)) continue;
      out.push({ x, z, s, rot: rnd() * Math.PI * 2, kind: kind0(out.length) });
      solid.push({ x, z, r: cr }); colliders.push({ x, z, r: cr });
    }
    return out;
  };
  const rb = mulberry32(3101);
  const bushes = atEdge(rb, COUNTS.bushes[0] + COUNTS.bushes[1], () => 0.85 + rb() * 0.4, BUSH_R, 2);

  // Rocks at the feet of every arch, beside a post (outside it and the passage), then a few at the edge.
  const rr = mulberry32(3201), rocks: GladeItem[] = [];
  for (let i = 0, tries = 0; rocks.length < COUNTS.rocksAtArches && tries < 200; tries++) {
    // one at every arch first, then a second on the other side of some (the arches taken in turn)
    const p = PORTALS[i % PORTALS.length], side = rr() < 0.5 ? -1 : 1;
    const s = 0.55 + rr() * 0.3, cr = ROCK_R * s, at = fromArch(p, side * (PASSAGE.across + cr + 0.45 + rr() * 0.4), (rr() - 0.5) * 1.6);
    if (!free(at.x, at.z, cr)) { if (tries % 6 === 5) i++; continue; }   // that side is taken (or on the tour): try again, then the next arch
    rocks.push({ x: at.x, z: at.z, s, rot: rr() * Math.PI * 2, kind: rocks.length % 3 });
    solid.push({ x: at.x, z: at.z, r: cr }); colliders.push({ x: at.x, z: at.z, r: cr });
    i++;
  }
  rocks.push(...atEdge(rr, COUNTS.rocksAtEdge, () => 0.8 + rr() * 0.5, ROCK_R, 3, (i) => (i + 1) % 3));

  const carpet = placeCarpet(openArches, pebbles, mulberry32(3301));
  return { paths, stubs, bushes, rocks, carpet, colliders };
}

/** The path of an open arch: twelve pebbles from just inside it to the roots, winding a little, stepping left-right. */
function placePath(a: ArchSpot, rnd: () => number): GladeItem[] {
  const n = COUNTS.pebbles, from = PATH_FROM, to = Math.hypot(a.x - TREE.x, a.z - TREE.z) - ROOTS_EDGE, phase = rnd() * Math.PI * 2;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1), along = -(from + (to - from) * t);
    const across = 0.3 * Math.sin(t * Math.PI * 1.6 + phase) + (i % 2 ? 0.09 : -0.09) + (rnd() - 0.5) * 0.08;
    const at = fromArch(a, across, along);
    return { x: at.x, z: at.z, s: 0.95 + rnd() * 0.35, rot: rnd() * Math.PI * 2, kind: Math.floor(rnd() * 3) };
  });
}

/** Before a sleeping arch: three small pebbles, half sunk (`s` small) - a path nobody walked for long. */
function placeStub(a: ArchSpot, rnd: () => number): GladeItem[] {
  return Array.from({ length: COUNTS.stub }, (_, i) => {
    const at = fromArch(a, (rnd() - 0.5) * 0.5, -(PATH_FROM + 0.2 + i * 0.5));
    return { x: at.x, z: at.z, s: 0.7 + rnd() * 0.2, rot: rnd() * Math.PI * 2, kind: Math.floor(rnd() * 3) };
  });
}

/**
 * The carpet: patches beside every arch on the glade's side (and over the stub of a sleeping one) and between the
 * ends of the roots (the six roots of ./tree-look.ts start at 0.5 rad and are 60° apart). Off the paths and the
 * passage of an open arch; the ferns, two metres across, keep further from a path.
 */
function placeCarpet(openArches: readonly ArchSpot[], pebbles: readonly GladeItem[], rnd: () => number): GladeItem[] {
  const opened = new Set(openArches.map(shelfOf));
  const centres: { x: number; z: number; spread: number }[] = [];
  for (const p of PORTALS) {
    for (const side of [-1, 1]) centres.push({ ...fromArch(p, side * 2.8, -1.6), spread: 1.4 });
    if (!opened.has(p.shelf)) centres.push({ ...fromArch(p, 0, -2), spread: 1.1 });
  }
  for (let i = 0; i < 6; i++) {
    const a = 0.5 + (i + 0.5) * (Math.PI / 3), r = ROOTS_EDGE - 1;
    centres.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, spread: 1.3 });
  }
  const out: GladeItem[] = [];
  COUNTS.carpet.forEach((n, kind) => {
    const keep = kind === 0 ? 1.2 : 0.45;
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 60; tries++) {
      const c = centres[(placed * 7 + kind * 3 + tries) % centres.length];
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * c.spread, x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
      const r = Math.hypot(x - TREE.x, z - TREE.z);
      if (r < trunkR(0) + 0.8 || r > RADIUS - 0.8) continue;
      if (pebbles.some((p) => Math.hypot(p.x - x, p.z - z) < keep)) continue;
      if (openArches.some((o) => inPassage(o, x, z))) continue;
      if (nearStump(x, z, 0.2)) continue;
      out.push({ x, z, s: 0.75 + rnd() * 0.5, rot: rnd() * Math.PI * 2, kind });
      placed++;
    }
  });
  return out;
}

/** m: the motes rise from the grass to this height, then begin again below. */
export const MOTE_H = 7;
/**
 * The motes: `n` points over the glade (to 17 m from the middle, a little thicker toward it), each with where it
 * starts (x, a height under MOTE_H, z) and its seed: a phase 0..1 and its speed upward, m/s.
 */
export function placeMotes(n: number, rnd = mulberry32(3401)) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = 3 + Math.pow(rnd(), 0.7) * 14;
    pos.set([Math.sin(a) * r, rnd() * MOTE_H, Math.cos(a) * r], i * 3);
    seed.set([rnd(), 0.12 + rnd() * 0.22], i * 2);
  }
  return { pos, seed };
}

/** One model's part at many placements, with how much its top sways (0 - not at all) and how deep it sits. */
export interface Piece { part: Part; items: readonly Placement[]; sway: number; sink: number }

/**
 * Merges the parts at their placements into ONE static geometry (indexed; position, normal, uv and `aWind`: the
 * x, z of the plant's foot and its sway over its scale, so every plant bends in a gust of its own place). The parts
 * of one draw must share a material: the caller groups them so.
 */
export function bakeParts(pieces: readonly Piece[]): THREE.BufferGeometry {
  let verts = 0, idx = 0;
  for (const p of pieces) {
    const g = p.part.geo, nv = g.getAttribute('position').count;
    verts += nv * p.items.length; idx += (g.index ? g.index.count : nv) * p.items.length;
  }
  const pos = new Float32Array(verts * 3), nrm = new Float32Array(verts * 3), uv = new Float32Array(verts * 2), wind = new Float32Array(verts * 3);
  const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  let v = 0, k = 0;
  for (const { part, items, sway, sink } of pieces) {
    const g = part.geo, P = g.getAttribute('position'), N = g.getAttribute('normal'), U = g.getAttribute('uv'), I = g.index;
    for (const it of items) {
      const c = Math.cos(it.rot), s = Math.sin(it.rot), base = v;
      for (let i = 0; i < P.count; i++, v++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        // a turn about y as Quaternion.setFromAxisAngle(up, rot) makes it (src/core/instancing.ts), then the scale
        pos[v * 3] = it.x + (x * c + z * s) * it.s; pos[v * 3 + 1] = y * it.s - sink; pos[v * 3 + 2] = it.z + (-x * s + z * c) * it.s;
        if (N) { const nx = N.getX(i), nz = N.getZ(i); nrm[v * 3] = nx * c + nz * s; nrm[v * 3 + 1] = N.getY(i); nrm[v * 3 + 2] = -nx * s + nz * c; } else nrm[v * 3 + 1] = 1;
        if (U) { uv[v * 2] = U.getX(i); uv[v * 2 + 1] = U.getY(i); }
        wind[v * 3] = it.x; wind[v * 3 + 1] = it.z; wind[v * 3 + 2] = sway / it.s;
      }
      if (I) for (let i = 0; i < I.count; i++) index[k++] = base + I.getX(i);
      else for (let i = 0; i < P.count; i++) index[k++] = base + i;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('aWind', new THREE.BufferAttribute(wind, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

/**
 * The material of one merged mesh: the part's texture (an untextured part - the plain bush - takes the green the
 * first world gives it), facets where the surface is solid, a two-sided cut-out lit alike on both sides for leaves,
 * and the wind of src/core/materials.ts read per plant from `aWind` (a merged mesh has no instance matrix to read).
 */
function gladeMaterial(part: Part, sways: boolean): THREE.MeshStandardMaterial {
  const mat = propMaterial(0, {
    vertexColors: false, map: part.map, color: part.map ? '#ffffff' : '#63c356', roughness: 0.9,
    alphaTest: part.cutout ? 0.5 : 0, side: part.cutout ? THREE.DoubleSide : THREE.FrontSide, flatShading: !part.cutout,
  });
  mat.onBeforeCompile = (sh) => {
    if (sways) {
      sh.uniforms.uTime = uTime; sh.uniforms.uSway = uSway;
      sh.vertexShader = 'uniform float uTime;\nuniform float uSway;\nattribute vec3 aWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float gust = sin(uTime * 1.5 + aWind.x * 0.31 + aWind.y * 0.27) * 0.6 + sin(uTime * 2.9 + aWind.x * 0.83 - aWind.y * 0.6) * 0.3;
        float bend = max(position.y, 0.0) * max(position.y, 0.0) * aWind.z * uSway;
        transformed.x += gust * bend;
        transformed.z += cos(uTime * 1.1 + aWind.y * 0.4) * bend * 0.5;`);
    }
    if (part.cutout) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace(/gl_FrontFacing \? 1\.0 : - ?1\.0/, '1.0'));
    }
    fadeAtCamera(sh);   // a bush at the lens dissolves, one between the camera and her is looked through
  };
  mat.customProgramCacheKey = () => `glade|${sways}|${part.cutout}|fade`;
  return mat;
}

/** The motes' shader: they rise, sway, are sized by distance and drawn as soft warm discs. */
const MOTE_VERT = /* glsl */ `
  uniform float uTime, uPx, uSize, uHeight;
  attribute vec2 aSeed;
  varying float vAlpha;
  #include <fog_pars_vertex>
  void main() {
    float ph = aSeed.x * 6.2832;
    vec3 p = position;
    p.y = mod(position.y + uTime * aSeed.y, uHeight) + 0.15;
    p.x += sin(uTime * 0.7 + ph) * 0.45 + sin(uTime * 1.9 + ph * 2.0) * 0.12;
    p.z += cos(uTime * 0.6 + ph * 1.3) * 0.45;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float h = (p.y - 0.15) / uHeight;
    vAlpha = smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.7, 1.0, h)) * (0.6 + 0.4 * sin(uTime * 2.3 + ph * 5.0));
    gl_PointSize = clamp(uSize * (0.7 + 0.6 * aSeed.x) * projectionMatrix[1][1] * uPx / -mvPosition.z, 1.0, 22.0);
    #include <fog_vertex>
  }`;
const MOTE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.25, 1.0, d)) * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(uColor * (1.0 + 0.5 * (1.0 - d)), a);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

/** How many motes, how big (m) and of which warm colour. */
const MOTES = { n: 150, size: 0.07, colour: '#ffe2a0' } as const;

function buildMotes(): { points: THREE.Points; uTime: THREE.IUniform<number> } {
  const { pos, seed } = placeMotes(MOTES.n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  // the shader moves them within this: the glade, from the grass to over MOTE_H, and their sway
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, MOTE_H / 2, 0), 19);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uPx: { value: 360 }, uSize: { value: MOTES.size }, uHeight: { value: MOTE_H }, uColor: { value: new THREE.Color(MOTES.colour) },
  }]);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false, fog: true });
  const points = new THREE.Points(geo, mat);
  points.name = 'glade-motes';
  const buffer = new THREE.Vector2();
  // the size in pixels follows the drawing buffer (half its height: the projection's unit)
  points.onBeforeRender = (renderer) => { uniforms.uPx.value = renderer.getDrawingBufferSize(buffer).y * 0.5; };
  return { points, uTime: uniforms.uTime };
}

/** What `buildGladeLook` puts into the scene: everything under `root`, `update(time)` for the frame's animate. */
export interface GladeLook { root: THREE.Group; update(time: number): void }

/** The sway of each kind at its top (as the first world sways them, src/worlds/fairy/scenery.ts). */
const SWAY = { bush: 0.03, fern: 0.25, clover: 0, flowers: 0.45 } as const;

/**
 * Puts the glade's dress into `scene` (see the header) for these open arches; `block(x, z, r)` gets the bushes' and
 * rocks' colliders. Deterministic: the same picture for the same open arches.
 */
export function buildGladeLook(scene: THREE.Scene, loads: GladeLoads, openArches: readonly ArchSpot[], block: (x: number, z: number, r: number) => void): GladeLook {
  const plan = placeGlade(openArches);
  for (const c of plan.colliders) block(c.x, c.z, c.r);
  const of = (items: readonly GladeItem[], kind: number) => items.filter((i) => i.kind === kind);

  // Every part of every model with its placements, then one mesh per material (the parts' name: one texture each).
  const pieces: Piece[] = [];
  const add = (parts: Part[], items: readonly Placement[], sway: number, sink = 0.04) => { if (items.length) for (const part of parts) pieces.push({ part, items, sway, sink }); };
  loads.pebbles.forEach((parts, k) => { add(parts, of(plan.paths.flat(), k), 0, 0.03); add(parts, of(plan.stubs, k), 0, 0.06); });
  loads.rocks.forEach((parts, k) => add(parts, of(plan.rocks, k), 0, 0.08));
  loads.bushes.forEach((parts, k) => add(parts, of(plan.bushes, k), SWAY.bush));
  const carpetSway = [SWAY.fern, SWAY.clover, SWAY.clover, SWAY.flowers];
  loads.carpet.forEach((parts, k) => add(parts, of(plan.carpet, k), carpetSway[k], 0.03));

  const root = new THREE.Group();
  root.name = 'glade-look';
  const groups = new Map<string, Piece[]>();
  for (const p of pieces) { const key = `${p.part.name}|${p.part.cutout}`; (groups.get(key) ?? groups.set(key, []).get(key)!).push(p); }
  for (const [key, list] of groups) {
    const mesh = new THREE.Mesh(bakeParts(list), gladeMaterial(list[0].part, list.some((p) => p.sway > 0)));
    mesh.name = 'glade-' + key;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // The shadows of the bushes and rocks: low-poly stand-ins a little inside them, only in the sun's shadow map.
  root.add(shadowStandIns(plan));

  const motes = buildMotes();
  root.add(motes.points);
  scene.add(root);
  return { root, update: (time) => { motes.uTime.value = time; } };
}

/** One merged mesh of icosahedra, one per bush and rock, drawn into the shadow map only (`colorWrite` off). */
function shadowStandIns(plan: GladePlan): THREE.Mesh {
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const shapes: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), sc = new THREE.Vector3();
  const put = (it: GladeItem, rx: number, ry: number, y: number) => {
    shapes.push(ico.clone().applyMatrix4(m.compose(at.set(it.x, y * it.s, it.z), q.setFromAxisAngle(up, it.rot), sc.set(rx * it.s, ry * it.s, rx * it.s * 0.9))));
  };
  for (const b of plan.bushes) put(b, 0.62, 0.5, 0.6);
  for (const r of plan.rocks) put(r, 0.5, 0.34, 0.32);
  const geo = shapes.length ? mergeAll(shapes) : new THREE.BufferGeometry();
  ico.dispose(); for (const s of shapes) s.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  mesh.name = 'glade-shadows';
  mesh.castShadow = true; mesh.receiveShadow = false;
  return mesh;
}

/** Merges non-indexed geometries of the same attributes (the stand-ins) - positions only, all the shadow needs. */
function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g).getAttribute('position'));
  const pos = new Float32Array(parts.reduce((n, p) => n + p.count * 3, 0));
  let o = 0;
  for (const p of parts) { pos.set(p.array as Float32Array, o); o += p.count * 3; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeBoundingSphere();
  return out;
}

/** The most the glade may add to the frame (TECH-06): triangles and draw calls, the shadow pass counted. */
export const GLADE_BUDGET = { triangles: 55_000, draws: 11 } as const;

/**
 * What the glade draws per frame: triangles (a shadow caster's twice: once more in the sun's shadow pass) and draw
 * calls (a caster: two; the motes: one, no triangles) - as renderer.info counts them.
 */
export function gladeCost(root: THREE.Object3D): { triangles: number; draws: number } {
  let triangles = 0, draws = 0;
  root.traverse((o) => {
    if ((o as THREE.Points).isPoints) { draws++; return; }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry, tris = (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3, passes = mesh.castShadow ? 2 : 1;
    if (!tris) return;
    triangles += tris * passes; draws += passes;
  });
  return { triangles, draws };
}
