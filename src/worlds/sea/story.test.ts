// @vitest-environment happy-dom
/** The cut-scenes of the sea (WORLD-13, ./story.ts), held to the rules of the first world's (src/game/story.test.ts). */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { storyProblems, type Shot } from '../../game/story';
import { SEA_STORIES } from './story';
import { strings } from './strings';

const ROOT = join(__dirname, '..', '..', '..');
/** The world's own files, at their paths in the build under it (tools/vite-worlds.mjs greyWorldFiles). */
const DATA = join(ROOT, 'worlds-data', 'sea');
/** WORLD-13: a frame with its depth map at most 100 KB, all the frames of a world at most 1 MB. */
const FRAME_MAX = 100 * 1000, WORLD_MAX = 1000 * 1000;
const files = (s: Shot) => [`${s.image}.webp`, `${s.image}_depth.webp`];
const size = (f: string) => statSync(join(DATA, f)).size;
const intro = SEA_STORIES.find((s) => s.id === 'story_intro')!, pearl = SEA_STORIES.find((s) => s.id === 'story_pearl')!;
const shots = SEA_STORIES.flatMap((s) => s.shots);
/** WORLD-13, the script of a frame: its line at most 12 words. */
const LINE_WORDS = 12;

describe('the cut-scenes of the sea (WORLD-13)', () => {
  it('the way in and the Pearl restored, three frames each; their ids the flags of the save', () => {
    expect(SEA_STORIES.map((s) => s.id)).toEqual(['story_intro', 'story_pearl']);
    expect(intro.shots).toHaveLength(3);
    expect(pearl.shots).toHaveLength(3);
  });

  it('every frame moves within the rules: its aim in the middle 80 %, no move repeated, each scene ends pulling out', () => {
    expect(storyProblems(SEA_STORIES)).toEqual([]);
  });

  it('every frame has one line of the cat, spoken, in both languages, at most 12 words; the titles are not spoken', () => {
    const { uk, ru } = strings.table as Record<'uk' | 'ru', Record<string, string>>;
    const spoken = strings.spoken as Record<string, string>;
    expect(new Set(shots.map((s) => s.line)).size).toBe(shots.length);
    for (const s of shots) {
      for (const text of [uk[s.line], ru[s.line]]) {
        expect(text, s.line).toBeTruthy();
        expect(text, s.line).not.toMatch(/[0-9{}]/);
        expect(text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length, s.line).toBeLessThanOrEqual(LINE_WORDS);
      }
      expect(spoken[s.line], `${s.line} is not listed for recording`).toBeTruthy();
    }
    for (const s of SEA_STORIES) { expect(uk[s.title]).toBeTruthy(); expect(ru[s.title]).toBeTruthy(); expect(spoken[s.title]).toBeUndefined(); }
  });

  it('the frames are the world\'s own files: story/sea/, each with its depth map at most 100 KB, all at most 1 MB', () => {
    let total = 0;
    for (const s of shots) {
      expect(s.image.startsWith('story/sea/'), s.image).toBe(true);
      const w = files(s).reduce((n, f) => n + size(f), 0);
      expect(w, `${s.image}: ${w} bytes with its depth map`).toBeLessThanOrEqual(FRAME_MAX);
      total += w;
    }
    // every file of the world's story folder is a frame of these scenes or its map
    const dir = join(DATA, 'story', 'sea');
    expect(readdirSync(dir).sort()).toEqual(shots.flatMap(files).map((f) => f.slice('story/sea/'.length)).sort());
    expect(total, `${total} bytes`).toBeLessThanOrEqual(WORLD_MAX);
  });

  it('the frames are 960x536 and their depth maps grey, half as big', async () => {
    for (const s of shots) {
      const f = await sharp(join(DATA, `${s.image}.webp`)).metadata(), d = await sharp(join(DATA, `${s.image}_depth.webp`)).metadata();
      expect([f.format, f.width, f.height], s.image).toEqual(['webp', 960, 536]);
      expect([d.format, d.width, d.height], `${s.image}_depth`).toEqual(['webp', 480, 268]);
    }
  });

  it('every file of a frame and of its depth map has its entry in CREDITS.md, with the terms of a generated picture', () => {
    const credits = readFileSync(join(ROOT, 'CREDITS.md'), 'utf8');
    const missing = shots.flatMap(files).map((f) => f.split('/').pop()!).filter((f) => !credits.includes(`\`${f}\``));
    expect(missing).toEqual([]);
    for (const words of ['google/gemini-3-pro-image', 'OpenRouter', '2026-11-23', 'CC0', 'accepted by']) expect(credits).toContain(words);
  });
});
