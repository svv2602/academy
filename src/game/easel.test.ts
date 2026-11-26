// @vitest-environment happy-dom
/**
 * The easel of a world (PLAY-29, src/game/easel.ts, src/ui/easel.ts): the pieces of the picture found in the world lie by
 * it until she sets each on its cell; the picture is whole when every cell is set.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EASEL_ITEM, cellFlag, looseCells, pictureSet, setCells, type CollectDef } from './collections';
import { declared } from './describe';
import { EASEL_STAND, easelStand } from './easel-place';
import { WHOLE_MS, easelState, openEasel } from '../ui/easel';

/** A world of two finds of a set and four pieces of a 2 x 2 picture: the pieces are finds 2..5, cells 0..3. */
const DEF: CollectDef = {
  items: [{ kind: 'acorn', way: 'run', x: 0, y: 0.3, z: 0 }, { kind: 'acorn', way: 'run', x: 1, y: 0.3, z: 0 },
    ...[0, 1, 2, 3].map((i) => ({ kind: 'piece' as const, way: 'run' as const, x: i, y: 0.3, z: 5 }))],
  picture: { image: 'story/w1_intro_1', cols: 2, rows: 2 },
};

describe('the cells of the easel', () => {
  it('a cell is set by its flag; the pieces lying by it are those found and not set', () => {
    const flags = { [cellFlag(1)]: true };
    expect(cellFlag(3)).toBe('pic_3');
    expect(setCells(DEF, flags)).toEqual([1]);
    // found: the pieces of cells 0 and 1 (finds 2, 3) and an acorn; cell 1 is set already
    expect(looseCells(DEF, [0, 2, 3], flags)).toEqual([0]);
    expect(pictureSet(DEF, flags)).toBe(false);
    expect(pictureSet(DEF, { pic_0: true, pic_1: true, pic_2: true, pic_3: true })).toBe(true);
    // a world without a picture is never whole
    expect(pictureSet({ items: DEF.items.slice(0, 2) }, {})).toBe(false);
  });

  it('the description has the easel only for a world with an easel and a picture; done is the flag of a whole picture', () => {
    const ws = { quests: {}, flags: {} as Record<string, boolean>, final: false };
    const easel = { x: 3, z: 4, facing: 0 };
    expect(declared({ world: { collect: DEF }, ws }).some((i) => i.kind === 'easel')).toBe(false);
    expect(declared({ world: { easel, collect: { items: DEF.items.slice(0, 2) } }, ws }).some((i) => i.kind === 'easel')).toBe(false);
    const item = declared({ world: { easel, collect: DEF }, ws }).find((i) => i.kind === 'easel')!;
    expect(item).toMatchObject({ id: EASEL_ITEM, how: 'act', at: { x: 3, z: 4 + EASEL_STAND } });
    expect(easelStand({ x: 0, z: 0, facing: Math.PI / 2 }).x).toBeCloseTo(EASEL_STAND);
    expect(item.done()).toBe(false);
    ws.flags[EASEL_ITEM] = true;
    expect(item.done()).toBe(true);
  });
});

describe('the card of the easel', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

  const drag = (piece: HTMLElement, to: HTMLElement | null) => {
    const r = to?.getBoundingClientRect();
    const end = r ? { clientX: r.left + 1, clientY: r.top + 1 } : { clientX: -500, clientY: -500 };
    piece.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    piece.dispatchEvent(new PointerEvent('pointerup', { ...end, bubbles: true }));
  };
  /** happy-dom lays nothing out: each cell gets a box of its own, 10 px a cell, as a real frame would. */
  const lay = () => {
    for (const c of document.querySelectorAll<HTMLElement>('.es-cell')) {
      const n = Number(c.dataset.cell);
      c.getBoundingClientRect = () => ({ left: 100 + n * 10, right: 110 + n * 10, top: 100, bottom: 110, width: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    }
  };

  it('shows the cells set and the pieces lying by it; a piece dropped on its own cell is set, anywhere else it goes back', () => {
    const place = vi.fn(), pause = vi.fn();
    openEasel({ picture: DEF.picture!, set: [1], loose: [0, 3], pause, place });
    lay();
    expect(pause).toHaveBeenCalledWith(true);
    expect([...document.querySelectorAll('.es-cell.set')].map((c) => (c as HTMLElement).dataset.cell)).toEqual(['1']);
    const pieces = () => [...document.querySelectorAll<HTMLElement>('.es-piece')];
    expect(pieces().map((p) => p.dataset.cell)).toEqual(['0', '3']);
    const cell = (n: number) => document.querySelector<HTMLElement>(`.es-cell[data-cell="${n}"]`)!;
    // the piece of cell 0 on the cell 2: not its own - back, nothing set
    drag(pieces()[0], cell(2));
    expect(place).not.toHaveBeenCalled();
    drag(pieces()[0], null);
    expect(place).not.toHaveBeenCalled();
    expect(pieces()).toHaveLength(2);
    // on its own cell: set
    drag(pieces()[0], cell(0));
    expect(place).toHaveBeenCalledWith(0);
    expect(pieces().map((p) => p.dataset.cell)).toEqual(['3']);
    expect(cell(0).classList.contains('set')).toBe(true);
    expect(easelState).toMatchObject({ open: true, set: [1, 0], loose: [3] });
  });

  it('closed by its cross, the game goes on; the last piece set, it closes by itself and says so', () => {
    vi.useFakeTimers();
    const closed = vi.fn(), pause = vi.fn();
    openEasel({ picture: DEF.picture!, set: [], loose: [2], pause, place: () => {}, closed });
    document.getElementById('easelClose')!.click();
    expect(pause).toHaveBeenLastCalledWith(false);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(easelState.open).toBe(false);
    // three set already, the last lying by it: the lever sets it, the card closes after WHOLE_MS
    const closed2 = vi.fn();
    openEasel({ picture: DEF.picture!, set: [0, 1, 3], loose: [2], pause, place: () => {}, closed: closed2 });
    easelState.setAll!();
    expect(document.querySelector('.es-frame')!.classList.contains('whole')).toBe(true);
    expect(closed2).not.toHaveBeenCalled();
    vi.advanceTimersByTime(WHOLE_MS);
    expect(closed2).toHaveBeenCalledTimes(1);
    expect(easelState.open).toBe(false);
  });
});
