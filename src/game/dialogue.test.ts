// @vitest-environment happy-dom
/**
 * A step of a chain done in the background (src/game/dialogue.ts `stepDone`): the chain moves on and gives its stars;
 * a step that ended in a task played in the world (the sea's shell lock) hands its result, which goes to the step's
 * skill as a task in the foreground's would - without one (the nuts, the maze, a pearl) no skill is touched.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, defaultWorld } from '../core/save';
import { beginTask, endTask } from '../core/voice';
import type { Game } from './context';
import { createDialogue } from './dialogue';
import type { CharacterDef, Npc, WorldTask } from './world';

vi.mock('../ui/achieve', () => ({ bindAchievements: () => {} }));
vi.mock('../ui/ui', () => ({ fanfare: () => Promise.resolve() }));
vi.mock('./stops', () => ({ stopPoint: () => Promise.resolve() }));
vi.mock('./stage', () => ({ playScene: (_s: unknown, _n: string, f: () => Promise<void>) => f() }));

const QUEEN: CharacterDef = { id: 'queen', emoji: '🧜‍♀️', x: 0, z: 0, heading: 0, steps: ['compare', 'lock', 'nuts'], shard: '#fff' } as CharacterDef;

function world() {
  const save = defaultSave(), ws = defaultWorld();
  const stars: number[] = [];
  const g = {
    save, ws, plan: {}, rng: () => 0.5,
    hero: { root: new THREE.Object3D(), play: () => {} }, cat: { play: () => {} }, cam: {}, sparks: { burst: () => {} },
    persist: () => {}, refreshHud: () => {}, addStars: (n: number) => { stars.push(n); }, above: () => new THREE.Vector3(),
    fault: () => {}, praise: () => Promise.resolve(), task: () => Promise.resolve({ solved: false, wrong: 0 }), hooksFor: () => ({}),
    speech: { line: () => Promise.resolve() },
  } as unknown as Game;
  const lock: WorldTask = { skill: 'compose', start: () => {}, endsInWorld: true };
  const nuts: WorldTask = { skill: 'count', start: () => {} };
  const d = createDialogue(g, {} as never, { characters: [QUEEN], lines: { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'sea_part', partText: 'sea_count' } as never, tasks: { lock, nuts } });
  const npc = { def: QUEEN } as Npc;
  return { save, ws, stars, d, npc };
}

describe('a step done in the background (src/game/dialogue.ts stepDone)', () => {
  it('with the result of the task played at its end: the chain moves on, 3 stars, one task more in the step\'s skill', () => {
    const { save, ws, stars, d, npc } = world();
    ws.quests.queen = 1;
    const before = { ...save.skills.compose };
    d.stepDone(npc, 1, { solved: true, wrong: 2 });
    expect(ws.quests.queen).toBe(2);
    expect(stars).toEqual([3]);
    expect(save.skills.compose.tasks).toBe(before.tasks + 1);
    expect(save.skills.compose.errors).toBe(before.errors + 2);
  });

  it('without a result (the nuts, the maze, a pearl): the chain moves on, no skill is touched; a step done already is done once', () => {
    const { save, ws, stars, d, npc } = world();
    ws.quests.queen = 1;
    const skills = JSON.stringify(save.skills);
    d.stepDone(npc, 1);
    expect(ws.quests.queen).toBe(2);
    expect(JSON.stringify(save.skills)).toBe(skills);
    d.stepDone(npc, 1, { solved: true, wrong: 0 });
    expect(ws.quests.queen).toBe(2);
    expect(stars).toEqual([3]);
    expect(JSON.stringify(save.skills)).toBe(skills);
  });
});

/** A character of a next world with its own lines (CharacterDef asks, thanks, again): what the conversation says. */
describe('a character\'s own lines (CharacterDef asks, thanks, again)', () => {
  const CRAB: CharacterDef = {
    id: 'crab', emoji: '🦀', x: 0, z: 0, heading: 0, steps: ['compare', 'nuts'], shard: '#fff',
    hi: 'crab_hi', asks: ['crab_t1', 'crab_t2'], thanks: 'crab_done', again: ['crab_again_1', 'crab_again_2'],
  } as unknown as CharacterDef;
  /** `def`: the crab with more of its own lines; `more`: other characters of the world (its part is not the last then). */
  function crab(def: CharacterDef = CRAB, more: readonly CharacterDef[] = []) {
    const save = defaultSave(), ws = defaultWorld(), said: string[] = [];
    const g = {
      save, ws, plan: {}, rng: () => 0.5,
      hero: { root: new THREE.Object3D(), play: () => {} }, cat: { play: () => {} }, cam: {}, sparks: { burst: () => {} },
      persist: () => {}, refreshHud: () => {}, addStars: () => {}, above: () => new THREE.Vector3(),
      fault: () => {}, praise: () => Promise.resolve(), task: () => Promise.resolve({ solved: true, wrong: 0 }), hooksFor: () => ({}),
      speech: { line: (k: string, _p: string, _ms?: number, who?: string) => { said.push(`${k}${who ? ` ${who}` : ''}`); return Promise.resolve(); } },
    } as unknown as Game;
    const nuts: WorldTask = { skill: 'count', start: () => {} };
    const d = createDialogue(g, {} as never, { characters: [def, ...more], lines: { partGiven: 'npc_next', allParts: 'all_parts', partTitle: 'go_next', partText: 'go_next' } as never, tasks: { nuts } });
    const npc = { def, actor: { has: () => false }, pos: new THREE.Vector3() } as unknown as Npc;
    return { ws, said, d, npc };
  }

  it('greets, then says what each step is about before its task, in its voice', async () => {
    const { ws, said, d, npc } = crab();
    await d.talk(npc);
    expect(ws.quests.crab).toBe(1);
    // the panel step, solved; the shared "next" after it; then the ask of the step in the world, started in the background
    expect(said).toEqual(['crab_hi 🦀', 'crab_t1 🦀', 'npc_next 🦀', 'crab_t2 🦀']);
  });

  it('its own word of a step solved (`solved`) in place of the shared "next"; none for a step it has no word for', async () => {
    const { ws, said, d, npc } = crab({ ...CRAB, solved: ['crab_found'] } as unknown as CharacterDef);
    await d.talk(npc);
    expect(ws.quests.crab).toBe(1);
    expect(said).toEqual(['crab_hi 🦀', 'crab_t1 🦀', 'crab_found 🦀', 'crab_t2 🦀']);
    // its last step solved: its word, then the part as before
    const last = crab({ ...CRAB, steps: ['compare'], asks: ['crab_t1'], solved: ['crab_found'] } as unknown as CharacterDef);
    await last.d.talk(last.npc);
    expect(last.said.slice(0, 3)).toEqual(['crab_hi 🦀', 'crab_t1 🦀', 'crab_found 🦀']);
    expect(last.said).toContain('crab_done 🦀');
  });

  it('thanks with its own words when its part is given, not with the world\'s', async () => {
    const { ws, said, d, npc } = crab();
    ws.quests.crab = 1;
    d.stepDone(npc, 1);
    await new Promise((r) => setTimeout(r, 0));
    expect(said[0]).toBe('crab_done 🦀');
    expect(said).not.toContain('npc_next 🦀');
  });

  it('its own word after the thanks (`after`: the owlet to find) in place of the cat\'s "go on", also with the last part', async () => {
    const ASKS = { ...CRAB, after: 'crab_ask_more' } as unknown as CharacterDef, OTHER = { ...CRAB, id: 'shrimp' } as CharacterDef;
    const tick = () => new Promise((r) => setTimeout(r, 0));
    {
      const { ws, said, d, npc } = crab(ASKS, [OTHER]);
      ws.quests.crab = 1;
      d.stepDone(npc, 1);
      await tick();
      expect(said).toEqual(['crab_done 🦀', 'crab_ask_more 🦀']);
    }
    {
      // the last part: "every part is back" first, then its word
      const { ws, said, d, npc } = crab(ASKS);
      ws.quests.crab = 1;
      d.stepDone(npc, 1);
      await tick();
      expect(said).toEqual(['crab_done 🦀', 'all_parts', 'crab_ask_more 🦀']);
    }
    {
      // without one: the cat's "go on" as before
      const { ws, said, d, npc } = crab(CRAB, [OTHER]);
      ws.quests.crab = 1;
      d.stepDone(npc, 1);
      await tick();
      expect(said).toEqual(['crab_done 🦀', 'go_next']);
    }
  });

  it('its own word due while a task is open is owed, not lost: said at the first free moment, or by it when met again', async () => {
    // a child closes the card and runs on to the next character, whose task opens before the word is due (the walkthrough
    // of the Sweet Land, 2026-11-25: Tyanuchka's ask for Zheleyka was turned away by Kakao's bridge and never heard)
    const ASKS = { ...CRAB, after: 'crab_ask_more' } as unknown as CharacterDef, OTHER = { ...CRAB, id: 'shrimp' } as CharacterDef;
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const frames = async (n: number) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };
    try {
      const { ws, said, d, npc } = crab(ASKS, [OTHER]);
      ws.quests.crab = 1;
      beginTask();                              // the next character's task is open as the crab's word comes due
      d.stepDone(npc, 1);
      await tick(); await frames(3);
      expect(said).toEqual(['crab_done 🦀']);   // owed while the task is open, frame after frame
      endTask();
      await frames(3);
      expect(said).toEqual(['crab_done 🦀', 'crab_ask_more 🦀']);   // the task over: said once
      await frames(3);
      expect(said.filter((x) => x === 'crab_ask_more 🦀')).toHaveLength(1);
    } finally { endTask(); }
    try {
      // or the crab itself, met again while it is still owed: its word in place of its words of a meeting again
      const { ws, said, d, npc } = crab(ASKS, [OTHER]);
      ws.quests.crab = 1;
      beginTask();
      d.stepDone(npc, 1);
      await tick();
      await d.talk(npc);
      endTask();
      await frames(3);
      expect(said).toEqual(['crab_done 🦀', 'crab_ask_more 🦀']);
      // said once: met again after that, its words of a meeting again
      await d.talk(npc);
      expect(said.at(-1)).toBe('crab_again_1 🦀');
    } finally { endTask(); }
  });

  it('met again after its chain: its own words in turn, not the shared "again"', async () => {
    const { ws, said, d, npc } = crab();
    ws.quests.crab = 2;
    await d.talk(npc); await d.talk(npc); await d.talk(npc);
    expect(said.filter((s) => s.startsWith('crab_again') || s.startsWith('npc_again'))).toEqual(['crab_again_1 🦀', 'crab_again_2 🦀', 'crab_again_1 🦀']);
  });
});
