// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TUNING_DEFAULTS, TUNING_KEYS, TUNING_RANGES, camDistance, resetTuning, setTuning, tuning, tuningText } from './tuning';
import { initInput, input, pollInput } from './input';
import { initTuningPanel } from '../ui/tuning';

afterEach(() => resetTuning());

describe('tuning values (ARCH-14)', () => {
  it('defaults are the numbers the game had before the panel', () => {
    // src/main.ts: look 0.006 / 0.004 per pixel, speed 5.4, run above 1.3, camera 6.2 (portrait 8);
    // src/core/input.ts: joystick radius 56 px, joystick zone the left 40 % of the window.
    expect(TUNING_DEFAULTS).toEqual({ lookX: 0.006, lookY: 0.004, speed: 5.4, runFrom: 1.3, joyRadius: 56, joyZone: 0.4, joyHoldMs: 250, camDist: 6.2 });
    expect(tuning).toEqual(TUNING_DEFAULTS);
    expect(camDistance(16 / 9)).toBe(6.2);
    expect(camDistance(390 / 844)).toBe(8);
  });

  it('every default lies on its slider', () => {
    for (const k of TUNING_KEYS) {
      const [min, max, step] = TUNING_RANGES[k];
      expect(TUNING_DEFAULTS[k]).toBeGreaterThanOrEqual(min);
      expect(TUNING_DEFAULTS[k]).toBeLessThanOrEqual(max);
      const steps = (TUNING_DEFAULTS[k] - min) / step;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
    }
  });

  it('a change is seen by the reader at once, kept within the slider, and reset brings the defaults back', () => {
    setTuning('speed', 2.7);
    expect(tuning.speed).toBe(2.7);
    setTuning('camDist', 7);
    expect(camDistance(2)).toBe(7);
    expect(camDistance(0.5)).toBeCloseTo(7 * 8 / 6.2, 9);
    setTuning('joyRadius', 1000);
    expect(tuning.joyRadius).toBe(TUNING_RANGES.joyRadius[1]);
    setTuning('lookX', Number.NaN);
    expect(tuning.lookX).toBe(0.006);
    resetTuning();
    expect(tuning).toEqual(TUNING_DEFAULTS);
  });

  it('the text to copy holds all eight current values', () => {
    expect(tuningText().split('\n')).toEqual([
      'lookX = 0.006', 'lookY = 0.004', 'speed = 5.4', 'runFrom = 1.3', 'joyRadius = 56', 'joyZone = 0.4', 'joyHoldMs = 250', 'camDist = 6.2',
    ]);
    setTuning('speed', 3.1);
    setTuning('joyZone', 0.55);
    const text = tuningText();
    expect(text).toContain('speed = 3.1');
    expect(text).toContain('joyZone = 0.55');
    expect(text.split('\n')).toHaveLength(8);
  });
});

describe('joystick reads the tuning on every touch (ARCH-14)', () => {
  const canvas = document.createElement('div'), joy = document.createElement('div'), knob = document.createElement('div');
  beforeAll(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    canvas.setPointerCapture = () => {};
    initInput(canvas, joy, knob, document.createElement('button'), document.createElement('button'));
    input.touch = true;
  });
  const drag = (id: number, x: number, dx: number) => {
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, clientX: x, clientY: 200 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: id, clientX: x + dx, clientY: 200 }));
    pollInput();
    const r = { moveX: input.moveX, look: input.lookDX };
    canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, clientX: x + dx, clientY: 200 }));
    pollInput(); input.lookDX = 0;
    return r;
  };

  it('radius: the same drag steers harder with a smaller radius', () => {
    expect(drag(1, 100, 28).moveX).toBeCloseTo(0.5, 6);   // 28 of 56 px
    setTuning('joyRadius', 28);
    expect(drag(2, 100, 28).moveX).toBeCloseTo(1, 6);
  });

  it('zone: a touch at half the width steers only when the zone is wider than half', () => {
    expect(drag(3, 500, 28)).toEqual({ moveX: 0, look: 28 });   // outside the left 40 %: it looks around
    setTuning('joyZone', 0.6);
    expect(drag(4, 500, 28).moveX).toBeCloseTo(0.5, 6);
  });
});

describe('tuning panel (?debug, ARCH-14)', () => {
  const build = () => {
    document.body.innerHTML = '<div id="fps"></div><div id="after"></div>';
    return initTuningPanel(document.getElementById('fps')!);
  };
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

  it('a button opens and closes the panel with a slider for each of the eight values, showing the code values', () => {
    const { btn, panel } = build();
    expect(document.getElementById('fps')!.nextElementSibling).toBe(btn);
    expect(btn.nextElementSibling).toBe(panel);
    expect(panel.classList.contains('hidden')).toBe(true);
    btn.click();
    expect(panel.classList.contains('hidden')).toBe(false);
    const ranges = [...panel.querySelectorAll<HTMLInputElement>('input[type=range]')];
    expect(ranges.map((r) => r.dataset.k)).toEqual(TUNING_KEYS);
    for (const r of ranges) expect(Number(r.value)).toBe(TUNING_DEFAULTS[r.dataset.k as keyof typeof TUNING_DEFAULTS]);
    btn.click();
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('a slider changes the value at once; reset brings the defaults back', () => {
    const { btn, panel } = build();
    btn.click();
    const speed = panel.querySelector<HTMLInputElement>('input[data-k=speed]')!;
    speed.value = '2.7';
    speed.dispatchEvent(new Event('input'));
    expect(tuning.speed).toBe(2.7);
    expect(speed.parentElement!.querySelector('b')!.textContent).toBe('2.7');
    panel.querySelector<HTMLButtonElement>('#tuneReset')!.click();
    expect(tuning.speed).toBe(5.4);
    expect(speed.value).toBe('5.4');
  });

  it('"copy" puts the current values on the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { btn, panel } = build();
    btn.click();
    setTuning('speed', 4.4);
    panel.querySelector<HTMLButtonElement>('#tuneCopy')!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(tuningText()));
    expect(String(writeText.mock.calls[0])).toContain('speed = 4.4');
    expect(panel.querySelector('#tuneText')!.classList.contains('hidden')).toBe(true);
  });

  it('without a clipboard "copy" shows the text for copying by hand', async () => {
    vi.stubGlobal('navigator', {});
    const { btn, panel } = build();
    btn.click();
    panel.querySelector<HTMLButtonElement>('#tuneCopy')!.click();
    const out = panel.querySelector<HTMLTextAreaElement>('#tuneText')!;
    await vi.waitFor(() => expect(out.classList.contains('hidden')).toBe(false));
    expect(out.value).toBe(tuningText());
  });
});
