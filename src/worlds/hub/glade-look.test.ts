/**
 * The dress of the glade (./glade-look.ts, docs/worlds/hub.md «Облик (H)»): the placements are the same at every run,
 * nothing solid stands on the tour, in a passage, at an arrival spot or on a path, the paths are only the open arches'
 * and end outside the trunk, and the heaviest glade (all five arches open) stays in its budget (TECH-06). No file is
 * loaded: the models are fakes of their real triangle counts (read from the .glb headers of public/models/nature2):
 *   PebbleRound1-3 136 / 114 / 128; RockMedium1-3 342 / 244 / 522; BushCommon 900 (untextured);
 *   BushCommonFlowers 900 leaves + 468 flowers; Fern1 288; Clover1 379; Clover2 615; Flower3Group 710 leaves + 45 flowers.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Part } from '../../core/assets';
import { HUB_FLYOVER } from './flyover-path';
import { PORTALS, TREE, arrivalAt, trunkR } from './layout';
import {
  GLADE_BUDGET, PASSAGE, TOUR_CLEAR, bakeParts, buildGladeLook, gladeCost, placeGlade, placeMotes,
  type ArchSpot, type GladeItem, type GladeLoads,
} from './glade-look';

/** A part of `tris` triangles: a strip of indexed quads (position, normal, uv), about 1 m. */
function fakePart(name: string, tris: number, cutout = true): Part {
  const quads = Math.ceil(tris / 2);
  const g = new THREE.PlaneGeometry(1, 1, quads, 1);
  g.setIndex(Array.from(g.index!.array).slice(0, tris * 3));
  return { geo: g, name, map: null, cutout };
}
const loads = (): GladeLoads => ({
  pebbles: [136, 114, 128].map((t) => [fakePart('PathRocks', t, false)]),
  rocks: [342, 244, 522].map((t) => [fakePart('Rocks', t, false)]),
  bushes: [[fakePart('Material', 900, false)], [fakePart('Leaves_NormalTree', 900), fakePart('Flowers', 468)]],
  carpet: [[fakePart('Leaves', 288)], [fakePart('Leaves', 379)], [fakePart('Leaves', 615)], [fakePart('Flowers', 45), fakePart('Leaves', 710)]],
});

const ALL: readonly ArchSpot[] = PORTALS;
const SOME: readonly ArchSpot[] = [PORTALS[0], PORTALS[1]];
const solids = (open: readonly ArchSpot[]) => { const p = placeGlade(open); return [...p.bushes.map((b) => ({ ...b, r: 0.6 * b.s })), ...p.rocks.map((r) => ({ ...r, r: 0.5 * r.s }))]; };

describe('the placements', () => {
  it('are the same at every run (seeded), the motes too', () => {
    expect(placeGlade(SOME)).toEqual(placeGlade(SOME));
    expect(placeGlade(ALL)).toEqual(placeGlade(ALL));
    expect(placeMotes(150)).toEqual(placeMotes(150));
  });

  it('the bushes and rocks do not move as more arches open; the counts are the header\'s', () => {
    const a = placeGlade([]), b = placeGlade(ALL);
    expect(b.bushes).toEqual(a.bushes);
    expect(b.rocks).toEqual(a.rocks);
    expect(a.bushes.filter((x) => x.kind === 0)).toHaveLength(7);
    expect(a.bushes.filter((x) => x.kind === 1)).toHaveLength(7);
    expect(a.rocks).toHaveLength(12);
    expect(b.carpet.map((c) => c.kind).sort()).toEqual([...Array(24).fill(0), ...Array(16).fill(1), ...Array(8).fill(2), ...Array(10).fill(3)]);
  });

  it('every bush stands in the band of the edge, between two arches', () => {
    for (const b of placeGlade(ALL).bushes) { const r = Math.hypot(b.x, b.z); expect(r).toBeGreaterThanOrEqual(15); expect(r).toBeLessThanOrEqual(19); }
  });
});

describe('nothing solid where she walks or the camera flies', () => {
  for (const [name, open] of [['two open', SOME], ['all open', ALL], ['none open', []]] as const) {
    it(`${name}: ${TOUR_CLEAR} m clear of every tour point (x, z)`, () => {
      for (const s of solids(open)) for (const t of HUB_FLYOVER.points) expect(Math.hypot(s.x - t.pos[0], s.z - t.pos[2])).toBeGreaterThanOrEqual(TOUR_CLEAR);
    });

    it(`${name}: none in a passage (±${PASSAGE.across} m across, ${PASSAGE.along} m before and behind), collider included`, () => {
      for (const s of solids(open)) for (const p of PORTALS) {
        const dx = s.x - p.x, dz = s.z - p.z, across = dx * Math.cos(p.facing) - dz * Math.sin(p.facing), along = dx * Math.sin(p.facing) + dz * Math.cos(p.facing);
        expect(Math.abs(across) >= PASSAGE.across + s.r || Math.abs(along) >= PASSAGE.along + s.r, `${s.x.toFixed(1)}, ${s.z.toFixed(1)} by arch ${p.shelf}`).toBe(true);
      }
    });

    it(`${name}: 1.5 m clear of every arrival spot (the spawn among them) and off every path`, () => {
      const plan = placeGlade(open);
      for (const s of solids(open)) {
        for (const p of PORTALS) { const a = arrivalAt(p.shelf); expect(Math.hypot(s.x - a.x, s.z - a.z) - s.r).toBeGreaterThanOrEqual(1.5); }
        for (const q of [...plan.paths.flat(), ...plan.stubs]) expect(Math.hypot(s.x - q.x, s.z - q.z) - s.r).toBeGreaterThan(0.5);
      }
    });

    it(`${name}: what \`block\` gets is the bushes and rocks, nothing else`, () => {
      const plan = placeGlade(open);
      expect(plan.colliders).toHaveLength(plan.bushes.length + plan.rocks.length);
    });
  }

  it('the carpet keeps off the paths and the passages of the open arches', () => {
    const plan = placeGlade(SOME);
    for (const c of plan.carpet) {
      for (const q of plan.paths.flat()) expect(Math.hypot(c.x - q.x, c.z - q.z)).toBeGreaterThanOrEqual(0.45);
      for (const p of SOME) {
        const dx = c.x - p.x, dz = c.z - p.z, across = dx * Math.cos(p.facing) - dz * Math.sin(p.facing), along = dx * Math.sin(p.facing) + dz * Math.cos(p.facing);
        expect(Math.abs(across) >= PASSAGE.across || Math.abs(along) >= PASSAGE.along).toBe(true);
      }
    }
  });
});

describe('the paths', () => {
  const onLine = (q: GladeItem, a: ArchSpot) => Math.abs((q.x - a.x) * Math.cos(a.facing) - (q.z - a.z) * Math.sin(a.facing));

  it('one per open arch, twelve pebbles each, from inside the arch toward the tree; a sleeping arch only a stub', () => {
    const plan = placeGlade(SOME);
    expect(plan.paths).toHaveLength(2);
    plan.paths.forEach((path, i) => {
      expect(path).toHaveLength(12);
      for (const q of path) expect(onLine(q, SOME[i])).toBeLessThan(0.6);
      const r = path.map((q) => Math.hypot(q.x, q.z));
      expect(r[0]).toBeLessThan(12); expect(r[0]).toBeGreaterThan(10.5);
      for (let k = 1; k < r.length; k++) expect(r[k]).toBeLessThan(r[k - 1]);
    });
    expect(placeGlade([]).paths).toHaveLength(0);
    expect(plan.stubs).toHaveLength(3 * 3);
    for (const q of plan.stubs) expect(Math.hypot(q.x, q.z)).toBeGreaterThan(10);
  });

  it('ends outside the trunk collider (trunkR(0) + 0.4), at the roots\' edge', () => {
    for (const path of placeGlade(ALL).paths) {
      const end = path[path.length - 1], r = Math.hypot(end.x - TREE.x, end.z - TREE.z);
      expect(r - 0.3).toBeGreaterThan(trunkR(0) + 0.4);
      expect(r).toBeLessThan(7.5);
    }
  });
});

describe('the build', () => {
  const build = (open: readonly ArchSpot[]) => {
    const scene = new THREE.Scene(), blocks: [number, number, number][] = [];
    const look = buildGladeLook(scene, loads(), open, (x, z, r) => blocks.push([x, z, r]));
    return { scene, look, blocks, cost: gladeCost(look.root) };
  };

  it('gives `block` the colliders of the plan and puts one group into the scene', () => {
    const { scene, look, blocks } = build(SOME);
    expect(blocks).toEqual(placeGlade(SOME).colliders.map((c) => [c.x, c.z, c.r]));
    expect(scene.children).toEqual([look.root]);
  });

  it('the heaviest glade (all five arches open) stays in the budget: ≈ 53.8k triangles, 9 draw calls', () => {
    const { cost } = build(ALL);
    expect(cost.triangles).toBeLessThanOrEqual(GLADE_BUDGET.triangles);
    expect(cost.draws).toBeLessThanOrEqual(GLADE_BUDGET.draws);
    expect(cost.draws).toBe(9);
    expect(cost.triangles).toBeGreaterThan(50_000);   // the fakes are the real sizes: the estimate is not hollow
  });

  it('one mesh per material; only the invisible stand-ins cast a shadow; the motes are one Points of 150', () => {
    const { look } = build(SOME);
    const meshes = look.root.children.filter((o) => (o as THREE.Mesh).isMesh) as THREE.Mesh[];
    expect(meshes.map((m) => m.name).sort()).toEqual(['glade-Flowers|true', 'glade-Leaves_NormalTree|true', 'glade-Leaves|true', 'glade-Material|false', 'glade-PathRocks|false', 'glade-Rocks|false', 'glade-shadows']);
    expect(meshes.filter((m) => m.castShadow).map((m) => m.name)).toEqual(['glade-shadows']);
    expect((meshes.find((m) => m.name === 'glade-shadows')!.material as THREE.Material).colorWrite).toBe(false);
    const points = look.root.children.filter((o) => (o as THREE.Points).isPoints) as THREE.Points[];
    expect(points).toHaveLength(1);
    expect(points[0].geometry.getAttribute('position').count).toBe(150);
  });

  it('update moves the motes through their time uniform only', () => {
    const { look } = build(SOME);
    const points = look.root.children.find((o) => (o as THREE.Points).isPoints) as THREE.Points;
    const before = (points.geometry.getAttribute('position').array as Float32Array).slice();
    look.update(12.5);
    expect((points.material as THREE.ShaderMaterial).uniforms.uTime.value).toBe(12.5);
    expect(points.geometry.getAttribute('position').array).toEqual(before);
  });
});

describe('bakeParts', () => {
  it('turns, scales and places every copy, keeps the triangle count and writes the foot and sway per vertex', () => {
    const part = fakePart('Leaves', 10);
    part.geo.rotateX(-Math.PI / 2).translate(0.3, 0, 0.1);   // lying on the ground, off the middle: x and z both count
    const geo = bakeParts([{ part, items: [{ x: 3, z: -2, s: 2, rot: Math.PI / 2 }, { x: 0, z: 0, s: 1, rot: 0 }], sway: 0.4, sink: 0 }]);
    expect(geo.index!.count / 3).toBe(20);
    const n = part.geo.getAttribute('position').count, P = part.geo.getAttribute('position'), out = geo.getAttribute('position');
    // rot π/2 about y: (x, z) -> (z, -x), then x2, then + (3, -2)
    expect(out.getX(0)).toBeCloseTo(3 + P.getZ(0) * 2);
    expect(out.getZ(0)).toBeCloseTo(-2 - P.getX(0) * 2);
    expect(out.getX(n)).toBeCloseTo(P.getX(0));
    const w = geo.getAttribute('aWind');
    expect([w.getX(0), w.getY(0)]).toEqual([3, -2]);
    expect(w.getZ(0)).toBeCloseTo(0.2);
  });
});
