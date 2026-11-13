// Full play-through smoke test: node tools/shot.mjs <url> <outDir> [desktop|mobile]
// Plays the whole first world through the real UI handlers (talk to every character, solve all 15 tasks,
// make one deliberate mistake per task type to exercise the hints, restore the crystal), saves screenshots
// and fails on anything suspicious.
//
// Exit code: 0 — the world was completed and nothing was reported;
//            1 — console error or warning, page exception, stuck quest or timed-out wait, failed request
//                (network error or HTTP >= 400), request to another origin, element linking to another origin;
//            2 — bad arguments or environment.
// Environment:
//   Q=<0|1|2>               fixed graphics tier (?q=…); default: the game picks and lowers it itself
//   E2E_GL=gl|swiftshader   gl (default): real GPU; swiftshader: software rendering, for machines without a GPU
//   E2E_SLOW=<n>            multiplier for the scenario timeouts and pauses (default 1)
//   E2E_STUCK_MS=<ms>       how long one quest may take before it is reported as stuck (default 240000)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';

const [url = 'http://localhost:5173/', out = 'shots', mode = 'desktop'] = process.argv.slice(2);
const GL_ARGS = {
  gl: ['--use-angle=gl', '--enable-gpu'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const gl = process.env.E2E_GL || 'gl';
const slow = Number(process.env.E2E_SLOW || 1);
const stuckMs = Number(process.env.E2E_STUCK_MS || 240000);
const usage = (msg) => { console.error(msg); process.exit(2); };
if (!GL_ARGS[gl]) usage(`unknown E2E_GL="${gl}": use "gl" (real GPU, default) or "swiftshader" (software rendering)`);
if (!(slow > 0)) usage(`bad E2E_SLOW="${process.env.E2E_SLOW}": expected a positive number`);
if (!(stuckMs > 0)) usage(`bad E2E_STUCK_MS="${process.env.E2E_STUCK_MS}": expected a positive number of milliseconds`);
let origin, host;
try { ({ origin, hostname: host } = new URL(url)); } catch { usage(`bad url "${url}"`); }
const T = (ms) => Math.round(ms * slow);

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: [
    ...GL_ARGS[gl], '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    // Second line of defence for "the check itself never goes to the internet": names other than the host under
    // test do not resolve at all (covers what request routing cannot see, e.g. service worker or WebSocket traffic).
    `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${host}`,
  ],
});
const errors = [];
let nRequests = 0;
const cancelled = [];
const origins = new Set();
try {
  const ctx = await browser.newContext(mode === 'mobile'
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 720 } });

  // ---- network: every request of the context (pages and the service worker) must stay on our own origin ----
  const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };
  // Requests to other origins are cut off right here, so the check never talks to the internet.
  await ctx.route((u) => !own(u.href), (route) => route.abort());
  ctx.on('request', (r) => {
    nRequests++;
    const u = r.url();
    if (!/^(data|blob):/.test(u)) { try { origins.add(new URL(u).origin); } catch { origins.add(u); } }
    if (!own(u)) errors.push(`external request: ${r.method()} ${u} (${r.resourceType()})`);
  });
  ctx.on('requestfailed', (r) => {
    if (!own(r.url())) return;                       // already reported as an external request
    const why = r.failure()?.errorText ?? 'unknown error';
    // The only tolerated failure: the browser itself cancelling a request it no longer needs (page or browser
    // closing in the middle of the service worker precache, a sound stopped or replaced while still loading).
    if (why === 'net::ERR_ABORTED') { cancelled.push(r.url()); return; }
    errors.push(`request failed: ${r.url()} (${why})`);
  });
  ctx.on('response', (r) => { if (r.status() >= 400) errors.push(`request failed: ${r.url()} (HTTP ${r.status()})`); });

  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('websocket', (ws) => { if (!own(ws.url().replace(/^ws/, 'http'))) errors.push(`external request: WebSocket ${ws.url()}`); });
  const shot = (n) => page.screenshot({ path: `${out}/${mode}-${n}.png` });
  const wait = (ms) => page.waitForTimeout(T(ms));
  const g = (fn, ...a) => page.evaluate(fn, ...a);
  const visible = (sel) => g((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden'); }, sel);
  const press = (sel) => page.locator(sel).dispatchEvent(mode === 'mobile' ? 'pointerdown' : 'click').catch(() => {});
  // ---- links: no element of the document may point to another origin ----
  const checkLinks = async (where) => {
    const found = await g(() => {
      const attr = { a: 'href', area: 'href', link: 'href', iframe: 'src', script: 'src', img: 'src', form: 'action' };
      const res = [];
      for (const e of document.querySelectorAll('a[href], area[href], link[href], iframe[src], script[src], img[src], form[action]')) {
        const raw = e.getAttribute(attr[e.localName]) ?? '';
        let u = null;
        try { u = new URL(raw, document.baseURI); } catch { /* unparsable: report as is */ }
        if (u && (u.protocol === 'data:' || u.protocol === 'blob:' || u.origin === location.origin)) continue;
        res.push(`<${e.localName}> ${u ? u.href : raw}`);
      }
      return res;
    });
    for (const f of found) errors.push(`external link ${f} (${where})`);
  };

  try {
    await page.goto(url + (process.env.Q ? `?q=${process.env.Q}` : ''));
    await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
    await wait(1500); await shot('00-start'); await checkLinks('start screen');
    await page.click('#play');
    await page.waitForFunction(() => !document.querySelector('#bubble').classList.contains('hidden'), null, { timeout: T(20000) });
    await wait(9000); await shot('01-spawn');

    const seen = new Set();
    const quests = await g(() => __game.npcs.map((n) => ({ id: n.def.id, x: n.def.x, z: n.def.z })));
    for (const q of quests) {
      const t0 = Date.now();
      while ((await g((id) => __game.save.quests[id] ?? 0, q.id)) < 3 || await g(() => __game.busy)) {
        if (Date.now() - t0 > T(stuckMs)) throw new Error('quest stuck: ' + q.id);
        if (await visible('#fanfare')) { await shot(`shard-${q.id}`); await page.click('#fanfareOk'); await wait(500); continue; }
        if (await visible('#task')) {
          const type = await g(() => document.querySelector('#taskStage').className.split(' t-')[1].split(' ')[0]);
          if (!seen.has(type)) {
            seen.add(type); await wait(type === 'simon' ? 5500 : 900); await shot(`task-${type}`);
            // one deliberate mistake: a wrong answer button, to see the hint
            const wrong = await g(() => { const b = [...document.querySelectorAll('#taskOpts .opt')].find((x) => !x.classList.contains('yes')); if (!b) return false; b.dispatchEvent(new PointerEvent('pointerdown')); return true; });
            if (wrong) { await wait(3200); await shot(`hint-${type}`); }
          }
          await g(() => __game.cheat()); await wait(1500); continue;
        }
        if (await g(() => __game.bf.active)) {
          if (!seen.has('butterflies')) { seen.add('butterflies'); await wait(1500); await shot('task-butterflies'); }
          await g(() => __game.cheat()); await wait(1500); continue;
        }
        if (await g(() => __game.search.active)) {
          if (!seen.has('stars')) { seen.add('stars'); await wait(800); await shot('task-stars'); }
          await g(() => __game.cheat()); await wait(700); continue;
        }
        if (!(await g(() => __game.busy))) {
          await g(([x, z]) => __game.teleport(x + 1.4, z + 1.4), [q.x, q.z]);
          await wait(400);
          if (mode === 'mobile') await press('#btnAct'); else await page.keyboard.press('KeyE');
        }
        await wait(600);
      }
      console.log('quest done:', q.id, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    await page.waitForFunction(() => !__game.busy, null, { timeout: T(30000) });
    // replay one finished quest
    await g(() => __game.talk('fox')); await page.waitForSelector('#task:not(.hidden)', { timeout: T(20000) }); await g(() => __game.cheat()); await page.waitForFunction(() => !__game.busy, null, { timeout: T(30000) });
    // finale
    await g(() => __game.teleport(21.2, -6.4)); await wait(600); await shot('20-shrine');
    if (mode === 'mobile') await press('#btnAct'); else await page.keyboard.press('KeyE');
    await wait(2500); await shot('21-finale');
    await page.waitForSelector('#fanfare:not(.hidden)', { timeout: T(20000) }); await wait(800); await shot('22-final-card');
    await page.click('#fanfareOk'); await wait(4000); await shot('23-restored');
    // collection + parents
    await page.click('#btnBook'); await wait(500); await shot('30-book'); await checkLinks('collection book');
    await page.click('#btnParents'); await page.fill('#gateA', '15'); await wait(500); await shot('31-parents'); await checkLinks('parents section');
    await page.click('#parentsClose');
    const s = await g(() => __game.save);
    console.log('task types seen:', [...seen].join(' '));
    console.log('final:', s.final, 'quests:', JSON.stringify(s.quests), 'stars:', s.stars);
    console.log('skills:', Object.entries(s.skills).map(([k, v]) => `${k} L${v.level} ${v.first}/${v.tasks}`).join(' | '));
    console.log('fps:', await page.textContent('#fps'));
  } catch (e) {
    // a stuck quest or a timed-out wait: report it with the rest and keep a picture of where it happened
    errors.push('scenario failed: ' + e.message);
    await shot('99-failure').catch(() => {});
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`requests: ${nRequests}, origins: ${origins.size}` + (cancelled.length ? `, cancelled by the browser: ${cancelled.length}` : ''));
// the tolerated cancellations stay visible: which requests they were
for (const u of cancelled.slice(0, 5)) console.log(`  cancelled (not an error): ${u}`);
if (cancelled.length > 5) console.log(`  … and ${cancelled.length - 5} more`);
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
if (errors.length) process.exitCode = 1;
