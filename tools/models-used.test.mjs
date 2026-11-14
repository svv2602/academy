// Runs in `npm test`. public/models must hold exactly the files listed in tools/models-used.json — the files the game
// page really requested during the two walkthroughs of `npm run e2e` (which writes and checks that list).
// A file nobody requests would still be downloaded into the offline cache of every phone, so it fails here.
// public/models is written by `npm run assets` from models-src/ (compressed .glb plus tex/*.webp, see tools/assets.mjs
// and tools/assets.test.mjs), so a model is added or retired through its source, never by editing public/models.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOW = 'If the game really loads it: npm run e2e -- --update-models (rewrites tools/models-used.json from a full walkthrough). '
  + 'If it does not: move its source from models-src/ to models-unused/ under the same relative path and run npm run assets.';

const onDisk = readdirSync(join(root, 'public/models'), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => join(e.parentPath, e.name).slice(join(root, 'public').length + 1).split('\\').join('/'))
  .sort();
const listed = JSON.parse(readFileSync(join(root, 'tools/models-used.json'), 'utf8'));

describe('tools/models-used.json', () => {
  it('is a non-empty list of paths under models/', () => {
    expect(Array.isArray(listed) && listed.length > 0, 'tools/models-used.json must be a non-empty JSON array').toBe(true);
    const bad = listed.filter((p) => typeof p !== 'string' || !p.startsWith('models/'));
    expect(bad, `entries that are not "models/…" paths: ${JSON.stringify(bad)}`).toEqual([]);
  });

  it('is sorted and has no duplicates', () => {
    const dup = listed.filter((p, i) => listed.indexOf(p) !== i);
    expect(dup, `duplicate entries: ${dup.join(', ')}. Run: npm run e2e -- --update-models`).toEqual([]);
    expect(listed, 'the list is not sorted. Run: npm run e2e -- --update-models').toEqual([...listed].sort());
  });

  it('lists every file in public/models (no unused model is shipped)', () => {
    const known = new Set(listed);
    const unlisted = onDisk.filter((p) => !known.has(p));
    expect(unlisted, `${unlisted.length} file(s) in public/ that no walkthrough requested: ${unlisted.join(', ')}. ${HOW}`).toEqual([]);
  });

  it('lists only files that exist in public/models', () => {
    const have = new Set(onDisk);
    const missing = listed.filter((p) => !have.has(p));
    expect(missing, `${missing.length} listed file(s) missing from public/: ${missing.join(', ')}. `
      + 'Rebuild it from models-src/ (npm run assets), or run: npm run e2e -- --update-models').toEqual([]);
  });
});
