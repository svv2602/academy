// node tools/tris.mjs [port] [--q 0,1,2] [--at x,z] [--desktop] [--top N] : where the triangles of one frame of the first
// world go (a tool for a person, docs/perf.md), by the pass (the frame, the sun's shadow, the bloom) and by what they
// draw. Plays the built game (dist/) with ?debug on this computer as the phone does (a touch screen: the scenery at the
// phone's density) unless --desktop, at the mushroom king (or --at), the camera the heaviest of eight ways (most
// triangles in the frame pass). One frame is drawn with renderBufferDirect wrapped (as tools/calls.mjs); the sums
// match the game's counter (`k tris` counts the shadow pass too), the frame pass alone is what docs/15-tech.md budgets.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { GROUPS } from './e2e-saves.mjs';

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const port = Number(process.argv.find((a) => /^\d+$/.test(a)) || 4239);
const desktop = process.argv.includes('--desktop');
const top = Number(arg('--top') ?? 25);
/** --shots <dir>: a picture of every way looked at (the king's point) and of the path at the start, for "before / after". */
const shots = arg('--shots');
const server = spawn(process.execPath, ['tools/e2e.mjs', '--serve', String(port)], { stdio: 'ignore', detached: true });
const stopServer = () => { try { process.kill(-server.pid); } catch { /* gone */ } };
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stopServer(); process.exit(130); });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
// the S22's save (docs/perf.md): the five tasks of the chains done, the finale not played, the fawn chosen
const save = GROUPS.shop.save();
save.worlds.fairy.final = false;

try {
  for (const q of (arg('--q') ?? '0,1,2').split(',').map(Number)) {
    const url = `http://localhost:${port}/?debug&q=${q}`;
    for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); /* clock: page-load */ }
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: !desktop });
    await ctx.addInitScript((s) => {
      if (!localStorage.getItem('amw-save')) localStorage.setItem('amw-save', s);
      try { for (const k of ['amw-gift-hold', 'amw-deal-hold', 'amw-break-hold', 'amw-mystery-hold']) sessionStorage.setItem(k, '1'); } catch { /* ignore */ }
    }, JSON.stringify(save));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(url);
    await page.waitForSelector('#play', { state: 'visible', timeout: 90000 }); /* clock: page-load */
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    if (coarse === desktop) throw new Error(`the page is ${coarse ? '' : 'not '}a touch screen: the density would be wrong`);
    await page.click('#play');
    const ready = () => { const g = window.__game; if (!g) return false; if (g.story?.active) { g.story.skip(); return false; } if (g.flyoverPlayer?.active) { g.flyoverPlayer.skip(); return false; } return !g.busy && document.querySelector('#start').classList.contains('hidden'); };
    await page.waitForFunction(ready, null, { timeout: 90000, polling: 300 }); /* clock: page-load */
    await page.waitForTimeout(4000); /* clock: measure */
    // a card of the save's news (an achievement) over the start: closed, the pictures show the world
    await page.waitForFunction(() => { const f = document.querySelector('#fanfare'); if (f && !f.classList.contains('hidden')) { document.querySelector('#fanfareOk')?.click(); return false; } return !__game.busy; }, null, { timeout: 60000, polling: 500 }); /* clock: measure */
    await installCount(page);
    const at = arg('--at')?.split(',').map(Number) ?? await page.evaluate(() => { const n = __game.npcs.find((x) => /mush/.test(x.def.id)); return [n.pos.x + 2, n.pos.z + 2]; });
    await page.evaluate(([x, z]) => __game.teleport(x, z), at);
    let best = null;
    for (let k = 0; k < 8; k++) {
      await page.evaluate((yaw) => { __game.cam.yaw = yaw; }, (k / 8) * Math.PI * 2);
      await page.waitForTimeout(900); /* clock: measure */
      const r = await page.evaluate(() => window.__countFrame());
      console.log(`  q${q} way ${k}/8: frame ${Math.round(r.pass.main / 1000)}k, shadow ${Math.round(r.pass.shadow / 1000)}k, bloom ${Math.round(r.pass.post / 1000)}k, counter: ${r.fps}`);
      if (!best || r.pass.main > best.pass.main) best = { ...r, yaw: k };
      if (shots) await shot(page, `${shots}/q${q}-king-way${k}.png`);
    }
    if (shots) {
      // the stepping stones of the path near the start, close: what the simplified stones look like underfoot
      await page.evaluate(() => __game.teleport(0, 14));
      for (let k = 0; k < 4; k++) {
        await page.evaluate((yaw) => { __game.cam.yaw = yaw; }, (k / 4) * Math.PI * 2);
        await page.waitForTimeout(900); /* clock: measure */
        await shot(page, `${shots}/q${q}-path-way${k}.png`);
      }
    }
    report(q, at, best);
    await ctx.close();
  }
} finally {
  await browser.close();
  stopServer();
}

/** A picture with no card over the world (a card that came on the way is closed first). */
async function shot(page, path) {
  if (await page.evaluate(() => { const f = document.querySelector('#fanfare'); if (f.classList.contains('hidden')) return false; document.querySelector('#fanfareOk')?.click(); return true; })) await page.waitForTimeout(900); /* clock: measure */
  await page.screenshot({ path });
}

async function installCount(page) {
  await page.evaluate(() => {
    const { renderer, scene } = __game;
    const shadowMaps = () => { const s = new Set(); scene.traverse((o) => { if (o.isLight && o.shadow?.map) s.add(o.shadow.map); }); return s; };
    const owners = () => {
      const m = new Map([[__game.hero.root, 'heroine'], [__game.cat.root, 'cat']]);
      if (__game.pet) m.set(__game.pet.root, 'pet');
      for (const n of __game.npcs ?? []) m.set(n.actor.root, `friend ${n.def.id}`);
      return m;
    };
    window.__countFrame = () => new Promise((resolve) => {
      const own = owners(), maps = shadowMaps(), rows = new Map(), orig = renderer.renderBufferDirect;
      const pass = { main: 0, shadow: 0, post: 0 };
      const wrap = function (cam, sc, geometry, material, object, group) {
        const p = maps.has(renderer.getRenderTarget()) ? 'shadow' : sc !== scene ? 'post' : 'main';
        const per = (geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0) / 3;
        const n = object.isInstancedMesh ? object.count : 1;
        const tris = object.isMesh ? (group ? group.count / 3 : per) * n : 0;
        pass[p] += tris;
        let who = null;
        for (let o = object; o && !who; o = o.parent) who = own.get(o) ?? null;
        const m = object.material && !Array.isArray(object.material) ? object.material : material;
        const map = (m.map?.name || m.map?.source?.data?.src?.split('/').pop() || '').replace(/^tex\//, '').replace(/\.webp$/, '');
        const chain = []; for (let o = object; o && o !== scene; o = o.parent) if (o.name) chain.push(o.name);
        const what = who ?? `${object.isInstancedMesh ? 'inst' : object.isSkinnedMesh ? 'skin' : 'mesh'} ${geometry.name || chain.join('<') || '-'} ${geometry.name ? '' : map || '#' + (m.color?.getHexString() ?? '')} ${Math.round(per)}t`;
        const key = `${p}|${what}`;
        const r = rows.get(key) ?? { pass: p, what, calls: 0, tris: 0, inst: 0, cells: new Set() };
        r.calls++; r.tris += tris; r.inst += n; r.cells.add(object.uuid);
        if (p === 'main') {
          const h = __game.hero.root.position, v = new __game.THREE.Vector3(), mm = new __game.THREE.Matrix4();
          for (let i = 0; i < n; i++) {
            if (object.isInstancedMesh) { object.getMatrixAt(i, mm); v.setFromMatrixPosition(mm).applyMatrix4(object.matrixWorld); } else object.getWorldPosition(v);
            const d = Math.hypot(v.x - h.x, v.z - h.z); r.near = Math.min(r.near ?? 1e9, d); r.far = Math.max(r.far ?? 0, d);
            if (d > 40) r.beyond40 = (r.beyond40 ?? 0) + tris / n;
          }
        }
        rows.set(key, r);
        return orig.apply(this, arguments);
      };
      requestAnimationFrame(() => {
        renderer.renderBufferDirect = wrap;
        requestAnimationFrame(() => {
          renderer.renderBufferDirect = orig;
          resolve({ pass, fps: document.querySelector('#fps').textContent, list: [...rows.values()].map((r) => ({ ...r, cells: r.cells.size })) });
        });
      });
    });
  });
}

function report(q, at, best) {
  const k = (t) => String(Math.round(t / 1000)).padStart(5);
  console.log(`\n=== q${q} at ${at.map((v) => v.toFixed(1))} · the heaviest way ${best.yaw}/8: frame ${Math.round(best.pass.main / 1000)}k + shadow ${Math.round(best.pass.shadow / 1000)}k + bloom ${Math.round(best.pass.post / 1000)}k = ${Math.round((best.pass.main + best.pass.shadow + best.pass.post) / 1000)}k (the counter: ${best.fps})`);
  // the same thing in both passes on one line: frame / shadow
  const by = new Map();
  for (const r of best.list) {
    if (r.pass === 'post') continue;
    const a = by.get(r.what) ?? { main: 0, shadow: 0, calls: 0, inst: 0, cells: 0, near: 0, far: 0, beyond40: 0 };
    a[r.pass] += r.tris; a.calls += r.calls; if (r.pass === 'main') { a.inst = r.inst; a.cells = r.cells; a.near = r.near; a.far = r.far; a.beyond40 = r.beyond40 ?? 0; }
    by.set(r.what, a);
  }
  const list = [...by].sort((x, y) => y[1].main - x[1].main);
  console.log('   frame  shadow  calls  inst  cells  m from her  >40m  what');
  for (const [what, a] of list.slice(0, top)) console.log(`  ${k(a.main)}k ${k(a.shadow)}k  ${String(a.calls).padStart(5)} ${String(a.inst).padStart(5)} ${String(a.cells).padStart(6)}  ${String(Math.round(a.near)).padStart(4)}-${String(Math.round(a.far)).padEnd(4)} ${k(a.beyond40)}k  ${what}`);
  const rest = list.slice(top).reduce((s, [, a]) => [s[0] + a.main, s[1] + a.shadow], [0, 0]);
  console.log(`  ${k(rest[0])}k ${k(rest[1])}k  the other ${Math.max(0, list.length - top)}`);
}
