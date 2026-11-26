import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { createRng } from '../../core/rng';
import type { Game } from '../../game/context';
import type { Spot } from '../../game/player';
import { levelFor } from '../../game/skills';
import type { WorldScope } from '../../game/scope';
import type { Npc, WorldTask } from '../../game/world';
import { forget, keep, keptOf } from '../../game/worldtasks/kept';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { generateWinds, showWindsInWorld, windsLevel, type WindsSpec } from '../../game/worldtasks/winds';
import { tf } from '../../ui/strings';
import { CAT_DECK, HELM } from './landmarks';
import { FLIGHT, GANGWAY, ISLANDS, ISLET_GANGWAY, SHIP, SHIP_FAR, WINDS_AT } from './layout';
import { wordsAfter } from './task-words';
import { height } from './terrain';

/**
 * Veterok's route of the winds (WORLD-23, src/game/worldtasks/winds.ts) as the third step of his chain, and the airship's
 * flight it starts (WORLD-05). He asks; she walks to the map's table on the pier by the gangway, and the task opens
 * there. Made, the step is done and the ship takes off at once. The route is written to no skill (the customer's decision 2026-11-18): the conversation is handed no result.
 * The arrows placed are kept in the world (`ws.tasks.winds`) while it is not solved.
 *
 * The flight (the customer's decision 2026-11-18 «а»: the ship flies by itself, a reward to watch; the lead's of
 * 2026-11-25 on its shape): once the route is made the ship takes off at once with her and the cat on its deck, along a
 * fixed way (layout.ts FLIGHT) - no bank, its turns smooth, the camera gliding behind it, slowing a little to land; a tap
 * flies it twice as fast; it cannot be skipped. At the far islet's mooring she steps off; from then on the gangways of
 * the pier and of the islet fly her there and back as often as she likes. Before the route is made the ship stays
 * moored and its gangway has no button. A flight left in the middle (the game closed) opens on the island it flew to,
 * never in the air (`ws.tasks.ship`: the island it flies to while it flies).
 */

/** The ids of the steps: the route (not `house`: the number house stood in for it in step 1), the flight in the save. */
export const WINDS_STEP = 'winds', FLIGHT_KEPT = 'ship';
/** m: the table this near opens the map; this far she must go to open it again. */
export const OPEN_R = 2.2, AGAIN_R = 6;
/** m/s: the ship's speed along its way (twice it with a tap); m over the deck height at the pier it cruises at. */
export const FLIGHT_SPEED = 4.5, CRUISE = 6;
/** m of the way's end over which it slows down to land (to 40 % of its speed). */
export const LANDING_RUN = 8;

/** The flight's way as a smooth curve: the plan's points, the height rising from the mooring and coming down to the other. */
export function flightCurve(out: boolean): THREE.CatmullRomCurve3 {
  const deck = ISLANDS.pier.top - 1.4, far = ISLANDS.far.top - 1.4;
  const pts = FLIGHT.map((p, i) => {
    const k = i / (FLIGHT.length - 1), up = Math.sin(k * Math.PI);
    return new THREE.Vector3(p.x, deck + (far - deck) * k + up * CRUISE, p.z);
  });
  return new THREE.CatmullRomCurve3(out ? pts : pts.reverse(), false, 'centripetal');
}
/** s of game time a flight takes without a tap: its length at the speed, the landing run slower. */
export function flightSeconds(out = true): number {
  const len = flightCurve(out).getLength();
  return (len - LANDING_RUN) / FLIGHT_SPEED + LANDING_RUN / (FLIGHT_SPEED * 0.7);
}

export interface WindsStep extends WorldTask {
  readonly spec: WindsSpec | null;
  /** Whether the route was made: the ship flies. */
  readonly flies: boolean;
  /** Whether the ship is moored at the far islet now. */
  readonly far: boolean;
  /** Whether a flight is on. */
  readonly flying: boolean;
  /** The spots of the two gangways (the ship flies from them once the route is made). */
  readonly spots: readonly Spot[];
  update(dt: number, time: number, canMove: boolean): void;
  goal(): THREE.Vector3 | null;
  /** A tap while flying makes it faster (true: taken). */
  tap(): boolean;
  /** The walkthrough's move: to the table (the map opens), after a close a step away first. False when not on. */
  cheat(): boolean;
  /** Flies her there (`out`) or back now; settles with the game seconds the flight took. */
  fly(out: boolean): Promise<number>;
  opened(done: boolean): void;
}

/** The cat's hints of the route of the winds, by rung (the draft 2026-11-18). */
export const ROUTE_HINTS = ['sky_route_hint_1', 'sky_route_hint_2', 'sky_route_hint_3'] as const;

export function createWinds(g: Game, player: WorldTaskPlayer, scope: WorldScope, ship: THREE.Object3D): WindsStep {
  const { scene, hero } = g;
  const at = { ...WINDS_AT, y: height(WINDS_AT.x, WINDS_AT.z) };
  const table = new THREE.Vector3(WINDS_AT.x, at.y, WINDS_AT.z - 2.4);
  let spec: WindsSpec | null = null, flies = g.ws.flags.ship_flies === true, far = g.ws.flags.ship_far === true;
  let on = false, owner: Npc | null = null, finished: () => void = () => {}, armed = true, playing = false;
  let flight: { curve: THREE.CatmullRomCurve3; s: number; len: number; t0: number; fast: boolean; out: boolean; end: (t: number) => void } | null = null;
  const WAY = 't_pattern';
  const bubble = () => { g.speech.caption({ key: WAY, pri: 'story', hold: 0, speaker: '🧭', text: tf('sky_winds_way', {}) }); };
  const moor = () => {
    const m = far ? SHIP_FAR : SHIP;
    ship.position.set(m.x, (far ? ISLANDS.far.top : ISLANDS.pier.top) - 1.4, m.z);
    ship.rotation.set(0, SHIP.yaw, 0);
  };
  // a point of the airship's own metres in the world, the airship at `p` turned as it is now
  const deck = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const onDeck = (at: { x: number; y: number; z: number }, p: THREE.Vector3) => deck.set(at.x, at.y, at.z).applyAxisAngle(up, ship.rotation.y).add(p);
  const stand = (p: { x: number; z: number }) => { hero.root.position.set(p.x, height(p.x, p.z), p.z); g.cat.root.position.set(p.x + 1, height(p.x + 1, p.z - 0.6), p.z - 0.6); };
  moor();
  // a flight left in the middle: she is on the island it flew to, the ship moored there
  const kf = keptOf(g.ws, FLIGHT_KEPT);
  if (kf.length === 1) { far = kf[0] === 1; g.ws.flags.ship_far = far; forget(g.ws, FLIGHT_KEPT); moor(); stand(far ? ISLET_GANGWAY : GANGWAY); g.persist(); }

  function fly(out: boolean): Promise<number> {
    if (flight) return Promise.resolve(0);
    // the island it flies to is stored first: the game closed in the air opens there
    keep(g.ws, FLIGHT_KEPT, [out ? 1 : 0]); g.persist();
    g.busy = true;
    (hero as { play?: (name: string, fade: number) => void }).play?.('Idle', 0.25);
    sfx('chime');
    // Veterok calls her aboard (out) or says it knows the way back; on the first flight out the cat, up in the air
    void g.speech.line(out ? 'veterok_ship_board' : 'veterok_ship_back', 'story', 0, '🧭')
      .then(() => { if (out && flight && !g.ws.flags.ship_flown) { g.ws.flags.ship_flown = true; g.persist(); return g.speech.line('sky_ship_fly', 'story'); } });
    const curve = flightCurve(out);
    return new Promise((resolve) => {
      flight = { curve, s: 0, len: curve.getLength(), t0: -1, fast: false, out, end: (t) => {
        flight = null; far = out; g.ws.flags.ship_far = far; forget(g.ws, FLIGHT_KEPT);
        moor(); stand(out ? ISLET_GANGWAY : GANGWAY);
        g.camTask = null; g.busy = false;
        sfx('chime');
        g.persist();
        // landed on the far islet: Veterok (the draft's f5_ship_land)
        if (out) void g.speech.line('veterok_ship_land', 'story', 0, '🧭');
        resolve(t);
      } };
    });
  }

  function play() {
    armed = false; playing = true;
    g.speech.caption(null);
    // the map of the step (stored at its start: ./start below), its arrows placed so far
    if (keptOf(g.ws, WINDS_STEP).length < 2) newMap();
    const kept = keptOf(g.ws, WINDS_STEP), seed = kept[0], level = kept[1];
    spec = generateWinds(level, createRng(`winds:${seed}`));
    const hooks = g.hooksFor('🧭');
    const sub = tf('sky_winds_way', {});
    // Veterok's own words over the map (the draft's f5_route_*): his ask in place of the shared question, and his "a storm
    // cloud! back we go" in place of the shared "try again" when a launch does not get there (the soft sound kept)
    // the cat's three hints of the route (the draft's f5_route_hint_*), one a rung in their order, in place of the shared
    // ones: look where the clouds are, trace the way, the arrow that glows
    let rung = 0;
    const show = showWindsInWorld(scene, spec, at, {
      ...hooks,
      hint: () => hooks.hint(ROUTE_HINTS[Math.min(rung++, ROUTE_HINTS.length - 1)]),
      prompt: (key) => { void g.speech.line(key === 't_pattern' ? 'veterok_route_start' : key, 'task', 0, '🧭', key === 't_pattern' ? undefined : sub); },
      wrong: () => { sfx('soft'); return g.speech.line('veterok_route_stop', 'task', 0, '🧭'); },
    },
      // Veterok sends the little ship off (the draft's f5_route_go)
      { reach: g.touch ? 70 : 46, scope, kept: kept.slice(2), launch: () => { void g.speech.line('veterok_route_go', 'task', 0, '🧭'); } });
    void g.task(() => player.play(show)).then((res) => {
      playing = false;
      if (!res.solved) {
        // closed: its arrows kept as its middle (unchanged when none was turned)
        const now = [seed, level, ...show.progress()];
        if (JSON.stringify(now) !== JSON.stringify(keptOf(g.ws, WINDS_STEP))) { keep(g.ws, WINDS_STEP, now); g.persist(); }
        // Veterok keeps the arrows for her (the draft's f5_route_exit)
        void g.speech.line('veterok_route_exit', 'story', 0, '🧭').then(() => { if (on) bubble(); });
        return;
      }
      on = false;
      forget(g.ws, WINDS_STEP);
      flies = true; g.ws.flags.ship_flies = true;
      g.speech.caption(null);
      g.persist();
      // the route made: the step is done (no skill); the little ship got there (the draft's f5_route_ok), and the ship
      // takes her to the far islet at once
      finished();
      void wordsAfter(g, 'veterok_route_ok', '🧭').then(() => fly(true));
    });
  }
  /** A new map for the level of now, stored with no arrow on it. */
  const newMap = () => { keep(g.ws, WINDS_STEP, [Math.floor(g.rng() * 1e6), windsLevel(levelFor(g.save, 'pattern'))]); g.persist(); };

  const spots: Spot[] = [
    { pos: new THREE.Vector3(GANGWAY.x, height(GANGWAY.x, GANGWAY.z), GANGWAY.z), r: 2.4, label: 'sky_ship', on: () => flies && !far && !flight, run: () => { void fly(true); } },
    { pos: new THREE.Vector3(ISLET_GANGWAY.x, height(ISLET_GANGWAY.x, ISLET_GANGWAY.z), ISLET_GANGWAY.z), r: 2.4, label: 'sky_ship_back', on: () => flies && far && !flight, run: () => { void fly(false); } },
  ];

  return {
    skill: 'pattern', endsInWorld: true,
    get spec() { return spec; },
    get flies() { return flies; },
    get far() { return far; },
    get flying() { return flight !== null; },
    spots,
    // the map is laid as he asks (its seed and level stored at once, a middle kept goes on): closing it then changes nothing
    start(n, done) { owner = n; finished = () => done(); armed = true; on = true; if (keptOf(g.ws, WINDS_STEP).length < 2) newMap(); bubble(); },
    active: () => on,
    owner: () => (on ? owner?.def.id ?? null : null),
    reask: async () => { bubble(); },
    tap: () => { if (!flight) return false; flight.fast = true; return true; },
    update(dt, time, canMove) {
      if (flight) {
        const f = flight;
        if (f.t0 < 0) f.t0 = time;
        // slower over the landing run, twice as fast once tapped
        const left = f.len - f.s, k = left < LANDING_RUN ? 0.4 + 0.6 * (left / LANDING_RUN) : 1;
        f.s = Math.min(f.len, f.s + dt * FLIGHT_SPEED * k * (f.fast ? 2 : 1));
        const u = f.s / f.len, p = f.curve.getPointAt(u), tan = f.curve.getTangentAt(u);
        ship.position.copy(p);
        // its heading along the way, turned smoothly; never a bank
        const want = Math.atan2(tan.x, tan.z);
        ship.rotation.set(0, ship.rotation.y + Math.atan2(Math.sin(want - ship.rotation.y), Math.cos(want - ship.rotation.y)) * Math.min(1, dt * 3), 0);
        // she and the cat stand on its poop deck, at the helm (./landmarks.ts HELM), facing the way it flies
        hero.root.position.copy(onDeck(HELM, p)); hero.heading = ship.rotation.y; hero.root.rotation.y = ship.rotation.y;
        g.cat.root.position.copy(onDeck(CAT_DECK, p));
        // the camera behind it and a little above, gliding (src/game/camera.ts eases to it)
        g.camTask = { target: p.clone().setY(p.y + 2), yaw: ship.rotation.y + Math.PI, pitch: 0.3, dist: 11, catAt: g.cat.root.position.clone() };
        if (f.s >= f.len) f.end(time - f.t0);
        return;
      }
      if (!on || playing) return;
      const hp = hero.root.position, d = Math.hypot(hp.x - table.x, hp.z - table.z);
      if (d > AGAIN_R) armed = true;
      if (!g.busy && g.speech.shown?.key !== WAY) bubble();
      if (canMove && armed && d < OPEN_R) play();
    },
    goal: () => (on && !playing && !flight ? table : null),
    cheat() {
      if (!on || playing || flight) return false;
      if (!armed) {
        const off = new THREE.Vector3(table.x, 0, table.z - AGAIN_R - 1.5);
        hero.root.position.set(off.x, height(off.x, off.z), off.z);
        armed = true;
        return true;
      }
      hero.root.position.copy(table);
      return true;
    },
    fly,
    opened(done) { if (done) { flies = true; g.ws.flags.ship_flies = true; } },
  };
}
