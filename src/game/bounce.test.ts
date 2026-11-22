/** A springy top (WorldGround.bounce, the forest's mushroom trampoline): landing on it throws her up again. */
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { input } from '../core/input';
import { GRAVITY, tuning } from '../core/tuning';
import { Actor } from './actor';
import type { Game } from './context';
import { BOUNCE_FROM, createPlayer } from './player';

vi.mock('../ui/ui', () => ({ el: { btnJump: { classList: { toggle: () => {} } } }, setAct: () => {} }));
vi.mock('../core/audio', () => ({ sfx: () => {} }));
vi.mock('./ripple', () => ({ createRipple: () => ({ play() {}, update() {} }) }));

const clip = (name: string) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]);
const SPRING = 10, CAP = 0.7;

/** A flat ground with a cap of CAP m round (0, 0), r 1 m: a support, and springy unless `springy` is false. */
function makeGame(springy = true) {
  const model = new THREE.Object3D(), root = new THREE.Group();
  root.add(model);
  const hero = new Actor({ root, model, clips: new Map(['Idle', 'Walk', 'Run', 'Jump'].map((n) => [n, clip(n)] as const)) });
  const on = (x: number, z: number) => Math.hypot(x, z) <= 1;
  const g = {
    hero, cat: { root: new THREE.Object3D() }, cam: { yaw: 0, focus: null }, camera: new THREE.PerspectiveCamera(),
    touch: false, started: () => true, speech: { repeat() {} }, scene: new THREE.Scene(), busy: false, paused: false, auto: null,
    groundY: () => 0,
    ground: {
      resolve() {}, raycast: () => false,
      support: (x: number, z: number, feet: number) => (on(x, z) && feet >= CAP - 0.9 ? CAP : null),
      ...(springy ? { bounce: (x: number, z: number) => (on(x, z) ? SPRING : null) } : {}),
    },
    world: { id: 'w' },
  } as unknown as Game;
  hero.root.position.set(0, CAP, 0);
  return { hero, player: createPlayer(g) };
}
function heights(p: ReturnType<typeof makeGame>, n: number) {
  const ys: number[] = [];
  for (let i = 0; i < n; i++) { p.player.move(1 / 60, true); ys.push(p.hero.root.position.y); }
  return ys;
}

describe('a springy top (WorldGround.bounce)', () => {
  beforeEach(() => { Object.assign(input, { moveX: 0, moveY: 0, jump: false, act: false, tap: null }); });

  it('standing on it does nothing; a jump that lands on it throws her up to its spring\'s height, again and again', () => {
    const p = makeGame();
    expect(Math.max(...heights(p, 30))).toBeCloseTo(CAP, 6);
    expect(p.player.grounded).toBe(true);
    input.jump = true;
    const ys = heights(p, 400);
    const top = CAP + (SPRING * SPRING) / (2 * GRAVITY);
    // her own jump first, then the spring's, higher than her jump
    expect(Math.max(...ys)).toBeGreaterThan(CAP + (tuning.jump * tuning.jump) / (2 * GRAVITY) + 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(top + 0.05);
    expect(Math.max(...ys.slice(-150))).toBeGreaterThan(top - 0.3);
    expect(BOUNCE_FROM).toBeGreaterThan(0);
  });

  it('a top that is not springy: she lands and stands', () => {
    const p = makeGame(false);
    input.jump = true;
    const ys = heights(p, 200);
    expect(ys.at(-1)).toBeCloseTo(CAP, 6);
    expect(p.player.grounded).toBe(true);
  });
});
