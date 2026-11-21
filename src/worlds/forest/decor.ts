import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { staticGeo } from '../../core/assets';
import { propMaterial } from '../../core/materials';
import { facets, mat } from '../../core/style';
import { PATHS, STREAM_HALF, ZONES, inMaze, type Place } from './layout';
import { BRIDGE_BASE, BRIDGE_H, BRIDGE_L, BRIDGE_W, colliders, height, pathDist, streamDist } from './terrain';

/**
 * The things of the forest (plan B of its look, 2026-11-21): the bridges over the stream, a fence at the ways into the
 * village, its woodpiles and its signpost - Kenney's Nature Kit (CC0, the forest's own files: models-src/forest/kenney/)
 * - and the lanterns along the paths, our own shape (docs/worlds/style.md: a post, a box, a light; mat.glow, no new
 * light, WORLD-09). Each kind is one instanced draw for the whole map.
 */
export const KENNEY = { bridge: ['kenney/bridge_woodRound', 1], fence: ['kenney/fence_simple', 0.8], logs: ['kenney/log_stack', 0.9], sign: ['kenney/sign', 1.3] } as const;
type KenneyKind = keyof typeof KENNEY;
/** Warm wood and grey-brown stone: the pack's colours, lifted by the storybook palette, read as pale concrete. */
const WOOD = { wood: '#9a6a45', woodBark: '#6f4a30', woodDark: '#5e4030', woodInner: '#c99a6a', stone: '#9a8f80', stoneDark: '#7a7066' };
export type Decor = Record<KenneyKind, THREE.BufferGeometry>;

export async function loadDecor(): Promise<Decor> {
  const kinds = Object.keys(KENNEY) as KenneyKind[];
  const geos = await Promise.all(kinds.map((k) => staticGeo(`forest/${KENNEY[k][0]}`, KENNEY[k][1], WOOD)));
  return Object.fromEntries(kinds.map((k, i) => [k, geos[i]])) as Decor;
}

/** m: a lantern every LANTERN_STEP of a path, LANTERN_SIDE off its middle, sides taken in turn; none within the maze. */
export const LANTERN_STEP = 13;
export const LANTERN_SIDE = 1.5;

/** A point along a path line and its direction, every `step` m from its start (its ends left out by `skip`). */
function along(line: readonly Place[], step: number, skip: number) {
  const out: { x: number; z: number; dx: number; dz: number }[] = [];
  let carry = skip;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    for (let d = carry; d < len; d += step) out.push({ x: a.x + dx * d, z: a.z + dz * d, dx, dz });
    carry = (carry - len) % step; if (carry < 0) carry += step;
  }
  const total = line.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - line[i].x, p.z - line[i].z), 0);
  return out.filter((p) => { const from = Math.hypot(p.x - line[line.length - 1].x, p.z - line[line.length - 1].z); return from > skip && total > skip * 2; });
}

/** Where the lanterns stand: along every path (but the squirrel's tracks), off it, not in the stream nor the maze. */
export function lanternSpots(): (Place & { rot: number })[] {
  const out: (Place & { rot: number })[] = [];
  let side = 1;
  for (const line of PATHS.slice(0, -1)) {
    for (const p of along(line, LANTERN_STEP, 6)) {
      side = -side;
      const x = p.x - p.dz * LANTERN_SIDE * side, z = p.z + p.dx * LANTERN_SIDE * side;
      if (streamDist(x, z) < STREAM_HALF + 1 || inMaze(x, z, 1) || pathDist(x, z) < 1.2) continue;
      if (out.some((q) => Math.hypot(q.x - x, q.z - z) < 6)) continue;
      out.push({ x, z, rot: Math.atan2(-p.dz * side, p.dx * side) });
    }
  }
  return out;
}

/** A lantern, our own shape: its geometries by material (a wooden post and arm, a dark frame, the light). */
export function lanternShape() {
  const post = new THREE.CylinderGeometry(0.06, 0.08, 1.9, facets(0.16)).translate(0, 0.95, 0);
  const arm = new THREE.BoxGeometry(0.07, 0.07, 0.45).translate(0, 1.82, 0.2);
  const frame = new THREE.BoxGeometry(0.3, 0.06, 0.3).translate(0, 1.72, 0.42);
  const roof = new THREE.ConeGeometry(0.24, 0.18, 4).rotateY(Math.PI / 4).translate(0, 1.79, 0.42);
  const light = new THREE.BoxGeometry(0.2, 0.26, 0.2).translate(0, 1.56, 0.42);
  return { wood: mergeGeometries([post, arm])!, frame: mergeGeometries([frame, roof])!, light };
}

/** One instanced mesh of `geo` at `puts`; `s` scales each, `lift` raises it. */
function put(scene: THREE.Scene, name: string, geo: THREE.BufferGeometry, material: THREE.Material, puts: readonly { x: number; z: number; rot: number; s?: number; lift?: number }[], shadow: boolean) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, puts.length));
  mesh.count = puts.length;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
  puts.forEach((p, i) => mesh.setMatrixAt(i, m.compose(v.set(p.x, height(p.x, p.z) + (p.lift ?? 0), p.z), q.setFromAxisAngle(up, p.rot), s.setScalar(p.s ?? 1))));
  mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

/** Every `puts` of every geometry baked into one geometry (one draw call for all of them: they never move). */
function bake(items: { geo: THREE.BufferGeometry; puts: readonly { x: number; z: number; rot: number; lift?: number; y?: number }[] }[]) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const parts = items.flatMap(({ geo, puts }) => puts.map((p) => geo.clone().applyMatrix4(m.compose(v.set(p.x, p.y ?? height(p.x, p.z) + (p.lift ?? 0), p.z), q.setFromAxisAngle(up, p.rot), one))));
  const out = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  out.computeBoundingSphere();
  return out;
}

/** The things in the scene; `bridges` - where the paths cross the stream (./scenery.ts `bridges`). */
export function buildDecor(scene: THREE.Scene, d: Decor, bridges: readonly (Place & { yaw: number })[]) {
  // not looked through at the lens, unlike the trees: the bridge she stands on would go pale under her
  const solid = propMaterial();
  // the bridges: Kenney's round wooden bridge laid along the path, as long as the stream is wide and a step more
  const box = new THREE.Box3().setFromBufferAttribute(d.bridge.getAttribute('position') as THREE.BufferAttribute), size = box.getSize(new THREE.Vector3());
  // stretched apart on its three axes: along the path as long as the stream is wide and a step more, BRIDGE_W wide, its
  // arch BRIDGE_H high (she walks the ground under it: a low arch she seems to walk over)
  // Kenney's bridges walk along their z (the rails on the x sides): a square tile, laid as it is
  d.bridge.scale(BRIDGE_W / size.x, BRIDGE_H / size.y, BRIDGE_L / size.z);
  // over the water, its ends BRIDGE_BASE high: the ground there is its deck (./terrain.ts deckY)
  const decks = bridges.map((b) => ({ x: b.x, z: b.z, rot: b.yaw, y: BRIDGE_BASE }));

  // the lanterns along the paths
  const lamp = lanternShape(), lamps = lanternSpots();
  // two draws for all of them: the post, the arm and the frame of one dark wood, the light; no shadow of a thin post
  put(scene, 'lantern-wood', mergeGeometries([lamp.wood, lamp.frame])!, mat.wood('woodDark'), lamps, false);
  put(scene, 'lantern-light', lamp.light, mat.glow('gold', 1.2), lamps, false);
  for (const l of lamps) colliders.push({ x: l.x, z: l.z, r: 0.2 });

  // the ways into the village: a fence each side of every path, from 5 to 9 m out of its middle
  const fences: { x: number; z: number; rot: number }[] = [];
  for (const line of PATHS) {
    const at0 = line[0] === ZONES.village ? 0 : line[line.length - 1] === ZONES.village ? line.length - 1 : -1;
    if (at0 < 0) continue;
    const a = line[at0], b = line[at0 === 0 ? 1 : at0 - 1], len = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    for (let dist = 5; dist <= 9; dist += 1) for (const side of [-1, 1]) {
      fences.push({ x: a.x + dx * dist - dz * 1.7 * side, z: a.z + dz * dist + dx * 1.7 * side, rot: Math.atan2(dx, dz) + Math.PI / 2 });
    }
  }
  // the woodpiles and the signpost of the village, by its middle
  const v = ZONES.village;
  const piles = [{ x: v.x - 3.2, z: v.z + 2.4, rot: 0.6 }, { x: v.x + 3.4, z: v.z - 3, rot: 2.2 }], sign = [{ x: v.x + 3.2, z: v.z + 3.6, rot: -0.8 }];
  // the bridges, the fences, the woodpiles and the signpost: one geometry, one draw (and one of the shadow)
  const things = new THREE.Mesh(bake([{ geo: d.bridge, puts: decks }, { geo: d.fence, puts: fences }, { geo: d.logs, puts: piles }, { geo: d.sign, puts: sign }]), solid);
  things.name = 'things'; things.castShadow = true; things.receiveShadow = true;
  scene.add(things);
  for (const p of [{ x: v.x - 3.2, z: v.z + 2.4 }, { x: v.x + 3.4, z: v.z - 3 }, { x: v.x + 3.2, z: v.z + 3.6 }]) colliders.push({ x: p.x, z: p.z, r: 0.45 });
  return { lamps, fences };
}
