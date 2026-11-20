// @vitest-environment happy-dom
/**
 * The bubble of a line (src/ui/ui.ts `bubble`): a new line pops it (its animation played anew); a new text of the line
 * shown - a count going up (WORLD-15) - only changes the text; hidden and shown again, it pops.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const fsModule = 'node:fs';
const $ = (id: string) => document.getElementById(id)!;
let ui: typeof import('./ui');

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.__BUILD_DATE__ = '2026-11-18'; g.__BUILD_COMMIT__ = 'abc1234';
  const { readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync: (p: string, e: 'utf8') => string };
  const page = readFileSync('index.html', 'utf8');
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(page)![1].replace(/<script[\s\S]*?<\/script>/g, '');
  ui = await import('./ui');
});

/** Counts the pops: a restart of the animation reads the bubble's width once (the reflow between "none" and ""). */
function popsOf(run: () => void): number {
  const spy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get');
  try { run(); return spy.mock.calls.length; } finally { spy.mockRestore(); }
}

describe('the bubble of a line', () => {
  it('a new line pops it; a new text of the same line does not; shown again after hidden, it pops', () => {
    ui.bubble(null);
    expect(popsOf(() => ui.bubble('t_count', 0, '🐿️', '🌰 0 з 3'))).toBe(1);
    expect(popsOf(() => ui.bubble('t_count', 0, '🐿️', '🌰 1 з 3'))).toBe(0);
    expect($('bubbleText').textContent).toBe('🌰 1 з 3');
    expect(popsOf(() => ui.bubble('t_count', 0, '🐱', '🌰 1 з 3'))).toBe(1);        // another speaker
    expect(popsOf(() => ui.bubble('t_add', 0, '🐱'))).toBe(1);                    // another line
    ui.bubble(null);
    expect(popsOf(() => ui.bubble('t_add', 0, '🐱'))).toBe(1);
  });
});
