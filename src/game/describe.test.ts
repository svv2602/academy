import { describe, expect, it } from 'vitest';
import {
  KINDS, OPTIONAL_KINDS, ONE_EACH, PET_ITEM, TALK_AT, TEMPLATE, TEMPLATE_ROWS, declared, describeWorld, inWorldSteps, look, marked, missing, problems, ready,
  type Declared, type Marks,
} from './describe';
import type { CharacterDef, WorldItem, WorldItemKind } from './world';
import TEMPLATE_DOC from '../../docs/13-worlds.md?raw';
import PETS_SOURCE from './pets.ts?raw';

/**
 * The description of a world (ARCH-16, R23): the items made of what a world declares, the rule "the id of an item is
 * the name of its mark", the check against the world's declaration and the check against the world template - in the
 * words of the template, which are read here from docs/13-worlds.md itself.
 */

const marks = (): Marks => ({ quests: {}, flags: {}, final: false });
const character = (id: string, o: Partial<CharacterDef> = {}): CharacterDef => ({ id, emoji: '🦉', x: 0, z: 0, heading: 0, steps: ['add'], shard: '#fff', ...o });
const OWL = character('owl', { x: 3, z: -4, steps: ['add', 'sub', 'count'] });
const HEDGEHOG = character('hedgehog', { x: -6, z: 2, heading: Math.PI / 2 });
/** A world of the tests: two characters, a pet after the first one's chain, two secrets. */
const WORLD: Declared = { characters: [OWL, HEDGEHOG], pet: { species: 'any', at: { x: 10, z: -4 }, after: 'owl' }, secrets: ['cave', 'well'] };
/** What such a world hands in itself: its secrets, a part that lies in one of them, a cutscene, its tour and its finale. */
function own(ws: Marks): WorldItem[] {
  return [
    marked(ws, { kind: 'flyover', id: 'toured', how: 'auto', active: () => false }),
    marked(ws, { kind: 'secret', id: 'cave', how: 'act', at: { x: 1, z: 1 } }),
    marked(ws, { kind: 'secret', id: 'well', how: 'act', at: { x: 2, z: 2 } }),
    marked(ws, { kind: 'part', id: 'gem', how: 'walk', at: { x: 1, z: 2 }, after: ['cave'] }),
    marked(ws, { kind: 'scene', id: 'opening', how: 'tap', active: () => false }),
    marked(ws, { kind: 'finale', id: 'final', how: 'act', at: { x: 0, z: 9 }, after: ['owl', 'hedgehog', 'gem'] }),
  ];
}
const whole = (world: Declared = WORLD, ws: Marks = marks()) => describeWorld({ world, ws }, own(ws));

describe('the items made of what a world declares', () => {
  it('a chain for each character, in their order; the heroine stands in front of the character', () => {
    const items = declared({ world: WORLD, ws: marks() });
    expect(items.map((i) => `${i.kind} ${i.id} ${i.how}`)).toEqual(['chain owl act', 'chain hedgehog act', 'pet pet act']);
    // heading 0 looks along +z, a quarter turn along +x: the place is TALK_AT in front, never the character's own
    expect(items[0].at).toEqual({ x: 3, z: -4 + TALK_AT });
    expect(items[1].at!.x).toBeCloseTo(-6 + TALK_AT, 9);
    expect(items[1].at!.z).toBeCloseTo(2, 9);
    expect(items[0].after).toBeUndefined();
    expect(TALK_AT).toBeGreaterThan(1.1);   // farther than the heroine can come to a character (the walkthrough: 1.1 m)
    expect(TALK_AT).toBeLessThan(2.2);
  });

  it('a chain is done when its character has no step left - read from the save every time', () => {
    const ws = marks();
    const [owl, hedgehog] = declared({ world: WORLD, ws });
    expect([owl.done(), hedgehog.done()]).toEqual([false, false]);
    ws.quests.owl = 2;
    expect(owl.done(), 'two of three steps').toBe(false);
    ws.quests.owl = 3; ws.quests.hedgehog = 1;
    expect([owl.done(), hedgehog.done()]).toEqual([true, true]);
    ws.quests.owl = 0;
    expect(owl.done(), 'the mark is the save, not a memory of it').toBe(false);
  });

  it('the pet: the id of its flag, the place the world declares, after the chain the world names', () => {
    const ws = marks();
    const pet = declared({ world: WORLD, ws }).find((i) => i.kind === 'pet')!;
    expect(pet).toMatchObject({ kind: 'pet', id: PET_ITEM, how: 'act', at: { x: 10, z: -4 }, after: ['owl'] });
    expect(pet.done()).toBe(false);
    ws.flags.petty = true;
    expect(pet.done(), 'a flag of another name').toBe(false);
    ws.flags[PET_ITEM] = true;
    expect(pet.done()).toBe(true);
    // the flag src/game/pets.ts writes when the pet is found is this very name
    expect(PETS_SOURCE).toContain(`export const PET_FLAG = '${PET_ITEM}';`);
  });

  it('a pet that is there at once comes after nothing; a world without a pet or characters has no such items', () => {
    const free = declared({ world: { pet: { species: 'any', at: { x: 1, z: 2 } } }, ws: marks() });
    expect(free).toHaveLength(1);
    expect('after' in free[0]).toBe(false);
    expect(declared({ world: {}, ws: marks() })).toEqual([]);
    expect(declared({ world: { characters: [OWL] }, ws: marks() }).map((i) => i.kind)).toEqual(['chain']);
  });

  it('the whole description: the declared items first, then the world\'s own in its order', () => {
    expect(whole().map((i) => i.id)).toEqual(['owl', 'hedgehog', 'pet', 'toured', 'cave', 'well', 'gem', 'opening', 'final']);
  });
});

describe('the steps a world plays as a task in the world (WorldDef.worldTasks)', () => {
  /** The owl plays its second step in the world, the hedgehog a step of its own there twice. */
  const TASKS: Declared = { ...WORLD, characters: [OWL, character('hedgehog', { steps: ['add', 'stones', 'stones'] })], worldTasks: ['sub', 'stones'] };

  it('a chain names the numbers of its steps the world plays in the world, from 0 and in order; a chain with none names nothing', () => {
    const [owl, hedgehog] = declared({ world: TASKS, ws: marks() });
    expect(owl.inWorld).toEqual([1]);
    expect(hedgehog.inWorld).toEqual([1, 2]);
    expect(inWorldSteps(OWL, ['count', 'add'])).toEqual([0, 2]);
    // a world that declares none (the first world) has chains without the field: its description is as it was
    for (const c of declared({ world: WORLD, ws: marks() }).filter((i) => i.kind === 'chain')) expect('inWorld' in c, c.id).toBe(false);
    expect('inWorld' in declared({ world: { ...TASKS, worldTasks: ['count'] }, ws: marks() })[1]).toBe(false);
  });

  it('as window.__game shows it: a plain list on the chain, a copy', () => {
    const items = describeWorld({ world: TASKS, ws: marks() }, own(marks()));
    const seen = look(items);
    expect(seen[1]).toMatchObject({ kind: 'chain', id: 'hedgehog', inWorld: [1, 2] });
    expect('inWorld' in seen.find((i) => i.id === 'cave')!).toBe(false);
    seen[1].inWorld!.push(9);
    expect(items[1].inWorld).toEqual([1, 2]);
  });

  it('a declared task that is no step of any character is a problem, by its id', () => {
    const ws = marks();
    expect(problems(TASKS, describeWorld({ world: TASKS, ws }, own(ws)))).toEqual([]);
    const odd = { ...TASKS, worldTasks: ['sub', 'stones', 'bridge'] };
    expect(problems(odd, describeWorld({ world: odd, ws }, own(ws)))).toEqual(['the task in the world "bridge" of the world\'s worldTasks is no step of any character']);
  });

  it('a chain that names other steps than the declaration makes is a problem: the walkthrough would miss them', () => {
    const ws = marks();
    const items = describeWorld({ world: TASKS, ws }, own(ws));
    const lost = items.map((i) => (i.id === 'owl' ? { ...i, inWorld: undefined } : i));
    expect(problems(TASKS, lost)).toEqual(['the chain "owl" names the steps [] as played in the world, the world\'s worldTasks make them [1]']);
    const extra = items.map((i) => (i.id === 'hedgehog' ? { ...i, inWorld: [0, 1, 2] } : i));
    expect(problems(TASKS, extra)).toEqual(['the chain "hedgehog" names the steps [0,1,2] as played in the world, the world\'s worldTasks make them [1,2]']);
    // the same description against the world without its declaration: the named steps are not the world's
    expect(problems({ ...TASKS, worldTasks: undefined }, items).map((p) => p.split(' names')[0])).toEqual(['the chain "owl"', 'the chain "hedgehog"']);
  });

  it('the steps written to no skill (WorldDef.noSkill, the gingerbread house): named on their chain, each one of worldTasks', () => {
    const ws = marks(), QUIET: Declared = { ...TASKS, noSkill: ['stones'] };
    const items = describeWorld({ world: QUIET, ws }, own(ws));
    expect(items.map((i) => i.noSkill)).toEqual([undefined, [1, 2], ...items.slice(2).map(() => undefined)]);
    expect(look(items)[1]).toMatchObject({ inWorld: [1, 2], noSkill: [1, 2] });
    expect('noSkill' in look(items)[0]).toBe(false);
    expect(problems(QUIET, items)).toEqual([]);
    // a chain that does not name them, or a world that names one it does not play in the world
    expect(problems(QUIET, describeWorld({ world: TASKS, ws }, own(ws)))).toEqual(['the chain "hedgehog" names the steps [] as written to no skill, the world\'s noSkill makes them [1,2]']);
    const odd = { ...TASKS, noSkill: ['add'] };
    expect(problems(odd, describeWorld({ world: odd, ws }, own(ws)))).toEqual(['the task "add" of the world\'s noSkill is not one of its worldTasks']);
  });
});

describe('the id of an item is the name of its mark', () => {
  it('an item of the world is done by the flag of its own name, read from the save every time', () => {
    const ws = marks();
    const cave = marked(ws, { kind: 'secret', id: 'cave', how: 'act', at: { x: 1, z: 1 } });
    expect(cave).toMatchObject({ kind: 'secret', id: 'cave', how: 'act', at: { x: 1, z: 1 } });
    expect(cave.done()).toBe(false);
    ws.flags.secret = true; ws.flags.well = true; ws.final = true;
    expect(cave.done(), 'the flag of its kind, of another item, the finale').toBe(false);
    ws.flags.cave = true;
    expect(cave.done()).toBe(true);
    delete ws.flags.cave;
    expect(cave.done()).toBe(false);
  });

  it('a flag that is not exactly true is no mark (a damaged save)', () => {
    const ws = marks();
    (ws.flags as Record<string, unknown>).cave = 'yes';
    expect(marked(ws, { kind: 'secret', id: 'cave', how: 'act' }).done()).toBe(false);
  });

  it('the finale is done by the world\'s `final`, whatever its id', () => {
    const ws = marks();
    const finale = marked(ws, { kind: 'finale', id: 'final', how: 'act', at: { x: 0, z: 0 } });
    ws.flags.final = true;
    expect(finale.done(), 'a flag named like it').toBe(false);
    ws.final = true;
    expect(finale.done()).toBe(true);
  });

  it('`active` and `after` of the item are kept', () => {
    let on = false;
    const scene = marked(marks(), { kind: 'scene', id: 'opening', how: 'tap', after: ['cave'], active: () => on });
    expect(scene.after).toEqual(['cave']);
    on = true;
    expect(scene.active!()).toBe(true);
  });
});

describe('the order: an item waits for what it comes after', () => {
  it('ready when every item named in `after` is done; an item without `after` is ready at once', () => {
    const ws = marks(), items = whole(WORLD, ws);
    const of = (id: string) => items.find((i) => i.id === id)!;
    expect(ready(of('cave'), items)).toBe(true);
    expect(ready(of('gem'), items)).toBe(false);
    ws.flags.cave = true;
    expect(ready(of('gem'), items)).toBe(true);
    ws.flags.gem = true; ws.quests.owl = 3;
    expect(ready(of('final'), items), 'one chain is not done yet').toBe(false);
    ws.quests.hedgehog = 1;
    expect(ready(of('final'), items)).toBe(true);
  });

  it('an id no item has holds the item back for good', () => {
    expect(ready({ after: ['nothing'] }, whole())).toBe(false);
  });
});

describe('the description against what the world declares', () => {
  const without = (id: string) => whole().filter((i) => i.id !== id);
  const one = (list: string[]) => { expect(list, list.join('; ')).toHaveLength(1); return list[0]; };

  it('the items of the test world agree with it', () => {
    expect(problems(WORLD, whole())).toEqual([]);
  });

  it('an id given twice', () => {
    const ws = marks();
    expect(one(problems(WORLD, [...whole(WORLD, ws), marked(ws, { kind: 'part', id: 'gem', how: 'walk', at: { x: 5, z: 5 } })]))).toContain('"gem" is given to more than one item');
  });

  it('`after` that names no item of the list, or the item itself', () => {
    const ws = marks();
    const lost = [...whole(WORLD, ws), marked(ws, { kind: 'part', id: 'key', how: 'walk', at: { x: 5, z: 5 }, after: ['attic'] })];
    expect(one(problems(WORLD, lost))).toBe('the item "key" comes after "attic", which is no item of the description');
    const loop = [...whole(WORLD, ws), marked(ws, { kind: 'part', id: 'key', how: 'walk', at: { x: 5, z: 5 }, after: ['key'] })];
    expect(one(problems(WORLD, loop))).toBe('the item "key" comes after itself');
  });

  it('an item done by the action button or by walking has a place', () => {
    const ws = marks();
    for (const how of ['act', 'walk'] as const) {
      expect(one(problems(WORLD, [...whole(WORLD, ws), marked(ws, { kind: 'part', id: 'key', how })]))).toBe(`the item "key" is done by "${how}" and has no place (at)`);
    }
    expect(problems(WORLD, [...whole(WORLD, ws), marked(ws, { kind: 'scene', id: 'ending', how: 'tap' })])).toEqual([]);
  });

  it('an item that plays by itself tells when it is on', () => {
    const ws = marks();
    expect(one(problems(WORLD, [...whole(WORLD, ws), marked(ws, { kind: 'flyover', id: 'sweep', how: 'auto' })]))).toBe('the item "sweep" plays by itself and does not tell when it is on (active)');
  });

  it('a cut-scene goes on by a tap: the player of src/game/story.ts never ends a scene by itself', () => {
    const ws = marks();
    for (const how of ['auto', 'act', 'walk'] as const) {
      expect(problems(WORLD, [...whole(WORLD, ws), marked(ws, { kind: 'scene', id: 'ending', how, active: () => false })])).toContain(`the scene "ending" is a cut-scene and goes on by a tap, not by "${how}"`);
    }
    // a scene with a place of its own (the probe world's sign) is not a cut-scene of the player
    expect(problems(WORLD, [...whole(WORLD, ws), marked(ws, { kind: 'scene', id: 'ending', how: 'act', at: { x: 1, z: 1 } })])).toEqual([]);
  });

  it('the chains are the world\'s characters one to one', () => {
    const ws = marks();
    expect(one(problems(WORLD, without('hedgehog').map((i) => (i.id === 'final' ? { ...i, after: ['owl'] } : i))))).toBe('"hedgehog" of the world\'s characters has no item of kind "chain"');
    const stray: WorldItem = { kind: 'chain', id: 'stranger', how: 'act', at: { x: 0, z: 0 }, done: () => false };
    expect(one(problems(WORLD, [...whole(WORLD, ws), stray]))).toBe('the item "stranger" of kind "chain" is not in the world\'s characters');
  });

  it('the secrets are the world\'s `secrets` one to one', () => {
    const ws = marks();
    expect(one(problems(WORLD, without('well')))).toBe('"well" of the world\'s secrets has no item of kind "secret"');
    const extra = [...whole(WORLD, ws), marked(ws, { kind: 'secret', id: 'attic', how: 'act', at: { x: 7, z: 7 } })];
    expect(one(problems(WORLD, extra))).toBe('the item "attic" of kind "secret" is not in the world\'s secrets');
    // a world that declares no secrets may have none in its description
    const silent: Declared = { ...WORLD, secrets: undefined };
    expect(problems(silent, whole(silent)).sort()).toEqual([
      'the item "cave" of kind "secret" is not in the world\'s secrets', 'the item "well" of kind "secret" is not in the world\'s secrets',
    ]);
    // the same name under another kind is not the secret
    const renamed = whole().map((i) => (i.id === 'well' ? { ...i, kind: 'part' as const } : i));
    expect(one(problems(WORLD, renamed))).toBe('"well" of the world\'s secrets has no item of kind "secret"');
  });

  it('a pet exactly when the world declares one, under the id of its flag, at the declared place', () => {
    const ws = marks();
    expect(one(problems(WORLD, without('pet')))).toBe('the world declares a pet, the description has 0 items of kind "pet"');
    const second = [...whole(WORLD, ws), marked(ws, { kind: 'pet', id: 'kitten', how: 'act', at: { x: 10, z: -4 } })];
    expect(one(problems(WORLD, second))).toBe('the world declares a pet, the description has 2 items of kind "pet"');
    const petless: Declared = { ...WORLD, pet: undefined };
    expect(problems(petless, whole(petless))).toEqual([]);
    expect(one(problems(petless, whole()))).toBe('the item "pet" of kind "pet": the world declares no pet');
    const moved = whole().map((i) => (i.kind === 'pet' ? { ...i, at: { x: 10, z: -3 } } : i));
    expect(one(problems(WORLD, moved))).toBe('the item "pet" stands at 10,-3, the world declares its pet at 10,-4');
    const named = whole().map((i) => (i.kind === 'pet' ? { ...i, id: 'kitten' } : i));
    expect(one(problems(WORLD, named))).toBe(`the item of kind "pet" has the id "kitten", its flag is "${PET_ITEM}"`);
  });
});

describe('the description against the world template (docs/13-worlds.md)', () => {
  /** The rows of the template table: "| 6 | Необязательные секреты | не меньше 3 |". */
  const TABLE = new Map([...TEMPLATE_DOC.split('## Шаблон мира')[1].split('\n## ')[0].matchAll(/^\| (\d+) \| ([^|]+?) \| ([^|]+?) \|$/gm)]
    .map((m) => [Number(m[1]), { name: m[2], measure: m[3] }]));
  /** `n` items of every kind but `kind`, of which there are `own`. */
  const list = (n: Record<WorldItemKind, number>, kind?: WorldItemKind, of = 0) => KINDS.flatMap((k) => Array.from({ length: k === kind ? of : n[k] }, () => ({ kind: k })));
  const FULL = Object.fromEntries(TEMPLATE.map((t) => [t.kind, t.need])) as Record<WorldItemKind, number>;

  it('the table was read: fourteen rows', () => {
    expect([...TABLE.keys()]).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it('the names of the rows are the template\'s, word for word', () => {
    for (const [n, name] of Object.entries(TEMPLATE_ROWS)) expect(name, `row ${n}`).toBe(TABLE.get(Number(n))?.name);
  });

  it('every kind answers a row of the table, once; the numbers are the template\'s', () => {
    const kinds: Record<WorldItemKind, true> = { chain: true, secret: true, part: true, scene: true, flyover: true, pet: true, finale: true, easel: true };
    expect([...KINDS].sort()).toEqual(Object.keys(kinds).sort());
    // every kind but the optional ones (the easel) is a point of the template
    expect(TEMPLATE.map((t) => t.kind)).toEqual(KINDS.filter((k) => !OPTIONAL_KINDS.includes(k)));
    expect(OPTIONAL_KINDS).toEqual(['easel']);
    for (const t of TEMPLATE) for (const n of t.rows) expect(TEMPLATE_ROWS[n], `${t.kind}: row ${n}`).toBeTruthy();
    const point = (kind: WorldItemKind) => TEMPLATE.find((t) => t.kind === kind)!;
    expect(TABLE.get(2)!.measure).toBe(String(point('chain').need));
    expect(TABLE.get(6)!.measure).toBe(`не меньше ${point('secret').need}`);
    expect(point('secret').atLeast).toBe(true);
    expect(TABLE.get(8)!.measure).toBe(String(point('pet').need));
    expect(FULL).toEqual({ chain: 5, part: 2, scene: 2, finale: 1, secret: 3, pet: 1, flyover: 1 });
  });

  it('a description with everything the template asks for lacks nothing', () => {
    expect(missing(list(FULL))).toEqual([]);
    // one of each is not a whole world: the chains, the parts, the cutscenes and the secrets are too few
    expect(missing(list(ONE_EACH)).map((l) => /of kind "(\w+)"/.exec(l)![1])).toEqual(['chain', 'part', 'scene', 'secret']);
    expect(missing(list(ONE_EACH), ONE_EACH)).toEqual([]);
  });

  it.each(KINDS.filter((k) => !OPTIONAL_KINDS.includes(k)).map((kind) => [kind]))('a kind left out is named by the number and the name of its row: %s', (kind) => {
    const t = TEMPLATE.find((x) => x.kind === kind)!;
    for (const [need, items] of [[undefined, list(FULL, kind)], [ONE_EACH, list(ONE_EACH, kind)]] as const) {
      const lines = missing(items, need);
      expect(lines, lines.join('; ')).toHaveLength(1);
      const [line] = lines;
      for (const n of t.rows) expect(line).toContain(`${n} "${TABLE.get(n)!.name}"`);
      expect(line).toMatch(/^template points? \d/);
      expect(line).toContain('(docs/13-worlds.md)');
      expect(line).toContain(`0 item(s) of kind "${kind}"`);
      expect(line).toContain(`${t.atLeast ? 'at least ' : ''}${need ? 1 : t.need} needed`);
      // no row of another kind is named
      for (const n of Object.keys(TEMPLATE_ROWS).map(Number).filter((x) => !t.rows.includes(x))) expect(line).not.toContain(`"${TEMPLATE_ROWS[n]}"`);
    }
  });

  it.each(TEMPLATE.filter((t) => t.need > 1).map((t) => [t.kind, t.need]))('fewer than the template asks for is a lack too: %s, %i needed', (kind, need) => {
    const [line] = missing(list(FULL, kind, need - 1));
    expect(line).toContain(`${need - 1} item(s) of kind "${kind}"`);
    expect(missing(list(FULL, kind, need))).toEqual([]);
    expect(missing(list(FULL, kind, need + 1)), 'more is not a lack').toEqual([]);
  });

  it('an empty description lacks every kind, in the order of the table; `need` replaces only the numbers it names', () => {
    expect(missing([]).map((l) => /of kind "(\w+)"/.exec(l)![1])).toEqual(KINDS.filter((k) => !OPTIONAL_KINDS.includes(k)));
    expect(missing([], { chain: 1 })[0]).toContain('1 needed');
    expect(missing([], { chain: 1 })[4]).toContain('at least 3 needed');
    expect(missing([], { secret: 0 })).toHaveLength(KINDS.length - OPTIONAL_KINDS.length - 1);
  });
});

describe('the description as window.__game shows it', () => {
  it('plain values, `done` and `active` read at that moment', () => {
    const ws = marks();
    let flying = true;
    const items = describeWorld({ world: WORLD, ws }, [marked(ws, { kind: 'flyover', id: 'toured', how: 'auto', active: () => flying }), ...own(ws).slice(1)]);
    const seen = look(items);
    expect(seen[0]).toEqual({ kind: 'chain', id: 'owl', at: { x: 3, z: -4 + TALK_AT }, how: 'act', after: [], done: false, active: false });
    expect(seen.find((i) => i.id === 'toured')).toEqual({ kind: 'flyover', id: 'toured', at: null, how: 'auto', after: [], done: false, active: true });
    expect(seen.find((i) => i.id === 'gem')).toEqual({ kind: 'part', id: 'gem', at: { x: 1, z: 2 }, how: 'walk', after: ['cave'], done: false, active: false });
    expect(JSON.parse(JSON.stringify(seen)), 'it crosses page.evaluate as it is').toEqual(seen);
    ws.flags.gem = true; flying = false;
    expect(seen.find((i) => i.id === 'gem')!.done, 'a look is a copy').toBe(false);
    const again = look(items);
    expect(again.find((i) => i.id === 'gem')!.done).toBe(true);
    expect(again.find((i) => i.id === 'toured')!.active).toBe(false);
    // the copy does not hand out the item's own place or list
    seen[0].at!.x = 99; again.find((i) => i.id === 'gem')!.after.push('x');
    expect(look(items)[0].at!.x).toBe(3);
    expect(items.find((i) => i.id === 'gem')!.after).toEqual(['cave']);
  });
});
