/**
 * Rebuild voice/phrases.json — the list of lines to record — from the game's own texts.
 *
 * The list is built by `recordingList()` in src/ui/strings.ts from the shared strings and the strings of every world
 * (src/worlds/<id>/strings.ts, in the order of the folder names), then the bank of the old game's clips
 * (src/ui/strings-bank.ts): one entry per key marked as spoken, Ukrainian text
 * with the name placeholder cut out, plus the intonation and the speaker. The speakers and their voices come from each
 * world's table "character - voice" (src/worlds/<id>/voices.ts, VOICE-10): a line a character says in its own voice
 * is listed again as `<key>@<voice>`. A line of a world other than the first one (DEFAULT_WORLD of
 * src/worlds/index.ts) is the voice of that world (TECH-09) and has a fourth field, the id of its world: its clip lies
 * in the folder of the world (`voice/<id>/`), and tools/gen_voice.py names it `<id>/<key>`. Every other row has three
 * fields. Nothing is typed into the JSON by hand.
 *
 *   npm run voice:sync              rewrite voice/phrases.json
 *   npm run voice:sync -- --check   change nothing; exit 1 and list the differences if the file is out of date
 *   --out=<file>                    the list to write or to check instead of voice/phrases.json (the tests)
 *
 * Needs Node 22.18+ : the strings files are imported as they are, Node strips the types.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceWorlds } from './dist-size.mjs';

const WORLDS = fileURLToPath(new URL('../src/worlds/', import.meta.url));

const args = process.argv.slice(2);
const given = args.filter((a) => a.startsWith('--out=')).map((a) => a.slice('--out='.length));
const unknown = args.filter((a) => a !== '--check' && !(a.startsWith('--out=') && a.length > '--out='.length));
if (unknown.length > 0 || given.length > 1) {
  console.error(`[voice:sync] unknown argument: ${(unknown.length ? unknown : args.filter((a) => a.startsWith('--out='))).join(' ')}\nusage: node tools/sync_phrases.mjs [--check] [--out=<file>]`);
  process.exit(2);
}
const check = args.includes('--check');
const OUT = given[0] ?? fileURLToPath(new URL('../voice/phrases.json', import.meta.url));
const SHOWN = given[0] ?? 'voice/phrases.json';

/** A failed build must never leave a half-made list behind: report, exit, write nothing. */
function fail(message) {
  console.error(`[voice:sync] ${message}`);
  console.error(`[voice:sync] ${SHOWN} was not changed`);
  process.exit(1);
}

/** The strings of every world: each folder of src/worlds that has a strings.ts, by name. */
async function worldStrings() {
  const ids = readdirSync(WORLDS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const out = [];
  for (const id of ids) {
    const file = `${WORLDS}${id}/strings.ts`;
    if (!existsSync(file)) {
      // A world keeps its texts in its strings.ts: a world without one would speak lines nobody recorded.
      if (existsSync(`${WORLDS}${id}/index.ts`)) throw new Error(`src/worlds/${id} is a world without strings.ts`);
      continue;
    }
    const { strings } = await import(pathToFileURL(file).href);
    if (!strings || typeof strings !== 'object') throw new Error(`src/worlds/${id}/strings.ts exports no \`strings\``);
    if (strings.id !== id) throw new Error(`src/worlds/${id}/strings.ts is of world "${strings.id}", not "${id}"`);
    out.push(strings);
  }
  return out;
}

/** The table "character - voice" of every world that has one (src/worlds/<id>/voices.ts), in the order of the names. */
async function worldVoices() {
  const ids = readdirSync(WORLDS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const out = [];
  for (const id of ids) {
    const file = `${WORLDS}${id}/voices.ts`;
    if (!existsSync(file)) continue;
    const { voices } = await import(pathToFileURL(file).href);
    if (!voices || voices.id !== id) throw new Error(`src/worlds/${id}/voices.ts exports no \`voices\` of world "${id}"`);
    out.push(voices);
  }
  return out;
}

let list;
try {
  const { recordingList } = await import('../src/ui/strings.ts');
  const { bank } = await import('../src/ui/strings-bank.ts');
  // The first world, read as text (tools/dist-size.mjs): the registry itself is not imported - it brings Three.js.
  const { first } = sourceWorlds();
  list = recordingList(await worldStrings(), bank, await worldVoices(), first);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

// Same layout the file has always had: one line per key, one-space indent, non-ASCII kept as it is, newline at the end.
const rows = Object.entries(list).map(([key, row]) => ` ${JSON.stringify(key)}: [${row.map((v) => JSON.stringify(v)).join(', ')}]`);
const next = `{\n${rows.join(',\n')}\n}\n`;

let current = null;
try { current = readFileSync(OUT, 'utf8'); } catch { /* no file yet */ }

if (current === next) {
  console.log(`[voice:sync] ${SHOWN} is up to date (${Object.keys(list).length} lines)`);
  process.exit(0);
}

if (!check) {
  writeFileSync(OUT, next);
  console.log(`[voice:sync] wrote ${SHOWN} (${Object.keys(list).length} lines)`);
  process.exit(0);
}

/** What exactly differs, key by key, so the message says more than "out of date". */
function differences(text) {
  if (text === null) return ['the file does not exist'];
  let old;
  try { old = JSON.parse(text); } catch (e) { return [`the file is not valid JSON: ${e.message}`]; }
  if (old === null || typeof old !== 'object' || Array.isArray(old)) return ['the file is not a JSON object'];
  const out = [];
  for (const k of Object.keys(list)) {
    if (!Object.hasOwn(old, k)) out.push(`missing: ${k}`);
    else if (JSON.stringify(old[k]) !== JSON.stringify(list[k])) out.push(`changed: ${k}`);
  }
  for (const k of Object.keys(old)) if (!Object.hasOwn(list, k)) out.push(`not spoken by the game: ${k}`);
  if (out.length === 0 && Object.keys(old).join() !== Object.keys(list).join()) out.push('the order of the keys differs');
  if (out.length === 0) out.push('the layout differs (indent or final newline)');
  return out;
}

console.error(`[voice:sync] ${SHOWN} is out of date:`);
for (const d of differences(current)) console.error(`  ${d}`);
console.error('[voice:sync] run: npm run voice:sync');
process.exit(1);
