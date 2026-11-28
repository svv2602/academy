// @vitest-environment happy-dom
/**
 * The subjects of Season 2 in the parents' section (part P, layout §4.4, R07, R09): the shares 45 / 25 / 15 / 15 times
 * the parent's step, brought to a whole; English on or off; the skills of Season 2 beside them, reading English only once
 * it is open. On the page's own markup (index.html), as src/ui/session.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { SUBJECTS } from '../s2/types';
import { BASE_SHARES, actualShares, nextShare, percent, targetShares } from '../s2/shares';

const fsModule = 'node:fs';
const $ = (id: string) => document.getElementById(id)!;
let ui: typeof import('./ui');
beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.__BUILD_DATE__ = '2026-11-27'; g.__BUILD_COMMIT__ = 'abc1234';
  const { readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync: (p: string, e: 'utf8') => string };
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(readFileSync('index.html', 'utf8'))![1].replace(/<script[\s\S]*?<\/script>/g, '');
  ui = await import('./ui');
});

const near = (x: Record<string, number>) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));

describe('the shares (src/s2/shares.ts)', () => {
  it('the customer\'s 45 / 25 / 15 / 15 when nothing is changed', () => {
    expect(BASE_SHARES).toEqual({ math: 0.45, logic: 0.25, en: 0.15, read: 0.15 });
    expect(near(targetShares(defaultSave()))).toEqual(BASE_SHARES);
  });

  it('a step multiplies its subject, then all are brought back to a whole', () => {
    const s = defaultSave();
    s.shares.en = 1.5; s.shares.math = 0.5;
    // 0.225 + 0.25 + 0.225 + 0.15 = 0.85
    expect(near(targetShares(s))).toEqual({ math: 0.265, logic: 0.294, en: 0.265, read: 0.176 });
    const sum = Object.values(targetShares(s)).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('English off: its share is 0 whatever its step, the others make the whole', () => {
    const s = defaultSave();
    s.english = false; s.shares.en = 1.5;
    const t = targetShares(s);
    expect(t.en).toBe(0);
    expect(near(t)).toEqual({ math: 0.529, logic: 0.294, en: 0, read: 0.176 });
  });

  it('the share of the last tasks: every subject a key, none yet - zeros, not NaN', () => {
    expect(actualShares([])).toEqual({ math: 0, logic: 0, en: 0, read: 0 });
    expect(actualShares(['math', 'math', 'en', 'read'])).toEqual({ math: 0.5, logic: 0, en: 0.25, read: 0.25 });
    expect(Object.keys(actualShares(['logic']))).toEqual([...SUBJECTS]);
  });

  it('the button steps as it is → more → less → as it is', () => {
    expect([nextShare(1), nextShare(1.5), nextShare(0.5)]).toEqual([1.5, 0.5, 1]);
    expect(percent(0.4499)).toBe('45%');
  });
});

/** The parents' section opened past its gate, then its view of the subjects. */
function open(save: Save) {
  let changes = 0;
  ui.initBook(save, { parts: () => [], stats: () => [] }, { change: () => { changes++; }, reset() {}, open() {}, shop() {} });
  $('btnParents').click();
  const [, a, b] = /(\d+) × (\d+)/.exec($('gateQ').textContent!)!.map(Number);
  const gateA = $('gateA') as HTMLInputElement;
  gateA.value = String(a * b); gateA.dispatchEvent(new Event('input'));
  return { changes: () => changes };
}
const row = (k: string) => document.querySelector<HTMLElement>(`#pBody [data-subject="${k}"]`)!;
const aims = () => SUBJECTS.map((k) => row(k).querySelector('.paim')!.textContent);
const skillsShown = () => [...document.querySelectorAll<HTMLElement>('#pBody [data-fix]')].map((b) => b.dataset.fix);

describe('the view of the subjects', () => {
  it('opens from the section; a row a subject with its step, its aim and its share of the last tasks', () => {
    const save = defaultSave();
    save.recent = ['math', 'math', 'logic', 'en'];
    open(save);
    $('pSubj').click();
    expect(SUBJECTS.map((k) => row(k).querySelector('button')!.textContent)).toEqual(['як є', 'як є', 'як є', 'як є']);
    expect(aims()).toEqual(['45%', '25%', '15%', '15%']);
    expect(SUBJECTS.map((k) => row(k).lastElementChild!.textContent)).toEqual(['50%', '25%', '25%', '0%']);
    $('pSubjBack').click();
    expect(document.getElementById('pSubj')).not.toBeNull();
  });

  it('"more", "less", "as it is" write the save and move the aims', () => {
    const save = defaultSave(), { changes } = open(save);
    $('pSubj').click();
    const btn = () => row('en').querySelector('button')!;
    btn().click();
    expect([save.shares.en, btn().textContent]).toEqual([1.5, 'більше']);
    expect(aims()).toEqual(['42%', '23%', '21%', '14%']);
    btn().click();
    expect([save.shares.en, btn().textContent]).toEqual([0.5, 'менше']);
    btn().click();
    expect([save.shares.en, btn().textContent]).toEqual([1, 'як є']);
    expect(changes()).toBe(3);
  });

  it('English off writes the save: its aim 0, its step cannot be changed; on again, as before', () => {
    const save = defaultSave(), { changes } = open(save);
    $('pSubj').click();
    $('pEnglish').click();
    expect(save.english).toBe(false);
    expect($('pEnglish').textContent).toBe('вимкнена');
    expect(aims()).toEqual(['53%', '29%', '0%', '18%']);
    expect((row('en').querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    $('pEnglish').click();
    expect([save.english, aims()[2]]).toEqual([true, '15%']);
    expect(changes()).toBe(2);
  });

  it('the skills of Season 2 are here, not in the main tables; reading English only once it is open', () => {
    const save = defaultSave();
    save.skills.en_words.tasks = 4; save.skills.read.tasks = 2;     // played: before, they pushed into the main tables
    open(save);
    expect(skillsShown().filter((k) => ['en_words', 'en_phrases', 'en_read', 'read'].includes(k!))).toEqual([]);
    $('pSubj').click();
    expect(skillsShown()).toEqual(['en_words', 'en_phrases', 'read']);
    save.skills.en_words.level = 3;
    $('pSubjBack').click(); $('pSubj').click();
    expect(skillsShown()).toEqual(['en_words', 'en_phrases', 'en_read', 'read']);
  });

  it('a skill\'s level button fixes its level here too', () => {
    const save = defaultSave();
    open(save);
    $('pSubj').click();
    document.querySelector<HTMLElement>('#pBody [data-fix="read"]')!.click();
    expect(save.fixed.read).toBe(1);
    expect(skillsShown()).toContain('read');
  });
});
