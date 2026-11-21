// @vitest-environment happy-dom
/**
 * The picture of the pieces (PLAY-29): a kind not a set - no row of the sets, no stars of a set, no «Збирачка», never
 * in the stash, never the find of the day, never asked by a recipe or a trade; as many pieces as the cells of its
 * picture, each a cell in their order; the last one makes the picture come alive.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, worldState, type Save } from '../core/save';
import { COLLECT, DAILY_PLACES, clearOfFinds } from '../worlds/fairy/collect';
import { createCollections, type CollectHost } from './collect-items';
import {
  COLLECT_KINDS, SET_SIZE, collectProblems, isSet, itemsOf, kindsOf, piecesOf, pictureDone, setItems, setKindsOf, type CollectDef, type CollectItem,
} from './collections';
import { RECIPES, shownRecipes } from './cauldron';
import { dailyOf } from './daily-find';
import { ACHIEVEMENTS } from './achievements';
import { pictureView } from '../ui/picture';
import { TRADES } from '../worlds/fairy/trade';

vi.mock('../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: vi.fn() }));
vi.mock('./fx', () => ({ glowTex: null, Sparks: class {} }));

/** A game of the tests: the world `def`, the heroine away from every find. */
function host(def: CollectDef) {
  const save = defaultSave(), ws = worldState(save, 'fairy'), lines: string[] = [];
  const g = {
    scene: new THREE.Scene(), save, ws, world: { id: 'fairy', collect: def }, ground: {}, groundY: () => 0,
    hero: { root: new THREE.Object3D() }, sparks: { burst: vi.fn() },
    speech: { line: async (k: string) => { lines.push(k); } },
    addStars: vi.fn(), above: (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy), persist: vi.fn(),
  };
  g.hero.root.position.set(100, 0, 100);
  return { g: g as unknown as CollectHost & typeof g, ws, lines, save };
}

const PIC = { image: 'story/w1_intro_1', cols: 2, rows: 1 };
const def: CollectDef = {
  items: [
    ...Array.from({ length: SET_SIZE }, (_, i): CollectItem => ({ kind: 'acorn', way: 'run', x: i * 10, z: 0, y: 0.1 })),
    { kind: 'piece', way: 'run', x: 0, z: 30, y: 0.3 }, { kind: 'piece', way: 'run', x: 10, z: 30, y: 0.3 },
  ],
  picture: PIC,
};

describe('the kind of the pieces', () => {
  it('is no set: not among the kinds of the sets, nor their finds', () => {
    expect(isSet('piece')).toBe(false);
    expect((Object.keys(COLLECT_KINDS) as (keyof typeof COLLECT_KINDS)[]).filter((k) => !isSet(k))).toEqual(['piece']);
    expect(kindsOf(def)).toEqual(['acorn', 'piece']);
    expect(setKindsOf(def)).toEqual(['acorn']);
    expect(setItems(def)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('collectProblems asks as many pieces as the cells of the picture, not six', () => {
    expect(collectProblems(def)).toEqual([]);
    expect(collectProblems({ ...def, items: def.items.slice(0, -1) })).toEqual(['the picture has 2 cells and 1 pieces']);
    expect(collectProblems({ items: def.items })).toEqual(['the picture has 0 cells and 2 pieces']);
  });

  it('a piece\'s cell is its place among the pieces; the picture is whole with every piece', () => {
    expect(piecesOf(def)).toEqual([6, 7]);
    expect(pictureDone(def, [6])).toBe(false);
    expect(pictureDone(def, [7, 6])).toBe(true);
    expect(pictureDone({ items: def.items.slice(0, 6) }, [0, 1, 2, 3, 4, 5])).toBe(false);   // no picture: never whole
  });

  it('is never in a recipe or a trade, never asked: its world "any" is never open', () => {
    const s: Save = defaultSave();
    s.worlds = { fairy: worldState(defaultSave(), 'fairy'), hub: worldState(defaultSave(), 'hub'), any: worldState(defaultSave(), 'any') };
    for (const r of RECIPES) expect(Object.keys(r.need)).not.toContain('piece');
    for (const o of Object.values(TRADES).flat()) expect(Object.keys(o.need)).not.toContain('piece');
    expect(shownRecipes(s).length).toBe(RECIPES.length);
  });

  it('is never the find of the day', () => {
    for (let d = 1; d <= 28; d++) {
      const f = dailyOf({ collect: COLLECT, daily: { places: DAILY_PLACES } }, {}, `2026-12-${String(d).padStart(2, '0')}`);
      expect(f?.kind).not.toBe('piece');
    }
  });

  it('«Збирачка» counts the sets alone: every set whole, no piece found - it is earned', () => {
    const collector = ACHIEVEMENTS.find((a) => a.id === 'collector')!;
    const s = defaultSave(), ws = worldState(s, 'fairy');
    ws.found = setItems(COLLECT);
    const ctx = { worlds: [{ id: 'fairy', characters: [], collect: setItems(COLLECT) }] } as never;
    expect(collector.test(s, ctx)).toBe(true);
  });
});

describe('a piece taken (src/game/collect-items.ts)', () => {
  it('a star, kept in the book, not in the stash, no stars of a set; the first - its line; the last - the picture comes alive', () => {
    const h = host(def), c = createCollections(h.g);
    h.g.hero.root.position.set(0, 0, 30); c.update(0.016, 0, true);
    expect(h.ws.found).toEqual([6]);
    expect(h.g.addStars.mock.calls.map((a) => a[0])).toEqual([1]);
    expect(h.save.stash ?? {}).toEqual({});
    expect(h.lines).toEqual(['piece_first']);
    expect(pictureView.open).toBe(false);
    h.g.hero.root.position.set(10, 0, 30); c.update(0.016, 0, true);
    expect(h.ws.found).toEqual([6, 7]);
    expect(h.g.addStars.mock.calls.map((a) => a[0])).toEqual([1, 1]);       // no five of a set
    expect(h.lines).toEqual(['piece_first', 'picture_done']);
    expect(pictureView).toEqual({ open: true, image: 'story/w1_intro_1' });
    expect(document.querySelector('#pictureAlive .pa-img')).not.toBeNull();
    (document.getElementById('pictureAlive') as HTMLElement).click();       // a tap closes it
    expect(pictureView.open).toBe(false);
    expect(h.save.stash ?? {}).toEqual({});
  });
});

describe('the pieces of the fairy world', () => {
  it('six, for a frame of 3 x 2 of the story\'s opening frame, off the path and the other finds', () => {
    expect(COLLECT.picture).toEqual({ image: 'story/w1_intro_1', cols: 3, rows: 2 });
    expect(itemsOf(COLLECT, 'piece')).toHaveLength(6);
    expect(collectProblems(COLLECT)).toEqual([]);
    // the 24 finds of the sets keep their numbers: the pieces come after them
    expect(setItems(COLLECT)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    for (const i of piecesOf(COLLECT)) {
      const p = COLLECT.items[i];
      // nothing of chance is laid on it (it is a find: the rocks and bushes keep away)
      expect(clearOfFinds(p.x + 0.5, p.z)).toBe(false);
    }
  });
});
