/**
 * The find of the day (PLAY-26, the customer's word of 2026-11-21): the finds of a world's collections lie once
 * (PLAY-25), so a world with collections lays one more find out each day - one of its kinds, at one of its places
 * (`WorldDef.daily.places`, checked off the path and the other finds by the world's own test) - as the hub's feather
 * of the day does. It goes to the stash alone (src/game/stash.ts): not into `ws.found`, not into the book. The day it
 * was taken is the world's `ws.daily` (an optional field, no new version); the next day another lies out.
 */
import * as THREE from 'three';
import { sfx } from '../core/audio';
import type { WorldState } from '../core/save';
import { floorOf, reaches, setKindsOf, type CollectDef, type CollectKind } from './collections';
import { dayKey } from './playtime';
import { addToStash } from './stash';
import type { Game } from './context';

/** A world's places for its find of the day (the map's metres). */
export interface DailyDef { readonly places: readonly { readonly x: number; readonly z: number }[] }
/** The day the walkthrough takes as today (?debug), null - the local date. */
export const dailyState: { day: string | null } = { day: null };
export const dailyDay = (now = Date.now()): string => dailyState.day ?? dayKey(new Date(now));

/** The number of a day: days since 2026-01-01 (any day key of `dayKey`). */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86_400_000);
}

/** What lies out today: its kind and place, or null - the world has none, or it was taken today. Asking changes nothing. */
export function dailyOf(world: { daily?: DailyDef; collect?: CollectDef }, ws: Partial<WorldState>, day: string): { kind: CollectKind; x: number; z: number } | null {
  const places = world.daily?.places ?? [], kinds = world.collect ? setKindsOf(world.collect) : [];   // never a piece of the picture (PLAY-29)
  if (!places.length || !kinds.length || ws.daily === day) return null;
  const n = ((dayNumber(day) % 1e6) + 1e6) % 1e6;
  const at = places[(n * 5 + 3) % places.length];
  return { kind: kinds[n % kinds.length], x: at.x, z: at.z };
}

export type DailyHost = Pick<Game, 'scene' | 'save' | 'ws' | 'world' | 'groundY' | 'hero' | 'sparks' | 'persist' | 'speech'>;

/**
 * The find of the day in the scene: one mesh of the kind's shape (`shapeOf`, `size`, `material` - those of the finds,
 * src/game/collect-items.ts); walked into while she is free to move, it goes to the stash.
 */
export function createDaily(g: DailyHost, shapeOf: (kind: CollectKind) => THREE.BufferGeometry, size: (kind: CollectKind) => number, material: () => THREE.Material) {
  let mesh: THREE.Mesh | null = null, kind: CollectKind | null = null, gone = false;
  const pos = new THREE.Vector3();
  const drop = () => { if (mesh) { g.scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh = null; kind = null; } };
  return {
    /** Where it lies now and what it is (the walkthrough), null - none. */
    at: () => (mesh && kind ? { kind, x: pos.x, y: pos.y, z: pos.z } : null),
    update(_dt: number, time: number, canMove: boolean) {
      if (gone) return;
      const day = dailyDay(), today = dailyOf(g.world, g.ws, day);
      if (!today) { drop(); return; }
      if (kind !== today.kind || !mesh) {
        drop();
        kind = today.kind;
        mesh = new THREE.Mesh(shapeOf(kind), material());
        mesh.name = 'daily-find'; mesh.castShadow = false;
        mesh.scale.setScalar(size(kind));
        g.scene.add(mesh);
      }
      pos.set(today.x, g.groundY(today.x, today.z) + 0.3 + Math.sin(time * 1.6) * 0.05, today.z);
      mesh.position.copy(pos); mesh.rotation.y = time * 0.8;
      const hp = g.hero.root.position;
      if (canMove && reaches('run', pos, hp, g.hero.root.scale.x, floorOf(g, hp.x, hp.z))) {
        addToStash(g.save, kind);
        g.ws.daily = day;
        sfx('good');
        g.sparks.burst(pos.clone(), '#fff6c8', 26, 3);
        g.persist();
        void g.speech.line('daily_find', 'hint', 4000);
        drop();
      }
    },
    dispose() { gone = true; drop(); },
  };
}
