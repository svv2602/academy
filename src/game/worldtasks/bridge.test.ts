/**
 * "The shape bridge" (./bridge.ts, WORLD-20): the generator by the level of "Classification" - 6 to 10 tiles, 2 to 4 of
 * them keeping the rule, at least one alike to a fitting one but of another shape (the card's acceptance), the rule's
 * feature by the row «Классификация» of the ladder; the board that judges a tap and keeps its middle; the course of the
 * task over a view - a fitting tile rises into the deck, a wrong one wobbles and stays with the hint of every task,
 * closed in the middle it opens again in that middle and its result counts the earlier mistakes, the walkthrough's door.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import type { TaskHooks } from '../taskviews/panel';
import {
  CORNERS, FITTING, RULES_BY_LEVEL, SHAPES_BY_LEVEL, TILES, WALK_MISTAKES, bridgeBoard, bridgeLevel, generateBridge, keeps, leftOut,
  lookAlikes, rightOnes, shapesOf, showBridgeInWorld, type BridgeSpec, type BridgeView, type Tile,
} from './bridge';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

const LEVELS = [1, 2, 3, 4, 5];
const many = (level: number, n = 400) => Array.from({ length: n }, (_, i) => generateBridge(level, createRng(`bridge-${level}-${i}`)));
const t = (shape: Tile['shape'], color: Tile['color'] = 'yellow', small = false): Tile => ({ shape, color, small });

describe('the shape bridge by the level of "Classification" (WORLD-20)', () => {
  it.each(LEVELS)('level %i: 6-10 tiles, 2-4 of them keep the rule and never fewer than two do not, one alike to a fitting one but of another shape', (level) => {
    for (const s of many(level)) {
      const { tiles } = s.body, right = rightOnes(s.body);
      expect(s.level).toBe(level);
      expect(tiles).toHaveLength(TILES(level));
      expect(tiles.length).toBeGreaterThanOrEqual(6);
      expect(tiles.length).toBeLessThanOrEqual(10);
      expect(right.length, `${s.body.rule}: ${JSON.stringify(tiles)}`).toBeGreaterThanOrEqual(2);
      expect(right.length).toBeLessThanOrEqual(4);
      expect(right.length).toBeGreaterThanOrEqual(FITTING[level][0]);
      expect(right.length).toBeLessThanOrEqual(FITTING[level][1]);
      expect(tiles.length - right.length).toBeGreaterThanOrEqual(2);
      // the card's look-alike: the colour and the size of a fitting tile, another shape, and it does not keep the rule
      const alike = lookAlikes(s.body);
      expect(alike.length, `${s.body.rule}: ${JSON.stringify(tiles)}`).toBeGreaterThanOrEqual(1);
      for (const i of alike) expect(right).not.toContain(i);
    }
  });

  it('the rule\'s feature by the ladder: a plain shape at 1-3, a harder shape or "three corners" at 4, two features at 5 - each reached', () => {
    const rules = (l: number) => new Set(many(l, 200).map((s) => s.body.rule));
    expect(rules(1)).toEqual(new Set(['circle', 'square', 'triangle']));
    expect(rules(2)).toEqual(new Set(['circle', 'square', 'triangle', 'rect']));
    expect(rules(3)).toEqual(new Set(['circle', 'square', 'triangle', 'rect']));
    expect(rules(4)).toEqual(new Set(['oval', 'rhombus', 'square', 'corners3']));
    expect(rules(5)).toEqual(new Set(['roundNotRed', 'cornersNotBlue']));
    for (const l of LEVELS) expect(rules(l)).toEqual(new Set(RULES_BY_LEVEL[l]));
  });

  it('the boundaries of the levels: the shapes, the colours, the sizes and the counts, each reached', () => {
    const of = (l: number) => many(l, 200);
    const shapes = (l: number) => new Set(of(l).flatMap((s) => s.body.tiles.map((x) => x.shape)));
    const colours = (l: number) => of(l).map((s) => new Set(s.body.tiles.map((x) => x.color)).size);
    const sizes = (l: number) => new Set(of(l).flatMap((s) => s.body.tiles.map((x) => x.small)));
    const counts = (l: number) => new Set(of(l).map((s) => rightOnes(s.body).length));
    expect(shapes(1)).toEqual(new Set(['circle', 'square', 'triangle']));
    expect(shapes(2)).toEqual(new Set(SHAPES_BY_LEVEL[2]));
    expect(shapes(3)).toEqual(new Set(SHAPES_BY_LEVEL[3]));
    expect(shapes(4)).toEqual(new Set(['circle', 'square', 'triangle', 'rect', 'oval', 'rhombus']));
    // the colour is the same for all up to level 4 (the panel's level 4: one colour, the odd one by its shape or size)
    for (const l of [1, 2, 3, 4]) expect(new Set(colours(l)), `level ${l}`).toEqual(new Set([1]));
    expect(Math.min(...colours(5))).toBeGreaterThanOrEqual(2);
    // the size: one at 1-2, big and small from 3
    expect(sizes(1)).toEqual(new Set([false]));
    expect(sizes(2)).toEqual(new Set([false]));
    expect(sizes(3)).toEqual(new Set([false, true]));
    expect(counts(1)).toEqual(new Set([2]));
    expect(counts(2)).toEqual(new Set([2, 3]));
    expect(counts(3)).toEqual(new Set([3]));
    expect(counts(4)).toEqual(new Set([3, 4]));
    expect(counts(5)).toEqual(new Set([3, 4]));
  });

  it('level 5: the colour the rule leaves out is on the river in a tile of a fitting shape - the second feature counts', () => {
    for (const s of many(5)) {
      const out = leftOut(s.body.rule)!;
      expect(s.body.tiles.some((x) => x.color === out && keeps(s.body.rule, { ...x, color: 'yellow' })), JSON.stringify(s.body)).toBe(true);
    }
  });

  it('a square is a rectangle and a rhombus in school geometry: no square floats when those are asked for', () => {
    for (const l of [2, 3, 4]) for (const s of many(l)) if (s.body.rule === 'rect' || s.body.rule === 'rhombus') expect(s.body.tiles.map((x) => x.shape)).not.toContain('square');
  });

  it('the rule: a shape by its name, three corners, round but not red, with corners but not blue', () => {
    expect(keeps('triangle', t('triangle'))).toBe(true);
    expect(keeps('triangle', t('rhombus'))).toBe(false);
    expect(keeps('circle', t('oval'))).toBe(false);
    expect(keeps('square', t('rect'))).toBe(false);
    expect(keeps('corners3', t('triangle', 'red', true))).toBe(true);
    expect(keeps('corners3', t('square'))).toBe(false);
    expect(keeps('roundNotRed', t('oval', 'blue'))).toBe(true);
    expect(keeps('roundNotRed', t('circle', 'red'))).toBe(false);
    expect(keeps('roundNotRed', t('square', 'blue'))).toBe(false);
    expect(keeps('cornersNotBlue', t('rhombus', 'red'))).toBe(true);
    expect(keeps('cornersNotBlue', t('triangle', 'blue'))).toBe(false);
    expect(keeps('cornersNotBlue', t('circle', 'green'))).toBe(false);
    expect(CORNERS.triangle).toBe(3);
    expect(shapesOf('roundNotRed')).toEqual(['circle', 'oval']);
    expect(shapesOf('corners3')).toEqual(['triangle']);
    expect(shapesOf('cornersNotBlue')).toEqual(['square', 'triangle', 'rect', 'rhombus']);
  });

  it('a level out of 1-5 plays its nearest; its lines are recorded ones: the question, then the hint in three rungs', () => {
    expect(bridgeLevel(0)).toBe(1);
    expect(bridgeLevel(9)).toBe(5);
    const s = generateBridge(2, createRng('lines'));
    expect(s.prompt).toBe('h2_odd');
    expect(s.hint.rungs.map((r) => r.key)).toEqual(['h1_odd_shape', 'h1_puzzle', 'h3_show']);
    expect(s.hint.rungs[1].steps).toEqual([{ do: 'frameAlike' }]);
    expect(s.hint.rungs[2].steps).toEqual([{ do: 'pulseAnswer' }]);
    const top = generateBridge(5, createRng('lines'));
    expect(top.hint.rungs.map((r) => r.key)).toEqual(['h1_odd_two', 'h2_sort_two', 'h3_show']);
    expect(top.hint.rungs[1].steps).toEqual([{ do: 'tryBaskets' }, { do: 'frameAlike' }]);
  });
});

/** Triangles asked for: tiles 0, 2 and 4 keep the rule, the others do not. */
const spec = (): BridgeSpec => ({
  ...generateBridge(1, createRng('x')),
  body: { rule: 'triangle', tiles: [t('triangle'), t('square'), t('triangle'), t('circle'), t('triangle'), t('rhombus')] },
});

describe('the board of the bridge', () => {
  it('a tile that keeps the rule rises into the next place of the deck; one that does not is wrong and stays; the done bridge has every fitting tile in', () => {
    const b = bridgeBoard(spec());
    expect(b.slots).toBe(3);
    expect(b.tap(1)).toBe('wrong');
    expect(b.floating()).toContain(1);
    expect(b.tap(2)).toBe('fit');
    expect(b.slotOf(2)).toBe(0);
    expect(b.tap(2)).toBe('none');             // in the deck: not tapped again
    expect(b.tap(0)).toBe('fit');
    expect(b.placed()).toEqual([2, 0]);
    expect(b.done).toBe(false);
    expect(b.tap(4)).toBe('fit');
    expect(b.done).toBe(true);
    expect(b.tap(9)).toBe('none');
  });

  it('made of a middle kept, it stands as it was left; anything not a fitting tile of this bridge is dropped', () => {
    const b = bridgeBoard(spec(), [4, 1, 4, 7, -1, 1.5, 0]);
    expect(b.placed()).toEqual([4, 0]);
    expect(b.floating()).toEqual([1, 2, 3, 5]);
  });
});

function listen() {
  const heard = { prompts: [] as SpokenKey[], hints: [] as SpokenKey[], wrong: 0, good: 0 };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'> = {
    prompt: (k) => { heard.prompts.push(k); }, good: () => { heard.good++; },
    wrong: () => { heard.wrong++; return quick(); }, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}

/** A view of the bridge that only records what the task asks of it: tile i at x = i. */
function fakeView() {
  const calls: string[] = [];
  const view: BridgeView = {
    center: new THREE.Vector3(), facing: 0, extent: { side: 3, depth: 3 },
    tile: (i) => ({ pos: new THREE.Vector3(i, 0, 0), r: 0.4 }),
    rise: (i, k) => { calls.push(`rise ${i} ${k}`); },
    wobble: (i) => { calls.push(`wobble ${i}`); },
    outline: (on) => { calls.push(`outline ${on}`); },
    dim: (on) => { calls.push(`dim ${on}`); },
    glow: (i) => { calls.push(`glow ${i}`); },
  };
  return { view, calls };
}
/** A tap at x on the line of the fake view (its distance on the "screen" is the distance along x, in pixels x 10). */
const at = (x: number) => (p: THREE.Vector3) => Math.abs(p.x - x) * 10;

describe('the bridge in the world: taps, the hint, the middle, the door of the walkthrough', () => {
  const open = (kept: number[] = [], before = 0, s = spec()) => {
    const { hooks, heard } = listen(), { view, calls } = fakeView(), stored: [number[], number][] = [];
    const show = showBridgeInWorld(s, view, hooks, { reach: 4, scope: createWorldScope(new THREE.Scene()), kept, before, keep: (p, w) => { stored.push([p, w]); } });
    return { show, heard, calls, stored };
  };

  it('opened: the question; a tap on a fitting tile raises it into the deck and keeps the middle at once', () => {
    const { show, heard, calls, stored } = open();
    expect(heard.prompts).toEqual(['h2_odd']);
    expect(show.state()).toMatchObject({ kind: 'bridge', phase: 'input', wrongs: 0, moves: 0, rung: 0, progress: [] });
    expect(show.targets().map((x) => x.right)).toEqual([true, false, true, false, true, false]);
    expect(show.tap(at(2))).toBe(true);
    expect(calls).toEqual(['glow null', 'rise 2 0']);
    expect(heard.good).toBe(1);
    expect(stored).toEqual([[[2], 0]]);
    expect(show.state()).toMatchObject({ moves: 1, progress: [2] });
    expect(show.targets()).toHaveLength(5);
    // a tap on nothing is the task's too, and does nothing
    expect(show.tap(at(50))).toBe(true);
    expect(show.state().moves).toBe(1);
  });

  it('a wrong tile wobbles and stays; three mistakes - the way said, then the shape on the empty places, then a fitting tile lit', async () => {
    const { show, heard, calls, stored } = open();
    show.tap(at(1));                            // a square
    expect(calls).toEqual(['wobble 1']);
    expect(show.state()).toMatchObject({ wrongs: 1, moves: 0, progress: [] });
    expect(show.board.floating()).toContain(1);
    expect(stored).toEqual([[[], 1]]);          // the mistake is kept for the result, even before a tile is in
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
    expect(heard.hints).toEqual(['h1_odd_shape']);
    expect(show.state()).toMatchObject({ phase: 'input', rung: 1 });
    expect(calls.slice(1)).toEqual([]);         // rung 1 only says the way
    show.tap(at(3));
    await vi.runAllTimersAsync();
    expect(heard.hints.at(-1)).toBe('h1_puzzle');
    expect(calls.at(-1)).toBe('outline true');
    show.tap(at(5));
    await vi.runAllTimersAsync();
    expect(heard.hints.at(-1)).toBe('h3_show');
    expect(calls.at(-1)).toBe('glow 0');        // the first fitting tile still floating
    expect(show.state().wrongs).toBe(3);
    // the right tile, then the rest: solved, with its three mistakes
    show.solve();
    await vi.runAllTimersAsync();
    expect(await show.done).toEqual({ solved: true, wrong: 3 });
  });

  it('level 5: the second rung dims the colour the rule leaves out, then draws the shape', async () => {
    const s5: BridgeSpec = { ...generateBridge(5, createRng('five')), body: { rule: 'roundNotRed', tiles: [t('circle', 'blue'), t('circle', 'red'), t('oval', 'green'), t('square', 'blue')] } };
    const { show, heard, calls } = open([], 0, s5);
    show.tap(at(1)); await vi.runAllTimersAsync();
    show.tap(at(3)); await vi.runAllTimersAsync();
    expect(heard.hints).toEqual(['h1_odd_two', 'h2_sort_two']);
    expect(calls.slice(-2)).toEqual(['dim true', 'outline true']);
  });

  it('closed in the middle, it ends unsolved; opened with that middle and its mistakes it goes on from there, its result counting them all', async () => {
    const first = open();
    first.show.wrong();
    await vi.runAllTimersAsync();
    first.show.tap(at(4));
    first.show.close();
    expect(await first.show.done).toEqual({ solved: false, wrong: 1 });
    expect(first.show.tap(at(0))).toBe(false);
    const [kept, wrongs] = first.stored.at(-1)!;
    expect([kept, wrongs]).toEqual([[4], 1]);
    const again = open(kept, wrongs);
    expect(again.show.state()).toMatchObject({ phase: 'input', wrongs: 0, moves: 1, progress: [4] });
    expect(again.show.targets()).toHaveLength(5);
    again.show.solve();
    expect(again.show.state().progress).toEqual([4, 0, 2]);
    expect(again.stored.at(-1)).toEqual([[4, 0, 2], 1]);
    await vi.runAllTimersAsync();
    expect(await again.show.done).toEqual({ solved: true, wrong: 1 });
  });

  it('the door of the walkthrough: three mistakes asked for, a wrong move always possible, the middle never the end, solve lays the whole deck', async () => {
    const { show, calls } = open();
    expect(show.mistakes).toBe(WALK_MISTAKES);
    expect(WALK_MISTAKES).toBe(3);
    for (let k = 1; k <= 3; k++) { expect(show.wrong()).toBe(true); await vi.runAllTimersAsync(); }
    expect(calls.filter((c) => c.startsWith('wobble'))).toHaveLength(3);
    // a wrong move never raises a tile
    expect(show.state()).toMatchObject({ wrongs: 3, moves: 0 });
    expect(show.half!()).toBe(1);
    expect(show.state()).toMatchObject({ moves: 1, wrongs: 3 });
    expect(show.half!()).toBe(0);
    expect(show.wrong()).toBe(true);
    await vi.runAllTimersAsync();
    show.solve();
    await vi.runAllTimersAsync();
    expect(show.state().phase).toBe('solved');
    expect(show.targets()).toEqual([]);
    expect(show.board.done).toBe(true);
  });

  it('the world left in the middle: its timer goes with the scope, the task never ends by itself', async () => {
    const { hooks } = listen(), { view } = fakeView(), scope = createWorldScope(new THREE.Scene());
    const show = showBridgeInWorld(spec(), view, hooks, { reach: 4, scope, keep: () => {} });
    let ended = false;
    void show.done.then(() => { ended = true; });
    show.solve();
    scope.dispose();
    await vi.runAllTimersAsync();
    expect(ended).toBe(false);
  });
});
