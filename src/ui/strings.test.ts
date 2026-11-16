import { afterEach, describe, expect, it, vi } from 'vitest';
import phrases from '../../voice/phrases.json';
import qa from '../../voice/qa.json';
import { bank } from './strings-bank';
import {
  SPOKEN, STRINGS, VOICE_STYLES, WORLD_OWN, addStrings, lang, recordable, recordingList, setChildName, setLang, t, tf, voiceText,
  PRAISE, TRY, tapKey, type SpokenKey, type WorldStrings,
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
    expect(() => recordingList([...worlds, other], bank)).not.toThrow();
    addStrings(other, false);
    expect(t('subtitle')).toBe(played.table.uk.subtitle);
    // A second world played is an error: one subtitle on the start screen.
    const third: WorldStrings = { id: 'third', table: { uk: { subtitle: 'Третій' }, ru: { subtitle: 'Третий' } }, spoken: {} };
    expect(() => addStrings(third, true)).toThrow(/"third".*subtitle/);
    expect(t('subtitle')).toBe(played.table.uk.subtitle);
    // Never spoken: marking it for recording is an error.
    expect(() => recordingList([{ ...third, spoken: { subtitle: 'warm' } }], bank)).toThrow(/subtitle/);
  });

  it.each(worlds.map((w) => [w.id, w] as const))('%s: each spoken line is in its table, with a known intonation', (_, w) => {
    const styles: readonly string[] = VOICE_STYLES;
    expect(Object.entries(w.spoken).filter(([k, s]) => !Object.hasOwn(w.table.uk, k) || !styles.includes(s)).map(([k]) => k)).toEqual([]);
  });

  it('refuses a key that already exists, in the game and in the list to record', () => {
    const clash = (id: string, key: string): WorldStrings => ({ id, table: { uk: { subtitle: 'в', [key]: 'а' }, ru: { subtitle: 'г', [key]: 'б' } }, spoken: {} });
    expect(() => addStrings(clash('x', 'play'), false)).toThrow(/"x".*play/);
    expect(() => addStrings(worlds[0], false)).toThrow(new RegExp(`"${worlds[0].id}"`));
    expect(() => recordingList([clash('x', 'play')], bank)).toThrow(/"x".*play/);
    expect(() => recordingList([...worlds, ...worlds], bank)).toThrow(new RegExp(`"${worlds[0].id}"`));
    // A refused world adds nothing.
    expect(t('play')).toBe('Грати');
  });

  it('refuses a spoken line without a Ukrainian text', () => {
    const w: WorldStrings = { id: 'x', table: { uk: { subtitle: 'а' }, ru: { subtitle: 'б' } }, spoken: { nothing_here: 'warm' } };
    expect(() => recordingList([w], bank)).toThrow(/nothing_here/);
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
  const spoken = [...Object.keys(SPOKEN), ...worlds.flatMap((w) => Object.keys(w.spoken)), ...Object.keys(bank.spoken)] as SpokenKey[];
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
    expect(file).toEqual(recordingList(worlds, bank));
    // The order too: the file is written in the order of the list.
    expect(Object.keys(file)).toEqual(Object.keys(recordingList(worlds, bank)));
  });

  it('has a subtitle in every language for each spoken line', () => {
    for (const l of langs) {
      const text = (k: string) => all[l][k] ?? bank.table[l as 'uk'][k];
      expect({ lang: l, noText: spoken.filter((k) => typeof text(k) !== 'string') }).toEqual({ lang: l, noText: [] });
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
    // The bank is not in the game's table yet (the game asks for none of its clips): its line is its own table's text.
    const said = (key: string) => (Object.hasOwn(bank.spoken, key) ? bank.table.uk[key] : voiceText(key as SpokenKey));
    expect(texts().filter(({ key, text }) => text !== said(key)).map(({ key }) => key)).toEqual([]);
  });

  it('never carries the name, whatever name and language are set', () => {
    setChildName('Зоряна');
    setLang('ru');
    // The name reaches the subtitle and the on-device speech only…
    expect(t('intro')).toContain('Зоряна');
    expect(voiceText('intro')).toContain('Зоряна');
    // …the list for recording is built the same and matches the committed file.
    expect(JSON.stringify(recordingList(worlds, bank))).not.toContain('Зоряна');
    expect(recordingList(worlds, bank)).toEqual(file);
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

describe('texts of the run "learning" (LEARN-03, 06…10, 15, PLAY-15; HINTS.md)', () => {
  /** The lines of the three-step hint and of the new kinds: spoken, in the order of HINTS.md. */
  const NEW_SPOKEN = [
    't_missing', 't_house', 't_before', 't_after', 't_signs', 't_sort_two',
    'h1_count', 'h1_ten', 'h2_ten', 'h1_add', 'h1_add_cross', 'h2_add_cross', 'h1_sub', 'h1_sub_cross', 'h2_sub_cross',
    'h2_compare', 'h1_compare_num', 'h2_compare_num', 'h1_signs', 'h2_signs', 'h2_order', 'h1_neighbors', 'h2_neighbors',
    'h1_missing', 'h1_missing_ten', 'h2_missing', 'h1_house', 'h2_house', 'h2_pattern', 'h1_pattern_grow', 'h2_pattern_grow',
    'h1_pattern_two', 'h2_pattern_two', 'h1_simon', 'h1_simon_long', 'h1_odd_shape', 'h1_odd_two', 'h2_odd', 'h2_sort',
    'h1_sort_two', 'h2_sort_two', 'h3_show',
  ] as const;
  /** The hint lines recorded before the run: their clips are named by these keys, so the keys stay. */
  const OLD_HINTS = ['h_count', 'h_left', 'h_compare', 'h_pattern', 'h_odd', 'h_order', 'h_sort', 'h_simon'] as const;
  /** Interface only: the parents' section. */
  const PARENTS = [
    'sk_series', 'sk_pattern', 'sk_memory', 'sk_classify', 'sk_compose', 'sk_logic', 'p_fix', 'p_fix_note', 'p_time', 'p_total', 'p_min',
    'p_time_none', 'p_hard', 'p_hard_none', 'p_wd0', 'p_wd1', 'p_wd2', 'p_wd3', 'p_wd4', 'p_wd5', 'p_wd6',
  ] as const;
  const spoken: Record<string, string> = SPOKEN;
  const uk: Record<string, string> = STRINGS.uk, ru: Record<string, string> = STRINGS.ru;

  it('every new line and every older hint line is spoken, warmly, in both languages', () => {
    const bad = [...NEW_SPOKEN, ...OLD_HINTS].filter((k) => spoken[k] !== 'warm' || !uk[k] || !ru[k] || uk[k] === ru[k]);
    expect(bad).toEqual([]);
  });

  it('no spoken line of the shared table is one word: the voice model gives silence on it', () => {
    // Only lines still to be recorded: a clip imported from the old game (`from` in voice/qa.json) exists already.
    const records = qa as unknown as Record<string, { from?: string }>;
    const imported = (k: string) => typeof records[k]?.from === 'string';
    expect(Object.keys(SPOKEN).filter((k) => imported(k)).length, 'the old clips are exempt by their mark').toBe(30);
    expect(Object.keys(SPOKEN).filter((k) => !imported(k) && recordable(k, uk[k]).trim().split(/\s+/).length < 2)).toEqual([]);
  });

  it('a hint names no level and no verdict', () => {
    const hints = Object.keys(SPOKEN).filter((k) => /^h\d?_/.test(k));
    // At the start of a word only: "порівняємо" (we compare) is no "рівень".
    const word = (stems: string) => new RegExp(`(^|[^а-яёіїєґʼ'])(${stems})`, 'i');
    const UK = word('рівен|рівн[яію]|неправильн|помил'), RU = word('уров[ен]|неправильн|ошиб');
    expect(hints.filter((k) => UK.test(uk[k]) || RU.test(ru[k]))).toEqual([]);
  });

  it('the parents\' section has its texts, never spoken; the minutes are filled in', () => {
    expect(PARENTS.filter((k) => !uk[k] || !ru[k] || Object.hasOwn(SPOKEN, k))).toEqual([]);
    setLang('uk');
    expect(tf('p_min', { n: 12 })).toBe('12 хв');
    setLang('ru');
    expect(tf('p_min', { n: 12 })).toBe('12 мин');
    setLang('uk');
  });
});

describe('the clips of the old game (VOICE-07)', () => {
  const records = qa as unknown as Record<string, { text: string; style: string; from?: string }>;
  it('the bank\'s Ukrainian text, built from the key, is letter for letter the text its clip was recorded from', () => {
    const keys = Object.keys(bank.table.uk);
    expect(keys.length).toBe(363);
    expect(keys.filter((k) => records[k]?.text !== bank.table.uk[k] || !records[k]?.from)).toEqual([]);
    expect(Object.keys(bank.table.ru).sort()).toEqual([...keys].sort());
    expect(keys.filter((k) => !bank.table.ru[k] || bank.table.ru[k] === bank.table.uk[k])).toEqual([]);
    expect(bank.table.ru.cross_2_9).toBe('Давай посчитаем вместе! Два плюс девять. Переставим: девять плюс два. Девять плюс один — десять, и ещё один — одиннадцать.');
  });

  it('the praise, "try again" and the numbers 1-20 are keys of the list, with the text of their clip', () => {
    const uk: Record<string, string> = STRINGS.uk;
    const keys = [...PRAISE, ...TRY, ...Array.from({ length: 20 }, (_, i) => tapKey(i + 1))];
    expect(keys.filter((k) => !k || !Object.hasOwn(SPOKEN, k) || records[k]?.text !== uk[k] || !records[k]?.from)).toEqual([]);
    expect([tapKey(0), tapKey(21), tapKey(2.5), tapKey(-1)]).toEqual([null, null, null, null]);
    expect(tapKey(20)).toBe('tap_20');
  });
});
