/**
 * Pip's notes 1-4 in the valley of the fairies (Season 2, part G3, src/game/notes-world.ts; layout §3), each off the
 * path and clear of the residents and of her way to them (./notes.test.ts):
 * 1. by Pip's feeder (./en-places.ts EN_GIVEN), a few steps toward the pond - out of his spot of talk;
 * 2. by the shop's signboard (SHOP_SIGN), behind it from the path; its bookmark under the fairy house's south wall
 *    (HOUSE), toward the cluster of big mushrooms beyond it;
 * 3. on the west bank of the pond (POND), where its pebbles lie;
 * 4. by the birches of the chest (CHEST), toward the valley; its bookmark on the south bank of the pond, away from the
 *    path, the easel and the unicorn.
 */
import type { NotePlace } from '../../game/notes-find';

export const NOTE_PLACES: readonly NotePlace[] = [
  { id: 'note_1', x: 8.5, z: -1.5, heading: 0.5 },
  { id: 'note_2', x: 8, z: 12.5, heading: 2.2, find: { x: -10.5, z: -2.5 } },
  { id: 'note_3', x: 4, z: -21, heading: 1.3 },
  { id: 'note_4', x: -27.5, z: 9.5, heading: -0.7, find: { x: 15, z: -31 } },
];

/** m round each note and bookmark where no rock, bush or stump of chance stands (./scenery.ts, filtered after). */
export const NOTE_CLEAR = 1.6;
/** Whether (x, z) is clear of every note and bookmark of the valley. */
export const clearOfNotes = (x: number, z: number) =>
  NOTE_PLACES.every((p) => Math.hypot(p.x - x, p.z - z) >= NOTE_CLEAR && (!p.find || Math.hypot(p.find.x - x, p.find.z - z) >= NOTE_CLEAR));
