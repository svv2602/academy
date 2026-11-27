// @vitest-environment happy-dom
/**
 * A tap by a character (the customer's word of 2026-11-27: the heroes by the paths opened a conversation whenever she
 * walked past them): a tap meant for the path by a character walks her on, not into a conversation. Three rules
 * (./player.ts `talkByTap`): a finished chain talks only by a tap on its figure (or the action button); a step to give
 * talks by a tap near it only when the ground tapped is near it; after a talk a tap near it walks past it till she has
 * gone farther than `tuning.talkAgain` from it. A tap on its figure always talks. A click of the mouse is the same tap
 * (../core/input.ts: a short press that never became a drag).
 */
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { input } from '../core/input';
import { TUNING_DEFAULTS, tuning } from '../core/tuning';
import { Actor } from './actor';
import type { Game } from './context';
import { SPOT_TAP_PX, createPlayer, onFigure, rearmed, talkByTap, type Spot } from './player';

vi.mock('../ui/ui', () => ({ el: { btnJump: { classList: { toggle: () => {} } } }, setAct: () => {} }));
vi.mock('../core/audio', () => ({ sfx: () => {} }));
vi.mock('./ripple', () => ({ createRipple: () => ({ play() {}, update() {} }) }));
vi.mock('../ui/welcome', () => ({ catTap: () => {} }));

describe('a tap on a figure: within a share of its height on screen, whatever the screen', () => {
  it('on its line or within the share of its height to the side: on it; past that: not', () => {
    // a figure 200 px tall, feet at (500, 600), top at (500, 400)
    expect(onFigure(500, 500, 500, 600, 500, 400, 0.35)).toBe(true);
    expect(onFigure(569, 500, 500, 600, 500, 400, 0.35)).toBe(true);     // 69 px aside, 70 allowed
    expect(onFigure(571, 500, 500, 600, 500, 400, 0.35)).toBe(false);
    expect(onFigure(500, 330, 500, 600, 500, 400, 0.35)).toBe(true);     // 70 px over its top
    expect(onFigure(500, 328, 500, 600, 500, 400, 0.35)).toBe(false);
    expect(onFigure(500, 672, 500, 600, 500, 400, 0.35)).toBe(false);    // under its feet, past the share
  });

  it('the same tap is on a figure seen big (a phone close up) and off one seen small (far, a 4K screen): px scale with it', () => {
    expect(onFigure(560, 500, 500, 600, 500, 400, 0.35)).toBe(true);
    expect(onFigure(560, 500, 500, 520, 500, 480, 0.35)).toBe(false);    // 40 px tall: 14 px aside at most
    expect(onFigure(505, 500, 500, 520, 500, 480, 0.35)).toBe(true);
  });

  it('a figure of no height on screen (behind, edge-on) is never hit', () => {
    expect(onFigure(500, 500, 500, 500, 500, 500, 0.35)).toBe(false);
  });
});

describe('the three rules of a tap near a character', () => {
  const base = { hit: false, nearPx: true, done: false, armed: true, groundD: 1 };
  it('rule 1: a finished chain talks by a tap on its figure only', () => {
    expect(talkByTap({ ...base, done: true }, 2.5)).toBe(false);
    expect(talkByTap({ ...base, done: true, hit: true }, 2.5)).toBe(true);
  });
  it('rule 2: a step to give talks by a tap near it only when the ground tapped is near it', () => {
    expect(talkByTap(base, 2.5)).toBe(true);
    expect(talkByTap({ ...base, groundD: 2.5 }, 2.5)).toBe(true);
    expect(talkByTap({ ...base, groundD: 2.6 }, 2.5)).toBe(false);
    expect(talkByTap({ ...base, groundD: null }, 2.5)).toBe(false);      // the sky tapped, no ground
    expect(talkByTap({ ...base, nearPx: false }, 2.5)).toBe(false);      // not near it on screen at all
  });
  it('rule 3: after a talk a tap near it walks past it till she has gone away; a tap on it talks anyway', () => {
    expect(talkByTap({ ...base, armed: false }, 2.5)).toBe(false);
    expect(talkByTap({ ...base, armed: false, hit: true }, 2.5)).toBe(true);
    expect(rearmed(6, 6)).toBe(false);
    expect(rearmed(6.01, 6)).toBe(true);
    expect(rearmed(3, 6)).toBe(false);
  });
  it('the numbers are the tuning\'s, the panel may change them', () => {
    expect([TUNING_DEFAULTS.talkFigure, TUNING_DEFAULTS.talkNear, TUNING_DEFAULTS.talkAgain]).toEqual([0.35, 2.5, 6]);
  });
});

/** The game seen from behind the heroine: a character 6 m ahead of the camera, the ground the plane y = 0. */
function scene() {
  Object.assign(window, { innerWidth: 844, innerHeight: 390 });
  const camera = new THREE.PerspectiveCamera(50, 844 / 390, 0.1, 200);
  camera.position.set(0, 2.2, 6); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const model = new THREE.Object3D(), root = new THREE.Group(); root.add(model);
  const hero = new Actor({ root, model, clips: new Map() });
  hero.root.position.set(0, 0, 5);
  const cat = { root: new THREE.Object3D() }; cat.root.position.set(40, 0, -40);
  const ground = {
    resolve() {},
    raycast: (o: THREE.Vector3, d: THREE.Vector3, out: THREE.Vector3) => { if (d.y >= 0) return false; const t = -o.y / d.y; out.copy(o).addScaledVector(d, t); return true; },
  };
  const g = { hero, cat, cam: { yaw: 0, focus: null }, camera, touch: false, started: () => true, paused: false, busy: false, auto: null, groundY: () => 0, ground, scene: new THREE.Scene(), world: { id: 'w' } } as unknown as Game;
  const player = createPlayer(g);
  const talks: string[] = [];
  const npc = (id: string, x: number, z: number, done: boolean): Spot => ({
    pos: new THREE.Vector3(x, 0, z), r: 3, label: 'talk', on: () => true, run: () => { talks.push(id); }, talker: { done: () => done, top: () => 2 },
  });
  const px = (x: number, y: number, z: number) => { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x * 0.5 + 0.5) * 844, y: (-v.y * 0.5 + 0.5) * 390 }; };
  /** A tap at (x, y) px; what it chose: a talk to walk to (`talk`), a walk on the ground, nothing. */
  const tap = (spots: Spot[], at: { x: number; y: number }) => {
    g.auto = null; input.tap = at;
    player.tap(true, spots, () => false);
    return g.auto === null ? 'nothing' : (g.auto as { then?: unknown }).then ? 'talk' : 'walk';
  };
  // on screen (844 x 390): the character's feet at (422, 260), its top 2 m up at (422, 126), the point 1 m up at (422, 195);
  // NEAR - the ground about 1.6 m to its side, PAST - the path about 4.6 m behind it over its shoulder: both within
  // SPOT_TAP_PX of the point 1 m up and off its figure (0.35 of its 134 px: 47 px)
  const NEAR = { x: 480, y: 230 }, PAST = { x: 478, y: 200 };
  /** She arrives where the tap took her: the walk ends with its talk. */
  const arrive = () => { const a = g.auto as { then?: () => void } | null; g.auto = null; a?.then?.(); };
  return { g, hero, player, talks, npc, px, tap, arrive, NEAR, PAST };
}

describe('a tap by a character in the game (./player.ts tap)', () => {
  beforeEach(() => { Object.assign(tuning, TUNING_DEFAULTS); Object.assign(input, { moveX: 0, moveY: 0, jump: false, act: false, tap: null }); });

  it('a tap on its figure walks her to it and talks, finished or not', () => {
    const s = scene();
    for (const done of [false, true]) expect(s.tap([s.npc('owl', 0, 0, done)], s.px(0, 1, 0))).toBe('talk');
  });

  it('rule 1: the path beside a finished character (near it on screen, off its figure) is a walk', () => {
    const s = scene();
    const at = s.px(0, 1, 0), feet = s.px(0, 0, 0), top = s.px(0, 2, 0);
    expect(Math.hypot(s.NEAR.x - at.x, s.NEAR.y - at.y)).toBeLessThan(SPOT_TAP_PX);
    expect(onFigure(s.NEAR.x, s.NEAR.y, feet.x, feet.y, top.x, top.y, tuning.talkFigure)).toBe(false);
    expect(s.tap([s.npc('owl', 0, 0, true)], s.NEAR)).toBe('walk');
    // the same tap by a character with a step to give lands on the ground near it: it talks
    expect(s.tap([s.npc('owl', 0, 0, false)], s.NEAR)).toBe('talk');
    // and a finished one with a wider figure share takes it as a tap on it (the tuning's number, read at the tap)
    tuning.talkFigure = 0.6;
    expect(s.tap([s.npc('owl', 0, 0, true)], s.NEAR)).toBe('talk');
  });

  it('rule 2: a step to give talks by a tap near it only when the ground tapped is near it, not on the path past it', () => {
    const s = scene();
    const fox = s.npc('fox', 0, 0, false);
    expect(s.tap([fox], s.NEAR)).toBe('talk');
    const at = s.px(0, 1, 0), feet = s.px(0, 0, 0), top = s.px(0, 2, 0);
    expect(Math.hypot(s.PAST.x - at.x, s.PAST.y - at.y)).toBeLessThan(SPOT_TAP_PX);
    expect(onFigure(s.PAST.x, s.PAST.y, feet.x, feet.y, top.x, top.y, tuning.talkFigure)).toBe(false);
    expect(s.tap([fox], s.PAST)).toBe('walk');
    tuning.talkNear = 8;                     // the tuning's number, read at the tap
    expect(s.tap([fox], s.PAST)).toBe('talk');
    // the ground 2 m before it but far from it on screen (at her feet, 140 px under it): a walk, as any tap not near it
    const before = s.px(0.5, 0, 2);
    expect(Math.hypot(before.x - at.x, before.y - at.y)).toBeGreaterThan(SPOT_TAP_PX);
    expect(s.tap([fox], before)).toBe('walk');
  });

  it('rule 3: after a talk a tap near it walks past it till she has gone farther than talkAgain; a tap on it talks', () => {
    const s = scene();
    const fox = s.npc('fox', 0, 0, false), near = s.NEAR;
    expect(s.tap([fox], near)).toBe('talk');
    s.arrive();
    expect(s.talks).toEqual(['fox']);
    expect(s.tap([fox], near)).toBe('walk');
    expect(s.tap([fox], s.px(0, 1, 0))).toBe('talk');
    // she goes 5 m off and back: still not
    s.hero.root.position.set(0, 0, 5); s.player.prompt(true, [fox]);
    expect(s.tap([fox], near)).toBe('walk');
    // 7 m off: again
    s.hero.root.position.set(0, 0, 7); s.player.prompt(true, [fox]);
    expect(s.tap([fox], near)).toBe('talk');
  });

  it('rule 3 by the action button too: a talk by the button disarms the tap near it', () => {
    const s = scene();
    const fox = s.npc('fox', 0, 0, false);
    s.hero.root.position.set(0, 0, 1.5);
    input.act = true; s.player.prompt(true, [fox]);
    expect(s.talks).toEqual(['fox']);
    expect(s.tap([fox], s.NEAR)).toBe('walk');
  });

  it('a spot that is not a character (a star, the cauldron) keeps the tap near it as before', () => {
    const s = scene();
    const star: Spot = { pos: new THREE.Vector3(0, 0, 0), r: 2, label: 'open', on: () => true, run: () => {} };
    expect(s.tap([star], s.PAST)).toBe('talk');
  });
});
