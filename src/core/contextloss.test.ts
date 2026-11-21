import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTEXT_WAIT_MS, dropStaleDeletes, watchContext } from './contextloss';

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

/** A context that records what it deletes; a buffer of `n` is the object it made. */
function fakeGl() {
  const deleted: string[] = [];
  let n = 0;
  const gl = {
    createBuffer: () => ({ id: `b${n++}` }), deleteBuffer: (o: { id: string } | null) => { deleted.push(o ? o.id : 'null'); },
    createVertexArray: () => ({ id: `v${n++}` }), deleteVertexArray: (o: { id: string }) => { deleted.push(o.id); },
    createTexture: () => ({ id: `t${n++}` }), deleteTexture: (o: { id: string }) => { deleted.push(o.id); },
  };
  return { gl, deleted };
}

describe('after the context is back, the lost one\'s objects are not deleted (dropStaleDeletes)', () => {
  it('drops the delete of an object of the lost context, passes the delete of one of the context now', () => {
    const { gl: raw, deleted } = fakeGl();
    const before = raw.createBuffer();             // made before the guard: the first life of the context
    const guard = dropStaleDeletes(raw);
    const gl = raw as unknown as Record<string, (o?: unknown) => { id: string }>;
    const old = gl.createBuffer(), oldVao = gl.createVertexArray(), oldTex = gl.createTexture();
    gl.deleteBuffer(gl.createBuffer());
    expect(deleted).toEqual(['b4']);
    guard.lost();
    // three's old `dispose` listeners after the context is back: nothing reaches the context
    gl.deleteBuffer(old); gl.deleteVertexArray(oldVao); gl.deleteTexture(oldTex); gl.deleteBuffer(before);
    expect(deleted).toEqual(['b4']);
    // what the context made since is deleted as ever; a delete of null goes through, as the context takes it
    gl.deleteBuffer(gl.createBuffer());
    gl.deleteBuffer(null);
    expect(deleted).toEqual(['b4', 'b5', 'null']);
    // lost again: the objects of the second life are of the past too
    const second = gl.createTexture();
    guard.lost();
    gl.deleteTexture(second);
    expect(deleted).toEqual(['b4', 'b5', 'null']);
  });
});
