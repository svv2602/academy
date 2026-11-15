import * as THREE from 'three';
import { say, sfx, speaking, stopVoice } from '../../core/audio';
import type { Game } from '../../game/context';
import { resolve } from '../../world/terrain';
import { t } from '../../ui/strings';
import type { Npc } from './characters';

/**
 * The state of the search; window.__game reads this very object, so it is changed in place. `items` is replaced by
 * every search: read it through the object, never keep it.
 */
export interface SearchState { active: boolean; found: number; idle: number; items: { mesh: THREE.Mesh; found: boolean }[] }

export interface StarSearch {
  readonly search: SearchState;
  /** The deer's task: five stars hidden around it. */
  start(n: Npc): void;
  /** The bubble of the search: the count of the stars found, after its question when the voice is off (VOICE-09). */
  caption(): void;
  /** The stars of the search turn; one is found when the heroine walks into it. */
  update(dt: number, time: number): void;
  /** While the search is on: the nearest star left once the heroine has wandered for a while, else nothing. */
  goal(): THREE.Vector3 | null;
}

/** The search for the stars hidden around the deer (ARCH-05). Creates nothing until a search starts. */
export function createStarSearch(g: Game, starGeo: THREE.BufferGeometry, starMat: THREE.Material): StarSearch {
  const { scene, save, hero, sparks, groundY, addStars, above, praise, rng } = g;
  const { caption, line, muted } = g.speech;

  const search: SearchState = { active: false, found: 0, idle: 0, items: [] as { mesh: THREE.Mesh; found: boolean }[] };

  // ----- task in the world: find the stars hidden around the deer -----
  function startSearch(n: Npc) {
    search.items.forEach((it) => scene.remove(it.mesh));
    search.items = Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * 6.28 + rng() * 0.9, r = 5 + rng() * 7;
      const p = { x: n.pos.x + Math.cos(a) * r, z: n.pos.z + Math.sin(a) * r };
      resolve(p, 0.7);
      const mesh = new THREE.Mesh(starGeo, starMat);
      mesh.scale.setScalar(0.75); mesh.position.set(p.x, groundY(p.x, p.z) + 0.55, p.z);
      scene.add(mesh);
      return { mesh, found: false };
    });
    Object.assign(search, { active: true, found: 0, idle: 0 });
    void line('t_stars', 'task', muted() ? 0 : 6000, n.def.emoji);
  }
  /** The bubble of the search: the count of the stars found, after its question when the voice is off (VOICE-09). */
  const searchCaption = () => caption({ key: 't_stars', pri: 'task', hold: 0, speaker: '🦌', text: `${muted() ? t('t_stars') + ' ' : ''}⭐ ${search.found} / 5` });
  /**
   * `last` is the fifth number: the praise comes once it is said to the end. A conversation started at that moment
   * cuts the number off (it is of the story's rank) and is not cut off in turn: the praise is left out then, and the
   * planner turns "back to the deer" away (VOICE-03).
   */
  function finishSearch(last: Promise<void>) {
    search.active = false;
    save.quests.deer = Math.max(save.quests.deer ?? 0, 1);
    addStars(3, above(hero.root.position, 1.2));
    void last.then(() => (speaking() ? undefined : praise())).then(() => line('t_stars_back', 'hint', 6000));
  }

  return {
    search,
    start: startSearch,
    caption: searchCaption,
    update: (dt, time) => {
      const hp = hero.root.position;
      if (search.active) {
        search.idle += dt;
        for (const it of search.items) {
          if (it.found) continue;
          it.mesh.rotation.y = time * 2.2;
          if (Math.hypot(it.mesh.position.x - hp.x, it.mesh.position.z - hp.z) < 1.3) {
            it.found = true; it.mesh.visible = false; search.idle = 0;
            sparks.burst(it.mesh.position, '#ffe066', 26); sfx('chime');
            const n = ++search.found;
            if (n < 5) void say(`tap_${n}`, String(n), 'task');
            searchCaption();
            // The last number is heard to the end before the praise (see finishSearch). It cuts off whatever sounds, as
            // every number does, but has the story's rank: a conversation started at this moment is not turned away.
            if (n === 5) { stopVoice(); finishSearch(say(`tap_${n}`, String(n), 'story')); }
          }
        }
      }
    },
    goal: () => {
      if (search.idle < 20) return null;
      let best: THREE.Vector3 | null = null, bd = 1e9;
      for (const it of search.items) { const d = it.mesh.position.distanceTo(hero.root.position); if (!it.found && d < bd) { bd = d; best = it.mesh.position; } }
      return best;
    },
  };
}
