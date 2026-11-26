/**
 * Every recorded line of a world is said by the game's code (the lead's word of 2026-11-26): the Sweet Land went to the
 * site with 73 of its 87 recorded lines never said - its characters spoke the shared lines, the world's own were only
 * listed in `spoken` of its strings.ts. A line is said by code when its key stands in the code as a literal ('key'), or
 * when a template of the code builds it (`${q.id}_trade_thanks`, `${q.id}_hi`: a template with a word of its own; one of
 * bare parts, `${w}_${which}`, could build anything and proves nothing).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
/** The code: every .ts file of src/ but the tests and the strings themselves. */
function codeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return codeFiles(p);
    return /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && f !== 'strings.ts' ? [p] : [];
  });
}
const code = codeFiles(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
const literal = (key: string) => new RegExp(`['"\`]${key}['"\`]`).test(code);
/** The templates of the code that build a key: each ${...} any word, the rest as written; only those with a word of their own. */
const templates = [...code.matchAll(/`([^`]*\$\{[^`]*)`/g)].map((m) => m[1].split(/\$\{[^}]*\}/))
  .filter((parts) => parts.some((p) => /[a-z]{3,}|_[a-z]{2,}/.test(p)))
  .map((parts) => new RegExp(`^${parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\w*')}$`));
const said = (key: string) => literal(key) || templates.some((t) => t.test(key));

/** Each world's lines to record (its strings.ts `spoken`). */
const worlds = import.meta.glob<{ strings: { id: string; spoken?: Record<string, string> } }>('./*/strings.ts', { eager: true });

describe('every recorded line of a world is said by the code', () => {
  for (const [path, mod] of Object.entries(worlds)) {
    const { id, spoken = {} } = mod.strings;
    it(`${id} (${path})`, () => {
      const unsaid = Object.keys(spoken).filter((k) => !said(k));
      expect(unsaid, `recorded, never said: ${unsaid.join(', ')}`).toEqual([]);
    });
  }

  it('finds what it should: a literal, a template with a word of its own; not a template of bare parts', () => {
    expect(said('sweet_magic_1')).toBe(true);        // MAGIC_LINES, src/worlds/sweet/index.ts
    expect(said('bulk_trade_thanks')).toBe(true);    // `${q.id}_trade_thanks`, src/game/dialogue.ts
    expect(said('unicorn_hi')).toBe(true);           // `${q.id}_hi`, src/worlds/fairy/characters.ts
    // the hub's word of a world (worldWord, `hub_${w}_${which}`): a world to come is said with no line of code of its own
    expect(said('hub_sky_home')).toBe(true);
    expect(said('hub_sweet_after')).toBe(true);
    expect(said('no_such_line_at_all')).toBe(false);
  });
});
