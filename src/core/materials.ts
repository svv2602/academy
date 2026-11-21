import * as THREE from 'three';

export const uTime = { value: 0 };
/**
 * How strongly the wind bends the plants: one multiplier for every swaying material (1 - as they always swayed). The
 * world's magic (src/worlds/fairy/magic.ts) changes it; the shaders read it as a uniform, so no program is rebuilt.
 */
export const uSway = { value: 1 };
/** The quality tier the frame is drawn at (0, 1, 2; src/core/renderer.ts sets it): a shader may leave out what a weak tier does not draw. */
export const uTier = { value: 2 };

/** Vertex-coloured standard material; with `sway` the top of every instance bends in the wind. */
export function propMaterial(sway = 0, opts: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...opts });
  if (sway > 0) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.uniforms.uSway = uSway;
      sh.vertexShader = 'uniform float uTime;\nuniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec2 wp = instanceMatrix[3].xz;
        #else
          vec2 wp = modelMatrix[3].xz;
        #endif
        float gust = sin(uTime * 1.5 + wp.x * 0.31 + wp.y * 0.27) * 0.6 + sin(uTime * 2.9 + wp.x * 0.83 - wp.y * 0.6) * 0.3;
        float bend = position.y * position.y * ${sway.toFixed(5)} * uSway;
        transformed.x += gust * bend;
        transformed.z += cos(uTime * 1.1 + wp.y * 0.4) * bend * 0.5;`);
    };
    m.customProgramCacheKey = () => 'sway' + sway;
  }
  return m;
}

/**
 * m from the camera: a part of the scenery (src/core/instancing.ts `instancedParts`: the leaves, the trunks and the
 * crowns of the trees, the bushes; the big mushrooms) nearer than `out` dissolves into a pattern of dots, nearer than
 * `in` it is gone. When the camera behind the heroine comes into a crown (the trees of the valley stand close;
 * docs/perf.md, the glade 52 fps), what stands at the lens no longer fills the screen - the camera keeps its place
 * behind her, so it never comes up to the back of her head. Never seen in play otherwise: the camera stands 5 m and
 * more behind her. Shadows are not touched: they are drawn by the depth materials.
 */
export const NEAR_FADE = { in: 1.0, out: 2.6 };
/**
 * What stands between the camera and the heroine dissolves the same way: a part closer to the camera than her by more
 * than `before` m, within `r` m of the line from the camera to her middle (`in`: gone within that). So a big mushroom
 * or a trunk a few metres behind her never hides her.
 */
export const SEE_THROUGH = { in: 0.55, r: 0.95, before: 0.6 };
/**
 * The window through a big building (the castle): narrower, so a wall that is looked through keeps more of itself - a
 * wide hole in a big model shows its empty inside and its far wall through it.
 */
export const SEE_THROUGH_NARROW = { in: 0.35, r: 0.65, before: 0.6 };
export type SeeThrough = typeof SEE_THROUGH;
/**
 * The heroine's middle in the camera's space (xyz) and whether to look through to her (w: 1 on), set every frame by
 * the loop (src/game/loop.ts `seeThrough`); one uniform for every material of the scenery, no program is rebuilt.
 */
export const uSeeThrough = { value: new THREE.Vector4(0, 0, 0, 0) };

/** Every frame: the heroine's middle `at` (world) in the space of `camera` (its matrices up to date). */
export function seeThrough(camera: THREE.Camera, at: THREE.Vector3): void {
  uSeeThrough.value.set(at.x, at.y, at.z, 1).applyMatrix4(camera.matrixWorldInverse).setW(1);
}

const f2 = (n: number) => n.toFixed(2);
/**
 * The fragment code of NEAR_FADE and SEE_THROUGH (first in the material, before anything is read): how much of the
 * part is kept against a 4x4 ordered dither, so it thins evenly instead of fading through blending.
 */
export const fadeGlsl = (see: SeeThrough = SEE_THROUGH) => `{
  vec3 fadeP = -vViewPosition;
  float keep = smoothstep(${f2(NEAR_FADE.in)}, ${f2(NEAR_FADE.out)}, length(fadeP));
  if (uSeeThrough.w > 0.5) {
    vec3 h = uSeeThrough.xyz;
    float hl = length(h);
    float t = dot(fadeP, h) / max(hl * hl, 1e-4);
    if (t > 0.0 && t * hl < hl - ${f2(see.before)}) keep = min(keep, smoothstep(${f2(see.in)}, ${f2(see.r)}, length(fadeP - h * t)));
  }
  if (keep < 1.0) {
    ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
    int k = q.x + q.y * 4;
    float bayer = float(k == 0 ? 0 : k == 1 ? 8 : k == 2 ? 2 : k == 3 ? 10 : k == 4 ? 12 : k == 5 ? 4 : k == 6 ? 14 : k == 7 ? 6
      : k == 8 ? 3 : k == 9 ? 11 : k == 10 ? 1 : k == 11 ? 9 : k == 12 ? 15 : k == 13 ? 7 : k == 14 ? 13 : 5) / 16.0 + 1.0 / 32.0;
    if (keep < bayer) discard;
  }
}`;

/** Puts NEAR_FADE and SEE_THROUGH into a standard material's shader (inside its onBeforeCompile). */
export function fadeAtCamera(sh: THREE.WebGLProgramParametersWithUniforms, see: SeeThrough = SEE_THROUGH): void {
  sh.uniforms.uSeeThrough = uSeeThrough;
  sh.fragmentShader = 'uniform vec4 uSeeThrough;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  ${fadeGlsl(see)}`);
}
/** The fade of the scenery with the usual window (SEE_THROUGH). */
export const FADE_GLSL = fadeGlsl();
