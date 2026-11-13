// node tools/budget.mjs [query] : where the triangles go at the spawn point (in view / shadow casters / total)
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto('http://localhost:5173/?' + (process.argv[2] || 'q=2'), { waitUntil: 'networkidle' });
await page.waitForSelector('#play', { state: 'visible' }); await page.click('#play');
await page.waitForTimeout(5000);
const rows = await page.evaluate(() => {
  const { scene, camera, THREE } = __game;
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const out = {};
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry, tris = (g.index ? g.index.count : g.attributes.position.count) / 3, n = o.isInstancedMesh ? o.count : 1;
    const verts = g.attributes.position.count;
    const key = `${tris | 0}t/${verts}v ${o.material.map ? 'tex' : 'flat'}${o.material.alphaTest ? ' cut' : ''}${o.isSkinnedMesh ? ' skin' : ''}`;
    const r = (out[key] ??= { inst: 0, total: 0, view: 0, shadow: 0, meshes: 0 });
    r.meshes++; r.inst += n; r.total += tris * n;
    const inView = !o.frustumCulled || fr.intersectsObject(o);
    if (inView) r.view += tris * n;
    if (o.castShadow) r.shadow += tris * n;
  });
  return Object.entries(out).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.view + b.shadow - a.view - a.shadow);
});
let tv = 0, ts = 0;
for (const r of rows.slice(0, 28)) console.log(`${r.k.padEnd(34)} meshes ${String(r.meshes).padStart(3)} inst ${String(r.inst).padStart(5)}  view ${String(Math.round(r.view / 1000)).padStart(4)}k  shadowCasters ${String(Math.round(r.shadow / 1000)).padStart(4)}k`);
for (const r of rows) { tv += r.view; ts += r.shadow; }
console.log('TOTAL in view', Math.round(tv / 1000) + 'k', '| all shadow casters (before culling)', Math.round(ts / 1000) + 'k', '|', await page.textContent('#fps'));
await browser.close();
