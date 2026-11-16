/**
 * Versioned local save (ARCH-07). Bump SAVE_VERSION and migrate in loadSave() when the shape changes.
 * Version 3: the part every world shares lies flat on top (the look, stars, skills, purchases, achievements,
 * settings); the progress of each world is a WorldState of its own under `worlds[<world id>]`.
 * Fields this code does not know (written by a later version) are kept on every level and written back as they are.
 */
import { isTier, type Tier } from './quality';
/**
 * One world's progress. The names are those of version 2 (tools/shot.mjs reads them under `worlds.fairy`), but for
 * the chest of the first world: a secret of any world is a flag of its own in `flags`.
 */
export interface WorldState {
  quests: Record<string, number>;   // steps finished per quest (3 = shard received)
  final: boolean;                   // the world's artifact is restored (the Crystal of Light)
  starsTaken: number[];             // ids of collected world stars
  flags: Record<string, boolean>;   // the world's own one-off things by its names (the first world: `chest` is open)
  pos: [number, number] | null;     // where the heroine stood
}
export interface Save {
  v: number;                    // SAVE_VERSION; a save of a later version keeps its number (it is never lowered)
  played: boolean;
  name: string;                 // how the cat addresses the child; never leaves the device
  // A hairstyle of an older save stays in it, unread (TECH-14). `wings` (version 1 to 3) is unread too and written back
  // as it is: whether she wears wings, and which, is `gear.wings`.
  dress: string; hair: string; wings: boolean;
  stars: number;
  /** The counters of every skill by its id; the skills and the rule that moves the counters: src/game/skills.ts. */
  skills: Record<string, { level: number; streak: number; tasks: number; first: number; errors: number }>;
  owned: string[];                  // the things bought in the shop (PLAY-04): kept for ever, never removed
  /** What the heroine wears, by slot (PLAY-04, PLAY-05): a thing's id of src/game/shop.ts, null = nothing there. */
  gear: Gear;
  /** The colour of her wings (PLAY-05), free like the dress and the hair: the petals take it, the butterfly a tint of it. */
  wingColor: string;
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

/**
 * The worn things. A version 3 save written before the shop has none: it gets the defaults (the petal wings she has
 * always had), and a stored one missing a slot gets that slot's default. No new version: the fields are added.
 */
export interface Gear { head: string | null; wand: string | null; wings: string | null; trail: string | null }

export const SAVE_VERSION = 3;
/** The colour the petals always had: a save written before the colour could be chosen gets it. No new version. */
export const WING_COLOR = '#d8f6ff';
const KEY = 'amw-save';
/** The skills a fresh save counts: the ids of src/game/skills.ts (save.test.ts checks that the two lists agree). */
const SKILL_IDS = ['count', 'add', 'sub', 'compare', 'logic'];
/** Saves of versions 1 and 2 knew one world: their progress belongs to it. */
const FIRST_WORLD = 'fairy';
/** The fields of a world's progress (worldState fills the ones a stored world lacks). */
const WORLD_FIELDS = ['quests', 'final', 'starsTaken', 'flags', 'pos'] as const;
/**
 * The fields of a version 1 or 2 save that are a world's progress; the rest of it is the shared part.
 * `chestOpen` (the chest of the first world) becomes the world's flag `chest`.
 */
const OLD_WORLD_FIELDS = ['quests', 'final', 'starsTaken', 'chestOpen', 'pos'] as const;
/** The flag the first world keeps its chest in; a version 1 or 2 save and an early version 3 one name it `chestOpen`. */
const CHEST_FLAG = 'chest';

export function defaultSave(): Save {
  return {
    v: SAVE_VERSION, played: false, name: '', dress: '#ff7eb6', hair: '#8a5a3a', wings: true,
    stars: 0,
    skills: Object.fromEntries(SKILL_IDS.map((s) => [s, { level: 1, streak: 0, tasks: 0, first: 0, errors: 0 }])),
    owned: [], gear: { head: null, wand: null, wings: 'wings_petals', trail: null }, wingColor: WING_COLOR, achievements: {},
    difficulty: 0, vol: { music: 0.5, sfx: 0.8, voice: 1 },
    tier: 2, launches: 0, pinTier: null,
    worlds: {},
  };
}

/** The progress of a world nobody has played yet. */
export function defaultWorld(): WorldState {
  return { quests: {}, final: false, starsTaken: [], flags: {}, pos: null };
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
 * A save that cannot be read (broken, or of a version this code does not know: 0, 2.5) is restored from `prev`, then
 * from `v<N>`, the newest version first; `prev` is written only by a save read without an error. No save at all is
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
    const read = s && fromStored(s, d);
    if (s && read) {
      keep(PREV, text);
      try {
        if (s.v < SAVE_VERSION && localStorage.getItem(versionKey(s.v)) === null) keep(versionKey(s.v), text);
      } catch { /* storage unavailable */ }
      return read;
    }
    // Not to be read: broken JSON, no numeric version, or a version this code does not know (0, 2.5). The text is
    // kept, the save comes back from a backup, and amw-save-prev keeps the save of the last launch read without an error.
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

/**
 * An early version 3 world state, or the world progress of a version 1 or 2 save, with `chestOpen`: the chest becomes
 * the flag `chest` (the field is dropped, the other flags stay).
 */
function chestToFlag(w: Record<string, unknown>): Record<string, unknown> {
  const { chestOpen, ...rest } = w;
  const flags = part(rest.flags);
  return { ...rest, flags: chestOpen === true ? { ...flags, [CHEST_FLAG]: true } : flags };
}

/** The save of this version a stored save holds; null for a version this code does not read (a save not to be read). */
function fromStored(s: Stored, d: Save): Save | null {
  let out: Save | null = null;
  if (s.v >= SAVE_VERSION) {
    // v3 and later: whatever is stored wins over the defaults, a later version keeps its number, and the worlds
    // (the ones of this version and any other) stay as they are; worldState fills a played world's gaps.
    const worlds = isObject(s.worlds) ? s.worlds : {};
    // Version 3 kept the first world's chest as `chestOpen` before it had flags (never published: a test device).
    const first = worlds[FIRST_WORLD];
    if (isObject(first) && 'chestOpen' in first) worlds[FIRST_WORLD] = chestToFlag(first);
    out = { ...d, ...s, skills: { ...d.skills, ...part(s.skills) }, vol: { ...d.vol, ...part(s.vol) },
      gear: { ...d.gear, ...part(s.gear) }, worlds } as Save;
  } else if (s.v === 2 || s.v === 1) {
    // v2 and v1: the world's progress moves from the top into worlds.fairy (the chest as its flag), the rest (and any
    // field this code does not know) stays on top: the look, the stars, the skills, the settings. Version 1 (the
    // one-quest slice) has no skills, volume or difficulty - the defaults; its `stage`, the stage of its single quest,
    // maps onto none of the quests that followed: the story starts again, all else is kept (the text stays in amw-save-v1).
    const common = { ...s };
    const world: Record<string, unknown> = {};
    for (const k of OLD_WORLD_FIELDS) { if (k in common) world[k] = common[k]; delete common[k]; }
    if (s.v === 1) delete common.stage;
    out = { ...d, ...common, v: SAVE_VERSION, skills: { ...d.skills, ...part(common.skills) }, vol: { ...d.vol, ...part(common.vol) },
      worlds: { [FIRST_WORLD]: { ...defaultWorld(), ...chestToFlag(world) } } } as Save;
  }
  if (out) {
    // A damaged quality field must not switch the automatic lowering off (main.ts lowers only with pinTier null).
    if (!isTier(out.tier)) out.tier = d.tier;
    if (out.pinTier !== null && !isTier(out.pinTier)) out.pinTier = null;
    // A damaged list of purchases must not break the shop: only the ids it holds are kept.
    // A damaged wing colour gives the petals their old one.
    if (typeof out.wingColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(out.wingColor)) out.wingColor = d.wingColor;
    if (!Array.isArray(out.owned)) out.owned = [];
    else out.owned = out.owned.filter((id) => typeof id === 'string');
  }
  return out;
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
