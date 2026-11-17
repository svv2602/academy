// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Save } from '../core/save';

// The shared load without a page: the loaders and the notice are stand-ins, the order and the failure are real.
const rig = vi.fn();
const buildHero = vi.fn();
const loadGear = vi.fn();
const showNotice = vi.fn();
vi.mock('../core/assets', () => ({ rig }));
vi.mock('./hero', () => ({ buildHero }));
vi.mock('./gear', () => ({ loadGear }));
vi.mock('../ui/ui', () => ({ showNotice }));

const SAVE = { dress: '#ff7fb5' } as unknown as Save;
const HERO = { model: 'the heroine' }, GEAR = { wand_star: 'a wand' }, CAT = { model: 'the cat' };
/** A module of its own for every test: "the game said why it stopped" is remembered for the life of the page. */
const boot = async () => { vi.resetModules(); return import('./boot'); };

let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  rig.mockReset().mockResolvedValue(CAT);
  buildHero.mockReset().mockImplementation(async () => ({ ...HERO }));
  loadGear.mockReset().mockResolvedValue(GEAR);
  showNotice.mockReset();
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { error.mockRestore(); });

describe('the shared load (TECH-15): the heroine with her items and the cat, once, for every world', () => {
  it('loads the heroine dressed as the save says, hangs her items on that very model, and the cat', async () => {
    const { loadShared } = await boot();
    const shared = await loadShared(SAVE);
    expect(buildHero).toHaveBeenCalledExactlyOnceWith(SAVE);
    expect(rig).toHaveBeenCalledExactlyOnceWith('extra/cat2', 0.62, true);
    expect(shared).toEqual({ heroRig: { ...HERO, gear: GEAR }, catRig: CAT });
    // The items are hung under the bones of the model the game plays with, not of a copy.
    expect(loadGear).toHaveBeenCalledExactlyOnceWith(shared!.heroRig);
    expect(showNotice).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('the heroine and the cat are asked for at once, not one after the other', async () => {
    buildHero.mockReturnValue(new Promise(() => {}));
    const { loadShared } = await boot();
    void loadShared(SAVE);
    expect(buildHero).toHaveBeenCalledTimes(1);
    expect(rig).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the heroine', () => buildHero.mockRejectedValue(new Error('no model'))],
    ['an item of hers', () => loadGear.mockRejectedValue(new Error('no model'))],
    ['the cat', () => rig.mockRejectedValue(new Error('no model'))],
  ])('%s failed for good (TECH-08): null, the game says why once and shows "try again"', async (_what, breakIt) => {
    breakIt();
    const { loadShared } = await boot();
    expect(await loadShared(SAVE)).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toBe('the game could not load:');
    expect((error.mock.calls[0][1] as Error).message).toBe('no model');
    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(showNotice.mock.calls[0][0]).toBe('load_failed');
    // "Try again" reloads the page: nothing is loaded a second time in this one.
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    try { (showNotice.mock.calls[0][1] as () => void)(); } finally { vi.unstubAllGlobals(); }
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('the shared load and the load of a world both failed: one message and one line in the console, the first one', async () => {
    rig.mockRejectedValue(new Error('the cat'));
    const { loadShared, loadFailed } = await boot();
    expect(await loadShared(SAVE)).toBeNull();
    loadFailed(new Error('a model of the world'));      // what a world's load does when it fails (WorldDef.load)
    expect(error).toHaveBeenCalledTimes(1);
    expect((error.mock.calls[0][1] as Error).message).toBe('the cat');
    expect(showNotice).toHaveBeenCalledTimes(1);
  });

  it('the world failed first, the shared load after it: still one message, the world\'s', async () => {
    const { loadShared, loadFailed } = await boot();
    loadFailed(new Error('a model of the world'));
    buildHero.mockRejectedValue(new Error('the heroine'));
    expect(await loadShared(SAVE)).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect((error.mock.calls[0][1] as Error).message).toBe('a model of the world');
    expect(showNotice).toHaveBeenCalledTimes(1);
  });
});
