import * as THREE from 'three';
import { damp } from '../../core/util';
import type { Game } from '../../game/context';
import type { WorldScope } from '../../game/scope';
import type { WorldTask } from '../../game/world';
import { SETTLE, angleOf, generateScales, showScalesInWorld, type ScalesSpec, type ScalesView } from '../../game/worldtasks/scales';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { tf } from '../../ui/strings';
import { SCALES_AT } from './layout';
import { ownHint } from './lines';

/**
 * Tyanuchka's scales with candies at the marmalade market (WORLD-22, src/game/worldtasks/scales.ts), the third step of
 * his chain: he asks, and the task opens at his scales - a task in the foreground, as the fairy world's glades are, so
 * the conversation records its result in `compare` exactly as it records a panel task's (src/game/dialogue.ts; the
 * customer's decision 2026-11-18).
 *
 * The scales stand at the market whether the task is open or not, drawn here in grey-build shapes: a post on a round
 * foot, a beam on it, a pan hanging from each end on its string. Opened, the candies with their numbers lie on the left
 * pan as the child sees it, the right pan holds the empty place (a white ring), and the lollipop weights with their
 * numbers stand in a row before the scales, toward the child. At level 5 a candy lies on each pan, a white frame between
 * them is the place of the sign, and the three sign cards stand in the row; the beam is held level by its pin while she
 * chooses (the tilt would give the sign away). A weight put goes to the empty pan, the beam swings by the two sides
 * (src/game/worldtasks/scales.ts `angleOf`): the right one balances it and stays; a wrong one tips it the way it is
 * wrong, then comes back to the row and the beam swings back. The right sign lets the beam go to the bigger side.
 * Solved, the candies and the weight stay on the balanced scales until the next time.
 *
 * The grey build speaks no line of its own: the question is a subtitle of the world (`sweet_scales_ask`,
 * `sweet_scales_sign`) under a recorded line of the game (./strings.ts).
 */

/** The id of the step (not `compare`: that is the panel's comparing, which stood in for it in step 1). */
export const SCALES_STEP = 'scales';

const FACING = SCALES_AT.facing;
const FX = Math.sin(FACING), FZ = Math.cos(FACING);            // away from the child, across the scales
const RX = -Math.cos(FACING), RZ = Math.sin(FACING);           // to the child's right
const PIVOT_Y = 1.2;        // m: the beam's pivot over the ground
const HALF_BEAM = 1.15;     // m: from the pivot to the end of the beam where a pan hangs
const HANG = 0.55;          // m: a pan under the end of the beam
const PAN_R = 0.42;         // m: the radius of a pan
const POST_BACK = 0.25;     // m: the post stands this far beyond the middle, away from the child
const ROW = 1.35;           // m: the row of the weights before the post, toward the child
const ROW_GAP = 0.72;       // m between two things of the row
const TAP_R = 0.28;         // m: how big a weight or a sign card is round where a tap is measured from
const FLY_S = 0.5;          // s of game time a weight takes to go to the pan (and back)
const SIT_S = 0.6;          // s a wrong weight sits on the pan, the beam tipped, before it comes back
const TURN = 5;             // the beam's approach to its angle, per second
const LIFT = 0.12;          // m: a weight on the pan stands this much over it
const FRAME_DEPTH = 2.6;    // m the frame takes in along the view (./core.ts taskFrame): the tall beam, tipped, under the bubble on a phone held sideways
// While a sign is chosen the panel's hint of the signs is four lines: its bubble reaches down to a third of a phone held
// sideways and covered the right pan (the lead, 2026-11-23). The camera then looks at a point higher over the scales
// (SIGN_LOOK_Y m instead of 1.1), so that they lie lower in the picture; the sign cards lie nearer it (SIGN_ROW) and a
// size bigger (SIGN_CARD), to stay big enough to tap.
const SIGN_LOOK_Y = 1.75;
const SIGN_ROW = 1.6;
const SIGN_CARD = 1.25;

/** A point of the scales: `u` to the child's right, `v` away from the child, `y` over the ground at the post. */
function local(u: number, v: number, y: number, floor: number) {
  return new THREE.Vector3(SCALES_AT.x + RX * u + FX * v, floor + y, SCALES_AT.z + RZ * u + FZ * v);
}

/** A label on a small canvas (no file, no font file): a number or a sign on a round or a square card; null with no canvas (a unit test). */
function labelTexture(text: string, square = false): THREE.Texture | null {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const x = c?.getContext?.('2d');
  if (!c || !x) return null;
  c.width = c.height = 128;
  x.fillStyle = '#fffaf2';
  x.beginPath();
  if (square) x.roundRect(8, 8, 112, 112, 22); else x.arc(64, 64, 58, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#7a2a52'; x.font = `bold ${square ? 92 : 70}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 64, square ? 70 : 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A number as dots in rows of five (the second rung of the hint: the numbers laid out as things); null with no canvas. */
function dotsTexture(n: number): { tex: THREE.Texture; aspect: number } | null {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const x = c?.getContext?.('2d');
  if (!c || !x) return null;
  const rows = Math.max(1, Math.ceil(n / 5));
  c.width = 5 * 28 + 12; c.height = rows * 28 + 12;
  x.fillStyle = 'rgba(255,250,242,0.92)'; x.beginPath(); x.roundRect(0, 0, c.width, c.height, 12); x.fill();
  x.fillStyle = '#e8364f';
  for (let i = 0; i < n; i++) { x.beginPath(); x.arc(20 + (i % 5) * 28, 20 + Math.floor(i / 5) * 28, 10, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: c.width / c.height };
}

export interface ScalesDrawing extends ScalesView {
  /** The scales themselves: the foot, the post, the beam, the two pans; the task's things in their own group. */
  readonly group: THREE.Group;
  /** The beam's angle now (positive: the left pan down, src/game/worldtasks/scales.ts `beamAngle`). */
  readonly angle: number;
  /** The middles of the left and the right pans now. */
  pan(side: 0 | 1): THREE.Vector3;
  /** The things of the task now lying in the world: the candies, the choices (weights or signs), the place of a sign. */
  readonly things: { candies: THREE.Object3D[]; choices: THREE.Object3D[]; slot: THREE.Object3D | null };
  /** The task of `spec` is put on the scales (the things of an earlier one go). */
  load(spec: ScalesSpec): void;
  update(dt: number, time: number): void;
  dispose(): void;
}

/** Draws the scales at the market; empty and level until a task is loaded on them. */
export function drawScales(scene: THREE.Scene, groundY: (x: number, z: number) => number): ScalesDrawing {
  const floor = groundY(SCALES_AT.x, SCALES_AT.z);
  const group = new THREE.Group();
  group.name = 'tyanuchka-scales';
  const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  const pivot = local(0, POST_BACK, PIVOT_Y, floor);
  const foot = new THREE.Mesh(own(new THREE.CylinderGeometry(0.4, 0.45, 0.1, 16)), own(mat('#ffd84a')));
  foot.position.copy(local(0, POST_BACK, 0.05, floor));
  const post = new THREE.Mesh(own(new THREE.CylinderGeometry(0.07, 0.09, PIVOT_Y, 10)), own(mat('#5fbf52')));
  post.position.copy(local(0, POST_BACK, PIVOT_Y / 2, floor));
  const beam = new THREE.Mesh(own(new THREE.BoxGeometry(HALF_BEAM * 2 + 0.1, 0.08, 0.08)), own(mat('#ffd84a')));
  beam.name = 'scales-beam';
  beam.position.copy(pivot);
  // the pin that holds the beam level while a sign is chosen: a red-and-white knob before the pivot
  const pin = new THREE.Mesh(own(new THREE.SphereGeometry(0.07, 10, 8)), own(mat('#e8364f')));
  pin.position.copy(local(0, POST_BACK - 0.08, PIVOT_Y, floor));
  pin.visible = false;
  const panGeo = own(new THREE.CylinderGeometry(PAN_R, PAN_R * 0.75, 0.07, 20)), stringGeo = own(new THREE.CylinderGeometry(0.012, 0.012, HANG, 4));
  const pans = [0, 1].map((side) => {
    const p = new THREE.Mesh(panGeo, own(mat(side === 0 ? '#ffd84a' : '#7bd36a')));
    p.name = `scales-pan-${side === 0 ? 'left' : 'right'}`;
    p.receiveShadow = true;
    const s = new THREE.Mesh(stringGeo, own(mat('#fffaf2')));
    return { p, s };
  });
  for (const m of [foot, post, beam]) m.castShadow = true;
  group.add(foot, post, beam, pin, ...pans.flatMap((x) => [x.p, x.s]));
  const items = new THREE.Group();
  items.name = 'scales-things';
  group.add(items);
  scene.add(group);

  // the beam lies across the view; its two ends move as it turns about the line of the view
  const across = new THREE.Vector3(RX, 0, RZ);
  let angle = 0, target = 0;
  const endOf = (side: 0 | 1) => {
    const k = side === 0 ? -1 : 1;
    // positive angle: the left end down, the right end up
    return pivot.clone().addScaledVector(across, k * HALF_BEAM * Math.cos(angle)).setY(pivot.y + k * HALF_BEAM * Math.sin(angle));
  };
  const panAt = (side: 0 | 1) => endOf(side).setY(endOf(side).y - HANG);
  const pose = () => {
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), endOf(1).sub(endOf(0)).normalize());
    for (const side of [0, 1] as const) {
      const e = endOf(side);
      pans[side].p.position.copy(e).setY(e.y - HANG);
      pans[side].s.position.copy(e).setY(e.y - HANG / 2);
    }
  };
  pose();

  // ----- the things of a task -----
  let spec: ScalesSpec | null = null;
  let candies: THREE.Group[] = [], choices: THREE.Group[] = [], slot: THREE.Mesh | null = null, ring: THREE.Mesh | null = null;
  let lying: THREE.Vector3[] = [], dotSprites: THREE.Sprite[] = [];
  let itemDisposables: { dispose(): void }[] = [];
  let put: number | null = null, glowing: number | null = null, rest = 0, time = 0;
  /** A choice on its way: to the place and staying (`stay`), or to it, sitting a while, and back. */
  let moving: { i: number; t0: number; stay: boolean; angle: number } | null = null;
  const iown = <T extends { dispose(): void }>(x: T) => { itemDisposables.push(x); return x; };
  const sprite = (tex: THREE.Texture | null, size: number, aspect = 1) => {
    const s = new THREE.Sprite(iown(new THREE.SpriteMaterial({ map: tex, depthTest: false, color: tex ? 0xffffff : 0xfffaf2 })));
    if (tex) iown(tex);
    s.scale.set(size * aspect, size, 1); s.renderOrder = 3;
    return s;
  };
  const clearItems = () => {
    items.clear();
    for (const d of itemDisposables) d.dispose();
    itemDisposables = [];
    candies = []; choices = []; slot = null; ring = null; lying = []; dotSprites = []; put = null; glowing = null; moving = null;
  };
  /** Where a choice goes: on the right pan (a weight), into the frame between the pans (a sign). */
  const placeOf = () => (spec?.body.mode === 'sign' ? local(0, POST_BACK - 0.12, PIVOT_Y - 0.5, floor) : panAt(1).setY(panAt(1).y + LIFT));
  /** The candies of a side on its pan, side by side. */
  const candyAt = (side: 0 | 1, k: number, n: number) => {
    const p = panAt(side);
    return p.addScaledVector(across, (k - (n - 1) / 2) * 0.32).setY(p.y + 0.1);
  };

  function load(s: ScalesSpec) {
    clearItems();
    spec = s;
    const { body } = s;
    pin.visible = body.mode === 'sign';
    rest = angleOf(body, null);
    const candyGeo = iown(new THREE.SphereGeometry(0.11, 12, 8).scale(1.35, 1, 1)), wrapGeo = iown(new THREE.ConeGeometry(0.07, 0.12, 6));
    const candy = (n: number, color: string) => {
      const c = new THREE.Group();
      const m = iown(mat(color, { emissive: color, emissiveIntensity: 0.15 }));
      const ball = new THREE.Mesh(candyGeo, m);
      // the wrapper's two twists, along the candy
      const l = new THREE.Mesh(wrapGeo, m), r = new THREE.Mesh(wrapGeo, m);
      l.rotation.z = Math.PI / 2; l.position.x = -0.19; r.rotation.z = -Math.PI / 2; r.position.x = 0.19;
      c.add(ball, l, r);
      const label = sprite(labelTexture(String(n)), 0.3);
      label.position.y = 0.25;
      c.add(label);
      c.userData = { n };
      c.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), across);
      return c;
    };
    const sides = [body.left, body.right] as const;
    for (const side of [0, 1] as const) {
      sides[side].forEach((n, k) => {
        const c = candy(n, side === 0 ? '#ff6b8a' : '#a77bff');
        c.userData.side = side; c.userData.k = k; c.userData.of = sides[side].length;
        candies.push(c); items.add(c);
      });
    }
    if (body.mode === 'weight') {
      // the empty place on the right pan: a white ring lying on it
      ring = new THREE.Mesh(iown(new THREE.TorusGeometry(0.2, 0.025, 6, 24).rotateX(Math.PI / 2)), iown(new THREE.MeshBasicMaterial({ color: '#ffffff' })));
      ring.name = 'scales-empty-place';
      items.add(ring);
    } else {
      // the place of the sign: a white frame between the pans, facing the child
      const frame = new THREE.Shape();
      frame.moveTo(-0.24, -0.24); frame.lineTo(0.24, -0.24); frame.lineTo(0.24, 0.24); frame.lineTo(-0.24, 0.24); frame.closePath();
      const hole = new THREE.Path(); hole.moveTo(-0.19, -0.19); hole.lineTo(0.19, -0.19); hole.lineTo(0.19, 0.19); hole.lineTo(-0.19, 0.19); hole.closePath();
      frame.holes.push(hole);
      slot = new THREE.Mesh(iown(new THREE.ShapeGeometry(frame)), iown(new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide })));
      slot.name = 'scales-sign-place';
      slot.position.copy(placeOf());
      slot.rotation.y = FACING + Math.PI;
      items.add(slot);
    }
    // the row of the choices before the post, toward the child
    const n = body.choices.length;
    const stickGeo = iown(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6).translate(0, 0.21, 0));
    const headGeo = iown(new THREE.SphereGeometry(0.2, 16, 10)), cardGeo = iown(new THREE.BoxGeometry(0.5, 0.5, 0.06).translate(0, 0.27, 0));
    const WEIGHT_COLORS = ['#ff8fb1', '#ffd84a', '#7bd36a', '#a8e4ff'];
    body.choices.forEach((c, i) => {
      const g = new THREE.Group();
      g.name = `scales-choice-${i}`;
      const m = iown(mat(typeof c === 'number' ? WEIGHT_COLORS[i % WEIGHT_COLORS.length] : '#ff8fb1', { emissive: '#ffd27a', emissiveIntensity: 0 }));
      if (typeof c === 'number') {
        // a lollipop weight: a stick and a round head, its number on the head
        const stick = new THREE.Mesh(stickGeo, iown(mat('#fffaf2')));
        const head = new THREE.Mesh(headGeo, m); head.position.y = 0.6; head.castShadow = true;
        const label = sprite(labelTexture(String(c)), 0.32); label.position.y = 0.6;
        g.add(stick, head, label);
      } else {
        const card = new THREE.Mesh(cardGeo, m); card.castShadow = true;
        card.rotation.y = FACING + Math.PI;
        const label = sprite(labelTexture(c, true), 0.42); label.position.y = 0.3;
        g.add(card, label);
      }
      g.userData = { choice: c, top: typeof c === 'number' ? 0.6 : 0.3 };
      // a sign card a size bigger (SIGN_CARD): it lies farther down the picture of the signs
      const size = typeof c === 'number' ? 1 : SIGN_CARD;
      g.userData.size = size; g.userData.top = (g.userData.top as number) * size; g.scale.setScalar(size);
      const p = local((i - (n - 1) / 2) * ROW_GAP, body.mode === 'sign' ? -SIGN_ROW : -ROW, 0, floor);
      p.y = groundY(p.x, p.z);
      lying.push(p);
      g.position.copy(p);
      choices.push(g); items.add(g);
    });
    // the dots of the second rung: high over each pan, behind each weight (on the screen over its number, the camera looks
    // from above) - never on a number, which they would hide
    const away = new THREE.Vector3(FX, 0, FZ);
    const dotsOver = (n: number, at: () => THREE.Vector3) => {
      const d = dotsTexture(n);
      const s = sprite(d?.tex ?? null, 0.085 * Math.max(1, Math.ceil(n / 5)) + 0.05, d?.aspect ?? 1);
      s.visible = false; s.userData.at = at;
      dotSprites.push(s); items.add(s);
    };
    const over = (side: 0 | 1) => () => { const p = panAt(side); return p.setY(p.y + 0.9); };
    dotsOver(body.left.reduce((a, b) => a + b, 0), over(0));
    if (body.mode === 'sign') dotsOver(body.right.reduce((a, b) => a + b, 0), over(1));
    else body.choices.forEach((c, i) => dotsOver(c as number, () => lying[i].clone().addScaledVector(away, 0.6).setY(lying[i].y + 0.6)));
    target = rest;
    place();
  }

  /** Every thing of the task where it is now: the candies on their pans, the choices lying, put or on their way. */
  function place() {
    for (const c of candies) c.position.copy(candyAt(c.userData.side, c.userData.k, c.userData.of));
    if (ring) { const p = panAt(1); ring.position.copy(p).setY(p.y + 0.045); ring.visible = put === null && !(moving && moving.i >= 0); }
    choices.forEach((g, i) => {
      const lie = lying[i];
      const size = g.userData.size as number;
      g.scale.setScalar(size);
      if (put === i && !moving) { g.position.copy(placeOf()); return; }
      if (moving?.i === i) {
        const t = time - moving.t0, to = placeOf();
        // there over FLY_S (an arc), sitting SIT_S, then back over FLY_S - or staying, for the right one
        const k = t < FLY_S ? t / FLY_S : moving.stay || t < FLY_S + SIT_S ? 1 : Math.max(0, 1 - (t - FLY_S - SIT_S) / FLY_S);
        const e = k * k * (3 - 2 * k);
        g.position.lerpVectors(lie, to, e);
        g.position.y += Math.sin(e * Math.PI) * 0.45;
        // a wrong one rocks a little as it comes back
        g.rotation.z = !moving.stay && t > FLY_S + SIT_S ? Math.sin((t - FLY_S - SIT_S) * 18) * 0.12 * k : 0;
        return;
      }
      g.position.copy(lie);
      g.rotation.z = 0;
      // the lit answer of the third rung: it hops and swells a little, its head glowing (the label alone would hide the glow)
      if (i === glowing) g.position.y += 0.08 + Math.abs(Math.sin(time * 5)) * 0.1;
      if (i === glowing) g.scale.setScalar(size * (1.15 + 0.08 * Math.sin(time * 6)));
    });
    for (const s of dotSprites) s.position.copy((s.userData.at as () => THREE.Vector3)());
  }

  const drawing: ScalesDrawing = {
    group,
    get angle() { return angle; },
    pan: (side) => panAt(side),
    get things() { return { candies: [...candies], choices: [...choices], slot }; },
    get center() { return local(0, -0.45, spec?.body.mode === 'sign' ? SIGN_LOOK_Y : 1.1, floor); },
    facing: FACING,
    // the beam and its pans across; along the view more than the row and the post take on the ground (FRAME_DEPTH): the
    // camera stands back far enough that the beam over the post stays under the bubble of the line
    get extent() { return { side: HALF_BEAM + PAN_R + 0.15, depth: FRAME_DEPTH }; },
    choice: (i) => {
      const g = choices[i];
      return { pos: g ? g.position.clone().setY(g.position.y + (g.userData.top as number)) : new THREE.Vector3(), r: TAP_R * ((g?.userData.size as number | undefined) ?? 1) };
    },
    put: (i, a) => { moving = { i, t0: -1, stay: true, angle: a }; put = i; },
    back: (i, a, r) => { moving = { i, t0: -1, stay: false, angle: a }; rest = r; },
    dots: (on) => { for (const s of dotSprites) s.visible = on; },
    glow: (i) => { glowing = i; },
    clear: (solved) => {
      if (!solved) { clearItems(); spec = null; pin.visible = false; target = 0; return; }
      // solved: the candies and what was put stay on the balanced scales; the other things go
      for (const [i, g] of choices.entries()) if (i !== put) g.visible = false;
      for (const s of dotSprites) s.visible = false;
      glowing = null;
    },
    load,
    update(dt, t) {
      time = t;
      if (moving) {
        if (moving.t0 < 0) moving.t0 = t;
        const e = t - moving.t0;
        // the beam swings once the thing has landed: by the weight (or freed by the right sign), and back once it has left
        if (moving.stay) { if (e >= FLY_S) { target = moving.angle; pin.visible = false; } if (e >= SETTLE) moving = null; }
        else { target = e >= FLY_S && e < FLY_S + SIT_S ? moving.angle : rest; if (e >= FLY_S * 2 + SIT_S) moving = null; }
      }
      angle += (target - angle) * damp(TURN, dt);
      if (Math.abs(target - angle) < 1e-4) angle = target;
      pose();
      place();
      choices.forEach((g, i) => {
        const m = (g.children[g.children.length > 2 ? 1 : 0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = i === glowing ? 0.6 + 0.35 * Math.sin(t * 6) : 0;
      });
    },
    dispose() {
      clearItems();
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
  return drawing;
}

export interface ScalesStep extends WorldTask {
  readonly drawing: ScalesDrawing;
  /** The task open on the scales now, else null. */
  readonly spec: ScalesSpec | null;
  update(dt: number, time: number): void;
  dispose(): void;
}

/**
 * The step of Tyanuchka's chain: a task in the foreground (`run`) on every level of "Comparing" - the conversation
 * records it in `compare` as a panel task (src/game/dialogue.ts). `player`: the shared player of tasks in the world.
 */
export function createScales(g: Game, player: WorldTaskPlayer, scope: WorldScope): ScalesStep {
  const drawing = drawScales(g.scene, g.groundY);
  // the post is solid: she walks round the scales, not through them
  g.ground.block(SCALES_AT.x + FX * POST_BACK, SCALES_AT.z + FZ * POST_BACK, 0.45);
  let spec: ScalesSpec | null = null;
  return {
    skill: 'compare',
    inWorld: () => true,
    get drawing() { return drawing; },
    get spec() { return spec; },
    run(n, level) {
      // Tyanuchka's own question and the cat's own hint over the shared scales (./lines.ts): the hint of the weights is
      // the world's whole; the signs keep the panel's way (its first rung) and take the world's two others
      const shared = generateScales(level, g.rng);
      spec = shared.body.mode === 'weight'
        ? { ...shared, prompt: 'tyanuchka_scales_start', hint: ownHint(shared.hint, ['sweet_scales_hint_1', 'sweet_scales_hint_2', 'sweet_scales_hint_3']) }
        : { ...shared, prompt: 'tyanuchka_scales_start_sign', hint: ownHint(shared.hint, [null, 'sweet_scales_hint_2', 'sweet_scales_hint_3']) };
      drawing.load(spec);
      const hooks = g.hooksFor(n.def.emoji);
      // Tyanuchka's question, under the world's own subtitle
      const sub = tf(spec.body.mode === 'weight' ? 'sweet_scales_ask' : 'sweet_scales_sign', {});
      const show = showScalesInWorld(spec, drawing, { ...hooks, prompt: (key) => { void g.speech.line(key, 'task', 0, n.def.emoji, sub); } },
        { reach: g.touch ? 70 : 46, scope });
      // level: Tyanuchka is pleased with the balance before the conversation goes on - a line of the task, as the sea's
      // half of the shell (pantsyr_half_finish): the task is still open here and lets no line of the story through
      return player.play(show).then(async (res) => {
        if (res.solved) await g.speech.line('tyanuchka_scales_finish', 'task', 0, n.def.emoji);
        return res;
      }).finally(() => { spec = null; });
    },
    update: (dt, time) => drawing.update(dt, time),
    dispose: () => drawing.dispose(),
  };
}
