import * as THREE from 'three';
import { clipFor, say, stopVoice } from '../core/audio';
import { t, voiceText, type Key, type SpokenKey } from '../ui/strings';
import { el, setAct } from '../ui/ui';
import type { Game } from './context';
import type { WorldScope } from './scope';
import { ease } from './flyover';

/**
 * The cut-scenes of a world (WORLD-13): still frames with one slow move of the camera each and a parallax over the
 * frame's depth map (2.5D: what is near moves more than what is far), the cat's line and its subtitle on every frame.
 * A tap goes on to the next frame, the skip button closes the whole scene. A frame whose 2.5D breaks (no depth map,
 * no WebGL) plays the same pass flat: the zoom alone, round the same aim.
 *
 * A world hands its scenes in with `setStories` (src/worlds/<id>/index.ts) and plays them with `playStory`; the id of
 * a scene is the name of its flag in the world's part of the save (`ws.flags[id]`: seen), so the save's format does not
 * change. The start of the game plays the introduction of a new save (src/game/start.ts), the book plays a seen scene
 * again (src/ui/ui.ts). The time of a pass is the game's (a frame counts at most 0.05 s), never the wall clock.
 */

/** Zoom in or pull out: the pass goes from one end of ZOOM to the other. */
export type Zoom = 'in' | 'out';

export interface Shot {
  /** The frame, relative to the page: `<image>.webp` (960x536) and its depth map `<image>_depth.webp` (white = near). */
  image: string;
  /** The cat's line (and its subtitle). */
  line: SpokenKey;
  /** What the frame is about, as a share of its width and height from the top left: it stays where it is. */
  aim: readonly [number, number];
  zoom: Zoom;
  /**
   * The sideways and upward parallax of the whole pass, a share of the frame's width / height: the nearest things move
   * by it, things as far as the aim do not move, farther ones move the other way.
   */
  pan: readonly [number, number];
  /** How much more the nearest things grow than the aim at the near end of the pass (0 .. PARALLAX_MAX). */
  depth: number;
  /** Seconds of the pass at least; it also lasts at least the line + AFTER_LINE (see passSeconds). */
  seconds: number;
  /** The subtitle at the top of the screen: the bottom of the frame holds what it is about (else at the bottom). */
  subtitleTop?: boolean;
  /**
   * Soft lights the player draws over the frame, as shares of its width and height from the top left (at most
   * GLOWS_MAX): they belong to the picture and move with it (the zoom, the move, the parallax). A generated frame that
   * cannot count (six gems where the story has five) gets its count from them: each is brighter than the gems it lies
   * on, so the extra one reads as background. They pulse slowly, and stand still for prefers-reduced-motion.
   */
  glows?: readonly (readonly [number, number])[];
}

export interface StoryDef {
  /** The name of its flag in `ws.flags`: true once the scene was shown. */
  id: string;
  /** The book's button of the scene: an icon, and a name for its label. */
  icon: string;
  title: Key;
  shots: readonly Shot[];
}

/** The zoom of a pass: in from `from` to `to`, out the other way. */
export const ZOOM = { from: 1.04, to: 1.1 } as const;
/** The sideways (and upward) move of a pass: at most this share of the frame. */
export const PAN_MAX = 0.03;
export const PARALLAX_MAX = 0.1;
/** Seconds from the start of the move to the start of the line; the pass lasts the line + AFTER_LINE at least. */
export const LINE_DELAY = 0.3;
export const AFTER_LINE = 1;
/** Seconds of the cross-fade from one frame to the next. */
export const FADE = 0.6;
/** The most lights over one frame (Shot.glows). */
export const GLOWS_MAX = 5;
/** How much a light grows and shrinks as it pulses (a share of its halo); 0 for prefers-reduced-motion. */
export const GLOW_PULSE = 0.18;
/** The pulse of the lights now: none when the player asked the system for less motion. */
export const glowPulse = () => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : GLOW_PULSE);
/** The aim of a frame lies in the middle 80 % of its height: a phone held sideways cuts about 10 % off the top and the bottom. */
export const SAFE = { top: 0.1, bottom: 0.9 } as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** One move of the camera: speeding up and slowing down (the same smoothstep as the tour), the aim at rest. */
export interface Pose {
  /** The aim, from the bottom left (the shader's coordinates). */
  aim: [number, number];
  zoom: number;
  /** The parallax of depth: the growth of the nearest things over the aim's. */
  k: number;
  pan: [number, number];
}

/** Where the pass of `shot` is at `u` (0..1 of its seconds); `flat`: the same pass without the depth. */
export function poseAt(shot: Shot, u: number, flat: boolean): Pose {
  const e = ease(clamp01(u)), span = ZOOM.to - ZOOM.from;
  const zoom = shot.zoom === 'in' ? ZOOM.from + span * e : ZOOM.to - span * e;
  const aim: [number, number] = [shot.aim[0], 1 - shot.aim[1]];
  if (flat) return { aim, zoom, k: 0, pan: [0, 0] };
  const near = shot.zoom === 'in' ? e : 1 - e;
  return { aim, zoom, k: shot.depth * near, pan: [shot.pan[0] * (e - 0.5), -shot.pan[1] * (e - 0.5)] };
}

/** The kind of the move: two frames side by side never move the same way. */
export function moveKind(shot: Shot): string {
  const [x, y] = shot.pan;
  const side = Math.max(Math.abs(x), Math.abs(y)) < 0.005 ? '' : Math.abs(x) >= Math.abs(y) ? (x > 0 ? ' right' : ' left') : (y > 0 ? ' down' : ' up');
  return shot.zoom + side;
}

/** The seconds of a pass: its own, and at least the line (once its length is known) + AFTER_LINE after its start. */
export const passSeconds = (shot: Shot, lineSeconds: number | null) => Math.max(shot.seconds, LINE_DELAY + (lineSeconds ?? 0) + AFTER_LINE);

/**
 * What is wrong with the scenes of a world, in the order they are told (the introduction first): an aim outside the
 * middle of the frame, a zoom, a move or a parallax over the limits, two frames side by side with the same move, a
 * last frame of the story that does not pull out. Empty when all is right.
 */
export function storyProblems(stories: readonly StoryDef[]): string[] {
  const out: string[] = [];
  for (const s of stories) {
    if (!s.shots.length) out.push(`${s.id}: no frames`);
    s.shots.forEach((f, i) => {
      const name = `${s.id} ${i + 1} (${f.image})`;
      if (!(f.aim[1] >= SAFE.top && f.aim[1] <= SAFE.bottom)) out.push(`${name}: the aim at ${f.aim[1]} of the height is outside the middle 80 %`);
      if (!(f.aim[0] > 0 && f.aim[0] < 1)) out.push(`${name}: the aim at ${f.aim[0]} of the width is outside the frame`);
      if (Math.abs(f.pan[0]) > PAN_MAX || Math.abs(f.pan[1]) > PAN_MAX) out.push(`${name}: a move of ${f.pan.join(', ')}, more than ${PAN_MAX}`);
      if (!(f.depth >= 0 && f.depth <= PARALLAX_MAX)) out.push(`${name}: a parallax of ${f.depth}, not 0-${PARALLAX_MAX}`);
      if (!(f.seconds >= LINE_DELAY + AFTER_LINE + 2)) out.push(`${name}: a pass of ${f.seconds} s is too short for a line`);
      const gl = f.glows ?? [];
      if (gl.length > GLOWS_MAX) out.push(`${name}: ${gl.length} lights, more than ${GLOWS_MAX}`);
      // a light stays in the middle 80 % of the height even at the nearest end of the zoom (it grows away from the aim)
      for (const [x, y] of gl) {
        const far = f.aim[1] + (y - f.aim[1]) * ZOOM.to;
        if (!(x > 0 && x < 1 && far >= SAFE.top && far <= SAFE.bottom)) out.push(`${name}: a light at ${x}, ${y} outside the middle 80 % of the frame (at the zoom ${ZOOM.to})`);
      }
      if (i > 0 && moveKind(f) === moveKind(s.shots[i - 1])) out.push(`${name}: the same move as the frame before it (${moveKind(f)})`);
    });
    const last = s.shots[s.shots.length - 1];
    if (last && last.zoom !== 'out') out.push(`${s.id}: the last frame does not pull out`);
  }
  return out;
}

/** A frame as the player has shown it (the walkthrough reads these). */
export interface ShownFrame {
  story: string; index: number; image: string;
  /** '25d' with its depth, 'flat' without it, 'none' when the frame itself did not load. */
  mode: '25d' | 'flat' | 'none';
  /** Seconds of the pass, and when (from its start) the line started and ended; null while not yet. */
  pass: number; lineAt: number | null; lineEnd: number | null;
}

export interface StoryPlayer {
  readonly stories: readonly StoryDef[];
  /** A scene is on screen: the walkthrough waits for its end by this, not by the clock. */
  readonly active: boolean;
  /** The scene on screen and its frame, null / -1 when none. */
  readonly id: string | null;
  readonly index: number;
  /** Seconds of game time since the start of the frame's pass, and the seconds of the pass. */
  readonly elapsed: number;
  readonly pass: number;
  /** The cross-fade to the frame on screen is not over yet (a tap waits for it). */
  readonly fading: boolean;
  /** Every frame shown since the page was loaded, in order. */
  readonly log: readonly ShownFrame[];
  /** Debug: every frame flat, as if its 2.5D had broken. */
  flat: boolean;
  /** Shows the scene `id` (nothing recorded); settles with how it ended. 'busy': another scene holds the controls. */
  play(id: string): Promise<'end' | 'skip' | 'busy' | 'none'>;
  /** A tap: the next frame, or the end after the last one. */
  next(): void;
  /** The skip button: the end of the whole scene. */
  skip(): void;
  /** Debug: hold the pass of the frame on screen at `u` (0..1), null to let it run on. */
  hold(u: number | null): void;
}

interface Frame { img: THREE.Texture | null; depth: THREE.Texture | null; focus: number; bitmap: HTMLImageElement | null }
/** The frame on screen (or fading out): its pass so far. */
interface Cur { shot: Shot; frame: Frame; shown: ShownFrame; elapsed: number }

const base = import.meta.env.BASE_URL;

/** Loads an image and decodes it off the frame (a first draw would decode it there); null when it fails. */
const loadImage = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const i = new Image();
  i.onload = () => { void (i.decode?.() ?? Promise.resolve()).catch(() => {}).then(() => resolve(i)); };
  i.onerror = () => resolve(null);
  i.src = src;
});

/** The length of a recorded clip, read from its file (the service worker keeps it); null when unknown. */
function clipSeconds(line: SpokenKey): Promise<number | null> {
  const clip = clipFor(line);
  if (clip === null) return Promise.resolve(null);
  return new Promise((resolve) => {
    const a = new Audio();
    const done = (v: number | null) => { a.onloadedmetadata = null; a.onerror = null; resolve(v); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : null);
    a.onerror = () => done(null);
    a.src = `${base}voice/${clip}.mp3`;
  });
}

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// Screen = aim + (s - aim) * zoom * (1 + k (d - f)) + pan (d - f), d the depth at s, f the depth of the aim: the aim
// stays, nearer things grow and move more. Inverted by a few fixed-point steps per pixel.
const FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D imgA, depA, imgB, depB;
  uniform vec2 fit; uniform float mixB, hasA;
  uniform vec2 aimA, panA, aimB, panB; uniform float kA, zA, fA, kB, zB, fB;
  uniform vec2 glA[${GLOWS_MAX}], glB[${GLOWS_MAX}]; uniform float nA, nB, tA, tB, pulse;
  vec2 src(sampler2D D, vec2 uv, vec2 c, vec2 pan, float k, float z, float f) {
    vec2 s = uv;
    for (int i = 0; i < 6; i++) {
      float d = texture2D(D, clamp(s, 0.0, 1.0)).r - f;
      s = c + (uv - c - pan * d) / (z * (1.0 + k * d));
    }
    return clamp(s, 0.001, 0.999);
  }
  // the lights of a frame (Shot.glows) at the point s of the picture, round in the frame (its 960:536): a wide soft
  // red glow, a deep red body that covers a painted gem under it, a pale core; only for a frame that has lights, so a
  // frame without them is drawn as before
  vec3 lights(vec3 c, vec2 s, vec2 g[${GLOWS_MAX}], float n, float t) {
    for (int i = 0; i < ${GLOWS_MAX}; i++) {
      if (float(i) >= n) break;
      float r = length((s - g[i]) * vec2(1.791, 1.0));
      c += exp(-pow(r / 0.07, 2.0)) * vec3(0.9, 0.15, 0.2) * 0.35;
      c = mix(c, vec3(0.85, 0.03, 0.08), 0.9 * exp(-pow(r / (0.022 * (1.0 + pulse * sin(t * 2.4 + float(i) * 1.7))), 2.0)));
      c = mix(c, vec3(1.0, 0.8, 0.75), exp(-pow(r / 0.008, 2.0)));
    }
    return min(c, vec3(1.0));
  }
  void main() {
    vec2 uv = (vUv - 0.5) * fit + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec3 a = vec3(0.0);
    if (hasA > 0.5) {
      vec2 sa = src(depA, uv, aimA, panA, kA, zA, fA);
      a = texture2D(imgA, sa).rgb;
      if (nA > 0.5) a = lights(a, sa, glA, nA, tA);
    }
    vec2 sb = src(depB, uv, aimB, panB, kB, zB, fB);
    vec3 b = texture2D(imgB, sb).rgb;
    if (nB > 0.5) b = lights(b, sb, glB, nB, tB);
    gl_FragColor = vec4(mix(a, b, mixB), 1.0);
  }`;

/**
 * The share of the frame the window shows: the frame covers a window held sideways (cut at the top and the bottom
 * on a phone); in an upright window it is shown whole, with bands above and below.
 */
export function fitOf(w: number, h: number, frame = 960 / 536): [number, number] {
  const ar = w / h;
  if (ar >= 1) return ar > frame ? [1, frame / ar] : [ar / frame, 1];
  return [1, frame / ar];
}

/** The player of the world's scenes: the overlay, its own small renderer while a scene is on screen, the lines. */
export function createStoryPlayer(g: Game, stories: readonly StoryDef[], scope: WorldScope): StoryPlayer {
  const root = document.getElementById('story')!, sub = document.getElementById('storySub')!, skipBtn = document.getElementById('storySkip')!;
  const log: ShownFrame[] = [];
  let active: StoryDef | null = null, index = -1, elapsed = 0, pass = 0, fade = 1, held: number | null = null;
  let flat = false, token = 0, raf = 0, last = 0;
  let cur: Cur | null = null, prev: Cur | null = null;
  let renderer: THREE.WebGLRenderer | null = null, ctx2d: CanvasRenderingContext2D | null = null, canvas: HTMLCanvasElement | null = null;
  let mat: THREE.ShaderMaterial | null = null, scene: THREE.Scene | null = null;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const loaded = new Map<string, Promise<Frame>>();
  let done: ((how: 'end' | 'skip') => void) | null = null;
  const blank = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  blank.needsUpdate = true;

  /** The renderer of the overlay: WebGL for the 2.5D, else a 2D canvas that zooms flat. */
  function open() {
    canvas = document.createElement('canvas');
    root.prepend(canvas);
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      const uniforms: Record<string, THREE.IUniform> = {
        imgA: { value: blank }, depA: { value: blank }, imgB: { value: blank }, depB: { value: blank },
        fit: { value: new THREE.Vector2(1, 1) }, mixB: { value: 1 }, hasA: { value: 0 },
        aimA: { value: new THREE.Vector2() }, panA: { value: new THREE.Vector2() }, kA: { value: 0 }, zA: { value: 1 }, fA: { value: 0.5 },
        aimB: { value: new THREE.Vector2() }, panB: { value: new THREE.Vector2() }, kB: { value: 0 }, zB: { value: 1 }, fB: { value: 0.5 },
        glA: { value: Array.from({ length: GLOWS_MAX }, () => new THREE.Vector2()) }, nA: { value: 0 }, tA: { value: 0 },
        glB: { value: Array.from({ length: GLOWS_MAX }, () => new THREE.Vector2()) }, nB: { value: 0 }, tB: { value: 0 },
        pulse: { value: glowPulse() },
      };
      mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
      scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      // a shader that did not build on this device: the 2D canvas instead (the same pass, flat)
      renderer.compile(scene, camera);
      const programs = renderer.info.programs as unknown as { diagnostics?: { runnable: boolean } }[] | null;
      if (programs?.some((p) => p.diagnostics && !p.diagnostics.runnable)) throw new Error('the shader of the cut-scenes did not build');
    } catch {
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
      renderer = null; mat = null; scene = null;
      canvas.remove();
      canvas = document.createElement('canvas');
      root.prepend(canvas);
      ctx2d = canvas.getContext('2d');
    }
    resize();
  }
  function close() {
    if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
    mat?.dispose();
    for (const p of loaded.values()) void p.then((f) => { f.img?.dispose(); f.depth?.dispose(); });
    loaded.clear();
    canvas?.remove();
    renderer = null; ctx2d = null; canvas = null; mat = null; scene = null;
  }
  function resize() {
    if (!canvas) return;
    const w = innerWidth, h = innerHeight;
    if (renderer) {
      renderer.setSize(w, h, false);
      const [fx, fy] = fitOf(w, h);
      (mat!.uniforms.fit.value as THREE.Vector2).set(fx, fy);
    } else if (ctx2d) { canvas.width = Math.round(w * Math.min(devicePixelRatio, 2)); canvas.height = Math.round(h * Math.min(devicePixelRatio, 2)); }
  }

  /** The frame and its depth map; the depth of the aim is read from the map (it stays at rest). */
  function load(shot: Shot): Promise<Frame> {
    let p = loaded.get(shot.image);
    if (!p) {
      p = Promise.all([loadImage(`${base}${shot.image}.webp`), loadImage(`${base}${shot.image}_depth.webp`)]).then(([im, dm]) => {
        const tex = (i: HTMLImageElement | null, color: boolean) => {
          if (!i || !renderer) return null;
          const x = new THREE.Texture(i);
          if (color) x.colorSpace = THREE.SRGBColorSpace;
          x.minFilter = THREE.LinearFilter; x.generateMipmaps = false; x.needsUpdate = true;
          // uploaded now, while an earlier frame plays: not on the frame where it first shows (a lost frame on a phone)
          renderer.initTexture(x);
          return x;
        };
        let focus = 0.5;
        if (dm) {
          const c = document.createElement('canvas');
          c.width = dm.naturalWidth; c.height = dm.naturalHeight;
          const x = c.getContext('2d');
          if (x) {
            x.drawImage(dm, 0, 0);
            focus = x.getImageData(Math.round(shot.aim[0] * (c.width - 1)), Math.round(shot.aim[1] * (c.height - 1)), 1, 1).data[0] / 255;
          }
        }
        return { img: tex(im, true), depth: tex(dm, false), focus, bitmap: im };
      });
      loaded.set(shot.image, p);
    }
    return p;
  }

  const isFlat = (f: Frame) => flat || !renderer || !f.depth;

  function setSlot(slot: 'A' | 'B', c: Cur) {
    const u = mat!.uniforms, fl = isFlat(c.frame), p = poseAt(c.shot, c.elapsed / c.shown.pass, fl);
    u['img' + slot].value = c.frame.img ?? blank;
    u['dep' + slot].value = fl ? blank : c.frame.depth;
    (u['aim' + slot].value as THREE.Vector2).set(p.aim[0], p.aim[1]);
    (u['pan' + slot].value as THREE.Vector2).set(p.pan[0], p.pan[1]);
    u['k' + slot].value = p.k; u['z' + slot].value = p.zoom; u['f' + slot].value = fl ? 0.5 : c.frame.focus;
    // the lights in the shader's coordinates (from the bottom left)
    const gl = (c.shot.glows ?? []).slice(0, GLOWS_MAX), at = u['gl' + slot].value as THREE.Vector2[];
    gl.forEach(([x, y], i) => at[i].set(x, 1 - y));
    u['n' + slot].value = gl.length; u['t' + slot].value = c.elapsed;
  }
  /** The flat pass on a 2D canvas: the frame zoomed round its aim, covering or fitting the window like the shader. */
  function draw2d(c: Cur, alpha: number) {
    const x = ctx2d!, W = canvas!.width, H = canvas!.height, img = c.frame.bitmap;
    if (!img) return;
    const [fx, fy] = fitOf(W, H), p = poseAt(c.shot, c.elapsed / c.shown.pass, true);
    // the window shows the share fx x fy of the frame round its centre; the frame is zoomed round the aim
    const sw = W / fx, sh = H / fy, ax = c.shot.aim[0], ay = c.shot.aim[1];
    x.globalAlpha = alpha;
    x.save();
    x.translate(W / 2 + (ax - 0.5) * sw, H / 2 + (ay - 0.5) * sh);
    x.scale(p.zoom, p.zoom);
    x.drawImage(img, -ax * sw, -ay * sh, sw, sh);
    // the lights, as the shader draws them (no parallax here, as for the frame)
    (c.shot.glows ?? []).slice(0, GLOWS_MAX).forEach(([gx, gy], i) => {
      const cx = (gx - ax) * sw, cy = (gy - ay) * sh, r = 0.14 * sh * (1 + glowPulse() * Math.sin(c.elapsed * 2.4 + i * 1.7));
      const grad = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(255,225,215,1)'); grad.addColorStop(0.08, 'rgba(225,20,45,0.95)'); grad.addColorStop(0.25, 'rgba(225,40,60,0.5)');
      grad.addColorStop(0.5, 'rgba(235,70,90,0.15)'); grad.addColorStop(1, 'rgba(235,70,90,0)');
      x.fillStyle = grad; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    });
    x.restore();
    x.globalAlpha = 1;
  }
  function render() {
    if (!cur) return;
    if (renderer && mat && scene) {
      const u = mat.uniforms;
      setSlot('B', cur);
      u.hasA.value = prev ? 1 : 0;
      if (prev) setSlot('A', prev);
      u.mixB.value = fade;
      renderer.render(scene, camera);
    } else if (ctx2d) {
      ctx2d.fillStyle = '#000'; ctx2d.fillRect(0, 0, canvas!.width, canvas!.height);
      if (prev) draw2d(prev, 1);
      draw2d(cur, fade);
    }
  }

  function tick(now: number) {
    if (!active) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (cur) {
      if (held === null) cur.elapsed = Math.min(cur.elapsed + dt, Math.max(cur.shown.pass, cur.elapsed));
      else cur.elapsed = held * cur.shown.pass;
      elapsed = cur.elapsed; pass = cur.shown.pass;
      if (fade < 1) { fade = Math.min(1, fade + dt / FADE); if (fade >= 1) prev = null; }
      if (cur.shown.lineAt === null && cur.elapsed >= LINE_DELAY) startLine(cur);
    }
    render();
  }

  function startLine(c: Cur) {
    c.shown.lineAt = c.elapsed;
    sub.textContent = t(c.shot.line);
    sub.classList.toggle('top', c.shot.subtitleTop === true);
    sub.classList.remove('hidden');
    const mine = token;
    void say(c.shot.line, voiceText(c.shot.line), 'story', '🐱').then(() => { if (mine === token && c.shown.lineEnd === null) c.shown.lineEnd = c.elapsed; });
  }

  async function show(i: number) {
    const story = active!, shot = story.shots[i], mine = ++token;
    stopVoice();
    sub.classList.add('hidden'); sub.textContent = '';
    const frame = await load(shot);
    if (mine !== token || !active) return;
    const shown: ShownFrame = { story: story.id, index: i, image: shot.image, mode: frame.bitmap ? (isFlat(frame) ? 'flat' : '25d') : 'none', pass: passSeconds(shot, null), lineAt: null, lineEnd: null };
    log.push(shown);
    void clipSeconds(shot.line).then((s) => { if (s !== null) shown.pass = Math.max(shown.pass, passSeconds(shot, s)); });
    prev = cur; cur = { shot, frame, shown, elapsed: 0 };
    index = i; elapsed = 0; pass = shown.pass; fade = 0; held = null;
    // the next frame loads while this one plays
    if (i + 1 < story.shots.length) void load(story.shots[i + 1]);
  }

  function finish(how: 'end' | 'skip') {
    if (!active) return;
    token++;
    cancelAnimationFrame(raf);
    stopVoice();
    active = null; index = -1; cur = null; prev = null; held = null;
    root.classList.add('hidden'); sub.classList.add('hidden');
    close();
    const d = done; done = null; d?.(how);
  }

  const next = () => {
    if (!active || fade < 1 || index < 0 || !cur) return;
    if (index + 1 >= active.shots.length) finish('end');
    else void show(index + 1);
  };
  // A tap anywhere on the overlay goes on; the skip button ends the scene (its own tap does not go on as well). The
  // listeners are the world's (src/game/scope.ts): a world left takes them away, and a scene still on ends with it.
  scope.on(root, 'pointerdown', (e: Event) => { if (e.target === skipBtn) return; e.preventDefault(); next(); });
  scope.on(skipBtn, 'click', (e: Event) => { e.stopPropagation(); finish('skip'); });
  scope.on(window, 'resize', () => { if (active) resize(); });
  scope.own(() => { if (active) finish('skip'); cancelAnimationFrame(raf); });

  return {
    stories, log,
    get active() { return active !== null; },
    get id() { return active?.id ?? null; },
    get index() { return index; },
    get elapsed() { return elapsed; },
    get pass() { return pass; },
    get fading() { return fade < 1; },
    get flat() { return flat; },
    set flat(v: boolean) { flat = v; },
    play(id) {
      const story = stories.find((s) => s.id === id);
      if (!story) return Promise.resolve('none');
      if (active || g.busy) return Promise.resolve('busy');
      active = story;
      // Meanwhile the heroine stands and the joystick and the jump button are hidden; the overlay lies over the rest.
      g.busy = true; g.auto = null; setAct(null);
      g.speech.caption(null);
      const hide = [el.joy, el.btnJump], was = hide.map((e) => e.classList.contains('hidden'));
      for (const e of hide) e.classList.add('hidden');
      skipBtn.setAttribute('aria-label', 'skip');
      root.classList.remove('hidden');
      open();
      last = performance.now();
      raf = requestAnimationFrame(tick);
      const ended = new Promise<'end' | 'skip'>((resolve) => {
        done = (how) => { hide.forEach((e, i) => e.classList.toggle('hidden', was[i])); g.busy = false; resolve(how); };
      });
      // every frame of the scene loads and uploads from the start (a scene is 2-6 frames of ~100 KB)
      for (const s of story.shots) void load(s);
      void show(0);
      return ended;
    },
    next,
    skip: () => finish('skip'),
    hold: (u) => { held = u === null ? null : clamp01(u); },
  };
}

const players = new WeakMap<Game, StoryPlayer>();

/** The world's scenes (src/worlds/<id>/index.ts, while it is built); returns their player. */
export function setStories(g: Game, stories: readonly StoryDef[], scope: WorldScope): StoryPlayer {
  const p = createStoryPlayer(g, stories, scope);
  players.set(g, p);
  // the scenes are the world's: once it is left, the game has none (the next world sets its own)
  scope.own(() => { if (players.get(g) === p) players.delete(g); });
  return p;
}

export const storyOf = (g: Game): StoryPlayer | null => players.get(g) ?? null;

/**
 * Plays the scene `id` of the world. Recorded (the default): only once - a scene already seen is not shown again, and
 * it is marked seen as it starts (`ws.flags[id]`, the id is the flag); `record: false` (the book, the debug command)
 * shows it anyway and marks nothing. Meanwhile the heroine stands (`g.busy`); the tap that goes on reaches neither the
 * canvas (no walk) nor a button: the overlay lies over them. True when it was shown.
 */
export async function playStory(g: Game, id: string, o: { record?: boolean } = {}): Promise<boolean> {
  const p = players.get(g), record = o.record ?? true;
  if (!p || p.active || g.busy || !p.stories.some((s) => s.id === id)) return false;
  if (record && g.ws.flags[id]) return false;
  if (record) { g.ws.flags[id] = true; g.persist(); }
  await p.play(id);
  return true;
}

/** The scenes of the world already seen, in their order: what the book offers to show again. */
export function seenStories(g: Game): readonly StoryDef[] {
  const p = players.get(g);
  return p ? p.stories.filter((s) => g.ws.flags[s.id] === true) : [];
}
