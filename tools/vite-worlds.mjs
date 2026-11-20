// The build's list of the next worlds (docs/15-tech.md, TECH-09; decision Q14): which files every world after the
// first one has, with their sizes and fingerprints. The installation caches only the core and the first world; a next
// world lies in folders of its own (models/<id>/, voice/<id>/, story/<id>/ - tools/world-files.mjs), stays out of the
// service worker's list and is kept in a cache of its own: a file is put there when the page first asks for it (the
// route below) and by the download in the background while the previous world is played (src/core/worldcache.ts).
// Both write the same cache under the same addresses, and "the world is downloaded" is read from that cache alone.
// vite.config.ts uses everything here; the pure parts are tested by tools/vite-worlds.test.mjs.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { installedWorlds, sourceWorlds } from './dist-size.mjs';
import { WORLD_FOLDERS, worldOf } from './world-files.mjs';

/** The list, at the root of the build. Precached: the game reads it without network too. */
export const WORLDS_LIST = 'worlds.json';
/** The cache of the next worlds' files. The list names it, so the page and the service worker cannot disagree. */
export const WORLDS_CACHE = 'worlds';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The next worlds of a build of `mode`: the folders of src/worlds/ but the first world's (`sourceWorlds`) and those of
 * the installation (`installedWorlds`: the hub - its voice is precached with the core), and but the test world
 * `testWorld` unless the build is made in the mode of the same name - the registry (src/worlds/index.ts) lists that
 * world under the same condition.
 */
export function buildWorlds(mode, testWorld, dir = undefined) {
  const installed = installedWorlds(dir);
  return sourceWorlds(dir).worlds.filter((id) => !installed.includes(id) && (id !== testWorld || mode === testWorld));
}

/** The folders of the next `worlds` as patterns for the service worker's `globIgnores`: they are not precached. */
export function worldGlobs(worlds) {
  return worlds.flatMap((id) => WORLD_FOLDERS.map((folder) => `${folder}/${id}/**`));
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The addresses of the files of the next `worlds`, for the service worker's route: …/models/<id>/…, …/voice/<id>/…,
 * …/story/<id>/…, without a query. An address with a query is not the route's: the download in the background asks
 * the network for `<file>?v=<fingerprint>` past this route, or it would be handed the old file it is replacing.
 * null when there is no next world: there is no route then.
 */
export function worldRoute(worlds) {
  if (!worlds.length) return null;
  return new RegExp(`/(?:${WORLD_FOLDERS.join('|')})/(?:${worlds.map(escape).join('|')})/[^?#]+$`);
}

/**
 * The list of a build: `files` are [{ path, bytes }] (paths relative to the build, with "/"), `worlds` the ids of the
 * next worlds. Returns { cache, worlds: { <id>: { revision, size, files: [{ url, size, revision }] } } }: the files of
 * every world sorted by address, `revision` of a file the SHA-256 of its bytes, of a world the SHA-256 over the
 * addresses and fingerprints of its files. A world without a file of its own is not listed: it needs no download.
 */
export function listWorlds(files, worlds) {
  const out = {};
  for (const id of [...new Set(worlds)].sort()) {
    const own = files.filter((f) => worldOf(f.path, [id]) === id).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => ({ url: f.path, size: f.bytes.length, revision: sha256(f.bytes) }));
    if (!own.length) continue;
    out[id] = { revision: sha256(own.map((f) => `${f.url}\n${f.revision}\n`).join('')), size: own.reduce((s, f) => s + f.size, 0), files: own };
  }
  return { cache: WORLDS_CACHE, worlds: out };
}

/** The files of the next `worlds` under the folder of static files `dir` (public/), as [{ path, bytes }]. */
export function publicWorldFiles(dir, worlds) {
  const out = [];
  for (const id of worlds) for (const folder of WORLD_FOLDERS) {
    const from = join(dir, folder, id);
    if (!existsSync(from)) continue;
    for (const f of readdirSync(from, { recursive: true, withFileTypes: true })) {
      if (!f.isFile()) continue;
      const file = join(f.parentPath, f.name);
      out.push({ path: file.slice(dir.length + 1).split(sep).join('/'), bytes: readFileSync(file) });
    }
  }
  return out;
}

/**
 * The Vite plugin that writes the list into the build. It reads the files of the next worlds from the bundle (a
 * plugin listed before it may emit them: the probe world's files, vite.config.ts) and from public/; a file emitted
 * under the same path wins over the static one, as in the build. Without a file of a next world nothing is written,
 * and the build is the one it was before (the published game with one world).
 * `api.precache` is a `manifestTransforms` entry of Workbox: it adds the written list to the service worker's own
 * list (its type, json, is not among `globPatterns`, and a pattern that matches nothing is a build warning).
 */
export function worldList(worlds) {
  let publicDir = '';
  let entry = null;
  return {
    name: 'world-list',
    apply: 'build',
    configResolved(config) { publicDir = config.publicDir || ''; },
    generateBundle(_, bundle) {
      entry = null;
      const emitted = Object.values(bundle).filter((f) => f.type === 'asset' && worldOf(f.fileName, worlds) !== null)
        .map((f) => ({ path: f.fileName, bytes: Buffer.from(f.source) }));
      const taken = new Set(emitted.map((f) => f.path));
      const fixed = publicDir ? publicWorldFiles(publicDir, worlds).filter((f) => !taken.has(f.path)) : [];
      const list = listWorlds([...emitted, ...fixed], worlds);
      if (!Object.keys(list.worlds).length) return;
      const source = JSON.stringify(list);
      this.emitFile({ type: 'asset', fileName: WORLDS_LIST, source });
      entry = { url: WORLDS_LIST, revision: createHash('md5').update(source).digest('hex'), size: Buffer.byteLength(source) };
    },
    api: {
      precache: (entries) => ({ manifest: entry ? [...entries, entry] : entries, warnings: [] }),
    },
  };
}
