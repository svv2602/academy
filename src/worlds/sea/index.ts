import * as THREE from 'three';
import { gltf, rig, type Rig } from '../../core/assets';
import { setCast, sfx, speaking } from '../../core/audio';
import { worldClips } from '../../core/voice';
import type { Save } from '../../core/save';
import { Actor } from '../../game/actor';
import { loadFailed } from '../../game/boot';
import { createStage, type Game } from '../../game/context';
import { declared, marked, ready } from '../../game/describe';
import { createDialogue } from '../../game/dialogue';
import { flyoverOf, setTour, tour } from '../../game/flyover';
import { createGear } from '../../game/gear';
import { swimming, type Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { loadOwnPets } from '../../game/pets';
import { playScene } from '../../game/stage';
import { playStory, setStories } from '../../game/story';
import type { BuiltWorld, CharacterDef, MusicParams, Npc, WorldDef, WorldItem, WorldLines, WorldSky, WorldTask } from '../../game/world';
import { waterOf } from '../../game/water';
import { worldTaskDoor } from '../../game/worldtasks/core';
import { worldTaskPlayer, worldTaskProblems } from '../../game/worldtasks/play';
import { SEA_FLYOVER } from './flyover-path';
import { CABIN, CORAL_NEST, HALF, LANDMARKS, PATHS, ROUTE, SCALE, SPAWN, THRONE, ZONES } from './layout';
import { buildScenery, buildShafts } from './scenery';
import { LOCK, createLock } from './lock';
import { CORALS, createCoralsSearch } from './corals';
import { generateHalf, showHalfInWorld } from '../../game/worldtasks/half-show';
import { strings } from './strings';
import { voices } from './voices';
import CLIPS from './clips.json';
import { buildGround, colliders, ground } from './terrain';
import { createSeaCreatures } from './creatures';
import { buildBubbles } from './bubbles';
import { createSeaMagic } from './magic';
import { SEA_STORIES } from './story';
import { COLLECT, DAILY_PLACES } from './collect';
import { CHEST_FLAG, SEA_SECRETS, SECRET_HOW, createSeaSecrets } from './secrets';

/**
 * The Underwater Kingdom (WORLD-03), its grey build (WORLD-12): the map of docs/worlds/world-3.md in simple shapes at
 * their real sizes, stretched by one number (./layout.ts SCALE, `?scale=`), its five characters as figures of their
 * height with their chains of tasks the game already has, the two pearls that lie in the world, the finale at the
 * shell of the throne and the tour. The heroine swims (WorldDef.move): the swimming clips are the world's one file,
 * models/sea/swim.glb - put into the grey build only (vite.config.ts), from the probe world's copy of the same two
 * clips. The cat swims in its bubble, and the camera, her bubbles and the motes are the game's under water
 * (src/game/water.ts, src/game/camera.ts); a pet goes to no world but its own and the Great Tree (decision of the
 * customer 2026-11-20). The registry lists the sea only in a build made with `--mode grey`
 * (src/worlds/index.ts): the published game and the hub do not change. Its measurements: tools/sea-grey.mjs.
 */

/**
 * The characters (docs/worlds/world-3.md). The search among the corals (WORLD-17, ./corals.ts) is Bulk's third step,
 * played in the world; its last shell found brings his pearl to light in the corals. The second half of a shell
 * (WORLD-18, patterns) is Pantsyr's first step, played in the world before him (HALF_STEP). The shell lock (WORLD-19, the composition of a number) is played in the world: the queen's
 * last step, the lock in the gate of the castle (./lock.ts). `part`: the pearl is not
 * handed over - the character says where it lies (in the corals, in the captain's cabin; WORLD-08).
 * Each says its own lines in its own voice (./strings.ts, ./voices.ts): its greeting, what each step is about (the
 * turtle's last one: where its pearl lies), its thanks with the pearl and its words when met again.
 */
/** The step of Pantsyr's chain played in the world: the second half of a shell (WORLD-18). */
export const HALF_STEP = 'half';

export const FRIENDS: readonly CharacterDef[] = [
  { id: 'khvylia', emoji: '🧜‍♀️', x: ZONES.square.x + 2.5, z: ZONES.square.z - 2.5, heading: -2.4, steps: ['compare', 'missing', LOCK], shard: '#a8e4ff',
    hi: 'khvylia_hi', asks: ['khvylia_t1', 'khvylia_t2', 'khvylia_t3'], thanks: 'khvylia_done', again: ['khvylia_again_1', 'khvylia_again_2'] },
  { id: 'bulk', emoji: '🐉', x: ZONES.reef.x + 2, z: ZONES.reef.z + 1.5, heading: 1.2, steps: ['pattern', 'count', CORALS, 'part'], shard: '#7fe6d6',
    hi: 'bulk_hi', asks: ['bulk_t1', 'bulk_t2', 'bulk_t3', null], thanks: 'bulk_done', again: ['bulk_again_1', 'bulk_again_2'],
    after: 'bulk_pet_ask' },
  { id: 'pantsyr', emoji: '🐢', x: ZONES.ship.x - 2, z: ZONES.ship.z + 4, heading: 2.6, steps: [HALF_STEP, 'simon', 'sub', 'part'], shard: '#9fd0a8',
    hi: 'pantsyr_hi', asks: ['pantsyr_t1', 'pantsyr_t2', 'pantsyr_t3', 'pantsyr_hint'], thanks: 'pantsyr_done', again: ['pantsyr_again_1', 'pantsyr_again_2'] },
  { id: 'kleshnya', emoji: '🦀', x: ZONES.grotto.x - 2, z: ZONES.grotto.z - 1, heading: -1.8, steps: ['add', 'sort', 'compare'], shard: '#ffb0a0',
    hi: 'kleshnya_hi', asks: ['kleshnya_t1', 'kleshnya_t2', 'kleshnya_t3'], thanks: 'kleshnya_done', again: ['kleshnya_again_1', 'kleshnya_again_2'] },
  { id: 'iskorka', emoji: '🐟', x: ZONES.trench.x + 2, z: ZONES.trench.z + 2, heading: 0.8, steps: ['pairs', 'order', 'add'], shard: '#fff0a0',
    hi: 'iskorka_hi', asks: ['iskorka_t1', 'iskorka_t2', 'iskorka_t3'], thanks: 'iskorka_done', again: ['iskorka_again_1', 'iskorka_again_2'] },
];

/** The shape of each character in the grey build: its height (as it floats or stands), its colour, a mark of its kind. */
const FIGURE: Record<string, { h: number; r: number; color: string; lift?: number; top?: string }> = {
  khvylia: { h: 1.9, r: 0.32, color: '#7fb8d8', top: '#f0c75a' },    // a mermaid: tall, her crown
  bulk: { h: 0.9, r: 0.35, color: '#3fc2b0', lift: 0.6 },             // a sea dragon floating over the corals
  pantsyr: { h: 0.7, r: 0.6, color: '#6f9a6a' },                     // a turtle: low and wide
  kleshnya: { h: 0.55, r: 0.45, color: '#d8503a' },                  // a crab
  iskorka: { h: 0.35, r: 0.18, color: '#f2a640', lift: 1.0, top: '#fff6a0' },  // a little fish with its light
};

/** The pearls that lie in the world (WORLD-08): whose chain says where, the flag of the pearl taken, how it is taken. */
export const PEARLS = [
  { owner: 'bulk', flag: 'pearl_reef', hint: 'bulk_hint', at: CORAL_NEST, how: 'walk', found: 'sea_pearl_reef_found' },
  { owner: 'pantsyr', flag: 'pearl_ship', hint: 'pantsyr_hint', at: CABIN, how: 'act', found: 'sea_pearl_ship_found' },
] as const;
/**
 * Bulchik, Bulk's little brother (world-3.md, PLAY-09): once Bulk's chain is done and he has asked for him, he hides in
 * the shell garden behind its great shell - a free spot off its collider, the small shells, the echo shells and the
 * creatures (./pet.test.ts); swimming up to him finds him and he swims after her. His model is his brother's, loaded
 * as a pet's (src/game/pets.ts `loadOwnPets`).
 */
export const BULCHIK = { x: ZONES.garden.x - 6.1, z: ZONES.garden.z + 4.6 };
export const FINALE = 'final';
/** m from the turtle to the hinge of the shell before him. */
const HALF_AT = 2.6;
const TOUR = 'toured';
/**
 * The cat's words of the first visit, each said once (the flag of the save): after the tour, his bubble (he does not
 * like water); as she first swims a few metres, that she swims as she walks; after the first pearl, he is wet but stays.
 */
export const ONCE = { bubble: 'told_bubble', swim: 'told_swim', wet: 'told_wet' } as const;
/** m she swims after the cat's bubble before he says she swims like a fish. */
const SWIM_SAID_AT = 1.5;
/** s of game time she must be free and the voice silent before the cat says one of them. */
const QUIET = 2;
/** m: swimming this near a pearl of `walk` takes it; the spot of the cabin's door; the throne's spot. */
const TAKE_R = 1.2, CABIN_R = 2.6, THRONE_R = 3;

const LINES: WorldLines = { partGiven: 'npc_next', allParts: 'sea_all_pearls', partTitle: 'sea_part', partText: 'sea_count' };
/** A calm mode of D (the grey build's own; VOICE-12 later). */
const MUSIC: MusicParams = {
  scale: [293.7, 329.6, 349.2, 392, 440, 493.9, 523.3],
  chords: [[146.8, 220, 349.2], [130.8, 196, 329.6], [110, 164.8, 261.6]],
};
/** The heroine's clips of this world (vite.config.ts puts the file into the grey build): Swim_Fwd_Loop and Swim_Idle_Loop of the UAL, CC0. */
const SWIM_CLIPS = 'sea/swim';
/** The sunken ship (step B of the look): Kenney's "Ship Wreck", CC0 1.0 (CREDITS.md), the world's own file. */
const WRECK = 'sea/kenney/ship_wreck';
/** The chest in the hold, by the cabin's door: the core's (Platformer Game Kit, CC0), the first world's chest. */
const CHEST_MODEL = 'platformer_game_pack/Chest';
/** Where the chest stands: by the door of the cabin, toward the stern, out of the door's spot. */
const CHEST = { x: CABIN.x - 1.7, z: CABIN.z + 0.9 };
/** m: how high she swims over the floor (the probe world's height). */
const SWIM_HEIGHT = 0.6;

/**
 * The colour of the water: the background and its haze are one - no sky under water. Light and clear, never deep blue
 * (world-3.md); a bright turquoise over warm sand (the customer, 2026-11-21: "brighter, turquoise water and warm sand",
 * after a pale '#a8e2ea' that looked beige and a cold '#5cb6e4' over grey sand that looked wintry).
 */
export const WATER_COLOR = '#2fb0d6';
/** The haze of the water, from and to, in halves of the map: it begins a few metres from her - the floor goes turquoise
 * there (the customer, 2026-11-21: "the turquoise haze nearer") - and the far landmarks are still seen. */
export const FOG_NEAR = 0.12, FOG_FAR = 2;
/** Shafts of light from the surface: how many, swaying slowly; one mesh (one draw call). */
export const SHAFTS = 8;

/** Light water: its colour, its haze, light from above (the shafts are in ./scenery.ts `buildShafts`). */
function buildSky(scene: THREE.Scene): WorldSky {
  scene.background = new THREE.Color(WATER_COLOR);
  scene.fog = new THREE.Fog(WATER_COLOR, HALF * FOG_NEAR, HALF * FOG_FAR);
  const sun = new THREE.DirectionalLight('#fff7e8', 2.2);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  const cam = sun.shadow.camera;
  cam.left = -26; cam.right = 26; cam.top = 26; cam.bottom = -26; cam.near = 1; cam.far = 120;
  // light from above through turquoise water, and from the warm sand a warm one: the floor stays sunny
  scene.add(new THREE.HemisphereLight('#c8f2f8', '#d8c08a', 1.5), sun, sun.target);
  return { sun, sunOffset: new THREE.Vector3(-8, 36, 10) };
}

/**
 * The characters' models (the customer's word 2026-11-22: Meshy for the sea's five; CREDITS.md), the world's own files
 * (models/sea/, TECH-09), by their height in metres - the grey build's figures' (FIGURE), but the crab and the little fish
 * larger (the customer, 2026-11-22: "увеличиваем" - at their figures' size they were lost on the screen), each floating as
 * high as its figure did; their skeletons and clips our own (Idle, Talk; Khvylia's Sing for the finale, Bulk's Swim).
 */
// m, the height of each in the world beside her 1.53 (the customer's word of 2026-11-24 on the proportions: Bulk her
// height, a big friendly dragon; Pantsyr up to her chest; Kleshnya over the plain crabs; Iskorka small, a little more seen)
const MODELS: Record<string, number> = { khvylia: 1.9, bulk: 1.6, pantsyr: 0.9, kleshnya: 1.05, iskorka: 0.6 };

/** The files of the grey build: the swimming clips (the heroine and the cat are the game's) and the characters' models. Null = failed (TECH-08). */
async function loadSea(_scene: THREE.Scene, _save: Save, _touch: boolean, scope: WorldScope) {
  const [swim, rigs, wreck, chest] = await Promise.all([
    gltf(SWIM_CLIPS),
    Promise.all(Object.entries(MODELS).map(async ([id, h]) => {
      const r = await rig(`sea/${id}`, h);
      r.model.position.y += FIGURE[id].lift ?? 0;      // the dragon over the corals, the little fish up in the dark
      // the crab's eyes and the fish's light (a material of their own each) cast no shadow: two draw calls less
      r.model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && ['eyes', 'light'].includes((m.material as THREE.Material).name)) m.castShadow = false; });
      return [id, r] as const;
    })).then((e) => Object.fromEntries(e) as Record<string, Rig>),
    gltf(WRECK),
    rig(CHEST_MODEL, 0.9),
    // Bulchik, the pet of the sea: his brother's model, loaded as a pet's (src/game/pets.ts); missing, he stays at home
    loadOwnPets('sea', ['bulchik'], scope),
  ]).catch((e: unknown) => { loadFailed(e); return [null, null, null, null] as const; });
  return swim && rigs && wreck && chest ? { swim, rigs, wreck: wreck.scene, chest } : null;
}
type SeaLoads = NonNullable<Awaited<ReturnType<typeof loadSea>>>;

/** A character of the grey build: a figure of its height and colour on a rig with no clips (Actor plays none). */
function figure(id: string): Rig {
  const f = FIGURE[id], root = new THREE.Group(), model = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(f.r, Math.max(0.01, f.h - f.r * 2), 4, 10), new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.8 }));
  body.position.y = (f.lift ?? 0) + f.h / 2; body.castShadow = true;
  if (id === 'pantsyr' || id === 'kleshnya') body.rotation.z = Math.PI / 2;   // lying low over the floor
  model.add(body);
  if (f.top) {
    const top = new THREE.Mesh(new THREE.SphereGeometry(f.r * 0.6, 10, 8), new THREE.MeshStandardMaterial({ color: f.top, emissive: f.top, emissiveIntensity: 0.5, roughness: 0.4 }));
    top.position.y = (f.lift ?? 0) + f.h + f.r * 0.5;
    model.add(top);
  }
  root.add(model);
  return { root, model, clips: new Map() };
}

function buildSea(g: Game, L: SeaLoads, sky: WorldSky, scope: WorldScope): BuiltWorld {
  const { scene, hero, save, ws, flies, groundY } = g;
  // The colliders are one list of the module: the world empties it as it is left, a second entry starts from none.
  scope.own(() => { colliders.length = 0; });
  // The heroine swims here: the world lends her its swimming clips, taken back as it is left.
  scope.own(hero.lend(g.heroRig.worldClips(L.swim)));
  // its own voice (TECH-09): each character with its voice, the clips of voice/sea/ while the world is played
  setCast(voices);
  scope.own(() => setCast({ narrator: '', cast: {} }));
  scope.own(worldClips('sea', CLIPS));
  scene.add(buildGround(160));
  const floor = buildScenery(scene, L.wreck);
  // the chest in the hold, by the cabin's door: the world's secret `ship_chest` (./secrets.ts) opens it
  const chest = new Actor(L.chest);
  // its lid away from the cabin's door and from Pantsyr: the action of each stays its own (the button of the nearest
  // spot is the last in reach - opened by the chest's, the cabin's door was the chest's: the walkthrough of 2026-11-23)
  const PANTSYR = FRIENDS.find((c) => c.id === 'pantsyr')!;
  const toCabin = Math.atan2(CABIN.x - CHEST.x, CABIN.z - CHEST.z), toTurtle = Math.atan2(PANTSYR.x - CHEST.x, PANTSYR.z - CHEST.z);
  chest.root.position.set(CHEST.x, groundY(CHEST.x, CHEST.z), CHEST.z);
  chest.root.rotation.y = Math.atan2(-(Math.sin(toCabin) + Math.sin(toTurtle)), -(Math.cos(toCabin) + Math.cos(toTurtle)));
  chest.root.traverse((o) => { o.castShadow = true; });
  scene.add(chest.root);
  g.ground.block(CHEST.x, CHEST.z, 0.6);
  const shafts = buildShafts(scene, SHAFTS);
  // the secrets (PLAY-07, ./secrets.ts): the chest, the bubble lift, the echo shells, the whale from the lookout
  const secrets = createSeaSecrets(g, scope, { chest });
  // the creatures of no task (PLAY-11, PLAY-12): schools of fish, jellyfish, crabs, starfish; the columns of bubbles
  const creatures = createSeaCreatures(g);
  const bubbles = buildBubbles(scene);
  // the magic of the sea (WORLD-09): from the pearls in the save; after everything it touches
  const magic = createSeaMagic(g, scope, { creatures, bubbles, characters: FRIENDS });
  // In the water her wand and petals are hidden (src/game/gear.ts).
  const gear = createGear(g.heroRig, g.heroRig.gear, [], g.sparks, () => swimming(g));
  const point = (p: { x: number; z: number }, y = 0) => new THREE.Vector3(p.x, groundY(p.x, p.z) + y, p.z);

  const starMat = new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb300', emissiveIntensity: 1.1, roughness: 0.3 });
  const markGeo = new THREE.OctahedronGeometry(0.22);
  const npcs: Npc[] = FRIENDS.map((def) => {
    const actor = new Actor(L.rigs[def.id] ?? figure(def.id));
    const pos = point(def);
    actor.root.position.copy(pos); actor.heading = def.heading; actor.root.rotation.y = def.heading;
    if (actor.has('Idle')) actor.play('Idle');
    g.ground.block(def.x, def.z, FIGURE[def.id].r + 0.3);
    const mark = new THREE.Mesh(markGeo, starMat);
    scene.add(actor.root, mark);
    return { def, actor, pos, mark, idle: 'Idle', timer: 0 };
  });
  const finished = (n: Npc) => (ws.quests[n.def.id] ?? 0) >= n.def.steps.length;
  const npc = (id: string) => npcs.find((n) => n.def.id === id)!;

  // ----- the pearls that lie in the world (WORLD-08): the step `part` of the dragon's and the turtle's chains -----
  const pearlGeo = new THREE.SphereGeometry(0.28, 16, 12);
  const pearls = PEARLS.map((p) => {
    const def = FRIENDS.find((c) => c.id === p.owner)!;
    const m = new THREE.Mesh(pearlGeo, new THREE.MeshStandardMaterial({ color: '#fdf6ff', emissive: def.shard, emissiveIntensity: 0.6, roughness: 0.15 }));
    m.position.copy(point(p.at, 1.0)); m.visible = false;
    scene.add(m);
    return { ...p, mesh: m, step: def.steps.indexOf('part') };
  });
  type Pearl = (typeof pearls)[number];
  const waiting = (p: Pearl) => ws.flags[p.hint] === true && (ws.quests[p.owner] ?? 0) === p.step;
  let stepDone: (n: Npc, k: number) => void = () => {};
  const take = (p: Pearl) => {
    ws.flags[p.flag] = true; p.mesh.visible = false;
    sfx('chime'); g.sparks.burst(p.mesh.position, '#bff4ff', 36, 3);
    // the cat names the pearl found, then the chain moves on and its character thanks
    void g.speech.line(p.found, 'story').then(() => stepDone(npc(p.owner), p.step));
  };
  const part: WorldTask = {
    skill: 'count',     // a step of no skill: the conversation reads the skill of a task it runs, never of this one
    start: (n) => { const p = pearls.find((x) => x.owner === n.def.id); if (p) { ws.flags[p.hint] = true; g.persist(); } },
    active: () => pearls.some(waiting),
    owner: () => pearls.find(waiting)?.owner ?? null,
  };

  const stage = createStage(g, () => g.speech.caption(null));
  // the cut-scenes (WORLD-13, ./story.ts): the way in at the first entry (src/game/start.ts enterWorld), the Pearl after the finale
  const story = setStories(g, SEA_STORIES, scope);
  // The tasks played in the world (PLAY-01): opened in their frame by the shared player, their taps and time from below.
  const player = worldTaskPlayer(g, scope);
  // The queen's shell lock (WORLD-19): she asks, the heroine swims to the gate, the lock opens there
  const lock = createLock(g, player, scope);
  scope.own(() => lock.dispose());
  lock.opened(finished(npc('khvylia')));
  // Bulk's search among the corals (WORLD-17): its last shell found brings his pearl to light (the mark of his `part`)
  const corals = createCoralsSearch(g, () => { ws.flags.bulk_hint = true; g.persist(); });
  scope.own(() => corals.dispose());
  // Pantsyr's second half of a shell (WORLD-18): before him, he asks, the cat hints; solved - the shell closes, he speaks
  const halfStep: WorldTask = {
    skill: 'pattern', inWorld: () => true,
    run: async (n, level) => {
      const h = n.def.heading;
      const at = { x: n.pos.x + Math.sin(h) * HALF_AT, z: n.pos.z + Math.cos(h) * HALF_AT, facing: h + Math.PI };
      const spec = generateHalf(level, g.rng, { prompt: 'pantsyr_half_start', way: 'sea_half_hint_1', together: 'sea_half_hint_2' });
      const res = await player.play(showHalfInWorld(scene, spec, at, g.hooksFor(n.def.emoji), { groundY, reach: g.touch ? 80 : 56, scope }));
      // still inside the task's frame (g.task): only its own lines sound there, so the turtle's last word is the task's
      if (res.solved) await g.speech.line('pantsyr_half_finish', 'task', 0, n.def.emoji);
      return res;
    },
  };
  const tasks: Record<string, WorldTask> = { part, [LOCK]: lock, [CORALS]: corals, [HALF_STEP]: halfStep };
  const wrongTasks = worldTaskProblems(sea.worldTasks, tasks);
  if (wrongTasks.length) throw new Error(`the sea: ${wrongTasks.join('; ')}`);
  const dialogue = createDialogue(g, stage, { characters: FRIENDS, lines: LINES, tasks });
  stepDone = dialogue.stepDone;

  // ----- the tour, the finale -----
  const flyover = setTour(g, { path: SEA_FLYOVER, visited: () => ws.flags[TOUR] === true, mark: () => { ws.flags[TOUR] = true; g.persist(); } });
  const throne = point(THRONE);
  const pearlOfDeep = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), new THREE.MeshStandardMaterial({ color: '#fbf4ff', emissive: '#9ad8ff', emissiveIntensity: 0.9, roughness: 0.1 }));
  pearlOfDeep.position.copy(throne).setY(throne.y + 2.4);
  scene.add(pearlOfDeep);
  // the finale's few seconds run in game time, counted down by the frame (update below)
  let finaleOn = false, finaleLeft = 0, finaleEnd: (() => void) | null = null;
  let lidShown = false;   // the throne's lid open before the finale: the pictures of the look only (debug `openThrone`)
  const tourItem = marked(ws, { kind: 'flyover', id: TOUR, how: 'auto', active: () => flyoverOf(g)?.active === true });
  const pearlItems = PEARLS.map((p) => marked(ws, { kind: 'part', id: p.flag, how: p.how, at: { x: p.at.x, z: p.at.z } }));
  // the finale waits for the chains, the tour and the pearls; the pet (Bulchik) is the child's own, never needed
  const before = [...declared(g).filter((i) => i.kind !== 'pet'), tourItem, ...pearlItems];
  const finaleItem = marked(ws, { kind: 'finale', id: FINALE, how: 'act', at: { ...THRONE }, after: before.map((i) => i.id), active: () => finaleOn });
  const all = [...before, finaleItem];
  // the secrets are the child's own, never needed by the finale
  const secretItems = SEA_SECRETS.map((id) => marked(ws, { kind: 'secret', id, how: SECRET_HOW[id], at: secrets.at[id], active: () => secrets.active(id) }));
  // a scene goes on frame by frame with a tap (src/game/story.ts): the child's taps, the walkthrough's too
  const sceneOn = (id: string) => () => story.active && story.id === id;
  const introItem = marked(ws, { kind: 'scene', id: 'story_intro', how: 'tap', active: sceneOn('story_intro') });
  const pearlStoryItem = marked(ws, { kind: 'scene', id: 'story_pearl', how: 'tap', after: [FINALE], active: sceneOn('story_pearl') });
  const own: readonly WorldItem[] = [introItem, tourItem, ...pearlItems, ...secretItems, finaleItem, pearlStoryItem];
  const restore = () => playScene(stage, 'sea finale', async () => {
    finaleOn = true;
    g.cam.focus = g.above(throne, 2);
    sfx('fanfare');
    g.sparks.burst(g.above(throne, 2.4), '#bff4ff', 60, 5);
    const whole = g.speech.line('sea_pearl_whole', 'story');
    await new Promise<void>((done) => { finaleLeft = 2; finaleEnd = done; });
    ws.final = true; g.persist();
    await whole;
    // the queen's song of a sea that sings again (her arms open to it), then the cat's last words
    const queen = npc('khvylia').actor;
    if (queen.has('Sing')) queen.play('Sing');
    await g.speech.line('khvylia_song', 'story', 0, '🧜‍♀️');
    if (queen.has('Idle')) queen.play('Idle');
    await g.speech.line('sea_final_text', 'story');
    finaleOn = false; g.cam.focus = null;
  }).then(() => playStory(g, 'story_pearl')).then(() => g.speech.line('sea_free', 'hint', 6000));
  const cabinPearl = pearls.find((p) => p.how === 'act')!;
  let swamFrom: THREE.Vector3 | null = null, swum = 0, quiet = 0;   // where she was a frame ago; m swum since the cat spoke of his bubble
  const cabin = point(CABIN);

  return {
    frame: {
      spots: [
        // the secrets' first: where one's reach meets a character's or the cabin's, theirs is the button
        ...secrets.spots,
        ...npcs.map((n): Spot => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void dialogue.talk(n); } })),
        { pos: cabin, r: CABIN_R, label: 'sea_cabin', on: () => waiting(cabinPearl), run: () => take(cabinPearl) },
        { pos: throne, r: THRONE_R, label: 'place', on: () => !finaleItem.done() && ready(finaleItem, all), run: () => { void restore(); } },
      ],
      tap: (screenDist) => player.tap(screenDist) || corals.tap(screenDist) || secrets.tap(screenDist) || creatures.tap(screenDist),
      afterMove: (time, grounded) => gear.update(time, grounded),
      update: (dt, time, canMove) => {
        const hp = hero.root.position;
        for (const n of npcs) {
          n.actor.face(Math.hypot(n.pos.x - hp.x, n.pos.z - hp.z) < 7 ? Math.atan2(hp.x - n.pos.x, hp.z - n.pos.z) : n.def.heading, dt, 3);
          n.mark.visible = !finished(n) && !g.busy;
          n.mark.rotation.y = time * 2;
          const f = FIGURE[n.def.id];
          // over the model's head (MODELS: its height in the world, larger than its grey figure's since 2026-11-24)
          n.mark.position.set(n.pos.x, n.pos.y + Math.max(1.4, (f.lift ?? 0) + (MODELS[n.def.id] ?? f.h) + 0.7) + Math.sin(time * 2.5) * 0.15, n.pos.z);
          n.actor.update(dt);
        }
        for (const p of pearls) {
          p.mesh.visible = waiting(p);
          if (!p.mesh.visible) continue;
          p.mesh.position.y = groundY(p.at.x, p.at.z) + 1 + Math.sin(time * 2) * 0.12;
          if (p.how === 'walk' && canMove && Math.hypot(hp.x - p.at.x, hp.z - p.at.z) < TAKE_R) take(p);
        }
        // the way she swims herself: frame by frame, a jump of the walkthrough or a teleport (over 1 m a frame) not counted
        const step = swamFrom ? Math.hypot(hp.x - swamFrom.x, hp.z - swamFrom.z) : 0;
        if (canMove && !player.open && step < 1) swum += step;
        (swamFrom ??= new THREE.Vector3()).copy(hp);
        lock.update(dt, canMove);
        corals.update(dt, time, canMove);
        secrets.update(dt, time, canMove);
        // the cat's words of the first visit (ONCE): only while she is free and nobody speaks, so no line is cut
        // and never while a task in the world is open: closing one must leave the save as it was
        // and only after QUIET s of game time free so: never in the moment a task or a talk has just ended or begins
        quiet = canMove && !g.busy && !player.open && !speaking() && ws.flags[TOUR] === true && flyoverOf(g)?.active !== true ? quiet + dt : 0;
        if (quiet > QUIET) {
          const once = (flag: string, key: 'sea_cat_bubble' | 'sea_swim_first' | 'sea_cat_wet') => { ws.flags[flag] = true; g.persist(); quiet = 0; void g.speech.line(key, 'hint', 5000); };
          if (!ws.flags[ONCE.bubble]) { once(ONCE.bubble, 'sea_cat_bubble'); swum = 0; }
          else if (!ws.flags[ONCE.swim] && swum > SWIM_SAID_AT) once(ONCE.swim, 'sea_swim_first');
          else if (!ws.flags[ONCE.wet] && npcs.some(finished)) once(ONCE.wet, 'sea_cat_wet');
        }
        if (finaleEnd && (finaleLeft -= dt) <= 0) { const done = finaleEnd; finaleEnd = null; done(); }
        pearlOfDeep.visible = ws.final;
        // the throne's lid opens under the pearl in the finale's seconds and stays open
        floor.throne.open(ws.final || lidShown ? 1 : finaleEnd ? 1 - finaleLeft / 2 : 0);
        chest.update(dt);
        creatures.update(dt);
        magic.update(dt);
        pearlOfDeep.rotation.y = time;
      },
      goal: () => {
        const l = lock.goal() ?? corals.goal();
        if (l) return l;
        const p = pearls.find(waiting);
        if (p) return p.mesh.position;
        const n = npcs.find((x) => !finished(x));
        if (n) return n.pos;
        return finaleItem.done() ? null : throne;
      },
      animate: (_dt, time) => { flies.update(time); shafts.sway(time); floor.sway(time); bubbles.update(time); player.update(time); },
      focusDist: () => 6.5,
      beforeRender: (hp) => {
        sky.sun.position.copy(hp).add(sky.sunOffset); sky.sun.target.position.copy(hp);
      },
    },
    debug: {
      npcs,
      // the tour as the first world's: played without a mark, its points with the moment each is passed, its player
      more: { flyoverPlayer: flyover, flyover: () => { void tour(g, { record: false }); }, flyoverPoints: SEA_FLYOVER.points.map((p, i) => ({ ...p, t: flyover.times[i] })),
        // the map as the measurements of the grey build read it (tools/sea-grey.mjs): its stretch, zones, ways, landmarks
        seaMap: { scale: SCALE, zones: ZONES, paths: PATHS, landmarks: LANDMARKS, route: ROUTE, swim: SWIM_HEIGHT, ground: (x: number, z: number) => groundY(x, z) },
        bubbles: () => ({ cat: waterOf(g)?.catBubble.visible === true }),
        // the gate as the solved shell lock leaves it - its doors sunk into the floor (tools/sea-grey.mjs looks at the throne so)
        openGate: () => lock.opened(true),
        // the throne's lid as the finale leaves it (the pictures of the landmarks)
        openThrone: () => { lidShown = true; },
        // the creatures of no task (kind, state, position, taps), the middle of one's body over its point, one held still
        creatures: creatures.herd.all,
        creatureBody: (i: number) => creatures.bodyOf(creatures.herd.all[i]),
        holdCreature: (i: number, at: [number, number, number] | null) => creatures.herd.hold(creatures.herd.all[i], at && new THREE.Vector3(...at)),
        // the cut-scenes' player (./story.ts): the tools skip a scene on the way (tools/sea-grey.mjs)
        story,
        // the magic of the sea (WORLD-09): `magic.value` shown, `magic.target` the save's; setMagic(v) shows v at once, null the save's
        magic, setMagic: (v: number | null) => magic.set(v),
        // the secrets (./secrets.ts): where each is found and its things, for their pictures and their draw calls
        seaSecrets: { at: secrets.at, ...secrets.debug },
        // a clip of the heroine held at her swimming height (tools/sea-grey.mjs pictures her talking and dancing in the
        // water): the game is busy meanwhile, as in a conversation, so her own moving does not take it back; null lets go
        pose: (clip: string | null) => { g.busy = clip !== null; if (clip) hero.play(clip, 0.2); } },
      talk: (id) => { void dialogue.talk(npc(id)); },
      // a pearl waiting in the world: the heroine is put on it (walk) or it is taken (act) - the walkthrough's way to `part`
      cheatWorld: () => {
        if (worldTaskDoor(g).solve()) return 'world task';
        if (lock.cheat()) return 'lock';
        if (corals.cheat()) return 'corals';
        const s = secrets.cheat();
        if (s) return s;
        const p = pearls.find(waiting);
        if (!p) return '';
        if (p.how === 'act') { take(p); return 'part'; }
        hero.root.position.set(p.at.x, groundY(p.at.x, p.at.z) + SWIM_HEIGHT, p.at.z);
        return 'part';
      },
    },
    book: {
      parts: () => npcs.map((n) => ({ color: n.def.shard, icon: n.def.emoji, got: finished(n) })),
      stats: () => [{ icon: '⭐', label: 'col_stars', value: String(save.stars) }],
    },
    lines: LINES,
    hud: () => `${npcs.filter(finished).length}/${npcs.length}`,
    gear,
    items: () => own,
    glimmer: () => secrets.glimmer(),
  };
}

/** The Underwater Kingdom, the grey build: listed in src/worlds/index.ts for `--mode grey` only. */
export const sea: WorldDef<SeaLoads, WorldSky> = {
  id: 'sea',
  shelf: 2,
  spawn: SPAWN,
  ground,
  characters: FRIENDS,
  strings,
  music: MUSIC,
  move: { kind: 'swim', height: SWIM_HEIGHT },
  worldTasks: [LOCK, HALF_STEP],
  collect: COLLECT,                  // shells and coral twigs (PLAY-25, ./collect.ts)
  daily: { places: DAILY_PLACES },   // the find of the day (PLAY-26)
  // PLAY-07: the four secrets (./secrets.ts); the hold's chest is the world's chest (PLAY-08)
  secrets: SEA_SECRETS,
  chest: CHEST_FLAG,
  // PLAY-09: Bulchik, behind the great shell of the garden once Bulk's chain is done and he has asked for him
  pet: { species: 'bulchik', at: BULCHIK, after: 'bulk', found: 'sea_pet_found', follow: 'sea_pet_follow' },
  sky: buildSky,
  load: loadSea,
  build: buildSea,
};
