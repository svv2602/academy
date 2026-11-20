import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sfx } from '../core/audio';
import type { Game } from './context';
import {
  CHASE, COLLECT_KINDS, TAP_R, foundOf, kindsOf, reaches, setDone, type CollectDef, type CollectItem, type CollectKind,
} from './collections';

/**
 * The finds of the collections in the world played (./collections.ts is the rule): one instanced mesh a kind, the shapes
 * made here (no file to load); a find taken shrinks to nothing. Made anew for every world entered (src/game/context.ts
 * `enter`) and taken out of the scene with it (src/game/travel.ts), like the mysterious stars. Every mesh is made at
 * every entry, whatever is found: the scene of a world is the same each time it is built (tools/worlds.mjs).
 */
export interface CollectInWorld {
  /** The finds with where each is now (a butterfly flies) and whether it is found (the walkthrough, the book). */
  readonly items: readonly (CollectItem & { id: number; pos: THREE.Vector3; home: THREE.Vector3; taken: boolean })[];
  /** Where the finds not found yet are: the same array and vectors every call (the glow potion's twinkle). */
  unfound(): readonly THREE.Vector3[];
  /** A tap on the screen: a `tap` find touched within reach is taken (true - the tap is spent on it). */
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  /** A frame: they bob, the butterflies flap and flee; what she reaches while free to move is taken. */
  update(dt: number, time: number, canMove: boolean): void;
  /** Takes the meshes out of the scene (leaving the world). */
  dispose(): void;
}

export type CollectHost = Pick<Game, 'scene' | 'ws' | 'world' | 'ground' | 'groundY' | 'hero' | 'speech' | 'sparks' | 'addStars' | 'above' | 'persist'>;

/** px: how near on the screen a touch has to land to touch a find. */
const TAP_PX = 70;
/** The size of the finds over their shapes below: on the grass of the valley, from the camera's 6 m, they must be seen. */
const SIZE: Record<CollectKind, number> = { mushroom: 1.6, acorn: 1.8, feather: 1.8, butterfly: 2.2 };
/** A find not found yet within this many metres of her twinkles every TWINKLE seconds: the eye is led to it. */
const NEAR = 16, TWINKLE = 1.6;
/** m: nearer than this to her a find moves (bobs, flaps, flies off); farther it stands still at rest. */
const LIVE = 30;

/** The shapes of the kinds, a few dozen triangles each, coloured by vertex; their middle at the origin. */
function shapes(): Record<CollectKind, THREE.BufferGeometry> {
  const paint = (geo: THREE.BufferGeometry, color: string) => {
    const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(color), n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3));
    g.deleteAttribute('uv');
    return g;
  };
  const stem = paint(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 6, 1, true).translate(0, -0.06, 0), '#fff4e2');
  const cap = paint(new THREE.SphereGeometry(0.2, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1).translate(0, 0.04, 0), COLLECT_KINDS.mushroom.color);
  const acorn = paint(new THREE.SphereGeometry(0.1, 7, 5).scale(0.85, 1.15, 0.85).translate(0, -0.03, 0), COLLECT_KINDS.acorn.color);
  const cup = paint(new THREE.SphereGeometry(0.1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.05, 0), '#6e4520');
  const stalk = paint(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 3, 1, true).translate(0, 0.15, 0), '#5a3b1f');
  // a feather: a flat blade with a quill, both faces
  const f = new THREE.BufferGeometry();
  f.setAttribute('position', new THREE.Float32BufferAttribute([
    0, -0.2, 0, 0.06, -0.05, 0, 0, 0.2, 0, 0, -0.2, 0, 0, 0.2, 0, -0.06, -0.05, 0,
    0, -0.2, 0, 0, 0.2, 0, 0.06, -0.05, 0, 0, -0.2, 0, -0.06, -0.05, 0, 0, 0.2, 0,
  ], 3));
  f.computeVertexNormals();
  const feather = paint(f.rotateX(-1.2), COLLECT_KINDS.feather.color);
  // a butterfly: two wings that open and close by the instance's scale across (no shader of its own)
  const w = new THREE.BufferGeometry();
  w.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0.2, 0.02, 0.12, 0.2, 0.02, -0.1, 0, 0, 0, 0.2, 0.02, -0.1, 0.2, 0.02, 0.12,
    0, 0, 0, -0.2, 0.02, -0.1, -0.2, 0.02, 0.12, 0, 0, 0, -0.2, 0.02, 0.12, -0.2, 0.02, -0.1,
  ], 3));
  w.computeVertexNormals();
  const butterfly = paint(w, COLLECT_KINDS.butterfly.color);
  return {
    mushroom: mergeGeometries([stem, cap])!, acorn: mergeGeometries([acorn, cup, stalk])!, feather, butterfly,
  };
}

function material() {
  // a little glow of their own, of their own colour (the vertex colour multiplies the emissive): on the grass of the
  // valley they are what the eye looks for (WORLD-10, the accents)
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.35, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor;\n#endif');
  };
  m.customProgramCacheKey = () => 'collect-find';
  return m;
}

/** The finds of the world `g.world` (none if it lays out none). */
export function createCollections(g: CollectHost): CollectInWorld {
  const def: CollectDef | undefined = g.world.collect;
  const found = foundOf(g.ws);
  const geos = shapes();
  const meshes = new Map<CollectKind, THREE.InstancedMesh>();
  const items = (def?.items ?? []).map((it, id) => {
    const p = new THREE.Vector3(it.x, g.groundY(it.x, it.z) + it.y, it.z);
    const home = p.clone(), angle = Math.atan2(it.z, it.x);
    // a butterfly to catch is on its ring from the start (far from her it stands still there)
    if (it.way === 'chase') p.set(it.x + Math.cos(angle) * CHASE.ring, 0, it.z + Math.sin(angle) * CHASE.ring).setY(g.groundY(p.x, p.z) + it.y);
    return { ...it, id, pos: p, home, taken: found.includes(id), slot: 0, angle, fly: 0, posed: '' as '' | 'rest' | 'live' | 'gone' };
  });
  if (def) for (const kind of kindsOf(def)) {
    const own = items.filter((it) => it.kind === kind);
    own.forEach((it, i) => { it.slot = i; });
    const mesh = new THREE.InstancedMesh(geos[kind], material(), own.length);
    mesh.name = `collect-${kind}`;
    mesh.frustumCulled = false;       // a handful of small finds across the valley, like the ground stars, not worth culling
    mesh.castShadow = false;
    g.scene.add(mesh);
    meshes.set(kind, mesh);
  }
  for (const k of Object.keys(geos) as CollectKind[]) if (!meshes.has(k)) geos[k].dispose();
  const unfound: THREE.Vector3[] = [];
  const refresh = () => { unfound.length = 0; for (const it of items) if (!it.taken) unfound.push(it.pos); };
  refresh();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  let gone = false, twinkle = 0;
  const dirty = new Set<THREE.InstancedMesh>();

  function take(it: (typeof items)[number]) {
    if (it.taken || !def) return;
    it.taken = true;
    const first = !found.some((i) => def.items[i].kind === it.kind);
    found.push(it.id);
    refresh();
    sfx('good');
    g.sparks.burst(it.pos.clone(), COLLECT_KINDS[it.kind].color, 26, 3);
    g.addStars(1, g.above(g.hero.root.position, 1.4));     // COLLECT_REWARD, a literal as src/game/no-penalties.test.ts reads it
    // the others of its flock fly up for a moment
    if (it.flock !== undefined) for (const o of items) if (o !== it && o.flock === it.flock && !o.taken) o.fly = 2;
    if (setDone(def, it.kind, found)) {
      g.addStars(5, g.above(g.hero.root.position, 1.6));   // SET_REWARD
      const all = kindsOf(def).every((k) => setDone(def, k, found));
      void g.speech.line(all ? 'collect_all' : 'collect_set', 'hint', 4000);
    } else if (first) void g.speech.line('collect_first', 'hint', 4000);
    g.persist();
  }

  return {
    items,
    unfound: () => unfound,
    tap: (screenDist) => {
      const hp = g.hero.root.position;
      let best: (typeof items)[number] | null = null, bestD = TAP_PX;
      for (const it of items) {
        if (it.taken || it.way !== 'tap' || Math.hypot(it.pos.x - hp.x, it.pos.z - hp.z) > TAP_R) continue;
        const d = screenDist(it.pos);
        if (d < bestD) { best = it; bestD = d; }
      }
      if (best) take(best);
      return best !== null;
    },
    update: (dt, time, canMove) => {
      if (gone) return;
      const hp = g.hero.root.position, scale = g.hero.root.scale.x;
      const sparkle = (twinkle += dt) > TWINKLE;
      if (sparkle) twinkle = 0;
      dirty.clear();
      for (const it of items) {
        const mesh = meshes.get(it.kind)!;
        if (it.taken) { if (it.posed !== 'gone') { mesh.setMatrixAt(it.slot, m4.makeScale(0, 0, 0)); it.posed = 'gone'; dirty.add(mesh); } continue; }
        // far from her a find stands still at rest, drawn as it was laid: no matrix of it to send each frame (the
        // desktop walkthrough of world2 ran a quarter longer with all of them moving)
        if (Math.hypot(it.pos.x - hp.x, it.pos.z - hp.z) > LIVE) {
          if (it.posed !== 'rest') { mesh.setMatrixAt(it.slot, m4.compose(it.pos, q.identity(), s.setScalar(SIZE[it.kind]))); it.posed = 'rest'; dirty.add(mesh); }
          continue;
        }
        it.posed = 'live'; dirty.add(mesh);
        let yaw = time * 0.6 + it.id, open = 1;
        if (it.way === 'chase') {
          // it flies round its place, fast while she is near (she catches it across the ring)
          const near = Math.hypot(it.pos.x - hp.x, it.pos.z - hp.z) < CHASE.wake;
          it.angle += ((near ? CHASE.speed : 0.6) / CHASE.ring) * dt;
          it.pos.set(it.home.x + Math.cos(it.angle) * CHASE.ring, 0, it.home.z + Math.sin(it.angle) * CHASE.ring);
          it.pos.y = g.groundY(it.pos.x, it.pos.z) + it.y + Math.sin(time * 3 + it.id) * 0.12;
          yaw = -it.angle;
        } else if (it.flock !== undefined) {
          // one of its flock taken, it flies up for a moment and settles back where it sat
          it.fly = Math.max(0, it.fly - dt);
          it.pos.y = it.home.y + Math.min(1, it.fly) * 0.9 + Math.sin(time * 2 + it.id) * 0.05;
        } else if (it.way === 'run' || it.way === 'tap') it.pos.y = it.home.y + Math.sin(time * 1.6 + it.id) * 0.04;
        // what hangs for a jump keeps its height (it swings on its stalk): its reach is a matter of centimetres
        if (it.kind === 'butterfly') open = 0.25 + 0.75 * Math.abs(Math.cos(time * (it.fly > 0 || it.way === 'chase' ? 14 : 5) + it.id));
        if (it.kind === 'acorn') yaw = Math.sin(time * 1.3 + it.id) * 0.3;    // swings on its stalk
        e.set(it.kind === 'acorn' ? yaw * 0.3 : 0, it.kind === 'acorn' ? 0 : yaw, 0);
        const k = SIZE[it.kind];
        mesh.setMatrixAt(it.slot, m4.compose(it.pos, q.setFromEuler(e), s.set(k * open, k, k)));
        if (sparkle && Math.hypot(it.pos.x - hp.x, it.pos.z - hp.z) < NEAR) g.sparks.burst(it.pos.clone(), '#fff6c8', 3, 0.8);
        if (canMove && reaches(it.way, it.pos, hp, scale)) take(it);
      }
      for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      gone = true;
      for (const mesh of meshes.values()) { g.scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }
      meshes.clear(); unfound.length = 0;
    },
  };
}
