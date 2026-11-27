import * as THREE from 'three';
import { sfx } from '../core/audio';
import { input } from '../core/input';
import { GRAVITY, tuning } from '../core/tuning';
import { el, setAct } from '../ui/ui';
import { catTap } from '../ui/welcome';
import { CAT_TAP_Y } from './companion';
import { SWIM_NAMES } from './hero';
import { createRipple } from './ripple';
import { GROUND, pace, speedometer } from './stride';
import type { Key } from '../ui/strings';
import type { Game } from './context';
import type { WorldFrame } from './loop';
import type { WorldGround } from './world';

/** A place the heroine can do something at: the last one that fits wins (the world lists them in that order). */
export interface Spot { pos: THREE.Vector3; r: number; label: Key; on: () => boolean; run: () => void; talker?: Talker }

/**
 * A character's spot of talk (`talkSpot`, src/game/talk-spot.ts): what a tap near it needs to know. A tap meant for the
 * path by a character must not walk her into a conversation (the customer's word of 2026-11-27): see `talkByTap`.
 */
export interface Talker {
  /** Its chain is finished: only a tap on its figure (or the action button) talks to it. */
  done(): boolean;
  /** m over its feet (`Spot.pos`) the figure reaches with its mark over the head: what a tap "on it" may hit. */
  top(): number;
}

export interface Player {
  readonly grounded: boolean;
  tap(canMove: boolean, spots: readonly Spot[], worldTap: WorldFrame['tap']): void;
  /** Returns the stick (or auto-walk) magnitude: the camera turns behind the heroine on it. */
  move(dt: number, canMove: boolean): number;
  prompt(canMove: boolean, spots: readonly Spot[]): void;
  fadeRing(dt: number): void;
}

/**
 * The ground under her feet: the relief, or the top of a support of the world she stands on (WorldGround.support) -
 * a world without supports is its relief alone, as it always was.
 */
export function groundUnder(ground: Pick<WorldGround, 'support'>, relief: number, x: number, z: number, feet: number): number {
  const top = ground.support?.(x, z, feet);
  return top !== undefined && top !== null && top > relief ? top : relief;
}

/**
 * A step of a jump: the height and the speed upwards after `dt` s under GRAVITY. The exact parabola, not a step of
 * Euler: the top of a jump is the same at 20 frames a second as at 60 (Euler lost 0.2 m of the 2.4 m of the jumping
 * potion at 20, enough to miss what hangs that high, PLAY-25).
 */
export function jumpStep(y: number, vy: number, dt: number): [number, number] {
  return [y + vy * dt - 0.5 * GRAVITY * dt * dt, vy - GRAVITY * dt];
}

/** m/s downwards: a landing at least this fast on a springy top bounces (stepping onto it does not). */
export const BOUNCE_FROM = 1;

/** The world played has the heroine swim (WorldDef.move): the one test of the mode, for the frame and for her items. */
export const swimming = (g: Pick<Game, 'world'>): boolean => g.world.move?.kind === 'swim';

/**
 * The heroine in the frame (ARCH-05): taps, walking, the jump, the action prompt and the ring where a tap landed.
 * `canMove` is the snapshot taken at the start of the frame; `g.busy` is read live, because `then` and `near.run()` may
 * start a scene (playScene -> take) in the middle of the frame.
 */
/** px on screen: a tap this near a spot (a metre over it) walks her there; this near the cat, by touch or mouse, is the cat's. */
export const SPOT_TAP_PX = 90, CAT_TAP_PX = { touch: 70, mouse: 46 } as const;
/**
 * The spots of a frame in the order they are weighed: where several are in reach (`prompt`) or under a tap (`tap`), the
 * later one wins. The pets' first - the treat by the follower walks with her, 1.1 m off, and would else take the button
 * of every spot she comes to (the cauldron, an arch, a friend) whenever she has a find it likes -, then the world's, then
 * the mysterious stars'. `out` is filled anew (no allocation per frame) and returned.
 */
/** The spot whose button shows with her at (x, z): the last in `spots` that is on and in reach (see `spotOrder`). */
export function spotInReach(spots: readonly Spot[], x: number, z: number): Spot | null {
  let near: Spot | null = null;
  for (const s of spots) if (s.on() && Math.hypot(s.pos.x - x, s.pos.z - z) < s.r) near = s;
  return near;
}

export function spotOrder(world: readonly Spot[], pets: readonly Spot[], mystery: readonly Spot[], out: Spot[] = []): Spot[] {
  out.length = 0;
  out.push(...pets, ...world, ...mystery);
  return out;
}

/**
 * What a tap takes (a world's own tap was asked before): the cat, when it is within its reach and nearer than the spot -
 * a spot that walks with her (the treat by the pet, PLAY-27) is always by the cat, and a tap meant for the cat must not
 * give a treat instead of "where we stopped"; else the spot within its reach; else the ground. Distances in px on screen.
 */
export function tapTarget(spotD: number | null, catD: number, touch: boolean): 'spot' | 'cat' | 'ground' {
  const cat = catD < (touch ? CAT_TAP_PX.touch : CAT_TAP_PX.mouse);
  if (cat && (spotD === null || catD <= spotD)) return 'cat';
  if (spotD !== null && spotD < SPOT_TAP_PX) return 'spot';
  return cat ? 'cat' : 'ground';
}

/**
 * Whether a tap at (tx, ty) lands on a figure seen on screen from its feet (fx, fy) to its top (hx, hy): no farther from
 * that line than `share` of its height on screen - the size the figure has on this screen at this distance, the same
 * share on a phone and on a 4K monitor (a fixed number of px is not).
 */
export function onFigure(tx: number, ty: number, fx: number, fy: number, hx: number, hy: number, share: number): boolean {
  const lx = hx - fx, ly = hy - fy, h2 = lx * lx + ly * ly;
  if (h2 < 1) return false;
  const t = Math.min(1, Math.max(0, ((tx - fx) * lx + (ty - fy) * ly) / h2));
  return Math.hypot(tx - (fx + t * lx), ty - (fy + t * ly)) <= share * Math.sqrt(h2);
}

/**
 * Whether a tap by a character walks her to it and opens their conversation (the customer's three rules, 2026-11-27):
 * - a tap on its figure always does (`hit`);
 * - near it but not on it (`nearPx`: within SPOT_TAP_PX), only while its chain has a step to give (not `done`), the
 *   point tapped on the ground no farther from it than `near` m - a tap "to it", not on the path past it -, and only
 *   when it is `armed`: after a talk it is not, till she has gone farther than `tuning.talkAgain` from it (`rearmed`).
 */
export function talkByTap(t: { hit: boolean; nearPx: boolean; done: boolean; armed: boolean; groundD: number | null }, near: number): boolean {
  if (t.hit) return true;
  if (t.done || !t.armed || !t.nearPx) return false;
  return t.groundD !== null && t.groundD <= near;
}

/** Whether a character talked to is ready for a tap near it again: she is farther than `again` m from it. */
export function rearmed(d: number, again: number): boolean {
  return d > again;
}

export function createPlayer(g: Game): Player {
  const { hero, cat, cam, camera, touch, groundY, started } = g;
  let vy = 0, grounded = true;
  // The clip this frame itself last put on her (Run, Walk, Jump, Idle): what a scene plays on her is the scene's own.
  let mine = '';
  const real = speedometer();   // her speed over the ground as it is (a wall stops her, the pace too)
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), ray = new THREE.Raycaster();
  /** The point `up` m over `p` on screen, in px; null behind the camera. */
  const screenPoint = (p: THREE.Vector3, up: number) => { v4.copy(p).setY(p.y + up).project(camera); return v4.z < 1 ? { x: (v4.x * 0.5 + 0.5) * innerWidth, y: (-v4.y * 0.5 + 0.5) * innerHeight } : null; };
  const ripple = createRipple(g.scene);
  // the characters talked to and not walked away from yet (`talkByTap`, `rearmed`)
  const talked = new Set<Spot>();
  const run = (s: Spot) => { if (s.talker) talked.add(s); s.run(); };

  return {
    get grounded() { return grounded; },
    // taps: the world's own (a butterfly to count), or walk to a spot / point on the ground
    tap: (canMove, spots, worldTap) => {
      if (input.tap && started() && !g.paused) {
        const tx = input.tap.x, ty = input.tap.y;
        const screenDist = (p: THREE.Vector3) => { v.copy(p).project(camera); return v.z < 1 ? Math.hypot((v.x * 0.5 + 0.5) * innerWidth - tx, (-v.y * 0.5 + 0.5) * innerHeight - ty) : 1e9; };
        // A task of the world on screen takes every tap, even one that hits nothing: the heroine does not walk off.
        if (worldTap(screenDist)) { /* taken by the world */ }
        else if (canMove) {
          // the point of the ground under the tap, asked once and only when a character near it needs it
          let ground: THREE.Vector3 | null | undefined;
          const groundAt = () => {
            if (ground === undefined) { ray.setFromCamera(new THREE.Vector2((tx / innerWidth) * 2 - 1, -(ty / innerHeight) * 2 + 1), camera); ground = g.ground.raycast(ray.ray.origin, ray.ray.direction, v3) ? v3 : null; }
            return ground;
          };
          let spot: Spot | null = null, spotD = Infinity;
          for (const s of spots) {
            if (!s.on()) continue;
            const d = screenDist(v2.copy(s.pos).setY(s.pos.y + 1));
            if (s.talker) {
              const feet = screenPoint(s.pos, 0), top = screenPoint(s.pos, s.talker.top());
              const hit = !!feet && !!top && onFigure(tx, ty, feet.x, feet.y, top.x, top.y, tuning.talkFigure);
              const gp = hit ? null : groundAt();
              if (!talkByTap({ hit, nearPx: d < SPOT_TAP_PX, done: s.talker.done(), armed: !talked.has(s), groundD: gp ? Math.hypot(gp.x - s.pos.x, gp.z - s.pos.z) : null }, tuning.talkNear)) continue;
              spot = s; spotD = Math.min(d, SPOT_TAP_PX - 1);
            } else if (d < SPOT_TAP_PX) { spot = s; spotD = d; }
          }
          const to = tapTarget(spot ? spotD : null, screenDist(v2.copy(cat.root.position).setY(cat.root.position.y + CAT_TAP_Y)), touch);
          if (to === 'spot' && spot) { const s = spot; g.auto = { x: s.pos.x, z: s.pos.z, then: () => run(s), stuck: 0, last: 1e9 }; }
          // A tap on the cat asks it to say its line again - or, with the bubble empty, where we stopped (PLAY-21) -,
          // not to walk to it. (In the butterflies task the cat is out of the frame.)
          else if (to === 'cat') catTap(g);
          else {
            ray.setFromCamera(new THREE.Vector2((tx / innerWidth) * 2 - 1, -(ty / innerHeight) * 2 + 1), camera);
            if (g.ground.raycast(ray.ray.origin, ray.ray.direction, v)) {
              g.auto = { x: v.x, z: v.z, stuck: 0, last: 1e9 };
              ripple.play(v);
            }
          }
        }
      }
      input.tap = null;
    },
    move: (dt, canMove) => {
      const hp = hero.root.position;
      let mx = 0, mz = 0, mag = 0;
      if (canMove) {
        mag = Math.hypot(input.moveX, input.moveY);
        if (mag > 0.08) {
          g.auto = null;
          const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
          mx = fx * input.moveY + -fz * input.moveX;
          mz = fz * input.moveY + fx * input.moveX;
        } else if (g.auto) {
          const dx = g.auto.x - hp.x, dz = g.auto.z - hp.z, d = Math.hypot(dx, dz);
          const reach = g.auto.then ? 2.0 : 0.35;
          g.auto.stuck = d > g.auto.last - 0.5 * dt ? g.auto.stuck + dt : 0;
          g.auto.last = d;
          if (d < reach || g.auto.stuck > 0.8) { const then = d < reach + 0.8 ? g.auto.then : undefined; g.auto = null; then?.(); }
          else { mx = dx / d; mz = dz / d; mag = Math.min(1, d / 1.5 + 0.35); }
        }
      } else g.auto = null;

      const speed = tuning.speed * Math.min(1, mag);
      if (mag > 0.08) {
        const l = Math.hypot(mx, mz) || 1;
        hp.x += (mx / l) * speed * dt; hp.z += (mz / l) * speed * dt;
        hero.face(Math.atan2(mx, mz), dt);
        // her radius grows and shrinks with her (the funny potion, src/game/supplies.ts)
        g.ground.resolve(hp, 0.4 * hero.root.scale.x);
      } else if (cam.focus) hero.face(Math.atan2(cam.focus.x - hp.x, cam.focus.z - hp.z), dt, 5);
      const ground = groundUnder(g.ground, groundY(hp.x, hp.z), hp.x, hp.z, hp.y);
      // In the water (WorldDef.move): no gravity and no jump, she keeps her height above the ground; standing, walking
      // and running are played by the swimming clips (the swap is the heroine's own, Actor.rename).
      const swim = swimming(g);
      hero.rename(swim ? SWIM_NAMES : null);
      if (swim) { vy = 0; grounded = true; hp.y = ground + g.world.move!.height; }
      else {
        if (input.jump && grounded && canMove) { vy = tuning.jump; grounded = false; sfx('jump'); }
        [hp.y, vy] = jumpStep(hp.y, vy, dt);
        if (hp.y <= ground) {
          // landing on a springy top (WorldGround.bounce) from a jump or a fall throws her up again
          const spring = vy < -BOUNCE_FROM ? g.ground.bounce?.(hp.x, hp.z) ?? null : null;
          hp.y = ground;
          if (spring) { vy = spring; grounded = false; sfx('jump'); } else { vy = 0; grounded = true; }
        }
      }
      input.jump = false;
      const v = real(hp.x, hp.z, dt);
      if (!g.busy) {
        if (!grounded) hero.play('Jump', 0.12);
        // the clip by the speed asked for, its pace by the speed she goes at (src/game/stride.ts)
        else if (mag > 0.08) hero.play(speed > tuning.runFrom ? 'Run' : 'Walk', 0.18, pace(v, speed > tuning.runFrom ? GROUND.heroRun : GROUND.heroWalk));
        else hero.play('Idle', 0.25);
        mine = hero.playing;
      } else if (grounded && mine && hero.playing === mine) {
        // A task panel, a conversation or a find took the controls while she ran: she stands and waits (as the cat
        // does, src/game/companion.ts), not running on the spot. A clip the scene put on her (Talk, Dance) is left alone.
        hero.play('Idle', 0.25);
        mine = '';
      }
      return mag;
    },
    // interaction prompt
    prompt: (canMove, spots) => {
      const hp = hero.root.position;
      for (const s of talked) if (rearmed(Math.hypot(s.pos.x - hp.x, s.pos.z - hp.z), tuning.talkAgain)) talked.delete(s);
      const near = canMove ? spotInReach(spots, hp.x, hp.z) : null;
      setAct(near ? near.label : null);
      el.btnJump.classList.toggle('hidden', !canMove || swimming(g));
      if (input.act && near) run(near);
      input.act = false;
    },
    fadeRing: (dt) => ripple.update(dt),
  };
}
