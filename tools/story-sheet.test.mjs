// The sheet of a cut-scene (tools/story-sheet.mjs): it reads the scenes of the world as the game has them, and wraps a
// line without losing a word.
import { describe, expect, it } from 'vitest';
import { FAIRY_STORIES } from '../src/worlds/fairy/story';
import { scenesOf, wrap } from './story-sheet.mjs';

describe('the sheet of a cut-scene', () => {
  it('reads the scenes of the first world from its story.ts in the order and with the frames the game plays', () => {
    expect(scenesOf('fairy')).toEqual(FAIRY_STORIES.map((s) => ({ id: s.id, shots: s.shots.map((f) => ({ image: f.image, line: f.line })) })));
  });

  it('wraps a line by words, none lost, no line longer than asked unless one word is', () => {
    const text = 'Ой! Кристал розлетівся на пʼять уламків, і чари почали тьмяніти.';
    const lines = wrap(text, 20);
    expect(lines.join(' ')).toBe(text);
    expect(lines.every((l) => l.length <= 20 || !l.includes(' '))).toBe(true);
    expect(wrap('надзвичайнодовгесловобезпробілів', 5)).toEqual(['надзвичайнодовгесловобезпробілів']);
  });
});
