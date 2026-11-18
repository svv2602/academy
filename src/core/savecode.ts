/**
 * The save as a text code (PLAY-16): the parents' section shows it to copy, and loads one pasted on another device.
 * The code holds the state of the game only (R60): the settings of the device - the graphics tier (`tier`, `pinTier`),
 * the volumes (`vol`) and the count of launches (`launches`) - stay out of it, and a loaded code keeps the device's own.
 *
 * The shape: `amw1z.<payload>.<sum>` - the save's JSON packed with deflate-raw (CompressionStream: built into the
 * browser, no network) in base64url - or `amw1.<payload>.<sum>`, the JSON unpacked, where the browser cannot pack.
 * `<sum>` is FNV-1a of the prefix and payload, 8 hex digits: one changed sign of a code copied by hand is refused.
 *
 * Loading writes the code's save to amw-save and the caller reloads the page: loadSave reads it as any stored save, so
 * an older version is moved up and a damaged field mended there (TECH-11), and the save it replaces is kept first.
 * Nothing here leaves the device: no network; the clipboard is written only at an adult's tap (ui.ts).
 */
import { clearSave, type Save } from './save';

/** The fields of a save that belong to the device, not to the game (R60): never put into a code. */
export const DEVICE_FIELDS = ['tier', 'pinTier', 'vol', 'launches'] as const;

const PACKED = 'amw1z';
const PLAIN = 'amw1';
const KEY = 'amw-save';
const PREV = `${KEY}-prev`;
/**
 * The save a code replaced. amw-save-prev gets it too, but loadSave writes over prev at the very next launch (it keeps
 * the save read then: the code's); this one stays until "start again" (clearSave removes every amw-save*).
 */
export const BEFORE_CODE = `${KEY}-before-code`;

/** Why a code was refused: nothing pasted; not a code of this game; a damaged one; a code with no save in it; the storage refused it. */
export type Refusal = 'empty' | 'toolong' | 'foreign' | 'damaged' | 'unpack' | 'nosave' | 'storage';
/**
 * The longest code read (signs, spaces left out). A save of a whole game packs to a few kilobytes; a text far longer is
 * not a code of this game (a paste of something else), and is refused before any work on it.
 */
export const CODE_MAX = 200_000;
export type CodeResult = { ok: true; save: Record<string, unknown> } | { ok: false; reason: Refusal };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** FNV-1a (32 bit) of a text, 8 hex digits. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The bytes through a (de)compression stream. */
async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const canPack = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** The state of the game a save holds: the save without the settings of the device (fields it does not know stay). */
export function gameState(save: Save | Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...save };
  for (const k of DEVICE_FIELDS) delete out[k];
  return out;
}

/** The code of a save: its state of the game only. */
export async function toCode(save: Save | Record<string, unknown>, pack = canPack()): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(gameState(save)));
  const prefix = pack ? PACKED : PLAIN;
  const payload = toBase64Url(pack ? await through(bytes, new CompressionStream('deflate-raw')) : bytes);
  return `${prefix}.${payload}.${checksum(`${prefix}.${payload}`)}`;
}

/**
 * The save a code holds, or why it is refused. Spaces and line breaks (a code wrapped by a messenger) are ignored.
 * The save is checked as loadSave's own reading does - a JSON object with a version it reads (a whole number, 1 or
 * more) -; the rest (the move of an older version, a damaged field) is loadSave's after the reload.
 */
export async function fromCode(text: string): Promise<CodeResult> {
  if (text.length > CODE_MAX * 2) return { ok: false, reason: 'toolong' };
  const code = text.replace(/\s+/g, '');
  if (!code) return { ok: false, reason: 'empty' };
  if (code.length > CODE_MAX) return { ok: false, reason: 'toolong' };
  const parts = code.split('.');
  if (parts.length !== 3 || (parts[0] !== PACKED && parts[0] !== PLAIN)) return { ok: false, reason: 'foreign' };
  const [prefix, payload, sum] = parts;
  if (checksum(`${prefix}.${payload}`) !== sum.toLowerCase()) return { ok: false, reason: 'damaged' };
  let s: unknown;
  try {
    const bytes = fromBase64Url(payload);
    // A packed code in a browser that cannot unpack (an old WebView): the code is whole, the browser is not - say so.
    if (prefix === PACKED && !canPack()) return { ok: false, reason: 'unpack' };
    const json = new TextDecoder('utf-8', { fatal: true })
      .decode(prefix === PACKED ? await through(bytes, new DecompressionStream('deflate-raw')) : bytes);
    s = JSON.parse(json);
  } catch { return { ok: false, reason: 'damaged' }; }
  if (!isObject(s) || !Number.isInteger(s.v) || (s.v as number) < 1) return { ok: false, reason: 'nosave' };
  return { ok: true, save: gameState(s) };
}

/**
 * Loads a code over the current save `now` (the one in memory, fresher than the stored text): checks it, keeps `now`
 * in amw-save-prev and amw-save-before-code, writes the code's save with the device's own settings to amw-save. The
 * caller reloads the page. clearSave() first: it stops the game writing the save in memory back on the way out
 * (pagehide) - it removes the backups too, so they are taken before and written back. A refused code changes nothing.
 */
/**
 * Writes `text` (a save's JSON) as the save the next launch reads, keeping `old` - the save in memory - as amw-save-prev
 * and amw-save-before-code: the way back. clearSave() first, so that the game does not write `old` back on its way out
 * (pagehide); the backups it removes are taken before and written back. False: the storage refused, `old` is put back.
 */
function writeOver(old: string, text: string): boolean {
  try { localStorage.setItem(BEFORE_CODE, old); } catch { return false; }
  try {
    const backups: [string, string][] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = k === null || k === KEY || k === BEFORE_CODE || !k.startsWith(`${KEY}-`) ? null : localStorage.getItem(k);
      if (k !== null && v !== null) backups.push([k, v]);
    }
    clearSave();
    for (const [k, v] of backups) localStorage.setItem(k, v);
    localStorage.setItem(BEFORE_CODE, old);
    localStorage.setItem(PREV, old);
    localStorage.setItem(KEY, text);
    return true;
  } catch {
    // A full or refused storage: the save in memory is put back, so the reload loses nothing.
    try { localStorage.setItem(KEY, old); } catch { /* storage unavailable */ }
    return false;
  }
}

/** Whether a game replaced by a code can be given back (the parents' section shows its button then). */
export function hasBefore(): boolean {
  try { return localStorage.getItem(BEFORE_CODE) !== null; } catch { return false; }
}

/**
 * Gives back the game a code replaced: the save of amw-save-before-code becomes the save, with the device's own
 * settings, and the save now in memory takes its place there - so a second time gives this one back again. The caller
 * reloads the page; a stored copy that is not a save is refused and changes nothing.
 */
export function restoreBefore(now: Save): CodeResult {
  let s: unknown;
  try { s = JSON.parse(localStorage.getItem(BEFORE_CODE) ?? 'null'); } catch { s = null; }
  if (!isObject(s) || !Number.isInteger(s.v) || (s.v as number) < 1) return { ok: false, reason: 'nosave' };
  const device = Object.fromEntries(DEVICE_FIELDS.map((k) => [k, now[k]]));
  const save = { ...gameState(s), ...device };
  return writeOver(JSON.stringify(now), JSON.stringify(save)) ? { ok: true, save } : { ok: false, reason: 'storage' };
}

export async function loadCode(now: Save, text: string): Promise<CodeResult> {
  const r = await fromCode(text);
  if (!r.ok) return r;
  const device = Object.fromEntries(DEVICE_FIELDS.map((k) => [k, now[k]]));
  if (!writeOver(JSON.stringify(now), JSON.stringify({ ...r.save, ...device }))) return { ok: false, reason: 'storage' };
  return r;
}
