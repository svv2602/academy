import * as THREE from 'three';
import type { Game } from './context';
import { CAT_PACE_MAX, GROUND, pace, speedometer } from './stride';

/** The cat in the frame (ARCH-05; the cat itself is made by createGame): it keeps to the heroine's side. */
export function createCompanion(g: Game): { update(dt: number): void } {
  const { hero, cat, groundY } = g;
  const v = new THREE.Vector3();
  const real = speedometer();   // the cat's speed over the ground as it is
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
        const cs = Math.min(7, cd * 3.2) * dt;
        cp.x += ((v.x - cp.x) / cd) * Math.min(cs, cd); cp.z += ((v.z - cp.z) / cd) * Math.min(cs, cd);
        const speed = real(cp.x, cp.z, dt);
        cat.face(Math.atan2(v.x - cp.x, v.z - cp.z), dt);
        // the pace by the speed it goes at (src/game/stride.ts); at the heroine's run it is held to CAT_PACE_MAX
        if (!g.busy) cat.play('Walk', 0.15, pace(speed, GROUND.catWalk, CAT_PACE_MAX));
      } else { real(cp.x, cp.z, dt); if (!g.busy) cat.play('Idle', 0.3); cat.face(hero.heading, dt, 4); }
      cp.y = groundY(cp.x, cp.z);
    },
  };
}
