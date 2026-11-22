/**
 * The look of the sea's floor (the plan of the sea's look, step A, the customer's word 2026-11-22): the corals, the
 * anemones, the kelp, the rocks and the garden's shells as our own faceted shapes (docs/worlds/style.md) - no file, no
 * licence. Each kind is one geometry made once; the scenery (./scenery.ts) puts it as one instanced mesh, each
 * instance in a colour of its own (`instanceColor`) over one shared material: a kind is one draw call however many.
 *
 * The kinds of coral: a tube (a cluster of hollow pipes), a branch (a staghorn of tilted cones), a brain (a lumpy
 * ball), a table (a flat plate on a short stalk), a fan (a flat fan of ribs). The reef has all five, the rest of the
 * floor three of them, paler.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/util';
import { facets } from '../../core/style';
import { fadeAtCamera } from '../../core/materials';
import { MUTE_GLSL, uMute } from './terrain';

export type CoralKind = 'tube' | 'branch' | 'brain' | 'table' | 'fan';
export const REEF_KINDS: readonly CoralKind[] = ['tube', 'branch', 'brain', 'table', 'fan'];
export const FLOOR_KINDS: readonly CoralKind[] = ['tube', 'branch', 'brain'];

/** The colours: the reef warm and bright (pink, coral, orange, lilac, yellow), the floor's corals pastel. */
export const REEF_COLOURS = ['#ff6f91', '#ff8c5a', '#ffb347', '#c38dff', '#ffd166', '#ff5fa2', '#7fe0d0'] as const;
export const FLOOR_COLOURS = ['#f6b8c6', '#f9cfa0', '#d9c2f0', '#bfe8dc', '#f3e3a6'] as const;
export const KELP_COLOURS = ['#5fae6a', '#4f9a5c', '#78b86a', '#6aa88a'] as const;
export const ANEMONE_COLOURS = ['#ff7fbf', '#ffb36b', '#b98cff', '#7fe7d8'] as const;
export const SHELL_COLOURS = ['#fbe9f3', '#f6e0c8', '#e9e0fb', '#fff4dc'] as const;

/** Its faces flat (each triangle its own normal): the faceted look, whatever the material does. */
const flat = (g: THREE.BufferGeometry) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; };
const merge = (gs: THREE.BufferGeometry[]) => {
  const m = mergeGeometries(gs.map((g) => { const x = g.index ? g.toNonIndexed() : g; x.deleteAttribute('uv'); return x; }));
  if (!m) throw new Error('life: the parts of a shape did not merge');
  return flat(m);
};

/** A pipe from the floor up, open at its top, a little wider there; `lean` tilts it out. */
function pipe(r: number, h: number, x: number, z: number, lean: number, yaw: number) {
  const n = facets(r * 2);
  const g = new THREE.CylinderGeometry(r * 1.15, r * 0.8, h, n, 2, true).translate(0, h / 2, 0);
  // a lip at the top: a ring a little out
  const lip = new THREE.TorusGeometry(r * 1.12, r * 0.18, 4, n).rotateX(Math.PI / 2).translate(0, h, 0);
  const one = mergeGeometries([g.toNonIndexed(), lip.toNonIndexed()].map((x) => { x.deleteAttribute('uv'); return x; }))!;
  return one.rotateZ(lean).rotateY(yaw).translate(x, 0, z);
}

/** The shape of a coral of `kind`, about 1 m at scale 1 (the placements scale it 0.7-1.7). */
export function coralGeometry(kind: CoralKind): THREE.BufferGeometry {
  const rnd = mulberry32(kind.length * 977);
  if (kind === 'tube') {
    const parts = [pipe(0.16, 1.1, 0, 0, 0.05, 0), pipe(0.13, 0.8, 0.22, 0.08, 0.25, 1), pipe(0.12, 0.65, -0.18, 0.14, -0.3, 2), pipe(0.1, 0.5, 0.02, -0.22, 0.2, 4)];
    return merge(parts);
  }
  if (kind === 'branch') {
    // a staghorn: a trunk and its branches, tilted cones forking up and out
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.07, 0.13, 0.5, 6).translate(0, 0.25, 0)];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.5, tilt = 0.35 + rnd() * 0.5, len = 0.5 + rnd() * 0.45;
      const c = new THREE.ConeGeometry(0.07, len, 5).translate(0, len / 2, 0).rotateZ(tilt).rotateY(a).translate(Math.cos(a) * 0.05, 0.38 + rnd() * 0.15, Math.sin(a) * 0.05);
      parts.push(c);
      // a twig off each branch
      const t = new THREE.ConeGeometry(0.045, len * 0.5, 5).translate(0, len * 0.25, 0).rotateZ(tilt + 0.6).rotateY(a + 0.4)
        .translate(Math.cos(a) * len * 0.45 * Math.sin(tilt), 0.4 + len * 0.45 * Math.cos(tilt), Math.sin(a) * len * 0.45 * Math.sin(tilt));
      parts.push(t);
    }
    return merge(parts);
  }
  if (kind === 'brain') {
    // a lumpy ball, half sunk: its vertices pushed in and out (the same vertices of a face stay together)
    const g = new THREE.IcosahedronGeometry(0.5, 1);
    const pos = g.getAttribute('position') as THREE.BufferAttribute, seen = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      let f = seen.get(k);
      if (f === undefined) { f = 0.85 + rnd() * 0.3; seen.set(k, f); }
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.7, pos.getZ(i) * f);
    }
    return flat(g.translate(0, 0.22, 0));
  }
  if (kind === 'table') {
    // a flat plate on a short stalk, its rim a little up
    const n = facets(1.4);
    const stalk = new THREE.CylinderGeometry(0.08, 0.14, 0.5, 6).translate(0, 0.25, 0);
    const plate = new THREE.CylinderGeometry(0.7, 0.55, 0.08, n).translate(0, 0.54, 0);
    const rim = new THREE.TorusGeometry(0.68, 0.05, 3, n).rotateX(Math.PI / 2).translate(0, 0.6, 0);
    return merge([stalk, plate, rim]);
  }
  // fan: ribs spread up from a foot, a thin web between them
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + (i / 6) * 1.8, len = 0.9 + Math.cos(a) * 0.3;
    parts.push(new THREE.CylinderGeometry(0.02, 0.04, len, 4).translate(0, len / 2, 0).rotateZ(a));
  }
  parts.push(new THREE.CircleGeometry(1.05, facets(2), Math.PI / 2 - 0.95, 1.9).scale(1, 1.05, 1));
  return merge(parts);
}

/** A clump of kelp: three ribbons from one foot, each in segments so it can sway (the shader bends it by height); `wide` widens them. */
export function kelpGeometry(h = 3.2, wide = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.PlaneGeometry((0.32 - i * 0.05) * wide, h * (1 - i * 0.18), 1, 6).translate(0, h * (1 - i * 0.18) / 2, 0);
    // a little twist up the ribbon
    const pos = r.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k), t = (y / h) * 0.9, x = pos.getX(k);
      pos.setXYZ(k, x * Math.cos(t), y, x * Math.sin(t));
    }
    parts.push(r.rotateY(i * 2.1).translate(Math.cos(i * 2.1) * 0.08, 0, Math.sin(i * 2.1) * 0.08));
  }
  return merge(parts);
}

/** A rock: a faceted lump, wider than high, its faces uneven. */
export function rockGeometry(seed = 5): THREE.BufferGeometry {
  const rnd = mulberry32(seed), g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.getAttribute('position') as THREE.BufferAttribute, seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let f = seen.get(k);
    if (f === undefined) { f = 0.75 + rnd() * 0.45; seen.set(k, f); }
    pos.setXYZ(i, pos.getX(i) * f * 1.15, pos.getY(i) * f * 0.7, pos.getZ(i) * f);
  }
  return flat(g.translate(0, 0.35, 0));
}

/** An anemone: a short stalk and a crown of tentacles curling out, about 0.45 m. */
export function anemoneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.13, 0.16, 0.22, 7).translate(0, 0.11, 0)];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, tilt = 0.5 + (i % 2) * 0.25;
    parts.push(new THREE.ConeGeometry(0.035, 0.28, 4).translate(0, 0.14, 0).rotateZ(tilt).rotateY(a).translate(Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.1));
  }
  return merge(parts);
}

/** A shell of the garden: a scallop (`fan`) or a spiral cone (`spiral`), about 0.5 m. */
export function shellGeometry(kind: 'fan' | 'spiral'): THREE.BufferGeometry {
  if (kind === 'spiral') {
    const g = new THREE.ConeGeometry(0.22, 0.6, 7, 3).rotateZ(Math.PI / 2 - 0.3).translate(0, 0.16, 0);
    return flat(g);
  }
  // ribs of the scallop: a half disc lifted into a shallow dome, ribbed by its segments
  const g = new THREE.SphereGeometry(0.35, 9, 3, -Math.PI / 2, Math.PI, 0, Math.PI / 2).scale(1, 0.35, 1.2);
  return flat(g);
}

/** How much harder than its `strength` the water sways the kelp now: the magic's (./magic.ts), 1 with none. One for all the kelp. */
export const uKelpSway = { value: 1 };

/** m from the camera: kelp nearer than `out` thins, nearer than `in` is gone (the camera's own window, see swayMaterial). */
export const KELP_FADE = { in: 2.5, out: 5.5 };

/**
 * A material that sways what it draws with the water: each vertex moves sideways by its height over the instance's
 * foot (a ribbon bends, its foot stays), in time and in a phase of the instance's place. `strength` m at 3 m up.
 * Kelp at the lens or between the camera and her dissolves (src/core/materials.ts fadeAtCamera), as the forest's trees:
 * a clump by the camera never fills half the picture.
 */
export function swayMaterial(base: THREE.MeshStandardMaterial, strength = 0.35): { material: THREE.MeshStandardMaterial; time: { value: number } } {
  const time = { value: 0 };
  const m = base.clone();
  m.onBeforeCompile = (s) => {
    s.uniforms.uSwayTime = time;
    s.uniforms.uKelpSway = uKelpSway;
    s.uniforms.uMute = uMute;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSwayTime;\nuniform float uKelpSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
          float swPh = 0.0;
        #endif
        float swK = max(0.0, transformed.y) / 3.0 * sqrt(uKelpSway);
        transformed.x += sin(uSwayTime * 0.9 + swPh) * ${strength.toFixed(3)} * swK * swK;
        transformed.z += cos(uSwayTime * 0.7 + swPh * 1.3) * ${(strength * 0.6).toFixed(3)} * swK * swK;`);
    fadeAtCamera(s);
    // and wider than the forest's lens (NEAR_FADE): she swims low, the ribbons stand as high as the camera - a clump
    // nearer than KELP_FADE.out thins into dots, nearer than `in` it is gone
    s.fragmentShader = s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  {
    float kelpKeep = smoothstep(${KELP_FADE.in.toFixed(2)}, ${KELP_FADE.out.toFixed(2)}, length(vViewPosition));
    if (kelpKeep < 1.0) {
      ivec2 kq = ivec2(mod(gl_FragCoord.xy, 4.0));
      const float kb[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
      float kd = kb[kq.x + kq.y * 4] / 16.0 + 1.0 / 32.0;   // the 4x4 ordered dither of fadeAtCamera's
      if (kelpKeep < kd) discard;
    }
  }`).replace('#include <opaque_fragment>', `${MUTE_GLSL}
  #include <opaque_fragment>`);
    s.fragmentShader = 'uniform float uMute;\n' + s.fragmentShader;
  };
  m.customProgramCacheKey = () => `sea-sway-${strength}|fade|kelp|mute`;
  return { material: m, time };
}
