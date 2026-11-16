import * as THREE from 'three';
import { sfx } from '../core/audio';
import { input } from '../core/input';
import { tuning } from '../core/tuning';
import { el, setAct } from '../ui/ui';
import { createRipple } from './ripple';
import type { Key } from '../ui/strings';
import type { Game } from './context';
import type { WorldFrame } from './loop';

/** A place the heroine can do something at: the last one that fits wins (the world lists them in that order). */
export interface Spot { pos: THREE.Vector3; r: number; label: Key; on: () => boolean; run: () => void; }

export interface Player {
  readonly grounded: boolean;
  tap(canMove: boolean, spots: readonly Spot[], worldTap: WorldFrame['tap']): void;
  /** Returns the stick (or auto-walk) magnitude: the camera turns behind the heroine on it. */
  move(dt: number, canMove: boolean): number;
  prompt(canMove: boolean, spots: readonly Spot[]): void;
  fadeRing(dt: number): void;
}

/**
 * The heroine in the frame (ARCH-05): taps, walking, the jump, the action prompt and the ring where a tap landed.
 * `canMove` is the snapshot taken at the start of the frame; `g.busy` is read live, because `then` and `near.run()` may
 * start a scene (playScene -> take) in the middle of the frame.
 */
export function createPlayer(g: Game): Player {
  const { hero, cat, cam, camera, touch, groundY, started, speech } = g;
  let vy = 0, grounded = true;
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), ray = new THREE.Raycaster();
  const ripple = createRipple(g.scene);

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
          let spot: Spot | null = null;
          for (const s of spots) if (s.on() && screenDist(v2.copy(s.pos).setY(s.pos.y + 1)) < 90) spot = s;
          if (spot) g.auto = { x: spot.pos.x, z: spot.pos.z, then: spot.run, stuck: 0, last: 1e9 };
          // A tap on the cat asks it to say its line again, not to walk to it. (In the butterflies task the cat is out of the frame.)
          else if (screenDist(v2.copy(cat.root.position).setY(cat.root.position.y + 0.3)) < (touch ? 70 : 46)) speech.repeat();
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
        g.ground.resolve(hp, 0.4);
      } else if (cam.focus) hero.face(Math.atan2(cam.focus.x - hp.x, cam.focus.z - hp.z), dt, 5);
      if (input.jump && grounded && canMove) { vy = 6.4; grounded = false; sfx('jump'); }
      input.jump = false;
      const ground = groundY(hp.x, hp.z);
      vy -= 17 * dt; hp.y += vy * dt;
      if (hp.y <= ground) { hp.y = ground; vy = 0; grounded = true; }
      if (!g.busy) {
        if (!grounded) hero.play('Jump', 0.12);
        else if (mag > 0.08) hero.play(speed > tuning.runFrom ? 'Run' : 'Walk', 0.18, speed > tuning.runFrom ? speed / 4.2 : speed / 1.5);
        else hero.play('Idle', 0.25);
      }
      return mag;
    },
    // interaction prompt
    prompt: (canMove, spots) => {
      const hp = hero.root.position;
      let near: Spot | null = null;
      if (canMove) for (const s of spots) if (s.on() && Math.hypot(s.pos.x - hp.x, s.pos.z - hp.z) < s.r) near = s;
      setAct(near ? near.label : null);
      el.btnJump.classList.toggle('hidden', !canMove);
      if (input.act && near) near.run();
      input.act = false;
    },
    fadeRing: (dt) => ripple.update(dt),
  };
}
