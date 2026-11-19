// What CI plays for each world (ARCH-16): the files that are the world's own and the jobs that play it.
// tools/ci-pieces.mjs reads this table to choose the jobs of a run by the files that changed; a file that belongs to
// no world here (and is no document) is shared, and a shared file plays every world.
// Plain data and pure functions, no disk: the sizes and the pieces are checked against tools/e2e.mjs and both
// workflows by tools/ci-pieces.test.mjs.
import { PIECES } from './e2e-saves.mjs';

/** The screen sizes a world is played in, in the order of tools/e2e.mjs (the sizes themselves: tools/shot.mjs). */
export const SIZES = ['mobile', 'desktop', 'desktop-tall', 'mobile-portrait'];

/**
 * Where a world keeps its files, as folders ending with "/": the code, the three folders of the build a next world
 * has of its own (tools/world-files.mjs) and the files of a test world outside public/.
 */
export const worldFiles = (id) => [`src/worlds/${id}/`, ...['models', 'voice', 'story'].map((f) => `public/${f}/${id}/`), `worlds-test/${id}/`];

/**
 * The worlds CI knows: `files` - the folders that are the world's own; `walk` - its walkthrough jobs, a size and a
 * piece each (`npm run e2e -- --mode <size> --only <group>`); `worlds` - whether the job "worlds" plays it
 * (tools/worlds.mjs: the probe build and the world in it).
 * The first world lies as it always did (decision Q1): its models and voice are mixed with the shared ones under
 * public/, so only its code is its own - everything else of it counts as shared and plays everything.
 * The probe world is played by the job "worlds" alone; a file of it under public/ would be a mistake (the published
 * build must hold nothing of it), so public/ is not listed and such a file plays everything.
 * A new world: add it here with worldFiles(<id>) and its jobs.
 */
export const WORLDS = {
  fairy: { files: ['src/worlds/fairy/'], walk: SIZES.flatMap((size) => PIECES.map((group) => ({ size, group }))), worlds: false },
  // The hub (WORLD-01): no walkthrough of its own yet (the hub's piece comes with its pass, checklist F); a change of it
  // plays the job "worlds", which goes through the change of world.
  hub: { files: worldFiles('hub'), walk: [], worlds: true },
  probe: { files: ['src/worlds/probe/', 'worlds-test/probe/'], walk: [], worlds: true },
};
