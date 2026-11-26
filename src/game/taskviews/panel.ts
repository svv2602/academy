/**
 * The panel of a task (ARCH-09): it shows a task's description (`tasks/<type>.ts`) on `#task` and plays it out.
 * A task never punishes: a wrong tap shakes, the cat encourages, and a type-specific hint follows (`flow.ts`).
 *
 * The show of each type is its own module (`taskviews/<type>.ts`); it only draws and wires the taps, and draws no
 * random numbers: every choice of the task is in the description. `runTask` makes the description from the task's rng.
 * The shows are drawn by `hints.css` (the composition of a number by its own `compose.css`, the neighbours of a number
 * by `neighbors.css`, the signs by `signs.css`).
 *
 * The helpers of a task (src/game/helpers.ts) have their buttons in a corner of the panel, only when she has one and
 * where it gives something: the owl - before any mistake or hint, the first rung of the hint at once (and the first
 * mistake then goes on with the second rung); the abacus - in a task with a number on the levels without ten frames,
 * the task drawn again with its things in ten frames (`PanelCtx.framed`). Neither gives the answer.
 */
import { createRng, type Rng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { BankKey } from '../../core/voice';
import type { SpokenKey } from '../../ui/strings';
import { generate, type SpecOf, type TaskSpec } from '../tasks/index';
import type { TaskType } from '../tasks/types';
import type { SkillId } from '../skills';
import type { TaskHelpers } from '../helpers';
import type { HelperId } from '../shop';
import { FRAMES_FROM } from './tenframe';
import { afterMistake, type ShownHint } from './flow';
import { countView } from './count';
import { addView } from './add';
import { subView } from './sub';
import { compareView } from './compare';
import { patternView } from './pattern';
import { oddView } from './odd';
import { pairsView } from './pairs';
import { orderView } from './order';
import { sortView } from './sort';
import { simonView } from './simon';
import { missingView } from './missing';
import { houseView } from './house';
import { neighborsView } from './neighbors';
import { signsView } from './signs';
import { diffView } from './diff';
import { puzzleView } from './puzzle';
import './hints.css';

/** The skill a task of each type trains (LEARN-03): the save keeps a level per skill (src/game/skills.ts). */
export const SKILL: Record<TaskType, SkillId> = {
  count: 'count', add: 'add', sub: 'sub', compare: 'compare', order: 'series', pattern: 'pattern',
  pairs: 'memory', simon: 'memory', odd: 'classify', sort: 'classify', missing: 'compose', house: 'compose',
  neighbors: 'series', signs: 'compare', diff: 'attention', puzzle: 'assemble',
};

/** `helped`: a helper was taken in this task (src/game/helpers.ts): the level does not grow for it. */
export interface TaskResult { solved: boolean; wrong: number; helped?: boolean }
/**
 * Of a task solved on the panel: its type and the ms from its showing to the right answer, the time the page was
 * hidden left out (the parents' report, src/game/answers.ts). Kept by the result object, not in it: a result is what
 * every task gives back, of the panel or of the world (a task in the world has neither).
 */
const answered = new WeakMap<TaskResult, { type: string; ms?: number }>();
/** The type and the time of the task whose result is `res` (empty for a task closed or played in the world). */
export const answerOf = (res: TaskResult): { type?: string; ms?: number } => answered.get(res) ?? {};
/**
 * What the game asks the cat to say. `wrong` and `hint` return the end of their line, so the next step can wait for it.
 * A line that is cut off by a newer one settles at once as well: a settled promise does not mean "heard to the end",
 * and whoever waits must check for itself that its step is still wanted.
 */
export interface TaskHooks {
  /** Show + speak the question; `ask`: the clip of the bank that asks this very example (R37), `key` without it. */
  prompt(key: SpokenKey, ask?: BankKey): void;
  number(n: number): void;         // say a number aloud while counting
  wrong(): Spoken;                 // gentle "try again"
  hint(key: SpokenKey): Spoken;    // the cat says the hint aloud, with its subtitle
  good(): void;                    // right-answer chime
  /** Her helpers (the owl, the abacus); absent - no helper buttons on the panel. */
  helpers?: TaskHelpers;
}

/** What a show gets from the panel: where to draw, the cat, and the task as it goes on. */
export interface PanelCtx {
  stage: HTMLElement; opts: HTMLElement; hooks: TaskHooks;
  wrongs: number; alive: boolean;
  /** The mistake (value of `wrongs`) after which the child last counted the things by herself; -1 = not yet. */
  own: number;
  right(): void; wrong(el?: HTMLElement): void;
  /** The hint of this task type: the line the cat says, and the solution shown once the line has ended. */
  hint: ShownHint | null;
  cheat: () => void;
  /** The abacus was taken: the show lays its things out in ten frames whatever the level. */
  framed?: boolean;
}
/** The show of one task type: draws the description on the panel and wires its taps. */
export type PanelView<T extends TaskType> = (spec: SpecOf<T>, c: PanelCtx) => void;
type Views = { [T in TaskType]?: PanelView<T> };

// ---------- shared by the shows ----------

export const el = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
export const tap = (e: HTMLElement, fn: () => void) => e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); fn(); });
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One button per thing, each with its tilt from the task's description (one tilt per thing). */
export function items(parent: HTMLElement, emoji: string, tilt: readonly number[], cls = '') {
  return tilt.map((r) => {
    const b = el('button', 'it ' + cls, emoji);
    b.style.setProperty('--r', `${r}deg`);
    parent.appendChild(b); return b;
  });
}
export function badge(e: HTMLElement, n: number) { e.querySelector('i')?.remove(); const b = el('i', '', String(n)); e.appendChild(b); }

/** Answer buttons, judged by the task's model; returns the correct one. */
export function options<V extends number | string>(c: PanelCtx, values: readonly V[], right: (v: V) => boolean) {
  let ok!: HTMLElement;
  for (const v of values) {
    const b = el('button', 'opt', String(v));
    if (right(v)) ok = b;
    tap(b, () => { if (right(v)) { b.classList.add('yes'); c.right(); } else { b.classList.add('no'); c.wrong(b); } });
    c.opts.appendChild(b);
  }
  c.cheat = () => ok.dispatchEvent(new PointerEvent('pointerdown'));
  return ok;
}
/** Lights `e` as the answer: the hint step "pulse the answer" on the panel. */
export const pulseOf = (e: HTMLElement | null) => (e ? () => { e.classList.add('pulse'); } : null);

/** Numbers every element one by one, aloud: the "let's count together" hint. A newer mistake stops the count: its own round will count again. */
export async function countAloud(c: PanelCtx, list: HTMLElement[]) {
  const round = c.wrongs;
  for (const e of list) e.querySelector('i')?.remove();
  for (let i = 0; i < list.length && c.alive && c.wrongs === round; i++) { badge(list[i], i + 1); list[i].classList.add('hit'); c.hooks.number(i + 1); await wait(750); }
}

// ---------- the shows ----------

// The shows import the helpers above and this module imports the shows: a cycle, which holds because nothing of a show
// is used while the modules load. The list is built at a call, so a show loaded first never meets an unready binding.
const viewOf = <T extends TaskType>(type: T) => ({
  count: countView, add: addView, sub: subView, compare: compareView, pattern: patternView,
  odd: oddView, pairs: pairsView, order: orderView, sort: sortView, simon: simonView, missing: missingView, house: houseView,
  neighbors: neighborsView, signs: signsView, diff: diffView, puzzle: puzzleView,
} satisfies Views as Views)[type] as PanelView<T> | undefined;

/**
 * Does the abacus give something in this task: a task with things to count whose show does not lay them out in ten
 * frames by itself (count, add, take away below FRAMES_FROM; the missing number up to 10; the signs, whose things are
 * shown by the second rung only).
 */
export function abacusHelps(spec: TaskSpec): boolean {
  switch (spec.type) {
    case 'count': case 'add': case 'sub': return spec.level < FRAMES_FROM;
    case 'missing': return spec.body.sum <= 10;
    case 'signs': return true;
    default: return false;
  }
}

let current: PanelCtx | null = null;
/** Test hook: solves the task on screen the way a child would (through the same handlers). */
export function cheatTask() { current?.cheat(); return !!current; }

/** Shows the described task on the panel; ends when it is solved or closed. */
export function showTask(spec: TaskSpec, hooks: TaskHooks): Promise<TaskResult> {
  const view = viewOf(spec.type);
  if (!view) throw new Error(`no panel show for the task type "${spec.type}"`);
  const root = document.getElementById('task')!, stage = document.getElementById('taskStage')!, opts = document.getElementById('taskOpts')!;
  const close = document.getElementById('taskClose')!;
  stage.className = 't-stage t-' + spec.type; stage.innerHTML = ''; opts.innerHTML = ''; stage.removeAttribute('style'); delete stage.dataset.shown;
  root.classList.remove('hidden', 'won');
  const card = root.querySelector('.t-card') ?? root;
  card.querySelector('.t-helps')?.remove();
  return new Promise((resolve) => {
    let helped = false;
    /** The rungs the owl has given already: the mistakes go on from the next one. */
    let given = 0;
    const helps = el('div', 't-helps');
    // the time of the answer: from now to the right answer, without the time the page was hidden (the child away)
    const t0 = performance.now();
    let hiddenMs = 0, hiddenAt = document.hidden ? t0 : -1, answeredMs: number | undefined;
    const onVis = () => {
      if (document.hidden && hiddenAt < 0) hiddenAt = performance.now();
      else if (!document.hidden && hiddenAt >= 0) { hiddenMs += performance.now() - hiddenAt; hiddenAt = -1; }
    };
    document.addEventListener('visibilitychange', onVis);
    const finish = (solved: boolean) => {
      c.alive = false; current = null; helps.remove(); root.classList.add('hidden');
      document.removeEventListener('visibilitychange', onVis);
      const r: TaskResult = helped ? { solved, wrong: c.wrongs, helped } : { solved, wrong: c.wrongs };
      if (solved) answered.set(r, answeredMs === undefined ? { type: spec.type } : { type: spec.type, ms: answeredMs });
      resolve(r);
    };
    const c: PanelCtx = {
      stage, opts, hooks, wrongs: 0, alive: true, own: -1, hint: null, cheat: () => {},
      // The end is set before the sound: whatever the sound does, a right answer always ends the task (a panel left up
      // with its answer taken and no end - the walkthrough's "quest stuck" - was the one way a chain could stand still).
      right() {
        if (!c.alive) return;
        answeredMs = Math.max(0, performance.now() - t0 - hiddenMs - (hiddenAt >= 0 ? performance.now() - hiddenAt : 0));
        c.alive = false; root.classList.add('won'); setTimeout(() => finish(true), 1100); try { hooks.good(); } catch { /* no sound */ } },
      wrong(e) {
        if (!c.alive) return;
        const round = ++c.wrongs;
        if (e) e.classList.add('no');
        void afterMistake(c, round, hooks);
      },
    };
    current = c;
    close.onclick = () => { if (c.alive) finish(false); };
    const draw = () => {
      (view as PanelView<TaskType>)(spec, c);
      // The rung whose line has ended and whose show has run is marked on the stage (no style): the walkthrough waits
      // for it instead of a pause, and then checks what that rung put on screen (tools/shot.mjs, R16). After the owl a
      // mistake goes on from the rung after the ones she was given.
      const shown = c.hint;
      if (shown) c.hint = { key: (round) => shown.key(round + given), show: (round) => { stage.dataset.shown = String(round + given); shown.show(round + given); } };
    };
    draw();
    // ---- the helpers: a button for each one she has, where it gives something ----
    const button = (id: HelperId, icon: string, on: () => void) => {
      const b = el('button', 't-help', icon);
      b.id = id === 'owl' ? 'taskOwl' : 'taskAbacus'; b.dataset.id = id;
      tap(b, () => { if (!c.alive || !hooks.helpers?.use(id)) return; helped = true; b.remove(); on(); if (!helps.children.length) helps.remove(); });
      helps.appendChild(b);
      return b;
    };
    if (hooks.helpers?.has('owl') && c.hint) {
      const owl = button('owl', '🦉', () => {
        given = 1;
        const shown = c.hint!, round = c.wrongs;
        // the first rung as after a first mistake: its line, then what it shows (a rung of the way shows nothing)
        void hooks.hint(shown.key(1 - given)).then(() => { if (c.alive && c.wrongs === round) { stage.dataset.shown = '1'; } });
      });
      // a mistake or a hint before the owl was asked: the hint is on its way already, the owl has nothing to add
      const was = c.wrong.bind(c);
      c.wrong = (e) => { owl.remove(); if (!helps.children.length) helps.remove(); was(e); };
    }
    if (hooks.helpers?.has('abacus') && abacusHelps(spec)) {
      button('abacus', '🧮', () => {
        c.framed = true;
        stage.innerHTML = ''; opts.innerHTML = '';
        draw();
      });
    }
    if (helps.children.length) card.appendChild(helps);
    hooks.prompt(spec.prompt, spec.ask);
  });
}

/**
 * `rng` is the source of every random choice of the task (ARCH-08); the game passes its own, seeded by `?seed=`.
 * Without it the task is as random as before: the default is taken at each call.
 */
export function runTask(type: TaskType, level: number, hooks: TaskHooks, rng: Rng = createRng(null)): Promise<TaskResult> {
  return showTask(generate(type, level, rng), hooks);
}
