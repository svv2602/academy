// @vitest-environment happy-dom
/**
 * "Listen and touch" and "how many" in English (Season 2, part D1): the pictures are of one kind, the word said is
 * among them, the question is on the screen only (the cat never says it: it has no clip, R27), the hint has no line of
 * the cat until rung 3, a word found lies in the book, a hard word comes back; every number of "how many" is English.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spoken } from '../../core/audio';
import { createRng } from '../../core/rng';
import { defaultSave } from '../../core/save';
import { setEnVoice, WORDS, type WordId } from '../../s2/types';
import { setLang, type Key } from '../../ui/strings';
import { createPlanner, sameness } from '../planner';
import { EN_KINDS, EN_TAP_WORDS, enTapExample, generate, kindOf, picturesAt } from '../tasks/en_tap';
import { generate as generateCount, numberClip } from '../tasks/en_count';
import type { ScreenAsk } from '../tasks/types';
import { SKILL, cheatTask, showTask, type TaskHooks } from './panel';
import { WON_MAX_MS } from './fly';
import { SHAKE_MS } from './flow';

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const said: string[][] = [];
beforeEach(() => {
  vi.useFakeTimers(); document.body.innerHTML = MARKUP; said.length = 0;
  setEnVoice({ say: (id) => { said.push(typeof id === 'string' ? [id] : [...id]); return Promise.resolve(); }, has: () => true });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; setEnVoice(null); setLang('uk'); });

const stage = () => document.getElementById('taskStage')!;
const pics = () => [...stage().querySelectorAll<HTMLElement>('.en-pic')];
const tap = (e: Element) => { e.dispatchEvent(new PointerEvent('pointerdown')); };
function listen() {
  const heard = { prompts: [] as Key[], screens: [] as ScreenAsk[], hints: [] as Key[], numbers: [] as number[] };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: TaskHooks = {
    prompt: (k) => { heard.prompts.push(k); }, screen: (a) => { heard.screens.push(a); void import('../../s2/types').then((m) => m.enVoice().say(a.en)); },
    number: (n) => { heard.numbers.push(n); }, good: () => {}, wrong: quick, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}

describe('"listen and touch" (en_tap)', () => {
  it('trains the English words', () => {
    expect(SKILL.en_tap).toBe('en_words');
    expect(SKILL.en_count).toBe('en_words');
  });

  it('asks only the words of the book of step 2 that a picture shows, each kind at least as big as the most pictures', () => {
    for (const w of EN_TAP_WORDS) expect(WORDS).toContain(w);
    expect(EN_TAP_WORDS).not.toContain('hello');
    for (const k of Object.values(EN_KINDS)) expect(k.length).toBeGreaterThanOrEqual(picturesAt(5));
    // the words of the sea, the Sweet Land and the sky are step 3's
    for (const w of ['fish', 'cake', 'cloud'] as WordId[]) expect(EN_TAP_WORDS).not.toContain(w);
  });

  it.each([1, 2, 3, 4, 5])('level %i: 2-4 pictures of one kind, the word said among them once', (level) => {
    for (let i = 0; i < 200; i++) {
      const s = generate(level, createRng(`k${level}-${i}`));
      expect(s.body.options).toHaveLength(picturesAt(level));
      expect(new Set(s.body.options.map(kindOf))).toEqual(new Set([s.body.kind]));
      expect(new Set(s.body.options).size).toBe(s.body.options.length);
      expect(s.body.options[s.body.answer]).toBe(s.body.word);
      expect(s.screen.en).toEqual(['wb_find', `wb_w_${s.body.word}`]);
      expect(s.prompt).toBeNull();
    }
    expect([picturesAt(1), picturesAt(2), picturesAt(3)]).toEqual([2, 3, 4]);
  });

  it('the question is shown, never said by the cat; the English voice says the frame and the word', async () => {
    const { hooks, heard } = listen();
    const spec = enTapExample(3, 'owl', createRng('owl'));
    const done = showTask(spec, hooks);
    expect(heard.prompts).toEqual([]);
    expect(heard.screens).toEqual([{ key: 'q_en_tap', en: ['wb_find', 'wb_w_owl'] }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(said).toEqual([['wb_find', 'wb_w_owl']]);
    // the button "again" says it once more
    tap(stage().querySelector('.en-again')!);
    expect(said).toHaveLength(2);
    cheatTask();
    await vi.advanceTimersByTimeAsync(WON_MAX_MS);
    expect(await done).toEqual({ solved: true, wrong: 0 });
  });

  it('the translation shows under the picture only once it is found', async () => {
    const { hooks } = listen();
    const spec = enTapExample(3, 'fox', createRng('fox'));
    void showTask(spec, hooks);
    expect(stage().textContent).not.toContain('лисиця');
    const wrong = pics().find((p) => p.dataset.word !== 'fox')!;
    tap(wrong);
    expect(stage().querySelector('.en-word')).toBeNull();
    tap(pics().find((p) => p.dataset.word === 'fox')!);
    expect(stage().querySelector('.en-word')?.textContent).toBe('лисиця');
  });

  it('the hint: rung 1 says the word again and lights nothing, rung 2 outlines the right picture, rung 3 says "look at what glows" and pulses it', async () => {
    const { hooks, heard } = listen();
    const spec = enTapExample(3, 'frog', createRng('frog'));
    void showTask(spec, hooks);
    const right = () => pics().find((p) => p.dataset.word === 'frog')!;
    const wrongs = pics().filter((p) => p.dataset.word !== 'frog');
    await vi.advanceTimersByTimeAsync(0);
    said.length = 0;
    tap(wrongs[0]); await vi.advanceTimersByTimeAsync(SHAKE_MS + 10);
    expect(said).toEqual([['wb_find', 'wb_w_frog']]);
    expect(stage().querySelector('.outline, .pulse')).toBeNull();
    expect(heard.hints).toEqual([]);
    tap(wrongs[1]); await vi.advanceTimersByTimeAsync(SHAKE_MS + 10);
    expect(right().classList.contains('outline')).toBe(true);
    expect(stage().querySelectorAll('.outline')).toHaveLength(1);
    expect(heard.hints).toEqual([]);
    tap(wrongs[2]); await vi.advanceTimersByTimeAsync(SHAKE_MS + 10);
    expect(heard.hints).toEqual(['h3_show']);
    expect(right().classList.contains('pulse')).toBe(true);
  });

  it('a word found lies in the book once; a word missed comes back as a kept example', async () => {
    const save = defaultSave(), plan = createPlanner(save), { hooks } = listen();
    const rng = createRng('book');
    const spec = plan.next('en_tap', 3, rng);
    expect(spec.type).toBe('en_tap');
    if (spec.type !== 'en_tap') return;
    const word = spec.body.word;
    plan.done(spec, { solved: true, wrong: 1 });
    expect(save.words).toEqual([word]);
    plan.done(spec, { solved: true, wrong: 0 });
    expect(save.words).toEqual([word]);
    expect(save.hard.list.map((h) => h.k)).toEqual([`en_tap:${word}`]);
    // two other tasks later the hard word is asked again, on its level
    for (let i = 0; i < 3; i++) plan.done(plan.next('count', 1, rng), { solved: true, wrong: 0 });
    const again = plan.next('en_tap', 3, rng);
    expect(sameness(again)).toBe(`en_tap:${word}`);
    void hooks;
  });

  it('a task closed or not solved puts no word in the book', () => {
    const save = defaultSave(), plan = createPlanner(save);
    plan.done(plan.next('en_tap', 1, createRng('x')), { solved: false, wrong: 0 });
    expect(save.words).toEqual([]);
  });
});

describe('"how many" in English (en_count)', () => {
  it.each([1, 2, 3, 4, 5])('level %i: 1-5 things, the digits 1-5, the recorded question of "count"', (level) => {
    for (let i = 0; i < 200; i++) {
      const s = generateCount(level, createRng(`c${level}-${i}`));
      expect(s.body.n).toBeGreaterThanOrEqual(1);
      expect(s.body.n).toBeLessThanOrEqual(5);
      expect(s.body.options).toEqual([1, 2, 3, 4, 5]);
      expect(s.prompt).toBe('t_count');
      expect(numberClip(s.body.n)).toBe(`wb_w_${['one', 'two', 'three', 'four', 'five'][s.body.n - 1]}`);
    }
  });

  it('every number is English: a thing tapped, the digit chosen, the count of the hint; never the cat\'s numbers', async () => {
    const { hooks, heard } = listen();
    const spec = generateCount(3, createRng('count-en'));
    void showTask(spec, hooks);
    const things = [...stage().querySelectorAll<HTMLElement>('.it')];
    said.length = 0;
    tap(things[0]);
    expect(said).toEqual([['wb_w_one']]);
    const wrong = [...document.querySelectorAll<HTMLElement>('#taskOpts .opt')].find((b) => Number(b.textContent) !== spec.body.n)!;
    tap(wrong);
    expect(said.at(-1)).toEqual([numberClip(Number(wrong.textContent))]);
    tap([...document.querySelectorAll<HTMLElement>('#taskOpts .opt')].find((b) => b !== wrong && Number(b.textContent) !== spec.body.n)!);
    said.length = 0;
    await vi.advanceTimersByTimeAsync(SHAKE_MS + 10);
    // rung 2: the things counted aloud in English, one by one
    expect(said).toEqual(Array.from({ length: spec.body.n }, (_, i) => [numberClip(i + 1)]));
    expect(heard.numbers).toEqual([]);
  });
});
