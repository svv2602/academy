/**
 * The WebGL context of the game is lost (the GPU reset, the system took it back from a page in the background): the
 * picture stops, three.js draws nothing until the browser gives the context back, and gives it back only to a page
 * that asked for it (`preventDefault` of the event). Decision of 2026-11-21:
 * - while it is lost the game stands as on a hidden page (`lost`): no game time, no sound;
 * - it comes back by itself (`back`): the game goes on where it stood;
 * - not back after `waitMs` (`gone`): the save is written, then the grown-ups are shown a message with "reload" -
 *   the child loses nothing. Should it come back even then, `back` follows as well.
 */
export const CONTEXT_WAIT_MS = 10000;

export interface ContextHooks {
  lost(): void;
  back(): void;
  gone(): void;
}

export interface ContextWatch {
  /** The picture is lost now. */
  readonly lost: boolean;
}

export function watchContext(canvas: EventTarget, hooks: ContextHooks, waitMs = CONTEXT_WAIT_MS): ContextWatch {
  let lost = false, timer: ReturnType<typeof setTimeout> | undefined;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (lost) return;
    lost = true;
    hooks.lost();
    timer = setTimeout(() => { if (lost) hooks.gone(); }, waitMs);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (!lost) return;
    lost = false;
    clearTimeout(timer);
    hooks.back();
  });
  return { get lost() { return lost; } };
}
