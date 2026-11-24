import { describe, expect, it, vi } from 'vitest';
import { launchWorld, pickWorld, type LaunchEnv, type WorldDef, type WorldMeta } from './world';

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

// The registry itself (src/worlds/index.ts) with stand-ins for the worlds: the real ones need a page to load.
vi.mock('../worlds/fairy', () => ({ fairy: { id: 'fairy' } }));
vi.mock('../worlds/hub', () => ({ hub: { id: 'hub' } }));
vi.mock('../worlds/forest', () => ({ forest: { id: 'forest' } }));
vi.mock('../worlds/sea', () => ({ sea: { id: 'sea' } }));
const RAW = import.meta.glob(['../main.ts', '../worlds/index.ts', '../worlds/fairy/index.ts', './context.ts'],{ query: '?raw', import: 'default', eager: true }) as Record<string, string>;

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
    expect(main).toMatch(/launchWorld\(WORLDS, DEFAULT_WORLD, params.get\('world'\), debug, save.lastWorld,/);
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

// What the game is told of a world (WorldEntry) is one literal of main.ts (entryOf): a field of the entry left out of it
// never reaches the game - the find of the day (WorldDef.daily) lay in every world's description and was never shown.
describe('the world reaches the game', () => {
  it('main.ts entryOf hands the game every field of WorldEntry', () => {
    const entry = /export interface WorldEntry \{([\s\S]*?)\n\}/.exec(RAW['./context.ts'])![1];
    const fields = [...entry.matchAll(/^ {2}(?:readonly )?(\w+)\??:/gm)].map((m) => m[1]);
    const literal = /const entryOf = \(world: WorldDef\): WorldEntry => \(\{([\s\S]*?)\}\);/.exec(MAIN)![1];
    expect(fields).toContain('daily');
    expect(fields.filter((f) => !new RegExp(`\\b${f}:`).test(literal))).toEqual([]);
  });
});


describe('launchWorld: the world where she stopped, through the gate (WORLD-01, TECH-09, R17, R27)', () => {
  const first = { id: 'first' } as WorldDef, hub = { id: 'hub' } as WorldDef, far = { id: 'far' } as WorldDef;
  // the registry: what is known of each world, its code loaded on demand (counted: a world never launched is never loaded)
  const loaded: string[] = [];
  const meta = (w: WorldDef): WorldMeta => ({ id: w.id, code: async () => { loaded.push(w.id); return w; } });
  const list = [first, hub, far].map(meta);
  type Answer = Awaited<ReturnType<LaunchEnv['gate']['canEnter']>>;
  const env = (answer: Answer, ready = true) => {
    const asked: string[] = [], downloads: string[] = [];
    const e: LaunchEnv = {
      gate: { canEnter: async (id) => { asked.push(id); return answer; } },
      download: async (id) => { downloads.push(id); return ready; },
    };
    return { e, asked, downloads };
  };
  const OPEN: Answer = { enter: true, from: 'cache' }, NET: Answer = { enter: true, from: 'network' }, NO: Answer = { enter: false };

  it('no world where she stopped, the default world, or a world this build lacks: the default world, the gate not asked', async () => {
    for (const last of [undefined, 'first', 'gone']) {
      const { e, asked } = env(OPEN);
      expect(await launchWorld(list, 'first', null, false, last, e)).toEqual({ world: first, refused: false });
      expect(asked).toEqual([]);
    }
  });

  it('a world in the cache opens; one from the network is downloaded first, then opens', async () => {
    const cached = env(OPEN);
    expect(await launchWorld(list, 'first', null, false, 'hub', cached.e)).toEqual({ world: hub, refused: false });
    expect([cached.asked, cached.downloads]).toEqual([['hub'], []]);
    const net = env(NET);
    expect(await launchWorld(list, 'first', null, false, 'far', net.e)).toEqual({ world: far, refused: false });
    expect([net.asked, net.downloads]).toEqual([['far'], ['far']]);
  });

  it('refused by the gate, or not ready after its download: the default world, and it says so', async () => {
    const no = env(NO);
    expect(await launchWorld(list, 'first', null, false, 'far', no.e)).toEqual({ world: first, refused: true });
    expect(no.downloads).toEqual([]);
    const broken = env(NET, false);
    expect(await launchWorld(list, 'first', null, false, 'far', broken.e)).toEqual({ world: first, refused: true });
  });

  it('?world= with debug wins over the world where she stopped; without debug it is not read', async () => {
    const d = env(OPEN);
    expect(await launchWorld(list, 'first', 'far', true, 'hub', d.e)).toEqual({ world: far, refused: false });
    expect(await launchWorld(list, 'first', 'first', true, 'hub', d.e)).toEqual({ world: first, refused: false });
    expect(d.asked).toEqual([]);
    expect(await launchWorld(list, 'first', 'far', false, 'hub', d.e)).toEqual({ world: hub, refused: false });
  });

  it('loads the code of the world launched alone; a world whose code cannot be had: the default world, and it says so', async () => {
    loaded.length = 0;
    expect(await launchWorld(list, 'first', null, false, 'far', env(OPEN).e)).toEqual({ world: far, refused: false });
    expect(loaded).toEqual(['far']);
    loaded.length = 0;
    const broken = [list[0], list[1], { id: 'far', code: () => Promise.reject(new Error('offline')) }];
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await launchWorld(broken, 'first', null, false, 'far', env(OPEN).e)).toEqual({ world: first, refused: true });
    expect(quiet).toHaveBeenCalledOnce();
    quiet.mockRestore();
    expect(loaded).toEqual(['first']);
  });
});
