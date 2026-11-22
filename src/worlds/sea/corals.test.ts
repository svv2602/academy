/**
 * The search among the corals (WORLD-17, ./corals.ts): the shells looked for and their look-alikes by the corals, a
 * look-alike touched is no mistake, the last shell found brings the pearl and ends the step, and no skill is touched.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultSave, defaultWorld } from '../../core/save';
import type { Game } from '../../game/context';
import type { Npc } from '../../game/world';
import { sameShell } from '../../game/worldtasks/corals';
import { addStrings } from '../../ui/strings';
import { TAP_PX, TAP_R, createCoralsSearch } from './corals';
import { strings } from './strings';

addStrings(strings, true);

/** Corals in a row 3 m apart; the heroine at the first. */
const CORALS = Array.from({ length: 12 }, (_, i) => ({ x: i * 3, z: 0, s: 1, rot: 0 }));

function game() {
  const save = defaultSave(), ws = defaultWorld(), said: string[] = [], captions: unknown[] = [];
  let seed = 3;
  const g = {
    scene: new THREE.Scene(), groundY: () => 0, ground: { resolve: () => {} }, hero: { root: new THREE.Object3D() },
    save, ws, busy: false, persist: () => {}, sparks: { burst: () => {} },
    rng: () => ((seed = (seed * 16807) % 2147483647) / 2147483647),
    speech: { caption: (c: unknown) => { captions.push(c); }, shown: null, line: (k: string) => { said.push(k); return Promise.resolve(); } },
  };
  let all = 0;
  const search = createCoralsSearch(g as unknown as Game, () => { all++; }, () => CORALS);
  const bulk = { def: { id: 'bulk', emoji: '🐉' }, pos: new THREE.Vector3(0, 0, -3) } as unknown as Npc;
  return { g, save, said, captions, search, bulk, all: () => all };
}
/** A touch right on `p` (the screen distance 0 there, far elsewhere), the heroine put next to it. */
const touchAt = (g: ReturnType<typeof game>['g'], search: ReturnType<typeof game>['search'], p: THREE.Vector3) => {
  g.hero.root.position.set(p.x, 0, p.z + 1);
  return search.tap((q) => (q.distanceTo(p) < 1e-6 ? 0 : 1000));
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the search among the corals (WORLD-17)', () => {
  it('lays the shells looked for and their look-alikes by the corals, and shows the one looked for over Bulk', () => {
    const { g, search, bulk, said } = game();
    search.start!(bulk, () => {});
    const { body, shells } = search.state;
    expect(body).not.toBeNull();
    expect(shells.filter((s) => s.wanted)).toHaveLength(body!.hidden);
    expect(shells.filter((s) => !s.wanted)).toHaveLength(body!.alike.length);
    for (const s of shells) {
      expect(s.wanted).toBe(sameShell(s, body!.sample));
      expect(Math.min(...CORALS.map((c) => Math.hypot(c.x - s.at.x, c.z - s.at.z)))).toBeLessThan(1);
    }
    // the shells and the one over Bulk's head are in the scene
    expect(g.scene.children.length).toBe(shells.length + 1);
    expect(said[0]).toBe('bulk_coral_start');
    expect(search.active!()).toBe(true);
    expect(search.owner!()).toBe('bulk');
  });

  it('a look-alike touched: nothing found, it rocks, the cat says what is looked for again', () => {
    const { g, search, bulk, said } = game();
    search.start!(bulk, () => {});
    const alike = search.state.shells.find((s) => !s.wanted)!;
    expect(touchAt(g, search, alike.at)).toBe(true);
    expect(alike.found).toBe(false);
    expect(alike.rock).toBeGreaterThan(0);
    expect(said.at(-1)).toBe('sea_coral_not_this');
    expect(search.state.shells.some((s) => s.found)).toBe(false);
  });

  it('a touch far from her or off every shell takes nothing', () => {
    const { g, search, bulk } = game();
    search.start!(bulk, () => {});
    const s = search.state.shells.find((x) => x.wanted)!;
    g.hero.root.position.set(s.at.x + TAP_R + 1, 0, s.at.z);
    expect(search.tap((q) => (q.distanceTo(s.at) < 1e-6 ? 0 : 1000))).toBe(false);
    g.hero.root.position.set(s.at.x, 0, s.at.z + 1);
    expect(search.tap(() => TAP_PX + 1)).toBe(false);
    expect(s.found).toBe(false);
  });

  it('every shell looked for found: Bulk is glad at each, the last brings the pearl, then the step is done - no skill touched', async () => {
    const { g, save, search, bulk, said, all } = game();
    const skills = JSON.stringify(save.skills);
    let done = 0;
    search.start!(bulk, () => { done++; });
    const wanted = search.state.shells.filter((s) => s.wanted);
    for (const [i, s] of wanted.entries()) {
      expect(touchAt(g, search, s.at)).toBe(true);
      await flush();
      if (i < wanted.length - 1) expect(done).toBe(0);
    }
    expect(wanted.every((s) => s.found)).toBe(true);
    expect(said.filter((k) => k.startsWith('bulk_coral_found'))).toEqual(wanted.slice(1).map((_, i) => (i % 2 === 0 ? 'bulk_coral_found_1' : 'bulk_coral_found_2')));
    expect(said.at(-1)).toBe('bulk_coral_all');
    expect(all()).toBe(1);
    expect(done).toBe(1);
    expect(search.active!()).toBe(false);
    expect(JSON.stringify(save.skills)).toBe(skills);
  });

  it('the walkthrough\'s moves: a look-alike once, then the shells looked for one by one, then nothing', async () => {
    const { search, bulk } = game();
    let done = 0;
    search.start!(bulk, () => { done++; });
    const wanted = search.state.shells.filter((s) => s.wanted).length;
    expect(search.cheat()).toBe(true);
    expect(search.state.wrongTouched).toBe(true);
    expect(search.state.shells.some((s) => s.found)).toBe(false);
    for (let i = 0; i < wanted; i++) expect(search.cheat()).toBe(true);
    await flush();
    expect(done).toBe(1);
    expect(search.cheat()).toBe(false);
  });

  it('the finer the look-alikes, the higher "Classification" is', () => {
    const { search, bulk, save } = game();
    save.skills.classify.level = 5;
    search.start!(bulk, () => {});
    const { body } = search.state;
    expect(body!.hidden).toBe(5);
    expect(body!.alike.length).toBe(5);
  });
});
