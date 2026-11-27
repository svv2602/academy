// @vitest-environment happy-dom
/**
 * The places of Pip's command in the forest (./en-places.ts, LEARN-23): in order by the rule of the task, on ground she
 * can walk to, away from the village; the big mushrooms themselves, and when they are drawn.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EN_GO_FAR, EN_GO_NEAR, EN_GO_REACH, enPlacesProblems, inRing, kindsAt } from '../../game/worldtasks/en-go';
import { COLLECT, DAILY_PLACES } from './collect';
import { BIG_MUSHROOM, BIG_MUSHROOMS, BIG_MUSHROOM_SHADOW, BIG_MUSHROOM_SHOW, BIG_MUSHROOM_WALL, EN_GIVEN, EN_PLACES, bigMushroomAt } from './en-places';
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
    expect(EN_PLACES.map((p) => Math.round(d(p, EN_GIVEN) * 10) / 10)).toEqual([17.3, 18.1, 20.5]);
    expect(EN_PLACES.every((p) => d(p, EN_GIVEN) >= EN_GO_NEAR && d(p, EN_GIVEN) <= EN_GO_FAR)).toBe(true);
    expect([EN_GIVEN.x, EN_GIVEN.z]).toEqual([ZONES.center.x, ZONES.center.z]);
  });

  it('the command that can be given there: the big mushroom - three of them to find, in three directions', () => {
    expect(kindsAt(EN_PLACES, EN_GIVEN)).toEqual(['mushroom']);
    expect(inRing(EN_PLACES, 'mushroom', EN_GIVEN)).toHaveLength(3);
    expect(EN_PLACES.map((p) => p.word)).toEqual(['mushroom', 'mushroom', 'mushroom']);
    const apart = BIG_MUSHROOMS.flatMap((a, i) => BIG_MUSHROOMS.slice(i + 1).map((b) => d(a, b)));
    expect(Math.min(...apart)).toBeGreaterThan(15);         // no two side by side: each is a walk of its own
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

  it('none stands in the look from the glade to the village - the heaviest of the forest (TECH-06): all are east or south of the glade', () => {
    // the camera stands behind her on the line from the village through the glade, looking along it; half of what it
    // sees across is 50 degrees at most (a phone held sideways) - with a margin, none within 60 of that line
    const to = Math.atan2(ZONES.village.x - EN_GIVEN.x, ZONES.village.z - EN_GIVEN.z);
    const off = BIG_MUSHROOMS.map((p) => { const a = Math.atan2(p.x - EN_GIVEN.x, p.z - EN_GIVEN.z) - to; return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 180 / Math.PI; });
    expect(off.every((deg) => deg > 60), off.map((x) => x.toFixed(0)).join(', ')).toBe(true);
    for (const p of BIG_MUSHROOMS) expect(d(p, ZONES.village)).toBeGreaterThan(60);
  });

  it('never drawn at the village nor at the other glades of the residents: each is drawn only while she is within BIG_MUSHROOM_SHOW of it', () => {
    for (const at of [ZONES.village, LANDMARKS.village, ZONES.owl, ZONES.maze, ZONES.grove, ZONES.ash, ...villageHouses()]) {
      BIG_MUSHROOMS.forEach((_, i) => expect(bigMushroomAt(i, at.x, at.z), `${i} from ${at.x}, ${at.z}`).toEqual({ shown: false, shadow: false }));
    }
    BIG_MUSHROOMS.forEach((p, i) => {
      expect(bigMushroomAt(i, p.x + BIG_MUSHROOM_SHOW, p.z).shown).toBe(false);
      expect(bigMushroomAt(i, p.x + BIG_MUSHROOM_SHOW - 0.1, p.z).shown).toBe(true);
    });
  });

  it('from the glade every one of them is drawn, and on the whole way to it; its shadow only near it', () => {
    BIG_MUSHROOMS.forEach((p, i) => {
      // from the middle of the glade and from a few steps round it, wherever Pip sits there
      for (const [dx, dz] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]) expect(bigMushroomAt(i, EN_GIVEN.x + dx, EN_GIVEN.z + dz).shown, `${i} from the glade ${dx}, ${dz}`).toBe(true);
      expect(bigMushroomAt(i, EN_GIVEN.x, EN_GIVEN.z).shadow).toBe(false);
      for (let t = 0; t <= 1.2001; t += 0.1) expect(bigMushroomAt(i, EN_GIVEN.x + (p.x - EN_GIVEN.x) * t, EN_GIVEN.z + (p.z - EN_GIVEN.z) * t).shown, `${i} at ${t.toFixed(1)}`).toBe(true);
      expect(bigMushroomAt(i, p.x + 3, p.z)).toEqual({ shown: true, shadow: true });
      expect(bigMushroomAt(i, p.x, p.z + BIG_MUSHROOM_SHADOW - 0.1).shadow).toBe(true);
      expect(bigMushroomAt(i, p.x, p.z + BIG_MUSHROOM_SHADOW).shadow).toBe(false);
    });
    // seen from the glade with room to spare: Pip may sit a few steps off its middle
    expect(Math.max(...BIG_MUSHROOMS.map((p) => d(p, EN_GIVEN)))).toBeLessThan(BIG_MUSHROOM_SHOW - 5);
  });
});

describe('the big mushrooms themselves (./village.ts)', () => {
  const puts = BIG_MUSHROOMS.map((p) => ({ x: p.x, y: 0.5, z: p.z, rot: p.rot }));
  const meshes = buildBigMushrooms(BIG_MUSHROOM.h, BIG_MUSHROOM.r, puts);

  it('a mesh each, so the frame draws only those in sight - of one geometry and of the houses\' own material: no new program', () => {
    expect(meshes).toHaveLength(puts.length);
    expect(meshes.map((m) => m.name)).toEqual(['big-mushroom-0', 'big-mushroom-1', 'big-mushroom-2']);
    const scene = new THREE.Scene();
    buildHouses(scene, [{ x: 0, y: 0, z: 0, rot: 0 }]);
    const walls = (scene.getObjectByName('house-walls') as THREE.Mesh).material;
    for (const m of meshes) {
      expect(m.isMesh).toBe(true);
      expect(m.material).toBe(walls);
      expect(m.geometry).toBe(meshes[0].geometry);
      expect([m.castShadow, m.receiveShadow, m.frustumCulled]).toEqual([true, true, true]);
    }
    expect(meshes[0].geometry.boundingSphere!.radius).toBeLessThan(BIG_MUSHROOM.h);       // its own size: culled by itself
  });

  it('each stands at its place on the ground, turned its own way', () => {
    meshes.forEach((m, i) => {
      expect([m.position.x, m.position.y, m.position.z]).toEqual([puts[i].x, 0.5, puts[i].z]);
      expect(m.rotation.y).toBe(puts[i].rot);
    });
    expect(new Set(puts.map((p) => p.rot)).size).toBe(puts.length);
  });

  it('as tall as it is said to be, standing on the ground, its cap wider than its stem; no door, no window', () => {
    const geo = meshes[0].geometry, pos = geo.getAttribute('position'), box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y - box.min.y).toBeGreaterThan(BIG_MUSHROOM.h - 0.2);
    expect(box.max.y - box.min.y).toBeLessThan(BIG_MUSHROOM.h + 0.4);
    expect(box.max.x - box.min.x).toBeCloseTo(2 * BIG_MUSHROOM.r * 1.95, 0);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 1);
    // painted, not textured: the colours of the village - a red cap with white spots on a pale stem
    expect(geo.getAttribute('uv')).toBeUndefined();
    const col = geo.getAttribute('color'), seen = new Set<string>();
    for (let k = 0; k < col.count; k++) seen.add(new THREE.Color(col.getX(k), col.getY(k), col.getZ(k)).getHexString());
    expect(seen.size).toBe(3);                                  // stem, cap, spots - a door would be a fourth
  });
});

describe('the scenery of the forest draws them', () => {
  const scenery = (import.meta.glob('./scenery.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['./scenery.ts'];
  it('built once at their places on the ground, hidden until she is near; each holds her off its stem', () => {
    expect(scenery).toMatch(/const mushrooms = buildBigMushrooms\(BIG_MUSHROOM\.h, BIG_MUSHROOM\.r, BIG_MUSHROOMS\.map\(\(p\) => \(\{ x: p\.x, y: height\(p\.x, p\.z\), z: p\.z, rot: p\.rot \}\)\)\);\n\s*for \(const m of mushrooms\) \{ m\.visible = false; scene\.add\(m\); \}/);
    expect(scenery).toMatch(/for \(const p of BIG_MUSHROOMS\) colliders\.push\(\{ x: p\.x, z: p\.z, r: BIG_MUSHROOM_WALL \}\);/);
  });
  it('every frame each is drawn, and casts its shadow, by where she is', () => {
    expect(scenery).toMatch(/mushrooms\.forEach\(\(m, i\) => \{ const near = bigMushroomAt\(i, x, z\); m\.visible = near\.shown; m\.castShadow = near\.shadow; \}\);\n\s*\};/);
    expect(scenery).toMatch(/return \{ trees, oak, stream, shadows \};/);
  });
});
