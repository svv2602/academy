import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorldCache, mayDownload, type WorldCacheEnv, type WorldFile, type WorldList } from './worldcache';

// The cache of the next worlds (TECH-09) on stand-ins for the network and Cache Storage: what "downloaded" means, a
// download cut short, a new version of a file, a full storage. The real cache, with the service worker's route writing
// it too, is played by `npm run e2e` (the step "worlds", tools/worlds.mjs).
const BASE = 'http://game.test/academy/?debug';
const at = (url: string) => new URL(url, BASE).href;
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
async function sha256(b: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const file = async (url: string, text: string): Promise<WorldFile> => ({ url, size: text.length, revision: await sha256(bytes(text)) });

/** The files the server holds, by address relative to the page: their text. */
type Files = Record<string, string>;
const OCEAN: Files = { 'models/ocean/a.glb': 'model a', 'models/ocean/b.glb': 'model b', 'voice/ocean/c.mp3': 'clip c' };
const SPACE: Files = { 'models/space/s.glb': 'model s' };

async function listOf(worlds: Record<string, Files>, cache = 'worlds'): Promise<WorldList> {
  const out: WorldList = { cache, worlds: {} };
  for (const [id, files] of Object.entries(worlds)) {
    out.worlds[id] = { revision: id, size: 0, files: await Promise.all(Object.entries(files).map(([url, text]) => file(url, text))) };
  }
  return out;
}

/** Cache Storage in memory: caches by name, each address -> bytes and Content-Type. `full` makes every put fail. */
function fakeCaches() {
  const stores = new Map<string, Map<string, { body: ArrayBuffer; type: string | null }>>();
  const state = { full: false, broken: false, puts: [] as string[] };
  const storage = {
    async open(name: string) {
      if (state.broken) throw new DOMException('The operation is insecure.', 'SecurityError');
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async match(url: string) { const e = store.get(url); return e ? new Response(e.body.slice(0)) : undefined; },
        async put(url: string, res: Response) {
          if (state.full) throw new DOMException('Quota exceeded.', 'QuotaExceededError');
          state.puts.push(url);
          store.set(url, { body: await res.arrayBuffer(), type: res.headers.get('Content-Type') });
        },
      };
    },
  };
  const put = (name: string, url: string, text: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    stores.get(name)!.set(at(url), { body: bytes(text), type: null });
  };
  return { caches: storage as unknown as CacheStorage, stores, state, put };
}

/**
 * The server: worlds.json (`list`; null - the build has none, 404) and `files`. `asked` are the addresses asked for,
 * `most` the largest number of requests in flight at once; an address in `fail` is refused (the connection drops),
 * `gate(url)` holds the answer for an address until the promise it returns is released.
 */
function fakeServer(list: unknown, files: Files) {
  const s = { asked: [] as string[], most: 0, flying: 0, fail: new Set<string>() };
  const held = new Map<string, { wait: Promise<void>; start: () => void }>();
  const gate = (url: string) => {
    let release = () => {}, start = () => {};
    const wait = new Promise<void>((r) => { release = r; }), started = new Promise<void>((r) => { start = r; });
    held.set(at(url), { wait, start });
    return { started, release };
  };
  const fetch = async (url: string): Promise<Response> => {
    s.asked.push(url);
    s.most = Math.max(s.most, ++s.flying);
    try {
      const plain = url.split('?')[0];
      const h = held.get(plain);
      if (h) { h.start(); await h.wait; }
      if (s.fail.has(plain)) throw new TypeError('Failed to fetch');
      if (plain === at('worlds.json')) {
        if (list === null) return new Response('', { status: 404 });
        return new Response(typeof list === 'string' ? list : JSON.stringify(list), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const rel = Object.keys(files).find((f) => at(f) === plain);
      if (!rel) return new Response('', { status: 404 });
      return new Response(files[rel], { status: 200, headers: { 'Content-Type': rel.endsWith('.mp3') ? 'audio/mpeg' : 'model/gltf-binary' } });
    } finally { s.flying--; }
  };
  return { s, fetch, gate };
}

function setup(list: unknown, files: Files, more: Partial<WorldCacheEnv> = {}) {
  const store = fakeCaches();
  const server = fakeServer(list, files);
  const env: WorldCacheEnv = { fetch: server.fetch, caches: store.caches, base: BASE, digest: sha256, mayDownload: () => true, online: () => true, ...more };
  return { store, server, worlds: createWorldCache(env) };
}
/** The addresses asked for, without the list itself. */
const filesAsked = (server: { s: { asked: string[] } }) => server.s.asked.filter((u) => !u.endsWith('worlds.json'));

const noise = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')];
afterEach(() => {
  // Nothing of the cache of worlds goes to the console: the walkthrough fails on any error or warning there.
  for (const spy of noise) { expect(spy).not.toHaveBeenCalled(); spy.mockClear(); }
});

describe('mayDownload: any connection but the data saver (R60)', () => {
  it('a browser that says nothing about its connection may download', () => {
    expect(mayDownload({})).toBe(true);
    expect(mayDownload({ connection: {} })).toBe(true);
  });
  it('a connection that does not save data may download', () => {
    expect(mayDownload({ connection: { saveData: false } })).toBe(true);
  });
  it('the data saver may not', () => {
    expect(mayDownload({ connection: { saveData: true } })).toBe(false);
  });
});

describe('the status of a world', () => {
  it('a world the list does not name is part of the installation: "core"', async () => {
    const { worlds } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    expect(await worlds.status('fairy')).toBe('core');
  });

  it('a build without the list (404) has no next world: every world is "core"', async () => {
    const { worlds } = setup(null, {});
    expect(await worlds.status('ocean')).toBe('core');
  });

  it('an answer that is not a list (the development server answers with the page) is no list', async () => {
    expect(await setup('<!doctype html><title>x</title>', {}).worlds.status('ocean')).toBe('core');
    expect(await setup('{"worlds":[]', {}).worlds.status('ocean')).toBe('core');
    expect(await setup({ worlds: {} }, {}).worlds.status('ocean')).toBe('core');   // no name of the cache
  });

  it('the list did not arrive: "none", and it is asked for again the next time', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    server.s.fail.add(at('worlds.json'));
    expect(await worlds.status('ocean')).toBe('none');
    server.s.fail.clear();
    expect(await worlds.status('ocean')).toBe('none');   // an empty cache now, by the list
    expect(server.s.asked).toEqual([at('worlds.json'), at('worlds.json')]);
    await worlds.status('ocean');
    expect(server.s.asked.length).toBe(2);   // the list that arrived is kept
  });

  it('"none" with an empty cache, "partial" with some files, "ready" with every file of the list', async () => {
    const { worlds, store } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    expect(await worlds.status('ocean')).toBe('none');
    store.put('worlds', 'models/ocean/a.glb', OCEAN['models/ocean/a.glb']);
    expect(await worlds.status('ocean')).toBe('partial');
    store.put('worlds', 'models/ocean/b.glb', OCEAN['models/ocean/b.glb']);
    expect(await worlds.status('ocean')).toBe('partial');
    store.put('worlds', 'voice/ocean/c.mp3', OCEAN['voice/ocean/c.mp3']);
    expect(await worlds.status('ocean')).toBe('ready');
    expect(await worlds.cached('ocean')).toEqual(['models/ocean/a.glb', 'models/ocean/b.glb', 'voice/ocean/c.mp3']);
  });

  it('files put by anyone count (the service worker keeps what the page asked for), under the cache the list names', async () => {
    const { worlds, store } = setup(await listOf({ space: SPACE }, 'next-worlds'), SPACE);
    store.put('worlds', 'models/space/s.glb', SPACE['models/space/s.glb']);
    expect(await worlds.status('space')).toBe('none');   // another cache
    store.put('next-worlds', 'models/space/s.glb', SPACE['models/space/s.glb']);
    expect(await worlds.status('space')).toBe('ready');
  });

  it('a file with other bytes than the list names does not count: the world is "partial"', async () => {
    const { worlds, store } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    for (const [url, text] of Object.entries(OCEAN)) store.put('worlds', url, url === 'models/ocean/b.glb' ? 'the old model b' : text);
    expect(await worlds.status('ocean')).toBe('partial');
    expect(await worlds.cached('ocean')).toEqual(['models/ocean/a.glb', 'voice/ocean/c.mp3']);
  });

  it('without Cache Storage nothing is downloaded: "none"', async () => {
    const { worlds } = setup(await listOf({ ocean: OCEAN }), OCEAN, { caches: undefined });
    expect(await worlds.status('ocean')).toBe('none');
    expect(await worlds.cached('ocean')).toEqual([]);
  });
});

describe('download: the files of a world, one at a time', () => {
  it('brings every file in the order of the list, never two at once, and the world is "ready"', async () => {
    const { worlds, server, store } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    const list = await listOf({ ocean: OCEAN });
    const done = await worlds.download('ocean');
    expect(done).toEqual({ world: 'ocean', status: 'ready', done: 3, total: 3, running: false, error: null });
    expect(worlds.state()).toBe(done);
    // Asked past the service worker's route: the fingerprint is in the query; kept under the plain address.
    expect(filesAsked(server)).toEqual(list.worlds.ocean.files.map((f) => `${at(f.url)}?v=${f.revision}`));
    expect(server.s.most).toBe(1);
    expect(store.state.puts).toEqual(Object.keys(OCEAN).map(at));
    expect(store.stores.get('worlds')!.get(at('voice/ocean/c.mp3'))!.type).toBe('audio/mpeg');
    expect(await worlds.status('ocean')).toBe('ready');
  });

  it('partial: after the first file the world is not "ready" - neither the state of the download nor the status', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    const second = server.gate('models/ocean/b.glb');
    const running = worlds.download('ocean');
    await second.started;
    expect(worlds.state()).toEqual({ world: 'ocean', status: 'partial', done: 1, total: 3, running: true, error: null });
    expect(await worlds.status('ocean')).toBe('partial');
    second.release();
    expect((await running).status).toBe('ready');
  });

  it('a download cut short leaves the world "partial"; the next one brings only what is missing', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    server.s.fail.add(at('models/ocean/b.glb'));
    expect(await worlds.download('ocean')).toEqual({ world: 'ocean', status: 'partial', done: 1, total: 3, running: false, error: 'network' });
    expect(await worlds.status('ocean')).toBe('partial');
    expect(filesAsked(server).length).toBe(2);   // it stopped at the file that failed
    server.s.fail.clear();
    server.s.asked.length = 0;
    expect(await worlds.download('ocean')).toEqual({ world: 'ocean', status: 'ready', done: 3, total: 3, running: false, error: null });
    expect(filesAsked(server).map((u) => u.split('?')[0])).toEqual([at('models/ocean/b.glb'), at('voice/ocean/c.mp3')]);
    expect(await worlds.status('ocean')).toBe('ready');
  });

  it('the very first file fails: "none", the failure is in the state', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    server.s.fail.add(at('models/ocean/a.glb'));
    expect(await worlds.download('ocean')).toEqual({ world: 'ocean', status: 'none', done: 0, total: 3, running: false, error: 'network' });
  });

  it('a file the server does not have (404): the site holds another version - "changed", not the network; nothing is kept for it', async () => {
    const { worlds, store } = setup(await listOf({ ocean: OCEAN }), { 'models/ocean/a.glb': OCEAN['models/ocean/a.glb'] });
    expect(await worlds.download('ocean')).toMatchObject({ status: 'partial', done: 1, error: 'changed' });
    expect(store.state.puts).toEqual([at('models/ocean/a.glb')]);
  });

  it('a server that answers with an error other than 404 (503: the hosting is busy) is a failure of the network', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    const plain = server.fetch;
    const busy = async (url: string) => (url.includes('models/ocean/b.glb') ? new Response('', { status: 503 }) : plain(url));
    const w = createWorldCache({ fetch: busy, caches: fakeCaches().caches, base: BASE, digest: sha256, mayDownload: () => true, online: () => true });
    expect(await w.download('ocean')).toMatchObject({ status: 'partial', done: 1, error: 'network' });
    void worlds;
  });

  it('the list did not arrive: nothing is downloaded, "network"', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    server.s.fail.add(at('worlds.json'));
    expect(await worlds.download('ocean')).toEqual({ world: 'ocean', status: 'none', done: 0, total: 0, running: false, error: 'network' });
    expect(filesAsked(server)).toEqual([]);
  });

  it('a world the list does not name needs no download', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    expect(await worlds.download('fairy')).toEqual({ world: 'fairy', status: 'core', done: 0, total: 0, running: false, error: null });
    expect(filesAsked(server)).toEqual([]);
  });

  it('a new version: the file whose fingerprint changed is replaced, and the world is "ready" only with the full new set', async () => {
    const NEW = { ...OCEAN, 'models/ocean/b.glb': 'model b, second edition' };
    const { worlds, server, store } = setup(await listOf({ ocean: NEW }), NEW);
    for (const [url, text] of Object.entries(OCEAN)) store.put('worlds', url, text);   // the old version, downloaded in full
    expect(await worlds.status('ocean')).toBe('partial');
    const changed = server.gate('models/ocean/b.glb');
    const running = worlds.download('ocean');
    await changed.started;
    expect(worlds.state()).toMatchObject({ status: 'partial', done: 2, total: 3, running: true });
    changed.release();
    expect(await running).toEqual({ world: 'ocean', status: 'ready', done: 3, total: 3, running: false, error: null });
    // Only the changed file was asked for, and the cache now holds its new bytes.
    expect(filesAsked(server).map((u) => u.split('?')[0])).toEqual([at('models/ocean/b.glb')]);
    expect(new TextDecoder().decode(store.stores.get('worlds')!.get(at('models/ocean/b.glb'))!.body)).toBe('model b, second edition');
    expect(await worlds.status('ocean')).toBe('ready');
  });

  it('the server sends other bytes than the list names (another version is being published): not kept, "changed"', async () => {
    const { worlds, store } = setup(await listOf({ ocean: OCEAN }), { ...OCEAN, 'models/ocean/b.glb': 'a model of the next version' });
    expect(await worlds.download('ocean')).toEqual({ world: 'ocean', status: 'partial', done: 1, total: 3, running: false, error: 'changed' });
    expect(store.state.puts).toEqual([at('models/ocean/a.glb')]);
    expect(await worlds.status('ocean')).toBe('partial');
  });

  it('a full storage: the download ends without an error thrown or printed, "storage" is in the state', async () => {
    const { worlds, store, server } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    store.state.full = true;
    await expect(worlds.download('ocean')).resolves.toEqual({ world: 'ocean', status: 'none', done: 0, total: 3, running: false, error: 'storage' });
    expect(filesAsked(server).length).toBe(1);   // it does not go on asking for files it cannot keep
    expect(await worlds.status('ocean')).toBe('none');
    // Room again: the next download brings everything.
    store.state.full = false;
    expect((await worlds.download('ocean')).status).toBe('ready');
  });

  it('a storage that cannot be opened, or no Cache Storage at all: "storage", no file is asked for', async () => {
    const a = setup(await listOf({ ocean: OCEAN }), OCEAN);
    a.store.state.broken = true;
    await expect(a.worlds.download('ocean')).resolves.toEqual({ world: 'ocean', status: 'none', done: 0, total: 3, running: false, error: 'storage' });
    expect(await a.worlds.status('ocean')).toBe('none');
    const b = setup(await listOf({ ocean: OCEAN }), OCEAN, { caches: undefined });
    await expect(b.worlds.download('ocean')).resolves.toMatchObject({ status: 'none', error: 'storage' });
    expect(filesAsked(a.server)).toEqual([]);
    expect(filesAsked(b.server)).toEqual([]);
  });

  it('a page that cannot count fingerprints keeps nothing: "changed"', async () => {
    const { worlds, store } = setup(await listOf({ ocean: OCEAN }), OCEAN, { digest: () => Promise.reject(new Error('no crypto.subtle')) });
    await expect(worlds.download('ocean')).resolves.toMatchObject({ status: 'none', done: 0, error: 'changed' });
    expect(store.state.puts).toEqual([]);
  });

  it('asked twice while it runs, a world is downloaded once', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    const first = worlds.download('ocean'), second = worlds.download('ocean');
    expect(second).toBe(first);
    await first;
    expect(filesAsked(server).length).toBe(3);
  });

  it('two worlds are downloaded one after the other, never two files at once', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN, space: SPACE }), { ...OCEAN, ...SPACE });
    const [a, b] = await Promise.all([worlds.download('ocean'), worlds.download('space')]);
    expect([a.status, b.status]).toEqual(['ready', 'ready']);
    expect(server.s.most).toBe(1);
    expect(filesAsked(server).map((u) => u.split('?')[0]).at(-1)).toBe(at('models/space/s.glb'));
  });
});

describe('downloadNext: the next world, while the previous one is played', () => {
  it('no next world (the published game has one world): nothing is asked for, not even the list', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN);
    expect(await worlds.downloadNext([])).toBeNull();
    expect(server.s.asked).toEqual([]);
    expect(worlds.state()).toBeNull();
  });

  it('downloads the first candidate; the state tells of it from the call itself', async () => {
    const { worlds } = setup(await listOf({ ocean: OCEAN, space: SPACE }), { ...OCEAN, ...SPACE });
    const running = worlds.downloadNext(['ocean', 'space']);
    expect(worlds.state()).toEqual({ world: 'ocean', status: 'none', done: 0, total: 0, running: true, error: null });
    expect(await running).toMatchObject({ world: 'ocean', status: 'ready', done: 3 });
    expect(worlds.state()).toMatchObject({ world: 'ocean', status: 'ready', running: false });
    expect(await worlds.status('space')).toBe('none');
  });

  it('a world already downloaded, and one without files of its own, are passed over', async () => {
    const { worlds, store, server } = setup(await listOf({ ocean: OCEAN, space: SPACE }), { ...OCEAN, ...SPACE });
    for (const [url, text] of Object.entries(OCEAN)) store.put('worlds', url, text);
    expect(await worlds.downloadNext(['plain', 'ocean', 'space'])).toMatchObject({ world: 'space', status: 'ready', done: 1 });
    expect(filesAsked(server).map((u) => u.split('?')[0])).toEqual([at('models/space/s.glb')]);
  });

  it('a world downloaded in part is the next one: the rest of it is brought', async () => {
    const { worlds, store } = setup(await listOf({ ocean: OCEAN, space: SPACE }), { ...OCEAN, ...SPACE });
    store.put('worlds', 'models/ocean/a.glb', OCEAN['models/ocean/a.glb']);
    expect(await worlds.downloadNext(['ocean', 'space'])).toMatchObject({ world: 'ocean', status: 'ready', done: 3 });
  });

  it('every candidate is downloaded: nothing to do', async () => {
    const { worlds, store, server } = setup(await listOf({ space: SPACE }), SPACE);
    store.put('worlds', 'models/space/s.glb', SPACE['models/space/s.glb']);
    expect(await worlds.downloadNext(['space'])).toBeNull();
    expect(filesAsked(server)).toEqual([]);
    expect(worlds.state()).toBeNull();   // no download ran: the state is the one before the call
  });

  it('the data saver: nothing is asked for, the state says why', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN, { mayDownload: () => false });
    expect(await worlds.downloadNext(['ocean'])).toEqual({ world: 'ocean', status: 'none', done: 0, total: 0, running: false, error: 'saving' });
    expect(server.s.asked).toEqual([]);
    expect(worlds.state()).toMatchObject({ error: 'saving' });
  });

  it('offline (the browser says so): nothing is asked for, the state says "network"; online again the next call downloads', async () => {
    let online = false;
    const { worlds, server } = setup(await listOf({ ocean: OCEAN }), OCEAN, { online: () => online });
    expect(await worlds.downloadNext(['ocean'])).toEqual({ world: 'ocean', status: 'none', done: 0, total: 0, running: false, error: 'network' });
    expect(server.s.asked).toEqual([]);
    online = true;
    expect(await worlds.downloadNext(['ocean'])).toMatchObject({ world: 'ocean', status: 'ready', error: null });
  });
});

describe('a world asked for by name goes before the background (the heroine at its portal)', () => {
  it('the download of the background stops after its current file, "yielded"; the world asked for comes next', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN, space: SPACE }), { ...OCEAN, ...SPACE });
    const first = server.gate('models/ocean/a.glb');
    const background = worlds.downloadNext(['ocean']);
    await first.started;
    const asked = worlds.download('space');
    first.release();
    expect(await background).toMatchObject({ world: 'ocean', status: 'partial', done: 1, total: 3, running: false, error: 'yielded' });
    expect(await asked).toMatchObject({ world: 'space', status: 'ready', done: 1 });
    expect(filesAsked(server).map((u) => u.split('?')[0])).toEqual([at('models/ocean/a.glb'), at('models/space/s.glb')]);
    expect(server.s.most).toBe(1);
    // the next downloadNext brings the rest of it
    expect(await worlds.downloadNext(['ocean'])).toMatchObject({ world: 'ocean', status: 'ready', done: 3 });
  });

  it('the world of the background asked for by name: it no longer gives way, and is downloaded once', async () => {
    const { worlds, server } = setup(await listOf({ ocean: OCEAN, space: SPACE }), { ...OCEAN, ...SPACE });
    const first = server.gate('models/ocean/a.glb');
    const background = worlds.downloadNext(['ocean']);
    await first.started;
    const asked = worlds.download('ocean');
    const other = worlds.download('space');
    first.release();
    expect(await asked).toMatchObject({ world: 'ocean', status: 'ready', done: 3, error: null });
    expect(await background).toBe(await asked);
    expect(await other).toMatchObject({ world: 'space', status: 'ready' });
    expect(filesAsked(server).length).toBe(4);
  });

  it('a world asked for by name does not stop another one asked for by name', async () => {
    const { worlds } = setup(await listOf({ ocean: OCEAN, space: SPACE }), { ...OCEAN, ...SPACE });
    const [a, b] = await Promise.all([worlds.download('ocean'), worlds.download('space')]);
    expect([a.status, a.error, b.status]).toEqual(['ready', null, 'ready']);
  });
});
