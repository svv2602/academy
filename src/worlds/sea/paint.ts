/**
 * One painted shape of many parts (the plan of the sea's look, step B): every part its own colour and glow in the
 * vertices, the whole merged into one geometry drawn with one material - a landmark of a dozen parts is one draw call
 * (and one for its shadow), whatever its colours. The faces are flat (docs/worlds/style.md: faceted); the glow is
 * emissive from the material, the light of the world is not touched (WORLD-09: only materials shine).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class Paint {
  private readonly parts: THREE.BufferGeometry[] = [];

  /**
   * Adds `geo` (moved by `at` if given) in `colour`, shining `glow` (0 = none, 1 = its colour at full); `both`: seen from
   * both sides (a thin shell, a fan) - its faces once more, turned the other way.
   */
  add(geo: THREE.BufferGeometry, colour: THREE.ColorRepresentation, glow = 0, at?: THREE.Matrix4, both = false): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    if (at) g.applyMatrix4(at);
    if (both) {
      const a = g.getAttribute('position').array as Float32Array, back = new Float32Array(a.length);
      // each triangle's corners in the other order: its face turned
      for (let t = 0; t < a.length; t += 9) { back.set(a.subarray(t, t + 3), t); back.set(a.subarray(t + 6, t + 9), t + 3); back.set(a.subarray(t + 3, t + 6), t + 6); }
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...back], 3));
    }
    const n = g.getAttribute('position').count, c = new THREE.Color(colour);
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(new Array<number>(n).fill(glow), 1));
    this.parts.push(g);
    return this;
  }

  /**
   * Adds `geo` coloured vertex by vertex: `colourOf(x, y, z, c)` sets `c` for each corner by its place in `geo` (before
   * `at`) - a shimmer over a shell; it shines `glow`.
   */
  shade(geo: THREE.BufferGeometry, colourOf: (x: number, y: number, z: number, c: THREE.Color) => void, glow = 0, at?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    const pos = g.getAttribute('position'), n = pos.count, col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) { colourOf(pos.getX(i), pos.getY(i), pos.getZ(i), c); col.set([c.r, c.g, c.b], i * 3); }
    if (at) g.applyMatrix4(at);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(new Array<number>(n).fill(glow), 1));
    this.parts.push(g);
    return this;
  }

  /** Adds a geometry painted already (made by `geometry()` of another Paint), its colours and glow kept, moved by `at`. */
  keep(geo: THREE.BufferGeometry, at?: THREE.Matrix4): this {
    const g = geo.clone();
    if (!g.getAttribute('color') || !g.getAttribute('glow')) throw new Error('paint: keep wants a painted geometry');
    if (g.getAttribute('normal')) g.deleteAttribute('normal');
    if (at) g.applyMatrix4(at);
    this.parts.push(g);
    return this;
  }

  /** How many triangles so far. */
  get triangles(): number { return this.parts.reduce((s, g) => s + g.getAttribute('position').count / 3, 0); }

  /** The merged geometry, its faces flat. */
  geometry(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts);
    if (!g) throw new Error('paint: the parts did not merge');
    g.computeVertexNormals();
    return g;
  }

  /** One mesh of it all, named, with the shared material. */
  mesh(name: string, material = paintMaterial()): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(), material);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

let shared: THREE.MeshStandardMaterial | null = null;

/** The material of every painted shape: its colour from the vertices, its glow from the vertices too. One for the world. */
export function paintMaterial(): THREE.MeshStandardMaterial {
  if (shared) return shared;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float glow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = glow;');
    sh.fragmentShader = 'varying float vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow;');
  };
  m.customProgramCacheKey = () => 'sea-paint|glow';
  shared = m;
  return m;
}

/** A matrix: at (x, y, z), turned `yaw` about up (and `tilt` about x, `roll` about z, in that order before the yaw), scaled `s`. */
export function place(x: number, y: number, z: number, yaw = 0, s: number | THREE.Vector3 = 1, tilt = 0, roll = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, roll, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, typeof s === 'number' ? new THREE.Vector3(s, s, s) : s);
}
