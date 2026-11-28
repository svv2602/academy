/**
 * Pip's model (src/game/pip.ts) is not part of the first load (decision of 2026-11-28, variant (а)): public/models/pip/
 * is out of the service worker's list and out of the models' budget (tools/dist-size.mjs MAX_PIP, tools/assets.mjs).
 * The game brings it in the background once it may be needed - the first world finished and English on - into the
 * cache the service worker's route reads (vite.config.ts, tools/vite-worlds.mjs PIP_ROUTE), so that by his meeting in
 * the hub it is there, without network too.
 *
 * Pip is a guest, never a part of the game she cannot go on without: whatever goes wrong here - no network, no room in
 * the storage, a slow answer - he is simply not there, and his meeting waits for the next visit to the hub
 * (src/worlds/hub/pip-meet.ts meets him only once his model is loaded). Nothing here throws, writes to the console or
 * keeps a load waiting longer than PIP_LOAD_MS. Offline, a file the cache lacks is not asked for at all: the request
 * could only fail, and a failed request is an error in the console (the same gate as src/core/worldcache.ts).
 *
 * The cache is named by the revision of his files (`pipCache`, __PIP_REV__ of the build): his addresses are the same in
 * every build, so a site updated under the page, or a reload at the arch, still finds the model of the same revision;
 * a new model gets a new cache (tools/vite-worlds.mjs `pipRevision` tells why), and the older ones are dropped.
 */
import { mayDownload } from '../core/worldcache';
import { rig, type Rig } from '../core/assets';
import { PIP_HEIGHT, PIP_MODEL } from './pip';

/** His files, relative to the page: the model and the texture it references (tools/assets.mjs writes tex/<name>.webp). */
export const PIP_FILES = [`models/${PIP_MODEL}.glb`, 'models/pip/tex/pip.webp'] as const;
/** The cache of his files for the revision `rev`; the service worker's route writes the same (tools/vite-worlds.mjs). */
export const pipCache = (rev: string) => `pip-${rev}`;
/** ms the hub's load waits for him at most: past it the hub is built without him, and he comes next time. */
export const PIP_LOAD_MS = 15_000;
/** ms a download of his files may take: a connection that stalls ends it, the next occasion starts it again. */
export const PIP_FETCH_MS = 60_000;

/** The revision of the build (vite.config.ts `define`); the tests and a page outside the build have none. */
const buildRev = () => (typeof __PIP_REV__ === 'string' ? __PIP_REV__ : 'dev');

/** What the loader needs of the page; the tests hand in stand-ins. */
export interface PipEnv {
  fetch: (url: string, signal: AbortSignal) => Promise<Response>;
  /** Cache Storage, or undefined where the page has none (a page outside a secure context). */
  caches: CacheStorage | undefined;
  /** The address his files are relative to: the page's. */
  base: string;
  /** The revision of his files in this build. */
  rev: string;
  online: () => boolean;
  /** The data saver: no download in the background (decision R60, src/core/worldcache.ts `mayDownload`). */
  mayDownload: () => boolean;
  /** The model itself, once its files are at hand: the same load every character goes through (src/core/assets.ts). */
  rig: () => Promise<Rig>;
  loadMs: number;
  fetchMs: number;
}

function pageEnv(): PipEnv {
  return {
    fetch: (url, signal) => fetch(url, { signal }), caches: 'caches' in globalThis ? caches : undefined, base: document.baseURI,
    rev: buildRev(), online: () => navigator.onLine !== false, mayDownload: () => mayDownload(),
    rig: () => rig(PIP_MODEL, PIP_HEIGHT, true), loadMs: PIP_LOAD_MS, fetchMs: PIP_FETCH_MS,
  };
}

/** What the prefetch reads of the save (src/core/save.ts `Save` is one). */
export interface PipSave { english: boolean; worlds: Readonly<Record<string, { readonly final: boolean } | undefined>> }

/** Is his model worth bringing in the background: English on and the first world finished (his meeting is due or past). */
export const pipPrefetchDue = (save: PipSave) => save.english !== false && save.worlds.fairy?.final === true;

export interface PipLoader {
  /** His model, or null - no network and not in the cache, a failure, longer than `loadMs`. Never rejects. */
  load(): Promise<Rig | null>;
  /**
   * Brings his files into the cache in the background when `pipPrefetchDue(save)`: once per page - a second call while
   * it runs, or after it brought them, does nothing new. A download that did not finish (no network, the data saver, a
   * full storage) is tried again at the next call. Resolves with whether his files are in the cache; never rejects.
   */
  prefetch(save: PipSave): Promise<boolean>;
}

export function createPipLoader(env: () => PipEnv = pageEnv): PipLoader {
  let e: PipEnv | null = null;
  const get = () => (e ??= env());
  let fetching: Promise<boolean> | null = null;
  let held = false;

  /** Every file in the cache of this revision, the missing ones brought now; false when one could not be had. */
  async function bring(x: PipEnv): Promise<boolean> {
    const name = pipCache(x.rev);
    let cache: Cache;
    try {
      if (!x.caches) return false;
      cache = await x.caches.open(name);
    } catch { return false; }
    const abort = new AbortController();
    const stop = setTimeout(() => abort.abort(), x.fetchMs);
    try {
      for (const rel of PIP_FILES) {
        const url = new URL(rel, x.base).href;
        if (await cache.match(url, { ignoreVary: true })) continue;
        if (!x.online()) return false;
        // With the revision in the query: past the service worker's route (it answers plain addresses from this very
        // cache), and past an old copy of the file anywhere on the way.
        const res = await x.fetch(`${url}?v=${x.rev}`, abort.signal);
        if (!res.ok) return false;
        const bytes = await res.arrayBuffer();
        const headers: Record<string, string> = { 'Content-Length': String(bytes.byteLength) };
        const type = res.headers.get('Content-Type');
        if (type) headers['Content-Type'] = type;
        await cache.put(url, new Response(bytes, { status: 200, headers }));
      }
    } catch { return false; } finally { clearTimeout(stop); }
    // The caches of older revisions: no page of this version asks for them (a tab of the old version is served by the
    // old worker, which a new page never runs beside, vite.config.ts skipWaiting: false).
    try {
      for (const old of await x.caches.keys()) if (old !== name && old.startsWith(pipCache(''))) await x.caches.delete(old);
    } catch { /* stays for next time */ }
    return true;
  }

  /** One download at a time; a finished one is remembered, a failed one forgotten so that the next call tries again. */
  function ensure(): Promise<boolean> {
    if (held) return Promise.resolve(true);
    if (fetching) return fetching;
    const mine = fetching = bring(get()).catch(() => false);
    void mine.then((ok) => { held = ok; if (fetching === mine) fetching = null; });
    return mine;
  }

  async function load(): Promise<Rig | null> {
    let x: PipEnv;
    try { x = get(); } catch { return null; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((r) => { timer = setTimeout(() => r(null), x.loadMs); });
    const attempt = (async () => {
      // Without Cache Storage there is nothing to look in: online the load asks the network itself, offline not at all.
      const ready = x.caches ? await ensure() : x.online();
      if (!ready) return null;
      try { return await x.rig(); } catch { return null; }
    })().catch(() => null);
    try { return await Promise.race([attempt, late]); } finally { clearTimeout(timer); }
  }

  function prefetch(save: PipSave): Promise<boolean> {
    try {
      if (!pipPrefetchDue(save)) return Promise.resolve(false);
      if (held) return Promise.resolve(true);
      if (fetching) return fetching;
      const x = get();
      if (!x.mayDownload() || !x.online()) return Promise.resolve(false);
      return ensure();
    } catch { return Promise.resolve(false); }
  }

  return { load, prefetch };
}

let page: PipLoader | null = null;
const loader = () => (page ??= createPipLoader());

/** His model for the hub (src/worlds/hub/index.ts), or null: never rejects, never holds the hub past PIP_LOAD_MS. */
export const loadPip = (): Promise<Rig | null> => loader().load();
/** His files into the cache in the background once they may be needed (src/main.ts); never rejects. */
export const prefetchPip = (save: PipSave): Promise<boolean> => loader().prefetch(save);
