// @vitest-environment happy-dom
// What the registry knows of a next world before its code is loaded (src/worlds/<id>/meta.ts) against the world itself
// (src/worlds/<id>/index.ts): the hub's arches, its keepsakes and the shelf of the book read the first, the game the
// second once she enters the world. They must say the same. A file of its own: a world's module needs a document.
import { describe, expect, it, vi } from 'vitest';
import { kindsOf, itemsOf } from '../game/collections';
import type { WorldDef, WorldInfo } from '../game/world';
import { FOREST_INFO } from './forest/meta';
import { PROBE_INFO } from './probe/meta';
import { SEA_INFO } from './sea/meta';
import { SKY_INFO } from './sky/meta';
import { SWEET_INFO } from './sweet/meta';

// a world's module draws a glow on a canvas when it loads; happy-dom has none (as src/worlds/sea/voice.test.ts)
vi.mock('../game/fx', () => ({ glowTex: null, Sparks: class {} }));

/** What the hub, its keepsakes and the shelf read of a world: its place, a test world or not, its secrets, its finds by kind. */
const known = (w: WorldInfo) => ({
  id: w.id, shelf: w.shelf, test: w.test ?? false, secrets: [...(w.secrets ?? [])],
  finds: w.collect ? Object.fromEntries(kindsOf(w.collect).map((k) => [k, itemsOf(w.collect!, k)])) : null,
});

describe('a next world as the registry knows it before its code (./<id>/meta.ts)', () => {
  it.each([
    ['forest', FOREST_INFO, async () => (await import('./forest')).forest],
    ['sea', SEA_INFO, async () => (await import('./sea')).sea],
    ['sweet', SWEET_INFO, async () => (await import('./sweet')).sweet],
    ['sky', SKY_INFO, async () => (await import('./sky')).sky],
    ['probe', PROBE_INFO, async () => (await import('./probe')).probe],
  ] as const)('%s: says what its description says', async (_, info, load) => {
    const def = await load() as WorldDef;
    expect(known(info)).toEqual(known(def));
  });

  it('every world of the published game has its finds (PLAY-25) and the places of the find of the day (PLAY-26)', async () => {
    // The forest went out once with finds and no daily places (the lavka's find of the day never came to it); a world
    // with no finds at all has no find of the day either (src/game/daily-find.ts takes its kinds from `collect`). A world
    // listed in the published registry (this test's mode lists no grey and no test world) must have both.
    const { WORLDS } = await import('.');
    const lacking: string[] = [];
    for (const w of WORLDS) {
      // the hub has a find of the day of its own, the feather of the Tree (src/worlds/hub/feathers.ts), not `daily`
      if (w.test || w.id === 'hub') continue;
      const def = await w.code();
      if (!def.collect) lacking.push(`${w.id}: no finds (collect)`);
      if (!def.daily?.places.length) lacking.push(`${w.id}: no places of the find of the day (daily)`);
    }
    expect(lacking, 'a published world without its finds or its find of the day').toEqual([]);
    expect(WORLDS.map((w) => w.id)).toEqual(expect.arrayContaining(['fairy', 'forest', 'sea']));
  });

  it('every next world of src/worlds/ has one, data only: it imports types alone, never three or the world\'s code', () => {
    const index = import.meta.glob('./*/index.ts');
    const meta = import.meta.glob('./*/meta.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const worlds = Object.keys(index).map((p) => p.split('/')[1]).filter((id) => !['fairy', 'hub'].includes(id));
    expect(worlds.sort()).toEqual(['forest', 'probe', 'sea', 'sky', 'sweet']);
    for (const id of worlds) {
      const src = meta[`./${id}/meta.ts`];
      expect(src, `src/worlds/${id}/meta.ts`).toBeDefined();
      expect([...src.matchAll(/^import (?!type )[^\n]*$/gm)].map((m) => m[0]), id).toEqual([]);
    }
  });
});
