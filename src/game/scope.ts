import type * as THREE from 'three';
import { disposeMaterial, disposeTree, type Seen } from '../core/dispose';
import { forgetPartMaterials, forgetRanged } from '../core/instancing';

/**
 * TECH-15: the scope of a world - the owner of what the world put into the scene and of what it subscribed to.
 * One call, `dispose()`, takes the world out: its objects leave the scene and their geometries, materials and
 * textures are freed, its handlers and timers are stopped, the scene gets back the background, the fog and the
 * environment it had. What the game shares between the worlds (the heroine, the cat, the sparks, the butterflies,
 * the guide, the tap ring) stays.
 *
 * Whose an object is. A world adds to the scene directly, as it always did (`scene.add`), and so do the parts of the
 * game - after the world's sky and load. So the scope does not record what the world adds: it knows what is NOT the
 * world's, and everything else at the top level of the scene is. Not the world's are the objects that were in the
 * scene when the scope was made, and the ones that joined it during a `shared()` call (src/main.ts wraps `createGame`
 * and `startLoop` in it). Two things follow:
 * - a part of the game that adds a top-level object later, outside `shared()`, loses it with the world (today only
 *   the world task "sort", src/game/worldtasks/sort.ts, which removes its group itself when the task ends);
 * - `startLoop` plays the first frame inside its `shared()` call: a world must not add to the scene in that frame.
 * Only the top level is looked at: what a world hangs under a shared object (the heroine's wings) stays with it.
 *
 * Handlers and timers of a world go through `on`, `timeout`, `interval` and `wait` instead of `addEventListener`,
 * `setTimeout` and `setInterval` (src/game/scope.test.ts reads the sources of every world for the bare calls).
 * A `wait` that is still pending when the scope is disposed never settles: the code of the world after its `await`
 * simply does not run. Whoever disposes the scope gives the controls back (`g.busy` and the like) - the scene the
 * world was in the middle of will not.
 *
 * The scope knows nothing of the game's state (`g`), the page, the sound or the save: a world hands it what else must
 * be undone through `own`.
 */
export interface WorldScope {
  /** True once `dispose()` ran. Nothing is started through a disposed scope. */
  readonly disposed: boolean;
  /**
   * Runs `make` at once and returns its result; the top-level objects that joined the scene meanwhile are the game's,
   * not the world's. The call must be synchronous (a promise is an error): while it runs, no load of a world can add
   * anything in between.
   */
  shared<T>(make: () => T): T;
  /** `target.addEventListener(type, fn, options)`, removed by `dispose()` or by the returned function. */
  on<E extends Event = Event>(target: Listenable, type: string, fn: (e: E) => void, options?: ListenOptions): Stop;
  /** `setTimeout(fn, ms)`, cancelled by `dispose()` or by the returned function. */
  timeout(fn: () => void, ms: number): Stop;
  /** `setInterval(fn, ms)`, stopped by `dispose()` or by the returned function. */
  interval(fn: () => void, ms: number): Stop;
  /** Settles after `ms`; never once the scope is disposed (before or during the wait). */
  wait(ms: number): Promise<void>;
  /**
   * Hands over what else the world must undo: a function, or an object with `dispose()`. It is called once, by
   * `dispose()`, the last one handed over first - or right away when the scope is disposed already. Returns `what`.
   */
  own<T extends Owned>(what: T): T;
  /** Takes the world out (see above). A second call does nothing. */
  dispose(): void;
}

export type Stop = () => void;
export type Owned = (() => void) | { dispose(): void };
export type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
export type ListenOptions = boolean | AddEventListenerOptions;

const NOTHING: Stop = () => {};
const isTexture = (v: unknown): v is THREE.Texture => !!v && (v as THREE.Texture).isTexture === true;
/** The materials an object draws with: its own (one or several) and the ones the shadow pass uses instead. */
function materialsOf(o: THREE.Object3D): THREE.Material[] {
  return [(o as THREE.Mesh).material, o.customDepthMaterial, o.customDistanceMaterial].flat().filter((m) => !!m);
}
/** What the renderer holds for one object: its geometry, its materials and their textures (uniforms included). */
function resourcesOf(o: THREE.Object3D): object[] {
  const out: object[] = [];
  const geo = (o as THREE.Mesh).geometry;
  if (geo) out.push(geo);
  for (const mat of materialsOf(o)) {
    const uniforms = Object.values((mat as THREE.ShaderMaterial).uniforms ?? {}).map((u) => u?.value as unknown);
    out.push(mat, ...[...Object.values(mat) as unknown[], ...uniforms].flat().filter(isTexture));
  }
  return out;
}
function within(scene: THREE.Scene, o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === scene) return true;
  return false;
}

/** Made before the world's sky (src/main.ts), so the sky, the lights and the fog are the world's too. */
export function createWorldScope(scene: THREE.Scene): WorldScope {
  /** Not the world's: what was in the scene before it, and what joined during `shared()`. */
  const kept = new Set<THREE.Object3D>(scene.children);
  const was = { background: scene.background, fog: scene.fog, environment: scene.environment };
  /** What stops each handler and timer that is still on. */
  const live = new Set<Stop>();
  const owned: Owned[] = [];
  let disposed = false;

  /** `stop` runs once: by the returned function or by `dispose()`, whichever comes first. */
  const track = (stop: Stop): Stop => {
    const off = () => { if (live.delete(off)) stop(); };
    live.add(off);
    return off;
  };
  const release = (what: Owned) => { if (typeof what === 'function') what(); else what.dispose(); };

  function timeout(fn: () => void, ms: number): Stop {
    if (disposed) return NOTHING;
    const off = track(() => clearTimeout(id));
    // A timer that fired leaves the list: a world played for an hour does not keep every one it ever started.
    const id = setTimeout(() => { live.delete(off); fn(); }, ms);
    return off;
  }

  function clearScene() {
    // What the game still shows is never freed, even where an object of the world shares it.
    const spared: Seen = new Set();
    for (const o of kept) o.traverse((x) => { for (const r of resourcesOf(x)) spared.add(r); });
    const seen: Seen = new Set(spared);
    for (const o of scene.children.filter((c) => !kept.has(c))) {
      scene.remove(o);
      disposeTree(o, seen);
      // What disposeTree leaves: the materials of the shadow pass and the shadow maps of the lights.
      o.traverse((x) => {
        for (const mat of [x.customDepthMaterial, x.customDistanceMaterial]) if (mat) disposeMaterial(mat, seen);
        if ((x as THREE.Light).isLight) (x as THREE.Light).dispose();
      });
    }
    for (const key of ['background', 'environment'] as const) {
      const v = scene[key];
      if (v !== was[key] && isTexture(v) && !seen.has(v)) { seen.add(v); v.dispose(); }
    }
    scene.background = was.background; scene.fog = was.fog; scene.environment = was.environment;
    forgetRanged((mesh) => !within(scene, mesh));
    forgetPartMaterials((mat) => seen.has(mat) && !spared.has(mat));
  }

  return {
    get disposed() { return disposed; },
    shared(make) {
      const had = new Set(scene.children);
      try {
        const out = make();
        if (typeof (out as { then?: unknown } | null | undefined)?.then === 'function') throw new Error('scope.shared() takes a synchronous call: what joins the scene after an await cannot be told from the world\'s');
        return out;
      } finally {
        for (const o of scene.children) if (!had.has(o)) kept.add(o);
      }
    },
    on(target, type, fn, options) {
      if (disposed) return NOTHING;
      const listener = fn as EventListener;
      target.addEventListener(type, listener, options);
      return track(() => target.removeEventListener(type, listener, options));
    },
    timeout,
    interval(fn, ms) {
      if (disposed) return NOTHING;
      const id = setInterval(fn, ms);
      return track(() => clearInterval(id));
    },
    wait: (ms) => new Promise<void>((done) => { timeout(done, ms); }),
    own(what) {
      if (disposed) release(what); else owned.push(what);
      return what;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of [...live]) off();
      // The last one handed over first. One that throws keeps neither the rest nor the scene from being cleared;
      // the first error is thrown on once everything is done.
      const failed: unknown[] = [];
      for (const what of owned.splice(0).reverse()) { try { release(what); } catch (e) { failed.push(e); } }
      clearScene();
      if (failed.length) throw failed[0];
    },
  };
}
