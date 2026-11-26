// @vitest-environment happy-dom
/**
 * Imbir's gingerbread house as the step of his chain (./house.ts, WORLD-21): asked by him, opened before his house when
 * she walks there; the drawing - the pieces lying before the house, a fitting one flying into its place, a wrong one
 * coming back, the door swinging open; closed in the middle, what is assembled stays (in the world and after a reload)
 * and the assembly opens again only once she has walked off and back; assembled, the step ends with no result and ruby 2
 * is shown inside. And the decision of 2026-11-18: playing the whole house through the real conversation, with mistakes
 * and a walk-out, leaves every skill of the save as it was.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, defaultWorld } from '../../core/save';
import type { Spoken } from '../../core/audio';
import type { Game } from '../../game/context';
import { createDialogue } from '../../game/dialogue';
import { createWorldScope } from '../../game/scope';
import type { TaskResult } from '../../game/taskviews/panel';
import type { CharacterDef, Npc } from '../../game/world';
import { taskFrame, type WorldTaskShow } from '../../game/worldtasks/core';
import type { WorldHouse } from '../../game/worldtasks/house';
import { FLY, generateHouse } from '../../game/worldtasks/house';
import { keptOf } from '../../game/worldtasks/kept';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { createRng } from '../../core/rng';
import { addStrings } from '../../ui/strings';
import { AGAIN_R, DOORWAY, HOUSE_STEP, createHouse, drawHouse } from './house';
import { HOUSE_FACADE } from './layout';
import { strings } from './strings';

vi.mock('../../ui/achieve', () => ({ bindAchievements: () => {} }));
vi.mock('../../ui/ui', () => ({ fanfare: () => Promise.resolve() }));
vi.mock('../../game/stops', () => ({ stopPoint: () => Promise.resolve() }));
vi.mock('../../game/stage', () => ({ playScene: (_s: unknown, _n: string, f: () => Promise<void>) => f() }));

addStrings(strings, false);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function game(ws = defaultWorld(), save = defaultSave()) {
  const quick = () => Promise.resolve() as Spoken;
  let seed = 11;
  const captions: { key: string }[] = [], stars: number[] = [], lines: string[] = [];
  const g = {
    scene: new THREE.Scene(), groundY: () => 0, hero: { root: new THREE.Object3D(), play: () => {} }, cat: { play: () => {} }, cam: {}, ws, save,
    rng: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), persist: () => {}, busy: false, touch: true, plan: {},
    speech: { caption: (c: { key: string } | null) => { if (c) captions.push(c); }, shown: null, line: (key: string) => { lines.push(key); return Promise.resolve(); } },
    hooksFor: () => ({ prompt: () => {}, number: () => {}, good: () => {}, wrong: quick, hint: quick }),
    sparks: { burst: () => {} }, task: (open: () => Promise<TaskResult>) => open(),
    refreshHud: () => {}, addStars: (n: number) => { stars.push(n); }, above: () => new THREE.Vector3(), fault: () => {}, praise: () => Promise.resolve(),
  };
  const opened: WorldHouse[] = [];
  let open: WorldTaskShow | null = null;
  const player = {
    play: (show: WorldTaskShow) => { open = show; opened.push(show as WorldHouse); return show.done.finally(() => { open = null; }); },
    get open() { return open; }, tap: () => false, update: (t: number) => open?.update(t),
  } as WorldTaskPlayer;
  const scope = createWorldScope(new THREE.Scene());
  return { g: g as unknown as Game, captions, opened, player, scope, ws, save, stars, lines };
}
const imbir = { def: { id: 'imbir' } } as Npc;
const walkTo = (g: Game, x: number, z: number) => { g.hero.root.position.set(x, 0, z); };
/** Frames of the world for `s` seconds of game time from `t0`: the drawing moves. */
const frames = (step: ReturnType<typeof createHouse>, s: number, t0 = 0, canMove = true) => { for (let t = 0; t <= s; t += 1 / 30) step.update(1 / 30, t0 + t, canMove); };

describe('the drawing of the house', () => {
  it('the outline in two meshes, a mesh for each piece; a fitting piece flies into its place, a wrong one comes back to where it lay', () => {
    const scene = new THREE.Scene(), spec = generateHouse(5, createRng('draw'));
    const d = drawHouse(scene, spec, [], () => 0);
    expect(d.group.children).toHaveLength(2 + spec.body.pieces.length);
    const lay = d.pieces.map((m) => m.position.clone());
    // every piece lies before the front, toward the child, apart from the others
    for (const p of lay) expect(p.x).toBeGreaterThan(HOUSE_FACADE.x + 0.8);
    for (let i = 0; i < lay.length; i++) for (let j = i + 1; j < lay.length; j++) expect(lay[i].distanceTo(lay[j])).toBeGreaterThan(0.5);
    const wrong = spec.body.places.findIndex((s) => s !== spec.body.pieces[0]);
    d.back(0, wrong);
    for (let t = 0; t < 0.4; t += 1 / 30) d.update(1 / 30, t);
    expect(d.pieces[0].position.distanceTo(lay[0])).toBeGreaterThan(0.1);      // on its way toward the place
    for (let t = 0.4; t < 1.2; t += 1 / 30) d.update(1 / 30, t);
    expect(d.pieces[0].position.distanceTo(lay[0])).toBeLessThan(1e-6);       // back where it lay
    const k = spec.body.places.indexOf(spec.body.pieces[0]);
    d.fit(0, k);
    for (let t = 2; t < 2 + FLY + 0.1; t += 1 / 30) d.update(1 / 30, t);
    expect(d.pieces[0].position.distanceTo(d.place(k).pos)).toBeLessThan(1e-6);
    expect(d.pieces[0].scale.x).toBeCloseTo(1, 6);
    d.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('the door swings open on its hinge once the house is done, out of its place toward the child', () => {
    const spec = generateHouse(1, createRng('door')), all = spec.body.pieces.map((_, i) => i);
    const d = drawHouse(new THREE.Scene(), spec, all, () => 0);
    const door = d.pieces[spec.body.pieces.indexOf('door')], shut = door.position.clone();
    d.update(1 / 30, 0);
    expect(door.position.distanceTo(shut)).toBeLessThan(1e-6);
    d.open(true);
    for (let t = 0; t < 1.5; t += 1 / 30) d.update(1 / 30, t);
    expect(d.doorOpen).toBe(1);
    expect(door.position.x).toBeGreaterThan(shut.x + 0.3);
    // the doorway the ruby is seen in is behind where the door stood
    expect(Math.hypot(DOORWAY.x - shut.x, DOORWAY.z - shut.z)).toBeLessThan(0.4);
  });
});

describe('the gingerbread house as Imbir\'s step (WORLD-21)', () => {
  it('asked: on, its middle kept, the sparkles lead before the house; it opens there and not on the way', () => {
    const { g, opened, player, scope, ws, captions } = game(), step = createHouse(g, player, scope, { inside: () => {} });
    expect(step.active!()).toBe(false);
    step.start!(imbir, () => {});
    expect(step.owner!()).toBe('imbir');
    expect(keptOf(ws, HOUSE_STEP)).toHaveLength(2);
    // on the way: Imbir's ask (a tap on the bubble says it again); his question and the cat's hint are the world's own
    expect(captions.at(-1)).toMatchObject({ key: 'imbir_t3' });
    expect(step.spec.prompt).toBe('imbir_house_start');
    expect(step.spec.hint.rungs.map((r) => r.key)).toEqual(['sweet_house_hint_1', 'sweet_house_hint_2', 'sweet_house_hint_3']);
    const goal = step.goal()!;
    expect(Math.hypot(goal.x - HOUSE_FACADE.x, goal.z - HOUSE_FACADE.z)).toBeLessThan(5);
    walkTo(g, 0, 0); frames(step, 0.1);
    expect(opened).toHaveLength(0);
    walkTo(g, goal.x, goal.z); frames(step, 0.1, 0, false);
    expect(opened).toHaveLength(0);                 // not while she cannot move
    frames(step, 0.1);
    expect(opened).toHaveLength(1);
    expect(opened[0].kind).toBe('house');
    expect(step.goal()).toBeNull();
  });

  it('closed in the middle: what is assembled stays, in the save at once; it opens again only once she has walked off and back, in that middle', async () => {
    const { g, opened, player, scope, ws, lines } = game(), step = createHouse(g, player, scope, { inside: () => {} });
    step.start!(imbir, () => {});
    step.cheat(); frames(step, 0.1);
    const first = opened[0];
    expect(first.half!()).toBeGreaterThan(0);
    const middle = first.progress();
    expect(keptOf(ws, HOUSE_STEP).slice(2)).toEqual(middle);
    first.close();
    await vi.runAllTimersAsync();
    expect(step.active!()).toBe(true);
    // Imbir keeps what is put, and says so
    expect(lines.filter((k) => k === 'imbir_house_exit')).toHaveLength(1);
    frames(step, 1, 1);
    expect(opened).toHaveLength(1);
    // the pieces put in stay in their places in the world
    for (const i of middle) expect(step.drawing.pieces[i].position.distanceTo(step.drawing.place(step.drawing.pieces[i].userData.place as number).pos)).toBeLessThan(1e-6);
    // the walkthrough's move: a step away first, then back
    const goal = step.goal()!;
    expect(step.cheat()).toBe(true);
    expect(Math.hypot(g.hero.root.position.x - goal.x, g.hero.root.position.z - goal.z)).toBeGreaterThan(AGAIN_R);
    frames(step, 0.1, 3);
    expect(opened).toHaveLength(1);
    step.cheat(); frames(step, 0.1, 4);
    expect(opened).toHaveLength(2);
    expect(opened[1].state()).toMatchObject({ phase: 'input', wrongs: 0, progress: middle });
    // back to a house begun: Imbir welcomes her back instead of asking again
    expect(lines.filter((k) => k === 'imbir_house_resume')).toHaveLength(1);
  });

  it('after a reload the same house stands there with the same pieces in their places', () => {
    const first = game(), step = createHouse(first.g, first.player, first.scope, { inside: () => {} });
    step.start!(imbir, () => {});
    step.cheat(); frames(step, 0.1);
    first.opened[0].half!();
    const again = game(first.ws), step2 = createHouse(again.g, again.player, again.scope, { inside: () => {} });
    expect(step2.spec.body).toEqual(step.spec.body);
    step2.start!(imbir, () => {});
    expect(step2.spec.body).toEqual(step.spec.body);
    step2.cheat(); frames(step2, 0.1);
    expect(again.opened[0].progress()).toEqual(first.opened[0].progress());
  });

  it('assembled: the door opens, what is inside is shown, the step ends with no result and its middle goes', async () => {
    const { g, opened, player, scope, ws, lines } = game(), results: unknown[][] = [];
    let inside = 0;
    const step = createHouse(g, player, scope, { inside: () => { inside++; } });
    step.start!(imbir, (...r: unknown[]) => { results.push(r); });
    step.cheat(); frames(step, 0.1);
    expect(opened[0].wrong()).toBe(true);
    await vi.runAllTimersAsync();
    opened[0].solve();
    await vi.runAllTimersAsync();
    expect(results).toEqual([[]]);             // done() alone: no result, so the conversation records no skill
    expect(lines).toContain('imbir_house_finish');
    expect(lines).toContain('imbir_house_fit');
    expect(lines).not.toContain('imbir_house_exit');
    expect(inside).toBe(1);
    expect(step.active!()).toBe(false);
    expect(keptOf(ws, HOUSE_STEP)).toEqual([]);
    frames(step, 1.5, 10);
    expect(step.drawing.doorOpen).toBe(1);
    // a chain past the house finds it assembled, its door open
    const done = game(), step3 = createHouse(done.g, done.player, done.scope, { inside: () => {} });
    step3.opened(true);
    expect(step3.drawing.doorOpen).toBe(1);
    for (const [i, m] of step3.drawing.pieces.entries()) if (step3.spec.body.pieces[i] !== 'door') expect(m.position.distanceTo(step3.drawing.place(m.userData.place as number).pos), `${i}`).toBeLessThan(1e-6);
  });

  it('the level of "Classification" sets the house: 3 places on level 1, 6 on level 5', () => {
    for (const [level, n] of [[1, 3], [5, 6]] as const) {
      const save = defaultSave();
      save.fixed.classify = level;
      const { g, player, scope } = game(defaultWorld(), save), step = createHouse(g, player, scope, { inside: () => {} });
      step.start!(imbir, () => {});
      expect(step.spec.body.places, `level ${level}`).toHaveLength(n);
    }
  });
});

describe('the assembly changes no skill (the customer\'s decision 2026-11-18)', () => {
  const IMBIR = { id: 'imbir', emoji: '🍪', x: 0, z: 0, heading: 0, steps: ['count', 'pattern', HOUSE_STEP, 'part'], shard: '#fff' } as CharacterDef;

  it('the whole house through the real conversation - a wrong piece, left in the middle, walked off and back, finished: every skill as it was', async () => {
    const save = defaultSave();
    save.fixed.classify = 4;
    // something in the skills already, so "as it was" is not just "empty"
    save.skills.classify = { ...save.skills.classify, tasks: 3, errors: 1 };
    const { g, opened, player, scope, ws, stars } = game(defaultWorld(), save);
    const house = createHouse(g, player, scope, { inside: () => { ws.flags.imbir_hint = true; } });
    const d = createDialogue(g, {} as never, { characters: [IMBIR], lines: { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'sweet_part', partText: 'sweet_count' } as never, tasks: { [HOUSE_STEP]: house } });
    const npc = { def: IMBIR, actor: { has: () => false }, pos: new THREE.Vector3() } as unknown as Npc;
    const skills = JSON.stringify(save.skills), fixed = JSON.stringify(save.fixed);
    ws.quests.imbir = 2;
    await d.talk(npc);
    expect(house.active!()).toBe(true);
    house.cheat(); frames(house, 0.1);
    expect(opened[0].wrong()).toBe(true);
    await vi.runAllTimersAsync();
    expect(opened[0].half!()).toBeGreaterThan(0);
    opened[0].close();
    await vi.runAllTimersAsync();
    house.cheat(); frames(house, 0.1, 2);        // a step away
    house.cheat(); frames(house, 0.1, 3);        // and back
    expect(opened).toHaveLength(2);
    expect(opened[1].wrong()).toBe(true);
    await vi.runAllTimersAsync();
    opened[1].solve();
    await vi.runAllTimersAsync();
    expect(ws.quests.imbir).toBe(3);             // the step done: the ruby in the doorway is next
    expect(ws.flags.imbir_hint).toBe(true);
    expect(stars).toEqual([3]);
    expect(JSON.stringify(save.skills)).toBe(skills);
    expect(JSON.stringify(save.fixed)).toBe(fixed);
  });
});

describe('the house in its frame on a phone', () => {
  /** The house of the top level framed by the camera of a task in the world (./core.ts taskFrame) at `w` x `h`. */
  function framed(w: number, h: number) {
    const cam = new THREE.PerspectiveCamera(55, w / h, 0.3, 600);       // the game's camera (src/core/renderer.ts)
    const spec = generateHouse(5, createRng('frame')), d = drawHouse(new THREE.Scene(), spec, [], () => 0);
    const { cam: c } = taskFrame(d, cam);
    cam.position.set(c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, c.target.y + Math.sin(c.pitch) * c.dist, c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist);
    cam.lookAt(c.target); cam.updateMatrixWorld();
    const scr = (p: THREE.Vector3) => { const q = p.clone().project(cam); return { x: 0.5 + q.x * 0.5, y: 0.5 - q.y * 0.5 }; };
    const px = (p: THREE.Vector3) => { const q = p.clone().project(cam); return new THREE.Vector2(q.x * w / 2, q.y * h / 2); };
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const size = (t: { pos: THREE.Vector3; r: number }) => 2 * px(t.pos).distanceTo(px(t.pos.clone().addScaledVector(right, t.r)));
    const box = new THREE.Box3().setFromObject(d.group), corners: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    return {
      corners: corners.map(scr),
      pieces: spec.body.pieces.map((_, i) => size(d.piece(i))),
      places: spec.body.places.map((_, k) => size(d.place(k))),
      // where a tap on a place is measured from: under the bubble of the line (its top quarter of the screen)
      placeAt: spec.body.places.map((_, k) => scr(d.place(k).pos)),
    };
  }

  it.each([[844, 390], [390, 844]])('%ix%i: the whole house and its pieces in the picture, under the bubble, every piece and place big enough to tap', (w, h) => {
    const f = framed(w, h);
    // the whole house in the picture, its top under a bubble of two lines (the hint's: about the top fifth of a phone held sideways)
    for (const p of f.corners) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1); expect(p.y).toBeGreaterThan(0.22); expect(p.y).toBeLessThan(0.97); }
    for (const p of f.placeAt) expect(p.y).toBeGreaterThan(0.25);
    for (const t of [...f.pieces, ...f.places]) expect(t).toBeGreaterThanOrEqual(48);
  });
});
