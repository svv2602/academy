import * as THREE from 'three';
import { clamp } from '../core/util';
import type { Game } from './context';

/** The cat in the frame (ARCH-05; the cat itself is made by createGame): it keeps to the heroine's side. */
export function createCompanion(g: Game): { update(dt: number): void } {
  const { hero, cat, groundY } = g;
  const v = new THREE.Vector3();
  return {
    update: (dt) => {
      const hp = hero.root.position, cp = cat.root.position;
      v.set(hp.x + Math.cos(hero.heading) * 0.9 - Math.sin(hero.heading) * 0.6, 0, hp.z - Math.sin(hero.heading) * 0.9 - Math.cos(hero.heading) * 0.6);
      const cd = Math.hypot(v.x - cp.x, v.z - cp.z);
      // g.busy is read live: a scene started earlier in this frame already holds the cat's clips.
      if (cd > 0.45) {
        const cs = Math.min(7, cd * 3.2) * dt;
        cp.x += ((v.x - cp.x) / cd) * Math.min(cs, cd); cp.z += ((v.z - cp.z) / cd) * Math.min(cs, cd);
        cat.face(Math.atan2(v.x - cp.x, v.z - cp.z), dt);
        if (!g.busy) cat.play('Walk', 0.15, clamp(cd * 1.2, 0.8, 2.2));
      } else { if (!g.busy) cat.play('Idle', 0.3); cat.face(hero.heading, dt, 4); }
      cp.y = groundY(cp.x, cp.z);
    },
  };
}
