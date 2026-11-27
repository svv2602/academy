import * as THREE from 'three';
import { rig, type Rig } from '../../core/assets';
import { setCast, sfx, speaking } from '../../core/audio';
import { worldClips } from '../../core/voice';
import type { Save } from '../../core/save';
import { Actor } from '../../game/actor';
import { talkSpot } from '../../game/talk-spot';
import { loadFailed } from '../../game/boot';
import { createStage, type Game } from '../../game/context';
import { declared, finaleWaits, marked, ready } from '../../game/describe';
import { createDialogue } from '../../game/dialogue';
import { flyoverOf, setTour, tour } from '../../game/flyover';
import { createGear } from '../../game/gear';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { playScene } from '../../game/stage';
import { loadOwnPets } from '../../game/pets';
import { playStory, setStories } from '../../game/story';
import type { BuiltWorld, CharacterDef, MusicParams, Npc, WorldDef, WorldItem, WorldLines, WorldSky, WorldTask } from '../../game/world';
import { worldTaskDoor } from '../../game/worldtasks/core';
import { worldTaskPlayer, worldTaskProblems } from '../../game/worldtasks/play';
import { SWEET_FLYOVER } from './flyover-path';
import { DOORWAY, HOUSE_STEP, createHouse } from './house';
import { SCALES_STEP, createScales } from './scales';
import { BRIDGE_STEP, createBridge } from './bridge';
import { arriveFrom, createHubWay } from './hub-way';
import { COLLECT, DAILY_PLACES } from './collect';
import { BRIDGE, CAVE, EASEL, HALF, HOUSE_DOOR, LANDMARKS, MILLSTONE, PATHS, RIVER, ROUTE, SCALE, SHRINE, SPAWN, ZONES } from './layout';
import { buildScenery } from './scenery';
import { strings } from './strings';
import { SWEET_STORIES } from './story';
import { voices } from './voices';
import CLIPS from './clips.json';
import { buildGround, colliders, ground } from './terrain';
import { createSweetCreatures } from './creatures';
import { createSweetMagic } from './magic';
import { CAVE_FLAG, CHEST_FLAG, ROOM_FLAG, SECRET_HOW, SWEET_SECRETS, createSweetSecrets } from './secrets';
import { caveOf, createChocoCave } from './cave';
import { createSweetRoom, roomOf } from './room';

/**
 * The Sweet Land (WORLD-04), its grey build (WORLD-12), step 1: the map of docs/worlds/world-4.md in simple shapes at
 * their real sizes, stretched by one number (./layout.ts SCALE, `?scale=`), the cake palace and the mill as its
 * landmarks (./landmarks.ts), its five characters as figures of their height with their chains of tasks the game
 * already has, the two rubies that lie in the world, its four secrets (./secrets.ts), the finale at the cake, the tour
 * and the arch back to the Great Tree (./hub-way.ts). It loads no file and speaks no line of its own: the conversations say the shared recorded lines,
 * as the forest's grey build did. The registry lists it only in a build made with `--mode grey` (src/worlds/index.ts):
 * the published game does not change. What the measurements of the grey build read: tools/sweet-grey.mjs.
 */

/**
 * The characters (docs/worlds/world-4.md, the table «Персонажи»). Of the three tasks the document plays in the world,
 * the gingerbread house (WORLD-21, written to no skill) is played in the world since step 2: Imbir's third step, the
 * house assembled before his house (./house.ts). The scales with candies (WORLD-22, written to `compare`) are played in
 * the world since step 3: Tyanuchka's third step, at his scales on the market (./scales.ts). The shape bridge (WORLD-20,
 * written to `classify`) is played in the world since step 4: Kakao's first step, at the river by the bridge
 * (./bridge.ts). `part`: the ruby is not handed over - the character says where it lies (inside the gingerbread house, in
 * the millstone; WORLD-08), and she takes it there by the action button (RUBIES); ruby 2 is seen in the doorway once the
 * house is assembled and its door opens.
 */
export const FRIENDS: readonly CharacterDef[] = [
  { id: 'pastila', emoji: '🧁', x: ZONES.square.x + 2.5, z: ZONES.square.z - 3, heading: 0.06, steps: ['add', 'compose', 'compare'], shard: '#ff4d6d',
    hi: 'pastila_hi', asks: ['pastila_t1', 'pastila_t2', 'pastila_t3'], thanks: 'pastila_done', again: ['pastila_again_1', 'pastila_again_2'] },
  { id: 'imbir', emoji: '🍪', x: ZONES.town.x - 2.5, z: ZONES.town.z - 1, heading: 1.3, steps: ['count', 'pattern', HOUSE_STEP, 'part'], shard: '#e8364f',
    hi: 'imbir_hi', asks: ['imbir_t1', 'imbir_t2', 'imbir_t3', null], thanks: 'imbir_done', again: ['imbir_again_1', 'imbir_again_2'] },
  { id: 'tyanuchka', emoji: '🍬', x: ZONES.market.x - 1.5, z: ZONES.market.z + 2.5, heading: 2.6, steps: ['sub', 'sort', SCALES_STEP], shard: '#ff6b8a',
    hi: 'tyanuchka_hi', asks: ['tyanuchka_t1', 'tyanuchka_t2', 'tyanuchka_t3'], thanks: 'tyanuchka_done', again: ['tyanuchka_again_1', 'tyanuchka_again_2'],
    after: 'tyanuchka_pet_ask' },
  { id: 'kakao', emoji: '🍫', x: ZONES.mill.x - 3, z: ZONES.mill.z - 3, heading: 0.785, steps: [BRIDGE_STEP, 'simon', 'signs', 'part'], shard: '#d62e5c',
    hi: 'kakao_hi', asks: ['kakao_t1', 'kakao_t2', 'kakao_t3', null], thanks: 'kakao_done', again: ['kakao_again_1', 'kakao_again_2'] },
  { id: 'polosatik', emoji: '🍭', x: ZONES.garden.x - 2, z: ZONES.garden.z - 1.5, heading: 0.5, steps: ['pairs', 'neighbors', 'add'], shard: '#ff8fa3',
    hi: 'polosatik_hi', asks: ['polosatik_t1', 'polosatik_t2', 'polosatik_t3'], thanks: 'polosatik_done', again: ['polosatik_again_1', 'polosatik_again_2'] },
];

/**
 * The steps that become tasks in the world in a later step of the grey build, each standing in now as the panel task
 * of the same skill: whose chain, the number of the step, its stand-in, the card of the task in the world and its
 * skill. Played in the world, the step's id becomes the task's own (the world's `tasks` and `worldTasks`), as the
 * gingerbread house (WORLD-21) replaced the number house that stood in for it in step 1, the scales (WORLD-22) the
 * panel's comparing in step 3 and the shape bridge (WORLD-20) the odd one out in step 4. None is left: all three tasks
 * the document plays in the world are played there; the list stays for a world's step that would stand one in again.
 */
export const LATER_IN_WORLD: readonly { owner: string; step: number; now: string; card: string; skill: string }[] = [];

/** The shape of each character in the grey build: its height (the customer's, by the heroine's 1.53 m, 2026-11-24), its colour, the mark of its kind on its top. */
const FIGURE: Record<string, { h: number; r: number; color: string; top: string }> = {
  pastila: { h: 1.7, r: 0.3, color: '#f7a8c8', top: '#ffffff' },       // the fairy confectioner: her white cap
  imbir: { h: 1.1, r: 0.3, color: '#b8763c', top: '#fffaf2' },         // the gingerbread man: his icing
  tyanuchka: { h: 1.85, r: 0.5, color: '#6fd06a', top: '#ffd84a' },     // the marmalade strongman: wide, green and yellow
  kakao: { h: 1.75, r: 0.32, color: '#6b4226', top: '#f5e6c8' },       // the old miller: chocolate, his flour-white hat
  polosatik: { h: 1.0, r: 0.18, color: '#e8364f', top: '#fffaf2' },    // the little candy-cane watchman
};

/**
 * The rubies that lie in the world (WORLD-08): whose chain says where, the flag of the ruby taken (the id of its item),
 * where it is seen (`spot`, `lift` m over the ground), where it is taken and the label of its action. Ruby 2 is seen in
 * the doorway of Imbir's house once the house is assembled and its door has opened (WORLD-21, ./house.ts), and taken
 * by the action before the door; ruby 4 is taken by the action at the millstone (in the step of WORLD-08 the action
 * there turns the millstone open). `found`: the cat names it, then its character thanks (as the sea's pearls).
 */
export const RUBIES = [
  { owner: 'imbir', flag: 'ruby_house', hint: 'imbir_hint', spot: DOORWAY, lift: 0.75, at: HOUSE_DOOR, label: 'sweet_house', found: 'sweet_ruby_house_found' },
  { owner: 'kakao', flag: 'ruby_mill', hint: 'kakao_hint', spot: MILLSTONE, lift: 1.4, at: { x: MILLSTONE.x, z: MILLSTONE.z + 1.6 }, label: 'sweet_millstone', found: 'sweet_ruby_mill_found' },
] as const;
export const FINALE = 'final';
const TOUR = 'toured';
/** m: the action spot of a ruby's place; the shrine's. */
const RUBY_R = 2.6, SHRINE_R = 3;
/** rad/s: the mill's wings turn all the time (by code, docs/worlds/world-4.md); the carousel turns with the magic (./magic.ts). */
export const WINGS_TURN = 0.35;
/**
 * The cat's words of the land waking (docs/worlds/world-4.md «Мир оживает»): at the 1st, 3rd and 5th ruby back, each
 * once (the flag `told_magic_<n>`), said only when she is free and nobody speaks for QUIET s of game time - never over a
 * character's thanks; rubies already back when the world is built are not told again.
 */
const MAGIC_LINES = { 1: 'sweet_magic_1', 3: 'sweet_magic_3', 5: 'sweet_magic_5' } as const;
const QUIET = 2;
/** s of game time the five rubies fly up to the candle in the finale. */
const GATHER_S = 2;

const LINES: WorldLines = { partGiven: 'npc_next', allParts: 'sweet_all_rubies', partTitle: 'sweet_part', partText: 'sweet_count' };
/** A bright major mode of G, quick (the grey build's own; VOICE-12 later gives the world its own). */
const MUSIC: MusicParams = {
  scale: [392, 440, 493.9, 523.3, 587.3, 659.3, 740],
  chords: [[196, 246.9, 392], [130.8, 196, 329.6], [146.8, 220, 370]],
};

/** The sky of the Sweet Land: pastel pink over a pink-blue haze at the edges (docs/worlds/world-4.md «Край мира»). */
export const SKY = { background: '#ffd6ea', haze: '#e6dcff', sun: '#fff3e6', sunPower: 2.4, skyLight: '#fff0f6', groundLight: '#e8c8a8', hemiPower: 1.5 };
function buildSky(scene: THREE.Scene): WorldSky {
  scene.background = new THREE.Color(SKY.background);
  scene.fog = new THREE.Fog(SKY.haze, HALF * 0.9, HALF * 2.4);
  const sun = new THREE.DirectionalLight(SKY.sun, SKY.sunPower);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  const cam = sun.shadow.camera;
  cam.left = -26; cam.right = 26; cam.top = 26; cam.bottom = -26; cam.near = 1; cam.far = 120;
  scene.add(new THREE.HemisphereLight(SKY.skyLight, SKY.groundLight, SKY.hemiPower), sun, sun.target);
  return { sun, sunOffset: new THREE.Vector3(-20, 34, 16) };
}

/**
 * The characters' models (the lead's decisions of 2026-11-24 on the customer's word; CREDITS.md): Pastila, Imbir,
 * Tyanuchka and Kakao from Meshy, Polosatik made whole in Blender by code (Meshy's two tries were no candy cane). The
 * world's own files (models/sweet/, TECH-09), by their height in metres - their figures' (FIGURE); their skeletons and
 * clips our own: Idle, Talk, and Cheer for the finale (Pastila claps, Imbir jumps, Tyanuchka shows his strength, Kakao
 * waves, Polosatik salutes).
 */
export const MODELS: Readonly<Record<string, number>> = Object.fromEntries(FRIENDS.map((f) => [f.id, FIGURE[f.id].h]));

/**
 * Zheleyka, Tyanuchka's little one (world-4.md «Питомец мира», PLAY-09): once Tyanuchka's chain is done and he has asked
 * for him, he hides between the lollipops of the candy garden, behind its tallest one from the ways - a free spot off
 * every collider, the trees, the bears and the leaves (./pet.test.ts); walking up to him finds him and he hops after
 * her. His model is his big brother's, loaded as a pet's (src/game/pets.ts `loadOwnPets`).
 */
export const ZHELEYKA = { x: ZONES.garden.x - 5, z: ZONES.garden.z - 6.5 };

/** The files of the grey build: the characters' models (the heroine and the cat are the game's). Null = failed (TECH-08). */
async function loadSweet(_scene: THREE.Scene, _save: Save, _touch: boolean, scope: WorldScope): Promise<{ rigs: Record<string, Rig> } | null> {
  const [rigs] = await Promise.all([
    Promise.all(Object.entries(MODELS).map(async ([id, h]) => [id, await rig(`sweet/${id}`, h)] as const))
      .then((e) => Object.fromEntries(e) as Record<string, Rig>),
    // Zheleyka, the pet of the Sweet Land: his brother's model, loaded as a pet's (src/game/pets.ts); missing, he stays at home
    loadOwnPets('sweet', ['zheleyka'], scope),
  ]).catch((e: unknown) => { loadFailed(e); return [null] as const; });
  return rigs ? { rigs } : null;
}
type SweetLoads = NonNullable<Awaited<ReturnType<typeof loadSweet>>>;

/** A character of the grey build: a figure of its height and colour on a rig with no clips (Actor plays none). */
function figure(id: string): Rig {
  const f = FIGURE[id], root = new THREE.Group(), model = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(f.r, Math.max(0.01, f.h - f.r * 2), 4, 10), new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.8 }));
  body.position.y = f.h / 2; body.castShadow = true;
  const top = new THREE.Mesh(new THREE.SphereGeometry(f.r * 0.7, 10, 8), new THREE.MeshStandardMaterial({ color: f.top, roughness: 0.5 }));
  top.position.y = f.h + f.r * 0.3;
  model.add(body, top);
  root.add(model);
  return { root, model, clips: new Map() };
}

/** A ruby-lollipop: a red gem on a short white stick (the parts in the world, the five of the finale). */
function rubyMesh(color: string): THREE.Group {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.2 }));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: '#fffaf2', roughness: 0.6 }));
  g.add(gem, stick);
  return g;
}

function buildSweet(g: Game, L: SweetLoads, sky: WorldSky, scope: WorldScope): BuiltWorld {
  const { scene, hero, save, ws, flies, groundY } = g;
  // The colliders are one list of the module: the world empties it as it is left, a second entry starts from none.
  scope.own(() => { colliders.length = 0; });
  // its own voice (TECH-09): each character with its voice, the clips of voice/sweet/ while the world is played
  setCast(voices);
  scope.own(() => setCast({ narrator: '', cast: {} }));
  scope.own(worldClips('sweet', CLIPS));
  scene.add(buildGround(160));
  const scenery = buildScenery(scene);
  // the arch back to the Great Tree on the square (./hub-way.ts): she comes out of it from the hub
  const hubWay = createHubWay(g);
  const gear = createGear(g.heroRig, g.heroRig.gear, [], g.sparks);
  const point = (p: { x: number; z: number }, y = 0) => new THREE.Vector3(p.x, groundY(p.x, p.z) + y, p.z);

  const starMat = new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb300', emissiveIntensity: 1.1, roughness: 0.3 });
  const markGeo = new THREE.OctahedronGeometry(0.22);
  const npcs: Npc[] = FRIENDS.map((def) => {
    const actor = new Actor(L.rigs[def.id] ?? figure(def.id));
    const pos = point(def);
    actor.root.position.copy(pos); actor.heading = def.heading; actor.root.rotation.y = def.heading;
    g.ground.block(def.x, def.z, FIGURE[def.id].r + 0.3);
    const mark = new THREE.Mesh(markGeo, starMat);
    scene.add(actor.root, mark);
    return { def, actor, pos, mark, idle: 'Idle', timer: 0 };
  });
  const finished = (n: Npc) => (ws.quests[n.def.id] ?? 0) >= n.def.steps.length;
  const back = () => FRIENDS.filter((c) => (ws.quests[c.id] ?? 0) >= c.steps.length).length;
  const toldFlag = (n: number) => `told_magic_${n}`;
  // the rubies back at the entry are told already (an old save hears nothing of what happened before)
  for (const n of Object.keys(MAGIC_LINES).map(Number)) if (n <= back()) ws.flags[toldFlag(n)] = true;
  let quiet = 0;
  // the creatures of no task (PLAY-11, PLAY-12): gummy bears, caramel butterflies, gingerbread birds, dragee ladybugs;
  // after the scenery and the characters, whose colliders they keep clear of
  const creatures = createSweetCreatures(g, scope);
  // the secrets (PLAY-07, ./secrets.ts): the candy box, the cotton cloud, the lemonade fountain, the gum machine; after the
  // creatures, whose places they keep as they were, before the magic, whose paint they take
  const secrets = createSweetSecrets(g, scope);
  // the secret places (plan sweet-secrets-2026-11-27): the cave behind the chocolate waterfall at the river's end, and
  // Imbir's room behind his house's door once ruby 2 is taken from its doorway (as the sea's hold behind the cabin)
  const cave = createChocoCave(g, scope, (at) => secrets.take(CAVE_FLAG, at));
  const room = createSweetRoom(g, scope, {
    door: new THREE.Vector3(HOUSE_DOOR.x, groundY(HOUSE_DOOR.x, HOUSE_DOOR.z), HOUSE_DOOR.z), facing: Math.PI / 2,
    open: () => ws.flags.ruby_house === true,
    jar: { label: 'open', on: () => ws.flags[ROOM_FLAG] !== true, run: () => secrets.take(ROOM_FLAG, room.jarAt) },
  });
  // the magic of the Sweet Land (WORLD-09): from the rubies in the save; after the scenery, the characters and the creatures it touches
  const magic = createSweetMagic(g, scope, { sky, scenery, characters: FRIENDS, dancers: npcs.map((n) => n.actor.model), creatures });
  const npc = (id: string) => npcs.find((n) => n.def.id === id)!;
  /** The flag that Imbir has asked her into his room (once). */
  const INVITED = 'heard_room';

  // ----- the rubies that lie in the world (WORLD-08): the step `part` of Imbir's and Kakao's chains -----
  const rubies = RUBIES.map((r) => {
    const def = FRIENDS.find((c) => c.id === r.owner)!;
    const mesh = rubyMesh(def.shard);
    mesh.position.copy(point(r.spot, r.lift)); mesh.visible = false;
    scene.add(mesh);
    return { ...r, mesh, step: def.steps.indexOf('part') };
  });
  type Ruby = (typeof rubies)[number];
  const waiting = (r: Ruby) => ws.flags[r.hint] === true && (ws.quests[r.owner] ?? 0) === r.step;
  let stepDone: (n: Npc, k: number) => void = () => {};
  const take = (r: Ruby) => {
    ws.flags[r.flag] = true; r.mesh.visible = false;
    sfx('chime'); g.sparks.burst(r.mesh.position, '#ffd0dc', 36, 3);
    // the cat names the ruby found, then the chain moves on and its character thanks
    void g.speech.line(r.found, 'story').then(() => stepDone(npc(r.owner), r.step));
  };
  const part: WorldTask = {
    skill: 'count',     // a step of no skill: the conversation reads the skill of a task it runs, never of this one
    start: (n) => { const r = rubies.find((x) => x.owner === n.def.id); if (r) { ws.flags[r.hint] = true; g.persist(); } },
    active: () => rubies.some(waiting),
    owner: () => rubies.find(waiting)?.owner ?? null,
  };

  const stage = createStage(g, () => g.speech.caption(null));
  // The tasks played in the world (PLAY-01): opened in their frame by the shared player, their taps and time from below.
  const player = worldTaskPlayer(g, scope);
  // Imbir's gingerbread house (WORLD-21): he asks, the heroine walks to his house, the assembly opens before it; once
  // assembled its door opens and ruby 2 is seen inside - the step `part` of his chain is on at once, no talk needed
  const imbir = FRIENDS.find((c) => c.id === 'imbir')!;
  const house = createHouse(g, player, scope, { inside: () => { ws.flags.imbir_hint = true; g.persist(); } });
  scope.own(() => house.dispose());
  house.opened((ws.quests.imbir ?? 0) > imbir.steps.indexOf(HOUSE_STEP));
  // Tyanuchka's scales with candies (WORLD-22): a task in the foreground at his scales on the market, recorded in
  // `compare` by the conversation as a panel task is
  const scales = createScales(g, player, scope);
  scope.own(() => scales.dispose());
  // Kakao's shape bridge (WORLD-20): he asks, the heroine walks to the river by the bridge, the task opens on the bank;
  // its result is handed to the conversation, which records it in `classify` as a panel task; the river stays crossable
  // by the bridge all along (./bridge.ts)
  const kakao = FRIENDS.find((c) => c.id === 'kakao')!;
  const bridge = createBridge(g, player, scope);
  scope.own(() => bridge.dispose());
  bridge.opened((ws.quests.kakao ?? 0) > kakao.steps.indexOf(BRIDGE_STEP));
  // The tasks of the chains: the panel ones by the shared conversation; `part`, the house, the scales and the bridge here.
  // A task in the world of a later step (LATER_IN_WORLD) would join this record under its own id, with `worldTasks`.
  const tasks: Record<string, WorldTask> = { part, [HOUSE_STEP]: house, [SCALES_STEP]: scales, [BRIDGE_STEP]: bridge };
  const wrongTasks = worldTaskProblems(sweet.worldTasks, tasks);
  if (wrongTasks.length) throw new Error(`the Sweet Land: ${wrongTasks.join('; ')}`);
  const dialogue = createDialogue(g, stage, { characters: FRIENDS, lines: LINES, tasks });
  stepDone = dialogue.stepDone;

  // ----- the cut-scenes, the tour, the finale -----
  // the cut-scenes (WORLD-13, ./story.ts): the way in at the first entry (src/game/start.ts enterWorld), the Ruby after the finale
  const story = setStories(g, SWEET_STORIES, scope);
  const flyover = setTour(g, { path: SWEET_FLYOVER, visited: () => ws.flags[TOUR] === true, mark: () => { ws.flags[TOUR] = true; g.persist(); } });
  const shrine = point(SHRINE);
  // the five rubies of the finale: they fly from the shrine up to the top of the candle and come together there
  const five = FRIENDS.map((f) => { const m = rubyMesh(f.shard); m.visible = false; scene.add(m); return m; });
  const whole = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: '#ff3b6b', emissive: '#ff5c8a', emissiveIntensity: 0.9, roughness: 0.15 }));
  whole.position.copy(scenery.candleTop).setY(scenery.candleTop.y + 1.2);
  whole.name = 'ruby-of-joy';
  scene.add(whole);
  // the finale's few seconds run in game time, counted down by the frame (update below)
  let finaleOn = false, finaleLeft = 0, finaleEnd: (() => void) | null = null;
  const tourItem = marked(ws, { kind: 'flyover', id: TOUR, how: 'auto', active: () => flyoverOf(g)?.active === true });
  const rubyItems = RUBIES.map((r) => marked(ws, { kind: 'part', id: r.flag, how: 'act', at: { x: r.at.x, z: r.at.z } }));
  // the finale waits for the chains, the tour and the rubies; the pet (Zheleyka) is the child's own, never needed
  const before = [...declared(g).filter(finaleWaits), tourItem, ...rubyItems];
  const finaleItem = marked(ws, { kind: 'finale', id: FINALE, how: 'act', at: { ...SHRINE }, after: before.map((i) => i.id), active: () => finaleOn });
  const all = [...before, finaleItem];
  // the secrets are the child's own, never needed by the finale
  // Imbir's room opens with ruby 2: its find comes after that ruby
  const secretItems = SWEET_SECRETS.map((id) => marked(ws, { kind: 'secret', id, how: SECRET_HOW[id], at: secrets.at[id], ...(id === ROOM_FLAG ? { after: ['ruby_house'] } : {}), active: () => secrets.active(id) }));
  // a scene goes on frame by frame with a tap (src/game/story.ts): the child's taps, the walkthrough's too
  const sceneOn = (id: string) => () => story.active && story.id === id;
  const introItem = marked(ws, { kind: 'scene', id: 'story_intro', how: 'tap', active: sceneOn('story_intro') });
  const rubyStoryItem = marked(ws, { kind: 'scene', id: 'story_ruby', how: 'tap', after: [FINALE], active: sceneOn('story_ruby') });
  const own: readonly WorldItem[] = [introItem, tourItem, ...rubyItems, ...secretItems, finaleItem, rubyStoryItem];
  const CONFETTI = ['#ff8fb1', '#ffd84a', '#7bd36a', '#a8e4ff', '#ffffff'];
  const restore = () => playScene(stage, 'sweet finale', async () => {
    finaleOn = true;
    g.cam.focus = g.above(shrine, 6);
    sfx('fanfare');
    five.forEach((m) => { m.visible = true; });
    const whole = g.speech.line('sweet_ruby_whole', 'story');
    await new Promise<void>((done) => { finaleLeft = GATHER_S; finaleEnd = done; });
    // the Ruby whole on the candle: the candle lights, the magic comes to 1 (the carousel at its fastest), confetti of sugar powder from the sky
    five.forEach((m) => { m.visible = false; });
    ws.final = true; g.persist();
    for (const [i, c] of CONFETTI.entries()) g.sparks.burst(g.above(shrine, 5 + i), c, 40, 6);
    g.sparks.burst(scenery.candleTop.clone(), '#ffd27a', 50, 3);
    // the five are glad of a land that laughs again (each its clip of the finale), then stand as before
    await whole;
    for (const n of npcs) if (n.actor.has('Cheer') && n.actor.has('Idle')) n.actor.once('Cheer', 'Idle');
    // Pastila thanks the Keeper for all of them, then the cat's last words
    await g.speech.line('pastila_cheer', 'story', 0, '🧁');
    await g.speech.line('sweet_final_text', 'story');
    finaleOn = false; g.cam.focus = null;
  }).then(() => playStory(g, 'story_ruby')).then(() => g.speech.line('sweet_free', 'hint', 6000));
  const rubySpots = rubies.map((r): Spot => ({ pos: point(r.spot), r: RUBY_R, label: r.label, on: () => waiting(r), run: () => take(r) }));

  return {
    frame: {
      spots: [
        // the secrets' first: where one's reach meets a character's, the character's is the button (the last in reach)
        ...room.spots,
        ...secrets.spots,
        ...npcs.map((n) => talkSpot(n, () => finished(n), () => { void dialogue.talk(n); })),
        ...rubySpots,
        { pos: shrine, r: SHRINE_R, label: 'place', on: () => !finaleItem.done() && ready(finaleItem, all), run: () => { void restore(); } },
        hubWay.spot,
      ],
      tap: (screenDist) => player.tap(screenDist) || creatures.tap(screenDist),
      afterMove: (time, grounded) => gear.update(time, grounded),
      update: (dt, time, canMove) => {
        const hp = hero.root.position;
        for (const n of npcs) {
          n.actor.face(Math.hypot(n.pos.x - hp.x, n.pos.z - hp.z) < 7 ? Math.atan2(hp.x - n.pos.x, hp.z - n.pos.z) : n.def.heading, dt, 3);
          n.mark.visible = !finished(n) && !g.busy;
          n.mark.rotation.y = time * 2;
          n.mark.position.set(n.pos.x, n.pos.y + Math.max(1.4, FIGURE[n.def.id].h + 0.7) + Math.sin(time * 2.5) * 0.15, n.pos.z);
          n.actor.update(dt);
        }
        for (const r of rubies) {
          r.mesh.visible = waiting(r);
          if (r.mesh.visible) { r.mesh.rotation.y = time * 1.6; r.mesh.position.y = groundY(r.spot.x, r.spot.z) + r.lift + Math.sin(time * 2) * 0.12; }
        }
        house.update(dt, time, canMove);
        scales.update(dt, time);
        bridge.update(dt, time, canMove);
        secrets.update(dt, time, canMove);
        cave.update(time);
        room.update();
        // Imbir asks her in once his door leads into the room: the first time she comes near it free
        if (ws.flags.ruby_house === true && ws.flags[INVITED] !== true && canMove && !speaking()
          && Math.hypot(hp.x - HOUSE_DOOR.x, hp.z - HOUSE_DOOR.z) < 4) { ws.flags[INVITED] = true; g.persist(); void g.speech.line('imbir_room', 'hint', 5000); }
        // the land waking, told by the cat at the 1st, 3rd and 5th ruby (MAGIC_LINES), in a quiet moment
        quiet = canMove && !g.busy && !player.open && !speaking() ? quiet + dt : 0;
        if (quiet > QUIET) {
          const n = Object.keys(MAGIC_LINES).map(Number).find((k) => k <= back() && !ws.flags[toldFlag(k)]);
          if (n !== undefined) { ws.flags[toldFlag(n)] = true; g.persist(); quiet = 0; void g.speech.line(MAGIC_LINES[n as keyof typeof MAGIC_LINES], 'story'); }
        }
        // the finale: the five fly up from round the shrine to the candle's top over GATHER_S s of game time
        if (finaleEnd) {
          const k = 1 - Math.max(0, finaleLeft) / GATHER_S, top = scenery.candleTop;
          five.forEach((m, i) => {
            const a = (i / five.length) * Math.PI * 2 + k * 3;
            const r = 2.5 * (1 - k);
            m.position.set(shrine.x + (top.x - shrine.x) * k + Math.sin(a) * r, shrine.y + 1.5 + (top.y - shrine.y - 1.5) * k * k, shrine.z + (top.z - shrine.z) * k + Math.cos(a) * r);
          });
          if ((finaleLeft -= dt) <= 0) { const done = finaleEnd; finaleEnd = null; done(); }
        }
        whole.visible = ws.final;
        whole.rotation.y = time;
        scenery.flame.visible = ws.final;
        scenery.flame.scale.setScalar(1 + Math.sin(time * 9) * 0.08);
        creatures.update(dt);
        // the magic: the colours, the light, the river and the carousel, the butterflies, the sugar, the dance
        magic.update(dt);
        scenery.turn(dt, WINGS_TURN);
      },
      goal: () => {
        const h = house.goal() ?? bridge.goal();
        if (h) return h;
        const r = rubies.find(waiting);
        if (r) return r.mesh.position;
        const n = npcs.find((x) => !finished(x));
        if (n) return n.pos;
        // the easel when every piece is found and the picture not set (src/game/easel.ts): after the friends, before the finale
        return g.easel.goal() ?? (finaleItem.done() ? null : shrine);
      },
      animate: (_dt, time) => { flies.update(time); hubWay.update(time); player.update(time); },
      focusDist: () => 6.5,
      beforeRender: (hp) => { sky.sun.position.copy(hp).add(sky.sunOffset); sky.sun.target.position.copy(hp); },
    },
    debug: {
      npcs,
      // the tour as the first world's: played without a mark, its points with the moment each is passed, its player
      // the cut-scenes' player (./story.ts): the tools skip a scene on the way (tools/sweet-grey.mjs)
      more: { story, flyoverPlayer: flyover, flyover: () => { void tour(g, { record: false }); }, flyoverPoints: SWEET_FLYOVER.points.map((p, i) => ({ ...p, t: flyover.times[i] })),
        // the map as the measurements of the grey build read it (tools/sweet-grey.mjs): its stretch, zones, ways,
        // landmarks, the route, the river and its bridge
        sweetMap: { scale: SCALE, zones: ZONES, paths: PATHS, landmarks: LANDMARKS, route: ROUTE, river: RIVER, bridge: BRIDGE, ground: (x: number, z: number) => groundY(x, z) },
        // the magic of the Sweet Land (WORLD-09): `magic.value` shown, `magic.target` the save's; setMagic(v) shows v at once, null the save's
        magic, setMagic: (v: number | null) => magic.set(v),
        // the creatures of no task (kind, state, position, taps), the middle of one's body over its point, one held still
        creatures: creatures.herd.all,
        creatureBody: (i: number) => creatures.bodyOf(creatures.herd.all[i]),
        holdCreature: (i: number, at: [number, number, number] | null) => creatures.herd.hold(creatures.herd.all[i], at && new THREE.Vector3(...at)),
        // the secrets (./secrets.ts): where each is found and its things, for their pictures and their draw calls
        sweetSecrets: { at: secrets.at, ...secrets.debug, places: { cave: { ...caveOf(), centre: { x: CAVE.x, z: CAVE.z } }, room: { doorIn: { x: room.doorIn.x, z: room.doorIn.z }, jar: { x: room.jarAt.x, z: room.jarAt.z }, cupboard: roomOf().cupboard } } } },
      talk: (id) => { void dialogue.talk(npc(id)); },
      // a task in the world open: its right move (the walkthrough's door); the house's or the bridge's step on: she is
      // brought before it (./house.ts, ./bridge.ts `cheat`); else a ruby waiting in the world is taken
      cheatWorld: () => {
        if (worldTaskDoor(g).solve()) return 'world task';
        if (house.cheat()) return 'house';
        if (bridge.cheat()) return 'bridge';
        const s = secrets.cheat();
        if (s) return s;
        const r = rubies.find(waiting);
        if (!r) return '';
        take(r);
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

/** The Sweet Land, the grey build: listed in src/worlds/index.ts for `--mode grey` only. */
export const sweet: WorldDef<SweetLoads, WorldSky> = {
  id: 'sweet',
  shelf: 3,
  spawn: SPAWN,
  // out of the arch of the Great Tree on the square, from the hub (./hub-way.ts); else at the spawn
  arrive: arriveFrom,
  ground,
  characters: FRIENDS,
  strings,
  music: MUSIC,
  sky: buildSky,
  load: loadSweet,
  build: buildSweet,
  // the gingerbread house (WORLD-21), the scales (WORLD-22) and the shape bridge (WORLD-20) are played in the world;
  // the house is written to no skill, the scales to `compare`, the bridge to `classify` (the customer's decision 2026-11-18)
  worldTasks: [HOUSE_STEP, SCALES_STEP, BRIDGE_STEP],
  noSkill: [HOUSE_STEP],
  collect: COLLECT,                  // swirl lollipops and jelly sweets (PLAY-25, ./collect.ts), the pieces of its picture (PLAY-29)
  easel: EASEL,                      // where she sets those pieces (./layout.ts)
  daily: { places: DAILY_PLACES },   // the find of the day (PLAY-26)
  // PLAY-07: the four secrets (./secrets.ts); the tin box under the bridge is the world's chest (PLAY-08)
  secrets: SWEET_SECRETS,
  chest: CHEST_FLAG,
  // PLAY-09: Zheleyka, between the garden's lollipops once Tyanuchka's chain is done and he has asked for him
  pet: { species: 'zheleyka', at: ZHELEYKA, after: 'tyanuchka', found: 'sweet_pet_found', follow: 'sweet_pet_follow' },
};
