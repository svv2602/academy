import * as THREE from 'three';
/**
 * Prints on the ground (WORLD-15, the tracks): a module of its own - no texture drawn on a canvas as it loads, so the
 * worlds' tests load it as it is. What a world lays them along, and takes away.
 */
export interface Tracks {
  /** Lays paw prints along `lines` (each a line of points on the ground), the ones laid before taken away. */
  lay(lines: readonly (readonly { x: number; z: number }[])[]): void;
  /** How many prints lie now. */
  readonly count: number;
  /** Takes the prints out of the scene (leaving the world). */
  dispose(): void;
}

/** m between two prints, and how far a print lies off the middle of its line (left, right, left...). */
const PRINT_STEP = 0.55, PRINT_SIDE = 0.12, PRINTS_MAX = 600;

/**
 * Paw prints on the ground (WORLD-15): one instanced mesh of small flat shapes, a plain colour with no light (seen the
 * same on every level of quality: no shadow, no texture), a few centimetres over the ground and drawn over it
 * (polygon offset), so the grass of a level of quality does not cover them; they never fade.
 */
export function createTracks(scene: THREE.Scene, groundY: (x: number, z: number) => number): Tracks {
  // a print: a pad and three toes, flat, its toes toward +z
  const parts = [new THREE.CircleGeometry(0.07, 10).translate(0, -0.02, 0)];
  for (const [x, z] of [[-0.06, 0.07], [0, 0.09], [0.06, 0.07]]) parts.push(new THREE.CircleGeometry(0.03, 8).translate(x, z, 0));
  const geo = new THREE.BufferGeometry();
  const pos: number[] = [], idx: number[] = [];
  for (const p of parts) {
    const base = pos.length / 3, a = p.getAttribute('position');
    for (let i = 0; i < a.count; i++) pos.push(a.getX(i), 0, -a.getY(i));    // laid flat: its y becomes -z
    const ix = p.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
    p.dispose();
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color: '#4a2f17', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, PRINTS_MAX);
  mesh.name = 'tracks'; mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1;
  scene.add(mesh);
  // a print a little larger than a squirrel's paw: seen from the camera behind her on a phone
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), one = new THREE.Vector3(1.4, 1, 1.4);
  return {
    get count() { return mesh.count; },
    lay(lines) {
      let n = 0;
      for (const line of lines) {
        let k = 0;
        for (let i = 0; i < line.length - 1 && n < PRINTS_MAX; i++) {
          const a = line[i], b = line[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
          if (len < 1e-3) continue;
          const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len, yaw = Math.atan2(dx, dz);
          for (let d = 0; d < len && n < PRINTS_MAX; d += PRINT_STEP, k++) {
            const side = (k % 2 ? 1 : -1) * PRINT_SIDE, x = a.x + dx * d + dz * side, z = a.z + dz * d - dx * side;
            mesh.setMatrixAt(n++, m4.compose(at.set(x, groundY(x, z) + 0.04, z), q.setFromAxisAngle(up, yaw), one));
          }
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); mesh.dispose(); },
  };
}
