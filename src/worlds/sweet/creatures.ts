import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sfx } from '../../core/audio';
import { uTime } from '../../core/materials';
import { mulberry32 } from '../../core/util';
import type { Game } from '../../game/context';
import type { WorldScope } from '../../game/scope';
import { BRIDGE, HALF, HOUSE_DOOR, HOUSE_FACADE, LANDMARKS, MILLSTONE, RIVER_HALF, SCALES_AT, SHRINE, SPAWN, TREE_ARCH, ZONES, type Place } from './layout';
import { BUTTERFLIES, BUTTERFLIES_RUBY, ZONE_OF } from './magic';
import { HOUSE_ROOF, LOLLY, LOLLY_BIG, LOLLY_TOP, gardenTrees, placeSweets, townHouses } from './scenery';
import { colliders, height, pathDist, riverDist, type Collider } from './terrain';

/**
 * The creatures of the Sweet Land that belong to no task (PLAY-11, PLAY-12; docs/worlds/world-4.md), after the first
 * world's (src/worlds/fairy/creatures.ts) and the sea's (src/worlds/sea/creatures.ts): gummy bears hop about and dance
 * in pairs, caramel butterflies fly round the zones and land on the lollipops, gingerbread birds sit on the town's roofs
 * and fly from one to another, dragee ladybugs crawl over marmalade leaves and hide under them. A tap on one starts its
 * own reaction - a bear jumps and wobbles like jelly, a butterfly swirls and scatters sparks, a bird chirps and flaps,
 * a ladybug opens its wings -, with sparkles and a sound. Nothing is recorded and nothing is given.
 *
 * The behaviour (`createSweetHerd`) is plain data stepped in time, so the unit test runs it without a screen; the
 * world's part (`createSweetCreatures`) draws the bears, the birds and the ladybugs each as one instanced mesh of our
 * own faceted shape and the leaves as one more, casting no shadow: four draw calls. The caramel butterflies are the
 * game's flock (src/game/butterflies.ts) - the ones the magic brings (./magic.ts): the herd moves them, the flock draws
 * them, so there is one set of butterflies and no draw call more for them.
 */

export type SweetKind = 'bear' | 'butterfly' | 'bird' | 'ladybug';
/** The two actions of each kind, in the order they take turns. */
export const SWEET_ACTIONS = { bear: ['hop', 'dance'], butterfly: ['fly', 'land'], bird: ['perch', 'fly'], ladybug: ['crawl', 'hide'] } as const;
/** What a tap starts: each kind its own. */
export const SWEET_REACTION = { bear: 'wobble', butterfly: 'swirl', bird: 'chirp', ladybug: 'open' } as const;
/** The action a creature is held in (`SweetHerd.hold`). */
export const SWEET_CALM = { bear: 'hop', butterfly: 'land', bird: 'perch', ladybug: 'crawl' } as const;
export type SweetState = (typeof SWEET_ACTIONS)[SweetKind][number] | (typeof SWEET_REACTION)[SweetKind];
/** s each reaction lasts. */
export const REACTION_TIME = { bear: 1.4, butterfly: 1.6, bird: 1.2, ladybug: 1.5 } as const;

export interface SweetCreature {
  readonly kind: SweetKind;
  /** A bear's pair (index into the habitat's `bears`) and its side in it (-1 leads the dance, 1 follows); -1 / 0 else. */
  readonly pair: number; readonly side: number;
  /** A bear's pair's middle, a butterfly's middle of its flight, a bird's first roof, a ladybug's leaf (on its top). */
  readonly home: THREE.Vector3;
  state: SweetState;
  readonly pos: THREE.Vector3;
  heading: number; pitch: number; roll: number;
  t: number; dur: number;
  /** A second clock of the state: a bear's hop, a butterfly's flight to its lollipop and back to its circle, a ladybug's crawl. */
  u: number;
  /** Taps answered. */
  taps: number;
  readonly from: THREE.Vector3; readonly to: THREE.Vector3;
  /** The lollipop a butterfly sits on, the roof a bird is on, the leaf of a ladybug (indices into the habitat's lists). */
  spot: number;
  /** The state a reaction returns to. */
  back: SweetState;
  /** How much the reaction or the action shows now, 0-1 (the bear's wobble, the bird's wings, the ladybug's wings open): the drawing reads it. */
  act: number;
  /** A butterfly's share of its size (the magic brings them, `SweetHerd.share`); a hidden one is not tapped. */
  grow: number;
  shown: boolean;
  held: THREE.Vector3 | null;
}

/** A roof a gingerbread bird sits on: its top, and how steep it falls away from it (m down a metre out). */
export interface Roof { x: number; y: number; z: number; slope: number }
/** A caramel butterfly: the middle of its flight, how far it roams, its colour, the lollipops (perches) nearest it. */
export interface Flight { home: THREE.Vector3; r: number; colour: string; near: readonly number[] }
export interface SweetHabitat {
  ground(x: number, z: number): number;
  /** The middles of the bears' pairs, on the ground. */
  bears: readonly THREE.Vector3[];
  butterflies: readonly Flight[];
  /** Where a butterfly lands: the top of a lollipop's candy (the garden's trees), of a candy elsewhere. */
  perches: readonly THREE.Vector3[];
  roofs: readonly Roof[];
  /** The roof each bird starts on. */
  birds: readonly number[];
  /** The marmalade leaves: their middle on the ground; a ladybug on each. */
  leaves: readonly THREE.Vector3[];
}

export interface SweetHerd {
  readonly all: SweetCreature[];
  update(dt: number, onEvent?: (c: SweetCreature, e: 'sparkle') => void): void;
  /** The creature a tap at `dist` hits (within `reach`), its reaction started; null - none. */
  tap(dist: (c: SweetCreature) => number, reach: number): SweetCreature | null;
  /** Debug: holds `c` at `at` in its calm action until a tap; null lets it go. */
  hold(c: SweetCreature, at: THREE.Vector3 | null): void;
  /** How many butterflies are shown (the magic, a fraction grows the last one); how lively the bears hop, 0-1. */
  share(butterflies: number, lively: number): void;
}

/** m: a bear hops this far from its pair's middle at most; a hop's length, height (all the magic), s it takes. */
export const BEAR_ROAM = 2;
const HOP_STEP = 0.6, HOP_HIGH = 0.3, HOP_T = 0.6;
/** m: the two bears of a pair dance round their middle this far from it; rad/s they go round. */
const DANCE_R = 0.7, DANCE_SPIN = 1.6;
/** How high the bears hop with no magic, of HOP_HIGH: the land is quiet then (world-4.md «Мир оживает»). */
export const BEAR_QUIET = 0.55;
/** m/s a butterfly flies to its lollipop and back; a bird flies from roof to roof; a ladybug crawls. */
const BF_SPEED = 2.2, BIRD_SPEED = 3.2, BUG_SPEED = 0.09;
/** s a butterfly blends from where a reaction left it back into its circle. */
const BF_BLEND = 1.2;
/**
 * How much larger than its shape a marmalade leaf is: big enough for the ladybug on it (the customer, 2026-11-23:
 * "живность мира 4 сделать крупнее" - it must read on the overview from the usual camera).
 */
export const LEAF_K = 1.3;
/** m: a ladybug crawls this far from its leaf's middle; the leaf's top over its middle; how deep a hidden ladybug sits under it. */
export const LEAF_ROAM = 0.3 * LEAF_K, LEAF_TOP = 0.08 * LEAF_K, LEAF_UNDER = 0.08 * LEAF_K;
/** m: a bird sits this far from its roof's top (each bird on its own side). */
const ROOF_SEAT = 0.25;

const ease = (k: number) => k * k * (3 - 2 * k);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function createSweetHerd(h: SweetHabitat, seed = 47): SweetHerd {
  const rnd = mulberry32(seed);
  const range = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const all: SweetCreature[] = [];
  const make = (kind: SweetKind, home: THREE.Vector3, state: SweetState, pair = -1, side = 0): SweetCreature => ({
    kind, pair, side, home: home.clone(), state, pos: home.clone(), heading: rnd() * 6.28, pitch: 0, roll: 0, t: 0, dur: range(2, 5), u: 0,
    taps: 0, from: home.clone(), to: home.clone(), spot: -1, back: state, act: 0, grow: 1, shown: true, held: null,
  });
  // the bears: two a pair, side by side across its middle
  h.bears.forEach((p, i) => {
    for (const side of [-1, 1]) {
      const c = make('bear', p, 'hop', i, side);
      c.pos.x += side * DANCE_R; c.pos.y = h.ground(c.pos.x, c.pos.z); c.u = HOP_T; c.dur = range(3, 6);
      all.push(c);
    }
  });
  // the butterflies: each its own phase and pace round its middle (as the flock's own, src/game/butterflies.ts)
  const pace = new Map<SweetCreature, { phase: number; speed: number; r: number }>();
  h.butterflies.forEach((b) => {
    const c = make('butterfly', b.home, 'fly'); c.dur = range(5, 9); c.u = BF_BLEND;
    pace.set(c, { phase: rnd() * 100, speed: 0.5 + rnd() * 0.5, r: b.r });
    all.push(c);
  });
  const flights = all.filter((c) => c.kind === 'butterfly');
  h.birds.forEach((roof, i) => { const c = make('bird', seat(roof, i), 'perch'); c.spot = roof; c.dur = range(3, 8); all.push(c); });
  h.leaves.forEach((l, i) => { const c = make('ladybug', l.clone().setY(l.y + LEAF_TOP), 'crawl'); c.spot = i; c.dur = 0; all.push(c); });
  const birds = all.filter((c) => c.kind === 'bird');

  /** Where bird `i` sits on roof `r`: a little off its top, down its slope. */
  function seat(r: number, i: number): THREE.Vector3 {
    const roof = h.roofs[r], a = i * 2.1;
    return new THREE.Vector3(roof.x + Math.cos(a) * ROOF_SEAT, roof.y - roof.slope * ROOF_SEAT, roof.z + Math.sin(a) * ROOF_SEAT);
  }
  let clock = 0, lively = 1;
  const tmp = new THREE.Vector3();
  /** A butterfly's point of its circle now. */
  function circleAt(c: SweetCreature, out: THREE.Vector3) {
    const p = pace.get(c)!, a = clock * p.speed + p.phase;
    return out.set(c.home.x + Math.sin(a) * p.r + Math.sin(a * 2.3 + p.phase) * p.r * 0.4, c.home.y + Math.sin(a * 3.1) * 0.35, c.home.z + Math.cos(a * 0.8) * p.r + Math.cos(a * 1.9) * p.r * 0.4);
  }
  const face = (c: SweetCreature, x: number, z: number) => { const dx = x - c.pos.x, dz = z - c.pos.z; if (dx * dx + dz * dz > 1e-8) c.heading = Math.atan2(dx, dz); };
  /** The next hop of a bear: a short step on, turned a little; back toward the middle once it is far from it. */
  function nextHop(c: SweetCreature) {
    c.u = 0; c.from.copy(c.pos);
    let a = c.heading + range(-1.1, 1.1);
    if (Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z) > BEAR_ROAM - HOP_STEP) a = Math.atan2(c.home.x - c.pos.x, c.home.z - c.pos.z) + range(-0.4, 0.4);
    const x = c.pos.x + Math.sin(a) * HOP_STEP, z = c.pos.z + Math.cos(a) * HOP_STEP;
    c.to.set(x, h.ground(x, z), z); c.heading = a;
  }
  /** The leader of a pair calls both to dance (one held or reacting stays out). */
  function dance(pair: number) {
    const d = range(4, 6);
    for (const b of all) {
      if (b.kind !== 'bear' || b.pair !== pair || b.held || b.state !== 'hop') continue;
      b.state = 'dance'; b.t = 0; b.dur = d; b.from.copy(b.pos); b.pos.y = h.ground(b.pos.x, b.pos.z);
    }
  }
  function crawlTo(c: SweetCreature) {
    const leaf = h.leaves[c.spot], a = rnd() * 6.28, r = Math.sqrt(rnd()) * LEAF_ROAM;
    c.from.copy(c.pos); c.to.set(leaf.x + Math.cos(a) * r, leaf.y + LEAF_TOP, leaf.z + Math.sin(a) * r);
    c.u = Math.max(0.5, c.from.distanceTo(c.to) / BUG_SPEED); c.dur = c.u + range(0.8, 2.5); c.t = 0;
    face(c, c.to.x, c.to.z);
  }
  /** A roof near the bird's own, not its own: it flies there. */
  function nextRoof(c: SweetCreature): number {
    const here = h.roofs[c.spot];
    const others = h.roofs.map((r, i) => ({ i, d: Math.hypot(r.x - here.x, r.z - here.z) })).filter((r) => r.i !== c.spot).sort((a, b) => a.d - b.d).slice(0, 3);
    return others.length ? others[Math.floor(rnd() * others.length)].i : c.spot;
  }
  function fly(c: SweetCreature, roof: number) {
    c.state = 'fly'; c.t = 0; c.from.copy(c.pos); c.spot = roof; c.to.copy(seat(roof, birds.indexOf(c)));
    c.dur = Math.max(1.5, c.from.distanceTo(c.to) / BIRD_SPEED);
  }

  return {
    all,
    update(dt, onEvent = () => {}) {
      clock += dt;
      for (const c of all) {
        c.t += dt;
        if (c.held && c.state !== SWEET_REACTION[c.kind]) { c.pos.copy(c.held); c.t = 0; c.act = 0; c.pitch = 0; c.roll = 0; continue; }
        const k = Math.min(1, c.t / Math.max(c.dur, 1e-3));
        switch (c.kind) {
          case 'bear':
            if (c.state === 'hop') {       // short hops about the pair's middle, each its own way
              c.u += dt;
              if (c.u >= HOP_T) nextHop(c);
              const s = Math.min(1, c.u / HOP_T);
              c.pos.lerpVectors(c.from, c.to, s); c.pos.y = h.ground(c.pos.x, c.pos.z) + Math.sin(s * Math.PI) * HOP_HIGH * lively;
              c.act = 0;
              if (k >= 1) { if (c.side < 0) dance(c.pair); else { c.t = 0; c.dur = range(3, 6); } }
            } else if (c.state === 'dance') {   // the two go round their middle face to face, bouncing
              const a = c.t * DANCE_SPIN + (c.side < 0 ? 0 : Math.PI);
              tmp.set(c.home.x + Math.sin(a) * DANCE_R, 0, c.home.z + Math.cos(a) * DANCE_R);
              c.pos.lerpVectors(c.from, tmp, ease(Math.min(1, c.t / 0.6)));
              c.pos.y = h.ground(c.pos.x, c.pos.z) + Math.abs(Math.sin(c.t * 6)) * 0.1 * lively;
              face(c, c.home.x, c.home.z);
              c.act = 0;
              if (k >= 1) { c.state = 'hop'; c.t = 0; c.dur = range(3, 6); c.u = HOP_T; c.pos.y = h.ground(c.pos.x, c.pos.z); }
            } else {                       // the wobble: a jump, and it shakes like jelly as it lands
              c.pos.copy(c.from); c.pos.y = c.from.y + Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.55;
              c.act = 1 - k * 0.7;
              if (k >= 1) end(c);
            }
            break;
          case 'butterfly':
            if (c.state === 'fly') {
              circleAt(c, tmp);
              if (c.u < BF_BLEND) { c.u += dt; tmp.lerpVectors(c.from, tmp, ease(Math.min(1, c.u / BF_BLEND))); }
              face(c, tmp.x, tmp.z); c.pos.copy(tmp);
              if (k >= 1) {
                const near = h.butterflies[flights.indexOf(c)].near;
                c.state = 'land'; c.t = 0; c.from.copy(c.pos); c.spot = near[Math.floor(rnd() * near.length)];
                c.to.copy(h.perches[c.spot]);
                c.u = Math.max(1.5, c.from.distanceTo(c.to) / BF_SPEED); c.dur = c.u * 2 + range(3, 6);
              }
            } else if (c.state === 'land') {   // down to its lollipop, a while there, up and back into its circle
              const go = c.u, stay = c.dur - go;
              if (c.t < go) {
                const s = ease(c.t / go);
                c.pos.lerpVectors(c.from, c.to, s); c.pos.y += Math.sin(s * Math.PI) * 0.6; face(c, c.to.x, c.to.z);
              } else if (c.t < stay) { c.pos.copy(c.to); c.heading += Math.sin(c.t * 0.9) * dt * 0.4; }
              else {
                circleAt(c, tmp); const s = ease(Math.min(1, (c.t - stay) / go));
                tmp.lerpVectors(c.to, tmp, s); tmp.y += Math.sin(s * Math.PI) * 0.6; face(c, tmp.x, tmp.z); c.pos.copy(tmp);
              }
              if (k >= 1) { c.state = 'fly'; c.t = 0; c.dur = range(6, 10); c.u = BF_BLEND; }
            } else {                       // the swirl: round and up about where it was, a scatter of sparks half way
              const r = 0.55 * Math.sin(k * Math.PI), a = k * Math.PI * 4;
              c.pos.set(c.from.x + Math.cos(a) * r, c.from.y + Math.sin(k * Math.PI) * 0.6, c.from.z + Math.sin(a) * r);
              c.heading = -a; c.act = 1;
              if (k >= 0.5 && (c.t - dt) / c.dur < 0.5) onEvent(c, 'sparkle');
              if (k >= 1) end(c);
            }
            break;
          case 'bird':
            if (c.state === 'perch') {     // sits and pecks at its icing now and then, turning about
              c.pos.copy(seat(c.spot, birds.indexOf(c)));
              c.pitch = Math.pow(Math.max(0, Math.sin(c.t * 2.3 + c.home.x)), 8) * 0.6; c.heading += Math.sin(c.t * 0.6) * dt * 0.5;
              c.act = 0;
              if (k >= 1) fly(c, nextRoof(c));
            } else if (c.state === 'fly') {    // over to the roof, in an arc higher the farther it is
              c.pos.lerpVectors(c.from, c.to, ease(k)); c.pos.y += Math.sin(k * Math.PI) * (1.5 + c.from.distanceTo(c.to) * 0.12);
              face(c, c.to.x, c.to.z); c.pitch = 0; c.act = 1;
              if (k >= 1) { c.state = 'perch'; c.t = 0; c.dur = range(4, 9); c.act = 0; }
            } else {                       // the chirp: little hops on the spot, flapping its wings
              c.pos.copy(c.from); c.pos.y += Math.abs(Math.sin(k * Math.PI * 3)) * 0.12;
              c.act = 1; c.pitch = -0.25 * Math.sin(k * Math.PI);
              if (k >= 1) end(c);
            }
            break;
          case 'ladybug': {
            const leaf = h.leaves[c.spot];
            if (c.state === 'crawl') {     // to a spot of its leaf, a pause, on again
              if (c.dur === 0) crawlTo(c);
              c.pos.lerpVectors(c.from, c.to, Math.min(1, c.t / c.u)); c.act = 0;
              if (c.t >= c.dur) { if (rnd() < 0.3) { c.state = 'hide'; c.t = 0; c.dur = range(3, 5); c.from.copy(c.pos); } else crawlTo(c); }
            } else if (c.state === 'hide') {   // under its leaf by its middle, a while, out again on its top
              const s = k < 0.25 ? ease(k / 0.25) : k > 0.75 ? 1 - ease((k - 0.75) / 0.25) : 1;
              tmp.set(leaf.x, leaf.y - LEAF_UNDER, leaf.z);
              c.pos.lerpVectors(c.from, tmp, s); c.act = 0;
              if (k >= 1) { c.state = 'crawl'; c.pos.copy(c.from); c.dur = 0; }
            } else {                       // the wings open and buzz, a little lift, shut again
              c.pos.copy(c.from); c.pos.y += Math.sin(k * Math.PI) * 0.05;
              c.act = Math.sin(k * Math.PI);
              if (k >= 1) end(c);
            }
            break;
          }
        }
      }
    },
    tap(dist, reach) {
      let best: SweetCreature | null = null, bd = reach;
      for (const c of all) { if (!c.shown) continue; const d = dist(c); if (d < bd) { bd = d; best = c; } }
      if (!best) return null;
      const c = best;
      if (c.state !== SWEET_REACTION[c.kind]) {
        c.back = c.state; c.from.copy(c.pos); c.t = 0; c.state = SWEET_REACTION[c.kind]; c.dur = REACTION_TIME[c.kind];
        // a bear mid-hop wobbles from the ground; a hidden ladybug comes out on its leaf to open its wings
        if (c.kind === 'bear' && !c.held) c.from.y = h.ground(c.from.x, c.from.z);
        if (c.kind === 'ladybug' && !c.held) c.from.y = h.leaves[c.spot].y + LEAF_TOP;
      }
      c.taps++;
      return c;
    },
    hold(c, at) {
      if (!at) { c.held = null; return; }
      c.held = at.clone(); c.state = c.back = SWEET_CALM[c.kind]; c.t = 0; c.dur = 1; c.u = 1; c.act = 0;
      c.pos.copy(at); c.from.copy(at); c.pitch = 0; c.roll = 0;
    },
    share(n, k) {
      flights.forEach((c, i) => { c.grow = clamp01(n - i); c.shown = c.grow > 0; });
      lively = BEAR_QUIET + (1 - BEAR_QUIET) * clamp01(k);
    },
  };

  /** A reaction ends where it began: the creature goes on with what it did. */
  function end(c: SweetCreature) {
    c.t = 0; c.act = 0; c.pitch = 0; c.roll = 0; c.pos.copy(c.held ?? c.from);
    if (c.held) { c.state = SWEET_CALM[c.kind]; c.dur = 1; return; }
    if (c.kind === 'bear') { c.state = 'hop'; c.dur = range(2, 4); c.u = HOP_T; }
    else if (c.kind === 'butterfly') { c.state = 'fly'; c.dur = range(5, 8); c.u = 0; c.from.copy(c.pos); }
    else if (c.kind === 'bird') { if (c.back === 'fly') fly(c, c.spot); else { c.state = 'perch'; c.dur = range(3, 7); } }
    else { c.state = 'crawl'; c.dur = 0; }
  }
}

/** m: a bear's pair keeps this clear round its middle (the hops and the dance); a leaf, its ladybug. */
const BEARS_CLEAR = BEAR_ROAM + 0.6, LEAF_CLEAR = 0.9;
/** m: a butterfly's perches are the nearest three to its middle, none this much farther than the nearest. */
const NEAR_MORE = 4;
/** The places of the tasks, the way in and the way back: no creature lives within TASK_CLEAR m of them. */
const TASK_SPOTS: readonly Place[] = [SPAWN, TREE_ARCH, HOUSE_FACADE, HOUSE_DOOR, SCALES_AT, BRIDGE, MILLSTONE, SHRINE];
const TASK_CLEAR = 4.5;

/** Whether a creature can live at (x, z) with `clear` m round it: on the land, off the river, the ways' middles, every collider and the tasks. */
export function freeSpot(x: number, z: number, clear: number, blocked: readonly Collider[]): boolean {
  return Math.hypot(x, z) < HALF - 6 && riverDist(x, z) > RIVER_HALF + 1 + clear && pathDist(x, z) > 1 + clear * 0.5
    && blocked.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + clear) && TASK_SPOTS.every((p) => Math.hypot(p.x - x, p.z - z) > TASK_CLEAR);
}

/**
 * Where the Sweet Land's creatures live: pairs of bears on the marmalade market, in the candy garden and on the square;
 * a butterfly over each character's zone (two each, as the magic had them), landing on the lollipops of the garden and
 * the candies scattered elsewhere; birds on the gingerbread town's roofs and its tower; marmalade leaves with their
 * ladybugs in the garden and the market. `blocked` - the colliders of the land and the characters (built before):
 * bears and leaves stand clear of all of them.
 */
export function sweetHabitat(blocked: readonly Collider[] = colliders, characters: readonly string[] = Object.keys(ZONE_OF)): SweetHabitat {
  const rnd = mulberry32(53);
  const spots = (centre: Place, r: number, n: number, clear: number, gap: number) => {
    const out: THREE.Vector3[] = [];
    for (let tries = 0; out.length < n && tries < 600; tries++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r, x = centre.x + Math.cos(a) * d, z = centre.z + Math.sin(a) * d;
      if (!freeSpot(x, z, clear, blocked) || out.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
      out.push(new THREE.Vector3(x, height(x, z), z));
    }
    return out;
  };
  const sweets = placeSweets(), lollies = [...sweets.lollipops, ...gardenTrees()];
  const g = LANDMARKS.garden;
  const perches = [
    ...lollies.map((t) => new THREE.Vector3(t.x, height(t.x, t.z) + (LOLLY.h + LOLLY.r * LOLLY_TOP) * t.s + 0.05, t.z)),
    new THREE.Vector3(g.x, height(g.x, g.z) + LOLLY_BIG.h + LOLLY_BIG.r * LOLLY_TOP + 0.05, g.z),
    // a candy's top: the dodecahedron of ./scenery.ts, 0.5 m up and 0.49 m over its middle, times its size
    ...sweets.candies.map((c) => new THREE.Vector3(c.x, height(c.x, c.z) + 0.99 * c.s + 0.05, c.z)),
  ];
  const caramel = ['#e8a04a', '#f5c16c', '#d9822b', '#ffd27a', '#c97a3a'];
  const butterflies: Flight[] = Array.from({ length: BUTTERFLIES + BUTTERFLIES_RUBY }, (_, i) => {
    const z = ZONES[ZONE_OF[characters[i % characters.length]]], a = i * 2.4, x = z.x + Math.cos(a) * 4, w = z.z + Math.sin(a) * 4;
    const home = new THREE.Vector3(x, height(x, w) + 1.2 + (i % 3) * 0.3, w);
    // the nearest perches, none much farther than the nearest: a butterfly does not cross the land to sit
    const by = perches.map((p, j) => ({ j, d: Math.hypot(p.x - x, p.z - w) })).sort((p, q) => p.d - q.d);
    const near = by.slice(0, 3).filter((p) => p.d < by[0].d + NEAR_MORE).map((p) => p.j);
    return { home, r: 3.5, colour: caramel[i % caramel.length], near };
  });
  const tower = LANDMARKS.town;
  const roofs: Roof[] = [
    ...townHouses().map((t) => ({ x: t.x, y: height(t.x, t.z) + HOUSE_ROOF.top, z: t.z, slope: HOUSE_ROOF.h / HOUSE_ROOF.r })),
    { x: tower.x, y: height(tower.x, tower.z) + tower.top, z: tower.z, slope: 2.4 / 2.1 },
  ];
  return {
    ground: height,
    bears: [...spots(ZONES.market, 10, 1, BEARS_CLEAR, 5), ...spots(ZONES.garden, 11, 1, BEARS_CLEAR, 5), ...spots(ZONES.square, 11, 1, BEARS_CLEAR, 5)],
    butterflies, perches, roofs,
    birds: [0, 1, 2, 3].map((i) => i % roofs.length),
    leaves: [...spots(ZONES.garden, 11, 3, LEAF_CLEAR, 2.5), ...spots(ZONES.market, 10, 3, LEAF_CLEAR, 2.5)],
  };
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
  if (!g) throw new Error('sweet creatures: the parts did not merge');
  g.computeVertexNormals();
  return g;
}
const tri = (...p: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g; };
const DARK = '#2a1a1a';

/** A gummy bear, 0.5 m, standing on y 0, its front +z: a round body and head (white: the bear's colour), ears, dark eyes, arms (part 1), legs. */
export function bearGeometry(): THREE.BufferGeometry {
  const w = '#ffffff', bits: Bit[] = [
    { geo: new THREE.IcosahedronGeometry(0.13, 1).scale(1, 1.15, 0.85).translate(0, 0.21, 0), colour: w },
    { geo: new THREE.IcosahedronGeometry(0.1, 1).translate(0, 0.42, 0.01), colour: w },
  ];
  for (const s of [1, -1]) {
    bits.push({ geo: new THREE.OctahedronGeometry(0.04, 0).translate(0.07 * s, 0.51, 0), colour: w });
    bits.push({ geo: new THREE.OctahedronGeometry(0.016, 0).translate(0.035 * s, 0.44, 0.095), colour: DARK });
    bits.push({ geo: new THREE.OctahedronGeometry(0.045, 0).scale(1, 1.6, 1).translate(0.13 * s, 0.25, 0.03), colour: w, part: 1 });
    bits.push({ geo: new THREE.OctahedronGeometry(0.055, 0).scale(1, 1.2, 1.1).translate(0.07 * s, 0.06, 0.02), colour: w });
  }
  return shape(bits);
}

/** A gingerbread bird, 0.36 m long, sitting on y 0, its front +z: a brown body and head, white icing eyes, a yellow beak, a tail, two wings (part 1). */
export function birdGeometry(): THREE.BufferGeometry {
  const brown = '#b8763c', bits: Bit[] = [
    { geo: new THREE.OctahedronGeometry(0.12, 1).scale(0.8, 0.75, 1.3).translate(0, 0.12, 0), colour: brown },
    { geo: new THREE.OctahedronGeometry(0.07, 1).translate(0, 0.23, 0.11), colour: brown },
    { geo: new THREE.ConeGeometry(0.025, 0.07, 4).rotateX(Math.PI / 2).translate(0, 0.225, 0.2), colour: '#ffd84a' },
    // the tail: a fan behind, both sides
    { geo: tri(0, 0.13, -0.12, 0.06, 0.17, -0.26, -0.06, 0.17, -0.26, 0, 0.13, -0.12, -0.06, 0.17, -0.26, 0.06, 0.17, -0.26), colour: '#9a5f2c' },
  ];
  for (const s of [1, -1]) {
    bits.push({ geo: new THREE.OctahedronGeometry(0.02, 0).translate(0.045 * s, 0.25, 0.15), colour: '#fffaf2' });
    // a wing from the body's side out: hinged at x = 0.05, y = 0.15 (the shader turns it there)
    bits.push({ geo: tri(0.05 * s, 0.15, 0.07, 0.05 * s, 0.15, -0.09, 0.26 * s, 0.15, -0.05, 0.05 * s, 0.15, 0.07, 0.26 * s, 0.15, -0.05, 0.05 * s, 0.15, -0.09), colour: '#c98a4e', part: 1 });
  }
  return shape(bits);
}

/** A dragee ladybug, 0.17 m long, on y 0, its front +z: two halves of a glossy shell (white: the dragee's colour; part 1) with dark spots, a dark body and head. */
export function ladybugGeometry(): THREE.BufferGeometry {
  const bits: Bit[] = [
    { geo: new THREE.SphereGeometry(0.06, 6, 3).scale(1, 0.4, 1.1).translate(0, 0.02, 0), colour: DARK },
    { geo: new THREE.OctahedronGeometry(0.03, 1).translate(0, 0.025, 0.08), colour: DARK },
  ];
  for (const s of [1, -1]) {
    // the half of the shell on its side (x of `s`): phi from PI/2 is the +x half, from -PI/2 the -x one
    bits.push({ geo: new THREE.SphereGeometry(0.07, 8, 4, s > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI, 0, Math.PI / 2).scale(1, 0.7, 1.2).translate(0, 0.02, 0), colour: '#ffffff', part: 1 });
    for (const [x, z] of [[0.03, 0.03], [0.035, -0.035]]) bits.push({ geo: new THREE.OctahedronGeometry(0.014, 0).translate(x * s, 0.062, z), colour: DARK, part: 1 });
  }
  return shape(bits);
}

/** A marmalade leaf lying on the ground, its middle at y 0: a flat jelly drop with a lighter vein. */
export function leafGeometry(): THREE.BufferGeometry {
  return shape([
    { geo: new THREE.SphereGeometry(LEAF_K, 10, 4).scale(0.42, 0.05, 0.65).translate(0, 0.03 * LEAF_K, 0), colour: '#ffffff' },
    { geo: new THREE.BoxGeometry(0.03 * LEAF_K, 0.012 * LEAF_K, 0.9 * LEAF_K).translate(0, LEAF_TOP + 0.002 * LEAF_K, 0), colour: '#fff6c8' },
  ]);
}

/** The material of a kind: lit, flat, its colour from the vertices times the instance's; `move` - GLSL that moves `transformed`. */
function creatureMaterial(kind: string, move: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true, ...extra });
  m.name = `sweet-${kind}`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float part;\nattribute float aAct;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = instanceMatrix[3].x * 2.3 + instanceMatrix[3].z * 1.7;
      float p1 = step(0.5, part);
      ${move}`);
  };
  m.customProgramCacheKey = () => `sweet-creature-${kind}`;
  return m;
}
const MOVE = {
  // the jelly shakes - a little all the time, hard with aAct (the wobble); the arms wave
  bear: `float wob = sin(uTime * 22.0 + ph) * aAct;
      transformed.y *= 1.0 + 0.22 * wob;
      transformed.xz *= 1.0 - 0.12 * wob;
      transformed.x += sin(uTime * 6.0 + ph + position.y * 8.0) * 0.006;
      transformed.y += p1 * sin(uTime * 8.0 + ph) * 0.03;`,
  // the wings: folded down along the body at rest, flapping with aAct (flying, chirping)
  bird: `float side = sign(position.x);
      float ang = -0.9 * (1.0 - aAct) + sin(uTime * 26.0 + ph) * 0.9 * aAct;
      vec2 w = vec2(abs(position.x) - 0.05, position.y - 0.15);
      vec2 r = vec2(w.x * cos(ang) - w.y * sin(ang), w.x * sin(ang) + w.y * cos(ang));
      transformed.x = mix(transformed.x, side * (0.05 + r.x), p1);
      transformed.y = mix(transformed.y, 0.15 + r.y, p1);`,
  // the halves of the shell open up and out from the back's middle with aAct, buzzing
  ladybug: `float s = sign(position.x);
      float ang = s * aAct * (1.0 + 0.15 * sin(uTime * 40.0));
      vec2 q = vec2(position.x, position.y - 0.02);
      vec2 o = vec2(q.x * cos(ang) - q.y * sin(ang), q.x * sin(ang) + q.y * cos(ang) + 0.02 + aAct * 0.01);
      transformed.xy = mix(transformed.xy, o, p1);`,
  leaf: '',
} as const;

/** Colours per instance: gummy bears red, green, yellow, orange; the dragee ladybugs; the marmalade leaves. */
const BEAR = ['#ff5c6c', '#6fd06a', '#ffd84a', '#ff9a3c', '#c99bff', '#ff8fb1'];
const BUG = ['#e8364f', '#ff8fb1', '#ffb347', '#a8e4ff', '#c99bff', '#ffd84a'];
const LEAF = ['#7bd36a', '#a6e05a', '#5fbf52'];
const SPARK = { bear: '#ffd0dc', butterfly: '#ffd27a', bird: '#fff4d6', ladybug: '#ffe0e8' } as const;
/** The game's sounds (src/core/audio.ts sfx): the land has no recorded creature voice. */
const SOUND = { bear: 'jump', butterfly: 'chime', bird: 'pop', ladybug: 'soft' } as const;
/**
 * How much larger than its shape each kind is drawn: on a phone a ladybug of 0.17 m is a speck (as the sea's step C
 * found), and every kind must read on the overview from the usual camera. The customer's sizes by the heroine's
 * 1.53 m (2026-11-24, the table of the proportions): a bear 0.95 m tall, a bird 0.65 m, a ladybug 0.55 m long on a
 * leaf of 1.6 m (LEAF_K), a butterfly 0.8 m across (BUTTERFLY_SIZE times the flock's 0.6).
 */
export const SIZE = { bear: 1.71, bird: 2.4, ladybug: 2.84, leaf: 1 } as const;
export const BUTTERFLY_SIZE = 1.33;
/** m above a creature's point where its drawn body's middle is (a butterfly is drawn round its point). */
const BODY = { bear: 0.25 * SIZE.bear, butterfly: 0, bird: 0.14 * SIZE.bird, ladybug: 0.03 * SIZE.ladybug } as const;

type Drawn = Exclude<SweetKind, 'butterfly'>;

/** The world's part of the creatures: stepped by the frame; a tap passed to them last; the magic's share. */
export interface SweetCreatures {
  readonly herd: SweetHerd;
  update(dt: number): void;
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  bodyOf(c: SweetCreature): number;
  /**
   * The magic (./magic.ts): `k` (0-1, `alive`) - how high the bears hop; `butterflies` - how many caramel butterflies
   * fly (none with no magic, BUTTERFLIES with four rubies, more with the Ruby). The flock is drawn only while it has one.
   */
  life(k: number, butterflies: number): void;
  readonly meshes: readonly THREE.InstancedMesh[];
}

export function createSweetCreatures(g: Pick<Game, 'scene' | 'sparks' | 'busy' | 'started' | 'touch' | 'flies'>, scope: WorldScope, habitat: SweetHabitat = sweetHabitat()): SweetCreatures {
  const { scene, flies } = g;
  const herd = createSweetHerd(habitat);
  const kinds: { kind: Drawn; list: SweetCreature[]; mesh: THREE.InstancedMesh; act: THREE.InstancedBufferAttribute }[] = [];
  const add = (kind: Drawn, geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, colours: readonly string[]) => {
    const list = herd.all.filter((c) => c.kind === kind), n = Math.max(1, list.length);
    const act = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('aAct', act);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = `sweet-${kind}`; mesh.count = list.length; mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    list.forEach((_, i) => mesh.setColorAt(i, new THREE.Color(colours[i % colours.length])));
    scene.add(mesh);
    kinds.push({ kind, list, mesh, act });
  };
  add('bear', bearGeometry(), creatureMaterial('bear', MOVE.bear, { transparent: true, opacity: 0.88, roughness: 0.25 }), BEAR);
  add('bird', birdGeometry(), creatureMaterial('bird', MOVE.bird, { side: THREE.DoubleSide, roughness: 0.8 }), ['#ffffff']);
  add('ladybug', ladybugGeometry(), creatureMaterial('ladybug', MOVE.ladybug, { roughness: 0.2 }), BUG);
  // the leaves lie still: one instanced mesh, they take the land's shadows
  const leafGeo = leafGeometry();
  const leaves = new THREE.InstancedMesh(leafGeo, creatureMaterial('leaf', MOVE.leaf, { transparent: true, opacity: 0.9, roughness: 0.3 }), Math.max(1, habitat.leaves.length));
  leafGeo.setAttribute('aAct', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, habitat.leaves.length)), 1));
  leaves.name = 'sweet-leaves'; leaves.count = habitat.leaves.length; leaves.castShadow = false; leaves.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), size = new THREE.Vector3(), body = new THREE.Vector3();
  habitat.leaves.forEach((l, i) => {
    leaves.setMatrixAt(i, m.compose(l, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.9), size.setScalar(SIZE.leaf)));
    leaves.setColorAt(i, new THREE.Color(LEAF[i % LEAF.length]));
  });
  scene.add(leaves);

  // the caramel butterflies: the game's flock, moved by the herd (landed: the flock does not fly them itself), no size
  // until the magic brings them
  const first = flies.flies.length;
  const bfs = herd.all.filter((c) => c.kind === 'butterfly').map((c, i) => {
    const f = flies.flies[flies.add(c.home.x, c.home.z, 0, habitat.butterflies[i].colour)];
    f.landed = true; f.scale = 0; f.pos.copy(c.pos);
    return { c, f };
  });
  scope.own(() => { flies.mesh.visible = true; });

  const bodyOf = (c: SweetCreature) => BODY[c.kind];
  const sparks = g.sparks;
  const life = (k: number, n: number) => {
    herd.share(n, k);
    for (const { c, f } of bfs) f.scale = c.grow * BUTTERFLY_SIZE;
    // the flock is drawn only while it has a butterfly of a size: the land has no others
    flies.mesh.visible = first > 0 || bfs.some(({ f }) => f.scale > 0);
  };
  life(0, 0);
  return {
    herd, bodyOf, life, meshes: [...kinds.map((k) => k.mesh), leaves],
    update(dt) {
      herd.update(dt, (c, ev) => { if (ev === 'sparkle') sparks.burst(c.pos, SPARK.butterfly, 14, 1.6); });
      for (const k of kinds) {
        k.list.forEach((c, i) => {
          e.set(c.pitch, c.heading, c.roll, 'YXZ'); q.setFromEuler(e);
          k.mesh.setMatrixAt(i, m.compose(c.pos, q, size.setScalar(SIZE[k.kind])));
          k.act.setX(i, c.act);
        });
        k.mesh.instanceMatrix.needsUpdate = true; k.act.needsUpdate = true;
      }
      for (const { c, f } of bfs) { f.pos.copy(c.pos); f.heading = c.heading; }
    },
    // only while she is free to walk: in a conversation or a cut-scene a tap is not the creatures'
    tap(screenDist) {
      if (g.busy || !g.started()) return false;
      const c = herd.tap((c) => screenDist(body.copy(c.pos).setY(c.pos.y + bodyOf(c))), g.touch ? 70 : 46);
      if (!c) return false;
      sparks.burst(c.pos, SPARK[c.kind], c.kind === 'butterfly' ? 24 : 18, c.kind === 'butterfly' ? 2.6 : 2);
      sfx(SOUND[c.kind]);
      return true;
    },
  };
}
