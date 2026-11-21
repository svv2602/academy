/**
 * The stash («торбинка», PLAY-26): what she may spend of the finds she took - in the cauldron (PLAY-26), on the pet's
 * treats (PLAY-27), in a trade (PLAY-28). It is apart from what the book counts: a find taken writes its number into
 * the world's `ws.found` (the book, the sets, their stars, «Збирачка», PLAY-25), which never goes down, and adds one
 * to the stash; spending takes from the stash alone. The stash is the save's shared part (`save.stash`, by kind of
 * find, an optional field, no new version); a save from before it starts with an empty one - nothing is counted back
 * from `ws.found`, so that nothing already spent comes back as new (P2, 2026-11-21).
 */
import type { Save } from '../core/save';

/** The most of one kind the stash holds. */
export const STASH_MAX = 99;
/** What a spending asks: how many of each kind. */
export type Need = Readonly<Record<string, number>>;

/** How many of `kind` she has (0 for none, without creating the field). */
export const inStash = (s: Pick<Save, 'stash'>, kind: string): number => s.stash?.[kind] ?? 0;

/** One more (or `n` more) of `kind` in the stash, up to STASH_MAX. */
export function addToStash(s: Pick<Save, 'stash'>, kind: string, n = 1): void {
  if (!(n > 0)) return;
  const st = (s.stash ??= {});
  st[kind] = Math.min(STASH_MAX, inStash(s, kind) + Math.floor(n));
}

/** Whether the stash holds everything `need` asks. */
export const canSpend = (s: Pick<Save, 'stash'>, need: Need): boolean => Object.entries(need).every(([k, n]) => inStash(s, k) >= n);

/** Takes `need` from the stash, all of it or nothing: false (and nothing taken) when something is short. */
export function spend(s: Pick<Save, 'stash'>, need: Need): boolean {
  if (!canSpend(s, need)) return false;
  for (const [k, n] of Object.entries(need)) {
    if (!(n > 0)) continue;
    const left = inStash(s, k) - n;
    if (left > 0) s.stash![k] = left; else delete s.stash![k];
  }
  return true;
}
