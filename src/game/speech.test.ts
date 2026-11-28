/**
 * The question of a task asked in English (Season 2, part D1): its text in the bubble, its English clips said; it never
 * reaches the cat's voice or the device's synthesizer - it has no clip of its own (the lead's decision 2026-11-27).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const said: string[] = [];
const bubbles: (string | null)[] = [];
vi.mock('../core/audio', () => ({
  say: (key: string) => { said.push(key); return Promise.resolve(); },
  speaking: () => false, willSay: () => true, volume: { voice: 1 },
}));
vi.mock('../core/voice', () => ({ sayBank: () => Promise.resolve() }));
const english: [string, string][] = [];
vi.mock('../ui/ui', () => ({ bubble: (key: string | null) => { bubbles.push(key); }, bubbleEnglish: (text: string, sub: string) => { english.push([text, sub]); } }));

const { createSpeech } = await import('./speech');
const { setEnVoice } = await import('../s2/types');
const { strings } = await import('../s2/strings-tasks');

afterEach(() => { said.length = 0; bubbles.length = 0; english.length = 0; setEnVoice(null); });

describe('a question on the screen only (ScreenAsk)', () => {
  it('shows its text, says its English clips, and gives the cat\'s voice nothing', async () => {
    const english: (string | readonly string[])[] = [];
    setEnVoice({ say: (id) => { english.push(id); return Promise.resolve(); }, has: () => true });
    const sp = createSpeech();
    await sp.screen({ key: 'q_en_tap', en: ['wb_find', 'wb_w_owl'] });
    expect(bubbles).toEqual(['q_en_tap']);
    expect(english).toEqual([['wb_find', 'wb_w_owl']]);
    expect(said).toEqual([]);
    // a tap on the bubble then says nothing: the question has no voice of the cat to repeat
    sp.repeat();
    expect(said).toEqual([]);
  });

  it('its line is no spoken line: no clip is asked for it, the synthesizer never gets it', () => {
    expect(Object.keys(strings.table.uk)).toContain('q_en_tap');
    expect(Object.keys(strings.spoken)).not.toContain('q_en_tap');
  });
});

describe('a line of Pip (speech.english, Season 2 part G)', () => {
  it('the English and its translation in the bubble, his clip said by the voice of English, nothing to the cat', async () => {
    const heard: (string | readonly string[])[] = [];
    setEnVoice({ say: (id) => { heard.push(id); return Promise.resolve(); }, has: () => true });
    const sp = createSpeech();
    await sp.english('pip_arrive');
    expect(english).toEqual([["Hello! Hello! I'm Pip!", 'Привіт! Привіт! Я Піп!']]);
    expect(heard).toEqual(['pip_arrive']);
    expect(said).toEqual([]);
    sp.repeat();
    expect(said).toEqual([]);
  });
});
