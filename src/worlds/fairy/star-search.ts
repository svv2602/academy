import * as THREE from 'three';
import { say, sfx, speaking, stopVoice } from '../../core/audio';
import type { Game } from '../../game/context';
import type { Npc, WorldTask } from '../../game/world';
import { t, tapKey, voiceText } from '../../ui/strings';

/**
 * The state of the search; window.__game reads this very object, so it is changed in place. `items` is replaced by
 * every search: read it through the object, never keep it.
 */
export interface SearchState { active: boolean; found: number; idle: number; items: { mesh: THREE.Mesh; found: boolean }[] }

/** A background task of the world (src/game/world.ts): the deer's chain moves on through `done`, see finishSearch. */
export interface StarSearch extends WorldTask {
  readonly search: SearchState;
  /** The deer's task: five stars hidden around it; `done` is called once the fifth one is found. */
  start(n: Npc, done: () => void): void;
  active(): boolean;
  /** The character who asked for the stars, while they are searched for. */
  owner(): string | null;
  /** The deer asks its question again, under the bubble of the search: the count (and the question without the voice). */
  reask(n: Npc): Promise<void>;
  /** The bubble of the search: the count of the stars found, after its question when the voice is off (VOICE-09). */
  caption(): void;
  /** The stars of the search turn; one is found when the heroine walks into it. */
  update(dt: number, time: number): void;
  /** While the search is on: the nearest star left once the heroine has wandered for a while, else nothing. */
  goal(): THREE.Vector3 | null;
}

/** The search for the stars hidden around the deer (ARCH-05). Creates nothing until a search starts. */
export function createStarSearch(g: Game, starGeo: THREE.BufferGeometry, starMat: THREE.Material): StarSearch {
  const { scene, ground, hero, sparks, groundY, praise, rng } = g;
  const { caption, line, muted } = g.speech;

  const search: SearchState = { active: false, found: 0, idle: 0, items: [] as { mesh: THREE.Mesh; found: boolean }[] };
  let owner: string | null = null;          // who asked for the stars
  let finished = () => {};                  // the conversation's `done`: moves the chain on and gives the stars

  // ----- task in the world: find the stars hidden around the deer -----
  function startSearch(n: Npc, done: () => void) {
    owner = n.def.id; finished = done;
    search.items.forEach((it) => scene.remove(it.mesh));
    search.items = Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * 6.28 + rng() * 0.9, r = 5 + rng() * 7;
      const p = { x: n.pos.x + Math.cos(a) * r, z: n.pos.z + Math.sin(a) * r };
      ground.resolve(p, 0.7);
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
    finished();
    void last.then(() => (speaking() ? undefined : praise())).then(() => line('t_stars_back', 'hint', 6000));
  }

  return {
    search,
    skill: 'count',
    start: startSearch,
    active: () => search.active,
    owner: () => (search.active ? owner : null),
    reask: async (n) => { const asked = line('t_stars', 'task', 0, n.def.emoji); searchCaption(); await asked; },
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
            const k = tapKey(n)!;   // at most 5 stars
            // A number cuts off whatever sounds (the deer's question too) and has the story's rank, not the task's: no task
            // is open during the search, and a conversation started right after a star (its "again" is a story line) would
            // be turned away by a number of a higher rank.
            if (n < 5) { stopVoice(); void say(k, voiceText(k), 'story'); }
            searchCaption();
            // The last number is heard to the end before the praise (see finishSearch).
            if (n === 5) { stopVoice(); finishSearch(say(k, voiceText(k), 'story')); }
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
