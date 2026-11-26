import type { Hint } from '../../game/tasks/types';
import type { SpokenKey } from '../../ui/strings';

/**
 * The Sweet Land's own recorded words over a shared world task (docs/worlds/world-4.md, the lines taken on 2026-11-18):
 * the shared generators (src/game/worldtasks/house.ts, bridge.ts, scales.ts) give the game's common question and hint;
 * the world says its own, keeping what each rung of the hint shows. `null` keeps a rung's common line.
 */
export function ownHint(hint: Hint, keys: readonly [SpokenKey | null, SpokenKey | null, SpokenKey | null]): Hint {
  const [a, b, c] = hint.rungs;
  return { rungs: [{ ...a, key: keys[0] ?? a.key }, { ...b, key: keys[1] ?? b.key }, { ...c, key: keys[2] ?? c.key }] };
}
