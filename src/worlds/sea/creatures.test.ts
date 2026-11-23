/**
 * The creatures of the sea that belong to no task (./creatures.ts; PLAY-11, PLAY-12): each kind does both of its
 * actions, a tap starts its own reaction (a fish's scatters its whole school) and it goes back to what it did, they stay
 * where they live, the magic brings more fish, a held one keeps still; all of them in four light instanced meshes.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { REACTION_TIME, SCHOOL_LEAST, SEA_ACTIONS, SEA_CALM, SEA_REACTION, createSeaCreatures, createSeaHerd, crabGeometry, fishGeometry, jellyGeometry, seaHabitat, starGeometry, type SeaKind } from './creatures';

const KINDS: SeaKind[] = ['fish', 'jelly', 'crab', 'star'];
const run = (herd: ReturnType<typeof createSeaHerd>, s: number, each?: () => void) => { for (let t = 0; t < s; t += 0.05) { herd.update(0.05); each?.(); } };

describe('the creatures of the sea (PLAY-11, PLAY-12)', () => {
  const hab = seaHabitat();

  it('four kinds, each in its numbers: four schools of fish, jellyfish, crabs, starfish', () => {
    const herd = createSeaHerd(hab);
    const n = (k: SeaKind) => herd.all.filter((c) => c.kind === k).length;
    expect(n('fish')).toBe(hab.schools.reduce((s, x) => s + x.n, 0));
    expect(hab.schools.length).toBe(4);
    for (const k of ['jelly', 'crab', 'star'] as const) expect(n(k), k).toBeGreaterThanOrEqual(5);
  });

  it('every kind does both its actions', () => {
    const herd = createSeaHerd(hab), seen = new Map<SeaKind, Set<string>>(KINDS.map((k) => [k, new Set()]));
    run(herd, 90, () => { for (const c of herd.all) seen.get(c.kind)!.add(c.state); });
    for (const k of KINDS) for (const a of SEA_ACTIONS[k]) expect(seen.get(k)!.has(a), `${k} ${a}`).toBe(true);
  });

  it('a tap starts the kind\'s own reaction, and it goes back to its life after it', () => {
    for (const k of KINDS) {
      const herd = createSeaHerd(hab);
      run(herd, 1);
      const target = herd.all.find((c) => c.kind === k)!;
      const hit = herd.tap((c) => (c === target ? 1 : 999), 50);
      expect(hit, k).toBe(target);
      expect(target.state, k).toBe(SEA_REACTION[k]);
      expect(target.taps).toBe(1);
      if (k === 'fish') for (const f of herd.all.filter((c) => c.school === target.school)) expect(f.state).toBe('scatter');
      run(herd, REACTION_TIME[k] + 0.2);
      expect(SEA_ACTIONS[k] as readonly string[], k).toContain(target.state);
    }
  });

  it('a tap far from all of them hits none', () => {
    const herd = createSeaHerd(hab);
    expect(herd.tap(() => 500, 70)).toBeNull();
  });

  it('they stay where they live: crabs and starfish on the floor near home, jellyfish round their middle, fish over their zone', () => {
    const herd = createSeaHerd(hab), wrong: string[] = [];
    // the faults are gathered and checked once: an expect per creature per step took a second, past the timeout under a
    // loaded machine (the full run of 2026-11-23)
    const want = (ok: boolean, what: string) => { if (!ok && wrong.length < 5) wrong.push(what); };
    run(herd, 60, () => {
      for (const c of herd.all) {
        const off = Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z), floor = hab.ground(c.pos.x, c.pos.z), at = `${c.kind} ${c.slot}`;
        if (c.kind === 'crab') want(off < 2.6 && c.pos.y > floor - 0.31 && c.pos.y < floor + 0.06, `${at}: ${off.toFixed(2)} m from home, ${(c.pos.y - floor).toFixed(2)} m over the floor`);
        if (c.kind === 'star') want(off < 0.9 && c.pos.y >= floor - 1e-6, `${at}: ${off.toFixed(2)} m from home, ${(c.pos.y - floor).toFixed(2)} m over the floor`);
        if (c.kind === 'jelly') want(off < 0.7 && Math.abs(c.pos.y - c.home.y) < 1, `${at}: ${off.toFixed(2)} m from home, ${(c.pos.y - c.home.y).toFixed(2)} m off its height`);
        if (c.kind === 'fish') {
          const s = hab.schools[c.school];
          want(Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < Math.max(s.r, Math.hypot(s.hide.x - s.x, s.hide.z - s.z)) + 6 && c.pos.y > floor + 0.2, `${at}: off its zone or ${(c.pos.y - floor).toFixed(2)} m over the floor`);
        }
      }
    });
    expect(wrong).toEqual([]);
  });

  it('the magic fills the schools: with none only part of each is shown, and a hidden fish is not tapped', () => {
    const herd = createSeaHerd(hab);
    herd.share(0);
    for (let i = 0; i < hab.schools.length; i++) {
      const fish = herd.all.filter((c) => c.school === i);
      expect(fish.filter((f) => f.shown).length).toBe(Math.ceil(fish.length * SCHOOL_LEAST));
    }
    const hidden = herd.all.find((c) => c.kind === 'fish' && !c.shown)!;
    expect(herd.tap((c) => (c === hidden ? 1 : 999), 50)).toBeNull();
    herd.share(1);
    expect(herd.all.every((c) => c.shown)).toBe(true);
  });

  it('a held creature keeps still in its calm action until a tap, then reacts and comes back to the point', () => {
    for (const k of KINDS) {
      const herd = createSeaHerd(hab), c = herd.all.find((x) => x.kind === k)!, at = c.home.clone().add(new THREE.Vector3(0.3, 0, 0));
      if (k === 'fish') at.y += 0; else if (k !== 'jelly') at.y = hab.ground(at.x, at.z);
      herd.hold(c, at);
      run(herd, 5);
      expect(c.pos.distanceTo(at), k).toBeLessThan(1e-6);
      expect(c.state, k).toBe(SEA_CALM[k]);
      herd.tap((x) => (x === c ? 1 : 999), 50);
      expect(c.state, k).toBe(SEA_REACTION[k]);
      run(herd, REACTION_TIME[k] + 0.3);
      expect(c.pos.distanceTo(at), k).toBeLessThan(1e-6);
    }
  });

  it('each shape is light and carries what its shader moves', () => {
    const limits: [THREE.BufferGeometry, number][] = [[fishGeometry(), 70], [jellyGeometry(), 110], [crabGeometry(), 140], [starGeometry(), 40]];
    for (const [g, max] of limits) {
      expect(g.getAttribute('position').count / 3).toBeLessThanOrEqual(max);
      for (const a of ['color', 'part', 'glow', 'normal']) expect(g.getAttribute(a), a).toBeTruthy();
    }
    // the moving parts are marked: the fish's tail, the jellyfish's tentacles, the crab's claws and legs
    const parts = (g: THREE.BufferGeometry) => new Set(Array.from(g.getAttribute('part').array as Float32Array));
    expect(parts(fishGeometry()).has(1)).toBe(true);
    expect(parts(jellyGeometry()).has(1)).toBe(true);
    expect([...parts(crabGeometry())].sort()).toEqual([0, 1, 2]);
  });

  it('the world draws each kind as one instanced mesh, only the shown ones, casting no shadow', () => {
    const scene = new THREE.Scene();
    const g = { scene, sparks: { burst: () => {} }, busy: false, started: () => true, touch: true, hero: { root: { position: new THREE.Vector3() } } } as unknown as Parameters<typeof createSeaCreatures>[0];
    const cr = createSeaCreatures(g, hab);
    cr.life(0); cr.update(0.05);
    expect(cr.meshes.map((m) => m.name).sort()).toEqual(['sea-crab', 'sea-fish', 'sea-jelly', 'sea-star']);
    for (const m of cr.meshes) { expect(m.castShadow).toBe(false); expect(m.parent).toBe(scene); }
    const fish = cr.meshes.find((m) => m.name === 'sea-fish')!;
    expect(fish.count).toBe(cr.herd.all.filter((c) => c.kind === 'fish' && c.shown).length);
    cr.life(1); cr.update(0.05);
    expect(fish.count).toBe(cr.herd.all.filter((c) => c.kind === 'fish').length);
  });
});
