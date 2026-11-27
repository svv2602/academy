// @vitest-environment happy-dom
/**
 * The Sweet Land as the registry and the shared code see it (./index.ts, docs/worlds/world-4.md): its place on the shelf,
 * its five characters with three tasks each by the document's table, the gingerbread house played in the world and
 * written to no skill (WORLD-21), the scales played in the world and written to `compare` (WORLD-22), the shape bridge
 * played in the world and written to `classify` (WORLD-20), no stand-in left for a task the world plays later, the two rubies that lie in
 * the world, and its description of a grey build (src/game/describe.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { declared, inWorldSteps, marked, missing, problems } from '../../game/describe';
import { isSkillStep } from '../../game/tasks';
import { SKILL } from '../../game/taskviews/panel';
import type { WorldItem } from '../../game/world';
import { HOUSE_STEP } from './house';
import { SCALES_STEP } from './scales';
import { BRIDGE_STEP } from './bridge';
import { FINALE, FRIENDS, LATER_IN_WORLD, RUBIES, sweet } from './index';
import { SHRINE, ZONES } from './layout';
import { CHEST_FLAG, SECRET_HOW, SWEET_SECRETS } from './secrets';
import { strings } from './strings';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed here
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

/** The skill a step of a chain trains: a skill named by the step, or the skill of its task type. */
const skillOf = (step: string) => (isSkillStep(step) ? step : (SKILL as Record<string, string>)[step]);

describe('the Sweet Land, the grey build (WORLD-12, step 1)', () => {
  it('is the third place of the shelf: the hub\'s arch of shelf 3 leads to it', () => {
    expect(sweet.id).toBe('sweet');
    expect(sweet.shelf).toBe(3);
    expect(sweet.move).toBeUndefined();   // she walks: the land has ground under her feet
    expect(sweet.arrive?.('hub')).not.toBeNull();
  });

  it('five characters, each with three tasks of the table of docs/worlds/world-4.md: panel tasks the game has, the house, the scales and the bridge in the world', () => {
    expect(FRIENDS.map((c) => c.id)).toEqual(['pastila', 'imbir', 'tyanuchka', 'kakao', 'polosatik']);
    const want: Record<string, string[]> = {
      pastila: ['add', 'compose', 'compare'],            // addition to 20, the composition of a number, comparing
      imbir: ['count', 'pattern'],                       // counting by tens, the pattern; then the house (WORLD-21), below
      tyanuchka: ['sub', 'classify'],                    // subtraction to 20, sorting; then the scales (WORLD-22), below
      kakao: ['memory', 'compare'],                      // the shape bridge (WORLD-20), below; memory, comparing by signs
      polosatik: ['memory', 'series', 'add'],            // pairs, the number line, addition
    };
    for (const c of FRIENDS) {
      const tasks = c.steps.filter((s) => s !== 'part' && s !== HOUSE_STEP && s !== SCALES_STEP && s !== BRIDGE_STEP);
      expect(tasks.map(skillOf), c.id).toEqual(want[c.id]);
      for (const s of tasks) expect(skillOf(s), `${c.id}: ${s}`).toBeTruthy();
    }
    expect(FRIENDS.find((c) => c.id === 'kakao')!.steps).toContain('signs');
  });

  it('the gingerbread house (WORLD-21) is Imbir\'s third step, played in the world and written to no skill, ruby 2 after it', () => {
    const imbir = FRIENDS.find((c) => c.id === 'imbir')!;
    expect(imbir.steps).toEqual(['count', 'pattern', HOUSE_STEP, 'part']);
    // its id is its own: not a step of the panel (the number house "house" stood in for it in step 1)
    expect(skillOf(HOUSE_STEP)).toBeUndefined();
    expect(sweet.worldTasks).toContain(HOUSE_STEP);
    expect(sweet.noSkill).toEqual([HOUSE_STEP]);
    expect(inWorldSteps(imbir, sweet.worldTasks)).toEqual([2]);
    for (const c of FRIENDS.filter((f) => f.id !== 'imbir' && f.id !== 'tyanuchka' && f.id !== 'kakao')) expect(inWorldSteps(c, sweet.worldTasks), c.id).toEqual([]);
    const chain = declared({ world: sweet, ws: { quests: {}, flags: {}, final: false } }).find((i) => i.id === 'imbir')!;
    expect([chain.inWorld, chain.noSkill]).toEqual([[2], [2]]);
  });

  it('the scales with candies (WORLD-22) are Tyanuchka\'s third step, played in the world and written to `compare` as a panel task is', () => {
    const tyanuchka = FRIENDS.find((c) => c.id === 'tyanuchka')!;
    expect(tyanuchka.steps).toEqual(['sub', 'sort', SCALES_STEP]);
    // its id is its own: not a step of the panel (the panel's "compare" stood in for it in steps 1 and 2)
    expect(skillOf(SCALES_STEP)).toBeUndefined();
    expect(sweet.worldTasks).toContain(SCALES_STEP);
    // written to a skill: not one of the steps of no skill
    expect(sweet.noSkill ?? []).not.toContain(SCALES_STEP);
    expect(inWorldSteps(tyanuchka, sweet.worldTasks)).toEqual([2]);
    const chain = declared({ world: sweet, ws: { quests: {}, flags: {}, final: false } }).find((i) => i.id === 'tyanuchka')!;
    expect(chain.inWorld).toEqual([2]);
    expect(chain.noSkill).toBeUndefined();
  });

  it('the shape bridge (WORLD-20) is Kakao\'s first step, played in the world and written to `classify` as a panel task is', () => {
    const kakao = FRIENDS.find((c) => c.id === 'kakao')!;
    expect(kakao.steps).toEqual([BRIDGE_STEP, 'simon', 'signs', 'part']);
    // its id is its own: not a step of the panel (the panel's "odd" stood in for it in steps 1-3)
    expect(skillOf(BRIDGE_STEP)).toBeUndefined();
    expect(sweet.worldTasks).toEqual([HOUSE_STEP, SCALES_STEP, BRIDGE_STEP]);
    expect(sweet.noSkill ?? []).not.toContain(BRIDGE_STEP);
    expect(inWorldSteps(kakao, sweet.worldTasks)).toEqual([0]);
    const chain = declared({ world: sweet, ws: { quests: {}, flags: {}, final: false } }).find((i) => i.id === 'kakao')!;
    expect(chain.inWorld).toEqual([0]);
    expect(chain.noSkill).toBeUndefined();
  });

  it('a task the world plays later stands in now as the panel task of the same skill, at its step', () => {
    for (const l of LATER_IN_WORLD) {
      const c = FRIENDS.find((f) => f.id === l.owner)!;
      expect(c.steps[l.step], `${l.owner} ${l.card}`).toBe(l.now);
      expect(skillOf(l.now), l.card).toBe(l.skill);
      // a stand-in is a panel step, never one the world declares to play in the world
      expect(sweet.worldTasks ?? [], l.card).not.toContain(l.now);
    }
    // the house (WORLD-21), the scales (WORLD-22) and the bridge (WORLD-20) are played in the world now: nothing stands in
    expect(LATER_IN_WORLD).toEqual([]);
    // and no step of a chain is the panel task that stood in for one of them in step 1 at its place
    expect(FRIENDS.find((c) => c.id === 'kakao')!.steps).not.toContain('odd');
  });

  it('rubies 2 and 4 lie in the world, at the end of the chains of Imbir and Kakao (WORLD-08); the other three are given', () => {
    expect(RUBIES.map((r) => [r.owner, r.flag])).toEqual([['imbir', 'ruby_house'], ['kakao', 'ruby_mill']]);
    for (const c of FRIENDS) {
      const lies = RUBIES.some((r) => r.owner === c.id);
      expect(c.steps.includes('part'), c.id).toBe(lies);
      if (lies) expect(c.steps.at(-1), c.id).toBe('part');
    }
  });

  it('its description is the one of a grey build: five chains, two parts, the tour, four secrets and the finale, nothing that disagrees', () => {
    const ws = { quests: {}, flags: {}, final: false };
    const tour = marked(ws, { kind: 'flyover', id: 'toured', how: 'auto', active: () => false });
    const parts = RUBIES.map((r) => marked(ws, { kind: 'part', id: r.flag, how: 'act', at: r.at }));
    const before = [...declared({ world: sweet, ws }), tour, ...parts];
    // the secrets (PLAY-07, ./secrets.ts) are the world's own, never needed by the finale
    const secrets = SWEET_SECRETS.map((id) => marked(ws, { kind: 'secret', id, how: SECRET_HOW[id], at: { x: 0, z: 0 } }));
    const items: WorldItem[] = [...before, ...secrets, marked(ws, { kind: 'finale', id: FINALE, how: 'act', at: SHRINE, after: before.map((i) => i.id), active: () => false })];
    expect(problems(sweet, items)).toEqual([]);
    // the template's three secrets at least (PLAY-07), the tin box the world's chest (PLAY-08)
    expect(missing(items, { chain: 5, part: 2, flyover: 1, finale: 1, secret: 3, pet: 1, scene: 0 })).toEqual([]);
    expect(sweet.secrets).toEqual(SWEET_SECRETS);
    expect(sweet.chest).toBe(CHEST_FLAG);
    // a secret the world declares but its description has not is a problem
    expect(problems(sweet, items.filter((i) => i.id !== 'lemonade'))).not.toEqual([]);
  });

  it('every character stands in its zone, the heroine\'s place before it free of the ways\' ends', () => {
    const home: Record<string, keyof typeof ZONES> = { pastila: 'square', imbir: 'town', tyanuchka: 'market', kakao: 'mill', polosatik: 'garden' };
    for (const c of FRIENDS) {
      const z = ZONES[home[c.id]];
      expect(Math.hypot(c.x - z.x, c.z - z.z), c.id).toBeLessThan(5);
    }
  });

  it('its texts in both languages: the subtitle and the five names, the Ukrainian ones of the customer\'s decision', () => {
    const { uk, ru } = strings.table;
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uk).sort());
    expect([uk.subtitle, ru.subtitle]).toEqual(['Солодка країна', 'Сладкая страна']);
    expect(FRIENDS.map((c) => uk[`sweet_name_${c.id}` as keyof typeof uk])).toEqual(['Пастила', 'Імбир', 'Тягучка', 'Какао', 'Смугастик']);
    expect(FRIENDS.map((c) => ru[`sweet_name_${c.id}` as keyof typeof ru])).toEqual(['Пастила', 'Имбирь', 'Тянучка', 'Какао', 'Полосатик']);
    // the world's own lines of the draft taken on 2026-11-18 are listed for recording (87, the hub's three are the hub's),
    // and four of the secret places of 2026-11-27 (the cave, the room, the room's jar, Imbir's word);
    // the grey build's subtitles, rules and names stay unspoken
    expect(Object.keys(strings.spoken)).toHaveLength(91);
    const grey = ['subtitle', 'sweet_to_tree', 'sweet_part', 'sweet_count', 'sweet_house', 'sweet_millstone', 'sweet_house_way', 'sweet_scales_ask', 'sweet_scales_sign', 'sweet_world_title', 'sweet_artifact', 'sweet_part_card'];
    for (const k of Object.keys(uk).filter((k) => grey.includes(k) || k.startsWith('sweet_bridge_') && !/_hint_\d$/.test(k) || k.startsWith('sweet_name_') || k.startsWith('sweet_fullname_'))) {
      expect(Object.hasOwn(strings.spoken, k), k).toBe(false);
    }
  });
});
