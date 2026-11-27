/**
 * The rule of "Find a red flower!" (LEARN-23, ./en-go.ts): which place a command is about, when she has come, when
 * she has stopped at a wrong place, the clips that say it, the guard of a world's list of places - and the show that
 * plays a command in a world: its mistakes and their three rungs, its end, where the sparkles lead.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spoken } from '../../core/audio';
import { mulberry32 } from '../../core/util';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import {
  EN_GO_APART, EN_GO_CLEAR, EN_GO_DWELL, EN_GO_FAR, EN_GO_NEAR, EN_GO_REACH, EN_GO_REACH_MAX, EN_GO_STILL, EN_PLACE_KINDS,
  EN_GO_GLOW, enGo, enGoClips, enPlacesProblems, inRing, kindsAt, nearestOf, pickTarget, placeAt, reachOf, walker, type EnGoOptions, type EnPlace,
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
    expect(kindsAt([{ x: 0, z: 20, kind: 'mushroom', word: 'mushroom' }, ...PLACES], FROM)).toEqual(['flower', 'house', 'mushroom']);
    expect(kindsAt(PLACES, { x: 0, z: 30 })).toEqual(['flower']);        // from there only the second flower is a walk away (24.1 m)
    expect(kindsAt(PLACES, { x: 0, z: -18 })).toEqual([]);               // from the first flower nothing is: 34 m and 26.9 m
    expect(kindsAt([], FROM)).toEqual([]);
  });

  it('the nearest of a kind - where the sparkles of the last rung lead', () => {
    expect(nearestOf(PLACES, 'flower', { x: 10, z: 10 })).toBe(PLACES[1]);
    expect(nearestOf(PLACES, 'flower', { x: 0, z: -10 })).toBe(PLACES[0]);
    expect(nearestOf(PLACES, 'mushroom', FROM)).toBeNull();
  });
});

describe('the clips that say a command', () => {
  it('the frame "Find…" and the word apart while the whole phrase is not recorded; the whole phrase once it is', () => {
    expect(enGoClips(PLACES[0], () => false)).toEqual(['wb_find', 'wb_w_flower']);
    expect(enGoClips(PLACES[2], (id) => id === 'en_go_flower')).toEqual(['wb_find', 'wb_w_house']);
    expect(enGoClips(PLACES[0], (id) => id === 'en_go_flower')).toEqual(['en_go_flower']);
  });

  it('every kind has a phrase of its own name; step 2 has three kinds - the things its two worlds really have', () => {
    expect(EN_PLACE_KINDS).toEqual(['flower', 'house', 'mushroom']);
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

  it('a place with a reach of its own (a house she cannot stand in the middle of) is come to from that far', () => {
    const big: EnPlace = { ...house(-20, 0), r: 6 };
    expect([reachOf(PLACES[2]), reachOf(big)]).toEqual([EN_GO_REACH, 6]);
    expect(placeAt([big], 'house', { x: -14, z: 0 }).right).toBe(big);
    expect(placeAt([big], 'house', { x: -13.9, z: 0 }).right).toBeNull();
    expect(placeAt([PLACES[2]], 'house', { x: -14, z: 0 }).right).toBeNull();
    // and stood at as a wrong place from that far too
    expect(placeAt([big], 'flower', { x: -15, z: 0 }).wrong).toBe(big);
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
    const cap: EnPlace = { x: -20, z: 12, kind: 'mushroom', word: 'mushroom' };
    const w = walker([...PLACES, cap], 'flower');
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

  it('a place at a resident or a thing of the world (R10): they stand EN_GO_CLEAR beyond its reach', () => {
    const clear = EN_GO_REACH + EN_GO_CLEAR;
    expect(clear).toBe(5);
    expect(enPlacesProblems(PLACES, FROM, [{ x: 0, z: -18 + clear - 0.1 }])).toEqual([expect.stringMatching(/^the flower at \(0, -18\) stands nearer than 5 m to a resident or a thing of the world at \(0, -13\.1\)$/)]);
    expect(enPlacesProblems(PLACES, FROM, [{ x: 0, z: -18 + clear }])).toEqual([]);
    // a place with a reach of its own keeps them that much farther off
    const big: EnPlace = { ...house(-20, 0), r: 6 };
    expect(enPlacesProblems([big], FROM, [{ x: -20, z: 7.9 }])).toEqual([expect.stringMatching(/^the house at \(-20, 0\) stands nearer than 8 m to a resident/)]);
    expect(enPlacesProblems([big], FROM, [{ x: -20, z: 8 }])).toEqual([]);
  });

  it('two places of different kinds nearer than their two reaches and EN_GO_APART: she would be at both at once; of one kind they may stand together', () => {
    const apart = 2 * EN_GO_REACH + EN_GO_APART;
    expect(EN_GO_APART).toBeGreaterThan(0);
    expect(enPlacesProblems([...PLACES, house(apart - 0.1, -18)], FROM)).toEqual([expect.stringMatching(/^the flower at \(0, -18\) and the house at \(6\.9, -18\) stand nearer than 7 m: at both at once$/)]);
    expect(enPlacesProblems([...PLACES, house(apart, -18)], FROM)).toEqual([]);
    expect(enPlacesProblems([...PLACES, flower(1, -19)], FROM)).toEqual([]);
    // a place with a reach of its own keeps the others that much farther off
    expect(enPlacesProblems([...PLACES, { ...house(apart + 2, -18), r: 6 }], FROM)).toEqual([expect.stringMatching(/stand nearer than 10 m: at both at once$/)]);
    expect(enPlacesProblems([...PLACES, { ...house(10, -18), r: 6 }], FROM)).toEqual([]);
  });

  it('a reach of its own is within 0 and EN_GO_REACH_MAX', () => {
    expect(enPlacesProblems([{ ...house(-20, 0), r: EN_GO_REACH_MAX }], FROM)).toEqual([]);
    expect(enPlacesProblems([{ ...house(-20, 0), r: EN_GO_REACH_MAX + 0.5 }], FROM)).toEqual(['the house at (-20, 0) is come to from 8.5 m: not within 0-8 m']);
    expect(enPlacesProblems([{ ...house(-20, 0), r: 0 }], FROM)).toEqual(['the house at (-20, 0) is come to from 0 m: not within 0-8 m']);
  });

  it('a place listed twice, a kind no command names, places of one kind with different words', () => {
    expect(enPlacesProblems([...PLACES, flower(0, -18)], FROM)).toEqual(['the flower at (0, -18) is listed twice']);
    expect(enPlacesProblems([...PLACES, { x: 0, z: 20, kind: 'bridge', word: 'tree' } as unknown as EnPlace], FROM)).toEqual(['the bridge at (0, 20) is of no kind a command names']);
    expect(enPlacesProblems([...PLACES, { x: 12, z: 16, kind: 'flower', word: 'red' }], FROM)).toEqual(['the places of the kind flower carry different words: flower, red']);
  });
});

describe('a command played in a world (the show)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  /** The show of a command for a flower given at FROM, and everything said in it, in order. */
  function play(o: Partial<EnGoOptions> = {}) {
    const said: string[] = [];
    const quick = () => Promise.resolve() as Spoken;
    const hooks = {
      say: (clips: readonly string[]) => { said.push(`en ${clips.join('+')}`); },
      wrong: () => { said.push('try again'); return quick(); },
      hint: (k: SpokenKey) => { said.push(`cat ${k}`); return quick(); },
    };
    const show = enGo(createWorldScope(new THREE.Scene()), hooks, { places: PLACES, kind: 'flower', from: FROM, rng: mulberry32(3), has: () => false, ...o });
    let time = 0;
    /** She stands at `at` for `s` seconds of the world, a frame every 0.1 s; then the course of what happened plays out. */
    const stand = async (at: { x: number; z: number }, s: number, canMove = true) => {
      for (let t = 0; t <= s + 1e-9; t += 0.1) show!.update(at, time + t, canMove);
      time += s + 0.1;
      await vi.runAllTimersAsync();
    };
    return { show: show as NonNullable<typeof show>, said, stand, away: () => stand({ x: 0, z: 0 }, 0.2) };
  }
  const AT_HOUSE = { x: -20, z: 1 }, AT_FLOWER = { x: 1, z: -17 };

  it('is not given when no place of the kind lies in the ring: no show, nothing drawn from the rng', () => {
    let draws = 0;
    const rng = () => { draws++; return 0.5; };
    expect(enGo(createWorldScope(new THREE.Scene()), { say: () => {}, wrong: () => Promise.resolve() as Spoken, hint: () => Promise.resolve() as Spoken },
      { places: PLACES, kind: 'mushroom', from: FROM, rng, has: () => false })).toBeNull();
    expect(draws).toBe(0);
  });

  it('is about a place of the kind in the ring; its clips are the frame and the word, or Pip\'s phrase once recorded', () => {
    const { show } = play();
    expect(inRing(PLACES, 'flower', FROM)).toContain(show.target);
    expect(show.clips).toEqual(['wb_find', 'wb_w_flower']);
    expect(play({ has: (id) => id === 'en_go_flower' }).show.clips).toEqual(['en_go_flower']);
    expect(show.state()).toEqual({ kind: 'en_go', phase: 'input', wrongs: 0, moves: 0, rung: 0, progress: [] });
    // never a place of the kind outside the ring, whatever the seed - though coming to that one counts as well
    const near = flower(4, 3), places = [near, ...PLACES];
    for (let seed = 1; seed <= 30; seed++) expect(play({ places, rng: mulberry32(seed) }).show.target).not.toBe(near);
    expect(play({ places: [near, house(-20, 0)] }).show).toBeNull();
  });

  it('she comes to a place of the kind - any of them: solved at once, with no mistake; nothing is said by the show', async () => {
    for (const p of [PLACES[0], PLACES[1]]) {
      const { show, said, stand } = play();
      await stand({ x: 0, z: 0 }, 0.5);
      expect(show.state().phase).toBe('input');
      await stand(p, 0);
      expect(await show.done).toEqual({ solved: true, wrong: 0 });
      expect(show.state().phase).toBe('solved');
      expect(said).toEqual([]);
    }
  });

  it('a wrong place stood at is a mistake; the first rung: "try again", then Pip says the command again - no line of the cat, no sparkles', async () => {
    const { show, said, stand } = play();
    await stand(AT_HOUSE, 2);
    expect(show.state()).toMatchObject({ phase: 'input', wrongs: 1, rung: 1 });
    expect(said).toEqual(['try again', 'en wb_find+wb_w_flower']);
    expect(show.goal(AT_HOUSE)).toBeNull();
    // standing on at it says nothing more
    await stand(AT_HOUSE, 5);
    expect(said).toHaveLength(2);
  });

  it('the second rung: the cat\'s frame when Pip\'s part gives its line, then the word apart; without the line - the word alone; still no sparkles', async () => {
    const withLine = play({ lines: { frame: 'npc_again' as SpokenKey } });
    await withLine.stand(AT_HOUSE, 2); await withLine.away(); await withLine.stand(AT_HOUSE, 2);
    expect(withLine.said.slice(2)).toEqual(['try again', 'cat npc_again', 'en wb_w_flower']);
    expect(withLine.show.state()).toMatchObject({ wrongs: 2, rung: 2 });
    expect(withLine.show.goal(AT_HOUSE)).toBeNull();
    const bare = play();
    await bare.stand(AT_HOUSE, 2); await bare.away(); await bare.stand(AT_HOUSE, 2);
    expect(bare.said.slice(2)).toEqual(['try again', 'en wb_w_flower']);
  });

  it('the third rung and every one after it: the cat\'s "look at what glows", and the sparkles lead to the nearest place of the kind from where she is', async () => {
    const { show, said, stand, away } = play();
    for (let i = 0; i < 2; i++) { await stand(AT_HOUSE, 2); await away(); }
    expect(show.goal(AT_HOUSE)).toBeNull();
    await stand(AT_HOUSE, 2);
    expect(said.slice(-2)).toEqual(['try again', `cat ${EN_GO_GLOW}`]);
    expect(EN_GO_GLOW).toBe('h3_show');
    expect(show.state()).toMatchObject({ wrongs: 3, rung: 3 });
    expect(show.goal({ x: 10, z: 10 })).toBe(PLACES[1]);
    expect(show.goal({ x: 0, z: -10 })).toBe(PLACES[0]);
    await away(); await stand(AT_HOUSE, 2);
    expect(said.slice(-2)).toEqual(['try again', `cat ${EN_GO_GLOW}`]);
    expect(show.state()).toMatchObject({ wrongs: 4 });
    expect(show.goal(AT_HOUSE)).toBe(PLACES[0]);
    // a line of her own for the last rung, or none
    const own = play({ lines: { glow: 'go_next' as SpokenKey } });
    for (let i = 0; i < 3; i++) { await own.stand(AT_HOUSE, 2); await own.away(); }
    expect(own.said.slice(-2)).toEqual(['try again', 'cat go_next']);
    const none = play({ lines: { glow: null } });
    for (let i = 0; i < 3; i++) { await none.stand(AT_HOUSE, 2); await none.away(); }
    expect(none.said.slice(-1)).toEqual(['try again']);
    expect(none.show.goal(AT_HOUSE)).toBe(PLACES[0]);
  });

  it('wrong places take nothing away: she comes after them and the task is solved, its mistakes counted (R26)', async () => {
    const { show, stand, away } = play();
    await stand(AT_HOUSE, 2); await away(); await stand(AT_HOUSE, 2);
    await stand(AT_FLOWER, 0);
    expect(await show.done).toEqual({ solved: true, wrong: 2 });
    // nothing more after the end: no mistake, no sparkles
    await stand(AT_HOUSE, 3);
    expect(show.state()).toMatchObject({ phase: 'solved', wrongs: 2 });
    expect(show.goal(AT_HOUSE)).toBeNull();
    // also when the sparkles were leading her: they go out as she comes
    const led = play();
    for (let i = 0; i < 3; i++) { await led.stand(AT_HOUSE, 2); await led.away(); }
    expect(led.show.goal(AT_HOUSE)).toBe(PLACES[0]);
    await led.stand(AT_FLOWER, 0);
    expect(await led.show.done).toEqual({ solved: true, wrong: 3 });
    expect(led.show.goal(AT_HOUSE)).toBeNull();
    // and when the command is taken back
    const back = play();
    for (let i = 0; i < 3; i++) { await back.stand(AT_HOUSE, 2); await back.away(); }
    back.show.close();
    expect(back.show.goal(AT_HOUSE)).toBeNull();
  });

  it('passing a wrong place is nothing; standing at it in a conversation is nothing, and the standing starts anew after it', async () => {
    const { show, said, stand } = play();
    for (let i = 0; i <= 12; i++) show.update({ x: -20 + (i - 6) * 0.8, z: 1 }, i * 0.4, true);
    await vi.runAllTimersAsync();
    expect(show.state().wrongs).toBe(0);
    await stand(AT_HOUSE, EN_GO_DWELL - 0.4);             // she has stopped there, not long enough yet
    await stand(AT_HOUSE, 6, false);                      // and talks to somebody there
    expect(show.state().wrongs).toBe(0);
    await stand(AT_HOUSE, EN_GO_DWELL - 0.4);             // then walks by herself again: the standing started anew
    expect(show.state().wrongs).toBe(0);
    await stand(AT_HOUSE, 2);
    expect(show.state().wrongs).toBe(1);
    expect(said[0]).toBe('try again');
    // told once for this visit, a conversation in between or not
    await stand(AT_HOUSE, 3, false);
    await stand(AT_HOUSE, 4);
    expect(show.state().wrongs).toBe(1);
  });

  it('taken back: the task ends unsolved, nothing is said, nothing counts any more', async () => {
    const { show, said, stand } = play();
    await stand(AT_HOUSE, 2);
    show.close();
    expect(await show.done).toEqual({ solved: false, wrong: 1 });
    expect(show.state().phase).toBe('closed');
    const before = said.length;
    await stand(AT_HOUSE, 3); await stand(AT_FLOWER, 1);
    expect(said).toHaveLength(before);
    expect(show.state()).toMatchObject({ phase: 'closed', wrongs: 1 });
  });

  it('the walkthrough\'s door: a wrong move through the same course, then solved; no wrong move in a world of one kind', async () => {
    const { show, said } = play();
    expect(show.wrong()).toBe(true);
    await vi.runAllTimersAsync();
    expect(show.state()).toMatchObject({ wrongs: 1, rung: 1 });
    expect(said).toEqual(['try again', 'en wb_find+wb_w_flower']);
    show.solve();
    expect(await show.done).toEqual({ solved: true, wrong: 1 });
    expect(show.wrong()).toBe(false);                      // it is over
    const only = play({ places: [PLACES[0], PLACES[1]] });
    expect(only.show.wrong()).toBe(false);
    expect(only.show.state().wrongs).toBe(0);
  });
});
