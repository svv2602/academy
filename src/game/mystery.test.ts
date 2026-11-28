// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, worldState, type Save } from '../core/save';
import { MYSTERY_COLOR, MYSTERY_COUNT, MYSTERY_MIN_SPOTS, MYSTERY_REWARD, MYSTERY_STEPS, dailyStars, mysteryOf, mysteryProblems } from './mystery';
import { createMystery, mysteryHold, type MysteryHost } from './mystery-stars';
import type { Stage } from './stage';
import type { TaskResult } from './taskviews/panel';
import { loadWorlds } from '../worlds';

/** Every world of the registry with its code (a next world's is loaded on demand, src/worlds/index.ts). */
const WORLDS = await loadWorlds();

vi.mock('../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: vi.fn() }));
vi.mock('./fx', () => ({ glowTex: null, Sparks: class {} }));

const SPOTS = Array.from({ length: 24 }, (_, i) => ({ x: (i % 6) * 10, z: Math.floor(i / 6) * 10 }));
const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);

describe('the stars of a day (src/game/mystery.ts)', () => {
  it('ten different places of the world, the same all day; ids 0..9', () => {
    const a = dailyStars('fairy', '2026-11-20', 24), b = dailyStars('fairy', '2026-11-20', 24);
    expect(a).toEqual(b);
    expect(a).toHaveLength(MYSTERY_COUNT);
    expect(new Set(a.map((s) => s.spot)).size).toBe(MYSTERY_COUNT);
    expect(a.map((s) => s.id)).toEqual([...Array(MYSTERY_COUNT).keys()]);
    for (const s of a) expect(s.spot).toBeLessThan(24);
  });

  it('another day, other places: never all ten the same, on average not even half', () => {
    const ds = days(30);
    const shared = ds.slice(1).map((d, i) => {
      const before = new Set(dailyStars('fairy', ds[i], 24).map((s) => s.spot));
      return dailyStars('fairy', d, 24).filter((s) => before.has(s.spot)).length;
    });
    expect(Math.max(...shared)).toBeLessThan(MYSTERY_COUNT);
    expect(shared.reduce((x, y) => x + y, 0) / shared.length).toBeLessThan(MYSTERY_COUNT / 2);
    // and another world on the same day stands its stars otherwise
    expect(dailyStars('forest', '2026-11-20', 24)).not.toEqual(dailyStars('fairy', '2026-11-20', 24));
  });

  it('the kinds as even as can be (4 + 3 + 3); each star plays a step of its kind, green both of its steps over the days', () => {
    const greens = new Set<string>();
    for (const d of days(20)) {
      const stars = dailyStars('fairy', d, 24);
      const count = (k: string) => stars.filter((s) => s.kind === k).length;
      expect([count('blue'), count('red'), count('green')].sort()).toEqual([3, 3, 4]);
      for (const s of stars) expect(MYSTERY_STEPS[s.kind]).toContain(s.step);
      for (const s of stars.filter((x) => x.kind === 'green')) greens.add(s.step);
    }
    expect([...greens].sort()).toEqual(['compare', 'pattern']);
  });

  it('the save: the state of the day kept while it lasts, a new day starts it anew; a damaged state too', () => {
    const ws = worldState(defaultSave(), 'fairy');
    const m = mysteryOf(ws, '2026-11-20');
    m.solved.push(3); m.told = true;
    expect(mysteryOf(ws, '2026-11-20')).toBe(m);
    expect(mysteryOf(ws, '2026-11-21')).toEqual({ day: '2026-11-21', solved: [] });
    (ws as unknown as { mystery: unknown }).mystery = { day: '2026-11-21', solved: 'x' };
    expect(mysteryOf(ws, '2026-11-21')).toEqual({ day: '2026-11-21', solved: [] });
  });

  it('a world names at least MYSTERY_MIN_SPOTS places, none closer than 6 m to another; every world that names them does', () => {
    expect(mysteryProblems({ spots: SPOTS })).toEqual([]);
    expect(mysteryProblems({ spots: SPOTS.slice(0, MYSTERY_MIN_SPOTS - 1) })).toHaveLength(1);
    expect(mysteryProblems({ spots: [...SPOTS, { x: 1, z: 1 }] })).toEqual(['places 0 and 24 of the mysterious stars stand closer than 6 m']);
    expect(WORLDS.filter((w) => w.mystery).flatMap((w) => mysteryProblems(w.mystery!))).toEqual([]);
    expect(WORLDS.find((w) => w.id === 'fairy')?.mystery).toBeDefined();
  });
});

/** A game of the tests: `answer` is what the next task ends with. */
function host(save: Save = defaultSave()) {
  const ws = worldState(save, 'fairy');
  const lines: string[] = [];
  let answer: TaskResult = { solved: true, wrong: 1 };
  const asked: string[] = [];
  const g = {
    scene: new THREE.Scene(), save, ws, world: { id: 'fairy', mystery: { spots: SPOTS } },
    ground: { resolve: () => {} }, groundY: () => 0,
    hero: { root: new THREE.Object3D() }, cam: { focus: null }, sparks: { burst: vi.fn() },
    speech: { line: async (k: string) => { lines.push(k); } },
    task: (open: () => Promise<TaskResult>) => open(), hooksFor: () => ({}),
    plan: { runTask: async (type: string) => { asked.push(type); return answer; } }, rng: Math.random,
    addStars: vi.fn(), above: (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy), praise: async () => {}, persist: vi.fn(),
  };
  let busy = false;
  const stage = (): Stage => ({ busy: () => busy, take: () => { busy = true; }, release: () => { busy = false; } });
  return { g: g as unknown as MysteryHost & typeof g, stage, lines, asked, setAnswer: (r: TaskResult) => { answer = r; } };
}

describe('the stars in the world (src/game/mystery-stars.ts)', () => {
  afterEach(() => { mysteryHold.held = false; mysteryHold.day = null; mysteryHold.all = false; });
  const geo = new THREE.BoxGeometry();

  it('ten stars of the day at their places, one draw call, each with its spot; the world without places has none', () => {
    mysteryHold.day = '2026-11-20';
    const h = host(), m = createMystery(h.g, geo, h.stage);
    expect(m.today).toHaveLength(MYSTERY_COUNT);
    expect(m.spots).toHaveLength(MYSTERY_COUNT);
    expect(m.unsolved()).toHaveLength(MYSTERY_COUNT);
    expect(h.g.scene.children.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh)).toHaveLength(1);
    const today = dailyStars('fairy', '2026-11-20', SPOTS.length);
    m.today.forEach((s, i) => { expect(s.pos.x).toBe(SPOTS[today[i].spot].x); expect(s.pos.z).toBe(SPOTS[today[i].spot].z); });
    m.dispose();
    expect(h.g.scene.children).toHaveLength(0);
    const none = host(); (none.g.world as { mystery?: unknown }).mystery = undefined;
    expect(createMystery(none.g, geo, none.stage).today).toHaveLength(0);
  });

  it('closed: the star stays, nothing given; solved: three stars, kept in the save, off the compass', async () => {
    mysteryHold.day = '2026-11-20';
    const h = host(), m = createMystery(h.g, geo, h.stage);
    const s = m.today[0], spot = m.spots[0], held = m.unsolved();
    h.setAnswer({ solved: false, wrong: 2 });
    spot.run(); await vi.waitFor(() => expect(h.lines).toContain('mystery_wait'));
    expect(h.g.addStars).not.toHaveBeenCalled();
    expect(spot.on()).toBe(true);
    h.setAnswer({ solved: true, wrong: 1 });
    spot.run(); await vi.waitFor(() => expect(h.lines).toContain('mystery_won'));
    expect(h.g.addStars).toHaveBeenCalledWith(MYSTERY_REWARD, expect.any(THREE.Vector3));
    expect(h.g.ws.mystery).toMatchObject({ day: '2026-11-20', solved: [s.id] });
    expect(spot.on()).toBe(false);
    expect(m.unsolved()).toBe(held);                       // the same array, one star fewer
    expect(m.unsolved()).toHaveLength(MYSTERY_COUNT - 1);
    expect(h.lines.filter((k) => k === 'mystery_found')).toHaveLength(2);
  });

  it('the task is of the star\'s kind, on the level of its skill', async () => {
    mysteryHold.day = '2026-11-20';
    const h = host(), m = createMystery(h.g, geo, h.stage);
    for (const [i, s] of m.today.entries()) { m.spots[i].run(); await vi.waitFor(() => expect(h.asked).toHaveLength(i + 1)); expect(h.asked[i]).toBe(s.step); }
  });

  it('a new day: other places, nothing solved; the line of the day once a day, when she is free to move', async () => {
    mysteryHold.day = '2026-11-20';
    const h = host(), m = createMystery(h.g, geo, h.stage);
    m.update(0, false);
    expect(h.lines).not.toContain('mystery_day');
    m.update(0, true); m.update(1, true);
    expect(h.lines.filter((k) => k === 'mystery_day')).toHaveLength(1);
    m.spots[0].run(); await vi.waitFor(() => expect(h.lines).toContain('mystery_won'));
    const before = m.today.map((s) => s.spot);
    // the next entry into the world on the same day: the solved one stays solved, no line again
    const again = createMystery(h.g, geo, h.stage);
    again.update(2, true);
    expect(again.today[0].solved).toBe(true);
    expect(h.lines.filter((k) => k === 'mystery_day')).toHaveLength(1);
    mysteryHold.day = '2026-11-21';
    m.update(3, true);
    expect(m.today.map((s) => s.spot)).not.toEqual(before);
    expect(m.today.every((s) => !s.solved)).toBe(true);
    expect(h.lines.filter((k) => k === 'mystery_day')).toHaveLength(2);
  });

  it('each star glows its own colour: the instance colour multiplies the glow, under the define three.js gives the fragment', () => {
    mysteryHold.day = '2026-11-20';
    const h = host(), m = createMystery(h.g, geo, h.stage);
    const mesh = h.g.scene.children[0] as THREE.InstancedMesh, mat = mesh.material as THREE.MeshStandardMaterial;
    const sh = { fragmentShader: THREE.ShaderLib.standard.fragmentShader, vertexShader: '', uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    mat.onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
    expect(sh.fragmentShader).toMatch(/#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\s*totalEmissiveRadiance \*= vColor;/);
    const c = new THREE.Color();
    m.today.forEach((s, i) => { mesh.getColorAt(i, c); expect('#' + c.getHexString()).toBe(MYSTERY_COLOR[s.kind]); });
  });

  it('held by the walkthrough\'s lever: no stars, no spots, no line', () => {
    mysteryHold.held = true;
    const h = host(), m = createMystery(h.g, geo, h.stage);
    m.update(0, true);
    expect(m.today).toHaveLength(0);
    expect(m.spots).toHaveLength(0);
    expect(h.lines).toEqual([]);
    // the scene is the same held or not (tools/worlds.mjs compares a world built again with the first time): the mesh is
    // there, drawing nothing
    const mesh = h.g.scene.children.find((o) => (o as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
    expect(mesh?.count).toBe(0);
    mysteryHold.held = false; mysteryHold.day = '2026-11-20';
    const free = host(), f = createMystery(free.g, geo, free.stage);
    expect(free.g.scene.children.length).toBe(h.g.scene.children.length);
    f.dispose();
  });

  const meshOf = (g: { scene: THREE.Scene }) => g.scene.children.find((o) => (o as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;

  it('without showR (the first world) they are drawn wherever she is', () => {
    mysteryHold.day = '2026-11-20';
    const h = host(), m = createMystery(h.g, geo, h.stage);
    h.g.hero.root.position.set(1000, 0, 1000);
    m.update(0, false);
    expect(meshOf(h.g).visible).toBe(true);
    expect(m.drawn).toBe(true);
  });

  it('with showR: drawn only while an unsolved one is that near her; the compass and the glimmer see them all the same', async () => {
    mysteryHold.day = '2026-11-20';
    const h = host(); (h.g.world as { mystery: object }).mystery = { spots: SPOTS, showR: 12 };
    const m = createMystery(h.g, geo, h.stage), mesh = meshOf(h.g);
    h.g.hero.root.position.set(1000, 0, 1000);
    m.update(0, false);
    expect([mesh.visible, m.drawn]).toEqual([false, false]);
    expect(m.unsolved()).toHaveLength(MYSTERY_COUNT);
    expect(m.spots).toHaveLength(MYSTERY_COUNT);
    const s = m.today[0];
    h.g.hero.root.position.set(s.pos.x + 11.9, 0, s.pos.z);
    m.update(0, false);
    expect([mesh.visible, m.drawn]).toEqual([true, true]);
    h.g.hero.root.position.set(s.pos.x + 12.1, 0, s.pos.z);
    m.update(0, false);
    // no other star of the day is as near (the places are 10 m apart), so none is drawn
    const others = m.today.slice(1).some((o) => Math.hypot(o.pos.x - s.pos.x - 12.1, o.pos.z - s.pos.z) < 12);
    expect(mesh.visible).toBe(others);
    // solved, it no longer calls the mesh up near it
    await new Promise<void>((done) => { m.spots[0].run(); setTimeout(done, 0); });
    await Promise.resolve();
    expect(m.today[0].solved).toBe(true);
    h.g.hero.root.position.set(s.pos.x, 0, s.pos.z);
    m.update(0, false);
    const unsolvedNear = m.today.some((o) => !o.solved && Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) < 12);
    expect(mesh.visible).toBe(unsolvedNear);
    expect(m.unsolved()).toHaveLength(MYSTERY_COUNT - 1);
  });

  it('the lever all: a star at every place of the world, the mesh made big enough; let go - the ten of the day again', () => {
    mysteryHold.day = '2026-11-20';
    const many = Array.from({ length: 30 }, (_, i) => ({ x: (i % 6) * 10, z: Math.floor(i / 6) * 10 }));
    const h = host(); (h.g.world as { mystery: object }).mystery = { spots: many };
    const m = createMystery(h.g, geo, h.stage), mesh = meshOf(h.g);
    expect(m.today).toHaveLength(MYSTERY_COUNT);
    mysteryHold.all = true;
    m.update(0, false);
    expect(m.today).toHaveLength(30);
    expect(m.today.map((s) => s.spot)).toEqual(many.map((_, i) => i));
    expect(new Set(m.today.map((s) => s.kind)).size).toBe(3);
    expect(mesh.count).toBe(30);
    expect(mesh.instanceMatrix.count).toBe(30);
    mysteryHold.all = false;
    m.update(0, false);
    expect(m.today).toHaveLength(MYSTERY_COUNT);
    // a world of fewer places than ten a day keeps the mesh of ten
    const few = host(); (few.g.world as { mystery: object }).mystery = { spots: SPOTS.slice(0, 5) };
    expect(meshOf((createMystery(few.g, geo, few.stage), few.g)).instanceMatrix.count).toBe(MYSTERY_COUNT);
  });
});
