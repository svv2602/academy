import './style.css';
import { setProgressHandler } from './core/assets';
import { setMusic, setVolumes, volume } from './core/audio';
import { createRng } from './core/rng';
import { loadSave } from './core/save';
import { createQuality, createRenderer } from './core/renderer';
import { createGame } from './game/context';
import { exposeDebug } from './game/debug';
import { startLoop } from './game/loop';
import { createSpeech } from './game/speech';
import { initStartScreen } from './game/start';
import { pickWorld, type BuiltWorld } from './game/world';
import { addStrings } from './ui/strings';
import { el, initStart, showNotice } from './ui/ui';
import { initTuningPanel } from './ui/tuning';
import { DEFAULT_WORLD, WORLDS } from './worlds';

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
const sky = world.sky(scene);
// The tier, the launch counter and the frame meter (core/renderer.ts): the tier is chosen and stored right here.
const quality = createQuality({ renderer, scene, camera, sun: sky.sun, save, param: params.get('q'), touch, debug });
addEventListener('resize', () => quality.apply());

// ---------- boot ----------
setProgressHandler((f) => { el.bar.style.width = `${Math.round(f * 100)}%`; });
let applyLook = () => {};
quality.apply();
void boot();

async function boot() {
  const L = await world.load(scene, save, touch);
  if (!L) return;
  const { heroRig } = L;
  const speech = createSpeech();
  // The counter is read only once the world is built (the first frame, the start button, a reward).
  let built: BuiltWorld | null = null;
  const g = createGame({
    scene, camera, renderer, save, touch, debug, speech, heroRig, catRig: L.catRig, crystals: () => built?.hud() ?? '', rng,
    world: world.id, ground: world.ground, spawn: world.spawn,
  });
  applyLook = () => heroRig.setLook(save);
  // The world: its objects, tasks, conversations and parts of the frame (src/worlds/<id>/index.ts).
  const w = built = world.build(g, L, sky);

  // ---------- start screen & menus ----------
  initStartScreen(g, { applyVolume, applyPin: () => quality.applyPin(), lines: w.lines, book: w.book });

  // ---------- loop ----------
  startLoop(g, quality, w.frame);

  if (debug) exposeDebug(g, w.debug);
}
