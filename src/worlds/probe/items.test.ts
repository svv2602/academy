// @vitest-environment happy-dom
// The probe world is not in the registry of the tests (it is listed only in a build made with --mode probe): its
// module is imported here directly.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, worldState, type WorldState } from '../../core/save';
import type { Game } from '../../game/context';
import { KINDS, ONE_EACH, PET_ITEM, describeWorld, missing, problems } from '../../game/describe';
import { flyoverOf, pathProblems, tour } from '../../game/flyover';
import { PETS, PET_SPOT_R, petProblems, petSpecies } from '../../game/pets';
import type { Spot } from '../../game/player';
import { createWorldScope } from '../../game/scope';
import type { Stage } from '../../game/stage';
import { SPOKEN, STRINGS } from '../../ui/strings';
import { probe } from './index';
import { ALTAR, FINALE, FINALE_SECONDS, GEM, PART, PET_AT, PROBE_FLYOVER, SCENE, SECRET, SPOT_R, STORY_SECONDS, TAKE_R, TOUR, createItems } from './items';

vi.mock('../../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: vi.fn() }));
// The particles draw their sprite on a canvas at import; the page of the tests has no 2D context.
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));
// The controls the tour hides, in the page before src/ui/ui.ts looks them up at import.
vi.hoisted(() => { for (const id of ['joy', 'btnJump', 'btnAct']) document.body.appendChild(document.createElement('div')).id = id; });

/** The places the world hands its items (src/worlds/probe/index.ts): the stump and the signboard. */
const STUMP = { x: 5, z: -2 }, SIGN = { x: -4, z: -3 };
const FRIEND = probe.characters[0];
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** A target of taps that counts its listeners. */
function taps() {
  const fns = new Set<EventListener>();
  return {
    fns,
    addEventListener: (_type: string, fn: EventListener) => { fns.add(fn); },
    removeEventListener: (_type: string, fn: EventListener) => { fns.delete(fn); },
    tap: () => { for (const fn of [...fns]) fn(new Event('pointerdown')); },
  };
}

/** The game as the items of the probe world use it, and one entry into the world (`enter` makes the next one). */
function host(ws: WorldState = worldState(defaultSave(), probe.id)) {
  const scene = new THREE.Scene();
  const g = {
    scene, ws, world: { id: probe.id, characters: probe.characters, pet: probe.pet, secrets: probe.secrets },
    hero: { root: { position: new THREE.Vector3(probe.spawn.x, 0, probe.spawn.z) } }, cam: { focus: null as THREE.Vector3 | null },
    camOverride: null as number | null, busy: false, auto: null,
    groundY: () => 0, persist: vi.fn(), sparks: { burst: vi.fn() }, above: (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy),
    speech: { line: vi.fn(async () => {}), caption: vi.fn() },
  };
  const stage: Stage = { busy: () => g.busy, take: () => { g.busy = true; }, release: () => { g.busy = false; g.cam.focus = null; } };
  const target = taps();
  const enter = () => {
    const scope = createWorldScope(scene);
    const picture = new THREE.Vector3(SIGN.x, 1.3, SIGN.z);
    const items = createItems(g as unknown as Game, stage, scope, { stump: STUMP, sign: SIGN, picture, taps: target });
    let time = 0;
    /** `seconds` of game time, frame by frame; then what a scene does once it is let go. */
    const run = async (seconds: number, canMove = !g.busy) => { for (let t = 0; t < seconds - 1e-9; t += 0.05) items.update(0.05, time += 0.05, canMove); await tick(); };
    const all = () => describeWorld(g, items.items());
    const item = (id: string) => all().find((i) => i.id === id)!;
    const spot = (label: string) => items.spots.find((s) => s.label === label)!;
    const stand = (p: { x: number; z: number }) => { g.hero.root.position.set(p.x, 0, p.z); };
    return { scope, items, run, all, item, spot, stand, picture };
  };
  return { g, ws, stage, target, enter };
}
const covers = (s: Spot, p: { x: number; z: number }) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) <= s.r;
/** Everything the finale comes after, done in the save. */
function allButFinale(ws: WorldState) {
  ws.quests[FRIEND.id] = FRIEND.steps.length;
  for (const f of [PET_ITEM, TOUR, SECRET, PART, SCENE]) ws.flags[f] = true;
}

describe('the probe world describes itself (ARCH-16, R28)', () => {
  it('one item of every kind, in the order they are done; the description lacks nothing a test world needs', () => {
    const { all } = host().enter();
    expect(all().map((i) => `${i.kind} ${i.id} ${i.how}`)).toEqual([
      `chain ${FRIEND.id} act`, 'pet pet act', 'flyover toured auto', 'secret hollow act', 'part gem walk', 'scene story act', 'finale final act',
    ]);
    for (const kind of KINDS) expect(all().filter((i) => i.kind === kind), kind).toHaveLength(1);
    expect(missing(all(), ONE_EACH)).toEqual([]);
    // a test world is not a whole world: the template's own numbers name what a real one still needs
    expect(missing(all()).map((l) => /of kind "(\w+)"/.exec(l)![1])).toEqual(['chain', 'part', 'scene', 'secret']);
  });

  it('the description agrees with what the world declares: its secrets, its pet, its characters', () => {
    const { all } = host().enter();
    expect(problems(probe, all())).toEqual([]);
    expect(probe.secrets).toEqual([SECRET]);
    expect(probe.pet).toEqual({ species: 'fawn', at: PET_AT, after: FRIEND.id });
    expect(all().find((i) => i.kind === 'pet')).toMatchObject({ id: PET_ITEM, at: PET_AT, after: [FRIEND.id] });
    // a secret taken out of the description, or one the world forgot to declare, is caught
    expect(problems(probe, all().filter((i) => i.id !== SECRET && i.id !== PART && i.id !== FINALE))).toEqual([`"${SECRET}" of the world's secrets has no item of kind "secret"`]);
    expect(problems({ ...probe, secrets: [] }, all())).toEqual([`the item "${SECRET}" of kind "secret" is not in the world's secrets`]);
  });

  it('the pet is a species of the core\'s catalog, and comes after the chain of the world\'s own character', () => {
    const species = petSpecies(probe.pet!.species);
    expect(species, 'the species is not in PETS').toBeDefined();
    expect(PETS).toContain(species);
    // The one rule the probe world breaks on purpose: the species is of the first world (the catalog has no pet of a
    // test world). src/game/pets.test.ts runs the check over the registry of the tests, where this world is not listed.
    expect(petProblems(probe)).toEqual([`${probe.id}: the pet species "${species!.id}" is of the world "${species!.world}"`]);
    expect(petProblems({ ...probe, id: species!.world })).toEqual([]);
  });

  it('the finale comes after every other item; the part after the secret it lies in', () => {
    const { all, item } = host().enter();
    expect(item(FINALE).after).toEqual(all().filter((i) => i.id !== FINALE).map((i) => i.id));
    expect(item(PART).after).toEqual([SECRET]);
    for (const id of [SECRET, SCENE, TOUR]) expect(item(id).after, id).toBeUndefined();
  });

  it('the done mark of every item is in the world\'s part of the save, under the id of the item', () => {
    const { ws, enter } = host();
    const { all } = enter();
    expect(all().map((i) => i.done())).toEqual(all().map(() => false));
    for (const i of all()) {
      if (i.kind === 'chain') ws.quests[i.id] = FRIEND.steps.length;
      else if (i.kind === 'finale') ws.final = true;
      else ws.flags[i.id] = true;
      expect(i.done(), i.id).toBe(true);
    }
    // a save read anew (a reload): the description of a fresh entry is done at once
    const again = host(JSON.parse(JSON.stringify(ws)) as WorldState).enter();
    expect(again.all().map((i) => i.done())).toEqual(again.all().map(() => true));
    expect(again.all().some((i) => i.active?.())).toBe(false);
  });

  it('the places: each item done by the action button stands inside its own spot and outside every other', () => {
    const { items, all } = host().enter();
    const friend: Spot = { pos: new THREE.Vector3(FRIEND.x, 0, FRIEND.z), r: 3, label: 'talk', on: () => true, run: () => {} };
    const portal: Spot = { pos: new THREE.Vector3(7, 0, 3), r: 2.2, label: 'open', on: () => true, run: () => {} };
    const pet: Spot = { pos: new THREE.Vector3(PET_AT.x, 0, PET_AT.z), r: PET_SPOT_R, label: 'take', on: () => true, run: () => {} };
    const spots = [friend, portal, ...items.spots, pet];
    for (const i of all().filter((x) => x.how === 'act')) expect(spots.filter((s) => covers(s, i.at!)), i.id).toHaveLength(1);
    for (const s of items.spots) expect(s.r).toBe(SPOT_R);
    // where the walkthroughs press the action button for the character (tools/shot.mjs) and for the portal (tools/worlds.mjs)
    for (const p of [{ x: FRIEND.x + 1.4, z: FRIEND.z + 1.4 }, { x: 7, z: 4.5 }]) expect(items.spots.filter((s) => covers(s, p))).toEqual([]);
    // the part lies away from every spot and from the spawn: nobody picks it up on the way
    for (const s of spots) expect(Math.hypot(s.pos.x - GEM.x, s.pos.z - GEM.z), s.label).toBeGreaterThan(s.r + TAKE_R);
    expect(Math.hypot(probe.spawn.x - GEM.x, probe.spawn.z - GEM.z)).toBeGreaterThan(5);
  });
});

describe('each item of the probe world can be done in the game', () => {
  it('the secret: the action button at the stump opens it, once, and it is saved', async () => {
    const { g, ws, enter } = host();
    const { item, spot } = enter();
    const s = spot('open');
    expect(s.on()).toBe(true);
    expect(covers(s, item(SECRET).at!)).toBe(true);
    s.run();
    expect(ws.flags).toEqual({ [SECRET]: true });
    expect(item(SECRET).done()).toBe(true);
    expect(g.persist).toHaveBeenCalledTimes(1);
    expect(s.on(), 'an open secret has no button').toBe(false);
    s.run();
    expect(g.persist).toHaveBeenCalledTimes(1);
  });

  it('the part of the artifact: it lies in the secret - walking into its place takes it only once the secret is open', async () => {
    const { g, ws, enter } = host();
    const { item, run, stand } = enter();
    stand(item(PART).at!);
    await run(0.5, true);
    expect(item(PART).done(), 'the secret is not open yet').toBe(false);
    ws.flags[SECRET] = true;
    await run(0.1, false);
    expect(item(PART).done(), 'the heroine cannot move (a scene, a menu)').toBe(false);
    stand({ x: GEM.x + TAKE_R + 0.2, z: GEM.z });
    await run(0.1, true);
    expect(item(PART).done(), 'a step away from it').toBe(false);
    stand({ x: GEM.x + TAKE_R - 0.1, z: GEM.z });
    await run(0.1, true);
    expect(ws.flags).toEqual({ [SECRET]: true, [PART]: true });
    expect(g.persist).toHaveBeenCalledTimes(1);
    await run(0.5, true);
    expect(g.persist, 'taken once').toHaveBeenCalledTimes(1);
  });

  it('the cutscene: the action button at the signboard starts it, it plays by itself in game time and is done at its end', async () => {
    const { g, ws, enter } = host();
    const { item, spot, run, picture } = enter();
    const s = spot('probe_look');
    expect(covers(s, item(SCENE).at!)).toBe(true);
    expect(item(SCENE).active!()).toBe(false);
    s.run();
    expect(item(SCENE).active!()).toBe(true);
    expect(g.busy, 'the scene holds the controls').toBe(true);
    expect(g.cam.focus).toBe(picture);
    expect(g.camOverride).not.toBeNull();
    await run(STORY_SECONDS - 0.2);
    expect([item(SCENE).active!(), item(SCENE).done()]).toEqual([true, false]);
    await run(0.3);
    expect([item(SCENE).active!(), item(SCENE).done()]).toEqual([false, true]);
    expect(ws.flags).toEqual({ [SCENE]: true });
    expect(g.persist).toHaveBeenCalledTimes(1);
    expect([g.busy, g.cam.focus, g.camOverride], 'the controls and the camera are given back').toEqual([false, null, null]);
    expect(item(FINALE).active!(), 'the finale is another scene').toBe(false);
  });

  it('the cutscene: a tap ends it sooner; a tap outside it does nothing', async () => {
    const { g, target, enter } = host();
    const { item, spot, run } = enter();
    target.tap();
    await run(0.1);
    expect(item(SCENE).done()).toBe(false);
    spot('probe_look').run();
    await run(0.2);
    expect(item(SCENE).active!()).toBe(true);
    target.tap();
    await run(0.05);
    expect([item(SCENE).active!(), item(SCENE).done(), g.busy]).toEqual([false, true, false]);
    // seen once, it can be seen again
    expect(spot('probe_look').on()).toBe(true);
  });

  it('the tour: the shared one with the path of the meadow - played once, marked as it starts, on while it flies', async () => {
    expect(pathProblems(PROBE_FLYOVER)).toEqual([]);
    // its line is a shared recorded one: the probe world has no spoken line of its own
    expect(probe.strings.spoken).toEqual({});
    expect(SPOKEN[PROBE_FLYOVER.line as keyof typeof SPOKEN]).toBeTruthy();
    expect(STRINGS.uk[PROBE_FLYOVER.line as keyof typeof STRINGS.uk]).toBeTruthy();
    const { g, ws, enter } = host();
    const { items, item } = enter();
    const game = g as unknown as Game;
    expect(flyoverOf(game)).toBe(items.tour);
    expect([item(TOUR).done(), item(TOUR).active!()]).toEqual([false, false]);
    const played = tour(game);
    expect([item(TOUR).done(), item(TOUR).active!(), g.busy]).toEqual([true, true, true]);
    expect(ws.flags).toEqual({ [TOUR]: true });
    expect(g.persist).toHaveBeenCalledTimes(1);
    for (let t = 0; t < PROBE_FLYOVER.seconds + 0.1; t += 0.05) items.tour.update(0.05);
    expect(await played).toBe(true);
    expect([item(TOUR).done(), item(TOUR).active!(), g.busy]).toEqual([true, false, false]);
    // a second "Play" in the world: asked again, the tour does not start (ended at once here, so nothing is left waiting)
    const again = tour(game), flying = items.tour.active;
    items.tour.skip();
    expect(flying, 'a world toured once is not toured again').toBe(false);
    expect(await again).toBe(false);
  });

  it('the finale: the altar has no button until everything else is done - each item left undone holds it back', async () => {
    for (const undone of [FRIEND.id, PET_ITEM, TOUR, SECRET, PART, SCENE]) {
      const { ws, enter } = host();
      const { spot } = enter();
      allButFinale(ws);
      expect(spot('place').on(), 'everything is done').toBe(true);
      if (undone === FRIEND.id) ws.quests[undone] = 0; else delete ws.flags[undone];
      expect(spot('place').on(), `without "${undone}"`).toBe(false);
    }
    expect(host().enter().spot('place').on(), 'a new game').toBe(false);
  });

  it('the finale: the action button at the altar plays it to its end, then the world\'s `final` is set and saved', async () => {
    const { g, ws, target, enter } = host();
    const { item, spot, run } = enter();
    allButFinale(ws);
    const s = spot('place');
    expect(covers(s, item(FINALE).at!)).toBe(true);
    expect(item(FINALE).at).toEqual(ALTAR);
    s.run();
    expect([item(FINALE).active!(), item(FINALE).done(), g.busy]).toEqual([true, false, true]);
    target.tap();                                    // a tap does not cut the finale short
    await run(FINALE_SECONDS - 0.2);
    expect([item(FINALE).active!(), ws.final]).toEqual([true, false]);
    await run(0.3);
    expect([item(FINALE).active!(), item(FINALE).done(), ws.final, g.busy]).toEqual([false, true, true, false]);
    expect(g.persist).toHaveBeenCalledTimes(1);
    expect(s.on(), 'the artifact is returned once').toBe(false);
    expect(ws.flags[FINALE], 'the mark of the finale is `final`, not a flag').toBeUndefined();
  });
});

describe('a second entry into the probe world finds nothing of the first (TECH-15)', () => {
  it('left in the middle of the cutscene: the camera is given back, the tap handler is gone, the scene is not on', async () => {
    const { g, ws, target, enter } = host();
    const first = enter();
    expect(target.fns.size).toBe(1);
    first.spot('probe_look').run();
    await first.run(0.2, false);
    expect([first.item(SCENE).active!(), g.camOverride !== null, g.cam.focus !== null]).toEqual([true, true, true]);
    first.scope.dispose();                           // the world is left (src/game/travel.ts)
    expect([g.camOverride, g.cam.focus], 'what the scene took of the camera').toEqual([null, null]);
    expect(target.fns.size, 'the tap handler of the world left').toBe(0);
    expect(first.item(SCENE).active!()).toBe(false);
    g.busy = false;                                  // whoever changes the world gives the controls back
    const second = enter();
    expect(target.fns.size).toBe(1);
    expect(second.all().some((i) => i.active?.())).toBe(false);
    // the scene that was cut never ends by itself, however long the world left is "played"
    await first.run(STORY_SECONDS + 1, false);
    expect(ws.flags[SCENE]).toBeUndefined();
    expect(g.busy).toBe(false);
    // and the new entry plays its own from the start
    second.spot('probe_look').run();
    await second.run(STORY_SECONDS + 0.1);
    expect(second.item(SCENE).done()).toBe(true);
  });

  it('what the items put on the meadow leaves the scene with the world', () => {
    const { g, enter } = host();
    const before = g.scene.children.length;
    const first = enter();
    const added = g.scene.children.length - before;
    expect(added).toBeGreaterThan(0);
    first.scope.dispose();
    expect(g.scene.children.length).toBe(before);
    enter();
    expect(g.scene.children.length - before, 'a second entry adds the same, not twice as much').toBe(added);
  });

  it('a new entry reads the marks of the save: what was done stays done, the tour is not played again', async () => {
    const { g, ws, enter } = host();
    const first = enter();
    first.spot('open').run();
    void tour(g as unknown as Game);
    first.items.tour.skip();
    await tick();
    first.scope.dispose();
    const second = enter();
    expect(second.item(SECRET).done()).toBe(true);
    expect(second.spot('open').on()).toBe(false);
    expect(flyoverOf(g as unknown as Game)).toBe(second.items.tour);
    const again = tour(g as unknown as Game), flying = second.items.tour.active;
    second.items.tour.skip();
    expect(flying, 'the tour of a world toured in an earlier entry').toBe(false);
    expect(await again).toBe(false);
    expect(ws.flags).toEqual({ [SECRET]: true, [TOUR]: true });
  });
});

// ---------- the wiring: the built probe world takes its items into the game ----------
const INDEX = (import.meta.glob('./index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['./index.ts'];

describe('the probe world wires its items into the game (src/worlds/probe/index.ts)', () => {
  it('their action spots are among the spots of the frame, they move in the frame, and the built world hands them in', () => {
    // made once, with the stage and the scope of this entry into the world
    expect(INDEX.match(/\bcreateItems\(/g)).toHaveLength(1);
    expect(INDEX).toMatch(/const items = createItems\(g, stage, scope, /);
    // without its spots no item can be done by the action button; without update() the part is never walked into and
    // the cutscene never ends; without `items` the world has no description (window.__game.items is null)
    expect(INDEX).toMatch(/spots: \[\n(?:.*\n)*? {8}\.\.\.items\.spots,\n/);
    expect(INDEX).toMatch(/update: \(dt, time, canMove\) => \{\n {8}items\.update\(dt, time, canMove\);\n/);
    expect(INDEX).toMatch(/\n {4}items: items\.items,\n/);
    expect(INDEX).toMatch(/more: \{ flyoverPlayer: items\.tour \}/);
  });
});
