import * as THREE from 'three';
import { mulberry32 } from '../../core/util';
import { BRIDGES, BRIDGE_W, CASTLE, CLOUD_GAP, HALF, ISLANDS, LANDMARKS, MILL, MILLS, NOOK_ENDS, OBSERVATORY, RAIL, ROUTE, SHIP, SHRINE, TREE_ARCH, ZONES, type Island, type Place, type ZoneId } from './layout';
import { buildLandmarks, paint, paintMaterial, paintedAt, type Landmarks, type Part } from './landmarks';
import { CLOUD_SEA, SEA_REACH, colliders, height, inCloudGap, lineDist, pathDist } from './terrain';

/**
 * The Sky Islands of the grey build in simple shapes at their real sizes (WORLD-12): every island a rock turned upside
 * down under a grassy top in the accent of docs/worlds/world-5.md, a ring of puffy cloud rails on its edge (the edge is
 * closed: the customer's decision 1 a), white cloud bridges between them, the sea of clouds far below. The castle white
 * and blue, the dragon island's rock green and gold, the windmills orange-sailed, the far islet's violet flowers; the
 * observatory and the airship are ./landmarks.ts. Every kind of scattered thing is one instanced mesh. Models replace
 * them once the customer has accepted the grey build.
 */

/**
 * The lines of sight of the route (WORLD-10): from every target to the landmark of the next one nothing tall stands
 * within SIGHT m - the landmark of the next target is seen from each (tools/sky-grey.mjs measures it).
 */
export const SIGHT = 3.2;
export const SIGHT_SHORT = 8;
export const sightLines = (): Place[][] => ROUTE.slice(1).map((b, i) => {
  const from = ZONES[ROUTE[i]], to = LANDMARKS[b], d = Math.hypot(to.x - from.x, to.z - from.z) || 1, k = Math.max(0, d - SIGHT_SHORT) / d;
  return [from, { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k }];
});

/** A placed thing: where, how big, turned how. */
export interface Put { x: number; z: number; s: number; rot?: number }

/** m: the step of the cloud puffs of a rail along an island's edge. */
export const RAIL_STEP = 1.4;
/** m: the bridges' gap in an island's rail: the deck's half width and a puff. */
const GAP = BRIDGE_W / 2 + 0.6;

const islandList = Object.entries(ISLANDS) as [ZoneId, Island][];

/** Where a bridge meets the edge of the island `id`: the points of its middle line on that edge. */
function bridgeEnds(id: ZoneId): Place[] {
  return BRIDGES.flatMap(([a, b]) => {
    if (a !== id && b !== id) return [];
    const me = ISLANDS[id], other = ISLANDS[a === id ? b : a], d = Math.hypot(other.x - me.x, other.z - me.z);
    return [{ x: me.x + ((other.x - me.x) / d) * me.r, z: me.z + ((other.z - me.z) / d) * me.r }];
  });
}

/** The cloud rails: puffs on every island's edge, but where a bridge comes in; and along both sides of every bridge. */
export function placeRails(seed = 31): Put[] {
  const rnd = mulberry32(seed), out: Put[] = [];
  for (const [id, i] of islandList) {
    // (the ways to the nooks of the secrets, layout.ts NOOK_WAYS, come in through a gap too)
    const ends = [...bridgeEnds(id), ...NOOK_ENDS], n = Math.round((2 * Math.PI * i.r) / RAIL_STEP);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, x = i.x + Math.sin(a) * (i.r - 0.3), z = i.z + Math.cos(a) * (i.r - 0.3);
      if (ends.some((e) => Math.hypot(e.x - x, e.z - z) < GAP)) continue;
      out.push({ x, z, s: 0.9 + rnd() * 0.4, rot: rnd() * 6.28 });
    }
  }
  for (const [ka, kb] of BRIDGES) {
    const a = ISLANDS[ka], b = ISLANDS[kb], len = Math.hypot(b.x - a.x, b.z - a.z), ax = (b.x - a.x) / len, az = (b.z - a.z) / len;
    for (let t = a.r; t <= len - b.r; t += RAIL_STEP) for (const side of [-1, 1]) {
      const w = side * (BRIDGE_W / 2 + 0.2), x = a.x + ax * t - az * w, z = a.z + az * t + ax * w;
      if (inCloudGap(x, z)) continue;      // the gap has no rail: the clouds of the cloud bridge hang there
      out.push({ x: a.x + ax * t - az * w, z: a.z + az * t + ax * w, s: 0.7 + rnd() * 0.3, rot: rnd() * 6.28 });
    }
  }
  return out;
}

/** m: what scattered trees keep clear of: the middles of the islands, the castle, the observatory, the mills, the arch. */
const KEEP_OFF = 6;

/** The trees and bushes of the islands, deterministic: away from the bridges, the edges, the lines of sight and each other. */
export function placeTrees(seed = 17): { trees: Put[]; bushes: Put[] } {
  const rnd = mulberry32(seed), sights = sightLines();
  const things: (Place & { r: number })[] = [
    { x: CASTLE.x, z: CASTLE.z, r: CASTLE.r + 3 }, { x: OBSERVATORY.x, z: OBSERVATORY.z, r: OBSERVATORY.r + 4 }, { x: SHRINE.x, z: SHRINE.z, r: 4 },
    ...MILLS.map((m) => ({ x: m.x, z: m.z, r: MILL.wingR + 1 })), { x: TREE_ARCH.x, z: TREE_ARCH.z, r: 5 }, { x: LANDMARKS.dragon.x, z: LANDMARKS.dragon.z, r: 5 },
  ];
  const clear = (x: number, z: number, i: Island) => pathDist(x, z) > 3.5 && Math.hypot(x - i.x, z - i.z) < i.r - RAIL - 1.5
    && Math.hypot(x - i.x, z - i.z) > KEEP_OFF && sights.every((l) => lineDist(l, x, z) > SIGHT) && things.every((t) => Math.hypot(t.x - x, t.z - z) > t.r);
  const scatter = (perM2: number, gap: number, s0: number, ds: number) => {
    const out: Put[] = [];
    for (const [id, i] of islandList) {
      if (id === 'far') continue;    // the far islet has its flowers only
      const want = Math.round(Math.PI * i.r * i.r * perM2);
      for (let tries = 0, got = 0; got < want && tries < want * 40; tries++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * i.r, x = i.x + Math.cos(a) * r, z = i.z + Math.sin(a) * r;
        if (!clear(x, z, i) || out.some((t) => Math.hypot(t.x - x, t.z - z) < gap)) continue;
        out.push({ x, z, s: s0 + rnd() * ds, rot: rnd() * 6.28 }); got++;
      }
    }
    return out;
  };
  // the density per square metre stays the same whatever the stretch of the map; the budget's 20 trees and 30 bushes at most
  return { trees: scatter(1 / 140, 4, 0.8, 0.5).slice(0, 20), bushes: scatter(1 / 90, 2.2, 0.7, 0.5).slice(0, 30) };
}

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });

/** One instanced mesh of `geo` at every `put`, standing on the ground; `y` lifts each. */
function instances(scene: THREE.Scene, name: string, geo: THREE.BufferGeometry, material: THREE.Material, puts: readonly Put[], y = 0, shadow = true, at = height) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, puts.length));
  mesh.name = name; mesh.count = puts.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  puts.forEach((t, i) => mesh.setMatrixAt(i, m4.compose(p.set(t.x, at(t.x, t.z) + y * t.s, t.z), q.setFromAxisAngle(up, t.rot ?? 0), s.setScalar(t.s))));
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/** The accents of the islands (docs/worlds/world-5.md): the rock under each, and what grows on the top. */
const ROCK = '#b9aecb', ROCK_DARK = '#8f84a8', CLOUD = '#ffffff';
/** The sea of clouds below the islands: its floor (unlit) and its puffs (lit), both under the bloom's threshold. */
const SEA_FLOOR = '#c9d9ee', SEA_PUFF = '#9fb4d2';

export interface Scenery extends Landmarks {
  /** The deck over the gap of the cloud bridge (layout.ts CLOUD_GAP): shown once the bridge is built. */
  gapDeck: THREE.Object3D;
  /** Turns the windmills' sails by `speed` radians a second (still at 0: no ray back). */
  turn(dt: number, speed: number): void;
}

/** The Sky Islands in the scene, and their colliders. */
export function buildScenery(scene: THREE.Scene): Scenery {
  const rails = placeRails(), { trees, bushes } = placeTrees();
  for (const t of trees) colliders.push({ x: t.x, z: t.z, r: 0.5 * t.s });

  // ----- the islands: a rock turned upside down under each top (one mesh for all six) -----
  const rocks: Part[] = [];
  for (const [, i] of islandList) {
    const deep = i.r * 1.1;
    rocks.push([new THREE.ConeGeometry(i.r * 0.98, deep, 14, 2).rotateX(Math.PI).translate(i.x, i.top - 0.15 - deep / 2, i.z), ROCK]);
    rocks.push([new THREE.CylinderGeometry(i.r, i.r * 0.98, 0.5, 20).translate(i.x, i.top - 0.4, i.z), ROCK_DARK]);
  }
  paintedAt(scene, 'island-rocks', 0, 0, rocks, 0, 0);
  // the cloud rails on the edges and along the bridges (one instanced mesh)
  instances(scene, 'cloud-rails', new THREE.IcosahedronGeometry(0.75, 1).scale(1.3, 0.8, 1), mat(CLOUD, { roughness: 1 }), rails, 0.4, false);
  // the bridges' decks: white cloud slabs from edge to edge, at the height of the ground under them
  // (the bridge with the gap of the cloud bridge: two decks to its edges, the deck over the gap a mesh of its own)
  const decks: Part[] = [], gapDecks: Part[] = [];
  const slabs = (out: Part[], a: Island, ax: number, az: number, from: number, to: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const t0 = from + ((to - from) * k) / n, t1 = from + ((to - from) * (k + 1)) / n, tm = (t0 + t1) / 2;
      const x = a.x + ax * tm, z = a.z + az * tm, y = height(x, z);
      out.push([new THREE.BoxGeometry(BRIDGE_W, 0.5, t1 - t0 + 0.05).rotateY(Math.atan2(ax, az)).translate(x, y - 0.25, z), k % 2 ? '#f4f8ff' : CLOUD]);
    }
  };
  for (const [ka, kb] of BRIDGES) {
    const a = ISLANDS[ka], b = ISLANDS[kb], len = Math.hypot(b.x - a.x, b.z - a.z), ax = (b.x - a.x) / len, az = (b.z - a.z) / len;
    const from = a.r - 0.5, to = len - b.r + 0.5;
    if (ka === CLOUD_GAP.bridge[0] && kb === CLOUD_GAP.bridge[1]) {
      const g0 = CLOUD_GAP.from, g1 = CLOUD_GAP.from + CLOUD_GAP.length;
      slabs(decks, a, ax, az, from, g0, 5); slabs(decks, a, ax, az, g1, to, 5); slabs(gapDecks, a, ax, az, g0, g1, 4);
    } else slabs(decks, a, ax, az, from, to, 12);
  }
  paintedAt(scene, 'cloud-bridges', 0, 0, decks, 0, 0);
  const gapDeck = paintedAt(scene, 'cloud-gap-deck', 0, 0, gapDecks, 0, 0);
  gapDeck.visible = false;
  // the sea of clouds far below: a pale floor into the haze, and puffs on it. Kept under the bloom's threshold
  // (src/core/renderer.ts, tier 2): lit white, it filled the whole view down over a bridge with its glow and washed out
  // everything in front of it - the floor unlit and a little blue, the puffs a soft grey-blue under the sun
  const sea = new THREE.Mesh(new THREE.CircleGeometry(SEA_REACH, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: SEA_FLOOR }));
  sea.position.y = CLOUD_SEA; sea.name = 'cloud-sea';
  scene.add(sea);
  const rnd = mulberry32(5), puffs: Put[] = [];
  for (let k = 0; k < 60; k++) { const a = rnd() * Math.PI * 2, r = HALF * (0.2 + rnd() * 1.4); puffs.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 3 + rnd() * 4, rot: rnd() * 6.28 }); }
  instances(scene, 'cloud-puffs', new THREE.IcosahedronGeometry(2, 1).scale(1.6, 0.6, 1.2), mat(SEA_PUFF, { roughness: 1 }), puffs, 0, false, () => CLOUD_SEA);

  // ----- the trees and bushes of the islands -----
  instances(scene, 'trees', paint([
    [new THREE.CylinderGeometry(0.18, 0.25, 2.2, 6).translate(0, 1.1, 0), '#8a6a4a'],
    [new THREE.IcosahedronGeometry(1.4, 0).translate(0, 3, 0), '#8fcf7a'],
  ]), paintMaterial(), trees);
  instances(scene, 'bushes', new THREE.IcosahedronGeometry(0.7, 0).scale(1.2, 0.8, 1.2).translate(0, 0.45, 0), mat('#a6d98a'), bushes);

  // ----- the cloud castle: white walls, blue roofs (the first world's castle later) -----
  const towers: Part[] = [[new THREE.BoxGeometry(CASTLE.r * 1.6, 4.5, CASTLE.r * 1.6).translate(0, 2.25, 0), '#f6f9ff']];
  for (const [dx, dz, h] of [[-1, -1, 8.5], [1, -1, 7], [-1, 1, 7], [1, 1, 6.5]] as const) {
    const x = dx * CASTLE.r * 0.8, z = dz * CASTLE.r * 0.8;
    towers.push([new THREE.CylinderGeometry(0.9, 1, h, 10).translate(x, h / 2, z), '#ffffff']);
    towers.push([new THREE.ConeGeometry(1.3, CASTLE.top - h + (dx < 0 && dz < 0 ? 0 : -1.5), 10).translate(x, h + (CASTLE.top - h + (dx < 0 && dz < 0 ? 0 : -1.5)) / 2, z), '#7fb2ff']);
  }
  paintedAt(scene, 'landmark-castle', CASTLE.x, CASTLE.z, towers, 0.3);
  colliders.push({ x: CASTLE.x, z: CASTLE.z, r: CASTLE.r * 1.25 });

  // ----- the dragon island: a green rock with a golden crown of stones (the dragon's place) -----
  const d = LANDMARKS.dragon;
  paintedAt(scene, 'landmark-dragon', d.x, d.z, [
    [new THREE.DodecahedronGeometry(2.6, 0).scale(1.2, 1, 1).translate(0, 2, 0), '#7fbf5a'],
    [new THREE.ConeGeometry(0.6, 2, 6).translate(-1, d.top - 1, 0), '#ffd166'],
    [new THREE.ConeGeometry(0.6, 2.2, 6).translate(0.9, d.top - 1.1, 0.4), '#ffd166'],
  ]);
  colliders.push({ x: d.x, z: d.z, r: 3.2 });

  // ----- the windmills: white towers, orange sails (still at the magic 0) -----
  const sails: THREE.Mesh[] = [];
  for (const [k, m] of MILLS.entries()) {
    paintedAt(scene, k === 0 ? 'landmark-mills' : `windmill-${k}`, m.x, m.z, [
      [new THREE.CylinderGeometry(MILL.towerR * 0.75, MILL.towerR, MILL.towerH, 10).translate(0, MILL.towerH / 2, 0), '#fff8ee'],
      [new THREE.ConeGeometry(MILL.towerR * 1.1, MILL.roofH, 10).translate(0, MILL.towerH + MILL.roofH / 2, 0), '#ff9a3c'],
    ], m.yaw);
    colliders.push({ x: m.x, z: m.z, r: MILL.towerR + 0.3 });
    const wing: Part[] = [];
    for (let s = 0; s < 4; s++) wing.push([new THREE.BoxGeometry(0.14, MILL.wingR, 1).translate(0, MILL.wingR / 2 + 0.4, 0).rotateX((s / 4) * Math.PI * 2), '#ff8a2a']);
    const sail = new THREE.Mesh(paint(wing), paintMaterial());
    sail.name = 'mill-sails'; sail.castShadow = true;
    sail.position.set(m.x + Math.sin(m.yaw) * (MILL.towerR + 0.3), height(m.x, m.z) + MILL.towerH - 0.6, m.z + Math.cos(m.yaw) * (MILL.towerR + 0.3));
    sail.rotation.y = m.yaw + Math.PI / 2;
    scene.add(sail);
    sails.push(sail);
  }

  // ----- the far islet: violet flowers round a small crystal; the pier's posts -----
  const far = ISLANDS.far, flowers: Put[] = [];
  for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2, r = 2 + (k % 3) * 1.4; flowers.push({ x: far.x + Math.sin(a) * r, z: far.z + Math.cos(a) * r, s: 0.8 + (k % 4) * 0.15, rot: a }); }
  instances(scene, 'far-flowers', paint([
    [new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4).translate(0, 0.25, 0), '#6aa84f'],
    [new THREE.IcosahedronGeometry(0.18, 0).translate(0, 0.55, 0), '#b07cff'],
  ]), paintMaterial(), flowers, 0, false);
  const crystal = LANDMARKS.far;
  paintedAt(scene, 'landmark-far', crystal.x, crystal.z, [[new THREE.OctahedronGeometry(0.9, 0).scale(1, crystal.top / 1.8, 1).translate(0, crystal.top / 2, 0), '#c9a8ff']]);
  colliders.push({ x: crystal.x, z: crystal.z, r: 0.9 });
  const pier = ISLANDS.pier;
  paintedAt(scene, 'pier-posts', SHIP.x, pier.z + pier.r - 0.6, [
    [new THREE.CylinderGeometry(0.2, 0.2, 2, 6).translate(-2.5, 1, 0), '#8a5a3a'],
    [new THREE.CylinderGeometry(0.2, 0.2, 2, 6).translate(2.5, 1, 0), '#8a5a3a'],
  ]);

  const landmarks = buildLandmarks(scene);
  return {
    ...landmarks,
    gapDeck,
    turn: (dt, speed) => { for (const s of sails) s.rotateX(dt * speed); },
  };
}
