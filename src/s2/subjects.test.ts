import { describe, expect, it } from 'vitest';
import { SUBJECT_OF, newSubjectKinds, noteSubject, pickSubject } from './subjects';
import { BASE_SHARES, actualShares, targetShares } from './shares';
import { RECENT_KEPT, SUBJECTS, type Share, type Subject } from './types';
import { MODELS } from '../game/tasks/index';
import { SKILL } from '../game/taskviews/panel';
import { defaultSave } from '../core/save';

const ALL: readonly Subject[] = SUBJECTS;
const steps = (s: Partial<Record<Subject, Share>>, english = true) => targetShares({ shares: { math: 1, logic: 1, en: 1, read: 1, ...s }, english });
const count = (xs: readonly Subject[], k: Subject) => xs.filter((x) => x === k).length;

/** `n` picks one after the other, each noted in the ring: the picks, and the ring after each of them once it is full. */
function play(shares: Record<Subject, number>, available: (i: number) => readonly Subject[], n = 2000, start: Subject[] = []) {
  const save = { recent: [...start] };
  const picks: Subject[] = [], rings: Subject[][] = [];
  for (let i = 0; i < n; i++) {
    const k = pickSubject(save.recent, shares, available(i));
    picks.push(k);
    noteSubject(save, k);
    if (save.recent.length === RECENT_KEPT) rings.push([...save.recent]);
  }
  return { picks, rings };
}

describe('the subject of every kind of task (layout §4)', () => {
  it('every kind has its subject: 14 of mathematics, 7 of logic and memory, 2 of English, 1 of reading', () => {
    expect(Object.keys(SUBJECT_OF).sort()).toEqual(Object.keys(MODELS).sort());
    const of = (s: Subject) => Object.keys(SUBJECT_OF).filter((t) => SUBJECT_OF[t as keyof typeof SUBJECT_OF] === s).sort();
    expect(of('math')).toEqual(['add', 'chain', 'compare', 'count', 'exprs', 'gap', 'house', 'missing', 'neighbors', 'order', 'signs', 'story', 'sub', 'sum3']);
    expect(of('logic')).toEqual(['diff', 'odd', 'pairs', 'pattern', 'puzzle', 'simon', 'sort']);
    expect(of('en')).toEqual(['en_count', 'en_tap']);
    expect(of('read')).toEqual(['note']);
  });

  it('a task of two subjects is of its first: counting in English is English, the note with the nuts is reading', () => {
    expect([SUBJECT_OF.en_count, SUBJECT_OF.note]).toEqual(['en', 'read']);
  });

  it('the skills of English belong to English and reading to reading: no kind of a new skill is counted as mathematics', () => {
    for (const [type, skill] of Object.entries(SKILL)) {
      const s = SUBJECT_OF[type as keyof typeof SUBJECT_OF];
      if (skill.startsWith('en_')) expect(s, type).toBe('en');
      else if (skill === 'read') expect(s, type).toBe('read');
      else expect(['math', 'logic'], type).toContain(s);
    }
  });
});

describe('the kinds of the new subjects a place of replays may give (R33)', () => {
  const save = (met: boolean, english: boolean) => ({ pip: { met, pieces: [], cap: 'purple' as const }, english });

  it('none before Pip is met, with English on or off', () => {
    expect(newSubjectKinds(save(false, true))).toEqual([]);
    expect(newSubjectKinds(save(false, false))).toEqual([]);
  });

  it('Pip met: the two English kinds of the panel and the note; English off - the note alone', () => {
    expect(newSubjectKinds(save(true, true))).toEqual(['en_tap', 'en_count', 'note']);
    expect(newSubjectKinds(save(true, false))).toEqual(['note']);
  });

  it('a new save gives none: Pip is not met yet', () => {
    expect(newSubjectKinds(defaultSave())).toEqual([]);
  });
});

describe('the ring of the last subjects (save.recent)', () => {
  it('a subject is added at the end; over RECENT_KEPT the oldest go', () => {
    const save = { recent: [] as Subject[] };
    noteSubject(save, 'math');
    noteSubject(save, 'en');
    expect(save.recent).toEqual(['math', 'en']);
    for (let i = 0; i < RECENT_KEPT; i++) noteSubject(save, 'logic');
    expect(save.recent).toHaveLength(RECENT_KEPT);
    expect(save.recent).toEqual(Array(RECENT_KEPT).fill('logic'));
    noteSubject(save, 'read');
    expect(save.recent).toHaveLength(RECENT_KEPT);
    expect(save.recent.slice(-2)).toEqual(['logic', 'read']);
  });

  it('a ring that came longer (a damaged save) is cut to RECENT_KEPT, the same array kept', () => {
    const recent = Array<Subject>(RECENT_KEPT + 7).fill('math');
    const save = { recent };
    noteSubject(save, 'en');
    expect(save.recent).toBe(recent);
    expect(save.recent).toHaveLength(RECENT_KEPT);
    expect(save.recent[RECENT_KEPT - 1]).toBe('en');
  });
});

describe('which subject comes next (layout §4.2-4.3)', () => {
  it('2000 picks with every subject to be had: never two of one subject in a row', () => {
    const { picks } = play(steps({}), () => ALL);
    for (let i = 1; i < picks.length; i++) expect(picks[i], `pick ${i}`).not.toBe(picks[i - 1]);
  });

  it('the shares 45 / 25 / 15 / 15: every 20 tasks in a row hold 9, 5, 3 and 3 of them, give or take one', () => {
    const shares = steps({});
    expect(shares).toEqual(BASE_SHARES);
    const { rings } = play(shares, () => ALL);
    expect(rings.length).toBe(2000 - RECENT_KEPT + 1);
    for (const ring of rings) for (const k of ALL) expect(Math.abs(count(ring, k) - shares[k] * RECENT_KEPT), `${k} in ${ring.join(' ')}`).toBeLessThanOrEqual(1);
    // and on the whole they are met exactly
    const last = rings[rings.length - 1];
    expect(ALL.map((k) => count(last, k))).toEqual([9, 5, 3, 3]);
  });

  it('English turned off: no English task in 2000, though the place has it; the other three share the tasks', () => {
    const shares = steps({}, false);
    expect(shares.en).toBe(0);
    const { picks, rings } = play(shares, () => ALL);
    expect(count(picks, 'en')).toBe(0);
    for (const ring of rings) for (const k of ALL) expect(Math.abs(count(ring, k) - shares[k] * RECENT_KEPT), k).toBeLessThanOrEqual(1);
  });

  it('the parent\'s steps move the shares: more English and less mathematics give more English tasks than mathematics', () => {
    const shares = steps({ math: 0.5, en: 1.5 });
    const { rings } = play(shares, () => ALL);
    for (const ring of rings) for (const k of ALL) expect(Math.abs(count(ring, k) - shares[k] * RECENT_KEPT), k).toBeLessThanOrEqual(1);
    const base = play(steps({}), () => ALL).rings.at(-1)!, moved = rings.at(-1)!;
    expect(count(moved, 'en')).toBeGreaterThan(count(base, 'en'));
    expect(count(moved, 'math')).toBeLessThan(count(base, 'math'));
  });

  it('more of one subject (x1.5) and less of another (x0.5), each alone: its tasks follow, the row is still mixed', () => {
    for (const k of ALL) {
      for (const step of [0.5, 1.5] as const) {
        const shares = steps({ [k]: step });
        const { picks, rings } = play(shares, () => ALL);
        for (let i = 1; i < picks.length; i++) expect(picks[i], `${k} x${step}, pick ${i}`).not.toBe(picks[i - 1]);
        // mathematics x1.5 asks for 11 of 20 - over a half, which the rule of the row forbids: it gets 10
        const want = Math.min(shares[k] * RECENT_KEPT, RECENT_KEPT / 2);
        for (const ring of rings) expect(Math.abs(count(ring, k) - want), `${k} x${step}`).toBeLessThanOrEqual(1.05);
      }
    }
  });

  it('a share over a half cannot be met: the rule of the row comes first, the subject gets every other task', () => {
    const shares = steps({ math: 1.5, logic: 0.5, en: 0.5, read: 0.5 });
    expect(shares.math).toBeGreaterThan(0.7);
    const { picks, rings } = play(shares, () => ALL);
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
    expect(count(rings.at(-1)!, 'math')).toBe(RECENT_KEPT / 2);
  });

  it('only the subjects of the place are given; a place of one subject gives it again and again', () => {
    const shares = steps({});
    expect(new Set(play(shares, () => ['math', 'read'], 200).picks)).toEqual(new Set(['math', 'read']));
    expect(new Set(play(shares, () => ['logic'], 50).picks)).toEqual(new Set(['logic']));
    // two subjects to be had: they alternate, whatever their shares
    const two = play(shares, () => ['math', 'en'], 200).picks;
    for (let i = 1; i < two.length; i++) expect(two[i]).not.toBe(two[i - 1]);
  });

  it('places of different subjects in turn: never two in a row where the place had another one', () => {
    const places: Subject[][] = [['math'], ['math', 'logic'], ['math', 'en', 'read'], ['logic', 'en', 'read'], [...ALL], ['en']];
    const at = (i: number) => places[(i * 7 + (i >> 2)) % places.length];
    const { picks } = play(steps({}), at);
    for (let i = 1; i < picks.length; i++) {
      expect(at(i), `pick ${i}`).toContain(picks[i]);
      if (at(i).some((k) => k !== picks[i - 1])) expect(picks[i], `pick ${i}`).not.toBe(picks[i - 1]);
    }
  });

  it('the subject furthest behind its share comes: after ten tasks of mathematics and logic - English or reading', () => {
    const recent: Subject[] = ['math', 'logic', 'math', 'logic', 'math', 'logic', 'math', 'logic', 'math', 'logic'];
    expect(pickSubject(recent, steps({}), ALL)).toBe('en');             // English and reading alike behind: the first of SUBJECTS
    expect(pickSubject([...recent, 'en'], steps({}), ALL)).toBe('read');
    expect(pickSubject(recent, steps({}), ['math', 'logic', 'read'])).toBe('read');
    expect(pickSubject(recent, steps({}), ['math', 'logic'])).toBe('math');   // logic was the last one
  });

  it('nothing played yet: the subject of the largest share; the order the place names its subjects in does not matter', () => {
    expect(pickSubject([], steps({}), ALL)).toBe('math');
    expect(pickSubject([], steps({}), ['read', 'en', 'logic'])).toBe('logic');
    expect(pickSubject([], steps({}), ['read', 'en'])).toBe('en');
    expect(pickSubject([], steps({}), ['en', 'read'])).toBe('en');
    expect(pickSubject(['math'], steps({}), ['read', 'math', 'logic'])).toBe(pickSubject(['math'], steps({}), ['logic', 'math', 'read']));
  });

  it('only the last RECENT_KEPT - 1 tasks are weighed: what is older leaves the ring with this task', () => {
    // the oldest of the 20 is of mathematics: counted, mathematics would stand at 9 of its 9 and logic would come
    const ring: Subject[] = ['math', ...play(steps({}), () => ALL, 19, ['en']).picks];
    expect(ring).toHaveLength(RECENT_KEPT);
    const next = pickSubject(ring, steps({}), ALL), without = pickSubject(ring.slice(1), steps({}), ALL);
    expect(next).toBe(without);
  });

  it('a subject turned off is given only where the place has nothing else', () => {
    const off = steps({}, false);
    expect(pickSubject(['math'], off, ['en', 'math'])).toBe('math');     // rather mathematics again than English turned off
    expect(pickSubject([], off, ['en'])).toBe('en');
  });

  it('a place of no subject is a mistake of the caller: it throws', () => {
    expect(() => pickSubject([], steps({}), [])).toThrow(/no subject/);
  });

  it('it draws nothing and changes nothing: the same ring, the same pick', () => {
    const recent: Subject[] = ['math', 'en', 'math'];
    const copy = [...recent];
    expect(pickSubject(recent, steps({}), ALL)).toBe(pickSubject(recent, steps({}), ALL));
    expect(recent).toEqual(copy);
  });

  it('what the parents see follows what is aimed at: after 2000 tasks the shares played are the shares set', () => {
    const shares = steps({ logic: 1.5 });
    const { rings } = play(shares, () => ALL);
    const now = actualShares(rings.at(-1)!);
    for (const k of ALL) expect(Math.abs(now[k] - shares[k]), k).toBeLessThanOrEqual(1 / RECENT_KEPT + 1e-9);
  });
});
