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
import { CLOUD_STEP } from './cloud-bridge';
import { CLOCK_STEP } from './clock';
import { WINDS_STEP } from './ship';
import { SECRET_HOW, SKY_SECRETS } from './secrets';
import { FINALE, FRIENDS, LATER_IN_WORLD, RAYS, WORLD_TASKS, sky } from './index';
import { SHRINE, type ZoneId } from './layout';
import { SKY_INFO } from './meta';
import { strings } from './strings';
import { islandAt } from './terrain';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed here
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

/** The skill a step of a chain trains: a skill named by the step, or the skill of its task type. */
/** (A task played in the world trains the skill it records in: the cloud bridge, addition; the clock its last step's, addition; the route of the winds none.) */
const skillOf = (step: string) => (step === WINDS_STEP ? null : step === CLOUD_STEP || step === CLOCK_STEP ? 'add' : isSkillStep(step) ? step : (SKILL as Record<string, string>)[step]);

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
    const want: Record<string, (string | null)[]> = {
      lazur: ['compare', 'add', 'add'],                  // comparing, addition over ten, the cloud bridge (WORLD-25: addition)
      gromykhalo: ['count', 'sub', 'pattern'],           // counting, subtraction over ten, a complex pattern
      mertsal: ['memory', 'pattern', 'add'],             // memory, the pattern of two features, the clock (WORLD-24: its hands by an addition now)
      veterok: ['series', 'compose', null],              // the number line, the composition of a number, the wind route (WORLD-23: no skill)
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
    expect(LATER_IN_WORLD.map((l) => l.card).sort()).toEqual([]);
    for (const l of LATER_IN_WORLD) expect(sky.worldTasks ?? [], l.card).not.toContain(l.now);
  });

  it('Lazur\'s last step is the cloud bridge (WORLD-25, step 2), Mertsal\'s third the clock (WORLD-24, step 3), played in the world, and Veterok\'s third the route of the winds (WORLD-23, step 4); no other chain names one', () => {
    expect(sky.worldTasks).toEqual(WORLD_TASKS);
    expect(WORLD_TASKS).toEqual([CLOUD_STEP, CLOCK_STEP, WINDS_STEP]);
    const lazur = FRIENDS.find((c) => c.id === 'lazur')!, mertsal = FRIENDS.find((c) => c.id === 'mertsal')!, veterok = FRIENDS.find((c) => c.id === 'veterok')!;
    expect(inWorldSteps(veterok, sky.worldTasks)).toEqual([2]);
    expect(sky.noSkill).toEqual([WINDS_STEP]);
    expect(veterok.steps[3]).toBe('part');
    expect(inWorldSteps(lazur, sky.worldTasks)).toEqual([2]);
    expect(inWorldSteps(mertsal, sky.worldTasks)).toEqual([2]);
    // ray 3 lies in the clock: the step `part` right after it
    expect(mertsal.steps[3]).toBe('part');
    for (const c of FRIENDS.filter((f) => !['lazur', 'mertsal', 'veterok'].includes(f.id))) expect(inWorldSteps(c, sky.worldTasks), c.id).toEqual([]);
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

  it('its description is the one of a grey build: five chains, two parts, the tour, its four secrets and the finale, nothing that disagrees', () => {
    const ws = { quests: {}, flags: {}, final: false };
    const tour = marked(ws, { kind: 'flyover', id: 'toured', how: 'auto', active: () => false });
    const parts = RAYS.map((r) => marked(ws, { kind: 'part', id: r.flag, how: 'act', at: r.at }));
    const secrets = SKY_SECRETS.map((id) => marked(ws, { kind: 'secret', id, how: SECRET_HOW[id], at: { x: 0, z: 0 }, active: () => false }));
    const before = [...declared({ world: sky, ws }), tour, ...parts];
    const items: WorldItem[] = [...before, ...secrets, marked(ws, { kind: 'finale', id: FINALE, how: 'act', at: SHRINE, after: before.map((i) => i.id), active: () => false })];
    expect(problems(sky, items)).toEqual([]);
    expect(missing(items, { chain: 5, part: 2, flyover: 1, finale: 1, secret: 4, pet: 0, scene: 0 })).toEqual([]);
    expect(sky.secrets).toEqual(SKY_SECRETS);
    expect(sky.chest).toBe('sky_chest');
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
    // the grey build speaks only the cat's two lines about Pushok (the lead, 2026-11-25: not the shared one of the fawn)
    expect(strings.spoken).toEqual({ sky_pet_found: 'joy', sky_pet_follow: 'warm' });
  });
});
