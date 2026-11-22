// The grey build of the forest (WORLD-12): its walkthrough and its measurements.
//
//   node tools/forest-grey.mjs [--scales 1.6] [--q 2] [--no-pass] [--no-measure] [--out <dir>]   (the chosen stretch is 1.6)
//   --q: the quality the measurements are made in (`?q=`, 0-2; 2 by default): a look is measured on q2 and q0
//
// 1. `vite build --mode grey --outDir dist-grey`: the registry lists the forest in that mode only (src/worlds/index.ts).
//    The build must fit the size budget (tools/dist-size.mjs): the forest's own models (models/forest/, from
//    worlds-data/forest/ - tools/assets.mjs, vite.config.ts `greyFiles`) count as a next world's, apart from the core.
// 2. dist-grey/ served on E2E_PORT (4183 by default).
// 3. The walkthrough every world shares, by the forest's description, from its entry to its finale (tools/world-pass.mjs,
//    E2E_WORLD=forest E2E_WORLD_NEED=grey, the phone size); pictures in shots-e2e/forest-grey/. --no-pass leaves it out.
//    The page itself must have asked for every file of the forest's own models (models/forest/…): a model the world
//    never loads would only weigh on the download of the world.
// 4. For every stretch of the map in --scales (`?scale=`, src/worlds/forest/layout.ts), in the phone size:
//    - the time on foot of every path of the map: she runs it with the key held, turned along the path at every frame,
//      timed in game seconds; next to it, the length of the path over her top speed;
//    - from every target of the route (src/worlds/forest/layout.ts ROUTE), whether the landmark of the next one is seen:
//      the camera behind her, turned to it, a ray from the camera to points of the landmark - seen when the first thing
//      the ray meets is the landmark itself;
//    - the draw calls and the triangles at every target and at every point of the tour: the heaviest is the one to
//      measure on the S22 (TECH-06);
//    - a picture from every target toward the next one, and from every point of the tour;
//    all of it with the magic of the forest at 1 (WORLD-09, src/worlds/forest/magic.ts): the most it draws. On q2
//    a point over BUDGET (triangles or draw calls) fails the run;
//    - the magic (WORLD-09): from MAGIC_POINT of the tour, the world still, pictures at the magic 0, 0 again, 0.48
//      (three leaves) and 1 - 0 and 1 differ over the whole and over the sky by more than MAGIC_DIFF, and by more than
//      MAGIC_DIFF.same times two pictures of the same magic; else the run fails. Then from MAGIC_NEAR_POINT, over the
//      village, at 0, 0.48 and 1 for the eye alone (magic-near-*.png).
//    The numbers go to <out>/measures.json and to the log; <out> is shots-e2e/forest-grey by default.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { checkDistSize, sizeSummary } from './dist-size.mjs';
import { MAGIC_DIFF, pictureDiffs } from './picture-diff.mjs';
import { greyWorldFiles } from './vite-worlds.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = 'dist-grey';

/** The arguments: { scales, q, pass, measure, out } or { error }. */
export function readArgs(argv) {
  const o = { scales: [1.6], q: 2, pass: true, measure: true, out: join(root, 'shots-e2e', 'forest-grey') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-pass') o.pass = false;
    else if (a === '--no-measure') o.measure = false;
    else if (a === '--scales') {
      const v = (argv[++i] ?? '').split(',').map(Number);
      if (!v.length || v.some((x) => !(x >= 0.5 && x <= 3))) return { error: '--scales takes numbers 0.5-3, e.g. 1,1.6' };
      o.scales = v;
    } else if (a === '--q') {
      const v = Number(argv[++i]);
      if (![0, 1, 2].includes(v)) return { error: '--q takes 0, 1 or 2' };
      o.q = v;
    } else if (a === '--out') { const v = argv[++i]; if (!v) return { error: '--out needs a folder' }; o.out = resolve(v); }
    else return { error: `unknown argument "${a}"` };
  }
  return o;
}

/** The legs of a route: consecutive targets, each pair once. */
export function routeLegs(route) {
  const legs = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    if (!legs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) legs.push([a, b]);
  }
  return legs;
}

/** The line of points from zone `a` to zone `b` among `paths` (either way round), or null. */
export function pathBetween(paths, zones, a, b) {
  const same = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-6;
  for (const p of paths) {
    if (same(p[0], zones[a]) && same(p[p.length - 1], zones[b])) return p;
    if (same(p[0], zones[b]) && same(p[p.length - 1], zones[a])) return [...p].reverse();
  }
  return null;
}

/**
 * m from the end of a path where she has come: the end of a path is the middle of its zone - the Oak's is its trunk
 * (its radius 2.1 m and hers 0.4 keep her 2.5 m away).
 */
export const REACHED = 3.5;

/** The frame budget of a point of the forest on q2 (the lead's, 2026-11-21): triangles and draw calls. */
export const BUDGET = { tris: 600000, calls: 112 };
/** The point of the tour (0-based) the pictures of the magic are taken from: over the central glade to the Oak - the sky, the paths and the glades in the frame. */
export const MAGIC_POINT = 0;
/** The magic of the pictures (the third - three leaves given back) and the names of their files. */
export const MAGIC_PICTURES = [[0, 'magic-0'], [0, 'magic-0-again'], [0.48, 'magic-0_48'], [1, 'magic-1']];
/** The point of the tour (0-based) pictured once more at 0, 0.48 and 1 for the eye alone: over the village, its windows and lanterns near. */
export const MAGIC_NEAR_POINT = 2;

/** The points of `views` and `tour` over BUDGET: their names and numbers. */
export function overBudget(views, tour, budget = BUDGET) {
  return [...views.map((v) => ({ at: `${v.from} -> ${v.to}`, calls: v.calls, tris: v.tris })), ...tour.map((t) => ({ at: `tour ${t.point}`, calls: t.calls, tris: t.tris }))]
    .filter((p) => p.tris > budget.tris || p.calls > budget.calls);
}

export const lengthOf = (line) => line.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - line[i].x, p.z - line[i].z), 0);

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.error) { console.error(`[grey] ${args.error}\nUsage: node tools/forest-grey.mjs [--scales 1,1.6] [--q 2] [--no-pass] [--no-measure] [--out <dir>]`); process.exit(2); }
  const port = Number(process.env.E2E_PORT || 4183);
  const dist = join(root, DIST);
  // ---- 1. the grey build ----
  rmSync(dist, { recursive: true, force: true });
  execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'grey', '--outDir', DIST], { cwd: root, stdio: 'inherit' });
  let failed = false;
  const size = checkDistSize(dist);
  console.log(`[grey] the size of the build: ${sizeSummary(size)}`);
  if (size.problems.length) { console.log(`[grey] over the budget:\n  ${size.problems.join('\n  ')}`); failed = true; }
  // ---- 2. served ----
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' };
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(dist, path));
    if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const url = `http://127.0.0.1:${port}/`;
  console.log(`[grey] ${DIST}/ served on ${url}`);
  // ---- 3. the walkthrough ----
  if (args.pass) {
    const shots = join('shots-e2e', 'forest-grey');
    mkdirSync(join(root, shots), { recursive: true });
    const modelsOut = join(root, shots, 'models-requested-mobile.json');
    rmSync(modelsOut, { force: true });
    const env = { ...process.env, E2E_WORLD: 'forest', E2E_WORLD_NEED: 'grey', E2E_WORLD_OUT: join(root, shots, 'pass-mobile.json'), E2E_MODELS_OUT: modelsOut, E2E_ONLY: '', E2E_MUTE: '0' };
    const code = await new Promise((r) => spawn(process.execPath, [join(root, 'tools/shot.mjs'), url, shots, 'mobile'], { cwd: root, stdio: 'inherit', env }).on('exit', r));
    console.log(`[grey] the walkthrough of the forest by its description (phone): ${code === 0 ? 'ok' : `FAILED (code ${code})`}`);
    if (code !== 0) failed = true;
    // every file of the forest's own models asked for by the page in the walkthrough
    const own = Object.keys(greyWorldFiles(['forest'], {}, root)).filter((p) => p.startsWith('models/forest/'));
    const asked = existsSync(modelsOut) ? new Set(JSON.parse(readFileSync(modelsOut, 'utf8'))) : new Set();
    const never = own.filter((p) => !asked.has(p));
    console.log(`[grey] the forest's own models: ${own.length - never.length} of ${own.length} asked for by the page${never.length ? `; never: ${never.join(', ')}` : ''}`);
    if (!own.length || never.length) failed = true;
  }
  // ---- 4. the measurements ----
  if (!args.measure) { server.close(); process.exit(failed ? 1 : 0); }
  mkdirSync(args.out, { recursive: true });
  const gl = process.env.E2E_GL === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=gl', '--enable-gpu'];
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: [...gl, '--ignore-gpu-blocklist', '--mute-audio'] });
  const all = [];
  try {
    for (const scale of args.scales) all.push(await measure(browser, url, scale, args.out, args.q));
  } finally { await browser.close(); server.close(); }
  writeFileSync(join(args.out, 'measures.json'), JSON.stringify(all, null, 1));
  if (all.some((m) => m.failed)) failed = true;
  console.log(`[grey] the numbers: ${join(args.out, 'measures.json')}`);
  process.exit(failed ? 1 : 0);
}

/** The measurements of one stretch of the map (see the head of the file). */
async function measure(browser, url, scale, out, q = 2) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[grey] pageerror', e.message));
  await page.addInitScript(() => { for (const k of ['amw-gift-hold', 'amw-break-hold', 'amw-mystery-hold']) sessionStorage.setItem(k, '1'); });
  await page.goto(`${url}?debug&q=${q}&world=forest&scale=${scale}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#play', { state: 'visible', timeout: 120000 });
  await page.click('#play');
  await page.waitForFunction(() => { const g = window.__game; if (!g) return false; if (g.story?.active) { g.story.skip(); return false; } if (g.flyoverPlayer?.active) { g.flyoverPlayer.skip(); return false; } return !g.busy; }, null, { timeout: 180000, polling: 300 });
  await page.evaluate(() => { for (const s of ['#debug', '#fps', '.debug', '#bubble']) document.querySelectorAll(s).forEach((e) => (e.style.visibility = 'hidden')); });
  const map = await page.evaluate(() => JSON.parse(JSON.stringify(__game.forestMap)));
  // all the magic: the most the forest draws (the rays, the butterflies, every firefly) - the frame to measure
  await page.evaluate(() => __game.setMagic(1));
  if (Math.abs(map.scale - scale) > 1e-9) throw new Error(`the page plays the scale ${map.scale}, not ${scale}`);
  const tag = `x${String(scale).replace('.', '_')}`;
  /** Seconds of game time, waited for frame by frame. */
  const settle = (s) => page.evaluate((s) => new Promise((r) => { const t0 = __game.time; const f = () => (__game.time - t0 >= s ? r() : requestAnimationFrame(f)); f(); }), s);
  /** She stands at `a`, faced toward `b` (the camera behind her). */
  const stand = (a, b) => page.evaluate(([a, b]) => { __game.teleport(a.x, a.z); const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); __game.cam.yaw = yaw; __game.hero.heading = yaw + Math.PI; }, [a, b]);
  const draw = () => page.evaluate(() => ({ calls: __game.renderer.info.render.calls, tris: __game.renderer.info.render.triangles }));
  const speed = await page.evaluate(() => __game.tuning.speed);

  // the paths on foot
  const legs = [];
  for (const [a, b] of routeLegs(map.route)) {
    const line = pathBetween(map.paths, map.zones, a, b);
    if (!line) throw new Error(`no path of the map from "${a}" to "${b}"`);
    const len = lengthOf(line);
    await stand(line[0], line[1]); await settle(0.5);
    await page.keyboard.down('KeyW');
    const run = await page.evaluate(([line, REACHED]) => new Promise((done) => {
      const t0 = __game.time, hp = __game.hero.root.position;
      let i = 1, mark = { t: t0, x: hp.x, z: hp.z }, stuck = false;
      const f = () => {
        // stuck: less than half a metre in 3 s of game time (a trunk, a character, a house on the way)
        if (__game.time - mark.t > 3) { stuck = Math.hypot(hp.x - mark.x, hp.z - mark.z) < 0.5; mark = { t: __game.time, x: hp.x, z: hp.z }; }
        while (i < line.length - 1 && Math.hypot(line[i].x - hp.x, line[i].z - hp.z) < 2) i++;
        const p = line[i];
        __game.cam.yaw = Math.atan2(-(p.x - hp.x), -(p.z - hp.z));
        const end = line[line.length - 1], left = Math.hypot(end.x - hp.x, end.z - hp.z);
        if (left < REACHED || stuck || __game.time - t0 > 90) done({ s: __game.time - t0, left, at: { x: +hp.x.toFixed(1), z: +hp.z.toFixed(1) } }); else requestAnimationFrame(f);
      };
      f();
    }), [line, REACHED]);
    await page.keyboard.up('KeyW');
    legs.push({ from: a, to: b, metres: +len.toFixed(1), byLength: +(len / speed).toFixed(1), walked: +run.s.toFixed(1), reached: run.left < REACHED, stopped: run.left < REACHED ? null : run.at });
    console.log(`[grey]   ${a} -> ${b}: ${run.left < REACHED ? `${run.s.toFixed(1)} s` : `stopped at ${run.at.x}, ${run.at.z}, ${run.left.toFixed(1)} m short`}`);
  }
  // from every target: the next landmark seen, the draw, a picture
  const views = [];
  for (let i = 0; i < map.route.length - 1; i++) {
    const a = map.route[i], b = map.route[i + 1];
    if (views.some((v) => v.from === a && v.to === b)) continue;
    const line = pathBetween(map.paths, map.zones, a, b);
    await stand(map.zones[a], line[1]); await settle(1.2);
    const seen = await page.evaluate(([b, lm]) => {
      const { THREE, scene, camera } = __game;
      const named = (o, name) => { for (let x = o; x; x = x.parent) if (x.name === name) return true; return false; };
      // what counts as the landmark of the target: the village is its tower and its red caps
      const names = { center: ['landmark-center'], oak: ['landmark-oak'], village: ['landmark-village', 'house-caps'], owl: ['landmark-owl'], maze: ['landmark-maze'], stream: ['landmark-ash'], grove: ['landmark-grove', 'crowns-grove'], ash: ['landmark-ash'] }[b];
      const skip = (o) => { for (let x = o; x; x = x.parent) if (x === __game.hero.root || x === __game.cat.root) return true; return false; };
      const targets = scene.children.filter((o) => o.visible && !skip(o));
      const ray = new THREE.Raycaster(), from = camera.position.clone();
      let hits = 0;
      const met = [];
      const nameOf = (o) => { for (let x = o; x; x = x.parent) if (x.name) return x.name; return o.type; };
      const tops = [lm.top, lm.top - 1, lm.top - 2].map((y) => new THREE.Vector3(lm.x, __game.forestMap.ground(lm.x, lm.z) + y, lm.z));
      // and the middle of the zone at the height of a roof (the village's caps, the arches)
      const z = __game.forestMap.zones[b];
      tops.push(new THREE.Vector3(z.x, __game.forestMap.ground(z.x, z.z) + 3.3, z.z));
      for (const p of tops) {
        const dir = p.clone().sub(from); const far = dir.length(); dir.normalize();
        ray.set(from, dir); ray.far = far + 8;
        const first = ray.intersectObjects(targets, true).find((h) => (h.object.isMesh || h.object.isInstancedMesh) && h.object.material?.visible !== false);
        if (first && names.some((n) => named(first.object, n))) hits++;
        met.push(first ? `${nameOf(first.object)}@${first.distance.toFixed(0)}` : 'nothing');
      }
      return { hits, of: tops.length, metres: +from.distanceTo(tops[0]).toFixed(0), met };
    }, [b, map.landmarks[b]]);
    const d = await draw();
    await page.screenshot({ path: join(out, `${tag}-from-${a}-to-${b}.png`) });
    views.push({ from: a, to: b, seen: seen.hits > 0, rays: `${seen.hits}/${seen.of}`, metres: seen.metres, met: seen.met, ...d });
  }
  // the tour
  const tour = [];
  const points = await page.evaluate(() => __game.flyoverPoints.length);
  await page.evaluate(() => __game.flyover());
  await page.waitForFunction(() => __game.flyoverPlayer.active, null, { timeout: 10000 });
  for (let i = 0; i < points; i++) {
    await page.evaluate((i) => __game.flyoverPlayer.hold(i), i);
    await settle(0.4);
    tour.push({ point: i + 1, ...(await draw()) });
    await page.screenshot({ path: join(out, `${tag}-tour-${i + 1}.png`) });
  }
  // the magic: the camera on its point, the world still (no game time: the fireflies and the butterflies stand), so two
  // pictures of the same magic differ by nothing that lives in the frame
  await page.evaluate((i) => __game.flyoverPlayer.hold(i), MAGIC_POINT);
  await settle(0.6);
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const pics = [];
  await page.evaluate(() => __game.still(true));
  try {
    for (const [m, name] of MAGIC_PICTURES) {
      await page.evaluate((m) => __game.setMagic(m), m);
      await frames();
      pics.push((await page.screenshot({ path: join(out, `${tag}-${name}.png`) })).toString('base64'));
    }
    await page.evaluate((i) => __game.flyoverPlayer.hold(i), MAGIC_NEAR_POINT);
    await page.evaluate(() => __game.still(false));
    await settle(0.6);
    await page.evaluate(() => __game.still(true));
    for (const m of [0, 0.48, 1]) {
      await page.evaluate((m) => __game.setMagic(m), m);
      await frames();
      await page.screenshot({ path: join(out, `${tag}-magic-near-${String(m).replace('.', '_')}.png`) });
    }
  } finally { await page.evaluate(() => { __game.still(false); __game.setMagic(null); }); }
  const [all, sky, same, half] = await pictureDiffs(page, pics, [[0, 3, 1], [0, 3, 0.2], [0, 1, 1], [0, 2, 1]]);
  const magic = { point: MAGIC_POINT + 1, all: +all.toFixed(4), sky: +sky.toFixed(4), same: +same.toFixed(4), half: +half.toFixed(4) };
  magic.ok = all > MAGIC_DIFF.all && sky > MAGIC_DIFF.sky && all > same * MAGIC_DIFF.same;
  await page.evaluate(() => { __game.flyoverPlayer.hold(null); __game.flyoverPlayer.skip(); });
  await ctx.close();
  const total = { metres: +legs.reduce((n, l) => n + l.metres, 0).toFixed(0), byLength: +legs.reduce((n, l) => n + l.byLength, 0).toFixed(0), walked: +legs.reduce((n, l) => n + l.walked, 0).toFixed(0) };
  // the route walks some paths twice (there and back): its time is the sum over the route, not over the legs
  const routeTime = map.route.slice(1).reduce((n, b, i) => { const l = legs.find((x) => (x.from === map.route[i] && x.to === b) || (x.to === map.route[i] && x.from === b)); return n + l.walked; }, 0);
  const heaviest = [...views.map((v) => ({ at: `${v.from} -> ${v.to}`, calls: v.calls, tris: v.tris })), ...tour.map((t) => ({ at: `tour ${t.point}`, calls: t.calls, tris: t.tris }))].sort((x, y) => y.tris - x.tris)[0];
  console.log(`[grey] scale ${scale}: top speed ${speed} m/s`);
  for (const l of legs) console.log(`[grey]   ${l.from} -> ${l.to}: ${l.metres} m, ${l.walked} s run (${l.byLength} s by its length)${l.reached ? '' : ` - NOT REACHED, stopped at ${l.stopped.x}, ${l.stopped.z}`}`);
  console.log(`[grey]   the route ${map.route.join(' -> ')}: ${routeTime.toFixed(0)} s run; the paths once: ${total.metres} m, ${total.walked} s`);
  for (const v of views) console.log(`[grey]   from ${v.from} the landmark of ${v.to} (${v.metres} m): ${v.seen ? 'seen' : `NOT seen - the rays meet ${v.met.join(', ')}`} (${v.rays} rays), ${v.calls} calls, ${Math.round(v.tris / 1000)}k`);
  console.log(`[grey]   the tour: ${tour.map((t) => `${t.calls}/${Math.round(t.tris / 1000)}k`).join(', ')}; the heaviest: ${heaviest.at}, ${heaviest.calls} calls, ${Math.round(heaviest.tris / 1000)}k triangles (the magic at 1)`);
  // the budget holds on q2 only: q0 draws less, and is measured for what it saves
  const over = q === 2 ? overBudget(views, tour) : [];
  if (q === 2) console.log(`[grey]   the budget (q2, ${BUDGET.tris / 1000}k triangles, ${BUDGET.calls} calls): ${over.length ? `OVER at ${over.map((p) => `${p.at} (${p.calls} calls, ${Math.round(p.tris / 1000)}k)`).join('; ')}` : 'every point within it'}`);
  console.log(`[grey]   the magic, point ${magic.point} of the tour: 0 vs 1 differ by ${magic.all} (the sky ${magic.sky}), 0 vs 0.48 by ${magic.half}, two pictures at 0 by ${magic.same}: ${magic.ok ? 'ok' : `FAILED - the threshold is ${MAGIC_DIFF.all} (the sky ${MAGIC_DIFF.sky}) and ${MAGIC_DIFF.same} times the same magic`} (${tag}-magic-0.png, ${tag}-magic-0_48.png, ${tag}-magic-1.png)`);
  return { scale, speed, legs, route: map.route, routeSeconds: +routeTime.toFixed(0), total, views, tour, heaviest, over, magic, failed: over.length > 0 || !magic.ok };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
