/**
 * "Where are more?" played in the world (PLAY-01): two glades side by side, each with its flowers. The description is
 * the panel's (`tasks/compare.ts`, the levels that draw things - from level 4 the groups are digits and stay on the
 * card): the left glade holds `groups[0]` flowers, the right one `groups[1]`. A tap on a glade (by its distance on the
 * screen from its flowers and its middle) answers with its index: the right one blooms and the task ends, a wrong one
 * sways (nothing is taken away); the course of a mistake and the end are the frame's (./core.ts). The hint goes by the
 * rungs of the description: the way said only, then the number of each glade over it (`showNumbers`), then the right
 * glade's flowers grow - or shrink, for "fewer" - (`grow` / `shrink`) and its ring breathes (`pulseAnswer`).
 *
 * Like every show of a task it draws no random numbers: the flowers stand on a spiral. It is the world's to open it, to
 * wire the close button and to call `update` in its frame.
 */
import * as THREE from 'three';
import type { WorldScope } from '../scope';
import { compare, type CompareSpec } from '../tasks/compare';
import { hintOf, type ShownHint } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';
import { numberTexture } from './stones';

/** Where the glades lie: the middle between them, and the direction the child looks at them, in radians. */
export interface GladesPlace { x: number; z: number; facing: number }

export interface WorldGladesOptions {
  groundY(x: number, z: number): number;
  /** The farthest a tap may land from a flower of a glade on the screen, in pixels. */
  reach: number;
  /** The world's scope: the task's timer goes with the world. */
  scope: WorldScope;
}

export interface WorldGlades extends WorldTaskShow {
  /** The two glades: their middles; each holds its index in `userData.i` and its flowers as children. */
  readonly glades: readonly THREE.Group[];
}

const R = 1.0;             // m: the radius of a glade
const APART = 1.3;         // m from the middle between the glades to the middle of each
const BLOOM = 0.42;        // s of game time the right glade takes to bloom before the task ends
const COLORS = ['#ff8fcf', '#ffd166', '#9ad0ff'];   // the flowers of a glade, in turn
const SPIRAL = 2.39996;    // rad: the golden angle - flowers spread evenly over the disc, never on top of each other

export function showGladesInWorld(scene: THREE.Scene, spec: CompareSpec, at: GladesPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldGladesOptions): WorldGlades {
  const { groups, more, answer } = spec.body;
  const group = new THREE.Group();
  const sx = Math.cos(at.facing), sz = -Math.sin(at.facing);         // left to right as the child sees them
  const ground = (x: number, z: number) => o.groundY(x, z);

  // A glade lies on the ground: every point of its disc and ring at the height of the ground under it (a slope does not
  // cut through it). Made per glade, in its own place.
  const laid = (geo: THREE.BufferGeometry, x0: number, z0: number, lift: number) => {
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, y0 = ground(x0, z0);
    for (let i = 0; i < p.count; i++) p.setY(i, ground(x0 + p.getX(i), z0 + p.getZ(i)) - y0 + lift);
    geo.computeVertexNormals();
    return geo;
  };
  const geos: THREE.BufferGeometry[] = [];
  const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.36, 5);
  const bloomGeo = new THREE.SphereGeometry(0.14, 10, 7);
  const stemMat = new THREE.MeshStandardMaterial({ color: '#4fae54', roughness: 1 });
  const blooms = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.15, roughness: 0.6 }));
  const textures: THREE.Texture[] = [];
  const rings: THREE.Mesh[] = [];
  // Seen from the child: the left glade is the first group, as on the card.
  const glades = groups.map((n, i) => {
    const off = (i === 0 ? -1 : 1) * APART, x = at.x - sx * off, z = at.z - sz * off;
    const g = new THREE.Group();
    g.position.set(x, ground(x, z), z);
    g.userData = { i, n };
    const discGeo = laid(new THREE.RingGeometry(0, R, 32, 4), x, z, 0.04), ringGeo = laid(new THREE.RingGeometry(R - 0.06, R + 0.05, 40, 2), x, z, 0.06);
    geos.push(discGeo, ringGeo);
    const disc = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: i === 0 ? '#a6e27f' : '#98da8c', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
    rings.push(ring);
    g.add(disc, ring);
    for (let k = 0; k < n; k++) {
      // a spiral from the middle out, a step of the golden angle: as many flowers as the group, none on another
      const r = (R - 0.2) * Math.sqrt((k + 0.5) / Math.max(n, 6)), a = k * SPIRAL;
      const f = new THREE.Group();
      f.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      f.position.y = ground(x + f.position.x, z + f.position.z) - g.position.y;
      const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.y = 0.17;
      const bloom = new THREE.Mesh(bloomGeo, blooms[k % blooms.length]); bloom.position.y = 0.36;
      f.add(stem, bloom);
      f.userData.flower = true;
      g.add(f);
    }
    // its number, shown by the second rung of the hint
    const tex = numberTexture(n);
    if (tex) {
      textures.push(tex);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      label.scale.setScalar(0.6); label.position.y = 1.1; label.renderOrder = 2; label.visible = false;
      label.userData.label = true;
      g.add(label);
    }
    group.add(g);
    return g;
  });
  const center = new THREE.Vector3(at.x, ground(at.x, at.z), at.z);
  scene.add(group);
  hooks.prompt(spec.prompt);

  const flowersOf = (g: THREE.Group) => g.children.filter((c) => c.userData.flower);
  // where a tap on a glade is measured from: each of its flowers and its middle (a glade with one flower is a big target too)
  const tapPoints = (g: THREE.Group) => [g.position.clone().setY(g.position.y + 0.1), ...flowersOf(g).map((f) => f.getWorldPosition(new THREE.Vector3()).setY(g.position.y + 0.3))];
  let numbers = false, grow = 0, pulse = false, sway: { g: THREE.Group; t: number } | null = null, bloomAt = -1, time = 0;
  const hint: ShownHint | null = hintOf(spec.hint, () => { pulse = true; }, {
    showNumbers: () => { numbers = true; },
    grow: () => { grow = time; },
    shrink: () => { grow = time; },
  });
  const core = taskCore(o.scope, hooks, hint, () => {
    scene.remove(group);
    for (const geo of geos) geo.dispose();
    stemGeo.dispose(); bloomGeo.dispose();
    for (const t of textures) t.dispose();
  });

  function pick(g: THREE.Group) {
    if (!core.alive) return;
    const out = compare.answer(spec, null, g.userData.i as 0 | 1);
    if (out === 'wrong') { sway = { g, t: -1 }; void core.mistake(); return; }
    numbers = false; grow = 0; pulse = false;
    bloomAt = time;
    hooks.good();
    core.solve(BLOOM * 1000 + 300);    // the right glade blooms, then the task ends
  }
  const right = () => glades[answer];

  return {
    kind: 'glades', done: core.done, center, glades, facing: at.facing,
    extent: { side: APART + R + 0.2, depth: R + 0.2 },
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best: THREE.Group | null = null, bd = o.reach;
      for (const g of glades) for (const p of tapPoints(g)) { const d = screenDist(p); if (d < bd) { bd = d; best = g; } }
      if (best) pick(best);
      return true;
    },
    solve: () => pick(right()),
    wrong: () => {
      if (!core.alive) return false;
      pick(glades[1 - answer]);
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind: 'glades', phase: core.phase, wrongs: core.wrongs, moves: core.phase === 'solved' ? 1 : 0, rung: core.rung, progress: [] }),
    reach: o.reach,
    targets: () => (core.alive ? glades.map((g) => ({ pos: g.position.clone().setY(g.position.y + 0.1), right: g === right() })) : []),
    progress: () => [],
    resume: () => {},
    update: (t) => {
      time = t;
      for (const g of glades) {
        for (const c of g.children) if (c.userData.label) c.visible = numbers;
        // the third rung: the right glade's flowers grow (more) or shrink (fewer) over a second, and stay so
        const k = grow > 0 && g === right() ? Math.min(1, (t - grow) / 1) : 0;
        const bloomK = bloomAt >= 0 && g === right() ? Math.min(1, (t - bloomAt) / BLOOM) : 0;
        const s = (1 + (more ? 0.45 : -0.35) * k) * (1 + 0.35 * Math.sin(bloomK * Math.PI));
        for (const f of flowersOf(g)) f.scale.setScalar(s);
      }
      if (sway) {
        if (sway.t < 0) sway.t = t;
        const k = t - sway.t;
        for (const f of flowersOf(sway.g)) f.rotation.z = k < 0.6 ? Math.sin(k * 25) * 0.25 * (1 - k / 0.6) : 0;
        if (k >= 0.6) sway = null;
      }
      rings.forEach((r, i) => {
        const on = pulse && glades[i] === right();
        (r.material as THREE.MeshBasicMaterial).opacity = on ? 0.55 + 0.4 * Math.sin(t * 6) : 0.55;
        r.scale.setScalar(on ? 1 + 0.05 * Math.sin(t * 6) : 1);
      });
    },
  };
}
