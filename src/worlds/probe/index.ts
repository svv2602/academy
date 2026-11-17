import * as THREE from 'three';
import { rig, staticGeo } from '../../core/assets';
import type { Save } from '../../core/save';
import { Actor } from '../../game/actor';
import { createStage, type Game } from '../../game/context';
import { createDialogue } from '../../game/dialogue';
import { createGear, loadGear } from '../../game/gear';
import { buildHero } from '../../game/hero';
import type { BuiltWorld, CharacterDef, MusicParams, Npc, WorldDef, WorldGround, WorldLines, WorldSky } from '../../game/world';
import { showNotice } from '../../ui/ui';
import { strings } from './strings';

/**
 * The probe world: a test world (TECH-15), never part of the published game. The registry lists it only in a build
 * made with `--mode probe` (src/worlds/index.ts), and `npm run e2e` plays it there (the step "worlds",
 * tools/worlds.mjs). It is the smallest world the shared code can play: a flat meadow, a sky of its own, one character
 * with one panel task, and two files of its own in the folders of its world (worlds-test/probe/: a model and a
 * picture) - what the loading, the cache and the release of a world are tried on.
 */

/** m: the radius of the meadow; a walker stays a step inside it. */
const RADIUS = 20;
const SPAWN = { x: 0, z: 6 };
/** The world's own files (worlds-test/probe/, copied into the probe build by vite.config.ts): a model and a picture. */
const STUMP = { model: 'probe/stump', x: 5, z: -2 };
const SIGN = { picture: 'story/probe/sign.webp', x: -4, z: -3 };

const FRIENDS: readonly CharacterDef[] = [{ id: 'friend', emoji: '🦊', x: 0, z: -4, heading: 0, steps: ['add'], shard: '#ff9a5c' }];

/** The lines of the shared conversation: the recorded shared ones, the world has no spoken line of its own. */
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

/** The meadow joins the scene at once; the models and the picture load together. Null = failed for good (TECH-08). */
async function loadProbe(scene: THREE.Scene, save: Save, _touch: boolean) {
  const meadow = new THREE.Mesh(new THREE.CircleGeometry(RADIUS + 6, 48), new THREE.MeshStandardMaterial({ color: '#8fcf6a', roughness: 0.95 }));
  meadow.rotation.x = -Math.PI / 2; meadow.receiveShadow = true;
  scene.add(meadow);
  const loads = await Promise.all([
    // The heroine's items hang under her bones while she is still in her rest pose (src/game/gear.ts).
    buildHero(save).then(async (h) => Object.assign(h, { gear: await loadGear(h) })),
    rig('extra/cat2', 0.62, true), rig('animals_pack/Fox', 0.8, true), staticGeo('platformer_game_pack/Star', 0.7),
    staticGeo(STUMP.model, 0.7), new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}${SIGN.picture}`),
  ]).catch((e: unknown) => {
    console.error('the game could not load:', e);
    showNotice('load_failed', () => location.reload());
    return null;
  });
  if (!loads) return null;
  const [heroRig, catRig, foxRig, starGeo, stumpGeo, signMap] = loads;
  return { heroRig, catRig, foxRig, starGeo, stumpGeo, signMap };
}
type ProbeLoads = NonNullable<Awaited<ReturnType<typeof loadProbe>>>;

function buildProbe(g: Game, L: ProbeLoads, sky: WorldSky): BuiltWorld {
  const { scene, hero, save, ws, flies, speech, groundY } = g;
  const gear = createGear(L.heroRig, L.heroRig.gear, [], g.sparks);

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

  return {
    frame: {
      spots: npcs.map((n) => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void talk(n); } })),
      tap: () => false,
      afterMove: (time, grounded) => gear.update(time, grounded),
      update: (dt, time) => {
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
    debug: { npcs, more: {}, talk: (id) => { const n = npcs.find((x) => x.def.id === id); if (n) void talk(n); }, cheatWorld: () => '' },
    book: {
      parts: () => npcs.map((n) => ({ color: n.def.shard, icon: n.def.emoji, got: finished(n) })),
      stats: () => [{ icon: '⭐', label: 'col_stars', value: String(save.stars) }],
    },
    lines: LINES,
    hud: () => `${done()}/${npcs.length}`,
    gear,
  };
}

/** The probe world: listed in src/worlds/index.ts for the probe build only (CI plays it in the job "worlds"). */
export const probe: WorldDef<ProbeLoads, WorldSky> = {
  id: 'probe',
  spawn: SPAWN,
  ground,
  characters: FRIENDS,
  strings,
  music: MUSIC,
  sky: buildSky,
  load: loadProbe,
  build: buildProbe,
};
