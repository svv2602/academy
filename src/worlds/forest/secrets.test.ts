/** The secrets of the forest (PLAY-10, ./secrets.ts): their places, the trampoline and the roof, the song of the fireflies. */
import { afterEach, describe, expect, it } from 'vitest';
import { GRAVITY } from '../../core/tuning';
import { CAVE, FAIRY_RING, HALF, SECRET_CLEARINGS, SONG_TREE, STREAM_HALF, ZONES, inMaze } from './layout';
import { placeTrees, villageHouses, HOUSE_STEM_TOP } from './scenery';
import {
  FOREST_SECRETS, OVER_ROOF, ROOF_R, SPRING, TRAMPOLINE, caveRocks, type Song, restSong, roofHeight, showSeconds, singingAt, startSong, touchSong, trampolineOf,
} from './secrets';
import { bounce, colliders, height, pathDist, resolve, streamDist, support, tops } from './terrain';

afterEach(() => { tops.length = 0; colliders.length = 0; });

describe('the places of the secrets', () => {
  it('four, named as the flags the book, the Tree\'s keepsakes and the achievement read', () => {
    expect([...FOREST_SECRETS]).toEqual(['cave', 'bounce', 'fireflies', 'ring']);
  });

  it('off the paths, out of the zones and the maze, inside the map; the cave by the stream, not in it', () => {
    for (const p of [CAVE, SONG_TREE, FAIRY_RING]) {
      expect(pathDist(p.x, p.z)).toBeGreaterThan(8);
      expect(Object.values(ZONES).every((z) => Math.hypot(z.x - p.x, z.z - p.z) > 12)).toBe(true);
      expect(inMaze(p.x, p.z, 3)).toBe(false);
      expect(Math.hypot(p.x, p.z)).toBeLessThan(HALF - 8);
    }
    expect(streamDist(CAVE.x, CAVE.z)).toBeLessThan(10);
    for (const k of caveRocks()) expect(streamDist(k.x, k.z)).toBeGreaterThan(STREAM_HALF + k.r * 0.6);
    expect(streamDist(SONG_TREE.x, SONG_TREE.z)).toBeGreaterThan(STREAM_HALF + 3);
    expect(streamDist(FAIRY_RING.x, FAIRY_RING.z)).toBeGreaterThan(STREAM_HALF + 3);
  });

  it('no tree of the forest grows in a secret\'s clearing; every other tree stands where it stood', () => {
    const { trees } = placeTrees();
    for (const c of SECRET_CLEARINGS) expect(trees.every((t) => Math.hypot(t.x - c.x, t.z - c.z) > c.clear)).toBe(true);
    // the clearings only take trees out: the forest keeps nearly all of them
    expect(trees.length).toBeGreaterThan(100);
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
