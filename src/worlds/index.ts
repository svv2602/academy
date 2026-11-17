// The registry of worlds (ARCH-06): one entry per world in WORLDS. The world the published game plays is named in
// DEFAULT_WORLD, not taken from the order of the list (`?world=<id>` with `?debug` picks another,
// src/game/world.ts `pickWorld`).
import { fairy } from './fairy';

// The probe world (./probe, TECH-15) is a test world: it is listed only in a build made with `--mode probe`
// (tools/worlds.mjs builds dist-probe/ and plays it there). In any other mode the condition is a constant false, so
// the build holds neither its code nor its files: `npm run e2e` checks dist/ for that (the step "worlds").
export const WORLDS = [fairy, ...(import.meta.env.MODE === 'probe' ? [(await import('./probe')).probe] : [])];
/** The id of the world the published game plays. */
export const DEFAULT_WORLD = 'fairy';
