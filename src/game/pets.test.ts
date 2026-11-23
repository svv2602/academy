// @vitest-environment happy-dom
// A page for the registry of worlds (src/worlds/index.ts): the real worlds are read for their descriptions only.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Rig } from '../core/assets';
import { defaultSave, worldState, type Save } from '../core/save';
import { Actor } from './actor';
import { wearPetGear } from './petgear';
import {
  CATCH_UP,
  PETS, PET_FLAG, PET_GAP, PET_SPOT_R, FLAP_MAX, flapPace, loadOwnPets, ownFound, ownPetRigs, petSpecies, choosePet, steerPet, petShadows, followerOf, giveTreat, treatKind, tricksKnown, TRICKS_AT, petProblems, createPets, followStep, foundPets, markFound, petPlace,
  type PetHost, type WorldPet,
} from './pets';
import { WORLDS } from '../worlds';
import { COLLECT_KINDS } from './collections';

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

  it('every world\'s pet stands farther from each of its characters than their talk spot reaches: there, its own button', () => {
    // TALK_R: the radius of a character's spot "talk" (src/worlds/fairy/index.ts, `r: 3.0`); the pet's own covers PET_SPOT_R.
    // Where both reach, the character's button shows (src/game/player.ts spotOrder: a world's spot wins over a pet's);
    // at the pet itself it must be the pet's.
    const TALK_R = 3.0;
    const near = WORLDS.flatMap((w) => (w.pet ? w.characters : []).flatMap((c) => {
      const d = Math.hypot(w.pet!.at.x - c.x, w.pet!.at.z - c.z);
      return d > TALK_R ? [] : [`${w.id}: the pet at ${w.pet!.at.x},${w.pet!.at.z} is ${d.toFixed(2)} m from "${c.id}"`];
    }));
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

  it('a talk begins while it gallops: it stands with Idle, never runs on the spot (as the cat, src/game/companion.ts)', () => {
    const save = defaultSave();
    worldState(save, WORLD).flags.pet = true; save.pet = FAWN.id;
    const g = host(save);
    // a rig with the clips of the fawn: the clip it plays can be read
    const clips = new Map(['Idle', 'Walk', 'Gallop'].map((n) => [n, new THREE.AnimationClip(n, 1, [])]));
    const pets = createPets(g, { rigs: { [FAWN.id]: { root: new THREE.Group(), model: new THREE.Object3D(), clips } }, chainDone: () => false });
    const playing = () => pets.follower!.playing;
    g.hero.root.position.set(8, 0, 0);   // nearer than CATCH_UP.farM: it goes to her
    for (let i = 0; i < 20; i++) pets.update(1 / 60);
    expect(['Walk', 'Gallop']).toContain(playing());
    const p = pets.follower!.root.position.clone();
    g.busy = true;                    // the talk: a scene holds the controls while the fawn is on its way
    for (let i = 0; i < 300; i++) pets.update(1 / 60);
    expect(playing()).toBe('Idle');
    expect(pets.follower!.root.position.distanceTo(p)).toBe(0);   // it stands where the talk found it
    // the talk over: it goes on to her
    g.busy = false;
    for (let i = 0; i < 5; i++) pets.update(1 / 60);
    expect(['Walk', 'Gallop']).toContain(playing());
  });

describe('the pet catches up (CATCH_UP)', () => {
  /** A world of round obstacles resolved as the first world resolves them (src/worlds/fairy/terrain.ts). */
  const world = (cols: { x: number; z: number; r: number }[]) => {
    const save = defaultSave();
    worldState(save, WORLD).flags.pet = true; save.pet = FAWN.id;
    const g = host(save);
    (g as unknown as { ground: unknown }).ground = { resolve: (p: { x: number; z: number }, radius: number) => {
      for (const c of cols) {
        const dx = p.x - c.x, dz = p.z - c.z, m = c.r + radius, d2 = dx * dx + dz * dz;
        if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
      }
    } };
    const pets = createPets(g, { rigs: rigs(), chainDone: () => false });
    // she faces +x and is put 10 m on: its place 0.7 m behind her
    g.hero.heading = Math.PI / 2;
    g.hero.root.position.set(10, 0, 0); g.cat.root.position.set(10.5, 0, -0.9);
    const run = (s: number) => { for (let i = 0; i < s * 60; i++) pets.update(1 / 60); };
    const near = () => pets.follower!.root.position.distanceTo(g.hero.root.position);
    const bursts = () => (g.sparks.burst as ReturnType<typeof vi.fn>).mock.calls.length;
    return { g, pets, run, near, bursts };
  };

  it('one tree on its way: it slides round it by itself, no catching up', () => {
    const w = world([{ x: 5, z: 0.9, r: 0.8 }]);
    w.run(5);
    expect(w.near()).toBeLessThan(CATCH_UP.stuckM);
    expect(w.bursts()).toBe(0);
  });

  it.each([
    ['a pocket of two trees', [{ x: 5, z: 0.1, r: 0.8 }, { x: 5, z: 1.7, r: 0.8 }]],
    ['a row across its way (a fence, bushes)', [-3, -2, -1, 0, 1, 2, 3, 4, 5].map((k) => ({ x: 5, z: 0.9 + k, r: 0.6 }))],
  ])('%s: it would stand there for good - it appears behind her with sparkles within a couple of seconds', (_, cols) => {
    const w = world(cols);
    w.run(CATCH_UP.stuckS + 1.5);
    expect(w.near()).toBeLessThan(CATCH_UP.stuckM);
    expect(w.bursts()).toBe(2);   // where it stood and where it comes
  });

  it('left far behind (she ran off, was put elsewhere): it is by her at once', () => {
    const w = world([]);
    w.g.hero.root.position.set(40, 0, 0);
    w.run(0.1);
    expect(w.near()).toBeLessThan(CATCH_UP.stuckM);
    expect(w.bursts()).toBe(2);
  });

  it('a scene holds the game: it stands where it is, stuck or far, and catches up only after', () => {
    const w = world([{ x: 5, z: 0.1, r: 0.8 }, { x: 5, z: 1.7, r: 0.8 }]);
    w.g.busy = true;
    w.g.hero.root.position.set(40, 0, 0);
    w.run(3);
    expect(w.near()).toBeGreaterThan(30);
    expect(w.bursts()).toBe(0);
    w.g.busy = false;
    w.run(0.1);
    expect(w.near()).toBeLessThan(CATCH_UP.stuckM);
  });
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
    // a find of the collections touched while she is free to move first, then the pet's trick (PLAY-27), then the world's tap (PLAY-25)
    expect(loop).toMatch(/player\.tap\(canMove, here, \(dist\) => \(canMove && g\.collect\.tap\(dist\)\) \|\| \(canMove && g\.pets\.tap\(dist\)\) \|\| world\.tap\(dist\)\)/);
    expect(loop).toMatch(/player\.prompt\(canMove, here\)/);
    // the world's, the pets' and the stars' spots in the order of ./player.ts spotOrder (the world's win over the treat)
    expect(loop).toMatch(/spotOrder\(world\.spots, g\.pets\.spots, g\.mystery\.spots, spots\)/);
  });
  it('the game makes the pets of the world played, with the models of the shared load and of the world entered', () => {
    // `g.world`, not the world of the launch: the pets are made anew for every world entered (TECH-15, src/game/travel.ts)
    expect(raw['./context.ts']).toMatch(/createPets\(g, \{\n\s*pet: g\.world\.pet, rigs: \{ \.\.\.o\.shared\.petRigs, \.\.\.ownPetRigs\(g\.world\.id\) \},/);
  });
});

describe('which pet walks after her where (the rule of 2026-11-20: a pet lives in its own world and comes to the Tree)', () => {
  const OWL = { ...FAWN, id: 'owl', world: 'forest' };
  const CATALOG = [FAWN, OWL];
  const FAIRY = { id: 'fairy', shelf: 0 }, FOREST = { id: 'forest', shelf: 1 }, HUB = { id: 'hub' }, PROBE = { id: 'probe', shelf: 1, test: true };
  const saveWith = (pets: string[], pet: string | null) => { const s = defaultSave(); s.pets = pets; s.pet = pet; return s; };
  const who = (s: Save, w: { id: string; shelf?: number; test?: boolean }) => followerOf(s, w, CATALOG)?.id ?? null;

  it('in a world of the shelf its own pet, if found; whichever is chosen in the book', () => {
    expect(who(saveWith(['fawn'], 'fawn'), FAIRY)).toBe('fawn');
    expect(who(saveWith(['fawn', 'owl'], 'owl'), FAIRY)).toBe('fawn');
    expect(who(saveWith(['fawn', 'owl'], 'fawn'), FOREST)).toBe('owl');
  });

  it('a pet of another world does not come into a world: none there if its own is not found', () => {
    expect(who(saveWith(['fawn'], 'fawn'), FOREST)).toBeNull();
  });

  it('in the hub and in a test world the one chosen in the book', () => {
    expect(who(saveWith(['fawn', 'owl'], 'owl'), HUB)).toBe('owl');
    expect(who(saveWith(['fawn', 'owl'], 'fawn'), HUB)).toBe('fawn');
    expect(who(saveWith(['fawn'], 'fawn'), PROBE)).toBe('fawn');
    expect(who(saveWith([], 'fawn'), HUB)).toBeNull();
  });

  it('nothing chosen in the book: none anywhere', () => {
    for (const w of [FAIRY, FOREST, HUB, PROBE]) expect(who(saveWith(['fawn', 'owl'], null), w)).toBeNull();
  });

  it('in the game: the fawn chosen walks in the fairy world and in the hub, not in the forest', () => {
    for (const [world, walks] of [[FAIRY, true], [HUB, true], [FOREST, false]] as const) {
      const save = defaultSave();
      worldState(save, 'fairy').flags.pet = true; save.pet = FAWN.id;
      const g = host(save, world.id);
      const pets = createPets(g, { rigs: rigs(), chainDone: () => false, world });
      expect(pets.follower !== null, world.id).toBe(walks);
    }
  });
});

describe('the treats (PLAY-27): a find it likes from the stash, tricks after 5 and 15', () => {
  it('a treat takes one find it likes, the first it likes that the stash has; nothing it likes - nothing done', () => {
    const s = defaultSave();
    expect(treatKind(s, FAWN)).toBeNull();
    expect(giveTreat(s, FAWN)).toBeNull();
    expect(s.treats).toBeUndefined();
    s.stash = { feather: 3, mushroom: 2 };
    expect(treatKind(s, FAWN)).toBe('mushroom');
    s.stash.acorn = 1;
    expect(giveTreat(s, FAWN)).toEqual({ kind: 'acorn', count: 1, trick: 0 });
    expect(s.stash).toEqual({ feather: 3, mushroom: 2 });
    expect(s.treats).toEqual({ fawn: 1 });
  });

  it('the first trick on the 5th, the second on the 15th; known ones counted from the save', () => {
    expect(TRICKS_AT).toEqual([5, 15]);
    const s = defaultSave();
    s.stash = { mushroom: 20 };
    const tricks = Array.from({ length: 16 }, () => giveTreat(s, FAWN)!.trick);
    expect(tricks.map((t, i) => (t ? i + 1 : 0)).filter(Boolean)).toEqual([5, 15]);
    expect(tricks.filter(Boolean)).toEqual([1, 2]);
    expect(tricksKnown(s, 'fawn')).toBe(2);
    expect(s.stash).toEqual({ mushroom: 4 });
  });

  it('in the world: the treat spot only while a pet walks after her and the stash has what it likes; a tap on it shows a trick it knows', () => {
    const save = defaultSave();
    worldState(save, WORLD).flags.pet = true; save.pet = FAWN.id;
    const g = host(save);
    const tricks: number[] = [];
    const pets = createPets(g, { rigs: rigs(), chainDone: () => false, onTrick: (n) => tricks.push(n) });
    const spot = pets.spots.find((x) => x.label === 'treat')!;
    expect(spot).toBeTruthy();
    expect(spot.on()).toBe(false);                      // nothing it likes in the stash
    save.stash = { acorn: 5 };
    expect(spot.on()).toBe(true);
    for (let i = 0; i < 5; i++) spot.run();
    expect(save.treats).toEqual({ fawn: 5 });
    expect((g.speech.line as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['pet_treat', 'pet_treat', 'pet_treat', 'pet_treat', 'pet_trick']);
    expect(tricks).toEqual([1]);
    expect(pets.trick).toBe(1);
    for (let i = 0; i < 120; i++) pets.update(1 / 60);
    expect(pets.trick).toBe(0);
    expect(pets.tap(() => 10)).toBe(true);               // touched: it shows the trick it knows
    expect(pets.trick).toBe(1);
    expect(spot.on()).toBe(false);                      // the stash is out of acorns
    const none = createPets(host(defaultSave()), { rigs: rigs(), chainDone: () => false });
    expect(none.spots).toEqual([]);
    expect(none.tap(() => 0)).toBe(false);
  });
});

describe('the owlet of the forest (PLAY-09): a pet whose model is a file of its world, that flies after her', () => {
  const OWLET = petSpecies('owlet')!;
  /** A world's scope as the loader reads it: what it owns is undone by `end`. */
  const scopeOf = () => { const owned: (() => void)[] = []; return { own: (f: () => void) => { owned.push(f); }, end: () => owned.forEach((f) => f()) }; };
  const flyingRig = (): Rig => ({ root: new THREE.Group(), model: new THREE.Object3D(), clips: new Map(['Flap', 'Idle', 'Talk'].map((n) => [n, new THREE.AnimationClip(n, 1, [])])) });

  it('of the forest, its model a file of that world: the shared load leaves it out', () => {
    expect(OWLET).toMatchObject({ world: 'forest', model: 'forest/owlet', own: true, fly: { clip: 'Flap' } });
    expect(OWLET.height).toBeLessThan(0.7);         // smaller than Mudrena, its mother (0.7 m, src/worlds/forest/index.ts)
    expect(PETS.filter((p) => !p.own).map((p) => p.id)).not.toContain('owlet');
  });

  it('the world loads it into its own models; the end of the world forgets them', async () => {
    const scope = scopeOf(), load = vi.fn(async () => fakeRig());
    await loadOwnPets('forest', ['owlet', 'fawn'], scope, load);
    // only the `own` ones: the fawn is the core's
    expect(load.mock.calls).toEqual([[OWLET.model, OWLET.height]]);
    expect(Object.keys(ownPetRigs('forest'))).toEqual(['owlet']);
    expect(ownPetRigs('hub')).toEqual({});
    scope.end();
    expect(ownPetRigs('forest')).toEqual({});
  });

  it('no file (not in the cache, no network): no error, the owlet stays at home and the world plays on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scope = scopeOf();
    await expect(loadOwnPets('hub', ['owlet'], scope, () => Promise.reject(new Error('no file')))).resolves.toBeUndefined();
    expect(ownPetRigs('hub')).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
    // chosen and found, but with no model: none walks after her in the hub, and nothing breaks
    const save = defaultSave();
    worldState(save, 'forest').flags.pet = true; save.pet = 'owlet';
    const pets = createPets(host(save, 'hub'), { rigs: { ...rigs(), ...ownPetRigs('hub') }, chainDone: () => false, world: { id: 'hub' } });
    expect(pets.follower).toBeNull();
    expect(() => pets.update(1 / 60)).not.toThrow();
    warn.mockRestore(); scope.end();
  });

  it('its things (the leaf scarf, a trade\'s gift) hang on its model as a world loads it, the one it wears shown; gone with the world', async () => {
    const model = new THREE.Group(), root = new THREE.Bone(), body = new THREE.Bone();
    root.name = 'Root'; body.name = 'Body'; body.position.y = 0.19; root.add(body); model.add(root);
    const rig: Rig = { root: new THREE.Group().add(model), model, clips: new Map() };
    wearPetGear({}, 'owlet', 'owlet_leaf_scarf');
    const scope = scopeOf();
    await loadOwnPets('forest', ['owlet'], scope, () => Promise.resolve(rig));
    const scarf = body.getObjectByName('owlet_leaf_scarf')!;
    expect(scarf).toBeTruthy();
    expect(scarf.visible).toBe(true);                 // worn before the forest was entered: shown as it comes
    wearPetGear({}, 'owlet', null);
    expect(scarf.visible).toBe(false);                // taken off in the shop
    scope.end();
    wearPetGear({}, 'owlet', 'owlet_leaf_scarf');
    expect(scarf.visible).toBe(false);                // the world gone: its model no more worn on
    wearPetGear({}, 'owlet', null);
  });

  it('the hub loads the owlet once it is found, not before', () => {
    const save = defaultSave();
    expect(ownFound(save)).toEqual([]);
    markFound(save, worldState(save, 'forest'), OWLET);
    expect(ownFound(save)).toEqual(['owlet']);
    // the fawn found too: it is the core's, the hub does not load it
    markFound(save, worldState(save, 'fairy'), FAWN);
    expect(ownFound(save)).toEqual(['owlet']);
  });

  it('it flies after her: rises while it goes, flapping faster the faster; comes down to stand', () => {
    const save = defaultSave();
    worldState(save, 'forest').flags.pet = true; save.pet = 'owlet';
    const g = host(save, 'forest');
    const pets = createPets(g, { rigs: { owlet: flyingRig() }, chainDone: () => true, world: { id: 'forest', shelf: 1 } });
    const owl = pets.follower!;
    expect(owl).not.toBeNull();
    g.hero.root.position.set(6, 0, 0);
    for (let i = 0; i < 40; i++) { g.hero.root.position.x += 0.05; pets.update(1 / 60); }
    expect(owl.root.position.y).toBeGreaterThan(OWLET.fly!.height * 0.9);
    expect(owl.root.position.y).toBeLessThanOrEqual(OWLET.fly!.height + 1e-9);
    // she stops: it comes to her side and down onto the ground
    for (let i = 0; i < 600; i++) pets.update(1 / 60);
    expect(owl.root.position.y).toBeLessThan(0.01);
    expect(flapPace(0)).toBe(1);
    expect(flapPace(5.4)).toBeCloseTo(FLAP_MAX, 10);
    expect(flapPace(20)).toBeCloseTo(FLAP_MAX, 10);
  });

  it('it catches up flying (CATCH_UP): it appears on the ground by her and rises again, not in the air', () => {
    const save = defaultSave();
    worldState(save, 'forest').flags.pet = true; save.pet = 'owlet';
    const g = host(save, 'forest');
    const pets = createPets(g, { rigs: { owlet: flyingRig() }, chainDone: () => true, world: { id: 'forest', shelf: 1 } });
    const owl = pets.follower!;
    g.hero.root.position.set(6, 0, 0);
    for (let i = 0; i < 40; i++) { g.hero.root.position.x += 0.05; pets.update(1 / 60); }
    expect(owl.root.position.y).toBeGreaterThan(OWLET.fly!.height * 0.9);
    g.hero.root.position.set(60, 0, 0);   // farther than CATCH_UP.farM
    pets.update(1 / 60);
    expect(owl.root.position.distanceTo(g.hero.root.position)).toBeLessThan(CATCH_UP.stuckM + OWLET.fly!.height);
    expect(owl.root.position.y).toBeLessThan(OWLET.fly!.height * 0.2);
  });

  it('found: the world\'s own words, then what it will do; a world without its own says the shared one', () => {
    const save = defaultSave(), g = host(save, 'forest');
    const pet: WorldPet = { species: 'owlet', at: { x: 0, z: 0 }, found: 'forest_pet_found', follow: 'forest_pet_follow' };
    let said!: () => void;
    (g.speech.line as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise<void>((r) => { said = r; }));
    const pets = createPets(g, { pet, rigs: { owlet: flyingRig() }, chainDone: () => true, world: { id: 'forest', shelf: 1 } });
    pets.spots[0].run();
    const calls = () => (g.speech.line as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls()).toEqual(['forest_pet_found']);
    said();
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      expect(calls()).toEqual(['forest_pet_found', 'forest_pet_follow']);
      const g2 = host(defaultSave(), WORLD);
      createPets(g2, { pet: TEST_PET, rigs: rigs(), chainDone: () => true }).spots[0].run();
      expect((g2.speech.line as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['pet_found']);
    });
  });
});

describe('Bulchik of the sea (PLAY-09): his brother\'s model made small and lighter, that swims after her and floats', () => {
  const BULCHIK = petSpecies('bulchik')!;
  const OWLET = petSpecies('owlet')!;
  const scopeOf = () => { const owned: (() => void)[] = []; return { own: (f: () => void) => { owned.push(f); }, end: () => owned.forEach((f) => f()) }; };
  /** Bulk's clips (src/worlds/sea/index.ts: Idle, Talk, Swim) on a model of one mesh. */
  const swimmingRig = (): Rig => {
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#808080' })));
    return { root: new THREE.Group().add(model), model, clips: new Map(['Idle', 'Talk', 'Swim'].map((n) => [n, new THREE.AnimationClip(n, 1, [])])) };
  };
  const following = () => {
    const save = defaultSave();
    worldState(save, 'sea').flags.pet = true; save.pet = 'bulchik';
    const g = host(save, 'sea');
    const pets = createPets(g, { rigs: { bulchik: swimmingRig() }, chainDone: () => true, world: { id: 'sea', shelf: 2 } });
    return { g, pets, it: pets.follower! };
  };
  const rest = BULCHIK.fly!.rest!;

  it('of the sea, his brother Bulk\'s file (no file of his own), half as tall; the shared load leaves him out', () => {
    expect(BULCHIK).toMatchObject({ world: 'sea', model: 'sea/bulk', own: true, fly: { clip: 'Swim' } });
    expect(BULCHIK.height).toBeLessThan(0.9 * 0.6);   // Bulk is 0.9 m (src/worlds/sea/index.ts MODELS)
    expect(BULCHIK.fly!.rest).toBeGreaterThan(0.3);    // he floats where he stops: under water, not on the floor
    expect(BULCHIK.lighter).toBeGreaterThan(0);
    expect(PETS.filter((p) => !p.own).map((p) => p.id)).not.toContain('bulchik');
    // the owlet comes down to stand, as before
    expect(OWLET.fly!.rest ?? 0).toBe(0);
  });

  it('every pet\'s treats are kinds of finds the stash holds', () => {
    for (const p of PETS) for (const k of p.treats ?? []) {
      expect(Object.keys(COLLECT_KINDS), `${p.id}: ${k}`).toContain(k);
      expect(k, p.id).not.toBe('piece');
    }
  });

  it('the world and the hub load him lighter than his brother: each colour of his model times 1 + lighter', async () => {
    const scope = scopeOf(), r = swimmingRig(), load = vi.fn(async () => r);
    await loadOwnPets('sea', ['bulchik'], scope, load);
    expect(load.mock.calls).toEqual([[BULCHIK.model, BULCHIK.height]]);
    const mat = (r.model.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(mat.color.r).toBeCloseTo(new THREE.Color('#808080').r * (1 + BULCHIK.lighter!), 6);
    expect(ownPetRigs('sea').bulchik).toBe(r);
    scope.end();
    // the owlet has no `lighter`: its colours as the file has them
    const o = swimmingRig(), o0 = ((o.model.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.clone();
    const s2 = scopeOf();
    await loadOwnPets('forest', ['owlet'], s2, async () => o);
    expect(((o.model.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.equals(o0)).toBe(true);
    s2.end();
  });

  it('he swims after her on Swim, and where he stops he stays floating at his rest, not lying on the floor', () => {
    const { g, pets, it: b } = following();
    expect(b.root.position.y).toBeCloseTo(rest, 6);            // he joins floating, from the first frame
    g.hero.root.position.set(6, 0, 0);
    for (let i = 0; i < 40; i++) { g.hero.root.position.x += 0.05; pets.update(1 / 60); }
    expect(b.root.position.y).toBeGreaterThan(BULCHIK.fly!.height * 0.9);
    expect(b.root.position.y).toBeLessThanOrEqual(BULCHIK.fly!.height + 1e-9);
    expect(b.playing).toBe('Swim');
    for (let i = 0; i < 600; i++) pets.update(1 / 60);
    expect(b.playing).toBe('Idle');
    expect(b.root.position.y).toBeGreaterThan(rest * 0.95);
    expect(b.root.position.y).toBeLessThan(rest + 1e-6);
  });

  it('he catches up (CATCH_UP) floating at his rest, as he would stand there', () => {
    const { g, pets, it: b } = following();
    g.hero.root.position.set(6, 0, 0);
    for (let i = 0; i < 40; i++) { g.hero.root.position.x += 0.05; pets.update(1 / 60); }
    g.hero.root.position.set(60, 0, 0);   // farther than CATCH_UP.farM
    pets.update(1 / 60);
    expect(b.root.position.distanceTo(g.hero.root.position)).toBeLessThan(CATCH_UP.stuckM + BULCHIK.fly!.height);
    expect(b.root.position.y).toBeGreaterThan(rest * 0.95);
    expect(b.root.position.y).toBeLessThan(BULCHIK.fly!.height + 1e-6);
  });

  it('waiting to be found he floats at his rest; found, he swims on from there with no dip to the floor', () => {
    const save = defaultSave(), g = host(save, 'sea');
    const pet: WorldPet = { species: 'bulchik', at: { x: 4, z: 4 }, after: 'bulk', found: 'sea_pet_found', follow: 'sea_pet_follow' };
    (g.speech.line as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve());
    const pets = createPets(g, { pet, rigs: { bulchik: swimmingRig() }, chainDone: () => true, world: { id: 'sea', shelf: 2 } });
    const w = pets.waiting!;
    expect(w.root.position.y).toBeCloseTo(rest, 6);
    pets.spots[0].run();
    let low = Infinity;
    for (let i = 0; i < 120; i++) { pets.update(1 / 60); low = Math.min(low, pets.follower!.root.position.y); }
    expect(pets.follower).toBe(w);
    expect(low).toBeGreaterThan(rest * 0.95);
  });
});
