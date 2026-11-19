import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { mysteryProblems } from '../../game/mystery';
import { CASTLE, CHEST, CRYSTAL, GLADE, HOUSE, MYSTERY_SPOTS, PATCH, POND, SHOP_SIGN, SPAWN, UNICORN, WORLD_R } from './layout';
import { QUESTS, SHRINE } from './quests';
import { placeTrees } from './scenery';
import { pathDist } from './terrain';

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
});
