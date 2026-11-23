// @vitest-environment happy-dom
/**
 * The creatures of the Sweet Land that belong to no task (./creatures.ts; PLAY-11, PLAY-12): four kinds, each does both
 * of its actions, a tap starts its own reaction and it goes back to what it did, they live on the land - off the river,
 * the colliders and the tasks -, the magic brings the caramel butterflies (the game's flock, one set of them) and the
 * bears' bounce, a held one keeps still; three light instanced meshes and the leaves.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Butterflies } from '../../game/butterflies';
import { createWorldScope } from '../../game/scope';
import {
  BEAR_ROAM, LEAF_ROAM, LEAF_TOP, LEAF_UNDER, REACTION_TIME, SWEET_ACTIONS, SWEET_CALM, SWEET_REACTION,
  bearGeometry, birdGeometry, createSweetCreatures, createSweetHerd, freeSpot, ladybugGeometry, leafGeometry, sweetHabitat, type SweetHabitat, type SweetKind,
} from './creatures';
import { FRIENDS } from './index';
import { RIVER_HALF, ZONES } from './layout';
import { BUTTERFLIES, BUTTERFLIES_RUBY } from './magic';
import { buildScenery, placeSweets, townHouses } from './scenery';
import { colliders, riverDist, type Collider } from './terrain';

vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

const KINDS: SweetKind[] = ['bear', 'butterfly', 'bird', 'ladybug'];
const run = (herd: ReturnType<typeof createSweetHerd>, s: number, each?: () => void) => { for (let t = 0; t < s; t += 0.05) { herd.update(0.05); each?.(); } };

describe('the creatures of the Sweet Land (PLAY-11, PLAY-12)', () => {
  // the land as ./index.ts builds it before the creatures: its scenery's colliders, the characters' blocks
  let hab: SweetHabitat, blocked: Collider[];
  beforeAll(() => {
    colliders.length = 0;
    buildScenery(new THREE.Scene());
    for (const f of FRIENDS) colliders.push({ x: f.x, z: f.z, r: 0.8 });
    blocked = [...colliders];
    hab = sweetHabitat(blocked);
  });
  afterAll(() => { colliders.length = 0; });

  it('four kinds, each in its numbers: three pairs of bears, the caramel butterflies the magic brings, birds, ladybugs on their leaves', () => {
    const herd = createSweetHerd(hab);
    const n = (k: SweetKind) => herd.all.filter((c) => c.kind === k).length;
    expect(hab.bears.length).toBe(3);
    expect(n('bear')).toBe(6);
    expect(n('butterfly')).toBe(BUTTERFLIES + BUTTERFLIES_RUBY);
    expect(n('bird')).toBe(4);
    expect(hab.roofs.length).toBeGreaterThanOrEqual(3);
    expect(hab.leaves.length).toBe(6);
    expect(n('ladybug')).toBe(hab.leaves.length);
  });

  it('every kind does both its actions', () => {
    const herd = createSweetHerd(hab), seen = new Map<SweetKind, Set<string>>(KINDS.map((k) => [k, new Set()]));
    run(herd, 90, () => { for (const c of herd.all) seen.get(c.kind)!.add(c.state); });
    for (const k of KINDS) for (const a of SWEET_ACTIONS[k]) expect(seen.get(k)!.has(a), `${k} ${a}`).toBe(true);
  });

  it('a tap starts the kind\'s own reaction, four different ones, and it goes back to its life after it', () => {
    const reactions = new Set<string>();
    for (const k of KINDS) {
      const herd = createSweetHerd(hab);
      run(herd, 1);
      const target = herd.all.find((c) => c.kind === k)!;
      const hit = herd.tap((c) => (c === target ? 1 : 999), 50);
      expect(hit, k).toBe(target);
      expect(target.state, k).toBe(SWEET_REACTION[k]);
      expect(SWEET_ACTIONS[k] as readonly string[]).not.toContain(target.state);
      expect(target.taps).toBe(1);
      reactions.add(target.state);
      run(herd, REACTION_TIME[k] + 0.2);
      expect(SWEET_ACTIONS[k] as readonly string[], k).toContain(target.state);
    }
    expect(reactions.size).toBe(4);
  });

  it('a tap far from all of them hits none', () => {
    const herd = createSweetHerd(hab);
    expect(herd.tap(() => 500, 70)).toBeNull();
  });

  it('they are placed on the land: the bears and the leaves off the river and clear of every collider, the characters and the tasks; the butterflies land on lollipops and candies, the birds sit on roofs', () => {
    for (const p of [...hab.bears, ...hab.leaves]) {
      expect(riverDist(p.x, p.z)).toBeGreaterThan(RIVER_HALF + 1);
      for (const c of blocked) expect(Math.hypot(c.x - p.x, c.z - p.z), `${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBeGreaterThan(c.r);
      expect(p.y).toBeCloseTo(hab.ground(p.x, p.z), 6);
    }
    for (const p of hab.bears) expect(freeSpot(p.x, p.z, BEAR_ROAM, blocked)).toBe(true);
    // a pair of bears in each of its zones: the market, the garden, the square
    for (const [i, z] of [ZONES.market, ZONES.garden, ZONES.square].entries()) expect(Math.hypot(hab.bears[i].x - z.x, hab.bears[i].z - z.z)).toBeLessThan(12);
    const sweets = placeSweets();
    // every perch is over a lollipop of the garden or a candy (all of them have colliders), high over the ground
    for (const p of hab.perches) {
      expect(blocked.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 1e-6), `${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(true);
      expect(p.y - hab.ground(p.x, p.z)).toBeGreaterThan(0.5);
    }
    expect(hab.perches.length).toBeGreaterThan(sweets.candies.length);
    for (const b of hab.butterflies) { expect(b.near.length).toBeGreaterThanOrEqual(1); expect(b.near.length).toBeLessThanOrEqual(3); }
    const houses = townHouses();
    for (const r of hab.roofs.slice(0, houses.length)) expect(houses.some((h) => h.x === r.x && h.z === r.z)).toBe(true);
  });

  it('they stay where they live: the bears on the ground by their middle, the butterflies over their zone or on their lollipop, the birds on their roofs or over them, the ladybugs on their leaf or under it', () => {
    const herd = createSweetHerd(hab), wrong: string[] = [];
    const want = (ok: boolean, what: string) => { if (!ok && wrong.length < 5) wrong.push(what); };
    const flights = herd.all.filter((c) => c.kind === 'butterfly');
    run(herd, 60, () => {
      for (const c of herd.all) {
        const off = Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z), floor = hab.ground(c.pos.x, c.pos.z), at = `${c.kind} ${c.state}`;
        if (c.kind === 'bear') want(off < BEAR_ROAM + 0.05 && c.pos.y >= floor - 1e-6 && c.pos.y < floor + 0.35, `${at}: ${off.toFixed(2)} m from home, ${(c.pos.y - floor).toFixed(2)} m over the ground`);
        if (c.kind === 'butterfly') {
          const b = hab.butterflies[flights.indexOf(c)], far = Math.max(...b.near.map((j) => Math.hypot(hab.perches[j].x - c.home.x, hab.perches[j].z - c.home.z)));
          want(off < Math.max(b.r * 1.5, far) + 1 && c.pos.y > floor + 0.3, `${at}: ${off.toFixed(2)} m from home, ${(c.pos.y - floor).toFixed(2)} m over the ground`);
        }
        if (c.kind === 'bird') {
          const roof = Math.min(...hab.roofs.map((r) => Math.hypot(r.x - c.pos.x, r.z - c.pos.z)));
          want((c.state === 'fly' || roof < 0.4) && c.pos.y > floor + 2, `${at}: ${roof.toFixed(2)} m from a roof, ${(c.pos.y - floor).toFixed(2)} m over the ground`);
        }
        if (c.kind === 'ladybug') {
          const leaf = hab.leaves[c.spot], d = Math.hypot(c.pos.x - leaf.x, c.pos.z - leaf.z);
          want(d < LEAF_ROAM + 1e-6 && c.pos.y >= leaf.y - LEAF_UNDER - 1e-6 && c.pos.y <= leaf.y + LEAF_TOP + 1e-6, `${at}: ${d.toFixed(2)} m from its leaf, ${(c.pos.y - leaf.y).toFixed(2)} m over it`);
        }
      }
    });
    expect(wrong).toEqual([]);
  });

  it('the magic brings the butterflies: with none none is shown nor tapped, a fraction grows the last one; the bears hop higher', () => {
    const herd = createSweetHerd(hab), flights = herd.all.filter((c) => c.kind === 'butterfly');
    herd.share(0, 0);
    expect(flights.every((f) => !f.shown && f.grow === 0)).toBe(true);
    expect(herd.tap((c) => (c === flights[0] ? 1 : 999), 50)).toBeNull();
    herd.share(2.5, 0.5);
    expect(flights.map((f) => f.grow).slice(0, 4)).toEqual([1, 1, 0.5, 0]);
    expect(flights.filter((f) => f.shown).length).toBe(3);
    herd.share(BUTTERFLIES + BUTTERFLIES_RUBY, 1);
    expect(flights.every((f) => f.shown)).toBe(true);
    const highest = (k: number) => {
      const h = createSweetHerd(hab); h.share(0, k);
      let top = 0;
      run(h, 20, () => { for (const c of h.all) if (c.kind === 'bear' && c.state === 'hop') top = Math.max(top, c.pos.y - hab.ground(c.pos.x, c.pos.z)); });
      return top;
    };
    expect(highest(1)).toBeGreaterThan(highest(0) * 1.3);
  });

  it('a held creature keeps still in its calm action until a tap, then reacts and comes back to the point', () => {
    for (const k of KINDS) {
      const herd = createSweetHerd(hab), c = herd.all.find((x) => x.kind === k)!, at = c.pos.clone().add(new THREE.Vector3(0.3, 0.2, 0));
      herd.hold(c, at);
      run(herd, 5);
      expect(c.pos.distanceTo(at), k).toBeLessThan(1e-6);
      expect(c.state, k).toBe(SWEET_CALM[k]);
      herd.tap((x) => (x === c ? 1 : 999), 50);
      expect(c.state, k).toBe(SWEET_REACTION[k]);
      run(herd, REACTION_TIME[k] + 0.3);
      expect(c.state, k).toBe(SWEET_CALM[k]);
      expect(c.pos.distanceTo(at), k).toBeLessThan(1e-6);
    }
  });

  it('each shape is light and carries what its shader moves', () => {
    const limits: [THREE.BufferGeometry, number][] = [[bearGeometry(), 260], [birdGeometry(), 110], [ladybugGeometry(), 220], [leafGeometry(), 100]];
    for (const [g, max] of limits) {
      expect(g.getAttribute('position').count / 3).toBeLessThanOrEqual(max);
      for (const a of ['color', 'part', 'normal']) expect(g.getAttribute(a), a).toBeTruthy();
    }
    // the moving parts are marked: the bear's arms, the bird's wings, the ladybug's shell
    const parts = (g: THREE.BufferGeometry) => new Set(Array.from(g.getAttribute('part').array as Float32Array));
    for (const g of [bearGeometry(), birdGeometry(), ladybugGeometry()]) expect([...parts(g)].sort()).toEqual([0, 1]);
  });

  it('the world draws three kinds and the leaves as instanced meshes casting no shadow, and moves the game\'s flock as the caramel butterflies', () => {
    const scene = new THREE.Scene(), flies = new Butterflies(scene, 96, () => 0), scope = createWorldScope(scene);
    const g = { scene, flies, sparks: { burst: () => {} }, busy: false, started: () => true, touch: true } as unknown as Parameters<typeof createSweetCreatures>[0];
    const cr = createSweetCreatures(g, scope, hab);
    expect(cr.meshes.map((m) => m.name).sort()).toEqual(['sweet-bear', 'sweet-bird', 'sweet-ladybug', 'sweet-leaves']);
    for (const m of cr.meshes) { expect(m.castShadow).toBe(false); expect(m.parent).toBe(scene); }
    // one set of butterflies: the flock's, landed (the herd flies them), hidden with no magic
    expect(flies.flies.length).toBe(BUTTERFLIES + BUTTERFLIES_RUBY);
    expect(flies.flies.every((f) => f.landed && f.scale === 0)).toBe(true);
    expect(flies.mesh.visible).toBe(false);
    cr.life(1, BUTTERFLIES);
    expect(flies.mesh.visible).toBe(true);
    expect(flies.flies.filter((f) => f.scale > 0).length).toBe(BUTTERFLIES);
    for (let i = 0; i < 40; i++) cr.update(0.05);
    const bfs = cr.herd.all.filter((c) => c.kind === 'butterfly');
    flies.flies.forEach((f, i) => expect(f.pos.distanceTo(bfs[i].pos)).toBeLessThan(1e-6));
    // a tap on one: the middle of its body is what is measured
    expect(cr.tap((p) => p.distanceTo(bfs[0].pos))).toBe(true);
    expect(bfs[0].state).toBe('swirl');
    scope.dispose();
    expect(flies.mesh.visible).toBe(true);
    expect(cr.meshes.every((m) => m.parent === null)).toBe(true);
  });
});
