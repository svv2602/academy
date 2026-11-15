/**
 * Versioned local save (ARCH-07). Bump SAVE_VERSION and migrate in loadSave() when the shape changes.
 * Version 3: the part every world shares lies flat on top (the look, stars, skills, purchases, achievements,
 * settings); the progress of each world is a WorldState of its own under `worlds[<world id>]`.
 * Fields this code does not know (written by a later version) are kept on every level and written back as they are.
 */
import { isTier, type Tier } from './quality';
export type SkillId = 'count' | 'add' | 'sub' | 'compare' | 'logic';
export interface SkillStat { level: number; streak: number; tasks: number; first: number; errors: number; }
/** One world's progress. The names are those of version 2 (tools/shot.mjs reads them under `worlds.fairy`). */
export interface WorldState {
  quests: Record<string, number>;   // steps finished per quest (3 = shard received)
  final: boolean;                   // the world's artifact is restored (the Crystal of Light)
  starsTaken: number[];             // ids of collected world stars
  chestOpen: boolean;
  pos: [number, number] | null;     // where the heroine stood
}
export interface Save {
  v: number;                    // SAVE_VERSION; a save of a later version keeps its number (it is never lowered)
  played: boolean;
  name: string;                 // how the cat addresses the child; never leaves the device
  dress: string; hair: string; hairStyle: 'long' | 'buns' | 'simpleparted'; wings: boolean;
  stars: number;
  skills: Record<SkillId, SkillStat>;
  owned: string[];                  // purchases (PLAY-04): none yet
  achievements: Record<string, number>;   // PLAY-08: none yet
  difficulty: 0 | 1 | 2 | 3;        // 0 = adaptive, otherwise fixed by the parent
  vol: { music: number; sfx: number; voice: number };
  // Graphics quality (TECH-04); a save without them gets the defaults.
  tier: Tier;                       // the tier the session runs on now, the next launch starts from it
  launches: number;                 // page loads counted so far: every tenth tries a tier higher
  pinTier: Tier | null;             // fixed by the parent; null = automatic
  /** The progress of every world played, by world id; a world gets its state on first use (worldState). */
  worlds: Record<string, WorldState>;
}

export const SAVE_VERSION = 3;
const KEY = 'amw-save';
const SKILLS: SkillId[] = ['count', 'add', 'sub', 'compare', 'logic'];
/** Saves of versions 1 and 2 knew one world: their progress belongs to it. */
const FIRST_WORLD = 'fairy';
/** The fields of a version 2 save that are a world's progress; the rest of it is the shared part. */
const WORLD_FIELDS = ['quests', 'final', 'starsTaken', 'chestOpen', 'pos'] as const;

export function defaultSave(): Save {
  return {
    v: SAVE_VERSION, played: false, name: '', dress: '#ff7eb6', hair: '#8a5a3a', hairStyle: 'long', wings: true,
    stars: 0,
    skills: Object.fromEntries(SKILLS.map((s) => [s, { level: 1, streak: 0, tasks: 0, first: 0, errors: 0 }])) as Save['skills'],
    owned: [], achievements: {},
    difficulty: 0, vol: { music: 0.5, sfx: 0.8, voice: 1 },
    tier: 2, launches: 0, pinTier: null,
    worlds: {},
  };
}

/** The progress of a world nobody has played yet. */
export function defaultWorld(): WorldState {
  return { quests: {}, final: false, starsTaken: [], chestOpen: false, pos: null };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
/** A stored object to spread over its defaults; anything else adds nothing. */
const part = (x: unknown): Record<string, unknown> => (isObject(x) ? x : {});

/**
 * The state of world `id` in the save, created on first use. A stored state missing a field gets it from
 * defaultWorld() in place, so the same object is returned every time (g.ws holds it for the whole session)
 * and the fields it does not know stay in it.
 */
export function worldState(s: Save, id: string): WorldState {
  const fresh = defaultWorld();
  const w = isObject(s.worlds[id]) ? s.worlds[id] : (s.worlds[id] = fresh);
  for (const k of WORLD_FIELDS) {
    if (w[k] === undefined || (w[k] === null && fresh[k] !== null)) (w as unknown as Record<string, unknown>)[k] = fresh[k];
  }
  return w;
}

/*
 * Backups (TECH-11), each the stored text as it was:
 * - `amw-save-v<N>`: a save of version N before it is moved to this version; written once, never over an existing one;
 * - `amw-save-prev`: the save read without an error at the last launch (copied by loadSave, before the game writes);
 * - `amw-save-damaged`: a save that could not be read, before the game writes over it.
 * A save that cannot be read is restored from `prev`, then from `v<N>`, the newest version first. No save at all is
 * not an error: it is a new player, or "start again" (clearSave removes the backups too).
 */
const PREV = `${KEY}-prev`;
const DAMAGED = `${KEY}-damaged`;
const versionKey = (v: number) => `${KEY}-v${v}`;
/** Where a save that cannot be read is restored from, in this order: prev, then v2, v1. */
const RESTORE_FROM = [PREV, ...Array.from({ length: SAVE_VERSION - 1 }, (_, i) => versionKey(SAVE_VERSION - 1 - i))];

/** Writes a backup; a full or refused storage must not keep the game from loading. */
function keep(key: string, text: string) {
  try { localStorage.setItem(key, text); } catch { /* storage unavailable */ }
}

/** A save as stored, of any version: its fields hold whatever the text holds. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Stored = { v: number; [field: string]: any };

/** The stored save behind a text, or null when it cannot be read: no JSON, or not an object with a numeric version. */
function parse(text: string): Stored | null {
  try {
    const s: unknown = JSON.parse(text);
    return isObject(s) && typeof s.v === 'number' ? s as Stored : null;
  } catch { return null; }
}

export function loadSave(): Save {
  cleared = false;
  const d = defaultSave();
  try {
    const text = localStorage.getItem(KEY);
    if (text === null) return d;      // a new player, or "start again": the backups are not used
    const s = parse(text);
    if (s) {
      const out = fromStored(s, d);
      if (out) {
        keep(PREV, text);
        try {
          if (s.v < SAVE_VERSION && localStorage.getItem(versionKey(s.v)) === null) keep(versionKey(s.v), text);
        } catch { /* storage unavailable */ }
      }
      return out ?? d;
    }
    keep(DAMAGED, text);
    for (const key of RESTORE_FROM) {
      const backup = localStorage.getItem(key);
      const b = backup === null ? null : parse(backup);
      const out = b && fromStored(b, d);
      if (out) return out;
    }
  } catch { /* private mode: start fresh */ }
  return d;
}

/** The save of this version a stored save holds; null for a version this code does not read (the game starts fresh). */
function fromStored(s: Stored, d: Save): Save | null {
  let out: Save | null = null;
  if (s.v >= SAVE_VERSION) {
    // v3 and later: whatever is stored wins over the defaults, a later version keeps its number, and the worlds
    // (the ones of this version and any other) stay as they are; worldState fills a played world's gaps.
    out = { ...d, ...s, skills: { ...d.skills, ...part(s.skills) }, vol: { ...d.vol, ...part(s.vol) },
      worlds: isObject(s.worlds) ? s.worlds : {} } as Save;
  } else if (s.v === 2) {
    // v2: the world's progress moves from the top into worlds.fairy, the rest (and any field this code does not know)
    // stays on top.
    const common = { ...s };
    const world: Record<string, unknown> = {};
    for (const k of WORLD_FIELDS) { if (k in common) world[k] = common[k]; delete common[k]; }
    out = { ...d, ...common, v: SAVE_VERSION, skills: { ...d.skills, ...part(common.skills) }, vol: { ...d.vol, ...part(common.vol) },
      worlds: { [FIRST_WORLD]: { ...defaultWorld(), ...world } } } as Save;
  }
  if (out) {
    // A damaged quality field must not switch the automatic lowering off (main.ts lowers only with pinTier null).
    if (!isTier(out.tier)) out.tier = d.tier;
    if (out.pinTier !== null && !isTier(out.pinTier)) out.pinTier = null;
    return out;
  }
  // v1 (the one-quest slice): keep who the child is, restart the story.
  if (s.v === 1) return { ...d, name: s.name ?? '', dress: s.dress ?? d.dress, hair: s.hair ?? d.hair, hairStyle: s.hairStyle ?? d.hairStyle };
  return null;
}

/**
 * Set by clearSave, until the next loadSave. "Start again" clears the save and reloads the page, and the game saves
 * itself on the way out (pagehide, a hidden page): without this the reload wrote the old progress straight back.
 */
let cleared = false;

export function storeSave(s: Save) {
  if (cleared) return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
/**
 * Forgets the save and every backup of it ("amw-save*"), so that no later read error brings the old progress back;
 * nothing is stored again until the game is loaded anew (the caller reloads the page).
 */
export function clearSave() {
  cleared = true;
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  try {
    const backups: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null && k.startsWith(`${KEY}-`)) backups.push(k);
    }
    for (const k of backups) localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}

/** Difficulty for the next task of a skill: fixed by the parent, or the adaptive level. */
export function levelFor(s: Save, skill: SkillId) { return s.difficulty || s.skills[skill].level; }

/**
 * Adaptive difficulty: two clean solves in a row step the level up; a task that needed two or more
 * corrections (or two shaky ones in a row) steps it down. The child never sees a "level".
 */
export function recordTask(s: Save, skill: SkillId, wrong: number) {
  const k = s.skills[skill];
  k.tasks++; k.errors += wrong;
  if (wrong === 0) {
    k.first++; k.streak = Math.max(1, k.streak + 1);
    if (k.streak >= 2 && k.level < 3) { k.level++; k.streak = 0; }
  } else {
    k.streak = Math.min(-1, k.streak - 1);
    if ((wrong >= 2 || k.streak <= -2) && k.level > 1) { k.level--; k.streak = 0; }
  }
}
