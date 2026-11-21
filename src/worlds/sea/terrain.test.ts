import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { uTier, uTime } from '../../core/materials';
import { CAUSTIC_STRENGTH, buildGround, causticMaterial } from './terrain';

/** The turquoise caustics on the sand (src/worlds/sea/terrain.ts `causticMaterial`, the customer's choice of 2026-11-21). */
describe('the caustics of the sea floor', () => {
  const compiled = () => {
    const m = causticMaterial(new THREE.MeshStandardMaterial());
    const sh = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader: 'void main() {\nvec3 outgoingLight = vec3(0.0);\n#include <opaque_fragment>\n#include <fog_fragment>\n}',
    };
    m.onBeforeCompile(sh as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    return { m, sh };
  };

  it('are drawn by the floor\'s own material: no texture, the same mesh, one program of their own', () => {
    const ground = buildGround(8);
    const m = ground.material as THREE.MeshStandardMaterial;
    expect(m.map).toBeNull();
    expect(m.customProgramCacheKey()).toBe('sea-caustics');
    expect(ground.children).toHaveLength(0);
  });

  it('sway on the game\'s time and are left out on the weakest tier, by the shared uniforms', () => {
    const { sh } = compiled();
    expect(sh.uniforms.uTime).toBe(uTime);
    expect(sh.uniforms.uTier).toBe(uTier);
    expect(sh.vertexShader).toMatch(/#include <begin_vertex>\n\s*vCausticAt = \(modelMatrix \* vec4\(position, 1\.0\)\)\.xz;/);
    // mixed into the light before the haze: far away the caustics go into the turquoise water with the sand
    const at = sh.fragmentShader.indexOf('outgoingLight = mix('), fog = sh.fragmentShader.indexOf('#include <fog_fragment>');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(sh.fragmentShader.indexOf('#include <opaque_fragment>'));
    expect(at).toBeLessThan(fog);
    expect(sh.fragmentShader).toContain('if (uTier > 0.5) outgoingLight = mix(outgoingLight,');
    expect(sh.fragmentShader).toContain('caustic(vCausticAt, uTime)');
    expect(CAUSTIC_STRENGTH).toBeGreaterThan(0);
    expect(CAUSTIC_STRENGTH).toBeLessThan(0.6);   // a sheen: the sand between the lines and under them stays warm
  });
});
