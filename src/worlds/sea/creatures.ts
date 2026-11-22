import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sfx } from '../../core/audio';
import { uTime } from '../../core/materials';
import { mulberry32 } from '../../core/util';
import type { Game } from '../../game/context';
import { ZONES, type Place } from './layout';
import { placeLife } from './scenery';
import { height } from './terrain';

/**
 * The creatures of the sea that belong to no task (PLAY-11, PLAY-12; docs/worlds/world-3.md, step C of the sea's look),
 * after the first world's (src/worlds/fairy/creatures.ts): schools of little fish swim round over their zones and hide
 * in the corals, jellyfish rise and sink, little crabs run sideways over the floor and dig into the sand, starfish lie
 * and crawl. A tap on one starts its own reaction - a school scatters and gathers, a jellyfish flashes, a crab waves
 * its claws, a starfish turns over -, with sparkles and a sound. Nothing is recorded and nothing is given.
 *
 * The behaviour (`createSeaHerd`) is plain data stepped in time, so the unit test runs it without a screen; the world's
 * part (`createSeaCreatures`) draws every kind as one instanced mesh of our own faceted shape (no file, no licence),
 * casting no shadow: four draw calls for all of them. What moves inside a shape - the fish's tail, the jellyfish's bell
 * and tentacles, the crab's legs and claws - moves in its vertex shader.
 */

export type SeaKind = 'fish' | 'jelly' | 'crab' | 'star';
/** The two actions of each kind, in the order they take turns. */
export const SEA_ACTIONS = { fish: ['school', 'hide'], jelly: ['rise', 'sink'], crab: ['scuttle', 'dig'], star: ['lie', 'crawl'] } as const;
/** What a tap starts: each kind its own. */
export const SEA_REACTION = { fish: 'scatter', jelly: 'flash', crab: 'wave', star: 'flip' } as const;
/** The action a creature is held in (`SeaHerd.hold`). */
export const SEA_CALM = { fish: 'school', jelly: 'rise', crab: 'scuttle', star: 'lie' } as const;
export type SeaState = (typeof SEA_ACTIONS)[SeaKind][number] | (typeof SEA_REACTION)[SeaKind];
/** s each reaction lasts. */
export const REACTION_TIME = { fish: 1.8, jelly: 1.5, crab: 1.4, star: 1.6 } as const;

export interface SeaCreature {
  readonly kind: SeaKind;
  /** The school of a fish (index into the habitat's schools); -1 for the other kinds. */
  readonly school: number;
  /** A fish's place in its school (m, in the school's frame: +z ahead); where the others live. */
  readonly slot: THREE.Vector3;
  readonly home: THREE.Vector3;
  state: SeaState;
  readonly pos: THREE.Vector3;
  heading: number; pitch: number; roll: number;
  t: number; dur: number;
  /** Taps answered. */
  taps: number;
  readonly from: THREE.Vector3; readonly to: THREE.Vector3;
  /** The state a reaction returns to. */
  back: SeaState;
  /** How much the reaction shows now, 0-1 (the jellyfish's flash, the crab's claws up): the drawing reads it. */
  act: number;
  /** Shown in the world: the magic brings more fish (`SeaHerd.share`); a hidden one is not drawn nor tapped. */
  shown: boolean;
  held: THREE.Vector3 | null;
}

/** A school of fish: the middle of its circle, how high it swims, the circle's radius, how many, the coral it hides in. */
export interface School { x: number; z: number; y: number; r: number; n: number; hide: THREE.Vector3; colour: string }
export interface SeaHabitat {
  ground(x: number, z: number): number;
  schools: readonly School[];
  /** Where the jellyfish float (their middle), the crabs and the starfish live (on the floor); `starfish`, never `stars` - those are the save's (src/game/no-penalties.test.ts). */
  jellies: readonly THREE.Vector3[];
  crabs: readonly THREE.Vector3[];
  starfish: readonly THREE.Vector3[];
}

export interface SeaHerd {
  readonly all: SeaCreature[];
  update(dt: number, onEvent?: (c: SeaCreature, e: 'hide' | 'dig') => void): void;
  /** The creature a tap at `dist` hits (within `reach`), its reaction started (a fish's: its whole school's); null - none. */
  tap(dist: (c: SeaCreature) => number, reach: number): SeaCreature | null;
  /** Debug: holds `c` at `at` in its calm action until a tap; null lets it go. */
  hold(c: SeaCreature, at: THREE.Vector3 | null): void;
  /** How much of each school is shown, 0-1 (the magic); at least SCHOOL_LEAST of it. */
  share(k: number): void;
}

/** m/s a school swims round; a crab runs; a starfish crawls. */
const SCHOOL_SPEED = 1.1, CRAB_SPEED = 1.2, STAR_SPEED = 0.12;
/** The part of each school shown with no magic (world-3.md: "рыб мало"). */
export const SCHOOL_LEAST = 0.5;
/** m a jellyfish rises and sinks round its middle; a crab digs this deep; a crab runs this far from home. */
const JELLY_SPAN = 0.8, DIG = 0.3, CRAB_ROAM = 2.5;

const ease = (k: number) => k * k * (3 - 2 * k);

export function createSeaHerd(h: SeaHabitat, seed = 41): SeaHerd {
  const rnd = mulberry32(seed);
  const range = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const all: SeaCreature[] = [];
  const make = (kind: SeaKind, home: THREE.Vector3, state: SeaState, school = -1, slot = new THREE.Vector3()): SeaCreature => ({
    kind, school, slot, home: home.clone(), state, pos: home.clone(), heading: rnd() * 6.28, pitch: 0, roll: 0, t: 0, dur: range(2, 5),
    taps: 0, from: home.clone(), to: home.clone(), back: state, act: 0, shown: true, held: null,
  });
  // the schools: their own state, the fish follow it
  const schools = h.schools.map((s) => ({ s, a: rnd() * 6.28, state: 'school' as SeaState, t: 0, dur: range(6, 10), centre: new THREE.Vector3(), from: new THREE.Vector3(), heading: 0, k: 1 }));
  schools.forEach((sc, i) => {
    circle(sc);
    for (let f = 0; f < sc.s.n; f++) {
      // a loose shoal: rows behind its leader, a little spread up and down
      const row = Math.floor(f / 3), col = (f % 3) - 1;
      const slot = new THREE.Vector3(col * 0.8 + (row % 2) * 0.4, Math.sin(f * 2.4) * 0.45, -row * 0.9 + rnd() * 0.25);
      all.push(make('fish', sc.centre, 'school', i, slot));
    }
  });
  for (const p of h.jellies) { const c = make('jelly', p, 'rise'); c.dur = range(3, 5); all.push(c); }
  for (const p of h.crabs) { const c = make('crab', p, 'scuttle'); c.dur = 0; all.push(c); }
  for (const p of h.starfish) { const c = make('star', p, 'lie'); c.dur = range(3, 8); all.push(c); }
  const fishOf = (i: number) => all.filter((c) => c.school === i);

  function circle(sc: (typeof schools)[number]) {
    const { s } = sc;
    sc.centre.set(s.x + Math.cos(sc.a) * s.r, s.y + Math.sin(sc.a * 2) * 0.35, s.z + Math.sin(sc.a) * s.r);
    sc.heading = Math.atan2(-Math.sin(sc.a), Math.cos(sc.a));
  }
  const tmp = new THREE.Vector3(), prev = new THREE.Vector3();
  /** A fish at its slot of the school's middle, turned with it; `tight` draws the shoal together. */
  function fishAt(c: SeaCreature, sc: (typeof schools)[number], tight: number, time: number) {
    const cos = Math.cos(sc.heading), sin = Math.sin(sc.heading);
    tmp.copy(c.slot).multiplyScalar(tight);
    c.pos.set(sc.centre.x + tmp.x * cos + tmp.z * sin, sc.centre.y + tmp.y + Math.sin(time * 2 + c.slot.x * 5) * 0.05, sc.centre.z - tmp.x * sin + tmp.z * cos);
    c.heading = sc.heading; c.roll = Math.sin(time * 3 + c.slot.z * 4) * 0.12;
  }
  let clock = 0;
  /** A held fish stays at its point, calm, out of its school's moves until a tap scatters it. */
  const pinned = (c: SeaCreature) => { if (!c.held) return false; c.pos.copy(c.held); c.state = 'school'; c.roll = 0; return true; };
  function stepSchool(sc: (typeof schools)[number], i: number, dt: number, ev: (c: SeaCreature, e: 'hide' | 'dig') => void) {
    sc.t += dt;
    const k = Math.min(1, sc.t / sc.dur), fish = fishOf(i);
    prev.copy(sc.centre);
    if (sc.state === 'school') {
      sc.a += (dt * SCHOOL_SPEED) / sc.s.r; circle(sc);
      for (const c of fish) if (!pinned(c)) { c.state = 'school'; fishAt(c, sc, 1, clock); }
      if (k >= 1) { sc.state = 'hide'; sc.t = 0; sc.dur = range(5, 7); sc.from.copy(sc.centre); if (fish[0]) ev(fish[0], 'hide'); }
    } else if (sc.state === 'hide') {
      // down into the coral, round it close and low, and back up to the circle
      if (k < 0.35) sc.centre.lerpVectors(sc.from, sc.s.hide, ease(k / 0.35));
      else if (k < 0.7) sc.centre.set(sc.s.hide.x + Math.cos(clock * 1.5) * 0.5, sc.s.hide.y, sc.s.hide.z + Math.sin(clock * 1.5) * 0.5);
      else {
        sc.a += (dt * SCHOOL_SPEED * 0.3) / sc.s.r;
        tmp.set(sc.s.x + Math.cos(sc.a) * sc.s.r, sc.s.y, sc.s.z + Math.sin(sc.a) * sc.s.r);
        sc.centre.lerpVectors(sc.s.hide, tmp, ease((k - 0.7) / 0.3));
      }
      const dx = sc.centre.x - prev.x, dz = sc.centre.z - prev.z;
      if (dx * dx + dz * dz > 1e-8) sc.heading = Math.atan2(dx, dz);
      const tight = k < 0.35 ? 1 - 0.5 * ease(k / 0.35) : k < 0.7 ? 0.5 : 0.5 + 0.5 * ease((k - 0.7) / 0.3);
      for (const c of fish) if (!pinned(c)) { c.state = 'hide'; fishAt(c, sc, tight, clock); }
      if (k >= 1) { sc.state = 'school'; sc.t = 0; sc.dur = range(6, 10); circle(sc); }
    } else {
      // scattered: each fish darts out from the school's middle along its slot and comes back
      const out = Math.sin(k * Math.PI) * 2.6;
      for (const c of fish) {
        if (c.held && c.state !== 'scatter') continue;
        const base = c.held ?? c.from;
        tmp.copy(c.from).sub(sc.centre).setY(0);
        if (tmp.lengthSq() < 1e-4) tmp.set(Math.cos(c.slot.x * 7 + c.slot.z), 0, Math.sin(c.slot.x * 7 + c.slot.z));
        tmp.normalize();
        c.pos.copy(base).addScaledVector(tmp, out); c.pos.y += Math.sin(k * Math.PI) * (c.slot.y + 0.4);
        c.heading = Math.atan2(tmp.x, tmp.z) + (k > 0.5 ? Math.PI : 0); c.roll = 0;
        c.state = 'scatter';
      }
      if (k >= 1) {
        sc.state = 'school'; sc.t = 0; sc.dur = range(5, 8);
        for (const c of fish) { c.state = 'school'; if (c.held) c.pos.copy(c.held); }
      }
    }
  }
  function roamTo(c: SeaCreature) {
    const a = rnd() * 6.28, r = rnd() * CRAB_ROAM;
    c.from.copy(c.pos);
    const x = c.home.x + Math.cos(a) * r, z = c.home.z + Math.sin(a) * r;
    c.to.set(x, h.ground(x, z), z);
  }

  return {
    all,
    update(dt, onEvent = () => {}) {
      clock += dt;
      schools.forEach((sc, i) => stepSchool(sc, i, dt, onEvent));
      for (const c of all) {
        if (c.kind === 'fish') continue;
        c.t += dt;
        if (c.held && c.state !== SEA_REACTION[c.kind]) { c.pos.copy(c.held); c.t = 0; c.act = 0; continue; }
        const k = Math.min(1, c.t / Math.max(c.dur, 1e-3));
        switch (c.state) {
          case 'rise': case 'sink': {     // a jellyfish pulses up, drifts down slowly
            const lo = c.home.y - JELLY_SPAN, hi = c.home.y + JELLY_SPAN;
            const y = c.state === 'rise' ? lo + (hi - lo) * ease(k) + Math.max(0, Math.sin(c.t * 3)) * 0.06 : hi - (hi - lo) * k;
            c.pos.set(c.home.x + Math.sin(c.t * 0.3 + c.home.z) * 0.4, y, c.home.z + Math.cos(c.t * 0.25 + c.home.x) * 0.4);
            c.roll = Math.sin(c.t * 0.8) * 0.12; c.act = Math.max(0, c.act - dt);
            if (k >= 1) { c.state = c.state === 'rise' ? 'sink' : 'rise'; c.t = 0; c.dur = c.state === 'rise' ? range(3, 5) : range(5, 7); }
            break;
          }
          case 'scuttle': {               // sideways over the sand to a spot by its home, a pause, again
            if (c.dur === 0) { roamTo(c); c.dur = Math.max(0.8, c.from.distanceTo(c.to) / CRAB_SPEED) + range(0.8, 2); c.t = 0; }
            const go = Math.min(1, c.t / Math.max(0.1, c.from.distanceTo(c.to) / CRAB_SPEED));
            c.pos.lerpVectors(c.from, c.to, ease(go)); c.pos.y = h.ground(c.pos.x, c.pos.z);
            // it runs sideways: it faces across its way
            if (c.from.distanceToSquared(c.to) > 1e-4) c.heading = Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z) + Math.PI / 2;
            c.act = 0;
            if (k >= 1) { if (rnd() < 0.25) { c.state = 'dig'; c.t = 0; c.dur = range(2.5, 3.5); c.from.copy(c.pos); onEvent(c, 'dig'); } else c.dur = 0; }
            break;
          }
          case 'dig': {                   // into the sand to its eyes, a while, out again
            const down = k < 0.25 ? ease(k / 0.25) : k > 0.75 ? 1 - ease((k - 0.75) / 0.25) : 1;
            c.pos.copy(c.from); c.pos.y = h.ground(c.from.x, c.from.z) - DIG * down;
            c.roll = Math.sin(c.t * 25) * 0.08 * (k < 0.25 || k > 0.75 ? 1 : 0);
            if (k >= 1) { c.state = 'scuttle'; c.dur = 0; c.roll = 0; c.pos.y = h.ground(c.pos.x, c.pos.z); }
            break;
          }
          case 'lie':
            if (k >= 1) { c.state = 'crawl'; c.t = 0; c.from.copy(c.pos); const a = rnd() * 6.28, r = rnd() * 0.8; const x = c.home.x + Math.cos(a) * r, z = c.home.z + Math.sin(a) * r; c.to.set(x, h.ground(x, z), z); c.dur = Math.max(2, c.from.distanceTo(c.to) / STAR_SPEED); }
            break;
          case 'crawl':
            c.pos.lerpVectors(c.from, c.to, k); c.pos.y = h.ground(c.pos.x, c.pos.z); c.heading += dt * 0.1;
            if (k >= 1) { c.state = 'lie'; c.t = 0; c.dur = range(4, 8); }
            break;
          case 'flash':                   // the jellyfish lights up and gives a little jump
            c.act = 1 - k * 0.6; c.pos.copy(c.from); c.pos.y += Math.sin(k * Math.PI) * 0.4;
            if (k >= 1) end(c);
            break;
          case 'wave':                    // the crab rears and waves its claws
            c.act = Math.sin(k * Math.PI); c.pos.copy(c.from); c.pos.y = c.from.y + Math.abs(Math.sin(k * Math.PI * 4)) * 0.05;
            if (k >= 1) end(c);
            break;
          case 'flip':                    // the starfish jumps and turns over in the water, lands as it lay
            c.pos.copy(c.from); c.pos.y += Math.sin(k * Math.PI) * 0.45; c.roll = k * Math.PI * 2;
            if (k >= 1) end(c);
            break;
        }
      }
    },
    tap(dist, reach) {
      let best: SeaCreature | null = null, bd = reach;
      for (const c of all) { if (!c.shown) continue; const d = dist(c); if (d < bd) { bd = d; best = c; } }
      if (!best) return null;
      const c = best;
      if (c.kind === 'fish') {
        const sc = schools[c.school];
        if (sc.state !== 'scatter') { sc.state = 'scatter'; sc.t = 0; sc.dur = REACTION_TIME.fish; for (const f of fishOf(c.school)) { f.from.copy(f.pos); f.back = f.state; f.state = 'scatter'; } }
      } else if (c.state !== SEA_REACTION[c.kind]) {
        c.back = c.state; c.from.copy(c.pos); c.t = 0; c.state = SEA_REACTION[c.kind]; c.dur = REACTION_TIME[c.kind];
        // a crab dug in comes out of the sand to wave
        if (c.kind === 'crab') c.from.y = h.ground(c.from.x, c.from.z);
      }
      c.taps++;
      return c;
    },
    hold(c, at) {
      if (!at) { c.held = null; return; }
      c.held = at.clone(); c.state = c.back = SEA_CALM[c.kind]; c.t = 0; c.dur = 1; c.act = 0;
      c.pos.copy(at); c.from.copy(at); c.pitch = 0; c.roll = 0;
    },
    share(k) {
      const s = Math.max(SCHOOL_LEAST, Math.min(1, k));
      schools.forEach((sc, i) => { const fish = fishOf(i), n = Math.ceil(fish.length * s); fish.forEach((f, j) => { f.shown = j < n; }); sc.k = s; });
    },
  };

  /** A reaction ends where it began: the creature goes on with what it did. */
  function end(c: SeaCreature) {
    c.state = c.back; c.t = 0; c.roll = 0; c.act = 0; c.pos.copy(c.from);
    if (c.kind === 'crab') { c.state = 'scuttle'; c.dur = 0; }
    else if (c.kind === 'star') { c.state = 'lie'; c.dur = range(3, 6); c.pos.y = h.ground(c.pos.x, c.pos.z); }
    else if (c.kind === 'jelly') { c.state = 'sink'; c.dur = range(5, 7); }
  }
}

/** A point at `p` moved by (dx, dz), on the floor (`y` 0) or `y` m over it. */
const near = (p: Place, dx: number, dz: number, y = 0) => new THREE.Vector3(p.x + dx, height(p.x + dx, p.z + dz) + y, p.z + dz);

/**
 * Where the sea's creatures live: four schools over the reef, the garden, the square and the ship, each hiding in the
 * coral nearest its circle; jellyfish over the dark trench (where they glow), by the castle's gate and in the garden;
 * crabs by the grotto, the ship and the square; starfish in the garden, on the reef and the square. Off the characters.
 */
export function seaHabitat(): SeaHabitat {
  const life = placeLife(), hides = [...life.reef, ...life.anemones, ...life.corals];
  const school = (p: Place, dx: number, dz: number, r: number, n: number, colour: string): School => {
    const x = p.x + dx, z = p.z + dz;
    let best = hides[0], bd = Infinity;
    for (const t of hides) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } }
    return { x, z, y: height(x, z) + 2.2, r, n, colour, hide: new THREE.Vector3(best.x, height(best.x, best.z) + 0.9, best.z) };
  };
  return {
    ground: height,
    schools: [
      school(ZONES.reef, -6, 5, 3.5, 12, '#ffb347'),
      school(ZONES.garden, 5, -4, 3, 10, '#7fe0ff'),
      school(ZONES.square, -6, -6, 3.5, 10, '#ffe066'),
      school(ZONES.ship, -7, 3, 3, 8, '#c8a6ff'),
    ],
    jellies: [
      ...[0, 1, 2, 3].map((i) => near(ZONES.trench, Math.cos(i * 1.6) * 5, Math.sin(i * 1.6) * 5, 3 + (i % 2) * 0.7)),
      near(ZONES.gate, -8, -3, 3.2), near(ZONES.gate, 8, -3, 3.6),
      near(ZONES.garden, -6, -6, 3), near(ZONES.garden, 4, 6, 3.5),
    ],
    crabs: [near(ZONES.grotto, -4, 3), near(ZONES.grotto, 2, 5), near(ZONES.grotto, 1, -4), near(ZONES.ship, 3, 2), near(ZONES.ship, -4, -2), near(ZONES.square, 4, 4)],
    starfish: [near(ZONES.garden, 2, 3), near(ZONES.garden, -3, -2), near(ZONES.garden, 5, -1), near(ZONES.reef, 3, -3), near(ZONES.reef, -2, 4), near(ZONES.square, -3, 3)],
  };
}

// ---- the shapes: positions, a colour, which part moves (`part`) and how much shines (`glow`) in each vertex ----

interface Bit { geo: THREE.BufferGeometry; colour: string; part?: number; glow?: number }
function shape(bits: Bit[]): THREE.BufferGeometry {
  const gs = bits.map(({ geo, colour, part = 0, glow = 0 }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    const n = g.getAttribute('position').count, c = new THREE.Color(colour);
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
    g.setAttribute('part', new THREE.Float32BufferAttribute(new Array<number>(n).fill(part), 1));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(new Array<number>(n).fill(glow), 1));
    return g;
  });
  const g = mergeGeometries(gs);
  if (!g) throw new Error('sea creatures: the parts did not merge');
  g.computeVertexNormals();
  return g;
}
const tri = (...p: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g; };

/** A little fish, 0.34 m, +z ahead, its middle at the origin: a faceted body (white: the school's colour), dark eyes, a tail (part 1) and a fin. */
export function fishGeometry(): THREE.BufferGeometry {
  const body = new THREE.OctahedronGeometry(0.1, 1).scale(0.5, 0.85, 1.6);
  const eye = (s: number) => new THREE.OctahedronGeometry(0.018, 0).translate(0.04 * s, 0.025, 0.09);
  return shape([
    { geo: body, colour: '#ffffff' },
    { geo: eye(1), colour: '#24324a' }, { geo: eye(-1), colour: '#24324a' },
    // the tail: a fan behind, both sides
    { geo: tri(0, 0, -0.14, 0, 0.08, -0.25, 0, -0.08, -0.25, 0, 0, -0.14, 0, -0.08, -0.25, 0, 0.08, -0.25), colour: '#ffffff', part: 1 },
    { geo: tri(0, 0.07, 0.02, 0, 0.13, -0.07, 0, 0.06, -0.08, 0, 0.07, 0.02, 0, 0.06, -0.08, 0, 0.13, -0.07), colour: '#ffffff' },
  ]);
}

/** A jellyfish, its bell's rim at y 0: a bell (it shines, tinted by the instance) and six tentacles hanging (part 1). */
export function jellyGeometry(): THREE.BufferGeometry {
  const bell = new THREE.SphereGeometry(0.3, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1);
  const bits: Bit[] = [{ geo: bell, colour: '#ffffff', glow: 1 }];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    bits.push({ geo: new THREE.PlaneGeometry(0.035, 0.55, 1, 3).translate(0, -0.27, 0).rotateY(-a).translate(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17), colour: '#ffffff', part: 1, glow: 0.6 });
  }
  return shape(bits);
}

/** A little crab, 0.4 m across, standing on y 0, its front +z: a red shell, eyes on stalks, two claws (part 1), six legs (part 2). */
export function crabGeometry(): THREE.BufferGeometry {
  const red = '#e8573f', bits: Bit[] = [{ geo: new THREE.IcosahedronGeometry(0.15, 0).scale(1.3, 0.55, 1).translate(0, 0.12, 0), colour: red }];
  for (const s of [1, -1]) {
    bits.push({ geo: new THREE.CylinderGeometry(0.012, 0.012, 0.08, 3).translate(0.05 * s, 0.2, 0.09), colour: red });
    bits.push({ geo: new THREE.OctahedronGeometry(0.03, 0).translate(0.05 * s, 0.245, 0.09), colour: '#1e2633' });
    bits.push({ geo: new THREE.OctahedronGeometry(0.085, 0).scale(1, 0.7, 1.4).translate(0.23 * s, 0.14, 0.15), colour: '#f26d50', part: 1 });
    for (let l = 0; l < 3; l++) {
      bits.push({ geo: new THREE.ConeGeometry(0.022, 0.28, 3).rotateZ(s * (Math.PI / 2 + 0.6)).translate(0.25 * s, 0.07, -0.1 + l * 0.09), colour: '#c9452f', part: 2 });
    }
  }
  return shape(bits);
}

/** A starfish, 0.46 m across, lying on y 0: five arms, a low ridge along them. */
export function starGeometry(): THREE.BufferGeometry {
  const p: number[] = [], rim: [number, number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.085 : 0.23;
    rim.push([Math.cos(a) * r, i % 2 ? 0.035 : 0.015, Math.sin(a) * r]);
  }
  for (let i = 0; i < 10; i++) {
    const a = rim[i], b = rim[(i + 1) % 10];
    p.push(0, 0.06, 0, ...b, ...a);   // the top, facing up
    p.push(0, 0, 0, ...a, ...b);      // the underside
  }
  return shape([{ geo: tri(...p), colour: '#ffffff' }]);
}

/** The material of a kind: lit, flat, its colour from the vertices times the instance's; `move` - GLSL that moves `transformed`. */
function creatureMaterial(kind: SeaKind, move: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true, ...extra });
  m.name = `sea-${kind}`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float part;\nattribute float glow;\nattribute float aAct;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = instanceMatrix[3].x * 2.3 + instanceMatrix[3].z * 1.7;
      float p1 = step(0.5, part) * step(part, 1.5), p2 = step(1.5, part);
      ${move}
      vGlow = glow * aAct;`);
    sh.fragmentShader = 'varying float vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow;');
  };
  m.customProgramCacheKey = () => `sea-creature-${kind}`;
  return m;
}
const MOVE = {
  // the back of the body and the tail sway side to side
  fish: 'float back = max(0.0, -position.z - 0.02); transformed.x += sin(uTime * 11.0 + ph) * back * (0.5 + p1 * 0.9);',
  // the bell pulses, the tentacles wave below it
  jelly: `float pl = sin(uTime * 3.0 + ph);
      transformed.xz *= 1.0 + 0.1 * pl * (1.0 - p1);
      transformed.y *= 1.0 - 0.08 * pl * (1.0 - p1);
      transformed.x += sin(uTime * 2.0 + ph + position.y * 5.0) * (-position.y) * 0.25 * p1;`,
  // the legs tap the sand; the claws go up and shake with aAct (the wave)
  crab: `transformed.y += 0.015 * max(0.0, sin(uTime * 16.0 + position.z * 30.0 + ph)) * p2;
      transformed.y += aAct * (0.13 + 0.04 * sin(uTime * 18.0)) * p1;
      transformed.x += sign(position.x) * aAct * 0.04 * p1;`,
  star: '',
} as const;

/** Colours per instance: the jellyfish soft pink, lilac and turquoise; the starfish warm. The fish take their school's. */
const JELLY = ['#ffb3de', '#c9b2ff', '#9ff0ea', '#ffd0ef'];
const STAR = ['#ff8a5c', '#ffb347', '#ff6f91', '#f6d36b'];
const SPARK = { fish: '#d6f6ff', jelly: '#ffe6fb', crab: '#ffd8c8', star: '#fff2b8' } as const;
const SOUND = { fish: 'pop', jelly: 'chime', crab: 'jump', star: 'soft' } as const;
/**
 * How much larger than its shape each kind is drawn: on a phone's screen a fish of 0.34 m and a crab of 0.4 m were
 * specks (the pictures of step C, 2026-11-22) - drawn 0.6 m both.
 */
export const SIZE = { fish: 1.8, jelly: 1.2, crab: 1.6, star: 1.4 } as const;
/** m above a creature's point where its drawn body's middle is (fish and jellyfish are drawn round their point). */
const BODY = { fish: 0, jelly: 0.12 * SIZE.jelly, crab: 0.12 * SIZE.crab, star: 0.03 * SIZE.star } as const;
/** How much a jellyfish shines with no flash: with no magic and with all of it (world-3.md: they glow at 3-4 pearls). */
export const JELLY_GLOW: readonly [number, number] = [0.25, 0.9];

/** The world's part of the creatures: stepped by the frame; a tap passed to them last; the magic's share and glow. */
export interface SeaCreatures {
  readonly herd: SeaHerd;
  update(dt: number): void;
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  bodyOf(c: SeaCreature): number;
  /** The magic (0-1, `alive`): more fish in the schools, the jellyfish brighter. */
  life(k: number): void;
  readonly meshes: readonly THREE.InstancedMesh[];
}

export function createSeaCreatures(g: Pick<Game, 'scene' | 'sparks' | 'busy' | 'started' | 'touch' | 'hero'>, habitat: SeaHabitat = seaHabitat()): SeaCreatures {
  const { scene } = g;
  const herd = createSeaHerd(habitat);
  const of = (k: SeaKind) => herd.all.filter((c) => c.kind === k);
  const kinds: { kind: SeaKind; list: SeaCreature[]; mesh: THREE.InstancedMesh; act: THREE.InstancedBufferAttribute }[] = [];
  const add = (kind: SeaKind, geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, colour: (c: SeaCreature, i: number) => string) => {
    const list = of(kind), n = Math.max(1, list.length);
    const act = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('aAct', act);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = `sea-${kind}`; mesh.count = list.length; mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    list.forEach((c, i) => mesh.setColorAt(i, new THREE.Color(colour(c, i))));
    scene.add(mesh);
    kinds.push({ kind, list, mesh, act });
  };
  add('fish', fishGeometry(), creatureMaterial('fish', MOVE.fish), (c) => habitat.schools[c.school].colour);
  add('jelly', jellyGeometry(), creatureMaterial('jelly', MOVE.jelly, { transparent: true, opacity: 0.85, side: THREE.DoubleSide, roughness: 0.3 }), (_, i) => JELLY[i % JELLY.length]);
  add('crab', crabGeometry(), creatureMaterial('crab', MOVE.crab), () => '#ffffff');
  add('star', starGeometry(), creatureMaterial('star', MOVE.star, { side: THREE.DoubleSide }), (_, i) => STAR[i % STAR.length]);

  let glow = JELLY_GLOW[0];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), size = new THREE.Vector3(), body = new THREE.Vector3();
  const colour = new THREE.Color();
  const bodyOf = (c: SeaCreature) => BODY[c.kind];
  const sparks = g.sparks;
  return {
    herd, bodyOf, meshes: kinds.map((k) => k.mesh),
    update(dt) {
      herd.update(dt, (c, ev) => {
        // a crab digging in throws a little sand, near her only
        if (ev === 'dig' && c.pos.distanceToSquared(g.hero.root.position) < 30 * 30) sparks.burst(c.pos, '#f3e2b8', 6, 0.8);
      });
      for (const k of kinds) {
        // only the shown ones, packed at the front: the rest are not drawn
        let i = 0;
        for (const c of k.list) {
          if (!c.shown) continue;
          e.set(c.pitch, c.heading, c.roll, 'YXZ'); q.setFromEuler(e);
          k.mesh.setMatrixAt(i, m.compose(c.pos, q, size.setScalar(SIZE[k.kind])));
          k.act.setX(i, k.kind === 'jelly' ? glow + c.act * 1.6 : c.act);
          if (k.kind === 'fish') k.mesh.setColorAt(i, colour.set(habitat.schools[c.school].colour));
          i++;
        }
        k.mesh.count = i;
        k.mesh.instanceMatrix.needsUpdate = true; k.act.needsUpdate = true;
        if (k.mesh.instanceColor) k.mesh.instanceColor.needsUpdate = true;
      }
    },
    // only while she is free to swim: in a conversation or a cut-scene a tap is not the creatures'
    tap(screenDist) {
      if (g.busy || !g.started()) return false;
      const c = herd.tap((c) => screenDist(body.copy(c.pos).setY(c.pos.y + bodyOf(c))), g.touch ? 70 : 46);
      if (!c) return false;
      sparks.burst(c.pos, SPARK[c.kind], c.kind === 'fish' ? 24 : 18, c.kind === 'fish' ? 3 : 2.2);
      sfx(SOUND[c.kind]);
      return true;
    },
    life(k) {
      herd.share(SCHOOL_LEAST + (1 - SCHOOL_LEAST) * k);
      glow = JELLY_GLOW[0] + (JELLY_GLOW[1] - JELLY_GLOW[0]) * k;
    },
  };
}
