/**
 * "Find a red flower!" - a command of Pip she follows in the world (Season 2, step 2, part E; LEARN-23). The voice of
 * English names a kind of place and she walks there by herself: no path of sparkles leads her, the heroine is not held,
 * the camera is her own. This file is the rule of it - the places a world names (`WorldDef.enPlaces`), which of them a
 * command sends her to, when she has come and when she has stopped at a wrong one - and the guard of a world's list.
 *
 * - A command is given at a place (Pip's) and names a kind. It can be given only when a place of that kind lies
 *   EN_GO_NEAR..EN_GO_FAR m from there: a walk long enough to be a walk, short enough for a child (layout §2).
 * - She has come once she is within EN_GO_REACH of ANY place of the kind named: every red flower is a red flower.
 * - A wrong place is one of another kind she STANDS at (EN_GO_DWELL s without moving on): passing the little house on
 *   the way to the flowers is no mistake. A wrong place takes nothing away (R26); it counts once, until she leaves it.
 * - The residents' chains are not touched (R10): no place stands at a resident, and the task is no step of a chain.
 */
import type { Rng } from '../../core/rng';
import { pick } from '../../core/util';
import type { WordId } from '../../s2/types';

/**
 * The kinds of place a command can name: each is a whole phrase of Pip, `en_go_<kind>` (lines §2.2). Step 2 has the
 * three its worlds really have a thing for - the red flowers and the little house of the fairies, the big mushrooms of
 * the forest. The owl, the hedgehog, the fox and the bridge wait for step 3 (the lead, 2026-11-27): the first two are
 * residents with chains of their own (R10), the forest has no fox, the fairies no bridge.
 */
export const EN_PLACE_KINDS = ['flower', 'house', 'mushroom'] as const;
export type EnPlaceKind = (typeof EN_PLACE_KINDS)[number];

/**
 * A place of a world a command can send her to: where it is, what it is, and the word of the book said for it - the
 * frame "Find…" and the word apart (R17) while Pip's whole phrase is not recorded (R32). `r`: how near she has come
 * to it, for a thing she cannot stand in the middle of (a house); absent - EN_GO_REACH.
 */
export interface EnPlace { readonly x: number; readonly z: number; readonly kind: EnPlaceKind; readonly word: WordId; readonly r?: number }

/** How far from where the command is given its place lies, m: no nearer, no farther. */
export const EN_GO_NEAR = 15, EN_GO_FAR = 25;
/** She has come to a place: this near, m - unless the place names its own (`EnPlace.r`, EN_GO_REACH_MAX at most). */
export const EN_GO_REACH = 3, EN_GO_REACH_MAX = 8;
/** How near she has come to `p`. */
export const reachOf = (p: Pick<EnPlace, 'r'>) => p.r ?? EN_GO_REACH;
/** She stands at a place, not passes it: this long without moving on, s - and "moving on" is more than this, m. */
export const EN_GO_DWELL = 1.5, EN_GO_STILL = 0.4;
/**
 * Two places of different kinds stand apart by their two reaches and this much more, m: at both at once she would be
 * told "wrong" while she stands at the right one.
 */
export const EN_GO_APART = 1;
/**
 * A resident, or a thing of the world with a tap of its own, stands this much beyond the reach of a place, m (R10): by
 * a resident she is at no place of a command.
 */
export const EN_GO_CLEAR = 2;

type At = { readonly x: number; readonly z: number };
const dist = (a: At, b: At) => Math.hypot(a.x - b.x, a.z - b.z);

/** The places of `kind` a command given at `from` can send her to: those in the ring of EN_GO_NEAR..EN_GO_FAR m. */
export function inRing(places: readonly EnPlace[], kind: EnPlaceKind, from: At): EnPlace[] {
  return places.filter((p) => p.kind === kind && dist(p, from) >= EN_GO_NEAR && dist(p, from) <= EN_GO_FAR);
}

/** The kinds a command given at `from` can name: those with a place in the ring, in the order of EN_PLACE_KINDS. */
export function kindsAt(places: readonly EnPlace[], from: At): EnPlaceKind[] {
  return EN_PLACE_KINDS.filter((kind) => inRing(places, kind, from).length > 0);
}

/**
 * The place a command of `kind` given at `from` is about: one of those in the ring, by `rng` (always one draw when
 * there is any: one seed, one walk - ARCH-08); null when the world has none there - the command is not given.
 */
export function pickTarget(places: readonly EnPlace[], kind: EnPlaceKind, from: At, rng: Rng): EnPlace | null {
  const ring = inRing(places, kind, from);
  return ring.length ? pick(ring, rng) : null;
}

/** The place of `kind` nearest to `at` (the sparkles of the last rung lead there); null when the world has none. */
export function nearestOf(places: readonly EnPlace[], kind: EnPlaceKind, at: At): EnPlace | null {
  const mine = places.filter((p) => p.kind === kind);
  return mine.length ? mine.reduce((best, p) => (dist(p, at) < dist(best, at) ? p : best)) : null;
}

/**
 * The clips that say the command: Pip's whole phrase once it is recorded (`has`: the voice of English has that clip),
 * until then the frame "Find…" and the word apart, in the voice the book has (R32).
 */
export function enGoClips(place: Pick<EnPlace, 'kind' | 'word'>, has: (id: string) => boolean): string[] {
  const whole = `en_go_${place.kind}`;
  return has(whole) ? [whole] : ['wb_find', `wb_w_${place.word}`];
}

/** Where she is against the places, for a command of `kind`: at one of that kind, at one of another kind, or at none. */
export function placeAt(places: readonly EnPlace[], kind: EnPlaceKind, at: At): { right: EnPlace | null; wrong: EnPlace | null } {
  const near = places.filter((p) => dist(p, at) <= reachOf(p)).sort((a, b) => dist(a, at) - dist(b, at));
  return { right: near.find((p) => p.kind === kind) ?? null, wrong: near.find((p) => p.kind !== kind) ?? null };
}

/** What the walk has come to after a step of `walker`: nothing yet, the place named, or a wrong place stood at. */
export type WalkEvent = { is: 'none' } | { is: 'come'; place: EnPlace } | { is: 'wrong'; place: EnPlace };

/**
 * Follows her walk for a command of `kind`: fed where she is and the time (s) every frame, it tells when she has come
 * and when she has stopped at a wrong place. Coming is at once; a wrong place needs her to stand at it for EN_GO_DWELL
 * and is told once - again only after she has left it and stood at one again.
 */
export function walker(places: readonly EnPlace[], kind: EnPlaceKind) {
  let stood: { place: EnPlace; at: At; since: number } | null = null;
  let told: EnPlace | null = null;
  return {
    step(at: At, time: number): WalkEvent {
      const { right, wrong } = placeAt(places, kind, at);
      if (right) return { is: 'come', place: right };
      if (!wrong) { stood = null; told = null; return { is: 'none' }; }
      // she moved on, or it is another place: the standing starts anew
      if (!stood || stood.place !== wrong || dist(stood.at, at) > EN_GO_STILL) stood = { place: wrong, at: { x: at.x, z: at.z }, since: time };
      if (told === wrong || time - stood.since < EN_GO_DWELL) return { is: 'none' };
      told = wrong;
      return { is: 'wrong', place: wrong };
    },
  };
}

/**
 * What is wrong with a world's places for the commands given at `from` (Pip's place there), `busy` being the residents
 * and the things of the world with a tap of their own. Empty: nothing. Every place lies in the ring around `from`: a
 * nearer one of the kind named would end the walk before it is one, a farther one is no walk for a child. That every
 * place lies on ground she can walk to is the world's own test (its trees, its water), next to its list.
 */
export function enPlacesProblems(places: readonly EnPlace[], from: At, busy: readonly At[] = []): string[] {
  const out: string[] = [], name = (p: EnPlace) => `the ${p.kind} at (${p.x}, ${p.z})`;
  if (!places.length) out.push('no places for the commands of Pip');
  for (const kind of EN_PLACE_KINDS) {
    const words = [...new Set(places.filter((p) => p.kind === kind).map((p) => p.word))];
    if (words.length > 1) out.push(`the places of the kind ${kind} carry different words: ${words.join(', ')}`);
  }
  places.forEach((a, i) => {
    if (!(EN_PLACE_KINDS as readonly string[]).includes(a.kind)) out.push(`${name(a)} is of no kind a command names`);
    const d = dist(a, from);
    if (d < EN_GO_NEAR) out.push(`${name(a)} stands ${d.toFixed(1)} m from where the command is given (${from.x}, ${from.z}), nearer than ${EN_GO_NEAR} m`);
    if (d > EN_GO_FAR) out.push(`${name(a)} stands ${d.toFixed(1)} m from where the command is given (${from.x}, ${from.z}), farther than ${EN_GO_FAR} m`);
    const clear = reachOf(a) + EN_GO_CLEAR, at = busy.find((b) => dist(a, b) < clear);
    if (at) out.push(`${name(a)} stands nearer than ${clear} m to a resident or a thing of the world at (${at.x}, ${at.z})`);
    if (!(reachOf(a) > 0 && reachOf(a) <= EN_GO_REACH_MAX)) out.push(`${name(a)} is come to from ${reachOf(a)} m: not within 0-${EN_GO_REACH_MAX} m`);
    places.slice(i + 1).forEach((b) => {
      const apart = reachOf(a) + reachOf(b) + EN_GO_APART;
      if (a.kind !== b.kind && dist(a, b) < apart) out.push(`${name(a)} and ${name(b)} stand nearer than ${apart} m: at both at once`);
      if (a.kind === b.kind && dist(a, b) < 0.01) out.push(`${name(a)} is listed twice`);
    });
  });
  return out;
}
