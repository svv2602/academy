// @vitest-environment happy-dom
/**
 * Pip's notes as things she finds in the worlds 1-2 (Season 2, part G3, ./notes-find.ts, ./notes-world.ts): all eight
 * placed, shown once Pip is met (English or not), gone once found; a note answered on the panel found on its solve, a
 * note that sends her looking found only at its bookmark; a closed task finds nothing; 3 stars once per note;
 * `save.notes` in the order found. The game is a stand-in (`NotesEnv`): no scene, panel or page.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./fx', () => ({ glowTex: null, Sparks: class {} }));
import * as THREE from 'three';
import { defaultSave, type Save } from '../core/save';
import { mulberry32 } from '../core/util';
import { NOTE_IDS, type NoteId } from '../s2/strings-book';
import { NOTES } from '../s2/notes';
import { NOTE_PLACES as FAIRY } from '../worlds/fairy/notes';
import { NOTE_PLACES as FOREST } from '../worlds/forest/notes';
import { NOTE_FIND_R, SEARCH_NOTES, createNotes, notesShown, type NotePlace, type NotesEnv } from './notes-find';
import { bookmarkGeometry, scrollGeometry } from './notes-world';
import type { NoteSpec } from './tasks/note';
import type { TaskResult } from './taskviews/panel';

const SOLVED: TaskResult = { solved: true, wrong: 0 };
const CLOSED: TaskResult = { solved: false, wrong: 0 };
const met = (english = true): Save => { const s = defaultSave(); s.pip.met = true; s.english = english; return s; };

function rig(places: readonly NotePlace[] = [...FAIRY, ...FOREST], save = met()) {
  const log: string[] = [], results: TaskResult[] = [];
  let stars = 0;
  const env: NotesEnv = {
    save, places, rng: mulberry32(5),
    scene: async (_name, _p, body) => { await body(); return true; },
    panel: (spec: NoteSpec) => { log.push(`panel ${spec.body.id} ${spec.level}`); return Promise.resolve(results.shift() ?? SOLVED); },
    reward: () => { stars += 3; log.push('stars 3'); },
    persist: () => { log.push('persist'); },
  };
  return { env, save, log, results, notes: createNotes(env), stars: () => stars };
}
const placeOf = (id: NoteId) => [...FAIRY, ...FOREST].find((p) => p.id === id)!;
const PANEL_NOTES = NOTE_IDS.filter((id) => !SEARCH_NOTES.includes(id));

describe('the places of the notes', () => {
  it('all eight are placed, once each: 1-4 in the valley of the fairies, 5-8 in the forest', () => {
    expect([...FAIRY, ...FOREST].map((p) => p.id)).toEqual([...NOTE_IDS]);
    expect(FAIRY.map((p) => p.id)).toEqual(['note_1', 'note_2', 'note_3', 'note_4']);
    expect(FOREST.map((p) => p.id)).toEqual(['note_5', 'note_6', 'note_7', 'note_8']);
  });

  it('those that send her looking (layout §3: №2, 4, 5, 7) have a bookmark, the others are answered on the panel', () => {
    expect([...SEARCH_NOTES]).toEqual(['note_2', 'note_4', 'note_5', 'note_7']);
    expect([...FAIRY, ...FOREST].filter((p) => p.find).map((p) => p.id)).toEqual([...SEARCH_NOTES]);
    // the panel ones: the picture of №1, the pebbles of №3, the riddle of №6, the sum of №8
    expect(PANEL_NOTES).toEqual(['note_1', 'note_3', 'note_6', 'note_8']);
    expect(PANEL_NOTES.map((id) => NOTES[id].q.ask)).toEqual(['picture', 'pebbles', 'picture', 'number']);
  });
});

describe('a note in the world', () => {
  it('lies there only once Pip is met - with English off as well: the subject is reading', () => {
    const fresh = defaultSave();
    expect(notesShown(fresh, FAIRY)).toEqual([]);
    expect(notesShown(met(), FAIRY)).toEqual(['note_1', 'note_2', 'note_3', 'note_4']);
    expect(notesShown(met(false), FOREST)).toEqual(['note_5', 'note_6', 'note_7', 'note_8']);
  });

  it('not met: a tap opens nothing', async () => {
    const r = rig(FAIRY, defaultSave());
    await r.notes.open('note_1');
    expect(r.log).toEqual([]);
    expect(r.save.notes).toEqual([]);
  });

  it('a note answered on the panel: its own task on the level of reading; solved - found, 3 stars, recorded to reading, gone', async () => {
    for (const id of PANEL_NOTES) {
      const r = rig();
      r.save.skills.read = { ...(r.save.skills.read ?? { level: 1, tasks: 0, errors: 0 }), level: 4 } as Save['skills']['read'];
      const before = r.save.skills.read?.tasks ?? 0;
      await r.notes.open(id);
      expect(r.log[0]).toBe(`panel ${id} 4`);
      expect(r.save.notes).toEqual([id]);
      expect(r.stars()).toBe(3);
      expect(r.save.skills.read!.tasks).toBe(before + 1);
      expect(r.notes.shown()).not.toContain(id);
      expect(r.notes.waiting()).toBeNull();
    }
  });

  it('a note that sends her looking: solved - not found yet, its bookmark waits; walking up to it finds it', async () => {
    for (const id of SEARCH_NOTES) {
      const r = rig(), f = placeOf(id).find!;
      await r.notes.open(id);
      expect(r.save.notes).toEqual([]);
      expect(r.stars()).toBe(0);
      expect(r.notes.waiting()).toBe(id);
      expect(r.notes.shown()).toContain(id);
      // not at it, or not walking by herself: nothing
      r.notes.update({ x: f.x + NOTE_FIND_R + 0.2, z: f.z }, true);
      r.notes.update({ x: f.x, z: f.z }, false);
      expect(r.save.notes).toEqual([]);
      r.notes.update({ x: f.x + NOTE_FIND_R - 0.2, z: f.z }, true);
      expect(r.save.notes).toEqual([id]);
      expect(r.stars()).toBe(3);
      expect(r.notes.waiting()).toBeNull();
      expect(r.notes.shown()).not.toContain(id);
    }
  });

  it('closed: nothing - not found, no stars, no bookmark, the note stays and is read again', async () => {
    for (const id of NOTE_IDS) {
      const r = rig();
      r.results.push(CLOSED);
      await r.notes.open(id);
      expect([r.save.notes, r.stars(), r.notes.waiting()]).toEqual([[], 0, null]);
      expect(r.notes.shown()).toContain(id);
      expect(r.save.skills.read?.tasks ?? 0).toBe(0);
      await r.notes.open(id);
      expect(r.log.filter((l) => l.startsWith('panel'))).toHaveLength(2);
    }
  });

  it('3 stars once per note: a found note is not shown, a tap and its bookmark give nothing again', async () => {
    const r = rig();
    await r.notes.open('note_1');
    await r.notes.open('note_1');
    expect(r.log.filter((l) => l.startsWith('panel'))).toHaveLength(1);
    await r.notes.open('note_2');
    const f = placeOf('note_2').find!;
    r.notes.update(f, true); r.notes.update(f, true);
    expect(r.notes.reach('note_2')).toBe(false);
    expect(r.stars()).toBe(6);
    expect(r.save.notes).toEqual(['note_1', 'note_2']);
    // a note found from the save (another visit) is not in the world
    const again = rig(undefined, Object.assign(met(), { notes: ['note_3'] }));
    expect(again.notes.shown()).not.toContain('note_3');
    await again.notes.open('note_3');
    expect([again.log, again.stars()]).toEqual([[], 0]);
  });

  it('save.notes in the order found, whatever the order of the world', async () => {
    const r = rig();
    for (const id of ['note_8', 'note_3', 'note_6', 'note_1'] as const) await r.notes.open(id);
    await r.notes.open('note_7');
    expect(r.notes.reach('note_7')).toBe(true);
    await r.notes.open('note_5');
    r.notes.update(placeOf('note_5').find!, true);
    expect(r.save.notes).toEqual(['note_8', 'note_3', 'note_6', 'note_1', 'note_7', 'note_5']);
    expect(r.stars()).toBe(18);
  });

  it('the bookmark waits for one note at a time, in the session only: a new rig (a reload) has none', async () => {
    const r = rig();
    await r.notes.open('note_2');
    await r.notes.open('note_4');
    expect(r.notes.waiting()).toBe('note_4');
    r.notes.update(placeOf('note_2').find!, true);
    expect(r.save.notes).toEqual([]);
    expect(createNotes(r.env).waiting()).toBeNull();
    // and the save keeps its shape: nothing of the bookmark in it (the answer of reading is noted by type only)
    expect(JSON.stringify(r.save)).not.toMatch(/note_[24]/);
  });

  it('a tap while a note is open opens no second one', async () => {
    const r = rig();
    let settle!: (x: TaskResult) => void;
    r.env.panel = (spec) => { r.log.push(`panel ${spec.body.id}`); return new Promise((s) => { settle = s; }); };
    const first = r.notes.open('note_1');
    expect(r.notes.opening()).toBe(true);
    await r.notes.open('note_3');
    settle(SOLVED); await first;
    expect(r.log.filter((l) => l.startsWith('panel'))).toEqual(['panel note_1']);
    expect(r.notes.opening()).toBe(false);
  });
});

describe('the shapes of the notes', () => {
  it('the paper with its ribbon is one geometry, painted; the bookmark another: two meshes at most for a world', () => {
    for (const g of [scrollGeometry(), bookmarkGeometry()]) {
      expect(g.getAttribute('color')).toBeDefined();
      expect(g.groups.length).toBe(0);
      expect(g.getAttribute('position').count).toBeLessThan(400);
    }
    const box = new THREE.Box3().setFromBufferAttribute(scrollGeometry().getAttribute('position') as THREE.BufferAttribute);
    expect(Math.abs(box.min.y)).toBeLessThan(0.01);       // on the ground (its facets a few mm off the round)
  });

  it('the world gives 3 stars a note with the number written in its call (src/game/no-penalties.test.ts reads it), and no shadow', () => {
    const src = (import.meta.glob('./notes-world.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['./notes-world.ts'];
    expect(src.match(/addStars\(/g)).toHaveLength(1);
    expect(src).toMatch(/g\.addStars\(3, /);
    expect(src).toMatch(/mesh\.castShadow = false/);
    expect(src).toMatch(/bookmark\.castShadow = false/);
  });
});
