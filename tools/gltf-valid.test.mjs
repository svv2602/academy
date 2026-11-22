// Runs in `npm test`. Every model the game ships (public/models/ and a next world's worlds-data/<id>/models/, the list of
// tools/assets.mjs) is valid glTF by the Khronos validator (gltf-validator, the reference one): no error, and no warning
// but the ones named below with their reason. A broken file - an accessor out of its buffer, a wrong index, an animation
// of a node that is not there - is caught here and not on a child's phone, where three.js may draw it wrong or not at
// all (2026-11-20, point 5 of the check of the six items).
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { validateBytes } from 'gltf-validator';
import { describe, expect, it } from 'vitest';
import { ROOT, listShipped, shippedPath } from './assets.mjs';

/** Warnings any shipped model may have, each with its reason; any other warning fails. */
export const ALLOWED = {
  // the packs' rigs (the animals, the cat, the characters, the chest) hang the skinned mesh under the armature: three.js
  // binds the skin to the joints it lists, whatever the mesh's parents and its own transform
  NODE_SKINNED_MESH_NON_ROOT: 'the skinned mesh under its armature, as the packs export it; three.js skins by the joints',
  NODE_SKINNED_MESH_LOCAL_TRANSFORMS: 'the same: a transform on the skinned mesh itself, which skinning leaves out',
  // the heroine's normal map without tangents: three.js makes them in the shader (by the derivatives of the screen)
  MESH_PRIMITIVE_GENERATED_TANGENT_SPACE: 'the heroine\'s normal map: three.js makes the tangents in the shader',
};
/**
 * Errors of single models, each with its reason; any other error fails, and one listed here that is gone fails too
 * (then take it out of the list). Found by the first run, 2026-11-22: the three animals of the pack have them in their
 * sources already (models-src/), the compression changes nothing about them.
 */
export const KNOWN_ERRORS = {
  // `skins[0].skeleton` names a node that is not a common root of the joints; three.js never reads `skeleton`
  'animals_pack/Deer.glb': ['SKIN_SKELETON_INVALID'],
  'animals_pack/Fox.glb': ['SKIN_SKELETON_INVALID'],
  'animals_pack/Horse_White.glb': ['SKIN_SKELETON_INVALID'],
};

const shipped = listShipped(), models = shipped.filter((f) => f.endsWith('.glb'));
const read = (rel) => new Uint8Array(readFileSync(join(ROOT, shippedPath(rel))));

async function check(rel) {
  const report = await validateBytes(read(rel), {
    uri: rel,
    maxIssues: 0,
    // a texture beside the model (tools/assets.mjs writes them as .webp files next to it)
    externalResourceFunction: async (uri) => read(posix.join(posix.dirname(rel), decodeURIComponent(uri))),
  });
  const known = KNOWN_ERRORS[rel] ?? [], msgs = report.issues.messages;
  const gone = known.filter((code) => !msgs.some((m) => m.severity === 0 && m.code === code)).map((code) => `${rel}: the known error ${code} is gone - take it out of KNOWN_ERRORS`);
  return [...gone, ...msgs.filter((m) => (m.severity === 0 && !known.includes(m.code)) || (m.severity === 1 && !(m.code in ALLOWED)))
    .map((m) => `${rel}: ${m.severity === 0 ? 'error' : 'warning'} ${m.code} at ${m.pointer ?? '-'}: ${m.message}`)];
}

describe('the shipped models are valid glTF (gltf-validator)', () => {
  it('finds the models', () => { expect(models.length).toBeGreaterThan(50); });
  it('lists known errors of models it ships only', () => { for (const f of Object.keys(KNOWN_ERRORS)) expect(models).toContain(f); });

  it('has no error and no warning without a reason in any of them', async () => {
    const problems = (await Promise.all(models.map(check))).flat();
    expect(problems, problems.slice(0, 20).join('\n')).toEqual([]);
  }, 120000);
});
