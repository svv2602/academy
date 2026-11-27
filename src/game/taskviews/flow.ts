/**
 * What follows a mistake (ARCH-09), for any show of a task - on the panel, later in the world. No page here: the show
 * says what each hint step does on screen, the flow decides when.
 *
 * The order is fixed: "try again" to its end (and at least the shake of the wrong answer), then the whole spoken hint,
 * then the hint's steps on screen. The child may answer at any moment of that; nothing waits for the cat to finish.
 */
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { rungOf, type Hint, type HintStep } from '../tasks/types';

/** The shake of a wrong answer must be seen before the hint, even when "try again" is silent and ends at once. */
export const SHAKE_MS = 900;

/** The hint of a shown task: the line the cat says after mistake `round`, and what is shown once that line has ended. */
export interface ShownHint { key(round: number): SpokenKey | null; show(round: number): void }

/** The two lines the flow asks for; each returns the end of its line (a line cut off by a newer one settles at once). */
export interface FlowVoice { wrong(): Spoken; hint(key: SpokenKey): Spoken }

/**
 * The task as the flow reads it while it goes on: the task may be solved or closed meanwhile (`alive`), a newer mistake
 * may start its own round (`wrongs`), the child may count by herself during the hint (`own`: the round of her count).
 */
export interface FlowTask { readonly alive: boolean; readonly wrongs: number; readonly own: number; readonly hint: ShownHint | null }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The course of mistake `round` (the value of `task.wrongs` it made). A cut-off line settles at once too, so each step
 * first checks that it is still wanted: the task is open and no newer mistake has started its own round.
 */
export async function afterMistake(task: FlowTask, round: number, voice: FlowVoice): Promise<void> {
  const wanted = () => task.alive && task.wrongs === round;
  await Promise.all([voice.wrong(), wait(SHAKE_MS)]);
  if (!wanted() || !task.hint) return;
  // a rung of no line (the English tasks, ../tasks/types.ts HintRung) goes on to its steps at once
  const key = task.hint.key(round);
  if (key) await voice.hint(key);
  // Her own tap on a thing says its number and so cuts the hint off. She is doing what the hint asked:
  // the cat must not start counting from one over her. The next mistake brings the cat's count back.
  if (wanted() && task.own !== round) task.hint.show(round);
}

/**
 * The hint of a described task: for mistake `round` the line of its rung, and the steps of that rung alone carried out
 * in their order once the line has ended (rung 1 has none: the way is said, nothing on screen gives the answer away).
 * `act` is what each step does in the show; "pulse the answer" is the same for every task: `pulse` lights the answer
 * (a task answered step by step has no single answer and no such step: `pulse` is null).
 */
export function hintOf(hint: Hint | null, pulse: (() => void) | null, act: Partial<Record<HintStep['do'], (step: HintStep) => void>>): ShownHint | null {
  if (!hint) return null;
  return { key: (round) => rungOf(hint, round).key, show: (round) => {
    for (const step of rungOf(hint, round).steps) {
      if (step.do === 'pulseAnswer') pulse?.(); else act[step.do]?.(step);
    }
  } };
}
