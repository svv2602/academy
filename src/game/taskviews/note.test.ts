// @vitest-environment happy-dom
/**
 * "Read the note" (Season 2, step 2, part D2; layout §3; the lead's decisions of 2026-11-27, Q1-Q4): the eight notes,
 * what each asks on the panel, the Ukrainian text whatever the language of the game (R08), a hint said by nobody until
 * rung 3, the sum of the nuts noted for adding as well with only reading moving its level, and nothing "found" from the
 * panel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spoken } from '../../core/audio';
import { createRng } from '../../core/rng';
import { defaultSave } from '../../core/save';
import { NOTE_IDS, NOTE_TEXTS, noteTextOk } from '../../s2/strings-book';
import { NOTES, PINK } from '../../s2/notes';
import { strings } from '../../s2/strings-tasks';
import { setLang, type Key } from '../../ui/strings';
import { recordTask } from '../skills';
import { createPlanner, sameness } from '../planner';
import { choicesAt, generate, noteExample, notesFor } from '../tasks/note';
import type { ScreenAsk } from '../tasks/types';
import { SKILL, cheatTask, showTask, type TaskHooks } from './panel';
import { WORD_MS } from './note';
import { WON_MAX_MS } from './fly';
import { SHAKE_MS } from './flow';

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; setLang('uk'); });

const stage = () => document.getElementById('taskStage')!;
const tap = (e: Element) => { e.dispatchEvent(new PointerEvent('pointerdown')); };
function listen() {
  const heard = { prompts: [] as Key[], screens: [] as ScreenAsk[], hints: [] as Key[] };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: TaskHooks = {
    prompt: (k) => { heard.prompts.push(k); }, screen: (a) => { heard.screens.push(a); },
    number: () => {}, good: () => {}, wrong: quick, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}

describe('the notes (layout §3)', () => {
  it('trains reading', () => { expect(SKILL.note).toBe('read'); });

  it('each of the eight has its level, its key words in its text, numbers in words and no name', () => {
    expect(Object.keys(NOTES)).toEqual([...NOTE_IDS]);
    expect(NOTE_IDS.map((id) => NOTES[id].level)).toEqual([1, 2, 3, 4, 3, 5, 4, 5]);
    for (const id of NOTE_IDS) {
      const { uk, ru } = NOTE_TEXTS[id];
      expect(noteTextOk(uk) && noteTextOk(ru), id).toBe(true);
      expect(uk, id).not.toMatch(/[0-9]/);
      const words = uk.split(/[\s.,!?«»—]+/);
      for (const k of NOTES[id].key) expect(words, `${id}: «${k}»`).toContain(k);
    }
  });

  it('what each asks (Q2): a picture to №1, 2, 4, 5, 7, the pink pebbles of №3, the riddle of №6, the sum of №8', () => {
    expect(NOTE_IDS.map((id) => NOTES[id].q.ask)).toEqual(['picture', 'picture', 'pebbles', 'picture', 'picture', 'picture', 'picture', 'number']);
    const q8 = NOTES.note_8.q;
    expect(q8.ask === 'number' && [q8.right, q8.also]).toEqual([4, 'add']);
    const q6 = NOTES.note_6.q;
    expect(q6.ask === 'picture' && [q6.right, ...q6.wrong]).toEqual(['🏞️', '🍄', '🦉']);
  });

  it('a note of the level or below; level 1 shares the notes of level 2, so none comes twice in a row', () => {
    expect(notesFor(1)).toEqual(['note_1', 'note_2']);
    expect(notesFor(3)).toEqual(['note_1', 'note_2', 'note_3', 'note_5']);
    expect(notesFor(5)).toEqual([...NOTE_IDS]);
  });

  it.each([1, 2, 3, 4, 5])('level %i: the right answer once among the choices, the pebbles 3-5 pink with the count of all among the answers', (level) => {
    for (let i = 0; i < 200; i++) {
      const s = generate(level, createRng(`n${level}-${i}`)), b = s.body, q = NOTES[b.id].q;
      expect(notesFor(level)).toContain(b.id);
      expect(new Set(b.options).size).toBe(b.options.length);
      expect([s.prompt, s.screen]).toEqual([null, { key: 'q_note', en: [] }]);
      if (q.ask === 'picture') {
        expect(b.options).toHaveLength(Math.min(choicesAt(level), 1 + q.wrong.length));
        expect(b.options[b.answer]).toBe(q.right);
      } else if (q.ask === 'pebbles') {
        const pink = b.pebbles!.filter((c) => c === PINK).length;
        expect(pink).toBeGreaterThanOrEqual(3); expect(pink).toBeLessThanOrEqual(5);
        expect(b.pebbles!.length - pink).toBeGreaterThanOrEqual(3);
        expect(b.options).toHaveLength(4);
        expect(b.options[b.answer]).toBe(pink);
        expect(b.options).toContain(b.pebbles!.length);
      } else expect(b.options[b.answer]).toBe(4);
    }
  });
});

describe('the note on the panel', () => {
  it('is asked on the screen only: nothing said, no English (Q1)', () => {
    const { hooks, heard } = listen();
    void showTask(noteExample(3, 'note_5', createRng('a')), hooks);
    expect(heard.prompts).toEqual([]);
    expect(heard.screens).toEqual([{ key: 'q_note', en: [] }]);
    // its lines are on the screen, never spoken: no clip is asked for them, the synthesizer never gets them
    for (const k of ['q_note', 'h2_note']) {
      expect(Object.keys(strings.table.uk)).toContain(k);
      expect(Object.keys(strings.spoken)).not.toContain(k);
    }
  });

  it('is read in Ukrainian whatever the language of the game; with the Russian one its translation is a caption (R08)', () => {
    const { hooks } = listen();
    void showTask(noteExample(3, 'note_1', createRng('uk')), hooks);
    expect(stage().querySelector('.note-read')!.textContent).toBe(NOTE_TEXTS.note_1.uk);
    expect(stage().querySelector('.note-ru')).toBeNull();
    setLang('ru');
    void showTask(noteExample(3, 'note_1', createRng('ru')), hooks);
    expect(stage().querySelector('.note-read')!.textContent).toBe(NOTE_TEXTS.note_1.uk);
    expect(stage().querySelector('.note-ru')!.textContent).toBe(NOTE_TEXTS.note_1.ru);
  });

  it('the hint: rung 1 lights the words one by one, rung 2 shows "read slowly" and the key words, rung 3 says "look at what glows" and pulses the answer', async () => {
    const { hooks, heard } = listen();
    const spec = noteExample(4, 'note_7', createRng('h'));
    void showTask(spec, hooks);
    const pics = [...stage().querySelectorAll<HTMLElement>('.note-pic')];
    const right = pics[spec.body.answer], wrongs = pics.filter((p) => p !== right);
    const words = [...stage().querySelectorAll<HTMLElement>('.note-w')];
    tap(wrongs[0]); await vi.advanceTimersByTimeAsync(SHAKE_MS + 10);
    expect(heard.hints).toEqual([]);
    expect(words[0].classList.contains('lit')).toBe(true);
    await vi.advanceTimersByTimeAsync(WORD_MS);
    expect([words[0].classList.contains('lit'), words[1].classList.contains('lit')]).toEqual([false, true]);
    await vi.advanceTimersByTimeAsync(WORD_MS * words.length);
    expect(stage().querySelector('.lit')).toBeNull();
    expect(stage().querySelector('.key, .pulse')).toBeNull();

    tap(wrongs[1]); await vi.advanceTimersByTimeAsync(SHAKE_MS + 10);
    expect(heard.hints).toEqual([]);
    expect(heard.screens.at(-1)).toEqual({ key: 'h2_note', en: [] });
    expect([...stage().querySelectorAll('.key')].map((e) => e.textContent)).toEqual(['Сова', 'вгору.']);
    expect(right.classList.contains('pulse')).toBe(false);

    tap(wrongs[2]); await vi.advanceTimersByTimeAsync(SHAKE_MS + 10);
    expect(heard.hints).toEqual(['h3_show']);
    expect(right.classList.contains('pulse')).toBe(true);
  });

  it('a number to choose for the pebbles and the nuts; solved, the task ends', async () => {
    const { hooks } = listen();
    const spec = noteExample(5, 'note_8', createRng('n'));
    const done = showTask(spec, hooks);
    expect([...document.querySelectorAll('#taskOpts .opt')].map((b) => b.textContent)).toEqual(['1', '3', '4', '5']);
    cheatTask();
    await vi.advanceTimersByTimeAsync(WON_MAX_MS);
    expect(await done).toEqual({ solved: true, wrong: 0 });
  });
});

describe('the note and the save', () => {
  it('the nuts of №8: noted for adding as well, only reading moves its level (layout §4.2)', async () => {
    const save = defaultSave(), plan = createPlanner(save), { hooks } = listen();
    const add = save.skills.add?.level, read = save.skills.read?.level;
    const res = await (async () => {
      const spec = noteExample(5, 'note_8', createRng('8'));
      const run = showTask(spec, hooks);
      cheatTask(); await vi.advanceTimersByTimeAsync(WON_MAX_MS);
      const r = await run; plan.done(spec, r); return r;
    })();
    recordTask(save, SKILL.note, res.wrong, false, { type: 'note' });   // what the caller does with the task's skill
    expect(save.answers?.add?.map((a) => [a.t, a.ok])).toEqual([['note', 1]]);
    expect(save.answers?.read?.map((a) => a.t)).toEqual(['note']);
    expect(save.skills.add?.level).toBe(add);
    expect(save.skills.read?.level).not.toBe(read);
  });

  it('another note is noted for reading only', () => {
    const save = defaultSave(), plan = createPlanner(save);
    plan.done(noteExample(3, 'note_3', createRng('3')), { solved: true, wrong: 0 });
    expect(save.answers?.add).toBeUndefined();
  });

  it('a note answered on the panel is not found: the book gets it in the world (Q4)', () => {
    const save = defaultSave(), plan = createPlanner(save);
    for (const id of NOTE_IDS) plan.done(noteExample(5, id, createRng(id)), { solved: true, wrong: 0 });
    expect(save.notes).toEqual([]);
  });

  it('a note read with mistakes comes back, built anew on its level', () => {
    const save = defaultSave(), plan = createPlanner(save), rng = createRng('k');
    const s = noteExample(4, 'note_4', rng);
    plan.done(s, { solved: true, wrong: 2 });
    expect(save.hard.list.map((h) => h.k)).toEqual(['note:note_4']);
    for (let i = 0; i < 3; i++) plan.done(plan.next('count', 1, rng), { solved: true, wrong: 0 });
    const again = plan.next('note', 4, rng);
    expect([sameness(again), again.level]).toEqual(['note:note_4', 4]);
  });
});
