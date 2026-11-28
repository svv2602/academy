/**
 * Pip's notes 5-8 in the forest (Season 2, part G3, src/game/notes-world.ts; layout §3), each off the paths and clear
 * of the residents and of her way to them (./notes.test.ts):
 * 5. behind the hub's stone arch of the central glade, on Pip's side, between the paths to the Oak and to the stream
 *    side - east of the glade, out of the look from the glade to the village (the heaviest of the forest, TECH-06); its
 *    bookmark by the first house of the gnomes' village (the one nearest the glade), on its far side from the village's middle;
 * 6. on the north bank of the stream, east of its bridge;
 * 7. on the Owl glade, a few steps from Mudrena; its bookmark on the bark of the owl's tree, over her head (the tree has
 *    no branch that low: it hangs on the trunk), found by walking under it;
 * 8. in the squirrel grove, toward the way to the maze, off the squirrel's tracks.
 */
import type { NotePlace } from '../../game/notes-find';
import { OWL_TREE, ZONES } from './layout';
import { villageHouses } from './scenery';

/** The first house of the village: of its houses, the one nearest the central glade (the way she comes from). */
export const FIRST_HOUSE = (() => {
  const d = (h: { x: number; z: number }) => Math.hypot(h.x - ZONES.center.x, h.z - ZONES.center.z);
  return villageHouses().reduce((a, b) => (d(b) < d(a) ? b : a));
})();
/** m from the middle of that house where the bookmark waits: past its stem (1.4 m), outward from the village. */
const BY_HOUSE = 2.8;
const house = (() => {
  const dx = FIRST_HOUSE.x - ZONES.village.x, dz = FIRST_HOUSE.z - ZONES.village.z, d = Math.hypot(dx, dz) || 1;
  return { x: FIRST_HOUSE.x + (dx / d) * BY_HOUSE, z: FIRST_HOUSE.z + (dz / d) * BY_HOUSE };
})();

/**
 * The owl's tree: the side the bookmark hangs on, its north, away from its hollow (the leaf of the chain waits there):
 * the ground under it (outside the trunk's collider, 1 m) and the bark at OWL_HANG m from its middle.
 */
const OWL_SIDE = { x: 0, z: -1 }, OWL_UNDER = 1.7, OWL_HANG = 0.95, OWL_UP = 2.5;

export const NOTE_PLACES: readonly NotePlace[] = [
  { id: 'note_5', x: 37, z: -11.5, heading: 2.6, find: house },
  { id: 'note_6', x: 42, z: 16, heading: 0.3 },
  { id: 'note_7', x: -29.5, z: -53, heading: -1.1, find: {
    x: OWL_TREE.x + OWL_SIDE.x * OWL_UNDER, z: OWL_TREE.z + OWL_SIDE.z * OWL_UNDER, up: OWL_UP,
    hang: { x: OWL_TREE.x + OWL_SIDE.x * OWL_HANG, z: OWL_TREE.z + OWL_SIDE.z * OWL_HANG },
  } },
  { id: 'note_8', x: -30, z: 45.5, heading: 1.9 },
];

/** The ground round each note and bookmark where no plant of the undergrowth grows (./undergrowth.ts placePlants `clear`). */
export const NOTE_CLEAR = (r = 1.6) => NOTE_PLACES.flatMap((p) => [{ x: p.x, z: p.z, r }, ...(p.find ? [{ x: p.find.x, z: p.find.z, r }] : [])]);
