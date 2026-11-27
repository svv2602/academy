// The grey build of the Sweet Land (WORLD-04, WORLD-12, step 1): its walkthrough and its measurements, as
// tools/sea-grey.mjs does for the sea - on foot instead of swimming (the pure helpers of the routes are tools/grey-route.mjs's).
//
//   node tools/sweet-grey.mjs [--scales 1.6] [--q 2] [--no-pass] [--no-measure] [--out <dir>]
//   --q: the quality the measurements are made in (`?q=`, 0-2; 2 by default): the budget holds on q2
//
// 1. `vite build --mode grey --outDir dist-grey`: the registry lists the Sweet Land in that mode only (src/worlds/index.ts).
//    The build must fit the size budget (tools/dist-size.mjs).
// 2. dist-grey/ served on E2E_PORT (4183 by default).
// 3. The walkthrough every world shares, by the Sweet Land's description, from its entry to its finale
//    (tools/world-pass.mjs, E2E_WORLD=sweet E2E_WORLD_NEED=grey, the phone size); pictures in shots-e2e/sweet-grey/;
//    its report must show the chains, the tour, the four secrets (SECRETS) and the finale done, the two rubies in the world among its items
//    (`passProblems`; they are taken on the way, inside their chains) and the gingerbread house played in the world
//    (WORLD-21: one wrong piece, left in its middle and come back to, assembled - the steps of tools/world-pass.mjs) and
//    Tyanuchka's scales (WORLD-22: three wrong weights, then the right one) and Kakao's shape bridge (WORLD-20: three
//    wrong tiles, left half built and come back to, finished), each recorded as WORLD_SKILLS says.
//    --no-pass leaves it out. CI plays the same walkthrough as the part "sweet-grey" of tools/worlds.mjs.
// 4. For every stretch of the map in --scales (`?scale=`, src/worlds/sweet/layout.ts; 1.6 by default), the phone size:
//    - the time on foot of every way of the map: she walks it with the key held, turned along the way at every frame,
//      timed in game seconds (docs/worlds/world-4.md: 15-25 s between neighbouring targets, the whole world ≈4 min);
//      next to it, the length of the way over her top speed;
//    - from every target of the route (src/worlds/sweet/layout.ts ROUTE), whether the landmark of the next one is seen
//      (a ray from the camera behind her to points of the landmark - seen when the first thing it meets is the landmark
//      and the point is inside the picture) and the draw calls and the triangles there;
//    - the draw at every point of the tour and by every secret (src/worlds/sweet/secrets.ts: the box from before it, the
//      cloud and the roof's lollipop, the fountain, the bubble blown at the machine); a picture from every target toward
//      the next one, from every point of the tour and by every secret (secret-*.png); the cake after the finale (the Ruby on its lit candle, the carousel turning) - finale-*.png;
//    - all of it with the magic at 1 (WORLD-09, src/worlds/sweet/magic.ts): the most the land draws (the butterflies,
//      the sugar in the air);
//    - the magic: from MAGIC_POINT of the tour, the world still, pictures at the magic 0, 0 again, 0.32 (two rubies),
//      0.64 (four) and 1 - 0 and 1 differ over the whole and over the sky by more than MAGIC_DIFF, and by more than
//      MAGIC_DIFF.same times two pictures of the same magic; else the run fails. Then from MAGIC_NEAR_POINT the same
//      magic for the eye alone (magic-near-*.png);
//    on q2 a point over BUDGET (triangles or draw calls) fails the run.
//    The numbers go to <out>/measures.json and to the log; <out> is shots-e2e/sweet-grey by default.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDistSize, sizeSummary } from './dist-size.mjs';
import { BUDGET, BUDGET_WARM_S, budgetSettle, lengthOf, overBudget, pathBetween, routeLegs } from './grey-route.mjs';
import { GREY_DIST, serveDir } from './hub-grey.mjs';
import { MAGIC_DIFF, pictureDiffs } from './picture-diff.mjs';
import { reportProblems } from './world-pass.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The id of the world (src/worlds/sweet/index.ts). */
export const SWEET = 'sweet';
/** The point of the tour (0-based) the pictures of the magic are taken from: over the square to the town - the sky, the carousel and the sweets in the frame. */
export const MAGIC_POINT = 0;
/** The magic of the pictures (two and four rubies given back between) and the names of their files. */
export const MAGIC_PICTURES = [[0, 'magic-0'], [0, 'magic-0-again'], [0.32, 'magic-0_32'], [0.64, 'magic-0_64'], [1, 'magic-1']];
/** The point of the tour (0-based) pictured once more for the eye alone. */
export const MAGIC_NEAR_POINT = 2;
/** m from the end of a way where she has come: the end of a way is the middle of its zone. */
export const REACHED = 3.5;
/**
 * The kinds of the items the walkthrough of the grey build must have done itself (tools/world-pass.mjs GREY_BUILD), and
 * the secrets (PLAY-07), as the sea's (tools/sea-pass.mjs). The rubies that lie in the world are done on the way, inside
 * their chains (the pass takes them as the chain's step `part`), so they are not in the report's `order`: the report
 * must list PARTS_IN_WORLD of them, and a pass that came to its end has done every item it lists. The cut-scenes too
 * (WORLD-13, src/worlds/sweet/story.ts), played frame by frame with taps, and the pet (PLAY-09, Zheleyka), as the sea's.
 */
export const PASS_KINDS = ['chain', 'scene', 'flyover', 'secret', 'pet', 'finale'];
/** The Sweet Land's secrets (src/worlds/sweet/secrets.ts SWEET_SECRETS): the pass must have found each. */
export const SECRETS = ['candy_box', 'cotton_cloud', 'lemonade', 'bubble_gum'];
/** How many parts of the artifact lie in the world (src/worlds/sweet/index.ts RUBIES; GREY_BUILD.part). */
export const PARTS_IN_WORLD = 2;
/**
 * The tasks the Sweet Land plays in the world ("<chain> <step>", tools/world-pass.mjs `worldTasks`) and the skill each
 * must have recorded once solved (the report's `worldSkills`; docs/worlds/world-4.md question 3, the customer's
 * decision 2026-11-18): the gingerbread house none, the scales `compare` - as a panel task of comparing, the shape
 * bridge `classify` - as a panel task of classification.
 */
export const WORLD_SKILLS = { 'imbir 2': null, 'tyanuchka 2': 'compare', 'kakao 0': 'classify' };
/** s: the target of the document for the time on foot between neighbouring targets (docs/worlds/world-4.md). */
export const LEG_TARGET = [15, 25];
/** The names of the objects that count as the landmark of a target (src/worlds/sweet/scenery.ts, landmarks.ts). */
export const LANDMARK_NAMES = {
  square: ['landmark-square', 'carousel-seats'], palace: ['landmark-palace', 'candle-flame', 'ruby-of-joy'], garden: ['landmark-garden', 'garden-lollipops'],
  town: ['landmark-town', 'gingerbread-houses', 'imbir-house'], market: ['landmark-market', 'market-stalls'], mill: ['landmark-mill', 'mill-wings'], bridge: ['landmark-bridge'],
};

/** The arguments: { scales, q, pass, measure, out } or { error }. */
export function readArgs(argv) {
  const o = { scales: [1.6], q: 2, pass: true, measure: true, budget: false, built: false, out: join(root, 'shots-e2e', 'sweet-grey') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-pass') o.pass = false;
    // the CI job "budget" (tools/grey-route.mjs budgetSettle): the draw of the points, nothing else
    else if (a === '--budget') { o.budget = true; o.pass = false; }
    // the grey build made already (the part "budget" of tools/worlds.mjs builds it once for the four worlds)
    else if (a === '--built') o.built = true;
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
 * The limit of the Sweet Land's walkthrough in tools/worlds.mjs, ms. On the CI runner (swiftshader, ~1 fps) it took
 * 7.7 min of the shared 10 (E2E_RUN_TIMEOUT_MS, 600000) before its four secrets, which took the sea 1-1.5 min more.
 * As the sea's (tools/sea-pass.mjs PASS_TIMEOUT_MS): twice the shared limit, inside the job's 30 minutes
 * (.github/workflows/ci.yml "worlds").
 */
export const PASS_TIMEOUT_MS = 1200000;

/** The limit of the Sweet Land's walkthrough: E2E_RUN_TIMEOUT_MS when it is set (a run asks its own), PASS_TIMEOUT_MS else. */
export function passTimeoutMs(env) {
  return env.E2E_RUN_TIMEOUT_MS ? Number(env.E2E_RUN_TIMEOUT_MS) : PASS_TIMEOUT_MS;
}

/** The environment of the walkthrough of the Sweet Land by its description (tools/shot.mjs): `base` and the file of its report. */
export function passEnv(base, out) {
  return { ...base, E2E_WORLD: SWEET, E2E_WORLD_NEED: 'grey', E2E_WORLD_OUT: out, E2E_ONLY: '', E2E_MUTE: '0' };
}

/** What is wrong with the report of the walkthrough (`report`: the parsed E2E_WORLD_OUT, null - none): [] when it came to its end, online, every kind done. */
export function passProblems(report, size = 'mobile') {
  // the gingerbread house is played in the world (WORLD-21): the pass must have met it there
  const out = reportProblems(report, { world: SWEET, size, offline: false, kinds: PASS_KINDS, inWorld: true });
  const parts = (report?.items ?? []).filter((i) => i.kind === 'part').length;
  if (report && parts < PARTS_IN_WORLD) out.push(`the description has ${parts} part(s) of the artifact in the world, ${PARTS_IN_WORLD} expected`);
  if (report) {
    const items = report.items ?? [], did = new Set(report.order ?? []);
    for (const id of SECRETS) {
      if (!items.some((i) => i.kind === 'secret' && i.id === id)) out.push(`the description has no secret "${id}"`);
      else if (!did.has(id)) out.push(`the secret "${id}" was not found by the pass`);
    }
  }
  // every task of the world met in it, and recorded where it must be: the house in no skill, the scales in `compare`,
  // the bridge in `classify`
  if (report) {
    for (const [key, skill] of Object.entries(WORLD_SKILLS)) {
      if (!(report.worldTasks ?? []).includes(key)) { out.push(`the task in the world "${key}" was not played by the pass`); continue; }
      const got = report.worldSkills?.[key];
      if (got !== skill) out.push(`the task in the world "${key}" recorded ${got === undefined ? 'nothing the report shows' : got === null ? 'no skill' : `the skill "${got}"`}, ${skill ? `"${skill}"` : 'no skill'} expected`);
    }
  }
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
  if (args.error) { console.error(`[grey] ${args.error}\nUsage: node tools/sweet-grey.mjs [--scales 1.6] [--q 2] [--no-pass] [--no-measure] [--budget] [--built] [--out <dir>]`); process.exit(2); }
  const port = Number(process.env.E2E_PORT || 4183);
  const dist = join(root, GREY_DIST);
  // ---- 1. the grey build ----
  if (args.built && existsSync(join(dist, 'index.html'))) console.log(`[grey] the grey build made already: ${dist}`);
  else {
    rmSync(dist, { recursive: true, force: true });
    execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'grey', '--outDir', GREY_DIST], { cwd: root, stdio: 'inherit' });
  }
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
    const shots = join('shots-e2e', 'sweet-grey');
    mkdirSync(join(root, shots), { recursive: true });
    const out = join(root, shots, 'pass-mobile.json');
    rmSync(out, { force: true });
    const code = await new Promise((r) => spawn(process.execPath, [join(root, 'tools/shot.mjs'), url, shots, 'mobile'], { cwd: root, stdio: 'inherit', env: passEnv(process.env, out) }).on('exit', r));
    const wrong = code === 0 ? passProblems(existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null) : [];
    console.log(`[grey] the walkthrough of the Sweet Land by its description (phone): ${code !== 0 ? `FAILED (code ${code})` : wrong.length ? `FAILED - ${wrong.join('; ')}` : 'ok, to its finale'}`);
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
    for (const scale of args.scales) all.push(await measure(browser, url, scale, args.out, args.q, args.budget));
  } finally { await browser.close(); server.close(); }
  writeFileSync(join(args.out, 'measures.json'), JSON.stringify(all, null, 1));
  if (all.some((m) => m.failed)) failed = true;
  console.log(`[grey] the numbers: ${join(args.out, 'measures.json')}`);
  process.exit(failed ? 1 : 0);
}

/** The measurements of one stretch of the map (see the head of the file). */
async function measure(browser, url, scale, out, q = 2, budget = false) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[grey] pageerror', e.message));
  await page.addInitScript(() => { for (const k of ['amw-gift-hold', 'amw-break-hold', 'amw-mystery-hold']) sessionStorage.setItem(k, '1'); });
  await page.goto(`${url}?debug&q=${q}&world=${SWEET}&scale=${scale}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#play', { state: 'visible', timeout: 120000 }); /* clock: page-load */
  await page.click('#play');
  await page.waitForFunction(() => { const g = window.__game; if (!g) return false; if (g.story?.active) { g.story.skip(); return false; } if (g.flyoverPlayer?.active) { g.flyoverPlayer.skip(); return false; } return !g.busy; }, null, { timeout: 180000, polling: 300 }); /* clock: ceiling */
  await page.evaluate(() => { for (const s of ['#debug', '#fps', '.debug', '#bubble']) document.querySelectorAll(s).forEach((e) => (e.style.visibility = 'hidden')); });
  const map = await page.evaluate(() => JSON.parse(JSON.stringify(__game.sweetMap)));
  if (Math.abs(map.scale - scale) > 1e-9) throw new Error(`the page plays the scale ${map.scale}, not ${scale}`);
  // all the magic: the most the land draws (the butterflies, the sugar in the air) - the frame to measure
  await page.evaluate(() => __game.setMagic(1));
  const tag = `x${String(scale).replace('.', '_')}`;
  /** Seconds of game time, waited for frame by frame. */
  const gameSettle = (s) => page.evaluate((s) => new Promise((r) => { const t0 = __game.time; const f = () => (__game.time - t0 >= s ? r() : requestAnimationFrame(f)); f(); }), s);
  // --budget (tools/grey-route.mjs): a few frames, the camera snapped; no pictures
  const settle = budget ? (s) => budgetSettle(page, s) : gameSettle;
  if (budget) await settle(BUDGET_WARM_S);
  const shot = budget ? async () => Buffer.alloc(0) : (o) => page.screenshot(o);
  /** She stands at `a`, faced toward `b` (the camera behind her). */
  const stand = (a, b) => page.evaluate(([a, b]) => { __game.teleport(a.x, a.z); const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); __game.cam.yaw = yaw; __game.hero.heading = yaw + Math.PI; }, [a, b]);
  const draw = () => page.evaluate(() => ({ calls: __game.renderer.info.render.calls, tris: __game.renderer.info.render.triangles }));
  const speed = await page.evaluate(() => __game.tuning.speed);

  // the ways on foot
  const legs = [];
  for (const [a, b] of budget ? [] : routeLegs(map.route)) {
    const line = pathBetween(map.paths, map.zones, a, b);
    if (!line) throw new Error(`no path of the map from "${a}" to "${b}"`);
    const len = lengthOf(line);
    await stand(line[0], line[1]); await settle(0.5);
    await page.keyboard.down('KeyW');
    const run = await page.evaluate(([line, REACHED]) => new Promise((done) => {
      const t0 = __game.time, hp = __game.hero.root.position;
      let i = 1, mark = { t: t0, x: hp.x, z: hp.z }, stuck = false;
      const f = () => {
        // stuck: less than half a metre in 3 s of game time (a house, a lollipop, a character, the river on the way)
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
      const tops = [1, 0.75, 0.5, 0.3].map((k) => new THREE.Vector3(lm.x, __game.sweetMap.ground(lm.x, lm.z) + lm.top * k, lm.z));
      tops.push(new THREE.Vector3(zone.x, __game.sweetMap.ground(zone.x, zone.z) + 3.3, zone.z));
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
    await shot({ path: join(out, `${tag}-from-${a}-to-${b}.png`) });
    views.push({ from: a, to: b, seen: seen.hits > 0, rays: `${seen.hits}/${seen.of}`, metres: seen.metres, met: seen.met, fog: seen.fog, ...d });
  }
  // the secrets (src/worlds/sweet/secrets.ts): the draw and a picture by each - the box from a step before its front, the
  // cloud from a step off it toward the house, the roof's lollipop from where the cloud lands her, the fountain from its
  // front, the machine from where she stands before it with the bubble blown
  const secretDraws = [];
  const sec = await page.evaluate(() => JSON.parse(JSON.stringify(__game.sweetSecrets ?? null)));
  if (sec) {
    const off = (a, b, k) => ({ x: a.x + (a.x - b.x) * k, z: a.z + (a.z - b.z) * k });
    const near = [['box', off(sec.box.front, sec.box.at, 1), sec.box.at], ['cloud', off(sec.cloud, sec.roof, 0.5), sec.roof], ['fountain', sec.fountain.front, sec.fountain.at]];
    for (const [name, a, b] of near) {
      await stand(a, b); await settle(1);
      secretDraws.push({ secret: name, ...(await draw()) });
      await shot({ path: join(out, `${tag}-secret-${name}.png`) });
    }
    // on the roof, at where the cloud sets her down, toward the lollipop
    await page.evaluate((r) => { const h = __game.hero.root.position; h.set(r.landing.x, r.top, r.landing.z); const yaw = Math.atan2(-(r.swirl.x - r.landing.x), -(r.swirl.z - r.landing.z)); __game.cam.yaw = yaw; __game.hero.heading = yaw + Math.PI; }, sec.roof);
    await settle(1);
    secretDraws.push({ secret: 'roof', ...(await draw()) });
    await shot({ path: join(out, `${tag}-secret-roof.png`) });
    // the machine: she before it, faced to it, the bubble halfway blown
    await stand(sec.gum.stand, sec.gum.at);
    await page.evaluate(() => __game.sweetSecrets.blow());
    // the bubble grows by game time: the same 0.9 s in --budget too
    await settle(0.9);
    secretDraws.push({ secret: 'gum', ...(await draw()), shown: await page.evaluate(() => __game.sweetSecrets.bubble() !== null) });
    await shot({ path: join(out, `${tag}-secret-gum.png`) });
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
    await shot({ path: join(out, `${tag}-tour-${i + 1}.png`) });
  }
  let magic = { skipped: true, ok: true };
  if (!budget) {
    // the magic: the camera on its point, the world still (no game time: the butterflies, the river and the carousel
    // stand), so two pictures of the same magic differ by nothing that lives in the frame
    await page.evaluate((i) => __game.flyoverPlayer.hold(i), MAGIC_POINT);
    await settle(0.6);
    const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    const pics = [];
    await page.evaluate(() => __game.still(true));
    try {
      for (const [m, name] of MAGIC_PICTURES) {
        await page.evaluate((m) => __game.setMagic(m), m);
        await frames();
        pics.push((await shot({ path: join(out, `${tag}-${name}.png`) })).toString('base64'));
      }
      await page.evaluate((i) => __game.flyoverPlayer.hold(i), MAGIC_NEAR_POINT);
      await page.evaluate(() => __game.still(false));
      await settle(0.6);
      await page.evaluate(() => __game.still(true));
      for (const [m, name] of MAGIC_PICTURES.filter(([, n]) => n !== 'magic-0-again')) {
        await page.evaluate((m) => __game.setMagic(m), m);
        await frames();
        await shot({ path: join(out, `${tag}-${name.replace('magic', 'magic-near')}.png`) });
      }
    } finally { await page.evaluate(() => { __game.still(false); __game.setMagic(1); }); }
    const [all, sky, same, half] = await pictureDiffs(page, pics, [[0, 4, 1], [0, 4, 0.2], [0, 1, 1], [0, 2, 1]]);
    magic = { point: MAGIC_POINT + 1, all: +all.toFixed(4), sky: +sky.toFixed(4), same: +same.toFixed(4), half: +half.toFixed(4) };
    magic.ok = all > MAGIC_DIFF.all && sky > MAGIC_DIFF.sky && all > same * MAGIC_DIFF.same;
  }
  await page.evaluate(() => { __game.flyoverPlayer.hold(null); __game.flyoverPlayer.skip(); });
  // the cake after the finale: the world's part of the save marked final in memory (never stored: the page is closed
  // after it) - the Ruby over the lit candle, the carousel turning; from the palace's middle and from the square
  const finale = [];
  await page.evaluate((id) => { __game.save.worlds[id].final = true; }, SWEET);
  // the palace from 20 m before its shrine (the whole cake and its candle in the picture), then from the square
  const before = { x: map.zones.palace.x, z: map.zones.palace.z + 20 };
  for (const [name, from, to] of [['palace', before, map.landmarks.palace], ['square', map.zones.square, map.landmarks.palace]]) {
    await stand(from, to); await settle(1.5);
    finale.push({ at: name, ...(await draw()) });
    await shot({ path: join(out, `${tag}-finale-${name}.png`) });
  }
  await ctx.close();
  const total = { metres: +legs.reduce((n, l) => n + l.metres, 0).toFixed(0), byLength: +legs.reduce((n, l) => n + l.byLength, 0).toFixed(0), walked: +legs.reduce((n, l) => n + l.walked, 0).toFixed(0) };
  const routeTime = routeSeconds(map.route, legs);
  const points4 = [...views.map((v) => ({ at: `${v.from} -> ${v.to}`, calls: v.calls, tris: v.tris })), ...tour.map((t) => ({ at: `tour ${t.point}`, calls: t.calls, tris: t.tris })), ...secretDraws.map((d) => ({ at: `secret ${d.secret}`, calls: d.calls, tris: d.tris }))];
  const heaviest = [...points4].sort((x, y) => y.tris - x.tris)[0], mostCalls = [...points4].sort((x, y) => y.calls - x.calls)[0];
  console.log(`[grey] scale ${scale}: top speed ${speed} m/s`);
  for (const l of legs) {
    const inTarget = l.walked >= LEG_TARGET[0] && l.walked <= LEG_TARGET[1];
    console.log(`[grey]   ${l.from} -> ${l.to}: ${l.metres} m, ${l.walked} s on foot (${l.byLength} s by its length)${inTarget ? '' : ` - outside ${LEG_TARGET[0]}-${LEG_TARGET[1]} s`}${l.reached ? '' : ` - NOT REACHED, stopped at ${l.stopped.x}, ${l.stopped.z}`}`);
  }
  console.log(`[grey]   the route ${map.route.join(' -> ')}: ${routeTime.toFixed(0)} s on foot; the ways once: ${total.metres} m, ${total.walked} s`);
  for (const v of views) console.log(`[grey]   from ${v.from} the landmark of ${v.to} (${v.metres} m): ${v.seen ? 'seen' : `NOT seen - the rays meet ${v.met.join(', ')}`} (${v.rays} rays, the haze ${Math.round(v.fog * 100)} %), ${v.calls} calls, ${Math.round(v.tris / 1000)}k`);
  console.log(`[grey]   the tour: ${tour.map((t) => `${t.calls}/${Math.round(t.tris / 1000)}k`).join(', ')}; the most triangles: ${heaviest.at}, ${heaviest.calls} calls, ${Math.round(heaviest.tris / 1000)}k; the most calls: ${mostCalls.at}, ${mostCalls.calls}`);
  if (secretDraws.length) console.log(`[grey]   the secrets: ${secretDraws.map((d) => `${d.secret} ${d.calls}/${Math.round(d.tris / 1000)}k${d.shown === false ? ' (the bubble NOT shown)' : ''}`).join(', ')}`);
  console.log(`[grey]   after the finale: ${finale.map((f) => `${f.at} ${f.calls}/${Math.round(f.tris / 1000)}k`).join(', ')}`);
  // the points by the secrets are held to the budget as the views are
  const over = q === 2 ? overBudget([...views, ...secretDraws.map((d) => ({ from: 'secret', to: d.secret, calls: d.calls, tris: d.tris }))], tour) : [];
  if (q === 2) console.log(`[grey]   the budget (q2, ${BUDGET.tris / 1000}k triangles, ${BUDGET.calls} calls): ${over.length ? `OVER at ${over.map((p) => `${p.at} (${p.calls} calls, ${Math.round(p.tris / 1000)}k)`).join('; ')}` : 'every point within it'}`);
  if (magic.skipped) console.log('[grey]   the magic: not measured (--budget)');
  else console.log(`[grey]   the magic, point ${magic.point} of the tour: 0 vs 1 differ by ${magic.all} (the sky ${magic.sky}), 0 vs 0.32 by ${magic.half}, two pictures at 0 by ${magic.same}: ${magic.ok ? 'ok' : `FAILED - the threshold is ${MAGIC_DIFF.all} (the sky ${MAGIC_DIFF.sky}) and ${MAGIC_DIFF.same} times the same magic`} (${tag}-magic-*.png, ${tag}-magic-near-*.png)`);
  const notReached = legs.filter((l) => !l.reached);
  return { scale, speed, legs, route: map.route, routeSeconds: +routeTime.toFixed(0), total, views, tour, secrets: secretDraws, finale, heaviest, mostCalls, over, magic, failed: over.length > 0 || notReached.length > 0 || !magic.ok };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
