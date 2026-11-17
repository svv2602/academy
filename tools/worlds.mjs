// The probe world is a test world: the sources have it, the published game does not (TECH-15, TECH-09):
//   node tools/worlds.mjs [distDir]
// tools/e2e.mjs runs it as the step "worlds", once per run (with the mobile size, like "update"), on the dist/ it built.
//   1. The published build (distDir; without the argument `vite build` makes dist/ anew, as `npm run build` does) holds
//      nothing of the probe world: no file under a folder "probe", no chunk of it, none of its marks in the code.
//   2. The probe build is made anew: `vite build --mode probe --outDir dist-probe`. It must hold every file of
//      worlds-test/probe/ at the same path (models/probe/…, story/probe/…), the world in its code (the same search
//      as in 1 must find it there, or the search is blind) and the commit number of the sources.
//   3. dist-probe/ is served by a server of its own and the probe world is played by the walkthrough every world
//      shares: tools/shot.mjs with E2E_WORLD=probe in the mobile size (pictures in shots-e2e/worlds-probe/).
//   4. The page itself asked the server for every file of the probe world (a request of the service worker filling
//      its cache does not count): a file of a world that the world never loads proves nothing about loading.
// A failed check of 1 or 2 ends the run before the walkthrough: there is nothing to play then.
// Environment: E2E_PORT=<n> (the first port to try, default 4183; a busy one is skipped), E2E_GL, E2E_SLOW, Q,
// E2E_LEVEL, E2E_STUCK_MS (passed on to tools/shot.mjs), E2E_RUN_TIMEOUT_MS (limit of the walkthrough, default 600000).
// Exit code: 0 — passed; 1 — a check failed (every failure is printed as "worlds: …"); 2 — bad arguments.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createSocket } from 'node:net';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The id of the probe world (src/worlds/probe/) and the mode of the build that lists it (vite.config.ts). */
export const PROBE = 'probe';
/** Its files, outside public/: copied into the probe build under the same paths. */
export const PROBE_FILES = 'worlds-test/probe';
/** The build of the probe world, next to dist/. */
export const PROBE_DIST = 'dist-probe';

/** Every file under `dir`, as paths relative to it with "/" between the folders, sorted. */
function filesOf(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile())
    .map((f) => join(f.parentPath, f.name).slice(dir.length + 1).split(sep).join('/')).sort();
}

/** The files of the probe world the probe build must hold: everything under worlds-test/probe/ but its README. */
export function probeFiles(from = join(root, PROBE_FILES)) {
  return filesOf(from).filter((f) => f !== 'README.md');
}

// A file of the world: a folder named after it (models/probe/…, story/probe/…) or its chunk (assets/probe-<hash>.js).
const FILE_MARK = new RegExp(`(^|/)${PROBE}(/|[-.])`);
// The world in the code, as it survives the minifier: its id as a string, its keys (probe_…), its paths (…/probe/…,
// probe/…). A bare word is not a mark: Three.js has a property of that name (light probes).
const CODE_MARK = new RegExp(`["'\`]${PROBE}["'\`]|${PROBE}_[a-z]|/${PROBE}\\b|\\b${PROBE}/`, 'g');
const TEXT = ['.js', '.mjs', '.css', '.html', '.json', '.webmanifest'];

/**
 * What a build holds of the probe world: `files` - paths of its own files, `code` - "<file>: <mark> x<n>" for every
 * text file with its marks. Both empty = the build has nothing of it.
 */
export function probeLeft(dir) {
  const all = filesOf(dir);
  const files = all.filter((f) => FILE_MARK.test(f));
  const code = [];
  for (const f of all.filter((x) => TEXT.includes(extname(x)))) {
    const found = readFileSync(join(dir, f), 'utf8').match(CODE_MARK);
    if (found) code.push(`${f}: ${[...new Set(found)].map((m) => `${m} x${found.filter((x) => x === m).length}`).join(', ')}`);
  }
  return { files, code };
}

/** The commit number a build shows in the parents' section (TECH-10: src/ui/ui.ts, #pCommit), or null. */
export function buildCommit(dir) {
  for (const f of filesOf(dir).filter((x) => x.endsWith('.js'))) {
    const m = /id="pCommit">(?:\$\{")?([0-9a-z-]+)/.exec(readFileSync(join(dir, f), 'utf8'));
    if (m) return m[1];
  }
  return null;
}

/** The published build must hold nothing of the probe world. Returns the problems, [] when it is clean. */
export function publishedProblems(dir) {
  const left = probeLeft(dir);
  return [
    ...left.files.map((f) => `the published build holds a file of the probe world: ${f}`),
    ...left.code.map((c) => `the published build holds the probe world in its code: ${c}`),
  ];
}

/**
 * The probe build must hold the world: each of `files` (relative to `from`) at the same path with the same bytes,
 * the world in its code, and the commit of the sources. Returns the problems, [] when it is right.
 */
export function probeBuildProblems(dir, from, files, commit) {
  const out = [];
  if (!files.length) out.push(`${PROBE_FILES}/ has no files: the probe world has nothing of its own to load`);
  for (const f of files) {
    const built = join(dir, f);
    if (!existsSync(built)) out.push(`the probe build has no ${f} (${PROBE_FILES}/${f})`);
    else if (!readFileSync(built).equals(readFileSync(join(from, f)))) out.push(`${f} of the probe build is not ${PROBE_FILES}/${f}`);
  }
  for (const f of files) if (!FILE_MARK.test(f)) out.push(`${PROBE_FILES}/${f} is not in a folder of its world (…/${PROBE}/…)`);
  const left = probeLeft(dir);
  if (!left.code.length) out.push('the probe build does not hold the probe world in its code: the registry did not list it (or the search for it finds nothing)');
  const shown = buildCommit(dir);
  if (shown !== commit) out.push(`version: the probe build shows commit "${shown}", but the sources are at "${commit}" (git rev-parse --short HEAD)`);
  return out;
}

/** The files of `files` the page itself never asked for: `asked` is [{ path, referer }] as the server saw them. */
export function notAskedByPage(files, asked) {
  const fromPage = (referer) => { try { return !!referer && !/\/sw\.js$/.test(new URL(referer).pathname); } catch { return false; } };
  return files.filter((f) => !asked.some((r) => r.path === `/${f}` && fromPage(r.referer)));
}

// ---- the run itself: only when this file is the script, not when a test imports it ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  const usage = (msg) => { console.error(`[worlds] ${msg}\nUsage: node tools/worlds.mjs [distDir]`); process.exit(2); };
  const args = process.argv.slice(2);
  if (args.length > 1 || args[0]?.startsWith('-')) usage(`bad arguments "${args.join(' ')}"`);
  const firstPort = Number(process.env.E2E_PORT || 4183);
  if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65000) usage(`bad E2E_PORT "${process.env.E2E_PORT}"`);
  const runTimeoutMs = Number(process.env.E2E_RUN_TIMEOUT_MS || 600000);
  if (!(runTimeoutMs > 0)) usage(`bad E2E_RUN_TIMEOUT_MS "${process.env.E2E_RUN_TIMEOUT_MS}"`);
  const dist = resolve(args[0] ?? join(root, 'dist'));
  if (args[0] && !existsSync(join(dist, 'index.html'))) usage(`${dist} has no index.html: build the game first (npm run build)`);
  const probeDist = join(root, PROBE_DIST);
  if (dist === probeDist) usage(`${dist} is the folder of the probe build, not the published one`);

  const problems = [];
  const fail = (msg) => { problems.push(msg); console.error(`worlds: ${msg}`); };
  const end = () => {
    console.log(problems.length ? `[worlds] FAILED: ${problems.length} problem(s)` : '[worlds] PASSED');
    process.exit(problems.length ? 1 : 0);
  };
  // The commit of the sources, worked out the same way as in vite.config.ts and tools/e2e.mjs.
  const commit = (() => {
    try {
      const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return /^[0-9a-f]{4,40}$/.test(out) ? out : 'no-git';
    } catch { return 'no-git'; }
  })();

  let child = null;
  process.on('exit', () => { try { child?.kill('SIGKILL'); } catch { /* already gone */ } });
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => process.exit(code));
  const run = (cmd, argv, timeoutMs, env = process.env) => new Promise((res, rej) => {
    const cp = child = spawn(cmd, argv, { cwd: root, stdio: 'inherit', env });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; cp.kill('SIGKILL'); }, timeoutMs);
    cp.on('error', (e) => { clearTimeout(timer); child = null; rej(e); });
    cp.on('exit', (code, signal) => { clearTimeout(timer); child = null; res({ code, signal, timedOut }); });
  });
  const vite = async (what, ...argv) => {
    const { code, signal, timedOut } = await run(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', ...argv], 600000);
    if (code !== 0) throw new Error(`${what}: vite build ${argv.join(' ')} ${timedOut ? 'was killed after 600000 ms' : `exited with ${signal ?? `code ${code}`}`}`);
  };

  // ---- 1. the published build has nothing of the probe world ----
  try {
    if (!args[0]) await vite('the published build');
    const left = publishedProblems(dist);
    for (const p of left) fail(p);
    if (!left.length) console.log(`[worlds] the published build (${args[0] ? 'as given' : 'made anew'}): nothing of the probe world in ${filesOf(dist).length} files`);
  } catch (e) { fail(e.message); }

  // ---- 2. the probe build, made anew ----
  const from = join(root, PROBE_FILES);
  let files = [];
  try {
    rmSync(probeDist, { recursive: true, force: true });   // never play the build of an earlier run
    await vite('the probe build', '--mode', PROBE, '--outDir', PROBE_DIST);
    files = probeFiles(from);
    const wrong = probeBuildProblems(probeDist, from, files, commit);
    for (const p of wrong) fail(p);
    if (!wrong.length) console.log(`[worlds] the probe build: ${files.join(', ')}; the world is in its code; commit ${commit}`);
  } catch (e) { fail(e.message); }
  if (problems.length) end();

  // ---- 3. the probe build on a server of its own; a missing file is a 404, as on real hosting ----
  const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg',
  };
  const asked = [];   // every request answered with a file: its path and who asked (the page or the service worker)
  const server = createServer((req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(probeDist, path));
    if (!file.startsWith(probeDist + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    asked.push({ path, referer: req.headers.referer ?? '' });
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  });
  // A port is free when neither address of localhost has it, as in tools/e2e.mjs: its preview server may hold the IPv6 one.
  const canBind = (port, host) => new Promise((res) => {
    const s = createSocket();
    s.once('error', (e) => res(e.code !== 'EADDRINUSE'));   // e.g. no IPv6 on this machine: not "busy"
    s.listen({ port, host, exclusive: true }, () => s.close(() => res(true)));
  });
  let port = firstPort;
  while (!(await canBind(port, '127.0.0.1') && await canBind(port, '::1'))) if (++port > firstPort + 50) { fail(`no free port in ${firstPort}..${firstPort + 50}`); end(); }
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const url = `http://127.0.0.1:${port}/`;
  console.log(`[worlds] ${PROBE_DIST}/ served on ${url}`);

  // ---- the walkthrough every world shares, in the mobile size ----
  const shots = join('shots-e2e', `worlds-${PROBE}`);
  mkdirSync(join(root, shots), { recursive: true });
  const voiceOut = join(root, shots, 'voice-mobile.json');
  rmSync(voiceOut, { force: true });   // never read the report of an earlier run
  try {
    const env = { ...process.env, E2E_WORLD: PROBE, E2E_ONLY: '', E2E_OFFLINE: '0', E2E_MUTE: '0', E2E_COMMIT: commit,
      E2E_VOICE_OUT: voiceOut, E2E_MODELS_OUT: join(root, shots, 'models-requested-mobile.json'), E2E_LEVEL: process.env.E2E_LEVEL || '3' };
    const { code, signal, timedOut } = await run(process.execPath, [join(root, 'tools/shot.mjs'), url, shots, 'mobile'], runTimeoutMs, env);
    if (timedOut) fail(`the walkthrough of the world "${PROBE}" was killed after ${runTimeoutMs} ms (E2E_RUN_TIMEOUT_MS)`);
    else if (code !== 0) fail(`the walkthrough of the world "${PROBE}" failed: tools/shot.mjs exited with ${signal ?? `code ${code}`} — see ERRORS above`);
    else {
      // Written only by a walkthrough that came to its end with the voice checked.
      let voice = null;
      try { voice = JSON.parse(readFileSync(voiceOut, 'utf8')); } catch { /* no report */ }
      if (!voice) fail(`the walkthrough of the world "${PROBE}" left no report about the voice: it did not come to its end`);
      else if (!(voice.loud > 0)) fail(`the walkthrough of the world "${PROBE}" started ${voice.loud} of ${voice.clips} clips with a volume`);
      // ---- 4. the page asked for every file of the world ----
      const missed = notAskedByPage(files, asked);
      for (const f of missed) fail(`the page of the world "${PROBE}" never asked for ${f}: the world does not load its own file`);
      if (voice && !missed.length) console.log(`[worlds] the world "${PROBE}" played in the mobile size (${voice.loud} of ${voice.clips} clips with a volume); the page asked for ${files.join(', ')}`);
    }
  } catch (e) {
    fail(`${e.stack ?? e}`);
  } finally {
    server.close(); server.closeAllConnections();
  }
  end();
}
