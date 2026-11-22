import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Part } from '../core/assets';
import { forgetRanged, instanced, instancedParts, updateRanged } from '../core/instancing';
import { createWorldScope } from './scope';

// No WebGL here and none needed: `dispose()` of a geometry, a material, a texture or a render target only sends the
// event `dispose` (the renderer listens to it in the game). The tests count those events on real Three.js objects.
type Sends = { addEventListener(type: 'dispose', listener: () => void): void };
function counter() {
  const freed: string[] = [];
  const watch = <T extends Sends>(name: string, x: T): T => { x.addEventListener('dispose', () => freed.push(name)); return x; };
  /** A mesh whose geometry, material and picture are watched as `<name> geometry`, `<name> material`, `<name> map`. */
  const mesh = (name: string) => new THREE.Mesh(
    watch(`${name} geometry`, triangle()),
    watch(`${name} material`, new THREE.MeshStandardMaterial({ map: watch(`${name} map`, new THREE.Texture()) })),
  );
  return { freed, watch, mesh, sorted: () => [...freed].sort() };
}
/** One triangle: the tests must stay light (the heap of the test run is capped). */
const triangle = () => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));

/** A stand-in for the window or an element: it records the calls and can send an event to whoever still listens. */
function fakeTarget() {
  type Call = [type: string, fn: unknown, options: unknown];
  const added: Call[] = [], removed: Call[] = [];
  const on: Call[] = [];
  return {
    added, removed,
    addEventListener(type: string, fn: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      added.push([type, fn, options]); on.push([type, fn, options]);
    },
    removeEventListener(type: string, fn: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
      removed.push([type, fn, options]);
      const i = on.findIndex((c) => c[0] === type && c[1] === fn && c[2] === options);
      if (i >= 0) on.splice(i, 1);
    },
    listening: () => on.length,
    send(type: string) { for (const c of [...on]) if (c[0] === type) (c[1] as (e: Event) => void)({ type } as Event); },
  };
}

// The list of the cells with a drawing distance is one for the whole module (src/core/instancing.ts).
afterEach(() => forgetRanged(() => true));

describe('the scope of a world: what the world added to the scene leaves it and is freed (TECH-15)', () => {
  it('takes out everything that joined the scene after the scope was made - the sky and the sun too - and frees it', () => {
    const c = counter();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    scene.add(camera);
    const scope = createWorldScope(scene);

    // The world's sky: made first, before anything of the game.
    const sky = new THREE.Mesh(c.watch('sky geometry', triangle()), c.watch('sky material', new THREE.ShaderMaterial({
      uniforms: { uGlow: { value: 0 }, uNoise: { value: c.watch('sky noise', new THREE.Texture()) } },
    })));
    const sun = new THREE.DirectionalLight();
    sun.castShadow = true;
    sun.shadow.map = c.watch('shadow map', new THREE.WebGLRenderTarget(4, 4));
    scene.add(sky, new THREE.HemisphereLight(), sun, sun.target);
    // Its load.
    const terrain = c.mesh('terrain');
    scene.add(terrain);
    // The game's own objects join after the sky and the load.
    const hero = scope.shared(() => { const h = c.mesh('hero'); scene.add(h); return h; });
    // The built world: a character with a model inside, a mesh instanced over the ground.
    const npc = new THREE.Group().add(new THREE.Group().add(c.mesh('npc')));
    const grass = c.watch('grass instances', new THREE.InstancedMesh(c.watch('grass geometry', triangle()), c.watch('grass material', new THREE.MeshBasicMaterial()), 2));
    scene.add(npc, grass);
    const ring = c.mesh('ring');
    scope.shared(() => { scene.add(ring); });
    // And what the world adds while it is played.
    const star = c.mesh('star');
    scene.add(star);

    scope.dispose();

    expect(scene.children).toEqual([camera, hero, ring]);
    for (const o of [sky, sun, sun.target, terrain, npc, grass, star]) expect(o.parent, o.type).toBeNull();
    expect(c.sorted()).toEqual([
      'grass geometry', 'grass instances', 'grass material',
      'npc geometry', 'npc map', 'npc material',
      'shadow map',
      'sky geometry', 'sky material', 'sky noise',
      'star geometry', 'star map', 'star material',
      'terrain geometry', 'terrain map', 'terrain material',
    ]);
  });

  it('frees the materials of the shadow pass too, with their pictures', () => {
    const c = counter();
    const scene = new THREE.Scene();
    const scope = createWorldScope(scene);
    const leaf = c.watch('leaf', new THREE.Texture());
    const tree = new THREE.Mesh(c.watch('geometry', triangle()), c.watch('material', new THREE.MeshStandardMaterial({ map: leaf })));
    tree.customDepthMaterial = c.watch('depth', new THREE.MeshDepthMaterial({ map: leaf }));
    tree.customDistanceMaterial = c.watch('distance', new THREE.MeshDistanceMaterial({ alphaMap: c.watch('alpha', new THREE.Texture()) }));
    scene.add(new THREE.Group().add(tree));
    scope.dispose();
    expect(c.sorted()).toEqual(['alpha', 'depth', 'distance', 'geometry', 'leaf', 'material']);
  });

  it('leaves what was in the scene before it and what the game added in shared(), with nothing of theirs freed', () => {
    const c = counter();
    const scene = new THREE.Scene();
    const base = c.mesh('base');
    scene.add(base);
    const scope = createWorldScope(scene);
    scene.add(c.mesh('terrain'));
    const hero = c.mesh('hero'), cat = new THREE.Group().add(c.mesh('cat'));
    const depthMap = c.watch('hero depth map', new THREE.Texture());
    hero.customDepthMaterial = c.watch('hero depth', new THREE.MeshDepthMaterial({ map: depthMap }));
    const distanceMap = c.watch('cat distance map', new THREE.Texture());
    cat.children[0].customDistanceMaterial = c.watch('cat distance', new THREE.MeshDistanceMaterial({ map: distanceMap }));
    const glow = c.watch('glow', new THREE.Texture());
    const sparks =new THREE.Points(c.watch('sparks geometry', triangle()), c.watch('sparks material', new THREE.ShaderMaterial({ uniforms: { uMap: { value: glow } } })));
    expect(scope.shared(() => { scene.add(hero, cat, sparks); return 7; })).toBe(7);
    // The world hangs wings under the heroine: only the top level of the scene is the world's.
    const wing = c.mesh('wing');
    hero.add(wing);
    // And objects of the world draw with what the game's objects hold: a geometry, a material, a picture (as a
    // property and as a uniform), the pictures of the shadow materials.
    const heroMat = hero.material, catMesh = cat.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    scene.add(
      new THREE.Mesh(hero.geometry, heroMat),
      new THREE.Mesh(c.watch('world geometry', triangle()), [heroMat, c.watch('world material', new THREE.MeshStandardMaterial({ map: catMesh.material.map, emissiveMap: base.material.map, roughnessMap: distanceMap }))]),
      new THREE.Points(c.watch('trail geometry', triangle()), c.watch('trail material', new THREE.PointsMaterial({ map: glow, alphaMap: depthMap }))),
    );

    scope.dispose();

    expect(scene.children).toEqual([base, hero, cat, sparks]);
    expect(wing.parent).toBe(hero);
    expect(c.sorted()).toEqual(['terrain geometry', 'terrain map', 'terrain material', 'trail geometry', 'trail material', 'world geometry', 'world material']);
  });

  it('shared() records what joined the scene even when the call throws', () => {
    const scene = new THREE.Scene();
    const scope = createWorldScope(scene);
    const early = new THREE.Group();
    expect(() => scope.shared(() => { scene.add(early); throw new Error('half-made'); })).toThrow('half-made');
    scope.dispose();
    expect(scene.children).toEqual([early]);
  });

  it('shared() refuses a call that returns a promise: what joins the scene after an await is not known to be the game\'s', () => {
    const scene = new THREE.Scene();
    const scope = createWorldScope(scene);
    expect(() => scope.shared(async () => {})).toThrow(/synchronous/);
    expect(() => scope.shared(() => ({ then: () => {} }))).toThrow(/synchronous/);
    // What is not a promise passes as it is.
    for (const v of [undefined, null, 0, '', { then: 1 }]) expect(scope.shared(() => v)).toBe(v);
  });

  it('gives the scene back the background, the fog and the environment it had, and frees the world\'s own', () => {
    const c = counter();
    const scene = new THREE.Scene();
    const fog = new THREE.Fog('#ffffff', 1, 2), backdrop = c.watch('first backdrop', new THREE.Texture());
    scene.fog = fog; scene.background = backdrop;
    const scope = createWorldScope(scene);
    scene.fog = new THREE.Fog('#d9ecf7', 70, 300);
    scene.background = c.watch('world backdrop', new THREE.Texture());
    scene.environment = c.watch('world environment', new THREE.Texture());
    scope.dispose();
    expect(scene.fog).toBe(fog);
    expect(scene.background).toBe(backdrop);
    expect(scene.environment).toBeNull();
    expect(c.sorted()).toEqual(['world backdrop', 'world environment']);
  });

  it('a plain colour for a background, and one picture for both the background and the environment', () => {
    const c = counter();
    const scene = new THREE.Scene();
    const first = createWorldScope(scene);
    scene.background = new THREE.Color('#ffd9b8');
    scene.fog = new THREE.Fog('#ffe2c6', 40, 160);
    first.dispose();
    expect(scene.background).toBeNull();
    expect(scene.fog).toBeNull();

    // One picture met twice is freed once...
    const second = createWorldScope(scene);
    const dome = c.watch('dome', new THREE.Texture());
    scene.background = dome; scene.environment = dome;
    second.dispose();
    expect(c.sorted()).toEqual(['dome']);

    // ... and so is one that a mesh of the world shows as well.
    const third = createWorldScope(scene);
    const panorama = c.watch('panorama', new THREE.Texture());
    scene.background = panorama;
    scene.add(new THREE.Mesh(c.watch('geometry', triangle()), c.watch('material', new THREE.MeshBasicMaterial({ map: panorama }))));
    third.dispose();
    expect(c.sorted()).toEqual(['dome', 'geometry', 'material', 'panorama']);
  });

  it('a background the world did not change is not freed', () => {
    const c = counter();
    const scene = new THREE.Scene();
    scene.background = c.watch('backdrop', new THREE.Texture());
    scene.environment = c.watch('environment', new THREE.Texture());
    createWorldScope(scene).dispose();
    expect(c.freed).toEqual([]);
  });

  it('a second dispose() does nothing: what joined the scene since stays, nothing is freed or undone twice', () => {
    const c = counter();
    const scene = new THREE.Scene();
    const scope = createWorldScope(scene);
    scene.add(c.mesh('world'));
    const undo = vi.fn();
    scope.own(undo);
    expect(scope.disposed).toBe(false);
    scope.dispose();
    expect(scope.disposed).toBe(true);
    expect(c.sorted()).toEqual(['world geometry', 'world map', 'world material']);

    // The next world is in the scene already, with its own fog.
    const next = c.mesh('next'), fog = new THREE.Fog('#000000', 1, 2);
    scene.add(next); scene.fog = fog;
    scope.dispose();
    expect(scene.children).toEqual([next]);
    expect(scene.fog).toBe(fog);
    expect(c.freed).toHaveLength(3);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(scope.disposed).toBe(true);
  });
});

describe('the scope of a world: handlers and timers (TECH-15)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('on() listens with the type, the function and the options given, and dispose() removes exactly that', () => {
    const scope = createWorldScope(new THREE.Scene());
    const win = fakeTarget(), button = fakeTarget();
    const down = vi.fn(), click = vi.fn(), options = { capture: true };
    scope.on(win, 'pointerdown', down, options);
    scope.on(button, 'click', click);
    expect(win.added).toEqual([['pointerdown', expect.any(Function), options]]);
    expect(win.added[0][2]).toBe(options);
    win.send('pointerdown'); button.send('click'); button.send('click');
    expect(down).toHaveBeenCalledTimes(1);
    expect(down).toHaveBeenCalledWith({ type: 'pointerdown' });
    expect(click).toHaveBeenCalledTimes(2);

    scope.dispose();

    expect(win.removed).toEqual(win.added);
    expect(win.removed[0][2]).toBe(options);
    expect(button.removed).toEqual(button.added);
    expect(win.listening() + button.listening()).toBe(0);
    win.send('pointerdown'); button.send('click');
    expect(down).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('the function on() returns removes that one handler, once', () => {
    const scope = createWorldScope(new THREE.Scene());
    const win = fakeTarget();
    const first = vi.fn(), second = vi.fn();
    const off = scope.on(win, 'keydown', first);
    scope.on(win, 'keydown', second);
    off();
    expect(win.removed).toHaveLength(1);
    win.send('keydown');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    off();
    scope.dispose();
    // The handler taken off by hand is not taken off again; the other one is.
    expect(win.removed).toHaveLength(2);
    expect(win.listening()).toBe(0);
  });

  it('timeout() runs the function once, after its time', () => {
    const scope = createWorldScope(new THREE.Scene());
    const fn = vi.fn();
    scope.timeout(fn, 700);
    vi.advanceTimersByTime(699);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    scope.dispose();
  });

  it('a timer that fired is forgotten: dispose() has nothing of it to cancel', async () => {
    const scope = createWorldScope(new THREE.Scene());
    const fn = vi.fn();
    for (let i = 0; i < 3; i++) scope.timeout(fn, 100);
    let waited = false;
    void scope.wait(100).then(() => { waited = true; });
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(waited).toBe(true);
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    try {
      scope.timeout(fn, 100);
      scope.dispose();
      expect(clear, 'only the timer that is still on is cancelled').toHaveBeenCalledTimes(1);
    } finally { clear.mockRestore(); }
  });

  it('dispose() cancels the timeouts and the intervals that are still on', () => {
    const scope = createWorldScope(new THREE.Scene());
    const once = vi.fn(), tick = vi.fn();
    scope.timeout(once, 700);
    scope.interval(tick, 100);
    vi.advanceTimersByTime(350);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(2);

    scope.dispose();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(once).not.toHaveBeenCalled();
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('the functions timeout() and interval() return stop that one timer', () => {
    const scope = createWorldScope(new THREE.Scene());
    const once = vi.fn(), other = vi.fn(), tick = vi.fn(), beat = vi.fn();
    const cancel = scope.timeout(once, 700);
    scope.timeout(other, 700);
    const stop = scope.interval(tick, 100);
    scope.interval(beat, 100);
    vi.advanceTimersByTime(250);
    cancel(); stop();
    expect(vi.getTimerCount()).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(once).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(beat).toHaveBeenCalledTimes(12);
    scope.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('wait() lets the code after it run once its time has passed', async () => {
    const scope = createWorldScope(new THREE.Scene());
    const steps: string[] = [];
    void (async () => { steps.push('before'); await scope.wait(850); steps.push('after'); })();
    await vi.advanceTimersByTimeAsync(849);
    expect(steps).toEqual(['before']);
    await vi.advanceTimersByTimeAsync(1);
    expect(steps).toEqual(['before', 'after']);
    scope.dispose();
  });

  it('a wait() still pending when the scope is disposed never settles: the code of the world after it does not run', async () => {
    const scope = createWorldScope(new THREE.Scene());
    const steps: string[] = [];
    void (async () => {
      try { steps.push('before'); await scope.wait(3600); steps.push('after'); } catch { steps.push('threw'); } finally { steps.push('finally'); }
    })();
    await vi.advanceTimersByTimeAsync(1000);
    scope.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(steps).toEqual(['before']);
  });

  it('after dispose() nothing is started: no handler, no timer, and a wait() never settles', async () => {
    const scope = createWorldScope(new THREE.Scene());
    scope.dispose();
    const win = fakeTarget();
    const fn = vi.fn();
    const stops = [scope.on(win, 'pointerdown', fn), scope.timeout(fn, 10), scope.interval(fn, 10)];
    let settled = false;
    void scope.wait(10).then(() => { settled = true; }, () => { settled = true; });
    expect(win.added).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    // What they returned is still safe to call.
    for (const stop of stops) stop();
    expect(win.removed).toEqual([]);
  });
});

describe('the scope of a world: what else the world must undo (own)', () => {
  it('takes a function or an object with dispose(), returns it, and calls each once - the last one first', () => {
    const scope = createWorldScope(new THREE.Scene());
    const order: string[] = [];
    const undo = () => { order.push('function'); };
    const thing = { dispose() { order.push('object'); } };
    // A function that carries a dispose() of its own is still called as a function.
    const both = Object.assign(() => { order.push('called'); }, { dispose() { order.push('wrong'); } });
    expect(scope.own(undo)).toBe(undo);
    expect(scope.own(thing)).toBe(thing);
    expect(scope.own(both)).toBe(both);
    expect(order).toEqual([]);
    scope.dispose();
    expect(order).toEqual(['called', 'object', 'function']);
    scope.dispose();
    expect(order).toHaveLength(3);
  });

  it('dispose() of an owned object is called on the object', () => {
    const scope = createWorldScope(new THREE.Scene());
    const material = new THREE.MeshBasicMaterial();
    let freed = 0;
    material.addEventListener('dispose', () => { freed++; });
    scope.own(material);
    scope.dispose();
    expect(freed).toBe(1);
  });

  it('what is handed over after dispose() is undone right away', () => {
    const scope = createWorldScope(new THREE.Scene());
    scope.dispose();
    const undo = vi.fn(), thing = { dispose: vi.fn() };
    expect(scope.own(undo)).toBe(undo);
    scope.own(thing);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(thing.dispose).toHaveBeenCalledTimes(1);
    scope.dispose();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('one that throws keeps neither the others nor the scene from being cleared; its error is thrown on', () => {
    vi.useFakeTimers();
    try {
      const c = counter();
      const scene = new THREE.Scene();
      const scope = createWorldScope(scene);
      scene.add(c.mesh('world'));
      scene.fog = new THREE.Fog('#ffffff', 1, 2);
      const win = fakeTarget();
      scope.on(win, 'pointerdown', () => {});
      scope.timeout(() => {}, 100);
      const first = vi.fn(), last = vi.fn();
      scope.own(first);
      scope.own(() => { throw new Error('first failure'); });
      scope.own({ dispose() { throw new Error('second failure'); } });
      scope.own(last);
      expect(() => scope.dispose()).toThrow('second failure');   // the last one handed over runs first
      expect(first).toHaveBeenCalledTimes(1);
      expect(last).toHaveBeenCalledTimes(1);
      expect(scene.children).toEqual([]);
      expect(scene.fog).toBeNull();
      expect(c.sorted()).toEqual(['world geometry', 'world map', 'world material']);
      expect(win.listening()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(scope.disposed).toBe(true);
      expect(() => scope.dispose()).not.toThrow();
    } finally { vi.useRealTimers(); }
  });
});

describe('the scope of a world: the drawing distance (src/core/instancing.ts)', () => {
  const far = 1e6;
  const items = [{ x: 1, z: 1, s: 1, rot: 0 }];
  const cells = (scene: THREE.Scene) => scene.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh);

  it('after dispose() the list holds no cell of the world: updateRanged() switches only what is still in the scene', () => {
    const scene = new THREE.Scene();
    const scope = createWorldScope(scene);
    instanced(scene, () => 0, triangle(), new THREE.MeshBasicMaterial(), items, false, undefined, undefined, 10);
    const [mine] = scope.shared(() => {
      instanced(scene, () => 0, triangle(), new THREE.MeshBasicMaterial(), items, false, undefined, undefined, 10);
      return cells(scene).slice(-1);
    });
    const [theirs] = cells(scene);
    expect(theirs).not.toBe(mine);
    // Both are in the list: far away neither is drawn.
    updateRanged(far, far);
    expect([theirs.visible, mine.visible]).toEqual([false, false]);
    updateRanged(1, 1);
    expect([theirs.visible, mine.visible]).toEqual([true, true]);

    scope.dispose();

    expect(cells(scene)).toEqual([mine]);
    updateRanged(far, far);
    expect(theirs.visible, 'a cell of the world left is still switched').toBe(true);
    expect(mine.visible, 'a cell still in the scene left the list').toBe(false);
  });

  it('a cell deep inside an object that stays in the scene stays in the list', () => {
    const scene = new THREE.Scene();
    const scope = createWorldScope(scene);
    const holder = scope.shared(() => { const g = new THREE.Group().add(new THREE.Group()); scene.add(g); return g; });
    instanced(scene, () => 0, triangle(), new THREE.MeshBasicMaterial(), items, false, undefined, undefined, 10);
    const [cell] = cells(scene);
    holder.children[0].add(cell);
    scope.dispose();
    expect(cell.parent).toBe(holder.children[0]);
    updateRanged(1, 1);
    updateRanged(far, far);
    expect(cell.visible).toBe(false);
  });

  it('after dispose() the cache of part materials holds none that was freed, and still holds the ones kept', () => {
    const scene = new THREE.Scene();
    const scope = createWorldScope(scene);
    const part = (name: string): Part => ({ geo: triangle(), name, map: new THREE.Texture(), cutout: false });
    const tree = part('tree'), rock = part('rock');
    const material = () => cells(scene).slice(-1)[0].material as THREE.Material;
    instancedParts(scene, () => 0, [tree], items, 0, false);
    const treeMat = material();
    instancedParts(scene, () => 0, [tree], items, 0, false);
    expect(material(), 'one material per part while the world is in the scene').toBe(treeMat);
    const rockMat = scope.shared(() => { instancedParts(scene, () => 0, [rock], items, 0, false); return material(); });
    // The world draws with the kept material too: it is neither freed nor forgotten.
    instancedParts(scene, () => 0, [rock], items, 0, false);
    expect(material()).toBe(rockMat);
    let freed = 0;
    treeMat.addEventListener('dispose', () => { freed++; });
    rockMat.addEventListener('dispose', () => { freed += 10; });

    scope.dispose();

    expect(freed).toBe(1);
    instancedParts(scene, () => 0, [tree], items, 0, false);
    expect(material(), 'a freed material was handed out again').not.toBe(treeMat);
    instancedParts(scene, () => 0, [rock], items, 0, false);
    expect(material(), 'a material still in the scene left the cache').toBe(rockMat);
  });
});

// ---------- the sources: a world starts no handler and no timer past its scope ----------
const WORLD_RAW = import.meta.glob('../worlds/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const WORLD_SOURCES = Object.entries(WORLD_RAW)
  .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('.d.ts'))
  .map(([path, text]) => ({ path: path.replace(/^\.\.\//, 'src/'), text }));
/**
 * A bare call that outlives the world: comments count too (a line that names one of these says how not to do it).
 * `removeEventListener`, `clearTimeout` and the methods of the scope (`on`, `timeout`, `interval`, `wait`) pass.
 */
const BARE = /\b(?:addEventListener|setTimeout|setInterval|requestAnimationFrame)\b/g;
function bare(sources: readonly { path: string; text: string }[]): string[] {
  const out: string[] = [];
  for (const { path, text } of sources) {
    text.split('\n').forEach((line, i) => { for (const m of line.matchAll(BARE)) out.push(`${path}:${i + 1} ${m[0]}`); });
  }
  return out;
}

describe('a world starts its handlers and timers through its scope (TECH-15)', () => {
  it('the sources of the worlds were found', () => {
    const names = WORLD_SOURCES.map((s) => s.path);
    for (const f of ['fairy/index.ts', 'fairy/shrine.ts', 'fairy/butterflies-task.ts', 'fairy/sky.ts', 'probe/index.ts', 'index.ts']) {
      expect(names, `the glob did not reach src/worlds/${f}`).toContain(`src/worlds/${f}`);
    }
    expect(names.some((n) => n.endsWith('.test.ts')), 'tests were read as sources').toBe(false);
  });

  it('the pattern sees every bare call and names the file and the line', () => {
    const text = [
      'const a = 1;',
      'addEventListener("resize", f);',
      '  window.setTimeout(f, 10); el.addEventListener("click", f);',
      'await new Promise((r) => setTimeout(r, 850));',
      'const id = globalThis.setInterval(f, 1000);',
      'requestAnimationFrame(frame);',
      'scope.on(window, "resize", f); scope.timeout(f, 10); scope.interval(f, 10); await scope.wait(850);',
      'removeEventListener("resize", f); clearTimeout(id); clearInterval(id); const timeout = 3;',
    ].join('\n');
    expect(bare([{ path: 'src/worlds/x/index.ts', text }])).toEqual([
      'src/worlds/x/index.ts:2 addEventListener',
      'src/worlds/x/index.ts:3 setTimeout', 'src/worlds/x/index.ts:3 addEventListener',
      'src/worlds/x/index.ts:4 setTimeout',
      'src/worlds/x/index.ts:5 setInterval',
      'src/worlds/x/index.ts:6 requestAnimationFrame',
    ]);
  });

  it('no file of a world calls addEventListener, setTimeout, setInterval or requestAnimationFrame', () => {
    const hits = bare(WORLD_SOURCES);
    expect(hits, `a handler or a timer past the scope (use scope.on / timeout / interval / wait, src/game/scope.ts): ${hits.join('; ')}`).toEqual([]);
  });
});

describe('a world undoes what it keeps outside its scene (TECH-15): a second entry must not find it there', () => {
  /** The folder of a world source: src/worlds/<id>/…; '' for the registry. */
  const worldOf = (path: string) => /^src\/worlds\/([^/]+)\//.exec(path)?.[1] ?? '';
  const index = (world: string) => WORLD_SOURCES.find((s) => s.path === `src/worlds/${world}/index.ts`)?.text ?? '';

  it('a list of the module (the colliders) is emptied through the scope', () => {
    // The scope clears the scene, not an array a module holds: left alone, every entry would add each prop again.
    const worlds = [...new Set(WORLD_SOURCES.filter((s) => /\bcolliders\.push\(/.test(s.text)).map((s) => worldOf(s.path)))].sort();
    expect(worlds).toEqual(['fairy', 'forest', 'hub', 'probe', 'sea', 'sweet']);
    for (const w of worlds) expect(index(w), `src/worlds/${w}/index.ts`).toMatch(/scope\.own\(\(\) => \{ colliders\.length = 0; \}\)/);
  });

  it('the voices a world gives its characters are taken back through the scope', () => {
    // The next world may set none (the probe world): a character of it must not speak with a voice of the world before.
    const casting = WORLD_SOURCES.filter((s) => /\bsetCast\(/.test(s.text));
    expect(casting.map((s) => s.path)).toContain('src/worlds/fairy/index.ts');
    for (const s of casting) expect(s.text, s.path).toMatch(/scope\.own\(\(\) => setCast\(\{ narrator: '', cast: \{\} \}\)\)/);
  });
});

// ---------- the wiring: a world gets its scope in one place (src/game/travel.ts `openWorld`), the first world and every next one ----------
const RAW = import.meta.glob(['../main.ts', './travel.ts', './loop.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MAIN = RAW['../main.ts'], TRAVEL = RAW['./travel.ts'], LOOP = RAW['./loop.ts'];
/** The names of the calls made right inside `scope.shared(() => …)`, in the order of the source. */
const sharedCalls = (src: string) => [...src.matchAll(/\bscope\.shared\(\(\) => (\w+(?:\.\w+)*)\(/g)].map((m) => m[1]);

describe('a world is opened with a scope of its own (TECH-15)', () => {
  it('the scope is made before the world\'s sky', () => {
    const made = TRAVEL.indexOf('createWorldScope(scene)'), sky = TRAVEL.indexOf('world.sky(');
    expect(made).toBeGreaterThan(-1);
    expect(sky).toBeGreaterThan(made);
  });

  it('the sky, the load and the build of the world get the scope as their last argument', () => {
    expect(TRAVEL).toMatch(/world\.sky\(scene, scope\)/);
    expect(TRAVEL).toMatch(/world\.load\(scene, save, touch, scope\)/);
    expect(TRAVEL).toMatch(/world\.build\(g, L, sky, scope\)/);
  });

  it('every world goes that one way: the calls of a world are made once, in openWorld, and src/main.ts opens its world with it', () => {
    for (const call of ['createWorldScope(', 'world.sky(', 'world.load(', 'world.build(']) {
      expect(TRAVEL.split(call), `${call} in src/game/travel.ts`).toHaveLength(2);
      expect(MAIN.split(call), `${call} in src/main.ts`).toHaveLength(1);
    }
    expect(MAIN.match(/\bopenWorld\(world, scene\)/g)).toHaveLength(1);
    // Before the quality tier is made: it needs the sun of the sky.
    expect(MAIN.indexOf('openWorld(world, scene)')).toBeLessThan(MAIN.indexOf('createQuality('));
    // The load of a world is recorded as the world's (src/core/assets.ts), or `release` would free nothing of it.
    expect(TRAVEL).toMatch(/withScope\(world\.id, \(\) => world\.load\(/);
  });

  it('what the game adds to the scene itself is made inside shared(): the game\'s objects and the parts of the loop', () => {
    expect(MAIN).toMatch(/scope\.shared\(\(\) => createGame\(/);
    expect(MAIN).toMatch(/scope\.shared\(\(\) => startLoop\(/);
    // Nowhere else: a second, bare call would add objects the scope takes for the world's.
    expect(MAIN.match(/\bcreateGame\(/g)).toHaveLength(1);
    expect(MAIN.match(/\bstartLoop\(/g)).toHaveLength(1);
  });

  it('nothing of the world is made inside shared(): its sky, its load and its build would stay in the scene for good', () => {
    // Exactly the calls above in src/main.ts (and the potions' halo and arrow, src/game/supplyfx.ts), and one in the
    // change of world: the game's part of the new world (`g.enter`). Another one, around a call of the world, would
    // mark the world's objects as the game's.
    expect(MAIN.match(/\bscope\.shared\(/g)).toHaveLength(3);
    expect(sharedCalls(MAIN)).toEqual(['createGame', 'installSupplies', 'startLoop']);
    expect(TRAVEL.match(/\bscope\.shared\(/g)).toHaveLength(1);
    expect(sharedCalls(TRAVEL)).toEqual(['g.enter']);
  });

  it('no frame is played inside shared(): startLoop only makes the parts of the loop, the first frame is played by run()', () => {
    // A world may add to the scene in any frame (a star it drops, a number over a butterfly): that is the world's.
    expect(LOOP.match(/\bframe\(\);/g), 'the frame is started in one place of src/game/loop.ts').toHaveLength(1);
    expect(LOOP).toMatch(/run: \(\) => \{ g\.refreshHud\(\); frame\(\); \}/);
    const made = MAIN.indexOf('scope.shared(() => startLoop('), run = MAIN.indexOf('loop.run()');
    expect(made).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(made);
    expect(MAIN.match(/\bloop\.run\(\)/g)).toHaveLength(1);
    expect(MAIN).not.toMatch(/shared\(\(\) => \{?[^)]*loop\.run\(/);
  });

  it('what the game is told of a world is made in one place, for the first world and for every world travelled to, with every field of its description', () => {
    // entryOf(world) is that place (src/game/travel.ts hands it to g.enter): a field left out there stays the first world's - or nobody's
    const entry = /const entryOf = \(world: WorldDef\): WorldEntry => \(\{([^}]*)\}\);/.exec(MAIN)?.[1] ?? '';
    for (const field of ['id', 'ground', 'spawn', 'pet', 'characters', 'secrets', 'chest', 'groundStars', 'worldTasks']) expect(entry, field).toContain(`${field}: world.${field}`);
    expect(entry).toContain('crystals: ');
    expect(MAIN).toMatch(/createGame\(\{[^}]*\bworld: entryOf\(world\),/);
    expect(MAIN).toMatch(/createTravel\(\{[^}]*\bentryOf\b/);
    expect(MAIN.match(/\bspawn: world\.spawn\b/g)).toHaveLength(1);
  });
});
