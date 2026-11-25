/**
 * The parts hidden in the world (./parts.ts): a save from before they were hidden keeps its shards; one whose hint was
 * said waits for its shard in the world; one with the shard taken is left as it is. The save's format does not change.
 */
import { describe, expect, it } from 'vitest';
import { HIDDEN_PARTS, inRoomArea, settleOldParts, throughTheDoor } from './parts';
import { GLADE, HOUSE, ROOM } from './layout';
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

describe('the cat\'s sparkles to a shard on the other side of the fairy house\'s door', () => {
  // the doors as ./secrets.ts places them: outside by the house in the valley, inside by the room's door
  const doors = { doorOut: { x: HOUSE.x + 1.5, z: HOUSE.z + 1 }, doorIn: { x: ROOM.x, z: ROOM.z + ROOM.half - 1.1 } };
  const king = HIDDEN_PARTS.find((p) => p.owner === 'mushking')!, fox = HIDDEN_PARTS.find((p) => p.owner === 'fox')!;

  it('the king\'s shard lies in the room, far off the map; the fox\'s on the glade, in the valley', () => {
    expect(inRoomArea(king.at)).toBe(true);
    expect(Math.hypot(king.at.x - HOUSE.x, king.at.z - HOUSE.z)).toBeGreaterThan(150);
    expect(inRoomArea(fox.at)).toBe(false);
    expect(inRoomArea(GLADE)).toBe(false);
    expect(inRoomArea(doors.doorOut)).toBe(false);
    expect(inRoomArea(doors.doorIn)).toBe(true);
  });

  it('from the valley they lead to the house\'s door, not past the horizon (the customer\'s game, 2026-11-25); in the room, to the shelf', () => {
    expect(throughTheDoor(king.at, false, doors)).toBe(doors.doorOut);
    expect(throughTheDoor(king.at, true, doors)).toBe(king.at);
  });

  it('from the room a goal in the valley leads to the door out; a goal on her own side, straight to it', () => {
    expect(throughTheDoor(fox.at, true, doors)).toBe(doors.doorIn);
    expect(throughTheDoor(fox.at, false, doors)).toBe(fox.at);
  });

  it('the world leads every goal of its sparkles through the door', () => {
    const raw = Object.values(import.meta.glob('./index.ts', { query: '?raw', import: 'default', eager: true }))[0] as string;
    expect(raw).toMatch(/return at && throughTheDoor\(at, secrets\.inRoom\(\), secrets\);/);
  });
});
