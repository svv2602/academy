import * as THREE from 'three';
import { mulberry32 } from '../../core/util';
import { BRIDGE, CAKE, CAROUSEL, HALF, HOUSE, LANDMARKS, MILL, ROUTE, SCALE, TREE_ARCH, ZONES, type Place } from './layout';
import { buildLandmarks, paint, paintMaterial, paintedAt, type Landmarks, type Part } from './landmarks';
import { colliders, height, lineDist, pathDist, riverColliders, riverDist } from './terrain';

/**
 * The Sweet Land of the grey build in simple shapes at their real sizes (WORLD-12): each zone in the accent colour of
 * docs/worlds/world-4.md, so the pictures show what is where - the square's pink carousel, the gingerbread town brown
 * with white icing, the candy garden's red-white lollipop trees, the marmalade market green and yellow with its scales,
 * the chocolate river and the waffle bridge; the cake palace and the mill are ./landmarks.ts. The edge of the world is
 * a ring of whipped-cream hills and a wall of tall lollipops past HALF (with colliders: she cannot leave). Every kind of
 * scattered thing is one instanced mesh. Models replace them once the customer has accepted the grey build.
 */

/**
 * The lines of sight of the route (WORLD-10): from every target to the landmark of the next one nothing tall stands
 * within SIGHT m - the landmark of the next target is seen from each (tools/sweet-grey.mjs measures it).
 */
export const SIGHT = 3.2;
export const SIGHT_SHORT = 8;
export const sightLines = (): Place[][] => ROUTE.slice(1).map((b, i) => {
  const from = ZONES[ROUTE[i]], to = LANDMARKS[b], d = Math.hypot(to.x - from.x, to.z - from.z) || 1, k = Math.max(0, d - SIGHT_SHORT) / d;
  return [from, { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k }];
});

/** A placed thing: where, how big, turned how. */
export interface Put { x: number; z: number; s: number; rot?: number }

/** m: the radius round the candy garden's middle its lollipop trees grow in (the stretch of the map widens it). */
const GARDEN_GROVE = 15 * SCALE;

/** m: what scattered sweets keep clear of: the zones, the cake, the mill, the arch to the Tree. */
const KEEP_OFF = 9;

/** The sweets scattered over the land and its rim, deterministic: away from the ways, the river, the zones, the lines of sight and each other; the lollipop trees in the candy garden only. */
export function placeSweets(seed = 23): { lollipops: Put[]; candies: Put[]; hills: Put[]; wall: Put[] } {
  const rnd = mulberry32(seed), zones = Object.values(ZONES), sights = sightLines();
  const clear = (x: number, z: number) => pathDist(x, z) > 3 && riverDist(x, z) > 4 && sights.every((l) => lineDist(l, x, z) > SIGHT)
    && zones.every((p) => Math.hypot(p.x - x, p.z - z) > KEEP_OFF) && Math.hypot(CAKE.x - x, CAKE.z - z) > CAKE.tiers[0].r + 3
    && Math.hypot(MILL.x - x, MILL.z - z) > MILL.wingR + 2 && Math.hypot(TREE_ARCH.x - x, TREE_ARCH.z - z) > 6;
  // `within`: a circle of the map the things stand in (the whole map without it); the density is per square metre of it
  const scatter = (perM2: number, gap: number, s0: number, ds: number, within?: { x: number; z: number; r: number }) => {
    const area = within ? Math.PI * within.r * within.r : Math.PI * HALF * HALF;
    const want = Math.round(area * perM2), out: Put[] = [];
    for (let tries = 0; out.length < want && tries < want * 40; tries++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (within ? within.r : HALF - 3);
      const x = (within?.x ?? 0) + Math.cos(a) * r, z = (within?.z ?? 0) + Math.sin(a) * r;
      if (Math.hypot(x, z) > HALF - 3 || !clear(x, z) || out.some((t) => Math.hypot(t.x - x, t.z - z) < gap)) continue;
      out.push({ x, z, s: s0 + rnd() * ds, rot: rnd() * 6.28 });
    }
    return out;
  };
  // the density per square metre stays the same whatever the stretch of the map
  // the lollipop trees grow in the candy garden only: elsewhere they made every place look the same (the customer,
  // accepting the grey build, 2026-11-23); the small sweets stay over the whole land
  const lollipops = scatter(1 / 160, 3, 0.8, 0.6, { ...ZONES.garden, r: GARDEN_GROVE }), candies = scatter(1 / 220, 2.4, 0.8, 0.6);
  // the rim: two rows of whipped-cream hills, the tall lollipops between them - past the edge, where nobody walks
  const hills: Put[] = [], wall: Put[] = [], ring = Math.round((2 * Math.PI * HALF) / 5);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + rnd() * 0.05;
    hills.push({ x: Math.cos(a) * (HALF + 3 + rnd() * 2), z: Math.sin(a) * (HALF + 3 + rnd() * 2), s: 1 + rnd() * 0.5, rot: rnd() * 6.28 });
    const b = a + Math.PI / ring;
    wall.push({ x: Math.cos(b) * (HALF + 1), z: Math.sin(b) * (HALF + 1), s: 1 + rnd() * 0.4, rot: rnd() * 6.28 });
    hills.push({ x: Math.cos(b) * (HALF + 9 + rnd() * 3), z: Math.sin(b) * (HALF + 9 + rnd() * 3), s: 1.4 + rnd() * 0.6, rot: rnd() * 6.28 });
  }
  return { lollipops, candies, hills, wall };
}

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });

/** One instanced mesh of `geo` at every `put`, standing on the ground; `y` lifts each. */
function instances(scene: THREE.Scene, name: string, geo: THREE.BufferGeometry, material: THREE.Material, puts: readonly Put[], y = 0, shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, puts.length));
  mesh.name = name; mesh.count = puts.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  puts.forEach((t, i) => mesh.setMatrixAt(i, m4.compose(p.set(t.x, height(t.x, t.z) + y * t.s, t.z), q.setFromAxisAngle(up, t.rot ?? 0), s.setScalar(t.s))));
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/** A lollipop tree of height `h`: a white stick, a round candy of red and white stripes on its top (the candy garden's accent). */
function lollipop(h: number, r: number, x = 0, z = 0): Part[] {
  const out: Part[] = [[new THREE.CylinderGeometry(0.12 * r, 0.14 * r, h, 6).translate(x, h / 2, z), '#fffaf2']];
  // the candy: a disc of rings, red and white in turn
  for (let k = 0; k < 4; k++) out.push([new THREE.TorusGeometry(r * (0.25 + k * 0.22), r * 0.12, 4, 14).translate(x, h + r * 0.4, z), k % 2 ? '#fffaf2' : '#e8364f']);
  out.push([new THREE.CircleGeometry(r * 0.18, 10).translate(x, h + r * 0.4, z), '#e8364f']);
  return out;
}

export interface Scenery extends Landmarks {
  /** Turns the carousel by `speed` radians a second (still at 0: no ruby back). */
  spin(dt: number, speed: number): void;
}

/** The Sweet Land in the scene, and its colliders. */
export function buildScenery(scene: THREE.Scene): Scenery {
  const { lollipops, candies, hills, wall } = placeSweets();
  colliders.push(...riverColliders());
  for (const l of lollipops) colliders.push({ x: l.x, z: l.z, r: 0.5 * l.s });
  for (const c of candies) colliders.push({ x: c.x, z: c.z, r: 0.6 * c.s });
  for (const w of wall) colliders.push({ x: w.x, z: w.z, r: 1.2 * w.s });

  // ----- the scattered sweets and the rim -----
  const pop = paint(lollipop(3.2, 1.1));
  instances(scene, 'lollipops', pop, paintMaterial(), lollipops);
  instances(scene, 'candies', new THREE.DodecahedronGeometry(0.7, 0).scale(1.4, 0.7, 1).translate(0, 0.5, 0), mat('#ffd166'), candies);
  instances(scene, 'cream-hills', new THREE.SphereGeometry(5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1), mat('#fff4ea', { roughness: 0.95 }), hills, 0, false);
  instances(scene, 'lollipop-wall', paint(lollipop(9, 2.4)), paintMaterial(), wall, 0, false);

  // ----- the square: the pink carousel (the square's landmark), a stall of lemonade -----
  const pole = CAROUSEL.top - 1.6;
  paintedAt(scene, 'landmark-square', CAROUSEL.x, CAROUSEL.z, [
    [new THREE.CylinderGeometry(CAROUSEL.r, CAROUSEL.r, 0.5, 16).translate(0, 0.25, 0), '#f7a8c8'],
    [new THREE.CylinderGeometry(0.25, 0.25, pole, 8).translate(0, pole / 2, 0), '#fff1d6'],
    [new THREE.ConeGeometry(CAROUSEL.r + 0.4, 1.8, 16).translate(0, pole + 0.9, 0), '#ff8fb1'],
    [new THREE.SphereGeometry(0.4, 8, 6).translate(0, CAROUSEL.top - 0.2, 0), '#fff1d6'],
  ]);
  colliders.push({ x: CAROUSEL.x, z: CAROUSEL.z, r: CAROUSEL.r + 0.3 });
  // its seats: candy horses round the pole, turned with the carousel (one mesh)
  const seatParts: Part[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, x = Math.sin(a) * (CAROUSEL.r - 0.9), z = Math.cos(a) * (CAROUSEL.r - 0.9);
    seatParts.push([new THREE.CylinderGeometry(0.06, 0.06, pole - 0.5, 5).translate(x, 0.5 + (pole - 0.5) / 2, z), '#fff1d6']);
    seatParts.push([new THREE.BoxGeometry(0.4, 0.5, 0.9).rotateY(a).translate(x, 1.3, z), k % 2 ? '#a8e4ff' : '#ffe08a']);
  }
  const seats = new THREE.Mesh(paint(seatParts), paintMaterial());
  seats.name = 'carousel-seats'; seats.castShadow = true;
  seats.position.set(CAROUSEL.x, height(CAROUSEL.x, CAROUSEL.z), CAROUSEL.z);
  scene.add(seats);

  // ----- the gingerbread town: brown houses with white icing roofs round its square, the gingerbread tower -----
  const town = ZONES.town;
  const tower = LANDMARKS.town;
  // in the quarters the ways leave free, metres from the town's middle: off the ways, Imbir's house, the tower and the lines of sight
  const houses: Put[] = [[6, -7], [7, 6], [-8, -10], [-9, -1]].map(([dx, dz], i) => ({ x: town.x + dx, z: town.z + dz, s: 1, rot: i * 0.7 }))
    .filter((h) => pathDist(h.x, h.z) > 3.5 && Math.hypot(h.x - HOUSE.x, h.z - HOUSE.z) > 5 && Math.hypot(h.x - tower.x, h.z - tower.z) > 4.5
      && sightLines().every((l) => lineDist(l, h.x, h.z) > SIGHT + 1.5));
  for (const h of houses) colliders.push({ x: h.x, z: h.z, r: 2.2 });
  instances(scene, 'gingerbread-houses', paint([
    [new THREE.BoxGeometry(3.4, 2.6, 3.4).translate(0, 1.3, 0), '#b8763c'],
    [new THREE.ConeGeometry(2.8, 1.8, 4).rotateY(Math.PI / 4).translate(0, 3.5, 0), '#fffaf2'],
  ]), paintMaterial(), houses);
  paintedAt(scene, 'landmark-town', tower.x, tower.z, [
    [new THREE.BoxGeometry(2.6, tower.top - 2.4, 2.6).translate(0, (tower.top - 2.4) / 2, 0), '#a8662e'],
    [new THREE.TorusGeometry(1.6, 0.18, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4).translate(0, tower.top - 2.4, 0), '#fffaf2'],
    [new THREE.ConeGeometry(2.1, 2.4, 4).rotateY(Math.PI / 4).translate(0, tower.top - 1.2, 0), '#fffaf2'],
  ]);
  colliders.push({ x: tower.x, z: tower.z, r: 1.9 });
  // Imbir's house that fell apart: its body stands, dark inside on its east side - its front with the door and the roof
  // is assembled before it in the world (WORLD-21, ./house.ts), the pieces lie on the ground there
  paintedAt(scene, 'imbir-house', HOUSE.x, HOUSE.z, [
    [new THREE.BoxGeometry(HOUSE.w, HOUSE.h, HOUSE.d).translate(0, HOUSE.h / 2, 0), '#c0844a'],
    [new THREE.BoxGeometry(0.04, HOUSE.h - 0.1, HOUSE.d - 0.3).translate(HOUSE.w / 2 + 0.02, HOUSE.h / 2, 0), '#3a2212'],
  ]);
  colliders.push({ x: HOUSE.x, z: HOUSE.z, r: HOUSE.w / 2 + 0.6 });

  // ----- the candy garden: its tallest lollipop (the landmark), striped trees round it -----
  const g = LANDMARKS.garden;
  paintedAt(scene, 'landmark-garden', g.x, g.z, lollipop(g.top - 2.3, 1.6));
  colliders.push({ x: g.x, z: g.z, r: 0.6 });
  const trees: Put[] = Array.from({ length: 10 }, (_, i) => ({ x: ZONES.garden.x + Math.cos(i * 2.4) * (6 + (i % 3) * 2), z: ZONES.garden.z + Math.sin(i * 2.4) * (6 + (i % 3) * 2), s: 0.9 + (i % 3) * 0.15, rot: i }))
    .filter((t) => pathDist(t.x, t.z) > 2.5 && Math.hypot(t.x - g.x, t.z - g.z) > 2.5 && sightLines().every((l) => lineDist(l, t.x, t.z) > SIGHT));
  for (const t of trees) colliders.push({ x: t.x, z: t.z, r: 0.5 * t.s });
  instances(scene, 'garden-lollipops', pop, paintMaterial(), trees);

  // ----- the marmalade market: green and yellow stalls, the scales on their post (the landmark; WORLD-22 later) -----
  const mk = ZONES.market;
  const stalls: Put[] = [[-6, -3], [-2, -6], [5, -4], [6, 3]].map(([dx, dz], i) => ({ x: mk.x + dx, z: mk.z + dz, s: 1, rot: i * 1.1 })).filter((s) => pathDist(s.x, s.z) > 2.8);
  for (const s of stalls) colliders.push({ x: s.x, z: s.z, r: 1.4 });
  instances(scene, 'market-stalls', paint([
    [new THREE.BoxGeometry(2.4, 1, 1.2).translate(0, 0.5, 0), '#7bd36a'],
    [new THREE.BoxGeometry(2.8, 0.15, 1.8).translate(0, 2.3, 0), '#ffd84a'],
    [new THREE.CylinderGeometry(0.06, 0.06, 1.3, 4).translate(-1.2, 1.65, 0.6), '#fffaf2'],
    [new THREE.CylinderGeometry(0.06, 0.06, 1.3, 4).translate(1.2, 1.65, 0.6), '#fffaf2'],
  ]), paintMaterial(), stalls);
  const sc = LANDMARKS.market, beam = sc.top - 0.6;
  paintedAt(scene, 'landmark-market', sc.x, sc.z, [
    [new THREE.CylinderGeometry(0.2, 0.35, beam, 8).translate(0, beam / 2, 0), '#5fbf52'],
    [new THREE.BoxGeometry(4.2, 0.22, 0.3).translate(0, beam, 0), '#ffd84a'],
    [new THREE.ConeGeometry(0.35, 0.6, 6).translate(0, beam + 0.4, 0), '#ffd84a'],
    ...[-1.9, 1.9].flatMap((dx): Part[] => [
      [new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4).translate(dx, beam - 0.7, 0), '#fffaf2'],
      [new THREE.CylinderGeometry(0.8, 0.5, 0.3, 10).translate(dx, beam - 1.5, 0), dx < 0 ? '#ffd84a' : '#7bd36a'],
    ]),
  ]);
  colliders.push({ x: sc.x, z: sc.z, r: 0.6 });

  // ----- the chocolate river and the shape bridge: waffle planks across it, its two posts the landmark -----
  // The bridge is walkable as it stands (step 1 of the grey build); Kakao's shape bridge (WORLD-20) lays its tiles here later.
  const deckParts: Part[] = [[new THREE.BoxGeometry(BRIDGE.w, 0.25, BRIDGE.len).translate(0, 0.05, 0), '#d9a45b']];
  for (let k = -3; k <= 3; k++) deckParts.push([new THREE.BoxGeometry(BRIDGE.w + 0.1, 0.06, 0.1).translate(0, 0.2, (k * BRIDGE.len) / 8), '#b07a3a']);
  for (const sx of [-1, 1]) {
    deckParts.push([new THREE.BoxGeometry(0.12, 0.7, BRIDGE.len).translate(sx * (BRIDGE.w / 2 - 0.06), 0.5, 0), '#b07a3a']);
    for (const sz of [-1, 1]) deckParts.push([new THREE.CylinderGeometry(0.35, 0.4, LANDMARKS.bridge.top, 8).translate(sx * (BRIDGE.w / 2), LANDMARKS.bridge.top / 2, sz * (BRIDGE.len / 2 - 0.2)), '#8a5a2c']);
  }
  const deck = paintedAt(scene, 'landmark-bridge', BRIDGE.x, BRIDGE.z, deckParts, BRIDGE.yaw);
  deck.position.y = height(BRIDGE.x, BRIDGE.z);
  // the river itself: a chocolate band over its bed, just under the banks (still at the magic 0, docs/worlds/world-4.md)
  const river = riverMesh();
  scene.add(river);

  const marks = buildLandmarks(scene);
  return {
    ...marks,
    spin: (dt, speed) => { seats.rotation.y += dt * speed; },
  };
}

/** The river's surface: a ribbon along its middle line, RIVER_HALF wide each side, a little under the banks. */
function riverMesh(): THREE.Mesh {
  const line = riverLine();
  const pos: number[] = [], idx: number[] = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, w = 2.6;
    const y = Math.max(height(p.x, p.z), height(p.x + nx * w, p.z + nz * w) - 0.25, height(p.x - nx * w, p.z - nz * w) - 0.25) + 0.05;
    pos.push(p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.35, side: THREE.DoubleSide }));
  mesh.name = 'chocolate-river'; mesh.receiveShadow = true;
  return mesh;
}

/** Points along the river's middle line, RIVER_STEP m apart, the stretch under the bridge too (the deck lies over it). */
const riverLine = (): Place[] => riverColliders(0).map((c) => ({ x: c.x, z: c.z }));
