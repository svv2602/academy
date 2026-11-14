/**
 * The graphics quality the game starts with (TECH-04). 2: bloom + shadows, 1: shadows, 0: plain.
 * Free of the DOM and the renderer: main.ts hands in what the save and the address hold.
 */
export type Tier = 0 | 1 | 2;
/** Every tenth launch tries one tier above the remembered one: the phone may have been busy that day. */
export const RETRY_EVERY = 10;

export const isTier = (v: unknown): v is Tier => v === 0 || v === 1 || v === 2;

export interface StartTier {
  tier: Tier;
  /** The launch counter including this launch. */
  launches: number;
  /** Where the tier came from. Only a remembered one ('saved') may be lowered by the game when frames are slow. */
  by: 'param' | 'pin' | 'saved';
}

/**
 * `param` is the `?q=` of the address (null without it), `pinned` the tier the parent fixed (null = auto), `saved` the
 * tier the last session ended on, `launches` the launches counted before this one. `?q=` wins over everything (a value
 * other than 0, 1, 2 counts as no parameter), then the parent's choice, then the remembered tier; every tenth launch
 * the remembered tier is tried one higher, never above 2.
 */
export function startTier(o: { param: string | null; pinned: unknown; saved: unknown; launches: unknown }): StartTier {
  const before = typeof o.launches === 'number' && Number.isInteger(o.launches) && o.launches >= 0 ? o.launches : 0;
  const launches = before + 1;
  const q = o.param === null || o.param.trim() === '' ? NaN : Number(o.param);
  if (isTier(q)) return { tier: q, launches, by: 'param' };
  if (isTier(o.pinned)) return { tier: o.pinned, launches, by: 'pin' };
  const saved: Tier = isTier(o.saved) ? o.saved : 2;
  const tier = (launches % RETRY_EVERY === 0 ? Math.min(2, saved + 1) : saved) as Tier;
  return { tier, launches, by: 'saved' };
}
