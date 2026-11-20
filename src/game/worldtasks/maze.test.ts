/**
 * "The maze of paths" (./maze.ts, WORLD-14): the description on every level (one way goes on with the pattern, the looks
 * tell apart by shape alone), the paths (one way through, every wrong way a loop back to its fork, the hedge closed: no
 * way round a fork across the grass) and the judge of her walking (the right way passes a fork, a wrong one is one
 * mistake per walk into it, two at a fork light the right way, a kept middle goes on from its fork).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import {
  CLEAR, LANES, SEAL, LOOKS, MAZE_BY_LEVEL, TAKE, generateMaze, layMaze, lineDist, mazeWalk, showMaze,
  type MazeFrame, type MazeGeo, type MazeSpec, type Place,
} from './maze';

const FRAME: MazeFrame = { origin: { x: -41, z: 22 }, along: { x: -1, z: 0 }, across: { x: 0, z: -1 }, length: 20, gap: 6 };
const specs = (level: number, n = 30): MazeSpec[] => Array.from({ length: n }, (_, i) => generateMaze(level, createRng(`maze-test:${level}:${i}`)));

/** The period of a row: the shortest p that repeats it. */
const period = (row: readonly number[]) => [1, 2, 3, 4].find((p) => row.every((x, i) => i < p || x === row[i - p]))!;

describe('the description by the level of "Patterns"', () => {
  it('has 3-6 forks, two ways from level 1 and three from level 3', () => {
    for (const level of [1, 2, 3, 4, 5]) {
      for (const s of specs(level)) {
        expect(s.forks).toHaveLength(MAZE_BY_LEVEL[level].forks);
        for (const f of s.forks) expect(f.ways).toHaveLength(MAZE_BY_LEVEL[level].ways);
      }
    }
    expect(Object.values(MAZE_BY_LEVEL).map((b) => b.forks)).toEqual([3, 4, 4, 5, 6]);
  });

  it('at every fork exactly one way goes on with the pattern of the row, the ways all different', () => {
    for (const level of [1, 2, 3, 4, 5]) {
      for (const s of specs(level)) {
        for (const f of s.forks) {
          const p = period(f.row);
          expect(p).toBeGreaterThanOrEqual(2);
          expect(f.row.length).toBeGreaterThan(p * 2);                 // two whole units and the start of a third
          const next = f.row[f.row.length - p];
          expect(f.ways[f.answer]).toBe(next);
          expect(f.ways.filter((w) => w === next)).toHaveLength(1);
          expect(new Set(f.ways).size).toBe(f.ways.length);
        }
      }
    }
  });

  it('reads by shape alone: two different elements never share a shape (nor a colour)', () => {
    expect(new Set(LOOKS.map((l) => l.shape)).size).toBe(LOOKS.length);
    expect(new Set(LOOKS.map((l) => l.color)).size).toBe(LOOKS.length);
    for (const s of specs(5)) for (const f of s.forks) for (const x of [...f.row, ...f.ways]) expect(LOOKS[x]).toBeDefined();
  });

  it('is the same for the same seed: a kept middle meets its own maze again', () => {
    expect(generateMaze(4, createRng('a'))).toEqual(generateMaze(4, createRng('a')));
  });
});

/** Is (x, z) free for her (radius 0.4) among the bushes (colliders of 0.45)? */
function freeAt(geo: MazeGeo, x: number, z: number): boolean {
  return geo.bushes.every((b) => Math.hypot(b.x - x, b.z - z) >= 0.85);
}

/**
 * The cells of a 0.25 m grid she can walk to from the way in, inside the hedge (and one step out of it). Each with the
 * length along the trunk of the nearest path (a way counts at its fork): she can only go on from a cell to a cell near it.
 */
function reach(geo: MazeGeo, pad = 8) {
  const xs = geo.bushes.map((b) => b.x), zs = geo.bushes.map((b) => b.z);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, z0 = Math.min(...zs) - pad, z1 = Math.max(...zs) + pad;
  const step = 0.25, nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const inside = (x: number, z: number) => x >= Math.min(...xs) && x <= Math.max(...xs) && z >= Math.min(...zs) && z <= Math.max(...zs);
  const seen = new Uint8Array(nx * nz), cells: Place[] = [];
  const at = (p: Place) => [Math.round((p.x - x0) / step), Math.round((p.z - z0) / step)];
  const [sx, sz] = at(geo.trunk[1]);               // the first lane's start, just inside the way in
  const queue = [[sx, sz]];
  seen[sz * nx + sx] = 1;
  while (queue.length) {
    const [i, k] = queue.pop()!;
    const x = x0 + i * step, z = z0 + k * step;
    cells.push({ x, z });
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = k + dk;
      if (a < 0 || b < 0 || a >= nx || b >= nz || seen[b * nx + a]) continue;
      const px = x0 + a * step, pz = z0 + b * step;
      // only inside the frame of the hedge: outside it the maze is left (by the way in or out)
      if (!inside(px, pz) && !inside(x, z)) continue;
      if (!freeAt(geo, px, pz)) continue;
      seen[b * nx + a] = 1;
      queue.push([a, b]);
    }
  }
  return { cells, inside };
}

/** The length along the trunk of its point nearest to (x, z). */
function along(trunk: readonly Place[], x: number, z: number): number {
  let best = Infinity, at = 0, s = 0;
  for (let i = 0; i < trunk.length - 1; i++) {
    const a = trunk[i], b = trunk[i + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (len * len || 1)));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; at = s + t * len; }
    s += len;
  }
  return at;
}

describe('the paths in their frame', { timeout: 30000 }, () => {
  it('runs one trunk from the way in through every right way to the way out; every wrong way is a loop back to its fork', () => {
    for (const level of [1, 3, 5]) {
      for (const s of specs(level, 5)) {
        const geo = layMaze(s, FRAME);
        expect(geo.forks).toHaveLength(s.forks.length);
        expect(new Set(geo.forks.map((f) => f.lane)).size).toBe(s.forks.length);
        for (const [k, f] of geo.forks.entries()) {
          const right = f.ways.filter((w) => w.right);
          expect(right).toHaveLength(1);
          expect(f.ways.indexOf(right[0])).toBe(s.forks[k].answer);
          for (const p of right[0].line) expect(lineDist(geo.trunk, p.x, p.z)).toBeLessThan(1e-6);
          for (const w of f.ways.filter((x) => !x.right)) {
            expect(w.line[0]).toEqual(f.at);
            expect(w.line[w.line.length - 1]).toEqual(f.at);
            // its far part is off the trunk (a dead end of the hedge, not a way on)
            expect(Math.max(...w.line.map((p) => lineDist(geo.trunk, p.x, p.z)))).toBeGreaterThan(2 * SEAL);
          }
          // the row lies on the trunk just before its fork, in its lane
          for (const p of f.row) expect(lineDist(geo.trunk, p.x, p.z)).toBeLessThan(1e-6);
        }
        // the forks in the order she meets them along the trunk
        const order = geo.forks.map((f) => along(geo.trunk, f.at.x, f.at.z));
        expect([...order].sort((a, b) => a - b)).toEqual(order);
      }
    }
    expect(LANES).toBe(6);
  });

  it('leaves no bush on a path, nor so near it that she could not pass (but the bush in the middle of a loop)', () => {
    for (const s of [...specs(1, 3), ...specs(5, 3)]) {
      const geo = layMaze(s, FRAME);
      const isle = (p: Place) => geo.islands.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1e-6);
      for (const b of geo.bushes) if (!isle(b)) expect(lineDist(geo.trunk, b.x, b.z)).toBeGreaterThanOrEqual(SEAL - 1e-6);
    }
  });

  it('every path is wide enough for her, round the bush of a loop too', () => {
    for (const s of [...specs(1, 3), ...specs(5, 3)]) {
      const geo = layMaze(s, FRAME);
      for (const line of [geo.trunk, ...geo.forks.flatMap((f) => f.ways.map((w) => w.line))]) {
        for (const p of walk(line)) expect(freeAt(geo, p.x, p.z), `${p.x.toFixed(2)}, ${p.z.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('is closed: from the way in she walks every path to the way out and to every loop, and never across a hedge to a farther part', () => {
    for (const s of [specs(1, 1)[0], specs(3, 1)[0], specs(5, 1)[0], specs(5, 4)[3]]) {
      const geo = layMaze(s, FRAME);
      const { cells, inside } = reach(geo);
      const near = (p: Place) => cells.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 0.3);
      expect(near(geo.trunk[geo.trunk.length - 2])).toBe(true);     // the last lane's end, just inside the way out
      for (const f of geo.forks) for (const w of f.ways) expect(near(w.line[Math.floor(w.line.length / 2)])).toBe(true);
      // every cell inside the hedge lies on a path; going on from a cell to its neighbour never jumps along the trunk
      // (a jump would be a way round a fork, or a lane walked into from the next one)
      const wayOf = (c: Place) => geo.forks.find((f) => f.ways.some((w) => !w.right && lineDist(w.line, c.x, c.z) < CLEAR));
      const sOf = (c: Place) => { const f = wayOf(c); return along(geo.trunk, f ? f.at.x : c.x, f ? f.at.z : c.z); };
      const key = (c: Place) => `${Math.round(c.x * 4)},${Math.round(c.z * 4)}`;
      const s0 = new Map(cells.filter((c) => inside(c.x, c.z)).map((c) => [key(c), sOf(c)]));
      let jumps = 0;
      for (const c of cells) {
        if (!inside(c.x, c.z)) continue;
        const here = s0.get(key(c))!;
        for (const [dx, dz] of [[0.25, 0], [0, 0.25]]) {
          const n = s0.get(key({ x: c.x + dx, z: c.z + dz }));
          if (n !== undefined && Math.abs(n - here) > 6) jumps++;
        }
      }
      expect(jumps).toBe(0);
    }
  });
});

/** Her points along a line, every 0.3 m. */
function walk(line: readonly Place[]): Place[] {
  const out: Place[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0; d < len; d += 0.3) out.push({ x: a.x + ((b.x - a.x) * d) / len, z: a.z + ((b.z - a.z) * d) / len });
  }
  out.push(line[line.length - 1]);
  return out;
}

describe('the judge of her walking', () => {
  const s = generateMaze(5, createRng('walk')), geo = layMaze(s, FRAME);

  it('the trunk walked from the way in passes every fork in turn and ends at the way out, with no mistake', () => {
    const w = mazeWalk(geo), seen: string[] = [];
    for (const p of walk(geo.trunk)) { const r = w.step(p.x, p.z); if (r) seen.push(r); }
    expect(seen).toEqual([...s.forks.map(() => 'right'), 'end']);
    expect(w.done).toBe(true);
    expect(w.wrongs).toBe(0);
  });

  it('a wrong way is one mistake per walk into it; two at a fork light the right way; the right one passes it', () => {
    const w = mazeWalk(geo), f = geo.forks[0], wrong = f.ways.find((x) => !x.right)!;
    for (const p of walk(geo.trunk.slice(0, geo.trunk.findIndex((q) => q === f.at) + 1))) w.step(p.x, p.z);
    expect(w.passed).toBe(0);
    const loop = walk(wrong.line).map((p) => w.step(p.x, p.z)).filter(Boolean);
    expect(loop).toEqual(['wrong']);                    // round the loop and back: one mistake
    expect(w.glow).toBe(false);
    expect(walk(wrong.line).map((p) => w.step(p.x, p.z)).filter(Boolean)).toEqual(['wrong']);
    expect(w.wrongsHere).toBe(2);
    expect(w.glow).toBe(true);
    const right = f.ways.find((x) => x.right)!;
    expect(walk(right.line).map((p) => w.step(p.x, p.z)).filter(Boolean)).toEqual(['right']);
    expect(w.passed).toBe(1);
    expect(w.glow).toBe(false);
    expect(w.wrongs).toBe(2);
  });

  it('the maze walked back from its way out is no choice at any fork', () => {
    const w = mazeWalk(geo);
    const back = walk([...geo.trunk].reverse()).map((p) => w.step(p.x, p.z)).filter(Boolean);
    // back at the first fork from its right way she has come to it: only the row of the pattern is left behind her
    expect(back.filter((r) => r === 'right' || r === 'end')).toEqual([]);
    expect(w.passed).toBe(0);
  });

  it('takes a way only TAKE m from its fork: standing at the fork decides nothing', () => {
    const w = mazeWalk(geo), f = geo.forks[0];
    for (const way of f.ways) {
      const p = way.line[1], d = Math.hypot(p.x - f.at.x, p.z - f.at.z), k = (TAKE - 0.3) / d;
      expect(w.step(f.at.x + (p.x - f.at.x) * k, f.at.z + (p.z - f.at.z) * k)).toBeNull();
    }
  });

  it('a kept middle goes on from its fork: she comes back in just after the last fork passed', () => {
    const w = mazeWalk(geo, 2);
    expect(w.passed).toBe(2);
    expect(w.resumeAt()).toEqual(geo.forks[1].after);
    expect(mazeWalk(geo).resumeAt()).toEqual(geo.start);
    expect(mazeWalk(geo, 99).passed).toBe(geo.forks.length);
    // from there the rest of the trunk passes the forks left
    const from = geo.trunk.findIndex((q) => q === geo.forks[1].after);
    const seen = walk(geo.trunk.slice(from)).map((p) => w.step(p.x, p.z)).filter(Boolean);
    expect(seen).toEqual([...s.forks.slice(2).map(() => 'right'), 'end']);
  });
});

describe('the show', () => {
  it('draws the hedge in one instanced mesh that casts no shadow, a mesh per look, and leaves nothing once disposed', () => {
    const scene = new THREE.Scene(), s = generateMaze(3, createRng('show')), geo = layMaze(s, FRAME);
    const show = showMaze(scene, s, geo, () => 0);
    const hedge = scene.getObjectByName('maze-hedge') as THREE.InstancedMesh;
    expect(hedge.count).toBe(geo.bushes.length);
    expect(hedge.castShadow).toBe(false);
    const looks = new Set([...s.forks.flatMap((f) => [...f.row, ...f.ways])].map((i) => LOOKS[i].shape));
    for (const shape of looks) expect(scene.getObjectByName(`maze-${shape}`)).toBeDefined();
    show.update(0, 1);
    show.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
