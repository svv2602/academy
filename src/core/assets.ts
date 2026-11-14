import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Every model in public/models is written by `npm run assets` (tools/assets.mjs) with EXT_meshopt_compression and
// WebP textures. The decoder is one module with its wasm inlined, so it is part of the bundle and works offline.
// The pipeline does not quantize: attributes arrive as the same Float32 arrays the functions below always read.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();
let total = 0, loaded = 0;
export let onProgress: (f: number) => void = () => {};
export function setProgressHandler(fn: (f: number) => void) { onProgress = fn; }

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

export function gltf(path: string): Promise<GLTF> {
  let p = cache.get(path);
  if (!p) {
    total++;
    p = loader.loadAsync(`${import.meta.env.BASE_URL}models/${path}.glb`).then((g) => {
      loaded++; onProgress(loaded / total);
      return g;
    });
    cache.set(path, p);
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
