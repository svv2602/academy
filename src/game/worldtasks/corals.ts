/**
 * "The search among the corals" (WORLD-17, the sea dragon's reef): the description. The dragon shows in a bubble what
 * is looked for - a shell of a colour and a shape; among the corals lie 3-5 of it and beside them look-alikes. The
 * level of "Classification" is only read (the search goes to no skill, as LEARN-02): the higher it is, the finer the
 * look-alikes differ - on 1-2 in both colour and shape, on 3 in one of the two, on 4-5 in one of them with a colour
 * near the shell's own. A look-alike tapped is no mistake: it rocks and the cat says what is looked for again.
 *
 * Where each lies is the world's (it knows its corals); here only what lies: the shells looked for and the look-alikes.
 */
import { pick, randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';

/** The shells of the search: their shapes, and their colours in pairs of near ones (a colour and its near one). */
export const SHELL_SHAPES = ['scallop', 'spiral', 'cone'] as const;
export type ShellShape = typeof SHELL_SHAPES[number];
export const SHELL_COLORS = ['pink', 'coral', 'lilac', 'violet', 'sand', 'gold'] as const;
export type ShellColor = typeof SHELL_COLORS[number];
/** The near colour of each: the look-alike of levels 4-5 (pink - coral, lilac - violet, sand - gold). */
export const NEAR: Readonly<Record<ShellColor, ShellColor>> = { pink: 'coral', coral: 'pink', lilac: 'violet', violet: 'lilac', sand: 'gold', gold: 'sand' };

export interface Shell { color: ShellColor; shape: ShellShape }
export interface CoralsBody {
  /** What is looked for (shown in the bubble). */
  sample: Shell;
  /** How many of it lie among the corals. */
  hidden: number;
  /** The look-alikes, each different from the sample. */
  alike: Shell[];
}

/** "Classification" by level: how many are looked for, how many look-alikes, how they differ. */
export const CORALS_BY_LEVEL: Readonly<Record<number, { hidden: [number, number]; alike: number; differ: 'both' | 'one' | 'near' }>> = {
  1: { hidden: [3, 3], alike: 2, differ: 'both' },
  2: { hidden: [3, 4], alike: 3, differ: 'both' },
  3: { hidden: [4, 4], alike: 4, differ: 'one' },
  4: { hidden: [4, 5], alike: 4, differ: 'near' },
  5: { hidden: [5, 5], alike: 5, differ: 'near' },
};

export const sameShell = (a: Shell, b: Shell) => a.color === b.color && a.shape === b.shape;

export function generateCorals(level: number, rng: Rng): CoralsBody {
  const by = CORALS_BY_LEVEL[Math.min(5, Math.max(1, Math.round(level)))];
  const sample: Shell = { color: pick(SHELL_COLORS, rng), shape: pick(SHELL_SHAPES, rng) };
  const otherColor = () => pick(SHELL_COLORS.filter((c) => c !== sample.color && c !== NEAR[sample.color]), rng);
  const otherShape = () => pick(SHELL_SHAPES.filter((s) => s !== sample.shape), rng);
  const alike: Shell[] = [];
  for (let i = 0; i < by.alike; i++) {
    const byColor = i % 2 === 0;
    if (by.differ === 'both') alike.push({ color: otherColor(), shape: otherShape() });
    else if (by.differ === 'one') alike.push(byColor ? { color: otherColor(), shape: sample.shape } : { color: sample.color, shape: otherShape() });
    else alike.push(byColor ? { color: NEAR[sample.color], shape: sample.shape } : { color: sample.color, shape: otherShape() });
  }
  return { sample, hidden: randInt(by.hidden[0], by.hidden[1], rng), alike: shuffle(alike, rng) };
}
