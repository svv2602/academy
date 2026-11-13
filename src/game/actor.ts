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
  heading = 0;

  constructor(rig: Rig) {
    this.root = rig.root;
    this.model = rig.model;
    this.mixer = new THREE.AnimationMixer(rig.model);
    for (const [name, clip] of rig.clips) this.actions.set(name, this.mixer.clipAction(clip));
  }

  has(name: string) { return this.actions.has(name); }

  play(name: string, fade = 0.2, speed = 1) {
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
