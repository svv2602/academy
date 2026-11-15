import { afterEach, describe, expect, it, vi } from 'vitest';
import phrases from '../../voice/phrases.json';
import {
  SPOKEN, STRINGS, VOICE_STYLES, WORLD_OWN, addStrings, lang, recordable, recordingList, setChildName, setLang, t, tf, voiceText,
  type SpokenKey, type WorldStrings,
} from './strings';

/** Language blocks as plain records, so the test keeps working even when the key sets differ. */
const tables: Record<string, Record<string, unknown>> = STRINGS;
const langs = Object.keys(tables);
const ukKeys = Object.keys(tables.uk).sort();

/** The strings of every world (src/worlds/<id>/strings.ts) in the order of the folder names, as tools/sync_phrases.mjs reads them. */
const files = import.meta.glob<{ strings: WorldStrings }>('../worlds/*/strings.ts', { eager: true });
const folder = (path: string) => path.split('/')[2];
const worlds = Object.keys(files).sort().map((p) => files[p].strings);
// What src/main.ts does before the start screen: the game reads the worlds' texts through `t` and `voiceText`; the first
// world (in the order of the folders) is the one played here.
const played = worlds[0];
for (const w of worlds) addStrings(w, w === played);
/** The shared table and every world's, merged, as plain records. */
const all: Record<string, Record<string, unknown>> = Object.fromEntries(
  langs.map((l) => [l, Object.assign({}, tables[l], ...worlds.map((w) => (w.table as Record<string, Record<string, string>>)[l]))]),
);

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

describe('strings of every world (ARCH-12, PLAY-30)', () => {
  it('every world of the registry has its strings file, named after its folder', () => {
    // The worlds' index.ts files are only listed here, not loaded.
    const registry = Object.keys(import.meta.glob('../worlds/*/index.ts')).map(folder).sort();
    expect(registry.length).toBeGreaterThan(0);
    expect(Object.keys(files).map(folder).sort()).toEqual(registry);
    expect(Object.entries(files).filter(([p, m]) => m.strings?.id !== folder(p)).map(([p]) => p)).toEqual([]);
  });

  it.each(worlds.map((w) => [w.id, w] as const))('%s: both languages have the same keys and a text for each', (_, w) => {
    const table: Record<string, Record<string, unknown>> = w.table;
    const uk = Object.keys(table.uk).sort();
    expect(uk.length).toBeGreaterThan(0);
    for (const l of langs) {
      const keys = Object.keys(table[l] ?? {}).sort();
      expect({ world: w.id, lang: l, missing: uk.filter((k) => !keys.includes(k)), extra: keys.filter((k) => !uk.includes(k)) })
        .toEqual({ world: w.id, lang: l, missing: [], extra: [] });
      const empty = Object.entries(table[l]).filter(([, v]) => typeof v !== 'string' || v.trim() === '').map(([k]) => k);
      expect({ world: w.id, lang: l, emptyOrNotString: empty }).toEqual({ world: w.id, lang: l, emptyOrNotString: [] });
    }
  });

  it('no key is in two tables: one key, one clip (the keys each world has of its own aside)', () => {
    const owners = new Map<string, string[]>();
    const own = (who: string, keys: string[]) => { for (const k of keys) owners.set(k, [...(owners.get(k) ?? []), who]); };
    own('shared', Object.keys(STRINGS.uk));
    const ownKeys: readonly string[] = WORLD_OWN;
    for (const w of worlds) own(w.id, Object.keys(w.table.uk).filter((k) => !ownKeys.includes(k)));
    expect([...owners].filter(([, o]) => o.length > 1)).toEqual([]);
  });

  it.each(worlds.map((w) => [w.id, w] as const))('%s: has its own subtitle of the start screen (R12, R22), never spoken', (_, w) => {
    for (const k of WORLD_OWN) {
      expect(Object.hasOwn(STRINGS.uk, k) || Object.hasOwn(STRINGS.ru, k), `"${k}" is still a shared string`).toBe(false);
      for (const l of langs) expect({ world: w.id, lang: l, key: k, text: typeof (w.table as Record<string, Record<string, unknown>>)[l][k] }).toEqual({ world: w.id, lang: l, key: k, text: 'string' });
      expect(Object.hasOwn(w.spoken, k), `"${k}" of ${w.id} is marked as spoken`).toBe(false);
    }
  });

  it('the start screen shows the subtitle of the world played, and another world\'s does not clash with it', () => {
    setLang('uk');
    expect(t('subtitle')).toBe(played.table.uk.subtitle);
    setLang('ru');
    expect(t('subtitle')).toBe(played.table.ru.subtitle);
    setLang('uk');
    const other: WorldStrings = { id: 'other', table: { uk: { subtitle: 'Інший світ', other_x: 'х' }, ru: { subtitle: 'Другой мир', other_x: 'х' } }, spoken: {} };
    expect(() => recordingList([...worlds, other])).not.toThrow();
    addStrings(other, false);
    expect(t('subtitle')).toBe(played.table.uk.subtitle);
    // A second world played is an error: one subtitle on the start screen.
    const third: WorldStrings = { id: 'third', table: { uk: { subtitle: 'Третій' }, ru: { subtitle: 'Третий' } }, spoken: {} };
    expect(() => addStrings(third, true)).toThrow(/"third".*subtitle/);
    expect(t('subtitle')).toBe(played.table.uk.subtitle);
    // Never spoken: marking it for recording is an error.
    expect(() => recordingList([{ ...third, spoken: { subtitle: 'warm' } }])).toThrow(/subtitle/);
  });

  it.each(worlds.map((w) => [w.id, w] as const))('%s: each spoken line is in its table, with a known intonation', (_, w) => {
    const styles: readonly string[] = VOICE_STYLES;
    expect(Object.entries(w.spoken).filter(([k, s]) => !Object.hasOwn(w.table.uk, k) || !styles.includes(s)).map(([k]) => k)).toEqual([]);
  });

  it('refuses a key that already exists, in the game and in the list to record', () => {
    const clash = (id: string, key: string): WorldStrings => ({ id, table: { uk: { subtitle: 'в', [key]: 'а' }, ru: { subtitle: 'г', [key]: 'б' } }, spoken: {} });
    expect(() => addStrings(clash('x', 'play'), false)).toThrow(/"x".*play/);
    expect(() => addStrings(worlds[0], false)).toThrow(new RegExp(`"${worlds[0].id}"`));
    expect(() => recordingList([clash('x', 'play')])).toThrow(/"x".*play/);
    expect(() => recordingList([...worlds, ...worlds])).toThrow(new RegExp(`"${worlds[0].id}"`));
    // A refused world adds nothing.
    expect(t('play')).toBe('Грати');
  });

  it('refuses a spoken line without a Ukrainian text', () => {
    const w: WorldStrings = { id: 'x', table: { uk: { subtitle: 'а' }, ru: { subtitle: 'б' } }, spoken: { nothing_here: 'warm' } };
    expect(() => recordingList([w])).toThrow(/nothing_here/);
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
  const spoken = [...Object.keys(SPOKEN), ...worlds.flatMap((w) => Object.keys(w.spoken))] as SpokenKey[];
  const texts = () => Object.entries(file).map(([k, v]) => ({ key: k, text: Array.isArray(v) ? String(v[0]) : String(v) }));

  it('lists exactly the lines marked as spoken (shared, then each world), in the order of the marks', () => {
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
    expect(file).toEqual(recordingList(worlds));
    // The order too: the file is written in the order of the list.
    expect(Object.keys(file)).toEqual(Object.keys(recordingList(worlds)));
  });

  it('has a subtitle in every language for each spoken line', () => {
    for (const l of langs) {
      expect({ lang: l, noText: spoken.filter((k) => typeof all[l][k] !== 'string') }).toEqual({ lang: l, noText: [] });
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
    expect(all.uk.intro).toContain('{, name}');
    expect(STRINGS.uk.welcome_back).toContain('{, name}');
    expect(texts().filter(({ text }) => /[{}]/.test(text)).map(({ key }) => key)).toEqual([]);
  });

  it('cuts the name placeholder out and refuses any other placeholder', () => {
    expect(recordable('intro', String(all.uk.intro))).toBe('Привіт! Ми в Королівстві фей. Кристал світла розбився на пʼять уламків! Допоможеш їх зібрати?');
    expect(recordable('x', 'Раз{, name}, два{, name}.')).toBe('Раз, два.');
    // A counter or any other variable cannot be one fixed clip; the error names the key.
    expect(() => recordable('shard_text', String(all.uk.shard_text))).toThrow(/shard_text/);
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
    expect(JSON.stringify(recordingList(worlds))).not.toContain('Зоряна');
    expect(recordingList(worlds)).toEqual(file);
    expect(JSON.stringify(file)).not.toContain('Зоряна');
  });

  it('cannot speak an interface-only string (compile-time guard)', () => {
    // `tsc` fails on the directive below if `voiceText` ever accepts keys that are not marked as spoken.
    // @ts-expect-error 'ok' is a button label, it is not in SPOKEN
    expect(voiceText('ok')).toBe(STRINGS.uk.ok);
    expect(Object.keys(SPOKEN)).not.toContain('ok');
  });
});

describe('messages of a device that cannot run the game and of a failed load (TECH-07, TECH-08)', () => {
  afterEach(() => {
    setLang('uk');
  });
  const NOTICES = ['no_webgl', 'load_failed', 'retry'] as const;
  // Letters that only one of the two languages has: a Russian text copied into the Ukrainian block (or the other
  // way round) is caught, which the parity of the keys alone would not see.
  const UK_ONLY = /[іїєґ]/i, RU_ONLY = /[ыэъё]/i;

  it.each(NOTICES)('%s is written in Ukrainian and in Russian, not one text twice', (k) => {
    expect(STRINGS.uk[k]).not.toBe(STRINGS.ru[k]);
    expect(STRINGS.uk[k]).not.toMatch(RU_ONLY);
    expect(STRINGS.ru[k]).not.toMatch(UK_ONLY);
  });

  it('shows them in the chosen language', () => {
    setLang('uk');
    expect(t('retry')).toBe('Спробувати ще раз');
    expect(t('load_failed')).toMatch(/спробуйте ще раз/);
    setLang('ru');
    expect(t('retry')).toBe('Попробовать ещё раз');
    expect(t('load_failed')).toMatch(/попробуйте ещё раз/);
    expect(t('no_webgl')).toMatch(/Обновите браузер/);
  });

  it('advises to update the browser in both languages', () => {
    expect(STRINGS.uk.no_webgl).toMatch(/Оновіть браузер/);
    expect(STRINGS.ru.no_webgl).toMatch(/Обновите браузер/);
  });

  it('never speaks them: they are not lines to record', () => {
    const file: Record<string, unknown> = phrases;
    for (const k of NOTICES) {
      expect(Object.keys(SPOKEN)).not.toContain(k);
      expect(Object.keys(file)).not.toContain(k);
    }
  });
});
