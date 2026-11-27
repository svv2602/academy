/**
 * The voice of English (idea/proposal/season2-step2-plan-2026-11-27, part B): the clips of src/s2/strings-en.ts from the
 * lazy bank `en/` (public/en/), the way src/core/voice.ts plays the bank of the old game (VOICE-07, `sayBank`). The bank
 * is not part of the first load: a clip is fetched when first asked for and the service worker keeps it (vite.config.ts,
 * `runtimeCaching`, the cache "en").
 * - An English line is never handed to the device's synthesizer: it speaks Ukrainian. A line without its clip, or a clip
 *   that cannot come (no network and not kept), is silence; with `?debug` a clip that is not recorded, or fails to load,
 *   is written to the console (`en clip missing: <id>`), which the e2e catches.
 * - `say(['wb_find', 'wb_w_owl'])` - the frame and the word apart (R17): the clips one after the other, PAUSE_MS between.
 * - A set of variants (`variant_of` of the list) is said by the name it shares: one of them at random, never the one said
 *   last time (R24).
 * - A new `say` cuts the one that sounds off; its promise settles at once. The Ukrainian voice (src/core/voice.ts) is a
 *   queue of its own: whoever says an English clip after a Ukrainian line awaits that line first.
 * src/core/audio.ts installs it with the sound (`installEnVoice`); until then `enVoice()` of src/s2/types.ts is silent.
 */
import CLIPS from './clips-en.json';
import { VARIANTS } from '../s2/strings-en';
import { setEnVoice, type EnVoice } from '../s2/types';

/** The recorded clips (`en/<name>.mp3`): tools/gen_voice.py `--en` rewrites the list, a test holds it to public/en/. */
const recorded = new Set<string>(CLIPS);
/** The pause between the clips of one `say` (R17: the frame, then the word apart). */
export const PAUSE_MS = 300;
/** How long the first download of a clip may take before it is given up (silence). */
const WAIT_MS = 4000;
/** No clip ends later than this: a clip that never says it ended does not hold its caller. */
const SAFETY_MS = 15000;

/** What the voice of English did in this session: clips that started to sound, ids that had no clip to play. */
export const enLog = { clips: 0, missing: [] as string[] };

let level = () => 1;
let debug = false;
let random = Math.random;
/** The variant of each set said last, so that the next is another one. */
const lastOf = new Map<string, string>();
/** The clip that sounds now and how to end its `say`. */
let current: HTMLAudioElement | null = null;
let cut: (() => void) | null = null;
/** The page is hidden: the clip waits paused. */
let hidden = false;

/** The variant of `set` to say: a recorded one at random, not the one said last (when there is another). */
export function pick(set: string): string | null {
  const all = (VARIANTS.get(set) ?? []).filter((v) => recorded.has(v));
  const fresh = all.length > 1 ? all.filter((v) => v !== lastOf.get(set)) : all;
  if (!fresh.length) return null;
  const v = fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))];
  lastOf.set(set, v);
  return v;
}

/** Is there a clip to say `id` with: a recorded line, or a set with a recorded variant. */
export function hasEn(id: string): boolean {
  return VARIANTS.has(id) ? (VARIANTS.get(id) ?? []).some((v) => recorded.has(v)) : recorded.has(id);
}

const urlOf = (name: string) => new URL(`${import.meta.env.BASE_URL}en/${name}.mp3`, location.href).href;

/**
 * Is the clip there to play? Online it is downloaded first with a plain request, answered in full, which the service
 * worker keeps (the player asks for byte ranges, and a partial answer is not kept). Without network only a clip kept
 * before counts, and nothing is asked for.
 */
async function ready(url: string): Promise<boolean> {
  try {
    if (navigator.onLine === false) return 'caches' in window && (await caches.match(url)) !== undefined;
    const late = new Promise<null>((resolve) => { setTimeout(() => resolve(null), WAIT_MS); });
    const r = await Promise.race([fetch(url), late]);
    return r !== null && r.ok;
  } catch { return false; }
}

function missing(id: string, why: string) {
  enLog.missing.push(id);
  if (debug) console.error(`en clip missing: ${id} (${why})`);
}

/** Plays one clip of `id` (a line or a set of variants); resolves when it ends, fails, or is cut off. */
function playOne(id: string, live: () => boolean): Promise<void> {
  const name = VARIANTS.has(id) ? pick(id) : recorded.has(id) ? id : null;
  if (name === null) { missing(id, 'not recorded'); return Promise.resolve(); }
  const url = urlOf(name);
  return ready(url).then((ok) => new Promise<void>((resolve) => {
    if (!live()) { resolve(); return; }
    if (!ok) {
      // without network a clip not kept yet is plain silence; online one that does not come is trouble
      if (navigator.onLine !== false) missing(id, 'failed to load');
      resolve();
      return;
    }
    const a = new Audio(url);
    a.volume = level();
    let over = false;
    const end = () => {
      if (over) return;
      over = true;
      a.onplaying = null; a.onended = null; a.onerror = null;
      if (current === a) { current = null; cut = null; }
      resolve();
    };
    current = a;
    cut = () => { a.pause(); end(); };
    a.onplaying = () => { enLog.clips++; };
    a.onended = end;
    a.onerror = () => { missing(id, `error ${a.error?.code ?? ''}`.trim()); end(); };
    if (!hidden) a.play().catch(() => { if (!hidden) end(); });
    setTimeout(end, SAFETY_MS);
  }));
}

let said = 0;
/** Settles the `say` that sounds now (its download or its pause may still be running). */
let endSay: (() => void) | null = null;
/** Says the clips of `ids` one after the other, PAUSE_MS between them; cuts off whatever English sounds now. */
export function sayEn(ids: string | readonly string[]): Promise<void> {
  stopEn();
  const mine = ++said;
  const live = () => said === mine;
  const list = typeof ids === 'string' ? [ids] : [...ids];
  const stopped = new Promise<void>((resolve) => { endSay = resolve; });
  const run = (async () => {
    for (const [i, id] of list.entries()) {
      if (!live()) return;
      if (i > 0) await new Promise<void>((resolve) => { setTimeout(resolve, PAUSE_MS); });
      if (!live()) return;
      await playOne(id, live);
    }
  })();
  return Promise.race([run, stopped]).finally(() => { if (live()) endSay = null; });
}

/** Stops the English that sounds now; the `say` it belongs to settles at once. */
export function stopEn() {
  said++;
  const c = cut, e = endSay;
  cut = null; endSay = null;
  c?.();
  e?.();
}

/** The voice of English as src/s2/types.ts `EnVoice` describes it. */
export const englishVoice: EnVoice = { say: sayEn, has: hasEn };

/**
 * Sets the voice of English (src/core/audio.ts, when the sound is first loaded): its volume is the voice's
 * (`volume.voice`, from the save); `debug` - by default the page's `?debug` (and the dev server) - writes a clip that is
 * missing to the console.
 */
export function installEnVoice(o: { volume: () => number; debug?: boolean }) {
  level = o.volume;
  debug = o.debug ?? (import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')));
  setEnVoice(englishVoice);
}

/** The page is hidden, or its picture lost (src/core/audio.ts `hide`): the English clip pauses where it is. */
export function pauseEn() { hidden = true; current?.pause(); }
/** Shown again (src/core/audio.ts `show`): it plays on from the same place. */
export function resumeEn() {
  if (!hidden) return;
  hidden = false;
  current?.play().catch(() => { /* its safety timer ends the clip */ });
}

/** For the tests: the random source of `pick`, and a fresh start (no variant said yet, nothing sounding). */
export function resetEnForTest(r: () => number = Math.random) {
  random = r;
  lastOf.clear();
  stopEn();
  enLog.clips = 0;
  enLog.missing.length = 0;
  hidden = false;
}
