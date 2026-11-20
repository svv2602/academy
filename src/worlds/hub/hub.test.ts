// @vitest-environment happy-dom
/**
 * The map of the hub (./layout.ts), the worlds behind its arches (./portals.ts) and its tour (./flyover-path.ts):
 * docs/worlds/hub.md, WORLD-01, WORLD-11.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFlyover, pathProblems } from '../../game/flyover';
import { SHELF } from '../../ui/book';
import { HUB_FLYOVER } from './flyover-path';
import { ARRIVE_IN, NESTS, PORTALS, PORTAL_R, RADIUS, TREE, arrivalAt, trunkR } from './layout';
import { portalWorlds } from './portals';
import { strings } from './strings';

describe('the map of the hub', () => {
  it('five arches round the tree, one per place of the shelf, with the symbol of that place', () => {
    expect(PORTALS.map((p) => p.icon)).toEqual(SHELF.map((p) => p.icon));
    for (const p of PORTALS) expect(Math.hypot(p.x, p.z)).toBeCloseTo(PORTAL_R);
    expect(PORTAL_R + 2).toBeLessThan(RADIUS);   // a walker reaches every arch inside the glade
    expect(PORTALS[0].z).toBeCloseTo(PORTAL_R);  // the Fairy Kingdom's to the south, the first entry
  });

  it('arriving through an arch: inside it, facing the tree', () => {
    for (const p of PORTALS) {
      const a = arrivalAt(p.shelf);
      expect(Math.hypot(a.x - p.x, a.z - p.z)).toBeCloseTo(ARRIVE_IN);
      const toTree = Math.atan2(TREE.x - a.x, TREE.z - a.z);
      expect(Math.cos(a.facing - toTree)).toBeCloseTo(1);
    }
  });

  it('the nests climb the trunk, one per place, each on the side of its arch', () => {
    expect(NESTS.map((n) => n.shelf)).toEqual([0, 1, 2, 3, 4]);
    for (let i = 1; i < NESTS.length; i++) expect(NESTS[i].y).toBeGreaterThan(NESTS[i - 1].y);
    expect(NESTS[NESTS.length - 1].y).toBeLessThan(TREE.h);
    expect(trunkR(0)).toBeGreaterThan(trunkR(TREE.h));
  });
});

describe('the worlds behind the arches', () => {
  it('the world with the place of the arch; the arches no world has sleep', () => {
    expect(portalWorlds([{ id: 'fairy', shelf: 0 }, { id: 'hub' }])).toEqual(['fairy', null, null, null, null]);
    expect(portalWorlds([{ id: 'fairy', shelf: 0 }, { id: 'sea', shelf: 2 }])).toEqual(['fairy', null, 'sea', null, null]);
  });

  it('a test world stands behind the first arch no world has: the forest\'s in the probe build (R32)', () => {
    expect(portalWorlds([{ id: 'fairy', shelf: 0 }, { id: 'hub' }, { id: 'probe', test: true }])).toEqual(['fairy', 'probe', null, null, null]);
  });
});

describe('the tour of the hub (WORLD-11)', () => {
  it('within the rules: 5-8 points, 10-15 s; the cat says its line, a line of the hub itself (R34)', () => {
    expect(pathProblems(HUB_FLYOVER)).toEqual([]);
    expect(HUB_FLYOVER.line).toBe('hub_tour');
    expect(Object.keys(strings.spoken)).toContain(HUB_FLYOVER.line);
  });

  it('starts at the roots, rises to the first nest, ends looking at the heroine at the first arch', () => {
    const [first, second] = HUB_FLYOVER.points, last = HUB_FLYOVER.points[HUB_FLYOVER.points.length - 1];
    expect(first.look[1]).toBeLessThan(1.5);
    expect(second.look[1]).toBeCloseTo(NESTS[0].y);
    const start = arrivalAt(0);
    expect(last.look[0]).toBeCloseTo(start.x); expect(last.look[2]).toBeCloseTo(start.z);
  });

  it('all the way the camera keeps clear of the trunk and its roots, and never comes to her head', async () => {
    const tour = createFlyover(HUB_FLYOVER), pos = new THREE.Vector3(), look = new THREE.Vector3();
    const her = arrivalAt(0);
    void tour.start();
    for (let t = 0; t <= HUB_FLYOVER.seconds; t += 0.1) {
      tour.pose(pos, look);
      expect(Math.hypot(pos.x - TREE.x, pos.z - TREE.z), `at ${t.toFixed(1)} s`).toBeGreaterThan(8);
      expect(Math.hypot(pos.x - her.x, pos.y - 1.2, pos.z - her.z), `at ${t.toFixed(1)} s`).toBeGreaterThan(3);
      // never in an arch's stones: 3 m from its middle on the ground, or over its top and crest (5.3 m) with a margin
      for (const p of PORTALS) expect(Math.hypot(pos.x - p.x, pos.z - p.z) > 3 || pos.y > 6.3, `at ${t.toFixed(1)} s by the arch ${p.shelf}`).toBe(true);
      tour.update(0.1);
    }
  });

  it('every point stands on the glade, out of the trunk and under the crown', () => {
    for (const { pos: [x, y, z] } of HUB_FLYOVER.points) {
      expect(Math.hypot(x, z)).toBeLessThan(RADIUS);
      expect(Math.hypot(x - TREE.x, z - TREE.z)).toBeGreaterThan(trunkR(y) + 1);
      expect(y).toBeLessThan(TREE.crown - 5);
    }
  });
});
