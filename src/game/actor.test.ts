/**
 * The shadow of a model from its body only (./actor.ts, docs/perf.md): the small parts of a model stop casting a shadow
 * - each of them is a draw call of the shadow pass -, the big ones and the biggest one always keep it.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Actor, shadowFromBody } from './actor';

/** A part of `tris` triangles (unindexed), casting a shadow. */
const part = (name: string, tris: number) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(tris * 9), 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
  m.name = name; m.castShadow = true;
  return m;
};

describe('shadowFromBody', () => {
  it('keeps the shadow of the parts of 15 % of the triangles or more, drops it for the eyes and the hooves', () => {
    const root = new THREE.Group();
    const body = part('body', 800), mane = part('mane', 150), eyes = part('eyes', 20), hooves = part('hooves', 30);
    const hidden = part('a part that casts none', 500); hidden.castShadow = false;
    root.add(body, mane, eyes, hooves, hidden);
    shadowFromBody(root);
    expect([body, mane, eyes, hooves, hidden].map((m) => m.castShadow)).toEqual([true, true, false, false, false]);
  });

  it('the biggest part casts even when no part reaches the share', () => {
    const root = new THREE.Group();
    const parts = [part('a', 100), part('b', 100), part('c', 110), part('d', 100), part('e', 100), part('f', 100), part('g', 100), part('h', 100)];
    root.add(...parts);
    shadowFromBody(root);
    expect(parts.filter((m) => m.castShadow).map((m) => m.name)).toEqual(['c']);
  });
});

/** Her turn to where she walks (`Actor.face`, by 1 - e^(-k dt)): after the same game time the same heading at 20 and 144 frames a second. */
describe('Actor.face', () => {
  const turned = (dt: number, seconds: number) => {
    const a = { heading: 0, root: new THREE.Object3D() };
    for (let i = 0, n = Math.round(seconds / dt); i < n; i++) Actor.prototype.face.call(a as unknown as Actor, 2.5, dt);
    return a.heading;
  };
  it('turns the same way whatever the frames', () => {
    const slow = turned(1 / 20, 0.25), fast = turned(1 / 144, 0.25);
    expect(fast).toBeGreaterThan(1);   // it did turn, and not all the way yet
    expect(fast).toBeLessThan(2.45);
    expect(Math.abs(slow - fast)).toBeLessThan(0.002);
  });
});
