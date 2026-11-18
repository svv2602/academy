/**
 * The numbers of the controls and the camera (ARCH-14). The game and the input read `tuning` every time they use a
 * number, so a change made by the debug panel (?debug, src/ui/tuning.ts) works at once, without a reload.
 * Without ?debug nothing writes to `tuning`: it holds the defaults. No DOM and no Three.js here.
 */
export const TUNING_DEFAULTS = {
  lookX: 0.006,     // camera turn (yaw) per dragged pixel, radians
  lookY: 0.004,     // camera tilt (pitch) per dragged pixel, radians
  speed: 5.4,       // the heroine's top speed, m/s
  runFrom: 1.3,     // m/s: faster than this she runs, slower - walks (2026-11-18: at 2.6 her walk, its pace by her speed, blurred)
  joyRadius: 56,    // px: how far the joystick knob goes from where the finger landed
  joyZone: 0.4,     // share of the window width, from the left, where a touch starts the joystick
  camDist: 6.2,     // camera distance behind the heroine in a landscape window (portrait: the same proportion of 8)
} as const;

export type TuningKey = keyof typeof TUNING_DEFAULTS;
export const TUNING_KEYS = Object.keys(TUNING_DEFAULTS) as TuningKey[];

/** Slider limits of every value: min, max, step. */
export const TUNING_RANGES: Record<TuningKey, readonly [number, number, number]> = {
  lookX: [0.001, 0.02, 0.0005],
  lookY: [0.001, 0.02, 0.0005],
  speed: [1, 12, 0.1],
  runFrom: [0.5, 8, 0.1],
  joyRadius: [24, 140, 2],
  joyZone: [0.2, 0.7, 0.01],
  camDist: [3, 14, 0.1],
};

/** The current values. */
export const tuning: Record<TuningKey, number> = { ...TUNING_DEFAULTS };

/** Sets one value, kept within its slider limits. */
export function setTuning(key: TuningKey, value: number) {
  const [min, max] = TUNING_RANGES[key];
  if (Number.isFinite(value)) tuning[key] = Math.min(max, Math.max(min, value));
}

export function resetTuning() {
  Object.assign(tuning, TUNING_DEFAULTS);
}

/** Camera distance for the window's shape: a portrait window keeps the old 8 : 6.2 proportion. */
export function camDistance(aspect: number) {
  return aspect < 1 ? tuning.camDist * 8 / TUNING_DEFAULTS.camDist : tuning.camDist;
}

/** The current values as text to copy: one `name = value` line per value, in the order of the defaults. */
export function tuningText() {
  return TUNING_KEYS.map((k) => `${k} = ${+tuning[k].toFixed(4)}`).join('\n');
}
