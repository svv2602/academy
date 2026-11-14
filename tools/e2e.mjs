// The pre-publish gate: npm run e2e [-- --skip-build] [--all-sizes] [--mode <size>] [--bail] [--update-models]
//                       npm run e2e -- --combine <folder>
// Builds the game, serves the build on localhost, plays the whole world in phone and desktop sizes
// (tools/shot.mjs, one process per size), checks that no .html in dist/ links to another site, stops the server
// and prints a summary table. With --all-sizes two more sizes are played after the two main ones: desktop-tall
// (1280x800) and mobile-portrait (390x844). Every walkthrough also checks the layout of every screen it shows.
// The desktop walkthrough is played WITHOUT NETWORK after the first load (the installed game must work offline);
// the other ones are played online. The desktop-tall walkthrough is played WITH THE VOICE TURNED OFF (the game must
// be playable in silence). The model files the page requested in the walkthroughs must be exactly
// tools/models-used.json. Every walkthrough compares the commit number shown in the parents' section with
// `git rev-parse --short HEAD` of the sources. Every walkthrough leaves its summary in shots-e2e/summary-<size>.json.
// --combine: CI plays each size in a job of its own; this mode only reads their results and runs the checks that need
// every size at once (see the help text).
// Exit code: 0 — every step passed; 1 — at least one step failed; 2 — bad arguments;
// 130 / 143 — interrupted (the server is stopped in that case too).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Usage: npm run e2e [-- <flags>]      (same as: node tools/e2e.mjs <flags>)

Steps: build -> preview server -> walkthrough mobile -> walkthrough desktop (offline) -> [--all-sizes: walkthrough
desktop-tall (no voice) -> walkthrough mobile-portrait -> silent walkthrough] -> models used -> dist links -> stop server.
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
"models used" compares the model files the page requested in all the walkthroughs with tools/models-used.json.
Every walkthrough leaves its summary in shots-e2e/summary-<size>.json: the commit, how the walkthrough ended and
whether the whole run passed.

--combine <folder>: build nothing, play nothing. The folder holds what walkthroughs of all four sizes left behind
(summary-, models-requested- and voice-<size>.json; CI plays each size in a job of its own and collects them there).
Steps: walkthroughs (all four summaries are there, of the commit of these sources, and passed) -> silent walkthrough
-> models used. Any missing or red size fails it.

Flags:
  --skip-build            reuse the existing dist/ (fails if dist/index.html is missing)
  --all-sizes             play all four sizes (default: the two main ones, mobile and desktop)
  --mode <size>           play one size only: mobile, desktop, desktop-tall or mobile-portrait;
                          "models used" is skipped then
  --bail                  stop at the first failed step (default: run every step to show everything broken)
  --update-models         rewrite tools/models-used.json from this run instead of comparing (needs both main sizes);
                          use it after adding or removing a model, then commit the file
  --combine <folder>      check the results of the four walkthroughs played elsewhere (see above); takes no other flag
  --help                  this text

Environment (passed on to tools/shot.mjs unchanged):
  Q=<0|1|2>               fixed graphics tier; default: the game picks and lowers it itself
  E2E_GL=gl|swiftshader   gl (default): real GPU; swiftshader: software rendering, for machines without a GPU
  E2E_SLOW=<n>            multiplier for the scenario timeouts and pauses (default 1)
  E2E_STUCK_MS=<ms>       how long one quest may take before it is reported as stuck (default 240000)
  E2E_LEVEL=<1|2|3>       task difficulty for every size (default: mobile 3, desktop adaptive, desktop-tall 2,
                          mobile-portrait 3)
  E2E_MUTE=<0|1>          1: every size is played without the voice, 0: every size with it (default: desktop-tall
                          without the voice, the other sizes with it)
Environment (this script):
  E2E_PORT=<n>            first port to try for the preview server (default 4183)
  E2E_RUN_TIMEOUT_MS=<ms> hard limit for one walkthrough process (default 1200000)`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The sizes themselves (pixels, touch or mouse) are defined in tools/shot.mjs; here only their names and order.
const MAIN_MODES = ['mobile', 'desktop'];
const EXTRA_MODES = ['desktop-tall', 'mobile-portrait'];   // added by --all-sizes, played after the main ones
const ALL_MODES = [...MAIN_MODES, ...EXTRA_MODES];
const opts = { skipBuild: false, bail: false, updateModels: false, allSizes: false, oneMode: false, combine: '', modes: [...MAIN_MODES] };
// Sizes played without network after the first load. One of the two existing walkthroughs, not a third one.
const OFFLINE_MODES = ['desktop'];
// The scenario fails every task type once on purpose, so the adaptive difficulty never leaves level 1. To play and
// measure the fuller screens of the higher levels as well, most sizes get a fixed level (the parents' setting);
// the desktop size keeps the adaptive one. E2E_LEVEL in the environment overrides this for every size.
const LEVELS = { mobile: '3', 'desktop-tall': '2', 'mobile-portrait': '3' };
// Sizes played with the voice turned off (VOICE-09). One of the four existing walkthroughs, not a fifth one; it is a
// desktop size, so that the bubble with a hint is still measured on both phone sizes. E2E_MUTE in the environment
// overrides this for every size.
const MUTE_MODES = ['desktop-tall'];
if (!['', '0', '1'].includes(process.env.E2E_MUTE ?? '')) { console.error(`[e2e] bad E2E_MUTE "${process.env.E2E_MUTE}": expected 0 or 1`); process.exit(2); }
const muted = (mode) => (process.env.E2E_MUTE ? process.env.E2E_MUTE === '1' : MUTE_MODES.includes(mode));
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
  }  else if (a === '--mode' || a.startsWith('--mode=')) {
    const m = a === '--mode' ? argv[++i] : a.slice('--mode='.length);
    if (![...MAIN_MODES, ...EXTRA_MODES].includes(m)) usage(`bad --mode "${m}": expected ${[...MAIN_MODES, ...EXTRA_MODES].join(', ')}`);
    opts.modes = [m]; opts.oneMode = true;
  } else usage(`unknown argument "${a}"`);
}
if (opts.allSizes && opts.oneMode) usage('--all-sizes and --mode exclude each other');
if (opts.allSizes) opts.modes = [...ALL_MODES];
if (opts.combine && (opts.oneMode || opts.allSizes || opts.skipBuild || opts.updateModels || opts.bail)) {
  usage('--combine takes no other flag: it only reads the results of walkthroughs played elsewhere');
}
if (opts.combine) opts.modes = [...ALL_MODES];
// "models used" needs both main sizes: one size alone does not request every model.
const bothMain = MAIN_MODES.every((m) => opts.modes.includes(m));
if (opts.updateModels && !bothMain) usage('--update-models needs both sizes: do not combine it with --mode');
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

const walkthroughName = (mode) => `walkthrough ${mode}${OFFLINE_MODES.includes(mode) ? ' (offline)' : ''}${muted(mode) ? ' (no voice)' : ''}`;
// Where the walkthroughs leave their results: shots-e2e/ here, or the folder of --combine.
const resultsDir = opts.combine || join(root, 'shots-e2e');
const modelsOut = (mode) => join(resultsDir, `models-requested-${mode}.json`);
const voiceOut = (mode) => join(resultsDir, `voice-${mode}.json`);
const summaryOut = (mode) => join(resultsDir, `summary-${mode}.json`);
// What the walkthrough itself reports about its voice: { mute, clips, loud }, or null if it did not get that far.
const voiceReport = (mode) => { try { return JSON.parse(readFileSync(voiceOut(mode), 'utf8')); } catch { return null; } };
async function walkthrough(url, mode) {
  rmSync(modelsOut(mode), { force: true });   // never compare against the list of an earlier run
  rmSync(voiceOut(mode), { force: true });
  rmSync(summaryOut(mode), { force: true });
  const env = { ...process.env, E2E_OFFLINE: OFFLINE_MODES.includes(mode) ? '1' : '0', E2E_MODELS_OUT: modelsOut(mode),
    E2E_MUTE: muted(mode) ? '1' : '0', E2E_VOICE_OUT: voiceOut(mode), E2E_COMMIT: sourceCommit() };
  if (!process.env.E2E_LEVEL && LEVELS[mode]) env.E2E_LEVEL = LEVELS[mode];
  const { code, signal, timedOut } = await run(process.execPath, [join(root, 'tools/shot.mjs'), url, 'shots-e2e', mode], runTimeoutMs, env);
  if (timedOut) throw new Error(`killed after ${runTimeoutMs} ms (E2E_RUN_TIMEOUT_MS)`);
  if (code !== 0) throw new Error(`tools/shot.mjs exited with ${signal ?? `code ${code}`} — see ERRORS above`);
  // The walkthrough says for itself how it was played: asked to be silent, it must have started every clip in silence.
  const voice = voiceReport(mode);
  if (!voice) throw new Error(`no report about the voice from the ${mode} walkthrough`);
  if (voice.mute !== muted(mode) || (voice.loud > 0) === muted(mode)) {
    throw new Error(`the ${mode} walkthrough had to be played ${muted(mode) ? 'without' : 'with'} the voice, but it reports: voice ${voice.mute ? 'off' : 'on'}, ${voice.loud} of ${voice.clips} clips started with a volume`);
  }
  return `voice ${voice.mute ? 'off' : 'on'}: ${voice.loud} of ${voice.clips} clips with a volume`;
}
// With all four sizes (the way CI runs) one walkthrough must have been played in silence, by its own report.
function checkSilent() {
  const silent = opts.modes.filter((m) => { const v = voiceReport(m); return v?.mute && v.loud === 0 && v.clips > 0; });
  if (!silent.length) throw new Error(`none of the ${opts.modes.length} walkthroughs was played without the voice: the game in silence went unchecked`);
  return `without the voice: ${silent.join(', ')}`;
}

// --combine: the walkthroughs were played elsewhere, each left its summary. All of them must be there, of the commit
// of these sources (results of an older run must not stand in for this one) and passed - or nothing else is believed.
function checkPlayed() {
  const commit = sourceCommit(), bad = [];
  for (const mode of opts.modes) {
    let s;
    try { s = JSON.parse(readFileSync(summaryOut(mode), 'utf8')); } catch { bad.push(`${mode}: no summary of its walkthrough (${summaryOut(mode)})`); continue; }
    if (s.mode !== mode) bad.push(`${mode}: the summary is of "${s.mode}"`);
    else if (s.commit !== commit) bad.push(`${mode}: played on commit ${s.commit}, the sources are at ${commit}`);
    else if (s.walkthrough !== 'ok') bad.push(`${mode}: the walkthrough ${s.walkthrough}${s.note ? ` — ${s.note}` : ''}`);
    else if (s.passed !== true) bad.push(`${mode}: the walkthrough passed, but another step of that run failed`);
  }
  if (bad.length) throw new Error(`${bad.length} of ${opts.modes.length} walkthroughs did not pass:\n  ${bad.join('\n  ')}`);
  return `${opts.modes.join(', ')}: passed on ${commit}`;
}

// The model files the page requested in the walkthroughs must be exactly tools/models-used.json. The same list is
// compared with public/models by a unit test (tools/models-used.test.mjs), so a model nobody loads cannot be shipped.
function checkModels() {
  const requested = new Set();
  for (const mode of opts.modes) {
    let list;
    try { list = JSON.parse(readFileSync(modelsOut(mode), 'utf8')); } catch (e) { throw new Error(`no list of requested models from the ${mode} walkthrough (${e.message})`); }
    for (const p of list) requested.add(p);
  }
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
  return `${actual.length} model file(s) requested, same as ${MODELS_FILE}`;
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
    for (const mode of opts.modes) {
      const name = walkthroughName(mode);
      if (!url) skip(name, 'no server');
      else if (opts.bail && failed()) skip(name, '--bail');
      else await step(name, () => walkthrough(url, mode));
    }
    const played = opts.modes.map((m) => results.find((r) => r.name === walkthroughName(m))?.result);
    if (opts.allSizes) {
      if (process.env.E2E_MUTE) skip('silent walkthrough', 'E2E_MUTE is set: the voice of every size was chosen by hand');
      else if (!played.every((r) => r === 'ok')) skip('silent walkthrough', 'a walkthrough did not pass');
      else await step('silent walkthrough', checkSilent);
    }
    if (!bothMain) skip('models used', '--mode: one size does not request every model');
    else if (!played.every((r) => r === 'ok')) skip('models used', 'a walkthrough did not pass: its list of requests is incomplete');
    else await step('models used', checkModels);
    if (opts.bail && failed()) skip('dist links', '--bail');
    else await step('dist links', checkDist);
  } finally {
    await step('stop server', stopServer);
  }
}

// Each walkthrough of this run leaves its summary: what --combine reads when the sizes are played in separate jobs.
if (!opts.combine) {
  mkdirSync(resultsDir, { recursive: true });
  const commit = sourceCommit();
  for (const mode of opts.modes) {
    const r = results.find((x) => x.name === walkthroughName(mode));
    writeFileSync(summaryOut(mode), JSON.stringify({ mode, commit, walkthrough: r?.result ?? 'not played', note: r?.note.split('\n')[0] ?? '', passed: !failed() }, null, 2) + '\n');
  }
}

const rows = [{ name: 'step', result: 'result', time: 'time', note: '' }, ...results.map((r) => ({ ...r, time: `${(r.ms / 1000).toFixed(1)}s`, note: r.note.split('\n')[0] }))];
const w = (k) => Math.max(...rows.map((r) => r[k].length));
const [wn, wr, wt] = [w('name'), w('result'), w('time')];
console.log('\n[e2e] summary');
for (const r of rows) console.log(`  ${r.name.padEnd(wn)}  ${r.result.padEnd(wr)}  ${r.time.padStart(wt)}  ${r.note}`.trimEnd());
console.log(failed() ? '[e2e] FAILED' : '[e2e] PASSED');
process.exitCode = failed() ? 1 : 0;
