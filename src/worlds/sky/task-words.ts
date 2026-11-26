import { inTask, speaking, willSay, type Priority } from '../../core/audio';
import type { Game } from '../../game/context';
import type { WorldScope } from '../../game/scope';
import type { TaskHooks } from '../../game/taskviews/panel';
import type { SpokenKey } from '../../ui/strings';

/**
 * The hooks of a task of the world with a character's words before its first question (Lazur's "the clouds become
 * steps", Mertsal's step of the clock): the task opens at once - the child and the walkthrough see it open - and its
 * question waits for the words. The words go with the task's priority: while a task is open only its own lines sound
 * (src/core/voice.ts mayStart), a `story` line would be turned away. A task closed before the words end asks nothing:
 * `open` says this very task is still open, and the voice must still be in a task - the end of a task stops the words
 * before the world hears of it, and a question asked then would sound over what follows the task.
 */
export function wordsFirst(g: Game, hooks: TaskHooks, key: SpokenKey, speaker: string, open: () => boolean): TaskHooks {
  let words: Promise<unknown> | null = null;
  return {
    ...hooks,
    prompt: (q, ask) => {
      if (words) { hooks.prompt(q, ask); return; }
      words = g.speech.line(key, 'task', 0, speaker);
      void words.then(() => { if (open() && inTask()) hooks.prompt(q, ask); });
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

/** s: how long the cat's word of the world waits for a quiet moment before it is let go (as the Sweet Land's finds). */
export const QUIET_WAIT = 20;

/**
 * The cat's word of the world (the magic of the rays, the gear that turns): after the line that sounds now and out of
 * an open task, not over them - a line said over a higher one, or in a task, is turned away (src/core/voice.ts
 * mayStart). It waits QUIET_WAIT s at most; the world left meanwhile says nothing. Resolves when it is said (or let go).
 */
export function tellWhenQuiet(g: Game, scope: WorldScope, key: SpokenKey, pri: Priority, hold = 0): Promise<void> {
  return new Promise<void>((done) => {
    let waited = 0;
    const tryNow = () => {
      if (!speaking() && willSay(pri) && !g.busy) { void g.speech.line(key, pri, hold).then(() => done()); return; }
      if ((waited += 0.25) < QUIET_WAIT) scope.timeout(tryNow, 250); else done();
    };
    tryNow();
  });
}
