import * as THREE from 'three';
import { gltf, type Rig } from '../../core/assets';
import { sfx } from '../../core/audio';
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
import { playScene } from '../../game/stage';
import type { BuiltWorld, CharacterDef, MusicParams, Npc, WorldDef, WorldItem, WorldLines, WorldSky, WorldTask } from '../../game/world';
import { waterOf } from '../../game/water';
import { worldTaskDoor } from '../../game/worldtasks/core';
import { worldTaskPlayer, worldTaskProblems } from '../../game/worldtasks/play';
import { SEA_FLYOVER } from './flyover-path';
import { CABIN, CORAL_NEST, HALF, LANDMARKS, PATHS, ROUTE, SCALE, SPAWN, THRONE, ZONES } from './layout';
import { buildScenery, buildShafts } from './scenery';
import { LOCK, createLock } from './lock';
import { strings } from './strings';
import { buildGround, colliders, ground } from './terrain';

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
 * The characters (docs/worlds/world-3.md). The three tasks that are later played in the world stand in as the panel
 * task of the same skill: the search in the corals (WORLD-17, no skill) as `odd`, the second half of a shell (WORLD-18,
 * patterns) as `pattern`. The shell lock (WORLD-19, the composition of a number) is played in the world: the queen's
 * last step, the lock in the gate of the castle (./lock.ts). `part`: the pearl is not
 * handed over - the character says where it lies (in the corals, in the captain's cabin; WORLD-08).
 */
export const FRIENDS: readonly CharacterDef[] = [
  { id: 'khvylia', emoji: '🧜‍♀️', x: ZONES.square.x + 2.5, z: ZONES.square.z - 2.5, heading: -2.4, steps: ['compare', 'missing', LOCK], shard: '#a8e4ff' },
  { id: 'bulk', emoji: '🐉', x: ZONES.reef.x + 2, z: ZONES.reef.z + 1.5, heading: 1.2, steps: ['pattern', 'count', 'odd', 'part'], shard: '#7fe6d6' },
  { id: 'pantsyr', emoji: '🐢', x: ZONES.ship.x - 2, z: ZONES.ship.z + 4, heading: 2.6, steps: ['pattern', 'simon', 'sub', 'part'], shard: '#9fd0a8' },
  { id: 'kleshnya', emoji: '🦀', x: ZONES.grotto.x - 2, z: ZONES.grotto.z - 1, heading: -1.8, steps: ['add', 'sort', 'compare'], shard: '#ffb0a0' },
  { id: 'iskorka', emoji: '🐟', x: ZONES.trench.x + 2, z: ZONES.trench.z + 2, heading: 0.8, steps: ['pairs', 'order', 'add'], shard: '#fff0a0' },
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
  { owner: 'bulk', flag: 'pearl_reef', hint: 'bulk_hint', at: CORAL_NEST, how: 'walk' },
  { owner: 'pantsyr', flag: 'pearl_ship', hint: 'pantsyr_hint', at: CABIN, how: 'act' },
] as const;
export const FINALE = 'final';
const TOUR = 'toured';
/** m: swimming this near a pearl of `walk` takes it; the spot of the cabin's door; the throne's spot. */
const TAKE_R = 1.2, CABIN_R = 2.6, THRONE_R = 3;

const LINES: WorldLines = { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'sea_part', partText: 'sea_count' };
/** A calm mode of D (the grey build's own; VOICE-12 later). */
const MUSIC: MusicParams = {
  scale: [293.7, 329.6, 349.2, 392, 440, 493.9, 523.3],
  chords: [[146.8, 220, 349.2], [130.8, 196, 329.6], [110, 164.8, 261.6]],
};
/** The heroine's clips of this world (vite.config.ts puts the file into the grey build): Swim_Fwd_Loop and Swim_Idle_Loop of the UAL, CC0. */
const SWIM_CLIPS = 'sea/swim';
/** m: how high she swims over the floor (the probe world's height). */
const SWIM_HEIGHT = 0.6;

/**
 * The colour of the water: the background and its haze are one - no sky under water. Light and clear, never deep blue
 * (world-3.md); a bright turquoise over warm sand (the customer, 2026-11-21: "brighter, turquoise water and warm sand",
 * after a pale '#a8e2ea' that looked beige and a cold '#5cb6e4' over grey sand that looked wintry).
 */
export const WATER_COLOR = '#2fb0d6';
/** The haze of the water, from and to, in halves of the map: thicker than the air's, the far landmarks still seen. */
export const FOG_NEAR = 0.3, FOG_FAR = 2;
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

/** The one file of the grey build: the swimming clips (the heroine and the cat are the game's). Null = failed (TECH-08). */
async function loadSea(_scene: THREE.Scene, _save: Save, _touch: boolean) {
  const swim = await gltf(SWIM_CLIPS).catch((e: unknown) => { loadFailed(e); return null; });
  return swim ? { swim } : null;
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
  scene.add(buildGround(160));
  buildScenery(scene);
  const shafts = buildShafts(scene, SHAFTS);
  // In the water her wand and petals are hidden (src/game/gear.ts).
  const gear = createGear(g.heroRig, g.heroRig.gear, [], g.sparks, () => swimming(g));
  const point = (p: { x: number; z: number }, y = 0) => new THREE.Vector3(p.x, groundY(p.x, p.z) + y, p.z);

  const starMat = new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb300', emissiveIntensity: 1.1, roughness: 0.3 });
  const markGeo = new THREE.OctahedronGeometry(0.22);
  const npcs: Npc[] = FRIENDS.map((def) => {
    const actor = new Actor(figure(def.id));
    const pos = point(def);
    actor.root.position.copy(pos); actor.heading = def.heading; actor.root.rotation.y = def.heading;
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
    stepDone(npc(p.owner), p.step);
  };
  const part: WorldTask = {
    skill: 'count',     // a step of no skill: the conversation reads the skill of a task it runs, never of this one
    start: (n) => { const p = pearls.find((x) => x.owner === n.def.id); if (p) { ws.flags[p.hint] = true; g.persist(); } },
    active: () => pearls.some(waiting),
    owner: () => pearls.find(waiting)?.owner ?? null,
  };

  const stage = createStage(g, () => g.speech.caption(null));
  // The tasks played in the world (PLAY-01): opened in their frame by the shared player, their taps and time from below.
  const player = worldTaskPlayer(g, scope);
  // The queen's shell lock (WORLD-19): she asks, the heroine swims to the gate, the lock opens there
  const lock = createLock(g, player, scope);
  scope.own(() => lock.dispose());
  lock.opened(finished(npc('khvylia')));
  const tasks: Record<string, WorldTask> = { part, [LOCK]: lock };
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
  const tourItem = marked(ws, { kind: 'flyover', id: TOUR, how: 'auto', active: () => flyoverOf(g)?.active === true });
  const pearlItems = PEARLS.map((p) => marked(ws, { kind: 'part', id: p.flag, how: p.how, at: { x: p.at.x, z: p.at.z } }));
  const before = [...declared(g), tourItem, ...pearlItems];
  const finaleItem = marked(ws, { kind: 'finale', id: FINALE, how: 'act', at: { ...THRONE }, after: before.map((i) => i.id), active: () => finaleOn });
  const all = [...before, finaleItem];
  const own: readonly WorldItem[] = [tourItem, ...pearlItems, finaleItem];
  const restore = () => playScene(stage, 'sea finale', async () => {
    finaleOn = true;
    g.cam.focus = g.above(throne, 2);
    sfx('fanfare');
    g.sparks.burst(g.above(throne, 2.4), '#bff4ff', 60, 5);
    await new Promise<void>((done) => { finaleLeft = 2; finaleEnd = done; });
    ws.final = true; g.persist();
    finaleOn = false; g.cam.focus = null;
  });
  const cabinPearl = pearls.find((p) => p.how === 'act')!;
  const cabin = point(CABIN);

  return {
    frame: {
      spots: [
        ...npcs.map((n): Spot => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void dialogue.talk(n); } })),
        { pos: cabin, r: CABIN_R, label: 'sea_cabin', on: () => waiting(cabinPearl), run: () => take(cabinPearl) },
        { pos: throne, r: THRONE_R, label: 'place', on: () => !finaleItem.done() && ready(finaleItem, all), run: () => { void restore(); } },
      ],
      tap: (screenDist) => player.tap(screenDist),
      afterMove: (time, grounded) => gear.update(time, grounded),
      update: (dt, time, canMove) => {
        const hp = hero.root.position;
        for (const n of npcs) {
          n.actor.face(Math.hypot(n.pos.x - hp.x, n.pos.z - hp.z) < 7 ? Math.atan2(hp.x - n.pos.x, hp.z - n.pos.z) : n.def.heading, dt, 3);
          n.mark.visible = !finished(n) && !g.busy;
          n.mark.rotation.y = time * 2;
          const f = FIGURE[n.def.id];
          n.mark.position.set(n.pos.x, n.pos.y + Math.max(1.4, (f.lift ?? 0) + f.h + 0.7) + Math.sin(time * 2.5) * 0.15, n.pos.z);
          n.actor.update(dt);
        }
        for (const p of pearls) {
          p.mesh.visible = waiting(p);
          if (!p.mesh.visible) continue;
          p.mesh.position.y = groundY(p.at.x, p.at.z) + 1 + Math.sin(time * 2) * 0.12;
          if (p.how === 'walk' && canMove && Math.hypot(hp.x - p.at.x, hp.z - p.at.z) < TAKE_R) take(p);
        }
        lock.update(dt, canMove);
        if (finaleEnd && (finaleLeft -= dt) <= 0) { const done = finaleEnd; finaleEnd = null; done(); }
        pearlOfDeep.visible = ws.final;
        pearlOfDeep.rotation.y = time;
      },
      goal: () => {
        const l = lock.goal();
        if (l) return l;
        const p = pearls.find(waiting);
        if (p) return p.mesh.position;
        const n = npcs.find((x) => !finished(x));
        if (n) return n.pos;
        return finaleItem.done() ? null : throne;
      },
      animate: (_dt, time) => { flies.update(time); shafts.sway(time); player.update(time); },
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
        // a clip of the heroine held at her swimming height (tools/sea-grey.mjs pictures her talking and dancing in the
        // water): the game is busy meanwhile, as in a conversation, so her own moving does not take it back; null lets go
        pose: (clip: string | null) => { g.busy = clip !== null; if (clip) hero.play(clip, 0.2); } },
      talk: (id) => { void dialogue.talk(npc(id)); },
      // a pearl waiting in the world: the heroine is put on it (walk) or it is taken (act) - the walkthrough's way to `part`
      cheatWorld: () => {
        if (worldTaskDoor(g).solve()) return 'world task';
        if (lock.cheat()) return 'lock';
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
  worldTasks: [LOCK],
  sky: buildSky,
  load: loadSea,
  build: buildSea,
};
