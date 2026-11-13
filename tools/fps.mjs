// node tools/fps.mjs : fps at the spawn point per quality tier, with and without the heroine (perf regression probe)
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
for (const q of process.argv.slice(2)) {
  await page.goto('http://localhost:5173/?' + q, { waitUntil: 'networkidle' });
  await page.waitForSelector('#play', { state: 'visible' }); await page.click('#play');
  await page.waitForTimeout(7000);
  const a = await page.textContent('#fps');
  await page.evaluate(() => { __game.hero.root.visible = false; });
  await page.waitForTimeout(4000);
  console.log(q, '| with hero:', a, '| without:', await page.textContent('#fps'));
}
await browser.close();
