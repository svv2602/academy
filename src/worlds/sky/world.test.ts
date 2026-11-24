// @vitest-environment happy-dom
/**
 * The Sky Islands as the registry and the shared code see them (./index.ts, docs/worlds/world-5.md): the place on the
 * shelf, the five characters with three tasks each by the document's table, the stand-ins of the tasks the world plays
 * in a later step, the two rays that lie in the world, and the description of a grey build (src/game/describe.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { declared, inWorldSteps, marked, missing, problems } from '../../game/describe';
import { isSkillStep } from '../../game/tasks';
import { SKILL } from '../../game/taskviews/panel';
import type { WorldItem } from '../../game/world';
import { FINALE, FRIENDS, LATER_IN_WORLD, RAYS, sky } from './index';
import { SHRINE, type ZoneId } from './layout';
import { SKY_INFO } from './meta';
import { strings } from './strings';
import { islandAt } from './terrain';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed here
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

/** The skill a step of a chain trains: a skill named by the step, or the skill of its task type. */
const skillOf = (step: string) => (isSkillStep(step) ? step : (SKILL as Record<string, string>)[step]);

describe('the Sky Islands, the grey build (WORLD-12, step 1)', () => {
  it('is the fifth place of the shelf: the hub\'s arch of shelf 4 leads to it', () => {
    expect(sky.id).toBe('sky');
    expect(sky.shelf).toBe(4);
    expect(sky.move).toBeUndefined();   // she walks: the islands and the bridges are ground under her feet
    expect(sky.arrive?.('hub')).not.toBeNull();
  });

  it('what the registry knows without the code (./meta.ts) agrees with the world: its id, its place, its secrets', () => {
    expect(SKY_INFO).toEqual({ id: sky.id, shelf: sky.shelf, secrets: sky.secrets ?? [] });
  });

  it('five characters, each with three tasks of the table of docs/worlds/world-5.md, all of them panel tasks the game has', () => {
    expect(FRIENDS.map((c) => c.id)).toEqual(['lazur', 'gromykhalo', 'mertsal', 'veterok', 'chirika']);
    const want: Record<string, string[]> = {
      lazur: ['compare', 'add', 'add'],                  // comparing, addition over ten, the cloud bridge (WORLD-25: addition)
      gromykhalo: ['count', 'sub', 'pattern'],           // counting, subtraction over ten, a complex pattern
      mertsal: ['memory', 'pattern', 'add'],             // memory, the pattern of two features, the clock (WORLD-24: its hands by an addition now)
      veterok: ['series', 'compose', 'compose'],         // the number line, the composition of a number, the wind route (WORLD-23: no skill, the number house now)
      chirika: ['memory', 'add', 'classify'],            // pairs, addition, sorting
    };
    for (const c of FRIENDS) {
      const tasks = c.steps.filter((s) => s !== 'part');
      expect(tasks.map(skillOf), c.id).toEqual(want[c.id]);
    }
  });

  it('a task the world plays later stands in now as the panel task of the same skill, at its step', () => {
    for (const l of LATER_IN_WORLD) {
      const c = FRIENDS.find((f) => f.id === l.owner)!;
      expect(c.steps[l.step], `${l.owner} ${l.card}`).toBe(l.now);
      if (l.skill) expect(skillOf(l.now), l.card).toBe(l.skill);
    }
    expect(LATER_IN_WORLD.map((l) => l.card).sort()).toEqual(['WORLD-23', 'WORLD-24', 'WORLD-25']);
    // none is played in the world yet: no world task declared, no chain names one
    expect(sky.worldTasks).toBeUndefined();
    for (const c of FRIENDS) expect(inWorldSteps(c, sky.worldTasks)).toEqual([]);
  });

  it('rays 3 and 4 lie in the world, at the end of the chains of Mertsal and Veterok (WORLD-08); the other three are given', () => {
    expect(RAYS.map((r) => [r.owner, r.flag])).toEqual([['mertsal', 'ray_clock'], ['veterok', 'ray_island']]);
    for (const c of FRIENDS) {
      const lies = RAYS.some((r) => r.owner === c.id);
      expect(c.steps.includes('part'), c.id).toBe(lies);
      if (lies) expect(c.steps.at(-1), c.id).toBe('part');
    }
    expect(islandAt(RAYS[0].at.x, RAYS[0].at.z)).toBe('observatory');
    expect(islandAt(RAYS[1].at.x, RAYS[1].at.z)).toBe('far');
  });

  it('its description is the one of a grey build: five chains, two parts, the tour and the finale, nothing that disagrees', () => {
    const ws = { quests: {}, flags: {}, final: false };
    const tour = marked(ws, { kind: 'flyover', id: 'toured', how: 'auto', active: () => false });
    const parts = RAYS.map((r) => marked(ws, { kind: 'part', id: r.flag, how: 'act', at: r.at }));
    const before = [...declared({ world: sky, ws }), tour, ...parts];
    const items: WorldItem[] = [...before, marked(ws, { kind: 'finale', id: FINALE, how: 'act', at: SHRINE, after: before.map((i) => i.id), active: () => false })];
    expect(problems(sky, items)).toEqual([]);
    expect(missing(items, { chain: 5, part: 2, flyover: 1, finale: 1, secret: 0, pet: 0, scene: 0 })).toEqual([]);
  });

  it('every character stands on its island', () => {
    const home: Record<string, ZoneId> = { lazur: 'castle', gromykhalo: 'dragon', mertsal: 'observatory', veterok: 'pier', chirika: 'mills' };
    for (const c of FRIENDS) expect(islandAt(c.x, c.z), c.id).toBe(home[c.id]);
  });

  it('its texts in both languages: the subtitle and the five names, the Ukrainian ones of the customer\'s decision', () => {
    const { uk, ru } = strings.table;
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uk).sort());
    expect([uk.subtitle, ru.subtitle]).toEqual(['Небесні острови', 'Небесные острова']);
    expect(FRIENDS.map((c) => uk[`sky_name_${c.id}` as keyof typeof uk])).toEqual(['Лазур', 'Громихало', 'Мерехтій', 'Вітерець', 'Цвірінька']);
    expect(FRIENDS.map((c) => ru[`sky_name_${c.id}` as keyof typeof ru])).toEqual(['Лазурь', 'Громыхало', 'Мерцал', 'Ветерок', 'Чирика']);
    // the grey build speaks nothing of its own: no line to record
    expect(strings.spoken).toEqual({});
  });
});
