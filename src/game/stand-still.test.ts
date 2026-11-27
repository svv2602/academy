// @vitest-environment happy-dom
/**
 * The controls taken while she runs (a task panel of a star, a conversation, a find): she stands and waits, she does not
 * run on the spot (./player.ts `move`), and what is held at that moment - a key, a finger on the joystick - does not
 * steer her once they are back (../core/input.ts `dropHeld`, called by the frame every frame the controls are taken).
 */
import * as THREE from 'three';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dropHeld, initInput, input, pollInput } from '../core/input';
import { tuning } from '../core/tuning';
import { Actor } from './actor';
import type { Game } from './context';
import { createPlayer } from './player';

vi.mock('../ui/ui', () => ({ el: { btnJump: { classList: { toggle: () => {} } } }, setAct: () => {} }));
vi.mock('../core/audio', () => ({ sfx: () => {} }));
vi.mock('./ripple', () => ({ createRipple: () => ({ play() {}, update() {} }) }));

const clip = (name: string) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]);
const DT = 1 / 60;

function makeGame() {
  const model = new THREE.Object3D(), root = new THREE.Group();
  root.add(model);
  const hero = new Actor({ root, model, clips: new Map(['Idle', 'Walk', 'Run', 'Jump', 'Talk'].map((n) => [n, clip(n)] as const)) });
  const g = {
    hero, cat: { root: new THREE.Object3D() }, cam: { yaw: 0, focus: null }, camera: new THREE.PerspectiveCamera(),
    touch: false, started: () => true, speech: { repeat() {} }, scene: new THREE.Scene(), busy: false, paused: false, auto: null,
    groundY: () => 0, ground: { resolve() {}, raycast: () => false }, world: { id: 'w' },
  } as unknown as Game;
  const player = createPlayer(g);
  /** One frame as src/game/loop.ts plays it: `canMove` is the snapshot of its start. */
  const frame = () => player.move(DT, g.started() && !g.busy && !g.paused);
  const frames = (n: number) => { for (let i = 0; i < n; i++) frame(); };
  return { g, hero, frame, frames };
}

describe('the controls taken while she runs: she stands in Idle', () => {
  beforeEach(() => { Object.assign(input, { moveX: 0, moveY: 0, jump: false, act: false, tap: null }); });

  it('running with the stick, a task panel opens (busy): the next frame she plays Idle and moves no more', () => {
    const p = makeGame();
    input.moveY = 1;
    p.frames(10);
    expect(p.hero.playing).toBe(tuning.speed > tuning.runFrom ? 'Run' : 'Walk');
    p.g.busy = true;                         // stage.take(): the stick is still pushed
    p.frame();
    expect(p.hero.playing).toBe('Idle');
    const at = p.hero.root.position.clone();
    p.frames(30);
    expect(p.hero.root.position.distanceTo(at)).toBe(0);
    expect(p.hero.playing).toBe('Idle');
  });

  it('walking to a spot by a tap (the star, a friend): the spot opens its task on arrival, she stands, the walk is over', () => {
    const p = makeGame();
    p.g.auto = { x: 0, z: -20, stuck: 0, last: 1e9 };
    p.frames(10);
    expect(['Run', 'Walk']).toContain(p.hero.playing);
    p.g.busy = true;
    p.frame();
    expect(p.hero.playing).toBe('Idle');
    expect(p.g.auto).toBeNull();
  });

  it('a clip the scene puts on her (Talk in a conversation) stays: the frame only takes back its own running', () => {
    const p = makeGame();
    input.moveY = 1;
    p.frames(5);
    p.g.busy = true;
    p.hero.play('Talk');                     // the conversation, in the same frame as it took the controls
    p.frames(20);
    expect(p.hero.playing).toBe('Talk');
  });

  it('taken in the air: she lands and then stands in Idle, not jumping or running on', () => {
    const p = makeGame();
    input.moveY = 1; input.jump = true;
    p.frames(3);
    expect(p.hero.playing).toBe('Jump');
    p.g.busy = true;
    p.frames(200);
    expect(p.hero.playing).toBe('Idle');
    expect(p.hero.root.position.y).toBe(0);
  });

  it('the controls back: with nothing pushed she stays in Idle, pushed again she runs', () => {
    const p = makeGame();
    input.moveY = 1;
    p.frames(5);
    p.g.busy = true;
    p.frames(5);
    p.g.busy = false;
    input.moveY = 0;
    p.frames(5);
    expect(p.hero.playing).toBe('Idle');
    input.moveY = 1;
    p.frames(5);
    expect(['Run', 'Walk']).toContain(p.hero.playing);
  });
});

describe('what is held when the controls are taken steers no more (dropHeld)', () => {
  const canvas = document.createElement('div'), joy = document.createElement('div'), knob = document.createElement('div');
  let pointer = 100;
  beforeAll(() => {
    (window as unknown as { ontouchstart: null }).ontouchstart = null;   // a touch screen: the left side steers
    canvas.setPointerCapture = () => {};
    document.body.append(canvas, joy, knob);
    initInput(canvas, joy, knob, document.createElement('button'), document.createElement('button'));
  });
  const key = (type: 'keydown' | 'keyup', code: string) => dispatchEvent(new KeyboardEvent(type, { code }));
  const ptr = (type: string, id: number, x: number, y: number) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y }));
  const left = () => innerWidth * tuning.joyZone / 2;

  it('a key held down through the panel does not move her after it: only a new press does', () => {
    key('keydown', 'KeyW');
    pollInput();
    expect(input.moveY).toBe(1);
    dropHeld();                              // the panel opens with W still down
    pollInput();
    expect(input.moveY).toBe(0);
    pollInput();                             // the panel closes, W is still down: the key repeats are no new press
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', repeat: true }));
    pollInput();
    expect(input.moveY).toBe(0);
    key('keyup', 'KeyW'); key('keydown', 'KeyW');
    pollInput();
    expect(input.moveY).toBe(1);
    key('keyup', 'KeyW');
    pollInput();
    expect(input.moveY).toBe(0);
  });

  it('a finger on the joystick through the panel steers no more, its ring goes; a new touch steers', () => {
    const id = ++pointer, x = left();
    ptr('pointerdown', id, x, 300);
    ptr('pointermove', id, x, 260);
    pollInput();
    expect(input.moveY).toBeGreaterThan(0.5);
    expect(joy.classList.contains('on')).toBe(true);
    dropHeld();
    pollInput();
    expect([input.moveX, input.moveY]).toEqual([0, 0]);
    expect(joy.classList.contains('on')).toBe(false);
    ptr('pointermove', id, x + 30, 250);     // the same finger, still down after the panel: nothing
    pollInput();
    expect([input.moveX, input.moveY]).toEqual([0, 0]);
    ptr('pointerup', id, x + 30, 250);
    const next = ++pointer;
    ptr('pointerdown', next, x, 300);
    ptr('pointermove', next, x, 260);
    pollInput();
    expect(input.moveY).toBeGreaterThan(0.5);
    ptr('pointerup', next, x, 260);
    pollInput();
  });

  it('a finger let go of whose lifting was never heard: the next touch on the joystick side steers all the same', () => {
    const id = ++pointer, x = left();
    ptr('pointerdown', id, x, 300);
    ptr('pointermove', id, x, 260);
    dropHeld();                              // no pointerup for it ever comes
    const next = ++pointer;
    ptr('pointerdown', next, x, 300);
    ptr('pointermove', next, x, 260);
    pollInput();
    expect(input.moveY).toBeGreaterThan(0.5);
    expect(joy.classList.contains('on')).toBe(true);
    ptr('pointerup', next, x, 260);
    pollInput();
  });

  it('a short press on the joystick side while the controls are taken is still a tap (a task in the world takes it)', () => {
    input.tap = null;
    const id = ++pointer, x = left();
    ptr('pointerdown', id, x, 300);
    dropHeld();
    ptr('pointerup', id, x, 300);
    expect(input.tap).toEqual({ x, y: 300 });
    input.tap = null;
  });
});
