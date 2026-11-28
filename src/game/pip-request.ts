/**
 * Pip's request in a world of step 2 (part G2; idea/proposal/season2-step2-plan-2026-11-27, layout §2): a tap on him
 * while the piece of his map this world keeps is not found yet. He says "Look, look!", then four tasks in a row, in
 * this order (REQUEST): "listen and touch" (en_tap), a note to read (note), his command she walks to by herself
 * (en_go, ./worldtasks/en-go.ts) and counting in English (en_count). Each is a step as a resident's step is
 * (./dialogue.ts): its level from its skill, recorded to its skill, 3 stars when solved, and his "Yes! Well done!".
 * The fourth solved, the piece goes into `save.pip.pieces` and he thanks her.
 *
 * - A task closed ends the request where it is: nothing of it is kept (the save is version 5 and keeps its shape), the
 *   next tap starts again from the first task. Stars and skills of the steps solved before stay hers - nothing is taken.
 * - The piece taken, a tap plays one task of his request again, of its weaker skill (LEARN-16, the rule of a resident's
 *   finished chain: `weakest` over the panel steps), for 1 star.
 * - No resident (R10): no step of his is a step of a chain, no chain's step is his, he is not among the world's
 *   characters. His command never names a place at a resident (the world's own test of its places).
 * - The command is played outside a scene: she walks there by herself, no sparkles until its last rung. The world feeds
 *   `update` with where she is every frame and asks `goal` where the sparkles lead.
 *
 * Everything the request does to the game goes through `PipRequestEnv` (./pip-world.ts makes it of the game), so the
 * tests run the course with stand-ins.
 */
import type { Save } from '../core/save';
import type { Rng } from '../core/rng';
import { pick } from '../core/util';
import type { SpokenKey } from '../ui/strings';
import { MAP_PLACES } from '../ui/wordbook';
import { weakest } from './planner';
import { levelFor, recordTask, type SkillId } from './skills';
import { answerOf, type TaskResult } from './taskviews/panel';
import type { TaskType } from './tasks/types';
import { kindsAt, type EnGoShow, type EnPlace, type EnPlaceKind } from './worldtasks/en-go';

/** The four tasks of his request, in their order (layout §2). */
export const REQUEST = ['en_tap', 'note', 'en_go', 'en_count'] as const;
export type RequestStep = (typeof REQUEST)[number];
/** The steps of his request shown on the panel. */
export type PipPanelStep = Exclude<RequestStep, 'en_go'> & TaskType;
/** The panel steps of his request: the replay after the piece picks one of them (LEARN-16). */
export const PANEL_STEPS = REQUEST.filter((s): s is PipPanelStep => s !== 'en_go');

/** The skill each step is recorded to: the panel's (./taskviews/panel.ts SKILL), and a command is a phrase. */
export const STEP_SKILL: Readonly<Record<RequestStep, SkillId>> = { en_tap: 'en_words', note: 'read', en_go: 'en_phrases', en_count: 'en_words' };

/**
 * The stars of a step of his request (3, as a resident's step), and of a task played again once the piece is taken (1,
 * as a finished chain's replay): `PipRequestEnv.reward` gives them - with the number written in its call of addStars,
 * as src/game/no-penalties.test.ts reads every such call.
 */
export type PipReward = 'step' | 'again';

/** The number of the piece of `world` in `save.pip.pieces`: as the book reads it (MAP_PLACES, 1-based); 0 - none. */
export const pieceOf = (world: string) => (MAP_PLACES as readonly string[]).indexOf(world) + 1;

/** Does his request wait in `world`: the world keeps a piece and it is not found yet. */
export const requestWaits = (save: Pick<Save, 'pip'>, world: string) => pieceOf(world) > 0 && !save.pip.pieces.includes(pieceOf(world));

/**
 * The golden diamond over him: his request waits, he is shown, and neither the game nor he is busy (a conversation, a
 * task, a step of his request running - the command too, while she walks).
 */
export const markShown = (o: { shown: boolean; busy: boolean; running: boolean; waits: boolean }) => o.shown && !o.busy && !o.running && o.waits;

/** What the request does to the game: ./pip-world.ts makes it of `Game`, the tests of stand-ins. */
export interface PipRequestEnv {
  readonly save: Save;
  /** The world's id: the piece it keeps (`pieceOf`). */
  readonly world: string;
  /** The places of his commands (WorldDef.enPlaces) and where the commands are given (the world's EN_GIVEN). */
  readonly places: readonly EnPlace[];
  readonly given: { readonly x: number; readonly z: number };
  /** The game's randomness (ARCH-08): the kind a command names, the task played again. */
  readonly rng: Rng;
  /** A scene holding the controls (playScene); false - it did not start (the world was left meanwhile). */
  scene(name: string, body: () => Promise<void>): Promise<boolean>;
  /** A panel task through the planner, as a resident's step is (`g.task(() => g.plan.runTask(...))`). */
  panel(type: PipPanelStep, level: number): Promise<TaskResult>;
  /** The show of his command of `kind` (./worldtasks/en-go.ts `enGo`); null - no place of it in the ring. */
  go(kind: EnPlaceKind): EnGoShow | null;
  /** He says a line of his in English (its bubble with the translation): a line, or a set of variants (`pip_yes`). */
  pip(id: string): Promise<void>;
  /** He says his command: its clips (`EnGoShow.clips`). */
  command(clips: readonly string[]): Promise<void>;
  /** The cat says a line of hers. */
  cat(key: SpokenKey): Promise<void>;
  /** Her stars for a step solved (3) or a task played again (1): `g.addStars`. */
  reward(kind: PipReward): void;
  /** The save stored. */
  persist(): void;
  /** The close button of his command while she walks; null takes it away. */
  closer(close: (() => void) | null): void;
  /** A stop point after a step (./stops.ts): the cat's break may come in here. */
  stop(): Promise<void>;
}

export interface PipRequest {
  /** A tap on him: the request from its first task, the replay once the piece is taken, his command again while she walks. */
  tap(): void;
  /** The step running now, null when none (the debug door). */
  step(): RequestStep | null;
  /** A step of his runs: no mark over him, a tap on him starts nothing new. */
  running(): boolean;
  /** The command she walks to now, else null. */
  going(): EnGoShow | null;
  /** Every frame: where she is, the time, whether she walks by herself. */
  update(at: { x: number; z: number }, time: number, canMove: boolean): void;
  /**
   * Where the sparkles lead while his command runs: nowhere until its last rung (null), then to the nearest place of the
   * kind. Undefined: no command runs - the world's own goal.
   */
  goal(at: { x: number; z: number }): { x: number; z: number } | null | undefined;
  /** English turned off or the world left while his command runs: it is taken back, the request ends. */
  drop(): void;
  /** Settles when the request (or the replay) a tap started has ended, whichever way: the tests wait for it. */
  readonly settled: Promise<void>;
}

/**
 * The cat says "go by yourself, no sparkles" before the first command ever: a command never solved yet - the skill of
 * phrases has no task recorded (en_go is its only task in step 2) - and not told yet in this session. Read of the save,
 * not a flag in it: no new field, and the same in every world (a world's own flag would say it again in the forest).
 */
const freeTold = new WeakSet<Save>();
export const goFreeDue = (save: Save) => !freeTold.has(save) && (save.skills.en_phrases?.tasks ?? 0) === 0;

export function createPipRequest(env: PipRequestEnv): PipRequest {
  const { save } = env;
  let step: RequestStep | null = null;
  let going: EnGoShow | null = null;
  let settled: Promise<void> = Promise.resolve();

  /** A solved step: recorded to its skill as a resident's step is, its stars, his praise. */
  async function reward(s: RequestStep, res: TaskResult, kind: PipReward) {
    recordTask(save, STEP_SKILL[s], res.wrong, res.helped === true, { type: s, ...answerOf(res) });   // with a helper: no level up
    env.reward(kind);
    await env.pip('pip_yes');
  }

  /** A panel step of the request; false - closed: the request ends. */
  async function panelStep(s: PipPanelStep): Promise<boolean> {
    step = s;
    const res = await env.panel(s, levelFor(save, STEP_SKILL[s]));
    if (!res.solved) return false;
    await reward(s, res, 'step');
    await env.stop();
    return true;
  }

  /** His command; false - taken back. No place of any kind in the ring (a world without its list): the step is let go. */
  async function goStep(): Promise<boolean> {
    step = 'en_go';
    const kinds = kindsAt(env.places, env.given);
    if (!kinds.length) return true;
    const kind = pick(kinds, env.rng);
    if (goFreeDue(save)) { freeTold.add(save); await env.cat('pip_cat_go_free'); }
    const show = env.go(kind);
    if (!show) return true;
    going = show;
    env.closer(() => show.close());
    void env.command(show.clips);
    let res: TaskResult;
    try { res = await show.done; } finally { going = null; env.closer(null); }
    if (!res.solved) return false;
    await reward('en_go', res, 'step');
    await env.stop();
    return true;
  }

  /** The fourth solved: the piece of this world, his thanks; the cat on the first piece, his home on the second. */
  async function givePiece() {
    const n = pieceOf(env.world);
    if (!save.pip.pieces.includes(n)) save.pip.pieces.push(n);
    env.persist();
    const count = save.pip.pieces.length;
    await env.pip('pip_piece');
    if (count === 1) await env.cat('pip_cat_piece');
    if (count === 2) await env.pip('pip_mum');
    await env.pip('pip_more');
    await env.pip('pip_thanks');
  }

  async function request() {
    let on = true;
    // the first two tasks in one scene, by him
    const started = await env.scene('pip request', async () => {
      await env.pip('pip_look');
      on = await panelStep('en_tap') && await panelStep('note');
    });
    if (!started || !on) return;
    // the command outside a scene: she walks by herself
    if (!await goStep()) return;
    await env.scene('pip request end', async () => {
      if (await panelStep('en_count')) await givePiece();
    });
  }

  /** The piece taken: one task of his of the weaker skill, for a star (LEARN-16). */
  async function again() {
    await env.scene('pip again', async () => {
      await env.pip('pip_hi_world');
      const s = weakest(PANEL_STEPS, (x) => STEP_SKILL[x], save, env.rng);
      step = s;
      const res = await env.panel(s, levelFor(save, STEP_SKILL[s]));
      if (res.solved) { await reward(s, res, 'again'); await env.stop(); }
    });
  }

  return {
    tap() {
      if (going) { void env.command(going.clips); return; }
      if (step !== null) return;
      const run = requestWaits(save, env.world) ? request : again;
      // a step that threw ends the request as a closed one would (a scene reports its own failure itself)
      settled = run().catch((e: unknown) => { console.error('pip request failed:', e); }).finally(() => { step = null; going = null; });
    },
    step: () => step,
    running: () => step !== null,
    going: () => going,
    update(at, time, canMove) { going?.update(at, time, canMove); },
    goal: (at) => (going ? going.goal(at) : undefined),
    drop() { going?.close(); },
    get settled() { return settled; },
  };
}
