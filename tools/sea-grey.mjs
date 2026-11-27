// The grey build of the sea (WORLD-03, WORLD-12): its walkthrough and its measurements, as tools/forest-grey.mjs does
// for the forest (the pure helpers of the routes, tools/grey-route.mjs, are shared).
//
//   node tools/sea-grey.mjs [--scales 1,1.6] [--q 2] [--no-pass] [--no-measure] [--water-only] [--out <dir>]
//   --q: the quality the measurements are made in (`?q=`, 0-2; 2 by default): a look is measured on q2 and q0, as the forest's
//
// 1. `vite build --mode grey --outDir dist-grey`: the registry lists the sea in that mode only (src/worlds/index.ts);
//    the swimming clips are put into that build by vite.config.ts.
// 2. dist-grey/ served on E2E_PORT (4183 by default).
// 3. The walkthrough every world shares, by the sea's description, from its entry to its finale (tools/world-pass.mjs,
//    E2E_WORLD=sea E2E_WORLD_NEED=grey, the phone size); pictures in shots-e2e/sea-grey/. --no-pass leaves it out.
// 4. For every stretch of the map in --scales (`?scale=`, src/worlds/sea/layout.ts), in the phone size:
//    - the time swum along every way of the map: she swims it with the key held, turned along the way at every frame,
//      timed in game seconds; her speed, the clips she swims with and her height over the floor on the way; next to it,
//      the length of the way over her top speed on foot;
//    - from every target of the route (src/worlds/sea/layout.ts ROUTE), whether the landmark of the next one is seen
//      (a ray from the camera behind her to points of the landmark) and the draw calls and the triangles there; the
//      throne from the gate with the gate open, as she only goes to it once the shell lock is solved;
//    - the heroine at her swimming height still, talking and dancing, the cat in its bubble: a picture of each;
//    - the draw at every point of the tour, and a picture from every target and every point of the tour;
//    - the draw by every secret (the grotto from before its curtain and from inside, by its shell);
//    - on q2 a point over BUDGET (triangles or draw calls; tools/grey-route.mjs, 2026-11-27 as the forest's, the Sweet
//      Land's and the Sky Islands') fails the run at the stretch the game plays (SHIPPED_SCALE); at another one it is
//      only told.
//    The numbers go to <out>/measures.json and to the log; <out> is shots-e2e/sea-grey by default.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BUDGET, lengthOf, overBudget, pathBetween, routeLegs } from './grey-route.mjs';
import { passEnv, passProblems } from './sea-pass.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = 'dist-grey';
/** m from the end of a way where she has come (the end of a way is the middle of its zone; the throne is a shell she swims over). */
export const REACHED = 3.5;

/** The stretch the game plays (src/worlds/sea/layout.ts DEFAULT_SCALE, the customer's of 2026-11-20): the budget fails
 * the run there only. The other stretch of --scales is the one turned down, measured to compare. */
export const SHIPPED_SCALE = 1.6;
/** Whether the measures of a stretch fail the run by the budget. */
export function budgetFails(m) { return m.scale === SHIPPED_SCALE && m.over.length > 0; }

/** The arguments: { scales, q, pass, measure, out } or { error }. The two stretches the customer chooses from by default. */
export function readArgs(argv) {
  const o = { scales: [1, 1.6], q: 2, pass: true, measure: true, water: true, out: join(root, 'shots-e2e', 'sea-grey') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-pass') o.pass = false;
    else if (a === '--water-only') { o.pass = false; o.measure = false; o.water = true; }
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

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.error) { console.error(`[grey] ${args.error}\nUsage: node tools/sea-grey.mjs [--scales 1,1.6] [--no-pass] [--no-measure] [--water-only] [--out <dir>]`); process.exit(2); }
  const port = Number(process.env.E2E_PORT || 4183);
  const dist = join(root, DIST);
  // ---- 1. the grey build ----
  rmSync(dist, { recursive: true, force: true });
  execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'grey', '--outDir', DIST], { cwd: root, stdio: 'inherit' });
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
  let failed = false;
  // ---- 3. the walkthrough ----
  if (args.pass) {
    const shots = join('shots-e2e', 'sea-grey');
    mkdirSync(join(root, shots), { recursive: true });
    const report = join(root, shots, 'pass-mobile.json');
    rmSync(report, { force: true });
    const code = await new Promise((r) => spawn(process.execPath, [join(root, 'tools/shot.mjs'), url, shots, 'mobile'], { cwd: root, stdio: 'inherit', env: passEnv(process.env, report) }).on('exit', r));
    // the same check of its report as the CI part "sea-grey" (tools/worlds.mjs)
    const wrong = code === 0 ? passProblems(existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : null) : [];
    for (const p of wrong) console.log(`[grey] the walkthrough: ${p}`);
    console.log(`[grey] the walkthrough of the sea by its description (phone): ${code === 0 && !wrong.length ? 'ok' : `FAILED (${code !== 0 ? `code ${code}` : `${wrong.length} problem(s)`})`}`);
    if (code !== 0 || wrong.length) failed = true;
  }
  // ---- 4. the measurements ----
  if (!args.measure && !args.water) { server.close(); process.exit(failed ? 1 : 0); }
  mkdirSync(args.out, { recursive: true });
  const gl = process.env.E2E_GL === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=gl', '--enable-gpu'];
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: [...gl, '--ignore-gpu-blocklist', '--mute-audio'] });
  const all = [], water = [];
  try {
    if (args.measure) for (const scale of args.scales) { const m = await measure(browser, url, scale, args.out, args.q); all.push(m); if (budgetFails(m)) failed = true; }
    if (args.water) for (const q of [2, 0]) water.push(await inWater(browser, url, q, args.out));
  } finally { await browser.close(); server.close(); }
  if (all.length) { writeFileSync(join(args.out, 'measures.json'), JSON.stringify(all, null, 1)); console.log(`[grey] the numbers: ${join(args.out, 'measures.json')}`); }
  if (water.length) { writeFileSync(join(args.out, 'water.json'), JSON.stringify(water, null, 1)); console.log(`[grey] the heroine in the water: ${join(args.out, 'water.json')}`); }
  process.exit(failed ? 1 : 0);
}

/** The measurements of one stretch of the map (see the head of the file). */
async function measure(browser, url, scale, out, q = 2) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[grey] pageerror', e.message));
  await page.addInitScript(() => { for (const k of ['amw-gift-hold', 'amw-break-hold', 'amw-mystery-hold']) sessionStorage.setItem(k, '1'); });
  await page.goto(`${url}?debug&q=${q}&world=sea&scale=${scale}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#play', { state: 'visible', timeout: 120000 });
  await page.click('#play');
  await page.waitForFunction(() => { const g = window.__game; if (!g) return false; if (g.story?.active) { g.story.skip(); return false; } if (g.flyoverPlayer?.active) { g.flyoverPlayer.skip(); return false; } return !g.busy; }, null, { timeout: 180000, polling: 300 });
  await page.evaluate(() => { for (const s of ['#debug', '#fps', '.debug', '#bubble']) document.querySelectorAll(s).forEach((e) => (e.style.visibility = 'hidden')); });
  const map = await page.evaluate(() => JSON.parse(JSON.stringify(__game.seaMap)));
  if (Math.abs(map.scale - scale) > 1e-9) throw new Error(`the page plays the scale ${map.scale}, not ${scale}`);
  const tag = `x${String(scale).replace('.', '_')}`;
  /** Seconds of game time, waited for frame by frame. */
  const settle = (s) => page.evaluate((s) => new Promise((r) => { const t0 = __game.time; const f = () => (__game.time - t0 >= s ? r() : requestAnimationFrame(f)); f(); }), s);
  /** She stands at `a`, faced toward `b` (the camera behind her). */
  const stand = (a, b) => page.evaluate(([a, b]) => { __game.teleport(a.x, a.z); const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); __game.cam.yaw = yaw; __game.hero.heading = yaw + Math.PI; }, [a, b]);
  const draw = () => page.evaluate(() => ({ calls: __game.renderer.info.render.calls, tris: __game.renderer.info.render.triangles }));
  const speed = await page.evaluate(() => __game.tuning.speed);

  // the ways swum
  const legs = [];
  for (const [a, b] of routeLegs(map.route)) {
    const line = pathBetween(map.paths, map.zones, a, b);
    if (!line) throw new Error(`no path of the map from "${a}" to "${b}"`);
    const len = lengthOf(line);
    await stand(line[0], line[1]); await settle(0.5);
    await page.keyboard.down('KeyW');
    const run = await page.evaluate(([line, REACHED]) => new Promise((done) => {
      const t0 = __game.time, hp = __game.hero.root.position;
      let i = 1, mark = { t: t0, x: hp.x, z: hp.z }, stuck = false, went = 0, last = { x: hp.x, z: hp.z }, high = [];
      const clips = new Set();
      const f = () => {
        went += Math.hypot(hp.x - last.x, hp.z - last.z); last = { x: hp.x, z: hp.z };
        clips.add(__game.hero.current); high.push(hp.y - __game.seaMap.ground(hp.x, hp.z));
        // stuck: less than half a metre in 3 s of game time (a rock, a coral, a character on the way)
        if (__game.time - mark.t > 3) { stuck = Math.hypot(hp.x - mark.x, hp.z - mark.z) < 0.5; mark = { t: __game.time, x: hp.x, z: hp.z }; }
        while (i < line.length - 1 && Math.hypot(line[i].x - hp.x, line[i].z - hp.z) < 2) i++;
        const p = line[i];
        __game.cam.yaw = Math.atan2(-(p.x - hp.x), -(p.z - hp.z));
        const end = line[line.length - 1], left = Math.hypot(end.x - hp.x, end.z - hp.z);
        if (left < REACHED || stuck || __game.time - t0 > 90) done({ s: __game.time - t0, left, went, clips: [...clips], height: [+Math.min(...high).toFixed(2), +Math.max(...high).toFixed(2)], at: { x: +hp.x.toFixed(1), z: +hp.z.toFixed(1) } }); else requestAnimationFrame(f);
      };
      f();
    }), [line, REACHED]);
    await page.keyboard.up('KeyW');
    legs.push({ from: a, to: b, metres: +len.toFixed(1), byLength: +(len / speed).toFixed(1), walked: +run.s.toFixed(1), speed: +(run.went / Math.max(run.s, 1e-3)).toFixed(2), clips: run.clips, height: run.height, reached: run.left < REACHED, stopped: run.left < REACHED ? null : run.at });
    console.log(`[grey]   ${a} -> ${b}: ${run.left < REACHED ? `${run.s.toFixed(1)} s` : `stopped at ${run.at.x}, ${run.at.z}, ${run.left.toFixed(1)} m short`}`);
  }
  // from every target: the next landmark seen, the draw, a picture
  const views = [];
  for (let i = 0; i < map.route.length - 1; i++) {
    const a = map.route[i], b = map.route[i + 1];
    if (views.some((v) => v.from === a && v.to === b)) continue;
    const line = pathBetween(map.paths, map.zones, a, b);
    // to the throne she swims only through the gate the shell lock opened: its doors sunk into the floor, as the game
    // leaves them (src/worlds/sea/lock.ts `opened`; the throne is the last of the route); this measurement's save has it shut
    if (b === 'throne') await page.evaluate(() => __game.openGate());
    await stand(map.zones[a], line[1]); await settle(1.2);
    const seen = await page.evaluate(([b, lm]) => {
      const { THREE, scene, camera } = __game;
      const named = (o, name) => { for (let x = o; x; x = x.parent) if (x.name === name) return true; return false; };
      // what counts as the landmark of the target: the castle is one shape (its towers, its gate; src/worlds/sea/landmarks.ts), the reef its corals
      const names = { square: ['landmark-square'], gate: ['castle'], throne: ['throne', 'castle'], ship: ['landmark-ship'], trench: ['landmark-trench', 'trench-lights'], reef: ['landmark-reef', 'reef-tube', 'reef-branch', 'reef-brain', 'reef-table', 'reef-fan'], garden: ['landmark-garden', 'shells', 'shells-spiral'], grotto: ['landmark-grotto'] }[b];
      // the heroine, the cat and the clear things of the water hide nothing: the light shafts, the motes, the bubbles
      const CLEAR = ['light-shafts', 'water-motes', 'swim-bubbles', 'cat-bubble'];
      const skip = (o) => { for (let x = o; x; x = x.parent) if (x === __game.hero.root || x === __game.cat.root || CLEAR.includes(x.name)) return true; return false; };
      const targets = scene.children.filter((o) => o.visible && !skip(o));
      const ray = new THREE.Raycaster(), from = camera.position.clone();
      let hits = 0;
      const met = [];
      const nameOf = (o) => { for (let x = o; x; x = x.parent) if (x.name) return x.name; return o.type; };
      // points up the whole landmark: a near tall one (the castle's towers from the gate) shows its body, not its top
      const tops = [1, 0.75, 0.5, 0.3].map((k) => lm.top * k).map((y) => new THREE.Vector3(lm.x, __game.seaMap.ground(lm.x, lm.z) + y, lm.z));
      // and the middle of the zone at the height of a roof
      const z = __game.seaMap.zones[b];
      tops.push(new THREE.Vector3(z.x, __game.seaMap.ground(z.x, z.z) + 3.3, z.z));
      for (const p of tops) {
        const dir = p.clone().sub(from); const far = dir.length(); dir.normalize();
        ray.set(from, dir); ray.far = far + 8;
        const first = ray.intersectObjects(targets, true).find((h) => (h.object.isMesh || h.object.isInstancedMesh) && h.object.material?.visible !== false && !skip(h.object));
        // a point of the landmark counts only inside the picture: one past its edge is not seen however clear the way
        const ndc = p.clone().project(camera), inside = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z < 1;
        if (first && inside && names.some((n) => named(first.object, n))) hits++;
        met.push(!inside ? 'off the picture' : first ? `${nameOf(first.object)}@${first.distance.toFixed(0)}` : 'nothing');
      }
      // how much of the landmark the haze of the water hides at its distance (linear fog: 0 - clear, 1 - gone)
      const f = scene.fog, d = from.distanceTo(tops[0]);
      const fog = f ? +Math.min(1, Math.max(0, (d - f.near) / (f.far - f.near))).toFixed(2) : 0;
      return { hits, of: tops.length, metres: +d.toFixed(0), met, fog };
    }, [b, map.landmarks[b]]);
    const d = await draw();
    await page.screenshot({ path: join(out, `${tag}-from-${a}-to-${b}.png`) });
    views.push({ from: a, to: b, seen: seen.hits > 0, rays: `${seen.hits}/${seen.of}`, metres: seen.metres, met: seen.met, fog: seen.fog, ...d });
  }
  // the heroine in the water: still, talking and dancing at the height she swims at, the cat in its bubble beside her -
  // the camera where the game puts it (docs/worlds/world-3.md: the main risk of the world)
  const poses = [];
  await stand(map.zones.square, map.zones.ship); await settle(1.5);
  // the game's own clips by their names (in the water "Idle" is played by the world's Float); the game is held busy
  // meanwhile, as a conversation holds it, so that the heroine's own moving does not take the clip back
  for (const [what, clip] of [['still', 'Idle'], ['talk', 'Talk'], ['dance', 'Dance']]) {
    await page.evaluate((c) => __game.pose(c), clip); await settle(0.8);
    const at = await page.evaluate(() => ({ playing: __game.hero.current, over: +(__game.hero.root.position.y - __game.seaMap.ground(__game.hero.root.position.x, __game.hero.root.position.z)).toFixed(2), bubbles: __game.bubbles() }));
    await page.screenshot({ path: join(out, `${tag}-pose-${what}.png`) });
    poses.push({ what, clip, ...at });
  }
  await page.evaluate(() => __game.pose(null));
  // the secrets (src/worlds/sea/secrets.ts): the draw and a picture by each - the chest from its front, the lift's
  // column toward its rock, the shells from where she listens, the lookout's top with the whale passing
  const secretDraws = [];
  const sec = await page.evaluate(() => JSON.parse(JSON.stringify(__game.seaSecrets)));
  if (sec) {
    // the chest from a step before it, the column toward its rock (the starfish on top), the shells from where she listens
    const near = [['chest', { x: sec.chestFront.x * 2 - sec.chest.x, z: sec.chestFront.z * 2 - sec.chest.z }, sec.chest], ['lift', sec.lift.column, sec.lift.star], ['shells', sec.shells.front, sec.shells.at[1]]];
    for (const [name, a, b] of near) {
      await stand(a, b); await settle(1);
      secretDraws.push({ secret: name, ...(await draw()) });
      await page.screenshot({ path: join(out, `${tag}-secret-${name}.png`) });
    }
    // the lookout: she on its top, faced toward the middle of the map, the whale halfway across high over it
    await page.evaluate((l) => { const h = __game.hero.root.position; h.set(l.x, l.top + __game.seaMap.swim, l.z); const d = Math.hypot(l.x, l.z); const yaw = Math.atan2(l.x / d, l.z / d); __game.cam.yaw = yaw; __game.hero.heading = yaw + Math.PI; __game.seaSecrets.showWhale(); }, sec.lookout);
    await settle(5);
    secretDraws.push({ secret: 'whale', ...(await draw()), shown: await page.evaluate(() => __game.seaSecrets.whale() !== null) });
    await page.screenshot({ path: join(out, `${tag}-secret-whale.png`) });
    // the grotto: from 5 m before its curtain toward its shell, and inside by the shell, faced out through the curtain
    const gr = sec.grotto, ox = gr.opening.x - gr.pearl.x, oz = gr.opening.z - gr.pearl.z, ol = Math.hypot(ox, oz);
    for (const [name, a, b] of [['grotto', { x: gr.opening.x + (ox / ol) * 5, z: gr.opening.z + (oz / ol) * 5 }, gr.pearl], ['grotto-in', { x: gr.pearl.x + (ox / ol) * 0.6, z: gr.pearl.z + (oz / ol) * 0.6 }, gr.opening]]) {
      await stand(a, b); await settle(1.5);
      secretDraws.push({ secret: name, ...(await draw()) });
      await page.screenshot({ path: join(out, `${tag}-secret-${name}.png`) });
    }
    // the hold of the ship (src/worlds/sea/hold.ts): inside its door toward the chest, and by the chest toward the door
    const hold = await page.evaluate(() => JSON.parse(JSON.stringify(__game.seaHold ?? null)));
    if (hold) {
      for (const [name, a, b] of [['hold', hold.doorIn, hold.chest], ['hold-door', { x: hold.chest.x + 1, z: hold.chest.z + 1 }, hold.doorIn]]) {
        await stand(a, b); await settle(1.5);
        secretDraws.push({ secret: name, ...(await draw()), inside: await page.evaluate(() => __game.seaHold.inside()) });
        await page.screenshot({ path: join(out, `${tag}-secret-${name}.png`) });
      }
    }
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
  await page.evaluate(() => { __game.flyoverPlayer.hold(null); __game.flyoverPlayer.skip(); });
  await ctx.close();
  const total = { metres: +legs.reduce((n, l) => n + l.metres, 0).toFixed(0), byLength: +legs.reduce((n, l) => n + l.byLength, 0).toFixed(0), walked: +legs.reduce((n, l) => n + l.walked, 0).toFixed(0) };
  // the route walks some paths twice (there and back): its time is the sum over the route, not over the legs
  const routeTime = map.route.slice(1).reduce((n, b, i) => { const l = legs.find((x) => (x.from === map.route[i] && x.to === b) || (x.to === map.route[i] && x.from === b)); return n + l.walked; }, 0);
  const heaviest = [...views.map((v) => ({ at: `${v.from} -> ${v.to}`, calls: v.calls, tris: v.tris })), ...tour.map((t) => ({ at: `tour ${t.point}`, calls: t.calls, tris: t.tris })), ...secretDraws.map((d) => ({ at: `secret ${d.secret}`, calls: d.calls, tris: d.tris }))].sort((x, y) => y.tris - x.tris)[0];
  console.log(`[grey] scale ${scale}: top speed ${speed} m/s on foot; swum ${(legs.reduce((n, l) => n + l.speed, 0) / legs.length).toFixed(2)} m/s on average; clips ${[...new Set(legs.flatMap((l) => l.clips))].join(', ')}`);
  for (const l of legs) console.log(`[grey]   ${l.from} -> ${l.to}: ${l.metres} m, ${l.walked} s swum at ${l.speed} m/s (${l.byLength} s by its length at the speed on foot), ${l.height[0]}-${l.height[1]} m over the floor${l.reached ? '' : ` - NOT REACHED, stopped at ${l.stopped.x}, ${l.stopped.z}`}`);
  console.log(`[grey]   the route ${map.route.join(' -> ')}: ${routeTime.toFixed(0)} s run; the paths once: ${total.metres} m, ${total.walked} s`);
  for (const v of views) console.log(`[grey]   from ${v.from} the landmark of ${v.to} (${v.metres} m): ${v.seen ? 'seen' : `NOT seen - the rays meet ${v.met.join(', ')}`} (${v.rays} rays, the haze ${Math.round(v.fog * 100)} %), ${v.calls} calls, ${Math.round(v.tris / 1000)}k`);
  console.log(`[grey]   the tour: ${tour.map((t) => `${t.calls}/${Math.round(t.tris / 1000)}k`).join(', ')}; the heaviest: ${heaviest.at}, ${heaviest.calls} calls, ${Math.round(heaviest.tris / 1000)}k triangles`);
  if (secretDraws.length) console.log(`[grey]   the secrets: ${secretDraws.map((d) => `${d.secret} ${d.calls}/${Math.round(d.tris / 1000)}k${d.shown === false ? ' (the whale NOT shown)' : ''}${d.inside === false ? ' (NOT in the hold)' : ''}`).join(', ')}`);
  const over = q === 2 ? [...overBudget(views, tour), ...secretDraws.filter((x) => x.tris > BUDGET.tris || x.calls > BUDGET.calls).map((x) => ({ at: `secret ${x.secret}`, calls: x.calls, tris: x.tris }))] : [];
  if (q === 2) console.log(`[grey]   the budget (q2, ${BUDGET.tris / 1000}k triangles, ${BUDGET.calls} calls): ${over.length ? `OVER at ${over.map((p) => `${p.at} (${p.calls} calls, ${Math.round(p.tris / 1000)}k)`).join('; ')}` : 'every point within it'}${over.length && scale !== SHIPPED_SCALE ? ` - told only, the game plays the scale ${SHIPPED_SCALE}` : ''}`);
  console.log(`[grey]   the heroine in the water: ${poses.map((p) => `${p.what} ${p.clip} (plays ${p.playing}) at ${p.over} m, bubbles ${JSON.stringify(p.bubbles)}`).join('; ')}`);
  return { scale, speed, legs, route: map.route, routeSeconds: +routeTime.toFixed(0), total, views, poses, tour, secrets: secretDraws, heaviest, over };
}
/**
 * The heroine swimming and the cat in its bubble, in pictures (the main risk of the world, docs/worlds/world-3.md): at the
 * tier `q`, the map at its default stretch. The camera is where the game puts it behind her - she swims "forward" with
 * the key held and the camera is not turned; then from behind and below (the camera dragged down as a child would),
 * then from the side (she swims to the right of the camera). Five phases of the stroke each, a quarter of a second of
 * game time apart. Then the cat: by her as she stands, and as she swims. Pictures swim-* and cat-*; their numbers too.
 */
async function inWater(browser, url, q, out) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[grey] pageerror', e.message));
  await page.addInitScript(() => { for (const k of ['amw-gift-hold', 'amw-break-hold', 'amw-mystery-hold']) sessionStorage.setItem(k, '1'); });
  await page.goto(`${url}?debug&q=${q}&world=sea`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#play', { state: 'visible', timeout: 120000 });
  await page.click('#play');
  await page.waitForFunction(() => { const g = window.__game; if (!g) return false; if (g.story?.active) { g.story.skip(); return false; } if (g.flyoverPlayer?.active) { g.flyoverPlayer.skip(); return false; } return !g.busy; }, null, { timeout: 180000, polling: 300 });
  await page.evaluate(() => { for (const s of ['#debug', '#fps', '.debug', '#bubble']) document.querySelectorAll(s).forEach((e) => (e.style.visibility = 'hidden')); });
  const settle = (s) => page.evaluate((s) => new Promise((r) => { const t0 = __game.time; const f = () => (__game.time - t0 >= s ? r() : requestAnimationFrame(f)); f(); }), s);
  const map = await page.evaluate(() => JSON.parse(JSON.stringify(__game.seaMap)));
  // from the square toward the reef: the longest way, open water
  const from = map.zones.square, to = map.zones.reef;
  const look = () => page.evaluate(() => {
    const { camera, hero, cat, THREE } = __game, h = hero.root.position, c = cat.root.position;
    const ndc = c.clone().setY(c.y + 0.35).project(camera);
    const r = __game.renderer.info.render;
    return { calls: r.calls, tris: r.triangles, clip: hero.current, over: +(h.y - __game.seaMap.ground(h.x, h.z)).toFixed(2), catFromHer: +Math.hypot(c.x - h.x, c.z - h.z).toFixed(2), catOver: +(c.y - __game.seaMap.ground(c.x, c.z)).toFixed(2),
      catOnScreen: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1, bubble: __game.bubbles().cat };
  });
  const shots = [];
  const shoot = async (name) => { await page.screenshot({ path: join(out, `${name}-q${q}.png`) }); shots.push({ name: `${name}-q${q}`, ...(await look()) }); };
  const start = async () => {
    await page.evaluate(([a, b]) => { __game.teleport(a.x, a.z); const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); __game.cam.yaw = yaw; __game.hero.heading = yaw + Math.PI; }, [from, to]);
    await settle(1.2);
  };
  const strokes = async (key, name) => {
    await page.keyboard.down(key);
    try {
      await settle(1);
      for (let i = 1; i <= 5; i++) { await shoot(`${name}-${i}`); await settle(0.25); }
    } finally { await page.keyboard.up(key); }
  };
  // 1. behind her, the camera as the game holds it
  await start();
  await strokes('KeyW', 'swim-behind');
  // 2. behind and below: the camera dragged down to its lowest, as a child's drag up would
  await start();
  const x = 420, y = 200;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 160, { steps: 8 }); await page.mouse.up();
  await settle(0.8);
  await strokes('KeyW', 'swim-below');
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 160, { steps: 8 }); await page.mouse.up();
  // 3. from the side: she swims to the right of the camera
  await start();
  await strokes('KeyD', 'swim-side');
  // 4. the cat: by her as she stands (the camera turned a little to have both), and as she swims
  await start();
  await settle(2);
  await page.evaluate(() => { const h = __game.hero.root.position, c = __game.cat.root.position; __game.cam.yaw = Math.atan2(h.x - c.x, h.z - c.z) + 0.9; });
  await settle(1);
  await shoot('cat-still');
  await page.keyboard.down('KeyD');
  try { await settle(1.5); await shoot('cat-swim-1'); await settle(0.6); await shoot('cat-swim-2'); } finally { await page.keyboard.up('KeyD'); }
  await ctx.close();
  for (const s of shots) console.log(`[grey]   ${s.name}: ${s.clip} at ${s.over} m, ${s.calls} calls, ${Math.round(s.tris / 1000)}k; the cat ${s.catFromHer} m from her, ${s.catOver} m over the floor, ${s.catOnScreen ? 'on screen' : 'NOT on screen'}, its bubble ${s.bubble ? 'shown' : 'NOT shown'}`);
  return { water: true, q, shots };
}


if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
