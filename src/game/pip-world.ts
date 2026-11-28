/**
 * Pip at his place in a world of step 2 (part G; layout §1): the feeder of the fairies, the arch of the forest's glade.
 * His model is asked as the world is built, never waited for (./pip-load.ts: a lazy file, out of the first load): it
 * comes - he stands there; it does not (no network, an error) - he is not there, and nothing else of the world waits
 * or fails. English off or not met yet: no model asked, no Pip.
 * His spot of talk is there from the start, off until he stands: the world's list of spots is made once.
 *
 * With `given` (where his commands are given, the world's EN_GIVEN) and the world's places of his commands
 * (WorldDef.enPlaces), a tap on him is his request (part G2, ./pip-request.ts); the world feeds `update` with whether
 * she walks by herself and composes its goal with `goal`, for his command she walks to.
 */
import * as THREE from 'three';
import { sfx } from '../core/audio';
import { EN, VARIANTS } from '../s2/strings-en';
import { enVoice } from '../s2/types';
import { el, hideAnswers, showClose } from '../ui/ui';
import type { SpokenKey } from '../ui/strings';
import { createStage, type Game } from './context';
import { createPip, pipShown, readMs, type PipFigure, type PipPlace } from './pip';
import { loadPip } from './pip-load';
import { createPipRequest, markShown, requestWaits, type PipRequest, type PipRequestEnv } from './pip-request';
import type { Spot } from './player';
import type { WorldScope } from './scope';
import { playScene } from './stage';
import { stopPoint } from './stops';
import { enGo } from './worldtasks/en-go';

/** The face of his lines in the bubble and of his tasks on the panel. */
const PIP_FACE = '🐦';

export interface WorldPip {
  /** His figure once his model has come; null before, and for good without it. */
  figure(): PipFigure | null;
  /** His spot of talk at his place: on only while he stands there; `run` - his request (G2), else his hello. */
  spot(run?: () => void, done?: () => boolean): Spot;
  /** He says hello in English, a wave of his wings (a tap on him while no request of his waits). */
  hello(): void;
  /**
   * Every frame: he turns to her, his clips go on, the mark of his request; English turned off meanwhile - he is gone.
   * `canMove`: she walks by herself (the frame's snapshot) - his command counts her walk only then.
   */
  update(dt: number, time: number, canMove?: boolean): void;
  /** The world's goal with his command over it: while she walks to it, its sparkles (none until its last rung). */
  goal(world: () => THREE.Vector3 | null): () => THREE.Vector3 | null;
  /** The debug door (the world's `more.pip`): his state, and his request started as a tap on him starts it. */
  debug(): PipDebug;
}

export interface PipDebug {
  shown: boolean; mark: boolean; place: { x: number; z: number }; pieces: number[]; waits: boolean;
  /** The step of his request running, null - none. */
  request: string | null;
  /** His command she walks to now: its kind, the place it is about, its course; null - none. */
  go: { kind: string; target: { x: number; z: number }; state: ReturnType<NonNullable<ReturnType<PipRequest['going']>>['state']> } | null;
  /** A tap on him (the request, its replay, or his command again). */
  start(): void;
  /** His command: she has come (solve) / stands at a wrong place (false - none to stand at) / taken back. */
  solveGo(): void; wrongGo(): boolean; closeGo(): void;
}

export function worldPip(g: Game, place: PipPlace, scope: WorldScope, given?: { readonly x: number; readonly z: number }): WorldPip {
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
  const places = g.world.enPlaces;
  // the close button of his command, given back if a scene meanwhile (a resident's task) took it away
  let closeGo: (() => void) | null = null;
  const request = given && places?.length ? createPipRequest(pipRequestEnv(g, scope, () => figure, places, given, (c) => {
    closeGo = c;
    if (c) showClose(c); else if (!g.busy) hideAnswers();
  })) : null;
  // a world left while she walks to his command: it is taken back, nothing of it stays
  scope.own(() => request?.drop());
  const run = () => { if (figure && !g.busy) request ? request.tap() : hello(); };
  const sparks = new THREE.Vector3();
  return {
    figure: () => figure,
    hello,
    spot: (tap = run, done = () => !request || !requestWaits(g.save, g.worldId)) => ({
      pos, r: 2.4, label: 'talk', on: () => figure !== null && figure.actor.root.visible, run: tap,
      talker: { done, top: () => 1 },
    }),
    update: (dt, time, canMove = false) => {
      if (!figure) return;
      const shown = pipShown(g.save);
      figure.show(shown);
      if (!shown) request?.drop();
      figure.update(dt, time, g.hero.root.position);
      if (request) {
        request.update(g.hero.root.position, time, canMove && !g.busy);
        figure.mark.visible = markShown({ shown, busy: g.busy, running: request.running(), waits: requestWaits(g.save, g.worldId) });
        if (closeGo && !g.busy && el.answersClose.classList.contains('hidden')) showClose(closeGo);
      }
    },
    goal: (world) => () => {
      const at = request?.goal(g.hero.root.position);
      if (at === undefined) return world();
      return at && sparks.set(at.x, g.groundY(at.x, at.z), at.z);
    },
    debug: () => {
      const going = request?.going() ?? null;
      return {
        shown: figure !== null && figure.actor.root.visible, mark: figure?.mark.visible ?? false,
        place: { x: place.x, z: place.z }, pieces: [...g.save.pip.pieces], waits: !!request && requestWaits(g.save, g.worldId),
        request: request?.step() ?? null,
        go: going && { kind: going.target.kind, target: { x: going.target.x, z: going.target.z }, state: going.state() },
        start: run,
        solveGo: () => going?.solve(), wrongGo: () => going?.wrong() ?? false, closeGo: () => going?.close(),
      };
    },
  };
}

/** His request's doings in the game: scenes on a stage of his own, the panel through the planner, his voice and the cat's. */
function pipRequestEnv(g: Game, scope: WorldScope, figure: () => PipFigure | null, places: PipRequestEnv['places'],
  given: PipRequestEnv['given'], closer: PipRequestEnv['closer']): PipRequestEnv {
  const stage = createStage(g, () => {});
  const at = () => g.above(g.hero.root.position, 1.4);
  /** His line in English for long enough to read it, a clip of his figure with it. */
  const pip = async (id: string) => {
    const f = figure();
    if (f?.actor.has('Talk')) f.actor.once('Talk', 'Idle');
    if (id === 'pip_yes') { sfx('good'); if (f?.actor.has('Yes')) f.actor.once('Yes', 'Idle'); }
    const text = EN.get(id)?.text ?? EN.get(VARIANTS.get(id)?.[0] ?? '')?.text ?? '';
    await Promise.all([g.speech.english(id, PIP_FACE), scope.wait(readMs(text))]);
  };
  return {
    save: g.save, world: g.worldId, places, given, rng: g.rng,
    scene: async (name, body) => {
      // a scene of another (a resident's talk, a find) holds the controls: his next scene waits for it to end
      const visit = g.visit;
      while (stage.busy() && g.visit === visit) await scope.wait(100);
      if (g.visit !== visit) return false;
      return (await playScene(stage, name, async () => {
        const f = figure();
        if (f) g.cam.focus = g.above(f.pos, 0.5);
        await body();
      })) !== 'refused';
    },
    panel: (type, level) => g.task(() => g.plan.runTask(type, level, g.hooksFor(PIP_FACE), g.rng)),
    go: (kind) => {
      const h = g.hooksFor(PIP_FACE);
      return enGo(scope, { say: (clips) => { void command(clips); }, wrong: h.wrong, hint: (key) => g.speech.hintLine(key) }, {
        places, kind, from: given, rng: g.rng, has: (id) => enVoice().has(id),
        // the second rung: the cat says what he asks ("Pip asks: find a red flower!"), then the word apart
        lines: { frame: `pip_cat_go_${kind}` as SpokenKey },
      });
    },
    pip,
    command: (clips) => command(clips),
    cat: (key) => g.speech.line(key, 'story') as Promise<void>,
    reward: (kind) => { if (kind === 'step') g.addStars(3, at()); else g.addStars(1, at()); },
    persist: () => g.persist(),
    closer,
    stop: () => stopPoint('task'),
  };

  /** His whole phrase, with its bubble and translation, once it is recorded; until then the frame and the word apart. */
  function command(clips: readonly string[]): Promise<void> {
    return clips.length === 1 && clips[0].startsWith('en_go_') ? g.speech.english(clips[0], PIP_FACE) : enVoice().say(clips);
  }
}
