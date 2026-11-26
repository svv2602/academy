// @vitest-environment happy-dom
/**
 * The characters of the Sky Islands say their own lines in their own voice (./voices.ts, ./strings.ts `<id>_*`). Each
 * such line must have its clip in the world's list (./clips.json, written by tools/gen_voice.py), and the world must
 * hand its table of voices in as it loads (src/core/voice.ts setCast): without it the game finds no clip of a character
 * and quietly hands the line to the device's synthesizer (the walkthrough of 2026-11-26 caught it at Veterok's route).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipFor, setCast, worldClips } from '../../core/voice';
import CLIPS from './clips.json';
import { FRIENDS } from './index';
import SOURCE from './index.ts?raw';
import { strings } from './strings';
import { voices } from './voices';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed for its lines
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

const cast = voices.cast as Record<string, { emoji: string; voice: string }>;
const owner = (k: string) => Object.keys(cast).find((id) => id !== voices.narrator && k.startsWith(`${id}_`));
/** Every spoken line of a character of the islands, with its voice and emoji. */
const lines = Object.keys(strings.spoken).flatMap((key) => { const who = owner(key); return who ? [{ key, ...cast[who] }] : []; });

describe('the voice of the Sky Islands', () => {
  afterEach(() => { setCast({ narrator: '', cast: {} }); });

  it('every character of the islands is in the table of voices with its emoji, and has lines of its own', () => {
    for (const f of FRIENDS) {
      expect(cast[f.id]?.emoji, f.id).toBe(f.emoji);
      expect(lines.some((l) => l.emoji === f.emoji), f.id).toBe(true);
    }
  });

  it('the world hands its table of voices in as it loads and takes it back as it is left', () => {
    expect(SOURCE).toMatch(/\n\s*setCast\(voices\);/);
    expect(SOURCE).toMatch(/scope\.own\(\(\) => setCast\(\{ narrator: '', cast: \{\} \}\)\)/);
  });

  it('the game finds each character\'s line in its voice in the folder of the islands: none goes to the synthesizer', () => {
    setCast(voices);
    const back = worldClips('sky', CLIPS as string[]);
    try {
      for (const { key, emoji, voice } of lines) expect(clipFor(key, emoji), key).toBe(`sky/${key}@${voice}`);
      // the cat's lines under their key
      for (const key of Object.keys(strings.spoken).filter((k) => !owner(k))) expect(clipFor(key, '🐱'), key).toBe(`sky/${key}`);
    } finally { back(); }
  });
});
