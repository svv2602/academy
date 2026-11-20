// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, worldState } from '../core/save';
import { GRAVITY, tuning } from '../core/tuning';
import { WORLDS } from '../worlds';
import { createCollections, type CollectHost } from './collect-items';
import {
  CHASE, COLLECT_KINDS, COLLECT_WAYS, HANDS, HOP_LIFT, SET_SIZE, STAND, TAKE_R, collectProblems, foundOf, handsAt, itemsOf,
  jumpApex, kindsOf, reaches, setDone, type CollectDef, type CollectItem,
} from './collections';
import { HERO_TOP } from './hero';
import { groundUnder, jumpStep } from './player';
import { EFFECT_TUNING, SCALE } from './supplies';

vi.mock('../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: vi.fn() }));
vi.mock('./fx', () => ({ glowTex: null, Sparks: class {} }));

/** Her reach in a jump: the top of the jump, her size and the speed upwards she jumps with. */
const top = (v: number, scale = 1) => handsAt(jumpApex(v, GRAVITY), scale);
const NORMAL = tuning.jump, POTION = tuning.jump * EFFECT_TUNING.jump!.jump!;

describe('how high she reaches (PLAY-25, the physics of src/game/player.ts)', () => {
  it('a jump rises 1.2 m, with the jumping potion twice that', () => {
    expect(jumpApex(NORMAL, GRAVITY)).toBeCloseTo(1.2, 1);
    expect(jumpApex(POTION, GRAVITY) / jumpApex(NORMAL, GRAVITY)).toBeCloseTo(2, 5);
  });

  it('the heights of the ways: standing < "jump" <= a jump < a giant\'s jump < "potion" <= a jump with the potion', () => {
    const fairy = WORLDS.find((w) => w.id === 'fairy')!.collect!;
    const high = (way: string) => fairy.items.filter((i) => i.way === way).map((i) => i.y);
    const standing = handsAt(0, 1), giantJump = top(NORMAL, SCALE.giant), potionJump = top(POTION);
    for (const y of high('jump')) { expect(y).toBeGreaterThan(standing); expect(y).toBeLessThanOrEqual(top(NORMAL)); }
    for (const y of high('potion')) {
      expect(y).toBeGreaterThan(giantJump);     // the decision of 2026-11-20: a giant with a plain jump does not reach it
      expect(y).toBeGreaterThan(top(NORMAL));
      expect(y).toBeLessThanOrEqual(potionJump);
    }
    expect(high('potion').length).toBeGreaterThanOrEqual(2);
    expect(high('potion').length).toBeLessThanOrEqual(3);
  });

  it('the top of a jump as the frame plays it is the same at 20 and at 60 frames a second', () => {
    for (const v of [NORMAL, POTION]) for (const dt of [0.05, 1 / 60, 1 / 120]) {
      let y = 0, vy = v, max = 0;
      while (vy > -v) { [y, vy] = jumpStep(y, vy, dt); max = Math.max(max, y); }
      expect(max, `${v} m/s, ${dt} s`).toBeGreaterThan(jumpApex(v, GRAVITY) - 0.01);
      expect(max).toBeLessThanOrEqual(jumpApex(v, GRAVITY) + 1e-9);
    }
  });

  it('reaches: across TAKE_R, from her feet to her hands; a touch is never walked into; on a support only from up there', () => {
    const at = new THREE.Vector3(0, 2.5, 0.5);
    expect(reaches('jump', at, { x: 0, y: 0, z: 0 }, 1)).toBe(false);                       // standing: her hands at 1.83
    expect(reaches('jump', at, { x: 0, y: 0.7, z: 0 }, 1)).toBe(true);                     // up in a jump
    expect(reaches('jump', at, { x: TAKE_R + 0.6, y: 0.7, z: 0.5 }, 1)).toBe(false);       // too far across
    expect(handsAt(0, 1)).toBeCloseTo(HERO_TOP + HANDS);
    expect(reaches('tap', new THREE.Vector3(0, 0.1, 0), { x: 0, y: 0, z: 0 }, 1)).toBe(false);
    const onStump = new THREE.Vector3(0, 0.7 + HOP_LIFT, 0);
    expect(reaches('hop', onStump, { x: 0.3, y: 0, z: 0 }, 1)).toBe(false);                 // by its side, on the ground
    expect(reaches('hop', onStump, { x: 0.3, y: 0.7 - STAND, z: 0 }, 1)).toBe(true);        // up there
    expect(reaches('run', new THREE.Vector3(0, 0.12, 0), { x: 0.9, y: 0, z: 0 }, 1)).toBe(true);
  });
});

describe('the rule of the collections (src/game/collections.ts)', () => {
  const def: CollectDef = { items: [...Array.from({ length: SET_SIZE }, (_, i): CollectItem => ({ kind: 'acorn', way: 'run', x: i, z: 0, y: 0 })),
    ...Array.from({ length: SET_SIZE }, (_, i): CollectItem => ({ kind: 'feather', way: 'tap', x: i, z: 5, y: 0 }))] };

  it('sets of six, of the known kinds and the six ways', () => {
    expect(collectProblems(def)).toEqual([]);
    expect(collectProblems({ items: def.items.slice(1) })).toEqual(['the set "acorn" has 5 finds, not 6']);
    expect(collectProblems({ items: [{ ...def.items[0], kind: 'shell' as never, way: 'bend' as never }] }).length).toBe(3);
    expect(COLLECT_WAYS).toEqual(['run', 'jump', 'potion', 'hop', 'tap', 'chase']);
    expect(kindsOf(def)).toEqual(['acorn', 'feather']);
    expect(itemsOf(def, 'feather')).toEqual([6, 7, 8, 9, 10, 11]);
    expect(setDone(def, 'acorn', [0, 1, 2, 3, 4])).toBe(false);
    expect(setDone(def, 'acorn', [5, 4, 3, 2, 1, 0, 9])).toBe(true);
  });

  it('what is found is kept in the world\'s part of the save, a broken field mended to none', () => {
    const ws = worldState(defaultSave(), 'fairy');
    expect(foundOf(ws)).toEqual([]);
    ws.found = [1, 'x' as never]; expect(foundOf(ws)).toEqual([]);
    ws.found = 3 as never; expect(foundOf(ws)).toEqual([]);
  });

  it('every world that lays out finds lays them out right', () => {
    for (const w of WORLDS) if (w.collect) expect(collectProblems(w.collect), w.id).toEqual([]);
    const fairy = WORLDS.find((w) => w.id === 'fairy')!.collect!;
    expect(kindsOf(fairy).sort()).toEqual(Object.keys(COLLECT_KINDS).sort());
    // every way, the catching ones one or two in a world (the decision of 2026-11-20)
    for (const way of COLLECT_WAYS) expect(fairy.items.some((i) => i.way === way), way).toBe(true);
    const chase = fairy.items.filter((i) => i.way === 'chase').length;
    expect(chase).toBeGreaterThanOrEqual(1); expect(chase).toBeLessThanOrEqual(2);
  });
});

describe('the ground under her (src/game/player.ts groundUnder)', () => {
  it('a world without supports is its relief alone, as always', () => {
    expect(groundUnder({}, 1.5, 0, 0, 3)).toBe(1.5);
    expect(groundUnder({ support: () => null }, 1.5, 0, 0, 3)).toBe(1.5);
    expect(groundUnder({ support: () => 2.3 }, 1.5, 0, 0, 3)).toBe(2.3);
    expect(groundUnder({ support: () => 1 }, 1.5, 0, 0, 3)).toBe(1.5);     // a support under the relief changes nothing
  });
});

/** A game of the tests: the world `def`, the heroine at the origin. */
function host(def: CollectDef | undefined) {
  const save = defaultSave(), ws = worldState(save, 'fairy'), lines: string[] = [];
  const g = {
    scene: new THREE.Scene(), ws, world: { id: 'fairy', collect: def }, ground: {}, groundY: () => 0,
    hero: { root: new THREE.Object3D() }, sparks: { burst: vi.fn() },
    speech: { line: async (k: string) => { lines.push(k); } },
    addStars: vi.fn(), above: (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy), persist: vi.fn(),
  };
  g.hero.root.position.set(100, 0, 100);          // away from every find
  return { g: g as unknown as CollectHost & typeof g, ws, lines };
}

describe('the finds in the world (src/game/collect-items.ts)', () => {
  const def: CollectDef = { items: [
    ...Array.from({ length: SET_SIZE }, (_, i): CollectItem => ({ kind: 'mushroom', way: 'run', x: i * 10, z: 0, y: 0.12 })),
    { kind: 'acorn', way: 'jump', x: 0, z: 30, y: 2.5 }, { kind: 'acorn', way: 'potion', x: 10, z: 30, y: 4.1 },
    { kind: 'acorn', way: 'tap', x: 20, z: 30, y: 0.1 }, { kind: 'acorn', way: 'chase', x: 30, z: 30, y: 1.2 },
    { kind: 'acorn', way: 'run', x: 40, z: 30, y: 0.1, flock: 1 }, { kind: 'acorn', way: 'run', x: 41.8, z: 30, y: 0.1, flock: 1 },
  ] };
  const meshes = (s: THREE.Scene) => s.children.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
  const at = (h: ReturnType<typeof host>, x: number, y: number, z: number) => h.g.hero.root.position.set(x, y, z);

  it('one mesh a kind, the same at every entry whatever is found; none in a world without; all out when left', () => {
    const h = host(def), c = createCollections(h.g);
    expect(meshes(h.g.scene).map((m) => m.name).sort()).toEqual(['collect-acorn', 'collect-mushroom']);
    expect(c.items).toHaveLength(12); expect(c.unfound()).toHaveLength(12);
    c.dispose();
    expect(h.g.scene.children).toHaveLength(0);
    h.ws.found = [0, 1, 2, 3, 4, 5];
    const again = createCollections(h.g);
    expect(meshes(h.g.scene).map((m) => m.count)).toEqual([6, 6]);
    expect(again.unfound()).toHaveLength(6);
    expect(createCollections(host(undefined).g).items).toHaveLength(0);
  });

  it('walked into: a star, kept; a whole set five more and the cat says so; the first of a kind - its own line', () => {
    const h = host(def), c = createCollections(h.g);
    c.update(0.016, 0, true);
    expect(h.g.addStars).not.toHaveBeenCalled();
    at(h, 0.5, 0, 0); c.update(0.016, 0, false);
    expect(h.ws.found ?? []).toEqual([]);               // not while she cannot move
    c.update(0.016, 0, true);
    expect(h.ws.found).toEqual([0]);
    expect(h.g.addStars).toHaveBeenLastCalledWith(1, expect.anything());
    expect(h.lines).toEqual(['collect_first']);
    for (let i = 1; i < SET_SIZE; i++) { at(h, i * 10, 0, 0); c.update(0.016, 0, true); }
    expect(h.ws.found).toEqual([0, 1, 2, 3, 4, 5]);
    expect(h.g.addStars.mock.calls.map((a) => a[0])).toEqual([1, 1, 1, 1, 1, 1, 5]);
    expect(h.lines).toEqual(['collect_first', 'collect_set']);
    expect(h.g.persist).toHaveBeenCalled();
    c.update(0.016, 0, true);
    expect(h.g.addStars).toHaveBeenCalledTimes(7);       // nothing twice
  });

  it('a jump for a acorn a jump high, the potion\'s for one higher; a touch for the one to touch', () => {
    const h = host(def), c = createCollections(h.g);
    at(h, 0, 0, 30); c.update(0.016, 0, true); expect(h.ws.found ?? []).toEqual([]);
    at(h, 0, 0.8, 30); c.update(0.016, 0, true); expect(h.ws.found).toEqual([6]);
    at(h, 10, jumpApex(NORMAL, GRAVITY), 30); c.update(0.016, 0, true); expect(h.ws.found).toEqual([6]);
    at(h, 10, jumpApex(POTION, GRAVITY), 30); c.update(0.016, 0, true); expect(h.ws.found).toEqual([6, 7]);
    at(h, 20, 0, 30); c.update(0.016, 0, true); expect(h.ws.found).toEqual([6, 7]);     // walked into: no
    expect(c.tap(() => 200)).toBe(false);                                               // a touch far from it on the screen
    at(h, 20, 0, 30 + 7); expect(c.tap(() => 10)).toBe(false);                          // farther than TAP_R from her
    at(h, 20, 0, 30 + 4); expect(c.tap(() => 10)).toBe(true);
    expect(h.ws.found).toEqual([6, 7, 8]);
  });

  it('the butterfly to catch flies off round its place while she is near; caught - taken', () => {
    const h = host(def), c = createCollections(h.g), b = c.items[9];
    at(h, 100, 0, 100); c.update(1, 0, true);
    const slow = b.pos.clone();
    c.update(1, 0, true);
    const lazy = slow.distanceTo(b.pos);
    expect(b.pos.distanceTo(new THREE.Vector3(30, b.pos.y, 30))).toBeCloseTo(CHASE.ring, 5);
    expect(lazy).toBeLessThan(1);
    // near her it flies at CHASE.speed: a second is CHASE.speed m round the ring (a chord a little shorter)
    at(h, b.pos.x, 0, b.pos.z + 3);
    const before = b.pos.clone(); c.update(1, 0, true);
    expect(before.distanceTo(b.pos)).toBeGreaterThan(CHASE.speed * 0.9);
    expect(CHASE.speed).toBeLessThan(tuning.speed);                 // she runs faster: it can be caught
    at(h, b.pos.x, 0, b.pos.z); c.update(0.001, 0, true);
    expect(h.ws.found).toContain(9);
  });

  it('one of a flock taken, the other flies up for a moment and settles back within reach', () => {
    const h = host(def), c = createCollections(h.g), [a, b] = [c.items[10], c.items[11]];
    at(h, a.x, 0, a.z); c.update(0.016, 0, true);
    expect(a.taken).toBe(true); expect(b.taken).toBe(false);
    const y0 = b.home.y;
    at(h, 100, 0, 100); c.update(0.5, 0, true);
    expect(b.pos.y).toBeGreaterThan(y0 + 0.5);
    for (let i = 0; i < 10; i++) c.update(0.5, 0, true);
    expect(b.pos.y).toBeLessThan(y0 + 0.1);
  });
});
