// Runs in `npm test`. ci.yml plays only what the changed files ask for (ARCH-16): tools/ci-pieces.mjs chooses the
// jobs, the job "plan" hands the choice to the others and "check" compares what ran with it. "check" is the gate into
// dev and the status the protection of main requires, so every branch of the choice is pinned here, and so is the
// wiring of both workflows, read as text (the project has no YAML parser): a walkthrough that silently stopped being
// played would otherwise still give a green "check".
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { DOCS, MAX_LISTED, SHARED, changedFiles, outputs, ownerOf, pick, report, verdict } from './ci-pieces.mjs';
import { PIECES } from './e2e-saves.mjs';
import { SIZES, WORLDS, worldFiles } from './world-pieces.mjs';
import { PARTS } from './worlds.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ci-pieces-')); dirs.push(d); return d; };

const ALL_WALKS = SIZES.flatMap((size) => PIECES.map((group) => ({ size, group })));
const ids = (plan) => plan.walk.map((j) => `${j.size}:${j.group}`);
const EVERYTHING = { walk: ALL_WALKS, worlds: true, all: true };
const NOTHING = { walk: [], worlds: false, all: false };
const FAIRY_ONLY = { walk: ALL_WALKS, worlds: false, all: false };
const PROBE_ONLY = { walk: [], worlds: true, all: false };

describe('tools/world-pieces.mjs: what CI plays for each world', () => {
  it('the first world is the sixteen walkthroughs - four sizes, four pieces - and not the job "worlds"', () => {
    expect(WORLDS.fairy.walk).toEqual(ALL_WALKS);
    expect(new Set(ids(WORLDS.fairy)).size).toBe(16);
    expect(WORLDS.fairy.worlds).toBe(false);
    expect(WORLDS.fairy.files).toEqual(['src/worlds/fairy/']);
  });

  it('the probe world is the job "worlds" alone', () => {
    expect(WORLDS.probe).toEqual({ files: ['src/worlds/probe/', 'worlds-test/probe/'], walk: [], worlds: true });
  });

  it('the sizes are the ones of tools/e2e.mjs, in its order', () => {
    const src = readFileSync(join(root, 'tools/e2e.mjs'), 'utf8');
    const list = (name) => JSON.parse(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`).exec(src)[1].replaceAll("'", '"'));
    expect(SIZES).toEqual([...list('MAIN_MODES'), ...list('EXTRA_MODES')]);
  });

  it('a next world keeps its files in its code folder, its three folders of the build and its test folder', () => {
    expect(worldFiles('forest')).toEqual(['src/worlds/forest/', 'public/models/forest/', 'public/voice/forest/', 'public/story/forest/', 'worlds-test/forest/']);
  });
});

describe('tools/ci-pieces.mjs pick: the changed files choose the jobs (R30)', () => {
  it('a file of the first world plays the pieces of that world only: sixteen walkthroughs, no probe world', () => {
    const plan = pick(['src/worlds/fairy/index.ts']);
    expect(plan).toMatchObject(FAIRY_ONLY);
    expect(plan.play).toEqual(['fairy']);
    expect(plan.reason).toContain('only files of the world fairy changed');
  });

  it.each(['src/worlds/probe/index.ts', 'src/worlds/probe/strings.ts', 'worlds-test/probe/models/probe/cube.glb', 'worlds-test/probe/story/probe/intro.webp'])(
    'a file of the probe world (%s) plays the probe world only: no walkthrough', (file) => {
      const plan = pick([file]);
      expect(plan).toMatchObject(PROBE_ONLY);
      expect(plan.play).toEqual(['probe']);
      expect(plan.reason).toContain('only files of the world probe changed');
    });

  it.each([
    'src/main.ts', 'src/game/loop.ts', 'src/style.css', 'src/worlds/index.ts', 'src/worlds/registry.test.ts', 'index.html',
    'public/models/nature/tree.glb', 'public/voice/hello.mp3', 'public/bank/q_add_1_1.mp3', 'tools/e2e.mjs', 'tools/ci-pieces.mjs',
    '.github/workflows/ci.yml', 'voice/phrases.json', 'models-src/hero/hero.glb', 'package.json', 'package-lock.json',
    'vite.config.ts', 'tsconfig.json', '.gitignore',
  ])('a shared file (%s) plays everything: every walkthrough and the probe world', (file) => {
    const plan = pick([file]);
    expect(plan).toMatchObject(EVERYTHING);
    expect(plan.play).toEqual(['fairy', 'probe']);
    expect(plan.reason).toContain('shared files changed');
  });

  it.each([
    'src/worlds/forest/index.ts',            // a world this table does not know yet
    'src/worlds/fairy.ts', 'src/worlds/probe.ts',   // named after a world, not inside its folder
    'src/worlds/fairy2/index.ts', 'src/worlds/probes/x.ts',
    'public/models/probe/cube.glb',          // the probe world has no files under public/: a mistake, play everything
    'public/models/fairy/x.glb',             // the first world lies mixed with the shared files (Q1)
    'worlds-test/other/x.glb', 'x/src/worlds/probe/index.ts', 'worlds-test/probe',
  ])('a file that only looks like a world\'s (%s) is shared', (file) => {
    expect(ownerOf(file)).toBe(SHARED);
    expect(pick([file])).toMatchObject(EVERYTHING);
  });

  it('files of two worlds play both; a shared file among files of a world and documents still plays everything', () => {
    expect(pick(['src/worlds/probe/index.ts', 'src/worlds/fairy/npcs.ts'])).toMatchObject(EVERYTHING);
    expect(pick(['src/worlds/probe/index.ts', 'docs/15-tech.md', 'src/core/save.ts'])).toMatchObject(EVERYTHING);
    expect(pick(['src/worlds/fairy/index.ts', 'src/core/save.ts'])).toMatchObject(EVERYTHING);
    expect(pick(['docs/15-tech.md', 'tools/shot.mjs']).reason).toContain('shared files changed');
  });

  it.each(['docs/14-architecture.md', 'docs/worlds/hub.md', 'docs/pictures/map.png', 'CLAUDE.md', 'README.md', 'CREDITS.md',
    'tools/hero/README.md', 'worlds-test/probe/README.md', '.claude/skills/lead/SKILL.md', '.claude/checklist-run/profile.md', '.claude/settings.json',
  ])('a document (%s) plays nothing: unit tests and build only (R59)', (file) => {
    expect(ownerOf(file)).toBe(DOCS);
    const plan = pick([file]);
    expect(plan).toMatchObject(NOTHING);
    expect(plan.play).toEqual([]);
    expect(plan.reason).toContain('only documents changed (docs/**, *.md, .claude/**)');
  });

  it.each(['docs.ts', 'src/docs/help.ts', 'docsx/a.txt', 'src/.claude/x.json', '.claudex/y', 'notes.mdx', 'notes.md.ts', 'md', 'src/readme.MD'])(
    'a file that only looks like a document (%s) is shared', (file) => {
      expect(ownerOf(file)).toBe(SHARED);
      expect(pick([file])).toMatchObject(EVERYTHING);
    });

  it('documents next to files of a world do not widen the choice, and do not hide it', () => {
    expect(pick(['docs/13-worlds.md', 'src/worlds/probe/index.ts'])).toMatchObject(PROBE_ONLY);
    expect(pick(['src/worlds/fairy/index.ts', 'CLAUDE.md'])).toMatchObject(FAIRY_ONLY);
    expect(pick(['docs/13-worlds.md', 'src/worlds/probe/index.ts']).reason).toContain('(and documents)');
  });

  it.each([[null], [undefined], ['src/main.ts'], [{}], [[null]], [['docs/a.md', 7]], [['docs/a.md', '']]])(
    'changed files that are not known (%j) play everything', (files) => {
      const plan = pick(files);
      expect(plan).toMatchObject(EVERYTHING);
      expect(plan.reason).toContain('the changed files are not known');
    });

  it('no changed file at all plays everything: there is nothing to choose by', () => {
    const plan = pick([]);
    expect(plan).toMatchObject(EVERYTHING);
    expect(plan.reason).toContain('no changed file was found');
  });

  it('the plan lists every changed file with its owner', () => {
    expect(pick(['docs/a.md', 'src/worlds/probe/index.ts']).files).toEqual([{ path: 'docs/a.md', owner: DOCS }, { path: 'src/worlds/probe/index.ts', owner: 'probe' }]);
  });

  it('with another table of worlds: a file of a next world plays its jobs only, shared jobs are played once', () => {
    const worlds = {
      fairy: WORLDS.fairy,
      forest: { files: worldFiles('forest'), walk: [{ size: 'mobile', group: 'forest1' }, { size: 'mobile', group: 'shop' }], worlds: false },
      probe: WORLDS.probe,
    };
    for (const file of ['src/worlds/forest/index.ts', 'public/models/forest/tree.glb', 'public/voice/forest/hi.mp3', 'public/story/forest/1.webp', 'worlds-test/forest/x.glb']) {
      const plan = pick([file], worlds);
      expect(plan.play, file).toEqual(['forest']);
      expect(ids(plan), file).toEqual(['mobile:forest1', 'mobile:shop']);
      expect(plan.worlds, file).toBe(false);
      expect(plan.all, file).toBe(false);
    }
    const both = pick(['src/worlds/forest/index.ts', 'src/worlds/fairy/index.ts'], worlds);
    expect(ids(both)).toEqual([...ALL_WALKS.map((j) => `${j.size}:${j.group}`), 'mobile:forest1']);
    expect(both.all).toBe(false);
    expect(pick(['src/main.ts'], worlds)).toMatchObject({ all: true, worlds: true, play: ['fairy', 'forest', 'probe'] });
  });
});

const A = 'a'.repeat(40), B = 'b'.repeat(40);
/** A git that answers from a table { 'the arguments joined by a space': output, or an Error to throw } and records the calls. */
function fakeGit(table) {
  const calls = [];
  const git = (args) => {
    const key = args.join(' ');
    calls.push(key);
    if (!Object.hasOwn(table, key)) throw new Error(`Command failed: git ${key}\nfatal: unexpected call`);
    if (table[key] instanceof Error) throw table[key];
    return table[key];
  };
  return { git, calls };
}
const diffOf = (base) => `diff --name-only --no-renames -z ${base} HEAD`;

describe('tools/ci-pieces.mjs changedFiles: what a run is compared with', () => {
  it('a push to dev plays everything, whatever it changed: git is not even asked (a green check on dev means all of it was played)', () => {
    // A git that would answer "documents alone" to every way of asking: on a branch nothing but tests and build would be played.
    const { git, calls } = fakeGit({ 'merge-base origin/dev HEAD': `${A}\n`, [`cat-file -e ${A}^{commit}`]: '', [diffOf(A)]: 'docs/a.md\0' });
    const r = changedFiles({ event: 'push', ref: 'refs/heads/dev' }, git);
    expect(r.files).toBe(null);
    expect(r.why).toContain('a push to dev');
    expect(r.why).toContain('always played whole');
    expect(calls).toEqual([]);
    expect(pick(r.files)).toMatchObject(EVERYTHING);
    expect(outputs(pick(r.files), r)).toMatchObject({ walk: 'true', worlds: 'true' });
    // The same push to a branch is chosen by its files.
    const branch = changedFiles({ event: 'push', ref: 'refs/heads/run/docs' }, git);
    expect(branch.files).toEqual(['docs/a.md']);
    expect(outputs(pick(branch.files), branch)).toMatchObject({ walk: 'false', worlds: 'false' });
    // A branch merely named like it is a branch.
    expect(changedFiles({ event: 'push', ref: 'refs/heads/dev-notes' }, git).files).toEqual(['docs/a.md']);
    expect(changedFiles({ event: 'push', ref: 'refs/heads/run/dev' }, git).files).toEqual(['docs/a.md']);
  });

  it('a push to another branch: the common ancestor with origin/dev .. HEAD - the whole branch, not its last push', () => {
    const { git, calls } = fakeGit({ 'merge-base origin/dev HEAD': `${B}\n`, [`cat-file -e ${B}^{commit}`]: '', [diffOf(B)]: 'CLAUDE.md\0' });
    const r = changedFiles({ event: 'push', ref: 'refs/heads/run/world' }, git);
    expect(r.files).toEqual(['CLAUDE.md']);
    expect(r.why).toContain('the common ancestor with origin/dev');
    expect(calls).toEqual(['merge-base origin/dev HEAD', `cat-file -e ${B}^{commit}`, diffOf(B)]);
  });

  it('a pull request: its base .. HEAD', () => {
    const { git, calls } = fakeGit({ [`cat-file -e ${B}^{commit}`]: '', [diffOf(B)]: 'src/main.ts\0' });
    const r = changedFiles({ event: 'pull_request', ref: 'refs/pull/7/merge', prBase: B }, git);
    expect(r.files).toEqual(['src/main.ts']);
    expect(calls).toEqual([`cat-file -e ${B}^{commit}`, diffOf(B)]);
  });

  it('names are split by the zero byte only: a space or a line break inside a name stays in it', () => {
    const { git } = fakeGit({ 'merge-base origin/dev HEAD': `${A}\n`, [`cat-file -e ${A}^{commit}`]: '', [diffOf(A)]: 'docs/a b.md\0docs/two\nlines.md\0' });
    expect(changedFiles({ event: 'push', ref: 'refs/heads/run/names' }, git).files).toEqual(['docs/a b.md', 'docs/two\nlines.md']);
  });

  it.each([
    ['a run started by hand', { event: 'workflow_dispatch', ref: 'refs/heads/run/x' }, 'started by hand'],
    ['a run started by hand on dev', { event: 'workflow_dispatch', ref: 'refs/heads/dev' }, 'started by hand'],
    ['an event nobody thought of', { event: 'schedule', ref: 'refs/heads/dev' }, 'the event "schedule"'],
    ['no event', {}, 'the event ""'],
    ['a push to dev', { event: 'push', ref: 'refs/heads/dev' }, 'always played whole'],
    ['a pull request without its base', { event: 'pull_request', prBase: '' }, 'without the commit of its base'],
  ])('%s: the files are not known, git is not asked', (_, source, why) => {
    const { git, calls } = fakeGit({});
    const r = changedFiles(source, git);
    expect(r.files).toBe(null);
    expect(r.why).toContain(why);
    expect(calls).toEqual([]);
    expect(pick(r.files)).toMatchObject(EVERYTHING);
  });

  it.each([
    ['the common ancestor is not in the clone', { event: 'push', ref: 'refs/heads/run/x' },
      { 'merge-base origin/dev HEAD': `${A}\n`, [`cat-file -e ${A}^{commit}`]: new Error('Command failed: git cat-file\nfatal: Not a valid object name') }, 'Not a valid object name'],
    ['git diff fails', { event: 'push', ref: 'refs/heads/run/x' },
      { 'merge-base origin/dev HEAD': `${A}\n`, [`cat-file -e ${A}^{commit}`]: '', [diffOf(A)]: new Error('Command failed: git diff\nfatal: bad object') }, 'bad object'],
    ['there is no origin/dev', { event: 'push', ref: 'refs/heads/run/x' },
      { 'merge-base origin/dev HEAD': new Error('Command failed: git merge-base\nfatal: Not a valid object name origin/dev') }, 'origin/dev'],
    ['the branch has no common ancestor with dev', { event: 'push', ref: 'refs/heads/run/x' }, { 'merge-base origin/dev HEAD': '\n' }, 'no common ancestor'],
    ['the base of the pull request is not in the clone', { event: 'pull_request', prBase: B },
      { [`cat-file -e ${B}^{commit}`]: new Error('Command failed: git cat-file\nfatal: Not a valid object name') }, 'Not a valid object name'],
  ])('%s: the files are not known - everything is played', (_, source, table, why) => {
    const r = changedFiles(source, fakeGit(table).git);
    expect(r.files).toBe(null);
    expect(r.why).toContain(why);
    expect(pick(r.files)).toMatchObject(EVERYTHING);
  });

  it('a branch that changed nothing against dev plays everything', () => {
    const { git } = fakeGit({ 'merge-base origin/dev HEAD': `${B}\n`, [`cat-file -e ${B}^{commit}`]: '', [diffOf(B)]: '' });
    const r = changedFiles({ event: 'push', ref: 'refs/heads/run/same' }, git);
    expect(r.files).toEqual([]);
    expect(pick(r.files)).toMatchObject(EVERYTHING);
  });

  it('with a real git: a renamed file counts under both names, a deleted one under its own', () => {
    const repo = tmp();
    const git = (args) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
      { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git(['init', '-q', '-b', 'dev']);
    for (const f of ['old-name.md', 'gone.md', 'kept.md']) writeFileSync(join(repo, f), `${f}\n`.repeat(20));
    git(['add', '.']);
    git(['commit', '-q', '-m', 'first']);
    const first = git(['rev-parse', 'HEAD']).trim();
    git(['update-ref', 'refs/remotes/origin/dev', first]);
    git(['checkout', '-q', '-b', 'run/x']);
    git(['mv', 'old-name.md', 'new-name.ts']);
    git(['rm', '-q', 'gone.md']);
    git(['commit', '-q', '-m', 'second']);
    const branch = changedFiles({ event: 'push', ref: 'refs/heads/run/x' }, git);
    expect([...branch.files].sort()).toEqual(['gone.md', 'new-name.ts', 'old-name.md']);
    // the rename took a document out of the documents: the new name is a shared file, so everything is played
    expect(pick(branch.files)).toMatchObject(EVERYTHING);
    // the same commit pushed to dev is not chosen by its files
    expect(changedFiles({ event: 'push', ref: 'refs/heads/dev' }, git).files).toBe(null);
  });
});

describe('tools/ci-pieces.mjs outputs and report: what the job "plan" hands on', () => {
  it('everything: the matrix of sixteen walkthroughs, the same list for --combine --jobs, both switches on', () => {
    const out = outputs(pick(['src/main.ts']));
    expect(out.walk).toBe('true');
    expect(out.worlds).toBe('true');
    expect(JSON.parse(out.matrix)).toEqual({ include: ALL_WALKS });
    expect(out.jobs).toBe(ALL_WALKS.map((j) => `${j.size}:${j.group}`).join(','));
    expect(out.matrix).not.toContain('\n');
    expect(out.jobs).not.toMatch(/\s/);
  });

  it('documents only: both switches off, no walkthrough listed', () => {
    const out = outputs(pick(['docs/a.md']));
    expect(out).toMatchObject({ walk: 'false', worlds: 'false', jobs: '' });
    expect(JSON.parse(out.matrix)).toEqual({ include: [] });
  });

  it('one world: only its switch is on', () => {
    expect(outputs(pick(['src/worlds/probe/index.ts']))).toMatchObject({ walk: 'false', worlds: 'true', jobs: '' });
    expect(outputs(pick(['src/worlds/fairy/index.ts']))).toMatchObject({ walk: 'true', worlds: 'false' });
  });

  it('the report says what is skipped, why, what was compared, and lists the changed files with their owners', () => {
    const text = report(pick(['docs/a.md', 'CLAUDE.md']), { files: ['docs/a.md', 'CLAUDE.md'], why: 'the common ancestor with origin/dev, aaaaaaa..HEAD' }).join('\n');
    expect(text).toContain('reason: only documents changed (docs/**, *.md, .claude/**)');
    expect(text).toContain('compared with: the common ancestor with origin/dev, aaaaaaa..HEAD');
    expect(text).toContain('walkthroughs: skipped by the plan');
    expect(text).toContain('probe world (the job "worlds"): skipped by the plan');
    expect(text).toContain('changed files (2):\n  docs/a.md [document]\n  CLAUDE.md [document]');
    const probe = report(pick(['src/worlds/probe/index.ts', 'src/main.ts'])).join('\n');
    expect(probe).toContain('walkthroughs: planned, 16 jobs (mobile world1, ');
    expect(probe).toContain('probe world (the job "worlds"): planned');
    expect(probe).toContain('  src/worlds/probe/index.ts [world probe]\n  src/main.ts [shared]');
  });

  it('the report says why the files are not known', () => {
    const text = report(pick(null), { files: null, why: 'the run was started by hand' }).join('\n');
    expect(text).toContain('the changed files are not known: the run was started by hand');
    expect(text).toContain('changed files: none to list');
    expect(text).not.toContain('compared with');
  });

  it('a long list is cut and says how many files there are in all; control characters do not reach the log', () => {
    const many = Array.from({ length: MAX_LISTED + 25 }, (_, i) => `docs/page-${i}.md`);
    const lines = report(pick(many));
    expect(lines).toContain(`changed files (${MAX_LISTED + 25}):`);
    expect(lines.filter((l) => l.startsWith('  docs/page-'))).toHaveLength(MAX_LISTED);
    expect(lines.at(-1)).toBe(`  ... and 25 more (${MAX_LISTED + 25} in all)`);
    expect(report(pick(many.slice(0, MAX_LISTED))).join('\n')).not.toContain('more (');
    const odd = report(pick(['docs/a\nwalk=false\u001b[0m.md'])).join('\n');
    expect(odd).toContain('  docs/a?walk=false?[0m.md [document]');
    expect(report(pick([`docs/${'x'.repeat(500)}.md`])).join('\n').length).toBeLessThan(700);
  });

  it('a file named like a command to the runner is printed as text: no line of the report starts with "::"', () => {
    const named = ['::set-output name=walk::false.md', '::error::x.md', 'docs/::notice::y.md'];
    const lines = report(pick(named), { files: named, why: 'the files given' });
    expect(lines.join('\n')).not.toContain('::');
    expect(lines).toContain('  : :set-output name=walk: :false.md [document]');
    // The same text goes into the output "report" of the job and is printed again by "check".
    expect(outputs(pick(named)).report).not.toContain('::');
    // The plan itself is not changed by the names: three documents, nothing is played.
    expect(outputs(pick(named))).toMatchObject({ walk: 'false', worlds: 'false' });
  });
});

const OK = { plan: 'success', build: 'success', walk: 'success', worlds: 'success' };
const ALL = { walk: 'true', worlds: 'true' };
describe('tools/ci-pieces.mjs verdict: may "check" pass', () => {
  it('everything planned and everything succeeded: passes, and --combine has something to read', () => {
    expect(verdict(OK, ALL)).toMatchObject({ ok: true, bad: [], combine: true });
  });

  it.each(['failure', 'cancelled', 'skipped', ''])('a planned job that ended as "%s" fails it', (result) => {
    const walk = verdict({ ...OK, walk: result }, ALL);
    expect(walk.ok).toBe(false);
    expect(walk.bad.join()).toContain('walkthroughs: planned, but ended as');
    const worlds = verdict({ ...OK, worlds: result }, ALL);
    expect(worlds.ok).toBe(false);
    expect(worlds.bad.join()).toContain('probe world: planned, but ended as');
    expect(verdict({ ...OK, walk: 'skipped', worlds: result }, { walk: 'false', worlds: 'true' }).ok).toBe(false);
    expect(verdict({ ...OK, walk: result, worlds: 'skipped' }, { walk: 'true', worlds: 'false' }).ok).toBe(false);
  });

  it('nothing planned and both skipped: passes, says so, and --combine is not to be run', () => {
    const v = verdict({ ...OK, walk: 'skipped', worlds: 'skipped' }, { walk: 'false', worlds: 'false' });
    expect(v).toMatchObject({ ok: true, combine: false });
    expect(v.lines).toContain('walkthroughs: skipped - SKIPPED BY THE PLAN');
    expect(v.lines).toContain('probe world: skipped - SKIPPED BY THE PLAN');
  });

  it('one world planned: its job must have succeeded, the other must have been skipped', () => {
    expect(verdict({ ...OK, walk: 'skipped' }, { walk: 'false', worlds: 'true' })).toMatchObject({ ok: true, combine: false });
    expect(verdict({ ...OK, worlds: 'skipped' }, { walk: 'true', worlds: 'false' })).toMatchObject({ ok: true, combine: true });
  });

  it.each(['success', 'failure', 'cancelled', ''])('a job that was not planned but ended as "%s" fails it: the plan and the run disagree', (result) => {
    expect(verdict({ ...OK, walk: result, worlds: 'skipped' }, { walk: 'false', worlds: 'false' }).ok).toBe(false);
    expect(verdict({ ...OK, walk: 'skipped', worlds: result }, { walk: 'false', worlds: 'false' }).ok).toBe(false);
  });

  it.each(['failure', 'cancelled', 'skipped', ''])('a plan that ended as "%s" fails it, whatever the switches say', (result) => {
    expect(verdict({ ...OK, plan: result }, ALL).ok).toBe(false);
    const none = verdict({ plan: result, build: 'success', walk: 'skipped', worlds: 'skipped' }, { walk: 'false', worlds: 'false' });
    expect(none.ok).toBe(false);
    expect(none.bad.join()).toContain('plan: ');
  });

  it.each(['failure', 'cancelled', 'skipped', ''])('unit tests and build that ended as "%s" fail it, also when nothing else was planned', (result) => {
    expect(verdict({ ...OK, build: result }, ALL).ok).toBe(false);
    const none = verdict({ plan: 'success', build: result, walk: 'skipped', worlds: 'skipped' }, { walk: 'false', worlds: 'false' });
    expect(none.ok).toBe(false);
    expect(none.bad.join()).toContain('unit tests and build: ');
  });

  it.each([[{}], [{ walk: 'true' }], [{ worlds: 'true' }], [{ walk: '', worlds: '' }], [{ walk: 'yes', worlds: 'true' }], [{ walk: 'true', worlds: 'TRUE' }]])(
    'a plan that gave no clear answer (%j) fails it: skipped jobs are not taken for planned skips', (expected) => {
      expect(verdict(OK, expected).ok).toBe(false);
      expect(verdict({ ...OK, walk: 'skipped', worlds: 'skipped' }, expected).ok).toBe(false);
    });

  it('no results at all fails it', () => {
    expect(verdict().ok).toBe(false);
    expect(verdict({}, ALL).ok).toBe(false);
  });
});

const script = join(root, 'tools/ci-pieces.mjs');
function cli(args, env = {}) {
  const clean = { ...process.env };
  for (const k of ['GITHUB_OUTPUT', 'CI_EVENT', 'CI_REF', 'CI_BEFORE', 'CI_PR_BASE', 'PLAN_RESULT', 'BUILD_RESULT', 'WALK_RESULT', 'WORLDS_RESULT', 'PLAN_WALK', 'PLAN_WORLDS', 'PLAN_REPORT']) delete clean[k];
  const r = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', env: { ...clean, ...env }, timeout: 30000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
/** The outputs of a step, read the way GitHub reads $GITHUB_OUTPUT: name=value, or name<<mark … mark. */
function readOutputs(file) {
  const out = {}, lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const many = /^([\w-]+)<<(.+)$/.exec(lines[i]);
    if (many) {
      const end = lines.indexOf(many[2], i + 1);
      out[many[1]] = lines.slice(i + 1, end).join('\n');
      i = end;
    } else if (lines[i].includes('=')) out[lines[i].slice(0, lines[i].indexOf('='))] = lines[i].slice(lines[i].indexOf('=') + 1);
  }
  return out;
}

describe('tools/ci-pieces.mjs from the command line', () => {
  it('pick: prints the plan for the files given', () => {
    const probe = cli(['pick', 'src/worlds/probe/index.ts']);
    expect(probe.code, probe.out).toBe(0);
    expect(probe.out).toContain('[ci] outputs: walk=false worlds=true');
    expect(cli(['pick', 'src/main.ts']).out).toContain('[ci] outputs: walk=true worlds=true');
    expect(cli(['pick', 'docs/a.md']).out).toContain('[ci] outputs: walk=false worlds=false');
  });

  it('plan: a run started by hand plays everything and writes every output the workflow reads', () => {
    const file = join(tmp(), 'out');
    writeFileSync(file, '');
    const r = cli(['plan'], { CI_EVENT: 'workflow_dispatch', CI_REF: 'refs/heads/dev', GITHUB_OUTPUT: file });
    expect(r.code, r.out).toBe(0);
    const out = readOutputs(file);
    expect(Object.keys(out).sort()).toEqual(['jobs', 'matrix', 'report', 'walk', 'worlds']);
    expect(out).toMatchObject({ walk: 'true', worlds: 'true' });
    expect(JSON.parse(out.matrix)).toEqual({ include: ALL_WALKS });
    expect(out.jobs.split(',')).toHaveLength(16);
    expect(out.report).toContain('the changed files are not known: the run was started by hand');
    expect(r.out).toContain(out.report);
  });

  it('plan: a push to dev plays everything and says why', () => {
    const file = join(tmp(), 'out');
    writeFileSync(file, '');
    const r = cli(['plan'], { CI_EVENT: 'push', CI_REF: 'refs/heads/dev', GITHUB_OUTPUT: file });
    expect(r.code, r.out).toBe(0);
    const out = readOutputs(file);
    expect(out).toMatchObject({ walk: 'true', worlds: 'true' });
    expect(JSON.parse(out.matrix)).toEqual({ include: ALL_WALKS });
    expect(out.report).toContain('the changed files are not known: a push to dev: the branch the work is merged into is always played whole');
  });

  it('check: passes with everything skipped by the plan, and says what was skipped, why, and for which files', () => {
    const plan = outputs(pick(['docs/a.md', 'CLAUDE.md']), { files: [], why: 'the common ancestor with origin/dev, aaaaaaa..HEAD' });
    const r = cli(['check'], { PLAN_RESULT: 'success', BUILD_RESULT: 'success', WALK_RESULT: 'skipped', WORLDS_RESULT: 'skipped', PLAN_WALK: plan.walk, PLAN_WORLDS: plan.worlds, PLAN_REPORT: plan.report });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('[ci] walkthroughs: skipped - SKIPPED BY THE PLAN');
    expect(r.out).toContain('[ci] probe world: skipped - SKIPPED BY THE PLAN');
    expect(r.out).toContain('reason: only documents changed (docs/**, *.md, .claude/**)');
    expect(r.out).toContain('changed files (2):\n  docs/a.md [document]\n  CLAUDE.md [document]');
    expect(r.out).toContain('(tools/e2e.mjs --combine) are NOT run');
    expect(r.out).toContain('::notice title=check::skipped by the plan: walkthroughs, probe world - reason: only documents changed');
    expect(r.out).toContain('[ci] PASSED');
  });

  it('check: passes with everything played, and then says nothing about skipping', () => {
    const plan = outputs(pick(['src/main.ts']));
    const r = cli(['check'], { PLAN_RESULT: 'success', BUILD_RESULT: 'success', WALK_RESULT: 'success', WORLDS_RESULT: 'success', PLAN_WALK: plan.walk, PLAN_WORLDS: plan.worlds, PLAN_REPORT: plan.report });
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain('NOT run');
    expect(r.out).not.toContain('::notice');
    expect(r.out).not.toContain('SKIPPED BY THE PLAN');
  });

  it.each([
    ['a planned walkthrough failed', { WALK_RESULT: 'failure' }, 'walkthroughs: planned, but ended as failure'],
    ['a planned walkthrough was skipped because the build failed', { BUILD_RESULT: 'failure', WALK_RESULT: 'skipped', WORLDS_RESULT: 'skipped' }, 'unit tests and build: failure'],
    ['the planned probe world was cancelled', { WORLDS_RESULT: 'cancelled' }, 'probe world: planned, but ended as cancelled'],
    ['the plan failed and left no outputs', { PLAN_RESULT: 'failure', BUILD_RESULT: 'success', WALK_RESULT: 'skipped', WORLDS_RESULT: 'skipped', PLAN_WALK: '', PLAN_WORLDS: '', PLAN_REPORT: '' }, 'plan: failure, not success'],
  ])('check: fails when %s', (_, change, text) => {
    const r = cli(['check'], { PLAN_RESULT: 'success', BUILD_RESULT: 'success', WALK_RESULT: 'success', WORLDS_RESULT: 'success', PLAN_WALK: 'true', PLAN_WORLDS: 'true', PLAN_REPORT: 'reason: shared files changed', ...change });
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('[ci] FAILED');
    expect(r.out).toContain(text);
    expect(r.out).not.toContain('::notice');
  });

  it('check: fails with no environment at all; an unknown command is a mistake', () => {
    expect(cli(['check']).code).toBe(1);
    expect(cli([]).code).toBe(2);
    expect(cli(['play']).code).toBe(2);
    expect(cli(['check', 'extra']).code).toBe(2);
  });
});

// ---- the workflows, read as text ----
/** A workflow without its comment lines and trailing comments: { text, jobs: { id: the block of that job } }. */
function workflow(name) {
  const text = readFileSync(join(root, '.github/workflows', name), 'utf8').split('\n')
    .filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s+#\s.*$/, '')).join('\n');
  const body = text.slice(text.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const jobs = {};
  let id = null;
  for (const line of body.split('\n')) {
    const head = /^ {2}([\w-]+):$/.exec(line);
    if (head) { id = head[1]; jobs[id] = ''; } else if (id) jobs[id] += `${line}\n`;
  }
  return { text, jobs };
}
/** The value of a key of the job itself (four spaces deep), as written. */
const key = (job, name) => new RegExp(`^ {4}${name}: (.*)$`, 'm').exec(job)?.[1] ?? null;
const hasKey = (job, name) => new RegExp(`^ {4}${name}:`, 'm').test(job);
const yamlList = (text) => text.replace(/^\[|\]$/g, '').split(',').map((x) => x.trim());

describe('.github/workflows/ci.yml: the jobs follow the plan, "check" compares them with it', () => {
  const ci = workflow('ci.yml');

  it('has the jobs plan, build, walk, worlds and check; "check" keeps its name (R27)', () => {
    expect(Object.keys(ci.jobs)).toEqual(['plan', 'build', 'walk', 'worlds', 'check']);
    expect(hasKey(ci.jobs.check, 'name')).toBe(false);   // no name of its own: the status is called "check"
    expect(key(ci.jobs.build, 'name')).toBe('unit tests and build');
    expect(key(ci.jobs.walk, 'name')).toBe('walkthrough ${{ matrix.size }} ${{ matrix.group }}');
  });

  it('plan: the whole history, the event handed to tools/ci-pieces.mjs, every output handed on', () => {
    const plan = ci.jobs.plan;
    expect(plan).toMatch(/uses: actions\/checkout@v4\n {8}with:\n {10}fetch-depth: 0\n/);
    expect(plan).toContain('run: node tools/ci-pieces.mjs plan');
    expect(plan).toContain('id: pick');
    for (const out of ['walk', 'worlds', 'matrix', 'jobs', 'report']) expect(plan).toContain(`      ${out}: \${{ steps.pick.outputs.${out} }}`);
    expect(plan).toContain('CI_EVENT: ${{ github.event_name }}');
    expect(plan).toContain('CI_REF: ${{ github.ref }}');
    // dev is not compared with the commit it was at before the push: a push to dev plays everything
    expect(plan).not.toContain('github.event.before');
    expect(plan).toContain('CI_PR_BASE: ${{ github.event.pull_request.base.sha }}');
    expect(hasKey(plan, 'if')).toBe(false);
    expect(hasKey(plan, 'needs')).toBe(false);
    expect(plan).not.toContain('continue-on-error');
  });

  it('build: always runs, waits for nobody', () => {
    expect(hasKey(ci.jobs.build, 'if')).toBe(false);
    expect(hasKey(ci.jobs.build, 'needs')).toBe(false);
    expect(ci.jobs.build).toContain('run: npm test');
    expect(ci.jobs.build).toContain('run: npm run build');
  });

  it('walk: takes its list from the plan and is skipped when the plan lists none', () => {
    const walk = ci.jobs.walk;
    expect(key(walk, 'needs')).toBe('[plan, build]');
    expect(key(walk, 'if')).toBe("${{ needs.plan.outputs.walk == 'true' }}");
    expect(walk).toContain('      matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}\n');
    expect(walk).not.toMatch(/^\s+(size|group): \[/m);
    expect(walk).toContain('npm run e2e -- --skip-build --mode ${{ matrix.size }} --only ${{ matrix.group }}');
    expect(walk).toContain('name: results-${{ matrix.size }}-${{ matrix.group }}');
    expect(walk).toContain("E2E_STUCK_MS: ${{ inputs.break == matrix.size && '1' || '' }}");
    expect(walk).not.toContain('continue-on-error');
  });

  it('walk does not play the probe world a second time; the job "worlds" plays it when the plan says so', () => {
    expect(ci.jobs.walk).toContain("          E2E_WORLDS: '0'\n");
    const worlds = ci.jobs.worlds;
    expect(key(worlds, 'needs')).toBe('[plan, build]');
    expect(key(worlds, 'if')).toBe("${{ needs.plan.outputs.worlds == 'true' }}");
    expect(worlds).toContain('node tools/worlds.mjs dist --only ${{ matrix.part }} ');
    expect(worlds).toContain('set -o pipefail');
    expect(worlds).toContain("          E2E_GL: swiftshader\n          Q: '0'\n");
    expect(worlds).toContain('- run: npm ci');
    expect(worlds).toMatch(/uses: actions\/download-artifact@v4\n {8}with:\n {10}name: dist\n {10}path: dist\n/);
    // the same shallow checkout as "build": the commit in the build is compared with `git rev-parse --short HEAD`
    expect(worlds).not.toContain('fetch-depth');
    expect(ci.jobs.build).not.toContain('fetch-depth');
    expect(ci.jobs.walk).not.toContain('fetch-depth');
    expect(worlds).not.toContain('continue-on-error');
  });

  it('check: waits for every job, runs when they failed too, and hands every result and the plan to tools/ci-pieces.mjs', () => {
    const check = ci.jobs.check;
    expect(key(check, 'needs')).toBe('[plan, build, walk, worlds]');
    expect(key(check, 'if')).toBe('${{ !cancelled() }}');
    for (const [name, value] of Object.entries({
      PLAN_RESULT: 'needs.plan.result', BUILD_RESULT: 'needs.build.result', WALK_RESULT: 'needs.walk.result', WORLDS_RESULT: 'needs.worlds.result',
      PLAN_WALK: 'needs.plan.outputs.walk', PLAN_WORLDS: 'needs.plan.outputs.worlds', PLAN_REPORT: 'needs.plan.outputs.report',
    })) expect(check).toContain(`          ${name}: \${{ ${value} }}\n`);
    const step = check.slice(check.indexOf('- name: Every job ended as planned'), check.indexOf('- name: Results of the walkthroughs'));
    expect(step).toContain('run: node tools/ci-pieces.mjs check');
    expect(step).not.toMatch(/^\s+if:/m);                  // the verdict itself is never skipped
    expect(step).not.toContain('continue-on-error');
    expect(step).not.toContain('|| true');
    // nothing but the checkout and Node before the verdict
    expect(check.slice(check.indexOf('    steps:'), check.indexOf('- name: Every job ended as planned'))).not.toContain('run:');
  });

  it('check: --combine gets the list of the plan, and is not called when no walkthrough was planned', () => {
    const check = ci.jobs.check;
    const step = check.slice(check.indexOf('- name: Checks over all sizes'));
    expect(step).toContain("        if: ${{ !cancelled() && needs.plan.outputs.walk == 'true' }}\n");
    expect(step).toContain('          PLAN_JOBS: ${{ needs.plan.outputs.jobs }}\n');
    expect(step).toContain('        run: node tools/e2e.mjs --combine e2e-results --jobs "$PLAN_JOBS"\n');
    expect(step).not.toContain('continue-on-error');
    expect(check).not.toContain('--only');
  });

  it('the rest stays as it was: the triggers, the sizes of "break", the permissions, the concurrency', () => {
    expect(ci.text).toContain('on:\n  push:\n    branches-ignore: [main]\n  pull_request:\n  workflow_dispatch:\n');
    expect(yamlList(/^ {8}options: (\[.*\])$/m.exec(ci.text)[1])).toEqual(['none', ...SIZES]);
    expect(ci.text).toContain('permissions:\n  contents: read\n');
    expect(ci.text).toContain('concurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true\n');
  });
});

describe('.github/workflows/pages.yml: before a publication everything is played, whatever changed (R26)', () => {
  const pages = workflow('pages.yml');

  it('has no plan: the jobs are build, walk, worlds, check and deploy, and nothing asks tools/ci-pieces.mjs', () => {
    expect(Object.keys(pages.jobs)).toEqual(['build', 'walk', 'worlds', 'check', 'deploy']);
    expect(pages.text).not.toContain('needs.plan');
    expect(pages.text).not.toContain('ci-pieces');
    expect(pages.text).not.toContain('fromJSON');
    expect(pages.text).not.toMatch(/needs\.[\w-]+\.outputs/);   // no job decides for another what is played
  });

  it('walk: the full list, written out - every size and every piece of the first world', () => {
    const walk = pages.jobs.walk;
    expect(key(walk, 'needs')).toBe('build');
    expect(hasKey(walk, 'if')).toBe(false);
    expect(yamlList(/^ {8}size: (\[.*\])$/m.exec(walk)[1])).toEqual(SIZES);
    expect(yamlList(/^ {8}group: (\[.*\])$/m.exec(walk)[1])).toEqual(PIECES);
    expect(walk).toContain('npm run e2e -- --skip-build --mode ${{ matrix.size }} --only ${{ matrix.group }}');
    expect(walk).toContain("          E2E_WORLDS: '0'\n");
    expect(walk).not.toContain('continue-on-error');
    // the same sixteen jobs the plan of ci.yml gives for everything
    const written = SIZES.flatMap((size) => PIECES.map((group) => `${size}:${group}`));
    expect(written).toEqual(outputs(pick(null)).jobs.split(','));
  });

  it('worlds: the probe world is played always', () => {
    const worlds = pages.jobs.worlds;
    expect(key(worlds, 'needs')).toBe('build');
    expect(hasKey(worlds, 'if')).toBe(false);
    expect(worlds).toContain('node tools/worlds.mjs dist --only ${{ matrix.part }} ');
    expect(worlds).toContain('set -o pipefail');
    expect(worlds).toContain("          E2E_GL: swiftshader\n          Q: '0'\n");
    expect(worlds).not.toContain('continue-on-error');
  });

  it('check: keeps its name, runs when the others failed, needs all three to have succeeded and every piece combined', () => {
    const check = pages.jobs.check;
    expect(hasKey(check, 'name')).toBe(false);
    expect(key(check, 'needs')).toBe('[build, walk, worlds]');
    expect(key(check, 'if')).toBe('${{ !cancelled() }}');
    expect(check).toContain('test "${{ needs.build.result }}" = success && test "${{ needs.walk.result }}" = success && test "${{ needs.worlds.result }}" = success\n');
    expect(check).toContain(`        run: node tools/e2e.mjs --combine e2e-results --only ${PIECES.join(',')}\n`);
    expect(check).not.toContain('|| true');
    const verdictStep = check.slice(check.indexOf('- name: Every job passed'), check.indexOf('- uses: actions/checkout@v4'));
    expect(verdictStep).not.toMatch(/^\s+if:/m);
    expect(verdictStep).not.toContain('continue-on-error');
    const combine = check.slice(check.indexOf('- name: Checks over all sizes'));
    expect(combine).toContain('        if: ${{ !cancelled() }}\n');
    expect(combine).not.toContain('continue-on-error');
  });

  it('deploy: only after "check"', () => {
    expect(key(pages.jobs.deploy, 'needs')).toBe('check');
    expect(hasKey(pages.jobs.deploy, 'if')).toBe(false);
  });

  it('the steps of the job "worlds" are the same in both workflows', () => {
    const steps = (job) => job.slice(job.indexOf('    steps:'));
    expect(steps(pages.jobs.worlds)).toBe(steps(workflow('ci.yml').jobs.worlds));
  });

  it.each(['ci.yml', 'pages.yml'])('%s: the job "worlds" is a job for each part of tools/worlds.mjs, none left out, and one failed part does not stop the others', (name) => {
    const worlds = workflow(name).jobs.worlds;
    expect(yamlList(/^ {8}part: (\[.*\])$/m.exec(worlds)[1])).toEqual(PARTS);
    expect(worlds).toContain('    strategy:\n      fail-fast: false\n      matrix:\n        part: [');
    expect(key(worlds, 'name')).toBe('worlds (probe world, ${{ matrix.part }})');
    // a failed part keeps its own pictures: two parts must not upload under one name
    expect(worlds).toContain('          name: worlds-failure-${{ matrix.part }}\n');
    expect(worlds.match(/tools\/worlds\.mjs/g)).toHaveLength(1);
  });
});
