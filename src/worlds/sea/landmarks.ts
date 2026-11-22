/**
 * The landmarks of the sea (the plan of the sea's look, step B, the customer's word 2026-11-22: "годится, переходим к
 * ориентирам"): the castle of the mermaids of our own shells, the reef's two great fans, the crab's grotto, the arch
 * over the trench, the great shell of the garden, the throne hall, and the sunken ship - Kenney's "Ship Wreck"
 * (CC0 1.0, CREDITS.md) painted the same way. Each landmark is one painted shape (./paint.ts): one draw call however
 * many parts; only the lid of the throne is a shape of its own, as it opens in the finale.
 *
 * Where each stands and how high its top is are the grey build's (./layout.ts, WORLD-10): the lines of sight measured
 * then hold (tools/sea-grey.mjs). The shapes are in world coordinates, each part standing on the floor where it is.
 */
import * as THREE from 'three';
import { mulberry32 } from '../../core/util';
import { CASTLE, LANDMARKS, SHIP, SQUARE_ARCH, THRONE, TOWERS, ZONES } from './layout';
import { Paint, paintMaterial, place } from './paint';
import { colliders, height } from './terrain';
import { coralGeometry } from './life';

/** Colours of the zones (docs/worlds/world-3.md): mother-of-pearl and turquoise for the mermaids, red for the crab. */
const PEARL = '#efe4f7', PINK = '#f2a7c3', LILAC = '#b39ae8', TURQUOISE = '#5fc7dc', NACRE = '#fbf4ff';
const ROCK_RED = ['#b8695a', '#a85a4c', '#c97a5e'] as const, ROCK_GREY = ['#93a7b1', '#7f949e', '#a3b5be'] as const;

/** A lump of rock: an icosahedron with its corners pushed in and out (the same corner of two faces the same way). */
function lump(r: number, seed: number, detail = 1, flatY = 0.85): THREE.BufferGeometry {
  const rnd = mulberry32(seed), g = new THREE.IcosahedronGeometry(r, detail), pos = g.getAttribute('position') as THREE.BufferAttribute;
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let f = seen.get(k);
    if (f === undefined) { f = 0.82 + rnd() * 0.32; seen.set(k, f); }
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * flatY, pos.getZ(i) * f);
  }
  return g;
}

/**
 * A scallop of `ribs` ribs, lying: its hinge at the origin (the middle of its straight edge along x), its fan on the +z
 * side, its back domed up `deep` of its radius - each rib a slice of a dome, every second a little lower. Thin: painted
 * `both` sides.
 */
function scallop(r: number, ribs: number, deep: number): { geo: THREE.BufferGeometry; rib: number }[] {
  return Array.from({ length: ribs }, (_, i) => ({
    geo: new THREE.SphereGeometry(r * (i % 2 ? 0.95 : 1), 2, 4, (i / ribs) * Math.PI, Math.PI / ribs, 0, Math.PI / 2).scale(1, deep, 1),
    rib: i,
  }));
}

/** A twisted column of shell: short faceted drums each turned a little, `h` m high, a scallop on its head. */
function column(p: Paint, x: number, z: number, h: number, r: number, colour: string, head: string) {
  const y0 = height(x, z), n = 6, dh = h / n;
  for (let i = 0; i < n; i++) p.add(new THREE.CylinderGeometry(r * (1 - i * 0.03), r * (1.08 - i * 0.03), dh, 6).translate(0, dh / 2, 0), i % 2 ? colour : PINK, 0.05, place(x, y0 + i * dh, z, i * 0.5));
  for (const s of scallop(r * 2.2, 7, 0.45)) p.add(s.geo, s.rib % 2 ? head : PEARL, 0.12, place(x, y0 + h, z - r * 1.1), true);
}

/** The castle of the mermaids: six shell towers, garlands of pearls between them, the gate, the columns of the hall. */
/** The shimmer of mother-of-pearl, low to high: pink, pearl, turquoise, lilac (the customer, 2026-11-22: "серого почти нет"). */
const NACRE_BANDS = ['#f7b3cf', '#fde8f1', '#f2c6e4', '#a7e6ea', '#e6f6fb', '#c6b2f2', '#fbeaf6'].map((c) => new THREE.Color(c));
function nacre(f: number, c: THREE.Color): THREE.Color {
  const t = (((f % 1) + 1) % 1) * NACRE_BANDS.length, i = Math.floor(t);
  return c.copy(NACRE_BANDS[i]).lerp(NACRE_BANDS[(i + 1) % NACRE_BANDS.length], t - i);
}

/**
 * A tower of the castle as a spiral shell (a turret shell, the customer's word 2026-11-22: "башни — завитые раковины,
 * спираль на всю высоту"): one tube wound `turns` times up round a core, wide at the foot and narrowing to a point,
 * its open mouth at the foot. Its corners: `steps` a turn along the tube, `ring` round it. Origin at its foot.
 */
export function spiralShell(h: number, r0: number, tube0: number, turns: number, phase: number, steps = 12, ring = 7): THREE.BufferGeometry {
  const n = Math.round(turns * steps), pos: number[] = [], idx: number[] = [];
  const at = (s: number) => {
    const a = phase + s * turns * Math.PI * 2, k = 1 - 0.82 * s, tube = tube0 * k;
    return { a, R: r0 * k, tube, y: h * 0.9 * s + tube * 1.15 };
  };
  for (let i = 0; i <= n; i++) {
    const { a, R, tube, y } = at(i / n), ux = Math.cos(a), uz = Math.sin(a);
    for (let j = 0; j < ring; j++) {
      const f = (j / ring) * Math.PI * 2;
      // the cross-section in the plane of the radius and up: the tube's round
      pos.push((R + Math.cos(f) * tube) * ux, y + Math.sin(f) * tube * 1.15, (R + Math.cos(f) * tube) * uz);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + ((j + 1) % ring), c = a + ring, d = b + ring;
    idx.push(a, b, c, b, d, c);
  }
  // the mouth at the foot: shut by a fan to its middle
  const m0 = at(0), mid = pos.length / 3;
  pos.push(m0.R * Math.cos(m0.a), m0.y, m0.R * Math.sin(m0.a));
  for (let j = 0; j < ring; j++) idx.push(mid, (j + 1) % ring, j);
  // the tip: its last round to a point
  const tip = pos.length / 3, mt = at(1);
  pos.push(mt.R * Math.cos(mt.a), mt.y + mt.tube * 3.5, mt.R * Math.sin(mt.a));
  for (let j = 0; j < ring; j++) idx.push(tip, n * ring + j, n * ring + ((j + 1) % ring));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** The castle of the mermaids: six spiral-shell towers, garlands of pearls between them, the gate, the columns of the hall. */
function castle(): Paint {
  const p = new Paint();
  const H = CASTLE.towerH * 1.03, R = CASTLE.towerR * 0.8, TUBE = CASTLE.towerR * 0.62, TURNS = 5.5;
  TOWERS.forEach((t, i) => {
    const y = height(t.x, t.z), phase = i * 1.3;
    const shimmer = (x: number, yy: number, z: number, c: THREE.Color) => nacre(yy / H * 1.4 + Math.atan2(z, x) / (Math.PI * 2) * 0.35 + i * 0.13, c);
    p.shade(spiralShell(H, R, TUBE, TURNS, phase), shimmer, 0.1, place(t.x, y, t.z));
    // its core between the whorls, in the same shimmer, narrow: the whorls cover it
    p.shade(new THREE.ConeGeometry(R * 0.6, H * 0.92, 8).translate(0, H * 0.46, 0), shimmer, 0.08, place(t.x, y, t.z));
    // windows of turquoise light on two whorls, facing out of the ring
    const out = Math.atan2(t.z - CASTLE.z, t.x - CASTLE.x);
    for (const turn of [1, 3]) {
      const s = ((((out - phase) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) + turn * Math.PI * 2) / (TURNS * Math.PI * 2), k = 1 - 0.82 * s;
      const rr = R * k + TUBE * k * 0.98, wy = H * 0.9 * s + TUBE * k * 1.15;
      p.add(new THREE.SphereGeometry(0.4 * k + 0.12, 6, 4).scale(0.8, 1.2, 0.3), '#3fb3cf', 0.75, place(t.x + Math.cos(out) * rr, y + wy, t.z + Math.sin(out) * rr, Math.atan2(Math.cos(out), Math.sin(out))));
    }
    p.add(new THREE.IcosahedronGeometry(0.45, 1), NACRE, 0.55, place(t.x, y + H * 0.9 + TUBE * 0.18 * 4.5 + 0.6, t.z));
  });
  const top = H * 0.6;   // where the garlands hang from
  // garlands of pearls from tower to tower, high over the way, not between the two of the gate (the throne is seen there)
  const gateNear = (t: { x: number; z: number }) => t.z < CASTLE.z && Math.abs(t.x - CASTLE.x) < CASTLE.ring * 0.6;
  for (let i = 0; i < TOWERS.length; i++) {
    const a = TOWERS[i], b = TOWERS[(i + 1) % TOWERS.length];
    if (gateNear(a) && gateNear(b)) continue;
    const ya = height(a.x, a.z) + top, yb = height(b.x, b.z) + top;
    for (let k = 1; k < 10; k++) {
      const f = k / 10, sag = Math.sin(f * Math.PI) * 1.6;
      p.add(new THREE.IcosahedronGeometry(0.24, 0), NACRE, 0.4, place(a.x + (b.x - a.x) * f, ya + (yb - ya) * f - sag, a.z + (b.z - a.z) * f));
    }
  }
  // the gate (its doors and the shell lock are ./lock.ts's): two twisted posts, the lintel, a great scallop over it
  const gate = LANDMARKS.gate, gy = height(gate.x, gate.z);
  for (const sx of [-2.2, 2.2]) column(p, gate.x + sx, gate.z, 4.4, 0.42, PEARL, TURQUOISE);
  p.add(new THREE.BoxGeometry(5.4, 0.7, 0.9).translate(0, 4.85, 0), PINK, 0.1, place(gate.x, gy, gate.z));
  for (const s of scallop(2.6, 11, 0.3)) p.add(s.geo, s.rib % 2 ? PINK : PEARL, 0.14, place(gate.x, gy + 5.2, gate.z + 0.1, Math.PI, 1, -Math.PI / 2), true);
  p.add(new THREE.IcosahedronGeometry(0.45, 1), NACRE, 0.6, place(gate.x, gy + 5.6, gate.z - 0.45));
  // the hall: four columns of shell round the throne, off the line from the gate to it
  for (const a of [0.8, -0.8, 2.4, -2.4]) {
    const x = THRONE.x + Math.sin(a) * 4.6, z = THRONE.z - Math.cos(a) * 4.6;
    column(p, x, z, 4.2, 0.36, PEARL, LILAC);
    colliders.push({ x, z, r: 0.55 });
  }
  return p;
}

/**
 * The throne: a great scallop on a short stalk, its pedestal of pearl; its lid lies on it until the finale, then it
 * opens up behind (`open(k)`, k from 0 shut to 1 open) under the Pearl of the Deep. Its top shut is LANDMARKS.throne's.
 */
function throne(scene: THREE.Scene) {
  const y = height(THRONE.x, THRONE.z), group = new THREE.Group();
  group.name = 'throne'; group.position.set(THRONE.x, y, THRONE.z);
  const base = new Paint();
  base.add(new THREE.CylinderGeometry(0.5, 0.8, 0.35, 8).translate(0, 0.17, 0), PEARL, 0.1);
  // the bowl: a scallop face down (its dome under it), its hinge at the back
  for (const s of scallop(1.7, 11, 0.32)) base.add(s.geo, s.rib % 2 ? PINK : PEARL, 0.2, place(0, 0.7, 0.85, 0, 1, Math.PI), true);
  base.add(new THREE.CylinderGeometry(0.28, 0.4, 0.3, 8).translate(0, 0.85, 0), LILAC, 0.3);
  const bowl = base.mesh('throne-bowl');
  // the lid: the same scallop dome up, hinged at the back edge (+z)
  const lid = new Paint();
  for (const s of scallop(1.7, 11, 0.42)) lid.add(s.geo, s.rib % 2 ? LILAC : PEARL, 0.22, place(0, 0, 0, Math.PI), true);
  const hinge = new THREE.Group(); hinge.position.set(0, 0.72, 0.85);
  hinge.add(lid.mesh('throne-lid'));
  group.add(bowl, hinge);
  scene.add(group);
  return { open: (k: number) => { hinge.rotation.x = 1.9 * Math.min(1, Math.max(0, k)); } };
}

/** The reef's two great fan corals by the dragon (7 m and 5.6 m high, narrow), seen both sides. */
function reefFans(): Paint {
  const p = new Paint(), L = LANDMARKS.reef, y = height(L.x, L.z), fan = coralGeometry('fan');
  for (const [dx, dz, h, c, yaw] of [[0, 0, L.top, '#f2667a', 0.5], [1.4, 0.9, L.top * 0.8, '#f59a3c', 1.1]] as const) {
    const s = h / 1.2;
    // as narrow as the grey build's fans (1.6 m out each way): the camera by the dragon sees past them
    p.add(fan, c, 0.12, place(L.x + dx, y, L.z + dz, yaw, new THREE.Vector3(s * 0.3, s, s * 0.3)), true);
  }
  return p;
}

/** The crab's grotto: a dome of red rock with a lit door toward his zone, a chimney, his pots before it. */
function grotto(): Paint {
  const p = new Paint(), L = LANDMARKS.grotto, y = height(L.x, L.z);
  p.add(lump(4, 3, 1, 1.05), ROCK_RED[0], 0, place(L.x, y, L.z));
  p.add(lump(2.6, 4), ROCK_RED[1], 0, place(L.x + 2.6, y, L.z + 1.6));
  p.add(lump(2.2, 5), ROCK_RED[2], 0, place(L.x - 1.8, y, L.z + 2.6));
  // the door: dark, warm light in it, facing the zone
  const toZone = Math.atan2(ZONES.grotto.x - L.x, ZONES.grotto.z - L.z);
  p.add(new THREE.CircleGeometry(1.3, 8, 0, Math.PI).translate(0, 0, 3.45), '#ffb36b', 0.7, place(L.x, y + 0.1, L.z, toZone));
  p.add(new THREE.TorusGeometry(1.4, 0.25, 4, 8, Math.PI).translate(0, 0, 3.4), '#8f4a3e', 0, place(L.x, y + 0.1, L.z, toZone));
  // the chimney: three drums leaning, its rim
  for (let i = 0; i < 3; i++) p.add(new THREE.CylinderGeometry(0.62 - i * 0.05, 0.8 - i * 0.05, 1.9, 7).translate(0, 0.95, 0), i % 2 ? '#d07a62' : '#c06a56', 0, place(L.x + 0.6 + i * 0.12, y + 3.4 + i * 1.75, L.z - 0.4, i * 0.6, 1, 0.05));
  p.add(new THREE.TorusGeometry(0.62, 0.18, 4, 7).rotateX(Math.PI / 2), '#6f3a30', 0, place(L.x + 0.96, y + L.top - 0.5, L.z - 0.4));
  // the pots: round, red, the soup in them glowing
  for (let i = 0; i < 3; i++) {
    const x = ZONES.grotto.x - 1.5 + i * 1.5, z = ZONES.grotto.z - 2.5, py = height(x, z);
    p.add(new THREE.SphereGeometry(0.45, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 1.2, 1).translate(0, 0.55, 0), '#d04a36', 0.05, place(x, py, z, i));
    p.add(new THREE.TorusGeometry(0.45, 0.07, 4, 8).rotateX(Math.PI / 2).translate(0, 0.55, 0), '#7a2f22', 0, place(x, py, z));
    p.add(new THREE.CircleGeometry(0.42, 8).rotateX(-Math.PI / 2).translate(0, 0.5, 0), ['#ffcf6b', '#9be37a', '#ff9a6b'][i], 0.7, place(x, py, z));
  }
  return p;
}

/** The arch over the trench: faceted grey stones on two legs, turquoise crystals growing on it. */
function trenchArch(): Paint {
  const p = new Paint(), L = LANDMARKS.trench, y = height(L.x, L.z), yaw = 0.6, rnd = mulberry32(17);
  const at = (lx: number, ly: number) => new THREE.Vector3(L.x + Math.cos(yaw) * lx, y + ly, L.z - Math.sin(yaw) * lx);
  const R = 4.6, C = 3.8;
  // the legs, then the arc of stones
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { const v = at(sx * R, i * 1.3 + 0.5); p.add(lump(1.05, 30 + i + (sx > 0 ? 9 : 0), 0, 1), ROCK_GREY[i % 3], 0, place(v.x, v.y, v.z, rnd() * 6)); }
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * Math.PI, v = at(Math.cos(t) * R, C + Math.sin(t) * R);
    p.add(lump(1.05, 50 + i, 0, 1), ROCK_GREY[i % 3], 0, place(v.x, v.y, v.z, rnd() * 6));
    if (i % 2 === 0) p.add(new THREE.OctahedronGeometry(0.35, 0).scale(1, 2.2, 1), '#5ff2e0', 0.9, place(v.x, v.y + 0.9, v.z, rnd() * 3, 1, rnd() - 0.5, rnd() - 0.5));
  }
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const v = at(sx * (R + 1.2) + k * 0.4, 0);
    p.add(new THREE.OctahedronGeometry(0.3, 0).scale(1, 2.5, 1).translate(0, 0.6, 0), '#7ff5e8', 0.8, place(v.x + k * 0.3, v.y, v.z + k * 0.4, k, 1 + k * 0.2, (k - 1) * 0.3));
  }
  return p;
}

/** The great shell of the garden: a scallop of 5 m standing up on a rock, a pearl in its heart. */
function gardenShell(): Paint {
  const p = new Paint(), L = LANDMARKS.garden, y = height(L.x, L.z), yaw = 0.4;
  p.add(lump(1.6, 8, 1, 0.6), '#d9cfc4', 0);
  const r = L.top - 0.8;
  // standing: its hinge down at the rock, its ribs fanning up, its hollow toward +z (turned by yaw)
  for (const s of scallop(r, 13, 0.32)) p.add(s.geo, s.rib % 2 ? '#f3bcd6' : '#fbe6f0', 0.22, new THREE.Matrix4().makeRotationX(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, 0.8, 0)), true);
  p.add(new THREE.IcosahedronGeometry(0.6, 1), NACRE, 0.7, place(0, 1.4, 0.5));
  return new Paint().keep(p.geometry(), place(L.x, y, L.z, yaw));
}

/**
 * The sunken ship: Kenney's "Ship Wreck" (CC0 1.0) as one painted shape - its materials' colours into its vertices,
 * a little greener and darker under the water - lying a little on its side along SHIP (its stern at the cabin, its
 * hull SHIP.len long), sunk into the sand; the door of the captain's cabin our own, where it was (WORLD-08).
 */
function ship(model: THREE.Object3D | null): Paint {
  const p = new Paint();
  const yaw = 0.3, y = height(SHIP.x, SHIP.z);
  if (model) {
    model.updateMatrixWorld(true);
    const own = new Paint(), water = new THREE.Color('#ece6d8');
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      // a mesh of several materials: each group in its material's colour
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: (geo.index ?? geo.getAttribute('position')).count, materialIndex: 0 }];
      const pos = (geo.index ? geo.toNonIndexed() : geo).getAttribute('position');   // the groups count the same corners either way
      for (const gr of groups) {
        const part = new THREE.BufferGeometry();
        part.setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: gr.count * 3 }, (_, i) => pos.getComponent(gr.start + Math.floor(i / 3), i % 3)), 3));
        const mat = mats[gr.materialIndex ?? 0] as THREE.MeshStandardMaterial;
        const c = mat.color.clone().multiply(water);
        own.add(part, c, mat.name === 'window' ? 0.35 : 0);
      }
    });
    const geo = own.geometry(), box = new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position') as THREE.BufferAttribute);
    const size = box.getSize(new THREE.Vector3()), k = SHIP.len / size.z;
    // its length on z, its stern at +z: centred, standing on its keel, the stern turned to -x, then along SHIP
    geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2).scale(k, k, k).rotateY(-Math.PI / 2);
    p.keep(geo, place(SHIP.x, y - 0.5, SHIP.z, yaw, 1, -0.16));
  } else {
    // without its file (TECH-08 does not stop the world for it): the grey build's hull and mast
    p.add(new THREE.BoxGeometry(SHIP.len, 3, 4).translate(0, 1.2, 0), '#9a6a40', 0, place(SHIP.x, y, SHIP.z, yaw, 1, 0, 0.25));
    p.add(new THREE.CylinderGeometry(0.25, 0.35, SHIP.mastH, 7).translate(0, SHIP.mastH / 2, 0), '#7a5232', 0, place(SHIP.x, y, SHIP.z, yaw));
  }
  // the door of the captain's cabin on the hull's side by the stern (its spot, CABIN, where it was: WORLD-08)
  const along = -5, side = 2.25, ax = Math.cos(yaw), az = -Math.sin(yaw), sx = Math.sin(yaw), sz = Math.cos(yaw);
  const doorX = SHIP.x + ax * along + sx * side, doorZ = SHIP.z + az * along + sz * side, cy = height(doorX, doorZ);
  p.add(new THREE.BoxGeometry(1.6, 2.2, 0.25).translate(0, 1.1, -0.05), '#7a5232', 0, place(doorX, cy, doorZ, yaw));
  p.add(new THREE.BoxGeometry(1.2, 1.8, 0.2).translate(0, 0.9, 0.06), '#5a3a22', 0, place(doorX, cy, doorZ, yaw));
  p.add(new THREE.SphereGeometry(0.1, 5, 3).translate(0.4, 0.9, 0.2), '#ffd36b', 0.6, place(doorX, cy, doorZ, yaw));
  return p;
}

/** The arch of the way in on the square, in the castle's mother-of-pearl: twisted posts, its glowing ring. */
function squareArch(): Paint {
  const p = new Paint(), a = SQUARE_ARCH, y = height(a.x, a.z);
  for (const sx of [-a.w / 2, a.w / 2]) column(p, a.x + sx, a.z, a.top - 1.6, 0.45, PEARL, TURQUOISE);
  p.add(new THREE.TorusGeometry(a.w / 2, 0.35, 6, 16, Math.PI), '#bfefff', 0.6, place(a.x, y + a.top - 1.2, a.z));
  return p;
}

/**
 * The landmarks into the scene: each its painted shape, named as the measurements look for it (tools/sea-grey.mjs);
 * the throne's `open`. The colliders of the grey build stay (./scenery.ts), the hall's columns add theirs.
 */
export function buildLandmarks(scene: THREE.Scene, wreck: THREE.Object3D | null) {
  const material = paintMaterial();
  for (const [name, p] of [['castle', castle()], ['landmark-reef', reefFans()], ['landmark-grotto', grotto()], ['landmark-trench', trenchArch()],
    ['landmark-garden', gardenShell()], ['landmark-ship', ship(wreck)], ['landmark-square', squareArch()]] as const) scene.add(p.mesh(name, material));
  return throne(scene);
}
