import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { GRAVITY, tuning } from '../../core/tuning';
import { TAKE_R, TAP_R, collectProblems, reaches } from '../../game/collections';
import { COLLECT, OAKS, STEP_UP, SUPPORTS, clearOfFinds, support } from './collect';
import { CASTLE, CHEST, CRYSTAL, GLADE, HOUSE, MYSTERY_SPOTS, PATCH, POND, SHOP_SIGN, SPAWN, UNICORN, WORLD_R } from './layout';
import { QUESTS, SHRINE } from './quests';
import { placeTrees } from './scenery';
import { height, pathDist } from './terrain';
import { BOULDERS } from './hiding';

/** m: how far from the middle of the pond she wades at most (./terrain.ts `resolve`). */
const WADE = POND.r - 1.3;
const busy = [SPAWN, CRYSTAL, SHOP_SIGN, UNICORN, CHEST, SHRINE, ...QUESTS];
const DEER = QUESTS.find((q) => q.id === 'deer')!;
const ground = COLLECT.items.filter((i) => i.way !== 'tap');
const ringOf = (i: { x: number; z: number; way: string }) => (i.way === 'chase' ? 6 : 0);

describe('the collections of the fairy world (PLAY-25)', () => {
  it('four sets of six, every way', () => expect(collectProblems(COLLECT)).toEqual([]));

  it('off the path, the pond, the castle, the glade, the house, the characters and the task\'s flower bed, inside the valley', () => {
    const bad = ground.flatMap((it, i) => [
      Math.hypot(it.x, it.z) + ringOf(it) > WORLD_R - 6 && 'beyond the valley',
      pathDist(it.x, it.z) < 3 && 'on the path',
      Math.hypot(it.x - POND.x, it.z - POND.z) < POND.r + 2 && 'in the pond',
      Math.hypot(it.x - CASTLE.x, it.z - CASTLE.z) < 15 && 'in the castle',
      Math.hypot(it.x - GLADE.x, it.z - GLADE.z) < GLADE.r + 3 && 'in the glade',
      Math.hypot(it.x - HOUSE.x, it.z - HOUSE.z) < 5 && 'in the house',
      busy.some((p) => Math.hypot(it.x - p.x, it.z - p.z) < 6) && 'at a character or a thing of the world',
      Math.hypot(it.x - PATCH.x, it.z - PATCH.z) < 10 && 'among the butterflies of the task',
      // the deer hides its stars 5-12 m round it (./star-search.ts): a find there is walked into on the way to a star,
      // and its line comes over the search's (the finale's walkthrough, 2026-11-20)
      Math.hypot(it.x - DEER.x, it.z - DEER.z) < 14 && 'in the ring of the deer\'s stars',
      MYSTERY_SPOTS.some((p) => Math.hypot(it.x - p.x, it.z - p.z) < 3) && 'at a place of the mysterious stars',
      BOULDERS.some((b) => Math.hypot(it.x - b.x, it.z - b.z) < b.r + 1.5) && 'at a boulder',
    ].filter(Boolean).map((w) => `find ${i} ${it.kind}/${it.way} (${it.x}, ${it.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('apart: two finds stand 5 m apart at least, but the butterflies of one flock', () => {
    const bad: string[] = [];
    COLLECT.items.forEach((a, i) => COLLECT.items.forEach((b, j) => {
      if (j <= i || (a.flock !== undefined && a.flock === b.flock)) return;
      if (Math.hypot(a.x - b.x, a.z - b.z) < 5) bad.push(`${i} and ${j}`);
    }));
    expect(bad).toEqual([]);
  });

  for (const [what, density] of [['the phone', 0.75], ['the computer', 1]] as const) {
    it(`clear of the trunks, the butterflies' rings too (${what})`, () => {
      const { placed, grove } = placeTrees(mulberry32(2024), density);
      const trunks = [...placed, ...grove].filter((t) => t.collide);
      const bad: string[] = [];
      ground.forEach((it, i) => {
        // a acorn hangs by its own oak: the other trunks keep 1.5 m away
        const pts = it.way === 'chase' ? Array.from({ length: 24 }, (_, k) => ({ x: it.x + Math.cos(k / 24 * 6.28) * 6, z: it.z + Math.sin(k / 24 * 6.28) * 6 })) : [it];
        for (const p of pts) if (trunks.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 1.5)) { bad.push(`find ${i} (${it.x}, ${it.z})`); break; }
      });
      expect(bad).toEqual([]);
      // the young oaks and the supports clear of the valley's trees
      for (const p of [...OAKS, ...SUPPORTS]) expect(trunks.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 3), `${p.x}, ${p.z}`).toBe(false);
    });
  }

  it('the acorns hang by an oak of theirs, out of the crown\'s trunk and within her reach across', () => {
    for (const it of COLLECT.items.filter((i) => i.kind === 'acorn')) {
      const d = Math.min(...OAKS.map((p) => Math.hypot(p.x - it.x, p.z - it.z)));
      // the trunk keeps her 0.45 + 0.4 m from its axis: under the acorn she stands within TAKE_R
      expect(d).toBeGreaterThan(0.45 + 0.4 - TAKE_R);
      expect(d).toBeLessThanOrEqual(1);
    }
  });

  it('the feathers on the pond are out of her wading reach and within her touch from its edge', () => {
    for (const it of COLLECT.items.filter((i) => i.way === 'tap')) {
      const d = Math.hypot(it.x - POND.x, it.z - POND.z);
      expect(WADE - d).toBeGreaterThan(TAKE_R);
      expect(WADE - d).toBeLessThanOrEqual(TAP_R - 1);
    }
  });

  it('nothing of chance (the rocks, the bushes) is laid on a find, a oak or a support', () => {
    for (const p of [...COLLECT.items, ...OAKS, ...SUPPORTS]) expect(clearOfFinds(p.x + 0.5, p.z)).toBe(false);
    expect(clearOfFinds(0, 0)).toBe(true);
  });

  /** She runs at `from` toward the support `s` and jumps when `jumpAt` m from its middle: where she ends after 2 s. */
  function runAndJump(s: (typeof SUPPORTS)[number], jumpAt: number | null) {
    const dx = 1, dz = 0, step = 1 / 120;
    let x = s.x - 4, z = s.z, y = height(x, z), vy = 0, grounded = true;
    for (let t = 0; t < 2; t += step) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d > 0.2) { x += dx * tuning.speed * step; z += dz * tuning.speed * step; }
      // the side of the support keeps her out while her feet are below its step (./terrain.ts resolve)
      const top = height(s.x, s.z) + s.top;
      if (Math.hypot(x - s.x, z - s.z) < s.r + 0.4 && y < top - STEP_UP) x = s.x - (s.r + 0.4);
      if (jumpAt !== null && grounded && Math.abs(Math.hypot(s.x - x, s.z - z) - jumpAt) < 0.1) { vy = tuning.jump; grounded = false; }
      vy -= GRAVITY * step; y += vy * step;
      const under = Math.max(height(x, z), support(x, z, y) ?? -Infinity);
      if (y <= under) { y = under; vy = 0; grounded = true; }
    }
    return { x, z, y };
  }

  it('a support: walked into, she stays by its side; a jump puts her up on it and takes what lies there', () => {
    for (const [i, s] of SUPPORTS.entries()) {
      const top = height(s.x, s.z) + s.top, find = COLLECT.items.find((it) => it.way === 'hop' && it.x === s.x && it.z === s.z)!;
      const at = { x: s.x, y: height(s.x, s.z) + find.y, z: s.z };
      const walked = runAndJump(s, null);
      expect(walked.y, `support ${i} walked`).toBeLessThan(top - 0.3);
      expect(reaches('hop', at, walked, 1), `support ${i} walked`).toBe(false);
      const jumped = runAndJump(s, s.r + 0.9);
      expect(jumped.y, `support ${i} jumped`).toBeCloseTo(top, 5);
      expect(reaches('hop', at, jumped, 1), `support ${i} jumped`).toBe(true);
      // its top is a step no slope of the ground under it climbs
      for (let k = 0; k < 16; k++) {
        const x = s.x + Math.cos(k / 16 * 6.28) * s.r, z = s.z + Math.sin(k / 16 * 6.28) * s.r;
        expect(height(x, z), `support ${i}`).toBeLessThan(top - STEP_UP - 0.1);
      }
    }
  });
});
