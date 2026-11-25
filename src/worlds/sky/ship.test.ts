// @vitest-environment happy-dom
/**
 * Veterok's route of the winds and the airship's flight (./ship.ts, WORLD-23, WORLD-05): the way starts at the pier's
 * mooring and ends at the islet's, never lower than the decks, 20-40 s long (docs/worlds/world-5.md); the route changes
 * no skill; once made the ship flies her to the islet at once and the step is done when it lands; a flight left in the
 * air opens on the island it flew to.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, defaultWorld } from '../../core/save';
import type { Spoken } from '../../core/audio';
import type { Game } from '../../game/context';
import { createWorldScope } from '../../game/scope';
import type { TaskResult } from '../../game/taskviews/panel';
import type { Npc } from '../../game/world';
import type { WorldTaskShow } from '../../game/worldtasks/core';
import { keep } from '../../game/worldtasks/kept';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { addStrings } from '../../ui/strings';
import { ISLANDS, ISLET_GANGWAY, SHIP, SHIP_FAR } from './layout';
import { FLIGHT_KEPT, createWinds, flightCurve, flightSeconds } from './ship';
import { strings } from './strings';

vi.mock('../../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: () => {} }));
addStrings(strings, false);
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('the airship\'s way (WORLD-05)', () => {
  it('from the pier\'s mooring to the islet\'s, never lower than the decks, 20-40 s at its speed; back the same way', () => {
    const out = flightCurve(true), back = flightCurve(false);
    expect(out.getPointAt(0).distanceTo(new THREE.Vector3(SHIP.x, out.getPointAt(0).y, SHIP.z))).toBeLessThan(1e-6);
    expect(out.getPointAt(1).distanceTo(new THREE.Vector3(SHIP_FAR.x, out.getPointAt(1).y, SHIP_FAR.z))).toBeLessThan(1e-6);
    expect(back.getPointAt(0).distanceTo(out.getPointAt(1))).toBeLessThan(1e-6);
    const low = Math.min(ISLANDS.pier.top, ISLANDS.far.top) - 1.4;
    for (let u = 0; u <= 1; u += 0.01) expect(out.getPointAt(u).y).toBeGreaterThanOrEqual(low - 1e-6);
    expect(flightSeconds()).toBeGreaterThanOrEqual(20);
    expect(flightSeconds()).toBeLessThanOrEqual(40);
  });
});

function game(ws = defaultWorld(), save = defaultSave()) {
  const quick = () => Promise.resolve() as Spoken;
  let seed = 5;
  const g = {
    scene: new THREE.Scene(), hero: { root: new THREE.Object3D(), heading: 0 }, cat: { root: new THREE.Object3D() }, ws, save, busy: false, camTask: null,
    rng: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), persist: () => {}, touch: true,
    speech: { caption: () => {}, shown: null, line: () => quick() },
    hooksFor: () => ({ prompt: () => {}, number: () => {}, good: () => {}, wrong: quick, hint: quick }),
    task: (open: () => Promise<TaskResult>) => open(),
  };
  let open: WorldTaskShow | null = null;
  const player = {
    play: (show: WorldTaskShow) => { open = show; return show.done.finally(() => { open = null; }); },
    get open() { return open; }, tap: () => false, update: (t: number) => open?.update(t),
  } as WorldTaskPlayer;
  return { g: g as unknown as Game, player, ws, save, get open() { return open; } };
}
const veterok = { def: { id: 'veterok' } } as Npc;
const frames = (step: ReturnType<typeof createWinds>, t0: number, s: number) => { let t = t0; for (; t <= t0 + s; t += 1 / 30) step.update(1 / 30, t, true); return t; };

describe('the route of the winds as Veterok\'s step (WORLD-23)', () => {
  it('made, it changes no skill and the step is done; the ship flies her to the islet at once', async () => {
    const t = game(), ship = new THREE.Object3D(), step = createWinds(t.g, t.player, createWorldScope(new THREE.Scene()), ship);
    let done = false;
    step.start!(veterok, () => { done = true; });
    const before = JSON.stringify(t.save.skills);
    expect(step.cheat()).toBe(true);
    let time = frames(step, 0, 0.2);
    expect(t.open?.kind).toBe('winds');
    t.open!.solve();
    for (let k = 0; k < 400 && t.open; k++) { t.open.update(time += 0.05); await vi.advanceTimersByTimeAsync(50); }
    await vi.runAllTimersAsync();
    expect(step.flying).toBe(true);
    expect(done).toBe(true);
    expect(JSON.stringify(t.save.skills)).toBe(before);
    // the flight: never skipped; tapped, twice as fast
    expect(step.tap()).toBe(true);
    for (let k = 0; k < 3000 && step.flying; k++) step.update(1 / 30, time += 1 / 30, false);
    await vi.runAllTimersAsync();
    expect(step.flying).toBe(false);
    expect(step.far).toBe(true);
    expect(done).toBe(true);
    expect(t.g.hero.root.position.distanceTo(new THREE.Vector3(ISLET_GANGWAY.x, t.g.hero.root.position.y, ISLET_GANGWAY.z))).toBeLessThan(1e-6);
    expect(JSON.stringify(t.save.skills)).toBe(before);
    // from now on the gangways fly her: the islet's back to the pier
    expect(step.spots.map((s) => s.on())).toEqual([false, true]);
  });

  it('a flight left in the air opens on the island it flew to', () => {
    const t = game();
    t.ws.flags.ship_flies = true;
    keep(t.ws, FLIGHT_KEPT, [1]);
    const step = createWinds(t.g, t.player, createWorldScope(new THREE.Scene()), new THREE.Object3D());
    expect(step.far).toBe(true);
    expect(step.flying).toBe(false);
    const p = t.g.hero.root.position;
    expect(Math.hypot(p.x - ISLET_GANGWAY.x, p.z - ISLET_GANGWAY.z)).toBeLessThan(1e-6);
  });
});
