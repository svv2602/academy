import * as THREE from 'three';
import { pollInput } from '../core/input';
import type { Quality } from '../core/renderer';
import { seeThrough, uTime } from '../core/materials';
import { createCamera } from './camera';
import { createCompanion } from './companion';
import type { Game } from './context';
import { createGuide } from './guide';
import { createPlayer, type Spot } from './player';
import { tickPlayTime } from './playtime';
import { tickSession } from './session';
import { storyOf } from './story';
import { suppliesOf } from './supplyfx';

/**
 * The seam between the frame and the world (ARCH-05): the world's own parts of a frame, called at fixed places in it.
 * Every member is an arrow (or a plain function) - the loop calls them detached from any object.
 */
export interface WorldFrame {
  spots: readonly Spot[];
  /** A tap while a task of the world is on screen: true when the world takes it (even with nothing hit). */
  tap(dist: (p: THREE.Vector3) => number): boolean;
  afterMove(time: number, grounded: boolean): void;
  /** The world's own things (its characters, what lies about to collect, its finale), in the world's order. */
  update(dt: number, time: number, canMove: boolean): void;
  goal(): THREE.Vector3 | null;
  animate(dt: number, time: number): void;
  focusDist(): number;
  beforeRender(hp: THREE.Vector3): void;
}

/** The frame loop once made (TECH-15): started apart from its making, and its world's parts can be swapped. */
export interface Loop {
  /** The first frame, and every next one by itself. Once. */
  run(): void;
  /** The world's parts of the frame from the next frame on (a change of world, src/game/travel.ts). */
  setWorld(frame: WorldFrame): void;
  /** Settles when the next frame has been drawn to its end. */
  drawn(): Promise<void>;
}

/**
 * The frame (ARCH-05). Its order is the game's behaviour: `canMove` is a snapshot of the start of the frame, while
 * `g.busy` and `g.started()` are read where they are used - a scene started by a tap or a spot in this frame holds
 * the rest of it at once.
 *
 * TECH-15: the parts every world is played with (the guide, the heroine in the frame with her tap ring, the cat, the
 * camera) are made here, once for the session - call it inside `scope.shared()`, so they are not the world's. Nothing
 * is drawn yet: `run()` plays the first frame, outside `shared()` - what a world adds to the scene in a frame is its own.
 * `world` is the frame of the world played first.
 */
export function startLoop(g: Game, q: Quality, world: WorldFrame): Loop {
  const { hero, cat, sparks } = g;
  // The beacon and the trail before the tap ring: the order they always joined the scene in.
  const guide = createGuide(g);
  const player = createPlayer(g);
  const companion = createCompanion(g);
  const camera = createCamera(g, () => world.focusDist());
  const clock = new THREE.Clock();
  const middle = new THREE.Vector3();
  // The world's spots and the pets' (PLAY-09: the spot of the world's pet, without a change to the world), read anew
  // each frame into one list: a world may change its own. Without a pet's spot the world's list is used as it is.
  const spots: Spot[] = [];
  const allSpots = (): readonly Spot[] => {
    if (g.pets.spots.length === 0 && g.mystery.spots.length === 0) return world.spots;
    spots.length = 0; spots.push(...world.spots, ...g.pets.spots, ...g.mystery.spots);
    return spots;
  };
  const waiting: (() => void)[] = [];

  function frame() {
    requestAnimationFrame(frame);
    const real = clock.getDelta(), dt = g.still ? 0 : Math.min(real, 0.05);
    const time = (uTime.value += dt);
    // The minutes played (R33): the real time of a seen frame once the game is started, a long gap (the page came back
    // from hidden, the tab slept) counted as one second at most. The usual saving writes it, not this frame.
    tickPlayTime(g.save, Math.min(real, 1), g.started() && !document.hidden);
    tickSession(g.save, Math.min(real, 1), g.started() && !document.hidden);   // PLAY-20, R56: the minutes of the session
    pollInput();
    const hp = hero.root.position;
    const canMove = g.started() && !g.busy && !g.paused;

    camera.look();
    const here = allSpots();
    player.tap(canMove, here, world.tap);
    const mag = player.move(dt, canMove);
    world.afterMove(time, player.grounded);
    player.prompt(canMove, here);
    companion.update(dt);
    g.pets.update(dt);
    g.mystery.update(time, canMove);
    world.update(dt, time, canMove);
    suppliesOf(g)?.update(dt, time, canMove);   // the potions: their time runs while she can walk (src/game/supplyfx.ts)
    guide.update(time, g.started() && !g.busy ? world.goal() : null);
    player.fadeRing(dt);

    hero.update(dt); cat.update(dt);
    world.animate(dt, time);
    sparks.update(dt);

    camera.update(dt, time, mag);
    world.beforeRender(hp);
    // the scenery between the camera and the heroine's middle dissolves (src/core/materials.ts SEE_THROUGH)
    g.camera.updateMatrixWorld();
    seeThrough(g.camera, middle.copy(hp).setY(hp.y + 0.7 * hero.root.scale.y));

    // A cut-scene covers the whole screen with its own canvas (./story.ts): the world under it is neither drawn nor
    // measured - drawing both lost frames on the S22, and the quality would be judged by the scene's frames.
    if (storyOf(g)?.active !== true) {
      q.render(dt);
      q.meter(dt, g.persist);
    }
    for (const done of waiting.splice(0)) done();
  }
  return {
    run: () => { g.refreshHud(); frame(); },
    setWorld: (next) => { world = next; },
    drawn: () => new Promise<void>((done) => { waiting.push(done); }),
  };
}
