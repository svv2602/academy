// The pre-publish gate: npm run e2e [-- --skip-build] [--all-sizes] [--mode <size>] [--only <groups>] [--bail] [--update-models]
//                       npm run e2e -- --combine <folder> [--only <groups> | --jobs <list>]
// Builds the game, serves the build on localhost, plays the whole world in phone and desktop sizes
// (tools/shot.mjs, one process per size), checks that no .html in dist/ links to another site, stops the server
// and prints a summary table. With --all-sizes two more sizes are played after the two main ones: desktop-tall
// (1280x800) and mobile-portrait (390x844). Every walkthrough also checks the layout of every screen it shows.
// The desktop walkthrough is played WITHOUT NETWORK after the first load (the installed game must work offline);
// the other ones are played online. The desktop-tall walkthrough is played WITH THE VOICE TURNED OFF (the game must
// be playable in silence). The model files the page requested in the walkthroughs must be exactly
// tools/models-used.json. Every walkthrough compares the commit number shown in the parents' section with
// `git rev-parse --short HEAD` of the sources. Every walkthrough leaves its summary in shots-e2e/summary-<size>.json.
// --only: each size plays the given groups of tools/e2e-saves.mjs instead of the whole world, one walkthrough per
// size and group, each from the group's save; their files are named <size>-<group> (summary-mobile-world1.json).
// --combine: CI plays each size in a job of its own; this mode only reads their results and runs the checks that need
// every size at once (see the help text).
// Exit code: 0 — every step passed; 1 — at least one step failed; 2 — bad arguments;
// 130 / 143 — interrupted (the server is stopped in that case too).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDistSize, sizeSummary } from './dist-size.mjs';
import { splitRequested } from './models-split.mjs';
import { GROUPS, PIECES } from './e2e-saves.mjs';
import { blocksOf, limitReport, reportToGitHub } from './run-limit.mjs';

const HELP = `Usage: npm run e2e [-- <flags>]      (same as: node tools/e2e.mjs <flags>)

Steps: build -> preview server -> walkthrough mobile -> walkthrough desktop (offline) -> [--all-sizes: walkthrough
desktop-tall (no voice) -> walkthrough mobile-portrait -> silent walkthrough] -> [with the mobile size: failure screens
-> update -> worlds] -> models used -> dist links -> dist size -> stop server.
The exit code is non-zero if any step fails.
Sizes: mobile 844x390 (touch), desktop 1280x720 (mouse and keyboard), desktop-tall 1280x800 (mouse and keyboard),
mobile-portrait 390x844 (touch).
Every walkthrough checks the layout of each screen it takes a picture of: nothing scrolls, every panel, button and
input is inside the window, buttons do not overlap and are at least 44x44 px ("layout: <size> <screen>: …").
The desktop walkthrough goes without network: after the first load it waits for the service worker and its cache,
switches the network off, reloads and plays the whole world; any request that fails then is an error.
The desktop-tall walkthrough is played without the voice (volume 0, as the parents' section sets it): every clip must
be started with zero volume, and on every picture of a task and of its hint the bubble must show the question of the
task. The other sizes are played with the voice: there the hint replaces the question in the bubble.
"silent walkthrough" (--all-sizes only) fails if none of the walkthroughs was played without the voice.
Every walkthrough opens the parents' section through its gate (a multiplication read from the screen) and compares
the commit number shown there with "git rev-parse --short HEAD" of the sources ("no-git" where git gives none).
"failure screens" (tools/failures.mjs; once per run, only when the mobile size is played - in CI only its job plays it):
Chrome with WebGL switched off shows the message with the advice to update the browser and has nothing in the console;
with one model blocked the game asks for it 1 + 3 times, then shows the message and "try again"; the block lifted and
the button pressed, the start screen with "Play" appears. Both screens are measured in 844x390 and 390x844.
"update" (tools/update.mjs; once per run, with the mobile size, like "failure screens"; a server of its own): a new
build is published while the game is played - the new service worker installs and waits, the page keeps its worker
(no controllerchange), is not navigated, and a task is still solved; a second page opened meanwhile keeps the old build;
the parents' section says the new version comes after a restart; once every page of the game is closed, a new page
opens the new build with the stars of the old one; on its start screen a third build is switched on with one reload.
"worlds" (tools/worlds.mjs; once per run, with the mobile size, like "update"; a build and a server of its own): the
probe world is a test world - dist/ must hold nothing of it (no file, no code); the build that lists it is made anew
(vite build --mode probe --outDir dist-probe), must hold its files under models/probe/ and story/probe/ and the commit
of the sources, and the world is played there in the mobile size by the walkthrough every world shares
(E2E_WORLD=probe; pictures in shots-e2e/worlds-probe/). E2E_WORLDS=0 leaves the step out (the summary says so): CI
plays the probe world in a job of its own (node tools/worlds.mjs dist).
"models used" compares the model files the page requested in all the walkthroughs with tools/models-used.json; the
own files of a next world (the forest's, downloaded in the background: models/<id>/… of a world of src/worlds/ that is
neither the first nor installed) are left out of it - they lie in worlds-data/<id>/, not under public/models/; each must
be there. Read from the sources, not from a build: --combine has none.
"dist size" holds the build to the budget of docs/15-tech.md, counted per world: the core with the first world at most 12.5 MB
without voice/ and 4 MB of voice/, every next world (models/<id>/, story/<id>/, voice/<id>/) at most 8 MB and 3 MB of voice,
one file at most 1 MB (tools/dist-size.mjs).
Every walkthrough leaves its summary in shots-e2e/summary-<size>.json: the commit, how the walkthrough ended and
whether the whole run passed.

--only <group>[,<group>...]: instead of the whole world each size plays these groups (tools/e2e-saves.mjs), one
walkthrough per size and group: the page starts from the group's save, "play" is pressed, and only the group's part of
the world is played; the checks at the end count what it played. Groups: world1 (friends 1-2 from no save, the game
without ?debug, a hidden page, the introduction, the cat), world2 (the mushroom king and the queen, "sort" in the
world, a broken talk, the tuning panel, collisions), finale (the deer and its star search, the finale, the book, the
parents' section, leaving the page, "start again"), shop (the heroine and her items, the shop, its signboard, what she
wears after a reload), tasks (every friend from no save: every kind of task). world1, world2, finale and shop together
are the whole world.
Files of a group: summary-, models-requested-, voice-<size>-<group>.json, pictures <size>-<group>-<screen>.png.
"failure screens", "update" and "worlds" go with the mobile size of shop; "models used" needs both main sizes and the four
pieces. Without --only: the whole world, as always.

--combine <folder>: build nothing, play nothing. The folder holds what walkthroughs of all four sizes left behind
(summary-, models-requested- and voice-<size>.json; CI plays each size in a job of its own and collects them there).
Steps: walkthroughs (all four summaries are there, of the commit of these sources, and passed) -> silent walkthrough
-> models used. Any missing or red size fails it.
  --only <groups>  the walkthroughs to expect are these groups in each of the four sizes (files <size>-<group>)
  --jobs <list>    the walkthroughs to expect, listed: <size> (the whole world) or <size>:<group>, separated by commas
                   or spaces, e.g. "mobile:world1,mobile:world2,..."
  With either, every size must still be played whole (one walkthrough of the whole world, or each of the pieces
  world1, world2, finale, shop), "failure screens" must have passed in the mobile walkthrough of the whole world or of
  shop, "silent walkthrough" needs a size whose every walkthrough was silent, and the models of all of them add up.

Flags:
  --skip-build            reuse the existing dist/ (fails if dist/index.html is missing)
  --all-sizes             play all four sizes (default: the two main ones, mobile and desktop)
  --mode <size>           play one size only: mobile, desktop, desktop-tall or mobile-portrait;
                          "models used" is skipped then
  --only <groups>         play these groups instead of the whole world (see above): ${Object.keys(GROUPS).join(', ')}
  --bail                  stop at the first failed step (default: run every step to show everything broken)
  --update-models         rewrite tools/models-used.json from this run instead of comparing (needs both main sizes);
                          use it after adding or removing a model, then commit the file
  --combine <folder>      check the results of the four walkthroughs played elsewhere (see above); takes no other flag
                          but --only or --jobs
  --help                  this text

Environment (passed on to tools/shot.mjs unchanged):
  Q=<0|1|2>               fixed graphics tier; default: the game picks and lowers it itself
  E2E_GL=gl|swiftshader   gl (default): real GPU; swiftshader: software rendering, for machines without a GPU
  E2E_SLOW=<n>            multiplier for the scenario timeouts and pauses (default 1)
  E2E_STUCK_MS=<ms>       how long one quest may take before it is reported as stuck (default 240000)
  E2E_LEVEL=<1..5>        the level fixed for every skill, in every size, each within its own levels (default:
                          mobile 3, desktop adaptive, desktop-tall 2, mobile-portrait 3)
  E2E_SEED=<text>         ?seed= of the game (ARCH-08): the tasks are drawn from that seed; every walkthrough prints
                          "task sequence (seed …): N tasks, <fingerprint>" and writes shots-e2e/<size>-tasks.txt
  E2E_MUTE=<0|1>          1: every size is played without the voice, 0: every size with it (default: desktop-tall
                          without the voice, the other sizes with it)
  E2E_NET=<net|offline>   offline: every size is played without the network after the first load, net: every size
                          with it (default: desktop without the network, the other sizes with it); for a trial of
                          one piece (.github/workflows/try.yml), not for the gate
Environment (this script):
  E2E_PORT=<n>            first port to try for the preview server (default 4183)
  E2E_WORLDS=<0|1>        0: the step "worlds" is skipped - the probe world is played elsewhere (CI: its own job);
                          1 or unset: the step is played with the mobile size, as always
  E2E_RUN_TIMEOUT_MS=<ms> hard limit for one walkthrough process (default 1200000)`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The sizes themselves (pixels, touch or mouse) are defined in tools/shot.mjs; here only their names and order.
const MAIN_MODES = ['mobile', 'desktop'];
const EXTRA_MODES = ['desktop-tall', 'mobile-portrait'];   // added by --all-sizes, played after the main ones
const ALL_MODES = [...MAIN_MODES, ...EXTRA_MODES];
const opts = { skipBuild: false, bail: false, updateModels: false, allSizes: false, oneMode: false, combine: '', modes: [...MAIN_MODES], only: [], jobs: '' };
// Sizes played without network after the first load. One of the two existing walkthroughs, not a third one.
const OFFLINE_MODES = ['desktop'];
// The scenario fails every task type once on purpose, so the adaptive difficulty never leaves level 1. To play and
// measure the fuller screens of the higher levels as well, most sizes get a fixed level (the parents' setting, given
// to every skill: save.fixed);
// the desktop size keeps the adaptive one. E2E_LEVEL in the environment overrides this for every size.
const LEVELS = { mobile: '3', 'desktop-tall': '2', 'mobile-portrait': '3' };
// Sizes played with the voice turned off (VOICE-09). One of the four existing walkthroughs, not a fifth one; it is a
// desktop size, so that the bubble with a hint is still measured on both phone sizes. E2E_MUTE in the environment
// overrides this for every size.
const MUTE_MODES = ['desktop-tall'];
// The failure screens (TECH-07, TECH-08) are played once per run, with this size: CI plays each size in a job of its
// own, so only that job plays them.
const FAILURE_MODE = 'mobile';
// With --only, the failure screens go with this group (in the walkthrough of FAILURE_MODE): the shortest piece.
const FAILURE_GROUP = 'shop';
if (!['', '0', '1'].includes(process.env.E2E_MUTE ?? '')) { console.error(`[e2e] bad E2E_MUTE "${process.env.E2E_MUTE}": expected 0 or 1`); process.exit(2); }
const muted = (mode) => (process.env.E2E_MUTE ? process.env.E2E_MUTE === '1' : MUTE_MODES.includes(mode));
// E2E_NET in the environment overrides the network of every size the same way (a trial of one piece, try.yml).
if (!['', 'net', 'offline'].includes(process.env.E2E_NET ?? '')) { console.error(`[e2e] bad E2E_NET "${process.env.E2E_NET}": expected net or offline`); process.exit(2); }
const offline = (mode) => (process.env.E2E_NET ? process.env.E2E_NET === 'offline' : OFFLINE_MODES.includes(mode));
// The step "worlds" is played unless it is switched off: in CI the probe world has a job of its own (ARCH-16), and the
// walkthrough jobs must not play it a second time. Anything but 0 or 1 is a mistake, not a silent "off".
if (!['', '0', '1'].includes(process.env.E2E_WORLDS ?? '')) { console.error(`[e2e] bad E2E_WORLDS "${process.env.E2E_WORLDS}": expected 0 or 1`); process.exit(2); }
// Steps switched off for this run, by name, each with the reason the summary gives (see step() below).
const switchedOff = process.env.E2E_WORLDS === '0' ? { worlds: 'E2E_WORLDS=0: the probe world is played elsewhere (in CI: by the job "worlds")' } : {};
// The commit the sources are at: what the build had to put into the parents' section (TECH-10). Worked out at the
// moment of the walkthrough, the same way as in vite.config.ts; with --skip-build it tells a stale dist/ apart.
function sourceCommit() {
  try {
    const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[0-9a-f]{4,40}$/.test(out) ? out : 'no-git';
  } catch { return 'no-git'; }
}
const MODELS_FILE = 'tools/models-used.json';
const argv = process.argv.slice(2);
const usage = (msg) => { console.error(`[e2e] ${msg}\n\n${HELP}`); process.exit(2); };

// Internal mode, used by startServer() below: this process is the preview server itself. It is `vite preview`
// started through the JS API, because the CLI cannot switch off the single-page fallback: with it a missing file is
// answered with "200 + index.html" and a 404 could never be noticed. Real static hosting answers 404, and so does this.
if (argv[0] === '--serve') {
  const { preview } = await import('vite');
  const srv = await preview({ root, appType: 'mpa', preview: { port: Number(argv[1]), strictPort: true } });
  srv.printUrls();
  await new Promise(() => {});   // serve until killed
}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
  else if (a === '--skip-build') opts.skipBuild = true;
  else if (a === '--bail') opts.bail = true;
  else if (a === '--update-models') opts.updateModels = true;
  else if (a === '--all-sizes') opts.allSizes = true;
  else if (a === '--combine' || a.startsWith('--combine=')) {
    const d = a === '--combine' ? argv[++i] : a.slice('--combine='.length);
    if (!d || d.startsWith('--')) usage('--combine needs the folder with the results of the walkthroughs');
    opts.combine = resolve(d);
  } else if (a === '--only' || a.startsWith('--only=')) {
    const list = a === '--only' ? argv[++i] : a.slice('--only='.length);
    if (!list || list.startsWith('--')) usage('--only needs the groups to play, e.g. --only shop or --only world1,world2');
    for (const g of list.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!Object.hasOwn(GROUPS, g)) usage(`bad --only group "${g}": expected ${Object.keys(GROUPS).join(', ')}`);
      if (!opts.only.includes(g)) opts.only.push(g);
    }
    if (!opts.only.length) usage('--only needs at least one group');
  } else if (a === '--jobs' || a.startsWith('--jobs=')) {
    opts.jobs = a === '--jobs' ? argv[++i] : a.slice('--jobs='.length);
    if (!opts.jobs || opts.jobs.startsWith('--')) usage('--jobs needs the list of walkthroughs, e.g. --jobs mobile:world1,desktop');
  } else if (a === '--mode' || a.startsWith('--mode=')) {
    const m = a === '--mode' ? argv[++i] : a.slice('--mode='.length);
    if (![...MAIN_MODES, ...EXTRA_MODES].includes(m)) usage(`bad --mode "${m}": expected ${[...MAIN_MODES, ...EXTRA_MODES].join(', ')}`);
    opts.modes = [m]; opts.oneMode = true;
  } else usage(`unknown argument "${a}"`);
}
if (opts.allSizes && opts.oneMode) usage('--all-sizes and --mode exclude each other');
if (opts.allSizes) opts.modes = [...ALL_MODES];
if (opts.combine && (opts.oneMode || opts.allSizes || opts.skipBuild || opts.updateModels || opts.bail)) {
  usage('--combine takes no other flag but --only or --jobs: it only reads the results of walkthroughs played elsewhere');
}
if (opts.jobs && !opts.combine) usage('--jobs goes with --combine only (to play groups: --only)');
if (opts.jobs && opts.only.length) usage('--jobs and --only exclude each other');
if (opts.combine) opts.modes = [...ALL_MODES];
// The walkthroughs of this run (or, with --combine, the ones to expect): a size and a group ('' = the whole world).
let jobs = opts.modes.flatMap((mode) => (opts.only.length ? opts.only : ['']).map((group) => ({ mode, group })));
if (opts.jobs) {
  jobs = [];
  for (const item of opts.jobs.split(/[\s,]+/).filter(Boolean)) {
    const [mode, group = '', more] = item.split(':');
    if (more !== undefined || !ALL_MODES.includes(mode) || (group && !Object.hasOwn(GROUPS, group))) {
      usage(`bad --jobs item "${item}": expected <size> or <size>:<group>, sizes ${ALL_MODES.join(', ')}, groups ${Object.keys(GROUPS).join(', ')}`);
    }
    if (!jobs.some((j) => j.mode === mode && j.group === group)) jobs.push({ mode, group });
  }
  if (!jobs.length) usage('--jobs lists no walkthrough');
}
// Do the walkthroughs play the whole world in a size: one of the whole world, or every piece?
const wholeWorld = (mode) => jobs.some((j) => j.mode === mode && !j.group) || PIECES.every((p) => jobs.some((j) => j.mode === mode && j.group === p));
// "models used" needs both main sizes: one size alone does not request every model.
const bothMain = MAIN_MODES.every((m) => opts.modes.includes(m));
if (opts.updateModels && !bothMain) usage('--update-models needs both sizes: do not combine it with --mode');
if (opts.updateModels && !opts.modes.every(wholeWorld)) usage(`--update-models needs the whole world: with --only, every piece (${PIECES.join(', ')})`);
const firstPort = Number(process.env.E2E_PORT || 4183);
const runTimeoutMs = Number(process.env.E2E_RUN_TIMEOUT_MS || 1200000);
if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65000) usage(`bad E2E_PORT "${process.env.E2E_PORT}"`);
if (!(runTimeoutMs > 0)) usage(`bad E2E_RUN_TIMEOUT_MS "${process.env.E2E_RUN_TIMEOUT_MS}"`);

// ---- child processes: each one leads its own process group, so the whole tree can be stopped by pid ----
let job = null;      // the foreground child: the build or one walkthrough
let server = null;   // vite preview
const alive = (cp) => !!cp && cp.exitCode === null && cp.signalCode === null;
const killTree = (cp, sig) => {
  if (!alive(cp)) return;
  try { process.kill(-cp.pid, sig); } catch { try { cp.kill(sig); } catch { /* already gone */ } }
};
const run = (cmd, args, timeoutMs = 0, env = process.env) => new Promise((res, rej) => {
  const cp = job = spawn(cmd, args, { cwd: root, stdio: 'inherit', env, detached: true });
  let timedOut = false;
  const timer = timeoutMs ? setTimeout(() => { timedOut = true; killTree(cp, 'SIGKILL'); }, timeoutMs) : null;
  cp.on('error', (e) => { clearTimeout(timer); job = null; rej(e); });
  cp.on('exit', (code, signal) => { clearTimeout(timer); job = null; res({ code, signal, timedOut }); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Whatever happens — a failed step, an exception, Ctrl+C — nothing started here is left running.
process.on('exit', () => { killTree(job, 'SIGKILL'); killTree(server, 'SIGKILL'); });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(sig, () => { console.error(`\n[e2e] ${sig}: stopping the preview server and exiting`); process.exit(code); });
}
process.on('uncaughtException', (e) => { console.error('[e2e] internal error:', e); process.exit(1); });

// ---- steps ----
const results = [];
async function step(name, fn) {
  // A step switched off for this run is not played: it is listed as skipped, with the reason.
  if (Object.hasOwn(switchedOff, name)) { skip(name, switchedOff[name]); console.log(`\n[e2e] ${name}: skipped — ${switchedOff[name]}`); return true; }
  console.log(`\n[e2e] ${name}: start`);
  const t0 = Date.now();
  let ok = true, note = '';
  try { note = (await fn()) ?? ''; } catch (e) { ok = false; note = e.message; }
  results.push({ name, result: ok ? 'ok' : 'FAILED', ms: Date.now() - t0, note });
  console.log(`[e2e] ${name}: ${ok ? 'ok' : 'FAILED'}${note ? ` — ${note}` : ''}`);
  return ok;
}
const skip = (name, note) => results.push({ name, result: 'skipped', ms: 0, note });
const failed = () => results.some((r) => r.result === 'FAILED');

async function build() {
  const { code, signal } = await run('npm', ['run', 'build']);
  if (code !== 0) throw new Error(`npm run build exited with ${signal ?? `code ${code}`}`);
}

const canBind = (port, host) => new Promise((res) => {
  const s = createServer();
  s.once('error', (e) => res(e.code !== 'EADDRINUSE'));   // e.g. no IPv6 on this machine: not "busy"
  s.listen({ port, host, exclusive: true }, () => s.close(() => res(true)));
});
async function startServer() {
  let port = firstPort;
  while (!(await canBind(port, '127.0.0.1') && await canBind(port, '::1'))) {
    if (++port > firstPort + 50) throw new Error(`no free port in ${firstPort}..${firstPort + 50}`);
  }
  const url = `http://localhost:${port}/`;
  let log = '';
  // localhost only (no host option); strictPort: never silently moves to another port
  server = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve', String(port)],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env, detached: true });
  server.on('error', (e) => { log += `\n${e.message}`; });
  for (const out of [server.stdout, server.stderr]) out.on('data', (d) => { log = (log + d).slice(-4000); });
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    if (!alive(server)) throw new Error(`vite preview exited before it was ready:\n${log.trim()}`);
    let status = 0;
    try { status = (await fetch(url, { signal: AbortSignal.timeout(2000) })).status; } catch { /* not up yet */ }
    if (status === 200) {
      // self-check: a missing file must be a 404 here, otherwise failed requests would go unnoticed
      const missing = (await fetch(`${url}e2e-no-such-file.bin`, { signal: AbortSignal.timeout(2000) })).status;
      if (missing !== 404) throw new Error(`the preview server answers ${missing} instead of 404 for a missing file`);
      return url;
    }
    await sleep(250);
  }
  throw new Error(`vite preview did not answer 200 on ${url} within 30 s:\n${log.trim()}`);
}
async function stopServer() {
  if (!server) return 'was not started';
  const pid = server.pid;
  const gone = new Promise((r) => (alive(server) ? server.once('exit', r) : r()));
  killTree(server, 'SIGTERM');
  if (await Promise.race([gone.then(() => true), sleep(5000).then(() => false)]) === false) { killTree(server, 'SIGKILL'); await gone; }
  return `pid ${pid} stopped`;
}

// A walkthrough is a size and a group of it ('' = the whole world); its files are named after both.
const jobId = ({ mode, group }) => (group ? `${mode}-${group}` : mode);
const jobLabel = ({ mode, group }) => (group ? `${mode} ${group}` : mode);
const walkthroughName = ({ mode, group }) => `walkthrough ${mode}${group ? ` ${group}` : ''}${offline(mode) ? ' (offline)' : ''}${muted(mode) ? ' (no voice)' : ''}`;
// The walkthrough that plays the failure screens with it: the mobile size, of the whole world or of FAILURE_GROUP.
const playsFailures = ({ mode, group }) => mode === FAILURE_MODE && (!group || group === FAILURE_GROUP);
// Where the walkthroughs leave their results: shots-e2e/ here, or the folder of --combine.
const resultsDir = opts.combine || join(root, 'shots-e2e');
const modelsOut = (job) => join(resultsDir, `models-requested-${jobId(job)}.json`);
const voiceOut = (job) => join(resultsDir, `voice-${jobId(job)}.json`);
const summaryOut = (job) => join(resultsDir, `summary-${jobId(job)}.json`);
const blocksOut = (job) => join(resultsDir, `blocks-${jobId(job)}.txt`);
/** Each walkthrough's time against its limit (tools/run-limit.mjs), printed under the summary. */
const limitLines = [];
// What the walkthrough itself reports about its voice: { mute, clips, loud }, or null if it did not get that far.
const voiceReport = (job) => { try { return JSON.parse(readFileSync(voiceOut(job), 'utf8')); } catch { return null; } };
async function walkthrough(url, job) {
  const { mode, group } = job;
  rmSync(modelsOut(job), { force: true });   // never compare against the list of an earlier run
  rmSync(voiceOut(job), { force: true });
  rmSync(summaryOut(job), { force: true });
  rmSync(blocksOut(job), { force: true });
  const env = { ...process.env, E2E_OFFLINE: offline(mode) ? '1' : '0', E2E_MODELS_OUT: modelsOut(job), E2E_BLOCKS_OUT: blocksOut(job),
    E2E_MUTE: muted(mode) ? '1' : '0', E2E_VOICE_OUT: voiceOut(job), E2E_COMMIT: sourceCommit(), E2E_ONLY: group };
  if (!process.env.E2E_LEVEL && LEVELS[mode]) env.E2E_LEVEL = LEVELS[mode];
  const t0 = Date.now();
  const { code, signal, timedOut } = await run(process.execPath, [join(root, 'tools/shot.mjs'), url, 'shots-e2e', mode], runTimeoutMs, env);
  // how near its limit it came, whatever its end: a warning with less than 15 % left (tools/run-limit.mjs)
  const report = limitReport({ name: walkthroughName(job), ms: Date.now() - t0, limitMs: runTimeoutMs, blocks: blocksOf(blocksOut(job)) });
  limitLines.push(report.line);
  reportToGitHub(report);
  if (timedOut) throw new Error(`killed after ${runTimeoutMs} ms (E2E_RUN_TIMEOUT_MS)`);
  if (code !== 0) throw new Error(`tools/shot.mjs exited with ${signal ?? `code ${code}`} — see ERRORS above`);
  // The walkthrough says for itself how it was played: asked to be silent, it must have started every clip in silence.
  const voice = voiceReport(job);
  if (!voice) throw new Error(`no report about the voice from the ${jobLabel(job)} walkthrough`);
  if ((voice.group ?? '') !== group) throw new Error(`the ${jobLabel(job)} walkthrough played ${voice.group ? `the group "${voice.group}"` : 'the whole world'}`);
  if (voice.mute !== muted(mode) || (voice.loud > 0) === muted(mode)) {
    throw new Error(`the ${jobLabel(job)} walkthrough had to be played ${muted(mode) ? 'without' : 'with'} the voice, but it reports: voice ${voice.mute ? 'off' : 'on'}, ${voice.loud} of ${voice.clips} clips started with a volume`);
  }
  return `voice ${voice.mute ? 'off' : 'on'}: ${voice.loud} of ${voice.clips} clips with a volume`;
}
// No WebGL, a blocked model: tools/failures.mjs on the same server, in browsers of its own.
async function failureScreens(url) {
  const { code, signal, timedOut } = await run(process.execPath, [join(root, 'tools/failures.mjs'), url, 'shots-e2e'], 300000);
  if (timedOut) throw new Error('killed after 300000 ms');
  if (code !== 0) throw new Error(`tools/failures.mjs exited with ${signal ?? `code ${code}`} — see "failures:" above`);
  return 'no WebGL: message, clean console; blocked model: repeats, message and button, the game starts after "try again"';
}
// A new build published in the middle of a game (TECH-13): tools/update.mjs serves dist/ and a marked copy of it itself.
async function update() {
  const { code, signal, timedOut } = await run(process.execPath, [join(root, 'tools/update.mjs'), join(root, 'dist')], 600000);
  if (timedOut) throw new Error('killed after 600000 ms');
  if (code !== 0) throw new Error(`tools/update.mjs exited with ${signal ?? `code ${code}`} — see "update:" above`);
  return 'the new version waited through a solved task, no controllerchange, no reload; the next launch: new version, same stars';
}
// The probe world (TECH-15): tools/worlds.mjs checks that dist/ has nothing of it, builds dist-probe/ and plays it there.
async function worlds() {
  const { code, signal, timedOut } = await run(process.execPath, [join(root, 'tools/worlds.mjs'), join(root, 'dist')], 1500000);
  if (timedOut) throw new Error('killed after 1500000 ms');
  if (code !== 0) throw new Error(`tools/worlds.mjs exited with ${signal ?? `code ${code}`} — see "worlds:" above`);
  return 'dist/ holds nothing of the probe world; dist-probe/ built with its files and this commit; the probe world played by its description (the mobile size with the network, the desktop size without it), its cache, the transition and the change of world checked';
}
// With all four sizes (the way CI runs) one size must have been played in silence, by the report of each of its
// walkthroughs (with --only: of every group of it; checkPlayed makes sure the groups of a size are the whole world).
function checkSilent() {
  const silent = opts.modes.filter((m) => {
    const own = jobs.filter((j) => j.mode === m);
    return own.length && own.every((j) => { const v = voiceReport(j); return v?.mute && v.loud === 0 && v.clips > 0; });
  });
  if (!silent.length) throw new Error(`none of the ${opts.modes.length} walkthroughs was played without the voice: the game in silence went unchecked`);
  return `without the voice: ${silent.join(', ')}`;
}

// --combine: the walkthroughs were played elsewhere, each left its summary. All of them must be there, of the commit
// of these sources (results of an older run must not stand in for this one) and passed - or nothing else is believed.
// With --only or --jobs each size must still be played whole, and one walkthrough must have played the failure screens.
function checkPlayed() {
  const commit = sourceCommit(), bad = [];
  for (const job of jobs) {
    const { mode, group } = job, name = jobLabel(job);
    let s;
    try { s = JSON.parse(readFileSync(summaryOut(job), 'utf8')); } catch { bad.push(`${name}: no summary of its walkthrough (${summaryOut(job)})`); continue; }
    if (s.mode !== mode) bad.push(`${name}: the summary is of "${s.mode}"`);
    else if ((s.group ?? '') !== group) bad.push(`${name}: the summary is of ${s.group ? `the group "${s.group}"` : 'the whole world'}`);
    else if (s.commit !== commit) bad.push(`${name}: played on commit ${s.commit}, the sources are at ${commit}`);
    else if (s.walkthrough !== 'ok') bad.push(`${name}: the walkthrough ${s.walkthrough}${s.note ? ` — ${s.note}` : ''}`);
    else if (s.passed !== true) bad.push(`${name}: the walkthrough passed, but another step of that run failed`);
    // The failure screens are played in one job only (FAILURE_MODE): its run must have played them, and passed.
    else if (playsFailures(job) && s.failureScreens !== 'ok') bad.push(`${name}: the failure screens were ${s.failureScreens ? `${s.failureScreens} in` : 'not played by'} its run`);
  }
  for (const mode of opts.modes) {
    if (!wholeWorld(mode)) bad.push(`${mode}: the walkthroughs listed do not play the whole world (it, or every piece of it: ${PIECES.join(', ')}); listed: ${jobs.filter((j) => j.mode === mode).map((j) => j.group || 'the whole world').join(', ') || 'none'}`);
  }
  if (!jobs.some(playsFailures)) bad.push(`no walkthrough listed plays the failure screens: ${FAILURE_MODE} (the whole world) or ${FAILURE_MODE}:${FAILURE_GROUP} is needed`);
  if (bad.length) throw new Error(`${bad.length} of ${jobs.length} walkthroughs did not pass:\n  ${bad.join('\n  ')}`);
  return `${jobs.map(jobLabel).join(', ')}: passed on ${commit}`;
}

// The model files the page requested in the walkthroughs must be exactly tools/models-used.json. The same list is
// compared with public/models by a unit test (tools/models-used.test.mjs), so a model nobody loads cannot be shipped.
// A next world's own files (the forest's: the game downloads them in the background while the fairies are played) are
// not public/models': they lie in worlds-data/<id>/ and are left out here, told by their path and the sources
// (tools/models-split.mjs) - --combine has no build to read a list from. Each must lie there.
function checkModels() {
  const all = [];
  for (const job of jobs) {
    let list;
    try { list = JSON.parse(readFileSync(modelsOut(job), 'utf8')); } catch (e) { throw new Error(`no list of requested models from the ${jobLabel(job)} walkthrough (${e.message})`); }
    all.push(...list);
  }
  const { core, ofWorlds, nowhere } = splitRequested(all);
  const requested = new Set(core);
  if (nowhere.length) throw new Error(`${nowhere.length} file(s) of a next world requested that do not lie in worlds-data/<id>/:\n    ${nowhere.join('\n    ')}`);
  const actual = [...requested].sort();
  if (!actual.length) throw new Error('the walkthroughs requested no model files at all');
  if (opts.updateModels) {
    writeFileSync(join(root, MODELS_FILE), JSON.stringify(actual, null, 2) + '\n');
    return `${MODELS_FILE} rewritten: ${actual.length} file(s)`;
  }
  let listed;
  try { listed = JSON.parse(readFileSync(join(root, MODELS_FILE), 'utf8')); } catch (e) { throw new Error(`cannot read ${MODELS_FILE} (${e.message}); to create it: npm run e2e -- --update-models`); }
  const known = new Set(listed);
  const notListed = actual.filter((p) => !known.has(p));
  const notRequested = listed.filter((p) => !requested.has(p));
  if (notListed.length || notRequested.length) {
    throw new Error(`${notListed.length} requested but not in ${MODELS_FILE}, ${notRequested.length} in the list but not requested`
      + (notListed.length ? `\n  requested by the game, but not in the list:\n    ${notListed.join('\n    ')}` : '')
      + (notRequested.length ? `\n  in the list, but not requested in any walkthrough:\n    ${notRequested.join('\n    ')}` : '')
      + '\n  if the change is intended: npm run e2e -- --update-models; a model nobody requests: move its source from models-src/ to models-unused/ and run npm run assets');
  }
  return `${actual.length} model file(s) requested, same as ${MODELS_FILE}` + (ofWorlds.length ? `; ${ofWorlds.length} file(s) of the next worlds apart, each in worlds-data/<id>/` : '');
}

// No element in any built .html may point to another site. Elements and their attributes are checked, not every
// "http" in the text: the bundled scripts legitimately contain such strings (XML namespaces inside Three.js).
function checkDist() {
  const dist = join(root, 'dist');
  const files = readdirSync(dist, { recursive: true }).filter((f) => f.endsWith('.html')).map((f) => join(dist, f));
  if (!files.length) throw new Error('no .html files in dist/');
  const external = (v) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(v) && !/^(?:data|blob):/i.test(v);
  const found = [];
  for (const file of files) {
    const html = readFileSync(file, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')                                                  // comments are not elements
      .replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2\s*>)/gi, '$1$3');             // nor is inline code or CSS
    for (const [, tag, attrs] of html.matchAll(/<(a|area|link|script|img|iframe|form)\b([^>]*)>/gi)) {
      for (const m of attrs.matchAll(/(?<![\w-])(?:xlink:)?(?:href|src|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
        const value = (m[1] ?? m[2] ?? m[3]).trim();
        if (external(value)) found.push(`${relative(root, file)}: <${tag.toLowerCase()}> ${value}`);
      }
    }
    for (const [tag] of html.matchAll(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi)) {
      const value = (/url\s*=\s*['"]?([^'"\s>]+)/i.exec(tag)?.[1] ?? '').trim();
      if (external(value)) found.push(`${relative(root, file)}: <meta http-equiv=refresh> ${value}`);
    }
  }
  if (found.length) throw new Error(`${found.length} external link(s) in the build:\n  ${found.join('\n  ')}`);
  return `${files.length} html file(s), no external links`;
}

// The size budget (TECH-02): the build that is played is the build that is published.
function checkSize() {
  const r = checkDistSize(join(root, 'dist'));
  if (r.problems.length) throw new Error(`the build is over its budget:\n  ${r.problems.join('\n  ')}`);
  return sizeSummary(r);
}

// ---- run ----
let ready = !opts.combine;
if (opts.combine) {
  const played = await step('walkthroughs', checkPlayed);
  if (!played) skip('silent walkthrough', 'a walkthrough did not pass');
  else if (process.env.E2E_MUTE) skip('silent walkthrough', 'E2E_MUTE is set: the voice of every size was chosen by hand');
  else await step('silent walkthrough', checkSilent);
  if (!played) skip('models used', 'a walkthrough did not pass: its list of requests may be incomplete');
  else await step('models used', checkModels);
} else if (!opts.skipBuild) ready = await step('build', build);
else if (!existsSync(join(root, 'dist/index.html'))) ready = await step('build', () => { throw new Error('--skip-build, but dist/index.html is missing: run without --skip-build first'); });
else skip('build', '--skip-build');

if (ready) {
  let url = null;
  try {
    await step('preview server', async () => { url = await startServer(); return url; });
    for (const job of jobs) {
      const name = walkthroughName(job);
      if (!url) skip(name, 'no server');
      else if (opts.bail && failed()) skip(name, '--bail');
      else await step(name, () => walkthrough(url, job));
    }
    if (jobs.some(playsFailures)) {
      if (!url) skip('failure screens', 'no server');
      else if (opts.bail && failed()) skip('failure screens', '--bail');
      else await step('failure screens', () => failureScreens(url));
      if (opts.bail && failed()) skip('update', '--bail');
      else await step('update', update);
      if (opts.bail && failed()) skip('worlds', '--bail');
      else await step('worlds', worlds);
    }
    const played = jobs.map((j) => results.find((r) => r.name === walkthroughName(j))?.result);
    if (opts.allSizes) {
      if (process.env.E2E_MUTE) skip('silent walkthrough', 'E2E_MUTE is set: the voice of every size was chosen by hand');
      else if (!played.every((r) => r === 'ok')) skip('silent walkthrough', 'a walkthrough did not pass');
      else await step('silent walkthrough', checkSilent);
    }
    if (!bothMain) skip('models used', '--mode: one size does not request every model');
    else if (!opts.modes.every(wholeWorld)) skip('models used', `--only: the groups are not the whole world (${PIECES.join(', ')})`);
    else if (!played.every((r) => r === 'ok')) skip('models used', 'a walkthrough did not pass: its list of requests is incomplete');
    else await step('models used', checkModels);
    if (opts.bail && failed()) skip('dist links', '--bail');
    else await step('dist links', checkDist);
    if (opts.bail && failed()) skip('dist size', '--bail');
    else await step('dist size', checkSize);
  } finally {
    await step('stop server', stopServer);
  }
}

// Each walkthrough of this run leaves its summary: what --combine reads when the sizes are played in separate jobs.
if (!opts.combine) {
  mkdirSync(resultsDir, { recursive: true });
  const commit = sourceCommit();
  for (const job of jobs) {
    const { mode, group } = job;
    const r = results.find((x) => x.name === walkthroughName(job));
    const fs = results.find((x) => x.name === 'failure screens');
    writeFileSync(summaryOut(job), JSON.stringify({ mode, ...(group ? { group } : {}), commit, walkthrough: r?.result ?? 'not played', note: r?.note.split('\n')[0] ?? '', passed: !failed(),
      ...(playsFailures(job) ? { failureScreens: fs?.result ?? 'not played' } : {}) }, null, 2) + '\n');
  }
}

const rows = [{ name: 'step', result: 'result', time: 'time', note: '' }, ...results.map((r) => ({ ...r, time: `${(r.ms / 1000).toFixed(1)}s`, note: r.note.split('\n')[0] }))];
const w = (k) => Math.max(...rows.map((r) => r[k].length));
const [wn, wr, wt] = [w('name'), w('result'), w('time')];
console.log('\n[e2e] summary');
for (const r of rows) console.log(`  ${r.name.padEnd(wn)}  ${r.result.padEnd(wr)}  ${r.time.padStart(wt)}  ${r.note}`.trimEnd());
if (limitLines.length) { console.log('[e2e] the walkthroughs against their limit (E2E_RUN_TIMEOUT_MS)'); for (const l of limitLines) console.log(`  ${l}`); }
console.log(failed() ? '[e2e] FAILED' : '[e2e] PASSED');
process.exitCode = failed() ? 1 : 0;
