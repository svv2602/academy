// The way between the hub and the forest in the grey build (WORLD-01, docs/worlds/hub.md): played by
// tools/forest-grey.mjs (its step 3b) and by tools/worlds.mjs as its part "hub-grey" (a job of CI), on dist-grey/
// (`vite build --mode grey`, the registry lists the forest, the sea and the Sweet Land in that mode only). The phone size:
//   - the first world done: in the hub the forest's arch wakes and is open, the sea's asleep (src/worlds/hub/portals.ts
//     openArches: an arch wakes once the world before it is done), the cat's sparkles lead to the forest's arch;
//     through it by its action button into the forest, out of the arch of the Great Tree on its central glade
//     (src/worlds/forest/hub-way.ts FROM_HUB), back through that arch to the hub at the forest's arch, facing the tree;
//   - the forest done too: the sea's arch open as well; the Sweet Land's (shelf 3) still asleep - it wakes once the sea is done;
//   - in both, the hub's draw calls at the arrival at the fairies' arch, q2: 80 at most (TECH-06);
//   - without network, the forest's files never cached (refused to the page from the start): the forest's arch
//     refuses - the game stays in the hub, the frame never closes, the cat says "need_net" (src/main.ts `refuse`).
// Pictures <shots>/way-*.png.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { HUB_SAVES } from './e2e-saves.mjs';

/** The folder of the grey build. */
export const GREY_DIST = 'dist-grey';

/** Where she arrives in the hub from the world of a place of the shelf: 6 m inside its arch, facing the tree (layout.ts). */
export const HUB_ARRIVAL = [0, 1, 2, 3, 4].map((shelf) => {
  const a = (shelf / 5) * Math.PI * 2, d = 12.5 - 6;
  return { x: Math.sin(a) * d, z: Math.cos(a) * d, facing: a + Math.PI };
});
/** The arch of a place of the shelf, where its action spot is (layout.ts PORTALS, r 12.5). */
export const HUB_ARCH = [0, 1, 2, 3, 4].map((shelf) => { const a = (shelf / 5) * Math.PI * 2; return { x: Math.sin(a) * 12.5, z: Math.cos(a) * 12.5 }; });

/** Serves `dir` on 127.0.0.1:`port` as static hosting does: a missing file is a 404. Resolves with the server; a busy port rejects. */
export async function serveDir(dir, port) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' };
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(dir, path));
    if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  });
  await new Promise((r, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', r); });
  return server;
}

/** The way between the hub and the forest (see the head of the file). Returns the problems; prints what was seen. */
export async function hubWay(browser, url, shots, { slow = false } = {}) {
  /** ms of a wait: on the runners' software rendering (about a frame a second) four times as long. */
  const T = (ms) => (slow ? ms * 4 : ms);
  mkdirSync(shots, { recursive: true });
  const problems = [], told = [];
  const open = async (name, save, { noForest = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await ctx.addInitScript((s) => { if (!localStorage.getItem('amw-save')) localStorage.setItem('amw-save', s); for (const k of ['amw-gift-hold', 'amw-deal-hold', 'amw-break-hold', 'amw-mystery-hold']) sessionStorage.setItem(k, '1'); }, JSON.stringify(save));
    // the forest's own files never reach the page: its download (the next world's, while the hub is played) fails
    if (noForest) await ctx.route((u) => /\/(models|voice|frames)\/forest\//.test(u.pathname), (r) => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${name}: pageerror: ${e.message}`));
    const g = (fn, arg) => page.evaluate(fn, arg);
    const until = (fn, arg, what, ms = 120000) => page.waitForFunction(fn, arg, { timeout: T(ms), polling: 200 }).catch(() => { throw new Error(`${name}: ${what}`); }); /* clock: helper */
    const inWorld = (id) => until((w) => { if (__game.flyoverPlayer?.active) __game.flyoverPlayer.skip(); if (!document.querySelector('#fanfare').classList.contains('hidden')) document.querySelector('#fanfareOk')?.click(); return __game.world === w && !__game.transitioning && !__game.busy; }, id, `not in the world "${id}"`);
    const act = async (x, z, what) => {
      await g(([px, pz]) => { __game.teleport(px, pz); }, [x, z]);
      await until(() => !document.querySelector('#btnAct').classList.contains('hidden'), null, `no action button ${what}`, 20000);
      await page.locator('#btnAct').dispatchEvent('pointerdown');   // as tools/shot.mjs presses it: the button breathes
    };
    const at = () => g(() => ({ x: __game.hero.root.position.x, z: __game.hero.root.position.z, heading: __game.hero.heading }));
    const near = (p, want, what) => { if (Math.hypot(p.x - want.x, p.z - want.z) > 1.5 || Math.cos(p.heading - want.facing) < 0.9) problems.push(`${name}: ${what}: she stands at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} facing ${p.heading.toFixed(2)}, not at ${want.x.toFixed(1)}, ${want.z.toFixed(1)} facing ${want.facing.toFixed(2)}`); };
    const calls = async () => {
      await g(() => { const G = __game; G.teleport(0, 6.5); G.hero.heading = Math.PI; G.hero.root.rotation.y = Math.PI; G.cam.yaw = 0; });
      const t0 = await g(() => __game.time);
      await until((t) => __game.time > t + 1, t0, 'the game time stood', 60000);
      return g(() => __game.renderer.info.render.calls);
    };
    await page.goto(`${url}?debug&world=hub&q=2`);
    await page.locator('#play').waitFor({ state: 'visible', timeout: T(240000) }); /* clock: page-load */
    await page.click('#play');
    await inWorld('hub');
    // the arches whose world opened wake once she is free (src/worlds/hub/index.ts): which, and let them
    const woke = await g(() => __game.hub.wake().shelves);
    await until(() => { const w = __game.hub.wake(); return w.shelves.length === 0 || (w.t >= 1 && !w.on && !__game.busy); }, null, 'the arches did not finish waking', 60000)
      .catch(async (e) => { throw new Error(`${e.message}: ${JSON.stringify(await g(() => ({ wake: __game.hub.wake(), busy: __game.busy, paused: __game.paused, line: __game.line, tour: __game.flyoverPlayer?.active, started: typeof __game.started === 'function' ? __game.started() : null })))}`); });
    return { ctx, page, g, until, inWorld, act, at, near, calls, woke };
  };
  const arches = (p) => p.g(() => __game.hub.portals().map((a) => a.world));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  try {
    // ---- the first world done: the forest's arch open, there and back ----
    {
      const name = 'the fairies done';
      const p = await open(name, HUB_SAVES.one());
      if (JSON.stringify(p.woke) !== '[1]') problems.push(`${name}: the arches waking on the first entry are ${JSON.stringify(p.woke)}, not the forest's`);
      if ((await p.g(() => __game.line)) === 'hub_sea_wake') problems.push(`${name}: the cat said the sea woke while its arch sleeps`);
      const open1 = await arches(p);
      if (!same(open1, ['fairy', 'forest', null, null, null])) problems.push(`${name}: the arches lead to ${JSON.stringify(open1)}, not the fairies' and the forest's (the sea's asleep until the forest is done)`);
      const goal = await p.g(() => __game.hub.goal());
      if (!goal || Math.hypot(goal.x - HUB_ARCH[1].x, goal.z - HUB_ARCH[1].z) > 2) problems.push(`${name}: the cat's sparkles lead to ${JSON.stringify(goal)}, not to the forest's arch`);
      const n = await p.calls();
      if (n > 80) problems.push(`${name}: the hub draws ${n} calls at the arrival, more than 80`);
      await p.page.screenshot({ path: join(shots, 'way-hub-two-open.png') });
      await p.act(HUB_ARCH[1].x * 0.9, HUB_ARCH[1].z * 0.9, 'at the forest\'s arch');
      await p.inWorld('forest');
      const map = await p.g(() => JSON.parse(JSON.stringify(__game.forestMap.landmarks.center)));
      const FACING = 0.4, OUT = 7;   // src/worlds/forest/hub-way.ts
      const fromHub = { x: map.x + Math.sin(FACING) * OUT, z: map.z + Math.cos(FACING) * OUT, facing: FACING };
      p.near(await p.at(), fromHub, 'in the forest from the hub');
      // the camera comes down behind her (the tour of a first entry skipped)
      { const t0 = await p.g(() => __game.time); await p.until((t) => __game.time > t + 1.5, t0, 'the game time stood', 60000); }
      await p.page.screenshot({ path: join(shots, 'way-forest-from-hub.png') });
      // back by the arch of the Great Tree: its spot is the arch itself, she steps up to it from the glade
      await p.act(map.x + Math.sin(FACING) * 1.5, map.z + Math.cos(FACING) * 1.5, 'at the arch of the Great Tree in the forest');
      await p.inWorld('hub');
      p.near(await p.at(), HUB_ARRIVAL[1], 'back in the hub');
      await p.page.screenshot({ path: join(shots, 'way-hub-back.png') });
      told.push(`the fairies done: the forest's arch woke and is open, the sea's asleep, the sparkles to the forest's arch, ${n} draw calls at the arrival; through it into the forest out of the arch of the Great Tree, back to the hub at the forest's arch`);
      await p.ctx.close();
    }
    // ---- the forest done too: the sea's arch open as well ----
    {
      const name = 'the forest done';
      const save = HUB_SAVES.one();
      save.worlds.forest = { quests: {}, final: true, starsTaken: [], flags: {}, pos: null };
      const p = await open(name, save);
      if (JSON.stringify(p.woke) !== '[1,2]') problems.push(`${name}: the arches waking on the first entry are ${JSON.stringify(p.woke)}, not the forest's and the sea's`);
      // the word of the arches waking: the sea's (the forest has none yet), once, and its flag of the word set with woke2
      await p.until(() => __game.line === 'hub_sea_wake', null, 'the cat did not say "hub_sea_wake" as the arches woke', 30000).catch((e) => problems.push(e.message));
      const flags = await p.g(() => __game.save.worlds.hub?.flags ?? {});
      if (!flags.woke1 || !flags.woke2 || !flags.sea_wake) problems.push(`${name}: after waking the hub's flags are ${JSON.stringify(flags)}: woke1, woke2 and sea_wake expected`);
      const open2 = await arches(p);
      if (!same(open2, ['fairy', 'forest', 'sea', null, null])) problems.push(`${name}: the arches lead to ${JSON.stringify(open2)}, not the fairies', the forest's and the sea's`);
      const n = await p.calls();
      if (n > 80) problems.push(`${name}: the hub draws ${n} calls at the arrival with three arches open, more than 80`);
      await p.page.screenshot({ path: join(shots, 'way-hub-three-open.png') });
      told.push(`the forest done: the forest's and the sea's arches woke, the cat said hub_sea_wake, the sea's open too, ${n} draw calls at the arrival`);
      await p.ctx.close();
    }
    // ---- without network, the forest never downloaded: refused at its arch ----
    {
      const name = 'no network';
      const p = await open(name, HUB_SAVES.one(), { noForest: true });
      await p.ctx.setOffline(true);
      // the frames of the transition's layer drawn so far: a refused change draws none (src/game/travel.ts, step 0)
      const layer = await p.g(() => __game.fade.frames);
      await p.act(HUB_ARCH[1].x * 0.9, HUB_ARCH[1].z * 0.9, 'at the forest\'s arch');
      await p.until(() => __game.line === 'need_net', null, 'the cat did not say "need_net"', 30000).catch((e) => problems.push(e.message));
      const after = await p.g(() => ({ world: __game.world, frames: __game.fade.frames, phase: __game.fade.phase, going: __game.transitioning }));
      if (after.world !== 'hub') problems.push(`${name}: the game went to "${after.world}" without network`);
      if (after.frames !== layer || after.phase !== 'idle' || after.going) problems.push(`${name}: the frame was touched by a refused change (${layer} -> ${after.frames} frames of the layer, phase ${after.phase}, changing: ${after.going})`);
      told.push('without network and without the forest\'s files: the forest\'s arch refused, the game stayed in the hub, the frame never closed, the cat said "need_net"');
      await p.ctx.close();
    }
  } catch (e) {
    problems.push(e.message);
  }
  console.log(`[grey] the way between the hub and the forest: ${told.join('; ')}; pictures ${shots}/way-*.png`);
  return problems;
}

