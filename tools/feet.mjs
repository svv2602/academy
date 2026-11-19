// node tools/feet.mjs [port] : how far the feet of the heroine, the cat and the pet slide on the ground (a tool for a
// person: the numbers behind the pace of the steps, src/game/stride.ts). Plays the built game (dist/) with ?debug.
//
// A foot is the lowest part of a character: the vertices of its skinned meshes within the lowest 4 % of its height in
// the pose of the moment, grouped by side (and by front and back for four legs) - the cat has no bones in its legs, so
// bones would not do. A foot stands when its middle is within 1.5 cm of its lowest point in the measure.
//  1. In place: each walking clip is played at its own pace with the character held still; while a foot stands it goes
//     back under the body at the clip's own ground speed (m/s at a pace of 1) - what a pace must be divided into.
//  2. In the game: the heroine runs and stops by the keys while the cat and the pet catch up; every frame the speed of
//     each standing foot over the ground is a slide. Printed: the mean slide of a standing foot, m/s, and its share of
//     the speed of the body, by character.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { endSlide, installFeet, startSlide } from './feet-lib.mjs';

const port = Number(process.argv[2] || 4231);
const url = `http://localhost:${port}/?debug&q=0`;
const server = spawn(process.execPath, ['tools/e2e.mjs', '--serve', String(port)], { stdio: 'ignore', detached: true });
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) return; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); /* clock: page-load */ } throw new Error('no server'); };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  await up();
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(url);
  await page.waitForSelector('#play', { state: 'visible', timeout: 90000 }); /* clock: page-load */
  // a game played before (no opening scene, no tour), the fawn found and chosen
  await page.evaluate(() => {
    const s = __game.save; s.played = true; s.worlds.fairy ??= {}; s.worlds.fairy.flags ??= {}; s.worlds.fairy.flags.pet = true; s.pet = 'fawn';
    s.worlds.fairy.toured = true;
  });
  await page.click('#play');
  await page.waitForFunction(() => __game.pet && !__game.busy && document.querySelector('#start').classList.contains('hidden'), null, { timeout: 90000 }); /* clock: measure */
  await page.waitForTimeout(6000); /* clock: measure */

  // the helpers of the page: the feet of a character and their middles
  await installFeet(page);

  // 1. in place: the clip's own ground speed
  const inPlace = await page.evaluate(() => {
    const out = {};
    const cast = [['hero', __game.hero, ['Walk', 'Run'], false], ['cat', __game.cat, ['Walk', 'Run'], true], ['pet', __game.pet, ['Walk', 'Gallop'], true]];
    for (const [who, a, clips, four] of cast) {
      for (const clip of clips) {
        const at = a.root.position.clone(), dt = 1 / 120;
        const { groups, height } = window.__feet(a, four);
        a.play(clip, 0, 1);
        for (let i = 0; i < 120; i++) a.update(dt);   // the fade is over, the clip plays alone
        const fwd = { x: Math.sin(a.heading), z: Math.cos(a.heading) };
        const tracks = Object.fromEntries(Object.keys(groups).map((k) => [k, []]));
        for (let i = 0; i < 480; i++) {
          a.update(dt); a.root.position.copy(at); a.root.updateMatrixWorld(true);
          for (const k in groups) { const m = window.__mid(groups[k]); tracks[k].push([m.x, m.y, m.z]); }
        }
        // as in the game: the lowest foot, down (within 3 % of the height of its lowest), going back
        const back = [], keys = Object.keys(tracks), near = Math.max(0.02, height * 0.03);
        const lo = Object.fromEntries(keys.map((k) => [k, Math.min(...tracks[k].map((p) => p[1]))]));
        for (let i = 1; i < 480; i++) {
          let k = keys[0];
          for (const f of keys) if (tracks[f][i][1] < tracks[k][i][1]) k = f;
          const t = tracks[k];
          if (t[i][1] > lo[k] + near || t[i - 1][1] > lo[k] + near) continue;
          const b = -((t[i][0] - t[i - 1][0]) * fwd.x + (t[i][2] - t[i - 1][2]) * fwd.z) / dt;
          if (b > 0) back.push(b);
        }
        back.sort((p, q) => p - q);
        out[`${who} ${clip}`] = { groundSpeed: +(back[back.length >> 1] ?? 0).toFixed(3), q1: +(back[back.length >> 2] ?? 0).toFixed(2), q3: +(back[(back.length * 3) >> 2] ?? 0).toFixed(2), samples: back.length, feet: Object.keys(groups).join(' ') };
      }
    }
    return out;
  });
  console.log('in place, the ground speed of a clip at a pace of 1 (m/s):');
  for (const [k, r] of Object.entries(inPlace)) console.log(`  ${k.padEnd(10)} ${String(r.groundSpeed).padStart(6)}  (quartiles ${r.q1}-${r.q3}; ${r.samples} standing samples; feet ${r.feet})`);

  // 2. in the game: run and stop, the others catch up
  await startSlide(page);
  for (const [key, ms] of [['ArrowUp', 1500], [null, 1500], ['ArrowLeft', 600], ['ArrowUp', 2500], [null, 2000], ['ArrowRight', 900], ['ArrowUp', 1200], [null, 2000]]) {
    if (key) await page.keyboard.down(key);
    await page.waitForTimeout(ms); /* clock: measure */
    if (key) await page.keyboard.up(key);
  }
  const res = await endSlide(page);
  console.log('in the game, a standing foot over the ground (mean m/s; share of the body\'s speed; worst m/s):');
  for (const [k, r] of Object.entries(res)) console.log(`  ${k.padEnd(5)} slide ${String(r.slide).padStart(6)}  share ${String(r.share).padStart(6)}  worst ${r.worst}  steady share ${r.steady} (${r.steadyN})  (${r.samples} samples, ${r.frames} frames, ${r.moved} m from start to end)`);

  // 3. the smoothness of the pet and the cat over 10 s of running (two turns, two stops): how often a clip changes (Walk,
  // Run or Gallop, Idle), how much the pace jumps from frame to frame, how fast the heading turns at the worst
  await page.evaluate(() => {
    const log = window.__smoothLog = { pet: [], cat: [] };
    const tick = () => {
      for (const [k, a] of [['pet', __game.pet], ['cat', __game.cat]]) {
        if (a) { const act = a.actions.get(a.current); log[k].push({ t: __game.time, clip: a.current, pace: act ? act.timeScale : 0, h: a.heading }); }
      }
      if (!window.__smoothStop) requestAnimationFrame(tick);
    };
    window.__smoothStop = false; requestAnimationFrame(tick);
  });
  // runs with a turn, stops and starts again, as a child plays: 10 s of it
  for (const keys of [['ArrowUp'], ['ArrowUp', 'ArrowLeft'], ['ArrowUp'], [], ['ArrowUp'], ['ArrowUp', 'ArrowRight'], ['ArrowUp'], []]) {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(keys.length === 2 ? 500 : 1500); /* clock: measure */
    for (const k of keys) await page.keyboard.up(k);
  }
  const smooth = await page.evaluate(() => {
    window.__smoothStop = true;
    const out = {};
    for (const [k, log] of Object.entries(window.__smoothLog)) {
      if (!log.length) continue;
      let switches = 0, jump = 0, turn = 0, n = 0; const seq = [log[0].clip];
      for (let i = 1; i < log.length; i++) {
        const a = log[i - 1], b = log[i], dt = b.t - a.t;
        if (dt <= 0) continue;
        if (b.clip !== a.clip) { switches++; seq.push(`${b.t.toFixed(1)} ${b.clip}`); }
        else { jump += Math.abs(b.pace - a.pace); n++; }
        let dh = b.h - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        turn = Math.max(turn, Math.abs(dh) / dt);
      }
      const secs = log.at(-1).t - log[0].t;
      out[k] = { secs: +secs.toFixed(1), switches, perTen: +(switches * 10 / secs).toFixed(1), paceJump: +(jump / Math.max(1, n)).toFixed(3), turn: +turn.toFixed(1), frames: log.length, seq: seq.join(' -> '), clips: [...new Set(log.map((f) => f.clip))].join(' ') };
    }
    return out;
  });
  for (const [k, r] of Object.entries(smooth)) {
    console.log(`the ${k} over ${r.secs} s of running: ${r.switches} changes of clip (${r.perTen} in 10 s; ${r.clips}), the pace jumps ${r.paceJump} a frame on the mean, the worst turn ${r.turn} rad/s (${r.frames} frames)\n  ${r.seq}`);
  }
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch { /* gone */ }
}
