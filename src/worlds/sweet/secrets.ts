import * as THREE from 'three';
import { sfx, speaking } from '../../core/audio';
import type { Game } from '../../game/context';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { CANDY_BOX, COTTON_CLOUD, FOUNTAIN, GUM_MACHINE, HOUSE, ZONES } from './layout';
import { paint, paintMaterial, type Part } from './landmarks';
import { colliders, height, tops } from './terrain';

/**
 * The secrets of the Sweet Land (PLAY-07, docs/worlds/world-4.md «Секреты»), as the sea's (src/worlds/sea/secrets.ts):
 * optional, not needed by the story, each found once - its flag in the world's part of the save (the names of
 * WorldDef.secrets and of the items of the world description), its stars the first time; coming back gives nothing
 * again. The Great Tree hangs a keepsake for each (src/worlds/hub/keepsakes.ts reads the flags).
 *
 * - candy_box: the tin box of candies under the shape bridge (the world's chest, PLAY-08): opened, 5 stars; every other
 *   secret 3.
 * - cotton_cloud: a cloud of cotton candy by Imbir's house: she walks into it and it tosses her up onto the house's flat
 *   roof, where a swirl lollipop stands - the decoration is the find. Off the roof's edge she falls back down.
 * - lemonade: the lemonade fountain on the square: its action splashes it up in a rainbow and the cat is glad, every
 *   time - no grading; the stars the first time.
 * - bubble_gum: the gum machine at the market: she stands before it a while and blows a bubble, which pops into
 *   confetti - every time she comes again; the stars the first time.
 *
 * The cat says its word of each the first time it is found, as the sea's `sea_secret_*` (./strings.ts `sweet_secret_*`):
 * the box as it opens, the cloud as it tosses her up (once a visit, until the lollipop is found), the fountain at its
 * first splash, the bubble as it pops - after the line that sounds then, not over it.
 *
 * The box's body, the fountain, the machine and the cloud are one mesh; the box's lid, the roof's lollipop and the
 * bubble are one each (the lollipop until it is found, the bubble while it is blown): four draw calls at most, none of
 * them casting a shadow (TECH-06).
 */
export const CHEST_FLAG = 'candy_box', CLOUD_FLAG = 'cotton_cloud', LEMONADE_FLAG = 'lemonade', GUM_FLAG = 'bubble_gum';
export const SWEET_SECRETS = [CHEST_FLAG, CLOUD_FLAG, LEMONADE_FLAG, GUM_FLAG] as const;
export type SweetSecret = (typeof SWEET_SECRETS)[number];
/** How each is done (WorldItem.how): the box and the fountain by the action button, the cloud and the machine by walking. */
export const SECRET_HOW: Record<SweetSecret, 'act' | 'walk'> = { candy_box: 'act', cotton_cloud: 'walk', lemonade: 'act', bubble_gum: 'walk' };
/** The cat's word of each find (./strings.ts). */
export const SECRET_WORD: Record<SweetSecret, 'sweet_secret_box' | 'sweet_secret_cotton' | 'sweet_secret_lemonade' | 'sweet_secret_gum'> = {
  candy_box: 'sweet_secret_box', cotton_cloud: 'sweet_secret_cotton', lemonade: 'sweet_secret_lemonade', bubble_gum: 'sweet_secret_gum',
};
/** s: how long the cat's word of a find waits for the line that sounds to end; longer, it is not said. */
export const WORD_WAIT = 8;

// ---------- the candy box ----------

/** m: the tin box - its width, its height, its depth; its front spot this far before it. */
export const BOX = { w: 0.9, h: 0.42, d: 0.6, front: 1.3 } as const;
/** rad the lid opens to; s it takes. */
export const LID_OPEN = 1.95, LID_S = 0.6;
/** Where the box stands and where she opens it from: before its front, away from the chocolate. */
export function boxOf() {
  const fx = Math.sin(CANDY_BOX.yaw), fz = Math.cos(CANDY_BOX.yaw);
  return { at: { x: CANDY_BOX.x, z: CANDY_BOX.z }, front: { x: CANDY_BOX.x + fx * BOX.front, z: CANDY_BOX.z + fz * BOX.front }, yaw: CANDY_BOX.yaw };
}

// ---------- the cotton cloud and the roof ----------

/** m: how near the cloud's middle she has to walk for it to toss her; s the toss takes; m it lifts her over the roof. */
export const CLOUD_R = 1, TOSS_S = 1.5, TOSS_UP = 2.2;
/** m: how near the lollipop on the roof she has to come for it to be found. */
export const SWIRL_R = 0.8;
/**
 * The roof of Imbir's house (./layout.ts HOUSE: the body stands, its front is assembled on its east side, WORLD-21): its
 * flat top, where she lands (on the cloud's side) and where the lollipop stands (across it, still on the house's west
 * half - away from the front, where the house's task opens, ./house.ts OPEN_R).
 */
export function roofOf() {
  const top = height(HOUSE.x, HOUSE.z) + HOUSE.h;
  return {
    top, x: HOUSE.x, z: HOUSE.z, w: HOUSE.w, d: HOUSE.d,
    landing: { x: HOUSE.x - HOUSE.w * 0.25, z: HOUSE.z + HOUSE.d * 0.25 },
    swirl: { x: HOUSE.x - HOUSE.w * 0.2, z: HOUSE.z - HOUSE.d * 0.25 },
  };
}
/** Whether (x, z) is over the roof. */
export const overRoof = (x: number, z: number) => Math.abs(x - HOUSE.x) <= HOUSE.w / 2 && Math.abs(z - HOUSE.z) <= HOUSE.d / 2;
/** Where the toss has her `t` s after the cloud took her at `from`: an arc up over the roof, down onto it at TOSS_S. */
export function tossAt(t: number, from: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const { top, landing } = roofOf();
  const k = THREE.MathUtils.clamp(t / TOSS_S, 0, 1), along = THREE.MathUtils.smoothstep(k, 0, 1);
  // a parabola from her feet to the roof's top, TOSS_UP over the roof at its highest (halfway)
  const rise = top - from.y, y = from.y + rise * k + 4 * (TOSS_UP + rise / 2) * k * (1 - k);
  return out.set(from.x + (landing.x - from.x) * along, k >= 1 ? top : y, from.z + (landing.z - from.z) * along);
}

// ---------- the lemonade fountain ----------

/** s the rainbow splash lasts. */
export const SPLASH_S = 1.6;
/** The colours of the splash, the rainbow's. */
export const RAINBOW = ['#ff4d6d', '#ff9f43', '#ffe066', '#7bd36a', '#4fc3f7', '#7c6cf0', '#d67bff'] as const;
/** m: the fountain's middle and its jet's top over the ground; the spot before it, toward the square's middle. */
export const JET_TOP = 2.1;
export function fountainOf() {
  const dx = ZONES.square.x - FOUNTAIN.x, dz = ZONES.square.z - FOUNTAIN.z, d = Math.hypot(dx, dz) || 1;
  const out = FOUNTAIN.r + 1;
  return { at: { x: FOUNTAIN.x, z: FOUNTAIN.z }, front: { x: FOUNTAIN.x + (dx / d) * out, z: FOUNTAIN.z + (dz / d) * out } };
}

// ---------- the gum machine ----------

/** s she stands before the machine before she blows; s the bubble grows; m: its size at the pop. */
export const GUM_WAIT = 1.5, BLOW_S = 1.8, BUBBLE_MAX = 0.42;
/** m: how near the place before the machine she has to stand. */
export const GUM_R = 0.8;
/** The machine and the place she stands at: before it, toward the market's middle. */
export function gumOf() {
  const dx = ZONES.market.x - GUM_MACHINE.x, dz = ZONES.market.z - GUM_MACHINE.z, d = Math.hypot(dx, dz) || 1;
  return { at: { ...GUM_MACHINE }, stand: { x: GUM_MACHINE.x + (dx / d) * 1.2, z: GUM_MACHINE.z + (dz / d) * 1.2 } };
}
/** The bubble's size `t` s into the blowing: it grows the slower the bigger, null once it has popped. */
export const bubbleAt = (t: number): number | null => (t < 0 || t > BLOW_S ? null : BUBBLE_MAX * Math.sqrt(Math.max(0.02, t / BLOW_S)));
/** The colours of the confetti. */
export const CONFETTI = ['#ff8fb1', '#ffd84a', '#7bd36a', '#a8e4ff', '#ffffff'] as const;

// ---------- the shapes ----------

/** A box of `w` × `h` × `d` with its foot at y = `y`. */
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const placed = (g: THREE.BufferGeometry, p: { x: number; z: number }, yaw = 0) => g.rotateY(yaw).translate(p.x, height(p.x, p.z), p.z);

/** The tin box's body: blue tin with a yellow band, the candies under its lid. Origin: its foot's middle, its front to +z. */
export function boxBodyParts(): Part[] {
  const sweets = ['#ff4d6d', '#ffd84a', '#7bd36a', '#ff8fb1', '#a8e4ff'];
  return [
    [box(BOX.w, BOX.h, BOX.d), '#5fb7e6'],
    [box(BOX.w + 0.02, 0.07, BOX.d + 0.02, 0, BOX.h * 0.45), '#ffd84a'],
    ...sweets.map((c, i): Part => [new THREE.SphereGeometry(0.09, 6, 4).translate((i - 2) * 0.16, BOX.h - 0.02, (i % 2 ? 0.1 : -0.08)), c]),
  ];
}
/** The lid: its hinge at the origin (the box's back top edge), lying forward along +z. */
export function lidGeometry(): THREE.BufferGeometry {
  return paint([
    [box(BOX.w + 0.04, 0.08, BOX.d + 0.04, 0, 0, BOX.d / 2), '#4aa3d6'],
    [new THREE.CylinderGeometry(0.12, 0.12, 0.03, 10).translate(0, 0.09, BOX.d / 2), '#ff4d6d'],
  ]);
}
/** The fountain: a pink basin of lemonade, a column, a bowl, the jet. Origin: its foot's middle. */
export function fountainParts(): Part[] {
  const r = FOUNTAIN.r;
  return [
    [new THREE.CylinderGeometry(r, r + 0.1, 0.5, 14).translate(0, 0.25, 0), '#f7a8c8'],
    [new THREE.CylinderGeometry(r - 0.12, r - 0.12, 0.06, 14).translate(0, 0.48, 0), '#fff27a'],
    [new THREE.CylinderGeometry(0.14, 0.2, 1.1, 8).translate(0, 1.05, 0), '#fffaf2'],
    [new THREE.CylinderGeometry(0.55, 0.22, 0.25, 10).translate(0, 1.7, 0), '#f7a8c8'],
    [new THREE.ConeGeometry(0.12, JET_TOP - 1.8, 6).translate(0, 1.8 + (JET_TOP - 1.8) / 2, 0), '#fff27a'],
  ];
}
/** The gum machine: a red post and base, a glass globe of gumballs, a red cap. Origin: its foot's middle, its slot to +z. */
export function gumParts(): Part[] {
  const balls = ['#ff4d6d', '#ffd84a', '#7bd36a', '#4fc3f7', '#ff8fb1', '#d67bff', '#ff9f43', '#ffffff'];
  return [
    [new THREE.CylinderGeometry(0.1, 0.16, 0.8, 8).translate(0, 0.4, 0), '#e8364f'],
    [box(0.46, 0.34, 0.46, 0, 0.8), '#e8364f'],
    [box(0.12, 0.08, 0.04, 0, 0.92, 0.24), '#c9ccd6'],
    [new THREE.SphereGeometry(0.36, 12, 8).translate(0, 1.48, 0), '#dff3ff'],
    ...balls.map((c, i): Part => {
      const a = i * 2.4, y = 1.36 + (i % 3) * 0.12, rr = 0.3;
      return [new THREE.SphereGeometry(0.08, 6, 4).translate(Math.cos(a) * rr, y, Math.sin(a) * rr), c];
    }),
    [new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10).translate(0, 1.86, 0), '#e8364f'],
  ];
}
/** The cotton cloud: soft pink and white puffs, low over the ground. Origin: its foot's middle. */
export function cloudParts(): Part[] {
  const puffs: [number, number, number, number, string][] = [
    [0, 0.85, 0, 0.75, '#ffc4e1'], [0.6, 0.7, 0.2, 0.55, '#fff0f7'], [-0.6, 0.72, -0.1, 0.58, '#ffd6ea'],
    [0.1, 0.75, 0.6, 0.5, '#fff0f7'], [-0.15, 0.7, -0.6, 0.52, '#ffc4e1'], [0.2, 1.35, 0.05, 0.45, '#fff0f7'],
  ];
  return puffs.map(([x, y, z, r, c]): Part => [new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), c]);
}
/** The decoration on the roof: a swirl lollipop of pink and white rings on a white stick. Origin: its stick's foot. */
export function swirlGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [[new THREE.CylinderGeometry(0.035, 0.035, 0.7, 5).translate(0, 0.35, 0), '#fffaf2']];
  for (let k = 0; k < 3; k++) parts.push([new THREE.TorusGeometry(0.1 + k * 0.1, 0.05, 4, 14).translate(0, 0.95, 0), k % 2 ? '#fffaf2' : '#ff5c9a']);
  parts.push([new THREE.CircleGeometry(0.08, 10).translate(0, 0.95, 0.01), '#ff5c9a']);
  return paint(parts);
}
/** The static shapes of the secrets in one geometry: the box's body, the fountain, the machine, the cloud, in the world. */
export function propsGeometry(): THREE.BufferGeometry {
  const at = (parts: Part[], p: { x: number; z: number }, yaw = 0): Part[] => parts.map(([g, c]) => [placed(g, p, yaw), c]);
  const b = boxOf(), gm = gumOf();
  const gumYaw = Math.atan2(gm.stand.x - gm.at.x, gm.stand.z - gm.at.z);
  return paint([...at(boxBodyParts(), b.at, b.yaw), ...at(fountainParts(), FOUNTAIN), ...at(gumParts(), gm.at, gumYaw), ...at(cloudParts(), COTTON_CLOUD)]);
}

// ---------- the Sweet Land's secrets in the scene ----------

export interface SweetSecrets {
  readonly spots: readonly Spot[];
  /** Where each is found: the items of the world description (./index.ts). */
  readonly at: Readonly<Record<SweetSecret, { x: number; z: number }>>;
  /** The secrets not found yet, where they are (the glow potion twinkles them). */
  glimmer(): THREE.Vector3[];
  /** The walkthrough's right move by a secret she is at: '' - none here. */
  cheat(): string;
  /** Whether a secret is going on (the cloud tossing her, the splash, the bubble blown). */
  active(id: SweetSecret): boolean;
  update(dt: number, time: number, canMove: boolean): void;
  /** What the pictures and the measurements read. */
  readonly debug: { box: ReturnType<typeof boxOf>; roof: ReturnType<typeof roofOf>; cloud: { x: number; z: number }; fountain: ReturnType<typeof fountainOf>; gum: ReturnType<typeof gumOf>; bubble: () => number | null; blow: () => void };
}

export function createSweetSecrets(g: Pick<Game, 'scene' | 'ws' | 'hero' | 'cat' | 'sparks' | 'addStars' | 'above' | 'persist' | 'speech'>, scope: WorldScope): SweetSecrets {
  const { scene, ws, hero } = g;
  const found = (flag: SweetSecret) => ws.flags[flag] === true;
  /** The cat's word of a find: after the line that sounds now, not over it (a hint over another line is turned away). */
  const tell = (flag: SweetSecret) => {
    let waited = 0;
    const tryNow = () => {
      if (!speaking()) { void g.speech.line(SECRET_WORD[flag], 'hint', 5000); return; }
      if ((waited += 0.25) < WORD_WAIT) scope.timeout(tryNow, 250);
    };
    tryNow();
  };
  // the stars of the chest and of every other secret, as the forest's and the sea's; literal numbers, so that
  // src/game/no-penalties.test.ts reads them as positive (LEARN-14)
  const give = (flag: SweetSecret, chest: boolean, at: THREE.Vector3) => {
    ws.flags[flag] = true;
    g.addStars(chest ? 5 : 3, g.above(at, 1.2));
    g.persist();
  };
  const hp = hero.root.position;
  const here = (p: { x: number; z: number }, r: number) => Math.hypot(hp.x - p.x, hp.z - p.z) < r;
  const v3 = (p: { x: number; z: number }, y = height(p.x, p.z)) => new THREE.Vector3(p.x, y, p.z);
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => { owned.push(x); return x; };
  const meshes: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T) => { meshes.push(o); scene.add(o); return o; };
  scope.own(() => { tops.length = 0; for (const m of meshes) m.removeFromParent(); for (const x of owned) x.dispose(); });

  // ---------- the props: one mesh, no shadow; the box, the fountain and the machine stop her ----------
  const props = add(new THREE.Mesh(own(propsGeometry()), paintMaterial()));
  props.name = 'secret-props'; props.castShadow = false; props.receiveShadow = true;
  const bx = boxOf(), fo = fountainOf(), gm = gumOf(), roof = roofOf();
  colliders.push({ x: bx.at.x, z: bx.at.z, r: 0.5 }, { x: fo.at.x, z: fo.at.z, r: FOUNTAIN.r + 0.2 }, { x: gm.at.x, z: gm.at.z, r: 0.45 });

  // ---------- the candy box ----------
  const lid = new THREE.Mesh(own(lidGeometry()), paintMaterial());
  lid.name = 'secret-lid'; lid.castShadow = false;
  const hinge = add(new THREE.Group());
  hinge.name = 'secret-box';
  hinge.position.set(bx.at.x - Math.sin(bx.yaw) * BOX.d / 2, height(bx.at.x, bx.at.z) + BOX.h, bx.at.z - Math.cos(bx.yaw) * BOX.d / 2);
  hinge.rotation.y = bx.yaw;
  hinge.add(lid);
  let lidT = found(CHEST_FLAG) ? LID_S : -1;
  const boxFront = v3(bx.front), boxAt = v3(bx.at);
  function openBox() {
    if (found(CHEST_FLAG)) return;
    lidT = 0;
    sfx('good');
    g.sparks.burst(boxAt.clone().setY(boxAt.y + BOX.h + 0.2), '#ffd84a', 30, 2.5);
    give(CHEST_FLAG, true, boxAt);
    tell(CHEST_FLAG);
  }

  // ---------- the cotton cloud and the roof ----------
  tops.push({ x: roof.x, z: roof.z, w: roof.w, d: roof.d, top: roof.top });
  const swirl = add(new THREE.Mesh(own(swirlGeometry()), own(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4, emissive: '#ff9ec4', emissiveIntensity: 0.35 }))));
  swirl.name = 'secret-swirl'; swirl.castShadow = false;
  swirl.position.set(roof.swirl.x, roof.top, roof.swirl.z);
  swirl.visible = !found(CLOUD_FLAG);
  let tossing = -1, cloudTold = false;
  const tossFrom = new THREE.Vector3(), wasAt = hp.clone();
  const onRoof = () => overRoof(hp.x, hp.z) && hp.y > roof.top - 0.2;
  const cloudAt = v3(COTTON_CLOUD);

  // ---------- the lemonade fountain ----------
  let splash = -1, splashNext = 0;
  const jet = v3(fo.at, height(fo.at.x, fo.at.z) + JET_TOP), fountainFront = v3(fo.front);
  function splashUp() {
    splash = 0; splashNext = 0;
    sfx('pop');
    // the cat is glad with her, every time; its word the first time
    g.cat.once('Yes', 'Idle');
    if (!found(LEMONADE_FLAG)) { give(LEMONADE_FLAG, false, jet); tell(LEMONADE_FLAG); }
  }

  // ---------- the gum machine ----------
  const bubble = add(new THREE.Mesh(own(new THREE.SphereGeometry(1, 14, 10)), own(new THREE.MeshStandardMaterial({ color: '#ff8fc8', roughness: 0.25, transparent: true, opacity: 0.85 }))));
  bubble.name = 'secret-bubble'; bubble.castShadow = false; bubble.visible = false;
  let standing = 0, blowing = -1, blewHere = false;
  const gumStand = v3(gm.stand), gumAt = v3(gm.at);
  const mouth = new THREE.Vector3();
  const mouthAt = () => mouth.set(hp.x + Math.sin(hero.heading) * 0.32, hp.y + 1.02 * hero.root.scale.y, hp.z + Math.cos(hero.heading) * 0.32);

  const spots: Spot[] = [
    { pos: boxFront, r: 2, label: 'open', on: () => !found(CHEST_FLAG), run: openBox },
    { pos: fountainFront, r: 2.2, label: 'sweet_lemonade', on: () => splash < 0, run: splashUp },
  ];

  return {
    spots,
    at: { candy_box: { ...bx.front }, cotton_cloud: { ...COTTON_CLOUD }, lemonade: { ...fo.front }, bubble_gum: { ...gm.stand } },
    glimmer: () => [
      ...(found(CHEST_FLAG) ? [] : [boxFront]),
      ...(found(CLOUD_FLAG) ? [] : [cloudAt]),
      ...(found(LEMONADE_FLAG) ? [] : [fountainFront]),
      ...(found(GUM_FLAG) ? [] : [gumStand]),
    ],
    cheat() {
      // on the roof: to the lollipop
      if (!found(CLOUD_FLAG) && tossing < 0 && onRoof()) { hp.set(roof.swirl.x, roof.top, roof.swirl.z); return 'cloud'; }
      // before the machine: she only has to stand there
      if (!found(GUM_FLAG) && here(gm.stand, GUM_R + 0.5)) { if (!here(gm.stand, GUM_R)) hp.set(gm.stand.x, hp.y, gm.stand.z); return 'gum'; }
      return '';
    },
    active: (id) => (id === CLOUD_FLAG ? tossing >= 0 : id === LEMONADE_FLAG ? splash >= 0 : id === GUM_FLAG ? blowing >= 0 : false),
    update(dt, time, canMove) {
      // ----- the box: its lid opens once, and stays open
      if (lidT >= 0) { lidT = Math.min(LID_S, lidT + dt); lid.rotation.x = -LID_OPEN * THREE.MathUtils.smootherstep(lidT / LID_S, 0, 1); }

      // ----- the cloud: walked into from the ground, it tosses her onto the roof; taken away meanwhile, it lets her go
      if (tossing >= 0 && Math.hypot(hp.x - wasAt.x, hp.z - wasAt.z) > 1) tossing = -1;
      if (tossing >= 0) {
        tossing += dt;
        tossAt(tossing, tossFrom, hp);
        if (tossing >= TOSS_S) { tossing = -1; hp.y = roof.top; }
      } else if (canMove && hp.y < roof.top - 0.5 && here(COTTON_CLOUD, CLOUD_R)) {
        tossing = 0; tossFrom.copy(hp);
        sfx('jump');
        g.sparks.burst(cloudAt.clone().setY(cloudAt.y + 1), '#ffd6ea', 20, 2);
        if (!cloudTold && !found(CLOUD_FLAG)) { cloudTold = true; tell(CLOUD_FLAG); }
      }
      wasAt.copy(hp);
      if (swirl.visible) {
        swirl.rotation.y = time * 1.2;
        if (canMove && tossing < 0 && onRoof() && here(roof.swirl, SWIRL_R)) {
          swirl.visible = false;
          sfx('chime');
          g.sparks.burst(swirl.position.clone().setY(roof.top + 1), '#ff9ec4', 30, 3);
          give(CLOUD_FLAG, false, swirl.position);
        }
      }

      // ----- the fountain: the rainbow splash, a burst of each colour in turn
      if (splash >= 0) {
        splash += dt;
        while (splashNext < RAINBOW.length && splash >= (splashNext / RAINBOW.length) * SPLASH_S * 0.7) {
          g.sparks.burst(jet, RAINBOW[splashNext], 14, 2.6);
          splashNext++;
        }
        if (splash >= SPLASH_S) splash = -1;
      }

      // ----- the machine: standing before it a while, she blows a bubble; it pops into confetti. Again once she has left
      if (blowing < 0) {
        if (!here(gm.stand, GUM_R + 1.5)) blewHere = false;
        standing = canMove && !blewHere && here(gm.stand, GUM_R) ? standing + dt : 0;
        if (standing >= GUM_WAIT) { blowing = 0; standing = 0; blewHere = true; sfx('soft'); }
      }
      if (blowing >= 0) {
        blowing += dt;
        const s = bubbleAt(blowing);
        bubble.visible = s !== null;
        if (s !== null) { bubble.position.copy(mouthAt()).addScaledVector(new THREE.Vector3(Math.sin(hero.heading), 0, Math.cos(hero.heading)), s * 0.8); bubble.scale.setScalar(s); }
        else {
          blowing = -1;
          sfx('pop');
          for (const c of CONFETTI) g.sparks.burst(bubble.position, c, 10, 2.2);
          if (!found(GUM_FLAG)) { give(GUM_FLAG, false, gumAt); tell(GUM_FLAG); }
        }
      }
    },
    debug: {
      box: bx, roof, cloud: { ...COTTON_CLOUD }, fountain: fo, gum: gm,
      bubble: () => (bubble.visible ? bubble.scale.x : null),
      blow: () => { blowing = 0; blewHere = true; },
    },
  };
}
