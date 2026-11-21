import * as THREE from 'three';
import { staticGeo } from '../../core/assets';
import { instanced } from '../../core/instancing';
import { fadeAtCamera, propMaterial } from '../../core/materials';
import { mulberry32 } from '../../core/util';
import { ALTAR, HALF, HOLLOW, LANDMARKS, OAK, OWL_TREE, PATHS, ROUTE, SCALE, STREAM, STREAM_HALF, ZONES, inMaze, type Place } from './layout';
import { WATER_Y, colliders, height, lineDist, pathDist, streamDist } from './terrain';

/**
 * The trees of the forest (plan A of its look, 2026-11-21): models of the core (nature_pack, Quaternius CC0 - their
 * weight is the core's already, nothing new is downloaded), each kind merged into one geometry of flat colours
 * (`staticGeo`) and drawn as instances by ground cells: one draw call a kind and a cell. The grove's are the same
 * leafy trees with their leaves orange (its accent, WORLD-10).
 */
/** The leafy tree and the spruce (a third of the trees: the spruce has a half more triangles). */
export const TREE_KINDS = [['nature_pack/CommonTree_4', 7], ['nature_pack/PineTree_1', 8.5]] as const;
/** The leaves of an evening forest, deeper than the packs' spring green; the grove's orange (its accent). */
const LEAVES: readonly Record<string, string>[] = [{ Green: '#4f8a4a', DarkGreen: '#3c7442' }, { Green: '#2f6b4c' }];
const GROVE_LEAVES = { Green: '#e8913a', DarkGreen: '#d4731f' };
export interface Flora { trees: THREE.BufferGeometry[]; grove: THREE.BufferGeometry }
export async function loadFlora(): Promise<Flora> {
  const [trees, grove] = await Promise.all([Promise.all(TREE_KINDS.map(([p, h], k) => staticGeo(p, h, LEAVES[k]))), staticGeo('nature_pack/CommonTree_4', 7, GROVE_LEAVES)]);
  return { trees, grove };
}

/**
 * The forest of the grey build in simple shapes at their real sizes (WORLD-12): trees as a trunk and a crown, the
 * houses of the village as a stem and a cap, the arch of the maze, the stream and its bridges, the Old Oak. Each kind
 * is one instanced mesh; the colours are the zones' accents of the document (the gnomes red caps, the owl blue
 * fireflies, the squirrels orange leaves). Models replace them once the customer has accepted the grey build.
 */

/** The squirrel's tracks (the path from the grove to the Ash) and the half-width of the clearing along them, m. */
const TRACKS = PATHS[PATHS.length - 1];
export const CLEARING = 7;
/**
 * The lines of sight of the route (WORLD-10): from every target to the landmark of the next one, no tree stands within
 * SIGHT m (a crown's width) - the landmark of the next target is seen from each (tools/forest-grey.mjs measures it).
 */
export const SIGHT = 3.2;
export const SIGHT_SHORT = 8;
/** The lines of sight, each stopped SIGHT_SHORT m before its landmark: the trees that are the landmark (the grove) stay. */
export const sightLines = (): Place[][] => ROUTE.slice(1).map((b, i) => {
  const from = ZONES[ROUTE[i]], to = LANDMARKS[b], d = Math.hypot(to.x - from.x, to.z - from.z) || 1, k = Math.max(0, d - SIGHT_SHORT) / d;
  return [from, { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k }];
});

/**
 * m² of the map a tree: 60 in the grey build (its trees a trunk and a crown, a few dozen triangles); 90 with the models
 * (2026-11-21: at 60 the frame from the central glade had 807 thousand triangles, over the 650 of TECH-06).
 */
export const TREE_AREA = 90;
/** m: only the cells of trees whose middle is within this and their radius of her cast a shadow (the sun's shadow covers ±26 m round her). */
export const TREE_SHADOW = 12;

/** A placed thing: where, how big, turned how. */
interface Put { x: number; z: number; s: number; rot?: number }

/** The trees of the forest, deterministic: away from the paths, the zones, the stream and each other. */
export function placeTrees(seed = 7): { trees: Put[]; rim: Put[] } {
  const rnd = mulberry32(seed), trees: Put[] = [], rim: Put[] = [];
  const zones = Object.values(ZONES);
  // the clearing along the squirrel's tracks: from the grove the Ash is seen over its whole length (WORLD-10; the grove's
  // tall crowns hid it at 51 and 77 m)
  const sights = sightLines();
  const clear = (x: number, z: number) => pathDist(x, z) > 3.5 && lineDist(TRACKS, x, z) > CLEARING && sights.every((l) => lineDist(l, x, z) > SIGHT) && streamDist(x, z) > STREAM_HALF + 2
    && zones.every((p) => Math.hypot(p.x - x, p.z - z) > 8) && Math.hypot(OWL_TREE.x - x, OWL_TREE.z - z) > 5
    && !inMaze(x, z, 1.5) && Math.hypot(ALTAR.x - x, ALTAR.z - z) > 9;
  // about one tree on TREE_AREA m² of the map: the density stays the same whatever the stretch of the map
  const want = Math.round((Math.PI * HALF * HALF) / TREE_AREA);
  for (let tries = 0; trees.length < want && tries < want * 40; tries++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (HALF - 3), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clear(x, z) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
    trees.push({ x, z, s: 0.8 + rnd() * 0.5, rot: rnd() * 6.28 });
  }
  // the spruces of the edge: thick, past the edge of the map, where nobody walks
  const ring = Math.round((2 * Math.PI * HALF) / 2.6);
  for (let i = 0; i < ring * 3; i++) {
    const a = (i / ring) * Math.PI * 2 + rnd() * 0.4, r = HALF + 1 + (i % 3) * 4.5 + rnd() * 2;
    rim.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 1 + rnd() * 0.6, rot: rnd() * 6.28 });
  }
  return { trees, rim };
}

/** Where the paths cross the stream: there the bridges lie. */
export function bridges(): (Place & { yaw: number })[] {
  const out: (Place & { yaw: number })[] = [];
  for (const line of PATHS) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
    let best: Place | null = null, bd = Infinity;
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n, d = streamDist(x, z);
      if (d < bd) { bd = d; best = { x, z }; }
    }
    if (best && bd < 0.6 && !out.some((p) => Math.hypot(p.x - best!.x, p.z - best!.z) < 4)) out.push({ ...best, yaw: Math.atan2(b.x - a.x, b.z - a.z) });
  }
  return out;
}

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });

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

/** The forest in the scene, and its colliders. */
export function buildScenery(scene: THREE.Scene, flora: Flora) {
  const { trees, rim } = placeTrees();
  for (const t of trees) colliders.push({ x: t.x, z: t.z, r: 0.45 * t.s });
  // the kinds of trees mixed; the grove's are orange and taller than the forest's: their crowns are its landmark (WORLD-10)
  const grove = (t: Put) => Math.hypot(t.x - ZONES.grove.x, t.z - ZONES.grove.z) < 16 * SCALE;
  const treeMat = propMaterial(0.0035);
  // a tree between the camera and her, or at the lens, is looked through (src/core/materials.ts fadeAtCamera)
  const sway = treeMat.onBeforeCompile.bind(treeMat);
  treeMat.onBeforeCompile = (sh, r) => { sway(sh, r); fadeAtCamera(sh); };
  treeMat.customProgramCacheKey = () => 'forest-tree|sway|fade';
  const at = (t: Put) => ({ x: t.x, z: t.z, s: t.s, rot: t.rot ?? 0 });
  const cells = flora.trees.flatMap((geo, k) => instanced(scene, height, geo, treeMat, trees.filter((t, i) => !grove(t) && (i % 3 === 0 ? 1 : 0) === k).map(at), true)
    .map((c) => { c.mesh.name = `trees-${k}`; return c.mesh; }));
  cells.push(...instanced(scene, height, flora.grove, treeMat, trees.filter(grove).map((t) => at({ ...t, s: t.s * 1.35 })), true).map((c) => { c.mesh.name = 'trees-grove'; return c.mesh; }));
  /** Every frame: a cell of trees casts its shadow only while its middle is within TREE_SHADOW m (and its own radius) of her. */
  const shadows = (x: number, z: number) => {
    for (const m of cells) { const b = m.boundingSphere!; m.castShadow = Math.hypot(b.center.x - x, b.center.z - z) < TREE_SHADOW + b.radius; }
  };
  instances(scene, 'rim', new THREE.ConeGeometry(2.4, 9, 6).translate(0, 4.2, 0), mat('#2c5a46'), rim, 0, false);

  // the gnomes' village: five mushroom houses round its middle
  const houses: Put[] = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    return { x: ZONES.village.x + Math.cos(a) * 6.5, z: ZONES.village.z + Math.sin(a) * 6.5, s: 1, rot: a };
  }).filter((h) => pathDist(h.x, h.z) > 2.6);
  for (const h of houses) colliders.push({ x: h.x, z: h.z, r: 1.4 });
  instances(scene, 'house-stems', new THREE.CylinderGeometry(1.1, 1.3, 2.4, 8).translate(0, 1.2, 0), mat('#f2e6cf'), houses);
  instances(scene, 'house-caps', new THREE.ConeGeometry(2.3, 1.6, 9).translate(0, 3.1, 0), mat('#d8443a'), houses);
  // the grove's great orange tree at the edge of its glade: the grove's landmark (WORLD-10)
  const big = new THREE.Group();
  big.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 6, 9).translate(0, 3, 0), mat('#7a5a3e')));
  big.add(new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 0).translate(0, 8, 0), mat('#f0952e')));
  big.position.set(LANDMARKS.grove.x, height(LANDMARKS.grove.x, LANDMARKS.grove.z), LANDMARKS.grove.z);
  big.name = 'landmark-grove';
  big.traverse((o) => { o.castShadow = true; });
  scene.add(big);
  colliders.push({ x: LANDMARKS.grove.x, z: LANDMARKS.grove.z, r: 1.1 });

  // the elder's house: a mushroom tower over the trees, the village's landmark (WORLD-10)
  const tower = new THREE.Group();
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 6.5, 10).translate(0, 3.25, 0), mat('#f2e6cf')));
  tower.add(new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 12).translate(0, 7.3, 0), mat('#e0392f')));
  tower.position.set(LANDMARKS.village.x, height(LANDMARKS.village.x, LANDMARKS.village.z), LANDMARKS.village.z);
  tower.name = 'landmark-village';
  tower.traverse((o) => { o.castShadow = true; });
  scene.add(tower);
  colliders.push({ x: LANDMARKS.village.x, z: LANDMARKS.village.z, r: 1.8 });

  // the Owl glade: the owl's tree with its hollow, blue fireflies round it
  const owlTree = new THREE.Group();
  owlTree.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 7, 8).translate(0, 3.5, 0), mat('#6b4c34')));
  owlTree.add(new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 0).translate(0, 8.5, 0), mat('#3f7a55')));
  const hollow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), mat('#20140c'));
  hollow.position.set(HOLLOW.x - OWL_TREE.x, 1.3, HOLLOW.z - OWL_TREE.z); hollow.lookAt(new THREE.Vector3(HOLLOW.x - OWL_TREE.x, 1.3, HOLLOW.z - OWL_TREE.z).multiplyScalar(3));
  owlTree.add(hollow);
  owlTree.position.set(OWL_TREE.x, height(OWL_TREE.x, OWL_TREE.z), OWL_TREE.z);
  owlTree.name = 'landmark-owl';
  owlTree.traverse((o) => { o.castShadow = true; });
  scene.add(owlTree);
  colliders.push({ x: OWL_TREE.x, z: OWL_TREE.z, r: 1 });
  const flies: Put[] = Array.from({ length: 14 }, (_, i) => ({ x: ZONES.owl.x + Math.cos(i * 2.4) * (2 + (i % 4)), z: ZONES.owl.z + Math.sin(i * 2.4) * (2 + (i % 4)), s: 1 }));
  // over the heroine's head (at her height one showed on her face in the frame of the owl's steps)
  instances(scene, 'fireflies', new THREE.SphereGeometry(0.09, 6, 4).translate(0, 2.8, 0), new THREE.MeshBasicMaterial({ color: '#7fd0ff' }), flies, 0, false);

  // the maze (WORLD-14): its hedges and stones are the task's own (src/worlds/forest/maze.ts)

  // the stream: a ribbon of water over its bed, and a bridge where a path crosses it
  const pts = STREAM.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const curve = new THREE.CatmullRomCurve3(pts), n = 160, pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPoint(i / n), d = curve.getTangent(i / n), side = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(STREAM_HALF + 0.3);
    pos.push(p.x + side.x, WATER_Y, p.z + side.z, p.x - side.x, WATER_Y, p.z - side.z);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const water = new THREE.BufferGeometry();
  water.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); water.setIndex(idx); water.computeVertexNormals();
  const stream = new THREE.Mesh(water, mat('#7cc6dc', { transparent: true, opacity: 0.8, roughness: 0.3, flatShading: false, side: THREE.DoubleSide }));
  stream.name = 'stream'; stream.receiveShadow = true;
  scene.add(stream);
  const decks = bridges().map((b) => ({ x: b.x, z: b.z, s: 1, rot: b.yaw }));
  instances(scene, 'bridges', new THREE.BoxGeometry(2.2, 0.25, (STREAM_HALF + 1.2) * 2).translate(0, 0.05, 0), mat('#a0774e'), decks);

  // the arches of stones: at the central glade (where the hub's arch will lead in) and at the way into the maze
  const archGeo = [new THREE.BoxGeometry(0.5, 2.8, 0.5).translate(-1.3, 1.4, 0), new THREE.BoxGeometry(0.5, 2.8, 0.5).translate(1.3, 1.4, 0), new THREE.BoxGeometry(3.3, 0.45, 0.6).translate(0, 3, 0)];
  for (const [p, yaw, name] of [[LANDMARKS.center, 0.4, 'landmark-center'], [LANDMARKS.maze, Math.PI / 2, 'landmark-maze']] as const) {
    const arch = new THREE.Group();
    arch.name = name;
    for (const gm of archGeo) { const m = new THREE.Mesh(gm, mat('#9b968c')); m.castShadow = true; arch.add(m); }
    arch.position.set(p.x, height(p.x, p.z), p.z); arch.rotation.y = yaw;
    scene.add(arch);
    for (const sx of [-1.3, 1.3]) colliders.push({ x: p.x + Math.cos(yaw) * sx, z: p.z - Math.sin(yaw) * sx, r: 0.4 });
  }

  // the talking tree, Old Ash: a thick trunk with two eyes, by the stream
  const ash = new THREE.Group();
  // the oldest tree but the Oak: over the forest, so it is seen across the grove (WORLD-10)
  ash.add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 8.5, 9).translate(0, 4.25, 0), mat('#7d6248')));
  ash.add(new THREE.Mesh(new THREE.IcosahedronGeometry(4.4, 0).translate(0, 11, 0), mat('#5c8f5a')));
  for (const sx of [-0.45, 0.45]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat('#fffbe8')); eye.position.set(sx, 3.2, 1.25); ash.add(eye); }
  ash.position.set(ZONES.ash.x, height(ZONES.ash.x, ZONES.ash.z), ZONES.ash.z - 2.6);
  ash.name = 'landmark-ash';
  ash.traverse((o) => { o.castShadow = true; });
  scene.add(ash);
  colliders.push({ x: ash.position.x, z: ash.position.z, r: 1.6 });

  // the Old Oak, the landmark of the map, and the altar of the finale before it
  const oak = new THREE.Group();
  oak.add(new THREE.Mesh(new THREE.CylinderGeometry(OAK.trunkR * 0.75, OAK.trunkR, OAK.trunkH, 10).translate(0, OAK.trunkH / 2, 0), mat('#6e5034')));
  // a crown of its own colour, golden green: from anywhere the Oak is the landmark (WORLD-10)
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(OAK.crownR, 1), mat('#a5c94f', { emissive: '#4d6a1a', emissiveIntensity: 0.25 }));
  crown.position.y = OAK.crownY; crown.scale.y = 0.8;
  oak.add(crown);
  oak.position.set(ZONES.oak.x, height(ZONES.oak.x, ZONES.oak.z), ZONES.oak.z);
  oak.name = 'landmark-oak';
  oak.traverse((o) => { o.castShadow = true; });
  scene.add(oak);
  colliders.push({ x: ZONES.oak.x, z: ZONES.oak.z, r: OAK.trunkR + 0.3 });
  const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.2, 16), mat('#c9e8c0', { emissive: '#6fd06a', emissiveIntensity: 0.4 }));
  altar.position.set(ALTAR.x, height(ALTAR.x, ALTAR.z) + 0.1, ALTAR.z);
  scene.add(altar);
  return { trees, oak, stream, shadows };
}
