/**
 * The cat beside the heroine (./companion.ts): it walks or runs to her side and stands there. A scene that begins while
 * it walks (a talk) holds its clips - but one that gives it none must not leave it running on the spot once it is there.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Game } from './context';
import { createCompanion } from './companion';

/** A stand-in cat: where it is, the clip it plays, its turns. */
function cat() {
  let clip = '';
  return { root: new THREE.Object3D(), get playing() { return clip; }, play(name: string) { clip = name; }, face() {} };
}
function game(busy = false) {
  const hero = { root: new THREE.Object3D(), heading: 0 };
  const c = cat();
  c.root.position.set(8, 0, 0);      // far from her: it runs
  const g = { hero, cat: c, busy, camTask: null, groundY: () => 0, world: {} };
  return { g, c, follow: createCompanion(g as unknown as Game) };
}
const frames = (f: { update(dt: number): void }, n: number) => { for (let i = 0; i < n; i++) f.update(1 / 60); };

describe('the cat beside the heroine', () => {
  it('runs to her side and stands there', () => {
    const { c, follow } = game();
    frames(follow, 1);
    expect(['Run', 'Walk']).toContain(c.playing);
    frames(follow, 600);
    expect(c.playing).toBe('Idle');
  });

  it('a talk begins while it runs: once at her side it stands, not runs on the spot', () => {
    const { g, c, follow } = game();
    frames(follow, 10);
    expect(['Run', 'Walk']).toContain(c.playing);
    g.busy = true;                    // the talk: a scene holds the cat's clips, and gives it none
    frames(follow, 600);
    expect(c.root.position.length()).toBeLessThan(1.6);   // at her side (1.08 m off her) within the 0.45 m it stops at
    expect(c.playing).toBe('Idle');
  });

  it('a scene that gives the cat a clip of its own keeps it: the follow takes nothing from a scene', () => {
    const { g, c, follow } = game();
    frames(follow, 10);
    g.busy = true;
    c.play('Yes');                    // the scene's clip (src/game/context.ts: the cat says yes)
    frames(follow, 600);
    expect(c.playing).toBe('Yes');
  });
});
