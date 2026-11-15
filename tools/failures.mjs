// The failure screens of the built game (TECH-07, TECH-08): node tools/failures.mjs <url> [outDir]
// tools/e2e.mjs runs it as the step "failure screens", once per run (with the mobile size).
//   1. Chrome with WebGL switched off: instead of the game the start screen shows the message with the advice to update
//      the browser, in the chosen language (Ukrainian, then Russian after the RU button); the console has no error and
//      no warning; the game goes no further (no model is requested, no loading bar, no "try again").
//   2. One model is blocked (every request for it fails): it is asked for 1 + 3 times, then the message and the
//      "try again" button are shown, the loading bar is gone; the block is lifted, the button is pressed - the start
//      screen with "Play" appears.
//   3. The same with one texture of a model blocked instead (shorter: the message, the button, the game after it).
// Both screens are measured in the two phone sizes (844x390 and 390x844): nothing scrolls, the panel and every button
// are inside the window, buttons are at least 44x44 and do not overlap. Pictures: <outDir>/failure-<screen>-<size>.png.
// Both run in contexts of their own without the service worker, so that no cache stands in for a blocked request.
// Environment: E2E_GL=gl|swiftshader (as tools/shot.mjs), E2E_SLOW=<n> (multiplier for the waits).
// Exit code: 0 — passed; 1 — a check failed (every failure is printed as "failures: …"); 2 — bad arguments.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const [url, out = 'shots-e2e'] = process.argv.slice(2);
const usage = (msg) => { console.error(`[failures] ${msg}\nUsage: node tools/failures.mjs <url> [outDir]`); process.exit(2); };
if (!url) usage('the url of the served build is missing');
let origin, host;
try { ({ origin, hostname: host } = new URL(url)); } catch { usage(`bad url "${url}"`); }
const GL_ARGS = {
  gl: ['--use-angle=gl', '--enable-gpu'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const gl = process.env.E2E_GL || 'gl';
if (!GL_ARGS[gl]) usage(`unknown E2E_GL="${gl}": use "gl" or "swiftshader"`);
const slow = Number(process.env.E2E_SLOW || 1);
if (!(slow > 0)) usage(`bad E2E_SLOW="${process.env.E2E_SLOW}"`);
const T = (ms) => Math.round(ms * slow);
const SIZES = { mobile: { width: 844, height: 390 }, 'mobile-portrait': { width: 390, height: 844 } };
const MIN_BUTTON = 44;
// The model that is blocked: a quest character, loaded at the start like every model.
const BLOCKED = 'models/animals_pack/Fox.glb';
// A texture of a model (models keep their textures in separate files): GLTFLoader itself only logs a texture it could
// not fetch and goes on without it; the game counts that as a failed load too.
const BLOCKED_TEXTURE = 'models/hero/tex/T_Child_BaseColor.webp';
const REPEATS = 3;   // src/core/assets.ts RETRIES: the first attempt and three repeats
// What the messages must say (src/ui/strings.ts); a part of each text is enough.
const TEXT = {
  no_webgl: { uk: 'Оновіть браузер', ru: 'Обновите браузер' },
  load_failed: { uk: 'Не вдалося завантажити гру', ru: 'Не удалось загрузить игру' },
  retry: { uk: 'Спробувати ще раз', ru: 'Попробовать ещё раз' },
};

const problems = [];
const fail = (msg) => { problems.push(msg); console.error(`failures: ${msg}`); };
mkdirSync(out, { recursive: true });

const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };
async function context(browser) {
  const ctx = await browser.newContext({ viewport: SIZES.mobile, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await ctx.route((u) => !own(u.href), (route) => route.abort());   // nothing leaves for the internet
  return ctx;
}
const launch = (extra = []) => chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: [...GL_ARGS[gl], '--ignore-gpu-blocklist', '--mute-audio', `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${host}`, ...extra],
});
/** Console errors and warnings and uncaught errors of the page, each with the moment it came. */
// The one message that is not the game's: Playwright reports the registration it turned away (serviceWorkers: 'block').
const NOT_THE_GAME = 'warning: Service Worker registration blocked by Playwright';
function listen(page, log) {
  page.on('console', (m) => {
    const l = `${m.type()}: ${m.text()}`;
    if ((m.type() === 'error' || m.type() === 'warning') && l !== NOT_THE_GAME) log.push(l);
  });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
}
const visible = (page, sel) => page.locator(sel).isVisible();
const text = (page, sel) => page.locator(sel).innerText();

/** The layout rules of tools/shot.mjs for the start screen, in short. */
async function layout(page, screen, size) {
  await page.setViewportSize(SIZES[size]);
  await page.waitForTimeout(T(300));
  const found = await page.evaluate((min) => {
    const out = [], vw = innerWidth, vh = innerHeight, px = (v) => Math.round(v);
    const shown = (e) => e.offsetWidth > 0 && e.offsetHeight > 0 && getComputedStyle(e).visibility === 'visible';
    const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const outside = (b) => b.l < -1 || b.t < -1 || b.r > vw + 1 || b.b > vh + 1;
    const name = (e) => e.id ? `#${e.id}` : `<${e.localName}>${e.textContent ? ` "${e.textContent.trim().slice(0, 12)}"` : ''}`;
    for (const e of [document.documentElement, document.body]) {
      if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.push(`<${e.localName}> scrolls`);
    }
    const panel = document.querySelector('#start .panel');
    if (!panel || !shown(panel)) out.push('the start panel is not shown');
    else if (outside(box(panel))) out.push(`the start panel is outside the ${vw}x${vh} window`);
    const btns = [...document.querySelectorAll('#start button, #start input')].filter(shown);
    for (const e of btns) {
      const b = box(e);
      if (outside(b)) out.push(`${name(e)} is outside the ${vw}x${vh} window`);
      if (e.localName === 'button' && (b.w < min - 0.5 || b.h < min - 0.5)) out.push(`${name(e)} is smaller than ${min}x${min}: ${px(b.w)}x${px(b.h)}`);
    }
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = box(btns[i]), b = box(btns[j]);
      if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1) out.push(`${name(btns[i])} overlaps ${name(btns[j])}`);
    }
    return out;
  }, MIN_BUTTON);
  for (const f of found) fail(`layout: ${size} ${screen}: ${f}`);
  await page.screenshot({ path: join(out, `failure-${screen}-${size}.png`) });
}

// ---- 1. no WebGL ----
async function noWebGL() {
  const browser = await launch(['--disable-webgl']);
  try {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    const log = [];
    listen(page, log);
    let models = 0;
    page.on('request', (r) => { if (new URL(r.url()).pathname.includes('/models/')) models++; });
    await page.goto(url);
    try { await page.locator('#noticeText').waitFor({ state: 'visible', timeout: T(15000) }); } catch { /* reported below */ }
    if (await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))) fail('no WebGL: the browser still gives a WebGL2 context, the check proves nothing');
    const shown = await visible(page, '#noticeText');
    if (!shown) fail('no WebGL: no message on the screen');
    else {
      const uk = await text(page, '#noticeText');
      if (!uk.includes(TEXT.no_webgl.uk)) fail(`no WebGL: the Ukrainian message does not advise to update the browser: "${uk}"`);
      await layout(page, 'no-webgl', 'mobile');
      await layout(page, 'no-webgl', 'mobile-portrait');
      await page.setViewportSize(SIZES.mobile);
      await page.locator('#langs [data-lang="ru"]').click();
      const ru = await text(page, '#noticeText');
      if (!ru.includes(TEXT.no_webgl.ru)) fail(`no WebGL: after RU the message is not Russian: "${ru}"`);
      // The chosen language is remembered: the next opening shows the message in it at once.
      await page.reload();
      await page.locator('#noticeText').waitFor({ state: 'visible', timeout: T(15000) }).catch(() => {});
      const again = await text(page, '#noticeText').catch(() => '');
      if (!again.includes(TEXT.no_webgl.ru)) fail(`no WebGL: reopened with RU chosen, the message is not Russian: "${again}"`);
      await page.locator('#langs [data-lang="uk"]').click();
    }
    await page.waitForTimeout(T(1500));   // anything the game would still try to do comes now
    for (const [sel, what] of [['#loading', 'the loading bar'], ['#setup', 'the start menu'], ['#retry', 'the "try again" button']]) {
      if (await visible(page, sel)) fail(`no WebGL: ${what} is shown`);
    }
    if (models) fail(`no WebGL: the game went on loading, ${models} model request(s)`);
    for (const l of log) fail(`no WebGL: console ${l}`);
    console.log(`[failures] no WebGL: message ${shown ? 'shown' : 'NOT shown'}, ${log.length} console error(s) or warning(s), ${models} model request(s)`);
    await ctx.close();
  } finally { await browser.close(); }
}

// ---- 2. one model blocked, then let through ----
async function blockedModel(target = BLOCKED, full = true) {
  const what = target === BLOCKED ? 'blocked model' : 'blocked texture', file = target.split('/').pop();
  const browser = await launch();
  try {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    const log = [];
    listen(page, log);
    let asked = 0, served = 0;
    const blocked = (u) => u.pathname.endsWith(`/${target}`);
    page.on('response', (r) => { if (blocked(new URL(r.url())) && r.status() === 200) served++; });
    const block = (route) => { asked++; return route.abort(); };
    await page.route(blocked, block);
    const t0 = Date.now();
    await page.goto(url);
    try { await page.locator('#retry').waitFor({ state: 'visible', timeout: T(90000) }); } catch { /* reported below */ }
    const waited = Date.now() - t0;
    if (!(await visible(page, '#retry'))) fail(`${what}: no "try again" button after ${waited} ms`);
    else {
      const msg = await text(page, '#noticeText'), btn = await text(page, '#retry');
      if (!msg.includes(TEXT.load_failed.uk)) fail(`${what}: the message is not the one of a failed load: "${msg}"`);
      if (btn !== TEXT.retry.uk) fail(`${what}: the button says "${btn}", not "${TEXT.retry.uk}"`);
      if (await visible(page, '#loading')) fail(`${what}: the loading bar is still shown next to the message`);
      // A texture shared by several models is asked for by each of them, so only the model has an exact count.
      if (full ? asked !== 1 + REPEATS : asked < 1 + REPEATS) fail(`${what}: ${target} was asked for ${asked} time(s), expected the first attempt and ${REPEATS} repeats`);
    }
    if (full && await visible(page, '#retry')) {
      await layout(page, 'load', 'mobile');
      await layout(page, 'load', 'mobile-portrait');
      await page.setViewportSize(SIZES.mobile);
      await page.locator('#langs [data-lang="ru"]').click();
      if ((await text(page, '#retry')) !== TEXT.retry.ru) fail(`blocked model: after RU the button says "${await text(page, '#retry')}"`);
      if (!(await text(page, '#noticeText')).includes(TEXT.load_failed.ru)) fail('blocked model: after RU the message is not Russian');
      await page.locator('#langs [data-lang="uk"]').click();
    }
    // Before the button only the blocked model may have failed; the game says once why it stopped.
    const own = log.filter((l) => !l.includes('net::ERR_FAILED') && !l.includes(file) && !/^error: the game could not load:/.test(l));
    for (const l of own) fail(`${what}: console ${l}`);
    if (!log.some((l) => /^error: the game could not load:/.test(l))) fail(`${what}: the game did not say in the console why it stopped`);
    log.length = 0;

    await page.unroute(blocked, block);
    if (await visible(page, '#retry')) await page.locator('#retry').click();
    try { await page.locator('#play').waitFor({ state: 'visible', timeout: T(90000) }); } catch { /* reported below */ }
    if (!(await visible(page, '#play'))) fail(`${what}: after the block was lifted and "try again" was pressed, the game did not start ("Play" is not shown)`);
    else {
      if (await visible(page, '#notice')) fail(`${what}: the message is still shown on the started game`);
      if (!served) fail(`${what}: the game started, but ${target} was never served`);
    }
    for (const l of log) fail(`${what}, after "try again": console ${l}`);
    console.log(`[failures] ${what}: asked ${asked} time(s), the message after ${waited} ms; after "try again" served ${served} time(s)`);
    await ctx.close();
  } finally { await browser.close(); }
}

try {
  await noWebGL();
  await blockedModel();
  await blockedModel(BLOCKED_TEXTURE, false);
} catch (e) {
  fail(`internal error: ${e.stack ?? e}`);
}
console.log(problems.length ? `[failures] FAILED: ${problems.length} problem(s)` : '[failures] PASSED');
process.exit(problems.length ? 1 : 0);
