import './style.css';
import { setProgressHandler } from './core/assets';
import { holdSound, setMusic, setVolumes, volume } from './core/audio';
import { dropStaleDeletes, watchContext } from './core/contextloss';
import { createRng } from './core/rng';
import { loadSave } from './core/save';
import { applyControls } from './core/tuning';
import { startUpdater } from './core/update';
import { createWorldCache } from './core/worldcache';
import { createQuality, createRenderer } from './core/renderer';
import { setTaskRenderer } from './game/taskviews/diff-scene';
import { loadShared } from './game/boot';
import { createGame, type WorldEntry } from './game/context';
import { exposeDebug } from './game/debug';
import { createGate, probeNetwork } from './game/gate';
import { startLoop } from './game/loop';
import { createSpeech } from './game/speech';
import { enterWorld, initStartScreen } from './game/start';
import { installSupplies } from './game/supplyfx';
import { createTravel, openWorld, worldView, type Travel } from './game/travel';
import { launchWorld, type WorldDef } from './game/world';
import { addStrings } from './ui/strings';
import { el, hideNotice, initStart, showNotice, showUpdate } from './ui/ui';
import { initSupplyRow } from './ui/supplies';
import { initTuningPanel } from './ui/tuning';
import { DEFAULT_WORLD, INSTALLED, WORLDS, nextWorlds } from './worlds';
import { knowWorlds } from './game/artifacts';

const params = new URLSearchParams(location.search);
/** The part of the loading bar the download of the world where she stopped takes at the launch (when it is needed). */
const LAUNCH_DOWNLOAD_SHARE = 0.8;
// Debug tools (ARCH-11, ARCH-14): the frame counter, window.__game and the tuning panel exist only with ?debug in the
// address or on the development server. The frames are measured either way: the quality fallback needs them.
const debug = params.has('debug') || import.meta.env.DEV;
// ARCH-08: ?seed=<text> makes the tasks repeat (the same tasks in the same order); without it they are random.
const rng = createRng(params.get('seed'));
const save = loadSave();
// TECH-09: the cache of the next worlds and the gate every change of world asks (src/game/gate.ts): a world that
// is not downloaded, without network, is refused and the cat says that the network is needed (its clip is in the core).
// The gate is made before the world is chosen (the launch asks it too); what a refusal says is set once the game is.
const worlds = createWorldCache();
let refuse = () => {};
const gate = createGate({
  worlds: WORLDS.map((w) => w.id), installed: INSTALLED, status: (id) => worlds.status(id),
  online: () => navigator.onLine, probe: () => probeNetwork(), refuse: () => refuse(),
});
// ARCH-06, WORLD-01: the world to play, from the registry (src/worlds/index.ts): the world where she stopped, through
// the gate (src/game/world.ts `launchWorld`), else the default world; ?world=<id> only with debug. A world to be had
// from the network is downloaded first, under the loading bar (its first part; the load of the world fills the rest).
let barFrom = 0;
const { world, refused: refusedAtLaunch } = await launchWorld(WORLDS, DEFAULT_WORLD, params.get('world'), debug, save.lastWorld, {
  gate,
  download: async (id) => {
    const tick = setInterval(() => { const s = worlds.state(); if (s?.world === id && s.total > 0) el.bar.style.width = `${Math.round(LAUNCH_DOWNLOAD_SHARE * 100 * s.done / s.total)}%`; }, 200);
    const d = await worlds.download(id).catch(() => null);
    clearInterval(tick);
    const ready = d?.status === 'ready' || d?.status === 'core';
    if (ready) barFrom = LAUNCH_DOWNLOAD_SHARE;
    return ready;
  },
});
// ARCH-12: the texts of every world of the registry join the shared ones before anything is shown (a key two worlds
// share is an error, one key per clip), and the start screen's subtitle is the one of the world played;
// ARCH-06: the music is the one of the world played.
for (const w of WORLDS) addStrings(w.strings, w === world);
knowWorlds(WORLDS);   // the artifacts and the shelf count the worlds of the registry (src/game/artifacts.ts)
setMusic(world.music ?? null);
if (debug) initTuningPanel(el.fps); else el.fps.remove();
// PLAY-22: the controls the parent chose (the heroine's speed, the camera, the joystick), before anything reads them.
applyControls(save.controls);
const applyVolume = () => { Object.assign(volume, save.vol); setVolumes(); };
applyVolume();
initStart(save, save.played, () => applyLook());
// TECH-13: a new version is switched on here, on the start screen before "Play" (one reload, when no other page of the
// game answers), or by the browser once every page of the game is closed; never after "Play" (src/core/update.ts).
let played = false;
el.play.addEventListener('click', () => { played = true; }, { once: true, capture: true });
const updater = startUpdater({ playing: () => played, hold: (on) => { (el.play as HTMLButtonElement).disabled = on; } });
updater.onState(showUpdate);

// ---------- TECH-07: no WebGL2, no game ----------
// Three.js 0.170 draws with WebGL2 only: without it the renderer below throws, and the page would stay on the loading
// bar with an error. The check asks a canvas of its own (a context made on #c would keep the attributes of the check).
// Without WebGL2 the start screen shows the message instead, and this module stops right here, before anything of
// Three.js is created - no renderer, no quality tier, no launch counted. The await never settles, on purpose.
function webgl2(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}
if (!webgl2()) { showNotice('no_webgl'); await new Promise<never>(() => {}); }

// ---------- renderer & quality tiers ----------
const { renderer, scene, camera } = createRenderer(el.canvas);
setTaskRenderer(renderer);   // the pictures of "find the differences" are drawn with it (LEARN-18)
const touch = matchMedia('(pointer: coarse)').matches;
// TECH-15: the world played first is opened the way every world travelled to is (src/game/travel.ts `openWorld`). Its
// scope owns what the world adds to the scene and subscribes to; it is made before the world's sky, so the sky and
// the sun are the world's too. What the game adds itself is marked with shared().
const opened = openWorld(world, scene);
// The tier, the launch counter and the frame meter (core/renderer.ts): the tier is chosen and stored right here.
const quality = createQuality({ renderer, scene, camera, sun: opened.sky.sun, save, param: params.get('q'), touch, debug });
addEventListener('resize', () => quality.apply());

// ---------- boot ----------
setProgressHandler((f) => { el.bar.style.width = `${Math.round((barFrom + (1 - barFrom) * f) * 100)}%`; });
let applyLook = () => {};
quality.apply();
void boot();

async function boot() {
  // TECH-15: the shared load (the heroine with her items, the cat) and the load of the world run together under the one
  // loading bar. Either may fail (TECH-08): the notice with "try again" is on screen then, once, and nothing is built.
  const [shared, L] = await Promise.all([loadShared(save), opened.load(save, touch)]);
  if (!shared || !L) return;
  const speech = createSpeech();
  // What the game is told of a world (WorldEntry) - the first one and every world travelled to. The one place: a field
  // of a world's description that `g` needs is added to this literal. The counter is read only once the world is built
  // (the first frame, the start button, a reward).
  const entryOf = (world: WorldDef): WorldEntry => ({
    id: world.id, ground: world.ground, spawn: world.spawn, crystals: () => travel.built?.hud() ?? '', crystalsIcon: () => travel.built?.hudIcon ?? '💎',
    pet: world.pet, characters: world.characters, secrets: world.secrets, chest: world.chest, groundStars: world.groundStars,
    move: world.move, worldTasks: world.worldTasks, arrive: world.arrive?.bind(world), left: world.left?.bind(world), mystery: world.mystery, collect: world.collect,
  });
  // shared(): the heroine, the cat, the sparks and the butterflies - and the guide and the tap ring of the loop below -
  // join the scene after the world's sky and load, and are not the world's.
  const g = opened.scope.shared(() => createGame({
    scene, camera, renderer, save, touch, debug, speech, rng, shared,
    world: entryOf(world),
  }));
  applyLook = () => shared.heroRig.setLook(save);
  // TECH-09: a refusal of the gate - the cat says that the network is needed. The world where she stopped, refused at
  // the launch, is said once she plays (src/game/start.ts, after "Play" and the entry into the world).
  refuse = () => { void g.speech.line('need_net', 'hint'); };
  // TECH-15: the change of world (src/game/travel.ts). The built world goes to the frame, the quality tier and
  // window.__game through it - the first one below, every next one from `travel(<id>)`.
  const travel: Travel = createTravel({
    g, scene, save, touch, worlds: WORLDS, entryOf,
    setFrame: (frame) => loop.setWorld(frame),
    show: (built, sky) => { quality.setSun(sky.sun); showDebug?.(built.debug); },
    drawn: () => loop.drawn(),
    welcome: (first) => enterWorld(g, first, 'travel'),
    arrived: (id) => { void worlds.downloadNext(nextWorlds(id)); },
    gate, cache: worlds, refuse,
  });
  // The world: its objects, tasks, conversations and parts of the frame (src/worlds/<id>/index.ts).
  const w = travel.begin(opened, L);

  // ---------- start screen & menus ----------
  // The book and the heroine's items are the ones of the world played at the moment they are asked for.
  initStartScreen(g, {
    applyVolume, applyPin: () => quality.applyPin(), applyLook, lines: w.lines, ...worldView(() => travel.built ?? w),
    launched: { world: world.id, refused: refusedAtLaunch, refuse: () => refuse() },
  });

  // ---------- the potions and the compass (src/game/supplyfx.ts): the game's own, through every world ----------
  const supplies = opened.scope.shared(() => installSupplies(g, {
    glimmer: () => travel.built?.glimmer?.() ?? [],
    cramped: () => travel.built?.cramped?.() ?? false,
  }));
  // The cat's line answers the child's own tap: as the shop's lines, it is not a hint a sounding line turns away.
  supplies.onFrame(initSupplyRow(supplies, { say: (key) => { void g.speech.line(key, 'story'); } }));

  // ---------- loop ----------
  // The parts of the loop every world shares are made inside shared(); the first frame is played outside it.
  const loop = opened.scope.shared(() => startLoop(g, quality, w.frame));
  loop.run();

  // ---------- the picture lost (src/core/contextloss.ts, decision of 2026-11-21) ----------
  // The game stands as on a hidden page; back by itself, it goes on. Not back in time: the save is written first, then
  // the grown-ups see "reload" over the start screen; should the picture come back even then, the game goes on.
  let over: boolean | null = null;   // the message is shown; true: over a started game
  const stale = dropStaleDeletes(renderer.getContext());   // the old objects' deletes after the context is back
  watchContext(el.canvas, {
    lost: () => { stale.lost(); g.dark = true; holdSound(true); },
    back: () => {
      g.dark = false; holdSound(false);
      if (over) hideNotice();
      over = over === false ? false : null;
    },
    gone: () => { g.persist(); over = g.started(); showNotice('gpu_lost', () => location.reload()); },
  });

  // ---------- TECH-09: the next world is downloaded while this one is played ----------
  // Not with the launch: the first press of "Play" starts it (the list of requests of the launch holds no file of
  // another world), one file at a time, and not at all when the browser saves data (src/core/worldcache.ts). A build
  // with one world has no next one: nothing is asked for.
  // From there on every change of world starts it again from the world entered (`arrived` above).
  el.play.addEventListener('click', () => { void worlds.downloadNext(nextWorlds(world.id)); }, { once: true });

  const showDebug = debug ? exposeDebug(g, w.debug, travel) : null;
  // The walkthrough of the cache (tools/worlds.mjs) reads the download and the cache through these.
  if (debug) Object.assign((window as unknown as { __game: object }).__game, { worlds, update: updater });
}
