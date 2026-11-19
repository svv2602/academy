import * as THREE from 'three';
import type { Game } from './context';
import { CAT_RUN_MAX, CAT_WALK_BACK, CAT_WALK_MAX, GROUND, followSpeed, pace, paceFollower, speedometer } from './stride';

/** The cat's height, m (the model is scaled to it; the customer chose 0.75 for the Meshy cat on 2026-11-19). */
export const CAT_HEIGHT = 0.75;
/** Where a tap on the cat aims, m over its feet: the middle of its body (src/game/player.ts, tools/shot.mjs). */
export const CAT_TAP_Y = 0.35;

/** The cat in the frame (ARCH-05; the cat itself is made by createGame): it keeps to the heroine's side. */
export function createCompanion(g: Game): { update(dt: number): void } {
  const { hero, cat, groundY } = g;
  const v = new THREE.Vector3();
  const real = speedometer();   // the cat's speed over the ground as it is
  const steps = paceFollower();  // its pace, smoothed in time
  let running = false, moving = '';   // the walking clip it plays now
  return {
    update: (dt) => {
      const hp = hero.root.position, cp = cat.root.position;
      // beside the heroine; during a task in the world, at the place its frame gives (off the task, src/game/worldtasks/core.ts)
      const at = g.camTask?.catAt;
      if (at) v.set(at.x, 0, at.z);
      else v.set(hp.x + Math.cos(hero.heading) * 0.9 - Math.sin(hero.heading) * 0.6, 0, hp.z - Math.sin(hero.heading) * 0.9 - Math.cos(hero.heading) * 0.6);
      const cd = Math.hypot(v.x - cp.x, v.z - cp.z);
      // g.busy is read live: a scene started earlier in this frame already holds the cat's clips.
      if (cd > 0.45) {
        const cs = followSpeed(cd) * dt;
        cp.x += ((v.x - cp.x) / cd) * Math.min(cs, cd); cp.z += ((v.z - cp.z) / cd) * Math.min(cs, cd);
        const speed = real(cp.x, cp.z, dt);
        cat.face(Math.atan2(v.x - cp.x, v.z - cp.z), dt, 8);
        // as the pet (src/game/pets.ts): the clip by the speed it is going to, running above a walking pace of
        // CAT_WALK_MAX and walking again only below CAT_WALK_BACK; the pace by the speed it goes at, smoothed in time
        running = Math.max(speed, followSpeed(cd)) / GROUND.catWalk > (running ? CAT_WALK_BACK : CAT_WALK_MAX);
        const [clip, target] = running ? ['Run', pace(speed, GROUND.catRun, CAT_RUN_MAX)] : ['Walk', pace(speed, GROUND.catWalk, CAT_WALK_MAX)];
        if (!g.busy) { cat.play(clip, 0.3, moving !== clip ? steps.reset(target) : steps.next(target, dt)); moving = clip; }
      } else {
        real(cp.x, cp.z, dt); running = false;
        if (!g.busy) { cat.play('Idle', 0.3); moving = ''; }
        cat.face(hero.heading, dt, 4);
      }
      if (g.busy) moving = '';
      cp.y = groundY(cp.x, cp.z);
    },
  };
}
