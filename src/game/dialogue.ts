import { sfx } from '../core/audio';
/**
 * How many times the game has decided, after a shard's thanks, whether to say "go on" (go_next): the walkthrough
 * (`__game.shardsSettled`) waits for this instead of a while of game time, which a starved runner may never reach.
 */
export const shardsSettled = { n: 0 };
import { fanfare } from '../ui/ui';
import { bindAchievements } from '../ui/achieve';
import { stopPoint } from './stops';
import { tf } from '../ui/strings';
import type { Game } from './context';
import { levelFor, recordTask, type SkillId } from './skills';
import { playScene, type Stage } from './stage';
import { weakest } from './planner';
import { SKILL } from './taskviews/panel';
import type { TaskType } from './tasks/types';
import { isSkillStep, typeOf, type SkillStep } from './tasks/index';
import type { TaskResult } from './taskviews/panel';
import type { CharacterDef, Npc, WorldLines, WorldTask } from './world';
import { todayOffer, trade, tradeHold, tradeHooks, type Offer, type Trades } from './trade';
import { dailyDay } from './daily-find';
import { chooseTalk, openTrade } from '../ui/trade';
import type { SpokenKey } from '../ui/strings';

export interface Dialogue {
  /** A conversation with a character: the next steps of its chain, or one of its games again once it is finished. */
  talk(n: Npc): Promise<void>;
  /**
   * Step `k` of `n`'s chain done by a task in the background (its `done`, or the world itself after a reload, when the
   * task started in an earlier session): the chain moves on and gives its stars; the last step gives the part at once.
   * `played`: the task ended in a task played in the world (swim to the gate, then the lock there): its result goes to
   * the step's skill as a task in the foreground's would; without it the step records nothing (the nuts, the maze).
   */
  stepDone(n: Npc, k: number, played?: TaskResult): void;
}

/** What the conversation needs of a world: its characters, the lines of its own, and its tasks by the id of their step. */
export interface DialogueWorld {
  readonly characters: readonly CharacterDef[];
  readonly lines: WorldLines;
  readonly tasks: Readonly<Record<string, WorldTask>>;
  /** The asks of its characters for a trade (PLAY-28, src/game/trade.ts), by their ids; none - no trades in this world. */
  readonly trades?: Trades;
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
  const { characters, lines, tasks, trades } = world;
  /** The cat tells what a trade is the first time a character offers one in a session. */
  let tradeTold = false;
  tradeHooks.offer = trades ? (who, day) => (trades[who] ? todayOffer(save, ws, who, trades[who], day) : null) : null;
  const background = Object.values(tasks).filter((t) => t.start);
  // Every panel task of the conversations is planned (src/game/planner.ts, one planner for the session, `g.plan`): the
  // examples with mistakes come back, the same task never twice in a row.
  const { plan } = g;
  // The stop points of this game (src/game/stops.ts): the achievements' scene comes in at them.
  bindAchievements(g);

  const finished = (c: CharacterDef) => (ws.quests[c.id] ?? 0) >= c.steps.length;
  // A panel step names a task type, or a skill whose type follows the level (R34: "compose", the composition of a number).
  type PanelStep = TaskType | SkillStep;
  const isPanel = (s: string): s is PanelStep => s in SKILL || isSkillStep(s);
  const skillOf = (s: PanelStep): SkillId => (isSkillStep(s) ? s : SKILL[s]);

  // ----- conversations -----
  /** How many times each character was met after its chain: its `again` lines in turn. */
  const metAgain = new Map<string, number>();
  async function talk(n: Npc) {
    const q = n.def;
    let onward = () => {};      // what the cat says once the scene is over, see givePart
    await playScene(stage, `talk ${q.id}`, async () => {
      cam.focus = above(n.pos, 1.1);
      hero.play('Talk');
      // a character with a clip of its talk says its first words with it (the forest's, 2026-11-21), then stands again
      if (n.actor.has('Talk')) n.actor.once('Talk', 'Idle');
      fault();
      const done = ws.quests[q.id] ?? 0;
      // The character's own task of the world is on: it asks its question again, under that task's bubble.
      const own = background.find((t) => t.active?.() && t.owner?.() === q.id);
      if (own) { await own.reask?.(n); return; }
      if (done >= q.steps.length) {           // the chain is finished: replay its game of the weakest skill for stars (LEARN-16)
        // a trade asked today (PLAY-28): the choice first - play, trade or goodbye; without an ask, as it always was
        const offer = trades?.[q.id] && !tradeHold.held ? todayOffer(save, ws, q.id, trades[q.id], dailyDay()) : null;
        if (offer) {
          if (!tradeTold) { tradeTold = true; await line('trade_hi', 'story'); }
          const pick = await chooseTalk(q.emoji);
          if (pick === 'bye') return;
          if (pick === 'trade') { await tradeWith(n, offer); return; }
        }
        // its own words of a meeting again, in turn (CharacterDef.again), or the shared one
        const again = q.again?.length ? q.again[(metAgain.get(q.id) ?? 0) % q.again.length] : 'npc_again';
        metAgain.set(q.id, (metAgain.get(q.id) ?? 0) + 1);
        await line(again, 'story', 0, q.emoji);
        const step = weakest(q.steps.filter(isPanel), skillOf, save, g.rng), skill = skillOf(step), level = levelFor(save, skill);
        const res = await task(() => plan.runTask(typeOf(step, level), level, hooksFor(q.emoji), g.rng));
        if (res.solved) { recordTask(save, skill, res.wrong, res.helped === true); addStars(1, above(hero.root.position, 1.4)); await praise(); await stopPoint('task'); }
        return;
      }
      if (done === 0 && q.hi) await line(q.hi, 'story', 0, q.emoji);
      for (let k = done; k < q.steps.length; k++) {
        const step = q.steps[k];
        const wt: WorldTask | undefined = tasks[step];
        // what the step is about, in the character's words (CharacterDef.asks), before its task
        const ask = q.asks?.[k];
        if (ask) await line(ask, 'story', 0, q.emoji);
        if (wt?.start) {
          // A task in the background: the chain moves on when it is done, the conversation ends here.
          wt.start(n, (played) => stepDone(n, k, played));
          return;
        }
        const skill = wt ? wt.skill : skillOf(step as PanelStep), level = levelFor(save, skill);
        const inWorld = !!wt?.run && (wt.inWorld?.(level) ?? true);   // a task in the world plays some levels only (PLAY-01)
        const res = await task(() => inWorld ? wt!.run!(n, level) : plan.runTask(typeOf(step as PanelStep, level), level, hooksFor(q.emoji), g.rng));
        cam.focus = above(n.pos, 1.1);
        if (!res.solved) return;                    // closed by the child: come back any time
        ws.quests[q.id] = k + 1;
        recordTask(save, skill, res.wrong, res.helped === true);   // with a helper: no level up (src/game/helpers.ts)
        addStars(3, above(hero.root.position, 1.4));     // the same reward with or without mistakes: trying is what counts
        if (n.actor.has('Yes')) n.actor.once('Yes', 'Idle');
        await praise();
        // A stop point after the praise; after the last step the card of the part comes first, and its own point.
        if (k < q.steps.length - 1) { await stopPoint('task'); await line('npc_next', 'story', 0, q.emoji); }
      }
      onward = await givePart(n);
    });
    onward();
  }

  /**
   * A trade with `n` (PLAY-28): it says its ask in its own voice, the card shows what goes and what comes; on
   * «Обміняти» the finds go, the gift comes (5 stars for its own finds, 15 for far ones), it thanks, the cat says the trade is done.
   */
  async function tradeWith(n: Npc, offer: Offer) {
    const q = n.def;
    void line(`${q.id}_trade_${offer.far ? 'far' : 'ask'}` as SpokenKey, 'story', 0, q.emoji);
    if (!await openTrade(save, q.emoji, offer)) return;
    const gift = trade(save, ws, q.id, offer, dailyDay());
    if (!gift) return;
    if (gift === 'stars') addStars(offer.far ? 15 : 5, above(hero.root.position, 1.4));
    else { sfx('chime'); sparks.burst(above(hero.root.position, 1.6), '#ffd36b', 40, 4); refreshHud(); persist(); }
    hero.play('Dance');
    if (n.actor.has('Yes')) n.actor.once('Yes', 'Idle');
    await line(`${q.id}_trade_thanks` as SpokenKey, 'story', 0, q.emoji);
    await line('trade_done', 'story');
    hero.play('Idle');
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
    const thanks = line(n.def.thanks ?? lines.partGiven, 'story', 0, n.def.emoji);
    // its own word after the thanks (CharacterDef.after: a request that opens what comes next), in place of "go on"
    const after = n.def.after, ask = after ? () => line(after, 'story', 0, n.def.emoji) : null;
    await fanfare(lines.partTitle, tf(lines.partText, { n: count }), n.def.shard);
    cat.play('Idle');
    // The last part: "every shard is back" belongs to its moment, before an achievement's scene (the stop point after it).
    if (count === characters.length) { await line(lines.allParts, 'story'); await stopPoint('part'); return () => { if (ask) void ask(); shardsSettled.n++; }; }
    await stopPoint('part');
    return () => {
      void thanks.then(() => {
        if (ask) void ask();
        else if (!background.some((t) => t.active?.())) void line('go_next', 'hint', 5000);
        shardsSettled.n++;
      });
    };
  }

  function stepDone(n: Npc, k: number, played?: TaskResult) {
    const q = n.def;
    if ((ws.quests[q.id] ?? 0) > k) return;      // done already
    ws.quests[q.id] = k + 1;
    const skill = tasks[q.steps[k]]?.skill, res = played;
    if (res?.solved && skill) recordTask(save, skill, res.wrong, res.helped === true);
    addStars(3, above(hero.root.position, 1.2));
    // the last step of the chain done in the background (a part hidden in the world, WORLD-08): its part now, in a
    // scene of its own, and the cat's "go on" after it - as at the end of a conversation
    if (finished(q)) {
      let onward = () => {};
      void playScene(stage, `part ${q.id}`, async () => { onward = await givePart(n); }).then(() => onward());
    }
  }

  return { talk, stepDone };
}
