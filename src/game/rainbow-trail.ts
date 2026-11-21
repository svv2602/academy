/**
 * The rainbow's trail (the potion brewed from two worlds, PLAY-26): while the rainbow acts, a ribbon of its seven
 * colours lies on the ground behind her where she walked, fading toward its tail. One mesh, drawn only while the
 * potion acts (one draw call then, none else). A world short of draw calls (the hub on its fourth stage, at its 80)
 * turns the ribbon off (`rainbowRibbon`): the trail is then sparkles of the shared pool alone, which cost no call.
 */
import * as THREE from 'three';

/** The colours, from the outer edge in. */
export const RAINBOW_COLOURS = ['#ff4f4f', '#ff9f3a', '#ffe03a', '#52d26a', '#3cb4ff', '#6f6cff', '#c86cff'] as const;
/** How many points of her way the ribbon keeps, and how far apart (m). */
export const TRAIL_POINTS = 40, TRAIL_STEP = 0.18;
/** m: the ribbon's width across her way. */
export const TRAIL_WIDTH = 0.7;

let ribbon = true;
/** Whether the ribbon may be drawn in the world played (the hub turns it off on its fourth stage); returns the undo. */
export function rainbowRibbon(on: boolean): () => void {
  ribbon = on;
  return () => { ribbon = true; };
}
export const ribbonAllowed = () => ribbon;

/** The trail in `scene`: `update` each frame with where she is; drawn only while `active` and allowed. */
export function createRainbowTrail(scene: THREE.Scene) {
  const bands = RAINBOW_COLOURS.length, across = bands + 1;
  const way: THREE.Vector3[] = [];
  const pos = new Float32Array(TRAIL_POINTS * across * 3), col = new Float32Array(TRAIL_POINTS * across * 4);
  const index: number[] = [];
  for (let i = 0; i < TRAIL_POINTS - 1; i++) {
    for (let b = 0; b < bands; b++) {
      const a = i * across + b, c = (i + 1) * across + b;
      index.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.name = 'rainbow-trail'; mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2;
  scene.add(mesh);
  const colours = RAINBOW_COLOURS.map((h) => new THREE.Color(h));
  const side = new THREE.Vector3();

  return {
    mesh,
    /** A frame: `hp` - her feet; `active` - the rainbow acts now. */
    update(hp: THREE.Vector3, active: boolean) {
      if (!active || !ribbon) { mesh.visible = false; if (!active) way.length = 0; return; }
      const last = way[0];
      if (!last || last.distanceTo(hp) > TRAIL_STEP) { way.unshift(hp.clone()); if (way.length > TRAIL_POINTS) way.pop(); }
      mesh.visible = way.length > 1;
      if (!mesh.visible) return;
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const p = way[Math.min(i, way.length - 1)], q = way[Math.min(i + 1, way.length - 1)] ?? p, r = way[Math.min(Math.max(0, i - 1), way.length - 1)];
        side.set(q.z - r.z, 0, r.x - q.x);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize().multiplyScalar(TRAIL_WIDTH);
        const fade = i < way.length ? (1 - i / TRAIL_POINTS) * 0.9 : 0;
        for (let k = 0; k < across; k++) {
          const u = k / bands - 0.5, o = (i * across + k);
          pos.set([p.x + side.x * u, p.y + 0.06, p.z + side.z * u], o * 3);
          const c = colours[Math.min(bands - 1, k === bands ? bands - 1 : k)];
          col.set([c.r, c.g, c.b, fade], o * 4);
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); geo.dispose(); (mesh.material as THREE.Material).dispose(); },
  };
}
