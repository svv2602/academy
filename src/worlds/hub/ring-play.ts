import type { PetSteer } from '../../game/pets';
import { STUMP } from './tree-look';

/**
 * The pet plays at the ring of mushrooms (the customer's word of 2026-11-20, docs/worlds/hub.md «Повторные входы»,
 * п. 3): while she stands by the stump (within PLAY.near of its middle) for PLAY.still seconds, the pet that walks
 * after her runs round the ring, just outside it; as soon as she walks off past PLAY.leave, or a scene takes the
 * controls, it is by her side again. Pure: the stump's place, her place and whether the game is busy come in.
 */
export const PLAY = { near: 4.5, leave: 5.5, still: 1.5, r: STUMP.ring + 0.8, turn: 0.9 } as const;

export function ringPlay(stump: { x: number; z: number }, hero: () => { x: number; z: number }, busy: () => boolean): PetSteer {
  let still = 0, last: { x: number; z: number } | null = null, a: number | null = null;
  return (dt, pet) => {
    const h = hero(), d = Math.hypot(h.x - stump.x, h.z - stump.z);
    const moved = last ? Math.hypot(h.x - last.x, h.z - last.z) : 0;
    last = { x: h.x, z: h.z };
    if (busy() || d > (a === null ? PLAY.near : PLAY.leave)) { still = 0; a = null; return null; }
    if (a === null) {
      still = moved > 0.02 ? 0 : still + dt;
      if (still < PLAY.still) return null;
      a = Math.atan2(pet.x - stump.x, pet.z - stump.z);   // from where it stands round the ring
    }
    a += PLAY.turn * dt;
    return { x: stump.x + Math.sin(a) * PLAY.r, z: stump.z + Math.cos(a) * PLAY.r };
  };
}
