import './style.css';
import { setProgressHandler } from './core/assets';
import { setMusic, setVolumes, volume } from './core/audio';
import { createRng } from './core/rng';
import { loadSave } from './core/save';
import { createWorldCache } from './core/worldcache';
import { createQuality, createRenderer } from './core/renderer';
import { loadShared } from './game/boot';
import { createGame, type WorldEntry } from './game/context';
import { exposeDebug } from './game/debug';
import { createGate, probeNetwork } from './game/gate';
import { startLoop } from './game/loop';
import { createSpeech } from './game/speech';
import { enterWorld, initStartScreen } from './game/start';
import { createTravel, openWorld, worldView, type Travel } from './game/travel';
import { pickWorld, type WorldDef } from './game/world';
import { addStrings } from './ui/strings';
import { el, initStart, showNotice } from './ui/ui';
import { initTuningPanel } from './ui/tuning';
import { DEFAULT_WORLD, WORLDS, nextWorlds } from './worlds';

const params = new URLSearchParams(location.search);
// Debug tools (ARCH-11, ARCH-14): the frame counter, window.__game and the tuning panel exist only with ?debug in the
// address or on the development server. The frames are measured either way: the quality fallback needs them.
const debug = params.has('debug') || import.meta.env.DEV;
// ARCH-08: ?seed=<text> makes the tasks repeat (the same tasks in the same order); without it they are random.
const rng = createRng(params.get('seed'));
// ARCH-06: the world to play, from the registry (src/worlds/index.ts): its default world; ?world=<id> only with debug.
const world = pickWorld(WORLDS, DEFAULT_WORLD, params.get('world'), debug);
// ARCH-12: the texts of every world of the registry join the shared ones before anything is shown (a key two worlds
// share is an error, one key per clip), and the start screen's subtitle is the one of the world played;
// ARCH-06: the music is the one of the world played.
for (const w of WORLDS) addStrings(w.strings, w === world);
setMusic(world.music ?? null);
if (debug) initTuningPanel(el.fps); else el.fps.remove();
const save = loadSave();
const applyVolume = () => { Object.assign(volume, save.vol); setVolumes(); };
applyVolume();
initStart(save, save.played, () => applyLook());

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
const touch = matchMedia('(pointer: coarse)').matches;
// TECH-15: the world played first is opened the way every world travelled to is (src/game/travel.ts `openWorld`). Its
// scope owns what the world adds to the scene and subscribes to; it is made before the world's sky, so the sky and
// the sun are the world's too. What the game adds itself is marked with shared().
const opened = openWorld(world, scene);
// The tier, the launch counter and the frame meter (core/renderer.ts): the tier is chosen and stored right here.
const quality = createQuality({ renderer, scene, camera, sun: opened.sky.sun, save, param: params.get('q'), touch, debug });
addEventListener('resize', () => quality.apply());

// ---------- boot ----------
setProgressHandler((f) => { el.bar.style.width = `${Math.round(f * 100)}%`; });
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
    id: world.id, ground: world.ground, spawn: world.spawn, crystals: () => travel.built?.hud() ?? '',
    pet: world.pet, characters: world.characters, secrets: world.secrets, chest: world.chest, groundStars: world.groundStars,
    move: world.move, worldTasks: world.worldTasks,
  });
  // shared(): the heroine, the cat, the sparks and the butterflies - and the guide and the tap ring of the loop below -
  // join the scene after the world's sky and load, and are not the world's.
  const g = opened.scope.shared(() => createGame({
    scene, camera, renderer, save, touch, debug, speech, rng, shared,
    world: entryOf(world),
  }));
  applyLook = () => shared.heroRig.setLook(save);
  // TECH-09: the cache of the next worlds and the gate every change of world asks (src/game/gate.ts): a world that
  // is not downloaded, without network, is refused and the cat says that the network is needed (its clip is in the core).
  const worlds = createWorldCache();
  const refuse = () => { void g.speech.line('need_net', 'hint'); };
  const gate = createGate({
    worlds: WORLDS.map((w) => w.id), defaultWorld: DEFAULT_WORLD, status: (id) => worlds.status(id),
    online: () => navigator.onLine, probe: () => probeNetwork(), refuse,
  });
  // TECH-15: the change of world (src/game/travel.ts). The built world goes to the frame, the quality tier and
  // window.__game through it - the first one below, every next one from `travel(<id>)`.
  const travel: Travel = createTravel({
    g, scene, save, touch, worlds: WORLDS, entryOf,
    setFrame: (frame) => loop.setWorld(frame),
    show: (built, sky) => { quality.setSun(sky.sun); showDebug?.(built.debug); },
    drawn: () => loop.drawn(),
    welcome: (first) => enterWorld(g, first),
    gate, cache: worlds, refuse,
  });
  // The world: its objects, tasks, conversations and parts of the frame (src/worlds/<id>/index.ts).
  const w = travel.begin(opened, L);

  // ---------- start screen & menus ----------
  // The book and the heroine's items are the ones of the world played at the moment they are asked for.
  initStartScreen(g, { applyVolume, applyPin: () => quality.applyPin(), applyLook, lines: w.lines, ...worldView(() => travel.built ?? w) });

  // ---------- loop ----------
  // The parts of the loop every world shares are made inside shared(); the first frame is played outside it.
  const loop = opened.scope.shared(() => startLoop(g, quality, w.frame));
  loop.run();

  // ---------- TECH-09: the next world is downloaded while this one is played ----------
  // Not with the launch: the first press of "Play" starts it (the list of requests of the launch holds no file of
  // another world), one file at a time, and not at all when the browser saves data (src/core/worldcache.ts). A build
  // with one world has no next one: nothing is asked for.
  el.play.addEventListener('click', () => { void worlds.downloadNext(nextWorlds(world.id)); }, { once: true });

  const showDebug = debug ? exposeDebug(g, w.debug, travel) : null;
  // The walkthrough of the cache (tools/worlds.mjs) reads the download and the cache through these.
  if (debug) Object.assign((window as unknown as { __game: object }).__game, { worlds });
}
