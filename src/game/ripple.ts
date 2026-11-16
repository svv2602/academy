import * as THREE from 'three';

/** How long one ripple lasts, in seconds of game time. */
export const RIPPLE_TIME = 0.9;

/**
 * The magic ripple where a tap sends the heroine: two pastel rings run outward over the ground and six little stars
 * twinkle on the outer one. One quad and one shader, drawn only while a ripple plays (about a second after a tap).
 */
export function createRipple(scene: THREE.Scene) {
  const uP = { value: 1 }, uSpin = { value: 0 };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uP, uSpin },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uP, uSpin; varying vec2 vUv;
        float ring(float r, float c, float w) { return smoothstep(w, 0.0, abs(r - c)); }
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p), a = atan(p.y, p.x), t = uP;
          float e = 1.0 - (1.0 - t) * (1.0 - t);                      // ease out: fast at the tap, slowing down
          float fade = (1.0 - t) * smoothstep(0.0, 0.08, t);
          float c1 = mix(0.12, 0.92, e), t2 = clamp(t * 1.5 - 0.35, 0.0, 1.0);
          float c2 = mix(0.05, 0.62, 1.0 - (1.0 - t2) * (1.0 - t2));
          float rings = ring(r, c1, 0.075) + ring(r, c2, 0.055) * step(0.001, t2) * 0.8;
          // Pastel colours running round the ring: pink, lilac, sky blue.
          vec3 col = mix(vec3(1.0), 0.5 + 0.5 * cos(a + uSpin + t * 4.0 + vec3(0.0, 2.1, 4.2)), 0.8);
          // Six four-pointed stars on the outer ring, each twinkling once as the ring passes.
          float stars = 0.0;
          for (int k = 0; k < 6; k++) {
            float ang = float(k) * 1.0472 + uSpin;
            vec2 q = p - vec2(cos(ang), sin(ang)) * c1;
            float tw = sin(t * 3.1416) * (0.75 + 0.25 * sin(t * 18.0 + float(k) * 2.0));
            stars += tw * (0.0025 / (abs(q.x * q.y) + 0.0025)) * smoothstep(0.24, 0.0, length(q));
          }
          float alpha = clamp(rings + stars, 0.0, 1.0) * fade * step(r, 1.0);
          gl_FragColor = vec4(mix(col, vec3(1.0, 0.86, 0.35), clamp(stars, 0.0, 1.0)), alpha);   // the stars are gold
        }`,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(1.1);           // 1.1 m from the centre to the outer ring at its widest
  mesh.renderOrder = 5;
  mesh.visible = false;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    /** Starts a ripple at a point on the ground (a new tap restarts it there). */
    play(at: THREE.Vector3) {
      mesh.position.set(at.x, at.y + 0.06, at.z);
      uP.value = 0; uSpin.value = Math.random() * 6.2832;
      mesh.visible = true;
    },
    update(dt: number) {
      if (!mesh.visible) return;
      uP.value = Math.min(1, uP.value + dt / RIPPLE_TIME);
      if (uP.value >= 1) mesh.visible = false;
    },
    get playing() { return mesh.visible; },
  };
}
