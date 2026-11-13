// Headless smoke test: node tools/shot.mjs <url> <outDir> [mobile]
// Loads the game, presses Play, walks around, and saves screenshots + console errors.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';

const [url = 'http://localhost:5173/', out = 'shots', mode = 'desktop'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const ctx = await browser.newContext(mode === 'mobile'
  ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
  : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({ path: `${out}/${mode}-${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const g = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto(url + (process.env.Q ? `?q=${process.env.Q}` : ''));
await page.waitForSelector('#play', { state: 'visible', timeout: 60000 });
await wait(1500); await shot('01-start');
await page.click('#play');
await wait(2500); await shot('02-spawn');
// look around from a few vantage points
for (const [i, x, z, yaw] of [[3, 0, 2, 0], [4, 8, -6, -0.9], [5, -4, -40, 0.2], [6, -27, 10, 1.6], [7, 20, -4, 2.6]]) {
  await g(([x, z, yaw]) => { __game.teleport(x, z); __game.cam.yaw = yaw; }, [x, z, yaw]);
  await wait(1200); await shot(`0${i}-view`);
}
// quest: walk to the unicorn with the keyboard/auto-walk, start the task, count, answer
await g(() => { __game.teleport(4.0, -9.4); __game.cam.yaw = 0.3; });
await page.waitForFunction(() => __game.stage === 1, null, { timeout: 30000 });
await wait(800);
if (mode === 'mobile') await page.locator('#btnAct').dispatchEvent('pointerdown'); else await page.keyboard.press('KeyE');
await page.waitForSelector('#answers:not(.hidden)', { timeout: 30000 });
await wait(2500); await shot('08-task');
const n = await g(() => __game.task.n);
// wrong answer first -> hint demo
await page.locator('#answers button').nth(n === 10 ? 0 : n).dispatchEvent('pointerdown');
await wait(1200 + n * 900 + 2500); await shot('09-hint');
await page.locator('#answers button').nth(n - 1).dispatchEvent('pointerdown');
await wait(6000); await shot('10-reward');
console.log('stage after task', await g(() => __game.stage), 'stars', await g(() => __game.save.stars));
await g(() => __game.teleport(2.2, -8.4));
await page.waitForSelector('#fanfare:not(.hidden)', { timeout: 10000 });
await wait(1200); await shot('11-fanfare');
await page.click('#fanfareOk');
await g(() => { __game.teleport(16, -2); __game.cam.yaw = 2.9; });
await wait(5000); await shot('12-restored');
console.log('final stage', await g(() => __game.stage), 'fps:', await page.textContent('#fps'));
console.log('saved:', await g(() => localStorage.getItem('amw-save')));
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
await browser.close();
