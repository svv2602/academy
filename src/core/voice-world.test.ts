// The voice of a next world (TECH-09, R64-R81): its clips lie in `voice/<id>/` and come with the world, the list of
// them is the world's own (src/worlds/<id>/clips.json) and is handed to src/core/voice.ts while the world plays.
// Here: the order a clip is looked for in, the address it is asked by, "there and back" between worlds, and a clip of a
// world that does not load. The stand-ins are the ones of ./audio.test.ts, cut to what these tests need.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CLIPS from './clips.json';
import type { SpokenKey } from '../ui/strings';

// Two clips of the core's real list; the lines of the made-up world "meadow" are keys no clip of the core has.
const [CORE_A, CORE_B] = CLIPS as SpokenKey[];
const OWN = 'meadow_hi' as SpokenKey, NARRATED = 'meadow_bye' as SpokenKey, NOWHERE = 'meadow_none' as SpokenKey;
const WORLD = 'meadow';
const FOX = '🦊', VOICE = 'Leda';   // the fox of the first world's table speaks with Leda

class FakeAudio {
  static made: FakeAudio[] = [];
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  volume = 1;
  error: { code: number } | null = null;
  constructor(public src: string) { FakeAudio.made.push(this); }
  play(): Promise<void> { return Promise.resolve(); }
  pause() {}
  start() { this.onplaying?.(); }
  fail() { this.error = { code: 4 }; this.onerror?.(); }
}
class FakeUtterance {
  voice: unknown = null; lang = ''; rate = 1; pitch = 1; volume = 1;
  onend: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
function fakeSynth() {
  const synth = {
    spoken: [] as FakeUtterance[],
    getVoices: () => [{ name: 'Ukrainian', lang: 'uk-UA' }],
    speak: (u: FakeUtterance) => { synth.spoken.push(u); },
    pause: () => {}, resume: () => {}, cancel: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
  };
  return synth;
}

/** A fresh module (the lists live in module state) whose core list also has `more`; the first world's voices are on. */
async function load(more: string[] = [], cast = true) {
  const synth = fakeSynth();
  vi.stubGlobal('window', { speechSynthesis: synth });
  vi.stubGlobal('speechSynthesis', synth);
  vi.doMock('./clips.json', () => ({ default: [...CLIPS, ...more] }));
  const voice = await import('./voice');
  if (cast) voice.setCast((await import('../worlds/fairy/voices')).voices);
  return { ...voice, synth };
}
const file = (a: FakeAudio) => a.src.slice(a.src.indexOf('voice/'));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
});
afterEach(() => {
  vi.doUnmock('./clips.json');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('test data', () => {
  it('the lines of the made-up world are no clips of the core, the two core clips are', () => {
    for (const k of [OWN, NARRATED, NOWHERE]) expect(CLIPS).not.toContain(k);
    expect(CLIPS).toContain(CORE_A);
    expect(CLIPS).toContain(CORE_B);
    expect(CLIPS.filter((k) => k.startsWith(`${WORLD}/`) || k.startsWith(`${CORE_A}@${VOICE}`) || k.startsWith(`${CORE_B}@`))).toEqual([]);
  });
});

describe('the clip of a line while a next world plays (R76, R80)', () => {
  it('the world\'s clip in the speaker\'s voice, then the world\'s clip of the narrator, then the core\'s, then none', async () => {
    const { clipFor, worldClips, borrowed } = await load([`${CORE_A}@${VOICE}`]);
    worldClips(WORLD, [OWN, `${OWN}@${VOICE}`, NARRATED]);
    // 1. the world's clip in the voice of the speaker
    expect(clipFor(OWN, FOX)).toBe(`${WORLD}/${OWN}@${VOICE}`);
    expect(borrowed).toEqual([]);
    // 2. the world's clip of the narrator: for the narrator himself, and for a character whose voice is not recorded
    expect(clipFor(OWN)).toBe(`${WORLD}/${OWN}`);
    expect(clipFor(OWN, '🐱')).toBe(`${WORLD}/${OWN}`);
    expect(borrowed).toEqual([]);
    expect(clipFor(NARRATED, FOX)).toBe(`${WORLD}/${NARRATED}`);
    expect(borrowed).toEqual([`${WORLD}/${NARRATED}@${VOICE}`]);
    // 3. the core's clip by the rule it always had: `<key>@<voice>`, else `<key>` (borrowed from the narrator)
    expect(clipFor(CORE_A, FOX)).toBe(`${CORE_A}@${VOICE}`);
    expect(clipFor(CORE_B, FOX)).toBe(CORE_B);
    expect(borrowed).toEqual([`${WORLD}/${NARRATED}@${VOICE}`, `${CORE_B}@${VOICE}`]);
    expect(clipFor(CORE_B)).toBe(CORE_B);
    // 4. no clip anywhere
    expect(clipFor(NOWHERE, FOX)).toBeNull();
    expect(clipFor(NOWHERE)).toBeNull();
  });

  it('the world is asked before the core: a name both lists have is the world\'s clip', async () => {
    const { clipFor, worldClips } = await load([`${CORE_A}@${VOICE}`]);
    expect(clipFor(CORE_A)).toBe(CORE_A);
    worldClips(WORLD, [CORE_A]);
    expect(clipFor(CORE_A)).toBe(`${WORLD}/${CORE_A}`);
    // the world's clip of the narrator comes before the core's clip in the voice of the speaker
    expect(clipFor(CORE_A, FOX)).toBe(`${WORLD}/${CORE_A}`);
    // a line the world has no clip of is the core's, as ever
    expect(clipFor(CORE_B)).toBe(CORE_B);
  });

  it('a line with no clip in the world nor in the core goes to the synthesizer, as it always did', async () => {
    const { say, worldClips, voiceLog, synth } = await load();
    worldClips(WORLD, [OWN]);
    void say(NOWHERE, 'Привіт!', 'story');
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.made).toHaveLength(0);
    expect(synth.spoken.map((u) => u.text)).toEqual(['Привіт!']);
    expect(voiceLog.synth).toEqual([NOWHERE]);
  });
});

describe('the address of a clip (R64, R68)', () => {
  it('a clip of the world is asked from voice/<id>/, a clip of the core from voice/ as before', async () => {
    const { say, stopVoice, worldClips } = await load();
    worldClips(WORLD, [OWN, `${OWN}@${VOICE}`]);
    void say(OWN, 'Привіт!', 'story');
    void say(OWN, 'Привіт!', 'story', FOX);
    void say(CORE_A, 'один', 'story');
    stopVoice();
    expect(FakeAudio.made.map(file)).toEqual([`voice/${WORLD}/${OWN}.mp3`, `voice/${WORLD}/${OWN}@${VOICE}.mp3`, `voice/${CORE_A}.mp3`]);
  });

  it('a shared line said in the voice of a next world\'s character is the core\'s clip <key>@<voice>, whatever the world lacks', async () => {
    // The shared lines of the characters' voices are recorded once, in the core (`npc_next@<voice>`): a next world has
    // its own table "character - voice" and its own clips, and neither writes nor needs them. The core's clip lies in
    // voice/ - part of the installation, so it sounds without network even before the world's folder is downloaded.
    const { say, stopVoice, setCast, worldClips, clipFor, borrowed } = await load([`${CORE_A}@${VOICE}`], false);
    setCast({ narrator: 'cat', cast: { cat: { emoji: '🐱', voice: 'Puck' }, crab: { emoji: '🦀', voice: VOICE } } });
    worldClips(WORLD, [OWN]);
    expect(clipFor(CORE_A, '🦀')).toBe(`${CORE_A}@${VOICE}`);
    expect(borrowed).toEqual([]);
    void say(CORE_A, 'один', 'story', '🦀');
    stopVoice();
    expect(FakeAudio.made.map(file)).toEqual([`voice/${CORE_A}@${VOICE}.mp3`]);
  });

  it('with no list handed in nothing is asked from a folder of a world', async () => {
    const { say, stopVoice } = await load();
    for (const k of CLIPS.slice(0, 20) as SpokenKey[]) void say(k, 'x', 'story', FOX);
    stopVoice();
    expect(FakeAudio.made).toHaveLength(20);
    expect(FakeAudio.made.map(file).filter((f) => f.split('/').length !== 2)).toEqual([]);
  });

  it('a clip of the world that does not load is asked for once more, then the synthesizer takes the line', async () => {
    const { say, worldClips, voiceLog, synth, CLIP_RETRIES } = await load();
    worldClips(WORLD, [OWN]);
    void say(OWN, 'Привіт!', 'story');
    FakeAudio.made[0].fail();
    expect(FakeAudio.made).toHaveLength(1 + CLIP_RETRIES);
    expect(file(FakeAudio.made[1])).toBe(`voice/${WORLD}/${OWN}.mp3`);
    expect(voiceLog.synth).toEqual([]);
    FakeAudio.made[1].fail();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.made).toHaveLength(2);
    expect(voiceLog).toEqual({ clips: 0, synth: [OWN] });
    expect(synth.spoken.map((u) => u.text)).toEqual(['Привіт!']);
  });
});

describe('the list of a world is taken back when the world is left (R81)', () => {
  it('there and back: a clip of a world is found only while that world plays, a clip of the core always', async () => {
    const { clipFor, worldClips } = await load([], false);
    const state = () => [clipFor(OWN), clipFor('lake_hi'), clipFor(CORE_A)];
    expect(state()).toEqual([null, null, CORE_A]);             // the first world: no list
    const leaveMeadow = worldClips(WORLD, [OWN]);
    expect(state()).toEqual([`${WORLD}/${OWN}`, null, CORE_A]);
    leaveMeadow();
    expect(state()).toEqual([null, null, CORE_A]);             // back in the first world
    const leaveLake = worldClips('lake', ['lake_hi']);
    expect(state()).toEqual([null, 'lake/lake_hi', CORE_A]);   // another world: only its own
    leaveLake();
    expect(state()).toEqual([null, null, CORE_A]);
  });

  it('taking back the list of a world left long ago does not take the list of the world that plays', async () => {
    const { clipFor, worldClips } = await load([], false);
    const leaveMeadow = worldClips(WORLD, [OWN]);
    const leaveLake = worldClips('lake', ['lake_hi']);
    expect([clipFor(OWN), clipFor('lake_hi')]).toEqual([null, 'lake/lake_hi']);
    leaveMeadow();
    expect(clipFor('lake_hi')).toBe('lake/lake_hi');
    leaveLake(); leaveLake();
    expect(clipFor('lake_hi')).toBeNull();
  });

  it('the scope of a world takes the list back: what `worldClips` returns is handed to `scope.own`', async () => {
    const { clipFor, worldClips } = await load([], false);
    const { createWorldScope } = await import('../game/scope');
    const scope = createWorldScope(new THREE.Scene());
    scope.own(worldClips(WORLD, [OWN]));
    expect(clipFor(OWN)).toBe(`${WORLD}/${OWN}`);
    scope.dispose();
    expect(clipFor(OWN)).toBeNull();
    expect(clipFor(CORE_A)).toBe(CORE_A);
  });

  it('a line said after the world is left is not asked from its folder', async () => {
    const { say, stopVoice, worldClips, voiceLog } = await load([], false);
    worldClips(WORLD, [OWN])();
    void say(OWN, 'Привіт!', 'story');
    await vi.advanceTimersByTimeAsync(0);
    stopVoice();
    expect(FakeAudio.made).toHaveLength(0);
    expect(voiceLog.synth).toEqual([OWN]);
  });
});
