/**
 * The scene of an achievement received (PLAY-08, R03): the card of the fanfare (#fanfare) with the achievement's own
 * sign in place of the crystal and its name, the heroine and the cat dance, the cat's line as a subtitle only (its voice
 * comes once it is recorded). One tap on the button ends it. It runs at a stop point (src/game/stops.ts): never over a
 * task, a question, a hint or the card of a part.
 */
import { inTask, sfx } from '../core/audio';
import { pick } from '../core/util';
import { ACHIEVEMENTS, unshown, type AchContext, type AchievementId } from '../game/achievements';
import type { Game } from '../game/context';
import { achievementStop, bindStops, onStop, setScreen, worldContext } from '../game/stops';
import { isSkillStep } from '../game/tasks/index';
import { SKILL } from '../game/taskviews/panel';
import type { SkillId } from '../game/skills';
import { PRAISE, t, type Key } from './strings';
import { el, fanfare } from './ui';

/**
 * What window.__game reads (src/game/debug.ts). `held`: the scenes wait in the queue (the achievements are still
 * granted) - set only by the walkthrough, with ?debug, through `__game.ach.hold()` / `release()` around a block that
 * measures something a scene would disturb; the game itself never holds them. `scene`: the achievement whose card is
 * on screen; `log`: the ids whose scene was shown in this page, in order.
 */
export const achState = {
  held: false,
  scene: null as AchievementId | null,
  shown: 0,
  log: [] as AchievementId[],
};

const skillOf = (s: string): SkillId | null => (isSkillStep(s) ? s : s in SKILL ? SKILL[s as keyof typeof SKILL] : null);

/**
 * The worlds the conditions count: the world being played, read through `g` at every point (`g.world`, its description
 * as src/main.ts hands it in) - never kept, a change of world brings its own. The shared code may not import the
 * registry (ARCH-10). Achievements of other worlds already received stay received (they are in the save).
 */
function context(g: Game): AchContext {
  return worldContext(g.world, skillOf);   // the pure function of src/game/stops.ts, tested there
}

/** The achievements waiting for their scene. */
export const queue = (g: Game) => unshown(g.save);

async function scene(g: Game, id: AchievementId) {
  const a = ACHIEVEMENTS.find((x) => x.id === id)!;
  const gem = el.fanfare.querySelector('.gem') as HTMLElement, sign = gem.textContent;
  const own = !g.busy;
  if (own) { g.busy = true; g.auto = null; }
  gem.textContent = a.icon;
  el.fanfare.classList.add('ach');
  sfx('fanfare');
  g.hero.play('Dance'); g.cat.play('Dance');
  // The cat's line: its subtitle only, no voice yet.
  g.speech.caption({ key: pick(PRAISE), pri: 'story', hold: 0, speaker: '🐱' });
  achState.scene = id; achState.log.push(id);
  try {
    await fanfare('ach_title', t(`ach_${id}_t` as Key), '#ffd95e');
  } finally {
    achState.scene = null; achState.shown++;
    gem.textContent = sign;
    el.fanfare.classList.remove('ach');
    g.speech.caption(null);
    g.cat.play('Idle'); g.hero.play('Idle');
    if (own) g.busy = false;
  }
}

let bound = false;
/** The game the scenes are bound to: the book of treasures reads `g.world` and `g.ws` of it at every opening (src/ui/book.ts). */
export let achGame: Game | null = null;
/** Joins the achievements to the stop points of the game `g` (once; the conversation of a world calls it). */
export function bindAchievements(g: Game) {
  bindStops(g); achGame = g;
  if (bound) return;
  bound = true;
  setScreen({ taskOpen: () => inTask(), cardOpen: () => !el.fanfare.classList.contains('hidden') });
  onStop(async () => {
    await achievementStop(g.save, context(g), achState.held ? null : (id) => scene(g, id), g.persist);
  });
}
