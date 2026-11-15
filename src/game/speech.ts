import { say, speaking, volume, willSay, type Priority, type Spoken } from '../core/audio';
import { voiceText, type SpokenKey } from '../ui/strings';
import { bubble } from '../ui/ui';

export interface Line { key: SpokenKey; pri: Priority; hold: number; speaker: string; text?: string }

export interface Speech {
  /** The line of the bubble, also after its timer has hidden it: what a tap on the bubble or on the cat says once more. */
  readonly shown: Line | null;
  caption(l: Line | null): void;
  /** Subtitle + voice. A line the planner turns away (core/audio.ts) leaves the bubble as it is: no text without its voice. */
  line(key: SpokenKey, pri: Priority, hold?: number, speaker?: string, text?: string): Spoken;
  muted(): boolean;
  hintLine(key: SpokenKey): Spoken;
  /**
   * A tap on the bubble or on the cat (VOICE-08): the line is said again, with its own priority. Only while the voice
   * is silent - a repeat that cut "try again" off would bring the hint too early. Nothing is recorded.
   */
  repeat(): void;
}

/** The bubble and the spoken lines. A factory: nothing is created at import (see the WebGL2 check in main.ts). */
export function createSpeech(): Speech {
  let shown: Line | null = null;
  const caption = (l: Line | null) => { shown = l; if (l) bubble(l.key, l.hold, l.speaker, l.text); else bubble(null); };
  const line = (key: SpokenKey, pri: Priority, hold = 0, speaker = '🐱', text?: string) => {
    if (willSay(pri)) caption({ key, pri, hold, speaker, text });
    return say(key, voiceText(key), pri);
  };
  /**
   * With the voice turned off in the parents' section (VOICE-09) the bubble is the only way to learn the question, so
   * it keeps the question of the task until the answer: a hint is then "said" (in silence, for its usual time) without
   * its subtitle, and the bubble with the question is not hidden by a timer. A tap on the bubble repeats the question.
   */
  const muted = () => volume.voice === 0;
  const hintLine = (key: SpokenKey) => (muted() ? say(key, voiceText(key), 'task') : line(key, 'task'));
  const repeat = () => { if (shown && !speaking()) void line(shown.key, shown.pri, shown.hold, shown.speaker, shown.text); };
  // `shown` is read through a getter: a copy taken here would stay at null for good (__game.line reads it too).
  return { get shown() { return shown; }, caption, line, muted, hintLine, repeat };
}
