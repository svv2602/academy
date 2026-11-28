/**
 * Pip, the English-speaking guest of Season 2 (step 2, part G; idea/proposal/season2-step2-plan-2026-11-27, layout §1,
 * lines §3): a little bird who lost his map. He is met once in the hub, after the first world is finished, the cat
 * translating him; then he waits at his place in the worlds 1-2 - no resident (R10): no chain, no shard, never among the
 * residents of a world (`WorldEntry.characters`) - and turns to her when she comes near.
 * English off (the parents' section, `save.english`): no Pip anywhere.
 *
 * Here: when he shows, what his meeting writes, the lines of his meeting, and his figure. His request is part G2.
 */
import * as THREE from 'three';
import type { Rig } from '../core/assets';
import type { Save } from '../core/save';
import { PAGES, meetWord } from '../ui/wordbook';
import { Actor, shadowFromBody } from './actor';
import type { Spot } from './player';
import type { SpokenKey } from '../ui/strings';

/** The model (public/models/pip/pip.glb, Meshy, CREDITS.md) and its height in the world, m: a little bird. */
export const PIP_MODEL = 'pip/pip';
export const PIP_HEIGHT = 0.6;
/** m within which he turns to her (as the residents do, src/worlds/fairy/characters.ts). */
export const PIP_TURN = 7;
/** m of the spot of talk round him (src/game/talk-spot.ts). */
export const PIP_TALK = 2.4;

/** Whether Pip is in the worlds: met, and English on. */
export const pipShown = (save: Pick<Save, 'english' | 'pip'>) => save.english !== false && save.pip.met;
/** Whether the hub has his meeting now: English on, not met yet, the first world finished (layout §1). */
export const meetsPip = (save: Pick<Save, 'english' | 'pip'>, firstWorldDone: boolean) => save.english !== false && !save.pip.met && firstWorldDone;

/** The words of the hub (the book's first page, wordbook §1): met with Pip - his hello and goodbye, the cat, the bird, the tree. */
export const HUB_WORDS = PAGES.find((p) => p.world === 'hub')!.words;

/**
 * His meeting is over: he is met (`save.pip.met`), and the words of the hub lie in the book, quietly - the meeting says
 * "a new word" once itself. The number of words new to the book.
 */
export function meetPip(save: Save): number {
  save.pip.met = true;
  return HUB_WORDS.filter((w) => meetWord(save, w, true)).length;
}

/**
 * The lines of the meeting, in their order (lines §3): Pip's in English (src/s2/strings-en.ts, Zephyr), the cat's
 * translation after each - at this first meeting only; later, the translation is the hint.
 */
export const MEETING: readonly ({ pip: string } | { cat: SpokenKey })[] = [
  { pip: 'pip_arrive' }, { cat: 'pip_cat_who' }, { cat: 'pip_cat_hello' },
  { pip: 'pip_lost' }, { cat: 'pip_cat_lost' },
  { pip: 'pip_map' }, { cat: 'pip_cat_map' },
  { pip: 'pip_help' }, { cat: 'pip_cat_learn' },
];

/** ms a line of his stays at least, for reading it: his clip may be shorter, or not there (no network, not recorded). */
export const readMs = (text: string) => 900 + text.length * 45;

/** Where he stands in a world: on the ground at (x, z), looking along `heading` when she is far. */
export interface PipPlace { x: number; z: number; heading: number }

export interface PipFigure {
  readonly actor: Actor;
  readonly pos: THREE.Vector3;
  /** The golden diamond over his head: a request of his waits (G2 sets it). */
  readonly mark: THREE.Mesh;
  /** His spot of talk: the action button near him, a tap on his figure. */
  spot(run: () => void, done?: () => boolean): Spot;
  /** Every frame: he turns to her within PIP_TURN m, else back to his heading; his clips go on. */
  update(dt: number, time: number, hero: THREE.Vector3): void;
  /** Shown or not (English turned off while in a world: he is gone). */
  show(on: boolean): void;
  dispose(): void;
}

/** His figure at `place`, on the ground `groundY`; `block` keeps her out of him (the world's ground.block). */
export function createPip(scene: THREE.Object3D, rig: Rig, place: PipPlace, groundY: (x: number, z: number) => number,
  block?: (x: number, z: number, r: number) => void): PipFigure {
  const actor = new Actor(rig);
  shadowFromBody(actor.root);
  const pos = new THREE.Vector3(place.x, groundY(place.x, place.z), place.z);
  actor.root.position.copy(pos); actor.heading = place.heading; actor.root.rotation.y = place.heading;
  actor.root.name = 'pip';
  scene.add(actor.root);
  actor.play('Idle');
  block?.(place.x, place.z, 0.4);
  const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.13),
    new THREE.MeshStandardMaterial({ color: '#ffd54a', emissive: '#ffb300', emissiveIntensity: 1.1, roughness: 0.3 }));
  mark.name = 'pip-mark';
  mark.visible = false;
  scene.add(mark);
  let flap = 4;
  return {
    actor, pos, mark,
    spot: (run, done = () => false) => ({
      pos, r: PIP_TALK, label: 'talk', on: () => actor.root.visible, run,
      talker: { done, top: () => PIP_HEIGHT + 0.4 },
    }),
    update: (dt, time, hero) => {
      if (!actor.root.visible) return;
      const d = Math.hypot(hero.x - pos.x, hero.z - pos.z);
      actor.face(d < PIP_TURN ? Math.atan2(hero.x - pos.x, hero.z - pos.z) : place.heading, dt, 3);
      // now and then a flap of his wings, back to his idle (the Flap clip of the model)
      if ((flap -= dt) < 0) { flap = 5 + (Math.sin(time * 1.7) + 1) * 3; if (actor.has('Flap')) actor.once('Flap', 'Idle'); }
      mark.position.set(pos.x, pos.y + PIP_HEIGHT + 0.45 + Math.sin(time * 2.5) * 0.08, pos.z);
      mark.rotation.y = time * 2;
      actor.update(dt);
    },
    show: (on) => { actor.root.visible = on; if (!on) mark.visible = false; },
    dispose: () => {
      scene.remove(actor.root); scene.remove(mark);
      mark.geometry.dispose(); (mark.material as THREE.Material).dispose();
    },
  };
}
