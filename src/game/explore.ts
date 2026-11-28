import type { Save, WorldState } from '../core/save';
import { itemsOf, kindsOf, setDone, setKindsOf, EASEL_ITEM } from './collections';
import { knownWorlds, type ArtifactWorld } from './artifacts';

/**
 * The explorer's key (docs/12-gameplay.md PLAY-36, the customer's word of 2026-11-28 «ключ исследователя целиком,
 * порог 50 %»): how much of a world she has explored, in points. A point is
 * - a secret found (`WorldDef.secrets`, a flag of the world's own),
 * - a collection gathered whole (a set of SET_SIZE finds; the pieces of the picture are not a set),
 * - the picture set on the easel (`ws.flags.easel`; a world whose finds have pieces has an easel),
 * - a step of the mysterious stars solved in the world over every day: STAR_STEPS (the lead's word of 2026-11-28).
 * The next world's arch wakes once the world is done and EXPLORE_SHARE of its points are got (src/worlds/hub/portals.ts);
 * every point there is is the gold frame by its nest on the Great Tree and the achievement «Дослідниця».
 *
 * Read from the world's part of the save alone, as the keepsakes are (src/worlds/hub/keepsakes.ts): the hub counts a
 * world whose code is not loaded from what the registry knows of it (ArtifactWorld). Nothing stored of its own but the
 * count of the stars solved over the days (`ws.mysteryTotal`, ./mystery-stars.ts), which no daily state keeps.
 */

/** The solved mysterious stars of a world that make its points: 20 take two days at least (10 a day, ./mystery.ts). */
export const STAR_STEPS = [5, 10, 15, 20] as const;
/** The share of the points that wakes the next arch: reachable in the first visit, without the next day's stars. */
export const EXPLORE_SHARE = 0.5;

/** A world's points: got and of each kind (`mystery` - the steps of the stars), their sums, and how many wake the next arch. */
export interface Explored {
  readonly secrets: Part; readonly sets: Part; readonly easel: Part; readonly mystery: Part;
  readonly got: number; readonly of: number; readonly need: number;
}
interface Part { readonly got: number; readonly of: number }

/** The world's part of the save, read without creating it. */
const stored = (save: Save, id: string): Partial<WorldState> => {
  const w = save.worlds[id] as unknown;
  return typeof w === 'object' && w !== null ? w as Partial<WorldState> : {};
};

/** The mysterious stars solved in the world over every day: the count kept, or (before the key) today's solved. */
export function mysteryTotalOf(ws: Partial<WorldState>): number {
  const n = ws.mysteryTotal;
  if (typeof n === 'number' && Number.isInteger(n) && n >= 0) return n;
  const today = ws.mystery?.solved;
  return Array.isArray(today) ? today.length : 0;
}

/** Whether the world's finds have the pieces of a picture: then it has an easel (src/worlds/meta.test.ts holds it). */
export const hasEasel = (w: ArtifactWorld): boolean => !!w.collect && kindsOf(w.collect).includes('piece');

/** How much of the world `w` she has explored. */
export function exploreOf(save: Save, w: ArtifactWorld): Explored {
  const ws = stored(save, w.id), flags = (ws.flags ?? {}) as Record<string, unknown>;
  const found = Array.isArray(ws.found) ? ws.found.filter((n) => Number.isInteger(n)) : [];
  const secretIds = w.secrets ?? [], setKinds = w.collect ? setKindsOf(w.collect) : [];
  const secrets = { got: secretIds.filter((s) => flags[s] === true).length, of: secretIds.length };
  const sets = { got: setKinds.filter((k) => setDone(w.collect!, k, found)).length, of: setKinds.length };
  const easel = hasEasel(w) ? { got: flags[EASEL_ITEM] === true ? 1 : 0, of: 1 } : { got: 0, of: 0 };
  const total = mysteryTotalOf(ws), mystery = { got: STAR_STEPS.filter((n) => total >= n).length, of: STAR_STEPS.length };
  const got = secrets.got + sets.got + easel.got + mystery.got, of = secrets.of + sets.of + easel.of + mystery.of;
  return { secrets, sets, easel, mystery, got, of, need: Math.ceil(of * EXPLORE_SHARE) };
}

/** Whether the world is explored enough to wake the next arch (with no points at all - a world with nothing - it is). */
export const halfExplored = (e: Explored): boolean => e.got >= e.need;
/** Whether every point of the world is got. */
export const fullyExplored = (e: Explored): boolean => e.of > 0 && e.got >= e.of;

/** Whether an arch follows the world `w` (a world on a later place of the shelf): its points wake it. */
export const gatesArch = (w: ArtifactWorld, worlds: readonly ArtifactWorld[] = knownWorlds()): boolean =>
  w.shelf !== undefined && worlds.some((o) => o.shelf !== undefined && o.shelf > w.shelf!);

/** One more mysterious star solved in the world (./mystery-stars.ts, once per star and day). */
export function countMystery(ws: WorldState): void {
  ws.mysteryTotal = mysteryTotalOf(ws) + 1;
}

/**
 * Gives the world `w` points until `share` of them are got (?debug, `__game.explore.fill`, the walkthrough's block
 * "doze"): its secrets first, then its sets, the easel, the steps of the stars - in that order. Only adds.
 */
export function fillExplore(save: Save, w: ArtifactWorld, share: number): Explored {
  const ws = (save.worlds[w.id] ??= { quests: {}, final: false, starsTaken: [], flags: {}, pos: null });
  ws.flags ??= {};
  const want = Math.ceil(exploreOf(save, w).of * share), more = () => exploreOf(save, w).got < want;
  for (const id of w.secrets ?? []) { if (!more()) break; ws.flags[id] = true; }
  if (w.collect) {
    for (const k of setKindsOf(w.collect)) { if (!more()) break; ws.found = [...new Set([...(ws.found ?? []), ...itemsOf(w.collect, k)])]; }
  }
  if (more() && hasEasel(w)) ws.flags[EASEL_ITEM] = true;
  for (const n of STAR_STEPS) { if (!more()) break; ws.mysteryTotal = Math.max(mysteryTotalOf(ws), n); }
  return exploreOf(save, w);
}
