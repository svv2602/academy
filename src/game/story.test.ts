import * as THREE from 'three';
// @vitest-environment happy-dom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createWorldScope } from './scope';
import { describe, expect, it, vi } from 'vitest';
import { FAIRY_STORIES } from '../worlds/fairy/story';
import { strings } from '../worlds/fairy/strings';
import type { Game } from './context';
import {
  AFTER_LINE, LINE_DELAY, PAN_MAX, PARALLAX_MAX, SAFE, ZOOM, fitOf, moveKind, passSeconds, playStory, poseAt, seenStories,
  setStories, storyOf, storyProblems, type Shot, type StoryDef,
} from './story';

// The overlay and the controls the scene hides, in the page before src/ui/ui.ts looks them up at import.
vi.hoisted(() => {
  for (const id of ['joy', 'btnJump', 'btnAct']) document.body.appendChild(document.createElement('div')).id = id;
  const root = document.body.appendChild(document.createElement('div'));
  root.id = 'story'; root.className = 'hidden';
  root.appendChild(document.createElement('p')).id = 'storySub';
  root.appendChild(document.createElement('button')).id = 'storySkip';
});

const ROOT = join(__dirname, '..', '..');
const PUBLIC = join(ROOT, 'public');
/** WORLD-13: a frame with its depth map at most 100 KB, all the frames of a world at most 1 MB. */
const FRAME_MAX = 100 * 1000, WORLD_MAX = 1000 * 1000;
const files = (s: Shot) => [`${s.image}.webp`, `${s.image}_depth.webp`];
const size = (f: string) => statSync(join(PUBLIC, f)).size;
const intro = FAIRY_STORIES.find((s) => s.id === 'story_intro')!, crystal = FAIRY_STORIES.find((s) => s.id === 'story_crystal')!;
const shots = FAIRY_STORIES.flatMap((s) => s.shots);

describe('the cut-scenes of the first world (WORLD-13)', () => {
  it('an introduction of 4-6 frames and a return of the crystal of 2-3, their ids the flags of the save', () => {
    expect(FAIRY_STORIES.map((s) => s.id)).toEqual(['story_intro', 'story_crystal']);
    expect(intro.shots.length).toBeGreaterThanOrEqual(4);
    expect(intro.shots.length).toBeLessThanOrEqual(6);
    expect(crystal.shots.length).toBeGreaterThanOrEqual(2);
    expect(crystal.shots.length).toBeLessThanOrEqual(3);
  });

  it('every frame moves within the rules: its aim in the middle 80 %, no move repeated, each scene ends pulling out', () => {
    expect(storyProblems(FAIRY_STORIES)).toEqual([]);
  });

  it('every frame has one line of the cat, spoken, in both languages, with no digit, name or placeholder', () => {
    const { uk, ru } = strings.table as Record<'uk' | 'ru', Record<string, string>>;
    const spoken = strings.spoken as Record<string, string>;
    expect(new Set(shots.map((s) => s.line)).size).toBe(shots.length);
    for (const s of shots) {
      for (const text of [uk[s.line], ru[s.line]]) {
        expect(text, s.line).toBeTruthy();
        expect(text, s.line).not.toMatch(/[0-9{}]/);
      }
      expect(spoken[s.line], `${s.line} is not listed for recording`).toBeTruthy();
    }
    for (const s of FAIRY_STORIES) { expect(uk[s.title]).toBeTruthy(); expect(ru[s.title]).toBeTruthy(); expect(spoken[s.title]).toBeUndefined(); }
  });

  it('a frame with its depth map weighs at most 100 KB, all the frames of the world at most 1 MB', () => {
    let total = 0;
    for (const s of shots) {
      const w = files(s).reduce((n, f) => n + size(f), 0);
      expect(w, `${s.image}: ${w} bytes with its depth map`).toBeLessThanOrEqual(FRAME_MAX);
      total += w;
    }
    // every file of public/story/ is the world's (the first world's frames are its whole folder)
    const all = readdirSync(join(PUBLIC, 'story')).filter((f) => statSync(join(PUBLIC, 'story', f)).isFile());
    expect(all.sort()).toEqual(shots.flatMap(files).map((f) => f.slice('story/'.length)).sort());
    expect(total, `${total} bytes`).toBeLessThanOrEqual(WORLD_MAX);
  });

  it('the frames are 960x536 and their depth maps grey, half as big', async () => {
    for (const s of shots) {
      const f = await sharp(join(PUBLIC, `${s.image}.webp`)).metadata(), d = await sharp(join(PUBLIC, `${s.image}_depth.webp`)).metadata();
      expect([f.format, f.width, f.height], s.image).toEqual(['webp', 960, 536]);
      expect([d.format, d.width, d.height], `${s.image}_depth`).toEqual(['webp', 480, 268]);
    }
  });

  it('every file of a frame and of its depth map has its entry in CREDITS.md', () => {
    const credits = readFileSync(join(ROOT, 'CREDITS.md'), 'utf8');
    const missing = shots.flatMap(files).map((f) => f.split('/').pop()!).filter((f) => !credits.includes(`\`${f}\``));
    expect(missing).toEqual([]);
    // the terms of a generated picture (CLAUDE.md, decision Q13): the model, the service, the date, CC0, accepted
    for (const words of ['google/gemini-3-pro-image', 'OpenRouter', '2026-11-15', 'CC0', 'accepted by the customer']) expect(credits).toContain(words);
  });
});

describe('the pass of a frame', () => {
  const shot: Shot = { image: 'x', line: 'story_intro_1', aim: [0.3, 0.6], zoom: 'in', pan: [0.03, 0], depth: 0.1, seconds: 7 };

  it('zooms from 1.04 to 1.10 (a pull out the other way), speeding up and slowing down, the aim at rest', () => {
    expect(poseAt(shot, 0, false).zoom).toBeCloseTo(ZOOM.from);
    expect(poseAt(shot, 1, false).zoom).toBeCloseTo(ZOOM.to);
    expect(poseAt({ ...shot, zoom: 'out' }, 0, false).zoom).toBeCloseTo(ZOOM.to);
    expect(poseAt({ ...shot, zoom: 'out' }, 1, false).zoom).toBeCloseTo(ZOOM.from);
    // one smooth move: slow at both ends, never back
    const z = (u: number) => poseAt(shot, u, false).zoom;
    expect(z(0.01) - z(0)).toBeLessThan((z(0.51) - z(0.5)) / 10);
    expect(z(1) - z(0.99)).toBeLessThan((z(0.51) - z(0.5)) / 10);
    for (let u = 0; u < 1; u += 0.05) expect(z(u + 0.05)).toBeGreaterThanOrEqual(z(u));
    for (let u = 0; u <= 1; u += 0.1) {
      expect(poseAt(shot, u, false).aim).toEqual([0.3, 0.4]);
      expect(poseAt(shot, u, false).zoom).toBeLessThanOrEqual(ZOOM.to + 1e-9);
    }
    // before and after the pass it stands still
    expect(poseAt(shot, 2, false)).toEqual(poseAt(shot, 1, false));
  });

  it('moves sideways by at most its pan over the whole pass, with a parallax up to its depth', () => {
    const a = poseAt(shot, 0, false), b = poseAt(shot, 1, false);
    expect(Math.abs(b.pan[0] - a.pan[0])).toBeCloseTo(0.03);
    expect(Math.abs(b.pan[0] - a.pan[0])).toBeLessThanOrEqual(PAN_MAX + 1e-9);
    expect(a.k).toBe(0);
    expect(b.k).toBeCloseTo(0.1);
    // a pull out starts near and ends flat
    expect(poseAt({ ...shot, zoom: 'out' }, 0, false).k).toBeCloseTo(0.1);
    expect(poseAt({ ...shot, zoom: 'out' }, 1, false).k).toBe(0);
  });

  it('flat (its 2.5D broken): the same zoom round the same aim, without depth or sideways move', () => {
    for (const u of [0, 0.3, 0.7, 1]) {
      const d = poseAt(shot, u, false), f = poseAt(shot, u, true);
      expect(f.zoom).toBe(d.zoom);
      expect(f.aim).toEqual(d.aim);
      expect(f.k).toBe(0);
      expect(f.pan).toEqual([0, 0]);
    }
  });

  it('lasts its seconds, and at least the line (from 0.3 s on) and one second more', () => {
    expect(LINE_DELAY).toBeCloseTo(0.3);
    expect(AFTER_LINE).toBe(1);
    expect(passSeconds(shot, null)).toBe(7);
    expect(passSeconds(shot, 4)).toBe(7);
    expect(passSeconds(shot, 6.2)).toBeCloseTo(6.2 + 0.3 + 1);
  });

  it('covers a window held sideways and shows the whole frame in an upright one', () => {
    // a phone sideways (844x390) is wider than the frame: its top and bottom are cut
    const [x, y] = fitOf(844, 390);
    expect(x).toBe(1);
    expect(y).toBeLessThan(1);
    expect(1 - y).toBeLessThan(2 * SAFE.top + 0.05);
    // a computer (1280x720) is about as wide: it shows nearly all of it
    expect(fitOf(1280, 720)[1]).toBeGreaterThan(0.99);
    // upright: the whole width, bands above and below (a share over 1)
    expect(fitOf(390, 844)).toEqual([1, (960 / 536) / (390 / 844)]);
  });
});

describe('what is wrong with a scene', () => {
  const ok: Shot = { image: 'x', line: 'story_intro_1', aim: [0.5, 0.5], zoom: 'in', pan: [0.02, 0], depth: 0.05, seconds: 7 };
  const scene = (...s: Shot[]): StoryDef[] => [{ id: 'story_test', icon: '?', title: 'story_intro', shots: s }];
  const out: Shot = { ...ok, zoom: 'out', pan: [0, 0.01] };

  it('is reported: an aim out of the middle, a move or a parallax too big, a move repeated, no pull out at the end', () => {
    expect(storyProblems(scene(ok, out))).toEqual([]);
    expect(storyProblems(scene({ ...ok, aim: [0.5, 0.05] }, out))[0]).toMatch(/middle 80 %/);
    expect(storyProblems(scene({ ...ok, aim: [0.5, 0.95] }, out))[0]).toMatch(/middle 80 %/);
    expect(storyProblems(scene({ ...ok, pan: [0.031, 0] }, out))[0]).toMatch(/move of/);
    expect(storyProblems(scene({ ...ok, pan: [0, -0.04] }, out))[0]).toMatch(/move of/);
    expect(storyProblems(scene({ ...ok, depth: PARALLAX_MAX + 0.01 }, out))[0]).toMatch(/parallax/);
    expect(storyProblems(scene(ok, { ...ok }, out))[0]).toMatch(/same move/);
    expect(storyProblems(scene(ok, { ...ok, zoom: 'in', pan: [0, 0.01] }))[0]).toMatch(/does not pull out/);
    expect(storyProblems(scene({ ...ok, seconds: 2 }, out))[0]).toMatch(/too short/);
  });

  it('tells the moves apart by zoom and direction', () => {
    expect(moveKind(ok)).toBe('in right');
    expect(moveKind({ ...ok, pan: [-0.02, 0] })).toBe('in left');
    expect(moveKind({ ...ok, pan: [0, 0.02] })).toBe('in down');
    expect(moveKind({ ...ok, pan: [0, 0] })).toBe('in');
    expect(moveKind(out)).toBe('out down');
  });
});

describe('a scene is shown once, marked by its flag, and again from the book', () => {
  const game = () => {
    const ws = { quests: {}, final: false, starsTaken: [], flags: {} as Record<string, boolean>, pos: null };
    const g = { busy: false, auto: null, ws, persist: vi.fn(), speech: { caption: vi.fn() } } as unknown as Game;
    const scope = createWorldScope(new THREE.Scene());
    return { g, ws, scope, player: setStories(g, FAIRY_STORIES, scope) };
  };

  it('a world left in the middle of a scene ends it: the heroine is let go, the overlay hidden, the world has no scenes', async () => {
    const { g, scope, player } = game();
    const shown = playStory(g, 'story_intro');
    expect(player.active).toBe(true);
    scope.dispose();
    expect(await shown).toBe(true);
    expect(player.active).toBe(false);
    expect(g.busy).toBe(false);
    expect(document.getElementById('story')!.classList.contains('hidden')).toBe(true);
    expect(storyOf(g)).toBeNull();
  });

  it('a recorded scene marks its flag as it starts and holds the heroine until it is skipped', async () => {
    const { g, ws, player } = game();
    expect(storyOf(g)).toBe(player);
    expect(seenStories(g)).toEqual([]);
    const shown = playStory(g, 'story_intro');
    expect(ws.flags.story_intro).toBe(true);
    expect(g.persist).toHaveBeenCalled();
    expect(player.active).toBe(true);
    expect(player.id).toBe('story_intro');
    expect(g.busy).toBe(true);
    expect(document.getElementById('story')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('joy')!.classList.contains('hidden')).toBe(true);
    // a second scene is refused while one runs
    expect(await playStory(g, 'story_crystal', { record: false })).toBe(false);
    player.skip();
    expect(await shown).toBe(true);
    expect(player.active).toBe(false);
    expect(g.busy).toBe(false);
    expect(document.getElementById('story')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('joy')!.classList.contains('hidden')).toBe(false);
    expect(seenStories(g).map((s) => s.id)).toEqual(['story_intro']);
  });

  it('a seen scene is not shown again by itself; from the book it is, and nothing is recorded', async () => {
    const { g, ws, player } = game();
    ws.flags.story_crystal = true;
    expect(await playStory(g, 'story_crystal')).toBe(false);
    expect(player.active).toBe(false);
    const again = playStory(g, 'story_crystal', { record: false });
    expect(player.active).toBe(true);
    player.skip();
    expect(await again).toBe(true);
    expect(ws.flags).toEqual({ story_crystal: true });
    // with record: false a scene not seen is shown and stays unseen
    const once = playStory(g, 'story_intro', { record: false });
    player.skip(); await once;
    expect(ws.flags.story_intro).toBeUndefined();
  });

  it('nothing is shown while the heroine is held by another scene, or for a scene the world has not', async () => {
    const { g, ws, player } = game();
    g.busy = true;
    expect(await playStory(g, 'story_intro')).toBe(false);
    expect(ws.flags.story_intro).toBeUndefined();
    g.busy = false;
    expect(await playStory(g, 'story_none')).toBe(false);
    expect(player.active).toBe(false);
  });
});
