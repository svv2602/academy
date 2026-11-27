import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CLIPS from './clips-en.json';
import { VARIANTS } from '../s2/strings-en';

/**
 * The voice of English (Season 2, part B, src/core/voice-en.ts): its clips come from the lazy bank en/, an English line
 * never goes to the device's synthesizer, a frame and its word are said apart, and a set of variants never says the same
 * one twice in a row.
 */
class FakeAudio {
  static made: FakeAudio[] = [];
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  volume = 1;
  error: { code: number } | null = null;
  paused = true;
  constructor(public src: string) { FakeAudio.made.push(this); }
  play(): Promise<void> { this.paused = false; this.onplaying?.(); return Promise.resolve(); }
  pause() { this.paused = true; }
  end() { this.onended?.(); }
}

const synth = { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), getVoices: () => [{ name: 'uk', lang: 'uk-UA' }] };
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
/** The address the game asks for: the clip under the game's own folder, whatever the base of the build. */
const urlOf = (id: string) => new URL(`${import.meta.env.BASE_URL}en/${id}.mp3`, 'https://game.test/academy/').href;
/** What each clip asked for, from its folder on: `en/<id>.mp3`. */
const srcs = () => FakeAudio.made.map((a) => a.src.replace(/^.*?\/?(en\/)/, '$1'));

function net(o: { online: boolean; kept?: boolean; ok?: boolean }) {
  const fetch = vi.fn(() => Promise.resolve({ ok: o.ok ?? true }));
  const match = vi.fn(() => Promise.resolve(o.kept ? {} : undefined));
  vi.stubGlobal('window', { speechSynthesis: synth, caches: {} });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('caches', { match });
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('navigator', { onLine: o.online });
  vi.stubGlobal('location', { href: 'https://game.test/academy/' });
  return { fetch, match };
}

async function voice(o: { online?: boolean; kept?: boolean; ok?: boolean; volume?: number; debug?: boolean } = {}) {
  const n = net({ online: o.online ?? true, kept: o.kept, ok: o.ok });
  const en = await import('./voice-en');
  const types = await import('../s2/types');
  en.installEnVoice({ volume: () => o.volume ?? 1, debug: o.debug ?? false });
  return { ...n, en, types };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  FakeAudio.made = [];
  synth.speak.mockClear();
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('the voice of English (src/core/voice-en.ts)', () => {
  it('installed, it is the voice of src/s2/types.ts: a recorded clip plays from en/<id>.mp3 at the voice\'s volume', async () => {
    const { en, types, fetch } = await voice({ volume: 0.4 });
    expect(types.enVoice()).toBe(en.englishVoice);
    let done = false;
    void types.enVoice().say('wb_w_owl').then(() => { done = true; });
    await tick(0);
    expect(fetch).toHaveBeenCalledWith(urlOf('wb_w_owl'));
    expect(srcs()).toEqual(['en/wb_w_owl.mp3']);
    expect(FakeAudio.made[0].volume).toBe(0.4);
    expect(done).toBe(false);
    FakeAudio.made[0].end();
    await tick(0);
    expect(done).toBe(true);
    expect(en.enLog.clips).toBe(1);
  });

  it('never the synthesizer: a line without its clip is silence (and, with ?debug, "en clip missing" in the console)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { en, fetch } = await voice({ debug: true });
    await en.sayEn('wb_w_whale');
    expect(synth.speak).not.toHaveBeenCalled();
    expect(FakeAudio.made).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(en.enLog.missing).toEqual(['wb_w_whale']);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^en clip missing: wb_w_whale/));
    // a clip that fails to load online: silence too, and the console says so
    error.mockClear();
    const end = en.sayEn('wb_w_cat');
    await tick(0);
    FakeAudio.made[0].error = { code: 4 };
    FakeAudio.made[0].onerror?.();
    await end;
    expect(synth.speak).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^en clip missing: wb_w_cat/));
  });

  it('without ?debug the console stays quiet', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { en } = await voice();
    await en.sayEn('wb_w_whale');
    expect(error).not.toHaveBeenCalled();
  });

  it('online, a clip that does not come is silence, not the synthesizer', async () => {
    const { en } = await voice({ ok: false });
    await en.sayEn('wb_w_cat');
    expect(FakeAudio.made).toEqual([]);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('without network only a kept clip plays and nothing is asked for; one not kept is plain silence, no error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lost = await voice({ online: false, kept: false, debug: true });
    await lost.en.sayEn('wb_w_cat');
    expect(lost.fetch).not.toHaveBeenCalled();
    expect(lost.match).toHaveBeenCalledWith(urlOf('wb_w_cat'));
    expect(FakeAudio.made).toEqual([]);
    expect(error).not.toHaveBeenCalled();
    expect(synth.speak).not.toHaveBeenCalled();
    vi.resetModules();
    const kept = await voice({ online: false, kept: true });
    void kept.en.sayEn('wb_w_cat');
    await tick(0);
    expect(kept.fetch).not.toHaveBeenCalled();
    expect(srcs()).toEqual(['en/wb_w_cat.mp3']);
  });

  it('the frame, then the word apart (R17): one after the other, 0.3 s between them', async () => {
    const { en } = await voice();
    let done = false;
    void en.sayEn(['wb_find', 'wb_w_owl']).then(() => { done = true; });
    await tick(0);
    expect(srcs()).toEqual(['en/wb_find.mp3']);
    FakeAudio.made[0].end();
    await tick(en.PAUSE_MS - 1);
    expect(srcs()).toEqual(['en/wb_find.mp3']);
    await tick(1);
    expect(srcs()).toEqual(['en/wb_find.mp3', 'en/wb_w_owl.mp3']);
    expect(done).toBe(false);
    FakeAudio.made[1].end();
    await tick(0);
    expect(done).toBe(true);
  });

  it('a new say cuts the one that sounds off: its clip stops, its promise settles at once, its next clip never comes', async () => {
    const { en } = await voice();
    let first = false;
    void en.sayEn(['wb_find', 'wb_w_owl']).then(() => { first = true; });
    await tick(0);
    void en.sayEn('wb_w_fox');
    await tick(0);
    expect(first).toBe(true);
    expect(FakeAudio.made[0].paused).toBe(true);
    await tick(1000);
    expect(srcs()).toEqual(['en/wb_find.mp3', 'en/wb_w_fox.mp3']);
    // stopping settles it too, even in the pause between two clips
    let second = false;
    void en.sayEn(['wb_find', 'wb_w_owl']).then(() => { second = true; });
    await tick(0);
    FakeAudio.made.at(-1)?.end();
    await tick(100);
    en.stopEn();
    await tick(0);
    expect(second).toBe(true);
    await tick(1000);
    expect(srcs().filter((s) => s === 'en/wb_w_owl.mp3')).toEqual([]);
  });

  it('a hidden page pauses the clip (src/core/audio.ts hide/show), the page shown again plays it on', async () => {
    const { en } = await voice();
    void en.sayEn('wb_w_cat');
    await tick(0);
    const a = FakeAudio.made[0];
    en.pauseEn();
    expect(a.paused).toBe(true);
    en.resumeEn();
    expect(a.paused).toBe(false);
    // a clip asked for while the page is hidden waits for it to be shown
    en.pauseEn();
    void en.sayEn('wb_w_owl');
    await tick(0);
    expect(FakeAudio.made[1].paused).toBe(true);
    en.resumeEn();
    expect(FakeAudio.made[1].paused).toBe(false);
  });

  it('a set of variants (R24): one of them at random, never the same twice in a row - 1000 times; all of them come', async () => {
    const { en } = await voice();
    const set = VARIANTS.get('wb_p_hello');
    expect(set).toEqual(['wb_p_hello_1', 'wb_p_hello_2', 'wb_p_hello_3', 'wb_p_hello_4']);
    expect([en.hasEn('wb_p_hello'), en.hasEn('wb_p_hello_2'), en.hasEn('wb_p_whale')]).toEqual([true, true, false]);
    const picked: (string | null)[] = [];
    for (let i = 0; i < 1000; i++) picked.push(en.pick('wb_p_hello'));
    for (let i = 1; i < picked.length; i++) expect(picked[i], `call ${i}`).not.toBe(picked[i - 1]);
    expect(new Set(picked)).toEqual(new Set(set));
    // even a random source that would give the same one every time
    en.resetEnForTest(() => 0);
    const same = [en.pick('wb_p_hello'), en.pick('wb_p_hello'), en.pick('wb_p_hello')];
    expect(same[0]).not.toBe(same[1]);
    expect(same[1]).not.toBe(same[2]);
    // said by its name, the set plays a variant's clip
    en.resetEnForTest(() => 0);
    void en.sayEn('wb_p_hello');
    await tick(0);
    expect(srcs().at(-1)).toBe('en/wb_p_hello_1.mp3');
  });

  it('has: only what is recorded (src/core/clips-en.json)', async () => {
    const { en } = await voice();
    expect(CLIPS.length).toBeGreaterThan(0);
    for (const c of CLIPS) expect(en.hasEn(c), c).toBe(true);
    expect(en.hasEn('pip_hello')).toBe(false);
  });
});

describe('src/core/audio.ts installs the voice of English with the sound', () => {
  it('at the voice\'s volume; ?debug of the page turns on the console', async () => {
    const audio = (await import('./audio.ts?raw')).default;
    expect(audio).toMatch(/import \{ installEnVoice, pauseEn, resumeEn \} from '\.\/voice-en';/);
    expect(audio).toMatch(/\ninstallEnVoice\(\{ volume: \(\) => volume\.voice \}\);/);
    // and it pauses the English clip with the rest of the sound
    expect(audio).toMatch(/pauseVoice\(\);\n  pauseEn\(\);/);
    expect(audio).toMatch(/resumeVoice\(\);\n  resumeEn\(\);/);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    net({ online: true });
    vi.stubGlobal('location', { href: 'https://game.test/academy/?debug', search: '?debug' });
    vi.stubEnv('DEV', false);
    const en = await import('./voice-en');
    en.installEnVoice({ volume: () => 1 });
    await en.sayEn('wb_w_whale');
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^en clip missing: wb_w_whale/));
    vi.resetModules();
    error.mockClear();
    vi.stubGlobal('location', { href: 'https://game.test/academy/', search: '' });
    const quiet = await import('./voice-en');
    quiet.installEnVoice({ volume: () => 1 });
    await quiet.sayEn('wb_w_whale');
    expect(error).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
