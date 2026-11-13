// The pre-publish gate: npm run e2e [-- --skip-build] [--mode mobile|desktop] [--bail]
// Builds the game, serves the build on localhost, plays the whole world in phone and desktop sizes
// (tools/shot.mjs, one process per size), checks that no .html in dist/ links to another site, stops the server
// and prints a summary table. Exit code: 0 — every step passed; 1 — at least one step failed; 2 — bad arguments;
// 130 / 143 — interrupted (the server is stopped in that case too).
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Usage: npm run e2e [-- <flags>]      (same as: node tools/e2e.mjs <flags>)

Steps: build -> preview server -> walkthrough mobile -> walkthrough desktop -> dist links -> stop server.
The exit code is non-zero if any step fails.

Flags:
  --skip-build            reuse the existing dist/ (fails if dist/index.html is missing)
  --mode mobile|desktop   play one size only (default: both, one after the other)
  --bail                  stop at the first failed step (default: run every step to show everything broken)
  --help                  this text

Environment (passed on to tools/shot.mjs unchanged):
  Q=<0|1|2>               fixed graphics tier; default: the game picks and lowers it itself
  E2E_GL=gl|swiftshader   gl (default): real GPU; swiftshader: software rendering, for machines without a GPU
  E2E_SLOW=<n>            multiplier for the scenario timeouts and pauses (default 1)
  E2E_STUCK_MS=<ms>       how long one quest may take before it is reported as stuck (default 240000)
Environment (this script):
  E2E_PORT=<n>            first port to try for the preview server (default 4183)
  E2E_RUN_TIMEOUT_MS=<ms> hard limit for one walkthrough process (default 1200000)`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const opts = { skipBuild: false, bail: false, modes: ['mobile', 'desktop'] };
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
  else if (a === '--mode' || a.startsWith('--mode=')) {
    const m = a === '--mode' ? argv[++i] : a.slice('--mode='.length);
    if (m !== 'mobile' && m !== 'desktop') usage(`bad --mode "${m}": expected mobile or desktop`);
    opts.modes = [m];
  } else usage(`unknown argument "${a}"`);
}
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
const run = (cmd, args, timeoutMs = 0) => new Promise((res, rej) => {
  const cp = job = spawn(cmd, args, { cwd: root, stdio: 'inherit', env: process.env, detached: true });
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

async function walkthrough(url, mode) {
  const { code, signal, timedOut } = await run(process.execPath, [join(root, 'tools/shot.mjs'), url, 'shots-e2e', mode], runTimeoutMs);
  if (timedOut) throw new Error(`killed after ${runTimeoutMs} ms (E2E_RUN_TIMEOUT_MS)`);
  if (code !== 0) throw new Error(`tools/shot.mjs exited with ${signal ?? `code ${code}`} — see ERRORS above`);
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
      const name = `walkthrough ${mode}`;
      if (!url) skip(name, 'no server');
      else if (opts.bail && failed()) skip(name, '--bail');
      else await step(name, () => walkthrough(url, mode));
    }
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
