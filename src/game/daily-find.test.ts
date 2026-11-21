/** The find of the day (./daily-find.ts, PLAY-26): one a day per world, into the stash alone. */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, worldState } from '../core/save';
import { COLLECT, DAILY_PLACES } from '../worlds/fairy/collect';
import { createDaily, dailyOf, dailyState, dayNumber } from './daily-find';

vi.mock('../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: vi.fn() }));

const WORLD = { id: 'fairy', collect: COLLECT, daily: { places: DAILY_PLACES } };

describe('what lies out on a day', () => {
  it('a world without places or without collections: nothing', () => {
    expect(dailyOf({ collect: COLLECT }, {}, '2026-11-21')).toBeNull();
    expect(dailyOf({ daily: { places: DAILY_PLACES } }, {}, '2026-11-21')).toBeNull();
  });

  it('one of its kinds at one of its places; another the next day; none once taken that day', () => {
    const a = dailyOf(WORLD, {}, '2026-11-21')!, b = dailyOf(WORLD, {}, '2026-11-22')!;
    expect(DAILY_PLACES).toContainEqual({ x: a.x, z: a.z });
    expect(['butterfly', 'acorn', 'mushroom', 'feather']).toContain(a.kind);
    expect(a.kind === b.kind && a.x === b.x && a.z === b.z).toBe(false);
    expect(dailyOf(WORLD, { daily: '2026-11-21' }, '2026-11-21')).toBeNull();
    expect(dailyOf(WORLD, { daily: '2026-11-21' }, '2026-11-22')).toEqual(b);
  });

  it('over a fortnight every place and every kind comes out', () => {
    const days = Array.from({ length: 16 }, (_, i) => dailyOf(WORLD, {}, new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10))!);
    expect(new Set(days.map((d) => `${d.x},${d.z}`)).size).toBe(DAILY_PLACES.length);
    expect(new Set(days.map((d) => d.kind)).size).toBe(4);
    expect(dayNumber('2026-01-02')).toBe(1);
  });
});

describe('in the scene', () => {
  function host() {
    const save = defaultSave(), ws = worldState(save, 'fairy');
    const g = {
      scene: new THREE.Scene(), save, ws, world: WORLD, groundY: () => 0,
      hero: { root: new THREE.Object3D() }, sparks: { burst: vi.fn() }, persist: vi.fn(),
    };
    return g;
  }
  const shape = () => new THREE.BoxGeometry(0.2, 0.2, 0.2);

  it('walked into while she is free: one into the stash, the day kept, nothing in the book; gone till tomorrow', () => {
    dailyState.day = '2026-11-21';
    const g = host(), d = createDaily(g as never, shape, () => 2, () => new THREE.MeshBasicMaterial());
    d.update(0.016, 0, true);
    const at = d.at()!;
    expect(at).not.toBeNull();
    g.hero.root.position.set(at.x, 0, at.z);
    d.update(0.016, 0, false);
    expect(g.save.stash).toBeUndefined();              // not while a scene holds her
    d.update(0.016, 0, true);
    expect(g.save.stash).toEqual({ [at.kind]: 1 });
    expect(g.ws.daily).toBe('2026-11-21');
    expect(g.ws.found).toBeUndefined();
    expect(d.at()).toBeNull();
    expect(g.scene.getObjectByName('daily-find')).toBeUndefined();
    d.update(0.016, 0, true);
    expect(g.save.stash).toEqual({ [at.kind]: 1 });
    dailyState.day = '2026-11-22';
    d.update(0.016, 0, true);
    expect(d.at()).not.toBeNull();
    d.dispose();
    expect(g.scene.children).toHaveLength(0);
    dailyState.day = null;
  });
});
