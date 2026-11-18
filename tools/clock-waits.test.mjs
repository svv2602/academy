import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLOCK_REASONS, FOREIGN } from './clock-waits.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** The files of the walkthroughs: every script under tools/ that waits on a page (found by the folder, not by a list). */
function scenarioFiles(dir = here) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') out.push(...scenarioFiles(p)); continue; }
    if (!/\.m?js$/.test(e.name) || /\.test\.m?js$/.test(e.name) || e.name === 'clock-waits.mjs') continue;
    if (/waitForFunction\(|waitForSelector\(|waitForTimeout\(/.test(readFileSync(p, 'utf8'))) out.push(p);
  }
  return out;
}

/** A line that counts the wall clock: the walkthrough's T(ms), a pause, the clock itself. */
export const CLOCK = /\bT\(|waitForTimeout\(|(?<![.\w$])wait\(|Date\.now\(\)/;
const MARK = /clock:\s*([a-z0-9-]+)/;

/** Every line of the scenario files that counts the wall clock, with its key (null - unmarked). */
export function clockLines(files = scenarioFiles()) {
  const out = [];
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (!CLOCK.test(line)) return;
      out.push({ file: relative(root, f), line: i + 1, key: line.match(MARK)?.[1] ?? null, text: line.trim() });
    });
  }
  return out;
}

describe('the waits by the wall clock in the walkthroughs (tools/clock-waits.mjs)', () => {
  const all = clockLines();

  it('finds the scenario files by the folder', () => {
    const files = new Set(all.map((w) => w.file));
    expect(files.has('tools/shot.mjs')).toBe(true);
    expect(files.has('tools/update.mjs')).toBe(true);
  });

  it('every wait by the wall clock says its reason with a known key', () => {
    const bad = all.filter((w) => !(w.file in FOREIGN) && !(w.key in CLOCK_REASONS))
      .map((w) => `${w.file}:${w.line} ${w.key ? `unknown key "${w.key}"` : 'no /* clock: <key> */'}: ${w.text.slice(0, 120)}`);
    expect(bad).toEqual([]);
  });

  it('the listed files of another stream get no new unmarked wait', () => {
    for (const [file, n] of Object.entries(FOREIGN)) {
      expect(all.filter((w) => w.file === file && !(w.key in CLOCK_REASONS)).length, file).toBeLessThanOrEqual(n);
    }
  });

  it('every reason is used, so the list says what the walkthroughs really do', () => {
    const used = new Set(all.map((w) => w.key));
    const unused = Object.keys(CLOCK_REASONS).filter((k) => !used.has(k));
    expect(unused).toEqual([]);
  });
});
