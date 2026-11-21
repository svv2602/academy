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

describe('the bubble keeps clear of the counters (src/ui/ui.ts fitBubble)', () => {
  /** The counters' row laid out `width` px wide from `left` (happy-dom lays nothing out). */
  function laidOut(left: number, width: number, run: () => void) {
    const w = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'hud' ? width : 0; });
    const l = vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'hud' ? left : 0; });
    try { run(); } finally { w.mockRestore(); l.mockRestore(); }
  }
  it('a star count that widens the row moves the bubble past it; the stylesheet\'s room stays the least', () => {
    laidOut(12, 275, () => ui.setCounter('stars', '1000'));
    expect($('bubble').style.getPropertyValue('--hud')).toBe(`max(268px + max(12px, env(safe-area-inset-left)), ${12 + 275 + ui.HUD_GAP}px)`);
    laidOut(12, 262, () => ui.setCounter('crystals', '3/5'));
    expect($('bubble').style.getPropertyValue('--hud')).toContain(`${12 + 262 + ui.HUD_GAP}px`);
  });
  it('a new icon of a counter measures it again; hidden (no width), the last room is kept', () => {
    laidOut(12, 300, () => ui.setCounterIcon('crystals', '🏺'));
    expect($('bubble').style.getPropertyValue('--hud')).toContain(`${12 + 300 + ui.HUD_GAP}px`);
    laidOut(0, 0, () => ui.setCounter('stars', '5'));
    expect($('bubble').style.getPropertyValue('--hud')).toContain(`${12 + 300 + ui.HUD_GAP}px`);
  });
});
