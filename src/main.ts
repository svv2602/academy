import * as THREE from 'three';
import './style.css';
import { setProgressHandler } from './core/assets';
import { say, setVolumes, sfx, speaking, stopVoice, volume } from './core/audio';
import { levelFor, loadSave, recordTask } from './core/save';
import { createQuality, createRenderer } from './core/renderer';
import { pick, randInt } from './core/util';
import { createGame, createStage } from './game/context';
import { exposeDebug } from './game/debug';
import { numberSprite } from './game/fx';
import type { QuestDef } from './game/quests';
import { startLoop, type WorldFrame } from './game/loop';
import type { Spot } from './game/player';
import { createSpeech } from './game/speech';
import { playScene } from './game/stage';
import { initStartScreen } from './game/start';
import { runTask, SKILL, type TaskResult, type TaskType } from './game/tasks';
import { buildSky, updateRanged } from './world/scenery';
import { PATCH, resolve } from './world/terrain';
import { el, fanfare, hideAnswers, initStart, showAnswers, showNotice } from './ui/ui';
import { t, tf } from './ui/strings';
import { initTuningPanel } from './ui/tuning';
import { createCharacters, type Npc } from './worlds/fairy/characters';
import { createChestStars } from './worlds/fairy/chest-stars';
import { loadFairy } from './worlds/fairy/load';
import { buildShrine, createFinale, shardCount } from './worlds/fairy/shrine';

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

async function boot() {
  const L = await loadFairy(scene, save, touch);
  if (!L) return;
  const { heroRig, motes, updateClouds, starGeo } = L;
  const speech = createSpeech();
  const g = createGame({ scene, camera, renderer, save, touch, debug, speech, heroRig, catRig: L.catRig, crystals: () => `${shardCount(save)}/5` });
  // Objects and functions only: the flags (busy, paused, auto, ...) are read as g.busy and so on, never copied.
  const { hero, cat, cam, sparks, flies, groundY, persist, refreshHud, addStars, above, fault, praise, task, hooksFor } = g;
  const { caption, line, muted, hintLine } = speech;
  applyLook = () => heroRig.setLook(save);
  // The heroine's wings and the quest characters, then the shrine, then the chest and the stars on the ground: the
  // order they always joined the scene (and the colliders) in.
  const characters = createCharacters(g, L, () => search.active);
  const { npcs, npc, starMat } = characters;
  const shrine = buildShrine(g, L, sky);
  const chestStars = createChestStars(g, L, starMat);

  // Ambient butterflies over flower drifts.
  const palette = ['#ff8fc4', '#ffd54f', '#8fd3ff', '#c9a6ff', '#ffffff', '#ff9a6b'];
  for (let i = 0; i < 22; i++) {
    const a = i * 2.4, r = 6 + (i * 37 % 40);
    flies.add(Math.cos(a) * r, Math.sin(a) * r - 6, 2 + (i % 3), palette[i % palette.length]);
  }

  // ---------- game state ----------
  const bf = { active: false, n: 0, first: 0, counted: 0, wrong: 0, own: -1, demo: false, sprites: [] as THREE.Sprite[], colors: ['#ff4fa3', '#7a5cff', '#2aa8ff', '#ff5a4f'], done: (_: TaskResult) => {} };
  const search = { active: false, found: 0, idle: 0, items: [] as { mesh: THREE.Mesh; found: boolean }[] };
  // A scene during the search (another character's task, closed or solved) gives the bubble back to the search.
  const stage = createStage(g, () => {
    if (!search.active) caption(null);
    else if (speech.shown?.key !== 't_stars') searchCaption();
  });
  const restoreCrystal = createFinale(g, stage, shrine, npcs);

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
    const count = shardCount(save);
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

  const spots: Spot[] = [
    ...npcs.map((n): Spot => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void talk(n); } })),
    { pos: shrine.pos, r: 2.6, label: 'place', on: () => shardCount(save) === 5 && !save.final, run: () => { void restoreCrystal(); } },
    { pos: chestStars.chest.root.position, r: 2.2, label: 'open', on: () => !save.chestOpen, run: () => chestStars.open() },
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
    return save.final ? null : shrine.pos;
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
    afterMove: (time, grounded) => characters.wings(time, grounded),
    npcs: (dt, time) => characters.update(dt, time),
    // collectibles
    collect: (dt, time, canMove) => {
      chestStars.update(time, canMove);
      const hp = hero.root.position;
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
    shrine: (dt, time) => shrine.update(dt, time),
    goal,
    animate: (dt, time) => {
      chestStars.animate(dt);
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
