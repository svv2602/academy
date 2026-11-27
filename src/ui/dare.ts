/**
 * The card of «А складніше зможеш?» (LEARN-28, src/game/dare.ts), over the conversation: the character who asks and
 * two buttons, «Так!» and «Іншим разом». Nothing is lost by either: the second only puts the harder example off.
 * Drawn as the choice card of a trade (./trade.css, the same place on the screen); each button is 52 px high.
 */
import { t } from './strings';
import './trade.css';

const make = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

/** Whether the card is up: what the walkthrough reads (?debug). */
export const dareState: { open: boolean } = { open: false };

/** Shows the card of the character `emoji`; resolves true on «Так!», false on «Іншим разом». */
export function askHarder(emoji: string): Promise<boolean> {
  let root = document.getElementById('trade');
  if (!root) { root = make('div'); root.id = 'trade'; document.body.appendChild(root); }
  const place = root;
  place.className = ''; place.innerHTML = '';
  const box = make('div', 'tr-card tr-choice dare-card'), row = make('div', 'tr-row');
  box.appendChild(make('div', 'tr-who', emoji));
  box.appendChild(row);
  place.appendChild(box);
  dareState.open = true;
  return new Promise((done) => {
    for (const [id, icon, key, yes] of [['dare_yes', '💪', 'dare_yes', true], ['dare_no', '🌙', 'dare_no', false]] as const) {
      const b = make('button', yes ? 'big tr-play' : 'big tr-bye');
      b.id = id; b.innerHTML = `<span class="ic">${icon}</span> ${t(key)}`;
      b.addEventListener('click', () => { place.className = 'hidden'; place.innerHTML = ''; dareState.open = false; done(yes); });
      row.appendChild(b);
    }
  });
}
