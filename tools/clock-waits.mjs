// The waits of the walkthroughs that are allowed to count the wall clock (tools/clock-waits.test.mjs holds them to it).
// What the game does in its own time - a scene, a step of a task, the camera, a creature, the magic - is waited for by
// the game's clock (gameUntil in tools/shot.mjs) or by an event of the game: on the slow CI runner a second of game time
// takes many of the wall clock, so a wait by the clock there was the most common red run of a day. A wait by the clock
// stays only where the clock is the right measure, and says which of the reasons below it has: `/* clock: <key> */` on
// the same line. A new wait without a known key fails the test.

/** Reason of each kind of wait by the wall clock, in one line. */
export const CLOCK_REASONS = {
  'page-load': 'the page loads, reloads or opens again: the network, the parsing and the service worker are wall-clock things',
  audio: 'a clip of the voice starts, sounds, pauses or plays on: sound runs on the audio clock, not the game\'s',
  'dom-anim': 'an element of the page enters or fades (a CSS animation or transition): the browser runs it by the wall clock',
  'input-event': 'a real tap, click or key reaches the page and its handler: the wall clock only bounds the delivery',
  ceiling: 'the wall-clock ceiling of a wait by the game\'s clock: only a game that stopped altogether reaches it',
  'stuck-guard': 'the watchdog of a whole loop (a quest chain): it ends a run that makes no progress at all',
  measure: 'a tool for a person (frames a second, close-up pictures, the budget), not a check: the wall clock is what it measures',
  'log-time': 'a time printed to the log for a person to read (how long a block took): it checks nothing',
  'no-debug': 'the published game without ?debug: there is no window.__game, so no game clock to read',
  'quiet-window': 'a window in which nothing may happen (no request, no error) on a page with no game running',
  helper: 'the definition of a wait helper (T, wait, gameUntil): the places that call it carry their own reason',
  'moves-to-world-pass': 'inside playWorld of tools/shot.mjs, which the walk of a world by its description takes over (tools/world-pass.mjs) with its own waits',
  'pending-part-2': 'a bare pause that part 2 of the clean-up turns into a wait for a sign of the game or the page',
};

/** How many waits are still marked `pending-part-2`: the number may only go down (part 2 brings it to 0). */
export const PENDING = 58;

/** How many waits are marked `moves-to-world-pass`: they leave with playWorld; the number may only go down. */
export const MOVING = 18;

/**
 * Files of another stream whose waits are only listed here, not marked: the number of their unmarked waits may only go
 * down. (tools/worlds.mjs belongs to the world probe; its list went to its stream.)
 */
export const FOREIGN = { 'tools/worlds.mjs': 32 };
