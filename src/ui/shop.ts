/**
 * The shop and the fitting room (PLAY-04, PLAY-05): one screen, opened from the book of treasures in the middle of the
 * game (and, later, from the signboard of the first world: `openShop`). Tabs by pictures: the dress, the hair, the
 * wings, the head, the wand, the sparkles. A tap on a thing puts it on at once, free, for as long as the screen is
 * open (trying on); one that is not hers has a single button under it, "buy for N ⭐", or "N ⭐ more" when she has not
 * got the stars yet (soft lilac, no error sound). What she tried on and did not buy comes off when the screen closes.
 * The colours of the dress, the hair and the wings are free for ever (R15). The last tab sells the potions and the
 * compass (src/game/supplies.ts): a tap on one picks it, its button buys one more for her stock (no trying on, no
 * "for ever" - the cat says nothing, a chime and the new count).
 * The tabs of the pets (decision of 2026-11-20): the cat's things, and the fawn's once it is found. A tap tries the thing
 * on the pet as on the heroine; a rare thing on a day it is not the deal of the day is a silhouette "рідкісна річ".
 *
 * The rules are src/game/shop.ts: this screen spends stars only through `buy`, on the child's tap, and stores the save
 * at once after every choice (`persist`). What is tried on never reaches the save.
 */
import { sfx, say } from '../core/audio';
import type { Save } from '../core/save';
import { GEAR, type Gear, type GearId } from '../game/gear';
import { LOOKS, applyLook as putOnLook, lookOf } from '../game/looks';
import { CATALOG, PET_ITEMS, PET_WEARERS, STOCK_MAX, SUPPLIES, buy, canBuy, dealOf, equip, equipPet, has, item, itemState, petItem, petItemState, petOpen, petWorn, priceOf, stock, type PetWearer, type Slot, type SupplyId } from '../game/shop';
import { dealDay } from '../game/deal';
import { SUPPLY_LOOK } from './supplies';
import { t, tf, voiceText, type Key, type SpokenKey } from './strings';
import { DRESS, HAIR } from './ui';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/** The free colours of the wings; the first is the one the petals always had (save.ts WING_COLOR). */
export const WING_COLORS = ['#d8f6ff', '#ffd1ec', '#e6d4ff', '#fff3b8', '#c9ffe0'];
const SLOTS: readonly Slot[] = ['head', 'wand', 'wings', 'trail'];
type Tab = 'dress' | 'hair' | Slot | PetWearer | 'potions';
const TABS: readonly { id: Tab; icon: string }[] = [
  { id: 'dress', icon: '👗' }, { id: 'hair', icon: '💇' }, { id: 'wings', icon: '🪽' },
  { id: 'head', icon: '👑' }, { id: 'wand', icon: '🪄' }, { id: 'trail', icon: '✨' },
  { id: 'cat', icon: '🐱' }, { id: 'fawn', icon: '🦌' }, { id: 'potions', icon: '🧪' },
];
/** The picture of each thing on its tile; `none` is the empty slot (no hat, no wand, no wings, no sparkles). */
export const ICON: Record<string, string> = {
  none: '🚫', wreath: '🌸', crown: '👑', wizard_hat: '🧙', earrings_star: '⭐', wand_star: '🪄', wand_crystal: '💎', feather_crown: '🪶', acorn_cap: '🧢',
  wings_petals: '🧚', wings_butterfly: '🦋', trail_sparkle: '✨',
  cat_collar: '📿', cat_bow: '🎀', cat_hat: '🧙', cat_gold_bell: '🔔',
  fawn_wreath: '💐', fawn_ribbon: '🎀', fawn_bell: '🔔', fawn_star_crown: '👑', fawn_leaf_bow: '🍂',
  tiara: '👸', wizard_cap: '🎩', elf_ears: '🧝', wand_flower: '🌼', wand_moon: '🌙', wand_leaf: '🍃',
};
/** The price of a tile: the deal of the day has its own price crossed out before the new one. */
const priceCap = (price: number, was?: number) => (was ? `<s>${was}</s> ${price} ⭐` : `${price} ⭐`);
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
  /** Shows a thing on a pet (null: none; src/game/petgear.ts wearPetGear). */
  wearPet?(pet: PetWearer, id: string | null): void;
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

/** Puts on each pet the thing the save holds for it (none when it is not hers). */
export function wearSavedPets(save: Save, wearPet: ShopHooks['wearPet']): void {
  for (const pet of PET_WEARERS) wearPet?.(pet, petWorn(save, pet));
}

/** Sets up the screen once, before the first frame; returns its opener (the same as openShop). */
export function initShop(save: Save, gear: Gear, hooks: ShopHooks): () => void {
  const root = $('shop'), tabs = $('shopTabs'), items = $('shopItems'), act = $('shopAct'), sayBox = $('shopSay'), sayText = $('shopSayText');
  let tab: Tab = 'dress';
  /** What she tries on and has not bought, by slot: put back to the save's thing when the screen closes. */
  let trial: Partial<Record<Slot, string>> = {};
  /** A silhouette tapped: its caption is shown under the tiles (nothing is put on). */
  let peek: string | null = null;
  /** The potion picked on its tab: its button buys one. */
  let potion: SupplyId | null = null;
  /** What each pet tries on and is not bought (undefined: the save's own). */
  let petTrial: Partial<Record<PetWearer, string>> = {};

  const speak = (key: SpokenKey) => {
    sayText.textContent = t(key);
    sayBox.dataset.key = key;   // which line: read by the walkthrough (the shop speaks past the planner of g.speech)
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
    if (st?.kind === 'reward') { act.textContent = t(st.reward === 'trade' ? 'shop_trade_get' : 'shop_find'); return; }
    if (st?.kind !== 'price') return;
    const b = button('big small' + (st.short > 0 ? ' short' : ''), '', () => { tapBuy(slot, id); render(); });
    b.id = 'shopBuy'; b.dataset.id = id;
    b.textContent = st.short > 0 ? tf('shop_short', { n: st.short }) : tf('shop_buy', { n: st.price });
    act.appendChild(b);
  }

  /** The tab of the potions: a tile per kind (its price, how many she has); the one picked has its "buy" button. */
  function renderPotions() {
    const row = document.createElement('div');
    row.className = 'tiles';
    for (const x of SUPPLIES) {
      const n = stock(save, x.id), price = priceOf(save, x.id)!;
      const cap = `${priceCap(price, price < x.price ? x.price : undefined)}${n > 0 ? ` · ${tf('shop_stock', { n })}` : ''}`;
      const b = button('tile' + (potion === x.id ? ' sel' : '') + (price < x.price ? ' deal' : ''), `<span class="ic">${SUPPLY_LOOK[x.id].icon}</span><span class="cap">${cap}</span>`, () => { potion = x.id; render(); });
      b.dataset.id = x.id; b.title = t(`supn_${x.id}` as Key); b.setAttribute('aria-label', t(`supn_${x.id}` as Key));
      b.style.setProperty('--c', SUPPLY_LOOK[x.id].color);
      row.appendChild(b);
    }
    items.appendChild(row);
    act.innerHTML = '';
    if (!potion) return;
    const id = potion, price = priceOf(save, id)!;
    if (stock(save, id) >= STOCK_MAX) { act.textContent = tf('shop_stock', { n: STOCK_MAX }); return; }
    const short = Math.max(0, price - save.stars);
    const b = button('big small' + (short > 0 ? ' short' : ''), '', () => {
      if (!canBuy(save, id) || !buy(save, id)) speak('shop_more');
      else { hooks.persist(); hooks.refreshHud(); sfx('chime'); }
      render();
    });
    b.id = 'shopBuy'; b.dataset.id = id;
    b.textContent = short > 0 ? tf('shop_short', { n: short }) : tf('shop_buy', { n: price });
    act.appendChild(b);
  }

  /** The tab of a pet: none and its things; a tap tries one on the pet, the one tried on has its "buy" button. */
  function renderPet(pet: PetWearer) {
    const row = document.createElement('div');
    row.className = 'tiles';
    const shownPet = petTrial[pet] ?? petWorn(save, pet);
    for (const id of [null, ...PET_ITEMS.filter((x) => x.pet === pet).map((x) => x.id)]) {
      const st = id === null ? null : petItemState(save, id)!;
      const cap = !st || st.kind === 'owned' ? '' : st.kind === 'price' ? priceCap(st.price, st.was) : st.kind === 'trade' ? t('shop_trade') : t('shop_rare');
      const cls = 'tile' + ((peek === null ? shownPet === id : peek === id) ? ' sel' : '') + (st?.kind === 'rare' ? ' sil' : '')
        + (st?.kind === 'price' && st.was ? ' deal' : '');
      const b = button(cls, `<span class="ic">${ICON[id ?? 'none'] ?? '❔'}</span>${cap ? `<span class="cap">${cap}</span>` : ''}`, () => { tapPet(pet, id); render(); });
      b.dataset.id = id ?? 'none';
      row.appendChild(b);
    }
    items.appendChild(row);
    act.innerHTML = '';
    if (peek) { act.textContent = t('shop_rare'); return; }
    const id = petTrial[pet];
    const st = id ? petItemState(save, id) : undefined;
    if (st?.kind === 'trade') { act.textContent = t('shop_trade_get'); return; }
    if (!id || st?.kind !== 'price') return;
    const b = button('big small' + (st.short > 0 ? ' short' : ''), '', () => { tapBuyPet(pet, id); render(); });
    b.id = 'shopBuy'; b.dataset.id = id;
    b.textContent = st.short > 0 ? tf('shop_short', { n: st.short }) : tf('shop_buy', { n: st.price });
    act.appendChild(b);
  }

  const tapPet = (pet: PetWearer, id: string | null) => {
    peek = null;
    if (id === null || save.owned.includes(id)) {
      // Hers: worn for good at once.
      equipPet(save, pet, id); delete petTrial[pet]; hooks.wearPet?.(pet, id); hooks.persist();
      return;
    }
    const st = petItemState(save, id)!;
    if (st.kind === 'rare') { peek = id; return; }
    petTrial[pet] = id; hooks.wearPet?.(pet, id);
    if (st.kind === 'price' && st.short > 0) speak('shop_more');
  };

  const tapBuyPet = (pet: PetWearer, id: string) => {
    if (!buy(save, id)) { speak('shop_more'); return; }
    equipPet(save, pet, id); delete petTrial[pet]; hooks.wearPet?.(pet, id);
    hooks.persist(); hooks.refreshHud();
    sfx('chime'); speak('shop_bought');
  };

  function render() {
    tabs.innerHTML = '';
    for (const tb of TABS) {
      if ((tb.id === 'cat' || tb.id === 'fawn') && !petOpen(save, tb.id)) continue;   // the fawn's tab once it is found
      if (tb.id === 'cat') { const br = document.createElement('span'); br.className = 'tab-break'; tabs.appendChild(br); }
      const b = button(tb.id === tab ? 'sel' : '', tb.icon, () => { tab = tb.id; peek = null; potion = null; render(); });
      b.dataset.tab = tb.id;
      tabs.appendChild(b);
    }
    items.innerHTML = '';
    if (tab === 'potions') { renderPotions(); return; }
    if (tab === 'cat' || tab === 'fawn') { renderPet(tab); return; }
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
      const cap = !st || st.kind === 'owned' ? '' : st.kind === 'price' ? priceCap(st.price, st.was) : st.kind === 'reward' ? (st.reward === 'trade' ? t('shop_trade') : '🎁') : t('shop_achieve');
      const cls = 'tile' + (shown(slot) === id && peek === null ? ' sel' : '') + (st?.kind === 'silhouette' ? ' sil' : '') + (peek !== null && peek === id ? ' sel' : '')
        + (st?.kind === 'price' && st.was ? ' deal' : '');
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
    trial = {}; petTrial = {}; peek = null; potion = null; tab = 'dress';
    // The deal of the day (src/game/deal.ts): the shop opens on its tab, and the cat tells of it once a day.
    const deal = dealOf(save), day = dealDay();
    if (deal) tab = item(deal.id)?.slot ?? petItem(deal.id)?.pet ?? 'potions';
    const tell = deal !== null && save.deal?.said !== day;
    if (tell) { save.deal = { ...save.deal, said: day }; hooks.persist(); }
    $('shopDone').textContent = t('shop_done');
    sayBox.classList.add('quiet');
    render();
    root.classList.remove('hidden');
    hooks.pause(true); hooks.closeup(CLOSEUP);
    speak(tell ? 'shop_deal' : 'shop_hi');
  };
  const close = () => {
    // What was tried on and not bought comes off: the slot shows the save's thing again.
    for (const slot of Object.keys(trial) as Slot[]) wear(slot, null);
    trial = {}; petTrial = {}; peek = null;
    wearSaved(save, gear);
    wearSavedPets(save, hooks.wearPet);
    root.classList.add('hidden');
    hooks.closeup(null); hooks.pause(false);
  };
  $('shopDone').addEventListener('click', close);

  closeupHook = hooks.closeup;
  initLooks(save, gear, hooks);
  wearSaved(save, gear);
  wearSavedPets(save, hooks.wearPet);
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
