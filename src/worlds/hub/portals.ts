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

/**
 * Which arches are open (docs/worlds/hub.md «Какая арка открыта», the lead's decision 2026-11-22, the explorer's key
 * of 2026-11-28): an arch whose world is in the registry (`leadsTo`, from `portalWorlds`) wakes once the world before it
 * is ready - the world of the nearest place before it that has one (the forest after the fairies, the sea after the
 * forest; with no forest in a build, the sea after the fairies). Ready: its final reached and half of it explored, or
 * its final alone with the parents' free pass (src/worlds/hub/index.ts `readyIn`, src/game/explore.ts). An arch once
 * open never closes (`kept`: it woke before, or its world was played) - the key came after saves that went on by the
 * artifact alone. The first place is open with its world. A world not yet woken: null, its arch sleeps or dozes.
 * Every build lists all five worlds (src/worlds/index.ts).
 */
export function openArches(leadsTo: readonly (string | null)[], ready: (id: string) => boolean, kept: (shelf: number, id: string) => boolean = () => false): (string | null)[] {
  let before: string | null = null;
  return leadsTo.map((id, i) => {
    const open = id !== null && (i === 0 || (before !== null && ready(before)) || kept(i, id));
    if (id !== null) before = id;
    return open ? id : null;
  });
}

/**
 * The arches that doze (the explorer's key, «Арка ще дрімає»): their world in the registry and the world before them
 * done, but not open - the world before not explored enough. Each with that world, the one to explore more.
 */
export function dozingArches(leadsTo: readonly (string | null)[], open: readonly (string | null)[], done: (id: string) => boolean): { shelf: number; before: string }[] {
  const out: { shelf: number; before: string }[] = [];
  let before: string | null = null;
  leadsTo.forEach((id, shelf) => {
    if (id !== null && open[shelf] === null && before !== null && done(before)) out.push({ shelf, before });
    if (id !== null) before = id;
  });
  return out;
}

/** The flag of the hub's part of the save that marks the arch of a place of the shelf awake (./index.ts, `wakingArches`). */
export const woke = (shelf: number) => `woke${shelf}`;

/**
 * The arches that wake as she comes into the hub (docs/worlds/hub.md «Сценарий первого входа», step 4): open
 * (`openArches`) and not marked awake in the hub's flags - the forest's after the fairies are done, the sea's after the
 * forest. The first arch, the fairies', is open from the start and never wakes. `heard` - a flag of the world's own
 * that already marks its word of waking said (the sea's `sea_wake`, before the flags of waking): such an arch is awake.
 */
export function wakingArches(open: readonly (string | null)[], flags: Readonly<Record<string, unknown>>, heard: Readonly<Record<string, string>> = {}): number[] {
  return open.flatMap((id, shelf) => (shelf > 0 && id !== null && flags[woke(shelf)] !== true && !(heard[id] && flags[heard[id]] === true) ? [shelf] : []));
}
