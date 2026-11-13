import { afterEach, describe, expect, it, vi } from 'vitest';
import phrases from '../../voice/phrases.json';
import { SPOKEN, STRINGS, VOICE_STYLES, lang, recordable, recordingList, setChildName, setLang, t, tf, voiceText, type SpokenKey } from './strings';

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
    expect(voiceText('go_next')).toBe(STRINGS.uk.go_next);
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

describe('lines to record (voice/phrases.json)', () => {
  afterEach(() => {
    setLang('uk');
    setChildName('');
  });

  /** The committed file as plain data, so a stale or hand-edited file is reported instead of breaking the test itself. */
  const file: Record<string, unknown> = phrases;
  const spoken = Object.keys(SPOKEN) as SpokenKey[];
  const texts = () => Object.entries(file).map(([k, v]) => ({ key: k, text: Array.isArray(v) ? String(v[0]) : String(v) }));

  it('lists exactly the lines marked as spoken, in the order of the marks', () => {
    const keys = Object.keys(file);
    // Named lists first, so a failure says which key to mark or which mark to sync.
    expect({
      notInFile: spoken.filter((k) => !keys.includes(k)),
      notSpoken: keys.filter((k) => !(spoken as string[]).includes(k)),
    }).toEqual({ notInFile: [], notSpoken: [] });
    expect(keys).toEqual(spoken);
    expect(spoken.length).toBeGreaterThan(0);
  });

  it('is what `npm run voice:sync` builds from the game texts', () => {
    expect(file).toEqual(recordingList());
  });

  it('has a subtitle in every language for each spoken line', () => {
    for (const l of langs) {
      expect({ lang: l, noText: spoken.filter((k) => typeof tables[l][k] !== 'string') }).toEqual({ lang: l, noText: [] });
    }
  });

  it('gives every line a text and a known intonation', () => {
    const styles: readonly string[] = VOICE_STYLES;
    const bad = Object.entries(file)
      .filter(([, v]) => !(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && v[0].trim() !== '' && styles.includes(v[1])))
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('has no placeholder in any line', () => {
    // Not vacuous: the game texts do carry the name placeholder.
    expect(STRINGS.uk.intro).toContain('{, name}');
    expect(STRINGS.uk.welcome_back).toContain('{, name}');
    expect(texts().filter(({ text }) => /[{}]/.test(text)).map(({ key }) => key)).toEqual([]);
  });

  it('cuts the name placeholder out and refuses any other placeholder', () => {
    expect(recordable('intro', STRINGS.uk.intro)).toBe('Привіт! Ми в Королівстві фей. Кристал світла розбився на пʼять уламків! Допоможеш їх зібрати?');
    expect(recordable('x', 'Раз{, name}, два{, name}.')).toBe('Раз, два.');
    // A counter or any other variable cannot be one fixed clip; the error names the key.
    expect(() => recordable('shard_text', STRINGS.uk.shard_text)).toThrow(/shard_text/);
    expect(() => recordable('x', 'Привіт{,name}!')).toThrow(/"x"/);
    expect(() => recordable('x', 'Привіт, name}!')).toThrow(/"x"/);
    expect(() => recordable('x', 'Привіт{!')).toThrow(/"x"/);
  });

  it('records each line as the game speaks it when no name is set', () => {
    setChildName('');
    expect(texts().filter(({ key, text }) => text !== voiceText(key as SpokenKey)).map(({ key }) => key)).toEqual([]);
  });

  it('never carries the name, whatever name and language are set', () => {
    setChildName('Зоряна');
    setLang('ru');
    // The name reaches the subtitle and the on-device speech only…
    expect(t('intro')).toContain('Зоряна');
    expect(voiceText('intro')).toContain('Зоряна');
    // …the list for recording is built the same and matches the committed file.
    expect(JSON.stringify(recordingList())).not.toContain('Зоряна');
    expect(recordingList()).toEqual(file);
    expect(JSON.stringify(file)).not.toContain('Зоряна');
  });

  it('cannot speak an interface-only string (compile-time guard)', () => {
    // `tsc` fails on the directive below if `voiceText` ever accepts keys that are not marked as spoken.
    // @ts-expect-error 'ok' is a button label, it is not in SPOKEN
    expect(voiceText('ok')).toBe(STRINGS.uk.ok);
    expect(Object.keys(SPOKEN)).not.toContain('ok');
  });
});
