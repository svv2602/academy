// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordTask } from '../game/skills';
import { clearSave, defaultSave, loadSave, storeSave, worldState, type Save } from './save';
import { BEFORE_CODE, CODE_MAX, DEVICE_FIELDS, checksum, fromCode, gameState, hasBefore, loadCode, restoreBefore, toCode } from './savecode';

const KEY = 'amw-save';
const PREV = 'amw-save-prev';

/** In-memory stand-in for localStorage (the one of save.test.ts): the tests read every key. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
  };
}
let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  loadSave();   // a fresh page: a clearSave of an earlier test no longer holds the writes back
});
afterEach(() => { vi.unstubAllGlobals(); });

/** A save after some play: a name (made up), stars, skills moved by real tasks, a world, purchases, odd device settings, a field of a later version. */
function played(): Save {
  const s = defaultSave();
  s.played = true; s.name = 'Зоряна'; s.stars = 37; s.dress = '#7ec8ff';
  for (const e of [0, 0, 1, 0, 2, 0]) recordTask(s, 'add', e);
  for (const e of [0, 0, 0]) recordTask(s, 'count', e);
  s.fixed.sub = 2; s.playMinutes = { '2026-11-17': 12, '2026-11-18': 5 };
  s.hard = { n: 9, list: [{ k: 'add:8+5', l: 2, e: 2, c: 0, at: 7 }] };
  s.owned = ['wand_star']; s.gear.wand = 'wand_star'; s.achievements = { first_task: 1763400000000 };
  s.clean = { run: 2, best: 4 }; s.days = { n: 2, last: '2026-11-18' }; s.breakMin = 15; s.session = { min: 14, last: 1763400000000, quiet: 0 };
  const w = worldState(s, 'fairy');
  w.quests = { q1: 3, q2: 1 }; w.starsTaken = [1, 4]; w.flags = { chest: true }; w.pos = [3.5, -2];
  s.vol = { music: 0.1, sfx: 0.2, voice: 0.3 }; s.tier = 0; s.pinTier = 1; s.launches = 41;
  (s as unknown as Record<string, unknown>).later = { kept: [1, 2] };
  return s;
}
/** The save a device would store after loading `s`: its own settings, the rest the code's. */
const withDevice = (s: Save, device: Save) => ({ ...gameState(s), ...Object.fromEntries(DEVICE_FIELDS.map((k) => [k, device[k]])) });

describe('the save as a code (PLAY-16)', () => {
  it.each([true, false])('gives back the same save, packed: %s (R30)', async (pack) => {
    const s = played();
    const code = await toCode(s, pack);
    expect(code).toMatch(pack ? /^amw1z\.[\w-]+\.[0-9a-f]{8}$/ : /^amw1\.[\w-]+\.[0-9a-f]{8}$/);
    const r = await fromCode(code);
    expect(r).toEqual({ ok: true, save: gameState(s) });
    // spaces and line breaks of a messenger change nothing
    expect(await fromCode(`  ${code.slice(0, 20)}\n${code.slice(20)} `)).toEqual(r);
  });

  it('holds the state of the game only: no graphics tier, volumes, launches or session (R60)', async () => {
    const s = played();
    const r = await fromCode(await toCode(s));
    if (!r.ok) throw new Error(r.reason);
    for (const k of ['tier', 'pinTier', 'vol', 'launches', 'session']) expect(r.save).not.toHaveProperty(k);
    expect(r.save).toMatchObject({ name: 'Зоряна', stars: 37, later: { kept: [1, 2] }, worlds: { fairy: { quests: { q1: 3, q2: 1 } } } });
  });

  it('refuses an empty, a foreign, a damaged code and one with no save in it', async () => {
    const code = await toCode(played());
    expect(await fromCode('  \n')).toEqual({ ok: false, reason: 'empty' });
    expect(await fromCode('hello world')).toEqual({ ok: false, reason: 'foreign' });
    expect(await fromCode(`xyz1${code.slice(5)}`)).toEqual({ ok: false, reason: 'foreign' });
    // every single changed sign of the payload and of the sum is refused
    const at = [6, 7, Math.floor(code.length / 2), code.length - 10, code.length - 1];
    for (const i of at) {
      const c = code[i] === 'A' ? 'B' : 'A';
      expect(await fromCode(code.slice(0, i) + c + code.slice(i + 1)), `sign ${i}`).toEqual({ ok: false, reason: 'damaged' });
    }
    expect(await fromCode(code.slice(0, -12) + code.slice(-9))).toEqual({ ok: false, reason: 'damaged' });
    // a right sum over a payload that is no packed JSON
    const junk = 'amw1z.bm90LWRlZmxhdGU';
    expect(await fromCode(`${junk}.${checksum(junk)}`)).toEqual({ ok: false, reason: 'damaged' });
    const plain = (json: string) => { const p = `amw1.${btoa(json).replace(/=+$/, '')}`; return `${p}.${checksum(p)}`; };
    for (const json of ['[1,2]', '{"stars":3}', '{"v":0}', '{"v":2.5}', '"v"']) expect(await fromCode(plain(json)), json).toEqual({ ok: false, reason: 'nosave' });
  });

  it('loads a code over the save: the device keeps its settings, the save replaced is kept, loadSave reads the same save', async () => {
    const here = defaultSave(); here.stars = 3; here.name = 'Зоряна'; here.vol = { music: 0.9, sfx: 0.9, voice: 0.9 }; here.tier = 1; here.launches = 7;
    storeSave(here);
    const s = played();
    expect((await loadCode(here, await toCode(s))).ok).toBe(true);
    expect(JSON.parse(storage.getItem(PREV)!)).toEqual(here);
    expect(JSON.parse(storage.getItem(BEFORE_CODE)!)).toEqual(here);
    // the game's writing on the way out (pagehide) does not put the old save back before the reload
    storeSave(here);
    const loaded = loadSave();
    expect(loaded).toEqual(withDevice(s, here));
    // the copy of the save replaced outlives the next launch (loadSave writes prev over)
    expect(JSON.parse(storage.getItem(BEFORE_CODE)!)).toEqual(here);
  });

  it('keeps the backups that were there (amw-save-v3 of an earlier move)', async () => {
    storage.setItem('amw-save-v3', '{"v":3,"stars":1}');
    expect((await loadCode(defaultSave(), await toCode(played()))).ok).toBe(true);
    expect(storage.getItem('amw-save-v3')).toBe('{"v":3,"stars":1}');
  });

  it('moves a code of an older save up the way loadSave moves a stored one (v3: logic split, difficulty fixed)', async () => {
    const v3 = { v: 3, played: true, name: 'Зоряна', stars: 5, difficulty: 2,
      skills: { count: { level: 2, streak: 0, tasks: 4, first: 3, errors: 1 }, logic: { level: 3, streak: 1, tasks: 6, first: 5, errors: 1 } },
      worlds: { fairy: { quests: { q1: 3 }, final: false, starsTaken: [2], flags: {}, pos: null } } };
    expect((await loadCode(defaultSave(), await toCode(v3))).ok).toBe(true);
    const s = loadSave();
    expect(s.v).toBe(4);
    expect(s.skills.series).toEqual({ level: 3, streak: 1, tasks: 6, first: 5, errors: 1 });
    expect(s.skills).not.toHaveProperty('logic');
    expect(s.fixed.add).toBe(2);
    expect(storage.getItem('amw-save-v3')).not.toBeNull();
  });

  it('refuses a cut code, a code far too long and a packed code in a browser that cannot unpack - each with its own reason', async () => {
    const code = await toCode(played());
    const [prefix, payload] = code.split('.');
    // cut in half: with its old sum, and with a sum made anew for the cut text (a copy that lost its end)
    const half = `${prefix}.${payload.slice(0, payload.length >> 1)}`;
    expect(await fromCode(`${half}.${code.split('.')[2]}`)).toEqual({ ok: false, reason: 'damaged' });
    expect(await fromCode(`${half}.${checksum(half)}`)).toEqual({ ok: false, reason: 'damaged' });
    expect(await fromCode(code.slice(0, code.length >> 1))).toEqual({ ok: false, reason: 'foreign' });
    expect(await fromCode('a'.repeat(CODE_MAX + 1))).toEqual({ ok: false, reason: 'toolong' });
    expect(await fromCode(`${code}${' '.repeat(10)}`)).toEqual(await fromCode(code));
    vi.stubGlobal('CompressionStream', undefined); vi.stubGlobal('DecompressionStream', undefined);
    expect(await fromCode(code)).toEqual({ ok: false, reason: 'unpack' });
    // the same browser makes a code it can read itself: not packed
    const plain = await toCode(played());
    expect(plain.startsWith('amw1.')).toBe(true);
    expect(await fromCode(plain)).toEqual({ ok: true, save: gameState(played()) });
  });

  it('a save of a later version and fields this version does not know go through the code and the reload as they are', async () => {
    const later = { ...played(), v: 99, unknownTop: { a: [1, 2] } } as unknown as Save;
    worldState(later, 'fairy').flags.someLaterMark = true;
    const here = defaultSave(); storeSave(here);
    expect((await loadCode(here, await toCode(later))).ok).toBe(true);
    const s = loadSave() as unknown as Record<string, unknown>;
    expect([s.v, s.stars, s.unknownTop, (s.worlds as Record<string, { flags: Record<string, boolean> }>).fairy.flags.someLaterMark]).toEqual([99, 37, { a: [1, 2] }, true]);
  });

  it('a code loaded, then the page leaves (pagehide writes the old save), then the reload: the new progress, the old one in before-code', async () => {
    const here = defaultSave(); here.stars = 5; here.name = 'Зоряна'; storeSave(here);
    const code = await toCode(played());
    expect((await loadCode(here, code)).ok).toBe(true);
    storeSave(here);                       // the game's pagehide: held back since the code was written
    const s = loadSave();
    expect(s.stars).toBe(37);
    expect(JSON.parse(storage.getItem(BEFORE_CODE)!).stars).toBe(5);
  });

  it('the way back: the game a code replaced comes back, the one replaced takes its place; twice is as after the code; start again clears it', async () => {
    const here = defaultSave(); here.stars = 5; here.vol = { music: 0.4, sfx: 0.4, voice: 0.4 }; storeSave(here);
    expect(hasBefore()).toBe(false);
    expect(restoreBefore(here)).toEqual({ ok: false, reason: 'nosave' });
    expect((await loadCode(here, await toCode(played()))).ok).toBe(true);
    expect(hasBefore()).toBe(true);
    const loaded = loadSave();
    expect(loaded.stars).toBe(37);
    // back: the save before the code, the device's settings kept; the code's game is now the one kept
    expect(restoreBefore(loaded).ok).toBe(true);
    storeSave(loaded);                     // pagehide on the way out changes nothing
    const back = loadSave();
    expect([back.stars, back.vol]).toEqual([5, { music: 0.4, sfx: 0.4, voice: 0.4 }]);
    expect(JSON.parse(storage.getItem(BEFORE_CODE)!).stars).toBe(37);
    // back twice: as after the code
    expect(restoreBefore(back).ok).toBe(true);
    expect(loadSave().stars).toBe(37);
    expect(JSON.parse(storage.getItem(BEFORE_CODE)!).stars).toBe(5);
    // a damaged copy is refused and changes nothing; "start again" removes it
    storage.setItem(BEFORE_CODE, '{"stars":1}');
    const keys = new Map(storage.data);
    expect(restoreBefore(loadSave())).toEqual({ ok: false, reason: 'nosave' });
    expect(storage.data.get('amw-save')).toBe(keys.get('amw-save'));
    clearSave();
    expect(hasBefore()).toBe(false);
  });

  it('changes nothing for a refused code', async () => {
    const here = played(); storeSave(here);
    const before = new Map(storage.data);
    const code = await toCode(played());
    expect(await loadCode(here, code.slice(0, -1) + (code.endsWith('0') ? '1' : '0'))).toEqual({ ok: false, reason: 'damaged' });
    expect(storage.data).toEqual(before);
    storeSave({ ...here, stars: 99 });    // the game still saves: nothing holds its writes back
    expect(JSON.parse(storage.getItem(KEY)!).stars).toBe(99);
  });
});

// ---------- the parents' section: the view of the code ----------

const IDS = ['book', 'parents', 'btnBook', 'bookClose', 'btnParents', 'btnShop', 'colTitle', 'shards', 'colStats', 'gate', 'pBody', 'pTitle', 'gateQ', 'parentsClose'];
describe('the code in the parents\' section (PLAY-16)', () => {
  const g = globalThis as Record<string, unknown>;
  beforeAll(() => { g.__BUILD_DATE__ = '2026-11-18'; g.__BUILD_COMMIT__ = 'abc1234'; });

  async function open(save: Save) {
    document.body.innerHTML = IDS.map((id) => `<div id="${id}"></div>`).join('') + '<input id="gateA">';
    const { initBook } = await import('../ui/ui');
    initBook(save, { parts: () => [], stats: () => [] }, { change() {}, reset() {}, open() {}, shop() {} });
    document.getElementById('btnParents')!.click();
    const [, a, b] = /(\d+) × (\d+)/.exec(document.getElementById('gateQ')!.textContent!)!.map(Number);
    const gateA = document.getElementById('gateA') as HTMLInputElement;
    gateA.value = String(a * b); gateA.dispatchEvent(new Event('input'));
    document.getElementById('pCode')!.click();
    const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    // a tap starts async work (packing, the clipboard): give it time to end
    const tap = async (id: string) => { $(id).click(); await new Promise((r) => setTimeout(r, 50)); };
    const paste = (text: string) => { const i = $<HTMLTextAreaElement>('pCodeIn'); i.value = text; i.dispatchEvent(new Event('input')); };
    return { $, tap, paste };
  }

  it('copies the code at the tap only, and shows it', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const s = played();
    const { $, tap } = await open(s);
    expect(writeText).not.toHaveBeenCalled();
    expect($<HTMLTextAreaElement>('pCodeOut').value).toBe('');
    await tap('pCodeCopy');
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const code = $<HTMLTextAreaElement>('pCodeOut').value;
    expect(writeText).toHaveBeenCalledWith(code);
    expect(await fromCode(code)).toEqual({ ok: true, save: gameState(s) });
    expect($('pCodeMsg').textContent).toBe('Код скопійовано.');
  });

  it('a damaged code: a clear message at the first tap, no confirmation, the save untouched', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    const here = played(); storeSave(here);
    const before = new Map(storage.data);
    const { $, tap, paste } = await open(here);
    const code = await toCode(defaultSave());
    paste(code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11));
    await tap('pCodeLoad');
    await vi.waitFor(() => expect($('pCodeMsg').textContent).toBe('Код пошкоджено. Скопіюй його ще раз, повністю.'));
    expect($('pCodeLoad').textContent).toBe('Завантажити');
    await tap('pCodeLoad');
    expect(storage.data).toEqual(before);
    expect(reload).not.toHaveBeenCalled();
    paste('');
    await tap('pCodeLoad');
    await vi.waitFor(() => expect($('pCodeMsg').textContent).toBe('Спочатку встав код у поле.'));
  });

  it('a good code: asks once more, then writes it through loadCode and reloads', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    const here = defaultSave(); here.stars = 2; storeSave(here);
    const { $, tap, paste } = await open(here);
    const s = played();
    paste(await toCode(s));
    await tap('pCodeLoad');
    await vi.waitFor(() => expect($('pCodeLoad').textContent).toBe('Замінити гру на цьому пристрої? Натисни ще раз.'));
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual(here);
    await tap('pCodeLoad');
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(JSON.parse(storage.getItem(PREV)!)).toEqual(here);
    expect(loadSave()).toEqual(withDevice(s, here));
  });
});
