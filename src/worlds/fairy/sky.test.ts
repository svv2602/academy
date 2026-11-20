import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SKY_LOOK, SKY_RADIUS, VALLEY_FAR, buildSky } from './sky';
import { PLANT_SATURATION } from './scenery';
import { WORLD_R } from './layout';

describe('the haze and the reach of the valley (WORLD-10: the far plan goes into the colour of the sky)', () => {
  it('the haze ends past the hill round the valley and before the camera stops seeing', () => {
    const [m0, m1] = SKY_LOOK.fogFar;
    expect(SKY_LOOK.fogNear).toBeGreaterThan(40);
    expect(m0).toBeGreaterThan(WORLD_R * 1.5);
    expect(m1).toBeGreaterThanOrEqual(m0);
    // what the far plane cuts is already all haze: no edge of the ground against the sky
    expect(VALLEY_FAR).toBeGreaterThan(m1);
  });

  it('the sky below the horizon is the haze\'s own colour, whatever the magic makes of it', () => {
    const scene = new THREE.Scene();
    const { sky, fog } = buildSky(scene);
    const mat = sky.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uFog.value).toBe(fog.color);
    expect(mat.fragmentShader).toMatch(/mix\(uFog, c, smoothstep\(0\.0, [\d.]+, vDir\.y\)\)/);
    expect(scene.fog).toBe(fog);
    expect(fog.near).toBe(SKY_LOOK.fogNear);
  });

  it('the sky goes round any camera that draws it and, made small, stays inside its reach', () => {
    const scene = new THREE.Scene();
    const { sky } = buildSky(scene);
    const cam = new THREE.PerspectiveCamera(55, 1, 0.3, VALLEY_FAR);
    cam.position.set(30, 12, -40);
    sky.scale.setScalar((VALLEY_FAR * 0.8) / SKY_RADIUS);
    sky.onBeforeRender(null as never, scene, cam, null as never, null as never, null as never);
    expect(sky.position.toArray()).toEqual([30, 12, -40]);
    expect(sky.matrixWorld.elements[12]).toBe(30);
    expect(SKY_RADIUS * sky.scale.x).toBeLessThan(VALLEY_FAR);
    expect(sky.frustumCulled).toBe(false);
  });

  it('the purple-leaved plant keeps less than half its colour', () => {
    expect(PLANT_SATURATION).toBeGreaterThan(0);
    expect(PLANT_SATURATION).toBeLessThan(0.5);
  });
});
