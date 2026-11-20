// How close a walkthrough came to its limit (E2E_RUN_TIMEOUT_MS; the limits of CI: tools/ci-pieces.mjs TRY_LIMITS).
// tools/shot.mjs writes a line per block as it comes to it (E2E_BLOCKS_OUT: the block and the seconds since its start),
// so the times are there even for a walkthrough killed by its limit. tools/e2e.mjs reads them after the walkthrough
// and prints one line: its time against the limit, the sum of its blocks and the longest of them; with less than
// WARN_LEFT of the limit left it is a warning - on GitHub an annotation of the run and a line of the job's summary
// (try.yml, nightly.yml, pages.yml and ci.yml play through tools/e2e.mjs). A walkthrough near its limit is found as
// it grows, not on the day it is killed.
import { appendFileSync, readFileSync } from 'node:fs';

/** Less than this share of the limit left: a warning. */
export const WARN_LEFT = 0.15;

/** The blocks of a file of E2E_BLOCKS_OUT: [{ block, at }] in order, `at` - seconds since the start; a bad line is skipped. */
export function readBlocks(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = /^([\w-]+) (\d+(?:\.\d+)?)$/.exec(line.trim());
    if (m) out.push({ block: m[1], at: Number(m[2]) });
  }
  return out;
}

/** The time each block took: from the end of the block before it (the start of the walkthrough for the first). */
export function blockTimes(blocks) {
  return blocks.map((b, i) => ({ block: b.block, s: Math.max(0, b.at - (i ? blocks[i - 1].at : 0)) }));
}

/**
 * The report of one walkthrough: `name` (its step), `ms` (how long it took), `limitMs` (its limit), `blocks` (readBlocks).
 * Returns { warn, line }: `warn` - less than WARN_LEFT of the limit left (or killed by it).
 */
export function limitReport({ name, ms, limitMs, blocks = [], top = 5 }) {
  const share = limitMs > 0 ? ms / limitMs : 0;
  const warn = share > 1 - WARN_LEFT;
  const times = blockTimes(blocks);
  const sum = blocks.length ? blocks[blocks.length - 1].at : 0;
  const longest = [...times].sort((a, b) => b.s - a.s).slice(0, top).map((t) => `${t.block} ${Math.round(t.s)} s`).join(', ');
  const line = `${warn ? 'warning: less than 15 % of the limit left - ' : ''}${name}: ${Math.round(ms / 1000)} s of ${Math.round(limitMs / 1000)} s `
    + `(${Math.round(share * 100)} %)${blocks.length ? `; ${blocks.length} blocks, ${Math.round(sum)} s` : ''}${longest ? `; the longest: ${longest}` : ''}`;
  return { warn, line };
}

/** On GitHub Actions: the line in the job's summary, and a warning annotation of the run when it warns. */
export function reportToGitHub({ warn, line }, env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true') return;
  if (warn) console.log(`::warning title=A walkthrough near its limit::${line.replace(/\r?\n/g, ' ')}`);
  if (env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(env.GITHUB_STEP_SUMMARY, `- ${warn ? '⚠️ ' : ''}${line}\n`); } catch { /* the summary is a nicety */ }
  }
}

/** The blocks of a walkthrough from its file (none when it has none). */
export function blocksOf(path) {
  try { return readBlocks(readFileSync(path, 'utf8')); } catch { return []; }
}
