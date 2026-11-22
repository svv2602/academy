import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { disposeTree } from './dispose';

// Every model in public/models is written by `npm run assets` (tools/assets.mjs) with EXT_meshopt_compression and
// WebP textures. The decoder is one module with its wasm inlined, so it is part of the bundle and works offline.
// The pipeline does not quantize: attributes arrive as the same Float32 arrays the functions below always read.
let total = 0, loaded = 0, round = 0;
export let onProgress: (f: number) => void = () => {};
export function setProgressHandler(fn: (f: number) => void) { onProgress = fn; }
/**
 * TECH-15: starts the count of the loading bar from zero - call it before the load of a world, so its loading
 * screen does not start where the one before stopped. A model asked for before the call no longer moves the bar.
 */
export function resetProgress() { total = 0; loaded = 0; round++; }

/**
 * The CC0 packs are authored dark and semi-metallic for other engines. Common material names get a
 * storybook palette; everything else is gamma-lifted so nothing reads as muddy.
 */
const PALETTE: Record<string, string> = {
  Green: '#66c552', DarkGreen: '#48ab55', Wood: '#a9754f', Rock: '#c2bfce', Cyan: '#ffffff', Yellow: '#ffd44a',
  Pink: '#ff8fc0', Black: '#5d5866', Berry: '#ff5f7a', RoofTiles_Red: '#e7669a', Cloud: '#ffffff', Windows: '#ffe9a8',
};
function storybook(name: string, src: THREE.Color, recolor?: Record<string, string>) {
  const hex = recolor?.[name] ?? PALETTE[name];
  if (hex) return new THREE.Color(hex);
  return new THREE.Color(Math.pow(src.r, 0.62), Math.pow(src.g, 0.62), Math.pow(src.b, 0.62));
}

/** TECH-08: how many times a load that failed is repeated before the game gives up and says so. */
export const RETRIES = 3;
/** The pause before repeat `n` (0, 1, 2): 0.3, 0.6, 1.2 s - short, the loading bar is on the screen meanwhile. */
const pause = (n: number) => new Promise<void>((r) => setTimeout(r, 300 * 2 ** n));

/** Runs `load`; if it fails, runs it again up to `retries` more times, waiting `wait(n)` before repeat n. */
export async function retry<T>(load: () => Promise<T>, retries = RETRIES, wait: (n: number) => Promise<void> = pause): Promise<T> {
  for (let n = 0; ; n++) {
    try { return await load(); } catch (e) { if (n >= retries) throw e; }
    await wait(n);
  }
}

/**
 * Loads by key, once per key, with repeats (`retry`). A load that failed every attempt leaves the cache at once, so
 * asking for the key again starts over instead of handing back the same failure.
 */
export function loadCache<T>(load: (key: string) => Promise<T>, retries = RETRIES, wait: (n: number) => Promise<void> = pause) {
  const cache = new Map<string, Promise<T>>();
  return (key: string): Promise<T> => {
    let p = cache.get(key);
    if (!p) {
      const mine: Promise<T> = p = retry(() => load(key), retries, wait);
      cache.set(key, mine);
      mine.catch(() => { if (cache.get(key) === mine) cache.delete(key); });
    }
    return p;
  };
}

/**
 * One attempt at a model: the .glb and every texture it references. GLTFLoader only logs a texture it could not
 * fetch and goes on without it; here that counts as a failed attempt, so the texture is asked for again too.
 * Each attempt has a loader and a manager of its own: a failure is then known to belong to this model.
 */
function loadModel(path: string): Promise<GLTF> {
  const manager = new THREE.LoadingManager();
  let failed = '';
  manager.onError = (url) => { failed ||= url; };
  return new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).loadAsync(`${import.meta.env.BASE_URL}models/${path}.glb`).then((g) => {
    if (failed) throw new Error(`could not load ${failed}`);
    return g;
  });
}

/**
 * TECH-09, TECH-15: who a loaded model belongs to. A model asked for while the load of a world runs (`withScope`)
 * belongs to that world; a model asked for outside any scope, or one on the `shared` list, is kept for the whole
 * page. `release(world)` frees the models that belong to released worlds only and makes the loader forget them.
 *
 * Where the line runs. `release` frees the SOURCE models: the geometries, materials, textures and skeletons of what
 * GLTFLoader returned. What the functions below derive from a source belongs to whoever put it into a scene, and
 * that owner frees it with `disposeTree` (src/core/dispose.ts): the merged geometries of `staticGeo` and
 * `texturedParts`, the cloned materials of `rig` and its welded geometries. Derived objects still SHARE with the
 * source: the textures (`rig` materials, `Part.map`) and, for a `rig` without `smooth`, the geometries. So a world
 * is taken out of the scene first and released after; freeing a shared resource twice is harmless.
 * A texture loaded past this file (`THREE.TextureLoader`) is unknown here and stays with the owner of the scene.
 */
interface Held {
  /** `loadCache` cannot forget a key that loaded, so each model has a cache of its own: forgetting the model drops it. */
  load: (path: string) => Promise<GLTF>;
  /** The scopes that asked for the model and are not released yet. */
  owners: Set<string>;
  /** Asked for outside any scope or listed in `shared`: never released. */
  kept: boolean;
}
const held = new Map<string, Held>();
const counted = new WeakSet<Promise<GLTF>>();

/**
 * Models every world shows. Until the shared load is taken apart from the load of a world, the heroine, her items
 * and the cat are loaded inside the world's own `load` - without this list they would be released with the world.
 * An entry that ends with `/` is a folder, any other is one model.
 */
const sharedPaths = ['hero/', 'items/', 'extra/cat'];
const isShared = (path: string) => sharedPaths.some((s) => (s.endsWith('/') ? path.startsWith(s) : path === s));

/** Marks models (`'extra/cat'`) or folders of models (`'hero/'`) as shared: loaded or not yet, they are never released. */
export function shared(...paths: string[]) {
  sharedPaths.push(...paths);
  for (const [path, h] of held) if (isShared(path)) h.kept = true;
}

let scope: string | null = null, holders = 0;
const waiting: Array<() => void> = [];

/**
 * Runs `load` with every model it asks for - before and after its `await`s - recorded as belonging to scope `id`
 * (the id of a world). A browser has no way to tell which asynchronous call a line of code runs in, so the scope is
 * a lock instead: one scope is open at a time, and a `withScope` for another id waits until this one is done. Two
 * worlds asked for together therefore load one after the other, and each gets exactly its own models. Calls with
 * the id that is open join it at once, so a world may load more models later the same way.
 *
 * Do not open a scope for another id from inside `load`: it would wait for `load` itself. A model asked for by
 * other code while a scope is open is recorded in that scope too - list it in `shared` if it must stay.
 */
export async function withScope<T>(id: string, load: () => Promise<T>): Promise<T> {
  while (scope !== null && scope !== id) await new Promise<void>((r) => { waiting.push(r); });
  scope = id; holders++;
  try { return await load(); } finally {
    if (--holders === 0) { scope = null; for (const r of waiting.splice(0)) r(); }
  }
}

/**
 * Releases scope `id`: a model no other unreleased scope asked for, and which is not shared, is freed (geometries,
 * materials, textures, skeletons - see the note above `Held`) and forgotten, so asking for it again loads it again.
 * A model still loading is freed as soon as it arrives.
 */
export function release(id: string) {
  for (const [path, h] of held) {
    if (!h.owners.delete(id) || h.kept || h.owners.size > 0) continue;
    held.delete(path);
    h.load(path).then((g) => disposeTree(g.scene), () => {});
  }
}

export function gltf(path: string): Promise<GLTF> {
  let h = held.get(path);
  if (!h) held.set(path, h = { load: loadCache(loadModel), owners: new Set(), kept: false });
  if (scope === null || isShared(path)) h.kept = true; else h.owners.add(scope);
  const p = h.load(path), mine = h, now = round;
  if (!counted.has(p)) {
    counted.add(p); total++;
    p.then(() => { if (now === round) { loaded++; onProgress(loaded / total); } }, () => {
      if (now === round) total--;
      // TECH-08: a model that failed for good has left its cache; no scope keeps a record of it either.
      if (held.get(path) === mine) held.delete(path);
    });
  }
  return p;
}

/**
 * Static prop as ONE geometry: every mesh is merged and its flat material colour is baked into vertex
 * colours, so a whole model costs a single draw call (or one InstancedMesh for hundreds of copies).
 * The result stands on y=0, is centred on x/z and is `height` metres tall.
 */
export async function staticGeo(path: string, height: number, recolor?: Record<string, string>): Promise<THREE.BufferGeometry> {
  const g = await gltf(path);
  g.scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', src.getAttribute('position').clone());
    if (src.getAttribute('normal')) geo.setAttribute('normal', src.getAttribute('normal').clone());
    geo.applyMatrix4(m.matrixWorld);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const c = storybook(mat.name, mat.color, recolor);
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(geo);
  });
  const merged = mergeVertices(mergeGeometries(parts, false)!, 1e-4);
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const s = height / (bb.max.y - bb.min.y);
  merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  merged.scale(s, s, s);
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  merged.name = path;   // what the tools of measure (tools/tris.mjs) name it by
  return merged;
}

export interface Part { geo: THREE.BufferGeometry; name: string; map: THREE.Texture | null; cutout: boolean; }

/**
 * Textured prop (converted "Stylized Nature" kit): one geometry per material, all normalised together so the
 * model stands on y=0 and is `height` metres tall. Cut-out foliage gets soft normals (see `normals`).
 */
export async function texturedParts(path: string, height: number, normals: 'model' | 'up' | 'sphere' = 'model'): Promise<Part[]> {
  const g = await gltf(path);
  g.scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  const box = new THREE.Box3();
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    geo.name = `${path}:${mat.name}`;
    geo.computeBoundingBox(); box.union(geo.boundingBox!);
    if (mat.map) { mat.map.anisotropy = 4; mat.map.colorSpace = THREE.SRGBColorSpace; }
    parts.push({ geo, name: mat.name, map: mat.map, cutout: mat.alphaTest > 0 });
  });
  const s = height / (box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  for (const p of parts) {
    p.geo.translate(-cx, -box.min.y, -cz).scale(s, s, s);
    p.geo.computeBoundingBox(); p.geo.computeBoundingSphere();
    if (!p.cutout || normals === 'model') continue;
    // Leaf cards lit by their own face normals look like crumpled paper. Small plants take the ground's
    // normal; tree crowns are shaded as one soft ball.
    const pos = p.geo.getAttribute('position'), n = p.geo.getAttribute('normal') as THREE.BufferAttribute;
    const c = p.geo.boundingBox!.getCenter(new THREE.Vector3()), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      if (normals === 'up') v.set(0, 1, 0);
      else v.set(pos.getX(i) - c.x, (pos.getY(i) - c.y) * 0.8 + height * 0.25, pos.getZ(i) - c.z).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
  }
  // The converted kit stores three vertices per triangle; welding identical ones cuts vertex work 3-5x.
  for (const p of parts) {
    const bb = p.geo.boundingBox, bs = p.geo.boundingSphere;
    p.geo = mergeVertices(p.geo, 1e-4);
    p.geo.boundingBox = bb; p.geo.boundingSphere = bs;
  }
  return parts;
}

export interface Rig { root: THREE.Group; model: THREE.Object3D; clips: Map<string, THREE.AnimationClip>; }

/** Animated character: an independent skinned clone scaled to `height` metres, feet on y=0. */
export async function rig(path: string, height: number, smooth = false): Promise<Rig> {
  const g = await gltf(path);
  const model = cloneSkinned(g.scene);
  model.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(model);
  const s = height / (bb.max.y - bb.min.y);
  model.scale.setScalar(s);
  model.position.y = -bb.min.y * s;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false; // skinned bounds are bind-pose only
    if (smooth) {
      // Faceted low-poly -> soft toy: weld vertices by position (skin data included) and re-average the normals.
      const g = m.geometry.clone();
      g.deleteAttribute('normal');
      if (!(m.material as THREE.MeshStandardMaterial).map) g.deleteAttribute('uv');
      m.geometry = mergeVertices(g, 1e-5);
      m.geometry.computeVertexNormals();
    }
    const lift = (x: THREE.Material) => {
      const c = x.clone() as THREE.MeshStandardMaterial;
      c.color.copy(storybook('', c.color)); c.metalness = 0; c.roughness = 0.75;
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(lift) : lift(m.material);
  });
  const root = new THREE.Group();
  root.add(model);
  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of g.animations) clips.set(c.name.split('|').pop()!, c);
  return { root, model, clips };
}

export function tint(model: THREE.Object3D, colors: Record<string, string>) {
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const c = colors[mat.name];
      if (c) (mat as THREE.MeshStandardMaterial).color.set(c);
    }
  });
}
