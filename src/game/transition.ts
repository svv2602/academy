import * as THREE from 'three';
import { uTime } from '../core/materials';

/**
 * How long the frame closes and opens, in seconds of game time (a frame counts at most 0.05 s, so on a slow machine
 * the transition takes longer by the clock, never fewer frames). Neither is shorter than 0.4 s: the game is for a
 * child of 6-7, nothing on the screen may flash.
 */
export const CLOSE_TIME = 0.6, OPEN_TIME = 0.7;
/** The loading ring shows only when the world is still not ready this long after the frame has closed; it fades in and out this long. */
export const LOADER_DELAY = 0.3, LOADER_FADE = 0.3;
/** The ring runs after the real progress of the loading: a whole turn takes at least this long, so it never jumps. */
export const PROGRESS_TIME = 0.4;

export type Phase = 'idle' | 'closing' | 'hold' | 'opening';

/** The state of the transition; `stepTimeline` makes the next one, nothing else changes it. */
export interface Timeline {
  readonly phase: Phase;
  /** How far the frame is closed, linear in time: 0 - open, 1 - closed. */
  readonly k: number;
  /** Seconds of game time the frame has stayed closed. */
  readonly held: number;
  /** How visible the loading ring is, 0…1. */
  readonly loader: number;
  /** The progress the ring shows, 0…1. */
  readonly shown: number;
}

/** What the shader draws. */
export interface TransitionView { cover: number; loader: number; progress: number }

export const IDLE: Timeline = Object.freeze({ phase: 'idle', k: 0, held: 0, loader: 0, shown: 0 });

const clamp01 = (x: number) => Math.min(1, Math.max(0, x)) || 0;   // NaN counts as 0
const approach = (from: number, to: number, by: number) => (from < to ? Math.min(to, from + by) : Math.max(to, from - by));

/**
 * The timeline, a pure function: closing -> hold (while the world is not ready) -> opening -> idle.
 * - The closing never ends early: a world ready before the frame has closed waits for it.
 * - The opening never starts until `ready`, however long it takes; a visible ring first fades out.
 * - One call changes the phase once at most, so every transition has a state (and a drawn frame) fully closed.
 */
export function stepTimeline(s: Timeline, dt: number, ready: boolean, progress: number): Timeline {
  const d = Math.max(dt, 0) || 0;
  switch (s.phase) {
    case 'idle': return s;
    case 'closing': {
      const k = Math.min(1, s.k + d / CLOSE_TIME);
      return k < 1 ? { ...s, k } : { ...s, phase: 'hold', k: 1, held: 0 };
    }
    case 'hold': {
      const held = s.held + d;
      const loader = approach(s.loader, !ready && held > LOADER_DELAY ? 1 : 0, d / LOADER_FADE);
      const shown = approach(s.shown, ready ? 1 : clamp01(progress), d / PROGRESS_TIME);
      return { phase: ready && loader === 0 ? 'opening' : 'hold', k: 1, held, loader, shown };
    }
    case 'opening': {
      const k = Math.max(0, s.k - d / OPEN_TIME);
      return k > 0 ? { ...s, k } : IDLE;
    }
  }
}

/** The values of the shader for a state: the cover eases in and out (smoothstep), the same way closing and opening. */
export function viewOf(s: Pick<Timeline, 'k' | 'loader' | 'shown'>): TransitionView {
  const k = clamp01(s.k);
  return { cover: k * k * (3 - 2 * k), loader: s.loader, progress: s.shown };
}

/**
 * How far the iris has to open to uncover the whole frame: the distance from its centre (cx, cy: 0…1 of the frame)
 * to the farthest corner, in heights of the frame. The shader measures in the same unit, so the hole is a circle
 * at any aspect ratio.
 */
export function irisReach(cx: number, cy: number, aspect: number): number {
  return Math.hypot(Math.max(cx, 1 - cx) * aspect, Math.max(cy, 1 - cy));
}

const VERTEX = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAGMENT = `
  uniform float uCover, uLoader, uProgress, uAspect, uReach, uTime; uniform vec2 uCenter; varying vec2 vUv;  float disc(vec2 p, float r) { return smoothstep(r + 0.004, r - 0.004, length(p)); }
  void main(){
    vec2 asp = vec2(uAspect, 1.0);
    // The closed frame: the pale lilac of the interface going up into the blue of the sky - calm, never a black hole.
    vec3 col = mix(vec3(0.86, 0.76, 0.97), vec3(0.72, 0.78, 0.99), vUv.y);
    // The iris: a round hole closing on uCenter, measured in heights of the frame.
    float d = length((vUv - uCenter) * asp), soft = 0.03;
    float r = (uReach + soft) * (1.0 - uCover);
    float alpha = smoothstep(r - soft, r, d);
    col = mix(col, vec3(1.0, 0.95, 0.99), 0.55 * smoothstep(0.1, 0.0, abs(d - r)) * smoothstep(0.0, 0.12, r));   // a pale rim
    // The loading ring in the middle of the frame; 1 = the shorter side of the frame.
    vec2 q = (vUv - 0.5) * asp / min(1.0, uAspect);
    float R = 0.2, W = 0.022;
    float band = smoothstep(W + 0.004, W - 0.004, abs(length(q) - R));
    float ang = atan(q.x, q.y) / 6.2832; ang = ang < 0.0 ? ang + 1.0 : ang;        // 0 at the top, clockwise
    float pa = uProgress * 6.2832;
    // Round ends: with no progress yet there is a dot at the top of the track, at 1 the ring is whole.
    float ends = max(disc(q - vec2(0.0, R), W), disc(q - vec2(sin(pa), cos(pa)) * R, W));
    float arc = max(band * step(ang, uProgress), ends);
    col = mix(col, vec3(1.0), band * 0.5 * uLoader);                               // the track
    col = mix(col, mix(vec3(1.0, 0.61, 0.82), vec3(0.65, 0.42, 1.0), abs(ang - 0.5) * 2.0), arc * uLoader);
    // A little gold star inside the ring, breathing slowly: the game is alive while the progress stands still.
    vec2 a = abs(q) / (0.085 * (0.92 + 0.08 * sin(uTime * 2.0)));
    float star = smoothstep(1.0, 0.86, pow(a.x, 0.6667) + pow(a.y, 0.6667));
    col = mix(col, vec3(1.0, 0.92, 0.62), star * uLoader);
    gl_FragColor = vec4(col, alpha);
  }`;

/** What `render` needs of the renderer (THREE.WebGLRenderer has it all). */
export interface LayerRenderer {
  autoClear: boolean;
  domElement: { width: number; height: number };
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
}

/**
 * The transition between worlds (TECH-15): the frame closes with an iris, stays closed with a loading ring while the
 * world is not ready and opens again. One full-screen triangle with a shader of our own, drawn by src/core/renderer.ts
 * over the finished frame (after the bloom and the tone curve); outside a transition nothing is drawn at all.
 */
export function createTransition() {
  let s: Timeline = IDLE, ready = false, progress = 0, drawnClosed = false, frames = 0;
  let frozen: { k: number; progress: number } | null = null;
  const center = { x: 0.5, y: 0.5 };
  const waiters = { closed: [] as (() => void)[], done: [] as (() => void)[] };
  const flush = (list: (() => void)[]) => { while (list.length) list.shift()!(); };
  const uniforms = {
    uCover: { value: 0 }, uLoader: { value: 0 }, uProgress: { value: 0 }, uAspect: { value: 1 }, uReach: { value: 1 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uTime,
  };
  let layer: { scene: THREE.Scene; camera: THREE.Camera } | null = null;   // made at the first transition
  function build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
      uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    }));
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    return { scene, camera: new THREE.Camera() };
  }

  /** Moves the transition on by `dt` seconds of game time; returns what to draw, or null when there is nothing to. */
  function frame(dt: number): TransitionView | null {
    if (frozen) return viewOf({ k: frozen.k, loader: frozen.k >= 1 ? 1 : 0, shown: frozen.progress });
    s = stepTimeline(s, dt, ready, progress);
    drawnClosed = s.phase === 'hold';
    if (drawnClosed) flush(waiters.closed);
    if (s.phase !== 'idle') return viewOf(s);
    flush(waiters.done);
    return null;
  }

  return {
    /**
     * Starts closing the frame. `center` - where the iris closes, in parts of the screen from its top left corner
     * (the middle by default; taken only when no transition is on, or the hole would jump). `closed` - start with the
     * frame already closed (the first load of the game); taken only when no transition is on.
     * During a transition it is a new order for the same frame, never a jump: a closing goes on, a closed frame stays
     * closed, an opening turns back from where it is - and in each case the frame now waits for a new `ready()`.
     */
    start(o: { center?: { x: number; y: number }; closed?: boolean } = {}): void {
      ready = false; progress = 0;
      if (s.phase === 'idle') {
        center.x = clamp01(o.center?.x ?? 0.5); center.y = clamp01(o.center?.y ?? 0.5);
        s = o.closed ? { phase: 'hold', k: 1, held: 0, loader: 0, shown: 0 } : { ...IDLE, phase: 'closing' };
      } else if (s.phase === 'opening') s = { ...s, phase: 'closing' };
    },
    /** Where the iris opens (the heroine in the new world); meant for the closed frame, where the hole has no size. */
    setCenter(x: number, y: number): void { center.x = clamp01(x); center.y = clamp01(y); },
    /** The progress of the loading, 0…1 (the timeline clamps what is out of range); the ring runs after it. */
    setProgress(f: number): void { progress = f; },
    /** The world is ready: the frame opens once it has closed. Said before `start()`, it is forgotten by it. */
    ready(): void { ready = true; },
    get phase(): Phase { return s.phase; },
    /** A transition is on (or the debug stop holds the layer): the layer is drawn. */
    get active(): boolean { return s.phase !== 'idle' || !!frozen; },
    /** The last drawn frame was fully closed: the world behind it may change unseen. */
    get closed(): boolean { return s.phase === 'hold' && drawnClosed; },
    /** How many frames the layer has been drawn in. */
    get frames(): number { return frames; },
    /** Resolves when a fully closed frame has been drawn (at once when it already has). */
    whenClosed(): Promise<void> { return s.phase === 'hold' && drawnClosed ? Promise.resolve() : new Promise((r) => waiters.closed.push(r)); },
    /** Resolves when the transition has ended and the layer is gone (at once when there is none). */
    whenDone(): Promise<void> { return s.phase === 'idle' ? Promise.resolve() : new Promise((r) => waiters.done.push(r)); },
    /**
     * The debug stop (window.__game.transition): holds the layer at the point `p` of the closing (0 - open, 1 - closed,
     * with the loading ring at `progress`) whatever the timeline does; null lets it go.
     */
    freeze(p: number | null, shown = 0): void { frozen = p === null ? null : { k: clamp01(p), progress: clamp01(shown) }; },
    frame,
    /** Called by the renderer after the frame is drawn: moves the transition on and draws the layer over the canvas. */
    render(renderer: LayerRenderer, dt: number): void {
      const v = frame(dt);
      if (!v) return;
      layer ??= build();
      const aspect = renderer.domElement.width / Math.max(1, renderer.domElement.height);
      uniforms.uCover.value = v.cover; uniforms.uLoader.value = v.loader; uniforms.uProgress.value = v.progress;
      uniforms.uAspect.value = aspect; uniforms.uReach.value = irisReach(center.x, center.y, aspect);
      uniforms.uCenter.value.set(center.x, 1 - center.y);   // the shader counts from the bottom
      const auto = renderer.autoClear;
      renderer.autoClear = false;                           // over the frame, not instead of it
      renderer.render(layer.scene, layer.camera);
      renderer.autoClear = auto;
      frames++;
    },
    uniforms,
  };
}

/** The one transition of the game. */
export const transition = createTransition();
