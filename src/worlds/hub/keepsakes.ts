import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Save, WorldState } from '../../core/save';
import { fadeAtCamera } from '../../core/materials';
import { setDone, setKindsOf } from '../../game/collections';
import { knownWorlds, type ArtifactWorld } from '../../game/artifacts';
import { NESTS, PORTALS } from './layout';
import { barkRadius, treeHollow } from './tree-look';

/**
 * The Great Tree remembers the finds (the customer's word of 2026-11-20, docs/worlds/hub.md «Повторные входы»): every
 * secret found and every collection gathered whole in a world of the shelf hangs a keepsake on the Tree, by the nest of
 * that world, over the look of its stage (./tree-look.ts, R33 - the stages still count the artifacts alone). A keepsake
 * shows whole or not at all, so the child sees what it is for.
 *
 * Nothing is saved for it: the keepsakes are read from the world's own part of the save (`ws.flags[secret]`,
 * `ws.found` of its collections), as the stage is read from the finals. A world gives at most KEEPSAKES_PER_WORLD.
 * The Fairy Kingdom has seven of its own shapes (below); a secret or a set of another world, not drawn yet, hangs a
 * glowing bead of its world's colour by its nest, so nothing it found goes unseen.
 *
 * All the keepsakes are one geometry, one draw call: vertex-coloured, glowing a little by their own colour (no light),
 * dissolving at the lens with the trunk they sit on (`fadeAtCamera`).
 */

/** A keepsake: the world it is of, and what it is for - `secret:<flag>` or `set:<kind>`. */
export interface Keepsake { world: string; id: string }

export const KEEPSAKES_PER_WORLD = 7;
/** The cost of the fairy world's seven together (./keepsakes.test.ts holds it). */
export const KEEPSAKE_BUDGET = { triangles: 3000, draws: 1 } as const;

/** The world's part of the save, read without creating it. */
const stored = (save: Save, id: string): Partial<WorldState> => {
  const w = save.worlds[id] as unknown;
  return typeof w === 'object' && w !== null ? w as Partial<WorldState> : {};
};

/** The keepsakes earned over the worlds of the shelf: its secrets found first, then its sets gathered, in their order. */
export function keepsakesOf(save: Save, worlds: readonly ArtifactWorld[] = knownWorlds()): Keepsake[] {
  const out: Keepsake[] = [];
  for (const w of worlds) {
    if (w.shelf === undefined) continue;
    const ws = stored(save, w.id), flags = (ws.flags ?? {}) as Record<string, unknown>;
    const found = Array.isArray(ws.found) ? ws.found.filter((n) => Number.isInteger(n)) : [];
    const mine: Keepsake[] = [];
    for (const s of w.secrets ?? []) if (flags[s] === true) mine.push({ world: w.id, id: `secret:${s}` });
    if (w.collect) for (const k of setKindsOf(w.collect)) if (setDone(w.collect, k, found)) mine.push({ world: w.id, id: `set:${k}` });
    out.push(...mine.slice(0, KEEPSAKES_PER_WORLD));
  }
  return out;
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler();

/** One shape, painted one colour, moved by `m` (non-indexed, position + normal + color). */
function bake(g: THREE.BufferGeometry, m: THREE.Matrix4, hex: string): THREE.BufferGeometry {
  const s = g.index ? g.toNonIndexed() : g;
  s.deleteAttribute('uv');
  s.applyMatrix4(m);
  const c = new THREE.Color(hex), n = s.getAttribute('position').count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  s.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (s !== g) g.dispose();
  return s;
}

/** A point on the bark: `da` round from the nest's side `a`, `y` high, `out` m off the bark. */
const onBark = (a: number, y: number, out: number) => {
  const r = barkRadius(y, a) + out;
  return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
};
/** A matrix at `p`, turned to face out along the side `a` (+z of the shape outward), tipped by `tilt` (x, z). */
const at = (p: THREE.Vector3, a: number, tilt = 0, roll = 0, s = 1) =>
  new THREE.Matrix4().compose(p, _q.setFromEuler(_e.set(tilt, a, roll, 'YXZ')), new THREE.Vector3(s, s, s));

type Draw = (a: number, nestY: number) => THREE.BufferGeometry[];

/** The chest: a golden ribbon round the trunk under the nest, a bow on the nest's side. */
const ribbon: Draw = (a, nestY) => {
  const y = nestY - 1.2, pts: THREE.Vector3[] = [];
  for (let i = 0; i < 40; i++) { const t = (i / 40) * Math.PI * 2; pts.push(onBark(t, y + 0.06 * Math.sin(t * 3), 0.05)); }
  const band = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 40, 0.07, 4, true);
  const front = onBark(a, y, 0.12);
  const loop = (side: number) => bake(new THREE.TorusGeometry(0.14, 0.05, 4, 8).scale(1, 0.7, 0.6), at(front.clone().add(new THREE.Vector3(Math.cos(a) * side * 0.14, 0.02, -Math.sin(a) * side * 0.14)), a, 0, side * 0.5), '#ffcf4a');
  const tail = (side: number) => bake(new THREE.BoxGeometry(0.07, 0.3, 0.02), at(front.clone().add(new THREE.Vector3(Math.cos(a) * side * 0.08, -0.17, -Math.sin(a) * side * 0.08)), a, 0, side * 0.3), '#f2b632');
  return [bake(band, new THREE.Matrix4(), '#f2c14e'), loop(-1), loop(1), tail(-1), tail(1)];
};

/** The glade behind the waterfall: a garland of blue flowers across the trunk, sagging under the nest. */
const garland: Draw = (a, nestY) => {
  const out: THREE.BufferGeometry[] = [], pts: THREE.Vector3[] = [];
  const N = 11, span = 0.75;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1) - 0.5, y = nestY - 0.55 - 0.35 * (1 - (2 * u) ** 2);
    pts.push(onBark(a + u * 2 * span, y, 0.07));
  }
  out.push(bake(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.022, 3), new THREE.Matrix4(), '#4f8a3a'));
  pts.forEach((p, i) => {
    const big = i % 2 === 0, face = Math.atan2(p.x, p.z);
    out.push(bake(new THREE.IcosahedronGeometry(big ? 0.11 : 0.08, 0).scale(1, 1, 0.55), at(p, face), big ? '#7fc8ff' : '#b8e2ff'));
    if (big) out.push(bake(new THREE.OctahedronGeometry(0.04, 0), at(onBark(face, p.y, 0.14), face), '#fff6c8'));
  });
  return out;
};

/** The fairy house: its music box sits in the hollow, its lid aglow. */
const musicBox: Draw = () => {
  const h = treeHollow(), p = new THREE.Vector3(Math.sin(h.a) * (h.r - 0.04), h.y - h.h * 0.62, Math.cos(h.a) * (h.r - 0.04));
  const box = bake(new THREE.BoxGeometry(0.34, 0.2, 0.24), at(p, h.a), '#c98a3c');
  const lid = bake(new THREE.BoxGeometry(0.36, 0.06, 0.26), at(p.clone().add(new THREE.Vector3(0, 0.13, 0)), h.a, -0.25), '#ffe08a');
  const gem = bake(new THREE.OctahedronGeometry(0.05, 0), at(p.clone().add(new THREE.Vector3(Math.sin(h.a) * 0.13, 0.02, Math.cos(h.a) * 0.13)), h.a), '#ff8fd0');
  return [box, lid, gem];
};

/** A butterfly resting on the bark, wings half open. */
const restingButterfly = (p: THREE.Vector3, a: number, turn: number, hex: string) => {
  const wing = (side: number) => {
    const g = new THREE.CircleGeometry(0.17, 5).scale(1, 0.8, 1).translate(side * 0.16, 0, 0);
    return bake(g, at(p, a, 0, turn).multiply(new THREE.Matrix4().makeRotationY(-side * 0.5)), hex);
  };
  const body = bake(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 3), at(p, a, 0, turn), '#3a2a4a');
  return [wing(-1), wing(1), body];
};
const butterflies: Draw = (a, nestY) => [
  ...restingButterfly(onBark(a - 0.45, nestY + 0.75, 0.04), a - 0.45, 0.4, '#c77dff'),
  ...restingButterfly(onBark(a + 0.4, nestY + 1.1, 0.04), a + 0.4, -0.3, '#e0a8ff'),
  ...restingButterfly(onBark(a - 0.15, nestY + 1.45, 0.04), a - 0.15, 0.1, '#b45cf2'),
];

/** An acorn on its string; the string's top at `top`. */
const hangingAcorn = (top: THREE.Vector3, len: number) => [
  bake(new THREE.CylinderGeometry(0.01, 0.01, len, 3, 1, true), new THREE.Matrix4().makeTranslation(top.x, top.y - len / 2, top.z), '#5a4630'),
  bake(new THREE.SphereGeometry(0.1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(top.x, top.y - len - 0.02, top.z), '#7a5232'),
  bake(new THREE.IcosahedronGeometry(0.1, 0).scale(1, 1.25, 1), new THREE.Matrix4().makeTranslation(top.x, top.y - len - 0.12, top.z), '#d8953f'),
];
/** Three acorns hang from the nest's rim, on the side of the glade. */
const acorns: Draw = (a, nestY) => {
  const r = barkRadius(nestY, a) + 0.35 + 0.55;
  return [-0.22, 0, 0.22].flatMap((da, i) => {
    const t = new THREE.Vector3(Math.sin(a + da) * r, nestY + 0.05, Math.cos(a + da) * r);
    return hangingAcorn(t, 0.3 + (i === 1 ? 0.2 : 0));
  });
};

/** Orange shelf mushrooms (not the pink of the meadow's) up the trunk under the nest, on the other side of it from the garland's end. */
const shelfMushrooms: Draw = (a, nestY) => [0, 1, 2].flatMap((i) => {
  const da = 0.95 + i * 0.12, y = nestY - 2.4 + i * 0.38, s = 1 - i * 0.18, p = onBark(a + da, y, -0.03);
  const cap = new THREE.CylinderGeometry(0.32 * s, 0.36 * s, 0.09, 8, 1, false, -Math.PI / 2, Math.PI);
  const gill = new THREE.CylinderGeometry(0.3 * s, 0.1 * s, 0.05, 8, 1, false, -Math.PI / 2, Math.PI).translate(0, -0.07, 0);
  return [bake(cap, at(p, a + da), '#ff9a2e'), bake(gill, at(p, a + da), '#ffe2a8')];
});

/** Three feathers stand up out of the nest, fanned toward the glade. */
const feathers: Draw = (a, nestY) => {
  const r = barkRadius(nestY, a) + 0.35;
  return [-0.9, 0, 0.9].flatMap((fan, i) => {
    const base = new THREE.Vector3(Math.sin(a) * (r + 0.1) + Math.cos(a) * fan * 0.25, nestY + 0.15, Math.cos(a) * (r + 0.1) - Math.sin(a) * fan * 0.25);
    const vane = new THREE.ConeGeometry(0.14, 1.1, 4).scale(1, 1, 0.25).translate(0, 0.6, 0);
    const quill = new THREE.CylinderGeometry(0.014, 0.014, 1.2, 3, 1, true).translate(0, 0.6, 0);
    const m = at(base, a, 0.3, fan * 0.75);
    return [bake(vane, m, ['#3f7fe0', '#2f6bd0', '#5a92ea'][i]), bake(quill, m, '#f4f8ff')];
  });
};

/** The keepsakes of the Fairy Kingdom, by what they are for. */
const FAIRY: Record<string, Draw> = {
  'secret:chest': ribbon, 'secret:glade': garland, 'secret:house': musicBox,
  'set:butterfly': butterflies, 'set:acorn': acorns, 'set:mushroom': shelfMushrooms, 'set:feather': feathers,
};
const SHAPES: Record<string, Record<string, Draw>> = { fairy: FAIRY };

/** A keepsake not drawn yet: a glowing bead of the world's colour, the `k`-th round its nest. */
const bead = (k: number, colour: string): Draw => (a, nestY) => {
  const da = (k % 2 ? 1 : -1) * (0.35 + 0.18 * Math.floor(k / 2));
  return [bake(new THREE.IcosahedronGeometry(0.13, 0), at(onBark(a + da, nestY - 0.5 - 0.15 * k, 0.1), a + da), colour)];
};

/** The geometry of the keepsakes `list`, one merged piece (null - none). */
export function keepsakeGeometry(list: readonly Keepsake[], worlds: readonly ArtifactWorld[] = knownWorlds()): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const nth = new Map<string, number>();
  for (const k of list) {
    const shelf = worlds.find((w) => w.id === k.world)?.shelf;
    if (shelf === undefined) continue;
    const n = NESTS[shelf], i = nth.get(k.world) ?? 0;
    nth.set(k.world, i + 1);
    const draw = SHAPES[k.world]?.[k.id] ?? bead(i, PORTALS[shelf].colour);
    parts.push(...draw(n.a, n.y));
  }
  if (!parts.length) return null;
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  return g;
}

/** The material: vertex colours, a little glow of their own colour (they read on the poor tree of the first stage). */
export function keepsakeMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.35;');
    fadeAtCamera(sh);
  };
  m.customProgramCacheKey = () => 'keepsake|fade';
  return m;
}

/** Hangs the keepsakes earned on the Tree: one mesh (or none), named `keepsakes`. */
export function buildKeepsakes(scene: THREE.Scene, save: Save, worlds: readonly ArtifactWorld[] = knownWorlds()): { mesh: THREE.Mesh | null; list: Keepsake[] } {
  const list = keepsakesOf(save, worlds), geo = keepsakeGeometry(list, worlds);
  if (!geo) return { mesh: null, list };
  const mesh = new THREE.Mesh(geo, keepsakeMaterial());
  mesh.name = 'keepsakes';
  mesh.castShadow = false; mesh.receiveShadow = false;
  scene.add(mesh);
  return { mesh, list };
}

