import { afterEach, describe, expect, it, vi } from 'vitest';

// The registry (src/worlds/index.ts) with stand-ins for the worlds: the real ones need a page to load. The probe
// world (TECH-15) is a test world: the published game must not list it, a build made with `--mode probe` must.
vi.mock('./fairy', () => ({ fairy: { id: 'fairy', shelf: 0 } }));
vi.mock('./hub', () => ({ hub: { id: 'hub' } }));
vi.mock('./probe', () => ({ probe: { id: 'probe', shelf: 1, test: true } }));
vi.mock('./forest', () => ({ forest: { id: 'forest', shelf: 1 } }));
vi.mock('./sea', () => ({ sea: { id: 'sea', shelf: 2 } }));
const RAW = import.meta.glob(['./index.ts', './*/index.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The registry as a build of `mode` makes it. */
async function registry(mode: string) {
  vi.resetModules();
  vi.stubEnv('MODE', mode);
  return import('./index');
}
afterEach(() => { vi.unstubAllEnvs(); });

describe('the registry of worlds (ARCH-06, TECH-15)', () => {
  it('unit tests run in the mode "test": neither the published build nor the probe one', () => {
    expect(import.meta.env.MODE).toBe('test');
  });

  it.each(['test', 'production', 'development'])('in the mode "%s" the worlds are the Fairy Kingdom and the hub', async (mode) => {
    const { WORLDS, DEFAULT_WORLD } = await registry(mode);
    expect(WORLDS.map((w) => w.id)).toEqual(['fairy', 'hub']);
    expect(DEFAULT_WORLD).toBe('fairy');
  });

  it('a build made with --mode probe lists the probe world too, and still plays the Fairy Kingdom by default', async () => {
    const { WORLDS, DEFAULT_WORLD } = await registry('probe');
    expect(WORLDS.map((w) => w.id)).toEqual(['fairy', 'hub', 'probe']);
    expect(DEFAULT_WORLD).toBe('fairy');
  });

  it('a build or a dev server made with --mode grey lists the forest and the sea of the grey build (WORLD-12), still playing the Fairy Kingdom', async () => {
    const { WORLDS, DEFAULT_WORLD } = await registry('grey');
    expect(WORLDS.map((w) => w.id)).toEqual(['fairy', 'hub', 'forest', 'sea']);
    expect(DEFAULT_WORLD).toBe('fairy');
    expect(RAW['./index.ts']).not.toMatch(/^import .*['"]\.\/(forest|sea)['"]/m);
    expect(RAW['./index.ts']).toMatch(/import\.meta\.env\.MODE === 'grey' \? \[\(await import\('\.\/forest'\)\)\.forest, \(await import\('\.\/sea'\)\)\.sea\] : \[\]/);
  });

  it.each(['test', 'probe', 'grey'])('in the mode "%s" no id is listed twice and the default world is listed', async (mode) => {
    const { WORLDS, DEFAULT_WORLD } = await registry(mode);
    const ids = WORLDS.map((w) => w.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(ids).toContain(DEFAULT_WORLD);
  });

  it.each([
    ['production', ['fairy'], ['fairy', null, null, null, null]],
    ['grey', [], ['fairy', null, null, null, null]],
    ['grey', ['fairy'], ['fairy', 'forest', null, null, null]],
    ['grey', ['fairy', 'forest'], ['fairy', 'forest', 'sea', null, null]],
    ['probe', ['fairy'], ['fairy', 'probe', null, null, null]],
  ] as const)('the arches of the hub in the mode "%s" with %j done: %j open (the published game the fairies\' alone)', async (mode, done, open) => {
    const { WORLDS } = await registry(mode);
    const { openArches, portalWorlds } = await import('./hub/portals');
    expect(openArches(portalWorlds(WORLDS), (id) => (done as readonly string[]).includes(id))).toEqual(open);
  });

  it('the stand-ins above have the ids of the real worlds, each named after its folder', () => {
    const folders = Object.keys(RAW).filter((p) => p !== './index.ts').map((p) => p.split('/')[1]).sort();
    expect(folders).toEqual(['fairy', 'forest', 'hub', 'probe', 'sea']);
    for (const id of folders) expect(RAW[`./${id}/index.ts`], `src/worlds/${id}/index.ts`).toMatch(new RegExp(`^\\s*id: '${id}',$`, 'm'));
    // and their places on the shelf (the arches of the hub)
    for (const [id, shelf] of [['fairy', 0], ['probe', 1], ['forest', 1], ['sea', 2]] as const) expect(RAW[`./${id}/index.ts`], `src/worlds/${id}/index.ts`).toMatch(new RegExp(`^\\s*shelf: ${shelf},`, 'm'));
  });

  it('the probe world is reached only through the registry, by a dynamic import behind the mode of the build', () => {
    const src = RAW['./index.ts'];
    // A static import would put the world into every build; the condition must be the constant the bundler folds.
    expect(src).not.toMatch(/^import .*['"]\.\/probe['"]/m);
    expect(src).toMatch(/import\.meta\.env\.MODE === 'probe' \? \[\(await import\('\.\/probe'\)\)\.probe\] : \[\]/);
  });
});

// A next world keeps its files in folders named after its id - public/models/<id>/, public/voice/<id>/,
// public/story/<id>/ (TECH-09, tools/world-files.mjs) - and everything inside them is counted and cached as that
// world's. The core and the first world lie in the same places (the packs of models): a world named like one of
// their folders would take the files of the core for its own.
describe('the folders of the worlds under public/ (TECH-09)', () => {
  /** The folders of the core and the first world: the packs of models. Their voice and story frames have none. */
  const CORE_FOLDERS: Record<string, readonly string[]> = {
    models: ['animals_pack', 'creatures', 'extra', 'hero', 'items', 'medieval_village_pack', 'nature2', 'nature_pack', 'pet_items', 'platformer_game_pack', 'rpg_items_pack'],
    voice: [],
    story: [],
  };
  // The files are only named, never loaded: the keys are their paths from the root of the project.
  const FILES = Object.keys(import.meta.glob(['/public/models/*/**', '/public/voice/*/**', '/public/story/*/**']));
  /** The folders that exist under public/<kind>/. */
  const existing = (kind: string) => [...new Set(FILES.filter((p) => p.startsWith(`/public/${kind}/`)).map((p) => p.split('/')[3]))].sort();
  const ids = Object.keys(RAW).filter((p) => p !== './index.ts').map((p) => p.split('/')[1]).sort();

  it('the search finds the folders: the packs of models are there', () => {
    expect(existing('models')).toContain('hero');
    expect(FILES.length).toBeGreaterThan(50);
  });

  it.each(Object.keys(CORE_FOLDERS))('no world is named like a folder of the core under public/%s/', (kind) => {
    expect(ids).toEqual(['fairy', 'forest', 'hub', 'probe', 'sea']);
    expect(ids.filter((id) => CORE_FOLDERS[kind].includes(id))).toEqual([]);
  });

  it.each(Object.keys(CORE_FOLDERS))('every folder under public/%s/ is a known folder of the core or the folder of a next world', async (kind) => {
    const { DEFAULT_WORLD } = await registry('test');
    // The first world lies as it always did, without a folder of its own (decision R54): a folder named after it,
    // or a new pack not listed above, must be decided on here - it is the core's or a world's, never both.
    const next = ids.filter((id) => id !== DEFAULT_WORLD);
    expect(existing(kind).filter((name) => !CORE_FOLDERS[kind].includes(name) && !next.includes(name))).toEqual([]);
    // The list above names only what exists: a folder that is gone must leave it.
    expect(CORE_FOLDERS[kind].filter((name) => !existing(kind).includes(name))).toEqual([]);
  });
});

describe('nextWorlds: the worlds to download while one is played (TECH-09)', () => {
  const ORDER = ['fairy', 'ocean', 'space', 'ice'];

  it('the worlds listed after the current one, then the ones before it, without the current and the installed ones', async () => {
    const { nextWorlds } = await registry('test');
    expect(nextWorlds('fairy', ORDER, ['fairy'])).toEqual(['ocean', 'space', 'ice']);
    expect(nextWorlds('ocean', ORDER, ['fairy'])).toEqual(['space', 'ice']);
    expect(nextWorlds('space', ORDER, ['fairy'])).toEqual(['ice', 'ocean']);
    expect(nextWorlds('ice', ORDER, ['fairy'])).toEqual(['ocean', 'space']);
    expect(nextWorlds('fairy', ['fairy', 'hub', 'ocean'], ['fairy', 'hub'])).toEqual(['ocean']);   // the hub, installed too
  });

  it('the installed worlds are named, not taken from the order of the list', async () => {
    const { nextWorlds } = await registry('test');
    expect(nextWorlds('ocean', ORDER, ['space'])).toEqual(['ice', 'fairy']);
    expect(nextWorlds('space', ORDER, ['space'])).toEqual(['ice', 'fairy', 'ocean']);
  });

  it('a world the registry does not list: every next world, in the order of the registry', async () => {
    const { nextWorlds } = await registry('test');
    expect(nextWorlds('nowhere', ORDER, ['fairy'])).toEqual(['ocean', 'space', 'ice']);
  });

  it('the published game: the hub is in the installation with the first world - no next world, no request for the list', async () => {
    const { nextWorlds, INSTALLED, DEFAULT_WORLD } = await registry('production');
    expect(INSTALLED).toEqual([DEFAULT_WORLD, 'hub']);
    expect(nextWorlds('fairy')).toEqual([]);
    expect(nextWorlds('hub')).toEqual([]);
  });

  it('the probe build: the probe world is the next one of the first world and of the hub, and has no next one itself', async () => {
    const { nextWorlds } = await registry('probe');
    expect(nextWorlds('fairy')).toEqual(['probe']);
    expect(nextWorlds('hub')).toEqual(['probe']);
    expect(nextWorlds('probe')).toEqual([]);
  });
});
