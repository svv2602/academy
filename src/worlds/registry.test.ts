import { afterEach, describe, expect, it, vi } from 'vitest';

// The registry (src/worlds/index.ts) with stand-ins for the worlds: the real ones need a page to load. The probe
// world (TECH-15) is a test world: the published game must not list it, a build made with `--mode probe` must.
vi.mock('./fairy', () => ({ fairy: { id: 'fairy' } }));
vi.mock('./probe', () => ({ probe: { id: 'probe' } }));
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

  it.each(['test', 'production', 'development'])('in the mode "%s" the only world is the Fairy Kingdom', async (mode) => {
    const { WORLDS, DEFAULT_WORLD } = await registry(mode);
    expect(WORLDS.map((w) => w.id)).toEqual(['fairy']);
    expect(DEFAULT_WORLD).toBe('fairy');
  });

  it('a build made with --mode probe lists the probe world too, and still plays the Fairy Kingdom by default', async () => {
    const { WORLDS, DEFAULT_WORLD } = await registry('probe');
    expect(WORLDS.map((w) => w.id)).toEqual(['fairy', 'probe']);
    expect(DEFAULT_WORLD).toBe('fairy');
  });

  it.each(['test', 'probe'])('in the mode "%s" no id is listed twice and the default world is listed', async (mode) => {
    const { WORLDS, DEFAULT_WORLD } = await registry(mode);
    const ids = WORLDS.map((w) => w.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(ids).toContain(DEFAULT_WORLD);
  });

  it('the stand-ins above have the ids of the real worlds, each named after its folder', () => {
    const folders = Object.keys(RAW).filter((p) => p !== './index.ts').map((p) => p.split('/')[1]).sort();
    expect(folders).toEqual(['fairy', 'probe']);
    for (const id of folders) expect(RAW[`./${id}/index.ts`], `src/worlds/${id}/index.ts`).toMatch(new RegExp(`^\\s*id: '${id}',$`, 'm'));
  });

  it('the probe world is reached only through the registry, by a dynamic import behind the mode of the build', () => {
    const src = RAW['./index.ts'];
    // A static import would put the world into every build; the condition must be the constant the bundler folds.
    expect(src).not.toMatch(/^import .*['"]\.\/probe['"]/m);
    expect(src).toMatch(/import\.meta\.env\.MODE === 'probe' \? \[\(await import\('\.\/probe'\)\)\.probe\] : \[\]/);
  });
});
