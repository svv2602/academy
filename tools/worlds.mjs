// The probe world is a test world: the sources have it, the published game does not (TECH-15, TECH-09):
//   node tools/worlds.mjs [distDir] [--only <part>[,<part>...]]
// tools/e2e.mjs runs it as the step "worlds", once per run (with the mobile size, like "update"), on the dist/ it built.
// The run has five parts, played one after another on one probe build: "walk" (1, 3 and 4 below), "cache" (5),
// "transition" (6), "travel" (7) and "hub" (8). --only plays the parts named and leaves the rest out; the probe build (2) is made and checked for
// every part - each of them plays it. CI gives each part a job of its own (ARCH-16: a new scenario is a new part and a
// new job, not more minutes in an old one); without --only everything is played, as tools/e2e.mjs does.
//   1. The published build (distDir; without the argument `vite build` makes dist/ anew, as `npm run build` does) holds
//      nothing of the probe world: no file under a folder "probe", no chunk of it, none of its marks in the code.
//   2. The probe build is made anew: `vite build --mode probe --outDir dist-probe`. It must hold every file of
//      worlds-test/probe/ at the same path (models/probe/…, voice/probe/…, story/probe/…), the world in its code (the
//      same search as in 1 must find it there, or the search is blind) and the commit number of the sources.
//      The build must also list the world for the game (worlds.json: its files with their sizes and fingerprints),
//      keep its files out of the service worker's list and fit the size budget of a next world (tools/dist-size.mjs).
//      The voice of the world (`worldVoiceProblems`): it has a clip of its own under voice/probe/, listed in worlds.json
//      with its size, not in the list of the installation, counted as the voice of the world - and the voice of the
//      core is byte for byte the clips of public/voice.
//   3. dist-probe/ is served by a server of its own and the probe world is played by the walkthrough every world
//      shares - tools/shot.mjs with E2E_WORLD=probe, which plays a world by its description alone
//      (tools/world-pass.mjs, ARCH-16): window.__game.items - one item of every kind of the world template (a chain, a
//      secret, a part of the artifact, a cutscene, the tour, the pet, the finale; E2E_WORLD_NEED=one) - each done in the
//      game the way its description says, with the checks of the layout, the voice, the requests and the save every
//      world gets, and every item still done after a reload. It is played twice (WALKS): in the mobile size with the
//      network and in the desktop size without it (E2E_OFFLINE=1), pictures in shots-e2e/worlds-probe/. Each run leaves
//      a report (E2E_WORLD_OUT) that this script reads: the pass came to its end in that size, with the network as
//      asked, and did an item of every kind.
//   4. In each of the two runs the page itself asked the server for every file of the probe world (a request of the
//      service worker filling its cache does not count, nor one of the download in the background): a file of a world
//      that the world never loads proves nothing about loading. Without network the browser's switch does not reach
//      the requests the service worker makes itself, so a file of the world its cache does not hold yet is still
//      fetched once there; that a world comes from the cache alone is the check of the part "cache" (5).
//   5. The cache of the next world (TECH-09), in a browser of its own with an empty cache, on the same server:
//      "launch" - the first world is opened; until "Play" is pressed nobody asks the server for a file of the probe
//      world and no download has started; "download" - "Play" is pressed, the game downloads the probe world in the
//      background: the download ends with the world ready, the cache holds exactly the files of worlds.json, each
//      asked for by its fingerprint; "offline" - the network is switched off, the probe world is opened: it is built
//      from the cache (every file of it answered by the service worker, the server asked for nothing), "Play" works
//      and its character gives a task - without a failed request, an error or a warning in the console. Before the
//      task the character greets with the world's own line: its clip is one of the world's own folder, it is answered
//      by the service worker and the line is not left to the synthesizer. The browser's
//      switch does not reach the requests the service worker makes itself: a file missing in the cache would still
//      be fetched, so "the server was asked for nothing" is the check that the world came from the cache.
//      Every wait is for an event or a state, with generous limits (E2E_SLOW multiplies them).
//   6. The transition between worlds (TECH-15), in a browser of its own, on the first world of the same build, once with
//      the bloom (?q=2) and once without (?q=0): the layer is stopped by window.__game.transition(p) in the middle of
//      its closing and on the loading screen, and each stop is a picture in shots-e2e/worlds-probe/
//      (transition-q<n>-mid.png, transition-q<n>-loading.png; without the bloom also the ring at 0 and at 1 and the
//      phone turned upright). Read from the pictures: the corners are covered and the middle is not, the hole is a
//      circle, the closed frame is one calm colour from side to side and the same on both paths (no bloom and no tone
//      curve on the layer), the ring grows with the progress, the world shows through the hole. Read from the game: the
//      layer costs one draw call a frame (frames with and without it in turn) and is not drawn outside a transition;
//      a transition started for real closes and opens in no less than 0.4 s of game time each and stays closed until
//      the world is said to be ready. The waits are for states too.
//   7. The change of world without a reload (TECH-15), in a browser of its own, on the first world of the same build.
//      "there and back": a mark is left in `window`, a character of the first world is asked something, and while its
//      line sounds `window.__game.travel('probe')` is called. Every frame of the change is recorded and read
//      (`travelFramesProblems`): behind the closed frame no line sounds, no music plays, the interface is hidden and
//      the controls are taken; the world changes only there. Then, in the probe world: the mark is alive (the page
//      was not reloaded), the heroine stands at its spawn facing its portal (its WorldDef.arrive for the first world) and walks, its character gives a task and the task is
//      solved, the names of the first world are gone from window.__game, its voices too, its wings and butterflies are
//      off the heroine and the flock, the music is the probe world's. The world's own line has its clip in the folder
//      of the world only while the probe world plays (`__game.clipFor`): none before the change, none after the way
//      back - the list of a world is taken back when it is left. window.__game.items is the description of the
//      world played: the first world's in the first world, the probe world's after the change (its tour of the
//      first entry is on), and the first world's again, the same, once the game is back in the first world. Back through the spot "portal home" of the probe
//      world (the action button): the first world is there again, not doubled (as many objects in the scene, on the
//      heroine and in the flock as the first time), the heroine where she was left, she walks, a character gives a
//      task and it is solved. After a reload of the page the progress of each world is in its own part of the save.
//      The probe world is a water world (WorldDef.move, kind "swim"): there the heroine keeps the height it declares
//      above the ground, stands in the clip Float and moves in the clip Swim (lent by the world from its own file, the
//      pelvis scaled as in the shared clips), the jump lifts her not and plays no Jump, there is no jump button, and the
//      wand she wears (put on in the first world, by the save) is hidden; back in the first world she walks and JUMPS
//      (her height rises and falls back, the clip Jump), the button and the wand are there again, the swimming clips
//      are gone (travel-swim-back.png, travel-swim-side.png: she swims, seen from behind and from the side).
//      Every change asks the gate of the world first (src/game/gate.ts, wired by src/main.ts): a world that is not
//      downloaded is let in "from the network" and downloaded in full behind the closed frame.
//      "the files are gone": in another browser the server answers 404 for every file of the probe world; the network
//      answers, the download does not make the world ready: the change answers false, the game is back in the first
//      world and the cat says that the network is needed by its recorded clip, the heroine walks and a character
//      gives a task; with the files back the change goes through. The console may hold only the 404s of those files
//      (and the game's one "could not load"); anywhere else an error or a warning is a failure.
//      "the closed portal" (R07, R12): in a browser that saves data (no download in the background) the probe world is
//      not in the cache and the network is off: the change is refused before the frame closes - no frame of the layer
//      is drawn, the controls stay free - the cat says "need_net" by its clip (not the synthesizer), the heroine walks,
//      a character gives a task; "the launch refused" (WORLD-01, R17): the save says she stopped in the probe world and
//      the page is loaded again without network - the first world opens, the save still names the probe world until
//      "Play", and after the entry the cat says "need_net" by its clip; "open from the cache": downloaded with the
//      network, the world is entered without it; "the launch where she stopped" (R27): loaded again without network,
//      the game opens in the probe world from the cache, the heroine where she stood, and she walks.
//      "Without network" is always the server's count after OFFLINE_MARK (`askedOffline`): none of the world's files.
//      "rounds" (TECH-15, R10, R19, R20, R22): in a browser that saves data, ROUNDS times "first world -> probe world
//      -> back"; the first change is by the network and must leave the world "ready" in the cache, its voice too, and
//      the middle of its closing is pictured (travel-mid.png, the game's clock stopped, not the debug stop of the
//      layer). After each round the garbage is collected and the heap in use, the geometries, the textures and the
//      programs of the renderer are read and printed (`readRound`, the same as tools/worlds-phone.mjs on the phone);
//      after the fifth none may be more than ROUND_GROWTH over the first. E2E_ROUNDS asks for more (the night's run,
//      nightly.yml: 20), and the later half of them is held to the same rule (`roundProblems`). Then the network goes off, the page is
//      reloaded: the progress of both worlds is where it was, and the probe world opens from the cache.
// A failed check of 1 or 2 ends the run before the walkthrough: there is nothing to play then.
//   8. The hub, the Great Tree (WORLD-01, `hubScenarios`): with the first world done (tools/e2e-saves.mjs HUB_SAVES)
//      she goes to the hub - its tour on the first entry, every point pictured; she at the arch of the fairies facing
//      the tree; the crystal's nest alone glows; the forest's arch leads to the probe world (the second world's
//      stand-in: the forest's place on the shelf), the other three sleep; its description is its tour alone (the short
//      template, decision Q4); no hint "to a new friend". Through the forest's arch by the action button to the probe
//      world and back to that arch, no second tour; a reload opens the hub where she stood. With the probe world done
//      too (and the sea, published 2026-11-24: in the probe build its arch opens after the probe world's), the forest's
//      and the sea's nests glow as well. Pictures shots-e2e/worlds-probe/hub-*.png (the tree with one and with two
//      artifacts: hub-tree-1.png, hub-tree-2.png).
//   9. The part "hub-grey" (tools/hub-grey.mjs): the grey build made anew (`--mode grey`, dist-grey/; the forest, the sea and
//      the Sweet Land in the registry) and the way between the hub and the forest played in it - which arches are open for
//      the fairies done and for the forest done, there and back through the arches, the hub's draw calls, the refusal
//      without network. Played alone it makes no probe build. Pictures shots-e2e/worlds-grey/way-*.png. A job of
//      ci.yml only: not before a publication (pages.yml plays PUBLISH_PARTS), the grey worlds are not published.
//  10. The part "sweet-grey" (tools/sweet-grey.mjs `passEnv`, `passProblems`): the grey build (made anew unless "hub-grey"
//      made it in this run) and the walkthrough of the Sweet Land by its description in it, the phone size
//      (E2E_WORLD=sweet E2E_WORLD_NEED=grey): from its entry to its finale - its chains, the two rubies in the world,
//      the tour, the finale. Pictures shots-e2e/worlds-grey/sweet/. A job of ci.yml only, as "hub-grey".
//  11. (The part "sea-grey" played the sea's walkthrough in the grey build until the sea was published: now part 14.)
//  12. The part "hub-forest" (tools/hub-grey.mjs `hubWay`): the way between the hub and the forest of part 9, played in
//      the published build (the forest published 2026-11-24) - the given one, or one made anew (once a run, with the
//      parts "walk" and "forest"). What the arches show follows the next worlds of that build (its worlds.json,
//      `hubExpect`): today the forest's alone, so with the forest done the sea's place still sleeps. A job of both
//      workflows: the way to a published world holds a publication. Played alone it makes no probe build. Pictures
//      shots-e2e/worlds-published/way-*.png.
//  13. The part "forest" (tools/forest-pass.mjs `passEnv`, `passProblems`): the walkthrough of the published forest by
//      its description in the published build, the phone size (E2E_WORLD=forest, the numbers of the world template):
//      from its entry to its finale - its chains with the task in the world and the two leaves in it, the tour, the
//      owlet, its four secrets, the finale. The build must list the forest among its next worlds (worlds.json). A job
//      of both workflows, beside the others (a walkthrough of a world takes up to 20 minutes on the runner). Every
//      published next world has a part of its own, named by its id: the part "walk" fails a published build that
//      lists a world without one (`publishedWithoutPart`), and so does a test of the sources. Played alone it makes
//      no probe build. Pictures shots-e2e/worlds-published/forest/.
//  14. The part "sea" (tools/sea-pass.mjs `passEnv`, `passProblems`): the same for the published sea (2026-11-24): its
//      chains with the two tasks in the world (the shell lock, the second half) and the two pearls in it, the
//      cutscenes, the tour, Bulchik, its four secrets, the finale. Pictures shots-e2e/worlds-published/sea/.
// Without "walk" the published build is neither made nor read (1 is the check of that part).
// Environment: E2E_PORT=<n> (the first port to try, default 4183; a busy one is skipped), E2E_GL, E2E_SLOW, Q,
// E2E_LEVEL, E2E_STUCK_MS (passed on to tools/shot.mjs), E2E_RUN_TIMEOUT_MS (limit of one walkthrough, default 600000;
// the forest's of part 13 and the sea's of part 14, default tools/sea-pass.mjs and tools/forest-pass.mjs PASS_TIMEOUT_MS;
// the Sweet Land's, tools/sweet-grey.mjs PASS_TIMEOUT_MS).
// Exit code: 0 — passed; 1 — a check failed (every failure is printed as "worlds: …"); 2 — bad arguments.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createSocket } from 'node:net';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDistSize, installedWorlds, sizeSummary } from './dist-size.mjs';
import { WORLDS_LIST } from './vite-worlds.mjs';
import { isVoice, worldOf } from './world-files.mjs';
import { ITEM_KINDS, reportProblems } from './world-pass.mjs';
import { HUB_SAVES } from './e2e-saves.mjs';
import { GREY_DIST, HUB_ARCH, HUB_ARRIVAL, buildWorlds, hubWay, serveDir } from './hub-grey.mjs';
import { passEnv as forestPassEnv, passProblems as forestPassProblems, passTimeoutMs as forestPassTimeoutMs } from './forest-pass.mjs';
import { passEnv as seaPassEnv, passProblems as seaPassProblems, passTimeoutMs as seaPassTimeoutMs } from './sea-pass.mjs';
import { passEnv as sweetPassEnv, passProblems as sweetPassProblems, passTimeoutMs as sweetPassTimeoutMs } from './sweet-grey.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The id of the probe world (src/worlds/probe/) and the mode of the build that lists it (vite.config.ts). */
export const PROBE = 'probe';
/** Its files, outside public/: copied into the probe build under the same paths. */
export const PROBE_FILES = 'worlds-test/probe';
/** The build of the probe world, next to dist/. */
export const PROBE_DIST = 'dist-probe';
/**
 * The characters of the probe world (src/worlds/probe/index.ts), in their order: the first gives a panel task and greets
 * with the world's own line, the second gives its task in the world.
 */
export const PROBE_CHARACTERS = ['friend', 'kit'];
/** The heading she arrives with in the probe world from the first one (src/worlds/probe/index.ts ARRIVAL: at the spawn 0,6, facing the portal at 7,3). */
export const PROBE_ARRIVAL_FACING = Math.atan2(7 - 0, 3 - 6);
/** The parts of a run, in the order they are played; both workflows list them as the jobs "worlds" (tools/ci-pieces.test.mjs). */
/**
 * The limit of one part played alone, as each part is played in CI: a job "worlds" of its own in ci.yml and pages.yml,
 * whose `timeout-minutes` is this (tools/ci-pieces.test.mjs). tools/e2e.mjs plays the parts so, one run each.
 */
export const PART_TIMEOUT_MS = 30 * 60000;
export const PARTS = ['walk', 'cache', 'transition', 'travel', 'hub', 'hub-grey', 'sweet-grey', 'hub-forest', 'forest', 'sea'];
/** The parts of the grey build (`--mode grey`, dist-grey/): they need neither the published build nor the probe one. */
export const GREY_PARTS = ['hub-grey', 'sweet-grey'];
/**
 * The parts played before a publication (.github/workflows/pages.yml): all but the grey build's (GREY_PARTS) - the grey
 * worlds are not published and must not hold a publication; main only gets a commit already green in ci.yml, which
 * plays every part.
 */
export const PUBLISH_PARTS = PARTS.filter((x) => !GREY_PARTS.includes(x));
/**
 * The next worlds of a published build (`next`: the ids of its worlds.json) that no part played before a publication
 * walks by its description: every published world has a part named by its id in PUBLISH_PARTS (the forest's, "forest").
 * [] when each has one.
 */
export function publishedWithoutPart(next, parts = PUBLISH_PARTS) {
  return next.filter((id) => !parts.includes(id));
}
/** The parts that need no probe build (dist-probe/): the grey build's, and the way to the forest and the walkthroughs of the published worlds in the published one. */
export const NO_PROBE_PARTS = [...GREY_PARTS, 'hub-forest', 'forest', 'sea'];
/** Where she arrives in the hub and where its arches stand: tools/hub-grey.mjs (the way to the forest uses them too). */
export { HUB_ARCH, HUB_ARRIVAL };
/** The short template of the hub (decision Q4): its tour alone - no chains, parts, scenes, finale, secrets or pet. */
export const HUB_NEED = { chain: 0, part: 0, scene: 0, finale: 0, secret: 0, pet: 0, flyover: 1 };

/**
 * The walkthroughs of the part "walk", in the order they are played: the size, whether the network is switched off
 * after the first load, and the level of the tasks (as the sizes of the first world: the phone plays level 3, the
 * computer the adaptive one; E2E_LEVEL sets one for both).
 */
export const WALKS = [{ size: 'mobile', offline: false, level: '3' }, { size: 'desktop', offline: true, level: '' }];

/**
 * The environment of one walkthrough of the probe world (tools/shot.mjs): `base` is the environment of this script,
 * `walk` one of WALKS, `o` - { commit, voiceOut, modelsOut, passOut }. The world is played by its description, which
 * must have one item of every kind (E2E_WORLD_NEED=one).
 */
export function walkEnv(base, walk, o) {
  return {
    ...base, E2E_WORLD: PROBE, E2E_WORLD_NEED: 'one', E2E_WORLD_OUT: o.passOut, E2E_ONLY: '', E2E_OFFLINE: walk.offline ? '1' : '0', E2E_MUTE: '0',
    E2E_OFFLINE_MARK: walk.offline ? OFFLINE_MARK : '',
    E2E_COMMIT: o.commit, E2E_VOICE_OUT: o.voiceOut, E2E_MODELS_OUT: o.modelsOut, E2E_LEVEL: base.E2E_LEVEL || walk.level,
  };
}

/**
 * Reads the arguments `[distDir] [--only <part>[,<part>...]]`: { dist, parts } - the folder as given (null: none) and
 * the parts to play in the order of PARTS (all of them without --only) - or { error }.
 */
export function readArgs(args) {
  let dist = null, only = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--only') {
      if (only) return { error: '--only is given twice' };
      const value = args[++i];
      if (value === undefined || value.startsWith('-')) return { error: `--only needs a part: ${PARTS.join(', ')}` };
      only = value.split(',');
      const unknown = only.filter((x) => !PARTS.includes(x));
      if (unknown.length) return { error: `unknown part "${unknown.join('", "')}" of --only: use ${PARTS.join(', ')}` };
    } else if (a.startsWith('-')) return { error: `unknown flag "${a}"` };
    else if (dist !== null) return { error: `a second folder "${a}"` };
    else dist = a;
  }
  return { dist, parts: PARTS.filter((x) => !only || only.includes(x)) };
}

/**
 * The height of the pelvis in the first key of the clip `clip` of the .glb `file`, as packed: the heroine's copies of
 * clips scale it (src/game/hero.ts), the change of world reads her copies against it.
 */
export async function pelvisKey(file, clip) {
  const { createIO } = await import('./assets.mjs');
  const doc = await (await createIO()).read(file);
  const ch = doc.getRoot().listAnimations().find((a) => a.getName() === clip)?.listChannels()
    .find((c) => c.getTargetNode()?.getName() === 'pelvis' && c.getTargetPath() === 'translation');
  if (!ch) throw new Error(`${file}: no translation of the pelvis in the clip "${clip}"`);
  return ch.getSampler().getOutput().getElement(0, [])[2];   // the UAL skeleton stands along z
}

/** Every file under `dir`, as paths relative to it with "/" between the folders, sorted. */
function filesOf(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile())
    .map((f) => join(f.parentPath, f.name).slice(dir.length + 1).split(sep).join('/')).sort();
}

/** The files of the probe world the probe build must hold: everything under worlds-test/probe/ but its README. */
export function probeFiles(from = join(root, PROBE_FILES)) {
  return filesOf(from).filter((f) => f !== 'README.md');
}

// A file of the world: a folder named after it (models/probe/…, story/probe/…) or its chunk (assets/probe-<hash>.js).
const FILE_MARK = new RegExp(`(^|/)${PROBE}(/|[-.])`);
// The world in the code, as it survives the minifier: its id as a string, its keys (probe_…), its paths (…/probe/…,
// probe/…). A bare word is not a mark: Three.js has a property of that name (light probes).
const CODE_MARK = new RegExp(`["'\`]${PROBE}["'\`]|${PROBE}_[a-z]|/${PROBE}\\b|\\b${PROBE}/`, 'g');
const TEXT = ['.js', '.mjs', '.css', '.html', '.json', '.webmanifest'];

/**
 * What a build holds of the probe world: `files` - paths of its own files, `code` - "<file>: <mark> x<n>" for every
 * text file with its marks. Both empty = the build has nothing of it.
 */
export function probeLeft(dir) {
  const all = filesOf(dir);
  const files = all.filter((f) => FILE_MARK.test(f));
  const code = [];
  for (const f of all.filter((x) => TEXT.includes(extname(x)))) {
    const found = readFileSync(join(dir, f), 'utf8').match(CODE_MARK);
    if (found) code.push(`${f}: ${[...new Set(found)].map((m) => `${m} x${found.filter((x) => x === m).length}`).join(', ')}`);
  }
  return { files, code };
}

/** The commit number a build shows in the parents' section (TECH-10: src/ui/ui.ts, #pCommit), or null. */
export function buildCommit(dir) {
  for (const f of filesOf(dir).filter((x) => x.endsWith('.js'))) {
    const m = /id="pCommit">(?:\$\{")?([0-9a-z-]+)/.exec(readFileSync(join(dir, f), 'utf8'));
    if (m) return m[1];
  }
  return null;
}

/** The published build must hold nothing of the probe world. Returns the problems, [] when it is clean. */
export function publishedProblems(dir) {
  const left = probeLeft(dir);
  return [
    ...left.files.map((f) => `the published build holds a file of the probe world: ${f}`),
    ...left.code.map((c) => `the published build holds the probe world in its code: ${c}`),
  ];
}

/**
 * The probe build must hold the world: each of `files` (relative to `from`) at the same path with the same bytes,
 * the world in its code, and the commit of the sources. Returns the problems, [] when it is right.
 */
export function probeBuildProblems(dir, from, files, commit) {
  const out = [];
  if (!files.length) out.push(`${PROBE_FILES}/ has no files: the probe world has nothing of its own to load`);
  for (const f of files) {
    const built = join(dir, f);
    if (!existsSync(built)) out.push(`the probe build has no ${f} (${PROBE_FILES}/${f})`);
    else if (!readFileSync(built).equals(readFileSync(join(from, f)))) out.push(`${f} of the probe build is not ${PROBE_FILES}/${f}`);
  }
  for (const f of files) if (!FILE_MARK.test(f)) out.push(`${PROBE_FILES}/${f} is not in a folder of its world (…/${PROBE}/…)`);
  const left = probeLeft(dir);
  if (!left.code.length) out.push('the probe build does not hold the probe world in its code: the registry did not list it (or the search for it finds nothing)');
  const shown = buildCommit(dir);
  if (shown !== commit) out.push(`version: the probe build shows commit "${shown}", but the sources are at "${commit}" (git rev-parse --short HEAD)`);
  return out;
}

/**
 * The files of `files` the page itself never asked for: `asked` is [{ path, referer, search }] as the server saw them.
 * A request with a query does not count: the world asks for its files by their plain addresses, the download of the
 * next world in the background (src/core/worldcache.ts) for `<file>?v=<fingerprint>` - it brings every file of the
 * list, loaded by the world or not.
 */
export function notAskedByPage(files, asked) {
  const fromPage = (referer) => { try { return !!referer && !/\/sw\.js$/.test(new URL(referer).pathname); } catch { return false; } };
  return files.filter((f) => !asked.some((r) => r.path === `/${f}` && !r.search && fromPage(r.referer)));
}

/** The requests of `asked` for a file of the world `id` (inside its folders: models/<id>/, voice/<id>/, story/<id>/), by anyone. */
export function askedOfWorld(asked, id) {
  return asked.filter((r) => worldOf(r.path.replace(/^\//, ''), [id]) === id);
}

/**
 * The path a walkthrough without network asks the server for right before it switches the network off
 * (tools/shot.mjs, E2E_OFFLINE_MARK). No file of the build: the server of this script answers it itself.
 */
export const OFFLINE_MARK = '/offline-mark';

/**
 * What the server was asked for without network: the requests of `asked` for a file of the world `id` that came after
 * the mark. A world played without network is built from the cache "worlds" alone, so there must be none - on a
 * machine where the service worker's own requests slip past the switch of the browser they reach the server, and a
 * world that was never in the cache looks played all the same. Returns { marked, late }: `marked` - the mark was
 * asked for at all; `late` - the paths asked for after it (after the last one, if there are several).
 */
export function askedOffline(asked, id, mark = OFFLINE_MARK) {
  const at = asked.map((r) => r.path).lastIndexOf(mark);
  return { marked: at >= 0, late: at < 0 ? [] : askedOfWorld(asked.slice(at + 1), id).map((r) => r.path) };
}

/** The files of `listed` ([{ url, revision }] of worlds.json) the download never asked the server for by their fingerprint. */
export function notDownloaded(listed, asked) {
  return listed.filter((f) => !asked.some((r) => r.path === `/${f.url}` && r.search === `?v=${f.revision}`)).map((f) => f.url);
}

/**
 * The requests of `asked` that reached the server though the game had to do without it. The browser's own check for
 * a new service worker is not one of them: at a navigation it may ask for the worker's script again (/sw.js) and for
 * the scripts that script imports (/workbox-<hash>.js, asked by /sw.js), whatever the page does, and switching the
 * network off for the pages does not stop it (seen on the CI runner: CI 44055935550). Nothing else is left out: a
 * file of the game or of a world asked by the worker - a route that went to the network - still counts.
 */
export function askedWithoutNetwork(asked) {
  const byWorker = (referer) => { try { return /\/sw\.js$/.test(new URL(referer).pathname); } catch { return false; } };
  const updateCheck = (r) => r.path === '/sw.js' || (byWorker(r.referer) && /^\/workbox-[0-9a-z]+\.js$/i.test(r.path));
  return asked.filter((r) => !updateCheck(r));
}

/** worlds.json of the build `dir`, or null when it cannot be read. */
export function readList(dir) {
  try { return JSON.parse(readFileSync(join(dir, WORLDS_LIST), 'utf8')); } catch { return null; }
}

/**
 * The build `dir` must list the world `id` for the game (worlds.json, tools/vite-worlds.mjs): exactly `files`, each
 * with the size and the SHA-256 of the file in the build; the service worker must precache the list (the game reads
 * it without network) and have a route into the cache the list names. Returns the problems, [] when it is right.
 */
export function listProblems(dir, id, files) {
  const list = readList(dir);
  if (!list) return [`the build has no ${WORLDS_LIST} to read: the game cannot tell which files the world "${id}" has`];
  const listed = list.worlds?.[id]?.files;
  if (!Array.isArray(listed)) return [`${WORLDS_LIST} does not list the world "${id}"`];
  const out = [];
  const urls = listed.map((f) => f.url);
  for (const f of files) if (!urls.includes(f)) out.push(`${WORLDS_LIST} does not list ${f} of the world "${id}"`);
  for (const u of urls) if (!files.includes(u)) out.push(`${WORLDS_LIST} lists ${u}, which is not a file of the world "${id}"`);
  for (const f of listed) {
    const built = join(dir, f.url);
    if (!existsSync(built)) { out.push(`${WORLDS_LIST} lists ${f.url}, but the build has no such file`); continue; }
    const bytes = readFileSync(built);
    if (f.size !== bytes.length) out.push(`${WORLDS_LIST}: ${f.url} is ${bytes.length} bytes, the list says ${f.size}`);
    if (f.revision !== createHash('sha256').update(bytes).digest('hex')) out.push(`${WORLDS_LIST}: the fingerprint of ${f.url} is not the SHA-256 of the file in the build`);
  }
  const sw = existsSync(join(dir, 'sw.js')) ? readFileSync(join(dir, 'sw.js'), 'utf8') : '';
  if (![...sw.matchAll(/url:\s*"([^"]+)"/g)].some((m) => m[1] === WORLDS_LIST)) out.push(`sw.js does not precache ${WORLDS_LIST}: the game could not read the list without network`);
  if (typeof list.cache !== 'string' || !sw.includes(`cacheName:"${list.cache}"`)) out.push(`sw.js has no route into the cache "${list.cache}" that ${WORLDS_LIST} names`);
  return out;
}

/**
 * The bytes of the voice of the core in the sources: the clips of public/voice itself and of the folders of the worlds of
 * the installation (`installed`, the hub: precached with the core), without the folders of the next worlds.
 */
export function coreVoiceBytes(dir = join(root, 'public/voice'), installed = installedWorlds()) {
  const clips = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).filter((f) => f.isFile() && f.name.endsWith('.mp3')).reduce((sum, f) => sum + statSync(join(d, f.name)).size, 0) : 0);
  return [dir, ...installed.map((id) => join(dir, id))].reduce((sum, d) => sum + clips(d), 0);
}

/**
 * The voice of the next world `id` in the build `dir` (TECH-09, R64, R79): `files` are the files of the world, `size`
 * what tools/dist-size.mjs counted in the build (`checkDistSize`), `core` the bytes of the voice of the core in the
 * sources (`coreVoiceBytes`). The world must have a clip of its own in voice/<id>/ - or its voice is tried on nothing;
 * every clip must be listed in worlds.json with its size (the game downloads the world by that list) and stay out of
 * the list of the installation (sw.js); the clips must be counted as the voice of the world, and the voice of the
 * core must be exactly `core` - no clip of the world among it. Returns the problems, [] when it is right.
 */
export function worldVoiceProblems(dir, id, files, size, core) {
  const clips = files.filter((f) => isVoice(f) && worldOf(f, [id]) === id);
  if (!clips.length) return [`the world "${id}" has no clip of its own in voice/${id}/: the voice of a next world is tried on nothing`];
  const out = [];
  const sw = existsSync(join(dir, 'sw.js')) ? readFileSync(join(dir, 'sw.js'), 'utf8') : '';
  const precached = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
  const listed = readList(dir)?.worlds?.[id]?.files ?? [];
  let bytes = 0;
  for (const f of clips) {
    if (!f.endsWith('.mp3')) out.push(`${f} is in the folder of the voice of the world "${id}" and is not a clip (.mp3)`);
    if (precached.includes(f)) out.push(`sw.js precaches ${f}: the voice of a next world is not part of the installation`);
    const built = existsSync(join(dir, f)) ? statSync(join(dir, f)).size : 0;
    bytes += built;
    const entry = listed.find((x) => x.url === f);
    if (!entry) out.push(`${WORLDS_LIST} does not list the clip ${f}: the game would not download it with the world "${id}"`);
    else if (!(entry.size > 0) || entry.size !== built) out.push(`${WORLDS_LIST} says the clip ${f} is ${entry.size} bytes, in the build it is ${built}`);
  }
  const counted = size.worlds?.find((w) => w.id === id)?.voice ?? 0;
  if (counted !== bytes) out.push(`the voice of the world "${id}" is counted as ${counted} bytes, its ${clips.length} clip(s) are ${bytes}: the clips of voice/${id}/ are not counted apart from the core`);
  if (size.voice !== core) out.push(`the voice of the core is ${size.voice} bytes in the build, the clips of public/voice are ${core}: a clip of the world "${id}" is counted with the core, or a clip of the core is not in the build`);
  return out;
}

// ---- pictures of the transition, as raw pixels: { data (RGBA), width, height } ----
const at = (img, x, y) => {
  const i = (Math.min(img.height - 1, Math.max(0, Math.round(y))) * img.width + Math.min(img.width - 1, Math.max(0, Math.round(x)))) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

/**
 * A picture of the closed frame must be one calm colour from side to side (it changes only from top to bottom) and
 * never dark. Returns the problems, [] when it is right.
 */
export function closedProblems(img) {
  const out = [];
  for (const f of [0.03, 0.25, 0.5, 0.75, 0.97]) {
    const y = Math.round((img.height - 1) * f), l = at(img, 2, y), r = at(img, img.width - 3, y);
    if (!near(l, r, 4)) out.push(`the closed frame is not one colour across the row ${y}: ${l} on the left, ${r} on the right - the layer does not cover the frame`);
    else if (Math.min(...l) < 120) out.push(`the closed frame is dark in the row ${y}: ${l}`);
  }
  return out;
}

/**
 * A picture of the middle of the closing (`mid`), read against the closed frame of the same size (`closed`, whose
 * left edge gives the colour of the layer in every row): the corners must be covered, the middle must not, and the
 * hole must be a circle around the middle - its half-width through the middle and 35% of the shorter side away from
 * it must fit one radius. Returns the problems, [] when it is right.
 */
export function irisProblems(mid, closed) {
  const { width: w, height: h } = mid, out = [];
  if (closed.width !== w || closed.height !== h) return [`the pictures are not of one size: ${w}x${h} and ${closed.width}x${closed.height}`];
  const covered = (x, y) => near(at(mid, x, y), at(closed, 2, y), 8);
  for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) {
    if (!covered(x, y)) out.push(`the corner ${x},${y} is not covered by the layer: ${at(mid, x, y)} there, ${at(closed, 2, y)} on the closed frame`);
  }
  const cx = Math.round(w / 2), cy = Math.round(h / 2);
  if (covered(cx, cy)) out.push(`the middle of the frame is covered (${at(mid, cx, cy)}): the iris has no hole`);
  if (out.length) return out;
  // From a point inside the hole along the longer side, to the first four covered pixels in a row.
  const wide = w >= h, d = Math.round(Math.min(w, h) * 0.35);
  const edge = (off, dir) => {
    for (let n = 0, row = 0; ; n++) {
      const x = wide ? cx + dir * n : cx + off, y = wide ? cy + off : cy + dir * n;
      if (x < 0 || y < 0 || x >= w || y >= h) return null;
      row = covered(x, y) ? row + 1 : 0;
      if (row === 4) return n - 3;
    }
  };
  const through = [edge(0, 1), edge(0, -1)], aside = [edge(d, 1), edge(d, -1), edge(-d, 1), edge(-d, -1)];
  if ([...through, ...aside].includes(null)) return ['the hole of the iris has no edge inside the frame along its longer side'];
  const r = (through[0] + through[1]) / 2, tol = 0.03 * r + 4, want = Math.sqrt(Math.max(0, r * r - d * d));
  // The world shows through the hole: along it the colours differ. One flat colour is a frame wiped by the layer.
  const inside = Array.from({ length: 33 }, (_, i) => { const t = Math.round((i / 32 - 0.5) * 1.6 * Math.min(...through)); return wide ? at(mid, cx + t, cy) : at(mid, cx, cy + t); });
  if (inside.every((c) => near(c, inside[0], 8))) out.push(`the hole is one flat colour (${inside[0]}): the layer is drawn instead of the frame, not over it`);
  if (Math.abs(through[0] - through[1]) > tol) out.push(`the hole is not around the middle: ${through[0]} px to one side, ${through[1]} px to the other`);
  if (aside.some((v) => Math.abs(v - want) > tol)) {
    out.push(`the hole is not a circle: ${r} px from the middle to its edge, and ${aside.join(', ')} px at ${d} px aside, where a circle has ${want.toFixed(1)} px`);
  }
  return out;
}

/**
 * `calls` - the draw calls of frames in a row, the layer stopped on the screen in every second one (the first is
 * without it). The world itself changes its count now and then, so only a frame with the layer between two frames
 * of one count is read: it must have exactly one call more. Returns the problems, [] when it is right.
 */
export function layerCallsProblems(calls) {
  const cost = [];
  for (let i = 0; i + 2 < calls.length; i += 2) if (calls[i] === calls[i + 2]) cost.push(calls[i + 1] - calls[i]);
  if (!cost.length) return [`the count of draw calls never stood still around a frame with the layer (${calls.join(', ')}): its cost cannot be read`];
  return cost.every((c) => c === 1) ? [] : [`the layer costs ${[...new Set(cost)].join(' and ')} draw call(s) a frame, it must cost exactly one and none outside a transition (frames without and with it in turn: ${calls.join(', ')})`];
}

/** How many pixels of a picture have the colours of the filled part of the loading ring (pink to violet: little green in them). */
export function ringPixels(img) {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) if (Math.max(img.data[i], img.data[i + 2]) - img.data[i + 1] > 85) n++;
  return n;
}

/** The largest difference of a colour between two pictures of the closed frame, over points away from the ring. */
export function layerDifference(a, b) {
  let most = 0;
  for (const fx of [0.03, 0.2, 0.8, 0.97]) for (const fy of [0.03, 0.25, 0.5, 0.75, 0.97]) {
    const p = at(a, (a.width - 1) * fx, (a.height - 1) * fy), q = at(b, (b.width - 1) * fx, (b.height - 1) * fy);
    most = Math.max(most, ...p.map((v, i) => Math.abs(v - q[i])));
  }
  return most;
}

/**
 * The frames of one change of world, as the scenario recorded them (one entry a frame, from the call of `travel` to
 * its end): { phase, closed, world, busy, going, speaking, line, music, shown } - the state of the transition, the id
 * of the world played, the flags of the game, is a line sounding and which the bubble holds, the first note of the
 * music that plays (null in silence) and the ids of the interface elements on the screen. `from` and `to` are the ids
 * of the world left and of the world asked for (for a change that must fail, `to` is `from`).
 * Returns the problems, [] when the change went as it must.
 */
export function travelFramesProblems(frames, from, to) {
  const out = [];
  const closed = frames.filter((f) => f.closed);
  if (!closed.length) return [`the frame was never closed in ${frames.length} frame(s) of the change: the world changed in sight, or did not change`];
  const first = frames.indexOf(closed[0]), last = frames.lastIndexOf(closed[closed.length - 1]);
  const once = (list, say) => { if (list.length) out.push(`${say} (in ${list.length} frame(s), the first: ${JSON.stringify(list[0])})`); };
  once(closed.filter((f) => f.speaking), 'a line still sounds behind the closed frame');
  once(closed.filter((f) => f.line !== null), 'the bubble still holds a line behind the closed frame');
  once(closed.filter((f) => f.music !== null), 'music plays behind the closed frame');
  once(closed.filter((f) => f.shown.length), 'the interface is on the screen over the closed frame');
  once(frames.filter((f) => f.going && !f.busy), 'the controls are free during the change');
  once(frames.slice(0, first).filter((f) => f.world !== from), `the world played is not "${from}" before the frame has closed`);
  once(frames.slice(last + 1).filter((f) => f.world !== to), `the world played is not "${to}" once the frame opens`);
  once(frames.slice(first, last + 1).filter((f) => !f.closed), 'the frame opened and closed again during one change');
  if (!frames.slice(last + 1).some((f) => f.phase === 'opening')) out.push('the frame did not open after it had closed: no frame of the opening was drawn');
  return out;
}

// ---- the rounds "first world -> probe world -> back" (TECH-15, R10, R19): the same on this machine and on the phone ----
/** The world the game starts in (src/worlds/index.ts DEFAULT_WORLD), where every round begins and ends. */
export const FIRST_WORLD = 'fairy';
/** How many rounds are played in a row. */
export const ROUNDS = 5;
/** How much each number after the last round may be over the same number after the first: 10 % (TECH-15). */
export const ROUND_GROWTH = 0.1;
/** What is read after a round and held to ROUND_GROWTH: the bytes of the JavaScript heap in use, the geometries and textures the renderer holds. */
export const ROUND_KEYS = ['heap', 'geometries', 'textures'];
/**
 * The shader programs are judged by their kinds, not by their number at one moment. The renderer compiles some
 * programs again and lets them go as the scene changes (seen on the CI runner and under software rendering here:
 * 47 or 58 programs after a round, the same kinds of program every time), so a count read at one moment swings by a
 * quarter while nothing leaks. A program that leaks is a kind that was never there before: the kinds of each round are
 * every program the renderer held in any frame of it (`watchPrograms`), and the last round may bring at most
 * ROUND_GROWTH new kinds over all the rounds before it. Not over the first two only: the renderer keeps some kinds
 * only in one of its two states (the count of 47 or 58), and on the CI runner both of the first two rounds can fall
 * in the smaller one (trial 44308695672) - the kinds of the other state then look new while nothing grows. A leak
 * brings kinds no round before has held; a state seen in any earlier round is no leak. A
 * program of a material of its own (ShaderMaterial) is keyed by the numbers the renderer gave its shaders when they
 * were first compiled, and a world entered again compiles them under new numbers: those numbers are left out of the
 * kind (`watchPrograms`), or every round would bring "new" kinds of the very same materials. Nor are the lights a
 * program was compiled for (`programKind`): the same material in the light of the other world was the "new" kinds of
 * 2026-11-19; the settings of the lights are judged on their own - one no round before had fails at once.
 */
export const ROUND_KINDS = 'kinds';

/** The most rounds E2E_ROUNDS may ask for: twenty is the night's run (nightly.yml); more is a study, not a check. */
export const ROUNDS_MOST = 50;

/**
 * How many rounds to play: E2E_ROUNDS, ROUNDS without it. Fewer than ROUNDS would leave the requirement unchecked,
 * so it is no number to ask for. Returns { rounds } or { error }.
 */
export function roundsWanted(env) {
  const raw = env.E2E_ROUNDS;
  if (raw === undefined || raw === '') return { rounds: ROUNDS };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < ROUNDS || n > ROUNDS_MOST) return { error: `bad E2E_ROUNDS "${raw}": a whole number from ${ROUNDS} to ${ROUNDS_MOST}` };
  return { rounds: n };
}

/**
 * How a new kind differs from the known kind of the same program closest to it: the places of its key (the renderer's
 * cache key, comma-separated) whose values differ, "#place: known -> new", for the nearest known key (fewest places).
 */
export function keyDiff(fresh, keys) {
  const key = keys[fresh];
  if (!key) return 'no key';
  const name = fresh.split(':')[0], parts = key.split(',');
  let best = null;
  for (const [k, other] of Object.entries(keys)) {
    if (k === fresh || k.split(':')[0] !== name || !other) continue;
    const o = other.split(',');
    const at = [];
    for (let i = 0; i < Math.max(parts.length, o.length); i++) if (parts[i] !== o[i]) at.push(`#${i}: ${o[i] ?? '-'} -> ${parts[i] ?? '-'}`);
    if (!best || at.length < best.at.length) best = { k, at };
  }
  return best ? `vs ${best.k}: ${best.at.slice(0, 6).join('; ')}${best.at.length > 6 ? ` (+${best.at.length - 6})` : ''}` : 'no known kind of this program';
}

/** The problems of one stretch of rounds: its last round against its first (each number) and against all before it (the kinds). */
function stretchProblems(rounds) {
  const out = [];
  const [a, z] = [rounds[0], rounds[rounds.length - 1]];
  const lost = rounds.find((r) => !Array.isArray(r[ROUND_KINDS]) || !r[ROUND_KINDS].length);
  if (lost) out.push(`the kinds of the shader programs were not read after round ${lost.round}: nothing to compare`);
  else {
    const isLight = (k) => k.startsWith('lights:');
    const before = rounds.slice(0, -1), known = new Set(before.flatMap((r) => r[ROUND_KINDS]));
    const fresh = z[ROUND_KINDS].filter((k) => !known.has(k) && !isLight(k)), size = [...known].filter((k) => !isLight(k)).length;
    const keys = Object.assign({}, ...rounds.map((r) => r.keys ?? {}));
    const how = (k) => (Object.keys(keys).length ? `; how the first differs - ${keyDiff(k, keys)}` : '');
    if (fresh.length > size * ROUND_GROWTH) {
      out.push(`after round ${z.round} the renderer holds ${fresh.length} kind(s) of shader program no round before held (rounds ${a.round}-${before[before.length - 1].round}: ${size} kinds; at most ${ROUND_GROWTH * 100} % new is allowed): ${fresh.join(', ')}${how(fresh[0])}`);
    }
    // A setting of the lights no round before had: the lights of a world left are still in the scene (each round one more).
    const light = z[ROUND_KINDS].filter((k) => !known.has(k) && isLight(k));
    if (light.length) out.push(`after round ${z.round} a program is compiled for lights no round before had (rounds ${a.round}-${before[before.length - 1].round}): ${light.join(', ')} - the lights of a world left behind? (the numbers: directional, point, spot, spot maps, hemisphere, area, then the shadows of each, the light probes, the type of the shadow map)`);
  }
  for (const k of ROUND_KEYS) {
    const bad = rounds.find((r) => !(Number.isFinite(r[k]) && r[k] > 0));
    if (bad) { out.push(`"${k}" was not read after round ${bad.round} (${bad[k]}): nothing to compare`); continue; }
    if (z[k] > a[k] * (1 + ROUND_GROWTH)) out.push(`after round ${z.round} "${k}" is ${z[k]}, after round ${a.round} it was ${a[k]}: ${(((z[k] / a[k]) - 1) * 100).toFixed(1)} % more, at most ${ROUND_GROWTH * 100} % is allowed - the worlds left are not freed`);
  }
  return out;
}

/**
 * The numbers after the rounds, [{ round, heap, geometries, textures, programs, kinds }] in order: `want` of them
 * (ROUNDS by default), each read. The first ROUNDS rounds are held to the requirement (TECH-15): each number after
 * round ROUNDS at most ROUND_GROWTH over the same after round 1, the kinds as `ROUND_KINDS` says.
 * A longer run (the night's twenty) is held to it a second time on its later half: from round want/2 + 1 to the last,
 * by the same rule. Not the last against the first: the heap of a game that leaks nothing still grows over twenty
 * rounds, by less each round (docs/perf.md: 17.66 -> 19.63 MB from round 2 to 20, 0.23 MB a round at the start, 0.04
 * in rounds 11-20 - the engine's compiled code and the renderer's tables, no object of a world), so 10 % over twenty
 * would fail a healthy game; a world that is not freed adds the same every round and shows in the later half as in
 * the first five. Each problem of the later half names its rounds. Returns the problems.
 */
export function roundProblems(rounds, want = ROUNDS) {
  if (rounds.length !== want) return [`${rounds.length} round(s) were read, expected ${want}`];
  const out = stretchProblems(rounds.slice(0, ROUNDS));
  if (want > ROUNDS) {
    const from = Math.floor(want / 2);
    const later = rounds.slice(from);
    out.push(...stretchProblems(later).map((x) => `the later half (rounds ${later[0].round}-${later[later.length - 1].round}): ${x}`));
  }
  return out;
}

/** One line of the log for the numbers after a round. */
export function roundLine(r) {
  return `round ${r.round}: heap ${(r.heap / 1048576).toFixed(2)} MB, geometries ${r.geometries}, textures ${r.textures}, programs ${r.programs} (${r[ROUND_KINDS]?.length ?? '?'} kinds in the round)`;
}

/**
 * The kind of a shader program, from the renderer's name and cache key (three.js WebGLPrograms.getProgramCacheKey),
 * and the setting of the lights it was compiled for. Self-contained: `watchPrograms` hands its source to the page.
 * - A material of its own (ShaderMaterial) is keyed by the numbers the renderer gave its two shaders when first
 *   compiled: the same material compiled again after its world was left gets new numbers. They are not the kind.
 * - The lights are not the kind either: the same material is compiled once for the lights of each world (the first
 *   world has a shadow of the sun and no point light, the probe world a point light and no shadow), and which of the
 *   two programs is still held when a round is read depends on what the camera saw last (2026-11-19, the runner: 51 or
 *   62 programs, the eleven "new" kinds of round 5 the materials in the other light). The twelve numbers of the lights
 *   (numDirLights ... numLightProbes, shadowMapType: places 32-43 after the precision, which opens the parameters) are
 *   returned as `lights` instead, and judged on their own: a light no round before had is a world's light left behind.
 */
export function programKind(name, cacheKey) {
  const parts = cacheKey.split(',');
  const own = /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1] ?? '');
  if (own) { parts[0] = 'own'; parts[1] = 'own'; }
  let lights = null;
  const at = parts.findIndex((x, i) => /^(high|medium|low)p$/.test(x) && /^[a-z0-9-]*$/.test(parts[i + 1] ?? '#'));
  if (at >= 0 && parts.length > at + 43) {
    lights = parts.slice(at + 32, at + 44).join('.');
    for (let i = at + 32; i < at + 44; i++) parts[i] = '*';
  }
  const key = parts.join(',');
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return { kind: `${name || (own ? 'own' : parts[0])}:${(h >>> 0).toString(36)}`, lights };
}

/**
 * From now on every frame notes the kinds of the shader programs the renderer holds (a kind: the name of the program
 * and a short hash of its key of the cache); `readRound` takes what was noted since the read before and starts anew.
 * Called once, before the first round begins.
 */
export async function watchPrograms(page) {
  await page.evaluate(([src]) => {
    const w = window;
    w.__programKinds = new Set();
    w.__programKeys = w.__programKeys || {};
    if (w.__programWatch) return;
    w.__programWatch = true;
    const programKind = new Function(`return (${src})`)();
    // The whole key of each kind, once: what tells a new kind from a known one (`keyDiff`).
    const note = (k, key) => { w.__programKinds.add(k); w.__programKeys[k] ??= key; };
    const tick = () => {
      for (const p of w.__game.renderer.info.programs ?? []) {
        const { kind, lights } = programKind(p.name, p.cacheKey);
        note(kind, p.cacheKey);
        if (lights !== null) note(`lights:${lights}`, lights);
      }
      requestAnimationFrame(tick);
    };
    tick();
  }, [programKind.toString()]);
}

/**
 * The numbers after a round, on `page` of the game with ?debug and `cdp`, a CDP session of that page: the garbage is
 * collected first (twice: what the first frees may let the second free more), then the heap in use is read, then what
 * the renderer holds. A tab in the background draws nothing: the phone's script keeps its tab in front.
 */
export async function readRound(page, cdp, round) {
  for (let i = 0; i < 2; i++) await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const held = await page.evaluate(() => {
    const info = window.__game.renderer.info;
    const kinds = window.__programKinds ? [...window.__programKinds].sort() : null;
    if (window.__programKinds) window.__programKinds = new Set();
    const keys = kinds && Object.fromEntries(kinds.map((k) => [k, window.__programKeys?.[k] ?? '']));
    return { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0, kinds, keys };
  });
  return { round, heap: usedSize, ...held };
}

/**
 * One round: `window.__game.travel` to the probe world, its tour skipped the way a tap skips it, and back to the first
 * world, each change settled and the heroine free. `until(fn, arg, what)` waits for a state of the page (each caller
 * its own limits). A change that does not answer true is a problem: returned, never guessed around.
 */
export async function playRound(page, until) {
  const out = [];
  for (const to of [PROBE, FIRST_WORLD]) {
    const ok = await page.evaluate((id) => window.__game.travel(id), to);
    if (ok !== true) { out.push(`__game.travel('${to}') answered ${ok}, expected true`); break; }
    await until(() => { const g = window.__game; if (g.flyoverPlayer?.active) g.flyoverPlayer.skip(); return !g.busy && !g.transitioning && !g.flyoverPlayer?.active; }, null, `the game stayed busy after the change to "${to}"`);
  }
  return out;
}

// ---- the run itself: only when this file is the script, not when a test imports it ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  const usage = (msg) => { console.error(`[worlds] ${msg}\nUsage: node tools/worlds.mjs [distDir] [--only <part>[,<part>...]]   parts: ${PARTS.join(', ')}`); process.exit(2); };
  const read = readArgs(process.argv.slice(2));
  if (read.error) usage(read.error);
  const args = [read.dist].filter((x) => x !== null);
  const play = (part) => read.parts.includes(part);
  const firstPort = Number(process.env.E2E_PORT || 4183);
  if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65000) usage(`bad E2E_PORT "${process.env.E2E_PORT}"`);
  const runTimeoutMs = Number(process.env.E2E_RUN_TIMEOUT_MS || 600000);
  if (!(runTimeoutMs > 0)) usage(`bad E2E_RUN_TIMEOUT_MS "${process.env.E2E_RUN_TIMEOUT_MS}"`);
  const wanted = roundsWanted(process.env);
  if (wanted.error) usage(wanted.error);
  const dist = resolve(args[0] ?? join(root, 'dist'));
  if (args[0] && !existsSync(join(dist, 'index.html'))) usage(`${dist} has no index.html: build the game first (npm run build)`);
  const probeDist = join(root, PROBE_DIST);
  if (dist === probeDist) usage(`${dist} is the folder of the probe build, not the published one`);

  const problems = [];
  const fail = (msg) => { problems.push(msg); console.error(`worlds: ${msg}`); };
  const end = () => {
    console.log(problems.length ? `[worlds] FAILED: ${problems.length} problem(s)` : '[worlds] PASSED');
    process.exit(problems.length ? 1 : 0);
  };
  // The commit of the sources, worked out the same way as in vite.config.ts and tools/e2e.mjs.
  const commit = (() => {
    try {
      const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return /^[0-9a-f]{4,40}$/.test(out) ? out : 'no-git';
    } catch { return 'no-git'; }
  })();

  let child = null;
  process.on('exit', () => { try { child?.kill('SIGKILL'); } catch { /* already gone */ } });
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => process.exit(code));
  const run = (cmd, argv, timeoutMs, env = process.env) => new Promise((res, rej) => {
    const cp = child = spawn(cmd, argv, { cwd: root, stdio: 'inherit', env });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; cp.kill('SIGKILL'); }, timeoutMs);
    cp.on('error', (e) => { clearTimeout(timer); child = null; rej(e); });
    cp.on('exit', (code, signal) => { clearTimeout(timer); child = null; res({ code, signal, timedOut }); });
  });
  const vite = async (what, ...argv) => {
    const { code, signal, timedOut } = await run(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', ...argv], 600000);
    if (code !== 0) throw new Error(`${what}: vite build ${argv.join(' ')} ${timedOut ? 'was killed after 600000 ms' : `exited with ${signal ?? `code ${code}`}`}`);
  };

  console.log(`[worlds] parts: ${read.parts.join(', ')}`);
  // ---- 1. the published build has nothing of the probe world ----
  // made once a run when no build is given: the part "walk" checks it, the part "hub-forest" plays in it
  let publishedBuilt = !!args[0];
  const publishedBuild = async () => { if (!publishedBuilt) { await vite('the published build'); publishedBuilt = true; } };
  if (!play('walk')) console.log('[worlds] the published build: not checked - it is the check of the part "walk"');
  else try {
    await publishedBuild();
    const left = publishedProblems(dist);
    for (const p of left) fail(p);
    // a world published with no walkthrough of its own before a publication: the part of its id is left out
    for (const id of publishedWithoutPart(buildWorlds(dist))) fail(`the published build lists the next world "${id}" (worlds.json), but no part of tools/worlds.mjs plays it before a publication: a part "${id}" in PUBLISH_PARTS (tools/forest-pass.mjs as its pattern)`);
    if (!left.length) console.log(`[worlds] the published build (${args[0] ? 'as given' : 'made anew'}): nothing of the probe world in ${filesOf(dist).length} files`);
  } catch (e) { fail(e.message); }

  // A port is free when neither address of localhost has it, as in tools/e2e.mjs: its preview server may hold the IPv6 one.
  const canBind = (port, host) => new Promise((res) => {
    const s = createSocket();
    s.once('error', (e) => res(e.code !== 'EADDRINUSE'));   // e.g. no IPv6 on this machine: not "busy"
    s.listen({ port, host, exclusive: true }, () => s.close(() => res(true)));
  });
  /** The first free port from E2E_PORT on (50 tried); none - the run fails. */
  const freePort = async () => {
    let port = firstPort;
    while (!(await canBind(port, '127.0.0.1') && await canBind(port, '::1'))) if (++port > firstPort + 50) { fail(`no free port in ${firstPort}..${firstPort + 50}`); end(); }
    return port;
  };

  // ---- the part "hub-grey": the way between the hub and the forest in the grey build (tools/hub-grey.mjs) ----
  // Its own build (`--mode grey`, dist-grey/) and server; the probe build is not made for it alone. The part
  // "sweet-grey" plays in the same build: it is made once a run.
  let greyBuilt = false;
  const greyDist = join(root, GREY_DIST);
  /** The browser of the parts of the way to the forest: nothing but this machine is reached (the refusal without network rests on it too). */
  const wayBrowser = async () => {
    const GL_ARGS = { gl: ['--use-angle=gl', '--enable-gpu'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
    const gl = process.env.E2E_GL || 'gl';
    if (!GL_ARGS[gl]) throw new Error(`unknown E2E_GL="${gl}": use "gl" or "swiftshader"`);
    const { chromium } = await import('playwright-core');
    return chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
      args: [...GL_ARGS[gl], '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  };
  const greyBuild = async () => {
    if (greyBuilt) return;
    rmSync(greyDist, { recursive: true, force: true });
    await vite('the grey build', '--mode', 'grey', '--outDir', GREY_DIST);
    greyBuilt = true;
  };
  if (play('hub-grey')) try {
    await greyBuild();
    const greyPort = await freePort();
    const server = await serveDir(greyDist, greyPort);
    console.log(`[worlds] ${GREY_DIST}/ served on http://127.0.0.1:${greyPort}/`);
    const browser = await wayBrowser();
    try {
      const wrong = await hubWay(browser, `http://127.0.0.1:${greyPort}/`, join(root, 'shots-e2e', 'worlds-grey'), { slow: process.env.E2E_GL === 'swiftshader', next: buildWorlds(greyDist) });
      for (const p of wrong) fail(`the way between the hub and the forest: ${p}`);
    } finally { await browser.close(); server.close(); }
  } catch (e) { fail(e.message); }
  // ---- the part "hub-forest": the same way in the published build (the forest published, tools/hub-grey.mjs) ----
  if (play('hub-forest')) try {
    await publishedBuild();
    const next = buildWorlds(dist);
    if (!next.includes('forest')) throw new Error(`the published build ${dist} has no forest among its next worlds (worlds.json: ${JSON.stringify(next)})`);
    const port = await freePort();
    const server = await serveDir(dist, port);
    console.log(`[worlds] the published build served on http://127.0.0.1:${port}/ for the way to the forest (next worlds: ${next.join(', ')})`);
    const browser = await wayBrowser();
    try {
      const wrong = await hubWay(browser, `http://127.0.0.1:${port}/`, join(root, 'shots-e2e', 'worlds-published'), { slow: process.env.E2E_GL === 'swiftshader', next });
      for (const p of wrong) fail(`the way between the hub and the forest of the published build: ${p}`);
    } finally { await browser.close(); server.close(); }
  } catch (e) { fail(e.message); }
  /**
   * The walkthrough of a whole world by its description (tools/shot.mjs, the phone size) in the build `dir`, served
   * anew: `env` its environment with the report at `out`, `ms` its limit, `problemsOf` the check of the report.
   */
  const worldPass = async (name, dir, shots, env, ms, problemsOf, done) => {
    const port = await freePort();
    const server = await serveDir(dir, port);
    console.log(`[worlds] ${relative(root, dir) || dir}/ served on http://127.0.0.1:${port}/ for ${name}`);
    try {
      mkdirSync(join(root, shots), { recursive: true });
      const out = join(root, shots, 'pass-mobile.json');
      rmSync(out, { force: true });
      const { code, signal, timedOut } = await run(process.execPath, [join(root, 'tools/shot.mjs'), `http://127.0.0.1:${port}/`, shots, 'mobile'], ms, env(out));
      if (timedOut) fail(`the walkthrough of ${name} was killed after ${ms} ms (its PASS_TIMEOUT_MS, or E2E_RUN_TIMEOUT_MS when set)`);
      else if (code !== 0) fail(`the walkthrough of ${name} failed: tools/shot.mjs exited with ${signal ?? `code ${code}`} — see ERRORS above`);
      else {
        const wrong = problemsOf(existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null);
        for (const p of wrong) fail(`the walkthrough of ${name}: ${p}`);
        if (!wrong.length) console.log(`[worlds] ${done}`);
      }
    } finally { server.close(); }
  };
  // ---- the part "sweet-grey": the walkthrough of the Sweet Land by its description in the grey build (tools/sweet-grey.mjs) ----
  if (play('sweet-grey')) try {
    await greyBuild();
    await worldPass('the Sweet Land', greyDist, join('shots-e2e', 'worlds-grey', 'sweet'), (out) => sweetPassEnv(process.env, out), sweetPassTimeoutMs(process.env), sweetPassProblems,
      'the Sweet Land of the grey build: played by its description from its entry to its finale');
  } catch (e) { fail(e.message); }
  // ---- the part "forest": the walkthrough of the published forest in the published build (tools/forest-pass.mjs) ----
  // a job of its own in both workflows: a publication waits for it. A build without the forest among its next worlds fails
  // here - the part must not be green over a world the build does not have.
  if (play('forest')) try {
    await publishedBuild();
    const next = buildWorlds(dist);
    if (!next.includes('forest')) throw new Error(`the published build ${dist} has no forest among its next worlds (worlds.json: ${JSON.stringify(next)})`);
    await worldPass('the forest', dist, join('shots-e2e', 'worlds-published', 'forest'), (out) => forestPassEnv(process.env, out), forestPassTimeoutMs(process.env), forestPassProblems,
      'the forest of the published build: played by its description from its entry to its finale, its four secrets found');
  } catch (e) { fail(e.message); }
  // ---- the part "sea": the walkthrough of the published sea in the published build (tools/sea-pass.mjs) ----
  // as the forest's; the sea's own limit: the longest walkthrough seen on the runner (tools/sea-pass.mjs PASS_TIMEOUT_MS)
  if (play('sea')) try {
    await publishedBuild();
    const next = buildWorlds(dist);
    if (!next.includes('sea')) throw new Error(`the published build ${dist} has no sea among its next worlds (worlds.json: ${JSON.stringify(next)})`);
    await worldPass('the sea', dist, join('shots-e2e', 'worlds-published', 'sea'), (out) => seaPassEnv(process.env, out), seaPassTimeoutMs(process.env), seaPassProblems,
      'the sea of the published build: played by its description from its entry to its finale, its four secrets found');
  } catch (e) { fail(e.message); }
  if (read.parts.every((x) => NO_PROBE_PARTS.includes(x))) end();

  // ---- 2. the probe build, made anew ----
  const from = join(root, PROBE_FILES);
  let files = [];
  try {
    rmSync(probeDist, { recursive: true, force: true });   // never play the build of an earlier run
    await vite('the probe build', '--mode', PROBE, '--outDir', PROBE_DIST);
    files = probeFiles(from);
    const size = checkDistSize(probeDist);
    const core = coreVoiceBytes();
    const wrong = [...probeBuildProblems(probeDist, from, files, commit), ...listProblems(probeDist, PROBE, files), ...size.problems.map((p) => `the size of the probe build: ${p}`),
      ...worldVoiceProblems(probeDist, PROBE, files, size, core).map((p) => `the voice of the probe world: ${p}`)];
    for (const p of wrong) fail(p);
    if (!wrong.length) {
      console.log(`[worlds] the probe build: ${files.join(', ')}; the world is in its code; commit ${commit}; ${WORLDS_LIST} lists its files, sw.js precaches none of them`);
      console.log(`[worlds] the size of the probe build: ${sizeSummary(size)}`);
      console.log(`[worlds] the voice of the probe world: ${files.filter(isVoice).join(', ')} - ${size.worlds.find((w) => w.id === PROBE).voice} bytes, listed in ${WORLDS_LIST}, not in the installation; the voice of the core: ${size.voice} bytes, as in public/voice (${core})`);
    }
  } catch (e) { fail(e.message); }
  if (problems.length) end();

  // ---- 3. the probe build on a server of its own; a missing file is a 404, as on real hosting ----
  const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg',
  };
  const asked = [];   // every request answered with a file: its path, its query and who asked (the page or the service worker)
  let blocked = null;   // the id of a world whose files the server does not have for a while (the scenario "the files are gone")
  const server = createServer((req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    // the mark of a walkthrough without network: noted in its place among the requests, answered with nothing
    if (path === OFFLINE_MARK) { asked.push({ path, referer: req.headers.referer ?? '', search: '' }); res.writeHead(204, { 'Cache-Control': 'no-store' }).end(); return; }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(probeDist, path));
    if (blocked && worldOf(path.replace(/^\//, ''), [blocked]) === blocked) { res.writeHead(404).end(); return; }
    if (!file.startsWith(probeDist + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    asked.push({ path, referer: req.headers.referer ?? '', search: new URL(req.url, 'http://x').search });
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  });
  const port = await freePort();
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const url = `http://127.0.0.1:${port}/`;
  console.log(`[worlds] ${PROBE_DIST}/ served on ${url}`);

  // ---- the walkthrough every world shares: the probe world by its description, in each size of WALKS ----
  const shots = join('shots-e2e', `worlds-${PROBE}`);
  mkdirSync(join(root, shots), { recursive: true });
  if (play('walk')) try {
    for (const walk of WALKS) {
      const name = `the walkthrough of the world "${PROBE}" in the ${walk.size} size${walk.offline ? ' without network' : ''}`;
      const voiceOut = join(root, shots, `voice-${walk.size}.json`), passOut = join(root, shots, `pass-${walk.size}.json`);
      for (const f of [voiceOut, passOut]) rmSync(f, { force: true });   // never read the report of an earlier run
      const from = asked.length, t0 = Date.now();
      const env = walkEnv(process.env, walk, { commit, voiceOut, passOut, modelsOut: join(root, shots, `models-requested-${walk.size}.json`) });
      const { code, signal, timedOut } = await run(process.execPath, [join(root, 'tools/shot.mjs'), url, shots, walk.size], runTimeoutMs, env);
      if (timedOut) { fail(`${name} was killed after ${runTimeoutMs} ms (E2E_RUN_TIMEOUT_MS)`); continue; }
      if (code !== 0) { fail(`${name} failed: tools/shot.mjs exited with ${signal ?? `code ${code}`} — see ERRORS above`); continue; }
      const read = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
      // Written only by a walkthrough that came to its end with the voice checked.
      const voice = read(voiceOut);
      if (!voice) fail(`${name} left no report about the voice: it did not come to its end`);
      else if (!(voice.loud > 0)) fail(`${name} started ${voice.loud} of ${voice.clips} clips with a volume`);
      // Written only by a pass that did every item of the description: in this size, with the network as asked.
      const pass = read(passOut);
      const wrong = reportProblems(pass, { world: PROBE, size: walk.size, offline: walk.offline, kinds: ITEM_KINDS, inWorld: true });
      for (const p of wrong) fail(`${name}: ${p}`);
      // ---- 4. the page asked for every file of the world ----
      const mine = asked.slice(from);
      // A clip of the world's voice is asked for when its line is said. Without network that is after the switch: the
      // cache answers and the server never hears of it - there the pass itself fails on a line left to the
      // synthesizer, and the part "cache" checks that the service worker answered the clip.
      const due = walk.offline ? files.filter((f) => !isVoice(f)) : files;
      const missed = notAskedByPage(due, mine);
      for (const f of missed) fail(`${name}: the page never asked for ${f}: the world does not load its own file`);
      // ---- without network the world is built from the cache alone: nothing of it is asked of the server any more ----
      const off = walk.offline ? askedOffline(mine, PROBE) : { marked: true, late: [] };
      if (!off.marked) fail(`${name}: the walkthrough never said it switched the network off (the server was not asked for ${OFFLINE_MARK}): what was asked without network is not known`);
      for (const f of off.late) fail(`${name}: with the network switched off the server was still asked for ${f}: the world was not built from the cache "worlds"`);
      if (voice && !wrong.length && !missed.length && off.marked && !off.late.length) {
        console.log(`[worlds] the world "${PROBE}" played by its description in the ${walk.size} size ${walk.offline ? 'without network' : 'with the network'}: `
          + `${pass.items.length} items, an item of every kind (${pass.items.map((i) => `${i.kind} ${i.id}`).join(', ')}), done in the order ${pass.order.join(', ')}; `
          + `${voice.loud} of ${voice.clips} clips with a volume; the page asked for ${due.join(', ')}${due.length < files.length ? ` and was answered ${files.filter((f) => !due.includes(f)).join(', ')} from the cache` : ''} (the server was asked for the files of the world ${askedOfWorld(mine, PROBE).length} times${walk.offline ? ', none of them with the network switched off' : ''}); `
          + `${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
    }
  } catch (e) {
    fail(`${e.stack ?? e}`);
  }
  // ---- 5. the cache of the next world ----
  if (play('cache')) try {
    const summary = await cacheScenarios({ url, asked, list: readList(probeDist), fail });
    if (summary) console.log(`[worlds] ${summary}`);
  } catch (e) {
    fail(`the cache of the world "${PROBE}": ${e.stack ?? e}`);
  }
  // ---- 6. the transition between worlds ----
  if (play('transition')) try {
    const summary = await transitionScenarios({ url, shots, fail });
    if (summary) console.log(`[worlds] ${summary}`);
  } catch (e) {
    fail(`the transition: ${e.stack ?? e}`);
  }
  // ---- 7. the change of world without a reload ----
  if (play('travel')) try {
    const summary = await travelScenarios({ url, shots, asked, list: readList(probeDist), fail, block: (id) => { blocked = id; }, rounds: wanted.rounds });
    if (summary) console.log(`[worlds] ${summary}`);
  } catch (e) {
    fail(`the change of world: ${e.stack ?? e}`);
  } finally {
    blocked = null;
  }
  // ---- 8. the hub ----
  if (play('hub')) try {
    const summary = await hubScenarios({ url, shots, fail });
    if (summary) console.log(`[worlds] ${summary}`);
  } catch (e) {
    fail(`the hub: ${e.stack ?? e}`);
  }
  server.close(); server.closeAllConnections();
  end();
}

/**
 * The hub, the Great Tree (WORLD-01, R02, R30, R32; 8 above), on the probe build served at `url`, in the mobile size;
 * the pictures go to `shots` (hub-*.png). Two saves (tools/e2e-saves.mjs HUB_SAVES):
 * "one" - the first world done, the hub never visited: launched in the first world, she goes to the hub
 * (`__game.travel`). There its tour plays on the first entry (a picture of every point, then a tap ends it), she
 * stands at the arch of the fairies facing the tree, the crystal's nest alone glows, the arch of the forest leads to
 * the probe world (the second world's stand-in) and the other three sleep; its description has the tour alone (the
 * short template). Walked up to, the arch of the forest takes her to the probe world by its action button; back in the
 * hub (no tour any more) she stands at the arch of the forest. A reload launches the game in the hub, where she stood.
 * "two" - the probe world done too, launched in the hub: the forest's nest glows as well (a picture of the tree).
 * No error, warning or failed request in the console. Returns the line to print, '' after a failure.
 */
async function hubScenarios({ url, shots, fail: report }) {
  let failures = 0;
  const fail = (msg) => { failures++; report(`the hub: ${msg}`); };
  const { chromium } = await import('playwright-core');
  const GL_ARGS = { gl: ['--use-angle=gl', '--enable-gpu'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  const gl = process.env.E2E_GL || 'gl';
  if (!GL_ARGS[gl]) throw new Error(`unknown E2E_GL="${gl}": use "gl" or "swiftshader"`);
  const slow = Number(process.env.E2E_SLOW || 1);
  const T = (ms) => Math.round(ms * slow); /* clock: helper */
  const origin = new URL(url).origin;
  const q = process.env.Q ? `&q=${process.env.Q}` : '';
  const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };
  const started = Date.now(); /* clock: log-time */
  const told = [];
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome', headless: true,
    args: [...GL_ARGS[gl], '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  try {
    /** A page of the game with `save` in a context of its own (the gift of a new day held, as in tools/shot.mjs). */
    const open = async (name, save) => {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      await ctx.addInitScript((s) => { if (!localStorage.getItem('amw-save')) localStorage.setItem('amw-save', s); sessionStorage.setItem('amw-gift-hold', '1'); }, JSON.stringify(save));
      await ctx.route((u) => !own(u.href), (route) => route.abort());
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') fail(`${name}: console ${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => fail(`${name}: pageerror: ${e.message}`));
      page.on('requestfailed', (r) => fail(`${name}: request failed: ${r.url()} (${r.failure()?.errorText})`));
      page.on('response', (r) => { if (r.status() >= 400) fail(`${name}: HTTP ${r.status()} for ${r.url()}`); });
      const g = (fn, arg) => page.evaluate(fn, arg);
      const until = (fn, arg, what, ms = 60000) => page.waitForFunction(fn, arg, { timeout: T(ms) }).catch(() => { throw new Error(`${name}: ${what}`); }); /* clock: helper */
      /**
       * `s` seconds of game time (the camera of a held point settles by it). The game's time runs at most 0.05 s a frame
       * (src/game/loop.ts): on the runners' software rendering, about a frame a second, a game second is some 20 s.
       * Not reached - what held the game is told: its flags, the cards and scenes on screen, how far its time went.
       */
      const gameSeconds = async (sec) => {
        const t0 = await g(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); return __game.time; });
        const started = Date.now(); /* clock: log-time */
        await page.waitForFunction((t) => __game.time > t, t0 + sec, { timeout: T(Math.max(60000, sec * 30000)) }).catch(async () => { /* clock: helper */
          const held = await g(() => {
            const shown = (id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };
            const G = __game, why = ['busy', 'paused', 'still', 'transitioning', 'dark'].filter((k) => G[k] === true);
            for (const id of ['fanfare', 'task', 'cauldron', 'reload']) if (shown(id)) why.push(`#${id} shown`);
            if (G.story?.active) why.push('a story plays');
            if (G.flyoverPlayer?.active) why.push('a tour flies');
            if (document.hidden) why.push('the page hidden');
            return { why, time: G.time, frames: window.__frames };
          });
          const s = (Date.now() - started) / 1000; /* clock: log-time */
          throw new Error(`${name}: the game stopped: ${held.why.join(', ') || 'nothing held it'}; its time went ${(held.time - t0).toFixed(2)} s of ${sec} in ${s.toFixed(0)} s, ${held.frames} frames`);
        });
      };
      /** "Play"; the scenes of a start (a cutscene, the tour of the first world, an achievement) are left to `keepTour`. */
      const play = async (keepTour) => {
        await page.locator('#play').waitFor({ state: 'visible', timeout: T(240000) }); /* clock: page-load */
        await until(() => typeof window.__game?.travel === 'function' && __game.time > 0, null, 'no window.__game with ?debug', 30000);
        await page.click('#play');
        await until((keep) => {
          if (__game.story?.active) { __game.story.skip(); return false; }
          if (__game.flyoverPlayer?.active) { if (keep) return true; __game.flyoverPlayer.skip(); return false; }
          if (!document.querySelector('#fanfare').classList.contains('hidden')) { document.querySelector('#fanfareOk')?.click(); return false; }
          return !__game.busy;
        }, keepTour, 'the game stayed busy after "Play"');
      };
      /** She is in the world `id`, its change over, the heroine given back (the tour of a first entry left to `keepTour`). */
      const inWorld = (id, keepTour = false) => until(([w, keep]) => __game.world === w && !__game.transitioning && (keep && __game.flyoverPlayer?.active || !__game.busy), [id, keepTour], `not in the world "${id}"`, 120000);
      const at = () => g(() => ({ x: __game.hero.root.position.x, z: __game.hero.root.position.z, heading: __game.hero.heading }));
      const near = (p, want, what) => { if (Math.hypot(p.x - want.x, p.z - want.z) > 1.5) fail(`${name}: ${what}: she stands at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}, not at ${want.x.toFixed(1)}, ${want.z.toFixed(1)}`); };
      const facing = (p, want, what) => { if (Math.cos(p.heading - want) < 0.9) fail(`${name}: ${what}: she faces ${p.heading.toFixed(2)}, not ${want.toFixed(2)} (toward the tree)`); };
      const shot = async (file) => { await page.screenshot({ path: join(root, shots, file) }); };
      return { page, g, until, gameSeconds, play, inWorld, at, near, facing, shot, close: () => ctx.close() };
    };

    // ----- "one": the first world done, the hub not visited -----
    {
      const p = await open('one artifact', HUB_SAVES.one());
      await p.page.goto(`${url}?debug${q}`);
      await p.play(false);
      if ((await p.g(() => __game.world)) !== FIRST_WORLD) fail(`one artifact: launched in "${await p.g(() => __game.world)}", not in the first world`);
      // every line the cat shows from here on, frame by frame (the hub has no friend to send her to)
      await p.g(() => { const seen = window.__hubLines = new Set(); const look = () => { if (__game.line) seen.add(__game.line); requestAnimationFrame(look); }; look(); });
      if ((await p.g(() => __game.travel('hub'))) !== true) throw new Error('one artifact: the change of world to the hub was refused');
      await p.inWorld('hub', true);
      // the tour of the first entry: from the roots up to the crystal's nest, round the arches - a picture of each point
      if (!(await p.g(() => __game.flyoverPlayer?.active === true))) fail('one artifact: no tour of the hub on its first entry');
      else {
        const n = await p.g(() => __game.flyoverPlayer.times.length);
        for (let i = 0; i < n; i++) {
          await p.g((k) => __game.flyoverPlayer.hold(k), i);
          await p.gameSeconds(0.8);   // the camera settles on the held point
          await p.shot(`hub-tour-${i}.png`);
          if (i === 2) await p.shot('hub-tree-1.png');   // the tree over the glade, the crystal's nest on its side
        }
        // the arch of the world that opened (the forest's: the probe world's) is held asleep to be pictured waking
        await p.g(() => __game.hub.wake(0));
        await p.g(() => __game.flyoverPlayer.skip());
        told.push(`its tour on the first entry (${n} points pictured)`);
      }
      // where she arrived, read before the arch wakes (she turns to it as it does)
      const arrived = await p.at();
      // ---- the forest's arch wakes once she is free (docs/worlds/hub.md, step 4): pictured asleep, half, awake ----
      {
        await p.until(() => __game.hub.wake().on, null, 'one artifact: the forest\'s arch did not start to wake after the tour', 60000);
        const w = await p.g(() => ({ ...__game.hub.wake(), busy: __game.busy, focus: !!__game.cam.focus }));
        if (JSON.stringify(w.shelves) !== '[1]') fail(`one artifact: the arches waking are ${JSON.stringify(w.shelves)}, not the forest's alone`);
        if (!w.busy || !w.focus) fail(`one artifact: while the arch wakes the controls are ${w.busy ? 'held' : 'free'} and the camera ${w.focus ? 'on it' : 'behind her'}`);
        for (const [t, file] of [[0, 'hub-wake-0.png'], [0.5, 'hub-wake-1.png'], [1, 'hub-wake-2.png']]) {
          await p.g((k) => __game.hub.wake(k), t);
          await p.gameSeconds(0.6);
          await p.shot(file);
        }
        await p.g(() => __game.hub.wake(null));
        await p.inWorld('hub');
        const after = await p.g(() => ({ flag: __game.save.worlds.hub?.flags?.woke1 === true, on: __game.hub.wake().on, focus: !!__game.cam.focus }));
        if (!after.flag || after.on || after.focus) fail(`one artifact: after waking the flag woke1 is ${after.flag}, still waking: ${after.on}, the camera on the arch: ${after.focus}`);
        told.push('the forest\'s arch woke after the tour, the controls held and the camera on it, marked woke1 (pictures hub-wake-0..2.png)');
      }
      const look = await p.g(() => ({ nests: __game.hub.nests(), portals: __game.hub.portals().map((x) => x.world), toured: __game.save.worlds.hub?.flags?.toured === true }));
      const lacks = await p.g((need) => __game.missing(need), HUB_NEED);
      const pos = arrived;
      p.near(pos, HUB_ARRIVAL[0], 'come from the first world'); p.facing(pos, HUB_ARRIVAL[0].facing, 'come from the first world');
      if (JSON.stringify(look.nests) !== JSON.stringify([true, false, false, false, false])) fail(`one artifact: the nests ${JSON.stringify(look.nests)}, the crystal's alone should glow`);
      if (JSON.stringify(look.portals) !== JSON.stringify([FIRST_WORLD, PROBE, null, null, null])) fail(`one artifact: the arches lead to ${JSON.stringify(look.portals)}, not the fairies', the probe world behind the forest's and three asleep`);
      if (!look.toured) fail('one artifact: the tour of the hub is not marked in its part of the save');
      if (lacks?.length) fail(`one artifact: the description of the hub against its short template: ${lacks.join('; ')}`);
      // the counter by the hub's own icon: the artifacts back on the tree, not the shards of a world
      const icon = () => p.g(() => document.getElementById('crystals')?.parentElement?.querySelector('span')?.textContent ?? null);
      if ((await icon()) !== '🌳') fail(`one artifact: the counter of the hub has the icon "${await icon()}", expected the tree's 🌳`);
      await p.gameSeconds(3);   // the time the first hint of a world comes in
      const lines = await p.g(() => [...window.__hubLines]);
      if (lines.includes('go_next')) fail(`one artifact: in the hub the cat sends her "to a new friend" (go_next) - the hub has none; lines: ${lines.join(', ')}`);
      // the cat's line of the tour (R34): the hub's own, by its clip in voice/hub/ (precached with the core), not the synthesizer
      const tourLine = await p.g(() => ({ clip: __game.clipFor('hub_tour'), synth: __game.voice.synth.includes('hub_tour') }));
      if (!lines.includes('hub_tour')) fail(`one artifact: the cat did not say its line of the tour (hub_tour); lines: ${lines.join(', ')}`);
      if (tourLine.clip !== 'hub/hub_tour') fail(`one artifact: the line of the tour has the clip "${tourLine.clip}", expected "hub/hub_tour" - the clip in the folder of the hub`);
      if (tourLine.synth) fail('one artifact: the line of the tour was left to the synthesizer: its clip hub/hub_tour.mp3 did not sound');
      await p.shot('hub-arrival.png');
      told.push('the cat\'s line of the tour by its clip hub/hub_tour');
      told.push('she at the arch of the fairies facing the tree, the crystal\'s nest alone glowing, the forest\'s arch to the probe world, three asleep, the description its tour alone, no hint "to a new friend"');
      // by a sleeping arch (the sea's) the cat says its world sleeps, by its clip in voice/hub/
      await p.g(([x, z]) => { __game.teleport(x, z); }, [HUB_ARCH[2].x * 0.85, HUB_ARCH[2].z * 0.85]);
      await p.gameSeconds(3);
      const byArch = await p.g(() => ({ lines: [...window.__hubLines], clip: __game.clipFor('hub_sleeping'), synth: __game.voice.synth.includes('hub_sleeping') }));
      if (!byArch.lines.includes('hub_sleeping')) fail(`one artifact: by the sleeping arch of the sea the cat did not say "hub_sleeping"; lines: ${byArch.lines.join(', ')}`);
      if (byArch.clip !== 'hub/hub_sleeping' || byArch.synth) fail(`one artifact: the line "hub_sleeping" has the clip "${byArch.clip}"${byArch.synth ? ' and was left to the synthesizer' : ''}, expected "hub/hub_sleeping"`);
      told.push('by a sleeping arch the cat says its world sleeps, by its clip hub/hub_sleeping');
      // through the forest's arch by its action button
      await p.g(([x, z]) => { __game.teleport(x, z); }, [HUB_ARCH[1].x * 0.9, HUB_ARCH[1].z * 0.9]);
      await p.until(() => !document.querySelector('#btnAct').classList.contains('hidden'), null, 'no action button at the arch of the forest', 20000);
      await p.page.locator('#btnAct').dispatchEvent('pointerdown');   // as tools/shot.mjs presses it: the button breathes, it is never "stable"
      await p.inWorld(PROBE);
      if ((await p.g(() => __game.world)) !== PROBE) fail('one artifact: the arch of the forest did not take her to the probe world');
      if ((await icon()) !== '💎') fail(`one artifact: in the probe world the counter keeps the hub's icon "${await icon()}", expected the shard's 💎`);
      // back: at the arch of the forest, facing the tree; no tour any more
      if ((await p.g(() => __game.travel('hub'))) !== true) throw new Error('one artifact: the way back to the hub was refused');
      await p.inWorld('hub', true);
      if (await p.g(() => __game.flyoverPlayer?.active === true)) fail('one artifact: the tour of the hub played again on the second entry');
      await p.inWorld('hub');
      if ((await p.g(() => __game.hub.wake().shelves.length)) !== 0) fail('one artifact: an arch woke again on the second entry');
      const back = await p.at();
      p.near(back, HUB_ARRIVAL[1], 'back from the probe world'); p.facing(back, HUB_ARRIVAL[1].facing, 'back from the probe world');
      told.push('through the forest\'s arch to the probe world and back to that arch, no second tour');
      // a reload launches the game in the hub, where she stood
      await p.page.reload();   // the page hidden on the way stores the save (where she stands, the world she is in)
      await p.play(false);
      if ((await p.g(() => __game.world)) !== 'hub') fail(`one artifact: after a reload the game opened "${await p.g(() => __game.world)}", not the hub where she stopped`);
      else { p.near(await p.at(), HUB_ARRIVAL[1], 'after a reload'); told.push('a reload opened the hub where she stood'); }
      await p.close();
    }

    // ----- "two": the probe world done too: the forest's nest glows as well -----
    // The sea (published 2026-11-24) is in the probe build too, behind the next arch: its arch opens once the probe
    // world is done. Done as well here, with the cat's words of its coming home said already (the hub's flags sea_home,
    // sea_after: src/worlds/hub/index.ts worldWord), so that "nothing new" below is still true - every open world done.
    {
      const two = HUB_SAVES.two();
      two.worlds.sea = { quests: {}, final: true, starsTaken: [], flags: {}, pos: null };
      const hubPart = two.worlds.hub ?? { quests: {}, final: false, starsTaken: [], flags: {}, pos: null };
      two.worlds.hub = { ...hubPart, flags: { ...hubPart.flags, sea_home: true, sea_after: true } };
      const p = await open('two artifacts', two);
      await p.page.goto(`${url}?debug&world=hub${q}`);
      await p.play(true);
      const nests = await p.g(() => __game.hub.nests());
      if (JSON.stringify(nests) !== JSON.stringify([true, true, true, false, false])) fail(`two artifacts: the nests ${JSON.stringify(nests)}, the crystal's, the forest's and the sea's should glow`);
      if (await p.g(() => __game.flyoverPlayer?.active === true)) {
        await p.g(() => __game.flyoverPlayer.hold(2));   // the tree over the glade: both nests on its side
        await p.gameSeconds(0.8);
        await p.shot('hub-tree-2.png');
        await p.g(() => __game.flyoverPlayer.skip());
      } else fail('two artifacts: no tour of the hub on its first entry');
      told.push('with the probe world and the sea done too the crystal\'s, the forest\'s and the sea\'s nests glow');
      // nothing new (every open world done): the cat's sparkles lead back to the fairies' arch, a tap on the cat says
      // "the other worlds still sleep" (not the shared "new friends live here"), its clip in voice/hub/
      await p.inWorld('hub');
      // the first entry of this save: the forest's arch wakes after the tour - let it
      await p.until(() => { const w = __game.hub.wake(); return w.shelves.length === 0 || (w.t >= 1 && !w.on && !__game.busy); }, null, 'two artifacts: the arches did not finish waking', 60000);
      const quiet = await p.g(() => ({ goal: __game.hub.goal(), tap: __game.hub.left('tap'), clip: __game.clipFor('hub_asleep') }));
      if (!quiet.goal || Math.hypot(quiet.goal.x - HUB_ARCH[0].x, quiet.goal.z - HUB_ARCH[0].z) > 0.5) fail(`two artifacts: with nothing new the sparkles lead to ${JSON.stringify(quiet.goal)}, not to the fairies' arch ${JSON.stringify(HUB_ARCH[0])}`);
      if (quiet.tap !== 'hub_asleep') fail(`two artifacts: with nothing new a tap on the cat says "${quiet.tap}", expected "hub_asleep"`);
      if (quiet.clip !== 'hub/hub_asleep') fail(`two artifacts: the line "hub_asleep" has the clip "${quiet.clip}", expected "hub/hub_asleep"`);
      // a second entry (a reload: no tour any more) - the cat says it as she comes in
      await p.page.reload();
      await p.play(false);
      await p.g(() => { const seen = window.__hubLines = new Set(); const look = () => { if (__game.line) seen.add(__game.line); requestAnimationFrame(look); }; look(); });
      await p.inWorld('hub');
      await p.gameSeconds(8);   // the meeting (welcome back), then the hub's word
      const said = await p.g(() => [...window.__hubLines]);
      if (!said.includes('hub_asleep')) fail(`two artifacts: on a second entry with nothing new the cat did not say "hub_asleep"; lines: ${said.join(', ')}`);
      if (await p.g(() => __game.voice.synth.includes('hub_asleep'))) fail('two artifacts: the line "hub_asleep" was left to the synthesizer');
      told.push('with nothing new the sparkles lead back to the fairies\' arch and the cat says "the other worlds still sleep" on a tap and on a second entry, by its clip hub/hub_asleep');
      await p.close();
    }

    // ----- "keepsakes": two secrets found and the acorns gathered in the first world; the ring of mushrooms plays -----
    {
      const save = HUB_SAVES.one();
      const fw = save.worlds[FIRST_WORLD];
      fw.flags = { ...(fw.flags ?? {}), chest: true, glade: true, house: false };
      fw.found = [6, 7, 8, 9, 10, 11];   // the six acorns (src/worlds/fairy/collect.ts)
      fw.flags.pet = true; save.pets = ['fawn']; save.pet = 'fawn';   // the fawn chosen: it walks after her into the hub
      save.stash = { acorn: 3, feather: 1, mushroom: 1 };   // the finds to brew with (PLAY-26)
      save.worlds.hub = { quests: {}, final: false, starsTaken: [], flags: { toured: true, woke1: true }, pos: null };
      const p = await open('keepsakes', save);
      await p.page.goto(`${url}?debug&world=hub${q}`);
      await p.play(false);
      await p.inWorld('hub');
      const want = ['fairy/secret:chest', 'fairy/secret:glade', 'fairy/set:acorn'];
      // drawn in the nests' mesh (src/worlds/hub/keepsakes.ts): its vertices that glow are theirs, no mesh of their own
      const kept = await p.g(() => {
        const glow = __game.scene.getObjectByName('nests')?.geometry.getAttribute('glow');
        return { list: __game.hub.keepsakes(), glowing: glow ? Array.from(glow.array).filter((v) => v > 0).length : 0, own: !!__game.scene.getObjectByName('keepsakes') };
      });
      if (JSON.stringify(kept.list) !== JSON.stringify(want) || !(kept.glowing > 0) || kept.own) fail(`keepsakes: the tree shows ${JSON.stringify(kept)}, expected ${JSON.stringify(want)} glowing in the nests' mesh, no mesh of their own`);
      // a picture from the fairies' nest side, 9 m out
      const arch = HUB_ARCH[0], fa = Math.atan2(arch.x, arch.z);
      await p.g((a) => { const g = __game; g.teleport(Math.sin(a) * 9, Math.cos(a) * 9); g.hero.heading = a + Math.PI; g.hero.root.rotation.y = g.hero.heading; g.cam.yaw = g.hero.heading + Math.PI; }, fa);
      await p.gameSeconds(1.5);
      await p.shot('hub-keepsakes.png');
      // the ring: she stands 3 m from the stump facing it; a tap on a cap plays its note, she does not walk
      const ring = await p.g(() => __game.hub.ring());
      const c = ring.tops.reduce((m, t) => ({ x: m.x + t.x / ring.tops.length, z: m.z + t.z / ring.tops.length }), { x: 0, z: 0 });
      const out = Math.hypot(c.x, c.z), ox = c.x / out, oz = c.z / out;
      await p.g(([x, z, h]) => { const g = __game; g.teleport(x, z); g.hero.heading = h; g.hero.root.rotation.y = h; g.cam.yaw = h + Math.PI; }, [c.x + ox * 3.2, c.z + oz * 3.2, Math.atan2(-ox, -oz)]);
      await p.gameSeconds(1.5);
      const target = await p.g(() => {
        const g = __game, cv = g.renderer.domElement.getBoundingClientRect(), tops = g.hub.ring().tops, V = g.hero.root.position.constructor;
        // the cap nearest the middle of the screen
        let best = null;
        tops.forEach((t, i) => { const v = new V(t.x, t.y, t.z).project(g.camera); const sx = cv.left + (v.x + 1) / 2 * cv.width, sy = cv.top + (1 - v.y) / 2 * cv.height, d = Math.hypot(sx - cv.width / 2, sy - cv.height / 2); if (v.z < 1 && (!best || d < best.d)) best = { i, sx, sy, d }; });
        return best;
      });
      const before = await p.at();
      if (!target) fail('keepsakes: no cap of the ring on the screen');
      else {
        await p.page.touchscreen.tap(target.sx, target.sy);
        await p.gameSeconds(1);
        const after = await p.at(), notes = (await p.g(() => __game.hub.ring())).notes;
        if (!notes.includes(target.i)) fail(`keepsakes: a tap on the cap ${target.i} of the ring played ${JSON.stringify(notes)}`);
        if (Math.hypot(after.x - before.x, after.z - before.z) > 0.3) fail(`keepsakes: a tap on a mushroom of the ring walked her ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)} m`);
        await p.shot('hub-ring.png');
        // the pet plays round the ring while she stands by the stump (src/worlds/hub/ring-play.ts), and comes back to her
        const st = await p.g(() => __game.hub.ring().tops);
        const mid = st.reduce((m, t) => ({ x: m.x + t.x / st.length, z: m.z + t.z / st.length }), { x: 0, z: 0 });
        const petAt = () => p.g(() => { const o = __game.scene.getObjectByName('pet:fawn'); return o && { x: o.position.x, z: o.position.z }; });
        await p.gameSeconds(4);
        const a = await petAt();
        await p.gameSeconds(1);
        const b = await petAt();
        if (!a || !b) fail('keepsakes: the chosen fawn is not in the hub');
        else {
          const ra = Math.hypot(a.x - mid.x, a.z - mid.z), rb = Math.hypot(b.x - mid.x, b.z - mid.z), went = Math.hypot(b.x - a.x, b.z - a.z);
          if (Math.abs(ra - 2.0) > 0.8 || Math.abs(rb - 2.0) > 0.8 || went < 0.5) fail(`keepsakes: by the stump the fawn does not run round the ring: ${ra.toFixed(2)} and ${rb.toFixed(2)} m from its middle, ${went.toFixed(2)} m in a second`);
          await p.shot('hub-pet-ring.png');
          await p.g(([x, z]) => __game.teleport(x, z), [mid.x + (mid.x / Math.hypot(mid.x, mid.z)) * 9, mid.z + (mid.z / Math.hypot(mid.x, mid.z)) * 9]);
          await p.gameSeconds(4);
          const c = await petAt(), h = await p.at();
          if (Math.hypot(c.x - h.x, c.z - h.z) > 2.5) fail(`keepsakes: she walked off the stump, the fawn stayed ${Math.hypot(c.x - h.x, c.z - h.z).toFixed(1)} m from her`);
          else told.push('the fawn chosen walked after her into the hub, ran round the ring while she stood by the stump and came back to her side');
        }
        told.push(`the tree shows the keepsakes of two secrets and the acorns (${want.length}); a tap on a mushroom of the ring played its note, she stood`);
        // the feather of the day (src/worlds/hub/feathers.ts): the first lies in the first gap; taken, the cat says
        // hub_feather, none more today, the golden bird sleeps on its branch; the next day the second lies out
        await p.g(() => { const seen = window.__hubLines = new Set(); const look = () => { if (__game.line) seen.add(__game.line); requestAnimationFrame(look); }; look(); });
        const f0 = await p.g(() => __game.hub.feathers('2026-11-20'));
        if (f0.lying !== 0 || f0.bird) fail(`keepsakes: on a new day with no feather found ${JSON.stringify(f0)}, expected the first lying, no bird`);
        const gap = Math.PI / 5, fx = Math.sin(gap) * 9.2, fz = Math.cos(gap) * 9.2;
        // the picture: she 3 m off it toward the trunk, the camera on the feather
        await p.g(([x, z]) => { const g = __game; g.teleport(x * 0.68, z * 0.68); g.hero.heading = Math.atan2(x, z); g.hero.root.rotation.y = g.hero.heading; g.cam.yaw = g.hero.heading + Math.PI + 0.5; g.cam.focus = g.hero.root.position.clone().set(x, 0.3, z); g.closeup(5); }, [fx, fz]);
        await p.gameSeconds(1.5);
        await p.shot('hub-feather.png');
        await p.g(() => { const g = __game; g.cam.focus = null; g.closeup(null); });
        await p.g(([x, z]) => __game.teleport(x, z), [fx, fz]);
        await p.gameSeconds(6);
        const f1 = await p.g(() => ({ ...__game.hub.feathers(), clip: __game.clipFor('hub_feather'), found: __game.save.worlds.hub.found, day: __game.save.worlds.hub.day, said: [...window.__hubLines] }));
        if (JSON.stringify(f1.found) !== '[0]' || f1.day !== '2026-11-20' || f1.lying !== null || !f1.bird || !f1.said.includes('hub_feather') || f1.clip !== 'hub/hub_feather') fail(`keepsakes: the first feather taken: ${JSON.stringify(f1)}`);
        else {
          // the picture: she on the glade under its branch, the camera on the bird
          await p.g(([x, y, z]) => { const r = Math.hypot(x, z), g = __game; g.teleport(x / r * 8.5, z / r * 8.5); g.hero.heading = Math.atan2(-x, -z); g.hero.root.rotation.y = g.hero.heading; g.cam.yaw = g.hero.heading + Math.PI; g.cam.focus = g.hero.root.position.clone().set(x, y, z); g.closeup(6); }, [f1.bird.x, f1.bird.y, f1.bird.z]);
          await p.gameSeconds(1.5);
          await p.shot('hub-bird-asleep.png');
          await p.g(() => { const g = __game; g.cam.focus = null; g.closeup(null); });
          const f2 = await p.g(() => __game.hub.feathers('2026-11-21'));
          if (f2.lying !== 1 || f2.bird) fail(`keepsakes: the next day ${JSON.stringify(f2)}, expected the second lying, no bird`);
          else told.push('the feather of the day: the first taken, the cat said hub_feather by its clip, the golden bird asleep that day, the second out the next day');
        }
        await p.g(() => __game.hub.feathers(null));
      }
      // the cauldron by the roots (PLAY-26): reached by walking up to it, its button "brew"; the recipes of the open
      // worlds; a find the recipe does not ask is refused and nothing is spent; the jumping potion brewed by touches
      // goes to the stock, the stash loses exactly the recipe; closed - the game goes on
      {
        const pot = await p.g(() => __game.hub.cauldron());
        await p.g(([x, z]) => { const g = __game; g.teleport(x, z + 1.6); g.hero.heading = Math.PI; g.hero.root.rotation.y = Math.PI; g.cam.yaw = 0; }, [pot.x, pot.z]);
        await p.gameSeconds(1);
        await p.page.locator('#btnAct').waitFor({ state: 'visible', timeout: 10000 }).catch(() => fail('keepsakes: no action button by the cauldron'));
        await p.page.locator('#btnAct').click({ force: true });   // the action button pulses: never "stable"
        await p.page.locator('#cauldron .cd-recipe').first().waitFor({ timeout: 10000 }).catch(() => fail('keepsakes: the cauldron did not open'));
        const shown = await p.g(() => [...document.querySelectorAll('#cauldron .cd-recipe')].map((b) => b.dataset.recipe));
        if (JSON.stringify(shown) !== JSON.stringify(pot.recipes)) fail(`keepsakes: the cauldron shows ${shown}, the open worlds give ${pot.recipes}`);
        const before = await p.g(() => ({ stash: { ...__game.save.stash }, jump: __game.save.supplies?.jump ?? 0 }));
        const press = (sel) => p.page.locator(sel).first().click({ force: true });
        await press('#cauldron [data-recipe=jump]');
        await press('#cauldron [data-kind=mushroom]');          // not in the recipe: refused, nothing spent
        await p.shot('hub-cauldron.png');
        for (const k of ['acorn', 'acorn', 'feather']) await press(`#cauldron [data-kind=${k}]`);
        const after = await p.g(() => ({ stash: { ...__game.save.stash }, jump: __game.save.supplies?.jump ?? 0 }));
        if (after.jump !== before.jump + 1 || after.stash.acorn !== 1 || after.stash.feather !== undefined || after.stash.mushroom !== 1) fail(`keepsakes: brewing the jumping potion: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
        await p.shot('hub-cauldron-done.png');
        await press('#cauldronClose');
        if (await p.g(() => __game.paused === true || !document.getElementById('cauldron').classList.contains('hidden'))) fail('keepsakes: the cauldron closed, the game still stands');
        told.push(`the cauldron by the roots: ${shown.length} recipes of the open worlds, a mushroom not asked refused, the jumping potion brewed by touches (the stash ${JSON.stringify(before.stash)} -> ${JSON.stringify(after.stash)})`);
      }
      await p.close();
    }

    // ----- "budget": the hub's 80 draw calls (TECH-06) on the stage of a child now and on the fourth, which no build
    // reaches by its artifacts yet (?debug&hubStage=N, src/worlds/hub/index.ts forcedStage): the fawn after her, every
    // keepsake of the fairy world, q2 (the tier a child plays the hub on) - the frame of the arrival at the fairies' arch
    {
      const calls = [];
      for (const stage of [1, 4]) {
        const save = HUB_SAVES.one();
        const fw = save.worlds[FIRST_WORLD];
        fw.flags = { ...(fw.flags ?? {}), chest: true, glade: true, house: true, pet: true };
        fw.found = Array.from({ length: 24 }, (_, i) => i);
        save.pets = ['fawn']; save.pet = 'fawn';
        save.worlds.hub = { quests: {}, final: false, starsTaken: [], flags: { toured: true, woke1: true }, pos: null };
        const p = await open(`budget, stage ${stage}`, save);
        await p.page.goto(`${url}?debug&world=hub&hubStage=${stage}&q=2`);
        await p.play(false);
        await p.inWorld('hub');
        // every set gathered earns its achievement on the way in: its card stands the game - closed before the frame
        await p.until(() => {
          const card = !document.querySelector('#fanfare').classList.contains('hidden');
          if (card) document.querySelector('#fanfareOk')?.click();
          return !card && !__game.busy && !__game.paused;
        }, null, 'the cards of the achievements did not close');
        await p.g(() => { const g = __game; g.teleport(0, 6.5); g.hero.heading = Math.PI; g.hero.root.rotation.y = Math.PI; g.cam.yaw = 0; });
        // a game second (20 frames at least): the camera has come to her, the pet after her; the count is of that frame
        await p.gameSeconds(1);
        const n = await p.g(() => __game.renderer.info.render.calls);
        calls.push(`stage ${stage}: ${n}`);
        if (n > 80) fail(`budget: stage ${stage} with the fawn and every keepsake, q2: ${n} draw calls at the arrival, more than 80`);
        await p.close();
      }
      // the most an arch waking adds (its stone, veil and runes of its own, src/worlds/hub/arch-look.ts): the forest's arch
      // not marked awake, held at 0.8 (the light on, the vines not yet merged) - the frame of the camera on it
      {
        const save = HUB_SAVES.one();
        const fw = save.worlds[FIRST_WORLD];
        fw.flags = { ...(fw.flags ?? {}), chest: true, glade: true, house: true, pet: true };
        fw.found = Array.from({ length: 24 }, (_, i) => i);
        save.pets = ['fawn']; save.pet = 'fawn';
        save.worlds.hub = { quests: {}, final: false, starsTaken: [], flags: { toured: true }, pos: null };
        const p = await open('budget, waking', save);
        await p.page.goto(`${url}?debug&world=hub&hubStage=1&q=2`);
        await p.play(false);
        await p.g(() => __game.hub.wake(0.8));
        await p.until(() => { const card = !document.querySelector('#fanfare').classList.contains('hidden'); if (card) document.querySelector('#fanfareOk')?.click(); return __game.hub.wake().on; }, null, 'budget, waking: the forest\'s arch did not start to wake', 60000);
        await p.gameSeconds(1);
        const n = await p.g(() => __game.renderer.info.render.calls);
        calls.push(`stage 1 while the forest's arch wakes: ${n}`);
        if (n > 80) fail(`budget: stage 1 with the fawn and every keepsake, q2, while an arch wakes: ${n} draw calls, more than 80`);
        await p.g(() => __game.hub.wake(null));
        await p.close();
      }
      told.push(`the budget of the hub with the fawn and every keepsake, q2, at the arrival: ${calls.join(', ')} draw calls (80 at most)`);
    }
  } finally {
    await browser.close();
  }
  if (failures) return '';
  return `the hub: ${told.join('; ')}; pictures: ${shots}/hub-*.png; ${((Date.now() - started) / 1000).toFixed(0)} s`; /* clock: log-time */
}

/**
 * The scenarios of the change of world (7 above) on the probe build served at `url`; the pictures go to `shots`.
 * `asked` is the server's record of requests, `list` worlds.json of the build. `block(id)` makes the server answer 404
 * for the files of the world `id` (null gives them back). `rounds` is how many rounds the scenario "rounds" plays
 * (`roundsWanted`). Every failure goes to `fail`; returns the line to print when every scenario came to its end
 * without one ('' otherwise).
 */
async function travelScenarios({ url, shots, asked, list, fail: report, block, rounds: wantRounds = ROUNDS }) {
  let failures = 0;
  const fail = (msg) => { failures++; report(`the change of world: ${msg}`); };
  const { chromium } = await import('playwright-core');
  const GL_ARGS = { gl: ['--use-angle=gl', '--enable-gpu'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  const gl = process.env.E2E_GL || 'gl';
  if (!GL_ARGS[gl]) throw new Error(`unknown E2E_GL="${gl}": use "gl" or "swiftshader"`);
  const slow = Number(process.env.E2E_SLOW || 1);
  if (!(slow > 0)) throw new Error(`bad E2E_SLOW="${process.env.E2E_SLOW}"`);
  const T = (ms) => Math.round(ms * slow);
  const origin = new URL(url).origin;
  const q = process.env.Q ? `&q=${process.env.Q}` : '';
  const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };
  const ofProbe = (u) => { try { return worldOf(new URL(u).pathname.replace(/^\//, ''), [PROBE]) === PROBE; } catch { return false; } };
  const FIRST = FIRST_WORLD;
  const files = (list?.worlds?.[PROBE]?.files ?? []).map((f) => f.url).sort();
  if (!files.some(isVoice)) throw new Error(`${WORLDS_LIST} lists no clip of the voice of the world "${PROBE}": "ready" would be tried without the voice of the world`);
  // The probe world's own spoken line (the greeting of its character) and its clip, in the folder of the world.
  const HI = `${PROBE}_hi`, HI_CLIP = `${PROBE}/${PROBE}_hi`;
  // The cat's line at a portal that stays closed (src/main.ts `refuse`); its clip is one of the core.
  const NEED_NET = 'need_net';
  const started = Date.now();

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome', headless: true,
    args: [...GL_ARGS[gl], '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  try {
    /**
     * A page of the game in a context of its own (an empty cache and an empty save). `lost` - the files of the probe
     * world are gone from the server: their 404s and the game's own word about the failed load are expected there,
     * and only they. `saving` - the browser asks to save data (navigator.connection.saveData): "Play" downloads no next
     * world in the background, so only the change of world itself can bring the probe world into the cache.
     */
    const open = async (name, lost, saving = false) => {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      // R61: the gift of a new day (PLAY-21) is held, as in tools/shot.mjs: the stars counted here are the tasks' alone.
      await ctx.addInitScript(() => { sessionStorage.setItem('amw-gift-hold', '1'); sessionStorage.setItem('amw-mystery-hold', '1'); });
      await ctx.route((u) => !own(u.href), (route) => route.abort());   // nothing leaves for the internet
      if (saving) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }); });
      const page = await ctx.newPage();
      const expected = { notFound: 0, said: 0 };
      page.on('console', (m) => {
        if (m.type() !== 'error' && m.type() !== 'warning') return;
        if (lost && m.type() === 'error' && /status of 404/.test(m.text()) && ofProbe(m.location().url)) { expected.notFound++; return; }
        if (lost && m.type() === 'error' && m.text().startsWith('the game could not load:') && !expected.said++) return;
        fail(`${name}: console ${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => fail(`${name}: pageerror: ${e.message}`));
      // A request answered 404 whose answer nobody reads to its end is reported as failed (aborted) by the browser.
      // The gate's probe of the network is no exception: every failed request of it is a failure.
      page.on('requestfailed', async (r) => {
        if (lost && ofProbe(r.url())) return;
        fail(`${name}: request failed: ${r.url()} (${r.failure()?.errorText})`);
      });
      page.on('response', (r) => { if (r.status() >= 400 && !(lost && r.status() === 404 && ofProbe(r.url()))) fail(`${name}: HTTP ${r.status()} for ${r.url()}`); });
      const g = (fn, arg) => page.evaluate(fn, arg);
      const until = (fn, arg, what, ms = 60000) => page.waitForFunction(fn, arg, { timeout: T(ms) }).catch(() => { throw new Error(`${name}: ${what}`); });
      /** The game from "Play" on: a new save's introduction (WORLD-13) and the tour of the first entry are skipped the way a tap skips them, the heroine can walk. */
      const start = async () => {
        await page.locator('#play').waitFor({ state: 'visible', timeout: T(240000) });
        await until(() => typeof window.__game?.travel === 'function' && __game.time > 0, null, 'no window.__game.travel - the game does not show the change of world with ?debug', 30000);
        await page.click('#play');
        await until(() => { if (__game.story?.active) { __game.story.skip(); return false; } if (__game.flyoverPlayer?.active) { __game.flyoverPlayer.skip(); return false; } return !__game.busy && !__game.story?.active; }, null, 'the game stayed busy after "Play"');
      };
      /** The heroine walks: "forward" is held until she has moved half a step, however slow the frames are. */
      const walks = async () => {
        const from = await g(() => [__game.hero.root.position.x, __game.hero.root.position.z]);
        await page.keyboard.down('KeyW');
        try {
          await page.waitForFunction(([x, z]) => Math.hypot(__game.hero.root.position.x - x, __game.hero.root.position.z - z) > 0.5, from, { timeout: T(15000) });
          return true;
        } catch { return false; } finally { await page.keyboard.up('KeyW'); }
      };
      /** What the game shows of the world played and of what every world shares. */
      const state = () => g((hi) => ({
        world: __game.world, busy: __game.busy, going: __game.transitioning, mark: window.__travelMark ?? null,
        // The heroine and the cat kept with the mark: the very same objects, still in the scene.
        same: !window.__travelKept ? null : ['hero', 'cat'].filter((k) => __game[k] !== window.__travelKept[k] || __game[k].root !== window.__travelKept[`${k}Root`] || __game[k].root.parent !== __game.scene),
        at: [__game.hero.root.position.x, __game.hero.root.position.z].map((v) => Math.round(v * 100) / 100),
        npcs: __game.npcs.map((n) => n.def.id), names: ['search', 'bf', 'worldSort', 'shopSign'].filter((k) => k in __game),
        // The description of the world played (ARCH-16): its items as "<kind> <id>", null for a world that hands in none.
        described: Array.isArray(__game.items) ? __game.items.map((i) => `${i.kind} ${i.id}`) : __game.items === null ? null : 'no window.__game.items',
        scene: __game.scene.children.length, onHero: __game.hero.root.children.length, flies: __game.flies.flies.length,
        held: { geometries: __game.renderer.info.memory.geometries, textures: __game.renderer.info.memory.textures },
        suns: __game.scene.children.filter((o) => o.isDirectionalLight).length,
        // The sun as the quality tier sets it up: it casts shadows exactly when the tier has them, on a map of the tier's size.
        sun: __game.scene.children.filter((o) => o.isDirectionalLight).map((s) => (s.castShadow !== __game.renderer.shadowMap.enabled
          ? `it ${s.castShadow ? 'casts' : 'does not cast'} shadows, the tier ${__game.renderer.shadowMap.enabled ? 'has' : 'has none'}`
          : s.castShadow && s.shadow.mapSize.x < 1024 ? `its shadow map is ${s.shadow.mapSize.x} px, the tier's is 1024 or more` : '')).join('; '),
        music: __game.music ? __game.music.scale[0] : null, crystals: document.getElementById('crystals').textContent,
        foxClip: __game.clipFor('npc_next', '🦊'), focus: __game.cam.focus !== null, inTask: __game.inTask,
        // The clip of the probe world's own line (null: none) and of a shared line of the narrator, as the game finds them now.
        ownClip: __game.clipFor(hi), sharedClip: __game.clipFor('npc_next'),
        shown: ['task', 'answers', 'answersClose', 'fanfare', 'start'].filter((id) => !document.getElementById(id).classList.contains('hidden')),
        hud: ['hud', 'joy'].filter((id) => !document.getElementById(id).classList.contains('hidden')),
      }), HI);
      /** Calls travel(id) with every frame of the change recorded; returns what it answered and the frames. */
      const travel = (id) => g((to) => new Promise((res, rej) => {
        const frames = [], ids = ['hud', 'joy', 'btnJump', 'btnAct', 'bubble', 'task', 'answers', 'answersClose', 'fanfare'];
        let on = true;
        // This callback runs after the game's frame of the same tick: it reads the frame just drawn.
        const tick = () => {
          if (!on) return;
          const f = __game.fade, m = __game.music;
          frames.push({ phase: f.phase, closed: f.closed, world: __game.world, busy: __game.busy, going: __game.transitioning, speaking: __game.speaking,
            line: __game.line, music: m ? m.scale[0] : null, shown: ids.filter((i) => !document.getElementById(i).classList.contains('hidden')) });
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        __game.travel(to).then((ok) => { on = false; res({ ok, frames }); }, (e) => { on = false; rej(e); });
      }), id);
      /** A character of the world played is asked: its first task comes to the panel and is solved the way a child solves it. */
      const solveWith = async (id, world) => {
        const before = await g(([w, c]) => __game.save.worlds[w]?.quests?.[c] ?? 0, [world, id]);
        await g((c) => __game.talk(c), id);
        await page.locator('#task:not(.hidden)').waitFor({ timeout: T(60000) }).catch(() => { throw new Error(`${name}: the character "${id}" of the world "${world}" gave no task`); });
        const how = await g(() => __game.cheat());
        if (how !== 'panel') fail(`${name}: the task of "${id}" was not a panel task to solve (__game.cheat() returned "${how}")`);
        await until(([w, c, n]) => (__game.save.worlds[w]?.quests?.[c] ?? 0) === n + 1, [world, id, before], `the solved task of "${id}" was not written to the part "${world}" of the save`);
        // What follows the task - the next task of the chain, or the card of the part - is closed; then she is free.
        await until(() => {
          const shown = (i) => !document.getElementById(i).classList.contains('hidden');
          if (shown('fanfare')) document.getElementById('fanfareOk').click();
          else if (shown('task') && !document.getElementById('task').classList.contains('won')) document.getElementById('taskClose').click();
          return !__game.busy && !shown('task') && !shown('fanfare');
        }, null, `the conversation with "${id}" did not end after its task`);
      };
      /**
       * The book of treasures, opened by its button and closed again: the parts and the secrets it shows. Both are
       * drawn at the opening from the world played now; closing the book is a stop point, so a scene of an achievement
       * that waited for one is closed too.
       */
      const book = async () => {
        const seen = await g(() => {
          const el = (i) => document.getElementById(i);
          el('btnBook').click();
          const parts = [...document.querySelectorAll('#shards .shard')];
          const out = { open: !el('book').classList.contains('hidden'), parts: parts.length, got: parts.filter((e) => e.classList.contains('got')).length,
            secrets: [...document.querySelectorAll('#secrets .secret')].map((e) => e.dataset.flag) };
          el('bookClose').click();
          return out;
        });
        if (!seen.open) fail(`${name}: the button of the book did not open it`);
        await until(() => {
          const shown = (i) => !document.getElementById(i).classList.contains('hidden');
          if (shown('fanfare')) document.getElementById('fanfareOk').click();
          return !__game.busy && !shown('fanfare') && !shown('book');
        }, null, 'the game stayed busy after the book was closed');
        return seen;
      };
      return { ctx, page, g, until, start, walks, state, travel, solveWith, book, expected };
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    // ---- "there and back" ----
    {
      const name = 'there and back';
      const p = await open(name, false);
      /** The height the probe world swims at (src/worlds/probe/index.ts `move`) and the free wand she wears there. */
      const SWIM = 0.6, WAND = 'wand_flower';
      /**
       * The heroine as the water changes her: her height above the ground under her, her clip, the swimming clips she
       * has, the jump button, the wand (seen or not, and what the save has her wear), how many petals on her are seen,
       * and the pelvis in the first key of her Idle and Float.
       */
      const heroine = () => p.g((wand) => {
        const h = __game.hero, hp = h.root.position, y = hp.y;
        __game.teleport(hp.x, hp.z);                      // the ground under her, read in the same task: she is put back
        const ground = hp.y; hp.y = y;
        const key = (n) => h.actions.get(n)?.getClip().tracks.find((t) => t.name === 'pelvis.position')?.values[2] ?? null;
        return {
          above: y - ground, clip: h.current, lent: ['Swim', 'Float'].filter((n) => h.has(n)),
          jumpButton: !document.getElementById('btnJump').classList.contains('hidden'),
          wand: h.model.getObjectByName(wand)?.visible ?? null, worn: __game.save.gear.wand,
          petals: h.root.children.filter((o) => o !== h.model && o.visible).length, pelvis: { Idle: key('Idle'), Float: key('Float') },
        };
      }, WAND);
      /**
       * Space is pressed with her standing; for 1.2 s of game time her height against the height she started at is
       * followed: how far she rose, how far below it she went, where she ended, which clips played.
       */
      const jumpSample = async () => {
        await p.g(() => {
          const h = __game.hero, from = h.root.position.y, s = window.__jumpSample = { t0: __game.time, rise: 0, fall: 0, end: 0, clips: [], over: false };
          const tick = () => {
            const dy = h.root.position.y - from;
            s.rise = Math.max(s.rise, dy); s.fall = Math.max(s.fall, -dy); s.end = Math.abs(dy);
            if (!s.clips.includes(h.current)) s.clips.push(h.current);
            if (__game.time - s.t0 > 1.2) s.over = true; else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await p.page.keyboard.press('Space');
        await p.until(() => window.__jumpSample.over, null, 'the game time did not run on after the jump');
        return p.g(() => window.__jumpSample);
      };
      /**
       * She swims: "forward" is held until she has moved half a step in the clip Swim at the height of the water; then
       * the game is held still and she is pictured from behind (the camera follows her) and from the side.
       */
      const swims = async () => {
        const from = await p.g(() => [__game.hero.root.position.x, __game.hero.root.position.z, __game.hero.root.position.y]);
        await p.page.keyboard.down('KeyW');
        try {
          await p.until(([x, z, y]) => {
            const h = __game.hero, hp = h.root.position;
            return h.current === 'Swim' && Math.hypot(hp.x - x, hp.z - z) > 0.5 && Math.abs(hp.y - y) < 0.01;
          }, from, 'the heroine did not swim forward', 15000);
          await p.g(() => __game.still(true));
          const drawn = () => p.g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          await drawn();
          await p.page.screenshot({ path: join(root, shots, 'travel-swim-back.png') });
          const heading = await p.g(() => { const h = __game.hero, was = h.heading; h.heading = __game.cam.yaw + Math.PI / 2; h.root.rotation.y = h.heading; return was; });
          await drawn();
          await p.page.screenshot({ path: join(root, shots, 'travel-swim-side.png') });
          await p.g((was) => { const h = __game.hero; h.heading = was; h.root.rotation.y = was; }, heading);
          return true;
        } catch { return false; } finally {
          await p.g(() => __game.still(false));
          await p.page.keyboard.up('KeyW');
          await p.until(() => __game.hero.current === 'Float', null, 'she did not stand in Float again after swimming').catch(() => fail(`${name}: after swimming the heroine does not stand in the clip Float again`));
        }
      };
      let loads = 0;
      p.page.on('load', () => { loads++; });
      await p.page.goto(`${url}?debug${q}`);
      await p.start();
      const mark = `mark-${Date.now()}`;
      await p.g(([m, wand]) => {
        window.__travelMark = m;
        window.__travelKept = { hero: __game.hero, heroRoot: __game.hero.root, cat: __game.cat, catRoot: __game.cat.root };
        __game.teleport(1.5, 11);
        // A wand she wears by the save (a free one): the probe world puts it on too - and hides it in the water.
        __game.save.gear.wand = wand; __game.gear.set('wand', wand);
      }, [mark, WAND]);
      if (!(await p.walks())) fail(`${name}: the heroine does not walk in the first world`);
      const home = await p.state();
      const dry = await heroine();
      if (!dry.wand || !dry.petals || dry.lent.length || !dry.jumpButton) fail(`${name}: in the first world before the change the wand "${WAND}" is ${dry.wand ? 'seen' : 'not seen'}, ${dry.petals} petal(s) are seen, the swimming clips lent are ${JSON.stringify(dry.lent)}, the jump button is ${dry.jumpButton ? 'shown' : 'hidden'}: the checks of the water would be blind`);
      if (home.world !== FIRST) fail(`${name}: the game started in the world "${home.world}", expected "${FIRST}"`);
      if (home.foxClip === 'npc_next') fail(`${name}: the fox of the first world has no voice of its own (${home.foxClip}): the check of the voices after the change would be blind`);
      if (home.music === null) fail(`${name}: no music plays in the first world after "Play": the check of the music would be blind`);
      if (!Array.isArray(home.described) || !home.described.includes('secret chest')) fail(`${name}: window.__game.items in the first world is ${JSON.stringify(home.described)}, expected its description (the secret "chest" among its items): the check of the description after the way back would be blind`);
      if (home.ownClip !== null) fail(`${name}: before any change of world the game finds the clip "${home.ownClip}" for the line "${HI}" of the probe world: no world has handed in its clips yet`);
      if (home.sharedClip !== 'npc_next') fail(`${name}: the shared line "npc_next" has the clip "${home.sharedClip}" in the first world: the check of the clips after the change would be blind`);
      // The book before the change: a part for every character of the first world, the secrets of the first world.
      const homeBook = await p.book();
      if (homeBook.parts !== home.npcs.length || !homeBook.secrets.length) fail(`${name}: the book of the first world shows ${homeBook.parts} parts for its ${home.npcs.length} characters and the secrets ${JSON.stringify(homeBook.secrets)}: the check of the book after the change would be blind`);
      // A character of the first world is talking when the change is asked for: its line must be cut by the closed frame.
      const clips = await p.g(() => { __game.talk('unicorn'); return __game.voice.clips; });
      await p.until((n) => __game.speaking && __game.line === 'unicorn_hi' && __game.voice.clips > n, clips, 'the unicorn did not start its greeting (no clip sounds)');
      const left = await p.g(() => [__game.hero.root.position.x, __game.hero.root.position.z].map((v) => Math.round(v * 100) / 100));
      const there = await p.travel(PROBE);
      if (there.ok !== true) fail(`${name}: __game.travel('${PROBE}') answered ${there.ok}, expected true`);
      for (const x of travelFramesProblems(there.frames, FIRST, PROBE)) fail(`${name}, to "${PROBE}": ${x}`);
      // The first entry into the probe world plays its tour - the item `flyover` of its description is on, and done as
      // it starts; the scenario ends it the way a tap does.
      const entered = await p.g(() => ({ flying: __game.flyoverPlayer?.active ?? null, items: __game.items }));
      const flyover = Array.isArray(entered.items) ? entered.items.find((i) => i.kind === 'flyover') : null;
      if (entered.flying !== true || !flyover?.active || !flyover.done) fail(`${name}: on the first entry into the probe world its tour is not played, or its description does not say so (the tour on: ${entered.flying}, the item: ${JSON.stringify(flyover ?? null)})`);
      await p.until(() => { if (__game.story?.active) { __game.story.skip(); return false; } if (__game.flyoverPlayer?.active) { __game.flyoverPlayer.skip(); return false; } return !__game.busy && !__game.story?.active; }, null, `the game stayed busy after the change to "${PROBE}"`);
      const away = await p.state();
      await p.page.screenshot({ path: join(root, shots, 'travel-probe.png') });
      if (away.mark !== mark) fail(`${name}: the mark left in window is gone after the change (${away.mark}): the page was reloaded`);
      if (away.world !== PROBE) fail(`${name}: after the change the world played is "${away.world}", expected "${PROBE}"`);
      if (!same(away.same, [])) fail(`${name}: in the probe world these are not the objects of the first world, or have left the scene: ${JSON.stringify(away.same)} (the heroine and the cat are made once)`);
      if (!same(away.at, [0, 6])) fail(`${name}: the heroine stands at ${away.at} in the probe world, expected its spawn 0,6`);
      // WorldDef.arrive: coming from the first world she faces the portal (src/worlds/probe/index.ts ARRIVAL).
      const facing = await p.g(() => __game.hero.heading);
      if (Math.abs(facing - PROBE_ARRIVAL_FACING) > 0.01) fail(`${name}: in the probe world she faces ${facing.toFixed(3)}, expected ${PROBE_ARRIVAL_FACING.toFixed(3)} - the way to the portal its arrive() names for the first world`);
      if (!same(away.npcs, PROBE_CHARACTERS)) fail(`${name}: the characters of window.__game are ${JSON.stringify(away.npcs)} in the probe world, expected its own ${JSON.stringify(PROBE_CHARACTERS)}`);
      if (away.names.length) fail(`${name}: window.__game still has the first world's own names in the probe world: ${away.names.join(', ')}`);
      // The description is the one of the world played now: an item of every kind, the chains of its own characters.
      const kinds = Array.isArray(away.described) ? [...new Set(away.described.map((d) => d.split(' ')[0]))].sort() : [];
      if (!same(kinds, [...ITEM_KINDS].sort()) || !PROBE_CHARACTERS.every((c) => away.described.includes(`chain ${c}`))) fail(`${name}: after the change window.__game.items is not the description of the probe world: ${JSON.stringify(away.described)}, expected an item of every kind (${ITEM_KINDS.join(', ')}) with the chains of ${JSON.stringify(PROBE_CHARACTERS)}`);
      if (away.crystals !== `0/${PROBE_CHARACTERS.length}`) fail(`${name}: the counter of parts shows "${away.crystals}" in the probe world, expected "0/${PROBE_CHARACTERS.length}"`);
      if (away.music === null || away.music === home.music) fail(`${name}: the music in the probe world starts at ${away.music}, in the first world at ${home.music}: it is not the music of the new world`);
      if (away.foxClip !== 'npc_next') fail(`${name}: a fox of the probe world would speak with the clip "${away.foxClip}": the voices of the first world were not taken back`);
      if (away.ownClip !== HI_CLIP) fail(`${name}: in the probe world its own line "${HI}" has the clip "${away.ownClip}", expected "${HI_CLIP}" - the clip in the folder of the world`);
      if (away.sharedClip !== home.sharedClip) fail(`${name}: in the probe world the shared line "npc_next" has the clip "${away.sharedClip}", in the first world "${home.sharedClip}": the clips of the core are lost with the world's own list`);
      if (!(away.onHero < home.onHero)) fail(`${name}: the heroine carries ${away.onHero} object(s) in the probe world and ${home.onHero} in the first one: the wings of the first world are still on her`);
      if (away.flies !== 0) fail(`${name}: ${away.flies} butterflies of the first world fly in the probe world`);
      if (away.suns !== 1) fail(`${name}: ${away.suns} suns in the scene of the probe world, expected one`);
      if (away.sun) fail(`${name}: the sun of the probe world was not handed to the quality tier: ${away.sun}`);
      // The small probe world after the big first one: what the renderer holds must have fallen, or the world left was not freed.
      for (const k of ['geometries', 'textures']) {
        if (!(away.held[k] < home.held[k] / 2)) fail(`${name}: the renderer holds ${away.held[k]} ${k} in the probe world and ${home.held[k]} in the first one: the world left was not freed`);
      }
      if (away.focus || away.inTask || away.shown.length) fail(`${name}: the conversation cut by the change left something behind: ${JSON.stringify({ focus: away.focus, inTask: away.inTask, shown: away.shown })}`);
      if (!same(away.hud, ['hud', 'joy'])) fail(`${name}: after the change the counters and the stick are ${JSON.stringify(away.hud)}, expected both on the screen`);
      // ---- the water world (R85, R86, R88): the height, the clips, no jump, the wand hidden ----
      const wet = await heroine();
      if (Math.abs(wet.above - SWIM) > 0.01) fail(`${name}: in the probe world the heroine is ${wet.above.toFixed(3)} m above the ground, the world declares ${SWIM} m to swim at`);
      if (wet.clip !== 'Float') fail(`${name}: standing in the water of the probe world she plays "${wet.clip}", expected "Float"`);
      if (!same(wet.lent, ['Swim', 'Float'])) fail(`${name}: in the probe world the heroine has the swimming clips ${JSON.stringify(wet.lent)}, expected Swim and Float lent by the world`);
      if (wet.jumpButton) fail(`${name}: the jump button is on the screen in the water of the probe world`);
      if (wet.wand !== false || wet.petals !== 0 || wet.worn !== WAND) fail(`${name}: in the water the wand "${wet.worn}" (worn by the save: "${WAND}") is ${wet.wand ? 'seen' : 'hidden'} and ${wet.petals} petal(s) are seen, expected the wand worn and hidden, no petal seen`);
      // Her copies of the world's clips have the pelvis scaled as her copies of the shared ones (src/game/hero.ts).
      const packed = { idle: await pelvisKey(join(root, 'models-src/hero/anims.glb'), 'Idle_Loop'), float: await pelvisKey(join(root, PROBE_FILES, 'models/probe/swim.glb'), 'Swim_Idle_Loop') };
      const scale = { shared: wet.pelvis.Idle / packed.idle, world: wet.pelvis.Float / packed.float };
      if (!(Math.abs(scale.shared - 1) > 0.01) || !(Math.abs(scale.world - scale.shared) < 1e-4)) fail(`${name}: the pelvis of the heroine's clips is scaled ${scale.shared.toFixed(4)} in Idle and ${scale.world.toFixed(4)} in Float of the world: the clips of a world go through the scaling of the shared ones`);
      const jumped = await jumpSample();
      if (jumped.rise > 0.01 || jumped.fall > 0.01 || jumped.clips.includes('Jump')) fail(`${name}: the jump in the water of the probe world moved her ${jumped.rise.toFixed(3)} m up and ${jumped.fall.toFixed(3)} m down, with the clips ${JSON.stringify(jumped.clips)}: in the water there is no jump`);
      if (!(await swims())) fail(`${name}: the heroine does not swim in the probe world (the clip Swim at the height of the water while she moves)`);
      const fairyThen = await p.g((w) => JSON.stringify(__game.save.worlds[w]), FIRST);
      if (!same(JSON.parse(fairyThen).pos.map((v) => Math.round(v * 100) / 100), left)) fail(`${name}: the save holds ${JSON.parse(fairyThen).pos} as her place in the first world, she left it at ${left}: the game was not saved before the change`);
      await p.solveWith('friend', PROBE);
      // The character greeted with the world's own line before its task: said by its clip, not left to the synthesizer.
      const greeting = await p.g((hi) => ({ hi: __game.npcs[0].def.hi ?? null, synth: __game.voice.synth.includes(hi) }), HI);
      if (greeting.hi !== HI) fail(`${name}: the character of the probe world greets with "${greeting.hi}", expected the world's own line "${HI}"`);
      if (greeting.synth) fail(`${name}: the line "${HI}" of the probe world was left to the synthesizer: its clip ${HI_CLIP}.mp3 did not sound`);
      const chain = await p.g(() => __game.items?.find((i) => i.kind === 'chain') ?? null);
      if (chain?.id !== 'friend' || chain.done !== true) fail(`${name}: with the task of "friend" solved the chain of the description is ${JSON.stringify(chain)}, expected it done`);
      // The book in the probe world is the book of the probe world: the part of its one character, lit by the chain
      // just done, and its own secrets (the ones of its description) - nothing of the world left.
      const awayBook = await p.book();
      const awaySecrets = (await p.g(() => __game.items.filter((i) => i.kind === 'secret').map((i) => i.id))).sort();
      if (awayBook.parts !== PROBE_CHARACTERS.length || awayBook.got !== 1) fail(`${name}: the book in the probe world shows ${awayBook.parts} part(s), ${awayBook.got} lit, expected the ${PROBE_CHARACTERS.length} parts of its characters, the one of "friend" lit: the book still shows the world left`);
      if (!same([...awayBook.secrets].sort(), awaySecrets) || same(awayBook.secrets, homeBook.secrets)) fail(`${name}: the book in the probe world shows the secrets ${JSON.stringify(awayBook.secrets)}, its description has ${JSON.stringify(awaySecrets)} (the first world: ${JSON.stringify(homeBook.secrets)})`);
      const fairyNow = await p.g((w) => JSON.stringify(__game.save.worlds[w]), FIRST);
      if (fairyNow !== fairyThen) fail(`${name}: a task solved in the probe world changed the part of the first world in the save: ${fairyThen} -> ${fairyNow}`);

      // Back: the spot "portal home" of the probe world, by its action button.
      await p.g(() => __game.teleport(7, 4.5));
      await p.page.locator('#btnAct:not(.hidden)').waitFor({ timeout: T(30000) }).catch(() => { throw new Error(`${name}: no action button at the portal of the probe world`); });
      await p.page.locator('#btnAct').dispatchEvent('pointerdown');
      await p.until(() => __game.transitioning, null, 'the action button at the portal of the probe world did not start a change of world', 30000);
      await p.until((w) => !__game.transitioning && __game.world === w && !__game.busy, FIRST, 'the portal of the probe world did not bring the game back to the first world', 240000);
      const back = await p.state();
      await p.page.screenshot({ path: join(root, shots, 'travel-back.png') });
      if (back.mark !== mark) fail(`${name}: the mark left in window is gone after the way back (${back.mark}): the page was reloaded`);
      if (!same(back.at, left)) fail(`${name}: back in the first world the heroine stands at ${back.at}, she was left at ${left}`);
      if (!same(back.same, [])) fail(`${name}: back in the first world these are not the objects the game started with: ${JSON.stringify(back.same)}`);
      // R81: the list of the probe world's clips is taken back with the world - its line has no clip here again.
      if (back.ownClip !== null) fail(`${name}: back in the first world the line "${HI}" of the probe world still has the clip "${back.ownClip}": the list of the world left was not taken back`);
      for (const k of ['npcs', 'names', 'described', 'scene', 'onHero', 'flies', 'suns', 'sun', 'music', 'crystals', 'foxClip', 'ownClip', 'sharedClip', 'hud']) {
        if (!same(back[k], home[k])) fail(`${name}: the first world entered again differs from the first time in "${k}": ${JSON.stringify(home[k])} then, ${JSON.stringify(back[k])} now`);
      }
      // Entered again, the first world may not hold more than it did (TECH-15 allows 10 % over five rounds; this is one).
      for (const k of ['geometries', 'textures']) {
        if (back.held[k] > home.held[k] * 1.1) fail(`${name}: the renderer holds ${back.held[k]} ${k} in the first world entered again, ${home.held[k]} the first time: more than 10 % over`);
      }
      if (back.focus || back.inTask || back.shown.length) fail(`${name}: back in the first world something is left on the screen: ${JSON.stringify({ focus: back.focus, inTask: back.inTask, shown: back.shown })}`);
      const backBook = await p.book();
      if (!same(backBook, homeBook)) fail(`${name}: back in the first world the book shows ${JSON.stringify(backBook)}, before the change it showed ${JSON.stringify(homeBook)}`);
      if (!(await p.walks())) fail(`${name}: the heroine does not walk in the first world after the way back`);
      // ---- out of the water (R89): she walks (above) and JUMPS, her wand, her petals and the jump button are back ----
      await p.until(() => __game.hero.current === 'Idle', null, 'back in the first world the heroine does not stand in Idle');
      const ashore = await heroine();
      if (Math.abs(ashore.above) > 0.01 || ashore.lent.length || !ashore.jumpButton || !ashore.wand || ashore.petals !== dry.petals) fail(`${name}: back in the first world she is ${ashore.above.toFixed(3)} m above the ground, the swimming clips lent are ${JSON.stringify(ashore.lent)}, the jump button is ${ashore.jumpButton ? 'shown' : 'hidden'}, the wand "${WAND}" is ${ashore.wand ? 'seen' : 'not seen'}, ${ashore.petals} petal(s) are seen (${dry.petals} before the change)`);
      const jump = await jumpSample();
      if (!(jump.rise > 0.5) || !jump.clips.includes('Jump') || jump.end > 0.01) fail(`${name}: back in the first world the jump lifted her ${jump.rise.toFixed(3)} m, ended ${jump.end.toFixed(3)} m above the ground, with the clips ${JSON.stringify(jump.clips)}: expected up, the clip Jump, and down again`);
      await p.solveWith('fox', FIRST);
      const kept = await p.g((w) => __game.save.worlds[w].quests.friend, PROBE);
      if (kept !== 1) fail(`${name}: back in the first world the save holds ${kept} for the task solved in the probe world, expected 1`);
      if (loads !== 1) fail(`${name}: the page was loaded ${loads} time(s) during the changes of world, expected once`);

      // After a reload the progress of each world is in its own part of the save, and the game starts in the first world.
      await p.page.reload();
      await p.page.locator('#play').waitFor({ state: 'visible', timeout: T(240000) });
      await p.until(() => !!window.__game?.save, null, 'no window.__game after the reload');
      const after = await p.g(([a, b]) => ({ world: __game.world, mark: window.__travelMark ?? null, first: __game.save.worlds[a]?.quests, probe: __game.save.worlds[b]?.quests, stars: __game.save.stars }), [FIRST, PROBE]);
      if (after.mark !== null) fail(`${name}: the mark in window survived a reload of the page: it proves nothing`);
      if (after.world !== FIRST) fail(`${name}: after the reload the game starts in "${after.world}", expected "${FIRST}"`);
      if (after.first?.fox !== 1 || after.probe?.friend !== 1) fail(`${name}: after the reload the save holds ${JSON.stringify(after.first)} for the first world and ${JSON.stringify(after.probe)} for the probe world, expected fox: 1 and friend: 1`);
      if (after.stars !== 6) fail(`${name}: after the reload the save holds ${after.stars} stars, expected the 6 of the two tasks`);
      await p.ctx.close();
    }

    /**
     * The cat says that the network is needed (the refusal of the gate, src/main.ts): the line "need_net" is on and
     * a clip has started since `clips` clips were counted - its recorded clip of the core, never the synthesizer.
     */
    const saidNeedNet = async (p, name, clips) => {
      await p.until(([k, n]) => __game.line === k && __game.voice.clips > n, [NEED_NET, clips], `the cat did not say "${NEED_NET}" by a clip`, 30000)
        .catch((e) => fail(e.message));
      const v = await p.g((k) => ({ synth: __game.voice.synth.includes(k), clip: __game.clipFor(k) }), NEED_NET);
      if (v.synth) fail(`${name}: the line "${NEED_NET}" was left to the synthesizer: its recorded clip did not sound`);
      if (v.clip !== NEED_NET) fail(`${name}: the line "${NEED_NET}" has the clip "${v.clip}", expected the clip of the core voice/${NEED_NET}.mp3`);
    };
    /** The server is told the network goes off now (OFFLINE_MARK), then the network of the context is switched off. */
    const offline = async (p) => {
      await p.g((path) => fetch(path, { cache: 'no-store' }).then(() => true), OFFLINE_MARK);
      await p.ctx.setOffline(true);
    };
    /** Nothing of the probe world was asked of the server since the last mark: what the page had, it had from its cache. */
    const noneAsked = (name, what) => {
      const off = askedOffline(asked, PROBE);
      if (!off.marked) fail(`${name}: the server was never told the network went off (${OFFLINE_MARK}): what was asked without network is not known`);
      for (const f of off.late) fail(`${name}: ${what}: with the network switched off the server was still asked for ${f}`);
    };
    /** The service worker has taken the page: without it nothing of the game is there without network. */
    const taken = (p, name) => p.until(() => !!navigator.serviceWorker?.controller, null, `${name}: the service worker did not take the page`);
    /** The tour of a first entry is skipped the way a tap skips it; the heroine is free. */
    const settled = (p, to) => p.until(() => { if (__game.flyoverPlayer?.active) __game.flyoverPlayer.skip(); return !__game.busy && !__game.transitioning && !__game.flyoverPlayer?.active; }, null, `the game stayed busy after the change to "${to}"`);

    // ---- "the files are gone": the files of the probe world are not on the server ----
    // The network answers, so the gate lets the world in "from the network"; its download gets 404s, the world is not
    // ready - and the game is back in the first world, the cat saying that the network is needed.
    let notFound = 0;
    {
      const name = 'the files are gone';
      block(PROBE);
      const p = await open(name, true);
      await p.page.goto(`${url}?debug${q}`);
      await p.start();
      const mark = `mark-${Date.now()}`;
      await p.g((m) => { window.__travelMark = m; __game.teleport(1.5, 11); }, mark);
      await p.until(() => Math.abs(__game.hero.root.position.x - 1.5) < 0.01, null, 'the heroine was not moved');
      const home = await p.state();
      const clipsBefore = await p.g(() => __game.voice.clips);
      const refused = await p.travel(PROBE);
      if (refused.ok !== false) fail(`${name}: __game.travel('${PROBE}') answered ${refused.ok} with the files of the world gone, expected false`);
      for (const x of travelFramesProblems(refused.frames, FIRST, FIRST)) fail(`${name}: ${x}`);
      const back = await p.state();
      await saidNeedNet(p, name, clipsBefore);
      await p.page.screenshot({ path: join(root, shots, 'travel-failed.png') });
      if (back.mark !== mark) fail(`${name}: the mark left in window is gone (${back.mark}): the page was reloaded`);
      if (back.world !== FIRST || back.busy || back.going) fail(`${name}: after the failed change the game is in "${back.world}" (busy: ${back.busy}, changing: ${back.going}), expected the first world with the controls returned`);
      for (const k of ['at', 'npcs', 'names', 'described', 'scene', 'onHero', 'flies', 'suns', 'music', 'crystals', 'foxClip', 'ownClip', 'sharedClip', 'hud', 'shown']) {
        if (!same(back[k], home[k])) fail(`${name}: the first world built again differs from before in "${k}": ${JSON.stringify(home[k])} then, ${JSON.stringify(back[k])} now`);
      }
      const downloaded = await p.g((id) => __game.worlds.status(id), PROBE);
      if (downloaded === 'ready') fail(`${name}: the probe world is "ready" with its files gone from the server: the check is blind`);
      if (!(await p.walks())) fail(`${name}: the heroine does not walk after the failed change`);
      await p.solveWith('fox', FIRST);
      // With the files back the same change goes through: the failed one left nothing in its way.
      block(null);
      const again = await p.travel(PROBE);
      if (again.ok !== true) fail(`${name}: with the files back __game.travel('${PROBE}') answered ${again.ok}, expected true`);
      for (const x of travelFramesProblems(again.frames, FIRST, PROBE)) fail(`${name}, with the files back: ${x}`);
      const away = await p.state();
      if (away.world !== PROBE || !same(away.npcs, PROBE_CHARACTERS) || !Array.isArray(away.described)) fail(`${name}: with the files back the game is in "${away.world}" with the characters ${JSON.stringify(away.npcs)} and the description ${JSON.stringify(away.described)}, expected the probe world`);
      notFound = p.expected.notFound;
      await p.ctx.close();
    }

    // ---- "the closed portal", then "open from the cache" (R07, R12) ----
    // The probe world is not in the cache (a new browser; the browser saves data, so "Play" downloads nothing in the
    // background) and there is no network: the change is refused before the frame closes - the cat says the network
    // is needed by its recorded clip, the heroine walks, the game goes on in the first world. Then the world is
    // downloaded with the network, the network goes off again, and the change goes through from the cache. "Without
    // network" is the server's count after the mark: the browser's switch does not reach the service worker's requests.
    {
      const name = 'the closed portal';
      const p = await open(name, false, true);
      await p.page.goto(`${url}?debug${q}`);
      await p.start();
      await taken(p, name);
      const before = await p.g((id) => __game.worlds.status(id), PROBE);
      if (before !== 'none') fail(`${name}: the probe world is "${before}" before the change, expected "none": the closed portal is tried on a world in the cache`);
      await offline(p);
      const home = await p.state();
      const layer = await p.g(() => ({ clips: __game.voice.clips, frames: __game.fade.frames }));
      const refused = await p.travel(PROBE);
      if (refused.ok !== false) fail(`${name}: without network and without the cache __game.travel('${PROBE}') answered ${refused.ok}, expected false`);
      // While the gate is asked the heroine stands (the controls are taken); the frame is never touched.
      const shut = refused.frames.filter((f) => f.phase !== 'idle' || f.closed || f.world !== FIRST);
      if (shut.length) fail(`${name}: the refused change touched the frame: ${JSON.stringify(shut[0])} (in ${shut.length} of ${refused.frames.length} frames)`);
      const after = await p.g(() => ({ frames: __game.fade.frames, phase: __game.fade.phase, going: __game.transitioning }));
      if (after.frames !== layer.frames || after.phase !== 'idle' || after.going) fail(`${name}: the layer of the transition was drawn for a refused change (${layer.frames} -> ${after.frames} frames of it, phase ${after.phase}, changing: ${after.going})`);
      await saidNeedNet(p, name, layer.clips);
      await p.page.screenshot({ path: join(root, shots, 'travel-closed.png') });
      const back = await p.state();
      if (back.world !== FIRST || back.busy || back.going) fail(`${name}: after the refusal the game is in "${back.world}" (busy: ${back.busy}, changing: ${back.going}), expected the first world with the controls free`);
      for (const k of ['at', 'npcs', 'names', 'scene', 'onHero', 'flies', 'music', 'hud']) {
        if (!same(back[k], home[k])) fail(`${name}: the first world differs after the refusal in "${k}": ${JSON.stringify(home[k])} then, ${JSON.stringify(back[k])} now`);
      }
      if (!(await p.walks())) fail(`${name}: the heroine does not walk after the refusal`);
      await p.solveWith('fox', FIRST);
      noneAsked(name, 'the closed portal');
      const still = await p.g((id) => __game.worlds.status(id), PROBE);
      if (still !== 'none') fail(`${name}: after the refusal the probe world is "${still}", expected "none"`);

      // "the launch refused" (WORLD-01, R17): the save says she stopped in the probe world, which is not in the cache,
      // and the page is loaded again without network - the launch asks the same gate: the first world opens, and once
      // the entry after "Play" is over the cat says the network is needed.
      const name1 = 'the launch refused';
      // the game saves itself on the way out (pagehide), with the field set here
      await p.g((id) => { __game.save.lastWorld = id; }, PROBE);
      await p.page.reload();
      await p.until(() => !!window.__game?.save, null, `${name1}: no window.__game after the reload`, 240000);
      const launched = await p.g(() => ({ world: __game.world, last: __game.save.lastWorld, clips: __game.voice.clips }));
      if (launched.world !== FIRST) fail(`${name1}: without network and cache the game launched in "${launched.world}", expected "${FIRST}"`);
      if (launched.last !== PROBE) fail(`${name1}: before "Play" the save says she stopped in "${launched.last}", expected "${PROBE}" (it is the one tried)`);
      await p.start();
      await saidNeedNet(p, name1, launched.clips);
      const played = await p.g(() => __game.save.lastWorld);
      if (played !== FIRST) fail(`${name1}: after "Play" the save says she stopped in "${played}", expected "${FIRST}", where she plays`);
      noneAsked(name1, 'the launch refused');

      // "open from the cache": downloaded with the network, entered without it
      const name2 = 'open from the cache';
      await p.ctx.setOffline(false);
      const got = await p.g((id) => __game.worlds.download(id), PROBE);
      if (got.status !== 'ready') fail(`${name2}: the download of the probe world ended as ${JSON.stringify(got)}, expected "ready"`);
      await offline(p);
      const there = await p.travel(PROBE);
      if (there.ok !== true) fail(`${name2}: without network, the world in the cache, __game.travel('${PROBE}') answered ${there.ok}, expected true`);
      for (const x of travelFramesProblems(there.frames, FIRST, PROBE)) fail(`${name2}: ${x}`);
      await settled(p, PROBE);
      const away = await p.state();
      if (away.world !== PROBE || !same(away.npcs, PROBE_CHARACTERS)) fail(`${name2}: the game is in "${away.world}" with the characters ${JSON.stringify(away.npcs)}, expected the probe world`);
      if (!(await p.walks())) fail(`${name2}: the heroine does not walk in the probe world entered without network`);
      noneAsked(name2, 'the probe world entered from the cache');

      // "the launch where she stopped" (WORLD-01, R27): she stopped in the probe world; the page is loaded again
      // without network and the game opens in the probe world from the cache, where she stood.
      const name3 = 'the launch where she stopped';
      const left = await p.g(() => { return { last: __game.save.lastWorld, at: [__game.hero.root.position.x, __game.hero.root.position.z].map((v) => Math.round(v * 100) / 100) }; });
      if (left.last !== PROBE) fail(`${name3}: in the probe world the save says she stopped in "${left.last}", expected "${PROBE}"`);
      await p.page.reload();
      await p.until(() => !!window.__game?.save && typeof window.__game.travel === 'function', null, `${name3}: no window.__game after the reload`, 240000);
      const relaunched = await p.state();
      if (relaunched.world !== PROBE || !same(relaunched.npcs, PROBE_CHARACTERS)) fail(`${name3}: the game launched in "${relaunched.world}" with the characters ${JSON.stringify(relaunched.npcs)}, expected the probe world`);
      if (!same(relaunched.at, left.at)) fail(`${name3}: in the probe world launched again she stands at ${relaunched.at}, she was left at ${left.at}`);
      await p.start();
      if (!(await p.walks())) fail(`${name3}: the heroine does not walk in the probe world launched without network`);
      noneAsked(name3, 'the probe world launched from the cache');
      await p.ctx.close();
    }

    // ---- "rounds": five times "first world -> probe world -> back" (TECH-15, R10, R19, R20, R22) ----
    // A new browser that saves data: the first change brings the probe world from the network, and only the change
    // itself can make it "ready". After each round the garbage is collected and the heap, the geometries, the
    // textures and the programs of the renderer are read; after the fifth none may be more than 10 % over the first.
    // The middle of the closing of the first change is pictured, in the size of a phone (R22). Then the network goes
    // off and the page is reloaded: the progress of both worlds is where it was, and the probe world opens from the
    // cache - the server asked for none of its files.
    const rounds = [];
    rounds.want = wantRounds;
    {
      const name = 'rounds';
      const p = await open(name, false, true);
      await p.page.goto(`${url}?debug${q}`);
      await p.start();
      await taken(p, name);
      const cdp = await p.ctx.newCDPSession(p.page);
      const before = await p.g((id) => __game.worlds.status(id), PROBE);
      if (before !== 'none') fail(`${name}: the probe world is "${before}" before the first change, expected "none": the entry by the network is tried on a world in the cache`);
      await p.solveWith('fox', FIRST);
      // She walks up to the change, as to a portal: the camera follows her again after the close-up of the task (the
      // iris closes on the heroine where the camera shows her at its start).
      if (!(await p.walks())) fail(`${name}: the heroine does not walk in the first world`);
      // The first change, by the network; caught in the middle of its closing by the game's own clock (`still`, not the
      // debug stop of the layer): the picture is of a change that really runs.
      await watchPrograms(p.page);   // the kinds of the first round: from its very first change on
      const mid = await p.g((to) => new Promise((res) => {
        window.__roundGoing = __game.travel(to);
        const f = __game.fade;
        const tick = () => {
          if (f.phase === 'closing' && f.uniforms.uCover.value >= 0.45) { __game.still(true); res(f.uniforms.uCover.value); return; }
          if (!__game.transitioning) { res(null); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), PROBE);
      if (mid === null) fail(`${name}: the middle of the closing of the first change was never drawn`);
      else {
        const size = await p.g(() => [innerWidth, innerHeight]);
        await p.page.screenshot({ path: join(root, shots, 'travel-mid.png') });
        console.log(`[worlds] the middle of a real change of world, ${size.join('x')} (the phone lying): the frame ${(mid * 100).toFixed(0)} % covered - ${shots}/travel-mid.png`);
        if (!(mid < 0.75)) fail(`${name}: the frame was ${mid} covered when the middle of the closing was pictured`);
      }
      await p.g(() => { __game.still(false); });
      const first = await p.g(() => window.__roundGoing);
      if (first !== true) fail(`${name}: the first change to "${PROBE}", by the network, answered ${first}, expected true`);
      // The entry by the network has brought the whole world into the cache, its voice too (README of K, 1 and 2).
      const kept = await p.g(async (id) => ({ status: await __game.worlds.status(id), cached: await __game.worlds.cached(id) }), PROBE);
      if (kept.status !== 'ready' || !same(kept.cached, files)) fail(`${name}: after the entry by the network the probe world is "${kept.status}" with ${JSON.stringify(kept.cached)} in the cache, expected "ready" with ${JSON.stringify(files)}`);
      await settled(p, PROBE);
      await p.solveWith('friend', PROBE);
      const home = await p.g((id) => __game.travel(id), FIRST);
      if (home !== true) fail(`${name}: the way back to "${FIRST}" answered ${home}, expected true`);
      await settled(p, FIRST);
      rounds.push(await readRound(p.page, cdp, 1));
      console.log(`[worlds] ${name}: ${roundLine(rounds[0])}`);
      for (let n = 2; n <= rounds.want; n++) {
        for (const x of await playRound(p.page, p.until)) fail(`${name}, round ${n}: ${x}`);
        rounds.push(await readRound(p.page, cdp, n));
        console.log(`[worlds] ${name}: ${roundLine(rounds[rounds.length - 1])}`);
      }
      for (const x of roundProblems(rounds, rounds.want)) fail(`${name}: ${x}`);
      // The progress of both worlds after a reload, without network; the probe world opens from the cache.
      const progress = () => p.g(([a, b]) => JSON.stringify({ first: __game.save.worlds[a]?.quests ?? null, probe: __game.save.worlds[b]?.quests ?? null, stars: __game.save.stars }), [FIRST, PROBE]);
      const was = await progress();
      if (!/"fox":1/.test(was) || !/"friend":1/.test(was)) fail(`${name}: before the reload the save holds ${was}, expected the tasks of "fox" and "friend": the check of the progress would be blind`);
      await offline(p);
      await p.page.reload();
      await p.page.locator('#play').waitFor({ state: 'visible', timeout: T(240000) });   /* clock: page-load */
      await p.until(() => !!window.__game?.save, null, 'no window.__game after the reload');
      const now = await progress();
      if (now !== was) fail(`${name}: after the reload the progress is ${now}, before it it was ${was}`);
      await p.start();
      const again = await p.travel(PROBE);
      if (again.ok !== true) fail(`${name}: after the reload, without network, __game.travel('${PROBE}') answered ${again.ok}: the entry by the network did not leave the world ready in the cache`);
      noneAsked(name, 'the probe world entered again after the reload');
      await p.ctx.close();
    }
    if (failures) return '';
    return `the change of world: "${FIRST}" -> "${PROBE}" by __game.travel and back by the portal with no reload of the page; behind the closed frame no line, no music and no interface; `
      + `the line "${HI}" has its clip ${HI_CLIP} only while "${PROBE}" plays and was said by it; `
      + `each world's progress in its own part of the save, also after a reload; with the files of "${PROBE}" gone (${notFound} answers 404) its download failed, the game went back to "${FIRST}", the cat said "${NEED_NET}" by its clip and the game played on; `
      + `without network and cache the portal stayed closed (the frame never closed, "${NEED_NET}" by its clip, the heroine walked, a task was solved, the server asked for nothing of "${PROBE}"), a launch in "${PROBE}" without its cache opened "${FIRST}" and the cat said "${NEED_NET}" after "Play"; once downloaded "${PROBE}" opened without network, and a launch there opened it from the cache where she stood; `
      + `${rounds.want} rounds there and back (${rounds.map((r) => `${(r.heap / 1048576).toFixed(1)} MB/${r.geometries}g/${r.textures}t/${r.programs}p`).join(', ')}), the fifth within ${ROUND_GROWTH * 100} % of the first${rounds.want > ROUNDS ? ', and so the last of the later half' : ''}; the progress of both worlds after a reload without network, "${PROBE}" opened from the cache; `
      + `${((Date.now() - started) / 1000).toFixed(0)} s; pictures: ${shots}/travel-*.png`;
  } finally {
    block(null);
    await browser.close().catch(() => {});
  }
}

/**
 * The scenarios of the transition between worlds (6 above) on the build served at `url`; the pictures go to `shots`.
 * Every failure goes to `fail`; returns the line to print when it all came to its end without one ('' otherwise).
 */
async function transitionScenarios({ url, shots, fail: report }) {
  let failures = 0;
  const fail = (msg) => { failures++; report(`the transition: ${msg}`); };
  const { chromium } = await import('playwright-core');
  const { default: sharp } = await import('sharp');
  const GL_ARGS = { gl: ['--use-angle=gl', '--enable-gpu'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  const gl = process.env.E2E_GL || 'gl';
  if (!GL_ARGS[gl]) throw new Error(`unknown E2E_GL="${gl}": use "gl" or "swiftshader"`);
  const slow = Number(process.env.E2E_SLOW || 1);
  if (!(slow > 0)) throw new Error(`bad E2E_SLOW="${process.env.E2E_SLOW}"`);
  const T = (ms) => Math.round(ms * slow);
  const origin = new URL(url).origin;
  const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome', headless: true,
    args: [...GL_ARGS[gl], '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  try {
    const closedOn = {};   // the closed frame of each path, to compare the two
    const times = {};
    for (const q of [2, 0]) {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      await ctx.addInitScript(() => { sessionStorage.setItem('amw-gift-hold', '1'); sessionStorage.setItem('amw-mystery-hold', '1'); });
      await ctx.route((u) => !own(u.href), (route) => route.abort());   // nothing leaves for the internet
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') fail(`q${q}: console ${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => fail(`q${q}: pageerror: ${e.message}`));
      await page.goto(`${url}?debug&q=${q}`);
      // With the bloom on software rendering (the CI runner) the game loads and draws many times slower: generous limits.
      await page.locator('#play').waitFor({ state: 'visible', timeout: T(240000) });
      await page.waitForFunction(() => !!window.__game?.fade && typeof __game.transition === 'function' && __game.time > 0, null, { timeout: T(30000) })
        .catch(() => { throw new Error(`q${q}: no window.__game.transition and window.__game.fade - the game does not show its transition with ?debug`); });
      // The layer is drawn in the canvas, the interface lies over it: only the canvas is pictured.
      await page.addStyleTag({ content: 'body > *:not(canvas) { visibility: hidden !important; }' });
      /** In how many of the next frames the layer is drawn (seven of them pass). */
      const drawn = () => page.evaluate(() => new Promise((res) => {
        const from = __game.fade.frames;
        let n = 0;
        const f = () => { if (++n < 7) requestAnimationFrame(f); else res(__game.fade.frames - from); };
        requestAnimationFrame(f);
      }));
      /** Stops the layer at a point, waits until two frames were drawn with it, pictures the screen. */
      const hold = async (p, progress, name) => {
        const n = await page.evaluate(([point, f]) => { __game.transition(point, f); return __game.fade.frames; }, [p, progress]);
        await page.waitForFunction((from) => __game.fade.frames > from + 1, n, { timeout: T(90000) })
          .catch(() => { throw new Error(`q${q}: __game.transition(${p}) did not bring the layer to the screen: no frame was drawn with it`); });
        const { data, info } = await sharp(await page.screenshot({ path: join(root, shots, `${name}.png`) })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        return { data, width: info.width, height: info.height };
      };

      const early = await drawn() + await page.evaluate(() => __game.fade.frames);
      if (early !== 0) fail(`q${q}: the layer is drawn before any transition: in ${early} frame(s)`);
      // Nine frames, the layer stopped in every second one. This callback runs after the game's frame of the same
      // tick (the game asked for its next frame first): it reads the frame just drawn and sets the next one.
      // Counted: the draw calls of a frame (renderer.info.render.calls, as the counter of ?debug shows them) less the
      // drawing of the world itself - what the world draws changes from frame to frame by a call or two (seen on the
      // first runs of this check), what is drawn after it (the passes of the bloom, the layer) does not.
      const calls = await page.evaluate(() => new Promise((res) => {
        const r = __game.renderer, plain = r.render, got = [];
        let world = 0;
        r.render = function (scene, camera) {
          const from = r.info.render.calls;
          plain.call(r, scene, camera);
          if (scene === __game.scene) world += r.info.render.calls - from;
        };
        const f = () => {
          got.push(r.info.render.calls - world);
          world = 0;
          __game.transition(got.length % 2 && got.length < 9 ? 0.5 : null);
          if (got.length < 9) requestAnimationFrame(f); else { r.render = plain; res(got); }
        };
        requestAnimationFrame(f);
      }));
      for (const p of layerCallsProblems(calls)) fail(`q${q}: ${p}`);
      const mid = await hold(0.5, 0, `transition-q${q}-mid`);
      const closed = closedOn[q] = await hold(1, 0.6, `transition-q${q}-loading`);
      for (const p of closedProblems(closed)) fail(`q${q}: the loading screen: ${p}`);
      for (const p of irisProblems(mid, closed)) fail(`q${q}: the middle of the closing: ${p}`);
      const filled = ringPixels(closed);
      if (q === 0) {
        // the ring at 0 and at 1: it grows with the progress
        const none = ringPixels(await hold(1, 0, 'transition-q0-loading-0')), whole = ringPixels(await hold(1, 1, 'transition-q0-loading-1'));
        if (!(whole > 2000 && none < whole * 0.1 && filled > whole * 0.45 && filled < whole * 0.75)) {
          fail(`q0: the loading ring does not grow with the progress: ${none} px filled at 0, ${filled} px at 0.6, ${whole} px at 1`);
        }
        // the phone turned upright: the hole is still a circle
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => __game.renderer.domElement.width < __game.renderer.domElement.height, null, { timeout: T(30000) })
          .catch(() => { throw new Error('q0: the canvas did not follow the screen turned upright'); });
        const upright = await hold(0.5, 0, 'transition-q0-portrait-mid'), uprightClosed = await hold(1, 0.6, 'transition-q0-portrait-loading');
        for (const p of closedProblems(uprightClosed)) fail(`q0, upright: the loading screen: ${p}`);
        for (const p of irisProblems(upright, uprightClosed)) fail(`q0, upright: the middle of the closing: ${p}`);
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction(() => __game.renderer.domElement.width > __game.renderer.domElement.height, null, { timeout: T(30000) })
          .catch(() => { throw new Error('q0: the canvas did not follow the screen turned back'); });
      } else if (!(filled > 2000)) fail(`q${q}: the loading ring is not on the loading screen: ${filled} px of its colours`);
      await page.evaluate(() => __game.transition(null));
      const left = await drawn();
      if (left) fail(`q${q}: the layer is still drawn after __game.transition(null): in ${left} frame(s)`);

      if (q === 0) {
        // A transition for real, in game time: closes, stays closed 0.6 s with the world not ready, opens after ready().
        let timer;
        const live = await Promise.race([
          page.evaluate(() => new Promise((res) => {
            const f = __game.fade, t0 = __game.time, out = {};
            f.start();
            const tick = () => {
              const t = __game.time;
              if (out.closing === undefined) { if (f.closed) { out.closing = t - t0; out.closedAt = t; f.setProgress(0.5); } }
              else if (out.held === undefined) { if (t - out.closedAt >= 0.6) { out.held = f.closed && f.phase === 'hold'; out.readyAt = t; f.ready(); } }
              else if (!f.active) { out.opening = t - out.readyAt; res(out); return; }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          })),
          new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`q0: a started transition did not come to its end in ${T(90000)} ms: the frame did not close, or did not open after ready()`)), T(90000)); }),
        ]).finally(() => clearTimeout(timer));
        times.closing = live.closing; times.opening = live.opening;
        if (!(live.closing >= 0.4 && live.closing <= 1.5)) fail(`q0: the frame closed in ${live.closing} s of game time, expected 0.4 to 1.5`);
        if (!live.held) fail('q0: the frame did not stay closed while the world was not ready');
        if (!(live.opening >= 0.4 && live.opening <= 2.5)) fail(`q0: the frame opened ${live.opening} s of game time after ready(), expected 0.4 to 2.5`);
        const ended = await drawn();
        if (ended) fail(`q0: the layer is still drawn after a transition played to its end: in ${ended} frame(s)`);
      }
      await ctx.close();
    }
    const apart = layerDifference(closedOn[2], closedOn[0]);
    if (apart > 6) fail(`the closed frame with the bloom (q2) is not the colour it is without (q0): they differ by ${apart} of 255 - the bloom or the tone curve reaches the layer`);
    if (failures) return '';
    return 'the transition: the layer is on the screen with the bloom (q2) and without (q0), one draw call a frame and none outside a transition; the hole is a circle '
      + `(844x390 and 390x844), the loading screen is one colour on both paths, the ring grows with the progress; played for real it closed in ${times.closing.toFixed(2)} s `
      + `and opened ${times.opening.toFixed(2)} s of game time after "ready"; pictures: ${shots}/transition-*.png`;
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * The scenarios of the cache of the next world (5 above) on the probe build served at `url`: `asked` is the server's
 * record of requests, `list` worlds.json of the build. Every failure goes to `fail`; returns the line to print when
 * all three scenarios came to their end without one ('' otherwise).
 */
async function cacheScenarios({ url, asked, list, fail: report }) {
  let failures = 0;
  const fail = (msg) => { failures++; report(msg); };
  const { chromium } = await import('playwright-core');
  const GL_ARGS = { gl: ['--use-angle=gl', '--enable-gpu'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  const gl = process.env.E2E_GL || 'gl';
  if (!GL_ARGS[gl]) throw new Error(`unknown E2E_GL="${gl}": use "gl" or "swiftshader"`);
  const slow = Number(process.env.E2E_SLOW || 1);
  if (!(slow > 0)) throw new Error(`bad E2E_SLOW="${process.env.E2E_SLOW}"`);
  const T = (ms) => Math.round(ms * slow);
  const listed = list?.worlds?.[PROBE]?.files ?? [];
  if (!listed.length) throw new Error(`${WORLDS_LIST} lists no file of the world "${PROBE}": there is nothing to download`);
  const files = listed.map((f) => f.url).sort();
  // The clips of the world's voice are asked for when a line is said, the rest of its files when the world is built.
  const clips = files.filter(isVoice), built = files.filter((f) => !isVoice(f));
  if (!clips.length) throw new Error(`${WORLDS_LIST} lists no clip of the voice of the world "${PROBE}" (voice/${PROBE}/): the voice of a next world is tried on nothing`);
  const origin = new URL(url).origin;
  const q = process.env.Q ? `&q=${process.env.Q}` : '';
  const own = (u) => { try { const x = new URL(u); return x.protocol === 'data:' || x.protocol === 'blob:' || x.origin === origin; } catch { return false; } };

  // Chrome as in tools/update.mjs; a context of its own, so the cache starts empty.
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome', headless: true,
    args: [...GL_ARGS[gl], '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { sessionStorage.setItem('amw-gift-hold', '1'); sessionStorage.setItem('amw-mystery-hold', '1'); });
    await ctx.route((u) => !own(u.href), (route) => route.abort());   // nothing leaves for the internet
    /** The game's page: console errors and warnings, page errors, failed requests and HTTP errors are failures. */
    const watch = (page, name) => {
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') fail(`${name}: console ${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => fail(`${name}: pageerror: ${e.message}`));
      page.on('requestfailed', (r) => fail(`${name}: request failed: ${r.url()} (${r.failure()?.errorText})`));
      page.on('response', (r) => { if (r.status() >= 400) fail(`${name}: HTTP ${r.status()} for ${r.url()}`); });
    };
    const who = (r) => `${r.path}${r.search} (asked by ${r.referer || 'nobody known'})`;

    // ---- "launch": the first world, until "Play" ----
    const from = asked.length;
    const page = await ctx.newPage();
    watch(page, 'launch');
    await page.goto(`${url}?debug${q}`);
    await page.locator('#play').waitFor({ state: 'visible', timeout: T(90000) });
    // The service worker has installed (its whole list is in the cache) and taken the page: whatever the launch asks
    // for, it has asked for by now.
    const taken = await page.evaluate(async () => {
      const sw = navigator.serviceWorker;
      const reg = await sw.ready;
      if (reg.active.state !== 'activated') await new Promise((r) => reg.active.addEventListener('statechange', function f() { if (reg.active.state === 'activated') { reg.active.removeEventListener('statechange', f); r(); } }));
      if (!sw.controller) await new Promise((r) => sw.addEventListener('controllerchange', r, { once: true }));
      return !!sw.controller;
    });
    if (!taken) throw new Error('launch: the service worker did not activate and take the page');
    await page.waitForFunction(() => !!window.__game?.worlds, null, { timeout: T(30000) })
      .catch(() => { throw new Error('launch: no window.__game.worlds - the game does not show the cache of worlds with ?debug'); });
    const early = askedOfWorld(asked.slice(from), PROBE);
    for (const r of early) fail(`launch: before "Play" the server was asked for a file of the world "${PROBE}": ${who(r)}`);
    const before = await page.evaluate(async () => ({ state: __game.worlds.state(), status: await __game.worlds.status('probe'), kept: (await caches.keys()).includes('worlds') ? (await (await caches.open('worlds')).keys()).length : 0 }));
    if (before.state !== null) fail(`launch: the download of the next world started before "Play": ${JSON.stringify(before.state)}`);
    if (before.status !== 'none' || before.kept) fail(`launch: before "Play" the world "${PROBE}" is "${before.status}" with ${before.kept} file(s) in the cache "worlds", expected "none" and 0`);

    // ---- "download": "Play" starts it; it ends with the world ready ----
    await page.click('#play');
    await page.waitForFunction(() => { const s = __game.worlds.state(); return !!s && !s.running; }, null, { timeout: T(60000) })
      .catch(async () => { throw new Error(`download: after "Play" the download of the next world did not end (its state: ${JSON.stringify(await page.evaluate(() => __game.worlds.state()))})`); });
    const after = await page.evaluate(async (name) => ({
      state: __game.worlds.state(), status: await __game.worlds.status('probe'), cached: await __game.worlds.cached('probe'),
      keys: (await (await caches.open(name)).keys()).map((r) => r.url).sort(),
    }), list.cache);
    const s = after.state;
    if (s.world !== PROBE || s.status !== 'ready' || s.error !== null || s.done !== files.length || s.total !== files.length) {
      fail(`download: expected the world "${PROBE}" ready with ${files.length} of ${files.length} files, the download ended as ${JSON.stringify(s)}`);
    }
    if (after.status !== 'ready') fail(`download: after the download the world "${PROBE}" is "${after.status}", expected "ready"`);
    if (JSON.stringify(after.cached) !== JSON.stringify(files)) fail(`download: the cache holds ${JSON.stringify(after.cached)} of the world, ${WORLDS_LIST} lists ${JSON.stringify(files)}`);
    const expected = files.map((f) => new URL(f, url).href).sort();
    if (JSON.stringify(after.keys) !== JSON.stringify(expected)) fail(`download: the cache "${list.cache}" holds ${JSON.stringify(after.keys)}, expected ${JSON.stringify(expected)}`);
    for (const f of notDownloaded(listed, asked.slice(from))) fail(`download: the server was never asked for ${f} by its fingerprint (?v=…)`);

    // ---- "offline": the probe world from the cache ----
    // The switch takes the network from the pages (navigator.onLine is false), not from the service worker's own
    // requests: what proves the cache is that the server is asked for nothing from here on (`off`) - but for the
    // browser's check for a new worker, which is not the game's (`askedWithoutNetwork`).
    await ctx.setOffline(true);
    const off = asked.length;
    const page2 = await ctx.newPage();
    watch(page2, 'offline');
    const served = new Set();   // the files of the world the service worker answered
    page2.on('response', (r) => {
      const path = new URL(r.url()).pathname.replace(/^\//, '');
      // A clip is asked for by byte ranges: the service worker cuts them from the file it keeps (206).
      if (files.includes(path) && (r.status() === 200 || (r.status() === 206 && isVoice(path))) && r.fromServiceWorker()) served.add(path);
    });
    await page2.goto(`${url}?debug&world=${PROBE}${q}`);
    await page2.locator('#play').waitFor({ state: 'visible', timeout: T(90000) })
      .catch(() => { throw new Error(`offline: the world "${PROBE}" did not load without network ("Play" never appeared)`); });
    await page2.waitForFunction(() => !!window.__game?.worlds && __game.npcs.length > 0, null, { timeout: T(30000) })
      .catch(() => { throw new Error(`offline: the world "${PROBE}" was not built (no window.__game or no character)`); });
    for (const f of built) if (!served.has(f)) fail(`offline: ${f} was not answered by the service worker: the world did not load its file from the cache`);
    const offline = await page2.evaluate(() => __game.worlds.status('probe'));
    if (offline !== 'ready') fail(`offline: the world "${PROBE}" is "${offline}" without network, expected "ready"`);
    await page2.click('#play');
    // The first entry into the world plays its tour: it is ended the way a tap ends it.
    await page2.waitForFunction(() => { if (__game.story?.active) { __game.story.skip(); return false; } if (__game.flyoverPlayer?.active) { __game.flyoverPlayer.skip(); return false; } return !__game.busy && !__game.story?.active; }, null, { timeout: T(60000) })
      .catch(() => fail('offline: the game stayed busy after "Play"'));
    // The character greets with the world's own line, then gives its task: the clip of the greeting is one of the
    // world's own folder, and by the time the task is there the line has been said.
    const hi = await page2.evaluate(() => { const d = __game.npcs[0].def; __game.talk(d.id); return { key: d.hi ?? null, clip: d.hi ? __game.clipFor(d.hi, d.emoji) : null }; });
    if (hi.clip === null || !clips.includes(`voice/${hi.clip}.mp3`)) fail(`offline: the greeting "${hi.key}" of the character has the clip "${hi.clip}", expected one of the world's own folder: ${clips.join(', ')}`);
    await page2.locator('#task:not(.hidden)').waitFor({ timeout: T(30000) })
      .catch(() => fail(`offline: the character of the world "${PROBE}" gave no task`));
    const synth = await page2.evaluate(() => [...__game.voice.synth]);
    if (synth.includes(hi.key)) fail(`offline: the line "${hi.key}" was left to the synthesizer: its clip did not sound from the cache`);
    for (const f of clips) if (!served.has(f)) fail(`offline: ${f} was not answered by the service worker: the line of the world was not said by its clip from the cache`);
    const leaked = askedWithoutNetwork(asked.slice(off));
    if (leaked.length) fail(`offline: the server was asked for ${leaked.length} file(s) with the network switched off: ${leaked.slice(0, 5).map(who).join(', ')}`);
    await ctx.close();
    if (failures) return '';
    return `the cache of the next world: nothing of "${PROBE}" asked for before "Play"; after it ${files.length} file(s) downloaded (${files.join(', ')}), the world ready; `
      + `without network the world was built from the cache, its character greeted by the clip ${clips.join(', ')} from the cache and gave a task`;
  } finally {
    await browser.close().catch(() => {});
  }
}
