// The walkthrough every world of the registry shares (ARCH-16): tools/shot.mjs calls `playWorld` for E2E_WORLD=<id>.
// The world is played from its entry to its finale by its description alone - window.__game.items (src/game/describe.ts):
// the chains of its characters, its secrets, the parts of the artifact that lie in it, its cutscenes, its tour, its pet,
// its finale. Nothing here is written for a world: no id of a world, of a character or of an item, no place. What to do,
// where and in which order is read from the description; what the caller hands in is the page, the helpers of
// tools/shot.mjs (pictures with the layout check, taps, the checks of the voice) and the save the world starts from.
//
// The pass, step by step:
//   1. the start screen: a picture, the links;
//   2. the description before "play": of the one shape, nothing lacking of the world template (window.__game.missing -
//      a point that is not there fails with the number and the name of its row of docs/13-worlds.md), nothing that
//      disagrees with what the world declares (window.__game.itemProblems), nothing done or on in a world not entered
//      yet; the line "plan of the world …" is printed;
//   3. "play", pressed once the service worker has taken the page (a clip of the bank asked for before that is not
//      kept, and the check of the bank at the end needs one kept): a line or an item of the description comes up, the save has the world's own part, the part of the world
//      it started with is untouched; from here the stars are watched in every frame (never down, stored at once);
//   4. the items, one after another (`nextStep`): what is on by itself first, then the first undone one whose `after`
//      is done. Each is done the way its `how` says (`planFor`):
//        act  - stand at `at`, the action button must show, press it;
//        walk - stand at `at`;
//        auto - it starts by itself: wait for it to be on;
//        tap  - a tap in the middle of the screen (after standing at `at`, or once it is on by itself);
//      then it is driven to its end: a panel task is pictured, its question checked and solved (__game.cheat), a task
//      of the world itself is solved the same way, the card of a part is pictured and closed, what plays is waited for
//      by its `active`. A task played in the world (PLAY-01) on a step the chain names in `inWorld` is played through
//      the debug door of the task (__game.worldTask, src/game/worldtasks/core.ts), whatever its kind, in the steps of
//      WORLD_TASK_STEPS: a) it is open, waiting, with no mistake and no hint (a card there instead fails); b) one wrong
//      move - counted, "try again" and the hint said by their clips, back to waiting on rung 1; c) closed - nothing is
//      recorded (the world's part of the save in memory and stored, the stars, the skills: as at its opening), the
//      heroine walks; d) the action again opens the same task anew (one that opens where she goes - the sea's lock at
//      the gate - after the world's move brings her there); e) solved - the step is stored, 3 stars, one task
//      more in one skill. A task in the world on a step `inWorld` does not name fails with the id of the chain. An item that does not get done fails with its id: the action tried twice with its mark in
//      the save unchanged, no action button at its place, no start, or `active` that never ends. Once, before the first
//      item, the order is tried: at the place of an item that comes after an undone one nothing can be done yet;
//   5. the end: every item done, each mark in the stored save under the id of its item, every step a chain names in
//      `inWorld` met and played as a task in the world, the book (a part for every
//      chain, lit for the chains done), the voice (no line left to the synthesizer, the planner turned away only what
//      it may), the frame counter;
//   6. a reload: every item still done, the progress under worlds.<id>, the part of the world the save started with
//      exactly as it was; "start again" clears every world.
// Every picture is taken with `shot` of tools/shot.mjs: it is the layout check of the screen it shows.
//
// Waiting: nothing here pauses by the clock. What the game does in its own time is waited for in seconds of the game's
// clock (`gameUntil` of tools/game-wait.mjs, handed in by tools/shot.mjs: a slow machine counts __game.time slower than
// the clock, and a game that stands still fails at once). The clock counts only where it is the right measure, each
// such line with its reason, `/* clock: <key> */` (tools/clock-waits.mjs): a page that loads, a tap that reaches its
// handler, the panel of a task (it runs its show and its closing on the browser's timers), the watchdog of an item,
// the times printed to the log.
//
// Environment (read here; tools/worlds.mjs sets both for the probe world):
//   E2E_WORLD_NEED=one|grey|template   how many items of a kind the description must have: "one" - one of every kind,
//                                 enough for a test world; "grey" - what a grey build has (WORLD-12): the chains, the
//                                 parts in the world, the tour and the finale of the template, no secret, pet or
//                                 cutscene yet; "template" (default) - the numbers of the world template
//   E2E_WORLD_OUT=<file>          write the report of a pass that came to its end: the world, the size, was the page
//                                 online, the items and the order they were done in
import { writeFileSync } from 'node:fs';

/** The kinds of the items of a description (src/game/world.ts `WorldItemKind`). */
export const ITEM_KINDS = ['chain', 'secret', 'part', 'scene', 'flyover', 'pet', 'finale'];
/** What moves an item on (src/game/world.ts `WorldItem.how`). */
export const HOWS = ['act', 'walk', 'tap', 'auto'];
/** What a test world needs of the world template: one item of every kind (the argument of window.__game.missing). */
export const ONE_OF_EACH = Object.fromEntries(ITEM_KINDS.map((k) => [k, 1]));
/**
 * What a grey build needs (WORLD-12): the characters and their chains, the parts of the artifact in the world, the tour
 * and the finale as the template counts them; the secrets, the pet and the cutscenes come after the customer took it.
 */
export const GREY_BUILD = { chain: 5, part: 2, flyover: 1, finale: 1, secret: 0, pet: 0, scene: 0 };

/**
 * px: the smallest thing a finger takes on the screen (the norm of the project; the interface's buttons keep it): a
 * thing of a task in the world whose kind gives its size (`r` of the door's targets) is measured on the screen by it.
 */
export const MIN_TAP_PX = 48;

/** The things of a task in the world smaller on the screen than a finger: `seen` - [{ px, right }] (the diameter in px). */
export function tapSizeProblems(seen) {
  return seen.filter((t) => t.px !== null && t.px < MIN_TAP_PX).map((t) => `a ${t.right ? 'right' : 'wrong'} thing ${Math.round(t.px)} px across, under ${MIN_TAP_PX}`);
}

/** Seconds of game time: after a teleport the action button on the screen is the one of the new place. */
export const SETTLES = 0.2;
/** Seconds of game time in which the game answers an action (a press, a tap, standing at a place). */
export const REACTS = 3;
/** Seconds of game time in which an item that plays by itself starts. */
export const STARTS = 20;
/** Seconds of game time in which the world opens after "play": its first line, or an item that plays by itself. */
export const OPENS = 20;
/** Seconds of game time an item may stay on (a cutscene, the tour, the finale), or the game may hold the controls. */
export const PLAYS = 180;
/** How many times in a row the action of an item may leave its mark as it was before the item counts as not done. */
export const TRIES = 2;
/** The lines the planner of spoken lines may turn away in this pass (src/core/voice.ts). */
export const MAY_DROP = ['go_next'];

/**
 * E2E_WORLD_NEED: { need, label } - the argument of window.__game.missing (undefined: the numbers of the template) and
 * the words for the log - or { error }.
 */
export function readNeed(text) {
  if (text === '' || text === 'template') return { need: undefined, label: 'the numbers of the world template' };
  if (text === 'one') return { need: ONE_OF_EACH, label: 'one item of every kind' };
  if (text === 'grey') return { need: GREY_BUILD, label: 'what a grey build has (WORLD-12)' };
  return { error: `bad E2E_WORLD_NEED="${text}": expected "one" (one item of every kind), "grey" (a grey build) or "template" (the numbers of the world template)` };
}

/**
 * What is wrong with the description of a world as window.__game shows it: `seen` is { items, missing, problems } -
 * `__game.items`, `__game.missing(need)` and `__game.itemProblems`. The items must be a list of plain values of the one
 * shape; the game itself must find nothing lacking of the world template and nothing that disagrees with what the
 * world declares. Returns the problems, [] when it is right.
 */
export function descriptionProblems(seen) {
  const { items } = seen;
  if (!Array.isArray(items)) return [`window.__game.items is ${items === null ? 'null: the world hands in no description' : typeof items}, expected the list of its items`];
  const out = [];
  const point = (p) => p === null || (typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.z));
  for (const [n, i] of items.entries()) {
    const wrong = [];
    if (!i || typeof i !== 'object') { out.push(`the item ${n} is ${JSON.stringify(i)}, not an item`); continue; }
    if (!ITEM_KINDS.includes(i.kind)) wrong.push(`kind ${JSON.stringify(i.kind)}`);
    if (typeof i.id !== 'string' || !i.id) wrong.push(`id ${JSON.stringify(i.id)}`);
    if (!point(i.at)) wrong.push(`at ${JSON.stringify(i.at)}`);
    if (!HOWS.includes(i.how)) wrong.push(`how ${JSON.stringify(i.how)}`);
    if (!Array.isArray(i.after) || i.after.some((a) => typeof a !== 'string')) wrong.push(`after ${JSON.stringify(i.after)}`);
    if (i.inWorld !== undefined && (i.kind !== 'chain' || !Array.isArray(i.inWorld) || i.inWorld.some((k) => !Number.isInteger(k) || k < 0))) wrong.push(`inWorld ${JSON.stringify(i.inWorld)}`);
    if (typeof i.done !== 'boolean') wrong.push(`done ${JSON.stringify(i.done)}`);
    if (typeof i.active !== 'boolean') wrong.push(`active ${JSON.stringify(i.active)}`);
    if (wrong.length) out.push(`the item ${n} ("${i.id}") is not of the shape of an item: ${wrong.join(', ')}`);
  }
  if (!Array.isArray(seen.missing)) out.push(`window.__game.missing() answered ${JSON.stringify(seen.missing)}, expected a list`);
  else for (const m of seen.missing) out.push(`the description lacks a point of the world template: ${m}`);
  if (!Array.isArray(seen.problems)) out.push(`window.__game.itemProblems is ${JSON.stringify(seen.problems)}, expected a list`);
  else for (const p of seen.problems) out.push(`the description disagrees with what the world declares: ${p}`);
  return out;
}

/**
 * The mark of an item in a world's part of the save (`world`: worlds.<id>, null when there is none): { where, value,
 * set }. The id of an item is the name of its mark - the flag `id`; a chain - quests[id] (a step or more); the
 * finale - `final`.
 */
export function markOf(item, world) {
  if (item.kind === 'chain') { const value = world?.quests?.[item.id]; return { where: `quests.${item.id}`, value, set: Number(value) > 0 }; }
  if (item.kind === 'finale') { const value = world?.final; return { where: 'final', value, set: value === true }; }
  const value = world?.flags?.[item.id];
  return { where: `flags.${item.id}`, value, set: value === true };
}

/**
 * The marks of the items in the stored save. An item that says "done" without its mark, or has the mark and says "not
 * done", is a problem: its `done` does not read the save, and would not survive a reload. (A chain has its mark from
 * its first step on and is done with its last.) Returns the problems, [] when they agree.
 */
export function marksProblems(items, world) {
  const out = [];
  for (const i of items) {
    const m = markOf(i, world);
    if (i.done && !m.set) out.push(`the item "${i.id}" (${i.kind}) is done, but its mark "${m.where}" is ${JSON.stringify(m.value)} in the stored save`);
    if (!i.done && m.set && i.kind !== 'chain') out.push(`the item "${i.id}" (${i.kind}) is not done, but its mark "${m.where}" is set in the stored save`);
  }
  return out;
}

/**
 * The item to do next, by the description alone: the first one of the list that is not done and comes after nothing
 * undone (`after` sets the order, the rest goes in the order of the list). Returns the item; null when every item is
 * done; { stuck: [ids] } when none of the undone ones can be done - each waits for an item that is not done, or not there.
 */
export function nextItem(items) {
  const undone = items.filter((i) => !i.done);
  if (!undone.length) return null;
  const done = (id) => items.find((i) => i.id === id)?.done === true;
  return undone.find((i) => i.after.every(done)) ?? { stuck: undone.map((i) => i.id) };
}

/**
 * How the pass does an item: { steps } - what it does, in order - or { error } for an item its description does not
 * let it do. The steps: 'started' - the item starts by itself, wait for it to be on; 'stand' - stand at `at`;
 * 'button' - the action button must show; 'press' - press it; 'tap' - tap the middle of the screen; 'over' - drive it
 * to its end (tasks, cards, what plays) until it is done. An item that is on already is only driven to its end; one
 * moved on by a tap is tapped first.
 */
export function planFor(item) {
  if (item.active) return { steps: item.how === 'tap' ? ['tap', 'over'] : ['over'] };
  if (item.how === 'auto') return { steps: ['started', 'over'] };
  if (item.how === 'tap') return { steps: item.at ? ['stand', 'tap', 'over'] : ['started', 'tap', 'over'] };
  if (!item.at) return { error: `it is done by "${item.how}" and has no place (at) to do it at` };
  if (item.how === 'act') return { steps: ['stand', 'button', 'press', 'over'] };
  if (item.how === 'walk') return { steps: ['stand', 'over'] };
  return { error: `this pass cannot do an item by "${item.how}"` };
}

/**
 * What the pass does now: { end } - every item is done and nothing is on; { item, steps } - the item and how
 * (`planFor`): the one that is on by itself comes first, whatever the order, then `nextItem`; { item, error } - the
 * item cannot be done by its description; { item, again } - the next item is one the pass has done already (`did`:
 * the ids): it does not stay done; { stuck: [ids] }.
 */
export function nextStep(items, did = []) {
  const on = items.find((i) => i.active);
  const next = on ?? nextItem(items);
  if (!next) return { end: true };
  if (next.stuck) return next;
  if (!on && did.includes(next.id)) return { item: next, again: true };
  return { item: next, ...planFor(next) };
}

/** The items that cannot be done yet: not done, with a place, after an item that is not done (or is not there). */
export function heldBack(items) {
  const done = (id) => items.find((i) => i.id === id)?.done === true;
  return items.filter((i) => !i.done && i.at && !i.after.every(done));
}

/** An item in the words of a failure: its id, its kind, how and where it is done. */
export function itemName(item) {
  const m = (v) => Math.round(v * 100) / 100;      // a place worked out by the game (-0.6000000000000001) reads as -0.6
  return `the item "${item.id}" (${item.kind}, done by "${item.how}"${item.at ? ` at ${m(item.at.x)},${m(item.at.z)}` : ''})`;
}

/** The line of the plan: what the pass is going to do, read from the description. */
export function planLine(worldId, items, label) {
  const one = (i) => `${i.kind} ${i.id} (${i.how}${i.after.length ? `, after ${i.after.join(' ')}` : ''})`;
  return `plan of the world "${worldId}": ${items.length} items of its description - ${items.map(one).join(', ')}; the world template asks for ${label}`;
}

/**
 * The save right after "play" (`stored`: the stored save): the world played has its part, the parts of the worlds the
 * save started with (`kept`: { id: part }) are as they were, the stars too. Returns the problems, [] when it is right.
 */
export function startProblems(stored, worldId, kept, stars) {
  const out = [];
  if (!stored.worlds?.[worldId]) out.push(`the game does not play it: the save has no worlds.${worldId} after "play" (worlds: ${Object.keys(stored.worlds ?? {}).join(', ') || 'none'})`);
  for (const [id, was] of Object.entries(kept)) {
    if (JSON.stringify(stored.worlds?.[id]) !== JSON.stringify(was)) out.push(`worlds.${id} changed at the start: ${JSON.stringify(stored.worlds?.[id])}, was ${JSON.stringify(was)}`);
  }
  if (stored.stars !== stars) out.push(`the save starts with ${stored.stars} stars, not the ${stars} it was given`);
  return out;
}

/** The book (`book`: { parts, got, stars, stats }): a part for every chain, lit for every chain done, the stars of the save. */
export function bookProblems(book, chains, chainsDone) {
  const out = [];
  if (book.parts !== chains) out.push(`${book.parts} parts for ${chains} characters`);
  if (book.got !== chainsDone) out.push(`${book.got} parts lit, ${chainsDone} chains done`);
  if (!book.stats.includes(String(book.stars))) out.push(`the stars ${book.stars} are not in "${book.stats}"`);
  return out;
}

/** The voice at the end (`voice`: { synth, dropped }): the lines left to the synthesizer, and the ones the planner turned away without a reason. */
export function voiceProblems(voice, mayDrop = MAY_DROP) {
  const out = [];
  if (voice.synth.length) out.push(`no recorded clip for: ${voice.synth.join(' ')} (python3 tools/gen_voice.py)`);
  const lost = [...new Set(voice.dropped)].filter((id) => !mayDrop.includes(id));
  if (lost.length) out.push(`the planner turned away lines the scenario gives no reason for: ${lost.join(' ')}`);
  return out;
}

/**
 * The stored save after a reload: the progress of the world played is its own part, exactly as the game held it before
 * the reload (`was`: that part), under worlds.<id> and not on top of the save; the parts of the worlds the save started
 * with (`kept`) are as they were; the stars are the game's (`stars`). Returns the problems, [] when it is right.
 */
export function reloadProblems(stored, worldId, was, kept, stars) {
  const out = [];
  const own = stored.worlds?.[worldId];
  if (!own) out.push(`the stored save has no worlds.${worldId}`);
  else if (JSON.stringify(own) !== JSON.stringify(was)) out.push(`worlds.${worldId} is ${JSON.stringify(own)} in the stored save, the game held ${JSON.stringify(was)}`);
  for (const [id, part] of Object.entries(kept)) {
    if (JSON.stringify(stored.worlds?.[id]) !== JSON.stringify(part)) out.push(`worlds.${id} changed: ${JSON.stringify(stored.worlds?.[id])}, was ${JSON.stringify(part)}`);
  }
  for (const k of ['quests', 'final', 'starsTaken', 'chestOpen', 'flags', 'pos']) if (k in stored) out.push(`"${k}" is on top of the save, not under worlds.<id>`);
  if (stored.stars !== stars) out.push(`${stored.stars} stars stored, ${stars} in the game`);
  return out;
}

/** The stored save after "start again" (`restart`: is the button of a returning player shown): what is left of the old progress, [] when nothing. */
export function restartProblems(stored, restart) {
  const left = [];
  if (stored.stars) left.push(`${stored.stars} stars`);
  if (stored.played) left.push('"played"');
  for (const [id, w = {}] of Object.entries(stored.worlds ?? {})) {
    if (w.final) left.push(`the final (${id})`);
    if (Object.keys(w.quests ?? {}).length) left.push(`quests ${JSON.stringify(w.quests)} (${id})`);
    if (w.starsTaken?.length) left.push(`stars taken ${JSON.stringify(w.starsTaken)} (${id})`);
    if (Object.values(w.flags ?? {}).some(Boolean)) left.push(`flags ${JSON.stringify(w.flags)} (${id})`);
  }
  if (restart) left.push('the "start again" button of a returning player');
  return left;
}

/**
 * The report of a pass (E2E_WORLD_OUT) against what its caller asked for (`want`: { world, size, offline, kinds }): the
 * pass came to its end, in that world and size, with the network as asked, and did an item of every kind of `kinds`.
 * With `want.inWorld` the pass also played a task in the world (`report.worldTasks`). Returns the problems, [] when it is right.
 */
export function reportProblems(report, want) {
  if (!report) return ['it left no report of the pass: it did not come to the end of the description'];
  const out = [];
  if (report.world !== want.world) out.push(`the report is of the world "${report.world}", not "${want.world}"`);
  if (report.size !== want.size) out.push(`the report is of the size "${report.size}", not "${want.size}"`);
  if (report.online !== !want.offline) out.push(`it was played ${report.online ? 'with' : 'without'} the network, the ${want.size} size is played ${want.offline ? 'without' : 'with'} it`);
  const did = (report.items ?? []).filter((i) => (report.order ?? []).includes(i.id));
  for (const k of want.kinds) if (!did.some((i) => i.kind === k)) out.push(`no item of kind "${k}" was done by the pass`);
  if (want.inWorld && !(report.worldTasks ?? []).length) out.push('no task in the world was played by the pass: the world declares one');
  return out;
}

/**
 * The play of a task in the world on a step a chain declares (R97), in order: a) `open` - it is open and waits; b)
 * `wrong` - one wrong move and its course; c) `close` - the close button, nothing recorded, the heroine walks; d)
 * `again` - the action again, the same task anew; e) `solve` - solved through the door, the step recorded.
 */
export const WORLD_TASK_STEPS = ['open', 'wrong', 'close', 'again', 'solve'];
/** Stars a step of a chain gives (src/game/dialogue.ts): the same with or without mistakes. */
export const STEP_STARS = 3;

/**
 * The step of the chain `item` a task in the world has opened at (`part`: the world's part of the save as the game holds
 * it - the step done so far is the one playing): { step, error }. `error`: the description does not declare that step
 * as played in the world (`inWorld`), or the item is no chain - null when it does.
 */
export function worldStepOf(item, part, kind) {
  const step = Number(part?.quests?.[item?.id] ?? 0);
  if (!item || item.kind !== 'chain') return { step, error: `a task in the world ("${kind}") is open ${item ? `in the item "${item.id}" (${item.kind})` : 'between the items'}, and only a step of a chain plays one` };
  const declared = item.inWorld ?? [];
  if (!declared.includes(step)) {
    return { step, error: `a task in the world ("${kind}") opened at step ${step + 1} of the chain "${item.id}", which its description does not declare (inWorld: ${JSON.stringify(declared)}) - world.worldTasks does not name it` };
  }
  return { step, error: null };
}

/** a) and d): the task just opened (`state`: __game.worldTask.state) waits for input, with no mistake, no hint and nothing kept. */
export function openProblems(state, kind) {
  if (!state) return ['no task in the world is open'];
  const out = [];
  if (kind && state.kind !== kind) out.push(`the task is "${state.kind}", not the "${kind}" opened before`);
  if (state.phase !== 'input') out.push(`its phase is "${state.phase}", not "input"`);
  if (state.wrongs !== 0) out.push(`${state.wrongs} wrong move(s) at its start`);
  if (state.rung !== 0) out.push(`the rung ${state.rung} of the hint at its start`);
  if (!Array.isArray(state.progress) || state.progress.length) out.push(`it starts in a middle: ${JSON.stringify(state.progress)}`);
  return out;
}

/**
 * b): after one wrong move and its course (`state`), the lines said since it (`voice`: { started - the lines whose
 * clips were started, synth - the lines left to the synthesizer, line - the line the bubble holds, muted }): one
 * mistake, waiting again, the first rung of the hint; "try again" and the hint by their clips.
 */
export function wrongProblems(state, voice) {
  if (!state) return ['the task in the world is not open after a wrong move'];
  const out = [];
  if (state.wrongs !== 1) out.push(`${state.wrongs} wrong moves counted for one`);
  if (state.phase !== 'input') out.push(`its phase is "${state.phase}", not "input" again`);
  if (state.rung !== 1) out.push(`the rung of the hint is ${state.rung}, not 1`);
  const started = [...new Set(voice.started)];
  if (voice.synth.length) out.push(`lines left to the synthesizer: ${voice.synth.join(' ')}`);
  if (started.length < 2) out.push(`the clips of "try again" and of the hint were not both started (started: ${started.join(' ') || 'none'})`);
  else if (!voice.muted && !started.includes(voice.line)) out.push(`the bubble holds "${voice.line}", whose clip was not started (started: ${started.join(' ')})`);
  return out;
}

/** What a step of a task records, in memory and in the stored save: the world's part (but where she stands), the stars, the skills. */
export const RECORD = (id) => {
  const part = (w) => { const { pos, ...rest } = w ?? {}; return rest; };
  const st = JSON.parse(localStorage.getItem('amw-save') || '{}'), s = window.__game.save;
  return {
    state: window.__game.worldTask.state,
    held: JSON.stringify({ part: part(s.worlds[id]), stars: s.stars, skills: s.skills }),
    stored: JSON.stringify({ part: part(st.worlds?.[id]), stars: st.stars, skills: st.skills }),
  };
};

/** c): closed (`after`) - no task open, and in memory and in the stored save exactly what was there when it opened (`before`). */
export function closeProblems(before, after) {
  const out = [];
  if (after.state) out.push(`the task is still open after its close button: ${JSON.stringify(after.state)}`);
  if (after.held !== before.held) out.push(`the game holds ${after.held}, at its opening ${before.held}`);
  if (after.stored !== before.stored) out.push(`the stored save holds ${after.stored}, at its opening ${before.stored}`);
  return out;
}

/**
 * e): solved (`after`) - no task open; in memory and in the stored save the chain `id` is at step `step` + 1, STEP_STARS
 * more stars, one task more in exactly one skill, the rest of the record as at the opening (`before`).
 */
export function solveProblems(before, after, id, step) {
  if (after.state) return [`the task is still open after solve(): ${JSON.stringify(after.state)}`];
  const out = [];
  for (const where of ['held', 'stored']) {
    const was = JSON.parse(before[where]), now = JSON.parse(after[where]), name = where === 'held' ? 'the game' : 'the stored save';
    if (now.part?.quests?.[id] !== step + 1) out.push(`${name} holds the chain "${id}" at ${JSON.stringify(now.part?.quests?.[id])}, not ${step + 1}`);
    if (now.stars !== was.stars + STEP_STARS) out.push(`${name} holds ${now.stars} stars, ${was.stars} + ${STEP_STARS} expected`);
    const grew = Object.keys(now.skills ?? {}).filter((k) => now.skills[k].tasks !== was.skills?.[k]?.tasks);
    const one = grew.length === 1 && now.skills[grew[0]].tasks === was.skills[grew[0]].tasks + 1;
    if (!one) out.push(`${name}: the tasks of the skills changed in ${grew.map((k) => `${k} ${was.skills?.[k]?.tasks} -> ${now.skills[k].tasks}`).join(', ') || 'none'}, one task more in one skill expected`);
  }
  return out;
}

/** The steps the chains of `items` declare as played in the world that the pass did not meet (`met`: "<id> <step>"), as "<id> <step>". */
export function unmetWorldSteps(items, met) {
  return items.filter((i) => i.kind === 'chain').flatMap((i) => (i.inWorld ?? []).map((k) => `${i.id} ${k}`)).filter((k) => !met.includes(k));
}

// ---- in the page: each function is sent as it is, so it reads nothing but the page ----
/** The description as the game shows it now. */
const LOOK = (need) => ({
  items: window.__game.items,
  missing: typeof window.__game.missing === 'function' ? window.__game.missing(need ?? undefined) : undefined,
  problems: window.__game.itemProblems,
});
/**
 * What is on the screen for the item `id` (null: for none of them), in one word: 'card' - a card of the fanfare; 'task' -
 * a panel task that waits for its answer; 'won' - one that is solved and on its way out; 'on' - the item is on (for
 * null: any item); 'busy' - the game holds the controls; 'over' - the item is done and nothing is going on, or what
 * goes on is another item that has come on (for null: nothing is going on); 'idle' - nothing is going on and the item
 * is not done; 'world' - a task played in the world is open (src/game/worldtasks/core.ts).
 */
const STATE = (id) => {
  const shown = (e) => !document.getElementById(e).classList.contains('hidden');
  const items = window.__game.items ?? [], it = items.find((x) => x.id === id);
  if (shown('fanfare')) return 'card';
  if (shown('task')) return document.getElementById('task').classList.contains('won') ? 'won' : 'task';
  if (window.__game.worldTask?.state) return 'world';
  if (it ? it.active : items.some((x) => x.active)) return 'on';
  if (it && it.done && items.some((x) => x.active)) return 'over';
  if (window.__game.busy) return 'busy';
  return !it || it.done ? 'over' : 'idle';
};
/** A predicate for `gameUntil`: the state of the item a[0] is no longer a[1]. */
const LEFT = `(a) => (${STATE})(a[0]) !== a[1]`;
/** The same as an expression for `page.waitForFunction` (a string is evaluated there as it is, never called). */
const left = (id, was) => `(${LEFT})(${JSON.stringify([id, was])})`;
/** The stored save. */
const STORED = () => JSON.parse(localStorage.getItem('amw-save') || '{}');
/**
 * The watch of the stars: from now on every frame compares the stars of the game with the frame before - they never go
 * down, and a star won is in the stored save in the same frame (window.__stars: { last, drops, unsaved, frames }).
 */
const WATCH_STARS = () => {
  const w = window.__stars = { last: window.__game.save.stars, drops: [], unsaved: [], frames: 0 };
  const look = () => {
    const n = window.__game.save.stars;
    if (n < w.last) w.drops.push(`${w.last} -> ${n}`);
    if (n > w.last) { const st = JSON.parse(localStorage.getItem('amw-save') || '{}'); if (st.stars !== n) w.unsaved.push(`${w.last} -> ${n}, stored ${st.stars}`); }
    w.last = n; w.frames++; requestAnimationFrame(look);
  };
  look();
};

/**
 * Plays the world `h.worldId` by its description. `h` is what tools/shot.mjs hands in: the page and its helpers (`g` -
 * evaluate in the page, `T` - a limit of the clock under E2E_SLOW, `shot` - a picture with the layout check, `tapOn`,
 * `act` - the action button, `why`, `visible`, `gameUntil` - a wait in game time, `fanfareUp` - is the block's own card
 * up (an achievement's scene is closed on the way), `closeBook`, `checkLinks`, `checkQuestion`, `checkVoice`,
 * `checkBank`), the list of `errors`, `QUESTIONS` by task type, the size `mode` and whether it is a `touch` one, the
 * fixed `level`, `stuckMs`, and the save the page started from: `kept` - { id of a world: its part }, which must stay
 * as it is, and `stars`. `o`: { need, out } - E2E_WORLD_NEED and E2E_WORLD_OUT, read from the environment by default.
 * Returns what `checkVoice` found at the end. A failure that ends the pass is thrown.
 */
export async function playWorld(h, o = {}) {
  const { page, g, T, shot, tapOn, act, why, visible, gameUntil, fanfareUp, closeBook, checkLinks, checkQuestion, checkVoice, checkBank,
    errors, QUESTIONS, mode, touch, level, stuckMs, worldId, kept, stars: starsGiven } = h;
  const fail = (what) => { throw new Error(`world "${worldId}": ${what}`); };
  const asked = readNeed(o.need ?? process.env.E2E_WORLD_NEED ?? '');
  if (asked.error) fail(asked.error);
  const out = o.out ?? process.env.E2E_WORLD_OUT ?? '';
  const started = Date.now(); /* clock: log-time */
  const seen = () => g(LOOK, asked.need);
  const itemsNow = () => g(() => window.__game.items);
  const stored = () => g(STORED);
  /** The world's part of the save as the game holds it now (null before the world is entered). */
  const partNow = () => g((id) => window.__game.save.worlds[id] ?? null, worldId);
  /** The game shows itself and its frames run: the screen of a page just loaded is ready for a picture. */
  const shows = (what) => page.waitForFunction(() => !!window.__game?.save && window.__game.time > 0, null, { timeout: T(30000) }) /* clock: page-load */
    .catch(() => fail(`${what}: no window.__game with running frames - the game does not show itself with ?debug`));
  const stateOf = (id) => g(STATE, id);
  /** The state of the item `id` is no longer `was`: true - it changed, false - `seconds` of game time passed first. */
  const leaves = (id, was, seconds) => gameUntil(LEFT, [id, was], seconds);
  const gameSeconds = (s) => gameUntil('() => false', null, s);
  const stand = async (at) => { await g(([x, z]) => window.__game.teleport(x, z), [at.x, at.z]); await gameSeconds(SETTLES); };
  const button = () => gameUntil(() => !document.getElementById('btnAct').classList.contains('hidden'), null, REACTS);
  const tapScreen = () => { const v = page.viewportSize(); return touch ? page.touchscreen.tap(v.width / 2, v.height / 2) : page.mouse.click(v.width / 2, v.height / 2); };
  // The heroine walks: "forward" is held until she has moved half a step in 3 s of game time (as in tools/shot.mjs).
  const walks = async () => {
    const from = await g(() => [window.__game.hero.root.position.x, window.__game.hero.root.position.z]);
    await page.keyboard.down('KeyW');
    try {
      return await gameUntil(([x, z]) => Math.hypot(window.__game.hero.root.position.x - x, window.__game.hero.root.position.z - z) > 0.5, from, 3);
    } finally { await page.keyboard.up('KeyW'); }
  };

  // ---- 1. the start screen ----
  await shows('the start screen');
  const online = await g(() => navigator.onLine);
  await shot('00-start'); await checkLinks('start screen');

  // ---- 2. the description, before "play" ----
  const first = await seen();
  {
    const wrong = descriptionProblems(first);
    if (wrong.length) fail(`its description cannot be played: ${wrong.join('; ')}`);
    console.log(planLine(worldId, first.items, `${asked.label} (E2E_WORLD_NEED)`));
    const early = first.items.filter((i) => i.done || i.active).map((i) => i.id);
    if (early.length) errors.push(`description: ${mode} ${worldId}: in a world not entered yet these items are already done or on: ${early.join(', ')}`);
    for (const p of marksProblems(first.items, (await stored()).worlds?.[worldId] ?? null)) errors.push(`description: ${mode} ${worldId}: before "play": ${p}`);
  }

  // ---- 3. "play" ----
  // The service worker of the built game takes the page some seconds after the first load; a clip of the bank asked
  // for before that is not kept (R37), and `checkBank` wants one kept. The worker is registered on the "load" event of
  // the window: no registration a few seconds later means there will be none (the development server).
  {
    const worker = await page.waitForFunction(async () => (!navigator.serviceWorker ? 'none' : (await navigator.serviceWorker.getRegistration()) ? 'registered' : false), null, { timeout: T(5000) }) /* clock: page-load */
      .then((r) => r.jsonValue(), () => 'none');
    if (worker === 'registered') {
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: T(120000) }).catch(() => fail('the service worker is registered, but did not take the page')); /* clock: page-load */
    }
    console.log(`service worker: ${worker === 'registered' ? 'it has taken the page' : 'none on this page'}`);
  }
  await page.click('#play');
  if (level) await g((d) => { for (const k of Object.keys(window.__game.save.fixed)) window.__game.save.fixed[k] = d; }, Number(level));
  if (!(await gameUntil(() => !document.querySelector('#bubble').classList.contains('hidden') || (window.__game.items ?? []).some((i) => i.active), null, OPENS))) {
    fail(`no line and no item of the description in ${OPENS} s of game time after "play"`);
  }
  // "play" stores the save: the world played has its part in it - the proof that ?world= picked this world
  { const wrong = startProblems(await stored(), worldId, kept, starsGiven); if (wrong.length) fail(wrong.join('; ')); }
  // the stars never go down, and a star won is stored in the same frame (as in the first world)
  await g(WATCH_STARS);
  let starDrops = 0, starUnsaved = 0;
  const starsKept = async (where) => {
    const w = await g(() => ({ drops: window.__stars.drops, unsaved: window.__stars.unsaved, frames: window.__stars.frames }));
    for (const d of w.drops.slice(starDrops)) errors.push(`stars: ${mode}: the number of stars went down ${where}: ${d}`);
    for (const d of w.unsaved.slice(starUnsaved)) errors.push(`stars: ${mode}: stars won ${where} were not stored at once: ${d}`);
    starDrops = w.drops.length; starUnsaved = w.unsaved.length;
    return w.frames;
  };

  // ---- 4. the items ----
  const seenTypes = new Set();
  /** The steps of chains played as a task in the world, "<id> <step>", in the order the pass met them. */
  const metWorld = [];
  const worldState = () => g(() => window.__game.worldTask.state);
  /**
   * A task in the world is open in `item` (src/game/worldtasks/core.ts): it must be at a step the chain declares
   * (`inWorld`), and it is played in the steps of WORLD_TASK_STEPS through the debug door (__game.worldTask), whatever
   * its kind. `again` is the item's action. Every failure names the chain and the step.
   */
  const playWorldTask = async (item, where, again) => {
    const first = await worldState();
    const { step, error } = worldStepOf(item, await partNow(), first?.kind);
    if (error) fail(`${where}: ${error}`);
    const key = `${item.id} ${step}`;
    if (metWorld.includes(key)) fail(`${where}: the task in the world of step ${step + 1} is open again after it was solved`);
    const name = `${where}, step ${step + 1}, the task in the world "${first.kind}"`;
    const bad = (what, list) => { if (list.length) fail(`world task: ${mode} ${name}: ${what}: ${list.join('; ')}`); };
    let before = null;
    const played = [];
    for (const st of WORLD_TASK_STEPS) {
      if (st === 'open') {
        bad('a) open', openProblems(await worldState(), first.kind));
        before = await g(RECORD, worldId);
        // the camera glides to the task's frame: its size on the screen is measured once it is there
        await gameUntil(() => false, null, 2);
        const sizes = await g(() => {
          const d = window.__game.worldTask.targets?.(), cam = window.__game.camera, V = window.__game.THREE?.Vector3;
          if (!d || !cam || !V) return [];
          const right = new V(1, 0, 0).applyQuaternion(cam.quaternion);
          const px = (p) => { const s = p.clone().project(cam); return new V((s.x * 0.5 + 0.5) * innerWidth, (-s.y * 0.5 + 0.5) * innerHeight, 0); };
          return (d?.all ?? []).map((t) => {
            if (t.r === null || t.r === undefined) return { px: null, right: t.right };
            const p = new V(...t.pos);
            return { px: 2 * px(p).distanceTo(px(p.clone().addScaledVector(right, t.r))), right: t.right };
          });
        });
        bad('a) open, the size of its things on the screen', tapSizeProblems(sizes));
        const measured = sizes.filter((t) => t.px !== null);
        if (measured.length) console.log(`world task: ${first.kind}: the things to tap ${measured.map((t) => Math.round(t.px)).join(', ')} px across (at least ${MIN_TAP_PX})`);
        await shot(`world-task-${first.kind}`);
      } else if (st === 'wrong') {
        const v0 = await g(() => ({ starts: { ...(window.__starts ?? {}) }, synth: window.__game.voice.synth.length }));
        if (!(await g(() => window.__game.worldTask.wrong()))) fail(`world task: ${mode} ${name}: b) no wrong move can be made through the door`);
        // the course of the mistake: "try again" and the hint are said to their end, then the rung shows
        if (!(await gameUntil(() => { const t = window.__game.worldTask.state; return !t || (t.phase === 'input' && t.rung >= 1); }, null, PLAYS))) {
          fail(`world task: ${mode} ${name}: b) the course of the wrong move did not come back to input on rung 1 in ${PLAYS} s of game time: ${JSON.stringify(await worldState())}`);
        }
        const voice = await g((was) => ({
          started: Object.keys(window.__starts ?? {}).filter((k) => window.__starts[k] > (was.starts[k] ?? 0)),
          synth: window.__game.voice.synth.slice(was.synth), line: window.__game.line, muted: window.__game.save.vol.voice === 0,
        }), v0);
        bad('b) a wrong move', wrongProblems(await worldState(), voice));
        await shot(`world-task-${first.kind}-hint1`);
      } else if (st === 'close') {
        if (!(await g(() => window.__game.worldTask.close()))) fail(`world task: ${mode} ${name}: c) the door found no task to close`);
        if (!(await gameUntil(() => !window.__game.worldTask.state && !window.__game.busy, null, REACTS))) fail(`world task: ${mode} ${name}: c) after its close button the task or its scene is still on`);
        bad('c) closed', closeProblems(before, await g(RECORD, worldId)));
        if (!(await walks())) fail(`world task: ${mode} ${name}: c) closed: the heroine does not walk`);
      } else if (st === 'again') {
        await again();
        // a task that opens where she goes (the sea's shell lock at the gate, WorldTask.endsInWorld): the action asks for
        // it again, and the world's move (__game.cheat) brings her there
        for (let i = 0; i < 3 && !(await gameUntil(() => !!window.__game.worldTask.state, null, REACTS)); i++) {
          if (!(await g(() => window.__game.cheat()))) break;
        }
        if (!(await gameUntil(() => !!window.__game.worldTask.state, null, STARTS))) fail(`world task: ${mode} ${name}: d) the action again did not open the task in ${STARTS} s of game time`);
        bad('d) opened again', openProblems(await worldState(), first.kind));
      } else if (st === 'solve') {
        if (!(await g(() => window.__game.worldTask.solve()))) fail(`world task: ${mode} ${name}: e) the door found no task to solve`);
        const recorded = ([w, id, k]) => !window.__game.worldTask.state && (window.__game.save.worlds[w]?.quests?.[id] ?? 0) > k;
        if (!(await gameUntil(recorded, [worldId, item.id, step], STARTS))) fail(`world task: ${mode} ${name}: e) solved, but the task did not end with its step recorded in ${STARTS} s of game time`);
        bad('e) solved', solveProblems(before, await g(RECORD, worldId), item.id, step));
      }
      played.push(st);
    }
    metWorld.push(key);
    console.log(`world task: ${item.id} step ${step + 1} "${first.kind}": ${played.join(', ')} - opened waiting, a wrong move on rung 1 with its clips, closed with nothing recorded and the heroine walking, opened anew, solved and recorded`);
  };
  /** The card of the fanfare that is up: an achievement's scene is closed by `fanfareUp`, the block's own is pictured and closed here. */
  const closeCard = async (where, picture) => {
    if (!(await fanfareUp(where))) return;
    await picture();
    const title = await g(() => document.querySelector('#fanfareTitle').textContent);
    await tapOn('#fanfareOk').catch((e) => fail(`${where}: the button of its card cannot be pressed: ${why(e)}`));
    // the card is gone, or the next one has taken its place
    await page.waitForFunction((t) => document.querySelector('#fanfare').classList.contains('hidden') || document.querySelector('#fanfareTitle').textContent !== t
      || document.querySelector('#fanfare').classList.contains('ach'), title, { timeout: T(15000) }).catch(() => {}); /* clock: input-event */
  };
  /** The panel task that is open: pictured and its question checked at the first meeting of its type, then solved. */
  const solveTask = async (where) => {
    const t = await g(() => ({ type: document.querySelector('#taskStage').className.split(' t-')[1].split(' ')[0], planned: window.__game.inTask }));
    if (!t.planned) errors.push(`world "${worldId}": a task is open, but the planner of spoken lines does not know it`);
    if (!seenTypes.has(t.type)) {
      seenTypes.add(t.type);
      // the question is in the bubble and the task has ended its own show (a sequence to repeat is shown first)
      await page.waitForFunction(() => !document.querySelector('#bubble').classList.contains('hidden') && window.__game.line !== null
        && !document.querySelector('#taskStage').classList.contains('watch'), null, { timeout: T(20000) }).catch(() => {}); /* clock: dom-anim */
      await shot(`task-${t.type}`);
      if (QUESTIONS[t.type]) await checkQuestion(t.type);
    }
    if (!(await g(() => window.__game.cheat()))) fail(`__game.cheat() did nothing for the "${t.type}" task of ${where}`);
    return t.type;
  };
  /**
   * Drives what is going on to its end. With an item: until it is done and nothing is going on; `again` repeats its
   * action when nothing is going on and it is still not done. Without one: until the controls are back, or an item of
   * the description has come on (the caller then does that item). `picture(name)` takes a picture once.
   */
  const drive = async (item, where, again, picture) => {
    const id = item?.id ?? null, t0 = Date.now(); /* clock: stuck-guard */
    let was = item ? markOf(item, await partNow()) : null;
    let fruitless = 0, cheats = 0, moves = 0, taps = 0, cards = 0, played = false;
    for (;;) {
      if (Date.now() - t0 > T(stuckMs)) fail(`item stuck: ${where} is not over after ${T(stuckMs)} ms (E2E_STUCK_MS)`); /* clock: stuck-guard */
      const s = await stateOf(id);
      if (s === 'over') return;
      if (s === 'card') {
        if (++cards > 20) fail(`${where}: the card of the fanfare does not close`);
        await closeCard(where, () => picture(`card-${id}`));
      } else if (s === 'world') {
        await playWorldTask(item, where, again);
      } else if (s === 'task') {
        // a step the chain declares as played in the world must not come as a card
        if (item?.kind === 'chain' && worldStepOf(item, await partNow(), 'card').error === null) {
          fail(`${where}: a card instead of the task in the world declared at step ${Number((await partNow())?.quests?.[item.id] ?? 0) + 1} (inWorld: ${JSON.stringify(item.inWorld)})`);
        }
        if (++cheats > 5) fail(`${where}: __game.cheat() does not solve its task`);
        await solveTask(where);
        if (await leaves(id, 'task', 5)) cheats = 0;        // won, or gone
      } else if (s === 'won') {
        await page.waitForFunction(left(id, 'won'), null, { timeout: T(20000) }).catch(() => fail(`${where}: the solved task stays on the screen`)); /* clock: dom-anim */
      } else if (s === 'on') {
        if (!item) return;
        played = true;
        await picture(`item-${id}-on`);
        if (item.how === 'tap') {
          if (++taps > 20) fail(`${where} is still on after ${taps - 1} taps on the screen`);
          await tapScreen(); await leaves(id, 'on', REACTS);
        } else if (!(await leaves(id, 'on', PLAYS))) fail(`${where} is still on after ${PLAYS} s of game time: its "active" does not end`);
      } else if (s === 'busy') {
        if (!(await leaves(id, 'busy', PLAYS))) fail(`item stuck: ${where} - the game holds the controls for ${PLAYS} s of game time`);
      } else {
        // 'idle': nothing is going on and the item is not done. A task of the world itself (in the foreground or the
        // background) is not a panel: the world's cheat does its right move.
        const how = await g(() => window.__game.cheat());
        if (how) {
          if (++moves > 200) fail(`${where}: 200 moves of __game.cheat() did not end the "${how}" task of the world`);
          if (!seenTypes.has(how)) { seenTypes.add(how); await shot(`task-${how}`); }
          await leaves(id, 'idle', 0.7);
          continue;
        }
        // The action is tried again; an action that leaves the mark of the item as it was has done nothing.
        const now = markOf(item, await partNow());
        if (now.set && item.kind !== 'chain') fail(`${where} is not done, but its mark "${now.where}" is set in the save: its "done" does not read its mark`);
        fruitless = JSON.stringify(now.value) === JSON.stringify(was.value) ? fruitless + 1 : 0;
        was = now;
        if (fruitless >= TRIES) fail(`${where} was not done in the game: ${played ? 'it has played, and ' : ''}its action was tried ${TRIES} times and its mark "${now.where}" stays ${JSON.stringify(now.value)}`);
        await again();
        await leaves(id, 'idle', REACTS);
      }
    }
  };
  /** Does one item the way its plan says; fails with its id. */
  const doItem = async (item, steps) => {
    const where = itemName(item), t0 = Date.now(), starsBefore = await g(() => window.__game.save.stars); /* clock: log-time */
    const pictured = new Set();
    const picture = async (name) => { if (!pictured.has(name)) { pictured.add(name); await shot(name); } };
    const action = async () => {
      for (const s of steps) {
        if (s === 'started') {
          if (!(await gameUntil((i) => window.__game.items.some((x) => x.id === i && (x.active || x.done)), item.id, STARTS))) fail(`${where} plays by itself, but did not start in ${STARTS} s of game time`);
        } else if (s === 'stand') await stand(item.at);
        else if (s === 'button') {
          if (!(await button())) fail(`${where}: no action button at its place`);
          await picture(`item-${item.id}`);
        } else if (s === 'press') await act();
        else if (s === 'tap') await tapScreen();
      }
    };
    await action();
    await leaves(item.id, 'idle', REACTS);            // the game takes a press in its next frame
    await drive(item, where, action, picture);
    if (!pictured.size) await picture(`item-${item.id}`);
    await starsKept(`in ${where}`);
    const secs = ((Date.now() - t0) / 1000).toFixed(0); /* clock: log-time */
    if (item.kind !== 'chain') { console.log(`item done: ${item.kind} ${item.id} by "${item.how}", ${secs}s`); return; }
    // a chain: the counter of the parts and the stars it gave
    const items = await itemsNow(), chains = items.filter((i) => i.kind === 'chain');
    const c = await g(() => ({ hud: document.querySelector('#crystals').textContent, stars: window.__game.save.stars }));
    const want = `${chains.filter((i) => i.done).length}/${chains.length}`;
    if (c.hud !== want) errors.push(`crystals: ${mode} ${worldId}: the counter shows ${c.hud} with ${want.replace('/', ' of ')} chains done`);
    if (!(c.stars > starsBefore)) errors.push(`stars: ${mode} ${worldId}: the chain of "${item.id}" gave no stars (${starsBefore} -> ${c.stars})`);
    console.log(`chain done: ${item.id} (${markOf(item, await partNow()).value} steps), ${secs}s, counter ${c.hud}, stars ${starsBefore} -> ${c.stars}`);
  };
  /** The order of `after`: at the place of an item that comes after an undone one, nothing can be done yet. */
  const orderKept = async (items) => {
    for (const it of heldBack(items)) {
      await stand(it.at);
      await gameSeconds(SETTLES);
      const now = (await itemsNow()).find((x) => x.id === it.id);
      const waits = it.after.filter((a) => !items.find((x) => x.id === a)?.done).join(', ');
      if (now.done || now.active) errors.push(`order: ${mode} ${worldId}: ${itemName(it)} was done by standing at its place before ${waits}: the game does not keep the order of "after"`);
      else if (it.how === 'act' && await visible('#btnAct')) errors.push(`order: ${mode} ${worldId}: ${itemName(it)} has its action button before ${waits} are done: the game does not keep the order of "after"`);
    }
  };

  const did = [];           // the ids of the items in the order the pass did them
  for (let spawned = false; ;) {
    await drive(null, did.length ? `after the item "${did[did.length - 1]}"` : 'after "play"', null, async () => {});
    const items = await itemsNow();
    const step = nextStep(items, did);
    if (step.end) break;
    if (step.stuck) fail(`no item can be done next: ${step.stuck.join(', ')} are not done, and each comes after an item that is not`);
    if (step.again) fail(`${itemName(step.item)} is asked for again: it does not stay done`);
    if (step.error) fail(`${itemName(step.item)}: ${step.error}`);
    // the first moment nothing plays by itself: the world as the player gets it, and the order of "after"
    if (!spawned && !step.item.active) { spawned = true; await shot('01-spawn'); await orderKept(items); }
    await doItem(step.item, step.steps);
    did.push(step.item.id);
  }

  // ---- 5. the end: everything is done, each mark is in the stored save under the id of its item ----
  const last = await seen();
  await shot('20-done');
  for (const p of descriptionProblems(last)) errors.push(`description: ${mode} ${worldId}: at the end: ${p}`);
  for (const p of marksProblems(last.items, (await stored()).worlds?.[worldId] ?? null)) errors.push(`description: ${mode} ${worldId}: at the end: ${p}`);
  const chains = last.items.filter((i) => i.kind === 'chain'), chainsDone = chains.filter((i) => i.done).length;
  // every step declared as played in the world was met as one (a step played as a card, or by another way, was not)
  {
    const unmet = unmetWorldSteps(last.items, metWorld);
    if (unmet.length) errors.push(`world task: ${mode} ${worldId}: steps declared as tasks in the world that the pass never met as one: ${unmet.map((k) => { const [id, n] = k.split(' '); return `"${id}" step ${Number(n) + 1}`; }).join(', ')}`);
    console.log(`tasks in the world: ${metWorld.length ? metWorld.join(', ') : 'none'} of the declared ${chains.flatMap((i) => (i.inWorld ?? []).map((k) => `${i.id} ${k}`)).join(', ') || 'none'}`);
  }
  // the book: one part per character, lit for every chain done, the stars of the save
  await tapOn('#btnBook').catch((e) => fail(`the book cannot be opened: ${why(e)}`));
  await page.waitForFunction(() => !document.querySelector('#book').classList.contains('hidden'), null, { timeout: T(15000) }).catch(() => fail('the book did not open')); /* clock: input-event */
  await shot('30-book'); await checkLinks('collection book');
  {
    const b = await g(() => {
      const parts = [...document.querySelectorAll('#shards .shard')];
      return { parts: parts.length, got: parts.filter((e) => e.classList.contains('got')).length, stars: window.__game.save.stars, stats: document.querySelector('#colStats')?.textContent ?? '' };
    });
    const left = bookProblems(b, chains.length, chainsDone);
    if (left.length) errors.push(`book: ${mode} ${worldId}: ${left.join('; ')}`);
    else console.log(`book: ${b.got} of ${b.parts} parts, ${b.stars} stars`);
  }
  await closeBook().catch((e) => fail(`the book cannot be closed: ${why(e)}`));
  // the checks every world shares: the voice, the planner of spoken lines, the frame counter
  let voiceUsed;
  {
    const frames = await starsKept(`by the end of the world "${worldId}"`);
    if (!frames) errors.push(`stars: ${mode}: the watch of the stars saw no frame`);
    const voice = await g(() => ({ clips: window.__game.voice.clips, synth: [...new Set(window.__game.voice.synth)], dropped: [...window.__game.dropped] }));
    console.log(`voice: ${voice.clips} clips sounded, lines left to the synthesizer: ${voice.synth.length ? voice.synth.join(' ') : 'none'}`);
    voiceUsed = await checkVoice('at the end');
    await checkBank();
    console.log(`lines turned away by the planner: ${voice.dropped.join(' ') || 'none'}`);
    errors.push(...voiceProblems(voice));
    const counter = await page.textContent('#fps').catch(() => null);
    if (!/^\d+ fps · q[0-2] · \d+k tris · \d+ calls$/.test(counter ?? '')) errors.push(`with ?debug the frame counter does not show the frames: "${counter}"`);
    console.log('task types seen:', [...seenTypes].join(' '));
  }

  // ---- 6. a reload: "done" is read from the save; the progress is the world's own, under worlds.<id> ----
  const before = { stars: await g(() => window.__game.save.stars), part: await partNow() };
  await page.reload(); await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
  await shows('after a reload');
  {
    const s1 = await stored(), again = await seen();
    const left = reloadProblems(s1, worldId, before.part, kept, before.stars);
    for (const p of descriptionProblems(again)) left.push(p);
    if (Array.isArray(again.items)) {
      const lost = again.items.filter((i) => !i.done).map((i) => i.id);
      if (lost.length) left.push(`these items are not done any more: ${lost.join(', ')} - their marks are not in the save`);
      const on = again.items.filter((i) => i.active).map((i) => i.id);
      if (on.length) left.push(`these items are on before "play": ${on.join(', ')}`);
      left.push(...marksProblems(again.items, s1.worlds?.[worldId] ?? null));
    }
    if (left.length) errors.push(`reload: ${mode} ${worldId}: ${left.join('; ')}`);
    else console.log(`reload: worlds.${worldId} ${JSON.stringify(s1.worlds[worldId].quests)}, every item still done, ${Object.keys(kept).map((id) => `worlds.${id}`).join(', ') || 'no other world'} as it was, ${s1.stars} stars`);
  }
  await shot('40-start-again');
  // "start again": the save of a new player, every world of it cleared
  {
    const had = await stored();
    await Promise.all([page.waitForEvent('load', { timeout: T(90000) }), tapOn('#restart')]).catch((e) => fail(`start again: the button did not reload the game: ${why(e)}`)); /* clock: page-load */
    await page.waitForSelector('#play', { state: 'visible', timeout: T(90000) }); /* clock: page-load */
    const left = restartProblems(await stored(), await visible('#restart'));
    if (left.length) fail(`start again: after the reload the old progress is back: ${left.join(', ')}`);
    console.log(`start again: ${had.stars} stars and worlds ${Object.keys(had.worlds ?? {}).join(', ')} cleared, the start screen of a new player`);
  }
  // an item the pass never did itself was done by the game on the way (another item brought it): said, not hidden
  const onTheWay = last.items.filter((i) => !did.includes(i.id)).map((i) => i.id);
  console.log(`world "${worldId}": ${last.items.length} items of its description done in the order ${did.join(', ')}${onTheWay.length ? ` (done on the way: ${onTheWay.join(', ')})` : ''}; `
    + `${chainsDone} of ${chains.length} chains; ${((Date.now() - started) / 1000).toFixed(0)}s`); /* clock: log-time */
  if (out) writeFileSync(out, JSON.stringify({ world: worldId, size: mode, online, need: asked.label, items: last.items.map((i) => ({ kind: i.kind, id: i.id, how: i.how })), order: did, worldTasks: metWorld }) + '\n');
  return voiceUsed;
}
