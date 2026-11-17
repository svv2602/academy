/**
 * The four ready looks of the start screen (PLAY-06): the fairy, the princess, the elf and the witch. A look is a set
 * of the free choices - the colours of the dress, the hair and the wings - and of free things: wings, a thing on the
 * head and a wand (src/game/shop.ts: the things of the looks are free and never sold). The hairstyle is one for all
 * (TECH-14). After a look every choice is still changed on its own in the fitting room (R25).
 *
 * The colours are those of the palettes of the start screen and the fitting room (src/ui/ui.ts DRESS and HAIR,
 * src/ui/shop.ts WING_COLORS), so that the fitting room shows them chosen; looks.test.ts holds them to it.
 */
import type { Save } from '../core/save';

export type LookId = 'fairy' | 'princess' | 'elf' | 'witch';

export interface Look {
  id: LookId;
  /** The picture of the look's button (no reading needed). */
  icon: string;
  dress: string;
  hair: string;
  /** The wings worn, or null for none. */
  wings: string | null;
  wingColor: string;
  /** The thing on the head, or null. */
  head: string | null;
  /** The wand, or null. */
  wand: string | null;
}

export const LOOKS: readonly Look[] = [
  { id: 'fairy', icon: '🧚', dress: '#5cc8ff', hair: '#f5d16b', wings: 'wings_petals', wingColor: '#ffd1ec', head: null, wand: 'wand_flower' },
  { id: 'princess', icon: '👸', dress: '#ff7eb6', hair: '#f5d16b', wings: null, wingColor: '#fff3b8', head: 'tiara', wand: null },
  { id: 'elf', icon: '🧝', dress: '#6ee7a8', hair: '#ff8a5c', wings: null, wingColor: '#c9ffe0', head: 'elf_ears', wand: 'wand_leaf' },
  { id: 'witch', icon: '🧙', dress: '#b388ff', hair: '#3b2a3a', wings: null, wingColor: '#e6d4ff', head: 'wizard_cap', wand: 'wand_moon' },
];

export const look = (id: string): Look | undefined => LOOKS.find((l) => l.id === id);

/**
 * Puts a look on the save: the dress, the hair, the wings and their colour, the head and the wand - and nothing else
 * (the trail, the things bought, the stars stay as they are). Refused for an id that is no look. The caller paints the
 * heroine and stores the save.
 */
export function applyLook(s: Save, id: string): boolean {
  const l = look(id);
  if (!l) return false;
  s.dress = l.dress;
  s.hair = l.hair;
  s.wingColor = l.wingColor;
  s.gear.wings = l.wings;
  s.gear.head = l.head;
  s.gear.wand = l.wand;
  return true;
}

/** The look the save wears as it is, or null once any of its choices has been changed. */
export function lookOf(s: Save): LookId | null {
  return LOOKS.find((l) => l.dress === s.dress && l.hair === s.hair && l.wingColor === s.wingColor
    && l.wings === s.gear.wings && l.head === s.gear.head && l.wand === s.gear.wand)?.id ?? null;
}
