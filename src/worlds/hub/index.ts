import * as THREE from 'three';
import type { Save, WorldState } from '../../core/save';
import { worldClips } from '../../core/voice';
import { artifactBack, artifactCount, knownWorlds } from '../../game/artifacts';
import type { Game } from '../../game/context';
import { marked } from '../../game/describe';
import { flyoverOf, setTour } from '../../game/flyover';
import { createGear } from '../../game/gear';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { travel } from '../../game/travel';
import type { BuiltWorld, MusicParams, WorldDef, WorldGround, WorldLines, WorldSky } from '../../game/world';
import { HUB_FLYOVER } from './flyover-path';
import { PORTALS, RADIUS, arrivalAt } from './layout';
import { openArches, portalWorlds, sleepingToSpeakOf, somethingNew, wakingArches, woke } from './portals';
import CLIPS from './clips.json';
import { strings } from './strings';
import { buildTreeLook, loadTreeLook, treeStage, type TreeLoads, type TreeStage } from './tree-look';
import { buildKeepsakes } from './keepsakes';
import { CAULDRON, cauldronGeometry } from './cauldron-look';
import { openCauldron } from '../../ui/cauldron';
import { shownRecipes } from '../../game/cauldron';
import { ringNote, ringTapped } from './ring-notes';
import { HUB_COLLECT, birdAsleep, featherDay, featherOfDay, featherState, featherTaken } from './feathers';
import { foundOf } from '../../game/collections';
import { loadOwnPets, ownFound, petShadows, steerPet } from '../../game/pets';
import { petBlob, petCastsShadow } from './pet-shadow';
import { rainbowRibbon } from '../../game/rainbow-trail';
import { ringPlay } from './ring-play';
import { stumpAt } from './tree-look';
import { note, sfx, speaking } from '../../core/audio';
import { WAKE_S, buildArches, buildNestLook, loadArchLook, type ArchLoads } from './arch-look';
import type { SpokenKey } from '../../ui/strings';
import { buildGladeLook, loadGladeLook, type GladeLoads } from './glade-look';

/**
 * The hub, the Great Tree (WORLD-01, docs/worlds/hub.md): the home between the worlds the heroine comes back to after
 * every artifact. Its map, distances and tour are the grey build's the customer took (WORLD-12, R14); its look (H) is
 * of its own shapes: the Tree in four stages by the artifacts back (./tree-look.ts, R33), the stone arches with their
 * veils and the nests (./arch-look.ts).
 *
 * No tasks, no secrets, no pet of its own to find (R5, R30): the pet chosen walks after her here too, and plays round
 * the ring of mushrooms while she stands by the stump (./ring-play.ts). An arch whose world the registry has is open: it breathes, and walking up
 * to it changes the world (`travel`, through the gate: a world not downloaded, without the network, stays shut and
 * the cat says so, R16). The others sleep, grey and overgrown, with the sign of their world. A nest glows in the
 * colour of its world once that world's artifact is back (its light, not the artifact itself - R7). She appears at
 * the arch of the world she came from (R9, `arrive`); the cat leads to the next open arch whose world is not done
 * (R10). The tour flies from the roots up to the nest of the crystal, then round the arches (R12, R19), the cat
 * saying its line (R34). The hub is part of the installation (R31): no files of its own but its one clip, precached; the
 * models it loads (CommonTree, TwistedTree1 for its bark, TreeStump_Moss, the mushroom, Crystal2, and the Stylized
 * Nature MegaKit's pebbles, rocks, bushes, ferns, clover and flowers of nature2/) are the first world's.
 */

/** The heroine's first entry: from the arch of the Fairy Kingdom (R9). */
const SPAWN = arrivalAt(0);
/** m: how near the arch the action button opens it. */
const PORTAL_SPOT = 2.0;
/**
 * Nothing new in the hub (every open world done, the others asleep): as she comes in, the cat says so and its sparkles
 * lead to the arch of the fairies, back to the world she knows - not into the empty glade (the customer's decision
 * 2026-11-20, reversible: false - she comes in to silence and no sparkles, as before).
 */
export const LEAD_HOME = true;
/** Her world's final reached (read from the save, never creating its part). */
const doneIn = (save: Save) => (id: string) => (save.worlds[id] as { final?: boolean } | undefined)?.final === true;
/**
 * The cat's word for where she stopped, in the hub (WorldDef.left): with nothing new, "the other worlds still sleep,
 * shall we go back to the fairies?" - on a tap always (the shared words speak of friends, the hub has none), as she
 * comes in only while LEAD_HOME. With an open world not done yet - the shared words.
 */
export function hubLeft(save: Save, why: 'tap' | 'entry', leadHome = LEAD_HOME): 'hub_asleep' | null {
  if (somethingNew(openArches(portalWorlds(knownWorlds()), doneIn(save)), doneIn(save))) return null;
  return why === 'tap' || leadHome ? 'hub_asleep' : null;
}
/** The flags of the hub's part of the save: the cat's three words of the sea, each said once. */
export const SEA_WORDS = { wake: 'sea_wake', home: 'sea_home', after: 'sea_after' } as const;
/**
 * The cat's words of the sea as she comes into the hub (docs/worlds/world-3.md, the lines of 2026-11-18), each once,
 * before the usual word: the sea done - "the pearl is home, one more nest lit"; the next time - the tree grew. Marks
 * what it returns; null - none. "The portal to the sea woke up" (hub_sea_wake) is said by the arch waking (`wakeUp`
 * below), as every world's hub_<world>_wake; its flag SEA_WORDS.wake marks the sea's arch awake (`wakingArches`).
 */
export function seaWord(ws: WorldState, save: Save, worlds: readonly (string | null)[]): 'hub_sea_home' | 'hub_sea_after' | null {
  if (!worlds.includes('sea')) return null;
  const said = (flag: string) => ws.flags[flag] === true;
  let word: 'hub_sea_home' | 'hub_sea_after' | null = null, flag = '';
  if (doneIn(save)('sea')) {
    if (!said(SEA_WORDS.home)) { word = 'hub_sea_home'; flag = SEA_WORDS.home; }
    else if (!said(SEA_WORDS.after)) { word = 'hub_sea_after'; flag = SEA_WORDS.after; }
  }
  if (word) ws.flags[flag] = true;
  return word;
}
/**
 * A world's own flag that already marks its arch awake (its word of waking said before the arches woke): the sea's
 * SEA_WORDS.wake. Set with the hub's woke<shelf> as the arch wakes, so either answers for the other.
 */
export const HEARD_WAKE: Readonly<Record<string, string>> = { sea: SEA_WORDS.wake };
/** The flag of the hub's part of the save that marks the tour done (the id of its item). */
export const TOUR = 'toured';

const LINES: WorldLines = { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'hub_title', partText: 'hub_count' };

const MUSIC: MusicParams = {
  scale: [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3],
  chords: [[130.8, 196, 329.6], [110, 164.8, 261.6], [98, 146.8, 246.9]],
};

/** Flat ground: the trunk, the posts of the arches and the edge of the glade keep a walker in. */
const colliders: { x: number; z: number; r: number }[] = [];
const ground: WorldGround = {
  height: () => 0,
  resolve(p, radius) {
    for (const c of colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, min = c.r + radius, d = Math.hypot(dx, dz);
      if (d < min && d > 1e-3) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
    }
    const d = Math.hypot(p.x, p.z);
    if (d > RADIUS - 1) { p.x *= (RADIUS - 1) / d; p.z *= (RADIUS - 1) / d; }
  },
  raycast(origin, dir, out) {
    if (dir.y >= 0) return false;
    out.copy(origin).addScaledVector(dir, -origin.y / dir.y).setY(0);
    return true;
  },
  block: (x, z, r) => { colliders.push({ x, z, r }); },
};

/** A clear morning: the far plan goes into a fog of the colour of the sky (WORLD-10). */
function buildSky(scene: THREE.Scene): WorldSky {
  scene.background = new THREE.Color('#bfe3f7');
  scene.fog = new THREE.Fog('#bfe3f7', 32, 90);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  const cam = sun.shadow.camera;
  cam.left = -28; cam.right = 28; cam.top = 28; cam.bottom = -28; cam.near = 1; cam.far = 120;
  scene.add(new THREE.HemisphereLight('#e6f4ff', '#9ccf7a', 1.25), sun, sun.target);
  return { sun, sunOffset: new THREE.Vector3(16, 34, 12) };
}

/** What the hub loads: models already in the installation (the first world's), its look made of its own shapes (H). */
interface HubLoads { tree: TreeLoads; arch: ArchLoads; glade: GladeLoads }
const loadHub = async (_scene: THREE.Scene, save: Save, _touch: boolean, scope: WorldScope): Promise<HubLoads> => {
  const [tree, arch, glade] = await Promise.all([loadTreeLook(), loadArchLook(), loadGladeLook(),
    // the pets found whose model is a file of their world (the owlet of the forest): from that world's files, already
    // in the cache; one that does not come stays at home (src/game/pets.ts loadOwnPets)
    loadOwnPets('hub', ownFound(save), scope)]);
  return { tree, arch, glade };
};

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });

/** The ring that closes the edge (WORLD-10): trees and rocks just outside the glade, two rows deep. */
function buildRing(scene: THREE.Scene) {
  const trunks: THREE.Matrix4[] = [], tops: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), at = new THREE.Vector3();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [r, n] of [[RADIUS + 2.5, 34], [RADIUS + 7, 40]] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.12, rr = r + rnd() * 2.5, k = 0.8 + rnd() * 0.6;
      at.set(Math.sin(a) * rr, 0, Math.cos(a) * rr);
      if (i % 5 === 2) {
        rocks.push(m.compose(at.clone().setY(0.4), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), s.set(1.6 * k, 1.1 * k, 1.4 * k)).clone());
        continue;
      }
      trunks.push(m.compose(at.clone().setY(1.2 * k), q.identity(), s.set(k, k, k)).clone());
      tops.push(m.compose(at.clone().setY(4.4 * k), q.identity(), s.set(k, k * (0.9 + rnd() * 0.4), k)).clone());
    }
  }
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((x, i) => im.setMatrixAt(i, x));
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
  };
  put(new THREE.CylinderGeometry(0.3, 0.42, 2.4, 6), std('#7a5a3e'), trunks);
  put(new THREE.ConeGeometry(2.1, 6, 7), std('#3f7d4a'), tops);
  put(new THREE.DodecahedronGeometry(1, 0), std('#8f8c86'), rocks);
}

/**
 * The stage of the Tree the walkthrough asks for (`?debug&hubStage=N`, 1-4): the budget of the hub is checked on the
 * fourth stage, which no build reaches by its artifacts yet (tools/worlds.mjs, the hub's budget). Without ?debug - none.
 */
export function forcedStage(search = typeof location === 'undefined' ? '' : location.search): TreeStage | null {
  const q = new URLSearchParams(search), n = Number(q.get('hubStage'));
  return q.has('debug') && Number.isInteger(n) && n >= 1 && n <= 4 ? (n as TreeStage) : null;
}

function buildHub(g: Game, L: HubLoads, sky: WorldSky, scope: WorldScope): BuiltWorld {
  const { scene, save, ws, flies } = g;
  scope.own(() => { colliders.length = 0; });
  // The voice of the hub (R34): its clips are in voice/hub/, part of the installation; the list is taken back as it is left.
  scope.own(worldClips(hub.id, CLIPS));
  const gear = createGear(g.heroRig, g.heroRig.gear, [], g.sparks);

  const glade = new THREE.Mesh(new THREE.CircleGeometry(RADIUS + 14, 56), std('#8fcf6a', { flatShading: false }));
  glade.rotation.x = -Math.PI / 2; glade.receiveShadow = true;
  scene.add(glade);
  // The Great Tree in the stage of the artifacts back (R33), the arches round it, the nests on its trunk.
  const stage = forcedStage() ?? treeStage(artifactCount(save));
  const tree = buildTreeLook(scene, stage, L.tree, ground.block);
  // the keepsakes of the secrets found and the sets gathered in the worlds, over the stage (./keepsakes.ts): drawn in
  // the nests' call (below)
  const keepsakes = buildKeepsakes(save);
  // the cauldron by the roots (PLAY-26, ./cauldron-look.ts): drawn in the nests' call (below), walked round, brewed at
  ground.block(CAULDRON.x, CAULDRON.z, CAULDRON.r);
  const cauldronAt = new THREE.Vector3(CAULDRON.x, 0, CAULDRON.z);
  const openPot = () => openCauldron({ save, persist: () => g.persist(), pause: (v) => { g.paused = v; if (v) g.speech.caption(null); }, say: (k) => { void g.speech.line(k, 'hint', 5000); } });
  // the pet that walks after her plays round the ring of mushrooms while she stands by the stump (./ring-play.ts)
  scope.own(steerPet(ringPlay(stumpAt(), () => g.hero.root.position, () => g.busy)));
  // the pet's shadow: none on the fourth stage (the budget of 80 draw calls), a spot under it instead (./pet-shadow.ts)
  const blob = petCastsShadow(stage) ? null : petBlob(scene);
  if (blob) scope.own(petShadows(false));
  // the rainbow's ribbon (one call while it acts) off on the fourth stage too: its sparkles alone there
  if (blob) scope.own(rainbowRibbon(false));
  // the ring's notes played (for the walkthrough: ?debug)
  const notes: number[] = [];
  // The feather of the day (./feathers.ts): when the hub's found grows, today is its day, the bird of the next one falls
  // asleep on its branch; the first feather ever - the cat's word.
  let foundN = foundOf(ws).length;
  const sleep = () => tree.bird.show(birdAsleep(ws, featherDay()));
  sleep();
  const watchFeathers = () => {
    const n = foundOf(ws).length;
    if (n === foundN) return;
    foundN = n;
    if (featherTaken(ws, featherDay())) void g.speech.line('hub_feather', 'hint', 6000);
    g.persist();
    sleep();
  };
  const leadsTo = openArches(portalWorlds(knownWorlds()), doneIn(save));
  const { arches: portals, update: breathe, wake } = buildArches(scene, leadsTo, ground.block, wakingArches(leadsTo, ws.flags, HEARD_WAKE));
  // The arches whose world opened since she was last here wake once she is free and the cat silent (docs/worlds/hub.md, step 4): the
  // vines fall, the stone warms, the veil and the runes light; the camera on the first of them, the controls held. Then
  // the cat's word of that world's waking (hub_<world>_wake), if the hub has it. `hold` keeps it at a moment (?debug).
  const waking = { t: 0, on: false, hold: null as number | null, end: null as (() => void) | null };
  // the controls held as a scene of the world holds them (src/game/context.ts createStage): given back only in the
  // entry it was taken in (a change of world gives them back itself)
  const visit = g.visit;
  const wakeUp = () => {
    if (!wake) return;
    const first = portals[wake.shelves[0]];
    waking.on = true;
    g.busy = true; g.auto = null;
    g.cam.focus = new THREE.Vector3(first.x * 0.92, 2.6, first.z * 0.92);
    sfx('chime');
    waking.end = () => {
      for (const shelf of wake.shelves) g.sparks.burst(new THREE.Vector3(portals[shelf].x, 2.4, portals[shelf].z), PORTALS[shelf].colour, 40, 3);
      wake.done();
      for (const shelf of wake.shelves) { ws.flags[woke(shelf)] = true; const own = HEARD_WAKE[portals[shelf].world ?? '']; if (own) ws.flags[own] = true; }
      g.persist();
      waking.on = false;
      if (g.visit !== visit) return;
      g.busy = false; g.cam.focus = null; g.hero.play('Idle');
      // the word of the first of them that has one (the forest's and the sea's waking together: the forest's, else the sea's)
      const key = wake.shelves.map((shelf) => `hub_${portals[shelf].world}_wake`).find((k) => k in strings.spoken);
      if (key) void g.speech.line(key as SpokenKey, 'hint', 6000);
    };
  };
  const { nests, update: glow } = buildNestLook(scene, L.arch, [cauldronGeometry(), ...(keepsakes.geometry ? [keepsakes.geometry] : [])]);
  // the glade dressed (./glade-look.ts): paths to the tree from the open arches, bushes, rocks, ferns, the motes
  const dressed = buildGladeLook(scene, L.glade, portals.filter((p) => p.world !== null), ground.block);
  buildRing(scene);

  // The light of each artifact back, in the nest of its place (read from the save: it comes back with the final).
  const shelfOf = (shelf: number) => knownWorlds().find((w) => w.shelf === shelf)?.id ?? null;
  const lit = () => nests.map((n) => { const id = shelfOf(n.shelf); return id !== null && artifactBack(save, id); });
  const paint = () => lit().forEach((on, i) => { nests[i].set(on, PORTALS[nests[i].shelf].colour); });
  paint();

  // The tour: the shared one, with the path of the glade; visited = toured (the flag is the item's mark).
  const tour = setTour(g, { path: HUB_FLYOVER, visited: () => ws.flags[TOUR] === true, mark: () => { ws.flags[TOUR] = true; g.persist(); } });
  const flyover = marked(ws, { kind: 'flyover', id: TOUR, how: 'auto', active: () => flyoverOf(g)?.active === true });

  const open = portals.filter((p) => p.world !== null);
  const done = doneIn(save);
  const sleeping = portals.filter((p) => p.world === null), heard = new Set<number>();
  const home = portals[0];   // the arch of the first world: the fairies' (R9)
  // The cat leads to the next open arch whose world is not done yet (R10); none - back to the fairies' (LEAD_HOME).
  const frameGoal = () => open.find((p) => !done(p.world!))?.at ?? (LEAD_HOME && home.world !== null ? home.at : null);
  return {
    frame: {
      spots: [...open.map((p): Spot => ({ pos: p.at, r: PORTAL_SPOT, label: 'open', on: () => true, run: () => { void travel(p.world!); } })),
        { pos: cauldronAt, r: 2.2, label: 'brew', on: () => shownRecipes(save).length > 0, run: openPot }],
      // a tap on a mushroom of the ring round the stump: its note and its flash (./ring-notes.ts); only while she is free
      tap: (screenDist) => {
        if (g.busy || !g.started()) return false;
        const i = ringTapped(tree.ring.tops, screenDist, g.touch ? 56 : 40);
        if (i === null) return false;
        tree.ring.flash(i); note(ringNote(i, tree.ring.tops.length)); notes.push(i);
        return true;
      },
      afterMove: (time, grounded) => gear.update(time, grounded),
      // By a sleeping arch the cat says its world sleeps (D) - once as she comes near, not while something else is said.
      update: (dt, _time, canMove) => {
        watchFeathers();
        // once the cat is silent: after the tour's word, or the word she came in to
        if (wake && !waking.on && waking.t === 0 && canMove && !g.busy && !flyoverOf(g)?.active && !speaking()) wakeUp();
        if (waking.on && waking.end) {
          waking.t = waking.hold ?? Math.min(1, waking.t + dt / WAKE_S);
          wake!.set(waking.t);
          if (waking.t >= 1 && waking.hold === null) { const end = waking.end; waking.end = null; end(); }
        }
        if (!canMove || g.busy) return;
        const at = g.hero.root.position, shelf = sleepingToSpeakOf(at.x, at.z, sleeping, heard);
        if (shelf !== null) void g.speech.line('hub_sleeping', 'hint', 5000);
      },
      goal: frameGoal,
      animate: (_dt, time) => {
        flies.update(time);
        tree.update(time); breathe(time); glow(time); dressed.update(time);
        blob?.place(g.pets.follower?.root.position ?? null);
      },
      focusDist: () => 6.5,
      beforeRender: (hp) => { sky.sun.position.copy(hp).add(sky.sunOffset); sky.sun.target.position.copy(hp); },
    },
    debug: {
      npcs: [],
      more: { flyoverPlayer: tour, hub: { portals: () => portals.map((p) => ({ shelf: p.shelf, world: p.world, x: p.x, z: p.z })), nests: lit, keepsakes: () => keepsakes.list.map((k) => `${k.world}/${k.id}`), feathers: (day?: string | null) => { if (day !== undefined) { featherState.day = day; sleep(); } return { day: featherDay(), lying: featherOfDay(ws, featherDay()), bird: tree.bird.at() && { ...tree.bird.at()! } }; }, cauldron: () => ({ x: CAULDRON.x, z: CAULDRON.z, recipes: shownRecipes(save).map((r) => r.id), open: () => openPot() }), petShadow: () => ({ stage, cast: petCastsShadow(stage), blob: blob?.mesh.visible ?? false }), ring: () => ({ tops: tree.ring.tops.map((p) => ({ x: p.x, y: p.y, z: p.z })), notes: [...notes] }), goal: () => { const v = frameGoal(); return v && { x: v.x, z: v.z }; }, left: (why: 'tap' | 'entry') => hubLeft(save, why),
        // the arches waking (or woken) in this entry: how far, whether it plays; `hold(t)` keeps it at t, null lets it go
        wake: (hold?: number | null) => { if (hold !== undefined) waking.hold = hold; return { shelves: wake?.shelves ?? [], t: waking.t, on: waking.on }; } } },
      talk: () => {},
      cheatWorld: () => '',
    },
    book: { parts: () => [], stats: () => [{ icon: '⭐', label: 'col_stars', value: String(save.stars) }] },
    lines: LINES,
    hud: () => `${artifactCount(save)}/5`,
    // the artifacts back on the Great Tree, not the shards of a world: the tree's own icon by the counter
    hudIcon: '🌳',
    gear,
    items: () => [flyover],
  };
}

/** The hub: listed in src/worlds/index.ts. It has no place on the shelf: no artifact of its own. */
export const hub: WorldDef<HubLoads, WorldSky> = {
  id: 'hub',
  spawn: { x: SPAWN.x, z: SPAWN.z },
  // At the arch of the world she came from, facing the tree (R9, R30); a world with no arch here - where she stood.
  arrive: (from) => {
    const at = portalWorlds(knownWorlds()).indexOf(from);
    return at < 0 ? null : arrivalAt(at);
  },
  ground,
  left: (ws, save, why) => (why === 'entry' ? seaWord(ws, save, portalWorlds(knownWorlds())) : null) ?? hubLeft(save, why),
  characters: [],
  // the feathers of the Great Tree's bird, one a day (./feathers.ts, the customer's word of 2026-11-20)
  collect: HUB_COLLECT,
  strings,
  music: MUSIC,
  sky: buildSky,
  load: loadHub,
  build: buildHub,
};
