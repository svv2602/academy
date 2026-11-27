// @vitest-environment happy-dom
/**
 * The places of Pip's command in the forest (./en-places.ts, LEARN-23): in order by the rule of the task, on ground she
 * can walk to, away from the village; the big mushrooms themselves, and when they are drawn.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EN_GO_FAR, EN_GO_NEAR, EN_GO_REACH, enPlacesProblems, inRing, kindsAt } from '../../game/worldtasks/en-go';
import { COLLECT, DAILY_PLACES } from './collect';
import { BIG_MUSHROOM, BIG_MUSHROOMS, BIG_MUSHROOMS_SHADOW, BIG_MUSHROOMS_SHOW, BIG_MUSHROOM_WALL, EN_GIVEN, EN_PLACES, bigMushroomsAt } from './en-places';
import { ALTAR, ARRIVAL, EASEL, HALF, HOLLOW, LANDMARKS, MAZE_END, MAZE_IN, OWL_TREE, PATHS, SECRET_CLEARINGS, SPAWN, STREAM_HALF, ZONES, inMaze } from './layout';
import { placeTrees, villageHouses } from './scenery';
import { lineDist, pathDist, streamDist } from './terrain';
import { buildBigMushrooms, buildHouses } from './village';

const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const TRACKS = PATHS[PATHS.length - 1];
/** The residents stand in their zones; with them the things of the forest that have a place of their own. */
const BUSY = [...Object.values(ZONES).filter((z) => z !== ZONES.center), ...Object.values(LANDMARKS), MAZE_IN, MAZE_END, HOLLOW, ALTAR, OWL_TREE, EASEL, SPAWN, ARRIVAL, ...villageHouses()];

describe('the places of Pip\'s command in the forest', () => {
  it('are in order by the rule of the task: each 15-25 m from the middle of the central glade, clear of the residents', () => {
    expect(enPlacesProblems(EN_PLACES, EN_GIVEN, BUSY)).toEqual([]);
    expect(EN_PLACES.map((p) => Math.round(d(p, EN_GIVEN) * 10) / 10)).toEqual([19.1, 20.5, 17.3]);
    expect(EN_PLACES.every((p) => d(p, EN_GIVEN) >= EN_GO_NEAR && d(p, EN_GIVEN) <= EN_GO_FAR)).toBe(true);
    expect([EN_GIVEN.x, EN_GIVEN.z]).toEqual([ZONES.center.x, ZONES.center.z]);
  });

  it('the command that can be given there: the big mushroom - three of them to find, in three directions', () => {
    expect(kindsAt(EN_PLACES, EN_GIVEN)).toEqual(['mushroom']);
    expect(inRing(EN_PLACES, 'mushroom', EN_GIVEN)).toHaveLength(3);
    expect(EN_PLACES.map((p) => p.word)).toEqual(['mushroom', 'mushroom', 'mushroom']);
    const apart = BIG_MUSHROOMS.flatMap((a, i) => BIG_MUSHROOMS.slice(i + 1).map((b) => d(a, b)));
    expect(Math.min(...apart)).toBeGreaterThan(25);         // no two side by side: each is a walk of its own
  });

  it('they stand where she can walk to them: in the forest, a few steps off a path, clear of the stream, the zones, the secrets, the maze and the tracks', () => {
    const bad = BIG_MUSHROOMS.flatMap((p, i) => [
      Math.hypot(p.x, p.z) > HALF - 6 && 'beyond the forest',
      pathDist(p.x, p.z) < 3.5 && 'on a path',
      pathDist(p.x, p.z) > 12 && 'deep in the trees, far from any path',
      streamDist(p.x, p.z) < STREAM_HALF + 3 && 'in the stream',
      lineDist(TRACKS, p.x, p.z) < 5 && 'on the squirrel\'s tracks',
      Object.values(ZONES).some((z) => d(z, p) < 10) && 'in a zone',
      SECRET_CLEARINGS.some((c) => d(c, p) < c.clear + 4) && 'at a secret',
      inMaze(p.x, p.z, 4) && 'in the maze',
    ].filter(Boolean).map((w) => `mushroom ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('nothing else stands there: no trunk under the cap, no thing of the forest, no find', () => {
    const { trees } = placeTrees(), cap = BIG_MUSHROOM.r * 1.95;
    const bad = BIG_MUSHROOMS.flatMap((p, i) => [
      trees.some((t) => d(t, p) < cap + 1.2) && 'at a trunk',
      BUSY.some((b) => d(b, p) < 6) && 'at a thing of the forest',
      [...COLLECT.items, ...DAILY_PLACES].some((f) => d(f, p) < 6) && 'at a find',
    ].filter(Boolean).map((w) => `mushroom ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
    // she comes to it though its stem holds her off
    expect(BIG_MUSHROOM_WALL).toBeLessThan(EN_GO_REACH - 1.5);
    expect(BIG_MUSHROOM_WALL).toBeGreaterThan(BIG_MUSHROOM.r);
  });

  it('away from the village, whose frame is the closest to the budget of draw calls: never drawn there', () => {
    for (const p of BIG_MUSHROOMS) expect(d(p, ZONES.village)).toBeGreaterThan(45);
    for (const at of [ZONES.village, LANDMARKS.village, ZONES.owl, ZONES.maze, ZONES.grove, ZONES.ash, ZONES.oak, ...villageHouses()]) expect(bigMushroomsAt(at.x, at.z), `${at.x}, ${at.z}`).toEqual({ shown: false, shadow: false });
  });

  it('drawn at the glade, on the whole way to each and a little past it; their shadow only near one of them', () => {
    expect(bigMushroomsAt(EN_GIVEN.x, EN_GIVEN.z)).toEqual({ shown: true, shadow: false });
    expect(bigMushroomsAt(SPAWN.x, SPAWN.z).shown).toBe(true);
    expect(bigMushroomsAt(ARRIVAL.x, ARRIVAL.z).shown).toBe(true);
    for (const p of BIG_MUSHROOMS) {
      for (let t = 0; t <= 1.2001; t += 0.1) expect(bigMushroomsAt(EN_GIVEN.x + (p.x - EN_GIVEN.x) * t, EN_GIVEN.z + (p.z - EN_GIVEN.z) * t).shown, `${p.x}, ${p.z} at ${t.toFixed(1)}`).toBe(true);
      expect(bigMushroomsAt(p.x + 3, p.z)).toEqual({ shown: true, shadow: true });
      expect(bigMushroomsAt(p.x, p.z + BIG_MUSHROOMS_SHADOW - 0.1).shadow).toBe(true);
    }
    expect(bigMushroomsAt(EN_GIVEN.x + BIG_MUSHROOMS_SHOW, EN_GIVEN.z).shown).toBe(false);
    expect(bigMushroomsAt(EN_GIVEN.x + BIG_MUSHROOMS_SHOW - 0.1, EN_GIVEN.z).shown).toBe(true);
    // seen from the glade: each is nearer than the trees' own fog would hide, and within the radius they are drawn in
    expect(Math.max(...BIG_MUSHROOMS.map((p) => d(p, EN_GIVEN)))).toBeLessThan(BIG_MUSHROOMS_SHOW - 8);
  });
});

describe('the big mushrooms themselves (./village.ts)', () => {
  const puts = BIG_MUSHROOMS.map((p) => ({ x: p.x, y: 0.5, z: p.z, rot: p.rot }));
  const mesh = buildBigMushrooms(BIG_MUSHROOM.h, BIG_MUSHROOM.r, puts);

  it('one mesh for all of them, of the houses\' own material - one draw, no new program', () => {
    expect(mesh.isMesh).toBe(true);
    expect(mesh.name).toBe('big-mushrooms');
    const scene = new THREE.Scene();
    buildHouses(scene, [{ x: 0, y: 0, z: 0, rot: 0 }]);
    expect(mesh.material).toBe((scene.getObjectByName('house-walls') as THREE.Mesh).material);
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, true]);
  });

  it('each stands at its place on the ground, as tall as it is said to be, its cap wider than its stem; no door, no window', () => {
    const pos = mesh.geometry.getAttribute('position'), per = pos.count / puts.length;
    expect(Number.isInteger(per)).toBe(true);
    puts.forEach((p, i) => {
      const box = new THREE.Box3();
      for (let k = i * per; k < (i + 1) * per; k++) box.expandByPoint(new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)));
      expect((box.min.x + box.max.x) / 2).toBeCloseTo(p.x, 1);
      expect((box.min.z + box.max.z) / 2).toBeCloseTo(p.z, 1);
      expect(box.min.y).toBeCloseTo(p.y, 3);
      expect(box.max.y - box.min.y).toBeGreaterThan(BIG_MUSHROOM.h - 0.2);
      expect(box.max.y - box.min.y).toBeLessThan(BIG_MUSHROOM.h + 0.4);
      expect(box.max.x - box.min.x).toBeCloseTo(2 * BIG_MUSHROOM.r * 1.95, 0);
    });
    // painted, not textured: the colours of the village - a red cap with white spots on a pale stem
    expect(mesh.geometry.getAttribute('uv')).toBeUndefined();
    const col = mesh.geometry.getAttribute('color'), seen = new Set<string>();
    for (let k = 0; k < per; k++) seen.add(new THREE.Color(col.getX(k), col.getY(k), col.getZ(k)).getHexString());
    expect(seen.size).toBe(3);                                  // stem, cap, spots - a door would be a fourth
  });
});

describe('the scenery of the forest draws them', () => {
  const scenery = (import.meta.glob('./scenery.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['./scenery.ts'];
  it('built once at their places on the ground, hidden until she is near; each holds her off its stem', () => {
    expect(scenery).toMatch(/const mushrooms = buildBigMushrooms\(BIG_MUSHROOM\.h, BIG_MUSHROOM\.r, BIG_MUSHROOMS\.map\(\(p\) => \(\{ x: p\.x, y: height\(p\.x, p\.z\), z: p\.z, rot: p\.rot \}\)\)\);\n\s*mushrooms\.visible = false;\n\s*scene\.add\(mushrooms\);/);
    expect(scenery).toMatch(/for \(const p of BIG_MUSHROOMS\) colliders\.push\(\{ x: p\.x, z: p\.z, r: BIG_MUSHROOM_WALL \}\);/);
  });
  it('every frame they are drawn, and cast their shadow, by where she is', () => {
    expect(scenery).toMatch(/const near = bigMushroomsAt\(x, z\);\n\s*mushrooms\.visible = near\.shown; mushrooms\.castShadow = near\.shadow;\n\s*\};/);
    expect(scenery).toMatch(/return \{ trees, oak, stream, shadows \};/);
  });
});
