/**
 * The screen of the cat's offer of a break (PLAY-20, R31-R36; its rule is src/game/session.ts). At a stop point after a
 * task or a part, once `breakState.offer` is set, the card comes: the cat's line and two big buttons, "Till tomorrow" and
 * "Play on". One tap of either ends it (R32): nothing is lost, no timer, nothing locks.
 *
 * "Play on": the cat answers with no reproach and the game goes on at once.
 * "Till tomorrow" (R36): the save is written at once, the start screen shows the cat asleep and "Continue"; the stop point
 * is held until that one tap, so that what comes after it (the next task of a chain, an achievement's scene) comes once
 * the child is back, never under the sleeping cat. While the start screen is up the game does not count the minutes and
 * the heroine does not move (`g.started()`, src/game/loop.ts); a rest of half an hour starts a new session (R56).
 *
 * The ten lines are spoken in the cat's voice (batch 2 of stage 4): the offer and the goodbye with their text on the card
 * and under the sleeping cat (no bubble over them), the answer to "play on" in the bubble.
 *
 * Joined to the stop points at import (src/game/start.ts imports it): after src/game/stops.ts's own `breakStop`, which
 * sets the offer, and before the achievements' scene, which is subscribed when a world binds its conversation.
 */
import { say, stopVoice, unlockAudio } from '../core/audio';
import type { Game } from '../game/context';
import { accept, breakState, decline } from '../game/session';
import { onStop, type StopHost, type StopWhere } from '../game/stops';
import { t, voiceText, type SpokenKey } from './strings';
import { bubble } from './ui';

/** The cat's offers: it picks one, never the one it said last (e4-texts.md §2). */
export const OFFERS = ['break_1', 'break_2', 'break_3', 'break_4', 'break_5'] as const satisfies readonly SpokenKey[];
/** The cat's answer to "play on", with no reproach. */
export const PLAY_ON = ['break_more_1', 'break_more_2', 'break_more_3'] as const satisfies readonly SpokenKey[];
/** The cat's goodbye under the sleeping cat. */
export const GOODBYE = ['break_bye_1', 'break_bye_2'] as const satisfies readonly SpokenKey[];
/** How long the answer to "play on" stays in the bubble, ms. */
const ANSWER_MS = 4000;

/** A line of `list` other than `prev` (any of them when `prev` is not in it). */
export function pickOther<K extends string>(list: readonly K[], prev: K | null, rnd: () => number = Math.random): K {
  const pool = list.length > 1 ? list.filter((k) => k !== prev) : list;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}

/** What the card needs of the game: the bound host of the stop points is the whole Game (src/ui/achieve.ts binds it). */
type Host = StopHost & Pick<Game, 'speech'>;

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const hide = (node: HTMLElement, v: boolean) => node.classList.toggle('hidden', v);

/** The offer said last in this page (a reload may repeat it: the rule is only "not twice in a row"). */
let lastOffer: SpokenKey | null = null;

/**
 * The walkthrough's lever of the break (window.__game.brk, ?debug only, src/game/debug.ts): while it is pulled no card
 * comes - the minutes of a session are the real time of its frames, and a slow machine would meet the offer at a point
 * of its own in the middle of another block. Only the block "break" lets it go.
 */
export const breakHold = { held: false };

/** One tap of one of `ids`: resolves with its id; the other handlers are taken off. */
function oneTap(ids: readonly string[]): Promise<string> {
  return new Promise((res) => {
    const done = (id: string) => () => { for (const x of ids) $(x).onclick = null; res(id); };
    for (const id of ids) $(id).onclick = done(id);
  });
}

/** The card at a stop point when an offer waits; otherwise nothing. */
export async function breakCard(g: Host, _where: StopWhere): Promise<void> {
  if (breakState.offer === null || breakHold.held) return;
  const key = pickOther(OFFERS, lastOffer); lastOffer = key;
  const card = $('breakCard');
  $('breakSay').textContent = t(key);
  $('breakYes').textContent = t('break_yes'); $('breakNo').textContent = t('break_no');
  g.speech.caption(null);
  hide(card, false);
  void say(key, voiceText(key), 'story');
  const choice = await oneTap(['breakYes', 'breakNo']);
  hide(card, true);
  stopVoice();   // the offer is answered: its clip stops, the cat's answer is not turned away behind it
  if (choice === 'breakNo') {
    decline(g);
    void g.speech.line(pickOther(PLAY_ON, null), 'hint', ANSWER_MS);
    return;
  }
  accept(g);   // the save is written now (R36)
  await asleep();
}

/** The start screen with the cat asleep, until "Continue" (one tap) brings the game back as it was. */
async function asleep(): Promise<void> {
  const start = $('start'), sleep = $('sleep');
  // What the start screen and the game show now, given back as it was after "Continue".
  const was = ['setup', 'loading', 'notice', 'hud', 'btnJump', 'btnAct'].map((id) => [$(id), $(id).classList.contains('hidden')] as const);
  for (const [node] of was) hide(node, true);
  bubble(null);
  const bye = pickOther(GOODBYE, null);
  const render = () => { $('sleepSay').textContent = t(bye); $('wake').textContent = t('cont'); };
  render();
  // The language buttons stay on the start screen: the cat's goodbye follows them.
  const langs = [...document.querySelectorAll<HTMLElement>('#langs button')];
  for (const b of langs) b.addEventListener('click', render);
  hide(sleep, false); hide(start, false);
  void say(bye, voiceText(bye), 'story');
  await oneTap(['wake']);
  for (const b of langs) b.removeEventListener('click', render);
  unlockAudio();   // as "Play" does: the tap may be the first of a page whose sound the browser held
  hide(sleep, true); hide(start, true);
  for (const [node, hidden] of was) hide(node, hidden);
}

onStop((g, where) => breakCard(g as Host, where));
