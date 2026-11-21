/**
 * The undergrowth of the forest (./undergrowth.ts): where it grows (off the paths, the stream, the zones' middles and
 * the maze), that it is drawn near her only and a cell at a time.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CELL, FLOWERS, PATH_CLEAR, PLANTS, RANGE, buildUndergrowth, placePlants, uBloom } from './undergrowth';
import { HALF, ZONES, inMaze } from './layout';
import { pathDist, streamDist } from './terrain';

describe('the undergrowth of the forest', () => {
  it('grows off the paths, the stream, the zones\' middles and the maze, of every kind, inside the map', () => {
    const plants = placePlants();
    expect(plants.length).toBeGreaterThan(500);
    for (const p of plants) {
      expect(pathDist(p.x, p.z)).toBeGreaterThanOrEqual(PATH_CLEAR);
      expect(streamDist(p.x, p.z)).toBeGreaterThanOrEqual(1.2);
      expect(inMaze(p.x, p.z, 1.5)).toBe(false);
      for (const z of Object.values(ZONES)) expect(Math.hypot(z.x - p.x, z.z - p.z)).toBeGreaterThanOrEqual(3.5);
      expect(Math.hypot(p.x, p.z)).toBeLessThan(HALF);
    }
    expect(new Set(plants.map((p) => p.k)).size).toBe(PLANTS.length);
    expect(placePlants()).toEqual(plants);              // the same forest every time
  });

  it('is one mesh a cell, drawn only near her', () => {
    const scene = new THREE.Scene(), geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geo.getAttribute('position').count * 3).fill(1), 3));
    const plants = [{ k: 0, x: 1, z: 1, s: 1, rot: 0 }, { k: 0, x: 3, z: 2, s: 1, rot: 0 }, { k: 0, x: 1 + CELL * 4, z: 1, s: 1, rot: 0 }];
    const u = buildUndergrowth(scene, PLANTS.map(() => geo), plants);
    expect(u.meshes).toHaveLength(2);                  // two plants in one cell, one in another
    u.near(2, 1.5);
    expect(u.meshes.map((m) => m.visible)).toEqual([true, false]);
    u.near(1 + CELL * 4, 1 - RANGE * 0.5);
    expect(u.meshes.map((m) => m.visible)).toEqual([false, true]);
    expect(u.meshes.every((m) => !m.castShadow)).toBe(true);
  });

  it('marks every vertex of a flower with its plant\'s foot: the magic opens the flowers in the shader, no draw added', () => {
    expect(PLANTS[FLOWERS][0]).toBe('plants/Flowers');
    const scene = new THREE.Scene(), geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geo.getAttribute('position').count * 3).fill(1), 3));
    const plants = [{ k: 0, x: 1, z: 1, s: 1, rot: 0 }, { k: FLOWERS, x: 3, z: 2, s: 1, rot: 0 }];
    const u = buildUndergrowth(scene, PLANTS.map(() => geo), plants);
    expect(u.meshes).toHaveLength(1);
    const a = u.meshes[0].geometry.getAttribute('aBloom'), n = geo.getAttribute('position').count;
    expect(a.itemSize).toBe(4);
    expect([a.getX(0), a.getZ(0), a.getW(0)]).toEqual([1, 1, 0]);           // the bush: not a flower
    expect([a.getX(n), a.getZ(n), a.getW(n)]).toEqual([3, 2, 1]);           // the flower, at its foot
    // the shader draws a flower uBloom of the way from its foot, after the wind's bend
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
    (u.meshes[0].material as THREE.Material).onBeforeCompile(sh, {} as THREE.WebGLRenderer);
    expect((sh.uniforms as Record<string, unknown>).uBloom).toBe(uBloom);
    expect(sh.vertexShader.indexOf('mix(1.0, uBloom, aBloom.w)')).toBeGreaterThan(sh.vertexShader.indexOf('transformed.x += gust'));
  });
});
