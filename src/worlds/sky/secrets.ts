import * as THREE from 'three';
import { sfx } from '../../core/audio';
import type { Game } from '../../game/context';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { ISLANDS, NOOKS, NOOK_RAIL, NOOK_WAYS, RAIL, type Place } from './layout';
import { paint, paintMaterial, type Part } from './landmarks';
import { colliders, height, nookAt, nookWayY } from './terrain';

/**
 * The secrets of the Sky Islands (PLAY-07, docs/worlds/world-5.md «Секреты»), as the Sweet Land's
 * (src/worlds/sweet/secrets.ts): optional, not needed by the story, each found once - its flag in the world's part of the
 * save (the names of WorldDef.secrets and of the items of the world description), its stars the first time; coming back
 * gives nothing again. The grey build: simple shapes, no model file, no line of its own (the cat says nothing of a find
 * until the world's lines are recorded; it is glad with her, as the Sweet Land's cat at the fountain).
 *
 * - sky_chest: the chest on the tiny islet behind the dragon island (layout.ts NOOKS.islet, a short cloud deck from the
 *   dragon island leads to it): opened, 5 stars - the world's chest (PLAY-08); every other secret 3.
 * - rainbow_slide: the rainbow slide off the windmill island's edge: she walks onto it and slides down it to the lower
 *   ledge under the island (layout.ts NOOKS.ledge), where a rainbow star lies - the decoration is the find. The ledge's
 *   action takes her back up the rainbow; stepping onto the slide from the ledge she only slides back. The ledge, the
 *   slide and the islet are ground (./terrain.ts) with closed edges: she never falls into the clouds.
 * - cloud_shapes: the little windmill on the island's south edge: its action turns the clouds over the edge into
 *   animals - a bunny, a cat, a bear - for a while, every time; no grading, the stars the first time.
 * - dragon_nest: the drakeys' nest on the dragon island: she stands by it a while and three little dragons fly out and
 *   circle her, then fly back - every time she comes again; the stars the first time.
 *
 * The static shapes (the islet and the ledge with their rocks and rails, the islet's deck, the slide, the chest's body,
 * the little windmill, the nest) are one mesh; the chest's lid, the ledge's star (until it is found), the cloud animals
 * (while they are shown) and the little dragons (one instanced mesh, while they fly) are one each: five draw calls at
 * most, three of them most of the time, none of them casting a shadow (TECH-06).
 */
export const CHEST_FLAG = 'sky_chest', SLIDE_FLAG = 'rainbow_slide', SHAPES_FLAG = 'cloud_shapes', NEST_FLAG = 'dragon_nest';
export const SKY_SECRETS = [CHEST_FLAG, SLIDE_FLAG, SHAPES_FLAG, NEST_FLAG] as const;
export type SkySecret = (typeof SKY_SECRETS)[number];
/** How each is done (WorldItem.how): the chest and the windmill by the action button, the slide and the nest by walking. */
export const SECRET_HOW: Record<SkySecret, 'act' | 'walk'> = { sky_chest: 'act', rainbow_slide: 'walk', cloud_shapes: 'act', dragon_nest: 'walk' };

/** The direction (x, z) of `b` from `a`, of length 1. */
const dirOf = (a: Place, b: Place) => { const d = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / d, z: (b.z - a.z) / d }; };
/** A point `d` m from `p` in the direction `angle` (radians from +x toward +z). */
const toward = (p: Place, angle: number, d: number): Place => ({ x: p.x + Math.cos(angle) * d, z: p.z + Math.sin(angle) * d });

// ---------- the chest on the islet ----------

/** m: the chest - its width, its height, its depth; its front spot this far before it. */
export const CHEST = { w: 0.9, h: 0.5, d: 0.6, front: 1.3 } as const;
/** rad the lid opens to; s it takes. */
export const LID_OPEN = 1.95, LID_S = 0.6;
/** Where the chest stands on the islet (a little past its middle) and where she opens it from: before its front, toward the deck. */
export function chestOf() {
  const islet = NOOKS.islet, back = dirOf(islet, ISLANDS.dragon);
  const at = { x: islet.x - back.x * 0.8, z: islet.z - back.z * 0.8 };
  return { at, front: { x: at.x + back.x * CHEST.front, z: at.z + back.z * CHEST.front }, yaw: Math.atan2(back.x, back.z) };
}

// ---------- the rainbow slide and the lower ledge ----------

/** m: how near the slide's top she has to walk for it to take her; m/s² and m/s of the slide; s the ride back up takes. */
export const SLIDE_R = 1, SLIDE_ACC = 6, SLIDE_V = 7, LIFT_S = 2.4;
/** m: how near the star on the ledge she has to come for it to be found. */
export const STAR_R = 0.8;
/** The colours of the rainbow, its outer band first. */
export const RAINBOW = ['#ff4d6d', '#ff9f43', '#ffe066', '#7bd36a', '#4fc3f7', '#7c6cf0'] as const;
/**
 * The slide along its middle line, as m from the windmill island's middle toward the ledge's: its top on the island
 * inside the rail (`top`), where she lands on the ledge (`land`), where the ride back up sets her down on the island
 * (`back`, out of the top's reach); the points of these, and the star across the ledge from the landing.
 */
export function slideOf() {
  const w = NOOK_WAYS.slide, from = w.from, ledge = w.to, len = Math.hypot(ledge.x - from.x, ledge.z - from.z), u = dirOf(from, ledge);
  const s = { top: from.r - RAIL - 0.6, land: len - (ledge.r - NOOK_RAIL - 0.6), back: from.r - RAIL - 0.6 - SLIDE_R - 1.2 };
  const point = (along: number): Place => ({ x: from.x + u.x * along, z: from.z + u.z * along });
  return {
    len, u, s, w: w.w, ledge, point,
    top: point(s.top), land: point(s.land), back: point(s.back),
    star: { x: ledge.x + u.x * 1.4, z: ledge.z + u.z * 1.4 },
  };
}
/** The along and the across of (x, z) on the slide's middle line (m from the windmill island's middle). */
function slideFrame(x: number, z: number) {
  const { u } = slideOf(), from = NOOK_WAYS.slide.from, dx = x - from.x, dz = z - from.z;
  return { along: dx * u.x + dz * u.z, across: -dx * u.z + dz * u.x };
}

// ---------- the little windmill on the edge, and the cloud animals ----------

/** rad: the little windmill's direction from the windmill island's middle (south, out of Chirika's way and the big mills'). */
export const SMALL_MILL_DIR = 1.3;
/** s the cloud animals are shown (gathering, staying, melting away); m over the island's top and out past its edge they hang. */
export const SHAPES_S = 9, SHAPES_UP = 10, SHAPES_OUT = 16;
/** The little windmill on the edge, the place before it toward the island's middle, where the animals hang and which way they face. */
export function millOf() {
  const i = ISLANDS.mills, at = toward(i, SMALL_MILL_DIR, i.r - RAIL - 0.9), front = toward(i, SMALL_MILL_DIR, i.r - RAIL - 2.5);
  const sky = toward(i, SMALL_MILL_DIR, i.r + SHAPES_OUT);
  return { at, front, sky: { ...sky, y: i.top + SHAPES_UP }, yaw: Math.atan2(i.x - at.x, i.z - at.z) };
}
/** The size of the cloud animals `t` s after the action: they gather in the first 1.5 s, melt away in the last 1.5; null outside. */
export const shapesAt = (t: number): { scale: number; opacity: number } | null => {
  if (t < 0 || t > SHAPES_S) return null;
  const k = THREE.MathUtils.smoothstep(t, 0, 1.5);
  return { scale: 0.3 + 0.7 * k, opacity: Math.min(k, 1 - THREE.MathUtils.smoothstep(t, SHAPES_S - 1.5, SHAPES_S)) * 0.95 };
};

// ---------- the drakeys' nest ----------

/** rad: the nest's direction from the dragon island's middle, and how far out (a part of its radius): south-west, off the decks. */
export const NEST_DIR = 2.05, NEST_OUT = 0.6;
/** s she stands by it before they fly out; s they fly; m: how near the place by the nest she has to stand. */
export const NEST_WAIT = 1.2, NEST_S = 7, NEST_R = 0.9;
/** The nest and the place she stands at: before it, toward the island's middle. */
export function nestOf() {
  const i = ISLANDS.dragon;
  return { at: toward(i, NEST_DIR, i.r * NEST_OUT), stand: toward(i, NEST_DIR, i.r * NEST_OUT - 1.5) };
}
/** The number of the little dragons; m: the radius of their circle round her, and how high over her feet. */
export const DRAKES = 3, CIRCLE_R = 1.8, CIRCLE_Y = 2;
const circleAt = new THREE.Vector3();
/**
 * Where little dragon `k` is `t` s after they flew out, round her at `hero` from the nest at `nest`: out of it in the
 * first second, on the circle, back into it in the last second; its heading along the way.
 */
export function drakeAt(k: number, t: number, nest: THREE.Vector3, hero: THREE.Vector3, out = new THREE.Vector3()): { pos: THREE.Vector3; heading: number } {
  const a = t * 2.2 + (k / DRAKES) * Math.PI * 2, bob = Math.sin(t * 5 + k * 2) * 0.2;
  const on = circleAt.set(hero.x + Math.cos(a) * CIRCLE_R, hero.y + CIRCLE_Y + bob + k * 0.15, hero.z + Math.sin(a) * CIRCLE_R);
  const k0 = THREE.MathUtils.smoothstep(t, 0, 1) * (1 - THREE.MathUtils.smoothstep(t, NEST_S - 1, NEST_S));
  out.lerpVectors(nest, on, k0);
  return { pos: out, heading: Math.atan2(-Math.sin(a), Math.cos(a)) };
}

// ---------- the shapes ----------

/** A box of `w` × `h` × `d` with its foot at y = `y`. */
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const puff = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => new THREE.IcosahedronGeometry(r, 0).scale(sx, sy, sz).translate(x, y, z);

/** The chest's body: sky-blue wood with golden bands, little gold stars under its lid. Origin: its foot's middle, its front to +z. */
export function chestBodyParts(): Part[] {
  return [
    [box(CHEST.w, CHEST.h, CHEST.d), '#7fb2ff'],
    [box(CHEST.w + 0.02, 0.07, CHEST.d + 0.02, 0, CHEST.h * 0.45), '#ffd166'],
    [box(0.1, 0.16, 0.04, 0, CHEST.h - 0.2, CHEST.d / 2), '#ffd166'],
    ...[-0.25, 0, 0.25].map((x, i): Part => [new THREE.OctahedronGeometry(0.1, 0).translate(x, CHEST.h - 0.02, i % 2 ? 0.08 : -0.06), '#ffe066']),
  ];
}
/** The lid: its hinge at the origin (the chest's back top edge), lying forward along +z. */
export function lidGeometry(): THREE.BufferGeometry {
  return paint([
    [box(CHEST.w + 0.04, 0.1, CHEST.d + 0.04, 0, 0, CHEST.d / 2), '#5f98f0'],
    [box(CHEST.w + 0.06, 0.04, 0.08, 0, 0.1, CHEST.d / 2), '#ffd166'],
  ]);
}
/** The little windmill: a white tower, an orange roof, four sails toward the island. Origin: its foot's middle, its sails to +z. */
export function millParts(): Part[] {
  const parts: Part[] = [
    [new THREE.CylinderGeometry(0.4, 0.55, 2.6, 8).translate(0, 1.3, 0), '#fff8ee'],
    [new THREE.ConeGeometry(0.65, 0.8, 8).translate(0, 3, 0), '#ff9a3c'],
  ];
  for (let s = 0; s < 4; s++) parts.push([new THREE.BoxGeometry(0.08, 1.3, 0.35).translate(0, 0.75, 0).rotateZ((s / 4) * Math.PI * 2 + 0.4).translate(0, 2.3, 0.62), '#ff8a2a']);
  return parts;
}
/** The drakeys' nest: a ring of twigs on a bed of hay, three pastel eggs in it. Origin: its foot's middle. */
export function nestParts(): Part[] {
  return [
    [new THREE.CylinderGeometry(0.75, 0.6, 0.18, 10).translate(0, 0.09, 0), '#d9b26a'],
    [new THREE.TorusGeometry(0.72, 0.17, 5, 12).rotateX(Math.PI / 2).translate(0, 0.25, 0), '#8a6a4a'],
    [new THREE.SphereGeometry(0.16, 8, 6).scale(1, 1.3, 1).translate(-0.2, 0.3, 0.05), '#c8f0b0'],
    [new THREE.SphereGeometry(0.16, 8, 6).scale(1, 1.3, 1).translate(0.18, 0.3, -0.12), '#ffe6a0'],
    [new THREE.SphereGeometry(0.16, 8, 6).scale(1, 1.3, 1).translate(0.08, 0.3, 0.22), '#ffd0e0'],
  ];
}
/** The star on the ledge: a rainbow-tinted star of glass on a little white cloud. Origin: its foot. */
export function starGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [[puff(0.3, 0, 0.15, 0, 1.4, 0.6, 1.2), '#ffffff']];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push([new THREE.ConeGeometry(0.12, 0.36, 4).translate(0, 0.18, 0).rotateZ(-a).translate(0, 0.9, 0), RAINBOW[k]]);
  }
  parts.push([new THREE.SphereGeometry(0.14, 8, 6).scale(1, 1, 0.6).translate(0, 0.9, 0), '#fffaf0']);
  return paint(parts);
}
/** The cloud animals: a bunny, a cat and a bear of white puffs, side by side along x, facing +z. Origin: their middle. */
export function shapesGeometry(): THREE.BufferGeometry {
  const W = '#ffffff', S = '#f2f6ff', P = '#ffe0ee';
  const parts: Part[] = [
    // the bunny: a round body, a head, two long ears
    [puff(1.3, -6, 0, 0), W], [puff(0.9, -6, 1.7, 0.3), S], [puff(0.35, -6.4, 3.1, 0.2, 0.8, 2.4, 0.8), P], [puff(0.35, -5.6, 3.1, 0.2, 0.8, 2.4, 0.8), P], [puff(0.45, -7.2, -0.6, -0.4), S],
    // the cat: a long body, a head with pointed ears, a curled tail
    [puff(1.2, 0, 0, 0, 1.4, 0.9, 1), W], [puff(0.85, 1.4, 1.1, 0.2), S],
    [new THREE.ConeGeometry(0.35, 0.8, 4).translate(1.05, 2.05, 0.2), P], [new THREE.ConeGeometry(0.35, 0.8, 4).translate(1.75, 2.05, 0.2), P],
    [puff(0.35, -1.9, 0.6, 0, 1.6, 0.8, 0.8), S], [puff(0.35, -2.4, 1.4, 0, 0.8, 1.6, 0.8), S],
    // the bear: a big body, a head, round ears
    [puff(1.5, 6, 0, 0), W], [puff(1, 6, 2, 0.2), S], [puff(0.4, 5.2, 2.9, 0.1), P], [puff(0.4, 6.8, 2.9, 0.1), P],
  ];
  return paint(parts);
}
/** A little dragon: a green body, a golden belly, two wings, a tail. Origin: its middle, its head to +z. */
export function drakeGeometry(): THREE.BufferGeometry {
  return paint([
    [new THREE.SphereGeometry(0.22, 8, 6).scale(1, 0.9, 1.5), '#7fcf6a'],
    [new THREE.SphereGeometry(0.16, 8, 6).translate(0, 0.12, 0.34), '#8fdc78'],
    [new THREE.SphereGeometry(0.15, 6, 4).scale(1, 0.7, 1.2).translate(0, -0.08, 0.05), '#ffd166'],
    [box(0.5, 0.03, 0.26, 0.32, 0.05, 0).rotateZ(0.35), '#ffd166'],
    [box(0.5, 0.03, 0.26, -0.32, 0.05, 0).rotateZ(-0.35), '#ffd166'],
    [new THREE.ConeGeometry(0.07, 0.45, 5).rotateX(-Math.PI / 2).translate(0, 0, -0.45), '#7fcf6a'],
  ]);
}

/** The ground of a nook: an upside-down rock under a grassy disc whose top is the nook's top, and a ring of cloud puffs on its edge. */
function nookParts(n: { x: number; z: number; r: number; top: number }, grass: string, gapAt: Place): Part[] {
  const deep = n.r * 1.3, parts: Part[] = [
    [new THREE.ConeGeometry(n.r * 0.98, deep, 10, 1).rotateX(Math.PI).translate(n.x, n.top - 0.3 - deep / 2, n.z), '#b9aecb'],
    [new THREE.CylinderGeometry(n.r, n.r * 0.96, 0.4, 18).translate(n.x, n.top - 0.2, n.z), grass],
  ];
  const k = Math.round((2 * Math.PI * n.r) / 1.2);
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2, x = n.x + Math.cos(a) * (n.r - 0.25), z = n.z + Math.sin(a) * (n.r - 0.25);
    if (Math.hypot(x - gapAt.x, z - gapAt.z) < 2) continue;
    parts.push([puff(0.5, x, n.top + 0.3, z, 1.3, 0.8, 1), '#ffffff']);
  }
  return parts;
}
/** The static shapes of the secrets in one geometry, in the world: the nooks, the islet's deck, the slide, the chest's body, the windmill, the nest. */
export function propsGeometry(): THREE.BufferGeometry {
  const at = (parts: Part[], p: Place, yaw = 0, y = height(p.x, p.z)): Part[] => parts.map(([g, c]) => [g.rotateY(yaw).translate(p.x, y, p.z), c]);
  const parts: Part[] = [];
  // the islet and its deck from the dragon island: cloud slabs at the height of the ground under them, rails along both sides
  const iw = NOOK_WAYS.islet, iu = dirOf(iw.from, iw.to), ilen = Math.hypot(iw.to.x - iw.from.x, iw.to.z - iw.from.z);
  parts.push(...nookParts(NOOKS.islet, '#e6efc8', { x: iw.to.x - iu.x * iw.to.r, z: iw.to.z - iu.z * iw.to.r }));
  const yaw = Math.atan2(iu.x, iu.z), d0 = iw.from.r - 0.5, d1 = ilen - iw.to.r + 0.5, n = 5;
  for (let k = 0; k < n; k++) {
    const t0 = d0 + ((d1 - d0) * k) / n, t1 = d0 + ((d1 - d0) * (k + 1)) / n, tm = (t0 + t1) / 2, x = iw.from.x + iu.x * tm, z = iw.from.z + iu.z * tm;
    parts.push([new THREE.BoxGeometry(iw.w, 0.5, t1 - t0 + 0.05).rotateY(yaw).translate(x, nookWayY(iw, tm) - 0.25, z), k % 2 ? '#f4f8ff' : '#ffffff']);
  }
  for (let t = iw.from.r + 0.6; t <= ilen - iw.to.r - 0.4; t += 1.4) for (const side of [-1, 1]) {
    const w = side * (iw.w / 2 + 0.2), x = iw.from.x + iu.x * t - iu.z * w, z = iw.from.z + iu.z * t + iu.x * w;
    parts.push([puff(0.45, x, nookWayY(iw, t) + 0.3, z, 1.3, 0.8, 1), '#ffffff']);
  }
  // the ledge and the rainbow slide down to it: six bands across, in short pieces along the slide's height
  const sl = slideOf(), sw = NOOK_WAYS.slide;
  parts.push(...nookParts(sl.ledge, '#ffe2b8', sl.point(sl.len - sl.ledge.r)));
  const slideYaw = Math.atan2(sl.u.x, sl.u.z), from = sl.s.top - 0.4, to = sl.len - sl.ledge.r + 0.4, pieces = 12, band = sl.w / RAINBOW.length;
  for (let k = 0; k < pieces; k++) {
    const t0 = from + ((to - from) * k) / pieces, t1 = from + ((to - from) * (k + 1)) / pieces, y0 = nookWayY(sw, t0), y1 = nookWayY(sw, t1);
    const pitch = Math.atan2(y0 - y1, t1 - t0), long = Math.hypot(t1 - t0, y1 - y0) + 0.04, mid = sl.point((t0 + t1) / 2);
    RAINBOW.forEach((c, b) => {
      const across = -sl.w / 2 + band * (b + 0.5);
      parts.push([new THREE.BoxGeometry(band, 0.14, long).rotateX(pitch).translate(across, -0.07, 0).rotateY(slideYaw).translate(mid.x, (y0 + y1) / 2, mid.z), c]);
    });
  }
  // a rainbow arch over the slide's top: she sees where it starts
  RAINBOW.forEach((c, b) => parts.push([new THREE.TorusGeometry(1.25 + b * 0.12, 0.06, 4, 16, Math.PI).rotateY(slideYaw).translate(sl.top.x, height(sl.top.x, sl.top.z), sl.top.z), c]));
  // the chest, the little windmill, the nest
  const ch = chestOf(), ml = millOf(), ns = nestOf();
  parts.push(...at(chestBodyParts(), ch.at, ch.yaw), ...at(millParts(), ml.at, ml.yaw), ...at(nestParts(), ns.at));
  return paint(parts);
}

// ---------- the Sky Islands' secrets in the scene ----------

export interface SkySecrets {
  readonly spots: readonly Spot[];
  /** Where each is found: the items of the world description (./index.ts). */
  readonly at: Readonly<Record<SkySecret, Place>>;
  /** The secrets not found yet, where they are (the glow potion twinkles them). */
  glimmer(): THREE.Vector3[];
  /** The walkthrough's right move by a secret she is at: '' - none here. */
  cheat(): string;
  /** Whether a secret is going on (the slide or the ride back up, the cloud animals shown, the little dragons flying). */
  active(id: SkySecret): boolean;
  update(dt: number, time: number, canMove: boolean): void;
  /** What the pictures and the measurements read. */
  readonly debug: {
    chest: ReturnType<typeof chestOf>; slide: ReturnType<typeof slideOf>; mill: ReturnType<typeof millOf>; nest: ReturnType<typeof nestOf>;
    riding: () => 'down' | 'up' | null; shapes: () => number | null; drakes: () => THREE.Vector3[] | null;
  };
}

export function createSkySecrets(g: Pick<Game, 'scene' | 'ws' | 'hero' | 'cat' | 'sparks' | 'addStars' | 'above' | 'persist'>, scope: WorldScope): SkySecrets {
  const { scene, ws, hero } = g;
  const found = (flag: SkySecret) => ws.flags[flag] === true;
  // the stars of the chest and of every other secret, as the other worlds'; literal numbers, so that
  // src/game/no-penalties.test.ts reads them as positive (LEARN-14)
  const give = (flag: SkySecret, chest: boolean, at: THREE.Vector3) => {
    ws.flags[flag] = true;
    g.addStars(chest ? 5 : 3, g.above(at, 1.2));
    g.persist();
    g.cat.once('Yes', 'Idle');
  };
  const hp = hero.root.position;
  const here = (p: Place, r: number) => Math.hypot(hp.x - p.x, hp.z - p.z) < r;
  const v3 = (p: Place, y = height(p.x, p.z)) => new THREE.Vector3(p.x, y, p.z);
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => { owned.push(x); return x; };
  const meshes: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T) => { meshes.push(o); scene.add(o); return o; };
  scope.own(() => { for (const m of meshes) m.removeFromParent(); for (const x of owned) x.dispose(); });

  // ---------- the props: one mesh, no shadow; the chest, the windmill and the nest stop her ----------
  const props = add(new THREE.Mesh(own(propsGeometry()), paintMaterial()));
  props.name = 'secret-props'; props.castShadow = false; props.receiveShadow = true;
  const ch = chestOf(), sl = slideOf(), ml = millOf(), ns = nestOf();
  colliders.push({ x: ch.at.x, z: ch.at.z, r: 0.5 }, { x: ml.at.x, z: ml.at.z, r: 0.6 }, { x: ns.at.x, z: ns.at.z, r: 0.8 });

  // ---------- the chest on the islet ----------
  const lid = new THREE.Mesh(own(lidGeometry()), paintMaterial());
  lid.name = 'secret-lid'; lid.castShadow = false;
  const hinge = add(new THREE.Group());
  hinge.name = 'secret-chest';
  hinge.position.set(ch.at.x - Math.sin(ch.yaw) * CHEST.d / 2, height(ch.at.x, ch.at.z) + CHEST.h, ch.at.z - Math.cos(ch.yaw) * CHEST.d / 2);
  hinge.rotation.y = ch.yaw;
  hinge.add(lid);
  let lidT = found(CHEST_FLAG) ? LID_S : -1;
  const chestFront = v3(ch.front), chestAt = v3(ch.at);
  function openChest() {
    if (found(CHEST_FLAG)) return;
    lidT = 0;
    sfx('good');
    g.sparks.burst(chestAt.clone().setY(chestAt.y + CHEST.h + 0.2), '#ffd166', 30, 2.5);
    give(CHEST_FLAG, true, chestAt);
  }

  // ---------- the rainbow slide and the ledge ----------
  const star = add(new THREE.Mesh(own(starGeometry()), own(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.3, emissive: '#fff0c0', emissiveIntensity: 0.35 }))));
  star.name = 'secret-star'; star.castShadow = false;
  star.position.copy(v3(sl.star));
  star.visible = !found(SLIDE_FLAG);
  /** The ride on the slide: down it from where she stepped on, or back up it from the ledge; null - none. */
  let ride: { up: boolean; s: number; v: number; t: number } | null = null;
  const lastSet = new THREE.Vector3();
  const slideTop = v3(sl.top), ledgeMid = v3(NOOKS.ledge);
  const onLedge = () => nookAt(hp.x, hp.z) === 'ledge' && hp.y < NOOKS.ledge.top + 1;
  /** Whether she is on the slide past the island's edge, before the ledge's: there she cannot stand, it takes her down. */
  const onSlide = () => {
    const f = slideFrame(hp.x, hp.z);
    return Math.abs(f.across) <= sl.w / 2 && f.along > ISLANDS.mills.r && f.along < sl.len - sl.ledge.r;
  };
  const setOnSlide = (s: number) => { const p = sl.point(s); hp.set(p.x, height(p.x, p.z), p.z); lastSet.copy(hp); };
  function rideUp() {
    if (ride) return;
    ride = { up: true, s: sl.s.land, v: 0, t: 0 };
    setOnSlide(sl.s.land);
    sfx('soft');
    g.sparks.burst(ledgeMid.clone().setY(ledgeMid.y + 1), '#ffe066', 16, 2);
  }

  // ---------- the little windmill and the cloud animals ----------
  const shapes = add(new THREE.Mesh(own(shapesGeometry()), own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0, depthWrite: false }))));
  shapes.name = 'secret-clouds'; shapes.castShadow = false; shapes.visible = false;
  shapes.position.set(ml.sky.x, ml.sky.y, ml.sky.z);
  shapes.rotation.y = ml.yaw;
  let shown = -1;
  const millFront = v3(ml.front);
  function cloudsUp() {
    shown = 0;
    sfx('chime');
    g.sparks.burst(v3(ml.at, height(ml.at.x, ml.at.z) + 2.4), '#ffffff', 18, 2);
    if (!found(SHAPES_FLAG)) give(SHAPES_FLAG, false, v3(ml.at, height(ml.at.x, ml.at.z) + 2));
  }

  // ---------- the drakeys' nest ----------
  const drakes = add(own(new THREE.InstancedMesh(own(drakeGeometry()), paintMaterial(), DRAKES)));
  drakes.name = 'secret-drakes'; drakes.castShadow = false; drakes.visible = false;
  drakes.frustumCulled = false;     // they fly round her: the bounds of where they were made mean nothing
  let standing = 0, flying = -1, flewHere = false;
  const nestStand = v3(ns.stand), nestAt = v3(ns.at, height(ns.at.x, ns.at.z) + 0.3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), at3 = new THREE.Vector3();
  const drakePositions: THREE.Vector3[] = Array.from({ length: DRAKES }, () => new THREE.Vector3());

  const spots: Spot[] = [
    { pos: chestFront, r: 2, label: 'open', on: () => !found(CHEST_FLAG), run: openChest },
    { pos: millFront, r: 2.2, label: 'sky_secret_mill', on: () => shown < 0, run: cloudsUp },
    { pos: ledgeMid, r: NOOKS.ledge.r + 0.6, label: 'sky_secret_up', on: () => ride === null && onLedge(), run: rideUp },
  ];

  return {
    spots,
    at: { sky_chest: { ...ch.front }, rainbow_slide: { ...sl.top }, cloud_shapes: { ...ml.front }, dragon_nest: { ...ns.stand } },
    glimmer: () => [
      ...(found(CHEST_FLAG) ? [] : [chestFront]),
      ...(found(SLIDE_FLAG) ? [] : [slideTop]),
      ...(found(SHAPES_FLAG) ? [] : [millFront]),
      ...(found(NEST_FLAG) ? [] : [nestStand]),
    ],
    cheat() {
      // on the ledge: to the star
      if (!found(SLIDE_FLAG) && ride === null && onLedge()) { hp.set(sl.star.x, NOOKS.ledge.top, sl.star.z); return 'slide'; }
      // by the nest: she only has to stand there
      if (!found(NEST_FLAG) && here(ns.stand, NEST_R + 0.5)) { if (!here(ns.stand, NEST_R)) hp.set(ns.stand.x, hp.y, ns.stand.z); return 'nest'; }
      return '';
    },
    active: (id) => (id === SLIDE_FLAG ? ride !== null : id === SHAPES_FLAG ? shown >= 0 : id === NEST_FLAG ? flying >= 0 : false),
    update(dt, time, canMove) {
      // ----- the chest: its lid opens once, and stays open
      if (lidT >= 0) { lidT = Math.min(LID_S, lidT + dt); lid.rotation.x = -LID_OPEN * THREE.MathUtils.smootherstep(lidT / LID_S, 0, 1); }

      // ----- the slide: a ride down it or back up it holds her on its middle line; taken away meanwhile, it lets her go
      if (ride && hp.distanceTo(lastSet) > 1.5) ride = null;
      if (ride) {
        if (!ride.up) {
          ride.v = Math.min(SLIDE_V, ride.v + SLIDE_ACC * dt);
          ride.s = Math.min(sl.s.land, ride.s + ride.v * dt);
          setOnSlide(ride.s);
          if (ride.s >= sl.s.land) { ride = null; sfx('soft'); g.sparks.burst(ledgeMid.clone().setY(ledgeMid.y + 0.5), '#ffffff', 14, 1.6); }
        } else {
          ride.t += dt;
          setOnSlide(sl.s.land + (sl.s.back - sl.s.land) * THREE.MathUtils.smootherstep(ride.t / LIFT_S, 0, 1));
          if (ride.t >= LIFT_S) ride = null;
        }
      } else if (canMove && ((here(sl.top, SLIDE_R) && hp.y > NOOKS.ledge.top + 1) || onSlide())) {
        // walked onto it from the island's edge (or stepped onto it from the ledge): down it goes
        ride = { up: false, s: THREE.MathUtils.clamp(slideFrame(hp.x, hp.z).along, sl.s.top, sl.s.land), v: 0.5, t: 0 };
        setOnSlide(ride.s);
        sfx('jump');
      }
      if (star.visible) {
        star.rotation.y = time * 1.2;
        if (canMove && ride === null && onLedge() && here(sl.star, STAR_R)) {
          star.visible = false;
          sfx('chime');
          g.sparks.burst(star.position.clone().setY(star.position.y + 1), '#ffe066', 30, 3);
          for (const c of RAINBOW) g.sparks.burst(star.position.clone().setY(star.position.y + 1.2), c, 6, 2);
          give(SLIDE_FLAG, false, star.position);
        }
      }

      // ----- the cloud animals: they gather over the edge, stay a while, melt away
      if (shown >= 0) {
        shown += dt;
        const s = shapesAt(shown);
        shapes.visible = s !== null;
        if (s) {
          shapes.scale.setScalar(s.scale);
          (shapes.material as THREE.MeshStandardMaterial).opacity = s.opacity;
          shapes.position.y = ml.sky.y + Math.sin(time * 0.8) * 0.3;
        } else shown = -1;
      }

      // ----- the nest: standing by it a while, the little dragons fly out and circle her. Again once she has left
      if (flying < 0) {
        if (!here(ns.stand, NEST_R + 1.5)) flewHere = false;
        standing = canMove && !flewHere && here(ns.stand, NEST_R) ? standing + dt : 0;
        if (standing >= NEST_WAIT) {
          flying = 0; standing = 0; flewHere = true;
          sfx('pop');
          g.sparks.burst(nestAt, '#c8f0b0', 16, 2);
          if (!found(NEST_FLAG)) give(NEST_FLAG, false, nestAt);
        }
      }
      if (flying >= 0) {
        flying += dt;
        if (flying > NEST_S) { flying = -1; drakes.visible = false; }
        else {
          drakes.visible = true;
          for (let k = 0; k < DRAKES; k++) {
            const { pos, heading } = drakeAt(k, flying, nestAt, hp, at3);
            drakePositions[k].copy(pos);
            drakes.setMatrixAt(k, m4.compose(pos, q.setFromAxisAngle(up, heading), one));
          }
          drakes.instanceMatrix.needsUpdate = true;
        }
      }
    },
    debug: {
      chest: ch, slide: sl, mill: ml, nest: ns,
      riding: () => (ride ? (ride.up ? 'up' : 'down') : null),
      shapes: () => (shapes.visible ? shapes.scale.x : null),
      drakes: () => (drakes.visible ? drakePositions.map((p) => p.clone()) : null),
    },
  };
}
