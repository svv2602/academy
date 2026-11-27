/** The secrets of the forest (PLAY-10, ./secrets.ts): their places, the trampoline and the roof, the song of the fireflies. */
import { afterEach, describe, expect, it } from 'vitest';
import { GRAVITY } from '../../core/tuning';
import { CAVE, FAIRY_RING, HALF, LANDMARKS, ROOTS, SECRET_CLEARINGS, SONG_TREE, STREAM_HALF, ZONES, inMaze } from './layout';
import { FIND_R, ROOTLET_PART, ROOTS_CAM, ROOTS_CAM_IN, ROOTS_CAM_OUT, ROOTS_R, rootletSwing, rootsCamDist, rootsLumps, rootsOf, rootsTree } from './roots';
import { placeTrees, villageHouses, HOUSE_STEM_TOP } from './scenery';
import {
  CAVE_CAM, CAVE_CAM_IN, CAVE_CAM_OUT, caveCamDist, FOREST_SECRETS, OVER_ROOF, ROOF_R, SPRING, TRAMPOLINE, caveRocks, type Song, restSong, roofHeight, showSeconds, singingAt, startSong, touchSong, trampolineOf,
} from './secrets';
import { bounce, colliders, height, pathDist, resolve, streamDist, support, tops } from './terrain';

afterEach(() => { tops.length = 0; colliders.length = 0; });

describe('the places of the secrets', () => {
  it('six, named as the flags the book, the Tree\'s keepsakes and the achievement read', () => {
    expect([...FOREST_SECRETS]).toEqual(['cave', 'bounce', 'fireflies', 'ring', 'roots', 'hollow']);
  });

  it('off the paths, out of the zones and the maze, inside the map; the cave by the stream, not in it', () => {
    for (const p of [CAVE, SONG_TREE, FAIRY_RING, ROOTS]) {
      expect(pathDist(p.x, p.z)).toBeGreaterThan(8);
      expect(Object.values(ZONES).every((z) => Math.hypot(z.x - p.x, z.z - p.z) > 12)).toBe(true);
      expect(inMaze(p.x, p.z, 3)).toBe(false);
      expect(Math.hypot(p.x, p.z)).toBeLessThan(HALF - 8);
    }
    expect(streamDist(CAVE.x, CAVE.z)).toBeLessThan(10);
    for (const k of caveRocks()) expect(streamDist(k.x, k.z)).toBeGreaterThan(STREAM_HALF + k.r * 0.6);
    expect(streamDist(SONG_TREE.x, SONG_TREE.z)).toBeGreaterThan(STREAM_HALF + 3);
    expect(streamDist(FAIRY_RING.x, FAIRY_RING.z)).toBeGreaterThan(STREAM_HALF + 3);
    expect(streamDist(ROOTS.x, ROOTS.z)).toBeGreaterThan(STREAM_HALF + 3);
  });

  it('no tree of the forest grows in a secret\'s clearing; every other tree stands where it stood', () => {
    const { trees } = placeTrees();
    for (const c of SECRET_CLEARINGS) expect(trees.every((t) => Math.hypot(t.x - c.x, t.z - c.z) > c.clear)).toBe(true);
    // the clearings only take trees out: the forest keeps nearly all of them
    expect(trees.length).toBeGreaterThan(100);
  });
});

describe('the camera in the cave', () => {
  it('close inside, the usual one from outside it, a smooth step between: no jump as she walks in', () => {
    expect(caveCamDist(0, 5.8)).toBe(CAVE_CAM);
    expect(caveCamDist(CAVE_CAM_IN, 5.8)).toBe(CAVE_CAM);
    expect(caveCamDist(CAVE_CAM_OUT, 5.8)).toBeCloseTo(5.8, 10);
    let last = caveCamDist(0, 5.8);
    for (let d = 0; d <= CAVE_CAM_OUT; d += 0.05) { const v = caveCamDist(d, 5.8); expect(v - last).toBeLessThan(0.12); expect(v).toBeGreaterThanOrEqual(last); last = v; }
  });
});

describe('the trampoline and the roof of the house beside it', () => {
  it('the trampoline stands clear of every house\'s cap and of the paths', () => {
    const { house, at } = trampolineOf();
    expect(Math.hypot(at.x - house.x, at.z - house.z)).toBeCloseTo(TRAMPOLINE.out, 6);
    for (const h of villageHouses()) expect(Math.hypot(at.x - h.x, at.z - h.z)).toBeGreaterThan(1.2 * 1.95 + TRAMPOLINE.r);
    expect(pathDist(at.x, at.z)).toBeGreaterThan(1.5);
  });

  it('the roof: the top of the dome over the house, lower towards its edge, above the stem\'s top where she stands', () => {
    expect(roofHeight(0)).toBeCloseTo(3.6, 6);
    expect(roofHeight(ROOF_R)).toBeLessThan(roofHeight(0));
    expect(roofHeight(ROOF_R)).toBeGreaterThan(HOUSE_STEM_TOP);
  });

  it('a landing on its cap throws her OVER_ROOF over the roof; her own jump (1.2 m) gets her onto the cap', () => {
    const apex = TRAMPOLINE.top + (SPRING * SPRING) / (2 * GRAVITY);
    expect(apex).toBeCloseTo(roofHeight(0) + OVER_ROOF, 6);
    expect(TRAMPOLINE.top).toBeLessThan(1.2);
  });

  it('the ground: the cap and the roof are tops to stand on, the cap springs; the house holds her out only below its roof', () => {
    const { house, at } = trampolineOf();
    const gy = height(house.x, house.z), ty = height(at.x, at.z);
    tops.push({ x: house.x, z: house.z, r: ROOF_R, top: (d) => gy + roofHeight(d), from: 0.6 });
    tops.push({ x: at.x, z: at.z, r: TRAMPOLINE.r, top: () => ty + TRAMPOLINE.top, from: 0.9, spring: SPRING });
    // from the ground under the roof she does not get onto it; from above she stands on it
    expect(support(house.x, house.z, gy)).toBeNull();
    expect(support(house.x, house.z, gy + 4)).toBeCloseTo(gy + 3.6, 6);
    // the cap from a jump
    expect(support(at.x, at.z, ty + 0.2)).toBeCloseTo(ty + TRAMPOLINE.top, 6);
    expect(bounce(at.x, at.z)).toBe(SPRING);
    expect(bounce(house.x, house.z)).toBeNull();
    colliders.push({ x: house.x, z: house.z, r: 1.4, top: gy + HOUSE_STEM_TOP });
    const low = { x: house.x + 0.5, z: house.z, y: gy };
    resolve(low, 0.4);
    expect(Math.hypot(low.x - house.x, low.z - house.z)).toBeCloseTo(1.8, 6);
    const high = { x: house.x + 0.5, z: house.z, y: gy + 3.4 };
    resolve(high, 0.4);
    expect(high.x).toBe(house.x + 0.5);
  });
});

describe('the song of the fireflies: touched in the order they sang it', () => {
  const rng = (seq: number[]) => { let i = 0; return () => seq[i++ % seq.length]; };

  it('they sing their order one by one, each its turn, with a pause between', () => {
    const s = startSong(rng([0.1, 0.9]));
    expect([...s.order].sort()).toEqual([0, 1, 2]);
    expect(s.phase).toBe('show');
    expect(singingAt(s, 0.1)).toBe(s.order[0]);
    expect(singingAt(s, 0.65)).toBeNull();
    expect(singingAt(s, 0.9)).toBe(s.order[1]);
    expect(singingAt(s, showSeconds(s) + 0.1)).toBeNull();
  });

  it('the right three in a row: the tune; a wrong touch: their order again, from the start, nothing lost', () => {
    let s: Song = { ...startSong(() => 0.5), phase: 'wait' };
    const [a, b, c] = s.order;
    s = touchSong(s, a); expect(s.got).toBe(1);
    const wrong = touchSong(s, a);
    expect(wrong.phase).toBe('show'); expect(wrong.got).toBe(0); expect(wrong.order).toEqual(s.order);
    s = { ...wrong, phase: 'wait' };
    s = touchSong(touchSong(touchSong(s, a), b), c);
    expect(s.phase).toBe('tune');
    // not waiting for her (showing, at rest): a touch does nothing
    expect(touchSong(restSong(), 0)).toEqual(restSong());
    const showing = startSong(() => 0.5);
    expect(touchSong(showing, showing.order[0])).toBe(showing);
  });
});

describe('the cave under the roots (./roots.ts)', () => {
  it('between the maze and the grove, clear of the other secrets and the landmarks; its fallen tree off the paths too', () => {
    const toMaze = Math.hypot(ZONES.maze.x - ROOTS.x, ZONES.maze.z - ROOTS.z), toGrove = Math.hypot(ZONES.grove.x - ROOTS.x, ZONES.grove.z - ROOTS.z);
    const between = Math.hypot(ZONES.maze.x - ZONES.grove.x, ZONES.maze.z - ZONES.grove.z);
    expect(Math.max(toMaze, toGrove)).toBeLessThan(between);
    for (const c of [CAVE, SONG_TREE, FAIRY_RING]) expect(Math.hypot(c.x - ROOTS.x, c.z - ROOTS.z)).toBeGreaterThan(c.clear + ROOTS.clear);
    for (const l of Object.values(LANDMARKS)) expect(Math.hypot(l.x - ROOTS.x, l.z - ROOTS.z)).toBeGreaterThan(ROOTS.clear + 4);
    const t = rootsTree();
    // the fallen tree lies on the back of the mound, away from the opening
    expect(Math.hypot(t.trunk.x - ROOTS.x, t.trunk.z - ROOTS.z)).toBeLessThan(ROOTS_R + 1.5);
    expect(Math.sin(ROOTS.face) * (t.trunk.x - ROOTS.x) + Math.cos(ROOTS.face) * (t.trunk.z - ROOTS.z)).toBeLessThan(-ROOTS_R + 0.5);
    for (const p of [t.trunk, t.plate, ...rootsLumps()]) expect(pathDist(p.x, p.z)).toBeGreaterThan(4);
  });

  it('its opening turned to the way between the maze and the grove; the stone at its back, inside the mound', () => {
    const { opening, stone } = rootsOf();
    const mid = { x: (ZONES.maze.x + ZONES.grove.x) / 2, z: (ZONES.maze.z + ZONES.grove.z) / 2 };
    expect(Math.hypot(opening.x - mid.x, opening.z - mid.z)).toBeLessThan(Math.hypot(ROOTS.x - mid.x, ROOTS.z - mid.z) - ROOTS_R + 0.01);
    const lumps = rootsLumps(), inner = Math.min(...lumps.map((k) => Math.hypot(k.x - ROOTS.x, k.z - ROOTS.z) - k.r * 0.9));
    expect(Math.hypot(stone.x - ROOTS.x, stone.z - ROOTS.z)).toBeLessThan(inner);
    expect((stone.x - ROOTS.x) * (opening.x - ROOTS.x) + (stone.z - ROOTS.z) * (opening.z - ROOTS.z)).toBeLessThan(0);
  });

  it('she walks in by the opening and finds the stone; from behind and the sides the mound holds her out', () => {
    for (const k of rootsLumps()) colliders.push({ x: k.x, z: k.z, r: k.r * 0.9 });
    const { opening, stone } = rootsOf();
    const walk = (from: { x: number; z: number }, to: { x: number; z: number }) => {
      const p = { ...from };
      for (let i = 0; i < 400; i++) {
        const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.05) break;
        const s = Math.min(0.1, d); p.x += (dx / d) * s; p.z += (dz / d) * s;
        resolve(p, 0.4);
      }
      return p;
    };
    const out = { x: opening.x + (opening.x - ROOTS.x) * 1.5, z: opening.z + (opening.z - ROOTS.z) * 1.5 };
    const got = walk(out, stone);
    expect(Math.hypot(got.x - stone.x, got.z - stone.z)).toBeLessThan(FIND_R);
    for (const a of [Math.PI, Math.PI / 2, -Math.PI / 2, 2.3, -2.3]) {
      const h = ROOTS.face + a, from = { x: ROOTS.x + Math.sin(h) * (ROOTS_R + 3), z: ROOTS.z + Math.cos(h) * (ROOTS_R + 3) };
      const p = walk(from, stone);
      expect(Math.hypot(p.x - stone.x, p.z - stone.z)).toBeGreaterThan(FIND_R);
    }
  });

  it('its camera comes close smoothly as she goes in, the usual one outside; a rootlet swings aside only near her', () => {
    expect(rootsCamDist(0, 5.8)).toBe(ROOTS_CAM);
    expect(rootsCamDist(ROOTS_CAM_IN, 5.8)).toBe(ROOTS_CAM);
    expect(rootsCamDist(ROOTS_CAM_OUT, 5.8)).toBeCloseTo(5.8, 10);
    let last = ROOTS_CAM;
    for (let d = 0; d <= ROOTS_CAM_OUT; d += 0.05) { const v = rootsCamDist(d, 5.8); expect(v - last).toBeLessThan(0.12); expect(v).toBeGreaterThanOrEqual(last); last = v; }
    expect(rootletSwing(ROOTLET_PART)).toBe(0);
    expect(rootletSwing(ROOTLET_PART + 1)).toBe(0);
    expect(rootletSwing(0)).toBeGreaterThan(rootletSwing(ROOTLET_PART / 2));
    expect(rootletSwing(ROOTLET_PART / 2)).toBeGreaterThan(0);
  });
});
