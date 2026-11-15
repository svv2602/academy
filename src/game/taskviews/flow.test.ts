// @vitest-environment node
/**
 * The order after a mistake (ARCH-09), without a page: "try again" to its end and at least the shake, then the whole
 * hint, then its steps on screen; a closed task, a newer mistake or the child's own count stop it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spoken } from '../../core/audio';
import type { Hint, HintStep } from '../tasks/types';
import { SHAKE_MS, afterMistake, hintOf, type FlowTask, type ShownHint } from './flow';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

/** Lines that end when the test says so (or at once, `quick`); a new line cuts the previous one off. */
function voice(quick = false) {
  const said: string[] = [];
  let end: (() => void) | null = null;
  const line = (what: string) => {
    end?.(); said.push(what);
    if (quick) return Promise.resolve() as Spoken;
    return new Promise<void>((resolve) => { end = () => { end = null; resolve(); }; }) as Spoken;
  };
  return {
    said, wrong: () => line('try'), hint: (key: string) => line(key),
    hearOut: async () => { expect(end, 'no line is being said').not.toBeNull(); end!(); await vi.advanceTimersByTimeAsync(0); },
  };
}
function task(hint: ShownHint | null = { key: 'h_count', show: vi.fn() }) {
  const t = { alive: true, wrongs: 0, own: -1, hint };
  const mistake = (v: ReturnType<typeof voice>) => { const round = ++t.wrongs; void afterMistake(t as FlowTask, round, v); return round; };
  /** A mistake, and a second later "try again" is still being said: the pause for the shake is over by then. */
  const miss = async (v: ReturnType<typeof voice>) => { const round = mistake(v); await vi.advanceTimersByTimeAsync(1000); return round; };
  return { t, mistake, miss, shows: () => (hint ? vi.mocked(hint.show).mock.calls.map(([r]) => r) : []) };
}

describe('afterMistake: "try again", then the hint, then what it shows', () => {
  it('runs without a page', () => {
    expect(typeof document).toBe('undefined');
  });

  it('a silent "try again": the hint waits for the shake, and the show for the end of the hint', async () => {
    const v = voice(), { mistake, shows } = task();
    const quick = voice(true);
    mistake({ ...v, wrong: quick.wrong });
    await vi.advanceTimersByTimeAsync(SHAKE_MS - 1);
    expect(v.said).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(v.said).toEqual(['h_count']);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(shows()).toEqual([]);
    await v.hearOut();
    expect(shows()).toEqual([1]);
  });

  it('a long "try again": the hint waits for its end, however long it takes', async () => {
    const v = voice(), { mistake, shows } = task();
    mistake(v);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(v.said).toEqual(['try']);
    await v.hearOut();
    expect(v.said).toEqual(['try', 'h_count']);
    expect(shows()).toEqual([]);
    await v.hearOut();
    expect(shows()).toEqual([1]);
  });

  it('a quick voice: try, hint and the show follow each other once the shake is over', async () => {
    const v = voice(true), { mistake, shows } = task();
    mistake(v);
    await vi.advanceTimersByTimeAsync(SHAKE_MS);
    expect(v.said).toEqual(['try', 'h_count']);
    expect(shows()).toEqual([1]);
  });

  it('closed during "try again": no hint; closed during the hint: nothing shown', async () => {
    const a = voice(), one = task();
    one.mistake(a);
    one.t.alive = false;
    await a.hearOut();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(a.said).toEqual(['try']);

    const b = voice(), two = task();
    await two.miss(b);
    await b.hearOut();
    two.t.alive = false;
    await b.hearOut();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(b.said).toEqual(['try', 'h_count']);
    expect(two.shows()).toEqual([]);
  });

  it('a newer mistake drops the old round: one hint, shown for the newer round', async () => {
    const v = voice(), { mistake, shows } = task();
    mistake(v);
    await vi.advanceTimersByTimeAsync(1000);
    mistake(v);                                   // cuts the first "try again" off: its round is no longer wanted
    await vi.advanceTimersByTimeAsync(20_000);
    expect(v.said).toEqual(['try', 'try']);
    await v.hearOut();
    await v.hearOut();
    expect(v.said).toEqual(['try', 'try', 'h_count']);
    expect(shows()).toEqual([2]);
  });

  it('a newer mistake during the hint: the cut-off hint shows nothing', async () => {
    const v = voice(), { miss, shows } = task();
    await miss(v);
    await v.hearOut();
    await miss(v);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(shows()).toEqual([]);
    await v.hearOut();
    await v.hearOut();
    expect(shows()).toEqual([2]);
  });

  it('the child counted by herself during the hint of this round: the hint is said, nothing is shown over her', async () => {
    const v = voice(), { t, miss, shows } = task();
    const round = await miss(v);
    await v.hearOut();
    t.own = round;
    await v.hearOut();
    expect(shows()).toEqual([]);
    await miss(v);                                   // the next mistake shows again
    await v.hearOut();
    await v.hearOut();
    expect(shows()).toEqual([2]);
  });

  it('a task without a hint: only "try again"', async () => {
    const v = voice(true), { mistake } = task(null);
    mistake(v);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(v.said).toEqual(['try']);
  });
});

describe('hintOf: the steps of a described hint', () => {
  const steps: HintStep[] = [{ do: 'showNumbers' }, { do: 'grow' }, { do: 'pulseAnswer', fromMistake: 2 }, { do: 'markUnits' }];
  const hint: Hint = { key: 'h_compare', steps };

  it('no hint, no shown hint', () => {
    expect(hintOf(null, () => {}, {})).toBeNull();
  });

  it('keeps the line, carries the steps out in their order, and lights the answer from the second mistake on', () => {
    const done: string[] = [];
    const act = { showNumbers: (s: HintStep) => done.push(s.do), grow: (s: HintStep) => done.push(s.do), markUnits: (s: HintStep) => done.push(s.do) };
    const shown = hintOf(hint, () => done.push('pulse'), act)!;
    expect(shown.key).toBe('h_compare');
    shown.show(1);
    expect(done).toEqual(['showNumbers', 'grow', 'markUnits']);
    done.length = 0;
    shown.show(2);
    expect(done).toEqual(['showNumbers', 'grow', 'pulse', 'markUnits']);
    done.length = 0;
    shown.show(5);
    expect(done).toEqual(['showNumbers', 'grow', 'pulse', 'markUnits']);
  });

  it('a step the show does not know, and a task with no single answer, are skipped', () => {
    const done: string[] = [];
    const shown = hintOf(hint, null, { grow: () => done.push('grow') })!;
    shown.show(3);
    expect(done).toEqual(['grow']);
  });
});
