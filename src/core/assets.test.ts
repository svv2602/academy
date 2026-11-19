import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { RETRIES, loadCache, retry } from './assets';
import { gltf, release, resetProgress, rig, setProgressHandler, shared, staticGeo, texturedParts, withScope } from './assets';

// The scopes below are tested on the real loader of the game with only the network replaced: this GLTFLoader gives
// models built here from real Three.js objects, can hold a model back (`gate`), can fail it (`blocked`) and can fail
// chosen requests of it, in the order they are made (`plan`).
const net = vi.hoisted(() => ({
  asked: [] as string[],
  gate: new Map<string, Promise<void>>(),
  blocked: new Set<string>(),
  plan: new Map<string, Array<'fail' | 'ok'>>(),
  make: (_path: string): unknown => { throw new Error('the fake loader has no model maker yet'); },
}));
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder() { return this; }
    async loadAsync(url: string) {
      const path = url.replace(/^.*models\//, '').replace(/\.glb$/, '');
      net.asked.push(path);
      const planned = net.plan.get(path)?.shift();
      await net.gate.get(path);
      if (planned === 'fail' || net.blocked.has(path)) throw new Error(`blocked ${path}`);
      return net.make(path);
    }
  },
}));

const noWait = () => Promise.resolve();
/** A load that fails `fails` times and then gives `value`; `calls` counts every attempt. */
function flaky<T>(fails: number, value: T) {
  const f = Object.assign(vi.fn(async () => {
    if (f.calls < fails) { f.calls++; throw new Error(`attempt ${f.calls} failed`); }
    f.calls++;
    return value;
  }), { calls: 0 });
  return f;
}

describe('retry (TECH-08)', () => {
  it('repeats a failed load up to three times', () => {
    expect(RETRIES).toBe(3);
  });

  it('gives the first success at once, without waiting', async () => {
    const load = flaky(0, 'ok'), wait = vi.fn(noWait);
    await expect(retry(load, RETRIES, wait)).resolves.toBe('ok');
    expect(load.calls).toBe(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('succeeds when an attempt after two failures succeeds', async () => {
    const load = flaky(2, 'ok'), wait = vi.fn((_n: number) => Promise.resolve());
    await expect(retry(load, RETRIES, wait)).resolves.toBe('ok');
    expect(load.calls).toBe(3);
    expect(wait.mock.calls.map((c) => c[0])).toEqual([0, 1]);
  });

  it('succeeds on the third repeat', async () => {
    const load = flaky(3, 'ok');
    await expect(retry(load, RETRIES, noWait)).resolves.toBe('ok');
    expect(load.calls).toBe(4);
  });

  it('gives up after the first attempt and three repeats, with the last error', async () => {
    const load = flaky(99, 'never'), wait = vi.fn(noWait);
    await expect(retry(load, RETRIES, wait)).rejects.toThrow('attempt 4 failed');
    expect(load.calls).toBe(4);
    expect(wait).toHaveBeenCalledTimes(3);
  });

  it('waits a short, growing pause by default', async () => {
    vi.useFakeTimers();
    try {
      const load = flaky(99, 'never');
      const p = retry(load);
      const caught = p.catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(0);
      expect(load.calls).toBe(1);
      await vi.advanceTimersByTimeAsync(299);
      expect(load.calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(load.calls).toBe(2);
      // All the pauses together stay short: the child is looking at the loading bar meanwhile.
      await vi.advanceTimersByTimeAsync(2100);
      expect(load.calls).toBe(4);
      expect(await caught).toBeInstanceOf(Error);
    } finally { vi.useRealTimers(); }
  });
});

describe('loadCache (TECH-08)', () => {
  it('loads one key once, also when it is asked for twice at the same time', async () => {
    const load = vi.fn(async (k: string) => `model ${k}`);
    const get = loadCache(load, RETRIES, noWait);
    const [a, b] = await Promise.all([get('cat'), get('cat')]);
    expect(a).toBe('model cat'); expect(b).toBe('model cat');
    expect(await get('cat')).toBe('model cat');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('repeats a failing load before giving up', async () => {
    const load = vi.fn(async () => { throw new Error('blocked'); });
    const get = loadCache(load, RETRIES, noWait);
    await expect(get('rock')).rejects.toThrow('blocked');
    expect(load).toHaveBeenCalledTimes(1 + RETRIES);
  });

  it('does not keep a failed load: asking again loads again and can succeed', async () => {
    let blocked = true;
    const load = vi.fn(async (k: string) => { if (blocked) throw new Error('blocked'); return `model ${k}`; });
    const get = loadCache(load, RETRIES, noWait);
    const first = get('tree');
    await expect(first).rejects.toThrow('blocked');
    blocked = false;
    const second = get('tree');
    expect(second).not.toBe(first);
    await expect(second).resolves.toBe('model tree');
    expect(load).toHaveBeenCalledTimes(1 + RETRIES + 1);
  });

  it('keeps the other keys when one fails', async () => {
    const load = vi.fn(async (k: string) => { if (k === 'bad') throw new Error('blocked'); return k; });
    const get = loadCache(load, RETRIES, noWait);
    const good = get('good');
    await expect(get('bad')).rejects.toThrow('blocked');
    expect(get('good')).toBe(good);
  });
});

// ---------- scopes: which world a model belongs to (TECH-09, TECH-15) ----------
// The loader keeps its models for the whole test file, as it does for the whole page: every test uses paths and
// scope ids of its own (`t1/…`, `w1`).

/** A model the fake loader gave: `freed` lists its resources in the order their `dispose` event came. */
interface Fake { gltf: GLTF; freed: string[]; map: THREE.Texture; }
const built = new Map<string, Fake[]>();
net.make = (path) => {
  const freed: string[] = [];
  const watch = <T extends { addEventListener(type: 'dispose', listener: () => void): void }>(name: string, x: T): T => {
    x.addEventListener('dispose', () => freed.push(name));
    return x;
  };
  // One triangle, one unit tall: light, and enough for staticGeo, texturedParts and rig to measure.
  const geo = watch('geometry', new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  const map = watch('map', new THREE.Texture());
  const mat = watch('material', new THREE.MeshStandardMaterial({ map, normalMap: watch('normalMap', new THREE.Texture()) }));
  const scene = new THREE.Group().add(new THREE.Mesh(geo, mat));
  const fake: Fake = { gltf: { scene, scenes: [scene], animations: [] } as unknown as GLTF, freed, map };
  built.set(path, [...(built.get(path) ?? []), fake]);
  return fake.gltf;
};
const ALL = ['geometry', 'map', 'material', 'normalMap'];
/** What was freed of the n-th model the loader gave for `path`. */
const freed = (path: string, n = 0) => [...built.get(path)![n].freed].sort();
const asks = (path: string) => net.asked.filter((p) => p === path).length;
const tick = () => new Promise<void>((r) => { setTimeout(r, 0); });
/** Holds the model back until the returned function is called. */
function hold(path: string) {
  let open!: () => void;
  net.gate.set(path, new Promise<void>((r) => { open = r; }));
  return open;
}

describe('the scope of a model (TECH-09, TECH-15)', () => {
  it('frees a model of a released world: its geometry, its material and every texture', async () => {
    const g = await withScope('w1', () => gltf('t1/tree'));
    expect(g).toBe(built.get('t1/tree')![0].gltf);
    expect(freed('t1/tree')).toEqual([]);
    release('w1');
    await tick();
    expect(freed('t1/tree')).toEqual(ALL);
  });

  it('forgets a released model: asking again loads it again and gives a new one', async () => {
    const first = await withScope('w2', () => gltf('t2/tree'));
    expect(await withScope('w2', () => gltf('t2/tree'))).toBe(first);
    expect(asks('t2/tree')).toBe(1);
    release('w2');
    await tick();
    const second = await withScope('w2', () => gltf('t2/tree'));
    expect(asks('t2/tree')).toBe(2);
    expect(second).not.toBe(first);
    expect(freed('t2/tree', 0)).toEqual(ALL);
    expect(freed('t2/tree', 1)).toEqual([]);
  });

  it('keeps a model asked for outside any scope: no release frees it', async () => {
    const kept = await gltf('t3/common');
    await withScope('w3', () => gltf('t3/own'));
    release('w3'); release('t3/common'); release('shared');
    await tick();
    expect(freed('t3/common')).toEqual([]);
    expect(freed('t3/own')).toEqual(ALL);
    expect(await gltf('t3/common')).toBe(kept);
    expect(asks('t3/common')).toBe(1);
  });

  it('keeps a model asked for both by a world and by shared code, whichever came first', async () => {
    await withScope('w4', () => gltf('t4/world first'));
    await gltf('t4/world first');
    await gltf('t4/shared first');
    await withScope('w4', () => Promise.all([gltf('t4/shared first'), gltf('t4/own')]));
    release('w4');
    await tick();
    expect(freed('t4/world first')).toEqual([]);
    expect(freed('t4/shared first')).toEqual([]);
    expect(freed('t4/own')).toEqual(ALL);
  });

  it('keeps the heroine, her items and the cat though a world loads them', async () => {
    const paths = ['hero/base', 'hero/anims', 'items/wand', 'extra/cat', 'extra/cat2', 'extra/mushking', 'heroes/knight'];
    await withScope('w5', () => Promise.all(paths.map((p) => gltf(p))));
    release('w5');
    await tick();
    expect(paths.filter((p) => freed(p).length > 0)).toEqual(['extra/cat2', 'extra/mushking', 'heroes/knight']);
  });

  it('keeps what `shared` names: one model or a folder, loaded already or not yet', async () => {
    await withScope('w6', () => Promise.all([gltf('t6/loaded before'), gltf('t6dir/loaded before')]));
    shared('t6/loaded before', 't6/loaded after', 't6dir/');
    await withScope('w6', () => Promise.all([gltf('t6/loaded after'), gltf('t6dir/loaded after'), gltf('t6/loaded after too')]));
    release('w6');
    await tick();
    expect(freed('t6/loaded before')).toEqual([]);
    expect(freed('t6dir/loaded before')).toEqual([]);
    expect(freed('t6/loaded after')).toEqual([]);
    expect(freed('t6dir/loaded after')).toEqual([]);
    expect(freed('t6/loaded after too')).toEqual(ALL);
  });

  it('frees a model of two worlds only when both are released', async () => {
    const fox = await withScope('w7a', () => gltf('t7/fox'));
    expect(await withScope('w7b', () => gltf('t7/fox'))).toBe(fox);
    release('w7a');
    await tick();
    expect(freed('t7/fox')).toEqual([]);
    expect(await withScope('w7b', () => gltf('t7/fox'))).toBe(fox);
    expect(asks('t7/fox')).toBe(1);
    release('w7b');
    await tick();
    expect(freed('t7/fox')).toEqual(ALL);
  });

  it('gives each of two worlds loading at the same time exactly its own models', async () => {
    // Each load asks for a model, waits, and asks for another: with one "current scope" variable and no lock the
    // second model of the first world would be recorded in the second world.
    const order: string[] = [];
    const load = (w: string) => async () => {
      order.push(`${w} starts`);
      await gltf(`t8/${w} one`);
      await tick();
      await Promise.all([gltf(`t8/${w} two`), gltf('t8/both')]);
      order.push(`${w} ends`);
    };
    await Promise.all([withScope('w8a', load('w8a')), withScope('w8b', load('w8b'))]);
    expect(order).toEqual(['w8a starts', 'w8a ends', 'w8b starts', 'w8b ends']);
    release('w8a');
    await tick();
    expect(freed('t8/w8a one')).toEqual(ALL);
    expect(freed('t8/w8a two')).toEqual(ALL);
    expect(freed('t8/w8b one')).toEqual([]);
    expect(freed('t8/w8b two')).toEqual([]);
    expect(freed('t8/both')).toEqual([]);
    release('w8b');
    await tick();
    expect(freed('t8/w8b one')).toEqual(ALL);
    expect(freed('t8/w8b two')).toEqual(ALL);
    expect(freed('t8/both')).toEqual(ALL);
  });

  it('lets a world open its scope again while it is open, and makes another world wait for all of it', async () => {
    const order: string[] = [];
    const a = withScope('w9a', async () => {
      await withScope('w9a', () => gltf('t9/a inner'));
      order.push('inner done');
      await tick();
      await gltf('t9/a late');
      order.push('a done');
    });
    const b = withScope('w9b', async () => { order.push('b starts'); await gltf('t9/b'); });
    await Promise.all([a, b]);
    expect(order).toEqual(['inner done', 'a done', 'b starts']);
    release('w9a');
    await tick();
    expect(freed('t9/a inner')).toEqual(ALL);
    expect(freed('t9/a late')).toEqual(ALL);
    expect(freed('t9/b')).toEqual([]);
  });

  it('closes the scope when the load fails, and gives the result of the load when it does not', async () => {
    await expect(withScope('w10', async () => { await gltf('t10/own'); throw new Error('the world broke'); })).rejects.toThrow('the world broke');
    // Outside the scope again: this one is shared.
    await gltf('t10/after');
    release('w10');
    await tick();
    expect(freed('t10/own')).toEqual(ALL);
    expect(freed('t10/after')).toEqual([]);
    await expect(withScope('w10b', async () => 'loaded')).resolves.toBe('loaded');
  });

  it('frees a model released while it was still loading as soon as it arrives', async () => {
    const open = hold('t11/slow');
    const pending = withScope('w11', async () => { void gltf('t11/slow'); });
    await pending;
    release('w11');
    const again = withScope('w11', () => gltf('t11/slow'));
    open();
    await again; await tick();
    expect(asks('t11/slow')).toBe(2);
    expect(freed('t11/slow', 0)).toEqual(ALL);
    expect(freed('t11/slow', 1)).toEqual([]);
    expect(await again).toBe(built.get('t11/slow')![1].gltf);
  });

  it('keeps no record of a model that failed for good (TECH-08): the world that failed does not hold it', async () => {
    vi.useFakeTimers();
    try {
      net.blocked.add('t12/rock');
      const failed = withScope('w12a', () => gltf('t12/rock')).catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(2100);
      expect(await failed).toBeInstanceOf(Error);
      expect(asks('t12/rock')).toBe(1 + RETRIES);
    } finally { vi.useRealTimers(); }
    net.blocked.delete('t12/rock');
    await withScope('w12b', () => gltf('t12/rock'));
    expect(asks('t12/rock')).toBe(1 + RETRIES + 1);
    // Were 'w12a' still recorded as an owner, the model would outlive its only world.
    release('w12b');
    await tick();
    expect(freed('t12/rock')).toEqual(ALL);
  });

  it('keeps the record of a model asked for again when the load released before it fails (TECH-08)', async () => {
    vi.useFakeTimers();
    try {
      // The requests in order: the first load (fails), the second load (arrives), the three repeats of the first (fail).
      net.plan.set('t14/rock', ['fail', 'ok', 'fail', 'fail', 'fail']);
      let first!: Promise<unknown>;
      await withScope('w14a', async () => { first = gltf('t14/rock').catch((e: Error) => e); });
      release('w14a');
      const second = await withScope('w14b', () => gltf('t14/rock'));
      await vi.advanceTimersByTimeAsync(2100);
      expect(await first).toBeInstanceOf(Error);
      expect(asks('t14/rock')).toBe(1 + 1 + RETRIES);
      // The failure of the first load must not wipe the record of the second: its world still owns it.
      expect(await withScope('w14b', () => gltf('t14/rock'))).toBe(second);
      expect(asks('t14/rock')).toBe(1 + 1 + RETRIES);
      release('w14b');
      await vi.advanceTimersByTimeAsync(0);
      expect(freed('t14/rock')).toEqual(ALL);
    } finally { vi.useRealTimers(); }
  });

  it('records what staticGeo, texturedParts and rig load, and frees the sources only - not what they made', async () => {
    const made = await withScope('w13', () => Promise.all([staticGeo('t13/prop', 2), texturedParts('t13/plant', 2), rig('t13/animal', 2)]));
    const [geo, parts, animal] = made;
    const mesh = animal.model.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const derived: string[] = [];
    geo.addEventListener('dispose', () => derived.push('staticGeo geometry'));
    parts[0].geo.addEventListener('dispose', () => derived.push('part geometry'));
    mesh.material.addEventListener('dispose', () => derived.push('rig material'));
    // What the derived objects share with the source: the textures.
    expect(parts[0].map).toBe(built.get('t13/plant')![0].map);
    expect(mesh.material.map).toBe(built.get('t13/animal')![0].map);
    release('w13');
    await tick();
    expect(freed('t13/prop')).toEqual(ALL);
    expect(freed('t13/plant')).toEqual(ALL);
    expect(freed('t13/animal')).toEqual(ALL);
    expect(derived).toEqual([]);
  });
});

describe('the loading bar (TECH-15)', () => {
  /** Collects what the bar is told until `stop` is called. */
  function bar() {
    const seen: number[] = [];
    setProgressHandler((f) => seen.push(f));
    return seen;
  }

  it('moves by the share of the models that have arrived', async () => {
    resetProgress();
    const seen = bar();
    const one = hold('p1/one'), two = hold('p1/two');
    const both = Promise.all([gltf('p1/one'), gltf('p1/two'), gltf('p1/one')]);
    await tick();
    expect(seen).toEqual([]);
    one(); await tick();
    expect(seen).toEqual([0.5]);
    two(); await both;
    expect(seen).toEqual([0.5, 1]);
    // A model that is here already does not move the bar again.
    await gltf('p1/one');
    expect(seen).toEqual([0.5, 1]);
  });

  it('starts from zero after a reset: the next world does not count the models of the one before', async () => {
    resetProgress();
    await Promise.all([gltf('p2/old one'), gltf('p2/old two')]);
    resetProgress();
    const seen = bar();
    const one = hold('p2/new one'), two = hold('p2/new two');
    const both = Promise.all([gltf('p2/new one'), gltf('p2/new two')]);
    one(); await tick();
    expect(seen).toEqual([0.5]);
    two(); await both;
    expect(seen).toEqual([0.5, 1]);
  });

  it('is not moved by a model asked for before the reset, whether it arrives or fails', async () => {
    vi.useFakeTimers();
    try {
      resetProgress();
      const late = hold('p3/late');
      net.blocked.add('p3/broken');
      void gltf('p3/late');
      const broken = gltf('p3/broken').catch((e: Error) => e);
      resetProgress();
      const seen = bar();
      const one = hold('p3/one');
      const both = Promise.all([gltf('p3/one'), gltf('p3/two')]);
      await vi.advanceTimersByTimeAsync(2100);
      expect(await broken).toBeInstanceOf(Error);
      late(); await vi.advanceTimersByTimeAsync(0);
      // Only 'p3/two' of this round is here: the late model did not report, the broken one did not shrink the total.
      expect(seen).toEqual([0.5]);
      one(); await both;
      expect(seen).toEqual([0.5, 1]);
    } finally { vi.useRealTimers(); net.blocked.delete('p3/broken'); setProgressHandler(() => {}); }
  });

  it('leaves a model that failed in this round out of the total, as before', async () => {
    vi.useFakeTimers();
    try {
      resetProgress();
      const seen = bar();
      net.blocked.add('p4/broken');
      const open = hold('p4/good');
      const broken = gltf('p4/broken').catch((e: Error) => e);
      const good = gltf('p4/good');
      await vi.advanceTimersByTimeAsync(2100);
      expect(await broken).toBeInstanceOf(Error);
      open(); await good;
      expect(seen).toEqual([1]);
    } finally { vi.useRealTimers(); net.blocked.delete('p4/broken'); setProgressHandler(() => {}); }
  });
});
