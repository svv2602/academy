import { describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { LOOKS, applyLook, look, lookOf } from './looks';
import { equip, has, item } from './shop';

const copy = (s: Save) => JSON.parse(JSON.stringify(s)) as Save;
/** The parameters of a look as the save holds them (R26: what the screenshots show). */
const params = (s: Save) => ({ dress: s.dress, hair: s.hair, wings: s.gear.wings, wingColor: s.wingColor, head: s.gear.head, wand: s.gear.wand });
/**
 * A palette of the screens, read from their source: src/ui/ui.ts and src/ui/shop.ts touch the document as they are
 * imported, and the tests run without one.
 */
const SOURCES = import.meta.glob(['../ui/ui.ts', '../ui/shop.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const palette = (file: string, name: string) => {
  const m = (SOURCES[file] ?? '').match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
  if (!m) throw new Error(`no ${name} in ${file}`);
  return [...m[1].matchAll(/'(#[0-9a-f]{6})'/gi)].map((x) => x[1]);
};

describe('the four looks of the start screen (PLAY-06, R24)', () => {
  it('are the fairy, the princess, the elf and the witch, each with a picture', () => {
    expect(LOOKS.map((l) => l.id)).toEqual(['fairy', 'princess', 'elf', 'witch']);
    for (const l of LOOKS) expect(l.icon.length, l.id).toBeGreaterThan(0);
  });

  it('each sets the dress, the hair, the wings, the head and the wand, and every pair differs in two of them or more (R26)', () => {
    const put = LOOKS.map((l) => { const s = defaultSave(); expect(applyLook(s, l.id)).toBe(true); return params(s); });
    for (let i = 0; i < put.length; i++) {
      for (let j = i + 1; j < put.length; j++) {
        const differ = (Object.keys(put[i]) as (keyof (typeof put)[0])[]).filter((k) => put[i][k] !== put[j][k]);
        expect(differ.length, `${LOOKS[i].id} / ${LOOKS[j].id}: ${differ.join(', ')}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('puts on exactly what the look says, over any earlier choice', () => {
    const s = defaultSave();
    s.dress = '#ffd54f'; s.hair = '#ff9ed2'; s.wingColor = '#d8f6ff';
    s.gear = { head: 'crown', wand: 'wand_star', wings: 'wings_butterfly', trail: null };
    for (const l of LOOKS) {
      applyLook(s, l.id);
      expect(params(s)).toEqual({ dress: l.dress, hair: l.hair, wings: l.wings, wingColor: l.wingColor, head: l.head, wand: l.wand });
      expect(lookOf(s)).toBe(l.id);
    }
  });

  it('leaves the trail, the things bought, the stars and the rest of the save as they were', () => {
    const s = defaultSave();
    s.stars = 17; s.owned = ['trail_sparkle', 'crown']; s.gear.trail = 'trail_sparkle'; s.name = 'Зоряна'; s.played = true;
    for (const l of LOOKS) {
      const before = copy(s);
      applyLook(s, l.id);
      const { dress, hair, wingColor, gear, ...rest } = s;
      const { dress: d0, hair: h0, wingColor: w0, gear: g0, ...rest0 } = before;
      void dress; void hair; void wingColor; void d0; void h0; void w0;
      expect(rest).toEqual(rest0);
      expect(gear.trail).toBe(g0.trail);
      expect(s.owned).toEqual(['trail_sparkle', 'crown']);
      expect(s.stars).toBe(17);
    }
  });

  it('an id that is no look changes nothing', () => {
    const s = defaultSave(), before = copy(s);
    expect(applyLook(s, 'pirate')).toBe(false);
    expect(look('pirate')).toBeUndefined();
    expect(s).toEqual(before);
  });

  it('wears only things she has from the start, of the right slot: free, nothing to buy', () => {
    const s = defaultSave();
    for (const l of LOOKS) {
      for (const [slot, id] of [['wings', l.wings], ['head', l.head], ['wand', l.wand]] as const) {
        if (id === null) continue;
        expect(item(id)?.slot, `${l.id}: ${id}`).toBe(slot);
        expect(has(s, id), `${l.id}: ${id}`).toBe(true);
        expect(item(id)?.price, `${l.id}: ${id}`).toBeUndefined();
      }
    }
  });

  it('takes its colours from the palettes of the start screen and the fitting room, so they show as chosen', () => {
    const dress = palette('../ui/ui.ts', 'DRESS'), hair = palette('../ui/ui.ts', 'HAIR'), wings = palette('../ui/shop.ts', 'WING_COLORS');
    expect(dress).toHaveLength(5); expect(hair).toHaveLength(5); expect(wings).toHaveLength(5);
    for (const l of LOOKS) {
      expect(dress, l.id).toContain(l.dress);
      expect(hair, l.id).toContain(l.hair);
      expect(wings, l.id).toContain(l.wingColor);
    }
  });
});

describe('after a look every choice changes on its own (R25)', () => {
  it('the hair, the dress, the wings and their colour, the head and the wand: each changed, the others kept', () => {
    const changes: [string, (s: Save) => void][] = [
      ['hair', (s) => { s.hair = '#ff9ed2'; }],
      ['dress', (s) => { s.dress = '#ffd54f'; }],
      ['wingColor', (s) => { s.wingColor = '#d8f6ff'; }],
      ['wings', (s) => { expect(equip(s, 'wings', 'wings_petals')).toBe(true); }],
      ['head', (s) => { expect(equip(s, 'head', null)).toBe(true); }],
      ['wand', (s) => { expect(equip(s, 'wand', 'wand_leaf')).toBe(true); }],
    ];
    for (const [key, change] of changes) {
      const s = defaultSave();
      applyLook(s, 'witch');
      const before = params(s);
      change(s);
      const after = params(s);
      const differ = (Object.keys(after) as (keyof typeof after)[]).filter((k) => after[k] !== before[k]);
      expect(differ, key).toEqual([key]);
      expect(lookOf(s), key).toBeNull();
    }
  });
});
