// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initInput, input, joyRingSize } from './input';
import { resetTuning, setTuning, tuning } from './tuning';

// initInput puts its key listeners on the window, so it runs once; every test presses the same canvas.
const canvas = document.createElement('div'), joy = document.createElement('div'), knob = document.createElement('div');
let pointer = 1;

beforeAll(() => {
  (window as unknown as { ontouchstart: null }).ontouchstart = null;   // a touch screen: the left side steers
  canvas.setPointerCapture = () => {};
  document.body.append(canvas, joy, knob);
  initInput(canvas, joy, knob, document.createElement('button'), document.createElement('button'));
});
afterEach(() => { canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: pointer })); resetTuning(); });

/** A finger lands at x inside the joystick zone (the left share `tuning.joyZone` of the window). */
const touch = (x: number) => {
  pointer++;
  canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: pointer, clientX: x, clientY: 300 }));
};

describe('the joystick ring fits the knob travel set in the debug panel', () => {
  it('the default radius keeps the ring of style.css: 132 px, centred', () => {
    expect(tuning.joyRadius).toBe(56);
    expect(joyRingSize(56)).toBe(132);
    touch(innerWidth * tuning.joyZone / 2);
    expect([joy.style.width, joy.style.height]).toEqual(['132px', '132px']);
    expect([joy.style.marginLeft, joy.style.marginTop]).toEqual(['-66px', '-66px']);
  });

  it('a radius of 100 makes the ring 220 px, centred', () => {
    setTuning('joyRadius', 100);
    touch(innerWidth * tuning.joyZone / 2);
    expect([joy.style.width, joy.style.height]).toEqual(['220px', '220px']);
    expect([joy.style.marginLeft, joy.style.marginTop]).toEqual(['-110px', '-110px']);
  });

  it('the size is taken when the touch starts: the next touch after a change fits the new radius', () => {
    setTuning('joyRadius', 100);
    touch(10);
    expect(joy.style.width).toBe('220px');
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: pointer }));
    setTuning('joyRadius', 30);
    touch(10);
    expect([joy.style.width, joy.style.marginLeft]).toEqual(['80px', '-40px']);
  });

  it('a touch outside the joystick zone does not show or resize the ring', () => {
    joy.removeAttribute('style'); joy.classList.remove('on');
    setTuning('joyRadius', 100);
    touch(innerWidth - 5);
    expect(joy.classList.contains('on')).toBe(false);
    expect(joy.style.width).toBe('');
  });
});

describe('the joystick ring shows only once the finger steers, not on a tap to walk', () => {
  const x = () => innerWidth * tuning.joyZone / 2;
  const move = (dx: number) => canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: pointer, clientX: x() + dx, clientY: 300 }));
  const up = () => canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: pointer, clientX: x(), clientY: 300 }));
  afterEach(() => { vi.useRealTimers(); input.tap = null; });

  it('a tap shorter than joyHoldMs without a move: no ring at all, and it is a tap to walk', () => {
    vi.useFakeTimers();
    joy.classList.remove('on');
    touch(x());
    expect(joy.classList.contains('on')).toBe(false);
    vi.advanceTimersByTime(tuning.joyHoldMs - 50);
    expect(joy.classList.contains('on')).toBe(false);
    up();
    vi.advanceTimersByTime(1000);   // a timer left behind would show it now
    expect(joy.classList.contains('on')).toBe(false);
    expect(input.tap).toEqual({ x: x(), y: 300 });
  });

  it('a move past 12 px shows the ring at once, centred where the finger landed', () => {
    vi.useFakeTimers();
    touch(x());
    move(8);
    expect(joy.classList.contains('on')).toBe(false);
    move(20);
    expect(joy.classList.contains('on')).toBe(true);
    expect(joy.style.left).toBe(`${x()}px`);
    up();
    expect(joy.classList.contains('on')).toBe(false);
    expect(input.tap).toBe(null);
  });

  it('a finger held still shows the ring after joyHoldMs (the panel may change it)', () => {
    vi.useFakeTimers();
    setTuning('joyHoldMs', 400);
    touch(x());
    vi.advanceTimersByTime(399);
    expect(joy.classList.contains('on')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(joy.classList.contains('on')).toBe(true);
    up();
    expect(joy.classList.contains('on')).toBe(false);
  });
});
