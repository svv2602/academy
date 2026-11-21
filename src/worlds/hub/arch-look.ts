import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fadeAtCamera } from '../../core/materials';
import { staticGeo } from '../../core/assets';
import { NESTS, PORTALS, trunkR, type PortalPlace } from './layout';

/**
 * The look of the arches and the nests of the hub (WORLD-01, docs/worlds/hub.md «Карта», «Модели»; the look after the
 * grey build of WORLD-12, step H). It takes the place of the grey `buildPortals` and `buildNests` of ./index.ts and
 * keeps their gameplay exactly: the same posts in the same places, the same passage, the same one-sided veil, the same
 * nests at the same heights - only the shapes change.
 *
 * The customer's words: «Вокруг Древа по кругу — пять порталов-арок, у каждого свой цвет и символ мира. Открытый
 * портал светится и «дышит»; закрытый — спит (серый, затянут лианами), рядом табличка-силуэт мира», and the arches
 * are «арки из камней + шейдер «завеса»». Everything here is the game's own shapes: no new files, nothing downloaded.
 * The one model is Crystal2 of the first world (rpg_items_pack/Crystal2, 7.5 KB, already in the installation): the
 * light of the crystal in its nest is the crystal itself, glowing (R7: its light, the crystal stays in its world).
 *
 * API (the main session wires it into ./index.ts):
 * - `loadArchLook(): Promise<ArchLoads>` - Crystal2 through `staticGeo`; a test hands in a fake geometry instead.
 * - `buildArches(scene, leadsTo, block): { arches: Arch[], update(time) }` - `arches` is what `buildPortals`
 *   returned: every `PortalPlace` with its `world` (null - sleeps), its `veil` and `at`; `block(x, z, r)` gets the two
 *   posts of every arch, in the order and at the places `buildPortals` gave them; `update(time)` breathes the veils
 *   and the runes (it replaces the opacity the grey build set in `animate`).
 * - `buildNestLook(scene, loads): { nests: NestLook[], update(time) }` - one nest per `NESTS` entry; `set(lit, colour)`
 *   lights or darkens the artifact of its shelf (what the grey `paint` did to the sphere), `lit` reads it back for
 *   `__game.hub.nests()`; `update(time)` turns the lit artifacts slowly.
 *
 * The budget (TECH-06, the S22): the grey frame was ≈57k triangles and ≈131 draw calls. All five arches and the five
 * nests together stay within `LOOK_BUDGET`: every arch is one merged, vertex-coloured mesh of stones (with its vines,
 * the sign's post and board on a sleeping one) - one material for all five - plus, when open, a merged mesh of glowing
 * runes and the veil; a sleeping one has its sign instead. The five nests are one merged mesh, the five artifacts one
 * mesh each (each lights on its own). So at most 3 calls an arch and 6 for the nests (21 at most, 17 with one arch
 * open, against the grey 54) and about 9k triangles with Crystal2 (116 of them) - see the test. No lamps: every glow is emissive (src/core/style.ts).
 * Nothing allocates per frame: `update` writes numbers into uniforms and materials made at build.
 *
 * Determinism: every jitter comes from a seeded generator (`seeded`), one seed per arch and one for the nests, so the
 * pictures - and the screenshots of the walkthrough - are the same at every run.
 */

/** What the look loads: the model of the crystal for the first nest. */
export interface ArchLoads { crystal: THREE.BufferGeometry }

/** The crystal's height in its nest, m. */
const CRYSTAL_H = 0.75;

/** Loads Crystal2 (rpg_items_pack, CC0; the first world's): the light of the crystal in the nest of shelf 0. */
export async function loadArchLook(): Promise<ArchLoads> {
  return { crystal: await staticGeo('rpg_items_pack/Crystal2', CRYSTAL_H) };
}

/**
 * The budget of the look in the frame: the five arches and the five nests together, all drawn (TECH-06: the grey
 * frame + this stays near the S22's limit). The shadow pass draws the casters a second time - it did the same in
 * the grey build, where the arches and the nests alone were 54 meshes.
 */
export const LOOK_BUDGET = { triangles: 15000, calls: 15 + 6 } as const;

/** The arch (local metres; x across the passage, y up, z through it - +z out of the glade before `rotation.y`). */
export const ARCH = {
  /** m from the middle of the arch to the middle of each post: the colliders stand here (as in the grey build). */
  post: 1.5,
  /** r of each post's collider. */
  postR: 0.5,
  /** the top of the posts, the centre of the round top */
  spring: 2.4,
  /** m: the free half-width of the passage, the radius of the round of its top inside the stones */
  inner: 1.2,
  /** m: the stones' depth through the arch */
  depth: 0.7,
} as const;
/** m: the veil fills the passage: from the ground to the inside of the top. */
const VEIL_H = ARCH.spring + ARCH.inner;

/** A seeded generator (Park-Miller, as the ring of the glade in ./index.ts): the same stones at every run. */
export function seeded(seed: number) {
  let s = Math.max(1, Math.floor(seed) % 2147483647);
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

type Rnd = () => number;
const jit = (rnd: Rnd, k: number) => (rnd() * 2 - 1) * k;

/**
 * Takes a shape into the merged mesh: placed by `m`, painted `colour` (vertex colours - one material for every shape),
 * only the position, the normal and the colour kept so that every part merges with every other.
 */
function bake(src: THREE.BufferGeometry, m: THREE.Matrix4, colour: THREE.Color): THREE.BufferGeometry {
  const flat = src.index ? src.toNonIndexed() : src;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', flat.getAttribute('position').clone());
  geo.applyMatrix4(m);
  geo.computeVertexNormals();
  const n = geo.getAttribute('position').count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = colour.r; col[i * 3 + 1] = colour.g; col[i * 3 + 2] = colour.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (flat !== src) flat.dispose();
  src.dispose();
  return geo;
}

/**
 * A cut stone: a box whose eight corners each move a little (the same corner the same way on every face, so the
 * stone stays closed) - low-poly, slightly irregular, 12 triangles.
 */
function stone(rnd: Rnd, w: number, h: number, d: number, k = 0.06): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(w, h, d);
  const corner = new Map<string, [number, number, number]>();
  const pos = box.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.sign(x)}${Math.sign(y)}${Math.sign(z)}`;
    let o = corner.get(key);
    if (!o) { o = [jit(rnd, k * w), jit(rnd, k * h), jit(rnd, k * d)]; corner.set(key, o); }
    pos.setXYZ(i, x + o[0], y + o[1], z + o[2]);
  }
  return box;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const place = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));

const UP = new THREE.Vector3(0, 1, 0);

/** A colour a little lighter or darker than `base`: no two stones of the same shade. */
const shade = (base: THREE.Color, rnd: Rnd, k = 0.09) => base.clone().multiplyScalar(1 + jit(rnd, k));

/** The stones of an arch with its keystone (an open arch's keystone carries a glowing diamond, `archRunes`). */
function archStones(rnd: Rnd, base: THREE.Color, keystoneInStones: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * ARCH.post;
    // the plinth, then four blocks up to the spring of the top, each turned and shifted a little
    parts.push(bake(stone(rnd, 0.86, 0.4, 0.86, 0.04), place(x, 0.2, 0, 0, jit(rnd, 0.08)), shade(base, rnd)));
    const blocks = 4, h = (ARCH.spring - 0.4) / blocks;
    for (let i = 0; i < blocks; i++) {
      const g = stone(rnd, 0.62 + jit(rnd, 0.04), h * 0.96, ARCH.depth - 0.04 + jit(rnd, 0.03));
      parts.push(bake(g, place(x + jit(rnd, 0.03), 0.4 + h * (i + 0.5), jit(rnd, 0.02), 0, jit(rnd, 0.07), jit(rnd, 0.02)), shade(base, rnd)));
    }
    // fallen rubble at the foot, outside the passage
    for (let i = 0; i < 2; i++) {
      const r = 0.13 + rnd() * 0.1;
      const g = new THREE.DodecahedronGeometry(r, 0);
      parts.push(bake(g, place(x + side * (0.5 + rnd() * 0.3), r * 0.6, (rnd() * 2 - 1) * 0.6, rnd() * 3, rnd() * 3, 0, 1, 0.7, 1), shade(base, rnd, 0.15)));
    }
  }
  // the round top: nine voussoirs on the circle of radius `post` round (0, spring); the middle one is the keystone
  const n = 9, R = ARCH.post;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI, key = i === (n - 1) / 2;
    if (key && !keystoneInStones) continue;
    const len = (Math.PI * R / n) * 0.93, thick = key ? 0.78 : 0.6, d = key ? ARCH.depth + 0.1 : ARCH.depth - 0.02 + jit(rnd, 0.03);
    const r = R + (key ? 0.09 : 0) + jit(rnd, 0.02);
    const g = stone(rnd, len, thick, d, 0.05);
    parts.push(bake(g, place(Math.cos(a) * r, ARCH.spring + Math.sin(a) * r, jit(rnd, 0.02), 0, 0, a - Math.PI / 2 + jit(rnd, 0.03)), shade(base, rnd)));
  }
  return parts;
}

/** The runes of an open arch: a diamond on each face of each post and of the keystone, on both sides of the passage. */
function archRunes(rnd: Rnd): THREE.BufferGeometry {
  const white = new THREE.Color(1, 1, 1), parts: THREE.BufferGeometry[] = [];
  // the keystone is a stone of the top (archStones); only a diamond on each of its faces glows - a whole glowing stone
  // read as a flat pale plate over the arch
  for (const face of [-1, 1]) parts.push(bake(new THREE.BoxGeometry(0.22, 0.22, 0.04), place(0, ARCH.spring + ARCH.post + 0.05, face * (ARCH.depth / 2 + 0.08), 0, 0, Math.PI / 4), white));
  for (const side of [-1, 1]) for (const face of [-1, 1]) {
    // a thin diamond standing proud of the face, at the height of a child's eyes
    parts.push(bake(new THREE.BoxGeometry(0.2, 0.2, 0.04), place(side * ARCH.post, 1.45, face * (ARCH.depth / 2 + 0.01), 0, 0, Math.PI / 4), white));
    parts.push(bake(new THREE.BoxGeometry(0.07, 0.07, 0.04), place(side * ARCH.post, 1.9, face * (ARCH.depth / 2 + 0.01), 0, 0, Math.PI / 4), white));
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

/**
 * The crest of an arch: the sign of its world, big and plain, standing on the keystone (in the arch's plane, its faces
 * to the glade and away) - so an arch is known by its world from across the glade, 20-30 m off, where the runes are
 * too small (≈1 m at 25 m: ≈28 px high in a 1280 x 720 frame, the camera's 55°). One shape per place of the shelf, as
 * its icon (PORTALS[shelf].icon): a crystal (💎), a leaf (💚), a scallop shell (🦪), a wrapped candy (♦️), a star (🌟).
 * Big facets, nothing smooth; local metres, the foot at y 0, white - painted by the caller.
 */
export const CREST = { y: ARCH.spring + ARCH.post + 0.42, h: 1.0 } as const;

/** Points of a flat outline turned into a faceted solid: a ridge down its middle on both faces (a star, a leaf). */
function ridged(outline: [number, number][], centre: [number, number], ridge: number): THREE.BufferGeometry {
  const p: number[] = [], n = outline.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = outline[i], [bx, by] = outline[(i + 1) % n];
    // front (+z) and back (-z): a fan from the raised middle; the outline itself is the sharp edge
    p.push(centre[0], centre[1], ridge, ax, ay, 0, bx, by, 0);
    p.push(centre[0], centre[1], -ridge, bx, by, 0, ax, ay, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return g;
}

const WHITE = new THREE.Color(1, 1, 1);

function crestCrystal(): THREE.BufferGeometry[] {
  // a tall six-sided gem (a point up, a short point down) and two small ones leaning out of its foot
  const gem = (r: number, up: number, down: number, m: THREE.Matrix4) => [
    bake(new THREE.ConeGeometry(r, up, 6, 1, true), _m.copy(m).multiply(new THREE.Matrix4().makeTranslation(0, down + up / 2, 0)), WHITE),
    bake(new THREE.ConeGeometry(r, down, 6, 1, true), _m.copy(m).multiply(new THREE.Matrix4().makeTranslation(0, down / 2, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI)), WHITE),
  ];
  return [
    ...gem(0.27, 0.68, 0.3, new THREE.Matrix4()),
    ...gem(0.13, 0.36, 0.12, place(-0.24, 0.02, 0, 0, 0, 0.55).clone()),
    ...gem(0.13, 0.3, 0.12, place(0.24, 0.02, 0, 0, 0, -0.5).clone()),
  ];
}

function crestLeaf(): THREE.BufferGeometry[] {
  // a pointed leaf, folded along its midrib (a ridge on each face), leaning a little, on a short stem
  const outline: [number, number][] = [[0, 0.16], [0.24, 0.3], [0.37, 0.52], [0.33, 0.74], [0.18, 0.92], [0, 1.04], [-0.18, 0.92], [-0.33, 0.74], [-0.37, 0.52], [-0.24, 0.3]];
  return [
    bake(ridged(outline, [0, 0.6], 0.11), place(0, 0, 0, 0, 0, -0.18), WHITE),
    bake(new THREE.BoxGeometry(0.07, 0.24, 0.07), place(0.02, 0.1, 0, 0, 0, -0.18), WHITE),
  ];
}

function crestShell(): THREE.BufferGeometry[] {
  // a scallop: a fan of ribs from its hinge (raised ribs, sunk furrows, a scalloped rim) on a flat back, and its ears
  const p: number[] = [], ribs = 14, hinge = [0, 0.12, 0.02];
  const rim = (k: number) => {
    const a = Math.PI * (0.1 + 0.8 * (k / ribs)), r = k % 2 ? 0.5 : 0.56;
    return [Math.cos(a) * r, 0.12 + Math.sin(a) * r * 1.05, k % 2 ? 0.02 : 0.14];
  };
  for (let k = 0; k < ribs; k++) {
    const a = rim(k), b = rim(k + 1), ab = [a[0], a[1], -0.08], bb = [b[0], b[1], -0.08];
    p.push(...hinge, ...a, ...b);                       // the ribbed face
    p.push(0, 0.12, -0.08, ...bb, ...ab);              // the flat back
    p.push(...a, ...bb, ...b, ...a, ...ab, ...bb);     // the rim between them
  }
  // close the two straight sides of the fan
  const first = rim(0), last = rim(ribs);
  p.push(...hinge, first[0], first[1], -0.08, ...first, ...hinge, 0, 0.12, -0.08, first[0], first[1], -0.08);
  p.push(...hinge, ...last, last[0], last[1], -0.08, ...hinge, last[0], last[1], -0.08, 0, 0.12, -0.08);
  const fan = new THREE.BufferGeometry();
  fan.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return [bake(fan, _m.identity(), WHITE), bake(new THREE.BoxGeometry(0.42, 0.16, 0.18), place(0, 0.08, -0.02), WHITE)];
}

function crestCandy(): THREE.BufferGeometry[] {
  // a wrapped sweet: a faceted ball and the two twists of its paper, wide at the ends
  const twist = (side: number) => bake(new THREE.ConeGeometry(0.22, 0.3, 5), place(side * 0.42, 0.34, 0, 0, 0, side * Math.PI / 2), WHITE);
  return [bake(new THREE.IcosahedronGeometry(0.31, 0), place(0, 0.34, 0, 0.3, 0.2, 0), WHITE), twist(-1), twist(1)];
}

function crestStar(): THREE.BufferGeometry[] {
  // five points round a raised middle on both faces
  const outline: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.22 : 0.52;
    outline.push([Math.cos(a) * r, 0.46 + Math.sin(a) * r]);
  }
  return [bake(ridged(outline, [0, 0.46], 0.17), _m.identity(), WHITE)];
}

/**
 * The crest of the Great Tree, on the arch to it in the first world: a short trunk under a round faceted crown, about
 * as tall as the other crests.
 */
export function crestTree(): THREE.BufferGeometry {
  const parts = [
    bake(new THREE.CylinderGeometry(0.08, 0.12, 0.4, 6), place(0, 0.2, 0), WHITE),
    bake(new THREE.IcosahedronGeometry(0.36, 0), place(0, 0.66, 0, 0.3, 0.2, 0, 1, 0.9, 0.8), WHITE),
    bake(new THREE.IcosahedronGeometry(0.22, 0), place(-0.28, 0.52, 0.04, 0.5, 0, 0), WHITE),
    bake(new THREE.IcosahedronGeometry(0.22, 0), place(0.28, 0.54, -0.04, 0, 0.6, 0), WHITE),
  ];
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

/** The crest of the place `shelf` (one shape per place; a place past the five takes the star). */
export function crestShape(shelf: number): THREE.BufferGeometry {
  const parts = [crestCrystal, crestLeaf, crestShell, crestCandy, crestStar][shelf]?.() ?? crestStar();
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

/** A vine: a tube that winds up a post and on over half the top, with leaves along it. */
function vine(rnd: Rnd, side: number, stem: THREE.Color, leaf: THREE.Color): THREE.BufferGeometry[] {
  const pts: THREE.Vector3[] = [], x0 = side * ARCH.post, turns = 2.2 + rnd(), up = ARCH.spring, phase = rnd() * Math.PI * 2;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, a = phase + t * turns * Math.PI * 2, rr = 0.42 + jit(rnd, 0.03);
    pts.push(new THREE.Vector3(x0 + Math.cos(a) * rr, 0.05 + t * up, Math.sin(a) * rr));
  }
  // over the top: along the outside of the round, swinging from face to face, to past its middle
  for (let i = 1; i <= 8; i++) {
    const t = i / 8, a = side > 0 ? t * (Math.PI * 0.55) : Math.PI - t * (Math.PI * 0.55);
    const rr = ARCH.post + 0.36 + jit(rnd, 0.04);
    pts.push(new THREE.Vector3(Math.cos(a) * rr, ARCH.spring + Math.sin(a) * rr, Math.sin(i * 1.7 + phase) * 0.38));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const parts = [bake(new THREE.TubeGeometry(curve, 44, 0.045, 4, false), _m.identity(), stem)];
  const at = new THREE.Vector3(), tan = new THREE.Vector3();
  for (let i = 0; i < 22; i++) {
    const t = (i + 0.5 + jit(rnd, 0.3)) / 22;
    curve.getPointAt(t, at); curve.getTangentAt(t, tan);
    const s = 0.8 + rnd() * 0.5;
    // a leaf: a flat diamond (an octahedron pressed thin) off the stem, turned any way
    parts.push(bake(new THREE.OctahedronGeometry(1, 0), place(at.x + jit(rnd, 0.06), at.y + jit(rnd, 0.06), at.z + jit(rnd, 0.06), rnd() * 3, rnd() * 6, rnd() * 3, 0.14 * s, 0.025, 0.09 * s), shade(leaf, rnd, 0.18)));
  }
  return parts;
}

/** The sign of a sleeping world: a board with its symbol by the arch (ported from the grey build, ./index.ts). */
function signTexture(icon: string, colour: string) {
  // A light board with the world's symbol as a silhouette in its colour, darkened, and a frame in its colour: read from
  // close by (a dark board with a grey symbol showed nearly nothing). 256 px: crisp at a step from it.
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  if (x) {
    x.fillStyle = '#efe2c4'; x.fillRect(0, 0, S, S);
    const shape = document.createElement('canvas'); shape.width = shape.height = S;
    const sx = shape.getContext('2d');
    if (sx) {
      sx.font = `${Math.round(S * 0.66)}px sans-serif`; sx.textAlign = 'center'; sx.textBaseline = 'middle';
      sx.fillText(icon, S / 2, S * 0.54);
      // the symbol's shape filled with the world's colour, darker: a silhouette, not the emoji's own colours
      sx.globalCompositeOperation = 'source-in';
      sx.fillStyle = new THREE.Color(colour).multiplyScalar(0.62).getStyle(); sx.fillRect(0, 0, S, S);
      x.drawImage(shape, 0, 0);
    }
    x.strokeStyle = colour; x.lineWidth = 14; x.strokeRect(7, 7, S - 14, S - 14);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Where the sign stands by a sleeping arch (local): beside it, a step in front of it on the glade's side. */
const SIGN = { x: 2.6, y: 1.3, z: -0.3, size: 1.1 } as const;

/**
 * The veil (own GLSL): a light in the world's colour swirling in the passage and breathing - brighter at the middle
 * and along the stones, cut to the shape of the passage (straight sides, round top). `vP` is the point in the
 * passage in metres, its foot at y 0.
 */
const VEIL_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = vec2(position.x, position.y + ${(VEIL_H / 2).toFixed(4)});
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const VEIL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uPhase;
uniform vec3 uColour;
varying vec2 vP;
void main() {
  const float SPRING = ${ARCH.spring.toFixed(4)};
  const float INNER = ${ARCH.inner.toFixed(4)};
  // how far inside the passage: to the posts below the spring, to the round above it
  float inside = vP.y < SPRING ? INNER - abs(vP.x) : INNER - length(vP - vec2(0.0, SPRING));
  if (inside <= 0.0) discard;
  float breathe = 0.5 + 0.5 * sin(uTime * 1.6 + uPhase);
  vec2 c = vP - vec2(0.0, SPRING * 0.8);
  float d = length(c), a = atan(c.y, c.x);
  float swirl = 0.5 + 0.5 * sin(a * 3.0 + d * 4.0 - uTime * 1.3);
  float swirl2 = 0.5 + 0.5 * sin(-a * 2.0 + d * 6.5 + uTime * 0.9 + 1.7);
  float glow = mix(swirl, swirl2, 0.45);
  float core = 1.0 - smoothstep(0.0, 1.7, d);
  float rim = 1.0 - smoothstep(0.0, 0.28, inside);
  vec3 col = mix(uColour, vec3(1.0), clamp(0.4 * core + 0.3 * glow * breathe + 0.35 * rim, 0.0, 1.0));
  float alpha = (0.26 + 0.2 * glow + 0.22 * core + 0.3 * rim) * (0.7 + 0.3 * breathe);
  // the very edge melts into the stones
  alpha *= smoothstep(0.0, 0.06, inside);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
  #include <colorspace_fragment>
}`;

/** The time of every veil: one uniform shared by all, set once a frame. */
const veilTime = { value: 0 };

function veilMaterial(colour: string, phase: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: veilTime, uPhase: { value: phase }, uColour: { value: new THREE.Color(colour) } },
    vertexShader: VEIL_VERT,
    fragmentShader: VEIL_FRAG,
    transparent: true,
    depthWrite: false,
    // one-sided, facing the glade: from the camera behind her as she arrives (outside the arch) it is not drawn
    side: THREE.FrontSide,
  });
}

/** One arch as `buildPortals` returned it, and the group it is built in. */
export type Arch = PortalPlace & { world: string | null; veil: THREE.Mesh; at: THREE.Vector3; group: THREE.Group };

/** The stone of an open arch; the stone of a sleeping one (grey, colder) and of its crest; the vines; the wood of the sign. */
const COLOURS = { open: '#b4ada2', sleeping: '#7d7a76', crest: '#8f8b86', stem: '#4a6b33', leaf: '#4f8f3c', wood: '#8a6142' } as const;

/** What one arch is built of: where it stands and faces, its colour and crest, open or asleep. */
export interface ArchSpec {
  x: number; z: number;
  /** The arch's turn (as PortalPlace.facing): its local +z points out, away from where she comes up to it. */
  facing: number;
  colour: string; icon: string;
  /** The sign of the world on the keystone (`crestShape`), not yet placed. */
  crest: THREE.BufferGeometry;
  open: boolean;
  /** The seed of its stones' jitter, and the phase of its breath. */
  seed: number; phase: number;
}

/**
 * One stone arch (the hub's five, and the arch to the Great Tree in the first world): its stones (with vines and the
 * sign when asleep), the veil facing the side she comes from, the glowing runes and crest when open. `block` gets its
 * posts. Returns its group, its veil and the material of its runes (breathed by `breathe`).
 */
export function buildArch(scene: THREE.Scene, a: ArchSpec, stoneMat: THREE.Material, block: (x: number, z: number, r: number) => void) {
  const rnd = seeded(a.seed);
  const group = new THREE.Group();
  group.position.set(a.x, 0, a.z); group.rotation.y = a.facing;
  for (const side of [-1, 1]) {
    // the posts keep a walker out; she passes between them
    block(a.x + Math.cos(a.facing) * side * ARCH.post, a.z - Math.sin(a.facing) * side * ARCH.post, ARCH.postR);
  }
  const parts = archStones(rnd, new THREE.Color(a.open ? COLOURS.open : COLOURS.sleeping), true);
  // the crest on the keystone: grey stone on a sleeping arch (in its stones), glowing with the runes on an open one
  const crest = a.crest.applyMatrix4(place(0, CREST.y, 0));
  if (!a.open) parts.push(bake(crest, _m.identity(), new THREE.Color(COLOURS.crest)));
  if (!a.open) {
    const stem = new THREE.Color(COLOURS.stem), leaf = new THREE.Color(COLOURS.leaf), wood = new THREE.Color(COLOURS.wood);
    parts.push(...vine(rnd, -1, stem, leaf), ...vine(rnd, 1, stem, leaf));
    // the sign's post and the board behind its picture
    parts.push(bake(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6, 1, true), place(SIGN.x, 0.45, SIGN.z + 0.05), wood));
    parts.push(bake(new THREE.BoxGeometry(SIGN.size + 0.1, SIGN.size + 0.1, 0.06), place(SIGN.x, SIGN.y, SIGN.z + 0.04, 0, 0, jit(rnd, 0.05)), wood));
  }
  const geo = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  const stones = new THREE.Mesh(geo, stoneMat);
  stones.castShadow = true; stones.receiveShadow = true;
  group.add(stones);

  const veil = new THREE.Mesh(new THREE.PlaneGeometry(ARCH.inner * 2, VEIL_H), veilMaterial(a.colour, a.phase));
  // one-sided, facing the side she comes from (the plane's front is its +z, turned to local -z)
  veil.position.y = VEIL_H / 2; veil.rotation.y = Math.PI; veil.visible = a.open;
  veil.renderOrder = 1;
  group.add(veil);

  let glow: THREE.MeshStandardMaterial | null = null;
  if (a.open) {
    glow = new THREE.MeshStandardMaterial({ color: a.colour, emissive: a.colour, emissiveIntensity: 1, roughness: 0.4, flatShading: true });
    const glyphs = [archRunes(rnd), bake(crest, _m.identity(), new THREE.Color(1, 1, 1))];
    const runes = new THREE.Mesh(mergeGeometries(glyphs, false)!, glow);
    for (const g of glyphs) g.dispose();
    runes.castShadow = true;
    group.add(runes);
  } else {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(SIGN.size, SIGN.size), new THREE.MeshStandardMaterial({ map: signTexture(a.icon, a.colour), roughness: 0.9 }));
    // facing the side she comes from (beside the arch, a step in front of it)
    sign.position.set(SIGN.x, SIGN.y, SIGN.z); sign.rotation.y = Math.PI;
    sign.receiveShadow = true;
    group.add(sign);
  }
  scene.add(group);
  return { group, veil, glow };
}

/** The stone of the arches: vertex-coloured, faceted, dissolving at the lens and looked through (fadeAtCamera). */
export function archStoneMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
  m.onBeforeCompile = (sh) => fadeAtCamera(sh);
  m.customProgramCacheKey = () => 'arch-stone|fade';
  return m;
}

/** Breathes veils and runes: in step, the veil's breath is the runes'. */
export function breathe(time: number, glows: readonly { mat: THREE.MeshStandardMaterial; phase: number }[]): void {
  veilTime.value = time;
  for (const g of glows) g.mat.emissiveIntensity = 0.9 + 0.5 * Math.sin(time * 1.6 + g.phase);
}

/**
 * The five arches round the tree: open ones breathe in their colour - the veil, the keystone and the runes - the
 * others sleep, grey and under vines, with the sign of their world. `block` gets the posts of every arch.
 */
export function buildArches(scene: THREE.Scene, leadsTo: readonly (string | null)[], block: (x: number, z: number, r: number) => void) {
  const stoneMat = archStoneMaterial();
  const glows: { mat: THREE.MeshStandardMaterial; phase: number }[] = [];
  const arches: Arch[] = PORTALS.map((p) => {
    const world = leadsTo[p.shelf] ?? null, open = world !== null;
    const { group, veil, glow } = buildArch(scene, {
      x: p.x, z: p.z, facing: p.facing, colour: p.colour, icon: p.icon, crest: crestShape(p.shelf), open, seed: 101 + p.shelf * 7919, phase: p.shelf * 1.3,
    }, stoneMat, block);
    if (glow) glows.push({ mat: glow, phase: p.shelf * 1.3 });
    return { ...p, world, veil, at: new THREE.Vector3(p.x, 0, p.z), group };
  });
  return {
    arches,
    /** Breathes the veils and the runes of the open arches: in step, the veil's breath is the runes'. */
    update(time: number) { breathe(time, glows); },
  };
}

/** One nest on the trunk: its shelf, the artifact in it, lit or dark. */
export interface NestLook {
  shelf: number;
  /** The artifact of the shelf in the nest (dark until its world's artifact is back). */
  artifact: THREE.Mesh;
  /** Lit: the artifact of this shelf is back - read back for `__game.hub.nests()`. */
  readonly lit: boolean;
  /** Lights the artifact in `colour` (the colour of its world) or darkens it. */
  set(lit: boolean, colour: string): void;
}

/** The dark artifact: a shape in the nest, no light (as the grey build's sphere). */
const DARK = '#4a4a4a';

/** A leaf for the forest: a flat oval with a midrib and a stem. */
function leafShape(): THREE.BufferGeometry {
  const c = new THREE.Color(1, 1, 1);
  const g = mergeGeometries([
    bake(new THREE.SphereGeometry(1, 8, 6), place(0, 0.3, 0, 0, 0, 0.25, 0.17, 0.3, 0.05), c),
    bake(new THREE.CylinderGeometry(0.02, 0.025, 0.25, 4, 1, true), place(-0.03, 0.06, 0, 0, 0, 0.25), c),
  ], false)!;
  return g;
}

/** A scallop shell for the sea: a fan of ribs, standing on its hinge. */
function shellShape(): THREE.BufferGeometry {
  const fan = new THREE.SphereGeometry(0.28, 12, 3, 0, Math.PI, 0, Math.PI / 2);
  const pos = fan.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.12 * Math.abs(Math.cos(a * 4.5));
    pos.setXYZ(i, x * k, pos.getY(i) * 0.45, z * k);
  }
  const c = new THREE.Color(1, 1, 1);
  // stand the fan up: its round edge upward, its hinge at the foot, its hollow toward the glade
  return mergeGeometries([
    bake(fan, place(0, 0.05, 0, -Math.PI / 2, 0, 0), c),
    bake(new THREE.BoxGeometry(0.14, 0.07, 0.06), place(0, 0.04, 0), c),
  ], false)!;
}

/** A wrapped candy for the sweets: a ball and the two twists of its paper. */
function candyShape(): THREE.BufferGeometry {
  const c = new THREE.Color(1, 1, 1);
  return mergeGeometries([
    bake(new THREE.SphereGeometry(0.17, 10, 7), place(0, 0.22, 0), c),
    bake(new THREE.ConeGeometry(0.11, 0.18, 6), place(-0.23, 0.22, 0, 0, 0, -Math.PI / 2), c),
    bake(new THREE.ConeGeometry(0.11, 0.18, 6), place(0.23, 0.22, 0, 0, 0, Math.PI / 2), c),
  ], false)!;
}

/** A star for the sky: five points, a little thick. */
function starShape(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.13 : 0.3;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false });
  return bake(g, place(0, 0.3, -0.05), new THREE.Color(1, 1, 1));
}

/** The nests on the trunk, one per shelf, each with the artifact of its world - the crystal's is Crystal2. */
/**
 * `extra`: what else by the Tree is drawn in the nests' call - it is there in every hub, so a thing in it costs no call
 * of its own (the cauldron, PLAY-26: the hub is at its 80 calls on the fourth stage with the pet).
 */
export function buildNestLook(scene: THREE.Scene, loads: ArchLoads, extra: readonly THREE.BufferGeometry[] = []) {
  const rnd = seeded(4242), twigs: THREE.BufferGeometry[] = [], dir = new THREE.Vector3();
  const bark = [new THREE.Color('#6d4b33'), new THREE.Color('#82603f'), new THREE.Color('#5a3d29')];
  const pick = () => bark[Math.floor(rnd() * bark.length)].clone().multiplyScalar(1 + jit(rnd, 0.08));
  const shapes = [loads.crystal, leafShape(), shellShape(), candyShape(), starShape()];
  const nests = NESTS.map((n): NestLook => {
    const r = trunkR(n.y) + 0.35, x = Math.sin(n.a) * r, z = Math.cos(n.a) * r;
    // the bowl: three woven rings, wider upward, each tipped a little; a cone closes its bottom
    for (const [dy, rr, tube] of [[-0.14, 0.34, 0.08], [-0.02, 0.48, 0.08], [0.1, 0.57, 0.075]] as const) {
      twigs.push(bake(new THREE.TorusGeometry(rr, tube, 4, 14), place(x, n.y + dy, z, Math.PI / 2 + jit(rnd, 0.1), jit(rnd, 0.1), rnd() * 6), pick()));
    }
    twigs.push(bake(new THREE.ConeGeometry(0.36, 0.26, 7, 1, true), place(x, n.y - 0.3, z, Math.PI), pick()));
    // loose twigs across the rim, sticking out any way
    for (let i = 0; i < 8; i++) {
      const a = rnd() * Math.PI * 2, len = 0.55 + rnd() * 0.35, rim = 0.5 + rnd() * 0.08;
      // along the rim (its tangent), tipped up or down and out a little
      dir.set(-Math.sin(a) + jit(rnd, 0.35), jit(rnd, 0.35), Math.cos(a) + jit(rnd, 0.35)).normalize();
      _m.compose(_p.set(x + Math.cos(a) * rim, n.y + 0.06 + jit(rnd, 0.06), z + Math.sin(a) * rim), _q.setFromUnitVectors(UP, dir), _s.set(1, 1, 1));
      twigs.push(bake(new THREE.CylinderGeometry(0.018, 0.026, len, 3, 1, true), _m, pick()));
    }
    const mat = new THREE.MeshStandardMaterial({ color: DARK, emissiveIntensity: 0, roughness: 0.5, flatShading: true });
    const artifact = new THREE.Mesh(shapes[n.shelf], mat);
    // sits in the bowl, its face to the glade (the nest is on the side of its arch)
    artifact.position.set(x, n.y - 0.08, z); artifact.rotation.y = n.a;
    const base = n.a;
    scene.add(artifact);
    let lit = false;
    return {
      shelf: n.shelf,
      artifact,
      get lit() { return lit; },
      set(on: boolean, colour: string) {
        lit = on;
        mat.color.set(on ? colour : DARK);
        mat.emissive.set(on ? colour : '#000000');
        mat.emissiveIntensity = on ? 1.4 : 0;
        if (!on) artifact.rotation.y = base;
      },
    };
  });
  twigs.push(...extra);
  const nestGeo = mergeGeometries(twigs, false)!;
  for (const g of twigs) g.dispose();
  const nestMesh = new THREE.Mesh(nestGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  nestMesh.castShadow = true; nestMesh.receiveShadow = true;
  scene.add(nestMesh);
  return {
    nests,
    nestMesh,
    /** Turns the lit artifacts slowly round, each from where it faced the glade. */
    update(time: number) {
      for (const n of nests) if (n.lit) n.artifact.rotation.y = NESTS[n.shelf].a + Math.sin(time * 0.7 + n.shelf) * 0.6;
    },
  };
}
