import { mysteryProblems } from './mystery';
import type { CharacterDef, WorldDef, WorldItem, WorldItemKind } from './world';

/**
 * The description of a world for the generic walkthrough (ARCH-16): the points of the world template
 * (docs/13-worlds.md) in one shape, `WorldItem` (src/game/world.ts).
 *
 * Who writes what. The chain of every character and the pet are made here, of what the world declares anyway
 * (`characters`, `pet`); the world hands in the rest (`BuiltWorld.items`: its secrets, the parts of the artifact that
 * lie in it, its cutscenes, its tour, its finale), each made with `marked` - the done mark of an item is the world's
 * flag of the item's own name. `describeWorld` puts the two together, `problems` checks the list against the world's
 * declaration, `missing` against the template. window.__game shows all three with ?debug (src/game/debug.ts).
 *
 * Nothing here knows a world: no name, no place, no count of one.
 */

/** Every kind of item, in the order of the template table. */
export const KINDS: readonly WorldItemKind[] = ['chain', 'part', 'scene', 'finale', 'secret', 'pet', 'flyover'];

/** What the description reads of a world: WorldDef fits, and so does what the game holds of the world played (`g.world`). */
export interface Declared {
  readonly characters?: readonly CharacterDef[]; readonly pet?: WorldDef['pet']; readonly secrets?: readonly string[];
  readonly worldTasks?: readonly string[]; readonly mystery?: WorldDef['mystery'];
}
/** The marks of a world: its part of the save (WorldState, src/core/save.ts). */
export interface Marks { quests: Record<string, number>; flags: Record<string, boolean>; final: boolean }
/** The game as the description reads it: the world played and its part of the save. */
export interface Described { readonly world: Declared; readonly ws: Marks }

/** The id of the item `pet` and the name of its flag: PET_FLAG of src/game/pets.ts (the test keeps the two equal). */
export const PET_ITEM = 'pet';
/** m: how far in front of a character the heroine stands to talk to it - inside any spot a world gives a character. */
export const TALK_AT = 1.6;

/**
 * An item with its done mark, by the rule "the id of an item is the name of its mark": the world's flag `id`, read from
 * the save at the moment of the question; the finale's mark is the world's `final`. A world makes every item of its own
 * with it, so an id and a flag cannot drift apart.
 */
export function marked(ws: Marks, item: Omit<WorldItem, 'done'>): WorldItem {
  return { ...item, done: item.kind === 'finale' ? () => ws.final === true : () => ws.flags[item.id] === true };
}

/** The numbers of the steps of `c` that the world plays as a task in the world (WorldDef.worldTasks), in order. */
export function inWorldSteps(c: Pick<CharacterDef, 'steps'>, worldTasks: readonly string[] = []): number[] {
  return c.steps.flatMap((s, k) => (worldTasks.includes(s) ? [k] : []));
}

/**
 * The items a world does not write: a chain for each of its characters, in their order, and its pet.
 * A chain is done when its character has no step left (the rule of src/game/dialogue.ts); the heroine stands in front
 * of the character; the steps the world plays in the world are named on it (`inWorld`), only when it has some. The pet stands where the world put it and comes after the chain the world names (src/game/pets.ts
 * shows it and gives it its action spot).
 */
export function declared(g: Described): WorldItem[] {
  const { world, ws } = g;
  const out = (world.characters ?? []).map((c): WorldItem => {
    const inWorld = inWorldSteps(c, world.worldTasks);
    return {
      kind: 'chain', id: c.id, how: 'act',
      at: { x: c.x + Math.sin(c.heading) * TALK_AT, z: c.z + Math.cos(c.heading) * TALK_AT },
      done: () => (ws.quests[c.id] ?? 0) >= c.steps.length,
      ...(inWorld.length ? { inWorld } : {}),
    };
  });
  const pet = world.pet;
  if (pet) {
    out.push(marked(ws, {
      kind: 'pet', id: PET_ITEM, how: 'act', at: { x: pet.at.x, z: pet.at.z },
      ...(pet.after === undefined ? {} : { after: [pet.after] }),
    }));
  }
  return out;
}

/** The whole description of the world played: what is made of its declaration, then `own` - the items the built world hands in. */
export function describeWorld(g: Described, own: readonly WorldItem[]): WorldItem[] {
  return [...declared(g), ...own];
}

/** Everything `item` comes after is done: the game lets it be done now. An id no item of the list has holds it back for good. */
export function ready(item: Pick<WorldItem, 'after'>, items: readonly WorldItem[]): boolean {
  return (item.after ?? []).every((id) => items.find((x) => x.id === id)?.done() === true);
}

/**
 * What is wrong with a description against what the world declares (empty: nothing). One line a fault:
 * ids are unique; `after` names items of the list; an item done by the action button or by walking has a place, one
 * that plays by itself tells when it is on (`active`); the chains are the world's characters one to one; the secrets
 * are the world's `secrets` one to one; there is a pet exactly when the world declares one, under the id of its flag
 * and at the declared place; every task the world declares to play in the world (`worldTasks`) is a step of some
 * character, and each chain names exactly its steps of them (`inWorld`) - a walkthrough would not find the others;
 * the places of the mysterious stars are enough and apart (src/game/mystery.ts `mysteryProblems`).
 */
export function problems(world: Declared, items: readonly WorldItem[]): string[] {
  const out: string[] = [];
  const ids = items.map((i) => i.id);
  for (const id of new Set(ids.filter((x, n) => ids.indexOf(x) !== n))) out.push(`the id "${id}" is given to more than one item`);
  for (const i of items) {
    for (const a of i.after ?? []) {
      if (a === i.id) out.push(`the item "${i.id}" comes after itself`);
      else if (!ids.includes(a)) out.push(`the item "${i.id}" comes after "${a}", which is no item of the description`);
    }
    if ((i.how === 'act' || i.how === 'walk') && !i.at) out.push(`the item "${i.id}" is done by "${i.how}" and has no place (at)`);
    if (i.how === 'auto' && !i.active) out.push(`the item "${i.id}" plays by itself and does not tell when it is on (active)`);
  }
  const oneToOne = (kind: WorldItemKind, names: readonly string[], field: string) => {
    const have = items.filter((i) => i.kind === kind).map((i) => i.id);
    for (const n of names) if (!have.includes(n)) out.push(`"${n}" of the world's ${field} has no item of kind "${kind}"`);
    for (const h of have) if (!names.includes(h)) out.push(`the item "${h}" of kind "${kind}" is not in the world's ${field}`);
  };
  oneToOne('chain', (world.characters ?? []).map((c) => c.id), 'characters');
  const tasks = world.worldTasks ?? [];
  for (const id of new Set(tasks)) {
    if (!(world.characters ?? []).some((c) => c.steps.includes(id))) out.push(`the task in the world "${id}" of the world's worldTasks is no step of any character`);
  }
  for (const c of world.characters ?? []) {
    const chain = items.find((i) => i.kind === 'chain' && i.id === c.id);
    if (!chain) continue;
    const want = inWorldSteps(c, tasks), have = [...(chain.inWorld ?? [])];
    if (JSON.stringify(have) !== JSON.stringify(want)) out.push(`the chain "${c.id}" names the steps ${JSON.stringify(have)} as played in the world, the world's worldTasks make them ${JSON.stringify(want)}`);
  }
  oneToOne('secret', world.secrets ?? [], 'secrets');
  if (world.mystery) out.push(...mysteryProblems(world.mystery));
  const pets = items.filter((i) => i.kind === 'pet');
  if (!world.pet) for (const p of pets) out.push(`the item "${p.id}" of kind "pet": the world declares no pet`);
  else if (pets.length !== 1) out.push(`the world declares a pet, the description has ${pets.length} items of kind "pet"`);
  else {
    const [p] = pets, at = world.pet.at;
    if (p.id !== PET_ITEM) out.push(`the item of kind "pet" has the id "${p.id}", its flag is "${PET_ITEM}"`);
    if (p.at?.x !== at.x || p.at?.z !== at.z) out.push(`the item "${p.id}" stands at ${p.at?.x},${p.at?.z}, the world declares its pet at ${at.x},${at.z}`);
  }
  return out;
}

/** The rows of the template table of docs/13-worlds.md the description answers: the number and the name, word for word. */
export const TEMPLATE_ROWS: Readonly<Record<number, string>> = {
  2: 'Сюжетные персонажи с характером и своим голосом',
  3: 'Цепочка заданий у каждого персонажа',
  5: 'Артефакт и сцена его возвращения',
  6: 'Необязательные секреты',
  8: 'Питомец, которого можно найти',
  11: 'Автопрохождение мира от входа до финала',
};

/** What the template asks of a kind: the rows of the table it answers, what it is there, and how many a world must have. */
export interface TemplatePoint { kind: WorldItemKind; rows: readonly number[]; what: string; need: number; atLeast: boolean }

export const TEMPLATE: readonly TemplatePoint[] = [
  { kind: 'chain', rows: [2, 3], what: 'the characters with their chains of tasks', need: 5, atLeast: false },
  { kind: 'part', rows: [5], what: 'the parts of the artifact hidden in the world (WORLD-08)', need: 2, atLeast: true },
  { kind: 'scene', rows: [5], what: 'the cutscenes: the opening and the return (WORLD-13)', need: 2, atLeast: false },
  { kind: 'finale', rows: [5], what: 'the return of the artifact', need: 1, atLeast: false },
  { kind: 'secret', rows: [6], what: 'the secrets', need: 3, atLeast: true },
  { kind: 'pet', rows: [8], what: 'the pet', need: 1, atLeast: false },
  { kind: 'flyover', rows: [11], what: 'the tour of the world (WORLD-11)', need: 1, atLeast: false },
];

/** How many items of each kind a world must have; a kind left out keeps the number of the template. */
export type Need = Partial<Record<WorldItemKind, number>>;
/** One item of every kind: enough for a test world. */
export const ONE_EACH: Readonly<Record<WorldItemKind, number>> = { chain: 1, part: 1, scene: 1, finale: 1, secret: 1, pet: 1, flyover: 1 };

/**
 * What a description lacks of the world template, one line a kind, in the words of the template: the number and the
 * name of the row of docs/13-worlds.md, then how many items there are and how many are needed. Empty: nothing lacks.
 * `need` replaces the numbers of the template (`ONE_EACH` for a test world).
 */
export function missing(items: readonly { kind: WorldItemKind }[], need: Need = {}): string[] {
  const out: string[] = [];
  for (const t of TEMPLATE) {
    const want = need[t.kind] ?? t.need, have = items.filter((i) => i.kind === t.kind).length;
    if (have >= want) continue;
    const rows = t.rows.map((n) => `${n} "${TEMPLATE_ROWS[n]}"`).join(', ');
    out.push(`template point${t.rows.length > 1 ? 's' : ''} ${rows} (docs/13-worlds.md): ${have} item(s) of kind "${t.kind}" - ${t.what}, `
      + `${t.atLeast ? 'at least ' : ''}${want} needed`);
  }
  return out;
}

/** An item as window.__game shows it: plain values, `done` and `active` read at the moment of the question. */
export interface ItemState {
  kind: WorldItemKind; id: string; at: { x: number; z: number } | null; how: WorldItem['how']; after: string[];
  done: boolean; active: boolean;
  /** A chain with steps played in the world: their numbers (WorldItem.inWorld); absent otherwise. */
  inWorld?: number[];
}

export function look(items: readonly WorldItem[]): ItemState[] {
  return items.map((i) => ({
    kind: i.kind, id: i.id, at: i.at ? { x: i.at.x, z: i.at.z } : null, how: i.how, after: [...(i.after ?? [])],
    done: i.done(), active: i.active?.() ?? false,
    ...(i.inWorld ? { inWorld: [...i.inWorld] } : {}),
  }));
}
