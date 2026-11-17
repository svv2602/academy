// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Save } from '../core/save';
import type { Game, WorldEntry } from './context';
import type { Gear } from './gear';
import type { WorldFrame } from './loop';
import type { Stage } from './stage';
import type { TaskResult } from './taskviews/panel';
import { PETS } from './pets';
import type { BuiltWorld, WorldDef, WorldSky } from './world';

/**
 * The change of world on stand-in worlds (TECH-15). Real here: the game's state (`createGame`), the scope of a world,
 * the transition, the tour and the interface (a page of happy-dom). Stand-ins: the worlds, the loader of models, the
 * sound and the shop - each writes what it is asked into one log, so the order of a change can be read from it.
 */
const h = vi.hoisted(() => {
  // The elements src/ui/ui.ts looks up at import, and the panel of a task.
  for (const id of ['c', 'hud', 'stars', 'crystals', 'fps', 'bubble', 'bubbleText', 'speaker', 'answers', 'answersClose', 'joy', 'knob', 'btnJump', 'btnAct',
    'fanfare', 'fanfareTitle', 'fanfareText', 'fanfareOk', 'start', 'loading', 'bar', 'setup', 'play', 'restart', 'notice', 'noticeText', 'retry', 'task', 'taskClose']) {
    const e = document.createElement(id === 'retry' || id.endsWith('Close') ? 'button' : 'div');
    e.id = id;
    document.body.appendChild(e);
  }
  // A counter of the HUD lives in a pill: setCounter bumps its parent.
  return { log: [] as string[], progress: null as ((f: number) => void) | null };
});
const { log } = h;

vi.mock('../core/assets', () => ({
  withScope: (id: string, load: () => Promise<unknown>) => { h.log.push(`models of ${id}`); return load(); },
  release: (id: string) => { h.log.push(`release ${id}`); },
  resetProgress: () => { h.log.push('progress from zero'); },
  setProgressHandler: (fn: (f: number) => void) => { h.progress = fn; },
  tint: () => {},
}));
vi.mock('../core/audio', () => ({
  beginTask: () => { h.log.push('beginTask'); },
  endTask: () => { h.log.push('endTask'); },
  setMusic: (p: { scale: readonly number[] } | null) => { h.log.push(`music ${p ? p.scale[0] : 'off'}`); },
  stopVoice: () => { h.log.push('stopVoice'); },
  say: () => Promise.resolve(),
  sfx: () => {},
}));
vi.mock('../ui/shop', () => ({ wearSaved: (_save: unknown, gear: { name: string }) => { h.log.push(`wear ${gear.name}`); } }));
vi.mock('./fx', () => ({ Sparks: class { burst() {} update() {} } }));

const triangle = () => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
/** A mesh that writes `<name> freed` into the log when its geometry is disposed. */
function mesh(name: string) {
  const m = new THREE.Mesh(triangle(), new THREE.MeshBasicMaterial());
  m.name = name;
  m.geometry.addEventListener('dispose', () => log.push(`${name} freed`));
  return m;
}
const $ = (id: string) => document.getElementById(id)!;
const hidden = (id: string) => $(id).classList.contains('hidden');

interface FakeWorld extends WorldDef {
  /** What each build of the world saw and made, the last one last. */
  builds: { ws: unknown; worldId: string; visit: number; stage: Stage; task: Game['task']; built: BuiltWorld }[];
  /** The module's own list, like the colliders of a real world: the world empties it when it is left. */
  list: string[];
  fail: 'load' | 'sky' | 'build' | null;
  /** The world hands in a tour of its own when it is built. */
  tour: boolean;
  /** The stage every build made first - a build that broke has one too. */
  stages: Stage[];
}

/** A stand-in world: a sky with a sun, a land that joins the scene in its load, a friend made in its build. */
function fakeWorld(id: string, o: { height?: number; music?: number; tour?: boolean } = {}): FakeWorld {
  const list: string[] = [];
  const w: FakeWorld = {
    id, builds: [], list, fail: null, tour: o.tour ?? false, stages: [],
    spawn: { x: id.charCodeAt(0), z: 2 },
    ground: { height: () => o.height ?? 0, resolve: () => {}, raycast: () => false, block: () => {} },
    characters: [],
    strings: { id, table: { uk: { subtitle: id }, ru: { subtitle: id } }, spoken: {} },
    music: o.music === undefined ? undefined : { scale: [o.music], chords: [] },
    sky(scene, scope) {
      log.push(`sky ${id}`);
      if (w.fail === 'sky') { scene.add(mesh(`${id} half a sky`)); throw new Error(`the sky of ${id} broke`); }
      const sun = new THREE.DirectionalLight();
      sun.name = `${id} sun`;
      scene.add(sun, mesh(`${id} sky`));
      scope.own(() => { log.push(`own of ${id}`); list.length = 0; });
      return { sun, sunOffset: new THREE.Vector3() };
    },
    async load(scene) {
      log.push(`load ${id}`);
      scene.add(mesh(`${id} land`));
      list.push('a prop');
      h.progress?.(0.5);
      await Promise.resolve();
      return w.fail === 'load' ? null : { of: id };
    },
    build(g, L, sky, scope) {
      log.push(`build ${id}`);
      expect(L).toEqual({ of: id });
      if (w.fail === 'build') { g.scene.add(mesh(`${id} half-built`)); throw new Error(`the build of ${id} broke`); }
      g.scene.add(mesh(`${id} friend`));
      list.push('a friend');
      // What the first world does to the game's own: wings on the heroine, butterflies in the flock, a material of
      // its own on one of her items, which it shows; and its tour.
      const wing = mesh(`${id} wing`);
      g.hero.root.add(wing);
      scope.own(() => { g.hero.root.remove(wing); });
      g.flies.add(1, 1, 1, '#fff'); g.flies.add(2, 2, 1, '#fff');
      const wand = g.heroRig.gear.wand_star.object as THREE.Mesh;
      wand.material = (wand.material as THREE.Material).clone();
      wand.material.addEventListener('dispose', () => log.push(`${id} copy of the wand's material freed`));
      wand.visible = true;
      const frame: WorldFrame = { spots: [], tap: () => false, afterMove: () => {}, update: () => {}, goal: () => null, animate: () => {}, focusDist: () => 6.5, beforeRender: () => {} };
      const gear = { name: `gear of ${id}`, set: vi.fn(), get: () => null, tint: vi.fn(), color: id, parts: g.heroRig.gear, update: vi.fn() } as unknown as Gear;
      const built: BuiltWorld = {
        frame, gear,
        debug: { npcs: [`${id} friend`], more: { [`${id}Only`]: id }, talk: () => {}, cheatWorld: () => '' },
        book: { parts: () => [{ color: id, icon: id, got: false }], stats: () => [] },
        lines: { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'ok', partText: 'ok' },
        hud: () => `hud of ${id}`,
      };
      w.builds.push({ ws: g.ws, worldId: g.worldId, visit: g.visit, task: g.task, built, stage: undefined as unknown as Stage });
      return built;
    },
  };
  return w;
}

/** A game on the stand-in worlds, started in the first of them the way src/main.ts starts it. */
async function setup(worlds: FakeWorld[], o: { started?: boolean } = {}) {
  vi.resetModules();   // the transition and the installed travel are one per page
  const [{ createGame, createStage, worldPart }, T, { transition }, flyover, { loadSave }] = await Promise.all([
    import('./context'), import('./travel'), import('./transition'), import('./flyover'), import('../core/save'),
  ]);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const save: Save = loadSave();
  // The stage of a world is made in its build, of the game it is handed.
  for (const w of worlds) {
    const plain = w.build.bind(w);
    w.build = (g, L, sky, scope) => {
      const stage = createStage(g, () => {});
      w.stages.push(stage);                 // also of a build that breaks half-way
      const built = plain(g, L, sky, scope);
      w.builds[w.builds.length - 1].stage = stage;
      // Its tour (src/game/flyover.ts keeps one per game): twelve seconds, never flown yet.
      if (w.tour) flyover.setTour(g, { path: { points: [], seconds: 12, line: 'go_next' }, visited: () => false, mark: () => {} });
      return built;
    };
  }
  const item = () => { const object = mesh('an item of the heroine'); object.visible = false; return { object, bone: new THREE.Bone() }; };
  const rig = () => ({ root: new THREE.Group(), model: new THREE.Object3D(), clips: new Map<string, THREE.AnimationClip>() });
  const heroRig = Object.assign(rig(), { gear: { wand_star: item(), crown: item() } });
  const speech = { shown: null, caption: vi.fn(), line: vi.fn(() => Promise.resolve()), ask: vi.fn(), muted: () => false, hintLine: vi.fn(), repeat: vi.fn() };
  const entries: WorldEntry[] = [];
  const entryOf = (world: WorldDef): WorldEntry => {
    const e = { id: world.id, ground: world.ground, spawn: world.spawn, crystals: () => travel.built?.hud() ?? '', pet: world.pet };
    entries.push(e);
    return e;
  };
  const opened = T.openWorld(worlds[0], scene);
  const L = await opened.load(save, false);
  const g = opened.scope.shared(() => createGame({
    scene, camera, renderer: {} as THREE.WebGLRenderer, save, touch: false, debug: false, speech: speech as never, rng: Math.random as never,
    shared: { heroRig, catRig: rig(), petRigs: Object.fromEntries(PETS.map((p) => [p.id, rig()])) } as never, world: entryOf(worlds[0]),
  }));
  const frames: WorldFrame[] = [], shown: { built: BuiltWorld; sky: WorldSky }[] = [], welcomed: boolean[] = [];
  const waiting: (() => void)[] = [];
  const travel = T.createTravel({
    g, scene, save, touch: false, worlds, entryOf,
    setFrame: (f) => { frames.push(f); },
    show: (built, sky) => { log.push('show'); shown.push({ built, sky }); },
    drawn: () => new Promise<void>((done) => { log.push('a frame behind the closed frame'); waiting.push(done); }),
    welcome: (first) => { welcomed.push(first); return Promise.resolve(); },
  });
  travel.begin(opened, L);
  // A part of the loop, made inside shared() like the guide and the tap ring.
  const ring = opened.scope.shared(() => { const m = mesh('the tap ring'); scene.add(m); return m; });
  $('start').classList.toggle('hidden', o.started ?? true);
  $('hud').classList.toggle('hidden', !(o.started ?? true));
  log.length = 0;

  /** Plays frames until `p` settles; `each` sees the game before every frame. */
  async function play<V>(p: Promise<V>, each: () => void = () => {}): Promise<V> {
    let done = false;
    p.then(() => { done = true; }, () => { done = true; });
    for (let i = 0; i < 3000 && !done; i++) {
      each();
      transition.frame(0.05);
      for (const d of waiting.splice(0)) d();
      await new Promise((r) => setTimeout(r, 0));
    }
    if (!done) throw new Error('the change of world did not come to its end in 3000 frames');
    return p;
  }
  return { T, g, scene, save, travel, transition, flyover, worldPart, entries, frames, shown, welcomed, ring, heroRig, speech, play };
}

const names = (scene: THREE.Scene) => scene.children.map((c) => c.name).filter(Boolean).sort();
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  localStorage.clear();
  log.length = 0; h.progress = null;
  for (const id of ['task', 'answers', 'answersClose', 'fanfare', 'bubble', 'notice', 'btnJump', 'btnAct']) $(id).classList.add('hidden');
  for (const id of ['joy', 'setup']) $(id).classList.remove('hidden');
  $('taskClose').onclick = null; $('answersClose').onclick = null;
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { error.mockRestore(); });

describe('travel: the order of a change of world (TECH-15)', () => {
  it('behind the closed frame: silence, the save, the world left out (its scope, THEN its models), the new world, one frame of it, the frame opens', async () => {
    const a = fakeWorld('a', { music: 111 }), b = fakeWorld('b', { music: 222 });
    const { travel, play, g, transition } = await setup([a, b]);
    const persist = g.persist, leave = g.leave, enter = g.enter;
    vi.spyOn(g, 'persist').mockImplementation(() => { log.push('save'); persist(); });
    vi.spyOn(g, 'leave').mockImplementation(() => { log.push('leave'); leave(); });
    vi.spyOn(g, 'enter').mockImplementation((w) => { log.push(`enter ${w.id}`); enter(w); });
    const ready = transition.ready;
    vi.spyOn(transition, 'ready').mockImplementation(() => { log.push('ready'); ready(); });
    // Asked for before the change starts: it settles first, with the log as the closing left it.
    let closedAt = -1;
    void transition.whenClosed().then(() => { closedAt = log.length; });
    expect(await play(travel.go('b'))).toBe(true);
    // Nothing of the change but leaving happens before the frame has closed.
    expect(log.slice(0, closedAt)).toEqual(['leave']);
    // (After "ready" the frame stays closed for as many frames as the loading ring needs to fade out: one or more.)
    expect(log.slice(closedAt).filter((l, i, all) => l !== all[i - 1])).toEqual([
      'endTask', 'beginTask', 'music off', 'save',
      'own of a', 'a sky freed', 'a land freed', 'a friend freed', 'release a', "a copy of the wand's material freed",
      'progress from zero', 'sky b', 'models of b', 'load b', 'enter b', 'build b',
      'wear gear of b', 'show', 'a frame behind the closed frame',
      'endTask', 'ready', 'a frame behind the closed frame', 'music 222',
    ]);
  });

  it('the frame is closed from the moment the world left is taken out until the new one is built and drawn once', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, transition, scene, g } = await setup([a, b]);
    const seen: { phase: string; closed: boolean; friend: string[]; busy: boolean }[] = [];
    await play(travel.go('b'), () => seen.push({ phase: transition.phase, closed: transition.closed, friend: names(scene).filter((n) => n.endsWith('friend')), busy: g.busy }));
    // While the frame was closing the world left was still whole; the friend changed only behind the closed frame.
    for (const s of seen.filter((x) => x.phase === 'closing')) expect(s.friend).toEqual(['a friend']);
    for (const s of seen.filter((x) => x.phase === 'opening')) expect(s.friend).toEqual(['b friend']);
    expect(seen.some((s) => s.phase === 'closing')).toBe(true);
    expect(seen.some((s) => s.closed)).toBe(true);
    expect(seen.some((s) => s.phase === 'opening')).toBe(true);
    // The controls are taken for the whole change and come back with the open frame.
    for (const s of seen.slice(1)) expect(s.busy).toBe(true);
    expect(g.busy).toBe(false);
    expect(transition.phase).toBe('idle');
  });

  it('the loading ring follows the load of the new world, counted from zero', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, transition } = await setup([a, b]);
    const progress = vi.spyOn(transition, 'setProgress');
    await play(travel.go('b'));
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(log.indexOf('progress from zero')).toBeLessThan(log.indexOf('load b'));
  });
});

describe('travel: what is the world\'s changes, what is the game\'s stays', () => {
  it('the world left is out of the scene and freed; the heroine, the cat, the flock and the parts of the loop are the very same objects', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, scene, g, ring } = await setup([a, b]);
    const before = { hero: g.hero, root: g.hero.root, cat: g.cat.root, flies: g.flies.mesh, kept: scene.children.filter((c) => !c.name.startsWith('a ')) };
    expect(names(scene)).toEqual(['a friend', 'a land', 'a sky', 'a sun', 'the tap ring']);
    await play(travel.go('b'));
    expect(names(scene)).toEqual(['b friend', 'b land', 'b sky', 'b sun', 'the tap ring']);
    expect(log).toEqual(expect.arrayContaining(['a sky freed', 'a land freed', 'a friend freed']));
    expect(log.filter((l) => /^(the tap ring|an item of the heroine) freed$/.test(l))).toEqual([]);
    expect(g.hero).toBe(before.hero);
    expect(g.hero.root).toBe(before.root);
    for (const o of [before.root, before.cat, before.flies, ring, ...before.kept]) expect(scene.children).toContain(o);
    expect(travel.world).toBe('b');
    expect(travel.built).toBe(b.builds[0].built);
  });

  it('the world\'s part of `g` is swapped whole: every field `worldPart` makes is the new world\'s, and `groundY` is the same function over the new ground', async () => {
    const a = fakeWorld('a', { height: 1 }), b = fakeWorld('b', { height: 7 });
    const { travel, play, g, save, worldPart, entries } = await setup([a, b]);
    const groundY = g.groundY, visit = g.visit;
    expect(g.groundY(0, 0)).toBe(1);
    expect(g.ws).toBe(save.worlds.a);
    await play(travel.go('b'));
    const entry = entries[entries.length - 1];
    expect(entry.id).toBe('b');
    // Not field by field: whatever `worldPart` returns for the new world is in `g`, so a field added to it
    // (a neighbour's `pet`, `characters`...) is swapped with no line in travel.ts or in `enter`.
    const part = worldPart(save, entry) as Record<string, unknown>;
    expect(Object.keys(part)).toEqual(expect.arrayContaining(['worldId', 'ws', 'ground']));
    for (const [k, v] of Object.entries(part)) expect((g as unknown as Record<string, unknown>)[k], `g.${k}`).toStrictEqual(v);
    expect(g.worldId).toBe('b');
    expect(g.ws).toBe(save.worlds.b);
    expect(g.ground).toBe(b.ground);
    expect(g.groundY).toBe(groundY);
    expect(g.groundY(0, 0)).toBe(7);
    expect(g.visit).not.toBe(visit);
    // The world was built with the new part already in `g`.
    expect(b.builds[0]).toMatchObject({ ws: save.worlds.b, worldId: 'b', visit: g.visit });
  });

  it('the built world goes to whoever shows it: its frame, its sun and its debug part, its counter, its music, the heroine\'s saved things', async () => {
    const a = fakeWorld('a', { music: 111 }), b = fakeWorld('b');
    const { travel, play, frames, shown, scene, T } = await setup([a, b]);
    await play(travel.go('b'));
    const built = b.builds[0].built;
    expect(frames).toEqual([T.NO_WORLD, built.frame]);
    expect(shown).toHaveLength(1);
    expect(shown[0].built).toBe(built);
    expect(shown[0].sky.sun).toBe(scene.children.find((c) => c.name === 'b sun'));
    expect($('crystals').textContent).toBe('hud of b');
    expect(log).toContain('wear gear of b');
    // A world without music leaves silence, not the music of the world before.
    expect(log.filter((l) => l.startsWith('music'))).toEqual(['music off', 'music off']);
  });

  it('the book and the heroine\'s items the menus hold answer for the world played', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, T } = await setup([a, b]);
    const view = T.worldView(() => travel.built!);
    expect(view.book.parts()).toEqual([{ color: 'a', icon: 'a', got: false }]);
    expect(view.gear.color).toBe('a');
    await play(travel.go('b'));
    expect(view.book.parts()).toEqual([{ color: 'b', icon: 'b', got: false }]);
    expect(view.gear.color).toBe('b');
    view.gear.set('wings', null); view.gear.tint('#fff'); view.gear.update(1, true);
    const gear = b.builds[0].built.gear;
    expect(gear.set).toHaveBeenCalledExactlyOnceWith('wings', null);
    expect(gear.tint).toHaveBeenCalledExactlyOnceWith('#fff');
    expect(gear.update).toHaveBeenCalledExactlyOnceWith(1, true);
    expect(a.builds[0].built.gear.set).not.toHaveBeenCalled();
    expect(view.gear.parts).toBe(gear.parts);
    expect(view.book.stats()).toEqual([]);
    expect(view.gear.get('wings')).toBeNull();
  });

  it('what the world left on the game\'s own is gone: its butterflies, its tour, its materials on the heroine\'s items', async () => {
    const a = fakeWorld('a', { tour: true }), b = fakeWorld('b');
    const { travel, play, g, flyover, heroRig } = await setup([a, b]);
    const wand = heroRig.gear.wand_star.object as THREE.Mesh, crown = heroRig.gear.crown.object;
    expect(g.flies.flies).toHaveLength(2);
    const tourOfA = flyover.flyoverOf(g);
    expect(tourOfA?.path.seconds).toBe(12);
    b.build = ((plain) => (gg, L, sky, scope) => {
      // The new world dresses the heroine as the shared load left her: the wand hidden, with its own material.
      expect(wand.visible).toBe(false);
      expect(gg.flies.flies).toHaveLength(0);
      return plain(gg, L, sky, scope);
    })(b.build);
    crown.visible = true;
    await play(travel.go('b'));
    expect(log).toContain("a copy of the wand's material freed");
    expect(g.flies.flies).toHaveLength(2);           // the two of b, not four
    expect(g.flies.mesh.count).toBe(2);
    // b has no tour of its own: nothing flies, and the entry plays none.
    expect(flyover.flyoverOf(g)).not.toBe(tourOfA);
    expect(await flyover.tour(g)).toBe(false);
    expect(g.busy).toBe(false);
  });

  it('there and back: the first world entered again is not doubled, on the scene or on the heroine', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, scene, g } = await setup([a, b]);
    const first = { scene: names(scene), all: scene.children.length, hero: g.hero.root.children.length, list: [...a.list] };
    expect(first.list).toEqual(['a prop', 'a friend']);
    await play(travel.go('b'));
    expect(a.list).toEqual([]);
    expect(await play(travel.go('a'))).toBe(true);
    expect(names(scene)).toEqual(first.scene);
    expect(scene.children).toHaveLength(first.all);
    expect(g.hero.root.children).toHaveLength(first.hero);
    expect(a.list).toEqual(first.list);
    expect(b.list).toEqual([]);
    expect(g.flies.flies).toHaveLength(2);
    expect(a.builds).toHaveLength(2);
    expect(log.filter((l) => l.startsWith('release'))).toEqual(['release a', 'release b']);
  });
});

describe('travel: the save (R20)', () => {
  it('the game is saved before the world is left, with the place the heroine stood at', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, g, save } = await setup([a, b]);
    g.hero.root.position.set(12, 0, -7);
    const stored: string[] = [];
    const persist = g.persist;
    vi.spyOn(g, 'persist').mockImplementation(() => { persist(); stored.push(`${log.includes('own of a') ? 'after' : 'before'} the world was left: ${localStorage.getItem('amw-save')}`); });
    await play(travel.go('b'));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^before the world was left: /);
    expect(JSON.parse(stored[0].replace(/^[^{]*/, '')).worlds.a.pos).toEqual([12, -7]);
    expect(save.worlds.a.pos).toEqual([12, -7]);
  });

  it('the progress made in the new world goes to its own part of the save; the part of the world left stays as it was', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, g, save } = await setup([a, b]);
    g.ws.quests.friend = 2;
    g.hero.root.position.set(5, 0, 5);
    await play(travel.go('b'));
    const left = JSON.stringify(save.worlds.a);
    // What a conversation of the new world writes, and where the game saves her place.
    g.ws.quests.other = 1;
    g.hero.root.position.set(-3, 0, 9);
    g.persist();
    expect(save.worlds.b.quests).toEqual({ other: 1 });
    expect(save.worlds.b.pos).toEqual([-3, 9]);
    expect(JSON.stringify(save.worlds.a)).toBe(left);
    expect(save.worlds.a).toMatchObject({ quests: { friend: 2 }, pos: [5, 5] });
    const stored = JSON.parse(localStorage.getItem('amw-save')!) as Save;
    expect(stored.worlds.a).toMatchObject({ quests: { friend: 2 }, pos: [5, 5] });
    expect(stored.worlds.b).toMatchObject({ quests: { other: 1 }, pos: [-3, 9] });
  });

  it('she stands at the spawn of a world she has not been in, and where she was left in one she has', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b', { height: 3 });
    const { travel, play, g } = await setup([a, b]);
    g.hero.root.position.set(40, 0, 41);
    g.cam.yaw = 2; g.cam.focus = new THREE.Vector3();
    await play(travel.go('b'));
    expect(g.hero.root.position.toArray()).toEqual([b.spawn.x, 3, b.spawn.z]);
    expect(g.cam.target.toArray()).toEqual(g.hero.root.position.toArray());
    expect(g.cam.yaw).toBe(0);
    expect(g.cat.root.position.distanceTo(g.hero.root.position)).toBeLessThan(2);
    g.hero.root.position.set(8, 3, 9);
    await play(travel.go('a'));
    expect(g.hero.root.position.toArray()).toEqual([40, 0, 41]);
    await play(travel.go('b'));
    expect(g.hero.root.position.toArray()).toEqual([8, 3, 9]);
  });
});

describe('travel: the load of the new world failed', () => {
  it('the game is back in the world left: built again, the heroine where she stood, the controls returned, the notice in the bubble', async () => {
    const a = fakeWorld('a', { music: 111 }), b = fakeWorld('b', { music: 222 });
    const { travel, play, g, scene, save, welcomed } = await setup([a, b]);
    g.hero.root.position.set(12, 0, -7);
    b.fail = 'load';
    $('notice').classList.remove('hidden'); $('setup').classList.add('hidden');   // what the world's load does when it fails (loadFailed)
    expect(await play(travel.go('b'))).toBe(false);
    expect(travel.world).toBe('a');
    expect(a.builds).toHaveLength(2);
    expect(b.builds).toHaveLength(0);
    expect(travel.built).toBe(a.builds[1].built);
    expect(names(scene)).toEqual(['a friend', 'a land', 'a sky', 'a sun', 'the tap ring']);
    expect(g.ws).toBe(save.worlds.a);
    expect(g.worldId).toBe('a');
    expect(g.hero.root.position.toArray()).toEqual([12, 0, -7]);
    expect(g.busy).toBe(false);
    expect(travel.active).toBe(false);
    // What the failed world had put into the scene and into the loader is out again, in the same order.
    const tail = log.slice(log.indexOf('load b'));
    expect(tail.slice(0, 5)).toEqual(['load b', 'own of b', 'b sky freed', 'b land freed', 'release b']);
    expect(tail).toEqual(expect.arrayContaining(['sky a', 'load a', 'build a', 'music 111']));
    expect(log).not.toContain('music 222');
    // The existing message, as text: in the bubble, and the start screen has its panel back.
    expect(hidden('bubble')).toBe(false);
    expect($('bubbleText').textContent).toMatch(/Не вдалося завантажити/);
    expect(hidden('notice')).toBe(true);
    expect(hidden('setup')).toBe(false);
    expect(welcomed).toEqual([]);
    // The world can be tried again, and entered once it loads.
    b.fail = null;
    expect(await play(travel.go('b'))).toBe(true);
    expect(travel.world).toBe('b');
  });

  it.each(['sky', 'build'] as const)('a %s that throws is a failure of the same kind: reported, taken out, the world left is back', async (where) => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, g, scene, save } = await setup([a, b]);
    const stageA = a.builds[0].stage;
    b.fail = where;
    expect(await play(travel.go('b'))).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toBe('the world "b" could not be opened:');
    expect(names(scene)).toEqual(['a friend', 'a land', 'a sky', 'a sun', 'the tap ring']);
    expect(g.ws).toBe(save.worlds.a);
    expect(g.busy).toBe(false);
    expect(g.flies.flies).toHaveLength(2);
    // The first entry into a is over all the same; the world played is its second one.
    expect(stageA.busy()).toBe(true);
    expect(a.builds[1].stage.busy()).toBe(false);
    // What a build that broke half-way had made is of a world that was left: its stage starts nothing in the world played.
    if (where === 'build') expect(b.stages[0].busy()).toBe(true);
    else expect(b.stages).toEqual([]);
  });

  it('neither world can be opened: the frame stays closed and the start screen says so, with "try again"', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, g, transition } = await setup([a, b]);
    a.fail = 'load'; b.fail = 'load';
    expect(await play(travel.go('b'))).toBe(false);
    expect(transition.closed).toBe(true);
    expect(g.busy).toBe(true);
    expect(travel.built).toBeNull();
    expect(hidden('start')).toBe(false);
    expect(hidden('notice')).toBe(false);
    expect($('noticeText').textContent).toMatch(/Не вдалося завантажити/);
    expect(hidden('retry')).toBe(false);
    expect(log.filter((l) => l.startsWith('release'))).toEqual(['release a', 'release b', 'release a']);
  });
});

describe('travel: a scene of the world left is interrupted', () => {
  it('the controls come back by the change itself: the flags, the open task, the answers, the bubble, the voice', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, g, speech } = await setup([a, b]);
    // A conversation in the middle of its task, a task in the world with its answers, the finale's flag, a close-up.
    a.builds[0].stage.take();
    g.auto = { x: 1, z: 1, stuck: 0, last: 0 };
    g.cam.focus = new THREE.Vector3(1, 2, 3); g.camOverride = 3.2; g.finale = 0.4;
    const closed: string[] = [];
    for (const id of ['task', 'answers', 'answersClose', 'fanfare', 'btnAct']) $(id).classList.remove('hidden');
    $('taskClose').onclick = () => closed.push('the panel task');
    $('answersClose').onclick = () => closed.push('the task in the world');
    const going = travel.go('b');
    // Each open task was closed by its own button at once, while its world was still whole.
    expect(closed).toEqual(['the panel task', 'the task in the world']);
    expect(log).not.toContain('own of a');
    expect(await play(going)).toBe(true);
    expect(g).toMatchObject({ busy: false, auto: null, camOverride: null, finale: 0 });
    expect(g.cam.focus).toBeNull();
    for (const id of ['task', 'answers', 'answersClose', 'fanfare', 'btnAct']) expect(hidden(id), id).toBe(true);
    expect(speech.caption).toHaveBeenCalledWith(null);
    expect(log.filter((l) => l === 'endTask').length).toBeGreaterThanOrEqual(2);
  });

  it('a scene of the world left neither starts anew nor gives the controls back; the stage of the new world does', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, g } = await setup([a, b]);
    const { playScene } = await import('./stage');
    const old = a.builds[0].stage;
    old.take();
    const going = travel.go('b');
    // Its `finally` runs while the frame closes: the controls stay with the change.
    old.release();
    expect(g.busy).toBe(true);
    await play(going);
    expect(g.busy).toBe(false);
    g.busy = true;
    old.release();
    expect(g.busy).toBe(true);
    g.busy = false;
    expect(old.busy()).toBe(true);
    const body = vi.fn();
    expect(await playScene(old, 'a scene of the world left', body)).toBe('refused');
    expect(body).not.toHaveBeenCalled();
    expect(await playScene(b.builds[0].stage, 'a scene of the new world', body)).toBe('done');
    expect(body).toHaveBeenCalledTimes(1);
    expect(g.busy).toBe(false);
  });

  it('a task asked by the world left opens nothing and answers "closed"; one that was open then does not end the silence of the change', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, g } = await setup([a, b]);
    const taskOfA = a.builds[0].task;
    let solve: (r: TaskResult) => void = () => {};
    const open = taskOfA(() => new Promise<TaskResult>((r) => { solve = r; }));
    expect(log).toEqual(['beginTask']);
    const going = travel.go('b');
    // Between the worlds no task opens, whoever asks.
    const opener = vi.fn(() => Promise.resolve({ solved: true, wrong: 0 }));
    expect(await g.task(opener)).toEqual({ solved: false, wrong: 0 });
    await play(going);
    const ends = log.filter((l) => l === 'endTask').length;
    solve({ solved: false, wrong: 1 });
    expect(await open).toEqual({ solved: false, wrong: 1 });
    expect(log.filter((l) => l === 'endTask')).toHaveLength(ends);
    expect(await taskOfA(opener)).toEqual({ solved: false, wrong: 0 });
    expect(opener).not.toHaveBeenCalled();
    // The task of the world played works as ever.
    expect(await g.task(opener)).toEqual({ solved: true, wrong: 0 });
    expect(opener).toHaveBeenCalledTimes(1);
    expect(log.slice(-2)).toEqual(['beginTask', 'endTask']);
  });

  it('a tour that is flying ends where it is', async () => {
    const a = fakeWorld('a', { tour: true }), b = fakeWorld('b');
    const { travel, play, g, flyover } = await setup([a, b]);
    const player = flyover.flyoverOf(g)!;
    const flying = flyover.tour(g);
    expect(player.active).toBe(true);
    const going = travel.go('b');
    expect(player.active).toBe(false);
    expect(await flying).toBe(true);
    await play(going);
    expect(g.busy).toBe(false);
    expect(hidden('joy')).toBe(false);
  });
});

describe('travel: the interface and the planner while the frame is closed', () => {
  it('the counters, the stick and the buttons are hidden from the call until the frame opens, then back as they were', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b', { music: 222 });
    const { travel, play, transition } = await setup([a, b]);
    $('btnJump').classList.remove('hidden');
    expect(hidden('hud')).toBe(false);
    // Read after each frame, as the screen shows it: `play` calls this before the next one.
    const seen: { phase: string; shown: string[]; music: boolean }[] = [];
    await play(travel.go('b'), () => seen.push({ phase: transition.phase, shown: ['hud', 'joy', 'btnJump', 'btnAct', 'bubble'].filter((id) => !hidden(id)), music: log.includes('music 222') }));
    // Hidden while the frame closes and for as long as it is closed - the frames the loading ring fades out in too.
    for (const s of seen.filter((x) => x.phase === 'closing' || x.phase === 'hold')) expect(s, s.phase).toMatchObject({ shown: [], music: false });
    expect(seen.filter((x) => x.phase === 'hold').length).toBeGreaterThan(1);
    // Back, with the music of the new world, from the first frame of the opening on.
    expect(seen.filter((x) => x.phase === 'opening').length).toBeGreaterThan(0);
    for (const s of seen.filter((x) => x.phase === 'opening')) expect(s).toMatchObject({ shown: ['hud', 'joy'], music: true });
    expect(hidden('hud')).toBe(false);
    expect(hidden('joy')).toBe(false);
  });

  it('before "play" the counters stay hidden after the change: the start screen is still on', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, welcomed } = await setup([a, b], { started: false });
    await play(travel.go('b'));
    expect(hidden('hud')).toBe(true);
    expect(hidden('joy')).toBe(false);
    expect(welcomed).toEqual([]);
  });

  it('from the closed frame to the open one the planner lets no hint and no story start, then it is free again', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play } = await setup([a, b]);
    await play(travel.go('b'));
    const sound = log.filter((l) => l === 'endTask' || l === 'beginTask' || l.startsWith('music') || l === 'build b' || l === 'own of a');
    expect(sound).toEqual(['endTask', 'beginTask', 'music off', 'own of a', 'build b', 'endTask', 'music off']);
  });
});

describe('travel: the entry into the world, the watchers, the refusals', () => {
  it('once the frame is open the entry goes on as after "play": a world not visited yet, or one she comes back to', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const { travel, play, welcomed, g } = await setup([a, b]);
    const going = travel.go('b');
    await play(going);
    expect(welcomed).toEqual([true]);
    g.persist();
    await play(travel.go('a'));
    expect(welcomed).toEqual([true, false]);
    await play(travel.go('b'));
    expect(welcomed).toEqual([true, false, false]);
  });

  it('a world not visited yet is a first entry even if the game is saved while it is opened (the save of every ten seconds during a long load)', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    const build = b.build.bind(b);
    // the save writes where she stands into the part of the world entered: read after that, the world would look visited
    b.build = (g, L, sky, scope) => { const built = build(g, L, sky, scope); g.persist(); return built; };
    const { travel, play, welcomed } = await setup([a, b]);
    await play(travel.go('b'));
    expect(welcomed).toEqual([true]);
  });

  it('the pets are of the world played: out of the scene with the world left, before its scope is disposed, and made anew for the world entered', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b');
    (b as { pet?: WorldDef['pet'] }).pet = { species: PETS[0].id, at: { x: 3, z: 4 } };
    const { travel, play, g, scene } = await setup([a, b]);
    const first = g.pets;
    expect(first.spots).toHaveLength(0);                       // the world "a" has no pet of its own
    await play(travel.go('b'));
    const second = g.pets;
    expect(second).not.toBe(first);
    expect(second.spots).toHaveLength(1);                      // the pet of "b" waits at its place, to be taken
    expect(second.spots[0].on()).toBe(true);
    const pet = second.waiting!.root;
    expect(pet.parent).toBe(scene);
    expect([pet.position.x, pet.position.z]).toEqual([3, 4]);
    // back: the pet leaves the scene behind the closed frame, before the scope of its world is disposed
    const out = second.dispose;
    second.dispose = () => { log.push('pets out'); out(); };
    log.length = 0;
    await play(travel.go('a'));
    expect(log.indexOf('pets out')).toBeGreaterThan(-1);
    expect(log.indexOf('pets out')).toBeLessThan(log.indexOf('own of b'));
    expect(pet.parent).toBeNull();
    expect(second.spots[0].on()).toBe(false);                  // the spot of the world left can no longer be used
    expect(g.pets).not.toBe(second);
    expect(g.pets.spots).toHaveLength(0);
    expect(g.pets.waiting).toBeNull();
  });

  it('a shared part of the game learns of the change: "leave" in the world left, "enter" with the part of the new one, before its build', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b'), c = fakeWorld('c');
    const { travel, play, g, scene } = await setup([a, b, c]);
    const pet = mesh('a pet');
    g.onWorld((now) => {
      log.push(`${now} ${g.worldId}`);
      if (now === 'enter' && !pet.parent) scene.add(pet);
    });
    await play(travel.go('b'));
    expect(log.filter((l) => /^(leave|enter|build|own of)/.test(l))).toEqual(['leave a', 'own of a', 'enter b', 'build b']);
    // What a watcher adds to the scene on "enter" is the game's: the next change leaves it there.
    await play(travel.go('c'));
    expect(scene.children).toContain(pet);
    expect(log).not.toContain('a pet freed');
  });

  it('a change during a change, a change to the world played and an unknown world', async () => {
    const a = fakeWorld('a'), b = fakeWorld('b'), c = fakeWorld('c');
    const { travel, play, T } = await setup([a, b, c]);
    expect(await travel.go('a')).toBe(false);
    expect(travel.active).toBe(false);
    await expect(travel.go('nowhere')).rejects.toThrow('travel: no world "nowhere" in the registry');
    expect(log).toEqual([]);
    const going = travel.go('b');
    expect(travel.active).toBe(true);
    expect(await travel.go('c')).toBe(false);
    expect(await play(going)).toBe(true);
    expect(travel.world).toBe('b');
    expect(c.builds).toHaveLength(0);
    // The function a world's own code calls (a portal) is the same change.
    expect(await play(T.travel('c'))).toBe(true);
    expect(travel.world).toBe('c');
  });

  it('before the game has made its travel the function of the worlds does nothing', async () => {
    vi.resetModules();
    const { travel } = await import('./travel');
    expect(await travel('b')).toBe(false);
  });
});

describe('openWorld: the one way a world is opened', () => {
  it('the scope is made before the sky, so the sky and the sun are the world\'s; the load is recorded as the world\'s', async () => {
    vi.resetModules();
    const { openWorld } = await import('./travel');
    const scene = new THREE.Scene();
    const mine = mesh('the game\'s own');
    scene.add(mine);
    const a = fakeWorld('a');
    const o = openWorld(a, scene);
    expect(o.world).toBe(a);
    expect(o.sky.sun.name).toBe('a sun');
    expect(await o.load({} as Save, false)).toEqual({ of: 'a' });
    expect(log).toEqual(['sky a', 'models of a', 'load a']);
    o.scope.dispose();
    expect(scene.children).toEqual([mine]);
    expect(log).toEqual(expect.arrayContaining(['a sky freed', 'a land freed']));
  });

  it('a sky that breaks half-made leaves nothing in the scene', async () => {
    vi.resetModules();
    const { openWorld } = await import('./travel');
    const scene = new THREE.Scene();
    const a = fakeWorld('a');
    a.fail = 'sky';
    expect(() => openWorld(a, scene)).toThrow('the sky of a broke');
    expect(scene.children).toEqual([]);
    expect(log).toContain('a half a sky freed');
  });
});
