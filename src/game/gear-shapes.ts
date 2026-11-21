import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { facets, mat } from '../core/style';

/**
 * The things built by code, not loaded (docs/worlds/style.md: our own shape on the frame, its weight only code): the
 * gifts of the characters for a trade (PLAY-28) - the crown of feathers and the acorn cap of the heroine, the leaf bow
 * of the fawn. The core's models are at their budget (TECH-09, 10 MB); a thing of a few shapes costs no file.
 *
 * Each is built where a loaded one would be: in the rest-pose space of its wearer's unscaled model, as tools/items/
 * items.py and pet_items.py model theirs - in Blender's axes (z up, the face to -y), turned here into the model's own
 * (y up: Blender's (x, y, z) is (x, z, -y)). src/game/gear.ts and petgear.ts hang it under its bone as they hang a
 * loaded one. The parts of one material are merged: a thing is one draw a material.
 */

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material };
const BLENDER_TO_MODEL = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

/** An ellipsoid of semi-axes `r` at `at` (Blender's axes), turned by `rot` (Euler XYZ, radians). */
function egg(n: number, at: readonly number[], r: readonly number[], rot: readonly number[] = [0, 0, 0]) {
  return new THREE.SphereGeometry(1, n, Math.max(3, Math.round(n / 2))).scale(r[0], r[1], r[2])
    .applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])))
    .translate(at[0], at[1], at[2]);
}

/** The parts merged by material, turned into the model's axes: one mesh a material, each casting a shadow. */
function assemble(name: string, parts: Part[]): THREE.Group {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) (byMat.get(p.mat) ?? byMat.set(p.mat, []).get(p.mat)!).push(p.geo.toNonIndexed());
  const g = new THREE.Group();
  g.name = name;
  for (const [m, geos] of byMat) {
    const geo = mergeGeometries(geos)!.applyMatrix4(BLENDER_TO_MODEL);
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

/** The crown of feathers: a golden band round her head and seven feathers up round its back and sides, never over the face. */
function featherCrown(): THREE.Group {
  const parts: Part[] = [{ geo: new THREE.TorusGeometry(0.2, 0.018, 6, 20).rotateX(THREE.MathUtils.degToRad(-8)).translate(0, 0.03, 1.12), mat: mat.glow('gold', 0.25) }];
  const feather = mat.cloth('white'), tips = [mat.glow('lilac', 0.2), mat.glow('gold', 0.2)];
  [-150, -120, -90, -60, -30, 0, 30].forEach((deg, i) => {
    const a = THREE.MathUtils.degToRad(deg + 90), ox = Math.sin(a), oy = Math.cos(a);     // 0 at the back (+y), round to the sides
    const x = 0.2 * ox, y = 0.03 + 0.2 * oy, h = i === 3 ? 0.17 : 0.13;
    const lean = [THREE.MathUtils.degToRad(-14) * oy, THREE.MathUtils.degToRad(14) * ox, 0];
    parts.push({ geo: egg(6, [x + ox * 0.02, y + oy * 0.02, 1.13 + h / 2], [0.0385, 0.012, h / 2], lean), mat: feather });
    parts.push({ geo: egg(4, [x + ox * 0.035, y + oy * 0.035, 1.13 + h * 0.95], [0.022, 0.013, 0.029]), mat: tips[i % 2] });
  });
  return assemble('feather_crown', parts);
}

/** The acorn cap: the cup of an acorn over the top of her head, a little wider than the hair, knobbly, a short stalk on top. */
function acornCap(): THREE.Group {
  const Z = 1.08, R = [0.3, 0.28, 0.16];
  const parts: Part[] = [{ geo: egg(facets(0.6), [0, 0.02, Z], R), mat: mat.wood('#8c6142') }];
  const knob = mat.wood('#9e7350');
  for (const [ring, [zr, n]] of ([[0.4, 9], [0.75, 6]] as const).entries()) {
    for (let i = 0; i < n; i++) {
      const a = THREE.MathUtils.degToRad(i * 360 / n + ring * 13), el = Math.acos(zr);
      parts.push({ geo: egg(4, [R[0] * Math.sin(el) * Math.cos(a), 0.02 + R[1] * Math.sin(el) * Math.sin(a), Z + R[2] * zr], [0.025, 0.025, 0.015]), mat: knob });
    }
  }
  parts.push({ geo: new THREE.CylinderGeometry(0.018, 0.018, 0.08, 6).rotateX(Math.PI / 2).rotateY(THREE.MathUtils.degToRad(12)).translate(0.01, 0.02, Z + R[2] + 0.03), mat: mat.wood('woodDark') });
  return assemble('acorn_cap', parts);
}

/** The fawn's leaf bow: by its left ear, two autumn leaves for loops and an acorn-brown knot (the units of the fawn's model, 1.5 times big as its other things). */
function fawnLeafBow(): THREE.Group {
  const at = [0.28, -1.86, 4.0], k = 1.5;
  return assemble('fawn_leaf_bow', [
    { geo: egg(8, [at[0] - 0.1 * k, at[1], at[2] + 0.02 * k], [0.125 * k, 0.035 * k, 0.06 * k]), mat: mat.cloth('#ff8c26') },
    { geo: egg(8, [at[0] + 0.1 * k, at[1], at[2] + 0.02 * k], [0.125 * k, 0.035 * k, 0.06 * k]), mat: mat.cloth('#e64026') },
    { geo: egg(6, at, [0.05 * k, 0.04 * k, 0.05 * k]), mat: mat.wood('#8c6142') },
  ]);
}

/** The things built here, by id: what loadGear / loadPetGear hang instead of a loaded model. */
export const BUILT: Readonly<Record<string, () => THREE.Group>> = { feather_crown: featherCrown, acorn_cap: acornCap, fawn_leaf_bow: fawnLeafBow };
