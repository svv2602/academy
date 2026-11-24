// The walkthrough of the forest in the published build, as the part "forest" of tools/worlds.mjs: its environment and
// the check of its report (as tools/sea-pass.mjs for the sea). Node's own modules only, nothing else imported
// statically: the chain the CI plan loads (tools/worlds.mjs -> here) must not pull a package (tools/ci-pieces.test.mjs).

import { readNeed, worldPassProblems } from './world-pass.mjs';

/** The id of the forest (src/worlds/forest/index.ts). */
export const FOREST = 'forest';
/**
 * What its description must hold: the numbers of the world template (docs/13-worlds.md) - the forest is published, a
 * grey build's lesser numbers (WORLD-12) are not enough for it.
 */
export const NEED = 'template';
/**
 * The kinds of the description the walkthrough must have done in its own order: the chains, the cutscenes (the opening,
 * the return), the tour, the secrets, the owlet (the pet, found after Mudrena's chain), the finale. The two leaves of the
 * Emerald are taken inside the chains, as the sea's pearls: the finale waits for them, so a finale done says they were.
 */
export const PASS_KINDS = ['chain', 'scene', 'flyover', 'secret', 'pet', 'finale'];
/** The leaves of the artifact that lie in the forest (WORLD-08): in the hollow and in the maze. */
export const PARTS_IN_WORLD = 2;
/** The forest's secrets (src/worlds/forest/secrets.ts FOREST_SECRETS). */
export const SECRETS = ['cave', 'bounce', 'fireflies', 'ring'];
/** The task played in the forest (by "<character> <step>") and the skill it records: Mudrena's steps to her hollow (WORLD-16). */
export const WORLD_SKILLS = { 'mudrena 1': 'series' };

/**
 * The limit of the forest's walkthrough in tools/worlds.mjs, ms: the sea's (tools/sea-pass.mjs PASS_TIMEOUT_MS), a world of
 * the same size and as many chains. Inside the job's 30 minutes (.github/workflows "worlds"), with its setup.
 */
export const PASS_TIMEOUT_MS = 1200000;

/** The limit of the forest's walkthrough: E2E_RUN_TIMEOUT_MS when it is set (a run asks its own), PASS_TIMEOUT_MS else. */
export function passTimeoutMs(env) {
  return env.E2E_RUN_TIMEOUT_MS ? Number(env.E2E_RUN_TIMEOUT_MS) : PASS_TIMEOUT_MS;
}

/** The environment of tools/shot.mjs for the forest's walkthrough in the phone size, its report written to `out`. */
export function passEnv(base, out) {
  return { ...base, E2E_WORLD: FOREST, E2E_WORLD_NEED: NEED, E2E_WORLD_OUT: out, E2E_ONLY: '', E2E_MUTE: '0' };
}

/**
 * What is wrong with the report of the walkthrough (`report`: the parsed E2E_WORLD_OUT, null - none): [] when it came to
 * its end, online, every kind done, its description checked against the numbers of the template.
 */
export function passProblems(report, size = 'mobile') {
  const out = worldPassProblems(report, { world: FOREST, kinds: PASS_KINDS, parts: PARTS_IN_WORLD, secrets: SECRETS, skills: WORLD_SKILLS }, size);
  const want = readNeed(NEED).label;
  if (report && report.need !== want) out.push(`its description was checked against ${report.need ?? 'nothing the report shows'}, not ${want}`);
  return out;
}
