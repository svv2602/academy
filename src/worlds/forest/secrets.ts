import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rig } from '../../core/assets';
import { note, sfx, speaking } from '../../core/audio';
import { mat } from '../../core/style';
import { GRAVITY, camDistance } from '../../core/tuning';
import { Actor, shadowFromBody } from '../../game/actor';
import type { Game } from '../../game/context';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { left } from '../../game/supplies';
import { CAVE, FAIRY_RING, ROOTS, SONG_TREE, ZONES } from './layout';
import { FIND_R, ROOTLET_TOP, ROOTS_CAM_OUT, ROOTS_PITCH, ROOTS_R, glowGeometry, rootletGeometry, rootletSwing, rootsCamDist, rootsGeometry, rootsLumps, rootsOf, rootsTree } from './roots';
import { HOUSE_STEM_TOP, villageHouses } from './scenery';
import { colliders, height, tops } from './terrain';

/**
 * The secrets of the Enchanted Forest (PLAY-10, docs/worlds/world-2.md «Секреты»): optional, not needed by the story,
 * each found once - its flag in the world's part of the save (the names of WorldDef.secrets and of the items of the
 * world description), its stars and the cat's word the first time; coming back gives nothing again. The Great Tree
 * hangs a keepsake for each (src/worlds/hub/keepsakes.ts reads the flags).
 *
 * - cave: the cave behind the little waterfall on the stream - a mound of rocks open to the stream behind a curtain of
 *   falling water; the chest inside (the world's chest, PLAY-08) gives 5 stars, every other secret 3.
 * - bounce: the mushroom trampoline in the gnomes' village - landing on its cap throws her up high enough to come down
 *   on the roof of the house beside it; on the roof the gnomes' lantern is the find.
 * - fireflies: the hollow of the singing fireflies - three of them sing one after another, each its note; touched in
 *   the same order they sing the whole tune. A wrong touch is no mistake: they only sing their order again.
 * - roots: the cave under the roots of a fallen tree (./roots.ts) - a curtain of rootlets parts round her, glowing
 *   mushrooms inside; walking up to the glowing stone at its back is the find.
 * - ring: the ring of fairy mushrooms - in its middle she is tiny for RING_SECONDS (the funny potion's size, PLAY-26:
 *   the camera and her radius follow it), sparkles round her, the cat laughs; her controls stay hers. Every time she
 *   steps in; the stars and the word the first time.
 *
 * Each is drawn only within SHOW_R of her: the forest's frame is close to its budget of draw calls (TECH-06).
 */
export const CAVE_FLAG = 'cave', BOUNCE_FLAG = 'bounce', SONG_FLAG = 'fireflies', RING_FLAG = 'ring', ROOTS_FLAG = 'roots';
export const FOREST_SECRETS = [CAVE_FLAG, BOUNCE_FLAG, SONG_FLAG, RING_FLAG, ROOTS_FLAG] as const;
/** m: a secret is drawn while she is this near it. */
export const SHOW_R = 22;
/** s: the cat's word of a find waits this long at most for the line that sounds to end (else it is not said). */
export const WORD_WAIT = 8;
/** s: how long the ring keeps her tiny. */
export const RING_SECONDS = 5.5;

// ---------- the house's roof and the trampoline ----------

/** The house of the village's mushroom houses (./village.ts mushroomHouse(3.6, 1.2)): its cap's dome. */
const CAP = { base: HOUSE_STEM_TOP - 0.35, h: 3.6 - HOUSE_STEM_TOP + 0.35, r: 1.2 * 1.95 };
/** m from the house's middle: where the roof can be stood on (its dome still shallow there). */
export const ROOF_R = 1.5;
/** m over the ground under the house: the roof's height `d` m from its middle. */
export const roofHeight = (d: number): number => CAP.base + CAP.h * Math.sqrt(Math.max(0, 1 - (d / CAP.r) ** 2));
/** The trampoline: its cap's radius and height, m, and how far from the house's middle it stands (clear of its cap). */
export const TRAMPOLINE = { r: 0.75, top: 0.7, out: 3.4 };
/** m: how much higher than the top of the roof the trampoline throws her. */
export const OVER_ROOF = 0.8;
/** m/s: the speed a landing on the trampoline throws her up at - the top of the roof and OVER_ROOF from its cap. */
export const SPRING = Math.sqrt(2 * GRAVITY * (roofHeight(0) + OVER_ROOF - TRAMPOLINE.top));

/**
 * The house of the trampoline and where it stands: the house farthest from the paths' ways in and the elder (the first
 * of villageHouses), the trampoline beside it, along the ring of houses (not in front of its door: the middle of the
 * village is the elder's).
 */
export function trampolineOf(houses = villageHouses()): { house: { x: number; z: number }; at: { x: number; z: number } } {
  const house = houses[0];
  const ox = house.x - ZONES.village.x, oz = house.z - ZONES.village.z, o = Math.hypot(ox, oz) || 1;
  // along the ring: turned a quarter from the way out of the middle
  return { house: { x: house.x, z: house.z }, at: { x: house.x - (oz / o) * TRAMPOLINE.out, z: house.z + (ox / o) * TRAMPOLINE.out } };
}

// ---------- the song of the fireflies ----------

/** The notes of the three fireflies, Hz (C5, E5, G5), and the tune all three sing when touched in their order. */
export const SONG_NOTES = [523.25, 659.25, 783.99] as const;
export const TUNE = [0, 1, 2, 1, 0, 2] as const;
/** s: a firefly sings its note this long, then this long a pause before the next. */
export const SING_S = 0.55, GAP_S = 0.25;

/** The state of the song: the order they sing in, how many of it were touched right, and what is going on. */
export interface Song { order: number[]; got: number; phase: 'rest' | 'show' | 'wait' | 'tune'; t: number }
export const restSong = (): Song => ({ order: [0, 1, 2], got: 0, phase: 'rest', t: 0 });
/** The fireflies begin: a new order of the three by `rng`, sung to her one by one. */
export function startSong(rng: () => number): Song {
  const order = [0, 1, 2];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { order, got: 0, phase: 'show', t: 0 };
}
/**
 * A touch of firefly `i` while they wait for her: the next of their order - one more right, the whole order - the
 * tune; another - they sing their order again (no mistake, nothing lost). Not waiting: nothing.
 */
export function touchSong(s: Song, i: number): Song {
  if (s.phase !== 'wait') return s;
  if (s.order[s.got] !== i) return { ...s, got: 0, phase: 'show', t: 0 };
  const got = s.got + 1;
  return got === s.order.length ? { ...s, got, phase: 'tune', t: 0 } : { ...s, got };
}
/** s: the show of the order lasts this long. */
export const showSeconds = (s: Song): number => s.order.length * (SING_S + GAP_S);
/** Which firefly sings at `t` s into the show, null in a pause. */
export function singingAt(s: Song, t: number): number | null {
  const k = Math.floor(t / (SING_S + GAP_S));
  return k < s.order.length && t - k * (SING_S + GAP_S) < SING_S ? s.order[k] : null;
}

// ---------- the forest's secrets in the scene ----------

export interface ForestSecrets {
  readonly spots: readonly Spot[];
  /** Where each is found: the items of the world description (src/worlds/forest/index.ts). */
  readonly at: Readonly<Record<(typeof FOREST_SECRETS)[number], { x: number; z: number }>>;
  /** The secrets not found yet, where they are (the glow potion twinkles them). */
  glimmer(): THREE.Vector3[];
  /** A tap on a firefly of the hollow while they wait for her (true - the tap is spent). */
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  /** The walkthrough's right move by a secret she stands at: '' - none here. */
  cheat(): string;
  update(dt: number, time: number, canMove: boolean): void;
  /** The chest's clip, with the rest of the world's. */
  animate(dt: number): void;
  /** What the walkthrough reads: the song's state, the trampoline and the roof. */
  readonly debug: { song(): Song; trampoline: { x: number; z: number }; roof: { x: number; z: number; y: number }; chest: { x: number; z: number }; roots: ReturnType<typeof rootsOf> };
}

/** One geometry of vertex colours: each part painted its colour. */
function painted(parts: readonly [THREE.BufferGeometry, string][]): THREE.BufferGeometry {
  const c = new THREE.Color();
  const geos = parts.map(([g, col]) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    c.set(col);
    const k = n.attributes.position.count, a = new Float32Array(k * 3);
    for (let i = 0; i < k; i++) a.set([c.r, c.g, c.b], i * 3);
    n.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return n;
  });
  return mergeGeometries(geos)!;
}
const colourMat = (o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, ...o });

/** A curtain of falling water (as the first world's glade): stripes that run down, never fully opaque. */
function waterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main() {
        float s = sin(vUv.x * 41.0 + sin(vUv.x * 13.0) * 2.0) * 0.5 + 0.5;
        float run = fract(vUv.y * 3.0 + uTime * 1.6 + s * 0.35);
        float streak = smoothstep(0.0, 0.25, run) * (1.0 - smoothstep(0.55, 1.0, run));
        vec3 col = mix(vec3(0.55, 0.82, 0.98), vec3(0.95, 0.99, 1.0), streak * 0.8 + (1.0 - vUv.y) * 0.25);
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        gl_FragColor = vec4(col, (0.55 + streak * 0.3) * edge);
      }`,
  });
}

/** The cave's mound: rocks in a horseshoe round its middle, open to `face`, with the lintel over the opening. */
export function caveRocks(): { x: number; z: number; r: number; h: number; spin: number }[] {
  const out: { x: number; z: number; r: number; h: number; spin: number }[] = [];
  const R = 3.1, N = 11;
  for (let i = 0; i < N; i++) {
    // from the opening's one side round the back to its other: the opening is 70° wide
    const a = CAVE.face + 0.62 + (i / (N - 1)) * (Math.PI * 2 - 1.24);
    out.push({ x: CAVE.x + Math.sin(a) * R, z: CAVE.z + Math.cos(a) * R, r: 1.25 + (i % 3) * 0.2, h: 2.6 + (i % 2) * 0.6, spin: i * 1.7 });
  }
  return out;
}
/**
 * m from the cave's middle: the opening (behind the curtain), and the chest at the back - turned CHEST_SIDE off the
 * way in: straight ahead it stood behind her with the camera at her back, and she hid what she opens.
 */
const OPENING = 3.1, CHEST_BACK = 1.4, CHEST_SIDE = 0.65;
/**
 * The camera in the cave, m from her: the usual one stood outside its rocks and showed them, not her and the chest. By
 * where she stands, as the first world's glade: CAVE_CAM inside CAVE_CAM_IN m of the middle, the usual distance from
 * CAVE_CAM_OUT m on, a smooth step between - walking through the curtain it moves with her steps, never jumps.
 */
export const CAVE_CAM = 2.2, CAVE_CAM_IN = 2.0, CAVE_CAM_OUT = 5.2;
/** Inside the cave the camera looks down this steeply (rad, src/game/camera.ts camPitchMin): the chest over her head. */
export const CAVE_PITCH = 1.0;
export function caveCamDist(d: number, far: number): number {
  const k = Math.min(1, Math.max(0, (d - CAVE_CAM_IN) / (CAVE_CAM_OUT - CAVE_CAM_IN)));
  return CAVE_CAM + (far - CAVE_CAM) * k * k * (3 - 2 * k);
}

export function createForestSecrets(g: Game, scope: WorldScope, chestRig: Rig): ForestSecrets {
  const { scene, ws, save, hero } = g;
  const { line } = g.speech;
  const groundY = height;
  const found = (flag: string) => ws.flags[flag] === true;
  /** The cat's word of a find: after the line that sounds now, not over it (a hint over another line is turned away). */
  const tell = (key: Parameters<typeof line>[0]) => {
    let waited = 0;
    const tryNow = () => {
      if (!speaking()) { void line(key, 'hint', 5000); return; }
      if ((waited += 0.25) < WORD_WAIT) scope.timeout(tryNow, 250);
    };
    tryNow();
  };
  // the stars of the chest and of every other secret, as the first world's; literal numbers, so that
  // src/game/no-penalties.test.ts reads them as positive (LEARN-14)
  const give = (flag: string, chest: boolean, at: THREE.Vector3) => {
    ws.flags[flag] = true;
    g.addStars(chest ? 5 : 3, g.above(at, 1.2));
    g.persist();
  };

  // ---------- the cave behind the waterfall ----------
  const cave = new THREE.Group();
  cave.name = 'secret-cave';
  const fx = Math.sin(CAVE.face), fz = Math.cos(CAVE.face);
  const rockList = caveRocks();
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat.stone(), rockList.length + 1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  rockList.forEach((k, i) => {
    q.setFromEuler(new THREE.Euler(0, k.spin, 0.2 * Math.sin(k.spin * 3)));
    rocks.setMatrixAt(i, m4.compose(pv.set(k.x, groundY(k.x, k.z) + k.h * 0.45, k.z), q, sv.set(k.r, k.h, k.r)));
    colliders.push({ x: k.x, z: k.z, r: k.r * 0.9 });
  });
  const ex = CAVE.x + fx * OPENING, ez = CAVE.z + fz * OPENING, ey = groundY(ex, ez);
  q.setFromEuler(new THREE.Euler(0, CAVE.face, 0));
  rocks.setMatrixAt(rockList.length, m4.compose(pv.set(ex, ey + 3.3, ez), q, sv.set(2.3, 0.8, 1.2)));
  rocks.castShadow = true; rocks.receiveShadow = true;
  rocks.computeBoundingSphere();
  cave.add(rocks);
  const water = waterMaterial();
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.1), water);
  curtain.position.set(ex, ey + 1.55, ez); curtain.rotation.y = CAVE.face;
  curtain.renderOrder = 3;
  cave.add(curtain);
  const chest = new Actor(chestRig);
  shadowFromBody(chest.root);
  const cx = CAVE.x - Math.sin(CAVE.face + CHEST_SIDE) * CHEST_BACK, cz = CAVE.z - Math.cos(CAVE.face + CHEST_SIDE) * CHEST_BACK;
  chest.root.position.set(cx, groundY(cx, cz), cz);
  // its lid to the middle of the cave, where she comes from
  const toMiddle = Math.atan2(CAVE.x - cx, CAVE.z - cz);
  chest.root.rotation.y = toMiddle;
  colliders.push({ x: cx, z: cz, r: 0.6 });
  if (found(CAVE_FLAG)) chest.pose('Chest_Open');
  let caveCam = false;     // the camera's distance is the cave's now
  scope.own(() => { if (caveCam) { g.camOverride = null; g.camPitchMin = null; } });
  /** The cave's camera: by where she stands; never over a distance another rule has set. */
  function caveCamera(d: number) {
    if (!caveCam && g.camOverride !== null) return;
    if (d >= CAVE_CAM_OUT) { if (caveCam) { g.camOverride = null; g.camPitchMin = null; caveCam = false; } return; }
    g.camOverride = caveCamDist(d, camDistance(g.camera.aspect)); caveCam = true;
    // past the curtain it looks down over her head (eased by the camera itself)
    g.camPitchMin = d < OPENING ? CAVE_PITCH : null;
  }
  cave.add(chest.root);
  scene.add(cave);
  const ox = Math.sin(toMiddle) * 1.3, oz = Math.cos(toMiddle) * 1.3;
  const chestFront = new THREE.Vector3(cx + ox, groundY(cx + ox, cz + oz), cz + oz);
  function openChest() {
    if (found(CAVE_FLAG)) return;
    chest.once('Chest_Open', 'Chest_Open');
    sfx('good');
    give(CAVE_FLAG, true, chest.root.position);
    tell('forest_secret_cave');
  }

  // ---------- the trampoline and the roof ----------
  const { house, at: tAt } = trampolineOf();
  const houseY = groundY(house.x, house.z), tY = groundY(tAt.x, tAt.z);
  tops.push({ x: house.x, z: house.z, r: ROOF_R, top: (d) => houseY + roofHeight(d), from: 0.6 });
  tops.push({ x: tAt.x, z: tAt.z, r: TRAMPOLINE.r, top: () => tY + TRAMPOLINE.top, from: 0.9, spring: SPRING });
  scope.own(() => { tops.length = 0; });
  const bounceLook = new THREE.Group();
  bounceLook.name = 'secret-bounce';
  // the trampoline: a white stem, a wide pink cap with pale spots; the lantern on the roof: a warm glow under a little cap
  const tramp = new THREE.Mesh(painted([
    [new THREE.CylinderGeometry(0.22, 0.3, TRAMPOLINE.top - 0.12, 9).translate(0, (TRAMPOLINE.top - 0.12) / 2, 0), '#f3ead8'],
    [new THREE.SphereGeometry(1, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(TRAMPOLINE.r, 0.22, TRAMPOLINE.r).translate(0, TRAMPOLINE.top - 0.12, 0), '#e86aa8'],
    ...[0, 2.1, 4.2].map((a): [THREE.BufferGeometry, string] => [new THREE.SphereGeometry(0.1, 6, 3).scale(1, 0.4, 1).translate(Math.sin(a) * 0.42, TRAMPOLINE.top + 0.05, Math.cos(a) * 0.42), '#fff4fa']),
  ]), colourMat());
  tramp.position.set(tAt.x, tY, tAt.z);
  tramp.castShadow = true; tramp.receiveShadow = true;
  bounceLook.add(tramp);
  const roofY = houseY + roofHeight(0);
  const lantern = new THREE.Mesh(painted([
    [new THREE.SphereGeometry(0.17, 10, 7).translate(0, 0.2, 0), '#ffd36b'],
    [new THREE.ConeGeometry(0.2, 0.16, 8).translate(0, 0.42, 0), '#8a5a3a'],
  ]), colourMat({ emissive: '#ffb53a', emissiveIntensity: 0.9 }));
  lantern.position.set(house.x, roofY, house.z);
  bounceLook.add(lantern);
  scene.add(bounceLook);
  let bounceTold = false;
  function takeLantern() {
    lantern.visible = false;
    sfx('chime');
    g.sparks.burst(lantern.position.clone().setY(roofY + 0.3), '#ffd36b', 30, 3);
    give(BOUNCE_FLAG, false, lantern.position);
  }
  lantern.visible = !found(BOUNCE_FLAG);

  // ---------- the hollow of the singing fireflies ----------
  const songLook = new THREE.Group();
  songLook.name = 'secret-fireflies';
  const sx = SONG_TREE.x, sz = SONG_TREE.z, sy = groundY(sx, sz);
  // the hollow faces the way she comes from (the path from the stream to the Ash, east of it)
  const hf = Math.atan2(ZONES.ash.x - sx, 0);
  const tree = new THREE.Mesh(painted([
    [new THREE.CylinderGeometry(0.75, 1.0, 6, 9).translate(0, 3, 0), '#6b4c34'],
    [new THREE.IcosahedronGeometry(3.2, 0).translate(0, 7.6, 0), '#46805a'],
    [new THREE.CircleGeometry(0.42, 12).translate(0, 1.5, 0.97), '#1d120a'],
  ]), colourMat());
  tree.position.set(sx, sy, sz); tree.rotation.y = hf;
  tree.castShadow = true; tree.receiveShadow = true;
  songLook.add(tree);
  colliders.push({ x: sx, z: sz, r: 1.05 });
  // the three fireflies over the hollow: one mesh; a singing one is bigger and brighter
  const FLY_COLOURS = ['#ffe36b', '#9df58a', '#8fd8ff'];
  const flies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 3);
  flies.name = 'song-flies';
  const flyAt = [0, 1, 2].map((i) => {
    const a = hf + (i - 1) * 0.55, r = 1.55;
    return new THREE.Vector3(sx + Math.sin(a) * r, sy + 1.6 + (i === 1 ? 0.35 : 0), sz + Math.cos(a) * r);
  });
  FLY_COLOURS.forEach((c, i) => flies.setColorAt(i, new THREE.Color(c)));
  flies.frustumCulled = false;
  songLook.add(flies);
  scene.add(songLook);
  const songAt = new THREE.Vector3(sx + Math.sin(hf) * 2.6, 0, sz + Math.cos(hf) * 2.6);
  songAt.y = groundY(songAt.x, songAt.z);
  let song = restSong(), sung = -1, tuneNote = -1;
  const sing = (i: number) => { note(SONG_NOTES[i]); g.sparks.burst(flyAt[i], FLY_COLOURS[i], 8, 1); };
  function begin() {
    if (song.phase !== 'rest') return;
    song = startSong(g.rng);
    sung = -1;
    if (!found(SONG_FLAG)) tell('forest_secret_fireflies');
  }
  function touch(i: number) {
    const before = song;
    song = touchSong(song, i);
    if (song === before) return;
    if (song.phase === 'show') { sung = -1; song.t = -0.6; return; }    // a pause, then their order again
    sing(i);
    if (song.phase === 'tune') tuneNote = -1;
  }

  // ---------- the ring of fairy mushrooms ----------
  const ringLook = new THREE.Group();
  ringLook.name = 'secret-ring';
  const rx = FAIRY_RING.x, rz = FAIRY_RING.z;
  const caps: [THREE.BufferGeometry, string][] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, x = Math.sin(a) * FAIRY_RING.r, z = Math.cos(a) * FAIRY_RING.r, y = groundY(rx + x, rz + z) - groundY(rx, rz);
    const s = 0.8 + (i % 3) * 0.15;
    caps.push([new THREE.CylinderGeometry(0.06 * s, 0.08 * s, 0.32 * s, 6).translate(x, y + 0.16 * s, z), '#f6efe2']);
    caps.push([new THREE.SphereGeometry(0.2 * s, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(x, y + 0.3 * s, z), i % 2 ? '#c58cff' : '#ff8fc8']);
  }
  const ring = new THREE.Mesh(painted(caps), colourMat({ emissive: '#ff9be0', emissiveIntensity: 0.25 }));
  ring.position.set(rx, groundY(rx, rz), rz);
  ring.castShadow = false; ring.receiveShadow = true;
  ringLook.add(ring);
  scene.add(ringLook);
  const ringAt = new THREE.Vector3(rx, groundY(rx, rz), rz);
  let inRing = false, sparkT = 0;
  function enterRing() {
    save.effects = { ...save.effects, tiny: Math.max(left(save, 'tiny'), RING_SECONDS) };
    sfx('good');
    g.sparks.burst(g.above(hero.root.position, 0.8), '#ff9be0', 30, 2.5);
    if (!found(RING_FLAG)) { give(RING_FLAG, false, ringAt); tell('forest_secret_ring'); }
    else g.persist();
  }

  // ---------- the cave under the roots ----------
  const ro = rootsOf(), fallen = rootsTree();
  for (const k of rootsLumps()) colliders.push({ x: k.x, z: k.z, r: k.r * 0.9 });
  colliders.push({ x: fallen.plate.x, z: fallen.plate.z, r: 0.9 });
  const rootsLook = new THREE.Group();
  rootsLook.name = 'secret-roots';
  const mound = new THREE.Mesh(rootsGeometry(), colourMat());
  mound.castShadow = true; mound.receiveShadow = true;
  rootsLook.add(mound);
  // the mushrooms and the stone glow: unlit, their colours as they are in the dark under the roots
  const glow = new THREE.Mesh(glowGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  glow.castShadow = false;
  rootsLook.add(glow);
  const rootlets = new THREE.InstancedMesh(rootletGeometry(), new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 0.9, flatShading: true }), ro.rootlets.length);
  rootlets.name = 'secret-rootlets'; rootlets.castShadow = false; rootlets.frustumCulled = false;
  rootsLook.add(rootlets);
  scene.add(rootsLook);
  const rootletTop = ro.rootlets.map((r) => new THREE.Vector3(r.x, groundY(r.x, r.z) + ROOTLET_TOP, r.z));
  const forward = new THREE.Vector3(Math.sin(ROOTS.face), 0, Math.cos(ROOTS.face));
  const across = { x: Math.cos(ROOTS.face), z: -Math.sin(ROOTS.face) };
  const stoneAt = new THREE.Vector3(ro.stone.x, groundY(ro.stone.x, ro.stone.z), ro.stone.z);
  let rootsCam = false;      // the camera's distance is the roots' now
  scope.own(() => { if (rootsCam) { g.camOverride = null; g.camPitchMin = null; } });
  /** The camera under the roots, by where she stands; never over a distance another rule has set. */
  function rootsCamera(d: number) {
    if (!rootsCam && g.camOverride !== null) return;
    if (d >= ROOTS_CAM_OUT) { if (rootsCam) { g.camOverride = null; g.camPitchMin = null; rootsCam = false; } return; }
    g.camOverride = rootsCamDist(d, camDistance(g.camera.aspect)); rootsCam = true;
    g.camPitchMin = d < ROOTS_R ? ROOTS_PITCH : null;
  }
  const rq = new THREE.Quaternion();
  function swingRootlets(time: number) {
    const hp = hero.root.position;
    rootletTop.forEach((t, i) => {
      const d = Math.hypot(hp.x - t.x, hp.z - t.z);
      // aside from her, along the opening; a little sway always
      const away = Math.sign((t.x - hp.x) * across.x + (t.z - hp.z) * across.z) || 1;
      rq.setFromAxisAngle(forward, -away * rootletSwing(d) + Math.sin(time * 1.3 + i) * 0.05);
      rootlets.setMatrixAt(i, m4.compose(t, rq, sv.setScalar(1)));
    });
    rootlets.instanceMatrix.needsUpdate = true;
  }

  const spots: Spot[] = [
    { pos: chestFront, r: 2.2, label: 'open', on: () => !found(CAVE_FLAG), run: openChest },
    { pos: songAt, r: 2.4, label: 'forest_listen', on: () => song.phase === 'rest', run: begin },
  ];
  const here = (p: { x: number; z: number }, r: number) => Math.hypot(hero.root.position.x - p.x, hero.root.position.z - p.z) < r;
  const show = (p: { x: number; z: number }) => here(p, SHOW_R);

  return {
    spots,
    at: { cave: { x: chestFront.x, z: chestFront.z }, bounce: { x: house.x, z: house.z }, fireflies: { x: songAt.x, z: songAt.z }, ring: { x: rx, z: rz }, roots: { ...ro.stone } },
    glimmer: () => [
      ...(found(CAVE_FLAG) ? [] : [chestFront]),
      ...(found(BOUNCE_FLAG) ? [] : [lantern.position]),
      ...(found(SONG_FLAG) ? [] : [songAt]),
      ...(found(RING_FLAG) ? [] : [ringAt]),
      ...(found(ROOTS_FLAG) ? [] : [stoneAt]),
    ],
    tap(screenDist) {
      if (song.phase !== 'wait' || g.busy) return false;
      let best = -1, bestD = g.touch ? 56 : 40;
      flyAt.forEach((p, i) => { const d = screenDist(p); if (d < bestD) { best = i; bestD = d; } });
      if (best < 0) return false;
      touch(best);
      return true;
    },
    cheat() {
      const hp = hero.root.position;
      if (!found(BOUNCE_FLAG) && here(house, 4)) { hp.set(house.x, roofY, house.z); return 'roof'; }
      if (!found(SONG_FLAG) && here(songAt, 4)) {
        if (song.phase === 'rest') { begin(); return 'fireflies'; }
        if (song.phase === 'wait') { touch(song.order[song.got]); return 'fireflies'; }
        return song.phase === 'tune' || song.phase === 'show' ? 'fireflies' : '';
      }
      return '';
    },
    update(dt, time, canMove) {
      const hp = hero.root.position;
      cave.visible = show(CAVE);
      caveCamera(Math.hypot(hp.x - CAVE.x, hp.z - CAVE.z));
      bounceLook.visible = show(house);
      songLook.visible = show(SONG_TREE);
      ringLook.visible = show(FAIRY_RING);
      // the cave under the roots: drawn near her, its camera, its curtain, its find
      rootsLook.visible = show(ROOTS);
      rootsCamera(Math.hypot(hp.x - ROOTS.x, hp.z - ROOTS.z));
      if (rootsLook.visible) swingRootlets(time);
      if (!found(ROOTS_FLAG) && canMove && here(ro.stone, FIND_R)) {
        sfx('good');
        g.sparks.burst(stoneAt.clone().setY(stoneAt.y + 0.6), '#ffd27a', 30, 3);
        give(ROOTS_FLAG, false, stoneAt);
        tell('forest_secret_roots');
      }
      water.uniforms.uTime.value = time;
      // the trampoline: the cat's word the first time she bounces on it (the find is on the roof)
      if (!bounceTold && !found(BOUNCE_FLAG) && hp.y > tY + TRAMPOLINE.top + 1.2 && here(tAt, TRAMPOLINE.out + 1)) { bounceTold = true; tell('forest_secret_bounce'); }
      if (lantern.visible) {
        lantern.rotation.y = time * 0.8;
        if (canMove && here(house, 0.9) && hp.y > roofY - 0.6) takeLantern();
      }
      // the fireflies: their show, her touches, the tune
      if (song.phase === 'show') {
        song.t += dt;
        const now = song.t < 0 ? null : singingAt(song, song.t);
        if (now !== null && now !== sung) sing(now);
        sung = now ?? -1;
        if (song.t >= showSeconds(song)) song = { ...song, phase: 'wait', t: 0 };
      } else if (song.phase === 'tune') {
        song.t += dt;
        const k = Math.floor(song.t / 0.24);
        if (k !== tuneNote && k < TUNE.length) { tuneNote = k; sing(TUNE[k]); }
        if (k >= TUNE.length + 2) {
          song = restSong();
          if (!found(SONG_FLAG)) { sfx('good'); give(SONG_FLAG, false, songAt); }
        }
      } else if (song.phase === 'wait' && !here(songAt, 9)) song = restSong();    // she went away: they wait for her again
      const lit = (i: number) => (song.phase === 'show' && sung === i) || song.phase === 'tune' || (song.phase === 'wait' && song.order.indexOf(i) < song.got);
      for (let i = 0; i < 3; i++) {
        const s = lit(i) ? 1.9 : 1 + Math.sin(time * 3 + i * 2) * 0.12;
        flies.setMatrixAt(i, m4.compose(pv.copy(flyAt[i]).setY(flyAt[i].y + Math.sin(time * 2 + i) * 0.08), q.identity(), sv.setScalar(s)));
      }
      flies.instanceMatrix.needsUpdate = true;
      // the ring: tiny in its middle, sparkles round her while it lasts
      const d = Math.hypot(hp.x - rx, hp.z - rz);
      if (canMove && !inRing && d < 0.7) { inRing = true; enterRing(); }
      if (inRing && d > FAIRY_RING.r) inRing = false;
      if (left(save, 'tiny') > 0 && d < FAIRY_RING.r + 3 && (sparkT += dt) > 0.3) { sparkT = 0; g.sparks.burst(g.above(hp, 0.4), '#ffc4ec', 3, 0.8); }
    },
    animate: (dt) => { chest.update(dt); },
    debug: { song: () => song, trampoline: tAt, roof: { x: house.x, z: house.z, y: roofY }, chest: { x: cx, z: cz }, roots: ro },
  };
}
