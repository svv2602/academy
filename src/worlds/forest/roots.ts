import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOTS } from './layout';
import { height } from './terrain';

/**
 * The cave under the roots (`roots`, the customer's word of 2026-11-27, docs/worlds/world-2.md «Секреты»): a mound of
 * earth under a fallen tree, its roots arching over the opening; a curtain of hanging rootlets parts round her as she
 * goes in; inside, glowing mushrooms along the back and the find at the back - a glowing stone among the roots. Dry and
 * low, unlike the cave behind the waterfall: no chest, the find is by walking up to it. The shapes here, the scene in
 * ./secrets.ts.
 */

/** m from the middle: the ring of the mound's lumps; rad: the half of its opening to `face`; the lumps' count. */
export const ROOTS_R = 3.0, ROOTS_OPEN = 0.62, ROOTS_LUMPS = 10;
/** m: the stone glows this far behind the middle (from the opening); she finds it this near it. */
export const STONE_BACK = 1.2, FIND_R = 1.3;
/** The rootlets of the curtain: across the opening, m apart; m from the lintel down; how near her one swings aside. */
export const ROOTLETS = 9, ROOTLET_GAP = 0.3, ROOTLET_L = 2.2, ROOTLET_TOP = 2.6, ROOTLET_PART = 1.6;
/**
 * The camera under the roots, m from her (as the cave behind the waterfall): ROOTS_CAM inside ROOTS_CAM_IN of the
 * middle, the usual distance from ROOTS_CAM_OUT on, a smooth step between; past the curtain it looks down steeply.
 */
export const ROOTS_CAM = 2.2, ROOTS_CAM_IN = 1.8, ROOTS_CAM_OUT = 5.2, ROOTS_PITCH = 1.0;
export function rootsCamDist(d: number, far: number): number {
  const k = Math.min(1, Math.max(0, (d - ROOTS_CAM_IN) / (ROOTS_CAM_OUT - ROOTS_CAM_IN)));
  return ROOTS_CAM + (far - ROOTS_CAM) * k * k * (3 - 2 * k);
}

/** The lumps of the mound: a horseshoe round its middle, open to `face` (they hold her out but at the opening). */
export function rootsLumps(): { x: number; z: number; r: number; h: number; spin: number }[] {
  const out: { x: number; z: number; r: number; h: number; spin: number }[] = [];
  for (let i = 0; i < ROOTS_LUMPS; i++) {
    const a = ROOTS.face + ROOTS_OPEN + (i / (ROOTS_LUMPS - 1)) * (Math.PI * 2 - 2 * ROOTS_OPEN);
    out.push({ x: ROOTS.x + Math.sin(a) * ROOTS_R, z: ROOTS.z + Math.cos(a) * ROOTS_R, r: 1.2 + (i % 3) * 0.2, h: 2.4 + (i % 2) * 0.5, spin: i * 1.9 });
  }
  return out;
}

/** Its places: the opening, the stone, the feet of the rootlets' line (across the opening, from its one side to the other). */
export function rootsOf() {
  const fx = Math.sin(ROOTS.face), fz = Math.cos(ROOTS.face);
  const opening = { x: ROOTS.x + fx * ROOTS_R, z: ROOTS.z + fz * ROOTS_R };
  const stone = { x: ROOTS.x - fx * STONE_BACK, z: ROOTS.z - fz * STONE_BACK };
  const rootlets = Array.from({ length: ROOTLETS }, (_, i) => { const k = (i - (ROOTLETS - 1) / 2) * ROOTLET_GAP; return { x: opening.x + fz * k, z: opening.z - fx * k }; });
  return { opening, stone, rootlets };
}

/** The fallen tree: its trunk's middle on the back of the mound, along it (`side`), and its plate of roots at one end. */
export function rootsTree() {
  const side = ROOTS.face + Math.PI / 2, back = ROOTS_R + 1.0;
  const trunk = { x: ROOTS.x - Math.sin(ROOTS.face) * back, z: ROOTS.z - Math.cos(ROOTS.face) * back };
  return { side, trunk, plate: { x: trunk.x + Math.sin(side) * 4.2, z: trunk.z + Math.cos(side) * 4.2 } };
}

/** One geometry of vertex colours: each part painted its colour, placed by its matrix. */
function paint(parts: readonly [THREE.BufferGeometry, string, THREE.Matrix4?][]): THREE.BufferGeometry {
  const c = new THREE.Color();
  return mergeGeometries(parts.map(([g, col, m]) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    if (m) n.applyMatrix4(m);
    n.deleteAttribute('uv');
    c.set(col);
    const k = n.attributes.position.count, a = new Float32Array(k * 3);
    for (let i = 0; i < k; i++) a.set([c.r, c.g, c.b], i * 3);
    n.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return n;
  }))!;
}

/** The mound, the fallen tree on it and the roots arching over the opening: one geometry, lit. */
export function rootsGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, string, THREE.Matrix4?][] = [];
  const m4 = () => new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const lump = new THREE.DodecahedronGeometry(1, 0);
  for (const k of rootsLumps()) {
    q.setFromEuler(new THREE.Euler(0, k.spin, 0.2 * Math.sin(k.spin * 3)));
    parts.push([lump, k.spin % 2 > 1 ? '#6b4a32' : '#5a7a3e', m4().compose(pv.set(k.x, height(k.x, k.z) + k.h * 0.4, k.z), q, sv.set(k.r, k.h, k.r))]);
  }
  const { opening } = rootsOf(), oy = height(opening.x, opening.z);
  // the fallen tree lying on the back of the mound (over the middle it stood in the camera's way: under the roots the
  // camera looks down from over her head, as in the cave behind the waterfall), its plate of roots on end at one side
  const t = rootsTree();
  q.setFromEuler(new THREE.Euler(0, t.side, Math.PI / 2, 'YXZ'));
  parts.push([new THREE.CylinderGeometry(0.75, 0.9, 8, 9), '#6b4c34', m4().compose(pv.set(t.trunk.x, height(t.trunk.x, t.trunk.z) + 3.0, t.trunk.z), q, sv.set(1, 1, 1))]);
  q.setFromEuler(new THREE.Euler(Math.PI / 2, t.side, 0, 'YXZ'));
  parts.push([new THREE.CylinderGeometry(2.0, 2.2, 0.6, 10), '#5a3f2a', m4().compose(pv.set(t.plate.x, height(t.plate.x, t.plate.z) + 2.0, t.plate.z), q, sv.set(1, 1, 1))]);
  // three roots arching over the opening, the lintel of the curtain
  [[1.45, 0.13, 0], [1.25, 0.1, 0.25], [1.6, 0.09, -0.2]].forEach(([r, tube, shift]) => {
    const arch = new THREE.TorusGeometry(r, tube, 5, 12, Math.PI);
    q.setFromEuler(new THREE.Euler(0, ROOTS.face, 0));
    const fx = Math.sin(ROOTS.face), fz = Math.cos(ROOTS.face);
    parts.push([arch, '#7a5638', m4().compose(pv.set(opening.x + fx * shift, oy + ROOTLET_TOP - r + 0.15, opening.z + fz * shift), q, sv.set(1, 1, 1))]);
  });
  return paint(parts);
}

/** What glows inside: the mushrooms along the back wall and the stone among the roots at the back. Unlit. */
export function glowGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, string, THREE.Matrix4?][] = [];
  const fx = Math.sin(ROOTS.face), fz = Math.cos(ROOTS.face), sx = Math.cos(ROOTS.face), sz = -Math.sin(ROOTS.face);
  const shrooms: [number, number, number, string][] = [[-1.6, -0.3, 1, '#7ff0e0'], [-1.0, -1.3, 0.8, '#b48cff'], [0.9, -1.4, 1.1, '#7fd8ff'], [1.7, -0.4, 0.9, '#9dff9a'], [-0.4, -2.0, 0.7, '#ffb8f0'], [0.5, -2.1, 0.8, '#7ff0e0']];
  for (const [s, b, k, col] of shrooms) {
    const x = ROOTS.x + sx * s + fx * b, z = ROOTS.z + sz * s + fz * b, y = height(x, z);
    parts.push([new THREE.CylinderGeometry(0.05 * k, 0.07 * k, 0.3 * k, 5), '#e8f4ee', new THREE.Matrix4().makeTranslation(x, y + 0.15 * k, z)]);
    parts.push([new THREE.SphereGeometry(0.2 * k, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), col, new THREE.Matrix4().makeTranslation(x, y + 0.28 * k, z)]);
  }
  const { stone } = rootsOf(), y = height(stone.x, stone.z);
  parts.push([new THREE.OctahedronGeometry(0.24, 0).scale(1, 1.4, 1), '#ffd27a', new THREE.Matrix4().makeTranslation(stone.x, y + 0.45, stone.z)]);
  return paint(parts);
}

/** A rootlet of the curtain: a thin twisted strand ROOTLET_L long hanging down from its top at the origin. */
export function rootletGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.035, 0.015, ROOTLET_L, 4, 5).translate(0, -ROOTLET_L / 2, 0);
  const a = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) { const y = a.getY(i); a.setX(i, a.getX(i) + Math.sin((y / ROOTLET_L) * Math.PI * 2) * 0.05); }
  g.computeVertexNormals();
  return g;
}

/** rad: how far a rootlet swings aside, `d` m from her (0 past ROOTLET_PART). */
export const rootletSwing = (d: number): number => (d < ROOTLET_PART ? (1 - d / ROOTLET_PART) * 1.2 : 0);
