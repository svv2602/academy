/**
 * Which world each arch of the hub leads to (docs/worlds/hub.md, WORLD-01, R32): the world of the registry with that
 * place on the shelf (WorldDef.shelf). A test world (the probe world, TECH-15) has no place: it stands behind the first
 * arch no world has - in the probe build that is the forest's, so the walkthrough goes "hub -> the second portal -> back".
 * An arch with no world sleeps. Read from what the registry handed in at the start (src/game/artifacts.ts).
 */
export interface PortalWorld { readonly id: string; readonly shelf?: number; readonly test?: boolean }

/**
 * Whether an open arch leads to a world not done yet (its final not reached): where the cat's sparkles lead (R10).
 * None - every open world is done and the others sleep: nothing new in the hub.
 */
export function somethingNew(leadsTo: readonly (string | null)[], done: (id: string) => boolean): boolean {
  return leadsTo.some((id) => id !== null && !done(id));
}

/** m from a sleeping arch where the cat says its world sleeps; she must go past `SLEEP_FAR` before it says it again. */
export const SLEEP_NEAR = 3.2, SLEEP_FAR = 6;

/**
 * Which sleeping arch the cat speaks of now (D, «Цей світ ще спить»), she standing at (x, z): the first one within
 * SLEEP_NEAR not spoken of since she came near it. `heard` holds the shelves spoken of; a shelf leaves it once she is
 * past SLEEP_FAR, so walking up again brings the line again, standing by it does not repeat it. Null - none.
 */
export function sleepingToSpeakOf(x: number, z: number, sleeping: readonly { shelf: number; x: number; z: number }[], heard: Set<number>): number | null {
  let out: number | null = null;
  for (const a of sleeping) {
    const d = Math.hypot(a.x - x, a.z - z);
    if (d > SLEEP_FAR) heard.delete(a.shelf);
    else if (d < SLEEP_NEAR && out === null && !heard.has(a.shelf)) out = a.shelf;
  }
  if (out !== null) heard.add(out);
  return out;
}

export function portalWorlds(worlds: readonly PortalWorld[], places = 5): (string | null)[] {
  const out = Array.from({ length: places }, (_, i) => worlds.find((w) => w.shelf === i)?.id ?? null);
  const test = worlds.find((w) => w.test && w.shelf === undefined);
  const free = out.indexOf(null);
  if (test && free >= 0) out[free] = test.id;
  return out;
}
