// @vitest-environment happy-dom
/**
 * The cat's word in the hub (./index.ts hubLeft, WorldDef.left): with nothing new - every open world done, the others
 * asleep - "the other worlds still sleep, shall we go back to the fairies?"; on a tap always, as she comes in only
 * while LEAD_HOME. With an open world not done - the shared words.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSave, defaultWorld, type Save } from '../../core/save';
import { knowWorlds, knownWorlds } from '../../game/artifacts';
import { HEARD_WAKE, SEA_WORDS, hubLeft, worldWord } from './index';
import { wakingArches } from './portals';
import { somethingNew } from './portals';
import { strings } from './strings';

const before = knownWorlds();
afterEach(() => knowWorlds(before));
const final = (s: Save, id: string) => { (s.worlds as Record<string, unknown>)[id] = { quests: {}, final: true, starsTaken: [], flags: {}, pos: null }; };

describe('the cat in the hub with nothing new', () => {
  it('somethingNew: an open arch to a world not done', () => {
    const done = (id: string) => id === 'fairy';
    expect(somethingNew(['fairy', null, null, null, null], done)).toBe(false);
    expect(somethingNew(['fairy', 'sea', null, null, null], done)).toBe(true);
    expect(somethingNew([null, null, null, null, null], done)).toBe(false);
  });

  it('every open world done: "the other worlds still sleep" on a tap, and on entry while LEAD_HOME', () => {
    knowWorlds([{ id: 'fairy', shelf: 0 }, { id: 'hub' }]);
    const s = defaultSave(); final(s, 'fairy');
    expect(hubLeft(s, 'tap')).toBe('hub_asleep');
    expect(hubLeft(s, 'entry', true)).toBe('hub_asleep');
    expect(hubLeft(s, 'entry', false)).toBeNull();
    expect(hubLeft(s, 'tap', false)).toBe('hub_asleep');   // the tap is the fix of the shared "new friends": no flag
  });

  it('an open world not done yet: the shared words', () => {
    knowWorlds([{ id: 'fairy', shelf: 0 }, { id: 'sea', shelf: 2 }, { id: 'hub' }]);
    const s = defaultSave(); final(s, 'fairy');
    expect(hubLeft(s, 'tap')).toBeNull();
    expect(hubLeft(s, 'entry')).toBeNull();
  });

  it('the line is the hub\'s own and spoken', () => {
    expect(strings.table.uk.hub_asleep).toBe('Інші світи ще сплять. Повернемося до фей?');
    expect(strings.spoken.hub_asleep).toBe('warm');
  });
});

describe('the cat by a sleeping arch (D)', () => {
  const arches = [{ shelf: 2, x: 0, z: -12.5 }, { shelf: 3, x: 7, z: -10 }];
  it('says it once as she comes near, not while she stays, again after she has gone off and come back', async () => {
    const { sleepingToSpeakOf, SLEEP_NEAR, SLEEP_FAR } = await import('./portals');
    const heard = new Set<number>();
    expect(sleepingToSpeakOf(0, -2, arches, heard)).toBeNull();                       // far from both
    expect(sleepingToSpeakOf(0, -12.5 + SLEEP_NEAR - 0.2, arches, heard)).toBe(2);   // came near the sea's arch
    expect(sleepingToSpeakOf(0, -12.5 + 1, arches, heard)).toBeNull();               // stays: no repeat
    expect(sleepingToSpeakOf(0, -12.5 + (SLEEP_NEAR + SLEEP_FAR) / 2, arches, heard)).toBeNull();   // between: still heard
    expect(sleepingToSpeakOf(0, -12.5 + SLEEP_FAR + 1, arches, heard)).toBeNull();   // gone off
    expect(sleepingToSpeakOf(0, -12.5 + 1, arches, heard)).toBe(2);                  // and back: again
  });
  it('the line is the hub\'s own and spoken', () => {
    expect(strings.table.uk.hub_sleeping).toBe('Цей світ ще спить. Він прокинеться згодом!');
    expect(strings.spoken.hub_sleeping).toBe('warm');
  });
});

describe('the cat\'s words of the sea in the hub (worldWord), each once as she comes in, as before', () => {
  const ARCHES = ['fairy', 'forest', 'sea', null, null];
  it('its arch open and the sea not visited: no word here - the arch says it waking (hub_sea_wake, wakingArches)', () => {
    const ws = defaultWorld(), s = defaultSave();
    expect(worldWord(ws, s, ARCHES)).toBeNull();
    expect(ws.flags[SEA_WORDS.wake]).toBeUndefined();
    // the flag of the word heard before the arches woke marks the sea's arch awake: it does not wake again
    expect(wakingArches(ARCHES, {}, HEARD_WAKE)).toEqual([1, 2]);
    expect(wakingArches(ARCHES, { [SEA_WORDS.wake]: true }, HEARD_WAKE)).toEqual([1]);
  });
  it('the sea done: its pearl is home, the next time the tree grew, then nothing', () => {
    const ws = defaultWorld(), s = defaultSave(); final(s, 'sea');
    expect(worldWord(ws, s, ARCHES)).toBe('hub_sea_home');
    expect(worldWord(ws, s, ARCHES)).toBe('hub_sea_after');
    expect(worldWord(ws, s, ARCHES)).toBeNull();
  });
  it('visited but not done, or no arch to the sea (the published build): no word of the sea', () => {
    const ws = defaultWorld(), s = defaultSave();
    (s.worlds as Record<string, unknown>).sea = { quests: {}, final: false, starsTaken: [], flags: {}, pos: null };
    expect(worldWord(ws, s, ARCHES)).toBeNull();
    expect(worldWord(defaultWorld(), defaultSave(), ['fairy', null, null, null, null])).toBeNull();
  });
  it('they are spoken lines of the hub', () => {
    for (const k of ['hub_sea_wake', 'hub_sea_home', 'hub_sea_after']) expect(Object.hasOwn(strings.spoken, k), k).toBe(true);
  });
  it('a save of before: the flags of the sea\'s words are the same, a word said is not said again', () => {
    const ws = defaultWorld(), s = defaultSave(); final(s, 'sea');
    ws.flags[SEA_WORDS.home] = true;
    expect(worldWord(ws, s, ARCHES)).toBe('hub_sea_after');
    ws.flags[SEA_WORDS.after] = true;
    expect(worldWord(defaultWorld(), s, ARCHES)).toBe('hub_sea_home');
    expect(worldWord(ws, s, ARCHES)).toBeNull();
  });
});

describe('the cat\'s words of every world the same way (worldWord): no line of code for a next world', () => {
  const ARCHES = ['fairy', 'forest', 'sea', null, null];
  it('the forest done: its Emerald home, the next time the tree in bloom, then nothing', () => {
    const ws = defaultWorld(), s = defaultSave(); final(s, 'forest');
    expect(worldWord(ws, s, ARCHES)).toBe('hub_forest_home');
    expect(worldWord(ws, s, ARCHES)).toBe('hub_forest_after');
    expect(worldWord(ws, s, ARCHES)).toBeNull();
    expect(ws.flags).toMatchObject({ forest_home: true, forest_after: true });
  });
  it('both done: one word an entry, every home before any after, the worlds in the order of their arches', () => {
    const ws = defaultWorld(), s = defaultSave(); final(s, 'forest'); final(s, 'sea');
    const said = [1, 2, 3, 4, 5].map(() => worldWord(ws, s, ARCHES));
    expect(said).toEqual(['hub_forest_home', 'hub_sea_home', 'hub_forest_after', 'hub_sea_after', null]);
  });
  it('a world done with no lines of its own in the hub has no word; the waking word is never one of them', () => {
    const ws = defaultWorld(), s = defaultSave(); final(s, 'fairy'); final(s, 'forest');
    const spoken = { hub_forest_wake: 'joy' };
    expect(worldWord(ws, s, ARCHES, spoken)).toBeNull();
    expect(worldWord(ws, s, ARCHES)).toBe('hub_forest_home');
  });
  it('the forest\'s words are spoken lines of the hub', () => {
    for (const k of ['hub_forest_wake', 'hub_forest_home', 'hub_forest_after']) expect(Object.hasOwn(strings.spoken, k), k).toBe(true);
  });
});
