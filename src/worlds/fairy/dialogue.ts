import { sfx } from '../../core/audio';
import { levelFor, recordTask } from '../../core/save';
import { pick } from '../../core/util';
import type { Game } from '../../game/context';
import { playScene, type Stage } from '../../game/stage';
import { runTask, SKILL, type TaskType } from '../../game/tasks';
import { fanfare } from '../../ui/ui';
import { tf } from '../../ui/strings';
import type { ButterfliesTask } from './butterflies-task';
import type { Npc } from './characters';
import { shardCount } from './shrine';
import type { StarSearch } from './star-search';

export interface Dialogue {
  /** A conversation with a character: the next steps of its quest, or one of its games again once it is finished. */
  talk(n: Npc): Promise<void>;
}

/**
 * The conversations of the first world (ARCH-05): each is a scene on `stage`; the deer's search and the unicorn's
 * butterflies are tasks of the world. What the cat says after a scene is said once it is over, never inside it.
 */
export function createDialogue(g: Game, stage: Stage, tasks: { search: StarSearch; butterflies: ButterfliesTask }): Dialogue {
  const { save, hero, cat, cam, sparks, persist, refreshHud, addStars, above, fault, praise, task, hooksFor } = g;
  const { line } = g.speech;
  const { search, butterflies } = tasks;

  // ----- conversations -----
  async function talk(n: Npc) {
    const q = n.def;
    let onward = () => {};      // what the cat says once the scene is over, see giveShard
    await playScene(stage, `talk ${q.id}`, async () => {
      cam.focus = above(n.pos, 1.1);
      hero.play('Talk');
      fault();
      const done = save.quests[q.id] ?? 0;
      // The deer asks its question again, under the bubble of the search: the count (and the question without the voice).
      if (search.search.active && q.id === 'deer') { const asked = line('t_stars', 'task', 0, q.emoji); search.caption(); await asked; return; }
      if (done >= 3) {           // the quest is finished: replay one of its games for stars
        await line('npc_again', 'story', 0, q.emoji);
        const type = pick(q.steps.filter((s): s is TaskType => s !== 'butterflies' && s !== 'stars'));
        const res = await task(() => runTask(type, levelFor(save, SKILL[type]), hooksFor(q.emoji)));
        if (res.solved) { recordTask(save, SKILL[type], res.wrong); addStars(1, above(hero.root.position, 1.4)); await praise(); }
        return;
      }
      if (done === 0) await line(`${q.id}_hi`, 'story', 0, q.emoji);
      for (let k = done; k < 3; k++) {
        const step = q.steps[k];
        if (step === 'stars') { search.start(n); return; }
        const skill = step === 'butterflies' ? 'count' : SKILL[step];
        const res = await task(() => step === 'butterflies' ? butterflies.count(levelFor(save, 'count')) : runTask(step, levelFor(save, skill), hooksFor(q.emoji)));
        cam.focus = above(n.pos, 1.1);
        if (!res.solved) return;                    // closed by the child: come back any time
        save.quests[q.id] = k + 1;
        recordTask(save, skill, res.wrong);
        addStars(3, above(hero.root.position, 1.4));     // the same reward with or without mistakes: trying is what counts
        if (n.actor.has('Yes')) n.actor.once('Yes', 'Idle');
        await praise();
        if (k < 2) await line('npc_next', 'story', 0, q.emoji);
      }
      onward = await giveShard(n);
    });
    onward();
  }

  /**
   * Returns what is left for after the scene: its end clears the bubble, so the cat's "go on" comes after it, and after
   * the character's thanks - a hint does not cut the story off. During the search nothing is said (see `goal`).
   */
  async function giveShard(n: Npc): Promise<() => void> {
    const count = shardCount(save);
    sfx('fanfare');
    hero.play('Dance'); cat.play('Dance');
    sparks.burst(above(n.pos, 2), n.def.shard, 60, 6); sparks.burst(above(n.pos, 2), '#fff2a8', 40, 5);
    refreshHud(); persist();
    const thanks = line('npc_done', 'story', 0, n.def.emoji);
    await fanfare('shard_title', tf('shard_text', { n: count }), n.def.shard);
    cat.play('Idle');
    if (count === 5) { await line('all_shards', 'story'); return () => {}; }
    // While the stars are searched for they are where the sparkles lead: no "go on", the bubble stays the search's.
    return () => { void thanks.then(() => (search.search.active ? undefined : line('go_next', 'hint', 5000))); };
  }

  return { talk };
}
