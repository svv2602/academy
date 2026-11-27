/**
 * The places of Pip's commands in the valley of the fairies (./en-places.ts, LEARN-23): in order by the rule of the
 * task, on ground she can walk to, and the red flowers where nothing else stands.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { EN_GO_FAR, EN_GO_NEAR, EN_GO_REACH, enPlacesProblems, inRing, kindsAt, reachOf } from '../../game/worldtasks/en-go';
import { BOULDERS } from './hiding';
import { DAILY_PLACES, OAKS, SUPPORTS, clearOfFinds } from './collect';
import { EN_GIVEN, EN_PLACES, HOUSE_REACH, RED_BED, RED_BEDS, redFlowers } from './en-places';
import { CASTLE, CHEST, CRYSTAL, EASEL, GLADE, HOUSE, MYSTERY_SPOTS, PATCH, POND, SHOP_SIGN, SPAWN, TREE_WAY, UNICORN, WORLD_R } from './layout';
import { QUESTS, SHRINE } from './quests';
import { placeTrees } from './scenery';
import { DOOR_OUT } from './secrets';
import { pathDist } from './terrain';

const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** The residents, and the things of the valley that have a tap or a task of their own. */
const BUSY = [...QUESTS, UNICORN, SHRINE, CHEST, CRYSTAL, SHOP_SIGN, EASEL, TREE_WAY, PATCH, SPAWN];

describe('the places of Pip\'s commands in the valley of the fairies', () => {
  it('are in order by the rule of the task: each 15-25 m from where Pip gives his commands, clear of the residents, apart', () => {
    expect(enPlacesProblems(EN_PLACES, EN_GIVEN, BUSY)).toEqual([]);
    expect(EN_PLACES.map((p) => Math.round(d(p, EN_GIVEN) * 10) / 10)).toEqual([19.1, 18, 17, 15.5]);
    expect(EN_PLACES.every((p) => d(p, EN_GIVEN) >= EN_GO_NEAR && d(p, EN_GIVEN) <= EN_GO_FAR)).toBe(true);
  });

  it('the commands that can be given there: the red flowers and the little house - three beds to find, one house', () => {
    expect(kindsAt(EN_PLACES, EN_GIVEN)).toEqual(['flower', 'house']);
    expect(inRing(EN_PLACES, 'flower', EN_GIVEN)).toHaveLength(3);
    expect(inRing(EN_PLACES, 'house', EN_GIVEN)).toHaveLength(1);
    expect(EN_PLACES.filter((p) => p.kind === 'flower').map((p) => p.word)).toEqual(['flower', 'flower', 'flower']);
  });

  it('Pip\'s own place is off the path and no place of a command: she has to walk', () => {
    expect(pathDist(EN_GIVEN.x, EN_GIVEN.z)).toBeGreaterThan(3);
    expect(EN_PLACES.filter((p) => d(p, EN_GIVEN) <= reachOf(p) + 5)).toEqual([]);
  });

  it('the beds of red flowers lie on the meadow she walks: inside the valley, by the path but off it, out of the pond, the castle, the glade and the house', () => {
    const bad = RED_BEDS.flatMap(({ x, z }, i) => [
      Math.hypot(x, z) > WORLD_R - 9 && 'beyond the valley',
      pathDist(x, z) < 3 && 'on the path',
      pathDist(x, z) > 10 && 'far from the path',
      d({ x, z }, POND) < POND.r + 3 && 'in the pond',
      d({ x, z }, CASTLE) < 16 && 'in the castle',
      d({ x, z }, GLADE) < GLADE.r + 4 && 'in the glade',
      d({ x, z }, HOUSE) < HOUSE_REACH + EN_GO_REACH + 1 && 'at the house',
    ].filter(Boolean).map((w) => `bed ${i} (${x}, ${z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('nothing else stands where a bed is: no resident, no thing with a place of its own, no star, no find', () => {
    const bad = RED_BEDS.flatMap((p, i) => [
      BUSY.some((b) => d(p, b) < 7) && 'at a resident or a thing of the valley',
      MYSTERY_SPOTS.some((m) => d(p, m) < 5) && 'at a place of a mysterious star',
      BOULDERS.some((b) => d(p, b) < b.r + 3) && 'at a boulder',
      OAKS.some((o) => d(p, o) < 4) && 'at an oak of the acorns',
      SUPPORTS.some((s) => d(p, s) < 3) && 'at a stump or a stone she jumps on',
      DAILY_PLACES.some((s) => d(p, s) < 4) && 'at a place of the find of the day',
    ].filter(Boolean).map((w) => `bed ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
    expect(redFlowers().filter((f) => !clearOfFinds(f.x, f.z))).toEqual([]);
  });

  for (const [what, density] of [['the phone', 0.75], ['the computer', 1]] as const) {
    it(`no trunk stands in a bed or in her way to its middle (${what})`, () => {
      const { placed, grove } = placeTrees(mulberry32(2024), density);
      const bad = RED_BEDS.flatMap((p, i) => [...placed, ...grove].filter((t) => d(t, p) < RED_BED.r + 1.8).map((t) => `bed ${i} (${p.x}, ${p.z}): a trunk at (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`));
      expect(bad).toEqual([]);
    });
  }

  it('every red flower stands in its bed, well within the place she comes to; the beds are the same on every run', () => {
    const all = redFlowers();
    expect(all).toHaveLength(RED_BEDS.length * RED_BED.flowers);
    RED_BEDS.forEach((bed, b) => {
      const mine = all.slice(b * RED_BED.flowers, (b + 1) * RED_BED.flowers);
      expect(Math.max(...mine.map((f) => d(f, bed)))).toBeLessThanOrEqual(RED_BED.r + 1e-9);
      expect(mine.filter((f, i) => mine.some((g, k) => k !== i && d(f, g) < 0.3))).toEqual([]);       // none on top of another
    });
    expect(RED_BED.r).toBeLessThan(EN_GO_REACH - 1);
    expect(all.every((f) => f.s >= 1.5 && f.s <= 1.9)).toBe(true);        // taller than the meadow's (0.7-1.4)
    expect(redFlowers()).toEqual(all);
  });

  it('the house is come to at its door and anywhere by its wall, and not from the path', () => {
    const house = EN_PLACES.find((p) => p.kind === 'house')!;
    expect([house.x, house.z, house.r]).toEqual([HOUSE.x, HOUSE.z, HOUSE_REACH]);
    expect(DOOR_OUT).toBeLessThan(HOUSE_REACH - 1);            // the door spot is well inside
    expect(HOUSE_REACH).toBeGreaterThan(3.2 + 1.5);            // its wall keeps her 3.2 m out: a band to stand in
    // from the nearest point of the path she is not at the house yet
    expect(pathDist(HOUSE.x, HOUSE.z)).toBeGreaterThan(HOUSE_REACH);
  });
});
