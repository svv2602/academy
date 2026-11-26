// @vitest-environment happy-dom
/**
 * Kakao's shape bridge as the step of his chain (./bridge.ts, WORLD-20): the drawing - the tiles floating on the river
 * upstream of the deck, the empty places on the deck, a fitting tile rising flat into its place, a wrong one wobbling and
 * staying where it floats; the step - asked, the sparkles lead to the bank and it opens there; closed half built, the
 * deck stays, in the save at once, and after a reload; the whole step through the real conversation - three mistakes,
 * left in the middle, come back to, finished - records `classify` exactly as a panel task with those mistakes would; the
 * bridge in its frame on a phone.
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
import type { TaskResult } from '../../game/taskviews/panel';
import type { CharacterDef, Npc } from '../../game/world';
import { RISE, generateBridge, rightOnes, type WorldBridge } from '../../game/worldtasks/bridge';
import { taskFrame, type WorldTaskShow } from '../../game/worldtasks/core';
import { keptOf } from '../../game/worldtasks/kept';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { addStrings } from '../../ui/strings';
import { BRIDGE, RIVER_HALF } from './layout';
import { AGAIN_R, BRIDGE_STEP, RULE_ASK, RULE_TEXT, createBridge, drawBridge } from './bridge';
import { height } from './terrain';
import { strings } from './strings';

vi.mock('../../ui/achieve', () => ({ bindAchievements: () => {} }));
vi.mock('../../ui/ui', () => ({ fanfare: () => Promise.resolve() }));
vi.mock('../../game/stops', () => ({ stopPoint: () => Promise.resolve() }));
vi.mock('../../game/stage', () => ({ playScene: (_s: unknown, _n: string, f: () => Promise<void>) => f() }));
vi.mock('../../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: () => {} }));

addStrings(strings, false);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

/** The deck's upstream edge (z), the tiles float north of it; the deck lies between its edges. */
const DECK_N = BRIDGE.z - BRIDGE.w / 2, DECK_S = BRIDGE.z + BRIDGE.w / 2;
/** m: the top of the deck's rails over the ground (src/worlds/sweet/scenery.ts: 0.7 m high, its middle 0.5 m up). */
const RAIL_TOP = 0.85;
/** Frames of game time from `t0` for `s` seconds: the tiles move. */
const run = (d: { update(dt: number, t: number): void }, s: number, t0: number) => { for (let t = 0; t <= s; t += 1 / 30) d.update(1 / 30, t0 + t); return t0 + s; };

describe('the drawing of the bridge', () => {
  it('the tiles float on the river upstream of the deck, apart; the deck has a place for each fitting tile; a fitting one rises flat into its place, a wrong one wobbles and stays', () => {
    const scene = new THREE.Scene(), spec = generateBridge(5, createRng('draw')), d = drawBridge(scene, spec, [], () => 0);
    let t = run(d, 0.5, 0);
    const lay = d.tiles.map((m) => m.position.clone());
    expect(d.tiles).toHaveLength(spec.body.tiles.length);
    expect(d.slots).toHaveLength(rightOnes(spec.body).length);
    const ledge = d.group.getObjectByName('bridge-new-deck')!;
    for (const p of lay) {
      expect(p.z).toBeLessThan(DECK_N - 1.4);               // upstream of the deck and of the new deck along it
      expect(Math.abs(p.x - BRIDGE.x) + 0.5).toBeLessThan(RIVER_HALF);    // on the chocolate, between the banks
    }
    for (let i = 0; i < lay.length; i++) for (let j = i + 1; j < lay.length; j++) expect(Math.hypot(lay[i].x - lay[j].x, lay[i].z - lay[j].z)).toBeGreaterThan(0.9);
    // the places of the new waffle deck: along the bridge's upstream side, before its rail, level with its planks, on the new deck
    for (const s of d.slots) {
      expect(s.z).toBeLessThan(DECK_N - 0.3); expect(s.z).toBeGreaterThan(DECK_N - 1.2);
      expect(Math.abs(s.x - BRIDGE.x)).toBeLessThan(RIVER_HALF);
      expect(Math.abs(s.z - ledge.position.z)).toBeLessThan(0.05);
      expect(s.y).toBeGreaterThan(0.2);
    }
    void DECK_S;
    // a wrong tile: it wobbles where it floats and settles there
    const wrong = spec.body.tiles.findIndex((_, i) => !rightOnes(spec.body).includes(i));
    d.wobble(wrong);
    t = run(d, 0.3, t);
    expect(Math.abs(d.tiles[wrong].rotation.z)).toBeGreaterThan(0.05);
    t = run(d, 1, t);
    expect(Math.hypot(d.tiles[wrong].position.x - lay[wrong].x, d.tiles[wrong].position.z - lay[wrong].z)).toBeLessThan(1e-6);
    expect(Math.abs(d.tiles[wrong].position.y - lay[wrong].y)).toBeLessThan(0.06);       // still bobbing on the chocolate
    // a fitting one: up out of the chocolate in an arc, flat in place 0 of the deck
    const right = rightOnes(spec.body)[0];
    d.rise(right, 0);
    t = run(d, RISE / 2, t);
    expect(d.tiles[right].position.y).toBeGreaterThan(0.5);
    run(d, RISE, t);
    expect(Math.hypot(d.tiles[right].position.x - d.slots[0].x, d.tiles[right].position.z - d.slots[0].z)).toBeLessThan(1e-6);
    expect(d.tiles[right].rotation.x).toBeCloseTo(0, 6);
    expect(d.inDeck).toEqual([right]);
    d.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('the second rung: the shape asked for on the places of the deck, at level 5 the colour left out dimmed; done, the tiles left drift off', () => {
    const spec = { ...generateBridge(5, createRng('dim')), body: { rule: 'roundNotRed' as const, tiles: [
      { shape: 'circle' as const, color: 'blue' as const, small: false }, { shape: 'circle' as const, color: 'red' as const, small: false },
      { shape: 'oval' as const, color: 'green' as const, small: false }, { shape: 'square' as const, color: 'blue' as const, small: false }] } };
    const d = drawBridge(new THREE.Scene(), spec, [], () => 0);
    run(d, 0.1, 0);
    const red = (d.tiles[1].material as THREE.MeshStandardMaterial).color.clone();
    expect(d.outlines.visible).toBe(false);
    d.outline(true); d.dim(true);
    run(d, 0.1, 1);
    expect(d.outlines.visible).toBe(true);
    expect((d.tiles[1].material as THREE.MeshStandardMaterial).color.r).toBeLessThan(red.r * 0.5);
    expect((d.tiles[0].material as THREE.MeshStandardMaterial).color.b).toBeGreaterThan(0.5);   // a blue one stays bright
    d.rise(0, 0); d.rise(2, 1);
    d.finish();
    run(d, 2, 2);
    expect(d.tiles[1].visible).toBe(false);
    expect(d.tiles[0].visible).toBe(true);
    expect(d.outlines.visible).toBe(false);
  });
});

function game(ws = defaultWorld(), save = defaultSave()) {
  const quick = () => Promise.resolve() as Spoken;
  let seed = 7;
  const lines: { key: string; text?: string }[] = [], stars: number[] = [], captions: unknown[] = [];
  const g = {
    scene: new THREE.Scene(), groundY: () => 0, ground: { block: () => {} }, hero: { root: new THREE.Object3D(), play: () => {} }, cat: { play: () => {} }, cam: {}, ws, save,
    rng: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), persist: () => {}, busy: false, touch: true, plan: {},
    speech: { caption: (c: unknown) => { captions.push(c); }, shown: null, line: (key: string, _p: string, _h: number, _s: string, text?: string) => { lines.push({ key, text }); return quick(); } },
    hooksFor: () => ({ prompt: () => {}, number: () => {}, good: () => {}, wrong: quick, hint: quick }),
    sparks: { burst: () => {} }, task: (open: () => Promise<TaskResult>) => open(),
    refreshHud: () => {}, addStars: (n: number) => { stars.push(n); }, above: () => new THREE.Vector3(), fault: () => {}, praise: () => Promise.resolve(),
  };
  const opened: WorldBridge[] = [];
  let open: WorldTaskShow | null = null;
  const player = {
    play: (show: WorldTaskShow) => { open = show; opened.push(show as WorldBridge); return show.done.finally(() => { open = null; }); },
    get open() { return open; }, tap: () => false, update: (t: number) => open?.update(t),
  } as WorldTaskPlayer;
  return { g: g as unknown as Game, lines, captions, opened, player, scope: createWorldScope(new THREE.Scene()), ws, save, stars };
}
const kakao = { def: { id: 'kakao' } } as Npc;
const frames = (step: ReturnType<typeof createBridge>, s: number, t0 = 0, canMove = true) => { for (let t = 0; t <= s; t += 1 / 30) step.update(1 / 30, t0 + t, canMove); };

describe('the shape bridge as Kakao\'s step (WORLD-20)', () => {
  it('asked: on, its middle kept, the sparkles lead to the east bank by the tiles; it opens there and not on the way', () => {
    const { g, opened, player, scope, ws, captions } = game(), step = createBridge(g, player, scope);
    expect(step.active!()).toBe(false);
    step.start!(kakao, () => {});
    expect(step.owner!()).toBe('kakao');
    expect(keptOf(ws, BRIDGE_STEP)).toHaveLength(3);
    // on the way: Kakao's ask under the world's subtitle (a tap on the bubble says it again)
    expect(captions.at(-1)).toMatchObject({ key: 'kakao_t1', text: strings.table.uk.sweet_bridge_way });
    const goal = step.goal()!;
    // on the bank, out of the chocolate, on the miller's (east) side, level with the tiles
    expect(goal.x - BRIDGE.x).toBeGreaterThan(RIVER_HALF + 0.8);
    expect(goal.z).toBeLessThan(DECK_N);
    g.hero.root.position.set(0, 0, 0); frames(step, 0.1);
    expect(opened).toHaveLength(0);
    g.hero.root.position.set(goal.x, 0, goal.z); frames(step, 0.1, 0, false);
    expect(opened).toHaveLength(0);                 // not while she cannot move
    frames(step, 0.1);
    expect(opened).toHaveLength(1);
    expect(opened[0].kind).toBe('bridge');
    expect(step.goal()).toBeNull();
  });

  it('closed half built: the tiles in the deck stay, in the save at once with the mistakes so far; it opens again only once she has walked off and back, in that middle', async () => {
    const { g, opened, player, scope, ws } = game(), step = createBridge(g, player, scope);
    step.start!(kakao, () => {});
    step.cheat(); frames(step, 0.1);
    const first = opened[0];
    expect(first.wrong()).toBe(true);
    await vi.runAllTimersAsync();
    expect(first.half!()).toBeGreaterThan(0);
    const middle = first.progress();
    expect(keptOf(ws, BRIDGE_STEP).slice(2)).toEqual([1, ...middle]);
    first.close();
    await vi.runAllTimersAsync();
    expect(step.active!()).toBe(true);
    frames(step, 1, 1);
    expect(opened).toHaveLength(1);
    for (const [k, i] of middle.entries()) expect(step.drawing.tiles[i].position.distanceTo(step.drawing.slots[k])).toBeLessThan(0.1);
    const goal = step.goal()!;
    expect(step.cheat()).toBe(true);
    expect(Math.hypot(g.hero.root.position.x - goal.x, g.hero.root.position.z - goal.z)).toBeGreaterThan(AGAIN_R);
    frames(step, 0.1, 3);
    expect(opened).toHaveLength(1);
    step.cheat(); frames(step, 0.1, 4);
    expect(opened).toHaveLength(2);
    expect(opened[1].state()).toMatchObject({ phase: 'input', wrongs: 0, progress: middle });
  });

  it('after a reload the same bridge lies there with the same tiles in its deck', () => {
    const first = game(), step = createBridge(first.g, first.player, first.scope);
    step.start!(kakao, () => {});
    step.cheat(); frames(step, 0.1);
    first.opened[0].half!();
    const again = game(first.ws), step2 = createBridge(again.g, again.player, again.scope);
    expect(step2.spec.body).toEqual(step.spec.body);
    step2.start!(kakao, () => {});
    expect(step2.spec.body).toEqual(step.spec.body);
    step2.cheat(); frames(step2, 0.1);
    expect(again.opened[0].progress()).toEqual(first.opened[0].progress());
  });

  it('a chain past the bridge finds its whole deck laid, nothing floating', () => {
    const { g, player, scope } = game(), step = createBridge(g, player, scope);
    step.opened(true);
    frames(step, 2);
    expect([...step.drawing.inDeck].sort()).toEqual(rightOnes(step.spec.body).sort());
    for (const [i, m] of step.drawing.tiles.entries()) expect(m.visible, `${i}`).toBe(step.drawing.inDeck.includes(i));
  });

  it('the level of "Classification" sets the bridge: 6 tiles on level 1, 10 on level 5', () => {
    for (const [level, n] of [[1, 6], [5, 10]] as const) {
      const save = defaultSave();
      save.fixed.classify = level;
      const { g, player, scope } = game(defaultWorld(), save), step = createBridge(g, player, scope);
      step.start!(kakao, () => {});
      expect(step.spec.body.tiles, `level ${level}`).toHaveLength(n);
    }
  });
});

const KAKAO = { id: 'kakao', emoji: '🍫', x: 0, z: 0, heading: 0, steps: [BRIDGE_STEP, 'simon', 'signs', 'part'], shard: '#fff' } as CharacterDef;
const LINES = { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'sweet_part', partText: 'sweet_count' } as never;

describe('the bridge recorded in `classify` as a panel task (the customer\'s decision 2026-11-18)', () => {
  /** The whole step through the real conversation: three mistakes, left half built, walked off and back, finished. */
  async function play(level: number, save: Save) {
    save.fixed.classify = level;
    const t = game(defaultWorld(), save), bridge = createBridge(t.g, t.player, t.scope);
    const d = createDialogue(t.g, {} as never, { characters: [KAKAO], lines: LINES, tasks: { [BRIDGE_STEP]: bridge } });
    const npc = { def: KAKAO, actor: { has: () => false }, pos: new THREE.Vector3() } as unknown as Npc;
    await d.talk(npc);
    expect(bridge.active!()).toBe(true);
    bridge.cheat(); frames(bridge, 0.1);
    const first = t.opened[0];
    for (let k = 1; k <= 3; k++) { expect(first.wrong()).toBe(true); await vi.advanceTimersByTimeAsync(5000); expect(first.state()).toMatchObject({ wrongs: k, phase: 'input', rung: k }); }
    expect(first.half!()).toBeGreaterThan(0);
    first.close();
    await vi.runAllTimersAsync();
    bridge.cheat(); frames(bridge, 0.1, 2);
    bridge.cheat(); frames(bridge, 0.1, 3);
    expect(t.opened).toHaveLength(2);
    t.opened[1].solve();
    await vi.runAllTimersAsync();
    return { ...t, bridge };
  }

  it('three mistakes, half built, left and come back, finished: the chain moves on, 3 stars, and `classify` holds what a panel task with three mistakes would leave', async () => {
    const save = defaultSave();
    save.skills.classify = { ...save.skills.classify, tasks: 4, errors: 2, streak: 1 };
    const want = structuredClone(save);
    want.fixed.classify = 4;
    recordTask(want, 'classify', 3, false);
    const t = await play(4, save);
    expect(t.ws.quests.kakao).toBe(1);
    expect(t.stars).toEqual([3]);
    expect(save.skills).toEqual(want.skills);
    expect(save.skills.classify.tasks).toBe(5);
    expect(save.skills.classify.errors).toBe(5);
    expect(keptOf(t.ws, BRIDGE_STEP)).toEqual([]);
    // its question, at each of the two openings: Kakao's «look for the tiles of the shape I name», then the shape
    // (RULE_ASK), under the world's own subtitle that names the rule; the cat's own hint; Kakao's word at the end
    const rule = t.bridge.spec.body.rule, sub = strings.table.uk[RULE_TEXT[rule] as keyof typeof strings.table.uk];
    for (const key of ['kakao_bridge_start', RULE_ASK[rule]]) {
      const asked = t.lines.filter((l) => l.key === key);
      expect(asked, key).toHaveLength(2);
      for (const l of asked) expect(l.text).toBe(sub);
    }
    expect(t.bridge.spec.hint.rungs.map((r) => r.key)).toEqual(['sweet_bridge_hint_1', 'sweet_bridge_hint_2', 'sweet_bridge_hint_3']);
    expect(t.lines.filter((l) => l.key === 'kakao_bridge_finish')).toHaveLength(1);
  });

  it('closed with nothing in the deck: nothing recorded in any skill, the chain stays at the bridge', async () => {
    const save = defaultSave(), before = JSON.stringify(save.skills);
    const t = game(defaultWorld(), save), bridge = createBridge(t.g, t.player, t.scope);
    const d = createDialogue(t.g, {} as never, { characters: [KAKAO], lines: LINES, tasks: { [BRIDGE_STEP]: bridge } });
    await d.talk({ def: KAKAO, actor: { has: () => false }, pos: new THREE.Vector3() } as unknown as Npc);
    bridge.cheat(); frames(bridge, 0.1);
    t.opened[0].close();
    await vi.runAllTimersAsync();
    expect(t.ws.quests.kakao ?? 0).toBe(0);
    expect(JSON.stringify(save.skills)).toBe(before);
    expect(bridge.active!()).toBe(true);
  });

  // two lines of the bubble on a phone held sideways hold about 60 letters; a rule of 66 took a third line, which covered
  // the places of the new deck (the pictures of 2026-11-23)
  it('every rule has its subtitle in both languages, short enough for two lines of the bubble', () => {
    for (const key of Object.values(RULE_TEXT)) {
      for (const lang of ['uk', 'ru'] as const) {
        const text = (strings.table[lang] as Record<string, string>)[key];
        expect(text, `${lang} ${key}`).toBeTruthy();
        expect(text.length, `${lang} ${key}: ${text}`).toBeLessThanOrEqual(56);
      }
    }
  });
});

describe('the bridge in its frame on a phone', () => {
  function framed(w: number, h: number, level: number, seed: string) {
    const cam = new THREE.PerspectiveCamera(55, w / h, 0.3, 600);       // the game's camera (src/core/renderer.ts)
    // on the world's own ground: the deck stands about 0.6 m over the chocolate, which moves its places up the picture
    const spec = generateBridge(level, createRng(seed)), d = drawBridge(new THREE.Scene(), spec, [], height);
    run(d, 0.5, 0);
    const { cam: c, stand } = taskFrame(d, cam);
    cam.position.set(c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, c.target.y + Math.sin(c.pitch) * c.dist, c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist);
    cam.lookAt(c.target); cam.updateMatrixWorld();
    const scr = (p: THREE.Vector3) => { const q = p.clone().project(cam); return { x: 0.5 + q.x * 0.5, y: 0.5 - q.y * 0.5 }; };
    const px = (p: THREE.Vector3) => { const q = p.clone().project(cam); return new THREE.Vector2(q.x * w / 2, q.y * h / 2); };
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const size = (t: { pos: THREE.Vector3; r: number }) => 2 * px(t.pos).distanceTo(px(t.pos.clone().addScaledVector(right, t.r)));
    const n = spec.body.tiles.length;
    // every tile's outline in the picture: its middle and its edge across and along the view
    const edges = d.tiles.flatMap((m) => { const r = m.userData.r as number; return [-1, 1].flatMap((k) => [m.position.clone().add(new THREE.Vector3(k * r * 1.05, 0, 0)), m.position.clone().add(new THREE.Vector3(0, 0, k * r))]); });
    // the places of the new deck lie before the deck's near rail (src/worlds/sweet/scenery.ts: 0.85 m over the ground at
    // its upstream edge), between it and the camera: the rail never hides them
    const beforeRail = d.slots.map((p) => p.z + 0.5 < DECK_N && cam.position.z < p.z && p.y > height(BRIDGE.x, BRIDGE.z) + RAIL_TOP - 1);
    return { sizes: Array.from({ length: n }, (_, i) => size(d.tile(i))), at: Array.from({ length: n }, (_, i) => scr(d.tile(i).pos)), edges: edges.map(scr), slots: d.slots.map(scr), beforeRail, stand };
  }

  // The bubble of the line over the picture: two lines take its top 0.22 on a phone held sideways (the rule's subtitle
  // is two lines there); the tiles must lie under it, and the places of the deck in the picture.
  it.each([[844, 390], [390, 844]])('%ix%i, every level: every tile in the picture under the bubble, big enough to tap; the places of the new deck in the picture before the rail and under the bubble; she stands on the bank', (w, h) => {
    for (const level of [1, 2, 3, 4, 5]) for (const seed of ['a', 'b', 'c']) {
      const f = framed(w, h, level, `frame-${level}-${seed}`);
      for (const p of f.edges) { expect(p.x, `level ${level}`).toBeGreaterThan(0.02); expect(p.x).toBeLessThan(0.98); expect(p.y, `level ${level}`).toBeGreaterThan(0.25); expect(p.y).toBeLessThan(0.97); }
      for (const s of f.sizes) expect(s, `level ${level}: ${JSON.stringify(f.sizes.map(Math.round))}`).toBeGreaterThanOrEqual(48);
      // the places the tiles rise into in the picture too, under the bubble (the pictures of 2026-11-23: on the old deck
      // they lay behind its rail and under the bubble)
      for (const p of f.slots) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1); expect(p.y, `level ${level}`).toBeGreaterThan(0.26); }
      expect(f.beforeRail, `level ${level}`).not.toContain(false);
      expect(f.stand.x - BRIDGE.x, 'she stands out of the chocolate').toBeGreaterThan(RIVER_HALF);
    }
  });
});
