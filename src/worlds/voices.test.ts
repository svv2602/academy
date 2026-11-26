// @vitest-environment happy-dom
/**
 * The characters of every world say their own lines in their own voice (src/worlds/<id>/voices.ts, the keys `<id>_*`
 * of its strings.ts `spoken`). Each world hands its table of voices in as it loads and takes it back as it is left
 * (src/core/voice.ts setCast): without it the game finds no clip of a character and quietly hands the line to the
 * device's synthesizer - the Sky Islands did so (2026-11-26), no unit test saw it, only the walkthrough at Veterok's
 * route. And each such line has its clip in that voice: in the world's folder (its clips.json, `<world>/<key>@<voice>`),
 * or for the fairies, whose voice is the core's, among the core's clips (`<key>@<voice>`). The hub has no table: only
 * the cat speaks there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipFor, setCast, worldClips } from '../core/voice';

// a world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed for its lines
vi.mock('../game/fx', () => ({ glowTex: null, Sparks: class {} }));

type Cast = { narrator: string; cast: Record<string, { emoji: string; voice: string }> };
type Friend = { id: string; emoji: string };
const voices = import.meta.glob<{ voices: Cast & { id: string } }>('./*/voices.ts', { eager: true });
const strings = import.meta.glob<{ strings: { spoken?: Record<string, string> } }>('./*/strings.ts', { eager: true });
const sources = import.meta.glob<string>('./*/index.ts', { eager: true, query: '?raw', import: 'default' });
const clips = import.meta.glob<string[]>('./*/clips.json', { eager: true, import: 'default' });
// the characters of a world: FRIENDS of its index.ts, or of characters.ts (the fairies)
const friends = import.meta.glob<{ FRIENDS?: readonly Friend[] }>(['./*/index.ts', './*/characters.ts'], { eager: true });

const worlds = Object.entries(voices).map(([path, mod]) => {
  const dir = path.split('/')[1];
  const table = mod.voices;
  const owner = (k: string) => Object.keys(table.cast).find((id) => id !== table.narrator && k.startsWith(`${id}_`));
  const spoken = Object.keys(strings[`./${dir}/strings.ts`]?.strings.spoken ?? {});
  const own = spoken.flatMap((key) => { const who = owner(key); return who ? [{ key, ...table.cast[who] }] : []; });
  const cast = [`./${dir}/index.ts`, `./${dir}/characters.ts`].flatMap((p) => friends[p]?.FRIENDS ?? []);
  return { dir, table, own, cast, source: sources[`./${dir}/index.ts`], clips: clips[`./${dir}/clips.json`] };
});

describe('the characters of every world speak in their own voice', () => {
  afterEach(() => { setCast({ narrator: '', cast: {} }); });

  it('finds the worlds with a table of voices, the fairies and the next worlds among them', () => {
    const ids = worlds.map((w) => w.dir);
    for (const id of ['fairy', 'forest', 'sea', 'sweet']) expect(ids).toContain(id);
  });

  for (const w of worlds) {
    describe(w.dir, () => {
      it('its table is its own, and every character of it is in the table with its emoji and has lines of its own', () => {
        expect(w.table.id).toBe(w.dir);
        expect(w.cast.length, 'no FRIENDS found').toBeGreaterThan(0);
        for (const f of w.cast) {
          const id = f.id;
          expect(w.table.cast[id]?.emoji, id).toBe(f.emoji);
          expect(w.own.some((l) => l.emoji === f.emoji), `${id}: no line of its own`).toBe(true);
        }
      });

      it('hands its table of voices in as it loads and takes it back as it is left', () => {
        expect(w.source).toMatch(/\n\s*setCast\(voices\);/);
        expect(w.source).toMatch(/scope\.own\(\(\) => setCast\(\{ narrator: '', cast: \{\} \}\)\)/);
      });

      it('each character\'s line has its clip in its voice: none goes to the synthesizer', () => {
        setCast(w.table);
        const back = w.clips ? worldClips(w.dir, w.clips) : () => {};
        try {
          const folder = w.clips ? `${w.dir}/` : '';
          for (const { key, emoji, voice } of w.own) expect(clipFor(key, emoji), key).toBe(`${folder}${key}@${voice}`);
        } finally { back(); }
      });
    });
  }
});
