import { describe, expect, it, vi } from 'vitest';
import { pickWorld, type WorldDef } from './world';

/** Only the id matters to pickWorld: the rest of a world is never touched. */
const world = (id: string) => ({ id }) as unknown as WorldDef;

describe('pickWorld', () => {
  const first = world('first'), second = world('second');
  const list = [first, second];

  it('plays the default world without ?world=, wherever it stands in the registry', () => {
    expect(pickWorld(list, 'first', null, false)).toBe(first);
    expect(pickWorld(list, 'first', null, true)).toBe(first);
    expect(pickWorld(list, 'second', null, false)).toBe(second);
    expect(pickWorld(list, 'second', null, true)).toBe(second);
  });

  it('ignores ?world= without debug: the published game always plays the default world', () => {
    expect(pickWorld(list, 'first', 'second', false)).toBe(first);
    expect(pickWorld(list, 'second', 'first', false)).toBe(second);
  });

  it('takes ?world= with debug', () => {
    expect(pickWorld(list, 'first', 'second', true)).toBe(second);
    expect(pickWorld(list, 'second', 'first', true)).toBe(first);
  });

  it('falls back to the default world for an id no world has', () => {
    expect(pickWorld(list, 'second', 'nowhere', true)).toBe(second);
    expect(pickWorld(list, 'second', '', true)).toBe(second);
  });

  it('refuses a default no world has, and an empty registry', () => {
    expect(() => pickWorld(list, 'nowhere', null, false)).toThrow(/"nowhere"/);
    expect(() => pickWorld(list, 'nowhere', 'first', true)).toThrow(/"nowhere"/);
    expect(() => pickWorld([], 'first', null, false)).toThrow();
  });
});

// The registry itself (src/worlds/index.ts) with a stand-in for the world: the real one needs a page to load.
vi.mock('../worlds/fairy', () => ({ fairy: { id: 'fairy' } }));
const RAW = import.meta.glob(['../main.ts', '../worlds/index.ts', '../worlds/fairy/index.ts'],{ query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('the registry names the published world (R04, R22)', () => {
  it('the default world is the first world, the Fairy Kingdom', async () => {
    const { DEFAULT_WORLD, WORLDS } = await import('../worlds');
    expect(DEFAULT_WORLD).toBe('fairy');
    // Named by its id, not worked out from the list (its first entry, its order).
    expect(RAW['../worlds/index.ts']).toMatch(/^export const DEFAULT_WORLD = '[a-z][a-z0-9_-]*';$/m);
    expect(WORLDS.map((w) => w.id)).toContain(DEFAULT_WORLD);
    expect(RAW['../worlds/fairy/index.ts'], 'the stand-in above has the id of the real world').toMatch(/^\s*id: 'fairy',$/m);
    // A world added ahead of it (by name or by place in the list) does not take its place.
    const aaa = world('aaa');
    expect(pickWorld([aaa, ...WORLDS], DEFAULT_WORLD, null, false).id).toBe('fairy');
    expect(pickWorld([...WORLDS, aaa].sort((a, b) => a.id.localeCompare(b.id)), DEFAULT_WORLD, null, false).id).toBe('fairy');
  });

  it('main.ts plays the world the registry names, not the first of a namespace', () => {
    const main = RAW['../main.ts'];
    expect(main).toMatch(/pickWorld\(WORLDS, DEFAULT_WORLD,/);
    expect(main).not.toMatch(/import \* as \w+ from '\.\/worlds'/);
  });
});

// main.ts plays the chosen world's tune: without this call the game is silent (the notes belong to the world, ARCH-06).
const MAIN = RAW['../main.ts'];
describe('the world reaches the audio', () => {
  it('main.ts hands the chosen world\'s music to setMusic', () => {
    expect(MAIN).toMatch(/^setMusic\(world\.music\b/m);
  });
});

