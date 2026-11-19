/**
 * The parts hidden in the world (./parts.ts): a save from before they were hidden keeps its shards; one whose hint was
 * said waits for its shard in the world; one with the shard taken is left as it is. The save's format does not change.
 */
import { describe, expect, it } from 'vitest';
import { HIDDEN_PARTS, settleOldParts } from './parts';
import { QUESTS, chainDone } from './quests';

const ws = (quests: Record<string, number>, flags: Record<string, boolean> = {}) => ({ quests: { ...quests }, flags: { ...flags } });

describe('the parts of the fox and the mushroom king, hidden in the world', () => {
  it('their chains have the step "part" after their three tasks; the other chains have none', () => {
    for (const q of QUESTS) expect(q.steps.includes('part')).toBe(HIDDEN_PARTS.some((p) => p.owner === q.id));
    for (const p of HIDDEN_PARTS) expect(QUESTS.find((q) => q.id === p.owner)!.steps.indexOf('part')).toBe(3);
  });

  it('a save of three steps and no hint (from before the parts were hidden): the chain is finished, the shard counted and marked taken', () => {
    const w = ws({ fox: 3, mushking: 3, unicorn: 3 });
    expect(settleOldParts(w)).toBe(true);
    expect(w.quests).toEqual({ fox: 4, mushking: 4, unicorn: 3 });
    expect(w.flags).toEqual({ part_fox: true, part_mushking: true });
    for (const q of QUESTS.filter((x) => x.id !== 'deer' && x.id !== 'queen')) expect(chainDone(w, q)).toBe(true);
  });

  it('three steps with the hint said: it stays - the shard waits in the world', () => {
    const w = ws({ fox: 3 }, { fox_hint: true });
    expect(settleOldParts(w)).toBe(false);
    expect(w).toEqual(ws({ fox: 3 }, { fox_hint: true }));
    expect(chainDone(w, QUESTS.find((q) => q.id === 'fox')!)).toBe(false);
  });

  it('the step done, or the chain not that far yet: nothing changes', () => {
    for (const w of [ws({ fox: 4, mushking: 4 }, { fox_hint: true, part_fox: true }), ws({ fox: 2, mushking: 0 }), ws({})]) {
      const before = JSON.stringify(w);
      expect(settleOldParts(w)).toBe(false);
      expect(JSON.stringify(w)).toBe(before);
    }
  });
});
