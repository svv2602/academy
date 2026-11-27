// @vitest-environment happy-dom
/**
 * The fading of the cat's sparkles world by world (the customer's word of 2026-11-27, src/game/guide-rule.ts,
 * src/game/guide.ts): the fairies and the forest always; the sea after 30 s with no progress; the Sweet Land and the sky
 * after 60 s, a short flash towards the goal; a tap on the cat - the whole trail at once; the parent's choice over all.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GUIDE } from '../core/tuning';
import { guideOf, guideShows, guideState, progressOf } from './guide-rule';

vi.mock('./fx', () => ({ glowTex: null }));
vi.mock('../core/materials', () => ({ uTime: { value: 0 } }));

describe('the rule', () => {
  it('the fairies, the forest, the hub: the trail whenever there is a goal', () => {
    for (const w of ['fairy', 'forest', 'hub']) expect([guideOf(w).mode, guideShows(w, 0, false)]).toEqual(['trail', 'trail']);
  });
  it('the sea: nothing before 30 s with no progress, the trail from then on', () => {
    expect(guideShows('sea', 29.9, false)).toBeNull();
    expect(guideShows('sea', 30, false)).toBe('trail');
    expect(guideShows('sea', 300, false)).toBe('trail');
  });
  it('the Sweet Land and the sky: nothing before 60 s, then a short flash, again and again', () => {
    for (const w of ['sweet', 'sky']) {
      expect(guideShows(w, 59.9, false)).toBeNull();
      expect(guideShows(w, 60, false)).toBe('flash');
      expect(guideShows(w, 60 + GUIDE.flashS + 0.1, false)).toBeNull();
      expect(guideShows(w, 60 + GUIDE.flashEveryS + 0.1, false)).toBe('flash');
    }
  });
  it('a tap on the cat asked for the way: the trail at once, in every world', () => {
    for (const w of ['sea', 'sweet', 'sky']) expect(guideShows(w, 0, true)).toBe('trail');
  });
  it('the parent\'s choice: "always" - the trail everywhere; "asked" - only after a tap on the cat', () => {
    expect(guideShows('sky', 0, false, 'always')).toBe('trail');
    expect(guideShows('fairy', 999, false, 'asked')).toBeNull();
    expect(guideShows('sea', 999, true, 'asked')).toBe('trail');
  });
  it('progress: a task, a step of a chain, a find, a flag', () => {
    const save = { skills: { add: { level: 1, streak: 0, tasks: 2, first: 0, errors: 0 } } };
    const ws = { quests: { a: 1 }, flags: { x: true, y: false }, found: [3] };
    const n = progressOf(save, ws);
    expect(n).toBe(2 + 1 + 1 + 1);
    save.skills.add.tasks++; expect(progressOf(save, ws)).toBe(n + 1);
    ws.quests.a++; ws.found.push(4); ws.flags.y = true;
    expect(progressOf(save, ws)).toBe(n + 4);
  });
});

describe('the guide in a world', () => {
  const make = (world: string) => {
    const scene = new THREE.Scene(), hero = { root: new THREE.Object3D() };
    const g = { scene, hero, groundY: () => 0, world: { id: world }, save: { skills: {} } as { skills: object; hints?: string }, ws: { quests: {}, flags: {} as Record<string, boolean>, found: [] as number[] } };
    return { g, scene };
  };

  /** Plays `seconds` of frames of 0.1 s with a goal 10 m off; what the trail showed at the end. */
  const play = async (world: string) => {
    const { createGuide } = await import('./guide');
    const { g, scene } = make(world);
    const guide = createGuide(g as never);
    const trail = scene.children.find((c) => (c as THREE.Points).isPoints)!, beacon = scene.children.find((c) => (c as THREE.Mesh).isMesh)!;
    let t = 0;
    const run = (s: number, target: THREE.Vector3 | null = new THREE.Vector3(10, 0, 0)) => { for (const end = t + s; t < end - 1e-9; t += 0.1) guide.update(t, target); };
    return { g, run, trail, beacon };
  };

  it('the sea: hidden for 30 s of a goal with no progress, then shown; progress hides it again', async () => {
    const { g, run, trail } = await play('sea');
    run(29);
    expect(trail.visible).toBe(false);
    run(2);
    expect([trail.visible, guideState.show]).toEqual([true, 'trail']);
    g.ws.found.push(1);
    run(0.2);
    expect(trail.visible).toBe(false);
  });

  it('time with no goal (a scene, a task) is not counted', async () => {
    const { run, trail } = await play('sea');
    run(20); run(60, null); run(5);
    expect(trail.visible).toBe(false);
  });

  it('the sky: a flash, no beam, after 60 s', async () => {
    const { run, trail, beacon } = await play('sky');
    run(60.05);
    expect([trail.visible, beacon.visible, guideState.show]).toEqual([true, false, 'flash']);
    run(GUIDE.flashS + 0.2);
    expect(trail.visible).toBe(false);
  });

  it('a tap on the cat: the whole trail at once, for its time', async () => {
    const { run, trail, beacon } = await play('sky');
    run(1);
    guideState.ask();
    run(0.2);
    expect([trail.visible, beacon.visible, guideState.asked]).toEqual([true, true, true]);
    run(GUIDE.askedS);
    expect(trail.visible).toBe(false);
  });

  it('the parent\'s choice is read from the save: "only when asked" hides it in the fairies, "always" shows it in the sky', async () => {
    const fairy = await play('fairy');
    fairy.g.save.hints = 'asked';
    fairy.run(0.2);
    expect([fairy.trail.visible, guideState.choice]).toEqual([false, 'asked']);
    const sky = await play('sky');
    sky.g.save.hints = 'always';
    sky.run(0.2);
    expect([sky.trail.visible, sky.beacon.visible]).toEqual([true, true]);
  });

  it('the fairies: shown at once', async () => {
    const { run, trail } = await play('fairy');
    run(0.2);
    expect(trail.visible).toBe(true);
  });
});

describe('the wiring', () => {
  const src = (p: string) => (import.meta.glob(['./player.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[p];
  it('a tap on the cat asks for the way', () => {
    expect(src('./player.ts')).toContain("else if (to === 'cat') { catTap(g); guideState.ask(); }");
  });
});
