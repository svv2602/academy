// @vitest-environment happy-dom
/**
 * The places of Pip's notes 5-8 in the forest (./notes.ts, src/game/notes-world.ts): on ground she walks, off the
 * paths, clear of the residents and her way to each (R10), of every spot of the forest and its colliders; no plant
 * grows over one.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));
import { EASEL_SPOT_R } from '../../game/easel';
import { NOTE_FIND_R, NOTE_SPOT_R, SEARCH_NOTES, notePlacesProblems, type Clear, type NoteGround } from '../../game/notes-find';
import { EN_GO_REACH } from '../../game/worldtasks/en-go';
import { COLLECT, DAILY_PLACES } from './collect';
import { BIG_MUSHROOMS, BIG_MUSHROOM_WALL, PIP_PLACE } from './en-places';
import { BYSTANDERS, FRIENDS, OWLET_HEAP, FRIEND_CLEAR } from './index';
import { ALTAR, ARRIVAL, EASEL, HALF, HOLLOW, LANDMARKS, MAZE_END, MAZE_IN, OAK, OWL_TREE, PATHS, SECRET_CLEARINGS, SPAWN, STREAM_HALF, ZONES, inMaze } from './layout';
import { FIRST_HOUSE, NOTE_CLEAR, NOTE_PLACES } from './notes';
import { placeTrees, villageHouses } from './scenery';
import { trampolineOf } from './secrets';
import { lineDist, pathDist, streamDist } from './terrain';
import { placePlants } from './undergrowth';

type At = { x: number; z: number };
const near = (r: number, what: string) => (p: At): Clear => ({ x: p.x, z: p.z, r, what });
const d = (a: At, b: At) => Math.hypot(a.x - b.x, a.z - b.z);
/** The point of the paths nearest to `p`: where she leaves a path for a resident. */
function fromPath(p: At): At {
  let best = p, bd = Infinity;
  for (const line of PATHS) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const q = { x: a.x + dx * t, z: a.z + dz * t };
    if (d(p, q) < bd) { bd = d(p, q); best = q; }
  }
  return best;
}

function forestGround(): NoteGround {
  const { trees } = placeTrees();
  return {
    walkable: (x, z) => Math.hypot(x, z) < HALF - 4 && streamDist(x, z) > STREAM_HALF + 1 && !inMaze(x, z, 2),
    pathDist,
    residents: [...FRIENDS, ...BYSTANDERS].map((f) => ({ x: f.x, z: f.z, from: fromPath(f), what: `the ${f.id}` })),
    spots: [
      near(2.4, 'Pip')(PIP_PLACE), near(2, 'the arch to the Great Tree')(LANDMARKS.center), near(2.4, 'the altar')(ALTAR),
      near(EASEL_SPOT_R, 'the easel')(EASEL), near(1.5, 'the owlet\'s heap')(OWLET_HEAP), near(1.5, 'the leaf of the hollow')(HOLLOW),
      near(2, 'the way into the maze')(MAZE_IN), near(1.5, 'the leaf of the maze')(MAZE_END), near(3, 'the spawn')(SPAWN),
      near(3, 'where she comes out of the arch')(ARRIVAL), near(2, 'the door of Shustrik\'s tree')(LANDMARKS.grove),
      near(2, 'the trampoline')(trampolineOf().at),
      ...BIG_MUSHROOMS.map(near(EN_GO_REACH, 'a big mushroom of Pip\'s command')),
      ...DAILY_PLACES.map(near(2.2, 'a find of the day')), ...COLLECT.items.map(near(2.2, 'a find of the collections')),
    ],
    solids: [
      ...trees.map((t) => near(0.45 * t.s, 'a tree')(t)), ...villageHouses().map(near(1.4, 'a house of the gnomes')),
      near(1.8, 'the elder\'s house')(LANDMARKS.village), near(1, 'the owl\'s tree')(OWL_TREE), near(1.1, 'Shustrik\'s tree')(LANDMARKS.grove),
      near(1.6, 'the Ash')(ZONES.ash), near(OAK.trunkR + 0.3, 'the Old Oak')(ZONES.oak),
      ...BIG_MUSHROOMS.map(near(BIG_MUSHROOM_WALL, 'a big mushroom')),
      ...SECRET_CLEARINGS.map((c) => near(c.clear - 2, 'a secret')(c)),
      near(1.2, 'the lamps and stones of the village')(ZONES.village),
    ],
  };
}

describe('Pip\'s notes in the forest', () => {
  it('notes 5-8 lie here, those that send her looking with a bookmark', () => {
    expect(NOTE_PLACES.map((p) => p.id)).toEqual(['note_5', 'note_6', 'note_7', 'note_8']);
    expect(NOTE_PLACES.filter((p) => p.find).map((p) => p.id)).toEqual(SEARCH_NOTES.filter((id) => NOTE_PLACES.some((p) => p.id === id)));
  });

  it('each, and the ground under each bookmark, off the paths, clear of the residents and her way to them, the spots and the colliders', () => {
    expect(notePlacesProblems(NOTE_PLACES, forestGround())).toEqual([]);
  });

  it('where layout §3 has them: the arch, the stream, the Owl glade, the grove; the bookmarks at the first house and up the owl\'s tree', () => {
    const [n5, n6, n7, n8] = NOTE_PLACES;
    expect(d(n5, LANDMARKS.center)).toBeLessThan(7.5);
    expect(streamDist(n6.x, n6.z)).toBeLessThan(STREAM_HALF + 4);
    expect(d(n7, ZONES.owl)).toBeLessThan(8);
    expect(d(n8, ZONES.grove)).toBeLessThan(8);
    // the first house: the nearest of the village to the glade, the bookmark just past its stem
    for (const h of villageHouses()) expect(d(FIRST_HOUSE, ZONES.center)).toBeLessThanOrEqual(d(h, ZONES.center));
    expect(d(n5.find!, FIRST_HOUSE)).toBeLessThan(3.5);
    // №7 hangs on the bark over the owl's glade, found from the ground under it, beside the trunk
    const f = n7.find!;
    expect(f.up).toBeGreaterThan(2);
    expect(d(f.hang!, OWL_TREE)).toBeLessThan(1.2);
    expect(d(f, OWL_TREE)).toBeGreaterThan(1 + 0.4);
    expect(d(f, f.hang!)).toBeLessThan(NOTE_FIND_R);
    expect(d(f, HOLLOW)).toBeGreaterThan(1.5 + NOTE_FIND_R);        // not where the leaf of the hollow is taken
  });

  it('out of the look from the glade to the village (the heaviest of the forest): №5 east of the arch', () => {
    const n5 = NOTE_PLACES[0], to = Math.atan2(ZONES.village.x - ZONES.center.x, ZONES.village.z - ZONES.center.z);
    const a = Math.atan2(n5.x - ZONES.center.x, n5.z - ZONES.center.z) - to;
    expect(Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 180 / Math.PI).toBeGreaterThan(90);
  });

  it('no plant of the undergrowth grows on a note or a bookmark, and none of the squirrel\'s tracks run over one', () => {
    // the world takes them out (./index.ts), as it does round the characters
    const index = (import.meta.glob('./index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['./index.ts'];
    expect(index).toMatch(/placePlants\(undefined, \[\.\.\.FRIEND_CLEAR\(\), [^;]*\.\.\.NOTE_CLEAR\(\)[,\]]/);
    const plants = placePlants(undefined, [...FRIEND_CLEAR(), ...NOTE_CLEAR()]);
    const bad = NOTE_CLEAR().flatMap((c) => plants.filter((p) => d(p, c) < NOTE_SPOT_R - 0.3).map((p) => `${c.x.toFixed(1)}, ${c.z.toFixed(1)}: a plant at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`));
    expect(bad).toEqual([]);
    for (const p of NOTE_PLACES) expect(lineDist(PATHS[PATHS.length - 1], p.x, p.z)).toBeGreaterThan(5);
  });
});
