import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { rig, type Rig } from '../../core/assets';
import type { Save } from '../../core/save';
import { Actor } from '../../game/actor';
import { createStage, type Game } from '../../game/context';
import { declared, marked, ready } from '../../game/describe';
import { createDialogue } from '../../game/dialogue';
import { worldTaskDoor } from '../../game/worldtasks/core';
import { worldTaskPlayer, worldTaskProblems } from '../../game/worldtasks/play';
import { generateSteps, showStepsInWorld } from '../../game/worldtasks/steps';
import { createNutsSearch } from './tracks';
import { flyoverOf, setTour, tour } from '../../game/flyover';
import { createGear } from '../../game/gear';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { playScene } from '../../game/stage';
import type { BuiltWorld, CharacterDef, MusicParams, Npc, WorldDef, WorldItem, WorldLines, WorldSky, WorldTask } from '../../game/world';
import { FOREST_FLYOVER } from './flyover-path';
import { ALTAR, HALF, HOLLOW, LANDMARKS, MAZE_END, MAZE_IN, OWL_TREE, PATHS, ROUTE, SCALE, SPAWN, ZONES } from './layout';
import { MAZE, createMaze } from './maze';
import { bridges, buildScenery, loadFlora, type Flora } from './scenery';
import { buildDecor, loadDecor, type Decor } from './decor';
import { buildUndergrowth, loadUndergrowth } from './undergrowth';
import { buildFireflies } from './fireflies';
import { createForestMagic } from './magic';
import { strings } from './strings';
import { buildGround, colliders, ground } from './terrain';

/**
 * The Enchanted Forest (WORLD-02), its grey build (WORLD-12): the map of docs/worlds/world-2.md in simple shapes at
 * their real sizes, stretched by one number (./layout.ts SCALE, `?scale=`), its five characters with their chains of
 * tasks the game already has, the two leaves of the Emerald that lie in the world, the finale at the Old Oak and the
 * tour. It loads no file. The registry lists it only in a build made with `--mode grey` (src/worlds/index.ts): the
 * published game and the hub do not change. What the measurements of the grey build read: tools/forest-grey.mjs.
 */

/**
 * The characters (docs/worlds/world-2.md). The steps that later become tasks in the world stand in as the panel task
 * of the same skill: Kolyuchka's maze (WORLD-14) as `pattern`. Ash "remembers" the glade otherwise: his first step is
 * "find the differences" (LEARN-18), a task of the panel of its own. `part`: the leaf is not
 * handed over - the character says it lies in the world (the hollow, the end of the maze; WORLD-08).
 */
/** The step of Mudrena's chain played in the world: the mushroom steps up to her hollow (./index.ts `stepsTask`). */
export const STEPS = 'steps';
/** The step of Shustrik's chain in the background: its lost nuts found by the tracks on the ground (./tracks.ts). */
export const TRACKS = 'tracks';

export const FRIENDS: readonly CharacterDef[] = [
  { id: 'borovik', emoji: '🍄', x: ZONES.village.x + 2, z: ZONES.village.z + 1.5, heading: 1.2, steps: ['count', 'neighbors', 'sort'], shard: '#4fd08a' },
  { id: 'mudrena', emoji: '🦉', x: ZONES.owl.x + 1.5, z: ZONES.owl.z + 1.5, heading: 0.6, steps: ['pattern', STEPS, 'compare', 'part'], shard: '#3fc27a' },
  { id: 'shustrik', emoji: '🐿️', x: ZONES.grove.x + 1.5, z: ZONES.grove.z - 1.5, heading: 2.4, steps: [TRACKS, 'odd', 'pairs'], shard: '#5fe39a' },
  { id: 'yasen', emoji: '🌳', x: ZONES.ash.x, z: ZONES.ash.z, heading: Math.PI, steps: ['diff', 'simon', 'add'], shard: '#36b56c' },
  // by the arch of the maze's way in; the maze is the last of the hedgehog's tasks, the leaf lies at its end (WORLD-14)
  { id: 'kolyuchka', emoji: '🦔', x: MAZE_IN.x + 2.5, z: MAZE_IN.z - 2, heading: -1.6, steps: ['sub', 'order', MAZE, 'part'], shard: '#7ff0b0' },
];
/** The steps played in the world (WorldDef.worldTasks): Mudrena's steps to her hollow (WORLD-16). */
export const WORLD_TASKS: readonly string[] = [STEPS];

/** The size of each character: its height and the radius it keeps clear (the Ash is its tree: no figure of its own). */
const FIGURE: Record<string, { h: number; r: number; color: string; hat?: string }> = {
  borovik: { h: 1.1, r: 0.3, color: '#8a6a4a', hat: '#d8443a' },
  mudrena: { h: 0.7, r: 0.3, color: '#9a8466' },
  shustrik: { h: 0.45, r: 0.16, color: '#e07a2c' },
  yasen: { h: 0, r: 0, color: '#000' },
  kolyuchka: { h: 0.4, r: 0.22, color: '#6a5442' },
};

/**
 * The characters' models (the customer's decision 2026-11-21: Meshy instead of the simple shapes; CREDITS.md), the
 * world's own files (models/forest/, TECH-09): one per character, and two who stand by without a chain of their own -
 * Tropka in the village a step aside from Borovik (out of the way to him), and the owlet, Mudrena's little one, in the
 * squirrel grove where the pet of the world is to be found (world-2.md, PLAY-09; it follows her once that is made).
 */
const MODELS: Record<string, number> = { borovik: 1.1, mudrena: 0.7, shustrik: 0.45, kolyuchka: 0.4, tropka: 1.0, owlet: 0.38 };
export const BYSTANDERS = [
  { id: 'tropka', x: ZONES.village.x - 1.2, z: ZONES.village.z - 2.6, heading: 1.9, r: 0.3 },
  { id: 'owlet', x: ZONES.grove.x - 1.6, z: ZONES.grove.z + 1.2, heading: 2.0, r: 0.2 },
] as const;
type ForestModels = { rigs: Record<string, Rig>; flora: Flora; plants: THREE.BufferGeometry[]; decor: Decor };

/** The leaves that lie in the world: whose chain says where, the flag of the leaf taken (the id of its item). */
export const LEAVES = [
  { owner: 'mudrena', flag: 'leaf_hollow', hint: 'mudrena_hint', at: HOLLOW },
  { owner: 'kolyuchka', flag: 'leaf_maze', hint: 'kolyuchka_hint', at: MAZE_END },
] as const;
export const FINALE = 'final';
const TOUR = 'toured';
/** m: walking this near a leaf takes it; the altar's spot. */
const TAKE_R = 1.1, ALTAR_R = 2.4;

const LINES: WorldLines = { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'forest_part', partText: 'forest_count' };
const MUSIC: MusicParams = {
  scale: [220, 246.9, 277.2, 329.6, 370, 440, 493.9],
  chords: [[110, 164.8, 277.2], [123.5, 185, 293.7], [98, 146.8, 246.9]],
};

/** m: where the haze of the forest ends (its fog), and how far the camera sees: a little past it. */
export const FOG_FAR = HALF * 2.4;
export const FOREST_FAR = FOG_FAR + 10;

/**
 * The evening of the forest (plan C of its look, 2026-11-21; world-2.md: "a warm evening light, the haze only at the
 * edges, not frightening"): a peach sky the haze fades into, a low warm sun from the west, a sky light of the same warmth
 * over a ground light of the moss. The same two lights as the grey build's - no new light, no new draw call.
 */
export const SKY = { background: '#f4c79a', haze: '#ecc6a0', sun: '#ffc685', sunPower: 2.3, skyLight: '#ffe1bf', groundLight: '#5f7c54', hemiPower: 1.2 };
function buildSky(scene: THREE.Scene): WorldSky {
  scene.background = new THREE.Color(SKY.background);
  scene.fog = new THREE.Fog(SKY.haze, HALF * 0.9, FOG_FAR);
  const sun = new THREE.DirectionalLight(SKY.sun, SKY.sunPower);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  const cam = sun.shadow.camera;
  cam.left = -26; cam.right = 26; cam.top = 26; cam.bottom = -26; cam.near = 1; cam.far = 120;
  scene.add(new THREE.HemisphereLight(SKY.skyLight, SKY.groundLight, SKY.hemiPower), sun, sun.target);
  // lower than the grey build's (-20, 34, 16): the long shadows of an evening, the light through the trunks
  return { sun, sunOffset: new THREE.Vector3(-30, 24, 18) };
}

/** The characters' models (the rest of the grey build is made of shapes; the heroine and the cat are the game's). */
const loadForest = async (_scene: THREE.Scene, _save: Save, _touch: boolean): Promise<ForestModels> => {
  const [rigs, flora, plants, decor] = await Promise.all([
    Promise.all(Object.entries(MODELS).map(async ([id, h]) => [id, await rig(`forest/${id}`, h)] as const)).then((e) => Object.fromEntries(e)),
    loadFlora(),
    loadUndergrowth(),
    loadDecor(),
  ]);
  return { rigs, flora, plants, decor };
};

/** A character without a model (none now but the Ash, which is its tree): a figure of its height and colour on a rig with no clips. */
function figure(id: string): Rig {
  const f = FIGURE[id], root = new THREE.Group(), model = new THREE.Group();
  if (f.h > 0) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(f.r, Math.max(0.01, f.h - f.r * 2), 4, 10), new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.8 }));
    body.position.y = f.h / 2; body.castShadow = true;
    model.add(body);
    if (f.hat) {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(f.r * 1.9, f.h * 0.35, 10), new THREE.MeshStandardMaterial({ color: f.hat, roughness: 0.7 }));
      hat.position.y = f.h + f.h * 0.12; hat.castShadow = true;
      model.add(hat);
    }
  }
  root.add(model);
  return { root, model, clips: new Map() };
}

function buildForest(g: Game, L: ForestModels, sky: WorldSky, scope: WorldScope): BuiltWorld {
  const { scene, hero, save, ws, flies, groundY } = g;
  // The colliders are one list of the module: the world empties it as it is left, a second entry starts from none.
  scope.own(() => { colliders.length = 0; });
  scene.add(buildGround(160));
  const scenery = buildScenery(scene, L.flora);
  buildDecor(scene, L.decor, bridges());
  const undergrowth = buildUndergrowth(scene, L.plants);
  const fireflies = buildFireflies(scene);
  // the magic of the forest (WORLD-09): from the leaves in the save; after what it lights, before the frame moves the fireflies
  const magic = createForestMagic(g, scope, { sky, fireflies, characters: FRIENDS });
  // the camera reaches a little past the end of the haze, as in the valley of the fairy (src/worlds/fairy/sky.ts
  // VALLEY_FAR): what is cut is of the haze's colour already, and no cell of trees past it is drawn
  const worldFar = g.camera.far;
  g.camera.far = FOREST_FAR; g.camera.updateProjectionMatrix();
  scope.own(() => { g.camera.far = worldFar; g.camera.updateProjectionMatrix(); });
  const gear = createGear(g.heroRig, g.heroRig.gear, [], g.sparks);
  const point = (p: { x: number; z: number }, y = 0) => new THREE.Vector3(p.x, groundY(p.x, p.z) + y, p.z);

  const starMat = new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb300', emissiveIntensity: 1.1, roughness: 0.3 });
  const markGeo = new THREE.OctahedronGeometry(0.22);
  const npcs: Npc[] = FRIENDS.map((def) => {
    const actor = new Actor(L.rigs[def.id] ?? figure(def.id));
    const pos = point(def);
    actor.root.position.copy(pos); actor.heading = def.heading; actor.root.rotation.y = def.heading;
    actor.play('Idle');
    if (FIGURE[def.id].h > 0) g.ground.block(def.x, def.z, FIGURE[def.id].r + 0.3);
    const mark = new THREE.Mesh(markGeo, starMat);
    scene.add(actor.root, mark);
    return { def, actor, pos, mark, idle: 'Idle', timer: 0 };
  });
  const bystanders = BYSTANDERS.map((b) => {
    const actor = new Actor(L.rigs[b.id]);
    actor.root.position.copy(point(b)); actor.heading = b.heading; actor.root.rotation.y = b.heading;
    g.ground.block(b.x, b.z, b.r + 0.3);
    actor.play('Idle');
    scene.add(actor.root);
    return actor;
  });
  const finished = (n: Npc) => (ws.quests[n.def.id] ?? 0) >= n.def.steps.length;
  const npc = (id: string) => npcs.find((n) => n.def.id === id)!;

  // ----- the leaves that lie in the world (WORLD-08): the step `part` of the owl's and the hedgehog's chains -----
  const leafGeo = new THREE.OctahedronGeometry(0.3, 0).scale(0.7, 1.3, 0.4);
  const leaves = LEAVES.map((l) => {
    const def = FRIENDS.find((c) => c.id === l.owner)!;
    const m = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: def.shard, emissive: def.shard, emissiveIntensity: 0.7, roughness: 0.3 }));
    m.position.copy(point(l.at, 1.0)); m.visible = false;
    scene.add(m);
    return { ...l, mesh: m, step: def.steps.indexOf('part') };
  });
  const waiting = (l: (typeof leaves)[number]) => ws.flags[l.hint] === true && (ws.quests[l.owner] ?? 0) === l.step;
  let stepDone: (n: Npc, k: number) => void = () => {};
  const take = (l: (typeof leaves)[number]) => {
    ws.flags[l.flag] = true; l.mesh.visible = false;
    sfx('chime'); g.sparks.burst(l.mesh.position, '#7ff0b0', 36, 3);
    stepDone(npc(l.owner), l.step);
  };
  const part: WorldTask = {
    skill: 'count',     // a step of no skill: the conversation reads the skill of a task it runs, never of this one
    start: (n) => { const l = leaves.find((x) => x.owner === n.def.id); if (l) { ws.flags[l.hint] = true; g.persist(); } },
    active: () => leaves.some(waiting),
    owner: () => leaves.find(waiting)?.owner ?? null,
  };

  const stage = createStage(g, () => g.speech.caption(null));
  // The tasks played in the world (PLAY-01): opened in their frame by the shared player, their taps and time from below.
  const player = worldTaskPlayer(g, scope);
  // Mudrena's steps (WORLD-16): the row rises across, before the hollow of her tree, the mushrooms on the ground toward
  // the child; the number series, every level
  const stepsTask: WorldTask = {
    skill: 'series', inWorld: () => true,
    run: (n, level) => {
      const d = Math.hypot(OWL_TREE.x - n.pos.x, OWL_TREE.z - n.pos.z) || 1, ux = (OWL_TREE.x - n.pos.x) / d, uz = (OWL_TREE.z - n.pos.z) / d;
      // the row across, between her and her tree: the child looks at it with the hollow behind
      const mid = Math.max(1.8, d - 2.2);
      const at = { x: n.pos.x + ux * mid, z: n.pos.z + uz * mid, facing: Math.atan2(ux, uz) };
      return player.play(showStepsInWorld(scene, generateSteps(level, g.rng), at, g.hooksFor(n.def.emoji), { groundY, reach: g.touch ? 70 : 46, scope }));
    },
  };
  // Shustrik's nuts (WORLD-15): found by the tracks, then the question of counting them
  const nuts = createNutsSearch(g);
  scope.own(() => nuts.tracks.dispose());
  // Kolyuchka's maze (WORLD-14): walked through in the background; its end puts the fifth leaf just past it, waiting
  const maze = createMaze(g);
  scope.own(() => maze.dispose());
  const mazeLeaf = leaves.find((l) => l.owner === 'kolyuchka')!;
  const mazeTask: WorldTask = {
    skill: maze.skill, active: maze.active, owner: maze.owner, reask: maze.reask,
    start: (n, done) => maze.start!(n, () => { ws.flags[mazeLeaf.hint] = true; done(); }),
  };
  const tasks: Record<string, WorldTask> = { part, [STEPS]: stepsTask, [TRACKS]: nuts, [MAZE]: mazeTask };
  const wrongTasks = worldTaskProblems(forest.worldTasks, tasks);
  if (wrongTasks.length) throw new Error(`the forest: ${wrongTasks.join('; ')}`);
  const dialogue = createDialogue(g, stage, { characters: FRIENDS, lines: LINES, tasks });
  stepDone = dialogue.stepDone;

  // ----- the tour, the finale -----
  const flyover = setTour(g, { path: FOREST_FLYOVER, visited: () => ws.flags[TOUR] === true, mark: () => { ws.flags[TOUR] = true; g.persist(); } });
  const altar = point(ALTAR);
  const emerald = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: '#5fe39a', emissive: '#2fbf6a', emissiveIntensity: 0.9, roughness: 0.25 }));
  emerald.position.copy(altar).setY(altar.y + 2.6);
  scene.add(emerald);
  // the finale's few seconds run in game time, counted down by the frame (./index.ts update)
  let finaleOn = false, finaleLeft = 0, finaleEnd: (() => void) | null = null;
  const tourItem = marked(ws, { kind: 'flyover', id: TOUR, how: 'auto', active: () => flyoverOf(g)?.active === true });
  const leafItems = LEAVES.map((l) => marked(ws, { kind: 'part', id: l.flag, how: 'walk', at: { x: l.at.x, z: l.at.z } }));
  const before = [...declared(g), tourItem, ...leafItems];
  const finaleItem = marked(ws, { kind: 'finale', id: FINALE, how: 'act', at: { ...ALTAR }, after: before.map((i) => i.id), active: () => finaleOn });
  const all = [...before, finaleItem];
  const own: readonly WorldItem[] = [tourItem, ...leafItems, finaleItem];
  const restore = () => playScene(stage, 'forest finale', async () => {
    finaleOn = true;
    g.cam.focus = g.above(altar, 2);
    sfx('fanfare');
    g.sparks.burst(g.above(altar, 2.6), '#7ff0b0', 60, 5);
    await new Promise<void>((done) => { finaleLeft = 2; finaleEnd = done; });
    ws.final = true; g.persist();
    finaleOn = false; g.cam.focus = null;
  });

  return {
    frame: {
      spots: [
        ...npcs.map((n): Spot => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void dialogue.talk(n); } })),
        { pos: altar, r: ALTAR_R, label: 'place', on: () => !finaleItem.done() && ready(finaleItem, all), run: () => { void restore(); } },
      ],
      tap: (screenDist) => player.tap(screenDist),
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
        for (const a of bystanders) a.update(dt);
        magic.update(dt);
        fireflies.update(time);
        nuts.update(dt, time, canMove);
        maze.update(dt, time, canMove);
        for (const l of leaves) {
          l.mesh.visible = waiting(l);
          if (!l.mesh.visible) continue;
          l.mesh.rotation.y = time * 1.4;
          if (canMove && Math.hypot(hp.x - l.at.x, hp.z - l.at.z) < TAKE_R) take(l);
        }
        if (finaleEnd && (finaleLeft -= dt) <= 0) { const done = finaleEnd; finaleEnd = null; done(); }
        emerald.visible = ws.final;
        emerald.rotation.y = time;
      },
      goal: () => {
        const nut = nuts.goal() ?? maze.goal();
        if (nut) return nut;
        const l = leaves.find(waiting);
        if (l) return l.mesh.position;
        const n = npcs.find((x) => !finished(x));
        if (n) return n.pos;
        return finaleItem.done() ? null : altar;
      },
      animate: (_dt, time) => { flies.update(time); player.update(time); },
      focusDist: () => 6.5,
      beforeRender: (hp) => { sky.sun.position.copy(hp).add(sky.sunOffset); sky.sun.target.position.copy(hp); scenery.shadows(hp.x, hp.z); undergrowth.near(hp.x, hp.z); },
    },
    debug: {
      npcs,
      // the tour as the first world's: played without a mark, its points with the moment each is passed, its player
      more: { flyoverPlayer: flyover, flyover: () => { void tour(g, { record: false }); }, flyoverPoints: FOREST_FLYOVER.points.map((p, i) => ({ ...p, t: flyover.times[i] })),
        // the map as the measurements of the grey build read it (tools/forest-grey.mjs): its stretch, zones, paths, landmarks
        forestMap: { scale: SCALE, zones: ZONES, paths: PATHS, landmarks: LANDMARKS, route: ROUTE, ground: (x: number, z: number) => groundY(x, z) },
        // the maze that stands now (WORLD-14): its paths and forks, where she is in it - for its pictures and its time on foot
        forestMaze: maze,
        // the magic of the forest (WORLD-09): `magic.value` shown, `magic.target` the save's; setMagic(v) shows v at once, null the save's
        magic, setMagic: (v: number | null) => magic.set(v) },
      talk: (id) => { void dialogue.talk(npc(id)); },
      // a leaf waiting in the world: the heroine is put on it (the walkthrough's way to the step `part`)
      // a task in the world open: its right move (the walkthrough's door); else a leaf waiting in the world
      cheatWorld: () => { if (worldTaskDoor(g).solve()) return 'world task'; if (nuts.cheat()) return 'tracks'; if (maze.cheat()) return 'maze'; const l = leaves.find(waiting); if (!l) return ''; hero.root.position.set(l.at.x, groundY(l.at.x, l.at.z), l.at.z); return 'part'; },
    },
    book: {
      parts: () => npcs.map((n) => ({ color: n.def.shard, icon: n.def.emoji, got: finished(n) })),
      stats: () => [{ icon: '⭐', label: 'col_stars', value: String(save.stars) }],
    },
    lines: LINES,
    hud: () => `${npcs.filter(finished).length}/${npcs.length}`,
    gear,
    items: () => own,
  };
}

/** The Enchanted Forest, the grey build: listed in src/worlds/index.ts for `--mode grey` only. */
export const forest: WorldDef<ForestModels, WorldSky> = {
  id: 'forest',
  shelf: 1,
  spawn: SPAWN,
  ground,
  characters: FRIENDS,
  worldTasks: WORLD_TASKS,
  strings,
  music: MUSIC,
  sky: buildSky,
  load: loadForest,
  build: buildForest,
};
