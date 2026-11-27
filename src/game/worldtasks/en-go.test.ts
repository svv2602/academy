/**
 * The rule of "Find a red flower!" (LEARN-23, ./en-go.ts): which place a command is about, when she has come, when
 * she has stopped at a wrong place, the clips that say it, and the guard of a world's list of places.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import {
  EN_GO_APART, EN_GO_CLEAR, EN_GO_DWELL, EN_GO_FAR, EN_GO_NEAR, EN_GO_REACH, EN_GO_STILL, EN_PLACE_KINDS,
  enGoClips, enPlacesProblems, inRing, kindsAt, nearestOf, pickTarget, placeAt, walker, type EnPlace,
} from './en-go';

const FROM = { x: 0, z: 0 };
const flower = (x: number, z: number): EnPlace => ({ x, z, kind: 'flower', word: 'flower' });
const house = (x: number, z: number): EnPlace => ({ x, z, kind: 'house', word: 'house' });
/** Two flowers and a house in the ring around FROM, well apart. */
const PLACES: readonly EnPlace[] = [flower(0, -18), flower(16, 12), house(-20, 0)];

describe('the place a command is about', () => {
  it('lies no nearer than EN_GO_NEAR and no farther than EN_GO_FAR from where the command is given - the edges count', () => {
    expect([EN_GO_NEAR, EN_GO_FAR]).toEqual([15, 25]);
    const at = [14.9, 15, 20, 25, 25.1].map((d) => flower(d, 0));
    expect(inRing(at, 'flower', FROM).map((p) => p.x)).toEqual([15, 20, 25]);
    expect(inRing(at, 'flower', { x: 40, z: 0 }).map((p) => p.x)).toEqual([15, 20, 25]);
    expect(inRing(at, 'house', FROM)).toEqual([]);
  });

  it('is one of the places of the kind named in the ring, by the rng: every one comes, one draw each time', () => {
    const rng = mulberry32(5), seen = new Set<EnPlace>();
    let draws = 0;
    const counting = () => { draws++; return rng(); };
    for (let i = 0; i < 60; i++) seen.add(pickTarget(PLACES, 'flower', FROM, counting)!);
    expect([...seen].sort((a, b) => a.x - b.x)).toEqual([PLACES[0], PLACES[1]]);
    expect(draws).toBe(60);
    expect(pickTarget(PLACES, 'house', FROM, counting)).toBe(PLACES[2]);
  });

  it('is none when no place of the kind lies in the ring - the command is not given, and nothing is drawn', () => {
    let draws = 0;
    const rng = () => { draws++; return 0.5; };
    expect(pickTarget(PLACES, 'mushroom', FROM, rng)).toBeNull();
    expect(pickTarget([flower(5, 0), flower(40, 0)], 'flower', FROM, rng)).toBeNull();
    expect(draws).toBe(0);
  });

  it('the kinds a command can name there: those with a place in the ring, in the order of the kinds', () => {
    expect(kindsAt(PLACES, FROM)).toEqual(['flower', 'house']);
    expect(kindsAt([...PLACES, { x: 0, z: 20, kind: 'butterfly', word: 'butterfly' }], FROM)).toEqual(['flower', 'butterfly', 'house']);
    expect(kindsAt(PLACES, { x: 0, z: 30 })).toEqual(['flower']);        // from there only the second flower is a walk away (24.1 m)
    expect(kindsAt(PLACES, { x: 0, z: -18 })).toEqual([]);               // from the first flower nothing is: 34 m and 26.9 m
    expect(kindsAt([], FROM)).toEqual([]);
  });

  it('the nearest of a kind - where the sparkles of the last rung lead', () => {
    expect(nearestOf(PLACES, 'flower', { x: 10, z: 10 })).toBe(PLACES[1]);
    expect(nearestOf(PLACES, 'flower', { x: 0, z: -10 })).toBe(PLACES[0]);
    expect(nearestOf(PLACES, 'owl', FROM)).toBeNull();
  });
});

describe('the clips that say a command', () => {
  it('the frame "Find…" and the word apart while the whole phrase is not recorded; the whole phrase once it is', () => {
    expect(enGoClips(PLACES[0], () => false)).toEqual(['wb_find', 'wb_w_flower']);
    expect(enGoClips(PLACES[2], (id) => id === 'en_go_flower')).toEqual(['wb_find', 'wb_w_house']);
    expect(enGoClips(PLACES[0], (id) => id === 'en_go_flower')).toEqual(['en_go_flower']);
  });

  it('every kind has a phrase of its own name', () => {
    for (const kind of EN_PLACE_KINDS) expect(enGoClips({ kind, word: 'tree' }, () => true)).toEqual([`en_go_${kind}`]);
  });
});

describe('where she is against the places', () => {
  it('at a place within EN_GO_REACH of it, the edge counts; the kind named is right, another is wrong', () => {
    expect(placeAt(PLACES, 'flower', { x: 0, z: -18 + EN_GO_REACH })).toEqual({ right: PLACES[0], wrong: null });
    expect(placeAt(PLACES, 'flower', { x: 0, z: -18 + EN_GO_REACH + 0.01 })).toEqual({ right: null, wrong: null });
    expect(placeAt(PLACES, 'house', { x: 1, z: -17 })).toEqual({ right: null, wrong: PLACES[0] });
    expect(placeAt(PLACES, 'house', { x: -19, z: 1 })).toEqual({ right: PLACES[2], wrong: null });
  });

  it('every place of the kind named is right, not only the one the command was about', () => {
    for (const p of [PLACES[0], PLACES[1]]) expect(placeAt(PLACES, 'flower', p).right).toBe(p);
  });
});

describe('her walk', () => {
  const frames = (w: ReturnType<typeof walker>, from: number, to: number, at: { x: number; z: number }, dt = 0.1) => {
    const out = [];
    for (let t = from; t <= to + 1e-9; t += dt) out.push(w.step(at, t).is);
    return out;
  };

  it('she has come the moment she is at a place of the kind named', () => {
    const w = walker(PLACES, 'flower');
    expect(w.step({ x: 0, z: -10 }, 0)).toEqual({ is: 'none' });
    expect(w.step({ x: 0, z: -15.5 }, 0.1)).toEqual({ is: 'come', place: PLACES[0] });
  });

  it('passing a wrong place is no mistake: she moves on before EN_GO_DWELL is over', () => {
    const w = walker(PLACES, 'flower'), seen: string[] = [];
    // past the house, a metre a step, through its reach and out of it
    for (let i = 0; i <= 12; i++) seen.push(w.step({ x: -20 + (i - 6) * 0.8, z: 1 }, i * 0.4).is);
    expect(new Set(seen)).toEqual(new Set(['none']));
  });

  it('standing at a wrong place for EN_GO_DWELL is told once; again only after she has left it and stood at one again', () => {
    const w = walker(PLACES, 'flower'), at = { x: -20, z: 1 };
    const first = frames(w, 0, 4, at);
    expect(first.filter((e) => e === 'wrong')).toHaveLength(1);
    expect(first.indexOf('wrong')).toBe(Math.round(EN_GO_DWELL / 0.1));      // not before she has stood that long
    // she steps aside within the place and stands again: still the same visit
    expect(frames(w, 4.1, 8, { x: -20.5, z: 1.5 }).filter((e) => e === 'wrong')).toHaveLength(0);
    // she leaves it and comes back
    expect(w.step({ x: -10, z: 1 }, 8.1)).toEqual({ is: 'none' });
    const again = frames(w, 8.2, 12, at);
    expect(again.filter((e) => e === 'wrong')).toHaveLength(1);
  });

  it('shuffling about at a wrong place is not standing: the time starts anew with every step on', () => {
    const w = walker(PLACES, 'flower'), seen: string[] = [];
    for (let i = 0; i < 40; i++) seen.push(w.step({ x: -20 + (i % 2) * (EN_GO_STILL + 0.2), z: 1 }, i * 0.5).is);
    expect(seen).not.toContain('wrong');
  });

  it('a wrong place then the right one: the mistake, then come - coming needs no standing', () => {
    const w = walker(PLACES, 'flower');
    expect(frames(w, 0, 2, { x: -20, z: 0 })).toContain('wrong');
    expect(w.step({ x: 16, z: 12 }, 2.1)).toEqual({ is: 'come', place: PLACES[1] });
  });

  it('the wrong place told is the place she stands at, by its own time: another wrong place starts its own', () => {
    const tree: EnPlace = { x: -20, z: 12, kind: 'tree', word: 'tree' };
    const w = walker([...PLACES, tree], 'flower');
    expect(frames(w, 0, 1, { x: -20, z: 0 })).not.toContain('wrong');
    const at = frames(w, 1.1, 3.5, { x: -20, z: 12 });
    expect(at.indexOf('wrong')).toBe(Math.round(EN_GO_DWELL / 0.1));
    expect(w.step({ x: -20, z: 12 }, 3.6)).toEqual({ is: 'none' });
  });
});

describe('the guard of a world\'s places', () => {
  it('the list of the tests is in order', () => expect(enPlacesProblems(PLACES, FROM, [{ x: 30, z: 30 }])).toEqual([]));

  it('no places at all', () => expect(enPlacesProblems([], FROM)).toEqual(['no places for the commands of Pip']));

  it('a place nearer than EN_GO_NEAR to where the command is given, or farther than EN_GO_FAR', () => {
    expect(enPlacesProblems([...PLACES, flower(0, 14.9)], FROM)).toEqual([expect.stringMatching(/^the flower at \(0, 14\.9\) stands 14\.9 m from where the command is given \(0, 0\), nearer than 15 m$/)]);
    expect(enPlacesProblems([...PLACES, flower(0, 25.2)], FROM)).toEqual([expect.stringMatching(/^the flower at \(0, 25\.2\) stands 25\.2 m .* farther than 25 m$/)]);
    expect(enPlacesProblems([flower(0, 15), flower(0, -25)], FROM)).toEqual([]);
  });

  it('a place at a resident or a thing of the world (R10)', () => {
    const busy = [{ x: 0, z: -18 + EN_GO_CLEAR - 0.1 }];
    expect(enPlacesProblems(PLACES, FROM, busy)).toEqual([expect.stringMatching(/^the flower at \(0, -18\) stands nearer than 5 m to a resident or a thing of the world at \(0, -13\.1\)$/)]);
    expect(enPlacesProblems(PLACES, FROM, [{ x: 0, z: -18 + EN_GO_CLEAR }])).toEqual([]);
  });

  it('two places of different kinds nearer than EN_GO_APART: she would be at both at once; of one kind they may stand together', () => {
    expect(EN_GO_APART).toBeGreaterThan(2 * EN_GO_REACH);
    expect(enPlacesProblems([...PLACES, house(0, -18 + EN_GO_APART - 0.1)], FROM)).toEqual([expect.stringMatching(/^the flower at \(0, -18\) and the house at \(0, -11\.1\) stand nearer than 7 m: at both at once$/), expect.stringMatching(/nearer than 15 m$/)]);
    expect(enPlacesProblems([...PLACES, flower(1, -19)], FROM)).toEqual([]);
  });

  it('a place listed twice, a kind no command names, places of one kind with different words', () => {
    expect(enPlacesProblems([...PLACES, flower(0, -18)], FROM)).toEqual(['the flower at (0, -18) is listed twice']);
    expect(enPlacesProblems([...PLACES, { x: 0, z: 20, kind: 'bridge', word: 'tree' } as unknown as EnPlace], FROM)).toEqual(['the bridge at (0, 20) is of no kind a command names']);
    expect(enPlacesProblems([...PLACES, { x: 12, z: 16, kind: 'flower', word: 'red' }], FROM)).toEqual(['the places of the kind flower carry different words: flower, red']);
  });
});
