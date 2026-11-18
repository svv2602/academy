// The rounds "first world -> probe world -> back" on the phone (TECH-15, R21): the same five rounds and the same
// numbers as the scenario "rounds" of tools/worlds.mjs (`playRound`, `readRound`, `roundProblems`), played in Chrome on
// the S22 over USB. A person runs it, with the phone at hand; nothing in CI or in `npm test` touches a phone.
//   node tools/worlds-phone.mjs [--cdp <address>] [--port <n>] [--dist <folder>]
// Before it:
//   1. the probe build: `node node_modules/vite/bin/vite.js build --mode probe --outDir dist-probe` (or any part of
//      `node tools/worlds.mjs`, which makes it anew);
//   2. the phone by USB with debugging allowed, Chrome open on it, then
//        adb forward tcp:9333 localabstract:chrome_devtools_remote      (Chrome of the phone at --cdp, 127.0.0.1:9333)
//        adb reverse tcp:<port> tcp:<port>                             (the phone reaches this machine's server, 4373)
// What it does: serves the probe build on 127.0.0.1:<port>; opens a tab of its own on the phone (no other tab is
// touched) and keeps it in front - a tab in the background draws nothing; copies the game's storage of that address
// (the keys amw-*; it is the storage of http://localhost:<port>, not the one of the published game) and keeps the copy
// in memory only, never in a file; plays "Play" and the five rounds, the garbage collected and the numbers read after
// each; puts the storage back as it was, closes its tab and ends. Exit code: 0 - the five rounds within 10 %;
// 1 - a check failed; 2 - bad arguments or no probe build; 3 - no phone at the address (nothing is done then).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_WORLD, PROBE, PROBE_DIST, ROUNDS, playRound, readRound, roundLine, roundProblems, watchPrograms } from './worlds.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Where Chrome of the phone answers after `adb forward tcp:9333 localabstract:chrome_devtools_remote`. */
export const PHONE_CDP = 'http://127.0.0.1:9333';
/** The port of the server of the probe build, the same on the phone (`adb reverse`): the port of checklist K. */
export const PHONE_PORT = 4373;
/** The keys of the game's storage (src/core/save.ts: amw-save, amw-save-prev, amw-save-v<N>). */
export const SAVE_KEYS = /^amw-/;

/** Reads `[--cdp <address>] [--port <n>] [--dist <folder>]`: { cdp, port, dist } or { error }. */
export function readPhoneArgs(args) {
  const out = { cdp: PHONE_CDP, port: PHONE_PORT, dist: PROBE_DIST };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const a = args[i], key = a.replace(/^--/, '');
    if (!['--cdp', '--port', '--dist'].includes(a)) return { error: `unknown argument "${a}"` };
    if (seen.has(key)) return { error: `${a} is given twice` };
    seen.add(key);
    const v = args[++i];
    if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value` };
    if (key === 'port') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return { error: `bad --port "${v}"` };
      out.port = n;
    } else if (key === 'cdp') {
      try { const u = new URL(v); if (u.protocol !== 'http:') throw new Error(); out.cdp = u.origin; } catch { return { error: `bad --cdp "${v}": an address like ${PHONE_CDP}` }; }
    } else out.dist = v;
  }
  return out;
}

/**
 * What the address of --cdp answered at /json/version is not Chrome on a phone: the reason, or null when it is. A
 * Chrome of this machine at the address would be driven instead of the phone - its numbers are not the phone's.
 */
export function phoneProblem(version) {
  if (!version || typeof version !== 'object') return 'it did not answer as Chrome does (no /json/version)';
  const agent = String(version['User-Agent'] ?? '');
  if (!/Android/.test(agent) && !version['Android-Package']) return `it is not Chrome on a phone (${version.Browser ?? 'unknown browser'}, ${agent || 'no user agent'})`;
  if (typeof version.webSocketDebuggerUrl !== 'string') return 'it gives no address to drive the browser (webSocketDebuggerUrl)';
  return null;
}

/** How to get the phone to the address, printed when it is not there. */
export function phoneHelp(cdp, port) {
  return [
    `no phone: nothing answers as Chrome on a phone at ${cdp}.`,
    'Connect the phone by USB with debugging allowed, open Chrome on it, then:',
    `  adb forward tcp:${new URL(cdp).port || 80} localabstract:chrome_devtools_remote`,
    `  adb reverse tcp:${port} tcp:${port}`,
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  const args = readPhoneArgs(process.argv.slice(2));
  const usage = (msg) => { console.error(`[phone] ${msg}\nUsage: node tools/worlds-phone.mjs [--cdp ${PHONE_CDP}] [--port ${PHONE_PORT}] [--dist ${PROBE_DIST}]`); process.exit(2); };
  if (args.error) usage(args.error);

  // ---- the phone first: without it nothing is served, opened or touched ----
  let version = null;
  try {
    const res = await fetch(`${args.cdp}/json/version`, { signal: AbortSignal.timeout(5000) });
    version = res.ok ? await res.json() : null;
  } catch { /* nothing answers */ }
  const why = phoneProblem(version);
  if (why) { console.error(`[phone] ${phoneHelp(args.cdp, args.port)}\n[phone] (${args.cdp}: ${why})`); process.exit(3); }

  const dist = resolve(root, args.dist);
  if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'worlds.json'))) usage(`${dist} is not a probe build (no index.html or worlds.json): make it with node node_modules/vite/bin/vite.js build --mode probe --outDir ${PROBE_DIST}`);

  // ---- the probe build on this machine; the phone reaches it at localhost:<port> through adb reverse ----
  const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg',
  };
  const server = createServer((req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(dist, path));
    if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  });
  await new Promise((ok, bad) => { server.once('error', bad); server.listen(args.port, '127.0.0.1', ok); }).catch((e) => usage(`the port ${args.port} cannot be served: ${e.message}`));
  const base = `http://localhost:${args.port}/`;
  console.log(`[phone] ${args.dist}/ served on 127.0.0.1:${args.port}; the phone opens ${base}`);

  const { chromium } = await import('playwright-core');
  const browser = await chromium.connectOverCDP(args.cdp, { timeout: 30000 });
  const ctx = browser.contexts()[0];
  if (!ctx) { console.error('[phone] Chrome of the phone has no browser context to open a tab in'); process.exit(1); }
  const page = await ctx.newPage();
  const problems = [];
  let kept = null;
  try {
    await page.bringToFront();
    // The storage of this address, read with no game running (the manifest is a file of the same address).
    await page.goto(`${base}manifest.webmanifest`);
    kept = await page.evaluate((re) => Object.fromEntries(Object.keys(localStorage).filter((k) => new RegExp(re).test(k)).map((k) => [k, localStorage.getItem(k)])), SAVE_KEYS.source);
    console.log(`[phone] the storage of ${base}: ${Object.keys(kept).length} key(s) kept in memory`);
    await page.goto(`${base}?debug&q=1`);
    await page.locator('#play').waitFor({ state: 'visible', timeout: 240000 });
    const until = (fn, arg, what, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms }).catch(() => { throw new Error(what); });
    await until(() => typeof window.__game?.travel === 'function' && window.__game.time > 0, null, 'no window.__game.travel: the probe build was not opened with ?debug');
    await page.click('#play');
    await until(() => { const g = window.__game; if (g.flyoverPlayer?.active) g.flyoverPlayer.skip(); return !g.busy && !g.flyoverPlayer?.active; }, null, 'the game stayed busy after "Play"');
    const world = await page.evaluate(() => window.__game.world);
    if (world !== FIRST_WORLD) throw new Error(`the game started in "${world}", expected "${FIRST_WORLD}"`);
    const screen = await page.evaluate(() => ({ size: [innerWidth, innerHeight], dpr: devicePixelRatio, agent: navigator.userAgent }));
    console.log(`[phone] ${screen.agent}; ${screen.size.join('x')} at ${screen.dpr}`);
    const cdp = await ctx.newCDPSession(page);
    const rounds = [];
    await watchPrograms(page);
    for (let n = 1; n <= ROUNDS; n++) {
      const wrong = await playRound(page, until);
      for (const x of wrong) problems.push(`round ${n}: ${x}`);
      if (wrong.length) break;
      rounds.push(await readRound(page, cdp, n));
      console.log(`[phone] ${roundLine(rounds[rounds.length - 1])}`);
    }
    problems.push(...roundProblems(rounds));
    console.log(`[phone] result ${JSON.stringify({ world: PROBE, rounds, screen })}`);
  } catch (e) {
    problems.push(e.message ?? String(e));
  } finally {
    if (kept) {
      try {
        await page.goto(`${base}manifest.webmanifest`);
        const back = await page.evaluate(([re, was]) => {
          for (const k of Object.keys(localStorage)) if (new RegExp(re).test(k) && !(k in was)) localStorage.removeItem(k);
          for (const [k, v] of Object.entries(was)) localStorage.setItem(k, v);
          return Object.keys(localStorage).filter((k) => new RegExp(re).test(k)).every((k) => localStorage.getItem(k) === was[k]) && Object.keys(was).every((k) => localStorage.getItem(k) === was[k]);
        }, [SAVE_KEYS.source, kept]);
        console.log(`[phone] the storage put back as it was: ${back}`);
        if (!back) problems.push('the storage of the address was not put back as it was');
      } catch (e) { problems.push(`the storage was not put back: ${e.message}`); }
    }
    await page.close().catch(() => {});
    await browser.close().catch(() => {});   // over CDP: the connection ends, Chrome of the phone stays
    server.close(); server.closeAllConnections();
  }
  for (const p of problems) console.error(`[phone] ${p}`);
  console.log(problems.length ? `[phone] FAILED: ${problems.length} problem(s)` : `[phone] PASSED: ${ROUNDS} rounds, the last within 10 % of the first`);
  process.exit(problems.length ? 1 : 0);
}
