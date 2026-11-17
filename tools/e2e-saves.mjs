// The groups of the walkthrough (npm run e2e -- --only <group>, tools/shot.mjs: E2E_ONLY=<group>) and the saves they
// start from. A group skips the game up to its place: the page starts with the group's save (version 4, written once
// in the tab before the game loads), "play" is pressed and only the blocks of the group are played; the checks at the
// end count only what the group played. Without a group the whole world is played from no save, as it always was.
//
// The world is cut into pieces that together are the whole walkthrough (PIECES): the first two friends, the next two
// (the mushroom king and the queen: the deer's chain goes with its star search), the deer and the finale, the shop.
// Every check of the whole walkthrough is in one of them. "tasks" is not a piece: it plays every friend from no save
// (every kind of task once: closed with its cross, the picture, the question, the deliberate mistake, the hint).
//
// The saves have the shape of defaultSave() of src/core/save.ts with the first world's progress in worlds.fairy;
// tools/e2e-saves.test.mjs reads each one with the game's own loadSave().
// Plain .mjs on purpose: tools/shot.mjs and tools/e2e.mjs import it under plain node.

/** The blocks of tools/shot.mjs a group may play, in the order the whole walkthrough plays them. */
export const BLOCKS = [
  'no-debug',       // the built game without ?debug: no window.__game, no frame counter, the quality lowered by itself
  'flyover',        // the tour of the world: a new save flies it and a tap ends it, a picture per point, none on a second entry or an old save (WORLD-11)
  'hidden-page',    // a hidden page pauses the introduction (TECH-05)
  'intro',          // the introduction heard to its end, the picture of the spawn
  'cat',            // a tap on the cat repeats the line (VOICE-08)
  'heroine',        // the heroine's model, her clips, her items (TECH-14, PLAY-04, PLAY-05)
  'world-sort',     // "sort" in the world (ARCH-09)
  'broken-talk',    // a conversation broken on purpose (PLAY-03)
  'tuning',         // the tuning panel (ARCH-14)
  'collisions',     // the heroine does not walk through a character
  'creatures',      // the creatures of no task: both actions of each kind pictured, a tap on each - its own reaction
  'magic',          // the magic of the world from the shards; a point of the tour pictured at magic 0 and 1, a reload (WORLD-09)
  'finale',         // a finished quest replayed, the finale broken on purpose, then played
  'magic-crystal',  // the crystal restored brings the magic to 1 (WORLD-09)
  'book',           // the collection book against the save
  'shop',           // the shop and the fitting room (PLAY-04, PLAY-05)
  'shop-sign',      // the signboard of the shop
  'parents',        // the gate, the version, the voice slider, the quality button
  'achievements',   // the set of achievements the piece earned; the scene of one at a stop point, ended by one tap (PLAY-08)
  'leave',          // leaving the page saves the spot; after the reload she wears what the shop sold
  'looks',          // the four looks of the start screen, then the hair alone in the fitting room (PLAY-06)
  'start-again',    // "start again" clears the save
];

/** The friends of the first world in the order the walkthrough plays them (src/worlds/fairy/quests.ts). */
export const FRIENDS = ['unicorn', 'fox', 'mushking', 'deer', 'queen'];

/**
 * A skill as the save counts it after `tasks` tasks, one of them failed on purpose (the walkthrough does that; a single
 * wrong answer ends the run of clean solves). `level`: the skill's first one (the composition of a number starts at 3).
 */
const skill = (tasks, level = 1) => ({ level, streak: 0, tasks, first: Math.max(0, tasks - 1), errors: tasks ? 1 : 0 });
/** The skills of src/game/skills.ts in its order. */
const SKILL_IDS = ['count', 'add', 'sub', 'compare', 'series', 'pattern', 'memory', 'classify', 'compose'];

/** defaultSave() of src/core/save.ts, written out (this file runs under plain node); the unit test compares the two. */
export function baseSave() {
  return {
    v: 4, played: false, name: '', dress: '#ff7eb6', hair: '#8a5a3a', wings: true,
    stars: 0,
    skills: Object.fromEntries(SKILL_IDS.map((k) => [k, skill(0, k === 'compose' ? 3 : 1)])),
    fixed: Object.fromEntries(SKILL_IDS.map((k) => [k, 0])), playMinutes: {}, hard: { n: 0, list: [] },
    owned: [], gear: { head: null, wand: null, wings: 'wings_petals', trail: null }, wingColor: '#d8f6ff', achievements: {},
    vol: { music: 0.5, sfx: 0.8, voice: 1 },
    tier: 2, launches: 0, pinTier: null,
    worlds: {},
  };
}

/**
 * A save of a game played up to a place: the friends `done` (3 steps each), the stars, the skills their tasks counted
 * (`tasks`: skill -> number of tasks), the crystal restored or not. The rest is a new player's.
 */
function played({ done, stars, tasks, final = false }) {
  const s = baseSave();
  s.played = true; s.stars = stars; s.launches = 1;
  for (const [k, n] of Object.entries(tasks)) s.skills[k] = skill(n, s.skills[k].level);
  s.worlds.fairy = { quests: Object.fromEntries(done.map((id) => [id, 3])), final, starsTaken: [], flags: {}, pos: null };
  return s;
}

/**
 * The achievements a piece earns (PLAY-08, R06): the scenes the walkthrough saw and closed plus the ones still waiting in
 * the queue (tools/shot.mjs, block "achievements"). None of the saves holds an achievement: all of them are earned in
 * play. The first task, a task tried again after a mistake and the first shard come with any chain - from the play
 * itself or from the save's quests and skills (each skill with a mistake, see `skill`). "All skills" needs the
 * composition of a number, which only the deer's chain trains (the saves hold none of it); the artifact is the crystal
 * restored - in the finale, or in the shop's save. Neither the chest nor every star on the ground is taken by the
 * walkthrough, so the secret, the stars and three secrets are never earned; one day, under fifty tasks, a mistake in
 * every run of clean solves.
 */
const ACH_BASE = ['first_shard', 'first_task', 'try_again'];
/** The whole world from no save (no group): every piece's. */
export const ACH_WHOLE = [...ACH_BASE, 'all_skills', 'first_artifact'];

/**
 * The groups: the save each starts from (null: no save, a new player), the friends whose chains it plays, the blocks,
 * the achievements it earns (`ach`, a piece only).
 * The size decides the rest as it always did (tools/e2e.mjs): desktop is played offline, desktop-tall without the voice.
 */
export const GROUPS = {
  // friends 1-2 from no save: the published game without ?debug, the tour of the world, a hidden page, the introduction, the cat
  world1: { save: null, friends: ['unicorn', 'fox'], blocks: ['no-debug', 'flyover', 'hidden-page', 'intro', 'cat', 'achievements'], ach: ACH_BASE },
  // friends 3 and 5 (the mushroom king, the queen); then the debug show of "sort", a broken talk, the tuning panel,
  // the collisions, the creatures, the magic of four shards - none of them needs the finished world
  world2: {
    save: () => played({ done: ['unicorn', 'fox'], stars: 8, tasks: { count: 1, add: 1, compare: 1, series: 1, pattern: 1, classify: 1 } }),
    friends: ['mushking', 'queen'], blocks: ['world-sort', 'broken-talk', 'tuning', 'collisions', 'creatures', 'magic', 'achievements'], ach: ACH_BASE,
  },
  // the deer: its star search with everything around it; then the finale, the book, the parents' section, "start again"
  finale: {
    // Six examples with mistakes (LEARN-11), so that the parents' section has more than its five hardest to show (PLAY-15):
    // addition and take away only - the deer's chain has neither, so none of them comes back in place of its steps.
    save: () => ({ ...played({ done: ['unicorn', 'fox', 'mushking', 'queen'], stars: 20, tasks: { count: 2, add: 1, sub: 2, compare: 2, series: 2, pattern: 1, memory: 1, classify: 1 } }),
      hard: { n: 12, list: [['add:8+5', 3, 5], ['sub:13-6', 4, 4], ['add:7+6', 1, 9], ['sub:15-8', 2, 2], ['add:9+4', 2, 7], ['add:6+7', 1, 3]]
        .map(([k, e, at]) => ({ k, l: 3, e, c: 0, at })) } }),
    friends: ['deer'], blocks: ['finale', 'magic-crystal', 'book', 'parents', 'achievements', 'leave', 'start-again'], ach: [...ACH_BASE, 'all_skills', 'first_artifact'],
  },
  // the world done, the crystal restored, the 52 stars the whole walkthrough comes to the shop with: the star wand and
  // the hat, then too few for the sparkles. The heroine and her items go here (her look is still a new player's): the
  // pieces take about the same time.
  shop: {
    save: () => played({ done: FRIENDS, stars: 52, tasks: { count: 2, add: 2, sub: 2, compare: 2, series: 2, pattern: 2, memory: 1, classify: 1 }, final: true }),
    friends: [], blocks: ['heroine', 'book', 'shop', 'shop-sign', 'achievements', 'leave', 'looks'], ach: [...ACH_BASE, 'first_artifact'],
  },
  // every friend from no save, nothing else: every kind of task once (not a piece of the world: the pieces have it all)
  tasks: { save: null, friends: FRIENDS, blocks: [] },
};

/** The groups that together play the whole world: CI plays each of them in each size. */
export const PIECES = ['world1', 'world2', 'finale', 'shop'];

/**
 * The save a group starts from, as the text to put into localStorage "amw-save", or '' for none. Without the voice
 * the save holds the voice volume 0, as the parents' section writes it.
 */
export function startSave(group, { mute = false } = {}) {
  const g = GROUPS[group];
  if (!g) throw new Error(`unknown group "${group}": expected ${Object.keys(GROUPS).join(', ')}`);
  const s = g.save ? g.save() : null;
  if (!s) return '';
  if (mute) s.vol.voice = 0;
  return JSON.stringify(s);
}
