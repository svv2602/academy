import { say, speaking, volume, willSay, type Priority, type Spoken } from '../core/audio';
import { sayBank, type BankKey } from '../core/voice';
import { lang, voiceText, type SpokenKey } from '../ui/strings';
import { bank } from '../ui/strings-bank';
import { bubble } from '../ui/ui';
import { enVoice } from '../s2/types';
import type { ScreenAsk } from './tasks/types';

/**
 * What the bubble says. A question asked by its clip of the bank (R37) has the key of the bank and, as `general`, the
 * general question it falls back to; its subtitle is the bank's text in the language of the game.
 */
export type Line = ({ key: SpokenKey; general?: undefined } | { key: BankKey; general: SpokenKey })
  & { pri: Priority; hold: number; speaker: string; text?: string };

export interface Speech {
  /** The line of the bubble, also after its timer has hidden it: what a tap on the bubble or on the cat says once more. */
  readonly shown: Line | null;
  caption(l: Line | null): void;
  /** Subtitle + voice. A line the planner turns away (core/audio.ts) leaves the bubble as it is: no text without its voice. */
  line(key: SpokenKey, pri: Priority, hold?: number, speaker?: string, text?: string): Spoken;
  /**
   * The question of the very example (`q_add_8_5`) with its clip of the bank; without the clip (not kept yet and no
   * network) the recorded general question `general` with its own subtitle - never the synthesizer (R37).
   */
  ask(key: BankKey, general: SpokenKey, pri: Priority, speaker?: string): Spoken;
  muted(): boolean;
  hintLine(key: SpokenKey): Spoken;
  /**
   * The question of a task asked in English (./tasks/types.ts `ScreenAsk`): its text in the bubble, its English clips
   * said by the voice of English; the cat's voice and the synthesizer never get its text (it has no clip). A tap on the
   * bubble then says nothing again: the show has its own button for that.
   */
  screen(ask: ScreenAsk, speaker?: string): Promise<void>;
  /**
   * A tap on the bubble or on the cat (VOICE-08): the line is said again, with its own priority. Only while the voice
   * is silent - a repeat that cut "try again" off would bring the hint too early. Nothing is recorded.
   */
  repeat(): void;
}

/** The bubble and the spoken lines. A factory: nothing is created at import (see the WebGL2 check in main.ts). */
export function createSpeech(): Speech {
  let shown: Line | null = null;
  const caption = (l: Line | null) => {
    shown = l;
    if (!l) bubble(null);
    else if (l.general === undefined) bubble(l.key, l.hold, l.speaker, l.text);
    else bubble(l.general, l.hold, l.speaker, l.text);
  };
  const line = (key: SpokenKey, pri: Priority, hold = 0, speaker = '🐱', text?: string) => {
    if (willSay(pri)) caption({ key, pri, hold, speaker, text });
    return say(key, voiceText(key), pri, speaker);
  };
  /**
   * With the voice turned off in the parents' section (VOICE-09) the bubble is the only way to learn the question, so
   * it keeps the question of the task until the answer: a hint is then "said" (in silence, for its usual time) without
   * its subtitle, and the bubble with the question is not hidden by a timer. A tap on the bubble repeats the question.
   */
  const ask = (key: BankKey, general: SpokenKey, pri: Priority, speaker = '🐱') =>
    sayBank(key, general, voiceText(general), pri, (fromBank) => {
      caption(fromBank ? { key, general, pri, hold: 0, speaker, text: bank.table[lang][key] } : { key: general, pri, hold: 0, speaker });
    });
  const muted = () => volume.voice === 0;
  const hintLine = (key: SpokenKey) => (muted() ? say(key, voiceText(key), 'task') : line(key, 'task'));
  const screen = (ask: ScreenAsk, speaker = '📖') => {
    shown = null;
    bubble(ask.key, 0, speaker);
    return enVoice().say(ask.en);
  };
  const repeat = () => {
    if (!shown || speaking()) return;
    if (shown.general === undefined) void line(shown.key, shown.pri, shown.hold, shown.speaker, shown.text);
    else void ask(shown.key, shown.general, shown.pri, shown.speaker);
  };
  // `shown` is read through a getter: a copy taken here would stay at null for good (__game.line reads it too).
  return { get shown() { return shown; }, caption, line, ask, muted, hintLine, screen, repeat };
}
