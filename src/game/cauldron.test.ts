/** The cauldron (./cauldron.ts, PLAY-26): recipes of open worlds only, nothing spent till the potion is done. */
import { describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { RECIPES, brewReady, finishBrew, putIn, shownRecipes, startBrew, stillToPut, type Recipe } from './cauldron';
import { STOCK_MAX, SUPPLIES } from './shop';
import { acting, drink } from './supplies';
import { addToStash } from './stash';

const world = { quests: {}, final: false, starsTaken: [], flags: {}, pos: null };
const save = (worlds: string[]): Save => { const s = defaultSave(); s.worlds = Object.fromEntries(worlds.map((w) => [w, { ...world }])); return s; };
const JUMP = RECIPES.find((r) => r.id === 'jump')!;

describe('which recipes she sees', () => {
  it('every potion of the shop from the finds of the fairy world, and the rainbow from two worlds; 3 or 4 finds each', () => {
    expect(RECIPES.map((r) => r.gives).sort()).toEqual(['compass', 'funny', 'glow', 'jump', 'rainbow', 'speed']);
    const RAINBOW = RECIPES.find((r) => r.gives === 'rainbow')!;
    expect(Object.keys(RAINBOW.need)).toContain('treefeather');      // the feather of the Great Tree: the hub
    for (const r of RECIPES) { const n = Object.values(r.need).reduce((a, b) => a + (b ?? 0), 0); expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(4); }
  });

  it('a recipe with a kind of a world not open is never shown, not even greyed (nothing she cannot make)', () => {
    const mixed: Recipe = { id: 'rainbow', gives: 'glow', need: { acorn: 1, treefeather: 1 } };
    expect(shownRecipes(save([]), [mixed, JUMP])).toEqual([]);
    expect(shownRecipes(save(['fairy']), [mixed, JUMP])).toEqual([JUMP]);
    expect(shownRecipes(save(['fairy', 'hub']), [mixed, JUMP])).toEqual([mixed, JUMP]);
    // the fairy world alone: the five of the shop; the hub open too - the rainbow as well
    expect(shownRecipes(save(['fairy'])).map((r) => r.id)).toEqual(['speed', 'jump', 'glow', 'funny', 'compass']);
    expect(shownRecipes(save(['fairy', 'hub']))).toEqual([...RECIPES]);
  });
});

describe('brewing', () => {
  it('a find the recipe asks goes in; one it does not ask, or one more than the stash has, is refused; nothing spent before the end', () => {
    const s = save(['fairy']);
    addToStash(s, 'acorn', 1); addToStash(s, 'feather', 3); addToStash(s, 'mushroom', 5);
    const b = startBrew(JUMP);
    expect(putIn(s, b, 'mushroom')).toBe('refused');     // not in the recipe
    expect(putIn(s, b, 'acorn')).toBe('put');
    expect(putIn(s, b, 'acorn')).toBe('refused');        // the stash has one acorn only
    expect(stillToPut(b, 'acorn')).toBe(1);
    expect(putIn(s, b, 'feather')).toBe('put');
    expect(putIn(s, b, 'feather')).toBe('refused');      // the recipe asks one
    expect(brewReady(b)).toBe(false);
    expect(finishBrew(s, b)).toBe(false);
    expect(s.stash).toEqual({ acorn: 1, feather: 3, mushroom: 5 });   // stopping half way cost nothing
  });

  it('done: exactly the recipe taken from the stash, one potion in the stock; the book is not touched', () => {
    const s = save(['fairy']);
    s.worlds.fairy.found = [6, 7, 12];
    addToStash(s, 'acorn', 3); addToStash(s, 'feather', 1);
    const b = startBrew(JUMP);
    putIn(s, b, 'acorn'); putIn(s, b, 'acorn'); putIn(s, b, 'feather');
    expect(brewReady(b)).toBe(true);
    expect(finishBrew(s, b)).toBe(true);
    expect(s.stash).toEqual({ acorn: 1 });
    expect(s.supplies).toEqual({ jump: 1 });
    expect(s.worlds.fairy.found).toEqual([6, 7, 12]);
  });

  it('a full stock of the potion brews nothing and spends nothing', () => {
    const s = save(['fairy']);
    s.supplies = { jump: STOCK_MAX };
    addToStash(s, 'acorn', 2); addToStash(s, 'feather', 1);
    const b = startBrew(JUMP);
    expect(putIn(s, b, 'acorn')).toBe('refused');
    expect(finishBrew(s, { recipe: JUMP, put: { acorn: 2, feather: 1 } })).toBe(false);
    expect(s.stash).toEqual({ acorn: 2, feather: 1 });
  });
});

describe('the rainbow: brewed, not sold', () => {
  it('not in the shop; brewed from a butterfly, an acorn and a feather of the Tree; drunk - the rainbow acts a minute', () => {
    expect(SUPPLIES.map((x) => x.id)).not.toContain('rainbow');
    const s = save(['fairy', 'hub']);
    addToStash(s, 'butterfly'); addToStash(s, 'acorn'); addToStash(s, 'treefeather');
    const b = startBrew(RECIPES.find((r) => r.id === 'rainbow')!);
    for (const k of ['butterfly', 'acorn', 'treefeather'] as const) expect(putIn(s, b, k)).toBe('put');
    expect(finishBrew(s, b)).toBe(true);
    expect(s.supplies).toEqual({ rainbow: 1 });
    expect(drink(s, 'rainbow', { water: false, mysteries: null, random: () => 0 })).toEqual({ effect: 'rainbow' });
    expect(acting(s)).toEqual(['rainbow']);
  });
});
