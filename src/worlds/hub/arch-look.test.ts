// @vitest-environment happy-dom
/**
 * The look of the arches and the nests of the hub (./arch-look.ts, docs/worlds/hub.md, WORLD-01): the gameplay of the
 * grey build kept exactly - the posts, the one-sided veil, the nests - and the budget of the frame (TECH-06).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARCH, CREST, LOOK_BUDGET, archStoneMaterial, buildArch, buildArches, buildNestLook, crestShape, seeded, type Arch, type ArchLoads } from './arch-look';
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

/** The vertices of a merged mesh that belong to the arch at (x, z): within 4 m of it (the arches stand 14.7 m apart). */
function near(mesh: THREE.Mesh | null, a: { x: number; z: number }) {
  const out: { i: number; p: THREE.Vector3 }[] = [];
  const pos = mesh?.geometry.getAttribute('position');
  if (pos) for (let i = 0; i < pos.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, i);
    if (Math.hypot(p.x - a.x, p.z - a.z) < 4) out.push({ i, p });
  }
  return out;
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
      const top = Math.max(...[...near(look.stones, a), ...near(look.runes, a)].map((v) => v.p.y));
      expect(top).toBeGreaterThan(CREST.y + 0.55); expect(top).toBeLessThan(CREST.y + CREST.h + 0.15);
      // the stones themselves: as high as before, the keystone under the crest (across the passage, off its middle)
      const across = new THREE.Vector3(Math.cos(a.facing), 0, -Math.sin(a.facing));
      const stones = near(look.stones, a).filter((v) => Math.abs(across.dot(v.p.clone().sub(a.at))) > 0.6).map((v) => v.p.y);
      expect(Math.max(...stones)).toBeGreaterThan(3.3); expect(Math.max(...stones)).toBeLessThan(4.6);
    }
  });

  it('the veil only on an open arch: one-sided, a shader with its time, facing the glade, its colour and phase its arch\'s', () => {
    const { look } = build(['fairy', null, 'sea', null, null]);
    const m = look.veils!.material as THREE.ShaderMaterial;
    expect(m.isShaderMaterial).toBe(true);
    expect(m.side).toBe(THREE.FrontSide);
    expect(m.transparent).toBe(true); expect(m.depthWrite).toBe(false);
    expect(m.fragmentShader).not.toMatch(/uniform float uPhase|uniform vec3 uColour/);
    const g = look.veils!.geometry, pos = g.getAttribute('position'), col = g.getAttribute('aColour'), ph = g.getAttribute('aPhase'), at = g.getAttribute('aP');
    for (const a of look.arches) {
      const mine = near(look.veils, a);
      expect(mine.length, `arch ${a.shelf}`).toBe(a.world !== null ? 6 : 0);
      if (!mine.length) continue;
      const c = new THREE.Color(a.colour);
      for (const { i } of mine) { expect(col.getX(i)).toBeCloseTo(c.r); expect(col.getZ(i)).toBeCloseTo(c.b); expect(ph.getX(i)).toBeCloseTo(a.shelf * 1.3); }
      // the passage from the ground to the inside of the top, as one veil's plane
      expect(Math.min(...mine.map(({ i }) => at.getY(i)))).toBeCloseTo(0); expect(Math.max(...mine.map(({ i }) => at.getY(i)))).toBeCloseTo(ARCH.spring + ARCH.inner);
      // the front of the triangle (its winding) points to the tree: from outside the arch it is not drawn
      const t = mine[0].i - (mine[0].i % 3), v0 = new THREE.Vector3().fromBufferAttribute(pos, t), v1 = new THREE.Vector3().fromBufferAttribute(pos, t + 1), v2 = new THREE.Vector3().fromBufferAttribute(pos, t + 2);
      const front = v1.sub(v0).cross(v2.sub(v0)).normalize();
      const toTree = new THREE.Vector3(TREE.x - a.x, 0, TREE.z - a.z).normalize();
      expect(front.dot(toTree)).toBeGreaterThan(0.99);
    }
    look.update(2.5);
    expect(m.uniforms.uTime.value).toBe(2.5);
    expect(build([null, null, null, null, null]).look.veils).toBeNull();
  });

  it('a sleeping arch has its sign facing the glade; an open one glows, in its colour', () => {
    const { look } = build(['fairy', null, null, null, null]);
    const [open, sleeping] = look.arches;
    expect(near(look.runes, open).length).toBeGreaterThan(0);
    expect(near(look.runes, sleeping)).toHaveLength(0);
    const col = look.runes!.geometry.getAttribute('color'), c = new THREE.Color(open.colour);
    for (const { i } of near(look.runes, open)) { expect(col.getX(i)).toBeCloseTo(c.r); expect(col.getY(i)).toBeCloseTo(c.g); }
    expect(open.group.children).toHaveLength(0);
    const sign = sleeping.group.children.find((o) => ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).map);
    expect(sign).toBeDefined();
    expect(sign!.rotation.y).toBeCloseTo(Math.PI);
  });

  it('the same stones at every run (seeded), and each arch\'s as buildArch builds it alone', () => {
    const a = build(['fairy', null, null, null, null]).look.stones, b = build(['fairy', null, null, null, null]).look.stones;
    expect(Array.from(a.geometry.getAttribute('position').array)).toEqual(Array.from(b.geometry.getAttribute('position').array));
    expect(seeded(5)()).toBe(seeded(5)());
    // the arch of shelf 1, asleep, alone: the same vertices as its part of the merged stones
    const p = PORTALS[1], scene = new THREE.Scene();
    const alone = buildArch(scene, { x: p.x, z: p.z, facing: p.facing, colour: p.colour, icon: p.icon, crest: crestShape(1), open: false, seed: 101 + 7919, phase: 1.3 }, archStoneMaterial(), () => {});
    alone.group.updateMatrixWorld(true);
    const own = (alone.group.children[0] as THREE.Mesh).geometry.clone().applyMatrix4(alone.group.matrixWorld).getAttribute('position');
    const merged = near(a, p);
    expect(merged).toHaveLength(own.count);
    merged.forEach(({ p: v }, k) => { expect(v.x).toBeCloseTo(own.getX(k), 4); expect(v.y).toBeCloseTo(own.getY(k), 4); expect(v.z).toBeCloseTo(own.getZ(k), 4); });
  });
});

describe('the crest: the sign of the world on top of every arch, seen across the glade', () => {
  it('on every arch: glowing in the world\'s colour on an open one, grey stone on a sleeping one', () => {
    const leads = ['fairy', null, 'sea', null, 'sky'];
    const { look } = build(leads);
    const up = (m: THREE.Mesh | null, a: Arch) => near(m, a).filter((v) => v.p.y > CREST.y + 0.25);
    for (const a of look.arches) {
      if (a.world !== null) {
        expect(up(look.stones, a), `arch ${a.shelf}`).toHaveLength(0);
        const col = look.runes!.geometry.getAttribute('color'), c = new THREE.Color(a.colour);
        const mine = up(look.runes, a);
        expect(mine.length).toBeGreaterThan(0);
        for (const { i } of mine) { expect(col.getX(i)).toBeCloseTo(c.r); expect(col.getZ(i)).toBeCloseTo(c.b); }
      } else {
        // in the stones' mesh, grey: no glow anywhere on a sleeping arch
        expect(up(look.runes, a)).toHaveLength(0);
        const mine = up(look.stones, a), col = look.stones.geometry.getAttribute('color');
        expect(mine.length, `arch ${a.shelf}`).toBeGreaterThan(0);
        for (const { i } of mine) expect(Math.abs(col.getX(i) - col.getZ(i))).toBeLessThan(0.05);
      }
    }
    // the stones never glow; the runes breathe on the veils' time with each arch's phase, as `breathe` does one arch's
    expect((look.stones.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0);
    const sh = { uniforms: {} as Record<string, { value: number }>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    (look.runes!.material as THREE.MeshStandardMaterial).onBeforeCompile(sh as never, undefined as never);
    expect(sh.fragmentShader).toContain('vec3 totalEmissiveRadiance = vColor.rgb * (0.9 + 0.5 * sin(uTime * 1.6 + vPhase));');
    expect(sh.vertexShader).toContain('vPhase = aPhase;');
    look.update(3); expect(sh.uniforms.uTime.value).toBe(3);
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
    // the stones of all five one call, the veils and the runes of the open ones one each, a sign per sleeping arch, the
    // six of the nests: 13 with the fairies' open alone, 12 with the forest's too, 11 with the sea's, 9 with all five
    for (const [leadsTo, calls] of [[['fairy', null, null, null, null], 13], [['fairy', 'forest', null, null, null], 12], [['fairy', 'forest', 'sea', null, null], 11], [['a', 'b', 'c', 'd', 'e'], 9], [[null, null, null, null, null], 12]] as const) {
      const { scene } = build([...leadsTo]);
      buildNestLook(scene, fakeLoads());
      const d = drawn(scene);
      expect(d.calls).toBe(calls);
      expect(d.calls).toBeLessThanOrEqual(LOOK_BUDGET.calls);
      expect(d.triangles).toBeLessThanOrEqual(LOOK_BUDGET.triangles);
      console.log(`arches ${leadsTo.filter(Boolean).length} open: ${d.calls} calls, ${d.triangles} triangles`);
    }
  });
});
