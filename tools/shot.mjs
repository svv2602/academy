// Full play-through smoke test: node tools/shot.mjs <url> <outDir> [desktop|mobile|desktop-tall|mobile-portrait]
// Plays the whole first world through the real UI handlers (talk to every character, solve all 15 tasks,
// make one deliberate mistake per task type to exercise the hints, restore the crystal), saves screenshots
// and fails on anything suspicious. Every screenshot is also a layout check of the screen it shows.
// On the way it closes the butterflies task twice with its own button and comes back to it, compares the skills
// before and after the star search, and breaks a conversation and the finale once each on purpose to see that the
// heroine walks afterwards. The voice: a tap on the cat and on the speech bubble says the line once more (only while
// the voice is silent), a conversation started right after the fifth star of the search is heard to its end, the
// cat's "go on" after a shard comes with its subtitle, and the planner of spoken lines turns away nothing but the
// lines this scenario provokes.
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
//   E2E_LEVEL=<1|2|3>       fix the task difficulty (the parents' setting) for the whole run; default: adaptive, which
//                           stays on level 1 here because the scenario fails every task type once on purpose
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
const level = process.env.E2E_LEVEL || '';
if (!['', '1', '2', '3'].includes(level)) { console.error(`bad E2E_LEVEL="${level}": expected 1, 2 or 3`); process.exit(2); }
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
  // The voice is played by Audio elements that are not in the document: every one that was started is remembered
  // (the last few), so that the scenario can tell whether a spoken line is sounding.
  // Also counted: how many times each clip was started (__starts, by the name of the line) and the serial number of
  // every start (__plays; on the element: __n), so that the scenario can tell what was started since a moment.
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play, started = window.__started = [], starts = window.__starts = {};
    window.__plays = 0;
    window.__clip = (a) => (a.src.match(/voice\/(.+)\.mp3/) ?? [])[1] ?? '';
    HTMLMediaElement.prototype.play = function () {
      started.push(this); if (started.length > 8) started.shift();
      const id = window.__clip(this); starts[id] = (starts[id] ?? 0) + 1; this.__n = ++window.__plays;
      return play.call(this);
    };
  });
  const sounding = () => page.evaluate(() => window.__started.some((a) => !a.paused && !a.ended));
  const silence = () => page.waitForFunction(() => !window.__started.some((a) => !a.paused && !a.ended), null, { timeout: T(20000) });
  // The only errors the scenario expects: it breaks a scene on purpose (__game.failNext) - a conversation once and the
  // finale once - to see that the heroine is not left standing. Excused is the text of that very scene only, only
  // while the scenario waits for it, and only once.
  // The first line is the message; the lines after it are the stack of the error, different in every build.
  const sceneFault = (name) => `error: scene "${name}" failed: Error: broken on purpose by __game.failNext()`;
  const fault = { text: '', expected: 0, seen: 0 };
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = `${m.type()}: ${m.text()}`;
    if (fault.seen < fault.expected && text.split('\n')[0] === fault.text) { fault.seen++; return; }
    errors.push(text);
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('websocket', (ws) => { if (!own(ws.url().replace(/^ws/, 'http'))) errors.push(`external request: WebSocket ${ws.url()}`); });
  // Every picture of a screen is also a layout check of that screen (the failure picture is taken without it).
  const picture = (n) => page.screenshot({ path: `${out}/${mode}-${n}.png` });
  const shot = async (n) => { await picture(n); await checkLayout(n); };
  const wait = (ms) => page.waitForTimeout(T(ms));
  const g = (fn, ...a) => page.evaluate(fn, ...a);
  const visible = (sel) => g((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden'); }, sel);
  const press = (sel) => page.locator(sel).dispatchEvent(touch ? 'pointerdown' : 'click').catch(() => {});
  const act = () => (touch ? press('#btnAct') : page.keyboard.press('KeyE'));
  // A real tap or click: fails when the element is hidden, covered by another one or outside the window.
  const tapOn = (sel) => (touch ? page.tap(sel, { timeout: T(5000) }) : page.click(sel, { timeout: T(5000) }));
  const saved = () => g(() => JSON.stringify({ skills: __game.save.skills, quests: __game.save.quests, stars: __game.save.stars }));
  // The heroine walks: "forward" is held until she has moved half a step, however slow the frames are.
  const walks = async () => {
    const from = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
    await page.keyboard.down('KeyW');
    try {
      await page.waitForFunction(([x, z]) => Math.hypot(__game.hero.root.position.x - x, __game.hero.root.position.z - z) > 0.5, from, { timeout: T(5000) });
      return true;
    } catch { return false; } finally { await page.keyboard.up('KeyW'); }
  };
  // What a scene that has ended may not leave behind, whichever way it ended.
  const held = () => g(() => {
    const left = [];
    if (__game.busy) left.push('the heroine is still held (busy)');
    if (__game.cam.focus) left.push('the camera is still held');
    if (__game.finale !== 0) left.push('the shards are still merging');
    if (!document.querySelector('#bubble').classList.contains('hidden')) left.push('the speech bubble is still shown');
    return left;
  });
  // A scene that breaks gives the controls back (PLAY-03): the next scene is broken on purpose right after it has taken
  // them. Returns what the broken scene left behind; the error it must report is excused by its exact text, once.
  const breakScene = async (name, start) => {
    const seen = fault.seen;
    fault.text = sceneFault(name); fault.expected = seen + 1;
    await g(() => __game.failNext());
    await start();
    for (const t1 = Date.now(); fault.seen === seen && Date.now() - t1 < T(10000);) await page.waitForTimeout(100);
    const left = await held();
    if (fault.seen === seen) left.push('the scene did not report its error in the console');
    fault.expected = fault.seen;
    return left;
  };
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
    let catRepeated = false;      // a tap on the cat repeated a line
    await page.click('#play');
    if (level) await page.evaluate((d) => { __game.save.difficulty = d; }, Number(level));
    await page.waitForFunction(() => !document.querySelector('#bubble').classList.contains('hidden'), null, { timeout: T(20000) });
    await wait(9000); await shot('01-spawn');
    // ---- a tap on the cat says the line of the bubble once more, and the heroine does not walk to the cat (VOICE-08) ----
    {
      const fail = (what) => { throw new Error(`a tap on the cat: ${what}`); };
      await silence().catch(() => fail('the voice did not fall silent after the introduction'));
      const cat = await g(() => {
        const key = __game.line, p = __game.cat.root.position, hp = __game.hero.root.position;
        const s = new __game.THREE.Vector3(p.x, p.y + 0.3, p.z).project(__game.camera);
        const x = (s.x * 0.5 + 0.5) * innerWidth, y = (-s.y * 0.5 + 0.5) * innerHeight;
        const under = s.z < 1 ? document.elementFromPoint(x, y) : null;
        return { key, x, y, under: under ? under.id || under.localName : 'nothing', n: window.__starts[key] ?? 0, at: [hp.x, hp.z] };
      });
      if (!cat.key) fail('the game remembers no line after the introduction');
      if (cat.under !== 'c') fail(`the cat cannot be tapped at ${Math.round(cat.x)},${Math.round(cat.y)}: there is "${cat.under}"`);
      await (touch ? page.touchscreen.tap(cat.x, cat.y) : page.mouse.click(cat.x, cat.y));
      await page.waitForFunction(([k, n]) => (window.__starts[k] ?? 0) === n + 1, [cat.key, cat.n], { timeout: T(5000) })
        .catch(() => fail(`the clip "${cat.key}" was not started again`));
      await wait(300);
      const moved = await g(([x, z]) => Math.hypot(__game.hero.root.position.x - x, __game.hero.root.position.z - z), cat.at);
      if (moved > 0.2) fail(`the heroine walked ${moved.toFixed(2)} m instead of standing`);
      if (!(await visible('#bubble'))) fail(`"${cat.key}" is said again without its subtitle`);
      console.log(`a tap on the cat: "${cat.key}" is said again, the heroine stands`);
      catRepeated = true;
    }

    const seen = new Set();
    const mistakes = new Set();   // task types in which the deliberate mistake was made
    // An open task is known to the planner of spoken lines (VOICE-03): asked in one go, a task may close in between.
    // And once nothing holds the heroine, no task is open for it either.
    const unplanned = () => g(() => {
      const open = !document.querySelector('#task').classList.contains('hidden') || __game.bf.active;
      return open && !__game.inTask ? 'a task is open, but the planner of spoken lines does not know it'
        : !__game.busy && __game.inTask ? 'no task is open, but the planner of spoken lines still thinks one is' : '';
    });
    const noPlan = 'a task is open, but the planner of spoken lines does not know it';
    // ---- butterflies: the task can be closed with its own button and started again (PLAY-02) ----
    const ambient = await g(() => __game.flies.flies.length);   // butterflies in the world before any task
    let bfVisits = 0;             // how many times the open butterflies task was met
    let onward = false;           // the cat's "go on" after a shard was seen with its subtitle
    let hurried = false;          // the talk right after the fifth star was played
    let cutOff = 0;               // how many times closing the task had a spoken line to stop
    const wrongNumber = () => g(() => {
      const b = [...document.querySelectorAll('#answers button')].find((x) => Number(x.textContent) !== __game.bf.n);
      if (!b) return false; b.dispatchEvent(new PointerEvent('pointerdown')); return true;
    });
    // Presses the close button the way a child does and checks that nothing of the task is left, at once and after
    // the longest pause of the task (a step of the cat's count): the heroine is free, the task butterflies and the
    // numbers are gone, the voice is silent, nothing was recorded. Then walks away; the loop below comes back and talks
    // to the unicorn again.
    const closeButterflies = async (q, when) => {
      const fail = (what) => { throw new Error(`closing the butterflies task (${when}): ${what}`); };
      const record = () => g(() => JSON.stringify({ skills: __game.save.skills, quests: __game.save.quests, stars: __game.save.stars }));
      const before = await record();
      if (await sounding()) cutOff++;
      await (touch ? page.tap('#answersClose', { timeout: T(5000) }) : page.click('#answersClose', { timeout: T(5000) }))
        .catch((e) => fail(`the close button cannot be pressed: ${e.message.split('\n')[0]}`));
      for (const pause of [400, 1200]) {
        await wait(pause);
        const left = await held();
        left.push(...await g((n) => {
          const out = [], shownEl = (sel) => !document.querySelector(sel).classList.contains('hidden');
          if (shownEl('#answers')) out.push('the answers panel is still open');
          if (shownEl('#answersClose')) out.push('the close button is still shown');
          if (__game.bf.active) out.push('the task is still open');
          const { flies, mesh } = __game.flies;
          if (flies.length !== n || mesh.count !== n) out.push(`${flies.length} butterflies in the world (${mesh.count} drawn) instead of ${n}`);
          if (__game.bf.sprites.length) out.push(`${__game.bf.sprites.length} numbers of the count are left`);
          return out;
        }, ambient));
        const after = await record();
        if (after !== before) left.push(`the save changed: ${before} -> ${after}`);
        if (await sounding()) left.push('a spoken line is still sounding');
        if (left.length) fail(`${left.join('; ')} (${pause} ms later)`);
      }
      await g(([x, z]) => __game.teleport(x + 8, z + 8), [q.x, q.z]); await wait(300);
      if (!(await walks())) fail('the heroine does not walk');
      console.log(`butterflies closed ${when}: ${ambient} butterflies in the world, nothing recorded, the heroine walks`);
    };
    // ---- star search: it is not a counting task, no skill may change while it runs (LEARN-02) ----
    const progress = () => g(() => ({ skills: JSON.parse(JSON.stringify(__game.save.skills)), deer: __game.save.quests.deer ?? 0, stars: __game.save.stars }));
    let searchBefore = null, searchAfter = null;
    const quests = await g(() => __game.npcs.map((n) => ({ id: n.def.id, x: n.def.x, z: n.def.z })));
    // ---- the fifth star, and at once a talk to another character (VOICE-03); then the bubble repeats the question (VOICE-08) ----
    // The praise and "back to the deer" of the search must not cut that conversation off: its greeting and the question
    // of its task are heard to the end, and the bubble shows no line that is not spoken. A tap on the bubble starts the
    // question anew only once it is over. The task is then closed with its button: nothing is recorded.
    const talkAfterLastStar = async (q) => {
      const fail = (what) => { throw new Error(`a talk right after the fifth star: ${what}`); };
      const done = await g(() => ({ ...__game.save.quests }));
      // Someone whose quest is finished: a greeting, then one of his games - none of them is the "watch and repeat" one,
      // whose second question cuts the first one off by design.
      const other = quests.find((x) => x.id !== q.id && (done[x.id] ?? 0) >= 3);
      if (!other) fail('no character with a finished quest to talk to');
      const mark = await g((id) => new Promise((res) => {
        const t0 = performance.now(), captions = window.__captions = [];
        const watch = () => {            // every line the bubble shows from now on
          const key = document.querySelector('#bubble').classList.contains('hidden') ? null : __game.line;
          if (key && captions.at(-1) !== key) captions.push(key);
          if (window.__captions === captions) requestAnimationFrame(watch);
        };
        __game.cheat();                  // onto the last star
        const tick = () => {
          if (__game.search.active) { if (performance.now() - t0 > 10000) res(-1); else requestAnimationFrame(tick); return; }
          const plays = window.__plays;
          __game.talk(id); watch(); res(plays);
        };
        tick();
      }), other.id);
      if (mark < 0) fail('the search did not end on the fifth star');
      await page.waitForSelector('#task:not(.hidden)', { timeout: T(20000) }).catch(() => fail(`the task of "${other.id}" did not open`));
      const before = await saved();
      const probe = await g(() => {
        const key = __game.line, n = window.__starts[key] ?? 0;
        const live = window.__started.filter((a) => !a.paused && !a.ended).map(window.__clip);
        document.querySelector('#bubble').click();
        return { key, live, again: (window.__starts[key] ?? 0) - n, inTask: __game.inTask };
      });
      if (!probe.inTask) fail(noPlan);
      if (!probe.live.includes(probe.key)) fail(`the question "${probe.key}" is not sounding when its task opens (sounding: ${probe.live.join(' ') || 'nothing'})`);
      if (probe.again) fail(`a tap on the bubble started "${probe.key}" anew while it was still sounding`);
      await page.waitForFunction((k) => window.__started.findLast((a) => window.__clip(a) === k)?.paused, probe.key, { timeout: T(20000) })
        .catch(() => fail(`the question "${probe.key}" did not end`));
      const heard = await g((from) => {
        const captions = window.__captions; window.__captions = null;
        return { clips: window.__started.filter((a) => a.__n > from).map((a) => ({ id: window.__clip(a), ended: a.ended })), captions, dropped: [...__game.dropped] };
      }, mark);
      const names = heard.clips.map((c) => c.id);
      const cut = heard.clips.filter((c) => !c.ended).map((c) => c.id);
      if (cut.length) fail(`cut off before the end: ${cut.join(' ')} (started since the star: ${names.join(' ')})`);
      if (names.length < 2 || names.at(-1) !== probe.key) fail(`a greeting and the question "${probe.key}" had to sound, but these did: ${names.join(' ') || 'nothing'}`);
      const mute = heard.captions.filter((k) => !names.includes(k));
      if (mute.length) fail(`the bubble showed a line that was not spoken: ${mute.join(' ')}`);
      if (!heard.dropped.includes('t_stars_back')) fail('"t_stars_back" was not turned away: the conversation did not start before it');
      const n = await g((k) => window.__starts[k] ?? 0, probe.key);
      await tapOn('#bubble').catch((e) => fail(`the bubble cannot be tapped: ${e.message.split('\n')[0]}`));
      await page.waitForFunction(([k, was]) => (window.__starts[k] ?? 0) === was + 1, [probe.key, n], { timeout: T(5000) })
        .catch(() => fail(`a tap on the bubble did not start "${probe.key}" again once it was over`));
      await tapOn('#taskClose').catch((e) => fail(`the task cannot be closed: ${e.message.split('\n')[0]}`));
      await page.waitForFunction(() => !__game.busy, null, { timeout: T(10000) }).catch(() => fail('the closed task did not give the controls back'));
      const left = [];
      if (await sounding()) left.push('the question is still sounding after its task was closed');
      if (await g(() => __game.inTask)) left.push('the planner of spoken lines still thinks a task is open');
      if (await g(() => __game.line)) left.push('the game still remembers the line of the closed task: a tap on the cat would say it again');
      const after = await saved();
      if (after !== before) left.push(`the save changed: ${before} -> ${after}`);
      if (left.length) fail(left.join('; '));
      console.log(`a talk right after the fifth star (${other.id}): ${names.join(', ')} heard to the end, "t_stars_back" turned away; `
        + `a tap on the bubble repeated "${probe.key}" only once it was over; the closed task recorded nothing`);
      hurried = true;
    };
    for (const q of quests) {
      const t0 = Date.now();
      while ((await g((id) => __game.save.quests[id] ?? 0, q.id)) < 3 || await g(() => __game.busy)) {
        if (Date.now() - t0 > T(stuckMs)) throw new Error('quest stuck: ' + q.id);
        if (searchBefore && !searchAfter && !(await g(() => __game.search.active))) {
          // the search has just ended and no other task was opened since: whatever differs was written by the search
          searchAfter = await progress();
          for (const k of Object.keys(searchAfter.skills)) {
            const [a, b] = [searchBefore.skills[k], searchAfter.skills[k]].map((v) => JSON.stringify(v));
            if (a !== b) errors.push(`the star search changed the "${k}" skill: ${a} -> ${b}`);
          }
          if (searchAfter.deer < 1) errors.push('the star search did not move the quest of the deer on');
          if (searchAfter.stars < searchBefore.stars + 3) errors.push(`the star search gave ${searchAfter.stars - searchBefore.stars} stars, not 3`);
          console.log('star search: "count" skill before', JSON.stringify(searchBefore.skills.count), 'after', JSON.stringify(searchAfter.skills.count));
        }
        if (await visible('#fanfare')) {
          await shot(`shard-${q.id}`);
          // After the first shard: the cat's "go on" comes with its subtitle - after the scene (its end clears the bubble)
          // and after the character's thanks, which still sound when the button is pressed (a hint does not cut them off).
          if (!onward) {
            const fail = (what) => { throw new Error(`after the shard: ${what}`); };
            const during = await sounding();   // false only on a very slow machine: then the order is not put to the test
            const said = await g(() => window.__starts.go_next ?? 0);
            await page.click('#fanfareOk');
            await page.waitForFunction((n) => !__game.busy && __game.line === 'go_next' && (window.__starts.go_next ?? 0) > n
              && !document.querySelector('#bubble').classList.contains('hidden'), said, { timeout: T(15000) })
              .catch(() => fail('"go_next" was not said with its subtitle once the thanks were over'));
            console.log(`after the shard: "go_next" is said with its subtitle (the button was pressed ${during ? 'while the thanks sounded' : 'after the thanks'})`);
            onward = true;
          } else await page.click('#fanfareOk');
          await wait(500); continue;
        }
        { const wrong = await unplanned(); if (wrong) errors.push(wrong); }
        if (await visible('#task')) {
          const type = await g(() => document.querySelector('#taskStage').className.split(' t-')[1].split(' ')[0]);
          if (!seen.has(type)) {
            seen.add(type); await wait(type === 'simon' ? 5500 : 900); await shot(`task-${type}`);
            // One deliberate mistake per task type, to hear "try again", the spoken hint and to see the solution shown.
            // The right element is learnt from the game itself: the task's own "solve" is run with its taps swallowed
            // on the way down, so nothing is answered, and then any other element of the same kind is tapped.
            // Sorting solves in a loop that needs its taps to land, so there the wrong basket is told by its colour.
            // Memory pairs have no wrong move and no hint.
            if (type !== 'pairs') {
              const wrong = await g((kind) => {
                const tap = (e) => e.dispatchEvent(new PointerEvent('pointerdown'));
                if (kind === 'sort') {
                  const colour = [...document.querySelector('.gem.current').classList].find((c) => c !== 'gem' && c !== 'current');
                  const basket = [...document.querySelectorAll('#taskOpts .basket')].find((b) => !b.classList.contains(colour));
                  if (!basket) return 'no basket of another colour';
                  tap(basket); return '';
                }
                let right = null;
                const swallow = (e) => { right ??= e.target; e.stopImmediatePropagation(); };
                document.addEventListener('pointerdown', swallow, true);
                try { __game.cheat(); } finally { document.removeEventListener('pointerdown', swallow, true); }
                if (!right) return 'the game did not show which element is right';
                const same = [...document.querySelectorAll(`#task ${right.tagName}.${[...right.classList][0]}`)]
                  .filter((e) => e !== right && !e.contains(right) && !right.contains(e) && !e.classList.contains('yes') && !e.classList.contains('q'));
                if (!same.length) return `no other element like the right one (${right.className})`;
                tap(same[0]); return '';
              }, type);
              if (wrong) errors.push(`no deliberate mistake in the "${type}" task: ${wrong}`);
              // Long enough for "try again" and the whole spoken hint to end, so that the solution is on screen
              // in the picture and a broken "show the solution" step fails the run.
              else { mistakes.add(type); await wait(5500); await shot(`hint-${type}`); }
            }
          }
          await g(() => __game.cheat()); await wait(1500); continue;
        }
        if (await g(() => __game.bf.active)) {
          bfVisits++;
          if (bfVisits === 1) {
            // first meeting: close the task at once, while the unicorn is still asking; walk away, come back
            seen.add('butterflies');
            await closeButterflies(q, 'before an answer'); continue;
          }
          if (bfVisits === 2) {
            // second meeting: a wrong number, and the task is closed while the cat counts the butterflies aloud
            await wait(1500); await shot('task-butterflies');
            if (!(await wrongNumber())) throw new Error('closing the butterflies task: no wrong number to tap');
            await page.waitForFunction(() => __game.bf.demo && __game.bf.sprites.length >= 2, null, { timeout: T(30000) });
            await closeButterflies(q, 'while the cat counts'); continue;
          }
          if (bfVisits === 3) {
            await wait(1500);
            // a deliberate wrong number: the cat says the hint, then counts every butterfly aloud
            const wrong = await wrongNumber();
            if (!wrong) errors.push('no deliberate mistake in the "butterflies" task: no other number to tap');
            else {
              mistakes.add('butterflies'); await wait(5500); await shot('hint-butterflies');
              await page.waitForFunction(() => !__game.bf.demo, null, { timeout: T(30000) });
            }
          }
          // The right answer, and at once the close button (the panel stays on screen for a moment): the answer stands.
          const step = await g((id) => __game.save.quests[id] ?? 0, q.id);
          await g(() => __game.cheat());
          await page.locator('#answersClose').dispatchEvent('click');
          await wait(1500);
          if ((await g((id) => __game.save.quests[id] ?? 0, q.id)) !== step + 1) errors.push('the close button undid the right answer of the butterflies task');
          continue;
        }
        if (await g(() => __game.search.active)) {
          if (!seen.has('stars')) { seen.add('stars'); await wait(800); await shot('task-stars'); }
          searchBefore ??= await progress();
          if (!hurried && (await g(() => __game.search.found)) === 4) { await talkAfterLastStar(q); continue; }
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
    // A conversation is broken once on purpose, right after it has taken the controls: the heroine must walk again,
    // and the same conversation must start anew (the replay below).
    {
      const left = await breakScene('talk fox', () => g(() => __game.talk('fox')));
      if (await visible('#task')) left.push('a task was opened although the scene broke');
      if (left.length) throw new Error(`the broken conversation: ${left.join('; ')}`);
      if (!(await walks())) throw new Error('the broken conversation: the heroine does not walk');
      console.log('broken conversation: reported, the controls are back, the heroine walks');
    }
    // replay one finished quest
    await g(() => __game.talk('fox')); await page.waitForSelector('#task:not(.hidden)', { timeout: T(20000) }); await g(() => __game.cheat()); await page.waitForFunction(() => !__game.busy, null, { timeout: T(30000) });
    // finale
    await g(() => __game.teleport(21.2, -6.4)); await wait(600); await shot('20-shrine');
    // The finale is broken once on purpose, right after it has taken the controls and started to merge the shards.
    // The heroine must walk again; then the finale is played for real.
    {
      const left = await breakScene('finale', act);
      if (await g(() => __game.save.final)) left.push('the crystal is restored although the scene broke');
      if (left.length) throw new Error(`the broken finale: ${left.join('; ')}`);
      if (!(await walks())) throw new Error('the broken finale: the heroine does not walk');
      console.log('broken finale: reported, the controls are back, the heroine walks');
    }
    await g(() => __game.teleport(21.2, -6.4)); await wait(600);
    if (touch) await press('#btnAct'); else await page.keyboard.press('KeyE');
    await wait(2500); await shot('21-finale');
    await page.waitForSelector('#fanfare:not(.hidden)', { timeout: T(20000) }); await wait(800); await shot('22-final-card');
    const freeSaid = await g(() => window.__starts.free ?? 0);
    await page.click('#fanfareOk'); await wait(4000);
    // "Walk around" comes after the scene and after the final words, with its subtitle - like "go on" after a shard.
    await page.waitForFunction((n) => !__game.busy && __game.line === 'free' && (window.__starts.free ?? 0) > n
      && !document.querySelector('#bubble').classList.contains('hidden'), freeSaid, { timeout: T(10000) })
      .catch(() => { throw new Error('after the finale: "free" was not said with its subtitle'); });
    await shot('23-restored');
    // collection + parents
    await page.click('#btnBook'); await wait(500); await shot('30-book'); await checkLinks('collection book');
    await page.click('#btnParents'); await wait(500); await shot('31-gate');
    await page.fill('#gateA', '15'); await wait(500); await shot('31-parents'); await checkLinks('parents section');
    await page.click('#parentsClose');
    const s = await g(() => __game.save);
    console.log('task types seen:', [...seen].join(' '));
    console.log('deliberate mistakes:', [...mistakes].join(' '));
    // Every task type that has a hint must have been failed once, or the hints went unchecked in this run.
    const unchecked = [...seen].filter((t) => !mistakes.has(t) && t !== 'pairs' && t !== 'stars');
    if (unchecked.length) errors.push(`no deliberate mistake was made in: ${unchecked.join(', ')}`);
    if (bfVisits < 3) errors.push(`the butterflies task was met ${bfVisits} times: closing it and coming back went unchecked`);
    else if (!cutOff) errors.push('no line was sounding when the butterflies task was closed: stopping the voice went unchecked');
    if (!searchAfter) errors.push('the skills were not compared around the star search');
    if (!catRepeated) errors.push('repeating a line by a tap on the cat went unchecked');
    if (!hurried) errors.push('the talk right after the fifth star went unchecked');
    if (!onward) errors.push('the cat\'s "go on" after a shard went unchecked');
    console.log('final:', s.final, 'quests:', JSON.stringify(s.quests), 'stars:', s.stars);
    console.log('skills:', Object.entries(s.skills).map(([k, v]) => `${k} L${v.level} ${v.first}/${v.tasks}`).join(' | '));
    // Every line of the world is recorded: a line left to the device's synthesizer means a missing or broken clip.
    const voice = await g(() => ({ clips: __game.voice.clips, synth: [...new Set(__game.voice.synth)], dropped: [...__game.dropped] }));
    console.log(`voice: ${voice.clips} clips sounded, lines left to the synthesizer: ${voice.synth.length ? voice.synth.join(' ') : 'none'}`);
    // The planner of spoken lines turns away only what this scenario provokes: "back to the deer" in the talk right
    // after the fifth star, and the cat's "go on" after a shard when the next conversation has already begun.
    const turned = {};
    for (const id of voice.dropped) turned[id] = (turned[id] ?? 0) + 1;
    console.log(`lines turned away by the planner: ${Object.entries(turned).map(([id, n]) => `${id} x${n}`).join(' ') || 'none'}`);
    const lost = Object.keys(turned).filter((id) => id !== 'go_next' && id !== 't_stars_back');
    if (lost.length) errors.push(`the planner turned away lines the scenario gives no reason for: ${lost.join(' ')}`);
    if (voice.synth.length) errors.push(`no recorded clip for: ${voice.synth.join(' ')} (python3 tools/gen_voice.py)`);
    if (!voice.clips) errors.push('not a single voice clip sounded during the walkthrough');
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
