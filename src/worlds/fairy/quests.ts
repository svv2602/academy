import type { TaskType } from '../../game/tasks/types';
import type { SkillStep } from '../../game/tasks/index';

/**
 * A quest step is a panel mini-game, a skill whose mini-game follows its level (`compose`: the missing addend or the
 * number house, src/game/tasks/index.ts) or one of the two tasks played out in the 3D world.
 */
export type Step = TaskType | SkillStep | 'butterflies' | 'stars' | 'part';
/**
 * The steps the world gives its conversation a task for (src/worlds/fairy/index.ts, `tasks`): the three in the background
 * (the butterflies, the star search, a part hidden in the world) and the three played in the world. Every other step of
 * a chain must be a panel task - a step that is neither has nothing to play it (src/game/dialogue.ts).
 */
export const TASK_STEPS = ['butterflies', 'stars', 'sort', 'order', 'compare', 'part'] as const;
/** The steps played in the world in its frame (PLAY-01; WorldDef.worldTasks): each has a task with `run`. */
export const WORLD_TASKS = ['sort', 'order', 'compare'] as const;
export interface QuestDef {
  id: 'unicorn' | 'fox' | 'mushking' | 'deer' | 'queen';
  emoji: string;
  x: number; z: number; heading: number;
  /** Three tasks; the fox and the mushroom king have a fourth step: their part hidden in the world (`part`, ./parts.ts). */
  steps: readonly Step[];
  shard: string;          // colour of the crystal shard this character guards
}

/**
 * World 1, the Fairy Kingdom: five characters, three tasks each, one shard of the Crystal of Light per character; the
 * fox and the mushroom king hide theirs in the world after their tasks and say where (WORLD-08: the step `part`).
 * The shared code sees them only as the world's `characters` (src/game/world.ts, CharacterDef).
 */
export const QUESTS: QuestDef[] = [
  { id: 'unicorn', emoji: '🦄', x: 5.2, z: -11.5, heading: -2.2, steps: ['butterflies', 'add', 'compare'], shard: '#ffe066' },
  { id: 'fox', emoji: '🦊', x: -13.5, z: 9.5, heading: 1.2, steps: ['pattern', 'odd', 'pairs', 'part'], shard: '#ff9a5c' },
  { id: 'mushking', emoji: '🍄', x: -17.5, z: -22, heading: 0.9, steps: ['count', 'sub', 'order', 'part'], shard: '#7be08a' },
  { id: 'deer', emoji: '🦌', x: 29, z: 7, heading: -1.9, steps: ['stars', 'sort', 'compose'], shard: '#6fc8ff' },
  { id: 'queen', emoji: '👑', x: -7.2, z: -46.5, heading: 0.1, steps: ['simon', 'compare', 'sub'], shard: '#c79bff' },
];
export const SHRINE = { x: 22.5, z: -8 };

/** The chain of `q` is finished - its shard is in: every step of it done (the world's part of the save). */
export const chainDone = (ws: { quests: Record<string, number> }, q: Pick<QuestDef, 'id' | 'steps'>) => (ws.quests[q.id] ?? 0) >= q.steps.length;
