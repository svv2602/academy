/**
 * Pip's notes for reading as things she finds in the worlds 1-2 (Season 2, step 2, part G3; layout §3): notes 1-4 lie
 * in the valley of the fairies, 5-8 in the forest, each a little rolled paper with a ribbon on the ground at its place
 * (the world's ./notes.ts). A tap (or the action button) by one opens the panel task of that very note (`note`,
 * ./tasks/note.ts `noteExample`), recorded to reading as Pip's note of his request is (`recordTask(save, 'read')`).
 *
 * - The notes answered on the panel (№1 the picture, №3 the pebbles, №6 the riddle, №8 the sum): solved - found.
 * - The notes that send her looking (№2, 4, 5, 7, `SEARCH_NOTES`): solved - a bookmark appears where the note said;
 *   walking up to it (NOTE_FIND_R on the ground under it) finds the note. No sparkles lead there: she has read where.
 *   The bookmark waits for this session only (no new field: the save is version 5 and keeps its shape) - after a reload
 *   the note lies there again and is read again.
 * - Found: its id goes into `save.notes` (the book's notes, in the order found), 3 stars, sparks; it is gone from the
 *   world. Closed: nothing, the note stays.
 * - Shown once Pip is met (`save.pip.met`), whatever `save.english`: they are his notes, but the subject is reading
 *   (Ukrainian), not English - with English off the child still reads them.
 *
 * Everything the notes do to the game goes through `NotesEnv` (./notes-world.ts `worldNotes` makes it of the game), so the tests
 * run the course with stand-ins, as ./pip-request.ts does.
 */
import type { Rng } from '../core/rng';
import type { Save } from '../core/save';
import type { NoteId } from '../s2/strings-book';
import { levelFor, recordTask } from './skills';
import { noteExample, type NoteSpec } from './tasks/note';
import { answerOf, type TaskResult } from './taskviews/panel';

/** The notes that send her looking in the world (layout §3): the rest are answered on the panel. */
export const SEARCH_NOTES: readonly NoteId[] = ['note_2', 'note_4', 'note_5', 'note_7'];

/**
 * Where a note lies, turned `heading`; a note of SEARCH_NOTES has where its bookmark waits: (x, z) the ground she walks
 * up to; a bookmark up a tree hangs `up` m over the ground at `hang` (on the bark, over that ground).
 */
export interface NotePlace {
  readonly id: NoteId;
  readonly x: number; readonly z: number; readonly heading: number;
  readonly find?: { readonly x: number; readonly z: number; readonly up?: number; readonly hang?: { readonly x: number; readonly z: number } };
}

/** m: the action button of a note within this; the bookmark found within this of the ground under it. */
export const NOTE_SPOT_R = 1.8, NOTE_FIND_R = 1.5;
/** m: the notes are drawn while she is within this of them (one mesh for the world's notes: only the near ones in it). */
export const NOTE_SHOW = 30;
/** m over the ground a bookmark floats when it does not hang (`find.up`). */
export const BOOKMARK_UP = 0.55;
/** The face of the notes on the panel and in the bubble. */
export const NOTE_FACE = '📜';

/** Whether the notes are in the worlds: Pip met (English or not: the subject is reading). */
export const notesOn = (save: Pick<Save, 'pip'>) => save.pip.met;
/** The notes of `places` lying in the world now: Pip met, not found yet; in the order of `places`. */
export const notesShown = (save: Pick<Save, 'pip' | 'notes'>, places: readonly NotePlace[]): NoteId[] =>
  notesOn(save) ? places.filter((p) => !save.notes.includes(p.id)).map((p) => p.id) : [];

/** What the notes do to the game: `worldNotes` makes it of `Game`, the tests of stand-ins. */
export interface NotesEnv {
  readonly save: Save;
  readonly places: readonly NotePlace[];
  /** The game's randomness (ARCH-08): the other answers of the note, their order. */
  readonly rng: Rng;
  /** A scene holding the controls; false - it did not start (busy, or the world was left). */
  scene(name: string, place: NotePlace, body: () => Promise<void>): Promise<boolean>;
  /** The panel task of the note (through the planner's notes of it: the example kept, №8 noted for adding). */
  panel(spec: NoteSpec): Promise<TaskResult>;
  /** The find of a note at `at`: its 3 stars and sparks (`g.addStars(3, ...)`). */
  reward(at: { x: number; z: number; up?: number }): void;
  /** The save stored. */
  persist(): void;
}

export interface Notes {
  /** The notes lying in the world now. */
  shown(): NoteId[];
  /** The note whose bookmark waits now, else null (this session only). */
  waiting(): NoteId | null;
  /** A note is open on the panel now. */
  opening(): boolean;
  /** A tap on the note `id`: its panel task; settles when it has ended, whichever way. */
  open(id: NoteId): Promise<void>;
  /** Every frame: where she is, whether she walks by herself - the bookmark is found by walking up to it. */
  update(at: { x: number; z: number }, canMove: boolean): void;
  /** The bookmark of `id` reached (the debug door): found if it waits; false - none waits for `id`. */
  reach(id: NoteId): boolean;
}

export function createNotes(env: NotesEnv): Notes {
  const { save, places } = env;
  const byId = new Map(places.map((p) => [p.id, p]));
  let waiting: NoteId | null = null, opening = false;

  /** The note found: in the book, 3 stars at `at`, stored. Once: a note found is not found again. */
  function found(id: NoteId, at: { x: number; z: number; up?: number }) {
    if (waiting === id) waiting = null;
    if (save.notes.includes(id)) return false;
    save.notes.push(id);
    env.reward(at);
    env.persist();
    return true;
  }

  return {
    shown: () => notesShown(save, places),
    waiting: () => waiting,
    opening: () => opening,
    async open(id) {
      const p = byId.get(id);
      if (!p || opening || !notesShown(save, places).includes(id)) return;
      opening = true;
      try {
        await env.scene(`note ${id}`, p, async () => {
          const spec = noteExample(levelFor(save, 'read'), id, env.rng);
          const res = await env.panel(spec);
          if (!res.solved) return;          // closed: nothing, the note stays
          // as Pip's note of his request (./pip-request.ts): with a helper, no level up
          recordTask(save, 'read', res.wrong, res.helped === true, { type: 'note', ...answerOf(res) });
          if (p.find) { waiting = id; env.persist(); } else found(id, p);
        });
      } catch (e) {
        console.error(`note ${id} failed:`, e);
      } finally { opening = false; }
    },
    update(at, canMove) {
      if (!waiting) return;
      const f = byId.get(waiting)?.find;
      if (!f || !notesOn(save)) return;
      if (canMove && Math.hypot(at.x - f.x, at.z - f.z) < NOTE_FIND_R) found(waiting, f);
    },
    reach(id) {
      const f = byId.get(id)?.find;
      if (waiting !== id || !f) return false;
      return found(id, f);
    },
  };
}

// ---------- the problems of the places of a world's notes (its ./notes.test.ts) ----------

interface At { readonly x: number; readonly z: number }
/** A thing of the world a note keeps clear of: a spot of its own (its `r`: the action button), or a solid (its collider). */
export interface Clear extends At { readonly r: number; readonly what: string }

export interface NoteGround {
  /** On the walkable ground of the world (inside its edge, not in water). */
  walkable(x: number, z: number): boolean;
  /** m to the nearest path. */
  pathDist(x: number, z: number): number;
  /** The residents, and where each is walked to from (the nearest point of a path): her way to it (R10). */
  residents: readonly (At & { readonly from: At; readonly what: string })[];
  /** The things with an action spot of their own (talk, shop, chest, door...): no button of a note over theirs. */
  spots: readonly Clear[];
  /** The colliders of the world (trees, houses, rocks) and the solid ground of other finds. */
  solids: readonly Clear[];
}

/** m a note keeps off a path, off the way to a resident, off a collider. */
export const NOTE_PATH_CLEAR = 2.5, NOTE_WAY_CLEAR = 2, NOTE_SOLID_CLEAR = 0.6, NOTE_RESIDENT_CLEAR = 5;

const segDist = (p: At, a: At, b: At) => {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};

/**
 * What is wrong with the places of a world's notes: each note, and the ground under each bookmark, on walkable ground,
 * off the paths, clear of the residents and of her way to each, of the spots and the colliders; the notes apart.
 */
export function notePlacesProblems(places: readonly NotePlace[], w: NoteGround): string[] {
  const out: string[] = [];
  const check = (p: At, name: string, spotR: number) => {
    const bad = (why: string) => out.push(`${name} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}): ${why}`);
    if (!w.walkable(p.x, p.z)) bad('not on walkable ground');
    if (w.pathDist(p.x, p.z) < NOTE_PATH_CLEAR) bad(`on a path (${w.pathDist(p.x, p.z).toFixed(1)} m)`);
    for (const r of w.residents) {
      if (Math.hypot(p.x - r.x, p.z - r.z) < NOTE_RESIDENT_CLEAR) bad(`at ${r.what}`);
      else if (segDist(p, r.from, r) < NOTE_WAY_CLEAR) bad(`on the way to ${r.what}`);
    }
    for (const s of w.spots) if (Math.hypot(p.x - s.x, p.z - s.z) < s.r + spotR) bad(`its button over that of ${s.what}`);
    for (const s of w.solids) if (Math.hypot(p.x - s.x, p.z - s.z) < s.r + NOTE_SOLID_CLEAR) bad(`in ${s.what}`);
  };
  places.forEach((p, i) => {
    check(p, p.id, NOTE_SPOT_R);
    if (p.find) check(p.find, `the bookmark of ${p.id}`, NOTE_FIND_R);
    for (const q of places.slice(i + 1)) {
      if (Math.hypot(p.x - q.x, p.z - q.z) < 2 * NOTE_SPOT_R + 1) out.push(`${p.id} and ${q.id} lie side by side`);
    }
    // a bookmark is a walk away: not where its note lies
    if (p.find && Math.hypot(p.x - p.find.x, p.z - p.find.z) < NOTE_SPOT_R + NOTE_FIND_R + 3) out.push(`the bookmark of ${p.id} is by its note`);
  });
  return out;
}

/** The places as the world's debug door shows them. */
export const placesOf = (places: readonly NotePlace[]) =>
  Object.fromEntries(places.map((p) => [p.id, { x: p.x, z: p.z, ...(p.find ? { find: { ...p.find } } : {}) }]));

