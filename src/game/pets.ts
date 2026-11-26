import { hangOwnGear } from './petgear';
import * as THREE from 'three';
import { rig, type Rig } from '../core/assets';
import { disposeTree } from '../core/dispose';
import { sfx } from '../core/audio';
import type { Save } from '../core/save';
import type { SpokenKey } from '../ui/strings';
import { Actor } from './actor';
import type { Game } from './context';
import type { Spot } from './player';
import { GROUND, PET_RUN_MAX, PET_WALK_BACK, PET_WALK_MAX, followSpeed, pace, paceFollower, speedometer } from './stride';
import type { WorldDef } from './world';
import { inStash, spend } from './stash';

/**
 * The pets (PLAY-09): one to find in each world (R18), and the one chosen walks after the heroine with the cat (R19).
 * The pet of a world is the item `pet` of the world description (R22): its done mark is `ws.flags.pet` of that world,
 * read from the save every time; where it stands and after which chain it shows itself is the world's (WorldDef.pet).
 * Which pets are found is the save's own list (`save.pets`), written by the find in whatever world it was made: a
 * species that waits in a world other than the one of its catalog entry is found there too.
 * The models are of the core (R23, R46): the shared load (src/game/boot.ts) brings the model of every species once -
 * but a species marked `own`, whose model is a file of its world (the owlet, Bulchik: the core's models have no room
 * for them, the lead's decision of 2026-11-22). Its world and the hub load it themselves (`loadOwnPets`).
 */

/**
 * A kind of pet: its id (what `save.pet` holds), the world it is found in, its model of the core, its height (m) and the
 * speeds over the ground of its walk and, if it has one, of its run at a pace of 1 (src/game/stride.ts, tools/feet.mjs).
 */
export interface PetSpecies {
  readonly id: string; readonly world: string; readonly model: string; readonly height: number;
  /** The kinds of finds it likes as a treat (PLAY-27, from the stash), in the order they are given. */
  readonly treats?: readonly string[];
  readonly walk: number; readonly run?: { readonly clip: string; readonly ground: number };
  /**
   * Its model is a file of its world (`models/<world>/…`), not of the core: the shared load leaves it out, its world
   * and the hub load it (`loadOwnPets`). The world is downloaded whole before it is entered, so the hub finds the file
   * in the cache once the pet was found there; with no file the pet stays at home.
   */
  readonly own?: boolean;
  /**
   * It flies after her instead of walking (the owlet: its model has no walking clip): `clip` while it goes, `height` m
   * over the ground it rises to; standing, it comes down to `rest` m (absent: 0, on the ground) and plays Idle. `walk`
   * and `run` are not read then. Under water (Bulchik) `rest` keeps it floating where it stops: on the floor it would lie.
   */
  readonly fly?: { readonly clip: string; readonly height: number; readonly rest?: number };
  /**
   * Its model is a grown-up's of its world made small and lighter (Bulchik: his brother Bulk's file): each material's
   * colour times 1 + `lighter` as its world or the hub loads it (`loadOwnPets`). Absent: as the file has it.
   */
  readonly lighter?: number;
}

/** The pet of a world as the world describes it (WorldDef.pet). */
export type WorldPet = NonNullable<WorldDef['pet']>;

/** The name of a world's flag that marks its pet found; also the id of the item `pet` (R22, rules 1 and 2). */
export const PET_FLAG = 'pet';

/** Every pet of every world. The ids are the ones `save.pet` stores (src/core/save.ts PET_IDS lists the same). */
export const PETS: readonly PetSpecies[] = [
  // R57 (Q1): the fawn of the first world: the model of its grown-up made small. A model file of the core, not a world's name:
  // src/game/shared-code.test.ts allows this one exact string in this file only.
  { id: 'fawn', world: 'fairy', model: 'animals_pack/Deer', height: 0.85, walk: GROUND.fawnWalk, run: { clip: 'Gallop', ground: GROUND.fawnGallop }, treats: ['acorn', 'mushroom'] },
  // The owlet of the forest (world-2.md, PLAY-09): Mudrena's little one, the Meshy model of the forest (CREDITS.md), a
  // file of that world (`own`). It has no walking clip: it flies after her flapping its wings (the lead, 2026-11-22).
  // 0.55 m and flying at her shoulder: at 0.38 m and 0.4 m over the grass a child did not see it in the frame (the
  // lead, 2026-11-22, by the pictures of the grey build)
  { id: 'owlet', world: 'forest', model: 'forest/owlet', height: 0.55, own: true, walk: 1, fly: { clip: 'Flap', height: 0.75 }, treats: ['acorn', 'feather'] },
  // Bulchik of the sea (world-3.md, PLAY-09): the baby dragon, Bulk's little brother - his brother's Meshy model of the
  // sea's files (`own`, no file of its own), 0.7 m tall (the customer, 2026-11-24, by the heroine's 1.53 m) and lighter
  // (the lead, 2026-11-23). Its Swim clip is
  // its "flying": it swims after her at her swimming height (0.6 m, src/worlds/sea/index.ts SWIM_HEIGHT) and stays
  // there when it stops (`rest`), as Bulk floats over the corals.
  { id: 'bulchik', world: 'sea', model: 'sea/bulk', height: 0.7, own: true, walk: 1, fly: { clip: 'Swim', height: 0.6, rest: 0.6 }, lighter: 0.3, treats: ['feather', 'butterfly'] },
  // Zheleyka of the Sweet Land (world-4.md, PLAY-09): the little marmalade bear, Tyanuchka's little one - his model of
  // the Sweet Land's files (`own`), 0.7 m tall and lighter, as Bulchik is his brother's. It hops after her: its Hop
  // clip is its "flying", on the ground (height 0), as the owlet flaps and Bulchik swims.
  { id: 'zheleyka', world: 'sweet', model: 'sweet/tyanuchka', height: 0.7, own: true, walk: 1, fly: { clip: 'Hop', height: 0 }, lighter: 0.3, treats: ['acorn', 'shell'] },
  // Pushok of the Sky Islands (world-5.md, PLAY-09): the smallest cloud lamb, a file of that world (`own`), made whole in
  // Blender by code (CREDITS.md), 0.5 m. He trots and gallops: the ground speeds of his Walk and Run at a pace of 1 are
  // his clips' own (a standing leg sweeps 2 x 0.17 m x sin 22 deg in half of the 0.8 s trot; the gallop's about 1 m/s).
  { id: 'pushok', world: 'sky', model: 'sky/pushok', height: 0.5, own: true, walk: 0.34, run: { clip: 'Run', ground: 1.05 }, treats: ['berry', 'feather'] },
];

export const petSpecies = (id: string | null | undefined): PetSpecies | undefined => PETS.find((p) => p.id === id);

/** The models of the `own` pets a world has loaded, by the world's id: read when the world is entered (src/game/context.ts). */
const ownRigs = new Map<string, Record<string, Rig>>();
type ScopeOwn = { own(what: () => void): unknown };

/**
 * A world's load brings the `own` pets it shows (`ids`: species of PETS marked `own`; others are left out) - inside the
 * world's load, so their models are the world's and go with it. A model that does not come (no file in the cache, no
 * network) is only missing: that pet stays at home, the world plays on, a warning in the console. `scope`: the
 * world's, its end forgets the models. `load` is the loader, `hang` hangs a pet's things on its model (the tests hand
 * their own).
 */
export async function loadOwnPets(world: string, ids: readonly string[], scope: ScopeOwn, load: (path: string, height: number) => Promise<Rig> = (p, h) => rig(p, h, true), hang: (id: string, r: Rig) => Promise<() => void> = hangOwnGear): Promise<void> {
  const kinds = PETS.filter((p) => p.own && ids.includes(p.id));
  const got = await Promise.all(kinds.map((p) => load(p.model, p.height).then((r) => [p.id, r] as const, (e: unknown) => {
    console.warn(`the pet "${p.id}" did not load, it stays at home:`, e);
    return null;
  })));
  const rigs = got.filter((x) => x !== null);
  for (const [id, r] of rigs) lighten(r, petSpecies(id)?.lighter ?? 0);
  // its things (the owlet's scarf, a trade's gift) hung on it while it stands in its rest pose (src/game/petgear.ts)
  const unhang = await Promise.all(rigs.map(([id, r]) => hang(id, r)));
  ownRigs.set(world, Object.fromEntries(rigs));
  // The models are this world's (`rig` with `smooth` welds its own geometries, clones the materials, and the skeleton
  // has a bone texture): its end takes each out of the scene and frees it - forgotten only, each entry of the world
  // left one geometry and one texture more on the video card (S22, 2026-11-26: hub <-> sea or the Sweet Land)
  scope.own(() => {
    ownRigs.delete(world);
    for (const u of unhang) u();
    for (const [, r] of rigs) { r.root.removeFromParent(); disposeTree(r.root); }
  });
}

/** A model's colours lighter by the share `by` (PetSpecies.lighter): its own materials (src/core/assets.ts rig clones them). */
function lighten(r: Rig, by: number): void {
  if (by <= 0) return;
  r.model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) (mat as THREE.MeshStandardMaterial).color?.multiplyScalar(1 + by);
  });
}

/** The `own` pets' models the world `world` has loaded (none: an empty record). */
export const ownPetRigs = (world: string): Readonly<Record<string, Rig>> => ownRigs.get(world) ?? {};

/** The `own` species found in this save: what the hub loads, so the one chosen in the book can walk after her. */
export const ownFound = (save: Save): string[] => foundPets(save).filter((id) => petSpecies(id)?.own === true);

/**
 * What is wrong with the pet a world declares (empty: nothing): a species not in PETS, one of another world, or an
 * `after` that names none of the world's characters (the pet would never show itself). src/game/pets.test.ts runs it
 * over every world of the registry.
 */
export function petProblems(w: { id: string; pet?: WorldPet; characters: readonly { id: string }[]; test?: boolean }): string[] {
  if (!w.pet) return [];
  const s = petSpecies(w.pet.species), out: string[] = [];
  if (!s) out.push(`${w.id}: the pet species "${w.pet.species}" is not in PETS`);
  else if (s.world !== w.id && !w.test) out.push(`${w.id}: the pet species "${s.id}" is of the world "${s.world}"`);   // a test world may borrow one
  const after = w.pet.after;
  if (after !== undefined && !w.characters.some((c) => c.id === after)) out.push(`${w.id}: the pet comes after "${after}", no character of the world`);
  return out;
}

/**
 * The line of the cat when a pet is found (a subtitle, said by the voice once recorded). Null until the runner adds
 * the key to src/ui/strings.ts: until then the find is marked by the sparks and the sound only.
 */
export const FOUND_LINE: SpokenKey | null = 'pet_found';

/** The pace of a flying pet's wings: 1 standing still, up to FLAP_MAX at the heroine's run (5.4 m/s). */
export const FLAP_MAX = 1.6;
export const flapPace = (speed: number): number => 1 + (FLAP_MAX - 1) * Math.min(1, Math.max(0, speed) / 5.4);
/** A flying pet's height over the ground goes to `to` at this rate (1/s): most of the way in some 0.4 s. */
const LIFT_RATE = 6;
const ease = (now: number, to: number, dt: number): number => to + (now - to) * Math.exp(-LIFT_RATE * dt);
/** m over the ground a species stands at: its `fly.rest`, else on the ground. */
const restOf = (s: PetSpecies | undefined): number => s?.fly?.rest ?? 0;

/** The radius of the action spot around the place of a pet: it covers `at` (R22, rule 3). */
export const PET_SPOT_R = 2.2;
/** Where the pet walks: behind the heroine on her left, the cat keeps to her right (src/game/companion.ts). */
const SIDE = 0.9, BACK = 0.7;
/** The pet never comes nearer the cat than this (m): the two do not push into each other. */
export const PET_GAP = 0.8;
/** Closer than this to its place by the heroine, the pet stands. */
const NEAR = 0.45;
/**
 * The pet catches up (the lead's decision 2026-11-22, reversible): it walks to its place in a straight line and the
 * world's obstacles push it out (WorldGround.resolve) - one tree it slides round, but in a pocket of two or at a row
 * (a fence, bushes) it would stand for good. So once it has come no nearer its place for `stuckS` s while more than
 * `stuckM` m from it, or is more than `farM` m from it (she ran off, was put elsewhere), it appears at its place behind
 * her with a puff of sparkles - not while a scene holds the game nor during a trick.
 */
export const CATCH_UP = { stuckS: 1, stuckM: 2, farM: 12 } as const;

const flagsOf = (save: Save, world: string): Record<string, unknown> | null => {
  const w = save.worlds[world] as unknown;
  if (typeof w !== 'object' || w === null) return null;
  const f = (w as { flags?: unknown }).flags;
  return typeof f === 'object' && f !== null ? f as Record<string, unknown> : null;
};

/**
 * The ids of the pets found so far, in the order of PETS: the species of `save.pets` (written by the find, in the world
 * where it was made), and for a save written before that list the flag `pet` of each pet's own world.
 */
export function foundPets(save: Save, catalog: readonly PetSpecies[] = PETS): string[] {
  const listed = Array.isArray(save.pets) ? save.pets : [];
  return catalog.filter((p) => listed.includes(p.id) || flagsOf(save, p.world)?.[PET_FLAG] === true).map((p) => p.id);
}

/** A world as the rule of the follower reads it (WorldDef): its id, its place on the shelf, whether it is a test world. */
export interface PetWorld { readonly id: string; readonly shelf?: number; readonly test?: boolean }

/**
 * Which pet walks after her in a world (the customer's rule of 2026-11-20, «Свой мир и Древо», docs/12-gameplay.md
 * PLAY-09): a pet lives in its own world and comes to the Great Tree. In a world of the shelf the pet of THAT world, if
 * found; in the hub (no place on the shelf) and in a test world, the one chosen in the book. Nothing chosen in the book
 * (`save.pet` null) - none anywhere: the child's choice. The cat goes everywhere, as ever.
 */
export function followerOf(save: Save, world: PetWorld, catalog: readonly PetSpecies[] = PETS): PetSpecies | undefined {
  const chosen = catalog.find((p) => p.id === save.pet), found = foundPets(save, catalog);
  if (!chosen) return undefined;
  if (world.shelf === undefined || world.test) return found.includes(chosen.id) ? chosen : undefined;
  const local = catalog.find((p) => p.world === world.id);
  return local && found.includes(local.id) ? local : undefined;
}

/** Chooses the pet that walks after the heroine (null: none). A pet not found yet, or unknown, is refused: false. */
export function choosePet(save: Save, id: string | null): boolean {
  if (id !== null && !foundPets(save).includes(id)) return false;
  save.pet = id;
  return true;
}

/**
 * Marks the pet of a world found: the world's flag `pet` (in its part of the save, its done mark), the species in the
 * save's list of pets found, and the first pet found is chosen by itself. A pet found before stays as it is, the choice too.
 */
export function markFound(save: Save, ws: { flags: Record<string, boolean> }, species: PetSpecies): void {
  ws.flags[PET_FLAG] = true;
  const listed = Array.isArray(save.pets) ? save.pets : (save.pets = []);
  if (!listed.includes(species.id)) listed.push(species.id);
  if (!petSpecies(save.pet)) save.pet = species.id;
}

/** The place by the heroine the pet walks to: behind her, on the side away from the cat. */
export function petPlace(hero: { x: number; z: number }, heading: number, out = new THREE.Vector3()): THREE.Vector3 {
  const s = Math.sin(heading), c = Math.cos(heading);
  return out.set(hero.x - c * SIDE - s * BACK, 0, hero.z + s * SIDE - c * BACK);
}

/**
 * One step of the pet after the heroine (pure: the tests drive it). It walks to its place at the cat's pace and is then
 * pushed out of the cat's reach: a pet nearer the cat than PET_GAP stands off along the line between them.
 * Returns the distance that was left to its place (more than NEAR: it walked).
 */
export function followStep(p: { x: number; z: number }, place: { x: number; z: number }, cat: { x: number; z: number }, dt: number): number {
  const d = Math.hypot(place.x - p.x, place.z - p.z);
  if (d > NEAR) {
    const step = Math.min(followSpeed(d) * dt, d);
    p.x += ((place.x - p.x) / d) * step; p.z += ((place.z - p.z) / d) * step;
  }
  const cx = p.x - cat.x, cz = p.z - cat.z, cd = Math.hypot(cx, cz);
  if (cd < PET_GAP) {
    // Standing right on the cat (no direction to push in): stand off to the side away from the heroine's place.
    const nx = cd > 1e-6 ? cx / cd : 1, nz = cd > 1e-6 ? cz / cd : 0;
    p.x = cat.x + nx * PET_GAP; p.z = cat.z + nz * PET_GAP;
  }
  return d;
}

/** Where a world leads the follower now instead of her side (`steerPet`), null - by her side as always. */
export type PetSteer = (dt: number, pet: { readonly x: number; readonly z: number }) => { x: number; z: number } | null;
let steer: PetSteer | null = null;
/**
 * A world leads the follower for a while somewhere else than by her side (the hub: it plays round the ring of mushrooms,
 * src/worlds/hub/ring-play.ts), asked each frame it walks; the follower keeps its walk, its run and its way round the
 * cat. Returns the undo (the world's scope owns it): the next world has no steer of the one left.
 */
export function steerPet(fn: PetSteer): () => void {
  steer = fn;
  return () => { if (steer === fn) steer = null; };
}

let shadows = true;
/**
 * Whether the pets cast a shadow (each of their meshes is drawn once more, in the pass of the shadows). A world turns
 * it off where its budget of draw calls is short (the hub on its fourth stage, src/worlds/hub/index.ts); returns the undo,
 * owned by the world's scope.
 */
export function petShadows(on: boolean): () => void {
  shadows = on;
  return () => { shadows = true; };
}

/** PLAY-27: after this many treats a pet knows its first trick, then its second (the customer's word of 2026-11-21). */
export const TRICKS_AT = [5, 15] as const;
/** How many treats the pet `id` has had (save.treats, an optional field). */
export const treatsOf = (s: Pick<Save, 'treats'>, id: string): number => s.treats?.[id] ?? 0;
/** How many tricks it knows: 0, 1 or 2. */
export const tricksKnown = (s: Pick<Save, 'treats'>, id: string): number => TRICKS_AT.filter((n) => treatsOf(s, id) >= n).length;
/** The kind of find it would get now: the first it likes that the stash holds, or null. */
export const treatKind = (s: Pick<Save, 'stash'>, sp: PetSpecies): string | null => sp.treats?.find((k) => inStash(s, k) > 0) ?? null;
/**
 * One treat: a find it likes taken from the stash, one more to its count. Null - nothing it likes in the stash, nothing
 * done. `trick`: the trick it has just learnt (1 or 2), else 0.
 */
export function giveTreat(s: Pick<Save, 'stash' | 'treats'>, sp: PetSpecies): { kind: string; count: number; trick: number } | null {
  const kind = treatKind(s, sp);
  if (!kind || !spend(s, { [kind]: 1 })) return null;
  const count = treatsOf(s, sp.id) + 1;
  (s.treats ??= {})[sp.id] = count;
  return { kind, count, trick: TRICKS_AT.indexOf(count as 5 | 15) + 1 };
}

/** What the game holds of the pets in the world being played. */
export interface PetsInWorld {
  /** The action spot of the world's pet while it waits to be found (none once found, or before its chain is done). */
  readonly spots: readonly Spot[];
  /** The pet walking after the heroine, else null. */
  readonly follower: Actor | null;
  /** The pet of the world standing at its place, not found yet, else null. */
  readonly waiting: Actor | null;
  /** A frame: the waiting pet shows itself once its chain is done, the chosen one follows (it stands while `g.busy`). */
  update(dt: number): void;
  /** Takes the pets out of the scene (leaving the world); nothing of them is left in the frame. */
  dispose(): void;
  /** A tap on the screen near the follower that knows a trick: it shows its trick (true - the tap is spent on it). */
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  /** The trick being shown (1 or 2), else 0 (the walkthrough). */
  readonly trick: number;
}

/** What of the game the pets use; `busy` and the rest are read live through it. */
export type PetHost = Pick<Game, 'scene' | 'save' | 'ws' | 'hero' | 'cat' | 'busy' | 'groundY' | 'ground' | 'persist' | 'sparks' | 'speech' | 'above'>;

/**
 * The pets in the world being played. `pet` is the world's own (WorldDef.pet, absent: the world has none), `rigs` the
 * models of the shared load by species id, `chainDone` tells whether the chain of a character is finished.
 */
export function createPets(g: PetHost, o: {
  pet?: WorldPet; rigs: Readonly<Record<string, Rig>>; chainDone(id: string): boolean;
  /** The world played, for the rule of the follower (`followerOf`); absent - the one chosen, wherever. */
  world?: PetWorld;
  /** PLAY-27: a trick just learnt (1 or 2): the cat's word. */
  onTrick?(n: number): void;
}): PetsInWorld {
  const actors = new Map<string, Actor>();
  const actorOf = (s: PetSpecies): Actor | null => {
    let a = actors.get(s.id);
    if (!a) {
      const rig = o.rigs[s.id];
      if (!rig) return null;
      actors.set(s.id, a = new Actor(rig));
      // Named for the walkthrough (tools/shot.mjs, block "pet"): it finds the pet in the scene by this name.
      a.root.name = `pet:${s.id}`;
      a.play('Idle');
    }
    return a;
  };
  const mine = o.pet ? petSpecies(o.pet.species) : undefined;
  const found = () => g.ws.flags[PET_FLAG] === true;
  const ready = () => !o.pet?.after || o.chainDone(o.pet.after);
  const place = new THREE.Vector3();
  let follower: Actor | null = null, followed: string | null = null, waiting: Actor | null = null;
  const real = speedometer();   // the follower's speed over the ground as it is
  const steps = paceFollower();  // its pace, smoothed in time
  let galloping = false, moving = '';   // the walking clip it plays now
  let best = Infinity, stuckT = 0;   // the nearest it came to its place lately, and for how long no nearer
  let lift = 0;                         // a flying pet: m over the ground it is now (species `fly`)
  let gone = false;

  const spots: Spot[] = [];
  if (o.pet && mine && o.rigs[mine.id]) {
    const at = o.pet.at, pos = new THREE.Vector3(at.x, g.groundY(at.x, at.z), at.z);
    spots.push({
      pos, r: PET_SPOT_R, label: 'take',
      on: () => !gone && !found() && ready(),
      run: () => {
        if (found()) return;
        markFound(g.save, g.ws, mine);
        g.persist();
        sfx('good');
        g.sparks.burst(g.above(pos, 0.6), '#ffd1f0', 28, 3);
        g.sparks.burst(g.above(g.hero.root.position, 1.2), '#ff9ed2', 20, 3);
        // the world's own words for its pet, else the shared one; then, if it has one, what the pet will do now
        const said = o.pet!.found ?? FOUND_LINE, follow = o.pet!.follow;
        const first = said ? g.speech.line(said, 'story') : Promise.resolve();
        if (follow) void first.then(() => g.speech.line(follow, 'story'));
      },
    });
  }

  // PLAY-27: a treat by the follower - a find it likes from the stash - and its tricks (TRICKS_AT)
  const treatAt = new THREE.Vector3(), top = new THREE.Vector3();
  let hop = 0, trick = 0, trickT = 0;
  const TRICK_S = [0, 1.2, 1.1];
  const showTrick = (n: number) => { if (n > 0) { trick = n; trickT = TRICK_S[n]; } };
  const treatSpot: Spot = {
    pos: treatAt, r: 2.2, label: 'treat',
    on: () => { const sp = petSpecies(followed); return !gone && follower !== null && !!sp && treatKind(g.save, sp) !== null; },
    run: () => {
      const sp = petSpecies(followed);
      const r = sp && follower ? giveTreat(g.save, sp) : null;
      if (!r || !follower) return;
      g.persist();
      sfx('good');
      g.sparks.burst(g.above(follower.root.position, 1.0), '#ff7eb6', 18, 2);
      hop = 0.5;
      // the cat: a treat - «ням-ням»; a trick just learnt - it tells of it
      void g.speech.line(r.trick ? 'pet_trick' : 'pet_treat', 'hint', 4000);
      if (r.trick) { showTrick(r.trick); o.onTrick?.(r.trick); }
    },
  };
  /** The spots now: the world's pet waiting to be found, and the treat while a pet walks after her. */
  const live: Spot[] = [];

  /** The waiting pet and the follower as the save says now. */
  const refresh = () => {
    const chosen = petSpecies(g.save.pet);
    const walker = o.world ? followerOf(g.save, o.world) : chosen && foundPets(g.save).includes(chosen.id) ? chosen : undefined;
    const wait = mine && !found() && ready() ? mine : undefined;
    const nextFollower = walker ? actorOf(walker) : null;
    const nextWaiting = wait ? actorOf(wait) : null;
    if (nextWaiting && nextWaiting !== waiting) {
      // a pet that floats when it stops (`fly.rest`, under water) waits floating too, not lying on the floor
      const at = o.pet!.at;
      nextWaiting.root.position.set(at.x, g.groundY(at.x, at.z) + restOf(wait), at.z);
    }
    // a new follower starts at the height it stands at: the one found goes on from where it waited, no dip to the floor
    if (nextFollower !== follower) lift = restOf(walker);
    if (nextFollower && nextFollower !== follower && nextFollower !== waiting) {
      // A pet that joins (chosen, or loaded with the game) appears at its place by the heroine.
      const hp = g.hero.root.position;
      petPlace(hp, g.hero.heading, place);
      nextFollower.root.position.set(place.x, g.groundY(place.x, place.z) + restOf(walker), place.z);
      nextFollower.heading = g.hero.heading; nextFollower.root.rotation.y = g.hero.heading;
    }
    for (const a of actors.values()) {
      const shown = a === nextFollower || a === nextWaiting;
      if (shown && !a.root.parent) g.scene.add(a.root);
      else if (!shown && a.root.parent) g.scene.remove(a.root);
      a.root.userData.follows = a === nextFollower;
    }
    follower = nextFollower; waiting = nextWaiting; followed = g.save.pet ?? null;
    live.length = 0; live.push(...spots); if (follower) live.push(treatSpot);
  };
  refresh();
  let wasFound = found(), wasReady = ready();

  return {
    get spots() { return live; },
    get trick() { return trick; },
    tap(screenDist) {
      const sp = petSpecies(followed);
      if (gone || !follower || g.busy || !sp || trickT > 0) return false;
      const known = tricksKnown(g.save, sp.id);
      if (!known) return false;
      if (screenDist(top.copy(follower.root.position).setY(follower.root.position.y + sp.height * 0.6)) > 60) return false;
      showTrick(known);
      return true;
    },
    get follower() { return follower; },
    get waiting() { return waiting; },
    update: (dt) => {
      if (gone) return;
      for (const a of [follower, waiting]) {
        if (!a || a.root.userData.shadow === shadows) continue;
        a.root.userData.shadow = shadows;
        // each mesh back to what it cast before (the small parts of a model cast none, src/game/actor.ts)
        a.root.traverse((o) => { if (!(o as THREE.Mesh).isMesh) return; o.userData.cast ??= o.castShadow; o.castShadow = shadows && o.userData.cast === true; });
      }
      const f = found(), r = ready();
      if (f !== wasFound || r !== wasReady || (g.save.pet ?? null) !== followed) { wasFound = f; wasReady = r; refresh(); }
      if (follower) {
        const p = follower.root.position, hp = g.hero.root.position;
        const sp = petSpecies(followed), fly = sp?.fly && follower.has(sp.fly.clip) ? sp.fly : null;
        let going = false;
        if (g.busy) { moving = ''; follower.play('Idle', 0.3); }
        else {
          const lead = steer?.(dt, p);
          if (lead) place.set(lead.x, 0, lead.z); else petPlace(hp, g.hero.heading, place);
          const x0 = p.x, z0 = p.z;
          const d = followStep(p, place, g.cat.root.position, dt);
          g.ground.resolve(p, 0.3);
          // stuck or left far behind: it appears at its place behind her (CATCH_UP)
          const left = Math.hypot(place.x - p.x, place.z - p.z);
          if (left <= CATCH_UP.stuckM || left < best - 0.1) { best = left; stuckT = 0; } else stuckT += dt;
          if (trickT === 0 && (left > CATCH_UP.farM || stuckT >= CATCH_UP.stuckS)) {
            g.sparks.burst(g.above(p, 0.6), '#ffd1f0', 14, 2);
            p.set(place.x, p.y, place.z);
            g.sparks.burst(g.above(p, 0.6), '#ffd1f0', 24, 3);
            best = 0; stuckT = 0; lift = fly?.rest ?? 0;   // a flying pet appears where it stands (on the ground, or floating) and rises again
            real(p.x, p.z, dt);   // the jump is no speed: the next frame measures from here
          }
          const moved = Math.hypot(p.x - x0, p.z - z0);
          const speed = real(p.x, p.z, dt);
          if (d > NEAR && moved > 1e-4 && fly) {
            // it flies: its wings beat a little faster the faster it goes
            going = true;
            follower.face(Math.atan2(p.x - x0, p.z - z0), dt, 6);
            follower.play(fly.clip, 0.35, flapPace(speed));
            moving = fly.clip;
          } else if (d > NEAR && moved > 1e-4) {
            follower.face(Math.atan2(p.x - x0, p.z - z0), dt, 6);
            // the pace by the speed it goes at (src/game/stride.ts), smoothed in time; too fast for its walk, it runs if
            // it can, and walks again only well below that (no flicker between the two)
            const kind = petSpecies(followed), walk = kind?.walk ?? GROUND.fawnWalk;
            const canRun = !!kind?.run && follower.has(kind.run.clip);
            // the clip by the speed it is going to (a start from standing does not walk one frame, then gallop)
            galloping = canRun && Math.max(speed, followSpeed(d)) / walk > (galloping ? PET_WALK_BACK : PET_WALK_MAX);
            const [clip, target] = galloping && kind?.run
              ? [kind.run.clip, pace(speed, kind.run.ground, PET_RUN_MAX)] : ['Walk', pace(speed, walk, PET_WALK_MAX)];
            follower.play(clip, 0.35, moving !== clip ? steps.reset(target) : steps.next(target, dt));
            moving = clip;
          } else { galloping = false; moving = ''; follower.play('Idle', 0.3); follower.face(g.hero.heading, dt, 4); }
        }
        // a flying pet rises while it goes and comes down to stand (some 0.4 s either way) - to its `rest`, under water
        lift = fly ? ease(lift, going ? fly.height : (fly.rest ?? 0), dt) : 0;
        p.y = g.groundY(p.x, p.z) + lift;
        follower.update(dt);
        treatAt.copy(p);
        // the joy of a treat: a little hop; a trick: 1 - it spins round, 2 - it jumps up high, spinning
        if (hop > 0) { hop = Math.max(0, hop - dt); p.y += Math.sin((1 - hop / 0.5) * Math.PI) * 0.35; }
        if (trickT > 0) {
          trickT = Math.max(0, trickT - dt);
          const u = 1 - trickT / TRICK_S[trick];
          follower.root.rotation.y += u * Math.PI * 2;
          if (trick === 2) p.y += Math.sin(u * Math.PI) * 1.1;
          if (trickT === 0) trick = 0;
        }
      }
      if (waiting && waiting !== follower) waiting.update(dt);
    },
    dispose: () => {
      gone = true;
      for (const a of actors.values()) g.scene.remove(a.root);
      follower = waiting = null;
    },
  };
}
