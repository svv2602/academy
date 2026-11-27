/**
 * The card of the magic board (src/game/trainer.ts): the skills she may train, each a big button with its picture and
 * its name; over them, from two on, the days in a row. A skill touched closes the card and starts its session; the
 * cross closes it with nothing started. The game stands while the card is open.
 */
import type { Save } from '../core/save';
import type { SkillId } from '../game/skills';
import { trainDays, trainSkills } from '../game/trainer';
import { t, tf, type Key } from './strings';
import './trainer.css';

/** The picture of each skill on its button. */
export const SKILL_ICON: Record<SkillId, string> = {
  count: '🍎', add: '➕', sub: '➖', compare: '⚖️', series: '🔢', pattern: '🔁', memory: '🧠', classify: '🧺',
  compose: '🏠', attention: '🔍', assemble: '🧩',
};

export interface BoardHooks { save: Save; pause(on: boolean): void; say?(): void; pick(skill: SkillId): void }

const make = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

/** What the walkthrough reads of the card (?debug). */
export const boardState: { open: boolean; skills: SkillId[] } = { open: false, skills: [] };

/** Opens the card; it closes by its cross or by a skill chosen. */
export function openBoard(h: BoardHooks): void {
  let root = document.getElementById('board');
  if (!root) { root = make('div'); root.id = 'board'; document.body.appendChild(root); }
  root.className = '';
  root.innerHTML = '';
  const card = make('div', 'bd-card'), close = make('button', 'bd-close', '✕'), list = make('div', 'bd-skills');
  close.id = 'boardClose';
  card.append(make('h2', '', t('board_title')));
  const days = trainDays(h.save);
  if (days >= 2) card.append(make('p', 'bd-days', tf('board_days', { n: days })));
  const shut = () => { root!.className = 'hidden'; root!.innerHTML = ''; boardState.open = false; boardState.skills = []; h.pause(false); };
  const skills = trainSkills(h.save);
  for (const k of skills) {
    const b = make('button', 'bd-skill');
    b.dataset.skill = k;
    b.append(make('span', 'ic', SKILL_ICON[k]), make('span', 'nm', t(('sk_' + k) as Key)));
    b.addEventListener('click', () => { shut(); h.pick(k); });
    list.appendChild(b);
  }
  card.append(list, close);
  root.appendChild(card);
  close.addEventListener('click', shut);
  h.pause(true);
  boardState.open = true; boardState.skills = skills;
  h.say?.();
}
