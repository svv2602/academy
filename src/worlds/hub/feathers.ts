import type { WorldState } from '../../core/save';
import type { CollectDef, CollectItem } from '../../game/collections';
import { foundOf } from '../../game/collections';
import { dayKey } from '../../game/playtime';
import { PORTALS } from './layout';

/**
 * The find of the day of the hub (the customer's word of 2026-11-20, docs/worlds/hub.md «Повторные входы», п. 2): the
 * feathers of the Great Tree's bird, a collection of their own (`treefeather`, not the fairy world's feathers) - six,
 * one at a time, a new one a day. A feather lies on the glade under the low branch of its gap between two arches (the
 * branches of ./tree-look.ts `treeShape` stand in the same gaps); the sixth in the first gap again, farther out.
 *
 * What is found is the hub's `ws.found` (src/game/collections.ts); the day the last one was taken is the hub's `ws.day`
 * (an optional field, no new version). On a day one was taken no feather lies there: the bird sleeps on its branch.
 */

/** m from the trunk's middle: past the roots (≈ 6.3) and the ring of the stump (6.8 ± 1.6), short of the arches. */
export const FEATHER_R = 9.2;
/** The gap between the arches `k` and `k + 1`: its side (0 = +z, as the arches). */
export const gapSide = (k: number) => PORTALS[k % PORTALS.length].facing + Math.PI / PORTALS.length;

const at = (k: number, r: number): CollectItem => {
  const a = gapSide(k);
  return { kind: 'treefeather', way: 'run', x: Math.sin(a) * r, z: Math.cos(a) * r, y: 0.2 };
};
/**
 * The six feathers, in the order they are given (their numbers in the save: only ever added to at the end); out on the
 * glade, the one of the day alone (CollectDef.shown, asked by the game each frame).
 */
export const HUB_COLLECT: CollectDef = {
  items: [at(0, FEATHER_R), at(2, FEATHER_R), at(4, FEATHER_R), at(1, FEATHER_R + 1.4), at(3, FEATHER_R), at(0, FEATHER_R + 3.2)],
  shown: (ws) => { const i = featherOfDay(ws, featherDay()); return i === null ? [] : [i]; },
};

/** The gap of the feather `i` (where its bird sleeps). */
export const gapOf = (i: number) => [0, 2, 4, 1, 3, 0][i];

/**
 * The feather lying today, by its number, or null: the first not found yet, unless one was taken today (`today`, a
 * dayKey) or all six are found. Asking changes nothing.
 */
export function featherOfDay(ws: Partial<WorldState>, today: string): number | null {
  if (ws.day === today) return null;
  const found = Array.isArray(ws.found) ? ws.found : [];
  const i = HUB_COLLECT.items.findIndex((_, n) => !found.includes(n));
  return i < 0 ? null : i;
}

/** Where the bird sleeps today: the gap of the next feather, once one was taken today and more are left; else null. */
export function birdAsleep(ws: Partial<WorldState>, today: string): number | null {
  if (ws.day !== today) return null;
  const found = Array.isArray(ws.found) ? ws.found : [];
  const i = HUB_COLLECT.items.findIndex((_, n) => !found.includes(n));
  return i < 0 ? null : gapOf(i);
}

/** A feather was taken (the hub's found grew): today is its day. True when it is the first ever (the cat's word). */
export function featherTaken(ws: WorldState, today: string): boolean {
  ws.day = today;
  return foundOf(ws).length === 1;
}

/** The day the walkthrough takes as today (?debug: `__game.hub.feathers`), null - the local date. */
export const featherState: { day: string | null } = { day: null };
/** Today as the feathers read it. */
export const featherDay = (now = Date.now()): string => featherState.day ?? dayKey(new Date(now));
