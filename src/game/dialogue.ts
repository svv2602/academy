import { sfx } from '../core/audio';
import { fanfare } from '../ui/ui';
import { tf } from '../ui/strings';
import type { Game } from './context';
import { levelFor, recordTask, type SkillId } from './skills';
import { playScene, type Stage } from './stage';
import { createPlanner, weakest } from './planner';
import { SKILL } from './taskviews/panel';
import type { TaskType } from './tasks/types';
import { isSkillStep, typeOf, type SkillStep } from './tasks/index';
import type { CharacterDef, Npc, WorldLines, WorldTask } from './world';

export interface Dialogue {
  /** A conversation with a character: the next steps of its chain, or one of its games again once it is finished. */
  talk(n: Npc): Promise<void>;
}

/** What the conversation needs of a world: its characters, the lines of its own, and its tasks by the id of their step. */
export interface DialogueWorld {
  readonly characters: readonly CharacterDef[];
  readonly lines: WorldLines;
  readonly tasks: Readonly<Record<string, WorldTask>>;
}

/**
 * The conversations of any world (ARCH-06): each is a scene on `stage`. A step of a chain is a panel task, or the id of
 * one of the world's tasks: a foreground one (`run`) the conversation waits for, a background one (`start`) moves the
 * chain on by itself when it calls `done`. Finishing a chain gives its character's part; all the parts, the world's
 * last words. What the cat says after a scene is said once it is over, never inside it.
 */
export function createDialogue(g: Game, stage: Stage, world: DialogueWorld): Dialogue {
  const { save, ws, hero, cat, cam, sparks, persist, refreshHud, addStars, above, fault, praise, task, hooksFor } = g;
  const { line } = g.speech;
  const { characters, lines, tasks } = world;
  const background = Object.values(tasks).filter((t) => t.start);
  // Every panel task of the conversations is planned (src/game/planner.ts): the examples with mistakes come back, the
  // same task never twice in a row.
  const plan = createPlanner(save);

  const finished = (c: CharacterDef) => (ws.quests[c.id] ?? 0) >= c.steps.length;
  // A panel step names a task type, or a skill whose type follows the level (R34: "compose", the composition of a number).
  type PanelStep = TaskType | SkillStep;
  const isPanel = (s: string): s is PanelStep => s in SKILL || isSkillStep(s);
  const skillOf = (s: PanelStep): SkillId => (isSkillStep(s) ? s : SKILL[s]);

  // ----- conversations -----
  async function talk(n: Npc) {
    const q = n.def;
    let onward = () => {};      // what the cat says once the scene is over, see givePart
    await playScene(stage, `talk ${q.id}`, async () => {
      cam.focus = above(n.pos, 1.1);
      hero.play('Talk');
      fault();
      const done = ws.quests[q.id] ?? 0;
      // The character's own task of the world is on: it asks its question again, under that task's bubble.
      const own = background.find((t) => t.active?.() && t.owner?.() === q.id);
      if (own) { await own.reask?.(n); return; }
      if (done >= q.steps.length) {           // the chain is finished: replay its game of the weakest skill for stars (LEARN-16)
        await line('npc_again', 'story', 0, q.emoji);
        const step = weakest(q.steps.filter(isPanel), skillOf, save, g.rng), skill = skillOf(step), level = levelFor(save, skill);
        const res = await task(() => plan.runTask(typeOf(step, level), level, hooksFor(q.emoji), g.rng));
        if (res.solved) { recordTask(save, skill, res.wrong); addStars(1, above(hero.root.position, 1.4)); await praise(); }
        return;
      }
      if (done === 0 && q.hi) await line(q.hi, 'story', 0, q.emoji);
      for (let k = done; k < q.steps.length; k++) {
        const step = q.steps[k];
        const wt: WorldTask | undefined = tasks[step];
        if (wt?.start) {
          // A task in the background: the chain moves on when it is done, the conversation ends here.
          wt.start(n, () => {
            ws.quests[q.id] = Math.max(ws.quests[q.id] ?? 0, k + 1);
            addStars(3, above(hero.root.position, 1.2));
          });
          return;
        }
        const skill = wt ? wt.skill : skillOf(step as PanelStep), level = levelFor(save, skill);
        const res = await task(() => wt?.run ? wt.run(n, level) : plan.runTask(typeOf(step as PanelStep, level), level, hooksFor(q.emoji), g.rng));
        cam.focus = above(n.pos, 1.1);
        if (!res.solved) return;                    // closed by the child: come back any time
        ws.quests[q.id] = k + 1;
        recordTask(save, skill, res.wrong);
        addStars(3, above(hero.root.position, 1.4));     // the same reward with or without mistakes: trying is what counts
        if (n.actor.has('Yes')) n.actor.once('Yes', 'Idle');
        await praise();
        if (k < q.steps.length - 1) await line('npc_next', 'story', 0, q.emoji);
      }
      onward = await givePart(n);
    });
    onward();
  }

  /**
   * Returns what is left for after the scene: its end clears the bubble, so the cat's "go on" comes after it, and after
   * the character's thanks - a hint does not cut the story off. While a task of the world runs in the background its
   * bubble leads the way: nothing is said.
   */
  async function givePart(n: Npc): Promise<() => void> {
    const count = characters.filter(finished).length;
    sfx('fanfare');
    hero.play('Dance'); cat.play('Dance');
    sparks.burst(above(n.pos, 2), n.def.shard, 60, 6); sparks.burst(above(n.pos, 2), '#fff2a8', 40, 5);
    refreshHud(); persist();
    const thanks = line(lines.partGiven, 'story', 0, n.def.emoji);
    await fanfare(lines.partTitle, tf(lines.partText, { n: count }), n.def.shard);
    cat.play('Idle');
    if (count === characters.length) { await line(lines.allParts, 'story'); return () => {}; }
    return () => { void thanks.then(() => (background.some((t) => t.active?.()) ? undefined : line('go_next', 'hint', 5000))); };
  }

  return { talk };
}
