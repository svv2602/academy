// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CONTROLS, CONTROL_IDS, TUNING_DEFAULTS, TUNING_KEYS, TUNING_RANGES, applyControls, applyEffects, camDistance, controlFactor, resetTuning, setTuning, tuning, tuningText } from './tuning';
import { initInput, input, pollInput } from './input';
import { initTuningPanel } from '../ui/tuning';

afterEach(() => resetTuning());

describe('tuning values (ARCH-14)', () => {
  it('defaults are the numbers the game had before the panel', () => {
    // src/main.ts: look 0.006 / 0.004 per pixel, speed 5.4, run above 1.3, camera 6.2 (portrait 8);
    // src/core/input.ts: joystick radius 56 px, joystick zone the left 40 % of the window; src/game/player.ts: the jump 6.4 m/s.
    expect(TUNING_DEFAULTS).toEqual({ lookX: 0.006, lookY: 0.004, speed: 5.4, runFrom: 1.3, joyRadius: 56, joyZone: 0.4, joyHoldMs: 250, camDist: 6.2, jump: 6.4 });
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

  it('the text to copy holds all nine current values', () => {
    expect(tuningText().split('\n')).toEqual([
      'lookX = 0.006', 'lookY = 0.004', 'speed = 5.4', 'runFrom = 1.3', 'joyRadius = 56', 'joyZone = 0.4', 'joyHoldMs = 250', 'camDist = 6.2', 'jump = 6.4',
    ]);
    setTuning('speed', 3.1);
    setTuning('joyZone', 0.55);
    const text = tuningText();
    expect(text).toContain('speed = 3.1');
    expect(text).toContain('joyZone = 0.55');
    expect(text.split('\n')).toHaveLength(9);
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

describe('the controls the parent chose (PLAY-22)', () => {
  afterEach(() => { applyControls(undefined); });

  it('"normal" everywhere (or nothing chosen) is the defaults', () => {
    applyControls({ speed: 'normal', cam: 'normal', joy: 'normal', look: 'normal' });
    expect(tuning).toEqual(TUNING_DEFAULTS);
    applyControls(undefined);
    expect(tuning).toEqual(TUNING_DEFAULTS);
  });

  it('every step scales its values by its factor, and only them; the speed of the run scales with the speed', () => {
    applyControls({ speed: 'more', cam: 'less', joy: 'more', look: 'less' });
    expect(tuning.speed).toBeCloseTo(5.4 * 1.3, 9);
    expect(tuning.runFrom).toBeCloseTo(1.3 * 1.3, 9);
    expect(tuning.camDist).toBeCloseTo(6.2 * 0.8, 9);
    expect(tuning.joyRadius).toBeCloseTo(56 * 1.3, 9);
    expect(tuning.lookX).toBeCloseTo(0.006 * 0.75, 12);
    expect(tuning.lookY).toBeCloseTo(0.004 * 0.75, 12);
    expect([tuning.joyZone, tuning.joyHoldMs]).toEqual([TUNING_DEFAULTS.joyZone, TUNING_DEFAULTS.joyHoldMs]);
    applyControls({ speed: 'less', cam: 'more' });
    expect([tuning.speed, tuning.runFrom, tuning.camDist]).toEqual([5.4 * 0.75, 1.3 * 0.75, 6.2 * 1.25]);
    expect([tuning.joyRadius, tuning.lookX]).toEqual([56, 0.006]);
  });

  it('the factors are those offered: 0.75 / 1 / 1.3, the camera 0.8 / 1 / 1.25; every scaled value stays on its slider', () => {
    expect(Object.fromEntries(CONTROL_IDS.map((id) => [id, CONTROLS[id].factors]))).toEqual({
      speed: [0.75, 1, 1.3], cam: [0.8, 1, 1.25], joy: [0.75, 1, 1.3], look: [0.75, 1, 1.3] });
    for (const id of CONTROL_IDS) for (const f of CONTROLS[id].factors) for (const k of CONTROLS[id].keys) {
      expect(TUNING_DEFAULTS[k] * f).toBeGreaterThanOrEqual(TUNING_RANGES[k][0]);
      expect(TUNING_DEFAULTS[k] * f).toBeLessThanOrEqual(TUNING_RANGES[k][1]);
    }
  });

  it('a portrait window keeps the proportion of 8 : 6.2 for the chosen camera too', () => {
    applyControls({ cam: 'more' });
    expect(camDistance(16 / 9)).toBeCloseTo(6.2 * 1.25, 9);
    expect(camDistance(390 / 844)).toBeCloseTo(8 * 1.25, 9);
  });

  it('an unknown step is "normal"', () => {
    applyControls({ speed: 'fast' as never });
    expect(tuning.speed).toBe(5.4);
    expect(controlFactor({}, 'cam')).toBe(1);
  });

  it('the debug panel works over the choice, and its reset brings the choice back, not the bare defaults', () => {
    applyControls({ speed: 'more' });
    setTuning('speed', 3);
    expect(tuning.speed).toBe(3);
    resetTuning();
    expect(tuning.speed).toBeCloseTo(5.4 * 1.3, 9);
    applyControls(undefined);
    resetTuning();
    expect(tuning.speed).toBe(5.4);
  });
});

describe('the potions over the parent\'s choice (src/game/supplies.ts)', () => {
  afterEach(() => { applyEffects({}); applyControls(undefined); });

  it('multiply the parent\'s choice; the next call replaces them; none is the choice again', () => {
    applyControls({ speed: 'more' });
    applyEffects({ speed: 1.5, jump: 2 });
    expect(tuning.speed).toBeCloseTo(5.4 * 1.3 * 1.5);
    expect(tuning.runFrom).toBeCloseTo(1.3 * 1.3);
    expect(tuning.jump).toBeCloseTo(12.8);
    applyEffects({ camDist: 0.5 });
    expect([tuning.speed, tuning.jump]).toEqual([5.4 * 1.3, 6.4]);
    expect(tuning.camDist).toBeCloseTo(3.1);
    applyEffects({});
    expect(tuning.camDist).toBe(6.2);
  });

  it('a new choice of the parent keeps the potion; the panel\'s reset brings both back', () => {
    applyEffects({ speed: 1.5 });
    applyControls({ speed: 'less' });
    expect(tuning.speed).toBeCloseTo(5.4 * 0.75 * 1.5);
    setTuning('speed', 2);
    resetTuning();
    expect(tuning.speed).toBeCloseTo(5.4 * 0.75 * 1.5);
  });
});
