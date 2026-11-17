import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ACTIONS, COUNTS, HOVER, REACTION, createHerd, flowerSpots, treeTops, type Creature, type Habitat, type Kind, type State } from './creatures';
import { PATCH, POND, WATER_Y, height, pathDist } from './terrain';

const KINDS: Kind[] = ['fairy', 'bird', 'fish'];

/** The first world's habitat: its flower spots, a few made-up tree tops, the deep middle of the pond. */
function habitat(): Habitat {
  const perches = [[-6, -2], [8, -4], [-10, -18], [6, 4], [-3, -26]].map(([x, z]) => new THREE.Vector3(x, height(x, z) + 7, z));
  return { ground: height, flowers: flowerSpots(), perches, pond: { x: POND.x, z: POND.z, r: POND.r - 4, water: WATER_Y } };
}

/** Steps the herd `seconds` in frames of `dt`, calling `each` after every frame. */
function run(h: ReturnType<typeof createHerd>, seconds: number, each: (t: number) => void = () => {}, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) { h.update(dt); each(t); }
}

describe('the creatures of no task (PLAY-11)', () => {
  it('there are three kinds, as many of each as COUNTS says', () => {
    const h = createHerd(habitat());
    for (const k of KINDS) expect(h.all.filter((c) => c.kind === k).length).toBe(COUNTS[k]);
  });

  it('every creature takes both actions of its kind, and only those, in a minute', () => {
    const h = createHerd(habitat());
    const seen = h.all.map(() => new Set<State>());
    run(h, 60, () => h.all.forEach((c, i) => seen[i].add(c.state)));
    h.all.forEach((c, i) => expect([...seen[i]].sort()).toEqual([...ACTIONS[c.kind]].sort()));
  });

  it('stays where it lives: fairies over the flowers, birds at the tree tops or between them, fish in the pond', () => {
    const hab = habitat(), h = createHerd(hab);
    const top = Math.max(...hab.perches.map((p) => p.y));
    run(h, 60, () => {
      for (const c of h.all) {
        const ground = height(c.pos.x, c.pos.z);
        if (c.kind === 'fairy') {
          expect(c.pos.y - ground).toBeGreaterThan(0.2);
          expect(c.pos.y - ground).toBeLessThan(HOVER + 1);
        } else if (c.kind === 'bird') {
          expect(c.pos.y - ground).toBeGreaterThan(3);
          expect(c.pos.y).toBeLessThan(top + 4.5);
        } else {
          // in the pond's deep middle, never in its bed; under the surface while swimming, above it only in a leap
          expect(Math.hypot(c.pos.x - POND.x, c.pos.z - POND.z)).toBeLessThan(POND.r - 2);
          expect(c.pos.y - ground).toBeGreaterThan(0.5);
          if (c.state === 'swim') expect(c.pos.y).toBeLessThan(WATER_Y);
        }
      }
    });
  });

  it('a perched bird stands on its tree top; a gathering fairy hovers at its flower', () => {
    const hab = habitat(), h = createHerd(hab);
    let perched = 0, gathering = 0;
    run(h, 30, () => {
      for (const c of h.all) {
        if (c.state === 'perch') { perched++; expect(c.pos.distanceTo(hab.perches[c.spot])).toBeLessThan(1e-6); }
        if (c.state === 'gather') { gathering++; expect(Math.hypot(c.pos.x - hab.flowers[c.spot].x, c.pos.z - hab.flowers[c.spot].z)).toBeLessThan(0.3); }
      }
    });
    expect(perched).toBeGreaterThan(0);
    expect(gathering).toBeGreaterThan(0);
  });

  it('the fairies\' flowers are in the meadow, off the path, the pond and the butterflies\' bed', () => {
    const f = flowerSpots();
    expect(f.length).toBeGreaterThanOrEqual(6);
    for (const p of f) {
      expect(pathDist(p.x, p.z)).toBeGreaterThan(2);
      expect(Math.hypot(p.x - POND.x, p.z - POND.z)).toBeGreaterThan(POND.r + 1);
      expect(Math.hypot(p.x - PATCH.x, p.z - PATCH.z)).toBeGreaterThan(7);
      expect(p.y).toBeCloseTo(height(p.x, p.z), 5);
    }
  });

  it('the birds perch on the tallest instanced meshes that cast shadows (the trees), not on bushes', () => {
    const scene = new THREE.Scene();
    const box = (h: number) => new THREE.BoxGeometry(1, h, 1).translate(0, h / 2, 0);
    const trees = new THREE.InstancedMesh(box(7), new THREE.MeshBasicMaterial(), 3);
    [[10, 0, 1], [0, 12, 1.2], [-20, 5, 1]].forEach(([x, z, s], i) => trees.setMatrixAt(i, new THREE.Matrix4().makeScale(s, s, s).setPosition(x, 1, z)));
    trees.castShadow = true;
    const bushes = new THREE.InstancedMesh(box(1.3), new THREE.MeshBasicMaterial(), 1);
    bushes.setMatrixAt(0, new THREE.Matrix4().setPosition(8, 0, 0)); bushes.castShadow = true;
    const far = new THREE.InstancedMesh(box(8), new THREE.MeshBasicMaterial(), 1);
    far.setMatrixAt(0, new THREE.Matrix4().setPosition(9, 0, 0));                // casts no shadow: the distant ring
    scene.add(trees, bushes, far);
    const tops = treeTops(scene, { x: 0, z: 0 }, 2);
    expect(tops.map((t) => [t.x, t.z])).toEqual([[10, 0], [0, 12]]);
    expect(tops[0].y).toBeCloseTo(1 + 7 - 0.1, 5);
    expect(tops[1].y).toBeCloseTo(1 + 7 * 1.2 - 0.1, 5);
  });
});

describe('a tap on a creature (PLAY-12)', () => {
  /** The nearest creature of a kind to the tap: "screen distance" here is the distance to it in metres times 100. */
  const tapKind = (h: ReturnType<typeof createHerd>, kind: Kind): Creature | null => {
    const target = h.all.find((c) => c.kind === kind)!;
    return h.tap((c) => (c === target ? 0 : 1e9), 70);
  };

  it('each kind answers with a reaction of its own, and goes back to what it was doing', () => {
    const h = createHerd(habitat());
    run(h, 2);
    const reactions = new Set<string>();
    for (const k of KINDS) {
      const c = tapKind(h, k)!;
      expect(c.kind).toBe(k);
      expect(c.state).toBe(REACTION[k]);
      expect(c.taps).toBe(1);
      reactions.add(c.state);
    }
    expect(reactions.size).toBe(3);
    // The reaction moves the creature, then ends in one of its own actions.
    const moved = h.all.filter((c) => c.taps).map((c) => ({ c, from: c.pos.clone(), most: 0 }));
    run(h, 0.6, () => moved.forEach((m) => { m.most = Math.max(m.most, m.c.pos.distanceTo(m.from)); }));
    for (const m of moved) expect(m.most).toBeGreaterThan(0.3);
    run(h, 2);
    for (const m of moved) expect(ACTIONS[m.c.kind] as readonly string[]).toContain(m.c.state);
  });

  it('a tap far from every creature hits none and changes nothing', () => {
    const h = createHerd(habitat());
    run(h, 1);
    const before = h.all.map((c) => c.state);
    expect(h.tap(() => 500, 70)).toBeNull();
    expect(h.all.map((c) => c.state)).toEqual(before);
  });

  it('the nearest creature within reach is the one that answers', () => {
    const h = createHerd(habitat());
    const [a, b] = h.all;
    const hit = h.tap((c) => (c === a ? 40 : c === b ? 20 : 1e9), 70);
    expect(hit).toBe(b);
    expect(a.taps).toBe(0);
  });
});
