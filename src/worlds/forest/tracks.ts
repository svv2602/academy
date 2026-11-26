import * as THREE from 'three';
import { sfx } from '../../core/audio';
import type { Game } from '../../game/context';
import { createTracks, type Tracks } from '../../game/prints';
import { levelFor, recordTask } from '../../game/skills';
import type { CountSpec } from '../../game/tasks/count';
import { OPTIONS } from '../../game/tasks/count';
import { ladder } from '../../game/tasks/types';
import { answerOf, showTask } from '../../game/taskviews/panel';
import type { Npc, WorldTask } from '../../game/world';
import { tf } from '../../ui/strings';
import { PATHS, type Place } from './layout';

/**
 * The tracks on the ground (WORLD-15): Shustrik has lost its nuts. From it a line of paw prints runs along the
 * squirrel's tracks (the path from the grove to the Ash, its clearing) with a short branch of prints to every nut hidden
 * off it; the heroine walks into a nut to find it (it hops and is marked in the bubble's count). Once the last is found
 * the cat asks how many there are - that question is a task of counting on the panel and goes to the skill "count"; the
 * search itself is recorded nowhere (LEARN-02). No timer; the prints never fade. A background step of the chain, like
 * the deer's stars of the first world: the step is done once the question is answered.
 *
 * The grey build speaks no line of its own: the bubble of the search is a subtitle with the count, the question is the
 * panel's own recorded "how many".
 */

/** How many nuts by the level of counting (3-5, WORLD-15). */
export const nutsFor = (level: number) => (level <= 2 ? 3 : level <= 4 ? 4 : 5);
/** m: walking this near a nut finds it; a nut lies this far off the tracks, at the end of its branch. */
export const FIND_R = 1.0, OFF = 3;
/** The thing of the question (the panel draws it as many times as there are nuts). */
const NUT = '🌰';

export interface NutsSearch extends WorldTask {
  /** The search: on, the nuts (where, found), the question waiting to be answered. */
  readonly state: { active: boolean; asking: boolean; nuts: { at: THREE.Vector3; found: boolean; mesh: THREE.Mesh }[] };
  readonly tracks: Tracks;
  /** A frame: the nuts turn, one walked into is found; the last one found brings the question. */
  update(dt: number, time: number, canMove: boolean): void;
  /** The next nut not found, once she has wandered a while without finding one (the cat's sparkles); else null. */
  goal(): THREE.Vector3 | null;
  /** The walkthrough's right move: she is put on the next nut. False when there is none to find. */
  cheat(): boolean;
}

/** The squirrel's tracks from `from` (its line of points), cut into the stretch the nuts lie along. */
function trackLine(from: Place): Place[] {
  const line = [...PATHS[PATHS.length - 1]];          // the squirrel's tracks: the grove -> the Ash
  return [from, ...line.slice(1)];
}

/** Points along a line of points at the distances `ds` (m from its start). */
function along(line: readonly Place[], ds: readonly number[]): (Place & { dx: number; dz: number })[] {
  const out: (Place & { dx: number; dz: number })[] = [];
  for (const want of ds) {
    let left = want;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (left <= len || i === line.length - 2) {
        const k = Math.min(1, left / len), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
        out.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx, dz });
        break;
      }
      left -= len;
    }
  }
  return out;
}

/** The start of a line of points up to `dist` m along it. */
function upTo(line: readonly Place[], dist: number): Place[] {
  const out: Place[] = [line[0]];
  let left = dist;
  for (let i = 0; i < line.length - 1 && left > 0; i++) {
    const a = line[i], b = line[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), k = Math.min(1, left / len);
    out.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
    left -= len;
  }
  return out;
}

export function createNutsSearch(g: Game): NutsSearch {
  const { scene, groundY, hero, sparks } = g;
  const tracks = createTracks(scene, groundY);
  const state: NutsSearch['state'] = { active: false, asking: false, nuts: [] };
  const geo = new THREE.SphereGeometry(0.16, 10, 7).scale(0.85, 1.1, 0.85);
  const mat = new THREE.MeshStandardMaterial({ color: '#b5762f', emissive: '#6b3a10', emissiveIntensity: 0.25, roughness: 0.6 });
  let owner: Npc | null = null, finished: () => void = () => {}, idle = 0;

  const bubble = () => {
    const found = state.nuts.filter((n) => n.found).length;
    // the key of the shared "how many" (recorded): the grey build has no line of its own yet - the forest's is recorded once
    // the customer took it; the text is the forest's subtitle with the count
    g.speech.caption({ key: 't_count', pri: 'task', hold: 0, speaker: '🐿️', text: tf('forest_nuts', { n: found, of: state.nuts.length }) });
  };
  /** The question: how many nuts - a task of counting on the panel; answered, it goes to "count" and the step is done. */
  async function ask() {
    state.asking = true;
    const n = state.nuts.length, level = levelFor(g.save, 'count');
    const spec: CountSpec = {
      type: 'count', level, prompt: 't_count',
      hint: ladder('h1_count', { key: 'h_count', steps: [{ do: 'countAloud', which: 'all' }] }),
      body: { thing: NUT, n, tilt: Array.from({ length: n }, (_, i) => ((i * 37) % 21) - 10), options: [...OPTIONS], answer: n },
    };
    const res = await g.task(() => showTask(spec, g.hooksFor('🐿️')));
    if (!res.solved) return;               // closed: the question waits, Shustrik asks it again
    recordTask(g.save, 'count', res.wrong, false, answerOf(res));
    state.asking = false; state.active = false;
    g.persist();
    finished();
  }

  return {
    skill: 'count',     // the step's question is a task of counting; the search itself records nothing (LEARN-02)
    state, tracks,
    start(n, done) {
      owner = n; finished = done; idle = 0;
      for (const nut of state.nuts) scene.remove(nut.mesh);
      const count = nutsFor(levelFor(g.save, 'count'));
      const line = trackLine(n.pos);
      const len = line.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - line[i].x, p.z - line[i].z), 0);
      // the nuts along the tracks, every one on a short branch to a side, the sides by the game's chance
      const spots = along(line, Array.from({ length: count }, (_, i) => (len * (i + 1)) / (count + 0.5)));
      const branches: Place[][] = [];
      state.nuts = spots.map((p) => {
        const side = g.rng() < 0.5 ? -1 : 1;
        const q = { x: p.x + p.dz * OFF * side, z: p.z - p.dx * OFF * side };
        g.ground.resolve(q, 0.5);
        branches.push([{ x: p.x, z: p.z }, q]);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(q.x, groundY(q.x, q.z) + 0.2, q.z);
        scene.add(mesh);
        return { at: mesh.position.clone(), found: false, mesh };
      });
      // the main line of prints runs from Shustrik to the last nut's branch, a branch to every nut
      tracks.lay([upTo(line, (len * count) / (count + 0.5)), ...branches]);
      state.active = true; state.asking = false;
      bubble();
    },
    active: () => state.active,
    owner: () => (state.active ? owner?.def.id ?? null : null),
    reask: async () => { if (state.asking) await ask(); else bubble(); },
    update(dt, time, canMove) {
      if (!state.active) return;
      // the bubble of the search stays while the nuts are searched for (a conversation's line takes it for a while)
      if (!state.asking && !g.busy && g.speech.shown?.key !== 't_count') bubble();
      const hp = hero.root.position;
      idle += dt;
      for (const nut of state.nuts) {
        if (nut.found) { nut.mesh.position.y = Math.min(nut.at.y + 0.9, nut.mesh.position.y + dt * 2); nut.mesh.rotation.y += dt * 6; continue; }
        nut.mesh.rotation.y = time * 1.2;
        if (canMove && !state.asking && Math.hypot(hp.x - nut.at.x, hp.z - nut.at.z) < FIND_R) {
          nut.found = true; idle = 0;
          sfx('chime'); sparks.burst(nut.at.clone().setY(nut.at.y + 0.3), '#e8a94a', 20, 3);
          bubble();
          // Shustrik glad of the first two nuts; at the last her question at once (the tracks' end is her word of the
          // step solved: CharacterDef.solved, ./index.ts)
          const n = state.nuts.filter((x) => x.found).length;
          if (state.nuts.every((x) => x.found)) void ask();
          else if (n <= 2) void g.speech.line(n === 1 ? 'shustrik_tracks_found_1' : 'shustrik_tracks_found_2', 'story', 0, '🐿️');
        }
      }
    },
    goal: () => (state.active && idle > 20 ? state.nuts.find((n) => !n.found)?.at ?? null : null),
    cheat() {
      const nut = state.active && !state.asking ? state.nuts.find((n) => !n.found) : undefined;
      if (!nut) return false;
      hero.root.position.set(nut.at.x, groundY(nut.at.x, nut.at.z), nut.at.z);
      return true;
    },
  };
}
