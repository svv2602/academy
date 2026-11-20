import * as THREE from 'three';
import { setCast } from '../../core/audio';
import { updateRanged } from '../../core/instancing';
import { createRng } from '../../core/rng';
import { createStage, type Game } from '../../game/context';
import { createDialogue } from '../../game/dialogue';
import { marked } from '../../game/describe';
import { setTour, tour } from '../../game/flyover';
import { playStory, setStories } from '../../game/story';
import type { DebugExtras } from '../../game/debug';
import type { WorldFrame } from '../../game/loop';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { levelFor } from '../../game/skills';
import { playScene } from '../../game/stage';
import { generate as generateSort, type SortSpec } from '../../game/tasks/sort';
import { worldTaskDoor } from '../../game/worldtasks/core';
import { worldTaskPlayer, worldTaskProblems } from '../../game/worldtasks/play';
import { showSortInWorld } from '../../game/worldtasks/sort';
import { showStonesInWorld } from '../../game/worldtasks/stones';
import type { WorldTaskShow } from '../../game/worldtasks/core';
import { generate as generateOrder } from '../../game/tasks/order';
import { DIGITS, generate as generateCompare } from '../../game/tasks/compare';
import { showGladesInWorld } from '../../game/worldtasks/glades';
import { typeOf } from '../../game/tasks';
import type { BookInfo, BuiltWorld, MusicParams, Npc, WorldDef, WorldGround, WorldItem, WorldLines, WorldTask } from '../../game/world';
import { openShop } from '../../ui/shop';
import { el } from '../../ui/ui';
import { createButterfliesTask } from './butterflies-task';
import { FRIENDS, createCharacters } from './characters';
import { createChestStars } from './chest-stars';
import { createCreatures } from './creatures';
import { FAIRY_FLYOVER } from './flyover-path';
import { MYSTERY_SPOTS, ROOM, SHOP_SIGN } from './layout';
import { loadFairy, type FairyLoads, type FairyOwnLoads } from './load';
import { createMagic } from './magic';
import { uSway } from '../../core/materials';
import { QUESTS, TASK_STEPS, WORLD_TASKS, chainDone, type QuestDef } from './quests';
import { buildShrine, createFinale, shardCount } from './shrine';
import { SIGN_H } from './scenery';
import { SKY_RADIUS, buildSky } from './sky';
import { GLADE_FLAG, HOUSE_FLAG, createSecrets } from './secrets';
import { HIDDEN_PARTS, createParts, settleOldParts } from './parts';
import { createStarSearch } from './star-search';
import { FAIRY_STORIES } from './story';
import { strings } from './strings';
import { CRYSTAL, PATCH, POND, SPAWN, colliders, height, pathDist, raycastGround, resolve } from './terrain';
import { COLLECT, support } from './collect';
import { voices } from './voices';

/**
 * The first world, built (ARCH-05): its objects in the order they always joined the scene (and the colliders) in, its
 * tasks and conversations, and its parts of the frame. `debug` is what window.__game reads of it.
 */
export function buildFairy(g: Game, L: FairyLoads, sky: FairySky, scope: WorldScope): BuiltWorld {
  const { scene, camera, renderer, save, ws, hero, flies, speech } = g;
  const { motes, updateClouds, starGeo } = L;
  // The heroine's wings and the quest characters, then the shrine, then the chest and the stars on the ground, then
  // the ambient butterflies: the order they always joined the scene (and the colliders) in.
  const characters = createCharacters(g, L, () => starSearch.search.active, scope);
  const { npcs, npc, starMat } = characters;
  const shrine = buildShrine(g, L, sky);
  // The magic of the world (WORLD-09): from the shards in the save; before the ambient butterflies (its own come first).
  const magic = createMagic(g, L, sky);
  // the wind of the plants is shared by every world: back to as it always swayed when this one is left
  scope.own(() => { uSway.value = 1; });
  const chestStars = createChestStars(g, L, starMat);
  // the two other secrets: the glade behind the waterfall, the fairy house and its room (./secrets.ts)
  const secrets = createSecrets(g, scope);
  // In the room of the house the camera sees no farther than its walls: the valley - its trees, friends, stars,
  // ground - lies some 140 m away behind them and drawn it cost about 170 calls and 500k triangles a frame
  // (tools/calls.mjs, the room of the fairy house); the shadow pass has its own camera. The sky, 400 m round the
  // valley, comes along round the camera, small enough to be seen: its colours go by direction alone.
  const valleyFar = camera.far, skyDome = sky.sky;
  let roomReach = false;
  const reach = () => {
    const inside = secrets.inRoom();
    if (inside) skyDome.position.copy(camera.position);
    if (inside === roomReach) return;
    roomReach = inside;
    camera.far = inside ? ROOM_FAR : valleyFar; camera.updateProjectionMatrix();
    skyDome.scale.setScalar(inside ? (ROOM_FAR * 0.8) / SKY_RADIUS : 1);
    if (!inside) skyDome.position.set(0, 0, 0);
  };
  scope.own(() => { camera.far = valleyFar; camera.updateProjectionMatrix(); skyDome.scale.setScalar(1); skyDome.position.set(0, 0, 0); });
  // the shards of the fox and the mushroom king hidden in the secrets (./parts.ts); a save from before keeps its shards
  if (settleOldParts(ws)) g.persist();
  let stepDone: (n: Npc, k: number) => void = () => {};
  const parts = createParts(g, (id) => npc(id as QuestDef['id']), () => stepDone);
  const butterflies = createButterfliesTask(g, scope);
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
  // The cut-scenes (WORLD-13, ./story.ts): the introduction is played by the start of the game (src/game/start.ts), the
  // return of the crystal once the finale and its last words are over - "walk around" comes after it.
  const story = setStories(g, FAIRY_STORIES, scope);
  const restoreCrystal = createFinale(g, stage, shrine, npcs, scope, () => playStory(g, 'story_crystal'));
  // The shared conversation (src/game/dialogue.ts): a step of a chain that is not a panel task names one of these.
  // ---------- tasks played in the world (PLAY-01, src/game/worldtasks/): steps of the chains, on the shared frame ----------
  // One task at a time, opened by the shared player (src/game/worldtasks/play.ts): its frame, the close button, the debug
  // door of the walkthrough; taken back when it ends or when the world is left in its middle.
  const sorting = { active: false, colors: [] as string[] };     // window.__game reads this very object
  const player = worldTaskPlayer(g, scope);
  const playInWorld = async (_n: Npc, show: WorldTaskShow) => {
    try { return await player.play(show); } finally { sorting.active = false; }
  };
  /** The arc of the pedestals before the deer (or any character `n`). */
  const sortAt = (n: Npc) => {
    const h = n.def.heading;
    return { at: { x: n.pos.x + Math.sin(h) * SORT_ARC, z: n.pos.z + Math.cos(h) * SORT_ARC, facing: h } };
  };
  const openSort = (n: Npc, spec: SortSpec) => {
    const { at } = sortAt(n);
    const show = showSortInWorld(scene, spec, at, g.hooksFor(n.def.emoji), { groundY: g.groundY, reach: g.touch ? 90 : 60, scope });
    Object.assign(sorting, { active: true, colors: show.pedestals.map((p) => p.userData.color as string) });
    return show;
  };
  // "sort" of the deer's chain: the crystals on the pedestals (every level of "classify" plays it)
  const sortStep: WorldTask = {
    skill: 'classify', inWorld: () => true,
    run: (n, level) => playInWorld(n, openSort(n, generateSort(level, g.rng))),
  };
  // "order" of the mushroom king's chain: the stones across a stream before him (its level 4, the neighbours of a
  // number, stays on the card: `typeOf`)
  const orderStep: WorldTask = {
    skill: 'series', inWorld: (level) => typeOf('order', level) === 'order',
    run: (n, level) => {
      const h = n.def.heading, d = STONES_AT;
      // the near bank before the character; the stream crosses towards it
      const at = { x: n.pos.x + Math.sin(h) * d, z: n.pos.z + Math.cos(h) * d, facing: h + Math.PI };
      const show = showStonesInWorld(scene, generateOrder(level, g.rng), at, g.hooksFor(n.def.emoji), { groundY: g.groundY, reach: g.touch ? 70 : 46, scope });
      return playInWorld(n, show);
    },
  };
  // "compare" of the unicorn's and the queen's chains: two glades of flowers before the character (from level 4 the
  // groups are digits and the signs: those stay on the card)
  const compareStep: WorldTask = {
    skill: 'compare', inWorld: (level) => typeOf('compare', level) === 'compare' && !DIGITS(level),
    run: (n, level) => {
      const at = gladesAt(n);
      const show = showGladesInWorld(scene, generateCompare(level, g.rng), at, g.hooksFor(n.def.emoji), { groundY: g.groundY, reach: g.touch ? 80 : 56, scope });
      return playInWorld(n, show);
    },
  };
  /**
   * Where the two glades lie by a character: on clear ground - off the path and its stones, out of the pond, away from
   * props, the butterflies' bed and the crystal - so that nothing of the world lies among the flowers being counted; the
   * nearest ring around the character that has such ground (from GLADES_AT out), and on it the clearest place. Seen side
   * by side, looking towards the character.
   */
  function gladesAt(n: Npc) {
    const margin = (x: number, z: number) => Math.min(pathDist(x, z) - 2.2, Math.hypot(x - POND.x, z - POND.z) - POND.r - 1.5,
      Math.hypot(x - PATCH.x, z - PATCH.z) - 3, Math.hypot(x - CRYSTAL.x, z - CRYSTAL.z) - 2,
      ...colliders.map((c) => Math.hypot(x - c.x, z - c.z) - c.r - 1.2));
    for (const d of [GLADES_AT, 5, 6.5, 8, 9.5]) {
      let best: { x: number; z: number; facing: number } | null = null, bm = 0;
      for (let k = 0; k < 16; k++) {
        const a = n.def.heading + (k * Math.PI) / 8, x = n.pos.x + Math.sin(a) * d, z = n.pos.z + Math.cos(a) * d;
        const sx = Math.cos(a), sz = -Math.sin(a);
        // the whole footprint: both glades side by side and their depth
        let m = Infinity;
        for (const s of [-2.4, -1.2, 0, 1.2, 2.4]) for (const t of [-1, 0, 1]) m = Math.min(m, margin(x + sx * s + Math.sin(a) * t, z + sz * s + Math.cos(a) * t));
        if (m > bm) { bm = m; best = { x, z, facing: a + Math.PI }; }
      }
      if (best) return best;
    }
    const h = n.def.heading;
    return { x: n.pos.x + Math.sin(h) * GLADES_AT, z: n.pos.z + Math.cos(h) * GLADES_AT, facing: h + Math.PI };
  }
  // Built from pairs: src/game/no-penalties.test.ts allows a "stars" key in an object only in the fresh save.
  const tasks: Record<string, WorldTask> = Object.fromEntries([['butterflies', butterflies], ['stars', starSearch], ['sort', sortStep], ['order', orderStep], ['compare', compareStep], ['part', parts]]);
  // Every step the world names is a task of its conversation, and those it plays in the world are played in the
  // foreground - a step without its task would go to the panel, which has no such task (./quests.ts).
  const wrongTasks = [
    ...TASK_STEPS.filter((id) => !tasks[id]).map((id) => `the step "${id}" has no task`),
    ...worldTaskProblems(WORLD_TASKS, tasks),
  ];
  if (wrongTasks.length) throw new Error(`the fairy world: ${wrongTasks.join('; ')}`);
  setCast(voices);   // each character speaks with its voice (VOICE-10)
  scope.own(() => setCast({ narrator: '', cast: {} }));   // TECH-15: the next world starts with no voices but the narrator's
  const dialogue = createDialogue(g, stage, { characters: FRIENDS, lines: LINES, tasks }), { talk } = dialogue;
  stepDone = dialogue.stepDone;

  // ---------- "sort" in the world as a debug show (__game.worldSort()): the walkthrough's look at it outside a chain ----------
  // It records nothing: no skill, no stars, no step of a chain. Its task comes from a randomness of its own, so the
  // seeded tasks of the game (?seed=) stay the same with or without it.
  const worldSort = () => playScene(stage, 'world sort', async () => {
    const deer = npc('deer'), show = openSort(deer, generateSort(levelFor(save, 'classify'), createRng(null)));
    await g.task(() => playInWorld(deer, show));
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
    ...secrets.spots,
  ];

  /** Where the cat's sparkles lead: the next unfinished friend, then the shrine. */
  function goal(): THREE.Vector3 | null {
    if (search.active) return starSearch.goal();
    const shard = parts.goal();
    if (shard) return shard;
    const next = npcs.find((n) => !chainDone(ws, n.def));
    if (next) return next.pos;
    return ws.final ? null : shrine.pos;
  }

  // ---------- the world's parts of the frame (src/game/loop.ts calls them in its order) ----------
  const frame: WorldFrame = {
    spots,
    // While the butterflies are counted every tap is theirs, even one that hits none: the heroine stays at the bed.
    // A tap no task took may be a creature's (its reaction; nothing recorded).
    tap: (screenDist) => butterflies.tap(screenDist) || player.tap(screenDist) || creatures.tap(screenDist),
    afterMove: (time, grounded) => characters.wings(time, grounded),
    // The characters, then the collectibles, then the shrine: the order they were always updated in.
    update: (dt, time, canMove) => {
      characters.update(dt, time);
      chestStars.update(time, canMove);
      secrets.update(dt, time, canMove);
      reach();
      parts.update(dt, time, canMove);
      starSearch.update(dt, time);
      shrine.update(dt, time);
      creatures.update(dt);
      magic.update(dt);
    },
    goal,
    animate: (dt, time) => {
      chestStars.animate(dt);
      flies.update(time);
      butterflies.bob(time);
      player.update(time);
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
    // the walkthrough walks up to the shop's signboard; creatures: the creatures of no task (kind, state, position, taps), holdCreature: one of them held still.
    more: { search, bf, sorting, gear: characters.gear, worldSort: () => { void worldSort(); }, shopSign: sign, creatures: creatures.herd.all,
      // holds creature `i` calm at [x, y, z] until a tap (null lets it go): the walkthrough taps it there
      // creatureBody(i): m above creature i's position where its drawn body's middle is - the point a tap is measured from
      creatureBody: (i: number) => creatures.bodyOf(creatures.herd.all[i]),
      holdCreature: (i: number, at: [number, number, number] | null) => creatures.herd.hold(creatures.herd.all[i], at && new THREE.Vector3(...at)),
      // the tour: `flyover()` plays it without marking anything, `flyoverPoints` are its points with the moment each is
      // passed, `flyoverPlayer` is its state (active, elapsed) with skip() and hold(i)
      flyover: () => { void tour(g, { record: false }); }, flyoverPlayer: flyover,
      flyoverPoints: FAIRY_FLYOVER.points.map((p, i) => ({ ...p, t: flyover.times[i] })),
      // the magic of the world (WORLD-09): `magic.value` shown, `magic.target` the save's; setMagic(v) shows v at once, null the save's
      magic, setMagic: (v: number | null) => magic.set(v),
      // the two other secrets (./secrets.ts): the doors of the house outside and inside, is she in the room, where each is found
      secrets: { doorOut: secrets.doorOut, doorIn: secrets.doorIn, inRoom: secrets.inRoom, gladeAt: secrets.gladeAt, boxAt: secrets.boxAt },
      // the parts hidden in the world (./parts.ts): waiting(id) - the part of `id`'s chain waiting at its place, else null
      parts: { waiting: (id: string) => parts.waiting(id) },
      // the cut-scenes (WORLD-13): their player (active, id, index, elapsed, pass, fading, log; play(id) shows one without
      // marking it, next(), skip(), hold(u), flat)
      story },
    talk: (id) => { void talk(npc(id as QuestDef['id'])); },
    cheatWorld: () => {
      if (worldTaskDoor(g).solve()) return 'world task';
      if (bf.active && !bf.demo) { (el.answers.children[bf.n - 1] as HTMLElement).dispatchEvent(new PointerEvent('pointerdown')); return 'butterflies'; }
      if (search.active) { const it = search.items.find((s) => !s.found); if (it) hero.root.position.copy(it.mesh.position); return 'star'; }
      // a shard waiting in the world: she is put onto its place (walking into it takes it)
      { const p = HIDDEN_PARTS.find((x) => parts.waiting(x.owner)); if (p) { hero.root.position.set(p.at.x, g.groundY(p.at.x, p.at.z), p.at.z); return 'part'; } }
      return '';
    },
  };
  // The world's own items of its description (ARCH-16, src/game/describe.ts): the chains of the friends and the pet are
  // made of the declaration; here what the game has anyway - the three secrets, the two cut-scenes, the tour, the finale. The id
  // of each is the name of its mark in the world's flags (the finale's mark is ws.final).
  // the heroine stands in front of the chest, inside its action spot (2.2 m)
  const chestRot = chestStars.chest.root.rotation.y, chestAt = chestStars.chest.root.position;
  const items: readonly WorldItem[] = [
    marked(ws, { kind: 'flyover', id: 'toured', how: 'auto', active: () => flyover.active }),
    marked(ws, { kind: 'scene', id: 'story_intro', how: 'auto', active: () => story.active && story.id === 'story_intro' }),
    marked(ws, { kind: 'secret', id: 'chest', how: 'act', at: { x: chestAt.x + Math.sin(chestRot) * 1.3, z: chestAt.z + Math.cos(chestRot) * 1.3 } }),
    marked(ws, { kind: 'secret', id: GLADE_FLAG, how: 'walk', at: secrets.gladeAt }),
    marked(ws, { kind: 'secret', id: HOUSE_FLAG, how: 'act', at: secrets.boxAt }),
    ...HIDDEN_PARTS.map((p) => marked(ws, { kind: 'part', id: p.flag, how: 'walk', at: { x: p.at.x, z: p.at.z } })),
    marked(ws, { kind: 'finale', id: 'final', how: 'act', at: { x: shrine.pos.x, z: shrine.pos.z }, after: QUESTS.map((q) => q.id) }),
    marked(ws, { kind: 'scene', id: 'story_crystal', how: 'auto', after: ['final'], active: () => story.active && story.id === 'story_crystal' }),
  ];
  // What the book shows of this world (src/ui/ui.ts draws it): a shard per friend, then the stars and the chest.
  const book: BookInfo = {
    parts: () => QUESTS.map((q) => ({ color: q.shard, icon: q.emoji, got: chainDone(ws, q) })),
    stats: () => [
      { icon: '⭐', label: 'col_stars', value: String(save.stars) },
      { icon: '🎁', label: 'col_chest', value: ws.flags.chest ? '✔' : '?' },
    ],
  };
  // The finds not found yet, for the glow potion (src/game/supplyfx.ts): the places the description names (`items`
  // above) - the chest, the glade, and the house by its door outside (the box inside, once she is in the room).
  const gladeAt = new THREE.Vector3(secrets.gladeAt.x, g.groundY(secrets.gladeAt.x, secrets.gladeAt.z), secrets.gladeAt.z);
  const boxAt = new THREE.Vector3(secrets.boxAt.x, ROOM.y, secrets.boxAt.z);
  const finds: THREE.Vector3[] = [];
  const glimmer = () => {
    finds.length = 0;
    if (!ws.flags.chest) finds.push(chestAt);
    if (!ws.flags[GLADE_FLAG]) finds.push(gladeAt);
    if (!ws.flags[HOUSE_FLAG]) finds.push(secrets.inRoom() ? boxAt : secrets.doorOut);
    return finds;
  };
  return {
    frame, debug, book, lines: LINES, hud: () => `${shardCount(ws)}/${QUESTS.length}`, gear: characters.gear, items: () => items,
    glimmer, cramped: () => secrets.inRoom(),
  };
}

type FairySky = ReturnType<typeof buildSky>;
/** How far the camera sees in the room of the house, m: past its far corner with the camera 4.2 m behind her. */
const ROOM_FAR = 30;

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
/** m before a character where the middle between the two glades of "compare" lies. */
const GLADES_AT = 3.6;
/** m from a character to the near bank of the stream of its stones (PLAY-01). */
const STONES_AT = 4.5;

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
  support,
};

/** The first world, the Fairy Kingdom (ARCH-06): listed in src/worlds/index.ts. */
export const fairy: WorldDef<FairyOwnLoads, FairySky> = {
  id: 'fairy',
  shelf: 0,   // the Crystal of Light, the first place of the shelf
  spawn: SPAWN,
  ground,
  characters: FRIENDS,
  secrets: ['chest', 'glade', 'house'],
  worldTasks: WORLD_TASKS,
  chest: 'chest',
  groundStars: 4,
  mystery: { spots: MYSTERY_SPOTS },
  collect: COLLECT,
  pet: { species: 'fawn', at: { x: 26, z: 9.5 }, after: 'deer' },
  // Its texts (ARCH-12): src/main.ts adds them to the shared ones before the start screen.
  strings,
  music: MUSIC,
  sky: buildSky,
  // TECH-15: the colliders are one list of the module (./terrain.ts) - the world empties it as it is left, else the
  // next entry would add every prop a second time. Handed over before the load: the scenery blocks the ground in it.
  load: (scene, save, touch, scope) => { scope.own(() => { colliders.length = 0; }); return loadFairy(scene, save, touch); },
  // The heroine's model is the game's (src/game/boot.ts): the parts of the world read it next to the world's own loads.
  build: (g, L, sky, scope) => buildFairy(g, { ...L, heroRig: g.heroRig }, sky, scope),
};
