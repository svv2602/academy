// @vitest-environment happy-dom
/**
 * Which spot's button shows (./player.ts `spotInReach`, the order `spotOrder`): with the pet after her and a find it
 * likes in the stash, the treat by the pet is in reach wherever she goes - a world's spot there must keep its button.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { spotInReach, spotOrder, type Spot } from './player';

const spot = (label: string, x: number, z: number, r: number, on = true): Spot => ({ pos: new THREE.Vector3(x, 0, z), r, label: label as Spot['label'], on: () => on, run: () => {} });

describe('the button of the spots in reach', () => {
  it('a world\'s spot (the cauldron) wins over the treat by the pet walking after her, 1.1 m off', () => {
    const cauldron = spot('brew', 0, 0, 2.2), treat = spot('treat', 0.7, 2.5, 2.2);
    const her = { x: 0, z: 1.6 };
    expect(spotInReach(spotOrder([cauldron], [treat], []), her.x, her.z)).toBe(cauldron);
    // away from the world's spots the treat is there
    expect(spotInReach(spotOrder([cauldron], [treat], []), 0.5, 4)).toBe(treat);
  });

  it('the order: the pets\', the world\'s, the mysterious stars\' - the later wins; a spot off is never chosen', () => {
    const pet = spot('treat', 0, 0, 3), world = spot('talk', 0, 0, 3), star = spot('open', 0, 0, 3), off = spot('place', 0, 0, 3, false);
    const out: Spot[] = [];
    expect(spotOrder([world, off], [pet], [star], out)).toEqual([pet, world, off, star]);
    expect(spotInReach(out, 0, 0)).toBe(star);
    expect(spotInReach(spotOrder([world, off], [pet], []), 0, 0)).toBe(world);
    expect(spotInReach([off], 0, 0)).toBeNull();
    // filled anew, no allocation per frame
    expect(spotOrder([], [pet], [], out)).toBe(out);
    expect(out).toEqual([pet]);
  });
});
