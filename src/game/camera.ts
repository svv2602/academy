import * as THREE from 'three';
import { input } from '../core/input';
import { camDistance, tuning } from '../core/tuning';
import { angleDiff, clamp, damp, lerp } from '../core/util';
import type { Game } from './context';
import { flyoverOf } from './flyover';

/**
 * The camera (ARCH-05): turned by a drag, then the dressing room on the start screen, a conversation/task framing or the
 * orbit behind the heroine. `focusDist` is the world's distance for a framed scene (a task in the world wants more room).
 * The tour of the world (src/game/flyover.ts) takes the camera over while it runs and hands it back smoothly after.
 */
export function createCamera(g: Game, focusDist: () => number): { look(): void; update(dt: number, time: number, mag: number): void } {
  const { hero, cam, camera, groundY, started } = g;
  let userPitch = 0.36;             // set by dragging up/down
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), fp = new THREE.Vector3(), fl = new THREE.Vector3();
  return {
    look: () => {
      cam.yaw -= input.lookDX * tuning.lookX; input.lookDX = 0;
      userPitch = clamp(userPitch + input.lookDY * tuning.lookY, 0.06, 1.15); input.lookDY = 0;
    },
    update: (dt, time, mag) => {
      const hp = hero.root.position;
      if (!cam.focus && mag > 0.3 && !input.touch) cam.yaw += clamp(angleDiff(hero.heading + Math.PI, cam.yaw), -1, 1) * 0.5 * dt * (Math.abs(angleDiff(hero.heading + Math.PI, cam.yaw)) < 2.3 ? 1 : 0);
      if (!started()) {
        const wide = camera.aspect > 1.25;
        cam.yaw = Math.PI + 0.3 + Math.sin(time * 0.4) * 0.12;
        v.set(hp.x - Math.cos(cam.yaw) * (wide ? 1.0 : 0), hp.y + (wide ? 0.95 : 1.9), hp.z + Math.sin(cam.yaw) * (wide ? 1.0 : 0));
        cam.target.copy(v); cam.dist = wide ? 3.6 : 5.2; cam.pitch = 0.12;
      } else {
        const t = g.camTask;
        if (t) {
          // a task in the world (src/game/worldtasks/core.ts): its own frame, looked at from above as a table; glided to
          v.copy(t.target); cam.yaw += angleDiff(t.yaw, cam.yaw) * damp(3, dt);
        } else if (cam.focus) { v.copy(cam.focus).lerp(v2.copy(hp).setY(hp.y + 1.2), 0.3); cam.yaw += angleDiff(Math.atan2(hp.x - cam.focus.x, hp.z - cam.focus.z) + 0.5, cam.yaw) * damp(2, dt); }
        else v.set(hp.x, hp.y + 1.5 * hero.root.scale.y, hp.z);   // a tiny or a giant heroine (src/game/supplies.ts): her height
        cam.target.lerp(v, damp(t || cam.focus ? 3 : 9, dt));
        cam.dist = lerp(cam.dist, t ? t.dist : g.camOverride ?? (cam.focus ? focusDist() : camDistance(camera.aspect)), damp(3, dt));
        cam.pitch = lerp(cam.pitch, t ? t.pitch : cam.focus ? 0.3 : userPitch, damp(t || cam.focus ? 3 : 10, dt));
      }
      camera.position.set(
        cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
        cam.target.y + Math.sin(cam.pitch) * cam.dist,
        cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
      camera.position.y = Math.max(camera.position.y, groundY(camera.position.x, camera.position.z) + 0.8);
      // The tour: its camera wins while it runs, then gives way to the one behind the heroine within a second.
      const fly = flyoverOf(g);
      fly?.update(dt);
      const w = fly ? fly.weight() : 0;
      if (fly && w > 0) {
        fly.pose(fp, fl);
        camera.position.lerp(fp, w);
        camera.position.y = Math.max(camera.position.y, groundY(camera.position.x, camera.position.z) + 0.8);
        camera.lookAt(fl.lerp(cam.target, 1 - w));
      } else camera.lookAt(cam.target);
    },
  };
}
