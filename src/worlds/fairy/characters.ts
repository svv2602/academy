import * as THREE from 'three';
import { tint } from '../../core/assets';
import { Actor } from '../../game/actor';
import type { Game } from '../../game/context';
import { QUESTS, type QuestDef } from '../../game/quests';
import type { FairyLoads } from './load';

export interface Npc { def: QuestDef; actor: Actor; pos: THREE.Vector3; mark: THREE.Mesh; idle: string; timer: number; }

export interface Characters {
  /** The quest characters in the order of QUESTS; the same array for the whole game (window.__game reads it). */
  readonly npcs: Npc[];
  npc(id: QuestDef['id']): Npc;
  /** The gold of the marks over the characters, shared by every star of the world. */
  readonly starMat: THREE.MeshStandardMaterial;
  /** After the heroine has moved: her wings beat fast in the air, the queen's slowly. */
  wings(time: number, grounded: boolean): void;
  /** The characters, their marks, the unicorn's horn and the queen's crown. */
  update(dt: number, time: number): void;
}

/**
 * The heroine's wings and the quest characters (ARCH-05). `searching` is read in every frame: while the stars are
 * searched for, the deer's mark is hidden.
 */
export function createCharacters(g: Game, L: FairyLoads, searching: () => boolean): Characters {
  const { scene, hero, ws, ground, groundY } = g;
  const { uniRig, foxRig, kingRig, deerRig, queenRig, starGeo } = L;
  // Fairy wings: two translucent petals behind the shoulders.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.15, 0.5, 0.75, 0.62, 0.72, 0.2); wingShape.bezierCurveTo(0.7, -0.02, 0.3, -0.05, 0.12, -0.02);
  wingShape.bezierCurveTo(0.5, -0.2, 0.5, -0.55, 0.28, -0.5); wingShape.bezierCurveTo(0.1, -0.45, 0.02, -0.2, 0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 8);
  const addWings = (to: THREE.Object3D, color: string, y: number, size: number) => [1, -1].map((side) => {
    const mesh = new THREE.Mesh(wingGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    mesh.scale.set(side * size, size, size); mesh.position.set(0, y, -0.13);
    to.add(mesh);
    return { mesh, side };
  });
  const wings = addWings(hero.root, '#d8f6ff', 1.08, 0.8);

  // ----- quest characters -----
  tint(uniRig.model, { Main: '#ffffff', Main_Light: '#fff4fb', Hair: '#ff9ed2', Hooves: '#ffd76a', Muzzle: '#ffd0e0', Eye_White: '#ffffff' });
  tint(foxRig.model, { Main: '#ff9a4d', Main_Light: '#fff3e2', Grey: '#6a4a3a', Black: '#4a3a3a' });
  tint(deerRig.model, { Main: '#d39a62', Main_Light: '#f8e3c4', Main_Dark: '#9a6a44', Hooves: '#6a4a3a', Eye_White: '#ffffff' });
  tint(kingRig.model, { MushroomKing_Main: '#ff6f91', MushroomKing_Secondary: '#fff3e0', Orc_Main: '#ffe2c4', Eye_White: '#ffffff' });
  const rigs = { unicorn: uniRig, fox: foxRig, mushking: kingRig, deer: deerRig, queen: queenRig };
  const starMat = new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb300', emissiveIntensity: 1.1, roughness: 0.3 });
  const npcs: Npc[] = QUESTS.map((def) => {
    const actor = new Actor(rigs[def.id]);
    const pos = new THREE.Vector3(def.x, groundY(def.x, def.z), def.z);
    actor.root.position.copy(pos); actor.heading = def.heading; actor.root.rotation.y = def.heading;
    scene.add(actor.root);
    actor.play('Idle');
    ground.block(def.x, def.z, 0.8);
    const mark = new THREE.Mesh(starGeo, starMat);
    scene.add(mark);
    return { def, actor, pos, mark, idle: 'Idle', timer: 3 + Math.random() * 5 };
  });
  const npc = (id: QuestDef['id']) => npcs.find((n) => n.def.id === id)!;
  const queenWings = addWings(queenRig.root, '#fff3b8', 1.25, 1.0);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.09, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd84d', emissive: '#ffb300', emissiveIntensity: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
  scene.add(crown);
  // Unicorn horn follows the head bone.
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.5, 12), new THREE.MeshStandardMaterial({ color: '#ffe68a', emissive: '#ffc94d', emissiveIntensity: 0.9, roughness: 0.3 }));
  horn.geometry.translate(0, 0.25, 0);
  scene.add(horn);
  let uniHead: THREE.Object3D | null = null;
  uniRig.model.traverse((o) => { if ((o as THREE.Bone).isBone && o.name === 'Head') uniHead = o; });
  const hornQ = new THREE.Quaternion(), hornDir = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);

  return {
    npcs, npc, starMat,
    wings: (time, grounded) => {
      wings.forEach((w) => { w.mesh.rotation.y = w.side * (0.55 + Math.sin(time * (grounded ? 5 : 22)) * 0.35); });
      queenWings.forEach((w) => { w.mesh.rotation.y = w.side * (0.55 + Math.sin(time * 4 + 1) * 0.3); });
    },
    // quest characters: turn to the heroine when she is close, otherwise live their own life
    update: (dt, time) => {
      const hp = hero.root.position;
      for (const n of npcs) {
        const d = Math.hypot(n.pos.x - hp.x, n.pos.z - hp.z);
        n.actor.face(d < 7 ? Math.atan2(hp.x - n.pos.x, hp.z - n.pos.z) : n.def.heading, dt, 3);
        if (!g.busy && (n.timer -= dt) < 0) {
          n.timer = 4 + Math.random() * 6;
          n.idle = d > 7 && n.actor.has('Eating') && Math.random() < 0.6 ? 'Eating' : n.actor.has('Idle_2') && Math.random() < 0.4 ? 'Idle_2' : 'Idle';
          n.actor.play(n.idle, 0.4);
        }
        const open = (ws.quests[n.def.id] ?? 0) < 3;
        n.mark.visible = open && !g.busy && !(searching() && n.def.id === 'deer');
        n.mark.rotation.y = time * 2; n.mark.position.set(n.pos.x, n.pos.y + (n.def.id === 'unicorn' ? 3 : n.def.id === 'fox' ? 1.7 : 2.6) + Math.sin(time * 2.5) * 0.15, n.pos.z);
        n.actor.update(dt);
      }
      if (uniHead) {
        // The head bone points along the muzzle; the horn sits on the forehead and leans back a little.
        const hb = uniHead as THREE.Object3D;
        hb.getWorldPosition(horn.position); hb.getWorldQuaternion(hornQ);
        hornDir.set(0, 1, 0).applyQuaternion(hornQ);
        horn.position.addScaledVector(hornDir, 0.16).y += 0.2;
        hornDir.multiplyScalar(-0.3).y += 0.9;
        horn.quaternion.setFromUnitVectors(yAxis, hornDir.normalize());
      }
      queenRig.headBone.getWorldPosition(crown.position); crown.position.y += 0.27;
      crown.rotation.y = npc('queen').actor.heading;
    },
  };
}
