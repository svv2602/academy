// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FAIRY_FLYOVER } from '../worlds/fairy/flyover-path';
import { strings } from '../worlds/fairy/strings';
import type { Game } from './context';
import { BACK_SECONDS, POINTS, SECONDS, createFlyover, ease, easeInv, pathProblems, setTour, tour, type FlyoverPath } from './flyover';

// The controls the tour hides, in the page before src/ui/ui.ts looks them up at import.
vi.hoisted(() => { for (const id of ['joy', 'btnJump', 'btnAct']) document.body.appendChild(document.createElement('div')).id = id; });

/** Runs the player for `seconds` of game time in frames of `dt`. */
const run = (f: ReturnType<typeof createFlyover>, seconds: number, dt = 0.05) => { for (let t = 0; t < seconds - 1e-9; t += dt) f.update(dt); };
const path: FlyoverPath = FAIRY_FLYOVER;

describe('the tour of a world (WORLD-11)', () => {
  it('the first world has a path of 5-8 points lasting 10-15 s and one spoken line of the cat in both languages', () => {
    expect(pathProblems(path)).toEqual([]);
    expect(path.points.length).toBeGreaterThanOrEqual(POINTS.min);
    expect(path.points.length).toBeLessThanOrEqual(POINTS.max);
    expect(path.seconds).toBeGreaterThanOrEqual(SECONDS.min);
    expect(path.seconds).toBeLessThanOrEqual(SECONDS.max);
    expect(path.line).toBe('tour');
    expect(strings.table.uk.tour).toBeTruthy();
    expect(strings.table.ru.tour).toBeTruthy();
    expect(strings.spoken.tour).toBeTruthy();
  });

  it('a path of the wrong size or length is reported', () => {
    const p = path.points[0];
    expect(pathProblems({ ...path, points: [p, p, p, p] })).toHaveLength(1);
    expect(pathProblems({ ...path, points: Array(9).fill(p) })).toHaveLength(1);
    expect(pathProblems({ ...path, seconds: 9 })).toHaveLength(1);
    expect(pathProblems({ ...path, seconds: 16 })).toHaveLength(1);
  });

  it('speeds up and slows down: the ease and its inverse meet at the ends', () => {
    for (const u of [0, 0.1, 0.5, 0.9, 1]) expect(easeInv(ease(u))).toBeCloseTo(u, 6);
    expect(ease(0.05)).toBeLessThan(0.05);
    expect(ease(0.95)).toBeGreaterThan(0.95);
  });

  it('flies the whole path in its seconds of game time and passes every point at its moment', async () => {
    const f = createFlyover(path);
    expect(f.times[0]).toBeCloseTo(0, 9);
    expect(f.times[f.times.length - 1]).toBeCloseTo(path.seconds, 6);
    let how: string | null = null;
    void f.start().then((h) => { how = h; });
    expect(f.active).toBe(true);
    expect(f.weight()).toBe(1);
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    run(f, path.seconds - 0.5);
    await Promise.resolve();
    expect(f.active).toBe(true);
    expect(how).toBeNull();
    for (const [i, p] of path.points.entries()) {
      f.hold(i); f.pose(pos, look);
      expect(pos.distanceTo(new THREE.Vector3(...p.pos))).toBeLessThan(1e-6);
      expect(look.distanceTo(new THREE.Vector3(...p.look))).toBeLessThan(1e-6);
      f.update(1);                                   // held: the game time does not move it
      expect(f.elapsed).toBeCloseTo(f.times[i], 6);
    }
    f.hold(null);
    run(f, 0.6);
    await Promise.resolve();
    expect(f.active).toBe(false);
    expect(how).toBe('end');
    // the camera comes back to the heroine within BACK_SECONDS
    expect(f.weight()).toBeGreaterThan(0);
    run(f, BACK_SECONDS);
    expect(f.weight()).toBe(0);
  });

  it('a tap ends it at once, and it can be played again (the debug command)', async () => {
    const f = createFlyover(path);
    const ended = f.start();
    expect(await f.start()).toBe('busy');
    run(f, 2);
    f.skip();
    expect(f.active).toBe(false);
    expect(await ended).toBe('skip');
    const again = f.start();
    expect(f.active).toBe(true);
    expect(f.elapsed).toBe(0);
    f.skip();
    expect(await again).toBe('skip');
  });
});

describe('the tour on an entry (src/game/start.ts plays it)', () => {
  /** A game with what the tour touches: its flags, the speech, a world that is visited when `visited` says so. */
  const game = (visited: () => boolean, p: FlyoverPath = path) => {
    const flags: Record<string, boolean> = {};
    const said: string[] = [];
    const g = {
      busy: false, auto: null, ws: { flags },
      speech: { line: vi.fn((k: string) => { said.push(k); return Promise.resolve(); }), caption: vi.fn() },
    } as unknown as Game;
    const player = setTour(g, { path: p, visited: () => flags.toured === true || visited(), mark: () => { flags.toured = true; } });
    return { g, flags, said, player };
  };
  const tap = () => window.dispatchEvent(new Event('pointerdown'));

  it('a world not visited: the tour plays with the cat\'s line, the heroine stands, a tap ends it, the world is marked', async () => {
    const { g, flags, said, player } = game(() => false);
    const played = tour(g);
    expect(player.active).toBe(true);
    expect(g.busy).toBe(true);
    expect(said).toEqual(['tour']);
    expect(flags.toured).toBe(true);
    expect(document.body.classList.contains('touring')).toBe(true);   // the line at the bottom (style.css)
    tap();
    expect(await played).toBe(true);
    expect(player.active).toBe(false);
    expect(g.busy).toBe(false);
    expect(document.body.classList.contains('touring')).toBe(false);
    // the next entry: no tour
    expect(await tour(g)).toBe(false);
    expect(player.active).toBe(false);
  });

  it('a world visited (an old save played before): no tour, but the mark it never had (the world\'s description reads it)', async () => {
    const { g, flags, said, player } = game(() => true);
    expect(await tour(g)).toBe(false);
    expect(player.active).toBe(false);
    expect(g.busy).toBe(false);
    expect(said).toEqual([]);
    expect(flags.toured).toBe(true);
  });

  it('the debug command plays a visited world\'s tour and marks nothing', async () => {
    const { g, flags, player } = game(() => true);
    const played = tour(g, { record: false });
    expect(player.active).toBe(true);
    player.skip();
    expect(await played).toBe(true);
    expect(flags.toured).toBeUndefined();
  });

  it('a silent tour (no line recorded yet: the grey build of the hub) flies with nothing said, and a tap ends it', async () => {
    const { g, said, player } = game(() => false, { ...path, line: null });
    const played = tour(g);
    expect(player.active).toBe(true);
    expect(said).toEqual([]);
    run(player, path.seconds + 0.1);
    expect(await played).toBe(true);
    expect(g.busy).toBe(false);
    expect(g.speech.caption).not.toHaveBeenCalled();
  });

  it('flown to its end without a tap, it ends by itself and gives the heroine back', async () => {
    const { g, player } = game(() => false);
    const played = tour(g);
    run(player, path.seconds + 0.1);
    expect(await played).toBe(true);
    expect(g.busy).toBe(false);
  });
});
