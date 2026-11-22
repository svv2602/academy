// @vitest-environment happy-dom
/**
 * The sea's characters say their own lines in their own voice (./index.ts FRIENDS: hi, asks, thanks, again; ./voices.ts,
 * ./strings.ts). Each such line must have its clip in the world's list (./clips.json, written by tools/gen_voice.py):
 * without one the game would quietly hand it to the device's synthesizer. Here that fails, with the line to record.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipFor, setCast, worldClips } from '../../core/voice';
import CLIPS from './clips.json';
import { FRIENDS } from './index';
import { strings } from './strings';
import { voices } from './voices';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed for its lines
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

/** Every own line of a character of the sea, with the character. */
const lines = FRIENDS.flatMap((c) => [c.hi, ...(c.asks ?? []), c.thanks, ...(c.again ?? [])]
  .filter((k): k is NonNullable<typeof k> => !!k).map((key) => ({ who: c.id, emoji: c.emoji, key: key as string })));
const cast = voices.cast as Record<string, { emoji: string; voice: string }>;

describe('the own lines of the sea\'s characters', () => {
  afterEach(() => { setCast({ narrator: '', cast: {} }); });

  it('every character has its greeting, a line for each step but a pearl in the world, its thanks and two words of a meeting again', () => {
    for (const c of FRIENDS) {
      expect(c.hi, c.id).toBe(`${c.id}_hi`);
      expect(c.asks?.length, c.id).toBe(c.steps.length);
      c.steps.forEach((s, k) => { if (s !== 'part') expect(c.asks?.[k], `${c.id}, step ${k}`).toBeTruthy(); });
      expect(c.thanks, c.id).toBeTruthy();
      expect(c.again?.length, c.id).toBe(2);
    }
  });

  it('each is a spoken line of the sea under the character\'s id, and the character is in the table of voices with its emoji', () => {
    for (const { who, emoji, key } of lines) {
      expect(Object.hasOwn(strings.spoken, key), `${key} is not in the spoken lines of src/worlds/sea/strings.ts`).toBe(true);
      // `own` of ./voices.ts gives a line its character's voice by the prefix `<id>_`
      expect(key.startsWith(`${who}_`), `${key} of ${who}`).toBe(true);
      expect(cast[who]?.emoji, who).toBe(emoji);
    }
  });

  it('every spoken line of the sea has its clip: a character\'s in its voice, the cat\'s under its key', () => {
    const owner = (k: string) => Object.keys(cast).find((id) => id !== voices.narrator && k.startsWith(`${id}_`));
    const want = Object.keys(strings.spoken).map((k) => { const who = owner(k); return who ? `${k}@${cast[who].voice}` : k; });
    const missing = want.filter((name) => !(CLIPS as string[]).includes(name));
    expect(missing, `no clip in src/worlds/sea/clips.json for ${missing.length} of the ${want.length} lines of the sea: ${missing.join(' ')}. `
      + 'Record them: python3 tools/gen_voice.py --only=<key>,<key> (after a --dry-run)').toEqual([]);
  });

  it('each has its clip in the character\'s voice: none goes to the synthesizer', () => {
    const missing = lines.map(({ who, key }) => `${key}@${cast[who].voice}`).filter((name) => !(CLIPS as string[]).includes(name));
    expect(missing, `no clip in src/worlds/sea/clips.json for ${missing.length} line(s) of the characters: ${missing.join(' ')}. `
      + 'Record them: python3 tools/gen_voice.py --only=<key>,<key> (after a --dry-run)').toEqual([]);
    // and the game finds each by the character's emoji, in the sea's folder
    setCast(voices);
    const back = worldClips('sea', CLIPS as string[]);
    try {
      for (const { emoji, key } of lines) expect(clipFor(key, emoji), key).toBe(`sea/${key}@${cast[lines.find((l) => l.key === key)!.who].voice}`);
    } finally { back(); }
  });
});
