// The walkthrough of the sea, as the part "sea" of tools/worlds.mjs (in the published build) and of tools/sea-grey.mjs:
// its environment and the check of its report. Node's own modules only, nothing else imported statically: the chain the
// CI plan loads (tools/worlds.mjs -> here) must not pull a package (tools/ci-pieces.test.mjs).

import { readNeed, worldPassProblems } from './world-pass.mjs';

/** The id of the sea (src/worlds/sea/index.ts). */
export const SEA = 'sea';
/**
 * What its description must hold: the numbers of the world template (docs/13-worlds.md) - the sea is published
 * (2026-11-24), a grey build's lesser numbers (WORLD-12) are not enough for it.
 */
export const NEED = 'template';
/**
 * The kinds of the description the walkthrough must have done in its own order: the chains, the cutscenes (the opening,
 * the pearl's return), the tour, the secrets, Bulchik the pet (found after Bulk's chain), the finale. The pearls in the world are taken inside the chains (as the Sweet Land's rubies), not as items of their own:
 * the finale waits for them, so a finale done says they were.
 */
export const PASS_KINDS = ['chain', 'scene', 'flyover', 'secret', 'pet', 'finale'];
/** The pearls of the artifact that lie in the sea (WORLD-08): in the corals and in the cabin. */
export const PARTS_IN_WORLD = 2;
/** The sea's secrets (src/worlds/sea/secrets.ts SEA_SECRETS). */
export const SECRETS = ['ship_chest', 'bubble_lift', 'echo_shells', 'whale'];
/**
 * The tasks played in the sea (by "<character> <step>") and the skill each records: Khvylia's shell lock
 * (src/worlds/sea/lock.ts, `compose`) and Pantsyr's second half (WORLD-18, `pattern`).
 */
export const WORLD_SKILLS = { 'khvylia 2': 'compose', 'pantsyr 0': 'pattern' };

/**
 * The limit of the sea's walkthrough in tools/worlds.mjs, ms. It is the longest world walked there: on the CI runner
 * (swiftshader, ~1 fps) it took 8.4-10 min of the shared 10 (E2E_RUN_TIMEOUT_MS, 600000) - its chains 5.5-6.3 min,
 * the secrets 1-1.5, the two cut-scenes half a minute - and was killed at 10 once. Twice the slowest seen, inside the
 * job's 30 minutes with its setup (.github/workflows/ci.yml "worlds", tools/ci-pieces.test.mjs).
 */
export const PASS_TIMEOUT_MS = 1200000;

/** The limit of the sea's walkthrough: E2E_RUN_TIMEOUT_MS when it is set (a run asks its own), PASS_TIMEOUT_MS else. */
export function passTimeoutMs(env) {
  return env.E2E_RUN_TIMEOUT_MS ? Number(env.E2E_RUN_TIMEOUT_MS) : PASS_TIMEOUT_MS;
}

/** The environment of tools/shot.mjs for the sea's walkthrough in the phone size, its report written to `out`. */
export function passEnv(base, out) {
  return { ...base, E2E_WORLD: SEA, E2E_WORLD_NEED: NEED, E2E_WORLD_OUT: out, E2E_ONLY: '', E2E_MUTE: '0' };
}

/**
 * What is wrong with the report of the walkthrough (`report`: the parsed E2E_WORLD_OUT, null - none): [] when it came to
 * its end, online, every kind done, its description checked against the numbers of the template.
 */
export function passProblems(report, size = 'mobile') {
  const out = worldPassProblems(report, { world: SEA, kinds: PASS_KINDS, parts: PARTS_IN_WORLD, secrets: SECRETS, skills: WORLD_SKILLS }, size);
  const want = readNeed(NEED).label;
  if (report && report.need !== want) out.push(`its description was checked against ${report.need ?? 'nothing the report shows'}, not ${want}`);
  return out;
}
