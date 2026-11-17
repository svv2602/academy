/**
 * The stop points of the game (PLAY-08, R43): the calm moments where something of its own may come in - after a task's
 * praise, after the card of an artifact's part, when the book is closed, when "Play" is pressed. There is one function,
 * `stopPoint`; whoever wants such a moment subscribes (`onStop`): the cat's break (src/game/session.ts, subscribed here,
 * first), the achievements' scene (src/ui/achieve.ts). A point never comes in over a task, over a card, over the book
 * or the shop: then it is skipped, and what waits waits for the next one.
 *
 * Pure of the page: the screen is told by `setScreen` (src/ui/achieve.ts), the game by `bindStops` (the conversation,
 * src/game/dialogue.ts), so that the unit test plays the points with stand-ins.
 */
import type { Save } from '../core/save';
import { check, markShown, noteDay, unshown, type AchContext, type AchievementId, type WorldFacts } from './achievements';
import type { WorldEntry } from './context';
import { breakStop } from './session';
import type { SkillId } from './skills';
import type { WorldDef } from './world';

/**
 * Where the point is. `task` and `part` come inside a conversation, which holds the controls itself (`busy`): the
 * scene runs inside it. `book` and `play` come with the controls free, and need them free.
 */
export type StopWhere = 'task' | 'part' | 'book' | 'play';

/** What a point needs of the game (`Game` of src/game/context.ts has all of it). */
export interface StopHost {
  readonly save: Save;
  busy: boolean;
  readonly paused: boolean;
  persist(): void;
}

/** What is on the screen: a task open (its panel or one in the world), a card (a part, an achievement). */
export interface StopScreen { taskOpen(): boolean; cardOpen(): boolean }

export type StopSubscriber = (g: StopHost, where: StopWhere) => Promise<void> | void;

const INSIDE: readonly StopWhere[] = ['task', 'part'];
const subscribers: StopSubscriber[] = [];
let screen: StopScreen = { taskOpen: () => false, cardOpen: () => false };
let host: StopHost | null = null;

/** Adds a subscriber; they run in the order they came, one after the other. Returns its removal. */
export function onStop(fn: StopSubscriber): () => void {
  subscribers.push(fn);
  return () => { const at = subscribers.indexOf(fn); if (at >= 0) subscribers.splice(at, 1); };
}
// The break (PLAY-20): whether one is due is read at every point; it only puts an offer for its screen, never waits.
onStop(breakStop);
export function setScreen(s: StopScreen) { screen = s; }
/** The game the points of the book and of "Play" (which do not know it) belong to. */
export function bindStops(g: StopHost) { host = g; }

/** Whether a point may come in now: never over a task, a card, the book or the shop; outside a conversation, never in a scene. */
export function mayStop(g: StopHost, where: StopWhere): boolean {
  if (g.paused || screen.taskOpen() || screen.cardOpen()) return false;
  return INSIDE.includes(where) || !g.busy;
}

/** A stop point: the subscribers, in order, if it may come in now. `g` defaults to the bound game. */
export async function stopPoint(where: StopWhere, g: StopHost | null = host): Promise<void> {
  if (!g) return;
  for (const fn of subscribers) {
    if (!mayStop(g, where)) return;
    await fn(g, where);
  }
}

/** "Play" (R44): the day is counted, then the point. */
export async function atPlay(g: StopHost | null = host): Promise<void> {
  if (!g) return;
  if (noteDay(g.save)) g.persist();
  try { await stopPoint('play', g); } finally { played.n++; }
}
/** The stop points of "Play" over (a scene shown or not): the walkthrough waits for it before it taps (__game.ach.plays). */
export const played = { n: 0 };

/**
 * The achievements at a point: every one earned is granted (the save keeps it for ever), and the first of those whose
 * scene has not been shown gets it - one scene per point, the others wait for the next (R43). The scene is marked shown
 * once it is over, so a page closed in the middle of it shows it again.
 * `show` is null while the scenes are held: then the achievements are only granted.
 */
export async function achievementStop(save: Save, ctx: AchContext, show: ((id: AchievementId) => Promise<void>) | null,
  persist: () => void, now = Date.now()): Promise<AchievementId | null> {
  const got = check(save, ctx, now);
  const next = show ? unshown(save)[0] : undefined;
  if (got.length) persist();
  if (!next || !show) return null;
  await show(next);
  markShown(save, next);
  persist();
  return next;
}

/** A world's facts for the conditions, from its description (src/game/world.ts). */
export function worldFacts(w: Pick<WorldDef, 'id' | 'characters' | 'secrets' | 'chest' | 'groundStars'>): WorldFacts {
  return {
    id: w.id,
    quests: w.characters.map((c) => ({ id: c.id, steps: c.steps })),
    groundStars: Array.from({ length: w.groundStars ?? 0 }, (_, i) => i),
    ...(w.chest === undefined ? {} : { chest: w.chest }),
    secrets: w.secrets ?? [],
  };
}

/**
 * The context of the conditions: the facts of the worlds, and the skills their chains train. `skillOf` gives the skill of
 * a step, or null for a step that is one of a world's own tasks (its skill is that of a panel task as well).
 */
export function achContext(worlds: readonly Parameters<typeof worldFacts>[0][], skillOf: (step: string) => SkillId | null): AchContext {
  const skills = new Set<SkillId>();
  for (const w of worlds) for (const c of w.characters) for (const s of c.steps) { const k = skillOf(s); if (k) skills.add(k); }
  return { worlds: worlds.map(worldFacts), skills: [...skills] };
}

/**
 * The context of the conditions at a point: the world being played, from its description as the game holds it
 * (`g.world`, read by the caller at every point - never kept), and the skills of its chains. A world without a chest or
 * ground stars counts none (`secret_chest`, `all_world_stars` cannot come of it). The shared code may not import the
 * registry (ARCH-10): the other worlds' achievements already received stay in the save.
 */
export function worldContext(w: Pick<WorldEntry, 'id' | 'characters' | 'secrets' | 'chest' | 'groundStars'>,
  skillOf: (step: string) => SkillId | null): AchContext {
  return achContext([{ id: w.id, characters: w.characters ?? [], secrets: w.secrets, chest: w.chest, groundStars: w.groundStars }], skillOf);
}
