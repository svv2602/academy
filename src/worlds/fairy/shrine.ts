import * as THREE from 'three';
import { sfx } from '../../core/audio';
import type { Save } from '../../core/save';
import { damp, lerp } from '../../core/util';
import type { Game } from '../../game/context';
import { QUESTS, SHRINE } from '../../game/quests';
import { playScene, type Stage } from '../../game/stage';
import type { buildSky } from './sky';
import { fanfare } from '../../ui/ui';
import { t } from '../../ui/strings';
import type { Npc } from './characters';
import type { FairyLoads } from './load';

/** How many shards the friends have given: a quest finished is a shard at the shrine. */
export function shardCount(save: Save): number {
  return QUESTS.filter((q) => (save.quests[q.id] ?? 0) >= 3).length;
}

export interface Shrine {
  /** Where the Crystal of Light stands (and the shards circle). */
  readonly pos: THREE.Vector3;
  /** The shards, the crystal and its light; the glow of the sky and the rainbow once the crystal is whole. */
  update(dt: number, time: number): void;
}

/** The shrine: the Crystal of Light and its five shards (ARCH-05). The glow of the world lives here. */
export function buildShrine(g: Game, L: FairyLoads, sky: ReturnType<typeof buildSky>): Shrine {
  const { scene, save, groundY } = g;
  const { crystalGeo, rainbowAlpha } = L;
  // ----- shrine: the Crystal of Light and its five shards -----
  const shrine = new THREE.Vector3(SHRINE.x, groundY(SHRINE.x, SHRINE.z) + 1.7, SHRINE.z);
  const crystal = new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({ color: '#bff4ff', emissive: '#56d8ff', emissiveIntensity: 0.9, roughness: 0.15, flatShading: true, transparent: true }));
  const crystalLight = new THREE.PointLight('#8fe8ff', 0, 14, 1.6);
  crystal.add(crystalLight); crystalLight.position.y = 0.5;
  crystal.position.copy(shrine);
  scene.add(crystal);
  const shards = QUESTS.map((q) => {
    const m = new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({ color: q.shard, emissive: q.shard, emissiveIntensity: 0.7, roughness: 0.2, flatShading: true }));
    m.scale.setScalar(0.34); m.visible = false;
    scene.add(m);
    return m;
  });
  let glow = save.final ? 1 : 0;

  return {
    pos: shrine,
    // shrine: collected shards circle the place where the crystal will stand
    update: (dt, time) => {
      if (g.finale > 0) g.finale += dt;
      const pull = g.finale > 0 ? Math.max(0, 1 - g.finale / 3.4) : 1;
      QUESTS.forEach((q, i) => {
        const m = shards[i];
        m.visible = (save.quests[q.id] ?? 0) >= 3 && !save.final;
        if (!m.visible) return;
        const a = time * (g.finale > 0 ? 1 + g.finale * 2.5 : 0.7) + (i / 5) * 6.28;
        m.position.set(shrine.x + Math.cos(a) * 0.95 * pull, shrine.y + Math.sin(time * 1.5 + i) * 0.12, shrine.z + Math.sin(a) * 0.95 * pull);
        m.rotation.y = time * 1.5 + i;
      });
      const mat = crystal.material as THREE.MeshStandardMaterial;
      mat.opacity = lerp(mat.opacity, save.final ? 1 : 0.18, damp(2, dt));
      crystal.scale.setScalar(lerp(crystal.scale.x, save.final ? 1.25 : 0.8, damp(3, dt)));
      crystal.position.y = shrine.y + Math.sin(time * 1.8) * 0.12; crystal.rotation.y = time * 0.9;
      crystalLight.intensity = save.final ? 5 + Math.sin(time * 3) * 1.2 : g.finale > 0 ? g.finale * 2 : 0;
      glow = lerp(glow, save.final ? 1 : 0, damp(0.6, dt));
      rainbowAlpha.value = glow;
      (sky.sky.material as THREE.ShaderMaterial).uniforms.uGlow.value = glow;
      sky.hemi.intensity = 1.25 + glow * 0.25;
    },
  };
}

/**
 * The finale (ARCH-05): the five shards merge into the crystal. Returns the scene to start from the shrine's spot;
 * what the cat says after it is said once the scene is over (its end clears the bubble), never inside it.
 */
export function createFinale(g: Game, stage: Stage, shrine: Shrine, npcs: readonly Npc[]): () => Promise<void> {
  const { save, cam, hero, cat, sparks, persist, fault } = g;
  const { line } = g.speech;
  const pos = shrine.pos;
  return async function restoreCrystal() {
    let onward = () => {};      // what the cat says once the scene is over
    await playScene(stage, 'finale', async () => {
      cam.focus = pos.clone();
      hero.play('Talk');
      g.finale = 0.001;
      fault();
      sfx('chime');
      await new Promise((r) => setTimeout(r, 3600));
      save.final = true; g.finale = 0; persist();
      sfx('fanfare');
      for (const c of ['#8fe8ff', '#fff2a8', '#ff9ed2', '#c79bff']) sparks.burst(pos, c, 50, 7);
      hero.play('Dance'); cat.play('Dance');
      for (const n of npcs) if (n.actor.has('Dance')) n.actor.play('Dance');
      const words = line('final_text', 'story');
      await fanfare('final_title', t('final_text'));
      cat.play('Idle'); hero.play('Idle'); npcs.forEach((n) => n.actor.play('Idle'));
      // After the scene (its end clears the bubble) and after the final words: a hint does not cut the story off.
      onward = () => { void words.then(() => line('free', 'hint', 6000)); };
    });
    onward();
  };
}
