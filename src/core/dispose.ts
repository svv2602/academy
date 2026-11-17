import * as THREE from 'three';

/**
 * TECH-15: freeing what the renderer holds for a tree of objects. Three.js frees nothing by itself: a geometry, a
 * material or a texture keeps its buffers on the video card until `dispose()` is called on it.
 *
 * `seen` remembers what was freed already, so a resource met twice (one geometry under ten meshes, one texture in
 * two materials) is freed once. Pass the same set to several calls to share it between them.
 */
export type Seen = Set<object>;

const isTexture = (v: unknown): v is THREE.Texture => !!v && (v as THREE.Texture).isTexture === true;

function disposeTextures(v: unknown, seen: Seen) {
  if (Array.isArray(v)) { for (const x of v) disposeTextures(x, seen); return; }
  if (!isTexture(v) || seen.has(v)) return;
  seen.add(v);
  v.dispose();
}

/**
 * Frees the material and every texture it holds: any property whose value is a texture (`map`, `normalMap`,
 * `alphaMap`, ...) and, for a `ShaderMaterial`, the textures among its `uniforms` (one or an array).
 */
export function disposeMaterial(mat: THREE.Material, seen: Seen = new Set()): void {
  if (seen.has(mat)) return;
  seen.add(mat);
  for (const v of Object.values(mat)) disposeTextures(v, seen);
  const uniforms = (mat as THREE.ShaderMaterial).uniforms as Record<string, THREE.IUniform> | undefined;
  if (uniforms) for (const u of Object.values(uniforms)) disposeTextures(u?.value, seen);
  mat.dispose();
}

/**
 * Frees everything under `root` (itself included): geometries, materials (one or an array) with their textures,
 * the bone textures of skeletons and the per-instance buffers of instanced meshes. It removes nothing from the
 * scene and leaves the objects as they are: taking the tree out of the scene is the caller's job.
 *
 * A freed resource that is drawn again is simply uploaded again, so freeing something another tree still shows
 * costs time, not a crash. What must not be freed here is told apart by the caller, not by this function.
 */
export function disposeTree(root: THREE.Object3D, seen: Seen = new Set()): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
    if (m.material) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) disposeMaterial(mat, seen);
    // Skeleton.dispose() frees its bone texture and forgets it: calling it twice is harmless, so it needs no `seen`.
    (o as THREE.SkinnedMesh).skeleton?.dispose();
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}
