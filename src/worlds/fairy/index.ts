import * as THREE from 'three';
import { updateRanged } from '../../core/instancing';
import { createRng } from '../../core/rng';
import { createStage, type Game } from '../../game/context';
import { createDialogue } from '../../game/dialogue';
import type { DebugExtras } from '../../game/debug';
import type { WorldFrame } from '../../game/loop';
import type { Spot } from '../../game/player';
import { levelFor } from '../../game/skills';
import { playScene } from '../../game/stage';
import { generate as generateSort } from '../../game/tasks/sort';
import { showSortInWorld, type WorldSort } from '../../game/worldtasks/sort';
import type { BookInfo, BuiltWorld, MusicParams, WorldDef, WorldGround, WorldLines, WorldTask } from '../../game/world';
import { el, hideAnswers, showClose } from '../../ui/ui';
import { createButterfliesTask } from './butterflies-task';
import { FRIENDS, createCharacters } from './characters';
import { createChestStars } from './chest-stars';
import { loadFairy, type FairyLoads } from './load';
import { QUESTS, type QuestDef } from './quests';
import { buildShrine, createFinale, shardCount } from './shrine';
import { buildSky } from './sky';
import { createStarSearch } from './star-search';
import { strings } from './strings';
import { SPAWN, colliders, height, raycastGround, resolve } from './terrain';

/**
 * The first world, built (ARCH-05): its objects in the order they always joined the scene (and the colliders) in, its
 * tasks and conversations, and its parts of the frame. `debug` is what window.__game reads of it.
 */
export function buildFairy(g: Game, L: FairyLoads, sky: FairySky): BuiltWorld {
  const { scene, camera, renderer, save, ws, hero, flies, speech } = g;
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
  // The shared conversation (src/game/dialogue.ts): a step of a chain that is not a panel task names one of these.
  // Built from pairs: src/game/no-penalties.test.ts allows a "stars" key in an object only in the fresh save.
  const tasks: Record<string, WorldTask> = Object.fromEntries([['butterflies', butterflies], ['stars', starSearch]]);
  const { talk } = createDialogue(g, stage, { characters: FRIENDS, lines: LINES, tasks });

  // ---------- "sort" in the world (ARCH-09): a debug show only, opened by __game.worldSort() ----------
  // The deer's chain keeps its "sort" on the panel (moving it into the world is PLAY-01). The show records nothing:
  // no skill, no stars, no step of a chain. Its task comes from a randomness of its own, so the seeded tasks of the
  // game (?seed=) stay the same with or without it.
  const sorting = { active: false, colors: [] as string[] };     // window.__game reads this very object
  let sortShow: WorldSort | null = null;
  const worldSort = () => playScene(stage, 'world sort', async () => {
    const deer = npc('deer'), h = deer.def.heading;
    const at = { x: deer.pos.x + Math.sin(h) * SORT_ARC, z: deer.pos.z + Math.cos(h) * SORT_ARC, facing: h };
    // The heroine stands in front of the arc, facing the deer.
    const hx = at.x + Math.sin(h) * 3, hz = at.z + Math.cos(h) * 3;
    hero.root.position.set(hx, g.groundY(hx, hz), hz); hero.heading = h + Math.PI; hero.root.rotation.y = hero.heading;
    const spec = generateSort(levelFor(save, 'logic'), createRng(null));
    const show = sortShow = showSortInWorld(scene, spec, at, g.hooksFor(deer.def.emoji), { groundY: g.groundY, reach: g.touch ? 90 : 60 });
    Object.assign(sorting, { active: true, colors: show.pedestals.map((p) => p.userData.color as string) });
    g.cam.focus = g.above(show.center, 1);
    showClose(() => show.close());
    try { await g.task(() => show.done); } finally { hideAnswers(); sorting.active = false; sortShow = null; }
  });

  const spots: Spot[] = [
    ...npcs.map((n): Spot => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void talk(n); } })),
    { pos: shrine.pos, r: 2.6, label: 'place', on: () => shardCount(ws) === 5 && !ws.final, run: () => { void restoreCrystal(); } },
    { pos: chestStars.chest.root.position, r: 2.2, label: 'open', on: () => !ws.flags.chest, run: () => chestStars.open() },
  ];

  /** Where the cat's sparkles lead: the next unfinished friend, then the shrine. */
  function goal(): THREE.Vector3 | null {
    if (search.active) return starSearch.goal();
    const next = npcs.find((n) => (ws.quests[n.def.id] ?? 0) < 3);
    if (next) return next.pos;
    return ws.final ? null : shrine.pos;
  }

  // ---------- the world's parts of the frame (src/game/loop.ts calls them in its order) ----------
  const frame: WorldFrame = {
    spots,
    // While the butterflies are counted every tap is theirs, even one that hits none: the heroine stays at the bed.
    tap: (screenDist) => butterflies.tap(screenDist) || (sortShow?.tap(screenDist) ?? false),
    afterMove: (time, grounded) => characters.wings(time, grounded),
    // The characters, then the collectibles, then the shrine: the order they were always updated in.
    update: (dt, time, canMove) => {
      characters.update(dt, time);
      chestStars.update(time, canMove);
      starSearch.update(dt, time);
      shrine.update(dt, time);
    },
    goal,
    animate: (dt, time) => {
      chestStars.animate(dt);
      flies.update(time);
      butterflies.bob(time);
      sortShow?.update(time);
      updateClouds(dt);
    },
    // A task in the world (the butterflies, the debug "sort") is framed from further away than a conversation.
    focusDist: () => bf.active || sorting.active ? 7.5 : 6.5,
    beforeRender: (hp) => {
      sky.sun.position.copy(hp).add(sky.sunOffset);
      sky.sun.target.position.copy(hp);
      updateRanged(hp.x, hp.z);
      motes.uCenter.value.copy(hp);
      motes.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
  };

  const debug: DebugExtras = {
    npcs,
    more: { search, bf, sorting, worldSort: () => { void worldSort(); } },
    talk: (id) => { void talk(npc(id as QuestDef['id'])); },
    cheatWorld: () => {
      if (sortShow && sorting.active) { sortShow.cheat(); return 'sort'; }
      if (bf.active && !bf.demo) { (el.answers.children[bf.n - 1] as HTMLElement).dispatchEvent(new PointerEvent('pointerdown')); return 'butterflies'; }
      if (search.active) { const it = search.items.find((s) => !s.found); if (it) hero.root.position.copy(it.mesh.position); return 'star'; }
      return '';
    },
  };
  // What the book shows of this world (src/ui/ui.ts draws it): a shard per friend, then the stars and the chest.
  const book: BookInfo = {
    parts: () => QUESTS.map((q) => ({ color: q.shard, icon: q.emoji, got: (ws.quests[q.id] ?? 0) >= 3 })),
    stats: () => [
      { icon: '⭐', label: 'col_stars', value: String(save.stars) },
      { icon: '🎁', label: 'col_chest', value: ws.flags.chest ? '✔' : '?' },
    ],
  };
  return { frame, debug, book, lines: LINES, hud: () => `${shardCount(ws)}/${QUESTS.length}` };
}

type FairySky = ReturnType<typeof buildSky>;

/** m: the middle of the arc of the debug "sort" in front of the deer. */
const SORT_ARC = 2.5;

/** The lines of the shared conversation (src/game/dialogue.ts) this world says. */
const LINES: WorldLines = { intro: 'intro', partGiven: 'npc_done', allParts: 'all_shards', partTitle: 'shard_title', partText: 'shard_text' };

/** The music of the kingdom (src/core/audio.ts plays it): bells on a pentatonic scale over four soft chords. */
const MUSIC: MusicParams = {
  scale: [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3, 784],
  chords: [[130.8, 196, 329.6], [110, 164.8, 261.6], [87.3, 174.6, 261.6], [98, 196, 293.7]],
};

/** The relief and the colliders of the valley (./terrain.ts): the shared code reaches them only through this. */
const ground: WorldGround = {
  height,
  resolve,
  raycast: raycastGround,
  block: (x, z, r) => { colliders.push({ x, z, r }); },
};

/** The first world, the Fairy Kingdom (ARCH-06): listed in src/worlds/index.ts. */
export const fairy: WorldDef<FairyLoads, FairySky> = {
  id: 'fairy',
  spawn: SPAWN,
  ground,
  characters: FRIENDS,
  // Its texts (ARCH-12): src/main.ts adds them to the shared ones before the start screen.
  strings,
  music: MUSIC,
  sky: buildSky,
  load: loadFairy,
  build: buildFairy,
};
