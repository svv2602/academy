/** Versioned local save. Bump `v` and migrate in loadSave() when the shape changes. */
import { isTier, type Tier } from './quality';
export type SkillId = 'count' | 'add' | 'sub' | 'compare' | 'logic';
export interface SkillStat { level: number; streak: number; tasks: number; first: number; errors: number; }
export interface Save {
  v: 2;
  played: boolean;
  name: string;                 // how the cat addresses the child; never leaves the device
  dress: string; hair: string; hairStyle: 'long' | 'buns' | 'simpleparted'; wings: boolean;
  stars: number;
  starsTaken: number[];         // ids of collected world stars
  chestOpen: boolean;
  pos: [number, number] | null;
  quests: Record<string, number>;   // steps finished per quest (3 = shard received)
  final: boolean;                   // the Crystal of Light is restored
  skills: Record<SkillId, SkillStat>;
  difficulty: 0 | 1 | 2 | 3;        // 0 = adaptive, otherwise fixed by the parent
  vol: { music: number; sfx: number; voice: number };
  // Graphics quality (TECH-04); a save without them gets the defaults, so the version stays 2.
  tier: Tier;                       // the tier the session runs on now, the next launch starts from it
  launches: number;                 // page loads counted so far: every tenth tries a tier higher
  pinTier: Tier | null;             // fixed by the parent; null = automatic
}

const KEY = 'amw-save';
const SKILLS: SkillId[] = ['count', 'add', 'sub', 'compare', 'logic'];

export function defaultSave(): Save {
  return {
    v: 2, played: false, name: '', dress: '#ff7eb6', hair: '#8a5a3a', hairStyle: 'long', wings: true,
    stars: 0, starsTaken: [], chestOpen: false, pos: null, quests: {}, final: false,
    skills: Object.fromEntries(SKILLS.map((s) => [s, { level: 1, streak: 0, tasks: 0, first: 0, errors: 0 }])) as Save['skills'],
    difficulty: 0, vol: { music: 0.5, sfx: 0.8, voice: 1 },
    tier: 2, launches: 0, pinTier: null,
  };
}

export function loadSave(): Save {
  const d = defaultSave();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s?.v === 2) {
      const out: Save = { ...d, ...s, skills: { ...d.skills, ...s.skills }, vol: { ...d.vol, ...s.vol } };
      // A damaged quality field must not switch the automatic lowering off (main.ts lowers only with pinTier null).
      if (!isTier(out.tier)) out.tier = d.tier;
      if (out.pinTier !== null && !isTier(out.pinTier)) out.pinTier = null;
      return out;
    }
    // v1 (the one-quest slice): keep who the child is, restart the story.
    if (s?.v === 1) return { ...d, name: s.name ?? '', dress: s.dress ?? d.dress, hair: s.hair ?? d.hair, hairStyle: s.hairStyle ?? d.hairStyle };
  } catch { /* private mode or corrupted data: start fresh */ }
  return d;
}

export function storeSave(s: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
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
