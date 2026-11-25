import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sfx } from '../../core/audio';
import { uTime } from '../../core/materials';
import { mulberry32 } from '../../core/util';
import type { Game } from '../../game/context';
import type { WorldScope } from '../../game/scope';
import {
  CASTLE, CLOCK, CLOCK_AT, GANGWAY, GEARS, ISLANDS, ISLET_GANGWAY, LANDING, MILL, MILLS, RAIL, RAY_ISLET, SHRINE, SPAWN, TREE_ARCH, WINDS_AT,
  type Place, type ZoneId,
} from './layout';
import { colliders, height, islandAt, pathDist, type Collider } from './terrain';

/**
 * The creatures of the Sky Islands that belong to no task (PLAY-11; docs/worlds/world-5.md «Существа, занятые делами»),
 * the grey build, after the Sweet Land's (src/worlds/sweet/creatures.ts) and the first world's
 * (src/worlds/fairy/creatures.ts): birds fly in circles round the castle and the windmills and sit on the weathervanes
 * of their roofs; little dragons fly in pairs over the dragon island and come down to bask in the sun on it; cloud lambs
 * graze on the dragon island and the windmill island and jump about. A tap on one starts its own reaction - a bird
 * flutters up, a little dragon turns a somersault in the air, a lamb fluffs up -, with sparkles and a sound. Nothing is
 * recorded and nothing is given. The star fireflies of the document come with the magic later: they are not here.
 *
 * The behaviour (`createSkyHerd`) is plain data stepped in time, so the unit test runs it without a screen; the world's
 * part (`createSkyCreatures`) draws the birds, the little dragons and the lambs each as one instanced mesh of our own
 * faceted shape and the weathervanes the birds sit on as one more, casting no shadow: four draw calls.
 *
 * Every reaction freezes the action it interrupts and plays round the point it was tapped at; it ends there and the
 * action goes on from the moment it stopped. The actions that follow a circle of the clock (a bird's, a pair's) blend
 * back into it from that point, so nothing jumps.
 */

export type SkyKind = 'bird' | 'drakey' | 'lamb';
/** The two actions of each kind, in the order they take turns. */
export const SKY_ACTIONS = { bird: ['circle', 'perch'], drakey: ['pair', 'bask'], lamb: ['graze', 'jump'] } as const;
/** What a tap starts: each kind its own. */
export const SKY_REACTION = { bird: 'flutter', drakey: 'somersault', lamb: 'fluff' } as const;
/** The action a creature is held in (`SkyHerd.hold`). */
export const SKY_CALM = { bird: 'perch', drakey: 'bask', lamb: 'graze' } as const;
export type SkyState = (typeof SKY_ACTIONS)[SkyKind][number] | (typeof SKY_REACTION)[SkyKind];
/** s each reaction lasts. */
export const REACTION_TIME = { bird: 1.3, drakey: 1.5, lamb: 1.4 } as const;
/** How many of each kind: the birds of each ring, the pairs of little dragons, the lambs of each flock. */
export const COUNTS = { birdsPerRing: 3, pairs: 2, lambsPerFlock: 3 } as const;

export interface SkyCreature {
  readonly kind: SkyKind;
  /** A bird's ring, a little dragon's pair, a lamb's flock (indices into the habitat's lists). */
  readonly group: number;
  /** A little dragon's side in its pair (-1 leads, 1 follows); 0 else. */
  readonly side: number;
  /** A bird's ring's middle, a little dragon's sunny spot, a lamb's middle of its grazing. */
  readonly home: THREE.Vector3;
  state: SkyState;
  readonly pos: THREE.Vector3;
  heading: number; pitch: number; roll: number;
  t: number; dur: number;
  /** A second clock of the state: the blend back into a circle, a flight's time one way, a lamb's leg of grazing. */
  u: number;
  /** s a lamb's leg takes: its walk and its munching after. */
  leg: number;
  /** Taps answered. */
  taps: number;
  readonly from: THREE.Vector3; readonly to: THREE.Vector3;
  /** Where a reaction started and ends; the state and its time it goes back to. */
  readonly origin: THREE.Vector3;
  back: SkyState; resume: number;
  /** The weathervane a bird sits on (an index into the habitat's `vanes`); -1 - none. */
  spot: number;
  /** How much the wings flap or the wool is puffed now, 0-1: the drawing reads it. */
  act: number;
  held: THREE.Vector3 | null;
}

/** A ring the birds fly round: its middle in the air, its radius, the way round (1 or -1). */
export interface Ring { centre: THREE.Vector3; r: number; dir: number }
/** A weathervane on a roof's tip: the tip it stands on and the ring whose birds sit on it. */
export interface Vane { tip: THREE.Vector3; ring: number }
/** A pair of little dragons: the middle of their circle in the air, its radius, the way round; their two sunny spots. */
export interface Pair { centre: THREE.Vector3; r: number; dir: number; sunny: readonly [THREE.Vector3, THREE.Vector3] }
export interface SkyHabitat {
  ground(x: number, z: number): number;
  rings: readonly Ring[];
  vanes: readonly Vane[];
  pairs: readonly Pair[];
  /** The middles of each lamb's grazing, on the ground, by flock. */
  flocks: readonly (readonly THREE.Vector3[])[];
}

export interface SkyHerd {
  readonly all: SkyCreature[];
  update(dt: number, onEvent?: (c: SkyCreature, e: 'sparkle') => void): void;
  /** The creature a tap at `dist` hits (within `reach`), its reaction started; null - none. */
  tap(dist: (c: SkyCreature) => number, reach: number): SkyCreature | null;
  /** Debug: holds `c` at `at` in its calm action until a tap; null lets it go. */
  hold(c: SkyCreature, at: THREE.Vector3 | null): void;
}

/** m: a weathervane's height over its roof's tip (a bird sits on its arrow). */
export const VANE_H = 0.9;
/** m: a lamb grazes this far from its middle at most; m/s it walks. */
export const LAMB_ROAM = 1.8;
const LAMB_SPEED = 0.35;
/** m a lamb's jumps go up; s the two of them take. */
const JUMP_HIGH = 0.45, JUMP_T = 1.6;
/** m/s a bird flies to its vane and back; a little dragon down to its sunny spot and back. */
const BIRD_SPEED = 3, DRAKE_SPEED = 2.5;
/** rad/s round a bird's ring and a pair's circle (times a little of each's own). */
const BIRD_SPIN = 0.4, PAIR_SPIN = 0.3;
/** s a flier blends from where it was back into its circle. */
const BLEND = 1.2;
/** m between the two little dragons of a pair, side by side. */
const PAIR_GAP = 1.8;
/** m: how high a bird flutters up; the radius of a little dragon's somersault and the lift of it. */
const FLUTTER_UP = 1.2, LOOP_R = 0.9, LOOP_LIFT = 0.5;
/** m over its island's top a flier keeps under (docs: fliers stay within about 15 m over the islands). */
export const FLY_MAX = 15;

const ease = (k: number) => k * k * (3 - 2 * k);

export function createSkyHerd(h: SkyHabitat, seed = 61): SkyHerd {
  const rnd = mulberry32(seed);
  const range = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const all: SkyCreature[] = [];
  let clock = 0;
  const make = (kind: SkyKind, home: THREE.Vector3, state: SkyState, group: number, side = 0): SkyCreature => ({
    kind, group, side, home: home.clone(), state, pos: home.clone(), heading: rnd() * 6.28, pitch: 0, roll: 0, t: 0, dur: range(4, 8), u: BLEND, leg: 0,
    taps: 0, from: home.clone(), to: home.clone(), origin: home.clone(), back: state, resume: 0, spot: -1, act: 0, held: null,
  });
  // the birds: each its own phase and pace round its ring
  const pace = new Map<SkyCreature, { phase: number; speed: number }>();
  h.rings.forEach((r, ring) => {
    for (let i = 0; i < COUNTS.birdsPerRing; i++) {
      const c = make('bird', r.centre, 'circle', ring); c.dur = range(4, 10); c.act = 1;
      pace.set(c, { phase: (i / COUNTS.birdsPerRing) * Math.PI * 2 + rnd() * 0.8, speed: BIRD_SPIN * (0.85 + rnd() * 0.3) * r.dir });
      ringAt(c, c.pos);
      all.push(c);
    }
  });
  // the little dragons: two a pair, side by side on their pair's circle
  const pairPhase = h.pairs.map(() => rnd() * 6.28);
  h.pairs.forEach((p, i) => {
    for (const side of [-1, 1]) {
      const c = make('drakey', p.sunny[side < 0 ? 0 : 1], 'pair', i, side); c.dur = range(8, 14); c.act = 1;
      slot(c, c.pos);
      all.push(c);
    }
  });
  h.flocks.forEach((f, i) => f.forEach((home) => { const c = make('lamb', home, 'graze', i); c.dur = range(5, 12); c.u = 0; c.leg = 0; all.push(c); }));

  const tmp = new THREE.Vector3();
  /** A bird's point of its ring now, with a little rise and fall. */
  function ringAt(c: SkyCreature, out: THREE.Vector3) {
    const r = h.rings[c.group], p = pace.get(c)!, a = p.phase + clock * p.speed;
    return out.set(r.centre.x + Math.sin(a) * r.r, r.centre.y + Math.sin(a * 2.7 + p.phase) * 0.3, r.centre.z + Math.cos(a) * r.r);
  }
  /** A little dragon's place in its pair now: on the pair's circle, to its side of the way, bobbing. */
  function slot(c: SkyCreature, out: THREE.Vector3) {
    const p = h.pairs[c.group], a = pairPhase[c.group] + clock * PAIR_SPIN * p.dir;
    const dx = Math.cos(a) * p.dir, dz = -Math.sin(a) * p.dir, w = (c.side * PAIR_GAP) / 2;
    return out.set(p.centre.x + Math.sin(a) * p.r - dz * w, p.centre.y + Math.sin(clock * 1.7 + c.side) * 0.3, p.centre.z + Math.cos(a) * p.r + dx * w);
  }
  const face = (c: SkyCreature, x: number, z: number) => { const dx = x - c.pos.x, dz = z - c.pos.z; if (dx * dx + dz * dz > 1e-8) c.heading = Math.atan2(dx, dz); };
  /** Follows a clock's circle (`at`), blending into it from `from` after a reaction or a landing. */
  function follow(c: SkyCreature, dt: number, at: (c: SkyCreature, out: THREE.Vector3) => THREE.Vector3) {
    at(c, tmp);
    if (c.u < BLEND) { c.u += dt; tmp.lerpVectors(c.from, tmp, ease(Math.min(1, c.u / BLEND))); }
    face(c, tmp.x, tmp.z); c.pos.copy(tmp);
  }
  /** A flight there and back with a stay between (a bird to its vane, a little dragon to its spot): `u` s each way. */
  function thereAndBack(c: SkyCreature, arc: number) {
    const go = c.u, stay = c.dur - go * 2;
    if (c.t < go) { const s = ease(c.t / go); c.pos.lerpVectors(c.from, c.to, s); c.pos.y += Math.sin(s * Math.PI) * arc; face(c, c.to.x, c.to.z); return 'there'; }
    if (c.t < go + stay) { c.pos.copy(c.to); return 'stay'; }
    const s = ease(Math.min(1, (c.t - go - stay) / go));
    c.pos.lerpVectors(c.to, c.from, s); c.pos.y += Math.sin(s * Math.PI) * arc; face(c, c.from.x, c.from.z);
    return 'back';
  }
  /** A free vane of the bird's ring: it flies there; none free - it keeps circling. */
  function perch(c: SkyCreature) {
    const taken = new Set(all.filter((b) => b.kind === 'bird' && b !== c && b.spot >= 0).map((b) => b.spot));
    const free = h.vanes.map((v, i) => ({ v, i })).filter(({ v, i }) => v.ring === c.group && !taken.has(i));
    if (!free.length) { c.t = 0; c.dur = range(3, 6); return; }
    const { v, i } = free[Math.floor(rnd() * free.length)];
    c.state = 'perch'; c.t = 0; c.spot = i; c.from.copy(c.pos); c.to.copy(v.tip).setY(v.tip.y + VANE_H);
    c.u = Math.max(1.5, c.from.distanceTo(c.to) / BIRD_SPEED); c.dur = c.u * 2 + range(3, 7);
  }
  /** The leader of a pair takes both down to bask (one held or reacting stays up). */
  function bask(pair: number) {
    const stay = range(4, 7);
    for (const d of all) {
      if (d.kind !== 'drakey' || d.group !== pair || d.held || d.state !== 'pair') continue;
      d.state = 'bask'; d.t = 0; d.from.copy(d.pos); d.to.copy(d.home);
      d.u = Math.max(2, d.from.distanceTo(d.to) / DRAKE_SPEED); d.dur = d.u * 2 + stay;
    }
  }
  /** The next leg of a lamb's grazing: to a spot by its middle, then munching there a while. */
  function nextLeg(c: SkyCreature) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * LAMB_ROAM, x = c.home.x + Math.cos(a) * r, z = c.home.z + Math.sin(a) * r;
    c.u = 0; c.from.copy(c.pos); c.to.set(x, h.ground(x, z), z);
    c.leg = c.from.distanceTo(c.to) / LAMB_SPEED + range(1.5, 4);
  }

  return {
    all,
    update(dt, onEvent = () => {}) {
      clock += dt;
      for (const c of all) {
        c.t += dt;
        if (c.held && c.state !== SKY_REACTION[c.kind]) { c.pos.copy(c.held); c.t = 0; c.act = 0; c.pitch = 0; c.roll = 0; continue; }
        const k = Math.min(1, c.t / Math.max(c.dur, 1e-3)), was = (c.t - dt) / Math.max(c.dur, 1e-3);
        switch (c.state) {
          case 'circle':           // round its ring, banked into the turn, wings beating
            follow(c, dt, ringAt); c.act = 1; c.roll = -0.35 * h.rings[c.group].dir; c.pitch = 0;
            if (k >= 1) perch(c);
            break;
          case 'perch': {          // over to a weathervane, a while on it looking about, back into the ring
            const at = thereAndBack(c, 0.8);
            c.roll = 0; c.act = at === 'stay' ? 0 : 1;
            if (at === 'stay') c.heading += Math.sin(c.t * 0.7) * dt * 0.6;
            if (k >= 1) { c.state = 'circle'; c.t = 0; c.dur = range(6, 12); c.spot = -1; c.from.copy(c.pos); c.u = 0; }
            break;
          }
          case 'pair':             // side by side round their circle over the dragon island
            follow(c, dt, slot); c.act = 1; c.pitch = 0; c.roll = -0.2 * h.pairs[c.group].dir;
            if (k >= 1) { if (c.side < 0) bask(c.group); else { c.t = 0; c.dur = range(4, 8); } }
            break;
          case 'bask': {           // down to its sunny spot, lying there with its wings spread, up and back to its pair
            const at = thereAndBack(c, 0.6);
            c.roll = 0; c.act = at === 'stay' ? 0 : 1; c.pitch = at === 'stay' ? 0.08 : 0;
            if (at === 'stay') c.heading += Math.sin(c.t * 0.4) * dt * 0.3;
            if (k >= 1) { c.state = 'pair'; c.t = 0; c.dur = range(8, 14); c.from.copy(c.pos); c.u = 0; c.pitch = 0; }
            break;
          }
          case 'graze': {          // a few steps to a tuft, munching it with the head down, on again
            c.u += dt;
            if (c.u >= c.leg) nextLeg(c);
            const walk = c.from.distanceTo(c.to) / LAMB_SPEED, s = walk > 1e-6 ? Math.min(1, c.u / walk) : 1;
            c.pos.lerpVectors(c.from, c.to, s); c.pos.y = h.ground(c.pos.x, c.pos.z);
            if (s < 1) { face(c, c.to.x, c.to.z); c.pitch = 0; } else c.pitch = 0.3 + Math.sin(c.u * 5) * 0.05;
            c.act = 0;
            if (k >= 1) { c.state = 'jump'; c.t = 0; c.dur = JUMP_T; c.from.copy(c.pos); c.pitch = 0; }
            break;
          }
          case 'jump':             // two springy jumps on the spot
            c.pos.copy(c.from); c.pos.y = c.from.y + Math.abs(Math.sin(k * Math.PI * 2)) * JUMP_HIGH;
            c.pitch = -0.25 * Math.sin(k * Math.PI * 4); c.act = 0;
            if (k >= 1) { c.state = 'graze'; c.t = 0; c.dur = range(6, 12); c.pos.copy(c.from); c.u = c.leg; c.pitch = 0; }
            break;
          case 'flutter':          // up off where it was, flapping hard and turning about, and settles back
            c.pos.copy(c.origin); c.pos.y += Math.sin(k * Math.PI) * FLUTTER_UP;
            c.heading += dt * 5; c.act = 1; c.roll = 0; c.pitch = -0.3 * Math.sin(k * Math.PI);
            if (k >= 1) end(c);
            break;
          case 'somersault': {     // a loop head over tail, up and round, sparkles at its top
            const a = k * Math.PI * 2, fx = Math.sin(c.heading), fz = Math.cos(c.heading);
            const ahead = Math.sin(a) * LOOP_R, up = (1 - Math.cos(a)) * LOOP_R + Math.sin(k * Math.PI) * LOOP_LIFT;
            c.pos.set(c.origin.x + fx * ahead, c.origin.y + up, c.origin.z + fz * ahead);
            c.pitch = -a; c.roll = 0; c.act = 1;
            if (k >= 0.5 && was < 0.5) onEvent(c, 'sparkle');
            if (k >= 1) end(c);
            break;
          }
          case 'fluff':            // the wool puffs up round, a little hop, and settles
            c.pos.copy(c.origin); c.pos.y += Math.sin(k * Math.PI) * 0.12;
            c.act = Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * (1 - Math.max(0, (k - 0.7) / 0.3));
            if (k >= 0.4 && was < 0.4) onEvent(c, 'sparkle');
            if (k >= 1) end(c);
            break;
        }
      }
    },
    tap(dist, reach) {
      let best: SkyCreature | null = null, bd = reach;
      for (const c of all) { const d = dist(c); if (d < bd) { bd = d; best = c; } }
      if (!best) return null;
      const c = best;
      if (c.state !== SKY_REACTION[c.kind]) {
        c.back = c.state; c.resume = c.t; c.origin.copy(c.pos); c.t = 0; c.state = SKY_REACTION[c.kind]; c.dur = REACTION_TIME[c.kind];
      }
      c.taps++;
      return c;
    },
    hold(c, at) {
      if (!at) { c.held = null; return; }
      c.held = at.clone(); c.state = c.back = SKY_CALM[c.kind]; c.t = 0; c.resume = 0; c.dur = 1; c.act = 0;
      c.pos.copy(at); c.from.copy(at); c.to.copy(at); c.origin.copy(at); c.pitch = 0; c.roll = 0; c.u = 0.5; c.leg = 0;
    },
  };

  /** A reaction ends where it began: the creature goes on with what it did, from the moment it stopped. */
  function end(c: SkyCreature) {
    c.act = 0; c.pitch = 0; c.roll = 0; c.pos.copy(c.held ?? c.origin);
    if (c.held) { c.state = SKY_CALM[c.kind]; c.t = 0; c.dur = 1; return; }
    c.state = c.back; c.t = c.resume;
    // the circles went on meanwhile: the flier blends back into its place in them
    if (c.state === 'circle' || c.state === 'pair') { c.from.copy(c.pos); c.u = 0; }
  }
}

/** m: a lamb's middle keeps this clear round it (its grazing); a sunny spot, its little dragon lying there. */
const LAMB_CLEAR = LAMB_ROAM + 0.6, SUN_CLEAR = 1.2;
/** m: a lamb or a basking little dragon keeps this much more inside an island's rail. */
const EDGE_MARGIN = 0.4;
/** The places of the tasks, the way in and the ways off: no creature lives within TASK_CLEAR m of them. */
const TASK_SPOTS: readonly Place[] = [SPAWN, TREE_ARCH, SHRINE, CLOCK, CLOCK_AT, GANGWAY, WINDS_AT, LANDING, ISLET_GANGWAY, RAY_ISLET, ...GEARS];
const TASK_CLEAR = 4.5;

/**
 * Whether a walker can live at (x, z) with `clear` m round it: on an island, inside its rail by that and a margin (never
 * on a bridge nor over the void), off the middle line of the bridges' ways, clear of every collider and the tasks.
 */
export function freeSpot(x: number, z: number, clear: number, blocked: readonly Collider[]): boolean {
  const on = islandAt(x, z);
  if (!on) return false;
  const i = ISLANDS[on];
  return Math.hypot(x - i.x, z - i.z) < i.r - RAIL - EDGE_MARGIN - clear && pathDist(x, z) > 1.5 + clear * 0.5
    && blocked.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + clear) && TASK_SPOTS.every((p) => Math.hypot(p.x - x, p.z - z) > TASK_CLEAR);
}

/** m over its island's top: the birds' rings (over the castle's 11 m and the mills' sails), the pairs' circles (over the dragon's rock). */
const RING_UP = 12.5, PAIR_UP = [6.5, 7.5] as const;
/** m: the radius of the birds' rings; of the pairs' circles. */
const RING_R = 5, PAIR_R = [5, 8.5] as const;

/**
 * The tips of the roofs the weathervanes stand on: the castle's four towers and the three windmills - as ./scenery.ts
 * builds them (the castle's parts turned by 0.3 round its middle, its highest tower to the north-west at CASTLE.top, the
 * others 1.5 m lower; a mill's roof cone on its tower).
 */
export function roofTips(): { castle: THREE.Vector3[]; mills: THREE.Vector3[] } {
  const base = height(CASTLE.x, CASTLE.z), yaw = 0.3, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const castle = ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([dx, dz]) => {
    const x = dx * CASTLE.r * 0.8, z = dz * CASTLE.r * 0.8;
    return new THREE.Vector3(CASTLE.x + x * cos + z * sin, base + (dx < 0 && dz < 0 ? CASTLE.top : CASTLE.top - 1.5), CASTLE.z - x * sin + z * cos);
  });
  const mills = MILLS.map((m) => new THREE.Vector3(m.x, height(m.x, m.z) + MILL.towerH + MILL.roofH, m.z));
  return { castle, mills };
}

/**
 * Where the Sky Islands' creatures live: a ring of birds over the castle and one over the windmills, their weathervanes
 * on the castle's towers and the mills' roofs; two pairs of little dragons circling over the dragon island, their sunny
 * spots on it; a flock of lambs on the dragon island and one on the windmill island. `blocked` - the colliders of the
 * islands and the characters (built before): the lambs and the sunny spots stand clear of all of them.
 */
export function skyHabitat(blocked: readonly Collider[] = colliders): SkyHabitat {
  const rnd = mulberry32(67);
  const top = (id: ZoneId) => ISLANDS[id].top;
  const spots = (centre: Place, r: number, n: number, clear: number, gap: number, taken: THREE.Vector3[] = []) => {
    const out: THREE.Vector3[] = [];
    for (let tries = 0; out.length < n && tries < 2000; tries++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r, x = centre.x + Math.cos(a) * d, z = centre.z + Math.sin(a) * d;
      if (!freeSpot(x, z, clear, blocked) || [...taken, ...out].some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
      out.push(new THREE.Vector3(x, height(x, z), z));
    }
    return out;
  };
  const tips = roofTips();
  const millsMid = MILLS.reduce((s, m) => ({ x: s.x + m.x / MILLS.length, z: s.z + m.z / MILLS.length }), { x: 0, z: 0 });
  const rings: Ring[] = [
    { centre: new THREE.Vector3(CASTLE.x, top('castle') + RING_UP, CASTLE.z), r: RING_R, dir: 1 },
    { centre: new THREE.Vector3(millsMid.x, top('mills') + RING_UP, millsMid.z), r: RING_R + 1, dir: -1 },
  ];
  const vanes: Vane[] = [...tips.castle.map((tip) => ({ tip, ring: 0 })), ...tips.mills.map((tip) => ({ tip, ring: 1 }))];
  const d = ISLANDS.dragon, sunny: THREE.Vector3[] = [];
  const pairs: Pair[] = PAIR_R.map((r, i) => {
    // two spots side by side: the first anywhere free on the island, its partner within a few metres of it
    const [a] = spots(d, d.r, 1, SUN_CLEAR, 5, sunny);
    sunny.push(a);
    const [b] = spots(a, 3, 1, SUN_CLEAR, 1.6, sunny);
    sunny.push(b);
    return { centre: new THREE.Vector3(d.x, d.top + PAIR_UP[i], d.z), r, dir: i % 2 ? -1 : 1, sunny: [a, b] as const };
  });
  const flocks = [spots(d, d.r, COUNTS.lambsPerFlock, LAMB_CLEAR, 4.5, sunny), spots(ISLANDS.mills, ISLANDS.mills.r, COUNTS.lambsPerFlock, LAMB_CLEAR, 4.5)];
  return { ground: height, rings, vanes, pairs, flocks };
}

// ---- the shapes: positions, a colour, which part moves (`part`) ----

interface Bit { geo: THREE.BufferGeometry; colour: string; part?: number }
function shape(bits: Bit[]): THREE.BufferGeometry {
  const gs = bits.map(({ geo, colour, part = 0 }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    const n = g.getAttribute('position').count, c = new THREE.Color(colour);
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
    g.setAttribute('part', new THREE.Float32BufferAttribute(new Array<number>(n).fill(part), 1));
    return g;
  });
  const g = mergeGeometries(gs);
  if (!g) throw new Error('sky creatures: the parts did not merge');
  g.computeVertexNormals();
  return g;
}
const tri = (...p: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g; };
const DARK = '#2a1a1a', GOLD = '#ffd166';

/** A bird, 0.36 m long, sitting on y 0, its front +z: a body and head (white: the bird's colour), dark eyes, a yellow beak, a tail, two wings (part 1). */
export function birdGeometry(): THREE.BufferGeometry {
  const w = '#ffffff', bits: Bit[] = [
    { geo: new THREE.OctahedronGeometry(0.12, 1).scale(0.8, 0.75, 1.3).translate(0, 0.12, 0), colour: w },
    { geo: new THREE.OctahedronGeometry(0.07, 1).translate(0, 0.23, 0.11), colour: w },
    { geo: new THREE.ConeGeometry(0.025, 0.07, 4).rotateX(Math.PI / 2).translate(0, 0.225, 0.2), colour: '#ffb84a' },
    // the tail: a forked fan behind, both sides (a swallow's, as Chirika's kin)
    { geo: tri(0, 0.13, -0.12, 0.07, 0.16, -0.28, -0.07, 0.16, -0.28, 0, 0.13, -0.12, -0.07, 0.16, -0.28, 0.07, 0.16, -0.28), colour: '#c8d4ea' },
  ];
  for (const s of [1, -1]) {
    bits.push({ geo: new THREE.OctahedronGeometry(0.018, 0).translate(0.045 * s, 0.25, 0.15), colour: DARK });
    // a wing from the body's side out: hinged at x = 0.05, y = 0.15 (the shader turns it there)
    bits.push({ geo: tri(0.05 * s, 0.15, 0.07, 0.05 * s, 0.15, -0.09, 0.28 * s, 0.15, -0.06, 0.05 * s, 0.15, 0.07, 0.28 * s, 0.15, -0.06, 0.05 * s, 0.15, -0.09), colour: '#e8eefa', part: 1 });
  }
  return shape(bits);
}

/**
 * A little dragon, 0.66 m long, its belly on y 0, its front +z: a body, a head and a snout (white: its colour), a golden
 * belly and horns, dark eyes, a tail, four stubby legs and two wings (part 1) hinged on its back.
 */
export function drakeyGeometry(): THREE.BufferGeometry {
  const w = '#ffffff', bits: Bit[] = [
    { geo: new THREE.IcosahedronGeometry(0.12, 1).scale(0.9, 0.8, 1.5).translate(0, 0.13, 0), colour: w },
    { geo: new THREE.IcosahedronGeometry(0.09, 0).scale(0.8, 0.6, 1.4).translate(0, 0.09, 0.03), colour: '#ffe9a0' },
    { geo: new THREE.IcosahedronGeometry(0.08, 1).translate(0, 0.22, 0.21), colour: w },
    { geo: new THREE.OctahedronGeometry(0.05, 0).scale(0.8, 0.6, 1.2).translate(0, 0.2, 0.29), colour: w },
    { geo: new THREE.ConeGeometry(0.05, 0.3, 5).rotateX(-Math.PI / 2).translate(0, 0.12, -0.3), colour: w },
  ];
  for (const s of [1, -1]) {
    bits.push({ geo: new THREE.OctahedronGeometry(0.016, 0).translate(0.04 * s, 0.25, 0.27), colour: DARK });
    bits.push({ geo: new THREE.ConeGeometry(0.016, 0.08, 4).rotateX(-0.5).translate(0.035 * s, 0.31, 0.17), colour: GOLD });
    for (const z of [0.09, -0.09]) bits.push({ geo: new THREE.OctahedronGeometry(0.035, 0).translate(0.07 * s, 0.03, z), colour: w });
    // a wing of two leaves from the back out: hinged at x = 0.06, y = 0.2 (the shader turns it there)
    bits.push({ geo: tri(0.06 * s, 0.2, 0.08, 0.06 * s, 0.2, -0.1, 0.38 * s, 0.22, -0.04, 0.06 * s, 0.2, -0.1, 0.27 * s, 0.2, -0.16, 0.38 * s, 0.22, -0.04), colour: '#fff2c8', part: 1 });
  }
  return shape(bits);
}

/** A cloud lamb, 0.5 m tall, standing on y 0, its front +z: a fleece of white puffs (part 1, it fluffs up), a soft grey face, ears, eyes and legs. */
export function lambGeometry(): THREE.BufferGeometry {
  const w = '#ffffff', face = '#9a90b0', bits: Bit[] = [
    { geo: new THREE.IcosahedronGeometry(0.14, 1).scale(1, 0.85, 1.25).translate(0, 0.3, 0), colour: w, part: 1 },
    { geo: new THREE.IcosahedronGeometry(0.06, 0).translate(0, 0.44, 0.17), colour: w, part: 1 },
    { geo: new THREE.IcosahedronGeometry(0.08, 0).translate(0, 0.42, -0.02), colour: w, part: 1 },
    { geo: new THREE.IcosahedronGeometry(0.06, 0).scale(0.8, 1, 1.1).translate(0, 0.36, 0.2), colour: face },
  ];
  for (const s of [1, -1]) {
    for (const z of [0.09, -0.09]) {
      bits.push({ geo: new THREE.IcosahedronGeometry(0.08, 0).translate(0.1 * s, 0.34, z), colour: w, part: 1 });
      bits.push({ geo: new THREE.CylinderGeometry(0.022, 0.02, 0.2, 3, 1, true).translate(0.07 * s, 0.1, z), colour: face });
    }
    bits.push({ geo: new THREE.OctahedronGeometry(0.03, 0).scale(1.6, 0.6, 1).translate(0.065 * s, 0.38, 0.18), colour: face });
    bits.push({ geo: new THREE.OctahedronGeometry(0.012, 0).translate(0.025 * s, 0.38, 0.262), colour: DARK });
  }
  return shape(bits);
}

/** A weathervane standing on a roof's tip at y 0: a pole into the tip, a golden ball, an arrow pointing +z with a fin behind. */
export function vaneGeometry(): THREE.BufferGeometry {
  const pole = VANE_H + 0.25;
  return shape([
    { geo: new THREE.CylinderGeometry(0.025, 0.03, pole, 4).translate(0, pole / 2 - 0.25, 0), colour: '#7a6a5a' },
    { geo: new THREE.OctahedronGeometry(0.06, 1).translate(0, VANE_H * 0.55, 0), colour: GOLD },
    { geo: new THREE.BoxGeometry(0.03, 0.03, 0.6).translate(0, VANE_H, 0), colour: '#c9a040' },
    { geo: new THREE.ConeGeometry(0.07, 0.15, 4).rotateX(Math.PI / 2).translate(0, VANE_H, 0.37), colour: '#c9a040' },
    { geo: tri(0, VANE_H, -0.2, 0, VANE_H + 0.14, -0.34, 0, VANE_H - 0.1, -0.34), colour: '#c9a040' },
  ]);
}

/** The material of a kind: lit, flat, its colour from the vertices times the instance's; `move` - GLSL that moves `transformed`. */
function creatureMaterial(kind: string, move: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true, ...extra });
  m.name = `sky-${kind}`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float part;\nattribute float aAct;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = instanceMatrix[3].x * 2.3 + instanceMatrix[3].z * 1.7;
      float p1 = step(0.5, part);
      ${move}`);
  };
  m.customProgramCacheKey = () => `sky-creature-${kind}`;
  return m;
}
/** A wing hinged at (`hx`, `hy`) turned by `ang` (GLSL): the part-1 vertices only. */
const wing = (hx: number, hy: number, ang: string) => `float side = sign(position.x);
      float ang = ${ang};
      vec2 w = vec2(abs(position.x) - ${hx.toFixed(3)}, position.y - ${hy.toFixed(3)});
      vec2 r = vec2(w.x * cos(ang) - w.y * sin(ang), w.x * sin(ang) + w.y * cos(ang));
      transformed.x = mix(transformed.x, side * (${hx.toFixed(3)} + r.x), p1);
      transformed.y = mix(transformed.y, ${hy.toFixed(3)} + r.y, p1);`;
const MOVE = {
  // the wings: folded down along the body at rest, beating with aAct (flying, fluttering)
  bird: wing(0.05, 0.15, '-0.9 * (1.0 - aAct) + sin(uTime * 22.0 + ph) * 0.9 * aAct'),
  // the wings: spread flat in the sun at rest, a slow beat with aAct (flying, the somersault)
  drakey: wing(0.06, 0.2, '0.1 * (1.0 - aAct) + sin(uTime * 9.0 + ph) * 0.8 * aAct'),
  // the fleece breathes a little all the time and puffs up round its middle with aAct (the fluff)
  lamb: `vec3 mid = vec3(0.0, 0.32, 0.0);
      float puff = 1.0 + 0.04 * sin(uTime * 2.0 + ph) + 0.5 * aAct;
      transformed = mix(transformed, mid + (transformed - mid) * puff, p1);`,
} as const;

/** Colours per instance: the birds pale; the little dragons green, gold, sky blue; the cloud lambs white. */
const BIRD = ['#ffffff', '#dfe9ff', '#ffe6d2'];
const DRAKEY = ['#7fd06a', '#ffc94a', '#6fc4d8', '#b8e06a'];
const LAMB = ['#ffffff', '#f2f4ff', '#fff3f8'];
const SPARK = { bird: '#ffffff', drakey: '#ffe27a', lamb: '#f4f8ff' } as const;
/** The game's sounds (src/core/audio.ts sfx): the islands have no recorded creature voice. */
const SOUND = { bird: 'pop', drakey: 'jump', lamb: 'soft' } as const;
/**
 * How much larger than its shape each kind is drawn, by the heroine's 1.53 m and the Sweet Land's sizes (2026-11-24): a
 * bird 0.86 m long (it flies high), a little dragon 1.7 m long, a lamb 0.9 m tall; the weathervanes as they are.
 */
export const SIZE = { bird: 2.4, drakey: 2.6, lamb: 1.8 } as const;
/** m above a creature's point where its drawn body's middle is (what a tap is measured to). */
const BODY = { bird: 0.14 * SIZE.bird, drakey: 0.15 * SIZE.drakey, lamb: 0.3 * SIZE.lamb } as const;

/** The world's part of the creatures: stepped by the frame; a tap passed to them last. */
export interface SkyCreatures {
  readonly herd: SkyHerd;
  update(dt: number): void;
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  bodyOf(c: SkyCreature): number;
  readonly meshes: readonly THREE.InstancedMesh[];
  /** Takes the meshes out of the scene and frees them (the world's scope does so too, as the world is left). */
  dispose(): void;
}

export function createSkyCreatures(g: Pick<Game, 'scene' | 'sparks' | 'busy' | 'started' | 'touch'>, _scope: WorldScope, habitat: SkyHabitat = skyHabitat()): SkyCreatures {
  const { scene } = g;
  const herd = createSkyHerd(habitat);
  const kinds: { kind: SkyKind; list: SkyCreature[]; mesh: THREE.InstancedMesh; act: THREE.InstancedBufferAttribute }[] = [];
  const add = (kind: SkyKind, geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, colours: readonly string[]) => {
    const list = herd.all.filter((c) => c.kind === kind), n = Math.max(1, list.length);
    const act = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('aAct', act);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = `sky-${kind}`; mesh.count = list.length; mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    list.forEach((_, i) => mesh.setColorAt(i, new THREE.Color(colours[i % colours.length])));
    scene.add(mesh);
    kinds.push({ kind, list, mesh, act });
  };
  add('bird', birdGeometry(), creatureMaterial('bird', MOVE.bird, { side: THREE.DoubleSide, roughness: 0.8 }), BIRD);
  add('drakey', drakeyGeometry(), creatureMaterial('drakey', MOVE.drakey, { side: THREE.DoubleSide, roughness: 0.45 }), DRAKEY);
  add('lamb', lambGeometry(), creatureMaterial('lamb', MOVE.lamb, { roughness: 1 }), LAMB);
  // the weathervanes on the roofs' tips: one instanced mesh, swinging a little in the wind
  const vanes = new THREE.InstancedMesh(vaneGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, flatShading: true }), Math.max(1, habitat.vanes.length));
  vanes.name = 'sky-vanes'; vanes.count = habitat.vanes.length; vanes.castShadow = false; vanes.receiveShadow = false;
  scene.add(vanes);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), size = new THREE.Vector3(), body = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const meshes = [...kinds.map((k) => k.mesh), vanes];
  let clock = 0;
  const bodyOf = (c: SkyCreature) => BODY[c.kind];
  const sparks = g.sparks;
  return {
    herd, bodyOf, meshes,
    update(dt) {
      clock += dt;
      herd.update(dt, (c, ev) => { if (ev === 'sparkle') sparks.burst(c.pos, SPARK[c.kind], 14, 1.6); });
      for (const k of kinds) {
        k.list.forEach((c, i) => {
          e.set(c.pitch, c.heading, c.roll, 'YXZ'); q.setFromEuler(e);
          k.mesh.setMatrixAt(i, m.compose(c.pos, q, size.setScalar(SIZE[k.kind])));
          k.act.setX(i, c.act);
        });
        k.mesh.instanceMatrix.needsUpdate = true; k.act.needsUpdate = true;
      }
      habitat.vanes.forEach((v, i) => vanes.setMatrixAt(i, m.compose(v.tip, q.setFromAxisAngle(up, i * 1.3 + Math.sin(clock * 0.4 + i) * 0.5), size.setScalar(1))));
      vanes.instanceMatrix.needsUpdate = true;
    },
    // only while she is free to walk: in a conversation or a cut-scene a tap is not the creatures'
    tap(screenDist) {
      if (g.busy || !g.started()) return false;
      const c = herd.tap((c) => screenDist(body.copy(c.pos).setY(c.pos.y + bodyOf(c))), g.touch ? 70 : 46);
      if (!c) return false;
      sparks.burst(c.pos, SPARK[c.kind], 18, 2);
      sfx(SOUND[c.kind]);
      return true;
    },
    dispose() {
      for (const mesh of meshes) {
        mesh.removeFromParent(); mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
  };
}
