import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { WARN_LEFT, blockTimes, blocksOf, limitReport, readBlocks, reportToGitHub } from './run-limit.mjs';

const dir = mkdtempSync(join(tmpdir(), 'run-limit-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the blocks of a walkthrough (E2E_BLOCKS_OUT)', () => {
  it('reads "<block> <seconds since the start>" per line, skipping what is not one', () => {
    expect(readBlocks('story 103\nflyover 121\n\nbad line\nworld-sort 996.5\n')).toEqual([
      { block: 'story', at: 103 }, { block: 'flyover', at: 121 }, { block: 'world-sort', at: 996.5 },
    ]);
    expect(readBlocks(undefined)).toEqual([]);
  });
  it('the time of a block runs from its start to the start of the next, the last one to the end; before the first is the launch', () => {
    // `has(block)` prints when the block begins: the 875 s between "heroine" and "world-sort" are the heroine and the friends
    expect(blockTimes(readBlocks('a 10\nb 25\nc 25\n'), 40)).toEqual([
      { block: 'before the blocks', s: 10 }, { block: 'a', s: 15 }, { block: 'b', s: 0 }, { block: 'c', s: 15 },
    ]);
    expect(blockTimes(readBlocks('a 0\nb 5\n'))).toEqual([{ block: 'a', s: 5 }, { block: 'b', s: 0 }]);
  });
  it('a file that is not there has no blocks', () => {
    expect(blocksOf(join(dir, 'none.txt'))).toEqual([]);
  });
});

describe('the report against the limit', () => {
  const blocks = readBlocks('story 100\nheroine 120\nworld-sort 995\nhelpers 1140\n');
  it('says the time, the share of the limit, the sum of the blocks and the longest of them', () => {
    const r = limitReport({ name: 'walkthrough mobile', ms: 2_281_000, limitMs: 3_000_000, blocks, top: 2 });
    expect(r.warn).toBe(false);
    expect(r.line).toBe('walkthrough mobile: 2281 s of 3000 s (76 %); 4 blocks, 2281 s; the longest: helpers 1141 s, heroine 875 s');
  });
  it('warns with less than 15 % of the limit left, and when killed by it', () => {
    expect(WARN_LEFT).toBe(0.15);
    expect(limitReport({ name: 'w', ms: 2_550_000, limitMs: 3_000_000 }).warn).toBe(false);   // 85 % used: 15 % left
    const near = limitReport({ name: 'w', ms: 2_551_000, limitMs: 3_000_000 });
    expect(near.warn).toBe(true);
    expect(near.line).toMatch(/^warning: less than 15 % of the limit left - w: 2551 s of 3000 s \(85 %\)$/);
    expect(limitReport({ name: 'w', ms: 3_000_100, limitMs: 3_000_000 }).warn).toBe(true);
  });
  it('the numbers of 2026-11-20: the whole walkthrough at 2350 s warned under the old limit of 2400 s, not under 3000 s', () => {
    expect(limitReport({ name: 'w', ms: 2_350_000, limitMs: 2_400_000 }).warn).toBe(true);
    expect(limitReport({ name: 'w', ms: 2_350_000, limitMs: 3_000_000 }).warn).toBe(false);
    expect(limitReport({ name: 'w', ms: 1_080_000, limitMs: 1_350_000 }).warn).toBe(false);   // the slow desktop world2
  });
});

describe('on GitHub Actions', () => {
  it('writes the line to the summary of the job, and a warning annotation when it warns', () => {
    const summary = join(dir, 'summary.md');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportToGitHub({ warn: false, line: 'w: 10 s of 100 s (10 %)' }, { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summary });
    reportToGitHub({ warn: true, line: 'warning: near' }, { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summary });
    expect(readFileSync(summary, 'utf8')).toBe('- w: 10 s of 100 s (10 %)\n- ⚠️ warning: near\n');
    expect(log.mock.calls.map((c) => c[0])).toEqual(['::warning title=A walkthrough near its limit::warning: near']);
    log.mockRestore();
  });
  it('does nothing elsewhere', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportToGitHub({ warn: true, line: 'x' }, {});
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
