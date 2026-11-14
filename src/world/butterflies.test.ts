import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Butterflies } from './butterflies';

/** The world as the game builds it: some butterflies over the flowers, the task ones are added after them. */
function meadow(ambient: number, capacity = 96) {
  const flies = new Butterflies(new THREE.Scene(), capacity);
  for (let i = 0; i < ambient; i++) flies.add(i, -i, 2, '#ffffff');
  return flies;
}

describe('Butterflies.truncate', () => {
  it('removes the last butterflies from the list and from what is drawn', () => {
    const flies = meadow(22);
    const first = flies.flies.length;
    for (let i = 0; i < 7; i++) flies.add(50 + i, 50, 0.45, '#ff4fa3', 1.5);
    expect(flies.flies.length).toBe(29);
    expect(flies.mesh.count).toBe(29);
    const kept = flies.flies.slice(0, first);

    flies.truncate(7);

    expect(flies.flies.length).toBe(first);
    expect(flies.mesh.count).toBe(first);
    expect(flies.flies).toEqual(kept);          // the ones over the flowers are untouched
    expect(flies.flies.every((f, i) => f === kept[i])).toBe(true);
  });

  it('gives the freed places to the next butterflies', () => {
    const flies = meadow(22);
    const id = flies.add(50, 50, 0.45, '#ff4fa3');
    expect(id).toBe(22);
    flies.truncate(1);
    expect(flies.add(60, 60, 0.45, '#7a5cff')).toBe(22);
    expect(flies.mesh.count).toBe(23);
    const colour = new THREE.Color();
    flies.mesh.getColorAt(22, colour);
    expect(colour.getHexString()).toBe(new THREE.Color('#7a5cff').getHexString());
  });

  it('keeps the world the same after a task was opened and closed ten times', () => {
    const flies = meadow(22);
    for (let round = 0; round < 10; round++) {
      const n = 3 + (round % 7);                // 3..9, as the task asks for
      const first = flies.flies.length;
      for (let i = 0; i < n; i++) expect(flies.add(50 + i, 50, 0.45, '#ff4fa3')).toBe(first + i);
      flies.truncate(n);
      expect(flies.flies.length).toBe(22);
      expect(flies.mesh.count).toBe(22);
    }
    // ten rounds of up to nine butterflies would not fit the 96 places if they were not given back
    expect(flies.mesh.count).toBeLessThanOrEqual(flies.mesh.instanceMatrix.count);
    expect(() => flies.update(1)).not.toThrow();
  });

  it('moves and draws only the butterflies that are left', () => {
    const flies = meadow(4);
    flies.add(50, 50, 0.45, '#ff4fa3');
    flies.update(1);
    const before = flies.mesh.instanceMatrix.array.slice(4 * 16, 5 * 16);
    flies.truncate(1);
    flies.update(2);
    // the removed place is no longer written to
    expect([...flies.mesh.instanceMatrix.array.slice(4 * 16, 5 * 16)]).toEqual([...before]);
    expect(flies.mesh.count).toBe(4);
  });
});
