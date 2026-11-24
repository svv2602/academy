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
import { SKY_FLYOVER } from './flyover-path';
import { arriveFrom, createHubWay } from './hub-way';
import { BRIDGES, CLOCK, GANGWAY, HALF, ISLANDS, LANDING, LANDMARKS, PATHS, RAY_ISLET, ROUTE, SCALE, SHRINE, SPAWN, ZONES } from './layout';
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
 * The characters (docs/worlds/world-5.md, the table «Персонажи»). The three tasks the document plays in the world stand
 * in, in step 1, as the panel task of the same skill (LATER_IN_WORLD): the cloud bridge (WORLD-25, addition) as
 * addition, the observatory's clock (WORLD-24: three steps - a search, a pattern, the hands by an addition) as addition,
 * the wind route (WORLD-23, no skill) as the number house of the Sweet Land's stand-in. `part`: the ray is not handed
 * over - the character says where it lies (in the clock, on the far islet; WORLD-08), and she takes it there by the
 * action button (RAYS). The colours of the rays: the Star's gold, each a little its own.
 */
export const FRIENDS: readonly CharacterDef[] = [
  { id: 'lazur', emoji: '☁️', x: ZONES.castle.x - 3, z: ZONES.castle.z + 1, heading: 0.4, steps: ['compare', 'add', 'add'], shard: '#ffd54a' },
  { id: 'gromykhalo', emoji: '🐉', x: ZONES.dragon.x + 3, z: ZONES.dragon.z + 2.5, heading: 1.3, steps: ['count', 'sub', 'pattern'], shard: '#ffc93c' },
  { id: 'mertsal', emoji: '🔭', x: ZONES.observatory.x - 3, z: ZONES.observatory.z + 3, heading: 0.3, steps: ['simon', 'pattern', 'add', 'part'], shard: '#ffe27a' },
  { id: 'veterok', emoji: '🧭', x: ZONES.pier.x - 3, z: ZONES.pier.z + 1.5, heading: 2.8, steps: ['order', 'compose', 'house', 'part'], shard: '#ffb84a' },
  { id: 'chirika', emoji: '🐦', x: ZONES.mills.x - 3, z: ZONES.mills.z + 3, heading: 4.4, steps: ['pairs', 'add', 'sort'], shard: '#fff09a' },
];

/**
 * The steps that become tasks in the world in a later step of the grey build, each standing in now as the panel task
 * of the same skill: whose chain, the number of the step, its stand-in, the card of the task in the world and its
 * skill (the wind route is written to no skill, docs/worlds/world-5.md question 3; the clock writes each of its steps to
 * its own skill - the last, the hands, to addition). Played in the world, the step's id becomes the task's own (the
 * world's `tasks` and `worldTasks`), as the Sweet Land's did.
 */
export const LATER_IN_WORLD = [
  { owner: 'lazur', step: 2, now: 'add', card: 'WORLD-25', skill: 'add' },
  { owner: 'mertsal', step: 2, now: 'add', card: 'WORLD-24', skill: 'add' },
  { owner: 'veterok', step: 2, now: 'house', card: 'WORLD-23', skill: null },
] as const;

/** The shape of each character in the grey build: its height, its girth, its colour, the mark of its kind on its top. */
const FIGURE: Record<string, { h: number; r: number; color: string; top: string }> = {
  lazur: { h: 1.7, r: 0.3, color: '#cfe2ff', top: '#ffffff' },          // the cloud fairy, white and blue
  gromykhalo: { h: 3.2, r: 1.1, color: '#5fae4a', top: '#ffd166' },     // the big good dragon, green and gold
  mertsal: { h: 1.75, r: 0.32, color: '#4a3f8a', top: '#ffe27a' },      // the old stargazer: a starry mantle, a golden cap
  veterok: { h: 1.35, r: 0.26, color: '#3c7fd0', top: '#e8483c' },      // the ship's boy: blue jacket, red cap
  chirika: { h: 0.6, r: 0.22, color: '#2f3f6a', top: '#ff9a3c' },       // the swallow-postwoman, bigger than the birds
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
const RAY_R = 2.6, SHRINE_R = 3, BOARD_R = 2.4;
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

/** Nothing to load: the grey build is made of shapes (and the heroine and the cat are the game's). */
const loadSky = (_scene: THREE.Scene, _save: Save, _touch: boolean): Promise<Record<string, never>> => Promise.resolve({});

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

function buildIslands(g: Game, _L: Record<string, never>, sky: WorldSky, scope: WorldScope): BuiltWorld {
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

  // ----- the airship's stand-in (WORLD-23 later flies it): the gangway's action takes her to the far islet, and back -----
  const hop = (to: { x: number; z: number }, facing: number) => {
    g.sparks.burst(hero.root.position.clone().setY(hero.root.position.y + 1), '#ffffff', 30, 3);
    hero.root.position.set(to.x, groundY(to.x, to.z), to.z); hero.heading = facing; hero.root.rotation.y = facing;
    g.cat.root.position.set(to.x + 1, groundY(to.x + 1, to.z + 0.6), to.z + 0.6);
    g.cam.target.copy(hero.root.position);
    sfx('chime');
    g.sparks.burst(hero.root.position.clone().setY(hero.root.position.y + 1), '#ffffff', 30, 3);
  };
  const toIslet = Math.atan2(ISLANDS.far.x - LANDING.x, ISLANDS.far.z - LANDING.z), toPier = Math.atan2(ISLANDS.pier.x - GANGWAY.x, ISLANDS.pier.z - GANGWAY.z);

  const stage = createStage(g, () => g.speech.caption(null));
  // The tasks of the chains: the panel ones by the shared conversation; `part` here. The tasks in the world of a later
  // step (LATER_IN_WORLD) join this record under their own ids, with the world's `worldTasks`.
  const tasks: Record<string, WorldTask> = { part };
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
  const own: readonly WorldItem[] = [tourItem, ...rayItems, finaleItem];
  const restore = () => playScene(stage, 'sky finale', async () => {
    finaleOn = true;
    g.cam.focus = g.above(shrine, 8);
    sfx('fanfare');
    five.forEach((m) => { m.visible = true; });
    await new Promise<void>((done) => { finaleLeft = GATHER_S; finaleEnd = done; });
    // the Star whole over the dome: the clock starts, golden sparks fall over the island
    five.forEach((m) => { m.visible = false; });
    ws.final = true; g.persist();
    for (const [i, c] of ['#ffd54a', '#fff0b0', '#ffffff', '#cfe6ff'].entries()) g.sparks.burst(g.above(shrine, 5 + i * 2), c, 40, 6);
    g.sparks.burst(scenery.starTop.clone(), '#ffe27a', 60, 3);
    finaleOn = false; g.cam.focus = null;
  });
  const raySpots = rays.map((r): Spot => ({ pos: point(r.spot), r: RAY_R, label: r.label, on: () => waiting(r), run: () => take(r) }));

  return {
    frame: {
      spots: [
        ...npcs.map((n): Spot => ({ pos: n.pos, r: n.def.id === 'gromykhalo' ? 4.2 : 3.0, label: 'talk', on: () => true, run: () => { void dialogue.talk(n); } })),
        ...raySpots,
        { pos: point(GANGWAY), r: BOARD_R, label: 'sky_ship', on: () => true, run: () => hop(LANDING, toIslet) },
        { pos: point(LANDING), r: BOARD_R, label: 'sky_ship_back', on: () => true, run: () => hop(GANGWAY, toPier) },
        { pos: shrine, r: SHRINE_R, label: 'place', on: () => !finaleItem.done() && ready(finaleItem, all), run: () => { void restore(); } },
        hubWay.spot,
      ],
      tap: () => false,
      afterMove: (time, grounded) => gear.update(time, grounded),
      update: (dt, time, canMove) => {
        void canMove;
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
        scenery.turn(dt, ws.final ? SAILS_TURN : 0);
      },
      goal: () => {
        const r = rays.find(waiting);
        if (r) return r.mesh.position;
        const n = npcs.find((x) => !finished(x));
        if (n) return n.pos;
        return finaleItem.done() ? null : shrine;
      },
      animate: (_dt, time) => { flies.update(time); hubWay.update(time); },
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
        skyShip: (out: boolean) => { if (out) hop(LANDING, toIslet); else hop(GANGWAY, toPier); } },
      talk: (id) => { void dialogue.talk(npc(id)); },
      // a task in the world open: its right move (the walkthrough's door); else a ray waiting in the world is taken
      cheatWorld: () => {
        if (worldTaskDoor(g).solve()) return 'world task';
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
  };
}

/** The Sky Islands, the grey build: listed in src/worlds/index.ts for `--mode grey` only. */
export const sky: WorldDef<Record<string, never>, WorldSky> = {
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
};
