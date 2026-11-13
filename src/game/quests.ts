import type { TaskType } from './tasks';

/** A quest step is a panel mini-game or one of the two tasks played out in the 3D world. */
export type Step = TaskType | 'butterflies' | 'stars';
export interface QuestDef {
  id: 'unicorn' | 'fox' | 'mushking' | 'deer' | 'queen';
  emoji: string;
  x: number; z: number; heading: number;
  steps: [Step, Step, Step];
  shard: string;          // colour of the crystal shard this character guards
}

/**
 * World 1, the Fairy Kingdom: five characters, three tasks each, one shard of the Crystal of Light per character.
 * Other worlds plug in the same way: a list like this plus a scenery builder.
 */
export const QUESTS: QuestDef[] = [
  { id: 'unicorn', emoji: '🦄', x: 5.2, z: -11.5, heading: -2.2, steps: ['butterflies', 'add', 'compare'], shard: '#ffe066' },
  { id: 'fox', emoji: '🦊', x: -13.5, z: 9.5, heading: 1.2, steps: ['pattern', 'odd', 'pairs'], shard: '#ff9a5c' },
  { id: 'mushking', emoji: '🍄', x: -17.5, z: -22, heading: 0.9, steps: ['count', 'sub', 'order'], shard: '#7be08a' },
  { id: 'deer', emoji: '🦌', x: 29, z: 7, heading: -1.9, steps: ['stars', 'sort', 'add'], shard: '#6fc8ff' },
  { id: 'queen', emoji: '👑', x: -7.2, z: -46.5, heading: 0.1, steps: ['simon', 'compare', 'sub'], shard: '#c79bff' },
];
export const SHRINE = { x: 22.5, z: -8 };
