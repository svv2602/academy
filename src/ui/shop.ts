/**
 * The shop and the fitting room (PLAY-04, PLAY-05): one screen, opened from the book of treasures in the middle of the
 * game (and, later, from the signboard of the first world: `openShop`). Tabs by pictures: the dress, the hair, the
 * wings, the head, the wand, the sparkles. A tap on a thing puts it on at once, free, for as long as the screen is
 * open (trying on); one that is not hers has a single button under it, "buy for N ⭐", or "N ⭐ more" when she has not
 * got the stars yet (soft lilac, no error sound). What she tried on and did not buy comes off when the screen closes.
 * The colours of the dress, the hair and the wings are free for ever (R15).
 *
 * The rules are src/game/shop.ts: this screen spends stars only through `buy`, on the child's tap, and stores the save
 * at once after every choice (`persist`). What is tried on never reaches the save.
 */
import { sfx, say } from '../core/audio';
import type { Save } from '../core/save';
import { GEAR, type Gear, type GearId } from '../game/gear';
import { LOOKS, applyLook as putOnLook, lookOf } from '../game/looks';
import { CATALOG, buy, equip, has, itemState, type Slot } from '../game/shop';
import { t, tf, voiceText, type Key, type SpokenKey } from './strings';
import { DRESS, HAIR } from './ui';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/** The free colours of the wings; the first is the one the petals always had (save.ts WING_COLOR). */
export const WING_COLORS = ['#d8f6ff', '#ffd1ec', '#e6d4ff', '#fff3b8', '#c9ffe0'];
const SLOTS: readonly Slot[] = ['head', 'wand', 'wings', 'trail'];
type Tab = 'dress' | 'hair' | Slot;
const TABS: readonly { id: Tab; icon: string }[] = [
  { id: 'dress', icon: '👗' }, { id: 'hair', icon: '💇' }, { id: 'wings', icon: '🪽' },
  { id: 'head', icon: '👑' }, { id: 'wand', icon: '🪄' }, { id: 'trail', icon: '✨' },
];
/** The picture of each thing on its tile; `none` is the empty slot (no hat, no wand, no wings, no sparkles). */
const ICON: Record<string, string> = {
  none: '🚫', wreath: '🌸', crown: '👑', wizard_hat: '🧙', earrings_star: '⭐', wand_star: '🪄', wand_crystal: '💎',
  wings_petals: '🧚', wings_butterfly: '🦋', trail_sparkle: '✨',
  tiara: '👸', wizard_cap: '🎩', elf_ears: '🧝', wand_flower: '🌼', wand_moon: '🌙', wand_leaf: '🍃',
};
/** The camera distance while the screen is open: the heroine is seen close up beside the card. */
const CLOSEUP = 3.2;

/** What the screen needs of the game (src/game/start.ts hands it over). */
export interface ShopHooks {
  /** Stores the save (g.persist). */
  persist(): void;
  /** The star counter of the HUD after a purchase. */
  refreshHud(): void;
  /** Paints the dress and the hair of save onto the heroine (heroRig.setLook). */
  applyLook(): void;
  /** The game stands while the screen is open (g.paused). */
  pause(on: boolean): void;
  /** The camera comes close to the heroine, or goes back with null (g.camOverride). */
  closeup(dist: number | null): void;
}

let opener: (() => void) | null = null;
/**
 * Opens the shop screen: the button of the book calls it, and the signboard of the first world will. Does nothing
 * before the game has started its screens (initShop).
 */
export function openShop(): void { opener?.(); }

let closeupHook: ShopHooks['closeup'] | null = null;
/**
 * The book of treasures shows the heroine close up as the shop does (R58): the same close-up, the same free side of the
 * screen; false brings the camera back. Does nothing before initShop.
 */
export function heroCloseup(on: boolean): void { closeupHook?.(on ? CLOSEUP : null); }

/**
 * Puts what the save holds onto the heroine: each slot's thing if she has it (bought, opened or free), and the colour
 * of her wings. A thing of a later version or one she does not have leaves the slot as it is; the save is not changed.
 */
export function wearSaved(save: Save, gear: Gear): void {
  for (const slot of SLOTS) {
    const id = save.gear[slot];
    if (id === null) gear.set(slot, null);
    else if (id in GEAR && GEAR[id as GearId].slot === slot && has(save, id)) gear.set(slot, id as GearId);
  }
  gear.tint(save.wingColor);
}

/** Sets up the screen once, before the first frame; returns its opener (the same as openShop). */
export function initShop(save: Save, gear: Gear, hooks: ShopHooks): () => void {
  const root = $('shop'), tabs = $('shopTabs'), items = $('shopItems'), act = $('shopAct'), sayBox = $('shopSay'), sayText = $('shopSayText');
  let tab: Tab = 'dress';
  /** What she tries on and has not bought, by slot: put back to the save's thing when the screen closes. */
  let trial: Partial<Record<Slot, string>> = {};
  /** A silhouette tapped: its caption is shown under the tiles (nothing is put on). */
  let peek: string | null = null;

  const speak = (key: SpokenKey) => {
    sayText.textContent = t(key);
    sayBox.classList.remove('quiet');
    void say(key, voiceText(key), 'story');
  };
  const shown = (slot: Slot) => trial[slot] ?? save.gear[slot];
  const wear = (slot: Slot, id: string | null) => gear.set(slot, id as GearId | null);
  const button = (cls: string, html: string, on: () => void) => {
    const b = document.createElement('button');
    b.className = cls; b.innerHTML = html;
    b.addEventListener('click', on);
    return b;
  };

  const swatches = (colors: readonly string[], now: string, pick: (c: string) => void) => {
    const box = document.createElement('div');
    box.className = 'swatches';
    for (const c of colors) {
      const b = button(c === now ? 'sel' : '', '', () => { pick(c); render(); });
      b.style.background = c; b.dataset.color = c;
      box.appendChild(b);
    }
    return box;
  };

  const tapThing = (slot: Slot, id: string | null) => {
    peek = null;
    if (id === null || has(save, id)) {
      // Hers: worn for good at once.
      equip(save, slot, id); delete trial[slot]; wear(slot, id); hooks.persist();
      return;
    }
    const st = itemState(save, id)!;
    if (st.kind === 'silhouette') { peek = id; return; }
    trial[slot] = id; wear(slot, id);
    if (st.kind === 'price' && st.short > 0) speak('shop_more');
  };

  const tapBuy = (slot: Slot, id: string) => {
    if (!buy(save, id)) { speak('shop_more'); return; }
    equip(save, slot, id); delete trial[slot]; wear(slot, id);
    hooks.persist(); hooks.refreshHud();
    sfx('chime'); speak('shop_bought');
  };

  function renderAct(slot: Slot | null) {
    act.innerHTML = '';
    if (!slot) return;
    if (peek) { act.textContent = t('shop_achieve'); return; }
    const id = trial[slot];
    if (!id) return;
    const st = itemState(save, id);
    if (st?.kind === 'reward') { act.textContent = t('shop_find'); return; }
    if (st?.kind !== 'price') return;
    const b = button('big small' + (st.short > 0 ? ' short' : ''), '', () => { tapBuy(slot, id); render(); });
    b.id = 'shopBuy'; b.dataset.id = id;
    b.textContent = st.short > 0 ? tf('shop_short', { n: st.short }) : tf('shop_buy', { n: st.price });
    act.appendChild(b);
  }

  function render() {
    tabs.innerHTML = '';
    for (const tb of TABS) {
      const b = button(tb.id === tab ? 'sel' : '', tb.icon, () => { tab = tb.id; peek = null; render(); });
      b.dataset.tab = tb.id;
      tabs.appendChild(b);
    }
    items.innerHTML = '';
    if (tab === 'dress' || tab === 'hair') {
      const key = tab;
      items.appendChild(swatches(key === 'dress' ? DRESS : HAIR, save[key], (c) => { save[key] = c; hooks.applyLook(); hooks.persist(); }));
      renderAct(null);
      return;
    }
    const slot = tab;
    const row = document.createElement('div');
    row.className = 'tiles';
    for (const id of [null, ...CATALOG.filter((i) => i.slot === slot).map((i) => i.id)]) {
      const st = id === null ? null : itemState(save, id)!;
      const cap = !st || st.kind === 'owned' ? '' : st.kind === 'price' ? `${st.price} ⭐` : st.kind === 'reward' ? '🎁' : t('shop_achieve');
      const cls = 'tile' + (shown(slot) === id && peek === null ? ' sel' : '') + (st?.kind === 'silhouette' ? ' sil' : '') + (peek !== null && peek === id ? ' sel' : '');
      const b = button(cls, `<span class="ic">${ICON[id ?? 'none'] ?? '❔'}</span>${cap ? `<span class="cap">${cap}</span>` : ''}`, () => { tapThing(slot, id); render(); });
      b.dataset.id = id ?? 'none';
      row.appendChild(b);
    }
    items.appendChild(row);
    if (slot === 'wings') items.appendChild(swatches(WING_COLORS, save.wingColor, (c) => { save.wingColor = c; gear.tint(c); hooks.persist(); }));
    renderAct(slot);
  }

  const open = () => {
    if (!root.classList.contains('hidden')) return;
    trial = {}; peek = null; tab = 'dress';
    $('shopDone').textContent = t('shop_done');
    sayBox.classList.add('quiet');
    render();
    root.classList.remove('hidden');
    hooks.pause(true); hooks.closeup(CLOSEUP);
    speak('shop_hi');
  };
  const close = () => {
    // What was tried on and not bought comes off: the slot shows the save's thing again.
    for (const slot of Object.keys(trial) as Slot[]) wear(slot, null);
    trial = {}; peek = null;
    wearSaved(save, gear);
    root.classList.add('hidden');
    hooks.closeup(null); hooks.pause(false);
  };
  $('shopDone').addEventListener('click', close);

  closeupHook = hooks.closeup;
  initLooks(save, gear, hooks);
  wearSaved(save, gear);
  opener = open;
  return open;
}

/**
 * The row of the four looks on the start screen (PLAY-06, src/game/looks.ts): a tap puts the look on the save, on the
 * heroine at once (her colours through applyLook, her things through wearSaved) and stores it. The look she wears is
 * lit, and so are its colours among the start screen's own swatches; a colour changed there unlights the look. After
 * "play" the start screen is gone: every choice is changed on its own in the fitting room (R25).
 */
function initLooks(save: Save, gear: Gear, hooks: ShopHooks): void {
  const row = document.getElementById('looks');
  if (!row) return;
  const swatchRows = [['dress', DRESS], ['hair', HAIR]] as const;
  const mark = () => {
    const now = lookOf(save);
    row.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('sel', b.dataset.look === now));
    for (const [key, colors] of swatchRows) {
      [...$(key).children].forEach((b, i) => b.classList.toggle('sel', colors[i] === save[key]));
    }
  };
  row.innerHTML = '';
  for (const l of LOOKS) {
    const b = document.createElement('button');
    b.dataset.look = l.id;
    // A picture of the look over its colours, named by its caption (aria-label, title) - no reading needed.
    b.innerHTML = `<span class="ic">${l.icon}</span>`;
    b.setAttribute('aria-label', t(`look_${l.id}` as Key)); b.title = t(`look_${l.id}` as Key);
    b.style.setProperty('--dress', l.dress); b.style.setProperty('--hair', l.hair);
    b.addEventListener('click', () => {
      if (!putOnLook(save, l.id)) return;
      wearSaved(save, gear); hooks.applyLook(); hooks.persist();
      mark();
    });
    row.appendChild(b);
  }
  // The start screen's own swatches (src/ui/ui.ts initStart) change a colour first; the look is then lit or not.
  for (const [key] of swatchRows) $(key).addEventListener('click', mark);
  mark();
}
