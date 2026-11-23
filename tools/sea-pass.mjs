// The walkthrough of the sea in the grey build, as a part of tools/worlds.mjs ("sea-grey") and of tools/sea-grey.mjs:
// its environment and the check of its report. Node's own modules only, nothing else imported statically: the chain the
// CI plan loads (tools/worlds.mjs -> here) must not pull a package (tools/ci-pieces.test.mjs).

import { reportProblems } from './world-pass.mjs';

/** The id of the sea (src/worlds/sea/index.ts). */
export const SEA = 'sea';
/**
 * The kinds of the description the walkthrough must have done in its own order: the chains, the tour, the secrets, the
 * finale. The pearls in the world are taken inside the chains (as the Sweet Land's rubies), not as items of their own:
 * the finale waits for them, so a finale done says they were.
 */
export const PASS_KINDS = ['chain', 'flyover', 'secret', 'finale'];
/** The pearls of the artifact that lie in the sea (WORLD-08): in the corals and in the cabin. */
export const PARTS_IN_WORLD = 2;
/** The sea's secrets (src/worlds/sea/secrets.ts SEA_SECRETS). */
export const SECRETS = ['ship_chest', 'bubble_lift', 'echo_shells', 'whale'];
/**
 * The tasks played in the sea (by "<character> <step>") and the skill each records: Khvylia's shell lock
 * (src/worlds/sea/lock.ts, `compose`) and Pantsyr's second half (WORLD-18, `pattern`).
 */
export const WORLD_SKILLS = { 'khvylia 2': 'compose', 'pantsyr 0': 'pattern' };

/** The environment of tools/shot.mjs for the sea's walkthrough in the phone size, its report written to `out`. */
export function passEnv(base, out) {
  return { ...base, E2E_WORLD: SEA, E2E_WORLD_NEED: 'grey', E2E_WORLD_OUT: out, E2E_ONLY: '', E2E_MUTE: '0' };
}

/** What is wrong with the report of the walkthrough (`report`: the parsed E2E_WORLD_OUT, null - none): [] when it came to its end, online, every kind done. */
export function passProblems(report, size = 'mobile') {
  const out = reportProblems(report, { world: SEA, size, offline: false, kinds: PASS_KINDS, inWorld: true });
  if (!report) return out;
  const items = report.items ?? [], did = new Set(report.order ?? []);
  const parts = items.filter((i) => i.kind === 'part').length;
  if (parts < PARTS_IN_WORLD) out.push(`the description has ${parts} part(s) of the artifact in the world, ${PARTS_IN_WORLD} expected`);
  for (const id of SECRETS) {
    if (!items.some((i) => i.kind === 'secret' && i.id === id)) out.push(`the description has no secret "${id}"`);
    else if (!did.has(id)) out.push(`the secret "${id}" was not found by the pass`);
  }
  for (const [key, skill] of Object.entries(WORLD_SKILLS)) {
    if (!(report.worldTasks ?? []).includes(key)) { out.push(`the task in the world "${key}" was not played by the pass`); continue; }
    const got = report.worldSkills?.[key];
    if (got !== skill) out.push(`the task in the world "${key}" recorded ${got === undefined ? 'nothing the report shows' : got === null ? 'no skill' : `the skill "${got}"`}, "${skill}" expected`);
  }
  return out;
}
