/**
 * Pip at his place in a world of step 2 (part G; layout §1): the feeder of the fairies, the arch of the forest's glade.
 * His model is asked as the world is built, never waited for (./pip-load.ts: a lazy file, out of the first load): it
 * comes - he stands there; it does not (no network, an error) - he is not there, and nothing else of the world waits
 * or fails. English off or not met yet: no model asked, no Pip.
 * His spot of talk is there from the start, off until he stands: the world's list of spots is made once.
 */
import * as THREE from 'three';
import type { Game } from './context';
import { createPip, pipShown, type PipFigure, type PipPlace } from './pip';
import { loadPip } from './pip-load';
import type { Spot } from './player';
import type { WorldScope } from './scope';

export interface WorldPip {
  /** His figure once his model has come; null before, and for good without it. */
  figure(): PipFigure | null;
  /** His spot of talk at his place: on only while he stands there; `run` - his request (G2), else his hello. */
  spot(run?: () => void, done?: () => boolean): Spot;
  /** He says hello in English, a wave of his wings (a tap on him while no request of his waits). */
  hello(): void;
  /** Every frame: he turns to her, his clips go on; English turned off meanwhile - he is gone. */
  update(dt: number, time: number): void;
}

export function worldPip(g: Game, place: PipPlace, scope: WorldScope): WorldPip {
  let figure: PipFigure | null = null, gone = false;
  scope.own(() => { gone = true; figure?.dispose(); figure = null; });
  if (pipShown(g.save)) {
    void loadPip().then((rig) => {
      if (!rig || gone) return;
      figure = createPip(g.scene, rig, place, g.groundY, (x, z, r) => g.ground.block(x, z, r));
    });
  }
  const pos = new THREE.Vector3(place.x, g.groundY(place.x, place.z), place.z);
  const hello = () => {
    if (!figure || g.busy) return;
    if (figure.actor.has('Flap')) figure.actor.once('Flap', 'Idle');
    void g.speech.english('pip_hi_world');
  };
  return {
    figure: () => figure,
    hello,
    spot: (run = hello, done = () => false) => ({
      pos, r: 2.4, label: 'talk', on: () => figure !== null && figure.actor.root.visible, run,
      talker: { done, top: () => 1 },
    }),
    update: (dt, time) => {
      if (!figure) return;
      figure.show(pipShown(g.save));
      figure.update(dt, time, g.hero.root.position);
    },
  };
}
