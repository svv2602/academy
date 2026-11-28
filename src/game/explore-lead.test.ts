// @vitest-environment happy-dom
/**
 * The explorer's key in the world played (./explore-lead.ts): after the final with too little explored, the cat's word
 * once and the sparkles to the nearest thing not found; the half after that word; every point; none with the free pass
 * but the last, none in the last world but the last.
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../core/audio', () => ({ speaking: () => false }));
import { defaultSave, worldState } from '../core/save';
import { knowWorlds, knownWorlds, type ArtifactWorld } from './artifacts';
import { fillExplore } from './explore';
import { EXPLORE_WORDS, installExploreLead } from './explore-lead';
import type { Game } from './context';
import { STRINGS, SPOKEN } from '../ui/strings';

const before = knownWorlds();
afterEach(() => knowWorlds(before));
const cones = { items: Array(6).fill({ kind: 'cone' }) };
const WORLDS: ArtifactWorld[] = [{ id: 'a', shelf: 0, secrets: ['s1', 's2'], collect: cones }, { id: 'b', shelf: 1, secrets: ['t1'] }, { id: 'hub' }];

function game(id: string, glimmer: THREE.Vector3[] = []) {
  knowWorlds(WORLDS);
  const save = defaultSave(), ws = worldState(save, id), lines: string[] = [];
  const g = {
    worldId: id, save, ws, busy: false, started: () => true, persist: vi.fn(),
    speech: { line: (k: string) => { lines.push(k); return Promise.resolve(); } },
    hero: { root: new THREE.Object3D() }, collect: { unfound: () => [new THREE.Vector3(20, 0, 0)] }, mystery: { unsolved: () => [new THREE.Vector3(0, 0, 30)] },
  };
  const lead = installExploreLead(g as unknown as Game, { glimmer: () => glimmer });
  const tick = (canMove = true) => lead.update(1, canMove);
  return { g, save, ws, lines, lead, tick };
}

describe('the cat after the final (src/game/explore-lead.ts)', () => {
  it('before the final: nothing; after it, too little explored: "explore_more" once, the sparkles to the nearest not found', () => {
    const h = game('a', [new THREE.Vector3(5, 0, 5)]);
    h.tick();
    expect(h.lines).toEqual([]);
    expect(h.lead.leading()).toBeNull();
    h.ws.final = true;
    h.tick(false);                                          // not while she cannot move
    expect(h.lines).toEqual([]);
    h.tick(); h.tick();
    expect(h.lines).toEqual([EXPLORE_WORDS.more]);
    expect(h.ws.flags.explore_more).toBe(true);
    expect(h.lead.leading()).toMatchObject({ x: 5, z: 5 });  // the secret's glimmer is the nearest
    h.g.hero.root.position.set(19, 0, 0);
    expect(h.lead.leading()).toMatchObject({ x: 20, z: 0 }); // now the find
  });

  it('the half got after the word: "explore_half" once, the lead stops; every point: "explore_full" once', () => {
    const h = game('a');
    h.ws.final = true; h.tick();
    fillExplore(h.save, WORLDS[0], 0.5); h.tick(); h.tick();
    expect(h.lines).toEqual([EXPLORE_WORDS.more, EXPLORE_WORDS.half]);
    expect(h.lead.leading()).toBeNull();
    fillExplore(h.save, WORLDS[0], 1); h.tick(); h.tick();
    expect(h.lines).toEqual([EXPLORE_WORDS.more, EXPLORE_WORDS.half, EXPLORE_WORDS.full]);
  });

  it('the half got before the final: no word of it, the arch just wakes', () => {
    const h = game('a');
    fillExplore(h.save, WORLDS[0], 0.5); h.ws.final = true; h.tick(); h.tick();
    expect(h.lines).toEqual([]);
  });

  it('the free pass, or the last world: no "more", no lead; "full" still', () => {
    const h = game('a'); h.save.freeArches = true; h.ws.final = true; h.tick();
    expect(h.lines).toEqual([]);
    expect(h.lead.leading()).toBeNull();
    const last = game('b'); last.ws.final = true; last.tick();
    expect(last.lines).toEqual([]);
    fillExplore(last.save, WORLDS[1], 1); last.tick();
    expect(last.lines).toEqual([EXPLORE_WORDS.full]);
  });

  it('the hub: nothing', () => {
    const h = game('hub'); h.ws.final = true; h.tick();
    expect(h.lines).toEqual([]);
    expect(h.lead.explored()).toBeNull();
  });

  it('the three words are spoken lines, in both languages', () => {
    for (const k of Object.values(EXPLORE_WORDS)) {
      expect(k in SPOKEN, k).toBe(true);
      expect((STRINGS.uk as Record<string, string>)[k], k).toBeTruthy();
      expect((STRINGS.ru as Record<string, string>)[k], k).toBeTruthy();
    }
  });
});
