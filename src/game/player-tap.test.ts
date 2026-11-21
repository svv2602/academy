// @vitest-environment happy-dom
/** Where a tap goes (src/game/player.ts tapTarget): the cat before a spot it stands nearer to. */
import { describe, expect, it } from 'vitest';
import { CAT_TAP_PX, SPOT_TAP_PX, tapTarget } from './player';

describe('a tap: the cat, a spot or the ground', () => {
  it('on the cat with the treat spot of the pet by it: the cat says its line, no treat is given (PLAY-21, PLAY-27)', () => {
    expect(tapTarget(40, 10, true)).toBe('cat');
    expect(tapTarget(40, 10, false)).toBe('cat');
    expect(tapTarget(30, 30, true)).toBe('cat');   // as near: the cat
  });

  it('on a spot the cat stands farther from than the spot: she walks to the spot', () => {
    expect(tapTarget(10, 40, true)).toBe('spot');
    expect(tapTarget(SPOT_TAP_PX - 1, CAT_TAP_PX.touch, true)).toBe('spot');   // the cat out of reach
  });

  it('nothing near: the ground; the cat alone: the cat; a mouse reaches the cat less far than a finger', () => {
    expect(tapTarget(null, 500, true)).toBe('ground');
    expect(tapTarget(null, 20, false)).toBe('cat');
    expect(tapTarget(null, 60, true)).toBe('cat');
    expect(tapTarget(null, 60, false)).toBe('ground');
  });
});
