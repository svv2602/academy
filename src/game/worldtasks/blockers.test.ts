/**
 * What stands between the camera and an open task in the world (./blockers.ts): a wall on the way is named by its
 * topmost named parent; the task's own things, the heroine and the cat, what is hidden, see-through or a cloud of
 * points are not.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { blockersOf, inTask } from './blockers';

const show = (targets: THREE.Vector3[] = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)]) => ({
  center: new THREE.Vector3(0, 0, 0), facing: 0, extent: { side: 1.2, depth: 0.8 },
  targets: () => targets.map((pos) => ({ pos, right: false })),
});
// the camera behind the task (facing 0 looks along +z: the camera stands at -z), up over it
const EYE = new THREE.Vector3(0, 4, -4);

function box(at: THREE.Vector3, name = '', size = 1, mat: THREE.Material = new THREE.MeshBasicMaterial()) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size * 4, size, size), mat);
  m.position.copy(at);
  if (name) m.name = name;
  return m;
}
const scene = (...things: THREE.Object3D[]) => { const s = new THREE.Scene(); s.add(...things); s.updateMatrixWorld(true); return s; };
const WAY = new THREE.Vector3(0, 2, -2);       // half way from the camera to the task

describe('blockersOf', () => {
  it('nothing on the way: the task is seen whole', () => {
    expect(blockersOf(scene(box(new THREE.Vector3(0, 0, 8), 'behind')), EYE, show())).toEqual([]);
  });

  it('a hull on the way is named by its topmost named parent, with the lines it crosses', () => {
    const ship = new THREE.Group(); ship.name = 'landmark-ship';
    const hull = new THREE.Group(); hull.name = 'hull'; hull.add(box(WAY));
    ship.add(hull);
    expect(blockersOf(scene(ship), EYE, show())).toEqual([{ name: 'landmark-ship', lines: 3 }]);
  });

  it('the task\'s own things, the heroine and the cat are not in the way', () => {
    const own = box(new THREE.Vector3(0, 0.5, -0.5), 'valve', 0.3);
    expect(inTask(show(), own.position)).toBe(true);
    const hero = new THREE.Group(); hero.add(box(WAY));
    expect(blockersOf(scene(own, hero), EYE, show(), [hero])).toEqual([]);
  });

  it('the things the task names its own (WorldTaskShow.own) are not in the way, wherever they stand', () => {
    const facade = new THREE.Group(); facade.name = 'facade'; facade.add(box(WAY));
    expect(blockersOf(scene(facade), EYE, { ...show(), own: [facade] })).toEqual([]);
    expect(blockersOf(scene(facade), EYE, show()).map((b) => b.name)).toEqual(['facade']);
  });

  it('hidden, see-through things and points are not in the way; a solid one is', () => {
    const hidden = box(WAY, 'hidden'); hidden.visible = false;
    const parentHidden = new THREE.Group(); parentHidden.visible = false; parentHidden.add(box(WAY, 'under-hidden'));
    const glass = box(WAY, 'glass', 1, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.1 }));
    const pts = new THREE.Points(new THREE.BufferGeometry().setFromPoints([WAY]), new THREE.PointsMaterial()); pts.name = 'bubbles';
    expect(blockersOf(scene(hidden, parentHidden, glass, pts), EYE, show())).toEqual([]);
    const smoke = box(WAY, 'smoke', 1, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6 }));
    expect(blockersOf(scene(smoke), EYE, show()).map((b) => b.name)).toEqual(['smoke']);
  });

  it('a thing only in front of one target crosses one line', () => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial()); post.name = 'post';
    post.position.set(0.5, 2, -2);
    expect(blockersOf(scene(post), EYE, show()).map((b) => [b.name, b.lines])).toEqual([['post', 1]]);
  });
});
