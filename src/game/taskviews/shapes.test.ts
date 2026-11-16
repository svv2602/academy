// @vitest-environment happy-dom
/**
 * The logic tasks of levels 4 and 5 on the panel (docs/11-learning.md, HINTS.md): the figures are drawn with what is
 * asked - the shape and the size of "odd", the colour and shape of "pattern" and "sort" - and the rungs of the hint
 * show what HINTS.md says: rung 1 nothing, rung 2 the solution together, rung 3 the answer lit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Key } from '../../ui/strings';
import type { Spoken } from '../../core/audio';
import { figureOf } from '../tasks/odd';
import { cheatTask, runTask, type TaskHooks } from './panel';
import { FILL, shapeEl } from './shapes';

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const realTimeout = setTimeout;
const breathe = () => new Promise<void>((resolve) => { realTimeout(resolve, 0); });

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

const root = () => document.getElementById('task')!;
const stage = () => document.getElementById('taskStage')!;
const opts = () => document.getElementById('taskOpts')!;
const all = (parent: HTMLElement, selector: string) => [...parent.querySelectorAll<HTMLElement>(selector)];
const tap = (e: Element) => { e.dispatchEvent(new PointerEvent('pointerdown')); };
const spoken = () => Promise.resolve() as Spoken;
function listen() {
  const heard = { hints: [] as Key[], prompts: [] as Key[] };
  const hooks: TaskHooks = { prompt: (k) => { heard.prompts.push(k); }, number: () => {}, good: () => {}, wrong: spoken, hint: (k) => { heard.hints.push(k); return spoken(); } };
  return { hooks, heard };
}
/** The drawn figure of a button: its colour (fill), shape and size, read from the SVG itself. */
const drawn = (b: Element) => { const svg = b.querySelector('svg')!, p = svg.querySelector('path')!; return { fill: p.getAttribute('fill'), d: p.getAttribute('d') }; };
const afterMistake = () => vi.advanceTimersByTimeAsync(1000);

describe('figures', () => {
  it('a small figure is drawn smaller in the same box; colour and shape are drawn', () => {
    const big = shapeEl('red circle'), small = shapeEl('red circle small');
    expect(big.getAttribute('width')).toBe(small.getAttribute('width'));
    expect(big.querySelector('path')!.getAttribute('d')).not.toBe(small.querySelector('path')!.getAttribute('d'));
    expect(shapeEl('blue square').querySelector('path')!.getAttribute('fill')).toBe(FILL.blue[0]);
    const shapes = ['circle', 'triangle', 'square'].map((s) => shapeEl(`red ${s}`).querySelector('path')!.getAttribute('d'));
    expect(new Set(shapes).size).toBe(3);
  });
});

describe('odd, levels 4-5: the figures drawn as described', () => {
  it.each([4, 5])('level %i: every button draws its figure; exactly one is drawn differently from its look-alikes', async (level) => {
    for (let i = 0; i < 20; i++) {
      document.body.innerHTML = MARKUP;
      const { hooks, heard } = listen();
      void runTask('odd', level, hooks, createRng(`odd-${level}-${i}`));
      const buttons = all(stage(), 'button.it.big');
      expect(buttons.length).toBe(5);
      const looks = buttons.map((b) => JSON.stringify(drawn(b)));
      const count = (v: string) => looks.filter((x) => x === v).length;
      const odd = looks.findIndex((v) => count(v) === 1);
      expect(looks.filter((v) => count(v) === 1).length).toBe(1);         // the one without a twin is the one drawn so
      for (const b of buttons) expect(b.textContent).toBe('');           // drawn, not written
      expect(buttons.every((b) => figureOf(b.querySelector('svg')!.dataset.fig!).color)).toBe(true);
      tap(buttons[(odd + 1) % 5]); await afterMistake();
      expect(heard.hints).toEqual([level === 4 ? 'h1_odd_shape' : 'h1_odd_two']);
      expect(all(root(), '.alike, .pulse')).toEqual([]);                 // rung 1 shows nothing
      tap(buttons[(odd + 2) % 5]); await afterMistake();
      expect(all(stage(), '.alike').length).toBe(4);
      expect(buttons[odd].classList.contains('alike')).toBe(false);
      tap(buttons[(odd + 3) % 5]); await afterMistake();
      expect(all(root(), '.pulse')).toEqual([buttons[odd]]);
      vi.clearAllTimers(); await breathe();
    }
  });

  it('level 4, size: the odd figure is drawn at its own size (the size is not lost on the way to the screen)', () => {
    let seen = 0;
    for (let i = 0; i < 40 && seen < 5; i++) {
      document.body.innerHTML = MARKUP;
      void runTask('odd', 4, listen().hooks, createRng(`odd-size-${i}`));
      const figs = all(stage(), 'button svg').map((s) => figureOf(s.dataset.fig!));
      if (new Set(figs.map((f) => f.small)).size < 2) { vi.clearAllTimers(); continue; }
      seen++;
      const ds = all(stage(), 'button').map((b) => drawn(b).d);
      expect(new Set(ds).size).toBe(2);
      figs.forEach((f, k) => expect(ds[k]).toBe(shapeEl(`${f.color} ${f.shape}${f.small ? ' small' : ''}`).querySelector('path')!.getAttribute('d')));
      vi.clearAllTimers();
    }
    expect(seen).toBe(5);
  });
});

describe('pattern, levels 4-5', () => {
  it('level 4: groups of 1, 2, 3; rung 1 numbers nothing, rung 2 puts the size over each group, none over the "?"', async () => {
    for (let i = 0; i < 10; i++) {
      document.body.innerHTML = MARKUP;
      const { hooks, heard } = listen();
      void runTask('pattern', 4, hooks, createRng(`grow-${i}`));
      const groups = all(stage(), '.group');
      expect(groups.map((g) => all(g, '.it').length)).toEqual(groups.map((_, k) => k + 1));
      const wrong = all(opts(), '.opt').filter((b) => [...(b.textContent ?? '')].length !== groups.length + 1);
      expect(wrong.length).toBe(2);
      tap(wrong[0]); await afterMistake();
      expect(heard.hints).toEqual(['h1_pattern_grow']);
      expect(all(stage(), 'em')).toEqual([]);
      expect(stage().classList.contains('units')).toBe(false);
      tap(wrong[1]); await afterMistake(); await vi.advanceTimersByTimeAsync(3000);
      expect(groups.map((g) => g.querySelector('em')?.textContent)).toEqual(groups.map((_, k) => String(k + 1)));
      expect(stage().querySelector('.q em')).toBeNull();
      expect(all(root(), '.pulse')).toEqual([]);
      vi.clearAllTimers(); await breathe();
    }
  });

  it('level 5: figures in the row and on the buttons; rung 2 frames the links of the colour, then of the shape', async () => {
    for (let i = 0; i < 10; i++) {
      document.body.innerHTML = MARKUP;
      const { hooks } = listen();
      void runTask('pattern', 5, hooks, createRng(`two-${i}`));
      const row = all(stage(), '.it.fig'), buttons = all(opts(), '.opt');
      expect(row.length >= 6 && buttons.length === 3).toBe(true);
      expect([...row, ...buttons].every((e) => e.querySelector('svg[data-fig]') && !e.textContent)).toBe(true);
      // the right one is what the game itself would tap
      let right: EventTarget | null = null;
      const swallow = (e: Event) => { right ??= e.target; e.stopImmediatePropagation(); };
      document.addEventListener('pointerdown', swallow, true);
      try { cheatTask(); } finally { document.removeEventListener('pointerdown', swallow, true); }
      const wrong = buttons.filter((b) => b !== right);
      tap(wrong[0]); await afterMistake();
      expect(stage().classList.contains('units')).toBe(false);
      tap(wrong[1]); await afterMistake();
      expect(stage().classList.contains('units')).toBe(true);
      const colourLinks = row.map((x) => x.dataset.u);
      await vi.advanceTimersByTimeAsync(2300);
      const shapeLinks = row.map((x) => x.dataset.u);
      expect(new Set([colourLinks.join(), shapeLinks.join()]).size).toBe(2);   // first by colour, then by shape
      expect(all(root(), '.pulse')).toEqual([]);
      vi.clearAllTimers(); await breathe();
    }
  });
});

describe('sort, level 5: baskets colour times shape', () => {
  it('four baskets each with its shape; rung 2 dims the other colour, then the other shape, one basket is left', async () => {
    for (let i = 0; i < 10; i++) {
      document.body.innerHTML = MARKUP;
      const { hooks, heard } = listen();
      void runTask('sort', 5, hooks, createRng(`sort2-${i}`));
      expect(heard.prompts).toEqual(['t_sort_two']);
      const baskets = all(opts(), '.basket'), gem = stage().querySelector<HTMLElement>('.gem.current')!;
      expect(baskets.length).toBe(4);
      const key = gem.querySelector('svg')!.dataset.fig!, want = figureOf(key);
      expect(baskets.every((b) => b.querySelector('svg[data-fig]'))).toBe(true);
      const own = baskets.find((b) => b.querySelector('svg')!.dataset.fig === key)!;
      const sameColour = baskets.find((b) => b !== own && figureOf(b.querySelector('svg')!.dataset.fig!).color === want.color)!;
      tap(sameColour); await afterMistake();
      expect(heard.hints).toEqual(['h1_sort_two']);
      expect(baskets.filter((b) => b.style.opacity || b.classList.contains('own'))).toEqual([]);
      tap(sameColour); await afterMistake(); await vi.advanceTimersByTimeAsync(2000);
      expect(baskets.filter((b) => !b.style.opacity)).toEqual([own]);
      expect(own.classList.contains('own')).toBe(true);
      expect(all(root(), '.pulse')).toEqual([]);
      tap(sameColour); await afterMistake();
      expect(all(root(), '.pulse')).toEqual([own]);
      tap(own);
      expect(baskets.filter((b) => b.style.opacity)).toEqual([]);        // the next figure starts with every basket lit
      vi.clearAllTimers(); await breathe();
    }
  });
});
