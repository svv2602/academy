/**
 * The floor of the sea's look, step A (./life.ts, ./scenery.ts): our own faceted shapes, light enough to stand by the
 * hundred, and the things added to the floor (anemones, the small corals) never on a way nor on what stood there.
 */
import { describe, expect, it } from 'vitest';
import { FLOOR_KINDS, REEF_KINDS, anemoneGeometry, coralGeometry, kelpGeometry, rockGeometry, shellGeometry } from './life';
import { placeLife } from './scenery';
import { pathDist } from './terrain';

const tris = (g: ReturnType<typeof coralGeometry>) => g.getAttribute('position').count / 3;

describe('the floor of the sea (the look, step A)', () => {
  it('every shape is faceted (each triangle its own corners and normal) and light', () => {
    const shapes = { ...Object.fromEntries(REEF_KINDS.map((k) => [`coral ${k}`, coralGeometry(k)])), kelp: kelpGeometry(), rim: kelpGeometry(9, 3),
      rock: rockGeometry(), anemone: anemoneGeometry(), scallop: shellGeometry('fan'), spiral: shellGeometry('spiral') };
    for (const [name, g] of Object.entries(shapes)) {
      expect(g.index, name).toBeNull();
      expect(g.getAttribute('normal'), name).toBeTruthy();
      expect(tris(g), name).toBeGreaterThan(10);
      expect(tris(g), name).toBeLessThanOrEqual(500);
    }
    expect(FLOOR_KINDS.every((k) => REEF_KINDS.includes(k))).toBe(true);
  });

  it('the same floor every time', () => {
    expect(JSON.stringify(placeLife())).toBe(JSON.stringify(placeLife()));
  });

  it('the anemones and the small corals stand off the ways and off what stood there before them', () => {
    const { corals, kelp, rocks, reef, anemones, sprinkle } = placeLife();
    expect(anemones.length).toBeGreaterThan(20);
    expect(sprinkle.length).toBeGreaterThan(corals.length / 2);
    const before = [...corals, ...reef, ...kelp, ...rocks];
    for (const t of [...anemones, ...sprinkle]) {
      expect(pathDist(t.x, t.z)).toBeGreaterThan(2.2);
      expect(before.every((b) => Math.hypot(b.x - t.x, b.z - t.z) >= 1.2 * b.s - 1e-9)).toBe(true);
    }
  });
});
