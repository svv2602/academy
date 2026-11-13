import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import './style.css';
import { rig, setProgressHandler, staticGeo, tint } from './core/assets';
import { say, sfx, stopVoice, unlockAudio } from './core/audio';
import { initInput, input, pollInput } from './core/input';
import { clearSave, defaultSave, loadSave, storeSave } from './core/save';
import { angleDiff, clamp, damp, lerp } from './core/util';
import { Actor } from './game/actor';
import { buildHero } from './game/hero';
import { Butterflies } from './world/butterflies';
import { buildClouds, buildGrass, buildMotes, buildRainbow, buildScenery, buildSky, buildWater, setDrawRange, updateRanged, uTime } from './world/scenery';
import { CHEST, CRYSTAL, PATCH, SPAWN, UNICORN, buildTerrain, colliders, height, raycastGround, resolve } from './world/terrain';
import { bubble, el, fanfare, hideAnswers, initStart, setAct, setCounter, showAnswers } from './ui/ui';
import { voiceText, type Key } from './ui/strings';

/** Quest stages of the slice. */
const enum Stage { Intro, GoUnicorn, Counting, CrystalReady, Done }

const params = new URLSearchParams(location.search);
const save = loadSave();
if (save.stage === Stage.Counting) save.stage = Stage.GoUnicorn; // a task is never resumed half-way

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

// ---------- shared sprite texture & particles ----------
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

class Sparks {
  private n = 160; private pos = new Float32Array(this.n * 3); private col = new Float32Array(this.n * 3);
  private vel = new Float32Array(this.n * 3); private life = new Float32Array(this.n); private next = 0;
  private pts: THREE.Points;
  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, size: 0.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.pts.frustumCulled = false;
    this.pos.fill(-999);
    scene.add(this.pts);
  }
  burst(p: THREE.Vector3, color: string, count = 30, power = 4) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.next = (this.next + 1) % this.n;
      const a = Math.random() * 6.28, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u) * power * (0.4 + Math.random() * 0.6);
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.vel.set([Math.cos(a) * s, Math.abs(u) * power + 1.5, Math.sin(a) * s], i * 3);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.life[i] = 0.8 + Math.random() * 0.8;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 6 * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      const f = Math.min(1, this.life[i] * 2);
      for (let k = 0; k < 3; k++) this.col[i * 3 + k] *= 0.985 + 0.015 * f;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

function numberSprite(n: number) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 56, 0, 6.28); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#ff8fc4'; g.stroke();
  g.fillStyle = '#b0428a'; g.font = '800 78px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false, toneMapped: false }));
  s.scale.setScalar(0.8); s.renderOrder = 20;
  return s;
}

// ---------- boot ----------
setProgressHandler((f) => { el.bar.style.width = `${Math.round(f * 100)}%`; });
initStart(save, save.played, () => applyLook());
let applyLook = () => {};
applyTier();
void boot();

async function boot() {
  const density = touch ? 0.75 : 1;
  scene.add(buildTerrain(touch ? 150 : 200));
  buildWater(scene);
  const rainbowAlpha = buildRainbow(scene);
  const motes = buildMotes(scene, 260);
  buildGrass(scene, touch ? 9000 : 16000);
  const [, updateClouds, heroRig, catRig, uniRig, chestRig, crystalGeo, starGeo] = await Promise.all([
    buildScenery(scene, density), buildClouds(scene),
    buildHero(save), rig('extra/cat2', 0.62, true), rig('animals_pack/Horse_White', 2.0, true), rig('platformer_game_pack/Chest', 0.9),
    staticGeo('rpg_items_pack/Crystal2', 1), staticGeo('platformer_game_pack/Star', 0.7),
  ]);
  const sparks = new Sparks();
  const flies = new Butterflies(scene, 64);

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
  const wingMat = new THREE.MeshBasicMaterial({ color: '#d8f6ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const wings = [1, -1].map((s) => {
    const w = new THREE.Mesh(new THREE.ShapeGeometry(wingShape, 8), wingMat);
    w.scale.set(s * 0.8, 0.8, 0.8);
    w.position.set(0, 1.08, -0.13);
    hero.root.add(w);
    return { mesh: w, side: s };
  });

  // ----- cat companion -----
  const cat = new Actor(catRig);
  cat.root.position.set(hero.root.position.x + 1, 0, hero.root.position.z + 0.6);
  scene.add(cat.root);
  cat.play('Idle');
  tint(cat.model, { Cat_Main: '#f7a94b', Cat_Secondary: '#d27a2c', Ears: '#f9a8bd', Eye_White: '#ffffff' });

  // ----- unicorn -----
  const uni = new Actor(uniRig);
  tint(uni.model, { Main: '#ffffff', Main_Light: '#fff4fb', Hair: '#ff9ed2', Hooves: '#ffd76a', Muzzle: '#ffd0e0', Eye_White: '#ffffff' });
  uni.root.position.set(UNICORN.x, height(UNICORN.x, UNICORN.z), UNICORN.z);
  uni.heading = -2.2; uni.root.rotation.y = uni.heading;
  scene.add(uni.root);
  uni.play('Idle');
  colliders.push({ x: UNICORN.x, z: UNICORN.z, r: 0.9 }, { x: CHEST.x, z: CHEST.z, r: 0.6 });
  const hornMat = new THREE.MeshStandardMaterial({ color: '#ffe68a', emissive: '#ffc94d', emissiveIntensity: 0.9, roughness: 0.3 });
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.5, 12), hornMat);
  horn.geometry.translate(0, 0.25, 0);
  let headBone: THREE.Object3D | null = null;
  const hornQ = new THREE.Quaternion(), hornDir = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  const hornFwd = 0.16, hornUp = 0.2;
  uni.model.traverse((o) => { if ((o as THREE.Bone).isBone && o.name === 'Head') headBone = o; });
  const mark = new THREE.Mesh(starGeo, new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffcc33', emissiveIntensity: 1.2, vertexColors: false }));
  mark.position.set(UNICORN.x, uni.root.position.y + 3, UNICORN.z);
  scene.add(mark, horn);

  // ----- crystal, chest, stars, beacon -----
  const crystalMat = new THREE.MeshStandardMaterial({ color: '#bff4ff', emissive: '#56d8ff', emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, flatShading: true });
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  const crystalLight = new THREE.PointLight('#8fe8ff', 0, 14, 1.6);
  crystal.add(crystalLight); crystalLight.position.y = 0.5;
  scene.add(crystal);
  const crystalHome = new THREE.Vector3(CRYSTAL.x, height(CRYSTAL.x, CRYSTAL.z) + 0.9, CRYSTAL.z);
  const crystalShrine = new THREE.Vector3(22.5, height(22.5, -8) + 1.9, -8); // inside the gazebo once found

  const chest = new Actor(chestRig);
  chest.root.position.set(CHEST.x, height(CHEST.x, CHEST.z), CHEST.z);
  chest.root.rotation.y = 0.9;
  scene.add(chest.root);
  if (save.chestOpen) chest.pose('Chest_Open');

  const starMat = new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb300', emissiveIntensity: 1.1, roughness: 0.3 });
  const starSpots: [number, number][] = [[-6.5, -1], [10, 9], [22.5, -8], [-17, -18], [7, -31], [-26, 11], [26, -30], [-2, -46]];
  const stars = starSpots.map(([x, z], id) => {
    const p = { x, z }; resolve(p, 0.6);
    const mesh = new THREE.Mesh(starGeo, starMat);
    mesh.position.set(p.x, height(p.x, p.z) + 1.0, p.z);
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
  const ambientCount = flies.flies.length;

  // ---------- game state ----------
  let stage: Stage = save.stage;
  let busy = false;                 // hero can't move (task, fanfare)
  let vy = 0, grounded = true;
  let auto: { x: number; z: number; then?: () => void; stuck: number; last: number } | null = null;
  const cam = { yaw: 0, pitch: 0.36, dist: 6.2, target: new THREE.Vector3(), focus: null as THREE.Vector3 | null };
  cam.target.copy(hero.root.position);
  const task = { active: false, n: 0, first: 0, counted: 0, wrong: 0, sprites: [] as THREE.Sprite[], demo: false, colors: ['#ff4fa3', '#7a5cff', '#2aa8ff', '#ff5a4f'] };
  let glow = stage >= Stage.Done ? 1 : 0;
  let camOverride: number | null = null;

  const persist = () => { save.stage = stage; save.pos = [hero.root.position.x, hero.root.position.z]; storeSave(save); };
  const line = (key: Key, hold = 0) => { bubble(key, hold); return say(key, voiceText(key)); };
  const refreshHud = () => { setCounter('stars', String(save.stars)); setCounter('crystals', `${stage >= Stage.Done ? 1 : 0}/1`); };
  const addStars = (n: number, at: THREE.Vector3) => { save.stars += n; sparks.burst(at, '#ffe066', 24); sfx('chime'); refreshHud(); persist(); };

  interface Spot { pos: THREE.Vector3; r: number; label: Key; on: () => boolean; run: () => void; }
  const spots: Spot[] = [
    { pos: uni.root.position, r: 3.2, label: 'talk', on: () => stage === Stage.GoUnicorn && !busy, run: startCounting },
    { pos: crystalHome, r: 2.2, label: 'take', on: () => stage === Stage.CrystalReady && !busy, run: takeCrystal },
    { pos: chest.root.position, r: 2.2, label: 'open', on: () => !save.chestOpen && !busy, run: openChest },
  ];

  function openChest() {
    save.chestOpen = true;
    chest.once('Chest_Open', 'Chest_Open');
    sfx('good');
    addStars(5, chest.root.position.clone().setY(chest.root.position.y + 1));
    void line('chest', 4000);
  }

  // ----- the counting task -----
  async function startCounting() {
    stage = Stage.Counting; busy = true; auto = null; task.active = true; task.counted = 0; task.wrong = 0;
    task.n = 4 + Math.floor(Math.random() * 5);
    task.first = flies.flies.length;
    for (let i = 0; i < task.n; i++) {
      const a = (i / task.n) * 6.28 + Math.random() * 0.5, r = 0.5 + Math.random() * 1.6;
      const id = flies.add(PATCH.x + Math.cos(a) * r, PATCH.z + Math.sin(a) * r, 0.45, task.colors[i % 4], 1.5);
      flies.flies[id].home.y = height(PATCH.x, PATCH.z) + 1.0 + (i % 3) * 0.45;
    }
    cam.focus = new THREE.Vector3(PATCH.x, height(PATCH.x, PATCH.z) + 1.2, PATCH.z);
    hero.play('Talk'); uni.play('Idle_2');
    mark.visible = false;
    await line('uni_ask');
    if (!task.active) return;
    showAnswers(10, pickAnswer);
    void line('count_hint');
  }

  function countFly(i: number) {
    const f = flies.flies[i];
    if (f.landed) return;
    f.landed = true; f.scale = 1.9;
    flies.setColor(i, '#ff9f1a');
    task.counted++;
    const s = numberSprite(task.counted);
    s.position.copy(f.pos).y += 0.7;
    scene.add(s); task.sprites.push(s);
    sparks.burst(f.pos, '#fff2a8', 10, 2);
    sfx('pop');
    void say(`tap_${task.counted}`, String(task.counted));
  }

  function resetCount() {
    for (let i = task.first; i < task.first + task.n; i++) { const f = flies.flies[i]; f.landed = false; f.scale = 1.5; flies.setColor(i, task.colors[(i - task.first) % 4]); }
    task.sprites.forEach((s) => { scene.remove(s); s.material.map?.dispose(); s.material.dispose(); });
    task.sprites.length = 0; task.counted = 0;
  }

  /** Hint after a miss: the cat counts every butterfly aloud, one by one. */
  async function demoCount() {
    task.demo = true;
    resetCount();
    for (let i = task.first; i < task.first + task.n && task.active; i++) {
      countFly(i);
      await new Promise((r) => setTimeout(r, 850));
    }
    task.demo = false;
    if (task.active) void line('pick_number');
  }

  function pickAnswer(n: number, btn: HTMLButtonElement) {
    if (!task.active || task.demo) return;
    if (n === task.n) {
      btn.classList.add('yes');
      void finishCounting();
    } else {
      btn.classList.add('no');
      task.wrong++;
      sfx('soft');
      const k = Math.floor(Math.random() * 3);
      bubble('count_hint');
      void say(`try_${k}`, 'Спробуй ще раз').then(() => { if (task.active) void demoCount(); });
    }
  }

  async function finishCounting() {
    task.active = false;
    sfx('good');
    cat.once('Yes', 'Idle'); hero.once('Dance', 'Idle');
    const center = cam.focus!.clone();
    sparks.burst(center, '#ff9ed2', 40, 5); sparks.burst(center, '#9fe8ff', 30, 4);
    save.stars += 3; refreshHud();
    await say(`praise_${[0, 1, 3, 4, 5, 6, 7][Math.floor(Math.random() * 7)]}`, 'Молодець!');
    hideAnswers();
    for (let i = task.first; i < task.first + task.n; i++) { const f = flies.flies[i]; f.landed = false; f.scale = 1.2; f.r = 2.2; flies.setColor(i, palette[(i - task.first) % 4]); }
    task.sprites.forEach((s) => scene.remove(s)); task.sprites.length = 0;
    cam.focus = null; busy = false;
    stage = Stage.CrystalReady;
    sparks.burst(crystalHome, '#8fe8ff', 50, 5); sfx('chime');
    persist();
    void line('reward', 7000);
  }

  async function takeCrystal() {
    busy = true; auto = null;
    stage = Stage.Done;
    sfx('fanfare');
    hero.play('Dance'); cat.play('Dance');
    sparks.burst(crystalHome, '#8fe8ff', 60, 6); sparks.burst(crystalHome, '#fff2a8', 40, 5);
    refreshHud(); persist();
    void line('got_crystal');
    await fanfare('crystal_name', 'got_crystal');
    cat.play('Idle'); hero.play('Idle');
    busy = false;
    void line('free', 6000);
  }

  // ---------- start screen ----------
  el.loading.classList.add('hidden'); el.setup.classList.remove('hidden');
  el.restart.addEventListener('click', () => { clearSave(); location.reload(); });
  el.play.addEventListener('click', async () => {
    unlockAudio();
    el.start.classList.add('hidden');
    el.hud.classList.remove('hidden'); el.btnJump.classList.remove('hidden');
    refreshHud();
    const first = !save.played;
    save.played = true; persist();
    cam.yaw = 0; cam.target.copy(hero.root.position);
    hero.once('Wave', 'Idle');
    if (stage === Stage.Intro) {
      await line('intro');
      stage = Stage.GoUnicorn; persist();
      void line('go_unicorn', 6000);
    } else if (!first) {
      await line('welcome_back', 5000);
      if (stage === Stage.GoUnicorn) void line('go_unicorn', 6000);
      if (stage === Stage.CrystalReady) void line('reward', 6000);
    }
  }, { once: true });
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
    const canMove = started() && !busy;

    // camera yaw from drag
    cam.yaw -= input.lookDX * 0.006; input.lookDX = 0;

    // taps: count a butterfly, or walk to a spot / point on the ground
    if (input.tap && started()) {
      const tx = input.tap.x, ty = input.tap.y;
      if (task.active && !task.demo) {
        let best = -1, bd = touch ? 70 : 46;
        for (let i = task.first; i < task.first + task.n; i++) {
          v.copy(flies.flies[i].pos).project(camera);
          const d = Math.hypot((v.x * 0.5 + 0.5) * innerWidth - tx, (-v.y * 0.5 + 0.5) * innerHeight - ty);
          if (d < bd && !flies.flies[i].landed) { bd = d; best = i; }
        }
        if (best >= 0) countFly(best);
      } else if (canMove) {
        let spot: Spot | null = null;
        for (const s of spots) {
          if (!s.on()) continue;
          v.copy(s.pos).setY(s.pos.y + 1).project(camera);
          if (v.z < 1 && Math.hypot((v.x * 0.5 + 0.5) * innerWidth - tx, (-v.y * 0.5 + 0.5) * innerHeight - ty) < 90) spot = s;
        }
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
    const ground = height(hp.x, hp.z);
    vy -= 17 * dt; hp.y += vy * dt;
    if (hp.y <= ground) { hp.y = ground; vy = 0; grounded = true; }
    if (!busy || task.active) {
      if (!grounded) hero.play('Jump', 0.12);
      else if (mag > 0.08) hero.play(speed > 2.6 ? 'Run' : 'Walk', 0.18, speed > 2.6 ? speed / 4.2 : speed / 1.5);
      else if (!busy) hero.play('Idle', 0.25);
    }
    wings.forEach((w) => { w.mesh.rotation.y = w.side * (0.55 + Math.sin(time * (grounded ? 5 : 22)) * 0.35); });

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
    cp.y = height(cp.x, cp.z);

    // collectibles
    for (const s of stars) {
      if (!s.mesh.visible) continue;
      s.mesh.rotation.y = time * 1.6; s.mesh.position.y = height(s.mesh.position.x, s.mesh.position.z) + 1 + Math.sin(time * 2 + s.id) * 0.15;
      if (started() && Math.hypot(s.mesh.position.x - hp.x, s.mesh.position.z - hp.z) < 1.2) {
        s.mesh.visible = false; save.starsTaken.push(s.id); addStars(1, s.mesh.position);
      }
    }

    // crystal
    const showCrystal = stage >= Stage.CrystalReady;
    crystal.visible = showCrystal;
    if (showCrystal) {
      const home = stage >= Stage.Done ? crystalShrine : crystalHome;
      crystal.position.lerp(v.copy(home).setY(home.y + Math.sin(time * 1.8) * 0.15), damp(2, dt));
      crystal.rotation.y = time * 0.9;
      crystalLight.intensity = 5 + Math.sin(time * 3) * 1.2;
      if (stage === Stage.CrystalReady && !busy && Math.hypot(crystalHome.x - hp.x, crystalHome.z - hp.z) < 1.1) void takeCrystal();
    } else crystal.position.copy(crystalHome);
    glow = lerp(glow, stage >= Stage.Done ? 1 : 0, damp(0.6, dt));
    rainbowAlpha.value = glow;
    (world.sky.material as THREE.ShaderMaterial).uniforms.uGlow.value = glow;
    world.hemi.intensity = 1.25 + glow * 0.25;

    // guide: beacon + sparkle trail towards the next goal
    const goal = stage <= Stage.GoUnicorn ? uni.root.position : stage === Stage.CrystalReady ? crystalHome : null;
    const guiding = !!goal && started() && !busy;
    beacon.visible = trail.visible = guiding;
    if (guiding && goal) {
      beacon.position.set(goal.x, height(goal.x, goal.z) + 7, goal.z);
      const dx = goal.x - hp.x, dz = goal.z - hp.z, d = Math.hypot(dx, dz), len = Math.min(d, 14);
      for (let i = 0; i < trailN; i++) {
        const f = ((i / trailN + time * 0.35) % 1) * len, x = hp.x + (dx / d) * f, z = hp.z + (dz / d) * f;
        trailPos.set([x, height(x, z) + 0.6 + Math.sin(time * 4 + i) * 0.2, z], i * 3);
      }
      trailGeo.attributes.position.needsUpdate = true;
    }
    mark.visible = stage <= Stage.GoUnicorn;
    mark.rotation.y = time * 2; mark.position.y = uni.root.position.y + 3 + Math.sin(time * 2.5) * 0.15;
    const ring = tapRing.material as THREE.MeshBasicMaterial;
    ring.opacity = Math.max(0, ring.opacity - dt * 1.4); tapRing.scale.setScalar(1 + (0.9 - ring.opacity));

    // animation
    hero.update(dt); cat.update(dt); uni.update(dt); chest.update(dt);
    if (headBone) {
      const hb = headBone as THREE.Object3D;
      // The head bone points along the muzzle; the horn sits on the forehead and leans forward a little.
      hb.getWorldPosition(horn.position); hb.getWorldQuaternion(hornQ);
      hornDir.set(0, 1, 0).applyQuaternion(hornQ);
      horn.position.addScaledVector(hornDir, hornFwd).y += hornUp;
      hornDir.multiplyScalar(-0.3).y += 0.9;
      horn.quaternion.setFromUnitVectors(yAxis, hornDir.normalize());
    }
    flies.update(time);
    for (let i = 0; i < task.sprites.length; i++) task.sprites[i].position.y += Math.sin(time * 3 + i) * 0.002;
    updateClouds(dt);
    sparks.update(dt);

    // camera: orbit behind the hero, or frame the task
    if (!cam.focus && mag > 0.3 && !input.touch) cam.yaw += clamp(angleDiff(hero.heading + Math.PI, cam.yaw), -1, 1) * 0.5 * dt * (Math.abs(angleDiff(hero.heading + Math.PI, cam.yaw)) < 2.3 ? 1 : 0);
    if (!started()) {
      // Dressing room: the heroine stands beside the start panel so every colour/hair change is visible at once.
      const wide = camera.aspect > 1.25;
      cam.yaw = Math.PI + 0.3 + Math.sin(time * 0.4) * 0.12;
      v.set(hp.x - Math.cos(cam.yaw) * (wide ? 1.0 : 0), hp.y + (wide ? 0.95 : 1.9), hp.z + Math.sin(cam.yaw) * (wide ? 1.0 : 0));
      cam.target.copy(v); cam.dist = wide ? 3.6 : 5.2; cam.pitch = 0.12;
    } else if (cam.focus) { v.copy(cam.focus).lerp(v2.copy(hp).setY(hp.y + 1.2), 0.12); cam.yaw += angleDiff(Math.atan2(hp.x - cam.focus.x, hp.z - cam.focus.z), cam.yaw) * damp(2, dt); }
    else v.set(hp.x, hp.y + 1.5, hp.z);
    if (started()) {
    cam.target.lerp(v, damp(cam.focus ? 3 : 9, dt));
    cam.dist = lerp(cam.dist, camOverride ?? (cam.focus ? 7 : camera.aspect < 1 ? 8 : 6.2), damp(3, dt));
    cam.pitch = lerp(cam.pitch, cam.focus ? 0.3 : 0.36, damp(3, dt));
    }
    camera.position.set(
      cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      cam.target.y + Math.sin(cam.pitch) * cam.dist,
      cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
    camera.position.y = Math.max(camera.position.y, height(camera.position.x, camera.position.z) + 0.8);
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
    hero, cam, save, flies, ambientCount, task, scene, camera, renderer, THREE,
    get stage() { return stage; },
    teleport(x: number, z: number) { hp0.set(x, height(x, z), z); },
    closeup(d: number | null) { camOverride = d; },
    reset() { Object.assign(save, defaultSave()); storeSave(save); location.reload(); },
  };
  const hp0 = hero.root.position;
}
