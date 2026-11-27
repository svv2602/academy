/**
 * The texts a part of the game keeps in a module of its own (`PartStrings` of src/ui/strings.ts; the parts of Season 2
 * are src/s2/strings-<part>.ts): where those modules are and what they hold.
 *
 * src/main.ts adds a part's texts to the shared table (`addStrings`), and tools/sync_phrases.mjs sends its spoken
 * lines for recording with the rest (`recordingList`). Until 2026-11-27 only the first was true: a spoken line of a
 * part was shown and never listed, so nothing asked for its clip and the game would have said it with the device's
 * voice.
 *
 * A part's module is any `strings-*.ts` under src/ whose text says `satisfies PartStrings`; it exports `strings`.
 * It holds only `import type` and `declare module`, so Node loads it as it is (22.18+ strips the types).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SRC = fileURLToPath(new URL('../src/', import.meta.url));
/** What a module of a part says of its `strings`. */
export const MARK = 'satisfies PartStrings';

/** The modules of the parts under `src`, in the order of their paths: every `strings-*.ts` (no test) with the mark. */
export function partFiles(src = SRC) {
  const out = [];
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, d.name);
      if (d.isDirectory()) walk(path);
      else if (/^strings-.+\.ts$/.test(d.name) && !d.name.endsWith('.test.ts') && readFileSync(path, 'utf8').includes(MARK)) out.push(path);
    }
  };
  walk(src);
  return out.sort();
}

const isTable = (t) => t !== null && typeof t === 'object' && !Array.isArray(t);

/**
 * The `strings` of every part under `src`, in the order of the paths. A module that says it is a part's and exports
 * no such `strings`, and a part named twice, are errors: a part left out silently is a line never recorded.
 */
export async function partStrings(src = SRC) {
  const out = [], seen = new Map();
  for (const file of partFiles(src)) {
    const shown = relative(src, file);
    const { strings } = await import(pathToFileURL(file).href);
    if (!isTable(strings) || typeof strings.id !== 'string' || strings.id === ''
      || !isTable(strings.table) || !isTable(strings.table.uk) || !isTable(strings.table.ru) || !isTable(strings.spoken)) {
      throw new Error(`${shown} says it holds a part's strings (PartStrings) and exports no \`strings\` of that form`);
    }
    if (seen.has(strings.id)) throw new Error(`${shown}: the part "${strings.id}" is already in ${seen.get(strings.id)}`);
    seen.set(strings.id, shown);
    out.push(strings);
  }
  return out;
}
