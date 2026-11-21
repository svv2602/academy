import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The cauldron by the Great Tree (PLAY-26): where it stands - by the roots on the side of the fairies' arch, off the
 * passage, the spot she arrives at and the tips of the roots (./hub.test.ts) - and its shape: a black pot on three
 * legs, a violet brew under a rim, a little steam. Vertex-coloured, drawn in the keepsakes' call (./keepsakes.ts).
 */
export const CAULDRON = { x: -3.6, z: 7.6, r: 0.75 } as const;

const paint = (g: THREE.BufferGeometry, hex: string) => {
  const s = g.index ? g.toNonIndexed() : g, c = new THREE.Color(hex), n = s.getAttribute('position').count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  s.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.deleteAttribute('uv');
  if (s !== g) g.dispose();
  return s;
};

/** The cauldron's geometry, in the map's metres, standing on y = 0. */
export function cauldronGeometry(): THREE.BufferGeometry {
  const pot = paint(new THREE.SphereGeometry(0.62, 10, 6, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.72).translate(0, 0.68, 0), '#34343f');
  const rim = paint(new THREE.TorusGeometry(0.5, 0.07, 5, 14).rotateX(Math.PI / 2).translate(0, 1.07, 0), '#55556a');
  const brew = paint(new THREE.CircleGeometry(0.47, 14).rotateX(-Math.PI / 2).translate(0, 1.0, 0), '#b07bff');
  const legs = [0, 2.1, 4.2].map((a) => paint(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 5).translate(Math.sin(a) * 0.38, 0.15, Math.cos(a) * 0.38), '#2a2a33'));
  const steam = [0, 1, 2].map((i) => paint(new THREE.IcosahedronGeometry(0.12 + i * 0.03, 0).translate(-0.1 + i * 0.1, 1.25 + i * 0.22, 0.05 * i), '#f4eefe'));
  const g = mergeGeometries([pot, rim, brew, ...legs, ...steam], false)!;
  [pot, rim, brew, ...legs, ...steam].forEach((p) => p.dispose());
  g.translate(CAULDRON.x, 0, CAULDRON.z);
  g.computeVertexNormals();
  return g;
}
