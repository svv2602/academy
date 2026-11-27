import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, facets, mat } from '../../core/style';
import { fadeAtCamera } from '../../core/materials';

/**
 * The gnomes' mushroom houses and the elder's mushroom tower (plan B of the forest's look, 2026-11-21; the customer's
 * decision: our own shapes, docs/worlds/style.md): a stem of plaster, a red cap with white spots, a wooden door, round
 * windows lit from inside (mat.glow - no new light, WORLD-09). Their walls are baked into one geometry of vertex
 * colours and their windows into another (`bake`): two draws for the five houses, two for the tower.
 */
export const CAP_RED = '#d8443a';
export const TOWER_RED = '#e0392f';

/** One house of height `h` (its cap's top), `r` its stem's radius: the geometries by material, standing at 0, its door to +z. */
export function mushroomHouse(h: number, r: number, windows: number): Record<'stem' | 'cap' | 'spots' | 'door' | 'glow', THREE.BufferGeometry> {
  const stemH = h * 0.62, capR = r * 1.95, capH = h - stemH + 0.35, n = facets(capR * 2);
  const stem = new THREE.CylinderGeometry(r * 0.9, r * 1.1, stemH, facets(r * 2)).translate(0, stemH / 2, 0);
  // the cap: a dome over the stem, its rim a little below the stem's top
  const cap = new THREE.SphereGeometry(1, n, Math.max(3, Math.round(n / 4)), 0, Math.PI * 2, 0, Math.PI / 2).scale(capR, capH, capR).translate(0, stemH - 0.35, 0);
  const spots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996, e = 0.35 + (i % 3) * 0.22;           // round the cap, three rings of height
    const s = new THREE.SphereGeometry(capR * 0.1, 6, 3).scale(1, 0.45, 1);
    // on the dome: its point at angle e from the top, the spot turned to lie on it
    const p = new THREE.Vector3(Math.sin(a) * Math.sin(e) * capR, stemH - 0.35 + Math.cos(e) * capH, Math.cos(a) * Math.sin(e) * capR);
    s.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(p.x / capR, (p.y - stemH + 0.35) / capH, p.z / capR).normalize()));
    spots.push(s.translate(p.x, p.y, p.z));
  }
  const doorH = Math.min(1.5, stemH * 0.62);
  const door = new THREE.BoxGeometry(0.75, doorH, 0.12).translate(0, doorH / 2, r * 1.02);
  const glow: THREE.BufferGeometry[] = [];
  for (let i = 0; i < windows; i++) {
    const a = (i % 2 ? -1 : 1) * (0.9 + Math.floor(i / 2) * 0.5), y = stemH * (0.55 + Math.floor(i / 2) * 0.22);
    glow.push(new THREE.CircleGeometry(0.22, 10).translate(0, 0, 0).rotateY(a).translate(Math.sin(a) * r * 1.0, y, Math.cos(a) * r * 1.0));
  }
  return { stem, cap, spots: mergeGeometries(spots)!, door, glow: mergeGeometries(glow)! };
}

/** The colours of a house's parts (the style's palette, src/core/style.ts) and its light. */
const PAINT = (red: string) => ({ stem: PALETTE.plaster, cap: red, spots: PALETTE.white, door: PALETTE.door });
/** The light of the windows: the style's glow (mat.glow, no new light, WORLD-09). */
const windowGlow = () => mat.glow('gold', 0.8);
/** The walls of every house in one material of vertex colours (the cloth's matte look): one draw for all of them. */
let bodyMat: THREE.MeshStandardMaterial | null = null;
/**
 * A house between the camera and her, or at the lens, is looked through as the trees are (src/core/materials.ts
 * fadeAtCamera): in the village the camera behind her often stands in a neighbour's cap.
 */
const bodyMaterial = () => (bodyMat ??= Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }), {
  name: 'forest-house-body',
  onBeforeCompile: (sh: THREE.WebGLProgramParametersWithUniforms) => fadeAtCamera(sh),
  customProgramCacheKey: () => 'forest-house|fade',
}));

/** A geometry with every vertex of `colour` (a `color` attribute), non-indexed so the parts merge. */
function painted(geo: THREE.BufferGeometry, colour: string) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  const c = new THREE.Color(colour), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * The houses baked (plan C, 2026-11-21: a few draw calls freed for the fireflies): every house's stem, cap, spots and
 * door in one geometry of vertex colours, every window in another - two draws for the whole village, whatever its
 * houses; the walls cast the shadow.
 */
function bake(geos: ReturnType<typeof mushroomHouse>, red: string, puts: readonly { x: number; y: number; z: number; rot: number }[]) {
  const paint = PAINT(red), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const body: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
  for (const p of puts) {
    m.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rot), one);
    for (const key of ['stem', 'cap', 'spots', 'door'] as const) body.push(painted(geos[key], paint[key]).applyMatrix4(m));
    const w = geos.glow.index ? geos.glow.toNonIndexed() : geos.glow.clone();
    w.deleteAttribute('uv');
    glow.push(w.applyMatrix4(m));
  }
  const walls = new THREE.Mesh(mergeGeometries(body)!, bodyMaterial()), windows = new THREE.Mesh(mergeGeometries(glow)!, windowGlow());
  walls.castShadow = true; walls.receiveShadow = true;
  body.concat(glow).forEach((g) => g.dispose());
  return { walls, windows };
}

/** The houses at `puts` (where, turned how): two draws for all of them (./village.ts `bake`). */
export function buildHouses(scene: THREE.Scene, puts: readonly { x: number; y: number; z: number; rot: number }[]) {
  const { walls, windows } = bake(mushroomHouse(3.6, 1.2, 2), CAP_RED, puts);
  walls.name = 'house-walls'; windows.name = 'house-windows';
  scene.add(walls, windows);
}

/**
 * The big mushrooms of Pip's command (LEARN-23, ./en-places.ts): the village's mushroom with no door and no window, of
 * height `h` and stem `r`, at `puts`. One geometry of vertex colours for all of them and the houses' own material - no
 * new program; a mesh each, so the frame draws only the ones in sight.
 */
export function buildBigMushrooms(h: number, r: number, puts: readonly { x: number; y: number; z: number; rot: number }[]): THREE.Mesh[] {
  const geos = mushroomHouse(h, r, 1), paint = PAINT(CAP_RED);
  const body = (['stem', 'cap', 'spots'] as const).map((key) => painted(geos[key], paint[key]));
  const geo = mergeGeometries(body)!;
  geo.computeBoundingSphere();
  body.forEach((g) => g.dispose());
  Object.values(geos).forEach((g) => g.dispose());
  return puts.map((p, i) => {
    const mesh = new THREE.Mesh(geo, bodyMaterial());
    mesh.name = `big-mushroom-${i}`;
    mesh.position.set(p.x, p.y, p.z); mesh.rotation.y = p.rot;
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  });
}

/** The elder's tower: the same house, tall, with windows up its stem; a group named for the landmark (WORLD-10). */
export function buildTower(): THREE.Group {
  const { walls, windows } = bake(mushroomHouse(8.8, 1.45, 6), TOWER_RED, [{ x: 0, y: 0, z: 0, rot: 0 }]);
  const g = new THREE.Group();
  g.add(walls, windows);
  g.name = 'landmark-village';
  return g;
}
