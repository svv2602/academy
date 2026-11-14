/**
 * A scene (a conversation, a task, the finale) takes the controls from the child for a while.
 * Whatever happens inside, they come back: a scene that failed is reported and ended, never left holding the heroine.
 * No Three.js and no DOM here: the game hands in what "take" and "release" mean.
 */
export interface Stage {
  /** True while a scene holds the controls. */
  busy(): boolean;
  /** Takes the controls from the child. */
  take(): void;
  /** Gives the controls back and clears what a scene may have left behind; runs after every scene, failed or not. */
  release(): void;
}

/** How a scene ended: played to the end, broke on the way, or was not started because another one is running. */
export type SceneEnd = 'done' | 'failed' | 'refused';

/** First words of the console error about a failed scene; the error itself follows as the second argument. */
export const sceneFailed = (name: string) => `scene "${name}" failed:`;

/**
 * Plays one scene. A second scene is refused while one is running, with no side effects.
 * An exception or a rejection inside `body` is not swallowed: it goes to `console.error`, and the scene ends.
 */
export async function playScene(stage: Stage, name: string, body: () => void | Promise<void>): Promise<SceneEnd> {
  if (stage.busy()) return 'refused';
  try {
    stage.take();
    await body();
    return 'done';
  } catch (e) {
    console.error(sceneFailed(name), e);
    return 'failed';
  } finally {
    stage.release();
  }
}
