// The model files the walkthroughs requested, split for the check "models used" of tools/e2e.mjs: the core's
// (public/models/, compared with tools/models-used.json) and a next world's own (the forest's: downloaded in the
// background while the fairies are played - they lie in worlds-data/<id>/, tools/assets.mjs). A file is a next world's
// by its path alone (tools/world-files.mjs `worldOf`: inside models/<id>/ of a next world), and which worlds are next is
// read from the sources (tools/dist-size.mjs), not from a build: `npm run e2e -- --combine` (the job "check" of CI) has
// no build.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installedWorlds, sourceWorlds } from './dist-size.mjs';
import { WORLD_EXTRA_FILES } from './vite-worlds.mjs';
import { worldOf } from './world-files.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The next worlds of the sources: the folders of src/worlds/ but the first world's and those of the installation. */
export function nextWorldIds(dir = undefined) {
  const installed = installedWorlds(dir);
  return sourceWorlds(dir).worlds.filter((id) => !installed.includes(id));
}

/**
 * `paths` (requested files, relative to the build) split: { core, ofWorlds, nowhere } - each sorted, without repeats.
 * `ofWorlds` are the files of the next worlds `next`, `nowhere` those of them that do not lie in
 * <root>/worlds-data/<id>/ at their path (models/<id>/x.glb -> worlds-data/<id>/models/<id>/x.glb), nor where the build
 * takes it from (`extra`: tools/vite-worlds.mjs WORLD_EXTRA_FILES - the sea's swimming clips, from the probe world).
 */
export function splitRequested(paths, next = nextWorldIds(), root = ROOT, extra = WORLD_EXTRA_FILES) {
  const core = new Set(), ofWorlds = new Set();
  for (const p of paths) (worldOf(p, next) === null ? core : ofWorlds).add(p);
  const lies = (p) => { const id = worldOf(p, next), from = extra[id]?.[p]; return existsSync(join(root, 'worlds-data', id, p)) || (from !== undefined && existsSync(join(root, from))); };
  const nowhere = [...ofWorlds].filter((p) => !lies(p));
  return { core: [...core].sort(), ofWorlds: [...ofWorlds].sort(), nowhere: nowhere.sort() };
}
