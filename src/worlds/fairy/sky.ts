import * as THREE from 'three';
import { staticGeo } from '../../core/assets';
import { mulberry32 } from '../../core/util';
import { uTime } from '../../core/materials';
import type { MagicCount, MagicGlow } from './magic';
import { POND, WATER_Y, height } from './terrain';

/**
 * The sky, the haze and the light of the kingdom with no magic back (as it always looked before the crystal was whole)
 * and with all of it (./magic.ts, WORLD-09): warmer and brighter, never darker than without.
 */
export const SKY_LOOK = {
  fog: ['#d9ecf7', '#f9e0f0'], fogNear: 70, fogFar: [130, 140], hemi: [1.25, 1.55], sun: [2.6, 3.0],
} as const;

/** The radius of the sky's sphere, m. Its colours go by direction alone: smaller and moved, it looks the same. */
export const SKY_RADIUS = 400;

/**
 * How far the camera sees in the valley (WORLD-10): a little past the end of the haze, so what is cut is already of
 * the haze's colour, and the sky below the horizon is of that colour too - the cut is never seen. Before, the camera
 * reached 600 m and the haze ended at 300-380 m, past the hill round the valley (some 75-90 m): the far hills stood
 * green to the top of the frame.
 */
export const VALLEY_FAR = 160;

/** The sky (its shader's `uGlow` is the magic of the world), the haze and the two lights. */
export function buildSky(scene: THREE.Scene) {
  const fog = new THREE.Fog(SKY_LOOK.fog[0], SKY_LOOK.fogNear, SKY_LOOK.fogFar[0]);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      // uFog is the haze's own colour (the magic changes it, ./magic.ts): the sky at and below the horizon is that
      uniforms: { uGlow: { value: 0 }, uFog: { value: fog.color } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform float uGlow; uniform vec3 uFog;
        void main(){
          float h = clamp(vDir.y, -0.1, 1.0);
          vec3 horizon = mix(vec3(1.0, 0.86, 0.80), vec3(1.0, 0.86, 0.90), uGlow);
          vec3 mid = mix(vec3(0.62, 0.84, 1.0), vec3(0.86, 0.80, 1.0), uGlow);
          vec3 top = mix(vec3(0.30, 0.58, 0.98), vec3(0.42, 0.56, 1.0), uGlow);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
          c = mix(c, top, smoothstep(0.25, 0.95, h));
          vec3 sunDir = normalize(vec3(0.45, 0.62, 0.35));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * (0.28 + 0.3 * uGlow));
          c += vec3(1.0, 0.82, 0.55) * uGlow * 0.12 * (1.0 - smoothstep(0.0, 0.35, h));
          c = mix(uFog, c, smoothstep(0.0, 0.16, vDir.y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -10;
  // round whatever camera draws it, inside its far plane (the camera's reach, ../index.ts): its size is set there
  sky.frustumCulled = false;
  sky.onBeforeRender = (_r, _s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  scene.add(sky);
  scene.fog = fog;

  const hemi = new THREE.HemisphereLight('#d6ecff', '#d2dcae', SKY_LOOK.hemi[0]);
  const sun = new THREE.DirectionalLight('#fff1d6', SKY_LOOK.sun[0]);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  const cam = sun.shadow.camera;
  cam.left = -26; cam.right = 26; cam.top = 26; cam.bottom = -26; cam.near = 1; cam.far = 120;
  scene.add(hemi, sun, sun.target);
  return { sky, sun, hemi, fog, sunOffset: new THREE.Vector3(0.45, 0.62, 0.35).multiplyScalar(60) };
}

export function buildWater(scene: THREE.Scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime },
    vertexShader: 'varying vec2 vP; varying vec3 vW; void main(){ vP = position.xy; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float uTime; varying vec2 vP; varying vec3 vW;
      void main(){
        float r = length(vP) / ${(POND.r + 1).toFixed(1)};
        float w1 = sin(vP.x * 1.3 + uTime * 0.9) * sin(vP.y * 1.1 - uTime * 0.7);
        float w2 = sin((vP.x + vP.y) * 2.3 + uTime * 1.6);
        vec3 deep = vec3(0.16, 0.56, 0.78), shallow = vec3(0.55, 0.92, 0.93);
        vec3 c = mix(deep, shallow, smoothstep(0.35, 1.0, r) + w1 * 0.08);
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(v.y, 0.0), 3.0);
        c = mix(c, vec3(0.86, 0.95, 1.0), fres * 0.55);
        float sparkle = smoothstep(0.93, 1.0, w1 * 0.5 + w2 * 0.5) ;
        c += sparkle * 0.6;
        float foam = smoothstep(0.86, 0.97, r + w2 * 0.015);
        c = mix(c, vec3(1.0), foam * 0.7);
        gl_FragColor = vec4(c, mix(0.86, 0.5, smoothstep(0.6, 1.0, r)));
      }`,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 1, 48), mat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, WATER_Y, POND.z);
  water.renderOrder = 1;
  scene.add(water);
}

/** Rainbow over the pond: hidden until the crystal is found, then fades in. */
export function buildRainbow(scene: THREE.Scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec2 vUv; uniform float uAlpha;
      vec3 band(float t){
        vec3 c = vec3(1.0, 0.35, 0.4);
        c = mix(c, vec3(1.0, 0.65, 0.3), smoothstep(0.12, 0.22, t));
        c = mix(c, vec3(1.0, 0.93, 0.4), smoothstep(0.28, 0.38, t));
        c = mix(c, vec3(0.45, 0.88, 0.5), smoothstep(0.44, 0.54, t));
        c = mix(c, vec3(0.4, 0.7, 1.0), smoothstep(0.6, 0.7, t));
        c = mix(c, vec3(0.66, 0.5, 0.96), smoothstep(0.78, 0.88, t));
        return c;
      }
      void main(){
        float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
        float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        gl_FragColor = vec4(band(vUv.y), edge * ends * 0.62 * uAlpha);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(30, 36, 64, 1, 0, Math.PI), mat);
  // RingGeometry uvs are planar; remap to (angle, radius) so the bands follow the arc.
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute, pos = mesh.geometry.getAttribute('position');
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    uv.setXY(i, Math.atan2(y, x) / Math.PI, (Math.hypot(x, y) - 30) / 6);
  }
  mesh.position.set(POND.x + 6, height(POND.x, POND.z - 30) - 4, POND.z - 34);
  mesh.rotation.y = -0.25;
  mesh.renderOrder = 2;
  scene.add(mesh);
  return mat.uniforms.uAlpha;
}

/** How many more motes, for every one of before, the magic of the world (./magic.ts) lights. */
export const MAGIC_MOTES = 0.7;

/**
 * Floating motes of light that always surround the player (wrapped in the shader, no CPU work). `count` of them are
 * drawn with no magic; the buffer holds MAGIC_MOTES times more after them, drawn as the magic comes back.
 */
export function buildMotes(scene: THREE.Scene, count: number) {
  const rnd = mulberry32(11);
  const all = count + Math.round(count * MAGIC_MOTES);
  const pos = new Float32Array(all * 3), seed = new Float32Array(all);
  for (let i = 0; i < all; i++) {
    pos[i * 3] = rnd() * 60; pos[i * 3 + 1] = 0.3 + rnd() * 5; pos[i * 3 + 2] = rnd() * 60; seed[i] = rnd() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uCenter = { value: new THREE.Vector3() };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime, uCenter, uScale: { value: 1 } },
    vertexShader: `
      uniform float uTime; uniform vec3 uCenter; uniform float uScale; attribute float aSeed; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.3 + aSeed) * 1.5; p.z += cos(uTime * 0.23 + aSeed * 1.3) * 1.5;
        p.y += sin(uTime * 0.5 + aSeed * 2.0) * 0.6;
        p.xz = uCenter.xz + mod(p.xz - uCenter.xz + 30.0, 60.0) - 30.0;
        p.y += uCenter.y;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vA = (0.45 + 0.55 * sin(uTime * 2.0 + aSeed * 7.0)) * smoothstep(30.0, 18.0, length(p.xz - uCenter.xz));
        gl_PointSize = uScale * (0.10 + 0.10 * fract(aSeed)) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.7) * a * a * vA, 1.0);
      }`,
  });
  geo.setDrawRange(0, count);
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.magicCount = { base: count, full: all } satisfies MagicCount;
  scene.add(pts);
  return { uCenter, uScale: mat.uniforms.uScale };
}

/** Drifting clouds; returns an updater. */
export async function buildClouds(scene: THREE.Scene) {
  const geos = await Promise.all([1, 2, 3].map((i) => staticGeo(`platformer_game_pack/Cloud_${i}`, 5)));
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffe9f2', emissiveIntensity: 0.35, roughness: 1, fog: false });
  mat.userData.magicGlow = { base: 0.35, full: 0.6 } satisfies MagicGlow;       // lit from within by the magic
  const rnd = mulberry32(8);
  const clouds = Array.from({ length: 16 }, (_, i) => {
    const mesh = new THREE.Mesh(geos[i % 3], mat);
    const a = rnd() * 6.28, r = 60 + rnd() * 120;
    mesh.position.set(Math.cos(a) * r, 38 + rnd() * 30, Math.sin(a) * r);
    mesh.scale.setScalar(1.5 + rnd() * 2.5);
    mesh.rotation.y = rnd() * 6.28;
    scene.add(mesh);
    return { mesh, speed: 0.4 + rnd() * 0.6 };
  });
  return (dt: number) => {
    for (const c of clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 200) c.mesh.position.x = -200;
    }
  };
}
