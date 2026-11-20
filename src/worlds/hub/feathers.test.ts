/** The feathers of the day of the hub (./feathers.ts): their places on the glade, one a day, the bird asleep. */
import { describe, expect, it } from 'vitest';
import { collectProblems } from '../../game/collections';
import { HUB_COLLECT, birdAsleep, featherOfDay, featherTaken, gapOf, gapSide } from './feathers';
import { PORTALS, RADIUS, arrivalAt, trunkR } from './layout';
import { STUMP, stumpAt, treeShape } from './tree-look';
import { inPassage, placeGlade } from './glade-look';
import { HUB_FLYOVER } from './flyover-path';
import type { WorldState } from '../../core/save';

const ws = (o: Partial<WorldState>) => ({ quests: {}, final: false, starsTaken: [], flags: {}, pos: null, ...o }) as WorldState;

describe('the places of the feathers', () => {
  it('one set of six, taken by walking into them', () => {
    expect(collectProblems(HUB_COLLECT)).toEqual([]);
    expect(HUB_COLLECT.items.every((i) => i.kind === 'treefeather' && i.way === 'run')).toBe(true);
  });

  it('on the glade: past the roots and the stump\'s ring, off the passages, the bushes and rocks, her arrivals', () => {
    const tips = treeShape().roots.map((r) => r[r.length - 1]), st = stumpAt();
    for (const plan of [placeGlade(PORTALS), placeGlade([PORTALS[0], PORTALS[1]]), placeGlade([PORTALS[0]])]) {
      for (const [n, f] of HUB_COLLECT.items.entries()) {
        const d = Math.hypot(f.x, f.z);
        expect(d, `${n}`).toBeLessThan(RADIUS - 3);
        expect(d, `${n}`).toBeGreaterThan(trunkR(0) + 4);
        for (const t of tips) expect(Math.hypot(f.x - t.x, f.z - t.z), `${n} root`).toBeGreaterThan(1.5);
        expect(Math.hypot(f.x - st.x, f.z - st.z), `${n} stump`).toBeGreaterThan(STUMP.ring + 0.8);
        for (const a of PORTALS) expect(inPassage(a, f.x, f.z, 0.5), `${n} passage`).toBe(false);
        for (const c of plan.colliders) expect(Math.hypot(f.x - c.x, f.z - c.z), `${n} bush/rock`).toBeGreaterThan(c.r + 0.8);
        for (const p of PORTALS) { const a = arrivalAt(p.shelf); expect(Math.hypot(f.x - a.x, f.z - a.z), `${n} arrival`).toBeGreaterThan(2.5); }
      }
    }
  });

  it('two feathers 3 m apart at least; each under the low branch of its gap', () => {
    const items = HUB_COLLECT.items;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) expect(Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z)).toBeGreaterThan(3);
    items.forEach((f, i) => { const gap = Math.atan2(f.x, f.z) - gapSide(gapOf(i)); expect(Math.abs(Math.atan2(Math.sin(gap), Math.cos(gap)))).toBeLessThan(0.05); });
  });

  it('not under the tour\'s low points (the camera there looks at the tree, not at a feather)', () => {
    for (const p of HUB_FLYOVER.points) if (p.pos[1] < 2) for (const f of HUB_COLLECT.items) expect(Math.hypot(f.x - p.pos[0], f.z - p.pos[2])).toBeGreaterThan(1.5);
  });
});

describe('one a day', () => {
  it('a new save: the first; nothing asked changes the save', () => {
    const w = ws({});
    expect(featherOfDay(w, '2026-11-20')).toBe(0);
    expect(birdAsleep(w, '2026-11-20')).toBeNull();
    expect(w).toEqual(ws({}));
  });

  it('taken today: none lies there, the bird sleeps over the next one\'s gap; tomorrow the next', () => {
    const w = ws({ found: [0] });
    expect(featherTaken(w, '2026-11-20')).toBe(true);
    expect(w.day).toBe('2026-11-20');
    expect(featherOfDay(w, '2026-11-20')).toBeNull();
    expect(birdAsleep(w, '2026-11-20')).toBe(gapOf(1));
    expect(featherOfDay(w, '2026-11-21')).toBe(1);
    expect(birdAsleep(w, '2026-11-21')).toBeNull();
  });

  it('the second and later are not the first; all six found - none, no bird', () => {
    const w = ws({ found: [0, 1] });
    expect(featherTaken(w, '2026-11-21')).toBe(false);
    const all = ws({ found: [0, 1, 2, 3, 4, 5], day: '2026-11-25' });
    expect(featherOfDay(all, '2026-11-26')).toBeNull();
    expect(birdAsleep(all, '2026-11-25')).toBeNull();
  });

  it('a broken found counts as none found', () => {
    expect(featherOfDay(ws({ found: 'x' as unknown as number[] }), '2026-11-20')).toBe(0);
  });
});
