import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rig } from '../core/assets';
import { PIP_FILES, createPipLoader, pipCache, pipPrefetchDue, type PipEnv } from './pip-load';

// Pip's lazy model (decision of 2026-11-28) on stand-ins for the network, Cache Storage and the model's load: he is
// there when his files are, absent - quietly and soon - when they are not, and his files are brought once, in the
// background, only after the first world with English on. The real service worker is played by `npm run e2e`.
const BASE = 'http://game.test/academy/';
const at = (rel: string) => new URL(rel, BASE).href;
const REV = 'r1';

function fakeCaches() {
  const stores = new Map<string, Map<string, ArrayBuffer>>();
  const state = { full: false };
  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };
  const storage = {
    async open(name: string) {
      const store = open(name);
      return {
        async match(url: string) { const b = store.get(url); return b ? new Response(b.slice(0)) : undefined; },
        async put(url: string, res: Response) {
          if (state.full) throw new DOMException('Quota exceeded.', 'QuotaExceededError');
          store.set(url, await res.arrayBuffer());
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  return { caches: storage as unknown as CacheStorage, stores, state, put: (name: string, rel: string) => open(name).set(at(rel), new ArrayBuffer(3)) };
}

/** A page: the server (`fail` - the connection drops; `hang` - never answers), the cache, the model's load. */
function page(o: Partial<PipEnv> & { fail?: boolean; hang?: boolean } = {}) {
  const c = fakeCaches();
  const asked: string[] = [];
  const rigs: number[] = [];
  const env: PipEnv = {
    fetch: (url, signal) => {
      asked.push(url);
      if (o.hang) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      if (o.fail) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(new Response('bytes', { status: 200, headers: { 'Content-Type': 'model/gltf-binary' } }));
    },
    caches: c.caches, base: BASE, rev: REV, online: () => true, mayDownload: () => true,
    rig: async () => { rigs.push(1); return { root: {}, model: {}, clips: new Map() } as unknown as Rig; },
    loadMs: 15_000, fetchMs: 60_000,
    ...o,
  };
  return { env, asked, rigs, ...c, loader: createPipLoader(() => env) };
}

const DONE = { english: true, worlds: { fairy: { final: true } } } as const;
const NOT_DONE = { english: true, worlds: { fairy: { final: false } } } as const;
const NO_ENGLISH = { english: false, worlds: { fairy: { final: true } } } as const;

/** The console must stay quiet: an error or a warning there is a failure of the game (tools/e2e.mjs reads it). */
function quiet() {
  const spies = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')];
  return () => spies.flatMap((s) => s.mock.calls);
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Pip\'s files', () => {
  it('are the ones of public/models/pip/, his model and its texture', () => {
    const dir = join(__dirname, '../../public/models/pip');
    const shipped = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile())
      .map((f) => `models/pip/${join(f.parentPath, f.name).slice(dir.length + 1).split('\\').join('/')}`).sort();
    expect([...PIP_FILES].sort()).toEqual(shipped);
  });

  it('are kept in a cache named by their revision', () => {
    expect(pipCache('abc123')).toBe('pip-abc123');
  });
});

describe('loadPip: his model, or quietly none', () => {
  it('brings his files into the cache of the revision, then loads the model', async () => {
    const p = page();
    const rig = await p.loader.load();
    expect(rig).not.toBeNull();
    expect(p.asked).toEqual(PIP_FILES.map((f) => `${at(f)}?v=${REV}`));
    expect([...p.stores.get(pipCache(REV))!.keys()].sort()).toEqual(PIP_FILES.map(at).sort());
    expect(p.rigs).toHaveLength(1);
  });

  it('asks the network for nothing the cache holds', async () => {
    const p = page();
    for (const f of PIP_FILES) p.put(pipCache(REV), f);
    expect(await p.loader.load()).not.toBeNull();
    expect(p.asked).toEqual([]);
  });

  it('offline and not in the cache: null at once, no request, no model load, nothing in the console', async () => {
    const said = quiet();
    const p = page({ online: () => false });
    const t = Date.now();
    expect(await p.loader.load()).toBeNull();
    expect(Date.now() - t).toBeLessThan(100);
    expect([p.asked, p.rigs, said()]).toEqual([[], [], []]);
  });

  it('offline with his files in the cache: he is there (the service worker serves them)', async () => {
    const p = page({ online: () => false });
    for (const f of PIP_FILES) p.put(pipCache(REV), f);
    expect(await p.loader.load()).not.toBeNull();
    expect(p.asked).toEqual([]);
  });

  it('the connection drops, the server refuses, the storage is full, the model fails: null, quietly', async () => {
    const said = quiet();
    expect(await page({ fail: true }).loader.load()).toBeNull();
    const refused = page({ fetch: async () => new Response('', { status: 404 }) });
    expect(await refused.loader.load()).toBeNull();
    const full = page();
    full.state.full = true;
    expect(await full.loader.load()).toBeNull();
    expect(await page({ rig: () => Promise.reject(new Error('could not load models/pip/pip.glb')) }).loader.load()).toBeNull();
    expect(await page({ caches: undefined, online: () => false }).loader.load()).toBeNull();
    expect(said()).toEqual([]);
  });

  it('a server that never answers holds the hub no longer than its limit', async () => {
    vi.useFakeTimers();
    const p = page({ hang: true, loadMs: 15_000 });
    let got: Rig | null | undefined;
    void p.loader.load().then((r) => { got = r; });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(got).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(got).toBeNull();
  });

  it('a failed load is tried again the next time: his meeting waits for the next visit', async () => {
    let up = false;
    const p = page({ online: () => up });
    expect(await p.loader.load()).toBeNull();
    up = true;
    expect(await p.loader.load()).not.toBeNull();
  });

  it('drops the caches of older revisions once the current one holds his files, and no other cache', async () => {
    const p = page();
    p.put('pip-old', PIP_FILES[0]);
    p.put('worlds', 'models/sky/x.glb');
    expect(await p.loader.load()).not.toBeNull();
    expect([...p.stores.keys()].sort()).toEqual([pipCache(REV), 'worlds']);
  });
});

describe('prefetchPip: in the background, after the first world, English on, once', () => {
  it('is due only when the first world is finished and English is on', () => {
    expect([pipPrefetchDue(DONE), pipPrefetchDue(NOT_DONE), pipPrefetchDue(NO_ENGLISH), pipPrefetchDue({ english: true, worlds: {} })]).toEqual([true, false, false, false]);
  });

  it('asks for nothing before the first world is finished, nor with English off', async () => {
    const p = page();
    expect(await p.loader.prefetch(NOT_DONE)).toBe(false);
    expect(await p.loader.prefetch(NO_ENGLISH)).toBe(false);
    expect(p.asked).toEqual([]);
  });

  it('brings his files once: calls while it runs share it, calls after it ask for nothing', async () => {
    const p = page();
    const [a, b] = [p.loader.prefetch(DONE), p.loader.prefetch(DONE)];
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(await p.loader.prefetch(DONE)).toBe(true);
    expect(p.asked).toHaveLength(PIP_FILES.length);
    // the hub's load after it finds them in the cache
    expect(await p.loader.load()).not.toBeNull();
    expect(p.asked).toHaveLength(PIP_FILES.length);
    expect(p.rigs).toHaveLength(1);   // the prefetch does not build the model
  });

  it('the hub\'s load while the prefetch runs waits for it, no second download', async () => {
    const p = page();
    const [pre, rig] = await Promise.all([p.loader.prefetch(DONE), p.loader.load()]);
    expect(pre).toBe(true);
    expect(rig).not.toBeNull();
    expect(p.asked).toHaveLength(PIP_FILES.length);
  });

  it('offline or with the data saver: no request; tried again at the next call', async () => {
    const said = quiet();
    let up = false, saving = true;
    const p = page({ online: () => up, mayDownload: () => !saving });
    expect(await p.loader.prefetch(DONE)).toBe(false);
    saving = false;
    expect(await p.loader.prefetch(DONE)).toBe(false);
    expect(p.asked).toEqual([]);
    up = true;
    expect(await p.loader.prefetch(DONE)).toBe(true);
    expect(said()).toEqual([]);
  });

  it('a download that failed never rejects, is quiet, and is tried again next time', async () => {
    const said = quiet();
    let fail = true;
    const p = page({ fetch: async () => { if (fail) throw new TypeError('Failed to fetch'); return new Response('x', { status: 200 }); } });
    expect(await p.loader.prefetch(DONE)).toBe(false);
    fail = false;
    expect(await p.loader.prefetch(DONE)).toBe(true);
    expect(said()).toEqual([]);
  });

  it('a stalled connection ends the download at its limit; it is tried again', async () => {
    vi.useFakeTimers();
    const p = page({ hang: true, fetchMs: 60_000 });
    let got: boolean | undefined;
    void p.loader.prefetch(DONE).then((r) => { got = r; });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(got).toBe(false);
    expect(p.asked).toHaveLength(1);
  });
});
