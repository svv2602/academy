// The probe world is a test world: the sources have it, the published game does not (TECH-15, TECH-09):
//   node tools/worlds.mjs [distDir]
// tools/e2e.mjs runs it as the step "worlds", once per run (with the mobile size, like "update"), on the dist/ it built.
//   1. The published build (distDir; without the argument `vite build` makes dist/ anew, as `npm run build` does) holds
//      nothing of the probe world: no file under a folder "probe", no chunk of it, none of its marks in the code.
//   2. The probe build is made anew: `vite build --mode probe --outDir dist-probe`. It must hold every file of
//      worlds-test/probe/ at the same path (models/probe/…, story/probe/…), the world in its code (the same search
//      as in 1 must find it there, or the search is blind) and the commit number of the sources.
//      The build must also list the world for the game (worlds.json: its files with their sizes and fingerprints),
//      keep its files out of the service worker's list and fit the size budget of a next world (tools/dist-size.mjs).
//   3. dist-probe/ is served by a server of its own and the probe world is played by the walkthrough every world
//      shares: tools/shot.mjs with E2E_WORLD=probe in the mobile size (pictures in shots-e2e/worlds-probe/).
//   4. The page itself asked the server for every file of the probe world (a request of the service worker filling
//      its cache does not count, nor one of the download in the background): a file of a world that the world never
//      loads proves nothing about loading.
//   5. The cache of the next world (TECH-09), in a browser of its own with an empty cache, on the same server:
//      "launch" - the first world is opened; until "Play" is pressed nobody asks the server for a file of the probe
//      world and no download has started; "download" - "Play" is pressed, the game downloads the probe world in the
//      background: the download ends with the world ready, the cache holds exactly the files of worlds.json, each
//      asked for by its fingerprint; "offline" - the network is switched off, the probe world is opened: it is built
//      from the cache (every file of it answered by the service worker, the server asked for nothing), "Play" works
//      and its character gives a task - without a failed request, an error or a warning in the console. The browser's
//      switch does not reach the requests the service worker makes itself: a file missing in the cache would still
//      be fetched, so "the server was asked for nothing" is the check that the world came from the cache.
//      Every wait is for an event or a state, with generous limits (E2E_SLOW multiplies them).
//   6. The transition between worlds (TECH-15), in a browser of its own, on the first world of the same build, once with
//      the bloom (?q=2) and once without (?q=0): the layer is stopped by window.__game.transition(p) in the middle of
//      its closing and on the loading screen, and each stop is a picture in shots-e2e/worlds-probe/
//      (transition-q<n>-mid.png, transition-q<n>-loading.png; without the bloom also the ring at 0 and at 1 and the
//      phone turned upright). Read from the pictures: the corners are covered and the middle is not, the hole is a
//      circle, the closed frame is one calm colour from side to side and the same on both paths (no bloom and no tone
//      curve on the layer), the ring grows with the progress, the world shows through the hole. Read from the game: the
//      layer costs one draw call a frame (frames with and without it in turn) and is not drawn outside a transition;
//      a transition started for real closes and opens in no less than 0.4 s of game time each and stays closed until
//      the world is said to be ready. The waits are for states too.
// A failed check of 1 or 2 ends the run before the walkthrough: there is nothing to play then.
// Environment: E2E_PORT=<n> (the first port to try, default 4183; a busy one is skipped), E2E_GL, E2E_SLOW, Q,
// E2E_LEVEL, E2E_STUCK_MS (passed on to tools/shot.mjs), E2E_RUN_TIMEOUT_MS (limit of the walkthrough, default 600000).
// Exit code: 0 — passed; 1 — a check failed (every failure is printed as "worlds: …"); 2 — bad arguments.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createSocket } from 'node:net';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDistSize, sizeSummary } from './dist-size.mjs';
import { WORLDS_LIST } from './vite-worlds.mjs';
import { worldOf } from './world-files.mjs';

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

/**
 * The files of `files` the page itself never asked for: `asked` is [{ path, referer, search }] as the server saw them.
 * A request with a query does not count: the world asks for its files by their plain addresses, the download of the
 * next world in the background (src/core/worldcache.ts) for `<file>?v=<fingerprint>` - it brings every file of the
 * list, loaded by the world or not.
 */
export function notAskedByPage(files, asked) {
  const fromPage = (referer) => { try { return !!referer && !/\/sw\.js$/.test(new URL(referer).pathname); } catch { return false; } };
  return files.filter((f) => !asked.some((r) => r.path === `/${f}` && !r.search && fromPage(r.referer)));
}

/** The requests of `asked` for a file of the world `id` (inside its folders: models/<id>/, voice/<id>/, story/<id>/), by anyone. */
export function askedOfWorld(asked, id) {
  return asked.filter((r) => worldOf(r.path.replace(/^\//, ''), [id]) === id);
}

/** The files of `listed` ([{ url, revision }] of worlds.json) the download never asked the server for by their fingerprint. */
export function notDownloaded(listed, asked) {
  return listed.filter((f) => !asked.some((r) => r.path === `/${f.url}` && r.search === `?v=${f.revision}`)).map((f) => f.url);
}

/**
 * The requests of `asked` that reached the server though the game had to do without it. The browser's own check for
 * a new service worker is not one of them: at a navigation it may ask for the worker's script again (/sw.js) and for
 * the scripts that script imports (/workbox-<hash>.js, asked by /sw.js), whatever the page does, and switching the
 * network off for the pages does not stop it (seen on the CI runner: CI 44055935550). Nothing else is left out: a
 * file of the game or of a world asked by the worker - a route that went to the network - still counts.
 */
export function askedWithoutNetwork(asked) {
  const byWorker = (referer) => { try { return /\/sw\.js$/.test(new URL(referer).pathname); } catch { return false; } };
  const updateCheck = (r) => r.path === '/sw.js' || (byWorker(r.referer) && /^\/workbox-[0-9a-z]+\.js$/i.test(r.path));
  return asked.filter((r) => !updateCheck(r));
}

/** worlds.json of the build `dir`, or null when it cannot be read. */
export function readList(dir) {
  try { return JSON.parse(readFileSync(join(dir, WORLDS_LIST), 'utf8')); } catch { return null; }
}

/**
 * The build `dir` must list the world `id` for the game (worlds.json, tools/vite-worlds.mjs): exactly `files`, each
 * with the size and the SHA-256 of the file in the build; the service worker must precache the list (the game reads
 * it without network) and have a route into the cache the list names. Returns the problems, [] when it is right.
 */
export function listProblems(dir, id, files) {
  const list = readList(dir);
  if (!list) return [`the build has no ${WORLDS_LIST} to read: the game cannot tell which files the world "${id}" has`];
  const listed = list.worlds?.[id]?.files;
  if (!Array.isArray(listed)) return [`${WORLDS_LIST} does not list the world "${id}"`];
  const out = [];
  const urls = listed.map((f) => f.url);
  for (const f of files) if (!urls.includes(f)) out.push(`${WORLDS_LIST} does not list ${f} of the world "${id}"`);
  for (const u of urls) if (!files.includes(u)) out.push(`${WORLDS_LIST} lists ${u}, which is not a file of the world "${id}"`);
  for (const f of listed) {
    const built = join(dir, f.url);
    if (!existsSync(built)) { out.push(`${WORLDS_LIST} lists ${f.url}, but the build has no such file`); continue; }
    const bytes = readFileSync(built);
    if (f.size !== bytes.length) out.push(`${WORLDS_LIST}: ${f.url} is ${bytes.length} bytes, the list says ${f.size}`);
    if (f.revision !== createHash('sha256').update(bytes).digest('hex')) out.push(`${WORLDS_LIST}: the fingerprint of ${f.url} is not the SHA-256 of the file in the build`);
  }
  const sw = existsSync(join(dir, 'sw.js')) ? readFileSync(join(dir, 'sw.js'), 'utf8') : '';
  if (![...sw.matchAll(/url:\s*"([^"]+)"/g)].some((m) => m[1] === WORLDS_LIST)) out.push(`sw.js does not precache ${WORLDS_LIST}: the game could not read the list without network`);
  if (typeof list.cache !== 'string' || !sw.includes(`cacheName:"${list.cache}"`)) out.push(`sw.js has no route into the cache "${list.cache}" that ${WORLDS_LIST} names`);
  return out;
}

// ---- pictures of the transition, as raw pixels: { data (RGBA), width, height } ----
const at = (img, x, y) => {
  const i = (Math.min(img.height - 1, Math.max(0, Math.round(y))) * img.width + Math.min(img.width - 1, Math.max(0, Math.round(x)))) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

/**
 * A picture of the closed frame must be one calm colour from side to side (it changes only from top to bottom) and
 * never dark. Returns the problems, [] when it is right.
 */
export function closedProblems(img) {
  const out = [];
  for (const f of [0.03, 0.25, 0.5, 0.75, 0.97]) {
    const y = Math.round((img.height - 1) * f), l = at(img, 2, y), r = at(img, img.width - 3, y);
    if (!near(l, r, 4)) out.push(`the closed frame is not one colour across the row ${y}: ${l} on the left, ${r} on the right - the layer does not cover the frame`);
    else if (Math.min(...l) < 120) out.push(`the closed frame is dark in the row ${y}: ${l}`);
  }
  return out;
}

/**
 * A picture of the middle of the closing (`mid`), read against the closed frame of the same size (`closed`, whose
 * left edge gives the colour of the layer in every row): the corners must be covered, the middle must not, and the
 * hole must be a circle around the middle - its half-width through the middle and 35% of the shorter side away from
 * it must fit one radius. Returns the problems, [] when it is right.
 */
export function irisProblems(mid, closed) {
  const { width: w, height: h } = mid, out = [];
  if (closed.width !== w || closed.height !== h) return [`the pictures are not of one size: ${w}x${h} and ${closed.width}x${closed.height}`];
  const covered = (x, y) => near(at(mid, x, y), at(closed, 2, y), 8);
  for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) {
    if (!covered(x, y)) out.push(`the corner ${x},${y} is not covered by the layer: ${at(mid, x, y)} there, ${at(closed, 2, y)} on the closed frame`);
  }
  const cx = Math.round(w / 2), cy = Math.round(h / 2);
  if (covered(cx, cy)) out.push(`the middle of the frame is covered (${at(mid, cx, cy)}): the iris has no hole`);
  if (out.length) return out;
  // From a point inside the hole along the longer side, to the first four covered pixels in a row.
  const wide = w >= h, d = Math.round(Math.min(w, h) * 0.35);
  const edge = (off, dir) => {
    for (let n = 0, row = 0; ; n++) {
      const x = wide ? cx + dir * n : cx + off, y = wide ? cy + off : cy + dir * n;
      if (x < 0 || y < 0 || x >= w || y >= h) return null;
      row = covered(x, y) ? row + 1 : 0;
      if (row === 4) return n - 3;
    }
  };
  const through = [edge(0, 1), edge(0, -1)], aside = [edge(d, 1), edge(d, -1), edge(-d, 1), edge(-d, -1)];
  if ([...through, ...aside].includes(null)) return ['the hole of the iris has no edge inside the frame along its longer side'];
  const r = (through[0] + through[1]) / 2, tol = 0.03 * r + 4, want = Math.sqrt(Math.max(0, r * r - d * d));
  // The world shows through the hole: along it the colours differ. One flat colour is a frame wiped by the layer.
  const inside = Array.from({ length: 33 }, (_, i) => { const t = Math.round((i / 32 - 0.5) * 1.6 * Math.min(...through)); return wide ? at(mid, cx + t, cy) : at(mid, cx, cy + t); });
  if (inside.every((c) => near(c, inside[0], 8))) out.push(`the hole is one flat colour (${inside[0]}): the layer is drawn instead of the frame, not over it`);
  if (Math.abs(through[0] - through[1]) > tol) out.push(`the hole is not around the middle: ${through[0]} px to one side, ${through[1]} px to the other`);
  if (aside.some((v) => Math.abs(v - want) > tol)) {
    out.push(`the hole is not a circle: ${r} px from the middle to its edge, and ${aside.join(', ')} px at ${d} px aside, where a circle has ${want.toFixed(1)} px`);
  }
  return out;
}

/**
 * `calls` - the draw calls of frames in a row, the layer stopped on the screen in every second one (the first is
 * without it). The world itself changes its count now and then, so only a frame with the layer between two frames
 * of one count is read: it must have exactly one call more. Returns the problems, [] when it is right.
 */
export function layerCallsProblems(calls) {
  const cost = [];
  for (let i = 0; i + 2 < calls.length; i += 2) if (calls[i] === calls[i + 2]) cost.push(calls[i + 1] - calls[i]);
  if (!cost.length) return [`the count of draw calls never stood still around a frame with the layer (${calls.join(', ')}): its cost cannot be read`];
  return cost.every((c) => c === 1) ? [] : [`the layer costs ${[...new Set(cost)].join(' and ')} draw call(s) a frame, it must cost exactly one and none outside a transition (frames without and with it in turn: ${calls.join(', ')})`];
}

/** How many pixels of a picture have the colours of the filled part of the loading ring (pink to violet: little green in them). */
export function ringPixels(img) {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) if (Math.max(img.data[i], img.data[i + 2]) - img.data[i + 1] > 85) n++;
  return n;
}

/** The largest difference of a colour between two pictures of the closed frame, over points away from the ring. */
export function layerDifference(a, b) {
  let most = 0;
  for (const fx of [0.03, 0.2, 0.8, 0.97]) for (const fy of [0.03, 0.25, 0.5, 0.75, 0.97]) {
    const p = at(a, (a.width - 1) * fx, (a.height - 1) * fy), q = at(b, (b.width - 1) * fx, (b.height - 1) * fy);
    most = Math.max(most, ...p.map((v, i) => Math.abs(v - q[i])));
  }
  return most;
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
    const size = checkDistSize(probeDist);
    const wrong = [...probeBuildProblems(probeDist, from, files, commit), ...listProblems(probeDist, PROBE, files), ...size.problems.map((p) => `the size of the probe build: ${p}`)];
    for (const p of wrong) fail(p);
    if (!wrong.length) {
      console.log(`[worlds] the probe build: ${files.join(', ')}; the world is in its code; commit ${commit}; ${WORLDS_LIST} lists its files, sw.js precaches none of them`);
      console.log(`[worlds] the size of the probe build: ${sizeSummary(size)}`);
    }
  } catch (e) { fail(e.message); }
  if (problems.length) end();

  // ---- 3. the probe build on a server of its own; a missing file is a 404, as on real hosting ----
  const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg',
  };
  const asked = [];   // every request answered with a file: its path, its query and who asked (the page or the service worker)
  const server = createServer((req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(probeDist, path));
    if (!file.startsWith(probeDist + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    asked.push({ path, referer: req.headers.referer ?? '', search: new URL(req.url, 'http://x').search });
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
  }
  // ---- 5. the cache of the next world ----
  try {
    const summary = await cacheScenarios({ url, asked, list: readList(probeDist), fail });
    if (summary) console.log(`[worlds] ${summary}`);
  } catch (e) {
    fail(`the cache of the world "${PROBE}": ${e.stack ?? e}`);
  }
  // ---- 6. the transition between worlds ----
  try {
    const summary = await transitionScenarios({ url, shots, fail });
    if (summary) console.log(`[worlds] ${summary}`);
  } catch (e) {
    fail(`the transition: ${e.stack ?? e}`);
  } finally {
    server.close(); server.closeAllConnections();
  }
  end();
}

/**
 * The scenarios of the transition between worlds (6 above) on the build served at `url`; the pictures go to `shots`.
 * Every failure goes to `fail`; returns the line to print when it all came to its end without one ('' otherwise).
 */
async function transitionScenarios({ url, shots, fail: report }) {
  let failures = 0;
  const fail = (msg) => { failures++; report(`the transition: ${msg}`); };
  const { chromium } = await import('playwright-core');
  const { default: sharp } = await import('sharp');
  const GL_ARGS = { gl: ['--use-angle=gl', '--enable-gpu'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  const gl = process.env.E2E_GL || 'gl';
  if (!GL_ARGS[gl]) throw new Error(`unknown E2E_GL="${gl}": use "gl" or "swiftshader"`);
  const slow = Number(process.env.E2E_SLOW || 1);
  if (!(slow > 0)) throw new Error(`bad E2E_SLOW="${process.env.E2E_SLOW}"`);
  const T = (ms) => Math.round(ms * slow);
  const origin = new URL(url).origin;
  const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome', headless: true,
    args: [...GL_ARGS[gl], '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  try {
    const closedOn = {};   // the closed frame of each path, to compare the two
    const times = {};
    for (const q of [2, 0]) {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      await ctx.route((u) => !own(u.href), (route) => route.abort());   // nothing leaves for the internet
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') fail(`q${q}: console ${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => fail(`q${q}: pageerror: ${e.message}`));
      await page.goto(`${url}?debug&q=${q}`);
      // With the bloom on software rendering (the CI runner) the game loads and draws many times slower: generous limits.
      await page.locator('#play').waitFor({ state: 'visible', timeout: T(240000) });
      await page.waitForFunction(() => !!window.__game?.fade && typeof __game.transition === 'function' && __game.time > 0, null, { timeout: T(30000) })
        .catch(() => { throw new Error(`q${q}: no window.__game.transition and window.__game.fade - the game does not show its transition with ?debug`); });
      // The layer is drawn in the canvas, the interface lies over it: only the canvas is pictured.
      await page.addStyleTag({ content: 'body > *:not(canvas) { visibility: hidden !important; }' });
      /** In how many of the next frames the layer is drawn (seven of them pass). */
      const drawn = () => page.evaluate(() => new Promise((res) => {
        const from = __game.fade.frames;
        let n = 0;
        const f = () => { if (++n < 7) requestAnimationFrame(f); else res(__game.fade.frames - from); };
        requestAnimationFrame(f);
      }));
      /** Stops the layer at a point, waits until two frames were drawn with it, pictures the screen. */
      const hold = async (p, progress, name) => {
        const n = await page.evaluate(([point, f]) => { __game.transition(point, f); return __game.fade.frames; }, [p, progress]);
        await page.waitForFunction((from) => __game.fade.frames > from + 1, n, { timeout: T(90000) })
          .catch(() => { throw new Error(`q${q}: __game.transition(${p}) did not bring the layer to the screen: no frame was drawn with it`); });
        const { data, info } = await sharp(await page.screenshot({ path: join(root, shots, `${name}.png`) })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        return { data, width: info.width, height: info.height };
      };

      const early = await drawn() + await page.evaluate(() => __game.fade.frames);
      if (early !== 0) fail(`q${q}: the layer is drawn before any transition: in ${early} frame(s)`);
      // Nine frames, the layer stopped in every second one. This callback runs after the game's frame of the same
      // tick (the game asked for its next frame first): it reads the frame just drawn and sets the next one.
      // Counted: the draw calls of a frame (renderer.info.render.calls, as the counter of ?debug shows them) less the
      // drawing of the world itself - what the world draws changes from frame to frame by a call or two (seen on the
      // first runs of this check), what is drawn after it (the passes of the bloom, the layer) does not.
      const calls = await page.evaluate(() => new Promise((res) => {
        const r = __game.renderer, plain = r.render, got = [];
        let world = 0;
        r.render = function (scene, camera) {
          const from = r.info.render.calls;
          plain.call(r, scene, camera);
          if (scene === __game.scene) world += r.info.render.calls - from;
        };
        const f = () => {
          got.push(r.info.render.calls - world);
          world = 0;
          __game.transition(got.length % 2 && got.length < 9 ? 0.5 : null);
          if (got.length < 9) requestAnimationFrame(f); else { r.render = plain; res(got); }
        };
        requestAnimationFrame(f);
      }));
      for (const p of layerCallsProblems(calls)) fail(`q${q}: ${p}`);
      const mid = await hold(0.5, 0, `transition-q${q}-mid`);
      const closed = closedOn[q] = await hold(1, 0.6, `transition-q${q}-loading`);
      for (const p of closedProblems(closed)) fail(`q${q}: the loading screen: ${p}`);
      for (const p of irisProblems(mid, closed)) fail(`q${q}: the middle of the closing: ${p}`);
      const filled = ringPixels(closed);
      if (q === 0) {
        // the ring at 0 and at 1: it grows with the progress
        const none = ringPixels(await hold(1, 0, 'transition-q0-loading-0')), whole = ringPixels(await hold(1, 1, 'transition-q0-loading-1'));
        if (!(whole > 2000 && none < whole * 0.1 && filled > whole * 0.45 && filled < whole * 0.75)) {
          fail(`q0: the loading ring does not grow with the progress: ${none} px filled at 0, ${filled} px at 0.6, ${whole} px at 1`);
        }
        // the phone turned upright: the hole is still a circle
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => __game.renderer.domElement.width < __game.renderer.domElement.height, null, { timeout: T(30000) })
          .catch(() => { throw new Error('q0: the canvas did not follow the screen turned upright'); });
        const upright = await hold(0.5, 0, 'transition-q0-portrait-mid'), uprightClosed = await hold(1, 0.6, 'transition-q0-portrait-loading');
        for (const p of closedProblems(uprightClosed)) fail(`q0, upright: the loading screen: ${p}`);
        for (const p of irisProblems(upright, uprightClosed)) fail(`q0, upright: the middle of the closing: ${p}`);
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction(() => __game.renderer.domElement.width > __game.renderer.domElement.height, null, { timeout: T(30000) })
          .catch(() => { throw new Error('q0: the canvas did not follow the screen turned back'); });
      } else if (!(filled > 2000)) fail(`q${q}: the loading ring is not on the loading screen: ${filled} px of its colours`);
      await page.evaluate(() => __game.transition(null));
      const left = await drawn();
      if (left) fail(`q${q}: the layer is still drawn after __game.transition(null): in ${left} frame(s)`);

      if (q === 0) {
        // A transition for real, in game time: closes, stays closed 0.6 s with the world not ready, opens after ready().
        let timer;
        const live = await Promise.race([
          page.evaluate(() => new Promise((res) => {
            const f = __game.fade, t0 = __game.time, out = {};
            f.start();
            const tick = () => {
              const t = __game.time;
              if (out.closing === undefined) { if (f.closed) { out.closing = t - t0; out.closedAt = t; f.setProgress(0.5); } }
              else if (out.held === undefined) { if (t - out.closedAt >= 0.6) { out.held = f.closed && f.phase === 'hold'; out.readyAt = t; f.ready(); } }
              else if (!f.active) { out.opening = t - out.readyAt; res(out); return; }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          })),
          new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`q0: a started transition did not come to its end in ${T(90000)} ms: the frame did not close, or did not open after ready()`)), T(90000)); }),
        ]).finally(() => clearTimeout(timer));
        times.closing = live.closing; times.opening = live.opening;
        if (!(live.closing >= 0.4 && live.closing <= 1.5)) fail(`q0: the frame closed in ${live.closing} s of game time, expected 0.4 to 1.5`);
        if (!live.held) fail('q0: the frame did not stay closed while the world was not ready');
        if (!(live.opening >= 0.4 && live.opening <= 2.5)) fail(`q0: the frame opened ${live.opening} s of game time after ready(), expected 0.4 to 2.5`);
        const ended = await drawn();
        if (ended) fail(`q0: the layer is still drawn after a transition played to its end: in ${ended} frame(s)`);
      }
      await ctx.close();
    }
    const apart = layerDifference(closedOn[2], closedOn[0]);
    if (apart > 6) fail(`the closed frame with the bloom (q2) is not the colour it is without (q0): they differ by ${apart} of 255 - the bloom or the tone curve reaches the layer`);
    if (failures) return '';
    return 'the transition: the layer is on the screen with the bloom (q2) and without (q0), one draw call a frame and none outside a transition; the hole is a circle '
      + `(844x390 and 390x844), the loading screen is one colour on both paths, the ring grows with the progress; played for real it closed in ${times.closing.toFixed(2)} s `
      + `and opened ${times.opening.toFixed(2)} s of game time after "ready"; pictures: ${shots}/transition-*.png`;
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * The scenarios of the cache of the next world (5 above) on the probe build served at `url`: `asked` is the server's
 * record of requests, `list` worlds.json of the build. Every failure goes to `fail`; returns the line to print when
 * all three scenarios came to their end without one ('' otherwise).
 */
async function cacheScenarios({ url, asked, list, fail: report }) {
  let failures = 0;
  const fail = (msg) => { failures++; report(msg); };
  const { chromium } = await import('playwright-core');
  const GL_ARGS = { gl: ['--use-angle=gl', '--enable-gpu'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  const gl = process.env.E2E_GL || 'gl';
  if (!GL_ARGS[gl]) throw new Error(`unknown E2E_GL="${gl}": use "gl" or "swiftshader"`);
  const slow = Number(process.env.E2E_SLOW || 1);
  if (!(slow > 0)) throw new Error(`bad E2E_SLOW="${process.env.E2E_SLOW}"`);
  const T = (ms) => Math.round(ms * slow);
  const listed = list?.worlds?.[PROBE]?.files ?? [];
  if (!listed.length) throw new Error(`${WORLDS_LIST} lists no file of the world "${PROBE}": there is nothing to download`);
  const files = listed.map((f) => f.url).sort();
  const origin = new URL(url).origin;
  const q = process.env.Q ? `&q=${process.env.Q}` : '';
  const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };

  // Chrome as in tools/update.mjs; a context of its own, so the cache starts empty.
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome', headless: true,
    args: [...GL_ARGS[gl], '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await ctx.route((u) => !own(u.href), (route) => route.abort());   // nothing leaves for the internet
    /** The game's page: console errors and warnings, page errors, failed requests and HTTP errors are failures. */
    const watch = (page, name) => {
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') fail(`${name}: console ${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => fail(`${name}: pageerror: ${e.message}`));
      page.on('requestfailed', (r) => fail(`${name}: request failed: ${r.url()} (${r.failure()?.errorText})`));
      page.on('response', (r) => { if (r.status() >= 400) fail(`${name}: HTTP ${r.status()} for ${r.url()}`); });
    };
    const who = (r) => `${r.path}${r.search} (asked by ${r.referer || 'nobody known'})`;

    // ---- "launch": the first world, until "Play" ----
    const from = asked.length;
    const page = await ctx.newPage();
    watch(page, 'launch');
    await page.goto(`${url}?debug${q}`);
    await page.locator('#play').waitFor({ state: 'visible', timeout: T(90000) });
    // The service worker has installed (its whole list is in the cache) and taken the page: whatever the launch asks
    // for, it has asked for by now.
    const taken = await page.evaluate(async () => {
      const sw = navigator.serviceWorker;
      const reg = await sw.ready;
      if (reg.active.state !== 'activated') await new Promise((r) => reg.active.addEventListener('statechange', function f() { if (reg.active.state === 'activated') { reg.active.removeEventListener('statechange', f); r(); } }));
      if (!sw.controller) await new Promise((r) => sw.addEventListener('controllerchange', r, { once: true }));
      return !!sw.controller;
    });
    if (!taken) throw new Error('launch: the service worker did not activate and take the page');
    await page.waitForFunction(() => !!window.__game?.worlds, null, { timeout: T(30000) })
      .catch(() => { throw new Error('launch: no window.__game.worlds - the game does not show the cache of worlds with ?debug'); });
    const early = askedOfWorld(asked.slice(from), PROBE);
    for (const r of early) fail(`launch: before "Play" the server was asked for a file of the world "${PROBE}": ${who(r)}`);
    const before = await page.evaluate(async () => ({ state: __game.worlds.state(), status: await __game.worlds.status('probe'), kept: (await caches.keys()).includes('worlds') ? (await (await caches.open('worlds')).keys()).length : 0 }));
    if (before.state !== null) fail(`launch: the download of the next world started before "Play": ${JSON.stringify(before.state)}`);
    if (before.status !== 'none' || before.kept) fail(`launch: before "Play" the world "${PROBE}" is "${before.status}" with ${before.kept} file(s) in the cache "worlds", expected "none" and 0`);

    // ---- "download": "Play" starts it; it ends with the world ready ----
    await page.click('#play');
    await page.waitForFunction(() => { const s = __game.worlds.state(); return !!s && !s.running; }, null, { timeout: T(60000) })
      .catch(async () => { throw new Error(`download: after "Play" the download of the next world did not end (its state: ${JSON.stringify(await page.evaluate(() => __game.worlds.state()))})`); });
    const after = await page.evaluate(async (name) => ({
      state: __game.worlds.state(), status: await __game.worlds.status('probe'), cached: await __game.worlds.cached('probe'),
      keys: (await (await caches.open(name)).keys()).map((r) => r.url).sort(),
    }), list.cache);
    const s = after.state;
    if (s.world !== PROBE || s.status !== 'ready' || s.error !== null || s.done !== files.length || s.total !== files.length) {
      fail(`download: expected the world "${PROBE}" ready with ${files.length} of ${files.length} files, the download ended as ${JSON.stringify(s)}`);
    }
    if (after.status !== 'ready') fail(`download: after the download the world "${PROBE}" is "${after.status}", expected "ready"`);
    if (JSON.stringify(after.cached) !== JSON.stringify(files)) fail(`download: the cache holds ${JSON.stringify(after.cached)} of the world, ${WORLDS_LIST} lists ${JSON.stringify(files)}`);
    const expected = files.map((f) => new URL(f, url).href).sort();
    if (JSON.stringify(after.keys) !== JSON.stringify(expected)) fail(`download: the cache "${list.cache}" holds ${JSON.stringify(after.keys)}, expected ${JSON.stringify(expected)}`);
    for (const f of notDownloaded(listed, asked.slice(from))) fail(`download: the server was never asked for ${f} by its fingerprint (?v=…)`);

    // ---- "offline": the probe world from the cache ----
    // The switch takes the network from the pages (navigator.onLine is false), not from the service worker's own
    // requests: what proves the cache is that the server is asked for nothing from here on (`off`) - but for the
    // browser's check for a new worker, which is not the game's (`askedWithoutNetwork`).
    await ctx.setOffline(true);
    const off = asked.length;
    const page2 = await ctx.newPage();
    watch(page2, 'offline');
    const served = new Set();   // the files of the world the service worker answered
    page2.on('response', (r) => {
      const path = new URL(r.url()).pathname.replace(/^\//, '');
      if (files.includes(path) && r.status() === 200 && r.fromServiceWorker()) served.add(path);
    });
    await page2.goto(`${url}?debug&world=${PROBE}${q}`);
    await page2.locator('#play').waitFor({ state: 'visible', timeout: T(90000) })
      .catch(() => { throw new Error(`offline: the world "${PROBE}" did not load without network ("Play" never appeared)`); });
    await page2.waitForFunction(() => !!window.__game?.worlds && __game.npcs.length > 0, null, { timeout: T(30000) })
      .catch(() => { throw new Error(`offline: the world "${PROBE}" was not built (no window.__game or no character)`); });
    for (const f of files) if (!served.has(f)) fail(`offline: ${f} was not answered by the service worker: the world did not load its file from the cache`);
    const offline = await page2.evaluate(() => __game.worlds.status('probe'));
    if (offline !== 'ready') fail(`offline: the world "${PROBE}" is "${offline}" without network, expected "ready"`);
    await page2.click('#play');
    await page2.waitForFunction(() => !__game.busy, null, { timeout: T(60000) }).catch(() => fail('offline: the game stayed busy after "Play"'));
    await page2.evaluate(() => __game.talk(__game.npcs[0].def.id));
    await page2.locator('#task:not(.hidden)').waitFor({ timeout: T(30000) })
      .catch(() => fail(`offline: the character of the world "${PROBE}" gave no task`));
    const leaked = askedWithoutNetwork(asked.slice(off));
    if (leaked.length) fail(`offline: the server was asked for ${leaked.length} file(s) with the network switched off: ${leaked.slice(0, 5).map(who).join(', ')}`);
    await ctx.close();
    if (failures) return '';
    return `the cache of the next world: nothing of "${PROBE}" asked for before "Play"; after it ${files.length} file(s) downloaded (${files.join(', ')}), the world ready; `
      + 'without network the world was built from the cache and its character gave a task';
  } finally {
    await browser.close().catch(() => {});
  }
}
