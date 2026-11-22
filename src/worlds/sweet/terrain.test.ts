import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BRIDGE, HALF, RIVER_HALF, ZONES } from './layout';
import { RIVER_DEPTH, buildGround, colliders, groundColor, height, resolve, riverColliders, riverDist } from './terrain';

/** The ground of the Sweet Land (./terrain.ts): the river's bed and the bridge over it, the cream rim, the edge. */
describe('the ground of the Sweet Land, the grey build', () => {
  it('the river lies in a shallow bed of chocolate, the bridge level with the banks over it', () => {
    const across = { x: Math.sin(BRIDGE.yaw), z: Math.cos(BRIDGE.yaw) }, along = { x: across.z, z: -across.x };
    // a few metres along the river from the bridge: its middle is lower than its banks
    const mid = { x: BRIDGE.x + along.x * 8, z: BRIDGE.z + along.z * 8 };
    expect(riverDist(mid.x, mid.z)).toBeLessThan(0.01);
    const bank = height(mid.x + across.x * (RIVER_HALF + 3), mid.z + across.z * (RIVER_HALF + 3));
    expect(bank - height(mid.x, mid.z)).toBeGreaterThan(RIVER_DEPTH * 0.5);
    // the deck over the river is no lower than the banks either side
    const deck = height(BRIDGE.x, BRIDGE.z), near = height(BRIDGE.x - across.x * (BRIDGE.len / 2 + 1), BRIDGE.z - across.z * (BRIDGE.len / 2 + 1));
    expect(Math.abs(deck - near)).toBeLessThan(0.6);
    const c = new THREE.Color();
    expect(groundColor(mid.x, mid.z, c).getHexString()).not.toBe(groundColor(BRIDGE.x, BRIDGE.z, new THREE.Color()).getHexString());
  });

  it('the river\'s colliders run along its whole line but at the bridge', () => {
    const all = riverColliders(0), open = riverColliders();
    const gap = all.filter((c) => !open.some((o) => o.x === c.x && o.z === c.z));
    expect(gap.length).toBeGreaterThan(0);
    for (const c of gap) expect(Math.hypot(c.x - BRIDGE.x, c.z - BRIDGE.z)).toBeLessThan(BRIDGE.w / 2 + RIVER_HALF);
    for (const c of open) expect(c.r).toBe(RIVER_HALF);
  });

  it('she cannot leave: the edge keeps her inside HALF, the cream hills rise past it', () => {
    colliders.length = 0;
    const p = { x: HALF * 2, z: 0 };
    resolve(p, 0.35);
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(HALF);
    expect(height(HALF + 25, 0) - height(ZONES.square.x, ZONES.square.z)).toBeGreaterThan(8);
  });

  it('is one mesh, coloured by its vertices', () => {
    const g = buildGround(8);
    expect(g.name).toBe('sweet-ground');
    expect(g.geometry.getAttribute('color')).toBeTruthy();
    expect(g.children).toHaveLength(0);
  });
});
