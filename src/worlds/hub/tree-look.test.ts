// @vitest-environment happy-dom
/**
 * The look of the Great Tree (./tree-look.ts, docs/worlds/hub.md «Как Древо меняется», R33): which look a number of
 * artifacts gives, that the new trunk keeps the map's radius where the nests sit, that every look adds to the one
 * before it and that the fourth stays in the budget of the phone (TECH-06). No file is loaded: the crowns are fakes
 * of about the size of the real ones (CommonTree_1..4: 343-640 triangles of leaves).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { NESTS, PORTALS, TREE, trunkR } from './layout';
import { TREE_BUDGET, barkRadius, buildTreeLook, crownOf, lookCost, treeShape, treeStage, type TreeLoads, type TreeStage } from './tree-look';

/** A green crown of 600 triangles, as `crownOf` gives them: non-indexed, with normals and colours, 1 m in radius. */
function fakeCrown(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 20, 16).toNonIndexed();
  g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => [0.4, 0.77, 0.32][i % 3]), 3));
  return g;
}
/** The mushroom of the meadow has 138 triangles; a cone of about as many stands in for it. */
const fakeMushroom = () => new THREE.ConeGeometry(0.5, 1, 23, 2).translate(0, 0.5, 0);
const loads = (): TreeLoads => ({ crowns: [fakeCrown(), fakeCrown(), fakeCrown(), fakeCrown()], mushroom: fakeMushroom() });

function build(stage: TreeStage) {
  const scene = new THREE.Scene(), blocks: [number, number, number][] = [];
  const look = buildTreeLook(scene, stage, loads(), (x, z, r) => blocks.push([x, z, r]));
  return { scene, look, blocks, cost: lookCost(look.root) };
}

describe('the look by the artifacts back (R33: four discrete looks)', () => {
  it('0 and 1 - the first, then one look per artifact, five and more - the fourth (the final is WORLD-06)', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(treeStage)).toEqual([1, 1, 2, 3, 4, 4, 4]);
    expect(treeStage(-1)).toBe(1);
    expect(treeStage(Number.NaN)).toBe(1);
  });
});

describe('the trunk keeps the map (./layout.ts)', () => {
  it('the bark at the height and on the side of every nest is the radius of the map: the nest sits on it', () => {
    for (const n of NESTS) expect(Math.abs(barkRadius(n.y, n.a) - trunkR(n.y)), `nest ${n.shelf}`).toBeLessThan(0.15);
  });

  it('the built bark has a vertex there, at that radius; the foot stays inside the collider', () => {
    const { look } = build(1);
    const bark = look.root.children[0] as THREE.Mesh, pos = bark.geometry.getAttribute('position');
    for (const n of NESTS) {
      let best = Infinity, r = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), rr = Math.hypot(x, z);
        // on the trunk's own surface (not a root or a branch), near the nest's angle and height
        if (Math.abs(rr - trunkR(y)) > 0.3) continue;
        const d = Math.abs(y - n.y) + Math.abs(Math.atan2(Math.sin(Math.atan2(x, z) - n.a), Math.cos(Math.atan2(x, z) - n.a))) * rr;
        if (d < best) { best = d; r = rr; }
      }
      expect(best, `a vertex by nest ${n.shelf}`).toBeLessThan(0.6);
      expect(Math.abs(r - trunkR(n.y))).toBeLessThan(0.15);
    }
    for (let a = 0; a < Math.PI * 2; a += 0.1) expect(barkRadius(0, a)).toBeLessThan(trunkR(0) + 0.4);
  });

  it('the trunk collider as in the grey build, six roots, a low branch between every two arches', () => {
    const { blocks } = build(4);
    expect(blocks).toEqual([[TREE.x, TREE.z, trunkR(0) + 0.4]]);
    const shape = treeShape();
    expect(shape.roots).toHaveLength(6);
    expect(shape.branches).toHaveLength(PORTALS.length);
    for (const b of shape.branches) {
      const tip = b.curve.getPointAt(1), a = Math.atan2(tip.x, tip.z);
      // as far from every arch's side as can be: so from every nest too
      for (const p of PORTALS) expect(Math.abs(Math.atan2(Math.sin(a - p.facing), Math.cos(a - p.facing)))).toBeGreaterThan(0.3);
    }
  });

  it('the crown covers the glade to about 12 m from the trunk, above the trunk', () => {
    const outer = Math.max(...treeShape().clumps.map(([x, , z, r]) => Math.hypot(x, z) + r));
    expect(outer).toBeGreaterThan(11.5);
    expect(outer).toBeLessThan(14);
    for (const [, y, , r, from] of treeShape().clumps) if (r > 2) expect(y - r * 0.72, `from stage ${from}`).toBeGreaterThan(TREE.h - 3);
  });
});

describe('every look adds to the one before, within the budget (TECH-06)', () => {
  it('more meshes, instances and triangles each look; the fourth under TREE_BUDGET', () => {
    const costs = ([1, 2, 3, 4] as const).map((s) => build(s).cost);
    for (let i = 1; i < 4; i++) {
      expect(costs[i].draws, `stage ${i + 1}`).toBeGreaterThan(costs[i - 1].draws);
      expect(costs[i].instances).toBeGreaterThan(costs[i - 1].instances);
      expect(costs[i].triangles).toBeGreaterThan(costs[i - 1].triangles);
    }
    expect(costs[3].triangles).toBeLessThan(TREE_BUDGET.triangles);
    expect(costs[3].draws).toBeLessThanOrEqual(TREE_BUDGET.draws);
    // the first look: the bark and the crown only, each also in the shadow pass
    expect(costs[0].draws).toBe(4);
  });

  it('only the trunk and the crown cast shadows', () => {
    const { look } = build(4);
    const casters: THREE.Object3D[] = [];
    look.root.traverse((o) => { if (o.castShadow) casters.push(o); });
    expect(casters).toEqual(look.root.children.slice(0, 2));
    expect(casters.every((o) => !(o as THREE.InstancedMesh).isInstancedMesh)).toBe(true);
  });

  it('the same picture every time; update moves the fireflies and the birds, none of it allocates a mesh', () => {
    const a = build(4), b = build(4);
    const matrices = (root: THREE.Object3D) => root.children.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh).map((o) => Array.from((o as THREE.InstancedMesh).instanceMatrix.array));
    expect(matrices(a.look.root)).toEqual(matrices(b.look.root));
    const before = matrices(a.look.root), children = a.look.root.children.length;
    a.look.update(3.7);
    const after = matrices(a.look.root);
    expect(after.filter((m, i) => m.some((v, k) => v !== before[i][k])).length).toBe(2);   // the fireflies and the birds
    expect(a.look.root.children.length).toBe(children);
  });

  it('the dull crown of the first look is greyer than the third', () => {
    const colours = (s: TreeStage) => {
      const crown = build(s).look.root.children[1] as THREE.Mesh, c = crown.geometry.getAttribute('color');
      let sat = 0;
      for (let i = 0; i < c.count; i += 50) sat += c.getY(i) - Math.min(c.getX(i), c.getZ(i));
      return sat;
    };
    expect(colours(1) / build(1).cost.triangles).toBeLessThan(colours(3) / build(3).cost.triangles);
  });
});

describe('crownOf: the leaves of a model of the valley', () => {
  it('keeps the green triangles only, centred and 1 m in radius', () => {
    const wood = new THREE.CylinderGeometry(0.2, 0.3, 3, 6).translate(0, 1.5, 0).toNonIndexed();
    const leaves = new THREE.IcosahedronGeometry(1.5, 1).translate(0.4, 4, 0);
    const tint = (g: THREE.BufferGeometry, c: number[]) => { g.deleteAttribute('uv'); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).map((_, i) => c[i % 3]), 3)); return g; };
    const tree = new THREE.BufferGeometry();
    const w = tint(wood, [0.66, 0.46, 0.31]), l = tint(leaves, [0.4, 0.77, 0.32]);
    for (const name of ['position', 'normal', 'color']) {
      const arr = new Float32Array([...(w.getAttribute(name).array as Float32Array), ...(l.getAttribute(name).array as Float32Array)]);
      tree.setAttribute(name, new THREE.BufferAttribute(arr, 3));
    }
    const crown = crownOf(tree);
    expect(crown.getAttribute('position').count).toBe(l.getAttribute('position').count);
    crown.computeBoundingBox();
    const bb = crown.boundingBox!;
    expect(Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)).toBeCloseTo(2);
    expect(bb.max.x + bb.min.x).toBeCloseTo(0);
    expect(bb.max.y + bb.min.y).toBeCloseTo(0);
  });
});
