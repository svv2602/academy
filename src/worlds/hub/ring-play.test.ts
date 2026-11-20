/** The pet plays round the ring of mushrooms while she stands by the stump (./ring-play.ts). */
import { describe, expect, it } from 'vitest';
import { PLAY, ringPlay } from './ring-play';

const stump = { x: 5, z: 3 };
function setup(at: { x: number; z: number }) {
  const hero = { ...at }, state = { busy: false };
  const steer = ringPlay(stump, () => hero, () => state.busy);
  const pet = { x: at.x + 0.8, z: at.z };
  const run = (sec: number) => { let r = null; for (let t = 0; t < sec; t += 1 / 60) r = steer(1 / 60, pet); return r as { x: number; z: number } | null; };
  return { hero, state, run };
}

describe('the pet at the ring of mushrooms', () => {
  it('by her side until she has stood by the stump a moment; then round the ring, just outside it', () => {
    const s = setup({ x: stump.x + 3, z: stump.z });
    expect(s.run(PLAY.still - 0.3)).toBeNull();
    const a = s.run(0.5)!;
    expect(a).not.toBeNull();
    expect(Math.hypot(a.x - stump.x, a.z - stump.z)).toBeCloseTo(PLAY.r);
    const b = s.run(1)!;
    const turned = Math.atan2(b.x - stump.x, b.z - stump.z) - Math.atan2(a.x - stump.x, a.z - stump.z);
    expect(Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned)))).toBeCloseTo(PLAY.turn, 1);
  });

  it('not while she walks, nor far from the stump', () => {
    const far = setup({ x: stump.x + PLAY.near + 1, z: stump.z });
    expect(far.run(5)).toBeNull();
    const walking = setup({ x: stump.x + 3, z: stump.z });
    for (let i = 0; i < 300; i++) { walking.hero.z += 0.03; if (walking.hero.z > stump.z + 2) walking.hero.z = stump.z - 2; expect(walking.run(1 / 60)).toBeNull(); }
  });

  it('back by her side once she walks off past the leave, or a scene takes the controls', () => {
    const s = setup({ x: stump.x + 3, z: stump.z });
    expect(s.run(2)).not.toBeNull();
    s.hero.x = stump.x + PLAY.leave - 0.3;   // a step inside the leave: it plays on
    expect(s.run(0.2)).not.toBeNull();
    s.hero.x = stump.x + PLAY.leave + 0.3;
    expect(s.run(0.1)).toBeNull();
    const t = setup({ x: stump.x + 3, z: stump.z });
    expect(t.run(2)).not.toBeNull();
    t.state.busy = true;
    expect(t.run(0.1)).toBeNull();
  });
});
