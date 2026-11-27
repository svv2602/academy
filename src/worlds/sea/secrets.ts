import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { note, sfx, speaking } from '../../core/audio';
import { camDistance } from '../../core/tuning';
import type { Actor } from '../../game/actor';
import type { Game } from '../../game/context';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { starGeometry } from './creatures';
import { GROTTO, LANDMARKS, LIFT_ROCK, LOOKOUT, ZONES } from './layout';
import { Paint, paintMaterial } from './paint';
import { colliders, height, tops } from './terrain';

/**
 * The secrets of the Underwater Kingdom (PLAY-07, docs/worlds/world-3.md «Секреты»; the plan of 2026-11-23 the lead
 * took): optional, not needed by the story, each found once - its flag in the world's part of the save (the names of
 * WorldDef.secrets and of the items of the world description), its stars and the cat's word the first time; coming
 * back gives nothing again. The Great Tree hangs a keepsake for each (src/worlds/hub/keepsakes.ts reads the flags).
 *
 * - ship_chest: the chest in the hold by the cabin's door (the world's chest, PLAY-08): opened, 5 stars; every other
 *   secret 3.
 * - bubble_lift: a pillar of rock off the ways; a column of bubbles at its foot carries her up onto its flat top, where
 *   a glowing starfish (the hair clip's look) is the find. Off its edge she sinks back to the floor.
 * - echo_shells: three great shells before the garden's great shell - each touched sings its note; all three touched,
 *   in any order, they sing the tune together. No mistake and no score.
 * - whale: the lookout at the east edge, a mound she swims up onto: standing on its top, she sees a whale pass far off in
 *   the open water and wave its tail - every time she comes up (the lead, 2026-11-23), the stars the first time.
 * - sea_grotto: the grotto behind the seaweed (the customer's word of 2026-11-27: a secret place to explore, as the first
 *   world's waterfall cave and the forest's): a mound of rocks off the way from the reef to the trench, its opening
 *   behind a curtain of seaweed that parts round her; inside glowing corals and an open shell with its pearl - swimming
 *   up to the shell finds it.
 *
 * The rocks are seen from everywhere (one mesh); the starfish, the shells and the whale are drawn only near her
 * (SHOW_R) - the sea's frame is close to its budget of draw calls (TECH-06).
 */
export const CHEST_FLAG = 'ship_chest', LIFT_FLAG = 'bubble_lift', SHELLS_FLAG = 'echo_shells', WHALE_FLAG = 'whale', GROTTO_FLAG = 'sea_grotto';
export const SEA_SECRETS = [CHEST_FLAG, LIFT_FLAG, SHELLS_FLAG, WHALE_FLAG, GROTTO_FLAG] as const;
export type SeaSecret = (typeof SEA_SECRETS)[number];
/** How each is done (WorldItem.how): the chest and the shells by the action button, the lift, the whale and the grotto by swimming. */
export const SECRET_HOW: Record<SeaSecret, 'act' | 'walk'> = { ship_chest: 'act', bubble_lift: 'walk', echo_shells: 'act', whale: 'walk', sea_grotto: 'walk' };
/** m: a secret's things are drawn while she is this near. */
export const SHOW_R = 26;
/** s: the cat's word of a find waits this long at most for the line that sounds to end (else it is not said). */
export const WORD_WAIT = 8;
/** m: the swimming height over the floor and the tops (./index.ts SWIM_HEIGHT). */
export const SWIM = 0.6;

// ---------- the bubble lift ----------

/** s: the lift carries her up this long; m/s: off a top's edge she sinks this fast. */
export const LIFT_S = 2.4, SINK_SPEED = 2.6;
/** m: how near the column's middle she has to swim for it to take her. */
export const LIFT_R = 0.9;
/** The top of the lift's rock, the column at its foot (toward the square, where she comes from), the starfish on top. */
export function liftOf() {
  const floor = height(LIFT_ROCK.x, LIFT_ROCK.z), top = floor + LIFT_ROCK.h;
  const dx = ZONES.square.x - LIFT_ROCK.x, dz = ZONES.square.z - LIFT_ROCK.z, d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d, out = LIFT_ROCK.r + 1.1;
  const column = { x: LIFT_ROCK.x + ux * out, z: LIFT_ROCK.z + uz * out };
  // where the lift sets her down: on the top, on the column's side; the starfish across it
  const landing = { x: LIFT_ROCK.x + ux * LIFT_ROCK.r * 0.5, z: LIFT_ROCK.z + uz * LIFT_ROCK.r * 0.5 };
  const star = { x: LIFT_ROCK.x - ux * LIFT_ROCK.r * 0.45, z: LIFT_ROCK.z - uz * LIFT_ROCK.r * 0.45 };
  return { top, column, landing, star };
}
/**
 * Where the lift has her `t` s after it took her at `from`: up the column first, over onto the top at the end; done
 * at LIFT_S. The height is that of her feet (she swims SWIM over the top).
 */
export function liftAt(t: number, from: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const { top, landing } = liftOf();
  const k = THREE.MathUtils.clamp(t / LIFT_S, 0, 1);
  const up = THREE.MathUtils.smootherstep(k, 0, 0.75), over = THREE.MathUtils.smoothstep(k, 0.6, 1);
  return out.set(
    from.x + (landing.x - from.x) * over,
    from.y + (top + SWIM - from.y) * up,
    from.z + (landing.z - from.z) * over,
  );
}

// ---------- the echo shells ----------

/** The notes of the three shells, Hz (C5, E5, G5), and the tune they sing together once each was touched. */
export const SHELL_NOTES = [523.25, 659.25, 783.99] as const;
export const TUNE = [0, 1, 2, 1, 0, 2, 2] as const;
/** s: a note of the tune each. */
export const TUNE_STEP = 0.26;
/**
 * The three shells: by the garden's great shell, on its quiet side - away from the ways (7-9 m), not on Bulchik's spot
 * behind it (garden + (-6.1, 4.6)): `SHELLS_SIDE` from +z round the great shell, SHELLS_OUT m from it.
 */
export const SHELLS_SIDE = 0.35, SHELLS_OUT = 5;
export function shellsOf() {
  const L = LANDMARKS.garden, ux = Math.sin(SHELLS_SIDE), uz = Math.cos(SHELLS_SIDE);
  const cx = L.x + ux * SHELLS_OUT, cz = L.z + uz * SHELLS_OUT;
  // in an arc, the side ones a little back toward the great shell
  const at = [-1, 0, 1].map((k) => ({ x: cx + uz * k * 1.7 - ux * Math.abs(k) * 0.5, z: cz - ux * k * 1.7 - uz * Math.abs(k) * 0.5 }));
  // where she listens from: before the middle one, farther out
  return { at, front: { x: cx + ux * 2.3, z: cz + uz * 2.3 } };
}
/** The state of the shells: which have sung since the last tune, and the tune going on (its time, -1 none). */
export interface Shells { sung: boolean[]; tune: number }
export const restShells = (): Shells => ({ sung: [false, false, false], tune: -1 });
/** A touch of shell `i`: it sings; the third different one begins the tune. During the tune a touch does nothing. */
export function touchShell(s: Shells, i: number): Shells {
  if (s.tune >= 0) return s;
  const sung = s.sung.map((x, k) => x || k === i);
  return { sung, tune: sung.every(Boolean) ? 0 : -1 };
}
/** m: an echo shell's radius (a scallop standing on its hinge, ./secrets.ts echoShellGeometry). */
export const SHELL_SIZE = 1;
/**
 * An echo shell: a scallop standing up on its hinge, its face to +z, ribbed - every other rib of its rim leant out.
 * The garden's scallop (./life.ts shellGeometry) is a low dome lying on the floor: made large it was a flat smear seen
 * from where she listens (the pictures of 2026-11-23). Radius 1, hinge at the origin.
 */
export function echoShellGeometry(): THREE.BufferGeometry {
  const ribs = 11, pos: number[] = [];
  const rim = (k: number) => { const a = (k / ribs) * Math.PI; return [Math.cos(a), Math.sin(a) + 0.08, k % 2 ? 0.14 : 0] as const; };
  for (let k = 0; k < ribs; k++) {
    const [x0, y0, z0] = rim(k), [x1, y1, z1] = rim(k + 1);
    // the hinge a little out from the face, the ribs between it and the rim
    pos.push(0, 0, 0.1, x0, y0, z0, x1, y1, z1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** s the tune lasts, a pause before it included. */
export const TUNE_PAUSE = 0.5;
export const tuneSeconds = () => TUNE_PAUSE + TUNE.length * TUNE_STEP;

// ---------- the whale ----------

/** s she stands on the lookout's top before the whale comes; s it takes to pass. */
export const WHALE_WAIT = 2, WHALE_S = 11;
/**
 * m: how far from the lookout it passes, the half of its way across, how high over the lookout's top. Over the map,
 * not past its edge: there the tall kelp and the rising rim hide all; low enough to be in the picture of the camera
 * behind her, which looks down at her (9 m and 6 m over the top went out of it: the pictures of 2026-11-23); clear of the
 * square's arch (≈ 6 m off its way).
 */
export const WHALE_OFF = 26, WHALE_SPAN = 28, WHALE_UP = 3.5;
/** The lookout's top and the way of the whale: across the water over the map, toward its middle from the lookout. */
export function whaleOf() {
  const top = height(LOOKOUT.x, LOOKOUT.z) + LOOKOUT.h, d = Math.hypot(LOOKOUT.x, LOOKOUT.z) || 1;
  // `look`: from the lookout toward the middle of the map, where she looks to see it
  const ux = -LOOKOUT.x / d, uz = -LOOKOUT.z / d;
  return { top, look: { x: ux, z: uz }, middle: { x: LOOKOUT.x + ux * WHALE_OFF, z: LOOKOUT.z + uz * WHALE_OFF } };
}
/** The whale `t` s into its pass: where it is, its heading (yaw) and its tail's wave (radians), null before or after. */
export function whaleAt(t: number): { pos: THREE.Vector3; yaw: number; tail: number } | null {
  if (t < 0 || t > WHALE_S) return null;
  const { top, look, middle } = whaleOf();
  const k = t / WHALE_S, along = (k * 2 - 1) * WHALE_SPAN;
  // across: turned a quarter from where she looks
  const ax = -look.z, az = look.x;
  const pos = new THREE.Vector3(middle.x + ax * along, top + WHALE_UP + Math.sin(k * Math.PI) * 1.5, middle.z + az * along);
  return { pos, yaw: Math.atan2(ax, az), tail: Math.sin(t * 2.6) * 0.45 };
}

// ---------- the grotto behind the seaweed ----------

/** m from the grotto's middle: its rocks' ring; rad: the half of its opening to `face`; the rocks' count. */
export const GROTTO_R = 3.3, GROTTO_OPEN = 0.66, GROTTO_ROCKS = 11;
/** m: the shell with the pearl stands this far behind the middle (from the opening); she finds it this near it. */
export const PEARL_BACK = 1.3, FIND_R = 1.3;
/** The seaweed of the curtain: blades across the opening, m apart; m: how near her a blade leans aside. */
export const WEEDS = 9, WEED_GAP = 0.34, WEED_PART = 1.7;
/**
 * The camera in the grotto, m from her, by where she stands (as the forest's cave): GROTTO_CAM inside GROTTO_CAM_IN of
 * the middle, the usual distance from GROTTO_CAM_OUT on, a smooth step between; past the curtain it looks down steeply.
 */
export const GROTTO_CAM = 2.4, GROTTO_CAM_IN = 2.0, GROTTO_CAM_OUT = 5.6, GROTTO_PITCH = 0.9;
/** m: the grotto's rocks are drawn while she is this near (the weeds and the glow inside: SHOW_R). */
export const GROTTO_SEEN = 60;
export function grottoCamDist(d: number, far: number): number {
  const k = Math.min(1, Math.max(0, (d - GROTTO_CAM_IN) / (GROTTO_CAM_OUT - GROTTO_CAM_IN)));
  return GROTTO_CAM + (far - GROTTO_CAM) * k * k * (3 - 2 * k);
}
/** The rocks in a horseshoe round the middle, open to `face`; their x, z, size and height. */
export function grottoRocks(): { x: number; z: number; r: number; h: number; spin: number }[] {
  const out: { x: number; z: number; r: number; h: number; spin: number }[] = [];
  for (let i = 0; i < GROTTO_ROCKS; i++) {
    const a = GROTTO.face + GROTTO_OPEN + (i / (GROTTO_ROCKS - 1)) * (Math.PI * 2 - 2 * GROTTO_OPEN);
    out.push({ x: GROTTO.x + Math.sin(a) * GROTTO_R, z: GROTTO.z + Math.cos(a) * GROTTO_R, r: 1.2 + (i % 3) * 0.2, h: 2.8 + (i % 2) * 0.6, spin: i * 1.7 });
  }
  return out;
}
/** Its places: the opening (the curtain's middle), the shell with the pearl at the back, the blades' feet across the opening. */
export function grottoOf() {
  const fx = Math.sin(GROTTO.face), fz = Math.cos(GROTTO.face);
  const opening = { x: GROTTO.x + fx * GROTTO_R, z: GROTTO.z + fz * GROTTO_R };
  const pearl = { x: GROTTO.x - fx * PEARL_BACK, z: GROTTO.z - fz * PEARL_BACK };
  const weeds = Array.from({ length: WEEDS }, (_, i) => { const k = (i - (WEEDS - 1) / 2) * WEED_GAP; return { x: opening.x + fz * k, z: opening.z - fx * k }; });
  return { opening, pearl, weeds };
}
/** The grotto in one painted geometry: the rocks and the lintel, the glowing corals inside, the open shell and its pearl. */
export function grottoGeometry(): THREE.BufferGeometry {
  const p = new Paint(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const rock = new THREE.DodecahedronGeometry(1, 0);
  for (const k of grottoRocks()) {
    q.setFromEuler(new THREE.Euler(0, k.spin, 0.2 * Math.sin(k.spin * 3)));
    p.add(rock, k.spin % 2 > 1 ? '#76848d' : '#83919a', 0, m4.compose(pv.set(k.x, height(k.x, k.z) + k.h * 0.45, k.z), q, sv.set(k.r, k.h, k.r)));
  }
  const { opening, pearl } = grottoOf();
  q.setFromEuler(new THREE.Euler(0, GROTTO.face, 0));
  p.add(rock, '#7a8891', 0, m4.compose(pv.set(opening.x, height(opening.x, opening.z) + 3.4, opening.z), q, sv.set(2.4, 0.8, 1.2)));
  // the corals along its back wall: branches that glow, pink, turquoise, violet
  const side = { x: Math.cos(GROTTO.face), z: -Math.sin(GROTTO.face) };
  const corals: [number, number, string][] = [[-1.5, -0.2, '#ff7fb8'], [-0.8, -1.2, '#5fe0e6'], [0.9, -1.1, '#b48cff'], [1.6, -0.1, '#ff9f6b'], [0, -1.9, '#7fffd0']];
  corals.forEach(([s, b, c], i) => {
    const x = GROTTO.x + side.x * s - Math.sin(GROTTO.face) * -b, z = GROTTO.z + side.z * s - Math.cos(GROTTO.face) * -b, y = height(x, z);
    for (let j = 0; j < 3; j++) {
      const lean = (j - 1) * 0.35 + i * 0.2;
      p.add(new THREE.ConeGeometry(0.12, 1.1 + j * 0.25, 5).translate(0, 0.55 + j * 0.12, 0).rotateZ(lean).rotateY(i + j), c, 0.75, m4.makeTranslation(x, y, z));
    }
  });
  // the open shell on its back, its pearl
  const py = height(pearl.x, pearl.z);
  p.add(echoShellGeometry().scale(0.7, 0.7, 0.7).rotateX(-1.25), '#f3e6f0', 0.3, m4.makeRotationY(GROTTO.face).setPosition(pearl.x, py + 0.05, pearl.z), true);
  p.add(new THREE.SphereGeometry(0.2, 10, 8), '#fff8fd', 1, m4.makeTranslation(pearl.x, py + 0.32, pearl.z));
  return p.geometry();
}
/** A blade of the curtain: a narrow ribbon 2.8 m high, its foot at the origin, a little curved; seen from both sides. */
export function weedGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.3, 2.8, 1, 6).translate(0, 1.4, 0);
  const a = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) { const y = a.getY(i); a.setZ(i, Math.sin((y / 2.8) * Math.PI) * 0.18); a.setX(i, a.getX(i) * (1 - (y / 2.8) * 0.5)); }
  g.computeVertexNormals();
  return g;
}

// ---------- the shapes ----------

/** A rock turned on a lathe: its flat top `r` at `h`, its side by `side(f)` (0 at the top's rim, 1 at its foot). */
function lathe(r: number, h: number, foot: number, steps: number, seg: number, side: (f: number) => number): THREE.BufferGeometry {
  const pts = [new THREE.Vector2(0, h)];
  for (let i = 0; i <= steps; i++) { const f = i / steps; pts.push(new THREE.Vector2(r + (foot - r) * f, side(f))); }
  pts.push(new THREE.Vector2(foot * 0.9, -0.6));
  // from the foot up: the faces turned out (top-down they faced in, and the rocks were drawn black)
  return new THREE.LatheGeometry(pts.reverse(), seg);
}
/** The lift's pillar and the lookout's mound, one geometry painted by Paint (their positions in it). */
export function rocksGeometry(): THREE.BufferGeometry {
  const p = new Paint();
  const liftFloor = height(LIFT_ROCK.x, LIFT_ROCK.z), lookFloor = height(LOOKOUT.x, LOOKOUT.z);
  // the pillar: a cliff a little wider at its foot
  p.add(lathe(LIFT_ROCK.r, LIFT_ROCK.h, LIFT_ROCK.r + 0.5, 3, 9, (f) => LIFT_ROCK.h * (1 - f)), '#8f9aa3', 0,
    new THREE.Matrix4().makeTranslation(LIFT_ROCK.x, liftFloor, LIFT_ROCK.z));
  // the mound: its side the cosine of terrain.ts support, so that she swims along what is drawn
  p.add(lathe(LOOKOUT.r, LOOKOUT.h, LOOKOUT.r + LOOKOUT.slope, 6, 11, (f) => LOOKOUT.h * 0.5 * (1 + Math.cos(Math.PI * f))), '#8a979e', 0,
    new THREE.Matrix4().makeTranslation(LOOKOUT.x, lookFloor, LOOKOUT.z));
  return p.geometry();
}
/** The whale: a long blue-grey body with a pale belly and a fin each side; its tail apart (it waves). Origin: its middle, nose to +z. */
export function whaleGeometry(): { body: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  const body = new Paint()
    .add(new THREE.SphereGeometry(1, 10, 6).scale(1.5, 1.25, 5), '#5f87a6')
    .add(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45).scale(1.35, 1.2, 4.6), '#d8e6ec')
    .add(new THREE.ConeGeometry(0.5, 2, 4).scale(1, 1, 0.3).rotateZ(Math.PI / 2 + 0.5).translate(1.9, -0.5, 1.2), '#557c9a')
    .add(new THREE.ConeGeometry(0.5, 2, 4).scale(1, 1, 0.3).rotateZ(-Math.PI / 2 - 0.5).translate(-1.9, -0.5, 1.2), '#557c9a')
    .add(new THREE.SphereGeometry(0.16, 6, 4).translate(1.05, 0.35, 3.1), '#20303a')
    .add(new THREE.SphereGeometry(0.16, 6, 4).translate(-1.05, 0.35, 3.1), '#20303a');
  // the tail: a narrowing stock and two flukes; its origin where it joins the body
  const tail = new Paint()
    .add(new THREE.CylinderGeometry(0.75, 0.35, 2.4, 8).rotateX(Math.PI / 2).translate(0, 0, -1.2), '#5f87a6')
    .add(new THREE.SphereGeometry(1, 6, 3).scale(1.8, 0.12, 0.7).translate(1.2, 0, -2.6), '#557c9a')
    .add(new THREE.SphereGeometry(1, 6, 3).scale(1.8, 0.12, 0.7).translate(-1.2, 0, -2.6), '#557c9a');
  return { body: body.geometry(), tail: tail.geometry() };
}

// ---------- the sea's secrets in the scene ----------

export interface SeaSecrets {
  readonly spots: readonly Spot[];
  /** Where each is found: the items of the world description (./index.ts). */
  readonly at: Readonly<Record<SeaSecret, { x: number; z: number }>>;
  /** The secrets not found yet, where they are (the glow potion twinkles them). */
  glimmer(): THREE.Vector3[];
  /** A tap on a shell while she is near them (true - the tap is spent). */
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  /** The walkthrough's right move by a secret she is at: '' - none here. */
  cheat(): string;
  /** Whether a secret is going on (the lift carrying her, the shells' tune, the whale passing). */
  active(id: SeaSecret): boolean;
  update(dt: number, time: number, canMove: boolean): void;
  /** What the pictures and the measurements read. */
  readonly debug: { grotto: ReturnType<typeof grottoOf>; lift: ReturnType<typeof liftOf>; shells: ReturnType<typeof shellsOf>; lookout: { x: number; z: number; top: number }; chestFront: { x: number; z: number }; chest: { x: number; z: number }; whale: () => THREE.Vector3 | null; showWhale: () => void };
}

export function createSeaSecrets(g: Game, scope: WorldScope, o: { chest: Actor }): SeaSecrets {
  const { scene, ws, hero } = g;
  const found = (flag: SeaSecret) => ws.flags[flag] === true;
  /** The cat's word of a find: after the line that sounds now, not over it (a hint over another line is turned away). */
  const tell = (key: 'sea_secret_chest' | 'sea_secret_lift' | 'sea_secret_shells' | 'sea_secret_whale' | 'sea_secret_grotto') => {
    let waited = 0;
    const tryNow = () => {
      if (!speaking()) { void g.speech.line(key, 'hint', 5000); return; }
      if ((waited += 0.25) < WORD_WAIT) scope.timeout(tryNow, 250);
    };
    tryNow();
  };
  // the stars of the chest and of every other secret, as the forest's; literal numbers, so that
  // src/game/no-penalties.test.ts reads them as positive (LEARN-14)
  const give = (flag: SeaSecret, chest: boolean, at: THREE.Vector3) => {
    ws.flags[flag] = true;
    g.addStars(chest ? 5 : 3, g.above(at, 1.2));
    g.persist();
  };
  const hp = hero.root.position;
  const here = (p: { x: number; z: number }, r: number) => Math.hypot(hp.x - p.x, hp.z - p.z) < r;
  const v3 = (p: { x: number; z: number }, y = height(p.x, p.z)) => new THREE.Vector3(p.x, y, p.z);
  scope.own(() => { tops.length = 0; });

  // ---------- the rocks: seen from everywhere, one mesh ----------
  const rocks = new THREE.Mesh(rocksGeometry(), paintMaterial());
  rocks.name = 'secret-rocks'; rocks.castShadow = false; rocks.receiveShadow = true;
  scene.add(rocks);

  // ---------- the chest ----------
  const chest = o.chest;
  const cr = chest.root.rotation.y, cp = chest.root.position;
  const chestFront = v3({ x: cp.x + Math.sin(cr) * 1.3, z: cp.z + Math.cos(cr) * 1.3 });
  if (found(CHEST_FLAG)) chest.pose('Chest_Open');
  function openChest() {
    if (found(CHEST_FLAG)) return;
    chest.once('Chest_Open', 'Chest_Open');
    sfx('good');
    give(CHEST_FLAG, true, cp);
    tell('sea_secret_chest');
  }

  // ---------- the bubble lift ----------
  const lift = liftOf();
  tops.push({ x: LIFT_ROCK.x, z: LIFT_ROCK.z, r: LIFT_ROCK.r, top: lift.top, slope: 0 });
  // the pillar stops her below its top; over it she swims free
  colliders.push({ x: LIFT_ROCK.x, z: LIFT_ROCK.z, r: LIFT_ROCK.r + 0.2, under: lift.top - 0.3 });
  const star = new THREE.Mesh(starGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: '#ff9ec4', emissiveIntensity: 0.7, roughness: 0.5 }));
  star.name = 'secret-starfish'; star.scale.setScalar(2.4); star.castShadow = false;
  star.position.set(lift.star.x, lift.top + 0.12, lift.star.z);
  star.visible = !found(LIFT_FLAG);
  scene.add(star);
  let lifting = -1, sinkY: number | null = null, liftTold = false;
  const liftFrom = new THREE.Vector3(), wasAt = hp.clone();

  // ---------- the echo shells ----------
  const sh = shellsOf();
  const SHELL_COLOURS = ['#ff8fbf', '#6fdcff', '#c3a2ff'].map((c) => new THREE.Color(c));
  const shells = new THREE.InstancedMesh(echoShellGeometry(), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.22, flatShading: true, side: THREE.DoubleSide }), 3);
  shells.name = 'secret-shells'; shells.castShadow = false; shells.frustumCulled = false;
  const shellAt = sh.at.map((p) => v3(p));
  const shellMiddle = shellAt.map((p) => p.clone().setY(p.y + SHELL_SIZE * 0.6));
  sh.at.forEach((p) => colliders.push({ x: p.x, z: p.z, r: 0.8 }));
  scene.add(shells);
  let song = restShells(), tuneNote = -1, shellsTold = false;
  const flash = [0, 0, 0];
  const sing = (i: number) => { note(SHELL_NOTES[i]); flash[i] = 1; g.sparks.burst(shellMiddle[i], `#${SHELL_COLOURS[i].getHexString()}`, 8, 1); };
  function touch(i: number) {
    const before = song;
    song = touchShell(song, i);
    if (song === before) return;
    sing(i);
    if (song.tune >= 0) tuneNote = -1;
  }
  const shellsFront = v3(sh.front);

  // ---------- the whale ----------
  const wh = whaleOf();
  tops.push({ x: LOOKOUT.x, z: LOOKOUT.z, r: LOOKOUT.r, top: wh.top, slope: LOOKOUT.slope });
  const wg = whaleGeometry();
  const whale = new THREE.Group();
  whale.name = 'secret-whale';
  const whaleBody = new THREE.Mesh(wg.body, paintMaterial()), whaleTail = new THREE.Mesh(wg.tail, paintMaterial());
  whaleTail.position.z = -4.4;
  whale.add(whaleBody, whaleTail);
  whale.scale.setScalar(1.3);
  whale.visible = false;
  scene.add(whale);
  let standing = 0, whaleT = -1, whaleTold = false;
  const lookTop = v3(LOOKOUT, wh.top);
  const onLookout = () => here(LOOKOUT, LOOKOUT.r + 0.3) && hp.y > wh.top - 0.2;

  // ---------- the grotto behind the seaweed ----------
  const gr = grottoOf();
  grottoRocks().forEach((k) => colliders.push({ x: k.x, z: k.z, r: k.r * 0.9 }));
  const grotto = new THREE.Mesh(grottoGeometry(), paintMaterial());
  grotto.name = 'secret-grotto'; grotto.castShadow = false; grotto.receiveShadow = true;
  scene.add(grotto);
  const weeds = new THREE.InstancedMesh(weedGeometry(), new THREE.MeshStandardMaterial({ color: '#3f9c5c', roughness: 0.8, side: THREE.DoubleSide, emissive: '#1d4d2c', emissiveIntensity: 0.25 }), WEEDS);
  weeds.name = 'secret-weeds'; weeds.castShadow = false; weeds.frustumCulled = false;
  scene.add(weeds);
  const weedFeet = gr.weeds.map((w) => v3(w));
  const pearlAt = v3(gr.pearl);
  let grottoCam = false;      // the camera's distance is the grotto's now
  scope.own(() => { if (grottoCam) { g.camOverride = null; g.camPitchMin = null; } });
  /** The grotto's camera, by where she stands; never over a distance another rule has set. */
  function grottoCamera(d: number) {
    if (!grottoCam && g.camOverride !== null) return;
    if (d >= GROTTO_CAM_OUT) { if (grottoCam) { g.camOverride = null; g.camPitchMin = null; grottoCam = false; } return; }
    g.camOverride = grottoCamDist(d, camDistance(g.camera.aspect)); grottoCam = true;
    g.camPitchMin = d < GROTTO_R ? GROTTO_PITCH : null;
  }
  const wm4 = new THREE.Matrix4(), wq = new THREE.Quaternion(), wone = new THREE.Vector3(1, 1, 1), weul = new THREE.Euler(0, 0, 0, 'YXZ');

  const spots: Spot[] = [
    { pos: chestFront, r: 2, label: 'open', on: () => !found(CHEST_FLAG), run: openChest },
    // the shells' action: they sing their notes one after another - the child hears them, then touches them herself
    { pos: shellsFront, r: 2.6, label: 'sea_listen', on: () => song.tune < 0 && song.sung.every((x) => !x), run: () => { [0, 1, 2].forEach((i) => scope.timeout(() => { note(SHELL_NOTES[i]); flash[i] = 1; }, 400 * i)); } },
  ];

  return {
    spots,
    at: { ship_chest: { x: chestFront.x, z: chestFront.z }, bubble_lift: { ...lift.column }, echo_shells: { ...sh.front }, whale: { x: LOOKOUT.x, z: LOOKOUT.z }, sea_grotto: { ...gr.pearl } },
    glimmer: () => [
      ...(found(CHEST_FLAG) ? [] : [chestFront]),
      ...(found(LIFT_FLAG) ? [] : [star.position]),
      ...(found(SHELLS_FLAG) ? [] : [shellsFront]),
      ...(found(WHALE_FLAG) ? [] : [lookTop]),
      ...(found(GROTTO_FLAG) ? [] : [pearlAt]),
    ],
    tap(screenDist) {
      if (g.busy || !here(sh.front, 10) || song.tune >= 0) return false;
      let best = -1, bestD = g.touch ? 64 : 44;
      shellMiddle.forEach((p, i) => { const d = screenDist(p); if (d < bestD) { best = i; bestD = d; } });
      if (best < 0) return false;
      touch(best);
      return true;
    },
    cheat() {
      if (!found(LIFT_FLAG) && hp.y > lift.top && here(LIFT_ROCK, LIFT_ROCK.r + 0.5)) { hp.set(lift.star.x, lift.top + SWIM, lift.star.z); return 'lift'; }
      if (!found(WHALE_FLAG) && here(LOOKOUT, LOOKOUT.r + LOOKOUT.slope) && !onLookout()) { hp.set(LOOKOUT.x, wh.top + SWIM, LOOKOUT.z); return 'lookout'; }
      if (!found(SHELLS_FLAG) && here(sh.front, 6)) {
        if (song.tune >= 0) return 'shells';
        const i = song.sung.indexOf(false);
        if (i >= 0) { touch(i); return 'shells'; }
      }
      return '';
    },
    active: (id) => (id === LIFT_FLAG ? lifting >= 0 : id === SHELLS_FLAG ? song.tune >= 0 : id === WHALE_FLAG ? whale.visible : false),
    update(dt, time, canMove) {
      // ----- the grotto: its camera, the curtain swaying and parting round her, the shell found
      const dg = Math.hypot(hp.x - GROTTO.x, hp.z - GROTTO.z);
      grotto.visible = dg < GROTTO_SEEN;
      grottoCamera(dg);
      weeds.visible = dg < SHOW_R;
      if (weeds.visible) {
        weedFeet.forEach((f, i) => {
          const dx = f.x - hp.x, dz = f.z - hp.z, d = Math.hypot(dx, dz);
          // leant away from her while she is near it, else swaying with the water
          const part = d < WEED_PART ? (1 - d / WEED_PART) * 1.1 : 0;
          const sway = Math.sin(time * 1.3 + i * 0.7) * 0.12;
          weul.set(sway + part, d > 1e-3 ? Math.atan2(dx, dz) : GROTTO.face, 0);
          wm4.compose(f, wq.setFromEuler(weul), wone);
          weeds.setMatrixAt(i, wm4);
        });
        weeds.instanceMatrix.needsUpdate = true;
      }
      if (!found(GROTTO_FLAG) && canMove && here(gr.pearl, FIND_R)) {
        sfx('chime');
        g.sparks.burst(pearlAt.clone().setY(pearlAt.y + 0.6), '#fff0fa', 30, 3);
        give(GROTTO_FLAG, false, pearlAt);
        tell('sea_secret_grotto');
      }

      // ----- the lift: the column takes her, carries her up; off a top she sinks back (the frame put her on the floor)
      // taken away from the column while it carries her (a teleport, a scene): the lift lets her go
      if (lifting >= 0 && Math.hypot(hp.x - wasAt.x, hp.z - wasAt.z) > 1) lifting = -1;
      if (lifting >= 0) {
        lifting += dt;
        liftAt(lifting, liftFrom, hp);
        if (lifting >= LIFT_S) { lifting = -1; hp.y = lift.top + SWIM; }
      } else if (canMove && hp.y < lift.top && here(lift.column, LIFT_R)) {
        lifting = 0; sinkY = null; liftFrom.copy(hp);
        sfx('soft');
        if (!liftTold && !found(LIFT_FLAG)) { liftTold = true; tell('sea_secret_lift'); }
      } else {
        // the frame keeps her SWIM over what is under her: off a top's cliff that is the floor at once - she sinks to it
        const drop = wasAt.y - hp.y;
        if (sinkY === null && drop > 1.2 && Math.hypot(hp.x - wasAt.x, hp.z - wasAt.z) < 1) sinkY = wasAt.y;
        if (sinkY !== null) {
          sinkY -= SINK_SPEED * dt;
          if (sinkY <= hp.y) sinkY = null; else hp.y = sinkY;
        }
      }
      wasAt.copy(hp);
      if (star.visible) {
        star.rotation.y = time * 0.9;
        star.position.y = lift.top + 0.15 + Math.sin(time * 2) * 0.06;
        star.visible = here(LIFT_ROCK, SHOW_R);
        if (canMove && lifting < 0 && hp.y > lift.top && here(lift.star, 0.9)) {
          star.visible = false;
          sfx('chime');
          g.sparks.burst(star.position.clone().setY(lift.top + 0.5), '#ffc4dc', 30, 3);
          give(LIFT_FLAG, false, star.position);
        }
      } else if (!found(LIFT_FLAG)) star.visible = here(LIFT_ROCK, SHOW_R);

      // ----- the shells: their flashes, the tune once all three have sung
      shells.visible = here(sh.front, SHOW_R);
      if (!shellsTold && !found(SHELLS_FLAG) && here(sh.front, 6)) { shellsTold = true; tell('sea_secret_shells'); }
      if (song.tune >= 0) {
        song.tune += dt;
        const k = Math.floor((song.tune - TUNE_PAUSE) / TUNE_STEP);
        if (song.tune >= TUNE_PAUSE && k !== tuneNote && k < TUNE.length) { tuneNote = k; sing(TUNE[k]); }
        if (song.tune >= tuneSeconds() + 0.4) {
          song = restShells();
          if (!found(SHELLS_FLAG)) { sfx('good'); give(SHELLS_FLAG, false, shellsFront); }
        }
      } else if (song.sung.some(Boolean) && !here(sh.front, 12)) song = restShells();   // she went away: they wait anew
      if (shells.visible) {
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
        for (let i = 0; i < 3; i++) {
          flash[i] = Math.max(0, flash[i] - dt * 2.2);
          const k = SHELL_SIZE * (1 + flash[i] * 0.22 + Math.sin(time * 1.7 + i * 2) * 0.02);
          // standing on their hinges, leant back a little, their faces toward where she listens from
          q.setFromEuler(new THREE.Euler(-0.2, Math.atan2(sh.front.x - sh.at[i].x, sh.front.z - sh.at[i].z), 0, 'YXZ'));
          shells.setMatrixAt(i, m4.compose(shellAt[i], q, s.setScalar(k)));
          shells.setColorAt(i, c.copy(SHELL_COLOURS[i]).lerp(new THREE.Color('#ffffff'), flash[i] * 0.7 + (song.sung[i] ? 0.15 : 0)));
        }
        shells.instanceMatrix.needsUpdate = true;
        if (shells.instanceColor) shells.instanceColor.needsUpdate = true;
      }

      // ----- the whale: on the lookout's top a while, it passes; the stars the first time
      if (whaleT < 0) {
        standing = canMove && onLookout() ? standing + dt : 0;
        if (standing >= WHALE_WAIT) {
          whaleT = 0; standing = 0;
          if (!found(WHALE_FLAG)) { give(WHALE_FLAG, false, lookTop); if (!whaleTold) { whaleTold = true; tell('sea_secret_whale'); } }
        }
      }
      if (whaleT >= 0) {
        whaleT += dt;
        const w = whaleAt(whaleT);
        whale.visible = w !== null;
        if (w) { whale.position.copy(w.pos); whale.rotation.y = w.yaw; whaleTail.rotation.x = w.tail; whaleBody.rotation.x = -w.tail * 0.12; }
        // it comes again only after she has left the top
        else if (!onLookout()) whaleT = -1;
      }
    },
    debug: {
      grotto: gr, lift, shells: sh, lookout: { x: LOOKOUT.x, z: LOOKOUT.z, top: wh.top }, chestFront: { x: chestFront.x, z: chestFront.z }, chest: { x: cp.x, z: cp.z },
      whale: () => (whale.visible ? whale.position : null),
      showWhale: () => { whaleT = 0; },
    },
  };
}

/** One geometry of all: merged and painted (the tests count the triangles of the secrets' shapes). */
export function secretTriangles(): number {
  const w = whaleGeometry();
  const g = mergeGeometries([rocksGeometry(), w.body, w.tail].map((x) => { const y = x.clone(); for (const k of Object.keys(y.attributes)) if (k !== 'position') y.deleteAttribute(k); return y; }))!;
  return g.getAttribute('position').count / 3;
}
