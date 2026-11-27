import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The magic board by the Great Tree (src/game/trainer.ts): where it stands - by the roots, off the passages, the spots
 * she arrives at, the tips of the roots and the tour (./board-look.test.ts), as the cauldron (./cauldron-look.ts) - and
 * its shape: a slate in a wooden frame on an easel of three legs, a few chalk marks and a star over it. Vertex-coloured,
 * drawn in the nests' call (./arch-look.ts): no draw call of its own. `face`: the angle it turns to, its slate away
 * from the trunk, to the glade she comes from.
 */
export const BOARD = { x: 3.6, z: 7.6, r: 0.75, face: Math.atan2(3.6, 7.6) } as const;

const paint = (g: THREE.BufferGeometry, hex: string) => {
  const s = g.index ? g.toNonIndexed() : g, c = new THREE.Color(hex), n = s.getAttribute('position').count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  s.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.deleteAttribute('uv');
  if (s !== g) g.dispose();
  return s;
};

/** The board's geometry, in the map's metres, standing on y = 0. */
export function boardGeometry(): THREE.BufferGeometry {
  const wood = '#a8743e', tilt = -0.18;
  // the easel: two legs in front, leaning back, and one behind
  const legs = [-0.42, 0.42].map((x) => paint(new THREE.BoxGeometry(0.08, 1.7, 0.08).rotateX(tilt).translate(x, 0.84, 0.05), wood));
  const back = paint(new THREE.BoxGeometry(0.07, 1.6, 0.07).rotateX(0.42).translate(0, 0.78, -0.38), wood);
  // the slate in its frame, leaning on the legs, and the ledge under it for the chalk
  const frame = paint(new THREE.BoxGeometry(1.12, 0.84, 0.06).rotateX(tilt).translate(0, 1.18, 0.1), wood);
  const slate = paint(new THREE.BoxGeometry(0.98, 0.7, 0.02).rotateX(tilt).translate(0, 1.18, 0.14), '#2f4a3c');
  const ledge = paint(new THREE.BoxGeometry(1.0, 0.05, 0.12).translate(0, 0.72, 0.2), wood);
  // chalk marks: "1 + 2" in strokes, a line under it; a stick of chalk on the ledge
  const chalk = '#f4f1e6';
  const marks = [
    [-0.28, 1.3, 0.04, 0.2], [-0.06, 1.3, 0.16, 0.04], [-0.06, 1.3, 0.04, 0.16], [0.2, 1.36, 0.14, 0.04], [0.2, 1.24, 0.14, 0.04], [0.27, 1.3, 0.04, 0.12],
    [0, 1.05, 0.62, 0.03],
  ].map(([x, y, w, h]) => paint(new THREE.BoxGeometry(w, h, 0.01).rotateX(tilt).translate(x, y, 0.16), chalk));
  const stick = paint(new THREE.BoxGeometry(0.14, 0.04, 0.04).translate(0.25, 0.77, 0.22), chalk);
  // a little gold star on the top of the frame
  const star = paint(new THREE.OctahedronGeometry(0.13, 0).scale(1, 1, 0.45).translate(0, 1.7, 0.02), '#ffd447');
  const parts = [...legs, back, frame, slate, ledge, ...marks, stick, star];
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  g.rotateY(BOARD.face);
  g.translate(BOARD.x, 0, BOARD.z);
  g.computeVertexNormals();
  return g;
}
