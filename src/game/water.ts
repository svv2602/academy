import * as THREE from 'three';
import type { Game } from './context';

/**
 * Under water (a world with WorldDef.move of kind 'swim', docs/worlds/world-3.md): what the game shows around the
 * heroine there, whatever the world. Made once with the game; seen only while a water world is played.
 * - the cat's bubble: a clear sphere round the cat (the cat does not like water - it swims in a bubble beside her);
 * - bubbles from the heroine as she swims: one every BUBBLE_EVERY s, rising BUBBLE_LIFE s;
 * - motes in the water round the camera, drifting: not on the lowest tier (q0).
 * One mesh each: three draw calls in all, the bubble of the cat replacing the grey build's own.
 */

/** s: a bubble from the heroine while she swims; how long one rises. */
export const BUBBLE_EVERY = 0.15, BUBBLE_LIFE = 1.5;
/** How many bubbles can be up at once (BUBBLE_LIFE / BUBBLE_EVERY, with room). */
const BUBBLES = 12;
/** The motes in the water round the camera, and the half of the box they drift in, m. */
export const MOTES = 60, MOTE_BOX = 6;
/** The cat's bubble: its radius, and the height of its middle over the cat's feet, m. */
export const CAT_BUBBLE_R = 0.62, CAT_BUBBLE_Y = 0.35;

/** Swimming now: the world played declares it (src/game/world.ts WorldDef.move). */
export const inWater = (g: Pick<Game, 'world'>): boolean => g.world.move?.kind === 'swim';

/**
 * How high the cat is carried over the floor in the water, m. For the customer's choice (2026-11-20, two pictures):
 * on the floor (0, the default), or at the height the heroine swims at - `?debug&catfloat=1` shows that one. The
 * parameter is for the pictures only and goes once the customer has chosen.
 */
export function catLift(g: Pick<Game, 'world' | 'debug'>, search = typeof location === 'undefined' ? '' : location.search): number {
  const move = g.world.move;
  if (move?.kind !== 'swim') return 0;
  return g.debug && new URLSearchParams(search).get('catfloat') === '1' ? move.height : 0;
}

export interface Water {
  readonly catBubble: THREE.Mesh;
  readonly bubbles: THREE.InstancedMesh;
  readonly motes: THREE.InstancedMesh;
  /** A frame: `moving` - she is swimming, not floating still; `tier` - the quality tier (no motes on 0). */
  update(dt: number, moving: boolean, tier: number): void;
}

const made = new WeakMap<object, Water>();
/** The water of the game `g` once the loop has made it (the debug door reads it), else null. */
export const waterOf = (g: object): Water | null => made.get(g) ?? null;

export function createWater(g: Pick<Game, 'scene' | 'world' | 'hero' | 'cat' | 'camera' | 'rng'>): Water {
  const clear = (opacity: number) => new THREE.MeshStandardMaterial({ color: '#e8f8ff', transparent: true, opacity, roughness: 0.1, depthWrite: false });
  const catBubble = new THREE.Mesh(new THREE.SphereGeometry(CAT_BUBBLE_R, 20, 14), clear(0.28));
  catBubble.name = 'cat-bubble'; catBubble.renderOrder = 2;
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), clear(0.6), BUBBLES);
  bubbles.name = 'swim-bubbles'; bubbles.count = 0; bubbles.frustumCulled = false;
  const motes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.025, 0), new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.55, depthWrite: false }), MOTES);
  motes.name = 'water-motes'; motes.frustumCulled = false;
  for (const m of [catBubble, bubbles, motes]) { m.visible = false; g.scene.add(m); }

  const rnd = g.rng;
  const up: { x: number; y: number; z: number; age: number; wob: number }[] = [];
  const mote = Array.from({ length: MOTES }, () => ({ x: (rnd() * 2 - 1) * MOTE_BOX, y: (rnd() * 2 - 1) * MOTE_BOX * 0.5, z: (rnd() * 2 - 1) * MOTE_BOX, v: 0.05 + rnd() * 0.1 }));
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  let next = 0;
  const wrap = (v: number, half: number) => ((((v + half) % (half * 2)) + half * 2) % (half * 2)) - half;

  const water: Water = {
    catBubble, bubbles, motes,
    update(dt, moving, tier) {
      const on = inWater(g);
      catBubble.visible = on; bubbles.visible = on; motes.visible = on && tier > 0;
      if (!on) { up.length = 0; return; }
      const c = g.cat.root.position;
      catBubble.position.set(c.x, c.y + CAT_BUBBLE_Y, c.z);
      // the heroine's bubbles: from her head while she swims, rising and wobbling, gone after BUBBLE_LIFE
      const h = g.hero.root.position;
      next -= dt;
      if (moving && next <= 0 && up.length < BUBBLES) { up.push({ x: h.x + (rnd() - 0.5) * 0.2, y: h.y + 0.9, z: h.z + (rnd() - 0.5) * 0.2, age: 0, wob: rnd() * 6 }); next = BUBBLE_EVERY; }
      for (let i = up.length - 1; i >= 0; i--) { const b = up[i]; b.age += dt; b.y += 0.6 * dt; if (b.age > BUBBLE_LIFE) up.splice(i, 1); }
      up.forEach((b, i) => bubbles.setMatrixAt(i, m4.compose(p.set(b.x + Math.sin(b.age * 5 + b.wob) * 0.05, b.y, b.z), q, s.setScalar(0.6 + b.age * 0.4))));
      bubbles.count = up.length; bubbles.instanceMatrix.needsUpdate = true;
      // the motes: a box of them round the camera, slowly sinking, wrapped round as the camera moves
      if (motes.visible) {
        const cp = g.camera.position;
        mote.forEach((m, i) => {
          m.y -= m.v * dt;
          motes.setMatrixAt(i, m4.compose(p.set(cp.x + wrap(m.x - cp.x, MOTE_BOX), cp.y + wrap(m.y - cp.y, MOTE_BOX * 0.5), cp.z + wrap(m.z - cp.z, MOTE_BOX)), q, s.setScalar(1)));
        });
        motes.instanceMatrix.needsUpdate = true;
      }
    },
  };
  made.set(g, water);
  return water;
}
