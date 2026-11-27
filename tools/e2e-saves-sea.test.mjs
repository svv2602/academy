// @vitest-environment happy-dom
// The save of the sea done (tools/e2e-saves.mjs SEA_SAVES.done) against the sea itself: its chains, its marks, its
// magic. A file of its own: the sea's module needs a document (happy-dom), the saves of the first world do not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultWorld, loadSave } from '../src/core/save';
import { FRIENDS as SEA_FRIENDS, ONCE as SEA_ONCE, PEARLS } from '../src/worlds/sea/index';
import { seaMagicOf } from '../src/worlds/sea/magic';
import { SEA_SECRETS } from '../src/worlds/sea/secrets';
import { SEA_STORIES } from '../src/worlds/sea/story';
import { SEA_CHAINS, SEA_DONE_FLAGS, SEA_SAVES } from './e2e-saves.mjs';

// the sea's module draws a glow on a canvas when it loads; happy-dom has none (as src/worlds/sea/voice.test.ts)
vi.mock('../src/game/fx', () => ({ glowTex: null, Sparks: class {} }));

const keys = (o) => Object.keys(o).sort();
beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
const storage = { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) };

describe('tools/e2e-saves.mjs: the sea done (SEA_SAVES.done)', () => {
  it('is read by loadSave() as it is, beside the first world done', () => {
    const stored = SEA_SAVES.done();
    storage.setItem('amw-save', JSON.stringify(stored));
    const s = loadSave();
    expect(storage.getItem('amw-save-damaged')).toBeNull();
    expect(keys(stored.worlds)).toEqual(['fairy', 'sea']);
    expect(keys(stored.worlds.sea)).toEqual(keys(defaultWorld()));
    expect(s).toEqual(stored);
    expect(s.worlds.fairy.final).toBe(true);
  });

  it('has the chains of the sea, every one finished, and the Pearl restored: the sea at magic 1', () => {
    expect(SEA_CHAINS).toEqual(Object.fromEntries(SEA_FRIENDS.map((c) => [c.id, c.steps.length])));
    const sea = SEA_SAVES.done().worlds.sea;
    expect(sea.final).toBe(true);
    expect(seaMagicOf(sea, SEA_FRIENDS)).toBe(1);
  });

  it('has every mark of the sea done: the pearls and their hints, the tour, both cut-scenes, the five secrets, the cat\'s first lines', () => {
    const marks = [...PEARLS.flatMap((p) => [p.hint, p.flag]), 'toured', ...SEA_STORIES.map((x) => x.id), ...SEA_SECRETS, ...Object.values(SEA_ONCE)];
    expect([...SEA_DONE_FLAGS].sort()).toEqual([...marks].sort());
    expect(Object.keys(SEA_SAVES.done().worlds.sea.flags).sort()).toEqual([...marks].sort());
  });
});
