// node tools/pet-ways.mjs [--worlds fairy,hub,forest] [--q 0] [--out <dir>] [--skip-build] : how the pet keeps up on the worlds' real
// ways (a tool for a person, docs/perf.md «Питомец на дорогах»). The heroine walks as the stick held forward walks her (W, the camera
// turned toward the leg's end: a straight line, as a tap's, src/game/player.ts), leg after leg:
//   - fairy: from the spawn to every friend in turn and back (the published build, dist/);
//   - hub: the stump, the cauldron, each of the five arches and back to the middle (dist/);
//   - forest: every path of the map (src/worlds/forest/layout.ts PATHS), then the maze along its own lines - its trunk
//     (through the right way of each fork), a wrong way of each fork and back, its end (src/worlds/forest/maze.ts geo) - in the grey build (dist-grey/, made here).
// The fawn chosen walks after her (the save of the shop: the first world done). Counted per world, from every frame:
// the times it caught up (src/game/pets.ts CATCH_UP: a jump of more than 1.2 m between two frames), the metres she
// walked, the game seconds, the most it lagged behind her, the share of the time it was more than 3 m off; a leg she
// could not walk (her own way blocked: the tap walks straight) is told and she is put at its end.
// The numbers go to <out>/pet-ways.json and to the log; pictures of every catching up: <out>/<world>-catch-<n>.png.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { GROUPS } from './e2e-saves.mjs';
import { GREY_DIST, serveDir } from './hub-grey.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const worlds = (arg('--worlds') ?? 'fairy,hub,forest').split(',');
const q = Number(arg('--q') ?? 0);
const out = resolve(arg('--out') ?? join(root, 'shots-e2e', 'pet-ways'));
const port = Number(process.env.E2E_PORT || 4183);
mkdirSync(out, { recursive: true });

/** The save: the first world done (the shop's), the fawn found and chosen, the hub toured and its arches awake. */
function save() {
  const s = GROUPS.shop.save();
  const fw = s.worlds.fairy;
  fw.flags = { ...(fw.flags ?? {}), pet: true };
  s.pets = ['fawn']; s.pet = 'fawn';
  s.worlds.hub = { quests: {}, final: false, starsTaken: [], flags: { toured: true, woke1: true, woke2: true }, pos: null };
  return s;
}

const servers = {};
async function serve(dist) {
  if (!servers[dist]) servers[dist] = { server: await serveDir(join(root, dist), port + Object.keys(servers).length), port: port + Object.keys(servers).length };
  return `http://127.0.0.1:${servers[dist].port}/`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
  args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const all = [];
try {
  if (!process.argv.includes('--skip-build') && worlds.some((w) => w !== 'forest')) {
    execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  }
  if (!process.argv.includes('--skip-build') && worlds.includes('forest')) {
    rmSync(join(root, GREY_DIST), { recursive: true, force: true });
    execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'grey', '--outDir', GREY_DIST, '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  }
  for (const world of worlds) all.push(await measure(world));
} finally {
  await browser.close();
  for (const s of Object.values(servers)) s.server.close();
}
writeFileSync(join(out, 'pet-ways.json'), JSON.stringify(all, null, 1));
console.log(`\n${'world'.padEnd(8)} ${'legs'.padStart(5)} ${'walked m'.padStart(9)} ${'game s'.padStart(7)} ${'caught up'.padStart(10)} ${'per 100 m'.padStart(10)} ${'most lag m'.padStart(11)} ${'>3 m'.padStart(6)}  her legs blocked`);
for (const r of all) {
  console.log(`${r.world.padEnd(8)} ${String(r.legs).padStart(5)} ${r.walked.toFixed(0).padStart(9)} ${r.seconds.toFixed(0).padStart(7)} ${String(r.catches.length).padStart(10)} ${(r.catches.length / Math.max(1, r.walked) * 100).toFixed(1).padStart(10)} ${r.lag.toFixed(1).padStart(11)} ${(r.far * 100).toFixed(0).padStart(5)}%  ${r.blocked}`);
  for (const c of r.catches) console.log(`   caught up at ${c.at.join(', ')} (from ${c.from.join(', ')}, ${c.jump} m), leg ${c.leg}: ${c.what}`);
}
console.log(`\n[pet-ways] the numbers: ${join(out, 'pet-ways.json')}`);

/**
 * She walks one leg as a child holding the stick forward walks her (W: forward, as the stick, src/core/input.ts), the
 * camera turned behind her toward the leg's end every tenth of a game second, till she is there. A leg on which she has come
 * no nearer for STALL s of the game is given up: she stands where she stopped. Returns where she is.
 */
async function walk(page, leg, free) {
  const STALL = 3, END = 120000;
  const time = () => page.evaluate(() => __game.time);
  let best = Infinity, since = await time(), scenes = 0, down = false;
  const t0 = Date.now(); /* clock: stuck-guard */
  while (Date.now() - t0 < END) { /* clock: stuck-guard */
    const d = await page.evaluate(([x, z]) => {
      const g = __game, h = g.hero.root.position;
      if (!g.busy) g.cam.yaw = Math.atan2(x - h.x, z - h.z) + Math.PI;
      return { d: Math.hypot(x - h.x, z - h.z), busy: g.busy, t: g.time };
    }, [leg.x, leg.z]);
    // a scene on the way (a friend's greeting): let it end, she goes on
    if (d.busy) {
      if (down) { await page.keyboard.up('KeyW'); down = false; }
      if (++scenes > 3) break;
      await free().catch(() => {}); since = await time(); continue;
    }
    if (d.d < 0.8) break;
    // no nearer for STALL s of the game: her way is blocked
    if (d.d < best - 0.3) { best = d.d; since = d.t; } else if (d.t - since > STALL) break;
    if (!down) { await page.keyboard.down('KeyW'); down = true; }
    await page.waitForFunction((t) => __game.time > t + 0.1, d.t, { timeout: 30000, polling: 'raf' }); /* clock: ceiling */
  }
  if (down) await page.keyboard.up('KeyW');
  const t = await time();
  await page.waitForFunction((t1) => __game.time > t1 + 0.3, t, { timeout: 30000, polling: 'raf' }); /* clock: ceiling */
  return page.evaluate(() => ({ x: __game.hero.root.position.x, z: __game.hero.root.position.z }));
}

async function measure(world) {
  const url = await serve(world === 'forest' ? GREY_DIST : 'dist');
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('amw-save')) localStorage.setItem('amw-save', s);
    for (const k of ['amw-gift-hold', 'amw-deal-hold', 'amw-break-hold', 'amw-mystery-hold', 'amw-trade-hold']) sessionStorage.setItem(k, '1');
  }, JSON.stringify(save()));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${world}] page error: ${e.message}`));
  await page.goto(`${url}?debug&world=${world}&q=${q}`);
  await page.waitForSelector('#play', { state: 'visible', timeout: 120000 }); /* clock: page-load */
  await page.click('#play');
  const free = () => page.waitForFunction(() => {
    const g = window.__game; if (!g) return false;
    if (g.story?.active) { g.story.skip(); return false; }
    if (g.flyoverPlayer?.active) { g.flyoverPlayer.skip(); return false; }
    const f = document.querySelector('#fanfare'); if (f && !f.classList.contains('hidden')) { document.querySelector('#fanfareOk')?.click(); return false; }
    return g.world && !g.busy && !g.transitioning && document.querySelector('#start').classList.contains('hidden');
  }, null, { timeout: 120000, polling: 300 }); /* clock: page-load */
  await free();
  if (!(await page.evaluate(() => !!__game.scene.getObjectByName('pet:fawn')))) throw new Error(`${world}: no fawn after her`);
  // the legs of the world
  const legs = await page.evaluate((w) => {
    const g = __game, h = g.hero.root.position, here = { x: h.x, z: h.z };
    if (w === 'fairy') {
      const by = (id) => { const n = g.npcs.find((x) => x.def.id === id); return { x: n.pos.x + 1.6, z: n.pos.z + 1.6, what: `to ${id}` }; };
      return [...['unicorn', 'fox', 'mushking', 'queen', 'deer'].map(by), { ...here, what: 'back to the spawn' }];
    }
    if (w === 'hub') {
      const arches = g.hub.portals().map((p) => ({ x: p.x * 0.8, z: p.z * 0.8, what: `to the arch ${p.shelf}` }));
      const pot = g.hub.cauldron();
      return [{ x: pot.x, z: pot.z + 1.6, what: 'to the cauldron' }, { x: g.hub.ring().tops[0].x * 1.3, z: g.hub.ring().tops[0].z * 1.3, what: 'to the ring' },
        ...arches, { x: 0, z: 6.5, what: 'back to the middle' }];
    }
    // the forest: every path forward, then the maze along its lines
    const m = g.forestMap, legs = [];
    m.paths.forEach((line, i) => { legs.push({ ...line[0], what: `path ${i}: its start` }); for (let k = 1; k < line.length; k++) legs.push({ ...line[k], what: `path ${i}` }); });
    // the trunk runs from the way in through every right way to the way out (src/game/worldtasks/maze.ts); at each fork
    // she first tries a wrong way to its end and comes back, as a child lost a moment does
    const geo = g.forestMaze.geo, near = (p) => geo.trunk.reduce((b, q, k) => (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(geo.trunk[b].x - p.x, geo.trunk[b].z - p.z) ? k : b), 0);
    const at = new Map(geo.forks.map((f, i) => [near(f.at), i]));
    geo.trunk.forEach((p, k) => {
      legs.push({ x: p.x, z: p.z, what: 'the maze: its trunk' });
      if (!at.has(k)) return;
      const i = at.get(k), f = geo.forks[i], wrong = f.ways.find((w) => !w.right);
      legs.push({ x: f.at.x, z: f.at.z, what: `the maze: fork ${i}` });
      for (const q of wrong.line) legs.push({ x: q.x, z: q.z, what: `the maze: fork ${i}, a wrong way` });
      for (const q of [...wrong.line].reverse()) legs.push({ x: q.x, z: q.z, what: `the maze: fork ${i}, back` });
      legs.push({ x: f.at.x, z: f.at.z, what: `the maze: fork ${i}, back at it` });
    });
    legs.push({ x: geo.end.x, z: geo.end.z, what: 'the maze: its end' });
    return legs;
  }, world);
  // a recorder of every frame: where she and the fawn are, the jumps of the fawn
  await page.evaluate(() => {
    const g = __game, rec = window.__ways = { frames: 0, walked: 0, seconds: 0, lag: 0, far: 0, jumps: [], leg: -1 };
    let last = null, t0 = g.time;
    const tick = () => {
      const pet = g.scene.getObjectByName('pet:fawn'), h = g.hero.root.position;
      // a teleport of hers (a leg she could not walk) and the pet's catching up after it are not counted
      if (rec.skip) { last = null; rec.seconds = g.time - t0; requestAnimationFrame(tick); return; }
      if (pet && !g.busy) {
        const p = pet.position, now = { hx: h.x, hz: h.z, px: p.x, pz: p.z };
        if (last) {
          rec.walked += Math.hypot(now.hx - last.hx, now.hz - last.hz);
          const jump = Math.hypot(now.px - last.px, now.pz - last.pz);
          if (jump > 1.2) rec.jumps.push({ at: [+p.x.toFixed(1), +p.z.toFixed(1)], from: [+last.px.toFixed(1), +last.pz.toFixed(1)], jump: +jump.toFixed(1), leg: rec.leg });
          const d = Math.hypot(now.px - now.hx, now.pz - now.hz);
          rec.lag = Math.max(rec.lag, d); rec.frames++; if (d > 3) rec.far++;
        }
        last = now;
      } else last = null;
      rec.seconds = g.time - t0;
      requestAnimationFrame(tick);
    };
    tick();
  });
  let blocked = 0, shots = 0;
  const told = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const before = await page.evaluate((k) => { window.__ways.leg = k; return window.__ways.jumps.length; }, i);
    const t0 = await page.evaluate(() => __game.time);
    const at = await walk(page, leg, free);
    const dt = await page.evaluate((t) => __game.time - t, t0);
    console.log(`[${world}] leg ${i} ${leg.what}: she is ${Math.hypot(at.x - leg.x, at.z - leg.z).toFixed(1)} m from its end (${dt.toFixed(0)} game s)`);
    if (Math.hypot(at.x - leg.x, at.z - leg.z) > 1.2) {
      blocked++; told.push(`${leg.what} (${leg.x.toFixed(1)}, ${leg.z.toFixed(1)}): she stopped at ${at.x.toFixed(1)}, ${at.z.toFixed(1)}`);
      // her teleport, and the pet's catching up after it (it is then more than 12 m off): not counted
      await page.evaluate(([x, z]) => { window.__ways.skip = true; __game.teleport(x, z); }, [leg.x, leg.z]);
      const t = await page.evaluate(() => __game.time);
      await page.waitForFunction((t0) => __game.time > t0 + 1.5, t, { timeout: 60000 }); /* clock: ceiling */
      await page.evaluate(() => { window.__ways.skip = false; });
    }
    const n = await page.evaluate(() => window.__ways.jumps.length);
    if (n > before && shots < 12) { await page.screenshot({ path: join(out, `${world}-catch-${++shots}.png`) }); }
  }
  const rec = await page.evaluate(() => window.__ways);
  const catches = rec.jumps.map((j) => ({ ...j, what: legs[j.leg]?.what ?? '' }));
  await ctx.close();
  const r = { world, legs: legs.length, walked: rec.walked, seconds: rec.seconds, catches, lag: rec.lag, far: rec.frames ? rec.far / rec.frames : 0, blocked: blocked ? `${blocked}: ${told.join('; ')}` : 0 };
  console.log(`[pet-ways] ${world}: ${legs.length} legs, ${rec.walked.toFixed(0)} m, ${catches.length} caught up`);
  return r;
}
