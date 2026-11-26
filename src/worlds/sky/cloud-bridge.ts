import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { createRng } from '../../core/rng';
import type { Game } from '../../game/context';
import { levelFor } from '../../game/skills';
import type { WorldScope } from '../../game/scope';
import type { TaskResult } from '../../game/taskviews/panel';
import type { Npc, WorldTask } from '../../game/world';
import { cloudsLevel, generateClouds, showCloudsInWorld, type CloudsPlace, type CloudsSpec } from '../../game/worldtasks/clouds';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { tf } from '../../ui/strings';
import { CLOUD_GAP, ISLANDS } from './layout';
import { wordsAfter, wordsFirst } from './task-words';
import { height, setCloudGap } from './terrain';

/**
 * Lazur's cloud bridge over the gap in the bridge to the dragon island (WORLD-25, src/game/worldtasks/clouds.ts) as the
 * last step of her chain: she asks, the talk ends, the heroine walks to the gap's near edge - the cat's sparkles lead
 * there - and the task opens in its frame once she stands at it. Each right cloud becomes a step under her; once the
 * last is in, the deck over the gap is whole and she walks on to the dragon island. As the Sweet Land's shape bridge, the
 * step hands the conversation its result, which records it in `add` exactly as a panel task (src/game/dialogue.ts
 * `stepDone`).
 *
 * The gap is closed to walking until then (./terrain.ts `keepOn`): the way to Gromykhalo, the second friend, opens with
 * the bridge. A chain already past it (a save) has the bridge built from the start. Closed in the middle, the bridge
 * starts again from its first step next time (the card keeps no middle); the level is read anew at each start.
 *
 * The grey build speaks no line of its own: on the way the bubble is the world's subtitle (`sky_bridge_way`) under the
 * recorded question of addition; over the gap each example is the panel's recorded question (`t_add`, its bank clip).
 */

/** The id of the step (not `add`: that is the panel's addition, which stood in for it in step 1). */
export const CLOUD_STEP = 'cloudbridge';
/** m: the heroine this near the gap's edge opens the task; she must walk this much farther off to open it again. */
export const OPEN_R = 2.5, AGAIN_R = 6;

const A = ISLANDS[CLOUD_GAP.bridge[0]], B = ISLANDS[CLOUD_GAP.bridge[1]];
const LEN = Math.hypot(B.x - A.x, B.z - A.z), AX = (B.x - A.x) / LEN, AZ = (B.z - A.z) / LEN;
/** The gap's near edge, the way across it and the height of the deck there (the task's place). */
export const GAP_AT: CloudsPlace = (() => {
  const x = A.x + AX * CLOUD_GAP.from, z = A.z + AZ * CLOUD_GAP.from;
  return { x, z, y: height(x, z), facing: Math.atan2(AX, AZ), length: CLOUD_GAP.length };
})();
/** Where she walks to: on the deck a step before the gap's edge. */
const EDGE = new THREE.Vector3(GAP_AT.x - AX * 1, 0, GAP_AT.z - AZ * 1);

export interface CloudBridgeStep extends WorldTask {
  /** The bridge of the step now (null before the step's first start). */
  readonly spec: CloudsSpec | null;
  /** Whether the deck over the gap is whole. */
  readonly built: boolean;
  /** A frame: the task opens when she comes to the gap's edge. */
  update(dt: number, time: number, canMove: boolean): void;
  /** The gap's edge while the step is on and the task is not open; else null. */
  goal(): THREE.Vector3 | null;
  /**
   * The walkthrough's move (`__game.cheat`): she is put at the gap's edge (the task opens at the next frame); once she
   * has closed it, first a step back out of AGAIN_R, then back. False when the step is not on.
   */
  cheat(): boolean;
  /** The chain is past the step (or not): the deck over the gap whole and walkable, or the gap open. */
  opened(done: boolean): void;
}

/** The shared rungs of the hint of addition the bridge says in the cat's words of the islands (the draft 2026-11-18). */
export const BRIDGE_HINTS: Readonly<Record<string, 'sky_bridge_hint_1' | 'sky_bridge_hint_2' | 'sky_bridge_hint_3'>> = {
  h1_add_cross: 'sky_bridge_hint_1', h_count: 'sky_bridge_hint_2', h3_show: 'sky_bridge_hint_3',
};

export function createCloudBridge(g: Game, player: WorldTaskPlayer, scope: WorldScope, gapDeck: THREE.Object3D): CloudBridgeStep {
  const { scene, hero } = g;
  EDGE.y = height(EDGE.x, EDGE.z);
  let spec: CloudsSpec | null = null, built = false;
  let on = false, owner: Npc | null = null, finished: (played?: TaskResult) => void = () => {}, armed = true, playing = false, opens = 0;
  const WAY = 't_add';
  const bubble = () => { g.speech.caption({ key: WAY, pri: 'story', hold: 0, speaker: '☁️', text: tf('sky_bridge_way', {}) }); };
  const build = (done: boolean) => { built = done; gapDeck.visible = done; setCloudGap(done); };
  build(false);
  scope.own(() => setCloudGap(false));

  function play() {
    armed = false; playing = true;
    g.speech.caption(null);
    open();
  }
  function open() {
    // a new bridge each time: the level of addition now (the card keeps no middle)
    spec = generateClouds('add', cloudsLevel(levelFor(g.save, 'add')), createRng(`clouds:${Math.floor(g.rng() * 1e6)}`));
    // the cat's hints of the bridge (the draft's f5_bridge_hint_*) in place of the shared ones they say the same as: the
    // way through ten (level 5), counting together, the cloud that glows; the other rungs keep their shared lines
    // Lazur says how the clouds become steps (the draft's f5_bridge_start) before the first question
    // this very bridge: one closed and opened anew is another
    const mine = ++opens;
    const hooks = wordsFirst(g, g.hooksFor('☁️'), 'lazur_bridge_start', '☁️', () => playing && opens === mine);
    const show = showCloudsInWorld(scene, spec, GAP_AT, { ...hooks, hint: (key) => hooks.hint(BRIDGE_HINTS[key] ?? key) },
      // Lazur between two steps (the draft's f5_bridge_step): the next question waits for her; a line of the task
      { reach: g.touch ? 70 : 46, scope, hero, between: () => g.speech.line('lazur_bridge_step', 'task', 0, '☁️') });
    void g.task(() => player.play(show)).then((res) => {
      playing = false;
      if (!res.solved) {
        // closed in the middle: she stands back on the near edge, the gap as it was
        hero.root.position.copy(EDGE);
        if (on) bubble();
        return;
      }
      on = false;
      build(true);
      g.speech.caption(null);
      sfx('fanfare');
      g.sparks.burst(new THREE.Vector3(GAP_AT.x + AX * CLOUD_GAP.length / 2, GAP_AT.y + 1, GAP_AT.z + AZ * CLOUD_GAP.length / 2), '#ffffff', 50, 4);
      g.persist();
      // Lazur: the bridge is built (the draft's f5_bridge_finish); the result handed on: the conversation records it in
      // `add`, as a panel task
      void wordsAfter(g, 'lazur_bridge_finish', '☁️').then(() => finished(res));
    });
  }

  return {
    skill: 'add', endsInWorld: true,
    get spec() { return spec; },
    get built() { return built; },
    start(n, done) {
      owner = n; finished = done; armed = true; on = true;
      bubble();
    },
    active: () => on,
    owner: () => (on ? owner?.def.id ?? null : null),
    reask: async () => { bubble(); },
    update(_dt, _time, canMove) {
      if (!on || playing) return;
      const hp = hero.root.position, d = Math.hypot(hp.x - EDGE.x, hp.z - EDGE.z);
      if (d > AGAIN_R) armed = true;
      if (!g.busy && g.speech.shown?.key !== WAY) bubble();
      if (canMove && armed && d < OPEN_R) play();
    },
    goal: () => (on && !playing ? EDGE : null),
    cheat() {
      if (!on || playing) return false;
      if (!armed) {
        // closed before: she walks back toward the castle first, out of AGAIN_R, and the next move brings her back
        const off = new THREE.Vector3(EDGE.x - AX * (AGAIN_R + 1.5), 0, EDGE.z - AZ * (AGAIN_R + 1.5));
        hero.root.position.set(off.x, height(off.x, off.z), off.z);
        armed = true;
        return true;
      }
      hero.root.position.copy(EDGE);
      return true;
    },
    opened(done) { if (done) build(true); },
  };
}
