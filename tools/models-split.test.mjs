// Runs in `npm test`: the split of the requested model files for the check "models used" of tools/e2e.mjs
// (tools/models-split.mjs) - a next world's own files told by their path and the sources, with no build (the job
// "check" of CI combines the walkthroughs of all sizes without one: there the list of a build was not there, and the
// forest's 25 files counted as models missing from tools/models-used.json).
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { nextWorldIds, splitRequested } from './models-split.mjs';

const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
/** A root with the given files lying under it. */
function rootWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'models-split-'));
  dirs.push(dir);
  for (const f of files) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), 'x'); }
  return dir;
}

describe('the requested model files split: the core\'s and a next world\'s own (tools/models-split.mjs)', () => {
  it('a file inside models/<id>/ of a next world is the world\'s, by its path: no build is read', () => {
    const root = rootWith(['worlds-data/forest/models/forest/borovik.glb', 'worlds-data/forest/models/forest/tex/owl.webp']);
    const got = splitRequested(['models/forest/borovik.glb', 'models/extra/cat.glb', 'models/forest/tex/owl.webp', 'models/forest/borovik.glb'], ['forest', 'sea'], root);
    expect(got).toEqual({ core: ['models/extra/cat.glb'], ofWorlds: ['models/forest/borovik.glb', 'models/forest/tex/owl.webp'], nowhere: [] });
  });

  it('a file of a next world the build takes from elsewhere (WORLD_EXTRA_FILES: the sea\'s swimming clips) lies where it is taken from', () => {
    const root = rootWith(['worlds-test/probe/models/probe/swim.glb']);
    const extra = { sea: { 'models/sea/swim.glb': 'worlds-test/probe/models/probe/swim.glb', 'models/sea/gone.glb': 'worlds-test/gone.glb' } };
    expect(splitRequested(['models/sea/swim.glb', 'models/sea/gone.glb', 'models/sea/fish.glb'], ['sea'], root, extra))
      .toEqual({ core: [], ofWorlds: ['models/sea/fish.glb', 'models/sea/gone.glb', 'models/sea/swim.glb'], nowhere: ['models/sea/fish.glb', 'models/sea/gone.glb'] });
    // the repository as it is: every file the sea is played with lies somewhere (the walkthrough of the sea asks for swim.glb)
    expect(splitRequested(['models/sea/swim.glb'], ['forest', 'sea']).nowhere).toEqual([]);
  });

  it('a file merely named after a world, or of a folder no next world has, stays the core\'s', () => {
    const root = rootWith([]);
    const got = splitRequested(['models/forest.glb', 'models/nature_pack/forest/tree.glb', 'models/fairy/x.glb', 'models/hub/y.glb'], ['forest'], root);
    expect(got).toEqual({ core: ['models/fairy/x.glb', 'models/forest.glb', 'models/hub/y.glb', 'models/nature_pack/forest/tree.glb'], ofWorlds: [], nowhere: [] });
  });

  it('a next world\'s file that does not lie in worlds-data/<id>/ is named', () => {
    const root = rootWith(['worlds-data/forest/models/forest/a.glb', 'public/models/forest/b.glb']);
    const got = splitRequested(['models/forest/a.glb', 'models/forest/b.glb'], ['forest'], root);
    expect(got.ofWorlds).toEqual(['models/forest/a.glb', 'models/forest/b.glb']);
    expect(got.nowhere).toEqual(['models/forest/b.glb']);
  });

  it('the next worlds are read from the sources: every world but the first and the installed ones', () => {
    const ids = nextWorldIds();
    expect(ids).toContain('forest');
    expect(ids).not.toContain('fairy');
    expect(ids).not.toContain('hub');
  });

  it('the real sources: the forest\'s characters are its own and lie in worlds-data/forest/; a pack of the core is the core\'s', () => {
    const got = splitRequested(['models/forest/borovik.glb', 'models/forest/mudrena.glb', 'models/hero/child.glb']);
    expect(got).toEqual({ core: ['models/hero/child.glb'], ofWorlds: ['models/forest/borovik.glb', 'models/forest/mudrena.glb'], nowhere: [] });
  });
});
