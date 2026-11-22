/**
 * The magic of the sea (./magic.ts, WORLD-09): with none the sea is muted - a cold dim light, faint caustics, pale
 * corals, fewer fish and bubbles, the dim jellyfish and lights; each pearl brings more, the pearls bring back the sea the
 * customer took; only the Pearl of the Deep lights the castle. The haze is not the magic's.
 */
import { describe, expect, it } from 'vitest';
import { PART_MAGIC, partsTop } from '../../game/magic';
import { CAUSTICS, MUTE, HEMI_POWER, MAGIC_SWAY, PALE, SHAFT_LIGHT, SUN_POWER, seaLook, seaMagicOf } from './magic';
import type { CharacterDef } from '../../game/world';

/** Five characters of chains of three steps (the sea's are ./index.ts FRIENDS; that module wants a page). */
const FRIENDS = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, steps: ['x', 'y', 'z'] }) as unknown as CharacterDef);

describe('the magic of the sea (WORLD-09)', () => {
  it('with no magic the sea is muted: the light colder and dimmer, the caustics faint, the corals pale', () => {
    const l = seaLook(0);
    expect(l).toMatchObject({ life: 0, bubbles: 0, sway: 1, lights: 0, warmth: 0, pearl: 0, pale: PALE });
    expect(l.shafts).toBeCloseTo(SHAFT_LIGHT[0]); expect(l.sun).toBeCloseTo(SUN_POWER[0]); expect(l.hemi).toBeCloseTo(HEMI_POWER[0]); expect(l.caustics).toBeCloseTo(CAUSTICS[0]); expect(l.mute).toBeCloseTo(MUTE[0]);
    // muted is a good deal less than the sea taken (the customer: the difference seen on a phone's picture)
    expect(SUN_POWER[0] / SUN_POWER[1]).toBeLessThan(0.75);
    expect(CAUSTICS[0] / CAUSTICS[1]).toBeLessThan(0.4);
    expect(PALE).toBeGreaterThan(0.5); expect(MUTE[0]).toBeGreaterThan(0.3);
  });

  it('each pearl brings more, never less', () => {
    let was = seaLook(0);
    for (let k = 1; k <= 6; k++) {
      const l = seaLook(k === 6 ? 1 : k * PART_MAGIC);
      for (const key of ['life', 'bubbles', 'sway', 'lights', 'warmth', 'sun', 'hemi', 'caustics', 'shafts', 'pearl'] as const) expect(l[key], `${k} ${key}`).toBeGreaterThanOrEqual(was[key]);
      expect(l.pale, `${k} pale`).toBeLessThanOrEqual(was.pale);
      expect(l.mute, `${k} mute`).toBeLessThanOrEqual(was.mute);
      was = l;
    }
    // two pearls bring all the bubbles, three already most of the life
    expect(seaLook(2 * PART_MAGIC).bubbles).toBe(1);
    expect(seaLook(3 * PART_MAGIC).life).toBeGreaterThan(0.6);
    expect(seaLook(1).sway).toBeCloseTo(MAGIC_SWAY);
  });

  it('only the Pearl of the Deep lights the castle; with it the corals are all their colour, the light the warmest', () => {
    expect(seaLook(partsTop(5)).pearl).toBe(0);
    const all = seaLook(1);
    expect(all).toMatchObject({ pearl: 1, pale: 0, warmth: 2 });
    expect(all.shafts).toBeCloseTo(SHAFT_LIGHT[2]); expect(all.sun).toBeCloseTo(SUN_POWER[2]); expect(all.caustics).toBeCloseTo(CAUSTICS[2]);
  });

  it('is read from the save: the chains finished, the Pearl restored', () => {
    expect(seaMagicOf({ quests: {}, final: false }, FRIENDS)).toBe(0);
    const two = Object.fromEntries(FRIENDS.slice(0, 2).map((c) => [c.id, c.steps.length]));
    expect(seaMagicOf({ quests: two, final: false }, FRIENDS)).toBeCloseTo(2 * PART_MAGIC);
    expect(seaMagicOf({ quests: { [FRIENDS[0].id]: 1 }, final: false }, FRIENDS)).toBe(0);
    expect(seaMagicOf({ quests: {}, final: true }, FRIENDS)).toBe(1);
  });
});
