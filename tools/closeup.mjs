// node tools/closeup.mjs <url> <outDir> : close-up screenshots of the characters for visual review
import { chromium } from 'playwright-core';
const [url = 'http://localhost:5173/', out = 'shots'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.addInitScript(() => localStorage.setItem('amw-save', JSON.stringify({ v: 1, stage: 4, stars: 7, starsTaken: [], chestOpen: false, pos: [0, 12], dress: '#ff7eb6', hair: '#6b3a1e', wings: true, played: true })));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#play', { state: 'visible', timeout: 60000 });
await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/close-start.png` });
await page.click('#play');
const views = [['hero-front', 0, 12, Math.PI, 3.2], ['hero-back', 0, 12, 0, 3.2], ['unicorn', 3.2, -10.2, -1.15, 4.2], ['cat', 0, 12, 2.4, 2.4], ['rainbow', 2, 8, -0.45, 9], ['castle', -8, -30, 0, 9], ['chest', -29, 7.5, 0.6, 5], ['shrine', 20.5, -4.5, 0.5, 5]];
for (const [name, x, z, yaw, d] of views) {
  await page.evaluate(([x, z, yaw, d]) => { __game.teleport(x, z); __game.cam.yaw = yaw; __game.closeup(d); __game.hero.heading = Math.PI; }, [x, z, yaw, d]);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}/close-${name}.png` });
}
await browser.close();
