/**
 * Opening a task in the world (PLAY-01) the same way in every world: what the first world does by hand for its sorting
 * and its stones (src/worlds/fairy/index.ts), here once for the worlds that come after it. A world makes the show of a
 * kind (./core.ts `WorldTaskShow`) and hands it to `play`; the player frames it (`taskFrame`: the camera over it, the
 * heroine beside it), shows the close button, opens the debug door of the walkthrough on it (`setWorldTask`) and takes
 * all of that back when the task ends - or when the world is left in its middle (the world's scope).
 *
 * The world wires `tap` and `update` into its frame: a tap while a task is open is the task's, its things move in the
 * world's time.
 */
import type * as THREE from 'three';
import { hideAnswers, showClose } from '../../ui/ui';
import type { Game } from '../context';
import type { WorldScope } from '../scope';
import type { TaskResult } from '../taskviews/panel';
import type { WorldTask } from '../world';
import { setWorldTask, taskFrame, type WorldTaskShow } from './core';

export interface WorldTaskPlayer {
  /** Opens `show` in its frame and settles once it is solved or closed. One at a time: a scene holds the heroine meanwhile. */
  play(show: WorldTaskShow): Promise<TaskResult>;
  /** The task open now, else null. */
  readonly open: WorldTaskShow | null;
  /** A tap on the screen while a task is open is the task's (true), even one that hits nothing; false - none is open. */
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  /** A frame of the world: the open task's things move. */
  update(time: number): void;
}

export function worldTaskPlayer(g: Pick<Game, 'hero' | 'camera' | 'groundY' | 'camTask'>, scope: WorldScope): WorldTaskPlayer {
  let open: WorldTaskShow | null = null;
  const clear = () => { open = null; setWorldTask(g, null); g.camTask = null; };
  // A world left in the middle of a task takes its frame and its door away; its timers go with the scope already.
  scope.own(() => { if (open) { hideAnswers(); clear(); } });
  return {
    async play(show) {
      open = show;
      setWorldTask(g, show);
      const { cam, stand } = taskFrame(show, g.camera);
      const { hero } = g;
      hero.root.position.set(stand.x, g.groundY(stand.x, stand.z), stand.z); hero.heading = stand.facing; hero.root.rotation.y = stand.facing;
      g.camTask = cam;
      showClose(() => show.close());
      try { return await show.done; } finally { hideAnswers(); if (open === show) clear(); }
    },
    get open() { return open; },
    tap: (screenDist) => open?.tap(screenDist) ?? false,
    update: (time) => { open?.update(time); },
  };
}

/**
 * What is wrong with the tasks a world declares to play in the world (WorldDef.worldTasks) against the tasks its
 * conversation is given (`tasks`, src/game/dialogue.ts): each must be there and be played in the foreground (`run`) -
 * a step without it would go to the panel, which has no such task - or in the background ending in a task in the world
 * (`start` with `endsInWorld`, the shell lock). Empty: nothing. A world checks this as it is built.
 */
export function worldTaskProblems(declared: readonly string[] | undefined, tasks: Readonly<Record<string, WorldTask>>): string[] {
  const plays = (t: WorldTask | undefined) => !!t?.run || (!!t?.start && t.endsInWorld === true);
  return (declared ?? []).filter((id) => !plays(tasks[id])).map((id) => `the task in the world "${id}" of worldTasks has no "run" among the tasks of the world's conversation`);
}
