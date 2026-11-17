import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, loadSave, storeSave, worldState, type Save } from '../core/save';
import { check } from './achievements';
import {
  BREAK_DEFAULT, QUIET_MIN, RESET_GAP_MS, accept, breakMinutes, breakState, breakStop, dailyGift, decline, sessionMinutes,
  shouldOffer, tickSession,
} from './session';
import { setScreen, stopPoint, worldContext, type StopHost } from './stops';

/** A clock of its own: every test starts at a fixed local time and moves it by hand. */
const T0 = new Date(2026, 10, 17, 9, 0, 0).getTime();
let now = T0;

/** `minutes` of seen play, a frame a second, as the loop counts them. */
function play(save: Save, minutes: number) {
  for (let i = 0; i < Math.round(minutes * 60); i++) { now += 1000; tickSession(save, 1, true, now); }
}
const host = (save: Save, over: Partial<StopHost> = {}): StopHost => ({ save, busy: true, paused: false, persist: () => {}, ...over });
/** A stop point after a task, through the real subscription of src/game/stops.ts. */
const afterTask = (save: Save) => stopPoint('task', host(save));
/** What the screen of the break would do: show the offer waiting, and decline it. */
const offered = () => breakState.offer;

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); }, get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
  };
}

beforeEach(() => { now = T0; breakState.offer = null; vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { breakState.offer = null; setScreen({ taskOpen: () => false, cardOpen: () => false }); vi.unstubAllGlobals(); });

describe('the break (PLAY-20, R31-R35, R56): the minutes of the session, a stop point, the quiet', { timeout: 30_000 }, () => {
  it('the default is 20 minutes: 19 give no offer, 20 give one at the next point after a task', async () => {
    const s = defaultSave();
    expect(breakMinutes(s)).toBe(BREAK_DEFAULT);
    play(s, 19);
    await afterTask(s);
    expect(offered()).toBeNull();
    play(s, 1);
    expect(offered()).toBeNull();          // the minutes alone bring nothing: only a point does
    await afterTask(s);
    expect(offered()).toBe('task');
  });

  it('20 minutes in the middle of a task: no offer while it is open, the offer at the point after it', async () => {
    const s = defaultSave();
    play(s, 18);
    setScreen({ taskOpen: () => true, cardOpen: () => false });
    play(s, 4);
    await afterTask(s);                    // a point over an open task does not come in
    expect(offered()).toBeNull();
    setScreen({ taskOpen: () => false, cardOpen: () => false });
    await stopPoint('part', host(s));      // after the card of a part (R31: after a task or a shard)
    expect(offered()).toBe('part');
  });

  it('only after a task or a part: never at the book or at "Play"', async () => {
    const s = defaultSave();
    play(s, 25);
    await stopPoint('book', host(s, { busy: false }));
    await stopPoint('play', host(s, { busy: false }));
    expect(offered()).toBeNull();
    expect([shouldOffer(s, 'book'), shouldOffer(s, 'play'), shouldOffer(s, 'task'), shouldOffer(s, 'part')]).toEqual([false, false, true, true]);
  });

  it('a decline: 9 minutes of quiet give nothing, at 10 the next point offers again; the stars and the progress stay', async () => {
    const s = defaultSave();
    s.stars = 12;
    Object.assign(worldState(s, 'fairy'), { quests: { fox: 2 }, starsTaken: [1, 3] });
    let stored = 0;
    play(s, 20);
    await afterTask(s);
    expect(offered()).toBe('task');
    const before = JSON.stringify({ stars: s.stars, worlds: s.worlds, skills: s.skills, achievements: s.achievements, owned: s.owned });
    decline(host(s, { persist: () => { stored++; } }));
    expect(offered()).toBeNull();
    expect(stored).toBe(1);
    expect(JSON.stringify({ stars: s.stars, worlds: s.worlds, skills: s.skills, achievements: s.achievements, owned: s.owned })).toBe(before);
    play(s, QUIET_MIN - 1);
    await afterTask(s);
    expect(offered()).toBeNull();
    play(s, 1);
    await afterTask(s);
    expect(offered()).toBe('task');
  });

  it('"till tomorrow" and back at once: the same quiet, and nothing lost', async () => {
    const s = defaultSave();
    s.stars = 5;
    play(s, 20);
    await afterTask(s);
    accept(host(s));
    expect([offered(), s.stars]).toEqual([null, 5]);
    play(s, 9.5);
    await afterTask(s);
    expect(offered()).toBeNull();
    play(s, 0.5);
    await afterTask(s);
    expect(offered()).toBe('task');
  });

  it('off (0): never, however long the session', async () => {
    const s = defaultSave();
    s.breakMin = 0;
    play(s, 120);
    await afterTask(s);
    await stopPoint('part', host(s));
    expect(offered()).toBeNull();
    expect(shouldOffer(s, 'task')).toBe(false);
  });

  it('10, 15 and 30 minutes: the offer comes at the chosen minute, not a minute before', async () => {
    for (const m of [10, 15, 30]) {
      const s = defaultSave();
      s.breakMin = m;
      breakState.offer = null;
      play(s, m - 1);
      await afterTask(s);
      expect(offered(), `${m} - 1`).toBeNull();
      play(s, 1);
      await afterTask(s);
      expect(offered(), `${m}`).toBe('task');
    }
  });

  it('a damaged choice counts as 20', () => {
    expect(breakMinutes({ breakMin: 25 })).toBe(20);
    expect(breakMinutes({ breakMin: undefined })).toBe(20);
    expect(breakMinutes({ breakMin: 0 })).toBe(0);
  });

  it('a reload goes on counting: the minutes and the quiet come back with the stored save', async () => {
    const s = defaultSave();
    play(s, 15);
    storeSave(s);
    const back = loadSave();               // the page reloaded a moment later
    expect(sessionMinutes(back)).toBeCloseTo(15, 5);
    play(back, 5);
    await afterTask(back);
    expect(offered()).toBe('task');
    decline(host(back, { persist: () => storeSave(back) }));
    const again = loadSave();
    breakState.offer = null;               // a reload drops a waiting offer; the quiet stays
    play(again, 5);
    await afterTask(again);
    expect(offered()).toBeNull();
    play(again, 5);
    await afterTask(again);
    expect(offered()).toBe('task');
  });

  it('a rest of half an hour starts the session again; a shorter one does not; a hidden page counts nothing', async () => {
    const s = defaultSave();
    play(s, 15);
    now += RESET_GAP_MS - 60_000;          // 29 minutes away
    play(s, 5);
    expect(sessionMinutes(s)).toBeCloseTo(20, 5);
    await afterTask(s);
    expect(offered()).toBe('task');
    now += RESET_GAP_MS;                   // the evening after the morning
    play(s, 1);
    expect(sessionMinutes(s)).toBeCloseTo(1, 5);
    expect(offered()).toBeNull();          // the offer of the old session is gone with it
    await afterTask(s);
    expect(offered()).toBeNull();
    tickSession(s, 600, false, now + 1000);
    tickSession(s, 0, true, now + 2000);
    expect(sessionMinutes(s)).toBeCloseTo(1, 5);
  });

  it('a rest after a decline clears the quiet with the session', async () => {
    const s = defaultSave();
    play(s, 20);
    await afterTask(s);
    decline(host(s));
    now += RESET_GAP_MS;
    play(s, 20);
    await afterTask(s);
    expect(offered()).toBe('task');
  });

  it('the subscriber reads the save through g at every point, never one kept', () => {
    const a = defaultSave(), b = defaultSave();
    play(b, 20);
    breakStop({ save: a }, 'task');
    expect(offered()).toBeNull();
    breakStop({ save: b }, 'task');
    expect(offered()).toBe('task');
  });

  it('the loop counts the session next to the minutes of the day, on the same rule', () => {
    const src = Object.values(import.meta.glob('./loop.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];
    expect(src).toMatch(/\n\s*tickSession\(g\.save, Math\.min\(real, 1\), g\.started\(\) && !document\.hidden\);/);
  });
});

describe('the gift of the day (PLAY-21, R37-R39, R44)', () => {
  const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();

  /** The launches at the given times: the stars the gift gave at each. */
  const launches = (s: Save, ...times: number[]) => times.map((t) => dailyGift(s, t));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  it('the first launch of a date gives one star; a second launch that day none', () => {
    const s = defaultSave();
    expect(launches(s, at(2026, 11, 17, 8), at(2026, 11, 17, 21))).toEqual([1, 0]);
    expect(s.gift).toBe('2026-11-17');
  });

  it('three days skipped give one star, not one for each; a skipped day takes nothing', () => {
    const s = defaultSave();
    s.stars = 10;
    const got = launches(s, at(2026, 11, 13), at(2026, 11, 17), at(2026, 11, 17, 23));
    expect(got).toEqual([1, 1, 0]);
    expect(sum(got.slice(1))).toBe(1);
    expect(s.stars).toBe(10);              // the gift never writes the stars itself, and never takes one
  });

  it('the next day gives one again; a clock set back gives one more (R44: allowed), never a negative', () => {
    const s = defaultSave();
    expect(launches(s, at(2026, 11, 17), at(2026, 11, 18, 0), at(2026, 11, 16))).toEqual([1, 1, 1]);
  });

  it('a damaged date gives the gift of the day, once', () => {
    const s = defaultSave();
    s.gift = '';
    expect(launches(s, at(2026, 11, 17), at(2026, 11, 17))).toEqual([1, 0]);
  });
});

describe('the context of the achievements of the world being played (PLAY-08, debt of wave 2)', () => {
  const skillOf = () => null;
  const chars = [{ id: 'fox', emoji: '', x: 0, z: 0, heading: 0, steps: ['add'], shard: '' }];
  /** A save where the world `w` has its chest open and its three ground stars taken. */
  function explored() {
    const s = defaultSave();
    Object.assign(worldState(s, 'w'), { flags: { box: true }, starsTaken: [0, 1, 2] });
    return s;
  }

  it('secret_chest and all_world_stars come of the chest and the ground stars of the world being played', () => {
    const ctx = worldContext({ id: 'w', characters: chars, secrets: ['box'], chest: 'box', groundStars: 3 }, skillOf);
    expect(ctx.worlds[0]).toMatchObject({ id: 'w', chest: 'box', groundStars: [0, 1, 2], secrets: ['box'] });
    expect(check(explored(), ctx, 1).sort()).toEqual(expect.arrayContaining(['all_world_stars', 'secret_chest']));
  });

  it('a world without a chest or ground stars gives neither, the same progress or not', () => {
    const ctx = worldContext({ id: 'w', characters: chars, secrets: ['box'] }, skillOf);
    const got = check(explored(), ctx, 1);
    expect(got).not.toContain('secret_chest');
    expect(got).not.toContain('all_world_stars');
  });

  it('the progress of another world counts nothing for this one', () => {
    const ctx = worldContext({ id: 'other', characters: [], chest: 'box', groundStars: 3 }, skillOf);
    const got = check(explored(), ctx, 1);
    expect(got).not.toContain('secret_chest');
    expect(got).not.toContain('all_world_stars');
  });

  it('a world without characters counts no chain; the skills come of its steps', () => {
    expect(worldContext({ id: 'v' }, skillOf)).toEqual({ worlds: [{ id: 'v', quests: [], groundStars: [], secrets: [] }], skills: [] });
    expect(worldContext({ id: 'w', characters: chars }, (st) => (st === 'add' ? 'add' : null)).skills).toEqual(['add']);
  });
});
