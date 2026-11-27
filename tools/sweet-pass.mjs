// The walkthrough of the published Sweet Land, as the part "sweet" of tools/worlds.mjs plays it in the published build:
// its environment and the check of its report. The world's own lists (its secrets, its rubies in the world, the tasks
// played in it, the kinds) are the grey build's (tools/sweet-grey.mjs), one list for both; what differs is the need -
// the numbers of the world template, not a grey build's lesser ones (WORLD-12).
import { PARTS_IN_WORLD, PASS_KINDS, PASS_TIMEOUT_MS, SECRETS, SWEET, WORLD_SKILLS } from './sweet-grey.mjs';
import { readNeed, worldPassProblems } from './world-pass.mjs';

export { PARTS_IN_WORLD, PASS_KINDS, PASS_TIMEOUT_MS, SECRETS, SWEET, WORLD_SKILLS };
/** What its description must hold once published: the numbers of the world template (docs/13-worlds.md). */
export const NEED = 'template';

/** The limit of the walkthrough: E2E_RUN_TIMEOUT_MS when it is set (a run asks its own), PASS_TIMEOUT_MS else. */
export function passTimeoutMs(env) {
  return env.E2E_RUN_TIMEOUT_MS ? Number(env.E2E_RUN_TIMEOUT_MS) : PASS_TIMEOUT_MS;
}

/** The environment of tools/shot.mjs for the walkthrough in the phone size, with the voice, its report written to `out`. */
export function passEnv(base, out) {
  return { ...base, E2E_WORLD: SWEET, E2E_WORLD_NEED: NEED, E2E_WORLD_OUT: out, E2E_ONLY: '', E2E_MUTE: '0' };
}

/**
 * What is wrong with the report of the walkthrough (`report`: the parsed E2E_WORLD_OUT, null - none): [] when it came to
 * its end, online, every kind done, both rubies of the world in its description, the six secrets found, every task of
 * the world played and recorded as it must be, its description checked against the numbers of the template.
 */
export function passProblems(report, size = 'mobile') {
  const out = worldPassProblems(report, { world: SWEET, kinds: PASS_KINDS, parts: PARTS_IN_WORLD, secrets: SECRETS, skills: WORLD_SKILLS }, size);
  const want = readNeed(NEED).label;
  if (report && report.need !== want) out.push(`its description was checked against ${report.need ?? 'nothing the report shows'}, not ${want}`);
  return out;
}
