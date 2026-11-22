import * as THREE from 'three';
import type { Rig } from '../../core/assets';
import { sfx } from '../../core/audio';
import type { Save } from '../../core/save';
import { Actor } from '../../game/actor';
import { createStage, type Game } from '../../game/context';
import { declared, marked, ready } from '../../game/describe';
import { createDialogue } from '../../game/dialogue';
import { flyoverOf, setTour, tour } from '../../game/flyover';
import { createGear } from '../../game/gear';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { playScene } from '../../game/stage';
import type { BuiltWorld, CharacterDef, MusicParams, Npc, WorldDef, WorldItem, WorldLines, WorldSky, WorldTask } from '../../game/world';
import { worldTaskDoor } from '../../game/worldtasks/core';
import { worldTaskPlayer, worldTaskProblems } from '../../game/worldtasks/play';
import { SWEET_FLYOVER } from './flyover-path';
import { DOORWAY, HOUSE_STEP, createHouse } from './house';
import { arriveFrom, createHubWay } from './hub-way';
import { BRIDGE, HALF, HOUSE_DOOR, LANDMARKS, MILLSTONE, PATHS, RIVER, ROUTE, SCALE, SHRINE, SPAWN, ZONES } from './layout';
import { buildScenery } from './scenery';
import { strings } from './strings';
import { buildGround, colliders, ground } from './terrain';

/**
 * The Sweet Land (WORLD-04), its grey build (WORLD-12), step 1: the map of docs/worlds/world-4.md in simple shapes at
 * their real sizes, stretched by one number (./layout.ts SCALE, `?scale=`), the cake palace and the mill as its
 * landmarks (./landmarks.ts), its five characters as figures of their height with their chains of tasks the game
 * already has, the two rubies that lie in the world, the finale at the cake, the tour and the arch back to the Great
 * Tree (./hub-way.ts). It loads no file and speaks no line of its own: the conversations say the shared recorded lines,
 * as the forest's grey build did. The registry lists it only in a build made with `--mode grey` (src/worlds/index.ts):
 * the published game does not change. What the measurements of the grey build read: tools/sweet-grey.mjs.
 */

/**
 * The characters (docs/worlds/world-4.md, the table «Персонажи»). Of the three tasks the document plays in the world,
 * the gingerbread house (WORLD-21, written to no skill) is played in the world since step 2: Imbir's third step, the
 * house assembled before his house (./house.ts). The other two stand in as the panel task of the same skill
 * (LATER_IN_WORLD): the shape bridge (WORLD-20, classify) as "the odd one out", the scales (WORLD-22, compare) as
 * comparing. `part`: the ruby is not handed over - the character says where it lies (inside the gingerbread house, in
 * the millstone; WORLD-08), and she takes it there by the action button (RUBIES); ruby 2 is seen in the doorway once the
 * house is assembled and its door opens.
 */
export const FRIENDS: readonly CharacterDef[] = [
  { id: 'pastila', emoji: '🧁', x: ZONES.square.x + 2.5, z: ZONES.square.z - 3, heading: 0.06, steps: ['add', 'compose', 'compare'], shard: '#ff4d6d' },
  { id: 'imbir', emoji: '🍪', x: ZONES.town.x - 2.5, z: ZONES.town.z - 1, heading: 1.3, steps: ['count', 'pattern', HOUSE_STEP, 'part'], shard: '#e8364f' },
  { id: 'tyanuchka', emoji: '🍬', x: ZONES.market.x - 1.5, z: ZONES.market.z + 2.5, heading: 2.6, steps: ['sub', 'sort', 'compare'], shard: '#ff6b8a' },
  { id: 'kakao', emoji: '🍫', x: ZONES.mill.x - 3, z: ZONES.mill.z - 3, heading: 0.785, steps: ['odd', 'simon', 'signs', 'part'], shard: '#d62e5c' },
  { id: 'polosatik', emoji: '🍭', x: ZONES.garden.x - 2, z: ZONES.garden.z - 1.5, heading: 0.5, steps: ['pairs', 'neighbors', 'add'], shard: '#ff8fa3' },
];

/**
 * The steps that become tasks in the world in a later step of the grey build, each standing in now as the panel task
 * of the same skill: whose chain, the number of the step, its stand-in, the card of the task in the world and its
 * skill. Played in the world, the step's id becomes the task's own (the world's `tasks` and `worldTasks`), as the
 * gingerbread house (WORLD-21) replaced the number house that stood in for it in step 1.
 */
export const LATER_IN_WORLD = [
  { owner: 'kakao', step: 0, now: 'odd', card: 'WORLD-20', skill: 'classify' },
  { owner: 'tyanuchka', step: 2, now: 'compare', card: 'WORLD-22', skill: 'compare' },
] as const;

/** The shape of each character in the grey build: its height, its colour, the mark of its kind on its top. */
const FIGURE: Record<string, { h: number; r: number; color: string; top: string }> = {
  pastila: { h: 1.7, r: 0.3, color: '#f7a8c8', top: '#ffffff' },       // the fairy confectioner: her white cap
  imbir: { h: 1.0, r: 0.3, color: '#b8763c', top: '#fffaf2' },         // the gingerbread man: his icing
  tyanuchka: { h: 1.6, r: 0.5, color: '#6fd06a', top: '#ffd84a' },     // the marmalade strongman: wide, green and yellow
  kakao: { h: 1.75, r: 0.32, color: '#6b4226', top: '#f5e6c8' },       // the old miller: chocolate, his flour-white hat
  polosatik: { h: 0.9, r: 0.18, color: '#e8364f', top: '#fffaf2' },    // the little candy-cane watchman
};

/**
 * The rubies that lie in the world (WORLD-08): whose chain says where, the flag of the ruby taken (the id of its item),
 * where it is seen (`spot`, `lift` m over the ground), where it is taken and the label of its action. Ruby 2 is seen in
 * the doorway of Imbir's house once the house is assembled and its door has opened (WORLD-21, ./house.ts), and taken
 * by the action before the door; ruby 4 is taken by the action at the millstone (in the step of WORLD-08 the action
 * there turns the millstone open).
 */
export const RUBIES = [
  { owner: 'imbir', flag: 'ruby_house', hint: 'imbir_hint', spot: DOORWAY, lift: 0.75, at: HOUSE_DOOR, label: 'sweet_house' },
  { owner: 'kakao', flag: 'ruby_mill', hint: 'kakao_hint', spot: MILLSTONE, lift: 1.4, at: { x: MILLSTONE.x, z: MILLSTONE.z + 1.6 }, label: 'sweet_millstone' },
] as const;
export const FINALE = 'final';
const TOUR = 'toured';
/** m: the action spot of a ruby's place; the shrine's. */
const RUBY_R = 2.6, SHRINE_R = 3;
/** rad/s: the mill's wings turn all the time (by code, docs/worlds/world-4.md); the carousel once the Ruby is whole. */
export const WINGS_TURN = 0.35, CAROUSEL_TURN = 0.7;
/** s of game time the five rubies fly up to the candle in the finale. */
const GATHER_S = 2;

const LINES: WorldLines = { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'sweet_part', partText: 'sweet_count' };
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

/** Nothing to load: the grey build is made of shapes (and the heroine and the cat are the game's). */
const loadSweet = (_scene: THREE.Scene, _save: Save, _touch: boolean): Promise<Record<string, never>> => Promise.resolve({});

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

function buildSweet(g: Game, _L: Record<string, never>, sky: WorldSky, scope: WorldScope): BuiltWorld {
  const { scene, hero, save, ws, flies, groundY } = g;
  // The colliders are one list of the module: the world empties it as it is left, a second entry starts from none.
  scope.own(() => { colliders.length = 0; });
  scene.add(buildGround(160));
  const scenery = buildScenery(scene);
  // the arch back to the Great Tree on the square (./hub-way.ts): she comes out of it from the hub
  const hubWay = createHubWay(g);
  const gear = createGear(g.heroRig, g.heroRig.gear, [], g.sparks);
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
    stepDone(npc(r.owner), r.step);
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
  // The tasks of the chains: the panel ones by the shared conversation; `part` and the house here. The tasks in the
  // world of a later step (LATER_IN_WORLD) join this record under their own ids, with the world's `worldTasks`.
  const tasks: Record<string, WorldTask> = { part, [HOUSE_STEP]: house };
  const wrongTasks = worldTaskProblems(sweet.worldTasks, tasks);
  if (wrongTasks.length) throw new Error(`the Sweet Land: ${wrongTasks.join('; ')}`);
  const dialogue = createDialogue(g, stage, { characters: FRIENDS, lines: LINES, tasks });
  stepDone = dialogue.stepDone;

  // ----- the tour, the finale -----
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
  const before = [...declared(g), tourItem, ...rubyItems];
  const finaleItem = marked(ws, { kind: 'finale', id: FINALE, how: 'act', at: { ...SHRINE }, after: before.map((i) => i.id), active: () => finaleOn });
  const all = [...before, finaleItem];
  const own: readonly WorldItem[] = [tourItem, ...rubyItems, finaleItem];
  const CONFETTI = ['#ff8fb1', '#ffd84a', '#7bd36a', '#a8e4ff', '#ffffff'];
  const restore = () => playScene(stage, 'sweet finale', async () => {
    finaleOn = true;
    g.cam.focus = g.above(shrine, 6);
    sfx('fanfare');
    five.forEach((m) => { m.visible = true; });
    await new Promise<void>((done) => { finaleLeft = GATHER_S; finaleEnd = done; });
    // the Ruby whole on the candle: the candle lights, the carousel turns, confetti of sugar powder from the sky
    five.forEach((m) => { m.visible = false; });
    ws.final = true; g.persist();
    for (const [i, c] of CONFETTI.entries()) g.sparks.burst(g.above(shrine, 5 + i), c, 40, 6);
    g.sparks.burst(scenery.candleTop.clone(), '#ffd27a', 50, 3);
    finaleOn = false; g.cam.focus = null;
  });
  const rubySpots = rubies.map((r): Spot => ({ pos: point(r.spot), r: RUBY_R, label: r.label, on: () => waiting(r), run: () => take(r) }));

  return {
    frame: {
      spots: [
        ...npcs.map((n): Spot => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void dialogue.talk(n); } })),
        ...rubySpots,
        { pos: shrine, r: SHRINE_R, label: 'place', on: () => !finaleItem.done() && ready(finaleItem, all), run: () => { void restore(); } },
        hubWay.spot,
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
        for (const r of rubies) {
          r.mesh.visible = waiting(r);
          if (r.mesh.visible) { r.mesh.rotation.y = time * 1.6; r.mesh.position.y = groundY(r.spot.x, r.spot.z) + r.lift + Math.sin(time * 2) * 0.12; }
        }
        house.update(dt, time, canMove);
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
        scenery.spin(dt, ws.final ? CAROUSEL_TURN : 0);
        scenery.turn(dt, WINGS_TURN);
      },
      goal: () => {
        const h = house.goal();
        if (h) return h;
        const r = rubies.find(waiting);
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
      more: { flyoverPlayer: flyover, flyover: () => { void tour(g, { record: false }); }, flyoverPoints: SWEET_FLYOVER.points.map((p, i) => ({ ...p, t: flyover.times[i] })),
        // the map as the measurements of the grey build read it (tools/sweet-grey.mjs): its stretch, zones, ways,
        // landmarks, the route, the river and its bridge
        sweetMap: { scale: SCALE, zones: ZONES, paths: PATHS, landmarks: LANDMARKS, route: ROUTE, river: RIVER, bridge: BRIDGE, ground: (x: number, z: number) => groundY(x, z) } },
      talk: (id) => { void dialogue.talk(npc(id)); },
      // a task in the world open: its right move (the walkthrough's door); the house's step on: she is brought before
      // it (./house.ts `cheat`); else a ruby waiting in the world is taken
      cheatWorld: () => {
        if (worldTaskDoor(g).solve()) return 'world task';
        if (house.cheat()) return 'house';
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
  };
}

/** The Sweet Land, the grey build: listed in src/worlds/index.ts for `--mode grey` only. */
export const sweet: WorldDef<Record<string, never>, WorldSky> = {
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
  // the gingerbread house is played in the world (WORLD-21), and written to no skill (the customer's decision 2026-11-18)
  worldTasks: [HOUSE_STEP],
  noSkill: [HOUSE_STEP],
};
