// node tools/calls.mjs [port] [--raw] [--q 0,1,2] : what the draw calls and triangles of the first world are spent on (a tool for a
// person, docs/perf.md). Plays the built game (dist/) with ?debug on this computer, at q1 and q2, in the points of the
// measures on the S22: the start, the pond with the shrine, the mushroom king, the glade behind the waterfall - and the
// room of the fairy house (a secret of its own, far beyond the valley).
//
// In each point the camera looks the heaviest of eight ways (most draw calls), as on the S22. One frame is drawn with
// the renderer's renderBufferDirect wrapped: every call is counted with the object it draws, in the main pass or the
// shadow pass (the shadow map is the render target), with its triangles (instances included). The calls are put in
// groups by what they draw (see `group`): the scenery, the characters, the heroine and the cat, the creatures, the
// secrets, the sky, the particles, the things of the interface in the scene. For each object also: whether it is
// already drawn in one call for many (InstancedMesh, `instances`), and the single meshes that share a geometry and a
// material with another single mesh in the same pass - what could be one instanced call.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { GROUPS } from './e2e-saves.mjs';

const port = Number(process.argv.find((a) => /^\d+$/.test(a)) || 4239);
const raw = process.argv.includes('--raw');
const server = spawn(process.execPath, ['tools/e2e.mjs', '--serve', String(port)], { stdio: 'ignore', detached: true });
// the server goes with the measure, also when the measure is stopped (a `timeout`, Ctrl+C): else it is left serving
const stopServer = () => { try { process.kill(-server.pid); } catch { /* gone */ } };
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stopServer(); process.exit(130); });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
// the S22's save: the five tasks of the chains done, the finale not played (the shrine waits for the shards)
const save = GROUPS.shop.save();
save.worlds.fairy.final = false;
const rowsOut = [];
const POINTS = { start: [0, 14], 'pond and shrine': [16, -9], 'mushroom king': null, 'glade behind the waterfall': [44, -40], 'room of the fairy house': [0, 215] };

try {
  // the levels of quality: q1 and q2, or the ones given (--q 0,1,2)
  const qi = process.argv.indexOf('--q');
  for (const q of qi > 0 ? process.argv[qi + 1].split(',').map(Number) : [1, 2]) {
    const url = `http://localhost:${port}/?debug&q=${q}`;
    for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); /* clock: page-load */ }
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    await ctx.addInitScript((s) => {
      if (!localStorage.getItem('amw-save')) localStorage.setItem('amw-save', s);
      try { sessionStorage.setItem('amw-gift-hold', '1'); sessionStorage.setItem('amw-break-hold', '1'); } catch { /* ignore */ }
    }, JSON.stringify(save));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(url);
    await page.waitForSelector('#play', { state: 'visible', timeout: 90000 }); /* clock: page-load */
    await page.click('#play');
    await page.waitForFunction(() => !__game.busy && document.querySelector('#start').classList.contains('hidden'), null, { timeout: 90000 }); /* clock: page-load */
    await page.waitForTimeout(4000); /* clock: measure */
    await installCount(page);
    for (const [name, at0] of Object.entries(POINTS)) {
      const at = at0 ?? await page.evaluate(() => { const n = __game.npcs.find((x) => /mush/.test(x.def.id)); return [n.pos.x + 2, n.pos.z + 2]; });
      await page.evaluate(([x, z]) => __game.teleport(x, z), at);
      let best = null;
      for (let k = 0; k < 8; k++) {
        await page.evaluate((yaw) => { __game.cam.yaw = yaw; }, (k / 8) * Math.PI * 2);
        await page.waitForTimeout(700); /* clock: measure */
        const r = await page.evaluate(() => window.__countFrame());
        if (!best || r.calls > best.calls) best = { ...r, yaw: k };
      }
      report(q, name, best);
    }
    await ctx.close();
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(rowsOut));
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}

/** Puts window.__countFrame() into the page: draws one frame and returns its calls, by object. */
async function installCount(page) {
  await page.evaluate(() => {
    const { renderer, scene, camera } = __game;
    const shadowMaps = () => { const s = new Set(); scene.traverse((o) => { if (o.isLight && o.shadow?.map) s.add(o.shadow.map); }); return s; };
    // What an object belongs to (docs/perf.md): the actors by their roots, the rest by its material and texture.
    const roots = () => {
      const m = new Map([[__game.hero.root, 'heroine'], [__game.cat.root, 'cat']]);
      if (__game.pet) m.set(__game.pet.root, 'pet');
      for (const n of __game.npcs ?? []) { m.set(n.actor.root, 'characters'); if (n.mark) m.set(n.mark, 'interface in the scene'); }
      return m;
    };
    const kindOf = (object, m, map, per, owners) => {
      for (let o = object; o; o = o.parent) if (owners.has(o)) return owners.get(o);
      if (object.isPoints || object.isSprite) return 'particles';
      if (/Chest/.test(object.parent?.name ?? '') || /Chest/.test(object.parent?.parent?.name ?? '')) return 'secrets';
      if (/Bark|LeavesTree|LeavesTwisted|LeafPine/.test(map)) return 'trees';
      if (/T_Leaves_D/.test(map)) return 'bushes';
      if (/Flowers/.test(map)) return 'flowers';
      if (/T_Grass_D/.test(map)) return 'tall grass';
      if (/T_PathRocks/.test(map)) return 'path stones and pebbles';
      if (/T_Rocks/.test(map)) return 'rocks';
      if (/Mushrooms/.test(map)) return 'mushrooms';
      const c = m.color ? m.color.getHexString() : '';
      if (object.isInstancedMesh && !map && per <= 12) return 'grass';
      if (object.isInstancedMesh && !map && per >= 1000 && c === 'ffffff') return 'trees';      // far trees: their colours in the vertices
      if (c === 'ffe066' && !object.isInstancedMesh) return 'stars on the ground';
      if (/b7a9c4|7cc46a|ffb3e6|4fae54|7cc8e8|fff0dc|b98560|d8a878|ff9ccf|c79bff|ffd166|9a6a4c/.test(c)) return 'secrets';   // secrets.ts
      if (m.isShaderMaterial || m.isRawShaderMaterial) return 'sky, water, curtain (shaders)';
      if (object.geometry?.attributes?.position?.count > 20000 && m.vertexColors) return 'ground';
      if (m.isMeshBasicMaterial && m.vertexColors) return 'creatures';
      if (object.isInstancedMesh) return 'other scenery (stumps, lilies, mushrooms)';
      if (m.isMeshBasicMaterial) return 'interface in the scene';
      return 'buildings and props';
    };
    window.__countFrame = () => new Promise((resolve) => {
      const owners = roots();
      const maps = shadowMaps(), rows = new Map(), orig = renderer.renderBufferDirect;
      const wrap = function (cam, sc, geometry, material, object, group) {
        const pass = maps.has(renderer.getRenderTarget()) ? 'shadow' : sc !== scene ? 'post' : 'main';
        const key = `${pass}|${object.uuid}|${geometry.uuid}|${material.uuid}`;
        let r = rows.get(key);
        if (!r) {
          const chain = []; for (let o = object; o && o !== scene; o = o.parent) if (o.name) chain.push(o.name);
          const m = object.material && !Array.isArray(object.material) ? object.material : material;
          const map = (m.map?.name || m.map?.source?.data?.src?.split('/').pop() || '').replace(/^tex\//, '').replace(/\.webp$/, '');
          const per = (geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0) / 3;
          r = { kind: kindOf(object, m, map, per, owners), pass, object: object.name, chain: chain.join(' < '), root: chain.at(-1) ?? '',
            type: object.isInstancedMesh ? 'instanced' : object.isSkinnedMesh ? 'skinned' : object.isPoints ? 'points' : object.isSprite ? 'sprite' : object.isLine ? 'line' : 'mesh',
            instances: object.isInstancedMesh ? object.count : 1, per: Math.round(per), geo: geometry.uuid, mat: m.uuid, matName: m.name || m.type, map,
            color: m.color ? m.color.getHexString() : '', transparent: !!m.transparent, calls: 0, tris: 0,
            at: object.isInstancedMesh ? null : [+object.getWorldPosition(new __game.THREE.Vector3()).x.toFixed(1), +object.getWorldPosition(new __game.THREE.Vector3()).z.toFixed(1)] };
          rows.set(key, r);
        }
        r.calls++;
        r.tris += (object.isMesh ? (group ? group.count / 3 : r.per) : 0) * (object.isInstancedMesh ? object.count : 1);
        return orig.apply(this, arguments);
      };
      // after the game's own frame N: wrap; the game draws frame N+1; after it: unwrap (callbacks run in the order asked)
      requestAnimationFrame(() => {
        renderer.renderBufferDirect = wrap;
        requestAnimationFrame(() => {
          renderer.renderBufferDirect = orig;
          const list = [...rows.values()];
          resolve({ calls: list.reduce((s, r) => s + r.calls, 0), tris: list.reduce((s, r) => s + r.tris, 0), fps: document.querySelector('#fps').textContent, list });
        });
      });
    });
  });
}

function report(q, name, best) {
  console.log(`\n=== q${q} · ${name} · the heaviest way ${best.yaw}/8: ${best.calls} calls, ${Math.round(best.tris / 1000)}k triangles (the counter beside: ${best.fps})`);
  const by = new Map();
  for (const r of best.list) {
    const k = r.pass === 'post' ? 'post-processing (bloom)' : r.kind;
    const a = by.get(k) ?? { main: 0, shadow: 0, post: 0, tris: 0, inst: 0, single: 0 };
    a[r.pass] += r.calls; a.tris += r.tris; if (r.type === 'instanced') a.inst += r.calls; else a.single += r.calls;
    by.set(k, a);
  }
  console.log('  group                                    main shadow  post  all   k tris   in InstancedMesh / one by one');
  for (const [k, a] of [...by].sort((x, y) => (y[1].main + y[1].shadow + y[1].post) - (x[1].main + x[1].shadow + x[1].post))) {
    const all = a.main + a.shadow + a.post;
    console.log(`  ${k.padEnd(40)} ${String(a.main).padStart(4)} ${String(a.shadow).padStart(6)} ${String(a.post).padStart(5)} ${String(all).padStart(4)} ${String(Math.round(a.tris / 1000)).padStart(7)}   ${a.inst} / ${a.single}`);
  }
  // what could be fewer calls: (1) single meshes with the same geometry and material in a pass - one InstancedMesh;
  // (2) InstancedMeshes of the same geometry and material (cells of a scatter, cut up for the culling) - one each;
  // (3) a skinned character drawn in parts, one call per material - one call if its materials were one atlas
  const same = new Map(), cells = new Map(), parts = new Map();
  for (const r of best.list) {
    if (r.pass === 'post') continue;
    const gm = `${r.pass}|${r.geo}|${r.mat}`;
    if (r.type === 'mesh') same.set(gm, [...(same.get(gm) ?? []), r]);
    if (r.type === 'instanced') cells.set(gm, [...(cells.get(gm) ?? []), r]);
    if (r.type === 'skinned') { const k = `${r.pass}|${r.kind}|${r.root}|${r.at}`; parts.set(k, [...(parts.get(k) ?? []), r]); }
  }
  const byMat = new Map();
  for (const r of best.list) if (r.pass !== 'post' && r.type === 'mesh') { const k = `${r.pass}|${r.mat}`; byMat.set(k, [...(byMat.get(k) ?? []), r]); }
  const save = (m) => [...m.values()].filter((l) => l.length > 1).reduce((s, l) => s + l.length - 1, 0);
  const matSave = save(byMat);
  const matWhat = [...new Set([...byMat.values()].filter((l) => l.length > 1).map((l) => `${l[0].kind} x${l.length}`))];
  const sameSave = save(same), cellSave = save(cells), partSave = save(parts);
  const sameWhat = [...same.values()].filter((l) => l.length > 1).map((l) => `${l[0].kind} x${l.length}`);
  console.log(`  could be fewer: single meshes of one geometry+material ${sameSave} (${[...new Set(sameWhat)].join(', ') || 'none'}); cells of one scatter ${cellSave}; skinned parts ${partSave}; single meshes of one material, other geometry ${matSave} (${matWhat.join(', ')})`);
  rowsOut.push({ q, name, calls: best.calls, tris: best.tris, by: Object.fromEntries(by), sameSave, cellSave, partSave, matSave });
  if (raw) {
    const sig = new Map();
    for (const r of best.list) {
      const k = `${r.kind} | ${r.pass} ${r.type} ${r.matName} ${r.map || '-'} #${r.color}${r.transparent ? ' T' : ''} ${r.per}t`;
      const a = sig.get(k) ?? { calls: 0, tris: 0, objects: 0, inst: 0, at: r.at };
      a.calls += r.calls; a.tris += r.tris; a.objects++; a.inst += r.instances; sig.set(k, a);
    }
    for (const [k, a] of [...sig].sort((x, y) => y[1].calls - x[1].calls)) console.log(`  ${String(a.calls).padStart(4)} calls ${String(Math.round(a.tris / 1000)).padStart(5)}k  ${String(a.objects).padStart(3)} obj ${String(a.inst).padStart(5)} inst  ${k}${a.at ? ' at ' + a.at : ''}`);
  }
}
