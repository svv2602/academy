import * as THREE from 'three';
import { uTime } from '../core/materials';
import type { Game } from './context';
import { glowTex } from './fx';

/** The guide (ARCH-05): a beam of light over the next goal and a trail of sparkles from the heroine towards it. */
export function createGuide(g: Game): { update(time: number, target: THREE.Vector3 | null): void } {
  const { scene, hero, groundY } = g;
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.7, 14, 20, 1, true),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, uniforms: { uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.0) * (0.2 + 0.07 * sin(uTime * 3.0 + vUv.y * 20.0)); gl_FragColor = vec4(vec3(1.0, 0.9, 0.55) * a, 1.0); }',
    }));
  scene.add(beacon);
  const trailN = 12, trailPos = new Float32Array(trailN * 3);
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ map: glowTex, size: 0.55, color: '#ffe89a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  trail.frustumCulled = false; scene.add(trail);

  return {
    // `target` is null while a scene holds the controls or before the start: the guide hides then.
    update: (time, target) => {
      const hp = hero.root.position;
      beacon.visible = trail.visible = !!target;
      if (target) {
        beacon.position.set(target.x, groundY(target.x, target.z) + 7, target.z);
        const dx = target.x - hp.x, dz = target.z - hp.z, d = Math.hypot(dx, dz) || 1, len = Math.min(d, 14);
        for (let i = 0; i < trailN; i++) {
          const f = ((i / trailN + time * 0.35) % 1) * len, x = hp.x + (dx / d) * f, z = hp.z + (dz / d) * f;
          trailPos.set([x, groundY(x, z) + 0.6 + Math.sin(time * 4 + i) * 0.2, z], i * 3);
        }
        trailGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
