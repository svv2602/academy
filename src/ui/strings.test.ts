import { afterEach, describe, expect, it, vi } from 'vitest';
import { STRINGS, lang, setChildName, setLang, t, tf, voiceText } from './strings';

/** Language blocks as plain records, so the test keeps working even when the key sets differ. */
const tables: Record<string, Record<string, unknown>> = STRINGS;
const langs = Object.keys(tables);
const ukKeys = Object.keys(tables.uk).sort();

describe('string table parity', () => {
  it('has Ukrainian and Russian', () => {
    expect(langs).toEqual(expect.arrayContaining(['uk', 'ru']));
    expect(ukKeys.length).toBeGreaterThan(0);
  });

  it.each(langs)('%s has exactly the keys of uk', (l) => {
    const keys = Object.keys(tables[l]).sort();
    // Compared as named lists first, so a failure prints the offending keys.
    expect({
      lang: l,
      missing: ukKeys.filter((k) => !keys.includes(k)),
      extra: keys.filter((k) => !ukKeys.includes(k)),
    }).toEqual({ lang: l, missing: [], extra: [] });
    expect(keys).toEqual(ukKeys);
  });

  it.each(langs)('%s has a non-empty text for every key', (l) => {
    const bad = Object.entries(tables[l])
      .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
      .map(([k]) => k);
    expect({ lang: l, emptyOrNotString: bad }).toEqual({ lang: l, emptyOrNotString: [] });
  });
});

describe('language selection', () => {
  afterEach(() => {
    setLang('uk');
    setChildName('');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** Minimal in-memory stand-in for the browser storage. */
  const fakeStorage = (initial: Record<string, string> = {}) => {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v); },
    };
  };
  const freshModule = async () => { vi.resetModules(); return import('./strings'); };

  it('loads without localStorage and defaults to Ukrainian', async () => {
    expect(lang).toBe('uk');
    vi.stubGlobal('localStorage', undefined);
    const m = await freshModule();
    expect(m.lang).toBe('uk');
    expect(m.t('play')).toBe(STRINGS.uk.play);
  });

  it('defaults to Ukrainian when storage throws', async () => {
    const blocked = () => { throw new Error('storage is blocked'); };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    const m = await freshModule();
    expect(m.lang).toBe('uk');
    expect(() => m.setLang('ru')).not.toThrow();
    expect(m.lang).toBe('ru');
  });

  it('reads a saved language and ignores an unknown one', async () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'amw-lang': 'ru' }));
    expect((await freshModule()).lang).toBe('ru');
    for (const junk of ['de', '', 'toString', 'UK']) {
      vi.stubGlobal('localStorage', fakeStorage({ 'amw-lang': junk }));
      expect((await freshModule()).lang).toBe('uk');
    }
  });

  it('saves the chosen language', async () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const m = await freshModule();
    expect(m.lang).toBe('uk');
    m.setLang('ru');
    expect(storage.getItem('amw-lang')).toBe('ru');
    expect((await freshModule()).lang).toBe('ru');
  });

  it('t follows the language, voiceText stays Ukrainian', () => {
    expect(t('play')).toBe('Грати');
    setLang('ru');
    expect(lang).toBe('ru');
    expect(t('play')).toBe('Играть');
    expect(voiceText('play')).toBe('Грати');
    setLang('uk');
    expect(t('play')).toBe('Грати');
  });
});

describe('placeholders', () => {
  afterEach(() => {
    setLang('uk');
    setChildName('');
  });

  it('puts the name into the greeting', () => {
    setChildName('  Зоряна ');
    expect(t('intro')).toContain('Привіт, Зоряна!');
    expect(voiceText('welcome_back')).toContain('З поверненням, Зоряна!');
    setLang('ru');
    expect(t('intro')).toContain('Привет, Зоряна!');
  });

  it('drops the placeholder when there is no name', () => {
    setChildName('');
    for (const l of ['uk', 'ru'] as const) {
      setLang(l);
      expect(t('intro')).not.toContain('{');
      expect(t('intro')).toContain(l === 'uk' ? 'Привіт!' : 'Привет!');
      expect(t('welcome_back')).not.toContain('{');
    }
  });

  it('tf fills {n}-style variables', () => {
    expect(tf('shard_text', { n: 3 })).toBe('3 з 5');
    setLang('ru');
    expect(tf('shard_text', { n: 3 })).toBe('3 из 5');
  });
});
