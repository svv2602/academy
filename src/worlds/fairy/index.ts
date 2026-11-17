import * as THREE from 'three';
import { setCast } from '../../core/audio';
import { updateRanged } from '../../core/instancing';
import { createRng } from '../../core/rng';
import { createStage, type Game } from '../../game/context';
import { createDialogue } from '../../game/dialogue';
import { setTour, tour } from '../../game/flyover';
import type { DebugExtras } from '../../game/debug';
import type { WorldFrame } from '../../game/loop';
import type { Spot } from '../../game/player';
import { levelFor } from '../../game/skills';
import { playScene } from '../../game/stage';
import { generate as generateSort } from '../../game/tasks/sort';
import { showSortInWorld, type WorldSort } from '../../game/worldtasks/sort';
import type { BookInfo, BuiltWorld, MusicParams, WorldDef, WorldGround, WorldLines, WorldTask } from '../../game/world';
import { openShop } from '../../ui/shop';
import { el, hideAnswers, showClose } from '../../ui/ui';
import { createButterfliesTask } from './butterflies-task';
import { FRIENDS, createCharacters } from './characters';
import { createChestStars } from './chest-stars';
import { createCreatures } from './creatures';
import { FAIRY_FLYOVER } from './flyover-path';
import { SHOP_SIGN } from './layout';
import { loadFairy, type FairyLoads, type FairyOwnLoads } from './load';
import { QUESTS, type QuestDef } from './quests';
import { buildShrine, createFinale, shardCount } from './shrine';
import { SIGN_H } from './scenery';
import { buildSky } from './sky';
import { createStarSearch } from './star-search';
import { strings } from './strings';
import { SPAWN, colliders, height, raycastGround, resolve } from './terrain';
import { voices } from './voices';

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
  // The creatures of no task (PLAY-11, PLAY-12): fairies, birds, fish - after everything above, so the trees are there.
  const creatures = createCreatures(g, L.creatureModels);

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
  setCast(voices);   // each character speaks with its voice (VOICE-10)
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
    const spec = generateSort(levelFor(save, 'classify'), createRng(null));
    const show = sortShow = showSortInWorld(scene, spec, at, g.hooksFor(deer.def.emoji), { groundY: g.groundY, reach: g.touch ? 90 : 60 });
    Object.assign(sorting, { active: true, colors: show.pedestals.map((p) => p.userData.color as string) });
    g.cam.focus = g.above(show.center, 1);
    showClose(() => show.close());
    try { await g.task(() => show.done); } finally { hideAnswers(); sorting.active = false; sortShow = null; }
  });

  // ---------- the shop's signboard (R10, R19): the mushroom is in the scenery, its badge floats over the cap ----------
  // Walking up to it shows the action button "Shop"; a tap opens the same screen as the button of the book.
  const sign = new THREE.Vector3(SHOP_SIGN.x, g.groundY(SHOP_SIGN.x, SHOP_SIGN.z), SHOP_SIGN.z);
  const badge = shopBadge();
  badge.position.set(sign.x, sign.y + SIGN_H + 0.7, sign.z);
  scene.add(badge);

  const spots: Spot[] = [
    ...npcs.map((n): Spot => ({ pos: n.pos, r: 3.0, label: 'talk', on: () => true, run: () => { void talk(n); } })),
    { pos: shrine.pos, r: 2.6, label: 'place', on: () => shardCount(ws) === 5 && !ws.final, run: () => { void restoreCrystal(); } },
    { pos: chestStars.chest.root.position, r: 2.2, label: 'open', on: () => !ws.flags.chest, run: () => chestStars.open() },
    { pos: sign, r: 2.4, label: 'shop', on: () => true, run: () => openShop() },
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
    // A tap no task took may be a creature's (its reaction; nothing recorded).
    tap: (screenDist) => butterflies.tap(screenDist) || (sortShow?.tap(screenDist) ?? false) || creatures.tap(screenDist),
    afterMove: (time, grounded) => characters.wings(time, grounded),
    // The characters, then the collectibles, then the shrine: the order they were always updated in.
    update: (dt, time, canMove) => {
      characters.update(dt, time);
      chestStars.update(time, canMove);
      starSearch.update(dt, time);
      shrine.update(dt, time);
      creatures.update(dt);
    },
    goal,
    animate: (dt, time) => {
      chestStars.animate(dt);
      flies.update(time);
      butterflies.bob(time);
      sortShow?.update(time);
      badge.position.y = sign.y + SIGN_H + 0.7 + Math.sin(time * 2) * 0.08;
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

  // The tour of the world (WORLD-11): visited once toured, and a save played before this session (an old save) counts
  // as visited too - `save.played` is read here, before "play" sets it.
  const playedBefore = save.played;
  const flyover = setTour(g, {
    path: FAIRY_FLYOVER,
    visited: () => ws.flags.toured === true || playedBefore,
    mark: () => { ws.flags.toured = true; g.persist(); },
  });

  const debug: DebugExtras = {
    npcs,
    // gear: the heroine's items (src/game/gear.ts), worn and taken off by the walkthrough and the shop; shopSign: where
    // the walkthrough walks up to the shop's signboard; creatures: the creatures of no task (kind, state, position, taps).
    more: { search, bf, sorting, gear: characters.gear, worldSort: () => { void worldSort(); }, shopSign: sign, creatures: creatures.herd.all,
      // the tour: `flyover()` plays it without marking anything, `flyoverPoints` are its points with the moment each is
      // passed, `flyoverPlayer` is its state (active, elapsed) with skip() and hold(i)
      flyover: () => { void tour(g, { record: false }); }, flyoverPlayer: flyover,
      flyoverPoints: FAIRY_FLYOVER.points.map((p, i) => ({ ...p, t: flyover.times[i] })) },
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
  return { frame, debug, book, lines: LINES, hud: () => `${shardCount(ws)}/${QUESTS.length}`, gear: characters.gear };
}

type FairySky = ReturnType<typeof buildSky>;

/**
 * The badge over the shop's signboard: a bag drawn on a small canvas (no file, no font), always facing the camera -
 * the same bag as on the button of the book, a lilac circle, not a star (a star over a head means a friend to talk to).
 */
function shopBadge(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff6fb'; x.strokeStyle = '#c79bff'; x.lineWidth = 8;
  x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill(); x.stroke();
  x.strokeStyle = '#a05fd6'; x.lineWidth = 7;
  x.beginPath(); x.arc(64, 50, 15, Math.PI, 0); x.stroke();                     // the handle
  x.fillStyle = '#ff7fb5';
  x.beginPath(); x.roundRect(36, 48, 56, 46, 10); x.fill();                      // the bag
  x.fillStyle = '#ffe066';
  x.beginPath();
  for (let i = 0; i < 10; i++) {                                                // a little star on it
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 6 : 14;
    x.lineTo(64 + Math.cos(a) * r, 72 + Math.sin(a) * r);
  }
  x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.setScalar(0.85);
  return s;
}

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
export const fairy: WorldDef<FairyOwnLoads, FairySky> = {
  id: 'fairy',
  spawn: SPAWN,
  ground,
  characters: FRIENDS,
  // Its texts (ARCH-12): src/main.ts adds them to the shared ones before the start screen.
  strings,
  music: MUSIC,
  sky: buildSky,
  load: loadFairy,
  // The heroine's model is the game's (src/game/boot.ts): the parts of the world read it next to the world's own loads.
  build: (g, L, sky) => buildFairy(g, { ...L, heroRig: g.heroRig }, sky),
};
