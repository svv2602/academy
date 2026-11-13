import * as THREE from 'three';
import { staticGeo, texturedParts, type Part } from '../core/assets';
import { fbm, mulberry32, vnoise } from '../core/util';
import { CASTLE, CHEST, CRYSTAL, PATCH, POND, SPAWN, UNICORN, WATER_Y, WORLD_R, colliders, height, pathDist } from './terrain';

export const uTime = { value: 0 };

/** Vertex-coloured standard material; with `sway` the top of every instance bends in the wind. */
export function propMaterial(sway = 0, opts: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...opts });
  if (sway > 0) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec2 wp = instanceMatrix[3].xz;
        #else
          vec2 wp = modelMatrix[3].xz;
        #endif
        float gust = sin(uTime * 1.5 + wp.x * 0.31 + wp.y * 0.27) * 0.6 + sin(uTime * 2.9 + wp.x * 0.83 - wp.y * 0.6) * 0.3;
        float bend = position.y * position.y * ${sway.toFixed(5)};
        transformed.x += gust * bend;
        transformed.z += cos(uTime * 1.1 + wp.y * 0.4) * bend * 0.5;`);
    };
    m.customProgramCacheKey = () => 'sway' + sway;
  }
  return m;
}

export function buildSky(scene: THREE.Scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uGlow: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform float uGlow;
        void main(){
          float h = clamp(vDir.y, -0.1, 1.0);
          vec3 horizon = mix(vec3(1.0, 0.86, 0.80), vec3(1.0, 0.90, 0.72), uGlow);
          vec3 mid = vec3(0.62, 0.84, 1.0), top = vec3(0.30, 0.58, 0.98);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
          c = mix(c, top, smoothstep(0.25, 0.95, h));
          vec3 sunDir = normalize(vec3(0.45, 0.62, 0.35));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.28);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.Fog('#d9ecf7', 70, 300);

  const hemi = new THREE.HemisphereLight('#d6ecff', '#d2dcae', 1.25);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.6);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  const cam = sun.shadow.camera;
  cam.left = -26; cam.right = 26; cam.top = 26; cam.bottom = -26; cam.near = 1; cam.far = 120;
  scene.add(hemi, sun, sun.target);
  return { sky, sun, hemi, sunOffset: new THREE.Vector3(0.45, 0.62, 0.35).multiplyScalar(60) };
}

export function buildWater(scene: THREE.Scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime },
    vertexShader: 'varying vec2 vP; varying vec3 vW; void main(){ vP = position.xy; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float uTime; varying vec2 vP; varying vec3 vW;
      void main(){
        float r = length(vP) / ${(POND.r + 1).toFixed(1)};
        float w1 = sin(vP.x * 1.3 + uTime * 0.9) * sin(vP.y * 1.1 - uTime * 0.7);
        float w2 = sin((vP.x + vP.y) * 2.3 + uTime * 1.6);
        vec3 deep = vec3(0.16, 0.56, 0.78), shallow = vec3(0.55, 0.92, 0.93);
        vec3 c = mix(deep, shallow, smoothstep(0.35, 1.0, r) + w1 * 0.08);
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(v.y, 0.0), 3.0);
        c = mix(c, vec3(0.86, 0.95, 1.0), fres * 0.55);
        float sparkle = smoothstep(0.93, 1.0, w1 * 0.5 + w2 * 0.5) ;
        c += sparkle * 0.6;
        float foam = smoothstep(0.86, 0.97, r + w2 * 0.015);
        c = mix(c, vec3(1.0), foam * 0.7);
        gl_FragColor = vec4(c, mix(0.86, 0.5, smoothstep(0.6, 1.0, r)));
      }`,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 1, 48), mat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, WATER_Y, POND.z);
  water.renderOrder = 1;
  scene.add(water);
}

/** Rainbow over the pond: hidden until the crystal is found, then fades in. */
export function buildRainbow(scene: THREE.Scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec2 vUv; uniform float uAlpha;
      vec3 band(float t){
        vec3 c = vec3(1.0, 0.35, 0.4);
        c = mix(c, vec3(1.0, 0.65, 0.3), smoothstep(0.12, 0.22, t));
        c = mix(c, vec3(1.0, 0.93, 0.4), smoothstep(0.28, 0.38, t));
        c = mix(c, vec3(0.45, 0.88, 0.5), smoothstep(0.44, 0.54, t));
        c = mix(c, vec3(0.4, 0.7, 1.0), smoothstep(0.6, 0.7, t));
        c = mix(c, vec3(0.66, 0.5, 0.96), smoothstep(0.78, 0.88, t));
        return c;
      }
      void main(){
        float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
        float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        gl_FragColor = vec4(band(vUv.y), edge * ends * 0.62 * uAlpha);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(30, 36, 64, 1, 0, Math.PI), mat);
  // RingGeometry uvs are planar; remap to (angle, radius) so the bands follow the arc.
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute, pos = mesh.geometry.getAttribute('position');
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    uv.setXY(i, Math.atan2(y, x) / Math.PI, (Math.hypot(x, y) - 30) / 6);
  }
  mesh.position.set(POND.x + 6, height(POND.x, POND.z - 30) - 4, POND.z - 34);
  mesh.rotation.y = -0.25;
  mesh.renderOrder = 2;
  scene.add(mesh);
  return mat.uniforms.uAlpha;
}

/** Floating motes of light that always surround the player (wrapped in the shader, no CPU work). */
export function buildMotes(scene: THREE.Scene, count: number) {
  const rnd = mulberry32(11);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rnd() * 60; pos[i * 3 + 1] = 0.3 + rnd() * 5; pos[i * 3 + 2] = rnd() * 60; seed[i] = rnd() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uCenter = { value: new THREE.Vector3() };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime, uCenter, uScale: { value: 1 } },
    vertexShader: `
      uniform float uTime; uniform vec3 uCenter; uniform float uScale; attribute float aSeed; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.3 + aSeed) * 1.5; p.z += cos(uTime * 0.23 + aSeed * 1.3) * 1.5;
        p.y += sin(uTime * 0.5 + aSeed * 2.0) * 0.6;
        p.xz = uCenter.xz + mod(p.xz - uCenter.xz + 30.0, 60.0) - 30.0;
        p.y += uCenter.y;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vA = (0.45 + 0.55 * sin(uTime * 2.0 + aSeed * 7.0)) * smoothstep(30.0, 18.0, length(p.xz - uCenter.xz));
        gl_PointSize = uScale * (0.10 + 0.10 * fract(aSeed)) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.7) * a * a * vA, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return { uCenter, uScale: mat.uniforms.uScale };
}

interface Placement { x: number; z: number; s: number; rot: number; }

const CELL = 44, SMALL_CELL = 20;
/** Meshes of small props that are only drawn while the player is within `range` of their cell. */
const ranged: { mesh: THREE.Object3D; x: number; z: number; range: number }[] = [];
let drawRange = 1;
export function setDrawRange(k: number) { drawRange = k; }
export function updateRanged(px: number, pz: number) {
  for (const r of ranged) r.mesh.visible = Math.hypot(r.x - px, r.z - pz) < r.range * drawRange;
}

/**
 * Adds instances grouped into ground cells, so three.js can frustum-cull whole groups (also in the shadow pass).
 * With `range`, cells are small and vanish beyond that distance: ground clutter is invisible from afar anyway.
 */
function instanced(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, all: Placement[], shadow: boolean, tints?: THREE.Color[], depth?: THREE.Material, range = 0) {
  const cells = new Map<string, number[]>();
  const size = range ? SMALL_CELL : CELL;
  all.forEach((it, i) => {
    const k = `${Math.floor(it.x / size)},${Math.floor(it.z / size)}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(i);
  });
  for (const [k, idx] of cells) {
    const mesh = instancedCell(scene, geo, mat, idx.map((i) => all[i]), shadow, tints && idx.map((i) => tints[i]), depth);
    if (mesh && range) {
      const [cx, cz] = k.split(',').map(Number);
      ranged.push({ mesh, x: (cx + 0.5) * size, z: (cz + 0.5) * size, range: range + size * 0.7 });
    }
  }
}

function instancedCell(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, items: Placement[], shadow: boolean, tints?: THREE.Color[], depth?: THREE.Material) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.rot);
    m.compose(new THREE.Vector3(it.x, height(it.x, it.z) - 0.05, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
    mesh.setMatrixAt(i, m);
    if (tints) mesh.setColorAt(i, tints[i]);
  });
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  if (depth) mesh.customDepthMaterial = depth;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

/** True where nothing should grow: paths, the pond, quest spots, buildings. */
function reserved(x: number, z: number, margin: number) {
  if (pathDist(x, z) < 1.6 + margin) return true;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1 + margin) return true;
  if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < 15 + margin) return true;
  for (const p of [SPAWN, UNICORN, PATCH, CRYSTAL, CHEST]) if (Math.hypot(x - p.x, z - p.z) < 2.2 + margin) return true;
  return false;
}

/** Instances every part of a textured model at the same placements. */
function instancedParts(scene: THREE.Scene, parts: Part[], items: Placement[], sway: number, shadow: boolean, range = 0) {
  for (const p of parts) {
    const key = `${p.map?.uuid}|${p.cutout}|${sway}`;
    let mat = partMats.get(key);
    if (!mat) {
      mat = propMaterial(sway, { vertexColors: false, map: p.map, alphaTest: p.cutout ? 0.5 : 0, side: p.cutout ? THREE.DoubleSide : THREE.FrontSide, roughness: 0.9, color: p.map ? '#ffffff' : '#63c356' });
      if (p.cutout) {
        // Both sides of a leaf card are lit the same (no dark undersides).
        const wind = mat.onBeforeCompile;
        mat.onBeforeCompile = (sh, r) => {
          wind(sh, r);
          sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
            THREE.ShaderChunk.normal_fragment_begin.replace(/gl_FrontFacing \? 1\.0 : - ?1\.0/, '1.0'));
        };
        mat.customProgramCacheKey = () => 'leaf' + sway;
      }
      partMats.set(key, mat);
    }
    const depth = p.cutout && shadow ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: p.map, alphaTest: 0.5 }) : undefined;
    instanced(scene, p.geo, mat, items, shadow, undefined, depth, range);
  }
}
const partMats = new Map<string, THREE.MeshStandardMaterial>();

export async function buildScenery(scene: THREE.Scene, density: number) {
  const rnd = mulberry32(2024);
  const tree = propMaterial(0.0035), solid = propMaterial();
  const N = (n: string, h: number, normals: 'model' | 'up' | 'sphere' = 'model') => texturedParts('nature2/' + n, h, normals);

  // Detailed textured trees near the play area; cheap flat-colour ones for the distant forest ring.
  const nearDefs: [string, number, number][] = [
    ['CommonTree1', 8, 3], ['CommonTree2', 7.5, 3], ['CommonTree3', 6.5, 3], ['CommonTree4', 7, 3], ['CommonTree5', 6, 3],
    ['TwistedTree1', 7, 1], ['TwistedTree2', 6.5, 1], ['Pine5', 7.5, 2], ['Pine2', 9, 1],
  ];
  const farDefs: [string, number, Record<string, string>?][] = [
    ['nature_pack/CommonTree_1', 7.5], ['nature_pack/CommonTree_2', 8], ['nature_pack/CommonTree_3', 6.5], ['nature_pack/PineTree_1', 8.5],
    ['nature_pack/CommonTree_4', 6.5, { Green: '#ffb7d5', DarkGreen: '#f794bd' }],
  ];
  const [nearTrees, farGeos, rocks3, bushes, flowerKinds, smalls, tallGrass, mushSmall, pathStones, pebbles, mushGeo, stumpGeo, lilyGeo] = await Promise.all([
    Promise.all(nearDefs.map(([n, h]) => N(n, h, 'sphere'))),
    Promise.all(farDefs.map(([p, h, rc]) => staticGeo(p, h, rc))),
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

  const weights = nearDefs.map((d) => d[2]), wsum = weights.reduce((a, b) => a + b, 0);
  const nearItems: Placement[][] = nearDefs.map(() => []), farItems: Placement[][] = farDefs.map(() => []);
  const placed: { x: number; z: number }[] = [];
  let tries = 0;
  while (placed.length < 150 * density && tries++ < 6000) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (WORLD_R + 22);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const forest = fbm(x * 0.045 + 40, z * 0.045 + 13, 3);
    if (r <= WORLD_R - 22 && forest < 0.56) continue;
    if (reserved(x, z, 2.5) || placed.some((p) => Math.hypot(p.x - x, p.z - z) < 3.6)) continue;
    const item = { x, z, s: 0.85 + rnd() * 0.45, rot: rnd() * 6.28 };
    if (r < 52) {
      let pick = rnd() * wsum, k = 0;
      while ((pick -= weights[k]) > 0) k++;
      nearItems[k].push(item);
    } else farItems[Math.floor(rnd() * farDefs.length)].push(item);
    placed.push({ x, z });
    if (r < WORLD_R) colliders.push({ x, z, r: 0.6 });
  }
  // A grove that hides the secret chest.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 1.5 + 2.2, x = CHEST.x + Math.cos(a) * 4.4, z = CHEST.z + Math.sin(a) * 4.4;
    nearItems[i % 5].push({ x, z, s: 0.95 + rnd() * 0.2, rot: rnd() * 6.28 });
    colliders.push({ x, z, r: 0.6 });
  }
  nearTrees.forEach((parts, i) => instancedParts(scene, parts, nearItems[i], 0.0035, true));
  farGeos.forEach((g, i) => instanced(scene, g, tree, farItems[i], false));

  const scatter = (n: number, margin: number, ok?: (x: number, z: number) => boolean, maxR = WORLD_R - 6) => {
    const out: Placement[] = [];
    let t = 0;
    while (out.length < n && t++ < n * 30) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * maxR;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (reserved(x, z, margin) || (ok && !ok(x, z))) continue;
      out.push({ x, z, s: 0.7 + rnd() * 0.7, rot: rnd() * 6.28 });
    }
    return out;
  };
  const split = (items: Placement[], n: number) => Array.from({ length: n }, (_, i) => items.filter((_, j) => j % n === i));

  const rocks = scatter(40 * density, 1.5, undefined, 56);
  rocks.forEach((r) => { if (r.s > 1.05) colliders.push({ x: r.x, z: r.z, r: r.s * 0.45 }); });
  split(rocks, 3).forEach((it, i) => instancedParts(scene, rocks3[i], it, 0, true));
  split(scatter(60 * density, 1.2, undefined, 56), 2).forEach((it, i) => instancedParts(scene, bushes[i], it, 0.03, true));
  instanced(scene, stumpGeo, solid, scatter(8, 2), true);

  // Under-growth: ferns and big leaves hug the trees, clover carpets the open meadow.
  const nearTree = (x: number, z: number) => placed.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5);
  split(scatter(110 * density, 0.4, nearTree, 56), 2).forEach((it, i) => instancedParts(scene, smalls[i === 0 ? 0 : 3], it, 0.25, false, 46));
  split(scatter(110 * density, 0.2, undefined, 50), 2).forEach((it, i) => instancedParts(scene, smalls[1 + i], it, 0, false, 40));
  instancedParts(scene, smalls[4], scatter(60 * density, 0.4, undefined, 56), 0.25, false, 46);
  split(scatter(160 * density, 0.5, (x, z) => vnoise(x * 0.2, z * 0.2) > 0.55, 56), 2).forEach((it, i) => instancedParts(scene, tallGrass[i], it, 0.6, false, 46));
  instancedParts(scene, mushSmall, scatter(40 * density, 0.5, nearTree, 56), 0, false, 40);

  // Flowers grow in drifts of one kind each, plus the dense bed where the task butterflies live.
  const drift = (x: number, z: number) => fbm(x * 0.09 + 5, z * 0.09 + 77, 2) > 0.5;
  const flowers = scatter(230 * density, 0.2, drift, 58);
  const kindOf = (f: Placement) => Math.floor(vnoise(f.x * 0.11 + 3, f.z * 0.11) * 3.999);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 2.6;
    flowers.push({ x: PATCH.x + Math.cos(a) * r, z: PATCH.z + Math.sin(a) * r, s: 1.1 + rnd() * 0.5, rot: rnd() * 6.28 });
  }
  flowerKinds.forEach((parts, k) => instancedParts(scene, parts, flowers.filter((f) => kindOf(f) === k), 0.45, false, 55));

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
  split(stones, 3).forEach((it, i) => instancedParts(scene, pathStones[i], it, 0, false, 60));
  split(shore, 3).forEach((it, i) => instancedParts(scene, pebbles[i], it, 0, false, 50));

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
  instanced(scene, mushGeo, propMaterial(0, { emissive: '#ff5f8f', emissiveIntensity: 0.12 }), mush, true);

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
  instanced(scene, geo, mat, items, false, tints, undefined, 38);
}

/** Drifting clouds; returns an updater. */
export async function buildClouds(scene: THREE.Scene) {
  const geos = await Promise.all([1, 2, 3].map((i) => staticGeo(`platformer_game_pack/Cloud_${i}`, 5)));
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffe9f2', emissiveIntensity: 0.35, roughness: 1, fog: false });
  const rnd = mulberry32(8);
  const clouds = Array.from({ length: 16 }, (_, i) => {
    const mesh = new THREE.Mesh(geos[i % 3], mat);
    const a = rnd() * 6.28, r = 60 + rnd() * 120;
    mesh.position.set(Math.cos(a) * r, 38 + rnd() * 30, Math.sin(a) * r);
    mesh.scale.setScalar(1.5 + rnd() * 2.5);
    mesh.rotation.y = rnd() * 6.28;
    scene.add(mesh);
    return { mesh, speed: 0.4 + rnd() * 0.6 };
  });
  return (dt: number) => {
    for (const c of clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 200) c.mesh.position.x = -200;
    }
  };
}
