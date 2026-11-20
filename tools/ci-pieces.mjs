// Which jobs a run of ci.yml plays, chosen by the files that changed (ARCH-16), and whether "check" may pass:
//   node tools/ci-pieces.mjs plan            the job "plan" of ci.yml: asks git for the changed files (the event comes
//                                            in CI_EVENT, CI_REF, CI_PR_BASE), prints the plan and writes it to
//                                            $GITHUB_OUTPUT: matrix, jobs, walk, worlds, report
//   node tools/ci-pieces.mjs pick <file>...  the same plan for the files given, printed only (to try a set of files)
//   node tools/ci-pieces.mjs check           the job "check" of ci.yml: compares the result of every job (PLAN_RESULT,
//                                            BUILD_RESULT, WALK_RESULT, WORLDS_RESULT) with what the plan expected
//                                            (PLAN_WALK, PLAN_WORLDS) and prints what was skipped and why (PLAN_REPORT)
// The rule (tools/world-pieces.mjs lists the worlds, their folders and their jobs):
//   only documents changed (docs/**, *.md, .claude/**)  -> no walkthrough, no probe world: unit tests and build only
//   files of a world (and maybe documents)              -> the jobs of that world; of several worlds - of each of them
//   any other file - a shared one                       -> everything
//   the changed files are not known, or there are none  -> everything
//   a push to dev, whatever it changed                  -> everything, unless this very commit was already played
//                                                          green on its branch (`rests` below): then nothing again
// The plan is for the branches the work is brought on. On dev a commit is not played a second time: the gate into dev
// is a green run of the branch on this very commit, and the push that merges it would only repeat that run. A push to
// dev rests on such a run when it finds one - a completed, successful run of ci.yml started by a push, on this commit,
// that is not this run, not a trial (try/**) and not one started by hand - AND either
//   (a) that run played everything (every walkthrough and every part of the probe world succeeded, none skipped), or
//   (b) that run played less, by its plan, and the head dev had before this push (`before`) has a completed,
//       successful run of ci.yml on dev: the plan of a branch counts its files from dev, so "green by the plan" on top
//       of a green head is as good as everything - and on top of a red or unknown head it is not.
// In every other case - no such run, a red, cancelled or running one, a question to GitHub that failed - everything is
// played. So a green "check" on a commit of dev still means: all of it was played green on this tree, here or in the
// run named in the log of "check" (by induction over the heads of dev).
// Whenever in doubt, everything is played: "check" is the gate into dev and the status the protection of main asks for.
// pages.yml does not use this file: before a publication everything is played, always.
//   node tools/ci-pieces.mjs results <from> <to>     the job "check": of the results the walkthroughs left, the ones of the
//                                            last attempt of each (`lastAttempts` below), laid out for --combine
//   node tools/ci-pieces.mjs try <branch> <commit>   the job "plan" of try.yml: reads what to try from the name of the
//                                            branch (`tryPlan` below) and writes it to $GITHUB_OUTPUT
// Exit code: 0 - done (check: every job ended as planned); 1 - check failed; 2 - bad arguments.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIECES } from './e2e-saves.mjs';
import { SIZES, WORLDS } from './world-pieces.mjs';
import { PARTS } from './worlds.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The branch the work is merged into: the other branches are compared with it; a push to it plays everything or rests on a run of its commit (`rests`). */
export const GATE = 'dev';
/** A file that belongs to no world and is no document. */
export const SHARED = 'shared';
/** A file that cannot change the game or its checks: nothing is played for it. */
export const DOCS = 'docs';
/** How many changed files the report lists by name; the rest are counted. */
export const MAX_LISTED = 40;

/** Whose file `path` is: DOCS, the id of one of `worlds`, or SHARED. A document inside a world's folder is a document. */
export function ownerOf(path, worlds = WORLDS) {
  if (path.startsWith('docs/') || path.startsWith('.claude/') || path.endsWith('.md')) return DOCS;
  for (const [id, w] of Object.entries(worlds)) if (w.files.some((dir) => path.startsWith(dir))) return id;
  return SHARED;
}

/**
 * The plan of a run for the changed `files` (paths from the root of the repository; null or not a list: not known).
 * Returns { all, play, walk, worlds, reason, files }: `play` - the ids of the worlds to play, `walk` - their
 * walkthrough jobs ({ size, group }), `worlds` - whether the job "worlds" (the probe world) is played, `all` - true
 * when everything is played, `files` - each changed file with its owner.
 */
export function pick(files, worlds = WORLDS) {
  const ids = Object.keys(worlds);
  const plan = (play, reason, list = []) => {
    const walk = [];
    for (const id of play) for (const j of worlds[id].walk) if (!walk.some((x) => x.size === j.size && x.group === j.group)) walk.push({ size: j.size, group: j.group });
    return { all: play.length === ids.length, play, walk, worlds: play.some((id) => worlds[id].worlds), reason, files: list };
  };
  if (!Array.isArray(files) || files.some((f) => typeof f !== 'string' || !f)) return plan(ids, 'the changed files are not known: everything is played');
  const list = files.map((path) => ({ path, owner: ownerOf(path, worlds) }));
  if (!list.length) return plan(ids, 'no changed file was found, there is nothing to choose by: everything is played');
  if (list.some((f) => f.owner === SHARED)) return plan(ids, 'shared files changed: everything is played', list);
  const play = ids.filter((id) => list.some((f) => f.owner === id));
  if (!play.length) return plan([], 'only documents changed (docs/**, *.md, .claude/**): unit tests and build only', list);
  return plan(play, `only files of ${play.length > 1 ? 'the worlds' : 'the world'} ${play.join(', ')} changed${list.some((f) => f.owner === DOCS) ? ' (and documents)' : ''}: only ${play.length > 1 ? 'their' : 'its'} jobs are played`, list);
}

const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const lastLine = (text) => String(text).trim().split('\n').pop().trim();
/**
 * The files changed by what this run checks: { files, why }. `files` is null whenever they are not to be chosen by -
 * a push to dev, a run started by hand - or cannot be told - the commit to compare with is not in the clone, git
 * failed - and then everything is played. `git(args)` runs git in the repository and returns its output, or throws.
 *   push to dev        not compared with anything (git is not asked): played whole, unless `rests` finds its run
 *   push elsewhere     the common ancestor with origin/dev .. HEAD: the whole branch, not only its last push
 *   pull request       its base (`prBase`) .. HEAD
 * A renamed file counts under both names, a deleted one under its own (--no-renames).
 */
export function changedFiles({ event = '', ref = '', prBase = '' }, git) {
  const unknown = (why) => ({ files: null, why });
  try {
    let base, from;
    if (event === 'push' && ref === `refs/heads/${GATE}`) return unknown(`a push to ${GATE}: the branch the work is merged into is played whole`);
    if (event === 'push') {
      base = git(['merge-base', `origin/${GATE}`, 'HEAD']).trim(); from = `the common ancestor with origin/${GATE}`;
      if (!COMMIT.test(base)) return unknown(`no common ancestor with origin/${GATE}`);
    } else if (event === 'pull_request') {
      if (!COMMIT.test(prBase)) return unknown('a pull request without the commit of its base');
      base = prBase; from = 'the base of the pull request';
    } else return unknown(event === 'workflow_dispatch' ? 'the run was started by hand' : `the event "${event}" has no commit to compare with`);
    git(['cat-file', '-e', `${base}^{commit}`]);   // not in the clone (a rewritten branch): throws
    const files = git(['diff', '--name-only', '--no-renames', '-z', base, 'HEAD']).split('\0').filter(Boolean);
    return { files, why: `${from}, ${base.slice(0, 7)}..HEAD` };
  } catch (e) {
    return unknown(`git failed (${lastLine(e?.message ?? e)})`);
  }
}

// A file name is printed into the log and into an output of the job: no control characters, no endless names, and no
// "::" - a line of the log that starts with it (spaces before it do not count) is a command to the runner, and a file
// named like one must not give it.
const shown = (path) => path.replace(/[\u0000-\u001f\u007f]/g, '?').replace(/::/g, ': :').slice(0, 200);
/**
 * The plan in words, for the log of "plan" and of "check": the reason, what was compared, the jobs, the files.
 * `changed` - what changedFiles() returned: with `files` null its `why` says why the files are not known.
 */
export function report(plan, changed = {}) {
  const lines = [`reason: ${plan.reason}`];
  if (changed.why) lines.push(changed.files ? `compared with: ${changed.why}` : `the changed files are not known: ${changed.why}`);
  lines.push(plan.walk.length ? `walkthroughs: planned, ${plan.walk.length} jobs (${plan.walk.map((j) => `${j.size} ${j.group}`).join(', ')})` : 'walkthroughs: skipped by the plan');
  lines.push(plan.worlds ? 'probe world (the job "worlds"): planned' : 'probe world (the job "worlds"): skipped by the plan');
  const n = plan.files.length;
  if (n) {
    lines.push(`changed files (${n}):`);
    for (const f of plan.files.slice(0, MAX_LISTED)) lines.push(`  ${shown(f.path)} [${f.owner === DOCS ? 'document' : f.owner === SHARED ? 'shared' : `world ${f.owner}`}]`);
    if (n > MAX_LISTED) lines.push(`  ... and ${n - MAX_LISTED} more (${n} in all)`);
  } else lines.push('changed files: none to list');
  return lines;
}

/** What the job "plan" hands to the other jobs: the matrix of the walkthroughs, their list for --combine --jobs, the two switches. */
export function outputs(plan, changed = {}) {
  return {
    walk: plan.walk.length ? 'true' : 'false',
    worlds: plan.worlds ? 'true' : 'false',
    jobs: plan.walk.map((j) => `${j.size}:${j.group}`).join(','),
    matrix: JSON.stringify({ include: plan.walk }),
    report: report(plan, changed).join('\n'),
  };
}

/**
 * May "check" pass? `results` - the result of each job as GitHub reports it (success, failure, cancelled, skipped);
 * `expected` - what the plan asked for: walk and worlds, each 'true' or 'false'.
 * The plan and the build must have succeeded; a planned job must have succeeded; a job that was not planned must have
 * been skipped; anything else - a failed plan with no answer, a planned job skipped because another one failed - fails.
 * Returns { ok, lines, bad, combine }: `combine` - whether the checks over all sizes (--combine) have something to read.
 */
export function verdict({ plan = '', build = '', walk = '', worlds = '' } = {}, expected = {}) {
  const lines = [], bad = [];
  const must = (name, result) => {
    lines.push(`${name}: ${result || 'no result'}`);
    if (result !== 'success') bad.push(`${name}: ${result || 'no result'}, not success`);
  };
  const planned = (name, flag, result) => {
    if (flag === 'true') {
      lines.push(`${name}: ${result || 'no result'} (planned)`);
      if (result !== 'success') bad.push(`${name}: planned, but ended as ${result || 'no result'}, not success`);
    } else if (flag === 'false') {
      lines.push(`${name}: ${result || 'no result'} - SKIPPED BY THE PLAN`);
      if (result !== 'skipped') bad.push(`${name}: not planned, but ended as ${result || 'no result'}, not skipped`);
    } else {
      lines.push(`${name}: ${result || 'no result'} (the plan gave no answer)`);
      bad.push(`${name}: the plan does not say whether to play it ("${flag ?? ''}")`);
    }
  };
  must('plan', plan);
  must('unit tests and build', build);
  planned('walkthroughs', expected.walk, walk);
  planned('probe world', expected.worlds, worlds);
  return { ok: !bad.length, lines, bad, combine: expected.walk === 'true' };
}

// ---- a push to dev does not play its commit a second time ----
/** The names ci.yml gives the jobs that play the game (tools/ci-pieces.test.mjs holds them to the workflow). */
export const walkJobName = (size, group) => `walkthrough ${size} ${group}`;
export const worldsJobName = (part) => `worlds (probe world, ${part})`;
/** Every job that plays the game, by the name GitHub lists it under: what "everything was played" means. */
export const PLAYING_JOBS = [...SIZES.flatMap((size) => PIECES.map((group) => walkJobName(size, group))), ...PARTS.map(worldsJobName)];
const NO_COMMIT = /^0+$/;
const short = (sha) => String(sha ?? '').slice(0, 7);

/**
 * May a push to dev rest on a run already played on its commit (the rule: the head of this file)?
 *   sha, runId - the commit and the run of this push; before - the head dev had before it;
 *   runs       - the runs of ci.yml on `sha`, as GitHub lists them ({ id, event, status, conclusion, head_branch, head_sha });
 *   jobsOf(id) - the jobs of a run ({ name, conclusion }), asked only for a run that may be rested on;
 *   beforeRuns() - the runs of ci.yml on `before`, asked only when (b) is to be decided.
 * `jobsOf` and `beforeRuns` may throw (GitHub did not answer): that is a "no" with the reason.
 * Returns { ok, basis: 'a' | 'b' | null, run: the run rested on | null, why: one line for the log }.
 */
export function rests({ sha, runId, before }, { runs, jobsOf, beforeRuns }) {
  const no = (why) => ({ ok: false, basis: null, run: null, why: `${why}: everything is played` });
  if (!COMMIT.test(String(sha ?? ''))) return no('the commit of this push is not known');
  if (!Array.isArray(runs)) return no('GitHub did not list the runs of this commit');
  const own = String(runId ?? '');
  const others = runs.filter((r) => r && String(r.id) !== own && r.head_sha === sha);
  const usable = others.filter((r) => r.event === 'push' && r.status === 'completed' && r.conclusion === 'success' && typeof r.head_branch === 'string' && !r.head_branch.startsWith('try/'));
  if (!usable.length) {
    if (!others.length) return no(`no other run of ci.yml on ${short(sha)}`);
    const seen = others.slice(0, 5).map((r) => `#${r.id} ${r.event} on ${r.head_branch}: ${r.status === 'completed' ? r.conclusion : r.status}`).join('; ');
    return no(`no completed, successful run by a push on ${short(sha)} (found: ${seen})`);
  }
  const reasons = [];
  let beforeGreen = null;   // asked once, only if a run that played less is met
  for (const run of usable) {
    const name = `run #${run.id} (branch ${run.head_branch})`;
    let jobs;
    try { jobs = jobsOf(run.id); } catch (e) { reasons.push(`${name}: GitHub did not list its jobs (${lastLine(e?.message ?? e)})`); continue; }
    if (!Array.isArray(jobs)) { reasons.push(`${name}: GitHub did not list its jobs`); continue; }
    const result = (job) => jobs.filter((j) => j && j.name === job).map((j) => j.conclusion);
    const failed = jobs.filter((j) => j && j.conclusion !== 'success' && j.conclusion !== 'skipped');
    if (failed.length) { reasons.push(`${name}: its job "${failed[0].name}" ended as ${failed[0].conclusion ?? 'no result'}`); continue; }
    const missing = PLAYING_JOBS.filter((job) => !(result(job).length === 1 && result(job)[0] === 'success'));
    if (!missing.length) return { ok: true, basis: 'a', run, why: `this commit was played whole by ${name}: all ${PLAYING_JOBS.length} jobs that play the game succeeded there, none was skipped` };
    // (b): it played less, by its plan - good only on top of a head of dev that is green itself
    const less = `${name} played less, by its plan (${missing.length} of ${PLAYING_JOBS.length} jobs not played, e.g. "${missing[0]}")`;
    if (beforeGreen === null) {
      if (!COMMIT.test(String(before ?? '')) || NO_COMMIT.test(before)) beforeGreen = { ok: false, why: 'the head dev had before this push is not known' };
      else {
        try {
          const list = beforeRuns();
          if (!Array.isArray(list)) beforeGreen = { ok: false, why: `GitHub did not list the runs of the head before, ${short(before)}` };
          else {
            const onDev = list.filter((r) => r && r.head_sha === before && r.head_branch === GATE && r.event === 'push');
            const green = onDev.find((r) => r.status === 'completed' && r.conclusion === 'success');
            if (green) beforeGreen = { ok: true, why: `the head before, ${short(before)}, is green on ${GATE} (run #${green.id})` };
            else if (!onDev.length) beforeGreen = { ok: false, why: `the head before, ${short(before)}, has no run of ci.yml on ${GATE}` };
            else if (onDev.some((r) => r.status === 'completed' && r.conclusion === 'cancelled') && !onDev.some((r) => r.status === 'completed' && r.conclusion === 'failure')) beforeGreen = { ok: false, why: `the run of the head before, ${short(before)}, on ${GATE} was cancelled (a newer push replaced it before it ended) - nothing is wrong with the commit, its green is just not known` };
            else beforeGreen = { ok: false, why: `the head before, ${short(before)}, is not green on ${GATE} (${onDev.map((r) => `#${r.id}: ${r.status === 'completed' ? r.conclusion : r.status}`).join('; ')})` };
          }
        } catch (e) { beforeGreen = { ok: false, why: `GitHub did not list the runs of the head before (${lastLine(e?.message ?? e)})` }; }
      }
    }
    if (beforeGreen.ok) return { ok: true, basis: 'b', run, why: `${less}, and ${beforeGreen.why}: green by the plan on top of a green head` };
    reasons.push(`${less}, and ${beforeGreen.why}`);
  }
  return no(reasons.join('; '));
}

// ---- a trial on the runner (try.yml): what to try is the name of the branch ----
/** The size that means "a part of the probe world" in the name of a trial branch. */
export const TRY_PROBE = 'probe';
export const TRY_MAX = 10;
/** The piece that means "the whole walkthrough of a size, in one session" in the name of a trial branch. */
export const TRY_ALL = 'all';
/** The whole walkthrough is long: at most this many turns of it at once. */
export const TRY_ALL_MAX = 3;
/**
 * The limits of a turn, by what is played: `runMs` - of one walkthrough process (E2E_RUN_TIMEOUT_MS), `minutes` - of
 * the job that plays it. A piece keeps the limits of the gate (the job "walk" of ci.yml and the pieces of pages.yml,
 * held so by their tests), and a part of the probe world takes them as well; the whole walkthrough is the pieces in one
 * session and has limits of its own. The job is longer than the walkthrough by the install and the download of the build.
 *
 * The numbers (2026-11-20; the slowest seen plus a quarter - one runner is up to 15 % slower than another with the same
 * commit, and each new block of a world adds 30-150 s):
 * - a piece: the slowest of the gate desktop world2, 899 s on one runner (run 44717663093) and at the limit of 1080 s on
 *   a slow one -> 1350 s, a job of 30 minutes;
 * - the whole walkthrough of the phone: 1817-2281 s in the trials of the day, a turn killed by a flaky block at 2350 s
 *   of its 2400 -> 3000 s, a job of 60 minutes; then, with the hub, the call to the Great Tree, the stars and the
 *   collections of the same day, 2716 s of 3000 on 620013e (91 %: the warning of tools/run-limit.mjs; 1780 s on
 *   410a28e) -> 3600 s, a job of 70 minutes.
 * tools/run-limit.mjs warns in the summary of every run whose walkthrough leaves less than 15 % of its limit.
 */
export const TRY_LIMITS = { piece: { runMs: 1_350_000, minutes: 30 }, all: { runMs: 3_600_000, minutes: 70 } };
// pages.yml (the job "session") and nightly.yml play the whole walkthrough with these very limits - their tests hold them so.
/** The kinds of what the jobs leave for the job that sums them up (the names: `attemptName`). */
export const RESULTS = 'results', TRY_TURN = 'try-turn';
/**
 * A trial branch is try/<size>/<piece>/x<N>/<net|offline>/<the first 7 or more characters of its commit>:
 *   size - one of the four screen sizes, or "probe" (a part of the probe world, tools/worlds.mjs);
 *   piece - a piece of the world of that size (tools/e2e-saves.mjs PIECES), "all" - the whole walkthrough of that
 *           size in one session, as `npm run e2e -- --mode <size>` plays it (x1..x3), or a part of the probe world;
 *   N - how many times it is played at once, 1..10;  net | offline - played with the network or without
 *   (a part of the probe world has its own network scenarios: only "net").
 * Returns { size, piece, n, offline, probe, all, runMs, minutes, title, matrix } (the limits: TRY_LIMITS) or { error } - a name that cannot be read is an error
 * with the reason, never "play everything": a trial nobody asked for proves nothing.
 */
export function tryPlan(branch, commit) {
  const shape = `try/<${[...SIZES, TRY_PROBE].join('|')}>/<piece>/x<1..${TRY_MAX}>/<net|offline>/<commit, 7 characters or more>`;
  // what the name holds is printed like a file name: it is written by whoever pushed the branch
  const bad = (why) => ({ error: `the trial branch "${shown(String(branch ?? ''))}": ${shown(why)}. The name is ${shape}; pieces: ${PIECES.join(', ')}, or ${TRY_ALL} (the whole walkthrough, x1..x${TRY_ALL_MAX}); parts of the probe world: ${PARTS.join(', ')}` });
  const parts = String(branch ?? '').split('/');
  if (parts[0] !== 'try') return bad('is not a trial branch (try/...)');
  if (parts.length !== 6) return bad(`has ${parts.length - 1} parts after "try", not 5`);
  const [, size, piece, times, net, sha] = parts;
  const probe = size === TRY_PROBE;
  if (!probe && !SIZES.includes(size)) return bad(`unknown size "${size}"`);
  const all = piece === TRY_ALL;   // the probe world has no such part: the check below refuses it
  if (probe ? !PARTS.includes(piece) : !all && !PIECES.includes(piece)) return bad(probe ? `unknown part of the probe world "${piece}"` : `unknown piece "${piece}"`);
  const m = /^x([1-9]\d?)$/.exec(times);
  const n = m ? Number(m[1]) : 0;
  if (!m || n > TRY_MAX) return bad(`"${times}" is not x1..x${TRY_MAX}`);
  if (all && n > TRY_ALL_MAX) return bad(`"${times}": the whole walkthrough is played x1..x${TRY_ALL_MAX} at most`);
  if (net !== 'net' && net !== 'offline') return bad(`"${net}" is neither "net" nor "offline"`);
  if (probe && net !== 'net') return bad('a part of the probe world is played with "net" only (it switches the network itself)');
  if (!/^[0-9a-f]{7,64}$/.test(sha)) return bad(`"${sha}" is not the beginning of a commit (7 or more of 0-9a-f)`);
  if (!COMMIT.test(String(commit ?? ''))) return bad('the commit of the branch is not known');
  if (!commit.startsWith(sha)) return bad(`names the commit ${sha}, but points at ${short(commit)}`);
  return {
    size, piece, n, offline: net === 'offline', probe, all, ...(all ? TRY_LIMITS.all : TRY_LIMITS.piece),
    title: `${piece} ${size} x${n}${net === 'offline' ? ' offline' : ''}`,
    matrix: { include: Array.from({ length: n }, (_, i) => ({ turn: i + 1 })) },
  };
}

/**
 * The end of a trial: `turns` - what each turn left ({ turn, ok, error }), `n` - how many were asked for.
 * Returns { ok, green, lines }: a turn that left nothing counts as red.
 */
export function tryResult(turns, n) {
  const byTurn = new Map((Array.isArray(turns) ? turns : []).filter((t) => t && Number.isInteger(t.turn)).map((t) => [t.turn, t]));
  const lines = [];
  let green = 0;
  for (let turn = 1; turn <= n; turn++) {
    const t = byTurn.get(turn);
    if (t?.ok === true) { green++; continue; }
    lines.push(`turn ${turn}: ${t ? 'RED' : 'RED - it left no result (the job did not come to its end)'}`);
    for (const l of String(t?.error ?? '').split('\n').filter(Boolean).slice(0, 30)) lines.push(`  ${shown(l)}`);
  }
  lines.unshift(`${green} of ${n} green`);
  return { ok: green === n, green, lines };
}

// ---- a job played again leaves its results again: the last attempt is chosen here, by its number ----
// A job that is played again (gh run rerun) uploads what it leaves under the same name, and the run then holds both.
// Which of the two a download by name or by pattern takes is not ours to say: on 2026-11-18 a walkthrough passed on its
// third attempt and "check" still read the failure of the second one (the newer artifact had the smaller id). So the
// name carries the number of the attempt, every artifact is downloaded into a folder of its own, and the choice is
// made here.
/** The name of what a job leaves: `<kind>-<what>-a<attempt>`, e.g. results-mobile-shop-a2, try-turn-3-a1. */
export const attemptName = (kind, what, attempt) => `${kind}-${what}-a${attempt}`;
/**
 * Of the folders `names` (one an artifact), the one of the highest attempt for each `what` of the kind `kind`.
 * Returns { chosen: [{ what, attempt, name, attempts }] in the order of `what`, ignored: the names that are not
 * `<kind>-<what>-a<attempt>` }. `attempts` - every attempt found for it, ascending.
 */
export function lastAttempts(names, kind) {
  const shape = new RegExp(`^${kind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(.+)-a([1-9]\\d*)$`);
  const by = new Map(), ignored = [];
  for (const name of Array.isArray(names) ? names : []) {
    const m = typeof name === 'string' ? shape.exec(name) : null;
    if (!m) { ignored.push(String(name)); continue; }
    const what = m[1], attempt = Number(m[2]);
    const had = by.get(what) ?? { what, attempt: 0, name: '', attempts: [] };
    had.attempts.push(attempt);
    if (attempt > had.attempt) { had.attempt = attempt; had.name = name; }
    by.set(what, had);
  }
  const chosen = [...by.values()].map((c) => ({ ...c, attempts: [...new Set(c.attempts)].sort((a, b) => a - b) }))
    .sort((a, b) => (a.what < b.what ? -1 : a.what > b.what ? 1 : 0));
  return { chosen, ignored };
}
/** The folders right under `dir` (one an artifact, as download-artifact lays out a download by pattern); none if there is no `dir`. */
const foldersOf = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
/** One line a choice, for the log: which attempt was taken of which. */
const attemptLine = (c) => `${c.what}: attempt ${c.attempt}${c.attempts.length > 1 ? ` (the last of ${c.attempts.join(', ')})` : ''}`;

/**
 * The text of the failure in the log of one turn: the errors the walkthrough lists (the block "ERRORS:" of
 * tools/shot.mjs), the lines of the steps with a tool of their own ("worlds: ...", "failures: ...", "update: ...") and
 * every line that says FAILED; with none of them,
 * the end of the log. For the summary of the run: at most 30 lines.
 */
export function turnError(log) {
  const lines = String(log ?? '').split('\n').map((l) => l.replace(/\s+$/, ''));
  const out = [];
  const add = (l) => { if (l && !out.includes(l)) out.push(l); };
  let inErrors = false;
  for (const l of lines) {
    if (l === 'ERRORS:') { inErrors = true; continue; }
    if (inErrors && (l.startsWith('[e2e]') || l === '')) inErrors = false;
    if (inErrors || /^(?:worlds|failures|update): /.test(l) || /\bFAILED\b/.test(l)) add(l);
  }
  if (!out.length) for (const l of lines.filter(Boolean).slice(-15)) add(l);
  return out.slice(0, 30).join('\n');
}

// ---- command line ----
function main(argv, env) {
  const [cmd, ...rest] = argv;
  if (cmd === 'plan' || cmd === 'pick') {
    let changed;
    if (cmd === 'pick') changed = { files: rest, why: 'the files given on the command line' };
    else {
      const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
      changed = changedFiles({ event: env.CI_EVENT, ref: env.CI_REF, prBase: env.CI_PR_BASE }, git);
    }
    let plan = pick(changed.files);
    // A push to dev: this very commit may have been played already, green, on its branch (`rests`).
    if (cmd === 'plan' && env.CI_EVENT === 'push' && env.CI_REF === `refs/heads/${GATE}`) {
      const rest = restsOnGitHub(env);
      console.log(`[ci] a push to ${GATE}: ${rest.why}`);
      if (rest.ok) plan = rested(plan, rest);
      else plan = { ...plan, reason: `a push to ${GATE}, and no run of this commit to rest on - ${rest.why}` };
    }
    const out = outputs(plan, changed);
    console.log(`[ci] plan\n${out.report}\n[ci] outputs: walk=${out.walk} worlds=${out.worlds}\n[ci] jobs=${out.jobs}\n[ci] matrix=${out.matrix}`);
    if (cmd === 'plan' && env.GITHUB_OUTPUT) {
      // The report holds file names: a delimiter nobody can guess keeps a name from ending the value early.
      const mark = `end_${randomUUID()}`;
      appendFileSync(env.GITHUB_OUTPUT, `walk=${out.walk}\nworlds=${out.worlds}\njobs=${out.jobs}\nmatrix=${out.matrix}\nreport<<${mark}\n${out.report}\n${mark}\n`);
    }
    return 0;
  }
  if (cmd === 'check' && !rest.length) {
    const v = verdict({ plan: env.PLAN_RESULT, build: env.BUILD_RESULT, walk: env.WALK_RESULT, worlds: env.WORLDS_RESULT }, { walk: env.PLAN_WALK, worlds: env.PLAN_WORLDS });
    for (const l of v.lines) console.log(`[ci] ${l}`);
    console.log(`[ci] the plan of this run:\n${env.PLAN_REPORT || '  (the plan left no report)'}`);
    if (!v.combine) console.log('[ci] the checks over all sizes (tools/e2e.mjs --combine) are NOT run: they need every size played whole, and no walkthrough was planned');
    const skipped = v.lines.filter((l) => l.endsWith('SKIPPED BY THE PLAN')).map((l) => l.split(':')[0]);
    // A notice on the page of the run: a green "check" that played less than everything says so without opening the log.
    if (v.ok && skipped.length) console.log(`::notice title=check::skipped by the plan: ${skipped.join(', ')} - ${(env.PLAN_REPORT || 'no report').split('\n')[0].replace(/::/g, ':')}`);
    if (!v.ok) { console.error(`[ci] FAILED:\n  ${v.bad.join('\n  ')}`); return 1; }
    console.log('[ci] PASSED: every job ended as planned');
    return 0;
  }
  if (cmd === 'results' && rest.length === 2) {
    // rest[0]: the folder the results were downloaded into, a folder an artifact (results-<size>-<group>-a<attempt>);
    // rest[1]: the folder tools/e2e.mjs --combine reads - the files of the last attempt of every walkthrough
    const from = resolve(rest[0]), to = resolve(rest[1]);
    const { chosen, ignored } = lastAttempts(foldersOf(from), RESULTS);
    mkdirSync(to, { recursive: true });
    for (const c of chosen) { cpSync(join(from, c.name), to, { recursive: true }); console.log(`[ci] results of ${attemptLine(c)}`); }
    for (const name of ignored) console.log(`[ci] not the results of a walkthrough, left out: ${shown(name)}`);
    if (!chosen.length) console.log(`[ci] no results of a walkthrough in ${shown(rest[0])}: the checks over all sizes will say what is missing`);
    return 0;
  }
  if (cmd === 'try' && rest.length === 2) {
    const t = tryPlan(rest[0], rest[1]);
    if (t.error) { console.error(`[ci] ${t.error}`); return 1; }
    const what = t.probe ? `the part "${t.piece}" of the probe world` : `${t.all ? 'the whole walkthrough' : `the piece "${t.piece}"`} in the size ${t.size}, ${t.offline ? 'without the network' : 'with the network'}`;
    console.log(`[ci] trial: ${t.title} (${what}, ${t.n} time(s); a walkthrough within ${t.runMs / 60000} min, a turn within ${t.minutes} min)`);
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `size=${t.size}\npiece=${t.piece}\nn=${t.n}\noffline=${t.offline ? 'true' : 'false'}\nprobe=${t.probe ? 'true' : 'false'}\nall=${t.all ? 'true' : 'false'}\nrun_ms=${t.runMs}\nminutes=${t.minutes}\ntitle=${t.title}\nmatrix=${JSON.stringify(t.matrix)}\n`);
    return 0;
  }
  if (cmd === 'try-turn' && rest.length === 3) {
    // rest: the number of the turn, the outcome of its step as GitHub names it (success, failure...), its log
    const turn = Number(rest[0]);
    if (!Number.isInteger(turn) || turn < 1 || turn > TRY_MAX) { console.error(`[ci] try-turn: "${rest[0]}" is not 1..${TRY_MAX}`); return 2; }
    const ok = rest[1] === 'success';
    let log = '';
    try { log = readFileSync(resolve(rest[2]), 'utf8'); } catch { /* no log: the step did not start */ }
    const left = { turn, ok, error: ok ? '' : turnError(log) || `the step ended as "${rest[1]}" and left no log` };
    writeFileSync(`turn-${turn}.json`, JSON.stringify(left));
    console.log(`[ci] turn ${turn}: ${ok ? 'green' : `RED\n${left.error}`}`);
    return 0;
  }
  if (cmd === 'try-result' && rest.length === 2) {
    // rest[0]: the folder with what the turns left (turn-<i>.json, anywhere under it); rest[1]: how many were asked for
    const n = Number(rest[1]);
    if (!Number.isInteger(n) || n < 1 || n > TRY_MAX) { console.error(`[ci] try-result: "${rest[1]}" is not 1..${TRY_MAX}`); return 2; }
    // a folder an artifact (try-turn-<turn>-a<attempt>): of a turn played again, only its last attempt is read
    const turns = [], from = resolve(rest[0]);
    const { chosen } = lastAttempts(foldersOf(from), TRY_TURN);
    for (const c of chosen) {
      console.log(`[ci] turn ${attemptLine(c)}`);
      for (const e of readdirSync(join(from, c.name))) {
        if (!/^turn-\d+\.json$/.test(e)) continue;
        try { turns.push(JSON.parse(readFileSync(join(from, c.name, e), 'utf8'))); } catch { /* an unreadable result is no result */ }
      }
    }
    const r = tryResult(turns, n);
    for (const l of r.lines) console.log(`[ci] ${l}`);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${r.lines[0]}\n\n\`\`\`\n${r.lines.slice(1).join('\n') || 'every turn passed'}\n\`\`\`\n`);
    return r.ok ? 0 : 1;
  }
  console.error('[ci] usage: node tools/ci-pieces.mjs plan | pick <file>... | check | results <from> <to> | try <branch> <commit> | try-turn <turn> <outcome> <log> | try-result <folder> <n>');
  return 2;
}

/** The plan of a push to dev that rests on a run of its commit: nothing is played again, and the report says on what. */
export function rested(plan, rest) {
  return { ...plan, all: false, play: [], walk: [], worlds: false, rests: { basis: rest.basis, run: rest.run.id }, reason: `a push to ${GATE} that rests on run #${rest.run.id} (branch ${rest.run.head_branch}), basis (${rest.basis}) - ${rest.why}. Not played again here: the walkthroughs and the probe world` };
}

/** How long one question to GitHub may take, ms: a question that hangs is a "no", not a job "plan" that hangs with it. */
export const GH_TIMEOUT_MS = 10000;

/**
 * `rests` asked of GitHub with the token of the job (`gh api`, the permission "actions: read"). A question that fails
 * in any way - no such program, a refusal, an answer that is not JSON, no answer within the limit - is a "no".
 * CI_GH names the program to ask instead of `gh` and CI_GH_TIMEOUT_MS the limit of one question: the unit tests ask a
 * stand-in, never the network.
 */
function restsOnGitHub(env) {
  const repo = env.GITHUB_REPOSITORY ?? '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, basis: null, run: null, why: 'the repository of this run is not known: everything is played' };
  const limit = Number(env.CI_GH_TIMEOUT_MS) > 0 ? Number(env.CI_GH_TIMEOUT_MS) : GH_TIMEOUT_MS;
  const api = (path) => JSON.parse(execFileSync(env.CI_GH || 'gh', ['api', '-H', 'Accept: application/vnd.github+json', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: limit, killSignal: 'SIGKILL' }));
  const runsOf = (sha) => api(`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`).workflow_runs;
  let runs = null, failed = '';
  try { runs = runsOf(env.CI_SHA); } catch (e) { failed = lastLine(e?.message ?? e); }
  if (!Array.isArray(runs)) return { ok: false, basis: null, run: null, why: `GitHub did not list the runs of this commit${failed ? ` (${failed})` : ''}: everything is played` };
  return rests({ sha: env.CI_SHA, runId: env.GITHUB_RUN_ID, before: env.CI_BEFORE }, {
    runs,
    jobsOf: (id) => api(`repos/${repo}/actions/runs/${id}/jobs?filter=latest&per_page=100`).jobs,
    beforeRuns: () => runsOf(env.CI_BEFORE),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2), process.env);
