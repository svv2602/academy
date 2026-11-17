// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The music of a world can be stopped and changed (TECH-15, src/core/audio.ts `setMusic`): a change of world leaves
 * silence behind the closed frame and starts the notes of the new world as it opens. The audio context is a stand-in
 * that records which node every note goes through and when it starts.
 */
class Param {
  value = 1;
  ramps: [value: number, at: number][] = [];
  setValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime(v: number, at: number) { this.ramps.push([v, at]); }
  exponentialRampToValueAtTime() {}
}
class Node {
  gain = new Param(); frequency = new Param(); delayTime = new Param(); type = '';
  to: Node[] = [];
  connected = true;
  connect(n: Node) { this.to.push(n); }
  disconnect() { this.connected = false; this.to = []; }
  /** Does what this node sounds reach `end`? */
  reaches(end: Node, seen = new Set<Node>()): boolean {
    if (this === end) return true;
    if (seen.has(this)) return false;
    seen.add(this);
    return this.to.some((n) => n.reaches(end, seen));
  }
}
class Osc extends Node {
  at = -1;
  constructor(private c: Ctx) { super(); }
  start(t: number) { this.at = t; this.c.notes.push(this); }
  stop() {}
}
class Ctx {
  static made: Ctx[] = [];
  currentTime = 0;
  destination = new Node();
  notes: Osc[] = [];
  gains: Node[] = [];
  resume = vi.fn(async () => {});
  suspend = vi.fn(async () => {});
  constructor() { Ctx.made.push(this); }
  createGain() { const n = new Node(); this.gains.push(n); return n; }
  createDelay() { return new Node(); }
  createOscillator() { return new Osc(this); }
}

const VALLEY = { scale: [261.6, 293.7, 329.6, 392, 440], chords: [[130.8, 196, 329.6]] };
const MEADOW = { scale: [1000, 1100, 1200, 1300, 1400], chords: [[500, 600, 700]] };
/** The tones of a world's notes: each bell also sounds an octave apart, never in the other world's range. */
const of = (p: typeof VALLEY) => new Set([...p.scale, ...p.chords.flat()]);

async function load() {
  vi.resetModules();
  Ctx.made = [];
  vi.stubGlobal('window', { AudioContext: Ctx });
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {} });
  return import('./audio');
}
/** The clock of the context and the timers move together, in steps of the scheduler. */
function pass(ctx: Ctx, seconds: number) {
  for (let t = 0; t < seconds; t += 0.4) { ctx.currentTime += 0.4; vi.advanceTimersByTime(400); }
}

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0.1); });   // a bell on every step
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('the music of the world played (ARCH-06, TECH-15)', () => {
  it('set before the first tap, it starts with the sound; `musicPlaying` tells which notes play', async () => {
    const { setMusic, unlockAudio, musicPlaying } = await load();
    setMusic(VALLEY);
    expect(musicPlaying()).toBeNull();
    expect(Ctx.made).toHaveLength(0);
    unlockAudio();
    const ctx = Ctx.made[0];
    expect(musicPlaying()).toBe(VALLEY);
    expect(ctx.notes.length).toBeGreaterThan(0);
    for (const n of ctx.notes) expect(of(VALLEY).has(n.frequency.value), `a note of ${n.frequency.value} Hz`).toBe(true);
    for (const n of ctx.notes) expect(n.reaches(ctx.destination)).toBe(true);
  });

  it('a world without music: silence, and nothing is scheduled', async () => {
    const { setMusic, unlockAudio, musicPlaying } = await load();
    setMusic(null);
    unlockAudio();
    pass(Ctx.made[0], 4);
    expect(musicPlaying()).toBeNull();
    expect(Ctx.made[0].notes).toHaveLength(0);
  });

  it('setMusic(null) leaves silence at once: the bed fades out with the notes already scheduled, and no note is scheduled after', async () => {
    const { setMusic, unlockAudio, musicPlaying } = await load();
    setMusic(VALLEY);
    unlockAudio();
    const ctx = Ctx.made[0];
    pass(ctx, 2);
    const ahead = ctx.notes.filter((n) => n.at > ctx.currentTime);
    expect(ahead.length).toBeGreaterThan(0);          // notes that have not sounded yet
    const sounding = [...ctx.notes];
    setMusic(null);
    expect(musicPlaying()).toBeNull();
    // Every note of the bed goes through one node, and that node is taken down to silence within a third of a second.
    const beds = ctx.gains.filter((gn) => gn.gain.ramps.some(([v, at]) => v === 0 && at <= ctx.currentTime + 0.3 + 1e-9));
    expect(beds).toHaveLength(1);
    const before = ctx.notes.length;
    pass(ctx, 6);
    expect(ctx.notes).toHaveLength(before);
    // Once it is silent the bed is taken apart: nothing of it reaches the speakers any more.
    expect(beds[0].connected).toBe(false);
    for (const n of sounding) expect(n.reaches(ctx.destination)).toBe(false);
  });

  it('the notes of the new world start a bed of their own; the old one schedules nothing more', async () => {
    const { setMusic, unlockAudio, musicPlaying } = await load();
    setMusic(VALLEY);
    unlockAudio();
    const ctx = Ctx.made[0];
    pass(ctx, 2);
    setMusic(null);
    pass(ctx, 1);
    const before = ctx.notes.length;
    setMusic(MEADOW);
    expect(musicPlaying()).toBe(MEADOW);
    pass(ctx, 4);
    const fresh = ctx.notes.slice(before);
    expect(fresh.length).toBeGreaterThan(0);
    for (const n of fresh) expect(of(MEADOW).has(n.frequency.value), `a note of ${n.frequency.value} Hz after the change`).toBe(true);
    for (const n of fresh) expect(n.reaches(ctx.destination)).toBe(true);
    expect(Ctx.made).toHaveLength(1);                 // the same sound, unlocked once
  });

  it('changed without a silence in between, the old bed stops all the same: one bed plays, not two', async () => {
    const { setMusic, unlockAudio } = await load();
    setMusic(VALLEY);
    unlockAudio();
    const ctx = Ctx.made[0];
    pass(ctx, 2);
    const before = ctx.notes.length;
    setMusic(MEADOW);
    pass(ctx, 4);
    for (const n of ctx.notes.slice(before)) expect(of(MEADOW).has(n.frequency.value)).toBe(true);
    // The same world set again starts over rather than doubling its bed: about as many notes in a while as one bed
    // plays (two beds would play twice as many).
    const while44 = () => { const from = ctx.notes.length; pass(ctx, 44); return ctx.notes.length - from; };
    const one = while44();
    setMusic(MEADOW);
    const again = while44();
    expect(one).toBeGreaterThan(100);
    expect(again).toBeGreaterThan(one * 0.85);
    expect(again).toBeLessThan(one * 1.15);
  });
});
