/**
 * The pictures of "find the differences" (LEARN-18): a small glade built by code from shapes of its own (no file is
 * loaded: the core's shared load has no models of nature), drawn by the game's own renderer - no second WebGL context
 * on a phone - into a render target, once per picture as the task opens, and copied into a 2D canvas. The target, the
 * shapes and the materials are disposed of at once: nothing of it stays on the GPU, nothing is drawn per frame.
 *
 * Every thing stands so that it fills the lower part of its slot (src/game/tasks/diff.ts `slotRect`): its foot on the
 * ground under the slot's lower edge, its height about 3/4 of the slot's - a touch on what is seen is a touch in its zone.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DIFF_COLORS, slotRect, type DiffThing } from '../tasks/diff';

/** px of a picture as drawn (4:3); the canvas shows it at any size (CSS). */
export const PICTURE = { w: 512, h: 384 } as const;

let renderer: THREE.WebGLRenderer | null = null;
/** The game's renderer, handed in at the start (src/main.ts). Without one (a test) a picture stays blank. */
export function setTaskRenderer(r: THREE.WebGLRenderer | null) { renderer = r; }

const paint = (g: THREE.BufferGeometry, hex: string) => {
  const s = g.index ? g.toNonIndexed() : g, c = new THREE.Color(hex), n = s.getAttribute('position').count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  s.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.deleteAttribute('uv');
  if (s !== g) g.dispose();
  return s;
};
const merge = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts, false)!; parts.forEach((p) => p.dispose()); g.computeVertexNormals(); return g; };

/** A thing of the glade, 1 m tall, its foot at the origin. */
function shape(t: DiffThing): THREE.BufferGeometry {
  const color = DIFF_COLORS[t.color];
  switch (t.prop) {
    case 'tree': return merge([
      paint(new THREE.CylinderGeometry(0.07, 0.1, 0.45, 6).translate(0, 0.22, 0), '#7a5232'),
      paint(new THREE.IcosahedronGeometry(0.32, 0).translate(0, 0.7, 0), '#4f9e3a'),
    ]);
    case 'pine': return merge([
      paint(new THREE.CylinderGeometry(0.05, 0.07, 0.25, 6).translate(0, 0.12, 0), '#6b4528'),
      paint(new THREE.ConeGeometry(0.32, 0.45, 7).translate(0, 0.42, 0), '#2f7a47'),
      paint(new THREE.ConeGeometry(0.24, 0.38, 7).translate(0, 0.72, 0), '#34864f'),
    ]);
    case 'rock': return paint(new THREE.DodecahedronGeometry(0.42, 0).scale(1.1, 0.75, 0.9).translate(0, 0.3, 0), '#9a9aa2');
    case 'bush': return merge([
      paint(new THREE.IcosahedronGeometry(0.3, 0).translate(-0.18, 0.28, 0), '#5aa84a'),
      paint(new THREE.IcosahedronGeometry(0.34, 0).translate(0.15, 0.32, 0.05), '#4c9a40'),
      paint(new THREE.IcosahedronGeometry(0.26, 0).translate(0, 0.52, -0.05), '#62b552'),
    ]);
    case 'stump': return merge([
      paint(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 9).translate(0, 0.25, 0), '#8a5a34'),
      paint(new THREE.CylinderGeometry(0.33, 0.33, 0.02, 9).translate(0, 0.51, 0), '#e0b77f'),
    ]);
    case 'fern': return merge(Array.from({ length: 6 }, (_, i) =>
      paint(new THREE.ConeGeometry(0.09, 0.7, 4).scale(1, 1, 0.25).translate(0, 0.35, 0).rotateZ((i - 2.5) * 0.28), '#3f9a3a')));
    case 'mushrooms': return merge(Array.from({ length: t.n }, (_, i) => {
      const x = (i - (t.n - 1) / 2) * 0.34, s = i % 2 ? 0.8 : 1;
      return merge([
        paint(new THREE.CylinderGeometry(0.06 * s, 0.07 * s, 0.32 * s, 6).translate(x, 0.16 * s, 0), '#fff2dc'),
        paint(new THREE.SphereGeometry(0.17 * s, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 0.3 * s, 0), color),
      ]);
    }));
    case 'flowers': return merge(Array.from({ length: t.n }, (_, i) => {
      const x = (i - (t.n - 1) / 2) * 0.32;
      return merge([
        paint(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4).translate(x, 0.22, 0), '#3f8a33'),
        paint(new THREE.IcosahedronGeometry(0.13, 0).scale(1, 1, 0.4).translate(x, 0.5, 0), color),
        paint(new THREE.OctahedronGeometry(0.05, 0).translate(x, 0.5, 0.05), '#fff2a8'),
      ]);
    }));
  }
}

/** The camera of the pictures: over the glade, looking down at it, 4:3. */
function pictureCamera() {
  const cam = new THREE.PerspectiveCamera(40, PICTURE.w / PICTURE.h, 0.5, 60);
  cam.position.set(0, 5.5, 9); cam.lookAt(0, 0.6, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
}

/** Where the foot of the thing of slot (col, row) stands on the ground, and the scale that makes it its slot's size. */
export function placeOf(col: number, row: number, cam = pictureCamera()) {
  const r = slotRect(col, row), ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), foot = new THREE.Vector3();
  // the foot under the lower edge of the slot (a little above it: a thing is round at the bottom)
  ray.setFromCamera(new THREE.Vector2((r.x + r.w / 2) * 2 - 1, 1 - (r.y + r.h * 0.92) * 2), cam);
  ray.ray.intersectPlane(ground, foot);
  // 1 m at the foot is this much of the picture's height: the thing is scaled to 3/4 of its slot's height
  const top = foot.clone().setY(1).project(cam), bottom = foot.clone().project(cam), perMetre = (top.y - bottom.y) / 2;
  return { foot, scale: Math.min((r.h * 0.75) / perMetre, (r.w * 0.8) / (perMetre * PICTURE.h / PICTURE.w) / 1.1) };
}

/** The glade of `things` drawn into `canvas` (PICTURE's size); false - no renderer to draw it with. */
export function drawGlade(things: readonly DiffThing[], canvas: HTMLCanvasElement): boolean {
  canvas.width = PICTURE.w; canvas.height = PICTURE.h;
  if (!renderer) return false;
  const scene = new THREE.Scene(), cam = pictureCamera();
  scene.background = new THREE.Color('#bfe6ff');
  scene.add(new THREE.HemisphereLight('#ffffff', '#6f8f4a', 1.6));
  const sun = new THREE.DirectionalLight('#fff3dc', 1.6); sun.position.set(3, 8, 5); scene.add(sun);
  const owned: { dispose(): void }[] = [];
  const groundGeo = new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), groundMat = new THREE.MeshLambertMaterial({ color: '#8fcf6a' });
  scene.add(new THREE.Mesh(groundGeo, groundMat)); owned.push(groundGeo, groundMat);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }); owned.push(mat);
  for (const t of things) {
    const geo = shape(t), { foot, scale } = placeOf(t.col, t.row, cam), m = new THREE.Mesh(geo, mat);
    m.position.copy(foot); m.scale.setScalar(scale); m.rotation.y = (t.col * 0.7 + t.row) % 1 - 0.5;
    scene.add(m); owned.push(geo);
  }
  // sRGB: the renderer encodes the colours for the screen into the target as it does for the page (linear is dark)
  const target = new THREE.WebGLRenderTarget(PICTURE.w, PICTURE.h, { samples: 0, colorSpace: THREE.SRGBColorSpace });
  const before = renderer.getRenderTarget(), pixels = new Uint8Array(PICTURE.w * PICTURE.h * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(target, 0, 0, PICTURE.w, PICTURE.h, pixels);
  } finally {
    renderer.setRenderTarget(before);
    target.dispose();
    owned.forEach((o) => o.dispose());
  }
  // the target's rows go up, the canvas's go down
  const img = new ImageData(PICTURE.w, PICTURE.h), row = PICTURE.w * 4;
  for (let y = 0; y < PICTURE.h; y++) img.data.set(pixels.subarray((PICTURE.h - 1 - y) * row, (PICTURE.h - y) * row), y * row);
  canvas.getContext('2d')?.putImageData(img, 0, 0);
  return true;
}
