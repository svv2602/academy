/**
 * Rebuild voice/phrases.json — the list of lines to record — from the game's own texts.
 *
 * The list is built by `recordingList()` in src/ui/strings.ts: one entry per key marked as spoken, Ukrainian text
 * with the name placeholder cut out, plus the intonation. Nothing is typed into the JSON by hand.
 *
 *   npm run voice:sync              rewrite voice/phrases.json
 *   npm run voice:sync -- --check   change nothing; exit 1 and list the differences if the file is out of date
 *
 * Needs Node 22.18+ : src/ui/strings.ts is imported as it is, Node strips the types.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../voice/phrases.json', import.meta.url));
const SHOWN = 'voice/phrases.json';

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--check');
if (unknown.length > 0) {
  console.error(`[voice:sync] unknown argument: ${unknown.join(' ')}\nusage: node tools/sync_phrases.mjs [--check]`);
  process.exit(2);
}
const check = args.includes('--check');

/** A failed build must never leave a half-made list behind: report, exit, write nothing. */
function fail(message) {
  console.error(`[voice:sync] ${message}`);
  console.error(`[voice:sync] ${SHOWN} was not changed`);
  process.exit(1);
}

let list;
try {
  const { recordingList } = await import('../src/ui/strings.ts');
  list = recordingList();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

// Same layout the file has always had: one line per key, one-space indent, non-ASCII kept as it is, newline at the end.
const rows = Object.entries(list).map(([key, [text, style]]) => ` ${JSON.stringify(key)}: [${JSON.stringify(text)}, ${JSON.stringify(style)}]`);
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
