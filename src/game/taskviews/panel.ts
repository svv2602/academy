/**
 * The panel of a task (ARCH-09): it shows a task's description (`tasks/<type>.ts`) on `#task` and plays it out.
 * A task never punishes: a wrong tap shakes, the cat encourages, and a type-specific hint follows (`flow.ts`).
 *
 * The show of each type is its own module (`taskviews/<type>.ts`); it only draws and wires the taps, and draws no
 * random numbers: every choice of the task is in the description. `runTask` makes the description from the task's rng.
 * The shows are drawn by `hints.css` (the composition of a number by its own `compose.css`).
 */
import { createRng, type Rng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { BankKey } from '../../core/voice';
import type { SpokenKey } from '../../ui/strings';
import { generate, type SpecOf, type TaskSpec } from '../tasks/index';
import type { TaskType } from '../tasks/types';
import type { SkillId } from '../skills';
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
import './hints.css';

/** The skill a task of each type trains (LEARN-03): the save keeps a level per skill (src/game/skills.ts). */
export const SKILL: Record<TaskType, SkillId> = {
  count: 'count', add: 'add', sub: 'sub', compare: 'compare', order: 'series', pattern: 'pattern',
  pairs: 'memory', simon: 'memory', odd: 'classify', sort: 'classify', missing: 'compose', house: 'compose',
};

export interface TaskResult { solved: boolean; wrong: number; }
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
} satisfies Views as Views)[type] as PanelView<T> | undefined;

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
  return new Promise((resolve) => {
    const finish = (solved: boolean) => { c.alive = false; current = null; root.classList.add('hidden'); resolve({ solved, wrong: c.wrongs }); };
    const c: PanelCtx = {
      stage, opts, hooks, wrongs: 0, alive: true, own: -1, hint: null, cheat: () => {},
      right() { if (!c.alive) return; c.alive = false; hooks.good(); root.classList.add('won'); setTimeout(() => finish(true), 1100); },
      wrong(e) {
        if (!c.alive) return;
        const round = ++c.wrongs;
        if (e) e.classList.add('no');
        void afterMistake(c, round, hooks);
      },
    };
    current = c;
    close.onclick = () => { if (c.alive) finish(false); };
    (view as PanelView<TaskType>)(spec, c);
    // The rung whose line has ended and whose show has run is marked on the stage (no style): the walkthrough waits
    // for it instead of a pause, and then checks what that rung put on screen (tools/shot.mjs, R16).
    const shown = c.hint;
    if (shown) c.hint = { key: shown.key, show: (round) => { stage.dataset.shown = String(round); shown.show(round); } };
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
