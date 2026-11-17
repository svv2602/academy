// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from './context';
import type { DebugExtras, DebugTravel } from './debug';
import { ONE_EACH, marked, type Declared, type ItemState, type Marks } from './describe';
import type { CharacterDef, WorldItem } from './world';

/**
 * window.__game and the description of the world played (ARCH-16): `items`, `missing` and `itemProblems` answer for
 * the world played at the moment of the question - after a change of world for the new one - and are null for a world
 * that hands in no items. The sound, the conversation and the panel are stand-ins, as in debug.test.ts.
 */
vi.mock('../core/audio', () => ({
  clipFor: () => null, dropped: [], inTask: () => false, musicPlaying: () => null, speaking: () => false, voiceLog: { clips: 0, synth: [] },
}));
vi.mock('./dialogue', () => ({ shardsSettled: { n: 0 } }));
vi.mock('./taskviews/panel', () => ({ cheatTask: () => false }));

interface Shown { items: ItemState[] | null; itemProblems: string[] | null; missing(need?: Record<string, number>): string[] | null }
const shown = () => (window as unknown as { __game: Shown & Record<string, unknown> }).__game;
const marks = (): Marks => ({ quests: {}, flags: {}, final: false });
const character = (id: string): CharacterDef => ({ id, emoji: '🦉', x: 2, z: 3, heading: 0, steps: ['add'], shard: '#fff' });

/** A world that is played: what it declares, its part of the save, and what it built (its own items, or none). */
interface Played { world: Declared; ws: Marks; built: { items?(): readonly WorldItem[] } }
const forest = (): Played => {
  const ws = marks();
  return {
    world: { characters: [character('owl')], secrets: ['cave'] }, ws,
    built: { items: () => [marked(ws, { kind: 'secret', id: 'cave', how: 'act', at: { x: 1, z: 1 } })] },
  };
};
const reef = (): Played => {
  const ws = marks();
  return {
    world: { characters: [character('crab'), character('seal')], pet: { species: 'any', at: { x: 5, z: 5 } } }, ws,
    built: { items: () => [marked(ws, { kind: 'finale', id: 'final', how: 'act', at: { x: 0, z: 0 }, after: ['crab', 'seal'] })] },
  };
};
/** A world without a description: it declares characters, its built world hands in no items. */
const meadow = (): Played => ({ world: { characters: [character('bee')] }, ws: marks(), built: {} });

async function expose(first: Played) {
  const { exposeDebug } = await import('./debug');
  const g = {
    hero: { root: {} }, cat: {}, cam: {}, save: {}, flies: {}, scene: {}, camera: {}, renderer: {},
    busy: false, finale: 0, speech: { shown: null }, groundY: () => 0, world: first.world, ws: first.ws,
  } as unknown as Game;
  const extras: DebugExtras = { npcs: [], more: { items: 'a world must not replace the description' }, talk: () => {}, cheatWorld: () => '' };
  const travel: { world: string; active: boolean; go(id: string): Promise<boolean>; built: Played['built'] | null } = {
    world: 'a', active: false, go: async () => true, built: first.built,
  };
  const show = exposeDebug(g, extras, travel satisfies DebugTravel);
  /** The change of world as src/game/travel.ts makes it: the game's part of the world, then what the world built. */
  const enter = (next: Played) => {
    Object.assign(g, { world: next.world, ws: next.ws });
    travel.built = next.built;
    show({ ...extras, more: {} });
  };
  return { g, travel, enter };
}

beforeEach(() => { delete (window as unknown as { __game?: unknown }).__game; });

describe('window.__game: the description of the world played', () => {
  it('the items: what the world declares, then what it built - plain values with `done` read at the moment', async () => {
    const world = forest();
    await expose(world);
    const o = shown();
    expect(o.items!.map((i) => `${i.kind} ${i.id}`)).toEqual(['chain owl', 'secret cave']);
    expect(o.items![1]).toEqual({ kind: 'secret', id: 'cave', at: { x: 1, z: 1 }, how: 'act', after: [], done: false, active: false });
    world.ws.flags.cave = true; world.ws.quests.owl = 1;
    expect(o.items!.map((i) => i.done)).toEqual([true, true]);
    expect(JSON.parse(JSON.stringify(o.items))).toEqual(o.items);
  });

  it('a name of the world\'s own does not replace the description', async () => {
    await expose(forest());
    expect(Array.isArray(shown().items)).toBe(true);
  });

  it('what the description lacks of the template, and where it disagrees with the world', async () => {
    const world = forest();
    await expose(world);
    const o = shown();
    expect(o.itemProblems).toEqual([]);
    const lacks = o.missing()!;
    expect(lacks.some((l) => l.includes('6 "Необязательные секреты"') && l.includes('1 item(s) of kind "secret"'))).toBe(true);
    expect(o.missing(ONE_EACH)!.map((l) => /of kind "(\w+)"/.exec(l)![1])).toEqual(['part', 'scene', 'finale', 'pet', 'flyover']);
    // the world declares one more secret than its description has
    world.world = { ...world.world, secrets: ['cave', 'well'] };
    const { g } = await expose(world);
    expect(shown().itemProblems).toEqual(['"well" of the world\'s secrets has no item of kind "secret"']);
    expect(g.world).toBe(world.world);
  });

  it('after a change of world the description is the new world\'s', async () => {
    const a = forest(), b = reef();
    const { enter } = await expose(a);
    const o = shown();
    a.ws.flags.cave = true;
    enter(b);
    expect(shown()).toBe(o);
    expect(o.items!.map((i) => `${i.kind} ${i.id}`)).toEqual(['chain crab', 'chain seal', 'pet pet', 'finale final']);
    expect(o.items!.map((i) => i.done), 'the marks of the world left are not this world\'s').toEqual([false, false, false, false]);
    expect(o.itemProblems).toEqual([]);
    expect(o.missing(ONE_EACH)!.map((l) => /of kind "(\w+)"/.exec(l)![1])).toEqual(['part', 'scene', 'secret', 'flyover']);
    b.ws.final = true;
    expect(o.items![3].done).toBe(true);
    enter(a);
    expect(o.items!.map((i) => `${i.id} ${i.done}`)).toEqual(['owl false', 'cave true']);
  });

  it('a world that hands in no items has no description: all three are null, and again after it is left', async () => {
    const { enter, travel } = await expose(meadow());
    const o = shown();
    expect([o.items, o.missing(), o.missing(ONE_EACH), o.itemProblems]).toEqual([null, null, null, null]);
    enter(forest());
    expect(o.items).toHaveLength(2);
    enter(meadow());
    expect([o.items, o.missing(), o.itemProblems]).toEqual([null, null, null]);
    // between two worlds there is no built world
    enter(forest());
    travel.built = null;
    expect([o.items, o.missing(), o.itemProblems]).toEqual([null, null, null]);
  });

  it('a host that tells nothing of what the world built (the stand-ins of older tests) shows no description', async () => {
    const { exposeDebug } = await import('./debug');
    const g = { hero: { root: {} }, speech: { shown: null } } as unknown as Game;
    exposeDebug(g, { npcs: [], more: {}, talk: () => {}, cheatWorld: () => '' }, { world: 'a', active: false, go: async () => true });
    expect(shown().items).toBeNull();
    expect(shown().missing()).toBeNull();
  });
});
