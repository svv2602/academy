/**
 * Pip in the hub (Season 2, part G; layout §1): he sits on a root of the Great Tree, on the side she comes in from the
 * fairies. The first time she is in the hub with the first world finished - and English on - he is met: his lines in
 * English, the cat's translation after each (src/game/pip.ts MEETING), the controls held as a scene holds them. Then
 * the words of the hub lie in the book and he stays on his root: the hub has no request of his (no task in the hub).
 */
import { speaking } from '../../core/audio';
import type { Game } from '../../game/context';
import { MEETING, createPip, meetPip, meetsPip, pipShown, readMs, type PipFigure, type PipPlace } from '../../game/pip';
import type { WorldScope } from '../../game/scope';
import { playScene } from '../../game/stage';
import { loadPip } from '../../game/pip-load';
import { enVoice } from '../../s2/types';
import { EN } from '../../s2/strings-en';
import { arrivalAt, trunkR } from './layout';

/** His root: between the Tree and where she comes in from the fairies, facing her. */
export function pipHubPlace(): PipPlace {
  const from = arrivalAt(0), a = Math.atan2(from.x, from.z), d = trunkR(0) + 0.55;
  return { x: Math.sin(a) * d, z: Math.cos(a) * d, heading: a };
}

/** ms a line of his stays at least, for reading it (src/game/pip.ts, shared with his request in the worlds). */
export { readMs };

export interface HubPip {
  /** His root (where he sits, whether his model has come or not). */
  readonly place: PipPlace;
  /** His figure once his model has come; null before, and for good without it (no network: met another time). */
  figure(): PipFigure | null;
  /** Every frame, with whether she is free (no scene, the arches not waking, the tour not flying): the meeting when due. */
  update(dt: number, time: number, free: boolean): void;
  /** Debug: the state of the meeting. */
  state(): { met: boolean; meeting: boolean; shown: boolean };
}

/**
 * Pip on his root when the save has him or his meeting, null otherwise. His model is asked here and never waited for
 * (src/game/pip-load.ts): it comes - he sits there and, if due, is met; it does not - no Pip this time, the meeting waits
 * for another entry, nothing of the hub waits or fails.
 */
export function hubPip(g: Game, firstWorldDone: boolean, scope: WorldScope): HubPip | null {
  const { save } = g;
  if (!pipWanted(save, firstWorldDone)) return null;
  const place = pipHubPlace();
  let figure: PipFigure | null = null, gone = false;
  scope.own(() => { gone = true; figure?.dispose(); figure = null; });
  void loadPip().then((rig) => { if (rig && !gone) figure = createPip(g.scene, rig, place, () => 0); });
  let meeting = false;
  const meet = (pip: PipFigure) => {
    meeting = true;
    void import('../../game/context').then(({ createStage }) => playScene(createStage(g, () => {}), 'pip meet', async () => {
      g.cam.focus = g.above(pip.pos, 0.5);
      for (const step of MEETING) {
        if ('pip' in step) {
          if (pip.actor.has('Talk')) pip.actor.once('Talk', 'Idle');
          await Promise.all([g.speech.english(step.pip), scope.wait(readMs(EN.get(step.pip)?.text ?? ''))]);
        } else {
          await g.speech.line(step.cat, 'story');
        }
      }
      if (pip.actor.has('Yes')) pip.actor.once('Yes', 'Idle');
      // the words of the hub in the book: "a new word!" said once for them all (Isabella, the book's voice)
      if (meetPip(save) > 0) void enVoice().say('wb_new');
      g.persist();
    })).finally(() => { g.cam.focus = null; meeting = false; });
  };
  return {
    place,
    figure: () => figure,
    update: (dt, time, free) => {
      if (!figure) return;
      figure.update(dt, time, g.hero.root.position);
      if (!meeting && free && !speaking() && meetsPip(save, firstWorldDone)) meet(figure);
    },
    state: () => ({ met: save.pip.met, meeting, shown: figure !== null }),
  };
}

/** Whether the hub has Pip to show: met already, or his meeting due (the model is asked only then). */
export const pipWanted = (save: Game['save'], firstWorldDone: boolean) => pipShown(save) || meetsPip(save, firstWorldDone);
