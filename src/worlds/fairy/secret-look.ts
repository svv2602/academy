import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texturedParts, type Part } from '../../core/assets';
import { facets, mat } from '../../core/style';
import { GLADE } from './layout';

/**
 * The look of the two secrets (a draft for the customer, 2026-11-19): the glade behind the waterfall made secret and
 * magic - an old twisted tree at its back with a glowing crown, a ring of glowing mushrooms, flowers of the kit along
 * the rocks, fireflies; the room of the fairy house made cosy - a ceiling with beams, a floor of planks, papered walls,
 * a window, a fireplace, a bed with a patchwork quilt. Only models the world loads already (their weight is in the
 * core) and shapes of its own on the style frame (src/core/style.ts, docs/worlds/style.md); nothing gives light - every
 * glow is a material's.
 */

/** One InstancedMesh per part of a kit model: its own material, so a glow can be given to some parts only. */
function partsAt(parts: Part[], at: { x: number; y: number; z: number; s: number; rot: number }[], glow?: (p: Part) => THREE.ColorRepresentation | null, glowK = 0.6) {
  const out = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sv = new THREE.Vector3();
  for (const p of parts) {
    const e = glow?.(p) ?? null;
    const m = new THREE.MeshStandardMaterial({
      map: p.map, alphaTest: p.cutout ? 0.5 : 0, side: p.cutout ? THREE.DoubleSide : THREE.FrontSide, roughness: 0.9,
      color: p.map ? '#ffffff' : '#63c356', ...(e ? { emissive: e, emissiveIntensity: glowK, emissiveMap: p.map } : {}),
    });
    const mesh = new THREE.InstancedMesh(p.geo, m, at.length);
    at.forEach((a, i) => mesh.setMatrixAt(i, m4.compose(v.set(a.x, a.y, a.z), q.setFromAxisAngle(up, a.rot), sv.setScalar(a.s))));
    mesh.castShadow = !p.cutout; mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

/** Fireflies: soft dots over the grass, drifting; brighter with the world's magic. */
function fireflies(n: number, cx: number, cz: number, r: number, y0: number) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d')!, gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.35, 'rgba(255,240,150,0.7)'); gr.addColorStop(1, 'rgba(255,230,120,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  const pos = new Float32Array(n * 3), seed: number[] = [];
  for (let i = 0; i < n; i++) seed.push(i * 2.39996, 0.6 + ((i * 37) % 10) / 10 * (r - 0.6), 0.3 + ((i * 13) % 7) / 7 * 1.6);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: tex, size: 0.32, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#fff3a8' });
  const pts = new THREE.Points(geo, mat);
  const update = (t: number) => {
    for (let i = 0; i < n; i++) {
      const a = seed[i * 3] + t * 0.12 * (i % 2 ? 1 : -1), rr = seed[i * 3 + 1] + Math.sin(t * 0.5 + i) * 0.4;
      pos[i * 3] = cx + Math.sin(a) * rr; pos[i * 3 + 2] = cz + Math.cos(a) * rr;
      pos[i * 3 + 1] = y0 + seed[i * 3 + 2] + Math.sin(t * 1.3 + i * 1.7) * 0.25;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.65 + Math.sin(t * 2.1) * 0.2;
  };
  update(0);
  return { pts, update };
}

/** m from the glade's middle within which its look is drawn: past it the ring of rocks hides it anyway. */
export const GLADE_LOOK_R = 16;
export interface GladeLook {
  /** `d`: how far she is from the glade's middle - the look is drawn only near it (no draw calls from the valley). */
  update(time: number, d: number): void;
  readonly root: THREE.Group;
}

/** The glade dressed: `face` is the way out (towards the waterfall), `block` keeps the heroine out of the tree's trunk. */
export async function dressGlade(parent: THREE.Group, groundY: (x: number, z: number) => number, face: number, block: (x: number, z: number, r: number) => void): Promise<GladeLook> {
  const N = (n: string, h: number, normals: 'model' | 'up' | 'sphere' = 'model') => texturedParts('nature2/' + n, h, normals);
  const [tree, mush, flowersA, flowersB, bush, fern] = await Promise.all([
    N('TwistedTree1', 5.2, 'sphere'), N('MushroomCommon', 0.35), N('Flower3Group', 0.6, 'up'), N('Flower4Single', 0.5, 'up'),
    N('BushCommonFlowers', 1.1, 'sphere'), N('Fern1', 0.7, 'up'),
  ]);
  const group = new THREE.Group();
  parent.add(group);
  const at = (x: number, z: number, s: number, rot: number) => ({ x, y: groundY(x, z), z, s, rot });
  const back = face + Math.PI;
  // 1. the old tree at the back, its crown glowing softly (leaves only)
  const tx = GLADE.x + Math.sin(back) * 2.7, tz = GLADE.z + Math.cos(back) * 2.7;
  group.add(partsAt(tree, [at(tx, tz, 1, back + 0.6)], (p) => (p.cutout ? '#ffb8f0' : null), 0.35));
  block(tx, tz, 0.6);
  // 2. a ring of glowing mushrooms around the tree's foot
  const ring = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2, r = 1.25 + (i % 2) * 0.2;
    return at(tx + Math.sin(a) * r, tz + Math.cos(a) * r, 0.9 + ((i * 7) % 5) * 0.12, i * 1.3);
  });
  group.add(partsAt(mush, ring, () => '#9fe8ff', 0.9));
  // 3. flowers of the kit in drifts along the rocks, ferns at their foot (the entrance left open)
  const along = (n: number, r0: number, dr: number, k: number) => Array.from({ length: n }, (_, i) => {
    const a = face + 0.75 + (i / (n - 1)) * (Math.PI * 2 - 1.5), r = r0 + ((i * k) % 5) / 5 * dr;
    return at(GLADE.x + Math.sin(a) * r, GLADE.z + Math.cos(a) * r, 0.8 + ((i * 3) % 4) * 0.15, i * 2.1);
  });
  group.add(partsAt(flowersA, along(16, 3.0, 0.9, 3), (p) => (p.cutout ? '#ff9ad8' : null), 0.25));
  group.add(partsAt(flowersB, along(14, 2.6, 1.1, 2)));
  group.add(partsAt(bush, along(6, 4.1, 0.4, 1)));
  group.add(partsAt(fern, along(12, 4.3, 0.5, 4)));
  // 4. fireflies over the grass
  const ff = fireflies(28, GLADE.x, GLADE.z, GLADE.r, groundY(GLADE.x, GLADE.z));
  group.add(ff.pts);
  return {
    root: group,
    update: (t, d) => {
      group.visible = d < GLADE_LOOK_R;
      if (group.visible) ff.update(t);
    },
  };
}

/** A texture drawn on a canvas, repeated. */
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/**
 * The still pieces of furniture that wear one material made one mesh: a draw call per material, not per board (the
 * style's budget, docs/worlds/style.md). The pieces are taken out of `parent` and their geometries freed.
 */
export function mergeByMaterial(parent: THREE.Object3D, meshes: THREE.Mesh[]): void {
  const by = new Map<string, THREE.Mesh[]>();
  for (const m of meshes) {
    const k = `${m.material instanceof THREE.Material ? m.material.uuid : ''}|${m.castShadow}`;
    by.set(k, [...(by.get(k) ?? []), m]);
  }
  for (const list of by.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => { m.updateMatrix(); const gm = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); return gm; });
    const merged = new THREE.Mesh(mergeGeometries(geos, false)!, list[0].material);
    merged.castShadow = list[0].castShadow; merged.receiveShadow = true;
    for (const g of geos) g.dispose();
    for (const m of list) { parent.remove(m); m.geometry.dispose(); }
    parent.add(merged);
  }
}

export interface RoomLook { update(time: number): void }

/**
 * The room dressed, in its own frame (`room`'s origin is the middle of its floor; the door in the wall at +z). It
 * replaces the plain floor, walls and bed it is handed.
 */
export function dressRoom(room: THREE.Group, half: number, wallH: number, old: { floor: THREE.Mesh; walls: THREE.Group; bed: THREE.Mesh }): RoomLook {
  const S = half * 2;
  // floor of planks: a textured material of its own (the floor's shared wood is not changed for it)
  old.floor.material = new THREE.MeshStandardMaterial({ roughness: 0.8, map: canvasTex(256, 256, (x) => {
    for (let i = 0; i < 8; i++) {
      x.fillStyle = ['#c98f5c', '#d39c68', '#bf8552', '#cd9661'][i % 4]; x.fillRect(0, i * 32, 256, 32);
      x.fillStyle = 'rgba(80,45,20,0.45)'; x.fillRect(0, i * 32, 256, 2); x.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32);
    }
  }, 3, 3) });
  // papered walls: soft stripes and small flowers, a wooden band below
  const paper = canvasTex(128, 256, (x) => {
    x.fillStyle = '#fbe9d6'; x.fillRect(0, 0, 128, 256);
    x.fillStyle = '#f6d9c4'; for (let i = 0; i < 4; i++) x.fillRect(i * 32 + 12, 0, 8, 256);
    x.fillStyle = '#f2a7c8'; for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(((i % 2) * 64) + 32, i * 32 + 16, 4, 0, 7); x.fill(); }
    x.fillStyle = '#a8794f'; x.fillRect(0, 200, 128, 56);
    x.fillStyle = '#8a5f3c'; x.fillRect(0, 198, 128, 4);
  }, 6, 1);
  const papered = new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9 });
  for (const w of old.walls.children) (w as THREE.Mesh).material = papered;
  const wood = mat.wood('woodDark');
  const added: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true;
    room.add(m); added.push(m); return m;
  };
  // the ceiling: seen from inside only - the camera of the room stands over it and looks through (no beams: they would
  // cross its view)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mat.cloth('plaster'));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = wallH; room.add(ceil);
  // the window, in the wall at -x: frame, glass glowing with the sky, curtains, a sill with a pot
  const wx = -half + 0.03, wz = -1.4;
  const glass = add(new THREE.PlaneGeometry(1.3, 1.1), mat.glow('#cfeeff', 0.9, { emissive: '#bfe6ff' }), wx + 0.01, 1.75, wz, Math.PI / 2);
  glass.castShadow = false;
  const frame = mat.wood('#fff6ea');
  add(new THREE.BoxGeometry(0.1, 1.3, 0.1), frame, wx + 0.04, 1.75, wz);
  add(new THREE.BoxGeometry(0.1, 0.08, 1.3), frame, wx + 0.04, 1.75, wz);
  for (const [dy, h] of [[0.6, 0.1], [-0.6, 0.1]] as const) add(new THREE.BoxGeometry(0.12, h, 1.5), frame, wx + 0.05, 1.75 + dy, wz);
  for (const dz of [-0.7, 0.7]) add(new THREE.BoxGeometry(0.12, 1.3, 0.1), frame, wx + 0.05, 1.75, wz + dz);
  add(new THREE.BoxGeometry(0.3, 0.06, 1.6), wood, wx + 0.15, 1.15, wz);
  const curtain = mat.cloth('rose');
  for (const dz of [-0.95, 0.95]) add(new THREE.BoxGeometry(0.08, 1.7, 0.4), curtain, wx + 0.12, 1.65, wz + dz);
  add(new THREE.CylinderGeometry(0.12, 0.09, 0.2, facets(0.24)), mat.stone('#d9774a'), wx + 0.16, 1.28, wz + 0.4);
  add(new THREE.SphereGeometry(0.14, facets(0.28), facets(0.28) / 2), mat.glow('#ff7fb8', 0.2), wx + 0.16, 1.48, wz + 0.4);
  // the fireplace, in the wall at +x: bricks, a dark hearth, flames glowing, a mantel, the chimney to the ceiling
  const fx = half - 0.35, fz = 1.2;
  const brick = new THREE.MeshStandardMaterial({ roughness: 0.95, map: canvasTex(128, 128, (x) => {
    x.fillStyle = '#c9765a'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#e8d5c4';
    for (let r = 0; r < 8; r++) { x.fillRect(0, r * 16, 128, 2); for (let c = 0; c < 4; c++) x.fillRect(c * 32 + (r % 2) * 16, r * 16, 2, 16); }
  }) });
  add(new THREE.BoxGeometry(0.7, 1.3, 1.8), brick, fx, 0.65, fz);
  add(new THREE.BoxGeometry(0.72, 0.7, 0.9), mat.stone('#2a1a14'), fx - 0.02, 0.42, fz);
  add(new THREE.BoxGeometry(0.85, 0.1, 2.0), wood, fx - 0.05, 1.35, fz);
  add(new THREE.BoxGeometry(0.6, wallH - 1.4, 1.0), brick, fx + 0.05, 1.4 + (wallH - 1.4) / 2, fz);
  const flame = (c: `#${string}`, k: number) => mat.glow(c, k);
  const flames = [
    add(new THREE.ConeGeometry(0.16, 0.45, facets(0.45)), flame('#ff8a3d', 1.6), fx - 0.4, 0.3, fz - 0.15),
    add(new THREE.ConeGeometry(0.12, 0.36, facets(0.36)), flame('#ffd166', 1.8), fx - 0.4, 0.27, fz + 0.15),
    add(new THREE.ConeGeometry(0.08, 0.26, facets(0.26)), flame('#fff1b0', 2.0), fx - 0.42, 0.24, fz),
  ];
  for (const f of flames) f.castShadow = false;
  add(new THREE.BoxGeometry(0.4, 0.06, 0.7), mat.wood('#5a3a26'), fx - 0.4, 0.1, fz);
  // the bed: a frame, a headboard at the wall, the mattress, a patchwork quilt and a pillow
  room.remove(old.bed);
  const bx = -half + 1.0, bz = 1.6;
  add(new THREE.BoxGeometry(1.5, 0.35, 2.3), wood, bx, 0.18, bz);
  add(new THREE.BoxGeometry(1.5, 1.1, 0.12), wood, bx, 0.55, bz + 1.15);
  add(new THREE.BoxGeometry(1.4, 0.2, 2.15), mat.cloth('#fff8f0'), bx, 0.45, bz);
  const quilt = canvasTex(128, 128, (x) => {
    const cs = ['#c79bff', '#ffb3d9', '#9ad0ff', '#ffe08a', '#a6e27f'];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = cs[(i * 3 + j) % cs.length]; x.fillRect(i * 32, j * 32, 32, 32); }
    x.strokeStyle = '#ffffff'; x.lineWidth = 2; for (let i = 0; i <= 4; i++) { x.strokeRect(0, 0, i * 32, 128); x.strokeRect(0, 0, 128, i * 32); }
  });
  add(new THREE.BoxGeometry(1.46, 0.08, 1.5), new THREE.MeshStandardMaterial({ map: quilt, roughness: 1 }), bx, 0.58, bz - 0.3);
  add(new THREE.BoxGeometry(0.9, 0.16, 0.42), mat.cloth('white'), bx, 0.62, bz + 0.78);
  mergeByMaterial(room, added.filter((m) => !(flames as THREE.Mesh[]).includes(m)));
  return {
    update: (t) => {
      flames.forEach((f, i) => { f.scale.set(1, 1 + Math.sin(t * (7 + i * 2.3) + i) * 0.18, 1); });
    },
  };
}
