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

/** The kinds of WebGL objects three.js makes and deletes (`create<Kind>` / `delete<Kind>` of the context). */
const KINDS = ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Program', 'Shader', 'VertexArray', 'Query', 'Sampler', 'TransformFeedback'];

/**
 * After a context given back, a delete of what the lost one held is dropped. three.js (0.170) makes its tables anew on
 * `webglcontextrestored`, but the `dispose` listeners its old tables put on every geometry, texture and material stay:
 * the next `dispose()` (a task closed, a world left) makes the context delete buffers, textures and vertex arrays of the
 * lost one - "INVALID_OPERATION: delete: object does not belong to this context" (2026-11-22, the walkthrough on a GPU;
 * the software renderer of CI says nothing). Those objects went with the lost context; there is nothing to delete.
 * Each object is marked with the life of the context it was made in; `lost()` starts the next one.
 */
export function dropStaleDeletes(gl: object): { lost(): void } {
  const born = new WeakMap<object, number>();
  let life = 0;
  const api = gl as Record<string, unknown>;
  for (const kind of KINDS) {
    const make = api[`create${kind}`], drop = api[`delete${kind}`];
    if (typeof make !== 'function' || typeof drop !== 'function') continue;
    api[`create${kind}`] = (...args: unknown[]) => {
      const made = make.apply(gl, args) as object | null;
      if (made) born.set(made, life);
      return made;
    };
    // made before the guard: the context's first life
    api[`delete${kind}`] = (what: object | null, ...args: unknown[]) => {
      if (what && (born.get(what) ?? 0) !== life) return;
      return drop.call(gl, what, ...args);
    };
  }
  return { lost: () => { life++; } };
}
