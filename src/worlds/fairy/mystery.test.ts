import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { MYSTERY_STAR, mysteryProblems } from '../../game/mystery';
import { CASTLE, CHEST, CRYSTAL, GLADE, HOUSE, MYSTERY_HIDDEN, MYSTERY_OPEN, MYSTERY_SPOTS, PATCH, POND, SHOP_SIGN, SPAWN, UNICORN, WORLD_R } from './layout';
import { QUESTS, SHRINE } from './quests';
import { placeTrees } from './scenery';
import { pathDist } from './terrain';
import { BOULDERS, hiddenFromPath, occluders } from './hiding';

describe('the places of the mysterious stars of the fairy world', () => {
  it('are enough and apart', () => expect(mysteryProblems({ spots: MYSTERY_SPOTS })).toEqual([]));

  it('are off the path, the pond, the castle, the glade, the house and the characters, inside the valley', () => {
    const busy = [SPAWN, PATCH, CRYSTAL, SHOP_SIGN, UNICORN, CHEST, SHRINE, ...QUESTS];
    const bad = MYSTERY_SPOTS.flatMap(({ x, z }, i) => [
      Math.hypot(x, z) > WORLD_R - 9 && 'beyond the valley',
      pathDist(x, z) < 4 && 'on the path',
      Math.hypot(x - POND.x, z - POND.z) < POND.r + 2 && 'in the pond',
      Math.hypot(x - CASTLE.x, z - CASTLE.z) < 15 && 'in the castle',
      Math.hypot(x - GLADE.x, z - GLADE.z) < GLADE.r + 3 && 'in the glade',
      Math.hypot(x - HOUSE.x, z - HOUSE.z) < 4 && 'in the house',
      busy.some((p) => Math.hypot(x - p.x, z - p.z) < 6) && 'at a character or a thing of the world',
    ].filter(Boolean).map((w) => `place ${i} (${x}, ${z}): ${w}`));
    expect(bad).toEqual([]);
  });

  for (const [what, density] of [['the phone', 0.75], ['the computer', 1]] as const) {
    it(`stand clear of the trunks (${what})`, () => {
      const { placed, grove } = placeTrees(mulberry32(2024), density);
      const bad = MYSTERY_SPOTS.flatMap(({ x, z }, i) => [...placed, ...grove].filter((t) => Math.hypot(t.x - x, t.z - z) < 1.5).map(() => `place ${i} (${x}, ${z})`));
      expect(bad).toEqual([]);
    });
  }

  // The star's body as it is drawn (src/game/mystery-stars.ts): from its float to its top at the highest of its bob.
  const { model, scale, float, bob } = MYSTERY_STAR, low = float, high = float + model * scale + bob, half = (model * scale) / 2;

  it('half of them are hidden: from the nearest point of the path the star is behind the house, the glade\'s rocks or a boulder', () => {
    expect(MYSTERY_HIDDEN.length).toBe(MYSTERY_SPOTS.length / 2);
    expect(MYSTERY_SPOTS).toEqual([...MYSTERY_HIDDEN, ...MYSTERY_OPEN]);
    const seen = MYSTERY_HIDDEN.filter(({ x, z }) => !hiddenFromPath(x, z, low, high, half)).map(({ x, z }) => `${x}, ${z}`);
    expect(seen).toEqual([]);
  });

  it('a hidden one is hidden by something: without the occluders the same line of sight is open', () => {
    for (const { x, z } of MYSTERY_HIDDEN) expect(hiddenFromPath(x, z, low, high, half, [])).toBe(false);
    // and the check is not blind: the open ones in the meadow are seen from the path
    expect(MYSTERY_OPEN.filter(({ x, z }) => !hiddenFromPath(x, z, low, high, half, occluders())).length).toBeGreaterThan(MYSTERY_OPEN.length / 2);
  });

  it('the boulders stand off the path and the characters, clear of the trunks, away from the other places', () => {
    const busy = [SPAWN, PATCH, CRYSTAL, SHOP_SIGN, UNICORN, CHEST, SHRINE, ...QUESTS];
    const { placed, grove } = placeTrees(mulberry32(2024), 1);
    const bad = BOULDERS.flatMap((b, i) => [
      pathDist(b.x, b.z) < 3 && 'on the path',
      busy.some((p) => Math.hypot(b.x - p.x, b.z - p.z) < 4) && 'at a character or a thing of the world',
      [...placed, ...grove].some((t) => Math.hypot(t.x - b.x, t.z - b.z) < 2) && 'in a tree',
      MYSTERY_SPOTS.filter((s) => Math.hypot(s.x - b.x, s.z - b.z) < 3.5).length !== 1 && 'not by exactly one place',
    ].filter(Boolean).map((w) => `boulder ${i} (${b.x}, ${b.z}): ${w}`));
    expect(bad).toEqual([]);
  });
});
