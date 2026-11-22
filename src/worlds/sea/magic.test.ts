/**
 * The magic of the sea (./magic.ts, WORLD-09): with none the sea is as the customer took it but for fewer fish and
 * bubbles, the dim jellyfish and lights; each pearl brings more; only the Pearl of the Deep lights the castle, brightens
 * the shafts the most and clears the far water - the haze begins where it always did.
 */
import { describe, expect, it } from 'vitest';
import { PART_MAGIC, partsTop } from '../../game/magic';
import { CASTLE_LIFT, MAGIC_SWAY, SHAFT_LIGHT, seaLook, seaMagicOf } from './magic';
import type { CharacterDef } from '../../game/world';

/** Five characters of chains of three steps (the sea's are ./index.ts FRIENDS; that module wants a page). */
const FRIENDS = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, steps: ['x', 'y', 'z'] }) as unknown as CharacterDef);

describe('the magic of the sea (WORLD-09)', () => {
  it('with no magic everything is as it was', () => {
    const l = seaLook(0);
    expect(l).toMatchObject({ life: 0, bubbles: 0, sway: 1, lights: 0, castle: 0, near: 1, far: 1 });
    expect(l.shafts).toBeCloseTo(SHAFT_LIGHT[0]);
  });

  it('each pearl brings more, never less', () => {
    let was = seaLook(0);
    for (let k = 1; k <= 6; k++) {
      const l = seaLook(k === 6 ? 1 : k * PART_MAGIC);
      for (const key of ['life', 'bubbles', 'sway', 'lights', 'shafts', 'castle', 'near', 'far'] as const) expect(l[key], `${k} ${key}`).toBeGreaterThanOrEqual(was[key]);
      was = l;
    }
    // two pearls bring all the bubbles, three already most of the life
    expect(seaLook(2 * PART_MAGIC).bubbles).toBe(1);
    expect(seaLook(3 * PART_MAGIC).life).toBeGreaterThan(0.6);
    expect(seaLook(1).sway).toBeCloseTo(MAGIC_SWAY);
  });

  it('only the Pearl of the Deep lights the castle and clears the water', () => {
    const parts = seaLook(partsTop(5));
    expect(parts.castle).toBe(0); expect(parts.far).toBe(1);
    const all = seaLook(1);
    expect(all.castle).toBeCloseTo(CASTLE_LIFT); expect(all.far).toBeGreaterThan(1); expect(all.near).toBe(1); expect(all.shafts).toBeCloseTo(SHAFT_LIGHT[2]);
  });

  it('is read from the save: the chains finished, the Pearl restored', () => {
    expect(seaMagicOf({ quests: {}, final: false }, FRIENDS)).toBe(0);
    const two = Object.fromEntries(FRIENDS.slice(0, 2).map((c) => [c.id, c.steps.length]));
    expect(seaMagicOf({ quests: two, final: false }, FRIENDS)).toBeCloseTo(2 * PART_MAGIC);
    expect(seaMagicOf({ quests: { [FRIENDS[0].id]: 1 }, final: false }, FRIENDS)).toBe(0);
    expect(seaMagicOf({ quests: {}, final: true }, FRIENDS)).toBe(1);
  });
});
