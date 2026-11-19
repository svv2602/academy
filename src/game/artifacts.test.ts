// @vitest-environment happy-dom
/**
 * The artifacts brought back (./artifacts.ts): the worlds with a place on the shelf, their finals in the save; the
 * shelf of the book takes its worlds from the registry (src/ui/book.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { shelfState, shelfWorld, SHELF } from '../ui/book';
import { artifactBack, artifactCount, artifactsBack, knowWorlds } from './artifacts';

const REGISTRY = [{ id: 'fairy', shelf: 0 }, { id: 'hub' }, { id: 'forest', shelf: 1 }, { id: 'sea', shelf: 2 }];
const played = (finals: Record<string, boolean>): Save => {
  const s = defaultSave();
  for (const [id, final] of Object.entries(finals)) (s.worlds as Record<string, unknown>)[id] = { final, quests: {} };
  return s;
};

afterEach(() => knowWorlds([]));

describe('the artifacts brought back', () => {
  it('none in a new save, and asking creates no world in it', () => {
    const s = defaultSave();
    expect(artifactCount(s, REGISTRY)).toBe(0);
    expect(artifactBack(s, 'fairy')).toBe(false);
    expect(Object.keys(s.worlds)).toEqual([]);
  });

  it('one per world with a place on the shelf whose final is played, in the order of the places', () => {
    const s = played({ sea: true, fairy: true, forest: false, hub: true });
    expect(artifactsBack(s, REGISTRY)).toEqual(['fairy', 'sea']);
    expect(artifactCount(s, REGISTRY)).toBe(2);   // the hub has no artifact, whatever its save says
  });

  it('counts the worlds the registry handed in at the start', () => {
    knowWorlds(REGISTRY);
    expect(artifactCount(played({ fairy: true, forest: true }))).toBe(2);
  });
});

describe('the shelf takes its worlds from the registry', () => {
  it('a world added to the registry takes its place by itself; a place no world has waits', () => {
    expect(SHELF.map((p, i) => shelfWorld(p, i, REGISTRY))).toEqual(['fairy', 'forest', 'sea', null, null]);
    const states = shelfState(played({ fairy: true, forest: true }), null, REGISTRY);
    expect(states.map((x) => x.kind)).toEqual(['found', 'found', 'wait', 'wait', 'wait']);
  });

  it('with no registry known, the places keep their own worlds (the first world on the first)', () => {
    expect(SHELF.map((p, i) => shelfWorld(p, i, []))).toEqual(['fairy', null, null, null, null]);
  });
});
