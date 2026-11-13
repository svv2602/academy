import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import './style.css';
import { rig, setProgressHandler, staticGeo, tint } from './core/assets';
import { say, setVolumes, sfx, stopVoice, unlockAudio, voiceLog, volume } from './core/audio';
import { initInput, input, pollInput } from './core/input';
import { clearSave, levelFor, loadSave, recordTask, storeSave } from './core/save';
import { angleDiff, clamp, damp, lerp, pick, randInt } from './core/util';
import { Actor } from './game/actor';
import { glowTex, numberSprite, Sparks } from './game/fx';
import { buildHero } from './game/hero';
import { QUESTS, SHRINE, type QuestDef } from './game/quests';
import { cheatTask, runTask, SKILL, type TaskHooks, type TaskResult, type TaskType } from './game/tasks';
import { Butterflies } from './world/butterflies';
import { buildClouds, buildGrass, buildMotes, buildRainbow, buildScenery, buildSky, buildWater, setDrawRange, updateRanged, uTime } from './world/scenery';
import { CHEST, PATCH, SPAWN, buildTerrain, colliders, height, raycastGround, resolve } from './world/terrain';
import { bubble, el, fanfare, hideAnswers, initBook, initStart, setAct, setCounter, showAnswers } from './ui/ui';
import { t, tf, voiceText, type Key, type SpokenKey } from './ui/strings';

const params = new URLSearchParams(location.search);
const save = loadSave();
const applyVolume = () => { Object.assign(volume, save.vol); setVolumes(); };
applyVolume();

// ---------- renderer & quality tiers ----------
const renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 600);
const touch = matchMedia('(pointer: coarse)').matches;
let tier = params.has('q') ? Number(params.get('q')) : 2;   // 2: bloom+shadows, 1: shadows, 0: plain
let composer: EffectComposer | null = null;
const world = buildSky(scene);

function applyTier() {
  const dpr = Math.min(devicePixelRatio, tier === 2 ? 2 : tier === 1 ? 1.5 : 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 70 : 55;
  camera.updateProjectionMatrix();
  setDrawRange(tier === 2 ? 1 : tier === 1 ? 0.8 : 0.62);
  renderer.shadowMap.enabled = tier > 0;
  world.sun.castShadow = tier > 0;
  world.sun.shadow.mapSize.setScalar(tier === 2 ? 2048 : 1024);
  world.sun.shadow.map?.dispose(); world.sun.shadow.map = null;
  composer?.dispose(); composer = null;
  if (tier === 2) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: touch ? 2 : 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.7, 0.9));
    composer.addPass(new OutputPass());
  }
  scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m)) m.needsUpdate = true; });
}
addEventListener('resize', applyTier);

// ---------- boot ----------
setProgressHandler((f) => { el.bar.style.width = `${Math.round(f * 100)}%`; });
initStart(save, save.played, () => applyLook());
let applyLook = () => {};
applyTier();
void boot();

interface Npc { def: QuestDef; actor: Actor; pos: THREE.Vector3; mark: THREE.Mesh; idle: string; timer: number; }

async function boot() {
  const density = touch ? 0.75 : 1;
  scene.add(buildTerrain(touch ? 150 : 200));
  buildWater(scene);
  const rainbowAlpha = buildRainbow(scene);
  const motes = buildMotes(scene, 260);
  buildGrass(scene, touch ? 9000 : 16000);
  const [, updateClouds, heroRig, catRig, chestRig, crystalGeo, starGeo, uniRig, foxRig, kingRig, deerRig, queenRig] = await Promise.all([
    buildScenery(scene, density), buildClouds(scene),
    buildHero(save), rig('extra/cat2', 0.62, true), rig('platformer_game_pack/Chest', 0.9),
    staticGeo('rpg_items_pack/Crystal2', 1), staticGeo('platformer_game_pack/Star', 0.7),
    rig('animals_pack/Horse_White', 2.0, true), rig('animals_pack/Fox', 0.8, true), rig('extra/mushking', 1.25, true),
    rig('animals_pack/Deer', 1.55, true), buildHero({ dress: '#ffd54f', hair: '#f5d16b', hairStyle: 'buns' }, 1.72, 1.1),
  ]);
  const sparks = new Sparks(scene);
  const flies = new Butterflies(scene, 96);
  const groundY = (x: number, z: number) => height(x, z);

  // ----- hero -----
  const hero = new Actor(heroRig);
  hero.root.position.set(save.pos?.[0] ?? SPAWN.x, 0, save.pos?.[1] ?? SPAWN.z);
  hero.heading = Math.PI; hero.root.rotation.y = Math.PI;
  scene.add(hero.root);
  hero.play('Idle');
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

  // ----- cat companion -----
  const cat = new Actor(catRig);
  cat.root.position.set(hero.root.position.x + 1, 0, hero.root.position.z + 0.6);
  scene.add(cat.root);
  cat.play('Idle');
  tint(cat.model, { Cat_Main: '#f7a94b', Cat_Secondary: '#d27a2c', Ears: '#f9a8bd', Eye_White: '#ffffff' });

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
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.7, 14, 20, 1, true),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, uniforms: { uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.0) * (0.2 + 0.07 * sin(uTime * 3.0 + vUv.y * 20.0)); gl_FragColor = vec4(vec3(1.0, 0.9, 0.55) * a, 1.0); }',
    }));
  scene.add(beacon);
  const trailN = 12, trailPos = new Float32Array(trailN * 3);
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ map: glowTex, size: 0.55, color: '#ffe89a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  trail.frustumCulled = false; scene.add(trail);
  const tapRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
  tapRing.rotation.x = -Math.PI / 2; scene.add(tapRing);

  // Ambient butterflies over flower drifts.
  const palette = ['#ff8fc4', '#ffd54f', '#8fd3ff', '#c9a6ff', '#ffffff', '#ff9a6b'];
  for (let i = 0; i < 22; i++) {
    const a = i * 2.4, r = 6 + (i * 37 % 40);
    flies.add(Math.cos(a) * r, Math.sin(a) * r - 6, 2 + (i % 3), palette[i % palette.length]);
  }

  // ---------- game state ----------
  let busy = false;                 // a conversation, task or cut-scene is running: the heroine stands still
  let paused = false;               // a menu is open
  let vy = 0, grounded = true;
  let auto: { x: number; z: number; then?: () => void; stuck: number; last: number } | null = null;
  const cam = { yaw: 0, pitch: 0.36, dist: 6.2, target: new THREE.Vector3(), focus: null as THREE.Vector3 | null };
  cam.target.copy(hero.root.position);
  let camOverride: number | null = null;
  let userPitch = 0.36;             // set by dragging up/down
  let glow = save.final ? 1 : 0;
  let finale = 0;                   // >0 while the shards merge into the crystal
  const bf = { active: false, n: 0, first: 0, counted: 0, wrong: 0, own: -1, demo: false, sprites: [] as THREE.Sprite[], colors: ['#ff4fa3', '#7a5cff', '#2aa8ff', '#ff5a4f'], done: (_: TaskResult) => {} };
  const search = { active: false, found: 0, idle: 0, items: [] as { mesh: THREE.Mesh; found: boolean }[] };

  const persist = () => { save.pos = [hero.root.position.x, hero.root.position.z]; storeSave(save); };
  const line = (key: SpokenKey, hold = 0, speaker = '🐱') => { bubble(key, hold, speaker); return say(key, voiceText(key)); };
  const refreshHud = () => { setCounter('stars', String(save.stars)); setCounter('crystals', `${shardCount()}/5`); };
  const addStars = (n: number, at: THREE.Vector3) => { save.stars += n; sparks.burst(at, '#ffe066', 24); sfx('chime'); refreshHud(); persist(); };
  const above = (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy);
  async function praise() {
    sfx('good'); cat.once('Yes', 'Idle');
    sparks.burst(above(hero.root.position, 1.2), '#ff9ed2', 30, 4);
    bubble(null);
    await say(`praise_${pick([0, 1, 3, 4, 5, 6, 7])}`, 'Молодець!');
  }

  // ----- panel tasks -----
  const hooksFor = (speaker: string): TaskHooks => ({
    prompt: (key) => { void line(key, 0, speaker); },
    number: (n) => { void say(`tap_${n}`, String(n)); },
    wrong: () => { sfx('soft'); return say(`try_${randInt(0, 2)}`, 'Спробуй ще раз'); },
    hint: (key) => line(key, 0, '🐱'),
    good: () => sfx('pop'),
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
      void line('t_count', 0, '🦄');
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
          void say(`try_${randInt(0, 2)}`, 'Спробуй ще раз').then(() => { if (bf.active && bf.wrong === round) void demoCount(); });
        }
      });
    });
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
    void say(`tap_${bf.counted}`, String(bf.counted));
  }
  /**
   * Hint after a miss: the cat says "let's count together" to the end, then counts every butterfly aloud, one by one.
   * Answers are open while the hint is spoken; a line that was cut off settles at once too, so the count starts
   * only if the task is still open, the mistake is still the latest one and no count is running.
   */
  async function demoCount() {
    const round = bf.wrong;
    await line('h_count');
    if (!bf.active || bf.demo || bf.wrong !== round || bf.own === round) return;
    bf.demo = true;
    for (let i = bf.first; i < bf.first + bf.n; i++) { const f = flies.flies[i]; f.landed = false; f.scale = 1.5; flies.setColor(i, bf.colors[(i - bf.first) % 4]); }
    bf.sprites.forEach((s) => scene.remove(s)); bf.sprites.length = 0; bf.counted = 0;
    for (let i = bf.first; i < bf.first + bf.n && bf.active; i++) { countFly(i); await new Promise((r) => setTimeout(r, 850)); }
    bf.demo = false;
    if (bf.active) bubble('t_count', 0, '🦄');
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
    void line('t_stars', 6000, n.def.emoji);
  }
  function finishSearch() {
    search.active = false;
    save.quests.deer = Math.max(save.quests.deer ?? 0, 1);
    recordTask(save, 'count', 0);
    addStars(3, above(hero.root.position, 1.2));
    void praise().then(() => line('t_stars_back', 6000));
  }

  // ----- conversations -----
  async function talk(n: Npc) {
    if (busy) return;
    const q = n.def;
    busy = true; auto = null; setAct(null);
    cam.focus = above(n.pos, 1.1);
    hero.play('Talk');
    try {
      const done = save.quests[q.id] ?? 0;
      if (search.active && q.id === 'deer') { await line('t_stars', 0, q.emoji); return; }
      if (done >= 3) {           // the quest is finished: replay one of its games for stars
        await line('npc_again', 0, q.emoji);
        const type = pick(q.steps.filter((s): s is TaskType => s !== 'butterflies' && s !== 'stars'));
        const res = await runTask(type, levelFor(save, SKILL[type]), hooksFor(q.emoji));
        if (res.solved) { recordTask(save, SKILL[type], res.wrong); addStars(1, above(hero.root.position, 1.4)); await praise(); }
        return;
      }
      if (done === 0) await line(`${q.id}_hi`, 0, q.emoji);
      for (let k = done; k < 3; k++) {
        const step = q.steps[k];
        if (step === 'stars') { startSearch(n); return; }
        const skill = step === 'butterflies' ? 'count' : SKILL[step];
        const res = step === 'butterflies' ? await countButterflies(levelFor(save, 'count')) : await runTask(step, levelFor(save, skill), hooksFor(q.emoji));
        cam.focus = above(n.pos, 1.1);
        if (!res.solved) return;                    // closed by the child: come back any time
        save.quests[q.id] = k + 1;
        recordTask(save, skill, res.wrong);
        addStars(res.wrong ? 2 : 3, above(hero.root.position, 1.4));
        if (n.actor.has('Yes')) n.actor.once('Yes', 'Idle');
        await praise();
        if (k < 2) await line('npc_next', 0, q.emoji);
      }
      await giveShard(n);
    } finally {
      busy = false; cam.focus = null; hero.play('Idle');
      if (!search.active) bubble(null);
    }
  }

  async function giveShard(n: Npc) {
    const count = shardCount();
    sfx('fanfare');
    hero.play('Dance'); cat.play('Dance');
    sparks.burst(above(n.pos, 2), n.def.shard, 60, 6); sparks.burst(above(n.pos, 2), '#fff2a8', 40, 5);
    refreshHud(); persist();
    void line('npc_done', 0, n.def.emoji);
    await fanfare('shard_title', tf('shard_text', { n: count }), n.def.shard);
    cat.play('Idle');
    if (count === 5) await line('all_shards', 0); else void line('go_next', 5000);
  }

  async function restoreCrystal() {
    busy = true; auto = null; setAct(null);
    cam.focus = shrine.clone();
    hero.play('Talk');
    finale = 0.001;
    sfx('chime');
    await new Promise((r) => setTimeout(r, 3600));
    save.final = true; finale = 0; persist();
    sfx('fanfare');
    for (const c of ['#8fe8ff', '#fff2a8', '#ff9ed2', '#c79bff']) sparks.burst(shrine, c, 50, 7);
    hero.play('Dance'); cat.play('Dance');
    for (const n of npcs) if (n.actor.has('Dance')) n.actor.play('Dance');
    void line('final_text');
    await fanfare('final_title', t('final_text'));
    cat.play('Idle'); hero.play('Idle'); npcs.forEach((n) => n.actor.play('Idle'));
    busy = false; cam.focus = null;
    void line('free', 6000);
  }

  function openChest() {
    save.chestOpen = true;
    chest.once('Chest_Open', 'Chest_Open');
    sfx('good');
    addStars(5, above(chest.root.position, 1));
    void line('chest', 4000);
  }

  interface Spot { pos: THREE.Vector3; r: number; label: Key; on: () => boolean; run: () => void; }
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
  el.loading.classList.add('hidden'); el.setup.classList.remove('hidden');
  el.restart.addEventListener('click', () => { clearSave(); location.reload(); });
  el.play.addEventListener('click', async () => {
    unlockAudio(); applyVolume();
    el.start.classList.add('hidden');
    el.hud.classList.remove('hidden'); el.btnJump.classList.remove('hidden');
    refreshHud();
    const first = !save.played;
    save.played = true; persist();
    cam.yaw = 0; cam.target.copy(hero.root.position);
    hero.once('Wave', 'Idle');
    if (first) { await line('intro'); void line('go_next', 6000); }
    else await line('welcome_back', 5000);
  }, { once: true });
  initBook(save, {
    change: () => { applyVolume(); persist(); },
    reset: () => { clearSave(); location.reload(); },
    open: (v) => { paused = v; },
  });
  initInput(el.canvas, el.joy, el.knob, el.btnJump, el.btnAct);
  setInterval(persist, 10000);
  addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); stopVoice(); } });

  // ---------- loop ----------
  const clock = new THREE.Clock();
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), ray = new THREE.Raycaster();
  let fpsT = 0, fpsN = 0, slow = 0, warm = 0;
  const started = () => el.start.classList.contains('hidden');

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = (uTime.value += dt);
    pollInput();
    const hp = hero.root.position;
    const canMove = started() && !busy && !paused;

    cam.yaw -= input.lookDX * 0.006; input.lookDX = 0;
    userPitch = clamp(userPitch + input.lookDY * 0.004, 0.06, 1.15); input.lookDY = 0;

    // taps: count a butterfly, or walk to a spot / point on the ground
    if (input.tap && started() && !paused) {
      const tx = input.tap.x, ty = input.tap.y;
      const screenDist = (p: THREE.Vector3) => { v.copy(p).project(camera); return v.z < 1 ? Math.hypot((v.x * 0.5 + 0.5) * innerWidth - tx, (-v.y * 0.5 + 0.5) * innerHeight - ty) : 1e9; };
      if (bf.active && !bf.demo) {
        let best = -1, bd = touch ? 70 : 46;
        for (let i = bf.first; i < bf.first + bf.n; i++) { const d = screenDist(flies.flies[i].pos); if (d < bd && !flies.flies[i].landed) { bd = d; best = i; } }
        if (best >= 0) { bf.own = bf.wrong; countFly(best); }   // her own count: the cat will not count over it (see demoCount)
      } else if (canMove) {
        let spot: Spot | null = null;
        for (const s of spots) if (s.on() && screenDist(v2.copy(s.pos).setY(s.pos.y + 1)) < 90) spot = s;
        if (spot) auto = { x: spot.pos.x, z: spot.pos.z, then: spot.run, stuck: 0, last: 1e9 };
        else {
          ray.setFromCamera(new THREE.Vector2((tx / innerWidth) * 2 - 1, -(ty / innerHeight) * 2 + 1), camera);
          if (raycastGround(ray.ray.origin, ray.ray.direction, v)) {
            auto = { x: v.x, z: v.z, stuck: 0, last: 1e9 };
            tapRing.position.set(v.x, v.y + 0.08, v.z);
            (tapRing.material as THREE.MeshBasicMaterial).opacity = 0.9;
          }
        }
      }
    }
    input.tap = null;

    // movement
    let mx = 0, mz = 0, mag = 0;
    if (canMove) {
      mag = Math.hypot(input.moveX, input.moveY);
      if (mag > 0.08) {
        auto = null;
        const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
        mx = fx * input.moveY + -fz * input.moveX;
        mz = fz * input.moveY + fx * input.moveX;
      } else if (auto) {
        const dx = auto.x - hp.x, dz = auto.z - hp.z, d = Math.hypot(dx, dz);
        const reach = auto.then ? 2.0 : 0.35;
        auto.stuck = d > auto.last - 0.5 * dt ? auto.stuck + dt : 0;
        auto.last = d;
        if (d < reach || auto.stuck > 0.8) { const then = d < reach + 0.8 ? auto.then : undefined; auto = null; then?.(); }
        else { mx = dx / d; mz = dz / d; mag = Math.min(1, d / 1.5 + 0.35); }
      }
    } else auto = null;

    const speed = 5.4 * Math.min(1, mag);
    if (mag > 0.08) {
      const l = Math.hypot(mx, mz) || 1;
      hp.x += (mx / l) * speed * dt; hp.z += (mz / l) * speed * dt;
      hero.face(Math.atan2(mx, mz), dt);
      resolve(hp, 0.4);
    } else if (cam.focus) hero.face(Math.atan2(cam.focus.x - hp.x, cam.focus.z - hp.z), dt, 5);
    if (input.jump && grounded && canMove) { vy = 6.4; grounded = false; sfx('jump'); }
    input.jump = false;
    const ground = groundY(hp.x, hp.z);
    vy -= 17 * dt; hp.y += vy * dt;
    if (hp.y <= ground) { hp.y = ground; vy = 0; grounded = true; }
    if (!busy) {
      if (!grounded) hero.play('Jump', 0.12);
      else if (mag > 0.08) hero.play(speed > 2.6 ? 'Run' : 'Walk', 0.18, speed > 2.6 ? speed / 4.2 : speed / 1.5);
      else hero.play('Idle', 0.25);
    }
    wings.forEach((w) => { w.mesh.rotation.y = w.side * (0.55 + Math.sin(time * (grounded ? 5 : 22)) * 0.35); });
    queenWings.forEach((w) => { w.mesh.rotation.y = w.side * (0.55 + Math.sin(time * 4 + 1) * 0.3); });

    // interaction prompt
    let near: Spot | null = null;
    if (canMove) for (const s of spots) if (s.on() && Math.hypot(s.pos.x - hp.x, s.pos.z - hp.z) < s.r) near = s;
    setAct(near ? near.label : null);
    el.btnJump.classList.toggle('hidden', !canMove);
    if (input.act && near) near.run();
    input.act = false;

    // cat follows at the hero's side
    const cp = cat.root.position;
    v.set(hp.x + Math.cos(hero.heading) * 0.9 - Math.sin(hero.heading) * 0.6, 0, hp.z - Math.sin(hero.heading) * 0.9 - Math.cos(hero.heading) * 0.6);
    const cd = Math.hypot(v.x - cp.x, v.z - cp.z);
    if (cd > 0.45) {
      const cs = Math.min(7, cd * 3.2) * dt;
      cp.x += ((v.x - cp.x) / cd) * Math.min(cs, cd); cp.z += ((v.z - cp.z) / cd) * Math.min(cs, cd);
      cat.face(Math.atan2(v.x - cp.x, v.z - cp.z), dt);
      if (!busy) cat.play('Walk', 0.15, clamp(cd * 1.2, 0.8, 2.2));
    } else { if (!busy) cat.play('Idle', 0.3); cat.face(hero.heading, dt, 4); }
    cp.y = groundY(cp.x, cp.z);

    // quest characters: turn to the heroine when she is close, otherwise live their own life
    for (const n of npcs) {
      const d = Math.hypot(n.pos.x - hp.x, n.pos.z - hp.z);
      n.actor.face(d < 7 ? Math.atan2(hp.x - n.pos.x, hp.z - n.pos.z) : n.def.heading, dt, 3);
      if (!busy && (n.timer -= dt) < 0) {
        n.timer = 4 + Math.random() * 6;
        n.idle = d > 7 && n.actor.has('Eating') && Math.random() < 0.6 ? 'Eating' : n.actor.has('Idle_2') && Math.random() < 0.4 ? 'Idle_2' : 'Idle';
        n.actor.play(n.idle, 0.4);
      }
      const open = (save.quests[n.def.id] ?? 0) < 3;
      n.mark.visible = open && !busy && !(search.active && n.def.id === 'deer');
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

    // collectibles
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
          void say(`tap_${++search.found}`, String(search.found));
          bubble('t_stars', 0, '🦌', `⭐ ${search.found} / 5`);
          if (search.found === 5) finishSearch();
        }
      }
    }

    // shrine: collected shards circle the place where the crystal will stand
    if (finale > 0) finale += dt;
    const pull = finale > 0 ? Math.max(0, 1 - finale / 3.4) : 1;
    QUESTS.forEach((q, i) => {
      const m = shards[i];
      m.visible = (save.quests[q.id] ?? 0) >= 3 && !save.final;
      if (!m.visible) return;
      const a = time * (finale > 0 ? 1 + finale * 2.5 : 0.7) + (i / 5) * 6.28;
      m.position.set(shrine.x + Math.cos(a) * 0.95 * pull, shrine.y + Math.sin(time * 1.5 + i) * 0.12, shrine.z + Math.sin(a) * 0.95 * pull);
      m.rotation.y = time * 1.5 + i;
    });
    const mat = crystal.material as THREE.MeshStandardMaterial;
    mat.opacity = lerp(mat.opacity, save.final ? 1 : 0.18, damp(2, dt));
    crystal.scale.setScalar(lerp(crystal.scale.x, save.final ? 1.25 : 0.8, damp(3, dt)));
    crystal.position.y = shrine.y + Math.sin(time * 1.8) * 0.12; crystal.rotation.y = time * 0.9;
    crystalLight.intensity = save.final ? 5 + Math.sin(time * 3) * 1.2 : finale > 0 ? finale * 2 : 0;
    glow = lerp(glow, save.final ? 1 : 0, damp(0.6, dt));
    rainbowAlpha.value = glow;
    (world.sky.material as THREE.ShaderMaterial).uniforms.uGlow.value = glow;
    world.hemi.intensity = 1.25 + glow * 0.25;

    // guide: beacon + sparkle trail towards the next goal
    const target = started() && !busy ? goal() : null;
    beacon.visible = trail.visible = !!target;
    if (target) {
      beacon.position.set(target.x, groundY(target.x, target.z) + 7, target.z);
      const dx = target.x - hp.x, dz = target.z - hp.z, d = Math.hypot(dx, dz) || 1, len = Math.min(d, 14);
      for (let i = 0; i < trailN; i++) {
        const f = ((i / trailN + time * 0.35) % 1) * len, x = hp.x + (dx / d) * f, z = hp.z + (dz / d) * f;
        trailPos.set([x, groundY(x, z) + 0.6 + Math.sin(time * 4 + i) * 0.2, z], i * 3);
      }
      trailGeo.attributes.position.needsUpdate = true;
    }
    const ring = tapRing.material as THREE.MeshBasicMaterial;
    ring.opacity = Math.max(0, ring.opacity - dt * 1.4); tapRing.scale.setScalar(1 + (0.9 - ring.opacity));

    hero.update(dt); cat.update(dt); chest.update(dt);
    flies.update(time);
    for (let i = 0; i < bf.sprites.length; i++) bf.sprites[i].position.y += Math.sin(time * 3 + i) * 0.002;
    updateClouds(dt);
    sparks.update(dt);

    // camera: dressing room on the start screen, a conversation/task framing, or orbit behind the heroine
    if (!cam.focus && mag > 0.3 && !input.touch) cam.yaw += clamp(angleDiff(hero.heading + Math.PI, cam.yaw), -1, 1) * 0.5 * dt * (Math.abs(angleDiff(hero.heading + Math.PI, cam.yaw)) < 2.3 ? 1 : 0);
    if (!started()) {
      const wide = camera.aspect > 1.25;
      cam.yaw = Math.PI + 0.3 + Math.sin(time * 0.4) * 0.12;
      v.set(hp.x - Math.cos(cam.yaw) * (wide ? 1.0 : 0), hp.y + (wide ? 0.95 : 1.9), hp.z + Math.sin(cam.yaw) * (wide ? 1.0 : 0));
      cam.target.copy(v); cam.dist = wide ? 3.6 : 5.2; cam.pitch = 0.12;
    } else {
      if (cam.focus) { v.copy(cam.focus).lerp(v2.copy(hp).setY(hp.y + 1.2), 0.3); cam.yaw += angleDiff(Math.atan2(hp.x - cam.focus.x, hp.z - cam.focus.z) + 0.5, cam.yaw) * damp(2, dt); }
      else v.set(hp.x, hp.y + 1.5, hp.z);
      cam.target.lerp(v, damp(cam.focus ? 3 : 9, dt));
      cam.dist = lerp(cam.dist, camOverride ?? (cam.focus ? (bf.active ? 7.5 : 6.5) : camera.aspect < 1 ? 8 : 6.2), damp(3, dt));
      cam.pitch = lerp(cam.pitch, cam.focus ? 0.3 : userPitch, damp(cam.focus ? 3 : 10, dt));
    }
    camera.position.set(
      cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      cam.target.y + Math.sin(cam.pitch) * cam.dist,
      cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
    camera.position.y = Math.max(camera.position.y, groundY(camera.position.x, camera.position.z) + 0.8);
    camera.lookAt(cam.target);

    world.sun.position.copy(hp).add(world.sunOffset);
    world.sun.target.position.copy(hp);
    updateRanged(hp.x, hp.z);
    motes.uCenter.value.copy(hp);
    motes.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));

    renderer.info.reset();
    if (composer) composer.render(dt); else renderer.render(scene, camera);

    // fps meter + automatic quality fallback
    fpsT += dt; fpsN++; warm += dt;
    if (fpsT >= 1) {
      const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
      el.fps.textContent = `${fps.toFixed(0)} fps · q${tier} · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris · ${renderer.info.render.calls} calls`;
      if (warm > 4 && !params.has('q') && !document.hidden) {
        slow = fps < 34 ? slow + 1 : 0;
        if (slow >= 3 && tier > 0) { tier--; slow = 0; warm = 0; applyTier(); }
      }
    }
  }
  refreshHud();
  frame();

  // Test/debug hook.
  (window as unknown as Record<string, unknown>).__game = {
    hero, cam, save, flies, scene, camera, renderer, THREE, npcs, search, bf, voice: voiceLog,
    get busy() { return busy; },
    teleport(x: number, z: number) { hero.root.position.set(x, groundY(x, z), z); },
    closeup(d: number | null) { camOverride = d; },
    talk(id: QuestDef['id']) { void talk(npc(id)); },
    /** Does the right thing for whatever task is on screen; returns what it did. */
    cheat() {
      if (bf.active && !bf.demo) { (el.answers.children[bf.n - 1] as HTMLElement).dispatchEvent(new PointerEvent('pointerdown')); return 'butterflies'; }
      if (search.active) { const it = search.items.find((s) => !s.found); if (it) hero.root.position.copy(it.mesh.position); return 'star'; }
      return cheatTask() ? 'panel' : '';
    },
  };
}
