import * as THREE from 'three';
import type { Save } from '../../core/save';
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
import { NESTS, PORTALS, RADIUS, TREE, arrivalAt, trunkR } from './layout';
import { portalWorlds } from './portals';
import { strings } from './strings';

/**
 * The hub, the Great Tree (WORLD-01, docs/worlds/hub.md): the home between the worlds the heroine comes back to after
 * every artifact. The grey build (WORLD-12): every shape is a plain one - a trunk of cylinders with a crown of
 * spheres, five arches of boxes, the nests as rings - for the customer to take the map, the distances and the tour
 * before the models, the stages of the tree and the voice are made (R14).
 *
 * No tasks, no secrets, no pet (R5, R30). An arch whose world the registry has is open: it breathes, and walking up
 * to it changes the world (`travel`, through the gate: a world not downloaded, without the network, stays shut and
 * the cat says so, R16). The others sleep, grey and overgrown, with the sign of their world. A nest glows in the
 * colour of its world once that world's artifact is back (its light, not the artifact itself - R7). She appears at
 * the arch of the world she came from (R9, `arrive`); the cat leads to the next open arch whose world is not done
 * (R10). The tour flies from the roots up to the nest of the crystal, then round the arches (R12, R19) - silent
 * until its line is recorded (R34). The hub has no files of its own: it is part of the installation (R31).
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

/** Nothing to load: the grey build is made of shapes (and the heroine and the cat are the game's). */
const loadHub = (_scene: THREE.Scene, _save: Save, _touch: boolean): Promise<Record<string, never>> => Promise.resolve({});

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });

/** The Great Tree: a trunk of two cylinders, a few roots and a crown of spheres over the glade. */
function buildTree(scene: THREE.Scene) {
  const bark = std('#8a6142'), leaves = std('#5f9e57');
  const tree = new THREE.Group();
  const low = new THREE.Mesh(new THREE.CylinderGeometry(trunkR(TREE.h * 0.55), trunkR(0), TREE.h * 0.55, 14), bark);
  low.position.y = TREE.h * 0.275;
  const high = new THREE.Mesh(new THREE.CylinderGeometry(trunkR(TREE.h), trunkR(TREE.h * 0.55), TREE.h * 0.45 + 0.2, 14), bark);
  high.position.y = TREE.h * 0.775;
  tree.add(low, high);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5, root = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, 3.2, 6), bark);
    root.position.set(Math.sin(a) * (TREE.r + 0.9), 0.35, Math.cos(a) * (TREE.r + 0.9));
    root.rotation.set(Math.cos(a) * 1.25, 0, -Math.sin(a) * 1.25);
    tree.add(root);
  }
  const crown: [number, number, number, number][] = [[0, TREE.crown + 1, 0, 6.5], [6, TREE.crown - 0.5, 2, 5], [-5, TREE.crown, 4, 5], [-3, TREE.crown - 0.3, -6, 5.2], [5, TREE.crown + 0.5, -5, 4.8], [0, TREE.crown + 4, 1, 4.5]];
  for (const [x, y, z, r] of crown) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaves);
    s.position.set(x, y, z);
    tree.add(s);
  }
  tree.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(tree);
  ground.block(TREE.x, TREE.z, trunkR(0) + 0.4);
}

/** The nests on the trunk: a ring each, and the light of the world's artifact in it once it is back. */
function buildNests(scene: THREE.Scene) {
  return NESTS.map((n) => {
    const r = trunkR(n.y) + 0.35, x = Math.sin(n.a) * r, z = Math.cos(n.a) * r;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.18, 6, 14), std('#6d4b33'));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, n.y, z);
    const mat = new THREE.MeshStandardMaterial({ color: '#4a4a4a', roughness: 0.5 });
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), mat);
    light.position.set(x, n.y + 0.2, z);
    scene.add(ring, light);
    return { shelf: n.shelf, light, mat };
  });
}

/** The sign of a sleeping world: a board with its symbol by the arch. */
function signTexture(icon: string, colour: string) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  if (x) {
    x.fillStyle = '#5b5148'; x.fillRect(0, 0, 128, 128);
    x.globalAlpha = 0.85; x.font = '84px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.filter = 'grayscale(1) brightness(0.35)'; x.fillText(icon, 64, 70);
    x.filter = 'none'; x.globalAlpha = 1; x.strokeStyle = colour; x.lineWidth = 6; x.strokeRect(3, 3, 122, 122);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The five arches round the tree: open ones breathe in their colour, the others sleep under vines with a sign. */
function buildPortals(scene: THREE.Scene, leadsTo: readonly (string | null)[]) {
  const stone = std('#a7a29a'), sleeping = std('#7d7a76'), vine = std('#4f7d3c');
  return PORTALS.map((p) => {
    const world = leadsTo[p.shelf], open = world !== null;
    const arch = new THREE.Group();
    arch.position.set(p.x, 0, p.z); arch.rotation.y = p.facing;
    const mat = open ? stone : sleeping;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.6, 0.6), mat);
      post.position.set(side * 1.5, 1.8, 0);
      arch.add(post);
      // the posts keep a walker out; she passes between them
      ground.block(p.x + Math.cos(p.facing) * side * 1.5, p.z - Math.sin(p.facing) * side * 1.5, 0.5);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.6, 0.7), mat);
    top.position.y = 3.9;
    arch.add(top);
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.3), new THREE.MeshBasicMaterial({ color: p.colour, transparent: true, opacity: 0.55, depthWrite: false }));
    // one-sided, facing the glade: from the camera behind her as she arrives (outside the arch) it is not drawn
    veil.position.y = 1.85; veil.rotation.y = Math.PI; veil.visible = open;
    arch.add(veil);
    if (!open) {
      for (let i = 0; i < 5; i++) {
        const v = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 5, 10), vine);
        v.rotation.x = Math.PI / 2; v.position.set((i % 2 ? 1 : -1) * 1.5, 0.6 + i * 0.7, 0);
        arch.add(v);
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: signTexture(p.icon, p.colour), roughness: 0.9 }));
      // facing the glade, where she comes from (beside the arch, a step in front of it)
      sign.position.set(2.6, 1.2, -0.3); sign.rotation.y = Math.PI;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), std('#8a6142'));
      post.position.set(2.6, 0.45, -0.25);
      arch.add(sign, post);
    }
    arch.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== veil) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(arch);
    return { ...p, world, veil, at: new THREE.Vector3(p.x, 0, p.z) };
  });
}

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

function buildHub(g: Game, _L: Record<string, never>, sky: WorldSky, scope: WorldScope): BuiltWorld {
  const { scene, save, ws, flies } = g;
  scope.own(() => { colliders.length = 0; });
  const gear = createGear(g.heroRig, g.heroRig.gear, [], g.sparks);

  const glade = new THREE.Mesh(new THREE.CircleGeometry(RADIUS + 14, 56), std('#8fcf6a', { flatShading: false }));
  glade.rotation.x = -Math.PI / 2; glade.receiveShadow = true;
  scene.add(glade);
  buildTree(scene);
  const nests = buildNests(scene);
  const portals = buildPortals(scene, portalWorlds(knownWorlds()));
  buildRing(scene);

  // The light of each artifact back, in the nest of its place (read from the save: it comes back with the final).
  const shelfOf = (shelf: number) => knownWorlds().find((w) => w.shelf === shelf)?.id ?? null;
  const lit = () => nests.map((n) => { const id = shelfOf(n.shelf); return id !== null && artifactBack(save, id); });
  const paint = () => lit().forEach((on, i) => {
    const n = nests[i];
    n.mat.color.set(on ? PORTALS[n.shelf].colour : '#4a4a4a');
    n.mat.emissive.set(on ? PORTALS[n.shelf].colour : '#000000');
    n.mat.emissiveIntensity = on ? 1.4 : 0;
  });
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
        for (const p of open) (p.veil.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.2 * Math.sin(time * 1.6 + p.shelf);
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
export const hub: WorldDef<Record<string, never>, WorldSky> = {
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
