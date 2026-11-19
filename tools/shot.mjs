// Full play-through smoke test: node tools/shot.mjs <url> <outDir> [desktop|mobile|desktop-tall|mobile-portrait]
// Plays the whole first world through the real UI handlers (talk to every character, solve all 15 tasks,
// make three deliberate mistakes per task type to exercise the three rungs of the hints, restore the crystal), saves screenshots
// and fails on anything suspicious. Every screenshot is also a layout check of the screen it shows.
// On the way it closes the butterflies task twice with its own button and comes back to it, compares the skills
// before and after the star search, and breaks a conversation and the finale once each on purpose to see that the
// heroine walks afterwards. The voice: a tap on the cat and on the speech bubble says the line once more (only while
// the voice is silent), a conversation started right after the fifth star of the search is heard to its end, the
// cat's "go on" after a shard comes with its subtitle, and the planner of spoken lines turns away nothing but the
// lines this scenario provokes.
// Debug tools (ARCH-11, ARCH-14): the game is played with ?debug in the address (window.__game, the frame counter, the
// tuning panel exist only then); before the walkthrough the built game is opened once without it, in a browser context
// of its own (nothing it stores reaches the walkthrough), and must have none of the three. In the walkthrough the speed
// slider of the tuning panel must slow the heroine down (the path she walks in the same time), the open panel is a picture.
// The parents' section: the gate asks to multiply two numbers from 6 to 9, a wrong answer and a part of the right one
// open nothing, the right one opens it, the next opening asks another example; the section shows the day of the build
// and the commit number (compared with E2E_COMMIT).
// Without the voice (E2E_MUTE=1): the game is loaded with the voice volume 0 in its save, every clip must be started
// with zero volume, and on every picture of a task and of its hint the bubble shows the question of that task.
//
// Screen sizes (the size is one thing, the way of control another — see SIZES below):
//   mobile 844x390 (touch), desktop 1280x720 (mouse and keyboard), desktop-tall 1280x800 (mouse and keyboard),
//   mobile-portrait 390x844 (touch). Screenshots are named <outDir>/<size>-<screen>.png.
//
// Exit code: 0 — the world was completed and nothing was reported;
//            1 — console error or warning, page exception, stuck quest or timed-out wait, failed request
//                (network error or HTTP >= 400), request to another origin, element linking to another origin,
//                layout problem on a screen ("layout: <size> <screen>: …"): the document or a panel scrolls,
//                a panel, button or input is outside the window or cut off by its panel, two buttons or inputs
//                overlap, the speech bubble covers a button, a button is smaller than 44x44 px;
//            2 — bad arguments or environment.
// Environment:
//   Q=<0|1|2>               fixed graphics tier (?q=…); default: the game picks and lowers it itself
//   E2E_GL=gl|swiftshader   gl (default): real GPU; swiftshader: software rendering, for machines without a GPU
//   E2E_SLOW=<n>            multiplier for the scenario timeouts and pauses (default 1)
//   E2E_STUCK_MS=<ms>       how long one quest may take before it is reported as stuck (default 240000)
//   E2E_LEVEL=<1..5>        fix the level of every skill (the parents' setting, save.fixed) for the whole run, each
//                           within its own levels (the composition of a number starts at 3; with 1 or 2 it plays its
//                           level 4, the number house - see the start of the first world; 4 plays the neighbours of
//                           a number for the series, 5 the signs for comparing); default: adaptive, which
//                           stays on level 1 here because the scenario fails every task type once on purpose
//   E2E_OFFLINE=1           play without network: after the first load wait until the service worker is active and
//                           its whole precache list is in the cache, switch the network off, reload and play as
//                           usual. Needs the built game (the development server has no service worker)
//   E2E_MODELS_OUT=<file>   write the sorted JSON list of model files the page requested (see tools/models-used.json)
//   E2E_MUTE=1              play with the voice turned off (volume 0 in the save, as the parents' section writes it);
//                           default: with the voice
//   E2E_VOICE_OUT=<file>    write {"mute", "clips", "loud"}: was the voice off, how many clips were started and how
//                           many of them with a volume above zero
//   E2E_OFFLINE_MARK=<path> with E2E_OFFLINE=1: ask the server for this path right before the network is switched
//                           off, so that whoever serves the game knows what was asked for after it (tools/worlds.mjs)
//   E2E_COMMIT=<text>       the commit number the parents' section must show (tools/e2e.mjs: git rev-parse --short HEAD,
//                           or "no-git"); default: only the form of the version line is checked
//   E2E_WORLD=<id>          play another world of the registry (src/worlds/index.ts) instead of the first one, with
//                           ?world=<id>, by its description (tools/world-pass.mjs, ARCH-16): the items of
//                           window.__game.items - the chains of its characters, its secrets, the parts of the artifact
//                           that lie in it, its cutscenes, its tour, its pet, its finale - are done the way each says
//                           (the action button, walking there, a tap, by itself), in the order of "after". Before
//                           "play" the description is checked against the world template (docs/13-worlds.md): a point
//                           that lacks fails with its number and name; an item that does not get done fails with its
//                           id. Every screen is pictured with the layout check; the voice, the planner, the book, the
//                           stars, the save (the progress under worlds.<id>, worlds.fairy as it was), a reload and
//                           "start again" are checked as in the first world. With E2E_OFFLINE=1 the world is brought
//                           into the cache "worlds" before the network is switched off. E2E_WORLD_NEED=one|template
//                           and E2E_WORLD_OUT=<file>: see tools/world-pass.mjs. The scenarios of the first world are
//                           not played. Default: the first world, its full scenario
//   E2E_ONLY=<group>        play one group of tools/e2e-saves.mjs instead of the whole world: the page starts from the
//                           group's save (written once in the tab before the game loads; with E2E_MUTE=1 it holds the
//                           voice volume 0), "play" is pressed, the game must hold that save, and only the chains of the
//                           group's friends and its blocks are played; the checks at the end count only what was played.
//                           Pictures are named <outDir>/<size>-<group>-<screen>.png. Default: the whole world
import { chromium } from 'playwright-core';
import { gameWaits } from './game-wait.mjs';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { inflateRawSync } from 'zlib';
import { ACH_WHOLE, GROUPS, startSave } from './e2e-saves.mjs';
import { playWorld } from './world-pass.mjs';
import { storySheets } from './story-sheet.mjs';

const [url = 'http://localhost:5173/', out = 'shots', mode = 'desktop'] = process.argv.slice(2);
const GL_ARGS = {
  gl: ['--use-angle=gl', '--enable-gpu'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const gl = process.env.E2E_GL || 'gl';
const slow = Number(process.env.E2E_SLOW || 1);
const stuckMs = Number(process.env.E2E_STUCK_MS || 240000);
const level = process.env.E2E_LEVEL || '';
const seed = process.env.E2E_SEED || '';   // ?seed= of the game (ARCH-08): the same tasks in the same order
if (!['', '1', '2', '3', '4', '5'].includes(level)) { console.error(`bad E2E_LEVEL="${level}": expected 1, 2, 3, 4 or 5`); process.exit(2); }
const usage = (msg) => { console.error(msg); process.exit(2); };
// The size of the window and the way of control are separate things: a new size only says which group it is in.
const SIZES = {
  mobile: { width: 844, height: 390, touch: true },
  desktop: { width: 1280, height: 720, touch: false },
  'desktop-tall': { width: 1280, height: 800, touch: false },
  'mobile-portrait': { width: 390, height: 844, touch: true },
};
const size = SIZES[mode];
if (!size) usage(`unknown size "${mode}": use one of ${Object.keys(SIZES).join(', ')}`);
const touch = size.touch;
const MIN_BUTTON = 44;      // px: the smallest width and height of anything that is pressed with a finger
if (!GL_ARGS[gl]) usage(`unknown E2E_GL="${gl}": use "gl" (real GPU, default) or "swiftshader" (software rendering)`);
if (!(slow > 0)) usage(`bad E2E_SLOW="${process.env.E2E_SLOW}": expected a positive number`);
if (!(stuckMs > 0)) usage(`bad E2E_STUCK_MS="${process.env.E2E_STUCK_MS}": expected a positive number of milliseconds`);
if (!['', '0', '1'].includes(process.env.E2E_OFFLINE ?? '')) usage(`bad E2E_OFFLINE="${process.env.E2E_OFFLINE}": expected 1 (play without network) or 0`);
const offline = process.env.E2E_OFFLINE === '1';
const modelsOut = process.env.E2E_MODELS_OUT || '';
if (!['', '0', '1'].includes(process.env.E2E_MUTE ?? '')) usage(`bad E2E_MUTE="${process.env.E2E_MUTE}": expected 1 (play without the voice) or 0`);
const mute = process.env.E2E_MUTE === '1';
const voiceOut = process.env.E2E_VOICE_OUT || '';
const commit = process.env.E2E_COMMIT || '';
const offlineMark = process.env.E2E_OFFLINE_MARK || '';
if (offlineMark && !/^\/[\w./-]+$/.test(offlineMark)) usage(`bad E2E_OFFLINE_MARK="${offlineMark}": expected a path of the server, like /offline-mark`);
const worldId = process.env.E2E_WORLD || '';
if (worldId && !/^[a-z][a-z0-9_-]*$/.test(worldId)) usage(`bad E2E_WORLD="${worldId}": expected the id of a world of src/worlds/index.ts`);
if (worldId === 'fairy') usage('E2E_WORLD=fairy: the first world is played by the full scenario (its description still lacks points of the template, __game.missing()) - leave E2E_WORLD unset');
// E2E_ONLY: one group of the first world. `has(block)` says whether a block is played (every block without a group);
// `plays(friend)` whether a friend's chain is.
const only = process.env.E2E_ONLY || '';
const group = only ? GROUPS[only] : null;
if (only && !Object.hasOwn(GROUPS, only)) usage(`bad E2E_ONLY="${only}": expected one of ${Object.keys(GROUPS).join(', ')}`);
if (only && worldId) usage('E2E_ONLY and E2E_WORLD exclude each other: the groups are of the first world');
const t00 = Date.now(); /* clock: log-time */
const blocksPlayed = [];     // the blocks the walkthrough came to, in order
const has = (block) => {
  if (group && !group.blocks.includes(block)) return false;
  blocksPlayed.push(block); console.log(`block ${block}: ${((Date.now() - t00) / 1000).toFixed(0)}s`); /* clock: log-time */
  return true;
};
const listed = (block) => !group || group.blocks.includes(block);   // the same, without counting it as played
const plays = (friend) => !group || group.friends.includes(friend);
// The cat's "go on" after a shard is checked on the first two shards a walkthrough gets from friends it plays.
const shardTalks = !group || group.friends.length >= 2;
const tag = only ? `${mode}-${only}` : mode;   // the start of the names of the pictures and of the list of tasks
// E2E_WORLD: the progress of the first world the save starts with; the other world must leave it exactly as it is.
const FAIRY_KEPT = { quests: { unicorn: 3, fox: 1 }, final: false, starsTaken: [0, 2], flags: { chest: true }, pos: [3.5, 9] };
const STARS_KEPT = 7;
// The question(s) of every task type: what the bubble shows while the task waits for its answer.
const QUESTIONS = {
  count: ['t_count'], add: ['t_add'], sub: ['t_sub'], compare: ['t_compare_more', 't_compare_less'], pattern: ['t_pattern'], odd: ['t_odd'],
  pairs: ['t_pairs'], order: ['t_order'], sort: ['t_sort', 't_sort_two'], simon: ['t_simon_watch', 't_simon_repeat'], butterflies: ['t_count'], stars: ['t_stars'],
  missing: ['t_missing'], house: ['t_house'], neighbors: ['t_before', 't_after'], signs: ['t_signs'],
};
// Addition, take away, counting and the neighbours of a number ask the very example with its clip of the bank of the old game's clips (R37,
// src/core/voice.ts `sayBank`): the bubble then holds the key of the bank. Without network a clip not kept yet gives
// way to the general question above: there the bank's key is an error, and so is any request for a clip of the bank.
const BANK = { add: /^q_add_\d+_\d+$/, sub: /^q_sub_\d+_\d+$/, count: /^q_count_[a-z]+$/, neighbors: /^q_(before|after)_\d+$/ };
// A step of a chain whose kind follows the level of its skill (R34): the composition of a number (the deer's
// "compose") is the missing addend on levels 3 and 5 and the number house on 4; the number series (the mushroom king's
// "order") is the neighbours of a number on 4 and the numbers in order otherwise; comparing (the unicorn's and the
// queen's "compare") is the signs on 5 and the groups or digits otherwise. A run meets the kind of its level.
const BY_STEP = {
  compose: { skill: 'compose', kinds: ['missing', 'house'], want: (level) => (level === 4 ? 'house' : 'missing') },
  order: { skill: 'series', kinds: ['order', 'neighbors'], want: (level) => (level === 4 ? 'neighbors' : 'order') },
  compare: { skill: 'compare', kinds: ['compare', 'signs'], want: (level) => (level === 5 ? 'signs' : 'compare') },
};
const BY_LEVEL_KINDS = Object.values(BY_STEP).flatMap((b) => b.kinds);
// The solution a task shows after its second mistake (rung 2 of the hint, HINTS.md), once "try again" and the line have
// ended - what a child sees without the voice and without reading: numbers on the things counted, numbers (or dots)
// over the groups, the repeating links of the row, the number track walked from 1, the gem trying the baskets until
// its own keeps a frame, the sequence played again, the frame shared by the alike pictures of "what is odd", the dots
// counted up from the known number to the sum (the composition of a number), the cells of the track counted up to the
// empty one (the neighbours of a number), both numbers laid out as things in ten frames (the signs).
// Memory pairs have no hint: they open with every face shown.
const SHOWS = {
  count: '#taskStage .it i', add: '#taskStage .it i', sub: '#taskStage .it i', compare: '#taskStage .group em, #taskStage .dots', pattern: '#taskStage.units',
  odd: '#taskStage .it.alike', order: '#taskStage .track', sort: '#taskOpts .basket.own', simon: '#taskStage.watch',
  missing: '#taskStage .up', house: '#taskStage .up', neighbors: '#taskStage .road .cell.said', signs: '#taskStage .side .tf > .pt',
};
// What gives the answer away (HINTS.md, "Проверка ступени 1"): after the first mistake none of it may be on screen (R16).
const GIVEAWAY = ['#taskStage .it i', '#taskStage .group em', '#taskStage .dots', '#task .grow', '#task .shrink', '#task .alike', '#taskStage.units',
  '#task .pulse', '#taskStage.watch', '#taskStage .track', '#task .try', '#task .own', '#task .glow', '#task .away', '#taskStage .it.hit',
  '#taskStage .up', '#taskStage .dots-up', '#taskStage .cell.said', '#taskStage .side .tens'].join(', ');
let origin, host, basePath;
try { ({ origin, hostname: host, pathname: basePath } = new URL('.', url)); } catch { usage(`bad url "${url}"`); }
const T = (ms) => Math.round(ms * slow);
// The shown magic follows its target smoothly in game time: it is waited for by the game's clock (up to MAGIC_SETTLE s of
// game time), never by the wall clock - on the slow CI runner a second of game time takes many of the clock.
const MAGIC_SETTLE = 20;
// The magic of the world (WORLD-09, src/worlds/fairy/magic.ts): what a shard given back adds (SHARD_MAGIC), the point of
// the tour its two pictures are taken from (0-based) and how much they must differ (mean colour difference, 0..1).
const MAGIC_SHARD = 0.16, MAGIC_POINT = 2, MAGIC_DIFF = { all: 0.02, sky: 0.02 };

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: [
    ...GL_ARGS[gl], '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    // Second line of defence for "the check itself never goes to the internet": names other than the host under
    // test do not resolve at all (covers what request routing cannot see, e.g. service worker or WebSocket traffic).
    `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${host}`,
  ],
});
const errors = [];
let nRequests = 0;
const cancelled = [];
const origins = new Set();
const models = new Set();   // model files requested by the page, as paths under the site root: models/…
let networkOff = false;   // the offline walkthrough has switched the network off
let cachedFiles = null;     // offline run: how many files of the precache list were found in the cache
let worldFiles = null;      // offline run of another world: how many of its files the cache "worlds" held by then
let voiceUsed = null;       // { clips, loud }: voice clips started in the walkthrough, and those of them with a volume
const taskLog = [];        // the tasks met, in order (see __logTask below)
try {
  const viewport = { width: size.width, height: size.height };
  const ctxOptions = touch ? { viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport };
  const ctx = await browser.newContext(ctxOptions);
  // What Chrome actually draws with: E2E_GL=gl must be the machine's GPU. Some flags (e.g. --use-gl=egl) fall back to
  // SwiftShader silently; the line makes such a fallback visible at the top of the log.
  {
    const probe = await ctx.newPage();
    const renderer = await probe.evaluate(() => {
      const g = document.createElement('canvas').getContext('webgl2');
      if (!g) return 'no WebGL2';
      const info = g.getExtension('WEBGL_debug_renderer_info');
      return info ? g.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
    }).catch((e) => `unknown (${e.message})`);
    await probe.close();
    const soft = /swiftshader/i.test(renderer);
    console.log(`renderer: ${renderer} (E2E_GL=${gl}${gl === 'gl' && soft ? ' - WARNING: software rendering, not the GPU' : ''})`);
  }

  // ---- network: every request of the context (pages and the service worker) must stay on our own origin ----
  const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };
  // Requests to other origins are cut off right here, so the check never talks to the internet.
  await ctx.route((u) => !own(u.href), (route) => route.abort());
  ctx.on('request', (r) => {
    nRequests++;
    const u = r.url();
    if (!/^(data|blob):/.test(u)) { try { origins.add(new URL(u).origin); } catch { origins.add(u); } }
    if (!own(u)) errors.push(`external request: ${r.method()} ${u} (${r.resourceType()})`);
    // Without network the game asks its cache first (R37): a clip of the bank is never requested then.
    if (networkOff && !r.serviceWorker() && /\/bank\/[^/]+\.mp3/.test(u)) errors.push(`without network the game asked for a clip of the bank: ${u}`);
    // Model files the PAGE asked for. The service worker downloads its whole precache list when it installs, needed
    // or not, so its own requests say nothing about what the game uses and are left out.
    if (!r.serviceWorker() && u.startsWith(origin + basePath + 'models/')) models.add(decodeURIComponent(new URL(u).pathname.slice(basePath.length)));
  });
  ctx.on('requestfailed', (r) => {
    if (!own(r.url())) return;                       // already reported as an external request
    const why = r.failure()?.errorText ?? 'unknown error';
    // The only tolerated failure: the browser itself cancelling a request it no longer needs (page or browser
    // closing in the middle of the service worker precache, a sound stopped or replaced while still loading).
    if (why === 'net::ERR_ABORTED') { cancelled.push(r.url()); return; }
    errors.push(`request failed: ${r.url()} (${why})`);
  });
  ctx.on('response', (r) => { if (r.status() >= 400) errors.push(`request failed: ${r.url()} (HTTP ${r.status()})`); });

  // R61: the gift of the day (PLAY-21) is held in every tab of the walkthrough from its first page on - the saves of the
  // pieces (tools/e2e-saves.mjs) then play the same whatever the real date, and "play" brings the same-day welcome back.
  // The walkthrough's own lever (__game.gift, ?debug only: the game reads it from the tab's storage); only the block
  // "welcome" lets it go, and pulls it again. Once per tab: a reload keeps what the block left.
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('e2e-gift')) return;
    sessionStorage.setItem('e2e-gift', '1');
    sessionStorage.setItem('amw-gift-hold', '1');
    // the deal of the day too (src/game/deal.ts): its price depends on the date; only the block "deal" lets it go
    sessionStorage.setItem('amw-deal-hold', '1');
    // the break too (PLAY-20): its minutes are real time, a slow machine would meet the card in another block; only the
    // block "break" lets it go
    sessionStorage.setItem('amw-break-hold', '1');
  });
  const page = await ctx.newPage();
  // The voice is played by Audio elements that are not in the document: every one that was started is remembered
  // (the last few), so that the scenario can tell whether a spoken line is sounding.
  // Also counted: how many times each clip was started (__starts, by the name of the line) and the serial number of
  // every start (__plays; on the element: __n), so that the scenario can tell what was started since a moment.
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play, started = window.__started = [], starts = window.__starts = {};
    window.__plays = 0;
    window.__loud = [];         // clips started with a volume above zero: none of them in a walkthrough without the voice
    // A character's clip `<key>@<voice>` (VOICE-10) counts as its line `<key>`.
    window.__clip = (a) => decodeURIComponent((a.src.match(/(?:voice|bank)\/(.+)\.mp3/) ?? [])[1] ?? '').split('@')[0];
    HTMLMediaElement.prototype.play = function () {
      started.push(this); if (started.length > 8) started.shift();
      const id = window.__clip(this); starts[id] = (starts[id] ?? 0) + 1; this.__n = ++window.__plays;
      if (this.volume > 0 && !this.muted) window.__loud.push(id);
      return play.call(this);
    };
  });
  // The tasks of the walkthrough, in the order they open (ARCH-08): the kind and what is on the panel, read in the frame
  // after the panel shows. With E2E_SEED the game draws its tasks from that seed, and two walkthroughs with one seed must
  // print the same fingerprint. The list lives in node: the reloads of the scenario do not lose it.
  await page.exposeFunction('__logTask', (t) => { taskLog.push(t); });
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const root = document.getElementById('task');
      if (!root) return;
      let open = false;
      new MutationObserver(() => {
        const now = !root.classList.contains('hidden');
        if (now && !open) requestAnimationFrame(() => {
          const stage = document.getElementById('taskStage'), opts = document.getElementById('taskOpts');
          window.__logTask(`${stage?.className ?? ''} | ${stage?.textContent ?? ''} | ${opts?.textContent ?? ''}`);
        });
        open = now;
      }).observe(root, { attributes: true, attributeFilter: ['class'] });
    });
  });
  // Without the voice: the game starts from a save that holds nothing but the voice volume 0 - what the slider of the
  // parents' section writes. Only when there is no save yet: the reloads of this scenario keep the game's own save.
  // E2E_WORLD (before it): a save of version 3 with the first world's progress (and the voice volume 0 without the
  // voice), written once in the tab - after "start again" the page must start from no save at all.
  if (worldId) {
    await page.addInitScript(([fairy, stars, quiet]) => {
      if (sessionStorage.getItem('e2e-world-save')) return;
      sessionStorage.setItem('e2e-world-save', '1');
      if (!localStorage.getItem('amw-save')) localStorage.setItem('amw-save', JSON.stringify({ v: 3, stars, ...(quiet ? { vol: { voice: 0 } } : {}), worlds: { fairy } }));
    }, [FAIRY_KEPT, STARS_KEPT, mute]);
  }
  // E2E_ONLY: the group's save (or none), written once in the tab, before the game loads: the reloads of the scenario
  // (offline, leaving the page, "start again") keep the game's own save.
  const groupSave = group ? startSave(only, { mute }) : '';
  if (group) {
    await page.addInitScript((save) => {
      if (sessionStorage.getItem('e2e-only-save')) return;
      sessionStorage.setItem('e2e-only-save', '1');
      if (save) localStorage.setItem('amw-save', save);
    }, groupSave);
  }
  if (mute) await page.addInitScript(() => { if (!localStorage.getItem('amw-save')) localStorage.setItem('amw-save', JSON.stringify({ v: 2, vol: { voice: 0 } })); });
  // Is the voice really what this walkthrough was asked for? Every clip started so far is looked at, not the setting.
  const checkVoice = async (when) => {
    const v = await g(() => ({ clips: window.__plays, loud: window.__loud.length, first: window.__loud[0], vol: __game.save.vol.voice }));
    if (mute && (v.loud || v.vol !== 0)) throw new Error(`the walkthrough without the voice is played with it (${when}): ${v.loud} of ${v.clips} clips were started with a volume, the first one "${v.first}"; the voice volume in the save is ${v.vol}`);
    if (!mute && v.loud !== v.clips) throw new Error(`the walkthrough with the voice (${when}): ${v.clips - v.loud} of ${v.clips} clips were started with zero volume`);
    if (!v.clips) throw new Error(`no voice clip was started (${when}): the volume of the voice went unchecked`);
    return v;
  };
  // The bubble on a picture of a task: is it shown, with what text, and which line does the game remember for a repeat.
  const bubbleNow = () => g(() => ({ shown: !document.querySelector('#bubble').classList.contains('hidden'), text: document.querySelector('#bubbleText').textContent.trim(), key: __game.line }));
  const asked = {};           // task type -> the bubble on its "task-…" picture
  // On the picture of a task the bubble shows the question of that task (VOICE-09).
  // The one exception: with the voice the question of the star search is shown for six seconds only (the heroine
  // walks, the bubble must not hang over the world), and a slow machine takes the picture later than that. The game
  // still remembers the question then - that is what is checked; without the voice no timer hides it (see below).
  /** The bubble holds a question of the type: its general question, or online its example's clip of the bank. */
  const isQuestion = (type, key) => QUESTIONS[type].includes(key) || (!offline && !!BANK[type]?.test(key ?? ''));
  const checkQuestion = async (type) => {
    const b = asked[type] = await bubbleNow();
    const timed = type === 'stars' && !mute;
    if (!timed && (!b.shown || !b.text)) errors.push(`question: ${mode} task-${type}: the bubble with the question is not shown`);
    else if (offline && BANK[type]?.test(b.key ?? '')) errors.push(`question: ${mode} task-${type}: without network the bubble shows the bank's "${b.key}" (${b.text}), not the general question (${QUESTIONS[type].join(' / ')})`);
    else if (!isQuestion(type, b.key)) errors.push(`question: ${mode} task-${type}: the bubble shows "${b.key}" (${b.text}), not the question of the task (${QUESTIONS[type].join(' / ')})`);
    // Without network the general question is said by its recorded clip, not by the synthesizer (R37).
    else if (offline && BANK[type] && !(await page.evaluate((k) => (window.__starts[k] ?? 0) > 0, b.key))) {
      errors.push(`question: ${mode} task-${type}: without network the clip of the general question "${b.key}" was never started`);
    }
  };
  /**
   * At the end: online, a walkthrough that met addition, take away or counting heard at least one example asked by its
   * clip of the bank (the question of the example reached the bubble and the voice); offline, none.
   */
  const checkBank = async () => {
    const met = Object.keys(BANK).filter((t) => asked[t]);
    if (!met.length) return;
    const byBank = met.filter((t) => BANK[t].test(asked[t].key ?? ''));
    const clips = await page.evaluate(() => Object.keys(window.__starts).filter((k) => /^q_(add|sub|count|before|after)_/.test(k)));
    console.log(`bank: ${byBank.length ? byBank.map((t) => `${t} ${asked[t].key}`).join(', ') : 'no example asked by the bank'}; clips of the bank started: ${clips.length}`);
    if (offline) { if (clips.length) errors.push(`bank: ${mode}: without network clips of the bank sounded: ${clips.join(' ')}`); return; }
    if (!byBank.length) errors.push(`bank: ${mode}: ${met.join(', ')} met, but no example was asked by its clip of the bank (only ${met.map((t) => asked[t].key).join(' ')})`);
    else if (!clips.length) errors.push(`bank: ${mode}: the bubble showed ${byBank.map((t) => asked[t].key).join(' ')}, but no clip of the bank was started`);
    else {
      // R37: a clip is kept when first played (the service worker's cache "bank", vite.config.ts). A clip asked for
      // before the worker took the page is not; one of the clips played must be.
      const kept = await page.evaluate(async (keys) => {
        const out = [];
        for (const k of keys) if (await caches.match(new URL(`bank/${k}.mp3`, location.href).href)) out.push(k);
        return out;
      }, clips);
      console.log(`bank: clips kept in the cache: ${kept.length} of ${clips.length}`);
      if (!kept.length) errors.push(`bank: ${mode}: ${clips.length} clips of the bank were played, but none of them is kept in the cache`);
    }
  };
  // On the picture of a hint: with the voice the bubble shows the hint the cat says; without the voice it still shows
  // the question, with the same text as before the mistake. "Watch and repeat" has two questions and replays its
  // show after the hint, the butterflies get their question back after the cat's count: there both are right with the voice.
  const checkHint = async (type) => {
    const b = await bubbleNow(), was = asked[type], name = `${mode} hint-${type}`;
    if (!b.shown || !b.text) { errors.push(`question: ${name}: the bubble is not shown`); return; }
    const question = isQuestion(type, b.key);
    if (mute) {
      if (!question) errors.push(`question: ${name}: without the voice the bubble shows "${b.key}" (${b.text}), not the question of the task (${QUESTIONS[type].join(' / ')})`);
      else if (was && b.key === was.key && b.text !== was.text) errors.push(`question: ${name}: the text of the question changed: "${was.text}" -> "${b.text}"`);
    } else if (question ? type !== 'simon' && type !== 'butterflies' : !/^h\d?_/.test(b.key ?? '')) {
      errors.push(`question: ${name}: with the voice the bubble shows "${b.key}" (${b.text}), not the hint of the task`);
    }
  };
  const sounding = () => page.evaluate(() => window.__started.some((a) => !a.paused && !a.ended));
  // The rung of a hint is shown once "try again" and its line have been said (src/game/taskviews/flow.ts): the mark of the
  // rung is the event waited for. Its ceiling - 20 s - runs out only in silence: while a line still sounds (a loaded machine
  // stretches them) the wait goes on, up to three times that; a hint stuck in silence fails as before.
  const hintRan = async (sel) => {
    for (let i = 0; i < 3; i++) {
      if (await page.waitForSelector(sel, { state: 'attached', timeout: T(20000) }).then(() => true, () => false)) return true; /* clock: audio */
      if (!(await sounding())) return false;
    }
    return false;
  };
  const silence = () => page.waitForFunction(() => !window.__started.some((a) => !a.paused && !a.ended), null, { timeout: T(20000) }); /* clock: audio */
  // What the game does in its own time is waited for by its clock (tools/game-wait.mjs): gameUntil - true / false after
  // its seconds of game time, gameFor - the same as a promise that fails; a game that stands still fails at once.
  const { gameUntil, gameFor } = gameWaits(page, { ceiling: T(600000) }); /* clock: ceiling */
  // `n` frames drawn by the page - an event, not a time: as many as it takes, however slow the frames are.
  // What the screen shows and holds, for a wait that ran out: the panels shown, the buttons and whether they can be
  // pressed, what holds the game. Asked with a limit of its own: a page that does not answer says so.
  const screenState = () => within('the state of the screen', g(() => {
    const ids = ['start', 'sleep', 'wake', 'play', 'setup', 'loading', 'breakCard', 'breakYes', 'breakNo', 'fanfare', 'task', 'bubble', 'hud', 'book', 'parents', 'story'];
    const shown = ids.filter((id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') && e.getClientRects().length; });
    const off = [...document.querySelectorAll('button')].filter((b) => b.disabled && b.getClientRects().length).map((b) => b.id || b.textContent.trim().slice(0, 12));
    const gm = window.__game;
    return { shown, disabled: off, hidden: document.hidden, time: gm?.time, busy: gm?.busy, paused: gm?.paused, inTask: gm?.inTask, line: gm?.line,
      ach: gm && { scene: gm.ach.scene, queue: [...(gm.ach.queue ?? [])], held: gm.ach.held, over: { ...(gm.ach.over ?? {}) } },
      session: gm?.save.session, breakMin: gm?.save.breakMin, update: gm?.update && { state: gm.update.state(), held: gm.update.held() } };
  }), T(10000)).then((x) => JSON.stringify(x), (e) => `(no answer: ${e.message})`); /* clock: page-load */
  // A promise of the page with a limit of the clock: one that never settles fails with `what`, not by the job's own limit
  // with nothing in the log (2026-11-19: the whole session on the runner stopped in the block "break" twice, silent).
  const within = (what, p, ms) => {
    let timer;
    const late = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${what}: nothing after ${Math.round(ms / 1000)} s of the clock`)), ms); });
    return Promise.race([p, late]).finally(() => clearTimeout(timer));
  };
  // `n` frames drawn by the page - an event, not a time: as many as it takes, however slow the frames are; none for a
  // minute of the clock is a page that stopped drawing (said with what the screen shows).
  const framesDrawn = (n = 2) => within(`${n} frame(s) drawn`, g((n) => new Promise((r) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), n), T(60000)) /* clock: page-load */
    .catch(async (e) => { throw new Error(`${e.message}: the page stopped drawing - ${await screenState()}`); });
  // The page has come to rest after a tap: no CSS animation or transition of a finite length still runs (the browser runs
  // them by the wall clock: an element entering, a panel sliding; an endless one - a pulse - is not waited for), then a
  // frame is drawn with what it shows now.
  const calm = async () => {
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'
      || !Number.isFinite(a.effect?.getComputedTiming?.().endTime)), null, { timeout: T(20000) }).catch(() => {}); /* clock: dom-anim */
    await framesDrawn(1);
  };
  // `s` seconds of game time - for a check that needs the game to have run a while (the heroine would have walked by now).
  const gameSeconds = (s) => gameUntil(() => false, null, s);
  // The camera has come to rest (it stops moving between two looks; it glides in game time): before a picture or a tap
  // that depends on where things are on the screen. False after `s` s of game time still moving.
  const cameraRests = async (s = 10) => {
    await g(() => { window.__camPrev = null; });
    return gameUntil(() => {
      const p = __game.camera.position.toArray(), w = window.__camPrev;
      window.__camPrev = p;
      return !!w && Math.hypot(p[0] - w[0], p[1] - w[1], p[2] - w[2]) < 1e-3;
    }, null, s);
  };
  // The shown magic comes to `want` (within 0.001) in MAGIC_SETTLE s of game time.
  const magicSettles = (want) => gameUntil((w) => Math.abs(__game.magic.value - w) <= 0.001, want, MAGIC_SETTLE);
  // The only errors the scenario expects: it breaks a scene on purpose (__game.failNext) - a conversation once and the
  // finale once - to see that the heroine is not left standing. Excused is the text of that very scene only, only
  // while the scenario waits for it, and only once.
  // The first line is the message; the lines after it are the stack of the error, different in every build.
  const sceneFault = (name) => `error: scene "${name}" failed: Error: broken on purpose by __game.failNext()`;
  const fault = { text: '', expected: 0, seen: 0 };
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = `${m.type()}: ${m.text()}`;
    if (fault.seen < fault.expected && text.split('\n')[0] === fault.text) { fault.seen++; return; }
    errors.push(text);
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('websocket', (ws) => { if (!own(ws.url().replace(/^ws/, 'http'))) errors.push(`external request: WebSocket ${ws.url()}`); });
  // Every picture of a screen is also a layout check of that screen (the failure picture is taken without it).
  const picture = (n) => page.screenshot({ path: `${out}/${tag}-${n}.png` });
  // A panel measured while it still flies in is cut off by its own frame. On a starved CI runner the entrance
  // animations (style.css: the task panel's "rise", the bubble's "pop", the card's "pop2", the fanfare's "fade") take
  // seconds instead of a fraction of one, so a picture waits for them - and only for them: a hint's show of the answer
  // is a different animation, and it is pictured while it runs.
  const ENTRANCES = new Set(['rise', 'pop', 'pop2', 'fade']);
  const entered = () => page.waitForFunction((names) => document.getAnimations()
    .every((a) => !(names.includes(a.animationName) && a.playState === 'running')), [...ENTRANCES], { timeout: T(10000) }).catch(() => {}); /* clock: dom-anim */
  // The picture is taken again when a panel started to fly in between it and the measure; the third try measures anyway.
  const shot = async (n) => {
    for (let i = 0; i < 3; i++) { await entered(); await picture(n); if (await checkLayout(n, i === 2)) return; }
  };
  const wait = (ms) => page.waitForTimeout(T(ms)); /* clock: helper */
  const g = (fn, ...a) => page.evaluate(fn, ...a);
  const visible = (sel) => g((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden'); }, sel);
  const press = (sel) => page.locator(sel).dispatchEvent(touch ? 'pointerdown' : 'click').catch(() => {});
  const act = () => (touch ? press('#btnAct') : page.keyboard.press('KeyE'));
  // A real tap or click: fails when the element is hidden, covered by another one or outside the window.
  // First the element and its parents end their entrance animations (the task panel rises for .35 s): on a starved
  // CI runner such an animation takes seconds, the element is not "stable" for Playwright all that time, and the tap
  // either times out or lands late. Endless animations (a pulse) are not waited for; a slow one ends the wait after
  // 20 s and the tap then reports why it failed.
  const settled = (sel) => page.waitForFunction((s) => {
    const e = document.querySelector(s);
    return !!e && document.getAnimations().every((a) => {
      const t = a.effect?.target;
      return !(t instanceof Element && t.contains(e) && a.playState === 'running' && Number.isFinite(a.effect.getComputedTiming().endTime));
    });
  }, sel, { timeout: T(20000) }).catch(() => {}); /* clock: dom-anim */
  const tapOn = async (sel) => {
    await settled(sel);
    // Playwright waits for two still frames before a click; on the CI runner (2-20 frames a second, slower in the desktop
    // sizes) 5 s was not always enough for the tuning button.
    return touch ? page.tap(sel, { timeout: T(15000) }) : page.click(sel, { timeout: T(15000) }); /* clock: input-event */
  };
  // Why a tap failed: the first line of the error and the last steps of Playwright's call log (what covered the element,
  // or that it never stood still) - the first line alone says only "Timeout exceeded".
  const why = (e) => {
    const lines = String(e?.message ?? e).split('\n').map((s) => s.trim()).filter(Boolean);
    const steps = lines.filter((s) => s.startsWith('- ')).slice(-3);
    return [lines[0], ...steps].join(' | ');
  };
  // ---- the card of the fanfare (#fanfare): a part's, the finale's - or the scene of an achievement (PLAY-08) ----
  // The game shows an achievement's scene at its stop points (src/game/stops.ts) on the same card, marked `.ach`. A block
  // that waits for its own card (a shard, the finale) closes such a scene on the way with one tap, the line
  // "achievement shown: <id>" goes to the log, and the wait goes on for the card it waited for. `achSeen`: the ids of
  // every scene closed so, across the reloads (the page's own `__game.ach.log` starts again with every page).
  const achSeen = [];
  let achWant = null;    // the set of the piece, once the block "achievements" has come: the end of the walk checks it again
  const fanfareIs = () => g(() => {
    const e = document.querySelector('#fanfare');
    return !e || e.classList.contains('hidden') ? 'none' : e.classList.contains('ach') ? 'ach' : 'own';
  });
  // Every scene is checked as it comes (not over a task, its title, the cat's subtitle, its id still in the queue) and
  // after its one tap (the card of the parts given back, the scene stored as shown); the first one of a run is also a
  // picture, the layout check of the card in this size.
  let achPictured = false;
  // Holds the achievements' scenes for the length of `fn` (a block that measures something else) and gives the lever
  // back as it was, whatever `fn` does: the walkthrough's own lever (__game.ach.hold, ?debug only), never the game's.
  const holdAchDuring = async (fn) => {
    const was = await g(() => __game.ach.held);
    await g(() => __game.ach.hold());
    try { return await fn(); } finally { if (!was) await g(() => __game.ach.release()).catch(() => {}); }
  };
  const endAchievement = async (where) => {
    const on = await g(() => ({ id: __game.ach.scene, queue: __game.ach.queue, task: __game.inTask, cat: __game.line,
      title: document.querySelector('#fanfareTitle').textContent, sign: document.querySelector('#fanfare .gem').textContent }));
    if (!on.id) throw new Error(`${where}: the card is marked as an achievement's, but __game.ach.scene is null`);
    const left = [];
    if (on.task) left.push('the scene came over a task');
    if (!on.title) left.push('the card has no title');
    if (!on.cat) left.push('the cat says nothing (no subtitle)');
    if (!on.queue.includes(on.id)) left.push(`"${on.id}" is not in the queue while its scene is on`);
    if (!achPictured) { achPictured = true; await shot(`achievement-${on.id}`); }
    await tapOn('#fanfareOk').catch((e) => { throw new Error(`${where}: the button of the scene of "${on.id}" cannot be pressed: ${why(e)}`); });
    await gameFor(() => __game.ach.scene === null, null, 15)
      .catch(() => { throw new Error(`${where}: one tap did not end the scene of "${on.id}"`); });
    const after = await g(() => ({ queue: __game.ach.queue, sign: document.querySelector('#fanfare .gem').textContent,
      ach: document.querySelector('#fanfare').classList.contains('ach'), stored: JSON.parse(localStorage.getItem('amw-save') || '{}').achShown ?? [] }));
    if (after.queue.includes(on.id)) left.push(`"${on.id}" is still in the queue after its scene`);
    if (!after.stored.includes(on.id)) left.push(`the shown scene of "${on.id}" is not stored`);
    if (after.ach) left.push('the card is still marked as an achievement\'s');
    if (after.sign !== '💎') left.push(`the card of the parts is not given its crystal back (sign ${after.sign})`);
    if (left.length) errors.push(`achievements: ${mode}: the scene of "${on.id}" (${where}): ${left.join('; ')}`);
    achSeen.push(on.id);
    console.log(`achievement shown: ${on.id} (${on.sign}, ${where})`);
    return on.id;
  };
  // Whether the block's own card is up now; an achievement's scene in its place is closed first (then: false, or the
  // card that came right after it).
  const fanfareUp = async (where = 'the card of the fanfare') => {
    for (;;) {
      const s = await fanfareIs();
      if (s !== 'ach') return s === 'own';
      await endAchievement(where);
    }
  };
  // Waits for the block's own card, closing the scenes of the achievements that come before it.
  // Every scene closed starts the wait again: their number is that of the achievements, a handful.
  const fanfareCard = async (seconds, where = 'the card of the fanfare') => {
    for (;;) {
      await gameFor(() => !!document.querySelector('#fanfare:not(.hidden)'), null, seconds);
      if (await fanfareUp(where)) return;
    }
  };
  // Waits for the controls to come back (`!__game.busy`), closing on the way the scene a stop point inside the
  // conversation brings (after a task's praise, after a part's card).
  const controlsBack = async (seconds, where = 'the end of the scene') => {
    for (;;) {
      await gameFor(() => __game.ach.scene !== null || !__game.busy, null, seconds);
      if (!(await fanfareIs() === 'ach')) return;
      await endAchievement(where);
    }
  };
  // Closes the book: its button is a stop point (src/ui/ui.ts), whose scene - if one waits - is closed right away (the
  // point runs inside the click, so the scene is up by the time the tap returns).
  const closeBook = async () => { await tapOn('#bookClose'); await fanfareUp('the closed book'); };
  // The lever of a block that measures what a scene would disturb (a line after a shard, the silence): the scenes wait in
  // the queue from `holdAch()` to `releaseAch()` (`__game.ach.hold()` / `release()`, ?debug only); the achievements are
  // still granted, and the next stop point after the release shows the first of them.
  const holdAch = () => g(() => __game.ach.hold());
  const releaseAch = () => g(() => __game.ach.release());
  const saved = () => g(() => JSON.stringify({ skills: __game.save.skills, quests: __game.save.worlds.fairy.quests, stars: __game.save.stars }));
  // The heroine walks: "forward" is held until she has moved half a step, however slow the frames are.
  const walks = async () => {
    const from = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
    await page.keyboard.down('KeyW');
    try {
      // her steps are the game's: 3 s of game time to walk 0.5 m (5 s of the clock were too few on a busy slow runner)
      return await gameUntil(([x, z]) => Math.hypot(__game.hero.root.position.x - x, __game.hero.root.position.z - z) > 0.5, from, 3);
    } finally { await page.keyboard.up('KeyW'); }
  };
  // What a scene that has ended may not leave behind, whichever way it ended.
  const held = () => g(() => {
    const left = [];
    if (__game.busy) left.push('the heroine is still held (busy)');
    if (__game.cam.focus) left.push('the camera is still held');
    if (__game.finale !== 0) left.push('the shards are still merging');
    if (!document.querySelector('#bubble').classList.contains('hidden')) left.push('the speech bubble is still shown');
    return left;
  });
  // A scene that breaks gives the controls back (PLAY-03): the next scene is broken on purpose right after it has taken
  // them. Returns what the broken scene left behind; the error it must report is excused by its exact text, once.
  const breakScene = async (name, start) => {
    const seen = fault.seen;
    fault.text = sceneFault(name); fault.expected = seen + 1;
    await g(() => __game.failNext());
    await start();
    // the error of the broken scene comes within a few frames of the game: up to 5 s of its time
    for (const t1 = await g(() => __game.time); fault.seen === seen && (await g(() => __game.time)) - t1 < 5;) await framesDrawn(1);
    const left = await held();
    if (fault.seen === seen) left.push('the scene did not report its error in the console');
    fault.expected = fault.seen;
    return left;
  };
  // ---- links: no element of the document may point to another origin ----
  const checkLinks = async (where) => {
    const found = await g(() => {
      const attr = { a: 'href', area: 'href', link: 'href', iframe: 'src', script: 'src', img: 'src', form: 'action' };
      const res = [];
      for (const e of document.querySelectorAll('a[href], area[href], link[href], iframe[src], script[src], img[src], form[action]')) {
        const raw = e.getAttribute(attr[e.localName]) ?? '';
        let u = null;
        try { u = new URL(raw, document.baseURI); } catch { /* unparsable: report as is */ }
        if (u && (u.protocol === 'data:' || u.protocol === 'blob:' || u.origin === location.origin)) continue;
        res.push(`<${e.localName}> ${u ? u.href : raw}`);
      }
      return res;
    });
    for (const f of found) errors.push(`external link ${f} (${where})`);
  };
  // ---- layout: the screen must fit the window, nothing may overlap, a button must be big enough for a finger ----
  // Measured in the page at every screenshot. An element is placed where it is drawn (the centre of its bounding
  // box) but with its layout size, so the tilt of the task items and the "bump" / "pulse" animations do not change
  // the result. Only what the player can reach counts as a button of the screen: elements behind a full-window layer
  // (the game controls behind a task, the book or the parents section) are left out. Reports once per screen.
  // Returns false, measuring nothing, while a panel is still flying in (unless `force`): the measure and that test run
  // in one go, so a panel that shows up right after the picture (the finale's card, timed in game time) is not caught
  // in its first frame of "pop2" and reported as cut off by its own frame.
  const checkLayout = async (screen, force = false) => {
    const found = await g(([min, names, force]) => {
      if (!force && document.getAnimations().some((a) => names.includes(a.animationName) && a.playState === 'running')) return null;
      const vw = innerWidth, vh = innerHeight, out = [];
      const px = (n) => Math.round(n * 10) / 10;
      const label = (e) => {
        if (e.id) return '#' + e.id;
        let s = e.localName + [...e.classList].map((c) => '.' + c).join('');
        const same = e.parentElement ? [...e.parentElement.children].filter((x) => x.localName === e.localName) : [];
        if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
        const a = e.parentElement?.closest('[id]');
        return (a ? `#${a.id} ` : '') + s;
      };
      const shown = (e) => {
        if (!(e.offsetWidth > 0 && e.offsetHeight > 0) || getComputedStyle(e).visibility !== 'visible') return false;
        for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || Number(cs.opacity) === 0) return false; }
        return true;
      };
      const box = (e) => {
        const r = e.getBoundingClientRect(), w = e.offsetWidth, h = e.offsetHeight, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2, w, h };
      };
      const at = (b) => `${px(b.w)}x${px(b.h)} at ${px(b.l)},${px(b.t)}`;
      const outside = (b, c) => b.l < c.l - 1 || b.t < c.t - 1 || b.r > c.r + 1 || b.b > c.b + 1;
      const cross = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
      const win = { l: 0, t: 0, r: vw, b: vh };

      // 1. the document does not scroll
      for (const e of [document.documentElement, document.body]) {
        if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.push(`<${e.localName}> scrolls: content ${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight}`);
      }
      if (scrollX || scrollY) out.push(`the window is scrolled to ${px(scrollX)},${px(scrollY)}`);

      // 2. panels: inside the window, no scrolling inside
      const panels = [...document.querySelectorAll('#start .panel, #task .t-card, #book .card, #parents .card, #fanfare .card, #shop .shop-card, #shopSay, #bubble, #hud, #answers, #storySub')].filter(shown);
      for (const p of panels) {
        const b = box(p), cs = getComputedStyle(p);
        if (outside(b, win)) out.push(`${label(p)} is outside the ${vw}x${vh} window: ${at(b)}`);
        const scrolls = (v) => v === 'auto' || v === 'scroll';
        if ((scrolls(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) || (scrolls(cs.overflowX) && p.scrollWidth > p.clientWidth + 1)) {
          out.push(`${label(p)} scrolls: content ${p.scrollWidth}x${p.scrollHeight} in ${p.clientWidth}x${p.clientHeight}`);
        }
      }

      // 3. buttons and inputs of this screen. Full-window layers: #start, #task, #book, #parents, #fanfare.
      const top = (e) => { while (e.parentElement && e.parentElement !== document.body) e = e.parentElement; return e; };
      const order = (e) => [Number(getComputedStyle(e).zIndex) || 0, [...document.body.children].indexOf(e)];
      const above = (a, b) => { const [za, ia] = order(a), [zb, ib] = order(b); return za > zb || (za === zb && ia > ib); };
      const layers = [...document.body.children].filter((e) => e.localName !== 'canvas' && shown(e) && getComputedStyle(e).position === 'fixed'
        && !outside(win, box(e)));
      const reachable = (e) => !layers.some((l) => !l.contains(e) && above(l, top(e)));
      const isButton = (e) => e.matches('button, [role=button], input[type=button], input[type=submit], input[type=reset], input[type=checkbox], input[type=radio]');
      // No exceptions: every <button> counts, also the pictures of a task that are only counted, not pressed.
      const els = [...document.querySelectorAll('button, input, select, textarea, a[href], [role=button]')].filter((e) => shown(e) && reachable(e));
      const boxes = new Map(els.map((e) => [e, box(e)]));
      for (const e of els) {
        const b = boxes.get(e);
        if (outside(b, win)) out.push(`${label(e)} is outside the ${vw}x${vh} window: ${at(b)}`);
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
          const r = p.getBoundingClientRect();
          if (outside(b, { l: r.left, t: r.top, r: r.right, b: r.bottom })) out.push(`${label(e)} is cut off by ${label(p)}: ${at(b)}`);
          break;
        }
        if (isButton(e) && (b.w < min || b.h < min)) out.push(`${label(e)} is smaller than ${min}x${min}: ${px(b.w)}x${px(b.h)}`);
      }
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const [a, b] = [els[i], els[j]];
        if (a.contains(b) || b.contains(a)) continue;
        if (cross(boxes.get(a), boxes.get(b))) out.push(`${label(a)} overlaps ${label(b)}: ${at(boxes.get(a))} and ${at(boxes.get(b))}`);
      }
      // 4. the speech bubble lies over the game on purpose, but it may not cover a button of the screen
      const bubble = panels.find((p) => p.id === 'bubble');
      if (bubble) for (const e of els) {
        if (!bubble.contains(e) && !above(top(e), bubble) && cross(boxes.get(bubble) ?? box(bubble), boxes.get(e))) out.push(`#bubble covers ${label(e)}: ${at(box(bubble))} and ${at(boxes.get(e))}`);
      }
      return out;
    }, [MIN_BUTTON, [...ENTRANCES], force]);
    if (found === null) return false;
    for (const f of found) errors.push(`layout: ${mode} ${screen}: ${f}`);
    return true;
  };
  // ---- offline: the network may be switched off only when the service worker can serve the whole game ----
  // Ready means: the worker is activated and controls this page, nothing newer is installing or waiting, and every
  // address of its precache list (read from the worker script itself) is in the cache. Returns the number of files.
  const waitForOfflineCache = async () => {
    const probe = () => g(async () => {
      if (!('serviceWorker' in navigator)) return { why: 'this page has no service worker support (not a secure context?)' };
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { none: true, why: 'no service worker is registered on this address' };
      const settled = reg.active?.state === 'activated' && !reg.installing && !reg.waiting && !!navigator.serviceWorker.controller;
      if (!settled) return { why: `worker state: active=${reg.active?.state ?? 'none'}, installing=${!!reg.installing}, waiting=${!!reg.waiting}, controls the page=${!!navigator.serviceWorker.controller}` };
      const src = await (await fetch(reg.active.scriptURL, { cache: 'no-store' })).text();
      const list = [...new Set([...src.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => new URL(m[1], reg.scope).href))];
      if (!list.length) return { fatal: true, why: `cannot read the precache list from ${reg.active.scriptURL}` };
      const missing = [];
      for (const u of list) if (!(await caches.match(u, { ignoreSearch: true }))) missing.push(u);
      return missing.length ? { why: `${missing.length} of ${list.length} files are not in the cache yet, e.g. ${missing[0]}` } : { files: list.length };
    });
    const t0 = Date.now(); /* clock: page-load */
    for (;;) {
      const st = await probe();
      if (st.files) return st.files;
      // The registration is made on the window "load" event, long before the start button shows up: no registration
      // a few seconds later means there will be none (the development server), so do not wait the whole limit.
      const limit = st.none ? T(5000) : T(120000); /* clock: page-load */
      if (st.fatal || Date.now() - t0 > limit) { /* clock: page-load */
        throw new Error(`service worker did not become ready: ${st.why}`
          + (st.none ? ' — E2E_OFFLINE=1 needs the built game (npm run e2e); the development server has no service worker' : ''));
      }
      await page.waitForTimeout(250); /* clock: page-load */
    }
  };
  // A next world (TECH-09) is no part of the installation: without network the game can enter it only when its files
  // are in the cache "worlds". A page opened straight in that world does not put them there (its first requests are
  // made before the service worker controls it, and the download in the background brings the worlds after the one
  // played), so the walkthrough brings them the way the game does - its own download - and waits for its end, not for
  // the clock. A world that is not ready then fails here, by its name, and not later as "the game could not load".
  // Returns how many files of the world the cache holds (0: the world of the installation, nothing to bring).
  const cacheWorld = async (id) => {
    const st = await g(async (w) => {
      const cache = window.__game.worlds;
      if (!cache) return { why: 'the game does not show its cache of worlds with ?debug (no window.__game.worlds)' };
      if (await cache.status(w) === 'core') return { status: 'core', files: 0 };
      const d = await cache.download(w);
      return { status: await cache.status(w), files: (await cache.cached(w)).length, why: d.error ? `its download ended with "${d.error}"` : `${d.done} of ${d.total} file(s) downloaded` };
    }, id);
    if (st.status !== 'core' && st.status !== 'ready') {
      throw new Error(`world "${id}": without network it cannot be entered - its files are not in the cache "worlds" (${st.status ? `status "${st.status}", ` : ''}${st.why})`);
    }
    return st.files;
  };

  try {
    // ---- without ?debug (ARCH-11): the published game has no window.__game, no frame counter and no tuning panel ----
    // A context of its own: its save and its service worker never reach the walkthrough. Its page must not report errors either.
    if (has('no-debug')) {
      const plain = await browser.newContext(ctxOptions);
      try {
        await plain.route((u) => !own(u.href), (route) => route.abort());
        const p = await plain.newPage();
        p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`without ?debug: ${m.type()}: ${m.text()}`); });
        p.on('pageerror', (e) => errors.push('without ?debug: pageerror: ' + e.message));
        // Slow frames (about 18 a second), so that the game lowers its quality by itself; on a phone screen
        // (2 device pixels per pixel) that shows as a smaller canvas: q2 draws 2 pixels per pixel, q1 1.5.
        if (!process.env.Q) await p.addInitScript(() => { const raf = requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => setTimeout(() => raf(cb), 40); });
        await p.goto(url + (process.env.Q ? `?q=${process.env.Q}` : ''));
        await p.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
        await p.waitForTimeout(T(1500)); /* clock: no-debug */
        if (!process.env.Q && touch) {
          const w0 = await p.evaluate(() => document.querySelector('#c').width);
          const lowered = await p.waitForFunction((w) => document.querySelector('#c').width < w, w0, { timeout: T(30000) }) /* clock: no-debug */
            .then(async () => { const w1 = await p.evaluate(() => document.querySelector('#c').width); console.log(`without ?debug: slow frames lowered the quality by itself (canvas ${w0} -> ${w1} px wide)`); return true; })
            .catch(() => { errors.push(`without ?debug: slow frames did not lower the quality (the canvas stayed ${w0} px wide)`); return false; });
          // TECH-04: the lowered tier is remembered, so the next launch starts with it, not with the top one again.
          // Read as soon as the start button shows: the game's own fallback needs seconds of frames before it acts.
          if (lowered) {
            await p.reload();
            await p.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
            const w2 = await p.evaluate(() => document.querySelector('#c').width);
            if (w2 < w0) console.log(`without ?debug: after a reload the game starts with the lowered quality (canvas ${w2} px wide, ${w0} before the fallback)`);
            else errors.push(`without ?debug: after the fallback and a reload the game started with the top quality again (the canvas is ${w2} px wide, as before the fallback)`);
          }
        }
        const found = await p.evaluate(() => [
          '__game' in window ? 'window.__game is defined' : '',
          document.querySelector('#fps') ? 'the frame counter (#fps) is in the document' : '',
          document.querySelector('#tune, #tuneBtn') ? 'the tuning panel is in the document' : '',
        ].filter(Boolean));
        for (const f of found) errors.push(`debug tools without ?debug: ${f}`);
        console.log(`without ?debug: ${found.length ? found.join('; ') : 'no window.__game, no frame counter, no tuning panel'}`);
      } finally { await plain.close().catch(() => {}); }
    }
    // Everything below plays with ?debug: the reloads keep the address.
    await page.goto(url + '?debug' + (process.env.Q ? `&q=${process.env.Q}` : '') + (seed ? `&seed=${encodeURIComponent(seed)}` : '')
      + (worldId ? `&world=${encodeURIComponent(worldId)}` : ''));
    await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
    if (offline) {
      cachedFiles = await waitForOfflineCache();
      if (worldId) worldFiles = await cacheWorld(worldId);
      // the last request of this page that may reach the server: what is asked for after it was asked without network
      if (offlineMark) await g((path) => fetch(path, { cache: 'no-store' }).then((r) => r.status), offlineMark).catch((e) => { throw new Error(`offline: the mark ${offlineMark} could not be asked for: ${why(e)}`); });
      await ctx.setOffline(true);
      networkOff = true;
      await page.reload();
      await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
    }
    if (worldId) voiceUsed = await playWorld({ page, g, T, shot, tapOn, act, why, visible, gameUntil, fanfareUp, closeBook, checkLinks, checkQuestion, checkVoice, checkBank, errors, QUESTIONS, mode, touch, level, stuckMs, worldId, kept: { fairy: FAIRY_KEPT }, stars: STARS_KEPT });
    else {
      await calm(); await shot('00-start'); await checkLinks('start screen');
      let catRepeated = false;      // a tap on the cat repeated a line
      await page.click('#play');
      if (level) await page.evaluate((d) => { for (const k of Object.keys(__game.save.fixed)) __game.save.fixed[k] = d; }, Number(level));
      // The composition of a number has no levels 1-2: it would play them as its 3, the missing addend, which the phone
      // sizes play already. A run that fixes 1 or 2 (the tall desktop, tools/e2e.mjs) plays its house (level 4) instead.
      if (level && Number(level) < 3) await page.evaluate(() => { __game.save.fixed.compose = 4; });
      // A new save starts with its introduction (WORLD-13): its frames wait for a tap, its subtitle is its own.
      await gameFor(() => !document.querySelector('#bubble').classList.contains('hidden') || !!window.__game.story?.active, null, 20);
      // E2E_ONLY: the game plays from the group's save - or the group would pass playing something else.
      if (group) {
        // what the group declares (not the text written above: a save lost on its way must not agree with itself)
        const want = group.save ? group.save() : null, w = want?.worlds.fairy;
        const sorted = (q) => JSON.stringify(Object.entries(q ?? {}).sort());
        const got = await g(() => ({ quests: __game.save.worlds.fairy.quests, final: __game.save.worlds.fairy.final, stars: __game.save.stars, voice: __game.save.vol.voice }));
        const was = { quests: w?.quests, final: w?.final ?? false, stars: want?.stars ?? 0, voice: mute ? 0 : want?.vol.voice ?? 1 };
        if (sorted(got.quests) !== sorted(was.quests) || got.final !== was.final || got.stars !== was.stars || got.voice !== was.voice) {
          throw new Error(`group "${only}": the game does not play from the save of the group: it holds ${JSON.stringify(got)}, the save ${JSON.stringify({ ...was, quests: was.quests ?? {} })}`);
        }
        console.log(`group "${only}": the game plays from ${groupSave ? `its save (${JSON.stringify(got)})` : 'no save'}`);
        // "Play" is a stop point (src/game/start.ts): a save with friends done earns its achievements there (none of the
        // saves holds one), and the first one's scene comes at once - before the first block, which it would stand over.
        if (want) {
          await gameFor(() => __game.ach.scene !== null || Object.keys(__game.save.achievements).length > 0, null, 30)
            .catch(() => { throw new Error(`group "${only}": the stop point of "Play" earned nothing from the save`); });
          await fanfareUp('the stop point of "Play"');
        }
      }
      // ---- the cut-scenes (WORLD-13): still frames, one move of the camera each with the parallax of its depth map, the
      // cat's line and its subtitle. A new save starts with the introduction, before the tour: a tap goes on to the next
      // frame and the heroine does not walk, the skip button closes the whole scene; a save already played has none.
      // `storyFrames` plays the scene on screen to its end by taps: a picture of the start and of the end of every pass
      // (held there), the first pass run to its end - its line starts ~0.3 s in, the pass lasts the line + 1 s at least,
      // then the frame stands until the tap. Every frame shown must be shown in 2.5D (the depth map loaded: also offline).
      const storyNow = () => g(() => {
        const s = __game.story, sub = document.querySelector('#storySub');
        return { on: s.active, id: s.id, i: s.index, t: s.elapsed, pass: s.pass, fading: s.fading, busy: __game.busy,
          sub: sub.classList.contains('hidden') ? '' : sub.textContent, joy: !document.querySelector('#joy').classList.contains('hidden'),
          jump: !document.querySelector('#btnJump').classList.contains('hidden'), log: s.log.length };
      });
      const storyFail = (what) => { throw new Error(`the cut-scenes: ${what}`); };
      const storyFrame = (i) => gameFor((i) => __game.story.index === i && !__game.story.fading, i, 15)
        .catch(() => storyFail(`frame ${i + 1} did not come`));
      const storyTap = async () => {
        const vp = page.viewportSize();
        await (touch ? page.touchscreen.tap(vp.width / 2, vp.height / 2) : page.mouse.click(vp.width / 2, vp.height / 2));
      };
      // The pictures of the frames and the first pass run to its end: in one size (the phone held upright) and in a piece
      // only (E2E_ONLY: world1 has the introduction, finale the return of the crystal). On the CI runner two pictures a
      // frame and a pass of 9 s of the scene's time cost minutes - ~3.5 a scene even on a phone - and the whole session
      // (pages.yml before a publication, nightly) has a limit of its own; everywhere else the frames go on by taps and are
      // checked the same way (shown, in 2.5D, the heroine still).
      const storyPictures = mode === 'mobile-portrait' && !!only;
      const storyFrames = async (id, { upTo = Infinity } = {}) => {
        const n = await g((id) => __game.story.stories.find((s) => s.id === id).shots.length, id);
        await storyFrame(0);
        const from = await g((id) => __game.story.log.findLastIndex((f) => f.story === id && f.index === 0), id);
        const at = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
        for (let i = 0; i < Math.min(n, upTo); i++) {
          await storyFrame(i);
          const name = `story-${id.replace('story_', '')}-${i + 1}`;
          if (storyPictures) {
            await g(() => __game.story.hold(0)); await g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            await shot(`${name}a`);
            await g(() => __game.story.hold(null));
            if (i === 0) {
              // the first pass to its end, in the scene's own time (frames of at most 0.05 s, as the game's): its line, then the frame stands still until the tap
              await gameFor(() => __game.story.elapsed >= __game.story.pass - 1e-6, null, 40)
                .catch(() => storyFail(`${id}: the pass of the first frame did not end`));
              const s0 = await storyNow();
              await gameSeconds(1);
              const s1 = await storyNow(), f = await g(() => __game.story.log.at(-1));
              if (s1.i !== 0 || !s1.on) storyFail(`${id}: the first frame did not wait for a tap (frame ${s1.i + 1})`);
              if (s1.t !== s0.t) storyFail(`${id}: the first frame still moves after its pass (${s0.t.toFixed(2)} -> ${s1.t.toFixed(2)} s)`);
              if (!s1.sub) storyFail(`${id}: no subtitle on the first frame`);
              if (f.lineAt === null || f.lineAt < 0.25 || f.lineAt > 0.6) storyFail(`${id}: the line started at ${f.lineAt} s of the pass, not ~0.3 s`);
              if (f.lineEnd === null) storyFail(`${id}: the line of the first frame did not end within its pass of ${f.pass.toFixed(2)} s`);
              else if (f.pass - f.lineEnd < 1 - 0.06) storyFail(`${id}: the pass (${f.pass.toFixed(2)} s) ends ${(f.pass - f.lineEnd).toFixed(2)} s after its line, not 1 s or more`);
              console.log(`the cut-scenes: ${id} 1: the line from ${f.lineAt.toFixed(2)} to ${f.lineEnd.toFixed(2)} s, the pass ${f.pass.toFixed(2)} s, then still until the tap`);
            }
            await g(() => __game.story.hold(1)); await g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            await shot(`${name}b`);
            await g(() => __game.story.hold(null));
          }
          if (i + 1 >= Math.min(n, upTo)) break;
          await storyTap();
          await gameFor((i) => __game.story.index === i + 1 || !__game.story.active, i, 10)
            .catch(() => storyFail(`${id}: a tap on frame ${i + 1} did not go on`));
        }
        if (upTo >= n) {
          await storyTap();
          await gameFor(() => !__game.story.active, null, 10).catch(() => storyFail(`${id}: a tap on the last frame did not end it`));
        }
        const shown = await g((from) => __game.story.log.slice(from), from);
        const left = [];
        if (shown.length !== Math.min(n, upTo)) left.push(`${shown.length} frames shown, not ${Math.min(n, upTo)}`);
        for (const f of shown) if (f.mode !== '25d') left.push(`frame ${f.index + 1} (${f.image}) shown ${f.mode === 'none' ? 'without its picture' : 'flat, its depth map did not load'}`);
        const moved = await g(([x, z]) => Math.hypot(__game.hero.root.position.x - x, __game.hero.root.position.z - z), at);
        if (moved > 0.2) left.push(`the heroine walked ${moved.toFixed(2)} m during the scene`);
        if (left.length) storyFail(`${id}: ${left.join('; ')}`);
        return shown;
      };
      // ---- the description of the first world (ARCH-16): its items agree with what it declares; of the template it lacks
      // only what is not built yet - the parts of the artifact in the world and two of the three secrets ----
      {
        const d = await g(() => ({ items: __game.items?.map((i) => `${i.kind} ${i.id}`) ?? null, problems: __game.itemProblems, lacks: __game.missing() }));
        const left = [];
        if (!d.items) left.push('the first world hands in no description');
        else for (const want of ['flyover toured', 'scene story_intro', 'secret chest', 'finale final', 'scene story_crystal', 'pet pet']) if (!d.items.includes(want)) left.push(`no item "${want}"`);
        if (d.problems?.length) left.push(...d.problems);
        for (const l of d.lacks ?? []) if (!/"(part|secret)"/.test(l)) left.push(`lacks: ${l}`);
        if (left.length) errors.push(`description: ${mode}: ${left.join('; ')}`);
        else console.log(`description: ${d.items.length} items of the first world, no disagreement with its declaration; it lacks ${d.lacks.length ? d.lacks.map((l) => /"(\w+)"/.exec(l)[1]).join(' and ') : 'nothing'}`);
      }
      if (has('story')) {
        // the sheets of the scenes for the customer (WORLD-13): the frames in their order, each with its line, next to their pictures
        if (mode === 'mobile' && !groupSave) console.log(`the cut-scenes: the sheets ${(await storySheets(out)).map((p) => p.split('/').pop()).join(', ')}`);
        if (!groupSave) {
          const s0 = await storyNow();
          if (!s0.on || s0.id !== 'story_intro') storyFail('a new save: no introduction after "play"');
          if (!s0.busy) storyFail('the heroine is free to walk during the introduction');
          if (s0.joy || s0.jump) storyFail('the joystick or the jump button shows during the introduction');
          if (await g(() => __game.flyoverPlayer?.active)) storyFail('the tour flies during the introduction');
          const flags = await g(() => ({ now: __game.save.worlds.fairy?.flags?.story_intro, stored: JSON.parse(localStorage.getItem('amw-save') || '{}').worlds?.fairy?.flags?.story_intro }));
          if (flags.now !== true || flags.stored !== true) storyFail(`the introduction is not marked seen as it starts: ${JSON.stringify(flags)}`);
          // two frames by taps, then the skip button on the third closes the whole scene: the tour comes next
          const shown = await storyFrames('story_intro', { upTo: 3 });
          await tapOn('#storySkip').catch((e) => storyFail(`the skip button cannot be pressed: ${why(e)}`));
          await gameFor(() => !__game.story.active, null, 10).catch(() => storyFail('the skip button did not close the introduction'));
          const logged = await g(() => __game.story.log.length);
          await gameSeconds(1);
          if ((await g(() => __game.story.log.length)) !== logged) storyFail('a frame was shown after the skip');
          await gameFor(() => __game.flyoverPlayer?.active || __game.save.worlds.fairy?.flags?.toured, null, 10)
            .catch(() => storyFail('the tour did not follow the introduction'));
          console.log(`the cut-scenes: a new save plays the introduction first; taps went on through ${shown.length} frames, the skip button closed it, the tour follows`);
        } else {
          // a save already played: no introduction (a second of game time after "play")
          const t0 = await g(() => __game.time);
          for (;;) {
            const s = await g(() => ({ on: __game.story.active, t: __game.time }));
            if (s.on) storyFail('a save already played: the introduction is shown');
            if (s.t > t0 + 1) break;
            await framesDrawn(1);
          }
          if (await g(() => __game.save.worlds.fairy?.flags?.story_intro)) storyFail('a save already played is marked as having seen the introduction');
          console.log('the cut-scenes: a save already played has no introduction');
        }
      } else if (await g(() => __game.story?.active)) {
        await g(() => __game.story.skip());
        await gameFor(() => !__game.story.active && (__game.flyoverPlayer?.active || __game.save.worlds.fairy?.flags?.toured), null, 10);
      }
      // ---- the tour of the world (WORLD-11): a new save flies the camera along the world's path after "play" while the
      // cat says its line, and a tap ends it; then a picture from every point of the path (the debug command, each point
      // held for its picture); a reload (the second entry) and an old save (played before, never toured) have no tour ----
      if (has('flyover')) {
        const fail = (what) => { throw new Error(`the tour: ${what}`); };
        const state = () => g(() => {
          const f = __game.flyoverPlayer;
          return { on: f.active, at: f.elapsed, busy: __game.busy, line: __game.line, toured: __game.save.worlds.fairy?.flags?.toured === true,
            jump: !document.querySelector('#btnJump').classList.contains('hidden'), synth: [...__game.voice.synth] };
        });
        const pts = await g(() => __game.flyoverPoints.map((p) => p.t));
        const s0 = await state();
        if (!s0.on) fail('a new save: no tour after "play"');
        if (!s0.busy) fail('the heroine is free to walk during the tour');
        if (s0.jump) fail('the jump button shows during the tour');
        if (s0.line !== 'tour') fail(`the cat says "${s0.line}", not its line of the tour`);
        if (!s0.toured) fail('the world is not marked as toured when its tour starts');
        // the tour itself moves the camera: it leaves the first point by more than 2 m (waited for by the frames of the
        // game, not the clock: a player that holds the camera still never gets there)
        const cam0 = await g(() => __game.camera.position.toArray());
        if (!(await gameUntil((p) => __game.flyoverPlayer.active
          && Math.hypot(__game.camera.position.x - p[0], __game.camera.position.y - p[1], __game.camera.position.z - p[2]) > 2, cam0, 4))) {
          fail(`the camera did not fly in 4 s of game time: still ${(await g((p) => Math.hypot(
            __game.camera.position.x - p[0], __game.camera.position.y - p[1], __game.camera.position.z - p[2]), cam0)).toFixed(2)} m from where it started`);
        }
        // a tap anywhere ends it, long before its end
        const vp = page.viewportSize();
        await (touch ? page.touchscreen.tap(vp.width / 2, vp.height / 2) : page.mouse.click(vp.width / 2, vp.height / 2));
        // The tap ends it in its own handler; the end is waited for by the page, with room for a slow runner's frames (a busy
        // CI runner took more than 5 s of the clock for it), and the place it ended at is checked right below.
        await gameFor(() => !__game.flyoverPlayer.active && !__game.busy, null, 60)
          .catch(async () => fail(`a tap did not end the tour: ${JSON.stringify(await state())}`));
        const s1 = await state();
        if (!(s1.at < pts[pts.length - 1] - 0.5)) fail(`the tour ran to its end (${s1.at.toFixed(2)} s) instead of ending at the tap`);
        // The reloads below start a new log of the voice: its line is checked here.
        if (s1.synth.includes('tour')) errors.push('no recorded clip for: tour (python3 tools/gen_voice.py)');
        console.log(`the tour: a new save flies it with the line "tour", a tap ends it at ${s1.at.toFixed(2)} of ${pts[pts.length - 1].toFixed(1)} s`);
        // a picture from every point of the path
        await g(() => __game.flyover());
        await gameFor(() => __game.flyoverPlayer.active, null, 5).catch(() => fail('the debug command did not start the tour'));
        // The camera is put on each point at once (hold) and pictured after two frames of the game: on the slow CI runner
        // flying from point to point in game time would take minutes of the clock.
        for (const [i, t] of pts.entries()) {
          await g((i) => __game.flyoverPlayer.hold(i), i);
          await g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const at = await g(() => __game.flyoverPlayer.elapsed);
          if (Math.abs(at - t) > 0.01) fail(`point ${i + 1}: the tour stands at ${at.toFixed(2)} s, not ${t.toFixed(2)} s`);
          await shot(`flyover-${i + 1}`);
        }
        await g(() => { __game.flyoverPlayer.hold(null); __game.flyoverPlayer.skip(); });
        await gameFor(() => !__game.flyoverPlayer.active && !__game.busy, null, 30).catch(() => fail('the debug tour did not end'));
        console.log(`the tour: ${pts.length} pictures of its points (flyover-1 .. flyover-${pts.length})`);
        // An entry that has no tour: "play", three frames, and the tour never started. The tour starts in the handler of
        // "play" itself, so frames are enough - a second of game time would outlast the welcome on the slow CI runner,
        // and the next block wants that line still sounding.
        const noTour = async (what) => {
          await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
          await page.click('#play');
          await g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
          if (await g(() => __game.flyoverPlayer.active)) fail(`${what}: the tour is shown`);
          console.log(`the tour: ${what}: no tour`);
        };
        // the second entry
        await page.reload();
        await noTour('the second entry');
        // an old save: played before, the world never marked toured; the game writes nothing until the reload
        await g(() => {
          const s = JSON.parse(localStorage.getItem('amw-save'));
          s.played = true; delete s.worlds.fairy.flags.toured;
          localStorage.setItem('amw-save', JSON.stringify(s));
          Storage.prototype.setItem = () => {};
        });
        await page.reload();
        const old = await g(() => JSON.parse(localStorage.getItem('amw-save') || '{}'));
        if (!old.played || old.worlds?.fairy?.flags?.toured) fail(`the old save was not stored as one: ${JSON.stringify({ played: old.played, flags: old.worlds?.fairy?.flags })}`);
        await noTour('an old save');
        // ... and it gets the mark it never had: the world's description reads "toured" from the flag alone
        if (!(await g(() => __game.save.worlds.fairy?.flags?.toured === true))) fail('an old save entered the world without the mark "toured"');
      } else await g(() => __game.flyoverPlayer?.skip());
      // ---- a hidden page (another app, a locked screen) pauses the line that sounds; shown again, it plays on (TECH-05) ----
      // The page is "hidden" by its visibility state alone: what the game hears from a phone that leaves it.
      if (has('hidden-page')) {
        const fail = (what) => { throw new Error(`a hidden page: ${what}`); };
        const visibility = (hidden) => g((h) => {
          if (h) {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          } else { delete document.hidden; delete document.visibilityState; }       // back to the real ones
          document.dispatchEvent(new Event('visibilitychange'));
        }, hidden);
        // The line said after "play" (the cat's welcome on a world visited before) is caught by its own clip: listeners of
        // the page on that clip hide the page the moment its time has gone past 0.3 s while it plays - by the sound itself,
        // not by a check from here (the welcome lasts under 3 s; on the CI runner it can be over before a check from here
        // comes). If it is over before it is caught, a tap on the cat says a line (VOICE-08: the same one while its bubble is
        // up; with the bubble gone, where we stopped - PLAY-21) and the clip of that one is caught.
        const said = await g(() => __game.line);
        if (!said) fail('the game remembers no line after "play"');
        await g((key) => {
          const st = window.__hideCatch = { key, done: null, seen: new Set() };
          const hide = (a) => {
            if (st.done) return;
            st.done = { clip: window.__clip(a), at: a.currentTime };
            a.__probe = true;
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
          };
          const check = (a) => { if (!a.paused && !a.ended && a.currentTime > 0.3) hide(a); };
          const watch = () => {
            for (const a of window.__started) {
              if (st.seen.has(a) || (!st.any && window.__clip(a) !== st.key)) continue;
              st.seen.add(a);
              for (const ev of ['timeupdate', 'playing']) a.addEventListener(ev, () => check(a));
              check(a);
            }
            if (!st.done) setTimeout(watch, 10);
          };
          watch();
        }, said);
        const caught = (ms) => page.waitForFunction(() => !!window.__hideCatch.done, null, { timeout: ms }).then(() => true, () => false);
        let again = false;
        if (!(await caught(T(15000)))) { /* clock: audio */
          // over already (or never sounding): the cat repeats it on a tap
          if (await g(() => !!window.__hideCatch.done)) { /* caught in between */ } else {
            const cat = await g(() => {
              const p = __game.cat.root.position, s = new __game.THREE.Vector3(p.x, p.y + __game.catTapY, p.z).project(__game.camera);
              const x = (s.x * 0.5 + 0.5) * innerWidth, y = (-s.y * 0.5 + 0.5) * innerHeight;
              const under = s.z < 1 ? document.elementFromPoint(x, y) : null;
              return { x, y, under: under ? under.id || under.localName : 'nothing' };
            });
            if (cat.under !== 'c') fail(`"${said}" was not heard sounding, and the cat cannot be tapped at ${Math.round(cat.x)},${Math.round(cat.y)}: there is "${cat.under}"`);
            // the line of the tap is caught whatever it is: every clip started so far is set aside
            await g(() => { const st = window.__hideCatch; for (const a of window.__started) st.seen.add(a); st.any = true; });
            await (touch ? page.touchscreen.tap(cat.x, cat.y) : page.mouse.click(cat.x, cat.y));
            again = true;
          }
        }
        if (!(await caught(T(60000)))) { /* clock: audio */
          const clips = await g((key) => window.__started.filter((a) => window.__clip(a) === key).map((a) => ({ paused: a.paused, ended: a.ended, t: +a.currentTime.toFixed(2), dur: +(a.duration || 0).toFixed(2), ready: a.readyState, net: a.networkState, err: a.error?.code ?? null })), said);
          fail(`the clip of "${said}" was never heard sounding past 0.3 s${again ? ', also after a tap on the cat' : ''}: ${JSON.stringify(clips)}`);
        }
        const { clip: id, at: hiddenAt } = await g(() => window.__hideCatch.done);
        await wait(1200); /* clock: audio */
        const away = await g(() => { const a = window.__started.find((x) => x.__probe); return { paused: a.paused, ended: a.ended, at: a.currentTime }; });
        await visibility(false);
        if (!away.paused || away.ended) fail(`the line "${id}" did not pause (${away.ended ? 'it ended' : 'it went on sounding'})`);
        if (away.at > hiddenAt + 0.15) fail(`the line "${id}" went on ${(away.at - hiddenAt).toFixed(2)} s after the page was hidden`);
        await page.waitForFunction((t) => { const a = window.__started.find((x) => x.__probe); return !a.paused && a.currentTime > t + 0.1 || a.ended; }, away.at, { timeout: T(15000) }) /* clock: audio */
          .catch(() => fail(`the line "${id}" did not play on when the page was shown again`));
        console.log(`a hidden page: "${id}" paused at ${away.at.toFixed(2)} s and played on when shown${again ? ' (said again on a tap on the cat: the first was over before it was caught)' : ''}`);
      }
      if (has('intro')) {
        // the introduction: the cat's lines until they end (the voice's own clock), then the page at rest
        await silence().catch(() => {}); await gameFor(() => !__game.busy, null, 30).catch(() => {}); await calm(); await shot('01-spawn');
        await checkVoice('after the introduction');
      }
      // ---- a tap on the cat says the line of the bubble once more, and the heroine does not walk to the cat (VOICE-08) ----
      if (has('cat')) {
        const fail = (what) => { throw new Error(`a tap on the cat: ${what}`); };
        // One tap on the cat in silence: `key` - the line it must say (its clip started once more, the subtitle shown).
        const tapCat = async (want) => {
          const cat = await g((w) => {
            const key = w ?? __game.line, p = __game.cat.root.position, hp = __game.hero.root.position;
            const s = new __game.THREE.Vector3(p.x, p.y + __game.catTapY, p.z).project(__game.camera);
            const x = (s.x * 0.5 + 0.5) * innerWidth, y = (-s.y * 0.5 + 0.5) * innerHeight;
            const under = s.z < 1 ? document.elementFromPoint(x, y) : null;
            return { key, x, y, under: under ? under.id || under.localName : 'nothing', n: window.__starts[key] ?? 0, at: [hp.x, hp.z] };
          }, want);
          if (!cat.key) fail('the game remembers no line after the introduction');
          if (cat.under !== 'c') fail(`the cat cannot be tapped at ${Math.round(cat.x)},${Math.round(cat.y)}: there is "${cat.under}"`);
          await (touch ? page.touchscreen.tap(cat.x, cat.y) : page.mouse.click(cat.x, cat.y));
          await page.waitForFunction(([k, n]) => (window.__starts[k] ?? 0) === n + 1, [cat.key, cat.n], { timeout: T(5000) }) /* clock: audio */
            .catch(async () => fail(`the clip "${cat.key}" was not started again (the line: ${await g(() => __game.line)})`));
          await gameSeconds(0.1);   // a tap taken as a walk would have moved her by now
          const moved = await g(([x, z]) => Math.hypot(__game.hero.root.position.x - x, __game.hero.root.position.z - z), cat.at);
          if (moved > 0.2) fail(`the heroine walked ${moved.toFixed(2)} m instead of standing`);
          if (!(await visible('#bubble'))) fail(`"${cat.key}" is said without its subtitle`);
          return cat.key;
        };
        await silence().catch(() => fail('the voice did not fall silent after the introduction'));
        // PLAY-21: with the bubble empty (its timer hid the last line) a tap says where we stopped - in the new world of
        // this piece "left_new_world" -; with a line in the bubble the tap repeats it (VOICE-08).
        let putBack = false;
        if (!(await visible('#bubble'))) {
          const stopped = await tapCat('left_new_world');
          console.log(`a tap on the cat with the bubble empty: "${stopped}" (where we stopped)`);
          await silence().catch(() => fail(`the voice did not fall silent after "${stopped}"`));
          // Its bubble stays 8 s by the wall clock (welcome.ts LEFT_HOLD_MS): a slow runner can spend them before the
          // repeat below, even between a look at the bubble and the tap. So its timer is let run out, and the line is put
          // back in the bubble, as it was before the timer hid it - no timer is left to hide it under the tap.
          await page.waitForFunction(() => document.querySelector('#bubble').classList.contains('hidden'), null, { timeout: T(15000) }) /* clock: audio */
            .catch(() => fail(`the bubble of "${stopped}" was not hidden by its timer`));
          await g(() => document.querySelector('#bubble').classList.remove('hidden'));
          putBack = true;
        }
        if (await visible('#bubble')) {
          const key = await tapCat(null);
          console.log(`a tap on the cat: "${key}" is said again, the heroine stands${putBack ? ' (put back in the bubble after its timer hid it)' : ''}`);
          catRepeated = true;
        }
      }

      // ---- a tap to walk on the joystick side of a phone: the heroine walks, and the joystick ring never shows (it shows
      // only once a finger steers - moved past 12 px or held longer than tuning.joyHoldMs, src/core/input.ts) ----
      if (has('cat') && touch) {
        const fail = (what) => { throw new Error(`a tap to walk on the joystick side: ${what}`); };
        await gameFor(() => !__game.busy, null, 30).catch(() => {});
        const at = await g(() => {
          const { THREE, camera } = __game, zone = innerWidth * __game.tuning.joyZone, h = __game.hero.root.position;
          // a point of the ground some metres from her, seen on the joystick side over the canvas
          for (const d of [3, 4.5, 2.2]) for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2, wx = h.x + Math.sin(a) * d, wz = h.z + Math.cos(a) * d;
            const v = new THREE.Vector3(wx, h.y, wz).project(camera);
            if (v.z >= 1) continue;
            const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
            if (x < 20 || x > zone - 20 || y < innerHeight * 0.3 || y > innerHeight - 20) continue;
            const el = document.elementFromPoint(x, y);
            if (el && el.id === 'c') return { x, y };
          }
          return null;
        });
        if (!at) fail('no ground to tap on the joystick side');
        await g(() => {
          const j = document.querySelector('#joy'); window.__ringSeen = j.classList.contains('on');
          window.__ringWatch = new MutationObserver(() => { if (j.classList.contains('on')) window.__ringSeen = true; });
          window.__ringWatch.observe(j, { attributes: true, attributeFilter: ['class'] });
        });
        const from = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
        await page.touchscreen.tap(at.x, at.y);
        await gameSeconds(1);
        const r = await g((p) => { window.__ringWatch.disconnect(); return { seen: window.__ringSeen, moved: Math.hypot(__game.hero.root.position.x - p[0], __game.hero.root.position.z - p[1]) }; }, from);
        if (r.seen) fail('the joystick ring showed');
        if (r.moved < 0.3) fail(`the heroine did not walk (${r.moved.toFixed(2)} m)`);
        console.log(`a tap to walk on the joystick side: she walked ${r.moved.toFixed(1)} m, the joystick ring never showed`);
      }

      // ---- the cut-scenes (WORLD-13): the whole introduction once more (the debug command, nothing recorded): every frame
      // is shown, the offline walkthrough too, each by a tap ----
      if (has('story') && !groupSave) {
        await gameFor(() => !__game.busy, null, 30).catch(() => storyFail('the game is still busy before the introduction again'));
        await g(() => { void __game.story.play('story_intro'); });
        const shown = await storyFrames('story_intro');
        if (!(await g(() => !__game.busy))) storyFail('the heroine is still held after the introduction');
        console.log(`the cut-scenes: the introduction again, all ${shown.length} frames in 2.5D by taps`);
      }

      // ---- the heroine (TECH-14): one child model on the game skeleton. In every clip of hers the lowest foot bone
      // stays within 3 cm of the ground (the pelvis of the clips is scaled to her legs); the look re-paints the dress
      // but no skin texel of her texture; pictures of her standing, walking and in a jump ----
      if (has('heroine')) {
        const fail = (what) => { throw new Error(`the heroine: ${what}`); };
        const FEET = 0.03;
        const body = await g(async (feet) => {
          const THREE = __game.THREE, { model, root } = __game.hero, meshes = [], bones = {};
          model.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); if (o.isBone) bones[o.name] = o; });
          const out = { meshes: meshes.length, bones: Object.keys(bones).length, feet: [], skin: 0, skinPainted: 0, dressPainted: 0 };
          if (meshes.length !== 1) return out;
          // Every clip of hers, sampled 13 times on a mixer of its own; the game's mixer poses her again in the next frame.
          const mixer = new THREE.AnimationMixer(model), v = new THREE.Vector3();
          for (const [name, action] of __game.hero.actions) {
            const clip = action.getClip(), a = mixer.clipAction(clip);
            a.play();
            let low = Infinity;
            for (let k = 0; k <= 12; k++) {
              mixer.setTime(clip.duration * k / 12); root.updateMatrixWorld(true);
              for (const b of ['foot_l', 'foot_r', 'ball_l', 'ball_r']) low = Math.min(low, bones[b].getWorldPosition(v).y - root.position.y);
            }
            a.stop(); mixer.uncacheAction(clip);
            if (Math.abs(low) > feet) out.feet.push(`${name} ${low.toFixed(3)} m`);
          }
          mixer.uncacheRoot(model);
          // The painted texture against the file it was painted from: skin texels (orange hues, mid to light) unchanged.
          const map = meshes[0].material.map, img = await createImageBitmap(await (await fetch(new URL('models/hero/tex/T_Child_BaseColor.webp', document.baseURI))).blob());
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
          const was = ctx.getImageData(0, 0, c.width, c.height).data;
          if (!map?.image?.getContext || map.image.width !== c.width) { out.noCanvas = true; return out; }
          const now = map.image.getContext('2d').getImageData(0, 0, c.width, c.height).data, col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
          for (let i = 0; i < was.length; i += 4) {
            col.setRGB(was[i] / 255, was[i + 1] / 255, was[i + 2] / 255, THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace);
            const changed = Math.abs(was[i] - now[i]) + Math.abs(was[i + 1] - now[i + 1]) + Math.abs(was[i + 2] - now[i + 2]) > 6;
            if (hsl.h > 0.02 && hsl.h < 0.12 && hsl.s > 0.25 && hsl.l > 0.45 && hsl.l < 0.85) { out.skin++; if (changed) out.skinPainted++; }
            if (hsl.h > 0.2 && hsl.h < 0.4 && hsl.s > 0.3 && hsl.l > 0.4 && changed) out.dressPainted++;
          }
          return out;
        }, FEET);
        if (body.meshes !== 1) fail(`${body.meshes} skinned meshes instead of the one child model`);
        if (body.bones !== 65) fail(`${body.bones} bones instead of the 65 of the game skeleton`);
        if (body.feet.length) fail(`the feet leave the ground by more than ${FEET * 100} cm: ${body.feet.join(', ')}`);
        if (body.noCanvas) fail('her texture is not the painted canvas of T_Child_BaseColor');
        if (!body.skin || body.skinPainted) fail(`the look re-painted ${body.skinPainted} of ${body.skin} skin texels`);
        if (!body.dressPainted) fail('the look did not re-paint the dress');
        // Pictures on open ground at the spawn, the camera close; waits in game time (__game.time).
        const gameWait = async (s) => {
          const t0 = await g(() => __game.time);
          await page.waitForFunction(([t, d]) => __game.time - t >= d, [t0, s], { timeout: T(600000) }) /* clock: ceiling */
            .catch(() => fail(`${s} s of game time did not pass`));
        };
        const back = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; __game.closeup(3.2); });
        await gameWait(1.2); await shot('hero-idle');
        await page.keyboard.down('KeyW');
        try {
          await gameFor(() => ['Walk', 'Run'].includes(__game.hero.current), null, 5).catch(() => fail('she does not walk'));
          await gameWait(0.6); await shot('hero-walk');
        } finally { await page.keyboard.up('KeyW'); }
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; });
        await gameWait(0.8);
        const floor = await g(() => __game.hero.root.position.y);
        await page.keyboard.press('Space');
        await gameFor((y) => __game.hero.current === 'Jump' && __game.hero.root.position.y - y > 0.3, floor, 5)
          .catch(() => fail('she does not jump'));
        await shot('hero-jump');
        await g(() => __game.closeup(null));
        await g(([x, z]) => __game.teleport(x, z), back); await gameWait(1);
        console.log(`the heroine: one model, feet on the ground in ${(await g(() => __game.hero.actions.size))} clips, ${body.skin} skin texels kept, ${body.dressPainted} dress texels painted`);

        // ---- her items (PLAY-04, PLAY-05, PLAY-06, src/game/gear.ts): all thirteen modelled items hang on her, none but the petals
        // shown by default; each modelled item, in every clip sampled 13 times, rides on its bone (the distance from a point
        // of the item to the bone stays the same within 1 cm and within the reach of its slot); in Walk, Run, Jump and
        // Interact the wand, beyond the grip, keeps out
        // of her head (a ball as big as the nearest head vertex to the middle of the head) and off her spine (8 cm from the
        // pelvis-neck line); the wings slot shows the petals, the butterfly or nothing; pictures ----
        const gearFail = (what) => { throw new Error(`her items: ${what}`); };
        const REACH = { head: 0.85, wand: 0.45, wings: 0.45 }, RIGID = 0.01, SPINE = 0.08;
        const gear = await g(async ([reach, rigid, spineR]) => {
          const THREE = __game.THREE, { model, root } = __game.hero, gear = __game.gear, out = { errors: [], near: {} };
          if (!gear) return { errors: ['no __game.gear'] };
          for (const [slot, id] of Object.entries({ head: null, wand: null, wings: 'wings_petals', trail: null })) {
            if (gear.get(slot) !== id) out.errors.push(`by default the slot "${slot}" wears ${gear.get(slot)}, not ${id}`);
          }
          for (const [id, part] of Object.entries(gear.parts)) if (part.object.visible) out.errors.push(`${id} is worn by default`);
          // the seven of the shop and the six of the looks (PLAY-06, src/game/looks.ts)
          const want = ['crown', 'earrings_star', 'elf_ears', 'tiara', 'wand_crystal', 'wand_flower', 'wand_leaf', 'wand_moon', 'wand_star', 'wings_butterfly', 'wizard_cap', 'wizard_hat', 'wreath'];
          if (Object.keys(gear.parts).sort().join() !== want.join()) out.errors.push(`the items on her: ${Object.keys(gear.parts).sort().join(', ')}, not ${want.join(', ')}`);
          let mesh; const B = {};
          model.traverse((o) => { if (o.isSkinnedMesh) mesh = o; if (o.isBone) B[o.name] = o; });
          const geo = mesh.geometry, si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
          const headId = mesh.skeleton.bones.findIndex((b) => b.name === 'Head'), head = [];
          for (let i = 0; i < si.count; i += 2) { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === headId) w += sw.getComponent(i, k); if (w > 0.9) head.push(i); }
          const v = new THREE.Vector3(), c = new THREE.Vector3(), box = new THREE.Box3(), mid = new THREE.Vector3(), seg = new THREE.Line3();
          const mixer = new THREE.AnimationMixer(model);
          for (const [id, part] of Object.entries(gear.parts)) {
            const slot = id.startsWith('wand') ? 'wand' : id.startsWith('wings') ? 'wings' : 'head';
            part.object.visible = true;
            root.updateMatrixWorld(true);
            const centre = part.object.worldToLocal(box.setFromObject(part.object).getCenter(new THREE.Vector3()));   // a point fixed in the item
            let lo = Infinity, hi = 0;
            for (const [name, action] of __game.hero.actions) {
              const clip = action.getClip(), a = mixer.clipAction(clip), wand = slot === 'wand' && ['Walk', 'Run', 'Jump', 'Interact'].includes(name);
              a.play();
              let inHead = Infinity, toSpine = Infinity;
              for (let k = 0; k <= 12; k++) {
                mixer.setTime(clip.duration * k / 12); root.updateMatrixWorld(true);
                const d = part.object.localToWorld(c.copy(centre)).distanceTo(part.bone.getWorldPosition(v));
                lo = Math.min(lo, d); hi = Math.max(hi, d);
                if (!wand) continue;
                const skinned = (vi) => { mesh.getVertexPosition(vi, v); mesh.applyBoneTransform(vi, v); return v.applyMatrix4(mesh.matrixWorld); };
                mid.set(0, 0, 0); for (const vi of head) mid.add(skinned(vi)); mid.divideScalar(head.length);
                let r = Infinity; for (const vi of head) r = Math.min(r, skinned(vi).distanceTo(mid));
                seg.set(B.pelvis.getWorldPosition(new THREE.Vector3()), B.neck_01.getWorldPosition(new THREE.Vector3()));
                const grip = part.bone.getWorldPosition(new THREE.Vector3());
                part.object.traverse((o) => {
                  if (!o.isMesh) return;
                  const pos = o.geometry.attributes.position;
                  for (let i = 0; i < pos.count; i++) {
                    v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                    if (v.distanceTo(grip) < 0.1) continue;      // the grip is in her hand
                    inHead = Math.min(inHead, v.distanceTo(mid) - r);
                    toSpine = Math.min(toSpine, v.distanceTo(seg.closestPointToPoint(v, true, c)));
                  }
                });
              }
              a.stop(); mixer.uncacheAction(clip);
              if (wand) {
                out.near[`${id} ${name}`] = `head +${inHead.toFixed(3)}, spine ${toSpine.toFixed(3)}`;
                if (inHead < 0) out.errors.push(`${id} goes into her head in ${name}: ${(-inHead).toFixed(3)} m deep`);
                if (toSpine < spineR) out.errors.push(`${id} goes into her body in ${name}: ${toSpine.toFixed(3)} m from her spine`);
              }
            }
            part.object.visible = false;
            if (hi - lo > rigid) out.errors.push(`${id} slides on its bone ${part.bone.name}: ${lo.toFixed(3)}…${hi.toFixed(3)} m from it`);
            if (hi > reach[slot]) out.errors.push(`${id} is ${hi.toFixed(3)} m from its bone ${part.bone.name}, farther than ${reach[slot]} m`);
            out[id] = hi.toFixed(3);
          }
          mixer.uncacheRoot(model);
          // The wings slot: the petals, the butterfly, nothing.
          const petals = () => { let n = 0; __game.hero.root.children.forEach((o) => { if (o.isMesh && o.visible && o.material.transparent) n++; }); return n; };
          gear.set('wings', null);
          if (petals() || gear.parts.wings_butterfly.object.visible) out.errors.push('no wings: some wings are still shown');
          gear.set('wings', 'wings_butterfly');
          if (petals() || !gear.parts.wings_butterfly.object.visible) out.errors.push('the butterfly wings: not shown alone');
          gear.set('wings', 'wings_petals');
          if (petals() !== 2 || gear.parts.wings_butterfly.object.visible) out.errors.push(`the petals: ${petals()} shown, the butterfly ${gear.parts.wings_butterfly.object.visible ? 'too' : 'not'}`);
          try { gear.set('head', 'wand_star'); out.errors.push('a wand was worn on the head'); } catch { /* refused, as it should */ }
          return out;
        }, [REACH, RIGID, SPINE]);
        if (gear.errors.length) gearFail(gear.errors.join('; '));
        // Pictures: the crown, the star wand, the butterfly wings and the trail while she walks; the hat and the crystal
        // wand without wings; the wreath with the petals; the earrings. Then she wears what she did by default.
        const wear = (items) => g((it) => { for (const [slot, id] of Object.entries(it)) __game.gear.set(slot, id); }, items);
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; __game.closeup(3.2); });
        await wear({ head: 'crown', wand: 'wand_star', wings: 'wings_butterfly', trail: 'trail_sparkle' });
        await page.keyboard.down('KeyW');
        try {
          await gameFor(() => ['Walk', 'Run'].includes(__game.hero.current), null, 5).catch(() => gearFail('she does not walk'));
          await gameWait(0.6); await shot('gear-crown-walk');
        } finally { await page.keyboard.up('KeyW'); }
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; });
        await wear({ head: 'wizard_hat', wand: 'wand_crystal', wings: null, trail: null });
        await gameWait(1); await shot('gear-hat');
        await wear({ head: 'wreath', wand: null, wings: 'wings_petals' });
        await gameWait(0.5); await shot('gear-wreath');
        await wear({ head: 'earrings_star' });
        await gameWait(0.5); await shot('gear-earrings');
        await wear({ head: null, wand: null, wings: 'wings_petals', trail: null });
        await g(() => __game.closeup(null));
        await g(([x, z]) => __game.teleport(x, z), back); await gameWait(1);
        console.log(`her items: ${Object.keys(gear).filter((k) => !['errors', 'near'].includes(k)).map((k) => `${k} ${gear[k]} m`).join(', ')} from their bones; the wand off her head and spine: ${Object.entries(gear.near).map(([k, n]) => `${k} ${n}`).join('; ')}`);
      }

      // ---- stars never go down (LEARN-14): watched on every frame from here to the end of the world, read on every step ----
      // A star that is won is also stored at once, in the same frame: the save on a timer would lose it if the page died.
      await g(() => {
        const w = window.__stars = { last: __game.save.stars, drops: [], unsaved: [], frames: 0, buy: null, bought: [] };
        const look = () => {
          const n = __game.save.stars;
          // The one way down: a purchase the walkthrough announced (window.__stars.buy), exactly its price, the thing in
          // the save's purchases (a potion: its stock as announced), stored at once (PLAY-04). Any other drop is an error.
          const b = w.buy, kept = n !== w.last ? JSON.parse(localStorage.getItem('amw-save') || '{}') : null;
          const got = b && (b.stock === undefined ? __game.save.owned.includes(b.id) && kept.owned?.includes(b.id)
            : __game.save.supplies?.[b.id] === b.stock && kept.supplies?.[b.id] === b.stock);
          if (n < w.last && b && w.last - n === b.price && got && kept.stars === n) { w.bought.push(`${b.id} ${w.last} -> ${n}`); w.buy = null; }
          else if (n < w.last) w.drops.push(`${w.last} -> ${n}`);
          if (n > w.last) { if (kept.stars !== n) w.unsaved.push(`${w.last} -> ${n}, stored ${kept.stars}`); }
          w.last = n; w.frames++; requestAnimationFrame(look);
        };
        look();
      });
      let starDrops = 0, starUnsaved = 0;
      const starsKept = async (where) => {
        const w = await g(() => ({ drops: window.__stars.drops, unsaved: window.__stars.unsaved, frames: window.__stars.frames }));
        for (const d of w.drops.slice(starDrops)) errors.push(`stars: ${mode}: the number of stars went down ${where}: ${d}`);
        for (const d of w.unsaved.slice(starUnsaved)) errors.push(`stars: ${mode}: stars won ${where} were not stored at once: ${d}`);
        starDrops = w.drops.length; starUnsaved = w.unsaved.length;
        return w.frames;
      };
      const seen = new Set();
      const mistakes = new Set();   // task types in which all three deliberate mistakes were made
      // An open task is known to the planner of spoken lines (VOICE-03): asked in one go, a task may close in between.
      // And once nothing holds the heroine, no task is open for it either.
      const unplanned = () => g(() => {
        const open = !document.querySelector('#task').classList.contains('hidden') || __game.bf.active;
        return open && !__game.inTask ? 'a task is open, but the planner of spoken lines does not know it'
          : !__game.busy && __game.inTask ? 'no task is open, but the planner of spoken lines still thinks one is' : '';
      });
      const noPlan = 'a task is open, but the planner of spoken lines does not know it';
      // ---- butterflies: the task can be closed with its own button and started again (PLAY-02) ----
      const ambient = await g(() => __game.flies.flies.length);   // butterflies in the world before any task
      let bfVisits = 0;             // how many times the open butterflies task was met
      let onward = false;           // the cat's "go on" after a shard was seen with its subtitle
      let onwardLate = false;       // ...and once more with the button pressed after the thanks
      let hurried = false;          // the talk right after the fifth star was played
      let starsCounted = false;     // the bubble was looked at after a star of the search was found
      let cutOff = 0;               // how many times closing the task had a spoken line to stop
      const wrongNumber = () => g(() => {
        const b = [...document.querySelectorAll('#answers button')].find((x) => Number(x.textContent) !== __game.bf.n);
        if (!b) return false; b.dispatchEvent(new PointerEvent('pointerdown')); return true;
      });
      // Presses the close button the way a child does and checks that nothing of the task is left, at once and after
      // the longest pause of the task (a step of the cat's count): the heroine is free, the task butterflies and the
      // numbers are gone, the voice is silent, nothing was recorded. Then walks away; the loop below comes back and talks
      // to the unicorn again.
      const closeButterflies = async (q, when) => {
        const fail = (what) => { throw new Error(`closing the butterflies task (${when}): ${what}`); };
        const record = () => g(() => JSON.stringify({ skills: __game.save.skills, quests: __game.save.worlds.fairy.quests, stars: __game.save.stars }));
        const before = await record();
        if (await sounding()) cutOff++;
        await (touch ? page.tap('#answersClose', { timeout: T(5000) }) : page.click('#answersClose', { timeout: T(5000) })) /* clock: input-event */
          .catch((e) => fail(`the close button cannot be pressed: ${why(e)}`));
        for (const pause of [0.1, 0.3]) {             // a moment of game time later, and a while later
          await gameSeconds(pause);
          const left = await held();
          left.push(...await g((n) => {
            const out = [], shownEl = (sel) => !document.querySelector(sel).classList.contains('hidden');
            if (shownEl('#answers')) out.push('the answers panel is still open');
            if (shownEl('#answersClose')) out.push('the close button is still shown');
            if (__game.bf.active) out.push('the task is still open');
            const { flies, mesh } = __game.flies;
            if (flies.length !== n || mesh.count !== n) out.push(`${flies.length} butterflies in the world (${mesh.count} drawn) instead of ${n}`);
            if (__game.bf.sprites.length) out.push(`${__game.bf.sprites.length} numbers of the count are left`);
            return out;
          }, ambient));
          const after = await record();
          if (after !== before) left.push(`the save changed: ${before} -> ${after}`);
          if (await sounding()) left.push('a spoken line is still sounding');
          if (left.length) fail(`${left.join('; ')} (${pause} s of game time later)`);
        }
        await g(([x, z]) => __game.teleport(x + 8, z + 8), [q.x, q.z]); await framesDrawn(2);
        if (!(await walks())) fail('the heroine does not walk');
        console.log(`butterflies closed ${when}: ${ambient} butterflies in the world, nothing recorded, the heroine walks`);
      };
      // ---- star search: it is not a counting task, no skill may change while it runs (LEARN-02) ----
      const progress = () => g(() => ({ skills: JSON.parse(JSON.stringify(__game.save.skills)), deer: __game.save.worlds.fairy.quests.deer ?? 0, stars: __game.save.stars }));
      let searchBefore = null, searchAfter = null;
      const quests = await g(() => __game.npcs.map((n) => ({ id: n.def.id, x: n.def.x, z: n.def.z, chain: n.def.steps.length })));
      // The order of the friends is the order the guide leads to them and the order of the shards in the book.
      const FAIRY_ORDER = ['unicorn', 'fox', 'mushking', 'deer', 'queen'];
      if (quests.map((q) => q.id).join() !== FAIRY_ORDER.join()) errors.push(`friends: ${mode}: the order is ${quests.map((q) => q.id).join(', ')}, not ${FAIRY_ORDER.join(', ')}`);
      // ---- the fifth star, and at once a talk to another character (VOICE-03); then the bubble repeats the question (VOICE-08) ----
      // The praise and "back to the deer" of the search must not cut that conversation off: its greeting and the question
      // of its task are heard to the end, and the bubble shows no line that is not spoken. A tap on the bubble starts the
      // question anew only once it is over. The task is then closed with its button: nothing is recorded.
      const talkAfterLastStar = async (q) => {
        const fail = (what) => { throw new Error(`a talk right after the fifth star: ${what}`); };
        const done = await g(() => ({ ...__game.save.worlds.fairy.quests }));
        // Someone whose quest is finished: a greeting, then one of his games - none of them is the "watch and repeat" one,
        // whose second question cuts the first one off by design.
        const other = quests.find((x) => x.id !== q.id && (done[x.id] ?? 0) >= x.chain);
        if (!other) fail('no character with a finished quest to talk to');
        const mark = await g((id) => new Promise((res) => {
          const t0 = performance.now(), captions = window.__captions = [];
          const watch = () => {            // every line the bubble shows from now on
            const key = document.querySelector('#bubble').classList.contains('hidden') ? null : __game.line;
            if (key && captions.at(-1) !== key) captions.push(key);
            if (window.__captions === captions) requestAnimationFrame(watch);
          };
          __game.cheat();                  // onto the last star
          const tick = () => {
            if (__game.search.active) { if (performance.now() - t0 > 10000) res(-1); else requestAnimationFrame(tick); return; }
            const plays = window.__plays;
            __game.talk(id); watch(); res(plays);
          };
          tick();
        }), other.id);
        if (mark < 0) fail('the search did not end on the fifth star');
        await gameFor(() => !!document.querySelector('#task:not(.hidden)'), null, 20).catch(() => fail(`the task of "${other.id}" did not open`));
        // A question of the bank (R37) is fetched the first time it is asked: src/core/voice.ts waits up to 4 s for it
        // (BANK_WAIT_MS), then says the general question of the task instead. So the question is waited for until one of the
        // two sounds - the bubble's key tells which - within that pause and a margin; nothing sounding by then fails below.
        const asked = await page.waitForFunction(() => {
          const key = __game.line;
          return !!key && window.__started.some((a) => !a.paused && !a.ended && window.__clip(a) === key) && key;
        }, null, { timeout: T(6000) }).then((h) => h.jsonValue(), () => null); /* clock: audio */
        const askedBy = !asked ? 'nothing' : /^q_/.test(asked) ? `its clip of the bank (${asked})`
          : `the general question (${asked}): no clip of the bank to play (not kept, without network; or not loaded in 4 s)`;
        const before = await saved();
        const probe = await g(() => {
          const key = __game.line, n = window.__starts[key] ?? 0;
          const live = window.__started.filter((a) => !a.paused && !a.ended).map(window.__clip);
          document.querySelector('#bubble').click();
          return { key, live, again: (window.__starts[key] ?? 0) - n, inTask: __game.inTask };
        });
        if (!probe.inTask) fail(noPlan);
        if (!probe.live.includes(probe.key)) fail(`the question "${probe.key}" is not sounding when its task opens (sounding: ${probe.live.join(' ') || 'nothing'})`);
        if (probe.again) fail(`a tap on the bubble started "${probe.key}" anew while it was still sounding`);
        await page.waitForFunction((k) => window.__started.findLast((a) => window.__clip(a) === k)?.paused, probe.key, { timeout: T(20000) }) /* clock: audio */
          .catch(() => fail(`the question "${probe.key}" did not end`));
        const heard = await g((from) => {
          const captions = window.__captions; window.__captions = null;
          return { clips: window.__started.filter((a) => a.__n > from).map((a) => ({ id: window.__clip(a), ended: a.ended })), captions, dropped: [...__game.dropped] };
        }, mark);
        const names = heard.clips.map((c) => c.id);
        const cut = heard.clips.filter((c) => !c.ended).map((c) => c.id);
        if (cut.length) fail(`cut off before the end: ${cut.join(' ')} (started since the star: ${names.join(' ')})`);
        if (names.length < 2 || names.at(-1) !== probe.key) fail(`a greeting and the question "${probe.key}" had to sound, but these did: ${names.join(' ') || 'nothing'}`);
        // Online the bubble shows the example of the bank at once and, if its clip does not come in time, the general
        // question that is said instead (src/core/voice.ts `sayBank`): that example is the only caption allowed unspoken.
        const mute = heard.captions.filter((k) => !names.includes(k) && !(/^q_/.test(k) && asked && !/^q_/.test(asked) && names.includes(asked)));
        if (mute.length) fail(`the bubble showed a line that was not spoken: ${mute.join(' ')}`);
        if (!heard.dropped.includes('t_stars_back')) fail('"t_stars_back" was not turned away: the conversation did not start before it');
        const n = await g((k) => window.__starts[k] ?? 0, probe.key);
        await tapOn('#bubble').catch((e) => fail(`the bubble cannot be tapped: ${why(e)}`));
        await page.waitForFunction(([k, was]) => (window.__starts[k] ?? 0) === was + 1, [probe.key, n], { timeout: T(5000) }) /* clock: audio */
          .catch(() => fail(`a tap on the bubble did not start "${probe.key}" again once it was over`));
        await tapOn('#taskClose').catch((e) => fail(`the task cannot be closed: ${why(e)}`));
        await gameFor(() => !__game.busy, null, 10).catch(() => fail('the closed task did not give the controls back'));
        const left = [];
        if (await sounding()) left.push('the question is still sounding after its task was closed');
        if (await g(() => __game.inTask)) left.push('the planner of spoken lines still thinks a task is open');
        if (await g(() => __game.line)) left.push('the game still remembers the line of the closed task: a tap on the cat would say it again');
        const after = await saved();
        if (after !== before) left.push(`the save changed: ${before} -> ${after}`);
        if (left.length) fail(left.join('; '));
        console.log(`a talk right after the fifth star (${other.id}): asked by ${askedBy}; ${names.join(', ')} heard to the end, "t_stars_back" turned away; `
          + `a tap on the bubble repeated "${probe.key}" only once it was over; the closed task recorded nothing`);
        hurried = true;
      };
      // ---- the fifth star in silence: its number "five" is heard to the end, and only then the praise ----
      // The one search of the world is taken by the talk above, where the number is cut off by design; so once it is over
      // the deer's quest is put back to its start (in memory) and searched a second time.
      let fifthHeard = false;
      const fifthStar = async () => {
        const fail = (what) => { throw new Error(`fifth star: ${what}`); };
        const from = await g(() => { const n = window.__plays; __game.cheat(); return n; });
        const since = () => g((f) => window.__started.filter((a) => a.__n > f).map((a) => ({ id: window.__clip(a), ended: a.ended })), from);
        await page.waitForFunction((f) => window.__started.some((a) => a.__n > f && window.__clip(a).startsWith('praise_')), from, { timeout: T(15000) }) /* clock: audio */
          .catch(async () => fail(`no praise was started after it (started since: ${(await since()).map((c) => c.id).join(' ') || 'nothing'})`));
        const clips = await since(), names = clips.map((c) => c.id).join(' ');
        const five = clips.findIndex((c) => c.id === 'tap_5'), praised = clips.findIndex((c) => c.id.startsWith('praise_'));
        if (five < 0) fail(`"tap_5" was not started (started since the star: ${names})`);
        if (five > praised) fail(`the praise started before "tap_5" (${names})`);
        if (!clips[five].ended) fail(`"tap_5" was cut off before its end (started since the star: ${names})`);
        console.log(`the fifth star in silence: ${names} - "tap_5" heard to the end, then the praise`);
        fifthHeard = true;
      };
      // ---- a task of another character during the search, closed with its cross: the bubble is the search's again ----
      // Its line, its count of the stars found, and (without the voice) its question: a tap on the bubble or the cat
      // repeats the search, not the closed task.
      let searchResumed = false;
      const closedInSearch = async (q) => {
        const fail = (what) => { throw new Error(`star search after a closed task: ${what}`); };
        const done = await g(() => ({ ...__game.save.worlds.fairy.quests }));
        const other = quests.find((x) => x.id !== q.id && (done[x.id] ?? 0) >= x.chain);
        if (!other) fail('no character with a finished quest to talk to');
        const found = await g((id) => { __game.talk(id); return __game.search.found; }, other.id);
        await gameFor(() => !!document.querySelector('#task:not(.hidden)'), null, 20).catch(() => fail(`the task of "${other.id}" did not open`));
        await tapOn('#taskClose').catch((e) => fail(`the task cannot be closed: ${why(e)}`));
        await gameFor(() => !__game.busy, null, 10).catch(() => fail('the closed task did not give the controls back'));
        const b = await bubbleNow(), left = [];
        if (!b.shown) left.push('the bubble is hidden');
        if (b.key !== 't_stars') left.push(`the game remembers "${b.key}", not the line of the search: a tap on the cat would say it`);
        if (!b.text.includes(`⭐ ${found} / 5`)) left.push(`the bubble shows "${b.text}", not the count ⭐ ${found} / 5`);
        if (mute && !b.text.startsWith(asked.stars?.text ?? '\0')) left.push(`without the voice the question of the search is not in the bubble: "${b.text}"`);
        if (left.length) fail(`${left.join('; ')} (${other.id})`);
        console.log(`a closed task of "${other.id}" during the search: the bubble shows "${b.text}" (${b.key})`);
        searchResumed = true;
      };
      // ---- a talk to the deer during the search: its question again, and the bubble of the search with the count ----
      // While the question sounds and after the scene: the line of the search, its count of the stars found, and (without
      // the voice) its question - not the question alone, which would hide the count until the next star.
      let deerAsked = false;
      const deerInSearch = async () => {
        const fail = (what) => { throw new Error(`talk to the deer during the search: ${what}`); };
        await silence().catch(() => fail('the voice did not fall silent before the talk'));
        const was = await g(() => ({ n: window.__starts.t_stars ?? 0, found: __game.search.found }));
        await g(() => __game.talk('deer'));
        const count = `⭐ ${was.found} / 5`;
        const check = (b, when) => {
          const left = [];
          if (!b.shown) left.push('the bubble is hidden');
          if (b.key !== 't_stars') left.push(`the game remembers "${b.key}", not the line of the search`);
          if (!b.text.includes(count)) left.push(`the bubble shows "${b.text}", not the count ${count}`);
          if (mute && !b.text.startsWith(asked.stars?.text ?? '\0')) left.push(`without the voice the question of the search is not in the bubble: "${b.text}"`);
          if (left.length) fail(`${when}: ${left.join('; ')}`);
        };
        await page.waitForFunction((n) => __game.busy && (window.__starts.t_stars ?? 0) > n, was.n, { timeout: T(10000) }) /* clock: audio */
          .catch(() => fail('the question of the search was not said'));
        check(await bubbleNow(), 'while the question sounds');
        await gameFor(() => !__game.busy, null, 20).catch(() => fail('the scene did not end'));
        const b = await bubbleNow();
        check(b, 'after the scene');
        console.log(`a talk to the deer during the search: the question was said, the bubble shows "${b.text}" (${b.key})`);
        deerAsked = true;
      };
      // ---- the last task of another chain solved during the search: its shard, and no "go on" (go_next) after it ----
      // The walkthrough closes the chains in order, so one finished chain is put back (in memory) to its last step right
      // before the talk; solving it gives the same shard back. The sparkles lead to the stars, so the bubble stays the
      // search's: the line of the search with the count, and "go_next" is neither started nor turned away.
      let shardSearched = false;
      const shardInSearch = async (q) => {
        const fail = (what) => { throw new Error(`a shard during the search: ${what}`); };
        await holdAch();   // the block measures the silence, the decision on "go on" and the bubble after the shard
        const done = await g(() => ({ ...__game.save.worlds.fairy.quests }));
        const other = quests.find((x) => x.id !== q.id && (done[x.id] ?? 0) >= x.chain);
        if (!other) fail('no character with a finished quest to talk to');
        await silence().catch(() => fail('the voice did not fall silent before the talk'));
        const was = await g((id) => {
          __game.save.worlds.fairy.quests[id] = 2; __game.talk(id);     // one go: no frame sees the counter of crystals out of step
          return { said: window.__starts.go_next ?? 0, dropped: __game.dropped.filter((k) => k === 'go_next').length, found: __game.search.found, settled: __game.shardsSettled };
        }, other.id);
        // the last step is a task on the card or one played in the world (the unicorn's "compare": the two glades)
        await gameFor(() => !!document.querySelector('#task:not(.hidden)') || !!__game.worldTask.state, null, 20).catch(() => fail(`the last task of "${other.id}" did not open`));
        // __game.cheat() walks onto a star while the search is on: the task is solved with the search put aside for that one
        // synchronous call (no frame runs in between)
        const how = await g(() => { const s = __game.search; s.active = false; try { return __game.cheat(); } finally { s.active = true; } });
        if (how !== 'panel' && how !== 'world task') fail(`the last task of "${other.id}" was not solved (${how || 'nothing done'})`);
        await fanfareCard(30, 'a shard during the search').catch(() => fail(`no shard of "${other.id}" after its last task`));
        await tapOn('#fanfareOk').catch((e) => fail(`the button of the shard cannot be pressed: ${why(e)}`));
        await gameFor(() => !__game.busy, null, 15).catch(() => fail('the scene of the shard did not end'));
        await silence().catch(() => fail('the thanks did not end'));
        // "go on" is decided the moment the thanks end (src/game/dialogue.ts, `shardsSettled`): the walkthrough waits for
        // that decision, not for a while of game time (a starved runner did not reach 1 s of it in 30 s), then for the
        // line it may have started to be heard to its end
        await gameFor((n) => __game.shardsSettled > n, was.settled, 30)
          .catch(() => fail('the game never decided whether to say "go on" after the shard'));
        await wait(300); await silence().catch(() => fail('a line after the shard did not end')); /* clock: audio */
        const now = await g(() => ({ said: window.__starts.go_next ?? 0, dropped: __game.dropped.filter((k) => k === 'go_next').length, quest: __game.save.worlds.fairy.quests }));
        const b = await bubbleNow(), left = [];
        if ((now.quest[other.id] ?? 0) < other.chain) left.push(`the quest of "${other.id}" is not finished: ${now.quest[other.id]}`);
        if (now.said > was.said) left.push('"go_next" was said');
        if (now.dropped > was.dropped) left.push('"go_next" was asked for (the planner turned it away)');
        if (!b.shown) left.push('the bubble is hidden');
        if (b.key !== 't_stars') left.push(`the game remembers "${b.key}", not the line of the search: a tap on the cat would say it`);
        if (!b.text.includes(`⭐ ${was.found} / 5`)) left.push(`the bubble shows "${b.text}", not the count ⭐ ${was.found} / 5`);
        if (left.length) fail(`${left.join('; ')} (${other.id})`);
        await releaseAch();
        console.log(`the last task of "${other.id}" solved during the search: its shard, no "go_next", the bubble shows "${b.text}" (${b.key})`);
        searchBefore = await progress();   // the task recorded its skill and stars: the search is measured from here on
        shardSearched = true;
      };
      // ---- every panel task can be closed with its button (LEARN-14): the first meeting of each kind closes it at once ----
      // A real tap or click on the cross, then: the controls are back, nothing of the task is left (panel, planner, voice,
      // bubble), the save is the same (skills, quests, stars), and the heroine walks. The loop below talks to the same
      // character again; the second meeting is the usual one (picture, deliberate mistake, hint, answer).
      const closed = new Map();     // task type -> { quest, step } when it was closed
      const closeTask = async (q, type, button = '#taskClose') => {
        const fail = (what) => { throw new Error(`closing the "${type}" task: ${what}`); };
        const step = await g((id) => __game.save.worlds.fairy.quests[id] ?? 0, q.id);
        const before = await saved();
        await tapOn(button).catch((e) => fail(`the close button cannot be pressed: ${why(e)}`));
        await gameFor(() => !__game.busy, null, 10).catch(() => fail('the closed task did not give the controls back'));
        await framesDrawn(2);
        const left = await held();
        if (await visible('#task')) left.push('the task is still on screen');
        if (await g(() => !!window.__game.worldTask?.state)) left.push('the task in the world is still open');
        if (await g(() => __game.inTask)) left.push('the planner of spoken lines still thinks a task is open');
        if (await sounding()) left.push('a spoken line is still sounding');
        const after = await saved();
        if (after !== before) left.push(`the save changed: ${before} -> ${after}`);
        if (left.length) fail(left.join('; '));
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; }); await framesDrawn(2);   // open ground at the spawn
        if (!(await walks())) fail('the heroine does not walk');
        closed.set(type, { quest: q.id, step });
        console.log(`"${type}" closed with the cross (${q.id}, step ${step + 1}): nothing recorded, the heroine walks`);
      };
      // ---- a step of a chain played in the world (PLAY-01, src/game/worldtasks/): the frame's door, real taps once ----
      // First meeting of the kind: closed with its cross (as the panel's tasks). Then, once: its picture; three wrong moves
      // through the door, each showing its rung of the hint; on the narrow phone then a real tap on the screen at a wrong
      // thing and at the right one (projected from the door's targets: the move is counted, the heroine does not walk, the
      // tap takes the thing aimed at - its reach against the nearest other thing on the screen is logged). Then what is
      // left is solved through the door.
      const KIND_TYPE = { sort: 'sort', stones: 'order', glades: 'compare' };
      // What a real tap can take now, on the screen: each thing's point there, whether it is the right move, and whether it is
      // free to tap (on the screen and not under the bubble or a button).
      const targetsOnScreen = () => g(() => {
          const t = __game.worldTask.targets(), V = __game.THREE.Vector3;
          const px = (p) => {
            const s = new V(...p).project(__game.camera), x = (s.x * 0.5 + 0.5) * innerWidth, y = (-s.y * 0.5 + 0.5) * innerHeight;
            const under = s.z < 1 && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? document.elementFromPoint(x, y) : null;
            // the tuning button is of ?debug only (ARCH-11): the published game has none, so it does not count
            const debugOnly = !!under?.closest?.('#tuneBtn');
            return { x, y, z: s.z, free: under?.id === 'c' || debugOnly, under: under ? under.id || under.localName : 'off the screen' };
          };
          return { reach: t.reach, all: t.all.map((o) => ({ ...px(o.pos), right: o.right })) };
        });
      const realTaps = async (kind) => {
        const fail = (what) => { throw new Error(`a real tap on "${kind}": ${what}`); };
        const at = () => g(() => {
          const t = __game.worldTask.targets(), V = __game.THREE.Vector3;
          const px = (p) => {
            const s = new V(...p).project(__game.camera), x = (s.x * 0.5 + 0.5) * innerWidth, y = (-s.y * 0.5 + 0.5) * innerHeight;
            const under = s.z < 1 && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? document.elementFromPoint(x, y) : null;
            return { x, y, z: s.z, free: under?.id === 'c' };     // on the screen and not under a button
          };
          return { reach: t.reach, all: t.all.map((o) => ({ ...px(o.pos), right: o.right })) };
        });
        const near = (all, a) => Math.min(...all.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
        const tapAt = async (a) => { await (touch ? page.touchscreen.tap(a.x, a.y) : page.mouse.click(a.x, a.y)); };
        const hp = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
        // the camera first comes to rest on the task (it glides there in game time)
        await cameraRests();
        let t = await at();
        const hidden = t.all.filter((a) => !a.free);
        if (hidden.length) errors.push(`world task: ${mode}: "${kind}": ${hidden.length} of ${t.all.length} things cannot be tapped (off the screen or under a button): ${JSON.stringify(hidden.map((a) => [Math.round(a.x), Math.round(a.y)]))}`);
        const bad = t.all.find((a) => !a.right && a.free), good = t.all.find((a) => a.right && a.free);
        if (!bad || !good) fail(`no wrong and right thing free to tap on the screen: ${JSON.stringify(t.all)}`);
        const gaps = { bad: near(t.all, bad), good: near(t.all, good) };
        const s0 = await g(() => __game.worldTask.state);
        await tapAt(bad);
        await gameFor((n) => __game.worldTask.state?.wrongs === n + 1, s0.wrongs, 5).catch(async () => fail(`a tap at a wrong thing (${Math.round(bad.x)},${Math.round(bad.y)}) was not taken as a wrong move: ${JSON.stringify(await g(() => __game.worldTask.state))}`));
        await gameFor(() => __game.worldTask.state?.phase === 'input', null, 30).catch(() => {});
        t = await at();
        const good2 = t.all.find((a) => a.right && a.free);
        await tapAt(good2);
        await gameFor((n) => (__game.worldTask.state?.moves ?? n + 1) > n || !__game.worldTask.state, s0.moves, 5).catch(async () => fail(`a tap at the right thing (${Math.round(good2.x)},${Math.round(good2.y)}) was not taken: ${JSON.stringify(await g(() => __game.worldTask.state))}`));
        await gameSeconds(0.1);
        const moved = await g(([x, z]) => Math.hypot(__game.hero.root.position.x - x, __game.hero.root.position.z - z), hp);
        if (moved > 0.2) fail(`the heroine walked ${moved.toFixed(2)} m after the taps`);
        if (Math.min(gaps.bad, gaps.good) <= t.reach) errors.push(`world task: ${mode}: "${kind}": the reach of a tap (${t.reach} px) is not less than the gap to the nearest other thing (${Math.round(Math.min(gaps.bad, gaps.good))} px): a tap may take the neighbour`);
        console.log(`world task "${kind}": real taps - a wrong one and a right one taken; the reach ${t.reach} px, the nearest other thing ${Math.round(gaps.bad)} / ${Math.round(gaps.good)} px away on the screen`);
      };
      const worldStep = async (q, st) => {
        const type = KIND_TYPE[st.kind] ?? st.kind;
        if (!closed.has(type)) { await closeTask(q, type, '#answersClose'); return; }
        if (!seen.has(type)) {
          seen.add(type);
          await cameraRests(); await calm(); await shot(`task-world-${st.kind}`);
          // every thing to tap is free on the screen, in every size (the places it goes to may lie under the bubble)
          const blocked = (await targetsOnScreen()).all.filter((a) => !a.free);
          if (blocked.length) errors.push(`world task: ${mode}: "${st.kind}": ${blocked.length} thing(s) to tap under ${[...new Set(blocked.map((a) => a.under))].join(', ')}: ${JSON.stringify(blocked.map((a) => [Math.round(a.x), Math.round(a.y)]))}`);
          // three wrong moves through the door: each shows the rung of its round, the third the last
          for (let k = 1; k <= 3; k++) {
            const w0 = await g(() => __game.worldTask.state?.wrongs ?? 0);
            if (w0 >= 3) break;
            if (!(await g(() => __game.worldTask.wrong()))) break;
            await gameFor((n) => __game.worldTask.state?.wrongs === n + 1 && __game.worldTask.state?.phase === 'input', w0, 30)
              .catch(async () => errors.push(`world task: ${mode}: "${st.kind}": wrong move ${k} through the door did not run its course: ${JSON.stringify(await g(() => __game.worldTask.state))}`));
            const rung = await g(() => __game.worldTask.state?.rung ?? 0);
            if (rung !== w0 + 1) errors.push(`world task: ${mode}: "${st.kind}": after wrong move ${w0 + 1} the hint shows rung ${rung}`);
          }
          const end = await g(() => __game.worldTask.state);
          if (end && end.wrongs >= 3 && end.rung === 3) mistakes.add(type);   // the three rungs of its hint were seen
          console.log(`world task "${st.kind}" (${q.id}): pictured, three wrong moves through the door, each its rung of the hint`);
          // then real taps on the narrow phone: a wrong thing, then the right one - which ends a task of one answer (the glades)
          if (mode === 'mobile-portrait') await realTaps(st.kind);
        }
        // what is left of it, solved through the door (none: a real right tap has ended it)
        if (await g(() => !!__game.worldTask.state && __game.worldTask.state.phase !== 'solved') && (await g(() => __game.cheat())) !== 'world task') errors.push(`world task: ${mode}: the cheat did not solve "${st.kind}" through the door`);
        await gameFor(() => !window.__game.worldTask.state, null, 15).catch(() => errors.push(`world task: ${mode}: "${st.kind}" did not end once solved`));
      };
      let crystalsWrong = false;
      for (const q of quests.filter((x) => plays(x.id))) {
        // "Stuck" is no progress, not a long chain: the clock starts again at every step of the chain. A chain whose tasks are
        // met for the first time (closed with the cross, then three deliberate mistakes each) outlasts one limit on the slow
        // CI runner while every step of it moves on (the deer's chain of a new kind, 2026-11-16).
        let t0 = Date.now(), at = -1; /* clock: stuck-guard */
        // a chain is done with its last step (three tasks; the fox's and the king's part hidden in the world is a fourth)
        while (!(await g((id) => (__game.save.worlds.fairy.quests[id] ?? 0) >= __game.npcs.find((n) => n.def.id === id).def.steps.length, q.id)) || await g(() => __game.busy)) {
          const step = await g((id) => __game.save.worlds.fairy.quests[id] ?? 0, q.id);
          if (step !== at) { at = step; t0 = Date.now(); } /* clock: stuck-guard */
          if (Date.now() - t0 > T(stuckMs)) {   /* clock: stuck-guard */
            // what holds the chain: the task on screen, what the cheat would reach first, the planner and the line
            const held = await g(() => ({ task: !document.querySelector('#task').classList.contains('hidden') ? document.querySelector('#taskStage').className : null,
              shown: document.querySelector('#taskStage').dataset.shown ?? null, pulse: document.querySelectorAll('#task .pulse').length,
              world: __game.worldTask.state, bf: { active: __game.bf.active, demo: __game.bf.demo }, search: __game.search.active,
              busy: __game.busy, inTask: __game.inTask, line: __game.line, speaking: __game.speaking, ach: __game.ach.scene })).catch((e) => String(e));
            throw new Error(`quest stuck: ${q.id} (no step for ${Math.round(T(stuckMs) / 1000)} s at step ${step + 1}): ${JSON.stringify(held)}`); /* clock: stuck-guard */
          }
          await starsKept(`in the quest "${q.id}"`);
          // The crystal counter counts finished friends only: a quest halfway through gives no shard yet.
          if (!crystalsWrong && !(await g(() => __game.busy))) {
            const c = await g(() => ({ hud: document.querySelector('#crystals').textContent, quests: { ...__game.save.worlds.fairy.quests },
              done: __game.npcs.filter((c) => (__game.save.worlds.fairy.quests[c.def.id] ?? 0) >= c.def.steps.length).length }));
            if (c.hud !== `${c.done}/5`) { crystalsWrong = true; errors.push(`crystals: ${mode}: the counter shows ${c.hud} with the quests ${JSON.stringify(c.quests)}`); }
          }
          if (searchBefore && !searchAfter && !(await g(() => __game.search.active))) {
            // the search has just ended and no other task was opened since: whatever differs was written by the search
            searchAfter = await progress();
            for (const k of Object.keys(searchAfter.skills)) {
              const [a, b] = [searchBefore.skills[k], searchAfter.skills[k]].map((v) => JSON.stringify(v));
              if (a !== b) errors.push(`the star search changed the "${k}" skill: ${a} -> ${b}`);
            }
            if (searchAfter.deer < 1) errors.push('the star search did not move the quest of the deer on');
            if (searchAfter.stars < searchBefore.stars + 3) errors.push(`the star search gave ${searchAfter.stars - searchBefore.stars} stars, not 3`);
            console.log('star search: "count" skill before', JSON.stringify(searchBefore.skills.count), 'after', JSON.stringify(searchAfter.skills.count));
            if (hurried && !fifthHeard) await g(() => { __game.save.worlds.fairy.quests.deer = 0; });   // the second search, see fifthStar
          }
          if (await fanfareUp(`the chain of "${q.id}"`)) {
            await shot(`shard-${q.id}`);
            // After the first shard: the cat's "go on" comes with its subtitle - after the scene (its end clears the bubble)
            // and after the character's thanks, which still sound when the button is pressed (a hint does not cut them off).
            if (shardTalks && !onward) {
              const fail = (what) => { throw new Error(`after the shard: ${what}`); };
              const during = await sounding();   // false only on a very slow machine: then the order is not put to the test
              const said = await g(() => window.__starts.go_next ?? 0);
              await holdAch();   // the stop point after the card would bring a scene in before "go_next"
              await page.click('#fanfareOk');
              await page.waitForFunction((n) => !__game.busy && __game.line === 'go_next' && (window.__starts.go_next ?? 0) > n
                && !document.querySelector('#bubble').classList.contains('hidden'), said, { timeout: T(15000) }) /* clock: audio */
                .catch(() => fail('"go_next" was not said with its subtitle once the thanks were over'));
              await releaseAch();
              console.log(`after the shard: "go_next" is said with its subtitle (the button was pressed ${during ? 'while the thanks sounded' : 'after the thanks'})`);
              onward = true;
            } else if (shardTalks && !onwardLate) {
              // After the second shard the button waits for the end of the thanks: "go on" must still come after the scene,
              // with its subtitle - not inside the scene, whose end would clear its bubble.
              const fail = (what) => { throw new Error(`after the second shard: ${what}`); };
              const t0 = Date.now(); /* clock: audio */
              while (await sounding()) { if (Date.now() - t0 > T(15000)) fail('the thanks did not end'); await wait(200); } /* clock: audio */
              const said = await g(() => window.__starts.go_next ?? 0);
              await holdAch();   // as above: no scene between the card and "go_next"
              await page.click('#fanfareOk');
              await page.waitForFunction((n) => !__game.busy && __game.line === 'go_next' && (window.__starts.go_next ?? 0) > n
                && !document.querySelector('#bubble').classList.contains('hidden'), said, { timeout: T(15000) }) /* clock: audio */
                .catch(() => fail('"go_next" was not said with its subtitle after the scene (the button was pressed after the thanks)'));
              await releaseAch();
              console.log('after the second shard: "go_next" is said with its subtitle (the button was pressed after the thanks)');
              onwardLate = true;
            } else await page.click('#fanfareOk');
            await framesDrawn(1); continue;   // the loop reads the game again: a frame is its pace
          }
          { const wrong = await unplanned(); if (wrong) errors.push(wrong); }
          {
            const st = await g(() => window.__game.worldTask?.state ?? null);
            if (st && (st.phase === 'input' || st.phase === 'mistake')) { await worldStep(q, st); continue; }
          }
          if (await visible('#task')) {
            const type = await g(() => document.querySelector('#taskStage').className.split(' t-')[1].split(' ')[0]);
            if (!closed.has(type)) { await closeTask(q, type); continue; }
            if (!seen.has(type)) {
              seen.add(type);
              // "watch and repeat" is pictured after its show; every task once its screen has come to rest
              if (type === 'simon') await gameFor(() => !document.querySelector('#taskStage').classList.contains('watch'), null, 20).catch(() => {});
              await calm(); await shot(`task-${type}`); await checkQuestion(type);
              // Three deliberate mistakes per task type (LEARN-10, R16): after each the scenario waits until "try again" and
              // the line of that rung have ended and the rung's show has run (the stage's `data-shown`), then checks the
              // screen: rung 1 gives nothing away (`hint step 1:`), rung 2 shows the solution without lighting the answer
              // (`hint:`), rung 3 lights the right answer and nothing else (`hint step 3:`).
              // The right element is learnt from the game itself: the task's own "solve" is run with its taps swallowed
              // on the way down, so nothing is answered, and then any other element of the same kind is tapped.
              // Sorting solves in a loop that needs its taps to land, so there the wrong basket is told by its colour.
              // Memory pairs have no wrong move and no hint.
              if (type !== 'pairs') {
                let rungs = 0;
                for (let k = 1; k <= 3; k++) {
                  // a replay of "watch and repeat" locks its pads: the next mistake waits for the end of the show
                  await gameFor(() => !document.querySelector('#taskStage').classList.contains('watch'), null, 20).catch(() => {});
                  const wrong = await g((kind) => {
                    const tap = (e) => e.dispatchEvent(new PointerEvent('pointerdown'));
                    if (kind === 'sort') {
                      const colour = [...document.querySelector('.gem.current').classList].find((c) => !['gem', 'current', 'glow'].includes(c));
                      const basket = [...document.querySelectorAll('#taskOpts .basket')].find((b) => !b.classList.contains(colour));
                      if (!basket) return 'no basket of another colour';
                      tap(basket); return '';
                    }
                    let right = null;
                    const swallow = (e) => { right ??= e.target; e.stopImmediatePropagation(); };
                    document.addEventListener('pointerdown', swallow, true);
                    try { __game.cheat(); } finally { document.removeEventListener('pointerdown', swallow, true); }
                    if (!right) return 'the game did not show which element is right';
                    const same = [...document.querySelectorAll(`#task ${right.tagName}.${[...right.classList][0]}`)]
                      .filter((e) => e !== right && !e.contains(right) && !right.contains(e) && !e.classList.contains('yes') && !e.classList.contains('q'));
                    if (!same.length) return `no other element like the right one (${right.className})`;
                    tap(same[0]); return '';
                  }, type);
                  if (wrong) { errors.push(`no deliberate mistake ${k} in the "${type}" task: ${wrong}`); break; }
                  const ran = await hintRan(`#taskStage[data-shown="${k}"]`);
                  if (!ran) { errors.push(`hint: ${mode} ${type}: the hint of mistake ${k} did not run its course`); break; }
                  if (k === 1) {
                    const away = await g((sel) => [...document.querySelectorAll(sel)].map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`), GIVEAWAY);
                    if (away.length) errors.push(`hint step 1: ${mode} ${type}: after the first mistake the screen gives the answer away: ${[...new Set(away)].join(', ')}`);
                    await shot(`hint1-${type}`); await checkHint(type);
                  } else if (k === 2) {
                    // The picture is taken once the solution is on screen: a broken "show the solution" step fails the run.
                    const drawn = await gameFor((sel) => !!document.querySelector(sel), SHOWS[type], 15).then(() => true, () => false);
                    if (!drawn) errors.push(`hint: ${mode} hint-${type}: the solution was not shown after the second mistake (no ${SHOWS[type]})`);
                    const lit = await g(() => document.querySelectorAll('#task .pulse').length);
                    if (lit) errors.push(`hint: ${mode} hint-${type}: the second mistake already lights the answer (.pulse)`);
                    await shot(`hint-${type}`); await checkHint(type);
                  } else {
                    // What pulses is what the game itself would tap first, and nothing else pulses.
                    const lit = await g(() => {
                      let right = null;
                      const swallow = (e) => { right ??= e.target; e.stopImmediatePropagation(); };
                      document.addEventListener('pointerdown', swallow, true);
                      try { __game.cheat(); } finally { document.removeEventListener('pointerdown', swallow, true); }
                      const p = [...document.querySelectorAll('#task .pulse')];
                      return { n: p.length, right: !!right && p.length === 1 && (p[0] === right || p[0].contains(right)) };
                    });
                    if (!lit.right) errors.push(`hint step 3: ${mode} ${type}: after the third mistake ${lit.n} element(s) pulse, not the right answer alone`);
                    await shot(`hint3-${type}`);
                  }
                  rungs = k;
                }
                if (rungs === 3) mistakes.add(type);
              }
            }
            await g(() => __game.cheat()); await framesDrawn(1); continue;
          }
          if (await g(() => __game.bf.active)) {
            bfVisits++;
            if (bfVisits === 1) {
              // first meeting: close the task at once, while the unicorn is still asking; walk away, come back
              seen.add('butterflies');
              await closeButterflies(q, 'before an answer'); continue;
            }
            if (bfVisits === 2) {
              // second meeting: a wrong number, and the task is closed while the cat counts the butterflies aloud
              await calm(); await shot('task-butterflies'); await checkQuestion('butterflies');
              // the cat counts after the second mistake (rung 2): the first one only says the way
              if (!(await wrongNumber())) throw new Error('closing the butterflies task: no wrong number to tap');
              await gameFor(() => __game.bf.shown === 1, null, 20);
              if (!(await wrongNumber())) throw new Error('closing the butterflies task: no second wrong number to tap');
              await gameFor(() => __game.bf.demo && __game.bf.sprites.length >= 2, null, 30);
              await closeButterflies(q, 'while the cat counts'); continue;
            }
            if (bfVisits === 3) {
              await calm();
              // Three deliberate wrong numbers (R16): 1 - the way is said, no butterfly is touched or numbered and no
              // answer pulses; 2 - the cat counts every butterfly aloud; 3 - the button of the right number pulses, alone.
              const giveaway = () => g(() => ({ sprites: __game.bf.sprites.length, landed: __game.flies.flies.slice(__game.bf.first, __game.bf.first + __game.bf.n).filter((f) => f.landed).length,
                pulse: [...document.querySelectorAll('#answers button.pulse')].map((b) => b.textContent), n: __game.bf.n }));
              let rungs = 0;
              for (let k = 1; k <= 3; k++) {
                if (!(await wrongNumber())) { errors.push(`no deliberate mistake ${k} in the "butterflies" task: no other number to tap`); break; }
                if (k === 2) {
                  const counting = await gameFor(() => __game.bf.demo && __game.bf.sprites.length >= 1, null, 20).then(() => true, () => false);
                  if (!counting) { errors.push(`hint: ${mode} hint-butterflies: the cat did not start counting the butterflies after the second mistake`); break; }
                  if ((await giveaway()).pulse.length) errors.push(`hint: ${mode} hint-butterflies: the second mistake already lights the answer`);
                  await shot('hint-butterflies'); await checkHint('butterflies');
                  await gameFor(() => !__game.bf.demo, null, 30);
                } else {
                  const ran = await gameFor((r) => __game.bf.shown === r, k, 20).then(() => true, () => false);
                  if (!ran) { errors.push(`hint: ${mode} butterflies: the hint of mistake ${k} did not run its course`); break; }
                  const v = await giveaway();
                  if (k === 1 && (v.sprites || v.landed || v.pulse.length)) errors.push(`hint step 1: ${mode} butterflies: after the first mistake the screen gives the answer away: ${JSON.stringify(v)}`);
                  if (k === 3 && (v.pulse.length !== 1 || v.pulse[0] !== String(v.n))) errors.push(`hint step 3: ${mode} butterflies: after the third mistake the buttons ${JSON.stringify(v.pulse)} pulse, not ${v.n} alone`);
                  await shot(k === 1 ? 'hint1-butterflies' : 'hint3-butterflies');
                  if (k === 1) await checkHint('butterflies');
                }
                rungs = k;
              }
              if (rungs === 3) mistakes.add('butterflies');
            }
            // The right answer, and at once the close button (the panel stays on screen for a moment): the answer stands.
            const step = await g((id) => __game.save.worlds.fairy.quests[id] ?? 0, q.id);
            await g(() => __game.cheat());
            await page.locator('#answersClose').dispatchEvent('click');
            await gameFor(([id, n]) => (__game.save.worlds.fairy.quests[id] ?? 0) === n + 1, [q.id, step], 5).catch(() => {});
            if ((await g((id) => __game.save.worlds.fairy.quests[id] ?? 0, q.id)) !== step + 1) errors.push('the close button undid the right answer of the butterflies task');
            continue;
          }
          if (await g(() => __game.search.active)) {
            if (!seen.has('stars')) { seen.add('stars'); await calm(); await shot('task-stars'); await checkQuestion('stars');
              // Without the voice no timer hides the question: it is still there after the six seconds it gets with the voice.
              if (mute) {
                await wait(6500); /* clock: audio */
                const b = await bubbleNow();
                if (!b.shown || b.text !== asked.stars.text) errors.push(`question: ${mode} task-stars: without the voice the question was gone before the first star: ${b.shown ? `"${b.text}"` : 'the bubble is hidden'}`);
              }
            }
            // Without the voice the question stays next to the count of the stars found; with the voice the count replaces it.
            if (!starsCounted && (await g(() => __game.search.found)) >= 1) {
              starsCounted = true; await shot('task-stars-found');
              const b = await bubbleNow(), q = asked.stars?.text ?? '';
              if (!b.shown || !/⭐ \d \/ 5$/.test(b.text)) errors.push(`question: ${mode} task-stars-found: the bubble does not show the count of the stars: "${b.text}"`);
              else if (mute ? !q || !b.text.startsWith(q) : b.text.length > 10) errors.push(`question: ${mode} task-stars-found: ${mute ? 'without' : 'with'} the voice the bubble shows "${b.text}"`);
            }
            searchBefore ??= await progress();
            const found = await g(() => __game.search.found);
            if (!searchResumed && !hurried && found >= 1 && found <= 3) { await closedInSearch(q); continue; }
            if (!deerAsked && !hurried && found >= 1 && found <= 3) { await deerInSearch(); continue; }
            if (!shardSearched && !hurried && found >= 1 && found <= 3) { await shardInSearch(q); continue; }
            if (!hurried && found === 4) { await talkAfterLastStar(q); continue; }
            if (!fifthHeard && found === 4) { await fifthStar(); continue; }
            await g(() => __game.cheat()); await framesDrawn(1); continue;
          }
          // ---- a part hidden in the world (WORLD-08, R09/R10): after the fox's and the king's three tasks the character has
          // said where its shard lies and it waits there. The fox's is found on the first visit of the glade, walking in
          // through the waterfall: the secret and the shard both give their stars, the cat's line of the secret is heard and
          // the shard waits for its end - nothing turned away; then the card of the shard. Any other: she is put on it.
          {
            const part = await g((id) => { const p = __game.parts?.waiting(id); return p ? { flag: p.flag, hint: p.hint, line: p.line } : null; }, q.id);
            if (part) {
              const fail = (what) => { throw new Error(`a part in the world (${q.id}): ${what}`); };
              await gameFor(() => !__game.busy, null, 30).catch(() => fail('the talk did not end'));
              const said = await g((p) => ({ hint: !!__game.save.worlds.fairy.flags[p.hint], line: (window.__starts[p.line] ?? 0) > 0 || __game.line === p.line }), part);
              if (!said.hint || (!mute && !said.line)) fail(`the character did not say where its shard lies (${JSON.stringify(said)})`);
              const s0 = await g(() => ({ stars: __game.save.stars, glade: !!__game.save.worlds.fairy.flags.glade, dropped: __game.dropped.length }));
              if (q.id === 'fox' && !s0.glade) {
                await silence().catch(() => {});
                const from = await g(() => {
                  const G = __game.secrets.gladeAt, f = Math.atan2(-G.x, -G.z);
                  return { f, x: G.x + Math.sin(f) * 9, z: G.z + Math.cos(f) * 9 };
                });
                await g((p) => { __game.teleport(p.x, p.z); __game.hero.heading = p.f + Math.PI; __game.cam.yaw = p.f; }, from);
                await framesDrawn(2);
                await page.keyboard.down('KeyW');
                try { await gameUntil(() => __game.save.worlds.fairy.flags.glade === true, null, 12); }
                finally { await page.keyboard.up('KeyW'); }
                if (!(await g(() => __game.save.worlds.fairy.flags.glade === true))) fail('walking in through the waterfall did not find the glade');
                await g(() => __game.cheat());     // onto the shard: it is taken once the cat's line of the secret has ended
                await gameFor((f) => !!__game.save.worlds.fairy.flags[f], part.flag, 20).catch(() => fail('the shard on the glade was not taken'));
                const s1 = await g((n) => ({ stars: __game.save.stars, dropped: __game.dropped.slice(n), glade: (window.__starts.secret_glade ?? 0) > 0 }), s0.dropped);
                if (s1.stars - s0.stars !== 3 + 3) fail(`the secret and the shard gave ${s1.stars - s0.stars} stars, not 3 + 3`);
                if (!mute && !s1.glade) fail('the line of the secret was not heard');
                if (s1.dropped.length) fail(`lines turned away on the glade: ${s1.dropped.join(', ')}`);
                console.log(`a part in the world: the fox said where; on the first visit of the glade the secret (its line heard) and then the shard - ${s1.stars - s0.stars} stars, nothing turned away`);
              } else {
                await g(() => __game.cheat());
                await gameFor((f) => !!__game.save.worlds.fairy.flags[f], part.flag, 20).catch(() => fail('the shard was not taken at its place'));
                console.log(`a part in the world: ${q.id} said where, its shard taken at its place`);
              }
              continue;
            }
          }
          // a talk only while the chain is not done: read in the same look as "busy" - its last step may have ended since
          // the loop's check, and a talk then would open one of its games again (the conversation after a chain)
          if (await g((id) => !__game.busy && (__game.save.worlds.fairy.quests[id] ?? 0) < __game.npcs.find((n) => n.def.id === id).def.steps.length, q.id)) {
            await g(([x, z]) => __game.teleport(x + 1.4, z + 1.4), [q.x, q.z]);
            await framesDrawn(2);
            if (touch) await press('#btnAct'); else await page.keyboard.press('KeyE');
          }
          await framesDrawn(1);
        }
        console.log('quest done:', q.id, `${((Date.now() - t0) / 1000).toFixed(0)}s`); /* clock: log-time */
        // "All the shards are found" is said after the last friend's shard, never earlier.
        {
          const a = await g(() => ({ said: window.__starts.all_shards ?? 0, done: __game.npcs.filter((c) => (__game.save.worlds.fairy.quests[c.def.id] ?? 0) >= c.def.steps.length).length, all: __game.npcs.length }));
          if (a.done < a.all && a.said) errors.push(`all shards: ${mode}: "all_shards" was said with ${a.done} of ${a.all} friends done`);
          if (a.done === a.all && !a.said) errors.push(`all shards: ${mode}: "all_shards" was not said after the last shard`);
        }
      }
      {
        // Each kind closed at its first meeting was met again and played: its quest went past the step it was closed at.
        const done = await g(() => ({ ...__game.save.worlds.fairy.quests }));
        // E2E_ONLY: the kinds of the chains the group played
        const steps = new Set((await g(() => __game.npcs.map((n) => [n.def.id, n.def.steps]))).filter(([id]) => plays(id)).flatMap(([, st]) => st));
        // A step whose kind follows its level (BY_STEP) is the kind its level played: the one met (closed and played) -
        // and, with a fixed level, the kind of that level (the house on 4, the neighbours on 4, the signs on 5).
        const fixed = await g(() => ({ ...__game.save.fixed }));
        const played = {};          // step -> the kinds it played
        for (const [step, by] of Object.entries(BY_STEP)) {
          played[step] = by.kinds.filter((t) => seen.has(t) || closed.has(t));
          if (!steps.has(step)) continue;
          if (!played[step].length) errors.push(`${step}: ${mode}: the step "${step}" played neither ${by.kinds.join(' nor ')}`);
          const level = fixed[by.skill], want = level > 0 ? by.want(level) : '';
          if (want && played[step].join() !== want) errors.push(`${step}: ${mode}: level ${level} of "${by.skill}" played ${played[step].join(', ') || 'nothing'}, not ${want}`);
        }
        const playedKinds = new Set(Object.entries(played).filter(([step]) => steps.has(step)).flatMap(([, k]) => k));
        const kinds = new Set([...steps].flatMap((t) => (BY_STEP[t] ? played[t] : [t])));
        const panel = Object.keys(QUESTIONS).filter((t) => t !== 'butterflies' && t !== 'stars' && (!BY_LEVEL_KINDS.includes(t) || playedKinds.has(t)) && (!group || kinds.has(t)));
        const unclosed = panel.filter((t) => !closed.has(t));
        if (unclosed.length) errors.push(`close: ${mode}: never closed with its button: ${unclosed.join(', ')}`);
        for (const [t, c] of closed) {
          if (!seen.has(t) || (done[c.quest] ?? 0) <= c.step) errors.push(`close: ${mode}: the "${t}" task was closed and not played again (${c.quest}, step ${c.step + 1})`);
        }
        console.log(`closed with the cross at the first meeting, nothing recorded, the heroine walked, then played: ${[...closed.keys()].join(' ')}`);
      }
      await gameFor(() => !__game.busy, null, 30);
      // ---- "sort" in the world (ARCH-09): the debug show at the deer, from a description like the panel's ----
      // Opened by __game.worldSort() only (the deer's chain keeps its "sort" on the panel). Once it is closed with its
      // cross, once it is solved; either way nothing is recorded - it is a debug show - and the heroine walks afterwards.
      if (has('world-sort')) {
        const fail = (what) => { throw new Error(`sort in the world: ${what}`); };
        const before = await saved();
        const open = async () => {
          await g(() => __game.worldSort());
          await gameFor(() => __game.sorting.active && __game.busy, null, 10).catch(() => fail('the show did not open'));
          if (!(await g(() => __game.inTask))) fail(noPlan);
        };
        const ended = async (how) => {
          await gameFor(() => !__game.sorting.active && !__game.busy, null, 10)
            .catch(() => fail(`${how}: the show did not give the controls back`));
          await framesDrawn(2);
          const left = await held();
          if (await visible('#answersClose')) left.push('the close button is still shown');
          if (await g(() => __game.inTask)) left.push('the planner of spoken lines still thinks a task is open');
          if (await sounding()) left.push('a spoken line is still sounding');
          const after = await saved();
          if (after !== before) left.push(`the save changed: ${before} -> ${after}`);
          if (left.length) fail(`${how}: ${left.join('; ')}`);
        };
        await open();
        await cameraRests(); await calm(); await shot('task-world-sort');
        const pedestals = await g(() => __game.sorting.colors.length);
        if (pedestals < 2) fail(`${pedestals} pedestals on the arc`);
        await tapOn('#answersClose').catch((e) => fail(`the close button cannot be pressed: ${why(e)}`));
        await ended('closed with its cross');
        await open();
        // the debug door of a task in the world (src/game/worldtasks/core.ts): its state without knowing its kind, one wrong
        // move through the same handler a tap takes, then the cheat solves it through the door
        const st0 = await g(() => __game.worldTask.state);
        if (!st0 || st0.phase !== 'input' || st0.wrongs !== 0) fail(`the door shows ${JSON.stringify(st0)} for a task just opened`);
        if (!(await g(() => __game.worldTask.wrong()))) fail('the door made no wrong move');
        await gameFor(() => __game.worldTask.state?.wrongs === 1, null, 5).catch(async () => fail(`a wrong move through the door was not counted: ${JSON.stringify(await g(() => __game.worldTask.state))}`));
        const how = await g(() => __game.cheat());
        if (how !== 'world task') fail(`__game.cheat() did "${how}", not the task in the world`);
        if ((await g(() => __game.worldTask.state?.phase)) !== 'solved') fail(`the door does not show the task solved: ${JSON.stringify(await g(() => __game.worldTask.state))}`);
        await ended('solved');
        if ((await g(() => __game.worldTask.state)) !== null) fail('the door still shows a task once it is over');
        if (!(await walks())) fail('the heroine does not walk');
        console.log(`sort in the world: ${pedestals} pedestals; closed with its cross, a wrong move and solved through the door - nothing recorded, the heroine walks`);
      }
      // A conversation is broken once on purpose, right after it has taken the controls: the heroine must walk again,
      // and the same conversation must start anew (the replay below).
      if (has('broken-talk')) {
        const left = await breakScene('talk fox', () => g(() => __game.talk('fox')));
        if (await visible('#task')) left.push('a task was opened although the scene broke');
        if (left.length) throw new Error(`the broken conversation: ${left.join('; ')}`);
        if (!(await walks())) throw new Error('the broken conversation: the heroine does not walk');
        console.log('broken conversation: reported, the controls are back, the heroine walks');
      }
      // ---- the tuning panel (?debug, ARCH-14): its sliders work at once, without a reload ----
      // Speed: the path walked forward in the same time from the same spot at the spawn (open ground towards the castle),
      // with the speed of the code and with half of it. Look: the camera turn of the same drag with the code's sensitivity
      // and with twice that. Camera: the distance follows its slider. Then "reset" brings back every value of the code.
      if (has('tuning')) {
        const fail = (what) => { throw new Error(`tuning panel: ${what}`); };
        // Smoothed values (camera distance, tilt) follow in game time (__game.time): a frame counts at most 0.05 s, so on
        // a starved CI runner a wall-clock pause is a fraction of that in the game. Waits here are in game seconds.
        const gameWait = async (s) => {
          const t0 = await g(() => __game.time);
          await page.waitForFunction(([t, d]) => __game.time - t >= d, [t0, s], { timeout: T(600000) }) /* clock: ceiling */
            .catch(() => fail(`${s} s of game time did not pass`));
        };
        const back = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
        // `ms` is game time (__game.time): a frame counts at most 0.05 s, so with software rendering (CI) a second
        // on the wall clock is a quarter of a second in the game, and the path in it is a quarter as long.
        const path = async (ms) => {
          await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; }); await framesDrawn(2);
          const from = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
          await page.keyboard.down('KeyW');
          let anim = '';
          try {
            const t0 = await g(() => __game.time);
            await page.waitForFunction(([t, s]) => __game.time - t >= s, [t0, ms / 1000], { timeout: T(600000), polling: 'raf' }) /* clock: ceiling */
              .catch(() => fail(`${ms / 1000} s of game time did not pass`));
            anim = await g(() => __game.hero.current);
          } finally { await page.keyboard.up('KeyW'); }
          path.anim = anim;            // the animation she walks with: "Run" above the run threshold, "Walk" below
          return g(([x, z]) => Math.hypot(__game.hero.root.position.x - x, __game.hero.root.position.z - z), from);
        };
        // The picture of the open panel: at the spawn, with no bubble and no action button over the game.
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; });
        await gameFor(() => document.querySelector('#bubble').classList.contains('hidden'), null, 20)
          .catch(() => fail('the speech bubble did not go away'));
        await calm();
        await tapOn('#tuneBtn');
        if (!(await visible('#tune'))) fail('the button did not open the panel');
        await shot('32-tuning');
        const defaults = await g(() => ({ ...__game.tuning }));
        const code = defaults.speed;
        // The paths are short (game time is slow on the CI runner: each second of it can take several of the clock): half a
        // second is metres at either speed, and the two are compared with each other.
        await path(200);                         // she turns to walk forward, the same in both runs
        const full = await path(500);
        await page.locator('#tune input[data-k=speed]').fill(String(code / 2));
        const half = await g(() => __game.tuning.speed);
        if (half !== code / 2) fail(`the speed slider set the speed to ${half} instead of ${code / 2}`);
        const slow = await path(500);
        const slowAnim = path.anim;
        console.log(`tuning panel: speed ${code} -> ${full.toFixed(2)} m in 0.5 s, speed ${half} -> ${slow.toFixed(2)} m`);
        if (!(full > 1)) fail(`with the speed of the code the heroine walked ${full.toFixed(2)} m in 0.5 s`);
        if (!(slow < full * 0.75)) fail(`the speed slider does not slow the heroine down: ${full.toFixed(2)} m, then ${slow.toFixed(2)} m with half the speed`);
        // The run threshold: at the same speed she runs while it is below the speed and walks once it is above.
        await page.locator('#tune input[data-k=runFrom]').fill(String(half + 0.5));
        await path(300);
        console.log(`tuning panel: at ${half} m/s "${slowAnim}" with the run threshold ${defaults.runFrom}, "${path.anim}" with ${half + 0.5}`);
        if (slowAnim !== 'Run' || path.anim !== 'Walk') fail(`the run threshold slider: at ${half} m/s "${slowAnim}" with the threshold ${defaults.runFrom}, "${path.anim}" with ${half + 0.5}`);
        // A drag over the free middle of the screen (right of the joystick half) turns the camera.
        // Across: the camera turn (yaw); down: its tilt (pitch), which follows the drag smoothly - read after it settles.
        const turn = async (dx, dy) => {
          const x = Math.round(size.width * 0.45), y = Math.round(size.height * 0.45);
          const from = await g(() => [__game.cam.yaw, __game.cam.pitch]);
          await page.mouse.move(x, y); await page.mouse.down();
          await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up();
          await gameWait(0.5);
          const to = await g(() => [__game.cam.yaw, __game.cam.pitch]);
          await page.mouse.move(x, y); await page.mouse.down();                    // the same way back
          await page.mouse.move(x - dx, y - dy, { steps: 5 }); await page.mouse.up();
          await gameWait(0.5);
          return dx ? from[0] - to[0] : to[1] - from[1];
        };
        await page.locator('#tune input[data-k=lookX]').fill(String(defaults.lookX * 2));
        await page.locator('#tune input[data-k=lookY]').fill(String(defaults.lookY * 2));
        await page.locator('#tune input[data-k=camDist]').fill('9');
        await tapOn('#tuneBtn');
        if (await visible('#tune')) fail('the button did not close the panel');
        {
          const t0 = await g(() => __game.time);   // up to 5 s of game time, however slow the frames are
          await page.waitForFunction((t) => (__game.cam.dist > 8.5 && !__game.cam.focus) || __game.time - t > 5, t0, { timeout: T(155000) }) /* clock: ceiling */
            .catch(() => {});
          if (!(await g(() => __game.cam.dist > 8.5 && !__game.cam.focus))) {
            fail(`the camera distance did not follow its slider: ${(await g(() => __game.cam.dist)).toFixed(2)} after ${(await g((t) => __game.time - t, t0)).toFixed(1)} s of game time`);
          }
        }
        const fast = [await turn(100, 0), await turn(0, 40)];
        await g((v) => { __game.tuning.lookX = v.lookX; __game.tuning.lookY = v.lookY; }, defaults);
        const usual = [await turn(100, 0), await turn(0, 40)];
        ['across', 'down'].forEach((way, i) => {
          console.log(`tuning panel: a drag ${way} turns the camera by ${usual[i].toFixed(3)} rad, by ${fast[i].toFixed(3)} rad with twice the sensitivity`);
          if (!(usual[i] > 0.1 && fast[i] > usual[i] * 1.6 && fast[i] < usual[i] * 2.4)) fail(`the look sensitivity slider (${way}): the same drag turned the camera by ${usual[i].toFixed(3)} and ${fast[i].toFixed(3)} rad`);
        });
        await tapOn('#tuneBtn');
        await tapOn('#tuneReset');
        const now = await g(() => ({ ...__game.tuning }));
        if (JSON.stringify(now) !== JSON.stringify(defaults)) fail(`"reset" did not bring the values of the code back: ${JSON.stringify(now)}`);
        await tapOn('#tuneBtn');
        if (await visible('#tune')) fail('the button did not close the panel');
        await g(([x, z]) => __game.teleport(x, z), back); await framesDrawn(2);
      }
      // ---- the heroine does not walk through a character (the world's ground and its colliders, ARCH-06) ----
      // She stands 2.5 m in front of the first character (south of it: with the camera turn 0 "forward" is -z) and walks
      // at it for 1.5 s of game time. A character is a circle of 0.8 m and she one of 0.4 m: she stays 1.2 m from its middle.
      if (has('collisions')) {
        const fail = (what) => { throw new Error(`collisions: ${what}`); };
        const at = await g(() => { const n = __game.npcs[0]; return { id: n.def.id, x: n.pos.x, z: n.pos.z }; });
        await g((p) => { __game.teleport(p.x, p.z + 2.5); __game.cam.yaw = 0; window.__near = 99;
          const look = () => { if (window.__near === undefined) return;
            window.__near = Math.min(window.__near, Math.hypot(__game.hero.root.position.x - p.x, __game.hero.root.position.z - p.z)); requestAnimationFrame(look); };
          look(); }, at);
        await framesDrawn(2);
        const t0 = await g(() => __game.time);
        await page.keyboard.down('KeyW');
        try {
          await page.waitForFunction((t) => __game.time - t >= 1.5, t0, { timeout: T(600000) /* clock: ceiling */ }).catch(() => fail('1.5 s of game time did not pass'));
        } finally { await page.keyboard.up('KeyW'); }
        const near = await g(() => { const n = window.__near; window.__near = undefined; return n; });
        const moved = await g((p) => Math.hypot(__game.hero.root.position.x - p.x, __game.hero.root.position.z - p.z), at);
        if (!(near > 1.1)) fail(`she walked into "${at.id}": ${near.toFixed(2)} m from its middle`);
        if (!(moved < 2.2)) fail(`she did not walk towards "${at.id}" (still ${moved.toFixed(2)} m away)`);
        console.log(`collisions: she stopped ${near.toFixed(2)} m from the middle of "${at.id}"`);
      }
      // ---- the three secrets of the first world (PLAY-10, R03, R04; src/worlds/fairy/secrets.ts): the chest by the action
      // button; the glade walked into through its waterfall - "forward" held from the valley until its flag is set, so the
      // curtain is no wall; the house - its door, the music box in the room, the door back out. Each is the world's flag
      // and its stars once (the chest 5, the others 3); coming back gives nothing. Where each one is found is the game's
      // (the items "secret" of __game.items). The scenes of the achievements it earns wait for the block.
      if (has('secrets')) {
        const fail = (what) => { throw new Error(`secrets: ${what}`); };
        const until = async (pred, arg, what, seconds = 8) => { if (!(await gameUntil(pred, arg, seconds))) fail(`${what} (in ${seconds} s of game time)`); };
        const state = () => g(() => ({ flags: { ...__game.save.worlds.fairy.flags }, stars: __game.save.stars, busy: __game.busy, room: __game.secrets.inRoom() }));
        const at = Object.fromEntries((await g(() => __game.items.filter((i) => i.kind === 'secret').map((i) => [i.id, i.at]))));
        if (Object.keys(at).sort().join() !== 'chest,glade,house') fail(`the secrets of the description are ${Object.keys(at).join(', ')}`);
        await holdAchDuring(async () => {
          const s0 = await state();
          // the glade may be found already: the fox's shard lies there, and the walkthrough took it walking in through the
          // waterfall (the block "a part hidden in the world"); then it is not walked into again and gives nothing here
          const gladeFound = !!s0.flags.glade;
          if (s0.flags.chest || s0.flags.house || (gladeFound && !s0.flags.part_fox)) fail(`a secret is found before the block: ${JSON.stringify(s0.flags)}`);
          // the chest
          await g((p) => __game.teleport(p.x, p.z), at.chest); await framesDrawn(2);
          await act();
          await until(() => __game.save.worlds.fairy.flags.chest === true, null, 'the action button at the chest did not open it');
          // the glade: from 9 m out in the valley, the camera behind her, "forward" until the flag
          const from = await g((p) => {
            const f = Math.atan2(-p.x, -p.z), x = p.x + Math.sin(f) * 9, z = p.z + Math.cos(f) * 9;
            __game.teleport(x, z); __game.hero.heading = f + Math.PI; __game.cam.yaw = f;
            return { x, z };
          }, at.glade);
          await framesDrawn(2);
          let walked = 0;
          if (!gladeFound) {
            await page.keyboard.down('KeyW');
            try { await until(() => __game.save.worlds.fairy.flags.glade === true, null, 'walking in through the waterfall did not find the glade', 12); }
            finally { await page.keyboard.up('KeyW'); }
            walked = await g((p) => Math.hypot(__game.hero.root.position.x - p.x, __game.hero.root.position.z - p.z), from);
          }
          // the camera on the glade (secrets.ts, GLADE_CAM): inside the ring of rocks it comes to 2.2-2.6 m from her, over
          // the grass and inside the ring; walking out through the water it goes back to its usual distance with no jump
          await g((p) => { __game.teleport(p.x, p.z); }, at.glade); await gameSeconds(2);
          const gc = await g((p) => {
            const c = __game.camera.position, t = __game.cam.target;
            const r = __game.renderer.info.render;
            return { dist: c.distanceTo(t), over: c.y - __game.hero.root.position.y, fromMiddle: Math.hypot(c.x - p.x, c.z - p.z), calls: r.calls, tris: r.triangles };
          }, at.glade);
          if (Math.abs(gc.dist - 2.4) > 0.2) fail(`the camera on the glade stands ${gc.dist.toFixed(2)} m from her, not 2.2-2.6`);
          if (gc.over < 0.75 || gc.fromMiddle > 4.6) fail(`the camera on the glade stands ${gc.over.toFixed(2)} m over her feet, ${gc.fromMiddle.toFixed(2)} m from the middle (at least 0.75; inside the ring, at most 4.6)`);
          const glideOut = await g((p) => new Promise((done) => {
            // out the way she came: towards the valley's middle, "forward" held; the largest change of the distance in a frame
            const f = Math.atan2(-p.x, -p.z);
            __game.hero.heading = f; __game.cam.yaw = f + Math.PI;
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
            // the change of the camera's distance per metre she walks, frame by frame: a jump would be a large one on a short step
            const hp = __game.hero.root.position;
            let last = __game.cam.dist, lx = hp.x, lz = hp.z, jump = 0;
            const t0 = __game.time;
            const step = () => {
              const moved = Math.hypot(hp.x - lx, hp.z - lz), dd = Math.abs(__game.cam.dist - last);
              if (moved > 0.01) jump = Math.max(jump, dd / moved);
              else if (dd > 0.3) jump = Infinity;      // the distance changed by itself, she standing
              last = __game.cam.dist; lx = hp.x; lz = hp.z;
              if (__game.time - t0 < 4) { requestAnimationFrame(step); return; }
              window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
              done({ jump, dist: __game.cam.dist, out: Math.hypot(hp.x - p.x, hp.z - p.z) });
            };
            requestAnimationFrame(step);
          }), at.glade);
          if (glideOut.out < 6) fail(`walking out of the glade she got ${glideOut.out.toFixed(1)} m from its middle in 4 s, not out of its ring`);
          if (glideOut.jump > 2) fail(`walking out of the glade the camera's distance changed ${glideOut.jump.toFixed(2)} m per metre she walked (at most 2)`);
          if (glideOut.dist < 3) fail(`out of the glade the camera stays ${glideOut.dist.toFixed(2)} m from her: the glade's distance was not given back`);
          // the house: in through its door, the music box, out again
          const doorOut = await g(() => [__game.secrets.doorOut.x, __game.secrets.doorOut.z]);
          await g((p) => __game.teleport(p[0], p[1]), doorOut); await framesDrawn(2);
          await act();
          await until(() => __game.secrets.inRoom() && !__game.busy, null, 'the door of the house did not lead into the room');
          // the camera of the room right after the door: at the height of the eyes over its floor, not lifted by the
          // relief beyond its walls (the hill past the valley's rim once put it some 29 m over the room)
          await gameSeconds(1);
          const eye = await g(() => +(__game.camera.position.y - __game.hero.root.position.y).toFixed(2));
          const roomDraw = await g(() => ({ calls: __game.renderer.info.render.calls, tris: __game.renderer.info.render.triangles }));
          if (eye > 4.5) fail(`the camera in the room stands ${eye} m over the floor right after the door (at most 4.5)`);
          // and it sees no farther than the room: the valley behind its walls is not drawn (docs/perf.md)
          const reachIn = await g(() => __game.camera.far);
          if (reachIn > 40) fail(`the camera in the room reaches ${reachIn} m: the valley behind the walls is drawn`);
          await shot('secrets-room');
          await g((p) => __game.teleport(p.x, p.z), at.house); await framesDrawn(2);
          await act();
          await until(() => __game.save.worlds.fairy.flags.house === true, null, 'the action button at the music box found nothing');
          const doorIn = await g(() => [__game.secrets.doorIn.x, __game.secrets.doorIn.z]);
          await g((p) => __game.teleport(p[0], p[1]), doorIn); await framesDrawn(2);
          await act();
          await until(() => !__game.secrets.inRoom() && !__game.busy, null, 'the door inside did not lead out of the room');
          await gameSeconds(0.5);
          const reachOut = await g(() => __game.camera.far);
          if (reachOut < 100) fail(`out of the room the camera reaches only ${reachOut} m`);
          const s1 = await state();
          const want = 5 + (gladeFound ? 0 : 3) + 3;
          if (s1.stars !== s0.stars + want) fail(`the secrets found in the block gave ${s1.stars - s0.stars} stars, not ${want}`);
          // again: nothing more
          await g((p) => __game.teleport(p.x, p.z), at.glade); await gameSeconds(1);
          await g((p) => __game.teleport(p.x, p.z), at.house); await framesDrawn(2); await act(); await gameSeconds(1);
          const s2 = await state();
          if (s2.stars !== s1.stars) fail(`coming back to the secrets gave ${s2.stars - s1.stars} stars more`);
          await g((p) => { __game.teleport(p[0], p[1]); }, doorIn); await framesDrawn(2); await act();
          await until(() => !__game.secrets.inRoom() && !__game.busy, null, 'the door inside did not lead out the second time');
          // the book: the tab of the secrets shows the three found; closing it is a stop point - the achievements of the
          // secrets are granted there (their scenes wait for the end of the block)
          await tapOn('#btnBook').catch((e) => fail(`the book cannot be opened: ${why(e)}`)); await calm();
          await tapOn('#bookTabs [data-tab=secrets]').catch((e) => fail(`the tab of the secrets cannot be pressed: ${why(e)}`));
          await until(() => !document.querySelector('#bookSecrets').classList.contains('hidden'), null, 'the tab of the secrets does not open');
          const marks = await g(() => [...document.querySelectorAll('#secrets .secret')].map((e) => `${e.dataset.flag}${e.classList.contains('got') ? '+' : '-'}`));
          if (marks.join() !== 'chest+,glade+,house+') fail(`the book shows the secrets ${marks.join(', ')}, not the three found`);
          await shot('secrets-book');
          await tapOn('#bookTabs [data-tab=shelf]').catch(() => {});
          await closeBook().catch((e) => fail(`the book cannot be closed: ${why(e)}`));
          await until(() => ['secret_chest', 'three_secrets'].every((k) => k in __game.save.achievements), null, 'closing the book did not grant "the chest" and "three secrets"');
          console.log(`secrets: the chest, the glade (${gladeFound ? 'found before, with the fox\'s shard' : `walked ${walked.toFixed(1)} m in through the waterfall`}) (its camera ${gc.dist.toFixed(1)} m from her, out with no jump) and the house (the room - the camera ${eye} m over its floor, reaching ${reachIn} m, ${reachOut} m out again -, the music box, out again) found, ${s1.stars - s0.stars} stars; nothing more the second time; the book shows ${marks.length} marks, its close granted the chest and three secrets; draw calls: the glade ${gc.calls} (${Math.round(gc.tris / 1000)}k triangles), the room ${roomDraw.calls} (${Math.round(roomDraw.tris / 1000)}k)`);
        });
      }
      // ---- the creatures of no task (PLAY-11, PLAY-12; src/worlds/fairy/creatures.ts) ----
      // Each kind (fairy, bird, fish) is pictured in both of its actions, framed by the camera (__game.cam.focus is the
      // creature's own position, so the camera follows it); the change of action is waited for in game time. Then a tap
      // on one of each kind, while it is calm: it must answer at once with a reaction that is none of its actions, the
      // three reactions different; the heroine does not walk off, the stars and the save stay as they were.
      if (has('creatures')) {
        const fail = (what) => { throw new Error(`creatures: ${what}`); };
        // A scene of an achievement (PLAY-08) is not let in while the creatures are framed and tapped: it would take the camera.
        await holdAchDuring(async () => {
          const ACTS = { fairy: ['fly', 'gather'], bird: ['perch', 'fly'], fish: ['swim', 'leap'] };
          const CALM = { fairy: 'gather', bird: 'perch', fish: 'swim' };
          const gameWait = async (s) => {
            const t0 = await g(() => __game.time);
            await page.waitForFunction(([t, d]) => __game.time - t >= d, [t0, s], { timeout: T(600000) }) /* clock: ceiling */
              .catch(() => fail(`${s} s of game time did not pass`));
          };
          const back = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
          const kinds = await g(() => __game.creatures.map((c) => c.kind));
          for (const k of Object.keys(ACTS)) if (!kinds.includes(k)) fail(`there is no ${k} (${kinds.join(' ')})`);
          // The camera follows creature `i` from `DIST` m (a close-up); the heroine stands `d` m from it towards the spawn,
          // out of the water.
          const DIST = { fairy: 2.5, bird: 10, fish: 3 }, CLOSE = { fairy: 3.2, bird: 6, fish: 4 };
          const frame = (i, d) => g(([i, d, close]) => {
            const c = __game.creatures[i], p = c.pos, ux = -p.x, uz = 14 - p.z, n = Math.hypot(ux, uz) || 1;
            for (let k = d; k < 40; k += 0.5) {
              __game.teleport(p.x + (ux / n) * k, p.z + (uz / n) * k);
              if (c.kind !== 'fish' || __game.hero.root.position.y > p.y + 0.4) break;
            }
            __game.cam.focus = p; __game.closeup(close[c.kind]);
            // the camera is put where it would come to rest on the creature (src/game/camera.ts: the target a third of the
            // way from the creature to the heroine's head, the turn past her, the close-up distance, the pitch of a close-up)
            // - on a slow runner it would take seconds of game time to glide there
            const hp = __game.hero.root.position, cam = __game.cam;
            cam.target.copy(p).lerp(new __game.THREE.Vector3(hp.x, hp.y + 1.2, hp.z), 0.3);
            cam.yaw = Math.atan2(hp.x - p.x, hp.z - p.z) + 0.5; cam.dist = close[c.kind]; cam.pitch = 0.3;
          }, [i, d, CLOSE]);
          // A state is waited for by the creature's own steps, hurried on: one that is in another state has it ended at
          // once (its time set to its length), so the next state comes in a frame or two of the game - its random length
          // would take minutes of the clock on the slow CI runner. Each action still runs and is pictured as itself.
          const until = async (i, states, what) => {
            if (!(await gameUntil(([i, s]) => {
              const c = __game.creatures[i];
              if (s.includes(c.state)) return true;
              c.t = Math.max(c.t, c.dur);
              return false;
            }, [i, states], 10))) fail(`${what} in 10 s of game time: still "${await g((i) => __game.creatures[i].state, i)}"`);
          };
          // The two actions of each kind, pictured - in the sizes whose pictures are looked at (a phone held upright and the
          // computer); the taps below are played in every size. Each action is brought on by the lever (until: the state
          // it waits for is hurried in), and the picture is taken a moment of game time into it.
          const PICTURES = ['mobile-portrait', 'desktop'].includes(mode);
          for (const [k, acts] of PICTURES ? Object.entries(ACTS) : []) {
            const i = kinds.indexOf(k);
            await frame(i, DIST[k]);
            for (const a of acts) {
              await until(i, [a], `the ${k} never started to ${a}`);
              await gameWait(0.3);
              await shot(`creature-${k}-${a}`);
            }
          }
          // a tap on one of each kind. A moving creature caught by its place on the screen is a matter of luck on the slow
          // CI runner, so the walkthrough sets the scene itself: the creature is held still in its calm action at a known
          // point (the world's debug holdCreature) - a fairy and a bird in the open before the heroine's spawn, a fish where
          // it swims in the pond, at the point of its circle that faces the spawn - the camera looks at it, and the game's frames bring it into the middle of the window.
          // Then one real tap on the screen, counted by the creature's own counter of taps; its reaction is its usual one.
          const reactions = {};
          const spawn = await g(() => { __game.teleport(0, 14); const p = __game.hero.root.position; return [p.x, p.y, p.z]; });
          const HOLD = { fairy: [0, 1.2, -4], bird: [1.5, 1.4, -5] };
          for (const k of Object.keys(ACTS)) {
            const i = kinds.indexOf(k);
            // the fish: on its own circle in the pond (its centre found from its angle and radius), at the point that faces
            // the spawn - the heroine then stands between the spawn and the fish, and the camera looks straight at it
            if (k === 'fish') await until(i, ['swim'], 'the fish never swam again');     // on its circle, not mid-leap
            const at = k === 'fish' ? await g((i) => {
              const c = __game.creatures[i], cx = c.pos.x - Math.cos(c.a) * c.r, cz = c.pos.z - Math.sin(c.a) * c.r;
              const a = Math.atan2(14 - cz, 0 - cx);
              return [cx + Math.cos(a) * c.r, c.pos.y, cz + Math.sin(a) * c.r];
            }, i) : HOLD[k].map((d, j) => spawn[j] + d);
            await g(([i, at]) => __game.holdCreature(i, at), [i, at]);
            await frame(i, DIST[k]);
            // The point tapped is the middle of the drawn creature - what a child taps, and what the game measures a tap from.
            const where = () => g((i) => {
              const c = __game.creatures[i], hp = __game.hero.root.position;
              const s = new __game.THREE.Vector3(c.pos.x, c.pos.y + __game.creatureBody(i), c.pos.z).project(__game.camera);
              const x = (s.x * 0.5 + 0.5) * innerWidth, y = (-s.y * 0.5 + 0.5) * innerHeight;
              const under = s.z < 1 ? document.elementFromPoint(x, y) : null;
              return { x, y, middle: s.z < 1 && Math.abs(s.x) < 0.6 && Math.abs(s.y) < 0.6, under: under ? under.id || under.localName : 'nothing', taps: c.taps, state: c.state, hero: [hp.x, hp.z] };
            }, i);
            // the camera comes to it with a lag: first it comes to rest (it stops moving between two looks), then the creature
            // must be in the middle of the window - both by the game's clock. A camera still on its way moved the creature
            // away from the point read for the tap (a tap missed at the window's edge on the phone in landscape).
            await g(() => { window.__camPrev = null; });
            if (!(await gameUntil(() => {
              const p = __game.camera.position.toArray(), w = window.__camPrev;
              window.__camPrev = p;
              return !!w && Math.hypot(p[0] - w[0], p[1] - w[1], p[2] - w[2]) < 1e-3;
            }, null, 10))) fail(`the camera did not come to rest on the ${k} in 10 s of game time`);
            if (!(await gameUntil((i) => {
              const c = __game.creatures[i];
              const s = new __game.THREE.Vector3(c.pos.x, c.pos.y + __game.creatureBody(i), c.pos.z).project(__game.camera);
              return s.z < 1 && Math.abs(s.x) < 0.6 && Math.abs(s.y) < 0.6;
            }, i, 5))) {
              const w = await where();
              fail(`the ${k} held at ${at.map((v) => v.toFixed(1)).join(',')} is not in the middle of the window after 5 s of game time: it is at ${Math.round(w.x)},${Math.round(w.y)} of ${page.viewportSize().width}x${page.viewportSize().height}`);
            }
            const before = await saved();
            const tap0 = await where();
            const taps0 = tap0.taps;
            if (tap0.state !== CALM[k]) fail(`the ${k} is held in "${tap0.state}", not "${CALM[k]}"`);
            if (tap0.under !== 'c') fail(`the ${k} cannot be tapped at ${Math.round(tap0.x)},${Math.round(tap0.y)}: there is "${tap0.under}"`);
            await (touch ? page.touchscreen.tap(tap0.x, tap0.y) : page.mouse.click(tap0.x, tap0.y));
            await page.waitForFunction(([i, n]) => __game.creatures[i].taps > n, [i, taps0], { timeout: T(10000) }) /* clock: input-event */
              .catch(() => fail(`a tap on the ${k} at ${Math.round(tap0.x)},${Math.round(tap0.y)} was not taken`));
            if (await g(([i, n]) => __game.creatures[i].taps !== n + 1, [i, taps0])) fail(`one tap on the ${k} counted more than once`);
            const state = await g((i) => __game.creatures[i].state, i);
            if (ACTS[k].includes(state)) fail(`a tap on the ${k} gave no reaction: it goes on to "${state}"`);
            reactions[k] = state;
            if (PICTURES) await shot(`creature-${k}-tapped`);
            await gameWait(0.2);   // a tap she took as a walk would have moved her by now
            const moved = await g(([x, z]) => Math.hypot(__game.hero.root.position.x - x, __game.hero.root.position.z - z), tap0.hero);
            if (moved > 0.2) fail(`the heroine walked ${moved.toFixed(2)} m after a tap on the ${k}`);
            const after = await saved();
            if (after !== before) fail(`a tap on the ${k} changed the save (no rewards): ${before} -> ${after}`);
            await g((i) => __game.holdCreature(i, null), i);
          }
          if (new Set(Object.values(reactions)).size !== 3) fail(`the three reactions are not different: ${JSON.stringify(reactions)}`);
          await g(([x, z]) => { __game.cam.focus = null; __game.closeup(null); __game.teleport(x, z); }, back);
          console.log(`creatures: ${PICTURES ? `${Object.entries(ACTS).map(([k, a]) => `${k} ${a.join('/')}`).join(', ')} pictured` : 'no pictures in this size'}; taps (each held still, one tap): ${Object.entries(reactions).map(([k, r]) => `${k} -> ${r}`).join(', ')}; nothing recorded`);
        });
      }
      // ---- the magic of the world (WORLD-09): the shards in the save decide it (also those given in this walkthrough);
      // one point of the tour pictured with no magic and with all of it - the two pictures differ above the threshold
      // (over the whole picture and over its sky), more than two pictures of the same magic do; the same in the page loaded again ----
      if (has('magic')) {
        const fail = (what) => { throw new Error(`the magic: ${what}`); };
        const shards = await g(() => __game.npcs.filter((c) => (__game.save.worlds.fairy.quests[c.def.id] ?? 0) >= c.def.steps.length).length);
        const want = Math.min(1, shards * MAGIC_SHARD);
        // the shown magic follows the save: given shards raise it while the world is played, no reload needed
        if (Math.abs((await g(() => __game.magic.target)) - want) > 1e-9) fail(`${shards} shards given back: the magic heads for ${await g(() => __game.magic.target)}, expected ${want}`);
        if (!(await magicSettles(want))) fail(`${shards} shards given back: magic ${JSON.stringify(await g(() => ({ value: __game.magic.value, target: __game.magic.target })))} after ${MAGIC_SETTLE} s of game time, expected ${want}`);
        // the pictures: the camera held on a point of the tour, the magic set by the debug command
        const pts = await g(() => __game.flyoverPoints.map((p) => p.t));
        await g(() => __game.flyover());
        // the camera is set on the point at once (hold): flying there in game time would take minutes of the clock on the
        // slow CI runner
        await gameFor(() => __game.flyoverPlayer.active, null, 30)
          .catch(() => fail('the debug tour did not start'));
        await g((i) => __game.flyoverPlayer.hold(i), MAGIC_POINT);
        if (Math.abs((await g(() => __game.flyoverPlayer.elapsed)) - pts[MAGIC_POINT]) > 0.01) fail(`the camera did not stand on point ${MAGIC_POINT + 1} of the tour`);
        const frames = () => g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
        // The pictures are of the game's canvas alone: the page over it (the cat's bubble fading in, the frame counter's text)
        // is hidden while they are taken.
        const canvasOnly = (on) => g((on) => {
          const id = '__canvas-only';
          if (!on) { document.getElementById(id)?.remove(); return; }
          const st = document.createElement('style'); st.id = id;
          st.textContent = 'body * { visibility: hidden !important; transition: none !important; } #c { visibility: visible !important; }';
          document.head.append(st);
        }, on);
        const pic = async (m, n) => { await g((m) => __game.setMagic(m), m); await frames(); return (await page.screenshot(n ? { path: `${out}/${tag}-${n}.png` } : {})).toString('base64'); };
        // The three pictures are of a still world (no game time: the butterflies, the creatures, a companion, the clouds and
        // the water stand), so two pictures of the same magic differ by the magic alone - nothing that lives in the frame.
        // The camera first settles on the point in frames of its own.
        // That it holds is checked here: in it the game's time does not move while frames are drawn, and its first picture
        // is the frame of just before it (no game time also means no camera or light gone wrong).
        // The scene first comes to rest on the point: the camera stops moving (it follows the tour with a lag) - waited for
        // by the game's clock.
        // A scene of an achievement (PLAY-08) is not let in while the pictures are taken: it would take the camera.
        let pre, s0, p0, p0b, p1, s1;
        await g(() => { window.__camPrev = null; });
        await holdAchDuring(async () => {
          if (!(await gameUntil(() => {
            const p = __game.camera.position.toArray(), w = window.__camPrev;
            window.__camPrev = p;
            return !!w && Math.hypot(p[0] - w[0], p[1] - w[1], p[2] - w[2]) < 1e-3;
          }, null, 10))) fail(`the camera did not come to rest on point ${MAGIC_POINT + 1} of the tour in 10 s of game time`);
          await canvasOnly(true);
          try {
            pre = await pic(0, null);
            s0 = await g(() => { __game.still(true); return { time: __game.time, frame: __game.renderer.info.render.frame }; });
            p0 = await pic(0, 'magic-0'); p0b = await pic(0, 'magic-0-again'); p1 = await pic(1, 'magic-1');
            s1 = await g(() => ({ time: __game.time, frame: __game.renderer.info.render.frame, cam: __game.camera.position.toArray() }));
          } finally { await g(() => __game.still(false)); await canvasOnly(false); }
        });
        if (s1.time !== s0.time) fail(`the still world went on: its game time moved from ${s0.time} to ${s1.time}`);
        if (!(s1.frame - s0.frame >= 9)) fail(`the still world drew ${s1.frame - s0.frame} frames for three pictures`);
        if (!s1.cam.every(Number.isFinite)) fail(`the camera of the still world is at ${s1.cam}`);
        await g(() => { __game.setMagic(null); __game.flyoverPlayer.hold(null); __game.flyoverPlayer.skip(); });
        // mean difference of the colours (0..1) over the whole picture and over its top fifth (the sky)
        const d = await g(async ([a, b, c, e]) => {
          const px = async (b64) => {
            const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
            const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
            const cv = new OffscreenCanvas(160, Math.round((160 * bmp.height) / bmp.width)), x = cv.getContext('2d');
            x.drawImage(bmp, 0, 0, cv.width, cv.height);
            return { w: cv.width, h: cv.height, d: x.getImageData(0, 0, cv.width, cv.height).data };
          };
          const [A, B, C, E] = await Promise.all([a, b, c, e].map(px));
          const diff = (P, Q, rows) => {
            let s = 0, n = 0;
            for (let y = 0; y < rows; y++) for (let x = 0; x < P.w; x++) {
              const i = (y * P.w + x) * 4;
              s += Math.abs(P.d[i] - Q.d[i]) + Math.abs(P.d[i + 1] - Q.d[i + 1]) + Math.abs(P.d[i + 2] - Q.d[i + 2]); n += 3;
            }
            return s / n / 255;
          };
          const sky = Math.round(A.h / 5);
          return { all: diff(A, C, A.h), sky: diff(A, C, sky), same: diff(A, B, A.h), before: diff(E, A, A.h) };
        }, [p0, p0b, p1, pre]);
        if (!(d.before < MAGIC_DIFF.all)) fail(`the still world's picture differs from the frame before it by ${d.before.toFixed(4)} (the threshold ${MAGIC_DIFF.all})`);
        const said = `magic 0 vs 1 differ by ${d.all.toFixed(4)} (the sky ${d.sky.toFixed(4)}), two pictures at 0 by ${d.same.toFixed(4)}, the still frame from the one before by ${d.before.toFixed(4)}`;
        if (!(d.all > MAGIC_DIFF.all) || !(d.sky > MAGIC_DIFF.sky) || !(d.all > d.same * 3)) fail(`${said}: the threshold is ${MAGIC_DIFF.all} (the sky ${MAGIC_DIFF.sky}) and 3 times the same magic`);
        await gameFor(() => !__game.flyoverPlayer.active && !__game.busy, null, 30).catch(() => fail('the debug tour did not end'));
        // let go, the magic heads back to the save's from 1 (the last picture's): its target at once, its value on the way
        // (the whole way back takes seconds of game time - minutes of the clock on the slow CI runner)
        if (!(await gameUntil((w) => Math.abs(__game.magic.target - w) < 1e-9 && __game.magic.value < 1 - (1 - w) * 0.1, want, 2))) fail('the debug value did not let go of the magic in 2 s of game time');
        console.log(`the magic: ${shards} shards - ${want.toFixed(2)} (the page loaded again: block leave); point ${MAGIC_POINT + 1} of the tour: ${said} (${tag}-magic-0.png, ${tag}-magic-1.png)`);
      }
      if (has('finale')) {
        // replay one finished quest
        await g(() => __game.talk('fox')); await gameFor(() => !!document.querySelector('#task:not(.hidden)'), null, 20); await g(() => __game.cheat()); await controlsBack(30, 'a finished quest replayed');
        // finale
        await g(() => __game.teleport(21.2, -6.4)); await framesDrawn(3); await calm(); await shot('20-shrine');
        // The finale is broken once on purpose, right after it has taken the controls and started to merge the shards.
        // The heroine must walk again; then the finale is played for real.
        {
          const left = await breakScene('finale', act);
          if (await g(() => __game.save.worlds.fairy.final)) left.push('the crystal is restored although the scene broke');
          if (left.length) throw new Error(`the broken finale: ${left.join('; ')}`);
          if (!(await walks())) throw new Error('the broken finale: the heroine does not walk');
          console.log('broken finale: reported, the controls are back, the heroine walks');
        }
        await g(() => __game.teleport(21.2, -6.4)); await framesDrawn(3);
        if (touch) await press('#btnAct'); else await page.keyboard.press('KeyE');
        await gameSeconds(0.5); await shot('21-finale');   // a moment into the finale
        await fanfareCard(20, 'the finale'); await calm(); await shot('22-final-card');
        const freeSaid = await g(() => window.__starts.free ?? 0);
        await page.click('#fanfareOk');
        // the cut-scene of the return of the crystal (WORLD-13): after the finale's last words, before "walk around"
        await gameFor(() => __game.story?.active && __game.story.id === 'story_crystal', null, 20)
          .catch(() => storyFail('no return of the crystal after the finale'));
        if ((await g(() => window.__starts.free ?? 0)) > freeSaid) storyFail('"free" was said before the return of the crystal');
        if (!(await g(() => __game.save.worlds.fairy.flags?.story_crystal === true))) storyFail('the return of the crystal is not marked seen');
        // the order with the achievements (PLAY-08): no scene of an achievement over the cut-scene - a stop point after it
        // brings first_artifact
        if (await g(() => __game.ach.scene !== null || !document.querySelector('#fanfare').classList.contains('hidden'))) storyFail('a card or an achievement\'s scene lies over the return of the crystal');
        if (has('story')) {
          const shown = await storyFrames('story_crystal');
          console.log(`the cut-scenes: the return of the crystal after the finale, all ${shown.length} frames in 2.5D by taps`);
        } else await g(() => __game.story.skip());
        await gameFor(() => !__game.story.active, null, 10).catch(() => storyFail('the return of the crystal did not end'));
        // The first time she goes to the Great Tree (WORLD-01, R12, R29; src/worlds/fairy/tree-way.ts): no "walk around" -
        // the end of the finale is a stop point (PLAY-08), the scene of the artifact restored comes right here, then the
        // hub by itself. Waited for by the game - its scene on screen, or the point over -, not the clock.
        {
          const over0 = await g(() => (__game.ach.over.finale ?? 0));
          if (!(await gameUntil((n) => __game.ach.scene !== null || (__game.ach.over.finale ?? 0) > n, over0, 30))) {
            throw new Error('after the finale: its stop point did not come (in 30 s of game time)');
          }
          await fanfareUp('the end of the finale');
          if (!(await gameUntil((n) => (__game.ach.over.finale ?? 0) > n, over0, 10))) throw new Error('after the finale: its stop point is not over');
          if (!achSeen.includes('first_artifact')) errors.push(`achievements: ${mode}: the scene of first_artifact did not come right after the finale (shown so far: ${achSeen.join(', ') || 'none'})`);
        }
        {
          const fail = (what) => { throw new Error(`after the finale, the way to the Great Tree: ${what}`); };
          if (!(await gameUntil(() => __game.world === 'hub' && !__game.transitioning, null, 60))) fail('she is not taken to the hub (in 60 s of game time)');
          if ((await g(() => window.__starts.free ?? 0)) > freeSaid) fail('"free" was said, though she goes to the hub');
          // the hub's tour on the first entry, ended by a tap as a player ends it
          if (await gameUntil(() => __game.flyoverPlayer?.active === true, null, 10)) await g(() => __game.flyoverPlayer.skip());
          else fail('no tour of the hub on its first entry');
          if (!(await gameUntil(() => !__game.busy, null, 20))) fail('the heroine is not given back after the tour of the hub');
          // she appears at the arch of the fairies, 4 m into the glade (src/worlds/hub/layout.ts arrivalAt(0): 0, 8.5)
          const at = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
          if (Math.hypot(at[0] - 0, at[1] - 8.5) > 1.5) fail(`she appears at ${at.map((v) => v.toFixed(1))}, not at the arch of the fairies (0, 8.5)`);
          const nests = await g(() => __game.hub.nests());
          if (JSON.stringify(nests) !== JSON.stringify([true, false, false, false, false])) fail(`the nests ${JSON.stringify(nests)}: the crystal's alone should glow`);
          await shot('23-hub');
          // back through the arch of the fairies: out of the arch to the tree, facing the valley (tree-way.ts FROM_HUB: 0, 18.5)
          if ((await g(() => __game.travel('fairy'))) !== true) fail('the way back to the Fairy Kingdom was refused');
          if (!(await gameUntil(() => __game.world === 'fairy' && !__game.transitioning && !__game.busy, null, 60))) fail('she is not back in the Fairy Kingdom');
          const back = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
          if (Math.hypot(back[0] - 0, back[1] - 18.5) > 1.5) fail(`back from the hub at ${back.map((v) => v.toFixed(1))}, not in front of the arch to the tree (0, 18.5)`);
          console.log('after the finale: the stop point, then the hub by itself (its tour, she at the arch of the fairies, the nest of the crystal glows), and back out of the arch to the tree');
          await shot('23-restored');
        }
      }
      // ---- the crystal restored brings the magic to 1 (WORLD-09), the rainbow with it ----
      if (has('magic-crystal')) {
        const state = () => g(() => ({ value: __game.magic.value, target: __game.magic.target, final: __game.save.worlds.fairy.final }));
        // the target at once (the save says the crystal is whole), the shown value by the game's clock
        await gameFor(() => __game.save.worlds.fairy.final === true, null, 60)
          .catch(async () => { throw new Error(`the magic: the crystal is not restored in the save: ${JSON.stringify(await state())}`); });
        if ((await g(() => __game.magic.target)) !== 1) throw new Error(`the magic: the crystal is restored, the magic heads for ${JSON.stringify(await state())}, not 1`);
        if (!(await magicSettles(1))) throw new Error(`the magic: the crystal is restored, the magic is ${JSON.stringify(await state())} after ${MAGIC_SETTLE} s of game time, not 1`);
        console.log('the magic: the crystal restored brings it to 1');
      }
      // ---- the profile in the book (PLAY-07, PLAY-09, R08-R17, R20): the heroine close up, the magic shelf of five places
      // against the save (the artifact of a world is on it exactly when worlds.<id>.final; the rest are silhouettes), the
      // secrets of the world, the twelve achievements (a silhouette exactly when not in save.achievements), the pets and
      // their choice (save.pet, stored at once). Every tab is pictured: the layout check measures the buttons (44 px) and
      // that nothing scrolls. `want`: how many places of the shelf must stand lit. Waits are by event only (R49).
      const checkProfile = async (when, want) => {
        const fail = (what) => { throw new Error(`profile (${when}): ${what}`); };
        const until = (fn, arg, what, ms = 15000) => gameFor(fn, arg, ms / 1000).catch(() => fail(what));
        const tap = (sel) => tapOn(sel).catch((e) => fail(`${sel} cannot be pressed: ${why(e)}`));
        await until(() => !document.querySelector('#book').classList.contains('hidden') && document.querySelectorAll('#shelf .place').length === 5, null, 'the book shows no shelf of five places');
        await until(() => __game.cam.dist < 4, null, 'the camera does not come close to the heroine', 20000);
        // every button of the book inside the window (a point off screen cannot be tapped)
        const out = await g(() => [...document.querySelectorAll('#book button')].filter((b) => b.offsetParent !== null).map((b) => {
          const r = b.getBoundingClientRect();
          return r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight ? `${b.id || b.dataset.tab || b.dataset.place || b.className} ${Math.round(r.left)},${Math.round(r.top)}` : null;
        }).filter(Boolean));
        if (out.length) fail(`outside the window: ${out.join('; ')}`);
        const read = () => g(() => {
          const s = __game.save, places = [...document.querySelectorAll('#shelf .place')];
          return {
            places: places.map((e) => ({ world: e.dataset.world ?? null, state: e.dataset.state, sil: e.classList.contains('sil') })),
            finals: Object.fromEntries(Object.entries(s.worlds).map(([id, w]) => [id, w?.final === true])),
            ach: [...document.querySelectorAll('#achs .ach')].map((e) => ({ id: e.dataset.id, got: e.classList.contains('got'), sil: e.classList.contains('sil') })),
            earned: Object.keys(s.achievements),
            secrets: [...document.querySelectorAll('#secrets .secret')].map((e) => ({ k: e.dataset.flag, got: e.classList.contains('got') })),
            flags: { ...(s.worlds.fairy?.flags ?? {}) },
          };
        });
        const b = await read(), left = [];
        b.places.forEach((p, i) => {
          const back = p.world !== null && b.finals[p.world] === true;
          if (back !== (p.state === 'found') || back === p.sil) left.push(`place ${i + 1} (${p.world ?? 'no world yet'}): ${p.state}, the save says ${back ? 'restored' : 'not restored'}`);
        });
        const lit = b.places.filter((p) => p.state === 'found').length;
        if (lit !== want) left.push(`${lit} places lit, not ${want}`);
        if (b.ach.length !== 12) left.push(`${b.ach.length} achievements, not 12`);
        for (const a of b.ach) if (a.got !== b.earned.includes(a.id) || a.got === a.sil) left.push(`the achievement ${a.id}: ${a.got ? 'shown received' : 'a silhouette'}, the save ${b.earned.includes(a.id) ? 'has' : 'has not'} it`);
        for (const x of b.secrets) if (x.got !== (b.flags[x.k] === true)) left.push(`the secret ${x.k}: ${x.got ? 'found' : 'a silhouette'}, the flag is ${b.flags[x.k]}`);
        if (left.length) fail(left.join('; '));
        await shot(`30-book-${when}`);
        for (const tb of ['secrets', 'pets', 'ach']) {
          await tap(`#bookTabs [data-tab=${tb}]`);
          await until((id) => !document.querySelector(`#book${{ secrets: 'Secrets', pets: 'Pets', ach: 'Ach' }[id]}`).classList.contains('hidden'), tb, `the tab ${tb} does not open`);
          await shot(`30-book-${when}-${tb}`);
        }
        // the choice of a pet (R20): a pet is marked found for the check (the block does not walk to the fawn), chosen by a tap -
        // save.pet and the stored save -, then left at home again and the mark taken back
        await g(() => { __game.save.worlds.fairy.flags.pet = true; });
        await tap('#bookTabs [data-tab=pets]');
        await until(() => !!document.querySelector('#pets [data-pet=fawn]:not(.sil)'), null, 'a found pet is still a silhouette');
        await tap('#pets [data-pet=fawn]');
        await until(() => __game.save.pet === 'fawn' && JSON.parse(localStorage.getItem('amw-save') || '{}').pet === 'fawn'
          && document.querySelector('#pets [data-pet=fawn]').classList.contains('sel'), null, `a tap on the pet did not choose it: save.pet ${await g(() => __game.save.pet)}`);
        await tap('#pets [data-pet=none]');
        await until(() => __game.save.pet === null && JSON.parse(localStorage.getItem('amw-save') || '{}').pet === null, null, '"no pet" did not leave it at home');
        await g(() => { delete __game.save.worlds.fairy.flags.pet; });
        await tap('#bookTabs [data-tab=shelf]');
        console.log(`profile (${when}): ${lit} of 5 places lit, ${b.ach.filter((a) => a.got).length} of 12 achievements, ${b.secrets.filter((x) => x.got).length} of ${b.secrets.length} secrets, the pet chosen and left home`);
      };
      // collection + parents
      if (has('book')) {
        const firstBook = await g(() => !__game.save.shelfSeen);
        await page.click('#btnBook'); await calm(); await shot('30-book'); await checkLinks('collection book');
        // the first opening of the shelf: the cat's line, a subtitle only (shelf_first is not recorded yet)
        if (firstBook && !(await g(() => !document.querySelector('#bookSay').classList.contains('quiet') && document.querySelector('#bookSayText').textContent.length > 0))) errors.push(`book: ${mode}: no line of the cat at the first opening of the shelf`);
        // The book shows what the world gives it: one shard per friend, lit for every friend done, the stars of the save
        // and whether the chest was opened.
        {
          const b = await g(() => {
            const s = __game.save, w = s.worlds.fairy, shards = [...document.querySelectorAll('#shards .shard')];
            return { shards: shards.length, got: shards.filter((e) => e.classList.contains('got')).length, friends: __game.npcs.length,
              done: __game.npcs.filter((c) => (w.quests[c.def.id] ?? 0) >= c.def.steps.length).length, stars: s.stars, chest: !!w.flags?.chest,
              stats: document.querySelector('#colStats')?.textContent ?? '' };
          });
          const left = [];
          if (b.shards !== b.friends) left.push(`${b.shards} shards for ${b.friends} friends`);
          if (b.got !== b.done) left.push(`${b.got} shards lit, ${b.done} friends done`);
          if (!b.stats.includes(String(b.stars))) left.push(`the stars ${b.stars} are not in "${b.stats}"`);
          if (!b.stats.includes(b.chest ? '✔' : '?')) left.push(`the chest (${b.chest ? 'open' : 'closed'}) is not in "${b.stats}"`);
          if (left.length) errors.push(`book: ${mode}: ${left.join('; ')}`);
          else console.log(`book: ${b.got} of ${b.shards} shards, ${b.stars} stars, the chest ${b.chest ? 'open' : 'closed'}`);
        }
        // after the first world (R17): its artifact on the shelf, the four other places silhouettes
        await checkProfile('world1', 1).catch((e) => errors.push(`book: ${mode}: ${e.message}`));
        // without the shop (which opens from the book) the book is closed again
        if (!listed('shop')) await closeBook().catch((e) => { throw new Error(`book: it cannot be closed: ${why(e)}`); });
      }
      // ---- the pet of the first world (PLAY-09, R18-R22): the fawn waits at its place once the deer's chain is done; the
      // action button there finds it (the world's flag `pet` and the species in save.pets, both stored at once), the book
      // chooses it (left at home, then chosen again), it walks after her, and after a reload it walks after her from the
      // first frames. Where it waits is the game's, not written here: the waiting fawn's own place, and the item `pet` of
      // the world description (__game.items).
      // Waits by the game's clock (gameUntil) or by an event only (R49). The scenes of the achievements wait for the
      // whole block (the book's close is a stop point): the walkthrough's lever, given back as it was.
      if (has('pet')) {
        const fail = (what) => { throw new Error(`pet: ${what}`); };
        const FOLLOW_M = 2;   // the pet after her: within this of the heroine (its place is 1.1 m behind her, on her left)
        const tap = (sel) => tapOn(sel).catch((e) => fail(`${sel} cannot be pressed: ${why(e)}`));
        const until = async (pred, arg, what, seconds = 8) => { if (!(await gameUntil(pred, arg, seconds))) fail(`${what} (in ${seconds} s of game time)`); };
        // the pet in the scene as the game names it (src/game/pets.ts): where it stands, does it follow, how far from her
        const petNow = `() => {
          const o = __game.scene.getObjectByName('pet:fawn'), h = __game.hero.root.position;
          return o && o.parent ? { x: o.position.x, y: o.position.y, z: o.position.z, follows: o.userData.follows === true, d: Math.hypot(o.position.x - h.x, o.position.z - h.z) } : null;
        }`;
        // the fawn walks after her, within `m` of her, and the controls are hers (it stands while a scene runs)
        const after = `(m) => { const p = (${petNow})(); return !!p && p.follows && p.d <= m && !__game.busy; }`;
        // In the whole walkthrough the block "book" leaves the book open for the shop: the pet needs the world (the book
        // pauses the game), so the book is closed for this block - its close a stop point like any - and opened again after.
        const bookOpen = await visible('#book');
        if (bookOpen) await closeBook().catch((e) => fail(`the book cannot be closed: ${why(e)}`));
        await holdAchDuring(async () => {
          const item = await g(() => __game.items?.find((i) => i.kind === 'pet') ?? null);
          if (item?.done === true || await g(() => __game.save.worlds.fairy.flags.pet === true)) fail('the pet is found before the block (the flag "pet" of the world is set)');
          // waiting at its place (the deer's chain is done in this piece), not following
          const w = await g(`(${petNow})()`);
          if (!w || w.follows) fail(`no fawn waits in the world after the deer's chain: ${JSON.stringify(w)}`);
          const at = { x: w.x, z: w.z };
          if (item && (!item.at || Math.hypot(item.at.x - at.x, item.at.z - at.z) > 0.01)) fail(`the fawn waits at ${at.x}, ${at.z}, the world description puts it at ${JSON.stringify(item.at)}`);
          // 1.7 m south-west of it (with the camera turn 0 "forward" is -z): the fawn stands before her on the right,
          // not hidden behind her; the deer (its own spot "talk") is more than 5 m away
          await g((p) => { __game.teleport(p.x - 1.2, p.z + 1.2); __game.cam.yaw = 0; }, at);
          await until(() => !document.querySelector('#btnAct').classList.contains('hidden'), null, 'no action button beside the fawn');
          const label = await page.textContent('#btnAct');
          // on screen: its point inside the window (R49), once the camera has come after her (the game's clock)
          const onScreen = (p) => {
            const v = new __game.THREE.Vector3(p.x, p.y + 0.4, p.z).project(__game.camera);
            const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
            return v.z < 1 && x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight;
          };
          if (!(await gameUntil(onScreen, w, 4))) {
            const s = await g((p) => { const v = new __game.THREE.Vector3(p.x, p.y + 0.4, p.z).project(__game.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, z: v.z, w: innerWidth, h: innerHeight }; }, w);
            fail(`the waiting fawn is outside the window after 4 s of game time: ${JSON.stringify(s)}`);
          }
          await shot('pet-waiting');
          await act();
          await until(() => __game.save.worlds.fairy.flags.pet === true && (__game.save.pets ?? []).includes('fawn'), null, 'the action button did not find the fawn: no flag "pet" or no "fawn" in save.pets');
          const stored = await g(() => { const s = JSON.parse(localStorage.getItem('amw-save') || '{}'); return { flag: s.worlds?.fairy?.flags?.pet, pets: s.pets }; });
          if (stored.flag !== true || !stored.pets?.includes('fawn')) fail(`the find is not stored: ${JSON.stringify(stored)}`);
          if (item && !(await g(() => __game.items?.find((i) => i.kind === 'pet')?.done))) fail('the item "pet" of the world description is not done after the find');
          // the first pet found is chosen by itself and walks after her at once
          await until(after, FOLLOW_M, 'the fawn found does not walk after her');
          // the book: the fawn found (no silhouette) and chosen; "no pet" leaves it at home, a tap on it chooses it again
          await tap('#btnBook');
          await tap('#bookTabs [data-tab=pets]');
          await until(() => !!document.querySelector('#pets [data-pet=fawn].sel:not(.sil)'), null, 'the book does not show the fawn found and chosen');
          await tap('#pets [data-pet=none]');
          await until(() => __game.save.pet === null && JSON.parse(localStorage.getItem('amw-save') || '{}').pet === null && !__game.scene.getObjectByName('pet:fawn')?.parent,
            null, '"no pet" did not leave the fawn at home');
          await tap('#pets [data-pet=fawn]');
          await until(() => __game.save.pet === 'fawn' && JSON.parse(localStorage.getItem('amw-save') || '{}').pet === 'fawn'
            && document.querySelector('#pets [data-pet=fawn]').classList.contains('sel'), null, 'a tap on the fawn in the book did not choose it');
          await tap('#bookTabs [data-tab=shelf]');
          await closeBook().catch((e) => fail(`the book cannot be closed: ${why(e)}`));
          // after her: she walks off, the fawn comes after
          if (!(await walks())) fail('the heroine does not walk after the book');
          await until(after, FOLLOW_M, 'the fawn chosen does not walk after her');
          await shot('pet');
          // the cost of the fawn in the frame (TECH-06): its own triangles, and the counter with it beside her
          const cost = await g(() => {
            let tris = 0, meshes = 0;
            __game.scene.getObjectByName('pet:fawn').traverse((o) => {
              if (!o.isMesh) return;
              meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
            });
            return { tris: Math.round(tris), meshes, counter: document.querySelector('#fps')?.textContent ?? '' };
          });
          console.log(`pet: the fawn draws ${cost.tris} triangles in ${cost.meshes} meshes; the counter beside it: ${cost.counter}`);
          // The budget (TECH-06, R21): with the fawn beside her the counter stays within the heaviest point measured for
          // TECH-06 at that level - docs/perf.md, «Замер на компьютере», the mushroom king: q1 1024k triangles / 428 calls,
          // q2 1115k / 500 (the S22 holds 60 frames there); q0 is held to q1's. Frames per second are not judged: the
          // runner draws by program.
          const PET_BUDGET = { q0: [1024, 428], q1: [1024, 428], q2: [1115, 500] };
          const m = /· (q[0-2]) · (\d+)k tris · (\d+) calls/.exec(cost.counter);
          if (!m) fail(`the counter beside the fawn cannot be read: "${cost.counter}"`);
          const [maxTris, maxCalls] = PET_BUDGET[m[1]];
          if (+m[2] > maxTris || +m[3] > maxCalls) fail(`over the budget of TECH-06 with the fawn (${m[1]}): ${m[2]}k triangles of ${maxTris}k, ${m[3]} calls of ${maxCalls}`);
          // The paws of the pet (src/game/stride.ts), in the sizes of a phone only (the desktop runner draws ≈ 3 frames a
          // second: the runs took minutes there; the code of the pace is the same in every size): twice she runs two
          // seconds of game time, there and back, and stops; every frame the way the pet's clip takes a standing paw back (its pace times the clip's speed over the
          // ground, measured by tools/feet.mjs: Walk 0.24, Gallop 1.04 m/s) is set against the way the pet went. What is
          // not covered slides. Read from the pace, not from the paws: a slow machine draws fewer frames than a paw
          // stands. Measured 2026-11-18 (the block "finale"): 0.91 of its way with the pace by the distance (the walk
          // only), 0.081 with the pace by its speed and the gallop, 0.053 drawn by program. 2026-11-19: the gallop is held
          // to a pace of 2.1 (PET_RUN_MAX: its legs whirred at 5.2), so at the top speed its paws slide 0.6 of the way;
          // the bound is 0.6 of it.
          const PET_SLIDE = 0.6, PET_GROUND = { Walk: 0.24, Gallop: 1.04 };
          if (mode === 'mobile' || mode === 'mobile-portrait') {
          await g(() => {
            const log = window.__paceLog = [];
            const tick = () => {
              const p = __game.pet;
              if (p) { const a = p.actions.get(p.current); log.push({ t: __game.time, x: p.root.position.x, z: p.root.position.z, clip: p.current, pace: a ? a.timeScale : 0 }); }
              if (!window.__paceStop) requestAnimationFrame(tick);
            };
            window.__paceStop = false; requestAnimationFrame(tick);
          });
          for (const key of ['ArrowUp', 'ArrowDown']) {
            await page.keyboard.down(key); await gameUntil(() => false, null, 2); await page.keyboard.up(key);
            await gameUntil(() => false, null, 1.5);
          }
          const paws = await g((ground) => {
            window.__paceStop = true;
            const log = window.__paceLog;
            let way = 0, slid = 0, frames = 0;
            for (let i = 1; i < log.length; i++) {
              const a = log[i - 1], b = log[i], dt = b.t - a.t;
              if (dt <= 0 || !(b.clip in ground)) continue;
              const went = Math.hypot(b.x - a.x, b.z - a.z);
              if (went / dt < 0.3) continue;   // starting or stopping: the clip fades
              way += went; slid += Math.abs(went - b.pace * ground[b.clip] * dt); frames++;
            }
            return { share: +(slid / Math.max(1e-9, way)).toFixed(3), frames, clips: [...new Set(log.map((f) => f.clip))].join(' ') };
          }, PET_GROUND);
          console.log(`pet: its paws slide ${paws.share} of its way (${paws.frames} frames moving; clips ${paws.clips}; at most ${PET_SLIDE})`);
          if (paws.frames < 20) fail(`the paws of the pet: too few frames moving to judge (${paws.frames})`);
          if (paws.share > PET_SLIDE) fail(`the paws of the pet slide ${paws.share} of its way, more than ${PET_SLIDE}`);
          }
          // ---- a reload: the page loaded again (a second tab of the same address and storage, as the block "magic" does:
          // a reload of this one would drop the watchers of the walkthrough) plays from the save, the fawn after her ----
          const p2 = await page.context().newPage();
          try {
            const until2 = async (pred, arg, what, seconds = 10) => {
              const t0 = await p2.evaluate(() => __game.time);
              const h = await p2.waitForFunction(`(${pred})(${JSON.stringify(arg)}) ? 'yes' : __game.time - ${t0} > ${seconds} ? 'no' : false`,
                null, { timeout: T(600000) /* clock: ceiling */ });
              if ((await h.jsonValue()) !== 'yes') fail(`after the reload: ${what} (in ${seconds} s of game time)`);
            };
            await p2.goto(page.url());
            await p2.waitForSelector('#play', { state: 'visible', timeout: T(90000) /* clock: page-load */ });
            await p2.waitForFunction(() => !!window.__game?.ach, null, { timeout: T(30000) /* clock: page-load */ }).catch(() => fail('no __game in the page loaded again'));
            // the scenes of its "play" would hold her (and the fawn stands while one runs): they wait there too
            await p2.evaluate(() => __game.ach.hold());
            await p2.click('#play');
            await until2(after, FOLLOW_M, 'the fawn does not walk after her');
            // she is put 5 m east: the fawn comes after her
            const from = await p2.evaluate(() => { const h = __game.hero.root.position; __game.teleport(h.x + 5, h.z); return __game.scene.getObjectByName('pet:fawn').position.x; });
            await until2(`(a) => (${after})(a[0]) && __game.scene.getObjectByName('pet:fawn').position.x - a[1] > 3`, [FOLLOW_M, from], 'the fawn does not come after her when she has gone 5 m');
            const r = await p2.evaluate(`(${petNow})()`);
            console.log(`pet: "${label}" at ${at.x}, ${at.z} found the fawn (flag "pet", save.pets), chosen in the book; after the reload it walks after her (${r.d.toFixed(2)} m)`);
          } finally { await p2.close().catch(() => {}); }
        });
        if (bookOpen) {
          await tap('#btnBook');
          if (!(await gameUntil(() => !document.querySelector('#book').classList.contains('hidden'), null, 5))) fail('the book does not open again after the block');
        }
      }
      // ---- the shop and the fitting room (PLAY-04, PLAY-05): a screen of the book, opened in the middle of the game ----
      // A tap on a thing puts it on at once; one tried on and not bought comes off when the screen closes; a thing she
      // cannot afford has "N ⭐ more" (no red) and buys nothing; a purchase takes exactly the price (the watch of the
      // stars is told of it beforehand) and is stored at once with every other choice; after the reload below she wears
      // what was bought and chosen.
      let shopped = null;
      if (has('shop')) {
        const fail = (what) => { throw new Error(`shop: ${what}`); };
        const stored = () => g(() => JSON.parse(localStorage.getItem('amw-save') || '{}'));
        const tap = (sel) => tapOn(sel).catch((e) => fail(`${sel} cannot be pressed: ${why(e)}`));
        const tab = async (id) => { await tap(`#shopTabs [data-tab=${id}]`); await calm(); };
        const state = () => g(() => ({ stars: __game.save.stars, owned: [...__game.save.owned], gear: { ...__game.save.gear },
          worn: Object.fromEntries(['head', 'wand', 'wings', 'trail'].map((k) => [k, __game.gear.get(k)])),
          hair: __game.save.hair, wingColor: __game.save.wingColor, tint: __game.gear.color, hud: document.querySelector('#stars').textContent }));
        const reddish = () => g(() => {
          const e = document.querySelector('#shopBuy'), cs = getComputedStyle(e);
          return [cs.color, cs.backgroundColor, cs.backgroundImage].join(' ').match(/rgba?\([^)]*\)/g)?.map((c) => c.match(/[\d.]+/g).map(Number))
            .filter(([r, gr, b, a = 1]) => a > 0.1 && r > 180 && gr < 120 && b < 120).length ?? 0;
        });
        await tap('#btnShop'); await calm();
        if (!(await visible('#shop'))) fail('the button of the book does not open it');
        if (await visible('#book')) fail('the book is still open over the heroine');
        await gameFor(() => __game.cam.dist < 4, null, 20).catch(() => fail('the camera does not come close to the heroine'));
        const start = await state();
        if (start.stars < 10) fail(`the walkthrough reaches the shop with ${start.stars} stars: nothing to buy`);
        if (!touch) {
          // the game stands while the screen is open
          const p0 = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
          await page.keyboard.down('KeyW'); await gameSeconds(0.2); await page.keyboard.up('KeyW');
          const p1 = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
          if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.05) fail('the heroine walks while the shop is open');
        }
        await shot('shop-dress'); await checkLinks('shop');
        // 1. tried on, closed without buying: it comes off, nothing is spent or stored
        await tab('head');
        const tryId = await g(() => ['wreath', 'crown', 'wizard_hat'].find((id) => !__game.save.owned.includes(id)));
        if (!tryId) fail('every hat is bought already');
        await tap(`#shopItems [data-id=${tryId}]`); await calm();
        let s1 = await state();
        if (s1.worn.head !== tryId) fail(`a tap on ${tryId} did not put it on (she wears ${s1.worn.head})`);
        if (s1.gear.head !== start.gear.head || (await stored()).gear?.head !== start.gear.head) fail(`trying ${tryId} on reached the save`);
        await shot('shop-try');
        await tap('#shopDone'); await calm();
        if (await visible('#shop')) fail('"done" does not close it');
        s1 = await state();
        if (s1.worn.head !== start.gear.head) fail(`closed without buying, she still wears ${s1.worn.head} (the save holds ${start.gear.head})`);
        if (s1.stars !== start.stars || s1.owned.length !== start.owned.length) fail('trying on spent stars or bought something');
        await page.click('#btnBook'); await calm(); await tap('#btnShop'); await calm();
        // 2. bought: exactly the price, worn, stored at once, the counter of the HUD follows; the watch of the stars is
        // told of the purchase just before the tap, so that any other drop stays an error
        const buyOne = async (slot, id, price) => {
          await tab(slot);
          await tap(`#shopItems [data-id=${id}]`); await calm();
          const before = await state();
          const label = await page.textContent('#shopBuy').catch(() => '');
          if (!label.includes(`${price} ⭐`) || (await g(() => document.querySelector('#shopBuy').classList.contains('short')))) fail(`the button under ${id} (${price} ⭐) with ${before.stars} stars: "${label}"`);
          await g((it) => { window.__stars.buy = it; }, { id, price });
          await tap('#shopBuy'); await calm();
          const s = await state(), st = await stored();
          if (s.stars !== before.stars - price || !s.owned.includes(id)) fail(`buying ${id}: ${before.stars} -> ${s.stars} stars, purchases ${s.owned.join(', ')}`);
          if (s.gear[slot] !== id || s.worn[slot] !== id) fail(`${id} is bought but not worn (save ${s.gear[slot]}, on her ${s.worn[slot]})`);
          if (st.stars !== s.stars || st.gear?.[slot] !== id || !st.owned?.includes(id)) fail(`the purchase of ${id} was not stored at once`);
          if (s.hud !== String(s.stars)) fail(`the counter shows ${s.hud} after the purchase, the save ${s.stars}`);
          // The watch reads the stars on animation frames; a slow runner (CI: 2-20 frames a second) may not have drawn one
          // since the tap, so wait for it to take the announced purchase instead of reading it at once.
          await gameFor(() => !window.__stars.buy, null, 10)
            .catch(() => fail(`the watch of the stars did not see the purchase of ${id}`));
          return s;
        };
        const s3 = await buyOne('wand', 'wand_star', 10);
        await shot('shop-bought');
        // the hat as well while the sparkles (40) are still affordable: a thing she cannot buy yet must be met below
        let head = start.gear.head;
        if (s3.stars >= 40 && !s3.owned.includes('wizard_hat')) { await buyOne('head', 'wizard_hat', 30); head = 'wizard_hat'; }
        // 3. a thing she cannot buy yet: seen, tried on, "N ⭐ more", no red, a tap on it buys nothing
        let shortChecked = false;
        await tab('trail');
        const s2a = await state();
        if (s2a.stars < 40) {
          await tap('#shopItems [data-id=trail_sparkle]'); await calm();
          const b = await g(() => { const e = document.querySelector('#shopBuy'); return e && { text: e.textContent, short: e.classList.contains('short') }; });
          const need = 40 - s2a.stars;
          if (!b) fail('no button under a thing she cannot buy yet');
          if (!b.short || !b.text.includes(`${need} ⭐`) || b.text.includes('40')) fail(`the button of the sparkles with ${s2a.stars} of 40 stars: "${b.text}" (short ${b.short}), not "${need} ⭐ more"`);
          if (await reddish()) fail(`the button "${b.text}" is red`);
          if ((await state()).worn.trail !== 'trail_sparkle') fail('a thing she cannot buy yet is not tried on');
          await shot('shop-short');
          await tap('#shopBuy'); await calm();
          const s2 = await state();
          if (s2.stars !== s2a.stars || s2.owned.includes('trail_sparkle')) fail(`the button "${b.text}" bought the sparkles: ${s2a.stars} -> ${s2.stars} stars`);
          shortChecked = true;
        } else errors.push(`shop: ${mode}: ${s2a.stars} stars after the purchases, the sparkles (40) are affordable: "N ⭐ more" went unchecked`);
        // 4. free: another hair colour, another colour of the wings, then no wings - each stored at once
        await tab('hair');
        const hair = await g(() => [...document.querySelectorAll('#shopItems .swatches button')].map((b) => b.dataset.color).find((c) => c !== __game.save.hair));
        await tap(`#shopItems .swatches button[data-color="${hair}"]`); await calm();
        if ((await stored()).hair !== hair) fail(`the hair ${hair} was not stored at once`);
        await tab('wings');
        const wingColor = await g(() => [...document.querySelectorAll('#shopItems .swatches button')].map((b) => b.dataset.color).find((c) => c !== __game.save.wingColor));
        await tap(`#shopItems .swatches button[data-color="${wingColor}"]`); await calm();
        {
          const w = await g(() => ({ tint: __game.gear.color, petal: __game.hero.root.children.find((o) => o.isMesh && o.material.transparent)?.material.color.getHexString(__game.THREE.SRGBColorSpace) }));
          if (w.tint !== wingColor || `#${w.petal}` !== wingColor) fail(`the wings ${wingColor}: the gear has ${w.tint}, the petals #${w.petal}`);
        }
        await shot('shop-wings');
        await tap('#shopItems [data-id=none]'); await calm();
        const s4 = await state(), st4 = await stored();
        if (s4.hair !== hair || s4.wingColor !== wingColor || s4.gear.wings !== null || s4.worn.wings !== null) fail(`the choice: hair ${s4.hair}, wings ${s4.gear.wings} (on her ${s4.worn.wings}) of colour ${s4.wingColor}`);
        if (st4.hair !== hair || st4.wingColor !== wingColor || st4.gear?.wings !== null) fail('the choice of the wings was not stored at once');
        await tap('#shopDone'); await calm();
        const s5 = await state();
        if (s5.worn.wand !== 'wand_star' || s5.worn.wings !== null || s5.worn.trail !== start.gear.trail || s5.worn.head !== head) fail(`after "done" she wears wand ${s5.worn.wand}, wings ${s5.worn.wings}, trail ${s5.worn.trail}, head ${s5.worn.head}`);
        shopped = { wand: 'wand_star', head, wings: null, hair, wingColor };
        console.log(`shop: tried ${tryId} on and took it off, ${shortChecked ? 'the sparkles showed "N ⭐ more" and bought nothing, ' : ''}bought the star wand ${start.stars} -> ${s3.stars} stars${head === 'wizard_hat' ? ' and the hat' : ''}, hair ${hair}, wings ${wingColor} then none`);
      }
      // ---- the potions and the compass (decision of 2026-11-19, src/game/supplies.ts, src/game/supplyfx.ts) ----
      // Bought on the tab of the potions (each purchase one more in the stock, the watch of the stars told of it), drunk
      // from the row of their buttons by one tap: the speed and the jump over the tuning, the glow's halo, the funny
      // potion's size and camera; the time stands while the game stands (the shop open); the save keeps the seconds;
      // the effect ends and all is as before. The compass in a world without mysterious stars is dimmed and not spent.
      if (has('potions')) {
        const fail = (what) => { throw new Error(`potions: ${what}`); };
        const tap = (sel) => tapOn(sel).catch((e) => fail(`${sel} cannot be pressed: ${why(e)}`));
        const st = () => g(() => ({ stars: __game.save.stars, supplies: { ...(__game.save.supplies ?? {}) }, effects: { ...(__game.save.effects ?? {}) },
          speed: __game.tuning.speed, jump: __game.tuning.jump, camDist: __game.tuning.camDist, scale: __game.hero.root.scale.x,
          halo: __game.hero.root.getObjectByName('glow halo')?.visible ?? null,
          row: [...document.querySelectorAll('#supplies .sup')].map((b) => `${b.dataset.id}${b.classList.contains('dim') ? ' dim' : ''}`),
          rowShown: !document.querySelector('#supplies')?.classList.contains('hidden') }));
        // the stars for the purchases: won stars are stored at once (the watch of the stars reads both in the same frame)
        await g(() => { __game.save.stars += 160; localStorage.setItem('amw-save', JSON.stringify(__game.save)); });
        await calm();
        const base = await st();
        await page.click('#btnBook'); await calm(); await tap('#btnShop'); await calm();
        await tap('#shopTabs [data-tab=potions]'); await calm();
        const buys = [['speed', 25], ['speed', 25], ['jump', 25], ['funny', 20], ['glow', 30], ['compass', 30]];
        for (const [id, price] of buys) {
          await tap(`#shopItems [data-id=${id}]`); await calm();
          const before = await st();
          const label = await page.textContent('#shopBuy').catch(() => '');
          if (!label.includes(`${price} ⭐`)) fail(`the button under ${id} (${price} ⭐) with ${before.stars} stars: "${label}"`);
          await g((it) => { window.__stars.buy = it; }, { id, price, stock: (before.supplies[id] ?? 0) + 1 });
          await tap('#shopBuy'); await calm();
          const after = await st();
          if (after.stars !== before.stars - price || after.supplies[id] !== (before.supplies[id] ?? 0) + 1) fail(`buying ${id}: ${before.stars} -> ${after.stars} stars, the stock ${before.supplies[id] ?? 0} -> ${after.supplies[id]}`);
          await gameFor(() => !window.__stars.buy, null, 10).catch(() => fail(`the watch of the stars did not see the purchase of ${id}`));
        }
        await shot('potions-shop');
        // the time stands while the shop is open: nothing acts yet, and nothing of the row is shown over the shop
        if ((await st()).rowShown) fail('the row of the potions is shown over the shop');
        await tap('#shopDone'); await calm();
        const bought = await st();
        if (!bought.rowShown || bought.row.join() !== 'speed,jump,glow,funny,compass dim') fail(`the row after the shop: shown ${bought.rowShown}, ${JSON.stringify(bought.row)}; expected speed,jump,glow,funny and a dimmed compass (no mysterious stars here)`);
        // the compass: dimmed and not spent
        await tap('#supplies [data-id=compass]'); await calm();
        if ((await st()).supplies.compass !== 1) fail('the compass was spent in a world without mysterious stars');
        // drunk by one tap each
        for (const id of ['speed', 'jump', 'glow', 'funny']) { await tap(`#supplies [data-id=${id}]`); await calm(); }
        await gameSeconds(1);
        const on = await st();
        const size = on.effects.tiny ? 0.5 : on.effects.giant ? 1.6 : null;
        if (!(on.effects.speed > 50 && on.effects.jump > 50 && on.effects.glow > 50 && size)) fail(`after drinking the effects are ${JSON.stringify(on.effects)}`);
        if (Math.abs(on.speed / base.speed - 1.5) > 0.01 || Math.abs(on.jump / base.jump - Math.SQRT2) > 0.01) fail(`the speed ${base.speed} -> ${on.speed}, the jump ${base.jump} -> ${on.jump}: expected x1.5 and x1.41`);
        if (Math.abs(on.scale - size) > 0.02 || Math.abs(on.camDist / base.camDist - (size === 0.5 ? 0.6 : 1.5)) > 0.01) fail(`her size ${on.scale} (expected ${size}), the camera ${base.camDist} -> ${on.camDist}`);
        if (on.halo !== true) fail('the glow acts and there is no halo around her');
        if (on.supplies.speed !== 1 || 'jump' in on.supplies) fail(`the stock after drinking: ${JSON.stringify(on.supplies)}`);
        await shot('potions-on');
        const kept = await g(() => JSON.parse(localStorage.getItem('amw-save') || '{}').effects ?? {});
        if (!(kept.speed > 0 && kept.glow > 0)) fail(`the seconds of the effects are not stored: ${JSON.stringify(kept)}`);
        // the time stands while the game stands: the shop open for a while
        await page.click('#btnBook'); await calm(); await tap('#btnShop'); await calm();
        const t0 = (await st()).effects.speed;
        await gameSeconds(1.5);   // the game's clock runs on while the shop holds the game
        const t1 = (await st()).effects.speed;
        await tap('#shopDone'); await calm();
        if (t1 !== t0) fail(`the time of the speed ran while the shop was open: ${t0} -> ${t1}`);
        // the end: everything as before
        await g(() => { for (const k of Object.keys(__game.save.effects)) __game.save.effects[k] = 0.2; });
        await gameSeconds(1.5);
        const off = await st();
        if (Object.keys(off.effects).length || off.speed !== base.speed || off.jump !== base.jump || off.camDist !== base.camDist || Math.abs(off.scale - 1) > 0.001 || off.halo !== false) fail(`after the end: ${JSON.stringify(off)}, before: speed ${base.speed}, jump ${base.jump}, camera ${base.camDist}`);
        console.log(`potions: bought ${buys.length} for ${base.stars - bought.stars} stars, drunk four by one tap each (speed x1.5, jump x1.41, the halo, ${size === 0.5 ? 'tiny' : 'a giant'}), the time stood while the shop was open, stored, ended as before; the compass dimmed and kept`);
      }
      // ---- the helpers of a task (decision of 2026-11-19, src/game/helpers.ts) ----
      // Bought on the tab of the potions; in a task of counting on level 2 (opened by __game.task) the owl says the
      // first rung at once - the way, no answer lit - and is spent once; the abacus lays the things out in ten frames;
      // the stock goes down, today's count of each goes up (the parents' section reads it); the result says "helped".
      if (has('helpers')) {
        const fail = (what) => { throw new Error(`helpers: ${what}`); };
        const tap = (sel) => tapOn(sel).catch((e) => fail(`${sel} cannot be pressed: ${why(e)}`));
        const st = () => g(() => ({ stars: __game.save.stars, supplies: { ...(__game.save.supplies ?? {}) }, helps: JSON.parse(JSON.stringify(__game.save.helps ?? {})) }));
        await g(() => { __game.save.stars += 35; localStorage.setItem('amw-save', JSON.stringify(__game.save)); });
        await calm();
        await page.click('#btnBook'); await calm(); await tap('#btnShop'); await calm();
        await tap('#shopTabs [data-tab=potions]'); await calm();
        for (const [id, price] of [['owl', 15], ['abacus', 20]]) {
          await tap(`#shopItems [data-id=${id}]`); await calm();
          const before = await st();
          await g((it) => { window.__stars.buy = it; }, { id, price, stock: (before.supplies[id] ?? 0) + 1 });
          await tap('#shopBuy'); await calm();
          const after = await st();
          if (after.stars !== before.stars - price || after.supplies[id] !== (before.supplies[id] ?? 0) + 1) fail(`buying ${id}: ${before.stars} -> ${after.stars} stars, the stock ${after.supplies[id]}`);
          await gameFor(() => !window.__stars.buy, null, 10).catch(() => fail(`the watch of the stars did not see the purchase of ${id}`));
        }
        await tap('#shopDone'); await calm();
        if (await g(() => !!document.querySelector('#supplies [data-id=owl], #supplies [data-id=abacus]'))) fail('a helper of a task is in the row of the potions');
        await g(() => { window.__helped = null; void __game.task('count', 2).then((r) => { window.__helped = r; }); });
        await page.locator('#taskOwl').waitFor({ timeout: 20000 }).catch(() => fail('no owl on the panel of a task'));
        if (!(await visible('#taskAbacus'))) fail('no abacus on the panel of counting on level 2');
        await tap('#taskOwl');
        await gameFor(() => document.getElementById('taskStage').dataset.shown === '1', null, 30).catch(() => fail('the owl did not give the first rung'));
        if (await g(() => !!document.querySelector('#taskStage .pulse, #taskOpts .pulse'))) fail('the owl lit the answer');
        if (await visible('#taskOwl')) fail('the owl is still on the panel after it was taken');
        await tap('#taskAbacus');
        if (!(await g(() => document.querySelectorAll('#taskStage .tens .tf').length > 0))) fail('the abacus laid out no ten frames');
        await shot('helpers-task');
        await g(() => __game.cheat());
        await gameFor(() => window.__helped !== null, null, 20).catch(() => fail('the task did not end'));
        const r = await g(() => window.__helped);
        const after = await st(), day = Object.values(after.helps).at(-1) ?? {};
        if (!(r.solved && r.helped === true)) fail(`the result of the task: ${JSON.stringify(r)}, expected solved and helped`);
        if (after.supplies.owl || after.supplies.abacus || day.owl !== 1 || day.abacus !== 1) fail(`after the task: the stock ${JSON.stringify(after.supplies)}, today's count ${JSON.stringify(day)}`);
        console.log('helpers: bought the owl (15) and the abacus (20); in counting on level 2 the owl said the first rung at once, nothing lit, the abacus laid out ten frames; both spent once, counted for the parents, the result "helped"');
      }
      // ---- the deal of the day (decision of 2026-11-20, src/game/deal.ts) ----
      // The lever let go and a day set: the book's shop button has its mark, the shop opens on the deal's tab and the
      // cat tells of it (once that day), the tile has the ribbon and the deal's price; bought at that price (the watch
      // of the stars told of it) the deal is gone for the day and the mark too; another day has a deal again; a reload
      // keeps the day's deal taken. Then the lever is pulled again for the blocks after.
      if (has('deal')) {
        const fail = (what) => { throw new Error(`deal: ${what}`); };
        const tap = (sel) => tapOn(sel).catch((e) => fail(`${sel} cannot be pressed: ${why(e)}`));
        const SUPPLY = ['speed', 'jump', 'glow', 'funny', 'compass', 'owl', 'abacus'];
        await g(() => { __game.deal.release(); __game.deal.day('2030-03-05'); __game.save.stars += 60; localStorage.setItem('amw-save', JSON.stringify(__game.save)); });
        await calm();
        const d = await g(() => __game.deal.today);
        if (!d || !(d.price < d.was)) fail(`no deal on a day with the lever let go: ${JSON.stringify(d)}`);
        await page.click('#btnBook'); await calm();
        if (!(await g(() => !!document.querySelector('#btnShop .dealmark')))) fail('no mark of the deal on the shop button');
        await tap('#btnShop'); await calm();
        await gameFor(() => document.getElementById('shopSay')?.dataset.key === 'shop_deal', null, 10).catch(() => fail('the cat did not tell of the deal'));
        const tile = await g((id) => { const e = document.querySelector(`#shopItems [data-id=${id}]`); return e && { deal: e.classList.contains('deal'), cap: e.textContent }; }, d.id);
        if (!tile?.deal || !tile.cap.includes(`${d.price} ⭐`) || !tile.cap.includes(String(d.was))) fail(`the tile of ${d.id} on the tab the shop opened on: ${JSON.stringify(tile)}, expected the ribbon, ${d.was} crossed out and ${d.price} ⭐`);
        await tap(`#shopItems [data-id=${d.id}]`); await calm();
        const label = await page.textContent('#shopBuy').catch(() => '');
        if (!label.includes(`${d.price} ⭐`)) fail(`the button under the deal says "${label}", expected ${d.price} ⭐`);
        const before = await g((id) => ({ stars: __game.save.stars, stock: __game.save.supplies?.[id] ?? 0 }), d.id);
        const supply = SUPPLY.includes(d.id);
        await g((it) => { window.__stars.buy = it; }, supply ? { id: d.id, price: d.price, stock: before.stock + 1 } : { id: d.id, price: d.price });
        await tap('#shopBuy'); await calm();
        await gameFor(() => !window.__stars.buy, null, 10).catch(() => fail(`the watch of the stars did not see the purchase of the deal ${d.id} at ${d.price}`));
        const after = await g(() => ({ stars: __game.save.stars, deal: __game.save.deal, today: __game.deal.today }));
        if (after.stars !== before.stars - d.price || after.deal?.took !== '2030-03-05' || after.today !== null) fail(`after buying the deal: ${before.stars} -> ${after.stars} stars, the save's deal ${JSON.stringify(after.deal)}, the deal now ${JSON.stringify(after.today)}`);
        await shot('deal-bought');
        await tap('#shopDone'); await calm();
        await page.click('#btnBook'); await calm();
        if (await g(() => !!document.querySelector('#btnShop .dealmark'))) fail('the mark of the deal is still on the shop button after it was taken');
        await closeBook().catch((e) => fail(`the book cannot be closed: ${why(e)}`));
        const next = await g(() => { __game.deal.day('2030-03-06'); return __game.deal.today; });
        if (!next) fail('no deal on the next day');
        await g(() => { __game.deal.day(null); __game.deal.hold(); });
        console.log(`deal: on 2030-03-05 ${d.id} ${d.was} -> ${d.price} stars, the mark, the cat, the ribbon; bought at the deal's price, gone for the day with its mark; the next day ${next.id}`);
      }
      // ---- the shop's signboard in the first world (R10, R19): walk up to it, the action button "Shop" opens the same
      // screen as the book; "done" closes it and the heroine walks again. Seen from where she starts first.
      if (has('shop-sign')) {
        const fail = (what) => { throw new Error(`shop sign: ${what}`); };
        const at = await g(() => ({ x: __game.shopSign.x, z: __game.shopSign.z }));
        await g(() => { __game.teleport(0, 14); __game.cam.yaw = 0; });
        // where she starts the sign is not in reach: no "Shop" on the action button there
        {
          const t0 = await g(() => __game.time);
          await page.waitForFunction((t) => __game.time - t >= 0.5, t0, { timeout: T(600000) /* clock: ceiling */ }).catch(() => fail('0.5 s of game time did not pass'));
        }
        if (await visible('#btnAct')) fail(`the action button is shown at the spawn: "${await page.textContent('#btnAct')}"`);
        // 2.3 m from it, south-west (with the camera turn 0 "forward" is -z): the signboard stands beside her in the frame
        await g((p) => { __game.teleport(p.x - 1.7, p.z + 1.5); __game.cam.yaw = 0; }, at);
        await gameFor(() => !document.querySelector('#btnAct').classList.contains('hidden'), null, 20)
          .catch(() => fail('no action button beside the signboard'));
        const label = await page.textContent('#btnAct');
        const want = (await page.textContent('#btnShop')).replace('🛍️', '').trim();   // the word of the book's button
        if (label !== want) fail(`the action button beside the signboard says "${label}", not "${want}"`);
        await shot('shop-sign');
        // The action button is read on the next frame of the game (a slow runner draws 2-20 a second): wait for the screen.
        await act();
        await gameFor(() => { const e = document.querySelector('#shop'); return !!e && !e.classList.contains('hidden'); }, null, 10)
          .catch(() => fail('the action button beside the signboard does not open the shop'));
        if (await visible('#book')) fail('the action button opened the book over the shop');
        await tapOn('#shopDone').catch((e) => fail(`"done" cannot be pressed: ${why(e)}`)); await calm();
        if (await visible('#shop')) fail('"done" does not close the shop opened from the signboard');
        if (!(await walks())) fail('the heroine does not walk after the shop of the signboard');
        console.log(`shop sign: "${label}" beside the signboard at ${at.x}, ${at.z} opened the shop, "done" closed it`);
      }
      // ---- the cut-scenes (WORLD-13): the book has a button for every scene seen, none for the others; it shows it again ----
      if (has('story')) {
        if (!(await visible('#book'))) { await tapOn('#btnBook').catch((e) => storyFail(`the book cannot be opened: ${why(e)}`)); await calm(); }
        const b = await g(() => ({ buttons: [...document.querySelectorAll('#book .story-again')].map((e) => e.dataset.story),
          seen: __game.story.stories.map((s) => s.id).filter((id) => __game.save.worlds.fairy.flags?.[id] === true), flags: JSON.stringify(__game.save.worlds.fairy.flags) }));
        if (JSON.stringify(b.buttons) !== JSON.stringify(b.seen)) storyFail(`the book offers ${b.buttons.join(', ') || 'no scene'}, the save has seen ${b.seen.join(', ') || 'none'}`);
        if (!b.seen.length) storyFail('the book has no scene to show again');
        await shot('30-book-stories');
        const id = b.seen[b.seen.length - 1];
        await tapOn(`#book .story-again[data-story=${id}]`).catch((e) => storyFail(`the button of "${id}" in the book cannot be pressed: ${why(e)}`));
        await gameFor((id) => __game.story.active && __game.story.id === id, id, 10).catch(() => storyFail(`the book did not show "${id}" again`));
        if (await visible('#book')) storyFail('the book stays open over the scene');
        await storyFrame(0); await shot('story-from-book');
        await tapOn('#storySkip').catch((e) => storyFail(`the skip button cannot be pressed: ${why(e)}`));
        await gameFor(() => !__game.story.active && !__game.busy, null, 10).catch(() => storyFail('the skip button did not close the scene of the book'));
        if (await g(() => JSON.stringify(__game.save.worlds.fairy.flags)) !== b.flags) storyFail('showing a scene from the book changed the flags of the save');
        if (!(await walks())) storyFail('the heroine does not walk after the scene of the book');
        console.log(`the cut-scenes: the book offers ${b.buttons.join(', ')}; "${id}" shown again from it and skipped, nothing recorded`);
      }
      if (has('parents')) {
        await page.click('#btnBook'); await calm();
        // The same "random" number at both openings of the gate: only the memory of the example asked last time can make
        // the second one different.
        await g(() => { window.__random = Math.random; Math.random = () => 0.42; });
        await page.click('#btnParents'); await calm(); await shot('31-gate');
        // ---- the gate (PLAY-14): the example is read from the screen; only its whole right answer opens the section ----
        {
          const fail = (what) => { throw new Error(`the gate of the parents' section: ${what}`); };
          const read = async () => {
            const text = await page.textContent('#gateQ');
            const m = /(\d+) × (\d+)/.exec(text);
            if (!m) fail(`no multiplication in the question "${text}"`);
            const [a, b] = [Number(m[1]), Number(m[2])];
            if (![a, b].every((n) => n >= 6 && n <= 9)) fail(`the question "${text}" is not about two numbers from 6 to 9`);
            return { text, answer: a * b };
          };
          const open = () => g(() => !document.querySelector('#pBody').classList.contains('hidden') || document.querySelector('#gate').classList.contains('hidden'));
          const first = await read();
          // typed the way a parent does, key by key: the first digit alone and a wrong number open nothing
          for (const typed of [String(first.answer)[0], String(first.answer + 1), '']) {
            await page.fill('#gateA', ''); if (typed) await page.type('#gateA', typed); await calm();
            if (await open()) fail(`"${typed}" opened the section, the question was "${first.text}"`);
          }
          await page.type('#gateA', String(first.answer)); await calm();
          if (!(await open())) fail(`the right answer ${first.answer} did not open the section, the question was "${first.text}"`);
          await shot('31-parents'); await checkLinks('parents section');
          // ---- the version (TECH-10): the day of the build and the commit number the game was built from ----
          const ver = await g(() => {
            const e = document.querySelector('#pVersion'), r = e?.getBoundingClientRect();
            return e ? { text: e.textContent, built: document.querySelector('#pBuilt')?.textContent, commit: document.querySelector('#pCommit')?.textContent,
              seen: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight } : null;
          });
          if (!ver) throw new Error('version: the parents\' section shows no version line');
          if (!ver.seen) errors.push(`version: ${mode}: the version line "${ver.text}" is not inside the window`);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(ver.built ?? '')) errors.push(`version: the day of the build is "${ver.built}", not YYYY-MM-DD`);
          if (!/^([0-9a-f]{4,40}|no-git)$/.test(ver.commit ?? '')) errors.push(`version: the commit number is "${ver.commit}"`);
          if (commit && ver.commit !== commit) errors.push(`version: the parents' section shows commit "${ver.commit}", but the sources are at "${commit}" (git rev-parse --short HEAD): the build is not of this commit`);
          console.log(`version: "${ver.text}"${commit ? `, the commit is that of the sources (${commit})` : ', E2E_COMMIT is not set: the commit was not compared'}`);
          // the five hardest examples (PLAY-15, LEARN-11): those of the save, the most mistakes first (of two alike the one given
          // last), written in numbers; none - the line that says so
          {
            const { list, text } = await g(() => ({ list: __game.save.hard.list.map((h) => ({ ...h })),
              text: document.querySelector('#pHard')?.textContent ?? null }));
            const inNumbers = (k) => k.replace(/^\w+:/, '').replace(/([+=-])/g, ' $1 ').replace(/-/g, '−').replace(/\s+/g, ' ').trim();
            const want = [...list].sort((x, y) => y.e - x.e || y.at - x.at).slice(0, 5).map((h) => inNumbers(h.k));
            const shown = text === null ? null : text.split('·').slice(1).map((s) => s.trim()).filter(Boolean);
            if (shown === null) errors.push('hard examples: the parents\' section has no #pHard');
            // none yet: one line of words (p_hard_none), no example in numbers
            else if (!want.length ? shown.length !== 1 || /\d/.test(shown[0]) : shown.join(' | ') !== want.join(' | '))
              errors.push(`hard examples: the parents' section shows "${shown.join(' | ')}", the save's five hardest are "${want.join(' | ') || 'none'}"`);
            else console.log(`hard examples: ${want.length ? want.join(' · ') : 'none yet'} (of ${list.length} kept)`);
          }
          // the voice slider shows what this walkthrough plays with
          const slider = await g(() => Number(document.querySelector('#pBody [data-v=voice]')?.value));
          if (mute ? slider !== 0 : !(slider > 0)) errors.push(`the voice slider of the parents' section is at ${slider} in a walkthrough ${mute ? 'without' : 'with'} the voice`);
          // the quality button (TECH-04): automatic -> high -> medium -> plain -> automatic; a pinned tier applies at once
          {
            const steps = [];
            for (let i = 0; i < 4; i++) {
              await page.click('#pQuality'); await calm();
              const pin = await g(() => __game.save.pinTier);
              let shown = '';
              if (pin !== null && !process.env.Q) {
                await gameFor((t) => (document.querySelector('#fps')?.textContent ?? '').includes(` q${t} `), pin, 5)
                  .catch(async () => errors.push(`quality: the parent pinned q${pin}, but the counter shows "${await g(() => document.querySelector('#fps')?.textContent)}"`));
                shown = ` (counter q${pin})`;
              }
              steps.push(`${pin === null ? 'auto' : `q${pin}`}${shown}`);
            }
            if (steps.map((x) => x.split(' ')[0]).join(' ') !== 'q2 q1 q0 auto') errors.push(`quality: the button steps through ${steps.join(' -> ')}, not q2 -> q1 -> q0 -> auto`);
            console.log(`quality button: ${steps.join(' -> ')}`);
          }
          // ---- the controls (PLAY-22): "fast" and "further" apply at once, are written, and a page opened anew has them ----
          {
            const near = (a, b) => Math.abs(a - b) < 1e-9;
            const want = { speed: 5.4 * 1.3, runFrom: 1.3 * 1.3, camDist: 6.2 * 1.25 };
            const read = (pg) => pg.evaluate(() => ({ t: { ...__game.tuning }, c: __game.save.controls ?? null,
              stored: JSON.parse(localStorage.getItem('amw-save') || '{}').controls ?? null }));
            const off = (t, w) => Object.entries(w).filter(([k, v]) => !near(t[k], v)).map(([k, v]) => `${k} ${t[k]} (not ${+v.toFixed(4)})`);
            await page.locator('.pctlbtn:visible').first().click(); await calm();
            await shot('31-controls');
            await page.click('[data-ctl=speed][data-step=more]'); await calm();
            await page.click('[data-ctl=cam][data-step=more]'); await calm();
            const now = await read(page);
            const sel = await g(() => [...document.querySelectorAll('[data-ctl].sel')].map((b) => `${b.dataset.ctl}:${b.dataset.step}`).join(' '));
            if (off(now.t, want).length) errors.push(`controls: "fast" and "further" did not apply at once: ${off(now.t, want).join(', ')}`);
            if (JSON.stringify(now.stored) !== JSON.stringify({ speed: 'more', cam: 'more' })) errors.push(`controls: the stored save has ${JSON.stringify(now.stored)}, not speed and camera "more"`);
            if (sel !== 'speed:more cam:more joy:normal look:normal') errors.push(`controls: the buttons chosen are "${sel}"`);
            // a page of the game opened anew reads the choice from the save before anything uses it
            const again = await ctx.newPage();
            try {
              again.on('pageerror', (e) => errors.push(`controls, the page opened anew: pageerror: ${e.message}`));
              await again.goto(url + '?debug' + (process.env.Q ? `&q=${process.env.Q}` : ''));
              await again.waitForFunction(() => !!window.__game?.tuning, null, { timeout: T(90000) }); /* clock: page-load */
              const r = await read(again);
              if (off(r.t, want).length) errors.push(`controls: a page opened anew does not have them: ${off(r.t, want).join(', ')}`);
              else console.log(`controls: "fast" and "further" applied at once and in a page opened anew (speed ${+r.t.speed.toFixed(2)}, run from ${+r.t.runFrom.toFixed(2)}, camera ${+r.t.camDist.toFixed(2)})`);
            } finally { await again.close(); }
            // back to "normal": the game's own numbers, nothing stored
            await page.click('[data-ctl=speed][data-step=normal]'); await calm();
            await page.click('[data-ctl=cam][data-step=normal]'); await calm();
            const back = await read(page);
            if (off(back.t, { speed: 5.4, runFrom: 1.3, camDist: 6.2 }).length) errors.push(`controls: "normal" did not bring the numbers back: ${off(back.t, { speed: 5.4, runFrom: 1.3, camDist: 6.2 }).join(', ')}`);
            if (back.stored && Object.keys(back.stored).length) errors.push(`controls: after "normal" the save still has ${JSON.stringify(back.stored)}`);
            await page.click('#pCtlBack'); await calm();
          }
          // closed and opened again: another example, and the section is shut until it is answered
          await page.click('#parentsClose'); await page.click('#btnBook'); await calm(); await page.click('#btnParents'); await calm();
          if (await open()) fail('opened for the second time, the section is not shut');
          const second = await read();
          if (second.answer === first.answer) fail(`two openings in a row asked the same example: "${first.text}" and "${second.text}"`);
          await page.type('#gateA', String(first.answer)); await calm();
          if (await open()) fail(`the answer of the previous example (${first.answer}) opened the section, the question was "${second.text}"`);
          console.log(`the gate: "${first.text}" was opened by ${first.answer} only; the next opening asked "${second.text}"`);
        }
        await g(() => { Math.random = window.__random; });
        await page.click('#parentsClose');
      }
      const s = await g(() => __game.save);
      console.log('task types seen:', [...seen].join(' '));
      console.log('deliberate mistakes:', [...mistakes].join(' '));
      // Every task type that has a hint must have been failed three times (one check per rung), or the hints went unchecked.
      const unchecked = [...seen].filter((t) => !mistakes.has(t) && t !== 'pairs' && t !== 'stars');
      if (unchecked.length) errors.push(`no deliberate mistake was made in: ${unchecked.join(', ')}`);
      if (plays('unicorn')) {       // the butterflies are the unicorn's
        if (bfVisits < 3) errors.push(`the butterflies task was met ${bfVisits} times: closing it and coming back went unchecked`);
        else if (!cutOff) errors.push('no line was sounding when the butterflies task was closed: stopping the voice went unchecked');
      }
      if (plays('deer') && !searchAfter) errors.push('the skills were not compared around the star search');
      // Every task solved in a talk is counted in its skill (recordTask, src/game/skills.ts): at least one task for
      // each step of the chains done, but the star search's and the parts found in the world (src/worlds/fairy/parts.ts:
      // walking up to a shard trains no skill).
      {
        const recorded = Object.values(s.skills).reduce((n, v) => n + v.tasks, 0);
        const steps = Object.values(s.worlds.fairy.quests).reduce((n, v) => n + v, 0);
        const parts = ['part_fox', 'part_mushking'].filter((f) => s.worlds.fairy.flags?.[f]).length;
        if (recorded < steps - 1 - parts) errors.push(`skills: ${recorded} tasks counted in the skills for ${steps} steps of the chains done (${parts} of them parts found in the world)`);
        else console.log(`skills: ${recorded} tasks counted for ${steps} steps of the chains`);
      }
      if (listed('cat') && !catRepeated) errors.push('repeating a line by a tap on the cat went unchecked');
      if (plays('deer') && !hurried) errors.push('the talk right after the fifth star went unchecked');
      if (plays('deer') && !fifthHeard) errors.push('fifth star: the number of the fifth star in silence went unchecked');
      if (plays('deer') && !searchResumed) errors.push('star search after a closed task: went unchecked');
      if (shardTalks && !onward) errors.push('the cat\'s "go on" after a shard went unchecked');
      if (shardTalks && !onwardLate) errors.push('the cat\'s "go on" after the thanks of a shard went unchecked');
      console.log('final:', s.worlds.fairy.final, 'quests:', JSON.stringify(s.worlds.fairy.quests), 'stars:', s.stars);
      {
        const frames = await starsKept('by the end of the world');
        if (!frames) errors.push(`stars: ${mode}: the watch of the stars saw no frame`);
        console.log(`stars: watched on ${frames} frames, ${starDrops ? `went down ${starDrops} times` : 'never went down'}`);
      }
      console.log('skills:', Object.entries(s.skills).map(([k, v]) => `${k} L${v.level} ${v.first}/${v.tasks}`).join(' | '));
      // Every line of the world is recorded: a line left to the device's synthesizer means a missing or broken clip.
      const voice = await g(() => ({ clips: __game.voice.clips, synth: [...new Set(__game.voice.synth)], dropped: [...__game.dropped] }));
      console.log(`voice: ${voice.clips} clips sounded, lines left to the synthesizer: ${voice.synth.length ? voice.synth.join(' ') : 'none'}`);
      voiceUsed = await checkVoice('at the end');
      await checkBank();
      console.log(`voice volume: ${mute ? 'off' : 'on'} - ${voiceUsed.clips} clips started, ${voiceUsed.loud} of them with a volume above zero`);
      if (plays('deer') && !starsCounted) errors.push('the bubble of the star search was not looked at after a star was found');
      if (plays('deer') && !deerAsked) errors.push('talk to the deer during the search: it was never played');
      if (plays('deer') && !shardSearched) errors.push('a shard during the search: it was never played');
      // The planner of spoken lines turns away only what this scenario provokes: "back to the deer" in the talk right
      // after the fifth star, and the cat's "go on" after a shard when the next conversation has already begun.
      const turned = {};
      for (const id of voice.dropped) turned[id] = (turned[id] ?? 0) + 1;
      console.log(`lines turned away by the planner: ${Object.entries(turned).map(([id, n]) => `${id} x${n}`).join(' ') || 'none'}`);
      const lost = Object.keys(turned).filter((id) => id !== 'go_next' && id !== 't_stars_back');
      if (lost.length) errors.push(`the planner turned away lines the scenario gives no reason for: ${lost.join(' ')}`);
      if (voice.synth.length) errors.push(`no recorded clip for: ${voice.synth.join(' ')} (python3 tools/gen_voice.py)`);
      if (!voice.clips) errors.push('not a single voice clip sounded during the walkthrough');
      // With ?debug the counter shows what docs/perf.md tells the parent to read on the phone.
      const counter = await page.textContent('#fps').catch(() => null);
      console.log('fps:', counter);
      if (!/^\d+ fps · q[0-2] · \d+k tris · \d+ calls$/.test(counter ?? '')) errors.push(`with ?debug the frame counter does not show the frames: "${counter}"`);
      // ---- the achievements (PLAY-08, R03, R06, R43): the set the piece earned, and a scene at the stop point of the book ----
      // The scenes come at the stop points as in the game; the blocks above closed them on their way (`fanfareUp`,
      // "achievement shown: <id>"). Here: whatever the piece earned has either been shown or waits in the queue - that
      // set is the piece's own (`ach` of tools/e2e-saves.mjs); with something waiting, the closed book (a stop point)
      // shows the first of it, one scene and one only.
      if (has('achievements')) {
        const fail = (what) => { throw new Error(`achievements: ${what}`); };
        // The piece's own set, and the achievements whose counters depend on how the tasks happened to go (ten in a row at
        // the first try, fifty tasks, days played): expected exactly when the save's own counters say they are earned. The
        // numbers are those of the card PLAY-08 (docs/12-gameplay.md), written here, not taken from the game's code. Only the
        // pieces whose tasks go by chance (finale, shop, the whole walk) are given them: world1 and world2 make a mistake at
        // the first meeting of every kind, so their sets stay fixed - a counter that counted wrong turns them red.
        const CHANCE = !group || only === 'finale' || only === 'shop';
        const by = !CHANCE ? {} : await g(() => {
          const s = __game.save, solved = Object.values(s.skills).reduce((n, k) => n + (k.tasks || 0), 0);
          return { clean_ten: (s.clean?.best ?? 0) >= 10, fifty_tasks: solved >= 50, days_3: (s.days?.n ?? 0) >= 3, days_5: (s.days?.n ?? 0) >= 5 };
        });
        const want = [...new Set([...(group ? group.ach : ACH_WHOLE), ...Object.keys(by).filter((k) => by[k])])].sort();
        achWant = want;
        // a scene of the point before (the closed book of the block "book") may still be on: it is closed first
        for (;;) {
          await gameFor(() => __game.ach.scene !== null
            || (!__game.busy && !__game.inTask && document.querySelector('#fanfare').classList.contains('hidden')), null, 30)
            .catch(() => fail('the game did not come to rest before the block'));
          if (!(await g(() => __game.ach.scene))) break;
          await endAchievement('before the block "achievements"');
        }
        const left = [];
        const before = await g(() => ({ held: __game.ach.held, queue: __game.ach.queue, shown: __game.ach.shown }));
        if (before.held) left.push('the scenes are still held: a block above did not release them');
        if (before.queue.length) {
          await tapOn('#btnBook').catch((e) => fail(`the book cannot be opened: ${why(e)}`));
          await tapOn('#bookClose').catch((e) => fail(`the book cannot be closed: ${why(e)}`));
          await gameFor(() => __game.ach.scene !== null, null, 20).catch(() => fail('no scene at the stop point of the closed book'));
          const id = await endAchievement('the closed book');
          await gameFor(() => !__game.busy, null, 15).catch(() => fail('the scene at the closed book did not give the controls back'));
          const after = await g(() => ({ queue: __game.ach.queue, shown: __game.ach.shown, scene: __game.ach.scene }));
          if (id !== before.queue[0]) left.push(`the closed book showed "${id}", not the first of the queue "${before.queue[0]}"`);
          if (after.shown !== before.shown + 1 || after.scene) left.push(`the closed book showed ${after.shown - before.shown} scenes, not one`);
          if (after.queue.length !== before.queue.length - 1) left.push(`the queue went from ${before.queue.length} to ${after.queue.length}, not one less`);
        } else console.log('achievements: nothing waits in the queue, the closed book is not tried');
        const now = await g(() => ({ queue: __game.ach.queue, earned: Object.keys(__game.save.achievements).sort(), times: __game.save.achievements,
          stored: Object.keys(JSON.parse(localStorage.getItem('amw-save') || '{}').achievements ?? {}).sort() }));
        // R06: the scenes shown and those still waiting are the piece's set
        const got = [...new Set([...achSeen, ...now.queue])].sort();
        const missing = want.filter((id) => !got.includes(id)), extra = got.filter((id) => !want.includes(id));
        if (missing.length || extra.length) {
          left.push(`shown ${achSeen.join(', ') || 'none'}, waiting ${now.queue.join(', ') || 'none'}; expected ${want.join(', ')}`
            + (missing.length ? `; missing ${missing.join(', ')}` : '') + (extra.length ? `; not expected ${extra.join(', ')}` : ''));
        }
        const twice = achSeen.filter((id, i) => achSeen.indexOf(id) !== i);
        if (twice.length) left.push(`scenes shown twice: ${twice.join(', ')}`);
        if (now.earned.join() !== want.join()) left.push(`earned ${now.earned.join(', ') || 'none'}; expected ${want.join(', ')}`);
        if (now.stored.join() !== now.earned.join()) left.push('the achievements are not stored as earned');
        // From no save the first task's praise is a stop point of its own, before the card of the first part.
        if (!only || only === 'world1') {
          if (!(now.times.first_task < now.times.first_shard)) left.push(`"first_task" (${now.times.first_task}) did not come before "first_shard" (${now.times.first_shard}): no stop point after the praise`);
        }
        // on open ground (the block before may leave her against a character), as the block "leave" puts her
        await g(() => __game.teleport(2.5, 12.5));
        if (!(await walks())) left.push('the heroine does not walk after the scene');
        if (!achPictured) left.push('no scene came in this run: the card of an achievement was not measured');
        if (left.length) errors.push(`achievements: ${mode}: ${left.join('; ')}`);
        else console.log(`achievements: ${want.join(', ')}; shown ${achSeen.join(', ')}; ${now.queue.length} wait in the queue${now.queue.length ? ` (${now.queue.join(', ')})` : ''}`);
      }
      // ---- the cat's offer of a break (PLAY-20, R31-R36): at a stop point after a task, once the session has its minutes ----
      // The minutes come by the debug door (the save as it is: the parent's 10 minutes, the session at them), the point by
      // __game.ach.stop('task'); the achievements' scenes are held for the block. "Play on": one tap, the card goes, the cat
      // answers in the bubble, nothing is taken, the quiet is stored. Then a second offer at the end of the quiet - another
      // line of the cat - and "till tomorrow": the save written at once, the start screen with the cat asleep, and the point
      // waits for "Continue"; one tap of it and the game goes on. Every card and button is checked inside the window.
      if (has('break')) {
        const fail = (what) => { throw new Error(`break: ${what}`); };
        const left = [];
        const tap = (sel) => tapOn(sel).catch((e) => fail(`${sel} cannot be pressed: ${why(e)}`));
        const inWindow = (sels) => g((ss) => ss.filter((s) => {
          const e = document.querySelector(s), r = e?.getBoundingClientRect();
          return !e || e.classList.contains('hidden') || !(r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight);
        }), sels);
        const cardShown = () => !document.querySelector('#breakCard').classList.contains('hidden');
        // a point now, at the minute of the break: the subscriber of the stop points shows the card (not awaited: it waits for a tap)
        const offer = async (min) => {
          const before = await g(() => __game.ach.over.task ?? 0);
          await g((m) => { __game.save.breakMin = 10; __game.save.session.min = m; void __game.ach.stop('task'); }, min);
          await gameFor(cardShown, null, 10).catch(() => fail(`no card at the stop point after a task, the session at ${min} min of 10`));
          return before;
        };
        await holdAchDuring(async () => {
          await gameFor(() => !__game.busy && !__game.inTask && document.querySelector('#fanfare').classList.contains('hidden'), null, 30)
            .catch(() => fail('the game did not come to rest before the block'));
          const s0 = await g(() => ({ stars: __game.save.stars, min: __game.save.session?.min ?? null }));
          if (s0.min === null) fail('the save has no session after minutes of play');
          // what a slow machine meets (2026-11-19, the runner): the real minutes pass the break while the lever is pulled
          // and a point comes - no card then, and no offer kept for after the lever (it came at the block's first point)
          await g(() => { __game.save.breakMin = 20; __game.save.session.min = 25; });
          await within('a stop point past the minutes with the lever pulled', g(() => __game.ach.stop('task')), T(60000)) /* clock: input-event */
            .catch(async (e) => fail(`${e.message} - ${await screenState()}`));
          if (await g(cardShown)) left.push('a card came while the lever of the break was pulled');
          await g(() => __game.brk.release());   // the walkthrough's lever of the break, pulled from its first page on
          // before its minutes, no card
          await g(() => { __game.save.breakMin = 30; __game.save.session.min = 1; });
          const over0 = await g(() => __game.ach.over.task ?? 0);
          await within('a stop point before the minutes of the break', g(() => __game.ach.stop('task')), T(60000)) /* clock: input-event */
            .catch(async (e) => fail(`${e.message} (it waits for something: a card?) - ${await screenState()}`));
          if (await g(cardShown)) left.push('a card came before the minutes of the break');
          console.log(`break: before the minutes - ${await screenState()}`);
          if ((await g(() => __game.ach.over.task ?? 0)) !== over0 + 1) left.push('the point before the minutes did not end at once');
          // ---- "play on" ----
          const before1 = await offer(10);
          const first = await g(() => document.querySelector('#breakSay').textContent);
          await shot('41-break');
          const out1 = await inWindow(['#breakCard .card', '#breakYes', '#breakNo', '#breakSay']);
          if (out1.length) left.push(`${mode}: not inside the window: ${out1.join(', ')}`);
          if (!first) left.push('the card has no line of the cat');
          console.log(`break: the card of "play on" - ${await screenState()}`);
          await tap('#breakNo'); await calm();
          await gameFor((n) => (__game.ach.over.task ?? 0) === n + 1, before1, 10).catch(() => left.push('"play on" did not end the stop point'));
          const s1 = await g(() => ({ card: !document.querySelector('#breakCard').classList.contains('hidden'), bubble: document.querySelector('#bubble').classList.contains('hidden') ? '' : document.querySelector('#bubbleText').textContent,
            quiet: __game.save.session.quiet, min: __game.save.session.min, stars: __game.save.stars, start: !document.querySelector('#start').classList.contains('hidden') }));
          if (s1.card) left.push('"play on" did not close the card');
          if (s1.start) left.push('"play on" showed the start screen');
          // the answer is a spoken line now (its clip, then its subtitle in the bubble): waited for by the game, not at once
          if (!s1.bubble && !(await gameUntil(() => ['break_more_1', 'break_more_2', 'break_more_3'].includes(__game.line), null, 5))) left.push('the cat did not answer "play on" (no line break_more_* said)');
          if (!(s1.quiet >= s1.min + 9.9)) left.push(`after "play on" the quiet is ${s1.quiet}, not 10 minutes after ${s1.min}`);
          if (s1.stars !== s0.stars) left.push(`"play on" took stars: ${s0.stars} -> ${s1.stars}`);
          if (!(await walks())) left.push('the heroine does not walk after "play on"');
          // in the quiet, no card
          await g(() => { __game.save.session.min = __game.save.session.quiet - 1; });
          await within('a stop point in the quiet after "play on"', g(() => __game.ach.stop('task')), T(60000)) /* clock: input-event */
            .catch(async (e) => fail(`${e.message} (it waits for something: a card?) - ${await screenState()}`));
          if (await g(cardShown)) left.push('a card came in the quiet after "play on"');
          console.log(`break: in the quiet - ${await screenState()}`);
          // ---- "till tomorrow" ----
          const before2 = await offer(s1.quiet + 0.5);
          const second = await g(() => document.querySelector('#breakSay').textContent);
          if (second === first) left.push(`the cat said the same offer twice in a row: "${first}"`);
          console.log(`break: the card of "till tomorrow" - ${await screenState()}`);
          await tap('#breakYes');
          await gameFor(() => !document.querySelector('#start').classList.contains('hidden') && !document.querySelector('#sleep').classList.contains('hidden'), null, 10)
            .catch(() => fail('"till tomorrow" did not show the start screen with the sleeping cat'));
          await calm();
          const s2 = await g(() => ({ stored: JSON.parse(localStorage.getItem('amw-save') || '{}').session ?? null, quiet: __game.save.session.quiet,
            hud: !document.querySelector('#hud').classList.contains('hidden'), setup: !document.querySelector('#setup').classList.contains('hidden'),
            say: document.querySelector('#sleepSay').textContent, wake: document.querySelector('#wake').textContent, over: __game.ach.over.task ?? 0 }));
          await shot('41-sleep');
          const out2 = await inWindow(['#sleep', '#wake', '#sleepSay']);
          if (out2.length) left.push(`${mode}: not inside the window on the start screen: ${out2.join(', ')}`);
          if (!s2.stored || s2.stored.quiet !== s2.quiet) left.push(`"till tomorrow" did not write the save at once (stored ${JSON.stringify(s2.stored)}, the quiet ${s2.quiet})`);
          if (s2.hud || s2.setup) left.push('the start screen of the sleeping cat shows the game\'s buttons or the setup');
          if (!s2.say || !s2.wake) left.push('the sleeping cat has no line or no "Continue"');
          if (s2.over !== before2) left.push('the stop point ended before "Continue": what comes after it would come under the sleeping cat');
          console.log(`break: the sleeping cat - ${await screenState()}`);
          await tap('#wake'); await calm();
          console.log(`break: after "Continue" - ${await screenState()}`);
          await gameFor((n) => (__game.ach.over.task ?? 0) === n + 1, before2, 10).catch(() => left.push('"Continue" did not end the stop point'));
          const s3 = await g(() => ({ start: !document.querySelector('#start').classList.contains('hidden'), hud: !document.querySelector('#hud').classList.contains('hidden'), stars: __game.save.stars }));
          if (s3.start || !s3.hud) left.push('"Continue" did not bring the game back with one tap');
          if (s3.stars !== s0.stars) left.push(`the break took stars: ${s0.stars} -> ${s3.stars}`);
          if (!(await walks())) left.push('the heroine does not walk after "Continue"');
          // the parent's choice and the minutes as the walk found them (the quiet stays: no offer in the blocks after this one)
          await g((m) => { delete __game.save.breakMin; __game.save.session.min = m; __game.brk.hold(); }, s0.min);
        });
        if (left.length) errors.push(`break: ${mode}: ${left.join('; ')}`);
        else console.log('break: the card at the point, "play on" in one tap, the quiet, another line, "till tomorrow" saved, the sleeping cat, "Continue" in one tap');
      }
      // ---- the cat's meeting on a new day (PLAY-21, R37, R40, R44, R61) ----
      // A tap on the cat with the bubble empty: "where we stopped", the line of the state of the world (the save of the
      // piece: the friends done, the crystal restored or not). Then the walkthrough's lever of the gift is let go and the
      // date of the last gift put on a day long past (a fixed one, never "yesterday" by the real clock): after a reload
      // "play" brings a hello, one star by the game's own adding, the line of the gift and its caption, every line with
      // its clip. A second launch the same day: the old welcome back, no star. The lever is pulled again for what follows.
      if (has('welcome')) {
        const fail = (what) => { throw new Error(`welcome: ${what}`); };
        const left = [];
        const HELLOS = ['hello_1', 'hello_2', 'hello_3', 'hello_4', 'hello_5'], GIFTS = ['gift_star_1', 'gift_star_2'];
        const LEFTS = ['left_new_world', 'left_mid_chain', 'left_between', 'left_before_final', 'left_after_artifact'];
        // what the state of the world asks for (e4-texts.md §3), from the save of the page
        const wantLeft = () => g(() => {
          const w = __game.save.worlds.fairy, at = __game.npcs.map((c) => [w.quests[c.def.id] ?? 0, c.def.steps.length]), n = __game.npcs.length;
          if (w.final) return 'left_after_artifact';
          if (at.filter(([v, len]) => v >= len).length >= n) return 'left_before_final';
          if (at.some(([v, len]) => v > 0 && v < len)) return 'left_mid_chain';
          return at.some(([v, len]) => v >= len) ? 'left_between' : 'left_new_world';
        });
        const rest = () => gameFor(() => !__game.busy && !__game.inTask && !__game.speaking && __game.ach.scene === null
          && document.querySelector('#fanfare').classList.contains('hidden'), null, 30).catch(() => fail('the game did not come to rest'));
        // "play" on the start screen of a reload, the achievements' scenes of its stop point held (the page's own lever is new)
        const replay = async () => {
          await page.reload(); await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
          await g(() => __game.ach.hold());
          const s = await g(() => ({ held: __game.gift.held, stars: __game.save.stars, gift: __game.save.gift ?? null }));
          // the caption of the gift is caught the moment it shows (an event: on a slow machine it can be gone before a look
          // from here) - its text and whether it is inside the window then
          await g(() => {
            window.__giftShown = null;
            const look = () => {
              const c = document.getElementById('giftCaption');
              if (window.__giftShown || !c || c.classList.contains('hidden')) return;
              const r = c.getBoundingClientRect();
              window.__giftShown = { text: c.textContent, inside: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
            };
            new MutationObserver(look).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
          });
          await page.click('#play'); await calm();
          return s;
        };
        await holdAchDuring(async () => {
          await rest();
          // ---- "where we stopped": a tap on the cat with the bubble empty ----
          await gameFor(() => document.querySelector('#bubble').classList.contains('hidden') && !__game.speaking, null, 30)
            .catch(() => fail('the bubble did not empty before the tap on the cat'));
          const want = await wantLeft();
          const cat = await g(() => {
            const p = __game.cat.root.position, s = new __game.THREE.Vector3(p.x, p.y + __game.catTapY, p.z).project(__game.camera);
            const x = (s.x * 0.5 + 0.5) * innerWidth, y = (-s.y * 0.5 + 0.5) * innerHeight;
            const under = s.z < 1 && x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight ? document.elementFromPoint(x, y) : null;
            return { x, y, under: under ? under.id || under.localName : 'nothing' };
          });
          if (cat.under !== 'c') fail(`the cat cannot be tapped at ${Math.round(cat.x)},${Math.round(cat.y)}: there is "${cat.under}"`);
          const n0 = await g((k) => window.__starts[k] ?? 0, want);
          await (touch ? page.touchscreen.tap(cat.x, cat.y) : page.mouse.click(cat.x, cat.y)); await calm();
          await page.waitForFunction(([k, n]) => (window.__starts[k] ?? 0) === n + 1, [want, n0], { timeout: T(5000) }) /* clock: audio */
            .catch(async () => left.push(`a tap on the cat with the bubble empty did not say "${want}" (the line: ${await g(() => __game.line)})`));
          const said = await g(() => ({ line: __game.line, bubble: !document.querySelector('#bubble').classList.contains('hidden') }));
          if (said.line !== want) left.push(`a tap on the cat says "${said.line}", the state of the world asks for "${want}"`);
          else if (!said.bubble) left.push(`"${want}" is said without its subtitle`);
          await silence().catch(() => {});
          // ---- a new day: the lever let go, the last gift long ago (stored by the page's own save on leaving) ----
          await g(() => { __game.gift.release(); __game.save.gift = '2000-01-01'; });
          const s0 = await replay();
          if (s0.held) fail('the lever of the gift is still pulled after the reload');
          if (s0.gift !== '2000-01-01') fail(`the save did not keep the date of the last gift over the reload: ${s0.gift}`);
          // the lines are caught by their clips started on this page (an event: a slow machine may be past a line before a
          // look at the line of the moment; with no voice the clips start too, at volume 0)
          const startedOf = (keys) => g((k) => k.filter((x) => (window.__starts[x] ?? 0) > 0), keys);
          if (!(await gameUntil((h) => h.some((k) => (window.__starts[k] ?? 0) > 0), HELLOS, 15))) fail(`a new day: no hello was started (the line: ${await g(() => __game.line)})`);
          const hello = (await startedOf(HELLOS))[0];
          if (!(await gameUntil((k) => k.some((x) => (window.__starts[x] ?? 0) > 0), GIFTS, 20))) fail(`a new day: no line of the gift after "${hello}" (the line: ${await g(() => __game.line)})`);
          const giftLine = (await startedOf(GIFTS))[0];
          await gameUntil(() => !!window.__giftShown, null, 10).catch(() => {});   // reported below if never shown
          const s1 = await g(() => {
            return { stars: __game.save.stars, hud: document.querySelector('#stars').textContent, gift: __game.save.gift,
              stored: JSON.parse(localStorage.getItem('amw-save') || '{}'), caption: window.__giftShown?.text ?? null, inside: !!window.__giftShown?.inside };
          });
          await shot('42-welcome');
          if (s1.stars !== s0.stars + 1) left.push(`a new day gave ${s1.stars - s0.stars} stars, not one (${s0.stars} -> ${s1.stars})`);
          if (s1.hud !== String(s1.stars)) left.push(`the counter shows ${s1.hud}, the save ${s1.stars}`);
          if (s1.stored.stars !== s1.stars || s1.stored.gift !== s1.gift) left.push(`the gift is not stored: ${s1.stored.stars} stars, the day ${s1.stored.gift}`);
          if (!/^\d{4}-\d\d-\d\d$/.test(s1.gift ?? '') || s1.gift === '2000-01-01') left.push(`the date of the gift is not a new one: ${s1.gift}`);
          if (!s1.caption || !s1.caption.includes('+1 ⭐')) left.push(`no caption of the gift ("+1 ⭐"): ${s1.caption}`);
          else if (!s1.inside) left.push(`${mode}: the caption of the gift is not inside the window`);
          await gameFor(() => !__game.speaking, null, 20).catch(() => left.push('the meeting did not fall silent'));
          const v1 = await g(([h, k]) => ({ hello: window.__starts[h] ?? 0, gift: window.__starts[k] ?? 0, dropped: [...__game.dropped], synth: [...__game.voice.synth] }), [hello, giftLine]);
          if (!v1.hello || !v1.gift) left.push(`a line of the meeting was not heard: ${hello} ${v1.hello}, ${giftLine} ${v1.gift}`);
          const lost = v1.dropped.filter((k) => [...HELLOS, ...GIFTS, ...LEFTS, 'welcome_back'].includes(k));
          if (lost.length) left.push(`the planner turned the meeting's lines away: ${lost.join(', ')}`);
          const synth = v1.synth.filter((k) => [...HELLOS, ...GIFTS].includes(k));
          if (synth.length) errors.push(`no recorded clip for: ${synth.join(', ')} (python3 tools/gen_voice.py)`);
          // ---- the same day again: the old welcome back, no star ----
          const s2 = await replay();
          if (!(await gameUntil(() => (window.__starts.welcome_back ?? 0) > 0, null, 15))) left.push(`the same day: no "welcome_back" was started (the line: ${await g(() => __game.line)})`);
          await rest();
          const s3 = await g(([h, k]) => ({ stars: __game.save.stars, gift: __game.save.gift, said: [...h, ...k].filter((x) => window.__starts[x]) }), [HELLOS, GIFTS]);
          if (s3.stars !== s2.stars || s2.stars !== s1.stars) left.push(`the same day gave stars: ${s1.stars} -> ${s2.stars} -> ${s3.stars}`);
          if (s3.gift !== s1.gift) left.push(`the same day changed the date of the gift: ${s1.gift} -> ${s3.gift}`);
          if (s3.said.length) left.push(`the same day the cat said ${s3.said.join(', ')}`);
          if (!(await walks())) left.push('the heroine does not walk after the meeting');
          if (!left.length) console.log(`welcome: a tap on the cat said "${want}"; a new day: "${hello}", "${giftLine}", +1 star (${s0.stars} -> ${s1.stars}), the caption "${s1.caption}"; the same day: welcome back, no star`);
          await g(() => __game.gift.hold());
        });
        if (left.length) errors.push(`welcome: ${mode}: ${left.join('; ')}`);
      }
      // ---- the save as a code (PLAY-16): the one place where the packing and the clipboard run in a real browser ----
      // "Move the game" of the parents' section: the code is copied (the clipboard granted to this block only), checked
      // here in node (its prefix, its sum, no setting of the device in it) and pasted into a game started again with
      // "reset progress"; two taps load it and the page reloads with the same game - stars, shards, look, name -, the
      // device's own volumes kept. Then "give the previous game back" (two taps): the game of before the code (the new one)
      // comes back and the button stays, the two swapped; once more, and the walk goes on with its own game. The code
      // itself is never printed: its length and its prefix only. Played after "achievements": its reloads would start
      // the page's own logs (the voice, the watch of the stars) that the checks at the end of the world read.
      if (has('code')) {
        const fail = (what) => { throw new Error(`code: ${what}`); };
        const tap = (sel) => tapOn(sel).catch((e) => fail(`${sel} cannot be pressed: ${why(e)}`));
        // what a tap's own (async) handler does to the page
        const handled = (pred, arg, what) => page.waitForFunction(pred, arg, { timeout: T(15000) }).catch(() => fail(what)); /* clock: input-event */
        const stored = (key = 'amw-save') => g((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
        // the game a save holds (what a code must carry); not the minutes of play or the spot, which move as she plays
        const game = (s) => s && JSON.stringify({ stars: s.stars, name: s.name, dress: s.dress, hair: s.hair, wingColor: s.wingColor, gear: s.gear,
          owned: s.owned, pet: s.pet ?? null, pets: s.pets ?? null, achievements: Object.keys(s.achievements ?? {}).sort(), skills: s.skills, hard: s.hard,
          fairy: s.worlds?.fairy && { quests: s.worlds.fairy.quests, final: s.worlds.fairy.final, flags: s.worlds.fairy.flags, starsTaken: s.worlds.fairy.starsTaken } });
        const isNew = (s) => !!s && !s.stars && !Object.keys(s.worlds?.fairy?.quests ?? {}).length && !s.worlds?.fairy?.final;
        // a tap that reloads the page (the game's own location.reload()), then the start screen of the page loaded again;
        // its scenes wait (a reloaded page starts free)
        const reloadBy = async (sel, what) => {
          await Promise.all([page.waitForEvent('load', { timeout: T(90000) }), tap(sel)]).catch((e) => fail(`${what} did not reload the page: ${e.message}`)); /* clock: page-load */
          await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
          await page.waitForFunction(() => !!window.__game?.ach, null, { timeout: T(30000) }).catch(() => fail(`no __game after ${what}`)); /* clock: page-load */
          await g(() => __game.ach.hold());
        };
        // "play" and into the world (a new player's tour skipped: it is the block "flyover"'s)
        const enter = async (what) => {
          await tap('#play');
          await page.waitForFunction(() => !document.querySelector('#btnBook').classList.contains('hidden') && document.querySelector('#start').classList.contains('hidden'),
            null, { timeout: T(90000) }).catch(() => fail(`${what}: the game did not start after "play"`)); /* clock: page-load */
          await g(() => __game.flyoverPlayer?.skip());
          // a new player's introduction (WORLD-13, played through in the piece world1) lies over the game: skipped here
          if (await g(() => !!window.__game.story?.active)) {
            await g(() => __game.story.skip());
            await gameFor(() => !__game.story.active, null, 10).catch(() => fail(`${what}: the introduction of a new player did not end on its skip`));
          }
        };
        // the book, the gate answered from the screen, "move the game" (the one of its two buttons this size shows)
        const openCode = async (what) => {
          await tap('#btnBook'); await calm();
          await tap('#btnParents'); await calm();
          const q = await page.textContent('#gateQ'), m = /(\d+) × (\d+)/.exec(q);
          if (!m) fail(`${what}: no multiplication in the gate "${q}"`);
          await page.fill('#gateA', String(Number(m[1]) * Number(m[2]))); await calm();
          if (!(await visible('#pBody'))) fail(`${what}: the answer did not open the section`);
          const id = await g(() => [...document.querySelectorAll('#pBody .pcodebtn')].find((b) => b.offsetWidth > 0 && b.offsetHeight > 0)?.id);
          if (!id) fail(`${what}: no "move the game" button is shown`);
          await tap(`#${id}`); await calm();
          if (!(await g(() => !!document.querySelector('#pCodeCopy') && !!document.querySelector('#pCodeIn')))) fail(`${what}: "move the game" did not show the code`);
          return { restore: await g(() => document.querySelector('#pCodeRestore')?.textContent ?? null) };
        };
        // two taps of a button that asks to be sure: the first changes its words, the second reloads
        const twice = async (sel, what) => {
          const was = await page.textContent(sel);
          await tap(sel);
          await handled((a) => document.querySelector(a[0])?.textContent !== a[1], [sel, was], `${what}: the first tap did not ask to be sure`);
          if (await g(() => document.querySelector('#pCodeMsg')?.classList.contains('bad'))) fail(`${what}: refused - "${await page.textContent('#pCodeMsg')}"`);
          await reloadBy(sel, `the second tap of ${what}`);
        };
        await holdAchDuring(async () => {
          if (await stored('amw-save-before-code')) fail('a game replaced by a code is kept before the block');
          // the volume of the music this device plays with: the code must not carry it to the other one (R60)
          // a made-up name when the walk has none (the whole walkthrough starts as a new player who typed none): the name is
          // what the code carries between the customer's devices and has to be checked
          await g(() => { __game.save.vol.music = 0.35; if (!__game.save.name) __game.save.name = 'Мірабелла'; });
          const had = await g(() => __game.save);
          if (!had.name) fail('the save of the walk has no name: the name going with the code goes unchecked');
          const first = await openCode('the game of the walk');
          if (first.restore !== null) fail('"give the previous game back" is shown before any code was loaded');
          // ---- copied: the field and the clipboard ----
          const clip = await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin }).then(() => true, (e) => `not granted: ${e.message}`);
          await tap('#pCodeCopy');
          await handled(() => document.querySelector('#pCodeOut').value.length > 0 && document.querySelector('#pCodeMsg').textContent !== '', null, '"copy the code" put no code into the field');
          const out = await g(async () => ({ code: document.querySelector('#pCodeOut').value, msg: document.querySelector('#pCodeMsg').textContent,
            packs: typeof CompressionStream === 'function' && typeof DecompressionStream === 'function',
            board: await navigator.clipboard.readText().then((t) => ({ text: t }), (e) => ({ err: String(e) })) }));
          const code = out.code;
          await shot('parents-code');
          // the clipboard: written by the game ("copied"), and what it holds is the field's code
          let board = 'not checked';
          if (clip !== true) console.log(`code: the clipboard ${clip}: it is not checked, the code is taken from the field`);
          else if (out.board.err) errors.push(`code: ${mode}: the clipboard cannot be read back: ${out.board.err}`);
          else if (out.board.text !== code) errors.push(`code: ${mode}: the clipboard holds ${out.board.text.length} signs, not the code of the field (${code.length}); the message is "${out.msg}"`);
          else board = 'the code of the field';
          // ---- the code itself, read here: amw1z (packed) / amw1, the payload, the FNV-1a sum of both ----
          const parts = code.split('.'), [prefix, payload, sum] = parts;
          console.log(`code: ${code.length} signs, prefix ${prefix}; the clipboard: ${board}; the message "${out.msg}"`);
          if (parts.length !== 3 || !['amw1z', 'amw1'].includes(prefix)) fail(`the code is not of the shape <amw1z|amw1>.<payload>.<sum> (prefix "${prefix}", ${parts.length} parts)`);
          if (prefix !== 'amw1z') {
            if (out.packs) errors.push(`code: ${mode}: the browser packs (CompressionStream), but the code is not packed: prefix ${prefix}`);
            else console.log(`code: this browser cannot pack: prefix ${prefix}`);
          }
          let h = 0x811c9dc5;
          for (const c of `${prefix}.${payload}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); }
          if ((h >>> 0).toString(16).padStart(8, '0') !== sum) fail('the sum of the code is not the FNV-1a of its prefix and payload');
          let inCode;
          try {
            const bytes = Buffer.from(payload, 'base64url');
            inCode = JSON.parse((prefix === 'amw1z' ? inflateRawSync(bytes) : bytes).toString('utf8'));
          } catch (e) { fail(`the payload of the code cannot be read: ${e.message}`); }
          const device = ['tier', 'pinTier', 'vol', 'launches', 'session'].filter((k) => k in inCode);
          if (device.length) errors.push(`code: ${mode}: the code carries the settings of the device: ${device.join(', ')}`);
          if (game(inCode) !== game(had)) fail('the code does not hold the game of the walk');
          if (prefix === 'amw1z') console.log(`code: ${code.length} signs pack ${JSON.stringify(inCode).length} of the save's JSON`);
          // ---- a game started again: "reset progress", two taps ----
          await tap('#pCodeBack'); await calm();
          await twice('#pReset', '"reset progress"');
          const fresh = await g(() => __game.save);
          if (!isNew(fresh) || fresh.name) fail(`"reset progress" left a game: ${fresh.stars} stars, quests ${JSON.stringify(fresh.worlds?.fairy?.quests)}, a name ${fresh.name ? 'kept' : 'none'}`);
          if (fresh.vol.music === had.vol.music) fail('the volume of the music the walk set survived "reset progress": the device\'s own settings go unchecked');
          await enter('the game started again');
          const second = await openCode('the game started again');
          if (second.restore !== null) fail('"give the previous game back" is shown in a game started again, before a code');
          // ---- pasted (from the clipboard where it was checked, typed in the field otherwise) and loaded ----
          await page.focus('#pCodeIn');
          let how = 'typed into the field';
          if (board !== 'not checked') {
            await page.keyboard.press('ControlOrMeta+V');
            if ((await g(() => document.querySelector('#pCodeIn').value)) === code) how = 'pasted from the clipboard';
          }
          if (how !== 'pasted from the clipboard') await page.fill('#pCodeIn', code);
          await calm();
          await twice('#pCodeLoad', '"load"');
          const back = { mem: await g(() => __game.save), kept: await stored('amw-save'), before: await stored('amw-save-before-code') };
          const left = [];
          if (game(back.mem) !== game(had)) left.push('the game after the reload is not the one of the code');
          if (game(back.kept) !== game(had)) left.push('the stored save is not the one of the code');
          if (JSON.stringify(back.mem.vol) !== JSON.stringify(fresh.vol)) left.push(`the volumes ${JSON.stringify(back.mem.vol)} are not the device's own ${JSON.stringify(fresh.vol)}`);
          if (back.mem.pinTier !== fresh.pinTier) left.push(`the pinned quality ${back.mem.pinTier} is not the device's own ${fresh.pinTier}`);
          if (!isNew(back.before)) left.push('the game the code replaced (the new one) is not kept to be given back');
          if (left.length) fail(`after "load" and the reload: ${left.join('; ')}`);
          await enter('the game of the code');
          const worn = await g(() => ({ head: __game.gear.get('head'), wand: __game.gear.get('wand'), wings: __game.gear.get('wings'), trail: __game.gear.get('trail') }));
          for (const k of Object.keys(worn)) if ((worn[k] ?? null) !== (had.gear[k] ?? null)) left.push(`she wears ${worn[k]} as ${k}, the code has ${had.gear[k]}`);
          if (left.length) fail(`the look after the code: ${left.join('; ')}`);
          console.log(`code: ${how}; after the reload ${had.stars} stars, quests ${JSON.stringify(had.worlds.fairy.quests)}, final ${had.worlds.fairy.final}, the look and the name of the code; the volumes are the device's`);
          // ---- "give the previous game back": the new game, and the button again (the two swapped); once more: the walk's ----
          const third = await openCode('the game of the code');
          if (third.restore === null) fail('no "give the previous game back" after a code was loaded');
          await shot('parents-code-restore');
          await twice('#pCodeRestore', '"give the previous game back"');
          const prev = { mem: await g(() => __game.save), before: await stored('amw-save-before-code') };
          if (!isNew(prev.mem)) fail(`"give the previous game back" did not give back the game started again: ${prev.mem.stars} stars, quests ${JSON.stringify(prev.mem.worlds?.fairy?.quests)}`);
          if (game(prev.before) !== game(had)) fail('"give the previous game back" did not keep the game of the code in its place: the two are not swapped');
          await enter('the game given back');
          const fourth = await openCode('the game given back');
          if (fourth.restore === null) fail('no "give the previous game back" after the previous game was given back');
          await twice('#pCodeRestore', '"give the previous game back" once more');
          const again = await g(() => __game.save);
          if (game(again) !== game(had)) fail('the second "give the previous game back" did not bring the game of the code back');
          await enter('the game of the walk again');
          console.log('code: "give the previous game back" gave the game started again, the button stayed; once more - the game of the code');
        }).finally(() => page.context().clearPermissions().catch(() => {}));
      }
      if (has('leave')) {
        // the start screen of a returning player: the saved game adds the "start again" button
        // Leaving the page saves where she stands (pagehide): the save on a timer alone would lose up to ten seconds of walk.
        const leftAt = [2.5, 12.5];
        // Save v3 (ARCH-07): the spot is the first world's progress, under worlds.fairy.
        const storedBefore = await g((p) => { __game.teleport(p[0], p[1]); return JSON.parse(localStorage.getItem('amw-save') || '{}').worlds?.fairy?.pos; }, leftAt);
        await page.reload(); await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
        {
          const pos = await g(() => JSON.parse(localStorage.getItem('amw-save') || '{}').worlds?.fairy?.pos);
          const near = (p) => Array.isArray(p) && Math.hypot(p[0] - leftAt[0], p[1] - leftAt[1]) < 0.01;
          if (near(storedBefore)) console.log('leaving the page: the timer had already saved the spot - not put to the test');
          else if (!near(pos)) errors.push(`leaving the page: the save keeps ${JSON.stringify(pos)}, not the spot she left at ${JSON.stringify(leftAt)}`);
          else console.log('leaving the page: the spot she stood on is saved');
        }
        // The magic of the world after the reload (WORLD-09): built from the save, from the first frame of the page - read
        // on the start screen, before "play" (a value that came from elsewhere would still be on its way to the save's).
        {
          await page.waitForFunction(() => !!window.__game?.magic, null, { timeout: T(30000) }).catch(() => { throw new Error('the magic: no __game.magic after the reload'); }); /* clock: page-load */
          const m = await g((k) => {
            const w = __game.save.worlds.fairy, shards = __game.npcs.filter((c) => (w.quests[c.def.id] ?? 0) >= c.def.steps.length).length;
            return { value: __game.magic.value, target: __game.magic.target, want: w.final ? 1 : Math.min(1, shards * k) };
          }, MAGIC_SHARD);
          if (Math.abs(m.value - m.want) > 1e-9 || Math.abs(m.target - m.want) > 1e-9) errors.push(`the magic: ${mode}: after the reload the page shows ${m.value} (heading for ${m.target}), the save gives ${m.want}`);
          else console.log(`the magic: after the reload ${m.want.toFixed(2)} from the first frame, as the save gives it`);
        }
        // The shop's choices after the reload (R05, R09): the bought wand, no wings, the hair and the colour of the wings.
        if (shopped) {
          await page.waitForFunction(() => window.__game?.gear, null, { timeout: T(30000) }).catch(() => { throw new Error('shop: no __game.gear after the reload'); }); /* clock: page-load */
          const a = await g(() => ({ wand: __game.gear.get('wand'), head: __game.gear.get('head'), wings: __game.gear.get('wings'), hair: __game.save.hair, wingColor: __game.save.wingColor,
            tint: __game.gear.color, owned: __game.save.owned, petals: __game.hero.root.children.filter((o) => o.isMesh && o.visible && o.material.transparent).length }));
          const left = [];
          if (a.wand !== shopped.wand) left.push(`she holds ${a.wand}, not the bought ${shopped.wand}`);
          if (a.head !== shopped.head) left.push(`she wears ${a.head} on her head, not ${shopped.head}`);
          if (!a.owned.includes(shopped.wand)) left.push(`${shopped.wand} is not among the purchases`);
          if (a.wings !== shopped.wings || a.petals) left.push(`wings ${a.wings} (${a.petals} petals shown), chosen none`);
          if (a.hair !== shopped.hair) left.push(`hair ${a.hair}, chosen ${shopped.hair}`);
          if (a.wingColor !== shopped.wingColor || a.tint !== shopped.wingColor) left.push(`wings of colour ${a.wingColor} (worn ${a.tint}), chosen ${shopped.wingColor}`);
          if (left.length) errors.push(`shop: ${mode}: after the reload ${left.join('; ')}`);
          else console.log(`shop: after the reload she holds ${a.wand}, has no wings, hair ${a.hair}, wing colour ${a.wingColor}`);
        } else if (listed('shop')) errors.push(`shop: ${mode}: the shop was not played`);
      }
      // ---- the four looks of the start screen (PLAY-06, R24-R26): played on the start screen of the reload above.
      // Each button puts its whole look on the save and on her at once, stored, the trail and the purchases kept; its
      // picture; every two looks differ in two parameters or more. Then "play", the fitting room changes the hair alone
      // (R25), and a reload brings the start screen back for what follows.
      if (has('looks')) {
        const fail = (what) => { throw new Error(`looks: ${what}`); };
        // What the customer chose (shop-and-looks.md §5, in the colours of the palettes): written here, not read from the game.
        const LOOK = {
          fairy: { dress: '#5cc8ff', hair: '#f5d16b', wings: 'wings_petals', wingColor: '#ffd1ec', head: null, wand: 'wand_flower' },
          princess: { dress: '#ff7eb6', hair: '#f5d16b', wings: null, wingColor: '#fff3b8', head: 'tiara', wand: null },
          elf: { dress: '#6ee7a8', hair: '#ff8a5c', wings: null, wingColor: '#c9ffe0', head: 'elf_ears', wand: 'wand_leaf' },
          witch: { dress: '#b388ff', hair: '#3b2a3a', wings: null, wingColor: '#e6d4ff', head: 'wizard_cap', wand: 'wand_moon' },
        };
        const KEYS = ['dress', 'hair', 'wings', 'wingColor', 'head', 'wand'];
        const tap = (sel) => tapOn(sel).catch((e) => fail(`${sel} cannot be pressed: ${why(e)}`));
        const until = (fn, arg, what, ms = 10000) => page.waitForFunction(fn, arg, { timeout: T(ms) }).catch(() => fail(what)); /* clock: input-event */
        if (!(await visible('#setup')) || !(await visible('#start'))) fail('the start screen is not shown');
        await until(() => window.__game?.gear && document.querySelectorAll('#looks button[data-look]').length === 4, null, 'no row of four looks on the start screen', 30000);
        // This block measures the looks, not the achievements (PLAY-08): the scenes the save still has in its queue would
        // come at the stop point of its own "play" and lie over the book's button. They wait for the whole block - the
        // walkthrough's lever (holdAchDuring), given back as it was at the end; the game never holds them.
        await holdAchDuring(async () => {
        const look = () => g(() => {
          const s = __game.save, gear = __game.gear, st = JSON.parse(localStorage.getItem('amw-save') || '{}');
          const lit = (id) => [...document.querySelectorAll(`#${id} button`)].findIndex((b) => b.classList.contains('sel'));
          return {
            save: { dress: s.dress, hair: s.hair, wings: s.gear.wings, wingColor: s.wingColor, head: s.gear.head, wand: s.gear.wand },
            stored: st.gear && { dress: st.dress, hair: st.hair, wings: st.gear.wings, wingColor: st.wingColor, head: st.gear.head, wand: st.gear.wand },
            worn: { head: gear.get('head'), wand: gear.get('wand'), wings: gear.get('wings'), tint: gear.color },
            shown: Object.entries(gear.parts).filter(([, p]) => p.object.visible).map(([id]) => id).sort(),
            petals: __game.hero.root.children.filter((o) => o.isMesh && o.visible && o.material.transparent).length,
            trail: s.gear.trail, owned: [...s.owned], stars: s.stars,
            lit: [...document.querySelectorAll('#looks button.sel')].map((b) => b.dataset.look),
            swatch: { dress: lit('dress'), hair: lit('hair') },
          };
        });
        const before = await look();
        const seen = {};
        for (const id of Object.keys(LOOK)) {
          const sel = `#looks [data-look=${id}]`, want = LOOK[id];
          // the button lies inside the window and is big enough for a finger
          const box = await g((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; }, sel);
          if (box.x < 0 || box.y < 0 || box.x + box.w > box.vw || box.y + box.h > box.vh) fail(`the button of ${id} is outside the window: ${JSON.stringify(box)}`);
          if (box.w < 44 || box.h < 44) fail(`the button of ${id} is ${box.w}x${box.h}, smaller than 44x44`);
          await tap(sel);
          // Waited for by what the tap does (the save holds the look), not by the clock; a wrong look is reported below.
          await page.waitForFunction((w) => Object.entries(w).every(([k, v]) => (k in __game.save.gear ? __game.save.gear[k] : __game.save[k]) === v), want, { timeout: T(5000) }).catch(() => {}); /* clock: input-event */
          const a = await look(), wrong = [];
          for (const k of KEYS) {
            if (a.save[k] !== want[k]) wrong.push(`the save's ${k} ${a.save[k]}, not ${want[k]}`);
            if (a.stored?.[k] !== want[k]) wrong.push(`the stored ${k} ${a.stored?.[k]}, not ${want[k]}`);
          }
          for (const k of ['head', 'wand', 'wings']) if (a.worn[k] !== want[k]) wrong.push(`she wears ${a.worn[k]} as ${k}, not ${want[k]}`);
          if (a.worn.tint !== want.wingColor) wrong.push(`her wings are tinted ${a.worn.tint}, not ${want.wingColor}`);
          const models = [want.head, want.wand].filter(Boolean).sort();
          if (a.shown.join() !== models.join()) wrong.push(`the items shown on her: ${a.shown.join(', ') || 'none'}, not ${models.join(', ') || 'none'}`);
          if ((a.petals > 0) !== (want.wings === 'wings_petals')) wrong.push(`${a.petals} petals shown with the wings ${want.wings}`);
          if (a.trail !== before.trail || a.owned.join() !== before.owned.join() || a.stars !== before.stars) wrong.push(`the trail, the purchases or the stars changed: ${JSON.stringify([a.trail, a.owned, a.stars])}`);
          if (a.lit.join() !== id) wrong.push(`the lit look is ${a.lit.join(', ') || 'none'}`);
          if (a.swatch.dress < 0 || a.swatch.hair < 0) wrong.push('the swatches of the start screen do not show the colours of the look');
          if (wrong.length) fail(`${id}: ${wrong.join('; ')}`);
          seen[id] = a.save;
          await shot(`look-${id}`);
        }
        // R26: every two looks differ in two parameters or more, as they were seen
        const ids = Object.keys(seen);
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const n = KEYS.filter((k) => seen[ids[i]][k] !== seen[ids[j]][k]).length;
          if (n < 2) fail(`${ids[i]} and ${ids[j]} differ in ${n} parameter(s)`);
        }
        // R25: in the fitting room the hair changes on its own, the rest of the look (the witch's, the last one) stays
        const witch = seen.witch;
        await page.click('#play');
        await until(() => !document.querySelector('#btnBook').classList.contains('hidden') && document.querySelector('#start').classList.contains('hidden'), null, 'the game did not start after "play"', 60000);
        // The stop point of "play" over (its scene held, see above): only then the first tap - by the event, not the clock.
        await until(() => __game.ach.plays >= 1, null, 'the stop point of "play" did not come', 60000);
        await tap('#btnBook');
        await until(() => !document.querySelector('#book').classList.contains('hidden'), null, 'the book did not open');
        await tap('#btnShop');
        await until(() => !document.querySelector('#shop').classList.contains('hidden'), null, 'the fitting room did not open');
        await tap('#shopTabs [data-tab=hair]');
        const hair = await g((h) => [...document.querySelectorAll('#shopItems .swatches button')].map((b) => b.dataset.color).find((c) => c !== h), witch.hair);
        if (!hair) fail('the fitting room shows no other hair colour');
        await tap(`#shopItems .swatches button[data-color="${hair}"]`);
        await until((h) => __game.save.hair === h, hair, `a tap on the hair ${hair} did not change it`);
        {
          const a = await look(), wrong = [];
          for (const k of KEYS) {
            const want = k === 'hair' ? hair : witch[k];
            if (a.save[k] !== want) wrong.push(`${k} ${a.save[k]}, not ${want}`);
            if (a.stored?.[k] !== want) wrong.push(`stored ${k} ${a.stored?.[k]}, not ${want}`);
          }
          if (a.worn.head !== witch.head || a.worn.wand !== witch.wand) wrong.push(`she wears ${a.worn.head} and ${a.worn.wand}`);
          if (wrong.length) fail(`after the look of the witch the hair was changed in the fitting room: ${wrong.join('; ')}`);
        }
        await shot('look-witch-hair');
        await tap('#shopDone');
        console.log(`looks: ${ids.join(', ')} put on from the start screen and stored, the trail and ${before.owned.length} purchases kept; then the hair ${hair} alone in the fitting room`);
        });
        // back to the start screen for the blocks after this one
        await page.reload(); await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
      }
      if (has('start-again')) {
        await calm(); await shot('40-start-again');
        // "Start again" really starts again: after the reload the save is the one of a new player. The game saves itself
        // on the way out (pagehide), and that once wrote the whole progress straight back.
        {
          const fail = (what) => { throw new Error(`start again: ${what}`); };
          const had = await g(() => JSON.parse(localStorage.getItem('amw-save') || '{}'));
          // Save v3 (ARCH-07): a world's progress lies under worlds.<id>. The check has to see the progress it clears, or
          // reading it from the wrong place would pass in silence: the walkthrough restored the crystal and did every quest.
          const hadW = had.worlds?.fairy;
          if (!(had.stars > 0)) fail(`the walkthrough left no stars to clear: ${had.stars}`);
          if (!hadW?.final || Object.keys(hadW.quests ?? {}).length === 0) fail(`the walkthrough left no world progress to clear under worlds.fairy: ${JSON.stringify(hadW)}`);
          await Promise.all([page.waitForEvent('load', { timeout: T(90000) }), tapOn('#restart')]).catch((e) => fail(`the button did not reload the game: ${why(e)}`)); /* clock: page-load */
          await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
          const now = await g(() => JSON.parse(localStorage.getItem('amw-save') || '{}'));
          const left = [];
          if (now.stars) left.push(`${now.stars} stars`);
          if (now.played) left.push('"played"');
          // every world of the save, and the top level where a version 2 save kept the progress
          for (const [id, w = {}] of [['top', now], ...Object.entries(now.worlds ?? {})]) {
            if (w.final) left.push(`the restored crystal (${id})`);
            if (Object.keys(w.quests ?? {}).length) left.push(`quests ${JSON.stringify(w.quests)} (${id})`);
            if (w.starsTaken?.length) left.push(`stars taken ${JSON.stringify(w.starsTaken)} (${id})`);
            if (w.chestOpen || w.flags?.chest) left.push(`the open chest (${id})`);
          }
          if (await visible('#restart')) left.push('the "start again" button of a returning player');
          if (left.length) fail(`after the reload the old progress is back: ${left.join(', ')}`);
          console.log(`start again: ${had.stars} stars and quests ${JSON.stringify(hadW.quests)} cleared, the start screen of a new player`);
        }
      }
      // ---- the book at the start of the game (R17): a new player's shelf is five silhouettes. Played after "start again" ----
      if (listed('book') && listed('start-again')) {
        await tapOn('#play').catch((e) => errors.push(`book: ${mode}: "play" of a new player cannot be pressed: ${why(e)}`));
        await page.waitForFunction(() => !document.querySelector('#btnBook').classList.contains('hidden') && document.querySelector('#start').classList.contains('hidden') && !!window.__game,
          null, { timeout: T(90000) }).catch(() => errors.push(`book: ${mode}: the game of a new player did not start`)); /* clock: page-load */
        // a new player's introduction (WORLD-13, played through in the piece world1) lies over the game: skipped here
        if (await g(() => !!window.__game.story?.active)) {
          await g(() => __game.story.skip());
          await gameFor(() => !__game.story.active, null, 10).catch(() => errors.push(`book: ${mode}: the introduction of a new player did not end on its skip`));
        }
        await tapOn('#btnBook').then(() => checkProfile('start', 0)).then(() => closeBook())
          .catch((e) => errors.push(`book: ${mode}: ${e.message}`));
      }
      // The end of the walk (R06, R43): the scenes the blocks after "achievements" closed (a reload's "Play" is a stop
      // point too) were waiting in its queue - every scene of the walk is of the piece's set, and each came once.
      if (achWant) {
        const want = achWant;
        const extra = achSeen.filter((id) => !want.includes(id)), twice = achSeen.filter((id, i) => achSeen.indexOf(id) !== i);
        if (extra.length) errors.push(`achievements: ${mode}: by the end of the walk scenes not of the set: ${extra.join(', ')}`);
        if (twice.length) errors.push(`achievements: ${mode}: by the end of the walk scenes shown twice: ${twice.join(', ')}`);
        console.log(`achievements of the walk: ${achSeen.length} scenes shown: ${achSeen.join(', ') || 'none'}`);
      }
      // E2E_ONLY: the group came to the end through every block of its own
      if (group) {
        const missed = group.blocks.filter((b) => !blocksPlayed.includes(b));
        if (missed.length) errors.push(`group "${only}": blocks not played: ${missed.join(', ')}`);
        console.log(`group "${only}": the chains of ${group.friends.join(', ') || 'no friend'}; blocks ${blocksPlayed.join(', ') || 'none'}`);
      }
    }
  } catch (e) {
    // a stuck quest or a timed-out wait: report it with the rest and keep a picture of where it happened
    errors.push('scenario failed: ' + e.message);
    await picture('99-failure').catch(() => {});
  }
} finally {
  await browser.close().catch(() => {});
}
// The fingerprint of the tasks met (ARCH-08): two walkthroughs of one size with one E2E_SEED print the same one.
writeFileSync(`${out}/${tag}-tasks.txt`, taskLog.join('\n') + '\n');
console.log(`task sequence${seed ? ` (seed ${seed})` : ''}: ${taskLog.length} tasks, ${createHash('sha256').update(taskLog.join('\n')).digest('hex').slice(0, 16)}`);
if (modelsOut) writeFileSync(modelsOut, JSON.stringify([...models].sort(), null, 2) + '\n');
// Written only by a walkthrough that reached its end with the voice checked: tools/e2e.mjs reads who played in silence.
// With E2E_ONLY it also names the group, so that a group played as the whole world (or the other way round) is noticed.
if (voiceOut && voiceUsed) writeFileSync(voiceOut, JSON.stringify({ mute, clips: voiceUsed.clips, loud: voiceUsed.loud, ...(only ? { group: only } : {}) }) + '\n');
console.log(`offline: ${offline ? `yes, files in the cache: ${cachedFiles ?? 'unknown (the network was never switched off)'}${worldFiles ? `, of the world "${worldId}" in the cache "worlds": ${worldFiles}` : ''}` : 'no'}`);
console.log(`model files requested by the page: ${models.size}`);
console.log(`requests: ${nRequests}, origins: ${origins.size}` + (cancelled.length ? `, cancelled by the browser: ${cancelled.length}` : ''));
// the tolerated cancellations stay visible: which requests they were
for (const u of cancelled.slice(0, 5)) console.log(`  cancelled (not an error): ${u}`);
if (cancelled.length > 5) console.log(`  … and ${cancelled.length - 5} more`);
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
if (errors.length) process.exitCode = 1;
