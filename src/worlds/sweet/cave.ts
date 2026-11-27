import * as THREE from 'three';
import type { Game } from '../../game/context';
import type { WorldScope } from '../../game/scope';
import { CAVE } from './layout';
import { paint, paintMaterial, type Part } from './landmarks';
import { colliders, height } from './terrain';

/**
 * The cave behind the chocolate waterfall (the lead's offer of 2026-11-27 after the sea's grotto: the secret places of
 * the Sweet Land, plan idea/proposal/sweet-secrets-2026-11-27). A horseshoe of wafer rock just past the end of the
 * chocolate river (CAVE, ./layout.ts), its mouth toward the river; chocolate pours from its brow over the mouth in
 * ribbons that part round the heroine as she walks through them. Inside: a vault of wafer, lollipop stalactites,
 * bright candies on the walls and, at the back, a basket of golden candies - walking up to it is the find (the world's
 * secret `choco_cave`, ./secrets.ts: 3 stars and the cat's word). Inside the camera comes closer, as in the first
 * world's glade behind the waterfall.
 *
 * Draw calls: the rock with all inside it is one painted mesh (seen from SHOW_FAR m), the pouring chocolate a second
 * one, drawn only near (SHOW_NEAR): two more in the world at most, neither casting a shadow.
 */

/** m: the rock is drawn while she is this near; the pouring chocolate this near. */
export const SHOW_FAR = 60, SHOW_NEAR = 26;
/** m from the middle where walking in finds the basket; the camera's distance inside, from where it eases. */
export const FIND_R = 1.3, CAVE_CAM = 2.6;
/** The ribbons of chocolate across the mouth, and how near her a ribbon parts. */
export const RIBBONS = 7, PART_R = 1.3;
/** The opening of the horseshoe, radians round its middle, centred on the mouth. */
export const MOUTH = 1.4;

/** The way out of the mouth (unit), its middle, where she stands inside at the basket, the basket. */
export function caveOf() {
  const out = { x: Math.sin(CAVE.yaw), z: Math.cos(CAVE.yaw) };
  const mouth = { x: CAVE.x + out.x * CAVE.r, z: CAVE.z + out.z * CAVE.r };
  const basket = { x: CAVE.x - out.x * (CAVE.r - 1.0), z: CAVE.z - out.z * (CAVE.r - 1.0) };
  const find = { x: CAVE.x - out.x * 0.6, z: CAVE.z - out.z * 0.6 };
  return { out, mouth, basket, find };
}

/** The wall stones round the horseshoe: their places (angle from the mouth's way), for the shape and the colliders. */
export function caveStones(): { x: number; z: number; a: number }[] {
  const out: { x: number; z: number; a: number }[] = [];
  for (let k = 0; k < 14; k++) {
    const a = MOUTH / 2 + (k / 13) * (Math.PI * 2 - MOUTH);
    const ang = CAVE.yaw + a;
    out.push({ x: CAVE.x + Math.sin(ang) * CAVE.r, z: CAVE.z + Math.cos(ang) * CAVE.r, a: ang });
  }
  return out;
}

/** The rock and all inside: wafer blocks round, a vault over, stalactites, candies, the basket. World coordinates. */
export function caveGeometry(): THREE.BufferGeometry {
  const y0 = height(CAVE.x, CAVE.z) - 0.2, parts: Part[] = [], H = CAVE.h, c = caveOf();
  for (const [i, s] of caveStones().entries()) {
    // a wafer block: light biscuit with darker grid lines, the tallest at the back
    const back = 1 - Math.abs(Math.cos(s.a - CAVE.yaw)) * 0.25;
    const h = H * back;
    parts.push([new THREE.BoxGeometry(1.7, h, 1.1).rotateY(s.a).translate(s.x, y0 + h / 2, s.z), i % 2 ? '#d9a35b' : '#e3b46b']);
    parts.push([new THREE.BoxGeometry(1.72, 0.06, 1.12).rotateY(s.a).translate(s.x, y0 + h * 0.5, s.z), '#b5803e']);
  }
  // the vault: a dome of chocolate over the horseshoe, open over the mouth (a part of a sphere)
  parts.push([new THREE.SphereGeometry(CAVE.r + 0.6, 14, 6, MOUTH / 2 + Math.PI / 2, Math.PI * 2 - MOUTH, 0, Math.PI / 2).rotateY(CAVE.yaw - Math.PI / 2).scale(1, 0.5, 1).translate(CAVE.x, y0 + H * 0.85, CAVE.z), '#6b4226']);
  // the brow over the mouth the chocolate pours from
  parts.push([new THREE.BoxGeometry(3.2, 0.5, 0.8).rotateY(CAVE.yaw).translate(c.mouth.x, y0 + H - 0.2, c.mouth.z), '#5a361e']);
  // lollipop stalactites under the vault, bright candies on the wall stones
  const tints = ['#ff6fa3', '#ffd84a', '#7bd36a', '#a8e4ff', '#d67bff'];
  for (let k = 0; k < 7; k++) {
    const a = CAVE.yaw + Math.PI + (k - 3) * 0.55, rr = CAVE.r * 0.55;
    parts.push([new THREE.ConeGeometry(0.16, 0.9, 6).rotateX(Math.PI).translate(CAVE.x + Math.sin(a) * rr, y0 + H * 0.78, CAVE.z + Math.cos(a) * rr), tints[k % tints.length]]);
  }
  for (const [i, s] of caveStones().entries()) {
    if (i % 2) continue;
    const inX = CAVE.x + (s.x - CAVE.x) * 0.82, inZ = CAVE.z + (s.z - CAVE.z) * 0.82;
    parts.push([new THREE.SphereGeometry(0.14, 6, 4).translate(inX, y0 + 1.6 + (i % 3) * 0.4, inZ), tints[i % tints.length]]);
  }
  // the basket of golden candies at the back
  parts.push([new THREE.CylinderGeometry(0.5, 0.38, 0.45, 10, 1, true).translate(c.basket.x, y0 + 0.42, c.basket.z), '#b07a3a']);
  parts.push([new THREE.TorusGeometry(0.5, 0.05, 4, 12).rotateX(Math.PI / 2).translate(c.basket.x, y0 + 0.64, c.basket.z), '#8a5a28']);
  for (let k = 0; k < 6; k++) parts.push([new THREE.SphereGeometry(0.13, 6, 4).translate(c.basket.x + Math.cos(k) * 0.25, y0 + 0.66 + (k % 2) * 0.06, c.basket.z + Math.sin(k) * 0.25), '#ffd447']);
  return paint(parts);
}

/** The ribbons of pouring chocolate across the mouth, one geometry; each ribbon a thin plane from the brow to the ground. */
export function curtainGeometry(): THREE.BufferGeometry {
  const y0 = height(CAVE.x, CAVE.z) - 0.2, c = caveOf(), parts: Part[] = [];
  for (let k = 0; k < RIBBONS; k++) {
    const t = (k / (RIBBONS - 1) - 0.5) * 2.6;
    const x = c.mouth.x + Math.cos(CAVE.yaw) * t, z = c.mouth.z - Math.sin(CAVE.yaw) * t;
    parts.push([new THREE.PlaneGeometry(0.42, CAVE.h - 0.2).rotateY(CAVE.yaw).translate(x, y0 + (CAVE.h - 0.2) / 2, z), k % 2 ? '#7a4a28' : '#8a5530']);
  }
  return paint(parts);
}

export interface ChocoCave {
  /** Whether she is inside the horseshoe now. */
  inside(): boolean;
  /** Where she walks to for the find (the walkthrough, the description). */
  readonly findAt: { x: number; z: number };
  /** A frame: the pouring sways and parts round her, what is drawn by her distance, the find, the camera. */
  update(time: number): void;
  /** What the measurements read: the draw of each part now. */
  readonly debug: { rock: THREE.Mesh; curtain: THREE.Mesh };
}

/** The cave in the scene; `find` - walking up to the basket (./secrets.ts gives it once). */
export function createChocoCave(g: Pick<Game, 'scene' | 'hero' | 'camOverride'>, scope: WorldScope, find: (at: THREE.Vector3) => void): ChocoCave {
  const { scene, hero } = g;
  const c = caveOf();
  const rock = new THREE.Mesh(caveGeometry(), paintMaterial());
  rock.name = 'choco-cave'; rock.castShadow = false; rock.receiveShadow = true;
  const curtain = new THREE.Mesh(curtainGeometry(), paintMaterial());
  curtain.name = 'choco-fall'; curtain.castShadow = false;
  scene.add(rock, curtain);
  scope.own(() => { rock.removeFromParent(); curtain.removeFromParent(); rock.geometry.dispose(); curtain.geometry.dispose(); });
  // the wall stones stop her; the mouth stays open
  for (const s of caveStones()) colliders.push({ x: s.x, z: s.z, r: 0.75 });
  const base = (curtain.geometry.getAttribute('position').array as Float32Array).slice();
  const hp = hero.root.position;
  const findAt = new THREE.Vector3(c.find.x, height(c.find.x, c.find.z), c.find.z);
  const inside = () => Math.hypot(hp.x - CAVE.x, hp.z - CAVE.z) < CAVE.r - 0.4;
  let camHere = false;
  return {
    inside, findAt: c.find,
    debug: { rock, curtain },
    update(time) {
      const d = Math.hypot(hp.x - CAVE.x, hp.z - CAVE.z);
      rock.visible = d < SHOW_FAR;
      curtain.visible = d < SHOW_NEAR;
      if (curtain.visible) {
        // the ribbons sway a little, and the ones near her bend away from her (she walks through them)
        const pos = curtain.geometry.getAttribute('position') as THREE.BufferAttribute, a = pos.array as Float32Array;
        for (let i = 0; i < a.length; i += 3) {
          const x = base[i], y = base[i + 1], z = base[i + 2];
          const dx = x - hp.x, dz = z - hp.z, near = Math.hypot(dx, dz), push = near < PART_R ? (PART_R - near) / PART_R : 0;
          const sway = Math.sin(time * 2 + x * 3 + z * 2) * 0.05;
          a[i] = x + sway + (near > 1e-3 ? (dx / near) * push * 0.9 : 0);
          a[i + 1] = y;
          a[i + 2] = z + (near > 1e-3 ? (dz / near) * push * 0.9 : 0);
        }
        pos.needsUpdate = true;
      }
      if (Math.hypot(hp.x - c.find.x, hp.z - c.find.z) < FIND_R) find(findAt);
      // inside the camera comes closer, as in the first world's glade
      const inNow = inside();
      if (inNow && !camHere) { g.camOverride = CAVE_CAM; camHere = true; }
      else if (!inNow && camHere) { if (g.camOverride === CAVE_CAM) g.camOverride = null; camHere = false; }
    },
  };
}
