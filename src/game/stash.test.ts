/** The stash of finds to spend (./stash.ts, PLAY-26): apart from the book, all or nothing, kept by the save. */
import { describe, expect, it } from 'vitest';
import { defaultSave } from '../core/save';
import { STASH_MAX, addToStash, canSpend, inStash, spend } from './stash';

describe('the stash', () => {
  it('a fresh save has none, and asking creates nothing', () => {
    const s = defaultSave();
    expect(inStash(s, 'acorn')).toBe(0);
    expect(s.stash).toBeUndefined();
  });

  it('adds by kind, up to STASH_MAX; nothing for a count that is not positive', () => {
    const s = defaultSave();
    addToStash(s, 'acorn'); addToStash(s, 'acorn', 2); addToStash(s, 'feather', 0); addToStash(s, 'feather', -3);
    expect(s.stash).toEqual({ acorn: 3 });
    addToStash(s, 'acorn', 500);
    expect(inStash(s, 'acorn')).toBe(STASH_MAX);
  });

  it('spends all that is asked or nothing; a kind spent out leaves the field', () => {
    const s = defaultSave();
    addToStash(s, 'mushroom', 2); addToStash(s, 'feather', 1);
    expect(canSpend(s, { mushroom: 2, feather: 2 })).toBe(false);
    expect(spend(s, { mushroom: 2, feather: 2 })).toBe(false);
    expect(s.stash).toEqual({ mushroom: 2, feather: 1 });
    expect(spend(s, { mushroom: 1, feather: 1 })).toBe(true);
    expect(s.stash).toEqual({ mushroom: 1 });
    expect(spend(s, {})).toBe(true);
  });

  it('spending never touches what the book found', () => {
    const s = defaultSave();
    s.worlds.fairy = { quests: {}, final: false, starsTaken: [], flags: {}, pos: null, found: [0, 1] };
    addToStash(s, 'mushroom', 2);
    spend(s, { mushroom: 2 });
    expect(s.worlds.fairy).toMatchObject({ found: [0, 1] });
  });
});
