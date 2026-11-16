import * as THREE from 'three';
import { say, sfx } from '../../core/audio';
import { randInt } from '../../core/util';
import type { Game } from '../../game/context';
import { numberSprite } from '../../game/fx';
import type { TaskResult } from '../../game/taskviews/panel';
import type { Npc, WorldTask } from '../../game/world';
import { TRY, tapKey, voiceText } from '../../ui/strings';
import { hideAnswers, showAnswers } from '../../ui/ui';
import { PATCH } from './layout';

/** The state of the task; window.__game reads this very object, so it is changed in place, never replaced. */
export interface ButterfliesState {
  active: boolean; n: number; first: number; counted: number; wrong: number; own: number; demo: boolean;
  /** The mistake whose hint has run its course (its line ended, its show started); 0 - none yet. For the walkthrough. */
  shown: number;
  sprites: THREE.Sprite[]; colors: string[]; done: (r: TaskResult) => void;
}

/** A foreground task of the world (src/game/world.ts): the unicorn's conversation waits for it. */
export interface ButterfliesTask extends WorldTask {
  readonly bf: ButterfliesState;
  /** The task itself: count the butterflies over the flower bed. */
  run(n: Npc, level: number): Promise<TaskResult>;
  /** A tap while the butterflies are counted: every tap is theirs, even one that hits none (true). */
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  /** The numbers over the counted butterflies bob. */
  bob(time: number): void;
}

/**
 * The butterflies of the first world (ARCH-05): the ambient ones over the flower drifts, added right here - before any
 * task, so the task's butterflies are always the last ones - and the task of counting them over the flower bed.
 */
export function createButterfliesTask(g: Game): ButterfliesTask {
  const { scene, cam, sparks, flies, groundY, rng } = g;
  const { caption, line, hintLine } = g.speech;

  // Ambient butterflies over flower drifts.
  const palette = ['#ff8fc4', '#ffd54f', '#8fd3ff', '#c9a6ff', '#ffffff', '#ff9a6b'];
  for (let i = 0; i < 22; i++) {
    const a = i * 2.4, r = 6 + (i * 37 % 40);
    flies.add(Math.cos(a) * r, Math.sin(a) * r - 6, 2 + (i % 3), palette[i % palette.length]);
  }

  const bf: ButterfliesState = { active: false, n: 0, first: 0, counted: 0, wrong: 0, own: -1, demo: false, shown: 0, sprites: [] as THREE.Sprite[], colors: ['#ff4fa3', '#7a5cff', '#2aa8ff', '#ff5a4f'], done: (_: TaskResult) => {} };

  // ----- task in the world: count the butterflies over the flower bed -----
  function countButterflies(level: number): Promise<TaskResult> {
    return new Promise((done) => {
      Object.assign(bf, { active: true, counted: 0, wrong: 0, own: -1, demo: false, shown: 0, done, first: flies.flies.length, n: level === 1 ? randInt(3, 5, rng) : level === 2 ? randInt(5, 7, rng) : randInt(7, 9, rng) });
      for (let i = 0; i < bf.n; i++) {
        const a = (i / bf.n) * 6.28 + rng() * 0.5, r = 0.5 + rng() * 1.6;
        const id = flies.add(PATCH.x + Math.cos(a) * r, PATCH.z + Math.sin(a) * r, 0.45, bf.colors[i % 4], 1.5);
        flies.flies[id].home.y = groundY(PATCH.x, PATCH.z) + 1.0 + (i % 3) * 0.45;
      }
      cam.focus = new THREE.Vector3(PATCH.x, groundY(PATCH.x, PATCH.z) + 1.2, PATCH.z);
      void line('t_count', 'task', 0, '🦄');
      showAnswers(10, (n, btn) => {
        if (!bf.active || bf.demo) return;
        if (n === bf.n) {
          btn.classList.add('yes'); bf.active = false;
          setTimeout(() => {
            hideAnswers();
            for (let i = bf.first; i < bf.first + bf.n; i++) { const f = flies.flies[i]; f.landed = false; f.scale = 1.2; f.r = 2.2; flies.setColor(i, bf.colors[(i - bf.first) % 4]); }
            bf.sprites.forEach((s) => scene.remove(s)); bf.sprites.length = 0;
            bf.done({ solved: true, wrong: bf.wrong });
          }, 700);
        } else {
          btn.classList.add('no'); sfx('soft');
          const round = ++bf.wrong;            // a newer mistake cuts "try again" off and starts its own round
          const k = TRY[randInt(0, TRY.length - 1)], box = btn.parentElement;
          void say(k, voiceText(k), 'task').then(() => { if (bf.active && bf.wrong === round) void hint(round, box); });
        }
      }, closeButterflies);
    });
  }
  /**
   * The close button: the task ends unsolved and leaves nothing behind - no butterflies, numbers, panel or voice
   * (the voice is stopped by the end of the task, see `task`).
   * Nothing is recorded; the unicorn starts the task anew. Does nothing once the right answer is given.
   */
  function closeButterflies() {
    if (!bf.active) return;
    bf.active = false; bf.demo = false;
    hideAnswers();
    bf.sprites.forEach((s) => scene.remove(s)); bf.sprites.length = 0;
    flies.truncate(bf.n);                      // the task butterflies are the last ones while the task is open
    bf.done({ solved: false, wrong: bf.wrong });
  }
  function countFly(i: number) {
    const f = flies.flies[i];
    if (f.landed) return;
    f.landed = true; f.scale = 1.9;
    flies.setColor(i, '#ff9f1a');
    const s = numberSprite(++bf.counted);
    s.position.copy(f.pos).y += 0.7;
    scene.add(s); bf.sprites.push(s);
    sparks.burst(f.pos, '#fff2a8', 10, 2);
    sfx('pop');
    const k = tapKey(bf.counted);
    if (k) void say(k, voiceText(k), 'task');
  }
  /**
   * The hint of mistake `round` in three rungs (HINTS.md): 1 - the way, said only (the butterflies are not touched);
   * 2 - "let's count together" and the cat's count (`demoCount`); 3 and later - "look what glows", and the right answer
   * button pulses. After a line of rung 1 or 3 the bubble gets the question back, as after the count.
   */
  async function hint(round: number, box: HTMLElement | null) {
    if (round === 2) { void demoCount(); return; }
    await hintLine(round === 1 ? 'h1_count' : 'h3_show');
    if (!bf.active || bf.wrong !== round) return;
    if (round >= 3) [...(box?.children ?? [])].find((b) => b.textContent === String(bf.n))?.classList.add('pulse');
    bf.shown = round;
    caption({ key: 't_count', pri: 'task', hold: 0, speaker: '🦄' });
  }
  /**
   * Rung 2 after a miss: the cat says "let's count together" to the end, then counts every butterfly aloud, one by one.
   * Answers are open while the hint is spoken; a line that was cut off settles at once too, so the count starts
   * only if the task is still open, the mistake is still the latest one and no count is running.
   */
  async function demoCount() {
    const round = bf.wrong;
    await hintLine('h_count');
    if (!bf.active || bf.demo || bf.wrong !== round || bf.own === round) return;
    bf.demo = true; bf.shown = round;
    for (let i = bf.first; i < bf.first + bf.n; i++) { const f = flies.flies[i]; f.landed = false; f.scale = 1.5; flies.setColor(i, bf.colors[(i - bf.first) % 4]); }
    bf.sprites.forEach((s) => scene.remove(s)); bf.sprites.length = 0; bf.counted = 0;
    for (let i = bf.first; i < bf.first + bf.n && bf.active; i++) { countFly(i); await new Promise((r) => setTimeout(r, 850)); }
    bf.demo = false;
    if (bf.active) caption({ key: 't_count', pri: 'task', hold: 0, speaker: '🦄' });
  }

  return {
    bf,
    skill: 'count',
    run: (_n, level) => countButterflies(level),
    tap: (screenDist) => {
      if (!(bf.active && !bf.demo)) return false;
      let best = -1, bd = g.touch ? 70 : 46;
      for (let i = bf.first; i < bf.first + bf.n; i++) { const d = screenDist(flies.flies[i].pos); if (d < bd && !flies.flies[i].landed) { bd = d; best = i; } }
      if (best >= 0) { bf.own = bf.wrong; countFly(best); }   // her own count: the cat will not count over it (see demoCount)
      return true;
    },
    bob: (time) => {
      for (let i = 0; i < bf.sprites.length; i++) bf.sprites[i].position.y += Math.sin(time * 3 + i) * 0.002;
    },
  };
}
