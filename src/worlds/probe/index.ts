import * as THREE from 'three';
import { rig, staticGeo } from '../../core/assets';
import type { Save } from '../../core/save';
import { worldClips } from '../../core/voice';
import { Actor } from '../../game/actor';
import { createStage, type Game } from '../../game/context';
import { createDialogue } from '../../game/dialogue';
import { loadFailed } from '../../game/boot';
import { createGear } from '../../game/gear';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { travel } from '../../game/travel';
import type { BuiltWorld, CharacterDef, MusicParams, Npc, WorldDef, WorldGround, WorldLines, WorldSky } from '../../game/world';
import CLIPS from './clips.json';
import { PET_AT, SECRET, createItems } from './items';
import { strings } from './strings';

/**
 * The probe world: a test world (TECH-15), never part of the published game. The registry lists it only in a build
 * made with `--mode probe` (src/worlds/index.ts), and `npm run e2e` plays it there (the step "worlds",
 * tools/worlds.mjs). It is the smallest world the shared code can play: a flat meadow, a sky of its own, one character
 * with one panel task, and three files of its own in the folders of its world (worlds-test/probe/: a model, a
 * picture and a clip of the voice) - what the loading, the cache and the release of a world are tried on. It also has
 * one point of every kind of the world template (ARCH-16, ./items.ts and the pet below): what the description of a
 * world is tried on.
 */

/** m: the radius of the meadow; a walker stays a step inside it. */
const RADIUS = 20;
const SPAWN = { x: 0, z: 6 };
/** The world's own files (worlds-test/probe/, copied into the probe build by vite.config.ts): a model and a picture. */
const STUMP = { model: 'probe/stump', x: 5, z: -2 };
const SIGN = { picture: 'story/probe/sign.webp', x: -4, z: -3 };
/** The portal home (TECH-15): a ring to walk up to; its action button changes the world to `to` without a reload. */
const PORTAL = { to: 'fairy', x: 7, z: 3 };

/** The character greets with the world's one spoken line of its own: its clip lies in the folder of the world (./clips.json). */
const FRIENDS: readonly CharacterDef[] = [{ id: 'friend', emoji: '🦊', x: 0, z: -4, heading: 0, steps: ['add'], shard: '#ff9a5c', hi: 'probe_hi' }];

/** The lines of the shared conversation: the recorded shared ones (the world's own line is the greeting above). */
const LINES: WorldLines = { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'probe_part', partText: 'probe_count' };

const MUSIC: MusicParams = {
  scale: [293.7, 329.6, 370, 440, 493.9, 587.3, 659.3],
  chords: [[146.8, 220, 370], [123.5, 185, 293.7]],
};

/** Flat ground: round obstacles and the edge of the meadow keep a walker in. */
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

/** A sky of its own: an evening colour, its fog and two lights. */
function buildSky(scene: THREE.Scene): WorldSky {
  scene.background = new THREE.Color('#ffd9b8');
  scene.fog = new THREE.Fog('#ffe2c6', 40, 160);
  const sun = new THREE.DirectionalLight('#ffe9c9', 2.2);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  const cam = sun.shadow.camera;
  cam.left = -20; cam.right = 20; cam.top = 20; cam.bottom = -20; cam.near = 1; cam.far = 100;
  scene.add(new THREE.HemisphereLight('#ffe8d2', '#b9d18a', 1.2), sun, sun.target);
  return { sun, sunOffset: new THREE.Vector3(18, 30, 14) };
}

/**
 * The meadow joins the scene at once; the world's own models and its picture load together (the heroine and the cat are
 * the game's, src/game/boot.ts). Null = failed for good (TECH-08).
 */
async function loadProbe(scene: THREE.Scene, _save: Save, _touch: boolean) {
  const meadow = new THREE.Mesh(new THREE.CircleGeometry(RADIUS + 6, 48), new THREE.MeshStandardMaterial({ color: '#8fcf6a', roughness: 0.95 }));
  meadow.rotation.x = -Math.PI / 2; meadow.receiveShadow = true;
  scene.add(meadow);
  const loads = await Promise.all([
    rig('animals_pack/Fox', 0.8, true), staticGeo('platformer_game_pack/Star', 0.7),
    staticGeo(STUMP.model, 0.7), new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}${SIGN.picture}`),
  ]).catch((e: unknown) => {
    loadFailed(e);
    return null;
  });
  if (!loads) return null;
  const [foxRig, starGeo, stumpGeo, signMap] = loads;
  return { foxRig, starGeo, stumpGeo, signMap };
}
type ProbeLoads = NonNullable<Awaited<ReturnType<typeof loadProbe>>>;

function buildProbe(g: Game, L: ProbeLoads, sky: WorldSky, scope: WorldScope): BuiltWorld {
  const { scene, hero, save, ws, flies, speech, groundY } = g;
  // The colliders are one list of the module: the world empties it as it is left, a second entry starts from none.
  scope.own(() => { colliders.length = 0; });
  // The voice of the world (TECH-09): its own clips are in voice/probe/; the list is taken back as the world is left.
  scope.own(worldClips(probe.id, CLIPS));
  // The heroine's model is the game's: a world makes her items of it.
  const gear = createGear(g.heroRig, g.heroRig.gear, [], g.sparks);

  // The world's own model, and its own picture on a signboard.
  const stump = new THREE.Mesh(L.stumpGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  stump.position.set(STUMP.x, 0, STUMP.z); stump.castShadow = true;
  ground.block(STUMP.x, STUMP.z, 0.6);
  L.signMap.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: L.signMap, side: THREE.DoubleSide }));
  board.position.set(SIGN.x, 1.3, SIGN.z);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#b9793f', roughness: 0.9 }));
  post.position.set(SIGN.x, 0.45, SIGN.z); post.castShadow = true;
  ground.block(SIGN.x, SIGN.z, 0.3);
  scene.add(stump, board, post);
  // The portal home: a glowing ring standing on the meadow.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 10, 32), new THREE.MeshStandardMaterial({ color: '#c9a6ff', emissive: '#8a5cff', emissiveIntensity: 0.8, roughness: 0.4 }));
  ring.position.set(PORTAL.x, 1.3, PORTAL.z); ring.castShadow = true;
  scene.add(ring);
  const portal = new THREE.Vector3(PORTAL.x, groundY(PORTAL.x, PORTAL.z), PORTAL.z);

  const starMat = new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb300', emissiveIntensity: 1.1, roughness: 0.3 });
  const npcs: Npc[] = FRIENDS.map((def) => {
    const actor = new Actor(L.foxRig);
    const pos = new THREE.Vector3(def.x, groundY(def.x, def.z), def.z);
    actor.root.position.copy(pos); actor.heading = def.heading; actor.root.rotation.y = def.heading;
    actor.play('Idle');
    ground.block(def.x, def.z, 0.8);
    const mark = new THREE.Mesh(L.starGeo, starMat);
    scene.add(actor.root, mark);
    return { def, actor, pos, mark, idle: 'Idle', timer: 0 };
  });
  const finished = (n: Npc) => (ws.quests[n.def.id] ?? 0) >= n.def.steps.length;
  const done = () => npcs.filter(finished).length;

  const stage = createStage(g, () => speech.caption(null));
  const { talk } = createDialogue(g, stage, { characters: FRIENDS, lines: LINES, tasks: {} });
  // One point of every kind of the world template: the secret in the stump, the part it hides, the cutscene of the
  // signboard, the tour and the finale. The pet is declared below; the game shows it.
  const items = createItems(g, stage, scope, { stump: STUMP, sign: SIGN, picture: board.position, taps: window });

  return {
    frame: {
      spots: [
        ...npcs.map((n): Spot => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void talk(n); } })),
        // The portal home: the same `travel` the game changes the world with.
        { pos: portal, r: 2.2, label: 'open', on: () => true, run: () => { void travel(PORTAL.to); } },
        ...items.spots,
      ],
      tap: () => false,
      afterMove: (time, grounded) => gear.update(time, grounded),
      update: (dt, time, canMove) => {
        items.update(dt, time, canMove);
        const hp = hero.root.position;
        for (const n of npcs) {
          n.actor.face(Math.hypot(n.pos.x - hp.x, n.pos.z - hp.z) < 7 ? Math.atan2(hp.x - n.pos.x, hp.z - n.pos.z) : n.def.heading, dt, 3);
          n.mark.visible = !finished(n) && !g.busy;
          n.mark.rotation.y = time * 2; n.mark.position.set(n.pos.x, n.pos.y + 1.7 + Math.sin(time * 2.5) * 0.15, n.pos.z);
          n.actor.update(dt);
        }
      },
      goal: () => npcs.find((n) => !finished(n))?.pos ?? null,
      animate: (_dt, time) => flies.update(time),
      focusDist: () => 6.5,
      beforeRender: (hp) => { sky.sun.position.copy(hp).add(sky.sunOffset); sky.sun.target.position.copy(hp); },
    },
    // `flyoverPlayer`: the state of the tour with skip() and hold(i), under the name the first world gives its own.
    debug: { npcs, more: { flyoverPlayer: items.tour }, talk: (id) => { const n = npcs.find((x) => x.def.id === id); if (n) void talk(n); }, cheatWorld: () => '' },
    book: {
      parts: () => npcs.map((n) => ({ color: n.def.shard, icon: n.def.emoji, got: finished(n) })),
      stats: () => [{ icon: '⭐', label: 'col_stars', value: String(save.stars) }],
    },
    lines: LINES,
    hud: () => `${done()}/${npcs.length}`,
    gear,
    items: items.items,
  };
}

/** The probe world: listed in src/worlds/index.ts for the probe build only. */
export const probe: WorldDef<ProbeLoads, WorldSky> = {
  id: 'probe',
  spawn: SPAWN,
  ground,
  characters: FRIENDS,
  // The fawn of the core's catalog of pets (src/game/pets.ts), found here in this world's own part of the save.
  pet: { species: 'fawn', at: PET_AT, after: FRIENDS[0].id },
  secrets: [SECRET],
  strings,
  music: MUSIC,
  sky: buildSky,
  load: loadProbe,
  build: buildProbe,
};
