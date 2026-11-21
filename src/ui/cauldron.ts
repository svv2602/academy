/**
 * The card of the cauldron (PLAY-26, src/game/cauldron.ts): the recipes she may see in pictures - each kind with its
 * number and dots "have / need" - on one side; the cauldron and the stash on the other. A recipe touched is the one
 * brewed; a kind of the stash touched puts one find in (the cauldron boils); one the recipe does not ask is refused
 * with a little shake and nothing is spent. When the recipe is full the potion is done: the finds go, the potion is in
 * the row of the potions. Closing half way spends nothing. The game stands while the card is open.
 */
import type { Save } from '../core/save';
import { COLLECT_KINDS, type CollectKind } from '../game/collections';
import { brewReady, finishBrew, kindsOfRecipe, putIn, shownRecipes, startBrew, stillToPut, type Brew, type Recipe } from '../game/cauldron';
import { inStash } from '../game/stash';
import { SUPPLY_LOOK } from './supplies';
import './cauldron.css';

export interface CauldronHooks { save: Save; persist(): void; pause(on: boolean): void; done?(recipe: Recipe): void }

const make = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

/** What the walkthrough reads of an open card (?debug). */
export const cauldronState: { open: boolean; brew: Brew | null } = { open: false, brew: null };

/** Opens the card; it closes by its cross. */
export function openCauldron(h: CauldronHooks): void {
  let root = document.getElementById('cauldron');
  if (!root) { root = make('div'); root.id = 'cauldron'; document.body.appendChild(root); }
  root.className = '';
  root.innerHTML = '';
  const card = make('div', 'cd-card'), list = make('div', 'cd-recipes'), side = make('div', 'cd-side');
  const close = make('button', 'cd-close', '✕'), pot = make('div', 'cd-pot'), stash = make('div', 'cd-stash');
  close.id = 'cauldronClose';
  side.append(pot, stash);
  card.append(list, side, close);
  root.appendChild(card);
  h.pause(true);
  cauldronState.open = true;
  let brew: Brew | null = null;

  const draw = () => {
    list.innerHTML = '';
    for (const r of shownRecipes(h.save)) {
      const b = make('button', 'cd-recipe' + (brew?.recipe === r ? ' sel' : ''));
      b.dataset.recipe = r.id;
      for (const k of kindsOfRecipe(r)) {
        const need = r.need[k] ?? 0, have = Math.min(need, inStash(h.save, k));
        const n = make('span', 'need');
        n.append(make('span', '', `${COLLECT_KINDS[k].icon}${brew?.recipe === r ? stillToPut(brew, k) : need}`));
        const dots = make('span', 'dots');
        for (let i = 0; i < need; i++) dots.appendChild(make('i', i < have ? 'have' : ''));
        n.appendChild(dots);
        b.appendChild(n);
      }
      b.appendChild(make('span', 'gives', SUPPLY_LOOK[r.gives].icon));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); brew = startBrew(r); cauldronState.brew = brew; pot.className = 'cd-pot'; pot.textContent = ''; draw(); });
      list.appendChild(b);
    }
    stash.innerHTML = '';
    for (const k of Object.keys(COLLECT_KINDS) as CollectKind[]) {
      const n = inStash(h.save, k);
      if (!n) continue;
      const b = make('button', '', `${COLLECT_KINDS[k].icon} ${n - (brew?.put[k] ?? 0)}`);
      b.dataset.kind = k;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!brew) { b.classList.remove('no'); void b.offsetWidth; b.classList.add('no'); return; }
        if (putIn(h.save, brew, k) === 'refused') { b.classList.remove('no'); void b.offsetWidth; b.classList.add('no'); return; }
        pot.classList.remove('boil'); void pot.offsetWidth; pot.classList.add('boil');
        if (brewReady(brew) && finishBrew(h.save, brew)) {
          const r = brew.recipe;
          pot.classList.add('done'); pot.textContent = SUPPLY_LOOK[r.gives].icon;
          h.persist(); h.done?.(r);
          brew = startBrew(r); cauldronState.brew = brew;
        }
        draw();
      });
      stash.appendChild(b);
    }
  };
  draw();
  close.addEventListener('click', () => {
    root!.className = 'hidden'; root!.innerHTML = '';
    cauldronState.open = false; cauldronState.brew = null;
    h.pause(false);
  });
}
