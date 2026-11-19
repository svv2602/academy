import type { Save, WorldState } from '../core/save';

/**
 * The artifacts the heroine has brought back (WORLD-01, the hub's tree, the shelf of the book): one per world that
 * has one - a world with a place on the shelf (`WorldDef.shelf`) - brought back when its final is played
 * (`save.worlds[<id>].final`). Read from the save alone, nothing stored of its own: the hub (its tree grows by their
 * number, R33), the shelf and the shop count the same.
 *
 * The worlds come from the registry (src/worlds/index.ts), handed in by src/main.ts at the start (`knowWorlds`): the
 * game's own code never imports the registry (it imports the game).
 */
export interface ArtifactWorld { readonly id: string; readonly shelf?: number }

let known: readonly ArtifactWorld[] = [];
/** The worlds of the registry with their places on the shelf (src/main.ts, at the start). */
export function knowWorlds(worlds: readonly ArtifactWorld[]): void { known = worlds; }
/** The worlds known, for the shelf (src/ui/book.ts). */
export const knownWorlds = (): readonly ArtifactWorld[] => known;

/** The stored progress of a world, read without creating it (asking changes nothing). */
const stored = (save: Save, id: string): Partial<WorldState> => {
  const w = save.worlds[id] as unknown;
  return typeof w === 'object' && w !== null ? w as Partial<WorldState> : {};
};

/** Whether the artifact of the world `id` is back. */
export const artifactBack = (save: Save, id: string): boolean => stored(save, id).final === true;

/** The ids of the worlds whose artifacts are back, in the order of their places on the shelf. */
export function artifactsBack(save: Save, worlds: readonly ArtifactWorld[] = known): string[] {
  return worlds.filter((w) => w.shelf !== undefined && artifactBack(save, w.id))
    .sort((a, b) => a.shelf! - b.shelf!).map((w) => w.id);
}

/** How many artifacts are back: the stage of the hub's tree (R11, R33). */
export const artifactCount = (save: Save, worlds: readonly ArtifactWorld[] = known): number => artifactsBack(save, worlds).length;
