// node tools/fps.mjs [--url=<address>] [--flyover] q=2 q=1 ...
//   fps at the spawn point per quality tier, with and without the heroine (perf regression probe);
//   --flyover: the frames while the camera flies the tour of the world (WORLD-11): the lowest (over half a second)
//   and the mean frame rate along the path. --url: the game's address (default the development server), e.g. a built
//   game served by `npx vite preview --port <port> --strictPort`.
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const url = (args.find((a) => a.startsWith('--url='))?.slice(6) ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const flyover = args.includes('--flyover');
const tiers = args.filter((a) => !a.startsWith('--'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
for (const q of tiers) {
  // A new context per tier: a new save, so the tour of a first entry plays after "play".
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(url + '?debug&' + q, { waitUntil: 'networkidle' });   // ?debug: the counter and __game
  await page.waitForSelector('#play', { state: 'visible' }); await page.click('#play');
  if (flyover) {
    // The tour of the first entry is let go and flown again by the debug command, from its start: every frame of the
    // path is timed by the page itself (the real time between two frames, not the game's).
    await page.waitForFunction(() => window.__game?.flyoverPlayer);
    await page.evaluate(() => __game.flyoverPlayer.skip());
    await page.waitForFunction(() => !__game.busy);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => new Promise((done) => {
      const dts = [];
      let last = 0;
      __game.flyover();
      const tick = (now) => {
        if (last) dts.push(now - last);
        last = now;
        if (__game.flyoverPlayer.active) requestAnimationFrame(tick); else done(dts);
      };
      requestAnimationFrame(tick);
    }));
    const total = r.reduce((a, b) => a + b, 0);
    // the lowest: frames per second over each half second of the path
    let low = Infinity, n = 0, t = 0;
    for (const dt of r) { n++; t += dt; if (t >= 500) { low = Math.min(low, (n * 1000) / t); n = 0; t = 0; } }
    if (!Number.isFinite(low) && t) low = (n * 1000) / t;
    console.log(q, `| flyover: ${r.length} frames in ${(total / 1000).toFixed(1)} s | min ${low.toFixed(1)} fps | mean ${((r.length * 1000) / total).toFixed(1)} fps`);
  } else {
    // the tour of the first entry would fly the camera away from the spawn point
    await page.waitForFunction(() => window.__game);
    await page.evaluate(() => __game.flyoverPlayer?.skip());
    await page.waitForTimeout(7000);
    const a = await page.textContent('#fps');
    await page.evaluate(() => { __game.hero.root.visible = false; });
    await page.waitForTimeout(4000);
    console.log(q, '| with hero:', a, '| without:', await page.textContent('#fps'));
  }
  await ctx.close();
}
await browser.close();
