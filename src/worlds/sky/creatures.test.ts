// @vitest-environment happy-dom
/**
 * The creatures of the Sky Islands that belong to no task (./creatures.ts; PLAY-11): three kinds, each does both of its
 * actions, a tap starts its own reaction and it goes back to what it did after its reaction's time, they live where their
 * kind may - the walkers on an island inside its rail, the fliers in the air over the islands -, the same seed makes the
 * same herd, a held one keeps still; a few light instanced meshes.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createWorldScope } from '../../game/scope';
import {
  COUNTS, FLY_MAX, LAMB_ROAM, REACTION_TIME, SKY_ACTIONS, SKY_CALM, SKY_REACTION, VANE_H,
  birdGeometry, createSkyCreatures, createSkyHerd, drakeyGeometry, freeSpot, lambGeometry, roofTips, skyHabitat, vaneGeometry,
  type SkyHabitat, type SkyKind,
} from './creatures';
import { FRIENDS } from './index';
import { ISLANDS, RAIL } from './layout';
import { buildScenery } from './scenery';
import { colliders, islandAt, type Collider } from './terrain';

vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

const KINDS: SkyKind[] = ['bird', 'drakey', 'lamb'];
const run = (herd: ReturnType<typeof createSkyHerd>, s: number, each?: () => void) => { for (let t = 0; t < s; t += 0.05) { herd.update(0.05); each?.(); } };
/** m from (x, z) to the middle of the island it is on, and how far it may be from it inside the rail; null - over no island. */
const inside = (x: number, z: number) => { const id = islandAt(x, z); if (!id) return null; const i = ISLANDS[id]; return { id, d: Math.hypot(x - i.x, z - i.z), max: i.r - RAIL }; };

describe('the creatures of the Sky Islands (PLAY-11)', () => {
  // the islands as ./index.ts builds them before the creatures: their scenery's colliders, the characters' blocks
  let hab: SkyHabitat, blocked: Collider[];
  beforeAll(() => {
    colliders.length = 0;
    buildScenery(new THREE.Scene());
    for (const f of FRIENDS) colliders.push({ x: f.x, z: f.z, r: 0.8 });
    blocked = [...colliders];
    hab = skyHabitat(blocked);
  });
  afterAll(() => { colliders.length = 0; });

  it('three kinds in their numbers: a ring of birds over the castle and one over the windmills, two pairs of little dragons, a flock of lambs on two islands', () => {
    const herd = createSkyHerd(hab);
    const n = (k: SkyKind) => herd.all.filter((c) => c.kind === k).length;
    expect(hab.rings.length).toBe(2);
    expect(n('bird')).toBe(2 * COUNTS.birdsPerRing);
    expect(n('drakey')).toBe(2 * COUNTS.pairs);
    expect(hab.flocks.map((f) => f.length)).toEqual([COUNTS.lambsPerFlock, COUNTS.lambsPerFlock]);
    expect(n('lamb')).toBe(2 * COUNTS.lambsPerFlock);
    // the castle's ring over the castle island, the mills' over the windmill island; the lambs on the dragon and the windmill islands
    expect(islandAt(hab.rings[0].centre.x, hab.rings[0].centre.z)).toBe('castle');
    expect(islandAt(hab.rings[1].centre.x, hab.rings[1].centre.z)).toBe('mills');
    expect(hab.flocks[0].every((p) => islandAt(p.x, p.z) === 'dragon')).toBe(true);
    expect(hab.flocks[1].every((p) => islandAt(p.x, p.z) === 'mills')).toBe(true);
    for (const p of hab.pairs) {
      expect(islandAt(p.centre.x, p.centre.z)).toBe('dragon');
      for (const s of p.sunny) expect(islandAt(s.x, s.z)).toBe('dragon');
    }
    // every ring has more vanes than one: the castle's four towers, the three mills
    const tips = roofTips();
    expect(hab.vanes.filter((v) => v.ring === 0).length).toBe(tips.castle.length);
    expect(hab.vanes.filter((v) => v.ring === 1).length).toBe(tips.mills.length);
  });

  it('every kind does both its actions', () => {
    const herd = createSkyHerd(hab), seen = new Map<SkyKind, Set<string>>(KINDS.map((k) => [k, new Set()]));
    run(herd, 120, () => { for (const c of herd.all) seen.get(c.kind)!.add(c.state); });
    for (const k of KINDS) for (const a of SKY_ACTIONS[k]) expect(seen.get(k)!.has(a), `${k} ${a}`).toBe(true);
  });

  it('a tap starts the kind\'s own reaction, three different ones, and after its time it goes back to its life', () => {
    const reactions = new Set<string>();
    for (const k of KINDS) {
      const herd = createSkyHerd(hab);
      run(herd, 1);
      const target = herd.all.find((c) => c.kind === k)!, before = target.state;
      const hit = herd.tap((c) => (c === target ? 1 : 999), 50);
      expect(hit, k).toBe(target);
      expect(target.state, k).toBe(SKY_REACTION[k]);
      expect(SKY_ACTIONS[k] as readonly string[]).not.toContain(target.state);
      expect(target.taps).toBe(1);
      reactions.add(target.state);
      // still in it just before its time, back to the action it was in just after
      run(herd, REACTION_TIME[k] - 0.15);
      expect(target.state, k).toBe(SKY_REACTION[k]);
      run(herd, 0.3);
      expect(target.state, k).toBe(before);
    }
    expect(reactions.size).toBe(3);
  });

  it('a tap far from all of them hits none', () => {
    const herd = createSkyHerd(hab);
    expect(herd.tap(() => 500, 70)).toBeNull();
  });

  it('the walkers\' places are free: the lambs\' middles and the sunny spots inside their island\'s rail, off the bridges, clear of every collider', () => {
    for (const p of [...hab.flocks.flat(), ...hab.pairs.flatMap((s) => s.sunny)]) {
      const at = inside(p.x, p.z);
      expect(at, `${p.x.toFixed(1)},${p.z.toFixed(1)}`).not.toBeNull();
      expect(at!.d).toBeLessThan(at!.max);
      for (const c of blocked) expect(Math.hypot(c.x - p.x, c.z - p.z), `${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBeGreaterThan(c.r);
      expect(p.y).toBeCloseTo(hab.ground(p.x, p.z), 6);
    }
    for (const p of hab.flocks.flat()) expect(freeSpot(p.x, p.z, LAMB_ROAM, blocked)).toBe(true);
    // the vanes stand on the roofs' tips, high over the ground
    for (const v of hab.vanes) expect(v.tip.y - hab.ground(v.tip.x, v.tip.z)).toBeGreaterThan(8);
  });

  it('each stays where its kind may: the lambs on their island within its rail, the little dragons over the dragon island or basking on it, the birds over their islands, none over the void nor too high', () => {
    const herd = createSkyHerd(hab), wrong: string[] = [];
    const want = (ok: boolean, what: string) => { if (!ok && wrong.length < 5) wrong.push(what); };
    // taps now and then, so that the reactions are walked through too
    let frame = 0;
    run(herd, 150, () => {
      if (++frame % 97 === 0) { const c = herd.all[frame % herd.all.length]; herd.tap((x) => (x === c ? 1 : 999), 50); }
      for (const c of herd.all) {
        const at = inside(c.pos.x, c.pos.z), floor = hab.ground(c.pos.x, c.pos.z), what = `${c.kind} ${c.state} at ${c.pos.x.toFixed(1)},${c.pos.y.toFixed(1)},${c.pos.z.toFixed(1)}`;
        // on an island's disc (a bridge's deck starts past its edge): never over the void nor over a bridge
        want(at !== null, `${what}: over no island`);
        if (!at) continue;
        const over = c.pos.y - ISLANDS[at.id].top;
        if (c.kind === 'lamb') {
          want(Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z) < LAMB_ROAM + 1e-6 && at.d < at.max && at.id === (c.group === 0 ? 'dragon' : 'mills'), `${what}: off its grazing`);
          want(c.pos.y >= floor - 1e-6 && c.pos.y < floor + 0.6, `${what}: ${(c.pos.y - floor).toFixed(2)} m over the ground`);
        } else {
          want(at.d < at.max, `${what}: past the rail`);
          want(c.pos.y >= floor - 1e-6 && over < FLY_MAX, `${what}: ${over.toFixed(2)} m over its island`);
          if (c.kind === 'drakey') want(at.id === 'dragon', `${what}: off the dragon island`);
          // in the air while in its circle (a bird's ring, a pair's): well over the island
          if (c.state === 'circle' || (c.state === 'pair' && c.u >= 1.2)) want(over > 5, `${what}: low in its circle`);
        }
      }
    });
    expect(wrong).toEqual([]);
  });

  it('the birds sit on the weathervanes and the little dragons bask on their spots', () => {
    const herd = createSkyHerd(hab);
    let sat = 0, basked = 0;
    run(herd, 120, () => {
      for (const c of herd.all) {
        if (c.kind === 'bird' && c.state === 'perch' && c.act === 0) {
          const v = hab.vanes[c.spot];
          expect(c.pos.distanceTo(v.tip.clone().setY(v.tip.y + VANE_H))).toBeLessThan(1e-6);
          sat++;
        }
        if (c.kind === 'drakey' && c.state === 'bask' && c.act === 0) { expect(c.pos.distanceTo(c.home)).toBeLessThan(1e-6); basked++; }
      }
      // two birds never on one vane
      const on = herd.all.filter((c) => c.kind === 'bird' && c.spot >= 0).map((c) => c.spot);
      expect(new Set(on).size).toBe(on.length);
    });
    expect(sat).toBeGreaterThan(0);
    expect(basked).toBeGreaterThan(0);
  });

  it('the same seed makes the same herd; another seed another', () => {
    const trace = (seed: number) => { const h = createSkyHerd(hab, seed); run(h, 30); return h.all.map((c) => `${c.state} ${c.pos.toArray().map((v) => v.toFixed(4)).join(',')}`); };
    expect(trace(61)).toEqual(trace(61));
    expect(trace(61)).not.toEqual(trace(62));
    expect(skyHabitat(blocked)).toEqual(hab);
  });

  it('a held creature keeps still in its calm action until a tap, then reacts and comes back to the point', () => {
    for (const k of KINDS) {
      const herd = createSkyHerd(hab), c = herd.all.find((x) => x.kind === k)!, at = c.pos.clone().add(new THREE.Vector3(0.3, 0.2, 0));
      herd.hold(c, at);
      run(herd, 5);
      expect(c.pos.distanceTo(at), k).toBeLessThan(1e-6);
      expect(c.state, k).toBe(SKY_CALM[k]);
      herd.tap((x) => (x === c ? 1 : 999), 50);
      expect(c.state, k).toBe(SKY_REACTION[k]);
      run(herd, REACTION_TIME[k] + 0.3);
      expect(c.state, k).toBe(SKY_CALM[k]);
      expect(c.pos.distanceTo(at), k).toBeLessThan(1e-6);
    }
  });

  it('each shape is light and carries what its shader moves', () => {
    const limits: [THREE.BufferGeometry, number][] = [[birdGeometry(), 110], [drakeyGeometry(), 280], [lambGeometry(), 280], [vaneGeometry(), 80]];
    for (const [g, max] of limits) {
      expect(g.getAttribute('position').count / 3).toBeLessThanOrEqual(max);
      for (const a of ['color', 'part', 'normal']) expect(g.getAttribute(a), a).toBeTruthy();
    }
    // the moving parts are marked: the bird's and the little dragon's wings, the lamb's fleece
    const parts = (g: THREE.BufferGeometry) => new Set(Array.from(g.getAttribute('part').array as Float32Array));
    for (const g of [birdGeometry(), drakeyGeometry(), lambGeometry()]) expect([...parts(g)].sort()).toEqual([0, 1]);
  });

  it('the world draws them in at most six draw calls and ten thousand triangles, casting no shadow; a tap reacts; the scope takes them out', () => {
    const scene = new THREE.Scene(), scope = createWorldScope(scene);
    const g = { scene, sparks: { burst: () => {} }, busy: false, started: () => true, touch: true } as unknown as Parameters<typeof createSkyCreatures>[0];
    const cr = createSkyCreatures(g, scope, hab);
    expect(cr.meshes.map((m) => m.name).sort()).toEqual(['sky-bird', 'sky-drakey', 'sky-lamb', 'sky-vanes']);
    expect(cr.meshes.length).toBeLessThanOrEqual(6);
    const triangles = cr.meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3 * m.count, 0);
    expect(triangles).toBeLessThanOrEqual(10000);
    for (const m of cr.meshes) { expect(m.castShadow).toBe(false); expect(m.parent).toBe(scene); }
    for (let i = 0; i < 40; i++) cr.update(0.05);
    // a tap on a lamb: the middle of its body is what is measured
    const lamb = cr.herd.all.find((c) => c.kind === 'lamb')!;
    expect(cr.tap((p) => p.distanceTo(lamb.pos.clone().setY(lamb.pos.y + cr.bodyOf(lamb))))).toBe(true);
    expect(lamb.state).toBe('fluff');
    // busy (a conversation): a tap is not the creatures'
    const busy = createSkyCreatures({ ...g, busy: true } as typeof g, scope, hab);
    expect(busy.tap(() => 0)).toBe(false);
    busy.dispose();
    expect(busy.meshes.every((m) => m.parent === null)).toBe(true);
    scope.dispose();
    expect(cr.meshes.every((m) => m.parent === null)).toBe(true);
  });
});
