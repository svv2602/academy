import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sfx } from '../core/audio';
import type { Game } from './context';
import { addToStash } from './stash';
import { showPicture } from '../ui/picture';
import { createDaily } from './daily-find';
import {
  CHASE, COLLECT_KINDS, TAP_R, floorOf, foundOf, isSet, kindsOf, pictureDone, reaches, setDone, setKindsOf, type CollectDef, type CollectItem, type CollectKind,
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
  /** The find of the day (src/game/daily-find.ts): where it lies and its kind, null - none today. */
  daily(): { kind: CollectKind; x: number; y: number; z: number } | null;
}

export type CollectHost = Pick<Game, 'scene' | 'save' | 'ws' | 'world' | 'ground' | 'groundY' | 'hero' | 'speech' | 'sparks' | 'addStars' | 'above' | 'persist'>;

/** px: how near on the screen a touch has to land to touch a find. */
const TAP_PX = 70;
/** The size of the finds over their shapes below: on the grass of the valley, from the camera's 6 m, they must be seen. */
const SIZE: Record<CollectKind, number> = { mushroom: 1.6, acorn: 1.8, feather: 1.8, treefeather: 3.2, butterfly: 2.2, piece: 1.8, cone: 2.0, berry: 2.2, shell: 3.0, coral: 2.8, lollipop: 2.6, marmalade: 2.6, cloudlet: 2.8, balloon: 3.0 };
/** A find not found yet within this many metres of her twinkles every TWINKLE seconds: the eye is led to it. */
const NEAR = 16, TWINKLE = 1.6;
/** m: nearer than this to her a find moves (bobs, flaps, flies off); farther it stands still at rest. */
const LIVE = 30;
/** m: a kind of find is drawn while one of it not taken lies nearer than this to her (a mesh of a kind spans the world). */
const SHOWN = 45;

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
  const feather = paint(f.clone().rotateX(-1.2), COLLECT_KINDS.feather.color);
  // the Great Tree's bird's: the same blade, golden
  const treefeather = paint(f.rotateX(-1.2), COLLECT_KINDS.treefeather.color);
  // a butterfly: two wings that open and close by the instance's scale across (no shader of its own)
  const w = new THREE.BufferGeometry();
  w.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0.2, 0.02, 0.12, 0.2, 0.02, -0.1, 0, 0, 0, 0.2, 0.02, -0.1, 0.2, 0.02, 0.12,
    0, 0, 0, -0.2, 0.02, -0.1, -0.2, 0.02, 0.12, 0, 0, 0, -0.2, 0.02, 0.12, -0.2, 0.02, -0.1,
  ], 3));
  w.computeVertexNormals();
  const butterfly = paint(w, COLLECT_KINDS.butterfly.color);
  // a piece of a picture (PLAY-29): a flat square with a knob out of one side and a notch-coloured knob on another, as
  // a child knows a jigsaw piece; standing up, turned to her by its spin
  const tile = paint(new THREE.BoxGeometry(0.26, 0.26, 0.05), COLLECT_KINDS.piece.color);
  const knob = paint(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8).rotateX(Math.PI / 2).translate(0.15, 0, 0), COLLECT_KINDS.piece.color);
  const knob2 = paint(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0.15, 0), '#ffd98a');
  // the forest's (the customer's word of 2026-11-22): a spruce cone lying on the moss - a dark core covered by rows of
  // its scales, each a little flat leaf tipped out toward its base, the rows set half a scale apart (rings of ridges
  // read as a caterpillar, a plain cylinder as a log); a sprig of bilberries - three blue berries on two green leaves
  const H = 0.4, ROWS = 6, PER = 6;
  const radius = (v: number) => 0.075 * Math.sin(Math.PI * (0.08 + v * 0.86)) ** 0.6 * (1 - v * 0.3);   // v 0 base - 1 tip
  const parts = [paint(new THREE.SphereGeometry(1, 7, 5).scale(0.06, H / 2, 0.06), '#5e3a1e')];
  for (let j = 0; j < ROWS; j++) {
    const v = (j + 0.5) / ROWS, r = radius(v), y = -H / 2 + v * H;
    for (let k = 0; k < PER; k++) {
      const a = (k + (j % 2) * 0.5) * (Math.PI * 2 / PER), size = 0.75 + 0.5 * radius(v) / 0.075;
      const scale = new THREE.SphereGeometry(1, 5, 3).scale(0.036 * size, 0.05 * size, 0.012)
        .rotateX(-0.55).rotateY(Math.PI / 2 - a).translate(Math.cos(a) * r, y - 0.012, Math.sin(a) * r);
      parts.push(paint(scale, (j + k) % 2 ? COLLECT_KINDS.cone.color : '#bd8049'));
    }
  }
  const cone = mergeGeometries(parts)!.rotateZ(Math.PI / 2 - 0.15);
  const berries = [[-0.06, 0, 0.03], [0.06, 0.01, 0.02], [0, 0.02, -0.06]].map(([x, y, z]) =>
    paint(new THREE.SphereGeometry(0.065, 7, 5).translate(x, y, z), COLLECT_KINDS.berry.color));
  const leaves = [0.9, -2.2].map((a) => paint(new THREE.SphereGeometry(0.09, 5, 2).scale(1, 0.18, 0.55).rotateY(a).translate(Math.cos(a) * 0.08, -0.05, -Math.sin(a) * 0.08), '#4f9a3c'));
  // the sea's (the customer's word of 2026-11-23): a spiral shell lying on its side - whorls narrowing to a point, pink
  // and pearl in turn, its mouth pale; a coral twig - a stem forking into three branches, each with a rounded tip
  const whorls = [0, 1, 2, 3].map((k) => paint(new THREE.TorusGeometry(0.1 - k * 0.022, 0.045 - k * 0.008, 5, 9).rotateX(Math.PI / 2).translate(0, k * 0.055, 0), k % 2 ? '#fde0ec' : COLLECT_KINDS.shell.color));
  const tip = paint(new THREE.ConeGeometry(0.03, 0.08, 6).translate(0, 0.25, 0), COLLECT_KINDS.shell.color);
  const mouth = paint(new THREE.CircleGeometry(0.07, 8).rotateX(Math.PI / 2).translate(0, -0.03, 0), '#fff6f0');
  const shell = mergeGeometries([...whorls, tip, mouth])!.rotateZ(Math.PI / 2 - 0.25).translate(0.05, -0.02, 0);
  const twig: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 5).translate(0, 0.11, 0), COLLECT_KINDS.coral.color)];
  for (const [a, t, h] of [[0, 0.55, 0.16], [2.1, 0.7, 0.13], [4.2, 0.45, 0.15]] as const) {
    twig.push(paint(new THREE.CylinderGeometry(0.016, 0.022, h, 5).translate(0, h / 2, 0).rotateZ(t).rotateY(a).translate(0, 0.12, 0), COLLECT_KINDS.coral.color));
    const ex = -Math.sin(t) * h * Math.cos(a), ey = 0.12 + Math.cos(t) * h, ez = Math.sin(t) * h * Math.sin(a);
    twig.push(paint(new THREE.SphereGeometry(0.03, 6, 4).translate(ex, ey, ez), '#ff9a8a'));
  }
  twig.push(paint(new THREE.SphereGeometry(0.032, 6, 4).translate(0, 0.23, 0), '#ff9a8a'));
  const coral = mergeGeometries(twig)!.translate(0, -0.12, 0);
  // the Sweet Land's (the lead's word of 2026-11-25): a swirl lollipop standing on its stick - a flat round candy of
  // pink and white rings in turn, its face to the side; two jelly sweets - a green dome sugared with white grains and
  // a yellow one beside it
  const swirl = [paint(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5).translate(0, -0.1, 0), '#fffaf2')];
  for (let k = 0; k < 4; k++) swirl.push(paint(new THREE.TorusGeometry(0.115 - k * 0.03, 0.017, 4, 14).translate(0, 0.08, 0.004 * k), k % 2 ? '#fff1f6' : COLLECT_KINDS.lollipop.color));
  swirl.push(paint(new THREE.CircleGeometry(0.02, 8).translate(0, 0.08, 0.016), COLLECT_KINDS.lollipop.color));
  const lollipop = mergeGeometries(swirl)!.translate(0, 0.02, 0);
  const jelly = [paint(new THREE.SphereGeometry(0.09, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.1, 1).translate(-0.04, -0.06, 0), COLLECT_KINDS.marmalade.color),
    paint(new THREE.SphereGeometry(0.075, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.1, 1).translate(0.09, -0.06, -0.04), '#ffd84a')];
  for (const [a, h] of [[0.4, 0.5], [1.9, 0.8], [3.3, 0.35], [4.6, 0.95], [5.6, 0.6]] as const) {
    const t = h * Math.PI / 2 * 0.8;
    jelly.push(paint(new THREE.BoxGeometry(0.014, 0.014, 0.014).translate(-0.04 + Math.cos(a) * Math.sin(t) * 0.092, -0.06 + Math.cos(t) * 0.1, Math.sin(a) * Math.sin(t) * 0.092), '#ffffff'));
  }
  const marmalade = mergeGeometries(jelly)!;
  // the Sky Islands' (the lead's word of 2026-11-26): a little cloud of five faceted white puffs (as the islands' cloud
  // rails), a touch of sky-blue under it;
  // a bunch of three balloons - red, yellow, blue - their strings meeting in one string down to the ground
  const cloudlet = mergeGeometries([
    ...([[0, 0.01, 0, 0.085], [-0.09, -0.02, 0.01, 0.065], [0.09, -0.02, -0.01, 0.07], [-0.04, 0.05, -0.02, 0.06], [0.05, 0.045, 0.02, 0.055]] as const)
      .map(([x, y, z, r]) => paint(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), '#ffffff')),
    paint(new THREE.IcosahedronGeometry(0.07, 0).scale(1.8, 0.45, 1).translate(0, -0.05, 0), COLLECT_KINDS.cloudlet.color),
  ])!;
  const bunch: THREE.BufferGeometry[] = [];
  for (const [x, y, z, r, c] of [[0, 0.06, 0, 0.075, COLLECT_KINDS.balloon.color], [-0.07, 0.01, 0.03, 0.06, '#ffd23f'], [0.07, 0.02, -0.03, 0.06, '#4fa8ff']] as const) {
    bunch.push(paint(new THREE.SphereGeometry(r, 8, 6).scale(1, 1.18, 1).translate(x, y, z), c));
    bunch.push(paint(new THREE.ConeGeometry(0.012, 0.02, 5).rotateX(Math.PI).translate(x, y - r * 1.18 - 0.008, z), c));
    // its string from under its knot to where the three meet
    const top = new THREE.Vector3(x, y - r * 1.18 - 0.016, z), knot = new THREE.Vector3(0, -0.1, 0), dir = top.clone().sub(knot);
    const tie = new THREE.CylinderGeometry(0.0025, 0.0025, dir.length(), 3)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
    bunch.push(paint(tie.translate((top.x + knot.x) / 2, (top.y + knot.y) / 2, (top.z + knot.z) / 2), '#ffffff'));
  }
  bunch.push(paint(new THREE.CylinderGeometry(0.0025, 0.0025, 0.24, 3).translate(0, -0.22, 0), '#ffffff'));
  const balloon = mergeGeometries(bunch)!;
  return {
    shell, coral, lollipop, marmalade, cloudlet, balloon,
    mushroom: mergeGeometries([stem, cap])!, acorn: mergeGeometries([acorn, cup, stalk])!, feather, treefeather, butterfly,
    piece: mergeGeometries([tile, knob, knob2])!, cone, berry: mergeGeometries([...berries, ...leaves])!,
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
    // culled by the sphere of its finds near her (`update`): one sphere over the valley would draw it from anywhere
    mesh.boundingSphere = new THREE.Sphere();
    mesh.castShadow = false;
    g.scene.add(mesh);
    meshes.set(kind, mesh);
  }
  // the find of the day draws its own copy of its kind's shape (a world without it builds nothing more)
  const daily = createDaily(g, (k) => geos[k].clone(), (k) => SIZE[k], material);
  for (const k of Object.keys(geos) as CollectKind[]) if (!meshes.has(k)) geos[k].dispose();
  // the finds out now (CollectDef.shown): all, or those the world says; `outKey` - to see them change between frames
  let out: ReadonlySet<number> | null = null, outKey = '';
  const isOut = (it: (typeof items)[number]) => out === null || out.has(it.id);
  const readOut = () => {
    if (!def?.shown) return false;
    const ids = def.shown(g.ws), key = ids.join(',');
    if (key === outKey) return false;
    out = new Set(ids); outKey = key;
    return true;
  };
  readOut();
  const unfound: THREE.Vector3[] = [];
  const refresh = () => { unfound.length = 0; for (const it of items) if (!it.taken && isOut(it)) unfound.push(it.pos); };
  refresh();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  let gone = false, twinkle = 0;
  const dirty = new Set<THREE.InstancedMesh>();

  function take(it: (typeof items)[number]) {
    if (it.taken || !def || !isOut(it)) return;
    it.taken = true;
    const first = !found.some((i) => def.items[i].kind === it.kind);
    found.push(it.id);
    // and one to spend (the stash, PLAY-26): the book keeps it found whatever is spent; a piece of the picture is not spent
    if (isSet(it.kind)) addToStash(g.save, it.kind);
    refresh();
    sfx('good');
    g.sparks.burst(it.pos.clone(), COLLECT_KINDS[it.kind].color, 26, 3);
    g.addStars(1, g.above(g.hero.root.position, 1.4));     // COLLECT_REWARD, a literal as src/game/no-penalties.test.ts reads it
    // the others of its flock fly up for a moment
    if (it.flock !== undefined) for (const o of items) if (o !== it && o.flock === it.flock && !o.taken) o.fly = 2;
    if (!isSet(it.kind)) {
      // a piece of the picture (PLAY-29): no set, no stars of one. With an easel in the world (src/game/easel.ts) she sets
      // the pieces on it herself: the last one found, the cat sends her there; without one the picture comes alive at once
      if (pictureDone(def, found) && def.picture) {
        if (g.world.easel) void g.speech.line('easel_some', 'hint', 4000);
        else { showPicture(def.picture); void g.speech.line('picture_done', 'hint', 4000); }
      } else if (first) void g.speech.line('piece_first', 'hint', 4000);
    } else if (setDone(def, it.kind, found)) {
      g.addStars(5, g.above(g.hero.root.position, 1.6));   // SET_REWARD
      const all = setKindsOf(def).every((k) => setDone(def, k, found));
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
        if (it.taken || !isOut(it) || it.way !== 'tap' || Math.hypot(it.pos.x - hp.x, it.pos.z - hp.z) > TAP_R) continue;
        const d = screenDist(it.pos);
        if (d < bestD) { best = it; bestD = d; }
      }
      if (best) take(best);
      return best !== null;
    },
    daily: () => daily.at(),
    update: (dt, time, canMove) => {
      if (gone) return;
      daily.update(dt, time, canMove);
      const hp = g.hero.root.position, scale = g.hero.root.scale.x, floor = floorOf(g, hp.x, hp.z);
      const sparkle = (twinkle += dt) > TWINKLE;
      if (sparkle) twinkle = 0;
      dirty.clear();
      if (readOut()) refresh();
      // a kind is drawn by its finds near her: their sphere is what the camera culls by; none near - not drawn at all
      // (the far ones stand still and small in the haze: a mesh of a kind spans the valley)
      for (const [kind, mesh] of meshes) {
        const near = items.filter((it) => it.kind === kind && !it.taken && isOut(it) && Math.hypot(it.pos.x - hp.x, it.pos.z - hp.z) < SHOWN);
        mesh.visible = near.length > 0;
        if (near.length) mesh.boundingSphere!.setFromPoints(near.map((it) => it.pos)).radius += 1 + (kind === 'butterfly' ? CHASE.ring : 0);
      }
      for (const it of items) {
        const mesh = meshes.get(it.kind)!;
        // taken, or not out now: drawn as nothing (one not out comes back at rest once it is out)
        if (it.taken || !isOut(it)) { if (it.posed !== 'gone') { mesh.setMatrixAt(it.slot, m4.makeScale(0, 0, 0)); it.posed = 'gone'; dirty.add(mesh); } continue; }
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
        if (canMove && reaches(it.way, it.pos, hp, scale, floor)) take(it);
      }
      for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      gone = true;
      daily.dispose();
      for (const mesh of meshes.values()) { g.scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }
      meshes.clear(); unfound.length = 0;
    },
  };
}
