/**
 * The places of Pip's notes 1-4 in the valley of the fairies (./notes.ts, src/game/notes-world.ts): on the meadow she
 * walks, off the path, clear of the residents and her way to each (R10), of every spot of the valley and its colliders.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { EASEL_SPOT_R } from '../../game/easel';
import { MYSTERY_SPOT_R } from '../../game/mystery-stars';
import { NOTE_SPOT_R, SEARCH_NOTES, notePlacesProblems, type Clear, type NoteGround } from '../../game/notes-find';
import { EN_GO_REACH } from '../../game/worldtasks/en-go';
import { COLLECT, DAILY_PLACES, FIND_CLEAR, OAKS, SUPPORTS } from './collect';
import { EN_PLACES, PIP_PLACE } from './en-places';
import { BOULDERS, gladeRocks } from './hiding';
import { CASTLE, CHEST, CRYSTAL, EASEL, GLADE, HOUSE, MYSTERY_SPOTS, PATCH, POND, SHOP_SIGN, SPAWN, TREE_WAY, WORLD_R } from './layout';
import { NOTE_PLACES } from './notes';
import { QUESTS, SHRINE } from './quests';
import { placeTrees } from './scenery';
import { DOOR_OUT } from './secrets';
import { nearestOnPath, pathDist } from './terrain';

const near = (r: number, what: string) => (p: { x: number; z: number }): Clear => ({ x: p.x, z: p.z, r, what });
/** The clusters of big mushrooms of ./scenery.ts: 4 of chance within 2.5 m of each middle, up to 0.8 m thick. */
const MUSHROOM_CLUSTERS = [[-14, -6], [9, 6], [-20, -30], [24, 2], [-4, -36]].map(([x, z]) => ({ x, z }));
const door = { x: HOUSE.x + Math.sin(HOUSE.rot) * DOOR_OUT, z: HOUSE.z + Math.cos(HOUSE.rot) * DOOR_OUT };

function valley(density: number): NoteGround {
  const { placed, grove } = placeTrees(mulberry32(2024), density);
  return {
    walkable: (x, z) => Math.hypot(x, z) < WORLD_R - 9 && Math.hypot(x - POND.x, z - POND.z) > POND.r + 1.5,
    pathDist,
    residents: QUESTS.map((q) => ({ x: q.x, z: q.z, from: nearestOnPath(q.x, q.z), what: `the ${q.id}` })),
    spots: [
      near(2.4, 'Pip')(PIP_PLACE), near(2.4, 'the shop')(SHOP_SIGN), near(2.2, 'the chest')(CHEST), near(2.6, 'the shrine')(SHRINE),
      near(2, 'the door of the house')(door), near(2.5, 'the way to the Great Tree')(TREE_WAY), near(EASEL_SPOT_R, 'the easel')(EASEL),
      near(3, 'the spawn')(SPAWN), near(3, 'the butterflies\' bed')(PATCH), near(2, 'the crystal')(CRYSTAL),
      // the beds of red flowers of Pip's command; his "little house" is the fairy house, where the bookmark of №2 waits
      // by layout §3 - its wall is among the solids
      ...EN_PLACES.filter((p) => p.kind !== 'house').map((p) => near(p.r ?? EN_GO_REACH, `a place of Pip's command (${p.kind})`)(p)),
      ...MYSTERY_SPOTS.map(near(MYSTERY_SPOT_R, 'a mysterious star')),
      ...DAILY_PLACES.map(near(FIND_CLEAR, 'a find of the day')),
      ...COLLECT.items.map(near(FIND_CLEAR, 'a find of the collections')),
    ],
    solids: [
      near(3.2, 'the house')(HOUSE), near(1.2, 'the well')({ x: -5, z: 7.5 }), near(15, 'the castle')(CASTLE),
      near(GLADE.r + 2.5, 'the glade')(GLADE), ...gladeRocks().map((k) => near(k.r, 'a rock of the glade')(k)),
      ...BOULDERS.map((b) => near(b.r, 'a boulder')(b)), ...OAKS.map(near(0.45, 'an oak')), ...SUPPORTS.map((s) => near(s.r, 'a stump or a stone')(s)),
      ...MUSHROOM_CLUSTERS.map(near(3.5, 'a cluster of big mushrooms')),
      ...[...placed, ...grove].filter((t) => t.collide).map(near(0.6, 'a tree')),
    ],
  };
}

describe('Pip\'s notes in the valley of the fairies', () => {
  it('notes 1-4 lie here, those that send her looking with a bookmark', () => {
    expect(NOTE_PLACES.map((p) => p.id)).toEqual(['note_1', 'note_2', 'note_3', 'note_4']);
    expect(NOTE_PLACES.filter((p) => p.find).map((p) => p.id)).toEqual(SEARCH_NOTES.filter((id) => NOTE_PLACES.some((p) => p.id === id)));
    expect(NOTE_PLACES.every((p) => !p.find?.up)).toBe(true);        // nothing hangs here: every bookmark on the ground
  });

  for (const [what, density] of [['the phone', 0.75], ['the computer', 1]] as const) {
    it(`each, and each bookmark, on the meadow off the path, clear of the residents and her way to them, the spots and the colliders (${what})`, () => {
      expect(notePlacesProblems(NOTE_PLACES, valley(density))).toEqual([]);
    });
  }

  it('where layout §3 has them: by Pip, by the shop, at the pond, by the chest; the bookmarks at the house and at the pond', () => {
    const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
    const [n1, n2, n3, n4] = NOTE_PLACES;
    expect(d(n1, PIP_PLACE)).toBeLessThan(2.4 + NOTE_SPOT_R + 1);
    expect(d(n2, SHOP_SIGN)).toBeLessThan(2.4 + NOTE_SPOT_R + 1.5);
    expect(d(n3, POND) - POND.r).toBeLessThan(3);
    expect(d(n4, CHEST)).toBeLessThan(6);
    expect(d(n2.find!, HOUSE)).toBeLessThan(6);
    expect(d(n4.find!, POND) - POND.r).toBeLessThan(3.5);
  });
});
