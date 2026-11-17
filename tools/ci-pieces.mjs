// Which jobs a run of ci.yml plays, chosen by the files that changed (ARCH-16), and whether "check" may pass:
//   node tools/ci-pieces.mjs plan            the job "plan" of ci.yml: asks git for the changed files (the event comes
//                                            in CI_EVENT, CI_REF, CI_BEFORE, CI_PR_BASE), prints the plan and writes
//                                            it to $GITHUB_OUTPUT: matrix, jobs, walk, worlds, report
//   node tools/ci-pieces.mjs pick <file>...  the same plan for the files given, printed only (to try a set of files)
//   node tools/ci-pieces.mjs check           the job "check" of ci.yml: compares the result of every job (PLAN_RESULT,
//                                            BUILD_RESULT, WALK_RESULT, WORLDS_RESULT) with what the plan expected
//                                            (PLAN_WALK, PLAN_WORLDS) and prints what was skipped and why (PLAN_REPORT)
// The rule (tools/world-pieces.mjs lists the worlds, their folders and their jobs):
//   only documents changed (docs/**, *.md, .claude/**)  -> no walkthrough, no probe world: unit tests and build only
//   files of a world (and maybe documents)              -> the jobs of that world; of several worlds - of each of them
//   any other file - a shared one                       -> everything
//   the changed files are not known, or there are none  -> everything
// Whenever in doubt, everything is played: "check" is the gate into dev and the status the protection of main asks for.
// pages.yml does not use this file: before a publication everything is played, always.
// Exit code: 0 - done (check: every job ended as planned); 1 - check failed; 2 - bad arguments.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLDS } from './world-pieces.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The branch the work is merged into: a push to it is compared with the commit it was at before. */
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
 * The files changed by what this run checks: { files, why }. `files` is null whenever they cannot be told - the run
 * was started by hand, the branch is new, the commit to compare with is not in the clone, git failed - and then
 * everything is played. `git(args)` runs git in the repository and returns its output, or throws.
 *   push to dev        the commit dev was at before the push (`before`) .. HEAD
 *   push elsewhere     the common ancestor with origin/dev .. HEAD: the whole branch, not only its last push
 *   pull request       its base (`prBase`) .. HEAD
 * A renamed file counts under both names, a deleted one under its own (--no-renames).
 */
export function changedFiles({ event = '', ref = '', before = '', prBase = '' }, git) {
  const unknown = (why) => ({ files: null, why });
  try {
    let base, from;
    if (event === 'push' && ref === `refs/heads/${GATE}`) {
      if (!COMMIT.test(before) || /^0+$/.test(before)) return unknown(`a push to ${GATE} with no commit before it`);
      base = before; from = `the commit ${GATE} was at before this push`;
    } else if (event === 'push') {
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

// ---- command line ----
function main(argv, env) {
  const [cmd, ...rest] = argv;
  if (cmd === 'plan' || cmd === 'pick') {
    let changed;
    if (cmd === 'pick') changed = { files: rest, why: 'the files given on the command line' };
    else {
      const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
      changed = changedFiles({ event: env.CI_EVENT, ref: env.CI_REF, before: env.CI_BEFORE, prBase: env.CI_PR_BASE }, git);
    }
    const out = outputs(pick(changed.files), changed);
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
  console.error('[ci] usage: node tools/ci-pieces.mjs plan | pick <file>... | check');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2), process.env);
