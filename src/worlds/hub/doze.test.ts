// @vitest-environment happy-dom
/**
 * The explorer's key in the hub (PLAY-36, ./index.ts readyIn/keptIn/archesIn, ./portals.ts openArches/dozingArches,
 * ./gold-frame.ts): the next arch wakes with the artifact and half the world explored, or the artifact alone with the
 * parents' free pass; an arch once open never closes; an arch dozing has the cat's word of its world; a world
 * explored whole has a gold frame by its nest.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../../core/save';
import { knowWorlds, knownWorlds, type ArtifactWorld } from '../../game/artifacts';
import { fillExplore } from '../../game/explore';
import { archesIn, dozeKey, hubLeft, keptIn, readyIn } from './index';
import { dozingArches, openArches } from './portals';
import { FRAME, GOLD_GLOW, goldFrames, goldShelves } from './gold-frame';
import { strings } from './strings';

const before = knownWorlds();
afterEach(() => knowWorlds(before));
const final = (s: Save, id: string) => { (s.worlds as Record<string, unknown>)[id] = { quests: {}, final: true, starsTaken: [], flags: {}, pos: null }; };
const cones = { items: Array(6).fill({ kind: 'cone' }) };
const WORLDS: ArtifactWorld[] = [
  { id: 'fairy', shelf: 0, secrets: ['f1', 'f2'], collect: cones }, { id: 'forest', shelf: 1, secrets: ['g1'], collect: cones },
  { id: 'sea', shelf: 2, secrets: ['s1'] }, { id: 'hub' },
];

describe('openArches and dozingArches (pure)', () => {
  const leads = ['fairy', 'forest', 'sea', null, null];
  it('an arch wakes once the world before it is ready; one kept stays open whatever', () => {
    const ready = (...ids: string[]) => (id: string) => ids.includes(id);
    expect(openArches(leads, ready())).toEqual(['fairy', null, null, null, null]);
    expect(openArches(leads, ready('fairy'))).toEqual(['fairy', 'forest', null, null, null]);
    expect(openArches(leads, ready(), (shelf) => shelf === 2)).toEqual(['fairy', null, 'sea', null, null]);
  });
  it('dozing: the world before done, the arch not open; with that world', () => {
    const done = (id: string) => id === 'fairy' || id === 'forest';
    expect(dozingArches(leads, ['fairy', null, null, null, null], (id) => id === 'fairy')).toEqual([{ shelf: 1, before: 'fairy' }]);
    expect(dozingArches(leads, ['fairy', 'forest', null, null, null], done)).toEqual([{ shelf: 2, before: 'forest' }]);
    expect(dozingArches(leads, ['fairy', 'forest', 'sea', null, null], done)).toEqual([]);
    expect(dozingArches(['fairy', null, 'sea', null, null], ['fairy', null, null, null, null], (id) => id === 'fairy')).toEqual([{ shelf: 2, before: 'fairy' }]);
  });
});

describe('the arches of a save (./index.ts)', () => {
  it('the fairies done, little explored: the forest\'s arch dozes, the cat speaks of the fairies; half explored - open', () => {
    knowWorlds(WORLDS);
    const s = defaultSave(); final(s, 'fairy');
    expect(archesIn(s)).toEqual({ open: ['fairy', null, null, null, null], dozing: [{ shelf: 1, before: 'fairy' }] });
    expect(hubLeft(s, 'tap')).toBe('hub_doze_fairy');
    expect(hubLeft(s, 'entry', false)).toBe('hub_doze_fairy');
    fillExplore(s, WORLDS[0], 0.3);   // 3 of 7 (2 secrets, a set, 4 steps of the stars): the half is 4
    expect(readyIn(s)('fairy')).toBe(false);
    fillExplore(s, WORLDS[0], 0.5);
    expect(readyIn(s)('fairy')).toBe(true);
    expect(archesIn(s)).toEqual({ open: ['fairy', 'forest', null, null, null], dozing: [] });
    expect(hubLeft(s, 'tap')).toBeNull();                  // the forest not done: the shared words
  });

  it('the free pass: the artifact alone, as before the key', () => {
    knowWorlds(WORLDS);
    const s = defaultSave(); final(s, 'fairy'); s.freeArches = true;
    expect(archesIn(s).open).toEqual(['fairy', 'forest', null, null, null]);
    expect(archesIn(s).dozing).toEqual([]);
  });

  it('a world not done is never ready, however explored', () => {
    knowWorlds(WORLDS);
    const s = defaultSave(); fillExplore(s, WORLDS[0], 1);
    expect(readyIn(s)('fairy')).toBe(false);
    expect(archesIn(s).dozing).toEqual([]);
  });

  it('an arch once open never closes: woken (its flag or its world\'s word of waking) or its world played', () => {
    knowWorlds(WORLDS);
    const s = defaultSave(); final(s, 'fairy'); final(s, 'forest');
    // the forest played: its arch open, though the fairies are explored little; the sea's dozes on the forest
    expect(archesIn(s)).toEqual({ open: ['fairy', 'forest', null, null, null], dozing: [{ shelf: 2, before: 'forest' }] });
    const hub = (flags: Record<string, boolean>) => { (s.worlds as Record<string, unknown>).hub = { quests: {}, final: false, starsTaken: [], flags, pos: null }; };
    hub({ woke2: true });
    expect(archesIn(s).open).toEqual(['fairy', 'forest', 'sea', null, null]);
    hub({ sea_wake: true });
    expect(keptIn(s)(2, 'sea')).toBe(true);
    hub({});
    expect(keptIn(s)(2, 'sea')).toBe(false);
  });

  it('the lines of the dozing arches: one for each world before an arch, warm, in both languages', () => {
    for (const w of ['fairy', 'forest', 'sea', 'sweet']) {
      const k = `hub_doze_${w}` as keyof typeof strings.table.uk;
      expect(dozeKey(w)).toBe(k);
      expect(strings.table.uk[k]).toMatch(/^Арка ще дрімає — давай ще трохи дослідимо .+!$/);
      expect(strings.table.ru[k]).toMatch(/^Арка ещё дремлет — давай ещё немного исследуем .+!$/);
      expect(strings.spoken[k as keyof typeof strings.spoken]).toBe('warm');
    }
    expect(dozeKey('sky')).toBeNull();                      // nothing after the sky
  });
});

describe('the gold frame (./gold-frame.ts)', () => {
  it('a world explored whole has its shelf framed; one geometry, glowing, a ring a frame', () => {
    knowWorlds(WORLDS);
    const s = defaultSave();
    expect(goldShelves(s)).toEqual([]);
    expect(goldFrames([])).toBeNull();
    fillExplore(s, WORLDS[1], 1); fillExplore(s, WORLDS[0], 1);
    expect(goldShelves(s)).toEqual([0, 1]);
    const one = goldFrames([0])!, two = goldFrames([0, 1])!;
    for (const name of ['position', 'normal', 'color', 'glow']) expect(two.getAttribute(name), name).toBeTruthy();
    expect(two.getAttribute('position').count).toBe(2 * one.getAttribute('position').count);
    expect(two.getAttribute('glow').getX(0)).toBeCloseTo(GOLD_GLOW);
    expect(two.getAttribute('uv')).toBeUndefined();
    // small: the nests' call takes them with no call of its own (./keepsakes.ts KEEPSAKE_BUDGET)
    expect(one.getAttribute('position').count / 3).toBeLessThan(400);
    expect(FRAME.r).toBeGreaterThan(0.57 + 0.075);           // outside the nest's rim
  });
});
