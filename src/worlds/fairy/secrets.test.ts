/**
 * The ground of the two secrets (./secrets.ts, ./terrain.ts): the room of the house is a flat floor walked inside its
 * walls, far beyond the valley; the glade lies inside the valley, short of its rim.
 */
import { describe, expect, it } from 'vitest';
import { GLADE, HOUSE, ROOM, WORLD_R } from './layout';
import { height, inRoom, resolve } from './terrain';

describe('the ground of the secrets', () => {
  it('the room: its floor is flat, a walker is held inside its walls, not pulled back to the valley', () => {
    for (const [dx, dz] of [[0, 0], [3, -3], [-4, 4]]) expect(height(ROOM.x + dx, ROOM.z + dz)).toBe(ROOM.y);
    const p = { x: ROOM.x + ROOM.half + 1, z: ROOM.z - ROOM.half - 1 };
    resolve(p, 0.35);
    expect(p).toEqual({ x: ROOM.x + ROOM.half - 0.35, z: ROOM.z - (ROOM.half - 0.35) });
    const mid = { x: ROOM.x + 1, z: ROOM.z + 1 };
    resolve(mid, 0.35);
    expect(mid).toEqual({ x: ROOM.x + 1, z: ROOM.z + 1 });
  });

  it('the room lies beyond the valley and its rim; the glade and the house inside it', () => {
    expect(Math.hypot(ROOM.x, ROOM.z) - ROOM.half).toBeGreaterThan(WORLD_R + 60);
    expect(inRoom(GLADE.x, GLADE.z)).toBe(false);
    expect(inRoom(HOUSE.x, HOUSE.z)).toBe(false);
    expect(Math.hypot(GLADE.x, GLADE.z) + GLADE.r + 3).toBeLessThan(WORLD_R - 4);
  });
});
