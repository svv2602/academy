import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CLIPS from './clips.json';
import type { BankKey } from './voice';

/**
 * A question of the bank (R37): its clip is downloaded when first asked for and played; without network only a kept
 * clip plays and nothing is asked for; a clip that is not there gives way to the recorded general question, never
 * to the device's synthesizer.
 */
const KEY: BankKey = 'q_add_8_5';
const GENERAL = 't_add' as const;
const TEXT = 'Скільки буде разом?';

class FakeAudio {
  static made: FakeAudio[] = [];
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  volume = 1;
  error: { code: number } | null = null;
  paused = false;
  constructor(public src: string) { FakeAudio.made.push(this); }
  play(): Promise<void> { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() { /* the signs of life of a clip (src/core/voice.ts CLIP_SILENT_MS): not needed here */ }
  fail() { this.error = { code: 4 }; this.onerror?.(); }
}

const synth = { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), getVoices: () => [{ name: 'uk', lang: 'uk-UA' }] };
/** The address the game asks for: the clip under the game's own folder, whatever the base of the build. */
const URL_OF = new URL(`${import.meta.env.BASE_URL}bank/${KEY}.mp3`, 'https://game.test/academy/').href;
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function world(o: { online: boolean; kept?: boolean; fetch?: () => Promise<unknown> }) {
  const fetch = vi.fn(o.fetch ?? (() => Promise.resolve({ ok: true })));
  const match = vi.fn(() => Promise.resolve(o.kept ? {} : undefined));
  vi.stubGlobal('window', { speechSynthesis: synth, caches: {} });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('caches', { match });
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('navigator', { onLine: o.online });
  vi.stubGlobal('location', { href: 'https://game.test/academy/' });
  return { fetch, match };
}

async function ask(o: Parameters<typeof world>[0]) {
  const net = world(o);
  const voice = await import('./voice');
  const shown: boolean[] = [];
  const end = voice.sayBank(KEY, GENERAL, TEXT, 'task', (b) => { shown.push(b); });
  await tick(0);
  return { ...net, voice, shown, end };
}

/** What each clip asked for, from its folder on: `bank/<key>.mp3` or `voice/<id>.mp3`. */
const srcs = () => FakeAudio.made.map((a) => a.src.replace(/^.*?\/?((bank|voice)\/)/, '$1'));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  FakeAudio.made = [];
  synth.speak.mockClear();
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('sayBank: the question of the example (R37)', () => {
  it('test data: the general question is recorded', () => { expect(CLIPS).toContain(GENERAL); });

  it('online: downloads the clip in full once, then plays bank/<key>.mp3; the subtitle is the bank\'s at once', async () => {
    const { fetch, match, shown, voice } = await ask({ online: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(URL_OF);
    expect(match).not.toHaveBeenCalled();
    expect(shown).toEqual([true]);
    expect(srcs()).toEqual([`bank/${KEY}.mp3`]);
    expect(synth.speak).not.toHaveBeenCalled();
    expect(voice.voiceLog.synth).toEqual([]);
  });

  it('offline and not kept: nothing is asked for, the recorded general question is said with its own subtitle', async () => {
    const { fetch, match, shown, voice } = await ask({ online: false, kept: false });
    expect(match).toHaveBeenCalledWith(URL_OF);
    expect(fetch).not.toHaveBeenCalled();
    expect(shown).toEqual([false]);
    expect(srcs()).toEqual([`voice/${GENERAL}.mp3`]);
    expect(synth.speak).not.toHaveBeenCalled();
    expect(voice.voiceLog.synth).toEqual([]);
  });

  it('offline and kept: the kept clip plays, still without a download', async () => {
    const { fetch, shown } = await ask({ online: false, kept: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(shown).toEqual([true]);
    expect(srcs()).toEqual([`bank/${KEY}.mp3`]);
  });

  it('online but the download fails (a network that is not there): the general question, not the synthesizer', async () => {
    const { shown, voice } = await ask({ online: true, fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(shown).toEqual([true, false]);
    expect(srcs()).toEqual([`voice/${GENERAL}.mp3`]);
    expect(synth.speak).not.toHaveBeenCalled();
    expect(voice.voiceLog.synth).toEqual([]);
  });

  it('a download that never answers gives way to the general question after 4 s', async () => {
    const { shown } = await ask({ online: true, fetch: () => new Promise(() => {}) });
    await tick(3999);
    expect(FakeAudio.made).toHaveLength(0);
    await tick(1);
    expect(shown).toEqual([true, false]);
    expect(srcs()).toEqual([`voice/${GENERAL}.mp3`]);
  });

  it('a clip of the bank that fails to play: the general question, not the synthesizer', async () => {
    const { shown } = await ask({ online: true });
    FakeAudio.made[0].fail();
    await tick(0);
    expect(shown).toEqual([true, false]);
    expect(srcs()).toEqual([`bank/${KEY}.mp3`, `voice/${GENERAL}.mp3`]);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('ends with its clip; a line that cuts it off while it downloads leaves nothing to start later', async () => {
    let answer: (r: unknown) => void = () => {};
    const { voice, shown } = await ask({ online: true, fetch: () => new Promise((r) => { answer = r; }) });
    let done = false;
    const end = voice.say(GENERAL, TEXT, 'task');
    void end.then(() => { done = true; });
    answer({ ok: true });
    await tick(0);
    expect(shown).toEqual([true]);
    expect(srcs()).toEqual([`voice/${GENERAL}.mp3`]);   // the bank's clip never started
    FakeAudio.made[0].onended?.();
    await tick(0);
    expect(done).toBe(true);
  });

  it('the planner treats it as any line of its priority: a question of the bank is turned away by a task line in a task', async () => {
    world({ online: true });
    const voice = await import('./voice');
    voice.beginTask();
    const shown: boolean[] = [];
    void voice.sayBank(KEY, GENERAL, TEXT, 'story', (b) => { shown.push(b); });
    expect(shown).toEqual([]);
    expect(voice.dropped).toEqual([KEY]);
    expect(FakeAudio.made).toHaveLength(0);
  });
});
