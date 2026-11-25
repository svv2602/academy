import * as THREE from 'three';
import { rig, tint, type Rig } from '../../core/assets';
import { sfx } from '../../core/audio';
import type { Save } from '../../core/save';
import { Actor } from '../../game/actor';
import { loadFailed } from '../../game/boot';
import { createStage, type Game } from '../../game/context';
import { declared, marked, ready } from '../../game/describe';
import { createDialogue } from '../../game/dialogue';
import { flyoverOf, setTour, tour } from '../../game/flyover';
import { createGear } from '../../game/gear';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { playScene } from '../../game/stage';
import type { BuiltWorld, CharacterDef, MusicParams, Npc, WorldDef, WorldItem, WorldLines, WorldSky, WorldTask } from '../../game/world';
import { taskFrame, worldTaskDoor } from '../../game/worldtasks/core';
import { worldTaskPlayer, worldTaskProblems } from '../../game/worldtasks/play';
import { CLOUD_STEP, GAP_AT, createCloudBridge } from './cloud-bridge';
import { CLOCK_STEP, createClock } from './clock';
import { WINDS_STEP, createWinds, flightSeconds } from './ship';
import { createSkyCreatures } from './creatures';
import { createSkyMagic } from './magic';
import { CHEST_FLAG, SECRET_HOW, SKY_SECRETS, createSkySecrets } from './secrets';
import { SKY_FLYOVER } from './flyover-path';
import { arriveFrom, createHubWay } from './hub-way';
import { BRIDGES, CLOUD_GAP, CLOCK, GANGWAY, HALF, ISLANDS, LANDING, LANDMARKS, PATHS, RAY_ISLET, ROUTE, SCALE, SHRINE, SPAWN, ZONES } from './layout';
import { buildScenery } from './scenery';
import { strings } from './strings';
import { buildGround, colliders, ground } from './terrain';

/**
 * The Sky Islands (WORLD-05), the grey build (WORLD-12), step 1: the six islands of docs/worlds/world-5.md in simple
 * shapes at their real sizes, stretched by one number (./layout.ts SCALE, `?scale=`), the cloud bridges between them and
 * their closed edges (./terrain.ts), the observatory and the airship as the landmarks (./landmarks.ts), the five
 * characters as figures of their height with their chains of tasks the game already has, the two rays that lie in the
 * world, the finale at the observatory, the tour and the arch back to the Great Tree (./hub-way.ts). The airship's
 * flight (WORLD-23 later) stands in as an action at the gangway that takes her to the far islet and back. It loads no
 * file and speaks no line of its own: the conversations say the shared recorded lines, as the Sweet Land's grey build
 * did. The registry lists it only in a build made with `--mode grey` (src/worlds/index.ts): the published game does
 * not change. What the measurements of the grey build read: tools/sky-grey.mjs.
 */

/**
 * The characters (docs/worlds/world-5.md, the table «Персонажи»). Lazur's last step is the cloud bridge over the gap
 * in the bridge to the dragon island (WORLD-25, ./cloud-bridge.ts), played in the world since step 2; Mertsal's third,
 * the observatory's clock (WORLD-24, ./clock.ts: the gears found, the gears on the axle, the hands set), since step 3.
 * The wind route (WORLD-23, no skill) stands in as the number house of the Sweet Land's stand-in (LATER_IN_WORLD). `part`: the ray is not handed
 * over - the character says where it lies (in the clock, on the far islet; WORLD-08), and she takes it there by the
 * action button (RAYS). The colours of the rays: the Star's gold, each a little its own.
 */
export const FRIENDS: readonly CharacterDef[] = [
  { id: 'lazur', emoji: '☁️', x: ZONES.castle.x - 3, z: ZONES.castle.z + 1, heading: 0.4, steps: ['compare', 'add', CLOUD_STEP], shard: '#ffd54a' },
  { id: 'gromykhalo', emoji: '🐉', x: ZONES.dragon.x + 3, z: ZONES.dragon.z + 2.5, heading: 1.3, steps: ['count', 'sub', 'pattern'], shard: '#ffc93c' },
  { id: 'mertsal', emoji: '🔭', x: ZONES.observatory.x - 3, z: ZONES.observatory.z + 3, heading: 0.3, steps: ['simon', 'pattern', CLOCK_STEP, 'part'], shard: '#ffe27a' },
  { id: 'veterok', emoji: '🧭', x: ZONES.pier.x - 3, z: ZONES.pier.z + 1.5, heading: 2.8, steps: ['order', 'compose', WINDS_STEP, 'part'], shard: '#ffb84a' },
  { id: 'chirika', emoji: '🐦', x: ZONES.mills.x - 3, z: ZONES.mills.z + 3, heading: 4.4, steps: ['pairs', 'add', 'sort'], shard: '#fff09a' },
];

/**
 * The steps that become tasks in the world in a later step of the grey build, each standing in now as the panel task
 * of the same skill: whose chain, the number of the step, its stand-in, the card of the task in the world and its
 * skill (the wind route is written to no skill, docs/worlds/world-5.md question 3; the clock writes each of its steps to
 * its own skill - the last, the hands, to addition). Played in the world, the step's id becomes the task's own (the
 * world's `tasks` and `worldTasks`), as the Sweet Land's did.
 */
/** rad: how steeply the camera looks at the cloud bridge (a task's frame on the ground looks from FRAME_PITCH, 0.8). */
export const CLOUDS_PITCH = 0.42;

/** The steps played as tasks in the world (WorldDef.worldTasks): Lazur's cloud bridge, Mertsal's clock, Veterok's route of the winds. */
export const WORLD_TASKS: readonly string[] = [CLOUD_STEP, CLOCK_STEP, WINDS_STEP];

export const LATER_IN_WORLD: readonly { owner: string; step: number; now: string; card: string; skill: string | null }[] = [];

/** The shape of each character in the grey build: its height, its girth, its colour, the mark of its kind on its top. */
const FIGURE: Record<string, { h: number; r: number; color: string; top: string }> = {
  lazur: { h: 1.7, r: 0.3, color: '#cfe2ff', top: '#ffffff' },          // the cloud fairy, white and blue
  gromykhalo: { h: 3.2, r: 1.1, color: '#5fae4a', top: '#ffd166' },     // the big good dragon, green and gold
  mertsal: { h: 1.75, r: 0.32, color: '#4a3f8a', top: '#ffe27a' },      // the old stargazer: a starry mantle, a golden cap
  veterok: { h: 1.35, r: 0.26, color: '#3c7fd0', top: '#e8483c' },      // the ship's boy: blue jacket, red cap
  chirika: { h: 0.85, r: 0.22, color: '#2f3f6a', top: '#ff9a3c' },       // the swallow-postwoman, bigger than the birds
};

/**
 * The rays that lie in the world (WORLD-08): whose chain says where, the flag of the ray taken (the id of its item),
 * where it is taken and the label of its action. In step 1 both are taken by the action at their place: ray 3 at the
 * clock's stand (WORLD-24 later opens it at the end of the clock's three steps), ray 4 among the far islet's flowers
 * (the airship takes her there: WORLD-23 later, the gangway's action now).
 */
export const RAYS = [
  { owner: 'mertsal', flag: 'ray_clock', hint: 'mertsal_hint', spot: CLOCK, at: CLOCK, label: 'sky_clock' },
  { owner: 'veterok', flag: 'ray_island', hint: 'veterok_hint', spot: RAY_ISLET, at: RAY_ISLET, label: 'sky_flowers' },
] as const;
export const FINALE = 'final';
const TOUR = 'toured';
/** m: the action spot of a ray's place; the shrine's; the gangway's. */
const RAY_R = 2.6, SHRINE_R = 3;
/** rad/s: the windmills' sails, still until the Star is whole (WORLD-09 later turns them by the rays back). */
export const SAILS_TURN = 0.6;
/** rad/s: the clock's hands once the Star is whole. */
export const HANDS_TURN = 0.8;
/** s of game time the five rays fly up over the dome in the finale. */
const GATHER_S = 2;

const LINES: WorldLines = { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'sky_part', partText: 'sky_count' };
/** A wide Lydian mode of D, airy (the grey build's own; VOICE-12 later gives the world its own: «свой лад, широкий»). */
const MUSIC: MusicParams = {
  scale: [293.7, 329.6, 370, 415.3, 440, 493.9, 554.4],
  chords: [[146.8, 220, 370], [164.8, 246.9, 415.3], [110, 164.8, 277.2]],
};

/** The sky of the islands: pale blue at the magic 0 over a haze of the sky's colour (docs/worlds/world-5.md «Край мира», «Мир оживает»). */
export const SKY = { background: '#cfe6ff', haze: '#dcecff', sun: '#fff6e6', sunPower: 2.4, skyLight: '#f0f7ff', groundLight: '#c8d8e8', hemiPower: 1.6 };
function buildSky(scene: THREE.Scene): WorldSky {
  scene.background = new THREE.Color(SKY.background);
  scene.fog = new THREE.Fog(SKY.haze, HALF * 0.8, HALF * 2.2);
  const sun = new THREE.DirectionalLight(SKY.sun, SKY.sunPower);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  const cam = sun.shadow.camera;
  cam.left = -26; cam.right = 26; cam.top = 26; cam.bottom = -26; cam.near = 1; cam.far = 120;
  scene.add(new THREE.HemisphereLight(SKY.skyLight, SKY.groundLight, SKY.hemiPower), sun, sun.target);
  return { sun, sunOffset: new THREE.Vector3(-20, 34, 16) };
}

/**
 * The characters' models (step 6, the customer's decisions of 2026-11-18 and 2026-11-25; CREDITS.md): Lazur, Mertsal
 * and Veterok from Meshy with our own skeletons and clips (Veterok keeps his hands on his hips: his arms have no bones),
 * Gromykhalo the CC0 Dragon Evolved (Quaternius) with its own clips named for the game, Chirika the first world's
 * bird, bigger (0.85 m: at 0.6 she did not read in the game, the lead's decision of 2026-11-25) and in her colours. The world's own files (models/sky/, TECH-09) by their height in metres - their figures' (FIGURE); the
 * bird is the core's (models/creatures/). Idle, Talk, and Cheer for the finale where a model has them.
 */
export const MODELS: Readonly<Record<string, { path: string; h: number }>> = {
  lazur: { path: 'sky/lazur', h: 1.7 }, gromykhalo: { path: 'sky/gromykhalo', h: 3.2 }, mertsal: { path: 'sky/mertsal', h: 1.75 },
  veterok: { path: 'sky/veterok', h: 1.35 }, chirika: { path: 'creatures/bird', h: 0.85 },
};

/** The files of the islands: the characters' models (the heroine and the cat are the game's). Null = failed (TECH-08). */
async function loadSky(_scene: THREE.Scene, _save: Save, _touch: boolean): Promise<{ rigs: Record<string, Rig> } | null> {
  const rigs = await Promise.all(Object.entries(MODELS).map(async ([id, m]) => [id, await rig(m.path, m.h)] as const))
    .then((e) => Object.fromEntries(e) as Record<string, Rig>)
    .catch((e: unknown) => { loadFailed(e); return null; });
  // the good dragon green and gold (docs/worlds/world-5.md), not the CC0 model's own brown and orange
  if (rigs) { tint(rigs.gromykhalo.model, GROMYKHALO_COLOURS); tint(rigs.chirika.model, CHIRIKA_COLOURS); }
  return rigs ? { rigs } : null;
}
/** Gromykhalo's colours by the materials of Dragon Evolved: its body green, its belly and wings' skin gold. */
export const GROMYKHALO_COLOURS: Readonly<Record<string, string>> = { Dragon_Main: '#5fae4a', Dragon_Secondary: '#e8c35a' };
/** Chirika's colours by the bird's materials: a swallow's dark blue back, her orange crest (her grey figure's). */
export const CHIRIKA_COLOURS: Readonly<Record<string, string>> = { C_4488aa: '#2f3f6a', C_55aa00: '#ff9a3c' };
type SkyLoads = NonNullable<Awaited<ReturnType<typeof loadSky>>>;

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

/** A ray of the Star: a golden spike of light (the parts in the world, the five of the finale). */
function rayMesh(color: string): THREE.Group {
  const g = new THREE.Group();
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 5), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.2 }));
  g.add(spike);
  return g;
}

function buildIslands(g: Game, L: SkyLoads, sky: WorldSky, scope: WorldScope): BuiltWorld {
  const { scene, hero, save, ws, flies, groundY } = g;
  // The colliders are one list of the module: the world empties it as it is left, a second entry starts from none.
  scope.own(() => { colliders.length = 0; });
  scene.add(buildGround());
  const scenery = buildScenery(scene);
  // the arch back to the Great Tree on the castle island (./hub-way.ts): she comes out of it from the hub
  const hubWay = createHubWay(g);
  const gear = createGear(g.heroRig, g.heroRig.gear, [], g.sparks);
  const point = (p: { x: number; z: number }, y = 0) => new THREE.Vector3(p.x, groundY(p.x, p.z) + y, p.z);

  const starMat = new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb300', emissiveIntensity: 1.1, roughness: 0.3 });
  const markGeo = new THREE.OctahedronGeometry(0.22);
  const npcs: Npc[] = FRIENDS.map((def) => {
    const actor = new Actor(L.rigs[def.id] ?? figure(def.id));
    if (actor.has('Idle')) actor.play('Idle');
    const pos = point(def);
    actor.root.position.copy(pos); actor.heading = def.heading; actor.root.rotation.y = def.heading;
    g.ground.block(def.x, def.z, FIGURE[def.id].r + 0.3);
    const mark = new THREE.Mesh(markGeo, starMat);
    scene.add(actor.root, mark);
    return { def, actor, pos, mark, idle: 'Idle', timer: 0 };
  });
  const finished = (n: Npc) => (ws.quests[n.def.id] ?? 0) >= n.def.steps.length;
  const npc = (id: string) => npcs.find((n) => n.def.id === id)!;

  // ----- the rays that lie in the world (WORLD-08): the step `part` of Mertsal's and Veterok's chains -----
  const rays = RAYS.map((r) => {
    const def = FRIENDS.find((c) => c.id === r.owner)!;
    const mesh = rayMesh(def.shard);
    mesh.position.copy(point(r.spot, 1.6)); mesh.visible = false;
    scene.add(mesh);
    return { ...r, mesh, step: def.steps.indexOf('part') };
  });
  type Ray = (typeof rays)[number];
  const waiting = (r: Ray) => ws.flags[r.hint] === true && (ws.quests[r.owner] ?? 0) === r.step;
  let stepDone: (n: Npc, k: number) => void = () => {};
  const take = (r: Ray) => {
    ws.flags[r.flag] = true; r.mesh.visible = false;
    sfx('chime'); g.sparks.burst(r.mesh.position, '#fff0b0', 36, 3);
    stepDone(npc(r.owner), r.step);
  };
  const part: WorldTask = {
    skill: 'count',     // a step of no skill: the conversation reads the skill of a task it runs, never of this one
    start: (n) => { const r = rays.find((x) => x.owner === n.def.id); if (r) { ws.flags[r.hint] = true; g.persist(); } },
    active: () => rays.some(waiting),
    owner: () => rays.find(waiting)?.owner ?? null,
  };


  // the creatures busy with their own things (PLAY-11, ./creatures.ts): birds, little dragons, cloud lambs
  const creatures = createSkyCreatures(g, scope);
  // the secrets (PLAY-07, ./secrets.ts): the chest on the nook behind the dragon island, the rainbow slide, the clouds
  // that turn into animals, the little dragons' nest
  const secrets = createSkySecrets(g, scope);
  // the islands come alive with the rays (WORLD-09, ./magic.ts): it turns the windmills' sails too
  const magic = createSkyMagic(g, scope, { sky, scenery, characters: FRIENDS });
  const stage = createStage(g, () => g.speech.caption(null));
  // The tasks of the chains: the panel ones by the shared conversation; `part` here. The tasks in the world of a later
  // step (LATER_IN_WORLD) join this record under their own ids, with the world's `worldTasks`.
  // Lazur's cloud bridge (WORLD-25): she asks, the heroine walks to the gap in the bridge to the dragon island, the task
  // opens at its edge; its result is handed to the conversation, which records it in `add` as a panel task. Until it is
  // built the gap cannot be walked across (./terrain.ts): the way to Gromykhalo opens with it.
  const player = worldTaskPlayer(g, scope);
  const lazur = FRIENDS.find((c) => c.id === 'lazur')!;
  const bridge = createCloudBridge(g, player, scope, scenery.gapDeck);
  bridge.opened((ws.quests.lazur ?? 0) > lazur.steps.indexOf(CLOUD_STEP));
  // Mertsal's clock of the observatory (WORLD-24): the gears found on his island, then its two tasks at the stand; each
  // step recorded in its own skill by the clock itself, ray 3 shows in the clock at the end
  const mertsal = FRIENDS.find((c) => c.id === 'mertsal')!;
  const clock = createClock(g, player, scope, scenery.hands);
  scope.own(() => clock.dispose());
  clock.opened((ws.quests.mertsal ?? 0) > mertsal.steps.indexOf(CLOCK_STEP));
  // Veterok's route of the winds (WORLD-23) and the airship's flight it starts (WORLD-05): no skill; the gangways fly
  // her there and back once it is made
  const veterok = FRIENDS.find((c) => c.id === 'veterok')!;
  const winds = createWinds(g, player, scope, scenery.ship);
  winds.opened((ws.quests.veterok ?? 0) > veterok.steps.indexOf(WINDS_STEP));
  const tasks: Record<string, WorldTask> = { part, [CLOUD_STEP]: bridge, [CLOCK_STEP]: clock, [WINDS_STEP]: winds };
  const wrongTasks = worldTaskProblems(WORLD_TASKS, tasks);
  if (wrongTasks.length) throw new Error(`the Sky Islands: ${wrongTasks.join('; ')}`);
  const dialogue = createDialogue(g, stage, { characters: FRIENDS, lines: LINES, tasks });
  stepDone = dialogue.stepDone;

  // ----- the tour, the finale -----
  const flyover = setTour(g, { path: SKY_FLYOVER, visited: () => ws.flags[TOUR] === true, mark: () => { ws.flags[TOUR] = true; g.persist(); } });
  const shrine = point(SHRINE);
  // the five rays of the finale: they fly from the shrine up over the dome and come together there into the Star
  const five = FRIENDS.map((f) => { const m = rayMesh(f.shard); m.visible = false; scene.add(m); return m; });
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(1, 1, 0.4), new THREE.MeshStandardMaterial({ color: '#ffd54a', emissive: '#ffc21a', emissiveIntensity: 1, roughness: 0.15 }));
  star.position.copy(scenery.starTop);
  star.name = 'star-of-time';
  scene.add(star);
  // the finale's few seconds run in game time, counted down by the frame (update below)
  let finaleOn = false, finaleLeft = 0, finaleEnd: (() => void) | null = null;
  const tourItem = marked(ws, { kind: 'flyover', id: TOUR, how: 'auto', active: () => flyoverOf(g)?.active === true });
  const rayItems = RAYS.map((r) => marked(ws, { kind: 'part', id: r.flag, how: 'act', at: { x: r.at.x, z: r.at.z } }));
  const before = [...declared(g), tourItem, ...rayItems];
  const finaleItem = marked(ws, { kind: 'finale', id: FINALE, how: 'act', at: { ...SHRINE }, after: before.map((i) => i.id), active: () => finaleOn });
  const all = [...before, finaleItem];
  // the secrets are found on the way, the finale does not wait for them
  const secretItems = SKY_SECRETS.map((id) => marked(ws, { kind: 'secret', id, how: SECRET_HOW[id], at: secrets.at[id], active: () => secrets.active(id) }));
  const own: readonly WorldItem[] = [tourItem, ...rayItems, ...secretItems, finaleItem];
  const restore = () => playScene(stage, 'sky finale', async () => {
    finaleOn = true;
    g.cam.focus = g.above(shrine, 8);
    sfx('fanfare');
    five.forEach((m) => { m.visible = true; });
    await new Promise<void>((done) => { finaleLeft = GATHER_S; finaleEnd = done; });
    // the Star whole over the dome: the clock starts, golden sparks fall over the island
    five.forEach((m) => { m.visible = false; });
    ws.final = true; g.persist();
    // the five are glad of the Star whole again (each its clip of the finale, where it has one), then stand as before
    for (const n of npcs) if (n.actor.has('Cheer') && n.actor.has('Idle')) n.actor.once('Cheer', 'Idle');
    for (const [i, c] of ['#ffd54a', '#fff0b0', '#ffffff', '#cfe6ff'].entries()) g.sparks.burst(g.above(shrine, 5 + i * 2), c, 40, 6);
    g.sparks.burst(scenery.starTop.clone(), '#ffe27a', 60, 3);
    finaleOn = false; g.cam.focus = null;
  });
  const raySpots = rays.map((r): Spot => ({ pos: point(r.spot), r: RAY_R, label: r.label, on: () => waiting(r), run: () => take(r) }));

  return {
    frame: {
      spots: [
        ...secrets.spots,
        ...npcs.map((n): Spot => ({ pos: n.pos, r: n.def.id === 'gromykhalo' ? 4.2 : 3.0, label: 'talk', on: () => true, run: () => { void dialogue.talk(n); } })),
        ...raySpots,
        ...clock.spots,
        ...winds.spots,
        { pos: shrine, r: SHRINE_R, label: 'place', on: () => !finaleItem.done() && ready(finaleItem, all), run: () => { void restore(); } },
        hubWay.spot,
      ],
      tap: (screenDist) => winds.tap() || player.tap(screenDist) || creatures.tap(screenDist),
      afterMove: (time, grounded) => gear.update(time, grounded),
      update: (dt, time, canMove) => {
        bridge.update(dt, time, canMove);
        clock.update(dt, time, canMove);
        winds.update(dt, time, canMove);
        // over the gap the camera keeps to the step ahead: the cloud bridge's middle moves with her (clouds.ts `center`);
        // and it looks lower than a task's frame on the ground: from above it would see the white sea of clouds under
        // the gap, and the sunlit tops of everything washed out on it - lower, the clouds and their numbers stand against the sky
        if (player.open?.kind === 'clouds') g.camTask = { ...taskFrame(player.open, g.camera).cam, pitch: CLOUDS_PITCH };
        const hp = hero.root.position;
        for (const n of npcs) {
          n.actor.face(Math.hypot(n.pos.x - hp.x, n.pos.z - hp.z) < 7 ? Math.atan2(hp.x - n.pos.x, hp.z - n.pos.z) : n.def.heading, dt, 3);
          n.mark.visible = !finished(n) && !g.busy;
          n.mark.rotation.y = time * 2;
          n.mark.position.set(n.pos.x, n.pos.y + Math.max(1.4, FIGURE[n.def.id].h + 0.7) + Math.sin(time * 2.5) * 0.15, n.pos.z);
          n.actor.update(dt);
        }
        for (const r of rays) {
          r.mesh.visible = waiting(r);
          if (r.mesh.visible) { r.mesh.rotation.y = time * 1.6; r.mesh.position.y = groundY(r.spot.x, r.spot.z) + 1.6 + Math.sin(time * 2) * 0.12; }
        }
        // the finale: the five fly up from round the shrine over the dome over GATHER_S s of game time
        if (finaleEnd) {
          const k = 1 - Math.max(0, finaleLeft) / GATHER_S, top = scenery.starTop;
          five.forEach((m, i) => {
            const a = (i / five.length) * Math.PI * 2 + k * 3;
            const r = 2.5 * (1 - k);
            m.position.set(shrine.x + (top.x - shrine.x) * k + Math.sin(a) * r, shrine.y + 1.5 + (top.y - shrine.y - 1.5) * k * k, shrine.z + (top.z - shrine.z) * k + Math.cos(a) * r);
          });
          if ((finaleLeft -= dt) <= 0) { const done = finaleEnd; finaleEnd = null; done(); }
        }
        star.visible = ws.final;
        star.rotation.y = time;
        if (ws.final) scenery.hands.rotation.z -= dt * HANDS_TURN;
        secrets.update(dt, time, canMove);
        creatures.update(dt);
        // the magic: the sky, the light, the clouds' drift, the sails, the glow (WORLD-09)
        magic.update(dt);
      },
      goal: () => {
        const b = bridge.goal() ?? clock.goal() ?? winds.goal();
        if (b) return b;
        const r = rays.find(waiting);
        if (r) return r.mesh.position;
        const n = npcs.find((x) => !finished(x));
        if (n) return n.pos;
        return finaleItem.done() ? null : shrine;
      },
      animate: (_dt, time) => { flies.update(time); hubWay.update(time); player.update(time); },
      focusDist: () => 6.5,
      beforeRender: (hp) => { sky.sun.position.copy(hp).add(sky.sunOffset); sky.sun.target.position.copy(hp); },
    },
    debug: {
      npcs,
      // the tour as the first world's: played without a mark, its points with the moment each is passed, its player
      more: { flyoverPlayer: flyover, flyover: () => { void tour(g, { record: false }); }, flyoverPoints: SKY_FLYOVER.points.map((p, i) => ({ ...p, t: flyover.times[i] })),
        // the map as the measurements of the grey build read it (tools/sky-grey.mjs): its stretch, zones, ways,
        // landmarks, the route, the islands and the bridges, the airship's stand-in
        skyMap: { scale: SCALE, zones: ZONES, paths: PATHS, landmarks: LANDMARKS, route: ROUTE, islands: ISLANDS, bridges: BRIDGES, gangway: GANGWAY, landing: LANDING, ground: (x: number, z: number) => groundY(x, z) },
        // the airship's stand-in by the debug door: to the far islet (true) or back to the pier (false)
        // the airship (WORLD-05): its flight by the debug door - made flying, then there (true) or back; it settles with
        // the game seconds it took (tools/sky-grey.mjs times it, the walkthrough reaches the far islet so)
        // the magic (WORLD-09): `magic.value` shown, `magic.target` the save's; setMagic(v) shows v at once, null the save's
        magic, setMagic: (v: number | null) => magic.set(v),
        // the creatures (PLAY-11): each, the number of its body, held still (or let go) for a picture
        creatures: creatures.herd.all,
        creatureBody: (i: number) => creatures.bodyOf(creatures.herd.all[i]),
        holdCreature: (i: number, at: [number, number, number] | null) => creatures.herd.hold(creatures.herd.all[i], at && new THREE.Vector3(...at)),
        // the secrets (./secrets.ts): where each is found and its things
        skySecrets: { at: secrets.at, ...secrets.debug },
        skyShip: { flySeconds: flightSeconds(), far: () => winds.far, flying: () => winds.flying, fly: (out: boolean) => { winds.opened(true); return winds.fly(out); } },
        // the cloud bridge (WORLD-25): its gap, whether it is built, and the deck over it laid by the debug door (the
        // measurements walk every bridge, the one to the dragon island too, before Lazur's chain has built it)
        skyBridge: { gap: CLOUD_GAP, at: GAP_AT, built: () => bridge.built, build: () => bridge.opened(true) } },
      talk: (id) => { void dialogue.talk(npc(id)); },
      // a task in the world open: its right move (the walkthrough's door); else a ray waiting in the world is taken
      cheatWorld: () => {
        if (worldTaskDoor(g).solve()) return 'world task';
        const s = secrets.cheat();
        if (s) return s;
        if (bridge.cheat()) return 'bridge';
        if (clock.cheat()) return 'clock';
        if (winds.cheat()) return 'winds';
        const r = rays.find(waiting);
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

/** The Sky Islands, the grey build: listed in src/worlds/index.ts for `--mode grey` only. */
export const sky: WorldDef<SkyLoads, WorldSky> = {
  id: 'sky',
  shelf: 4,
  spawn: SPAWN,
  // out of the arch of the Great Tree on the castle island, from the hub (./hub-way.ts); else at the spawn
  arrive: arriveFrom,
  ground,
  characters: FRIENDS,
  strings,
  music: MUSIC,
  sky: buildSky,
  load: loadSky,
  build: buildIslands,
  // the tasks played in the world (src/game/worldtasks/play.ts): Lazur's cloud bridge
  worldTasks: WORLD_TASKS,
  // the route of the winds is written to no skill (the customer's decision 2026-11-18): the walkthrough checks it moves none
  noSkill: [WINDS_STEP],
  // PLAY-07: the four secrets (./secrets.ts); the chest on the nook behind the dragon island is the world's chest (PLAY-08)
  secrets: SKY_SECRETS,
  chest: CHEST_FLAG,
};
