import type * as THREE from 'three';
import { release, resetProgress, setProgressHandler, withScope } from '../core/assets';
import { beginTask, endTask, setMusic } from '../core/audio';
import type { Save } from '../core/save';
import type { WorldCache } from '../core/worldcache';
import { wearSaved } from '../ui/shop';
import { bubble, el, hideAnswers, setAct, showNotice } from '../ui/ui';
import type { Game, WorldEntry } from './context';
import { flyoverOf, setTour, type WorldTour } from './flyover';
import type { Gate } from './gate';
import type { Gear } from './gear';
import type { WorldFrame } from './loop';
import { createWorldScope, type WorldScope } from './scope';
import { transition } from './transition';
import type { BookInfo, BuiltWorld, WorldDef, WorldSky } from './world';

/**
 * The change of world without reloading the page (TECH-15, TECH-09): `travel(<id of a world>)`.
 *
 * What stays and what changes. The heroine, the cat, the sparks, the butterflies' flock, the camera, the interface and
 * `g` itself are made once and are the same objects in every world. Of a world there is: its scope (src/game/scope.ts:
 * what it put into the scene and subscribed to), its models (src/core/assets.ts, recorded under its id), its part of
 * `g` (`GameWorld`: its ground, its progress in the save - swapped whole by `g.enter`), its parts of the frame
 * (`loop.setWorld`), its book and the heroine's items as it dressed her (`worldView`), its music, its sun for the
 * quality tier and its part of window.__game.
 *
 * The order of one change (`go`):
 *  0. the gate of the world (src/game/gate.ts) is asked, with the frame open and the heroine standing: a world that is
 *     not downloaded, without network, is refused right there - the frame never closes, the gate has had the cat say
 *     why, the controls come back and the game goes on in the world played;
 *  1. the controls are taken, a task that is open is closed by its own button, the world played is left (`g.leave`:
 *     a scene of it that still runs can no longer take the controls or give them back), the counters and the stick hide;
 *  2. the frame closes (src/game/transition.ts) - the rest happens behind it, between two frames;
 *  3. the voice and the music fall silent and stay so, the game is saved;
 *  4. the world left is taken out: its scope is disposed, THEN its models are released, the heroine's items get back
 *     what the world changed of them, the flock is emptied, the tour is forgotten;
 *  5. a world the gate lets in "from the network" is first downloaded in full into the cache of worlds
 *     (src/core/worldcache.ts `download`) under the loading ring: what the page asks for while a world is played is
 *     not all of it (a clip of a line not said, a picture of a scene not shown), and a world left "partial" would be
 *     refused next time without network. Then the new world is opened under the ring: its scope, its sky, its load
 *     (the ring follows it), then `g.enter` and its build. If the download does not make the world ready, or any of
 *     the opening fails, what it left is taken out the same way and the world left is opened again - its files are in
 *     the browser's cache - so the game is never without a world;
 *  6. the built world is handed to whoever shows it, one frame of it is drawn behind the closed frame (its shaders
 *     compile there), the frame opens, the controls come back, and the entry into the world goes on as after "play"
 *     (src/game/start.ts `enterWorld`: the tour of a world not visited yet, then the cat's line) - or, when the
 *     download did not make the world ready, the cat says that the network is needed (`refuse`).
 *
 * The first world of a session is opened and built through the same two functions (`openWorld`, `begin`) by src/main.ts.
 */

/** A world being opened: its scope, its sky, and its load and its build bound to them. */
export interface Opening {
  readonly world: WorldDef;
  readonly scope: WorldScope;
  readonly sky: WorldSky;
  /** The world's own load; its models are recorded as the world's (`withScope`), so `release` frees them. Null = failed for good. */
  load(save: Save, touch: boolean): Promise<unknown>;
  build(g: Game, loads: unknown): BuiltWorld;
}

/**
 * Opens a world: its scope is made first, so the sky, the sun and the fog are the world's too (what is in the scene
 * at that moment is the game's - the heroine, the cat and the parts of the loop, once they exist).
 */
export function openWorld(world: WorldDef, scene: THREE.Scene): Opening {
  const scope = createWorldScope(scene);
  let sky: WorldSky;
  // A sky that broke half-made leaves nothing behind: nobody else holds this scope yet.
  try { sky = world.sky(scene, scope); } catch (e) { scope.dispose(); throw e; }
  return {
    world, scope, sky,
    load: (save, touch) => withScope(world.id, () => world.load(scene, save, touch, scope)),
    build: (g, L) => world.build(g, L, sky, scope),
  };
}

/**
 * The book and the heroine's items as the menus hold them (src/game/start.ts hands them to the book and to the shop
 * once, for the session): they answer for the world played at the moment of the question.
 */
export function worldView(now: () => BuiltWorld): { book: BookInfo; gear: Gear } {
  return {
    book: { parts: () => now().book.parts(), stats: () => now().book.stats() },
    gear: {
      set: (slot, id) => now().gear.set(slot, id), get: (slot) => now().gear.get(slot), tint: (color) => now().gear.tint(color),
      get color() { return now().gear.color; }, get parts() { return now().gear.parts; },
      update: (time, grounded) => now().gear.update(time, grounded),
    },
  };
}

/**
 * The heroine's items hang under her bones for the whole session (the shared load), but a world dresses her: its gear
 * (src/game/gear.ts) gives some of them materials of its own and shows what is worn. Call it before a world is built;
 * the function it returns puts the items back as they were - the materials they had (the world's copies are freed),
 * every item hidden - so the next world dresses the same heroine, not the one the last world left.
 */
export function keepHeroItems(g: Game): () => void {
  const parts = Object.values(g.heroRig.gear);
  const had: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  for (const p of parts) p.object.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) had.push({ mesh: m, material: m.material }); });
  return () => {
    for (const { mesh, material } of had) {
      if (mesh.material === material) continue;
      for (const m of [mesh.material].flat()) m.dispose();
      mesh.material = material;
    }
    for (const p of parts) p.object.visible = false;
  };
}

/** The frame between two worlds: nothing of a world moves, nothing can be walked up to. */
export const NO_WORLD: WorldFrame = {
  spots: [], tap: () => false, afterMove: () => {}, update: () => {}, goal: () => null, animate: () => {}, focusDist: () => 6.5, beforeRender: () => {},
};

/**
 * No tour: what the world left handed in (src/game/flyover.ts keeps one tour per game) is replaced by one that counts
 * as flown - a world without a tour of its own must not fly the path of the world before it.
 */
const NO_TOUR: WorldTour = { path: { points: [], seconds: 0, line: 'go_next' }, visited: () => true, mark: () => {} };

/** The part of the loading ring the download of a world takes; the load of the world from the cache fills the rest. */
export const DOWNLOAD_SHARE = 0.8;

/** What the change of world needs of the game (src/main.ts wires it). */
export interface TravelHost {
  g: Game; scene: THREE.Scene; save: Save; touch: boolean;
  /** The worlds of the registry (src/worlds/index.ts): the shared code is handed them, it imports no world. */
  worlds: readonly WorldDef[];
  /** What the game is told of a world (`WorldEntry`): the same function makes it for the first world. */
  entryOf(world: WorldDef): WorldEntry;
  /** The world's parts of the frame from the next frame on (the loop). */
  setFrame(frame: WorldFrame): void;
  /** The world built behind the closed frame goes to whoever shows it: its sun to the quality tier, its part of window.__game. */
  show(built: BuiltWorld, sky: WorldSky): void;
  /** Settles once the next frame of the game has been drawn (the loop). */
  drawn(): Promise<void>;
  /** The entry into the world once its frame is open (src/game/start.ts `enterWorld`); `first` - she has not been in it yet. */
  welcome(first: boolean): Promise<void>;
  /** The gate of the worlds (src/game/gate.ts): asked for every change, before anything of it is done. */
  gate: Gate;
  /** The cache of the worlds (src/core/worldcache.ts): a world let in "from the network" is downloaded through it in full. */
  cache: Pick<WorldCache, 'download' | 'state'>;
  /** What a world that could not be had after all does - the same as a refusal of the gate: the cat's line. */
  refuse(): void;
}

export interface Travel {
  /** The id of the world played (while a change is on: of the world that is being left, until the new one is built). */
  readonly world: string;
  /** A change of world is on: from the call of `go` until the frame is open again. */
  readonly active: boolean;
  /** What the world played built; null while there is none (between two worlds). */
  readonly built: BuiltWorld | null;
  /** Builds the first world of the session, opened and loaded by src/main.ts: the way every world travelled to is built. */
  begin(first: Opening, loads: unknown): BuiltWorld;
  /**
   * Changes the world. Settles when the frame is open again and the heroine can walk: true - in the world asked for,
   * false - not (the gate refused it and the frame never closed; its download or its load failed and the game is back
   * in the world before; a change is already on; it is the world played). An id the registry does not know is an error.
   */
  go(id: string): Promise<boolean>;
}

/** A world that is played: what opened it, what it built, and what gives the heroine's items back. */
interface Played { opening: Opening; built: BuiltWorld; undo: () => void }

let installed: Travel | null = null;

/**
 * Changes the world played to the world `id` (see `Travel.go`). For a world's own code - a portal is a spot whose
 * `run` calls it. Does nothing (false) before the game has made its travel.
 */
export function travel(id: string): Promise<boolean> {
  return installed ? installed.go(id) : Promise.resolve(false);
}

export function createTravel(host: TravelHost): Travel {
  const { g, scene, save, touch } = host;
  let current: Played | null = null;
  let worldId = '';
  let active = false;

  function build(opening: Opening, loads: unknown): Played {
    const undo = keepHeroItems(g);
    try { return { opening, built: opening.build(g, loads), undo }; } catch (e) { undo(); throw e; }
  }

  /** Takes a world out: its scope first (what it undoes itself, then the scene), THEN its models, then what it left on the game's own. */
  function close(opening: Opening, undo: () => void) {
    // The pets leave the scene with the world, behind the closed frame: one shown later than the world's build joined
    // the scene outside shared(), and the scope would free the model every world shares.
    g.pets.dispose();
    try { opening.scope.dispose(); } catch (e) { console.error(`the world "${opening.world.id}" did not undo everything of its own:`, e); }
    release(opening.world.id);
    undo();
    g.flies.truncate(g.flies.flies.length);
    setTour(g, NO_TOUR);
  }

  /** Opens and builds `world` behind the closed frame. Null = it could not be: nothing of it is left in the scene or in the loader. */
  async function open(world: WorldDef): Promise<Played | null> {
    let opening: Opening | null = null, entered = false;
    try {
      resetProgress();
      const o = opening = openWorld(world, scene);
      const loads = await o.load(save, touch);
      if (loads !== null) {
        // The game's part of the world, then the world itself. What a watcher of the change (g.onWorld) adds to the
        // scene on "enter" is the game's, as what createGame adds is.
        o.scope.shared(() => g.enter(host.entryOf(world)));
        entered = true;
        return build(o, loads);
      }
    } catch (e) {
      console.error(`the world "${world.id}" could not be opened:`, e);
    }
    if (entered) g.leave();
    if (opening) close(opening, () => {});
    return null;
  }

  /** A task that is open is closed by its own close button, the way the child closes it (PLAY-02); the tour ends where it is. */
  function endScenes() {
    const shown = (id: string) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') ? e : null; };
    if (shown('task')) document.getElementById('taskClose')?.click();
    shown('answersClose')?.click();
    flyoverOf(g)?.skip();
  }

  /** The counters, the stick and the jump button lie over the canvas: they would stay on the screen over the closed frame. */
  const hideControls = () => { for (const e of [el.hud, el.joy, el.btnJump]) e.classList.add('hidden'); };

  /**
   * Whatever a scene of the world left had on the screen, in the air or in its hold is cleared: that scene will not do
   * it (a wait of the world's scope never settles once the scope is disposed, and its stage no longer gives the
   * controls back). The controls stay taken: `go` gives them back once the frame is open.
   */
  function quiet() {
    endScenes();
    endTask();                                   // the planner out of the task mode, the line that sounds cut
    g.speech.caption(null);
    hideAnswers(); setAct(null);
    document.getElementById('task')?.classList.add('hidden');
    el.fanfare.classList.add('hidden');
    hideControls();
    g.busy = true; g.auto = null; g.cam.focus = null; g.camOverride = null; g.finale = 0;
    g.hero.play('Idle'); g.cat.play('Idle');
  }

  /** Where the heroine is on the screen, in parts of it from the top left corner: the iris closes and opens on her. */
  function heroOnScreen() {
    const v = g.hero.root.position.clone();
    v.y += 1;
    v.project(g.camera);
    return { x: v.x * 0.5 + 0.5, y: -v.y * 0.5 + 0.5 };
  }

  /**
   * Downloads the world `id` in full into the cache of worlds, the loading ring following the files that came (up to
   * DOWNLOAD_SHARE of it). True when the world is ready; a failure of the network or of the storage is false.
   */
  async function download(id: string): Promise<boolean> {
    let over = false;
    const going = host.cache.download(id).then((d) => d.status === 'ready' || d.status === 'core', () => false);
    void going.then(() => { over = true; });
    while (!over) {
      const s = host.cache.state();
      if (s?.world === id && s.total > 0) transition.setProgress(DOWNLOAD_SHARE * s.done / s.total);
      await Promise.race([host.drawn(), going]);
    }
    const ready = await going;
    if (ready) transition.setProgress(DOWNLOAD_SHARE);
    return ready;
  }

  async function go(id: string): Promise<boolean> {
    const next = host.worlds.find((w) => w.id === id);
    if (!next) throw new Error(`travel: no world "${id}" in the registry (src/worlds/index.ts)`);
    const was = current;
    if (active || !was || was.opening.world.id === id) return false;
    active = true;

    // ---- 0. the gate: the heroine stands while it is asked (no step away from the portal, at most the time limit of
    // its probe of the network); refused, nothing of the change is done - the frame stays open, she walks again ----
    const free = !g.busy;
    g.busy = true;
    const gate = await host.gate.canEnter(id);
    if (!gate.enter) { if (free) g.busy = false; active = false; return false; }

    // ---- 1. the controls are taken, the scenes of the world end, the world is left ----
    g.busy = true; g.auto = null; setAct(null);
    endScenes();
    g.leave();
    hideControls();
    // ---- 2. the frame closes on the heroine ----
    transition.start({ center: heroOnScreen() });
    await transition.whenClosed();

    // ---- 3. behind the closed frame: silence, and the game is saved ----
    quiet();
    beginTask();                                 // until the frame opens no hint and no line of a story starts
    setMusic(null);
    g.persist();
    // ---- 4. the world left is taken out ----
    current = null;
    host.setFrame(NO_WORLD);
    close(was.opening, was.undo);
    // ---- 5. the new world under the loading ring (downloaded first when it comes from the network); if it cannot
    // be had or opened, the world left again ----
    const first = save.worlds[id]?.pos == null;
    const fetched = gate.from === 'network' ? await download(id) : true;
    const base = gate.from === 'network' ? DOWNLOAD_SHARE : 0;
    setProgressHandler((f) => transition.setProgress(base + (1 - base) * f));
    let now = fetched ? await open(next) : null;
    const arrived = now !== null;
    if (!now) now = await open(was.opening.world);
    if (!now) {
      // Neither world could be opened (no network and nothing in the cache): the game says so, with "try again".
      endTask();
      active = false;
      el.start.classList.remove('hidden');
      showNotice('load_failed', () => location.reload());
      return false;
    }
    // ---- 6. the built world is shown, the frame opens ----
    current = now; worldId = now.opening.world.id;
    wearSaved(save, now.built.gear);
    host.show(now.built, now.opening.sky);
    host.setFrame(now.built.frame);
    g.refreshHud();
    await host.drawn();                          // one frame of the new world behind the closed frame
    quiet();                                     // what a scene of the world left started meanwhile; the planner is free again
    const at = heroOnScreen();
    transition.setCenter(at.x, at.y);
    transition.ready();
    // The frame stays closed while the loading ring fades out; the music and the interface come back as it starts to
    // open: the counters once the game is started, the stick always (the frame itself shows the jump and the action
    // button when the heroine can move).
    while (transition.phase === 'hold') await host.drawn();
    setMusic(now.opening.world.music ?? null);
    el.hud.classList.toggle('hidden', !g.started()); el.joy.classList.remove('hidden');
    await transition.whenDone();
    g.busy = false;
    active = false;
    if (!fetched) {
      // Back in the world before: the world could not be downloaded - as without network, the cat says so.
      host.refuse();
    } else if (!arrived) {
      // Back in the world before. The world's load has said why on the start screen, which the game covers: the
      // same text goes to the bubble (text only, it is for the grown-ups), and the start screen gets its panel back.
      el.notice.classList.add('hidden'); el.setup.classList.remove('hidden');
      bubble('load_failed', 8000);
    } else if (g.started()) void host.welcome(first);
    return arrived;
  }

  const api: Travel = {
    get world() { return worldId; },
    get active() { return active; },
    get built() { return current?.built ?? null; },
    begin(first, loads) {
      current = build(first, loads);
      worldId = first.world.id;
      return current.built;
    },
    go,
  };
  installed = api;
  return api;
}
