/**
 * "The shape bridge" played in the world (WORLD-20, docs/13-worlds.md; docs/worlds/world-4.md «Задания, разыгранные в
 * мире» item 2): on the chocolate river by the bridge float 6-10 waffle tiles of different shapes; the miller names a
 * rule ("only triangles"), the heroine taps the tiles that keep it - each rises into the bridge's deck - and the bridge
 * is done once every tile that keeps it is in. At the top levels the rule is a harder feature ("has three corners",
 * "round, but not red"). A wrong tile gently wobbles and stays where it floats (nothing is taken away, the course of a
 * mistake is the frame's, ./core.ts); the hint is the one in three rungs of every task (LEARN-10). There is no timer;
 * closed in the middle, the tiles in the deck stay (the world keeps `progress`, ./kept.ts).
 *
 * The levels keep to the row «Классификация» of the skill ladder (docs/11-learning.md, LEARN-09), as the panel's "odd one
 * out" (../tasks/odd.ts) reads it - the categories first, then one feature with the colour the same for all, then two
 * features at once:
 * - level 1: 6 tiles of the three plainest shapes (circle, square, triangle), one colour, one size; the rule a shape;
 * - level 2: 7 tiles, the rectangle joins (the first alike pair, the square and the rectangle);
 * - level 3: 8 tiles of the four shapes, big and small ones: the size is there and does not count;
 * - level 4: 9 tiles, the oval and the rhombus join - the panel's level 4, "the odd one by a feature (shape, size)", one
 *   colour for all - and the rule is a harder shape or a feature: an oval, a rhombus, a square, "three corners";
 * - level 5: 10 tiles in four colours - the panel's "two features": "round, but not red", "with corners, but not blue".
 * The tiles that keep the rule are 2-4 (the card), the others never fewer than two of them, and at least one tile is
 * alike to a fitting one - its colour and its size - but of another shape (the card's acceptance).
 *
 * The shapes are named as a preschool names them (a circle is not an oval, a square is not a rectangle); where school
 * geometry would disagree - a square is a rectangle and a rhombus too - a task asking for rectangles or rhombi lays no
 * square on the river, so no tile is right by one reading and wrong by the other.
 *
 * By the customer's decision of 2026-11-18 the bridge is written to the skill `classify` the same way a panel task is
 * (the world hands the conversation its result, src/game/dialogue.ts `stepDone`).
 *
 * What this module keeps: the description by the level, the one rule "this tile keeps the rule", the board that judges a
 * tap and gives its middle as a list of numbers, and the course of the task over a view (taps by their distance on the
 * screen, the hint, the walkthrough's door). How the river, the tiles and the deck look is the world's (`BridgeView`,
 * src/worlds/sweet/bridge.ts).
 */
import type * as THREE from 'three';
import { pick, randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { SpokenKey } from '../../ui/strings';
import type { WorldScope } from '../scope';
import { FIG_COLORS, type FigColor } from '../tasks/odd';
import { ladder, type Hint } from '../tasks/types';
import { hintOf, type ShownHint } from '../taskviews/flow';
import type { TaskHooks, TaskResult } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';

/** The shapes of the waffle tiles: the four of the card, the oval and the rhombus of its top levels. */
export const TILE_SHAPES = ['circle', 'square', 'triangle', 'rect', 'oval', 'rhombus'] as const;
export type TileShape = typeof TILE_SHAPES[number];
/** The colours of the glaze: the panel's figures' (../tasks/odd.ts FIG_COLORS), so "not red" and "not blue" mean the same there and here. */
export type TileColor = FigColor;
export interface Tile { shape: TileShape; color: TileColor; small: boolean }

/** The round shapes and the ones with corners: what the two rules of level 5 ask about. */
export const ROUND: ReadonlySet<TileShape> = new Set(['circle', 'oval']);
export const CORNERS: Readonly<Record<TileShape, number>> = { circle: 0, oval: 0, triangle: 3, square: 4, rect: 4, rhombus: 4 };

/**
 * What the miller asks for: a shape by its name, or a feature - "three corners" (level 4), "round, but not red" and
 * "with corners, but not blue" (level 5; the two questions of the draft of lines the customer took on 2026-11-18).
 */
export type BridgeRule = TileShape | 'corners3' | 'roundNotRed' | 'cornersNotBlue';

/** The one rule of the bridge: does this tile keep what the miller asked for. */
export function keeps(rule: BridgeRule, t: Tile): boolean {
  switch (rule) {
    case 'corners3': return CORNERS[t.shape] === 3;
    case 'roundNotRed': return ROUND.has(t.shape) && t.color !== 'red';
    case 'cornersNotBlue': return CORNERS[t.shape] > 0 && t.color !== 'blue';
    default: return t.shape === rule;
  }
}

export interface BridgeBody {
  rule: BridgeRule;
  /** The tiles floating by the bridge, in the order the world lays them out. */
  tiles: Tile[];
}
export interface BridgeSpec { type: 'bridge'; level: number; prompt: SpokenKey; hint: Hint; body: BridgeBody }

/** The level of "Classification" the bridge plays: 1-5. */
export const bridgeLevel = (level: number) => Math.min(5, Math.max(1, Math.round(level)));

/** How many tiles float by the bridge at a level: six at first, ten at the top - the card's 6-10. */
export const TILES = (level: number) => 5 + bridgeLevel(level);
/** How many of them keep the rule, the lowest and the highest: two at level 1, up to four at the top - the card's 2-4. */
export const FITTING: Readonly<Record<number, readonly [number, number]>> = { 1: [2, 2], 2: [2, 3], 3: [3, 3], 4: [3, 4], 5: [3, 4] };
/** The shapes that float at a level (the categories grow: three, four, six). */
export const SHAPES_BY_LEVEL: Readonly<Record<number, readonly TileShape[]>> = {
  1: ['circle', 'square', 'triangle'],
  2: ['circle', 'square', 'triangle', 'rect'],
  3: ['circle', 'square', 'triangle', 'rect'],
  4: TILE_SHAPES,
  5: TILE_SHAPES,
};
/** What the miller may ask for at a level: a shape of the level's at first, a harder shape or a feature at 4, two features at 5. */
export const RULES_BY_LEVEL: Readonly<Record<number, readonly BridgeRule[]>> = {
  1: ['circle', 'square', 'triangle'],
  2: ['circle', 'square', 'triangle', 'rect'],
  3: ['circle', 'square', 'triangle', 'rect'],
  4: ['oval', 'rhombus', 'square', 'corners3'],
  5: ['roundNotRed', 'cornersNotBlue'],
};
/** How many colours the glaze has at a level: one for all up to 4 (the panel's level 4 "one colour for all"), four at 5. */
export const COLORS_AT = (level: number) => (bridgeLevel(level) >= 5 ? 4 : 1);
/** Whether big and small tiles float together: from level 3 (the size is there and does not count). */
export const SIZES_AT = (level: number) => bridgeLevel(level) >= 3;

/** The shape nearest to each: what a look-alike tile of another shape is drawn from first. */
const NEAR: Readonly<Record<TileShape, readonly TileShape[]>> = {
  circle: ['oval'], oval: ['circle'], square: ['rect', 'rhombus'], rect: ['square'], rhombus: ['square', 'triangle'], triangle: ['rhombus'],
};
/** A square is a rectangle and a rhombus in school geometry: a task asking for those lays none. */
const NOT_WITH: Partial<Record<BridgeRule, readonly TileShape[]>> = { rect: ['square'], rhombus: ['square'] };

/** The tiles of `body` that keep its rule (their numbers): 2-4 of them for every description. */
export const rightOnes = (body: BridgeBody) => body.tiles.flatMap((t, i) => (keeps(body.rule, t) ? [i] : []));

/** A tile that does not keep the rule, of the colour and the size of one that does, of another shape: the card's look-alike. */
export function lookAlikes(body: BridgeBody): number[] {
  const right = rightOnes(body).map((i) => body.tiles[i]);
  return body.tiles.flatMap((t, i) => (!keeps(body.rule, t) && right.some((r) => r.color === t.color && r.small === t.small && r.shape !== t.shape) ? [i] : []));
}

const same = (a: Tile, b: Tile) => a.shape === b.shape && a.color === b.color && a.small === b.small;

export function generateBridge(level: number, rng: Rng): BridgeSpec {
  const lv = bridgeLevel(level);
  const rule = pick(RULES_BY_LEVEL[lv], rng);
  const shapes = SHAPES_BY_LEVEL[lv].filter((s) => !(NOT_WITH[rule] ?? []).includes(s));
  // one colour for all up to level 4; at level 5 all four, so the colour the rule leaves out is always there
  const colors: TileColor[] = shuffle([...FIG_COLORS], rng).slice(0, COLORS_AT(lv));
  const sizes = SIZES_AT(lv) ? [false, true] : [false];
  const all: Tile[] = shapes.flatMap((shape) => colors.flatMap((color) => sizes.map((small) => ({ shape, color, small }))));
  const fitting = all.filter((t) => keeps(rule, t)), other = all.filter((t) => !keeps(rule, t));
  const [lo, hi] = FITTING[lv];
  const k = randInt(lo, hi, rng), n = TILES(lv);
  /** `m` tiles drawn from `pool`, all of it before any twice (the pool mixed anew each round). */
  const draw = (pool: readonly Tile[], m: number) => {
    // an empty pool would never fill: a table of the levels that leaves a rule no tile fails here, not hangs
    if (!pool.length && m > 0) throw new Error(`the shape bridge: no tile to draw for the rule "${rule}" at level ${lv}`);
    const out: Tile[] = [];
    while (out.length < m) out.push(...shuffle([...pool], rng).slice(0, m - out.length));
    return out;
  };
  const right = draw(fitting, k);
  // the look-alike first: of the colour and the size of a fitting tile, of its nearest shape that floats here (else any
  // other shape of that colour and size); at level 5 also the trap of the second feature - a tile of a fitting shape in
  // the colour the rule leaves out
  const model = right[0];
  const alikeOf = (t: Tile) => other.filter((o) => o.color === t.color && o.small === t.small && o.shape !== t.shape);
  const near = alikeOf(model).filter((o) => NEAR[model.shape].includes(o.shape));
  const lead: Tile[] = [pick(near.length ? near : alikeOf(model), rng)];
  if (lv === 5) {
    const out = rule === 'roundNotRed' ? 'red' : 'blue';
    const trap = other.filter((o) => o.color === out && keeps(rule, { ...o, color: model.color }));
    lead.push(pick(trap, rng));
  }
  // then the rest of the other shapes: every shape of the level that keeps no rule floats at least once where it can
  const rest = other.filter((o) => !lead.some((l) => same(l, o)));
  const wrong = [...lead, ...draw(rest.length ? rest : other, n - k - lead.length)];
  const tiles = shuffle([...right, ...wrong], rng);
  return {
    type: 'bridge', level: lv,
    // the recorded lines the game has (no voice of its own in the grey build; the eight recorded questions of the
    // bridge are in the draft of lines, not yet in the game): "let's find together those that are alike" - under the
    // world's subtitle that names the rule; the hint in three rungs (LEARN-10) - the way: the colour is the same for all,
    // look at the shape and the size (levels 1-4, where it is true), look at the colour and at the shape (level 5);
    // together: "here is its place" - the shape asked for is drawn on the empty places of the deck (level 5: first the
    // colour - the tiles of the colour left out go dim - then the shape); what glows (a tile that keeps the rule)
    prompt: 'h2_odd',
    hint: lv < 5
      ? ladder('h1_odd_shape', { key: 'h1_puzzle', steps: [{ do: 'frameAlike' }] })
      : ladder('h1_odd_two', { key: 'h2_sort_two', steps: [{ do: 'tryBaskets' }, { do: 'frameAlike' }] }),
    body: { rule, tiles },
  };
}

/** The colour a rule of level 5 leaves out (the tiles that go dim at the second rung), else null. */
export const leftOut = (rule: BridgeRule): TileColor | null => (rule === 'roundNotRed' ? 'red' : rule === 'cornersNotBlue' ? 'blue' : null);
/** The shapes the rule asks for, as the second rung draws them on the empty places of the deck. */
export const shapesOf = (rule: BridgeRule): TileShape[] => TILE_SHAPES.filter((s) => FIG_COLORS.some((color) => keeps(rule, { shape: s, color, small: false })));

/**
 * The board of a bridge: which tiles are in the deck, in the order they rose (the n-th one lies in the n-th place of the
 * deck), and the judge of a tap. `kept`: the middle kept from before (`placed()` of an earlier board; anything not a
 * tile of this bridge that keeps the rule is dropped).
 */
export function bridgeBoard(spec: BridgeSpec, kept: readonly number[] = []) {
  const { body } = spec;
  const right = new Set(rightOnes(body));
  const placed: number[] = [];
  for (const i of kept) if (Number.isInteger(i) && right.has(i) && !placed.includes(i)) placed.push(i);
  const board = {
    /** The tiles in the deck, in the order they rose: the middle as the world keeps it. */
    placed: () => [...placed],
    /** The tiles still floating. */
    floating: () => body.tiles.map((_, i) => i).filter((i) => !placed.includes(i)),
    /** The place of the deck tile `i` lies in, -1 for one still floating. */
    slotOf: (i: number) => placed.indexOf(i),
    /** How many places the deck has: one for every tile that keeps the rule. */
    slots: right.size,
    get done() { return placed.length === right.size; },
    /** A tap on tile `i`: 'fit' - it keeps the rule and rises into the deck; 'wrong' - it does not; 'none' - no such tile floating. */
    tap(i: number): 'fit' | 'wrong' | 'none' {
      if (!Number.isInteger(i) || i < 0 || i >= body.tiles.length || placed.includes(i)) return 'none';
      if (!right.has(i)) return 'wrong';
      placed.push(i);
      return 'fit';
    },
  };
  return board;
}
export type BridgeBoard = ReturnType<typeof bridgeBoard>;

/**
 * The bridge as a world draws it (src/worlds/sweet/bridge.ts): it stands in the world whether the task is open or not
 * (the tiles in the deck stay there), the task only moves it. Tile `i` is `body.tiles[i]`, place `k` of the deck is
 * where the k-th tile to rise lies.
 */
export interface BridgeView {
  /** Where the camera looks, the direction the child looks across the river (radians), how far the things to tap lie (./core.ts). */
  readonly center: THREE.Vector3;
  readonly facing: number;
  readonly extent: { side: number; depth: number };
  /** Where a tap on tile `i` (floating) is measured from, and how big it is around that point (m). */
  tile(i: number): { pos: THREE.Vector3; r: number };
  /** Tile `i` keeps the rule: it rises out of the chocolate into place `k` of the deck and stays there. */
  rise(i: number, k: number): void;
  /** Tile `i` does not: it gently wobbles and stays where it floats. */
  wobble(i: number): void;
  /** The second rung: the shape asked for drawn on the empty places of the deck (or taken away). */
  outline(on: boolean): void;
  /** The second rung at level 5: the tiles of the colour the rule leaves out go dim (or bright again). */
  dim(on: boolean): void;
  /** The third rung: tile `i` glows (null - none). */
  glow(i: number | null): void;
}

export interface WorldBridgeOptions {
  /** The farthest a tap may land from a tile on the screen, in pixels. */
  reach: number;
  /** The world's scope: the task's timer goes with the world. */
  scope: WorldScope;
  /** The middle kept from before (`progress()` of an earlier opening). */
  kept?: readonly number[];
  /** The wrong moves of the earlier openings of this bridge: the result counts them too, as one task's. */
  before?: number;
  /** A tile rose, or a wrong one was tapped: the middle and the wrong moves so far to keep (the world stores them at once). */
  keep(progress: number[], wrongs: number): void;
}

export interface WorldBridge extends WorldTaskShow {
  readonly spec: BridgeSpec;
  readonly board: BridgeBoard;
}

/** s of game time a tile takes to rise into the deck (the world's view moves it so). */
export const RISE = 0.7;
/** The deliberate mistakes the walkthrough makes on the bridge: the card's acceptance asks for three (WORLD-20). */
export const WALK_MISTAKES = 3;

/**
 * Opens the bridge in the world: the prompt is said and taps are judged until every tile that keeps the rule is in the
 * deck. The world draws and moves its things (`view`), opens it in its frame and calls `update` in its own. The result
 * counts the wrong moves of this opening and of the earlier ones (`before`): the bridge is one task, however many times
 * she walks off and back.
 */
export function showBridgeInWorld(spec: BridgeSpec, view: BridgeView, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldBridgeOptions): WorldBridge {
  const board = bridgeBoard(spec, o.kept);
  const before = Math.max(0, Math.floor(o.before ?? 0));
  hooks.prompt(spec.prompt);
  // the lit answer: the first tile still floating that keeps the rule
  const next = () => board.floating().find((i) => keeps(spec.body.rule, spec.body.tiles[i])) ?? null;
  const hint: ShownHint | null = hintOf(spec.hint, () => view.glow(next()), {
    frameAlike: () => view.outline(true),
    tryBaskets: () => view.dim(true),
  });
  const core = taskCore(o.scope, hooks, hint, () => { view.glow(null); view.outline(false); view.dim(false); });
  const done: Promise<TaskResult> = core.done.then((r) => ({ ...r, wrong: r.wrong + before }));

  function tapTile(i: number) {
    if (!core.alive) return;
    const out = board.tap(i);
    if (out === 'none') return;
    if (out === 'wrong') {
      view.wobble(i);
      void core.mistake();
      o.keep(board.placed(), before + core.wrongs);
      return;
    }
    view.glow(null);
    view.rise(i, board.slotOf(i));
    hooks.good();
    o.keep(board.placed(), before + core.wrongs);
    if (board.done) core.solve(RISE * 1000 + 300);       // the last tile lands in the deck, then the bridge is done
  }
  /** One right move: the next tile that keeps the rule, tapped. False once none is left floating. */
  const right = () => {
    const i = next();
    if (i === null) return false;
    tapTile(i);
    return true;
  };

  return {
    kind: 'bridge', spec, board, done, center: view.center, facing: view.facing, extent: view.extent,
    mistakes: WALK_MISTAKES,
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best = -1, bd = o.reach;
      for (const i of board.floating()) { const d = screenDist(view.tile(i).pos); if (d < bd) { bd = d; best = i; } }
      if (best >= 0) tapTile(best);
      return true;
    },
    solve: () => { while (core.alive && !board.done && right()) { /* every tile that keeps the rule into the deck */ } },
    // a wrong move: a tile that does not keep the rule - they never leave the river, so there is always one
    wrong: () => {
      if (!core.alive) return false;
      const i = board.floating().find((x) => !keeps(spec.body.rule, spec.body.tiles[x]));
      if (i === undefined) return false;
      tapTile(i);
      return true;
    },
    // the walkthrough's middle: right moves until half the deck is laid, never its last tile
    half: () => {
      let n = 0;
      while (core.alive && board.placed().length < Math.floor(board.slots / 2) && right()) n++;
      return n;
    },
    close: () => core.close(),
    state: () => ({ kind: 'bridge', phase: core.phase, wrongs: core.wrongs, moves: board.placed().length, rung: core.rung, progress: board.placed() }),
    reach: o.reach,
    targets: () => (core.alive ? board.floating().map((i) => ({ ...view.tile(i), right: keeps(spec.body.rule, spec.body.tiles[i]) })) : []),
    progress: () => board.placed(),
    // the middle is given at the opening (`kept`): the board is made of it
    resume: () => {},
    update: () => {},
  };
}
