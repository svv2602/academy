// The way between the hub and the forest (WORLD-01, docs/worlds/hub.md): played by tools/forest-grey.mjs (its step 3b)
// and by tools/worlds.mjs as its parts "hub-grey" (a job of ci.yml, on dist-grey/: `vite build --mode grey`, the forest,
// the sea, the Sweet Land and the Sky Islands in the registry) and "hub-forest" (a job of both workflows, on the published build: the
// forest published 2026-11-24, the sea not yet). What is expected of the arches follows the next worlds of the build
// (`hubExpect`: its dist/worlds.json). The phone size:
//   - the first world done: in the hub the forest's arch wakes and is open, the sea's asleep (src/worlds/hub/portals.ts
//     openArches: an arch wakes once the world before it is done), the cat's sparkles lead to the forest's arch;
//     through it by its action button into the forest, out of the arch of the Great Tree on its central glade
//     (src/worlds/forest/hub-way.ts FROM_HUB), back through that arch to the hub at the forest's arch, facing the tree;
//   - the forest done too: the sea's arch open as well when the build has the sea, asleep (no world behind it) when it
//     has not; the Sweet Land's (shelf 3) and the Sky Islands' (shelf 4) still asleep - they wake once the sea, then the
//     Sweet Land, is done;
//   - with the sea in the build, a save of the forest done whose forest's arch woke already (from before the sea was
//     published): the sea's arch alone wakes, the cat says hub_sea_wake, through it into the sea;
//   - with the Sweet Land in the build, the sea done: the Sweet Land's arch alone wakes, through it and back; with the
//     Sky Islands too, the Sweet Land done: theirs alone wakes (woke4), through it and back;
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

/**
 * What the hub must show for the next worlds `next` of the build (the ids of its dist/worlds.json), the save of the
 * fairies done (`fairies`) and of the forest done too (`forest`): the worlds behind the five arches, the shelves waking
 * on the first entry, the flags of the hub's part of the save after it. The sea's arch (shelf 2) has a world only when
 * the build has the sea (src/worlds/hub/portals.ts portalWorlds, openArches); without it its place sleeps. With the sea,
 * `older`: the forest done and its arch awake already (woke1) - a save from before the sea was published. The Sweet
 * Land's (shelf 3) and the Sky Islands' (shelf 4) arches sleep in these saves, whether the build has them or not: each
 * wakes only once the world before it is done (the sea, the Sweet Land). `sweet`: the sea done too, with the Sweet Land
 * in the build - its arch alone wakes. `sky`: the Sweet Land done too, with the Sky Islands in the build - theirs alone wakes.
 */
export function hubExpect(next) {
  const sea = next.includes('sea');
  return {
    fairies: { arches: ['fairy', 'forest', null, null, null], woke: [1] },
    forest: sea
      ? { arches: ['fairy', 'forest', 'sea', null, null], woke: [1, 2], flags: ['woke1', 'woke2', 'sea_wake'], none: [] }
      : { arches: ['fairy', 'forest', null, null, null], woke: [1], flags: ['woke1'], none: ['woke2', 'sea_wake'] },
    // a save of the forest done whose forest's arch woke before the sea was in the build (an update of the game)
    older: sea ? { woke: [2], flags: ['woke1', 'woke2', 'sea_wake'] } : null,
    // the sea done too, its arch and the forest's awake from the entries before: the Sweet Land's arch (shelf 3) alone
    // wakes, when the build has it (WORLD-04: it wakes once the sea is done, docs/worlds/hub.md)
    sweet: sea && next.includes('sweet') ? { arches: ['fairy', 'forest', 'sea', 'sweet', null], woke: [3], flags: ['woke3'] } : null,
    // the Sweet Land done too, the arches of shelves 1-3 awake from the entries before: the Sky Islands' arch (shelf 4)
    // alone wakes, when the build has them (WORLD-05: it wakes once the Sweet Land is done, docs/worlds/hub.md). The
    // cat's word of it (hub_sky_wake) is said only once the hub's strings have the line (`hubSpoken`): it comes with
    // the voice of the world 5; until then the arch wakes without a word.
    sky: sea && next.includes('sweet') && next.includes('sky')
      ? { arches: ['fairy', 'forest', 'sea', 'sweet', 'sky'], woke: [4], flags: ['woke4'], line: 'hub_sky_wake' } : null,
  };
}

/** The lines the cat says in the hub (src/worlds/hub/strings.ts `spoken`): their keys. */
export function hubSpoken(source = readFileSync(new URL('../src/worlds/hub/strings.ts', import.meta.url), 'utf8')) {
  const at = source.indexOf('spoken:');
  if (at < 0) return [];
  const body = source.slice(at, source.indexOf('}', at));
  return [...body.matchAll(/(\w+):\s*'/g)].map((m) => m[1]);
}

/** The next worlds of the build in `dir`: the ids of its worlds.json (tools/vite-worlds.mjs); [] without one. */
export function buildWorlds(dir) {
  const file = join(dir, 'worlds.json');
  return existsSync(file) ? Object.keys(JSON.parse(readFileSync(file, 'utf8')).worlds ?? {}) : [];
}

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

/**
 * The way between the hub and the forest (see the head of the file), in the build whose next worlds are `next`
 * (`buildWorlds`; the grey build's by default). Returns the problems; prints what was seen.
 */
export async function hubWay(browser, url, shots, { slow = false, next = ['forest', 'sea', 'sweet', 'sky'] } = {}) {
  const want = hubExpect(next);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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
    // a first entry plays the world's scene (its way in) and its tour: both are skipped, as the measurements do
    const inWorld = (id) => until((w) => { if (__game.story?.active) __game.story.skip(); if (__game.flyoverPlayer?.active) __game.flyoverPlayer.skip(); if (!document.querySelector('#fanfare').classList.contains('hidden')) document.querySelector('#fanfareOk')?.click(); return __game.world === w && !__game.transitioning && !__game.busy; }, id, `not in the world "${id}"`);
    const act = async (x, z, what) => {
      await g(([px, pz]) => { __game.teleport(px, pz); }, [x, z]);
      // a tour that starts only once the world's scene is over (the forest's, skipped by inWorld) may begin after inWorld
      // returned: on the runners it still flies when she stands at the arch, so it is skipped here too
      await until(() => {
        if (__game.story?.active) __game.story.skip();
        if (__game.flyoverPlayer?.active) __game.flyoverPlayer.skip();
        return !document.querySelector('#btnAct').classList.contains('hidden');
      }, null, `no action button ${what}`, 20000);
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
    try {
    // ---- the first world done: the forest's arch open, there and back ----
    {
      const name = 'the fairies done';
      const p = await open(name, HUB_SAVES.one());
      if (!same(p.woke, want.fairies.woke)) problems.push(`${name}: the arches waking on the first entry are ${JSON.stringify(p.woke)}, not the forest's`);
      // the forest's arch waking says its word (src/worlds/hub/strings.ts hub_forest_wake), never the sea's
      await p.until(() => __game.line === 'hub_forest_wake', null, `${name}: the cat did not say "hub_forest_wake" as the forest's arch woke`, 30000).catch((e) => problems.push(e.message));
      if ((await p.g(() => __game.line)) === 'hub_sea_wake') problems.push(`${name}: the cat said the sea woke while its arch sleeps`);
      const open1 = await arches(p);
      if (!same(open1, want.fairies.arches)) problems.push(`${name}: the arches lead to ${JSON.stringify(open1)}, not the fairies' and the forest's (the sea's asleep until the forest is done)`);
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
      told.push(`the fairies done: the forest's arch woke and is open, the cat said hub_forest_wake, the sea's asleep, the sparkles to the forest's arch, ${n} draw calls at the arrival; through it into the forest out of the arch of the Great Tree, back to the hub at the forest's arch`);
      await p.ctx.close();
    }
    // ---- the forest done too: the sea's arch open as well ----
    {
      const name = 'the forest done';
      const save = HUB_SAVES.one();
      save.worlds.forest = { quests: {}, final: true, starsTaken: [], flags: {}, pos: null };
      const p = await open(name, save);
      if (!same(p.woke, want.forest.woke)) problems.push(`${name}: the arches waking on the first entry are ${JSON.stringify(p.woke)}, not ${JSON.stringify(want.forest.woke)}`);
      // the word of the arches waking together: the first of them that has one, the forest's (src/worlds/hub/index.ts
      // wakeUp), once; the sea's flag of its word set with woke2 all the same (HEARD_WAKE); without the sea, neither
      await p.until(() => __game.line === 'hub_forest_wake', null, 'the cat did not say "hub_forest_wake" as the arches woke', 30000).catch((e) => problems.push(e.message));
      const flags = await p.g(() => __game.save.worlds.hub?.flags ?? {});
      if (want.forest.flags.some((f) => !flags[f]) || want.forest.none.some((f) => flags[f])) problems.push(`${name}: after waking the hub's flags are ${JSON.stringify(flags)}: ${want.forest.flags.join(', ')} expected${want.forest.none.length ? `, not ${want.forest.none.join(', ')}` : ''}`);
      const open2 = await arches(p);
      if (!same(open2, want.forest.arches)) problems.push(`${name}: the arches lead to ${JSON.stringify(open2)}, not ${JSON.stringify(want.forest.arches)}`);
      const n = await p.calls();
      if (n > 80) problems.push(`${name}: the hub draws ${n} calls at the arrival with ${want.forest.arches.filter(Boolean).length} arches open, more than 80`);
      await p.page.screenshot({ path: join(shots, 'way-hub-forest-done.png') });
      told.push(`the forest done: the arches ${JSON.stringify(want.forest.woke)} woke, the cat said hub_forest_wake, open ${JSON.stringify(open2)}, ${n} draw calls at the arrival`);
      await p.ctx.close();
    }
    // ---- with the sea in the build: a save of the forest done before the sea was published (its arch woke then) ----
    if (want.older) {
      const name = 'the forest done before the sea';
      const save = HUB_SAVES.one();
      save.worlds.forest = { quests: {}, final: true, starsTaken: [], flags: {}, pos: null };
      save.worlds.hub = { ...(save.worlds.hub ?? { quests: {}, final: false, starsTaken: [], pos: null }), flags: { ...(save.worlds.hub?.flags ?? {}), woke1: true } };
      const p = await open(name, save);
      if (!same(p.woke, want.older.woke)) problems.push(`${name}: the arches waking on the entry are ${JSON.stringify(p.woke)}, not ${JSON.stringify(want.older.woke)}`);
      await p.until(() => __game.line === 'hub_sea_wake', null, 'the cat did not say "hub_sea_wake" as the sea\'s arch woke', 30000).catch((e) => problems.push(`${name}: ${e.message}`));
      const flags = await p.g(() => __game.save.worlds.hub?.flags ?? {});
      if (want.older.flags.some((f) => !flags[f])) problems.push(`${name}: after waking the hub's flags are ${JSON.stringify(flags)}: ${want.older.flags.join(', ')} expected`);
      const open3 = await arches(p);
      if (!same(open3, want.forest.arches)) problems.push(`${name}: the arches lead to ${JSON.stringify(open3)}, not ${JSON.stringify(want.forest.arches)}`);
      // through the sea's arch into the sea, as the forest's above: the way the save of an update takes first
      await p.act(HUB_ARCH[2].x * 0.9, HUB_ARCH[2].z * 0.9, 'at the sea\'s arch');
      await p.inWorld('sea');
      await p.page.screenshot({ path: join(shots, 'way-sea-from-hub.png') });
      told.push(`the forest done before the sea: the sea's arch alone woke, the cat said hub_sea_wake, through it into the sea`);
      await p.ctx.close();
    }
    // ---- with the Sweet Land in the build: the sea done, the arches of the forest and the sea awake already ----
    if (want.sweet) {
      const name = 'the sea done';
      const save = HUB_SAVES.one();
      save.worlds.forest = { quests: {}, final: true, starsTaken: [], flags: {}, pos: null };
      save.worlds.sea = { quests: {}, final: true, starsTaken: [], flags: {}, pos: null };
      save.worlds.hub = { ...(save.worlds.hub ?? { quests: {}, final: false, starsTaken: [], pos: null }), flags: { ...(save.worlds.hub?.flags ?? {}), woke1: true, woke2: true, sea_wake: true } };
      const p = await open(name, save);
      if (!same(p.woke, want.sweet.woke)) problems.push(`${name}: the arches waking on the entry are ${JSON.stringify(p.woke)}, not ${JSON.stringify(want.sweet.woke)}`);
      await p.until(() => __game.line === 'hub_sweet_wake', null, 'the cat did not say "hub_sweet_wake" as the Sweet Land\'s arch woke', 30000).catch((e) => problems.push(`${name}: ${e.message}`));
      const flags = await p.g(() => __game.save.worlds.hub?.flags ?? {});
      if (want.sweet.flags.some((f) => !flags[f])) problems.push(`${name}: after waking the hub's flags are ${JSON.stringify(flags)}: ${want.sweet.flags.join(', ')} expected`);
      const open4 = await arches(p);
      if (!same(open4, want.sweet.arches)) problems.push(`${name}: the arches lead to ${JSON.stringify(open4)}, not ${JSON.stringify(want.sweet.arches)}`);
      const goal = await p.g(() => __game.hub.goal());
      if (!goal || Math.hypot(goal.x - HUB_ARCH[3].x, goal.z - HUB_ARCH[3].z) > 2) problems.push(`${name}: the cat's sparkles lead to ${JSON.stringify(goal)}, not to the Sweet Land's arch`);
      const n = await p.calls();
      if (n > 80) problems.push(`${name}: the hub draws ${n} calls at the arrival with four arches open, more than 80`);
      await p.page.screenshot({ path: join(shots, 'way-hub-sea-done.png') });
      // through it into the Sweet Land: she comes out of the Tree's arch on the square, facing away from it (src/worlds/sweet/hub-way.ts)
      await p.act(HUB_ARCH[3].x * 0.9, HUB_ARCH[3].z * 0.9, 'at the Sweet Land\'s arch');
      await p.inWorld('sweet');
      const out = await p.at();
      { const t0 = await p.g(() => __game.time); await p.until((t) => __game.time > t + 1.5, t0, 'the game time stood', 60000); }
      await p.page.screenshot({ path: join(shots, 'way-sweet-from-hub.png') });
      // back by that arch: 7 m behind her where she came out (OUT), its spot 2 m round it - from 1.5 m in front of it
      const OUT = 7;
      await p.act(out.x - Math.sin(out.heading) * (OUT - 1.5), out.z - Math.cos(out.heading) * (OUT - 1.5), 'at the arch of the Great Tree in the Sweet Land');
      await p.inWorld('hub');
      p.near(await p.at(), HUB_ARRIVAL[3], 'back in the hub from the Sweet Land');
      told.push(`the sea done: the Sweet Land's arch alone woke, the cat said hub_sweet_wake, open ${JSON.stringify(open4)}, the sparkles to it, ${n} draw calls at the arrival; through it into the Sweet Land and back to the hub at its arch`);
      await p.ctx.close();
    }
    // ---- with the Sky Islands in the build: the Sweet Land done, the arches of shelves 1-3 awake already ----
    if (want.sky) {
      const name = 'the Sweet Land done';
      const save = HUB_SAVES.one();
      for (const id of ['forest', 'sea', 'sweet']) save.worlds[id] = { quests: {}, final: true, starsTaken: [], flags: {}, pos: null };
      save.worlds.hub = { ...(save.worlds.hub ?? { quests: {}, final: false, starsTaken: [], pos: null }), flags: { ...(save.worlds.hub?.flags ?? {}), woke1: true, woke2: true, woke3: true, sea_wake: true } };
      const p = await open(name, save);
      if (!same(p.woke, want.sky.woke)) problems.push(`${name}: the arches waking on the entry are ${JSON.stringify(p.woke)}, not ${JSON.stringify(want.sky.woke)}`);
      const said = hubSpoken().includes(want.sky.line);
      if (said) await p.until((k) => __game.line === k, want.sky.line, `the cat did not say "${want.sky.line}" as the Sky Islands' arch woke`, 30000).catch((e) => problems.push(`${name}: ${e.message}`));
      const flags = await p.g(() => __game.save.worlds.hub?.flags ?? {});
      if (want.sky.flags.some((f) => !flags[f])) problems.push(`${name}: after waking the hub's flags are ${JSON.stringify(flags)}: ${want.sky.flags.join(', ')} expected`);
      const open5 = await arches(p);
      if (!same(open5, want.sky.arches)) problems.push(`${name}: the arches lead to ${JSON.stringify(open5)}, not ${JSON.stringify(want.sky.arches)}`);
      const goal = await p.g(() => __game.hub.goal());
      if (!goal || Math.hypot(goal.x - HUB_ARCH[4].x, goal.z - HUB_ARCH[4].z) > 2) problems.push(`${name}: the cat's sparkles lead to ${JSON.stringify(goal)}, not to the Sky Islands' arch`);
      const n = await p.calls();
      if (n > 80) problems.push(`${name}: the hub draws ${n} calls at the arrival with five arches open, more than 80`);
      await p.page.screenshot({ path: join(shots, 'way-hub-sweet-done.png') });
      // through it into the Sky Islands: she comes out of the Tree's arch on the castle island, facing its middle (src/worlds/sky/hub-way.ts)
      await p.act(HUB_ARCH[4].x * 0.9, HUB_ARCH[4].z * 0.9, 'at the Sky Islands\' arch');
      await p.inWorld('sky');
      const out = await p.at();
      { const t0 = await p.g(() => __game.time); await p.until((t) => __game.time > t + 1.5, t0, 'the game time stood', 60000); }
      await p.page.screenshot({ path: join(shots, 'way-sky-from-hub.png') });
      // back by that arch: 7 m behind her where she came out (OUT), its spot 2 m round it - from 1.5 m in front of it
      const OUT = 7;
      await p.act(out.x - Math.sin(out.heading) * (OUT - 1.5), out.z - Math.cos(out.heading) * (OUT - 1.5), 'at the arch of the Great Tree in the Sky Islands');
      await p.inWorld('hub');
      p.near(await p.at(), HUB_ARRIVAL[4], 'back in the hub from the Sky Islands');
      told.push(`the Sweet Land done: the Sky Islands' arch alone woke, ${said ? `the cat said ${want.sky.line}` : `no word yet (no ${want.sky.line} in the hub's strings)`}, open ${JSON.stringify(open5)}, the sparkles to it, ${n} draw calls at the arrival; through it into the Sky Islands and back to the hub at its arch`);
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

