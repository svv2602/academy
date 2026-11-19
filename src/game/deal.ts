/**
 * The deal of the day (decision of 2026-11-20): every day one thing of the shop is 40 % cheaper (DEAL_OFF, no less
 * than DEAL_MIN stars), one purchase at that price a day. The day is the local date (`dayKey`, as the gift of the day).
 * Which thing: every id of the shop gets a rank by a hash of the day and the id; the deal is the first by rank that
 * she could buy now (src/game/shop.ts `dealOf`). So the deal is the same all day - a reload, or a purchase of another
 * thing, changes nothing - and a deal she took is not followed by another one that day.
 *
 * `dealState`: the walkthrough's own lever (window.__game.deal, ?debug only; R61): `held` - no deal at all, so the
 * pieces play the same whatever the real date; `day` - the day the game takes as today.
 */
import { dayKey } from './playtime';

/** The share taken off the price of the deal. */
export const DEAL_OFF = 0.4;
/** No deal costs less than this. */
export const DEAL_MIN = 5;

/** The walkthrough's lever; the game never pulls it. */
export const dealState: { held: boolean; day: string | null } = { held: false, day: null };

/** Today as the deal reads it: the local date, or the day the walkthrough set. */
export const dealDay = (now = Date.now()): string => dealState.day ?? dayKey(new Date(now));

/** The price of a deal: 40 % off, rounded to whole stars, no less than DEAL_MIN, never more than the price itself. */
export function discounted(price: number): number {
  return Math.min(price, Math.max(DEAL_MIN, Math.round(price * (1 - DEAL_OFF))));
}

/** FNV-1a of a text: the rank of an id on a day. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/** The ids in their order of rank on `day`: the deal is the first of them she could buy. */
export function ranked(day: string, ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => hash(`${day}|${a}`) - hash(`${day}|${b}`) || (a < b ? -1 : 1));
}
