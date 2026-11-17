/**
 * The shared code knows no world (ARCH-10, R11): src/game, src/core and src/ui serve every world, so nothing in them
 * may name a character of the first world, count its five crystal parts or reach into a world's folder for its
 * layout. All of that comes from the description of the world (src/worlds/<world>/, through src/game/world.ts).
 *
 * The check reads the sources as text (tests excluded: they may use any names). Emoji in the picture sets of the
 * tasks are allowed - they are pictures, not names.
 */
import { describe, expect, it } from 'vitest';

const RAW = import.meta.glob(['./**/*.ts', '../core/**/*.ts', '../ui/**/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const SOURCES = Object.entries(RAW)
  .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('.d.ts'))
  // Vite names the files of this very folder "./x.ts" and the others "../dir/x.ts".
  .map(([path, text]) => ({ path: path.replace(/^\.\//, 'src/game/').replace(/^\.\.\//, 'src/'), text }));

interface Hit { file: string; line: number; text: string; }
function find(re: RegExp, keep: (m: RegExpMatchArray, path: string, text: string) => boolean = () => true): Hit[] {
  const out: Hit[] = [];
  for (const { path, text } of SOURCES) {
    for (const m of text.matchAll(re)) {
      if (!keep(m, path, text)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      out.push({ file: path, line, text: m[0].trim() });
    }
  }
  return out;
}
const where = (hits: Hit[]) => hits.map((h) => `${h.file}:${h.line} "${h.text}"`).join('; ');

/** Module specifiers: static and type imports, re-exports, side-effect and dynamic imports, import.meta.glob. */
const SPECIFIER = /(?:\bfrom|\bimport(?:\.meta\.glob)?)\s*\(?\s*\[?\s*(['"`])([^'"`\n]*)\1/g;
/** A world's folder: src/worlds/... (the registry included) or the old src/world/. src/game/world.ts is the interface. */
const WORLD_PATH = /(?:^|\/)worlds(?:\/|$)|(?:^|\/)world\//;
/** The characters of the first world, in any case and inside longer names (fox_hi, deerQuest, FairyQueen). */
const NAMES = /unicorn|fox|mushking|deer|queen/gi;
/**
 * The one exception to NAMES (PLAY-09, R57): the path of the model of the first world's pet in the catalog of pets.
 * A model file of the core, not a world's name: this exact quoted string, in this one file - the same word anywhere
 * else in it (an id, a comment, another path) is still caught.
 */
const CORE_MODEL = { file: 'src/game/pets.ts', text: "'animals_pack/Deer'" };
const inCoreModel = (m: RegExpMatchArray, path: string, text: string) => {
  if (path !== CORE_MODEL.file) return false;
  for (let at = text.indexOf(CORE_MODEL.text); at >= 0; at = text.indexOf(CORE_MODEL.text, at + 1)) {
    if (m.index! >= at && m.index! + m[0].length <= at + CORE_MODEL.text.length) return true;
  }
  return false;
};
/** Five as the number of parts: "n/5", a quoted '5', "n з 5" / "n из 5" / "n of 5". */
const FIVE = /\/5(?![\d.])|(['"`])5\1|(?<![\p{L}\d])(?:з|из|of)\s+5(?![\d.])/gu;

describe('the shared code knows no world (ARCH-10, R11)', () => {
  it('the sources were found', () => {
    const names = SOURCES.map((s) => s.path);
    expect(names, 'the glob did not reach src/game').toContain('src/game/hero.ts');
    expect(names).toContain('src/game/loop.ts');
    expect(names).toContain('src/game/taskviews/panel.ts');
    expect(names, 'the glob did not reach src/core').toContain('src/core/renderer.ts');
    expect(names, 'the glob did not reach src/ui').toContain('src/ui/ui.ts');
    expect(names, 'a world folder was read as shared code').not.toContain('src/worlds/fairy/index.ts');
    expect(names.some((n) => n.endsWith('.test.ts')), 'tests were read as sources').toBe(false);
  });

  it('the specifier pattern sees every kind of import', () => {
    const forms = [
      "import { a } from '../worlds/fairy/layout';", "import type { A } from \"../../worlds/fairy\";",
      "export * from '../world/terrain';", "import '../worlds/fairy/style';", "const m = await import('../worlds/index');",
      "import.meta.glob('../worlds/*/index.ts')", "import { b } from '../worlds';",
    ];
    for (const f of forms) {
      const paths = [...f.matchAll(SPECIFIER)].map((m) => m[2]);
      expect(paths.some((p) => WORLD_PATH.test(p)), `not seen as a world import: ${f}`).toBe(true);
    }
    expect(WORLD_PATH.test('./world'), 'src/game/world.ts is the interface, not a world').toBe(false);
    expect(WORLD_PATH.test('../game/world'), 'src/game/world.ts is the interface, not a world').toBe(false);
  });

  it('no shared file imports a world: the world is handed in through src/game/world.ts', () => {
    const hits = find(SPECIFIER, (m) => WORLD_PATH.test(m[2]));
    expect(hits, `shared code imports a world: ${where(hits)}`).toEqual([]);
  });

  it('no shared file names a character of the first world', () => {
    const hits = find(NAMES, (m, path, text) => !inCoreModel(m, path, text));
    expect(hits, `shared code names a character of the first world: ${where(hits)}`).toEqual([]);
  });

  it('no shared file counts five parts of the artifact: the world tells its hud', () => {
    const hits = find(FIVE);
    expect(hits, `shared code counts five parts: ${where(hits)}`).toEqual([]);
  });
});
