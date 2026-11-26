import type { Game } from '../../game/context';
import type { TaskHooks } from '../../game/taskviews/panel';
import type { SpokenKey } from '../../ui/strings';

/**
 * The hooks of a task of the world with a character's words before its first question (Lazur's "the clouds become
 * steps", Mertsal's step of the clock): the task opens at once - the child and the walkthrough see it open - and its
 * question waits for the words. The words go with the task's priority: while a task is open only its own lines sound
 * (src/core/voice.ts mayStart), a `story` line would be turned away. A task closed before the words end asks nothing.
 */
export function wordsFirst(g: Game, hooks: TaskHooks, key: SpokenKey, speaker: string, open: () => boolean): TaskHooks {
  let words: Promise<unknown> | null = null;
  return {
    ...hooks,
    prompt: (q, ask) => {
      if (words) { hooks.prompt(q, ask); return; }
      words = g.speech.line(key, 'task', 0, speaker);
      void words.then(() => { if (open()) hooks.prompt(q, ask); });
    },
  };
}

/**
 * A character's words after a task of the world, before what comes of it (Lazur's "the bridge is built", Veterok's
 * "the route is right"): the game holds the controls while they sound, as in a scene, so nothing starts over them.
 */
export async function wordsAfter(g: Game, key: SpokenKey, speaker: string): Promise<void> {
  g.busy = true;
  try { await g.speech.line(key, 'story', 0, speaker); } finally { g.busy = false; }
}
