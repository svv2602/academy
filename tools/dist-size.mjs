// The size budget of the build (docs/15-tech.md, "Бюджет" and TECH-09), counted per part of the build (tools/world-files.mjs).
// The first load is the core with the first world (the service worker caches it with the installation): the game - code
// and models - at most 12 MB, the recorded voice (dist/voice/) at most 5 MB of its own (decision 2026-11-16: the voice
// must not crowd out the worlds, nor they the voice; 4 MB raised to 5 on 2026-11-18 for the cat's lines of stage 4). Every next world (decision Q14) has a budget of its own: at most
// 8 MB of models and story frames (dist/models/<id>/, dist/story/<id>/) and 3 MB of voice (dist/voice/<id>/).
// One file is at most 1 MB, whatever it belongs to.
// The bank of the old game's clips (dist/bank/, tools/import_old_voice.py) is not part of the first load (R37: the
// service worker does not cache it, vite.config.ts `globIgnores`), so it is in neither limit; the limit for one file holds.
// tools/e2e.mjs runs this after every build it plays.
// tools/assets.mjs keeps the models within their share of it; this checks what is really shipped, code included.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANK, CORE, groupOf, isBank, isVoice, worldGroup, worldOf } from './world-files.mjs';

/** Bytes, as in docs/15-tech.md (12 MB and 1 MB, decimal - the same unit as tools/assets.mjs). */
export const MAX_DIST = 12_000_000;
export const MAX_DIST_FILE = 1_000_000;
/**
 * The recorded voice of the first load: the clips under dist/voice/, a budget of its own (4 -> 5 MB 2026-11-18, 5 -> 6 MB
 * the customer's word of 2026-11-21: the cauldron, the treats, the trade and the puzzle speak in the installation).
 */
export const MAX_VOICE = 6_000_000;
/** A next world: its models and story frames together, and its voice apart (TECH-09). */
export const MAX_WORLD = 8_000_000;
export const MAX_WORLD_VOICE = 3_000_000;

/** The worlds of the game as the sources name them: one folder per world. */
const WORLDS_SRC = fileURLToPath(new URL('../src/worlds', import.meta.url));

/** Every file under `dir` with its size, the heaviest first. */
export function distFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => { const path = join(e.parentPath, e.name); return { path: path.slice(dir.length + 1).split('\\').join('/'), size: statSync(path).size }; })
    .sort((a, b) => b.size - a.size || (a.path < b.path ? -1 : 1));
}

/**
 * The worlds of the source tree, read as text (no TypeScript is run): { first, worlds }. `first` is the world the
 * published game plays - DEFAULT_WORLD of src/worlds/index.ts; `worlds` are the next ones - the other folders of
 * src/worlds/, sorted. Throws when index.ts does not name the first world: every world would count as a next one.
 */
export function sourceWorlds(dir = WORLDS_SRC) {
  const first = /\bDEFAULT_WORLD\b[^=\n]*=\s*['"]([^'"]+)['"]/.exec(readFileSync(join(dir, 'index.ts'), 'utf8'))?.[1];
  if (!first) throw new Error(`${join(dir, 'index.ts')} does not name the first world (DEFAULT_WORLD = '<id>')`);
  const worlds = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).filter((id) => id !== first).sort();
  return { first, worlds };
}

/**
 * The worlds of the installation besides the first one, read as text from src/worlds/index.ts: the ids of
 * `INSTALLED = [DEFAULT_WORLD, 'hub', ...]` (WORLD-01: the hub is part of the installation). Their files are the core's:
 * precached with it and measured with it, never downloaded as a next world. [] when index.ts lists none.
 */
export function installedWorlds(dir = WORLDS_SRC) {
  const list = /\bINSTALLED\b[^=\n]*=\s*\[([^\]]*)\]/.exec(readFileSync(join(dir, 'index.ts'), 'utf8'))?.[1] ?? '';
  return [...list.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

const sum = (files) => files.reduce((s, f) => s + f.size, 0);

/**
 * Checks dist/ against the budget. Returns { total, voice, bank, files, heaviest, problems, first, worlds }.
 * `total` is the game of the core and the first world - without the voice, the bank and the next worlds; `voice` their
 * clips under voice/; `bank` the clips under bank/; `files` counts every file. `worlds` holds one entry per next world,
 * { id, total, voice, files }: its models and story frames, its voice, the number of its files. problems is empty
 * when everything fits. An empty or missing folder is a problem too: there is nothing to measure.
 * `layout` names the worlds and their limits: { worlds, first, maxWorld, maxWorldVoice }. `worlds` are the ids of the
 * next worlds (the first one, if listed, is not a next world); left out, both come from the sources (`sourceWorlds`).
 */
export function checkDistSize(dir, maxTotal = MAX_DIST, maxFile = MAX_DIST_FILE, maxVoice = MAX_VOICE, layout = {}) {
  const { maxWorld = MAX_WORLD, maxWorldVoice = MAX_WORLD_VOICE } = layout;
  const { first, worlds: listed } = layout.worlds ? { first: layout.first ?? null, worlds: layout.worlds }
    : (({ first: f, worlds: w }, inst) => ({ first: f, worlds: w.filter((id) => !inst.includes(id)) }))(sourceWorlds(), installedWorlds());
  const next = [...new Set(listed)].filter((id) => id !== first);
  let files;
  try { files = distFiles(dir); } catch (e) { return { total: 0, voice: 0, bank: 0, files: 0, heaviest: null, problems: [`cannot read ${dir}: ${e.message}`], first, worlds: [] }; }
  const of = (group) => files.filter((f) => groupOf(f.path, next) === group);
  const core = of(CORE), game = core.filter((f) => !isVoice(f.path)), clips = core.filter((f) => isVoice(f.path));
  const bank = sum(of(BANK));
  const total = sum(game), voice = sum(clips);
  const parts = next.map((id) => {
    const own = of(worldGroup(id));
    return { id, game: own.filter((f) => !isVoice(f.path)), clips: own.filter((f) => isVoice(f.path)), files: own.length };
  });
  const problems = files.filter((f) => f.size > maxFile).map((f) => `${f.path}: ${f.size} bytes, the limit for one file is ${maxFile}`);
  // The group is named once the build holds more than one: without files of next worlds the first load is all of dist/.
  const apart = parts.filter((w) => w.files).map((w) => w.id).join(', ');
  const firstLoad = apart ? `the core and the first world (dist/ without voice/, bank/ and the worlds ${apart})` : 'dist/ without voice/ and bank/';
  const firstVoice = apart ? `the voice of the core and the first world (dist/voice/ without the worlds ${apart})` : 'dist/voice/';
  if (total > maxTotal) problems.push(`${firstLoad}: ${total} bytes in ${game.length} files, the limit is ${maxTotal}`);
  if (voice > maxVoice) problems.push(`${firstVoice}: ${voice} bytes in ${clips.length} files, the limit is ${maxVoice}`);
  for (const w of parts) {
    if (sum(w.game) > maxWorld) problems.push(`the world ${w.id} (models/${w.id}/ and story/${w.id}/): ${sum(w.game)} bytes in ${w.game.length} files, the limit is ${maxWorld}`);
    if (sum(w.clips) > maxWorldVoice) problems.push(`the voice of the world ${w.id} (voice/${w.id}/): ${sum(w.clips)} bytes in ${w.clips.length} files, the limit is ${maxWorldVoice}`);
  }
  if (!files.length) problems.push(`${dir} holds no files`);
  // The bank is out of the limits only while the installation does not download it: its files must not be precached.
  const sw = join(dir, 'sw.js');
  const precached = existsSync(sw) ? [...readFileSync(sw, 'utf8').matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]) : [];
  const cached = precached.filter((url) => isBank(url)).length;
  if (cached) problems.push(`sw.js precaches ${cached} files of bank/: the bank is not part of the first load (vite.config.ts globIgnores)`);
  // The same for a next world (TECH-09): it has a budget of its own only while the installation does not download it
  // (the game brings it later, src/core/worldcache.ts).
  for (const id of next) {
    const own = precached.filter((url) => worldOf(url, [id]) === id).length;
    if (own) problems.push(`sw.js precaches ${own} files of the world ${id}: a next world is not part of the first load (vite.config.ts globIgnores)`);
  }
  const worlds = parts.map((w) => ({ id: w.id, total: sum(w.game), voice: sum(w.clips), files: w.files }));
  return { total, voice, bank, files: files.length, heaviest: files[0] ?? null, problems, first, worlds };
}

const mb = (bytes) => (bytes / 1e6).toFixed(2);

/**
 * The result of `checkDistSize` as one line for the step "dist size" of tools/e2e.mjs: the game and the voice of the
 * core with the first world, the same of every next world, the number of files and the heaviest one.
 */
export function sizeSummary(r) {
  const parts = [`the core and the first world${r.first ? ` (${r.first})` : ''}: ${mb(r.total)} MB of the game and ${mb(r.voice)} MB of voice`];
  for (const w of r.worlds ?? []) parts.push(`the world ${w.id}: ${mb(w.total)} MB of models and frames and ${mb(w.voice)} MB of voice`);
  parts.push(`${r.files} files`);
  if (r.heaviest) parts.push(`the heaviest: ${r.heaviest.path}, ${mb(r.heaviest.size)} MB`);
  return parts.join('; ');
}
