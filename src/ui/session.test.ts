// @vitest-environment happy-dom
/**
 * The screen of the cat's offer of a break (PLAY-20, R31-R36): the card at a stop point, its two buttons, the sleeping cat
 * of "till tomorrow" and its "continue", the parents' button of the minutes. On the page's own markup (index.html).
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { QUIET_MIN, breakState } from '../game/session';
import type { StopHost } from '../game/stops';
import { STRINGS } from './strings';

// The module name is a variable: the game's type check knows no Node modules (as in src/game/taskviews/panel.test.ts).
const fsModule = 'node:fs';
let readFileSync: (path: string, encoding: 'utf8') => string;
const $ = (id: string) => document.getElementById(id)!;
const shown = (id: string) => !$(id).classList.contains('hidden');
/** Lets the awaited taps and handlers run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

let mod: typeof import('./session'), stops: typeof import('../game/stops'), ui: typeof import('./ui');
beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.__BUILD_DATE__ = '2026-11-18'; g.__BUILD_COMMIT__ = 'abc1234';
  ({ readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync: typeof readFileSync });
  const page = readFileSync('index.html', 'utf8');
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(page)![1].replace(/<script[\s\S]*?<\/script>/g, '');
  mod = await import('./session');
  stops = await import('../game/stops');
  ui = await import('./ui');
});

/** A game at the minute of its break: the stop point "task" brings the offer. */
function game(min = 20) {
  const save: Save = defaultSave();
  save.session = { min, last: Date.now(), quiet: 0 };
  let saved = 0, captions = 0;
  const said: string[] = [];
  const g = { save, busy: true, paused: false, persist: () => { saved++; },
    speech: { caption: () => { captions++; }, line: (key: string) => { said.push(key); return Promise.resolve(); } } } as unknown as StopHost;
  return { g, save, saved: () => saved, captions: () => captions, said };
}

beforeEach(() => {
  breakState.offer = null;
  for (const id of ['breakCard', 'sleep', 'bubble']) $(id).classList.add('hidden');
  $('start').classList.add('hidden'); $('hud').classList.remove('hidden');
});

describe('the cat\'s lines', () => {
  it('never says the same offer twice in a row, and every offer comes', () => {
    const sweep = Array.from({ length: 100 }, (_, i) => () => i / 100);
    for (const prev of mod.OFFERS) {
      const got = new Set(sweep.map((r) => mod.pickOther(mod.OFFERS, prev, r)));
      expect(got.has(prev), prev).toBe(false);
      expect(got.size).toBe(mod.OFFERS.length - 1);
    }
    expect(mod.OFFERS.length).toBe(5); expect(mod.PLAY_ON.length).toBe(3); expect(mod.GOODBYE.length).toBe(2);
  });
});

describe('the card at a stop point (R31, R32)', () => {
  it('is joined to the stop points: the point after a task shows it with the cat\'s offer and two buttons', async () => {
    const { g } = game();
    const point = stops.stopPoint('task', g);
    await tick();
    expect(shown('breakCard')).toBe(true);
    expect(mod.OFFERS.map((k) => STRINGS.uk[k])).toContain($('breakSay').textContent);
    expect([$('breakYes').textContent, $('breakNo').textContent]).toEqual(['До завтра 🌙', 'Ще пограю ▶']);
    $('breakNo').click(); await point;
  });

  it('shows nothing before the minutes, nor when off', async () => {
    const early = game(5);
    await stops.stopPoint('task', early.g);
    const off = game(40); off.save.breakMin = 0;
    await stops.stopPoint('task', off.g);
    expect(shown('breakCard')).toBe(false);
  });

  it('the walkthrough\'s lever held: no card at the minute of the break', async () => {
    mod.breakHold.held = true;
    try {
      const { g } = game();
      await stops.stopPoint('task', g);
      expect(shown('breakCard')).toBe(false);
    } finally { mod.breakHold.held = false; }
  });

  it('"play on": one tap closes it, the cat answers (a spoken line of the bubble), nothing is taken, the quiet is stored', async () => {
    const { g, save, saved, said } = game();
    const stars = save.stars = 7;
    const point = stops.stopPoint('task', g);
    await tick();
    $('breakNo').click();
    await point;
    expect(shown('breakCard')).toBe(false);
    expect(breakState.offer).toBeNull();
    expect(said).toHaveLength(1);
    expect(mod.PLAY_ON as readonly string[]).toContain(said[0]);
    expect(save.session!.quiet).toBe(20 + QUIET_MIN);
    expect(saved()).toBeGreaterThan(0);
    expect(save.stars).toBe(stars);
    expect(shown('start')).toBe(false);
  });

  it('"till tomorrow": saved at once, the start screen with the cat asleep; the point waits for "continue", one tap', async () => {
    const { g, save, saved } = game();
    let over = false;
    const point = stops.stopPoint('task', g).then(() => { over = true; });
    await tick();
    $('breakYes').click(); await tick();
    expect(saved()).toBeGreaterThan(0);
    expect(save.session!.quiet).toBe(20 + QUIET_MIN);
    expect(shown('breakCard')).toBe(false);
    expect([shown('start'), shown('sleep'), shown('setup'), shown('hud')]).toEqual([true, true, false, false]);
    expect(mod.GOODBYE.map((k) => STRINGS.uk[k])).toContain($('sleepSay').textContent);
    expect($('wake').textContent).toBe('Продовжити');
    await tick();
    expect(over).toBe(false);
    $('wake').click();
    await point;
    expect([shown('start'), shown('sleep'), shown('hud')]).toEqual([false, false, true]);
  });
});

describe('the parents\' button of the break (R33)', () => {
  it('steps 10, 15, 20, 30, off and writes the save; the default is 20', async () => {
    const save = defaultSave();
    let changes = 0;
    ui.initBook(save, { parts: () => [], stats: () => [] }, { change: () => { changes++; }, reset() {}, open() {}, shop() {} });
    $('btnParents').click();
    const [, a, b] = /(\d+) × (\d+)/.exec($('gateQ').textContent!)!.map(Number);
    const gateA = $('gateA') as HTMLInputElement;
    gateA.value = String(a * b); gateA.dispatchEvent(new Event('input'));
    expect($('pBreak').textContent).toBe('20 хв');
    const seen: (number | undefined)[] = [], labels: string[] = [];
    for (let i = 0; i < 5; i++) { $('pBreak').click(); seen.push(save.breakMin); labels.push($('pBreak').textContent!); }
    expect(seen).toEqual([30, 0, 10, 15, 20]);
    expect(labels).toEqual(['30 хв', 'Вимкнено', '10 хв', '15 хв', '20 хв']);
    expect(changes).toBe(5);
  });
});

describe('the hook (T2)', () => {
  it('src/game/start.ts imports the screen, so that it is in the game', () => {
    const start = readFileSync('src/game/start.ts', 'utf8');
    expect(start).toMatch(/^import '\.\.\/ui\/session';/m);
  });
});
