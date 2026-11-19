import * as THREE from 'three';
import type { Rig } from '../core/assets';
import { sfx } from '../core/audio';
import type { Save } from '../core/save';
import type { SpokenKey } from '../ui/strings';
import { Actor } from './actor';
import type { Game } from './context';
import type { Spot } from './player';
import { GROUND, PET_RUN_MAX, PET_WALK_MAX, pace, speedometer } from './stride';
import type { WorldDef } from './world';

/**
 * The pets (PLAY-09): one to find in each world (R18), and the one chosen walks after the heroine with the cat (R19).
 * The pet of a world is the item `pet` of the world description (R22): its done mark is `ws.flags.pet` of that world,
 * read from the save every time; where it stands and after which chain it shows itself is the world's (WorldDef.pet).
 * Which pets are found is the save's own list (`save.pets`), written by the find in whatever world it was made: a
 * species that waits in a world other than the one of its catalog entry is found there too.
 * The models are of the core (R23, R46): the shared load (src/game/boot.ts) brings the model of every species once.
 */

/**
 * A kind of pet: its id (what `save.pet` holds), the world it is found in, its model of the core, its height (m) and the
 * speeds over the ground of its walk and, if it has one, of its run at a pace of 1 (src/game/stride.ts, tools/feet.mjs).
 */
export interface PetSpecies {
  readonly id: string; readonly world: string; readonly model: string; readonly height: number;
  readonly walk: number; readonly run?: { readonly clip: string; readonly ground: number };
}

/** The pet of a world as the world describes it (WorldDef.pet). */
export type WorldPet = NonNullable<WorldDef['pet']>;

/** The name of a world's flag that marks its pet found; also the id of the item `pet` (R22, rules 1 and 2). */
export const PET_FLAG = 'pet';

/** Every pet of every world. The ids are the ones `save.pet` stores (src/core/save.ts PET_IDS lists the same). */
export const PETS: readonly PetSpecies[] = [
  // R57 (Q1): the fawn of the first world: the model of its grown-up made small. A model file of the core, not a world's name:
  // src/game/shared-code.test.ts allows this one exact string in this file only.
  { id: 'fawn', world: 'fairy', model: 'animals_pack/Deer', height: 0.85, walk: GROUND.fawnWalk, run: { clip: 'Gallop', ground: GROUND.fawnGallop } },
];

export const petSpecies = (id: string | null | undefined): PetSpecies | undefined => PETS.find((p) => p.id === id);

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

/** The radius of the action spot around the place of a pet: it covers `at` (R22, rule 3). */
export const PET_SPOT_R = 2.2;
/** Where the pet walks: behind the heroine on her left, the cat keeps to her right (src/game/companion.ts). */
const SIDE = 0.9, BACK = 0.7;
/** The pet never comes nearer the cat than this (m): the two do not push into each other. */
export const PET_GAP = 0.8;
/** Closer than this to its place by the heroine, the pet stands. */
const NEAR = 0.45;

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
export function foundPets(save: Save): string[] {
  const listed = Array.isArray(save.pets) ? save.pets : [];
  return PETS.filter((p) => listed.includes(p.id) || flagsOf(save, p.world)?.[PET_FLAG] === true).map((p) => p.id);
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
    const step = Math.min(Math.min(7, d * 3.2) * dt, d);
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
}

/** What of the game the pets use; `busy` and the rest are read live through it. */
export type PetHost = Pick<Game, 'scene' | 'save' | 'ws' | 'hero' | 'cat' | 'busy' | 'groundY' | 'ground' | 'persist' | 'sparks' | 'speech' | 'above'>;

/**
 * The pets in the world being played. `pet` is the world's own (WorldDef.pet, absent: the world has none), `rigs` the
 * models of the shared load by species id, `chainDone` tells whether the chain of a character is finished.
 */
export function createPets(g: PetHost, o: {
  pet?: WorldPet; rigs: Readonly<Record<string, Rig>>; chainDone(id: string): boolean;
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
        if (FOUND_LINE) void g.speech.line(FOUND_LINE, 'story');
      },
    });
  }

  /** The waiting pet and the follower as the save says now. */
  const refresh = () => {
    const chosen = petSpecies(g.save.pet);
    const walker = chosen && foundPets(g.save).includes(chosen.id) ? chosen : undefined;
    const wait = mine && !found() && ready() ? mine : undefined;
    const nextFollower = walker ? actorOf(walker) : null;
    const nextWaiting = wait ? actorOf(wait) : null;
    if (nextWaiting && nextWaiting !== waiting) {
      const at = o.pet!.at;
      nextWaiting.root.position.set(at.x, g.groundY(at.x, at.z), at.z);
    }
    if (nextFollower && nextFollower !== follower && nextFollower !== waiting) {
      // A pet that joins (chosen, or loaded with the game) appears at its place by the heroine.
      const hp = g.hero.root.position;
      petPlace(hp, g.hero.heading, place);
      nextFollower.root.position.set(place.x, g.groundY(place.x, place.z), place.z);
      nextFollower.heading = g.hero.heading; nextFollower.root.rotation.y = g.hero.heading;
    }
    for (const a of actors.values()) {
      const shown = a === nextFollower || a === nextWaiting;
      if (shown && !a.root.parent) g.scene.add(a.root);
      else if (!shown && a.root.parent) g.scene.remove(a.root);
      a.root.userData.follows = a === nextFollower;
    }
    follower = nextFollower; waiting = nextWaiting; followed = g.save.pet ?? null;
  };
  refresh();
  let wasFound = found(), wasReady = ready();

  return {
    spots,
    get follower() { return follower; },
    get waiting() { return waiting; },
    update: (dt) => {
      if (gone) return;
      const f = found(), r = ready();
      if (f !== wasFound || r !== wasReady || (g.save.pet ?? null) !== followed) { wasFound = f; wasReady = r; refresh(); }
      if (follower) {
        const p = follower.root.position, hp = g.hero.root.position;
        if (g.busy) follower.play('Idle', 0.3);
        else {
          petPlace(hp, g.hero.heading, place);
          const x0 = p.x, z0 = p.z;
          const d = followStep(p, place, g.cat.root.position, dt);
          g.ground.resolve(p, 0.3);
          const moved = Math.hypot(p.x - x0, p.z - z0);
          const speed = real(p.x, p.z, dt);
          if (d > NEAR && moved > 1e-4) {
            follower.face(Math.atan2(p.x - x0, p.z - z0), dt);
            // the pace by the speed it goes at (src/game/stride.ts); too fast for its walk, it runs if it can
            const kind = petSpecies(followed);
            const run = kind?.run && follower.has(kind.run.clip) && speed / kind.walk > PET_WALK_MAX ? kind.run : null;
            if (run) follower.play(run.clip, 0.2, pace(speed, run.ground, PET_RUN_MAX));
            else follower.play('Walk', 0.15, pace(speed, kind?.walk ?? GROUND.fawnWalk, PET_WALK_MAX));
          } else { follower.play('Idle', 0.3); follower.face(g.hero.heading, dt, 4); }
        }
        p.y = g.groundY(p.x, p.z);
        follower.update(dt);
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
