import * as THREE from 'three';
import { pollInput } from '../core/input';
import type { Quality } from '../core/renderer';
import { uTime } from '../core/materials';
import { createCamera } from './camera';
import { createCompanion } from './companion';
import type { Game } from './context';
import { createGuide } from './guide';
import { createPlayer, type Spot } from './player';
import { tickPlayTime } from './playtime';

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

/**
 * The frame (ARCH-05). Its order is the game's behaviour: `canMove` is a snapshot of the start of the frame, while
 * `g.busy` and `g.started()` are read where they are used - a scene started by a tap or a spot in this frame holds
 * the rest of it at once.
 */
export function startLoop(g: Game, q: Quality, world: WorldFrame): void {
  const { hero, cat, sparks } = g;
  // The beacon and the trail before the tap ring: the order they always joined the scene in.
  const guide = createGuide(g);
  const player = createPlayer(g);
  const companion = createCompanion(g);
  const camera = createCamera(g, () => world.focusDist());
  const clock = new THREE.Clock();
  // The world's spots and the pets' (PLAY-09: the spot of the world's pet, without a change to the world), read anew
  // each frame into one list: a world may change its own. Without a pet's spot the world's list is used as it is.
  const spots: Spot[] = [];
  const allSpots = (): readonly Spot[] => {
    if (g.pets.spots.length === 0) return world.spots;
    spots.length = 0; spots.push(...world.spots, ...g.pets.spots);
    return spots;
  };

  function frame() {
    requestAnimationFrame(frame);
    const real = clock.getDelta(), dt = Math.min(real, 0.05);
    const time = (uTime.value += dt);
    // The minutes played (R33): the real time of a seen frame once the game is started, a long gap (the page came back
    // from hidden, the tab slept) counted as one second at most. The usual saving writes it, not this frame.
    tickPlayTime(g.save, Math.min(real, 1), g.started() && !document.hidden);
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
    world.update(dt, time, canMove);
    guide.update(time, g.started() && !g.busy ? world.goal() : null);
    player.fadeRing(dt);

    hero.update(dt); cat.update(dt);
    world.animate(dt, time);
    sparks.update(dt);

    camera.update(dt, time, mag);
    world.beforeRender(hp);

    q.render(dt);
    q.meter(dt, g.persist);
  }
  g.refreshHud();
  frame();
}
