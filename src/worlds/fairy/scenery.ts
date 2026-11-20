import * as THREE from 'three';
import { staticGeo, texturedParts } from '../../core/assets';
import { fbm, mulberry32, vnoise } from '../../core/util';
import { SHOP_SIGN } from './layout';
import { QUESTS, SHRINE } from './quests';
import { CASTLE, CHEST, PATCH, POND, SPAWN, WATER_Y, WORLD_R, colliders, height, pathDist } from './terrain';
import { instanced, instancedParts, type Placement } from '../../core/instancing';
import { fadeAtCamera, propMaterial } from '../../core/materials';
import type { MagicCount, MagicGlow } from './magic';

/** How many more flowers (at the full density) the magic of the world grows over the drifts. */
export const MAGIC_FLOWERS = 120;

/** m: the height of the shop's signboard (its cap top) and the radius of its stem. */
export const SIGN_H = 2.1;
const SIGN_STEM = 0.25 * SIGN_H;

/** True where nothing should grow: paths, the pond, quest spots, buildings. */
function reserved(x: number, z: number, margin: number) {
  if (pathDist(x, z) < 1.6 + margin) return true;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1 + margin) return true;
  if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < 15 + margin) return true;
  for (const p of [SPAWN, PATCH, CHEST, SHRINE, SHOP_SIGN, ...QUESTS]) if (Math.hypot(x - p.x, z - p.z) < 2.2 + margin) return true;
  return false;
}

// Detailed textured trees near the play area; cheap flat-colour ones for the distant forest ring.
/** How much of its colour the purple-leaved plant keeps (WORLD-10, the accents). */
export const PLANT_SATURATION = 0.3;

export const NEAR_TREES: readonly (readonly [string, number, number])[] = [
  ['CommonTree1', 8, 3], ['CommonTree2', 7.5, 3], ['CommonTree3', 6.5, 3], ['CommonTree4', 7, 3], ['CommonTree5', 6, 3],
  ['TwistedTree1', 7, 1], ['TwistedTree2', 6.5, 1], ['Pine5', 7.5, 2], ['Pine2', 9, 1],
];
const FAR_TREES: readonly (readonly [string, number, Record<string, string>?])[] = [
  ['nature_pack/CommonTree_1', 7.5], ['nature_pack/CommonTree_2', 8], ['nature_pack/CommonTree_3', 6.5], ['nature_pack/PineTree_1', 8.5],
  ['nature_pack/CommonTree_4', 6.5, { Green: '#ffb7d5', DarkGreen: '#f794bd' }],
];

/** A tree as placed: where, its scale, its height in metres (the model's height times the scale), near or of the far ring. */
export interface TreeSpot { x: number; z: number; s: number; h: number; near: boolean; collide: boolean }

/**
 * Where the trees stand: the near textured ones around the play area, the far flat-colour ring, and the grove that hides
 * the chest. Pure - `rnd` is the scenery's randomness and is advanced exactly as before - so that a test can check the
 * tour's camera against the crowns (src/worlds/fairy/flyover-path.test.ts).
 */
export function placeTrees(rnd: () => number, density: number) {
  const weights = NEAR_TREES.map((d) => d[2]), wsum = weights.reduce((a, b) => a + b, 0);
  const nearItems: Placement[][] = NEAR_TREES.map(() => []), farItems: Placement[][] = FAR_TREES.map(() => []);
  const placed: TreeSpot[] = [];
  let tries = 0;
  while (placed.length < 150 * density && tries++ < 6000) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (WORLD_R + 22);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const forest = fbm(x * 0.045 + 40, z * 0.045 + 13, 3);
    if (r <= WORLD_R - 22 && forest < 0.56) continue;
    if (reserved(x, z, 2.5) || placed.some((p) => Math.hypot(p.x - x, p.z - z) < 3.6)) continue;
    const item = { x, z, s: 0.85 + rnd() * 0.45, rot: rnd() * 6.28 };
    let h: number, near = r < 52;
    if (near) {
      let pick = rnd() * wsum, k = 0;
      while ((pick -= weights[k]) > 0) k++;
      nearItems[k].push(item); h = NEAR_TREES[k][1];
    } else { const k = Math.floor(rnd() * FAR_TREES.length); farItems[k].push(item); h = FAR_TREES[k][1]; }
    placed.push({ x, z, s: item.s, h: h * item.s, near, collide: r < WORLD_R });
  }
  // A grove that hides the secret chest (not in `placed`: the under-growth hugs the trees of the loop only).
  const grove: TreeSpot[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 1.5 + 2.2, x = CHEST.x + Math.cos(a) * 4.4, z = CHEST.z + Math.sin(a) * 4.4;
    const item = { x, z, s: 0.95 + rnd() * 0.2, rot: rnd() * 6.28 };
    nearItems[i % 5].push(item);
    grove.push({ x, z, s: item.s, h: NEAR_TREES[i % 5][1] * item.s, near: true, collide: true });
  }
  return { nearItems, farItems, placed, grove };
}

export async function buildScenery(scene: THREE.Scene, density: number) {
  const rnd = mulberry32(2024);
  const tree = propMaterial(0.0035), solid = propMaterial();
  const N = (n: string, h: number, normals: 'model' | 'up' | 'sphere' = 'model') => texturedParts('nature2/' + n, h, normals);

  const [nearTrees, farGeos, rocks3, bushes, flowerKinds, smalls, tallGrass, mushSmall, pathStones, pebbles, mushGeo, stumpGeo, lilyGeo] = await Promise.all([
    Promise.all(NEAR_TREES.map(([n, h]) => N(n, h, 'sphere'))),
    Promise.all(FAR_TREES.map(([p, h, rc]) => staticGeo(p, h, rc))),
    Promise.all(['RockMedium1', 'RockMedium2', 'RockMedium3'].map((n) => N(n, 0.9))),
    Promise.all([N('BushCommon', 1.2, 'sphere'), N('BushCommonFlowers', 1.3, 'sphere')]),
    Promise.all([N('Flower3Group', 0.6, 'up'), N('Flower4Single', 0.5, 'up'), N('Flower3Single', 0.5, 'up'), N('Flower4Single', 0.42, 'up')]),
    Promise.all([N('Fern1', 0.6, 'up'), N('Clover1', 0.11, 'up'), N('Clover2', 0.12, 'up'), N('Plant1Big', 0.7, 'up'), N('Plant7Big', 0.5, 'up')]),
    Promise.all([N('GrassCommonTall', 0.75, 'up'), N('GrassWispyShort', 0.5, 'up')]),
    N('MushroomCommon', 0.35),
    Promise.all(['RockPathRoundSmall1', 'RockPathRoundSmall2', 'RockPathRoundSmall3'].map((n) => N(n, 0.09))),
    Promise.all(['PebbleRound1', 'PebbleRound2', 'PebbleRound3'].map((n) => N(n, 0.16))),
    staticGeo('extra/mush1', 1, { LightRed: '#ff6f91', White: '#fff6e8' }),
    staticGeo('nature_pack/TreeStump_Moss', 0.7),
    staticGeo('nature_pack/Lilypad', 0.12),
  ]);

  const { nearItems, farItems, placed, grove } = placeTrees(rnd, density);
  for (const t of [...placed, ...grove]) if (t.collide) colliders.push({ x: t.x, z: t.z, r: 0.6 });
  nearTrees.forEach((parts, i) => instancedParts(scene, height, parts, nearItems[i], 0.0035, true));
  farGeos.forEach((g, i) => instanced(scene, height, g, tree, farItems[i], false));

  const scatter = (n: number, margin: number, ok?: (x: number, z: number) => boolean, maxR = WORLD_R - 6, rand = rnd) => {
    const out: Placement[] = [];
    let t = 0;
    while (out.length < n && t++ < n * 30) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * maxR;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (reserved(x, z, margin) || (ok && !ok(x, z))) continue;
      out.push({ x, z, s: 0.7 + rand() * 0.7, rot: rand() * 6.28 });
    }
    return out;
  };
  const split = (items: Placement[], n: number) => Array.from({ length: n }, (_, i) => items.filter((_, j) => j % n === i));

  const rocks = scatter(40 * density, 1.5, undefined, 56);
  rocks.forEach((r) => { if (r.s > 1.05) colliders.push({ x: r.x, z: r.z, r: r.s * 0.45 }); });
  split(rocks, 3).forEach((it, i) => instancedParts(scene, height, rocks3[i], it, 0, true));
  split(scatter(60 * density, 1.2, undefined, 56), 2).forEach((it, i) => instancedParts(scene, height, bushes[i], it, 0.03, true));
  instanced(scene, height, stumpGeo, solid, scatter(8, 2), true);

  // Under-growth: ferns and big leaves hug the trees, clover carpets the open meadow.
  const nearTree = (x: number, z: number) => placed.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5);
  split(scatter(110 * density, 0.4, nearTree, 56), 2).forEach((it, i) => instancedParts(scene, height, smalls[i === 0 ? 0 : 3], it, 0.25, false, 46));
  split(scatter(110 * density, 0.2, undefined, 50), 2).forEach((it, i) => instancedParts(scene, height, smalls[1 + i], it, 0, false, 40));
  // its purple leaves were the loudest colour of the valley, louder than its stars and friends (WORLD-10): greyed to a third
  instancedParts(scene, height, smalls[4], scatter(60 * density, 0.4, undefined, 56), 0.25, false, 46, PLANT_SATURATION);
  split(scatter(160 * density, 0.5, (x, z) => vnoise(x * 0.2, z * 0.2) > 0.55, 56), 2).forEach((it, i) => instancedParts(scene, height, tallGrass[i], it, 0.6, false, 46));
  instancedParts(scene, height, mushSmall, scatter(40 * density, 0.5, nearTree, 56), 0, false, 40);

  // Flowers grow in drifts of one kind each, plus the dense bed where the task butterflies live.
  const drift = (x: number, z: number) => fbm(x * 0.09 + 5, z * 0.09 + 77, 2) > 0.5;
  const flowers = scatter(230 * density, 0.2, drift, 58);
  const kindOf = (f: Placement) => Math.floor(vnoise(f.x * 0.11 + 3, f.z * 0.11) * 3.999);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 2.6;
    flowers.push({ x: PATCH.x + Math.cos(a) * r, z: PATCH.z + Math.sin(a) * r, s: 1.1 + rnd() * 0.5, rot: rnd() * 6.28 });
  }
  // The flowers the magic of the world grows (./magic.ts, WORLD-09): more of the same drifts, from a randomness of their
  // own (everything placed after them stays where it always was), drawn only as the magic comes back. Each cell keeps
  // the flowers of before at its front: with no magic it draws exactly them.
  const more = scatter(MAGIC_FLOWERS * density, 0.2, drift, 58, mulberry32(4242));
  flowerKinds.forEach((parts, k) => {
    const base = flowers.filter((f) => kindOf(f) === k);
    for (const { mesh, idx } of instancedParts(scene, height, parts, [...base, ...more.filter((f) => kindOf(f) === k)], 0.45, false, 55)) {
      const shown = idx.filter((i) => i < base.length).length;
      mesh.userData.magicCount = { base: shown, full: idx.length } satisfies MagicCount;
      mesh.count = shown;
    }
  });

  // Stepping stones along the path and pebbles on the pond shore.
  const stones: Placement[] = [], shore: Placement[] = [];
  for (let i = 0; i < 2200 && stones.length < 110 * density; i++) {
    const x = (rnd() - 0.5) * 60, z = (rnd() - 0.5) * 80 - 18, d = pathDist(x, z);
    if (d < 1.0 && Math.hypot(x - CASTLE.x, z - CASTLE.z) > 8) stones.push({ x, z, s: 0.7 + rnd() * 0.5, rot: rnd() * 6.28 });
  }
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 6.28, r = POND.r + 0.4 + rnd() * 1.6;
    shore.push({ x: POND.x + Math.cos(a) * r, z: POND.z + Math.sin(a) * r, s: 0.8 + rnd() * 1.6, rot: rnd() * 6.28 });
  }
  split(stones, 3).forEach((it, i) => instancedParts(scene, height, pathStones[i], it, 0, false, 60));
  split(shore, 3).forEach((it, i) => instancedParts(scene, height, pebbles[i], it, 0, false, 50));

  // Giant fairy mushrooms in a few clusters.
  const mush: Placement[] = [];
  for (const [cx, cz] of [[-14, -6], [9, 6], [-20, -30], [24, 2], [-4, -36]] as const) {
    for (let i = 0; i < 4; i++) {
      const x = cx + (rnd() - 0.5) * 5, z = cz + (rnd() - 0.5) * 5;
      if (reserved(x, z, 1)) continue;
      const s = 0.5 + rnd() * rnd() * 2.6;
      mush.push({ x, z, s, rot: rnd() * 6.28 });
      if (s > 1.2) colliders.push({ x, z, r: 0.25 * s });
    }
  }
  const mushMat = propMaterial(0, { emissive: '#ff5f8f', emissiveIntensity: 0.12 });
  // a big mushroom at the lens or between the camera and the heroine dissolves, as the trees do
  mushMat.onBeforeCompile = (sh) => fadeAtCamera(sh);
  mushMat.customProgramCacheKey = () => 'mush|fade';
  mushMat.userData.magicGlow = { base: 0.12, full: 0.42 } satisfies MagicGlow;     // they glow brighter with the magic
  instanced(scene, height, mushGeo, mushMat, mush, true);

  // Lily pads float on the pond.
  const lily = new THREE.InstancedMesh(lilyGeo, solid, 9);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.28, r = 2 + rnd() * (POND.r - 4), s = 1.6 + rnd() * 1.6;
    m.makeRotationY(rnd() * 6.28).scale(new THREE.Vector3(s, 1, s)).setPosition(POND.x + Math.cos(a) * r, WATER_Y + 0.02, POND.z + Math.sin(a) * r);
    lily.setMatrixAt(i, m);
  }
  lily.renderOrder = 2;
  scene.add(lily);

  const [castleGeo, houseGeo, wellGeo, gazeboGeo] = await Promise.all([
    staticGeo('extra/castle2', 8.5, { Stone: '#e6c3e0', Stone_Light: '#fff1f8', Wood: '#8f6bd6', Main: '#ff5f9e' }),
    staticGeo('extra/fhouse', 7.5, { RoofTiles: '#e7669a', Plaster: '#fff3dc', Wood: '#9a6a4c', Wood_Light: '#b98560', Wood_Side: '#caa27a' }),
    staticGeo('medieval_village_pack/Well', 2.2),
    staticGeo('medieval_village_pack/Gazebo', 4, {}),
  ]);
  const place = (g: THREE.BufferGeometry, x: number, z: number, rot: number, r: number) => {
    const mesh = new THREE.Mesh(g, solid);
    mesh.position.set(x, height(x, z) - 0.1, z); mesh.rotation.y = rot;
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    if (r) colliders.push({ x, z, r });
    return mesh;
  };
  place(castleGeo, CASTLE.x, CASTLE.z - 4, 0, 13);
  place(houseGeo, -9.5, 2.5, 1.2, 3.2);
  place(wellGeo, -5, 7.5, 0.4, 1.2);
  place(gazeboGeo, 22.5, -8, 0, 0);
  // The shop's signboard (R10, R19): a giant fairy mushroom of the clusters, already loaded, at the spawn meadow; the
  // world (./index.ts) hangs the shop's badge over its cap and puts the action spot beside it.
  const sign = place(mushGeo, SHOP_SIGN.x, SHOP_SIGN.z, 0.6, SIGN_STEM);
  sign.scale.setScalar(SIGN_H); sign.material = mushMat;
  for (let i = 0; i < 6; i++) { // gazebo posts only: the child can walk in
    const a = (i / 6) * 6.28 + 0.52;
    colliders.push({ x: 22.5 + Math.cos(a) * 1.9, z: -8 + Math.sin(a) * 1.9, r: 0.2 });
  }
}

/** One draw call of wind-blown grass tufts around the meadow. */
export function buildGrass(scene: THREE.Scene, count: number) {
  const rnd = mulberry32(5);
  const blades = 5, v: number[] = [], c: number[] = [], nrm: number[] = [];
  const base = new THREE.Color('#6cc254'), tip = new THREE.Color('#c9ee7c');
  for (let b = 0; b < blades; b++) {
    const a = rnd() * 6.28, ox = (rnd() - 0.5) * 0.34, oz = (rnd() - 0.5) * 0.34, h = 0.16 + rnd() * 0.2, w = 0.035;
    const lx = Math.cos(a) * 0.14, lz = Math.sin(a) * 0.14, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    v.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + lx, h, oz + lz, ox + px, 0, oz + pz, ox - px, 0, oz - pz, ox + lx, h, oz + lz);
    for (let k = 0; k < 2; k++) {
      c.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
      nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const mat = propMaterial(3.2, { roughness: 1 });
  const items: Placement[] = [];
  let t = 0;
  while (items.length < count && t++ < count * 8) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 58;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pathDist(x, z) < 1.5 || Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.2) continue;
    if (vnoise(x * 0.35, z * 0.35) < 0.3) continue;
    items.push({ x, z, s: 0.8 + rnd() * 0.9, rot: rnd() * 6.28 });
  }
  const tints = items.map((it) => new THREE.Color().setHSL(0.24 + fbm(it.x * 0.06, it.z * 0.06, 2) * 0.1, 0.2, 0.86 + rnd() * 0.14));
  instanced(scene, height, geo, mat, items, false, tints, undefined, 38);
}
