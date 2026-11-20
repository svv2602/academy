import * as THREE from 'three';
import type { Save } from '../../core/save';
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
import { portalWorlds } from './portals';
import CLIPS from './clips.json';
import { strings } from './strings';
import { buildTreeLook, loadTreeLook, treeStage, type TreeLoads } from './tree-look';
import { buildArches, buildNestLook, loadArchLook, type ArchLoads } from './arch-look';
import { buildGladeLook, loadGladeLook, type GladeLoads } from './glade-look';

/**
 * The hub, the Great Tree (WORLD-01, docs/worlds/hub.md): the home between the worlds the heroine comes back to after
 * every artifact. Its map, distances and tour are the grey build's the customer took (WORLD-12, R14); its look (H) is
 * of its own shapes: the Tree in four stages by the artifacts back (./tree-look.ts, R33), the stone arches with their
 * veils and the nests (./arch-look.ts).
 *
 * No tasks, no secrets, no pet (R5, R30). An arch whose world the registry has is open: it breathes, and walking up
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
const loadHub = async (_scene: THREE.Scene, _save: Save, _touch: boolean): Promise<HubLoads> => {
  const [tree, arch, glade] = await Promise.all([loadTreeLook(), loadArchLook(), loadGladeLook()]);
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
  const tree = buildTreeLook(scene, treeStage(artifactCount(save)), L.tree, ground.block);
  const { arches: portals, update: breathe } = buildArches(scene, portalWorlds(knownWorlds()), ground.block);
  const { nests, update: glow } = buildNestLook(scene, L.arch);
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
  const done = (id: string) => (save.worlds[id] as { final?: boolean } | undefined)?.final === true;
  return {
    frame: {
      spots: open.map((p): Spot => ({ pos: p.at, r: PORTAL_SPOT, label: 'open', on: () => true, run: () => { void travel(p.world!); } })),
      tap: () => false,
      afterMove: (time, grounded) => gear.update(time, grounded),
      update: () => {},
      // The cat leads to the next open arch whose world is not done yet (R10); none - she is free.
      goal: () => open.find((p) => !done(p.world!))?.at ?? null,
      animate: (_dt, time) => {
        flies.update(time);
        tree.update(time); breathe(time); glow(time); dressed.update(time);
      },
      focusDist: () => 6.5,
      beforeRender: (hp) => { sky.sun.position.copy(hp).add(sky.sunOffset); sky.sun.target.position.copy(hp); },
    },
    debug: {
      npcs: [],
      more: { flyoverPlayer: tour, hub: { portals: () => portals.map((p) => ({ shelf: p.shelf, world: p.world, x: p.x, z: p.z })), nests: lit } },
      talk: () => {},
      cheatWorld: () => '',
    },
    book: { parts: () => [], stats: () => [{ icon: '⭐', label: 'col_stars', value: String(save.stars) }] },
    lines: LINES,
    hud: () => `${artifactCount(save)}/5`,
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
  characters: [],
  strings,
  music: MUSIC,
  sky: buildSky,
  load: loadHub,
  build: buildHub,
};
