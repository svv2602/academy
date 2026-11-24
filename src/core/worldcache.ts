// The cache of the next worlds (docs/15-tech.md, TECH-09; decision Q14). The installation caches the core and the first
// world; every next world lies in folders of its own and is listed by the build in worlds.json (tools/vite-worlds.mjs):
// its files with their sizes and fingerprints. Its files are kept in one cache, named by that list, under their plain
// addresses. Two things write it: the service worker, when the page first asks for a file of the world (the route of
// vite.config.ts), and `download` here - in the background, one file at a time, while the previous world is played.
// There is no mark beside the files: a world is downloaded when the cache holds every file of the current list with
// the bytes the list names (their SHA-256), whoever put them there. A download that was cut short, and a file whose
// fingerprint changed with a new version, both read as "partial" until the next download brings the rest.
// Nothing here throws or writes to the console: a failure of the network or of the storage (no room) ends the download
// and stays in its state. A download in the background (`downloadNext`) gives way to a world asked for by name
// (`download`, the heroine at its portal): it stops after the file it is bringing, so she never waits for a whole other
// world; the next `downloadNext` brings the rest.

/** One file of a world: its address relative to the page, its size in bytes and the SHA-256 of its bytes. */
export interface WorldFile { url: string; size: number; revision: string }
/** worlds.json of the build: the name of the cache and the files of every next world. */
export interface WorldList { cache: string; worlds: Record<string, { revision: string; size: number; files: WorldFile[] }> }

/**
 * 'core' - the world needs no download: the build lists no files of its own for it (the first world, or a build without
 * next worlds); 'ready' - every file of the list is in the cache; 'partial' - some are; 'none' - not one is, or the
 * cache cannot be asked.
 */
export type WorldStatus = 'core' | 'ready' | 'partial' | 'none';
/**
 * Why a download did not run or stopped: 'network' - a file or the list did not arrive; 'storage' - the cache refused
 * it (no room, no cache at all); 'changed' - the server sent other bytes than the list names (another version is being
 * published); 'saving' - the browser asks to save data, nothing is downloaded; 'yielded' - a download in the background
 * stopped to let a world asked for by name go first.
 */
export type WorldError = 'network' | 'storage' | 'changed' | 'saving' | 'yielded';
/** The last download: the world, how far it came (`done` of `total` files are in the cache) and how it ended. */
export interface WorldDownload { world: string; status: WorldStatus; done: number; total: number; running: boolean; error: WorldError | null }

/** The part of `navigator` asked about saving data (not in the standard library's types). */
export interface ConnectionInfo { connection?: { saveData?: boolean } }

/**
 * May the game download a next world in the background? Decision R60: with any connection but the data saver
 * (navigator.connection.saveData); a browser that does not tell is not saving.
 */
export function mayDownload(nav: ConnectionInfo = navigator as Navigator & ConnectionInfo): boolean {
  return nav.connection?.saveData !== true;
}

/** What the cache of worlds needs of the page; the tests hand in stand-ins. */
export interface WorldCacheEnv {
  fetch: (url: string) => Promise<Response>;
  /** Cache Storage, or undefined where the page has none. */
  caches: CacheStorage | undefined;
  /** The address the list and its files are relative to: the page's. */
  base: string;
  /** SHA-256 of the bytes, in hex; rejects where the page cannot count it. */
  digest: (bytes: ArrayBuffer) => Promise<string>;
  mayDownload: () => boolean;
  /**
   * Does the browser tell it is online (navigator.onLine)? Offline the download in the background does not start: its
   * first file could only fail (a failed request and an error in the console); the next call - a launch, an arrival in
   * a world - starts it once the network is back. A world asked for by name (`download`) still asks: the gate says why.
   */
  online: () => boolean;
}

const LIST = 'worlds.json';

async function sha256(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function pageEnv(): WorldCacheEnv {
  return {
    fetch: (url) => fetch(url), caches: 'caches' in globalThis ? caches : undefined, base: document.baseURI, digest: sha256,
    mayDownload: () => mayDownload(), online: () => navigator.onLine !== false,
  };
}

function isList(x: unknown): x is WorldList {
  const l = x as WorldList | null;
  return !!l && typeof l.cache === 'string' && !!l.worlds && typeof l.worlds === 'object';
}

export interface WorldCache {
  /** The status of the world `id` by the list of this build and the cache as it is now. */
  status(id: string): Promise<WorldStatus>;
  /**
   * Brings the files of the world `id` the cache lacks (or holds with an old fingerprint), one at a time, in the order
   * of the list. A second call while the first runs returns the first one's promise. A download of another world in the
   * background (`downloadNext`) gives way: it stops after its current file ('yielded'), and this one starts.
   */
  download(id: string): Promise<WorldDownload>;
  /**
   * Downloads the first world of `candidates` that is not in the cache yet (src/worlds/index.ts `nextWorlds`); null
   * when there is none - no request is made for an empty list. Does nothing but note it when the browser saves data.
   */
  downloadNext(candidates: readonly string[]): Promise<WorldDownload | null>;
  /** The last download (or the one running), null before the first. */
  state(): WorldDownload | null;
  /** The addresses of the list's files of the world `id` that the cache holds with the right bytes, sorted. */
  cached(id: string): Promise<string[]>;
}

interface Running { world: string; promise: Promise<WorldDownload>; background: boolean; yield: boolean }

export function createWorldCache(env: WorldCacheEnv = pageEnv()): WorldCache {
  let list: Promise<WorldList | null | 'network'> | null = null;
  let last: WorldDownload | null = null;
  /** The download running or waiting last; `background` - from `downloadNext`, `yield` - asked to give way. */
  let running: Running | null = null;

  const abs = (url: string) => new URL(url, env.base).href;

  /** The list of the build; null when the build has none (no next world); 'network' when it did not arrive (asked again next time). */
  function getList(): Promise<WorldList | null | 'network'> {
    if (list) return list;
    const mine = list = (async () => {
      try {
        const res = await env.fetch(abs(LIST));
        const body: unknown = res.ok ? await res.json() : null;
        return isList(body) ? body : null;
      } catch (e) {
        // Not a list (the development server answers every address with the page) is "no list"; no answer is not.
        return e instanceof SyntaxError ? null : 'network';
      }
    })();
    void mine.then((l) => { if (l === 'network' && list === mine) list = null; });
    return mine;
  }

  async function openCache(name: string): Promise<Cache | null> {
    try { return env.caches ? await env.caches.open(name) : null; } catch { return null; }
  }

  /** Does the cache hold `file` with the bytes the list names? */
  async function holds(cache: Cache, file: WorldFile): Promise<boolean> {
    try {
      const res = await cache.match(abs(file.url), { ignoreVary: true });
      return !!res && await env.digest(await res.arrayBuffer()) === file.revision;
    } catch { return false; }
  }

  async function heldFiles(l: WorldList, id: string): Promise<WorldFile[]> {
    const cache = await openCache(l.cache);
    const out: WorldFile[] = [];
    if (cache) for (const f of l.worlds[id]?.files ?? []) if (await holds(cache, f)) out.push(f);
    return out;
  }

  async function status(id: string): Promise<WorldStatus> {
    const l = await getList();
    if (l === 'network') return 'none';
    const files = l?.worlds[id]?.files;
    if (!l || !files?.length) return 'core';
    const held = (await heldFiles(l, id)).length;
    return held === files.length ? 'ready' : held ? 'partial' : 'none';
  }

  async function run(id: string, me: Running): Promise<WorldDownload> {
    const s: WorldDownload = last = { world: id, status: 'none', done: 0, total: 0, running: true, error: null };
    const end = (status: WorldStatus, error: WorldError | null = null) => { s.status = status; s.error = error; s.running = false; return s; };
    const l = await getList();
    if (l === 'network') return end('none', 'network');
    const files = l?.worlds[id]?.files;
    if (!l || !files?.length) return end('core');
    s.total = files.length;
    const cache = await openCache(l.cache);
    if (!cache) return end('none', 'storage');
    const stopped = (error: WorldError) => end(s.done ? 'partial' : 'none', error);
    // First what is there already, so that `done` counts files in the cache and a stop reads right.
    const missing: WorldFile[] = [];
    for (const f of files) if (await holds(cache, f)) s.done++; else missing.push(f);
    if (s.done) s.status = 'partial';
    for (const f of missing) {
      if (me.yield) return stopped('yielded');
      let bytes: ArrayBuffer, type: string | null;
      try {
        // Past the service worker's route (it answers plain addresses from this very cache): the fingerprint in the
        // query also keeps an old copy of the file anywhere on the way from being handed out.
        const res = await env.fetch(`${abs(f.url)}?v=${f.revision}`);
        if (!res.ok) return stopped('network');
        bytes = await res.arrayBuffer();
        type = res.headers.get('Content-Type');
      } catch { return stopped('network'); }
      let same = false;
      try { same = await env.digest(bytes) === f.revision; } catch { /* cannot count: not the file of the list */ }
      if (!same) return stopped('changed');
      try {
        const headers: Record<string, string> = { 'Content-Length': String(bytes.byteLength) };
        if (type) headers['Content-Type'] = type;
        await cache.put(abs(f.url), new Response(bytes, { status: 200, headers }));
      } catch { return stopped('storage'); }
      s.done++;
      s.status = s.done === s.total ? 'ready' : 'partial';
    }
    return end('ready');
  }

  function start(id: string, background: boolean): Promise<WorldDownload> {
    if (running?.world === id) {
      // Asked by name while it runs in the background: it no longer gives way.
      if (!background) running.background = false;
      return running.promise;
    }
    // One file at a time, whatever is asked: another world waits for the one being downloaded - but a world asked for
    // by name does not wait for one of the background, which stops after its current file.
    const before = running;
    if (before && before.background && !background) before.yield = true;
    const mine: Running = { world: id, promise: Promise.resolve(null as unknown as WorldDownload), background, yield: false };
    mine.promise = before ? before.promise.then(() => run(id, mine)) : run(id, mine);
    running = mine;
    void mine.promise.then(() => { if (running === mine) running = null; });
    return mine.promise;
  }

  function download(id: string): Promise<WorldDownload> { return start(id, false); }

  async function downloadNext(candidates: readonly string[]): Promise<WorldDownload | null> {
    if (!candidates.length) return null;
    if (!env.mayDownload()) return last = { world: candidates[0], status: 'none', done: 0, total: 0, running: false, error: 'saving' };
    if (!env.online()) return last = { world: candidates[0], status: 'none', done: 0, total: 0, running: false, error: 'network' };
    // The state tells of the download from the call itself: choosing the world asks for the list and the cache first.
    const before = last;
    const choosing: WorldDownload = last = { world: candidates[0], status: 'none', done: 0, total: 0, running: true, error: null };
    for (const id of candidates) {
      const now = await status(id);
      if (now !== 'ready' && now !== 'core') return start(id, true);
    }
    if (last === choosing) last = before;
    return null;
  }

  async function cached(id: string): Promise<string[]> {
    const l = await getList();
    return l && l !== 'network' ? (await heldFiles(l, id)).map((f) => f.url).sort() : [];
  }

  return { status, download, downloadNext, state: () => last, cached };
}
