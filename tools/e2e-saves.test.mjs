// Runs in `npm test`. The groups of the walkthrough (npm run e2e -- --only <group>) start from saves written out in
// tools/e2e-saves.mjs. A save the game cannot read would be thrown away for a new player's, and the group would pass
// playing something else - so each one is read here with the game's own loadSave(): no damage, this version, the
// fields of defaultSave(), the first world's progress where the game reads it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION, defaultSave, defaultWorld, loadSave } from '../src/core/save';
import { BLOCKS, FRIENDS, GROUPS, PIECES, baseSave, startSave } from './e2e-saves.mjs';

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
      expect(keys(stored)).toEqual(keys(defaultSave()));
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

  it.each(withSave)('the save of "%s" has done every friend the group does not play before it, and none it plays', (group) => {
    const { friends } = GROUPS[group];
    const s = JSON.parse(startSave(group));
    const done = Object.keys(s.worlds.fairy.quests);
    for (const id of friends) expect(done).not.toContain(id);
    // the friends before the group's own in the order of the world, and every one of them finished
    expect(Object.values(s.worlds.fairy.quests).every((n) => n === 3)).toBe(true);
    expect(s.played).toBe(true);
    // the skills count at least one task per step finished but the star search's (the check at the end of a walkthrough)
    const tasks = Object.values(s.skills).reduce((n, k) => n + k.tasks, 0);
    expect(tasks).toBeGreaterThanOrEqual(done.length * 3 - (done.includes('deer') ? 1 : 0));
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

  it('a new player\'s group has no save, and an unknown group is an error', () => {
    expect(startSave('world1')).toBe('');
    expect(startSave('tasks', { mute: true })).toBe('');
    expect(() => startSave('world4')).toThrow(/unknown group/);
  });
});
