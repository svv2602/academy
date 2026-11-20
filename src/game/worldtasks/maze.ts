/**
 * "The maze of paths" played in the world (WORLD-14, the hedgehog's maze): paths between hedges with 3-6 forks; she
 * walks herself (a tap or the stick), and at every fork the way to take is the one that goes on with the pattern of
 * the stones before it. A wrong way is a short loop round a bush that brings her back to the same fork (nothing passed
 * is lost); after two wrong ways at one fork the right one glows a little. She may walk out at any time; coming in
 * again brings her to the last fork passed.
 *
 * The pattern reads without reading and without colours alone: each element of it is a colour and a shape at once (a
 * round red stone, a square blue one ...), two different elements never share a shape - a child who does not tell the
 * colours apart, or a screen in the sun, still sees it.
 *
 * Here, for any world: the description (by the level of "Patterns", only read: the maze goes to no skill - the
 * customer's decision 2026-11-18, docs/worlds/common.md), the paths laid in a frame of lanes (`layMaze`), the judge of
 * her walking (`mazeWalk`: which way she took at the fork, its middle kept and resumed as a list of numbers) and the
 * show (`showMaze`). The world makes it a step of its chain.
 */
import * as THREE from 'three';
import { fadeAtCamera } from '../../core/materials';
import { randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { UNITS } from '../tasks/pattern';

/** How many forks and ways at each by the level of "Patterns" (3-6 forks, WORLD-14; three ways from level 3). */
export const MAZE_BY_LEVEL: Readonly<Record<number, { forks: number; ways: number }>> = {
  1: { forks: 3, ways: 2 }, 2: { forks: 4, ways: 2 }, 3: { forks: 4, ways: 3 }, 4: { forks: 5, ways: 3 }, 5: { forks: 6, ways: 3 },
};
export const mazeLevel = (level: number) => Math.min(5, Math.max(1, Math.round(level)));

/** The elements a pattern is laid of: a colour and a shape each, no shape twice (the outline of a flat stone). */
export const LOOKS: readonly { color: string; shape: 'round' | 'square' | 'triangle' | 'hexagon' | 'diamond' }[] = [
  { color: '#e0473c', shape: 'round' },
  { color: '#3b7be0', shape: 'square' },
  { color: '#f0c22a', shape: 'triangle' },
  { color: '#3cbf58', shape: 'hexagon' },
  { color: '#a24fd6', shape: 'diamond' },
];

export interface MazeFork {
  /** The stones before the fork, the farthest first: indices of LOOKS, two whole units and a start of the third. */
  row: number[];
  /** The first stone of each way, in the order of the ways round the fork: indices of LOOKS. */
  ways: number[];
  /** Which of `ways` goes on with the pattern. */
  answer: number;
}
export interface MazeSpec { level: number; forks: MazeFork[] }

/**
 * The forks of a maze for `level`: each its own unit of the panel's "pattern" (UNITS of its first three levels - the
 * growing groups and the two features of levels 4 and 5 are no row of stones) and its own looks; the other ways start
 * with other elements of the row (short of them, another look), never the right one twice.
 */
export function generateMaze(level: number, rng: Rng): MazeSpec {
  const by = MAZE_BY_LEVEL[mazeLevel(level)];
  const units = UNITS(Math.min(3, mazeLevel(level)));
  const forks = Array.from({ length: by.forks }, (): MazeFork => {
    const unit = units[randInt(0, units.length - 1, rng)];
    const looks = shuffle(LOOKS.map((_, i) => i), rng);
    const of = (letter: string) => looks[letter.charCodeAt(0) - 65];
    const len = unit.length * 2 + randInt(1, unit.length - 1, rng);
    const row = Array.from({ length: len }, (_, i) => of(unit[i % unit.length]));
    const right = of(unit[len % unit.length]);
    const inRow = [...new Set(row)].filter((x) => x !== right);
    const others = [...inRow, ...looks.filter((x) => x !== right && !inRow.includes(x))].slice(0, by.ways - 1);
    const ways = shuffle([right, ...others], rng);
    return { row, ways, answer: ways.indexOf(right) };
  });
  return { level: mazeLevel(level), forks };
}

export interface Place { x: number; z: number }

/**
 * The frame the maze is laid in: LANES lanes side by side, walked in turn as a snake. `origin` is where the first lane
 * begins (the way in is just outside it), `along` the way the first lane runs, `across` toward the next lanes (unit
 * vectors on the ground); `lengths` - of each lane (two lanes joined at their far end are as long: the map's edge
 * may leave room for longer lanes on one side), `gap` - between two lanes.
 */
export interface MazeFrame { origin: Place; along: Place; across: Place; lengths: readonly number[]; gap: number }
/** Lanes of a maze: always six, a fork on some of them - the walk is as long on every level (40-60 s, WORLD-14). */
export const LANES = 6;

export interface MazeWay {
  /** The way as a line of points from its fork; the right one runs on to the lane after the fork. */
  line: Place[];
  right: boolean;
  /** Where its first stone lies (the element it starts with). */
  stone: Place;
}
export interface MazeGeo {
  /** The way in (just outside the hedge); the end of the last lane (walked to, the maze is done); the way out past it. */
  start: Place;
  end: Place;
  out: Place;
  /** The paths she walks: the trunk from the way in through every right way to the way out. */
  trunk: Place[];
  forks: { at: Place; ways: MazeWay[]; row: Place[]; lane: number; after: Place }[];
  /** The bush in the middle of every wrong loop. */
  islands: Place[];
  /** The bushes of the hedge: everywhere in the frame but on the paths. */
  bushes: Place[];
  /** Those of them she can reach from a path, the colliders of the hedge (the others stand deep in it). */
  walls: Place[];
}

/** m: the stones of a row lie this far apart. */
export const STONE_STEP = 0.8;
/** m: from the middle of a path to the first bush; a bush stands this far from the next (a hedge she cannot pass). */
export const CLEAR = 1.25, BUSH_STEP = 0.8;
/**
 * m: a bush is a collider of BUSH_R, she one of 0.4: no bush nearer than BLOCK to another leaves room to pass between;
 * a bush that seals a narrow band between two paths stands SEAL from them (she still passes: SEAL > BUSH_R + 0.4).
 */
export const BUSH_R = 0.45, BLOCK = 0.85, SEAL = 1.0;
/** m: walking this far from its fork along a way takes the way. */
export const TAKE = 2.0;
const MOUTH = 3.3;          // m: the right way's first leg
const JOG = 2.8;            // m: then on beside the lane, before it comes back to the lane
const LOOP = 4.2;           // m: how far a wrong loop reaches from its fork
const RING = 1.05;          // m: a wrong loop goes round its bush this far from it (she passes: > BUSH_R + 0.4)
/** m: the hedge beside the outer lanes (a loop reaches this far, and a bush more). */
export const SIDE = 5;
const FAN: Readonly<Record<number, readonly number[]>> = { 2: [0.55, -0.55], 3: [0.75, 0, -0.75] };   // rad off the lane

/** Which lanes have a fork when there are `n` of them: spread over the six. */
export const forkLanes = (n: number) => Array.from({ length: n }, (_, k) => Math.floor(((k + 0.5) * LANES) / n));

/** The distance from (x, z) to a line of points. */
export function lineDist(line: readonly Place[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

/**
 * The paths of `spec` in `frame`. The trunk snakes through the six lanes; a fork lies in the middle of its lane - a
 * lane walked forward has its ways ahead of the middle, one walked back behind it, so the forks of two lanes side by
 * side never meet. At a fork the ways fan out ahead: the right one leaves on its own side and comes back to the lane
 * further on, a wrong one is a loop round a bush back to the fork. The row of the pattern lies on the lane before it.
 */
export function layMaze(spec: MazeSpec, frame: MazeFrame): MazeGeo {
  const { origin: o, along: a, across: c, lengths, gap } = frame, L = Math.max(...lengths);
  const P = (u: number, v: number): Place => ({ x: o.x + a.x * v + c.x * u, z: o.z + a.z * v + c.z * u });
  const lanes = forkLanes(spec.forks.length);
  const trunk: Place[] = [P(0, -2.5)];
  const forks: MazeGeo['forks'] = [];
  const islands: Place[] = [];
  const lines: Place[][] = [];
  for (let i = 0; i < LANES; i++) {
    const dir = i % 2 === 0 ? 1 : -1, u = i * gap, len = lengths[i], [v0, v1] = dir > 0 ? [0, len] : [len, 0];
    trunk.push(P(u, v0));
    const k = lanes.indexOf(i);
    if (k >= 0) {
      const f = spec.forks[k], vf = len / 2;
      // her way along the lane is `dir`, her left `dir` times +across turned: angles are counted from her way, + left
      const Q = (ang: number, d: number, side = 0) => P(u + (Math.sin(ang) * d + Math.cos(ang) * side) * dir, vf + (Math.cos(ang) * d - Math.sin(ang) * side) * dir);
      const fork = P(u, vf);
      const row = f.row.map((_, j) => P(u, vf - dir * STONE_STEP * (f.row.length - j + 0.6)));
      const fan = FAN[f.ways.length] ?? FAN[3];
      let after = fork;
      const ways = f.ways.map((_, w): MazeWay => {
        const ang = fan[w], stone = Q(ang, 1.4);
        if (w === f.answer) {
          const mouth = Q(ang, MOUTH), lat = Math.sin(ang) * MOUTH, ahead = Math.cos(ang) * MOUTH;
          const beside = P(u + lat * dir, vf + (ahead + JOG) * dir), back = P(u, vf + (ahead + JOG + Math.abs(lat) * 1.1 + 0.5) * dir);
          after = back;
          return { right: true, stone, line: [fork, mouth, beside, back] };
        }
        // a wrong one: in, round its bush (a circle of RING, out to LOOP) and back out to the fork
        const c = LOOP - RING, ring = Array.from({ length: 9 }, (_, j) => {
          const phi = (Math.PI - 0.7) * (1 - (2 * j) / 8);           // from behind on her left, over the tip, to behind on her right
          return Q(ang, c + Math.cos(phi) * RING, Math.sin(phi) * RING);
        });
        islands.push(Q(ang, c));
        const into = Q(ang, c - RING - 0.6);
        return { right: false, stone, line: [fork, into, ...ring, into, fork] };
      });
      trunk.push(fork, ...ways[f.answer].line.slice(1));
      for (const w of ways) if (!w.right) lines.push(w.line);
      forks.push({ at: fork, ways, row, lane: i, after });
    }
    trunk.push(P(u, v1));
  }
  trunk.push(P((LANES - 1) * gap, LANES % 2 === 0 ? -2.5 : lengths[LANES - 1] + 2.5));
  lines.push(trunk);
  // the hedge: a bush wherever the frame is clear of every path, and in the middle of every loop
  const bushes: Place[] = [...islands];
  // no farther along than the lanes beside it reach (a short lane leaves no hedge past its end), and its end wall: the
  // row clear of the path and the one behind it
  const reach = (u: number) => Math.max(...lengths.filter((_, i) => Math.abs(u - i * gap) < gap)) + CLEAR + BUSH_STEP + 0.1;
  // (beside the outer lanes as wide as a loop reaches: their forks fan out over the edge of the frame)
  // (counted in whole steps: a sum of steps misses the last row by a rounding)
  const nv = Math.ceil((L + 2.4) / BUSH_STEP), nu = Math.ceil(((LANES - 1) * gap + 2 * SIDE) / BUSH_STEP);
  for (let iv = 0; iv <= nv; iv++) {
    for (let iu = 0; iu <= nu; iu++) {
      const u = -SIDE + iu * BUSH_STEP, v = -1.2 + iv * BUSH_STEP;
      if (v > reach(u)) continue;
      const p = P(u, v);
      if (lines.every((l) => lineDist(l, p.x, p.z) >= CLEAR) && islands.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 0.6)) bushes.push(p);
    }
  }
  // where two paths pass closer than two clear widths the grid may leave no bush between them: a finer look seals
  // it with bushes a little nearer the paths (SEAL), wherever no bush stands within BLOCK yet
  const cell = (x: number, z: number) => `${Math.floor(x)},${Math.floor(z)}`, cells = new Map<string, Place[]>();
  const add = (b: Place) => { const k = cell(b.x, b.z); (cells.get(k) ?? cells.set(k, []).get(k)!).push(b); };
  for (const b of bushes) add(b);
  const near = (p: Place) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const b of cells.get(cell(p.x + dx, p.z + dz)) ?? []) if (Math.hypot(b.x - p.x, b.z - p.z) < BLOCK) return true;
    }
    return false;
  };
  for (let iv = 0; iv <= nv * 2; iv++) {
    for (let iu = 0; iu <= nu * 2; iu++) {
      const u = -SIDE + iu * BUSH_STEP / 2, v = -1.2 + iv * BUSH_STEP / 2;
      if (v > reach(u)) continue;
      const p = P(u, v);
      if (!near(p) && lines.every((l) => lineDist(l, p.x, p.z) >= SEAL) && islands.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 0.6)) { bushes.push(p); add(p); }
    }
  }
  // the bushes she can touch from a path: the colliders of the hedge (the rest stand deep in it, never reached)
  const walls = bushes.filter((b) => lines.some((l) => lineDist(l, b.x, b.z) < CLEAR + 1.3));
  return { start: trunk[0], end: trunk[trunk.length - 2], out: trunk[trunk.length - 1], trunk, forks, islands, bushes, walls };
}

/** What a step of her walking did: took the right way at the fork, a wrong one, or came to the end of the last lane. */
export type MazeStep = 'right' | 'wrong' | 'end' | null;

export interface MazeWalk {
  /** Forks passed so far; all of them passed and the way out walked - done. */
  readonly passed: number;
  readonly done: boolean;
  /** Wrong ways taken at the fork she stands before. */
  readonly wrongsHere: number;
  /** Wrong ways in all. */
  readonly wrongs: number;
  /** The right way of the fork she stands before glows (two wrong ways taken at it). */
  readonly glow: boolean;
  /** Where she is now: `step` judges the move. */
  step(x: number, z: number): MazeStep;
  /** Where she goes on from on coming in again: just after the last fork passed (the way in if none). */
  resumeAt(): Place;
}

/**
 * The judge of her walking through `geo`: she comes to the fork ahead, then walking TAKE m along a way takes it - the
 * right way passes the fork, a wrong one is one mistake (walked round, it brings her back to the fork, and the next way
 * she takes is judged anew). A way walked into from its far end (the maze walked back from its way out) is no choice:
 * a way counts only from the fork. `passed` starts where a kept middle says (a number of forks).
 */
export function mazeWalk(geo: MazeGeo, passed = 0): MazeWalk {
  let at = Math.max(0, Math.min(geo.forks.length, Math.floor(passed))), done = false, wrongs = 0, here = 0;
  let atFork = false;
  return {
    get passed() { return at; },
    get done() { return done; },
    get wrongsHere() { return here; },
    get wrongs() { return wrongs; },
    get glow() { return !done && at < geo.forks.length && here >= 2; },
    step(x, z) {
      if (done) return null;
      const f = geo.forks[at];
      if (!f) {
        if (Math.hypot(geo.end.x - x, geo.end.z - z) < 1.6) { done = true; return 'end'; }
        return null;
      }
      const d = Math.hypot(f.at.x - x, f.at.z - z);
      if (d < 1.0) { atFork = true; return null; }
      if (d < TAKE || !atFork) return null;
      // the way she is on: the nearest within the width of a path, from its fork out
      let best = -1, bd = CLEAR;
      f.ways.forEach((w, i) => { const dd = lineDist(w.line, x, z); if (dd < bd) { bd = dd; best = i; } });
      if (best < 0 || Math.hypot(f.at.x - x, f.at.z - z) > LOOP + 1.5) return null;
      atFork = false;
      if (f.ways[best].right) { at++; here = 0; return 'right'; }
      here++; wrongs++;
      return 'wrong';
    },
    resumeAt: () => (at > 0 ? geo.forks[at - 1].after : geo.start),
  };
}

// ---------------------------------------------------------------- the show

export interface MazeShow {
  readonly group: THREE.Group;
  /** A frame: the glow of the right way at the fork ahead pulses (`glowAt`: that fork, or -1 for none). */
  update(time: number, glowAt: number): void;
  dispose(): void;
}

/** The outline of a flat stone of `shape`, on the ground (a prism 10 cm high, 0.85 m across: read from behind her). */
function stoneGeo(shape: (typeof LOOKS)[number]['shape']): THREE.BufferGeometry {
  const sides = { round: 18, square: 4, triangle: 3, hexagon: 6, diamond: 4 }[shape];
  const g = new THREE.CylinderGeometry(0.42, 0.45, 0.1, sides).translate(0, 0.05, 0);
  if (shape === 'square') g.rotateY(Math.PI / 4);
  if (shape === 'diamond') g.scale(0.72, 1, 1.25);
  return g;
}

/**
 * The maze in the scene: the hedge (one instanced mesh, dissolving at the lens and between the camera and her -
 * fadeAtCamera - and casting no shadow), the stones of the paths (grey ones every few steps, those of the rows and of
 * the ways' starts in their looks: one instanced mesh per look) and the glow of the right way at every fork.
 */
export function showMaze(scene: THREE.Scene, spec: MazeSpec, geo: MazeGeo, groundY: (x: number, z: number) => number): MazeShow {
  const group = new THREE.Group();
  group.name = 'maze';
  const owned: { dispose(): void }[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const put = (mesh: THREE.InstancedMesh, i: number, p: Place, s: number, rot = 0, lift = 0) => {
    q.setFromAxisAngle(up, rot);
    mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, groundY(p.x, p.z) + lift, p.z), q, new THREE.Vector3(s, s, s)));
  };
  // the hedge
  // low (0.85 m): the camera behind her sees the floor of the path and the stones of the row over it, and the way out
  const bushGeo = new THREE.IcosahedronGeometry(0.62, 0).scale(1, 0.75, 1).translate(0, 0.38, 0);
  const bushMat = new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 0.9, flatShading: true });
  bushMat.onBeforeCompile = (sh) => fadeAtCamera(sh);
  const hedge = new THREE.InstancedMesh(bushGeo, bushMat, geo.bushes.length);
  hedge.name = 'maze-hedge';
  geo.bushes.forEach((p, i) => put(hedge, i, p, 0.9 + ((i * 37) % 7) * 0.04, i * 1.7));
  hedge.castShadow = false; hedge.receiveShadow = true;
  hedge.computeBoundingSphere();
  group.add(hedge);
  owned.push(bushGeo, bushMat);
  // the grey stones of the trunk, one every 1.6 m but where a row lies
  const grey: Place[] = [];
  const rows = geo.forks.flatMap((f) => f.row);
  for (let i = 0; i < geo.trunk.length - 1; i++) {
    const a = geo.trunk[i], b = geo.trunk[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let s = 0.8; s < len; s += 1.6) {
      const p = { x: a.x + ((b.x - a.x) * s) / len, z: a.z + ((b.z - a.z) * s) / len };
      if (rows.every((r) => Math.hypot(r.x - p.x, r.z - p.z) > 0.8) && geo.forks.every((f) => Math.hypot(f.at.x - p.x, f.at.z - p.z) > 2.2)) grey.push(p);
    }
  }
  const greyGeo = new THREE.DodecahedronGeometry(0.22, 0).scale(1, 0.4, 1);
  const greyMat = new THREE.MeshStandardMaterial({ color: '#9b958a', roughness: 0.9 });
  const greys = new THREE.InstancedMesh(greyGeo, greyMat, Math.max(1, grey.length));
  greys.name = 'maze-path';
  grey.forEach((p, i) => put(greys, i, p, 1, i));
  greys.count = grey.length; greys.receiveShadow = true;
  greys.computeBoundingSphere();
  group.add(greys);
  owned.push(greyGeo, greyMat);
  // the looks: the rows and the first stone of every way
  const byLook = LOOKS.map(() => [] as { p: Place; way?: { fork: number; right: boolean } }[]);
  geo.forks.forEach((f, k) => {
    spec.forks[k].row.forEach((look, j) => byLook[look].push({ p: f.row[j] }));
    spec.forks[k].ways.forEach((look, w) => byLook[look].push({ p: f.ways[w].stone, way: { fork: k, right: f.ways[w].right } }));
  });
  LOOKS.forEach((look, i) => {
    if (!byLook[i].length) return;
    const g = stoneGeo(look.shape), mat = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.55 });
    const mesh = new THREE.InstancedMesh(g, mat, byLook[i].length);
    mesh.name = `maze-${look.shape}`;
    byLook[i].forEach((s, j) => put(mesh, j, s.p, s.way ? 1.25 : 1, 0, 0.01));
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    owned.push(g, mat);
  });
  // the glow of the right way at every fork, shown for the fork ahead after two wrong ways: discs along its first leg,
  // a ring round its first stone and a pillar of light over it, seen over the hedge - all of one plain bright material
  // (no glow of q2 needed: it reads at q0 and in the sun), pulsing
  const glowMat = new THREE.MeshBasicMaterial({ color: '#fff36b', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const discGeo = new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(0.62, 0.85, 24).rotateX(-Math.PI / 2);
  const pillarGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.6, 12, 1, true).translate(0, 1.3, 0);
  owned.push(glowMat, discGeo, ringGeo, pillarGeo);
  const glows = geo.forks.map((f) => {
    const w = f.ways.find((x) => x.right)!, gg = new THREE.Group();
    const [p0, p1] = w.line;
    for (let k = 1; k <= 4; k++) {
      const t = k / 4, x = p0.x + (p1.x - p0.x) * t, z = p0.z + (p1.z - p0.z) * t;
      const m = new THREE.Mesh(discGeo, glowMat);
      m.position.set(x, groundY(x, z) + 0.12, z);
      gg.add(m);
    }
    for (const g of [ringGeo, pillarGeo]) {
      const m = new THREE.Mesh(g, glowMat);
      m.position.set(w.stone.x, groundY(w.stone.x, w.stone.z) + 0.13, w.stone.z);
      gg.add(m);
    }
    gg.visible = false;
    group.add(gg);
    return gg;
  });
  scene.add(group);
  return {
    group,
    update(time, glowAt) {
      glows.forEach((g, k) => { g.visible = k === glowAt; });
      const beat = 0.5 + 0.5 * Math.sin(time * 4);
      glowMat.opacity = glowAt >= 0 ? 0.55 + 0.4 * beat : 0;
      if (glowAt >= 0) for (const m of glows[glowAt].children) if (m instanceof THREE.Mesh && m.geometry !== pillarGeo) m.scale.setScalar(1 + 0.2 * beat);
    },
    dispose() { scene.remove(group); for (const o of owned) o.dispose(); },
  };
}
