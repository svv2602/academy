// The grey build of the Sky Islands (WORLD-05, WORLD-12, step 1): its walkthrough and its measurements, as
// tools/sweet-grey.mjs does for the Sweet Land - on foot over the islands and their cloud bridges.
//
//   node tools/sky-grey.mjs [--scales 1.6] [--q 2] [--no-pass] [--no-measure] [--out <dir>]
//   --q: the quality the measurements are made in (`?q=`, 0-2; 2 by default): the budget holds on q2
//
// 1. `vite build --mode grey --outDir dist-grey`: the registry lists the Sky Islands in that mode only (src/worlds/index.ts).
//    The build must fit the size budget (tools/dist-size.mjs).
// 2. dist-grey/ served on E2E_PORT (4183 by default).
// 3. The walkthrough every world shares, by the islands' description, from its entry to its finale
//    (tools/world-pass.mjs, E2E_WORLD=sky E2E_WORLD_NEED=grey, the phone size); pictures in shots-e2e/sky-grey/;
//    its report must show the chains, the tour and the finale done and the two rays in the world among its items
//    (`passProblems`; they are taken on the way, inside their chains - ray 4 after the airship's stand-in took her to
//    the far islet). --no-pass leaves it out. CI plays the same walkthrough as the part "sky-grey" of tools/worlds.mjs.
// 4. For every stretch of the map in --scales (`?scale=`, src/worlds/sky/layout.ts; 1.6 by default), the phone size:
//    - the time on foot of every bridge: she walks it with the key held, turned along the way at every frame, timed in
//      game seconds (docs/worlds/world-5.md: 15-25 s between neighbouring islands, the whole world ≈4 min); next to it,
//      the length of the way over her top speed;
//    - from every target of the route (src/worlds/sky/layout.ts ROUTE), whether the landmark of the next one is seen
//      (a ray from the camera behind her to points of the landmark - seen when the first thing it meets is the landmark
//      and the point is inside the picture) and the draw calls and the triangles there;
//    - the draw at every point of the tour; a picture from every target toward the next one and from every point of
//      the tour; the observatory after the finale (the Star over the dome, the clock going) - finale-*.png;
//    on q2 a point over BUDGET (triangles or draw calls) fails the run.
//    The numbers go to <out>/measures.json and to the log; <out> is shots-e2e/sky-grey by default.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDistSize, sizeSummary } from './dist-size.mjs';
import { BUDGET, lengthOf, overBudget, pathBetween, routeLegs } from './grey-route.mjs';
import { GREY_DIST, serveDir } from './hub-grey.mjs';
import { reportProblems } from './world-pass.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The id of the world (src/worlds/sky/index.ts). */
export const SKY = 'sky';
/** m from the end of a way where she has come: the end of a way is the middle of its zone. */
export const REACHED = 3.5;
/**
 * The kinds of the items the walkthrough of the grey build must have done itself (tools/world-pass.mjs GREY_BUILD).
 * The rays that lie in the world are done on the way, inside their chains (the pass takes them as the chain's step
 * `part`), so they are not in the report's `order`: the report must list PARTS_IN_WORLD of them, and a pass that came
 * to its end has done every item it lists.
 */
export const PASS_KINDS = ['chain', 'flyover', 'finale'];
/** How many parts of the artifact lie in the world (src/worlds/sky/index.ts RAYS; GREY_BUILD.part). */
export const PARTS_IN_WORLD = 2;
/** s: the target of the document for the time on foot between neighbouring islands (docs/worlds/world-5.md). */
export const LEG_TARGET = [15, 25];
/** The names of the objects that count as the landmark of a target (src/worlds/sky/scenery.ts, landmarks.ts). */
export const LANDMARK_NAMES = {
  castle: ['landmark-castle'], observatory: ['landmark-observatory', 'clock-hands', 'star-of-time'], dragon: ['landmark-dragon'],
  mills: ['landmark-mills', 'mill-sails'], pier: ['landmark-pier'], far: ['landmark-far'],
};

/** The arguments: { scales, q, pass, measure, out } or { error }. */
export function readArgs(argv) {
  const o = { scales: [1.6], q: 2, pass: true, measure: true, out: join(root, 'shots-e2e', 'sky-grey') };
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

/**
 * The limit of the islands' walkthrough in tools/worlds.mjs, ms: the Sweet Land's (tools/sweet-grey.mjs PASS_TIMEOUT_MS),
 * a world of as many chains and as long ways. Inside the job's 30 minutes with its setup (.github/workflows/ci.yml
 * "worlds", tools/ci-pieces.test.mjs).
 */
export const PASS_TIMEOUT_MS = 1200000;

/** The limit of the islands' walkthrough: E2E_RUN_TIMEOUT_MS when it is set (a run asks its own), PASS_TIMEOUT_MS else. */
export function passTimeoutMs(env) {
  return env.E2E_RUN_TIMEOUT_MS ? Number(env.E2E_RUN_TIMEOUT_MS) : PASS_TIMEOUT_MS;
}

/** The environment of the walkthrough of the Sky Islands by its description (tools/shot.mjs): `base` and the file of its report. */
export function passEnv(base, out) {
  return { ...base, E2E_WORLD: SKY, E2E_WORLD_NEED: 'grey', E2E_WORLD_OUT: out, E2E_ONLY: '', E2E_MUTE: '0' };
}

/** What is wrong with the report of the walkthrough (`report`: the parsed E2E_WORLD_OUT, null - none): [] when it came to its end, online, every kind done. */
export function passProblems(report, size = 'mobile') {
  const out = reportProblems(report, { world: SKY, size, offline: false, kinds: PASS_KINDS });
  const parts = (report?.items ?? []).filter((i) => i.kind === 'part').length;
  if (report && parts < PARTS_IN_WORLD) out.push(`the description has ${parts} part(s) of the artifact in the world, ${PARTS_IN_WORLD} expected`);
  return out;
}

/** The time of the route from the legs walked: the route walks some ways twice, so it sums over the route, not the legs. */
export function routeSeconds(route, legs) {
  return route.slice(1).reduce((n, b, i) => {
    const l = legs.find((x) => (x.from === route[i] && x.to === b) || (x.to === route[i] && x.from === b));
    return n + (l ? l.walked : 0);
  }, 0);
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.error) { console.error(`[grey] ${args.error}\nUsage: node tools/sky-grey.mjs [--scales 1.6] [--q 2] [--no-pass] [--no-measure] [--out <dir>]`); process.exit(2); }
  const port = Number(process.env.E2E_PORT || 4183);
  const dist = join(root, GREY_DIST);
  // ---- 1. the grey build ----
  rmSync(dist, { recursive: true, force: true });
  execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'grey', '--outDir', GREY_DIST], { cwd: root, stdio: 'inherit' });
  let failed = false;
  const size = checkDistSize(dist);
  console.log(`[grey] the size of the build: ${sizeSummary(size)}`);
  if (size.problems.length) { console.log(`[grey] over the budget:\n  ${size.problems.join('\n  ')}`); failed = true; }
  // ---- 2. served ----
  const server = await serveDir(dist, port);
  const url = `http://127.0.0.1:${port}/`;
  console.log(`[grey] ${GREY_DIST}/ served on ${url}`);
  // ---- 3. the walkthrough ----
  if (args.pass) {
    const shots = join('shots-e2e', 'sky-grey');
    mkdirSync(join(root, shots), { recursive: true });
    const out = join(root, shots, 'pass-mobile.json');
    rmSync(out, { force: true });
    const code = await new Promise((r) => spawn(process.execPath, [join(root, 'tools/shot.mjs'), url, shots, 'mobile'], { cwd: root, stdio: 'inherit', env: passEnv(process.env, out) }).on('exit', r));
    const wrong = code === 0 ? passProblems(existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null) : [];
    console.log(`[grey] the walkthrough of the Sky Islands by its description (phone): ${code !== 0 ? `FAILED (code ${code})` : wrong.length ? `FAILED - ${wrong.join('; ')}` : 'ok, to its finale'}`);
    if (code !== 0 || wrong.length) failed = true;
  }
  // ---- 4. the measurements ----
  if (!args.measure) { server.close(); process.exit(failed ? 1 : 0); }
  mkdirSync(args.out, { recursive: true });
  const { chromium } = await import('playwright-core');
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
  await page.goto(`${url}?debug&q=${q}&world=${SKY}&scale=${scale}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#play', { state: 'visible', timeout: 120000 }); /* clock: page-load */
  await page.click('#play');
  await page.waitForFunction(() => { const g = window.__game; if (!g) return false; if (g.story?.active) { g.story.skip(); return false; } if (g.flyoverPlayer?.active) { g.flyoverPlayer.skip(); return false; } return !g.busy; }, null, { timeout: 180000, polling: 300 }); /* clock: ceiling */
  await page.evaluate(() => { for (const s of ['#debug', '#fps', '.debug', '#bubble']) document.querySelectorAll(s).forEach((e) => (e.style.visibility = 'hidden')); });
  const map = await page.evaluate(() => JSON.parse(JSON.stringify(__game.skyMap)));
  if (Math.abs(map.scale - scale) > 1e-9) throw new Error(`the page plays the scale ${map.scale}, not ${scale}`);
  const tag = `x${String(scale).replace('.', '_')}`;
  // the ways are measured over every bridge: the gap of the cloud bridge (WORLD-25) is built first, as once Lazur's
  // chain has built it (before that the way to the dragon island ends at the gap: src/worlds/sky/layout.test.ts)
  if (!(await page.evaluate(() => { __game.skyBridge.build(); return __game.skyBridge.built(); }))) throw new Error('the cloud bridge could not be built by the debug door');
  /** Seconds of game time, waited for frame by frame. */
  const settle = (s) => page.evaluate((s) => new Promise((r) => { const t0 = __game.time; const f = () => (__game.time - t0 >= s ? r() : requestAnimationFrame(f)); f(); }), s);
  /** She stands at `a`, faced toward `b` (the camera behind her). */
  const stand = (a, b) => page.evaluate(([a, b]) => { __game.teleport(a.x, a.z); const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); __game.cam.yaw = yaw; __game.hero.heading = yaw + Math.PI; }, [a, b]);
  const draw = () => page.evaluate(() => ({ calls: __game.renderer.info.render.calls, tris: __game.renderer.info.render.triangles }));
  const speed = await page.evaluate(() => __game.tuning.speed);

  // the ways on foot
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
        // stuck: less than half a metre in 3 s of game time (a tower, a tree, a character on the way)
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
    const seen = await page.evaluate(([names, lm, zone]) => {
      const { THREE, scene, camera } = __game;
      const named = (o, name) => { for (let x = o; x; x = x.parent) if (x.name === name) return true; return false; };
      const skip = (o) => { for (let x = o; x; x = x.parent) if (x === __game.hero.root || x === __game.cat.root) return true; return false; };
      const targets = scene.children.filter((o) => o.visible && !skip(o));
      const ray = new THREE.Raycaster(), from = camera.position.clone();
      let hits = 0;
      const met = [];
      const nameOf = (o) => { for (let x = o; x; x = x.parent) if (x.name) return x.name; return o.type; };
      // points up the whole landmark (a near tall one shows its body, not its top), and the middle of the zone at the height of a roof
      const tops = [1, 0.75, 0.5, 0.3].map((k) => new THREE.Vector3(lm.x, (lm.base ?? __game.skyMap.ground(lm.x, lm.z)) + lm.top * k, lm.z));
      tops.push(new THREE.Vector3(zone.x, __game.skyMap.ground(zone.x, zone.z) + 3.3, zone.z));
      for (const p of tops) {
        const dir = p.clone().sub(from); const far = dir.length(); dir.normalize();
        ray.set(from, dir); ray.far = far + 8;
        const first = ray.intersectObjects(targets, true).find((h) => (h.object.isMesh || h.object.isInstancedMesh) && h.object.material?.visible !== false && !skip(h.object));
        // a point of the landmark counts only inside the picture: one past its edge is not seen however clear the way
        const ndc = p.clone().project(camera), inside = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z < 1;
        if (first && inside && names.some((n) => named(first.object, n))) hits++;
        met.push(!inside ? 'off the picture' : first ? `${nameOf(first.object)}@${first.distance.toFixed(0)}` : 'nothing');
      }
      const f = scene.fog, d = from.distanceTo(tops[0]);
      const fog = f ? +Math.min(1, Math.max(0, (d - f.near) / (f.far - f.near))).toFixed(2) : 0;
      return { hits, of: tops.length, metres: +d.toFixed(0), met, fog };
    }, [LANDMARK_NAMES[b], map.landmarks[b], map.zones[b]]);
    const d = await draw();
    await page.screenshot({ path: join(out, `${tag}-from-${a}-to-${b}.png`) });
    views.push({ from: a, to: b, seen: seen.hits > 0, rays: `${seen.hits}/${seen.of}`, metres: seen.metres, met: seen.met, fog: seen.fog, ...d });
  }
  // the tour
  const tour = [];
  const points = await page.evaluate(() => __game.flyoverPoints.length);
  await page.evaluate(() => __game.flyover());
  await page.waitForFunction(() => __game.flyoverPlayer.active, null, { timeout: 10000 }); /* clock: ceiling */
  for (let i = 0; i < points; i++) {
    await page.evaluate((i) => __game.flyoverPlayer.hold(i), i);
    await settle(0.4);
    tour.push({ point: i + 1, ...(await draw()) });
    await page.screenshot({ path: join(out, `${tag}-tour-${i + 1}.png`) });
  }
  await page.evaluate(() => { __game.flyoverPlayer.hold(null); __game.flyoverPlayer.skip(); });
  // the observatory after the finale: the world's part of the save marked final in memory (never stored: the page is
  // closed after it) - the Star over the dome, the clock going; from 22 m before its shrine and from the castle
  const finale = [];
  await page.evaluate((id) => { __game.save.worlds[id].final = true; }, SKY);
  const before = { x: map.zones.observatory.x, z: map.zones.observatory.z + 22 };
  for (const [name, from, to] of [['observatory', before, map.landmarks.observatory], ['castle', map.zones.castle, map.landmarks.observatory]]) {
    await stand(from, to); await settle(1.5);
    finale.push({ at: name, ...(await draw()) });
    await page.screenshot({ path: join(out, `${tag}-finale-${name}.png`) });
  }
  await ctx.close();
  const total = { metres: +legs.reduce((n, l) => n + l.metres, 0).toFixed(0), byLength: +legs.reduce((n, l) => n + l.byLength, 0).toFixed(0), walked: +legs.reduce((n, l) => n + l.walked, 0).toFixed(0) };
  const routeTime = routeSeconds(map.route, legs);
  const points4 = [...views.map((v) => ({ at: `${v.from} -> ${v.to}`, calls: v.calls, tris: v.tris })), ...tour.map((t) => ({ at: `tour ${t.point}`, calls: t.calls, tris: t.tris }))];
  const heaviest = [...points4].sort((x, y) => y.tris - x.tris)[0], mostCalls = [...points4].sort((x, y) => y.calls - x.calls)[0];
  console.log(`[grey] scale ${scale}: top speed ${speed} m/s`);
  for (const l of legs) {
    const inTarget = l.walked >= LEG_TARGET[0] && l.walked <= LEG_TARGET[1];
    console.log(`[grey]   ${l.from} -> ${l.to}: ${l.metres} m, ${l.walked} s on foot (${l.byLength} s by its length)${inTarget ? '' : ` - outside ${LEG_TARGET[0]}-${LEG_TARGET[1]} s`}${l.reached ? '' : ` - NOT REACHED, stopped at ${l.stopped.x}, ${l.stopped.z}`}`);
  }
  console.log(`[grey]   the route ${map.route.join(' -> ')}: ${routeTime.toFixed(0)} s on foot; the ways once: ${total.metres} m, ${total.walked} s`);
  for (const v of views) console.log(`[grey]   from ${v.from} the landmark of ${v.to} (${v.metres} m): ${v.seen ? 'seen' : `NOT seen - the rays meet ${v.met.join(', ')}`} (${v.rays} rays, the haze ${Math.round(v.fog * 100)} %), ${v.calls} calls, ${Math.round(v.tris / 1000)}k`);
  console.log(`[grey]   the tour: ${tour.map((t) => `${t.calls}/${Math.round(t.tris / 1000)}k`).join(', ')}; the most triangles: ${heaviest.at}, ${heaviest.calls} calls, ${Math.round(heaviest.tris / 1000)}k; the most calls: ${mostCalls.at}, ${mostCalls.calls}`);
  console.log(`[grey]   after the finale: ${finale.map((f) => `${f.at} ${f.calls}/${Math.round(f.tris / 1000)}k`).join(', ')}`);
  const over = q === 2 ? overBudget(views, tour) : [];
  if (q === 2) console.log(`[grey]   the budget (q2, ${BUDGET.tris / 1000}k triangles, ${BUDGET.calls} calls): ${over.length ? `OVER at ${over.map((p) => `${p.at} (${p.calls} calls, ${Math.round(p.tris / 1000)}k)`).join('; ')}` : 'every point within it'}`);
  const notReached = legs.filter((l) => !l.reached);
  return { scale, speed, legs, route: map.route, routeSeconds: +routeTime.toFixed(0), total, views, tour, finale, heaviest, mostCalls, over, failed: over.length > 0 || notReached.length > 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
