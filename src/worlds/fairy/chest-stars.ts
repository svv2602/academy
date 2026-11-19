import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { Actor, shadowFromBody } from '../../game/actor';
import type { Game } from '../../game/context';
import { CHEST } from './layout';
import type { FairyLoads } from './load';

export interface ChestStars {
  /** The secret chest behind the birches. */
  readonly chest: Actor;
  /** The chest's spot: it opens once and gives its reward. */
  open(): void;
  /** The stars on the ground: they turn and bob; one is taken when the heroine, free to move, walks into it. */
  update(time: number, canMove: boolean): void;
  /** The chest's animation, with the rest of the world's. */
  animate(dt: number): void;
}

/**
 * The chest and the stars on the ground (ARCH-05). The chest's collider goes in first, after the characters' ones:
 * the stars are placed clear of every collider there is by then.
 */
export function createChestStars(g: Game, L: FairyLoads, starMat: THREE.Material): ChestStars {
  const { scene, ws, ground, groundY, above } = g;
  const { line } = g.speech;
  ground.block(CHEST.x, CHEST.z, 0.6);

  // ----- chest, stars -----
  const chest = new Actor(L.chestRig);
  shadowFromBody(chest.root);
  chest.root.position.set(CHEST.x, groundY(CHEST.x, CHEST.z), CHEST.z);
  chest.root.rotation.y = 0.9;
  scene.add(chest.root);
  if (ws.flags.chest) chest.pose('Chest_Open');
  const starSpots: [number, number][] = [[-6.5, -1], [10, 9], [18, -4], [-17, -14], [7, -31], [-26, 11], [26, -30], [-2, -40]];
  // one instanced mesh draws all of them in one call (docs/perf.md); a star taken is scaled to nothing
  const stars = new THREE.InstancedMesh(L.starGeo, starMat, starSpots.length);
  stars.frustumCulled = false;   // they bob and spin across the valley: a handful of small stars, culling would cost more
  scene.add(stars);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), none = new THREE.Vector3();
  const groundStars = starSpots.map(([x, z], id) => {
    const p = { x, z }; ground.resolve(p, 0.6);
    return { id, pos: new THREE.Vector3(p.x, groundY(p.x, p.z) + 1.0, p.z), taken: ws.starsTaken.includes(id) };
  });
  const place = (time: number) => {
    for (const s of groundStars) {
      if (s.taken) { stars.setMatrixAt(s.id, m4.compose(s.pos, q.identity(), none)); continue; }
      s.pos.y = groundY(s.pos.x, s.pos.z) + 1 + Math.sin(time * 2 + s.id) * 0.15;
      stars.setMatrixAt(s.id, m4.compose(s.pos, q.setFromAxisAngle(up, time * 1.6), one));
    }
    stars.instanceMatrix.needsUpdate = true;
  };
  place(0);

  function openChest() {
    ws.flags.chest = true;
    chest.once('Chest_Open', 'Chest_Open');
    sfx('good');
    g.addStars(5, above(chest.root.position, 1));
    void line('chest', 'hint', 4000);
  }

  return {
    chest,
    open: openChest,
    update: (time, canMove) => {
      const hp = g.hero.root.position;
      place(time);
      for (const s of groundStars) {
        if (s.taken) continue;
        if (canMove && Math.hypot(s.pos.x - hp.x, s.pos.z - hp.z) < 1.2) { s.taken = true; ws.starsTaken.push(s.id); g.addStars(1, s.pos.clone()); }
      }
    },
    animate: (dt) => { chest.update(dt); },
  };
}
