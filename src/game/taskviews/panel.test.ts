// @vitest-environment happy-dom
/**
 * The panel shows of count, add, sub, compare and pattern (ARCH-09): what is on screen is the task's description and
 * nothing else, the answer the panel accepts is the description's answer, and `runTask` with a seed is
 * `showTask(generate(...))` with that seed. The shows draw no random numbers.
 */
import { WON_MAX_MS } from './fly';
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
      vi.advanceTimersByTime(WON_MAX_MS);
      expect(await done).toEqual({ solved: true, wrong: 0 });
      expect(cheatTask()).toBe(false);
      if (i % 25 === 24) await breathe();
    }
  });

  it.each([1, 2, 3])('level %i: the first mistake says the way and shows nothing, the second shows the solution, the third lights the answer', async (level) => {
    for (let i = 0; i < 10; i++) {
      document.body.innerHTML = MARKUP;
      const spec = generate(type, level, createRng(`hint-${type}-${level}-${i}`));
      const { hooks, heard } = listen();
      const done = showTask(spec, hooks);
      const choices = (READ[type] as (s: typeof spec) => HTMLElement[])(spec);
      const right = choices.find((c) => valueOf(type, choices, c) === spec.body.answer)!;
      const wrong = choices.find((c) => c !== right)!;
      const [way, together, lit] = spec.hint!.rungs.map((r) => r.key);
      tap(wrong);
      expect(wrong.classList.contains('no')).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(heard.wrong).toBe(1);
      expect(heard.hints).toEqual([way]);
      // R16: after the first mistake nothing is numbered or lit as the answer
      expect(all(root(), '.it > i, .group > em, .dots, .grow, .shrink, .it.hit, .pulse')).toEqual([]);
      expect(stage().classList.contains('units')).toBe(false);
      tap(wrong);
      await vi.advanceTimersByTimeAsync(1000);
      expect(heard.hints).toEqual([way, together]);
      expect(all(root(), '.pulse, .grow, .shrink')).toEqual([]);
      if (type === 'pattern') expect(stage().classList.contains('units')).toBe(true);
      else if (spec.type === 'compare') expect(all(stage(), '.group > em').map(text)).toEqual(spec.body.groups.map(String));
      else expect(all(stage(), '.it > i').length).toBeGreaterThan(0);
      tap(wrong);
      await vi.advanceTimersByTimeAsync(1000);
      expect(heard.hints).toEqual([way, together, lit]);
      expect(lit).toBe('h3_show');
      expect(all(root(), '.pulse')).toEqual([right]);
      tap(right);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await done).toEqual({ solved: true, wrong: 3 });
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

  it('the glob reached the panel, the flow and the ten shows', () => {
    expect(SOURCES.map(([p]) => p).sort()).toEqual(['./add.ts', './chain.ts', './compare.ts', './count.ts', './cpa.ts', './diff-scene.ts', './diff.ts', './en_count.ts', './en_tap.ts', './exprs.ts', './flow.ts', './fly.ts', './gap.ts', './house.ts', './missing.ts', './neighbors.ts', './note.ts', './odd.ts', './order.ts',
      './pairs.ts', './panel.ts', './pattern.ts', './puzzle.ts', './shapes.ts', './signs.ts', './simon.ts', './sort.ts', './story.ts', './sub.ts', './sum3.ts', './tenframe.ts']);
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

// Moved from `src/game/tasks.test.ts`: what a child sees without the voice (VOICE-09) needs the style sheet of the shows.
describe('the shows are drawn', () => {
  it('the shows are drawn: panel.ts imports hints.css, and it styles every class the shows put on screen', async () => {
    // happy-dom applies no style sheet, so the tests of the shows only see classes; without these rules they would draw nothing.
    // Vitest hands CSS to a test as an empty module (also with ?raw), so the files are read from the disk.
    // The module name is a variable: the game's type check knows no Node modules.
    const fsModule = 'node:fs';
    const { readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync(path: URL, encoding: 'utf8'): string };
    const source = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');
    expect(source('./panel.ts')).toMatch(/^import '\.\/hints\.css';$/m);
    const rules = source('./hints.css').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of [
      /\.it\.big\.alike \{[^}]*inset/,                                   // the frame of the alike things
      /\.ask\.more b[^{]*\{[^}]*animation: grow/, /\.ask\.less b[^{]*\{[^}]*animation: shrink/,
      /\.grow > \.it \{[^}]*animation: grow/, /\.shrink > \.it \{[^}]*animation: shrink/,
      /@keyframes grow \{/, /@keyframes shrink \{/,
      /\.t-stage\.peek \.mcard span \{ visibility: visible; \}/,           // the faces during the peek
    ]) expect(rules).toMatch(rule);
  });
});

describe('a right answer always ends the task', () => {
  it('even when its sound throws: the card closes, the task resolves solved, and a second tap changes nothing', async () => {
    const { hooks } = listen();
    let sounds = 0;
    const throwing: TaskHooks = { ...hooks, good: () => { sounds++; throw new Error('no audio'); } };
    const done = showTask(generate('pattern', 1, createRng('right-throws')), throwing);
    expect(root().classList.contains('hidden')).toBe(false);
    expect(cheatTask()).toBe(true);
    expect(sounds).toBe(1);
    expect(root().classList.contains('won')).toBe(true);
    cheatTask();
    expect(sounds).toBe(1);
    vi.advanceTimersByTime(WON_MAX_MS);
    await expect(done).resolves.toEqual({ solved: true, wrong: 0 });
    expect(root().classList.contains('hidden')).toBe(true);
  });
});
