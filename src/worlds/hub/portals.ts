/**
 * Which world each arch of the hub leads to (docs/worlds/hub.md, WORLD-01, R32): the world of the registry with that
 * place on the shelf (WorldDef.shelf). A test world (the probe world, TECH-15) has no place: it stands behind the first
 * arch no world has - in the probe build that is the forest's, so the walkthrough goes "hub -> the second portal -> back".
 * An arch with no world sleeps. Read from what the registry handed in at the start (src/game/artifacts.ts).
 */
export interface PortalWorld { readonly id: string; readonly shelf?: number; readonly test?: boolean }

export function portalWorlds(worlds: readonly PortalWorld[], places = 5): (string | null)[] {
  const out = Array.from({ length: places }, (_, i) => worlds.find((w) => w.shelf === i)?.id ?? null);
  const test = worlds.find((w) => w.test && w.shelf === undefined);
  const free = out.indexOf(null);
  if (test && free >= 0) out[free] = test.id;
  return out;
}
