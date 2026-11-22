/**
 * "The search among the corals" (WORLD-17), the sea dragon's step in the world: Bulk shows the shell looked for over
 * his head, the shells of it and their look-alikes lie by the corals of the reef (the description:
 * src/game/worldtasks/corals.ts, by the level of "Classification", only read). A touch on a shell near her: the one
 * looked for is found (it rises and turns, Bulk is glad); a look-alike rocks and the cat says what is looked for again -
 * no mistake, nothing taken away, no timer. The last one found ends the step: Bulk's pearl comes to light in the corals
 * (WORLD-08, `onAll`). The search records no skill (LEARN-02, the customer's decision of 2026-11-18).
 */
import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { createRng } from '../../core/rng';
import type { Game } from '../../game/context';
import { levelFor } from '../../game/skills';
import type { Npc, WorldTask } from '../../game/world';
import { generateCorals, sameShell, type CoralsBody, type Shell, type ShellColor, type ShellShape } from '../../game/worldtasks/corals';
import { tf } from '../../ui/strings';
import { placeLife } from './scenery';

/** The step's id in Bulk's chain (./index.ts FRIENDS). */
export const CORALS = 'corals';
/** px: how near on the screen a touch must land; m: how near her a shell must be to be touched. */
export const TAP_PX = 70, TAP_R = 7;
/** m: a shell lies this far out from its coral, this high over the floor. */
const OUT = 0.75, LIFT = 0.22;
/** s of searching without a find before the cat's sparkles lead to the next shell. */
const IDLE_LEAD = 20;

const COLORS: Readonly<Record<ShellColor, string>> = { pink: '#ff8fb8', coral: '#ff7a5c', lilac: '#c9a8ff', violet: '#8a5cff', sand: '#e8d2a0', gold: '#f2b632' };

/** The shape of a shell: a scallop (a flat half ball), a spiral (a ring), a cone lying on its side. */
function shellGeometry(shape: ShellShape): THREE.BufferGeometry {
  if (shape === 'scallop') return new THREE.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1);
  if (shape === 'spiral') return new THREE.TorusGeometry(0.16, 0.08, 8, 18).rotateX(Math.PI / 2);
  return new THREE.ConeGeometry(0.16, 0.46, 10).rotateZ(Math.PI / 2);
}

export interface CoralShell extends Shell { at: THREE.Vector3; wanted: boolean; found: boolean; rock: number; mesh: THREE.Mesh }

export interface CoralsSearch extends WorldTask {
  readonly state: { active: boolean; body: CoralsBody | null; shells: CoralShell[]; wrongTouched: boolean };
  /** A touch on the screen: a shell near her under it - found or rocked; true when it took the touch. */
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  update(dt: number, time: number, canMove: boolean): void;
  /** The next shell looked for, once she has searched a while without a find; else null. */
  goal(): THREE.Vector3 | null;
  /** The walkthrough's right moves: once a look-alike is touched, then the shells looked for one by one. */
  cheat(): boolean;
  dispose(): void;
}

/**
 * `onAll`: the last shell found (before the step is done) - the world brings the pearl to light.
 * `place`: where the shells lie - by default the corals of the reef (./scenery.ts placeLife).
 */
export function createCoralsSearch(g: Game, onAll: () => void, place = () => placeLife().reef): CoralsSearch {
  const { scene, groundY } = g;
  const state: CoralsSearch['state'] = { active: false, body: null, shells: [], wrongTouched: false };
  const geos = new Map<ShellShape, THREE.BufferGeometry>();
  const geo = (s: ShellShape) => { let x = geos.get(s); if (!x) geos.set(s, x = shellGeometry(s)); return x; };
  const mats: THREE.Material[] = [];
  const mesh = (s: Shell) => {
    const m = new THREE.MeshStandardMaterial({ color: COLORS[s.color], roughness: 0.45, emissive: COLORS[s.color], emissiveIntensity: 0.15 });
    mats.push(m);
    return new THREE.Mesh(geo(s.shape), m);
  };
  let owner: Npc | null = null, finished: () => void = () => {}, idle = 0, sample: THREE.Mesh | null = null, said = 0;

  const left = () => state.shells.filter((s) => s.wanted && !s.found);
  const bubble = () => {
    const n = state.shells.filter((s) => s.wanted && s.found).length, of = state.shells.filter((s) => s.wanted).length;
    g.speech.caption({ key: 'bulk_coral_start', pri: 'story', hold: 0, speaker: '🐉', text: tf('sea_corals', { n, of }) });
  };
  const clear = () => {
    for (const s of state.shells) scene.remove(s.mesh);
    if (sample) scene.remove(sample);
    for (const m of mats.splice(0)) m.dispose();
    state.shells = []; sample = null;
  };

  function touch(s: CoralShell) {
    idle = 0;
    if (!s.wanted) {
      // a look-alike: no mistake - it rocks, the cat says what is looked for again; the answer to her touch, so it is
      // a line of the story, not a hint a line of Bulk's would turn away
      s.rock = 1; state.wrongTouched = true;
      sfx('soft');
      void g.speech.line('sea_coral_not_this', 'story').then(() => { if (state.active) bubble(); });
      return;
    }
    s.found = true;
    sfx('chime'); g.sparks.burst(s.at.clone().setY(s.at.y + 0.3), COLORS[s.color], 24, 3);
    const rest = left().length;
    if (rest === 0) {
      state.active = false;
      g.speech.caption(null);
      g.persist();
      void g.speech.line('bulk_coral_all', 'story', 0, '🐉').then(() => { onAll(); finished(); });
      return;
    }
    void g.speech.line(said++ % 2 === 0 ? 'bulk_coral_found_1' : 'bulk_coral_found_2', 'story', 0, '🐉').then(() => { if (state.active) bubble(); });
  }

  return {
    skill: 'classify',     // only read: the search records nothing (no result is handed to `done`)
    state,
    start(n, done) {
      owner = n; finished = done; idle = 0; said = 0; state.wrongTouched = false;
      clear();
      const rng = createRng(`corals:${Math.floor(g.rng() * 1e9)}`);
      const body = state.body = generateCorals(levelFor(g.save, 'classify'), rng);
      const all: Shell[] = [...Array.from({ length: body.hidden }, () => body.sample), ...body.alike];
      // each by a coral of the reef of its own, a little out from it
      const corals = [...place()];
      for (let i = corals.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [corals[i], corals[j]] = [corals[j], corals[i]]; }
      state.shells = all.map((s, i) => {
        const c = corals[i % corals.length], a = rng() * Math.PI * 2;
        const p = { x: c.x + Math.cos(a) * OUT, z: c.z + Math.sin(a) * OUT };
        g.ground.resolve(p, 0.3);
        const m = mesh(s);
        m.position.set(p.x, groundY(p.x, p.z) + LIFT, p.z); m.rotation.y = a;
        scene.add(m);
        return { ...s, at: m.position.clone(), wanted: sameShell(s, body.sample), found: false, rock: 0, mesh: m };
      });
      // what is looked for, over Bulk's head
      sample = mesh(body.sample); sample.scale.setScalar(1.6);
      sample.position.copy(n.pos).setY(n.pos.y + 2.2);
      scene.add(sample);
      state.active = true;
      void g.speech.line('bulk_coral_start', 'story', 0, '🐉').then(() => { if (state.active) bubble(); });
    },
    active: () => state.active,
    owner: () => (state.active ? owner?.def.id ?? null : null),
    reask: async () => { await g.speech.line('bulk_coral_start', 'story', 0, '🐉'); if (state.active) bubble(); },
    tap(screenDist) {
      if (!state.active || g.busy) return false;
      const hp = g.hero.root.position;
      let best: CoralShell | null = null, bestD = TAP_PX;
      for (const s of state.shells) {
        if (s.found || Math.hypot(s.at.x - hp.x, s.at.z - hp.z) > TAP_R) continue;
        const d = screenDist(s.at);
        if (d < bestD) { best = s; bestD = d; }
      }
      if (!best) return false;
      touch(best);
      return true;
    },
    update(dt, time, _canMove) {
      if (sample) { sample.visible = state.active; sample.rotation.y = time * 1.5; }
      if (!state.active && state.shells.every((s) => !s.found || s.mesh.position.y >= s.at.y + 0.9)) return;
      if (state.active) {
        idle += dt;
        if (!g.busy && g.speech.shown?.key !== 'bulk_coral_start' && !g.speech.shown) bubble();
      }
      for (const s of state.shells) {
        if (s.found) { s.mesh.position.y = Math.min(s.at.y + 0.9, s.mesh.position.y + dt * 1.5); s.mesh.rotation.y += dt * 5; continue; }
        if (s.rock > 0) { s.rock = Math.max(0, s.rock - dt * 1.4); s.mesh.rotation.z = Math.sin(s.rock * 18) * 0.35 * s.rock; }
      }
    },
    goal: () => (state.active && idle > IDLE_LEAD ? left()[0]?.at ?? null : null),
    cheat() {
      if (!state.active || g.busy) return false;
      const target = !state.wrongTouched ? state.shells.find((s) => !s.wanted) ?? left()[0] : left()[0];
      if (!target) return false;
      g.hero.root.position.set(target.at.x, g.hero.root.position.y, target.at.z + 1.2);
      touch(target);
      return true;
    },
    dispose() { clear(); for (const x of geos.values()) x.dispose(); geos.clear(); },
  };
}

