import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { speaking } from '../../core/voice';
import type { Game } from '../../game/context';
import type { Npc, WorldTask } from '../../game/world';
import { GLADE, ROOM } from './layout';
import { QUESTS, type QuestDef } from './quests';

/**
 * The parts of the artifact hidden in the world (WORLD-08, R09/R10; the decision Q4 "a"): the fox and the mushroom king
 * do not hand their shards over - after their three tasks each says where it lies, in a secret of the world (the fox's on
 * the glade behind the waterfall, the king's on the shelf of the fairy house's room). The step `part` of their chains is
 * a task in the background (like the deer's star search): the shard shows at its place, walking up to it takes it, and
 * that closes the chain - its shard card comes then, as at the end of a conversation (src/game/dialogue.ts, stepDone).
 *
 * Marks (the world's flags, the save's format does not change): `<id>_hint` - the character has said where its shard
 * lies (from then on it waits there, after a reload too); `part_<id>` - the shard is taken (the id of its item of the
 * world description). A save from before the parts were hidden, its chain finished at three steps, keeps its shard:
 * `settleOldParts`.
 */
/** The room of the fairy house lies far off the map (./layout.ts ROOM): a point in it, or near it, as ./secrets.ts `inRoom` reads her place. */
export const inRoomArea = (p: { x: number; z: number }) => Math.abs(p.x - ROOM.x) < ROOM.half + 2 && Math.abs(p.z - ROOM.z) < ROOM.half + 2;

/**
 * Where the cat's sparkles lead to reach `target` from where she is: the target itself when it is on her side of the
 * house's door, else that door - outside the door into the house (`doorOut`), in the room the door out (`doorIn`). The
 * room lies far off the map: the king's shard on its shelf, led to straight from the valley, sent the sparkles past
 * the horizon (the customer's game, 2026-11-25).
 */
export function throughTheDoor<T extends { x: number; z: number }>(target: T, heroInRoom: boolean, doors: { doorOut: T; doorIn: T }): T {
  if (inRoomArea(target) === heroInRoom) return target;
  return heroInRoom ? doors.doorIn : doors.doorOut;
}

export interface HiddenPart {
  readonly owner: QuestDef['id'];
  /** The flag of the shard taken, and the id of its item of the description. */
  readonly flag: string;
  /** The flag of the hint said. */
  readonly hint: string;
  /** The line of the hint, in the character's own voice. */
  readonly line: 'fox_part_hint' | 'mushking_part_hint';
  /** Where the shard floats, and where the heroine stands to take it (m from it: walked into). */
  readonly at: { x: number; y?: number; z: number };
}

export const HIDDEN_PARTS: readonly HiddenPart[] = [
  { owner: 'fox', flag: 'part_fox', hint: 'fox_hint', line: 'fox_part_hint', at: { x: GLADE.x - 0.9, z: GLADE.z - 0.9 } },
  { owner: 'mushking', flag: 'part_mushking', hint: 'mushking_hint', line: 'mushking_part_hint', at: { x: ROOM.x + 2.9, y: 1.9, z: ROOM.z - ROOM.half + 0.9 } },
];
/** m from the shard where walking takes it. */
const TAKE_R = 1.1;

/** The step `part` in a chain: its index (the one after the three tasks). */
const partStep = (q: Pick<QuestDef, 'steps'>) => q.steps.indexOf('part');

/**
 * A save whose chain of the fox or the king was finished before its part was hidden (three steps done, no hint said):
 * the part counts as found - the chain is finished and the shard kept, as it was. One with the hint said waits for its
 * shard in the world; one with the step done changes nothing. True when it changed the save.
 */
export function settleOldParts(ws: { quests: Record<string, number>; flags: Record<string, boolean> }, quests: readonly Pick<QuestDef, 'id' | 'steps'>[] = QUESTS): boolean {
  let changed = false;
  for (const p of HIDDEN_PARTS) {
    const q = quests.find((x) => x.id === p.owner), k = q ? partStep(q) : -1;
    if (!q || k < 0) continue;
    if ((ws.quests[q.id] ?? 0) === k && !ws.flags[p.hint]) { ws.quests[q.id] = k + 1; ws.flags[p.flag] = true; changed = true; }
  }
  return changed;
}

export interface Parts extends WorldTask {
  /** The part waiting in the world now for `id`'s chain (its hint said, its shard not taken), else null. */
  waiting(id: string): HiddenPart | null;
  /** Where the next waiting shard is: the cat's sparkles lead there. */
  goal(): THREE.Vector3 | null;
  update(dt: number, time: number, canMove: boolean): void;
}

/**
 * The parts of the first world. `stepDone(n, k)` is the conversation's (src/game/dialogue.ts): taking a shard calls it,
 * whether the step was started in this session or before a reload.
 */
export function createParts(g: Game, npcOf: (id: string) => Npc, stepDone: () => ((n: Npc, k: number) => void)): Parts {
  const { scene, ws, groundY, hero } = g;
  const { line } = g.speech;
  const group = new THREE.Group();
  scene.add(group);   // the world's scope clears the scene as the world is left: the shards go with it
  const geo = new THREE.OctahedronGeometry(0.28, 0);
  geo.scale(0.8, 1.4, 0.8);
  const shards = new Map(HIDDEN_PARTS.map((p) => {
    const q = QUESTS.find((x) => x.id === p.owner)!;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: q.shard, emissive: q.shard, emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.1 }));
    const y = p.at.y ?? groundY(p.at.x, p.at.z) + 0.9;
    m.position.set(p.at.x, y, p.at.z); m.userData.y = y; m.visible = false;
    group.add(m);
    return [p.owner, m] as const;
  }));

  const waiting = (id: string): HiddenPart | null => {
    const p = HIDDEN_PARTS.find((x) => x.owner === id);
    if (!p) return null;
    const q = QUESTS.find((x) => x.id === id)!;
    return ws.flags[p.hint] && (ws.quests[id] ?? 0) === partStep(q) ? p : null;
  };
  function take(p: HiddenPart) {
    const q = QUESTS.find((x) => x.id === p.owner)!;
    ws.flags[p.flag] = true;
    const m = shards.get(p.owner)!;
    m.visible = false;
    sfx('chime');
    g.sparks.burst(m.position, q.shard, 36, 3);
    stepDone()(npcOf(p.owner), partStep(q));
  }

  return {
    skill: 'count',       // a step of no skill: the conversation reads the skill of a task it runs, never of this one
    start: (n) => {
      const p = HIDDEN_PARTS.find((x) => x.owner === n.def.id);
      if (!p) return;
      ws.flags[p.hint] = true; g.persist();
      void line(p.line, 'story', 6000, n.def.emoji);
    },
    active: () => HIDDEN_PARTS.some((p) => waiting(p.owner) !== null),
    owner: () => HIDDEN_PARTS.find((p) => waiting(p.owner) !== null)?.owner ?? null,
    reask: async (n) => {
      const p = waiting(n.def.id);
      if (p) await line(p.line, 'story', 6000, n.def.emoji);
    },
    waiting,
    goal: () => {
      const p = HIDDEN_PARTS.find((x) => waiting(x.owner) !== null);
      return p ? shards.get(p.owner)!.position : null;
    },
    update: (_dt, time, canMove) => {
      const hp = hero.root.position;
      for (const p of HIDDEN_PARTS) {
        const m = shards.get(p.owner)!, on = waiting(p.owner) !== null;
        m.visible = on;
        if (!on) continue;
        m.rotation.y = time * 1.4; m.position.y = m.userData.y + Math.sin(time * 2) * 0.1;
        // taken once nothing is said: a shard on the glade, walked into on her first visit, waits for the cat's line of
        // the secret - both finds are heard, one after the other
        if (canMove && !speaking() && Math.hypot(hp.x - p.at.x, hp.z - p.at.z) < TAKE_R) take(p);
      }
    },
  };
}
