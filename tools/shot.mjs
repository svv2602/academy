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
// Debug tools (ARCH-11, ARCH-14): the game is played with ?debug in the address (window.__game, the frame counter, the
// tuning panel exist only then); before the walkthrough the built game is opened once without it, in a browser context
// of its own (nothing it stores reaches the walkthrough), and must have none of the three. In the walkthrough the speed
// slider of the tuning panel must slow the heroine down (the path she walks in the same time), the open panel is a picture.
// The parents' section: the gate asks to multiply two numbers from 6 to 9, a wrong answer and a part of the right one
// open nothing, the right one opens it, the next opening asks another example; the section shows the day of the build
// and the commit number (compared with E2E_COMMIT).
// Without the voice (E2E_MUTE=1): the game is loaded with the voice volume 0 in its save, every clip must be started
// with zero volume, and on every picture of a task and of its hint the bubble shows the question of that task.
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
//   E2E_MUTE=1              play with the voice turned off (volume 0 in the save, as the parents' section writes it);
//                           default: with the voice
//   E2E_VOICE_OUT=<file>    write {"mute", "clips", "loud"}: was the voice off, how many clips were started and how
//                           many of them with a volume above zero
//   E2E_COMMIT=<text>       the commit number the parents' section must show (tools/e2e.mjs: git rev-parse --short HEAD,
//                           or "no-git"); default: only the form of the version line is checked
//   E2E_WORLD=<id>          play another world of the registry (src/worlds/index.ts) instead of the first one, with
//                           ?world=<id>: the save starts with progress of the first world in worlds.fairy, every chain
//                           of every character is played (a teleport, the action button, __game.cheat() for each task),
//                           with a picture and a layout check of each screen; the counter is "<done>/<characters>", the
//                           stars grow and are stored at once; after a reload the progress is in worlds.<id> and
//                           worlds.fairy is as it was. Then the checks every world shares (voice, planner, book, frame
//                           counter, "start again"). The scenarios of the first world (deer, butterflies, finale, book
//                           of shards, order of the friends) are not played. Default: the first world, its full scenario
import { chromium } from 'playwright-core';
import { createHash } from 'crypto';
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
const seed = process.env.E2E_SEED || '';   // ?seed= of the game (ARCH-08): the same tasks in the same order
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
if (!['', '0', '1'].includes(process.env.E2E_MUTE ?? '')) usage(`bad E2E_MUTE="${process.env.E2E_MUTE}": expected 1 (play without the voice) or 0`);
const mute = process.env.E2E_MUTE === '1';
const voiceOut = process.env.E2E_VOICE_OUT || '';
const commit = process.env.E2E_COMMIT || '';
const worldId = process.env.E2E_WORLD || '';
if (worldId && !/^[a-z][a-z0-9_-]*$/.test(worldId)) usage(`bad E2E_WORLD="${worldId}": expected the id of a world of src/worlds/index.ts`);
if (worldId === 'fairy') usage('E2E_WORLD=fairy: the first world is played by the full scenario - leave E2E_WORLD unset');
// E2E_WORLD: the progress of the first world the save starts with; the other world must leave it exactly as it is.
const FAIRY_KEPT = { quests: { unicorn: 3, fox: 1 }, final: false, starsTaken: [0, 2], flags: { chest: true }, pos: [3.5, 9] };
const STARS_KEPT = 7;
// The question(s) of every task type: what the bubble shows while the task waits for its answer.
const QUESTIONS = {
  count: ['t_count'], add: ['t_add'], sub: ['t_sub'], compare: ['t_compare_more', 't_compare_less'], pattern: ['t_pattern'], odd: ['t_odd'],
  pairs: ['t_pairs'], order: ['t_order'], sort: ['t_sort'], simon: ['t_simon_watch', 't_simon_repeat'], butterflies: ['t_count'], stars: ['t_stars'],
};
// The solution a task shows after a mistake, once "try again" and the hint have ended - what a child sees without the
// voice and without reading: numbers on the things counted, numbers over the groups, the repeating links of the row,
// the pulsing next number or basket, the sequence played again, the frame shared by the alike pictures of "what is odd",
// the right group of "more / less" growing or shrinking. Memory pairs have no hint: they open with every face shown.
const SHOWS = {
  count: '#taskStage .it i', add: '#taskStage .it i', sub: '#taskStage .it i', compare: '#taskStage .group.grow, #taskStage .group.shrink', pattern: '#taskStage.units',
  odd: '#taskStage .it.alike', order: '#taskStage .opt.pulse', sort: '#taskOpts .basket.pulse', simon: '#taskStage.watch',
};
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
let voiceUsed = null;       // { clips, loud }: voice clips started in the walkthrough, and those of them with a volume
const taskLog = [];        // the tasks met, in order (see __logTask below)
try {
  const viewport = { width: size.width, height: size.height };
  const ctxOptions = touch ? { viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport };
  const ctx = await browser.newContext(ctxOptions);

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
    window.__loud = [];         // clips started with a volume above zero: none of them in a walkthrough without the voice
    window.__clip = (a) => (a.src.match(/voice\/(.+)\.mp3/) ?? [])[1] ?? '';
    HTMLMediaElement.prototype.play = function () {
      started.push(this); if (started.length > 8) started.shift();
      const id = window.__clip(this); starts[id] = (starts[id] ?? 0) + 1; this.__n = ++window.__plays;
      if (this.volume > 0 && !this.muted) window.__loud.push(id);
      return play.call(this);
    };
  });
  // The tasks of the walkthrough, in the order they open (ARCH-08): the kind and what is on the panel, read in the frame
  // after the panel shows. With E2E_SEED the game draws its tasks from that seed, and two walkthroughs with one seed must
  // print the same fingerprint. The list lives in node: the reloads of the scenario do not lose it.
  await page.exposeFunction('__logTask', (t) => { taskLog.push(t); });
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const root = document.getElementById('task');
      if (!root) return;
      let open = false;
      new MutationObserver(() => {
        const now = !root.classList.contains('hidden');
        if (now && !open) requestAnimationFrame(() => {
          const stage = document.getElementById('taskStage'), opts = document.getElementById('taskOpts');
          window.__logTask(`${stage?.className ?? ''} | ${stage?.textContent ?? ''} | ${opts?.textContent ?? ''}`);
        });
        open = now;
      }).observe(root, { attributes: true, attributeFilter: ['class'] });
    });
  });
  // Without the voice: the game starts from a save that holds nothing but the voice volume 0 - what the slider of the
  // parents' section writes. Only when there is no save yet: the reloads of this scenario keep the game's own save.
  // E2E_WORLD (before it): a save of version 3 with the first world's progress (and the voice volume 0 without the
  // voice), written once in the tab - after "start again" the page must start from no save at all.
  if (worldId) {
    await page.addInitScript(([fairy, stars, quiet]) => {
      if (sessionStorage.getItem('e2e-world-save')) return;
      sessionStorage.setItem('e2e-world-save', '1');
      if (!localStorage.getItem('amw-save')) localStorage.setItem('amw-save', JSON.stringify({ v: 3, stars, ...(quiet ? { vol: { voice: 0 } } : {}), worlds: { fairy } }));
    }, [FAIRY_KEPT, STARS_KEPT, mute]);
  }
  if (mute) await page.addInitScript(() => { if (!localStorage.getItem('amw-save')) localStorage.setItem('amw-save', JSON.stringify({ v: 2, vol: { voice: 0 } })); });
  // Is the voice really what this walkthrough was asked for? Every clip started so far is looked at, not the setting.
  const checkVoice = async (when) => {
    const v = await g(() => ({ clips: window.__plays, loud: window.__loud.length, first: window.__loud[0], vol: __game.save.vol.voice }));
    if (mute && (v.loud || v.vol !== 0)) throw new Error(`the walkthrough without the voice is played with it (${when}): ${v.loud} of ${v.clips} clips were started with a volume, the first one "${v.first}"; the voice volume in the save is ${v.vol}`);
    if (!mute && v.loud !== v.clips) throw new Error(`the walkthrough with the voice (${when}): ${v.clips - v.loud} of ${v.clips} clips were started with zero volume`);
    if (!v.clips) throw new Error(`no voice clip was started (${when}): the volume of the voice went unchecked`);
    return v;
  };
  // The bubble on a picture of a task: is it shown, with what text, and which line does the game remember for a repeat.
  const bubbleNow = () => g(() => ({ shown: !document.querySelector('#bubble').classList.contains('hidden'), text: document.querySelector('#bubbleText').textContent.trim(), key: __game.line }));
  const asked = {};           // task type -> the bubble on its "task-…" picture
  // On the picture of a task the bubble shows the question of that task (VOICE-09).
  // The one exception: with the voice the question of the star search is shown for six seconds only (the heroine
  // walks, the bubble must not hang over the world), and a slow machine takes the picture later than that. The game
  // still remembers the question then - that is what is checked; without the voice no timer hides it (see below).
  const checkQuestion = async (type) => {
    const b = asked[type] = await bubbleNow();
    const timed = type === 'stars' && !mute;
    if (!timed && (!b.shown || !b.text)) errors.push(`question: ${mode} task-${type}: the bubble with the question is not shown`);
    else if (!QUESTIONS[type].includes(b.key)) errors.push(`question: ${mode} task-${type}: the bubble shows "${b.key}" (${b.text}), not the question of the task (${QUESTIONS[type].join(' / ')})`);
  };
  // On the picture of a hint: with the voice the bubble shows the hint the cat says; without the voice it still shows
  // the question, with the same text as before the mistake. "Watch and repeat" has two questions and replays its
  // show after the hint, the butterflies get their question back after the cat's count: there both are right with the voice.
  const checkHint = async (type) => {
    const b = await bubbleNow(), was = asked[type], name = `${mode} hint-${type}`;
    if (!b.shown || !b.text) { errors.push(`question: ${name}: the bubble is not shown`); return; }
    const question = QUESTIONS[type].includes(b.key);
    if (mute) {
      if (!question) errors.push(`question: ${name}: without the voice the bubble shows "${b.key}" (${b.text}), not the question of the task (${QUESTIONS[type].join(' / ')})`);
      else if (was && b.key === was.key && b.text !== was.text) errors.push(`question: ${name}: the text of the question changed: "${was.text}" -> "${b.text}"`);
    } else if (question ? type !== 'simon' && type !== 'butterflies' : !b.key?.startsWith('h_')) {
      errors.push(`question: ${name}: with the voice the bubble shows "${b.key}" (${b.text}), not the hint of the task`);
    }
  };
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
  // A panel measured while it still flies in is cut off by its own frame. On a starved CI runner the entrance
  // animations (style.css: the task panel's "rise", the bubble's "pop", the card's "pop2", the fanfare's "fade") take
  // seconds instead of a fraction of one, so a picture waits for them - and only for them: a hint's show of the answer
  // is a different animation, and it is pictured while it runs.
  const ENTRANCES = new Set(['rise', 'pop', 'pop2', 'fade']);
  const entered = () => page.waitForFunction((names) => document.getAnimations()
    .every((a) => !(names.includes(a.animationName) && a.playState === 'running')), [...ENTRANCES], { timeout: T(10000) }).catch(() => {});
  // The picture is taken again when a panel started to fly in between it and the measure; the third try measures anyway.
  const shot = async (n) => {
    for (let i = 0; i < 3; i++) { await entered(); await picture(n); if (await checkLayout(n, i === 2)) return; }
  };
  const wait = (ms) => page.waitForTimeout(T(ms));
  const g = (fn, ...a) => page.evaluate(fn, ...a);
  const visible = (sel) => g((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden'); }, sel);
  const press = (sel) => page.locator(sel).dispatchEvent(touch ? 'pointerdown' : 'click').catch(() => {});
  const act = () => (touch ? press('#btnAct') : page.keyboard.press('KeyE'));
  // A real tap or click: fails when the element is hidden, covered by another one or outside the window.
  // First the element and its parents end their entrance animations (the task panel rises for .35 s): on a starved
  // CI runner such an animation takes seconds, the element is not "stable" for Playwright all that time, and the tap
  // either times out or lands late. Endless animations (a pulse) are not waited for; a slow one ends the wait after
  // 20 s and the tap then reports why it failed.
  const settled = (sel) => page.waitForFunction((s) => {
    const e = document.querySelector(s);
    return !!e && document.getAnimations().every((a) => {
      const t = a.effect?.target;
      return !(t instanceof Element && t.contains(e) && a.playState === 'running' && Number.isFinite(a.effect.getComputedTiming().endTime));
    });
  }, sel, { timeout: T(20000) }).catch(() => {});
  const tapOn = async (sel) => {
    await settled(sel);
    return touch ? page.tap(sel, { timeout: T(5000) }) : page.click(sel, { timeout: T(5000) });
  };
  // Why a tap failed: the first line of the error and the last steps of Playwright's call log (what covered the element,
  // or that it never stood still) - the first line alone says only "Timeout exceeded".
  const why = (e) => {
    const lines = String(e?.message ?? e).split('\n').map((s) => s.trim()).filter(Boolean);
    const steps = lines.filter((s) => s.startsWith('- ')).slice(-3);
    return [lines[0], ...steps].join(' | ');
  };
  const saved = () => g(() => JSON.stringify({ skills: __game.save.skills, quests: __game.save.worlds.fairy.quests, stars: __game.save.stars }));
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
  // Returns false, measuring nothing, while a panel is still flying in (unless `force`): the measure and that test run
  // in one go, so a panel that shows up right after the picture (the finale's card, timed in game time) is not caught
  // in its first frame of "pop2" and reported as cut off by its own frame.
  const checkLayout = async (screen, force = false) => {
    const found = await g(([min, names, force]) => {
      if (!force && document.getAnimations().some((a) => names.includes(a.animationName) && a.playState === 'running')) return null;
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
    }, [MIN_BUTTON, [...ENTRANCES], force]);
    if (found === null) return false;
    for (const f of found) errors.push(`layout: ${mode} ${screen}: ${f}`);
    return true;
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

  // ---- E2E_WORLD=<id>: any world of the registry, played through its characters (ARCH-06) ----
  // What every world has: characters with chains of tasks, the counter "<done>/<characters>", the stars, its part of the
  // save under worlds.<id>, the book of its parts. The first world's own scenarios are not played here.
  const playWorld = async () => {
    const fail = (what) => { throw new Error(`world "${worldId}": ${what}`); };
    const stored = () => g(() => JSON.parse(localStorage.getItem('amw-save') || '{}'));
    const kept = JSON.stringify(FAIRY_KEPT);
    await wait(1500); await shot('00-start'); await checkLinks('start screen');
    await page.click('#play');
    if (level) await page.evaluate((d) => { __game.save.difficulty = d; }, Number(level));
    await page.waitForFunction(() => !document.querySelector('#bubble').classList.contains('hidden'), null, { timeout: T(20000) })
      .catch(() => fail('no line after "play"'));
    // "play" stores the save: the world played has its part in it - the proof that ?world= picked this world
    {
      const s0 = await stored();
      if (!s0.worlds?.[worldId]) fail(`the game does not play it: the save has no worlds.${worldId} after "play" (worlds: ${Object.keys(s0.worlds ?? {}).join(', ') || 'none'})`);
      if (JSON.stringify(s0.worlds.fairy) !== kept) fail(`worlds.fairy changed at the start: ${JSON.stringify(s0.worlds.fairy)}, was ${kept}`);
      if (s0.stars !== STARS_KEPT) fail(`the save starts with ${s0.stars} stars, not the ${STARS_KEPT} it was given`);
    }
    await wait(3000); await shot('01-spawn');
    // the stars never go down, and a star won is stored in the same frame (as in the first world)
    await g(() => {
      const w = window.__stars = { last: __game.save.stars, drops: [], unsaved: [], frames: 0 };
      const look = () => {
        const n = __game.save.stars;
        if (n < w.last) w.drops.push(`${w.last} -> ${n}`);
        if (n > w.last) { const st = JSON.parse(localStorage.getItem('amw-save') || '{}').stars; if (st !== n) w.unsaved.push(`${w.last} -> ${n}, stored ${st}`); }
        w.last = n; w.frames++; requestAnimationFrame(look);
      };
      look();
    });
    let starDrops = 0, starUnsaved = 0;
    const starsKept = async (where) => {
      const w = await g(() => ({ drops: window.__stars.drops, unsaved: window.__stars.unsaved, frames: window.__stars.frames }));
      for (const d of w.drops.slice(starDrops)) errors.push(`stars: ${mode}: the number of stars went down ${where}: ${d}`);
      for (const d of w.unsaved.slice(starUnsaved)) errors.push(`stars: ${mode}: stars won ${where} were not stored at once: ${d}`);
      starDrops = w.drops.length; starUnsaved = w.unsaved.length;
      return w.frames;
    };
    const npcs = await g(() => __game.npcs.map((n) => ({ id: n.def.id, x: n.def.x, z: n.def.z, steps: n.def.steps.length })));
    if (!npcs.length) fail('__game.npcs is empty');
    const step = (id) => g(([w, c]) => __game.save.worlds[w]?.quests?.[c] ?? 0, [worldId, id]);
    const seenTypes = new Set();
    let done = 0;
    for (const q of npcs) {
      const t0 = Date.now(), starsBefore = await g(() => __game.save.stars);
      while ((await step(q.id)) < q.steps || await g(() => __game.busy)) {
        if (Date.now() - t0 > T(stuckMs)) throw new Error(`quest stuck: ${q.id} (world "${worldId}")`);
        if (await visible('#fanfare')) {
          await shot(`shard-${q.id}`);
          await tapOn('#fanfareOk').catch((e) => fail(`the button of the part cannot be pressed: ${why(e)}`));
          await wait(500); continue;
        }
        if (await g(() => !document.querySelector('#task').classList.contains('hidden') && !__game.inTask)) errors.push(`world "${worldId}": a task is open, but the planner of spoken lines does not know it`);
        if (await visible('#task')) {
          const type = await g(() => document.querySelector('#taskStage').className.split(' t-')[1].split(' ')[0]);
          if (!seenTypes.has(type)) { seenTypes.add(type); await wait(type === 'simon' ? 5500 : 900); await shot(`task-${type}`); if (QUESTIONS[type]) await checkQuestion(type); }
          if (!(await g(() => __game.cheat()))) fail(`__game.cheat() did nothing for the "${type}" task of "${q.id}"`);
          await wait(1500); continue;
        }
        // a task of the world itself (in the foreground or the background): the world's cheat does its right move
        const how = await g(() => __game.cheat());
        if (how) { if (!seenTypes.has(how)) { seenTypes.add(how); await shot(`task-${how}`); } await wait(700); continue; }
        if (!(await g(() => __game.busy))) {
          await g(([x, z]) => __game.teleport(x + 1.4, z + 1.4), [q.x, q.z]);
          await wait(400);
          await act();
        }
        await wait(600);
      }
      done++;
      await starsKept(`in the chain of "${q.id}"`);
      const c = await g(() => ({ hud: document.querySelector('#crystals').textContent, stars: __game.save.stars }));
      if (c.hud !== `${done}/${npcs.length}`) errors.push(`crystals: ${mode} ${worldId}: the counter shows ${c.hud} with ${done} of ${npcs.length} chains done`);
      if (!(c.stars > starsBefore)) errors.push(`stars: ${mode} ${worldId}: the chain of "${q.id}" gave no stars (${starsBefore} -> ${c.stars})`);
      console.log(`chain done: ${q.id} (${q.steps} steps), ${((Date.now() - t0) / 1000).toFixed(0)}s, counter ${c.hud}, stars ${starsBefore} -> ${c.stars}`);
    }
    await page.waitForFunction(() => !__game.busy, null, { timeout: T(30000) }).catch(() => fail('the last scene did not end'));
    // the book: one part per character, lit for every chain done, the stars of the save
    await tapOn('#btnBook').catch((e) => fail(`the book cannot be opened: ${why(e)}`));
    await wait(500); await shot('30-book'); await checkLinks('collection book');
    {
      const b = await g(() => {
        const parts = [...document.querySelectorAll('#shards .shard')];
        return { parts: parts.length, got: parts.filter((e) => e.classList.contains('got')).length, stars: __game.save.stars, stats: document.querySelector('#colStats')?.textContent ?? '' };
      });
      const left = [];
      if (b.parts !== npcs.length) left.push(`${b.parts} parts for ${npcs.length} characters`);
      if (b.got !== done) left.push(`${b.got} parts lit, ${done} chains done`);
      if (!b.stats.includes(String(b.stars))) left.push(`the stars ${b.stars} are not in "${b.stats}"`);
      if (left.length) errors.push(`book: ${mode} ${worldId}: ${left.join('; ')}`);
      else console.log(`book: ${b.got} of ${b.parts} parts, ${b.stars} stars`);
    }
    await tapOn('#bookClose').catch((e) => fail(`the book cannot be closed: ${why(e)}`));
    // the checks every world shares: the voice, the planner of spoken lines, the frame counter
    {
      const frames = await starsKept(`by the end of the world "${worldId}"`);
      if (!frames) errors.push(`stars: ${mode}: the watch of the stars saw no frame`);
      const voice = await g(() => ({ clips: __game.voice.clips, synth: [...new Set(__game.voice.synth)], dropped: [...__game.dropped] }));
      console.log(`voice: ${voice.clips} clips sounded, lines left to the synthesizer: ${voice.synth.length ? voice.synth.join(' ') : 'none'}`);
      if (voice.synth.length) errors.push(`no recorded clip for: ${voice.synth.join(' ')} (python3 tools/gen_voice.py)`);
      voiceUsed = await checkVoice('at the end');
      const lost = [...new Set(voice.dropped)].filter((id) => id !== 'go_next');
      console.log(`lines turned away by the planner: ${voice.dropped.join(' ') || 'none'}`);
      if (lost.length) errors.push(`the planner turned away lines the scenario gives no reason for: ${lost.join(' ')}`);
      const counter = await page.textContent('#fps').catch(() => null);
      if (!/^\d+ fps · q[0-2] · \d+k tris · \d+ calls$/.test(counter ?? '')) errors.push(`with ?debug the frame counter does not show the frames: "${counter}"`);
      console.log('task types seen:', [...seenTypes].join(' '));
    }
    // a reload: the progress is the world's own, under worlds.<id>; the first world's is as it was
    const before = await g(() => __game.save.stars);
    await page.reload(); await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
    {
      const s1 = await stored(), w = s1.worlds?.[worldId], left = [];
      for (const q of npcs) if ((w?.quests?.[q.id] ?? 0) < q.steps) left.push(`the chain of "${q.id}" is at ${w?.quests?.[q.id] ?? 0} of ${q.steps} in worlds.${worldId}`);
      if (JSON.stringify(s1.worlds?.fairy) !== kept) left.push(`worlds.fairy changed: ${JSON.stringify(s1.worlds?.fairy)}, was ${kept}`);
      for (const k of ['quests', 'final', 'starsTaken', 'chestOpen', 'flags', 'pos']) if (k in s1) left.push(`"${k}" is on top of the save, not under worlds.<id>`);
      if (s1.stars !== before) left.push(`${s1.stars} stars stored, ${before} in the game`);
      if (left.length) errors.push(`reload: ${mode} ${worldId}: ${left.join('; ')}`);
      else console.log(`reload: worlds.${worldId} ${JSON.stringify(w.quests)}, worlds.fairy as it was, ${s1.stars} stars`);
    }
    await wait(1500); await shot('40-start-again');
    // "start again": the save of a new player, every world of it cleared
    {
      const had = await stored();
      await Promise.all([page.waitForEvent('load', { timeout: T(90000) }), tapOn('#restart')]).catch((e) => fail(`start again: the button did not reload the game: ${why(e)}`));
      await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
      const now = await stored(), left = [];
      if (now.stars) left.push(`${now.stars} stars`);
      if (now.played) left.push('"played"');
      for (const [id, w = {}] of Object.entries(now.worlds ?? {})) {
        if (w.final) left.push(`the final (${id})`);
        if (Object.keys(w.quests ?? {}).length) left.push(`quests ${JSON.stringify(w.quests)} (${id})`);
        if (w.starsTaken?.length) left.push(`stars taken ${JSON.stringify(w.starsTaken)} (${id})`);
        if (Object.values(w.flags ?? {}).some(Boolean)) left.push(`flags ${JSON.stringify(w.flags)} (${id})`);
      }
      if (await visible('#restart')) left.push('the "start again" button of a returning player');
      if (left.length) fail(`start again: after the reload the old progress is back: ${left.join(', ')}`);
      console.log(`start again: ${had.stars} stars and worlds ${Object.keys(had.worlds ?? {}).join(', ')} cleared, the start screen of a new player`);
    }
    console.log(`world "${worldId}": ${npcs.length} characters, ${done} chains done`);
  };

  try {
    // ---- without ?debug (ARCH-11): the published game has no window.__game, no frame counter and no tuning panel ----
    // A context of its own: its save and its service worker never reach the walkthrough. Its page must not report errors either.
    {
      const plain = await browser.newContext(ctxOptions);
      try {
        await plain.route((u) => !own(u.href), (route) => route.abort());
        const p = await plain.newPage();
        p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`without ?debug: ${m.type()}: ${m.text()}`); });
        p.on('pageerror', (e) => errors.push('without ?debug: pageerror: ' + e.message));
        // Slow frames (about 18 a second), so that the game lowers its quality by itself; on a phone screen
        // (2 device pixels per pixel) that shows as a smaller canvas: q2 draws 2 pixels per pixel, q1 1.5.
        if (!process.env.Q) await p.addInitScript(() => { const raf = requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => setTimeout(() => raf(cb), 40); });
        await p.goto(url + (process.env.Q ? `?q=${process.env.Q}` : ''));
        await p.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
        await p.waitForTimeout(T(1500));
        if (!process.env.Q && touch) {
          const w0 = await p.evaluate(() => document.querySelector('#c').width);
          const lowered = await p.waitForFunction((w) => document.querySelector('#c').width < w, w0, { timeout: T(30000) })
            .then(async () => { const w1 = await p.evaluate(() => document.querySelector('#c').width); console.log(`without ?debug: slow frames lowered the quality by itself (canvas ${w0} -> ${w1} px wide)`); return true; })
            .catch(() => { errors.push(`without ?debug: slow frames did not lower the quality (the canvas stayed ${w0} px wide)`); return false; });
          // TECH-04: the lowered tier is remembered, so the next launch starts with it, not with the top one again.
          // Read as soon as the start button shows: the game's own fallback needs seconds of frames before it acts.
          if (lowered) {
            await p.reload();
            await p.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
            const w2 = await p.evaluate(() => document.querySelector('#c').width);
            if (w2 < w0) console.log(`without ?debug: after a reload the game starts with the lowered quality (canvas ${w2} px wide, ${w0} before the fallback)`);
            else errors.push(`without ?debug: after the fallback and a reload the game started with the top quality again (the canvas is ${w2} px wide, as before the fallback)`);
          }
        }
        const found = await p.evaluate(() => [
          '__game' in window ? 'window.__game is defined' : '',
          document.querySelector('#fps') ? 'the frame counter (#fps) is in the document' : '',
          document.querySelector('#tune, #tuneBtn') ? 'the tuning panel is in the document' : '',
        ].filter(Boolean));
        for (const f of found) errors.push(`debug tools without ?debug: ${f}`);
        console.log(`without ?debug: ${found.length ? found.join('; ') : 'no window.__game, no frame counter, no tuning panel'}`);
      } finally { await plain.close().catch(() => {}); }
    }
    // Everything below plays with ?debug: the reloads keep the address.
    await page.goto(url + '?debug' + (process.env.Q ? `&q=${process.env.Q}` : '') + (seed ? `&seed=${encodeURIComponent(seed)}` : '')
      + (worldId ? `&world=${encodeURIComponent(worldId)}` : ''));
    await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
    if (offline) {
      cachedFiles = await waitForOfflineCache();
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
    }
    if (worldId) await playWorld();
    else {
      await wait(1500); await shot('00-start'); await checkLinks('start screen');
      let catRepeated = false;      // a tap on the cat repeated a line
      await page.click('#play');
      if (level) await page.evaluate((d) => { __game.save.difficulty = d; }, Number(level));
      await page.waitForFunction(() => !document.querySelector('#bubble').classList.contains('hidden'), null, { timeout: T(20000) });
      // ---- a hidden page (another app, a locked screen) pauses the line that sounds; shown again, it plays on (TECH-05) ----
      // The page is "hidden" by its visibility state alone: what the game hears from a phone that leaves it.
      {
        const fail = (what) => { throw new Error(`a hidden page: ${what}`); };
        const visibility = (hidden) => g((h) => {
          if (h) {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          } else { delete document.hidden; delete document.visibilityState; }       // back to the real ones
          document.dispatchEvent(new Event('visibilitychange'));
        }, hidden);
        await page.waitForFunction(() => window.__started.some((a) => !a.paused && !a.ended && a.currentTime > 0.2), null, { timeout: T(10000) })
          .catch(() => fail('no line was sounding after "play"'));
        const id = await g(() => { const a = window.__started.findLast((x) => !x.paused && !x.ended); a.__probe = true; return window.__clip(a); });
        await visibility(true);
        await wait(1200);
        const away = await g(() => { const a = window.__started.find((x) => x.__probe); return { paused: a.paused, ended: a.ended, at: a.currentTime }; });
        await visibility(false);
        if (!away.paused || away.ended) fail(`the line "${id}" did not pause (${away.ended ? 'it ended' : 'it went on sounding'})`);
        await page.waitForFunction((t) => { const a = window.__started.find((x) => x.__probe); return !a.paused && a.currentTime > t + 0.1 || a.ended; }, away.at, { timeout: T(5000) })
          .catch(() => fail(`the line "${id}" did not play on when the page was shown again`));
        console.log(`a hidden page: "${id}" paused at ${away.at.toFixed(2)} s and played on when shown`);
      }
      await wait(9000); await shot('01-spawn');
      await checkVoice('after the introduction');
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

      // ---- the heroine (TECH-14): one child model on the game skeleton. In every clip of hers the lowest foot bone
      // stays within 3 cm of the ground (the pelvis of the clips is scaled to her legs); the look re-paints the dress
      // but no skin texel of her texture; pictures of her standing, walking and in a jump ----
      {
        const fail = (what) => { throw new Error(`the heroine: ${what}`); };
        const FEET = 0.03;
        const body = await g(async (feet) => {
          const THREE = __game.THREE, { model, root } = __game.hero, meshes = [], bones = {};
          model.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); if (o.isBone) bones[o.name] = o; });
          const out = { meshes: meshes.length, bones: Object.keys(bones).length, feet: [], skin: 0, skinPainted: 0, dressPainted: 0 };
          if (meshes.length !== 1) return out;
          // Every clip of hers, sampled 13 times on a mixer of its own; the game's mixer poses her again in the next frame.
          const mixer = new THREE.AnimationMixer(model), v = new THREE.Vector3();
          for (const [name, action] of __game.hero.actions) {
            const clip = action.getClip(), a = mixer.clipAction(clip);
            a.play();
            let low = Infinity;
            for (let k = 0; k <= 12; k++) {
              mixer.setTime(clip.duration * k / 12); root.updateMatrixWorld(true);
              for (const b of ['foot_l', 'foot_r', 'ball_l', 'ball_r']) low = Math.min(low, bones[b].getWorldPosition(v).y - root.position.y);
            }
            a.stop(); mixer.uncacheAction(clip);
            if (Math.abs(low) > feet) out.feet.push(`${name} ${low.toFixed(3)} m`);
          }
          mixer.uncacheRoot(model);
          // The painted texture against the file it was painted from: skin texels (orange hues, mid to light) unchanged.
          const map = meshes[0].material.map, img = await createImageBitmap(await (await fetch(new URL('models/hero/tex/T_Child_BaseColor.webp', document.baseURI))).blob());
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
          const was = ctx.getImageData(0, 0, c.width, c.height).data;
          if (!map?.image?.getContext || map.image.width !== c.width) { out.noCanvas = true; return out; }
          const now = map.image.getContext('2d').getImageData(0, 0, c.width, c.height).data, col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
          for (let i = 0; i < was.length; i += 4) {
            col.setRGB(was[i] / 255, was[i + 1] / 255, was[i + 2] / 255, THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace);
            const changed = Math.abs(was[i] - now[i]) + Math.abs(was[i + 1] - now[i + 1]) + Math.abs(was[i + 2] - now[i + 2]) > 6;
            if (hsl.h > 0.02 && hsl.h < 0.12 && hsl.s > 0.25 && hsl.l > 0.45 && hsl.l < 0.85) { out.skin++; if (changed) out.skinPainted++; }
            if (hsl.h > 0.2 && hsl.h < 0.4 && hsl.s > 0.3 && hsl.l > 0.4 && changed) out.dressPainted++;
          }
          return out;
        }, FEET);
        if (body.meshes !== 1) fail(`${body.meshes} skinned meshes instead of the one child model`);
        if (body.bones !== 65) fail(`${body.bones} bones instead of the 65 of the game skeleton`);
        if (body.feet.length) fail(`the feet leave the ground by more than ${FEET * 100} cm: ${body.feet.join(', ')}`);
        if (body.noCanvas) fail('her texture is not the painted canvas of T_Child_BaseColor');
        if (!body.skin || body.skinPainted) fail(`the look re-painted ${body.skinPainted} of ${body.skin} skin texels`);
        if (!body.dressPainted) fail('the look did not re-paint the dress');
        // Pictures on open ground at the spawn, the camera close; waits in game time (__game.time).
        const gameWait = async (s) => {
          const t0 = await g(() => __game.time);
          await page.waitForFunction(([t, d]) => __game.time - t >= d, [t0, s], { timeout: T(s * 30000 + 5000) })
            .catch(() => fail(`${s} s of game time did not pass`));
        };
        const back = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; __game.closeup(3.2); });
        await gameWait(1.2); await shot('hero-idle');
        await page.keyboard.down('KeyW');
        try {
          await page.waitForFunction(() => ['Walk', 'Run'].includes(__game.hero.current), null, { timeout: T(5000) }).catch(() => fail('she does not walk'));
          await gameWait(0.6); await shot('hero-walk');
        } finally { await page.keyboard.up('KeyW'); }
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; });
        await gameWait(0.8);
        const floor = await g(() => __game.hero.root.position.y);
        await page.keyboard.press('Space');
        await page.waitForFunction((y) => __game.hero.current === 'Jump' && __game.hero.root.position.y - y > 0.3, floor, { timeout: T(5000), polling: 'raf' })
          .catch(() => fail('she does not jump'));
        await shot('hero-jump');
        await g(() => __game.closeup(null));
        await g(([x, z]) => __game.teleport(x, z), back); await gameWait(1);
        console.log(`the heroine: one model, feet on the ground in ${(await g(() => __game.hero.actions.size))} clips, ${body.skin} skin texels kept, ${body.dressPainted} dress texels painted`);
      }

      // ---- stars never go down (LEARN-14): watched on every frame from here to the end of the world, read on every step ----
      // A star that is won is also stored at once, in the same frame: the save on a timer would lose it if the page died.
      await g(() => {
        const w = window.__stars = { last: __game.save.stars, drops: [], unsaved: [], frames: 0 };
        const look = () => {
          const n = __game.save.stars;
          if (n < w.last) w.drops.push(`${w.last} -> ${n}`);
          if (n > w.last) { const kept = JSON.parse(localStorage.getItem('amw-save') || '{}').stars; if (kept !== n) w.unsaved.push(`${w.last} -> ${n}, stored ${kept}`); }
          w.last = n; w.frames++; requestAnimationFrame(look);
        };
        look();
      });
      let starDrops = 0, starUnsaved = 0;
      const starsKept = async (where) => {
        const w = await g(() => ({ drops: window.__stars.drops, unsaved: window.__stars.unsaved, frames: window.__stars.frames }));
        for (const d of w.drops.slice(starDrops)) errors.push(`stars: ${mode}: the number of stars went down ${where}: ${d}`);
        for (const d of w.unsaved.slice(starUnsaved)) errors.push(`stars: ${mode}: stars won ${where} were not stored at once: ${d}`);
        starDrops = w.drops.length; starUnsaved = w.unsaved.length;
        return w.frames;
      };
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
      let onwardLate = false;       // ...and once more with the button pressed after the thanks
      let hurried = false;          // the talk right after the fifth star was played
      let starsCounted = false;     // the bubble was looked at after a star of the search was found
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
        const record = () => g(() => JSON.stringify({ skills: __game.save.skills, quests: __game.save.worlds.fairy.quests, stars: __game.save.stars }));
        const before = await record();
        if (await sounding()) cutOff++;
        await (touch ? page.tap('#answersClose', { timeout: T(5000) }) : page.click('#answersClose', { timeout: T(5000) }))
          .catch((e) => fail(`the close button cannot be pressed: ${why(e)}`));
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
      const progress = () => g(() => ({ skills: JSON.parse(JSON.stringify(__game.save.skills)), deer: __game.save.worlds.fairy.quests.deer ?? 0, stars: __game.save.stars }));
      let searchBefore = null, searchAfter = null;
      const quests = await g(() => __game.npcs.map((n) => ({ id: n.def.id, x: n.def.x, z: n.def.z })));
      // The order of the friends is the order the guide leads to them and the order of the shards in the book.
      const FAIRY_ORDER = ['unicorn', 'fox', 'mushking', 'deer', 'queen'];
      if (quests.map((q) => q.id).join() !== FAIRY_ORDER.join()) errors.push(`friends: ${mode}: the order is ${quests.map((q) => q.id).join(', ')}, not ${FAIRY_ORDER.join(', ')}`);
      // ---- the fifth star, and at once a talk to another character (VOICE-03); then the bubble repeats the question (VOICE-08) ----
      // The praise and "back to the deer" of the search must not cut that conversation off: its greeting and the question
      // of its task are heard to the end, and the bubble shows no line that is not spoken. A tap on the bubble starts the
      // question anew only once it is over. The task is then closed with its button: nothing is recorded.
      const talkAfterLastStar = async (q) => {
        const fail = (what) => { throw new Error(`a talk right after the fifth star: ${what}`); };
        const done = await g(() => ({ ...__game.save.worlds.fairy.quests }));
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
        await tapOn('#bubble').catch((e) => fail(`the bubble cannot be tapped: ${why(e)}`));
        await page.waitForFunction(([k, was]) => (window.__starts[k] ?? 0) === was + 1, [probe.key, n], { timeout: T(5000) })
          .catch(() => fail(`a tap on the bubble did not start "${probe.key}" again once it was over`));
        await tapOn('#taskClose').catch((e) => fail(`the task cannot be closed: ${why(e)}`));
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
      // ---- the fifth star in silence: its number "five" is heard to the end, and only then the praise ----
      // The one search of the world is taken by the talk above, where the number is cut off by design; so once it is over
      // the deer's quest is put back to its start (in memory) and searched a second time.
      let fifthHeard = false;
      const fifthStar = async () => {
        const fail = (what) => { throw new Error(`fifth star: ${what}`); };
        const from = await g(() => { const n = window.__plays; __game.cheat(); return n; });
        const since = () => g((f) => window.__started.filter((a) => a.__n > f).map((a) => ({ id: window.__clip(a), ended: a.ended })), from);
        await page.waitForFunction((f) => window.__started.some((a) => a.__n > f && window.__clip(a).startsWith('praise_')), from, { timeout: T(15000) })
          .catch(async () => fail(`no praise was started after it (started since: ${(await since()).map((c) => c.id).join(' ') || 'nothing'})`));
        const clips = await since(), names = clips.map((c) => c.id).join(' ');
        const five = clips.findIndex((c) => c.id === 'tap_5'), praised = clips.findIndex((c) => c.id.startsWith('praise_'));
        if (five < 0) fail(`"tap_5" was not started (started since the star: ${names})`);
        if (five > praised) fail(`the praise started before "tap_5" (${names})`);
        if (!clips[five].ended) fail(`"tap_5" was cut off before its end (started since the star: ${names})`);
        console.log(`the fifth star in silence: ${names} - "tap_5" heard to the end, then the praise`);
        fifthHeard = true;
      };
      // ---- a task of another character during the search, closed with its cross: the bubble is the search's again ----
      // Its line, its count of the stars found, and (without the voice) its question: a tap on the bubble or the cat
      // repeats the search, not the closed task.
      let searchResumed = false;
      const closedInSearch = async (q) => {
        const fail = (what) => { throw new Error(`star search after a closed task: ${what}`); };
        const done = await g(() => ({ ...__game.save.worlds.fairy.quests }));
        const other = quests.find((x) => x.id !== q.id && (done[x.id] ?? 0) >= 3);
        if (!other) fail('no character with a finished quest to talk to');
        const found = await g((id) => { __game.talk(id); return __game.search.found; }, other.id);
        await page.waitForSelector('#task:not(.hidden)', { timeout: T(20000) }).catch(() => fail(`the task of "${other.id}" did not open`));
        await tapOn('#taskClose').catch((e) => fail(`the task cannot be closed: ${why(e)}`));
        await page.waitForFunction(() => !__game.busy, null, { timeout: T(10000) }).catch(() => fail('the closed task did not give the controls back'));
        const b = await bubbleNow(), left = [];
        if (!b.shown) left.push('the bubble is hidden');
        if (b.key !== 't_stars') left.push(`the game remembers "${b.key}", not the line of the search: a tap on the cat would say it`);
        if (!b.text.includes(`⭐ ${found} / 5`)) left.push(`the bubble shows "${b.text}", not the count ⭐ ${found} / 5`);
        if (mute && !b.text.startsWith(asked.stars?.text ?? '\0')) left.push(`without the voice the question of the search is not in the bubble: "${b.text}"`);
        if (left.length) fail(`${left.join('; ')} (${other.id})`);
        console.log(`a closed task of "${other.id}" during the search: the bubble shows "${b.text}" (${b.key})`);
        searchResumed = true;
      };
      // ---- a talk to the deer during the search: its question again, and the bubble of the search with the count ----
      // While the question sounds and after the scene: the line of the search, its count of the stars found, and (without
      // the voice) its question - not the question alone, which would hide the count until the next star.
      let deerAsked = false;
      const deerInSearch = async () => {
        const fail = (what) => { throw new Error(`talk to the deer during the search: ${what}`); };
        await silence().catch(() => fail('the voice did not fall silent before the talk'));
        const was = await g(() => ({ n: window.__starts.t_stars ?? 0, found: __game.search.found }));
        await g(() => __game.talk('deer'));
        const count = `⭐ ${was.found} / 5`;
        const check = (b, when) => {
          const left = [];
          if (!b.shown) left.push('the bubble is hidden');
          if (b.key !== 't_stars') left.push(`the game remembers "${b.key}", not the line of the search`);
          if (!b.text.includes(count)) left.push(`the bubble shows "${b.text}", not the count ${count}`);
          if (mute && !b.text.startsWith(asked.stars?.text ?? '\0')) left.push(`without the voice the question of the search is not in the bubble: "${b.text}"`);
          if (left.length) fail(`${when}: ${left.join('; ')}`);
        };
        await page.waitForFunction((n) => __game.busy && (window.__starts.t_stars ?? 0) > n, was.n, { timeout: T(10000) })
          .catch(() => fail('the question of the search was not said'));
        check(await bubbleNow(), 'while the question sounds');
        await page.waitForFunction(() => !__game.busy, null, { timeout: T(20000) }).catch(() => fail('the scene did not end'));
        const b = await bubbleNow();
        check(b, 'after the scene');
        console.log(`a talk to the deer during the search: the question was said, the bubble shows "${b.text}" (${b.key})`);
        deerAsked = true;
      };
      // ---- the last task of another chain solved during the search: its shard, and no "go on" (go_next) after it ----
      // The walkthrough closes the chains in order, so one finished chain is put back (in memory) to its last step right
      // before the talk; solving it gives the same shard back. The sparkles lead to the stars, so the bubble stays the
      // search's: the line of the search with the count, and "go_next" is neither started nor turned away.
      let shardSearched = false;
      const shardInSearch = async (q) => {
        const fail = (what) => { throw new Error(`a shard during the search: ${what}`); };
        const done = await g(() => ({ ...__game.save.worlds.fairy.quests }));
        const other = quests.find((x) => x.id !== q.id && (done[x.id] ?? 0) >= 3);
        if (!other) fail('no character with a finished quest to talk to');
        await silence().catch(() => fail('the voice did not fall silent before the talk'));
        const was = await g((id) => {
          __game.save.worlds.fairy.quests[id] = 2; __game.talk(id);     // one go: no frame sees the counter of crystals out of step
          return { said: window.__starts.go_next ?? 0, dropped: __game.dropped.filter((k) => k === 'go_next').length, found: __game.search.found };
        }, other.id);
        await page.waitForSelector('#task:not(.hidden)', { timeout: T(20000) }).catch(() => fail(`the last task of "${other.id}" did not open`));
        // __game.cheat() walks onto a star while the search is on: the panel task is solved with the search put aside for
        // that one synchronous call (no frame runs in between)
        const how = await g(() => { const s = __game.search; s.active = false; try { return __game.cheat(); } finally { s.active = true; } });
        if (how !== 'panel') fail(`the last task of "${other.id}" was not solved (${how || 'nothing done'})`);
        await page.waitForSelector('#fanfare:not(.hidden)', { timeout: T(30000) }).catch(() => fail(`no shard of "${other.id}" after its last task`));
        await tapOn('#fanfareOk').catch((e) => fail(`the button of the shard cannot be pressed: ${why(e)}`));
        await page.waitForFunction(() => !__game.busy, null, { timeout: T(15000) }).catch(() => fail('the scene of the shard did not end'));
        await silence().catch(() => fail('the thanks did not end'));
        // "go on" would start the moment the thanks end; one second of game time is left for it, however slow the frames are
        const t0 = await g(() => __game.time);
        await page.waitForFunction((t) => __game.time - t >= 1, t0, { timeout: T(30000), polling: 'raf' });
        const now = await g(() => ({ said: window.__starts.go_next ?? 0, dropped: __game.dropped.filter((k) => k === 'go_next').length, quest: __game.save.worlds.fairy.quests }));
        const b = await bubbleNow(), left = [];
        if ((now.quest[other.id] ?? 0) < 3) left.push(`the quest of "${other.id}" is not finished: ${now.quest[other.id]}`);
        if (now.said > was.said) left.push('"go_next" was said');
        if (now.dropped > was.dropped) left.push('"go_next" was asked for (the planner turned it away)');
        if (!b.shown) left.push('the bubble is hidden');
        if (b.key !== 't_stars') left.push(`the game remembers "${b.key}", not the line of the search: a tap on the cat would say it`);
        if (!b.text.includes(`⭐ ${was.found} / 5`)) left.push(`the bubble shows "${b.text}", not the count ⭐ ${was.found} / 5`);
        if (left.length) fail(`${left.join('; ')} (${other.id})`);
        console.log(`the last task of "${other.id}" solved during the search: its shard, no "go_next", the bubble shows "${b.text}" (${b.key})`);
        searchBefore = await progress();   // the task recorded its skill and stars: the search is measured from here on
        shardSearched = true;
      };
      // ---- every panel task can be closed with its button (LEARN-14): the first meeting of each kind closes it at once ----
      // A real tap or click on the cross, then: the controls are back, nothing of the task is left (panel, planner, voice,
      // bubble), the save is the same (skills, quests, stars), and the heroine walks. The loop below talks to the same
      // character again; the second meeting is the usual one (picture, deliberate mistake, hint, answer).
      const closed = new Map();     // task type -> { quest, step } when it was closed
      const closeTask = async (q, type) => {
        const fail = (what) => { throw new Error(`closing the "${type}" task: ${what}`); };
        const step = await g((id) => __game.save.worlds.fairy.quests[id] ?? 0, q.id);
        const before = await saved();
        await tapOn('#taskClose').catch((e) => fail(`the close button cannot be pressed: ${why(e)}`));
        await page.waitForFunction(() => !__game.busy, null, { timeout: T(10000) }).catch(() => fail('the closed task did not give the controls back'));
        await wait(500);
        const left = await held();
        if (await visible('#task')) left.push('the task is still on screen');
        if (await g(() => __game.inTask)) left.push('the planner of spoken lines still thinks a task is open');
        if (await sounding()) left.push('a spoken line is still sounding');
        const after = await saved();
        if (after !== before) left.push(`the save changed: ${before} -> ${after}`);
        if (left.length) fail(left.join('; '));
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; }); await wait(300);   // open ground at the spawn
        if (!(await walks())) fail('the heroine does not walk');
        closed.set(type, { quest: q.id, step });
        console.log(`"${type}" closed with the cross (${q.id}, step ${step + 1}): nothing recorded, the heroine walks`);
      };
      let crystalsWrong = false;
      for (const q of quests) {
        const t0 = Date.now();
        while ((await g((id) => __game.save.worlds.fairy.quests[id] ?? 0, q.id)) < 3 || await g(() => __game.busy)) {
          if (Date.now() - t0 > T(stuckMs)) throw new Error('quest stuck: ' + q.id);
          await starsKept(`in the quest "${q.id}"`);
          // The crystal counter counts finished friends only: a quest halfway through gives no shard yet.
          if (!crystalsWrong && !(await g(() => __game.busy))) {
            const c = await g(() => ({ hud: document.querySelector('#crystals').textContent, quests: { ...__game.save.worlds.fairy.quests },
              done: Object.values(__game.save.worlds.fairy.quests).filter((v) => v >= 3).length }));
            if (c.hud !== `${c.done}/5`) { crystalsWrong = true; errors.push(`crystals: ${mode}: the counter shows ${c.hud} with the quests ${JSON.stringify(c.quests)}`); }
          }
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
            if (hurried && !fifthHeard) await g(() => { __game.save.worlds.fairy.quests.deer = 0; });   // the second search, see fifthStar
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
            } else if (!onwardLate) {
              // After the second shard the button waits for the end of the thanks: "go on" must still come after the scene,
              // with its subtitle - not inside the scene, whose end would clear its bubble.
              const fail = (what) => { throw new Error(`after the second shard: ${what}`); };
              const t0 = Date.now();
              while (await sounding()) { if (Date.now() - t0 > T(15000)) fail('the thanks did not end'); await wait(200); }
              const said = await g(() => window.__starts.go_next ?? 0);
              await page.click('#fanfareOk');
              await page.waitForFunction((n) => !__game.busy && __game.line === 'go_next' && (window.__starts.go_next ?? 0) > n
                && !document.querySelector('#bubble').classList.contains('hidden'), said, { timeout: T(15000) })
                .catch(() => fail('"go_next" was not said with its subtitle after the scene (the button was pressed after the thanks)'));
              console.log('after the second shard: "go_next" is said with its subtitle (the button was pressed after the thanks)');
              onwardLate = true;
            } else await page.click('#fanfareOk');
            await wait(500); continue;
          }
          { const wrong = await unplanned(); if (wrong) errors.push(wrong); }
          if (await visible('#task')) {
            const type = await g(() => document.querySelector('#taskStage').className.split(' t-')[1].split(' ')[0]);
            if (!closed.has(type)) { await closeTask(q, type); continue; }
            if (!seen.has(type)) {
              seen.add(type); await wait(type === 'simon' ? 5500 : 900); await shot(`task-${type}`); await checkQuestion(type);
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
                // The picture is taken once "try again" and the whole spoken hint have ended and the solution is on
                // screen: a broken "show the solution" step fails the run. Where nothing is drawn - long enough for both lines.
                else {
                  mistakes.add(type);
                  if (!SHOWS[type]) await wait(7000);
                  else await page.waitForSelector(SHOWS[type], { state: 'attached', timeout: T(15000) })
                    .catch(() => errors.push(`hint: ${mode} hint-${type}: the solution was not shown after the mistake (no ${SHOWS[type]})`));
                  await wait(300); await shot(`hint-${type}`); await checkHint(type);
                }
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
              await wait(1500); await shot('task-butterflies'); await checkQuestion('butterflies');
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
                mistakes.add('butterflies');
                await page.waitForFunction(() => __game.bf.demo && __game.bf.sprites.length >= 1, null, { timeout: T(15000) })
                  .catch(() => errors.push(`hint: ${mode} hint-butterflies: the cat did not start counting the butterflies after the mistake`));
                await wait(300); await shot('hint-butterflies'); await checkHint('butterflies');
                await page.waitForFunction(() => !__game.bf.demo, null, { timeout: T(30000) });
              }
            }
            // The right answer, and at once the close button (the panel stays on screen for a moment): the answer stands.
            const step = await g((id) => __game.save.worlds.fairy.quests[id] ?? 0, q.id);
            await g(() => __game.cheat());
            await page.locator('#answersClose').dispatchEvent('click');
            await wait(1500);
            if ((await g((id) => __game.save.worlds.fairy.quests[id] ?? 0, q.id)) !== step + 1) errors.push('the close button undid the right answer of the butterflies task');
            continue;
          }
          if (await g(() => __game.search.active)) {
            if (!seen.has('stars')) { seen.add('stars'); await wait(800); await shot('task-stars'); await checkQuestion('stars');
              // Without the voice no timer hides the question: it is still there after the six seconds it gets with the voice.
              if (mute) {
                await wait(6500);
                const b = await bubbleNow();
                if (!b.shown || b.text !== asked.stars.text) errors.push(`question: ${mode} task-stars: without the voice the question was gone before the first star: ${b.shown ? `"${b.text}"` : 'the bubble is hidden'}`);
              }
            }
            // Without the voice the question stays next to the count of the stars found; with the voice the count replaces it.
            if (!starsCounted && (await g(() => __game.search.found)) >= 1) {
              starsCounted = true; await shot('task-stars-found');
              const b = await bubbleNow(), q = asked.stars?.text ?? '';
              if (!b.shown || !/⭐ \d \/ 5$/.test(b.text)) errors.push(`question: ${mode} task-stars-found: the bubble does not show the count of the stars: "${b.text}"`);
              else if (mute ? !q || !b.text.startsWith(q) : b.text.length > 10) errors.push(`question: ${mode} task-stars-found: ${mute ? 'without' : 'with'} the voice the bubble shows "${b.text}"`);
            }
            searchBefore ??= await progress();
            const found = await g(() => __game.search.found);
            if (!searchResumed && !hurried && found >= 1 && found <= 3) { await closedInSearch(q); continue; }
            if (!deerAsked && !hurried && found >= 1 && found <= 3) { await deerInSearch(); continue; }
            if (!shardSearched && !hurried && found >= 1 && found <= 3) { await shardInSearch(q); continue; }
            if (!hurried && found === 4) { await talkAfterLastStar(q); continue; }
            if (!fifthHeard && found === 4) { await fifthStar(); continue; }
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
        // "All the shards are found" is said after the last friend's shard, never earlier.
        {
          const a = await g(() => ({ said: window.__starts.all_shards ?? 0, done: Object.values(__game.save.worlds.fairy.quests).filter((v) => v >= 3).length, all: __game.npcs.length }));
          if (a.done < a.all && a.said) errors.push(`all shards: ${mode}: "all_shards" was said with ${a.done} of ${a.all} friends done`);
          if (a.done === a.all && !a.said) errors.push(`all shards: ${mode}: "all_shards" was not said after the last shard`);
        }
      }
      {
        // Each kind closed at its first meeting was met again and played: its quest went past the step it was closed at.
        const done = await g(() => ({ ...__game.save.worlds.fairy.quests }));
        const panel = Object.keys(QUESTIONS).filter((t) => t !== 'butterflies' && t !== 'stars');
        const unclosed = panel.filter((t) => !closed.has(t));
        if (unclosed.length) errors.push(`close: ${mode}: never closed with its button: ${unclosed.join(', ')}`);
        for (const [t, c] of closed) {
          if (!seen.has(t) || (done[c.quest] ?? 0) <= c.step) errors.push(`close: ${mode}: the "${t}" task was closed and not played again (${c.quest}, step ${c.step + 1})`);
        }
        console.log(`closed with the cross at the first meeting, nothing recorded, the heroine walked, then played: ${[...closed.keys()].join(' ')}`);
      }
      await page.waitForFunction(() => !__game.busy, null, { timeout: T(30000) });
      // ---- "sort" in the world (ARCH-09): the debug show at the deer, from a description like the panel's ----
      // Opened by __game.worldSort() only (the deer's chain keeps its "sort" on the panel). Once it is closed with its
      // cross, once it is solved; either way nothing is recorded - it is a debug show - and the heroine walks afterwards.
      {
        const fail = (what) => { throw new Error(`sort in the world: ${what}`); };
        const before = await saved();
        const open = async () => {
          await g(() => __game.worldSort());
          await page.waitForFunction(() => __game.sorting.active && __game.busy, null, { timeout: T(10000) }).catch(() => fail('the show did not open'));
          if (!(await g(() => __game.inTask))) fail(noPlan);
        };
        const ended = async (how) => {
          await page.waitForFunction(() => !__game.sorting.active && !__game.busy, null, { timeout: T(10000) })
            .catch(() => fail(`${how}: the show did not give the controls back`));
          await wait(500);
          const left = await held();
          if (await visible('#answersClose')) left.push('the close button is still shown');
          if (await g(() => __game.inTask)) left.push('the planner of spoken lines still thinks a task is open');
          if (await sounding()) left.push('a spoken line is still sounding');
          const after = await saved();
          if (after !== before) left.push(`the save changed: ${before} -> ${after}`);
          if (left.length) fail(`${how}: ${left.join('; ')}`);
        };
        await open();
        await wait(1500); await shot('task-world-sort');
        const pedestals = await g(() => __game.sorting.colors.length);
        if (pedestals < 2) fail(`${pedestals} pedestals on the arc`);
        await tapOn('#answersClose').catch((e) => fail(`the close button cannot be pressed: ${why(e)}`));
        await ended('closed with its cross');
        await open();
        const how = await g(() => __game.cheat());
        if (how !== 'sort') fail(`__game.cheat() did "${how}", not the sort`);
        await ended('solved');
        if (!(await walks())) fail('the heroine does not walk');
        console.log(`sort in the world: ${pedestals} pedestals; closed with its cross, then solved - nothing recorded, the heroine walks`);
      }
      // A conversation is broken once on purpose, right after it has taken the controls: the heroine must walk again,
      // and the same conversation must start anew (the replay below).
      {
        const left = await breakScene('talk fox', () => g(() => __game.talk('fox')));
        if (await visible('#task')) left.push('a task was opened although the scene broke');
        if (left.length) throw new Error(`the broken conversation: ${left.join('; ')}`);
        if (!(await walks())) throw new Error('the broken conversation: the heroine does not walk');
        console.log('broken conversation: reported, the controls are back, the heroine walks');
      }
      // ---- the tuning panel (?debug, ARCH-14): its sliders work at once, without a reload ----
      // Speed: the path walked forward in the same time from the same spot at the spawn (open ground towards the castle),
      // with the speed of the code and with half of it. Look: the camera turn of the same drag with the code's sensitivity
      // and with twice that. Camera: the distance follows its slider. Then "reset" brings back every value of the code.
      {
        const fail = (what) => { throw new Error(`tuning panel: ${what}`); };
        // Smoothed values (camera distance, tilt) follow in game time (__game.time): a frame counts at most 0.05 s, so on
        // a starved CI runner a wall-clock pause is a fraction of that in the game. Waits here are in game seconds.
        const gameWait = async (s) => {
          const t0 = await g(() => __game.time);
          await page.waitForFunction(([t, d]) => __game.time - t >= d, [t0, s], { timeout: T(s * 30000 + 5000) })
            .catch(() => fail(`${s} s of game time did not pass`));
        };
        const back = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
        // `ms` is game time (__game.time): a frame counts at most 0.05 s, so with software rendering (CI) a second
        // on the wall clock is a quarter of a second in the game, and the path in it is a quarter as long.
        const path = async (ms) => {
          await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; }); await wait(400);
          const from = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
          await page.keyboard.down('KeyW');
          let anim = '';
          try {
            const t0 = await g(() => __game.time);
            await page.waitForFunction(([t, s]) => __game.time - t >= s, [t0, ms / 1000], { timeout: T(ms * 30 + 5000), polling: 'raf' })
              .catch(() => fail(`${ms / 1000} s of game time did not pass`));
            anim = await g(() => __game.hero.current);
          } finally { await page.keyboard.up('KeyW'); }
          path.anim = anim;            // the animation she walks with: "Run" above the run threshold, "Walk" below
          return g(([x, z]) => Math.hypot(__game.hero.root.position.x - x, __game.hero.root.position.z - z), from);
        };
        // The picture of the open panel: at the spawn, with no bubble and no action button over the game.
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; });
        await page.waitForFunction(() => document.querySelector('#bubble').classList.contains('hidden'), null, { timeout: T(20000) })
          .catch(() => fail('the speech bubble did not go away'));
        await wait(600);
        await tapOn('#tuneBtn');
        if (!(await visible('#tune'))) fail('the button did not open the panel');
        await shot('32-tuning');
        const defaults = await g(() => ({ ...__game.tuning }));
        const code = defaults.speed;
        await path(300);                         // she turns to walk forward, the same in both runs
        const full = await path(1000);
        await page.locator('#tune input[data-k=speed]').fill(String(code / 2));
        const half = await g(() => __game.tuning.speed);
        if (half !== code / 2) fail(`the speed slider set the speed to ${half} instead of ${code / 2}`);
        const slow = await path(1000);
        const slowAnim = path.anim;
        console.log(`tuning panel: speed ${code} -> ${full.toFixed(2)} m in 1 s, speed ${half} -> ${slow.toFixed(2)} m`);
        if (!(full > 1)) fail(`with the speed of the code the heroine walked ${full.toFixed(2)} m in 1 s`);
        if (!(slow < full * 0.75)) fail(`the speed slider does not slow the heroine down: ${full.toFixed(2)} m, then ${slow.toFixed(2)} m with half the speed`);
        // The run threshold: at the same speed she runs while it is below the speed and walks once it is above.
        await page.locator('#tune input[data-k=runFrom]').fill(String(half + 0.5));
        await path(600);
        console.log(`tuning panel: at ${half} m/s "${slowAnim}" with the run threshold ${defaults.runFrom}, "${path.anim}" with ${half + 0.5}`);
        if (slowAnim !== 'Run' || path.anim !== 'Walk') fail(`the run threshold slider: at ${half} m/s "${slowAnim}" with the threshold ${defaults.runFrom}, "${path.anim}" with ${half + 0.5}`);
        // A drag over the free middle of the screen (right of the joystick half) turns the camera.
        // Across: the camera turn (yaw); down: its tilt (pitch), which follows the drag smoothly - read after it settles.
        const turn = async (dx, dy) => {
          const x = Math.round(size.width * 0.45), y = Math.round(size.height * 0.45);
          const from = await g(() => [__game.cam.yaw, __game.cam.pitch]);
          await page.mouse.move(x, y); await page.mouse.down();
          await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up();
          await gameWait(0.8);
          const to = await g(() => [__game.cam.yaw, __game.cam.pitch]);
          await page.mouse.move(x, y); await page.mouse.down();                    // the same way back
          await page.mouse.move(x - dx, y - dy, { steps: 5 }); await page.mouse.up();
          await gameWait(0.8);
          return dx ? from[0] - to[0] : to[1] - from[1];
        };
        await page.locator('#tune input[data-k=lookX]').fill(String(defaults.lookX * 2));
        await page.locator('#tune input[data-k=lookY]').fill(String(defaults.lookY * 2));
        await page.locator('#tune input[data-k=camDist]').fill('9');
        await tapOn('#tuneBtn');
        if (await visible('#tune')) fail('the button did not close the panel');
        {
          const t0 = await g(() => __game.time);   // up to 5 s of game time, however slow the frames are
          await page.waitForFunction((t) => (__game.cam.dist > 8.5 && !__game.cam.focus) || __game.time - t > 5, t0, { timeout: T(155000) })
            .catch(() => {});
          if (!(await g(() => __game.cam.dist > 8.5 && !__game.cam.focus))) {
            fail(`the camera distance did not follow its slider: ${(await g(() => __game.cam.dist)).toFixed(2)} after ${(await g((t) => __game.time - t, t0)).toFixed(1)} s of game time`);
          }
        }
        const fast = [await turn(100, 0), await turn(0, 40)];
        await g((v) => { __game.tuning.lookX = v.lookX; __game.tuning.lookY = v.lookY; }, defaults);
        const usual = [await turn(100, 0), await turn(0, 40)];
        ['across', 'down'].forEach((way, i) => {
          console.log(`tuning panel: a drag ${way} turns the camera by ${usual[i].toFixed(3)} rad, by ${fast[i].toFixed(3)} rad with twice the sensitivity`);
          if (!(usual[i] > 0.1 && fast[i] > usual[i] * 1.6 && fast[i] < usual[i] * 2.4)) fail(`the look sensitivity slider (${way}): the same drag turned the camera by ${usual[i].toFixed(3)} and ${fast[i].toFixed(3)} rad`);
        });
        await tapOn('#tuneBtn');
        await tapOn('#tuneReset');
        const now = await g(() => ({ ...__game.tuning }));
        if (JSON.stringify(now) !== JSON.stringify(defaults)) fail(`"reset" did not bring the values of the code back: ${JSON.stringify(now)}`);
        await tapOn('#tuneBtn');
        if (await visible('#tune')) fail('the button did not close the panel');
        await g(([x, z]) => __game.teleport(x, z), back); await wait(300);
      }
      // ---- the heroine does not walk through a character (the world's ground and its colliders, ARCH-06) ----
      // She stands 2.5 m in front of the first character (south of it: with the camera turn 0 "forward" is -z) and walks
      // at it for 1.5 s of game time. A character is a circle of 0.8 m and she one of 0.4 m: she stays 1.2 m from its middle.
      {
        const fail = (what) => { throw new Error(`collisions: ${what}`); };
        const at = await g(() => { const n = __game.npcs[0]; return { id: n.def.id, x: n.pos.x, z: n.pos.z }; });
        await g((p) => { __game.teleport(p.x, p.z + 2.5); __game.cam.yaw = 0; window.__near = 99;
          const look = () => { if (window.__near === undefined) return;
            window.__near = Math.min(window.__near, Math.hypot(__game.hero.root.position.x - p.x, __game.hero.root.position.z - p.z)); requestAnimationFrame(look); };
          look(); }, at);
        await wait(300);
        const t0 = await g(() => __game.time);
        await page.keyboard.down('KeyW');
        try {
          await page.waitForFunction((t) => __game.time - t >= 1.5, t0, { timeout: T(60000) }).catch(() => fail('1.5 s of game time did not pass'));
        } finally { await page.keyboard.up('KeyW'); }
        const near = await g(() => { const n = window.__near; window.__near = undefined; return n; });
        const moved = await g((p) => Math.hypot(__game.hero.root.position.x - p.x, __game.hero.root.position.z - p.z), at);
        if (!(near > 1.1)) fail(`she walked into "${at.id}": ${near.toFixed(2)} m from its middle`);
        if (!(moved < 2.2)) fail(`she did not walk towards "${at.id}" (still ${moved.toFixed(2)} m away)`);
        console.log(`collisions: she stopped ${near.toFixed(2)} m from the middle of "${at.id}"`);
      }
      // replay one finished quest
      await g(() => __game.talk('fox')); await page.waitForSelector('#task:not(.hidden)', { timeout: T(20000) }); await g(() => __game.cheat()); await page.waitForFunction(() => !__game.busy, null, { timeout: T(30000) });
      // finale
      await g(() => __game.teleport(21.2, -6.4)); await wait(600); await shot('20-shrine');
      // The finale is broken once on purpose, right after it has taken the controls and started to merge the shards.
      // The heroine must walk again; then the finale is played for real.
      {
        const left = await breakScene('finale', act);
        if (await g(() => __game.save.worlds.fairy.final)) left.push('the crystal is restored although the scene broke');
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
      // The book shows what the world gives it: one shard per friend, lit for every friend done, the stars of the save
      // and whether the chest was opened.
      {
        const b = await g(() => {
          const s = __game.save, w = s.worlds.fairy, shards = [...document.querySelectorAll('#shards .shard')];
          return { shards: shards.length, got: shards.filter((e) => e.classList.contains('got')).length, friends: __game.npcs.length,
            done: Object.values(w.quests).filter((v) => v >= 3).length, stars: s.stars, chest: !!w.flags?.chest,
            stats: document.querySelector('#colStats')?.textContent ?? '' };
        });
        const left = [];
        if (b.shards !== b.friends) left.push(`${b.shards} shards for ${b.friends} friends`);
        if (b.got !== b.done) left.push(`${b.got} shards lit, ${b.done} friends done`);
        if (!b.stats.includes(String(b.stars))) left.push(`the stars ${b.stars} are not in "${b.stats}"`);
        if (!b.stats.includes(b.chest ? '✔' : '?')) left.push(`the chest (${b.chest ? 'open' : 'closed'}) is not in "${b.stats}"`);
        if (left.length) errors.push(`book: ${mode}: ${left.join('; ')}`);
        else console.log(`book: ${b.got} of ${b.shards} shards, ${b.stars} stars, the chest ${b.chest ? 'open' : 'closed'}`);
      }
      // The same "random" number at both openings of the gate: only the memory of the example asked last time can make
      // the second one different.
      await g(() => { window.__random = Math.random; Math.random = () => 0.42; });
      await page.click('#btnParents'); await wait(500); await shot('31-gate');
      // ---- the gate (PLAY-14): the example is read from the screen; only its whole right answer opens the section ----
      {
        const fail = (what) => { throw new Error(`the gate of the parents' section: ${what}`); };
        const read = async () => {
          const text = await page.textContent('#gateQ');
          const m = /(\d+) × (\d+)/.exec(text);
          if (!m) fail(`no multiplication in the question "${text}"`);
          const [a, b] = [Number(m[1]), Number(m[2])];
          if (![a, b].every((n) => n >= 6 && n <= 9)) fail(`the question "${text}" is not about two numbers from 6 to 9`);
          return { text, answer: a * b };
        };
        const open = () => g(() => !document.querySelector('#pBody').classList.contains('hidden') || document.querySelector('#gate').classList.contains('hidden'));
        const first = await read();
        // typed the way a parent does, key by key: the first digit alone and a wrong number open nothing
        for (const typed of [String(first.answer)[0], String(first.answer + 1), '']) {
          await page.fill('#gateA', ''); if (typed) await page.type('#gateA', typed); await wait(200);
          if (await open()) fail(`"${typed}" opened the section, the question was "${first.text}"`);
        }
        await page.type('#gateA', String(first.answer)); await wait(500);
        if (!(await open())) fail(`the right answer ${first.answer} did not open the section, the question was "${first.text}"`);
        await shot('31-parents'); await checkLinks('parents section');
        // ---- the version (TECH-10): the day of the build and the commit number the game was built from ----
        const ver = await g(() => {
          const e = document.querySelector('#pVersion'), r = e?.getBoundingClientRect();
          return e ? { text: e.textContent, built: document.querySelector('#pBuilt')?.textContent, commit: document.querySelector('#pCommit')?.textContent,
            seen: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight } : null;
        });
        if (!ver) throw new Error('version: the parents\' section shows no version line');
        if (!ver.seen) errors.push(`version: ${mode}: the version line "${ver.text}" is not inside the window`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ver.built ?? '')) errors.push(`version: the day of the build is "${ver.built}", not YYYY-MM-DD`);
        if (!/^([0-9a-f]{4,40}|no-git)$/.test(ver.commit ?? '')) errors.push(`version: the commit number is "${ver.commit}"`);
        if (commit && ver.commit !== commit) errors.push(`version: the parents' section shows commit "${ver.commit}", but the sources are at "${commit}" (git rev-parse --short HEAD): the build is not of this commit`);
        console.log(`version: "${ver.text}"${commit ? `, the commit is that of the sources (${commit})` : ', E2E_COMMIT is not set: the commit was not compared'}`);
        // the voice slider shows what this walkthrough plays with
        const slider = await g(() => Number(document.querySelector('#pBody [data-v=voice]')?.value));
        if (mute ? slider !== 0 : !(slider > 0)) errors.push(`the voice slider of the parents' section is at ${slider} in a walkthrough ${mute ? 'without' : 'with'} the voice`);
        // the quality button (TECH-04): automatic -> high -> medium -> plain -> automatic; a pinned tier applies at once
        {
          const steps = [];
          for (let i = 0; i < 4; i++) {
            await page.click('#pQuality'); await wait(300);
            const pin = await g(() => __game.save.pinTier);
            let shown = '';
            if (pin !== null && !process.env.Q) {
              await page.waitForFunction((t) => (document.querySelector('#fps')?.textContent ?? '').includes(` q${t} `), pin, { timeout: T(5000) })
                .catch(async () => errors.push(`quality: the parent pinned q${pin}, but the counter shows "${await g(() => document.querySelector('#fps')?.textContent)}"`));
              shown = ` (counter q${pin})`;
            }
            steps.push(`${pin === null ? 'auto' : `q${pin}`}${shown}`);
          }
          if (steps.map((x) => x.split(' ')[0]).join(' ') !== 'q2 q1 q0 auto') errors.push(`quality: the button steps through ${steps.join(' -> ')}, not q2 -> q1 -> q0 -> auto`);
          console.log(`quality button: ${steps.join(' -> ')}`);
        }
        // closed and opened again: another example, and the section is shut until it is answered
        await page.click('#parentsClose'); await page.click('#btnBook'); await wait(300); await page.click('#btnParents'); await wait(300);
        if (await open()) fail('opened for the second time, the section is not shut');
        const second = await read();
        if (second.answer === first.answer) fail(`two openings in a row asked the same example: "${first.text}" and "${second.text}"`);
        await page.type('#gateA', String(first.answer)); await wait(200);
        if (await open()) fail(`the answer of the previous example (${first.answer}) opened the section, the question was "${second.text}"`);
        console.log(`the gate: "${first.text}" was opened by ${first.answer} only; the next opening asked "${second.text}"`);
      }
      await g(() => { Math.random = window.__random; });
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
      // Every task solved in a talk is counted in its skill (recordTask, src/game/skills.ts): at least one task for
      // each step of the chains done, but the star search's (it trains no skill).
      {
        const recorded = Object.values(s.skills).reduce((n, v) => n + v.tasks, 0);
        const steps = Object.values(s.worlds.fairy.quests).reduce((n, v) => n + v, 0);
        if (recorded < steps - 1) errors.push(`skills: ${recorded} tasks counted in the skills for ${steps} steps of the chains done`);
        else console.log(`skills: ${recorded} tasks counted for ${steps} steps of the chains`);
      }
      if (!catRepeated) errors.push('repeating a line by a tap on the cat went unchecked');
      if (!hurried) errors.push('the talk right after the fifth star went unchecked');
      if (!fifthHeard) errors.push('fifth star: the number of the fifth star in silence went unchecked');
      if (!searchResumed) errors.push('star search after a closed task: went unchecked');
      if (!onward) errors.push('the cat\'s "go on" after a shard went unchecked');
      if (!onwardLate) errors.push('the cat\'s "go on" after the thanks of a shard went unchecked');
      console.log('final:', s.worlds.fairy.final, 'quests:', JSON.stringify(s.worlds.fairy.quests), 'stars:', s.stars);
      {
        const frames = await starsKept('by the end of the world');
        if (!frames) errors.push(`stars: ${mode}: the watch of the stars saw no frame`);
        console.log(`stars: watched on ${frames} frames, ${starDrops ? `went down ${starDrops} times` : 'never went down'}`);
      }
      console.log('skills:', Object.entries(s.skills).map(([k, v]) => `${k} L${v.level} ${v.first}/${v.tasks}`).join(' | '));
      // Every line of the world is recorded: a line left to the device's synthesizer means a missing or broken clip.
      const voice = await g(() => ({ clips: __game.voice.clips, synth: [...new Set(__game.voice.synth)], dropped: [...__game.dropped] }));
      console.log(`voice: ${voice.clips} clips sounded, lines left to the synthesizer: ${voice.synth.length ? voice.synth.join(' ') : 'none'}`);
      voiceUsed = await checkVoice('at the end');
      console.log(`voice volume: ${mute ? 'off' : 'on'} - ${voiceUsed.clips} clips started, ${voiceUsed.loud} of them with a volume above zero`);
      if (!starsCounted) errors.push('the bubble of the star search was not looked at after a star was found');
      if (!deerAsked) errors.push('talk to the deer during the search: it was never played');
      if (!shardSearched) errors.push('a shard during the search: it was never played');
      // The planner of spoken lines turns away only what this scenario provokes: "back to the deer" in the talk right
      // after the fifth star, and the cat's "go on" after a shard when the next conversation has already begun.
      const turned = {};
      for (const id of voice.dropped) turned[id] = (turned[id] ?? 0) + 1;
      console.log(`lines turned away by the planner: ${Object.entries(turned).map(([id, n]) => `${id} x${n}`).join(' ') || 'none'}`);
      const lost = Object.keys(turned).filter((id) => id !== 'go_next' && id !== 't_stars_back');
      if (lost.length) errors.push(`the planner turned away lines the scenario gives no reason for: ${lost.join(' ')}`);
      if (voice.synth.length) errors.push(`no recorded clip for: ${voice.synth.join(' ')} (python3 tools/gen_voice.py)`);
      if (!voice.clips) errors.push('not a single voice clip sounded during the walkthrough');
      // With ?debug the counter shows what docs/perf.md tells the parent to read on the phone.
      const counter = await page.textContent('#fps').catch(() => null);
      console.log('fps:', counter);
      if (!/^\d+ fps · q[0-2] · \d+k tris · \d+ calls$/.test(counter ?? '')) errors.push(`with ?debug the frame counter does not show the frames: "${counter}"`);
      // the start screen of a returning player: the saved game adds the "start again" button
      // Leaving the page saves where she stands (pagehide): the save on a timer alone would lose up to ten seconds of walk.
      const leftAt = [2.5, 12.5];
      // Save v3 (ARCH-07): the spot is the first world's progress, under worlds.fairy.
      const storedBefore = await g((p) => { __game.teleport(p[0], p[1]); return JSON.parse(localStorage.getItem('amw-save') || '{}').worlds?.fairy?.pos; }, leftAt);
      await page.reload(); await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
      {
        const pos = await g(() => JSON.parse(localStorage.getItem('amw-save') || '{}').worlds?.fairy?.pos);
        const near = (p) => Array.isArray(p) && Math.hypot(p[0] - leftAt[0], p[1] - leftAt[1]) < 0.01;
        if (near(storedBefore)) console.log('leaving the page: the timer had already saved the spot - not put to the test');
        else if (!near(pos)) errors.push(`leaving the page: the save keeps ${JSON.stringify(pos)}, not the spot she left at ${JSON.stringify(leftAt)}`);
        else console.log('leaving the page: the spot she stood on is saved');
      }
      await wait(1500); await shot('40-start-again');
      // "Start again" really starts again: after the reload the save is the one of a new player. The game saves itself
      // on the way out (pagehide), and that once wrote the whole progress straight back.
      {
        const fail = (what) => { throw new Error(`start again: ${what}`); };
        const had = await g(() => JSON.parse(localStorage.getItem('amw-save') || '{}'));
        // Save v3 (ARCH-07): a world's progress lies under worlds.<id>. The check has to see the progress it clears, or
        // reading it from the wrong place would pass in silence: the walkthrough restored the crystal and did every quest.
        const hadW = had.worlds?.fairy;
        if (!(had.stars > 0)) fail(`the walkthrough left no stars to clear: ${had.stars}`);
        if (!hadW?.final || Object.keys(hadW.quests ?? {}).length === 0) fail(`the walkthrough left no world progress to clear under worlds.fairy: ${JSON.stringify(hadW)}`);
        await Promise.all([page.waitForEvent('load', { timeout: T(90000) }), tapOn('#restart')]).catch((e) => fail(`the button did not reload the game: ${why(e)}`));
        await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) });
        const now = await g(() => JSON.parse(localStorage.getItem('amw-save') || '{}'));
        const left = [];
        if (now.stars) left.push(`${now.stars} stars`);
        if (now.played) left.push('"played"');
        // every world of the save, and the top level where a version 2 save kept the progress
        for (const [id, w = {}] of [['top', now], ...Object.entries(now.worlds ?? {})]) {
          if (w.final) left.push(`the restored crystal (${id})`);
          if (Object.keys(w.quests ?? {}).length) left.push(`quests ${JSON.stringify(w.quests)} (${id})`);
          if (w.starsTaken?.length) left.push(`stars taken ${JSON.stringify(w.starsTaken)} (${id})`);
          if (w.chestOpen || w.flags?.chest) left.push(`the open chest (${id})`);
        }
        if (await visible('#restart')) left.push('the "start again" button of a returning player');
        if (left.length) fail(`after the reload the old progress is back: ${left.join(', ')}`);
        console.log(`start again: ${had.stars} stars and quests ${JSON.stringify(hadW.quests)} cleared, the start screen of a new player`);
      }
    }
  } catch (e) {
    // a stuck quest or a timed-out wait: report it with the rest and keep a picture of where it happened
    errors.push('scenario failed: ' + e.message);
    await picture('99-failure').catch(() => {});
  }
} finally {
  await browser.close().catch(() => {});
}
// The fingerprint of the tasks met (ARCH-08): two walkthroughs of one size with one E2E_SEED print the same one.
writeFileSync(`${out}/${mode}-tasks.txt`, taskLog.join('\n') + '\n');
console.log(`task sequence${seed ? ` (seed ${seed})` : ''}: ${taskLog.length} tasks, ${createHash('sha256').update(taskLog.join('\n')).digest('hex').slice(0, 16)}`);
if (modelsOut) writeFileSync(modelsOut, JSON.stringify([...models].sort(), null, 2) + '\n');
// Written only by a walkthrough that reached its end with the voice checked: tools/e2e.mjs reads who played in silence.
if (voiceOut && voiceUsed) writeFileSync(voiceOut, JSON.stringify({ mute, clips: voiceUsed.clips, loud: voiceUsed.loud }) + '\n');
console.log(`offline: ${offline ? `yes, files in the cache: ${cachedFiles ?? 'unknown (the network was never switched off)'}` : 'no'}`);
console.log(`model files requested by the page: ${models.size}`);
console.log(`requests: ${nRequests}, origins: ${origins.size}` + (cancelled.length ? `, cancelled by the browser: ${cancelled.length}` : ''));
// the tolerated cancellations stay visible: which requests they were
for (const u of cancelled.slice(0, 5)) console.log(`  cancelled (not an error): ${u}`);
if (cancelled.length > 5) console.log(`  … and ${cancelled.length - 5} more`);
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
if (errors.length) process.exitCode = 1;
