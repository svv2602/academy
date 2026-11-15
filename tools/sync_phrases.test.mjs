// voice/phrases.json is what `npm run voice:sync` builds from the shared strings and the strings of every world
// (VOICE-04, ARCH-12). CI has no voice:sync step, so the check runs here: the script itself, as a developer runs it.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sync = (...args) => spawnSync(process.execPath, [join(root, 'tools/sync_phrases.mjs'), ...args], { cwd: root, encoding: 'utf8' });

describe('npm run voice:sync -- --check', () => {
  it('finds voice/phrases.json up to date and changes nothing', () => {
    const before = readFileSync(join(root, 'voice/phrases.json'), 'utf8');
    const run = sync('--check');
    expect({ status: run.status, err: run.stderr }).toEqual({ status: 0, err: '' });
    expect(run.stdout).toMatch(/voice\/phrases\.json is up to date \(\d+ lines\)/);
    expect(readFileSync(join(root, 'voice/phrases.json'), 'utf8')).toBe(before);
  });

  it('the file holds the spoken lines of every world folder', async () => {
    const file = JSON.parse(readFileSync(join(root, 'voice/phrases.json'), 'utf8'));
    const ids = readdirSync(join(root, 'src/worlds'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(root, 'src/worlds', d.name, 'strings.ts'))).map((d) => d.name);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const { strings } = await import(`../src/worlds/${id}/strings.ts`);
      const spoken = Object.keys(strings.spoken);
      expect(spoken.length).toBeGreaterThan(0);
      expect({ world: id, notInFile: spoken.filter((k) => !Object.hasOwn(file, k)) }).toEqual({ world: id, notInFile: [] });
    }
  });

  it('refuses an unknown argument', () => {
    const run = sync('--frobnicate');
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/unknown argument: --frobnicate/);
  });
});
