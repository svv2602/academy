/**
 * The source of randomness of the tasks (ARCH-08). The generators take it as a parameter, so `?seed=` in the address
 * makes the sequence of tasks repeat: two plays with one seed are asked the same tasks in the same order.
 * Without a seed the game is as random as it always was.
 */
import { mulberry32 } from './util';

/** `Math.random`-like: a number from 0 (included) to 1 (not included). */
export type Rng = () => number;

/** FNV-1a: the same text always gives the same 32-bit number, "7" and "07" give different ones. */
function hashSeed(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** No seed (or an empty one): `Math.random` itself. A seed: a repeatable sequence of its own. */
export function createRng(seed: string | null): Rng {
  if (!seed) return Math.random;
  return mulberry32(hashSeed(seed));
}
