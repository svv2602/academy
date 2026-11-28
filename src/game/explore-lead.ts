import * as THREE from 'three';
import { speaking } from '../core/audio';
import type { Game } from './context';
import { knownWorlds } from './artifacts';
import { exploreOf, fullyExplored, gatesArch, halfExplored, type Explored } from './explore';
import { setExploreRow } from '../ui/explore';

/**
 * The explorer's key in the world played (PLAY-36, ./explore.ts): once its final is played and too little of it is
 * explored for the next arch, the cat says so once (`explore_more` - she may never go back to the hub to see the arch
 * doze) and its sparkles lead to the nearest thing not found (a secret, a find, a mysterious star); the half got after
 * that word - `explore_half`; every point - `explore_full`. Each word once, marked by its flag in the world's part of
 * the save. With the parents' free pass, or in the last world (no arch after it), only the last.
 */

/** The flags of the three words (the world's own part of the save) - also the keys of the lines. */
export const EXPLORE_WORDS = { more: 'explore_more', half: 'explore_half', full: 'explore_full' } as const;
/** s between two counts of the points (read from the save, nothing pushed). */
const EVERY = 0.5;

export interface ExploreLead {
  /** The count of the points and the cat's word of them, once she is free to move. */
  update(dt: number, canMove: boolean): void;
  /** Where the sparkles lead: the nearest thing not found while the next arch dozes after the final; null else. */
  leading(): THREE.Vector3 | null;
  /** The world played explored (null: a world off the shelf - the hub). */
  explored(): Explored | null;
}

/** What the world gives that the game does not hold: where its secrets not found yet are (BuiltWorld.glimmer). */
export interface ExploreWorld { glimmer(): readonly THREE.Vector3[] }

const installed = new WeakMap<Game, ExploreLead>();
/** The key's part in the world, once installed (src/main.ts); the loop updates it (src/game/loop.ts). */
export const exploreLeadOf = (g: Game): ExploreLead | undefined => installed.get(g);

export function installExploreLead(g: Game, world: ExploreWorld): ExploreLead {
  let since = EVERY, now: Explored | null = null, of: string | null = null;
  const meta = () => knownWorlds().find((w) => w.id === g.worldId && w.shelf !== undefined) ?? null;
  const count = () => {
    const w = meta();
    now = w ? exploreOf(g.save, w) : null; of = g.worldId;
    // the row under the counters: the half marked while it wakes an arch (not with the free pass)
    setExploreRow(now, !!w && gatesArch(w) && g.save.freeArches !== true);
  };
  // the arch after this world dozes on its points: the final played, the free pass off, an arch after it
  const dozing = () => {
    const w = meta();
    return !!w && !!now && g.ws.final && g.save.freeArches !== true && gatesArch(w) && !halfExplored(now);
  };
  const say = (key: (typeof EXPLORE_WORDS)[keyof typeof EXPLORE_WORDS]) => { g.ws.flags[key] = true; g.persist(); void g.speech.line(key, 'hint', 6000); };
  const near = new THREE.Vector3();
  const api: ExploreLead = {
    update(dt, canMove) {
      if (of !== g.worldId || (since += dt) >= EVERY) { since = 0; count(); }
      const w = meta();
      if (!w || !now || !canMove || g.busy || !g.started() || speaking()) return;
      const f = g.ws.flags;
      if (fullyExplored(now)) { if (f[EXPLORE_WORDS.full] !== true) say(EXPLORE_WORDS.full); return; }
      if (g.save.freeArches === true || !gatesArch(w) || !g.ws.final) return;
      if (!halfExplored(now)) { if (f[EXPLORE_WORDS.more] !== true) say(EXPLORE_WORDS.more); }
      // the half reached after the word that asked for it (reached before the final, the arch just wakes)
      else if (f[EXPLORE_WORDS.more] === true && f[EXPLORE_WORDS.half] !== true) say(EXPLORE_WORDS.half);
    },
    leading() {
      if (!dozing()) return null;
      const hp = g.hero.root.position;
      let best: THREE.Vector3 | null = null, d = Infinity;
      for (const list of [world.glimmer(), g.collect.unfound(), g.mystery.unsolved()]) {
        for (const p of list) { const k = Math.hypot(p.x - hp.x, p.z - hp.z); if (k < d) { d = k; best = p; } }
      }
      return best ? near.copy(best) : null;
    },
    explored: () => { if (of !== g.worldId) count(); return now; },
  };
  installed.set(g, api);
  return api;
}
