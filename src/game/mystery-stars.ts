import * as THREE from 'three';
import { recordTask, levelFor } from './skills';
import { typeOf } from './tasks';
import { SKILL, answerOf } from './taskviews/panel';
import type { Game } from './context';
import type { Spot } from './player';
import { playScene, type Stage } from './stage';
import { MYSTERY_COLOR, MYSTERY_COUNT, MYSTERY_KINDS, MYSTERY_STAR, dailyStars, mysteryOf, type MysteryStar } from './mystery';
import { dayKey } from './playtime';

/**
 * The mysterious stars in the world played (./mystery.ts is the rule): drawn as one instanced mesh, each with its spot
 * ("open"); the cat says once a day that new ones came. Made anew for every world entered (src/game/context.ts `enter`),
 * taken out of the scene with it (src/game/travel.ts).
 *
 * `mysteryHold`: the walkthrough's own lever (window.__game.mystery, ?debug only, src/game/debug.ts). Held, a world shows
 * no mysterious stars (the pieces of the walkthrough play the same whatever the real date, R61); `day` sets the day
 * they are of (the block "mystery" lets the hold go and walks through the days). `all`: every place of the world has its
 * star, not the ten of the day - the worst case the measure of the draw calls takes (tools/*-grey.mjs --budget).
 */
export const mysteryHold: { held: boolean; day: string | null; all: boolean } = { held: false, day: null, all: false };

/** m: how near the heroine opens a star. */
export const MYSTERY_SPOT_R = 1.8;
const { float: FLOAT, scale: SCALE, bob: BOB } = MYSTERY_STAR;

export interface MysteryInWorld {
  /** The spots of today's unsolved stars ("open"), joined to the world's in the frame (src/game/loop.ts). */
  readonly spots: readonly Spot[];
  /** Today's stars, solved or not, with where each floats (the walkthrough, the book). */
  readonly today: readonly (MysteryStar & { pos: THREE.Vector3; solved: boolean })[];
  /** Where today's unsolved stars float: the same array and vectors every call (the compass and the glimmer of the shop's supplies). */
  unsolved(): readonly THREE.Vector3[];
  /** A frame: they turn, bob and glow; a new day (midnight, or the lever) puts them at its places. */
  update(time: number, canMove: boolean): void;
  /** Whether the stars are drawn this frame: always, or with `showR` (WorldDef.mystery) only while an unsolved one is that near her. */
  readonly drawn: boolean;
  /** Takes them out of the scene (leaving the world). */
  dispose(): void;
}

/** What of the game the stars use; read live through it. */
export type MysteryHost = Pick<Game, 'scene' | 'save' | 'ws' | 'world' | 'ground' | 'groundY' | 'hero' | 'cam' | 'speech' | 'sparks'
  | 'task' | 'hooksFor' | 'plan' | 'rng' | 'addStars' | 'above' | 'praise' | 'persist'>;

/**
 * The material of the mysterious stars, lit: its glow the colour of each star - the instance colour multiplies the
 * emissive too (three.js defines USE_COLOR, not USE_INSTANCING_COLOR, for the fragment of an instance colour).
 */
function starMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.35 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor;\n#endif');
  };
  m.customProgramCacheKey = () => 'mystery-star';
  return m;
}

/**
 * The stars of the world `g.world` (none if it names no places, or while the lever holds them). `geo`: the star of the
 * shared load; `stage`: a stage of this entry into the world (src/game/context.ts `createStage`); `now`: the clock.
 */
export function createMystery(g: MysteryHost, geo: THREE.BufferGeometry | null, stage: () => Stage, now: () => number = Date.now): MysteryInWorld {
  const def = g.world.mystery;
  const day = () => mysteryHold.day ?? dayKey(new Date(now()));
  const spots: Spot[] = [], unsolvedPos: THREE.Vector3[] = [];
  let shown: (MysteryStar & { pos: THREE.Vector3; solved: boolean })[] = [];
  let shownDay = '', shownAll = false;
  /** The stars of the lever `all`: every place, the kinds in turn. */
  const everyPlace = (n: number): MysteryStar[] => Array.from({ length: n }, (_, i) => ({ id: i, spot: i, kind: MYSTERY_KINDS[i % 3], step: i % 3 === 0 ? 'add' : i % 3 === 1 ? 'sub' : 'pattern' }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sv = new THREE.Vector3(), colour = new THREE.Color();
  // The mesh is made at once whenever the world has places, held or not: the scene of a world is the same at every entry
  // into it (tools/worlds.mjs compares the first world built again with the first time); nothing is drawn while count is 0.
  let mesh: THREE.InstancedMesh | null = null;
  const cap = Math.max(MYSTERY_COUNT, def?.spots.length ?? 0);    // the lever `all` draws every place
  if (def && geo) {
    mesh = new THREE.InstancedMesh(geo, starMaterial(), cap);
    mesh.name = 'mystery-stars';
    mesh.frustumCulled = false;      // ten small stars across the valley: culling them would cost more than it saves
    mesh.castShadow = false;
    for (let i = 0; i < cap; i++) mesh.setColorAt(i, colour.set('#ffffff'));   // the colour attribute from the start: one program
    mesh.count = 0;
    g.scene.add(mesh);
  }
  let opening = false, gone = false;


  /** The stars of the day `d` at their places, their colours set per day. */
  function place(d: string) {
    shownDay = d; shownAll = mysteryHold.all;
    const state = mysteryOf(g.ws, d);
    shown = def ? (shownAll ? everyPlace(def.spots.length) : dailyStars(g.world.id, d, def.spots.length)).map((s) => {
      const p = { ...def.spots[s.spot] };
      g.ground.resolve(p, 0.6);
      return { ...s, pos: new THREE.Vector3(p.x, g.groundY(p.x, p.z) + FLOAT, p.z), solved: state.solved.includes(s.id) };
    }) : [];
    if (mesh) mesh.count = shown.length;
    shown.forEach((s, i) => mesh?.setColorAt(i, colour.set(MYSTERY_COLOR[s.kind])));
    if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    spots.length = 0;
    for (const s of shown) spots.push({ pos: s.pos, r: MYSTERY_SPOT_R, label: 'mystery_open', on: () => !s.solved && !opening, run: () => { void open(s); } });
    refreshUnsolved();
  }
  const refreshUnsolved = () => { unsolvedPos.length = 0; for (const s of shown) if (!s.solved) unsolvedPos.push(s.pos); };

  async function open(s: (typeof shown)[number]) {
    if (s.solved || opening) return;
    opening = true;
    try {
      await playScene(stage(), `mystery ${s.id}`, async () => {
        g.cam.focus = g.above(s.pos, -0.4);
        await g.speech.line('mystery_found', 'story');
        const type0 = typeOf(s.step, 1), skill = SKILL[type0], level = levelFor(g.save, skill), type = typeOf(s.step, level);
        const res = await g.task(() => g.plan.runTask(type, level, g.hooksFor('🐱'), g.rng));
        if (!res.solved) { void g.speech.line('mystery_wait', 'story'); return; }      // closed: it waits, nothing is taken
        recordTask(g.save, skill, res.wrong, false, answerOf(res));
        const state = mysteryOf(g.ws, shownDay);
        if (!state.solved.includes(s.id)) state.solved.push(s.id);
        s.solved = true;
        refreshUnsolved();
        g.sparks.burst(g.above(s.pos, 0), MYSTERY_COLOR[s.kind], 36, 4);
        g.addStars(3, g.above(g.hero.root.position, 1.4));     // MYSTERY_REWARD, a literal as src/game/no-penalties.test.ts reads it
        await g.speech.line('mystery_won', 'story');
        await g.praise();
      });
    } finally { opening = false; }
  }

  const hidden = () => mysteryHold.held || !def;
  // m: with a `showR`, the stars are drawn only while an unsolved one is this near her - one draw call less everywhere
  // else (a world close to its budget of draw calls, TECH-06); the compass and the glimmer read unsolved() all the same
  const showR = def?.showR;
  let drawn = true;
  const near = () => {
    const h = g.hero.root.position;
    return shown.some((s) => !s.solved && Math.hypot(s.pos.x - h.x, s.pos.z - h.z) < showR!);
  };
  if (!hidden()) place(day());

  return {
    spots,
    get today() { return shown; },
    get drawn() { return !!mesh && drawn && shown.length > 0; },
    unsolved: () => unsolvedPos,
    update: (time, canMove) => {
      if (gone) return;
      if (hidden()) { if (shown.length) { shown = []; spots.length = 0; refreshUnsolved(); if (mesh) mesh.count = 0; } return; }
      const d = day();
      if (d !== shownDay || mysteryHold.all !== shownAll || (!shown.length && def)) place(d);
      if (!mesh) return;
      drawn = showR === undefined || near();
      mesh.visible = drawn;
      shown.forEach((s, i) => {
        if (s.solved) { mesh!.setMatrixAt(i, m4.compose(s.pos, q.identity(), sv.setScalar(0))); return; }
        s.pos.y = g.groundY(s.pos.x, s.pos.z) + FLOAT + (0.5 + 0.5 * Math.sin(time * 1.8 + i)) * BOB;
        mesh!.setMatrixAt(i, m4.compose(s.pos, q.setFromAxisAngle(up, time * 1.2 + i), sv.setScalar(SCALE * (1 + 0.08 * Math.sin(time * 4 + i)))));
      });
      mesh.instanceMatrix.needsUpdate = true;
      // the line of the day: once a day per world, the first time she is free to move while some star waits
      const state = mysteryOf(g.ws, shownDay);
      if (canMove && !state.told && unsolvedPos.length) { state.told = true; g.persist(); void g.speech.line('mystery_day', 'hint', 4000); }
    },
    dispose: () => {
      gone = true;
      if (mesh) { g.scene.remove(mesh); (mesh.material as THREE.Material).dispose(); mesh.dispose(); mesh = null; }
      spots.length = 0; unsolvedPos.length = 0;
    },
  };
}
