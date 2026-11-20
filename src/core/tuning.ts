/**
 * The numbers of the controls and the camera (ARCH-14). The game and the input read `tuning` every time they use a
 * number, so a change made by the debug panel (?debug, src/ui/tuning.ts) works at once, without a reload.
 * Without ?debug only the parent's choice (PLAY-22, `applyControls`) and the potion she drank (src/game/supplies.ts,
 * `applyEffects`) write to `tuning`: the defaults times the chosen factors times the potion's. The debug panel works
 * over that, and its "reset" brings the choice and the potion back, not the bare defaults.
 * No DOM and no Three.js here.
 */
export const TUNING_DEFAULTS = {
  lookX: 0.006,     // camera turn (yaw) per dragged pixel, radians
  lookY: 0.004,     // camera tilt (pitch) per dragged pixel, radians
  speed: 5.4,       // the heroine's top speed, m/s
  runFrom: 1.3,     // m/s: faster than this she runs, slower - walks (2026-11-18: at 2.6 her walk, its pace by her speed, blurred)
  joyRadius: 56,    // px: how far the joystick knob goes from where the finger landed
  joyZone: 0.4,     // share of the window width, from the left, where a touch starts the joystick
  joyHoldMs: 250,   // ms a finger held still in the joystick zone before the ring shows (a drag shows it at once)
  camDist: 6.2,     // camera distance behind the heroine in a landscape window (portrait: the same proportion of 8)
  jump: 6.4,        // m/s: the speed upwards the jump starts with (gravity 17 m/s²: about 1.2 m high)
} as const;

/** m/s²: what pulls her down in a jump - not tuned: with `jump`, how high she jumps (src/game/collections.ts `jumpApex`). */
export const GRAVITY = 17;

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
  joyHoldMs: [0, 800, 10],
  camDist: [3, 14, 0.1],
  jump: [3, 14, 0.1],
};

/** The current values. */
export const tuning: Record<TuningKey, number> = { ...TUNING_DEFAULTS };
/** The values the parent's choice gives (the defaults when nothing is chosen). */
const base: Record<TuningKey, number> = { ...TUNING_DEFAULTS };
/** The factors of the potions acting now (src/game/supplies.ts), over the parent's choice; none - 1. */
let effects: Partial<Record<TuningKey, number>> = {};
/** The parent's choice times the potions': what the game reads, and what "reset" of the panel brings back. */
const current = () => { for (const k of TUNING_KEYS) tuning[k] = base[k] * (effects[k] ?? 1); };

/**
 * The four controls the parent chooses in the parents' section (PLAY-22), each in three steps, "normal" the defaults:
 * the factor of every step and the values it scales. The speed scales the speed at which she starts to run with it
 * (otherwise "slow" would be a walk all the time and "fast" a run at a light touch). The joystick scales how far its
 * knob goes, not the zone where a touch starts it: a wider zone would take the room of the camera's drag.
 */
export const CONTROLS = {
  speed: { keys: ['speed', 'runFrom'], factors: [0.75, 1, 1.3] },
  cam: { keys: ['camDist'], factors: [0.8, 1, 1.25] },
  joy: { keys: ['joyRadius'], factors: [0.75, 1, 1.3] },
  look: { keys: ['lookX', 'lookY'], factors: [0.75, 1, 1.3] },
} as const satisfies Record<string, { keys: readonly TuningKey[]; factors: readonly [number, number, number] }>;
export type ControlId = keyof typeof CONTROLS;
export const CONTROL_IDS = Object.keys(CONTROLS) as ControlId[];
/** The three steps of a control, in the order of its factors; "normal" is the middle one. */
export const CONTROL_STEPS = ['less', 'normal', 'more'] as const;
export type ControlStep = (typeof CONTROL_STEPS)[number];
export type Controls = Partial<Record<ControlId, ControlStep>>;

/** The factor of `id` for the choice `c` (a missing or unknown step is "normal"). */
export function controlFactor(c: Controls | undefined, id: ControlId): number {
  const i = CONTROL_STEPS.indexOf(c?.[id] as ControlStep);
  return CONTROLS[id].factors[i < 0 ? 1 : i];
}

/** Sets `tuning` to the defaults times the parent's choice; what the debug panel changed is replaced by it. */
export function applyControls(c: Controls | undefined) {
  Object.assign(base, TUNING_DEFAULTS);
  for (const id of CONTROL_IDS) for (const k of CONTROLS[id].keys) base[k] = TUNING_DEFAULTS[k] * controlFactor(c, id);
  current();
}

/**
 * The potions acting now (src/game/supplies.ts): their factors over the parent's choice, all at once - the factors
 * given replace the ones before (an empty object: no potion). What the debug panel changed is replaced too.
 */
export function applyEffects(f: Partial<Record<TuningKey, number>>) {
  effects = { ...f };
  current();
}

/** Sets one value, kept within its slider limits. */
export function setTuning(key: TuningKey, value: number) {
  const [min, max] = TUNING_RANGES[key];
  if (Number.isFinite(value)) tuning[key] = Math.min(max, Math.max(min, value));
}

/** The panel's "reset": the values of the parent's choice and of the potions acting (the defaults when there are none). */
export function resetTuning() {
  current();
}

/** Camera distance for the window's shape: a portrait window keeps the old 8 : 6.2 proportion. */
export function camDistance(aspect: number) {
  return aspect < 1 ? tuning.camDist * 8 / TUNING_DEFAULTS.camDist : tuning.camDist;
}

/** The current values as text to copy: one `name = value` line per value, in the order of the defaults. */
export function tuningText() {
  return TUNING_KEYS.map((k) => `${k} = ${+tuning[k].toFixed(4)}`).join('\n');
}
