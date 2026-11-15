import * as THREE from 'three';
import { createStage, type Game } from '../../game/context';
import type { DebugExtras } from '../../game/debug';
import type { WorldFrame } from '../../game/loop';
import type { Spot } from '../../game/player';
import type { QuestDef } from '../../game/quests';
import { type buildSky, updateRanged } from '../../world/scenery';
import { el } from '../../ui/ui';
import { createButterfliesTask } from './butterflies-task';
import { createCharacters } from './characters';
import { createChestStars } from './chest-stars';
import { createDialogue } from './dialogue';
import type { FairyLoads } from './load';
import { buildShrine, createFinale, shardCount } from './shrine';
import { createStarSearch } from './star-search';

/**
 * The first world, built (ARCH-05): its objects in the order they always joined the scene (and the colliders) in, its
 * tasks and conversations, and its parts of the frame. `debug` is what window.__game reads of it.
 */
export function buildFairy(g: Game, L: FairyLoads, sky: ReturnType<typeof buildSky>): { frame: WorldFrame; debug: DebugExtras } {
  const { camera, renderer, save, hero, flies, speech } = g;
  const { motes, updateClouds, starGeo } = L;
  // The heroine's wings and the quest characters, then the shrine, then the chest and the stars on the ground, then
  // the ambient butterflies: the order they always joined the scene (and the colliders) in.
  const characters = createCharacters(g, L, () => starSearch.search.active);
  const { npcs, npc, starMat } = characters;
  const shrine = buildShrine(g, L, sky);
  const chestStars = createChestStars(g, L, starMat);
  const butterflies = createButterfliesTask(g);
  const { bf } = butterflies;

  // ---------- game state ----------
  const starSearch = createStarSearch(g, starGeo, starMat);
  const { search } = starSearch;
  // A scene during the search (another character's task, closed or solved) gives the bubble back to the search.
  const stage = createStage(g, () => {
    if (!search.active) speech.caption(null);
    else if (speech.shown?.key !== 't_stars') starSearch.caption();
  });
  const restoreCrystal = createFinale(g, stage, shrine, npcs);
  const { talk } = createDialogue(g, stage, { search: starSearch, butterflies });

  const spots: Spot[] = [
    ...npcs.map((n): Spot => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void talk(n); } })),
    { pos: shrine.pos, r: 2.6, label: 'place', on: () => shardCount(save) === 5 && !save.final, run: () => { void restoreCrystal(); } },
    { pos: chestStars.chest.root.position, r: 2.2, label: 'open', on: () => !save.chestOpen, run: () => chestStars.open() },
  ];

  /** Where the cat's sparkles lead: the next unfinished friend, then the shrine. */
  function goal(): THREE.Vector3 | null {
    if (search.active) return starSearch.goal();
    const next = npcs.find((n) => (save.quests[n.def.id] ?? 0) < 3);
    if (next) return next.pos;
    return save.final ? null : shrine.pos;
  }

  // ---------- the world's parts of the frame (src/game/loop.ts calls them in its order) ----------
  const frame: WorldFrame = {
    spots,
    // While the butterflies are counted every tap is theirs, even one that hits none: the heroine stays at the bed.
    tap: (screenDist) => butterflies.tap(screenDist),
    afterMove: (time, grounded) => characters.wings(time, grounded),
    npcs: (dt, time) => characters.update(dt, time),
    // collectibles
    collect: (dt, time, canMove) => {
      chestStars.update(time, canMove);
      starSearch.update(dt, time);
    },
    shrine: (dt, time) => shrine.update(dt, time),
    goal,
    animate: (dt, time) => {
      chestStars.animate(dt);
      flies.update(time);
      butterflies.bob(time);
      updateClouds(dt);
    },
    // A task in the world (the butterflies) is framed from further away than a conversation.
    focusDist: () => bf.active ? 7.5 : 6.5,
    beforeRender: (hp) => {
      sky.sun.position.copy(hp).add(sky.sunOffset);
      sky.sun.target.position.copy(hp);
      updateRanged(hp.x, hp.z);
      motes.uCenter.value.copy(hp);
      motes.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
  };

  const debug: DebugExtras = {
    npcs, search, bf,
    talk: (id) => { void talk(npc(id as QuestDef['id'])); },
    cheatWorld: () => {
      if (bf.active && !bf.demo) { (el.answers.children[bf.n - 1] as HTMLElement).dispatchEvent(new PointerEvent('pointerdown')); return 'butterflies'; }
      if (search.active) { const it = search.items.find((s) => !s.found); if (it) hero.root.position.copy(it.mesh.position); return 'star'; }
      return '';
    },
  };
  return { frame, debug };
}
