// Full play-through smoke test: node tools/shot.mjs <url> <outDir> [desktop|mobile]
// Plays the whole first world through the real UI handlers (talk to every character, solve all 15 tasks,
// make one deliberate mistake per task type to exercise the hints, restore the crystal), saves screenshots
// and reports console errors.
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
const visible = (sel) => g((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden'); }, sel);
const press = (sel) => page.locator(sel).dispatchEvent(mode === 'mobile' ? 'pointerdown' : 'click').catch(() => {});

await page.goto(url + (process.env.Q ? `?q=${process.env.Q}` : ''));
await page.waitForSelector('#play', { state: 'visible', timeout: 90000 });
await wait(1500); await shot('00-start');
await page.click('#play');
await page.waitForFunction(() => !document.querySelector('#bubble').classList.contains('hidden'), null, { timeout: 20000 });
await wait(9000); await shot('01-spawn');

const seen = new Set();
const quests = await g(() => __game.npcs.map((n) => ({ id: n.def.id, x: n.def.x, z: n.def.z })));
for (const q of quests) {
  const t0 = Date.now();
  while ((await g((id) => __game.save.quests[id] ?? 0, q.id)) < 3 || await g(() => __game.busy)) {
    if (Date.now() - t0 > 240000) throw new Error('quest stuck: ' + q.id);
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
await page.waitForFunction(() => !__game.busy, null, { timeout: 30000 });
// replay one finished quest
await g(() => __game.talk('fox')); await page.waitForSelector('#task:not(.hidden)', { timeout: 20000 }); await g(() => __game.cheat()); await page.waitForFunction(() => !__game.busy, null, { timeout: 30000 });
// finale
await g(() => __game.teleport(21.2, -6.4)); await wait(600); await shot('20-shrine');
if (mode === 'mobile') await press('#btnAct'); else await page.keyboard.press('KeyE');
await wait(2500); await shot('21-finale');
await page.waitForSelector('#fanfare:not(.hidden)', { timeout: 20000 }); await wait(800); await shot('22-final-card');
await page.click('#fanfareOk'); await wait(4000); await shot('23-restored');
// collection + parents
await page.click('#btnBook'); await wait(500); await shot('30-book');
await page.click('#btnParents'); await page.fill('#gateA', '15'); await wait(500); await shot('31-parents');
await page.click('#parentsClose');
const s = await g(() => __game.save);
console.log('task types seen:', [...seen].join(' '));
console.log('final:', s.final, 'quests:', JSON.stringify(s.quests), 'stars:', s.stars);
console.log('skills:', Object.entries(s.skills).map(([k, v]) => `${k} L${v.level} ${v.first}/${v.tasks}`).join(' | '));
console.log('fps:', await page.textContent('#fps'));
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
await browser.close();
