import src from './transition.ts?raw';
import { describe, expect, it, vi } from 'vitest';
import {
  CLOSE_TIME, IDLE, LOADER_DELAY, LOADER_FADE, OPEN_TIME, PROGRESS_TIME, createTransition, irisReach, stepTimeline, viewOf,
  type LayerRenderer, type Timeline,
} from './transition';

const DT = 0.05;                                            // the longest frame the game counts
const CLOSING: Timeline = { ...IDLE, phase: 'closing' };
const CLOSED: Timeline = { phase: 'hold', k: 1, held: 0, loader: 0, shown: 0 };
/** `seconds` is the time `whole`, give or take the one frame the sum of steps may round to. */
const lasts = (seconds: number, whole: number) => { expect(seconds).toBeGreaterThan(whole - 1e-6); expect(seconds).toBeLessThan(whole + DT + 1e-6); };
/** Steps the timeline until `stop` (or `max` frames); returns every state on the way. */
function run(from: Timeline, ready: boolean, progress = 0, stop: (s: Timeline) => boolean = () => false, max = 400): Timeline[] {
  const out = [from];
  while (out.length <= max && !stop(out[out.length - 1])) out.push(stepTimeline(out[out.length - 1], DT, ready, progress));
  return out;
}

describe('the timeline of the transition', () => {
  it('no transition: nothing moves', () => {
    expect(stepTimeline(IDLE, DT, true, 1)).toBe(IDLE);
    expect(stepTimeline(IDLE, 100, false, 0)).toBe(IDLE);
  });

  it('closing and opening last at least 0.4 s of game time each, and the cover never jumps', () => {
    expect(CLOSE_TIME).toBeGreaterThanOrEqual(0.4);
    expect(OPEN_TIME).toBeGreaterThanOrEqual(0.4);
    const closing = run(CLOSING, false, 0, (s) => s.phase !== 'closing');
    expect(closing[closing.length - 1].phase).toBe('hold');
    lasts((closing.length - 1) * DT, CLOSE_TIME);
    const opening = run({ ...CLOSED, phase: 'opening' }, true, 1, (s) => s.phase !== 'opening');
    expect(opening[opening.length - 1]).toBe(IDLE);
    lasts((opening.length - 1) * DT, OPEN_TIME);
    for (const states of [closing, opening]) {
      const covers = states.map((s) => viewOf(s).cover);
      for (let i = 1; i < covers.length; i++) expect(Math.abs(covers[i] - covers[i - 1]), `frame ${i}`).toBeLessThan(0.14);
    }
    expect(closing.map((s) => s.k)).toEqual([...closing.map((s) => s.k)].sort((a, b) => a - b));     // only closes
    expect(opening.map((s) => s.k)).toEqual([...opening.map((s) => s.k)].sort((a, b) => b - a));     // only opens
  });

  it('a world ready before the frame has closed does not cut the closing short', () => {
    const early = run(CLOSING, true, 1, (s) => s.phase !== 'closing'), late = run(CLOSING, false, 0, (s) => s.phase !== 'closing');
    expect(early.map((s) => s.k)).toEqual(late.map((s) => s.k));
    expect(early[early.length - 1]).toMatchObject({ phase: 'hold', k: 1 });
  });

  it('every transition has a fully closed state, even in one enormous frame with the world ready', () => {
    const closed = stepTimeline(CLOSING, 1000, true, 1);
    expect(closed).toMatchObject({ phase: 'hold', k: 1 });
    expect(viewOf(closed).cover).toBe(1);
    const next = stepTimeline(closed, 1000, true, 1);
    expect(next).toMatchObject({ phase: 'opening', k: 1 });                                         // still closed: it opens from the next frame
  });

  it('the opening does not start until the world is ready, however long it takes', () => {
    const waiting = run(CLOSED, false, 0.3, () => false, 12000);                                     // ten minutes of game time
    expect(waiting.every((s) => s.phase === 'hold' && s.k === 1)).toBe(true);
    expect(stepTimeline(waiting[waiting.length - 1], 1000, false, 1)).toMatchObject({ phase: 'hold', k: 1 });   // nor after one enormous frame
    const after = run(waiting[waiting.length - 1], true, 1, (s) => s.phase !== 'hold');
    expect(after[after.length - 1].phase).toBe('opening');
  });

  it('the loading ring: not for a world ready at once, fading in after a delay, fading out before the frame opens', () => {
    const quick = run(CLOSED, true, 1, (s) => s.phase !== 'hold');
    expect(quick.length).toBe(2);                                                                    // the next frame opens
    expect(quick.every((s) => s.loader === 0)).toBe(true);
    const slow = run(CLOSED, false, 0, () => false, 40);
    expect(slow.filter((s) => s.held <= LOADER_DELAY).every((s) => s.loader === 0)).toBe(true);
    expect(slow[slow.length - 1].loader).toBe(1);
    for (let i = 1; i < slow.length; i++) expect(slow[i].loader - slow[i - 1].loader).toBeLessThanOrEqual(DT / LOADER_FADE + 1e-9);
    const out = run(slow[slow.length - 1], true, 1, (s) => s.phase !== 'hold');
    expect(out.length - 1).toBeGreaterThanOrEqual(Math.round(LOADER_FADE / DT));                     // the ring is not cut off
    expect(out[out.length - 1]).toMatchObject({ phase: 'opening', loader: 0 });
    for (let i = 1; i < out.length; i++) expect(out[i - 1].loader - out[i].loader).toBeLessThanOrEqual(DT / LOADER_FADE + 1e-9);
  });

  it('the ring runs after the progress of the loading without a jump, either way, and fills up when the world is ready', () => {
    const up = run(CLOSED, false, 1, () => false, 20);
    for (let i = 1; i < up.length; i++) expect(up[i].shown - up[i - 1].shown).toBeLessThanOrEqual(DT / PROGRESS_TIME + 1e-9);
    expect(up[up.length - 1].shown).toBe(1);
    expect(stepTimeline({ ...CLOSED, shown: 1 }, DT, false, 0).shown).toBeCloseTo(1 - DT / PROGRESS_TIME, 9);
    expect(stepTimeline(CLOSED, DT, false, 7).shown).toBeCloseTo(DT / PROGRESS_TIME, 9);              // out of range: clamped
    expect(stepTimeline(CLOSED, DT, false, NaN).shown).toBe(0);
    expect(stepTimeline({ ...CLOSED, loader: 1, shown: 0.2 }, DT, true, 0.2).shown).toBeGreaterThan(0.2);
  });

  it('is a pure function: the state it is given is not changed, a paused frame changes nothing', () => {
    for (const s of [CLOSING, { ...CLOSING, k: 0.5 }, CLOSED, { ...CLOSED, loader: 1, shown: 0.4 }, { ...CLOSED, phase: 'opening' as const }]) {
      const frozen = Object.freeze({ ...s }), copy = { ...s };
      stepTimeline(frozen, DT, true, 1); stepTimeline(frozen, DT, false, 0);
      expect(frozen).toEqual(copy);
      expect(stepTimeline(frozen, 0, false, s.shown)).toEqual(copy);
      expect(stepTimeline(frozen, -1, false, s.shown)).toEqual(copy);
      expect(stepTimeline(frozen, NaN, false, s.shown)).toEqual(copy);
    }
  });

  it('the cover eases in and out between 0 and 1', () => {
    expect(viewOf({ k: 0, loader: 0, shown: 0 }).cover).toBe(0);
    expect(viewOf({ k: 0.5, loader: 0, shown: 0 }).cover).toBeCloseTo(0.5, 9);
    expect(viewOf({ k: 1, loader: 1, shown: 0.6 })).toEqual({ cover: 1, loader: 1, progress: 0.6 });
    expect(viewOf({ k: 0.1, loader: 0, shown: 0 }).cover).toBeLessThan(0.1);                         // slow at the start
    expect(viewOf({ k: 0.9, loader: 0, shown: 0 }).cover).toBeGreaterThan(0.9);                      // and at the end
  });
});

describe('the iris', () => {
  it('opens far enough to uncover every corner at any aspect ratio and centre', () => {
    for (const [w, h] of [[844, 390], [390, 844], [1280, 720], [500, 500]]) {
      const aspect = w / h;
      for (const [cx, cy] of [[0.5, 0.5], [0.2, 0.8], [0, 0], [1, 0.3]]) {
        const reach = irisReach(cx, cy, aspect);
        // the shader's measure: heights of the frame, x stretched by the aspect - a circle on the screen
        for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(reach + 1e-9, `${w}x${h} from ${cx},${cy}`).toBeGreaterThanOrEqual(Math.hypot((x - cx) * aspect, y - cy));
      }
    }
    expect(irisReach(0.5, 0.5, 844 / 390)).toBeCloseTo(Math.hypot(422, 195) / 390, 9);                // no farther than the corner
  });
});

/** A renderer that records what it was asked to draw and with what `autoClear`. */
function fakeRenderer(width = 1688, height = 780) {
  const draws: boolean[] = [];
  const r: LayerRenderer = { autoClear: true, domElement: { width, height }, render: vi.fn(() => { draws.push(r.autoClear); }) };
  return { r, draws };
}
/** Draws frames until `stop` (or `max` frames); returns how many. */
function frames(t: ReturnType<typeof createTransition>, r: LayerRenderer, stop: () => boolean, max = 400): number {
  let n = 0;
  while (n < max && !stop()) { t.render(r, DT); n++; }
  return n;
}

describe('the transition of the game', () => {
  it('outside a transition draws nothing and asks the renderer for nothing', () => {
    const t = createTransition(), { r, draws } = fakeRenderer();
    expect(t.phase).toBe('idle'); expect(t.active).toBe(false); expect(t.closed).toBe(false);
    for (let i = 0; i < 5; i++) t.render(r, DT);
    expect(draws).toEqual([]);
    expect(t.frames).toBe(0);
    t.ready(); t.setProgress(1);                                                                     // without a transition: nothing
    t.render(r, DT);
    expect(draws).toEqual([]);
    expect(t.frame(DT)).toBeNull();
  });

  it('draws one layer a frame over the frame (never clearing it) from the start to the end, then nothing again', () => {
    const t = createTransition(), { r, draws } = fakeRenderer();
    t.start();
    expect(t.phase).toBe('closing'); expect(t.active).toBe(true);
    const closing = frames(t, r, () => t.closed);
    lasts(closing * DT, CLOSE_TIME);
    expect(t.phase).toBe('hold');
    expect(t.uniforms.uCover.value).toBe(1);
    frames(t, r, () => false, 100);                                                                  // five seconds: the world is not ready
    expect(t.closed).toBe(true);
    t.ready();
    const rest = frames(t, r, () => !t.active);
    expect(t.phase).toBe('idle'); expect(t.closed).toBe(false);
    expect(draws.length).toBe(closing + 100 + rest - 1);                                             // the last frame found the transition ended
    expect(t.frames).toBe(draws.length);
    expect(draws.every((auto) => auto === false)).toBe(true);
    expect(r.autoClear).toBe(true);                                                                  // given back as it was
    t.render(r, DT);
    expect(draws.length).toBe(closing + 100 + rest - 1);
  });

  it('gives the renderer its setting of autoClear back, whatever it was', () => {
    const t = createTransition(), { r, draws } = fakeRenderer();
    r.autoClear = false;
    t.start(); t.render(r, DT);
    expect(draws).toEqual([false]);
    expect(r.autoClear).toBe(false);
  });

  it('runs on the game time it is given: a paused frame moves nothing', () => {
    const t = createTransition(), { r } = fakeRenderer();
    t.start(); t.render(r, DT);
    const cover = t.uniforms.uCover.value;
    expect(cover).toBeGreaterThan(0);
    t.render(r, 0);
    expect(t.uniforms.uCover.value).toBe(cover);
    t.render(r, DT);
    expect(t.uniforms.uCover.value).toBeGreaterThan(cover);
  });

  it('started closed (the first load): closed at once, "closed" only after a frame was drawn, opens on ready', () => {
    const t = createTransition(), { r } = fakeRenderer();
    t.start({ closed: true });
    expect(t.phase).toBe('hold');
    expect(t.closed).toBe(false);                                                                    // nothing on the screen yet
    t.render(r, DT);
    expect(t.closed).toBe(true);
    expect(t.uniforms.uCover.value).toBe(1);
    t.ready();
    lasts((frames(t, r, () => !t.active) - 2) * DT, OPEN_TIME);                                      // less the frame that turned to opening and the one that found it ended
  });

  it('started again while closing: the closing goes on from where it is and waits for a new ready', () => {
    const t = createTransition(), { r } = fakeRenderer();
    t.start(); t.ready();
    frames(t, r, () => false, 4);
    const cover = t.uniforms.uCover.value;
    t.start({ closed: true, center: { x: 0, y: 0 } });                                               // neither is taken mid-way: no jump
    t.render(r, DT);
    expect(t.phase).toBe('closing');
    expect(t.uniforms.uCover.value).toBeGreaterThan(cover);
    expect(t.uniforms.uCover.value - cover).toBeLessThan(0.14);
    expect(t.uniforms.uCenter.value.toArray()).toEqual([0.5, 0.5]);
    frames(t, r, () => false, 100);
    expect(t.phase).toBe('hold');                                                                    // the first ready() no longer counts
    t.ready();
    frames(t, r, () => !t.active);
    expect(t.phase).toBe('idle');
  });

  it('started again while closed and already told "ready": stays closed until the next ready', () => {
    const t = createTransition(), { r } = fakeRenderer();
    t.start({ closed: true }); t.setProgress(1); t.render(r, DT); t.ready();
    t.start();
    frames(t, r, () => false, 100);
    expect(t.phase).toBe('hold'); expect(t.closed).toBe(true);
    expect(t.uniforms.uProgress.value).toBe(0);                                                      // the progress starts anew
  });

  it('started again while opening: closes back from where it is, without a jump', () => {
    const t = createTransition(), { r } = fakeRenderer();
    t.start({ closed: true }); t.render(r, DT); t.ready();
    frames(t, r, () => t.phase === 'opening' && t.uniforms.uCover.value < 0.6);
    const cover = t.uniforms.uCover.value;
    t.start();
    expect(t.phase).toBe('closing');
    t.render(r, DT);
    expect(t.uniforms.uCover.value).toBeGreaterThan(cover);
    expect(t.uniforms.uCover.value - cover).toBeLessThan(0.14);
    frames(t, r, () => false, 100);
    expect(t.closed).toBe(true);
  });

  it('shows the progress it is told, clamped, on the ring', () => {
    const t = createTransition(), { r } = fakeRenderer();
    t.start({ closed: true });
    t.setProgress(0.5); frames(t, r, () => false, 40);
    expect(t.uniforms.uProgress.value).toBe(0.5);
    expect(t.uniforms.uLoader.value).toBe(1);
    t.setProgress(3); frames(t, r, () => false, 40);
    expect(t.uniforms.uProgress.value).toBe(1);
    t.setProgress(-1); frames(t, r, () => false, 40);
    expect(t.uniforms.uProgress.value).toBe(0);
  });

  it('tells who waits that the frame is closed and that the transition has ended', async () => {
    const t = createTransition(), { r } = fakeRenderer();
    await t.whenDone();                                                                              // no transition: at once
    const seen: string[] = [];
    t.start();
    void t.whenClosed().then(() => seen.push('closed'));
    void t.whenDone().then(() => seen.push('done'));
    frames(t, r, () => false, 6); await Promise.resolve();
    expect(seen).toEqual([]);
    frames(t, r, () => t.closed); await Promise.resolve();
    expect(seen).toEqual(['closed']);
    await t.whenClosed();                                                                            // already closed: at once
    t.ready(); frames(t, r, () => !t.active); await Promise.resolve();
    expect(seen).toEqual(['closed', 'done']);
  });

  it('the iris closes on the point it is given; the shader gets it counted from the bottom, with the aspect and the reach', () => {
    const t = createTransition(), wide = fakeRenderer(1688, 780), tall = fakeRenderer(390, 844);
    t.start({ center: { x: 0.25, y: 0.2 } });
    t.render(wide.r, DT);
    expect(t.uniforms.uCenter.value.toArray()).toEqual([0.25, 0.8]);
    expect(t.uniforms.uAspect.value).toBeCloseTo(1688 / 780, 9);
    expect(t.uniforms.uReach.value).toBeCloseTo(irisReach(0.25, 0.2, 1688 / 780), 9);
    t.render(tall.r, DT);                                                                            // the phone was turned
    expect(t.uniforms.uAspect.value).toBeCloseTo(390 / 844, 9);
    expect(t.uniforms.uReach.value).toBeCloseTo(irisReach(0.25, 0.2, 390 / 844), 9);
    t.setCenter(2, 0.75);                                                                            // where the heroine stands in the new world
    t.render(tall.r, DT);
    expect(t.uniforms.uCenter.value.toArray()).toEqual([1, 0.25]);
  });

  it('the debug stop holds the layer at a point whatever the timeline does, and lets it go', () => {
    const t = createTransition(), { r, draws } = fakeRenderer();
    t.freeze(0.5);
    expect(t.active).toBe(true); expect(t.phase).toBe('idle'); expect(t.closed).toBe(false);
    frames(t, r, () => false, 30);
    expect(draws.length).toBe(30);
    expect(t.uniforms.uCover.value).toBeCloseTo(0.5, 9);
    expect(t.uniforms.uLoader.value).toBe(0);
    t.freeze(1, 0.6); t.render(r, DT);
    expect([t.uniforms.uCover.value, t.uniforms.uLoader.value, t.uniforms.uProgress.value]).toEqual([1, 1, 0.6]);
    t.freeze(1); t.render(r, DT);
    expect(t.uniforms.uProgress.value).toBe(0);
    t.freeze(7, -2); t.render(r, DT);                                                                // out of range: clamped
    expect([t.uniforms.uCover.value, t.uniforms.uProgress.value]).toEqual([1, 0]);
    t.freeze(null);
    expect(t.active).toBe(false);
    t.render(r, DT);
    expect(draws.length).toBe(33);
    // a transition under the stop waits where it was
    t.start(); t.render(r, DT); t.freeze(0.5); frames(t, r, () => false, 100);
    expect(t.phase).toBe('closing');
    t.freeze(null); frames(t, r, () => t.closed);
    expect(t.closed).toBe(true);
  });
});

describe('the code of the transition', () => {

  it('is a shader of our own: nothing is imported but three and the game time (R32: no shader library)', () => {
    expect([...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort()).toEqual(['../core/materials', 'three']);
    expect(src).toMatch(/new THREE\.ShaderMaterial\(/);
  });
  it('is drawn past the tone curve and the depth of the scene', () => {
    expect(src).toMatch(/transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,/);
  });
});
