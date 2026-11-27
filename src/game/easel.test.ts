// @vitest-environment happy-dom
/**
 * The easel of a world (PLAY-29, src/game/easel.ts, src/ui/easel.ts): the pieces of the picture found in the world lie by
 * it until she sets each on its cell; the picture is whole when every cell is set.
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../core/save';
import { EASEL_ITEM, EASEL_LED, cellFlag, easelSign, easelWaits, leadsToEasel, looseCells, pictureSet, piecesFound, setCells, type CollectDef } from './collections';
import { EASEL_LEAD_S, EASEL_SHOW_R, createEasel, type EaselHost } from './easel';
import { declared } from './describe';
import { EASEL_STAND, easelStand } from './easel-place';
import { WHOLE_MS, easelState, openEasel } from '../ui/easel';

/** A world of two finds of a set and four pieces of a 2 x 2 picture: the pieces are finds 2..5, cells 0..3. */
vi.mock('../core/audio', () => ({ sfx: () => {} }));

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

describe('the hints to the easel (the customer\'s word of 2026-11-27)', () => {
  const all = { pic_0: true, pic_1: true, pic_2: true, pic_3: true };
  it('the sign: steady while nothing lies by it, flickering while a found piece does, gone once the picture is set', () => {
    expect(easelSign(DEF, [], {})).toBe('on');
    expect(easelSign(DEF, [0, 1], {})).toBe('on');                 // acorns are no pieces
    expect(easelSign(DEF, [2], {})).toBe('flicker');
    expect(easelSign(DEF, [2], { pic_0: true })).toBe('on');       // the one found is set
    expect(easelSign(DEF, [2, 3, 4, 5], all)).toBe('off');
  });

  it('the goal of the sparkles: only with every piece found and the picture not set', () => {
    expect(easelWaits(DEF, [2, 3, 4], {})).toBe(false);
    expect(easelWaits(DEF, [2, 3, 4, 5], {})).toBe(true);
    expect(easelWaits(DEF, [2, 3, 4, 5], { pic_0: true, pic_1: true })).toBe(true);
    expect(easelWaits(DEF, [2, 3, 4, 5], all)).toBe(false);
    expect(easelWaits({ items: DEF.items.slice(0, 2) }, [0, 1], {})).toBe(false);
  });

  it('the lead after the first piece: from none to one, once a world (its flag), not for the second piece or an acorn', () => {
    expect(leadsToEasel(DEF, 0, [3], {})).toBe(true);
    expect(leadsToEasel(DEF, 0, [0], {})).toBe(false);
    expect(leadsToEasel(DEF, 1, [2, 3], {})).toBe(false);
    expect(leadsToEasel(DEF, 0, [3], { [EASEL_LED]: true })).toBe(false);
    expect(piecesFound(DEF, [0, 2, 5])).toBe(2);
  });
});

describe('the easel in a world: its sign, its lead, its goal', () => {
  /** An easel of DEF at (10, 0), the heroine at the origin; `found` as the world was entered. */
  const make = (found: number[] = [], flags: Record<string, boolean> = {}) => {
    const scene = new THREE.Scene(), hero = { root: new THREE.Object3D() };
    const ws = { quests: {}, flags, final: false, found: [...found] } as unknown as WorldState;
    let saved = 0;
    const g = {
      scene, ws, hero, world: { easel: { x: 10, z: 0, facing: 0 }, collect: DEF }, groundY: () => 0,
      ground: { block: () => {} }, speech: { line: () => Promise.resolve() }, addStars: () => {}, above: () => new THREE.Vector3(),
      persist: () => { saved++; }, paused: false, busy: false,
    } as unknown as EaselHost;
    const easel = createEasel(g);
    const sign = scene.getObjectByName('easel-sign') as THREE.Mesh;
    return { easel, ws, hero, sign, scene, saved: () => saved };
  };

  it('one more mesh: the sign over it, seen while the picture is not set', () => {
    const { easel, sign, ws } = make();
    easel.update(1);
    expect(sign.visible).toBe(true);
    for (let c = 0; c < 4; c++) ws.flags[cellFlag(c)] = true;
    easel.update(2);
    expect(sign.visible).toBe(false);
  });

  it('its draw calls (TECH-06): the wood one mesh, the tiles of the cells set one instanced mesh', () => {
    const { scene, easel } = make([], { [cellFlag(1)]: true, [cellFlag(3)]: true });
    easel.update(1);
    const body = scene.getObjectByName('easel')!;
    const drawn: THREE.Mesh[] = [];
    body.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) drawn.push(o as THREE.Mesh); });
    // the wood (legs and ledge), the board, the tiles: three, whatever the cells set
    expect(drawn).toHaveLength(3);
    expect(drawn.filter((m) => m.castShadow)).toHaveLength(1);
    const tiles = scene.getObjectByName('easel-tiles') as THREE.InstancedMesh;
    expect(tiles.isInstancedMesh).toBe(true);
    expect(tiles.count).toBe(2);
    // the first drawn is cell 1 (top right of 2 x 2), the second cell 3 (bottom right)
    const at = (i: number) => { const m = new THREE.Matrix4(); tiles.getMatrixAt(i, m); return new THREE.Vector3().setFromMatrixPosition(m); };
    expect([at(0).x > 0, at(0).y > 0, at(1).x > 0, at(1).y < 0]).toEqual([true, true, true, true]);
    // none set: not drawn at all
    const none = make();
    none.easel.update(1);
    expect((none.scene.getObjectByName('easel-tiles') as THREE.InstancedMesh).visible).toBe(false);
  });

  it('far from her the easel is not drawn, its sign is (it is seen from afar)', () => {
    const { easel, hero, sign, scene } = make();
    const body = scene.getObjectByName('easel')!;
    hero.root.position.set(10 - EASEL_SHOW_R + 1, 0, 0);
    easel.update(1);
    expect([body.visible, sign.visible]).toEqual([true, true]);
    hero.root.position.set(10 - EASEL_SHOW_R - 1, 0, 0);
    easel.update(2);
    expect([body.visible, sign.visible]).toEqual([false, true]);
  });

  it('it flickers while a piece lies by it, steady otherwise', () => {
    const { easel, sign, ws } = make();
    const glow = () => (sign.material as THREE.MeshStandardMaterial).emissiveIntensity;
    const seen = (from: number) => new Set([0, 0.1, 0.2, 0.3].map((t) => { easel.update(from + t); return glow().toFixed(2); })).size;
    expect(seen(1)).toBe(1);
    ws.found!.push(2);
    expect(seen(2)).toBeGreaterThan(1);
  });

  it('the first piece found: the sparkles lead to it for a while, the flag set and saved; never again in the world', () => {
    const { easel, ws, hero, saved } = make();
    easel.update(1);
    expect(easel.leading()).toBeNull();
    ws.found!.push(3);
    easel.update(2);
    expect(easel.leading()).not.toBeNull();
    expect(ws.flags[EASEL_LED]).toBe(true);
    expect(saved()).toBe(1);
    easel.update(2 + EASEL_LEAD_S + 0.1);
    expect(easel.leading()).toBeNull();
    // she comes to it: the lead ends at once
    const again = make();
    again.ws.found!.push(2); again.easel.update(1);
    again.hero.root.position.set(10, 0, 1.5);
    expect(again.easel.leading()).toBeNull();
    // a world entered with a piece found already, or its flag set: no lead
    const had = make([2]); had.ws.found!.push(3); had.easel.update(1);
    expect(had.easel.leading()).toBeNull();
    const led = make([], { [EASEL_LED]: true }); led.ws.found!.push(2); led.easel.update(1);
    expect(led.easel.leading()).toBeNull();
    void hero;
  });

  it('its goal is the spot in front of it while every piece is found and the picture is not set', () => {
    const { easel, ws } = make([2, 3, 4]);
    expect(easel.goal()).toBeNull();
    ws.found!.push(5);
    expect(easel.goal()).not.toBeNull();
    for (let c = 0; c < 4; c++) ws.flags[cellFlag(c)] = true;
    expect(easel.goal()).toBeNull();
  });

  it('a world without an easel: no goal, no lead, nothing drawn', () => {
    const scene = new THREE.Scene();
    const easel = createEasel({ scene, world: { collect: DEF }, ws: { flags: {} } } as unknown as EaselHost);
    easel.update(1);
    expect([easel.goal(), easel.leading(), scene.children.length]).toEqual([null, null, 0]);
  });
});

describe('the worlds put the easel after their friends, before their finale', () => {
  const SRC = import.meta.glob('../worlds/*/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  it.each(['fairy', 'forest', 'sea', 'sweet', 'sky'])('%s', (w) => {
    const src = SRC[`../worlds/${w}/index.ts`];
    const friend = src.search(/return (n|next)\.pos;/), easel = src.indexOf('g.easel.goal()');
    const finale = w === 'fairy' ? src.indexOf('return shrine.pos;') : src.search(/finaleItem\.done\(\) \? null/);
    expect(friend).toBeGreaterThan(0);
    expect(easel).toBeGreaterThan(friend);
    expect(finale).toBeGreaterThan(easel);
  });
  it('the loop: the lead after the first piece goes over the world\'s goal; the easel is updated every frame', () => {
    const loop = (import.meta.glob('./loop.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['./loop.ts'];
    expect(loop).toContain('g.easel.leading() ?? world.goal()');
    expect(loop).toContain('g.easel.update(time);');
  });
});
