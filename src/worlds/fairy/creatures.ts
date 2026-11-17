import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { uTime, propMaterial } from '../../core/materials';
import { fbm, mulberry32 } from '../../core/util';
import type { Game } from '../../game/context';
import { PATCH, POND } from './layout';
import { WATER_Y, height, pathDist } from './terrain';

/**
 * The creatures of the first world that belong to no task (PLAY-11, PLAY-12): fairies gather flowers, birds fly
 * between the trees, fish splash in the pond. Each kind has two actions of its own, and a tap on one starts its own
 * reaction (a sound, a move, sparkles). Nothing is recorded and nothing is given: the creatures never see the save.
 *
 * The behaviour (`createHerd`) is plain data stepped in time, so the unit test runs it without a screen; the world's
 * part (`createCreatures`) draws every kind as one InstancedMesh and turns the herd's events into sparkles and sounds.
 */

export type Kind = 'fairy' | 'bird' | 'fish';
/** The two actions of each kind, in the order they take turns. */
export const ACTIONS = { fairy: ['fly', 'gather'], bird: ['perch', 'fly'], fish: ['swim', 'leap'] } as const;
/** What a tap starts: each kind its own. */
export const REACTION = { fairy: 'spin', bird: 'flutter', fish: 'splash' } as const;
/** The action a creature is held in (`Herd.hold`): the one it keeps still in. */
export const CALM = { fairy: 'gather', bird: 'perch', fish: 'swim' } as const;
/**
 * m above a creature's position where the middle of its drawn model is - what a child taps (the fairy hovers over her
 * point, the bird stands on its feet, the fish is centred): the middle of the model's box, times the size it is drawn at.
 */
export function bodyHeight(geo: THREE.BufferGeometry, scale = 1): number {
  if (!geo.boundingBox) geo.computeBoundingBox();
  return ((geo.boundingBox!.min.y + geo.boundingBox!.max.y) / 2) * scale;
}
export type State = (typeof ACTIONS)[Kind][number] | (typeof REACTION)[Kind];

/** One creature; window.__game.creatures lists these very objects (with ?debug), so they are changed in place. */
export interface Creature {
  readonly kind: Kind;
  /** The model of its kind (fish: 0 - clownfish, 1 - river fish). */
  readonly look: number;
  state: State;
  /** Where it is now; its heading (radians, 0 = +z) and tilt for the picture. */
  readonly pos: THREE.Vector3;
  heading: number; pitch: number; roll: number;
  /** Seconds in the current state, and how long the state lasts. */
  t: number; dur: number;
  /** Taps answered: the walkthrough counts them. */
  taps: number;
  /** Where a move starts and ends; `spot` - the flower or tree it is at (index into the habitat's list). */
  readonly from: THREE.Vector3; readonly to: THREE.Vector3; spot: number;
  /** The fish's circle in the pond: its angle and radius. */
  a: number; r: number;
  /** The state a reaction returns to. */
  back: State;
  /** Debug: the point it is held at, calm, until a tap (`Herd.hold`); null - it lives its own life. */
  held: THREE.Vector3 | null;
}

/** Where the creatures live: flower spots (on the ground), perches (tree tops), the pond. */
export interface Habitat {
  ground(x: number, z: number): number;
  flowers: readonly THREE.Vector3[];
  perches: readonly THREE.Vector3[];
  pond: { x: number; z: number; r: number; water: number };
}

/** What happened in a step, for the sparkles and the sounds: the creature and the event. */
export type HerdEvent = 'pollen' | 'splash' | 'react';

export interface Herd {
  readonly all: Creature[];
  update(dt: number, onEvent?: (c: Creature, e: HerdEvent) => void): void;
  /** The creature a tap at `dist` hits (screen pixels from it within `reach`), its reaction started; null - none. */
  tap(dist: (c: Creature) => number, reach: number): Creature | null;
  /**
   * Debug (the walkthrough): holds `c` at `at` in its calm action - it does not move, and its state never ends - until
   * a tap; its reaction is the usual one and starts from there, and it comes back to the point. null lets it go.
   */
  hold(c: Creature, at: THREE.Vector3 | null): void;
}

/** m over the flower a fairy gathers at; how deep a fish swims under the surface (its back breaks it). */
export const HOVER = 0.85, SWIM = 0.16;
/** How many of each kind: fairies, birds, fish (half clownfish, half river fish). */
export const COUNTS = { fairy: 4, bird: 4, fish: 6 };

export function createHerd(h: Habitat, counts = COUNTS, seed = 77): Herd {
  const rnd = mulberry32(seed);
  const range = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const all: Creature[] = [];
  const make = (kind: Kind, look: number, state: State, spot: number): Creature => ({
    kind, look, state, pos: new THREE.Vector3(), heading: rnd() * 6.28, pitch: 0, roll: 0, t: 0, dur: range(1, 3), taps: 0,
    from: new THREE.Vector3(), to: new THREE.Vector3(), spot, a: rnd() * 6.28, r: 0, back: state, held: null,
  });
  for (let i = 0; i < counts.fairy && h.flowers.length; i++) {
    const c = make('fairy', 0, 'gather', (i * 3) % h.flowers.length);
    c.pos.copy(h.flowers[c.spot]).setY(h.flowers[c.spot].y + HOVER);
    all.push(c);
  }
  for (let i = 0; i < counts.bird && h.perches.length > 1; i++) {
    const c = make('bird', 0, 'perch', (i * 2) % h.perches.length);
    c.pos.copy(h.perches[c.spot]);
    all.push(c);
  }
  for (let i = 0; i < counts.fish; i++) {
    const c = make('fish', i % 2, 'swim', 0);
    c.r = h.pond.r * range(0.25, 0.55); c.dur = range(2, 5);
    fishAt(c);
    all.push(c);
  }

  /** The fish on its circle: under the surface, facing along the circle (it swims counter-clockwise). */
  function fishAt(c: Creature) {
    c.pos.set(h.pond.x + Math.cos(c.a) * c.r, h.pond.water - SWIM, h.pond.z + Math.sin(c.a) * c.r);
    c.heading = Math.atan2(-Math.sin(c.a), Math.cos(c.a));
  }
  /** Starts a flight from where it is to `to`. */
  function flyTo(c: Creature, to: THREE.Vector3, speed: number) {
    c.from.copy(c.pos); c.to.copy(to);
    c.dur = Math.max(1.2, c.from.distanceTo(c.to) / speed); c.t = 0;
    c.heading = Math.atan2(to.x - c.pos.x, to.z - c.pos.z);
  }
  function next(c: Creature, ev: (c: Creature, e: HerdEvent) => void) {
    c.t = 0; c.pitch = 0; c.roll = 0;
    if (c.kind === 'fairy') {
      if (c.state === 'gather') {
        let k = Math.floor(rnd() * h.flowers.length);
        if (k === c.spot) k = (k + 1) % h.flowers.length;
        c.spot = k; c.state = 'fly';
        flyTo(c, new THREE.Vector3().copy(h.flowers[k]).setY(h.flowers[k].y + HOVER), 1.6);
      } else { c.state = 'gather'; c.dur = range(2.5, 4.5); ev(c, 'pollen'); }
    } else if (c.kind === 'bird') {
      if (c.state === 'perch') {
        let k = Math.floor(rnd() * h.perches.length);
        if (k === c.spot) k = (k + 1) % h.perches.length;
        c.spot = k; c.state = 'fly';
        flyTo(c, h.perches[k], 4.5);
      } else { c.state = 'perch'; c.dur = range(3, 6); c.pos.copy(h.perches[c.spot]); }
    } else if (c.state === 'swim') {
      c.state = 'leap'; c.dur = 1.4; c.from.copy(c.pos); ev(c, 'splash');
    } else { c.state = 'swim'; c.dur = range(3, 6); fishAt(c); ev(c, 'splash'); }
  }
  /** A reaction ends where it began: the creature goes on with what it was doing. */
  function endReaction(c: Creature) {
    c.state = c.back; c.t = 0; c.pitch = 0; c.roll = 0; c.pos.copy(c.from);
    if (c.kind === 'fish') { c.state = 'swim'; c.dur = range(3, 6); fishAt(c); }
    else if (c.state === 'fly') { c.dur = 0; }                  // the flight starts anew from here at the next step
    else c.dur = range(1.5, 3);
  }

  return {
    all,
    update(dt, onEvent = () => {}) {
      for (const c of all) {
        c.t += dt;
        if (c.held && c.state !== REACTION[c.kind]) { c.pos.copy(c.held); c.t = 0; continue; }
        const k = Math.min(1, c.t / Math.max(c.dur, 1e-3));
        switch (c.state) {
          case 'gather': {                                       // hovers over the flower, dipping to it
            const f = h.flowers[c.spot];
            c.pos.set(f.x + Math.sin(c.t * 1.7) * 0.18, f.y + HOVER + Math.sin(c.t * 3.1) * 0.12 - 0.1, f.z + Math.cos(c.t * 1.3) * 0.18);
            c.heading += dt * 0.8; c.pitch = 0.35;
            break;
          }
          case 'fly':
            if (c.dur === 0) { const back = c.kind === 'fairy' ? h.flowers[c.spot] : h.perches[c.spot]; flyTo(c, c.kind === 'fairy' ? new THREE.Vector3().copy(back).setY(back.y + HOVER) : back, c.kind === 'fairy' ? 1.6 : 4.5); break; }
            c.pos.lerpVectors(c.from, c.to, k * k * (3 - 2 * k));
            // A fairy wavers, a bird flies up in an arc.
            if (c.kind === 'fairy') c.pos.y += Math.sin(k * Math.PI) * 0.6 + Math.sin(c.t * 6) * 0.05;
            else { c.pos.y += Math.sin(k * Math.PI) * Math.min(4, 1 + c.from.distanceTo(c.to) * 0.2); c.pitch = -0.4 * Math.cos(k * Math.PI); }
            break;
          case 'perch':                                         // pecks now and then, turns about
            c.pitch = Math.max(0, Math.sin(c.t * 7)) ** 6 * 0.9;
            if (Math.sin(c.t * 0.9 + c.a) > 0.995) c.heading += 0.8;
            break;
          case 'swim':                                          // round the pond, rocking
            c.a += (dt * 1.2) / c.r; fishAt(c);
            c.roll = Math.sin(c.t * 4 + c.a) * 0.12;
            break;
          case 'leap': {                                        // out of the water in an arc and back in
            const fwd = 1.6 * k;
            c.pos.set(c.from.x + Math.sin(c.heading) * fwd, h.pond.water - SWIM + Math.sin(k * Math.PI) * 1.1, c.from.z + Math.cos(c.heading) * fwd);
            c.pitch = -1.1 * Math.cos(k * Math.PI);
            if (k >= 1) { c.a = Math.atan2(c.pos.z - h.pond.z, c.pos.x - h.pond.x); c.r = Math.min(h.pond.r * 0.55, Math.max(h.pond.r * 0.2, Math.hypot(c.pos.x - h.pond.x, c.pos.z - h.pond.z))); }
            break;
          }
          case 'spin':                                          // a fairy whirls up and back down
            c.pos.copy(c.from); c.pos.y += Math.sin(k * Math.PI) * 0.9;
            c.heading += dt * 14; c.roll = Math.sin(k * Math.PI) * 0.5;
            if (k >= 1) endReaction(c);
            continue;
          case 'flutter':                                       // a bird flaps up off its perch and settles back
            c.pos.copy(c.from); c.pos.y += Math.sin(k * Math.PI) * 1.2;
            c.pitch = -0.5 * Math.sin(k * Math.PI); c.heading += dt * 3;
            if (k >= 1) endReaction(c);
            continue;
          case 'splash': {                                      // a fish jumps high with a flip
            c.pos.copy(c.from); c.pos.y = h.pond.water - SWIM + Math.sin(k * Math.PI) * 1.8;
            c.pitch = -k * Math.PI * 2;
            if (k >= 1) { endReaction(c); onEvent(c, 'splash'); }
            continue;
          }
        }
        if (c.t >= c.dur) next(c, onEvent);
      }
    },
    tap(dist, reach) {
      let best: Creature | null = null, bd = reach;
      for (const c of all) { const d = dist(c); if (d < bd) { bd = d; best = c; } }
      if (!best) return null;
      const c = best;
      if (c.state !== REACTION[c.kind]) {
        c.back = c.state; c.from.copy(c.pos); c.t = 0;
        c.state = REACTION[c.kind]; c.dur = c.kind === 'fairy' ? 1.3 : c.kind === 'bird' ? 1.2 : 1.6;
      }
      c.taps++;
      return c;
    },
    hold(c, at) {
      if (!at) { c.held = null; return; }
      c.held = at.clone(); c.state = c.back = CALM[c.kind]; c.t = 0; c.dur = 1;
      c.pos.copy(at); c.from.copy(at); c.pitch = 0; c.roll = 0;
    },
  };
}

/**
 * Flower spots for the fairies: open meadow in the flower drifts (the same noise ./scenery.ts sows its drifts by),
 * off the path, the pond and the task's flower bed - the fairies must not mix with the butterflies to be counted.
 */
export function flowerSpots(n = 10, seed = 3): THREE.Vector3[] {
  const rnd = mulberry32(seed), out: THREE.Vector3[] = [];
  for (let t = 0; out.length < n && t < 4000; t++) {
    const a = rnd() * Math.PI * 2, r = 9 + rnd() * 26;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 6;
    if (fbm(x * 0.09 + 5, z * 0.09 + 77, 2) <= 0.56) continue;
    if (pathDist(x, z) < 2.5 || Math.hypot(x - POND.x, z - POND.z) < POND.r + 2 || Math.hypot(x - PATCH.x, z - PATCH.z) < 8) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) continue;
    // The first one near the meadow she starts in, the rest close to it: the fairies flit about one drift.
    if (Math.hypot(x - (out[0]?.x ?? 0), z - (out[0]?.z ?? 4)) > (out.length ? 12 : 14)) continue;
    out.push(new THREE.Vector3(x, height(x, z), z));
  }
  return out;
}

/**
 * Perches for the birds: the tops of the near trees already in the scene (./scenery.ts puts them there as
 * instanced meshes that cast shadows; a tree is the one such thing taller than 4 m). Up to `n` closest to `around`.
 */
export function treeTops(scene: THREE.Object3D, around: { x: number; z: number }, n = 7): THREE.Vector3[] {
  const tops = new Map<string, THREE.Vector3>();
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  scene.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (!im.isInstancedMesh || !im.castShadow) return;
    if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
    const top = im.geometry.boundingBox!.max.y;
    if (top < 4) return;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m); m.decompose(p, q, s);
      const key = `${p.x.toFixed(1)},${p.z.toFixed(1)}`, y = p.y + top * s.y;
      const was = tops.get(key);
      if (!was || was.y < y) tops.set(key, new THREE.Vector3(p.x, y, p.z));
    }
  });
  return [...tops.values()]
    .filter((t) => Math.hypot(t.x - around.x, t.z - around.z) > 6)
    .sort((a, b) => Math.hypot(a.x - around.x, a.z - around.z) - Math.hypot(b.x - around.x, b.z - around.z))
    .slice(0, n)
    // The bird sits on the crown, just under its highest leaf.
    .map((t) => t.setY(t.y - 0.1));
}

/** The models the creatures are drawn with (./load.ts loads them with the world). */
export interface CreatureModels { bird: THREE.BufferGeometry; fish: [THREE.BufferGeometry, THREE.BufferGeometry]; }

/** The world's part of the creatures: stepped by the frame, a tap passed to them last. */
export interface Creatures {
  readonly herd: Herd;
  update(dt: number): void;
  /** A tap no task took: true when it hit a creature (its reaction started). */
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  /** m above `c.pos` where its drawn body's middle is: a tap is measured from there (bodyHeight). */
  bodyOf(c: Creature): number;
}

/** Colours: the fairies' dresses and glow, the reaction sparkles of each kind. */
const FAIRY = ['#ff8fd0', '#9fe8ff', '#ffe27a', '#c8a6ff'];
const SPARK = { fairy: '#ffd6f5', bird: '#ffffff', fish: '#bff4ff' } as const;
const SOUND = { fairy: 'chime', bird: 'jump', fish: 'pop' } as const;
/** The fairy (0.55 m), her flower (0.54 m) and the bird's flight wings (to the 0.6 m bird) are drawn this much larger. */
const FAIRY_SIZE = new THREE.Vector3(1.8, 1.8, 1.8), FLOWER = new THREE.Vector3(1.5, 1.5, 1.5), WINGS = new THREE.Vector3(1.45, 1.45, 1.45);

export function createCreatures(g: Game, models: CreatureModels, habitat?: Habitat): Creatures {
  const { scene, sparks } = g;
  const hab: Habitat = habitat ?? {
    ground: height, flowers: flowerSpots(), perches: treeTops(scene, { x: 2, z: -6 }),
    pond: { x: POND.x, z: POND.z, r: POND.r - 4, water: WATER_Y },
  };
  const herd = createHerd(hab);
  const kinds = (k: Kind, look = 0) => herd.all.filter((c) => c.kind === k && c.look === look);
  const fairies = kinds('fairy'), birds = kinds('bird'), fishes = [kinds('fish', 0), kinds('fish', 1)];
  const meshes: THREE.InstancedMesh[] = [];
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    mesh.count = n; mesh.frustumCulled = false;
    scene.add(mesh); meshes.push(mesh);
    return mesh;
  };

  // ---- the fairies' flowers: their own little glowing ones at the spots they gather at (they never move) ----
  const flowers = new THREE.InstancedMesh(flowerGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), Math.max(1, hab.flowers.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3();
  hab.flowers.forEach((f, i) => {
    flowers.setMatrixAt(i, m.makeRotationY(i * 2.1).scale(FLOWER).setPosition(f.x, f.y - 0.02, f.z));
    flowers.setColorAt(i, new THREE.Color(FAIRY[(i + 1) % FAIRY.length]));
  });
  flowers.count = hab.flowers.length;
  scene.add(flowers);
  // ---- the fairies: a glowing body and two pairs of wings that flap in the vertex shader (as the butterflies') ----
  const fairyMesh = instanced(fairyGeometry(), glowMaterial(14.0), fairies.length);
  fairies.forEach((_, i) => fairyMesh.setColorAt(i, new THREE.Color(FAIRY[i % FAIRY.length])));
  // Their glow: one soft point each.
  const glowPos = new Float32Array(Math.max(1, fairies.length) * 3);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowTexture(), size: 1.2, color: '#fff3c4', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.frustumCulled = false;
  scene.add(glow);
  // ---- the birds: the model (it stands on its feet at y = 0), and wings that show only off the perch ----
  const birdMesh = instanced(models.bird, propMaterial(0), birds.length);
  birdMesh.castShadow = true;
  const wingMesh = instanced(birdWings(), glowMaterial(16.0), birds.length);
  // ---- the fish: two models, centred on their middle; the tail wags in the vertex shader ----
  const fishMeshes = fishes.map((list, i) => {
    const geo = models.fish[i];
    geo.computeBoundingBox();
    geo.translate(0, -(geo.boundingBox!.max.y + geo.boundingBox!.min.y) / 2, 0);
    return instanced(geo, wagMaterial(), list.length);
  });

  const place = (mesh: THREE.InstancedMesh, i: number, c: Creature, scale: THREE.Vector3 = one) => {
    e.set(c.pitch, c.heading, c.roll, 'YXZ'); q.setFromEuler(e);
    m.compose(c.pos, q, scale); mesh.setMatrixAt(i, m);
  };
  // Sparkles of the herd: the pollen of a fairy at a flower, the splash of a fish - near the heroine only.
  const splashAt = new THREE.Vector3();
  const body = new THREE.Vector3();
  // the middle of each drawn body over its position: from the models and the sizes they are drawn at
  const heights = { fairy: bodyHeight(fairyMesh.geometry, FAIRY_SIZE.y), bird: bodyHeight(models.bird), fish: fishMeshes.map((m) => bodyHeight(m.geometry)) };
  const bodyOf = (c: Creature) => (c.kind === 'fish' ? heights.fish[c.look] ?? 0 : heights[c.kind]);
  const onEvent = (c: Creature, ev: HerdEvent) => {
    if (c.pos.distanceToSquared(g.hero.root.position) > 40 * 40) return;
    if (ev === 'pollen') sparks.burst(c.pos, '#fff2a8', 6, 1.2);
    else sparks.burst(splashAt.set(c.pos.x, hab.pond.water + 0.05, c.pos.z), '#d6f6ff', 10, 2);
  };
  return {
    herd, bodyOf,
    update(dt) {
      herd.update(dt, onEvent);
      fairies.forEach((c, i) => { place(fairyMesh, i, c, FAIRY_SIZE); glowPos.set([c.pos.x, c.pos.y + 0.25, c.pos.z], i * 3); });
      birds.forEach((c, i) => { place(birdMesh, i, c); place(wingMesh, i, c, c.state === 'perch' ? zero : WINGS); });
      fishes.forEach((list, k) => list.forEach((c, i) => place(fishMeshes[k], i, c)));
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
      glowGeo.attributes.position.needsUpdate = true;
    },
    // Only while she is free to walk: during a conversation or a cut-scene a tap is not the creatures'.
    tap(screenDist) {
      if (g.busy || !g.started()) return false;
      // measured from the middle of the drawn body, not the point it stands or hovers on
      const c = herd.tap((c) => screenDist(body.copy(c.pos).setY(c.pos.y + bodyOf(c))), g.touch ? 70 : 46);
      if (!c) return false;
      // Its own reaction: the move started in the herd, the sparkles and the sound here. No stars, nothing saved.
      sparks.burst(c.pos, SPARK[c.kind], c.kind === 'fish' ? 28 : 20, c.kind === 'fish' ? 3.5 : 2.5);
      sfx(SOUND[c.kind]);
      return true;
    },
  };
}

/** Builds a geometry from triangles: positions, colours, and a flap weight (1 - the vertex moves with a wing). */
function tris(v: number[], c: number[], flap: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  geo.setAttribute('flap', new THREE.Float32BufferAttribute(flap, 1));
  return geo;
}
/** Adds a three.js shape to the lists: its triangles in one colour, not flapping. */
function shape(geo: THREE.BufferGeometry, col: THREE.Color, v: number[], c: number[], flap: number[]) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { v.push(p.getX(i), p.getY(i), p.getZ(i)); c.push(col.r, col.g, col.b); flap.push(0); }
}

/** A small fairy, about 0.3 m (drawn 1.8 times larger): a dress (cone), a head, two pairs of wings on her back that flap. +z forward. */
export function fairyGeometry(): THREE.BufferGeometry {
  const v: number[] = [], c: number[] = [], flap: number[] = [];
  const dress = new THREE.ConeGeometry(0.06, 0.16, 7, 1, true); dress.translate(0, 0.08, 0);
  shape(dress, new THREE.Color('#ffffff'), v, c, flap);
  const head = new THREE.IcosahedronGeometry(0.05, 0); head.translate(0, 0.2, 0);
  shape(head, new THREE.Color('#fff4ea'), v, c, flap);
  for (const s of [1, -1]) {
    // the upper and the lower wing, each a triangle in the xy plane, hinged at x = ±0.03
    v.push(0.03 * s, 0.13, -0.03, 0.2 * s, 0.27, -0.05, 0.17 * s, 0.12, -0.04);
    v.push(0.03 * s, 0.1, -0.03, 0.14 * s, 0.02, -0.04, 0.06 * s, 0.03, -0.03);
    for (let k = 0; k < 6; k++) { c.push(1, 1, 1); flap.push(1); }
  }
  return tris(v, c, flap);
}

/** A bird's wings for flight, about the model's size: two triangles each side, hinged at x = ±0.03. +z forward. */
function birdWings(): THREE.BufferGeometry {
  const v: number[] = [], c: number[] = [], flap: number[] = [], col = new THREE.Color('#4f9bc0');
  for (const s of [1, -1]) {
    v.push(0.03 * s, 0.22, 0.06, 0.34 * s, 0.24, -0.02, 0.03 * s, 0.22, -0.1, 0.03 * s, 0.22, -0.1, 0.34 * s, 0.24, -0.02, 0.24 * s, 0.22, -0.16);
    for (let k = 0; k < 6; k++) { c.push(col.r, col.g, col.b); flap.push(1); }
  }
  return tris(v, c, flap);
}

/** A little flower of the fairies, 0.36 m (drawn 1.5 times larger): a stem and a five-petal star facing up, white (tinted per instance). */
function flowerGeometry(): THREE.BufferGeometry {
  const v: number[] = [], c: number[] = [], flap: number[] = [];
  const stem = new THREE.CylinderGeometry(0.012, 0.015, 0.32, 4, 1, true); stem.translate(0, 0.16, 0);
  shape(stem, new THREE.Color('#5aa84a'), v, c, flap);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, b = a + 0.5, d = a - 0.5;
    v.push(0, 0.33, 0, Math.cos(d) * 0.07, 0.34, Math.sin(d) * 0.07, Math.cos(a) * 0.13, 0.36, Math.sin(a) * 0.13);
    v.push(0, 0.33, 0, Math.cos(a) * 0.13, 0.36, Math.sin(a) * 0.13, Math.cos(b) * 0.07, 0.34, Math.sin(b) * 0.07);
    for (let k = 0; k < 6; k++) { c.push(1, 1, 1); flap.push(0); }
  }
  const mid = new THREE.IcosahedronGeometry(0.03, 0); mid.translate(0, 0.35, 0);
  shape(mid, new THREE.Color('#ffd84a'), v, c, flap);
  return tris(v, c, flap);
}

/** Unlit, not tone-mapped (it glows), coloured per instance; the vertices with `flap` swing about x = ±0.03. */
function glowMaterial(speed: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float flap;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
      float a = (sin(uTime * ${speed.toFixed(1)} + ph) * 0.7 + 0.15) * flap;
      float w = abs(position.x) - 0.03;
      transformed.x = mix(position.x, sign(position.x) * (0.03 + w * cos(a)), flap);
      transformed.y = position.y + w * sin(a) * flap;`);
  };
  mat.customProgramCacheKey = () => 'flap' + speed;
  return mat;
}

/** The fish's lit vertex-coloured material: the back half (z < 0) sways side to side. */
function wagMaterial(): THREE.MeshStandardMaterial {
  const mat = propMaterial(0);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float ph = instanceMatrix[3].x * 2.3 + instanceMatrix[3].z * 1.3;
      float back = max(0.0, -position.z);
      transformed.x += sin(uTime * 9.0 + ph) * back * back * 1.2;`);
  };
  mat.customProgramCacheKey = () => 'wag';
  return mat;
}

/** A soft round spot (a canvas, no file) for the fairies' glow; made when the world is built (the test has no canvas). */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d')!, gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
