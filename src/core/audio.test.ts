import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CLIPS from './clips.json';
import type { SpokenKey } from '../ui/strings';
import type { say as Say } from './voice';

// Recorded ids come from the real list; the unrecorded ones are names no clip will ever get. `say` takes only keys of
// the list of spoken lines (VOICE-07): these test ids are made keys by a cast, on purpose and only here.
const [CLIP_A, CLIP_B] = CLIPS as SpokenKey[];
const NO_CLIP_A = 'no_clip_a' as SpokenKey, NO_CLIP_B = 'no_clip_b' as SpokenKey;
const TEXT = 'Привіт, Зоряна!';
const READ_TIME = 900 + TEXT.length * 55;     // the silent "time to read the subtitle" pause of audio.ts
const VOICE_WAIT = 1500;

interface FakeVoice { name: string; lang: string; }
const UK: FakeVoice = { name: 'Ukrainian', lang: 'uk-UA' };
const RU: FakeVoice = { name: 'Russian', lang: 'ru-RU' };
const EN: FakeVoice = { name: 'English', lang: 'en-US' };

/** Stand-in for HTMLAudioElement; the test decides when the clip ends or fails. */
class FakeAudio {
  static made: FakeAudio[] = [];
  static blocked = false;                     // play() rejects, like a browser refusing autoplay
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  volume = 1;
  error: { code: number } | null = null;
  paused = false;
  plays = 0;
  constructor(public src: string) { FakeAudio.made.push(this); }
  play(): Promise<void> {
    if (FakeAudio.blocked) return Promise.reject(new Error('NotAllowedError'));
    this.plays++; this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  start() { this.onplaying?.(); }
  end() { this.onended?.(); }
  fail() { this.error = { code: 4 }; this.onerror?.(); }
}

class FakeUtterance {
  voice: FakeVoice | null = null;
  lang = ''; rate = 1; pitch = 1; volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

/** Stand-in for window.speechSynthesis. `arrive` delivers the voice list the way a device does: late, with an event. */
function fakeSynth(initial: FakeVoice[], opts: { cancelFiresError?: boolean } = {}) {
  const listeners = new Set<() => void>();
  const synth = {
    voices: initial,
    spoken: [] as FakeUtterance[],
    speaking: null as FakeUtterance | null,
    onvoiceschanged: null as (() => void) | null,
    getVoices: vi.fn(() => synth.voices),
    speak: vi.fn((u: FakeUtterance) => { synth.spoken.push(u); synth.speaking = u; }),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(() => {
      const u = synth.speaking;
      synth.speaking = null;
      // Chrome reports a cancelled utterance through its own onerror, shortly after cancel() returns.
      if (u && opts.cancelFiresError) setTimeout(() => u.onerror?.(), 0);
    }),
    addEventListener: (type: string, fn: () => void) => { if (type === 'voiceschanged') listeners.add(fn); },
    removeEventListener: (type: string, fn: () => void) => { if (type === 'voiceschanged') listeners.delete(fn); },
    arrive(voices: FakeVoice[]) { synth.voices = voices; synth.fire(); },
    listening: () => listeners.size,
    fire() { synth.onvoiceschanged?.(); [...listeners].forEach((fn) => fn()); },
  };
  return synth;
}
type Synth = ReturnType<typeof fakeSynth>;

/** Lets a test ask "has this line's promise settled yet?" without awaiting it. */
function track(p: Promise<void>) {
  const state = { done: false };
  void p.then(() => { state.done = true; });
  return state;
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** A fresh module per test: the current clip and the remembered voice live in module state. */
async function load(synth: Synth | null) {
  vi.stubGlobal('window', synth ? { speechSynthesis: synth } : {});
  if (synth) vi.stubGlobal('speechSynthesis', synth);
  return import('./audio');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  FakeAudio.made = [];
  FakeAudio.blocked = false;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('test data', () => {
  it('uses ids that are recorded and ids that are not', () => {
    expect(CLIPS.length).toBeGreaterThanOrEqual(2);
    expect(CLIPS).not.toContain('no_clip_a');
    expect(CLIPS).not.toContain('no_clip_b');
  });
});

describe('say: finding the Ukrainian voice (VOICE-01)', () => {
  it('speaks at once with the uk-UA voice when the list is already there', async () => {
    const synth = fakeSynth([EN, RU, UK]);
    const { say } = await load(synth);
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    expect(synth.spoken).toHaveLength(1);            // synchronously: no wait, no timer
    expect(synth.spoken[0].voice).toBe(UK);
    expect(synth.spoken[0].text).toBe(TEXT);
    expect(synth.spoken[0].lang).toBe('uk-UA');
    expect(FakeAudio.made).toHaveLength(0);
    synth.spoken[0].onend?.();
    await tick(0);
    expect(a.done).toBe(true);
  });

  it('waits for voiceschanged when the list is empty at first, then speaks with the uk-UA voice', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    await tick(300);
    expect(synth.spoken).toHaveLength(0);
    expect(a.done).toBe(false);
    synth.arrive([EN, RU, UK]);
    await tick(0);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].voice).toBe(UK);
    expect(synth.spoken[0].text).toBe(TEXT);
    expect(synth.listening()).toBe(0);               // the subscription does not outlive the wait
    expect(a.done).toBe(false);
    synth.spoken[0].onend?.();
    await tick(0);
    expect(a.done).toBe(true);
  });

  it('keeps waiting through a voiceschanged that still brings an empty list', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    void say(NO_CLIP_A, TEXT, 'task');
    await tick(100);
    synth.fire();
    await tick(100);
    expect(synth.spoken).toHaveLength(0);
    synth.arrive([UK]);
    await tick(0);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].voice).toBe(UK);
  });

  it('gives up after 1.5 s without a list: the line becomes a silent reading pause', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    await tick(VOICE_WAIT + READ_TIME - 1);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.done).toBe(true);
    expect(synth.spoken).toHaveLength(0);
  });

  it('takes a list that showed up without any event when the wait runs out', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    void say(NO_CLIP_A, TEXT, 'task');
    await tick(1000);
    synth.voices = [EN, UK];                         // no voiceschanged: some Android browsers never fire it
    await tick(VOICE_WAIT - 1000 - 1);
    expect(synth.spoken).toHaveLength(0);
    await tick(1);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].voice).toBe(UK);
  });

  it('remembers the found voice: the next line speaks at once and does not look the list up again', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    void say(NO_CLIP_A, TEXT, 'task');
    await tick(300);
    synth.arrive([EN, UK]);
    await tick(0);
    expect(synth.spoken).toHaveLength(1);
    const lookups = synth.getVoices.mock.calls.length;
    synth.voices = [];                               // even a list that went away cannot take the voice back
    void say(NO_CLIP_B, 'Ходімо далі', 'task');
    expect(synth.spoken).toHaveLength(2);            // synchronously
    expect(synth.spoken[1].voice).toBe(UK);
    expect(synth.getVoices.mock.calls.length).toBe(lookups);
  });

  it('waits for the list only once per session: after a failed wait the next line does not wait again', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    await tick(VOICE_WAIT + READ_TIME);
    expect(a.done).toBe(true);
    const b = track(say(NO_CLIP_B, TEXT, 'task'));
    await tick(READ_TIME - 1);
    expect(b.done).toBe(false);
    await tick(1);
    expect(b.done).toBe(true);                       // the pause alone, no second 1.5 s
    expect(synth.spoken).toHaveLength(0);
  });

  it('a line that starts during the wait shares it: 1.5 s in total, not 1.5 s each', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    void say(NO_CLIP_A, TEXT, 'task');
    await tick(1000);
    const b = track(say(NO_CLIP_B, TEXT, 'task'));
    expect(synth.listening()).toBe(1);
    await tick(VOICE_WAIT - 1000 + READ_TIME - 1);
    expect(b.done).toBe(false);
    await tick(1);
    expect(b.done).toBe(true);
  });

  it('still picks up a voice that arrives after the failed wait', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    void say(NO_CLIP_A, TEXT, 'task');
    await tick(VOICE_WAIT + READ_TIME);
    synth.arrive([UK]);
    void say(NO_CLIP_B, TEXT, 'task');
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].voice).toBe(UK);
  });

  it('does not speak and does not wait when the list has no Ukrainian voice', async () => {
    const synth = fakeSynth([EN, RU]);
    const { say } = await load(synth);
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    await tick(READ_TIME - 1);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.done).toBe(true);
    expect(synth.spoken).toHaveLength(0);
  });

  it('does not speak when the voice volume is 0', async () => {
    const synth = fakeSynth([UK]);
    const { say, volume } = await load(synth);
    volume.voice = 0;
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    await tick(READ_TIME);
    expect(a.done).toBe(true);
    expect(synth.spoken).toHaveLength(0);
  });

  it('falls back to the reading pause without waiting when the device has no speech synthesis', async () => {
    const { say } = await load(null);
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    await tick(READ_TIME - 1);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.done).toBe(true);
  });

  it('a line interrupted while the list was loading stays silent when the list arrives', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    const a = track(say(NO_CLIP_A, 'перша', 'task'));
    await tick(200);
    const b = track(say(NO_CLIP_B, 'друга', 'task'));
    await tick(50);
    expect(a.done).toBe(true);
    expect(b.done).toBe(false);
    synth.arrive([UK]);
    await tick(0);
    expect(synth.spoken.map((u) => u.text)).toEqual(['друга']);
  });

  it('stopVoice during the wait: nothing is spoken afterwards', async () => {
    const synth = fakeSynth([]);
    const { say, stopVoice } = await load(synth);
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    await tick(200);
    stopVoice();
    await tick(50);
    expect(a.done).toBe(true);
    synth.arrive([UK]);
    await tick(VOICE_WAIT);
    expect(synth.spoken).toHaveLength(0);
  });

  it('gives up on an utterance that never reports its end after 12 s', async () => {
    const synth = fakeSynth([UK]);
    const { say } = await load(synth);
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    await tick(11999);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.done).toBe(true);
  });
});

describe('say: an interrupted line settles at once (VOICE-02)', () => {
  it('recorded clip: say(a) then say(b) settles a within 50 ms, b keeps playing', async () => {
    const { say } = await load(fakeSynth([UK]));
    const a = track(say(CLIP_A, 'один', 'task'));
    await tick(1000);
    const b = track(say(CLIP_B, 'два', 'task'));
    await tick(50);
    expect(a.done).toBe(true);
    expect(FakeAudio.made).toHaveLength(2);
    expect(FakeAudio.made[0].paused).toBe(true);
    expect(FakeAudio.made[1].paused).toBe(false);
    expect(b.done).toBe(false);
    FakeAudio.made[1].end();
    await tick(0);
    expect(b.done).toBe(true);
  });

  it('synthesizer: say(a) then say(b) settles a within 50 ms, b keeps talking', async () => {
    const synth = fakeSynth([UK]);                   // cancel() is silent here: nothing but stopVoice can settle a
    const { say } = await load(synth);
    const a = track(say(NO_CLIP_A, 'перша', 'task'));
    await tick(1000);
    const b = track(say(NO_CLIP_B, 'друга', 'task'));
    await tick(50);
    expect(a.done).toBe(true);
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.spoken.map((u) => u.text)).toEqual(['перша', 'друга']);
    expect(b.done).toBe(false);
    synth.spoken[1].onend?.();
    await tick(0);
    expect(b.done).toBe(true);
  });

  it('synthesizer: the late onerror of a cancelled utterance does not end the next line', async () => {
    const synth = fakeSynth([UK], { cancelFiresError: true });
    const { say } = await load(synth);
    const a = track(say(NO_CLIP_A, 'перша', 'task'));
    const b = track(say(NO_CLIP_B, 'друга', 'task'));
    await tick(50);                                  // the cancelled utterance has reported its error by now
    expect(a.done).toBe(true);
    expect(b.done).toBe(false);
    synth.spoken[0].onend?.();                       // and a stray end event on top of it
    await tick(50);
    expect(b.done).toBe(false);
    synth.spoken[1].onend?.();
    await tick(0);
    expect(b.done).toBe(true);
  });

  it('reading pause: say(a) then say(b) settles a within 50 ms, b lasts its own pause', async () => {
    const synth = fakeSynth([EN]);
    const { say } = await load(synth);
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    await tick(100);
    const b = track(say(NO_CLIP_B, TEXT, 'task'));
    await tick(50);
    expect(a.done).toBe(true);
    expect(b.done).toBe(false);
    await tick(READ_TIME - 50 - 1);
    expect(b.done).toBe(false);                      // the first line's leftover timer must not cut b short
    await tick(1);
    expect(b.done).toBe(true);
  });

  it('stopVoice without a new line settles the current one (clip, synthesizer, pause)', async () => {
    const synth = fakeSynth([UK]);
    const { say, stopVoice, volume } = await load(synth);
    const clip = track(say(CLIP_A, 'один', 'task'));
    stopVoice();
    await tick(50);
    expect(clip.done).toBe(true);
    expect(FakeAudio.made[0].paused).toBe(true);
    const spoken = track(say(NO_CLIP_A, TEXT, 'task'));
    stopVoice();
    await tick(50);
    expect(spoken.done).toBe(true);
    volume.voice = 0;
    const pause = track(say(NO_CLIP_B, TEXT, 'task'));
    stopVoice();
    await tick(50);
    expect(pause.done).toBe(true);
  });

  it('stopVoice with nothing playing is harmless', async () => {
    const { stopVoice } = await load(fakeSynth([UK]));
    expect(() => { stopVoice(); stopVoice(); }).not.toThrow();
  });
});

describe('say: recorded clips', () => {
  it('plays voice/<id>.mp3 for a recorded id and no file for an unrecorded one', async () => {
    const synth = fakeSynth([UK]);
    const { say } = await load(synth);
    void say(CLIP_A, 'один', 'task');
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeAudio.made[0].src.endsWith(`voice/${CLIP_A}.mp3`)).toBe(true);
    expect(synth.spoken).toHaveLength(0);
    void say(NO_CLIP_A, TEXT, 'task');
    expect(FakeAudio.made).toHaveLength(1);
    expect(synth.spoken).toHaveLength(1);
  });

  it('settles when the clip plays to its end, and a later stopVoice changes nothing', async () => {
    const { say, stopVoice } = await load(fakeSynth([UK]));
    const a = track(say(CLIP_A, 'один', 'task'));
    await tick(2000);
    expect(a.done).toBe(false);
    FakeAudio.made[0].end();
    await tick(0);
    expect(a.done).toBe(true);
    const b = track(say(CLIP_B, 'два', 'task'));
    FakeAudio.made[0].end();                         // a stray event of the finished clip
    await tick(0);
    expect(b.done).toBe(false);
    stopVoice();
    await tick(0);
    expect(b.done).toBe(true);
  });

  it('asks for a clip that failed to load once more, and plays it when it loads then', async () => {
    const synth = fakeSynth([UK]);
    const { say, voiceLog } = await load(synth);
    const a = track(say(CLIP_A, 'один', 'task'));
    FakeAudio.made[0].fail();
    await tick(0);
    expect(FakeAudio.made).toHaveLength(2);                 // the same clip again
    expect(FakeAudio.made[1].src).toBe(FakeAudio.made[0].src);
    expect(synth.spoken).toHaveLength(0);
    FakeAudio.made[1].start();
    expect(voiceLog).toEqual({ clips: 1, synth: [] });
    FakeAudio.made[1].onended?.();
    await tick(0);
    expect(a.done).toBe(true);
  });

  it('falls back to the synthesizer when the clip fails to load twice', async () => {
    const synth = fakeSynth([UK]);
    const { say } = await load(synth);
    const a = track(say(CLIP_A, 'один', 'task'));
    FakeAudio.made[0].fail();
    FakeAudio.made[1].fail();
    expect(FakeAudio.made).toHaveLength(2);                 // one more try only
    await tick(0);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].text).toBe('один');
    expect(synth.spoken[0].voice).toBe(UK);
    expect(a.done).toBe(false);
    synth.spoken[0].onend?.();
    await tick(0);
    expect(a.done).toBe(true);
  });

  it('the voice log counts the clips that sounded and names the lines left to the synthesizer', async () => {
    const { say, stopVoice, voiceLog } = await load(fakeSynth([UK]));
    void say(CLIP_A, 'один', 'task');
    expect(voiceLog).toEqual({ clips: 0, synth: [] });   // asked for, not sounding yet
    FakeAudio.made[0].start();
    expect(voiceLog).toEqual({ clips: 1, synth: [] });
    void say(NO_CLIP_A, TEXT, 'task');                         // no recording at all
    void say(CLIP_B, 'два', 'task');
    FakeAudio.made[1].fail();                            // the recording did not load,
    FakeAudio.made[2].fail();                            // nor did it the second time
    expect(voiceLog).toEqual({ clips: 1, synth: ['no_clip_a', CLIP_B] });
    void say(CLIP_A, 'один', 'task');
    stopVoice();
    FakeAudio.made[3].start();                           // a stray event of an interrupted clip
    FakeAudio.made[3].fail();
    expect(voiceLog).toEqual({ clips: 1, synth: ['no_clip_a', CLIP_B] });
  });

  it('settles at once when the browser refuses to play', async () => {
    FakeAudio.blocked = true;
    const { say } = await load(fakeSynth([UK]));
    const a = track(say(CLIP_A, 'один', 'task'));
    await tick(0);
    expect(a.done).toBe(true);
  });

  it('gives up on a clip that never ends after 15 s', async () => {
    const { say } = await load(fakeSynth([UK]));
    const a = track(say(CLIP_A, 'один', 'task'));
    await tick(14999);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.done).toBe(true);
  });
});

describe('the planner of spoken lines (VOICE-03)', () => {
  type P = 'task' | 'story' | 'hint';
  const ALL: P[] = ['task', 'story', 'hint'];

  it('decides every pair of priorities: a lower line never cuts a higher one off, an equal or higher one does', async () => {
    const { mayStart } = await load(null);
    //      sounding, new, starts?
    const pairs: [P, P, boolean][] = [
      ['task', 'task', true], ['task', 'story', false], ['task', 'hint', false],
      ['story', 'task', true], ['story', 'story', true], ['story', 'hint', false],
      ['hint', 'task', true], ['hint', 'story', true], ['hint', 'hint', true],
    ];
    expect(new Set(pairs.map(([now, next]) => `${now} ${next}`)).size).toBe(9);
    for (const [now, next, starts] of pairs) expect(mayStart(now, next, false), `${next} over ${now}`).toBe(starts);
  });

  it('lets any line start in silence while no task is open', async () => {
    const { mayStart } = await load(null);
    for (const next of ALL) expect(mayStart(null, next, false), next).toBe(true);
  });

  it('while a task is open only task lines start: whatever sounds, and in silence after the question has ended', async () => {
    const { mayStart } = await load(null);
    for (const now of [null, ...ALL]) {
      expect(mayStart(now, 'task', true), `task over ${now}`).toBe(true);
      expect(mayStart(now, 'story', true), `story over ${now}`).toBe(false);
      expect(mayStart(now, 'hint', true), `hint over ${now}`).toBe(false);
    }
  });

  it('say: a lower line is turned away - nothing starts, the line that sounds goes on, its own end is settled at once', async () => {
    const { say, voiceLog, dropped, willSay } = await load(fakeSynth([UK]));
    const question = track(say(CLIP_A, 'один', 'task'));
    FakeAudio.made[0].start();
    expect(willSay('story')).toBe(false);
    const story = track(say(CLIP_B, 'два', 'story'));
    const hint = track(say(NO_CLIP_A, TEXT, 'hint'));       // unrecorded: must not reach the synthesizer either
    await tick(0);
    expect(story.done).toBe(true);
    expect(hint.done).toBe(true);
    expect(question.done).toBe(false);
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeAudio.made[0].paused).toBe(false);
    expect(voiceLog).toEqual({ clips: 1, synth: [] });
    expect(dropped).toEqual([CLIP_B, 'no_clip_a']);
  });

  it('say: an equal or a higher line cuts the sounding one off and is not listed as turned away', async () => {
    const { say, dropped } = await load(fakeSynth([UK]));
    const first = track(say(CLIP_A, 'один', 'hint'));
    const equal = track(say(CLIP_B, 'два', 'hint'));
    await tick(0);
    expect(first.done).toBe(true);
    expect(FakeAudio.made[0].paused).toBe(true);
    const higher = track(say(CLIP_A, 'один', 'story'));
    await tick(0);
    expect(equal.done).toBe(true);
    expect(FakeAudio.made[1].paused).toBe(true);
    expect(FakeAudio.made).toHaveLength(3);
    expect(FakeAudio.made[2].paused).toBe(false);
    expect(higher.done).toBe(false);
    expect(dropped).toEqual([]);
  });

  it('say: once the higher line has ended by itself, a lower one starts', async () => {
    const { say, speaking, willSay } = await load(fakeSynth([UK]));
    void say(CLIP_A, 'один', 'task');
    expect(speaking()).toBe(true);
    FakeAudio.made[0].end();
    expect(speaking()).toBe(false);
    expect(willSay('hint')).toBe(true);
    const hint = track(say(CLIP_B, 'два', 'hint'));
    await tick(0);
    expect(FakeAudio.made).toHaveLength(2);
    expect(hint.done).toBe(false);
    expect(speaking()).toBe(true);
  });

  it('say: the late end of an interrupted line does not make its successor look silent', async () => {
    const { say, speaking } = await load(fakeSynth([UK]));
    void say(CLIP_A, 'один', 'task');
    await tick(10000);
    const b = track(say(CLIP_B, 'два', 'task'));
    await tick(5000);                                  // the 15 s safety timer of the first line fires now
    expect(speaking()).toBe(true);
    expect(b.done).toBe(false);
    const hint = track(say(CLIP_A, 'один', 'hint'));
    await tick(0);
    expect(hint.done).toBe(true);                      // turned away: the second line still sounds
    expect(FakeAudio.made).toHaveLength(2);
  });

  it('say: a silent reading pause is a sounding line too, and leaves silence when it runs out', async () => {
    const { say, speaking } = await load(fakeSynth([RU]));
    void say(NO_CLIP_A, TEXT, 'story');
    await tick(READ_TIME - 1);
    expect(speaking()).toBe(true);
    await tick(1);
    expect(speaking()).toBe(false);
  });

  it('stopVoice leaves silence: any line starts after it', async () => {
    const { say, stopVoice, speaking } = await load(fakeSynth([UK]));
    void say(CLIP_A, 'один', 'task');
    stopVoice();
    expect(speaking()).toBe(false);
    void say(CLIP_B, 'два', 'hint');
    expect(FakeAudio.made).toHaveLength(2);
    expect(FakeAudio.made[1].paused).toBe(false);
  });

  it('an open task turns the story and the hints away even in silence; its own lines sound', async () => {
    const { say, beginTask, inTask, speaking, willSay, dropped } = await load(fakeSynth([UK]));
    expect(inTask()).toBe(false);
    beginTask();
    expect(inTask()).toBe(true);
    void say(CLIP_A, 'один', 'task');
    FakeAudio.made[0].end();                           // the question has ended, the task is still open
    expect(speaking()).toBe(false);
    expect(willSay('story')).toBe(false);
    const story = track(say(CLIP_B, 'два', 'story'));
    const hint = track(say(CLIP_B, 'два', 'hint'));
    await tick(0);
    expect(story.done).toBe(true);
    expect(hint.done).toBe(true);
    expect(FakeAudio.made).toHaveLength(1);
    expect(dropped).toEqual([CLIP_B, CLIP_B]);
    void say(CLIP_B, 'два', 'task');                   // "try again", a hint, a number: the task goes on talking
    expect(FakeAudio.made).toHaveLength(2);
    void say(CLIP_A, 'один', 'task');                  // and an equal line still cuts the previous one off
    expect(FakeAudio.made).toHaveLength(3);
    expect(FakeAudio.made[1].paused).toBe(true);
  });

  it('endTask stops the line of the task and lets the story sound again', async () => {
    const { say, beginTask, endTask, inTask, speaking } = await load(fakeSynth([UK]));
    beginTask();
    const question = track(say(CLIP_A, 'один', 'task'));
    endTask();
    await tick(0);
    expect(inTask()).toBe(false);
    expect(question.done).toBe(true);
    expect(FakeAudio.made[0].paused).toBe(true);
    expect(speaking()).toBe(false);
    void say(CLIP_B, 'два', 'story');
    expect(FakeAudio.made).toHaveLength(2);
    expect(FakeAudio.made[1].paused).toBe(false);
  });
});

// ---------- a hidden page (TECH-05) ----------

/** Stand-in for an AudioParam / AudioNode: only what audio.ts touches. */
class FakeParam { value = 0; setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
class FakeNode { gain = new FakeParam(); frequency = new FakeParam(); delayTime = new FakeParam(); type = ''; connect() {} }
class FakeOsc extends FakeNode {
  constructor(private c: FakeCtx) { super(); }
  start(t: number) { this.c.starts.push(t); }
  stop() {}
}
/** Stand-in for AudioContext: its clock is moved by the test; every oscillator start is recorded with its time. */
class FakeCtx {
  static made: FakeCtx[] = [];
  currentTime = 0;
  state = 'running';
  destination = new FakeNode();
  starts: number[] = [];
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  resume = vi.fn(async () => { this.state = 'running'; });
  constructor() { FakeCtx.made.push(this); }
  createGain() { return new FakeNode(); }
  createDelay() { return new FakeNode(); }
  createOscillator() { return new FakeOsc(this); }
}

/** Stand-in for `document`: the test hides and shows the page the way the browser does, with visibilitychange. */
function fakePage() {
  const listeners = new Set<() => void>();
  const page = {
    hidden: false,
    addEventListener: (type: string, fn: () => void) => { if (type === 'visibilitychange') listeners.add(fn); },
    set(hidden: boolean) { page.hidden = hidden; [...listeners].forEach((fn) => fn()); },
    listening: () => listeners.size,
  };
  return page;
}

async function loadPage(synth: Synth) {
  FakeCtx.made = [];
  const page = fakePage();
  vi.stubGlobal('window', { speechSynthesis: synth, AudioContext: FakeCtx });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('document', page);
  return { page, ...(await import('./audio')) };
}

describe('a hidden page pauses the sound and the lines (TECH-05)', () => {
  it('listens to the visibility of the page by itself', async () => {
    const { page } = await loadPage(fakeSynth([UK]));
    expect(page.listening()).toBe(1);
  });

  it('suspends the audio context when the page is hidden and resumes it when it is shown', async () => {
    const { page, unlockAudio } = await loadPage(fakeSynth([UK]));
    unlockAudio();
    const ctx = FakeCtx.made[0];
    expect(ctx.suspend).not.toHaveBeenCalled();
    page.set(true);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    expect(ctx.resume).not.toHaveBeenCalled();
    page.set(false);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
  });

  it('pauses the clip without ending its line and plays it on from the same place', async () => {
    const { page, say } = await loadPage(fakeSynth([UK]));
    const a = track(say(CLIP_A, 'один', 'task'));
    const clip = FakeAudio.made[0];
    clip.start();
    page.set(true);
    expect(clip.paused).toBe(true);
    await tick(60000);                               // a minute in the background: far past the 15 s safety timer
    expect(a.done).toBe(false);
    page.set(false);
    expect(FakeAudio.made).toHaveLength(1);          // the same clip, not a new one from the start
    expect(clip.paused).toBe(false);
    expect(clip.plays).toBe(2);
    await tick(1000);
    expect(a.done).toBe(false);
    clip.end();
    await tick(0);
    expect(a.done).toBe(true);
  });

  it('a safety timer due in the background counts its whole time again after the return', async () => {
    const { page, say } = await loadPage(fakeSynth([UK]));
    const a = track(say(CLIP_A, 'один', 'task'));
    page.set(true);
    await tick(20000);
    page.set(false);
    await tick(14999);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.done).toBe(true);
  });

  it('pauses and resumes the synthesizer; its line waits for its end', async () => {
    const synth = fakeSynth([UK]);
    const { page, say } = await loadPage(synth);
    const a = track(say(NO_CLIP_A, TEXT, 'task'));
    const cancels = synth.cancel.mock.calls.length;   // say() itself clears the synthesizer before it speaks
    page.set(true);
    expect(synth.pause).toHaveBeenCalledTimes(1);
    expect(synth.cancel).toHaveBeenCalledTimes(cancels);
    await tick(30000);
    expect(a.done).toBe(false);
    page.set(false);
    expect(synth.resume).toHaveBeenCalledTimes(1);
    expect(a.done).toBe(false);
    synth.spoken[0].onend?.();
    await tick(0);
    expect(a.done).toBe(true);
  });

  it('an end reported while the page is hidden lets the awaiting code go on only after the return', async () => {
    const synth = fakeSynth([UK]);
    const { page, say } = await loadPage(synth);
    const next = vi.fn();
    void say(NO_CLIP_A, TEXT, 'task').then(next);
    page.set(true);
    synth.spoken[0].onend?.();                       // Android may end an utterance on pause()
    await tick(5000);
    expect(next).not.toHaveBeenCalled();
    page.set(false);
    await tick(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('a chain of lines does not go on while the page is hidden', async () => {
    const { page, say } = await loadPage(fakeSynth([UK]));
    const chain = track((async () => { await say(CLIP_A, 'один', 'story'); await say(CLIP_B, 'два', 'story'); })());
    FakeAudio.made[0].start();
    page.set(true);
    await tick(120000);
    expect(FakeAudio.made).toHaveLength(1);
    page.set(false);
    FakeAudio.made[0].end();
    await tick(0);
    expect(FakeAudio.made).toHaveLength(2);
    expect(FakeAudio.made[1].src.endsWith(`voice/${CLIP_B}.mp3`)).toBe(true);
    FakeAudio.made[1].end();
    await tick(0);
    expect(chain.done).toBe(true);
  });

  it('a line asked for while the page is hidden starts when it is shown, and not at all if stopped before', async () => {
    const { page, say, stopVoice } = await loadPage(fakeSynth([UK]));
    page.set(true);
    const a = track(say(CLIP_A, 'один', 'task'));
    await tick(1000);
    expect(FakeAudio.made).toHaveLength(0);
    page.set(false);
    expect(FakeAudio.made).toHaveLength(1);
    expect(a.done).toBe(false);
    page.set(true);
    const b = track(say(CLIP_B, 'два', 'task'));    // cuts a off; b waits for the page
    stopVoice();
    page.set(false);
    await tick(0);
    expect(FakeAudio.made).toHaveLength(1);          // b never started
    expect(a.done).toBe(true);
    expect(b.done).toBe(true);
  });

  it('makes no effects while the page is hidden', async () => {
    const { page, unlockAudio, sfx } = await loadPage(fakeSynth([UK]));
    unlockAudio();
    const ctx = FakeCtx.made[0];
    const before = ctx.starts.length;
    page.set(true);
    sfx('chime');
    expect(ctx.starts.length).toBe(before);
    page.set(false);
    sfx('chime');
    expect(ctx.starts.length).toBeGreaterThan(before);
  });

  it('the music does not play the notes it missed: a suspended clock schedules nothing, a late timer goes on from now', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);   // a bell on every step
    const { page, unlockAudio, setMusic } = await loadPage(fakeSynth([UK]));
    setMusic({ scale: [261.6, 293.7, 329.6, 392, 440], chords: [[130.8, 196, 329.6]] });   // the notes come from the world (ARCH-06)
    unlockAudio();
    const ctx = FakeCtx.made[0];
    expect(ctx.starts.length).toBeGreaterThan(0);
    // hidden: the suspended context's clock stands still, the timer of the scheduler keeps firing
    page.set(true);
    const hiddenAt = ctx.starts.length;
    await tick(60000);
    expect(ctx.starts.length).toBe(hiddenAt);
    page.set(false);
    // a context that went on in the background (or a timer that came late): one minute passes between two runs
    ctx.currentTime = 60;
    const lateAt = ctx.starts.length;
    await tick(400);
    const fresh = ctx.starts.slice(lateAt);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((t) => t >= 60)).toBe(true);
    expect(fresh.length).toBeLessThan(16);             // a few steps of 0.55 s up to 1.5 s ahead, not a minute of them
    vi.restoreAllMocks();
  });
});

// The queue of spoken lines is its own module (docs/14-architecture.md "src/core/ … voice"); audio.ts re-exports it, so
// whoever imports the voice from audio.ts gets the very same functions and state.
const SRC = import.meta.glob(['./audio.ts', './voice.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
describe('the queue of spoken lines lives in src/core/voice.ts (R22)', () => {
  const MOVED = ['CLIP_RETRIES', 'beginTask', 'dropped', 'endTask', 'inTask', 'mayStart', 'say', 'speaking', 'stopVoice', 'voiceLog', 'willSay'] as const;

  it('audio.ts hands on the queue of voice.ts, not a copy', async () => {
    const audio = await load(null);
    const voice = await import('./voice');
    for (const k of MOVED) expect(audio[k], k).toBe(voice[k]);
  });

  it('audio.ts holds no line of the queue: neither the planner nor the clips', () => {
    const audio = SRC['./audio.ts'], voice = SRC['./voice.ts'];
    for (const re of [/\bfunction (say|stopVoice|mayStart|speak|withVoice)\b/, /\bRANK\b/, /clips\.json/, /new Audio\(/, /SpeechSynthesisUtterance/]) {
      expect(audio, `audio.ts still has ${re}`).not.toMatch(re);
      expect(voice, `voice.ts lacks ${re}`).toMatch(re);
    }
  });
});

describe('say takes only keys of the list of spoken lines (VOICE-07)', () => {
  it('a key built on the spot does not compile', () => {
    // Never called: the check is the type. If `say` took any string again, the directive below would be unused and
    // `npm run build` (tsc) would fail.
    const typeOnly = (say: typeof Say, n: number) => {
      // @ts-expect-error a raw key is not a key of the list
      void say(`tap_${n}`, String(n), 'task');
    };
    expect(typeof typeOnly).toBe('function');
  });
});
