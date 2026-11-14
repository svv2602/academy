// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initInput, joyRingSize } from './input';
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
    expect(joy.classList.contains('on')).toBe(true);
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
