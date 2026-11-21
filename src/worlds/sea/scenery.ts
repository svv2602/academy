import * as THREE from 'three';
import { mulberry32 } from '../../core/util';
import { CABIN, CASTLE, CORAL_NEST, HALF, LANDMARKS, ROUTE, SHIP, SQUARE_ARCH, THRONE, TOWERS, ZONES, type Place } from './layout';
import { colliders, height, lineDist, pathDist } from './terrain';

/**
 * The sea of the grey build in simple shapes at their real sizes (WORLD-12): corals as cones and balls, kelp as thin
 * ribbons, rocks, the castle of the mermaids as a ring of towers behind its gate, the sunken ship on its side with its
 * mast, the crab's grotto, the arch over the trench, the great shell of the garden and the shell of the throne. Each
 * kind is one instanced mesh; the colours are the zones' accents of the document (the reef pink and orange, the ship
 * warm wood and gold, the grotto red, the trench turquoise lights, the garden mother-of-pearl). Models replace them once
 * the customer has accepted the grey build.
 */

/**
 * The lines of sight of the route (WORLD-10): from every target to the landmark of the next one nothing tall stands
 * within SIGHT m - the landmark of the next target is seen from each (tools/sea-grey.mjs measures it).
 */
export const SIGHT = 3.2;
export const SIGHT_SHORT = 8;
export const sightLines = (): Place[][] => ROUTE.slice(1).map((b, i) => {
  const from = ZONES[ROUTE[i]], to = LANDMARKS[b], d = Math.hypot(to.x - from.x, to.z - from.z) || 1, k = Math.max(0, d - SIGHT_SHORT) / d;
  return [from, { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k }];
});

/** A placed thing: where, how big, turned how. */
interface Put { x: number; z: number; s: number; rot?: number }

/** The corals, kelp and rocks of the sea, deterministic: away from the ways, the zones, the lines of sight and each other. */
export function placeLife(seed = 11): { corals: Put[]; kelp: Put[]; rocks: Put[]; rim: Put[]; reef: Put[] } {
  const rnd = mulberry32(seed), zones = Object.values(ZONES), sights = sightLines();
  const clear = (x: number, z: number, near = 8) => pathDist(x, z) > 3 && sights.every((l) => lineDist(l, x, z) > SIGHT)
    && zones.every((p) => Math.hypot(p.x - x, p.z - z) > near) && Math.hypot(CASTLE.x - x, CASTLE.z - z) > CASTLE.ring + 4
    && Math.hypot(SHIP.x - x, SHIP.z - z) > SHIP.len / 2 + 2;
  const scatter = (perM2: number, gap: number, s0: number, ds: number, near?: number) => {
    const want = Math.round(Math.PI * HALF * HALF * perM2), out: Put[] = [];
    for (let tries = 0; out.length < want && tries < want * 40; tries++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (HALF - 3), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clear(x, z, near) || out.some((t) => Math.hypot(t.x - x, t.z - z) < gap)) continue;
      out.push({ x, z, s: s0 + rnd() * ds, rot: rnd() * 6.28 });
    }
    return out;
  };
  // the density per square metre stays the same whatever the stretch of the map
  const corals = scatter(1 / 140, 2.4, 0.7, 0.7), kelp = scatter(1 / 110, 1.6, 0.8, 0.8), rocks = scatter(1 / 420, 4, 0.8, 0.9);
  // the reef itself: a thick bed of corals round the dragon, its way in left open toward the square
  const reef: Put[] = [];
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = 5 + rnd() * 8, x = ZONES.reef.x + Math.cos(a) * r, z = ZONES.reef.z + Math.sin(a) * r;
    if (pathDist(x, z) < 2.6 || reef.some((t) => Math.hypot(t.x - x, t.z - z) < 1.3)) continue;
    reef.push({ x, z, s: 0.8 + rnd() * 0.9, rot: rnd() * 6.28 });
  }
  // the rim: rocks and the tall kelp past the edge, where nobody swims
  const rim: Put[] = [], ring = Math.round((2 * Math.PI * HALF) / 2.6);
  for (let i = 0; i < ring * 2; i++) {
    const a = (i / ring) * Math.PI * 2 + rnd() * 0.4, r = HALF + 1 + (i % 2) * 5 + rnd() * 2;
    rim.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 1 + rnd() * 0.6, rot: rnd() * 6.28 });
  }
  return { corals, kelp, rocks, rim, reef };
}

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });

/** One instanced mesh of `geo` at every `put`, standing on the floor; `y` lifts each. */
function instances(scene: THREE.Scene, name: string, geo: THREE.BufferGeometry, material: THREE.Material, puts: readonly Put[], y = 0, shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, puts.length));
  mesh.name = name; mesh.count = puts.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  puts.forEach((t, i) => mesh.setMatrixAt(i, m4.compose(p.set(t.x, height(t.x, t.z) + y * t.s, t.z), q.setFromAxisAngle(up, t.rot ?? 0), s.setScalar(t.s))));
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/** A group of meshes standing at (x, z) on the floor, named, casting shadows; its round collider. */
function put(scene: THREE.Scene, name: string, x: number, z: number, parts: THREE.Mesh[], r: number, yaw = 0) {
  const g = new THREE.Group();
  g.name = name;
  for (const m of parts) { m.castShadow = true; g.add(m); }
  g.position.set(x, height(x, z), z); g.rotation.y = yaw;
  scene.add(g);
  if (r > 0) colliders.push({ x, z, r });
  return g;
}

/** The sea in the scene, and its colliders. */
export function buildScenery(scene: THREE.Scene) {
  const { corals, kelp, rocks, rim, reef } = placeLife();
  for (const c of [...corals, ...reef]) colliders.push({ x: c.x, z: c.z, r: 0.35 * c.s });
  for (const r of rocks) colliders.push({ x: r.x, z: r.z, r: 0.9 * r.s });
  // corals: branch cones and brain balls, pale (the magic of WORLD-09 colours them later); the reef's pink and orange
  const half = (p: Put[], k: number) => p.filter((_, i) => i % 2 === k);
  instances(scene, 'corals-branch', new THREE.ConeGeometry(0.45, 1.6, 6).translate(0, 0.8, 0), mat('#e9c6c0'), half(corals, 0));
  instances(scene, 'corals-ball', new THREE.IcosahedronGeometry(0.55, 0).translate(0, 0.4, 0), mat('#e8d6b8'), half(corals, 1));
  instances(scene, 'reef-branch', new THREE.ConeGeometry(0.5, 2, 6).translate(0, 1, 0), mat('#f07a8a'), half(reef, 0));
  instances(scene, 'reef-ball', new THREE.IcosahedronGeometry(0.6, 0).translate(0, 0.45, 0), mat('#f39a4a'), half(reef, 1));
  instances(scene, 'kelp', new THREE.BoxGeometry(0.12, 3.2, 0.5).translate(0, 1.6, 0), mat('#5f9a6a'), kelp, 0, false);
  instances(scene, 'rocks', new THREE.DodecahedronGeometry(1, 0).translate(0, 0.5, 0), mat('#9aa3a6'), rocks);
  instances(scene, 'rim-kelp', new THREE.BoxGeometry(0.3, 9, 1.2).translate(0, 4.5, 0), mat('#4c7f63'), rim, 0, false);

  // the reef's landmark: two tall fan corals by the dragon
  const fan = (h: number, c: string) => new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.25, h, 7).translate(0, h / 2, 0).scale(1, 1, 0.25), mat(c));
  put(scene, 'landmark-reef', LANDMARKS.reef.x, LANDMARKS.reef.z, [fan(LANDMARKS.reef.top, '#f2667a'), fan(LANDMARKS.reef.top * 0.8, '#f59a3c')], 0.8, 0.5);
  // the corals where Bulk forgot the pearl (WORLD-08): a ring of orange balls round its nest
  const nest = Array.from({ length: 6 }, (_, i) => ({ x: CORAL_NEST.x + Math.cos(i) * 1.1, z: CORAL_NEST.z + Math.sin(i) * 1.1, s: 0.9, rot: i }));
  instances(scene, 'coral-nest', new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.35, 0), mat('#f39a4a'), nest);

  // the castle of the mermaids: a ring of towers round the throne hall, its gate toward the gardens - seen from everywhere
  const towers: Put[] = TOWERS.map((t) => ({ ...t, s: 1 }));
  for (const t of towers) colliders.push({ x: t.x, z: t.z, r: CASTLE.towerR + 0.2 });
  instances(scene, 'castle-towers', new THREE.CylinderGeometry(CASTLE.towerR * 0.85, CASTLE.towerR, CASTLE.towerH, 10).translate(0, CASTLE.towerH / 2, 0), mat('#c9d8e6'), towers);
  instances(scene, 'castle-roofs', new THREE.ConeGeometry(CASTLE.towerR * 1.3, 3, 10).translate(0, CASTLE.towerH + 1.5, 0), mat('#7fb6d6', { emissive: '#2f6f9a', emissiveIntensity: 0.3 }), towers);
  // the arch of the way in on the square (the landmark of the square: the castle stands behind her coming from the
  // grotto): two pillars of mother-of-pearl and a glowing ring over them
  const arch = SQUARE_ARCH, pillar = (sx: number) => new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, arch.top - 1.2, 8).translate(sx, (arch.top - 1.2) / 2, 0), mat('#e9dcef'));
  put(scene, 'landmark-square', arch.x, arch.z, [
    pillar(-arch.w / 2), pillar(arch.w / 2),
    new THREE.Mesh(new THREE.TorusGeometry(arch.w / 2, 0.35, 8, 20, Math.PI).translate(0, arch.top - 1.2, 0), mat('#bfefff', { emissive: '#7fd8ff', emissiveIntensity: 0.6 })),
  ], 0);
  for (const sx of [-arch.w / 2, arch.w / 2]) colliders.push({ x: arch.x + sx, z: arch.z, r: 0.6 });
  // the gate (with its shell lock, WORLD-19 later): two posts and a lintel at the north of the ring
  const gate = LANDMARKS.gate;
  put(scene, 'castle-gate', gate.x, gate.z, [
    new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.5, 0.8).translate(-2.2, 2.25, 0), mat('#c9d8e6')),
    new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.5, 0.8).translate(2.2, 2.25, 0), mat('#c9d8e6')),
    new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.8, 0.9).translate(0, 4.8, 0), mat('#e7d3a8')),
  ], 0);
  for (const sx of [-2.2, 2.2]) colliders.push({ x: gate.x + sx, z: gate.z, r: 0.55 });
  // the shell of the throne: where the pearls come together in the finale
  put(scene, 'throne', THRONE.x, THRONE.z, [new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), mat('#f3e9f2', { emissive: '#a08aa8', emissiveIntensity: 0.25 }))], 0);

  // the sunken ship on its side, its mast up: the second landmark (WORLD-10); the captain's cabin at its stern
  const hull = new THREE.Mesh(new THREE.BoxGeometry(SHIP.len, 3, 4).translate(0, 1.2, 0), mat('#9a6a40'));
  hull.rotation.z = 0.25;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, SHIP.mastH, 7).translate(0, SHIP.mastH / 2, 0), mat('#7a5232'));
  const trim = new THREE.Mesh(new THREE.BoxGeometry(SHIP.len * 0.9, 0.3, 4.2).translate(0, 2.8, 0), mat('#d7b04a', { emissive: '#6a5210', emissiveIntensity: 0.25 }));
  trim.rotation.z = 0.25;
  put(scene, 'landmark-ship', SHIP.x, SHIP.z, [hull, mast, trim], 0, 0.3);
  for (let i = -2; i <= 2; i++) colliders.push({ x: SHIP.x + Math.cos(0.3) * i * (SHIP.len / 5), z: SHIP.z - Math.sin(0.3) * i * (SHIP.len / 5), r: 2 });
  put(scene, 'cabin-door', CABIN.x, CABIN.z, [new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.2).translate(0, 0.9, 0), mat('#5a3a22'))], 0, 0.3);

  // the crab's grotto: a dome of red rock with a chimney, pots before it
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#b8695a'));
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 5, 7).translate(0, 6.5, 0), mat('#a85a4c'));
  put(scene, 'landmark-grotto', LANDMARKS.grotto.x, LANDMARKS.grotto.z, [dome, chimney], 3.6);
  const pots = Array.from({ length: 3 }, (_, i) => ({ x: ZONES.grotto.x - 1.5 + i * 1.5, z: ZONES.grotto.z - 2.5, s: 1, rot: 0 }));
  instances(scene, 'pots', new THREE.CylinderGeometry(0.45, 0.35, 0.6, 8).translate(0, 0.3, 0), mat('#d04a36'), pots);

  // the trench: an arch of rock over it, turquoise lights round its bowl
  put(scene, 'landmark-trench', LANDMARKS.trench.x, LANDMARKS.trench.z, [
    new THREE.Mesh(new THREE.TorusGeometry(5, 0.9, 6, 12, Math.PI).translate(0, 4, 0), mat('#6f8590')),
  ], 0, 0.6);
  const lights = Array.from({ length: 16 }, (_, i) => ({ x: ZONES.trench.x + Math.cos(i * 2.3) * (2 + (i % 5) * 1.3), z: ZONES.trench.z + Math.sin(i * 2.3) * (2 + (i % 5) * 1.3), s: 1 }));
  instances(scene, 'trench-lights', new THREE.SphereGeometry(0.12, 6, 4).translate(0, 2.6, 0), new THREE.MeshBasicMaterial({ color: '#5ff2e0' }), lights, 0, false);

  // the shell garden: its great shell, small shells of mother-of-pearl round it
  put(scene, 'landmark-garden', LANDMARKS.garden.x, LANDMARKS.garden.z, [
    new THREE.Mesh(new THREE.ConeGeometry(2.2, LANDMARKS.garden.top, 9).translate(0, LANDMARKS.garden.top / 2, 0), mat('#f1e4ee', { emissive: '#8a7a92', emissiveIntensity: 0.2 })),
  ], 1.8, 0.4);
  const shells = Array.from({ length: 12 }, (_, i) => ({ x: ZONES.garden.x + Math.cos(i * 2.1) * (3 + (i % 3) * 1.6), z: ZONES.garden.z + Math.sin(i * 2.1) * (3 + (i % 3) * 1.6), s: 1, rot: i }));
  instances(scene, 'shells', new THREE.SphereGeometry(0.35, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1.3), mat('#f4e8f0'), shells);
}

/**
 * Shafts of light from the surface (docs/worlds/world-3.md: light, sun through the water): tall pale beams, slanted,
 * swaying slowly, added over what is behind them. One instanced mesh - one draw call; no light of their own.
 */
export function buildShafts(scene: THREE.Scene, n: number) {
  const geo = new THREE.CylinderGeometry(1.4, 2.6, 30, 10, 1, true).translate(0, 15, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), n);
  mesh.name = 'light-shafts'; mesh.frustumCulled = false;
  const zones = Object.values(ZONES);
  const at = Array.from({ length: n }, (_, i) => { const z = zones[i % zones.length]; return { x: z.x + Math.sin(i * 2.7) * 6, z: z.z + Math.cos(i * 2.7) * 6, ph: i * 1.3 }; });
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  const sway = (time: number) => {
    at.forEach((a, i) => mesh.setMatrixAt(i, m4.compose(p.set(a.x, height(a.x, a.z) - 1, a.z), q.setFromEuler(e.set(0.25 + Math.sin(time * 0.3 + a.ph) * 0.05, 0.6, 0.1)), s)));
    mesh.instanceMatrix.needsUpdate = true;
  };
  sway(0);
  scene.add(mesh);
  return { mesh, sway };
}
