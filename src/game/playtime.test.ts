// @vitest-environment happy-dom
/**
 * The minutes played by day (R33) and the parents' section that shows them with the skills (PLAY-15, LEARN-15).
 * The section is tested here, by its markup and its buttons, because it is where the minutes are read.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { defaultSave } from '../core/save';
import { KEEP_DAYS, dayKey, lastDays, tickPlayTime } from './playtime';
import { LATE_SKILLS, LEVELS, SKILLS as ALL_SKILLS } from './skills';
/** The skills the parents' section lists for a save with no task of a late skill (attention) yet. */
const SKILLS = ALL_SKILLS.filter((k) => !LATE_SKILLS.includes(k));

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const play = () => ({ playMinutes: {} as Record<string, number> });

describe('the minutes played by day (R33)', () => {
  it('a seen frame adds its time to the local date of today', () => {
    const s = play();
    for (let i = 0; i < 90; i++) tickPlayTime(s, 2, true, at(2026, 11, 16, 10));
    expect(Object.keys(s.playMinutes)).toEqual(['2026-11-16']);
    expect(s.playMinutes['2026-11-16']).toBeCloseTo(3, 9);
  });

  it('a frame of a hidden page adds nothing', () => {
    const s = play();
    tickPlayTime(s, 30, false, at(2026, 11, 16));
    tickPlayTime(s, 60, true, at(2026, 11, 16));
    tickPlayTime(s, 600, false, at(2026, 11, 16));
    expect(s.playMinutes).toEqual({ '2026-11-16': 1 });
  });

  it('the day changes at local midnight', () => {
    const s = play();
    tickPlayTime(s, 60, true, new Date(2026, 10, 16, 23, 59, 59).getTime());
    tickPlayTime(s, 120, true, new Date(2026, 10, 17, 0, 0, 1).getTime());
    expect(s.playMinutes).toEqual({ '2026-11-16': 1, '2026-11-17': 2 });
    expect(dayKey(new Date(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05');
  });

  it('keeps only the last seven days: the eighth and older are dropped, a damaged day starts at 0', () => {
    const s = { playMinutes: { '2026-11-09': 5, '2026-11-10': 7, '2026-11-15': 4, '2026-12-01': 9, junk: 1, '2026-11-14': 'x' as unknown as number } };
    tickPlayTime(s, 60, true, at(2026, 11, 16));
    expect(s.playMinutes).toEqual({ '2026-11-10': 7, '2026-11-15': 4, '2026-11-16': 1 });
    expect(Object.keys(s.playMinutes).length).toBeLessThanOrEqual(KEEP_DAYS);
  });

  it('a week of play never keeps more than seven days', () => {
    const s = play();
    for (let d = 1; d <= 20; d++) tickPlayTime(s, 600, true, at(2026, 11, d));
    expect(Object.keys(s.playMinutes).sort()).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
  });

  it('lastDays gives seven days, today last, the days not played as 0 whole minutes', () => {
    const days = lastDays({ playMinutes: { '2026-11-16': 12.6, '2026-11-12': 3.2, '2026-11-01': 50 } }, at(2026, 11, 16));
    expect(days.map((d) => d.key)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']);
    expect(days.map((d) => d.minutes)).toEqual([0, 0, 3, 0, 0, 0, 13]);
    expect(days[6].weekday).toBe(1);   // 2026-11-16 is a Monday
  });

  it('the frame of the game ticks the minutes of a seen page (loop.ts)', () => {
    const loop = (import.meta.glob('./loop.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['./loop.ts'];
    expect(loop).toMatch(/\n\s*tickPlayTime\(g\.save, [^;]*!document\.hidden\);/);
  });
});

// ---------- the parents' section ----------

const IDS = ['book', 'parents', 'btnBook', 'bookClose', 'btnParents', 'btnShop', 'colTitle', 'shards', 'colStats', 'gate', 'pBody', 'pTitle', 'gateQ', 'parentsClose'];
describe('the parents\' section (PLAY-15, LEARN-15)', () => {
  const g = globalThis as Record<string, unknown>;
  beforeAll(() => { g.__BUILD_DATE__ = '2026-11-16'; g.__BUILD_COMMIT__ = 'abc1234'; });

  async function open(save = defaultSave()) {
    document.body.innerHTML = IDS.map((id) => `<div id="${id}"></div>`).join('') + '<input id="gateA">';
    const { initBook } = await import('../ui/ui');
    let changes = 0;
    initBook(save, { parts: () => [], stats: () => [] }, { change: () => { changes++; }, reset() {}, open() {}, shop() {} });
    document.getElementById('btnParents')!.click();
    const [, a, b] = /(\d+) × (\d+)/.exec(document.getElementById('gateQ')!.textContent!)!.map(Number);
    const gateA = document.getElementById('gateA') as HTMLInputElement;
    gateA.value = String(a * b); gateA.dispatchEvent(new Event('input'));
    const body = document.getElementById('pBody')!;
    return { save, body, changes: () => changes, fix: (k: string) => body.querySelector<HTMLButtonElement>(`[data-fix="${k}"]`)! };
  }

  it('lists every skill of the ladder with its level, its tasks and its share of clean solves', async () => {
    const save = defaultSave();
    save.skills.add = { level: 3, streak: 0, tasks: 8, first: 6, errors: 3 };
    const { body } = await open(save);
    const rows = [...body.querySelectorAll('.ptab tr')].filter((r) => r.querySelector('[data-fix]'));
    expect(rows.map((r) => r.querySelector('[data-fix]')!.getAttribute('data-fix'))).toEqual([...SKILLS]);
    const add = rows[1].querySelectorAll('td');
    expect([add[1].textContent, add[2].textContent, add[3].textContent]).toEqual(['Авто 3', '8', '75%']);
    expect(rows[0].querySelectorAll('td')[3].textContent).toBe('–');
  });

  it('a skill\'s button fixes that skill only: auto, then its own levels up to 5, then auto again', async () => {
    const { save, body, fix, changes } = await open();
    for (const k of SKILLS) {
      const [min, max] = LEVELS[k], seen: number[] = [];
      for (let i = 0; i <= max - min + 1; i++) { fix(k).click(); seen.push(save.fixed[k]); }
      expect(seen, k).toEqual([...Array.from({ length: max - min + 1 }, (_, i) => min + i), 0]);
    }
    fix('sub').click(); fix('sub').click();
    expect(SKILLS.filter((k) => save.fixed[k] !== 0)).toEqual(['sub']);
    expect(save.fixed.sub).toBe(2);
    expect(fix('sub').textContent).toBe('2'); expect(fix('sub').classList.contains('sel')).toBe(true);
    expect(fix('add').classList.contains('sel')).toBe(false);
    expect(changes()).toBeGreaterThan(0);
    expect(body.querySelectorAll('[data-fix]').length).toBe(SKILLS.length);
  });

  it('a level fixed for every skill by an older save steps on from the level the skill plays', async () => {
    const save = defaultSave();
    save.fixed.compose = 1;
    const { fix } = await open(save);
    expect(fix('compose').textContent).toBe('3');
    fix('compose').click();
    expect(save.fixed.compose).toBe(4);
  });

  it('shows the minutes of the last seven days, today last, and that there are no hardest examples yet', async () => {
    const save = defaultSave();
    save.playMinutes[dayKey(new Date())] = 7.4;
    const { body } = await open(save);
    const days = [...body.querySelectorAll('.pdays span')];
    expect(days.length).toBe(7);
    expect(days[6].textContent).toMatch(/7 (хв|мин)$/);
    expect(days.slice(0, 6).every((d) => /^\D+0 (хв|мин)$/.test(d.textContent!))).toBe(true);
    expect(body.querySelector('.phead')!.textContent).toMatch(/7 (хв|мин)/);
    // The hardest examples themselves (LEARN-11): src/game/planner.test.ts.
    expect((body.querySelector('#pHard') as HTMLElement).hidden).toBe(false);
    expect(body.querySelector('#pHard')!.textContent).toMatch(/немає прикладів|нет примеров/);
  });
});
