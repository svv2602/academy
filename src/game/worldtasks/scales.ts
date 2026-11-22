/**
 * "The scales with candies" played in the world (WORLD-22, docs/13-worlds.md; docs/worlds/world-4.md «Задания,
 * разыгранные в мире» item 3): on one pan of the scales lie candies with numbers, the other pan is an empty place, and
 * by the scales lie 2-4 lollipop weights with numbers; the heroine puts the weight with which the scales balance - the
 * one whose number is the candies' together. At level 5 of "Comparing" both sides lie on the pans (one candy each, the
 * numbers of the panel's signs, ../tasks/signs.ts) and she puts the sign `>`, `<` or `=` between them; then the scales
 * tilt to the bigger side. A wrong weight or sign goes to its place and gently comes back (nothing is taken away, the
 * course of a mistake is the frame's, ./core.ts); the hint is the one in three rungs of every task (LEARN-10).
 *
 * The numbers keep to the row «Сравнение» of the skill ladder (docs/11-learning.md, LEARN-09) through the panel's own
 * boundaries (`MAX`, `GAP` of ../tasks/compare.ts): up to 5 at level 1 with the other weights at least 2 away, up to 8 at
 * level 2, up to 10 at level 3, up to 20 at level 4, the signs at level 5. By the customer's decision of 2026-11-18 the
 * scales are written to the skill `compare` the same way a panel task is (the world hands the conversation its result).
 *
 * What this module keeps: the description by the level, the one rule "this weight (or sign) balances", the angle of the
 * beam for two sides - which way it tilts is part of the card - and the course of the task over a view (one tap on a
 * weight or a sign puts it, the hint, the walkthrough's door). How the scales look is the world's (`ScalesView`,
 * src/worlds/sweet/scales.ts).
 */
import type * as THREE from 'three';
import { randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { SpokenKey } from '../../ui/strings';
import type { WorldScope } from '../scope';
import { GAP, MAX } from '../tasks/compare';
import { generate as generateSigns, SIGNS, signOf, type Sign } from '../tasks/signs';
import { ladder, type Hint } from '../tasks/types';
import { hintOf, type ShownHint } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';

/** What the heroine puts: a lollipop weight with its number, or a sign card. */
export type ScalesChoice = number | Sign;

export interface ScalesBody {
  /** 'weight' - the right pan is empty and a weight goes on it (levels 1-4); 'sign' - both pans hold candies, a sign goes between them (level 5). */
  mode: 'weight' | 'sign';
  /** The numbers of the candies on the left pan (as the child sees the scales). */
  left: number[];
  /** The numbers of the candies on the right pan: none in 'weight' (it is the empty place). */
  right: number[];
  /** What lies by the scales, in the order it lies: the weights (2-4 numbers) or the three signs. */
  choices: ScalesChoice[];
  /** The index in `choices` of the only one that is right. */
  answer: number;
}
export interface ScalesSpec { type: 'scales'; level: number; prompt: SpokenKey; hint: Hint; body: ScalesBody }

/** The level of "Comparing" the scales play: 1-5. */
export const scalesLevel = (level: number) => Math.min(5, Math.max(1, Math.round(level)));

/** How many weights lie by the scales at a level of the weights (1-4): two at first, four at the top - the card's 2-4. */
export const WEIGHTS = (level: number) => (level <= 1 ? 2 : level >= 4 ? 4 : 3);
/** How many candies lie on the pan: one at levels 1-2 (a number against a number), two from level 3 (the card's "8 and 5"). */
export const CANDIES = (level: number) => (level <= 2 ? 1 : 2);
/** How far from the right number the other weights are drawn (first within this, wider only where it has too few). */
const NEAR = (level: number) => (level >= 4 ? 5 : 3);

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
/** The two sides of the scales with `choice` put: [left, right]; in 'sign' the sides are the candies' (a sign weighs nothing). */
export function sides(body: ScalesBody, choice: ScalesChoice | null): [number, number] {
  if (body.mode === 'sign') return [sum(body.left), sum(body.right)];
  return [sum(body.left), typeof choice === 'number' ? choice : 0];
}

/** The one rule of the scales: a weight balances the candies, a sign is the one between the two sides. */
export function balances(body: ScalesBody, choice: ScalesChoice): boolean {
  const [l, r] = sides(body, choice);
  return body.mode === 'weight' ? typeof choice === 'number' && l === r : choice === signOf(l, r);
}
/** The indices of the choices that are right: exactly one for every description. */
export const rightOnes = (body: ScalesBody) => body.choices.flatMap((c, i) => (balances(body, c) ? [i] : []));

/** rad: the tilt of the beam for the smallest difference, and for a difference of TILT_SPAN and more. */
export const TILT_MIN = 0.1, TILT_MAX = 0.28, TILT_SPAN = 10;
/**
 * The angle of the beam for two sides: positive - the left pan goes down (the left side is heavier), negative - the
 * right one, 0 - balanced. Always visible for a difference of one, larger for a larger one, never past TILT_MAX.
 */
export function beamAngle(left: number, right: number): number {
  const d = left - right;
  if (d === 0) return 0;
  return Math.sign(d) * (TILT_MIN + (TILT_MAX - TILT_MIN) * Math.min(1, (Math.abs(d) - 1) / (TILT_SPAN - 1)));
}

/**
 * The angle of the beam as the task stands. Waiting: with a weight to put the candies weigh their pan down; with a sign
 * to put the beam is held level by its pin (else the tilt would give the sign away before she chose). `put`: what is
 * on the scales now - a weight weighs its pan (a wrong one tilts the beam the way it is wrong before it comes back); the
 * right sign lets the beam go and it tilts to the bigger side, a wrong one leaves it held.
 */
export function angleOf(body: ScalesBody, put: number | null): number {
  if (body.mode === 'weight') return beamAngle(...sides(body, put === null ? null : body.choices[put]));
  return put !== null && put === body.answer ? beamAngle(...sides(body, null)) : 0;
}

/** The other weights: different from the right one by at least GAP of the level and from each other, within 1..MAX. */
function otherWeights(level: number, right: number, n: number, rng: Rng): number[] {
  const max = MAX(level), gap = GAP(level);
  const ok = (w: number) => w >= 1 && w <= max && Math.abs(w - right) >= gap;
  const range = (lo: number, hi: number) => Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i).filter(ok);
  let pool = range(right - NEAR(level), right + NEAR(level));
  if (pool.length < n) pool = range(1, max);
  return shuffle(pool, rng).slice(0, n);
}

/** The candies of the pan at a level of the weights: their numbers and their sum within the level's numbers. */
function candies(level: number, rng: Rng): number[] {
  if (CANDIES(level) === 1) return [randInt(1, MAX(level), rng)];
  if (level === 3) {
    // two candies whose sum is up to 10
    const total = randInt(3, MAX(3), rng), a = randInt(1, total - 1, rng);
    return [a, total - a];
  }
  // level 4: the numbers to 20 written as digits - a candy of ten and some, and a small one with it (11..20 together)
  const total = randInt(11, MAX(4), rng), b = randInt(1, Math.min(9, total - 10), rng);
  return shuffle([total - b, b], rng);
}

export function generateScales(level: number, rng: Rng): ScalesSpec {
  const lv = scalesLevel(level);
  if (lv === 5) {
    // the signs: the two numbers of the panel's signs (equal ones come up), the three sign cards in their order
    const s = generateSigns(5, rng);
    const choices = [...SIGNS];
    // the panel's lines and hint: the question, the way of the sign, both numbers laid out as things, the lit answer
    // (the panel's signs always have a hint; its type allows none, so the same ladder stands behind it)
    const hint = s.hint ?? ladder('h1_signs', { key: 'h2_signs', steps: [{ do: 'pairUp' }] });
    return { type: 'scales', level: lv, prompt: s.prompt, hint, body: { mode: 'sign', left: [s.body.a], right: [s.body.b], choices, answer: choices.indexOf(s.body.answer) } };
  }
  const left = candies(lv, rng), right = sum(left);
  const choices = shuffle([right, ...otherWeights(lv, right, WEIGHTS(lv) - 1, rng)], rng);
  return {
    type: 'scales', level: lv,
    // the recorded lines the game has (no voice of its own in the grey build): "how much is missing to the number" - the
    // empty pan misses its weight; the hint of the panel's comparing by digits - the bigger number sounds later; both
    // laid out as things (the candies and every weight as dots); what glows (the right weight)
    prompt: 't_missing',
    hint: ladder('h1_compare_num', { key: 'h2_compare_num', steps: [{ do: 'showNumbers' }] }),
    body: { mode: 'weight', left, right: [], choices, answer: choices.indexOf(right) },
  };
}

/**
 * The scales as a world draws them (src/worlds/sweet/scales.ts). Choice `i` is `body.choices[i]`.
 */
export interface ScalesView {
  /** Where the camera looks, the direction the child looks at the scales (radians), how far the things to tap lie (./core.ts). */
  readonly center: THREE.Vector3;
  readonly facing: number;
  readonly extent: { side: number; depth: number };
  /** Where a tap on choice `i` (lying) is measured from, and how big it is around that point (m). */
  choice(i: number): { pos: THREE.Vector3; r: number };
  /** Choice `i` is right: it goes to its place (the empty pan, the gap between the pans) and stays; the beam goes to `angle`. */
  put(i: number, angle: number): void;
  /** Choice `i` is wrong: it goes to its place, the beam to `angle` (the way a wrong weight weighs), then it comes back and the beam goes back to `rest`. */
  back(i: number, angle: number, rest: number): void;
  /** The second rung of the hint: every side and every weight shows its number as dots (or hides them). */
  dots(on: boolean): void;
  /** The third rung: choice `i` glows (null - none). */
  glow(i: number | null): void;
  /** The task is over: `solved` - what is put stays on the balanced scales, the rest is taken away; else all of it. */
  clear(solved: boolean): void;
}

export interface WorldScalesOptions {
  /** The farthest a tap may land from a weight or a sign on the screen, in pixels. */
  reach: number;
  /** The world's scope: the task's timer goes with the world. */
  scope: WorldScope;
}

export interface WorldScales extends WorldTaskShow {
  readonly spec: ScalesSpec;
}

/** s of game time a right choice takes to land and the beam to settle before the task ends (the world's view moves them so). */
export const SETTLE = 1.2;
/** The deliberate mistakes the walkthrough makes on the scales: the card's acceptance asks for three (WORLD-22). */
export const WALK_MISTAKES = 3;

/**
 * Opens the scales in the world: the prompt is said and taps are judged until the right weight or sign is put. The
 * world draws and moves its things (`view`), opens it in its frame and calls `update` in its own.
 */
export function showScalesInWorld(spec: ScalesSpec, view: ScalesView, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldScalesOptions): WorldScales {
  const { body } = spec;
  const rest = angleOf(body, null);
  hooks.prompt(spec.prompt);
  const hint: ShownHint | null = hintOf(spec.hint, () => view.glow(body.answer), {
    showNumbers: () => view.dots(true),
    pairUp: () => view.dots(true),
  });
  let solved = false;
  const core = taskCore(o.scope, hooks, hint, (ok) => view.clear(ok));

  function put(i: number) {
    if (!core.alive || !Number.isInteger(i) || i < 0 || i >= body.choices.length) return;
    if (!balances(body, body.choices[i])) { view.back(i, angleOf(body, i), rest); void core.mistake(); return; }
    solved = true;
    view.dots(false); view.glow(null);
    view.put(i, angleOf(body, i));
    hooks.good();
    core.solve(SETTLE * 1000 + 300);       // the weight lands and the beam settles level (or to the bigger side), then it ends
  }
  const wrongOne = () => body.choices.findIndex((c) => !balances(body, c));

  return {
    kind: 'scales', spec, done: core.done, center: view.center, facing: view.facing, extent: view.extent,
    mistakes: WALK_MISTAKES,
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best = -1, bd = o.reach;
      body.choices.forEach((_, i) => { const d = screenDist(view.choice(i).pos); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) put(best);
      return true;
    },
    solve: () => put(body.answer),
    // a wrong move: a weight (or sign) that does not balance - there is always one, the same may be put again
    wrong: () => {
      if (!core.alive) return false;
      put(wrongOne());
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind: 'scales', phase: core.phase, wrongs: core.wrongs, moves: solved ? 1 : 0, rung: core.rung, progress: [] }),
    reach: o.reach,
    targets: () => (core.alive ? body.choices.map((_, i) => ({ ...view.choice(i), right: i === body.answer })) : []),
    progress: () => [],
    resume: () => {},
    update: () => {},
  };
}
