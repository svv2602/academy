import * as THREE from 'three';
import './style.css';
import { rig, setProgressHandler, staticGeo, tint } from './core/assets';
import { say, setVolumes, sfx, speaking, stopVoice, volume } from './core/audio';
import { levelFor, loadSave, recordTask } from './core/save';
import { createQuality, createRenderer } from './core/renderer';
import { damp, lerp, pick, randInt } from './core/util';
import { Actor } from './game/actor';
import { createGame, createStage } from './game/context';
import { exposeDebug } from './game/debug';
import { numberSprite } from './game/fx';
import { buildHero } from './game/hero';
import { QUESTS, SHRINE, type QuestDef } from './game/quests';
import { startLoop, type WorldFrame } from './game/loop';
import type { Spot } from './game/player';
import { createSpeech } from './game/speech';
import { playScene } from './game/stage';
import { initStartScreen } from './game/start';
import { runTask, SKILL, type TaskResult, type TaskType } from './game/tasks';
import { buildClouds, buildGrass, buildMotes, buildRainbow, buildScenery, buildSky, buildWater, updateRanged } from './world/scenery';
import { CHEST, PATCH, buildTerrain, colliders, resolve } from './world/terrain';
import { el, fanfare, hideAnswers, initStart, showAnswers, showNotice } from './ui/ui';
import { t, tf } from './ui/strings';
import { initTuningPanel } from './ui/tuning';

const params = new URLSearchParams(location.search);
// Debug tools (ARCH-11, ARCH-14): the frame counter, window.__game and the tuning panel exist only with ?debug in the
// address or on the development server. The frames are measured either way: the quality fallback needs them.
const debug = params.has('debug') || import.meta.env.DEV;
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
const sky = buildSky(scene);
// The tier, the launch counter and the frame meter (core/renderer.ts): the tier is chosen and stored right here.
const quality = createQuality({ renderer, scene, camera, sun: sky.sun, save, param: params.get('q'), touch, debug });
addEventListener('resize', () => quality.apply());

// ---------- boot ----------
setProgressHandler((f) => { el.bar.style.width = `${Math.round(f * 100)}%`; });
let applyLook = () => {};
quality.apply();
void boot();

interface Npc { def: QuestDef; actor: Actor; pos: THREE.Vector3; mark: THREE.Mesh; idle: string; timer: number; }

async function boot() {
  const density = touch ? 0.75 : 1;
  scene.add(buildTerrain(touch ? 150 : 200));
  buildWater(scene);
  const rainbowAlpha = buildRainbow(scene);
  const motes = buildMotes(scene, 260);
  buildGrass(scene, touch ? 9000 : 16000);
  const loads = await Promise.all([
    buildScenery(scene, density), buildClouds(scene),
    buildHero(save), rig('extra/cat2', 0.62, true), rig('platformer_game_pack/Chest', 0.9),
    staticGeo('rpg_items_pack/Crystal2', 1), staticGeo('platformer_game_pack/Star', 0.7),
    rig('animals_pack/Horse_White', 2.0, true), rig('animals_pack/Fox', 0.8, true), rig('extra/mushking', 1.25, true),
    rig('animals_pack/Deer', 1.55, true), buildHero({ dress: '#ffd54f', hair: '#f5d16b', hairStyle: 'buns' }, 1.72, 1.1),
  ]).catch((e: unknown) => {
    // TECH-08: a model failed even after its repeats (src/core/assets.ts). "Try again" reloads the page rather than
    // building again here: the terrain, the water, the grass and part of the props are in the scene already, and a
    // second build in this page would double them. The models that did load come from the cache then.
    console.error('the game could not load:', e);
    showNotice('load_failed', () => location.reload());
    return null;
  });
  if (!loads) return;
  const [, updateClouds, heroRig, catRig, chestRig, crystalGeo, starGeo, uniRig, foxRig, kingRig, deerRig, queenRig] = loads;
  const speech = createSpeech();
  const g = createGame({ scene, camera, renderer, save, touch, debug, speech, heroRig, catRig, crystals: () => `${shardCount()}/5` });
  // Objects and functions only: the flags (busy, paused, auto, ...) are read as g.busy and so on, never copied.
  const { hero, cat, cam, sparks, flies, groundY, persist, refreshHud, addStars, above, fault, praise, task, hooksFor } = g;
  const { caption, line, muted, hintLine } = speech;
  applyLook = () => heroRig.setLook(save);
  // Fairy wings: two translucent petals behind the shoulders.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.15, 0.5, 0.75, 0.62, 0.72, 0.2); wingShape.bezierCurveTo(0.7, -0.02, 0.3, -0.05, 0.12, -0.02);
  wingShape.bezierCurveTo(0.5, -0.2, 0.5, -0.55, 0.28, -0.5); wingShape.bezierCurveTo(0.1, -0.45, 0.02, -0.2, 0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 8);
  const addWings = (to: THREE.Object3D, color: string, y: number, size: number) => [1, -1].map((side) => {
    const mesh = new THREE.Mesh(wingGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    mesh.scale.set(side * size, size, size); mesh.position.set(0, y, -0.13);
    to.add(mesh);
    return { mesh, side };
  });
  const wings = addWings(hero.root, '#d8f6ff', 1.08, 0.8);

  // ----- quest characters -----
  tint(uniRig.model, { Main: '#ffffff', Main_Light: '#fff4fb', Hair: '#ff9ed2', Hooves: '#ffd76a', Muzzle: '#ffd0e0', Eye_White: '#ffffff' });
  tint(foxRig.model, { Main: '#ff9a4d', Main_Light: '#fff3e2', Grey: '#6a4a3a', Black: '#4a3a3a' });
  tint(deerRig.model, { Main: '#d39a62', Main_Light: '#f8e3c4', Main_Dark: '#9a6a44', Hooves: '#6a4a3a', Eye_White: '#ffffff' });
  tint(kingRig.model, { MushroomKing_Main: '#ff6f91', MushroomKing_Secondary: '#fff3e0', Orc_Main: '#ffe2c4', Eye_White: '#ffffff' });
  const rigs = { unicorn: uniRig, fox: foxRig, mushking: kingRig, deer: deerRig, queen: queenRig };
  const starMat = new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb300', emissiveIntensity: 1.1, roughness: 0.3 });
  const npcs: Npc[] = QUESTS.map((def) => {
    const actor = new Actor(rigs[def.id]);
    const pos = new THREE.Vector3(def.x, groundY(def.x, def.z), def.z);
    actor.root.position.copy(pos); actor.heading = def.heading; actor.root.rotation.y = def.heading;
    scene.add(actor.root);
    actor.play('Idle');
    colliders.push({ x: def.x, z: def.z, r: 0.8 });
    const mark = new THREE.Mesh(starGeo, starMat);
    scene.add(mark);
    return { def, actor, pos, mark, idle: 'Idle', timer: 3 + Math.random() * 5 };
  });
  const npc = (id: QuestDef['id']) => npcs.find((n) => n.def.id === id)!;
  const queenWings = addWings(queenRig.root, '#fff3b8', 1.25, 1.0);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.09, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd84d', emissive: '#ffb300', emissiveIntensity: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
  scene.add(crown);
  // Unicorn horn follows the head bone.
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.5, 12), new THREE.MeshStandardMaterial({ color: '#ffe68a', emissive: '#ffc94d', emissiveIntensity: 0.9, roughness: 0.3 }));
  horn.geometry.translate(0, 0.25, 0);
  scene.add(horn);
  let uniHead: THREE.Object3D | null = null;
  uniRig.model.traverse((o) => { if ((o as THREE.Bone).isBone && o.name === 'Head') uniHead = o; });
  const hornQ = new THREE.Quaternion(), hornDir = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  colliders.push({ x: CHEST.x, z: CHEST.z, r: 0.6 });

  // ----- shrine: the Crystal of Light and its five shards -----
  const shrine = new THREE.Vector3(SHRINE.x, groundY(SHRINE.x, SHRINE.z) + 1.7, SHRINE.z);
  const crystal = new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({ color: '#bff4ff', emissive: '#56d8ff', emissiveIntensity: 0.9, roughness: 0.15, flatShading: true, transparent: true }));
  const crystalLight = new THREE.PointLight('#8fe8ff', 0, 14, 1.6);
  crystal.add(crystalLight); crystalLight.position.y = 0.5;
  crystal.position.copy(shrine);
  scene.add(crystal);
  const shards = QUESTS.map((q) => {
    const m = new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({ color: q.shard, emissive: q.shard, emissiveIntensity: 0.7, roughness: 0.2, flatShading: true }));
    m.scale.setScalar(0.34); m.visible = false;
    scene.add(m);
    return m;
  });
  const shardCount = () => QUESTS.filter((q) => (save.quests[q.id] ?? 0) >= 3).length;

  // ----- chest, stars, guide -----
  const chest = new Actor(chestRig);
  chest.root.position.set(CHEST.x, groundY(CHEST.x, CHEST.z), CHEST.z);
  chest.root.rotation.y = 0.9;
  scene.add(chest.root);
  if (save.chestOpen) chest.pose('Chest_Open');
  const starSpots: [number, number][] = [[-6.5, -1], [10, 9], [18, -4], [-17, -14], [7, -31], [-26, 11], [26, -30], [-2, -40]];
  const stars = starSpots.map(([x, z], id) => {
    const p = { x, z }; resolve(p, 0.6);
    const mesh = new THREE.Mesh(starGeo, starMat);
    mesh.position.set(p.x, groundY(p.x, p.z) + 1.0, p.z);
    mesh.visible = !save.starsTaken.includes(id);
    scene.add(mesh);
    return { id, mesh };
  });

  // Ambient butterflies over flower drifts.
  const palette = ['#ff8fc4', '#ffd54f', '#8fd3ff', '#c9a6ff', '#ffffff', '#ff9a6b'];
  for (let i = 0; i < 22; i++) {
    const a = i * 2.4, r = 6 + (i * 37 % 40);
    flies.add(Math.cos(a) * r, Math.sin(a) * r - 6, 2 + (i % 3), palette[i % palette.length]);
  }

  // ---------- game state ----------
  let glow = save.final ? 1 : 0;
  const bf = { active: false, n: 0, first: 0, counted: 0, wrong: 0, own: -1, demo: false, sprites: [] as THREE.Sprite[], colors: ['#ff4fa3', '#7a5cff', '#2aa8ff', '#ff5a4f'], done: (_: TaskResult) => {} };
  const search = { active: false, found: 0, idle: 0, items: [] as { mesh: THREE.Mesh; found: boolean }[] };
  // A scene during the search (another character's task, closed or solved) gives the bubble back to the search.
  const stage = createStage(g, () => {
    if (!search.active) caption(null);
    else if (speech.shown?.key !== 't_stars') searchCaption();
  });

  // ----- task in the world: count the butterflies over the flower bed -----
  function countButterflies(level: number): Promise<TaskResult> {
    return new Promise((done) => {
      Object.assign(bf, { active: true, counted: 0, wrong: 0, own: -1, demo: false, done, first: flies.flies.length, n: level === 1 ? randInt(3, 5) : level === 2 ? randInt(5, 7) : randInt(7, 9) });
      for (let i = 0; i < bf.n; i++) {
        const a = (i / bf.n) * 6.28 + Math.random() * 0.5, r = 0.5 + Math.random() * 1.6;
        const id = flies.add(PATCH.x + Math.cos(a) * r, PATCH.z + Math.sin(a) * r, 0.45, bf.colors[i % 4], 1.5);
        flies.flies[id].home.y = groundY(PATCH.x, PATCH.z) + 1.0 + (i % 3) * 0.45;
      }
      cam.focus = new THREE.Vector3(PATCH.x, groundY(PATCH.x, PATCH.z) + 1.2, PATCH.z);
      void line('t_count', 'task', 0, '🦄');
      showAnswers(10, (n, btn) => {
        if (!bf.active || bf.demo) return;
        if (n === bf.n) {
          btn.classList.add('yes'); bf.active = false;
          setTimeout(() => {
            hideAnswers();
            for (let i = bf.first; i < bf.first + bf.n; i++) { const f = flies.flies[i]; f.landed = false; f.scale = 1.2; f.r = 2.2; flies.setColor(i, bf.colors[(i - bf.first) % 4]); }
            bf.sprites.forEach((s) => scene.remove(s)); bf.sprites.length = 0;
            bf.done({ solved: true, wrong: bf.wrong });
          }, 700);
        } else {
          btn.classList.add('no'); sfx('soft');
          const round = ++bf.wrong;            // a newer mistake cuts "try again" off and starts its own round
          void say(`try_${randInt(0, 2)}`, 'Спробуй ще раз', 'task').then(() => { if (bf.active && bf.wrong === round) void demoCount(); });
        }
      }, closeButterflies);
    });
  }
  /**
   * The close button: the task ends unsolved and leaves nothing behind - no butterflies, numbers, panel or voice
   * (the voice is stopped by the end of the task, see `task`).
   * Nothing is recorded; the unicorn starts the task anew. Does nothing once the right answer is given.
   */
  function closeButterflies() {
    if (!bf.active) return;
    bf.active = false; bf.demo = false;
    hideAnswers();
    bf.sprites.forEach((s) => scene.remove(s)); bf.sprites.length = 0;
    flies.truncate(bf.n);                      // the task butterflies are the last ones while the task is open
    bf.done({ solved: false, wrong: bf.wrong });
  }
  function countFly(i: number) {
    const f = flies.flies[i];
    if (f.landed) return;
    f.landed = true; f.scale = 1.9;
    flies.setColor(i, '#ff9f1a');
    const s = numberSprite(++bf.counted);
    s.position.copy(f.pos).y += 0.7;
    scene.add(s); bf.sprites.push(s);
    sparks.burst(f.pos, '#fff2a8', 10, 2);
    sfx('pop');
    void say(`tap_${bf.counted}`, String(bf.counted), 'task');
  }
  /**
   * Hint after a miss: the cat says "let's count together" to the end, then counts every butterfly aloud, one by one.
   * Answers are open while the hint is spoken; a line that was cut off settles at once too, so the count starts
   * only if the task is still open, the mistake is still the latest one and no count is running.
   */
  async function demoCount() {
    const round = bf.wrong;
    await hintLine('h_count');
    if (!bf.active || bf.demo || bf.wrong !== round || bf.own === round) return;
    bf.demo = true;
    for (let i = bf.first; i < bf.first + bf.n; i++) { const f = flies.flies[i]; f.landed = false; f.scale = 1.5; flies.setColor(i, bf.colors[(i - bf.first) % 4]); }
    bf.sprites.forEach((s) => scene.remove(s)); bf.sprites.length = 0; bf.counted = 0;
    for (let i = bf.first; i < bf.first + bf.n && bf.active; i++) { countFly(i); await new Promise((r) => setTimeout(r, 850)); }
    bf.demo = false;
    if (bf.active) caption({ key: 't_count', pri: 'task', hold: 0, speaker: '🦄' });
  }

  // ----- task in the world: find the stars hidden around the deer -----
  function startSearch(n: Npc) {
    search.items.forEach((it) => scene.remove(it.mesh));
    search.items = Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * 6.28 + Math.random() * 0.9, r = 5 + Math.random() * 7;
      const p = { x: n.pos.x + Math.cos(a) * r, z: n.pos.z + Math.sin(a) * r };
      resolve(p, 0.7);
      const mesh = new THREE.Mesh(starGeo, starMat);
      mesh.scale.setScalar(0.75); mesh.position.set(p.x, groundY(p.x, p.z) + 0.55, p.z);
      scene.add(mesh);
      return { mesh, found: false };
    });
    Object.assign(search, { active: true, found: 0, idle: 0 });
    void line('t_stars', 'task', muted() ? 0 : 6000, n.def.emoji);
  }
  /** The bubble of the search: the count of the stars found, after its question when the voice is off (VOICE-09). */
  const searchCaption = () => caption({ key: 't_stars', pri: 'task', hold: 0, speaker: '🦌', text: `${muted() ? t('t_stars') + ' ' : ''}⭐ ${search.found} / 5` });
  /**
   * `last` is the fifth number: the praise comes once it is said to the end. A conversation started at that moment
   * cuts the number off (it is of the story's rank) and is not cut off in turn: the praise is left out then, and the
   * planner turns "back to the deer" away (VOICE-03).
   */
  function finishSearch(last: Promise<void>) {
    search.active = false;
    save.quests.deer = Math.max(save.quests.deer ?? 0, 1);
    addStars(3, above(hero.root.position, 1.2));
    void last.then(() => (speaking() ? undefined : praise())).then(() => line('t_stars_back', 'hint', 6000));
  }

  // ----- conversations -----
  async function talk(n: Npc) {
    const q = n.def;
    let onward = () => {};      // what the cat says once the scene is over, see giveShard
    await playScene(stage, `talk ${q.id}`, async () => {
      cam.focus = above(n.pos, 1.1);
      hero.play('Talk');
      fault();
      const done = save.quests[q.id] ?? 0;
      if (search.active && q.id === 'deer') { await line('t_stars', 'task', 0, q.emoji); return; }
      if (done >= 3) {           // the quest is finished: replay one of its games for stars
        await line('npc_again', 'story', 0, q.emoji);
        const type = pick(q.steps.filter((s): s is TaskType => s !== 'butterflies' && s !== 'stars'));
        const res = await task(() => runTask(type, levelFor(save, SKILL[type]), hooksFor(q.emoji)));
        if (res.solved) { recordTask(save, SKILL[type], res.wrong); addStars(1, above(hero.root.position, 1.4)); await praise(); }
        return;
      }
      if (done === 0) await line(`${q.id}_hi`, 'story', 0, q.emoji);
      for (let k = done; k < 3; k++) {
        const step = q.steps[k];
        if (step === 'stars') { startSearch(n); return; }
        const skill = step === 'butterflies' ? 'count' : SKILL[step];
        const res = await task(() => step === 'butterflies' ? countButterflies(levelFor(save, 'count')) : runTask(step, levelFor(save, skill), hooksFor(q.emoji)));
        cam.focus = above(n.pos, 1.1);
        if (!res.solved) return;                    // closed by the child: come back any time
        save.quests[q.id] = k + 1;
        recordTask(save, skill, res.wrong);
        addStars(3, above(hero.root.position, 1.4));     // the same reward with or without mistakes: trying is what counts
        if (n.actor.has('Yes')) n.actor.once('Yes', 'Idle');
        await praise();
        if (k < 2) await line('npc_next', 'story', 0, q.emoji);
      }
      onward = await giveShard(n);
    });
    onward();
  }

  /**
   * Returns what is left for after the scene: its end clears the bubble, so the cat's "go on" comes after it, and after
   * the character's thanks - a hint does not cut the story off.
   */
  async function giveShard(n: Npc): Promise<() => void> {
    const count = shardCount();
    sfx('fanfare');
    hero.play('Dance'); cat.play('Dance');
    sparks.burst(above(n.pos, 2), n.def.shard, 60, 6); sparks.burst(above(n.pos, 2), '#fff2a8', 40, 5);
    refreshHud(); persist();
    const thanks = line('npc_done', 'story', 0, n.def.emoji);
    await fanfare('shard_title', tf('shard_text', { n: count }), n.def.shard);
    cat.play('Idle');
    if (count === 5) { await line('all_shards', 'story'); return () => {}; }
    return () => { void thanks.then(() => line('go_next', 'hint', 5000)); };
  }

  async function restoreCrystal() {
    let onward = () => {};      // what the cat says once the scene is over
    await playScene(stage, 'finale', async () => {
      cam.focus = shrine.clone();
      hero.play('Talk');
      g.finale = 0.001;
      fault();
      sfx('chime');
      await new Promise((r) => setTimeout(r, 3600));
      save.final = true; g.finale = 0; persist();
      sfx('fanfare');
      for (const c of ['#8fe8ff', '#fff2a8', '#ff9ed2', '#c79bff']) sparks.burst(shrine, c, 50, 7);
      hero.play('Dance'); cat.play('Dance');
      for (const n of npcs) if (n.actor.has('Dance')) n.actor.play('Dance');
      const words = line('final_text', 'story');
      await fanfare('final_title', t('final_text'));
      cat.play('Idle'); hero.play('Idle'); npcs.forEach((n) => n.actor.play('Idle'));
      // After the scene (its end clears the bubble) and after the final words: a hint does not cut the story off.
      onward = () => { void words.then(() => line('free', 'hint', 6000)); };
    });
    onward();
  }

  function openChest() {
    save.chestOpen = true;
    chest.once('Chest_Open', 'Chest_Open');
    sfx('good');
    addStars(5, above(chest.root.position, 1));
    void line('chest', 'hint', 4000);
  }

  const spots: Spot[] = [
    ...npcs.map((n): Spot => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void talk(n); } })),
    { pos: shrine, r: 2.6, label: 'place', on: () => shardCount() === 5 && !save.final, run: () => { void restoreCrystal(); } },
    { pos: chest.root.position, r: 2.2, label: 'open', on: () => !save.chestOpen, run: openChest },
  ];

  /** Where the cat's sparkles lead: the next unfinished friend, then the shrine. */
  function goal(): THREE.Vector3 | null {
    if (search.active) {
      if (search.idle < 20) return null;
      let best: THREE.Vector3 | null = null, bd = 1e9;
      for (const it of search.items) { const d = it.mesh.position.distanceTo(hero.root.position); if (!it.found && d < bd) { bd = d; best = it.mesh.position; } }
      return best;
    }
    const next = npcs.find((n) => (save.quests[n.def.id] ?? 0) < 3);
    if (next) return next.pos;
    return save.final ? null : shrine;
  }

  // ---------- start screen & menus ----------
  initStartScreen(g, { applyVolume, applyPin: () => quality.applyPin() });

  // ---------- the world's parts of the frame (src/game/loop.ts calls them in its order) ----------
  const world: WorldFrame = {
    spots,
    // While the butterflies are counted every tap is theirs, even one that hits none: the heroine stays at the bed.
    tap: (screenDist) => {
      if (!(bf.active && !bf.demo)) return false;
      let best = -1, bd = touch ? 70 : 46;
      for (let i = bf.first; i < bf.first + bf.n; i++) { const d = screenDist(flies.flies[i].pos); if (d < bd && !flies.flies[i].landed) { bd = d; best = i; } }
      if (best >= 0) { bf.own = bf.wrong; countFly(best); }   // her own count: the cat will not count over it (see demoCount)
      return true;
    },
    afterMove: (time, grounded) => {
      wings.forEach((w) => { w.mesh.rotation.y = w.side * (0.55 + Math.sin(time * (grounded ? 5 : 22)) * 0.35); });
      queenWings.forEach((w) => { w.mesh.rotation.y = w.side * (0.55 + Math.sin(time * 4 + 1) * 0.3); });
    },
    // quest characters: turn to the heroine when she is close, otherwise live their own life
    npcs: (dt, time) => {
      const hp = hero.root.position;
      for (const n of npcs) {
        const d = Math.hypot(n.pos.x - hp.x, n.pos.z - hp.z);
        n.actor.face(d < 7 ? Math.atan2(hp.x - n.pos.x, hp.z - n.pos.z) : n.def.heading, dt, 3);
        if (!g.busy && (n.timer -= dt) < 0) {
          n.timer = 4 + Math.random() * 6;
          n.idle = d > 7 && n.actor.has('Eating') && Math.random() < 0.6 ? 'Eating' : n.actor.has('Idle_2') && Math.random() < 0.4 ? 'Idle_2' : 'Idle';
          n.actor.play(n.idle, 0.4);
        }
        const open = (save.quests[n.def.id] ?? 0) < 3;
        n.mark.visible = open && !g.busy && !(search.active && n.def.id === 'deer');
        n.mark.rotation.y = time * 2; n.mark.position.set(n.pos.x, n.pos.y + (n.def.id === 'unicorn' ? 3 : n.def.id === 'fox' ? 1.7 : 2.6) + Math.sin(time * 2.5) * 0.15, n.pos.z);
        n.actor.update(dt);
      }
      if (uniHead) {
        // The head bone points along the muzzle; the horn sits on the forehead and leans back a little.
        const hb = uniHead as THREE.Object3D;
        hb.getWorldPosition(horn.position); hb.getWorldQuaternion(hornQ);
        hornDir.set(0, 1, 0).applyQuaternion(hornQ);
        horn.position.addScaledVector(hornDir, 0.16).y += 0.2;
        hornDir.multiplyScalar(-0.3).y += 0.9;
        horn.quaternion.setFromUnitVectors(yAxis, hornDir.normalize());
      }
      queenRig.headBone.getWorldPosition(crown.position); crown.position.y += 0.27;
      crown.rotation.y = npc('queen').actor.heading;
    },
    // collectibles
    collect: (dt, time, canMove) => {
      const hp = hero.root.position;
      for (const s of stars) {
        if (!s.mesh.visible) continue;
        s.mesh.rotation.y = time * 1.6; s.mesh.position.y = groundY(s.mesh.position.x, s.mesh.position.z) + 1 + Math.sin(time * 2 + s.id) * 0.15;
        if (canMove && Math.hypot(s.mesh.position.x - hp.x, s.mesh.position.z - hp.z) < 1.2) { s.mesh.visible = false; save.starsTaken.push(s.id); addStars(1, s.mesh.position); }
      }
      if (search.active) {
        search.idle += dt;
        for (const it of search.items) {
          if (it.found) continue;
          it.mesh.rotation.y = time * 2.2;
          if (Math.hypot(it.mesh.position.x - hp.x, it.mesh.position.z - hp.z) < 1.3) {
            it.found = true; it.mesh.visible = false; search.idle = 0;
            sparks.burst(it.mesh.position, '#ffe066', 26); sfx('chime');
            const n = ++search.found;
            if (n < 5) void say(`tap_${n}`, String(n), 'task');
            searchCaption();
            // The last number is heard to the end before the praise (see finishSearch). It cuts off whatever sounds, as
            // every number does, but has the story's rank: a conversation started at this moment is not turned away.
            if (n === 5) { stopVoice(); finishSearch(say(`tap_${n}`, String(n), 'story')); }
          }
        }
      }
    },
    // shrine: collected shards circle the place where the crystal will stand
    shrine: (dt, time) => {
      if (g.finale > 0) g.finale += dt;
      const pull = g.finale > 0 ? Math.max(0, 1 - g.finale / 3.4) : 1;
      QUESTS.forEach((q, i) => {
        const m = shards[i];
        m.visible = (save.quests[q.id] ?? 0) >= 3 && !save.final;
        if (!m.visible) return;
        const a = time * (g.finale > 0 ? 1 + g.finale * 2.5 : 0.7) + (i / 5) * 6.28;
        m.position.set(shrine.x + Math.cos(a) * 0.95 * pull, shrine.y + Math.sin(time * 1.5 + i) * 0.12, shrine.z + Math.sin(a) * 0.95 * pull);
        m.rotation.y = time * 1.5 + i;
      });
      const mat = crystal.material as THREE.MeshStandardMaterial;
      mat.opacity = lerp(mat.opacity, save.final ? 1 : 0.18, damp(2, dt));
      crystal.scale.setScalar(lerp(crystal.scale.x, save.final ? 1.25 : 0.8, damp(3, dt)));
      crystal.position.y = shrine.y + Math.sin(time * 1.8) * 0.12; crystal.rotation.y = time * 0.9;
      crystalLight.intensity = save.final ? 5 + Math.sin(time * 3) * 1.2 : g.finale > 0 ? g.finale * 2 : 0;
      glow = lerp(glow, save.final ? 1 : 0, damp(0.6, dt));
      rainbowAlpha.value = glow;
      (sky.sky.material as THREE.ShaderMaterial).uniforms.uGlow.value = glow;
      sky.hemi.intensity = 1.25 + glow * 0.25;
    },
    goal,
    animate: (dt, time) => {
      chest.update(dt);
      flies.update(time);
      for (let i = 0; i < bf.sprites.length; i++) bf.sprites[i].position.y += Math.sin(time * 3 + i) * 0.002;
      updateClouds(dt);
    },
    // A task in the world (the butterflies) is framed from further away than a conversation.
    focusDist: () => bf.active ? 7.5 : 6.5,
    beforeRender: (hp) => {
      sky.sun.position.copy(hp).add(sky.sunOffset);
      sky.sun.target.position.copy(hp);
      updateRanged(hp.x, hp.z);
      motes.uCenter.value.copy(hp);
      motes.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
  };

  // ---------- loop ----------
  startLoop(g, quality, world);

  if (debug) exposeDebug(g, {
    npcs, search, bf,
    talk: (id) => { void talk(npc(id as QuestDef['id'])); },
    cheatWorld: () => {
      if (bf.active && !bf.demo) { (el.answers.children[bf.n - 1] as HTMLElement).dispatchEvent(new PointerEvent('pointerdown')); return 'butterflies'; }
      if (search.active) { const it = search.items.find((s) => !s.found); if (it) hero.root.position.copy(it.mesh.position); return 'star'; }
      return '';
    },
  });
}
