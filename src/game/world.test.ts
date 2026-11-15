import { describe, expect, it } from 'vitest';
import { pickWorld, type WorldDef } from './world';

/** Only the id matters to pickWorld: the rest of a world is never touched. */
const world = (id: string) => ({ id }) as unknown as WorldDef;

describe('pickWorld', () => {
  const first = world('first'), second = world('second');
  const list = [first, second];

  it('plays the first world of the registry without ?world=', () => {
    expect(pickWorld(list, null, false)).toBe(first);
    expect(pickWorld(list, null, true)).toBe(first);
  });

  it('ignores ?world= without debug: the published game always plays the first world', () => {
    expect(pickWorld(list, 'second', false)).toBe(first);
  });

  it('takes ?world= with debug', () => {
    expect(pickWorld(list, 'second', true)).toBe(second);
    expect(pickWorld(list, 'first', true)).toBe(first);
  });

  it('falls back to the first world for an id no world has', () => {
    expect(pickWorld(list, 'nowhere', true)).toBe(first);
    expect(pickWorld(list, '', true)).toBe(first);
  });

  it('refuses an empty registry', () => {
    expect(() => pickWorld([], null, false)).toThrow();
  });
});
