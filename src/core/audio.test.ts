import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CLIPS from './clips.json';

// Recorded ids come from the real list; the unrecorded ones are names no clip will ever get.
const [CLIP_A, CLIP_B] = CLIPS;
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
  constructor(public src: string) { FakeAudio.made.push(this); }
  play(): Promise<void> { return FakeAudio.blocked ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); }
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
    const a = track(say('no_clip_a', TEXT));
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
    const a = track(say('no_clip_a', TEXT));
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
    void say('no_clip_a', TEXT);
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
    const a = track(say('no_clip_a', TEXT));
    await tick(VOICE_WAIT + READ_TIME - 1);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.done).toBe(true);
    expect(synth.spoken).toHaveLength(0);
  });

  it('takes a list that showed up without any event when the wait runs out', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    void say('no_clip_a', TEXT);
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
    void say('no_clip_a', TEXT);
    await tick(300);
    synth.arrive([EN, UK]);
    await tick(0);
    expect(synth.spoken).toHaveLength(1);
    const lookups = synth.getVoices.mock.calls.length;
    synth.voices = [];                               // even a list that went away cannot take the voice back
    void say('no_clip_b', 'Ходімо далі');
    expect(synth.spoken).toHaveLength(2);            // synchronously
    expect(synth.spoken[1].voice).toBe(UK);
    expect(synth.getVoices.mock.calls.length).toBe(lookups);
  });

  it('waits for the list only once per session: after a failed wait the next line does not wait again', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    const a = track(say('no_clip_a', TEXT));
    await tick(VOICE_WAIT + READ_TIME);
    expect(a.done).toBe(true);
    const b = track(say('no_clip_b', TEXT));
    await tick(READ_TIME - 1);
    expect(b.done).toBe(false);
    await tick(1);
    expect(b.done).toBe(true);                       // the pause alone, no second 1.5 s
    expect(synth.spoken).toHaveLength(0);
  });

  it('a line that starts during the wait shares it: 1.5 s in total, not 1.5 s each', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    void say('no_clip_a', TEXT);
    await tick(1000);
    const b = track(say('no_clip_b', TEXT));
    expect(synth.listening()).toBe(1);
    await tick(VOICE_WAIT - 1000 + READ_TIME - 1);
    expect(b.done).toBe(false);
    await tick(1);
    expect(b.done).toBe(true);
  });

  it('still picks up a voice that arrives after the failed wait', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    void say('no_clip_a', TEXT);
    await tick(VOICE_WAIT + READ_TIME);
    synth.arrive([UK]);
    void say('no_clip_b', TEXT);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].voice).toBe(UK);
  });

  it('does not speak and does not wait when the list has no Ukrainian voice', async () => {
    const synth = fakeSynth([EN, RU]);
    const { say } = await load(synth);
    const a = track(say('no_clip_a', TEXT));
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
    const a = track(say('no_clip_a', TEXT));
    await tick(READ_TIME);
    expect(a.done).toBe(true);
    expect(synth.spoken).toHaveLength(0);
  });

  it('falls back to the reading pause without waiting when the device has no speech synthesis', async () => {
    const { say } = await load(null);
    const a = track(say('no_clip_a', TEXT));
    await tick(READ_TIME - 1);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.done).toBe(true);
  });

  it('a line interrupted while the list was loading stays silent when the list arrives', async () => {
    const synth = fakeSynth([]);
    const { say } = await load(synth);
    const a = track(say('no_clip_a', 'перша'));
    await tick(200);
    const b = track(say('no_clip_b', 'друга'));
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
    const a = track(say('no_clip_a', TEXT));
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
    const a = track(say('no_clip_a', TEXT));
    await tick(11999);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.done).toBe(true);
  });
});

describe('say: an interrupted line settles at once (VOICE-02)', () => {
  it('recorded clip: say(a) then say(b) settles a within 50 ms, b keeps playing', async () => {
    const { say } = await load(fakeSynth([UK]));
    const a = track(say(CLIP_A, 'один'));
    await tick(1000);
    const b = track(say(CLIP_B, 'два'));
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
    const a = track(say('no_clip_a', 'перша'));
    await tick(1000);
    const b = track(say('no_clip_b', 'друга'));
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
    const a = track(say('no_clip_a', 'перша'));
    const b = track(say('no_clip_b', 'друга'));
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
    const a = track(say('no_clip_a', TEXT));
    await tick(100);
    const b = track(say('no_clip_b', TEXT));
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
    const clip = track(say(CLIP_A, 'один'));
    stopVoice();
    await tick(50);
    expect(clip.done).toBe(true);
    expect(FakeAudio.made[0].paused).toBe(true);
    const spoken = track(say('no_clip_a', TEXT));
    stopVoice();
    await tick(50);
    expect(spoken.done).toBe(true);
    volume.voice = 0;
    const pause = track(say('no_clip_b', TEXT));
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
    void say(CLIP_A, 'один');
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeAudio.made[0].src.endsWith(`voice/${CLIP_A}.mp3`)).toBe(true);
    expect(synth.spoken).toHaveLength(0);
    void say('no_clip_a', TEXT);
    expect(FakeAudio.made).toHaveLength(1);
    expect(synth.spoken).toHaveLength(1);
  });

  it('settles when the clip plays to its end, and a later stopVoice changes nothing', async () => {
    const { say, stopVoice } = await load(fakeSynth([UK]));
    const a = track(say(CLIP_A, 'один'));
    await tick(2000);
    expect(a.done).toBe(false);
    FakeAudio.made[0].end();
    await tick(0);
    expect(a.done).toBe(true);
    const b = track(say(CLIP_B, 'два'));
    FakeAudio.made[0].end();                         // a stray event of the finished clip
    await tick(0);
    expect(b.done).toBe(false);
    stopVoice();
    await tick(0);
    expect(b.done).toBe(true);
  });

  it('falls back to the synthesizer when the clip fails to load', async () => {
    const synth = fakeSynth([UK]);
    const { say } = await load(synth);
    const a = track(say(CLIP_A, 'один'));
    FakeAudio.made[0].fail();
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
    void say(CLIP_A, 'один');
    expect(voiceLog).toEqual({ clips: 0, synth: [] });   // asked for, not sounding yet
    FakeAudio.made[0].start();
    expect(voiceLog).toEqual({ clips: 1, synth: [] });
    void say('no_clip_a', TEXT);                         // no recording at all
    void say(CLIP_B, 'два');
    FakeAudio.made[1].fail();                            // the recording did not load
    expect(voiceLog).toEqual({ clips: 1, synth: ['no_clip_a', CLIP_B] });
    void say(CLIP_A, 'один');
    stopVoice();
    FakeAudio.made[2].start();                           // a stray event of an interrupted clip
    FakeAudio.made[2].fail();
    expect(voiceLog).toEqual({ clips: 1, synth: ['no_clip_a', CLIP_B] });
  });

  it('settles at once when the browser refuses to play', async () => {
    FakeAudio.blocked = true;
    const { say } = await load(fakeSynth([UK]));
    const a = track(say(CLIP_A, 'один'));
    await tick(0);
    expect(a.done).toBe(true);
  });

  it('gives up on a clip that never ends after 15 s', async () => {
    const { say } = await load(fakeSynth([UK]));
    const a = track(say(CLIP_A, 'один'));
    await tick(14999);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.done).toBe(true);
  });
});
