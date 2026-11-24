// The build's list of the next worlds (docs/15-tech.md, TECH-09; decision Q14): which files every world after the
// first one has, with their sizes and fingerprints. The installation caches only the core and the first world; a next
// world lies in folders of its own (models/<id>/, voice/<id>/, story/<id>/ - tools/world-files.mjs), stays out of the
// service worker's list and is kept in a cache of its own: a file is put there when the page first asks for it (the
// route below) and by the download in the background while the previous world is played (src/core/worldcache.ts).
// Both write the same cache under the same addresses, and "the world is downloaded" is read from that cache alone.
// vite.config.ts uses everything here; the pure parts are tested by tools/vite-worlds.test.mjs.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { installedWorlds, sourceWorlds } from './dist-size.mjs';
import { WORLD_FOLDERS, worldOf } from './world-files.mjs';

/** The list, at the root of the build. Precached: the game reads it without network too. */
export const WORLDS_LIST = 'worlds.json';
/** The cache of the next worlds' files. The list names it, so the page and the service worker cannot disagree. */
export const WORLDS_CACHE = 'worlds';

/** A next world's own files outside public/ (tools/assets.mjs WORLDS_DATA): worlds-data/<id>/ at their paths in the build. */
export const WORLDS_DATA = 'worlds-data';

/**
 * The files a grey build (WORLD-12) puts in besides public/, { <path in the build>: <source path from the root> }:
 * `extra` (a file a grey world takes from where it already lies) and every file of worlds-data/<id>/ of the next worlds
 * `next` of this build, at the same path (worlds-data/forest/models/forest/x.glb -> models/forest/x.glb). A world not
 * in `next` gets nothing: the published build has no next world, so it carries none of them.
 */
export function greyWorldFiles(next, extra = {}, root = '.') {
  const out = { ...extra };
  for (const id of next) {
    const dir = join(root, WORLDS_DATA, id);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!f.isFile()) continue;
      const file = join(f.parentPath, f.name);
      out[relative(dir, file).split(sep).join('/')] = relative(root, file).split(sep).join('/');
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The next worlds of a build of `mode`: the folders of src/worlds/ but the first world's (`sourceWorlds`) and those of
 * the installation (`installedWorlds`: the hub - its voice is precached with the core), and but a world of `modes`
 * unless the build is made in that world's mode - the registry (src/worlds/index.ts) lists such a world under the same
 * condition. `modes`: { <world id>: <mode> } (the probe world, the grey forest); a string is a test world of the mode
 * of its name.
 */
export function buildWorlds(mode, modes, dir = undefined) {
  const installed = installedWorlds(dir);
  const only = typeof modes === 'string' ? { [modes]: modes } : modes ?? {};
  return sourceWorlds(dir).worlds.filter((id) => !installed.includes(id) && (!(id in only) || mode === only[id]));
}

/** The folders of the next `worlds` as patterns for the service worker's `globIgnores`: they are not precached. */
export function worldGlobs(worlds) {
  return worlds.flatMap((id) => WORLD_FOLDERS.map((folder) => `${folder}/${id}/**`));
}

/**
 * The files of a next world that lie elsewhere than worlds-data/<id>/, by world: { <id>: { <path in the build>: <source,
 * relative to the root> } }. The sea swims (WorldDef.move) with the probe world's swimming clips - the same two clips of
 * the UAL, worlds-test/probe/README.md - and keeps no second copy in git. vite.config.ts puts them into every build that
 * has the world; the check "models used" (tools/models-split.mjs) takes them as the world's own files.
 */
export const WORLD_EXTRA_FILES = { sea: { 'models/sea/swim.glb': 'worlds-test/probe/models/probe/swim.glb' } };
/** The files of `WORLD_EXTRA_FILES` of the next worlds `worlds`, as one map. */
export const extraFiles = (worlds, extra = WORLD_EXTRA_FILES) => Object.assign({}, ...worlds.map((id) => extra[id] ?? {}));

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
 * The name of a chunk of the build (`output.chunkFileNames`): the chunk a next world of `worlds` is entered by - its
 * src/worlds/<id>/index.ts, imported when she enters it (src/worlds/index.ts) - lies in code/<id>/, a folder of the
 * world (WORLD_FOLDERS): out of the service worker's list, in the world's list and in its budget, downloaded with its
 * files. Every other chunk - the core's, and one that more than one world shares - stays in assets/.
 */
export function worldChunkFile(worlds) {
  const own = new RegExp(`[\\\\/]src[\\\\/]worlds[\\\\/](${worlds.map(escape).join('|') || '(?!)'})[\\\\/]index\\.ts$`);
  return (chunk) => {
    const id = chunk.facadeModuleId ? own.exec(chunk.facadeModuleId)?.[1] : undefined;
    return id ? `code/${id}/[name]-[hash].js` : 'assets/[name]-[hash].js';
  };
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
      // the files of a world and its code (code/<id>/: its chunk, `worldChunkFile`) as the build writes them
      const emitted = Object.values(bundle).filter((f) => worldOf(f.fileName, worlds) !== null)
        .map((f) => ({ path: f.fileName, bytes: Buffer.from(f.type === 'chunk' ? f.code : f.source) }));
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
