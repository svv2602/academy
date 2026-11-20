// @vitest-environment happy-dom
// A page for the registry of worlds (src/worlds/index.ts): the real worlds are read for their descriptions only.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Rig } from '../core/assets';
import { defaultSave, worldState, type Save } from '../core/save';
import { Actor } from './actor';
import {
  PETS, PET_FLAG, PET_GAP, PET_SPOT_R, choosePet, steerPet, petShadows, petProblems, createPets, followStep, foundPets, markFound, petPlace,
  type PetHost, type WorldPet,
} from './pets';
import { WORLDS } from '../worlds';

vi.mock('../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: vi.fn() }));
// The particles draw their sprite on a canvas at import; the page of the tests has no 2D context.
vi.mock('./fx', () => ({ glowTex: null, Sparks: class {} }));

const FAWN = PETS[0];
/** A world of the tests (the real first world declares its pet later): its pet stands at (10, -4) after the chain `owl`. */
const WORLD = FAWN.world;
const TEST_PET: WorldPet = { species: FAWN.id, at: { x: 10, z: -4 }, after: 'owl' };

const fakeRig = (): Rig => ({ root: new THREE.Group(), model: new THREE.Object3D(), clips: new Map() });

function host(save: Save = defaultSave(), world = WORLD) {
  const scene = new THREE.Scene();
  const hero = new Actor(fakeRig()), cat = new Actor(fakeRig());
  cat.root.position.set(1, 0, 0.6);
  const g = {
    scene, save, ws: worldState(save, world), hero, cat, busy: false,
    groundY: () => 0, ground: { resolve: () => {} }, persist: vi.fn(), sparks: { burst: vi.fn() },
    speech: { line: vi.fn() }, above: (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy),
  } as unknown as PetHost & { busy: boolean; persist: ReturnType<typeof vi.fn> };
  return g;
}
const rigs = () => ({ [FAWN.id]: fakeRig() });

describe('the catalog of pets (PLAY-09, R18, R57)', () => {
  it('one pet for each world, ids unique; the first world\'s is the fawn, its grown-up\'s model made small', () => {
    expect(new Set(PETS.map((p) => p.id)).size).toBe(PETS.length);
    expect(new Set(PETS.map((p) => p.world)).size).toBe(PETS.length);
    expect(FAWN).toMatchObject({ id: 'fawn', world: 'fairy', model: 'animals_pack/Deer' });
    // Smaller than the grown-up of the first world (1.55 m in src/worlds/fairy/load.ts) and than the heroine.
    expect(FAWN.height).toBeLessThan(1);
  });

  it('every world that declares a pet: its species is in the catalog, of that world, and its `after` is one of its characters', () => {
    expect(WORLDS.flatMap((w) => petProblems(w))).toEqual([]);
  });

  it('every world\'s pet stands farther from the character it comes after than that one\'s talk spot reaches: one button, not two', () => {
    // TALK_R: the radius of a character's spot "talk" (src/worlds/fairy/index.ts, `r: 3.0`); the pet's own covers PET_SPOT_R.
    const TALK_R = 3.0;
    const near = WORLDS.flatMap((w) => {
      const c = w.pet?.after === undefined ? undefined : w.characters.find((x) => x.id === w.pet!.after);
      const d = c && w.pet ? Math.hypot(w.pet.at.x - c.x, w.pet.at.z - c.z) : Infinity;
      return d > TALK_R ? [] : [`${w.id}: the pet at ${w.pet!.at.x},${w.pet!.at.z} is ${d.toFixed(2)} m from "${c!.id}"`];
    });
    expect(near).toEqual([]);
    // the first world declares its pet (PLAY-09): the fawn, after the deer's chain
    expect(WORLDS.find((w) => w.id === FAWN.world)?.pet).toMatchObject({ species: FAWN.id, after: 'deer' });
  });

  it('the check catches an unknown species, one of another world, and an `after` that names no character', () => {
    const owl = [{ id: 'owl' }];
    expect(petProblems({ id: WORLD, characters: owl })).toEqual([]);
    expect(petProblems({ id: WORLD, pet: TEST_PET, characters: owl })).toEqual([]);
    expect(petProblems({ id: WORLD, pet: TEST_PET, characters: [{ id: 'hedgehog' }] })).toHaveLength(1);
    expect(petProblems({ id: WORLD, pet: { ...TEST_PET, species: 'dragon' }, characters: owl })).toHaveLength(1);
    expect(petProblems({ id: 'forest', pet: TEST_PET, characters: owl })).toHaveLength(1);
    // a test world may borrow the species of another world; a test world still needs a species of the catalog and its character
    expect(petProblems({ id: 'forest', pet: TEST_PET, characters: owl, test: true })).toEqual([]);
    expect(petProblems({ id: 'forest', pet: TEST_PET, characters: owl, test: false })).toHaveLength(1);
    expect(petProblems({ id: 'forest', pet: { ...TEST_PET, species: 'dragon' }, characters: owl, test: true })).toHaveLength(1);
    expect(petProblems({ id: 'forest', pet: TEST_PET, characters: [{ id: 'hedgehog' }], test: true })).toHaveLength(1);
  });
});

describe('found and chosen (R22: the mark is ws.flags.pet of the world)', () => {
  it('found: the flag `pet` of the pet\'s world, read from the save; the first one found is chosen by itself', () => {
    const save = defaultSave();
    expect(foundPets(save)).toEqual([]);
    markFound(save, worldState(save, WORLD), FAWN);
    expect(save.worlds[WORLD].flags[PET_FLAG]).toBe(true);
    expect(save.pet).toBe(FAWN.id);
    // Read from the save every time: a save loaded with the flag has it found.
    const other = defaultSave();
    worldState(other, WORLD).flags.pet = true;
    expect(foundPets(other)).toEqual([FAWN.id]);
  });

  it('found is the save\'s list of species found (`save.pets`); a save written before the list keeps the flag rule', () => {
    const save = defaultSave();
    markFound(save, worldState(save, WORLD), FAWN);
    markFound(save, worldState(save, WORLD), FAWN);
    expect(save.pets).toEqual([FAWN.id]);
    const listed = defaultSave();
    listed.pets = [FAWN.id, 'owl'];
    expect(foundPets(listed)).toEqual([FAWN.id]);
    const before = defaultSave();
    worldState(before, WORLD).flags.pet = true;
    expect(['pets' in before, foundPets(before)]).toEqual([false, [FAWN.id]]);
  });

  it('a second world: the fawn found in the world "probe" is found and chosen, and walks after her in the first world after a reload', () => {
    const save = defaultSave();
    const g = host(save, 'probe');
    const pets = createPets(g, { pet: TEST_PET, rigs: rigs(), chainDone: () => true });
    pets.spots[0].run();
    // the done mark is the probe world's own flag; the catalog's world (the first one) holds nothing
    expect(save.worlds.probe.flags[PET_FLAG]).toBe(true);
    expect(save.worlds[WORLD]).toBeUndefined();
    expect(save.pets).toEqual([FAWN.id]);
    expect(foundPets(save)).toEqual([FAWN.id]);
    pets.update(0.016);
    expect(pets.follower).not.toBeNull();
    // left at home, chosen again in the book
    expect(choosePet(save, null)).toBe(true);
    expect(choosePet(save, FAWN.id)).toBe(true);
    // the save read anew, the first world entered (it has no pet of its own here): the fawn follows from the first frame
    const again = JSON.parse(JSON.stringify(save)) as Save;
    const g2 = host(again);
    const p2 = createPets(g2, { rigs: rigs(), chainDone: () => false });
    expect(p2.follower!.root.parent).toBe(g2.scene);
    expect(p2.follower!.root.name).toBe(`pet:${FAWN.id}`);
    expect(p2.follower!.root.userData.follows).toBe(true);
  });

  it('a pet chosen before stays chosen when another one is found', () => {
    const save = defaultSave();
    save.pet = FAWN.id;
    markFound(save, worldState(save, WORLD), FAWN);
    expect(save.pet).toBe(FAWN.id);
  });

  it('choosing an unknown pet, or one not found yet, is refused; a found one and none are taken', () => {
    const save = defaultSave();
    expect(choosePet(save, FAWN.id)).toBe(false);
    expect(choosePet(save, 'dragon')).toBe(false);
    expect(save.pet).toBeUndefined();
    worldState(save, WORLD).flags.pet = true;
    expect(choosePet(save, FAWN.id)).toBe(true);
    expect(save.pet).toBe(FAWN.id);
    expect(choosePet(save, null)).toBe(true);
    expect(save.pet).toBeNull();
  });
});

describe('the pet in the world (R22 rule 3) and after the heroine (R19)', () => {
  it('a world without a pet: no spot, no model in the scene, nothing follows', () => {
    const g = host();
    const pets = createPets(g, { rigs: rigs(), chainDone: () => true });
    pets.update(0.016);
    expect([pets.spots.length, pets.follower, pets.waiting, g.scene.children.length]).toEqual([0, null, null, 0]);
  });

  it('the spot covers the place, and is on only after the chain and until the pet is found', () => {
    const g = host();
    let done = false;
    const pets = createPets(g, { pet: TEST_PET, rigs: rigs(), chainDone: (id) => id === 'owl' && done });
    expect(pets.spots).toHaveLength(1);
    const spot = pets.spots[0];
    expect(Math.hypot(spot.pos.x - TEST_PET.at.x, spot.pos.z - TEST_PET.at.z)).toBeLessThan(spot.r);
    expect(spot.r).toBe(PET_SPOT_R);
    expect(spot.on()).toBe(false);
    expect(pets.waiting).toBeNull();
    done = true; pets.update(0.016);
    expect(spot.on()).toBe(true);
    expect(pets.waiting!.root.parent).toBe(g.scene);
    expect(pets.waiting!.root.position.x).toBe(TEST_PET.at.x);
    spot.run();
    expect(g.ws.flags[PET_FLAG]).toBe(true);
    expect(g.save.pet).toBe(FAWN.id);
    expect(g.persist).toHaveBeenCalled();
    expect(spot.on()).toBe(false);
    pets.update(0.016);
    // Found and chosen: the very pet now walks after her.
    expect(pets.follower).not.toBeNull();
    expect(pets.waiting).toBeNull();
  });

  it('a pet without `after` waits at once; a found pet of the save follows from the first frame', () => {
    const g = host();
    const pets = createPets(g, { pet: { species: FAWN.id, at: { x: 3, z: 3 } }, rigs: rigs(), chainDone: () => false });
    expect(pets.spots[0].on()).toBe(true);
    const save = defaultSave();
    worldState(save, WORLD).flags.pet = true; save.pet = FAWN.id;
    const g2 = host(save);
    const p2 = createPets(g2, { rigs: rigs(), chainDone: () => false });
    expect(p2.follower!.root.parent).toBe(g2.scene);
  });

  it('follows: the distance to her place settles, it never comes nearer the cat than PET_GAP', () => {
    const save = defaultSave();
    worldState(save, WORLD).flags.pet = true; save.pet = FAWN.id;
    const g = host(save);
    const pets = createPets(g, { rigs: rigs(), chainDone: () => false });
    const p = pets.follower!.root.position;
    g.hero.root.position.set(20, 0, 20);
    for (let i = 0; i < 400; i++) {
      g.cat.root.position.copy(petPlace(g.hero.root.position, g.hero.heading + Math.PI)).setY(0);
      g.hero.root.position.x += 0.02;
      pets.update(1 / 60);
      expect(Math.hypot(p.x - g.cat.root.position.x, p.z - g.cat.root.position.z)).toBeGreaterThanOrEqual(PET_GAP - 1e-9);
    }
    const place = petPlace(g.hero.root.position, g.hero.heading);
    expect(Math.hypot(p.x - place.x, p.z - place.z)).toBeLessThan(1);
  });

  it('a world may lead it elsewhere for a while (steerPet): it goes there, and by her side again once undone', () => {
    const save = defaultSave();
    worldState(save, WORLD).flags.pet = true; save.pet = FAWN.id;
    const g = host(save);
    const pets = createPets(g, { rigs: rigs(), chainDone: () => false });
    const p = pets.follower!.root.position;
    g.cat.root.position.set(-30, 0, -30);
    const undo = steerPet(() => ({ x: 6, z: 2 }));
    for (let i = 0; i < 600; i++) pets.update(1 / 60);
    expect(Math.hypot(p.x - 6, p.z - 2)).toBeLessThan(0.6);
    undo();
    for (let i = 0; i < 600; i++) pets.update(1 / 60);
    const place = petPlace(g.hero.root.position, g.hero.heading);
    expect(Math.hypot(p.x - place.x, p.z - place.z)).toBeLessThan(0.6);
    // an undo of a steer replaced since is nothing
    const second = steerPet(() => ({ x: -6, z: 0 }));
    undo();
    for (let i = 0; i < 600; i++) pets.update(1 / 60);
    expect(Math.hypot(p.x + 6, p.z)).toBeLessThan(0.6);
    second();
  });

  it('its shadow off where a world asks (petShadows): no mesh of it casts one; undone, each casts what it did before', () => {
    const save = defaultSave();
    worldState(save, WORLD).flags.pet = true; save.pet = FAWN.id;
    const g = host(save), rig = fakeRig();
    const big = new THREE.Mesh(new THREE.BoxGeometry()), small = new THREE.Mesh(new THREE.BoxGeometry());
    big.castShadow = true; small.castShadow = false;   // a small part of a model casts none (src/game/actor.ts)
    rig.root.add(big, small);
    const pets = createPets(g, { rigs: { [FAWN.id]: rig }, chainDone: () => false });
    const casting = () => { const out: boolean[] = []; pets.follower!.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o.castShadow); }); return out; };
    pets.update(1 / 60);
    const before = casting();
    expect(before).toContain(true);
    const undo = petShadows(false);
    pets.update(1 / 60);
    expect(casting().every((c) => !c)).toBe(true);
    undo();
    pets.update(1 / 60);
    expect(casting()).toEqual(before);
  });

  it('stands while a scene runs (g.busy)', () => {
    const save = defaultSave();
    worldState(save, WORLD).flags.pet = true; save.pet = FAWN.id;
    const g = host(save);
    const pets = createPets(g, { rigs: rigs(), chainDone: () => false });
    const p = pets.follower!.root.position, x = p.x;
    g.hero.root.position.set(30, 0, 0); g.busy = true;
    for (let i = 0; i < 30; i++) pets.update(1 / 60);
    expect(p.x).toBe(x);
  });

  it('dispose: the pets leave the scene and the frame', () => {
    const save = defaultSave();
    worldState(save, WORLD).flags.pet = true; save.pet = FAWN.id;
    const g = host(save);
    const pets = createPets(g, { pet: TEST_PET, rigs: rigs(), chainDone: () => true });
    pets.dispose();
    pets.update(0.016);
    expect(g.scene.children).toHaveLength(0);
    expect(pets.follower).toBeNull();
    expect(pets.spots.every((s) => !s.on())).toBe(true);
  });

  it('followStep: on the cat, it stands off by PET_GAP', () => {
    const p = { x: 0, z: 0 };
    followStep(p, { x: 0, z: 0 }, { x: 0, z: 0 }, 0.016);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(PET_GAP);
  });
});

describe('the wiring of the frame (src/game/loop.ts, src/game/context.ts)', () => {
  const raw = import.meta.glob(['./loop.ts', './context.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  it('the frame moves the pets after the cat and hands their spots to the heroine with the world\'s', () => {
    const loop = raw['./loop.ts'];
    expect(loop).toMatch(/\n\s*companion\.update\(dt\);\n\s*g\.pets\.update\(dt\);/);
    // a find of the collections touched while she is free to move first, then the world's tap (PLAY-25)
    expect(loop).toMatch(/player\.tap\(canMove, here, \(dist\) => \(canMove && g\.collect\.tap\(dist\)\) \|\| world\.tap\(dist\)\)/);
    expect(loop).toMatch(/player\.prompt\(canMove, here\)/);
    expect(loop).toMatch(/spots\.push\(\.\.\.world\.spots, \.\.\.g\.pets\.spots, \.\.\.g\.mystery\.spots\)/);
  });
  it('the game makes the pets of the world played, with the models of the shared load', () => {
    // `g.world`, not the world of the launch: the pets are made anew for every world entered (TECH-15, src/game/travel.ts)
    expect(raw['./context.ts']).toMatch(/createPets\(g, \{\n\s*pet: g\.world\.pet, rigs: o\.shared\.petRigs,/);
  });
});
