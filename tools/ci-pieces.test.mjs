// Runs in `npm test`. ci.yml plays only what the changed files ask for (ARCH-16): tools/ci-pieces.mjs chooses the
// jobs, the job "plan" hands the choice to the others and "check" compares what ran with it. "check" is the gate into
// dev and the status the protection of main requires, so every branch of the choice is pinned here, and so is the
// wiring of both workflows, read as text (the project has no YAML parser): a walkthrough that silently stopped being
// played would otherwise still give a green "check".
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { DOCS, GH_TIMEOUT_MS, MAX_LISTED, PLAYING_JOBS, RESULTS, SHARED, TRY_ALL, TRY_ALL_MAX, TRY_LIMITS, TRY_TURN, attemptName, lastAttempts, TRY_MAX, changedFiles, outputs, ownerOf, pick, report, rested, rests, tryPlan, tryResult, turnError, verdict, walkJobName, worldsJobName } from './ci-pieces.mjs';
import { PIECES } from './e2e-saves.mjs';
import { SIZES, WORLDS, worldFiles } from './world-pieces.mjs';
import { PARTS, PUBLISH_PARTS } from './worlds.mjs';
import { PASS_TIMEOUT_MS as FOREST_PASS_MS } from './forest-pass.mjs';
import { PASS_TIMEOUT_MS as SEA_PASS_MS } from './sea-pass.mjs';
import { PASS_TIMEOUT_MS as SWEET_PASS_MS } from './sweet-grey.mjs';
import { PASS_TIMEOUT_MS as SKY_PASS_MS } from './sky-grey.mjs';

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
  it('the first world is the twenty-four walkthroughs - four sizes, six pieces - and not the job "worlds"', () => {
    expect(WORLDS.fairy.walk).toEqual(ALL_WALKS);
    expect(new Set(ids(WORLDS.fairy)).size).toBe(24);
    expect(WORLDS.fairy.worlds).toBe(false);
    expect(WORLDS.fairy.files).toEqual(['src/worlds/fairy/']);
  });

  it('the probe world is the job "worlds" alone', () => {
    expect(WORLDS.probe).toEqual({ files: ['src/worlds/probe/', 'worlds-test/probe/'], walk: [], worlds: true });
  });

  it('the hub is the job "worlds" alone until its pass comes (checklist F): no walkthrough of its own yet', () => {
    expect(WORLDS.hub).toEqual({ files: worldFiles('hub'), walk: [], worlds: true });
    expect(pick(['src/worlds/hub/index.ts'])).toMatchObject(PROBE_ONLY);
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
  it('a file of the first world plays the pieces of that world only: twenty-four walkthroughs, no probe world', () => {
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
    expect(plan.play).toEqual(['fairy', 'hub', 'probe']);
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
    // every job, but not "all": the hub is a world of its own (its files play the job "worlds" alone)
    expect(pick(['src/worlds/probe/index.ts', 'src/worlds/fairy/npcs.ts'])).toMatchObject({ walk: ALL_WALKS, worlds: true, all: false, play: ['fairy', 'probe'] });
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
  it('a push to dev is not chosen by its files, whatever it changed: git is not even asked, and without a run to rest on everything is played', () => {
    // A git that would answer "documents alone" to every way of asking: on a branch nothing but tests and build would be played.
    const { git, calls } = fakeGit({ 'merge-base origin/dev HEAD': `${A}\n`, [`cat-file -e ${A}^{commit}`]: '', [diffOf(A)]: 'docs/a.md\0' });
    const r = changedFiles({ event: 'push', ref: 'refs/heads/dev' }, git);
    expect(r.files).toBe(null);
    expect(r.why).toContain('a push to dev');
    expect(r.why).toContain('played whole');
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
    ['a push to dev', { event: 'push', ref: 'refs/heads/dev' }, 'played whole'],
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
  it('everything: the matrix of twenty-four walkthroughs, the same list for --combine --jobs, both switches on', () => {
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
    expect(probe).toContain('walkthroughs: planned, 24 jobs (mobile world1, ');
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
/**
 * A stand-in for `gh`: no unit test asks GitHub. FAKE_GH says how it answers: "refuse" (the default: an error and exit
 * code 1), "garbage" (an answer that is not JSON), "hang" (no answer for a minute), or a JSON object - the answer for
 * the first key that is a part of the path asked for (no key fits: an error).
 */
const fakeGh = (() => {
  const file = join(tmp(), 'gh');
  writeFileSync(file, `#!${process.execPath}
const mode = process.env.FAKE_GH || 'refuse', path = process.argv[process.argv.length - 1];
if (mode === 'garbage') { console.log('<html>502 Bad Gateway</html>'); process.exit(0); }
if (mode === 'hang') setTimeout(() => {}, 60000);
else if (mode.startsWith('{')) {
  const hit = Object.entries(JSON.parse(mode)).find(([key]) => path.includes(key));
  if (hit) { console.log(JSON.stringify(hit[1])); process.exit(0); }
  console.error('gh: no answer prepared for ' + path); process.exit(1);
} else { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
`);
  chmodSync(file, 0o755);
  return file;
})();
function cli(args, env = {}) {
  const clean = { ...process.env, CI_GH: fakeGh };
  for (const k of ['FAKE_GH', 'CI_GH_TIMEOUT_MS']) delete clean[k];
  for (const k of ['GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GH_TOKEN', 'CI_SHA', 'CI_EVENT', 'CI_REF', 'CI_BEFORE', 'CI_PR_BASE', 'PLAN_RESULT', 'BUILD_RESULT', 'WALK_RESULT', 'WORLDS_RESULT', 'PLAN_WALK', 'PLAN_WORLDS', 'PLAN_REPORT']) delete clean[k];
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
    expect(out.jobs.split(',')).toHaveLength(24);
    expect(out.report).toContain('the changed files are not known: the run was started by hand');
    expect(r.out).toContain(out.report);
  });

  it('plan: a push to dev that cannot ask GitHub (no repository named) plays everything and says why', () => {
    const file = join(tmp(), 'out');
    writeFileSync(file, '');
    const r = cli(['plan'], { CI_EVENT: 'push', CI_REF: 'refs/heads/dev', GITHUB_OUTPUT: file });
    expect(r.code, r.out).toBe(0);
    const out = readOutputs(file);
    expect(out).toMatchObject({ walk: 'true', worlds: 'true' });
    expect(JSON.parse(out.matrix)).toEqual({ include: ALL_WALKS });
    expect(out.report).toContain('the changed files are not known: a push to dev: the branch the work is merged into is played whole');
    expect(out.report).toContain('reason: a push to dev, and no run of this commit to rest on - the repository of this run is not known: everything is played');
    expect(r.out).toContain('[ci] a push to dev: the repository of this run is not known: everything is played');
  });

  // ---- a push to dev asks GitHub: the stand-in answers, the network is never touched ----
  const DEV = { CI_EVENT: 'push', CI_REF: 'refs/heads/dev', GITHUB_REPOSITORY: 'someone/some-game', CI_SHA: A, CI_BEFORE: B, GITHUB_RUN_ID: '100' };
  const planOnDev = (env = {}) => {
    const file = join(tmp(), 'out');
    writeFileSync(file, '');
    const r = cli(['plan'], { ...DEV, GITHUB_OUTPUT: file, ...env });
    return { ...r, outputs: readOutputs(file) };
  };

  it.each([
    ['refuses (an error and exit code 1)', { FAKE_GH: 'refuse' }, 'gh: Not Found (HTTP 404)'],
    ['is not installed', { CI_GH: 'gh-that-is-not-installed-anywhere' }, 'ENOENT'],
    ['answers with something that is not JSON', { FAKE_GH: 'garbage' }, 'JSON'],
    ['answers with JSON of another shape', { FAKE_GH: JSON.stringify({ 'actions/workflows': { message: 'Not Found' } }) }, 'GitHub did not list the runs of this commit'],
  ])('plan: a push to dev whose question to GitHub fails - gh %s - plays everything and says why', (_name, env, why) => {
    const r = planOnDev(env);
    expect(r.code, r.out).toBe(0);
    expect(r.outputs).toMatchObject({ walk: 'true', worlds: 'true' });
    expect(JSON.parse(r.outputs.matrix)).toEqual({ include: ALL_WALKS });
    expect(r.out).toContain('GitHub did not list the runs of this commit');
    expect(r.out).toContain(why);
    expect(r.out).toContain('everything is played');
  }, 30000);

  it('plan: a question to GitHub that hangs is given up within its limit, and everything is played', () => {
    expect(GH_TIMEOUT_MS).toBeGreaterThanOrEqual(3000);
    expect(GH_TIMEOUT_MS).toBeLessThanOrEqual(20000);      // three questions at most: far inside the 5 minutes of the job "plan"
    const started = Date.now();
    const r = planOnDev({ FAKE_GH: 'hang', CI_GH_TIMEOUT_MS: '400' });
    expect(Date.now() - started).toBeLessThan(20000);       // the stand-in would hang for a minute
    expect(r.code, r.out).toBe(0);
    expect(r.outputs).toMatchObject({ walk: 'true', worlds: 'true' });
    expect(r.out).toContain('GitHub did not list the runs of this commit');
    // the source: the limit is on the question itself, and a hung program is killed, not waited for
    const src = readFileSync(script, 'utf8');
    expect(src).toContain("timeout: limit, killSignal: 'SIGKILL'");
    expect(src).toContain('const limit = Number(env.CI_GH_TIMEOUT_MS) > 0 ? Number(env.CI_GH_TIMEOUT_MS) : GH_TIMEOUT_MS;');
  }, 60000);

  const answers = (o) => ({ FAKE_GH: JSON.stringify(o) });
  const jobsAll = { jobs: [{ name: 'plan', conclusion: 'success' }, ...PLAYING_JOBS.map((name) => ({ name, conclusion: 'success' })), { name: 'check', conclusion: 'success' }] };
  const jobsLess = { jobs: [{ name: 'plan', conclusion: 'success' }, { name: 'walk', conclusion: 'skipped' }, { name: 'check', conclusion: 'success' }] };
  const runOf = (id, sha, o = {}) => ({ id, event: 'push', status: 'completed', conclusion: 'success', head_branch: 'run/work', head_sha: sha, ...o });

  it('plan: a push to dev whose commit was played whole on its branch plays nothing again - basis (a), the run is named', () => {
    const r = planOnDev(answers({ [`head_sha=${A}`]: { workflow_runs: [runOf(100, A, { head_branch: 'dev', status: 'in_progress', conclusion: null }), runOf(7, A)] }, 'runs/7/jobs': jobsAll }));
    expect(r.code, r.out).toBe(0);
    expect(r.outputs).toMatchObject({ walk: 'false', worlds: 'false', jobs: '' });
    expect(r.outputs.report.split('\n')[0]).toContain('reason: a push to dev that rests on run #7 (branch run/work), basis (a)');
    expect(r.out).toContain('[ci] a push to dev: this commit was played whole by run #7');
  }, 30000);

  it('plan: a commit played by a reduced plan rests on it only on top of a head of dev that is green on dev - basis (b)', () => {
    const less = { [`head_sha=${A}`]: { workflow_runs: [runOf(7, A)] }, 'runs/7/jobs': jobsLess };
    const green = planOnDev(answers({ ...less, [`head_sha=${B}`]: { workflow_runs: [runOf(3, B, { head_branch: 'dev' })] } }));
    expect(green.outputs).toMatchObject({ walk: 'false', worlds: 'false' });
    expect(green.outputs.report.split('\n')[0]).toContain('rests on run #7 (branch run/work), basis (b)');
    const red = planOnDev(answers({ ...less, [`head_sha=${B}`]: { workflow_runs: [runOf(3, B, { head_branch: 'dev', conclusion: 'failure' })] } }));
    expect(red.outputs).toMatchObject({ walk: 'true', worlds: 'true' });
    expect(red.out).toContain('is not green on dev (#3: failure)');
    // the jobs of the run cannot be listed: everything is played
    const blind = planOnDev(answers({ [`head_sha=${A}`]: { workflow_runs: [runOf(7, A)] } }));
    expect(blind.outputs).toMatchObject({ walk: 'true', worlds: 'true' });
    expect(blind.out).toContain('GitHub did not list its jobs');
  }, 60000);

  it('no test of this file reaches the real gh: the planner is always handed the stand-in', () => {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(src).toContain('const clean = { ...process.env, CI_GH: fakeGh };');
    expect(src.match(/spawnSync\(process\.execPath, \[script/g)).toHaveLength(1);     // the one place the planner is started from
    expect(readFileSync(script, 'utf8')).toContain("execFileSync(env.CI_GH || 'gh', ['api',");
  });

  it('plan: a push to another branch never asks GitHub about runs', () => {
    const r = cli(['plan'], { CI_EVENT: 'workflow_dispatch', CI_REF: 'refs/heads/dev', GITHUB_REPOSITORY: 'nobody-at-all-0/no-such-repository-0', CI_SHA: A });
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain('a push to dev:');
    expect(r.out).toContain('[ci] outputs: walk=true worlds=true');
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
    // a push to dev asks GitHub whether this commit was already played (tools/ci-pieces.mjs `rests`): the commit, the
    // head dev had before, the token - and the permission to read the runs
    expect(plan).toContain('CI_SHA: ${{ github.sha }}');
    expect(plan).toContain('CI_BEFORE: ${{ github.event.before }}');
    expect(plan).toContain('GH_TOKEN: ${{ github.token }}');
    expect(ci.text).toMatch(/\npermissions:\n {2}contents: read\n {2}actions: read\n/);
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
    expect(walk).toContain('name: results-${{ matrix.size }}-${{ matrix.group }}-a${{ github.run_attempt }}\n');
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
    // trial branches are played by try.yml alone: a run of ci.yml on one would leave a status "check" on its commit
    expect(ci.text).toContain("on:\n  push:\n    branches-ignore: [main, 'try/**']\n  pull_request:\n  workflow_dispatch:\n");
    expect(yamlList(/^ {8}options: (\[.*\])$/m.exec(ci.text)[1])).toEqual(['none', ...SIZES]);
    expect(ci.text).toContain('permissions:\n  contents: read\n  actions: read\n');
    expect(ci.text).toContain('concurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true\n');
  });
});

describe('.github/workflows/pages.yml: before a publication everything is played, whatever changed (R26)', () => {
  const pages = workflow('pages.yml');

  it('has no plan: the jobs are build, walk, worlds, check and deploy, and nothing asks tools/ci-pieces.mjs', () => {
    expect(Object.keys(pages.jobs)).toEqual(['build', 'walk', 'worlds', 'session', 'check', 'deploy']);
    expect(pages.text).not.toContain('needs.plan');
    expect([...pages.text.matchAll(/ci-pieces\.mjs (\w[\w-]*)/g)].map((m) => m[1])).toEqual(['results']);   // lays out the last attempts; never plans
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
    // the same twenty-four jobs the plan of ci.yml gives for everything
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
    expect(key(check, 'needs')).toBe('[build, walk, worlds, session]');
    expect(key(check, 'if')).toBe('${{ !cancelled() }}');
    expect(check).toContain('test "${{ needs.build.result }}" = success && test "${{ needs.walk.result }}" = success && test "${{ needs.worlds.result }}" = success && test "${{ needs.session.result }}" = success\n');
    expect(check).toContain(`        run: node tools/e2e.mjs --combine e2e-results --only ${PIECES.join(',')}\n`);
    expect(check).not.toContain('|| true');
    const verdictStep = check.slice(check.indexOf('- name: Every job passed'), check.indexOf('- uses: actions/checkout@v4'));
    expect(verdictStep).not.toMatch(/^\s+if:/m);
    expect(verdictStep).not.toContain('continue-on-error');
    const combine = check.slice(check.indexOf('- name: Checks over all sizes'));
    expect(combine).toContain('        if: ${{ !cancelled() }}\n');
    expect(combine).not.toContain('continue-on-error');
  });

  it('a piece of the gate and of the publication has the limits of a trial of a piece (TRY_LIMITS.piece, 2026-11-20)', () => {
    for (const walk of [workflow('ci.yml').jobs.walk, pages.jobs.walk]) {
      expect(key(walk, 'timeout-minutes')).toBe(String(TRY_LIMITS.piece.minutes));
      expect(walk).toContain(`          E2E_RUN_TIMEOUT_MS: '${TRY_LIMITS.piece.runMs}'\n`);
    }
    // a quarter over the slowest piece seen; the job is longer than its walkthrough by the install and the build
    expect(TRY_LIMITS.piece.minutes * 60000).toBeGreaterThan(TRY_LIMITS.piece.runMs);
    expect(TRY_LIMITS.all.minutes * 60000).toBeGreaterThan(TRY_LIMITS.all.runMs);
  });

  it('session: the whole walkthrough of the phone in one session, with the limits of a trial of it, and "check" waits for it', () => {
    const session = pages.jobs.session;
    expect(key(session, 'needs')).toBe('build');
    expect(hasKey(session, 'if')).toBe(false);
    expect(session).not.toContain('continue-on-error');
    // one command, no piece: the whole walkthrough of the size, as a trial "all" plays it
    expect(session).toContain('npm run e2e -- --skip-build --mode mobile 2>&1 | tee e2e.log\n');
    expect(session).not.toContain('--only');
    expect(session).toContain("          E2E_GL: swiftshader\n          Q: '0'\n");
    expect(session).toContain("          E2E_WORLDS: '0'\n");
    expect(session).toContain('set -o pipefail');
    // the limits are those of tools/ci-pieces.mjs: one number, held here so
    expect(key(session, 'timeout-minutes')).toBe(String(TRY_LIMITS.all.minutes));
    expect(session).toContain(`          E2E_RUN_TIMEOUT_MS: '${TRY_LIMITS.all.runMs}'\n`);
    // it leaves no results for --combine: the twenty-four pieces are what it combines
    expect(session).not.toContain('name: results-');
  });

  it('deploy: only after "check"', () => {
    expect(key(pages.jobs.deploy, 'needs')).toBe('check');
    expect(hasKey(pages.jobs.deploy, 'if')).toBe(false);
  });

  it('the steps of the job "worlds" are the same in both workflows', () => {
    const steps = (job) => job.slice(job.indexOf('    steps:'));
    expect(steps(pages.jobs.worlds)).toBe(steps(workflow('ci.yml').jobs.worlds));
  });

  it.each(['ci.yml', 'pages.yml'])('%s: the job "worlds" is a job for each part of tools/worlds.mjs (before a publication: but the grey build\'s, hub-grey and sweet-grey), none left out, and one failed part does not stop the others', (name) => {
    const worlds = workflow(name).jobs.worlds;
    // before a publication all but the grey build's parts (tools/worlds.mjs PUBLISH_PARTS)
    expect(yamlList(/^ {8}part: (\[.*\])$/m.exec(worlds)[1])).toEqual(name === 'pages.yml' ? PUBLISH_PARTS : PARTS);
    expect(worlds).toContain('    strategy:\n      fail-fast: false\n      matrix:\n        part: [');
    expect(key(worlds, 'name')).toBe('worlds (probe world, ${{ matrix.part }})');
    // a failed part keeps its own pictures: two parts must not upload under one name
    expect(worlds).toContain('          name: worlds-failure-${{ matrix.part }}-a${{ github.run_attempt }}\n');
    expect(worlds.match(/tools\/worlds\.mjs/g)).toHaveLength(1);
  });

  it.each(['ci.yml', 'pages.yml'])('%s: the job "worlds" holds the longest walkthrough of a whole world with its setup (npm ci, the build of the run: 4 minutes kept for them)', (name) => {
    const minutes = Number(key(workflow(name).jobs.worlds, 'timeout-minutes'));
    expect(minutes * 60000).toBeGreaterThanOrEqual(Math.max(FOREST_PASS_MS, SEA_PASS_MS, SWEET_PASS_MS, SKY_PASS_MS) + 4 * 60000);
  });
});

// ---- a push to dev does not play its commit a second time ----
const run = (id, o = {}) => ({ id, event: 'push', status: 'completed', conclusion: 'success', head_branch: 'run/work', head_sha: A, ...o });
const allPlayed = () => [{ name: 'plan', conclusion: 'success' }, { name: 'unit tests and build', conclusion: 'success' }, ...PLAYING_JOBS.map((name) => ({ name, conclusion: 'success' })), { name: 'check', conclusion: 'success' }];
/** The jobs of a run that played by a reduced plan: `played` of the playing jobs succeeded, the rest are not there (a skipped matrix job is one "skipped" entry). */
const byPlan = (played = []) => [{ name: 'plan', conclusion: 'success' }, { name: 'unit tests and build', conclusion: 'success' }, ...played.map((name) => ({ name, conclusion: 'success' })), { name: 'walk', conclusion: 'skipped' }, { name: 'check', conclusion: 'success' }];
const devRun = (id, o = {}) => ({ id, event: 'push', status: 'completed', conclusion: 'success', head_branch: 'dev', head_sha: B, ...o });
function ask({ runs = [], jobs = {}, before = [] } = {}) {
  const asked = { jobs: [], before: 0 };
  return {
    asked,
    api: {
      runs,
      jobsOf: (id) => { asked.jobs.push(id); const j = jobs[id]; if (j instanceof Error) throw j; return j; },
      beforeRuns: () => { asked.before++; if (before instanceof Error) throw before; return before; },
    },
  };
}
const THIS = { sha: A, runId: 100, before: B };

describe('tools/ci-pieces.mjs rests: may a push to dev rest on a run of its commit', () => {
  it('the jobs that play the game are the twenty-four walkthroughs and every part of the probe world, under the names ci.yml gives them', () => {
    expect(PLAYING_JOBS).toHaveLength(SIZES.length * PIECES.length + PARTS.length);
    expect(PLAYING_JOBS).toContain('walkthrough mobile world1');
    expect(PLAYING_JOBS).toContain('worlds (probe world, travel)');
    const ci = workflow('ci.yml');
    expect(key(ci.jobs.walk, 'name')).toBe(walkJobName('${{ matrix.size }}', '${{ matrix.group }}'));
    expect(key(ci.jobs.worlds, 'name')).toBe(worldsJobName('${{ matrix.part }}'));
  });

  it('(a) a completed, successful run by a push on this commit that played everything: rests on it, and the head before is not even asked', () => {
    const { api, asked } = ask({ runs: [run(100), run(7)], jobs: { 7: allPlayed() } });
    const r = rests(THIS, api);
    expect(r).toMatchObject({ ok: true, basis: 'a' });
    expect(r.run.id).toBe(7);
    expect(r.why).toContain('run #7 (branch run/work)');
    expect(asked).toEqual({ jobs: [7], before: 0 });
  });

  it('this run itself is never rested on, nor a run of another commit', () => {
    expect(rests(THIS, ask({ runs: [run(100)], jobs: { 100: allPlayed() } }).api)).toMatchObject({ ok: false, basis: null, run: null });
    expect(rests({ ...THIS, runId: '100' }, ask({ runs: [run(100)], jobs: { 100: allPlayed() } }).api).ok).toBe(false);
    expect(rests(THIS, ask({ runs: [run(7, { head_sha: B })], jobs: { 7: allPlayed() } }).api).ok).toBe(false);
    expect(rests(THIS, ask({ runs: [] }).api).why).toBe(`no other run of ci.yml on ${A.slice(0, 7)}: everything is played`);
  });

  it.each([
    ['red', { conclusion: 'failure' }], ['cancelled', { conclusion: 'cancelled' }], ['still running', { status: 'in_progress', conclusion: null }],
    ['queued', { status: 'queued', conclusion: null }], ['played again right now, its old green still listed', { status: 'in_progress', conclusion: 'success' }], ['started by hand', { event: 'workflow_dispatch' }], ['of a pull request', { event: 'pull_request' }],
    ['a trial', { head_branch: 'try/mobile/world1/x5/net/aaaaaaa' }], ['with no branch', { head_branch: null }],
  ])('a run that is %s is not rested on, though it played everything - and its jobs are not asked for', (_name, o) => {
    const { api, asked } = ask({ runs: [run(7, o)], jobs: { 7: allPlayed() } });
    const r = rests(THIS, api);
    expect(r).toMatchObject({ ok: false, basis: null, run: null });
    expect(r.why).toContain('no completed, successful run by a push');
    expect(r.why).toContain('#7');
    expect(r.why).toMatch(/: everything is played$/);
    expect(asked.jobs).toEqual([]);
  });

  it('(a) needs every playing job once and green: one skipped, missing, red or doubled is not "everything"', () => {
    const drop = (name) => allPlayed().filter((j) => j.name !== name);
    const set = (name, conclusion) => allPlayed().map((j) => (j.name === name ? { ...j, conclusion } : j));
    for (const jobs of [drop('walkthrough desktop shop'), set('worlds (probe world, cache)', 'skipped'), [...allPlayed(), { name: 'walkthrough mobile world1', conclusion: 'success' }]]) {
      const r = rests(THIS, ask({ runs: [run(7)], jobs: { 7: jobs }, before: [devRun(3, { conclusion: 'failure' })] }).api);
      expect(r.ok, JSON.stringify(jobs.slice(-2))).toBe(false);
      expect(r.why).toContain('played less, by its plan');
    }
    // a job that is red in a run GitHub calls successful: never
    const red = rests(THIS, ask({ runs: [run(7)], jobs: { 7: set('walkthrough mobile shop', 'failure') }, before: [devRun(3)] }).api);
    expect(red.ok).toBe(false);
    expect(red.why).toContain('its job "walkthrough mobile shop" ended as failure');
  });

  it('(b) a run that played less, by its plan, on top of a head of dev that is green on dev: rests on it', () => {
    const { api, asked } = ask({ runs: [run(7)], jobs: { 7: byPlan() }, before: [devRun(3)] });
    const r = rests(THIS, api);
    expect(r).toMatchObject({ ok: true, basis: 'b' });
    expect(r.run.id).toBe(7);
    expect(r.why).toContain('played less, by its plan');
    expect(r.why).toContain(`the head before, ${B.slice(0, 7)}, is green on dev (run #3)`);
    expect(asked).toEqual({ jobs: [7], before: 1 });
    // the probe world alone was played there: still "less"
    expect(rests(THIS, ask({ runs: [run(7)], jobs: { 7: byPlan(PARTS.map(worldsJobName)) }, before: [devRun(3)] }).api)).toMatchObject({ ok: true, basis: 'b' });
  });

  it.each([
    ['is red on dev', [devRun(3, { conclusion: 'failure' })], 'is not green on dev (#3: failure)'],
    ['has no run on dev', [], 'has no run of ci.yml on dev'],
    ['is green only on its branch, not on dev', [devRun(3, { head_branch: 'run/earlier' })], 'has no run of ci.yml on dev'],
    ['is green on dev only by a run started by hand', [devRun(3, { event: 'workflow_dispatch' })], 'has no run of ci.yml on dev'],
    ['is still played on dev', [devRun(3, { status: 'in_progress', conclusion: null })], 'is not green on dev (#3: in_progress)'],
    ['has a green run of another commit listed', [devRun(3, { head_sha: A })], 'has no run of ci.yml on dev'],
  ])('(b) a run that played less is not rested on when the head before %s', (_name, before, why) => {
    const r = rests(THIS, ask({ runs: [run(7)], jobs: { 7: byPlan() }, before }).api);
    expect(r).toMatchObject({ ok: false, basis: null, run: null });
    expect(r.why).toContain(why);
    expect(r.why).toMatch(/: everything is played$/);
  });

  it('(b) the run of the head before was cancelled by the next push: everything is played, and the line says that nothing is wrong with the commit', () => {
    const r = rests(THIS, ask({ runs: [run(7)], jobs: { 7: byPlan() }, before: [devRun(3, { conclusion: 'cancelled' })] }).api);
    expect(r.ok).toBe(false);
    expect(r.why).toContain(`the run of the head before, ${B.slice(0, 7)}, on dev was cancelled (a newer push replaced it before it ended)`);
    expect(r.why).toContain('its green is just not known');
    // cancelled once, green on another attempt: green
    expect(rests(THIS, ask({ runs: [run(7)], jobs: { 7: byPlan() }, before: [devRun(3, { conclusion: 'cancelled' }), devRun(4)] }).api)).toMatchObject({ ok: true, basis: 'b' });
    // cancelled and red: red is what is said
    expect(rests(THIS, ask({ runs: [run(7)], jobs: { 7: byPlan() }, before: [devRun(3, { conclusion: 'cancelled' }), devRun(4, { conclusion: 'failure' })] }).api).why).toContain('is not green on dev');
  });

  it('(b) the head before is not known - the first push of the branch, no commit at all - or GitHub does not answer: everything is played', () => {
    for (const before of ['0'.repeat(40), '', undefined, 'not-a-commit']) {
      const { api, asked } = ask({ runs: [run(7)], jobs: { 7: byPlan() }, before: [devRun(3)] });
      const r = rests({ ...THIS, before }, api);
      expect(r.ok, String(before)).toBe(false);
      expect(r.why).toContain('the head dev had before this push is not known');
      expect(asked.before).toBe(0);
    }
    const down = rests(THIS, ask({ runs: [run(7)], jobs: { 7: byPlan() }, before: new Error('HTTP 502\ngh: Bad Gateway') }).api);
    expect(down.ok).toBe(false);
    expect(down.why).toContain('GitHub did not list the runs of the head before (gh: Bad Gateway)');
    expect(rests(THIS, ask({ runs: [run(7)], jobs: { 7: byPlan() }, before: null }).api).ok).toBe(false);
  });

  it('several commits pushed to dev at once: the head before is the one dev had, whatever lies between', () => {
    // nothing here reads the commits between `before` and the head: the plan of the branch counted its files from dev,
    // and dev was `before` (or behind it) when that run was planned
    const r = rests({ sha: A, runId: 100, before: B }, ask({ runs: [run(7)], jobs: { 7: byPlan() }, before: [devRun(3)] }).api);
    expect(r).toMatchObject({ ok: true, basis: 'b' });
  });

  it('GitHub does not list the runs or the jobs: everything is played', () => {
    expect(rests(THIS, { runs: null, jobsOf: () => [], beforeRuns: () => [] })).toMatchObject({ ok: false });
    expect(rests(THIS, { runs: undefined, jobsOf: () => [], beforeRuns: () => [] }).why).toContain('GitHub did not list the runs of this commit');
    const r = rests(THIS, ask({ runs: [run(7)], jobs: { 7: new Error('HTTP 403') } }).api);
    expect(r.ok).toBe(false);
    expect(r.why).toContain('run #7 (branch run/work): GitHub did not list its jobs (HTTP 403)');
    expect(rests(THIS, ask({ runs: [run(7)], jobs: {} }).api).ok).toBe(false);
    expect(rests({ ...THIS, sha: '' }, ask({ runs: [run(7)], jobs: { 7: allPlayed() } }).api).why).toContain('the commit of this push is not known');
  });

  it('two runs of the commit: the one that can be rested on is found, the head before is asked once', () => {
    const { api, asked } = ask({ runs: [run(7), run(8), run(9)], jobs: { 7: byPlan(), 8: new Error('gone'), 9: allPlayed() }, before: [devRun(3, { conclusion: 'failure' })] });
    const r = rests(THIS, api);
    expect(r).toMatchObject({ ok: true, basis: 'a' });
    expect(r.run.id).toBe(9);
    const none = ask({ runs: [run(7), run(8)], jobs: { 7: byPlan(), 8: byPlan() }, before: [devRun(3, { conclusion: 'failure' })] });
    expect(rests(THIS, none.api).ok).toBe(false);
    expect(none.asked.before).toBe(1);
    expect(asked.before).toBe(1);
  });

  it('rested: the plan of such a push plays nothing again, and the report names the run and the basis', () => {
    const rest = rests(THIS, ask({ runs: [run(7)], jobs: { 7: allPlayed() } }).api);
    const plan = rested(pick(null), rest);
    expect(plan).toMatchObject({ all: false, play: [], walk: [], worlds: false, rests: { basis: 'a', run: 7 } });
    const out = outputs(plan, { files: null, why: 'a push to dev: the branch the work is merged into is played whole' });
    expect(out).toMatchObject({ walk: 'false', worlds: 'false', jobs: '' });
    expect(out.report.split('\n')[0]).toContain('reason: a push to dev that rests on run #7 (branch run/work), basis (a)');
    expect(out.report).toContain('Not played again here: the walkthroughs and the probe world');
    // "check" then expects both skipped, and passes
    expect(verdict({ plan: 'success', build: 'success', walk: 'skipped', worlds: 'skipped' }, { walk: out.walk, worlds: out.worlds })).toMatchObject({ ok: true, combine: false });
    expect(verdict({ plan: 'success', build: 'success', walk: 'success', worlds: 'skipped' }, { walk: out.walk, worlds: out.worlds }).ok).toBe(false);
  });
});

// ---- a trial on the runner ----
describe('tools/ci-pieces.mjs tryPlan: the name of a trial branch says what to try', () => {
  const C = `1a2b3c4${'d'.repeat(33)}`;
  it('a piece of the walkthrough in a size, N times, with the network or without', () => {
    expect(tryPlan('try/mobile/world2/x5/net/1a2b3c4', C)).toEqual({
      size: 'mobile', piece: 'world2', n: 5, offline: false, probe: false, all: false, runMs: 1350000, minutes: 30, title: 'world2 mobile x5',
      matrix: { include: [{ turn: 1 }, { turn: 2 }, { turn: 3 }, { turn: 4 }, { turn: 5 }] },
    });
    expect(tryPlan('try/desktop/shop/x1/offline/1a2b3c4dddd', C)).toMatchObject({ size: 'desktop', piece: 'shop', n: 1, offline: true, probe: false, title: 'shop desktop x1 offline' });
    for (const size of SIZES) for (const piece of PIECES) expect(tryPlan(`try/${size}/${piece}/x${TRY_MAX}/net/1a2b3c4`, C).error, `${size} ${piece}`).toBeUndefined();
    expect(tryPlan(`try/mobile/shop/x${TRY_MAX}/net/${C}`, C).matrix.include).toHaveLength(TRY_MAX);
    // the piece of the collections (PLAY-25), tried like any other; the list of the pieces in the error names it
    expect(tryPlan('try/mobile/collect/x2/net/1a2b3c4', C)).toMatchObject({ size: 'mobile', piece: 'collect', n: 2, offline: false, probe: false });
    expect(tryPlan('try/mobile/collects/x2/net/1a2b3c4', C).error).toContain('pieces: world1, world2, finale, shop, tasks2, collect');
  });

  it('a part of the probe world: the size is "probe", with the network only', () => {
    for (const part of PARTS) expect(tryPlan(`try/probe/${part}/x3/net/1a2b3c4`, C)).toMatchObject({ size: 'probe', piece: part, n: 3, probe: true, offline: false });
    expect(tryPlan('try/probe/travel/x3/offline/1a2b3c4', C).error).toContain('with "net" only');
    expect(tryPlan('try/probe/world1/x3/net/1a2b3c4', C).error).toContain('unknown part of the probe world "world1"');
    expect(tryPlan('try/mobile/travel/x3/net/1a2b3c4', C).error).toContain('unknown piece "travel"');
  });

  it.each([
    ['run/work', 'is not a trial branch'], ['try', '0 parts after "try"'], ['try/mobile/world1/x5/net', '4 parts after "try"'],
    ['try/mobile/world1/x5/net/1a2b3c4/more', '6 parts after "try"'], ['try/phone/world1/x5/net/1a2b3c4', 'unknown size "phone"'],
    ['try/mobile/world9/x5/net/1a2b3c4', 'unknown piece "world9"'], ['try/mobile/world1/5/net/1a2b3c4', '"5" is not x1..x10'],
    ['try/mobile/world1/x0/net/1a2b3c4', '"x0" is not x1..x10'], ['try/mobile/world1/x11/net/1a2b3c4', '"x11" is not x1..x10'],
    ['try/mobile/world1/x05/net/1a2b3c4', '"x05" is not x1..x10'], ['try/mobile/world1/x5/wifi/1a2b3c4', '"wifi" is neither "net" nor "offline"'],
    ['try/mobile/world1/x5/net/1a2b3c', 'is not the beginning of a commit'], ['try/mobile/world1/x5/net/1A2B3C4', 'is not the beginning of a commit'],
    ['try/mobile/world1/x5/net/7777777', 'names the commit 7777777, but points at 1a2b3c4'],
    ['try/mobile/world1,shop/x5/net/1a2b3c4', 'unknown piece "world1,shop"'], ['try/mobile/world1 ; rm/x5/net/1a2b3c4', 'unknown piece'],
  ])('"%s" cannot be read: an error with the reason and the shape of the name - never a trial of something else', (branch, why) => {
    const t = tryPlan(branch, C);
    expect(t.error).toContain(why);
    expect(t.error).toContain('The name is try/<mobile|desktop|desktop-tall|mobile-portrait|probe>/<piece>/x<1..10>/<net|offline>/<commit, 7 characters or more>');
    expect(t.size).toBeUndefined();
    expect(t.matrix).toBeUndefined();
  });

  it('the commit of the branch must be known; a name with a control character or a command to the runner is printed harmless', () => {
    expect(tryPlan('try/mobile/world1/x5/net/1a2b3c4', '').error).toContain('the commit of the branch is not known');
    expect(tryPlan('try/mobile/world1/x5/net/1a2b3c4', undefined).error).toContain('the commit of the branch is not known');
    expect(tryPlan(undefined, C).error).toContain('is not a trial branch');
    expect(tryPlan('try/::error::x\n/a/b/c/d', C).error).not.toMatch(/::error::|\n/);
  });
});

describe('tools/ci-pieces.mjs tryResult and turnError: k of N and the text of every failure', () => {
  it('every turn green: "N of N green", nothing else', () => {
    expect(tryResult([{ turn: 1, ok: true, error: '' }, { turn: 2, ok: true, error: '' }], 2)).toEqual({ ok: true, green: 2, lines: ['2 of 2 green'] });
  });

  it('a red turn is counted and its text is printed under its number; a turn that left nothing is red', () => {
    const r = tryResult([{ turn: 1, ok: true }, { turn: 3, ok: false, error: 'scenario failed: the magic\n::notice::x' }], 4);
    expect(r).toMatchObject({ ok: false, green: 1 });
    expect(r.lines[0]).toBe('1 of 4 green');
    expect(r.lines).toContain('turn 3: RED');
    expect(r.lines).toContain('  scenario failed: the magic');
    expect(r.lines).toContain('  : :notice: :x');
    expect(r.lines).toContain('turn 2: RED - it left no result (the job did not come to its end)');
    expect(r.lines).toContain('turn 4: RED - it left no result (the job did not come to its end)');
  });

  it('nothing at all was left: 0 of N, red; a result that only looks green is not', () => {
    expect(tryResult([], 3)).toMatchObject({ ok: false, green: 0 });
    expect(tryResult(null, 1).ok).toBe(false);
    expect(tryResult([{ turn: 1, ok: 'true' }, { turn: 2, ok: 1 }, { turn: '3', ok: true }], 3)).toMatchObject({ ok: false, green: 0 });
    // a turn beyond N is not counted
    expect(tryResult([{ turn: 5, ok: true }], 1)).toMatchObject({ ok: false, green: 0 });
  });

  it('turnError: the block ERRORS: of the walkthrough, the lines of the probe world, every FAILED; else the end of the log', () => {
    const walk = ['block magic: 658s', 'ERRORS:', 'scenario failed: the magic: two pictures', 'layout: mobile start: #play is cut', '[e2e] walkthrough mobile world2: FAILED — tools/shot.mjs exited with code 1', '  walkthrough mobile world2  FAILED   284.2s', '[e2e] FAILED'].join('\n');
    expect(turnError(walk).split('\n')).toEqual(['scenario failed: the magic: two pictures', 'layout: mobile start: #play is cut', '[e2e] walkthrough mobile world2: FAILED — tools/shot.mjs exited with code 1', '  walkthrough mobile world2  FAILED   284.2s', '[e2e] FAILED']);
    expect(turnError('[worlds] parts: travel\nworlds: the change of world: the load fails\n[worlds] FAILED: 1 problem(s)\n').split('\n')).toEqual(['worlds: the change of world: the load fails', '[worlds] FAILED: 1 problem(s)']);
    expect(turnError('[failures] no WebGL: message shown\nfailures: blocked texture: console error\nupdate: the page was reloaded\n[e2e] FAILED\n').split('\n')).toEqual(['failures: blocked texture: console error', 'update: the page was reloaded', '[e2e] FAILED']);
    expect(turnError('npm error code ELIFECYCLE\nnpm error errno 137\n')).toBe('npm error code ELIFECYCLE\nnpm error errno 137');
    expect(turnError('')).toBe('');
    expect(turnError(Array.from({ length: 80 }, (_, i) => `worlds: problem ${i}`).join('\n')).split('\n')).toHaveLength(30);
  });
});

describe('tools/ci-pieces.mjs tryPlan: the whole walkthrough of a size as a trial', () => {
  const C = `1a2b3c4${'d'.repeat(33)}`;
  it('"all" is the whole walkthrough of any of the four sizes, with limits of its own', () => {
    expect(tryPlan('try/mobile/all/x1/net/1a2b3c4', C)).toEqual({
      size: 'mobile', piece: 'all', n: 1, offline: false, probe: false, all: true, runMs: 3600000, minutes: 70, title: 'all mobile x1',
      matrix: { include: [{ turn: 1 }] },
    });
    for (const size of SIZES) expect(tryPlan(`try/${size}/all/x${TRY_ALL_MAX}/offline/1a2b3c4`, C)).toMatchObject({ size, all: true, offline: true, n: TRY_ALL_MAX, ...TRY_LIMITS.all });
    expect(TRY_ALL).toBe('all');
    // the limits are the piece's parameter: a piece and a part of the probe world keep the gate's, the whole walk is longer
    expect(TRY_LIMITS.piece).toEqual({ runMs: 1350000, minutes: 30 });
    expect(TRY_LIMITS.all).toEqual({ runMs: 3600000, minutes: 70 });
    expect(TRY_LIMITS.all.runMs).toBeGreaterThan(TRY_LIMITS.piece.runMs);
    expect(TRY_LIMITS.all.minutes * 60000).toBeGreaterThan(TRY_LIMITS.all.runMs);
    for (const part of PARTS) expect(tryPlan(`try/probe/${part}/x1/net/1a2b3c4`, C)).toMatchObject({ all: false, ...TRY_LIMITS.piece });
    expect(PIECES).not.toContain(TRY_ALL);
  });

  it('it is long: no more than a few turns at once; the probe world has no "all"', () => {
    expect(tryPlan(`try/mobile/all/x${TRY_ALL_MAX + 1}/net/1a2b3c4`, C).error).toContain(`the whole walkthrough is played x1..x${TRY_ALL_MAX} at most`);
    expect(tryPlan('try/probe/all/x1/net/1a2b3c4', C).error).toContain('unknown part of the probe world "all"');
    expect(tryPlan('try/mobile/everything/x1/net/1a2b3c4', C).error).toContain(`or all (the whole walkthrough, x1..x${TRY_ALL_MAX})`);
  });

  it('the command hands the limits to the workflow and says what will be played', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-try-all-'));
    try {
      const out = join(dir, 'out');
      const r = spawnSync(process.execPath, [join(root, 'tools/ci-pieces.mjs'), 'try', 'try/desktop/all/x2/offline/1a2b3c4', C], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out } });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain('[ci] trial: all desktop x2 offline (the whole walkthrough in the size desktop, without the network, 2 time(s); a walkthrough within 60 min, a turn within 70 min)');
      const written = readFileSync(out, 'utf8');
      for (const line of ['size=desktop', 'piece=all', 'n=2', 'offline=true', 'probe=false', 'all=true', 'run_ms=3600000', 'minutes=70']) expect(written.split('\n'), line).toContain(line);
      const piece = spawnSync(process.execPath, [join(root, 'tools/ci-pieces.mjs'), 'try', 'try/mobile/shop/x1/net/1a2b3c4', C], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out } });
      expect(piece.stdout).toContain('(the piece "shop" in the size mobile, with the network, 1 time(s); a walkthrough within 22.5 min, a turn within 30 min)');
      expect(readFileSync(out, 'utf8')).toContain('all=false\nrun_ms=1350000\nminutes=30\n');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60000);
});

describe('.github/workflows/nightly.yml: the whole session of the phone once a day on dev', () => {
  const night = workflow('nightly.yml');
  it('runs on a schedule and by hand, plays dev, publishes nothing and leaves no status "check"', () => {
    expect(night.text).toMatch(/\non:\n  schedule:\n    - cron: '[0-9]+ [0-9]+ \* \* \*'\n  workflow_dispatch:\npermissions:\n  contents: read\n/);
    expect(Object.keys(night.jobs)).toEqual(['session', 'rounds']);
    for (const job of Object.values(night.jobs)) expect(job).toContain('      - uses: actions/checkout@v4\n        with:\n          ref: dev\n');
    expect(night.text).not.toMatch(/name: ['"]?check['"]?$/m);
    expect(night.text).not.toContain('pages');
    expect(night.jobs.session).toContain('      - uses: actions/checkout@v4\n        with:\n          ref: dev\n');
  });
  it('plays what the job "session" of pages.yml plays, with the same limit of the walkthrough', () => {
    const play = (job) => job.slice(job.indexOf('      - name: Walkthrough'), job.indexOf('      - name: Upload screenshots and log'))
      .replace(/^ {10}echo "dev at .*\n/m, '');
    expect(play(night.jobs.session)).toBe(play(workflow('pages.yml').jobs.session).replace(/^ {6}- name: Walkthrough\n/, '      - name: Walkthrough\n'));
    expect(night.jobs.session).toContain(`          E2E_RUN_TIMEOUT_MS: '${TRY_LIMITS.all.runMs}'\n`);
    // its own build comes before the walkthrough: the job is longer than the walkthrough by it
    expect(Number(key(night.jobs.session, 'timeout-minutes'))).toBeGreaterThan(TRY_LIMITS.all.minutes);
  });
});

describe('.github/workflows/nightly.yml: twenty rounds of the probe world once a day on dev (TECH-15)', () => {
  const night = workflow('nightly.yml');
  const job = night.jobs.rounds;
  it('builds dev and plays the part "travel" of tools/worlds.mjs as the gate does, but twenty rounds', () => {
    expect(job).toContain('        run: npm run build\n');
    expect(job).toContain('node tools/worlds.mjs dist --only travel 2>&1 | tee worlds.log');
    // the same rendering as the job "worlds" of ci.yml
    expect(job).toContain("          E2E_GL: swiftshader\n          Q: '0'\n");
    expect(workflow('ci.yml').jobs.worlds).toContain("          E2E_GL: swiftshader\n          Q: '0'\n");
    expect(job).toContain("          E2E_ROUNDS: '20'\n");
    expect(workflow('ci.yml').text).not.toContain('E2E_ROUNDS');   // the gate plays the five of the requirement
  });
  it('the limit of the run is under the limit of the job, and the log is kept whatever the end: the numbers of each round are in it', () => {
    const runMs = Number(/E2E_RUN_TIMEOUT_MS: '(\d+)'/.exec(job)[1]);
    expect(runMs).toBeGreaterThan(600000);   // more than the default of tools/worlds.mjs: twenty rounds, not five
    expect(Number(key(job, 'timeout-minutes')) * 60000).toBeGreaterThan(runMs);
    expect(job).toContain('        if: always()\n        uses: actions/upload-artifact@v4\n');
    expect(job).toContain('            worlds.log\n');
  });
});

describe('.github/workflows/try.yml: a trial is not the gate', () => {
  const t = workflow('try.yml');
  it('runs on a push to try/** and on nothing else; ci.yml does not run there', () => {
    expect(t.text).toContain("on:\n  push:\n    branches: ['try/**']\npermissions:\n  contents: read\n");
    expect(t.text).not.toContain('workflow_dispatch');
    expect(t.text).not.toContain('pull_request');
    expect(workflow('ci.yml').text).toContain("branches-ignore: [main, 'try/**']");
  });

  it('has no job named "check" - by its id or by its name: a trial leaves no status "check" on the commit', () => {
    expect(Object.keys(t.jobs)).toEqual(['plan', 'build', 'try', 'try-result']);
    for (const [id, job] of Object.entries(t.jobs)) {
      expect(id).not.toBe('check');
      expect(key(job, 'name'), id).not.toBe(null);
      expect(key(job, 'name')).not.toMatch(/^['"]?check['"]?$/);
    }
    expect(key(t.jobs['try-result'], 'name')).toBe('try-result');
  });

  it('plan reads the name of the branch and its commit with tools/ci-pieces.mjs; a name that cannot be read fails it', () => {
    const plan = t.jobs.plan;
    expect(plan).toContain('TRY_BRANCH: ${{ github.ref_name }}');
    expect(plan).toContain('TRY_COMMIT: ${{ github.sha }}');
    expect(plan).toContain('run: node tools/ci-pieces.mjs try "$TRY_BRANCH" "$TRY_COMMIT"');
    expect(plan).not.toContain('continue-on-error');
    for (const out of ['size', 'piece', 'n', 'offline', 'probe', 'all', 'run_ms', 'minutes', 'title', 'matrix']) expect(plan).toContain(`      ${out}: \${{ steps.read.outputs.${out} }}`);
  });

  it('one build, N turns of it at once, each to its end, played as the gate plays', () => {
    expect(key(t.jobs.build, 'needs')).toBe('plan');
    expect(t.jobs.build).toContain('run: npm run build');
    const turn = t.jobs.try;
    expect(key(turn, 'needs')).toBe('[plan, build]');
    expect(turn).toContain('      fail-fast: false\n      matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}\n');
    expect(turn).toContain("          E2E_GL: swiftshader\n          Q: '0'\n");
    expect(turn).toContain("          E2E_NET: ${{ needs.plan.outputs.offline == 'true' && 'offline' || 'net' }}\n");
    expect(turn).toContain('npm run e2e -- --skip-build --mode "$TRY_SIZE" --only "$TRY_PIECE" 2>&1 | tee try.log');
    // the whole walkthrough of a size: the same command without a piece, chosen by what the name of the branch said
    expect(turn).toContain('          elif [ "$TRY_ALL" = true ]; then\n            npm run e2e -- --skip-build --mode "$TRY_SIZE" 2>&1 | tee try.log\n');
    expect(turn).toContain('          TRY_ALL: ${{ needs.plan.outputs.all }}\n');
    // the limits come from the plan (TRY_LIMITS), not from a number written here
    expect(key(turn, 'timeout-minutes')).toBe('${{ fromJSON(needs.plan.outputs.minutes) }}');
    expect(turn).toContain('          E2E_RUN_TIMEOUT_MS: ${{ needs.plan.outputs.run_ms }}\n');
    expect(turn).not.toMatch(/E2E_RUN_TIMEOUT_MS: '?\d/);
    expect(turn).toContain('node tools/worlds.mjs dist --only "$TRY_PIECE" 2>&1 | tee try.log');
    expect(turn).toContain('set -o pipefail');
    // what was read from the name of the branch reaches the shell as variables, never as text of the script
    expect(/run: \|\n((?: {10}.*\n)+)/.exec(turn)[1]).not.toContain('${{');
    expect(turn).toContain('run: node tools/ci-pieces.mjs try-turn "$TRY_TURN" "$TRY_OUTCOME" try.log');
    expect(turn).toContain('          name: try-turn-${{ matrix.turn }}-a${{ github.run_attempt }}\n          path: turn-${{ matrix.turn }}.json\n');
    expect(turn).not.toContain('continue-on-error');
  });

  it('try-result runs when turns failed too, and is red when the name was not read or the build failed', () => {
    const end = t.jobs['try-result'];
    expect(key(end, 'needs')).toBe('[plan, build, try]');
    expect(key(end, 'if')).toBe('${{ !cancelled() }}');
    expect(end).toContain('if [ "$PLAN_RESULT" != success ]; then');
    expect(end).toContain('if [ "$BUILD_RESULT" != success ]; then');
    expect(end).toContain('node tools/ci-pieces.mjs try-result try-turns "$TRY_N"');
  });

  it('pages.yml knows nothing of trials or of the runs of a commit: before a publication everything is played', () => {
    const pages = workflow('pages.yml');
    expect([...pages.text.matchAll(/ci-pieces\.mjs (\w[\w-]*)/g)].map((m) => m[1])).toEqual(['results']);   // lays out the last attempts; never plans
    expect(pages.text).not.toContain('try/');
    expect(pages.text).not.toContain('actions: read');
  });
});

// ---- a job played again: the results of its last attempt are chosen here, by the number in the name ----
describe('tools/ci-pieces.mjs lastAttempts: a job played again leaves its results again', () => {
  it('the name of what a job leaves carries the attempt, and the last attempt of each is chosen - by its number', () => {
    expect(attemptName(RESULTS, 'desktop-shop', 3)).toBe('results-desktop-shop-a3');
    expect(attemptName(TRY_TURN, 4, 1)).toBe('try-turn-4-a1');
    // the very case of 2026-11-18: the second attempt failed, the third passed - whatever the order they are listed in
    for (const names of [['results-desktop-shop-a2', 'results-desktop-shop-a3'], ['results-desktop-shop-a3', 'results-desktop-shop-a2']]) {
      expect(lastAttempts(names, RESULTS)).toEqual({ chosen: [{ what: 'desktop-shop', attempt: 3, name: 'results-desktop-shop-a3', attempts: [2, 3] }], ignored: [] });
    }
  });

  it('one job played again among jobs played once: each keeps its own last attempt', () => {
    const r = lastAttempts(['results-mobile-world1-a1', 'results-desktop-shop-a1', 'results-desktop-shop-a2', 'results-mobile-portrait-finale-a1'], RESULTS);
    expect(r.chosen.map((c) => c.name)).toEqual(['results-desktop-shop-a2', 'results-mobile-portrait-finale-a1', 'results-mobile-world1-a1']);
    expect(r.chosen.map((c) => c.attempts)).toEqual([[1, 2], [1], [1]]);
  });

  it('the attempts are numbers, not text: the tenth is after the ninth, and the second after the first of ten', () => {
    expect(lastAttempts(['results-mobile-shop-a9', 'results-mobile-shop-a10', 'results-mobile-shop-a2'], RESULTS).chosen[0]).toMatchObject({ attempt: 10, name: 'results-mobile-shop-a10', attempts: [2, 9, 10] });
    expect(lastAttempts(['try-turn-1-a1', 'try-turn-10-a1', 'try-turn-1-a2'], TRY_TURN).chosen.map((c) => c.name)).toEqual(['try-turn-1-a2', 'try-turn-10-a1']);
  });

  it('what is not "<kind>-<what>-a<attempt>" is left out and named: another kind, no attempt, an attempt 0', () => {
    const r = lastAttempts(['dist', 'results-mobile-shop', 'results-mobile-shop-a0', 'results-mobile-shop-a', 'results--a1', 'try-turn-1-a1', 'e2e-failure-mobile-shop-a1', 'results-mobile-shop-a1'], RESULTS);
    expect(r.chosen.map((c) => c.name)).toEqual(['results-mobile-shop-a1']);
    expect(r.ignored).toEqual(['dist', 'results-mobile-shop', 'results-mobile-shop-a0', 'results-mobile-shop-a', 'results--a1', 'try-turn-1-a1', 'e2e-failure-mobile-shop-a1']);
    expect(lastAttempts([], RESULTS)).toEqual({ chosen: [], ignored: [] });
    expect(lastAttempts(null, RESULTS)).toEqual({ chosen: [], ignored: [] });
    // a kind is text, not a pattern
    const dotted = lastAttempts(['resultsX-mobile-a1', 'results.-mobile-a1'], 'results.');
    expect(dotted.chosen.map((c) => c.name)).toEqual(['results.-mobile-a1']);
    expect(dotted.ignored).toEqual(['resultsX-mobile-a1']);
  });
});

describe('node tools/ci-pieces.mjs results and try-result: only the last attempt is read', () => {
  /** A folder of downloaded artifacts: { '<artifact>/<file>': content }. */
  const downloaded = (files) => {
    const dir = tmp();
    for (const [path, content] of Object.entries(files)) { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), typeof content === 'string' ? content : JSON.stringify(content)); }
    return dir;
  };

  it('results: the files of the last attempt of every walkthrough are laid out for --combine, the earlier attempts are not', () => {
    const from = downloaded({
      'results-desktop-shop-a2/summary-desktop-shop.json': { passed: false, attempt: 2 },
      'results-desktop-shop-a3/summary-desktop-shop.json': { passed: true, attempt: 3 },
      'results-desktop-shop-a3/voice-desktop-shop.json': { loud: 8 },
      'results-desktop-shop-a2/models-requested-desktop-shop.json': ['only the failed attempt left this'],
      'results-mobile-world1-a1/summary-mobile-world1.json': { passed: true, attempt: 1 },
      'something-else/summary-desktop-shop.json': { passed: false, attempt: 99 },
    });
    const to = join(tmp(), 'e2e-results');
    const r = cli(['results', from, to]);
    expect(r.code, r.out).toBe(0);
    expect(JSON.parse(readFileSync(join(to, 'summary-desktop-shop.json'), 'utf8'))).toEqual({ passed: true, attempt: 3 });
    expect(JSON.parse(readFileSync(join(to, 'summary-mobile-world1.json'), 'utf8'))).toEqual({ passed: true, attempt: 1 });
    expect(readdirSync(to).sort()).toEqual(['summary-desktop-shop.json', 'summary-mobile-world1.json', 'voice-desktop-shop.json']);
    expect(r.out).toContain('[ci] results of desktop-shop: attempt 3 (the last of 2, 3)');
    expect(r.out).toContain('[ci] results of mobile-world1: attempt 1\n');
    expect(r.out).toContain('left out: something-else');
  }, 30000);

  it('results: nothing was left at all - the folder for --combine is made empty, and the log says so', () => {
    const to = join(tmp(), 'e2e-results');
    const r = cli(['results', join(tmp(), 'not-there'), to]);
    expect(r.code, r.out).toBe(0);
    expect(existsSync(to)).toBe(true);
    expect(readdirSync(to)).toEqual([]);
    expect(r.out).toContain('no results of a walkthrough');
  }, 30000);

  it('try-result: a turn played again counts by its last attempt - red then green is green, green then red is red', () => {
    const from = downloaded({
      'try-turn-1-a1/turn-1.json': { turn: 1, ok: false, error: 'scenario failed: first attempt' },
      'try-turn-1-a2/turn-1.json': { turn: 1, ok: true, error: '' },
      'try-turn-2-a1/turn-2.json': { turn: 2, ok: true, error: '' },
      'try-turn-3-a1/turn-3.json': { turn: 3, ok: true, error: '' },
      'try-turn-3-a2/turn-3.json': { turn: 3, ok: false, error: 'scenario failed: second attempt' },
    });
    const r = cli(['try-result', from, '3']);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('[ci] 2 of 3 green');
    expect(r.out).toContain('turn 3: RED');
    expect(r.out).toContain('scenario failed: second attempt');
    expect(r.out).not.toContain('first attempt');
    expect(r.out).toContain('[ci] turn 1: attempt 2 (the last of 1, 2)');
    // every turn green by its last attempt
    const green = cli(['try-result', downloaded({ 'try-turn-1-a1/turn-1.json': { turn: 1, ok: false, error: 'x' }, 'try-turn-1-a3/turn-1.json': { turn: 1, ok: true, error: '' } }), '1']);
    expect(green.code, green.out).toBe(0);
    expect(green.out).toContain('[ci] 1 of 1 green');
  }, 30000);
});

describe('the workflows: what a job leaves is named by its attempt, and the job that sums up chooses the last', () => {
  it.each(['ci.yml', 'pages.yml'])('%s: "check" downloads every artifact into a folder of its own and lays out the last attempts before --combine', (name) => {
    const w = workflow(name), check = w.jobs.check;
    expect(w.jobs.walk).toContain('          name: results-${{ matrix.size }}-${{ matrix.group }}-a${{ github.run_attempt }}\n');
    expect(check).toContain('          pattern: results-*\n          path: e2e-results-all\n');
    // merged into one folder, the files of two attempts would overwrite each other in an order nobody chose
    expect(check).not.toContain('merge-multiple');
    const choose = check.indexOf('run: node tools/ci-pieces.mjs results e2e-results-all e2e-results\n'), combine = check.indexOf('node tools/e2e.mjs --combine e2e-results ');
    expect(choose).toBeGreaterThan(check.indexOf('pattern: results-*'));
    expect(combine).toBeGreaterThan(choose);
    // every artifact a job may leave twice says which attempt left it
    for (const job of Object.values(w.jobs)) for (const m of job.matchAll(/^ {10}name: ((?:results|e2e-failure|worlds-failure)-.*)$/gm)) expect(m[1]).toMatch(/-a\$\{\{ github\.run_attempt \}\}$/);
  });

  it('try.yml: every turn leaves its result under its attempt, and "try-result" reads a folder an artifact', () => {
    const t = workflow('try.yml');
    expect(t.jobs.try).toContain('          name: try-turn-${{ matrix.turn }}-a${{ github.run_attempt }}\n');
    expect(t.jobs.try).toContain('          name: try-failure-${{ matrix.turn }}-a${{ github.run_attempt }}\n');
    expect(t.jobs['try-result']).toContain('          pattern: try-turn-*\n          path: try-turns\n');
    expect(t.jobs['try-result']).not.toContain('merge-multiple');
  });

  it('the build is the only artifact left under a bare name: every attempt builds the same commit', () => {
    for (const name of ['ci.yml', 'pages.yml', 'try.yml']) {
      const bare = [...workflow(name).text.matchAll(/^ {10}name: (.*)$/gm)].map((m) => m[1]).filter((n) => !n.includes('github.run_attempt'));
      expect([...new Set(bare)], name).toEqual(['dist']);
    }
  });
});

describe('the job "plan" runs without `npm ci`', () => {
  // ci.yml's "plan" runs `node tools/ci-pieces.mjs plan` on a bare checkout: every module it loads, even through
  // others (tools/worlds.mjs -> tools/sweet-grey.mjs -> ...), may import only node's own modules statically. A browser
  // or any package is imported inside the function that needs it (`await import('playwright-core')`).
  it('no module on its chain of static imports imports a package', () => {
    const seen = new Set(), bare = [];
    const walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s+'([^']+)'/gm)) {
        const spec = m[1];
        if (spec.startsWith('.')) walk(resolve(dirname(file), spec));
        else if (!spec.startsWith('node:')) bare.push(`${file.slice(root.length + 1)}: ${spec}`);
      }
    };
    walk(join(root, 'tools', 'ci-pieces.mjs'));
    expect(seen.has(join(root, 'tools', 'worlds.mjs'))).toBe(true);
    expect(bare).toEqual([]);
  });
});
