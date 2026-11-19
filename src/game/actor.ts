import * as THREE from 'three';
import type { Rig } from '../core/assets';
import { angleDiff, damp } from '../core/util';

/** A skinned character with cross-faded animation states. */
export class Actor {
  readonly root: THREE.Group;
  readonly model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  /** Names played by other clips (`rename`): null - every name plays its own clip. */
  private names: Readonly<Record<string, string>> | null = null;
  heading = 0;

  constructor(rig: Rig) {
    this.root = rig.root;
    this.model = rig.model;
    this.mixer = new THREE.AnimationMixer(rig.model);
    for (const [name, clip] of rig.clips) this.actions.set(name, this.mixer.clipAction(clip));
  }

  has(name: string) { return this.actions.has(name); }

  /**
   * Clips of a world (src/game/hero.ts `worldClips`) join this character's own for as long as the world is played: the
   * returned function takes them back (a world hands it to its scope). A name the character already has is an error -
   * a world adds clips, it never replaces the shared ones.
   */
  lend(clips: ReadonlyMap<string, THREE.AnimationClip>): () => void {
    for (const name of clips.keys()) if (this.actions.has(name)) throw new Error(`actor: the clip "${name}" is there already`);
    for (const [name, clip] of clips) this.actions.set(name, this.mixer.clipAction(clip));
    return () => {
      for (const [name, clip] of clips) {
        if (this.actions.get(name)?.getClip() !== clip) continue;
        this.actions.get(name)!.stop();
        this.mixer.uncacheClip(clip);
        this.actions.delete(name);
        if (this.current === name) this.current = '';
      }
    };
  }

  /**
   * The one point where a name is swapped for another clip (the heroine in the water: Idle -> Float, src/game/hero.ts
   * `SWIM_NAMES`): every `play`, `once` and `pose` goes through it. A name whose clip the character does not have plays as
   * it is. Null: no swap.
   */
  rename(names: Readonly<Record<string, string>> | null) { this.names = names; }

  private named(name: string) {
    const to = this.names?.[name];
    return to !== undefined && this.actions.has(to) ? to : name;
  }

  play(name: string, fade = 0.2, speed = 1) {
    name = this.named(name);
    const next = this.actions.get(name);
    if (!next) return;
    next.timeScale = speed;
    if (this.current === name) return;
    const prev = this.actions.get(this.current);
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    prev?.fadeOut(fade);
    this.current = name;
  }

  /** Plays a clip once, then returns to `then`. */
  once(name: string, then: string) {
    name = this.named(name);
    const a = this.actions.get(name);
    if (!a) return;
    const prev = this.actions.get(this.current);
    a.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.15).play();
    a.clampWhenFinished = true;
    prev?.fadeOut(0.15);
    this.current = name;
    const done = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== a) return;
      this.mixer.removeEventListener('finished', done);
      if (this.current === name) this.play(then, 0.25);
    };
    this.mixer.addEventListener('finished', done);
  }

  /** Jumps straight to the last frame of a clip (for restoring saved state). */
  pose(name: string) {
    name = this.named(name);
    const a = this.actions.get(name);
    if (!a) return;
    a.reset().setLoop(THREE.LoopOnce, 1).play();
    a.clampWhenFinished = true;
    a.time = a.getClip().duration;
    this.current = name;
  }

  face(target: number, dt: number, rate = 12) {
    this.heading += angleDiff(target, this.heading) * damp(rate, dt);
    this.root.rotation.y = this.heading;
  }

  update(dt: number) { this.mixer.update(dt); }
}

/**
 * The shadow of a model from its body only (docs/perf.md): every part of a model with a material of its own is a draw
 * call of its own in the shadow pass too, and the small ones - eyes, hooves, buckles - cast shadows nobody sees. The
 * parts with less than `share` of the model's triangles stop casting; the biggest part always casts.
 */
export function shadowFromBody(root: THREE.Object3D, share = 0.15): void {
  const parts: THREE.Mesh[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.castShadow) parts.push(m); });
  const tris = (m: THREE.Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  const total = parts.reduce((s, m) => s + tris(m), 0), biggest = Math.max(...parts.map(tris));
  for (const m of parts) if (tris(m) < total * share && tris(m) < biggest) m.castShadow = false;
}
