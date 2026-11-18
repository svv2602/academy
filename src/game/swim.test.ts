import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { input } from '../core/input';
import { tuning } from '../core/tuning';
import { Actor } from './actor';
import type { Game } from './context';
import { GEAR, MODEL_IDS, createGear, type GearModels, type ModelId } from './gear';
import { SWIM_NAMES } from './hero';
import { createPlayer, swimming } from './player';
import type { Sparks } from './fx';

// The heroine in a water world (WorldDef.move): the world's clips lent and taken back, the one swap of names, the
// frame without gravity and jump, her wand and petals hidden in the water.

const jumpButton = vi.hoisted(() => ({ hidden: false }));
vi.mock('../ui/ui', () => ({
  el: { btnJump: { classList: { toggle: (_c: string, on: boolean) => { jumpButton.hidden = on; } } } },
  setAct: () => {},
}));
vi.mock('../core/audio', () => ({ sfx: () => {} }));
vi.mock('./ripple', () => ({ createRipple: () => ({ play() {}, update() {} }) }));

/** A clip of one bone: enough for a mixer to bind. */
const clip = (name: string) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]);

/** A character with the shared clips of the heroine (Idle, Walk, Run, Jump, Talk) and a record of the clip playing. */
function makeActor() {
  const model = new THREE.Object3D(), root = new THREE.Group();
  root.add(model);
  const clips = new Map(['Idle', 'Walk', 'Run', 'Jump', 'Talk', 'Wave'].map((n) => [n, clip(n)] as const));
  return new Actor({ root, model, clips });
}
const playing = (a: Actor) => (a as unknown as { current: string }).current;
const actionOf = (a: Actor, name: string) => (a as unknown as { actions: Map<string, THREE.AnimationAction> }).actions.get(name);
const worldClips = () => new Map([['Swim', clip('Swim_Fwd_Loop')], ['Float', clip('Swim_Idle_Loop')]]);

describe('the clips a world lends the heroine (Actor.lend)', () => {
  it('join her own and leave with the function it returns', () => {
    const a = makeActor();
    const lent = worldClips();
    const back = a.lend(lent);
    expect(a.has('Swim') && a.has('Float')).toBe(true);
    a.play('Swim');
    expect(playing(a)).toBe('Swim');
    expect(actionOf(a, 'Swim')!.isRunning()).toBe(true);
    const swim = actionOf(a, 'Swim')!;
    back();
    expect(a.has('Swim') || a.has('Float')).toBe(false);
    expect(swim.isRunning(), 'the clip of the world stops as it is taken back').toBe(false);
    expect(playing(a), 'nothing of the world is "playing" once it is gone').toBe('');
    expect(a.has('Idle') && a.has('Walk')).toBe(true);
    a.play('Idle');
    expect(playing(a)).toBe('Idle');
  });

  it('never replaces a clip she has', () => {
    const a = makeActor();
    expect(() => a.lend(new Map([['Idle', clip('Swim_Idle_Loop')]]))).toThrow(/Idle/);
    expect(actionOf(a, 'Idle')!.getClip().name).toBe('Idle');
  });

  it('can be lent again after they were taken back (a second entry into the world)', () => {
    const a = makeActor();
    a.lend(worldClips())();
    const again = worldClips();
    a.lend(again);
    expect(actionOf(a, 'Float')!.getClip()).toBe(again.get('Float'));
  });
});

describe('the one swap of names (Actor.rename, SWIM_NAMES)', () => {
  it('plays Idle as Float and Walk and Run as Swim; Talk and the rest as they are', () => {
    expect(SWIM_NAMES).toEqual({ Idle: 'Float', Walk: 'Swim', Run: 'Swim' });
    const a = makeActor();
    a.lend(worldClips());
    a.rename(SWIM_NAMES);
    a.play('Idle'); expect(playing(a)).toBe('Float');
    a.play('Walk'); expect(playing(a)).toBe('Swim');
    a.play('Run'); expect(playing(a)).toBe('Swim');
    a.play('Talk'); expect(playing(a)).toBe('Talk');
    a.once('Wave', 'Idle'); expect(playing(a)).toBe('Wave');
    a.pose('Idle'); expect(playing(a)).toBe('Float');
    a.once('Idle', 'Walk'); expect(playing(a)).toBe('Float');
  });

  it('plays a name as it is when the swapped clip is not there, or with no swap', () => {
    const a = makeActor();
    a.rename(SWIM_NAMES);
    a.play('Idle'); expect(playing(a), 'no Float lent: Idle').toBe('Idle');
    const back = a.lend(worldClips());
    a.play('Walk'); expect(playing(a)).toBe('Swim');
    a.rename(null);
    a.play('Walk'); expect(playing(a)).toBe('Walk');
    a.rename(SWIM_NAMES);
    back();
    a.play('Idle'); expect(playing(a), 'the world left: Idle again').toBe('Idle');
  });
});

/** The game as the frame of the heroine reads it: a flat ground at `floor`, the world's move. */
function makeGame(move?: { kind: 'swim'; height: number }, floor = 0.25) {
  const hero = makeActor();
  hero.lend(worldClips());
  const g = {
    hero, cat: { root: new THREE.Object3D() }, cam: { yaw: 0, focus: null }, camera: new THREE.PerspectiveCamera(),
    touch: false, started: () => true, speech: { repeat() {} }, scene: new THREE.Scene(), busy: false, paused: false, auto: null,
    groundY: () => floor, ground: { resolve() {}, raycast: () => false },
    world: { id: 'w', move },
  } as unknown as Game;
  hero.root.position.set(0, floor, 0);
  return { g, hero, player: createPlayer(g) };
}
/** `n` frames of 1/60 s; returns the heights of the heroine and the clips played, frame by frame. */
function frames(p: ReturnType<typeof makeGame>, n: number, canMove = true) {
  const ys: number[] = [], clips: string[] = [];
  for (let i = 0; i < n; i++) {
    p.player.move(1 / 60, canMove);
    p.player.prompt(canMove, []);
    ys.push(p.hero.root.position.y); clips.push(playing(p.hero));
  }
  return { ys, clips };
}

describe('the frame of the heroine in a water world (player.ts)', () => {
  beforeEach(() => { Object.assign(input, { moveX: 0, moveY: 0, jump: false, act: false, tap: null }); jumpButton.hidden = false; });

  it('knows the mode by the world played', () => {
    expect(swimming({ world: { id: 'w', move: { kind: 'swim', height: 1 } } } as unknown as Game)).toBe(true);
    expect(swimming({ world: { id: 'w' } } as unknown as Game)).toBe(false);
  });

  it('keeps her at the height above the ground: no gravity, the jump is not taken, no jump button', () => {
    const p = makeGame({ kind: 'swim', height: 0.6 });
    const still = frames(p, 30);
    for (const y of still.ys) expect(y).toBeCloseTo(0.85, 6);
    expect(still.clips.at(-1), 'standing in the water: Float').toBe('Float');
    expect(jumpButton.hidden).toBe(true);
    input.jump = true;
    const jumped = frames(p, 40);
    expect(Math.max(...jumped.ys)).toBeCloseTo(0.85, 6);
    expect(Math.min(...jumped.ys)).toBeCloseTo(0.85, 6);
    expect(jumped.clips).not.toContain('Jump');
    expect(p.player.grounded).toBe(true);
    expect(input.jump, 'the press is used up, not kept for the shore').toBe(false);
  });

  it('swims when she moves, at walking and at running speed', () => {
    const p = makeGame({ kind: 'swim', height: 0.6 });
    input.moveY = 0.3;
    const slow = frames(p, 10);
    expect(tuning.speed * 0.3).toBeLessThan(tuning.runFrom);
    expect(slow.clips.at(-1)).toBe('Swim');
    input.moveY = 1;
    expect(frames(p, 10).clips.at(-1)).toBe('Swim');
    for (const y of frames(p, 5).ys) expect(y).toBeCloseTo(0.85, 6);
    input.moveY = 0;
    expect(frames(p, 3).clips.at(-1)).toBe('Float');
  });

  it('a scene that plays Idle in the water plays Float (the swap is the heroine\'s own)', () => {
    const p = makeGame({ kind: 'swim', height: 0.6 });
    frames(p, 2);
    p.hero.play('Talk'); expect(playing(p.hero)).toBe('Talk');
    p.hero.play('Idle'); expect(playing(p.hero)).toBe('Float');
  });

  it('on the ground she walks and jumps as before: gravity, the Jump clip, the button shown', () => {
    const p = makeGame(undefined);
    const still = frames(p, 5);
    expect(still.clips.at(-1)).toBe('Idle');
    expect(jumpButton.hidden).toBe(false);
    input.jump = true;
    const { ys, clips } = frames(p, 90);
    expect(Math.max(...ys)).toBeGreaterThan(0.25 + 1);
    expect(ys.at(-1), 'and she lands').toBeCloseTo(0.25, 6);
    expect(clips).toContain('Jump');
    expect(clips.at(-1)).toBe('Idle');
    input.moveY = 0.3;
    expect(frames(p, 5).clips.at(-1)).toBe('Walk');
  });

  it('the swap ends with the water: in a world that walks Walk is Walk though Swim is still lent', () => {
    const p = makeGame(undefined);
    p.hero.rename(SWIM_NAMES);
    input.moveY = 0.3;
    expect(frames(p, 3).clips.at(-1)).toBe('Walk');
  });
});

/** The modelled items as loadGear hangs them (hidden), each a plain object; the butterfly with its two wings. */
function makeParts(): GearModels {
  const bone = new THREE.Bone();
  const parts = {} as Record<ModelId, { object: THREE.Object3D; bone: THREE.Bone }>;
  for (const id of MODEL_IDS) {
    const object = new THREE.Object3D();
    object.name = id;
    if (id === 'wings_butterfly') for (const n of ['wing_l', 'wing_r']) { const w = new THREE.Object3D(); w.name = n; object.add(w); }
    parts[id] = { object, bone };
  }
  return parts;
}
const sparks = { burst() {} } as unknown as Sparks;
const heroRig = () => ({ root: new THREE.Group(), model: new THREE.Object3D(), clips: new Map() });

describe('her items in the water (gear.ts)', () => {
  it('hides the wand and the petals while she swims and shows them again as she leaves the water', () => {
    let wet = false;
    const petals = [new THREE.Object3D(), new THREE.Object3D()];
    const parts = makeParts();
    const gear = createGear(heroRig(), parts, petals, sparks, () => wet);
    gear.set('wand', 'wand_star'); gear.set('head', 'wizard_hat');
    expect(parts.wand_star.object.visible && petals.every((p) => p.visible)).toBe(true);
    wet = true; gear.update(1, true);
    expect(parts.wand_star.object.visible).toBe(false);
    expect(petals.some((p) => p.visible)).toBe(false);
    expect(parts.wizard_hat.object.visible, 'the hat stays on').toBe(true);
    expect(gear.get('wand'), 'still worn, only hidden').toBe('wand_star');
    expect(gear.get('wings')).toBe('wings_petals');
    // Put on in the water (the shop, the save of the next world): worn, hidden.
    gear.set('wand', 'wand_moon');
    expect(parts.wand_moon.object.visible || parts.wand_star.object.visible).toBe(false);
    gear.set('wings', 'wings_butterfly');
    expect(parts.wings_butterfly.object.visible, 'the butterfly wings are as they are').toBe(true);
    gear.set('wings', 'wings_petals');
    expect(petals.some((p) => p.visible)).toBe(false);
    wet = false; gear.update(2, true);
    expect(parts.wand_moon.object.visible).toBe(true);
    expect(parts.wand_star.object.visible).toBe(false);
    expect(petals.every((p) => p.visible)).toBe(true);
  });

  it('made in the water, it never shows them; without `water` nothing is hidden', () => {
    const petals = [new THREE.Object3D()];
    const parts = makeParts();
    const gear = createGear(heroRig(), parts, petals, sparks, () => true);
    expect(petals[0].visible, 'the petals worn by default are hidden at once').toBe(false);
    gear.set('wand', 'wand_flower');
    gear.update(0, true);
    expect(parts.wand_flower.object.visible).toBe(false);
    const dry = createGear(heroRig(), makeParts(), [new THREE.Object3D()], sparks);
    dry.set('wand', 'wand_flower');
    expect(dry.parts.wand_flower.object.visible).toBe(true);
    expect(Object.values(GEAR).filter((x) => x.slot === 'wand').length).toBeGreaterThan(0);
  });
});
