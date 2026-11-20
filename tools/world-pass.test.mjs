// Runs in `npm test`: the walkthrough every world shares (tools/world-pass.mjs, ARCH-16). Its plan and its checks are
// tried on prepared descriptions, and the pass itself is played from the start screen to "start again" on a stand-in
// page: a small game written here (a meadow with one item of every kind of the world template) that answers the very
// functions the pass sends to the page. The real game is played by `npm run e2e` (the step "worlds", tools/worlds.mjs).
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  HOWS, ITEM_KINDS, MAY_DROP, ONE_OF_EACH, OPENS, PLAYS, STARTS, STEP_STARS, TRIES, WORLD_TASK_STEPS, bookProblems, closeProblems, descriptionProblems, heldBack, itemName, markOf,
  GREY_BUILD, MIN_TAP_PX, tapSizeProblems, marksProblems, nextItem, nextStep, openProblems, planFor, planLine, playWorld, readNeed, reloadProblems, reportProblems, restartProblems, solveProblems, startProblems,
  unmetWorldSteps, voiceProblems, worldStepOf, wrongProblems,
} from './world-pass.mjs';
import { CLOCK_REASONS } from './clock-waits.mjs';
import { gameWaits } from './game-wait.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const one = (list) => { expect(list, list.join('; ')).toHaveLength(1); return list[0]; };
const item = (kind, id, o = {}) => ({ kind, id, at: { x: 1, z: 2 }, how: 'act', after: [], done: false, active: false, ...o });
/** The description of a test world: one item of every kind, the part in the secret, the finale after everything. */
const items = (o = {}) => [
  item('chain', 'owl'), item('pet', 'pet', { after: ['owl'] }), item('flyover', 'toured', { at: null, how: 'auto' }),
  item('secret', 'well'), item('part', 'key', { how: 'walk', after: ['well'] }), item('scene', 'tale'),
  item('finale', 'final', { after: ['owl', 'pet', 'toured', 'well', 'key', 'tale'] }),
].map((i) => ({ ...i, ...o[i.id] }));

describe('the description of a world as the pass reads it (ARCH-16)', () => {
  const seen = (list = items(), o = {}) => ({ items: list, missing: [], problems: [], ...o });

  it('the kinds and the ways are the ones of src/game/world.ts, and a test world needs one of each kind', () => {
    const src = readFileSync(join(root, 'src/game/world.ts'), 'utf8');
    const union = (re) => re.exec(src)[1].split('|').map((k) => k.trim().replace(/'/g, ''));
    expect([...ITEM_KINDS].sort()).toEqual(union(/export type WorldItemKind = ([^;]+);/).sort());
    expect([...HOWS].sort()).toEqual(union(/\n {2}how: ([^;]+);/).sort());
    expect(ONE_OF_EACH).toEqual({ chain: 1, secret: 1, part: 1, scene: 1, flyover: 1, pet: 1, finale: 1 });
  });

  it('E2E_WORLD_NEED: the numbers of the template by default, one of every kind for a test world', () => {
    expect(readNeed('')).toEqual({ need: undefined, label: 'the numbers of the world template' });
    expect(readNeed('template')).toEqual(readNeed(''));
    expect(readNeed('one')).toEqual({ need: ONE_OF_EACH, label: 'one item of every kind' });
    expect(readNeed('grey')).toEqual({ need: GREY_BUILD, label: 'what a grey build has (WORLD-12)' });
    expect(Object.keys(GREY_BUILD).sort()).toEqual([...ITEM_KINDS].sort());
    expect(readNeed('two').error).toBe('bad E2E_WORLD_NEED="two": expected "one" (one item of every kind), "grey" (a grey build) or "template" (the numbers of the world template)');
  });

  it('a whole description of the one shape has no problem, with as many items of a kind as the world has', () => {
    expect(descriptionProblems(seen())).toEqual([]);
    expect(descriptionProblems(seen(items({ owl: { done: true }, toured: { done: true, active: true } })))).toEqual([]);
    // how many items of a kind are needed is the game's answer (`missing`), not counted here: a real world has five chains
    expect(descriptionProblems(seen([...items(), item('chain', 'fox'), item('secret', 'cave')]))).toEqual([]);
    expect(descriptionProblems(seen(items().filter((i) => i.kind !== 'secret')))).toEqual([]);
  });

  it('no description at all: a world that hands in none, or a game that does not show it', () => {
    expect(one(descriptionProblems({ items: null, missing: null, problems: null }))).toBe('window.__game.items is null: the world hands in no description, expected the list of its items');
    expect(one(descriptionProblems({ items: undefined }))).toContain('window.__game.items is undefined');
  });

  it('an item that is not of the shape: each field is named', () => {
    const broken = { kind: 'riddle', id: '', at: { x: 1 }, how: 'look', after: 'owl', done: () => true };
    const lines = descriptionProblems(seen([...items(), broken]));
    expect(one(lines)).toBe('the item 7 ("") is not of the shape of an item: kind "riddle", id "", at {"x":1}, how "look", after "owl", done undefined, active undefined');
    expect(one(descriptionProblems(seen([...items(), null])))).toBe('the item 7 is null, not an item');
    // a place may be absent (the item starts by itself), never half there
    expect(descriptionProblems(seen(items({ tale: { at: null } })))).toEqual([]);
    expect(one(descriptionProblems(seen(items({ tale: { at: { x: 1, z: NaN } } }))))).toContain('at {"x":1,"z":null}');
  });

  it('what the game itself finds lacking of the template or disagreeing with the world is passed on, word for word', () => {
    const lacks = 'template point 6 "Необязательные секреты" (docs/13-worlds.md): 0 item(s) of kind "secret" - the secrets, at least 1 needed';
    expect(one(descriptionProblems(seen(items(), { missing: [lacks] })))).toBe(`the description lacks a point of the world template: ${lacks}`);
    expect(one(descriptionProblems(seen(items(), { problems: ['"well" of the world\'s secrets has no item of kind "secret"'] })))).toBe('the description disagrees with what the world declares: "well" of the world\'s secrets has no item of kind "secret"');
    expect(one(descriptionProblems(seen(items(), { missing: null })))).toContain('window.__game.missing() answered null');
    expect(one(descriptionProblems(seen(items(), { problems: undefined })))).toContain('window.__game.itemProblems is undefined');
  });

  it('the marks: the id of an item is the name of its mark in the world\'s part of the save', () => {
    const world = { quests: { owl: 1 }, final: true, flags: { pet: true, toured: true, well: true, key: true, tale: true } };
    expect(markOf(item('chain', 'owl'), world)).toEqual({ where: 'quests.owl', value: 1, set: true });
    expect(markOf(item('chain', 'owl'), { quests: { owl: 0 } })).toEqual({ where: 'quests.owl', value: 0, set: false });
    expect(markOf(item('finale', 'final'), world)).toEqual({ where: 'final', value: true, set: true });
    expect(markOf(item('secret', 'well'), world)).toEqual({ where: 'flags.well', value: true, set: true });
    expect(markOf(item('secret', 'well'), null)).toEqual({ where: 'flags.well', value: undefined, set: false });
    const all = items(Object.fromEntries(items().map((i) => [i.id, { done: true }])));
    expect(marksProblems(all, world)).toEqual([]);
    expect(marksProblems(items(), { quests: {}, final: false, flags: {} })).toEqual([]);
    expect(marksProblems(items(), null), 'a new game has no part of the save yet').toEqual([]);
    // a step of a chain that is not finished yet is not a mark of "done"
    expect(marksProblems(items(), { quests: { owl: 1 }, final: false, flags: {} })).toEqual([]);
  });

  it('the marks: an item done without its mark, under another name, or not done with it', () => {
    const all = items(Object.fromEntries(items().map((i) => [i.id, { done: true }])));
    const world = () => ({ quests: { owl: 1 }, final: true, flags: { pet: true, toured: true, well: true, key: true, tale: true } });
    const w1 = world(); delete w1.flags.well; w1.flags.secret = true;
    expect(one(marksProblems(all, w1))).toBe('the item "well" (secret) is done, but its mark "flags.well" is undefined in the stored save');
    const w2 = world(); w2.final = false; w2.flags.final = true;
    expect(one(marksProblems(all, w2))).toBe('the item "final" (finale) is done, but its mark "final" is false in the stored save');
    const w3 = world(); w3.quests = {};
    expect(one(marksProblems(all, w3))).toBe('the item "owl" (chain) is done, but its mark "quests.owl" is undefined in the stored save');
    expect(marksProblems(all, null)).toHaveLength(7);
    expect(one(marksProblems(items(), { quests: {}, final: false, flags: { key: true } }))).toBe('the item "key" (part) is not done, but its mark "flags.key" is set in the stored save');
    expect(one(marksProblems(items(), { quests: {}, final: true, flags: {} }))).toBe('the item "final" (finale) is not done, but its mark "final" is set in the stored save');
  });
});

describe('the plan of the pass: what is done next, and how (ARCH-16)', () => {
  it('the next item: the order of the list, but never before what it comes after', () => {
    const order = [];
    let list = items({ toured: { done: true } });
    for (let next = nextItem(list); next; next = nextItem(list)) {
      expect(next.stuck).toBeUndefined();
      order.push(next.id);
      list = list.map((i) => (i.id === next.id ? { ...i, done: true } : i));
    }
    expect(order).toEqual(['owl', 'pet', 'well', 'key', 'tale', 'final']);
    expect(nextItem(list)).toBeNull();
    // the part stands before its secret in the list: the secret is still done first
    const swapped = [item('part', 'key', { after: ['well'] }), item('secret', 'well')];
    expect(nextItem(swapped).id).toBe('well');
    expect(nextItem(swapped.map((i) => (i.id === 'well' ? { ...i, done: true } : i))).id).toBe('key');
  });

  it('the next item: nothing can be done - each undone item waits for one that is not done or not there', () => {
    expect(nextItem([item('part', 'key', { after: ['attic'] })])).toEqual({ stuck: ['key'] });
    expect(nextItem([item('part', 'key', { after: ['lock'] }), item('part', 'lock', { after: ['key'] })])).toEqual({ stuck: ['key', 'lock'] });
    expect(nextStep([item('part', 'key', { after: ['attic'] })])).toEqual({ stuck: ['key'] });
  });

  it('how an item is done: the steps follow its "how", and its place', () => {
    expect(planFor(item('secret', 'well'))).toEqual({ steps: ['stand', 'button', 'press', 'over'] });
    expect(planFor(item('part', 'key', { how: 'walk' }))).toEqual({ steps: ['stand', 'over'] });
    // an item that plays by itself is never walked to and never pressed: the pass waits for it to be on
    expect(planFor(item('flyover', 'toured', { how: 'auto', at: null }))).toEqual({ steps: ['started', 'over'] });
    expect(planFor(item('scene', 'return', { how: 'auto' })), 'a place does not make it an item to walk to').toEqual({ steps: ['started', 'over'] });
    // a tap on the screen: once the item is on by itself, or after standing at its place
    expect(planFor(item('scene', 'opening', { how: 'tap', at: null }))).toEqual({ steps: ['started', 'tap', 'over'] });
    expect(planFor(item('secret', 'bird', { how: 'tap' }))).toEqual({ steps: ['stand', 'tap', 'over'] });
  });

  it('how an item is done: one that is on already is only driven to its end; a tap moves on the one done by a tap', () => {
    for (const how of ['act', 'walk', 'auto']) expect(planFor(item('scene', 'tale', { how, active: true })), how).toEqual({ steps: ['over'] });
    expect(planFor(item('scene', 'opening', { how: 'tap', at: null, active: true }))).toEqual({ steps: ['tap', 'over'] });
  });

  it('how an item is done: no place for the action button or for walking, or a way the pass does not know - an error, not a guess', () => {
    expect(planFor(item('secret', 'well', { at: null }))).toEqual({ error: 'it is done by "act" and has no place (at) to do it at' });
    expect(planFor(item('part', 'key', { how: 'walk', at: null }))).toEqual({ error: 'it is done by "walk" and has no place (at) to do it at' });
    expect(planFor(item('secret', 'well', { how: 'whistle' }))).toEqual({ error: 'this pass cannot do an item by "whistle"' });
    expect(nextStep([item('secret', 'well', { at: null })])).toEqual({ item: item('secret', 'well', { at: null }), error: 'it is done by "act" and has no place (at) to do it at' });
  });

  it('the next step: what is on by itself comes first, whatever the order of the list', () => {
    // right after "play" the tour flies: it is the third of the list, done already, and the chain is not
    const flying = items({ toured: { done: true, active: true } });
    expect(nextStep(flying)).toEqual({ item: flying[2], steps: ['over'] });
    expect(nextStep(items({ toured: { done: true } }))).toEqual({ item: items()[0], steps: ['stand', 'button', 'press', 'over'] });
    // an item the pass did before is on again (a cutscene watched twice): driven to its end, not an error
    const again = items({ toured: { done: true }, tale: { done: true, active: true } });
    expect(nextStep(again, ['toured', 'tale'])).toEqual({ item: again[5], steps: ['over'] });
  });

  it('the next step: the end, and an item that does not stay done', () => {
    const all = items(Object.fromEntries(items().map((i) => [i.id, { done: true }])));
    expect(nextStep(all, all.map((i) => i.id))).toEqual({ end: true });
    // every item done, but one is still on: not the end yet
    expect(nextStep(items({ ...Object.fromEntries(items().map((i) => [i.id, { done: true }])), final: { done: true, active: true } })).steps).toEqual(['over']);
    const lost = items({ toured: { done: true }, owl: { done: true }, pet: { done: false } });
    expect(nextStep(lost, ['toured', 'owl', 'pet'])).toEqual({ item: lost[1], again: true });
  });

  it('the order of "after": the items that cannot be done yet, to be tried at their places', () => {
    expect(heldBack(items({ toured: { done: true } })).map((i) => i.id)).toEqual(['pet', 'key', 'final']);
    expect(heldBack(items({ toured: { done: true }, owl: { done: true }, well: { done: true } })).map((i) => i.id)).toEqual(['final']);
    // an item without a place cannot be stood at; one that waits for an item that is not there is held back for good
    expect(heldBack([item('scene', 'return', { how: 'auto', at: null, after: ['final'] }), item('part', 'key', { after: ['attic'] })]).map((i) => i.id)).toEqual(['key']);
  });

  it('the words of the log: an item, and the line of the plan', () => {
    expect(itemName(item('secret', 'well', { at: { x: 5, z: -0.6 } }))).toBe('the item "well" (secret, done by "act" at 5,-0.6)');
    expect(itemName(item('flyover', 'toured', { how: 'auto', at: null }))).toBe('the item "toured" (flyover, done by "auto")');
    // a place the game worked out with a rounding error reads as the place
    expect(itemName(item('secret', 'well', { at: { x: 5, z: 0.8 - 1.4 } }))).toBe('the item "well" (secret, done by "act" at 5,-0.6)');
    expect(planLine('meadow', items().slice(0, 3), 'one item of every kind'))
      .toBe('plan of the world "meadow": 3 items of its description - chain owl (act), pet pet (act, after owl), flyover toured (auto); the world template asks for one item of every kind');
  });
});

describe('the checks of the save, the book, the voice and the report (ARCH-06, ARCH-16)', () => {
  const KEPT = { other: { quests: { elder: 2 }, final: false, flags: { chest: true } } };
  const PART = { quests: { owl: 2 }, final: true, flags: { pet: true } };

  it('after "play": the world played has its part of the save, the other world and the stars are as given', () => {
    expect(startProblems({ stars: 7, worlds: { ...KEPT, meadow: {} } }, 'meadow', KEPT, 7)).toEqual([]);
    expect(one(startProblems({ stars: 7, worlds: { ...KEPT } }, 'meadow', KEPT, 7))).toBe('the game does not play it: the save has no worlds.meadow after "play" (worlds: other)');
    expect(one(startProblems({ stars: 7, worlds: { other: { ...KEPT.other, final: true }, meadow: {} } }, 'meadow', KEPT, 7))).toContain('worlds.other changed at the start: ');
    expect(one(startProblems({ stars: 6, worlds: { ...KEPT, meadow: {} } }, 'meadow', KEPT, 7))).toBe('the save starts with 6 stars, not the 7 it was given');
    expect(startProblems({}, 'meadow', KEPT, 7)).toHaveLength(3);
  });

  it('after a reload: the progress is under worlds.<id>, as the game held it; the other world is untouched', () => {
    const stored = () => ({ stars: 12, worlds: { ...structuredClone(KEPT), meadow: structuredClone(PART) } });
    expect(reloadProblems(stored(), 'meadow', PART, KEPT, 12)).toEqual([]);
    const s1 = stored(); delete s1.worlds.meadow;
    expect(one(reloadProblems(s1, 'meadow', PART, KEPT, 12))).toBe('the stored save has no worlds.meadow');
    const s2 = stored(); s2.worlds.meadow.quests.owl = 1;
    expect(one(reloadProblems(s2, 'meadow', PART, KEPT, 12))).toBe('worlds.meadow is {"quests":{"owl":1},"final":true,"flags":{"pet":true}} in the stored save, the game held {"quests":{"owl":2},"final":true,"flags":{"pet":true}}');
    const s3 = stored(); s3.worlds.other.quests.elder = 3;
    expect(one(reloadProblems(s3, 'meadow', PART, KEPT, 12))).toContain('worlds.other changed: {"quests":{"elder":3}');
    const s4 = stored(); s4.quests = { owl: 2 };
    expect(one(reloadProblems(s4, 'meadow', PART, KEPT, 12))).toBe('"quests" is on top of the save, not under worlds.<id>');
    expect(one(reloadProblems(stored(), 'meadow', PART, KEPT, 13))).toBe('12 stars stored, 13 in the game');
  });

  it('after "start again": nothing of the old progress in any world', () => {
    expect(restartProblems({}, false)).toEqual([]);
    expect(restartProblems({ v: 4, stars: 0, worlds: { meadow: { quests: {}, final: false, starsTaken: [], flags: {} } } }, false)).toEqual([]);
    expect(restartProblems({ stars: 12, played: true, worlds: { meadow: PART, other: { starsTaken: [1] } } }, true))
      .toEqual(['12 stars', '"played"', 'the final (meadow)', 'quests {"owl":2} (meadow)', 'flags {"pet":true} (meadow)', 'stars taken [1] (other)', 'the "start again" button of a returning player']);
  });

  it('the book: a part for every chain, lit for every chain done, the stars of the save', () => {
    expect(bookProblems({ parts: 2, got: 1, stars: 12, stats: '⭐ 12' }, 2, 1)).toEqual([]);
    expect(bookProblems({ parts: 1, got: 2, stars: 12, stats: '⭐ 10' }, 2, 1)).toEqual(['1 parts for 2 characters', '2 parts lit, 1 chains done', 'the stars 12 are not in "⭐ 10"']);
  });

  it('the voice: no line is left to the synthesizer, the planner turns away only the lines it may', () => {
    expect(MAY_DROP).toEqual(['go_next']);
    expect(voiceProblems({ synth: [], dropped: ['go_next', 'go_next'] })).toEqual([]);
    expect(voiceProblems({ synth: ['meadow_hi', 'meadow_bye'], dropped: [] })).toEqual(['no recorded clip for: meadow_hi meadow_bye (python3 tools/gen_voice.py)']);
    expect(voiceProblems({ synth: [], dropped: ['go_next', 'praise_1', 'praise_1'] })).toEqual(['the planner turned away lines the scenario gives no reason for: praise_1']);
  });

  it('the report of a pass: it came to its end, in the size and with the network asked for, and did an item of every kind', () => {
    const report = (o = {}) => ({ world: 'meadow', size: 'desktop', online: false, items: items().map((i) => ({ kind: i.kind, id: i.id, how: i.how })), order: items().map((i) => i.id), ...o });
    const want = { world: 'meadow', size: 'desktop', offline: true, kinds: ITEM_KINDS };
    expect(reportProblems(report(), want)).toEqual([]);
    expect(reportProblems(null, want)).toEqual(['it left no report of the pass: it did not come to the end of the description']);
    expect(one(reportProblems(report({ online: true }), want))).toBe('it was played with the network, the desktop size is played without it');
    expect(one(reportProblems(report({ online: false }), { ...want, offline: false }))).toBe('it was played without the network, the desktop size is played with it');
    expect(one(reportProblems(report({ size: 'mobile' }), want))).toBe('the report is of the size "mobile", not "desktop"');
    expect(one(reportProblems(report({ world: 'other' }), want))).toBe('the report is of the world "other", not "meadow"');
    // a pass that played the chains alone, as the walkthrough did before it read the description
    expect(reportProblems(report({ order: ['owl'] }), want)).toEqual(ITEM_KINDS.filter((k) => k !== 'chain').map((k) => `no item of kind "${k}" was done by the pass`));
    expect(one(reportProblems(report({ items: report().items.filter((i) => i.kind !== 'secret') }), want))).toBe('no item of kind "secret" was done by the pass');
    expect(reportProblems({ world: 'meadow', size: 'desktop', online: false }, want)).toHaveLength(ITEM_KINDS.length);
  });
});

describe('a task played in the world on a step a chain declares (PLAY-01, R97)', () => {
  const chain = (o = {}) => item('chain', 'hare', { inWorld: [1], ...o });
  const st = (o = {}) => ({ kind: 'tally', phase: 'input', wrongs: 0, moves: 0, rung: 0, progress: [], ...o });
  const rec2 = (part, stars, skills) => JSON.stringify({ part, stars, skills });
  const was = rec2({ quests: { hare: 1 }, flags: {} }, 5, { compare: { tasks: 2 }, add: { tasks: 4 } });
  const rec = (o = {}) => ({ state: null, held: was, stored: was, ...o });

  it('is played in five steps, in this order: open, a wrong move, closed, opened anew, solved', () => {
    expect(WORLD_TASK_STEPS).toEqual(['open', 'wrong', 'close', 'again', 'solve']);
    expect(STEP_STARS).toBe(3);
  });

  it('the step it opened at must be one the chain names in `inWorld`; anywhere else it fails with the id of the chain', () => {
    expect(worldStepOf(chain(), { quests: { hare: 1 } }, 'tally')).toEqual({ step: 1, error: null });
    expect(worldStepOf(chain({ inWorld: [0, 2] }), { quests: { hare: 1 } }, 'tally').error).toBe('a task in the world ("tally") opened at step 2 of the chain "hare", which its description does not declare (inWorld: [0,2]) - world.worldTasks does not name it');
    expect(worldStepOf(chain({ inWorld: undefined }), { quests: {} }, 'tally').error).toContain('at step 1 of the chain "hare", which its description does not declare (inWorld: [])');
    expect(worldStepOf(item('secret', 'well'), null, 'tally').error).toBe('a task in the world ("tally") is open in the item "well" (secret), and only a step of a chain plays one');
    expect(worldStepOf(null, null, 'tally').error).toBe('a task in the world ("tally") is open between the items, and only a step of a chain plays one');
  });

  it('a) and d): open, waiting for input, no mistake, no hint, nothing kept; opened anew it is the same kind', () => {
    expect(openProblems(st())).toEqual([]);
    expect(openProblems(st(), 'tally')).toEqual([]);
    expect(openProblems(null)).toEqual(['no task in the world is open']);
    expect(openProblems(st({ phase: 'mistake', wrongs: 1, rung: 1, progress: [2] }), 'stones')).toEqual([
      'the task is "tally", not the "stones" opened before', 'its phase is "mistake", not "input"', '1 wrong move(s) at its start', 'the rung 1 of the hint at its start', 'it starts in a middle: [2]']);
  });

  it('b) one wrong move: counted once, waiting again on rung 1, "try again" and the hint by their clips', () => {
    const voice = (o = {}) => ({ started: ['try_again_1', 'h_count'], synth: [], line: 'h_count', muted: false, ...o });
    expect(wrongProblems(st({ wrongs: 1, rung: 1 }), voice())).toEqual([]);
    expect(wrongProblems(null, voice())).toEqual(['the task in the world is not open after a wrong move']);
    expect(wrongProblems(st({ wrongs: 2, rung: 0, phase: 'mistake' }), voice())).toEqual(['2 wrong moves counted for one', 'its phase is "mistake", not "input" again', 'the rung of the hint is 0, not 1']);
    expect(one(wrongProblems(st({ wrongs: 1, rung: 1 }), voice({ started: ['try_again_1', 'x'], synth: ['h_count'], line: 'x' })))).toBe('lines left to the synthesizer: h_count');
    expect(wrongProblems(st({ wrongs: 1, rung: 1 }), voice({ started: ['try_again_1'] }))).toEqual(['the clips of "try again" and of the hint were not both started (started: try_again_1)']);
    expect(one(wrongProblems(st({ wrongs: 1, rung: 1 }), voice({ line: 'h_other' })))).toBe('the bubble holds "h_other", whose clip was not started (started: try_again_1 h_count)');
    // without the voice the bubble keeps the question: only the clips are asked for
    expect(wrongProblems(st({ wrongs: 1, rung: 1 }), voice({ line: 't_compare_more', muted: true }))).toEqual([]);
  });

  it('c) closed: no task open, in memory and in the stored save just what was there at its opening', () => {
    const before = rec({ state: st() });
    expect(closeProblems(before, rec())).toEqual([]);
    const more = rec2({ quests: { hare: 2 }, flags: {} }, 8, { compare: { tasks: 3 }, add: { tasks: 4 } });
    expect(closeProblems(before, rec({ held: more, stored: more })).map((p) => p.split(' holds')[0])).toEqual(['the game', 'the stored save']);
    expect(one(closeProblems(before, rec({ state: st() })))).toContain('the task is still open after its close button');
  });

  it('e) solved: the step stored, 3 stars more, one task more in exactly one skill - in memory and in the stored save', () => {
    const before = rec();
    const now = rec2({ quests: { hare: 2 }, flags: {} }, 8, { compare: { tasks: 3 }, add: { tasks: 4 } });
    expect(solveProblems(before, rec({ held: now, stored: now }), 'hare', 1)).toEqual([]);
    expect(one(solveProblems(before, rec({ state: st({ phase: 'solved' }), held: now, stored: now }), 'hare', 1))).toContain('the task is still open after solve()');
    expect(solveProblems(before, rec({ held: now }), 'hare', 1)).toEqual(['the stored save holds the chain "hare" at 1, not 2', 'the stored save holds 5 stars, 5 + 3 expected', 'the stored save: the tasks of the skills changed in none, one task more in one skill expected']);
    const two = rec2({ quests: { hare: 2 } }, 8, { compare: { tasks: 3 }, add: { tasks: 5 } });
    expect(solveProblems(before, rec({ held: two, stored: two }), 'hare', 1)[0]).toBe('the game: the tasks of the skills changed in compare 2 -> 3, add 4 -> 5, one task more in one skill expected');
  });

  it('a step declared but never met as a task in the world is named at the end', () => {
    const list = [chain({ inWorld: [0, 2] }), item('chain', 'owl'), item('secret', 'well')];
    expect(unmetWorldSteps(list, ['hare 0'])).toEqual(['hare 2']);
    expect(unmetWorldSteps(list, ['hare 0', 'hare 2'])).toEqual([]);
    expect(unmetWorldSteps(items(), [])).toEqual([]);
  });

  it('the description: `inWorld` is a list of step numbers on a chain only', () => {
    const seen = (list) => descriptionProblems({ items: list, missing: [], problems: [] });
    expect(seen([chain({ inWorld: [0, 3] })])).toEqual([]);
    expect(seen([chain({ inWorld: [-1] }), item('secret', 'well', { inWorld: [0] }), chain({ id: 'x', inWorld: 'all' })]).map((p) => p.split(': ')[1])).toEqual(['inWorld [-1]', 'inWorld [0]', 'inWorld "all"']);
  });

  it('the report: a pass that played no task in the world fails where one is declared', () => {
    const report = { world: 'w', size: 'mobile', online: true, items: [], order: [], worldTasks: [] };
    const want = { world: 'w', size: 'mobile', offline: false, kinds: [] };
    expect(reportProblems(report, want)).toEqual([]);
    expect(reportProblems(report, { ...want, inWorld: true })).toEqual(['no task in the world was played by the pass: the world declares one']);
    expect(reportProblems({ ...report, worldTasks: ['hare 0'] }, { ...want, inWorld: true })).toEqual([]);
  });
});

// ---- the pass itself, on a stand-in page ----
const WORLD = 'meadow';
/** The part of another world the save starts with: the pass must leave it exactly as it is. */
const KEPT = { quests: { elder: 2 }, final: false, starsTaken: [1], flags: { chest: true }, pos: [1, 2] };
const STARS = 7;
/** The meadow: one item of every kind; the chain has two steps, so its character is talked to twice. */
const DEFS = () => [
  { kind: 'chain', id: 'owl', how: 'act', at: { x: 0, z: -2 }, steps: 2 },
  { kind: 'pet', id: 'pet', how: 'act', at: { x: -7, z: -9 }, after: ['owl'] },
  { kind: 'flyover', id: 'toured', how: 'auto', at: null, seconds: 4 },
  { kind: 'secret', id: 'well', how: 'act', at: { x: 5, z: 1 } },
  { kind: 'part', id: 'key', how: 'walk', at: { x: 9, z: -7 }, after: ['well'] },
  { kind: 'scene', id: 'tale', how: 'act', at: { x: -4, z: -1 }, seconds: 2 },
  { kind: 'finale', id: 'final', how: 'act', at: { x: -8, z: 4 }, after: ['owl', 'pet', 'toured', 'well', 'key', 'tale'], seconds: 1.5 },
];

/**
 * A stand-in for the page of the game and for the helpers of tools/shot.mjs. The game: a frame is 0.05 s of game time;
 * what a real world does over frames (a conversation, a task, a card, a scene) is scheduled in game time here too.
 * `o` breaks it on purpose: `defs` - the items; `fault` - { name: value } read at the places below.
 */
function standIn(o = {}) {
  const defs = (o.defs ?? ((d) => d))(DEFS());
  const fault = o.fault ?? {};
  const storage = new Map([['amw-save', JSON.stringify({ v: 3, stars: STARS, worlds: { other: KEPT } })]]);
  const log = { shots: [], links: [], questions: [], taps: [], presses: 0, achievements: [], missingAsked: [], frames: 0, cheats: 0, teleports: [], door: [] };
  const errors = [];
  const sim = { online: true, onLoad: null };

  // ---- the document: only what the pass asks about ----
  const els = {};
  const el = (id, hidden) => {
    const classes = new Set(hidden ? ['hidden'] : []);
    return (els[id] = { id, textContent: '', className: '', classList: { contains: (c) => classes.has(c), add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)) } });
  };
  let shards = [];
  const document = {
    getElementById: (id) => els[id] ?? null,
    querySelector: (sel) => els[sel.replace(/^#/, '')] ?? null,
    querySelectorAll: (sel) => (sel === '#shards .shard' ? shards : []),
  };
  const show = (id, on = true) => els[id].classList[on ? 'remove' : 'add']('hidden');
  const shown = (id) => !els[id].classList.contains('hidden');

  // ---- the game ----
  let save, ws, time, started, busy, hero, timers, raf, input, line, inTask, searchLeft, tapsLeft, forgot = false;
  /** The task in the world open now (a chain's step in `opens`), else null: { d, kind, phase, wrongs, rung, progress }. */
  let wt = null;
  const starts = (key) => { globalThis.__starts[key] = (globalThis.__starts[key] ?? 0) + 1; };
  const on = new Set();           // the ids of the items that are on
  let heldStars = null;       // the fault "stars not stored at once": what the stored save still says
  const persist = () => {
    const out = { ...save, ...(heldStars === null ? {} : { stars: heldStars }) };
    if (fault.noWorldPart) out.worlds = Object.fromEntries(Object.entries(save.worlds).filter(([id]) => id !== WORLD));
    storage.set('amw-save', JSON.stringify(out));
  };
  const after = (seconds, fn) => timers.push({ at: time + seconds, fn });
  const def = (id) => defs.find((d) => d.id === id);
  /** What the save says; `done` is what the description says of it (the same, unless broken on purpose). */
  const marked = (d) => (d.kind === 'chain' ? (ws.quests[d.id] ?? 0) >= d.steps : d.kind === 'finale' ? ws.final === true : ws.flags[d.id] === true);
  const done = (d) => fault.neverDone !== d.id && marked(d);
  const ready = (d) => fault.orderBroken === d.id || (d.after ?? []).every((a) => { const x = def(a); return !!x && done(x); });
  const mark = (d) => {
    if (fault.neverMarks === d.id) return;
    if (d.kind === 'finale') ws.final = true; else ws.flags[d.id] = true;
    if (fault.unstored !== d.id) persist();
  };
  const hud = () => { const c = defs.filter((d) => d.kind === 'chain'); els.crystals.textContent = fault.counter ?? `${c.filter(done).length}/${c.length}`; };
  const say = (key) => { line = key; show('bubble'); };
  const win = (n) => {
    if (fault.starsUnstored) { heldStars = save.stars; after(0.2, () => { heldStars = null; persist(); }); }
    save.stars += n; persist();
  };
  /** A conversation: a greeting, a task (on the panel, or in the world at a step of `opens`), and the card of the part once the chain is finished. */
  const talk = (d) => {
    busy = true; say('npc_hi');
    after(0.3, () => {
      if ((d.opens ?? []).includes(ws.quests[d.id] ?? 0)) { wt = { d, kind: d.world, phase: 'input', wrongs: fault.openWrong ? 1 : 0, rung: 0, progress: [] }; say('t_compare_more'); return; }
      els.taskStage.className = `t-stage t-${d.task ?? 'add'}`;
      if (fault.watch) els.taskStage.classList.add('watch');
      els.task.classList.remove('hidden', 'won');
      inTask = !fault.unplanned;
      if (fault.dropsStars) save.stars -= 1;
      say('t_add');
      if (fault.watch) after(1, () => els.taskStage.classList.remove('watch'));
    });
  };
  const solved = (d) => {
    show('task', false); inTask = false;
    const was = marked(d);
    if (!was && d.search && (ws.quests[d.id] ?? 0) === d.steps - 1 && searchLeft === 0) { searchLeft = d.search; busy = false; return; }   // the last step: a task of the world itself
    step(d, was);
  };
  const step = (d, was) => {
    if (!was && d.world && !fault.noSkill) save.skills.compare.tasks++;
    win(fault.noStars ? 0 : was ? 1 : 3);
    if (fault.touchesOther === 'chain') save.worlds.other.quests.elder = 3;
    if (!was) { ws.quests[d.id] = (ws.quests[d.id] ?? 0) + (fault.skipsStep === d.id ? 2 : 1); persist(); }
    hud();
    if (was || !marked(d)) { busy = false; return; }
    if (fault.achievement) { els.fanfare.classList.add('ach'); els.fanfareTitle.textContent = 'achievement'; show('fanfare'); return; }
    card();
  };
  const card = () => { els.fanfare.classList.remove('ach'); els.fanfareTitle.textContent = 'a part'; show('fanfare'); };
  const scene = (d, end) => {
    busy = true; on.add(d.id);
    if (fault.neverEnds === d.id) return;
    if (d.how === 'tap') { tapsLeft = d.pictures ?? 1; return; }
    after(d.seconds, () => finish(d, end));
  };
  const finish = (d, end) => { on.delete(d.id); end(); busy = false; };
  /** What the action button does at the place of an item. */
  const run = (d) => {
    if (d.kind === 'chain') talk(d);
    else if (d.kind === 'scene' || d.kind === 'finale') scene(d, () => mark(d));
    else { mark(d); if (fault.holds === d.id) busy = true; }      // the fault: the item is done and the controls never come back
  };
  const near = (d) => Math.hypot(hero.x - d.at.x, hero.z - d.at.z) < 2;
  /** The spot under the heroine: an item done by the action button, once it can be done (a character and a cutscene stay). */
  const spot = () => defs.find((d) => d.how === 'act' && d.at && near(d) && fault.noButton !== d.id && ready(d) && (d.kind === 'chain' || d.kind === 'scene' || !done(d)));
  const frame = () => {
    if (++log.frames > 60000) throw new Error('the stand-in game ran for too long: the pass does not come to an end');
    time += 0.05;
    for (const cb of raf.splice(0)) cb();
    for (const t of timers.filter((x) => x.at <= time)) { timers.splice(timers.indexOf(t), 1); t.fn(); }
    if (input.walk && started && !busy && !fault.frozen) hero = { x: hero.x, z: hero.z - 0.1 };
    if (started && !busy) {
      for (const d of defs) if (d.how === 'walk' && d.at && !done(d) && ready(d) && Math.hypot(hero.x - d.at.x, hero.z - d.at.z) < 0.9) mark(d);
      // an item that plays by itself and comes after others starts once they are done
      for (const d of defs) if ((d.how === 'auto' || (d.how === 'tap' && !d.at)) && d.kind !== 'flyover' && !done(d) && !on.has(d.id) && ready(d) && fault.neverStarts !== d.id) scene(d, () => mark(d));
      const s = spot();
      show('btnAct', !!s);
      if (input.act && s) run(s);
    } else show('btnAct', false);
    input.act = false;
    if (fault.forgets && ws.flags[fault.forgets.when] && ws.flags[fault.forgets.id] && !forgot) { forgot = true; delete ws.flags[fault.forgets.id]; persist(); }
  };
  const game = () => ({
    get items() {
      if (fault.noDescription) return null;
      return defs.map((d) => ({ kind: d.kind, id: d.id, at: d.at ?? null, how: d.how, after: [...(d.after ?? [])], done: done(d), active: on.has(d.id), ...(d.inWorld ? { inWorld: [...d.inWorld] } : {}) }));
    },
    get hero() { return { root: { position: hero } }; },
    /** The debug door of the task in the world (src/game/worldtasks/core.ts): its calls are logged in `log.door`. */
    worldTask: {
      get state() { return wt && { kind: wt.kind, phase: wt.phase, wrongs: wt.wrongs, moves: 0, rung: wt.rung, progress: [...wt.progress] }; },
      wrong() {
        if (!wt) return false;
        log.door.push('wrong');
        const t = wt;
        t.wrongs++; t.phase = 'mistake'; starts('try_again_1'); say('try_again_1');
        after(1, () => { if (fault.hintSynth) globalThis.__game.voice.synth.push('h_count'); else starts('h_count'); say('h_count'); t.rung = fault.noRung ? 0 : 1; t.phase = 'input'; });
        return true;
      },
      close() {
        if (!wt) return false;
        log.door.push('close');
        wt = null;
        if (fault.closeRecords) win(3);
        busy = false;
        return true;
      },
      solve() {
        if (!wt) return false;
        log.door.push('solve');
        const { d } = wt;
        wt = null;
        step(d, false);
        return true;
      },
    },
    missing(need) { log.missingAsked.push(need); return fault.missing ?? []; },
    get itemProblems() { return fault.itemProblems ?? []; },
    get busy() { return busy; },
    get time() { return time; },
    get inTask() { return inTask; },
    get line() { return line; },
    get save() { return save; },
    teleport(x, z) { hero = { x, z }; log.teleports.push(`${x},${z}`); },
    cheat() {
      if (shown('task') && !els.task.classList.contains('won')) {
        log.cheats++;
        if (fault.cheatIdle) return '';
        els.task.classList.add('won');
        const d = defs.find((x) => x.kind === 'chain' && near(x));
        after(1.1, () => solved(d));
        return 'panel';
      }
      if (searchLeft > 0) {
        const d = defs.find((x) => x.search);
        if (--searchLeft === 0) { searchLeft = -1; step(d, false); }
        return 'stars';
      }
      return '';
    },
    voice: { clips: 6, synth: fault.synth ?? [] },
    dropped: fault.dropped ?? ['go_next'],
  });
  /** A page load: the game reads the stored save and shows its start screen. */
  const boot = () => {
    const st = JSON.parse(storage.get('amw-save') ?? '{}');
    save = { stars: 0, played: false, fixed: { add: 0, sub: 0 }, vol: { voice: 1 }, worlds: {}, skills: { compare: { tasks: 0 }, add: { tasks: 0 } }, ...st };
    ws = save.worlds[WORLD] ??= { quests: {}, final: false, starsTaken: [], flags: {}, pos: null };
    time = 0; started = false; busy = false; hero = { x: 0, z: 6 }; timers = []; raf = []; input = { act: false, walk: false }; line = null; inTask = false; searchLeft = 0; tapsLeft = 0; wt = null;
    globalThis.__starts = {};
    on.clear();
    for (const id of ['bubble', 'task', 'fanfare', 'btnAct', 'book', 'restart']) el(id, true);
    for (const id of ['play', 'taskStage', 'fanfareTitle', 'fanfareOk', 'crystals', 'colStats', 'bubbleText', 'fps']) el(id, false);
    if (st.played) show('restart');
    els.fps.textContent = fault.fps ?? '60 fps · q2 · 54k tris · 58 calls';
    delete globalThis.__stars;
    globalThis.__game = game();
    globalThis.__game.voice.synth = [...globalThis.__game.voice.synth];
    hud();
  };
  const play = () => {
    log.playedAt ??= time;
    started = true; show('play', false); show('restart', false);
    save.played = true;
    if (fault.touchesOther === 'play') save.worlds.other.final = true;
    persist();
    const tour = defs.find((d) => d.kind === 'flyover');
    if (tour && !done(tour) && fault.neverStarts !== tour.id) { mark(tour); busy = true; on.add(tour.id); say('welcome'); after(tour.seconds, () => { on.delete(tour.id); after(0.5, () => { busy = false; }); }); }
    else if (!fault.silentPlay) say('go_next');
  };
  const tapScreen = (x, y) => {
    log.taps.push(`${x},${y}`);
    for (const id of [...on]) {
      const d = def(id);
      if (d.how === 'tap' && fault.neverEnds !== id && --tapsLeft <= 0) finish(d, () => mark(d));
    }
  };
  // a tap at the place of an item done by a tap: the game takes it in the same frame
  const tapAt = () => { const d = defs.find((x) => x.how === 'tap' && x.at && !done(x) && ready(x) && near(x)); if (d && started && !busy) mark(d); };

  // ---- the page ----
  const value = (fn, arg) => (typeof fn === 'string' ? (0, eval)(fn) : fn(arg));
  const page = {
    evaluate: async (fn, arg) => structuredClone(await value(fn, arg)),
    async waitForFunction(fn, arg, opts = {}) {
      for (let n = Math.ceil((opts.timeout ?? 30000) / 50); ; n--) {
        const v = await value(fn, arg);
        if (v) return { jsonValue: async () => v };
        if (n <= 0) throw new Error(`page.waitForFunction: Timeout ${opts.timeout}ms exceeded.`);
        frame();
      }
    },
    async waitForSelector(sel) { if (!shown(sel.replace(/^#/, ''))) throw new Error(`no ${sel}`); },
    waitForEvent: () => new Promise((res) => { sim.onLoad = res; }),
    async click(sel) { if (sel !== '#play' || !shown('play')) throw new Error(`cannot click ${sel}`); play(); },
    async reload() { boot(); },
    textContent: async (sel) => els[sel.replace(/^#/, '')].textContent,
    viewportSize: () => ({ width: 844, height: 390 }),
    touchscreen: { tap: async (x, y) => { tapScreen(x, y); tapAt(); } },
    mouse: { click: async (x, y) => { log.taps.push(`mouse ${x},${y}`); tapScreen(x, y); tapAt(); } },
    keyboard: { down: async (k) => { if (k === 'KeyW') input.walk = true; }, up: async (k) => { if (k === 'KeyW') input.walk = false; } },
  };

  // ---- the helpers of tools/shot.mjs ----
  const g = (fn, ...a) => page.evaluate(fn, ...a);
  // the wait tools/shot.mjs hands in: the one of tools/game-wait.mjs, over this page (the predicate travels as text)
  const { gameUntil } = gameWaits(page, { ceiling: 600000 });
  const fanfareUp = async (where) => {
    if (!shown('fanfare')) return false;
    if (!els.fanfare.classList.contains('ach')) return true;
    log.achievements.push(where);
    card();                                    // the scene of an achievement is closed: the block's own card comes back
    return true;
  };
  const tapOn = async (sel) => {
    if (sel === '#fanfareOk' && shown('fanfare')) {
      if (fault.cardStays) return;
      show('fanfare', false); busy = false;
    } else if (sel === '#btnBook' && shown('btnBook')) {
      const chains = defs.filter((d) => d.kind === 'chain');
      shards = chains.map((d) => ({ classList: { contains: (c) => c === 'got' && (fault.bookDark ? false : done(d)) } }));
      els.colStats.textContent = `⭐ ${save.stars}`;
      show('book');
    } else if (sel === '#restart' && shown('restart')) {
      if (!fault.restartKeeps) storage.delete('amw-save');
      boot(); sim.onLoad?.();
    } else throw new Error(`Timeout 15000ms exceeded.\n- waiting for ${sel}`);
  };
  const h = {
    page, g, T: (ms) => ms, gameUntil, fanfareUp, tapOn, errors,
    shot: async (name) => { log.shots.push(name); },
    act: async () => { log.presses++; input.act = true; },
    why: (e) => String(e?.message ?? e).split('\n')[0],
    visible: async (sel) => shown(sel.replace(/^#/, '')),
    closeBook: async () => { show('book', false); },
    checkLinks: async (where) => { log.links.push(where); },
    checkQuestion: async (type) => { log.questions.push(`${type}: ${shown('bubble') ? line : 'no bubble'}`); },
    checkVoice: async (when) => ({ clips: 6, loud: 6, when }),
    checkBank: async () => { log.bank = true; },
    QUESTIONS: { add: ['t_add'] }, mode: 'mobile', touch: true, level: '3', stuckMs: 240000, worldId: WORLD, kept: { other: KEPT }, stars: STARS,
    ...o.helpers,
  };
  el('btnBook', false);
  boot();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', document);
  vi.stubGlobal('localStorage', { getItem: (k) => storage.get(k) ?? null });
  vi.stubGlobal('requestAnimationFrame', (cb) => { raf.push(cb); });
  // `fault.worker`: the page has a service worker that takes it after so many seconds (-1: never; 'unregistered': the
  // browser has workers, the page registers none); by default the browser has none at all
  const worker = fault.worker === undefined ? undefined
    : { getRegistration: async () => (fault.worker === 'unregistered' ? undefined : {}), get controller() { return fault.worker >= 0 && time >= fault.worker ? {} : null; } };
  vi.stubGlobal('navigator', { get onLine() { return sim.online; }, serviceWorker: worker });
  return { h, log, errors, sim, storage, stored: () => JSON.parse(storage.get('amw-save') ?? '{}'), game: () => globalThis.__game };
}

describe('the pass of a world by its description, on a stand-in page (ARCH-16)', () => {
  const dirs = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
  afterEach(() => { vi.unstubAllGlobals(); delete globalThis.__game; delete globalThis.__stars; vi.restoreAllMocks(); });
  const quiet = () => vi.spyOn(console, 'log').mockImplementation(() => {});
  /** Plays the pass on a stand-in page: what it left ({ errors, log, ... }) and how it ended (`thrown`: the message, or null). */
  const pass = async (o = {}, opts = { need: 'one', out: '' }) => {
    const lines = quiet();
    lines.mockClear();
    const s = standIn(o);
    let thrown = null, voice;
    try { voice = await playWorld(s.h, opts); } catch (e) { thrown = e.message; }
    return { ...s, thrown, voice, printed: lines.mock.calls.map((c) => c.join(' ')) };
  };

  it('the whole pass: every item done by its description, in the order of "after", from the start screen to "start again"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'world-pass-')); dirs.push(dir);
    const r = await pass({}, { need: 'one', out: join(dir, 'pass.json') });
    expect(r.thrown).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.voice).toEqual({ clips: 6, loud: 6, when: 'at the end' });
    expect(r.printed[0]).toBe('plan of the world "meadow": 7 items of its description - chain owl (act), pet pet (act, after owl), flyover toured (auto), secret well (act), '
      + 'part key (walk, after well), scene tale (act), finale final (act, after owl pet toured well key tale); the world template asks for one item of every kind (E2E_WORLD_NEED)');
    expect(r.printed.filter((l) => /^(item|chain) done: /.test(l)).map((l) => l.replace(/, \d+s/, ''))).toEqual([
      'item done: flyover toured by "auto"', 'chain done: owl (2 steps), counter 1/1, stars 7 -> 13', 'item done: pet pet by "act"', 'item done: secret well by "act"',
      'item done: part key by "walk"', 'item done: scene tale by "act"', 'item done: finale final by "act"']);
    expect(r.printed.some((l) => l.startsWith('world "meadow": 7 items of its description done in the order toured, owl, pet, well, key, tale, final; 1 of 1 chains; '))).toBe(true);
    // the report of the pass: what tools/worlds.mjs reads
    expect(JSON.parse(readFileSync(join(dir, 'pass.json'), 'utf8'))).toEqual({
      world: 'meadow', size: 'mobile', online: true, need: 'one item of every kind',
      items: DEFS().map((d) => ({ kind: d.kind, id: d.id, how: d.how })), order: ['toured', 'owl', 'pet', 'well', 'key', 'tale', 'final'], worldTasks: [],
    });
    // the character of a chain of two steps is talked to twice; the other four buttons once each
    expect(r.log.presses).toBe(6);
    expect(r.log.taps, 'nothing here is done by a tap').toEqual([]);
    expect(r.log.missingAsked[0]).toEqual(ONE_OF_EACH);
    // after "start again" the save is the one of a new player
    expect(r.stored()).toEqual({});
  });

  /** A second character whose one step is a task in the world: declared (`inWorld`) and opened by the game (`opens`). */
  const hare = (o = {}) => (d) => {
    const out = [...d];
    out.splice(1, 0, { kind: 'chain', id: 'hare', how: 'act', at: { x: 3, z: -6 }, steps: 1, world: 'tally', opens: [0], inWorld: [0], ...o });
    out.find((x) => x.kind === 'finale').after.push('hare');
    return out;
  };

  it('a task in the world on a declared step: open, a wrong move, closed, opened anew, solved - through the door, in game time', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'world-pass-')); dirs.push(dir);
    const r = await pass({ defs: hare() }, { need: 'one', out: join(dir, 'pass.json') });
    expect(r.thrown).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.log.door).toEqual(['wrong', 'close', 'solve']);
    expect(r.printed).toContain('world task: hare step 1 "tally": open, wrong, close, again, solve - opened waiting, a wrong move on rung 1 with its clips, closed with nothing recorded and the heroine walking, opened anew, solved and recorded');
    expect(r.printed).toContain('tasks in the world: hare 0 of the declared hare 0');
    expect(r.printed.filter((l) => l.startsWith('chain done: hare')).map((l) => l.replace(/, \d+s/, ''))).toEqual(['chain done: hare (1 steps), counter 2/2, stars 13 -> 16']);
    // its action pressed twice (opened, then opened anew), pictured open and on its first rung
    expect(r.log.presses).toBe(8);
    expect(r.log.shots).toEqual(expect.arrayContaining(['world-task-tally', 'world-task-tally-hint1']));
    expect(JSON.parse(readFileSync(join(dir, 'pass.json'), 'utf8')).worldTasks).toEqual(['hare 0']);
  });

  it('a task in the world on a step the description does not declare fails with the id of the chain', async () => {
    const r = await pass({ defs: hare({ inWorld: undefined }) });
    expect(r.thrown).toContain('a task in the world ("tally") opened at step 1 of the chain "hare", which its description does not declare (inWorld: [])');
    expect(r.log.door).toEqual([]);
  });

  it('a card where the chain declares a task in the world fails', async () => {
    const r = await pass({ defs: hare({ opens: [] }) });
    expect(r.thrown).toContain('the item "hare" (chain, done by "act" at 3,-6): a card instead of the task in the world declared at step 1 (inWorld: [0])');
  });

  it('a declared step the pass never met as a task in the world is a failure at the end', async () => {
    // the panel step before it moves the chain two steps on: the step declared in the world is never played
    const r = await pass({ defs: hare({ steps: 2, inWorld: [1], opens: [1] }), fault: { skipsStep: 'hare' } });
    expect(r.thrown).toBeNull();
    expect(r.errors).toEqual(['world task: mobile meadow: steps declared as tasks in the world that the pass never met as one: "hare" step 2']);
  });

  it.each([
    ['openWrong', 'a) open: 1 wrong move(s) at its start'],
    ['hintSynth', 'b) a wrong move: lines left to the synthesizer: h_count'],
    ['noRung', 'b) the course of the wrong move did not come back to input on rung 1'],
    ['closeRecords', 'c) closed: the game holds'],
    ['frozen', 'c) closed: the heroine does not walk'],
    ['noSkill', 'e) solved: the game: the tasks of the skills changed in none'],
  ])('a task in the world that breaks the rule "%s" fails with its chain, its step and the letter of the step', async (name, text) => {
    const r = await pass({ defs: hare(), fault: { [name]: true } });
    expect(r.thrown).toContain(`world task: mobile the item "hare" (chain, done by "act" at 3,-6), step 1, the task in the world "tally": ${text}`);
  });

  it('every screen of the pass is a picture - the layout check of tools/shot.mjs: the start, what plays, each item at its place, a task, a card, the book', async () => {
    const r = await pass();
    expect(r.log.shots).toEqual(['00-start', 'item-toured-on', '01-spawn', 'item-owl', 'task-add', 'card-owl', 'item-pet', 'item-well', 'item-key', 'item-tale', 'item-tale-on',
      'item-final', 'item-final-on', '20-done', '30-book', '40-start-again']);
    expect(r.log.links).toEqual(['start screen', 'collection book']);
    expect(r.log.questions).toEqual(['add: t_add']);
    expect(r.log.bank).toBe(true);
  });

  it('the numbers of the world template are asked for unless the caller says a test world', async () => {
    const r = await pass({}, { need: '', out: '' });
    expect(r.log.missingAsked[0]).toBeUndefined();
    expect(r.printed[0]).toContain('the world template asks for the numbers of the world template (E2E_WORLD_NEED)');
    expect((await pass({}, { need: 'some', out: '' })).thrown).toBe('world "meadow": bad E2E_WORLD_NEED="some": expected "one" (one item of every kind), "grey" (a grey build) or "template" (the numbers of the world template)');
  });

  it('a point of the world template that the description lacks: the pass ends before "play", with the number and the name of the point', async () => {
    const lacks = 'template point 6 "Необязательные секреты" (docs/13-worlds.md): 0 item(s) of kind "secret" - the secrets, at least 1 needed';
    const r = await pass({ fault: { missing: [lacks] } });
    expect(r.thrown).toBe(`world "meadow": its description cannot be played: the description lacks a point of the world template: ${lacks}`);
    expect(r.log.shots, 'nothing was played').toEqual(['00-start']);
    expect(r.log.presses).toBe(0);
  });

  it('a description that disagrees with the world, or no description at all: the pass ends before "play"', async () => {
    const r = await pass({ fault: { itemProblems: ['the item "key" comes after "well", which is no item of the description'] } });
    expect(r.thrown).toBe('world "meadow": its description cannot be played: the description disagrees with what the world declares: the item "key" comes after "well", which is no item of the description');
    expect((await pass({ fault: { noDescription: true } })).thrown).toBe('world "meadow": its description cannot be played: window.__game.items is null: the world hands in no description, expected the list of its items');
  });

  it('an item that is never done fails with its id after two tries of its action, not with the time limit of the pass', async () => {
    const r = await pass({ fault: { neverMarks: 'well' } });
    expect(r.thrown).toBe(`world "meadow": the item "well" (secret, done by "act" at 5,1) was not done in the game: its action was tried ${TRIES} times and its mark "flags.well" stays undefined`);
    // the first press and one more; in game time that is seconds, not the minutes of E2E_STUCK_MS
    expect(r.log.presses).toBe(2 + 2 + 1);
    expect(r.game().time).toBeLessThan(60);
    const walk = await pass({ fault: { neverMarks: 'key' } });
    expect(walk.thrown).toBe(`world "meadow": the item "key" (part, done by "walk" at 9,-7) was not done in the game: its action was tried ${TRIES} times and its mark "flags.key" stays undefined`);
  });

  it('a game that keeps the controls after an item fails with the id of the item, counted in seconds of the game', async () => {
    const r = await pass({ fault: { holds: 'well' } });
    expect(r.thrown).toBe(`world "meadow": item stuck: the item "well" (secret, done by "act" at 5,1) - the game holds the controls for ${PLAYS} s of game time`);
    expect(r.stored().worlds.meadow.flags.well, 'the item itself was done').toBe(true);
    // the wait ended by the game's clock: a ceiling of the wall clock (E2E_STUCK_MS, 240 s here) would have let it run on
    expect(r.game().time).toBeGreaterThan(PLAYS);
    expect(r.game().time).toBeLessThan(PLAYS + 30);
  });

  it('a chain that is never done: its character is asked again while the mark grows, and no longer', async () => {
    const r = await pass({ fault: { neverDone: 'owl' } });
    expect(r.thrown).toBe(`world "meadow": the item "owl" (chain, done by "act" at 0,-2) was not done in the game: its action was tried ${TRIES} times and its mark "quests.owl" stays 2`);
    expect(r.log.presses, 'two steps, then two conversations that changed nothing').toBe(4);
  });

  it('an item whose "done" does not read its mark fails with its id', async () => {
    const r = await pass({ fault: { neverDone: 'pet' } });
    expect(r.thrown).toBe('world "meadow": the item "pet" (pet, done by "act" at -7,-9) is not done, but its mark "flags.pet" is set in the save: its "done" does not read its mark');
  });

  it('an item with no action button at its place, one that never starts, one that never ends: each fails with its id', async () => {
    expect((await pass({ fault: { noButton: 'well' } })).thrown).toBe('world "meadow": the item "well" (secret, done by "act" at 5,1): no action button at its place');
    const late = (d) => [...d, { kind: 'scene', id: 'return', how: 'auto', at: null, after: ['final'], seconds: 1 }];
    expect((await pass({ defs: late })).thrown, 'an item that plays by itself after the finale is waited for').toBeNull();
    expect((await pass({ defs: late, fault: { neverStarts: 'return' } })).thrown).toBe(`world "meadow": the item "return" (scene, done by "auto") plays by itself, but did not start in ${STARTS} s of game time`);
    expect((await pass({ fault: { neverEnds: 'tale' } })).thrown).toBe(`world "meadow": the item "tale" (scene, done by "act" at -4,-1) is still on after ${PLAYS} s of game time: its "active" does not end`);
  });

  it('an item that plays by itself is waited for by its "active": the pass neither stands anywhere nor presses anything for it', async () => {
    const r = await pass({ defs: (d) => [...d, { kind: 'scene', id: 'return', how: 'auto', at: null, after: ['final'], seconds: 1 }] });
    expect(r.errors).toEqual([]);
    expect(r.log.shots).toContain('item-return-on');
    expect(r.log.presses).toBe(6);
    expect(r.printed.some((l) => /^item done: scene return by "auto", \d+s$/.test(l))).toBe(true);
    // the tour is on right after "play": it is the first item of the pass, though the third of the list
    expect(r.printed.find((l) => l.startsWith('world "meadow":'))).toContain('in the order toured, owl, pet, well, key, tale, final, return;');
  });

  it('an item done by a tap: the middle of the screen is tapped until it is over - once it is on by itself, or at its place', async () => {
    const opening = (d) => [...d, { kind: 'scene', id: 'ending', how: 'tap', at: null, after: ['final'], pictures: 3 }, { kind: 'secret', id: 'bird', how: 'tap', at: { x: 3, z: 9 }, after: ['ending'] }];
    const r = await pass({ defs: opening });
    expect(r.thrown).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.log.taps, 'three pictures of the cutscene, then the secret').toEqual(['422,195', '422,195', '422,195', '422,195']);
    expect(r.log.teleports.at(-1)).toBe('3,9');
    expect(r.log.shots).toEqual(expect.arrayContaining(['item-ending-on', 'item-bird']));
    // with a mouse the same taps are clicks
    const desk = await pass({ defs: opening, helpers: { touch: false, mode: 'desktop' } });
    expect(desk.log.taps.filter((t) => t.startsWith('mouse'))).toHaveLength(4);
    // a cutscene no tap ends
    const stuck = await pass({ defs: opening, fault: { neverEnds: 'ending' } });
    expect(stuck.thrown).toBe('world "meadow": the item "ending" (scene, done by "tap") is still on after 20 taps on the screen');
  });

  it('the order of "after": a game that lets an item be done before what it comes after is reported', async () => {
    const r = await pass({ fault: { orderBroken: 'final' } });
    expect(r.errors).toEqual(['order: mobile meadow: the item "final" (finale, done by "act" at -8,4) has its action button before owl, pet, well, key, tale are done: the game does not keep the order of "after"']);
    const walk = await pass({ fault: { orderBroken: 'key' } });
    expect(walk.errors).toEqual(['order: mobile meadow: the item "key" (part, done by "walk" at 9,-7) was done by standing at its place before well: the game does not keep the order of "after"']);
    // the places tried: the items held back when the world is entered, in the order of the list
    expect((await pass()).log.teleports.slice(0, 3)).toEqual(['-7,-9', '9,-7', '-8,4']);
  });

  it('an item that does not stay done is asked for again: the pass says so', async () => {
    const r = await pass({ fault: { forgets: { id: 'pet', when: 'tale' } } });
    expect(r.thrown).toBe('world "meadow": the item "pet" (pet, done by "act" at -7,-9) is asked for again: it does not stay done');
  });

  it('an item that waits for one that is not there: no item can be done next', async () => {
    const r = await pass({ defs: (d) => d.map((x) => (x.id === 'key' ? { ...x, after: ['attic'] } : x)) });
    expect(r.thrown).toBe('world "meadow": no item can be done next: key, final are not done, and each comes after an item that is not');
  });

  it('the stars: never down, stored in the frame they are won, and a chain gives some', async () => {
    expect((await pass({ fault: { dropsStars: true } })).errors.filter((e) => e.startsWith('stars:')))
      .toEqual(['stars: mobile: the number of stars went down in the item "owl" (chain, done by "act" at 0,-2): 7 -> 6', 'stars: mobile: the number of stars went down in the item "owl" (chain, done by "act" at 0,-2): 9 -> 8']);
    // (the watch sees a frame after it is drawn: the last stars of an item may be told with the next one)
    expect((await pass({ fault: { starsUnstored: true } })).errors).toEqual([expect.stringMatching(/^stars: mobile: stars won in the item "owl" \(.*\) were not stored at once: 7 -> 10, stored 7$/),
      expect.stringMatching(/^stars: mobile: stars won in the item "\w+" \(.*\) were not stored at once: 10 -> 13, stored 10$/)]);
    expect((await pass({ fault: { noStars: true } })).errors).toEqual(['stars: mobile meadow: the chain of "owl" gave no stars (7 -> 7)']);
  });

  it('the counter of the parts and the book follow the chains done', async () => {
    expect((await pass({ fault: { counter: '0/1' } })).errors).toEqual(['crystals: mobile meadow: the counter shows 0/1 with 1 of 1 chains done']);
    expect((await pass({ fault: { bookDark: true } })).errors).toEqual(['book: mobile meadow: 0 parts lit, 1 chains done']);
  });

  it('the save: the world played gets its own part at "play", and the other world is not touched', async () => {
    expect((await pass({ fault: { noWorldPart: true } })).thrown).toBe('world "meadow": the game does not play it: the save has no worlds.meadow after "play" (worlds: other)');
    expect((await pass({ fault: { touchesOther: 'play' } })).thrown).toContain('world "meadow": worlds.other changed at the start: {"quests":{"elder":2},"final":true,');
    // touched later, while the world is played: found after the reload
    const later = await pass({ fault: { touchesOther: 'chain' } });
    expect(later.thrown).toBeNull();
    expect(later.errors).toEqual([expect.stringMatching(/^reload: mobile meadow: worlds\.other changed: \{"quests":\{"elder":3\},.*, was \{"quests":\{"elder":2\},.*\}$/)]);
  });

  it('the save: a mark that is not stored is reported at the end and after the reload', async () => {
    const r = await pass({ fault: { unstored: 'final' } });
    expect(r.errors).toEqual([
      'description: mobile meadow: at the end: the item "final" (finale) is done, but its mark "final" is false in the stored save',
      expect.stringMatching(/^reload: mobile meadow: worlds\.meadow is \{.*"final":false.*\} in the stored save, the game held \{.*"final":true.*\}; these items are not done any more: final - their marks are not in the save$/),
    ]);
  });

  it('"start again" must clear every world: progress that comes back ends the pass', async () => {
    const r = await pass({ fault: { restartKeeps: true } });
    expect(r.thrown).toMatch(/^world "meadow": start again: after the reload the old progress is back: 13 stars, "played", quests \{"elder":2\} \(other\), stars taken \[1\] \(other\), flags \{"chest":true\} \(other\), the final \(meadow\), quests \{"owl":2\} \(meadow\), flags \{.*\} \(meadow\), the "start again" button of a returning player$/);
  });

  it('the voice and the planner: a line left to the synthesizer, a line turned away, a task the planner does not know', async () => {
    expect((await pass({ fault: { synth: ['meadow_hi'] } })).errors).toEqual(['no recorded clip for: meadow_hi (python3 tools/gen_voice.py)']);
    expect((await pass({ fault: { dropped: ['go_next', 'praise_2'] } })).errors).toEqual(['the planner turned away lines the scenario gives no reason for: praise_2']);
    expect((await pass({ fault: { unplanned: true } })).errors).toEqual(Array(2).fill('world "meadow": a task is open, but the planner of spoken lines does not know it'));
    expect((await pass({ fault: { fps: 'NaN fps' } })).errors).toEqual(['with ?debug the frame counter does not show the frames: "NaN fps"']);
  });

  it('a task: pictured once its own show has ended and its question is in the bubble; a cheat that does nothing ends the pass', async () => {
    const r = await pass({ fault: { watch: true } });
    expect(r.errors).toEqual([]);
    expect(r.log.questions).toEqual(['add: t_add']);
    expect((await pass({ fault: { cheatIdle: true } })).thrown).toBe('world "meadow": __game.cheat() did nothing for the "add" task of the item "owl" (chain, done by "act" at 0,-2)');
  });

  it('a task of the world itself inside a chain is solved by the world\'s cheat, and pictured once', async () => {
    const r = await pass({ defs: (d) => d.map((x) => (x.id === 'owl' ? { ...x, search: 3 } : x)) });
    expect(r.thrown).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.log.shots.filter((s) => s.startsWith('task-'))).toEqual(['task-add', 'task-stars']);
    expect(r.log.presses, 'the search is not talked through: no press more than without it').toBe(6);
  });

  it('the scene of an achievement over the card of a part is closed on the way; a card that does not close ends the pass', async () => {
    const r = await pass({ fault: { achievement: true } });
    expect(r.errors).toEqual([]);
    expect(r.log.achievements).toEqual(['the item "owl" (chain, done by "act" at 0,-2)']);
    expect(r.log.shots).toContain('card-owl');
    expect((await pass({ fault: { cardStays: true } })).thrown).toBe('world "meadow": the item "owl" (chain, done by "act" at 0,-2): the card of the fanfare does not close');
  });

  it('"play" is pressed once the service worker has taken the page: a clip of the bank asked for before that is not kept', async () => {
    expect((await pass()).log.playedAt, 'a page without a worker: nothing to wait for').toBeLessThan(0.2);
    const r = await pass({ fault: { worker: 7 } });
    expect(r.thrown).toBeNull();
    expect(r.log.playedAt).toBeGreaterThanOrEqual(7);
    expect(r.printed).toContain('service worker: it has taken the page');
    expect((await pass({ fault: { worker: -1 } })).thrown).toBe('world "meadow": the service worker is registered, but did not take the page');
    // the development server: the page registers no worker - the pass goes on after the few seconds a registration may take
    const dev = await pass({ fault: { worker: 'unregistered' } });
    expect(dev.thrown).toBeNull();
    expect(dev.printed).toContain('service worker: none on this page');
    expect(dev.log.playedAt).toBeGreaterThan(4.9);
    expect(dev.log.playedAt).toBeLessThan(5.5);
  });

  it('no line and no item after "play": the pass does not wait for a world that did not start', async () => {
    const silent = { defs: (d) => d.filter((x) => x.kind !== 'flyover'), fault: { silentPlay: true } };
    const r = await pass(silent);
    expect(r.thrown).toBe(`world "meadow": no line and no item of the description in ${OPENS} s of game time after "play"`);
  });

  it('the network: the report says whether the page was online', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'world-pass-')); dirs.push(dir);
    const lines = quiet();
    const s = standIn({ helpers: { mode: 'desktop', touch: false } });
    s.sim.online = false;
    await playWorld(s.h, { need: 'one', out: join(dir, 'pass.json') });
    lines.mockRestore();
    const report = JSON.parse(readFileSync(join(dir, 'pass.json'), 'utf8'));
    expect(report).toMatchObject({ size: 'desktop', online: false });
    expect(reportProblems(report, { world: 'meadow', size: 'desktop', offline: true, kinds: ITEM_KINDS })).toEqual([]);
    // a pass that failed leaves no report
    const dir2 = mkdtempSync(join(tmpdir(), 'world-pass-')); dirs.push(dir2);
    const failed = await pass({ fault: { neverMarks: 'well' } }, { need: 'one', out: join(dir2, 'pass.json') });
    expect(failed.thrown).not.toBeNull();
    expect(existsSync(join(dir2, 'pass.json'))).toBe(false);
  });
});

describe('tools/world-pass.mjs in the sources (R34, ARCH-16)', () => {
  const src = readFileSync(join(root, 'tools/world-pass.mjs'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**')).join('\n');

  it('waits for states and for game time only: no pause by the clock', () => {
    expect(code).not.toMatch(/waitForTimeout/);
    expect(code).not.toMatch(/\bsetTimeout\b|\bsetInterval\b/);
    expect(code).not.toMatch(/\bwait\(\s*\d/);
    // a wait for a state has a ceiling of the clock under E2E_SLOW
    for (const m of code.matchAll(/timeout: ([^ }]+)/g)) expect(m[1], m[0]).toMatch(/^T\(/);
  });

  it('the clock counts only where it is the right measure, each line with its reason (tools/clock-waits.mjs)', () => {
    // what the game does in its own time is waited for by the game's clock: a ceiling of the clock is left to a page
    // that loads, a real tap and the panel of a task; the watchdog and the log read the clock itself
    const CEILINGS = ['page-load', 'input-event', 'dom-anim'], READS = ['stuck-guard', 'log-time'];
    const keys = {};
    for (const line of code.split('\n')) {
      const ceiling = /timeout: T\(/.test(line), reads = /Date\.now\(\)/.test(line), key = /\/\* clock: ([a-z0-9-]+) \*\//.exec(line)?.[1];
      if (!ceiling && !reads) { expect(key, line).toBeUndefined(); expect(line, line).not.toMatch(/\bT\(/); continue; }
      expect(Object.keys(CLOCK_REASONS), line).toContain(key);
      expect(ceiling ? CEILINGS : READS, line).toContain(key);
      keys[key] = (keys[key] ?? 0) + 1;
    }
    // the count of each reason: a new line that counts the clock is a decision, not a habit
    expect(keys).toEqual({ 'page-load': 6, 'input-event': 2, 'dom-anim': 2, 'stuck-guard': 2, 'log-time': 4 });
    // the two waits for the game itself - its first line after "play", the controls it holds - count its seconds
    expect(code).toMatch(/await gameUntil\(\(\) => !document\.querySelector\('#bubble'\)[^\n]*, null, OPENS\)/);
    expect(code).toMatch(/await leaves\(id, 'busy', PLAYS\)/);
  });

  it('knows no world: no id of a world, of a character or of an item of the probe world, no place', () => {
    const probe = readFileSync(join(root, 'src/worlds/probe/index.ts'), 'utf8') + readFileSync(join(root, 'src/worlds/probe/items.ts'), 'utf8');
    const names = new Set(['fairy', 'probe', 'fawn']);
    for (const m of probe.matchAll(/id: '([a-z_]+)'/g)) names.add(m[1]);
    for (const m of /export const SECRET = '(\w+)', PART = '(\w+)', SCENE = '(\w+)', TOUR = '(\w+)'/.exec(probe).slice(1)) names.add(m);
    expect([...names].sort()).toEqual(['fairy', 'fawn', 'friend', 'gem', 'hollow', 'kit', 'probe', 'story', 'toured']);
    for (const n of names) expect(src, n).not.toMatch(new RegExp(`['"\`]${n}['"\`]|\\b${n}_|worlds\\.${n}\\b`));
    // a place comes from the description: the only numbers handed to the game's teleport are the item's own
    expect(code.match(/teleport\([^)]*\)/g)).toEqual(['teleport(x, z)']);
  });

  it('tools/shot.mjs only calls it: the import, one call with the helpers, and nothing of the old walkthrough left', () => {
    const shot = readFileSync(join(root, 'tools/shot.mjs'), 'utf8');
    expect(shot).toContain("import { playWorld } from './world-pass.mjs';");
    expect(shot.split('playWorld(')).toHaveLength(2);
    expect(shot).toMatch(/\n {4}if \(worldId\) voiceUsed = await playWorld\(\{ page, g, T, shot, [^\n]*worldId, kept: \{ fairy: FAIRY_KEPT \}, stars: STARS_KEPT \}\);\n/);
    expect(shot).not.toContain('const playWorld');
    expect(shot).not.toContain('__game.npcs.map((n) => ({ id: n.def.id, x: n.def.x, z: n.def.z, steps: n.def.steps.length }))');
    // every helper the pass takes is handed in by that call
    const taken = /const \{ ([^}]+) \} = h;/s.exec(src)[1].split(',').map((n) => n.trim().split(':')[0].trim()).filter(Boolean);
    const call = /await playWorld\(\{ ([^\n]*) \}\);/.exec(shot)[1];
    const given = call.replace(/\{[^}]*\}/g, '').split(',').map((n) => n.trim().split(':')[0].trim());
    expect(taken.sort()).toEqual(given.sort());
  });
});

describe('the size of the things of a task in the world on the screen (MIN_TAP_PX)', () => {
  it('a thing smaller than a finger is a problem; one with no size given is not measured', () => {
    expect(MIN_TAP_PX).toBe(48);
    expect(tapSizeProblems([{ px: 60, right: true }, { px: null, right: false }])).toEqual([]);
    expect(tapSizeProblems([{ px: 31.6, right: false }])).toEqual(['a wrong thing 32 px across, under 48']);
  });
});
