/**
 * The shares of the four subjects (Season 2, step 2, part P; layout §4.3-4.4, the customer's В6, R09): the base
 * 45 / 25 / 15 / 15, each times the parent's step for it (less, as it is, more: x0.5, x1, x1.5), English at 0 when the
 * parent has turned it off, then brought back to a whole. The parents' section shows them (src/ui/ui.ts), the planner's
 * alternation of the subjects takes them (part I) - one sum for both, here.
 * Pure: the save in, numbers out.
 */
import type { Save } from '../core/save';
import { SHARE_STEPS, SUBJECTS, type Share, type Subject } from './types';

/** The customer's shares (В6, R09), before the parent's steps. */
export const BASE_SHARES: Readonly<Record<Subject, number>> = { math: 0.45, logic: 0.25, en: 0.15, read: 0.15 };

/** What the planner aims at: the base times the parent's step, English 0 when off, the whole brought to 1. */
export function targetShares(save: Pick<Save, 'shares' | 'english'>): Record<Subject, number> {
  const w = Object.fromEntries(SUBJECTS.map((k) => [k, k === 'en' && save.english === false ? 0 : BASE_SHARES[k] * (save.shares[k] ?? 1)])) as Record<Subject, number>;
  const sum = SUBJECTS.reduce((n, k) => n + w[k], 0);
  return Object.fromEntries(SUBJECTS.map((k) => [k, sum > 0 ? w[k] / sum : 0])) as Record<Subject, number>;
}

/** The share of each subject among the last tasks (`save.recent`, up to 20); none yet - all 0. */
export function actualShares(recent: readonly Subject[]): Record<Subject, number> {
  return Object.fromEntries(SUBJECTS.map((k) => [k, recent.length ? recent.filter((r) => r === k).length / recent.length : 0])) as Record<Subject, number>;
}

/** The parent's next step for a subject, as the button steps: as it is → more → less → as it is. */
export function nextShare(s: Share): Share {
  const order: readonly Share[] = [1, 1.5, 0.5];
  return order[(order.indexOf(s) + 1) % order.length] ?? SHARE_STEPS[1];
}

/** A share as the parents read it: a whole percent. */
export const percent = (x: number) => `${Math.round(x * 100)}%`;
