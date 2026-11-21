import { damp, lerp } from '../core/util';

/**
 * The magic of a world (WORLD-09), what every world shares: one number from 0 to 1 read from the progress the save
 * already holds (nothing new is stored), and the value shown following it smoothly. Every part of the artifact given
 * back adds PART_MAGIC; the artifact restored brings it to 1 (decision Q11). The first world keeps its own module of
 * the same rule (src/worlds/fairy/magic.ts); the next worlds read this one.
 */
export const PART_MAGIC = 0.16;

/** The magic of `parts` parts given back, the artifact restored or not. */
export function partsMagic(parts: number, restored: boolean): number {
  return restored ? 1 : Math.min(1, parts * PART_MAGIC);
}

/** What the parts alone can give: the magic over it is the restored artifact's. */
export const partsTop = (parts: number) => Math.min(1, parts * PART_MAGIC);

export interface Magic {
  /** The magic shown now: it follows `target` smoothly. */
  readonly value: number;
  /** The magic of the save (or the debug value). */
  readonly target: number;
  /** One frame: follows the save, then lays the value onto the world. */
  update(dt: number): void;
  /** Debug (?debug only, through window.__game.setMagic): show this magic at once; null - the save's again. */
  set(v: number | null): void;
}

/** The magic that follows `saved()` (a little more each frame: about a second and a half to come), laid on by `apply`. */
export function followMagic(saved: () => number, apply: (m: number, dt: number) => void): Magic {
  let forced: number | null = null;
  let value = saved();
  apply(value, 0);
  return {
    get value() { return value; },
    get target() { return forced ?? saved(); },
    update(dt) {
      const target = forced ?? saved();
      value = Math.abs(target - value) < 0.002 ? target : lerp(value, target, damp(0.8, dt));
      apply(value, dt);
    },
    set(v) {
      forced = v === null ? null : Math.min(1, Math.max(0, v));
      if (forced !== null) { value = forced; apply(value, 0); }
    },
  };
}
