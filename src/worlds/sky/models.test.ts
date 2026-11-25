// @vitest-environment happy-dom
/**
 * The characters' models of the Sky Islands (./index.ts MODELS; step 6, the customer's decisions of 2026-11-18 and
 * 2026-11-25; CREDITS.md): Lazur, Mertsal and Veterok from Meshy, Gromykhalo the CC0 Dragon Evolved - each a file of the
 * world (worlds-data/sky/, TECH-09) under the limit of a file, with Idle, Talk and Cheer for the finale; Chirika the
 * first world's bird of the core (no clips: she stands, as her figure did).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { FRIENDS, MODELS, PERCH } from './index';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed here
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

/** The names of a glb's clips, read from its JSON chunk. */
function clips(file: string): string[] {
  const b = readFileSync(file), len = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + len).toString('utf8')) as { animations?: { name: string }[] };
  return (json.animations ?? []).map((a) => a.name);
}

describe('the characters\' models of the Sky Islands', () => {
  it('one for each of the five, as tall as its figure (Chirika 0.85 m: the lead\'s decision of 2026-11-25)', () => {
    expect(Object.keys(MODELS).sort()).toEqual(FRIENDS.map((f) => f.id).sort());
    expect(Object.fromEntries(Object.entries(MODELS).map(([id, m]) => [id, m.h]))).toEqual({ lazur: 1.7, gromykhalo: 3.2, mertsal: 1.75, veterok: 1.35, chirika: 0.85 });
  });

  it('the world\'s own are its files under 1 MB, not the core\'s, each with Idle, Talk and Cheer', () => {
    for (const [id, m] of Object.entries(MODELS)) {
      if (!m.path.startsWith('sky/')) continue;
      const file = `worlds-data/sky/models/${m.path}.glb`;
      expect(existsSync(file), file).toBe(true);
      expect(existsSync(`public/models/${m.path}.glb`), 'not in the core').toBe(false);
      expect(statSync(file).size).toBeLessThan(1024 * 1024);
      expect(clips(file), id).toEqual(expect.arrayContaining(['Idle', 'Talk', 'Cheer']));
    }
  });

  it('Chirika is the core\'s bird (the first world\'s), shared, not a file of the islands', () => {
    expect(MODELS.chirika.path).toBe('creatures/bird');
    expect(existsSync('public/models/creatures/bird.glb')).toBe(true);
  });

  it('Chirika, with no clips, sits up on the windmills\' mailbox, not flat on the ground (the lead\'s decision of 2026-11-25)', () => {
    expect(PERCH).toEqual({ chirika: 1.2 });
  });
});
