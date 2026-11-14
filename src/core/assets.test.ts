import { describe, expect, it, vi } from 'vitest';
import { RETRIES, loadCache, retry } from './assets';

const noWait = () => Promise.resolve();
/** A load that fails `fails` times and then gives `value`; `calls` counts every attempt. */
function flaky<T>(fails: number, value: T) {
  const f = Object.assign(vi.fn(async () => {
    if (f.calls < fails) { f.calls++; throw new Error(`attempt ${f.calls} failed`); }
    f.calls++;
    return value;
  }), { calls: 0 });
  return f;
}

describe('retry (TECH-08)', () => {
  it('repeats a failed load up to three times', () => {
    expect(RETRIES).toBe(3);
  });

  it('gives the first success at once, without waiting', async () => {
    const load = flaky(0, 'ok'), wait = vi.fn(noWait);
    await expect(retry(load, RETRIES, wait)).resolves.toBe('ok');
    expect(load.calls).toBe(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('succeeds when an attempt after two failures succeeds', async () => {
    const load = flaky(2, 'ok'), wait = vi.fn((_n: number) => Promise.resolve());
    await expect(retry(load, RETRIES, wait)).resolves.toBe('ok');
    expect(load.calls).toBe(3);
    expect(wait.mock.calls.map((c) => c[0])).toEqual([0, 1]);
  });

  it('succeeds on the third repeat', async () => {
    const load = flaky(3, 'ok');
    await expect(retry(load, RETRIES, noWait)).resolves.toBe('ok');
    expect(load.calls).toBe(4);
  });

  it('gives up after the first attempt and three repeats, with the last error', async () => {
    const load = flaky(99, 'never'), wait = vi.fn(noWait);
    await expect(retry(load, RETRIES, wait)).rejects.toThrow('attempt 4 failed');
    expect(load.calls).toBe(4);
    expect(wait).toHaveBeenCalledTimes(3);
  });

  it('waits a short, growing pause by default', async () => {
    vi.useFakeTimers();
    try {
      const load = flaky(99, 'never');
      const p = retry(load);
      const caught = p.catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(0);
      expect(load.calls).toBe(1);
      await vi.advanceTimersByTimeAsync(299);
      expect(load.calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(load.calls).toBe(2);
      // All the pauses together stay short: the child is looking at the loading bar meanwhile.
      await vi.advanceTimersByTimeAsync(2100);
      expect(load.calls).toBe(4);
      expect(await caught).toBeInstanceOf(Error);
    } finally { vi.useRealTimers(); }
  });
});

describe('loadCache (TECH-08)', () => {
  it('loads one key once, also when it is asked for twice at the same time', async () => {
    const load = vi.fn(async (k: string) => `model ${k}`);
    const get = loadCache(load, RETRIES, noWait);
    const [a, b] = await Promise.all([get('cat'), get('cat')]);
    expect(a).toBe('model cat'); expect(b).toBe('model cat');
    expect(await get('cat')).toBe('model cat');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('repeats a failing load before giving up', async () => {
    const load = vi.fn(async () => { throw new Error('blocked'); });
    const get = loadCache(load, RETRIES, noWait);
    await expect(get('fox')).rejects.toThrow('blocked');
    expect(load).toHaveBeenCalledTimes(1 + RETRIES);
  });

  it('does not keep a failed load: asking again loads again and can succeed', async () => {
    let blocked = true;
    const load = vi.fn(async (k: string) => { if (blocked) throw new Error('blocked'); return `model ${k}`; });
    const get = loadCache(load, RETRIES, noWait);
    const first = get('deer');
    await expect(first).rejects.toThrow('blocked');
    blocked = false;
    const second = get('deer');
    expect(second).not.toBe(first);
    await expect(second).resolves.toBe('model deer');
    expect(load).toHaveBeenCalledTimes(1 + RETRIES + 1);
  });

  it('keeps the other keys when one fails', async () => {
    const load = vi.fn(async (k: string) => { if (k === 'bad') throw new Error('blocked'); return k; });
    const get = loadCache(load, RETRIES, noWait);
    const good = get('good');
    await expect(get('bad')).rejects.toThrow('blocked');
    expect(get('good')).toBe(good);
  });
});
