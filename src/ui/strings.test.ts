import { afterEach, describe, expect, it, vi } from 'vitest';
import phrases from '../../voice/phrases.json';
import qa from '../../voice/qa.json';
import { bank } from './strings-bank';
import {
  SPOKEN, STRINGS, VOICE_STYLES, WORLD_OWN, addStrings, lang, recordable, recordingList, setChildName, setLang, t, tf, voiceText,
  PRAISE, TRY, tapKey, type PartStrings, type SpokenKey, type WorldStrings,
} from './strings';

/** Language blocks as plain records, so the test keeps working even when the key sets differ. */
const tables: Record<string, Record<string, unknown>> = STRINGS;
const langs = Object.keys(tables);
const ukKeys = Object.keys(tables.uk).sort();

/** The strings of every world (src/worlds/<id>/strings.ts) in the order of the folder names, as tools/sync_phrases.mjs reads them. */
const files = import.meta.glob<{ strings: WorldStrings }>('../worlds/*/strings.ts', { eager: true });
const folder = (path: string) => path.split('/')[2];
const worlds = Object.keys(files).sort().map((p) => files[p].strings);
/** Each world's table "character - voice" (VOICE-10), as tools/sync_phrases.mjs reads them. */
const castFiles = import.meta.glob<{ voices: Parameters<typeof recordingList>[2][number] }>('../worlds/*/voices.ts', { eager: true });
const casts = Object.keys(castFiles).sort().map((p) => castFiles[p].voices);
/**
 * The texts of the parts (PartStrings: src/s2/strings-<part>.ts): the modules that say `satisfies PartStrings`, in the
 * order of their paths under src/, as tools/parts.mjs finds them for tools/sync_phrases.mjs.
 */
const partText = import.meta.glob<string>('../**/strings-*.ts', { query: '?raw', import: 'default', eager: true });
const partModules = import.meta.glob<{ strings: PartStrings }>('../**/strings-*.ts', { eager: true });
/** A path of the glob (from this folder) as a path under src/. */
const underSrc = (path: string) => (path.startsWith('./') ? `ui/${path.slice(2)}` : path.replace(/^\.\.\//, ''));
const partPaths = Object.keys(partText).filter((p) => !p.endsWith('.test.ts') && partText[p].includes('satisfies PartStrings'))
  .sort((a, b) => (underSrc(a) < underSrc(b) ? -1 : 1));
const parts = partPaths.map((p) => partModules[p].strings);
/** The first world - the one the installation brings - read from the registry as text, as tools/sync_phrases.mjs reads it. */
const registry = import.meta.glob<string>('../worlds/index.ts', { query: '?raw', import: 'default', eager: true });
const FIRST = /\bDEFAULT_WORLD\b[^=\n]*=\s*['"]([^'"]+)['"]/.exec(registry['../worlds/index.ts'])?.[1] ?? '';
// What src/main.ts does before the start screen: the game reads the worlds' texts through `t` and `voiceText`; the first
// world (in the order of the folders) is the one played here.
const played = worlds[0];
for (const w of worlds) addStrings(w, w === played);
for (const p of parts) addStrings(p, false);
/** The shared table and every world's, merged, as plain records. */
const all: Record<string, Record<string, unknown>> = Object.fromEntries(
  langs.map((l) => [l, Object.assign({}, tables[l], ...[...parts, ...worlds].map((w) => (w.table as Record<string, Record<string, string>>)[l]))]),
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
    expect(() => recordingList([...worlds, other], bank, casts, FIRST)).not.toThrow();
    addStrings(other, false);
    expect(t('subtitle')).toBe(played.table.uk.subtitle);
    // A second world played is an error: one subtitle on the start screen.
    const third: WorldStrings = { id: 'third', table: { uk: { subtitle: 'Третій' }, ru: { subtitle: 'Третий' } }, spoken: {} };
    expect(() => addStrings(third, true)).toThrow(/"third".*subtitle/);
    expect(t('subtitle')).toBe(played.table.uk.subtitle);
    // Never spoken: marking it for recording is an error.
    expect(() => recordingList([{ ...third, spoken: { subtitle: 'warm' } }], bank, casts, FIRST)).toThrow(/subtitle/);
  });

  it.each(worlds.map((w) => [w.id, w] as const))('%s: each spoken line is in its table, with a known intonation', (_, w) => {
    const styles: readonly string[] = VOICE_STYLES;
    expect(Object.entries(w.spoken).filter(([k, s]) => !Object.hasOwn(w.table.uk, k) || !styles.includes(s)).map(([k]) => k)).toEqual([]);
  });

  it('refuses a key that already exists, in the game and in the list to record', () => {
    const clash = (id: string, key: string): WorldStrings => ({ id, table: { uk: { subtitle: 'в', [key]: 'а' }, ru: { subtitle: 'г', [key]: 'б' } }, spoken: {} });
    expect(() => addStrings(clash('x', 'play'), false)).toThrow(/"x".*play/);
    // a world added already adds nothing again (she enters a world twice); another world with its keys is refused
    expect(() => addStrings(worlds[0], false)).not.toThrow();
    expect(() => addStrings({ ...worlds[0], id: 'copy' }, false)).toThrow(/"copy"/);
    expect(() => recordingList([clash('x', 'play')], bank, casts, FIRST)).toThrow(/"x".*play/);
    expect(() => recordingList([...worlds, ...worlds], bank, casts, FIRST)).toThrow(new RegExp(`"${worlds[0].id}"`));
    // A refused world adds nothing.
    expect(t('play')).toBe('Грати');
  });

  it('refuses a spoken line without a Ukrainian text', () => {
    const w: WorldStrings = { id: 'x', table: { uk: { subtitle: 'а' }, ru: { subtitle: 'б' } }, spoken: { nothing_here: 'warm' } };
    expect(() => recordingList([w], bank, casts, FIRST)).toThrow(/nothing_here/);
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
  const spoken = [...Object.keys(SPOKEN), ...parts.flatMap((p) => Object.keys(p.spoken)), ...worlds.flatMap((w) => Object.keys(w.spoken)), ...Object.keys(bank.spoken)] as SpokenKey[];
  const texts = () => Object.entries(file).map(([k, v]) => ({ key: k, text: Array.isArray(v) ? String(v[0]) : String(v) }));

  it('lists exactly the lines marked as spoken (shared, then each part, then each world), in the order of the marks', () => {
    // A line a character says in its own voice is listed again as `<key>@<voice>` (VOICE-10): its key is the line's. A
    // line only the characters say (`only` of src/worlds/<id>/voices.ts) is there in their voices alone.
    const keys = [...new Set(Object.keys(file).map((k) => k.split('@')[0]))];
    // Named lists first, so a failure says which key to mark or which mark to sync.
    expect({
      notInFile: spoken.filter((k) => !keys.includes(k)),
      notSpoken: keys.filter((k) => !(spoken as string[]).includes(k)),
    }).toEqual({ notInFile: [], notSpoken: [] });
    expect(keys).toEqual(spoken);
    expect(spoken.length).toBeGreaterThan(0);
  });

  it('is what `npm run voice:sync` builds from the game texts', () => {
    expect(file).toEqual(recordingList(worlds, bank, casts, FIRST, parts));
    // The order too: the file is written in the order of the list.
    expect(Object.keys(file)).toEqual(Object.keys(recordingList(worlds, bank, casts, FIRST, parts)));
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
      .filter(([, v]) => !(Array.isArray(v) && (v.length === 3 || (v.length === 4 && typeof v[3] === 'string' && v[3] !== '')) && typeof v[0] === 'string'
        && typeof v[2] === 'string' && v[0].trim() !== '' && styles.includes(v[1])))
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
    expect(texts().filter(({ key, text }) => text !== said(key.split('@')[0])).map(({ key }) => key)).toEqual([]);
  });

  it('never carries the name, whatever name and language are set', () => {
    setChildName('Зоряна');
    setLang('ru');
    // The name reaches the subtitle and the on-device speech only…
    expect(t('intro')).toContain('Зоряна');
    expect(voiceText('intro')).toContain('Зоряна');
    // …the list for recording is built the same and matches the committed file.
    expect(JSON.stringify(recordingList(worlds, bank, casts, FIRST, parts))).not.toContain('Зоряна');
    expect(recordingList(worlds, bank, casts, FIRST, parts)).toEqual(file);
    expect(JSON.stringify(file)).not.toContain('Зоряна');
  });

  it('cannot speak an interface-only string (compile-time guard)', () => {
    // `tsc` fails on the directive below if `voiceText` ever accepts keys that are not marked as spoken.
    // @ts-expect-error 'ok' is a button label, it is not in SPOKEN
    expect(voiceText('ok')).toBe(STRINGS.uk.ok);
    expect(Object.keys(SPOKEN)).not.toContain('ok');
  });
});

// TECH-09, R67/R68/R76/R78: the voice of a next world is only what its own strings.ts marks as spoken; such a line
// carries the id of its world as a fourth field. The shared lines, the first world's and the bank's are the core's.
describe('the world of a line to record (the voice of a next world)', () => {
  const file: Record<string, unknown[]> = phrases;
  /** A made-up next world with two lines of its own, and its table of voices: the heron speaks with Leda. */
  const lake: WorldStrings = {
    id: 'lake', table: { uk: { subtitle: 'Озеро', lake_hi: 'Ось і озеро!', heron_hi: 'Привіт! Я чапля.' }, ru: { subtitle: 'Озеро', lake_hi: 'Вот и озеро!', heron_hi: 'Привет! Я цапля.' } },
    spoken: { lake_hi: 'joy', heron_hi: 'warm' },
  };
  const lakeCast = { id: 'lake', narrator: 'cat', cast: { cat: { emoji: '🐱', voice: 'Puck' }, heron: { emoji: '🪿', voice: 'Leda' } }, voiced: ['own', 'npc_next'] };
  /** A made-up first world with one line, so the lists below hold both kinds of world and nothing of the real ones. */
  const home: WorldStrings = { id: 'home', table: { uk: { subtitle: 'Дім', home_hi: 'Ми вдома!' }, ru: { subtitle: 'Дом', home_hi: 'Мы дома!' } }, spoken: { home_hi: 'joy' } };

  it('the registry names the first world, and it is one of the worlds', () => {
    expect(FIRST).not.toBe('');
    expect(worlds.map((w) => w.id)).toContain(FIRST);
  });

  it('a line of a next world, and each of its voices, has the id of its world as the fourth field', () => {
    const list = recordingList([home, lake], bank, [lakeCast], 'home');
    expect(list.lake_hi).toEqual(['Ось і озеро!', 'joy', 'cat', 'lake']);
    expect(list.heron_hi).toEqual(['Привіт! Я чапля.', 'warm', 'cat', 'lake']);
    expect(list['heron_hi@Leda']).toEqual(['Привіт! Я чапля.', 'warm', 'heron', 'lake']);
  });

  it('the first world\'s lines, the shared ones and the bank\'s have no world: three fields, as they always had', () => {
    const list = recordingList([home, lake], bank, [lakeCast], 'home');
    expect(list.home_hi).toEqual(['Ми вдома!', 'joy', 'cat']);
    expect(list.npc_next).toHaveLength(3);
    expect(Object.keys(bank.spoken).filter((k) => list[k].length !== 3)).toEqual([]);
    const withWorld = Object.keys(list).filter((k) => list[k].length !== 3);
    expect(withWorld).toEqual(['lake_hi', 'heron_hi', 'heron_hi@Leda']);
  });

  it('a shared line in the voice of a character of a next world is still the core\'s: no world (R67)', () => {
    const list = recordingList([home, lake], bank, [lakeCast], 'home');
    expect(list['npc_next@Leda']).toEqual([list.npc_next[0], list.npc_next[1], 'heron']);
  });

  it('which world is the first one is what the caller says, not the order of the list', () => {
    const list = recordingList([home, lake], bank, [lakeCast], 'lake');
    expect(list.home_hi).toEqual(['Ми вдома!', 'joy', 'cat', 'home']);
    expect(list.lake_hi).toHaveLength(3);
    expect(list['heron_hi@Leda']).toHaveLength(3);
    expect(list['npc_next@Leda']).toHaveLength(3);
  });

  it('the committed list: only the lines a next world marks as spoken have a world, and it is their own', () => {
    const next = worlds.filter((w) => w.id !== FIRST);
    const expected = Object.fromEntries(next.flatMap((w) => Object.keys(w.spoken).map((k) => [k, w.id])));
    const got = Object.fromEntries(Object.entries(file).filter(([, row]) => row.length > 3).map(([k, row]) => [k.split('@')[0], row[3]]));
    expect(got).toEqual(expected);
    // Not vacuous: a next world with a line of its own is there (the probe world).
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    const first = worlds.find((w) => w.id === FIRST);
    expect(Object.keys(first?.spoken ?? {}).length).toBeGreaterThan(0);
    const ofFirst = new Set(Object.keys(first?.spoken ?? {}));
    expect(Object.entries(file).filter(([k, row]) => ofFirst.has(k.split('@')[0]) && row.length !== 3).map(([k]) => k)).toEqual([]);
  });

  it('no shared line has a world, in the narrator\'s voice or in a character\'s: its clip is the core\'s (R78)', () => {
    // the committed list, the list built from the game's texts, and a list with a made-up next world that has voices
    for (const list of [file, recordingList(worlds, bank, casts, FIRST, parts), recordingList([home, lake], bank, [lakeCast], 'home')]) {
      const shared = Object.keys(list).filter((k) => Object.hasOwn(SPOKEN, k.split('@')[0]));
      expect(shared.length).toBeGreaterThan(Object.keys(SPOKEN).length);   // the voices of the characters are among them
      expect(shared.filter((k) => list[k].length !== 3)).toEqual([]);
    }
  });

  it('the keys are one set for the whole game: a key two tables share is refused, whichever worlds they are of (R82)', () => {
    const world = (id: string, key: string): WorldStrings => ({ id, table: { uk: { subtitle: id, [key]: 'а' }, ru: { subtitle: id, [key]: 'б' } }, spoken: { [key]: 'warm' } });
    const homeCast = { id: 'home', narrator: 'cat', cast: { cat: { emoji: '🐱', voice: 'Puck' } }, voiced: [] };
    const once = /these strings already exist \(one key, one clip\)/;
    // two next worlds: their clips would lie in two folders, the key is refused all the same
    expect(() => recordingList([home, world('a', 'same_hi'), world('b', 'same_hi')], bank, [homeCast], 'home')).toThrow(once);
    expect(() => recordingList([home, world('a', 'same_hi'), world('b', 'same_hi')], bank, [homeCast], 'home')).toThrow(/"b".*same_hi/);
    // a next world and the first one, the shared table, the bank
    expect(() => recordingList([home, world('a', 'home_hi')], bank, [homeCast], 'home')).toThrow(/"a".*home_hi/);
    expect(() => recordingList([home, world('a', 'npc_next')], bank, [homeCast], 'home')).toThrow(/"a".*npc_next/);
    const banked = Object.keys(bank.spoken)[0];
    expect(() => recordingList([home, world('a', banked)], bank, [homeCast], 'home')).toThrow(new RegExp(`the bank.*${banked}`));
    // the game refuses it too, before it plays
    expect(() => addStrings(world('a', 'npc_next'), false)).toThrow(once);
    // and in the committed list every key is there once, with or without a world
    const text = JSON.stringify(phrases);
    expect(Object.keys(file).filter((k) => text.split(`"${k}":`).length !== 2)).toEqual([]);
  });

  // Decision of 2026-11-21: a line only the characters say has no narrator's clip - recorded in their voices alone.
  it('a line of `only` is listed in the characters\' voices alone; one said in no voice of a character is refused', () => {
    const list = recordingList([lake], bank, [{ ...lakeCast, only: ['own'] }], 'home');
    expect(Object.keys(list).filter((k) => k.startsWith('heron_hi'))).toEqual(['heron_hi@Leda']);
    expect(list['heron_hi@Leda']).toEqual(['Привіт! Я чапля.', 'warm', 'heron', 'lake']);
    expect(list.lake_hi).toBeDefined();   // the world's own line the narrator says stays his
    expect(Object.keys(recordingList([lake], bank, [{ ...lakeCast, only: ['npc_next'] }], 'home')).filter((k) => k.startsWith('npc_next'))).toEqual(['npc_next@Leda']);
    expect(() => recordingList([lake], bank, [{ ...lakeCast, only: ['lake_hi'] }], 'home')).toThrow(/"lake_hi" of `only` is said in no voice of a character/);
    expect(() => recordingList([lake], bank, [{ ...lakeCast, only: ['no_such'] }], 'home')).toThrow(/"no_such" is no spoken line/);
  });

  it('the committed list: the lines of the first world\'s `only` have no narrator\'s row, every one has its voices', () => {
    const fairy = casts.find((c) => c.id === FIRST);
    expect(fairy?.only?.length).toBeGreaterThan(0);
    const alone = Object.keys(recordingList(worlds, bank, casts.map((c) => (c.id === FIRST ? { ...c, only: [] } : c)), FIRST)).filter((k) => !k.includes('@') && !Object.hasOwn(file, k));
    const residents = ['unicorn', 'fox', 'mushking', 'deer', 'queen'];
    // the greetings and the trades of the residents, the hints of the parts, the thanks for a shard, the star search
    const own = residents.flatMap((r) => [`${r}_hi`, `${r}_trade_ask`, `${r}_trade_far`, `${r}_trade_thanks`]);
    expect(alone.sort()).toEqual([...own, 'fox_part_hint', 'mushking_part_hint', 'npc_done', 't_stars'].sort());
    for (const k of alone) expect(Object.keys(file).filter((f) => f.startsWith(`${k}@`)).length, k).toBeGreaterThan(0);
  });
});

/**
 * A part of the game keeps its texts in a module of its own (PartStrings; src/main.ts adds it with `addStrings`).
 * Its spoken lines are sent for recording like the shared ones: until 2026-11-27 `recordingList` did not know the
 * parts, and a spoken line of a part was shown and never recorded.
 */
describe('the spoken lines of the parts (PartStrings)', () => {
  const part = (id: string, uk: Record<string, string>, spoken: PartStrings['spoken']): PartStrings =>
    ({ id, table: { uk, ru: Object.fromEntries(Object.keys(uk).map((k) => [k, `ru ${k}`])) }, spoken });
  const made = part('made', { t_made_up: 'Скільки тут зірок?', h1_made_up: 'Порахуй їх по одній.', made_label: 'Зірки' }, { t_made_up: 'warm', h1_made_up: 'calm' });

  it('the game has parts, each with both languages; none is a world', () => {
    expect(parts.length).toBeGreaterThan(0);
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    for (const p of parts) {
      expect(Object.keys(p.table.ru).sort(), p.id).toEqual(Object.keys(p.table.uk).sort());
      expect(worlds.map((w) => w.id), p.id).not.toContain(p.id);
      for (const k of Object.keys(p.spoken)) expect(typeof p.table.uk[k], `${p.id}: ${k}`).toBe('string');
    }
  });

  it('a spoken line of a part is listed as a line of the core: its text, its intonation, the narrator, no world', () => {
    const list = recordingList(worlds, bank, casts, FIRST, [...parts, made]);
    expect(list.h1_made_up).toEqual(['Порахуй їх по одній.', 'calm', casts[0].narrator]);
    expect(list.t_made_up).toEqual(['Скільки тут зірок?', 'warm', casts[0].narrator]);
    expect(Object.keys(list).filter((k) => k.startsWith('made_label'))).toEqual([]);
    // without the part nothing of it is listed, and the rest of the list is the same
    const without = recordingList(worlds, bank, casts, FIRST, parts);
    expect(Object.keys(without).filter((k) => k.includes('made_up'))).toEqual([]);
    expect(Object.fromEntries(Object.entries(list).filter(([k]) => !k.includes('made_up')))).toEqual(without);
  });

  it('the rules of the characters\' voices reach it: a question of a part is said in every voice that says the questions', () => {
    const list = recordingList(worlds, bank, casts, FIRST, [made]);
    const voicesOf = (key: string) => Object.keys(list).filter((k) => k.startsWith(`${key}@`)).map((k) => k.split('@')[1]).sort();
    expect(voicesOf('t_made_up')).toEqual(voicesOf('t_add'));
    expect(voicesOf('t_made_up').length).toBeGreaterThan(0);
    expect(voicesOf('h1_made_up')).toEqual([]);
    for (const k of Object.keys(list).filter((k) => k.startsWith('t_made_up@'))) expect(list[k], k).toHaveLength(3);
  });

  it('its lines stand after the shared ones and before the worlds\', in the order of the parts', () => {
    const other = part('other', { other_line: 'Ще одна репліка.' }, { other_line: 'joy' });
    const keys = Object.keys(recordingList(worlds, bank, casts, FIRST, [made, other])).filter((k) => !k.includes('@'));
    const shared = Object.keys(SPOKEN), firstOfWorlds = keys.findIndex((k) => worlds.some((w) => Object.hasOwn(w.spoken, k)));
    expect(keys.slice(0, shared.length)).toEqual(shared);
    expect(keys.slice(shared.length, shared.length + 3)).toEqual(['t_made_up', 'h1_made_up', 'other_line']);
    expect(firstOfWorlds).toBe(shared.length + 3);
  });

  it('one key, one clip: a part may not take a key of the shared strings, of another part, of a world or of the bank', () => {
    const lineOf = (key: string) => part('made', { [key]: 'Репліка частини.' }, { [key]: 'warm' });
    expect(() => recordingList(worlds, bank, casts, FIRST, [lineOf('play')])).toThrow(/part "made": these strings already exist \(one key, one clip\): play/);
    expect(() => recordingList(worlds, bank, casts, FIRST, [made, { ...lineOf('h1_made_up'), id: 'second' }])).toThrow(/part "second".*h1_made_up/);
    const worldKey = Object.keys(worlds[0].spoken)[0];
    expect(() => recordingList(worlds, bank, casts, FIRST, [lineOf(worldKey)])).toThrow(new RegExp(`world "${worlds[0].id}".*${worldKey}`));
    const banked = Object.keys(bank.spoken)[0];
    expect(() => recordingList(worlds, bank, casts, FIRST, [lineOf(banked)])).toThrow(new RegExp(`the bank.*${banked}`));
  });

  it('a spoken line of a part with no Ukrainian text, or with a placeholder, cannot be recorded', () => {
    expect(() => recordingList(worlds, bank, casts, FIRST, [part('made', { made_label: 'Зірки' }, { t_made_up: 'warm' })]))
      .toThrow(/spoken line "t_made_up" of part "made" has no Ukrainian text/);
    expect(() => recordingList(worlds, bank, casts, FIRST, [part('made', { t_made_up: 'Тут {n} зірок.' }, { t_made_up: 'warm' })]))
      .toThrow(/t_made_up.*placeholder/);
  });

  it('the list of the repository is built with the parts of the game', () => {
    const file: Record<string, unknown> = phrases;
    const lines = parts.flatMap((p) => Object.keys(p.spoken));
    expect({ notInFile: lines.filter((k) => !Object.hasOwn(file, k)) }).toEqual({ notInFile: [] });
    expect(recordingList(worlds, bank, casts, FIRST, parts)).toEqual(file);
  });
});

describe('messages of a device that cannot run the game and of a failed load (TECH-07, TECH-08)', () => {
  afterEach(() => {
    setLang('uk');
  });
  const NOTICES = ['no_webgl', 'load_failed', 'retry', 'gpu_lost', 'reload'] as const;
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
