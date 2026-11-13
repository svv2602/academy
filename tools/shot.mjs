// Full play-through smoke test: node tools/shot.mjs <url> <outDir> [desktop|mobile|desktop-tall|mobile-portrait]
// Plays the whole first world through the real UI handlers (talk to every character, solve all 15 tasks,
// make one deliberate mistake per task type to exercise the hints, restore the crystal), saves screenshots
// and fails on anything suspicious. Every screenshot is also a layout check of the screen it shows.
//
// Screen sizes (the size is one thing, the way of control another — see SIZES below):
//   mobile 844x390 (touch), desktop 1280x720 (mouse and keyboard), desktop-tall 1280x800 (mouse and keyboard),
//   mobile-portrait 390x844 (touch). Screenshots are named <outDir>/<size>-<screen>.png.
//
// Exit code: 0 — the world was completed and nothing was reported;
//            1 — console error or warning, page exception, stuck quest or timed-out wait, failed request
//                (network error or HTTP >= 400), request to another origin, element linking to another origin,
//                layout problem on a screen ("layout: <size> <screen>: …"): the document or a panel scrolls,
//                a panel, button or input is outside the window or cut off by its panel, two buttons or inputs
//                overlap, the speech bubble covers a button, a button is smaller than 44x44 px;
//            2 — bad arguments or environment.
// Environment:
//   Q=<0|1|2>               fixed graphics tier (?q=…); default: the game picks and lowers it itself
//   E2E_GL=gl|swiftshader   gl (default): real GPU; swiftshader: software rendering, for machines without a GPU
//   E2E_SLOW=<n>            multiplier for the scenario timeouts and pauses (default 1)
//   E2E_STUCK_MS=<ms>       how long one quest may take before it is reported as stuck (default 240000)
//   E2E_OFFLINE=1           play without network: after the first load wait until the service worker is active and
//                           its whole precache list is in the cache, switch the network off, reload and play as
//                           usual. Needs the built game (the development server has no service worker)
//   E2E_MODELS_OUT=<file>   write the sorted JSON list of model files the page requested (see tools/models-used.json)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'fs';

const [url = 'http://localhost:5173/', out = 'shots', mode = 'desktop'] = process.argv.slice(2);
const GL_ARGS = {
  gl: ['--use-angle=gl', '--enable-gpu'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const gl = process.env.E2E_GL || 'gl';
const slow = Number(process.env.E2E_SLOW || 1);
const stuckMs = Number(process.env.E2E_STUCK_MS || 240000);
const usage = (msg) => { console.error(msg); process.exit(2); };
// The size of the window and the way of control are separate things: a new size only says which group it is in.
const SIZES = {
  mobile: { width: 844, height: 390, touch: true },
  desktop: { width: 1280, height: 720, touch: false },
  'desktop-tall': { width: 1280, height: 800, touch: false },
  'mobile-portrait': { width: 390, height: 844, touch: true },
};
const size = SIZES[mode];
if (!size) usage(`unknown size "${mode}": use one of ${Object.keys(SIZES).join(', ')}`);
const touch = size.touch;
const MIN_BUTTON = 44;      // px: the smallest width and height of anything that is pressed with a finger
if (!GL_ARGS[gl]) usage(`unknown E2E_GL="${gl}": use "gl" (real GPU, default) or "swiftshader" (software rendering)`);
if (!(slow > 0)) usage(`bad E2E_SLOW="${process.env.E2E_SLOW}": expected a positive number`);
if (!(stuckMs > 0)) usage(`bad E2E_STUCK_MS="${process.env.E2E_STUCK_MS}": expected a positive number of milliseconds`);
if (!['', '0', '1'].includes(process.env.E2E_OFFLINE ?? '')) usage(`bad E2E_OFFLINE="${process.env.E2E_OFFLINE}": expected 1 (play without network) or 0`);
const offline = process.env.E2E_OFFLINE === '1';
const modelsOut = process.env.E2E_MODELS_OUT || '';
let origin, host, basePath;
try { ({ origin, hostname: host, pathname: basePath } = new URL('.', url)); } catch { usage(`bad url "${url}"`); }
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
const models = new Set();   // model files requested by the page, as paths under the site root: models/…
let cachedFiles = null;     // offline run: how many files of the precache list were found in the cache
try {
  const viewport = { width: size.width, height: size.height };
  const ctx = await browser.newContext(touch ? { viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport });

  // ---- network: every request of the context (pages and the service worker) must stay on our own origin ----
  const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };
  // Requests to other origins are cut off right here, so the check never talks to the internet.
  await ctx.route((u) => !own(u.href), (route) => route.abort());
  ctx.on('request', (r) => {
    nRequests++;
    const u = r.url();
    if (!/^(data|blob):/.test(u)) { try { origins.add(new URL(u).origin); } catch { origins.add(u); } }
    if (!own(u)) errors.push(`external request: ${r.method()} ${u} (${r.resourceType()})`);
    // Model files the PAGE asked for. The service worker downloads its whole precache list when it installs, needed
    // or not, so its own requests say nothing about what the game uses and are left out.
    if (!r.serviceWorker() && u.startsWith(origin + basePath + 'models/')) models.add(decodeURIComponent(new URL(u).pathname.slice(basePath.length)));
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
  // Every picture of a screen is also a layout check of that screen (the failure picture is taken without it).
  const picture = (n) => page.screenshot({ path: `${out}/${mode}-${n}.png` });
  const shot = async (n) => { await picture(n); await checkLayout(n); };
  const wait = (ms) => page.waitForTimeout(T(ms));
  const g = (fn, ...a) => page.evaluate(fn, ...a);
  const visible = (sel) => g((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden'); }, sel);
  const press = (sel) => page.locator(sel).dispatchEvent(touch ? 'pointerdown' : 'click').catch(() => {});
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
  // ---- layout: the screen must fit the window, nothing may overlap, a button must be big enough for a finger ----
  // Measured in the page at every screenshot. An element is placed where it is drawn (the centre of its bounding
  // box) but with its layout size, so the tilt of the task items and the "bump" / "pulse" animations do not change
  // the result. Only what the player can reach counts as a button of the screen: elements behind a full-window layer
  // (the game controls behind a task, the book or the parents section) are left out. Reports once per screen.
  const checkLayout = async (screen) => {
    const found = await g((min) => {
      const vw = innerWidth, vh = innerHeight, out = [];
      const px = (n) => Math.round(n * 10) / 10;
      const label = (e) => {
        if (e.id) return '#' + e.id;
        let s = e.localName + [...e.classList].map((c) => '.' + c).join('');
        const same = e.parentElement ? [...e.parentElement.children].filter((x) => x.localName === e.localName) : [];
        if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
        const a = e.parentElement?.closest('[id]');
        return (a ? `#${a.id} ` : '') + s;
      };
      const shown = (e) => {
        if (!(e.offsetWidth > 0 && e.offsetHeight > 0) || getComputedStyle(e).visibility !== 'visible') return false;
        for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || Number(cs.opacity) === 0) return false; }
        return true;
      };
      const box = (e) => {
        const r = e.getBoundingClientRect(), w = e.offsetWidth, h = e.offsetHeight, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2, w, h };
      };
      const at = (b) => `${px(b.w)}x${px(b.h)} at ${px(b.l)},${px(b.t)}`;
      const outside = (b, c) => b.l < c.l - 1 || b.t < c.t - 1 || b.r > c.r + 1 || b.b > c.b + 1;
      const cross = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
      const win = { l: 0, t: 0, r: vw, b: vh };

      // 1. the document does not scroll
      for (const e of [document.documentElement, document.body]) {
        if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.push(`<${e.localName}> scrolls: content ${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight}`);
      }
      if (scrollX || scrollY) out.push(`the window is scrolled to ${px(scrollX)},${px(scrollY)}`);

      // 2. panels: inside the window, no scrolling inside
      const panels = [...document.querySelectorAll('#start .panel, #task .t-card, #book .card, #parents .card, #fanfare .card, #bubble, #hud, #answers')].filter(shown);
      for (const p of panels) {
        const b = box(p), cs = getComputedStyle(p);
        if (outside(b, win)) out.push(`${label(p)} is outside the ${vw}x${vh} window: ${at(b)}`);
        const scrolls = (v) => v === 'auto' || v === 'scroll';
        if ((scrolls(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) || (scrolls(cs.overflowX) && p.scrollWidth > p.clientWidth + 1)) {
          out.push(`${label(p)} scrolls: content ${p.scrollWidth}x${p.scrollHeight} in ${p.clientWidth}x${p.clientHeight}`);
        }
      }

      // 3. buttons and inputs of this screen. Full-window layers: #start, #task, #book, #parents, #fanfare.
      const top = (e) => { while (e.parentElement && e.parentElement !== document.body) e = e.parentElement; return e; };
      const order = (e) => [Number(getComputedStyle(e).zIndex) || 0, [...document.body.children].indexOf(e)];
      const above = (a, b) => { const [za, ia] = order(a), [zb, ib] = order(b); return za > zb || (za === zb && ia > ib); };
      const layers = [...document.body.children].filter((e) => e.localName !== 'canvas' && shown(e) && getComputedStyle(e).position === 'fixed'
        && !outside(win, box(e)));
      const reachable = (e) => !layers.some((l) => !l.contains(e) && above(l, top(e)));
      const isButton = (e) => e.matches('button, [role=button], input[type=button], input[type=submit], input[type=reset], input[type=checkbox], input[type=radio]');
      // No exceptions: every <button> counts, also the pictures of a task that are only counted, not pressed.
      const els = [...document.querySelectorAll('button, input, select, textarea, a[href], [role=button]')].filter((e) => shown(e) && reachable(e));
      const boxes = new Map(els.map((e) => [e, box(e)]));
      for (const e of els) {
        const b = boxes.get(e);
        if (outside(b, win)) out.push(`${label(e)} is outside the ${vw}x${vh} window: ${at(b)}`);
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
          const r = p.getBoundingClientRect();
          if (outside(b, { l: r.left, t: r.top, r: r.right, b: r.bottom })) out.push(`${label(e)} is cut off by ${label(p)}: ${at(b)}`);
          break;
        }
        if (isButton(e) && (b.w < min || b.h < min)) out.push(`${label(e)} is smaller than ${min}x${min}: ${px(b.w)}x${px(b.h)}`);
      }
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const [a, b] = [els[i], els[j]];
        if (a.contains(b) || b.contains(a)) continue;
        if (cross(boxes.get(a), boxes.get(b))) out.push(`${label(a)} overlaps ${label(b)}: ${at(boxes.get(a))} and ${at(boxes.get(b))}`);
      }
      // 4. the speech bubble lies over the game on purpose, but it may not cover a button of the screen
      const bubble = panels.find((p) => p.id === 'bubble');
      if (bubble) for (const e of els) {
        if (!bubble.contains(e) && !above(top(e), bubble) && cross(boxes.get(bubble) ?? box(bubble), boxes.get(e))) out.push(`#bubble covers ${label(e)}: ${at(box(bubble))} and ${at(boxes.get(e))}`);
      }
      return out;
    }, MIN_BUTTON);
    for (const f of found) errors.push(`layout: ${mode} ${screen}: ${f}`);
  };
  // ---- offline: the network may be switched off only when the service worker can serve the whole game ----
  // Ready means: the worker is activated and controls this page, nothing newer is installing or waiting, and every
  // address of its precache list (read from the worker script itself) is in the cache. Returns the number of files.
  const waitForOfflineCache = async () => {
    const probe = () => g(async () => {
      if (!('serviceWorker' in navigator)) return { why: 'this page has no service worker support (not a secure context?)' };
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { none: true, why: 'no service worker is registered on this address' };
      const settled = reg.active?.state === 'activated' && !reg.installing && !reg.waiting && !!navigator.serviceWorker.controller;
      if (!settled) return { why: `worker state: active=${reg.active?.state ?? 'none'}, installing=${!!reg.installing}, waiting=${!!reg.waiting}, controls the page=${!!navigator.serviceWorker.controller}` };
      const src = await (await fetch(reg.active.scriptURL, { cache: 'no-store' })).text();
      const list = [...new Set([...src.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => new URL(m[1], reg.scope).href))];
      if (!list.length) return { fatal: true, why: `cannot read the precache list from ${reg.active.scriptURL}` };
      const missing = [];
      for (const u of list) if (!(await caches.match(u, { ignoreSearch: true }))) missing.push(u);
      return missing.length ? { why: `${missing.length} of ${list.length} files are not in the cache yet, e.g. ${missing[0]}` } : { files: list.length };
    });
    const t0 = Date.now();
    for (;;) {
      const st = await probe();
      if (st.files) return st.files;
      // The registration is made on the window "load" event, long before the start button shows up: no registration
      // a few seconds later means there will be none (the development server), so do not wait the whole limit.
      const limit = st.none ? T(5000) : T(120000);
      if (st.fatal || Date.now() - t0 > limit) {
        throw new Error(`service worker did not become ready: ${st.why}`
          + (st.none ? ' — E2E_OFFLINE=1 needs the built game (npm run e2e); the development server has no service worker' : ''));
      }
      await page.waitForTimeout(250);
    }
  };

  try {
    await page.goto(url + (process.env.Q ? `?q=${process.env.Q}` : ''));
    await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
    if (offline) {
      cachedFiles = await waitForOfflineCache();
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
    }
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
          if (touch) await press('#btnAct'); else await page.keyboard.press('KeyE');
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
    if (touch) await press('#btnAct'); else await page.keyboard.press('KeyE');
    await wait(2500); await shot('21-finale');
    await page.waitForSelector('#fanfare:not(.hidden)', { timeout: T(20000) }); await wait(800); await shot('22-final-card');
    await page.click('#fanfareOk'); await wait(4000); await shot('23-restored');
    // collection + parents
    await page.click('#btnBook'); await wait(500); await shot('30-book'); await checkLinks('collection book');
    await page.click('#btnParents'); await wait(500); await shot('31-gate');
    await page.fill('#gateA', '15'); await wait(500); await shot('31-parents'); await checkLinks('parents section');
    await page.click('#parentsClose');
    const s = await g(() => __game.save);
    console.log('task types seen:', [...seen].join(' '));
    console.log('final:', s.final, 'quests:', JSON.stringify(s.quests), 'stars:', s.stars);
    console.log('skills:', Object.entries(s.skills).map(([k, v]) => `${k} L${v.level} ${v.first}/${v.tasks}`).join(' | '));
    console.log('fps:', await page.textContent('#fps'));
    // the start screen of a returning player: the saved game adds the "start again" button
    await page.reload(); await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); await wait(1500); await shot('40-start-again');
  } catch (e) {
    // a stuck quest or a timed-out wait: report it with the rest and keep a picture of where it happened
    errors.push('scenario failed: ' + e.message);
    await picture('99-failure').catch(() => {});
  }
} finally {
  await browser.close().catch(() => {});
}
if (modelsOut) writeFileSync(modelsOut, JSON.stringify([...models].sort(), null, 2) + '\n');
console.log(`offline: ${offline ? `yes, files in the cache: ${cachedFiles ?? 'unknown (the network was never switched off)'}` : 'no'}`);
console.log(`model files requested by the page: ${models.size}`);
console.log(`requests: ${nRequests}, origins: ${origins.size}` + (cancelled.length ? `, cancelled by the browser: ${cancelled.length}` : ''));
// the tolerated cancellations stay visible: which requests they were
for (const u of cancelled.slice(0, 5)) console.log(`  cancelled (not an error): ${u}`);
if (cancelled.length > 5) console.log(`  … and ${cancelled.length - 5} more`);
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
if (errors.length) process.exitCode = 1;
