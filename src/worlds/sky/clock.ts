import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { createRng } from '../../core/rng';
import type { Game } from '../../game/context';
import type { Spot } from '../../game/player';
import { levelFor, recordTask } from '../../game/skills';
import type { WorldScope } from '../../game/scope';
import type { Npc, WorldTask } from '../../game/world';
import { GEAR_PAINT, generateGears, generateHands, showGearsInWorld, showHandsInWorld, type ClockPlace } from '../../game/worldtasks/clock';
import { forget, keep, keptOf } from '../../game/worldtasks/kept';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { tf } from '../../ui/strings';
import { CLOCK, CLOCK_AT, GEARS } from './layout';
import { tellWhenQuiet, wordsFirst } from './task-words';
import { height } from './terrain';

/**
 * Mertsal's clock of the observatory (WORLD-24, src/game/worldtasks/clock.ts) as the third step of his chain: a puzzle
 * of three steps, each a kind of task the game has - (1) the three gears found on his island (she walks to each and
 * takes it by the action button: a search, recorded nowhere), (2) the gears put on the axle in their order (a pattern,
 * recorded in «Закономерности»), (3) the hands set by an example (addition, recorded in «Сложение»). Each step is
 * recorded in its own skill as a panel task would be; the puzzle itself in none (the customer's decision 2026-11-18),
 * so the conversation is handed no result. After each step the clock comes alive a little more: a gear turns on the
 * stand, then the bell rings and the row turns, then the hands are set and ray 3 shows in the clock (WORLD-08) - the
 * step `part` that follows in his chain is taken there.
 *
 * The steps done are kept in the world (`ws.tasks.clock`: the steps done, the gears found as bits, the seed of its two
 * tasks): she may leave after any of them, and coming back goes on with the next; a reload keeps them. Closed in the
 * middle of step 2 or 3, that step opens again when she comes back to the stand.
 *
 * The grey build speaks no line of its own: the bubble on the way is the world's subtitle (`sky_clock_way`, the gears
 * found so far) under the recorded "what comes next?" (`t_pattern`); over the two tasks, the panel's recorded questions.
 */

/** The id of the step (not `add`: that is the panel's addition, which stood in for it in step 1). */
export const CLOCK_STEP = 'clock';
/** m: by a gear the action button takes it; before the stand this near the next task opens, this far she must go to open it again. */
export const GEAR_R = 2.2, OPEN_R = 2.2, AGAIN_R = 6;
/** The steps of the puzzle: the gears found, the gears on the axle, the hands set. */
export const CLOCK_STEPS = 3;

export interface ClockStep extends WorldTask {
  /** The steps of the puzzle done (0-3). */
  readonly done: number;
  /** The gears found, by their places (layout.ts GEARS). */
  readonly found: readonly boolean[];
  /** The action spots of the gears while they wait to be found. */
  readonly spots: readonly Spot[];
  /** A frame: the gears, the clock coming alive, a task opened at the stand. */
  update(dt: number, time: number, canMove: boolean): void;
  /** Where she goes next while the step is on: the next gear, or the stand; else null. */
  goal(): THREE.Vector3 | null;
  /**
   * The walkthrough's move (`__game.cheat`): the next gear taken where it lies; after step 1, a walk away out of
   * AGAIN_R and back (as a child who leaves and comes back: the puzzle goes on with step 2); then she stands before the
   * stand and the next task opens. False when the step is not on or a task is open.
   */
  cheat(): boolean;
  /** The chain is past the clock: every step done, the hands set. */
  opened(done: boolean): void;
  dispose(): void;
}

export function createClock(g: Game, player: WorldTaskPlayer, scope: WorldScope, hands: THREE.Object3D): ClockStep {
  const { scene, hero } = g;
  const at: ClockPlace = { ...CLOCK_AT, y: height(CLOCK_AT.x, CLOCK_AT.z) };
  const stand = new THREE.Vector3(CLOCK_AT.x, at.y, CLOCK_AT.z + 2.4);
  let stage = 0, found = [false, false, false], seed = Math.floor(g.rng() * 1e6);
  const k0 = keptOf(g.ws, CLOCK_STEP);
  if (k0.length === 3) { stage = k0[0]; found = GEARS.map((_, i) => (k0[1] & (1 << i)) !== 0); seed = k0[2]; }
  const store = () => { keep(g.ws, CLOCK_STEP, [stage, found.reduce((m, f, i) => m | (f ? 1 << i : 0), 0), seed]); g.persist(); };

  // the gears in the grass, each a colour of its own; the stand's gear (one turning once they are found), the bell
  const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.12, 12).rotateX(Math.PI / 2);
  const paints = Object.values(GEAR_PAINT);
  const gears = GEARS.map((p, i) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: paints[i], emissive: '#ffe27a', emissiveIntensity: 0.3, metalness: 0.2, roughness: 0.5 }));
    m.position.set(p.x, height(p.x, p.z) + 0.6, p.z);
    m.name = `clock-gear-${i}`;
    scene.add(m);
    return m;
  });
  const standGear = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#d4a640', metalness: 0.5, roughness: 0.4 }));
  standGear.position.set(CLOCK.x, height(CLOCK.x, CLOCK.z) + 1.4, CLOCK.z); standGear.scale.setScalar(1.3);
  scene.add(standGear);
  let ring = 0;           // s of game time the bell still rings (the stand's gear shakes)

  let on = false, owner: Npc | null = null, finished: () => void = () => {}, armed = true, playing = false, left = false, paused = false;
  const WAY = 't_pattern';
  const bubble = () => { g.speech.caption({ key: WAY, pri: 'story', hold: 0, speaker: '🔭', text: tf('sky_clock_way', { n: found.filter(Boolean).length }) }); };

  const take = (i: number) => {
    if (!on || stage !== 0 || found[i]) return;
    found[i] = true; gears[i].visible = false;
    sfx('chime'); g.sparks.burst(gears[i].position, GEAR_PAINT['🟡'], 24, 2);
    // all three found: the stand's gear turns, the cat hears it (the draft's f5_clock_tick)
    if (found.every(Boolean)) { stage = 1; ring = 1.2; sfx('fanfare'); void tellWhenQuiet(g, scope, 'sky_clock_tick', 'story'); }
    store();
    bubble();
  };

  function play() {
    armed = false; playing = true;
    g.speech.caption(null);
    // Mertsal names the step (the gears on the axle, then the hands), or - back after a pause - goes on where they
    // stopped: before the step's first question
    const say = paused ? 'mertsal_clock_resume' : stage === 1 ? 'mertsal_clock_step_2' : 'mertsal_clock_step_3';
    paused = false;
    open(say);
  }
  function open(say: 'mertsal_clock_resume' | 'mertsal_clock_step_2' | 'mertsal_clock_step_3') {
    const rng = createRng(`clock:${seed}:${stage}`);
    // the puzzle's steps are 1-3, the search the first: this task is its step stage + 1 of three
    const hooks = wordsFirst(g, g.hooksFor('🔭'), say, '🔭', () => playing), o = { reach: g.touch ? 70 : 46, scope, stage: [stage + 1, CLOCK_STEPS] as const };
    const gearsStep = stage === 1;
    const skill = gearsStep ? 'pattern' : 'add';
    const show = gearsStep ? showGearsInWorld(scene, generateGears(levelFor(g.save, 'pattern'), rng), at, hooks, o)
      : showHandsInWorld(scene, generateHands(levelFor(g.save, 'add'), rng), at, hooks, o);
    void g.task(() => player.play(show)).then((res) => {
      playing = false;
      // closed in the middle: the clock waits (the draft's f5_clock_exit)
      if (!res.solved) { paused = true; void g.speech.line('mertsal_clock_exit', 'story', 0, '🔭').then(() => { if (on) bubble(); }); return; }
      // each step recorded in the skill of its kind, as a panel task would be
      recordTask(g.save, skill, res.wrong, res.helped === true);
      stage++;
      ring = 1.2; sfx('chime');
      if (stage < CLOCK_STEPS) { store(); bubble(); void tellWhenQuiet(g, scope, 'sky_clock_tick', 'story'); return; }
      // the hands set: the clock open, ray 3 shows in it (Mertsal's next step, `part`, is taken there); the puzzle
      // itself is recorded in no skill (the conversation is handed no result)
      on = false;
      forget(g.ws, CLOCK_STEP);
      g.ws.flags.mertsal_hint = true;
      g.speech.caption(null);
      sfx('fanfare');
      g.persist();
      finished();
    });
  }

  const spots: Spot[] = GEARS.map((p, i) => ({ pos: new THREE.Vector3(p.x, height(p.x, p.z), p.z), r: GEAR_R, label: 'sky_gear', on: () => on && stage === 0 && !found[i], run: () => take(i) }));
  const showStage = () => { for (const [i, m] of gears.entries()) m.visible = stage === 0 && !found[i] && on; };

  return {
    skill: 'pattern', endsInWorld: true,
    get done() { return stage; },
    get found() { return found; },
    spots,
    start(n, done) {
      owner = n; finished = () => done(); armed = true; on = true;
      store();
      // the first step: the gears rolled over the island (the draft's f5_clock_step_1), then the bubble of the search
      if (stage === 0) void g.speech.line('mertsal_clock_step_1', 'story', 0, '🔭').then(() => { if (on) bubble(); });
      else bubble();
    },
    active: () => on,
    owner: () => (on ? owner?.def.id ?? null : null),
    reask: async () => { bubble(); },
    update(dt, time, canMove) {
      showStage();
      for (const m of gears) m.rotation.z = time * 1.2;
      // the clock alive a little more after each step: the stand's gear turns once the gears are found, faster after
      // the axle, the hands set at the end; the bell shakes it as it rings
      standGear.visible = stage >= 1;
      standGear.rotation.z = time * (stage >= 2 ? 2.4 : 1.2);
      if (ring > 0) { ring -= dt; standGear.position.x = CLOCK.x + Math.sin(time * 40) * 0.05 * Math.max(0, ring); }
      // the hands set (the finale starts them going: ./index.ts)
      if (stage >= CLOCK_STEPS && !g.ws.final) hands.rotation.z = -Math.PI / 3;
      if (!on || playing || stage === 0) return;
      const hp = hero.root.position, d = Math.hypot(hp.x - stand.x, hp.z - stand.z);
      if (d > AGAIN_R) armed = true;
      if (!g.busy && g.speech.shown?.key !== WAY) bubble();
      if (canMove && armed && d < OPEN_R) play();
    },
    goal: () => {
      if (!on || playing) return null;
      if (stage === 0) { const i = found.findIndex((f) => !f); return i >= 0 ? spots[i].pos : null; }
      return stand;
    },
    cheat() {
      if (!on || playing) return false;
      if (stage === 0) {
        const i = found.findIndex((f) => !f);
        const p = spots[i].pos;
        hero.root.position.set(p.x, height(p.x, p.z), p.z + 1);
        take(i);
        return true;
      }
      // after the gears, once: she goes away from the stand and comes back - the puzzle goes on with its next step
      if ((!left && stage === 1) || !armed) {
        left = true;
        const off = new THREE.Vector3(stand.x, 0, stand.z + AGAIN_R + 1.5);
        hero.root.position.set(off.x, height(off.x, off.z), off.z);
        armed = true;
        return true;
      }
      hero.root.position.copy(stand);
      return true;
    },
    opened(done) {
      if (!done) return;
      stage = CLOCK_STEPS; on = false; showStage();
    },
    dispose() { geo.dispose(); },
  };
}
