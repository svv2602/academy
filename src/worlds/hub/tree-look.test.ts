// @vitest-environment happy-dom
/**
 * The look of the Great Tree (./tree-look.ts, docs/worlds/hub.md «Как Древо меняется», R33): which look a number of
 * artifacts gives, that the new trunk keeps the map's radius where the nests sit, that every look adds to the one
 * before it and that the fourth stays in the budget of the phone (TECH-06). No file is loaded: the crowns are fakes
 * of about the size of the real ones (CommonTree_1..4: 343-640 triangles of leaves).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARCH } from './arch-look';
import { HUB_FLYOVER } from './flyover-path';
import { NESTS, PORTALS, PORTAL_R, TREE, arrivalAt, trunkR } from './layout';
import { RING_FLASH, RING_FLASH_S, STUMP, TREE_BUDGET, barkRadius, buildTreeLook, crownOf, lookCost, stumpAt, treeHollow, treeShape, treeStage, type TreeLoads, type TreeStage } from './tree-look';

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
/** The mossy stump has 232 triangles, wood and moss: a cylinder of about as many, its top green. */
function fakeStump(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.6, 0.85, 0.8, 38, 2).translate(0, 0.4, 0), pos = g.getAttribute('position');
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: pos.count }, (_, i) => (pos.getY(i) > 0.75 ? [0.4, 0.77, 0.32] : [0.66, 0.46, 0.31])).flat(), 3));
  return g;
}
const loads = (): TreeLoads => ({ crowns: [fakeCrown(), fakeCrown(), fakeCrown(), fakeCrown()], mushroom: fakeMushroom(), stump: fakeStump(), bark: new THREE.Texture() });

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
    const stump = stumpAt();
    expect(blocks).toEqual([[TREE.x, TREE.z, trunkR(0) + 0.4], [stump.x, stump.z, STUMP.r]]);
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
    // the first look: the bark and the crown, each also in the shadow pass; the fireflies, the butterflies, the mushrooms
    expect(costs[0].draws).toBe(7);
    expect(costs[3].draws).toBe(11);
    console.log(`tree looks: ${costs.map((c, i) => `${i + 1} - ${c.triangles} / ${c.draws}`).join(', ')}`);
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
    expect(after.filter((m, i) => m.some((v, k) => v !== before[i][k])).length).toBe(3);   // the fireflies, the butterflies, the birds
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

/** The instanced meshes of a look by what they are: the butterflies (two-sided), the fireflies (unlit), the mushrooms (`aGlow`). */
function parts(root: THREE.Object3D) {
  const inst = root.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh);
  return {
    butterflies: inst.find((o) => (o.material as THREE.Material).side === THREE.DoubleSide && (o.material as THREE.MeshStandardMaterial).flatShading),
    fireflies: inst.find((o) => (o.material as THREE.MeshBasicMaterial).isMeshBasicMaterial && !(o.material as THREE.MeshBasicMaterial).vertexColors),
    mushrooms: inst.find((o) => o.geometry.getAttribute('aGlow')),
  };
}
const where = (im: THREE.InstancedMesh, i: number) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(im.instanceMatrix.array, i * 16));
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('the trunk and the roots up close (bark, the hollow, moss, the stump)', () => {
  it('the hollow faces the glade between two arches, at a child\'s eyes, clear of the roots', () => {
    const h = treeHollow(), shape = treeShape();
    const mids = PORTALS.map((p) => p.facing + Math.PI / PORTALS.length);
    expect(Math.min(...mids.map((m) => angleGap(h.a, m)))).toBeLessThan(1e-9);
    for (const p of PORTALS) expect(angleGap(h.a, p.facing), `arch ${p.shelf}`).toBeGreaterThan(0.6);
    for (const pts of shape.roots) expect(angleGap(h.a, Math.atan2(pts[1].x, pts[1].z))).toBeGreaterThan(0.45);
    expect(h.y - h.h).toBeGreaterThan(0.6); expect(h.y + h.h).toBeLessThan(2);
    expect(h.y).toBeGreaterThan(1); expect(h.y).toBeLessThan(1.5);
  });

  it('the hollow lies on the trunk\'s surface: its dark cup on the bark, out of it by a hand at most, facing out', () => {
    const h = treeHollow(), bark = build(1).look.root.children[0] as THREE.Mesh, g = bark.geometry;
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    const n = new THREE.Vector3(Math.sin(h.a), 0, Math.cos(h.a)), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    // the bark round the mouth is never further out than the mouth: the cup is seen, not buried
    for (let y = h.y - h.h; y <= h.y + h.h; y += 0.05) {
      for (let da = -h.w / trunkR(y); da <= h.w / trunkR(y); da += 0.02) expect(barkRadius(y, h.a + da) * Math.cos(da)).toBeLessThanOrEqual(h.r + 0.01);
    }
    expect(h.r - barkRadius(h.y, h.a)).toBeLessThan(0.2);
    let dark = 0;
    for (let t = 0; t < pos.count; t += 3) {
      if (col.getX(t) > 0.6 || col.getX(t + 1) > 0.6 || col.getX(t + 2) > 0.6) continue;   // the cup: a near-black fan
      a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
      const centre = a.clone().add(b).add(c).divideScalar(3), out = centre.dot(n);
      if (Math.abs(centre.y - h.y) > h.h + 0.1 || out < 0) continue;
      dark++;
      expect(out).toBeGreaterThanOrEqual(h.r - 0.01); expect(out).toBeLessThan(h.r + 0.2);
      expect(b.clone().sub(a).cross(c.clone().sub(a)).dot(n), 'faces the glade').toBeGreaterThan(0);
    }
    expect(dark).toBe(12);
  });

  it('bark, moss and the stump in one mesh: the bark picture over warm vertex colours, with uvs, the stump at its place', () => {
    const { look } = build(2), bark = look.root.children[0] as THREE.Mesh, mat = bark.material as THREE.MeshStandardMaterial;
    expect(mat.map).toBeInstanceOf(THREE.Texture);
    expect(mat.flatShading).toBe(true);
    const g = bark.geometry, uv = g.getAttribute('uv'), pos = g.getAttribute('position'), col = g.getAttribute('color');
    expect(uv.count).toBe(pos.count);
    // the picture is not stretched along the trunk: one repeat per 2.4 m of height
    let maxV = -Infinity;
    for (let i = 0; i < uv.count; i++) if (Math.hypot(pos.getX(i), pos.getZ(i)) < trunkR(0) + 0.5) maxV = Math.max(maxV, uv.getY(i));
    expect(maxV).toBeGreaterThan(5); expect(maxV).toBeLessThan(8);
    // moss: green vertices on the roots and at the foot; the stump: vertices where it stands
    let moss = 0, stump = 0;
    const s = stumpAt();
    for (let i = 0; i < pos.count; i++) {
      if (col.getY(i) > col.getX(i) * 2) moss++;
      if (Math.hypot(pos.getX(i) + TREE.x - s.x, pos.getZ(i) + TREE.z - s.z) < 1.1 && pos.getY(i) < STUMP.h + 0.1) stump++;
    }
    expect(moss).toBeGreaterThan(27 * 60);
    expect(stump).toBeGreaterThan(200 * 3);
  });

  it('mushrooms on the roots and the glowing ring round the stump in every look; the ring glows more', () => {
    for (const stage of [1, 2, 3, 4] as const) {
      const { mushrooms } = parts(build(stage).look.root), glow = mushrooms!.geometry.getAttribute('aGlow');
      const strength = (i: number) => glow.getX(i) + glow.getY(i) + glow.getZ(i);
      const ring = Array.from({ length: mushrooms!.count }, (_, i) => i).filter((i) => strength(i) > 0.5);
      expect(ring, `stage ${stage}`).toHaveLength(20);
      expect(mushrooms!.count).toBe(stage >= 3 ? 50 : 28);
      const s = stumpAt();
      for (const i of ring) {
        const p = where(mushrooms!, i);
        expect(Math.hypot(p.x + TREE.x - s.x, p.z + TREE.z - s.z)).toBeGreaterThan(STUMP.ring - 0.2);
        expect(Math.hypot(p.x + TREE.x - s.x, p.z + TREE.z - s.z)).toBeLessThan(STUMP.ring + 0.2);
      }
      // the ones on the roots stand on them, over the ground
      for (let i = 0; i < 8; i++) expect(where(mushrooms!, i).y).toBeGreaterThan(0.1);
      // none of the meadow's groups stands in the stump or its ring
      for (let i = 28; i < mushrooms!.count; i++) { const p = where(mushrooms!, i); expect(Math.hypot(p.x + TREE.x - s.x, p.z + TREE.z - s.z)).toBeGreaterThan(STUMP.ring + 0.3); }
    }
  });

  it('the stump and its ring are clear of the arches\' passages, the spots she arrives at and the tour (≥ 2.5 m)', () => {
    const { mushrooms } = parts(build(4).look.root), s = stumpAt();
    const spots = [{ x: s.x, z: s.z, r: 0.9 }];
    for (let i = 0; i < mushrooms!.count; i++) {
      const p = where(mushrooms!, i);
      if (Math.hypot(p.x + TREE.x - s.x, p.z + TREE.z - s.z) < STUMP.ring + 0.3) spots.push({ x: p.x + TREE.x, z: p.z + TREE.z, r: 0.15 });
    }
    expect(spots).toHaveLength(21);
    for (const sp of spots) {
      for (const p of PORTALS) {
        const arrive = arrivalAt(p.shelf);
        expect(Math.hypot(sp.x - arrive.x, sp.z - arrive.z) - sp.r, `arrival ${p.shelf}`).toBeGreaterThan(2.5);
        // the passage: the strip from the trunk out through the arch, as wide as the arch with a margin
        const along = sp.x * Math.sin(p.facing) + sp.z * Math.cos(p.facing), across = Math.abs(sp.x * Math.cos(p.facing) - sp.z * Math.sin(p.facing));
        if (along > 0 && along < PORTAL_R + 2) expect(across - sp.r, `passage ${p.shelf}`).toBeGreaterThan(ARCH.inner + 0.6);
      }
      for (const [k, pt] of HUB_FLYOVER.points.entries()) expect(Math.hypot(sp.x - pt.pos[0], sp.z - pt.pos[2]) - sp.r, `tour point ${k}`).toBeGreaterThan(2.5);
    }
  });
});

describe('life in the first looks', () => {
  it('butterflies from the first look on, flapping, near the ground round the trunk; a handful of fireflies too', () => {
    for (const stage of [1, 4] as const) {
      const { look } = build(stage), { butterflies, fireflies } = parts(look.root);
      expect(butterflies, `stage ${stage}`).toBeDefined();
      expect(butterflies!.count).toBe(10);
      expect(fireflies!.count).toBe(stage === 1 ? 8 : 36);
      look.update(12.3);
      for (let i = 0; i < butterflies!.count; i++) {
        const p = where(butterflies!, i), r = Math.hypot(p.x, p.z);
        expect(p.y).toBeGreaterThan(0.2); expect(p.y).toBeLessThan(3.5);
        expect(r).toBeGreaterThan(trunkR(0) + 0.3); expect(r).toBeLessThan(PORTAL_R - 2);
        expect(r).toBeLessThan(7.5);   // the tour's camera keeps 8 m from the axis: no butterfly at its lens
      }
    }
    // the wings: two quads (four triangles) round a body; they beat in the vertex shader by the shared time
    const b = parts(build(1).look.root).butterflies!, pos = b.geometry.getAttribute('position');
    let wing = 0;
    for (let t = 0; t < pos.count; t += 3) if ([0, 1, 2].some((k) => Math.abs(pos.getX(t + k)) > 0.03)) wing++;
    expect(wing).toBe(4);
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

describe('the ring of mushrooms round the stump (the notes: ./ring-notes.ts)', () => {
  it('twenty caps round the stump at the ring\'s distance, over the ground', () => {
    const { look } = build(1), c = stumpAt();
    expect(look.ring.tops).toHaveLength(20);
    for (const p of look.ring.tops) {
      expect(Math.abs(Math.hypot(p.x - c.x, p.z - c.z) - STUMP.ring)).toBeLessThan(0.2);
      expect(p.y).toBeGreaterThan(0.1);
    }
  });

  it('a touched one flashes and comes back to its own glow; the others keep theirs', () => {
    const { look, scene } = build(1);
    let mush: THREE.InstancedMesh | undefined;
    scene.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.Mesh).geometry.getAttribute('aGlow')) mush = o as THREE.InstancedMesh; });
    const glow = mush!.geometry.getAttribute('aGlow');
    const ringAt = (i: number) => { for (let j = 0; j < glow.count; j++) { const v = new THREE.Vector3(); const m = new THREE.Matrix4(); mush!.getMatrixAt(j, m); v.setFromMatrixPosition(m).add(look.root.position); const t = look.ring.tops[i]; if (Math.hypot(v.x - t.x, v.z - t.z) < 1e-4) return j; } return -1; };
    const j = ringAt(3), k = ringAt(4), own = glow.getX(j), other = glow.getX(k);
    expect(j).toBeGreaterThanOrEqual(0);
    look.update(10);
    look.ring.flash(3);
    look.update(10.016);
    expect(glow.getX(j)).toBeGreaterThan(own * (RING_FLASH - 0.5));
    expect(glow.getX(k)).toBeCloseTo(other);
    for (let t = 10.1; t < 10 + RING_FLASH_S + 0.3; t += 0.05) look.update(t);
    expect(glow.getX(j)).toBeCloseTo(own);
  });
});
