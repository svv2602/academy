/**
 * "The gingerbread house" assembled in the world (WORLD-21, docs/13-worlds.md; docs/worlds/world-4.md «Задания,
 * разыгранные в мире» item 1): at the place of a house an outline of icing with 3-6 empty places - the wall, the roof
 * (or its two halves), the door, the windows, the chimney - and next to it the pieces, each with exactly one place by
 * its shape. The heroine taps a piece, then a place: a piece that fits stands in, one that does not goes toward the place
 * and gently comes back (nothing is taken away, the course of a mistake is the frame's, ./core.ts). The house is done
 * once every place is filled; the world opens its door then.
 *
 * What this module keeps: the description (the places and the pieces by the level of "Classification"), the one rule
 * "this piece fits this place", the board that judges the taps and gives its middle as a list of numbers, and the course
 * of the task (taps by their distance on the screen, the hint, the walkthrough's door). How the house looks - its
 * outline, the pieces lying by it, the door that opens - is the world's (`HouseView`, src/worlds/sweet/house.ts): a
 * world of a later step may draw it otherwise and keep this.
 *
 * By the customer's decision of 2026-11-18 (docs/worlds/world-4.md question 3) the house is written to no skill: the
 * level of "Classification" is only read - the number of places and how alike the pieces are grow with it. There is no
 * timer; closed in the middle, what stands in its places stays (the world keeps `progress`, ./kept.ts).
 */
import type * as THREE from 'three';
import { pick, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { SpokenKey } from '../../ui/strings';
import type { WorldScope } from '../scope';
import { ladder, type Hint } from '../tasks/types';
import { hintOf, type ShownHint } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';

/** A shape of a piece and of its place. */
export type HouseShape = 'wall' | 'roof' | 'roofL' | 'roofR' | 'door' | 'winSq' | 'winTall' | 'winRound' | 'chimney';
/** The outline of a shape: a rectangle, a triangle, a left or a right half of a triangle, an arch, a circle. */
export type HouseForm = 'rect' | 'tri' | 'halfL' | 'halfR' | 'arch' | 'circle';

/**
 * The shapes by their outline and size in metres (the house's front is 3.4 m wide, 3.1 m high to the top of its roof): what makes two pieces alike is
 * here, so the world draws them by these numbers. The square window and the taller one differ only in height, the two
 * halves of the roof only in which way they lean - the alike pieces of the top levels.
 */
export const SHAPES: Readonly<Record<HouseShape, { form: HouseForm; w: number; h: number }>> = {
  wall: { form: 'rect', w: 3.4, h: 2.0 },
  roof: { form: 'tri', w: 4.0, h: 1.1 },
  roofL: { form: 'halfL', w: 2.0, h: 1.1 },
  roofR: { form: 'halfR', w: 2.0, h: 1.1 },
  door: { form: 'arch', w: 0.9, h: 1.3 },
  winSq: { form: 'rect', w: 0.9, h: 0.9 },
  winTall: { form: 'rect', w: 0.9, h: 1.15 },
  winRound: { form: 'circle', w: 0.95, h: 0.95 },
  chimney: { form: 'rect', w: 0.6, h: 0.8 },
};

/**
 * The places of the house by the level of "Classification" (1-5), one set of them drawn at random where a level has
 * several: 3 clearly different shapes at level 1, a window more at 2, five places with a first pair of alike pieces
 * possible at 3 (the square window and the chimney), six at 4 with the roof in two mirrored halves, six at 5 with the
 * square window beside a slightly taller one as well. No shape twice in a set: each piece has exactly one place.
 */
export const HOUSE_BY_LEVEL: Readonly<Record<number, readonly (readonly HouseShape[])[]>> = {
  1: [['wall', 'roof', 'door']],
  2: [['wall', 'roof', 'door', 'winSq'], ['wall', 'roof', 'door', 'winRound']],
  3: [['wall', 'roof', 'door', 'winSq', 'winRound'], ['wall', 'roof', 'door', 'winSq', 'chimney']],
  4: [['wall', 'roofL', 'roofR', 'door', 'winSq', 'winRound']],
  5: [['wall', 'roofL', 'roofR', 'door', 'winSq', 'winTall']],
};

export interface HouseBody {
  /** The empty places of the outline, in the order the world lays them out. */
  places: HouseShape[];
  /** The pieces lying by the house, in the order they lie: the shapes of the places, mixed. */
  pieces: HouseShape[];
}
export interface HouseSpec { type: 'house'; level: number; prompt: SpokenKey; hint: Hint; body: HouseBody }

/** The level of "Classification" the house plays: 1-5. */
export const houseLevel = (level: number) => Math.min(5, Math.max(1, Math.round(level)));

/** The one rule of the house: a piece fits a place of its own shape and no other. */
export const fits = (piece: HouseShape, place: HouseShape) => piece === place;

/** The places (their numbers) piece `i` of `body` fits: exactly one for every piece of a description. */
export const placesOf = (body: HouseBody, i: number) => body.places.flatMap((s, k) => (fits(body.pieces[i], s) ? [k] : []));

/**
 * How unlike two shapes are: 0 for the same; their outlines (the mirrored halves of the roof nearly the same outline,
 * a half and the whole triangle closer than any other two) and their sizes (the logarithm of the ratio of the widths and
 * of the heights). Two pieces closer than ALIKE count as alike.
 */
export function unlikeness(a: HouseShape, b: HouseShape): number {
  const fa = SHAPES[a].form, fb = SHAPES[b].form;
  const halves = (f: HouseForm) => f === 'halfL' || f === 'halfR';
  const form = fa === fb ? 0 : halves(fa) && halves(fb) ? 0.25 : (halves(fa) && fb === 'tri') || (halves(fb) && fa === 'tri') ? 0.6 : 1;
  return form + Math.abs(Math.log(SHAPES[a].w / SHAPES[b].w)) + Math.abs(Math.log(SHAPES[a].h / SHAPES[b].h));
}
export const ALIKE = 0.6;
/** The pairs of alike pieces of a description: what grows with the level besides the number of places. */
export function alikePairs(body: HouseBody): number {
  let n = 0;
  for (let i = 0; i < body.places.length; i++) for (let j = i + 1; j < body.places.length; j++) if (unlikeness(body.places[i], body.places[j]) < ALIKE) n++;
  return n;
}

export function generateHouse(level: number, rng: Rng): HouseSpec {
  const lv = houseLevel(level);
  const places = [...pick(HOUSE_BY_LEVEL[lv], rng)];
  // the pieces lie mixed: never in the order of their places, where there is another order to lie in
  let pieces = shuffle([...places], rng);
  for (let i = 0; i < 4 && pieces.every((s, k) => s === places[k]); i++) pieces = shuffle([...places], rng);
  return {
    type: 'house', level: lv,
    // the recorded lines the game has (no voice of its own in the grey build): "let's put it together", then the hint
    // in three rungs (LEARN-10) - the colour is the same, look at the shape and the size; here is its place (the place
    // of the piece that came back glows); what glows (the piece and its place)
    prompt: 't_puzzle',
    hint: ladder('h1_odd_shape', { key: 'h1_puzzle', steps: [{ do: 'pulseNext' }] }),
    body: { places, pieces },
  };
}

/**
 * The board of a house: which pieces stand in their places, which one is picked up, and the judge of a tap on a place.
 * `kept`: the middle kept from before (`placed()` of an earlier board; anything not a piece of this house is dropped).
 */
export function houseBoard(spec: HouseSpec, kept: readonly number[] = []) {
  const { places, pieces } = spec.body;
  const standing = new Set(kept.filter((i) => Number.isInteger(i) && i >= 0 && i < pieces.length));
  let picked: number | null = null;
  const placeOf = (i: number) => placesOf(spec.body, i)[0];
  const board = {
    get picked() { return picked; },
    /** The pieces standing in their places, by number: the middle as the world keeps it. */
    placed: () => [...standing].sort((a, b) => a - b),
    /** The pieces still lying by the house. */
    loose: () => pieces.map((_, i) => i).filter((i) => !standing.has(i)),
    /** The places still empty. */
    empty: () => places.map((_, k) => k).filter((k) => ![...standing].some((i) => placeOf(i) === k)),
    placeOf,
    get done() { return standing.size === pieces.length; },
    /** A piece lying by the house is picked up (another one picked before is put down); false - none such. */
    pick(i: number) {
      if (!Number.isInteger(i) || i < 0 || i >= pieces.length || standing.has(i)) return false;
      picked = i;
      return true;
    },
    /** Puts the picked piece on place `k`: 'fit' - it stands there now; 'wrong' - not its shape, it is put down; 'none' - nothing picked or the place is filled. */
    put(k: number): 'fit' | 'wrong' | 'none' {
      if (picked === null || !board.empty().includes(k)) return 'none';
      const i = picked;
      picked = null;
      if (!fits(pieces[i], places[k])) return 'wrong';
      standing.add(i);
      return 'fit';
    },
  };
  return board;
}
export type HouseBoard = ReturnType<typeof houseBoard>;

/**
 * The house as a world draws it (src/worlds/sweet/house.ts): it stands in the world whether the task is open or not
 * (what is assembled stays in its places), the task only moves it. Piece `i` is `body.pieces[i]`, place `k` is `body.places[k]`.
 */
export interface HouseView {
  /** Where the camera looks, the direction the child looks at the house (radians), how far the things to tap lie (./core.ts). */
  readonly center: THREE.Vector3;
  readonly facing: number;
  readonly extent: { side: number; depth: number };
  /** Its own things for the camera's check (WorldTaskShow.own): the house itself. */
  readonly own?: readonly THREE.Object3D[];
  /** Where a tap on piece `i` (lying) is measured from, and how big it is around that point (m). */
  piece(i: number): { pos: THREE.Vector3; r: number };
  /** The same for place `k` of the outline. */
  place(k: number): { pos: THREE.Vector3; r: number };
  /** Piece `i` is picked up (lifted over where it lies), null - none. */
  picked(i: number | null): void;
  /** Piece `i` fits place `k`: it flies there and stays. */
  fit(i: number, k: number): void;
  /** Piece `i` does not fit place `k`: it goes toward it and gently comes back to where it lay. */
  back(i: number, k: number): void;
  /** The hint's light: piece `i` and place `k` glow (null - not that one). */
  glow(i: number | null, k: number | null): void;
}

export interface WorldHouseOptions {
  /** The farthest a tap may land from a piece or a place on the screen, in pixels. */
  reach: number;
  /** The world's scope: the task's timer goes with the world. */
  scope: WorldScope;
  /** The middle kept from before (`progress()` of an earlier opening). */
  kept?: readonly number[];
  /** A piece stood in its place: the middle to keep now (the world stores it at once - the child may leave any moment). */
  keep(progress: number[]): void;
}

export interface WorldHouse extends WorldTaskShow {
  readonly board: HouseBoard;
}

/** s of game time a fitting piece takes to fly into its place (the world's view moves it so). */
export const FLY = 0.6;

/**
 * Opens the house in the world: the prompt is said, and taps are judged until every place is filled. The world draws
 * and moves its things (`view`), opens it in its frame and calls `update` in its own.
 */
export function showHouseInWorld(spec: HouseSpec, view: HouseView, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldHouseOptions): WorldHouse {
  const board = houseBoard(spec, o.kept);
  /** The piece of the last wrong move: its place is what the hint shows. */
  let last: number | null = null;
  hooks.prompt(spec.prompt);
  // The hint for the piece that came back (or the first one lying, when the child put a piece of the hint in meanwhile).
  const hinted = () => (last !== null && board.loose().includes(last) ? last : board.loose()[0] ?? null);
  const hint: ShownHint | null = hintOf(spec.hint, () => { const i = hinted(); view.glow(i, i === null ? null : board.placeOf(i)); }, {
    pulseNext: () => { const i = hinted(); view.glow(null, i === null ? null : board.placeOf(i)); },
  });
  const core = taskCore(o.scope, hooks, hint, () => { view.picked(null); view.glow(null, null); });

  function tapPiece(i: number) {
    if (!core.alive || !board.pick(i)) return;
    view.picked(i);
  }
  function tapPlace(k: number) {
    if (!core.alive) return;
    const i = board.picked;
    const out = board.put(k);
    if (out === 'none' || i === null) return;
    view.picked(null);
    if (out === 'wrong') { last = i; view.back(i, k); void core.mistake(); return; }
    view.glow(null, null);
    view.fit(i, k);
    hooks.good();
    o.keep(board.placed());
    if (board.done) core.solve(FLY * 1000 + 300);       // the last piece lands, then the house is done
  }
  /** One right move: a piece put on its place (picked first, as a tap does). */
  // false once no piece went in (none left, or a description broken so a piece has no empty place): the loops of
  // `solve` and `half` stop rather than spin
  const right = () => {
    const i = board.loose()[0], n = board.placed().length;
    if (i === undefined) return false;
    tapPiece(i); tapPlace(board.placeOf(i));
    return board.placed().length > n;
  };

  return {
    kind: 'house', done: core.done, board, center: view.center, facing: view.facing, extent: view.extent, own: view.own,
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best: { piece: boolean; n: number } | null = null, bd = o.reach;
      for (const i of board.loose()) { const d = screenDist(view.piece(i).pos); if (d < bd) { bd = d; best = { piece: true, n: i }; } }
      for (const k of board.empty()) { const d = screenDist(view.place(k).pos); if (d < bd) { bd = d; best = { piece: false, n: k }; } }
      if (best?.piece) tapPiece(best.n); else if (best) tapPlace(best.n);
      return true;
    },
    solve: () => { while (core.alive && !board.done && right()) { /* every piece lying put in its place */ } },
    // a wrong move: a piece lying put on an empty place of another shape (none once one place is left)
    wrong: () => {
      if (!core.alive) return false;
      for (const i of board.loose()) {
        const k = board.empty().find((x) => !fits(spec.body.pieces[i], spec.body.places[x]));
        if (k !== undefined) { tapPiece(i); tapPlace(k); return true; }
      }
      return false;
    },
    // the walkthrough's middle: right moves until half the places are filled, never the last one
    half: () => {
      let n = 0;
      while (core.alive && board.placed().length < Math.floor(spec.body.places.length / 2) && right()) n++;
      return n;
    },
    close: () => core.close(),
    state: () => ({ kind: 'house', phase: core.phase, wrongs: core.wrongs, moves: board.placed().length, rung: core.rung, progress: board.placed() }),
    reach: o.reach,
    // with nothing picked up: the pieces lying (any is a right first tap); with one picked: the empty places, its own the right one
    targets: () => {
      if (!core.alive) return [];
      const i = board.picked;
      if (i === null) return board.loose().map((n) => ({ ...view.piece(n), right: true }));
      return board.empty().map((k) => ({ ...view.place(k), right: k === board.placeOf(i) }));
    },
    progress: () => board.placed(),
    // the middle is given at the opening (`kept`): the board is made of it
    resume: () => {},
    update: () => {},
  };
}
