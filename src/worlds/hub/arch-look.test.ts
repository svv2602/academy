// @vitest-environment happy-dom
/**
 * The look of the arches and the nests of the hub (./arch-look.ts, docs/worlds/hub.md, WORLD-01): the gameplay of the
 * grey build kept exactly - the posts, the one-sided veil, the nests - and the budget of the frame (TECH-06).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARCH, CREST, LOOK_BUDGET, buildArches, buildNestLook, crestShape, seeded, type ArchLoads } from './arch-look';
import { NESTS, PORTALS, TREE, trunkR } from './layout';

/** A stand-in for Crystal2: no file is loaded in a unit test. */
const fakeLoads = (): ArchLoads => ({ crystal: new THREE.OctahedronGeometry(0.3, 0) });

const build = (leadsTo: (string | null)[]) => {
  const scene = new THREE.Scene(), blocks: { x: number; z: number; r: number }[] = [];
  const look = buildArches(scene, leadsTo, (x, z, r) => { blocks.push({ x, z, r }); });
  return { scene, blocks, look };
};

/** What the renderer would draw of `root`: its visible meshes and their triangles (one call per mesh). */
function drawn(root: THREE.Object3D) {
  let calls = 0, triangles = 0;
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      calls++;
      const g = m.geometry;
      triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    }
    o.children.forEach(walk);
  };
  walk(root);
  return { calls, triangles };
}

describe('the arches of the hub', () => {
  it('the posts keep a walker out where the grey build put them: ±1.5 m across every arch, r 0.5', () => {
    const { blocks } = build(['fairy', null, null, null, null]);
    const grey = PORTALS.flatMap((p) => [-1, 1].map((side) => ({ x: p.x + Math.cos(p.facing) * side * 1.5, z: p.z - Math.sin(p.facing) * side * 1.5, r: 0.5 })));
    expect(blocks).toHaveLength(10);
    blocks.forEach((b, i) => { expect(b.x).toBeCloseTo(grey[i].x); expect(b.z).toBeCloseTo(grey[i].z); expect(b.r).toBe(grey[i].r); });
    expect(ARCH.inner * 2).toBeCloseTo(2.4);   // the passage as wide as the grey one
  });

  it('every arch where its place is, turned out of the middle, about 4 m of stones and its crest on top; the world behind it as given', () => {
    const { look } = build(['fairy', 'probe', null, null, null]);
    expect(look.arches.map((a) => a.world)).toEqual(['fairy', 'probe', null, null, null]);
    for (const a of look.arches) {
      expect(a.group.position.x).toBeCloseTo(a.x); expect(a.group.position.z).toBeCloseTo(a.z);
      expect(a.group.rotation.y).toBeCloseTo(a.facing);
      expect(a.at.x).toBeCloseTo(a.x); expect(a.at.z).toBeCloseTo(a.z);
      const box = new THREE.Box3().setFromObject(a.group);
      expect(box.max.y).toBeGreaterThan(CREST.y + 0.55); expect(box.max.y).toBeLessThan(CREST.y + CREST.h + 0.15);
      // the stones themselves: as high as before, the keystone under the crest
      const stones = (a.group.children[0] as THREE.Mesh).geometry.getAttribute('position');
      let top = 0;
      for (let i = 0; i < stones.count; i++) if (Math.abs(stones.getX(i)) > 0.6) top = Math.max(top, stones.getY(i));
      expect(top).toBeGreaterThan(3.3); expect(top).toBeLessThan(4.6);
    }
  });

  it('the veil only on an open arch: one-sided, a shader with its time, facing the glade', () => {
    const { look } = build(['fairy', null, 'sea', null, null]);
    for (const a of look.arches) {
      expect(a.veil.visible).toBe(a.world !== null);
      const m = a.veil.material as THREE.ShaderMaterial;
      expect(m.isShaderMaterial).toBe(true);
      expect(m.side).toBe(THREE.FrontSide);
      expect(m.transparent).toBe(true); expect(m.depthWrite).toBe(false);
      expect(a.veil.rotation.y).toBeCloseTo(Math.PI);
      a.group.updateMatrixWorld(true);
      // the front of the plane (+z) in the world points to the tree: from outside the arch it is not drawn
      const front = new THREE.Vector3(0, 0, 1).transformDirection(a.veil.matrixWorld);
      const toTree = new THREE.Vector3(TREE.x - a.x, 0, TREE.z - a.z).normalize();
      expect(front.dot(toTree)).toBeGreaterThan(0.99);
    }
    look.update(2.5);
    expect((look.arches[0].veil.material as THREE.ShaderMaterial).uniforms.uTime.value).toBe(2.5);
  });

  it('a sleeping arch has its sign facing the glade; an open one glows', () => {
    const { look } = build(['fairy', null, null, null, null]);
    const [open, sleeping] = look.arches;
    const glowing = (a: (typeof look.arches)[number]) => a.group.children.some((o) => ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity > 0 && !(o as THREE.Mesh).material.hasOwnProperty('uniforms'));
    expect(glowing(open)).toBe(true);
    const sign = sleeping.group.children.find((o) => ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).map);
    expect(sign).toBeDefined();
    expect(sign!.rotation.y).toBeCloseTo(Math.PI);
  });

  it('the same stones at every run (seeded)', () => {
    const a = build(['fairy', null, null, null, null]).look.arches[1].group.children[0] as THREE.Mesh;
    const b = build(['fairy', null, null, null, null]).look.arches[1].group.children[0] as THREE.Mesh;
    expect(Array.from(a.geometry.getAttribute('position').array)).toEqual(Array.from(b.geometry.getAttribute('position').array));
    expect(seeded(5)()).toBe(seeded(5)());
  });
});

describe('the crest: the sign of the world on top of every arch, seen across the glade', () => {
  /** The meshes of an arch with vertices up in the crest (over the keystone), and how many such vertices each has. */
  const crestIn = (a: { group: THREE.Group }) => a.group.children.map((o) => {
    const g = (o as THREE.Mesh).geometry, pos = g?.getAttribute('position');
    let n = 0;
    if (pos) for (let i = 0; i < pos.count; i++) if (pos.getY(i) > CREST.y + 0.25) n++;
    return { mesh: o as THREE.Mesh, n };
  }).filter((x) => x.n > 0);

  it('on every arch: glowing in the world\'s colour on an open one, grey stone on a sleeping one', () => {
    const leads = ['fairy', null, 'sea', null, 'sky'];
    const { look } = build(leads);
    for (const a of look.arches) {
      const up = crestIn(a);
      expect(up, `arch ${a.shelf}`).toHaveLength(1);
      const mat = up[0].mesh.material as THREE.MeshStandardMaterial;
      if (a.world !== null) {
        expect('#' + mat.emissive.getHexString()).toBe(a.colour);
        expect(mat.emissiveIntensity).toBeGreaterThan(0.5);
        expect(mat.vertexColors).toBe(false);
      } else {
        // in the stones' mesh, grey: no glow anywhere on a sleeping arch but the veil (hidden)
        expect(up[0].mesh).toBe(a.group.children[0]);
        expect(mat.emissive.getHex()).toBe(0);
        const col = up[0].mesh.geometry.getAttribute('color'), pos = up[0].mesh.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) if (pos.getY(i) > CREST.y + 0.25) expect(Math.abs(col.getX(i) - col.getZ(i))).toBeLessThan(0.05);
        for (const o of a.group.children) {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (o.visible && m.emissive) expect(m.emissive.getHex(), `arch ${a.shelf}`).toBe(0);
        }
      }
    }
    // breathing with the runes: the open crest's light changes with the time
    const mat = crestIn(look.arches[0])[0].mesh.material as THREE.MeshStandardMaterial;
    look.update(0); const e0 = mat.emissiveIntensity; look.update(1); expect(mat.emissiveIntensity).not.toBe(e0);
  });

  it('a big shape of its own per world (≈1 m, ≈28 px high at 25 m in 1280 x 720), closed, facing out, faceted', () => {
    const counts = new Set<number>();
    const px = (h: number) => (h / (2 * 25 * Math.tan((55 / 2) * Math.PI / 180))) * 720;
    for (const shelf of [0, 1, 2, 3, 4]) {
      const g = crestShape(shelf), pos = g.getAttribute('position');
      g.computeBoundingBox();
      const bb = g.boundingBox!, size = bb.getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.y), `shelf ${shelf}`).toBeGreaterThan(0.95);
      expect(Math.max(size.x, size.y)).toBeLessThan(1.25);
      expect(px(Math.max(size.x, size.y))).toBeGreaterThan(26);
      expect(size.z).toBeGreaterThan(0.2);   // a solid, not a card: it reads from the side too
      expect(bb.min.y).toBeGreaterThan(-0.1); expect(bb.min.y).toBeLessThan(0.15);   // on the keystone
      // low-poly
      expect(pos.count / 3).toBeLessThan(200);
      counts.add(pos.count);
      // closed solids wound outward: most faces look away from the middle, and the signed volume is the shape's own
      // (a part wound inward would take twice its volume off)
      const mid = bb.getCenter(new THREE.Vector3()), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      let out = 0, volume = 0;
      for (let t = 0; t < pos.count; t += 3) {
        a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
        const nrm = b.clone().sub(a).cross(c.clone().sub(a)), centre = a.clone().add(b).add(c).divideScalar(3).sub(mid);
        if (nrm.dot(centre) > 0) out++;
        volume += a.dot(b.clone().cross(c)) / 6;
      }
      expect(out / (pos.count / 3), `shelf ${shelf}`).toBeGreaterThan(0.7);
      console.log(`crest ${shelf}: ${pos.count / 3} triangles, ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m, volume ${volume.toFixed(3)} of a box ${(size.x * size.y * size.z).toFixed(3)}`);
      expect(volume, `shelf ${shelf}`).toBeGreaterThan(0.12 * size.x * size.y * size.z);
    }
    expect(counts.size).toBe(5);
  });
});

describe('the nests on the trunk', () => {
  it('where the grey build put them: on the trunk at the side of each arch, at its height', () => {
    const { nests } = buildNestLook(new THREE.Scene(), fakeLoads());
    expect(nests.map((n) => n.shelf)).toEqual(NESTS.map((n) => n.shelf));
    nests.forEach((n, i) => {
      const s = NESTS[i], r = trunkR(s.y) + 0.35;
      expect(n.artifact.position.x).toBeCloseTo(Math.sin(s.a) * r);
      expect(n.artifact.position.z).toBeCloseTo(Math.cos(s.a) * r);
      expect(Math.abs(n.artifact.position.y - s.y)).toBeLessThan(0.3);
    });
  });

  it('the crystal\'s nest holds the crystal; a lit nest glows in its world\'s colour, a dark one does not', () => {
    const loads = fakeLoads();
    const { nests, update } = buildNestLook(new THREE.Scene(), loads);
    expect(nests[0].artifact.geometry).toBe(loads.crystal);
    nests[0].set(true, PORTALS[0].colour);
    const lit = nests[0].artifact.material as THREE.MeshStandardMaterial, dark = nests[1].artifact.material as THREE.MeshStandardMaterial;
    expect(nests.map((n) => n.lit)).toEqual([true, false, false, false, false]);
    expect(lit.emissiveIntensity).toBeGreaterThan(1);
    expect('#' + lit.emissive.getHexString()).toBe(PORTALS[0].colour);
    expect(dark.emissiveIntensity).toBe(0);
    nests[0].set(false, PORTALS[0].colour);
    expect(nests[0].lit).toBe(false); expect(lit.emissiveIntensity).toBe(0);
    expect(() => update(1)).not.toThrow();
  });
});

describe('the budget of the look (TECH-06)', () => {
  it('five arches and five nests within the documented triangles and draw calls, in the worst case of the arches', () => {
    for (const leadsTo of [['fairy', null, null, null, null], ['a', 'b', 'c', 'd', 'e'], [null, null, null, null, null]]) {
      const { scene } = build(leadsTo);
      buildNestLook(scene, fakeLoads());
      const d = drawn(scene);
      expect(d.calls).toBeLessThanOrEqual(LOOK_BUDGET.calls);
      expect(d.triangles).toBeLessThanOrEqual(LOOK_BUDGET.triangles);
      console.log(`arches ${leadsTo.filter(Boolean).length} open: ${d.calls} calls, ${d.triangles} triangles`);
    }
  });
});
