/**
 * The cat's meeting on a new day (PLAY-21, R37, R40, R44; the rule of the gift is src/game/session.ts `dailyGift`).
 *
 * "Play" or "Continue" of a game played before (src/game/start.ts, `enterWorld`): on the first launch on a new date of
 * the device's clock the cat says hello - one of five, never the one it said at the last meeting - and gives one star of
 * the day (one of the two lines of the gift, the star through the game's own `addStars`, a caption "+1 ⭐" over the
 * counter). Short (about five seconds, R40): where the child stopped is not told here. On the same day it is the old
 * welcome back. Days skipped give one star, not more; nothing is ever taken (R51).
 *
 * "Where we stopped" (R40): a tap on the cat with no line in the bubble (src/game/player.ts) says one of five lines by
 * the state of the world played - read through `g` at the tap, never kept. With a line in the bubble the tap repeats
 * it, as it always did (VOICE-08).
 *
 * `giftState.held`: the walkthrough's own lever (window.__game.gift, ?debug only, src/game/debug.ts): while it is pulled
 * no gift is given and the meeting is the same-day welcome - the saves of its pieces do not depend on the real date
 * (R61). The game never pulls it.
 */
import { speaking } from '../core/audio';
import type { Game } from '../game/context';
import { dailyGift } from '../game/session';
import type { WorldState } from '../core/save';
import { pickOther } from './session';
import { t, type SpokenKey } from './strings';
import { el } from './ui';

/** The cat's hellos of a new day: it picks one, never the one of the last meeting (e4-texts.md §3). */
export const HELLOS = ['hello_1', 'hello_2', 'hello_3', 'hello_4', 'hello_5'] as const satisfies readonly SpokenKey[];
/** The lines of the star of the day. */
export const GIFTS = ['gift_star_1', 'gift_star_2'] as const satisfies readonly SpokenKey[];
/** "Where we stopped", by the state of the world (e4-texts.md §3). */
export type LeftKey = 'left_new_world' | 'left_mid_chain' | 'left_between' | 'left_before_final' | 'left_after_artifact';
/** How long a line of the meeting stays in the bubble, ms (each one waits for its voice anyway). */
const HOLD_MS = 4000;
/** How long "where we stopped" stays in the bubble, ms: long enough to read, and for a second tap to repeat it. */
const LEFT_HOLD_MS = 8000;
/** How long the caption of the gift stays, ms. */
const CAPTION_MS = 4000;
/** The hello said last, on this device (a hello of yesterday is not said again today). */
const LAST_KEY = 'amw-hello';

/** The walkthrough's lever (see the head of the file); false in the game. */
export const giftState = { held: false };

/** What the line "where we stopped" reads of the world played: its characters (their chains) and its progress. */
export interface LeftWorld { characters?: readonly { id: string; steps: readonly unknown[] }[] }

/**
 * The line "where we stopped" for the state of a world: the artifact restored; else every part with her; else a chain
 * begun and not finished; else a chain finished (and none begun); else nothing begun yet.
 */
export function leftKey(world: LeftWorld, ws: Pick<WorldState, 'quests' | 'final'>): LeftKey {
  if (ws.final) return 'left_after_artifact';
  const chars = world.characters ?? [];
  const steps = chars.map((c) => [ws.quests[c.id] ?? 0, c.steps.length] as const);
  const done = steps.filter(([n, len]) => n >= len).length;
  if (chars.length && done === chars.length) return 'left_before_final';
  if (steps.some(([n, len]) => n > 0 && n < len)) return 'left_mid_chain';
  if (done > 0) return 'left_between';
  return 'left_new_world';
}

const lastHello = (): SpokenKey | null => {
  try { const v = localStorage.getItem(LAST_KEY); return (HELLOS as readonly string[]).includes(v ?? '') ? v as SpokenKey : null; } catch { return null; }
};
const rememberHello = (k: SpokenKey) => { try { localStorage.setItem(LAST_KEY, k); } catch { /* ignore */ } };

/** The caption of the gift (not spoken). */
const giftCaption = (): string => t('gift_caption');

/** The caption "+1 ⭐" over the counter of the stars for a moment; made on first use. */
function showCaption() {
  let node = document.getElementById('giftCaption');
  if (!node) {
    node = document.createElement('div');
    node.id = 'giftCaption';
    node.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 64px);transform:translateX(-50%);'
      + 'z-index:30;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.92);color:#5a3a7a;'
      + 'font:700 20px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.18);pointer-events:none;white-space:nowrap';
    document.body.appendChild(node);
  }
  node.textContent = giftCaption();
  node.classList.remove('hidden');
  const shown = node, since = Date.now();
  // hidden once the line of the gift is over, and not before CAPTION_MS
  return () => { setTimeout(() => shown.classList.add('hidden'), Math.max(0, CAPTION_MS - (Date.now() - since))); };
}

/** What the meeting needs of the game. */
type Host = Pick<Game, 'save' | 'speech' | 'addStars' | 'above' | 'cat' | 'persist'>;

/**
 * The meeting after "Play" / "Continue" of a game played before: hello and the star of the day on the first launch on a
 * new date, else the old welcome back. Settles when the cat has said its lines.
 */
export async function meet(g: Host, now = Date.now()): Promise<void> {
  const gift = giftState.held ? 0 : dailyGift(g.save, now);
  if (!gift) { await g.speech.line('welcome_back', 'hint', 5000); return; }
  g.persist();   // the date of the gift is stored at once: a reload in the middle of the meeting gives no second star
  const hello = pickOther(HELLOS, lastHello());
  rememberHello(hello);
  await g.speech.line(hello, 'hint', HOLD_MS);
  g.addStars(1, g.above(g.cat.root.position, 0.8));   // the one star of the day (dailyGift gave 1)
  const hide = showCaption();
  await g.speech.line(pickOther(GIFTS, null), 'hint', HOLD_MS);
  hide();
}

/**
 * The very first launch (the opening scene, no meeting): the day is marked as given, with no star - else a second launch
 * the same day would bring a hello and a star as on a new day.
 */
export function firstDay(g: Pick<Game, 'save' | 'persist'>, now = Date.now()): void {
  if (giftState.held) return;
  if (dailyGift(g.save, now)) g.persist();
}

/** A tap on the cat (src/game/player.ts): the line of the bubble once more; with the bubble empty - where we stopped. */
export function catTap(g: Pick<Game, 'speech' | 'world' | 'ws' | 'save'>): void {
  if (!el.bubble.classList.contains('hidden')) { g.speech.repeat(); return; }
  if (speaking()) return;   // as a repeat: a line that sounds is not cut off
  void g.speech.line(g.world.left?.(g.ws, g.save) ?? leftKey(g.world, g.ws), 'hint', LEFT_HOLD_MS);
}
