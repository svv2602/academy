// @vitest-environment happy-dom
/**
 * Tyanuchka's scales with candies as the step of his chain (./scales.ts, WORLD-22): the drawing - the candies on the
 * child's left pan, the empty place on the right one, the weights in a row toward the child; the beam tilts to the
 * heavier side (a wrong weight tips it the way it is wrong and comes back, the right one balances it, at level 5 the
 * right sign lets it go to the bigger side); the step played through the real conversation - three mistakes, then
 * solved - records `compare` exactly as a panel task does; the scales in their frame on a phone.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, defaultWorld, type Save } from '../../core/save';
import type { Spoken } from '../../core/audio';
import { createRng } from '../../core/rng';
import type { Game } from '../../game/context';
import { createDialogue } from '../../game/dialogue';
import { createWorldScope } from '../../game/scope';
import { recordTask } from '../../game/skills';
import { SIGNS } from '../../game/tasks/signs';
import type { TaskResult } from '../../game/taskviews/panel';
import type { CharacterDef, Npc } from '../../game/world';
import { taskFrame, type WorldTaskShow } from '../../game/worldtasks/core';
import { generateScales, type ScalesSpec, type WorldScales } from '../../game/worldtasks/scales';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { addStrings } from '../../ui/strings';
import { SCALES_AT } from './layout';
import { SCALES_STEP, createScales, drawScales } from './scales';
import { strings } from './strings';

vi.mock('../../ui/achieve', () => ({ bindAchievements: () => {} }));
vi.mock('../../ui/ui', () => ({ fanfare: () => Promise.resolve() }));
vi.mock('../../game/stops', () => ({ stopPoint: () => Promise.resolve() }));
vi.mock('../../game/stage', () => ({ playScene: (_s: unknown, _n: string, f: () => Promise<void>) => f() }));

addStrings(strings, false);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

/** The child's right across the scales (the direction they are looked at, src/game/worldtasks/core.ts taskFrame). */
const RIGHT = new THREE.Vector3(-Math.cos(SCALES_AT.facing), 0, Math.sin(SCALES_AT.facing));
const TOWARD_CHILD = new THREE.Vector3(-Math.sin(SCALES_AT.facing), 0, -Math.cos(SCALES_AT.facing));
const across = (p: THREE.Vector3) => new THREE.Vector3(p.x - SCALES_AT.x, 0, p.z - SCALES_AT.z).dot(RIGHT);
const toward = (p: THREE.Vector3) => new THREE.Vector3(p.x - SCALES_AT.x, 0, p.z - SCALES_AT.z).dot(TOWARD_CHILD);
const spec = (body: ScalesSpec['body'], level = 4): ScalesSpec => ({ ...generateScales(level, createRng('x')), body });
/** Frames of game time from `t0` for `s` seconds: the scales move. */
const run = (d: ReturnType<typeof drawScales>, s: number, t0: number) => { for (let t = 0; t <= s; t += 1 / 30) d.update(1 / 30, t0 + t); return t0 + s; };

describe('the drawing of the scales', () => {
  it('empty and level until a task is loaded; loaded, the candies on the left pan, the empty place on the right, the weights in a row toward the child', () => {
    const scene = new THREE.Scene(), d = drawScales(scene, () => 0);
    run(d, 1, 0);
    expect(d.angle).toBe(0);
    expect(d.things.candies).toHaveLength(0);
    d.load(spec({ mode: 'weight', left: [8, 5], right: [], choices: [9, 13, 16], answer: 1 }));
    run(d, 2, 1);
    const { candies, choices } = d.things;
    expect(candies).toHaveLength(2);
    for (const c of candies) { expect(across(c.position)).toBeLessThan(0); expect(c.position.distanceTo(d.pan(0))).toBeLessThan(0.45); }
    expect(across(d.pan(0))).toBeLessThan(0);
    expect(across(d.pan(1))).toBeGreaterThan(0);
    expect(d.group.getObjectByName('scales-empty-place')!.position.distanceTo(d.pan(1))).toBeLessThan(0.1);
    expect(choices).toHaveLength(3);
    for (const c of choices) expect(toward(c.position)).toBeGreaterThan(1);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(choices[i].position.distanceTo(choices[j].position)).toBeGreaterThan(0.6);
    // the candies weigh their pan down while the other is empty
    expect(d.angle).toBeGreaterThan(0);
    expect(d.pan(0).y).toBeLessThan(d.pan(1).y);
    d.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('a heavy wrong weight tips the beam to its side, then comes back and the beam swings back; the right one balances it and stays', () => {
    const d = drawScales(new THREE.Scene(), () => 0);
    d.load(spec({ mode: 'weight', left: [8, 5], right: [], choices: [9, 13, 16], answer: 1 }));
    let t = run(d, 2, 0);
    const lay = d.things.choices[2].position.clone();
    d.back(2, -0.2, 0.2);
    t = run(d, 0.9, t);                                // landed, sitting on the pan
    expect(d.things.choices[2].position.distanceTo(d.pan(1))).toBeLessThan(0.2);
    expect(d.angle).toBeLessThan(0);
    expect(d.pan(1).y).toBeLessThan(d.pan(0).y);       // the heavier side, the weight's, down
    t = run(d, 2, t);
    expect(d.things.choices[2].position.distanceTo(lay)).toBeLessThan(1e-6);
    expect(d.angle).toBeGreaterThan(0);
    d.put(1, 0);
    run(d, 2, t);
    expect(d.angle).toBeCloseTo(0, 3);
    expect(Math.abs(d.pan(0).y - d.pan(1).y)).toBeLessThan(0.01);
    expect(d.things.choices[1].position.distanceTo(d.pan(1))).toBeLessThan(0.2);
    // solved: the weight stays on the balanced scales, the others go
    d.clear(true);
    expect(d.things.choices.map((c) => c.visible)).toEqual([false, true, false]);
    d.clear(false);
    expect(d.things.choices).toHaveLength(0);
  });

  it('level 5: a candy on each pan, the place of the sign between them; held level while she chooses, the right sign lets it tilt to the bigger side', () => {
    const d = drawScales(new THREE.Scene(), () => 0);
    d.load(spec({ mode: 'sign', left: [4], right: [11], choices: [...SIGNS], answer: SIGNS.indexOf('<') }, 5));
    let t = run(d, 2, 0);
    expect(d.things.candies.map((c) => Math.sign(across(c.position)))).toEqual([-1, 1]);
    expect(d.things.slot).not.toBeNull();
    expect(Math.abs(across(d.things.slot!.position))).toBeLessThan(0.05);
    expect(d.angle).toBe(0);
    d.back(0, 0, 0);
    t = run(d, 0.9, t);
    expect(d.angle).toBe(0);                            // a wrong sign: still held
    t = run(d, 2, t);
    d.put(1, -0.2);
    run(d, 2, t);
    expect(d.angle).toBeLessThan(0);
    expect(d.pan(1).y).toBeLessThan(d.pan(0).y);        // 11 against 4: the right pan, the bigger side, down
  });
});

function game(ws = defaultWorld(), save = defaultSave()) {
  const quick = () => Promise.resolve() as Spoken;
  let seed = 7;
  const lines: { key: string; text?: string }[] = [], stars: number[] = [];
  const g = {
    scene: new THREE.Scene(), groundY: () => 0, ground: { block: () => {} }, hero: { root: new THREE.Object3D(), play: () => {} }, cat: { play: () => {} }, cam: {}, ws, save,
    rng: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), persist: () => {}, busy: false, touch: true, plan: {},
    speech: { caption: () => {}, shown: null, line: (key: string, _p: string, _h: number, _s: string, text?: string) => { lines.push({ key, text }); return quick(); } },
    hooksFor: () => ({ prompt: () => {}, number: () => {}, good: () => {}, wrong: quick, hint: quick }),
    sparks: { burst: () => {} }, task: (open: () => Promise<TaskResult>) => open(),
    refreshHud: () => {}, addStars: (n: number) => { stars.push(n); }, above: () => new THREE.Vector3(), fault: () => {}, praise: () => Promise.resolve(),
  };
  const opened: WorldScales[] = [];
  let open: WorldTaskShow | null = null;
  const player = {
    play: (show: WorldTaskShow) => { open = show; opened.push(show as WorldScales); return show.done.finally(() => { open = null; }); },
    get open() { return open; }, tap: () => false, update: (t: number) => open?.update(t),
  } as WorldTaskPlayer;
  return { g: g as unknown as Game, lines, opened, player, scope: createWorldScope(new THREE.Scene()), ws, save, stars };
}

const TYANUCHKA = { id: 'tyanuchka', emoji: '🍬', x: 0, z: 0, heading: 0, steps: ['sub', 'sort', SCALES_STEP], shard: '#fff' } as CharacterDef;
const LINES = { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'sweet_part', partText: 'sweet_count' } as never;

describe('the scales as Tyanuchka\'s step, recorded in `compare` as a panel task (the customer\'s decision 2026-11-18)', () => {
  /** Plays the step through the real conversation at `level` with `mistakes` wrong moves, then solves it. */
  async function play(level: number, mistakes: number, save: Save = defaultSave()) {
    save.fixed.compare = level;
    const t = game(defaultWorld(), save), scales = createScales(t.g, t.player, t.scope);
    const d = createDialogue(t.g, {} as never, { characters: [TYANUCHKA], lines: LINES, tasks: { [SCALES_STEP]: scales } });
    const npc = { def: TYANUCHKA, actor: { has: () => false }, pos: new THREE.Vector3() } as unknown as Npc;
    t.ws.quests.tyanuchka = 2;
    const talk = d.talk(npc);
    await vi.advanceTimersByTimeAsync(10);
    expect(t.opened, 'the scales open as the step').toHaveLength(1);
    const show = t.opened[0];
    for (let k = 1; k <= mistakes; k++) { expect(show.wrong()).toBe(true); await vi.advanceTimersByTimeAsync(5000); expect(show.state()).toMatchObject({ wrongs: k, phase: 'input' }); }
    show.solve();
    await vi.runAllTimersAsync();
    await talk;
    return { ...t, show, scales };
  }

  it('three mistakes, then the right weight: the chain moves on, 3 stars, and `compare` holds what a panel task with three mistakes would leave', async () => {
    const save = defaultSave();
    save.skills.compare = { ...save.skills.compare, tasks: 4, errors: 2, streak: 1 };
    const want = structuredClone(save);
    want.fixed.compare = 3;
    recordTask(want, 'compare', 3, false);
    const t = await play(3, 3, save);
    expect(t.show.spec.body.mode).toBe('weight');
    expect(t.ws.quests.tyanuchka).toBe(3);
    expect(t.stars[0]).toBe(3);
    expect(save.skills).toEqual(want.skills);
    expect(save.skills.compare.tasks).toBe(5);
    expect(save.skills.compare.errors).toBe(5);
    // its question: the recorded line of the game under the world's own subtitle
    expect(t.lines.find((l) => l.key === 't_missing')?.text).toBe(strings.table.uk.sweet_scales_ask);
  });

  it('level 5 plays the signs, and is recorded in `compare` the same way', async () => {
    const save = defaultSave(), want = structuredClone(save);
    want.fixed.compare = 5;
    recordTask(want, 'compare', 1, false);
    const t = await play(5, 1, save);
    expect(t.show.spec.body.mode).toBe('sign');
    expect(t.lines.find((l) => l.key === 't_signs')?.text).toBe(strings.table.uk.sweet_scales_sign);
    expect(save.skills).toEqual(want.skills);
  });

  it('closed: nothing recorded, the chain stays at the scales, nothing left on them', async () => {
    const save = defaultSave(), before = JSON.stringify(save.skills);
    const t = game(defaultWorld(), save), scales = createScales(t.g, t.player, t.scope);
    const d = createDialogue(t.g, {} as never, { characters: [TYANUCHKA], lines: LINES, tasks: { [SCALES_STEP]: scales } });
    t.ws.quests.tyanuchka = 2;
    const talk = d.talk({ def: TYANUCHKA, actor: { has: () => false }, pos: new THREE.Vector3() } as unknown as Npc);
    await vi.advanceTimersByTimeAsync(10);
    t.opened[0].close();
    await vi.runAllTimersAsync();
    await talk;
    expect(t.ws.quests.tyanuchka).toBe(2);
    expect(JSON.stringify(save.skills)).toBe(before);
    expect(scales.drawing.things.choices).toHaveLength(0);
    expect(scales.spec).toBeNull();
  });
});

describe('the scales in their frame on a phone', () => {
  function framed(w: number, h: number, level: number) {
    const cam = new THREE.PerspectiveCamera(55, w / h, 0.3, 600);       // the game's camera (src/core/renderer.ts)
    const d = drawScales(new THREE.Scene(), () => 0);
    d.load(generateScales(level, createRng(`frame-${level}`)));
    run(d, 2, 0);
    const { cam: c } = taskFrame(d, cam);
    cam.position.set(c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, c.target.y + Math.sin(c.pitch) * c.dist, c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist);
    cam.lookAt(c.target); cam.updateMatrixWorld();
    const scr = (p: THREE.Vector3) => { const q = p.clone().project(cam); return { x: 0.5 + q.x * 0.5, y: 0.5 - q.y * 0.5 }; };
    const px = (p: THREE.Vector3) => { const q = p.clone().project(cam); return new THREE.Vector2(q.x * w / 2, q.y * h / 2); };
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const size = (t: { pos: THREE.Vector3; r: number }) => 2 * px(t.pos).distanceTo(px(t.pos.clone().addScaledVector(right, t.r)));
    // everything shown at the second rung too: the dots beside the pans and before the weights in the picture as well
    d.dots(true);
    d.group.updateMatrixWorld(true);
    const box = new THREE.Box3(), corners: THREE.Vector3[] = [];
    d.group.traverseVisible((o) => { if (o !== d.group) box.expandByObject(o, false); });
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const n = d.things.choices.length;
    return { corners: corners.map(scr), sizes: Array.from({ length: n }, (_, i) => size(d.choice(i))), at: Array.from({ length: n }, (_, i) => scr(d.choice(i).pos)), left: scr(d.pan(0)), right: scr(d.pan(1)) };
  }

  // The bubble of the line over the picture: two lines take its top 0.22 on a phone held sideways; the hint of the signs
  // (the panel's, «Знак відкриває ротик…») takes four, its top 0.36 (the lead, 2026-11-23: it covered the right pan).
  it.each([[844, 390, 4, 0.22], [390, 844, 4, 0.22], [844, 390, 5, 0.36], [390, 844, 5, 0.36]])('%ix%i, level %i: the whole scales and the dots of the hint in the picture under the bubble (its top %f), the left pan on the left, every weight big enough to tap', (w, h, level, top) => {
    const f = framed(w, h, level);
    for (const p of f.corners) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1); expect(p.y).toBeGreaterThan(top); expect(p.y).toBeLessThan(0.97); }
    expect(f.left.x).toBeLessThan(f.right.x);
    for (const p of f.at) expect(p.y).toBeGreaterThan(0.25);
    for (const s of f.sizes) expect(s, JSON.stringify(f.sizes)).toBeGreaterThanOrEqual(48);
  });
});
