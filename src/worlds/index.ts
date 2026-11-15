// The registry of worlds (ARCH-06): one entry per world in WORLDS. The world the published game plays is named in
// DEFAULT_WORLD, not taken from the order of the list (`?world=<id>` with `?debug` picks another,
// src/game/world.ts `pickWorld`).
import { fairy } from './fairy';

export const WORLDS = [fairy];
/** The id of the world the published game plays. */
export const DEFAULT_WORLD = 'fairy';
