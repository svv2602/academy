// @vitest-environment happy-dom
/**
 * The characters' models of the Sweet Land (./index.ts MODELS; the lead's decisions of 2026-11-24: Meshy for four,
 * Polosatik by code; CREDITS.md): each a file of the world (worlds-data/sweet/, TECH-09) with its own clips - Idle, Talk
 * and Cheer for the finale - under the limit of a file.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { FRIENDS, MODELS } from './index';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed here
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

/** The names of a glb's clips, read from its JSON chunk. */
function clips(file: string): string[] {
  const b = readFileSync(file), len = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + len).toString('utf8')) as { animations?: { name: string }[] };
  return (json.animations ?? []).map((a) => a.name).sort();
}

describe('the characters\' models of the Sweet Land', () => {
  it('each is one of the characters, a file of the world under 1 MB with its clips', () => {
    expect(Object.keys(MODELS)).toEqual(['pastila', 'imbir', 'tyanuchka', 'kakao', 'polosatik']);
    for (const id of Object.keys(MODELS)) {
      expect(FRIENDS.map((f) => f.id)).toContain(id);
      const file = `worlds-data/sweet/models/sweet/${id}.glb`;
      expect(existsSync(file), file).toBe(true);
      expect(existsSync(`public/models/sweet/${id}.glb`), 'not in the core').toBe(false);
      expect(statSync(file).size).toBeLessThan(1024 * 1024);
      // standing, speaking, and each its clip of the finale
      expect(clips(file), id).toEqual(['Cheer', 'Idle', 'Talk']);
    }
  });

  it('stand as tall as their figures did (by the heroine\'s 1.53 m, the customer\'s word of 2026-11-24)', () => {
    expect(MODELS).toEqual({ pastila: 1.7, imbir: 1.1, tyanuchka: 1.85, kakao: 1.75, polosatik: 1.0 });
  });
});
