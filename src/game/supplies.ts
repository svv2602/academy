/**
 * The potions and the compass (decision of 2026-11-19): what drinking one does to the save, without a picture. She buys
 * them in the shop (src/game/shop.ts `buy`, `SUPPLIES`), each purchase one more in her stock (`save.supplies`); a tap
 * on its button drinks one (src/ui/supplies.ts) and its effect acts for a minute of play (`save.effects`, seconds
 * left). What an effect shows - the trail, the glow, her size, the arrow - is src/game/supplyfx.ts.
 *
 * - speed: she runs half again as fast, over the parent's choice of speed (src/core/tuning.ts `applyEffects`);
 * - jump: she jumps twice as high (the speed upwards times the root of two);
 * - glow: she glows, and the mysterious stars and the finds near her twinkle;
 * - funny: she is tiny or a giant, by chance (the camera and her radius follow her size);
 * - compass: an arrow at her feet points to the nearest mysterious star not solved yet.
 *
 * The rules: a minute each (EFFECT_SECONDS); the same potion again adds a minute, no more than EFFECT_MAX in all; the
 * different ones act together, but tiny and giant are one potion - drunk again it keeps the size she has. The time runs
 * only while she can walk (src/game/loop.ts: no task, no break, no card, no scene, no change of world). A potion that
 * could do nothing now is not spent: the jump in the water, the compass in a world without mysterious stars or with all
 * of them solved. Nothing here gives an answer or skips a task.
 */
import type { Save } from '../core/save';
import type { TuningKey } from '../core/tuning';
import { stock, type SupplyId } from './shop';

/** Seconds of play a potion acts. */
export const EFFECT_SECONDS = 60;
/** No more seconds of one effect than this, however many are drunk. */
export const EFFECT_MAX = 180;
/** What acts: the potions' effects (funny is tiny or giant), in the order of their buttons. */
export const EFFECT_IDS = ['speed', 'jump', 'glow', 'tiny', 'giant', 'compass'] as const;
export type EffectId = (typeof EFFECT_IDS)[number];
/** Her size while tiny or a giant. */
export const SCALE = { tiny: 0.5, giant: 1.6 } as const;
/**
 * The factors of the tuning each effect brings (src/core/tuning.ts `applyEffects`): the speed and the speed she runs
 * from; the jump (twice as high: the speed upwards times the root of two); the camera's distance with her size.
 */
export const EFFECT_TUNING: Partial<Record<EffectId, Partial<Record<TuningKey, number>>>> = {
  speed: { speed: 1.5, runFrom: 1.5 },
  jump: { jump: Math.SQRT2 },
  tiny: { camDist: 0.6 },
  giant: { camDist: 1.5 },
};

/** Why a potion is not drunk: none left; the jump in the water; no mysterious stars in this world; all of them solved; its time is full. */
export type Refusal = 'none' | 'water' | 'no-stars' | 'all-found' | 'full';

/** Where she is when she drinks. */
export interface DrinkPlace {
  /** She swims (a water world, WorldDef.move): there is no jump. */
  water: boolean;
  /** The mysterious stars not solved yet in the world played; null - the world has none (src/game/mystery.ts). */
  mysteries: number | null;
  /** 0..1: tiny below one half, a giant above. */
  random(): number;
}

/** The seconds left of an effect (none: 0). */
export function left(s: Save, e: EffectId): number {
  const n = s.effects?.[e];
  return typeof n === 'number' && n > 0 ? n : 0;
}

/** The effects acting now, in the order of EFFECT_IDS. */
export function acting(s: Save): EffectId[] {
  return EFFECT_IDS.filter((e) => left(s, e) > 0);
}

/** The effect a supply gives; funny: the size she has now, else one by chance. */
function effectOf(s: Save, id: SupplyId, random: () => number): EffectId {
  if (id !== 'funny') return id;
  if (left(s, 'tiny') > 0) return 'tiny';
  if (left(s, 'giant') > 0) return 'giant';
  return random() < 0.5 ? 'tiny' : 'giant';
}

/** Why `id` would not be drunk now, or null when it would. */
export function refusal(s: Save, id: SupplyId, at: Omit<DrinkPlace, 'random'>): Refusal | null {
  if (stock(s, id) === 0) return 'none';
  if (id === 'jump' && at.water) return 'water';
  if (id === 'compass' && at.mysteries === null) return 'no-stars';
  if (id === 'compass' && at.mysteries === 0) return 'all-found';
  const full = id === 'funny' ? Math.max(left(s, 'tiny'), left(s, 'giant')) : left(s, id);
  return full >= EFFECT_MAX ? 'full' : null;
}

/**
 * Drinks one `id`: one less in her stock, a minute more of its effect (no more than EFFECT_MAX). Refused - the save as
 * it was - when `refusal` says why. The caller stores the save and applies the tuning.
 */
export function drink(s: Save, id: SupplyId, at: DrinkPlace): { effect: EffectId } | { refused: Refusal } {
  const why = refusal(s, id, at);
  if (why) return { refused: why };
  const effect = effectOf(s, id, at.random);
  const n = stock(s, id) - 1;
  const supplies = { ...s.supplies };
  if (n > 0) supplies[id] = n; else delete supplies[id];
  s.supplies = supplies;
  s.effects = { ...s.effects, [effect]: Math.min(EFFECT_MAX, left(s, effect) + EFFECT_SECONDS) };
  return { effect };
}

/** `dt` seconds of play pass: every effect loses them; returns the ones that ended now. */
export function tick(s: Save, dt: number): EffectId[] {
  if (!(dt > 0) || !s.effects) return [];
  const ended: EffectId[] = [];
  const next: Record<string, number> = {};
  for (const [e, n] of Object.entries(s.effects)) {
    const rest = n - dt;
    if (rest > 0) next[e] = rest;
    else if ((EFFECT_IDS as readonly string[]).includes(e)) ended.push(e as EffectId);
  }
  s.effects = next;
  return ended;
}

/**
 * The factors of the tuning of the effects acting, multiplied (src/core/tuning.ts `applyEffects`). A giant in a cramped
 * place has her own size (`sizeOf`), so her camera too.
 */
export function tuningOf(effects: readonly EffectId[], cramped = false): Partial<Record<TuningKey, number>> {
  const out: Partial<Record<TuningKey, number>> = {};
  for (const e of effects) {
    if (e === 'giant' && cramped) continue;
    for (const [k, f] of Object.entries(EFFECT_TUNING[e] ?? {}) as [TuningKey, number][]) out[k] = (out[k] ?? 1) * f;
  }
  return out;
}

/** Her size for the effects acting: tiny, a giant (a giant in a cramped place keeps her own size), else 1. */
export function sizeOf(effects: readonly EffectId[], cramped: boolean): number {
  if (effects.includes('tiny')) return SCALE.tiny;
  if (effects.includes('giant') && !cramped) return SCALE.giant;
  return 1;
}

/**
 * The mysterious stars left for the compass (`DrinkPlace.mysteries`) from what the game shows of them (PLAY-24,
 * `g.mystery`): null when there are none today at all (no `g.mystery` yet, a world without places, the stars held);
 * else how many are not solved (0: all found).
 */
export function mysteriesLeft(m: { readonly today?: readonly unknown[]; unsolved(): readonly unknown[] } | null): number | null {
  return m && (m.today?.length ?? 0) > 0 ? m.unsolved().length : null;
}
