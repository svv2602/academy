import * as THREE from 'three';
import { mulberry32 } from '../../core/util';
import { CASTLE, CORAL_NEST, GROTTO, HALF, LANDMARKS, ROUTE, SHIP, SQUARE_ARCH, TOWERS, ZONES, type Place } from './layout';
import { colliders, height, lineDist, pathDist } from './terrain';
import { mat as style } from '../../core/style';
import { buildLandmarks } from './landmarks';
import { ANEMONE_COLOURS, FLOOR_COLOURS, FLOOR_KINDS, KELP_COLOURS, REEF_COLOURS, REEF_KINDS, SHELL_COLOURS, anemoneGeometry, coralGeometry, kelpGeometry, rockGeometry, shellGeometry, swayMaterial, type CoralKind } from './life';

/**
 * The sea of the grey build in simple shapes at their real sizes (WORLD-12): corals as cones and balls, kelp as thin
 * ribbons, rocks, the castle of the mermaids as a ring of towers behind its gate, the sunken ship on its side with its
 * mast, the crab's grotto, the arch over the trench, the great shell of the garden and the shell of the throne. Each
 * kind is one instanced mesh; the colours are the zones' accents of the document (the reef pink and orange, the ship
 * warm wood and gold, the grotto red, the trench turquoise lights, the garden mother-of-pearl). Models replace them once
 * the customer has accepted the grey build.
 *
 * Step A of the sea's look (2026-11-22): the floor's corals (five kinds on the reef, three elsewhere), the anemones, the
 * swaying kelp, the rocks and the garden's shells are our own faceted shapes (./life.ts), each kind one instanced mesh
 * with a colour per instance over one shared material. Their places are those of the grey build (`placeLife`): the
 * search among the corals lays its shells by the same corals of the reef.
 *
 * Step B (2026-11-22): the landmarks are painted shapes of ./landmarks.ts - the castle of shells, Kenney's wreck, the
 * grotto, the trench's arch, the garden's great shell, the reef's fans, the throne; their colliders stay the grey build's.
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
export function placeLife(seed = 11): { corals: Put[]; kelp: Put[]; rocks: Put[]; rim: Put[]; reef: Put[]; anemones: Put[]; sprinkle: Put[] } {
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
  // the anemones (step A of the look): by the reef, the garden and the grotto, on a draw of their own - the places above
  // stay as they were - and never on a way or another thing
  const own = mulberry32(seed * 31 + 7), anemones: Put[] = [];
  const taken = (x: number, z: number) => [...corals, ...reef, ...kelp, ...rocks].some((t) => Math.hypot(t.x - x, t.z - z) < 1.2 * t.s);
  for (const [zone, n, r0, dr] of [[ZONES.reef, 18, 3.5, 9], [ZONES.garden, 10, 2.5, 6], [ZONES.grotto, 8, 4.5, 4]] as const) {
    for (let tries = 0, got = 0; got < n && tries < n * 30; tries++) {
      const a = own() * Math.PI * 2, r = r0 + own() * dr, x = zone.x + Math.cos(a) * r, z = zone.z + Math.sin(a) * r;
      if (pathDist(x, z) < 2.2 || taken(x, z) || anemones.some((t) => Math.hypot(t.x - x, t.z - z) < 0.9)) continue;
      anemones.push({ x, z, s: 0.8 + own() * 0.6, rot: own() * 6.28 }); got++;
    }
  }
  // more small corals over the floor (the look, step A), on that draw of their own too: smaller, no collider - she
  // swims over them; never on a way, a line of sight or another thing
  const sprinkle: Put[] = [], wantS = Math.round(Math.PI * HALF * HALF / 90);
  for (let tries = 0; sprinkle.length < wantS && tries < wantS * 40; tries++) {
    const a = own() * Math.PI * 2, r = Math.sqrt(own()) * (HALF - 3), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clear(x, z, 6) || taken(x, z) || sprinkle.some((t) => Math.hypot(t.x - x, t.z - z) < 2)) continue;
    sprinkle.push({ x, z, s: 0.4 + own() * 0.4, rot: own() * 6.28 });
  }
  // the grotto behind the seaweed (./secrets.ts): nothing grows in it or before its curtain - taken out after the
  // scattering, so that everything else stands where it stood before the grotto was made
  const out = (puts: Put[]) => puts.filter((t) => Math.hypot(GROTTO.x - t.x, GROTTO.z - t.z) > GROTTO.clear);
  return { corals: out(corals), kelp: out(kelp), rocks: out(rocks), rim, reef: out(reef), anemones: out(anemones), sprinkle: out(sprinkle) };
}

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });

/** One instanced mesh of `geo` at every `put`, standing on the floor; `y` lifts each. */
function instances(scene: THREE.Scene, name: string, geo: THREE.BufferGeometry, material: THREE.Material, puts: readonly Put[], y = 0, shadow = true, colours?: readonly string[]) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, puts.length));
  mesh.name = name; mesh.count = puts.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  puts.forEach((t, i) => mesh.setMatrixAt(i, m4.compose(p.set(t.x, height(t.x, t.z) + y * t.s, t.z), q.setFromAxisAngle(up, t.rot ?? 0), s.setScalar(t.s))));
  // a colour per instance, picked by its place (the same every time): one material for the kind, many colours
  if (colours) puts.forEach((t, i) => mesh.setColorAt(i, c.set(colours[Math.abs(Math.round(t.x * 7 + t.z * 13)) % colours.length])));
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/** The kinds of coral among `puts`, in turn by their place: { kind: its puts }. */
const byKind = (puts: readonly Put[], kinds: readonly CoralKind[]) => {
  const out = new Map<CoralKind, Put[]>(kinds.map((k) => [k, []]));
  puts.forEach((t, i) => out.get(kinds[i % kinds.length])!.push(t));
  return out;
};

/** The sea in the scene, and its colliders; `sway(time)` moves the kelp with the water; `throne.open(k)` opens the throne's lid. `wreck`: the ship's model. */
export function buildScenery(scene: THREE.Scene, wreck: THREE.Object3D | null = null) {
  const { corals, kelp, rocks, rim, reef, anemones, sprinkle } = placeLife();
  for (const c of [...corals, ...reef]) colliders.push({ x: c.x, z: c.z, r: 0.35 * c.s });
  for (const r of rocks) colliders.push({ x: r.x, z: r.z, r: 0.9 * r.s });
  // corals (step A of the look): five kinds on the reef in its warm colours, three on the rest of the floor, pastel;
  // one shared faceted material, white, coloured per instance
  const coral = style.stone('#ffffff');
  // a coral of ./life.ts is about 1 m: the floor's as large as the grey cones they replace (1.6 m), the reef's a little less
  const grow = (puts: readonly Put[], k: number) => puts.map((t) => ({ ...t, s: t.s * k }));
  for (const [kind, puts] of byKind(reef, REEF_KINDS)) instances(scene, `reef-${kind}`, coralGeometry(kind), coral, grow(puts, 1.3), 0, true, REEF_COLOURS);
  for (const [kind, puts] of byKind([...grow(corals, 1.6), ...grow(sprinkle, 1.6)], FLOOR_KINDS)) instances(scene, `corals-${kind}`, coralGeometry(kind), coral, puts, 0, true, FLOOR_COLOURS);
  instances(scene, 'anemones', anemoneGeometry(), coral, anemones, 0, false, ANEMONE_COLOURS);
  // the kelp sways with the water (its shader bends it by height); the tall kelp past the edge too, slower and wider
  const kelpMat = swayMaterial(style.own('moss', '#ffffff') as THREE.MeshStandardMaterial, 0.35), rimMat = swayMaterial(style.own('moss', '#ffffff') as THREE.MeshStandardMaterial, 0.9);
  for (const m of [kelpMat.material, rimMat.material]) m.side = THREE.DoubleSide;
  instances(scene, 'kelp', kelpGeometry(3.2), kelpMat.material, kelp, 0, false, KELP_COLOURS);
  instances(scene, 'rim-kelp', kelpGeometry(9, 3), rimMat.material, rim, 0, false, ['#4c7f63', '#5a8f6c', '#467a5c']);
  instances(scene, 'rocks', rockGeometry(), style.stone('#a9b3b8'), rocks);

  // the landmarks (step B of the look): our own painted shapes and Kenney's wreck (./landmarks.ts); their colliders here,
  // the grey build's
  colliders.push({ x: LANDMARKS.reef.x, z: LANDMARKS.reef.z, r: 0.8 });
  // the corals where Bulk forgot the pearl (WORLD-08): a ring of orange balls round its nest
  const nest = Array.from({ length: 6 }, (_, i) => ({ x: CORAL_NEST.x + Math.cos(i) * 1.1, z: CORAL_NEST.z + Math.sin(i) * 1.1, s: 0.9, rot: i }));
  instances(scene, 'coral-nest', new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.35, 0), mat('#f39a4a'), nest);
  for (const t of TOWERS) colliders.push({ x: t.x, z: t.z, r: CASTLE.towerR + 0.2 });
  for (const sx of [-SQUARE_ARCH.w / 2, SQUARE_ARCH.w / 2]) colliders.push({ x: SQUARE_ARCH.x + sx, z: SQUARE_ARCH.z, r: 0.6 });
  for (const sx of [-2.2, 2.2]) colliders.push({ x: LANDMARKS.gate.x + sx, z: LANDMARKS.gate.z, r: 0.55 });
  for (let i = -2; i <= 2; i++) colliders.push({ x: SHIP.x + Math.cos(0.3) * i * (SHIP.len / 5), z: SHIP.z - Math.sin(0.3) * i * (SHIP.len / 5), r: 2 });
  colliders.push({ x: LANDMARKS.grotto.x, z: LANDMARKS.grotto.z, r: 3.6 }, { x: LANDMARKS.garden.x, z: LANDMARKS.garden.z, r: 1.8 });
  const throne = buildLandmarks(scene, wreck);

  // the trench: turquoise lights round its bowl
  const lights = Array.from({ length: 16 }, (_, i) => ({ x: ZONES.trench.x + Math.cos(i * 2.3) * (2 + (i % 5) * 1.3), z: ZONES.trench.z + Math.sin(i * 2.3) * (2 + (i % 5) * 1.3), s: 1 }));
  instances(scene, 'trench-lights', new THREE.SphereGeometry(0.12, 6, 4).translate(0, 2.6, 0), new THREE.MeshBasicMaterial({ color: '#5ff2e0' }), lights, 0, false);

  // the shell garden: small shells of mother-of-pearl round its great shell
  const shells = Array.from({ length: 12 }, (_, i) => ({ x: ZONES.garden.x + Math.cos(i * 2.1) * (3 + (i % 3) * 1.6), z: ZONES.garden.z + Math.sin(i * 2.1) * (3 + (i % 3) * 1.6), s: 1, rot: i }));
  // the garden's shells: scallops and spirals of mother-of-pearl, a faint glow of their own
  const pearl = style.glow('#ffffff', 0.12, { emissive: '#e8d8f0', flatShading: true });
  instances(scene, 'shells', shellGeometry('fan'), pearl, shells.filter((_, i) => i % 3 !== 2), 0, true, SHELL_COLOURS);
  instances(scene, 'shells-spiral', shellGeometry('spiral'), pearl, shells.filter((_, i) => i % 3 === 2), 0, true, SHELL_COLOURS);
  return { sway: (time: number) => { kelpMat.time.value = time; rimMat.time.value = time; }, throne };
}

/**
 * Shafts of light from the surface (docs/worlds/world-3.md: light, sun through the water): tall pale beams, slanted,
 * swaying slowly, added over what is behind them. One instanced mesh - one draw call; no light of their own.
 */
export function buildShafts(scene: THREE.Scene, n: number) {
  const geo = new THREE.CylinderGeometry(1.4, 2.6, 30, 10, 1, true).translate(0, 15, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#fff8e4', transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), n);
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
