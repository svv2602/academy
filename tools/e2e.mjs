// The pre-publish gate: npm run e2e [-- --skip-build] [--all-sizes] [--mode <size>] [--bail] [--update-models]
// Builds the game, serves the build on localhost, plays the whole world in phone and desktop sizes
// (tools/shot.mjs, one process per size), checks that no .html in dist/ links to another site, stops the server
// and prints a summary table. With --all-sizes two more sizes are played after the two main ones: desktop-tall
// (1280x800) and mobile-portrait (390x844). Every walkthrough also checks the layout of every screen it shows.
// The desktop walkthrough is played WITHOUT NETWORK after the first load (the installed game must work offline);
// the other ones are played online. The model files the page requested in the walkthroughs must be exactly
// tools/models-used.json.
// Exit code: 0 — every step passed; 1 — at least one step failed; 2 — bad arguments;
// 130 / 143 — interrupted (the server is stopped in that case too).
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Usage: npm run e2e [-- <flags>]      (same as: node tools/e2e.mjs <flags>)

Steps: build -> preview server -> walkthrough mobile -> walkthrough desktop (offline) -> [--all-sizes: walkthrough
desktop-tall -> walkthrough mobile-portrait] -> models used -> dist links -> stop server.
The exit code is non-zero if any step fails.
Sizes: mobile 844x390 (touch), desktop 1280x720 (mouse and keyboard), desktop-tall 1280x800 (mouse and keyboard),
mobile-portrait 390x844 (touch).
Every walkthrough checks the layout of each screen it takes a picture of: nothing scrolls, every panel, button and
input is inside the window, buttons do not overlap and are at least 44x44 px ("layout: <size> <screen>: …").
The desktop walkthrough goes without network: after the first load it waits for the service worker and its cache,
switches the network off, reloads and plays the whole world; any request that fails then is an error.
"models used" compares the model files the page requested in all the walkthroughs with tools/models-used.json.

Flags:
  --skip-build            reuse the existing dist/ (fails if dist/index.html is missing)
  --all-sizes             play all four sizes (default: the two main ones, mobile and desktop)
  --mode <size>           play one size only: mobile, desktop, desktop-tall or mobile-portrait;
                          "models used" is skipped then
  --bail                  stop at the first failed step (default: run every step to show everything broken)
  --update-models         rewrite tools/models-used.json from this run instead of comparing (needs both main sizes);
                          use it after adding or removing a model, then commit the file
  --help                  this text

Environment (passed on to tools/shot.mjs unchanged):
  Q=<0|1|2>               fixed graphics tier; default: the game picks and lowers it itself
  E2E_GL=gl|swiftshader   gl (default): real GPU; swiftshader: software rendering, for machines without a GPU
  E2E_SLOW=<n>            multiplier for the scenario timeouts and pauses (default 1)
  E2E_STUCK_MS=<ms>       how long one quest may take before it is reported as stuck (default 240000)
  E2E_LEVEL=<1|2|3>       task difficulty for every size (default: mobile 3, desktop adaptive, desktop-tall 2,
                          mobile-portrait 3)
Environment (this script):
  E2E_PORT=<n>            first port to try for the preview server (default 4183)
  E2E_RUN_TIMEOUT_MS=<ms> hard limit for one walkthrough process (default 1200000)`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The sizes themselves (pixels, touch or mouse) are defined in tools/shot.mjs; here only their names and order.
const MAIN_MODES = ['mobile', 'desktop'];
const EXTRA_MODES = ['desktop-tall', 'mobile-portrait'];   // added by --all-sizes, played after the main ones
const opts = { skipBuild: false, bail: false, updateModels: false, allSizes: false, oneMode: false, modes: [...MAIN_MODES] };
// Sizes played without network after the first load. One of the two existing walkthroughs, not a third one.
const OFFLINE_MODES = ['desktop'];
// The scenario fails every task type once on purpose, so the adaptive difficulty never leaves level 1. To play and
// measure the fuller screens of the higher levels as well, most sizes get a fixed level (the parents' setting);
// the desktop size keeps the adaptive one. E2E_LEVEL in the environment overrides this for every size.
const LEVELS = { mobile: '3', 'desktop-tall': '2', 'mobile-portrait': '3' };
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
  else if (a === '--mode' || a.startsWith('--mode=')) {
    const m = a === '--mode' ? argv[++i] : a.slice('--mode='.length);
    if (![...MAIN_MODES, ...EXTRA_MODES].includes(m)) usage(`bad --mode "${m}": expected ${[...MAIN_MODES, ...EXTRA_MODES].join(', ')}`);
    opts.modes = [m]; opts.oneMode = true;
  } else usage(`unknown argument "${a}"`);
}
if (opts.allSizes && opts.oneMode) usage('--all-sizes and --mode exclude each other');
if (opts.allSizes) opts.modes = [...MAIN_MODES, ...EXTRA_MODES];
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

const walkthroughName = (mode) => `walkthrough ${mode}${OFFLINE_MODES.includes(mode) ? ' (offline)' : ''}`;
const modelsOut = (mode) => join(root, 'shots-e2e', `models-requested-${mode}.json`);
async function walkthrough(url, mode) {
  rmSync(modelsOut(mode), { force: true });   // never compare against the list of an earlier run
  const env = { ...process.env, E2E_OFFLINE: OFFLINE_MODES.includes(mode) ? '1' : '0', E2E_MODELS_OUT: modelsOut(mode) };
  if (!process.env.E2E_LEVEL && LEVELS[mode]) env.E2E_LEVEL = LEVELS[mode];
  const { code, signal, timedOut } = await run(process.execPath, [join(root, 'tools/shot.mjs'), url, 'shots-e2e', mode], runTimeoutMs, env);
  if (timedOut) throw new Error(`killed after ${runTimeoutMs} ms (E2E_RUN_TIMEOUT_MS)`);
  if (code !== 0) throw new Error(`tools/shot.mjs exited with ${signal ?? `code ${code}`} — see ERRORS above`);
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
let ready = true;
if (!opts.skipBuild) ready = await step('build', build);
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
    if (!bothMain) skip('models used', '--mode: one size does not request every model');
    else if (!played.every((r) => r === 'ok')) skip('models used', 'a walkthrough did not pass: its list of requests is incomplete');
    else await step('models used', checkModels);
    if (opts.bail && failed()) skip('dist links', '--bail');
    else await step('dist links', checkDist);
  } finally {
    await step('stop server', stopServer);
  }
}

const rows = [{ name: 'step', result: 'result', time: 'time', note: '' }, ...results.map((r) => ({ ...r, time: `${(r.ms / 1000).toFixed(1)}s`, note: r.note.split('\n')[0] }))];
const w = (k) => Math.max(...rows.map((r) => r[k].length));
const [wn, wr, wt] = [w('name'), w('result'), w('time')];
console.log('\n[e2e] summary');
for (const r of rows) console.log(`  ${r.name.padEnd(wn)}  ${r.result.padEnd(wr)}  ${r.time.padStart(wt)}  ${r.note}`.trimEnd());
console.log(failed() ? '[e2e] FAILED' : '[e2e] PASSED');
process.exitCode = failed() ? 1 : 0;
