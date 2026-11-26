// @vitest-environment happy-dom
/**
 * The customer's rule (2026-11-26): a character of any world gives three tasks at most. The search for a part of the
 * world's artifact (the step 'part': she walks to it in the world) is no task and is not counted.
 */
import { describe, expect, it, vi } from 'vitest';
import { QUESTS } from './fairy/quests';
import { FRIENDS as forest } from './forest';
import { FRIENDS as sea } from './sea';
import { FRIENDS as sky } from './sky';
import { FRIENDS as sweet } from './sweet';

// a world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed for its chains
vi.mock('../game/fx', () => ({ glowTex: null, Sparks: class {} }));

/** Most tasks a character gives. */
const MOST_TASKS = 3;
/** The step of a chain that is no task: the search for a part of the artifact in the world. */
const NOT_A_TASK = 'part';

const WORLDS: Record<string, readonly { id: string; steps: readonly unknown[] }[]> = { fairy: QUESTS, forest, sea, sweet, sky };
/** The tasks of a chain: its steps without the search for a part of the artifact. */
const tasks = (steps: readonly unknown[]) => steps.filter((s) => s !== NOT_A_TASK);

describe('the chains of the worlds\' characters', () => {
  it.each(Object.keys(WORLDS))('%s: every character gives three tasks at most, the search for a part not counted', (world) => {
    for (const c of WORLDS[world]) expect(tasks(c.steps).length, `${world}: ${c.id} (${JSON.stringify(c.steps)})`).toBeLessThanOrEqual(MOST_TASKS);
  });

  it('every world with characters of its own is held to it', () => {
    const own = import.meta.glob('./*/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const withFriends = Object.entries(own).filter(([, src]) => /^export const FRIENDS\b/m.test(src)).map(([p]) => p.split('/')[1]);
    expect([...withFriends, 'fairy'].sort()).toEqual(Object.keys(WORLDS).sort());
  });

  it('counts what the rule says: four steps with a part are three tasks, four without are four', () => {
    expect(tasks(['count', 'sub', 'order', 'part'])).toHaveLength(3);
    expect(tasks(['count', 'neighbors', 'sort', 'puzzle'])).toHaveLength(4);
  });
});
