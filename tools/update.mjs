// A new version of the game is taken at the next launch, not in the middle of a game (TECH-13):
//   node tools/update.mjs [distDir]
// tools/e2e.mjs runs it as the step "update", once per run (with the mobile size, like "failure screens").
// It serves the build itself, from a folder that can be switched: build A is distDir as it is, build B a copy of it
// with a mark in index.html (<meta name="e2e-build" content="B">) and so another revision of index.html in sw.js.
//   1. Build A is opened with ?debug; its service worker is activated and controls the page; "Play" is pressed.
//   2. The server is switched to build B and the page asks for an update (reg.update()): the new worker must be
//      installed and wait (reg.waiting), the page must keep its old worker (no controllerchange), must not be navigated
//      or reloaded (the mark of this session is still in window), and a task must still be solved - the stars it gives
//      are in the save. The same checks once more after the task.
//   3. Every page of the game is closed (only about:blank stays open): the waiting worker becomes the active one.
//      A new page of the game is opened: it is build B (the mark is there), and its save has the stars of step 2.
// Every wait is for an event or a state (the worker's state, a selector, the stars), with generous limits.
// Environment: E2E_GL=gl|swiftshader (as tools/shot.mjs), E2E_SLOW=<n> (multiplier for the limits), Q=<0|1|2> (fixed
// graphics tier, as tools/shot.mjs).
// Exit code: 0 — passed; 1 — a check failed (every failure is printed as "update: …"); 2 — bad arguments.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const [distArg = 'dist'] = process.argv.slice(2);
const usage = (msg) => { console.error(`[update] ${msg}\nUsage: node tools/update.mjs [distDir]`); process.exit(2); };
const dist = resolve(distArg);
if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'sw.js'))) usage(`${dist} has no index.html and sw.js: build the game first (npm run build)`);
const GL_ARGS = {
  gl: ['--use-angle=gl', '--enable-gpu'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const gl = process.env.E2E_GL || 'gl';
if (!GL_ARGS[gl]) usage(`unknown E2E_GL="${gl}": use "gl" or "swiftshader"`);
const slow = Number(process.env.E2E_SLOW || 1);
if (!(slow > 0)) usage(`bad E2E_SLOW="${process.env.E2E_SLOW}"`);
const T = (ms) => Math.round(ms * slow);
const MARK = 'e2e-build';
// The character whose first task is a panel task: __game.cheat() solves it.
const TALK_TO = 'fox';

const problems = [];
const fail = (msg) => { problems.push(msg); console.error(`update: ${msg}`); };
const limit = (what, ms, p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: nothing after ${ms} ms`)), ms))]);

// ---- build B: a copy of the build, index.html marked, its new revision in the precache list of sw.js ----
const copy = mkdtempSync(join(tmpdir(), 'academy-update-'));
function buildB() {
  cpSync(dist, copy, { recursive: true });
  const html = readFileSync(join(copy, 'index.html'), 'utf8');
  if (!/<head>/i.test(html)) throw new Error('index.html has no <head>');
  const marked = html.replace(/<head>/i, `<head><meta name="${MARK}" content="B">`);
  writeFileSync(join(copy, 'index.html'), marked);
  const sw = readFileSync(join(copy, 'sw.js'), 'utf8');
  const entry = /\{url:"index\.html",revision:"([0-9a-f]+)"\}/g;
  const found = [...sw.matchAll(entry)];
  if (found.length !== 1) throw new Error(`sw.js: expected one precache entry of index.html, found ${found.length}`);
  const revision = createHash('md5').update(marked).digest('hex');
  writeFileSync(join(copy, 'sw.js'), sw.replace(entry, `{url:"index.html",revision:"${revision}"}`));
  return { from: found[0][1], to: revision };
}

// ---- the server: the build it serves is switched by `serving`; a missing file is a 404, as on real hosting ----
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg',
};
let serving = dist;
const server = createServer((req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(serving, path));
  if (!file.startsWith(serving + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const gameUrl = `${origin}/?debug${process.env.Q ? `&q=${process.env.Q}` : ''}`;

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: [...GL_ARGS[gl], '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
});

const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };
/** The game's page: console errors and warnings, failed requests and navigations of its main frame are counted. */
function watch(page, name, log) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') fail(`${name}: console ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (own(r.url())) fail(`${name}: request failed: ${r.url()} (${r.failure()?.errorText})`); });
  page.on('response', (r) => { if (r.status() >= 400) fail(`${name}: HTTP ${r.status()} for ${r.url()}`); });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) log.navigations++; });
}
const mark = (page) => page.evaluate((n) => document.querySelector(`meta[name="${n}"]`)?.getAttribute('content') ?? 'A', MARK);

/** The worker versions of this browser context by DevTools (ServiceWorker domain), seen from an about:blank page. */
async function versions(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  const all = new Map();
  const waiters = [];
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions: vs }) => {
    for (const v of vs) all.set(v.versionId, v);
    for (const w of [...waiters]) if (w.test()) { waiters.splice(waiters.indexOf(w), 1); w.done(); }
  });
  await cdp.send('ServiceWorker.enable');
  const until = (what, test, ms) => test() ? Promise.resolve() : limit(what, ms, new Promise((done) => waiters.push({ test, done })));
  return { all, until };
}

let summary = '';
try {
  const b = buildB();
  console.log(`[update] build B: index.html marked, its revision ${b.from} -> ${b.to}; served on ${origin}`);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.route((u) => !own(u.href), (route) => route.abort());   // nothing leaves for the internet
  // Every page of the game counts the changes of its controlling worker from its first line on.
  await ctx.addInitScript(() => {
    window.__controllerChanges = 0;
    try { navigator.serviceWorker?.addEventListener('controllerchange', () => { window.__controllerChanges++; }); } catch { /* about:blank */ }
  });

  // ---- 1. build A: the worker takes the page, "Play" ----
  const log = { navigations: 0 };
  const page = await ctx.newPage();
  watch(page, 'build A', log);
  await page.goto(gameUrl);
  await page.locator('#play').waitFor({ state: 'visible', timeout: T(90000) });
  // clientsClaim: the worker installed by this very page takes it at once (the offline walkthrough relies on that).
  // Events, not polling: the worker is ready (activated), then the page has its controller or gets it (controllerchange).
  const taken = await limit('build A: the worker', T(120000), page.evaluate(async () => {
    const sw = navigator.serviceWorker;
    const reg = await sw.ready;
    if (reg.active.state !== 'activated') await new Promise((r) => reg.active.addEventListener('statechange', function f() { if (reg.active.state === 'activated') { reg.active.removeEventListener('statechange', f); r(); } }));
    if (!sw.controller) await new Promise((r) => sw.addEventListener('controllerchange', r, { once: true }));
    return !!sw.controller && !reg.installing && !reg.waiting;
  })).catch(() => false);
  if (!taken) throw new Error('build A: the service worker did not activate and take the page');
  const session = await page.evaluate(() => {
    window.__workerA = navigator.serviceWorker.controller;
    window.__controllerChanges = 0;
    return (window.__session = crypto.randomUUID());
  });
  log.navigations = 0;
  if (await mark(page) !== 'A') fail('build A: the page is not build A');
  await page.click('#play');
  await page.waitForFunction(() => !!window.__game && !document.querySelector('#bubble').classList.contains('hidden'), null, { timeout: T(30000) });
  // A new save flies over the world first (WORLD-11): a tap skips the tour - its end is waited for by the tour's own
  // state, not by the clock (on the slow CI runner the tour lasts minutes of the clock).
  if (await page.evaluate(() => !!__game.flyoverPlayer?.active)) {
    const vp = page.viewportSize();
    await page.touchscreen.tap(vp.width / 2, vp.height / 2);
    await page.waitForFunction(() => !__game.flyoverPlayer.active, null, { timeout: T(30000) })
      .catch(() => fail('build A: a tap did not end the tour of the world'));
  }

  // ---- 2. build B is published in the middle of the game ----
  serving = copy;
  const found = await limit('reg.update()', T(120000), page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.update();
    const w = reg.installing ?? reg.waiting;
    if (!w || w === window.__workerA) return { none: true };
    window.__workerB = w;
    // Installed (it waits) or gone; with skipWaiting it would go on to activating at once.
    if (w.state === 'installing') await new Promise((r) => w.addEventListener('statechange', function f() { if (w.state !== 'installing') { w.removeEventListener('statechange', f); r(); } }));
    return { state: w.state };
  }));
  if (found.none) throw new Error('reg.update() found no new worker: build B was not taken as a new version');
  if (found.state !== 'installed') fail(`the new worker did not install and wait: its state is "${found.state}"`);
  const check = async (when) => {
    const s = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return {
        changes: window.__controllerChanges, sameController: !!window.__workerA && navigator.serviceWorker.controller === window.__workerA,
        waiting: !!reg.waiting && reg.waiting === window.__workerB, state: window.__workerB.state, session: window.__session,
      };
    });
    if (s.changes) fail(`${when}: the page changed its controlling worker ${s.changes} time(s) (controllerchange): the new version took the game in the middle of it`);
    if (!s.sameController) fail(`${when}: the page is no longer controlled by the worker of build A`);
    if (!s.waiting) fail(`${when}: the new worker is not waiting (reg.waiting), its state is "${s.state}"`);
    if (log.navigations) fail(`${when}: the page was navigated ${log.navigations} time(s)`);
    if (s.session !== session) fail(`${when}: the mark of this session is gone from the page (it was reloaded)`);
    if (await mark(page) !== 'A') fail(`${when}: the page shows build B in the middle of the game`);
  };
  await check('after the update was found');
  // A task is still solved in build A, and its stars are written.
  await page.waitForFunction(() => !__game.busy, null, { timeout: T(60000) }).catch(() => fail('the game stayed busy after "Play"'));
  const stars0 = await page.evaluate(() => __game.save.stars);
  await page.evaluate((id) => __game.talk(id), TALK_TO);
  await page.locator('#task:not(.hidden)').waitFor({ timeout: T(30000) });
  const did = await page.evaluate(() => __game.cheat());
  const state = () => page.evaluate(() => ({ stars: __game.save.stars, busy: __game.busy, line: __game.line, task: !document.querySelector('#task').classList.contains('hidden') }));
  await page.waitForFunction((s) => __game.save.stars > s, stars0, { timeout: T(60000) }).catch(async () => {
    throw new Error(`the task with "${TALK_TO}" was not solved after the update was found (cheat: "${did}"; now ${JSON.stringify(await state())}, stars before ${stars0})`);
  });
  // The chain goes on to its next task: it is closed with its button (that changes nothing in the save).
  await page.locator('#task:not(.hidden):not(.won) #taskClose').click({ timeout: T(30000) });
  await page.waitForFunction(() => !__game.busy, null, { timeout: T(60000) }).catch(async () => {
    throw new Error(`the game stayed busy after the next task was closed (${JSON.stringify(await state())})`);
  });
  const before = await page.evaluate(() => ({ stars: __game.save.stars, quests: JSON.stringify(__game.save.worlds.fairy.quests), stored: JSON.parse(localStorage.getItem('amw-save')).stars }));
  if (before.stored !== before.stars) fail(`the stars of the task are not in the stored save: ${before.stored} stored, ${before.stars} in the game`);
  await check('after a task was solved');

  // ---- 3. every page of the game is closed, a new one is opened ----
  const blank = await ctx.newPage();
  const sw = await versions(ctx, blank);
  const waitingB = () => [...sw.all.values()].find((v) => v.status === 'installed');
  await sw.until('the waiting worker in DevTools', () => !!waitingB(), T(30000));
  const idB = waitingB().versionId;
  await page.close();
  await sw.until('the new worker after every page was closed', () => sw.all.get(idB)?.status === 'activated', T(60000))
    .catch(() => { throw new Error(`every page of the game is closed, but the new worker did not activate (it is "${sw.all.get(idB)?.status}")`); });
  watch(blank, 'build B', { navigations: 0 });
  await blank.goto(gameUrl);
  await blank.locator('#play').waitFor({ state: 'visible', timeout: T(90000) });
  await blank.waitForFunction(() => !!window.__game && !!navigator.serviceWorker.controller, null, { timeout: T(30000) })
    .catch(() => fail('build B: no window.__game or no controlling worker'));
  if (await mark(blank) !== 'B') fail('the game opened after every page was closed is not build B');
  const after = await blank.evaluate(() => ({ stars: __game.save.stars, quests: JSON.stringify(__game.save.worlds.fairy.quests) }));
  if (after.stars !== before.stars) fail(`build B opened the save with ${after.stars} star(s), build A left ${before.stars}`);
  if (after.quests !== before.quests) fail(`build B opened the save with the quests ${after.quests}, build A left ${before.quests}`);
  summary = `the new worker waited through a solved task (stars ${stars0} -> ${before.stars}), no controllerchange, no navigation; `
    + `after closing every page: build B with ${after.stars} star(s)`;
  await ctx.close();
} catch (e) {
  fail(`${e.stack ?? e}`);
} finally {
  await browser.close().catch(() => {});
  server.close();
  rmSync(copy, { recursive: true, force: true });
}
if (summary) console.log(`[update] ${summary}`);
console.log(problems.length ? `[update] FAILED: ${problems.length} problem(s)` : '[update] PASSED');
process.exit(problems.length ? 1 : 0);
