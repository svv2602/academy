import * as THREE from 'three';
import type { CollectDef, CollectItem } from '../../game/collections';
import { HOP_LIFT } from '../../game/collections';
import { POND } from './layout';
import { WATER_Y, colliders, height } from './terrain';

/**
 * The collections of the Fairy Kingdom (PLAY-25): butterflies, acorns,
 * mushrooms and feathers, six of each, and what they need of the valley - six young oaks to hang the acorns on and four
 * supports to jump up onto (two stumps, two flat stones). Their places are checked by ./collect.test.ts.
 */

/** A young oak of the acorns: its trunk, and how high it is. */
export interface Oak { x: number; z: number; h: number }
/** A support she jumps up onto and stands on (WorldGround.support): round, its top `top` m over the ground. */
export interface Support { x: number; z: number; r: number; top: number; kind: 'stump' | 'stone' }

export const OAKS: readonly Oak[] = [
  // the crown of the tree starts at about 0.4 of its height: over the acorns a jump high, and the potion's
  { x: 12, z: 27, h: 7 }, { x: -48, z: 6, h: 7 }, { x: -36, z: -33, h: 7 }, { x: -12, z: 30, h: 7 },
  { x: 33, z: -12, h: 10 }, { x: -21, z: -51, h: 10 },
];
export const SUPPORTS: readonly Support[] = [
  { x: -60, z: -15, r: 0.6, top: 0.7, kind: 'stump' }, { x: -15, z: 39, r: 0.6, top: 0.7, kind: 'stump' },
  { x: 45, z: 18, r: 0.95, top: 0.8, kind: 'stone' }, { x: -45, z: 24, r: 0.95, top: 0.8, kind: 'stone' },
];
/** m: she steps up onto a support from this much below its top (a jump), not from lower (walking into its side). */
export const STEP_UP = 0.35;

/** A acorn `out` m from the trunk of a oak, toward the middle of the valley (the side she comes from), `y` m high. */
const acorn = (p: Oak, out: number, y: number, way: 'jump' | 'potion'): CollectItem => {
  const d = Math.hypot(p.x, p.z) || 1;
  return { kind: 'acorn', way, x: p.x - (p.x / d) * out, z: p.z - (p.z / d) * out, y };
};
const onTop = (s: Support, kind: 'mushroom' | 'feather'): CollectItem => ({ kind, way: 'hop', x: s.x, z: s.z, y: s.top + HOP_LIFT });
/** On the water of the pond: the height over its bed, so the find floats on its surface. */
const onWater = (x: number, z: number): CollectItem => ({ kind: 'feather', way: 'tap', x, z, y: WATER_Y + 0.12 - height(x, z) });

/** The 24 finds; their order is their number in the save (ws.found): only ever added to at the end. */
export const COLLECT: CollectDef = {
  items: [
    // mushrooms: four in the grass, two on the stumps
    { kind: 'mushroom', way: 'run', x: -28.7, z: 33.6, y: 0.28 }, { kind: 'mushroom', way: 'run', x: 22.2, z: 10.6, y: 0.28 },
    { kind: 'mushroom', way: 'run', x: -39, z: 39, y: 0.28 }, { kind: 'mushroom', way: 'run', x: -18, z: -33, y: 0.28 },
    onTop(SUPPORTS[0], 'mushroom'), onTop(SUPPORTS[1], 'mushroom'),
    // acorns: four a jump high, two only with the jumping potion (src/game/collections.ts, ./collect.test.ts)
    acorn(OAKS[0], 1, 2.5, 'jump'), acorn(OAKS[1], 1, 2.5, 'jump'), acorn(OAKS[2], 1, 2.5, 'jump'), acorn(OAKS[3], 1, 2.5, 'jump'),
    acorn(OAKS[4], 0.8, 4.1, 'potion'), acorn(OAKS[5], 0.8, 4.1, 'potion'),
    // feathers: three on the pond (out of her wading reach: touched), two on the flat stones, one in the grass
    onWater(POND.x + 3.3, POND.z + 2.3), onWater(POND.x - 4.2, POND.z + 2), onWater(POND.x - 0.6, POND.z - 5.4),
    onTop(SUPPORTS[2], 'feather'), onTop(SUPPORTS[3], 'feather'),
    { kind: 'feather', way: 'run', x: 27, z: 0, y: 0.15 },
    // butterflies: two flocks of two on meadows, two that fly off round their place
    { kind: 'butterfly', way: 'run', x: -48, z: -12, y: 0.6, flock: 0 }, { kind: 'butterfly', way: 'run', x: -49.6, z: -12.8, y: 0.6, flock: 0 },
    { kind: 'butterfly', way: 'run', x: -51, z: 36, y: 0.6, flock: 1 }, { kind: 'butterfly', way: 'run', x: -52.6, z: 35.2, y: 0.6, flock: 1 },
    { kind: 'butterfly', way: 'chase', x: 24, z: 45, y: 1.2 }, { kind: 'butterfly', way: 'chase', x: -42, z: 15, y: 1.2 },
  ],
};

/** The top of the support at (x, z) when her feet at `feet` are up to STEP_UP below it (WorldGround.support), else null. */
export function support(x: number, z: number, feet: number): number | null {
  for (const s of SUPPORTS) {
    if (Math.hypot(x - s.x, z - s.z) > s.r) continue;
    const top = height(s.x, s.z) + s.top;
    if (feet >= top - STEP_UP) return top;
  }
  return null;
}

/** m: how far from a find the valley's random rocks and bushes keep away (./scenery.ts): none hides or blocks one. */
export const FIND_CLEAR = 2.2;
/** Whether (x, z) is clear of every find, oak and support of the collections. */
export const clearOfFinds = (x: number, z: number) =>
  [...COLLECT.items, ...OAKS, ...SUPPORTS].every((p) => Math.hypot(p.x - x, p.z - z) >= FIND_CLEAR);

/**
 * The colliders of the oaks and the supports (a support's lets her over it once she is up there: ./terrain.ts
 * `resolve`), and the supports in the scene: two draw calls, one a kind. The oaks are drawn with the valley's trees
 * (./scenery.ts).
 */
export function buildCollectProps(scene: THREE.Scene) {
  for (const p of OAKS) colliders.push({ x: p.x, z: p.z, r: 0.45 });
  for (const s of SUPPORTS) colliders.push({ x: s.x, z: s.z, r: s.r, top: height(s.x, s.z) + s.top - STEP_UP });
  const paint = (geo: THREE.BufferGeometry, side: string, top: string, at: number) => {
    const g = geo.toNonIndexed(), pos = g.getAttribute('position'), a = new THREE.Color(side), b = new THREE.Color(top), c: number[] = [];
    for (let i = 0; i < pos.count; i++) { const k = pos.getY(i) > at ? b : a; c.push(k.r, k.g, k.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.deleteAttribute('uv');
    return g;
  };
  const kinds = {
    stump: paint(new THREE.CylinderGeometry(1, 1.12, 1, 9).translate(0, 0.5, 0), '#7a5232', '#d9b27c', 0.98),
    stone: paint(new THREE.CylinderGeometry(1, 1.08, 1, 7).translate(0, 0.5, 0), '#9a9aa0', '#b8b8bf', 0.98),
  } as const;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const kind of ['stump', 'stone'] as const) {
    const own = SUPPORTS.filter((s) => s.kind === kind);
    const mesh = new THREE.InstancedMesh(kinds[kind], mat, own.length);
    mesh.name = `support-${kind}`;
    own.forEach((s, i) => {
      // sunk a little into the ground, so a slope shows no gap under it
      const y = height(s.x, s.z);
      mesh.setMatrixAt(i, m4.compose(at.set(s.x, y - 0.25, s.z), q.setFromAxisAngle(up, i * 1.7), sc.set(s.r, s.top + 0.25, s.r)));
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }
}
