// @vitest-environment happy-dom
/**
 * The hedgehog's maze as the step of its chain (./maze.ts, WORLD-14): walked through, it changes no skill (the
 * customer's decision 2026-11-18) and ends the step; its middle is kept in the world's progress and walking in by the
 * way in brings her to the last fork passed; a wrong way says the cat's "try again"; after 40 s without a fork passed
 * the sparkles lead to the right way; the walkthrough's moves go through it with a mistake and a way out in the middle.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, worldState } from '../../core/save';
import { createRng } from '../../core/rng';

vi.mock('../../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: vi.fn() }));

const { addStrings } = await import('../../ui/strings');
addStrings((await import('./strings')).strings, false);
const { createMaze, MAZE, STUCK } = await import('./maze');
const { EDGE, HALF, MAZE_IN, inMaze } = await import('./layout');
const { tuning } = await import('../../core/tuning');
const { colliders } = await import('./terrain');
const { keptOf } = await import('../../game/worldtasks/kept');

function host(level: number) {
  const save = defaultSave();
  save.skills.pattern.level = level;
  const wrong = vi.fn(async () => {});
  const g = {
    scene: new THREE.Scene(), save, ws: worldState(save, 'forest'), groundY: () => 0, rng: createRng('maze'),
    hero: { root: new THREE.Object3D() }, sparks: { burst: vi.fn() }, busy: false,
    speech: { caption: vi.fn(), shown: null, line: vi.fn(() => Promise.resolve()) }, hooksFor: () => ({ wrong }), persist: vi.fn(),
  };
  g.hero.root.position.set(MAZE_IN.x + 3, 0, MAZE_IN.z);
  return { g, wrong };
}
const KOLYUCHKA = { def: { id: 'kolyuchka', emoji: '🦔' } };
/** Frames with her where she is, `n` of them. */
const frames = (m: ReturnType<typeof createMaze>, n = 2) => { for (let i = 0; i < n; i++) m.update(0.1, i * 0.1, true); };

describe("the hedgehog's maze (WORLD-14)", () => {
  it('the walkthrough goes through it with a mistake and a way out in the middle; no skill changes; the step is done once', () => {
    const { g, wrong } = host(5), m = createMaze(g as never), done = vi.fn();
    const skills = JSON.stringify(g.save.skills);
    m.start!(KOLYUCHKA as never, done);
    expect(m.active!()).toBe(true);
    expect(m.spec.forks).toHaveLength(6);
    const passed: number[] = [];
    let resumed = false;
    for (let i = 0; i < 100 && m.active!(); i++) {
      const was = m.walk.passed, outside = !inMaze(g.hero.root.position.x, g.hero.root.position.z);
      expect(m.cheat()).toBe(true);
      frames(m);
      // walked in by the way in with forks passed: she is at the last of them
      if (outside && m.walk.passed > 0 && inMaze(g.hero.root.position.x, g.hero.root.position.z)) {
        const at = m.walk.resumeAt(), hp = g.hero.root.position;
        expect(Math.hypot(hp.x - at.x, hp.z - at.z)).toBeLessThan(0.01);
        resumed = true;
      }
      if (m.walk.passed > was) passed.push(m.walk.passed);
    }
    expect(m.active!()).toBe(false);
    expect(passed).toEqual([1, 2, 3, 4, 5, 6]);
    expect(resumed).toBe(true);
    expect(m.walk.wrongs).toBe(1);
    // the way out in the middle and back in: Kolyuchka keeps the place and says so, then welcomes her back
    const said = (g.speech.line as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);
    expect(said.filter((k) => k === 'kolyuchka_maze_exit')).toHaveLength(1);
    expect(said.filter((k) => k === 'kolyuchka_maze_resume')).toHaveLength(1);
    expect(wrong).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(g.save.skills)).toBe(skills);              // the maze goes to no skill
    expect(keptOf(g.ws, MAZE)).toEqual([]);                            // its middle goes with it
    expect(m.cheat()).toBe(false);
  });

  it('keeps its middle: the same maze stands next time, and the way in brings her to the last fork passed', () => {
    const { g } = host(3), m = createMaze(g as never);
    m.start!(KOLYUCHKA as never, vi.fn());
    for (let i = 0; i < 40 && m.walk.passed < 2; i++) { m.cheat(); frames(m); }
    expect(m.walk.passed).toBe(2);
    const kept = keptOf(g.ws, MAZE), spec = JSON.stringify(m.spec);
    expect(kept[0]).toBe(2);
    m.dispose();
    // the world entered again: the same maze, two forks passed; the talk goes on with it
    const again = createMaze(g as never);
    expect(JSON.stringify(again.spec)).toBe(spec);
    again.start!(KOLYUCHKA as never, vi.fn());
    expect(again.walk.passed).toBe(2);
    g.hero.root.position.set(MAZE_IN.x + 3, 0, MAZE_IN.z); frames(again, 1);
    const first = again.geo.trunk[1];
    g.hero.root.position.set(first.x, 0, first.z); frames(again, 1);
    const at = again.geo.forks[1].after, hp = g.hero.root.position;
    expect([hp.x, hp.z]).toEqual([at.x, at.z]);
  });

  it('after 40 s without a fork passed the sparkles lead to the right way; none before, none once it is done', () => {
    const { g } = host(1), m = createMaze(g as never);
    m.start!(KOLYUCHKA as never, vi.fn());
    m.update(STUCK - 1, 0, true);
    expect(m.goal()).toBeNull();
    m.update(2, 0, true);
    const goal = m.goal()!, right = m.geo.forks[0].ways.find((w) => w.right)!.line[1];
    expect([goal.x, goal.z]).toEqual([right.x, right.z]);
  });

  it('every path of it lies inside the walkable map, on every level', () => {
    for (const level of [1, 3, 5]) {
      const { g } = host(level), m = createMaze(g as never);
      m.start!(KOLYUCHKA as never, vi.fn());
      for (const line of [m.geo.trunk, ...m.geo.forks.flatMap((f) => f.ways.map((w) => w.line))]) {
        for (const p of line) expect(Math.hypot(p.x, p.z)).toBeLessThan(HALF - EDGE - 0.4);
      }
      m.dispose();
    }
  });

  // WORLD-14 asks 40-90 s with the forks; the lanes are as long as the map's edge lets them (the lead's decision
  // 2026-11-20: a run of some 33 s, the forks make the rest)
  it('the trunk is long enough: 34 s at her top speed at the least', () => {
    const { g } = host(5), m = createMaze(g as never);
    const len = m.geo.trunk.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - m.geo.trunk[i].x, p.z - m.geo.trunk[i].z), 0);
    expect(len / tuning.speed).toBeGreaterThanOrEqual(34);
    m.dispose();
  });

  it('its hedge is in the colliders while it stands, and out once it is gone', () => {
    const before = colliders.length;
    const { g } = host(2), m = createMaze(g as never);
    expect(colliders.length - before).toBe(m.geo.walls.length);
    expect(m.geo.walls.length).toBeLessThan(m.geo.bushes.length);
    m.dispose();
    expect(colliders.length).toBe(before);
    expect(g.scene.children).toHaveLength(0);
  });
});
