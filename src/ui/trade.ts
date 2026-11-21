/**
 * The cards of a trade (PLAY-28, src/game/trade.ts), over the conversation:
 * - the choice of a character whose chain is finished and who asks for something today: «Грати», «Обмін», «Бувай»;
 * - the trade itself in pictures: what it takes (each kind with its number and dots, "у тебе 5 → залишиться 2", or
 *   "ще 1" when short - no red, no error sound), what it gives (the thing, or the stars), «Обміняти» and «Не зараз».
 *   «Обміняти» is off while the finds are short: nothing can be lost by a tap.
 */
import type { Save } from '../core/save';
import { canSpend, type Need } from '../game/stash';
import { TRADE_STARS, tradeSums, type Offer } from '../game/trade';
import { findIcon } from './finds';
import { ICON } from './shop';
import { t, tf } from './strings';
import './trade.css';

const make = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

/** What the walkthrough reads of an open card (?debug): 'choice' or 'trade', and the ask shown. */
export const tradeState: { open: 'choice' | 'trade' | null; offer: Offer | null } = { open: null, offer: null };

function card(): HTMLElement {
  let root = document.getElementById('trade');
  if (!root) { root = make('div'); root.id = 'trade'; document.body.appendChild(root); }
  root.className = ''; root.innerHTML = '';
  return root;
}
function shut(root: HTMLElement) { root.className = 'hidden'; root.innerHTML = ''; tradeState.open = null; tradeState.offer = null; }

export type TalkChoice = 'play' | 'trade' | 'bye';

/** The choice of a character with an ask today; resolves with the button tapped. */
export function chooseTalk(emoji: string): Promise<TalkChoice> {
  const root = card(), box = make('div', 'tr-card tr-choice');
  box.appendChild(make('div', 'tr-who', emoji));
  const row = make('div', 'tr-row');
  box.appendChild(row);
  root.appendChild(box);
  tradeState.open = 'choice';
  return new Promise((done) => {
    for (const [id, icon, key] of [['play', '🎲', 'talk_play'], ['trade', '🔄', 'talk_trade'], ['bye', '👋', 'talk_bye']] as const) {
      const b = make('button', `big tr-${id}`);
      b.id = `talk_${id}`; b.innerHTML = `<span class="ic">${icon}</span> ${t(key)}`;
      b.addEventListener('click', () => { shut(root); done(id); });
      row.appendChild(b);
    }
  });
}

/** The gift of an ask, in a picture: the thing's, or the stars (5 own, 15 far). */
const giftIcon = (o: Offer) => (o.gives === 'stars' ? `+${o.far ? TRADE_STARS.far : TRADE_STARS.own} ⭐` : ICON[o.gives.item] ?? '🎁');

/** The trade card; resolves true on «Обміняти» (the caller makes the trade), false on «Не зараз». */
export function openTrade(save: Save, emoji: string, o: Offer): Promise<boolean> {
  const root = card(), box = make('div', 'tr-card');
  const deal = make('div', 'tr-deal'), take = make('div', 'tr-take'), gift = make('div', 'tr-gift');
  gift.innerHTML = `<span class="tr-arrow">→</span><span class="tr-gives">${giftIcon(o)}</span>`;
  if (o.gives !== 'stars') gift.appendChild(make('span', 'tr-from', t('shop_trade')));
  for (const s of tradeSums(save, o)) {
    const k = make('div', 'tr-kind');
    k.dataset.kind = s.kind;
    k.innerHTML = `<span class="tr-need">${findIcon(s.kind)}${s.need}</span>`;
    const dots = make('span', 'dots');
    for (let i = 0; i < s.need; i++) dots.appendChild(make('i', i < s.have ? 'have' : ''));
    k.appendChild(dots);
    k.appendChild(make('span', 'tr-sum', s.left === null ? tf('trade_short', { n: s.need - s.have }) : `${tf('trade_have', { n: s.have })} → ${tf('trade_left', { n: s.left })}`));
    take.appendChild(k);
  }
  deal.append(make('div', 'tr-who', emoji), take, gift);
  const row = make('div', 'tr-row');
  box.append(deal, row);
  root.appendChild(box);
  tradeState.open = 'trade'; tradeState.offer = o;
  return new Promise((done) => {
    const go = make('button', 'big tr-go', t('trade_go')), later = make('button', 'big tr-later', t('trade_later'));
    go.id = 'tradeGo'; later.id = 'tradeLater';
    go.toggleAttribute('disabled', !canSpend(save, o.need as Need));
    go.addEventListener('click', () => { shut(root); done(true); });
    later.addEventListener('click', () => { shut(root); done(false); });
    row.append(go, later);
  });
}
