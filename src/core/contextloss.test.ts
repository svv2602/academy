import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTEXT_WAIT_MS, watchContext } from './contextloss';

/** The WebGL context lost and given back (src/core/contextloss.ts, decision of 2026-11-21). */
function setup() {
  const canvas = new EventTarget(), calls: string[] = [];
  const watch = watchContext(canvas, { lost: () => calls.push('lost'), back: () => calls.push('back'), gone: () => calls.push('gone') });
  const lose = () => { const e = new Event('webglcontextlost', { cancelable: true }); canvas.dispatchEvent(e); return e; };
  const restore = () => canvas.dispatchEvent(new Event('webglcontextrestored'));
  return { watch, calls, lose, restore };
}

describe('a lost WebGL context (src/core/contextloss.ts)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('asks the browser for the context back, and the game stands until it is back; given back in time, nothing more', () => {
    const { watch, calls, lose, restore } = setup();
    expect(lose().defaultPrevented).toBe(true);
    expect(watch.lost).toBe(true);
    expect(calls).toEqual(['lost']);
    vi.advanceTimersByTime(CONTEXT_WAIT_MS - 1);
    restore();
    expect(watch.lost).toBe(false);
    vi.advanceTimersByTime(CONTEXT_WAIT_MS * 2);
    expect(calls).toEqual(['lost', 'back']);
  });

  it('not back in time: the message once; back after it, the game goes on', () => {
    const { watch, calls, lose, restore } = setup();
    lose(); lose();
    vi.advanceTimersByTime(CONTEXT_WAIT_MS);
    expect(calls).toEqual(['lost', 'gone']);
    vi.advanceTimersByTime(CONTEXT_WAIT_MS * 3);
    expect(calls).toEqual(['lost', 'gone']);
    restore(); restore();
    expect(watch.lost).toBe(false);
    expect(calls).toEqual(['lost', 'gone', 'back']);
  });

  it('a restore without a loss does nothing; a second loss waits its own time', () => {
    const { calls, lose, restore } = setup();
    restore();
    expect(calls).toEqual([]);
    lose(); vi.advanceTimersByTime(CONTEXT_WAIT_MS / 2); restore();
    lose(); vi.advanceTimersByTime(CONTEXT_WAIT_MS - 1);
    expect(calls).toEqual(['lost', 'back', 'lost']);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['lost', 'back', 'lost', 'gone']);
  });
});
