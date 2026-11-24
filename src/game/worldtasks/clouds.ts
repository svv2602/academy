import * as THREE from 'three';
import { randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { WorldScope } from '../scope';
import { add, generate as generateAdd, type AddSpec } from '../tasks/add';
import { generate as generateSub, sub, type SubSpec } from '../tasks/sub';
import { hintOf, type ShownHint } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';
import { numberTexture } from './stones';

/**
 * "The cloud bridge" played in the world (WORLD-25, docs/13-worlds.md; docs/worlds/world-5.md «Задания, разыгранные в
 * мире» item 3): a gap in a bridge between two islands, 3-4 steps across it. Over each step the cloud fairy names an
 * example of «Сложение» or «Вычитание» (level 5 - across the ten); 2-4 clouds with numbers hang where the step will be.
 * A tap on a cloud: the heroine hops onto it. The right one firms up into a step of the bridge and she stays on it; a
 * wrong one gently springs and puts her back on the step she came from - nobody falls, nothing is taken away, the course
 * of a mistake is the frame's (./core.ts). The hint is the one in three rungs of every task (LEARN-10), of the example
 * of the step she is on. The bridge is done once its last step is in; the result goes to the skill of the examples, as
 * the panel's would (`add` or `sub`).
 *
 * The input is a tap and a hop, not her walking (the lead's decision 2026-11-25, docs/worlds/world-5.md): the task keeps
 * to the frame of the tasks in the world - the camera over the gap, the hint, the walkthrough's three deliberate wrong
 * moves (`mistakes`) - and a preschooler never steers her with the stick over the void.
 *
 * Like every show of a task it draws no random numbers. It is the world's to open it, to wire the close button, to call
 * `update` in its frame and to keep the camera on the step ahead (`center` moves with her: ./core.ts `taskFrame`).
 */

/** How many steps and how many clouds over each by level (WORLD-25: 3-4 steps, 2-4 clouds). */
export const CLOUDS_BY_LEVEL: Readonly<Record<number, { steps: number; clouds: number }>> = {
  1: { steps: 3, clouds: 2 }, 2: { steps: 3, clouds: 3 }, 3: { steps: 4, clouds: 3 }, 4: { steps: 4, clouds: 4 }, 5: { steps: 4, clouds: 4 },
};
export const cloudsLevel = (level: number) => Math.min(5, Math.max(1, Math.round(level)));

export type CloudKind = 'add' | 'sub';
export type CloudStep = AddSpec | SubSpec;
export interface CloudsSpec { kind: CloudKind; level: number; steps: CloudStep[] }

/** The text of an example as the cloud over it shows it: "8 + 5", "13 − 6". */
export const exampleText = (s: CloudStep) => (s.type === 'add' ? `${s.body.a} + ${s.body.b}` : `${s.body.total} − ${s.body.gone}`);

/**
 * A bridge of `kind` for `level`: as many examples as the level has steps, each the panel's (`tasks/add.ts`,
 * `tasks/sub.ts`) - no example twice - with its choices cut to the level's clouds: the answer and the numbers nearest to
 * it, in an order of their own.
 */
export function generateClouds(kind: CloudKind, level: number, rng: Rng): CloudsSpec {
  const l = cloudsLevel(level), by = CLOUDS_BY_LEVEL[l];
  const steps: CloudStep[] = [], seen = new Set<string>();
  for (let tries = 0; steps.length < by.steps && tries < 200; tries++) {
    const s: CloudStep = kind === 'add' ? generateAdd(l, rng) : generateSub(l, rng);
    const text = exampleText(s);
    if (seen.has(text) && tries < 199) continue;
    seen.add(text);
    const { answer, options } = s.body;
    const near = options.filter((v) => v !== answer).sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer)).slice(0, by.clouds - 1);
    const mine = [answer, ...near];
    for (let i = mine.length - 1; i > 0; i--) { const j = randInt(0, i, rng); [mine[i], mine[j]] = [mine[j], mine[i]]; }
    s.body.options = mine;
    steps.push(s);
  }
  return { kind, level: l, steps };
}

/** The gap: its near edge (where she stands at first, on the deck), the way across it, the height of the deck, its length. */
export interface CloudsPlace { x: number; z: number; y: number; facing: number; length: number }

export interface WorldCloudsOptions {
  /** The farthest a tap may land from a cloud on the screen, in pixels. */
  reach: number;
  /** The world's scope: the task's timer goes with the world. */
  scope: WorldScope;
  /** The heroine: she stands where the bridge is, hops from step to step (never lower than the deck). */
  hero: { root: THREE.Object3D; heading: number };
}

export interface WorldClouds extends WorldTaskShow {
  /** The steps in so far (each the right cloud of its example, firmed up). */
  readonly built: number;
  /** Where she stands now: the near edge, or the last step in. */
  readonly stand: THREE.Vector3;
}

const LABEL = 0.75;       // m: the size of a cloud's number (on a phone not smaller than a finger: tools/world-pass.mjs MIN_TAP_PX)
const CLOUD = 0.75;       // m: the radius of a cloud
const SPREAD = 1.7;       // m between two clouds across the gap
const HOP = 0.45;         // s of game time one hop takes
const SPRING = 0.5;       // s a wrong cloud springs with her on it
const TAP_UP = 0.35;      // m over a cloud's middle where a tap on it is measured from
const EXAMPLE_Y = 2.3;    // m over the deck where the example of the step ahead hangs

/** A wide label: the example over the step ahead. */
function textTexture(text: string): THREE.Texture | null {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const x = c?.getContext?.('2d');
  if (!c || !x) return null;
  c.width = 256; c.height = 112;
  x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(4, 4, 248, 104, 40); x.fill();
  x.fillStyle = '#3b5bb8'; x.font = 'bold 68px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Hop = { from: THREE.Vector3; to: THREE.Vector3; t: number; then: () => void };

export function showCloudsInWorld(scene: THREE.Scene, spec: CloudsSpec, at: CloudsPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldCloudsOptions): WorldClouds {
  const group = new THREE.Group();
  const fx = Math.sin(at.facing), fz = Math.cos(at.facing);          // across the gap, away from the near edge
  const sx = Math.cos(at.facing), sz = -Math.sin(at.facing);         // across the bridge
  const n = spec.steps.length, step = at.length / (n + 1);
  const on = (d: number, side = 0) => new THREE.Vector3(at.x + fx * d + sx * side, at.y, at.z + fz * d + sz * side);
  const textures: THREE.Texture[] = [];
  const sprite = (tex: THREE.Texture | null, w: number, h: number, y: number) => {
    if (!tex) return null;
    textures.push(tex);
    // unlit, untoned and out of the haze, a shade darker than painted: its light disc stays under the bloom's threshold
    // (src/core/renderer.ts, tier 2), which would wash the number out in its own glow
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#d4d4d4', depthTest: false, toneMapped: false, fog: false }));
    s.scale.set(w, h, 1); s.position.y = y; s.renderOrder = 2;
    return s;
  };
  const cloudGeo = new THREE.IcosahedronGeometry(CLOUD, 1).scale(1.35, 0.55, 1.1);
  const deckGeo = new THREE.BoxGeometry(3, 0.4, step * 0.9);
  // the clouds to choose from a sky blue, unlike the white deck and the sea of clouds below; the hint lights one gold
  const cloudMat = () => new THREE.MeshStandardMaterial({ color: '#a9c8f5', emissive: '#ffc21a', emissiveIntensity: 0, roughness: 1 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 1 });

  // the steps in, firmed up into the deck (none at first)
  const decks: THREE.Mesh[] = [];
  // the clouds over the step ahead and the example over them; laid anew for each step
  let row: THREE.Mesh[] = [], example: THREE.Sprite | null = null, k = 0;
  const stand = on(0);
  let base = 0;            // the wrong moves made before the step ahead: its hint starts from its first rung
  const cur = () => spec.steps[Math.min(k, n - 1)];
  function layRow() {
    for (const m of row) group.remove(m);
    if (example) group.remove(example);
    row = []; example = null;
    if (k >= n) return;
    const s = cur(), { options } = s.body;
    row = options.map((v, j) => {
      const m = new THREE.Mesh(cloudGeo, cloudMat());
      m.position.copy(on(step * (k + 1), (j - (options.length - 1) / 2) * SPREAD));
      m.userData = { n: v, home: m.position.clone() };
      const l = sprite(numberTexture(v), LABEL, LABEL, 0.7); if (l) m.add(l);
      group.add(m);
      return m;
    });
    example = sprite(textTexture(exampleText(s)), 2.2, 0.97, 0);
    if (example) { example.position.copy(on(step * (k + 1))).setY(at.y + EXAMPLE_Y); group.add(example); }
    base = core.wrongs;
    hooks.prompt(s.prompt, s.ask);
  }
  scene.add(group);

  const hops: Hop[] = [];
  let springing: { m: THREE.Mesh; t: number } | null = null, pulsing: THREE.Mesh | null = null, counting: { t: number; from: number; to: number } | null = null, time = 0;
  const busy = () => hops.length > 0 || springing !== null;
  const hopTo = (to: THREE.Vector3, then: () => void = () => {}) => hops.push({ from: o.hero.root.position.clone(), to: to.clone(), t: -1, then });
  const tapPoint = (m: THREE.Mesh) => m.position.clone().setY(m.position.y + TAP_UP);
  const right = () => row.find((m) => m.userData.n === cur().body.answer) ?? null;
  // the hint of the example ahead: its rungs counted from the first wrong move over this step
  const hintNow = (): ShownHint | null => hintOf(cur().hint, () => { pulsing = right(); }, {
    countAloud: () => { const s = cur(); counting = { t: time, from: 0, to: s.type === 'add' ? s.body.a + s.body.b : s.body.total - s.body.gone }; },
    countOn: () => { const s = cur(); counting = s.type === 'add' ? { t: time, from: s.body.a, to: s.body.a + s.body.b } : { t: time, from: s.body.total - s.body.gone, to: s.body.total }; },
    takeToTen: () => { const s = cur(); if (s.type === 'sub') counting = { t: time, from: 10, to: s.body.total }; },
    fillTen: () => { const s = cur(); if (s.type === 'add') counting = { t: time, from: s.body.a, to: s.body.a + s.body.b }; },
  });
  const hint: ShownHint = { key: (round) => hintNow()?.key(round - base) ?? 'h1_add', show: (round) => hintNow()?.show(round - base) };
  const core = taskCore(o.scope, hooks, cur().hint ? hint : null, () => {
    scene.remove(group);
    cloudGeo.dispose(); deckGeo.dispose();
    for (const t of textures) t.dispose();
  });

  function pick(m: THREE.Mesh) {
    if (!core.alive || busy() || !row.includes(m)) return;
    const s = cur(), back = stand.clone();
    const out = s.type === 'add' ? add.answer(s, null, m.userData.n as number) : sub.answer(s, null, m.userData.n as number);
    if (out === 'ignored') return;
    pulsing = null; counting = null;
    if (out === 'wrong') {
      // she hops onto it, it springs under her, she hops back where she was: nothing is lost, nobody falls
      hopTo(m.position, () => { springing = { m, t: time }; });
      void core.mistake();
      hops.push({ from: m.position.clone(), to: back, t: -2, then: () => {} });
      return;
    }
    hooks.good();
    const place = on(step * (k + 1));
    hopTo(m.position, () => {
      // the cloud firms up into a step of the bridge, under her, on the line of the bridge
      const d = new THREE.Mesh(deckGeo, deckMat);
      d.position.copy(place).setY(at.y - 0.2);
      d.rotation.y = at.facing;
      group.add(d); decks.push(d);
      stand.copy(place);
      k++;
      if (k >= n) { for (const c of row) group.remove(c); if (example) group.remove(example); row = []; example = null; core.solve(400); return; }
      layRow();
    });
    // she settles on the middle of the new step as the cloud becomes it
    hops.push({ from: m.position.clone(), to: place, t: -2, then: () => {} });
  }

  /** The hops in flight played to their end at once (the walkthrough's moves do not wait for the world's time). */
  const finish = () => {
    while (hops.length) { const h = hops.shift()!; o.hero.root.position.copy(h.to); h.then(); }
    if (springing) { springing.m.position.copy(springing.m.userData.home); springing.m.scale.y = 1; springing = null; }
  };

  layRow();
  const center = new THREE.Vector3();
  const centerNow = () => center.copy(on(step * (Math.min(k, n - 1) + 0.55))).setY(at.y + 0.9);
  centerNow();
  const sideOf = () => (Math.max(1, ...row.map((m) => Math.abs((m.position.x - at.x) * sx + (m.position.z - at.z) * sz))) + CLOUD + 0.6);

  return {
    kind: 'clouds', done: core.done, facing: at.facing, mistakes: 3,
    get center() { return centerNow(); },
    // the step she stands on and the clouds ahead, close: the numbers big on a phone
    get extent() { return { side: sideOf(), depth: step * 0.6 + 1 }; },
    get built() { return k; },
    get stand() { return stand.clone(); },
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best: THREE.Mesh | null = null, bd = o.reach;
      for (const m of row) { const d = screenDist(tapPoint(m)); if (d < bd) { bd = d; best = m; } }
      if (best) pick(best);
      return true;
    },
    // the walkthrough's and the debug door's moves go through `pick`, the tap's handler; a hop in flight is finished
    // first, so a solve made at once still builds every step in its order
    solve: () => {
      for (let i = 0; i < n + 1 && core.alive; i++) { finish(); const r = right(); if (!r) break; pick(r); }
      finish();
    },
    wrong: () => {
      if (!core.alive) return false;
      finish();
      const m = row.find((x) => x.userData.n !== cur().body.answer);
      if (!m) return false;
      pick(m);
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind: 'clouds', phase: core.phase, wrongs: core.wrongs, moves: k, rung: core.rung, progress: [] }),
    reach: o.reach,
    // a cloud with its number on it: as big as the larger of the two
    targets: () => (core.alive && !busy() ? row.map((m) => ({ pos: tapPoint(m), right: m.userData.n === cur().body.answer, r: Math.max(CLOUD, LABEL / 2) })) : []),
    progress: () => [],
    resume: () => {},
    update: (t) => {
      time = t;
      const hero = o.hero.root.position;
      if (!hops.length && !springing) hero.copy(stand);
      const h = hops[0];
      if (h && h.t === -2) h.t = springing ? -2 : t;      // the hop back waits for the spring
      if (h && h.t === -1) h.t = t;
      if (h && h.t >= 0) {
        const q = Math.min(1, (t - h.t) / HOP);
        hero.lerpVectors(h.from, h.to, q).y += Math.sin(q * Math.PI) * 0.7;
        o.hero.heading = at.facing; o.hero.root.rotation.y = at.facing;
        if (q >= 1) { hops.shift(); hero.copy(h.to); h.then(); }
      }
      // never lower than the deck: a hop arcs over it, a cloud springs down a hand at most
      if (hero.y < at.y - 0.15) hero.y = at.y - 0.15;
      if (springing) {
        const q = (t - springing.t) / SPRING, m = springing.m;
        const dip = q < 1 ? Math.sin(q * Math.PI * 2) * 0.15 * (1 - q) : 0;
        m.position.y = m.userData.home.y - dip; hero.y = m.position.y;
        m.scale.y = 1 - dip;
        if (q >= 1) { m.position.copy(m.userData.home); m.scale.y = 1; springing = null; }
      }
      // the clouds float a little; the right one glows on the last rung of the hint
      row.forEach((m, j) => {
        if (springing?.m !== m) m.position.y = m.userData.home.y + Math.sin(t * 1.6 + j) * 0.06;
        (m.material as THREE.MeshStandardMaterial).emissiveIntensity = m === pulsing ? 0.8 + Math.sin(t * 6) * 0.3 : 0;
      });
      // the count of the hint: the example's label flashes once a step of the count (the voice counts with it)
      if (example && counting) {
        const lit = Math.floor((t - counting.t) / 0.6);
        example.material.opacity = lit <= counting.to - counting.from ? (lit % 2 ? 0.6 : 1) : 1;
        if (lit > counting.to - counting.from) counting = null;
      }
    },
  };
}
