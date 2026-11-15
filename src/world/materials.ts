import * as THREE from 'three';

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
