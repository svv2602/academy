/**
 * The ground of the two secrets (./secrets.ts, ./terrain.ts): the room of the house is a flat floor walked inside its
 * walls, far beyond the valley; the glade lies inside the valley, short of its rim.
 */
import { describe, expect, it } from 'vitest';
import { GLADE, HOUSE, ROOM, WORLD_R } from './layout';
import { ROOM_CAMERA_REACH, height, inRoom, resolve } from './terrain';

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

  it('the room: the ground behind its walls is its floor as far as the camera behind her goes, not the hill out there', () => {
    // the camera of the room: 4.2 m from her (secrets.ts), she as far as 0.35 m from a wall
    const reach = ROOM.half - 0.35 + 4.2;
    expect(ROOM_CAMERA_REACH).toBeGreaterThan(reach - ROOM.half);
    for (const [sx, sz] of [[0, 1], [1, 1], [-1, 0], [1, -1]]) expect(height(ROOM.x + sx * reach, ROOM.z + sz * reach)).toBe(ROOM.y);
    // and the room still lies far beyond the valley: its widened floor too
    expect(Math.hypot(ROOM.x, ROOM.z) - ROOM.half - ROOM_CAMERA_REACH).toBeGreaterThan(WORLD_R + 40);
  });

  it('the room lies beyond the valley and its rim; the glade and the house inside it', () => {
    expect(Math.hypot(ROOM.x, ROOM.z) - ROOM.half).toBeGreaterThan(WORLD_R + 60);
    expect(inRoom(GLADE.x, GLADE.z)).toBe(false);
    expect(inRoom(HOUSE.x, HOUSE.z)).toBe(false);
    expect(Math.hypot(GLADE.x, GLADE.z) + GLADE.r + 3).toBeLessThan(WORLD_R - 4);
  });
});

describe('the camera on the glade', () => {
  it('2.4 m from her inside the ring, the usual distance from its edge on, a smooth step between with no jump', async () => {
    const { GLADE_CAM, GLADE_CAM_IN, GLADE_CAM_OUT, gladeCamDist } = await import('./secrets');
    const far = 5.2;
    expect(gladeCamDist(0, far)).toBe(GLADE_CAM);
    expect(gladeCamDist(GLADE_CAM_IN, far)).toBe(GLADE_CAM);
    expect(gladeCamDist(GLADE_CAM_OUT, far)).toBeCloseTo(far, 9);
    expect(gladeCamDist(GLADE_CAM_OUT + 3, far)).toBeCloseTo(far, 9);
    // the ring of rocks lies past the inner distance, the waterfall before the outer one
    expect(GLADE_CAM_IN).toBeLessThan(GLADE.r);
    expect(GLADE_CAM_OUT).toBeGreaterThan(GLADE.r + 1.4);
    // never a jump: at most 1.5 times the mean change per metre, and never back
    const most = (1.5 * (far - GLADE_CAM)) / (GLADE_CAM_OUT - GLADE_CAM_IN);
    for (let d = 0; d < 10; d += 0.05) {
      const dd = gladeCamDist(d + 0.05, far) - gladeCamDist(d, far);
      expect(dd).toBeGreaterThanOrEqual(-1e-12);
      expect(dd / 0.05).toBeLessThanOrEqual(most + 1e-9);
    }
  });
});

describe('out of the fairy\'s room', () => {
  it('she stands 2 m farther from the door than before, and the camera stands outside the house, the well off the line', async () => {
    const { exitPlace, DOOR_OUT, EXIT_OUT } = await import('./secrets');
    const { HOUSE } = await import('./layout');
    const o = exitPlace();
    expect(Math.hypot(o.at.x - HOUSE.x, o.at.z - HOUSE.z)).toBeCloseTo(DOOR_OUT + 0.8 + 2);   // 0.8 m out before
    expect(EXIT_OUT).toBeCloseTo(2.8);
    const yaw = o.facing + Math.PI + o.camTurn;
    for (const dist of [6.2, 8]) {   // a landscape window, a portrait one (src/core/tuning.ts camDistance)
      const back = dist * Math.cos(0.36), cam = { x: o.at.x + Math.sin(yaw) * back, z: o.at.z + Math.cos(yaw) * back };
      // the house model reaches 4.9 m from its middle at its corners (7.2 x 6.6 m): the camera is outside it
      expect(Math.hypot(cam.x - HOUSE.x, cam.z - HOUSE.z), `camera at ${dist} m`).toBeGreaterThan(5);
      // the line from the camera to her clears the house's walls (3.3 m) and the well (at -5, 7.5, 1.2 m round)
      for (let t = 0; t <= 1; t += 0.05) {
        const x = cam.x + (o.at.x - cam.x) * t, z = cam.z + (o.at.z - cam.z) * t;
        expect(Math.hypot(x - HOUSE.x, z - HOUSE.z)).toBeGreaterThan(3.3);
        expect(Math.hypot(x + 5, z - 7.5)).toBeGreaterThan(1.6);
      }
    }
  });
});
