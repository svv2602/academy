/**
 * The trades of the characters (PLAY-28, the customer's word of 2026-11-21): a character whose chain is finished asks,
 * once a day, for some finds of the stash (src/game/stash.ts) and gives for them what the shop has not - a thing for
 * her or her pet, kept for ever, or 5 stars for finds of its own world, 15 for a "far" ask, finds of another open
 * world with a line of its story. A trade is never needed to finish a world, never happens by chance (what goes and
 * what comes is shown before the tap) and never when the finds are short: then nothing is spent. "Not now" costs
 * nothing - the same ask waits till the day is over. An ask of a world not open in the save is never chosen, so a
 * child never sees one she cannot make.
 *
 * What was traded today is the world's `ws.trade` (an optional field, no new version): the day and who traded.
 */
import type { Save, WorldState } from '../core/save';
import { openWorlds } from './cauldron';
import { COLLECT_KINDS, type CollectKind } from './collections';
import { canSpend, inStash, spend, type Need } from './stash';
import { has, petItem, petOpen } from './shop';

/**
 * The walkthrough's lever (?debug, src/game/debug.ts `__game.trade`): held, no character offers a trade - its talk goes as
 * it always did, straight to its game - so the blocks that replay a finished chain meet no choice; the block "trade"
 * lets it go. Never held in the game itself.
 */
export const tradeHold = { held: false };

/** The asks of the world played, for the walkthrough (?debug): set by its conversations (src/game/dialogue.ts), null - none. */
export const tradeHooks: { offer: ((who: string, day: string) => Offer | null) | null } = { offer: null };

/** Stars of a trade: an ask of its own world's finds, a far one (literals at `addStars`, as no-penalties.test reads them). */
export const TRADE_STARS = { own: 5, far: 15 } as const;

/** What an ask gives: a thing (of the heroine or of a pet, `reward: 'trade'` in the shop), or 'stars' (TRADE_STARS). */
export type TradeGift = { readonly item: string } | 'stars';

/** An ask: what it takes, what it gives; `far` - finds of another world (more stars, a line of its own). */
export interface Offer {
  readonly id: string;
  readonly need: Readonly<Partial<Record<CollectKind, number>>>;
  readonly gives: TradeGift;
  readonly far?: true;
}

/** A world's asks, by the id of the character that makes them. */
export type Trades = Readonly<Record<string, readonly Offer[]>>;

/** The kinds an ask takes, in its order. */
export const kindsOfOffer = (o: Offer) => Object.keys(o.need) as CollectKind[];

/** Whether the thing an ask gives cannot be given: hers already (the shop's `has`, a pet's thing owned), or of a pet not found yet. */
function given(s: Save, o: Offer): boolean {
  if (o.gives === 'stars') return false;
  const id = o.gives.item, pet = petItem(id);
  return pet ? s.owned.includes(id) || !petOpen(s, pet.pet) : has(s, id);
}

/**
 * The asks a character may make in this save: every kind of each from an open world, and the thing it gives not hers
 * yet (a thing is given once; after that its ask is never made again) and not of a pet she has not found.
 */
export function shownOffers(s: Save, offers: readonly Offer[]): Offer[] {
  const open = openWorlds(s);
  return offers.filter((o) => kindsOfOffer(o).every((k) => open.has(COLLECT_KINDS[k].world)) && !given(s, o));
}

/** Whether `who` traded today in this world. */
export const tradedToday = (ws: Pick<WorldState, 'trade'>, who: string, day: string) => ws.trade?.day === day && Array.isArray(ws.trade.done) && ws.trade.done.includes(who);

/** A small number of a string: the same for the same day and character. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The ask of `who` today, or null: it traded today already, or it has nothing it may ask. The same all day (a child
 * who said "not now" finds it waiting); asking changes nothing.
 */
export function todayOffer(s: Save, ws: Pick<WorldState, 'trade'>, who: string, offers: readonly Offer[], day: string): Offer | null {
  if (tradedToday(ws, who, day)) return null;
  const list = shownOffers(s, offers);
  return list.length ? list[hash(`${day}|${who}`) % list.length] : null;
}

/** For the picture of an ask: of each kind, how many she has, how many it takes, how many will be left (none when short). */
export function tradeSums(s: Pick<Save, 'stash'>, o: Offer): { kind: CollectKind; have: number; need: number; left: number | null }[] {
  return kindsOfOffer(o).map((kind) => {
    const have = inStash(s, kind), need = o.need[kind] ?? 0;
    return { kind, have, need, left: have >= need ? have - need : null };
  });
}

/** Whether the trade can be made now: not traded today, and the stash holds what it takes. */
export const canTrade = (s: Save, ws: Pick<WorldState, 'trade'>, who: string, o: Offer, day: string) =>
  !tradedToday(ws, who, day) && canSpend(s, o.need as Need);

/**
 * The trade, on the child's tap: the finds taken from the stash, the thing given (kept for ever in `owned`), the day
 * marked. Returns what it gave - the caller adds the stars of a 'stars' gift (TRADE_STARS, by `far`) - or null, and
 * nothing done, when it cannot be made. The caller stores the save.
 */
export function trade(s: Save, ws: WorldState, who: string, o: Offer, day: string): TradeGift | null {
  if (!canTrade(s, ws, who, o, day) || !spend(s, o.need as Need)) return null;
  if (o.gives !== 'stars' && !s.owned.includes(o.gives.item)) s.owned.push(o.gives.item);
  ws.trade = ws.trade?.day === day && Array.isArray(ws.trade.done) ? { day, done: [...ws.trade.done, who] } : { day, done: [who] };
  return o.gives;
}

/** What is wrong with a world's asks: a kind not in COLLECT_KINDS, a number out of 1-5, 2-5 finds an own ask, 1-2 a far one. */
export function tradeProblems(trades: Trades, world: string): string[] {
  const out: string[] = [];
  for (const [who, offers] of Object.entries(trades)) {
    for (const o of offers) {
      const kinds = kindsOfOffer(o), n = kinds.reduce((a, k) => a + (o.need[k] ?? 0), 0);
      for (const k of kinds) if (!(k in COLLECT_KINDS)) out.push(`${who}/${o.id}: the kind "${k}" is unknown`);
      const far = kinds.some((k) => COLLECT_KINDS[k]?.world !== world);
      if (far !== !!o.far) out.push(`${who}/${o.id}: ${far ? 'finds of another world, not marked far' : 'marked far, but its finds are of its own world'}`);
      if (o.far ? n < 1 || n > 2 : n < 2 || n > 5) out.push(`${who}/${o.id}: ${n} finds (${o.far ? '1-2 far' : '2-5 own'})`);
    }
  }
  return out;
}
