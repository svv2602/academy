// The size budget of the build (docs/15-tech.md, "Бюджет"): the first load is the whole dist/ (the service worker
// caches all of it): the game - code and models - at most 12 MB, the recorded voice (dist/voice/) at most 4 MB of its
// own (decision 2026-11-16: the voice must not crowd out the worlds, nor they the voice); one file at most 1 MB.
// The bank of the old game's clips (dist/bank/, tools/import_old_voice.py) is not part of the first load (R37: the
// service worker does not cache it, vite.config.ts `globIgnores`), so it is in neither limit; the limit for one file holds.
// tools/e2e.mjs runs this after every build it plays.
// tools/assets.mjs keeps the models within their share of it; this checks what is really shipped, code included.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Bytes, as in docs/15-tech.md (12 MB and 1 MB, decimal - the same unit as tools/assets.mjs). */
export const MAX_DIST = 12_000_000;
export const MAX_DIST_FILE = 1_000_000;
/** The recorded voice of the first load: the clips under dist/voice/, a budget of its own. */
export const MAX_VOICE = 4_000_000;
const isVoice = (path) => path.startsWith('voice/');
/** The bank: loaded when a clip is first played, outside both limits. */
const isBank = (path) => path.startsWith('bank/');

/** Every file under `dir` with its size, the heaviest first. */
export function distFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => { const path = join(e.parentPath, e.name); return { path: path.slice(dir.length + 1).split('\\').join('/'), size: statSync(path).size }; })
    .sort((a, b) => b.size - a.size || (a.path < b.path ? -1 : 1));
}

/**
 * Checks dist/ against the budget. Returns { total, voice, bank, files, heaviest, problems }: `total` is the game without
 * the voice and the bank, `voice` the clips under voice/, `bank` those under bank/; problems is empty when it fits.
 * An empty or missing folder is a problem too: there is nothing to measure.
 */
export function checkDistSize(dir, maxTotal = MAX_DIST, maxFile = MAX_DIST_FILE, maxVoice = MAX_VOICE) {
  let files;
  try { files = distFiles(dir); } catch (e) { return { total: 0, voice: 0, bank: 0, files: 0, heaviest: null, problems: [`cannot read ${dir}: ${e.message}`] }; }
  const game = files.filter((f) => !isVoice(f.path) && !isBank(f.path)), clips = files.filter((f) => isVoice(f.path));
  const bank = files.filter((f) => isBank(f.path)).reduce((s, f) => s + f.size, 0);
  const total = game.reduce((s, f) => s + f.size, 0), voice = clips.reduce((s, f) => s + f.size, 0);
  const problems = files.filter((f) => f.size > maxFile).map((f) => `${f.path}: ${f.size} bytes, the limit for one file is ${maxFile}`);
  if (total > maxTotal) problems.push(`dist/ without voice/ and bank/: ${total} bytes in ${game.length} files, the limit is ${maxTotal}`);
  if (voice > maxVoice) problems.push(`dist/voice/: ${voice} bytes in ${clips.length} files, the limit is ${maxVoice}`);
  if (!files.length) problems.push(`${dir} holds no files`);
  // The bank is out of the limits only while the installation does not download it: its files must not be precached.
  const sw = join(dir, 'sw.js');
  const cached = existsSync(sw) ? [...readFileSync(sw, 'utf8').matchAll(/url:\s*"([^"]+)"/g)].filter((m) => isBank(m[1])).length : 0;
  if (cached) problems.push(`sw.js precaches ${cached} files of bank/: the bank is not part of the first load (vite.config.ts globIgnores)`);
  return { total, voice, bank, files: files.length, heaviest: files[0] ?? null, problems };
}
