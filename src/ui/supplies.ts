/**
 * The buttons of the potions and the compass (decision of 2026-11-19): a row at the bottom while she can walk, one
 * button per kind she has or whose effect acts, with how many she has; one tap drinks one. Around a button whose effect
 * acts a ring shows the time left. In a task, on a card, on the start screen and in a scene the row is hidden.
 * A button that could do nothing now (the jump in the water, the compass with no star to find) is dimmed; a tap on the
 * compass when every mysterious star is solved has the cat say so, and nothing is spent.
 */
import type { SupplyId } from '../game/shop';
import { EFFECT_MAX, type EffectId } from '../game/supplies';
import type { Supplies } from '../game/supplyfx';
import { t, type Key, type SpokenKey } from './strings';

/** The picture of each kind on its button and its tile in the shop, and the colour of its bottle. */
export const SUPPLY_LOOK: Record<SupplyId, { icon: string; color: string }> = {
  speed: { icon: '💨', color: '#7fe3ff' },
  jump: { icon: '🦘', color: '#a8f07a' },
  glow: { icon: '✨', color: '#ffe36e' },
  funny: { icon: '🍄', color: '#ff9ed2' },
  compass: { icon: '🧭', color: '#ffc46b' },
  owl: { icon: '🦉', color: '#d9b98c' },
  abacus: { icon: '🧮', color: '#b8e0ff' },
};

/** The cat's line when an effect starts. */
const SAID: Record<EffectId, SpokenKey> = {
  speed: 'sup_speed', jump: 'sup_jump', glow: 'sup_glow', tiny: 'sup_tiny', giant: 'sup_giant', compass: 'sup_compass',
};

/** What the row needs of the game. */
export interface SupplyRowHooks {
  /** The cat says a line (g.speech.line, as a hint). */
  say(key: SpokenKey): void;
}

/** Makes the row (once) and returns what draws it: called every frame with whether she can walk now. */
export function initSupplyRow(supplies: Supplies, hooks: SupplyRowHooks): (canMove: boolean) => void {
  const row = document.createElement('div');
  row.id = 'supplies';
  row.className = 'hidden';
  document.body.appendChild(row);
  supplies.onDrink((e) => hooks.say(SAID[e]));
  let drawn = '';

  return (canMove) => {
    const buttons = canMove ? supplies.buttons() : [];
    // Only the whole seconds and the counts change the picture: the row is rebuilt when one of them did.
    const key = buttons.map((b) => `${b.id}:${b.count}:${Math.ceil(b.left)}:${b.refusal ?? ''}`).join(' ');
    if (key === drawn) return;
    drawn = key;
    row.classList.toggle('hidden', buttons.length === 0);
    row.innerHTML = '';
    for (const b of buttons) {
      const look = SUPPLY_LOOK[b.id];
      const el = document.createElement('button');
      // dimmed: a tap could do nothing here (the jump in the water, a compass with no star in this world)
      el.className = 'sup' + (b.left > 0 ? ' on' : '') + (b.refusal === 'water' || b.refusal === 'no-stars' ? ' dim' : '');
      el.dataset.id = b.id;
      el.style.setProperty('--c', look.color);
      el.style.setProperty('--left', String(Math.min(1, b.left / EFFECT_MAX * 3)));   // a minute fills the ring
      el.setAttribute('aria-label', t(`supn_${b.id}` as Key)); el.title = t(`supn_${b.id}` as Key);
      el.innerHTML = `<span class="ic">${look.icon}</span>${b.count > 0 ? `<b>${b.count}</b>` : ''}`;
      el.addEventListener('click', () => {
        const r = supplies.drink(b.id);
        if ('refused' in r && r.refused === 'all-found') hooks.say('sup_all_found');
        drawn = '';
      });
      row.appendChild(el);
    }
  };
}
