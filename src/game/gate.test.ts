import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { PROBE_FILE, PROBE_TIMEOUT_MS, createGate, probeNetwork, type GateEnv, type GateStatus, type ProbeEnv } from './gate';
import type { WorldStatus } from '../core/worldcache';
import source from './gate.ts?raw';

// The gate of a world (TECH-09) on stand-ins for the cache of worlds, the network and the refusal: every branch of
// the decision, what is asked and what is not, one refusal per refused check. The probe of the network runs on a
// stand-in for fetch and on fake time. Nothing calls the gate in the game yet (the change of world will).
const WORLDS = ['fairy', 'ocean', 'space'];

/** A promise the test settles itself. */
function held<T>() {
  let release!: (value: T) => void, fail!: (error: unknown) => void;
  const wait = new Promise<T>((resolve, reject) => { release = resolve; fail = reject; });
  return { wait, release, fail };
}

/** What the stand-ins answer: a plain value, or a function when the test needs more (a delay, an error). */
interface Stand {
  worlds?: readonly string[];
  installed?: readonly string[];
  status?: GateStatus | GateEnv['status'];
  online?: boolean | GateEnv['online'];
  probe?: boolean | GateEnv['probe'];
  refuse?: GateEnv['refuse'];
}
/** A gate on stand-ins: the cache says `status` ('none' unless told), the page `online` (true), the probe `probe` (false). */
function setup(o: Stand = {}) {
  const { status = 'none', online = true, probe = false } = o;
  const asStatus: GateEnv['status'] = typeof status === 'function' ? status : async () => status;
  const asOnline: GateEnv['online'] = typeof online === 'function' ? online : () => online;
  const asProbe: GateEnv['probe'] = typeof probe === 'function' ? probe : async () => probe;
  const env = {
    worlds: o.worlds ?? WORLDS,
    installed: o.installed ?? ['fairy'],
    status: vi.fn(asStatus),
    online: vi.fn(asOnline),
    probe: vi.fn(asProbe),
    refuse: vi.fn(o.refuse ?? (() => {})),
  };
  return { env, gate: createGate(env) };
}

const noise = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')];
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // Nothing of the gate goes to the console: the walkthrough fails on any error or warning there.
  for (const spy of noise) { expect(spy).not.toHaveBeenCalled(); spy.mockClear(); }
});

describe('a world that needs no download is entered without a question', () => {
  it('the default world: the cache, the network and the refusal are not asked', async () => {
    const { env, gate } = setup({ status: 'none', online: false });
    expect(await gate.canEnter('fairy')).toEqual({ enter: true, from: 'cache' });
    expect(env.status).not.toHaveBeenCalled();
    expect(env.online).not.toHaveBeenCalled();
    expect(env.probe).not.toHaveBeenCalled();
    expect(env.refuse).not.toHaveBeenCalled();
  });

  it('the worlds of the installation are the ones handed in, not the first of the registry', async () => {
    const { env, gate } = setup({ installed: ['ocean', 'hub'], status: 'none', online: false });
    expect(await gate.canEnter('ocean')).toEqual({ enter: true, from: 'cache' });
    expect(await gate.canEnter('hub')).toEqual({ enter: true, from: 'cache' });   // the hub: no list to ask
    expect(env.status).not.toHaveBeenCalled();
    expect(await gate.canEnter('fairy')).toEqual({ enter: false });
    expect(env.status).toHaveBeenCalledWith('fairy');
  });

  it('a registry of one world: the status is not asked (the build has no list of worlds, a 404 is an error in the console)', async () => {
    for (const worlds of [['fairy'], []]) {
      const { env, gate } = setup({ worlds, installed: ['fairy'], status: 'none', online: false });
      expect(await gate.canEnter('fairy')).toEqual({ enter: true, from: 'cache' });
      expect(await gate.canEnter('ocean')).toEqual({ enter: true, from: 'cache' });
      expect(env.status).not.toHaveBeenCalled();
      expect(env.probe).not.toHaveBeenCalled();
      expect(env.refuse).not.toHaveBeenCalled();
    }
  });

  it('a registry of two worlds asks the status of the one that is not the default', async () => {
    const { env, gate } = setup({ worlds: ['fairy', 'ocean'], status: 'ready' });
    await gate.canEnter('ocean');
    expect(env.status).toHaveBeenCalledTimes(1);
    expect(env.status).toHaveBeenCalledWith('ocean');
  });
});

describe('a world in the cache is entered from the cache', () => {
  it.each(['core', 'ready'] as const)('"%s": entered without network, the network is not asked at all', async (status) => {
    const { env, gate } = setup({ status, online: false });
    expect(await gate.canEnter('ocean')).toEqual({ enter: true, from: 'cache' });
    expect(env.online).not.toHaveBeenCalled();
    expect(env.probe).not.toHaveBeenCalled();
    expect(env.refuse).not.toHaveBeenCalled();
  });

  it.each(['core', 'ready'] as const)('"%s" with network is still "from the cache": nothing is to download', async (status) => {
    const { env, gate } = setup({ status, online: true, probe: true });
    expect(await gate.canEnter('ocean')).toEqual({ enter: true, from: 'cache' });
    expect(env.probe).not.toHaveBeenCalled();
  });
});

describe('a world that is not downloaded needs the network', () => {
  it.each(['partial', 'none'] as const)('"%s", the page says offline: refused without a single request', async (status) => {
    const { env, gate } = setup({ status, online: false, probe: true });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(env.probe).not.toHaveBeenCalled();
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it.each(['partial', 'none'] as const)('"%s", the probe answers: entered "from the network" after one probe, no refusal', async (status) => {
    const { env, gate } = setup({ status, online: true, probe: true });
    expect(await gate.canEnter('ocean')).toEqual({ enter: true, from: 'network' });
    expect(env.probe).toHaveBeenCalledTimes(1);
    expect(env.refuse).not.toHaveBeenCalled();
  });

  it.each(['partial', 'none'] as const)('"%s", the page says online but the probe fails: refused (navigator.onLine alone is not the network)', async (status) => {
    const { env, gate } = setup({ status, online: true, probe: false });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(env.probe).toHaveBeenCalledTimes(1);
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it('a probe that rejects is no network: refused, nothing is thrown', async () => {
    const { env, gate } = setup({ probe: async () => { throw new TypeError('Failed to fetch'); } });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it('a probe that throws at once is no network: refused, nothing is thrown', async () => {
    const { env, gate } = setup({ probe: () => { throw new Error('no fetch here'); } });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it('only a true of the probe is the network', async () => {
    const { env, gate } = setup({ probe: (async () => 'yes') as never });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it('only an explicit false of the page is "offline": a browser that does not tell is probed', async () => {
    const { env, gate } = setup({ online: (() => undefined) as never, probe: true });
    expect(await gate.canEnter('ocean')).toEqual({ enter: true, from: 'network' });
    expect(env.probe).toHaveBeenCalledTimes(1);
  });
});

describe('a status that cannot be told reads as "none"', () => {
  it('the status rejects, offline: refused, nothing is thrown', async () => {
    const { env, gate } = setup({ status: async () => { throw new Error('no cache'); }, online: false });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(env.probe).not.toHaveBeenCalled();
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it('the status rejects, the network answers: entered "from the network"', async () => {
    const { env, gate } = setup({ status: async () => { throw new Error('no cache'); }, probe: true });
    expect(await gate.canEnter('ocean')).toEqual({ enter: true, from: 'network' });
    expect(env.refuse).not.toHaveBeenCalled();
  });

  it('the status throws at once: the same', async () => {
    const { env, gate } = setup({ status: () => { throw new Error('no cache'); }, online: false });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it('a status the gate does not know is not "downloaded"', async () => {
    const { env, gate } = setup({ status: (async () => 'stale') as never, online: false });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });
});

describe('knocking at the portal many times', () => {
  it('while the status is asked: one check, one refusal, the same promise', async () => {
    const status = held<GateStatus>();
    const { env, gate } = setup({ status: () => status.wait, online: false });
    const first = gate.canEnter('ocean');
    const second = gate.canEnter('ocean');
    const third = gate.canEnter('ocean');
    expect(second).toBe(first);
    expect(third).toBe(first);
    status.release('none');
    expect(await Promise.all([first, second, third])).toEqual([{ enter: false }, { enter: false }, { enter: false }]);
    expect(env.status).toHaveBeenCalledTimes(1);
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it('while the network is probed: one probe, one refusal', async () => {
    const probe = held<boolean>();
    const { env, gate } = setup({ status: 'partial', probe: () => probe.wait });
    const first = gate.canEnter('ocean');
    await vi.waitFor(() => expect(env.probe).toHaveBeenCalledTimes(1));
    const second = gate.canEnter('ocean');
    expect(second).toBe(first);
    probe.release(false);
    expect(await second).toEqual({ enter: false });
    expect(env.status).toHaveBeenCalledTimes(1);
    expect(env.probe).toHaveBeenCalledTimes(1);
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it('after the answer a new knock is a new check and a new refusal', async () => {
    const { env, gate } = setup({ status: 'none', online: false });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(env.status).toHaveBeenCalledTimes(2);
    expect(env.refuse).toHaveBeenCalledTimes(2);
  });

  it('a refused world opens once it is downloaded: the answer is not remembered', async () => {
    let now: GateStatus = 'none';
    const { env, gate } = setup({ status: async () => now, online: false });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    now = 'ready';
    expect(await gate.canEnter('ocean')).toEqual({ enter: true, from: 'cache' });
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it('two worlds are two checks: each has its own refusal', async () => {
    const waits: Record<string, ReturnType<typeof held<GateStatus>>> = { ocean: held(), space: held() };
    const { env, gate } = setup({ status: (id) => waits[id].wait, online: false });
    const ocean = gate.canEnter('ocean');
    const space = gate.canEnter('space');
    expect(space).not.toBe(ocean);
    waits.space.release('ready');
    expect(await space).toEqual({ enter: true, from: 'cache' });
    waits.ocean.release('none');
    expect(await ocean).toEqual({ enter: false });
    expect(env.status.mock.calls.map((c) => c[0])).toEqual(['ocean', 'space']);
    expect(env.refuse).toHaveBeenCalledTimes(1);
  });

  it('a refusal that throws does not leave the check running: the next knock is a new check', async () => {
    let broken = true;
    const { env, gate } = setup({ status: 'none', online: false, refuse: () => { if (broken) throw new Error('no speech'); } });
    await expect(gate.canEnter('ocean')).rejects.toThrow('no speech');
    broken = false;
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(env.status).toHaveBeenCalledTimes(2);
    expect(env.refuse).toHaveBeenCalledTimes(2);
  });
});

describe('the gate only decides', () => {
  it('sets no timer of its own: nothing counts down for the child (LEARN-14)', async () => {
    vi.useFakeTimers();
    const { gate } = setup({ status: 'none', online: true, probe: false });
    expect(await gate.canEnter('ocean')).toEqual({ enter: false });
    expect(await setup({ status: 'none', online: false }).gate.canEnter('ocean')).toEqual({ enter: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('imports nothing: the cache, the lines and the voice are handed in', () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toContain('export function createGate(');
    expect(code).not.toMatch(/\bimport\b/);
    // The page's own word about the network comes through `online`, not read here.
    expect(code).not.toMatch(/\bnavigator\b/);
  });

  it('takes the status of the cache of worlds as it is', () => {
    expectTypeOf<WorldStatus>().toEqualTypeOf<GateStatus>();
  });
});

// ---------- the probe of the network ----------

const BASE = 'http://game.test/academy/?debug';

interface Asked { url: string; init: RequestInit }
/** fetch that answers every address with `answer` (a status, or an error to reject with). */
function server(answer: number | Error) {
  const asked: Asked[] = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    asked.push({ url, init });
    if (answer instanceof Error) throw answer;
    return new Response(null, { status: answer });
  };
  return { asked, fetch };
}
/** fetch that never answers; `honour` - it rejects when the request is aborted, as the browser's does. */
function silent(honour: boolean) {
  const asked: Asked[] = [];
  const fetch = (url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
    asked.push({ url, init });
    if (honour) init.signal!.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  });
  return { asked, fetch };
}
let stamps = 0;
const probeEnv = (fetch: ProbeEnv['fetch'], more: Partial<ProbeEnv> = {}): ProbeEnv => ({ fetch, base: BASE, stamp: () => `t${stamps++}`, ...more });
/** Follows a promise: `value` is undefined until it settles. */
function watch<T>(p: Promise<T>) {
  const seen: { value: T | undefined; error: unknown } = { value: undefined, error: undefined };
  p.then((v) => { seen.value = v; }, (e) => { seen.error = e; });
  return seen;
}

describe('probeNetwork: one real request tells whether the network is there', () => {
  it('reads the answer to its end before it answers: an answer left unread is reported by Chrome as an aborted request', async () => {
    let read = 0;
    const fetchOne = async () => ({ ok: true, status: 200, arrayBuffer: async () => { read++; return new ArrayBuffer(0); } }) as unknown as Response;
    expect(await probeNetwork(1000, probeEnv(fetchOne, { stamp: () => 'r' }))).toBe(true);
    expect(read).toBe(1);
    // an answer that breaks off while it is read is no network
    const broken = async () => ({ ok: true, status: 200, arrayBuffer: async () => { throw new TypeError('network error'); } }) as unknown as Response;
    expect(await probeNetwork(1000, probeEnv(broken, { stamp: () => 'r' }))).toBe(false);
  });

  it('asks the head of a file of the build, past the installed files and the HTTP cache', async () => {
    const s = server(200);
    expect(await probeNetwork(1000, probeEnv(s.fetch, { stamp: () => 'abc' }))).toBe(true);
    expect(s.asked).toHaveLength(1);
    const { url, init } = s.asked[0];
    expect(url).toBe(`http://game.test/academy/${PROBE_FILE}?net=abc`);
    expect(init.method).toBe('HEAD');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal!.aborted).toBe(false);
  });

  it('the file lies in public/, which every build copies whole', () => {
    expect(Object.keys(import.meta.glob('../../public/*'))).toContain(`../../public/${PROBE_FILE}`);
  });

  it('every probe has an address of its own', async () => {
    const s = server(200);
    const env = probeEnv(s.fetch);
    await probeNetwork(1000, env);
    await probeNetwork(1000, env);
    expect(s.asked).toHaveLength(2);
    expect(s.asked[0].url).not.toBe(s.asked[1].url);
    expect(s.asked[0].url.split('?')[0]).toBe(s.asked[1].url.split('?')[0]);
  });

  it.each([404, 500, 503])('an answer %i is not the network', async (code) => {
    expect(await probeNetwork(1000, probeEnv(server(code).fetch))).toBe(false);
  });

  it('a request that fails is false, nothing is thrown', async () => {
    expect(await probeNetwork(1000, probeEnv(server(new TypeError('Failed to fetch')).fetch))).toBe(false);
  });

  it('a fetch that throws at once is false, nothing is thrown', async () => {
    vi.useFakeTimers();
    const fetch = (() => { throw new Error('no fetch here'); }) as unknown as ProbeEnv['fetch'];
    expect(await probeNetwork(1000, probeEnv(fetch))).toBe(false);
    expect(vi.getTimerCount(), 'the time limit is left running').toBe(0);
  });

  it('an address that cannot be built is false, no request is made', async () => {
    const s = server(200);
    expect(await probeNetwork(1000, probeEnv(s.fetch, { base: 'not an address' }))).toBe(false);
    expect(s.asked).toEqual([]);
  });

  it('is cut off after the limit: the request is aborted and the answer is false', async () => {
    vi.useFakeTimers();
    const s = silent(true);
    const seen = watch(probeNetwork(1000, probeEnv(s.fetch)));
    await vi.advanceTimersByTimeAsync(999);
    expect(seen.value).toBeUndefined();
    expect(s.asked[0].init.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen.value).toBe(false);
    expect(seen.error).toBeUndefined();
    expect(s.asked[0].init.signal!.aborted).toBe(true);
  });

  it('a request that does not honour the abort does not hold the answer either', async () => {
    vi.useFakeTimers();
    const s = silent(false);
    const seen = watch(probeNetwork(1000, probeEnv(s.fetch)));
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen.value).toBe(false);
  });

  it('the limit is a few seconds unless another is given', async () => {
    expect(PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(2000);
    expect(PROBE_TIMEOUT_MS).toBeLessThanOrEqual(6000);
    vi.useFakeTimers();
    const seen = watch(probeNetwork(undefined, probeEnv(silent(true).fetch)));
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS - 1);
    expect(seen.value).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(seen.value).toBe(false);
  });

  it('an answer in time stops the limit: the request is not aborted afterwards', async () => {
    vi.useFakeTimers();
    const s = server(200);
    expect(await probeNetwork(1000, probeEnv(s.fetch))).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.asked[0].init.signal!.aborted).toBe(false);
  });

  it('on the page: the browser\'s fetch, the page\'s address, a new parameter every time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const s = server(200);
    const fetch = vi.fn(s.fetch);
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('document', { baseURI: 'http://play.test/game/index.html?debug#x' });
    expect(await probeNetwork()).toBe(true);
    expect(await probeNetwork()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [a, b] = s.asked.map((x) => new URL(x.url));
    expect(a.origin + a.pathname).toBe(`http://play.test/game/${PROBE_FILE}`);
    // The moment of the request and a count: new within the page and from one launch to the next.
    const [first, second] = [a, b].map((u) => /^(\w+)-(\d+)$/.exec(u.searchParams.get('net') ?? ''));
    expect(first?.[1]).toBe((1_800_000_000_000).toString(36));
    expect(second?.[1]).toBe(first?.[1]);
    expect(Number(second?.[2])).toBe(Number(first?.[2]) + 1);
    expect([...a.searchParams.keys()]).toEqual(['net']);
    expect(s.asked[0].init).toMatchObject({ method: 'HEAD', cache: 'no-store' });
    expect(s.asked[0].init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('the gate with the real probe', () => {
  it('the server does not answer in time: refused once the limit is out, not before', async () => {
    vi.useFakeTimers();
    const s = silent(true);
    const { env, gate } = setup({ status: 'none', online: true, probe: () => probeNetwork(3000, probeEnv(s.fetch)) });
    const seen = watch(gate.canEnter('ocean'));
    await vi.advanceTimersByTimeAsync(2999);
    expect(seen.value).toBeUndefined();
    expect(env.refuse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(seen.value).toEqual({ enter: false });
    expect(env.refuse).toHaveBeenCalledTimes(1);
    expect(s.asked).toHaveLength(1);
  });

  it('the server answers: entered "from the network"; offline no request leaves', async () => {
    const s = server(200);
    const probe = () => probeNetwork(3000, probeEnv(s.fetch));
    expect(await setup({ status: 'partial', online: true, probe }).gate.canEnter('ocean')).toEqual({ enter: true, from: 'network' });
    expect(s.asked).toHaveLength(1);
    expect(await setup({ status: 'partial', online: false, probe }).gate.canEnter('ocean')).toEqual({ enter: false });
    expect(s.asked).toHaveLength(1);
  });
});
