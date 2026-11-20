// @vitest-environment happy-dom
/**
 * The cat's meeting on a new day (PLAY-21, R37, R40, R44, R51): hello and the star of the day on the first launch on a new
 * date, the old welcome back on the same day, the walkthrough's lever (R61), and a tap on the cat - the line of the
 * bubble again, or "where we stopped" by the state of the world. On the page's own markup (index.html).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, type Save, type WorldState } from '../core/save';
import { dayKey } from '../game/playtime';
import { STRINGS } from './strings';

// The tour of the world is not this test's: the entry into the world goes straight to the meeting.
vi.mock('../game/flyover', () => ({ tour: async () => {} }));

// The module name is a variable: the game's type check knows no Node modules (as in src/ui/session.test.ts).
const fsModule = 'node:fs';
let mod: typeof import('./welcome');
const $ = (id: string) => document.getElementById(id)!;

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.__BUILD_DATE__ = '2026-11-18'; g.__BUILD_COMMIT__ = 'abc1234';
  const { readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync: (p: string, e: 'utf8') => string };
  const page = readFileSync('index.html', 'utf8');
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(page)![1].replace(/<script[\s\S]*?<\/script>/g, '');
  mod = await import('./welcome');
});

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 18, 10, 0).getTime();

/** A game played before: what the meeting reads and calls, with what it said and gave. */
function game(gift?: string) {
  const save: Save = defaultSave();
  save.played = true; save.stars = 5;
  if (gift !== undefined) save.gift = gift;
  const said: string[] = [], gifts: number[] = [];
  let repeats = 0;
  const g = {
    save, cat: { root: { position: { x: 0, y: 0, z: 0 } } }, above: (p: unknown) => p, persist: () => {},
    // the heroine where she stands (sayLeft gives up once she has walked off): she stays
    hero: { root: { position: { clone: () => ({}), distanceTo: () => 0 } } },
    // the game's own adding of stars (the one writer of the stars, src/game/no-penalties.test.ts)
    addStars: (n: number) => { gifts.push(n); save.stars += n; },
    speech: { line: (key: string) => { said.push(key); return Promise.resolve(); }, repeat: () => { repeats++; } },
    world: { characters: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, steps: [1, 2, 3] })) },
    ws: { quests: {}, final: false } as Pick<WorldState, 'quests' | 'final'>,
  };
  return { g: g as unknown as Parameters<typeof import('./welcome').meet>[0] & Parameters<typeof import('./welcome').catTap>[0], save, said, gifts, repeats: () => repeats, raw: g };
}

beforeEach(() => {
  mod.giftState.held = false;
  localStorage.clear();
  $('bubble').classList.add('hidden');
});

describe('the meeting after "Play" (R37, R40, R44)', () => {
  it('on a new date: a hello, one star by addStars, a line of the gift and its caption; the date is stored', async () => {
    const { g, save, said, gifts } = game(dayKey(new Date(NOW - DAY)));
    await mod.meet(g, NOW);
    expect(said).toHaveLength(2);
    expect(mod.HELLOS).toContain(said[0]);
    expect(mod.GIFTS).toContain(said[1]);
    expect(gifts).toEqual([1]);
    expect(save.stars).toBe(6);
    expect(save.gift).toBe(dayKey(new Date(NOW)));
    expect($('giftCaption').textContent).toContain('+1 ⭐');
    expect($('giftCaption').classList.contains('hidden')).toBe(false);
  });

  it('a save that never had a gift gets one too', async () => {
    const { g, gifts } = game();
    await mod.meet(g, NOW);
    expect(gifts).toEqual([1]);
  });

  it('on the same date: the old welcome back, no star', async () => {
    const { g, save, said, gifts } = game(dayKey(new Date(NOW)));
    await mod.meet(g, NOW);
    expect(said).toEqual(['welcome_back']);
    expect(gifts).toEqual([]);
    expect(save.stars).toBe(5);
  });

  it('the very first launch marks the day with no star: a second launch the same day is welcome back', async () => {
    const { g, save, said, gifts } = game();
    save.played = false; save.stars = 0;
    mod.firstDay(g, NOW);
    expect(save.gift).toBe(dayKey(new Date(NOW)));
    expect(save.stars).toBe(0);
    await mod.meet(g, NOW + 3_600_000);
    expect(said).toEqual(['welcome_back']);
    expect(gifts).toEqual([]);
  });

  it('a second launch the same day after a gift: welcome back', async () => {
    const { g, said, gifts } = game(dayKey(new Date(NOW - DAY)));
    await mod.meet(g, NOW);
    await mod.meet(g, NOW + 3_600_000);
    expect(said[2]).toBe('welcome_back');
    expect(gifts).toEqual([1]);
  });

  it('days skipped give one star, not one each (R38)', async () => {
    const { g, gifts } = game(dayKey(new Date(NOW - 9 * DAY)));
    await mod.meet(g, NOW);
    expect(gifts).toEqual([1]);
  });

  it('never says the hello of the last meeting', async () => {
    for (const last of mod.HELLOS) {
      for (let i = 0; i < 20; i++) {
        localStorage.setItem('amw-hello', last);
        const { g, said } = game('2000-01-01');
        await mod.meet(g, NOW);
        expect(said[0]).not.toBe(last);
      }
    }
  });

  it('the walkthrough\'s lever: no gift, welcome back, the date of the gift untouched (R61)', async () => {
    mod.giftState.held = true;
    const { g, save, said, gifts } = game('2000-01-01');
    await mod.meet(g, NOW);
    expect(said).toEqual(['welcome_back']);
    expect(gifts).toEqual([]);
    expect(save.gift).toBe('2000-01-01');
  });

  it('every line of the meeting has its text in both languages', () => {
    for (const k of [...mod.HELLOS, ...mod.GIFTS, 'welcome_back' as const]) {
      expect(STRINGS.uk[k]).toBeTruthy(); expect(STRINGS.ru[k]).toBeTruthy();
    }
  });
});

describe('"where we stopped" (R40)', () => {
  const chars = { characters: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, steps: [1, 2, 3] })) };
  const ws = (quests: Record<string, number>, final = false) => ({ quests, final });
  it('by the state of the world', () => {
    expect(mod.leftKey(chars, ws({}))).toBe('left_new_world');
    expect(mod.leftKey(chars, ws({ a: 1 }))).toBe('left_mid_chain');
    expect(mod.leftKey(chars, ws({ a: 3, b: 2 }))).toBe('left_mid_chain');
    expect(mod.leftKey(chars, ws({ a: 3 }))).toBe('left_between');
    expect(mod.leftKey(chars, ws({ a: 3, b: 3, c: 3, d: 3 }))).toBe('left_between');
    expect(mod.leftKey(chars, ws({ a: 3, b: 3, c: 3, d: 3, e: 3 }))).toBe('left_before_final');
    expect(mod.leftKey(chars, ws({ a: 3, b: 3, c: 3, d: 3, e: 3 }, true))).toBe('left_after_artifact');
    expect(mod.leftKey({}, ws({}, true))).toBe('left_after_artifact');
    expect(mod.leftKey({}, ws({}))).toBe('left_new_world');
  });

  it('a tap on the cat with the bubble empty says the line of the world played, read at the tap', () => {
    const { g, said, raw, repeats } = game();
    mod.catTap(g);
    raw.ws = ws({ a: 2 });
    mod.catTap(g);
    raw.ws = ws({ a: 3, b: 3, c: 3, d: 3, e: 3 }, true);
    mod.catTap(g);
    expect(said).toEqual(['left_new_world', 'left_mid_chain', 'left_after_artifact']);
    expect(repeats()).toBe(0);
  });

  it('a tap on the cat says the world\'s own word when it has one (WorldDef.left), else the shared one', () => {
    const { g, said, raw } = game();
    (raw.world as { left?: (ws: { final: boolean }) => string | null }).left = (w) => (w.final ? 'tree_calls' : null);
    mod.catTap(g);
    raw.ws = ws({}, true);
    mod.catTap(g);
    expect(said).toEqual(['left_new_world', 'tree_calls']);
  });

  it('a tap on the cat with a line in the bubble repeats it', () => {
    const { g, said, repeats } = game();
    $('bubble').classList.remove('hidden');
    mod.catTap(g);
    expect(repeats()).toBe(1);
    expect(said).toEqual([]);
  });
});

describe('the wiring (src/game/start.ts)', () => {
  it('"Play" of a game played before brings the meeting: a hello and the star on a new day', async () => {
    const { enterWorld } = await import('../game/start');
    const { g, said, gifts } = game('2000-01-01');
    await enterWorld(g as never, false);
    expect(mod.HELLOS).toContain(said[0]);
    expect(gifts).toEqual([1]);
  });

  it('the first "Play" of a new save has no meeting: the first hint only', async () => {
    const { enterWorld } = await import('../game/start');
    const { g, said, gifts } = game('2000-01-01');
    await enterWorld(g as never, true);
    expect(said).toEqual(['go_next']);
    expect(gifts).toEqual([]);
  });

  it('back from another world (a change of world): no meeting and no "welcome back", only the world\'s own word', async () => {
    const { enterWorld } = await import('../game/start');
    const a = game('2000-01-01');
    await enterWorld(a.g as never, false, 'travel');
    expect(a.said).toEqual([]);
    expect(a.gifts).toEqual([]);
    const b = game('2000-01-01');
    (b.raw.world as { left?: () => string | null }).left = () => 'hub_asleep';
    await enterWorld(b.g as never, false, 'travel');
    expect(b.said).toEqual(['hub_asleep']);
  });

  it('on "Play" the world\'s own word waits for the stop point (an achievement\'s scene would cut it off)', async () => {
    const { enterWorld } = await import('../game/start');
    const { g, raw, said } = game();
    (raw.world as { left?: () => string | null }).left = () => 'tree_calls';
    await enterWorld(g as never, false);
    expect(said).not.toContain('tree_calls');   // said by sayLeft after atPlay
    const src = (await import('node:fs')).readFileSync('src/game/start.ts', 'utf8');
    expect(src).toMatch(/void atPlay\(g\)\.then\(\(\) => \{ if \(!first\) sayLeft\(g\); \}\);/);
  });

  it('the world\'s own word waits for the game at rest (an achievement\'s line still sounding would turn it away)', async () => {
    const { sayLeft, LEFT_WAIT_FRAMES } = await import('../game/start');
    const run = (watch: { held(): boolean; quiet(): boolean; gone(): boolean }) => {
      const t = game();
      (t.raw.world as { left?: () => string | null }).left = () => 'tree_calls';
      let frames = 0;
      const q: (() => void)[] = [];
      sayLeft(t.g as never, watch, (fn) => { frames++; q.push(fn); });
      while (q.length) q.shift()!();
      return { said: t.said, frames };
    };
    // a card held 5000 frames (far past the limit), then a line sounding 3 more frames: said once, after them
    let card = 5000, busy = 3;
    expect(run({ held: () => card-- > 0, quiet: () => busy-- <= 0, gone: () => false })).toEqual({ said: ['tree_calls'], frames: 5003 });
    // never quiet with no card: gives up after LEFT_WAIT_FRAMES
    expect(run({ held: () => false, quiet: () => false, gone: () => false })).toEqual({ said: [], frames: LEFT_WAIT_FRAMES - 1 });
    // she walked off (or a task opened) while the card was up: nothing, at once
    let walk = 10;
    expect(run({ held: () => true, quiet: () => true, gone: () => walk-- <= 0 })).toEqual({ said: [], frames: 10 });
  });

  it('the first entry of a world with no characters (the hub) has no hint: there is no friend to run to', async () => {
    const { enterWorld } = await import('../game/start');
    const { g, raw, said } = game('2000-01-01');
    raw.world = { characters: [] };
    await enterWorld(g as never, true);
    expect(said).toEqual([]);
  });
});
