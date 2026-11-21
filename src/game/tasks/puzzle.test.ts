/** The puzzle (LEARN-19): the generator by the ladder, the model's answers, the solution. */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { PICTURE_CROP, PICTURE_SIZE, PUZZLE_LEVELS, PUZZLE_PICTURES, generate, openPictures, puzzle, setAlike, setPuzzleSeen, type PuzzleInput } from './puzzle';
import { ALIKE, alikeGroups, pieceBackground } from '../taskviews/puzzle';

const makeRng = (n: number) => createRng(String(n));
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
/** docs/11-learning.md, «Сборка картинки» (the customer's ladder of 2026-11-21): pieces, cut, picture in the frame. */
const LADDER = { 1: [6, 3, 2, true], 2: [9, 3, 3, true], 3: [12, 4, 3, false], 4: [16, 4, 4, false], 5: [20, 5, 4, false] } as const;

describe('the puzzle by the ladder (docs/11-learning.md, «Сборка картинки»)', () => {
  it('exactly as many pieces on every level as the ladder says, each cell once', () => {
    for (const [level, [n, cols, rows, guide]] of Object.entries(LADDER)) {
      for (const seed of SEEDS) {
        const b = generate(Number(level), makeRng(seed)).body;
        expect([b.cols, b.rows, b.pieces.length]).toEqual([cols, rows, n]);
        expect(new Set(b.pieces.map((p) => p.cell))).toEqual(new Set(Array.from({ length: n }, (_, i) => i)));
        expect(b.guide > 0).toBe(guide);
      }
    }
  });

  it('the picture in the frame paler on 2 than on 1, none from 3 on', () => {
    expect(PUZZLE_LEVELS[2].guide).toBeLessThan(PUZZLE_LEVELS[1].guide);
    for (const l of [3, 4, 5]) expect(PUZZLE_LEVELS[l].guide).toBe(0);
  });

  it('turned pieces on 5 only: at least one and never all', () => {
    for (let level = 1; level <= 5; level++) {
      for (const seed of SEEDS) {
        const { pieces } = generate(level, makeRng(seed)).body, turned = pieces.filter((p) => p.turn !== 0).length;
        if (level === 5) { expect(turned).toBeGreaterThan(0); expect(turned).toBeLessThan(pieces.length); } else expect(turned).toBe(0);
        for (const p of pieces) expect([0, 1, 2, 3]).toContain(p.turn);
      }
    }
  });

  it('a frame of a story: calm on 4 (much sky and grass), busy on 5, any below; the middle 4:3 of a 16:9 frame', () => {
    const calm = new Set<string>(PUZZLE_PICTURES.filter((p) => p.calm).map((p) => p.id));
    for (const seed of SEEDS) {
      expect(calm.has(generate(4, makeRng(seed)).body.picture)).toBe(true);
      expect(calm.has(generate(5, makeRng(seed)).body.picture)).toBe(false);
    }
    const any = new Set(SEEDS.map((seed) => generate(1, makeRng(seed)).body.picture));
    expect(any.size).toBeGreaterThan(3);
    expect(PICTURE_CROP.w / PICTURE_CROP.h).toBeCloseTo(4 / 3, 2);
    expect(PICTURE_CROP.x * 2 + PICTURE_CROP.w).toBeCloseTo(PICTURE_SIZE.w, -1);
  });

  it('the crystal\'s frames only once she has seen its story; the beginning always', () => {
    const crystal = (id: string) => id.startsWith('w1_crystal');
    expect(openPictures().some((p) => crystal(p.id))).toBe(false);
    for (let level = 1; level <= 5; level++) for (const seed of SEEDS) expect(crystal(generate(level, makeRng(seed)).body.picture)).toBe(false);
    const undo = setPuzzleSeen((story) => story === 'story_crystal');
    try {
      expect(new Set(SEEDS.map((seed) => generate(5, makeRng(seed)).body.picture)).has('w1_crystal_1')).toBe(true);
    } finally { undo(); }
    expect(openPictures().some((p) => crystal(p.id))).toBe(false);
  });
});

describe('the model', () => {
  it('a piece stays only on its own cell and the right way up; anything else is a miss, never a mistake', () => {
    const s = generate(5, makeRng(7)), st = puzzle.start(s);
    const i = s.body.pieces.findIndex((p) => p.turn !== 0), own = s.body.pieces[i].cell, other = (own + 1) % s.body.pieces.length;
    expect(puzzle.answer(s, st, { piece: i, cell: own })).toBe('miss');      // turned wrong
    expect(puzzle.answer(s, st, { piece: i, cell: null })).toBe('miss');     // off the frame
    for (let t = s.body.pieces[i].turn; t % 4 !== 0; t++) expect(puzzle.answer(s, st, { piece: i, turn: true })).toBe('ignored');
    expect(puzzle.answer(s, st, { piece: i, cell: other })).toBe('miss');    // not its cell
    expect(st.placed[i]).toBeNull();
    expect(puzzle.answer(s, st, { piece: i, cell: own })).toBe('step');
    expect(st.placed[i]).toBe(own);
    expect(puzzle.answer(s, st, { piece: i, cell: own })).toBe('ignored');   // placed already
  });

  it('pieces alike: dropped on the free cell of its twin it stays, the twin takes its cell; a cell not alike - a miss', () => {
    const s = generate(3, makeRng(11)), st = puzzle.start(s);
    const a = 0, b = 1, cellA = s.body.pieces[a].cell, cellB = s.body.pieces[b].cell;
    const other = s.body.pieces.findIndex((_, k) => k !== a && k !== b), cellO = s.body.pieces[other].cell;
    expect(puzzle.answer(s, st, { piece: a, cell: cellB })).toBe('miss');   // not told alike yet
    const groups = s.body.pieces.map((_, c) => c);
    groups[Math.max(cellA, cellB)] = Math.min(cellA, cellB);
    setAlike(st, groups);
    expect(puzzle.answer(s, st, { piece: a, cell: cellO })).toBe('miss');   // alike to nothing there
    expect(puzzle.answer(s, st, { piece: a, cell: cellB })).toBe('step');
    expect([st.placed[a], st.home[a], st.home[b]]).toEqual([cellB, cellB, cellA]);
    expect(puzzle.answer(s, st, { piece: b, cell: cellB })).toBe('miss');   // taken
    expect(puzzle.answer(s, st, { piece: b, cell: cellA })).toBe('step');
    setAlike(st, [1, 2]);   // a list of another cut is not taken
    expect(st.alike).toEqual(groups);
  });

  it('the solution on every level ends right, the last step only', () => {
    for (let level = 1; level <= 5; level++) {
      for (const seed of SEEDS.slice(0, 10)) {
        const s = generate(level, makeRng(seed)), st = puzzle.start(s);
        const out = puzzle.solution(s, st).map((step: PuzzleInput) => puzzle.answer(s, st, step)).filter((o) => o !== 'ignored');
        expect(out.at(-1)).toBe('right');
        expect(out.slice(0, -1).every((o) => o === 'step')).toBe(true);
        expect(out).toHaveLength(s.body.pieces.length);
      }
    }
  });
});

describe('the view\'s picture (src/game/taskviews/puzzle.ts)', () => {
  it('a piece\'s background: the first and the last cell meet the edges of the middle 4:3', () => {
    const left = PICTURE_CROP.x / PICTURE_SIZE.w, right = (PICTURE_CROP.x + PICTURE_CROP.w) / PICTURE_SIZE.w;
    for (const [cols, rows] of [[3, 2], [5, 4]]) {
      // the left edge of the element in the picture: offset over the background's width (percent position, CSS)
      const at = (x: number) => {
        const bg = pieceBackground(cols, rows, x, 0), w = parseFloat(bg.size) / 100, p = parseFloat(bg.position) / 100;
        return (p * (w - 1)) / w;
      };
      expect(at(0)).toBeCloseTo(left, 4);
      expect(at(cols - 1) + 1 / (cols * PICTURE_SIZE.w / PICTURE_CROP.w)).toBeCloseTo(right, 4);
    }
    expect(pieceBackground(1, 1, 0, 0).position.endsWith(' 0%')).toBe(true);
  });

  it('cells alike by their colours: a group is its first cell; a little noise is alike, another shade not', () => {
    const cols = 3, rows = 2, w = cols * ALIKE.w, px = new Uint8ClampedArray(w * rows * ALIKE.h * 4);
    const paint = (c: number, rgb: number[], noise = 0) => {
      for (let y = 0; y < ALIKE.h; y++) for (let x = 0; x < ALIKE.w; x++) {
        const i = ((Math.floor(c / cols) * ALIKE.h + y) * w + (c % cols) * ALIKE.w + x) * 4;
        px.set([rgb[0] + ((x + y) % 2) * noise, rgb[1], rgb[2], 255], i);
      }
    };
    const sky = [180, 210, 240], grass = [90, 170, 60];
    paint(0, sky); paint(1, sky, 6); paint(2, [250, 120, 160]); paint(3, grass); paint(4, grass, 8); paint(5, [150, 180, 215]);   // a darker sky: 25-30 apart
    expect(alikeGroups(px, cols, rows)).toEqual([0, 0, 2, 3, 3, 5]);
  });
});
