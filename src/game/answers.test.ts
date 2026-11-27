// @vitest-environment happy-dom
/**
 * The answers of the skills for the parents' report (src/game/answers.ts): the last ANSWERS_KEPT a skill, the sums of
 * the last SKILL_DAYS_KEPT days; the time of an answer measured by the panel without the hidden page; a damaged field
 * mended, no new version of the save.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANSWERS_KEPT, SKILL_DAYS_KEPT, defaultSave, loadSave, storeSave, type Save } from '../core/save';
import { HARD_WRONG, MS_MAX, noteAnswer, skillReport } from './answers';
import { recordTask } from './skills';

const fresh = (): Pick<Save, 'answers' | 'skillDays'> => ({});

describe('the answers of a skill', () => {
  it('keeps the last ANSWERS_KEPT, the oldest dropped; the ms within MS_MAX, none for a task in the world', () => {
    const s = fresh();
    for (let i = 0; i < ANSWERS_KEPT + 5; i++) noteAnswer(s, 'add', { type: 'add', ok: i % 2 === 0, ms: i === 0 ? 10 * MS_MAX : 1000 + i }, '2026-11-26');
    noteAnswer(s, 'add', { type: 'steps', ok: true }, '2026-11-26');
    const list = s.answers!.add;
    expect(list).toHaveLength(ANSWERS_KEPT);
    expect(list[list.length - 1]).toEqual({ t: 'steps', ok: 1, d: '2026-11-26' });
    expect(list[0]).toEqual({ t: 'add', ok: 1, ms: 1006, d: '2026-11-26' });
    // the day's sums count every answer, the timed ones apart; the first was 10 times too long - MS_MAX
    expect(s.skillDays!['2026-11-26'].add).toEqual({ n: ANSWERS_KEPT + 6, ok: 14, ms: MS_MAX + [...Array(ANSWERS_KEPT + 4)].reduce((t, _, i) => t + 1001 + i, 0), k: ANSWERS_KEPT + 5 });
  });

  it('keeps the last SKILL_DAYS_KEPT days', () => {
    const s = fresh();
    for (let d = 1; d <= SKILL_DAYS_KEPT + 3; d++) noteAnswer(s, 'sub', { type: 'sub', ok: true }, `2026-11-${String(d).padStart(2, '0')}`);
    expect(Object.keys(s.skillDays!).sort()).toEqual([...Array(SKILL_DAYS_KEPT)].map((_, i) => `2026-11-${String(i + 4).padStart(2, '0')}`));
  });

  it('recordTask writes it: right at the first try with no helper, as `first`; a task with no type writes none', () => {
    const s = defaultSave();
    recordTask(s, 'add', 0, false, { type: 'add', ms: 4000 });
    recordTask(s, 'add', 1, false, { type: 'add', ms: 9000 });
    recordTask(s, 'add', 0, true, { type: 'add' });
    recordTask(s, 'add', 0);
    expect(s.answers!.add.map((a) => [a.t, a.ok, a.ms])).toEqual([['add', 1, 4000], ['add', 0, 9000], ['add', 0, undefined]]);
    expect(s.skills.add.tasks).toBe(4);
  });
});

describe('the report of a skill', () => {
  it('the share right of the last answers, the mean time of the timed ones, the kinds with HARD_WRONG wrong answers at least', () => {
    const s = fresh(), day = '2026-11-26';
    const put = (type: string, ok: boolean, ms?: number) => noteAnswer(s, 'compare', { type, ok, ms }, day);
    for (let i = 0; i < HARD_WRONG; i++) put('signs', false, 8000);
    put('signs', true, 2000); put('compare', false, 4000); put('compare', true);
    const r = skillReport(s, 'compare', day);
    expect(r.last).toEqual([false, false, false, true, false, true]);
    expect(r.right).toBe(2);
    expect(r.meanMs).toBe((3 * 8000 + 2000 + 4000) / 5);
    expect(r.hard).toEqual(['signs']);
    expect(skillReport(s, 'add', day)).toMatchObject({ last: [], right: 0, meanMs: null, hard: [], week: { trend: null } });
  });

  it('this week against the week before: up, the same or down by a tenth; no trend without answers in both', () => {
    const s = fresh(), today = '2026-11-26';
    noteAnswer(s, 'count', { type: 'count', ok: false }, '2026-11-15');     // 11 days back: the week before
    noteAnswer(s, 'count', { type: 'count', ok: true }, '2026-11-14');
    noteAnswer(s, 'count', { type: 'count', ok: true }, '2026-11-26');      // today: this week
    noteAnswer(s, 'count', { type: 'count', ok: true }, '2026-11-20');      // 6 days back: this week still
    const r = skillReport(s, 'count', today);
    expect(r.week).toEqual({ now: { n: 2, ok: 2 }, before: { n: 2, ok: 1 }, trend: 'up' });
    expect(skillReport(s, 'count', '2026-12-20').week.trend).toBeNull();
    const t = fresh();
    noteAnswer(t, 'count', { type: 'count', ok: true }, '2026-11-26'); noteAnswer(t, 'count', { type: 'count', ok: true }, '2026-11-15');
    expect(skillReport(t, 'count', today).week.trend).toBe('same');
    noteAnswer(t, 'count', { type: 'count', ok: false }, '2026-11-25');
    expect(skillReport(t, 'count', today).week.trend).toBe('down');
  });
});

describe('the answers in the save', () => {
  afterEach(() => { localStorage.clear(); });

  it('read back as written; a damaged answer, day or count dropped; no new version', () => {
    const s = defaultSave();
    noteAnswer(s, 'add', { type: 'add', ok: true, ms: 1500 }, '2026-11-26');
    storeSave(s);
    expect(loadSave().answers).toEqual(s.answers);
    expect(loadSave().skillDays).toEqual(s.skillDays);
    const raw = JSON.parse(localStorage.getItem('amw-save')!);
    expect(raw.v).toBe(5);
    raw.answers = { add: [{ t: 'add', ok: 1, d: '2026-11-26' }, { t: 3, ok: 1, d: 'x' }, null, { t: 'sub', ok: 2, d: '2026-11-26' }], sub: 'no' };
    raw.skillDays = { '2026-11-26': { add: { n: 2, ok: 3, ms: 0, k: 0 }, sub: { n: 1, ok: 1, ms: 0, k: 0 } }, nope: {} };
    localStorage.setItem('amw-save', JSON.stringify(raw));
    const back = loadSave();
    expect(back.answers).toEqual({ add: [{ t: 'add', ok: 1, d: '2026-11-26' }] });
    expect(back.skillDays).toEqual({ '2026-11-26': { sub: { n: 1, ok: 1, ms: 0, k: 0 } } });
  });
});

describe('the time of an answer on the panel', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('from the task shown to the right answer, the hidden page left out', async () => {
    vi.useFakeTimers();
    const panel = await import('./taskviews/panel');
    document.body.innerHTML = '<div id="task" class="hidden"><div class="t-card"><div id="taskStage"></div><div id="taskOpts"></div><button id="taskClose"></button></div></div>';
    const hooks = { prompt: () => {}, wrong: async () => {}, hint: async () => {}, good: () => {} } as unknown as Parameters<typeof panel.showTask>[1];
    const spec = (await import('./tasks')).generate('add', 1, () => 0.3);
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const done = panel.showTask(spec, hooks);
    vi.advanceTimersByTime(3000);
    hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60000);
    hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(2000);
    panel.cheatTask();
    vi.advanceTimersByTime(1200);
    const res = await done;
    expect(res.solved).toBe(true);
    const a = panel.answerOf(res);
    expect(a.type).toBe('add');
    expect(a.ms).toBeGreaterThanOrEqual(4900);
    expect(a.ms).toBeLessThan(5200);
    expect(panel.answerOf({ solved: false, wrong: 0 })).toEqual({});
  });
});
