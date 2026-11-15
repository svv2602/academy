// @vitest-environment happy-dom
/**
 * The panel shows of count, add, sub, compare and pattern (ARCH-09): what is on screen is the task's description and
 * nothing else, the answer the panel accepts is the description's answer, and `runTask` with a seed is
 * `showTask(generate(...))` with that seed. The shows draw no random numbers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { generate, type SpecOf } from '../tasks/index';
import { cheatTask, runTask, showTask, type TaskHooks } from './panel';

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const SEEDS = 50;
const realTimeout = setTimeout;   // taken before the fake clock is installed, which would never fire it
const breathe = () => new Promise<void>((resolve) => { realTimeout(resolve, 0); });

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

const root = () => document.getElementById('task')!;
const stage = () => document.getElementById('taskStage')!;
const opts = () => document.getElementById('taskOpts')!;
const all = (parent: Element, selector: string) => [...parent.querySelectorAll<HTMLElement>(selector)];
const text = (e: Element) => e.textContent ?? '';
const tap = (e: HTMLElement) => { e.dispatchEvent(new PointerEvent('pointerdown')); };
const tilts = (list: HTMLElement[]) => list.map((e) => e.style.getPropertyValue('--r'));
const deg = (tilt: readonly number[]) => tilt.map((r) => `${r}deg`);

function listen() {
  const heard = { prompts: [] as SpokenKey[], hints: [] as SpokenKey[], wrong: 0 };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: TaskHooks = {
    prompt: (k) => { heard.prompts.push(k); }, number: () => {}, good: () => {},
    wrong: () => { heard.wrong++; return quick(); }, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}

type Shown = 'count' | 'add' | 'sub' | 'compare' | 'pattern';
/** Reads the task off the screen and checks it against its description; returns what a child can answer with. */
const READ: { [T in Shown]: (spec: SpecOf<T>) => HTMLElement[] } = {
  count(spec) {
    const things = all(stage(), '.it');
    expect(things.map(text)).toEqual(Array(spec.body.n).fill(spec.body.thing));
    expect(tilts(things)).toEqual(deg(spec.body.tilt));
    expect(all(opts(), '.opt').map(text)).toEqual(spec.body.options.map(String));
    return all(opts(), '.opt');
  },
  add(spec) {
    const { a, b, thing, tilt } = spec.body;
    expect([...stage().children].map((e) => e.className)).toEqual(['group', 'sign', 'group', 'sign', 'sign q']);
    expect(all(stage(), '.sign').map(text)).toEqual(['+', '=', '?']);
    const groups = all(stage(), '.group').map((g) => all(g, '.it'));
    expect(groups.map((g) => g.length)).toEqual([a, b]);
    expect(groups.flat().map(text)).toEqual(Array(a + b).fill(thing));
    expect(tilts(groups.flat())).toEqual(deg(tilt));
    expect(all(opts(), '.opt').map(text)).toEqual(spec.body.options.map(String));
    return all(opts(), '.opt');
  },
  sub(spec) {
    const { total, gone, thing, tilt } = spec.body;
    const things = all(stage(), '.it');
    expect(things.map(text)).toEqual(Array(total).fill(thing));
    expect(tilts(things)).toEqual(deg(tilt));
    expect(things.map((t) => t.classList.contains('gone'))).toEqual(Array.from({ length: total }, (_, i) => i >= total - gone));
    expect(all(opts(), '.opt').map(text)).toEqual(spec.body.options.map(String));
    return all(opts(), '.opt');
  },
  compare(spec) {
    const { groups: sizes, thing, tilt, more } = spec.body;
    const groups = all(stage(), '.group.pickable');
    expect(groups.map((g) => all(g, '.it.still').length)).toEqual(sizes);
    groups.forEach((g, i) => {
      expect(all(g, '.it').map(text)).toEqual(Array(sizes[i]).fill(thing));
      expect(tilts(all(g, '.it'))).toEqual(deg(tilt[i]));
    });
    const ask = all(stage(), '.ask');
    expect(ask).toHaveLength(1);
    expect([...stage().children].indexOf(ask[0])).toBe(1);
    expect(ask[0].className).toBe(`ask ${more ? 'more' : 'less'}`);
    expect(opts().children).toHaveLength(0);
    return groups;
  },
  pattern(spec) {
    const { unit, row } = spec.body;
    const shown = all(stage(), '.it.still:not(.q)');
    expect(shown.map(text)).toEqual(row);
    expect(shown.map((e) => e.dataset.u)).toEqual(row.map((_, i) => String(i % unit.length)));
    expect(all(stage(), '.q')).toHaveLength(1);
    expect(stage().lastElementChild!.classList.contains('q')).toBe(true);
    expect(all(opts(), '.opt').map(text)).toEqual(spec.body.options);
    return all(opts(), '.opt');
  },
};
const TYPES = Object.keys(READ) as Shown[];
/** What the child answered with, as the description says it: the number or colour of a button, or the index of a group. */
const valueOf = (type: Shown, choices: HTMLElement[], e: HTMLElement) =>
  type === 'compare' ? choices.indexOf(e) : type === 'pattern' ? text(e) : Number(text(e));

describe.each(TYPES)('the panel shows %s from its description', (type) => {
  it.each([1, 2, 3])(`level %i: ${SEEDS} seeds - the screen is the description, the accepted answer is its answer`, async (level) => {
    for (let i = 0; i < SEEDS; i++) {
      document.body.innerHTML = MARKUP;
      const spec = generate(type, level, createRng(`view-${type}-${level}-${i}`));
      const { hooks, heard } = listen();
      const done = showTask(spec, hooks);
      expect(stage().className).toBe(`t-stage t-${type}`);
      expect(root().classList.contains('hidden')).toBe(false);
      expect(heard.prompts).toEqual([spec.prompt]);
      const choices = (READ[type] as (s: typeof spec) => HTMLElement[])(spec);
      expect(all(root(), '.yes, .no, .pulse, .hit, .grow, .shrink, .it > i, .group > em')).toEqual([]);
      expect(cheatTask()).toBe(true);
      const yes = choices.filter((c) => c.classList.contains('yes'));
      expect(yes).toHaveLength(1);
      expect(valueOf(type, choices, yes[0])).toBe(spec.body.answer);
      vi.advanceTimersByTime(1100);
      expect(await done).toEqual({ solved: true, wrong: 0 });
      expect(cheatTask()).toBe(false);
      if (i % 25 === 24) await breathe();
    }
  });

  it.each([1, 2, 3])('level %i: a mistake brings the hint of the description, the second one lights its answer', async (level) => {
    for (let i = 0; i < 10; i++) {
      document.body.innerHTML = MARKUP;
      const spec = generate(type, level, createRng(`hint-${type}-${level}-${i}`));
      const { hooks, heard } = listen();
      const done = showTask(spec, hooks);
      const choices = (READ[type] as (s: typeof spec) => HTMLElement[])(spec);
      const right = choices.find((c) => valueOf(type, choices, c) === spec.body.answer)!;
      const wrong = choices.find((c) => c !== right)!;
      tap(wrong);
      expect(wrong.classList.contains('no')).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(heard.wrong).toBe(1);
      expect(heard.hints).toEqual([spec.hint!.key]);
      expect(all(root(), '.pulse')).toEqual([]);
      if (type === 'pattern') expect(stage().classList.contains('units')).toBe(true);
      else if (spec.type === 'compare') expect(all(stage(), '.group > em').map(text)).toEqual(spec.body.groups.map(String));
      else expect(all(stage(), '.it > i').length).toBeGreaterThan(0);
      tap(wrong);
      await vi.advanceTimersByTimeAsync(1000);
      expect(all(root(), '.pulse')).toEqual([right]);
      tap(right);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await done).toEqual({ solved: true, wrong: 2 });
      vi.clearAllTimers();
    }
    await breathe();
  });

  it.each([1, 2, 3])('level %i: runTask with a seed shows what that seed describes', async (level) => {
    const shot = (start: (hooks: TaskHooks) => void) => {
      document.body.innerHTML = MARKUP;
      const { hooks, heard } = listen();
      start(hooks);
      const out = `${heard.prompts.join(' ')}\n${stage().outerHTML}\n${opts().innerHTML}`;
      vi.clearAllTimers();
      return out;
    };
    for (const seed of ['1', '7', 'Зоряна']) {
      expect(shot((h) => { void runTask(type, level, h, createRng(seed)); }), `seed ${seed}`)
        .toBe(shot((h) => { void showTask(generate(type, level, createRng(seed)), h); }));
    }
    await breathe();
  });
});

describe('the shows draw no random numbers', () => {
  const SOURCES = Object.entries(import.meta.glob(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('the glob reached the panel, the flow and the five shows', () => {
    expect(SOURCES.map(([p]) => p).sort()).toEqual(['./add.ts', './compare.ts', './count.ts', './flow.ts', './panel.ts', './pattern.ts', './sub.ts']);
  });

  it('no Math.random anywhere; no rng in a show or the flow; the panel only hands its rng to generate()', () => {
    for (const [path, src] of SOURCES) {
      expect(src, path).not.toMatch(/Math\.random/);
      const lines = code(src).split('\n').filter((l) => /\brng\b/i.test(l));
      if (path !== './panel.ts') expect(lines, path).toEqual([]);
      else for (const l of lines) expect(l).toMatch(/^import \{ createRng, type Rng \}|^export function runTask\(|^ {2}return showTask\(generate\(type, level, rng\), hooks\);$/);
    }
  });
});
