/**
 * What stands between the camera and an open task in the world (the debug door `__game.worldTask.blockers()`): the
 * hull of the sunken ship stood in the frame of Pantsyr's halves (2026-11-27), half of the shell hidden. A straight line
 * from the camera to each thing to tap and to the task's middle; whatever visible solid thing of the scene it crosses
 * is named by its topmost named parent (`landmark-ship`), with how many of the lines it crosses.
 *
 * Not counted: the task's own things (whatever lies inside its footprint, `extent` around `center`, up to TASK_TOP over
 * it - a thing of the world lying right on the task is not caught here), the things the caller skips (the heroine and
 * the cat), what is hidden, points and lines (bubbles, sparkles), and what is all but transparent.
 */
import * as THREE from 'three';
import type { WorldTaskShow } from './core';

/** m around the footprint and over it still taken as the task's own. */
export const TASK_MARGIN = 0.3;
export const TASK_TOP = 3;
/** Below this opacity a thing does not hide what is behind it. */
const SEE_THROUGH = 0.2;

export interface Blocker { name: string; lines: number }

function shown(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function solid(o: THREE.Object3D): boolean {
  const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  if (!(o as THREE.Mesh).isMesh || !m) return false;
  return (Array.isArray(m) ? m : [m]).some((x) => x.visible && x.colorWrite !== false && !(x.transparent && x.opacity < SEE_THROUGH));
}

function nameOf(o: THREE.Object3D, root: THREE.Object3D): string {
  let named = '';
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.name) named = p.name;
  return named || `${o.type}#${o.id}`;
}

/** The task's own place: its footprint across and along `facing`, a little around it, and up to TASK_TOP over it. */
export function inTask(show: Pick<WorldTaskShow, 'center' | 'facing' | 'extent'>, p: THREE.Vector3): boolean {
  const dx = p.x - show.center.x, dz = p.z - show.center.z, dy = p.y - show.center.y;
  const along = dx * Math.sin(show.facing) + dz * Math.cos(show.facing);
  const across = dx * Math.cos(show.facing) - dz * Math.sin(show.facing);
  return Math.abs(across) <= show.extent.side + TASK_MARGIN && Math.abs(along) <= show.extent.depth + TASK_MARGIN
    && dy >= -1 && dy <= TASK_TOP;
}

/** The things standing between `eye` and the task `show`, the most crossing first; empty - the task is seen whole. */
export function blockersOf(root: THREE.Object3D, eye: THREE.Vector3, show: Pick<WorldTaskShow, 'center' | 'facing' | 'extent' | 'targets'>,
  skip: readonly THREE.Object3D[] = []): Blocker[] {
  const skipped = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (skip.includes(p)) return true; return false; };
  const ray = new THREE.Raycaster(), dir = new THREE.Vector3();
  const lines = new Map<string, number>();
  // the solid things shown, once; one by one - a skinned body whose bones are not bound yet throws on a ray, and stands
  // in no way then
  const things: THREE.Object3D[] = [];
  root.traverse((o) => { if (solid(o) && shown(o) && !skipped(o)) things.push(o); });
  const hits = (): THREE.Intersection[] => things.flatMap((o) => { try { return ray.intersectObject(o, false); } catch { return []; } });
  for (const p of [show.center, ...show.targets().map((t) => t.pos)]) {
    const len = dir.subVectors(p, eye).length();
    if (len < 1e-3) continue;
    ray.set(eye, dir.normalize()); ray.near = 0; ray.far = len;
    const crossed = new Set<string>();
    for (const h of hits()) {
      if (inTask(show, h.point)) continue;
      crossed.add(nameOf(h.object, root));
    }
    for (const n of crossed) lines.set(n, (lines.get(n) ?? 0) + 1);
  }
  return [...lines].map(([name, n]) => ({ name, lines: n })).sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
}
