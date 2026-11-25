/**
 * The models of the Sky Islands' things (step 6b, CREDITS.md): three CC0 models by Quaternius - the Sail Ship that hangs
 * under the airship's red balloon, the Tower Windmill of the windmill island, the Dragon the little dragons are made of.
 * The world's own files (models/sky/, TECH-09), loaded by ./index.ts with the characters; ./scenery.ts,
 * ./landmarks.ts and ./creatures.ts make them into the scene. The ship and the windmill are baked here as the grey
 * build's painted shapes were (./landmarks.ts `paint`): one geometry of vertex colours each, one draw call however
 * many materials the model has, in the colours of the islands instead of the models' own dark ones.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gltf } from '../../core/assets';

/** The files of the three models, under models/. */
export const PROP_PATHS = { airship: 'sky/airship', windmill: 'sky/windmill', drakey: 'sky/drakey' } as const;

/** The loaded models: the ship's and the windmill's scenes (read, never changed), the dragon with its clips. */
export interface SkyProps {
  airship: THREE.Object3D;
  windmill: THREE.Object3D;
  drakey: Pick<GLTF, 'scene' | 'animations'>;
}

/** Loads the three models; a failure rejects (./index.ts hands it to `loadFailed`, TECH-08). */
export async function loadSkyProps(): Promise<SkyProps> {
  const [airship, windmill, drakey] = await Promise.all([gltf(PROP_PATHS.airship), gltf(PROP_PATHS.windmill), gltf(PROP_PATHS.drakey)]);
  return { airship: airship.scene, windmill: windmill.scene, drakey };
}

/** A material's colour lifted out of the dark the packs are authored in (src/core/assets.ts does the same to its props). */
const lifted = (c: THREE.Color) => new THREE.Color(Math.pow(c.r, 0.62), Math.pow(c.g, 0.62), Math.pow(c.b, 0.62));

/**
 * The meshes under `root` that `take` accepts, merged into one geometry in `root`'s own space with a colour per vertex:
 * the colour of each mesh's material by its name in `colours`, else its own colour lifted. No index and no uv (the
 * painted shapes' layout, so ./landmarks.ts can merge it with them); `root` is not changed.
 */
export function bake(root: THREE.Object3D, colours: Readonly<Record<string, string>>, take: (m: THREE.Mesh) => boolean = () => true): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const into = root.matrixWorld.clone().invert(), parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !take(m)) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', src.getAttribute('position').clone());
    if (src.getAttribute('normal')) geo.setAttribute('normal', src.getAttribute('normal').clone());
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(into, m.matrixWorld));
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const c = colours[mat.name] ? new THREE.Color(colours[mat.name]) : lifted(mat.color);
    const n = geo.getAttribute('position').count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(geo);
  });
  const merged = parts.length ? mergeGeometries(parts, false) : null;
  if (!merged) throw new Error(`sky props: nothing to bake under "${root.name}"`);
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return merged;
}

/** The Sail Ship's materials in the airship's colours (the grey build's: a brown hull, a pale deck, cream sails, red trim). */
export const AIRSHIP_COLOURS: Readonly<Record<string, string>> = {
  DarkWood: '#a0683c', Wood: '#7a4e30', LightWood: '#d8a878', Fabric: '#fff4e0', DarkRed: '#e8483c',
};
/** The Tower Windmill's materials in the windmills' (the grey build's: a white tower, an orange roof, orange sails). */
export const WINDMILL_COLOURS: Readonly<Record<string, string>> = {
  Grey: '#fff8ee', DarkGrey: '#f2e8da', RoofBlack: '#ff9a3c', LightBrown: '#c89060', White: '#ffffff', Black: '#5a4a7a', DarkBrown: '#8a5a3a',
};
/** The Tower Windmill's sails: its blades in the grey build's orange (their material is the base's, LightBrown). */
export const SAIL_COLOURS: Readonly<Record<string, string>> = { LightBrown: '#ff8a2a' };
/** Which mesh of the Tower Windmill is its blades (the part that turns); the rest is its tower. */
export const isBlades = (m: THREE.Object3D) => m.name.includes('Blades');
