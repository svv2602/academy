import * as THREE from 'three';
import { uTime } from '../core/materials';
import type { Game } from './context';
import { glowTex } from './fx';
import { GUIDE } from '../core/tuning';
import { askedTime, guideShows, guideState, progressOf } from './guide-rule';

/**
 * The guide (ARCH-05): a beam of light over the next goal and a trail of sparkles from the heroine towards it. They fade
 * world by world (the customer's word of 2026-11-27, src/game/guide-rule.ts): in some only after a while with no
 * progress, in others as a short flash towards the goal; a tap on the cat shows the whole trail at once.
 */
export function createGuide(g: Game): { update(time: number, target: THREE.Vector3 | null): void } {
  const { scene, hero, groundY } = g;
  let last = -1, world = '', key = -1;
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
      // the time with no progress: game time while she is free and has a goal; a new world or any progress starts it again
      const now = progressOf(g.save, g.ws);
      if (g.world.id !== world || now !== key) { world = g.world.id; key = now; guideState.quiet = 0; }
      else if (target && last >= 0) guideState.quiet += Math.max(0, Math.min(0.25, time - last));
      last = time;
      const askedAt = askedTime(time);
      guideState.asked = askedAt >= 0 && time - askedAt < GUIDE.askedS;
      const show = target ? guideShows(world, guideState.quiet, guideState.asked, guideState.choice) : null;
      guideState.show = show;
      beacon.visible = show === 'trail';
      trail.visible = show !== null;
      if (target && show) {
        beacon.position.set(target.x, groundY(target.x, target.z) + 7, target.z);
        const dx = target.x - hp.x, dz = target.z - hp.z, d = Math.hypot(dx, dz) || 1, len = Math.min(d, show === 'flash' ? GUIDE.flashM : 14);
        for (let i = 0; i < trailN; i++) {
          const f = ((i / trailN + time * 0.35) % 1) * len, x = hp.x + (dx / d) * f, z = hp.z + (dz / d) * f;
          trailPos.set([x, groundY(x, z) + 0.6 + Math.sin(time * 4 + i) * 0.2, z], i * 3);
        }
        trailGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
