// Runs in `npm test`. The groups of the walkthrough (npm run e2e -- --only <group>) start from saves written out in
// tools/e2e-saves.mjs. A save the game cannot read would be thrown away for a new player's, and the group would pass
// playing something else - so each one is read here with the game's own loadSave(): no damage, this version, the
// fields of defaultSave(), the first world's progress where the game reads it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION, defaultSave, defaultWorld, loadSave } from '../src/core/save';
import { QUESTS } from '../src/worlds/fairy/quests';
import { settleOldParts } from '../src/worlds/fairy/parts';
import { BLOCKS, CHAINS, FRIENDS, GROUPS, PIECES, PIECES_ONLY, baseSave, startSave } from './e2e-saves.mjs';

/** In-memory stand-in for localStorage: save.ts talks to the global directly and node has none. */
function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
  };
}
const keys = (o) => Object.keys(o).sort();
let storage;
beforeEach(() => { storage = memoryStorage(); vi.stubGlobal('localStorage', storage); });
afterEach(() => { vi.unstubAllGlobals(); });

const withSave = Object.keys(GROUPS).filter((g) => GROUPS[g].save);

describe('tools/e2e-saves.mjs: the saves the groups of the walkthrough start from', () => {
  it('writes out defaultSave() of src/core/save.ts', () => {
    expect(baseSave()).toEqual(defaultSave());
  });

  it.each(withSave)('the save of "%s" is read by loadSave() as it is: no damage, this version, the fields of defaultSave()', (group) => {
    for (const mute of [false, true]) {
      const text = startSave(group, { mute });
      const stored = JSON.parse(text);
      storage.setItem('amw-save', text);
      const s = loadSave();
      expect(storage.getItem('amw-save-damaged')).toBeNull();
      expect(s.v).toBe(SAVE_VERSION);
      expect(stored.v).toBe(SAVE_VERSION);
      // the parents' free pass of a save with the world done (PLAY-36, `played`): a choice the defaults do not have
      expect(stored.freeArches === true).toBe(stored.worlds.fairy?.final === true);
      expect(s.freeArches === true).toBe(stored.worlds.fairy?.final === true);
      expect(keys(stored).filter((k) => k !== 'freeArches')).toEqual(keys(defaultSave()));
      expect(keys(stored.skills)).toEqual(keys(defaultSave().skills));
      expect(keys(stored.vol)).toEqual(keys(defaultSave().vol));
      expect(keys(stored.fixed)).toEqual(keys(defaultSave().fixed));
      expect(keys(stored.gear)).toEqual(keys(defaultSave().gear));
      expect(keys(stored.worlds)).toEqual(['fairy']);
      expect(keys(stored.worlds.fairy)).toEqual(keys(defaultWorld()));
      // what the game holds is what the save says: nothing replaced by a default
      expect(s).toEqual(stored);
      expect(s.vol.voice).toBe(mute ? 0 : 1);
    }
  });

  it.each(withSave)('the save of "%s" as version 4 wrote it (before Season 2) opens whole in version 5, its text kept in amw-save-v4', (group) => {
    const now = JSON.parse(startSave(group));
    const v4 = structuredClone(now);
    v4.v = 4;
    for (const k of ['recent', 'pip', 'notes', 'words', 'shares', 'english']) delete v4[k];
    for (const k of ['en_words', 'en_phrases', 'read']) { delete v4.skills[k]; delete v4.fixed[k]; }
    storage.setItem('amw-save', JSON.stringify(v4));
    const s = loadSave();
    expect(storage.getItem('amw-save-damaged')).toBeNull();
    expect(storage.getItem('amw-save-v4')).toBe(JSON.stringify(v4));
    // the stars, the skills, the worlds of version 4 as they were, and what version 5 adds as a new player has it
    expect(s).toEqual(now);
  });

  it.each(withSave)('the save of "%s" has done every friend the group does not play before it, and none it plays', (group) => {
    const { friends } = GROUPS[group];
    const s = JSON.parse(startSave(group));
    const done = Object.keys(s.worlds.fairy.quests);
    for (const id of friends) expect(done).not.toContain(id);
    // the friends before the group's own in the order of the world, and every one of them finished
    for (const [id, n] of Object.entries(s.worlds.fairy.quests)) expect(n).toBe(QUESTS.find((q) => q.id === id).steps.length);
    // a save of the game of now: the first world does not move it on as a save from before the hidden parts
    expect(settleOldParts(structuredClone(s.worlds.fairy))).toBe(false);
    expect(s.played).toBe(true);
    // the skills count at least one task per step finished but the star search's (the check at the end of a walkthrough)
    const tasks = Object.values(s.skills).reduce((n, k) => n + k.tasks, 0);
    expect(tasks).toBeGreaterThanOrEqual(done.length * 3 - (done.includes('deer') ? 1 : 0));
  });

  it('the chains written out are the chains of the world', () => {
    expect(CHAINS).toEqual(Object.fromEntries(QUESTS.map((q) => [q.id, q.steps.length])));
  });

  it('the pieces play every friend once and every block at least once', () => {
    const friends = PIECES.flatMap((p) => GROUPS[p].friends);
    expect([...friends].sort()).toEqual([...FRIENDS].sort());
    const blocks = new Set(PIECES.flatMap((p) => GROUPS[p].blocks));
    expect([...BLOCKS].filter((b) => !blocks.has(b))).toEqual([]);
    for (const g of Object.values(GROUPS)) for (const b of g.blocks) expect(BLOCKS).toContain(b);
    // a piece's save has done exactly the friends of the pieces before it, and the shop the whole world
    expect(GROUPS.world1.save).toBeNull();
    expect(keys(JSON.parse(startSave('world2')).worlds.fairy.quests)).toEqual(keys(Object.fromEntries(GROUPS.world1.friends.map((f) => [f, 1]))));
    expect(JSON.parse(startSave('shop')).worlds.fairy.final).toBe(true);
    expect(JSON.parse(startSave('finale')).worlds.fairy.final).toBe(false);
  });

  it('the blocks the whole walkthrough leaves out are each played by a piece; the build without ?debug is not one of them', () => {
    const inPieces = new Set(PIECES.flatMap((p) => GROUPS[p].blocks));
    expect(PIECES_ONLY.length).toBeGreaterThan(0);
    for (const b of PIECES_ONLY) {
      expect(BLOCKS).toContain(b);
      expect(inPieces.has(b), `${b} is left out of the whole walkthrough and played by no piece`).toBe(true);
    }
    expect(PIECES_ONLY).not.toContain('no-debug');
    // the puzzle's level 3 and the twins of level 4 are played in the piece of the puzzle (tools/shot.mjs)
    expect(GROUPS.tasks2.blocks).toContain('puzzle');
  });

  it('a new player\'s group has no save, and an unknown group is an error', () => {
    expect(startSave('world1')).toBe('');
    expect(startSave('tasks', { mute: true })).toBe('');
    expect(() => startSave('world4')).toThrow(/unknown group/);
  });
});
