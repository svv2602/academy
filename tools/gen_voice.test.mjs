// Runs in `npm test`. Two things are checked here.
// 1. The decisions tools/gen_voice.py makes before it pays for anything: which lines go to the voice service,
//    and that nothing is sent without a key or with a {placeholder} (the place of the child's name).
// 2. The recorded clips themselves: every line of voice/phrases.json has a clip that was recorded from exactly
//    this text with this intonation and was heard back correctly. A changed line fails here until it is re-recorded.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'gen-voice-'));
afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

/** Runs a few lines of Python with tools/gen_voice.py imported as a module; importing it sends nothing. */
function py(code, env = {}) {
  const prelude = `import sys, json, pathlib\nsys.path.insert(0, ${JSON.stringify(join(root, 'tools'))})\nimport gen_voice as v\n`;
  try {
    return { code: 0, out: execFileSync('python3', ['-I', '-B', '-c', prelude + code], { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout ?? ''), err: String(e.stderr ?? '') };
  }
}

describe('tools/gen_voice.py: what is sent to the paid voice service', () => {
  it('a line is recorded again when its clip is missing, or its text or intonation changed', () => {
    writeFileSync(join(tmp, 'kept.mp3'), 'x');
    const qa = { kept: { text: 'Привіт!', style: 'warm', score: 1 }, lost: { text: 'Привіт!', style: 'warm', score: 1 } };
    const r = py(`
audio, qa = pathlib.Path(${JSON.stringify(tmp)}), json.loads(${JSON.stringify(JSON.stringify(qa))})
print(json.dumps([v.stale('kept', 'Привіт!', 'warm', qa, audio), v.stale('kept', 'Привіт, друже!', 'warm', qa, audio),
                  v.stale('kept', 'Привіт!', 'joy', qa, audio), v.stale('lost', 'Привіт!', 'warm', qa, audio),
                  v.stale('kept', 'Привіт!', 'warm', {}, audio)]))`);
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out)).toEqual([false, true, true, true, true]);
  });

  it('without a key nothing is sent and the script says so', () => {
    const missing = py(`v.gemini_key(pathlib.Path(${JSON.stringify(join(tmp, 'no-such.env'))}))`);
    expect(missing.code).not.toBe(0);
    expect(missing.err).toContain('nothing was sent');
    writeFileSync(join(tmp, 'empty.env'), 'GEMINI_API_KEY=\n');
    expect(py(`v.gemini_key(pathlib.Path(${JSON.stringify(join(tmp, 'empty.env'))}))`).code).not.toBe(0);
    writeFileSync(join(tmp, 'key.env'), '# comment\nexport GEMINI_API_KEY="abc"\n');
    expect(py(`print(v.gemini_key(pathlib.Path(${JSON.stringify(join(tmp, 'key.env'))})))`).out.trim()).toBe('abc');
  });

  it('a line with a {placeholder} stops the run before anything is sent', () => {
    const bad = py(`v.check_no_placeholders({'intro': ['Привіт{, name}!', 'joy']})`);
    expect(bad.code).not.toBe(0);
    expect(bad.err).toContain('nothing was sent');
    expect(py(`v.check_no_placeholders({'intro': ['Привіт!', 'joy']})`).code).toBe(0);
  });

  it('the key is not taken from the repository or from another project', () => {
    const r = py('print(v.KEY_FILE)', { ACADEMY_GEMINI_ENV: '' });
    expect(r.out.trim().endsWith(join('.config', 'academy', 'gemini.env')), r.out).toBe(true);
    expect(py('print(v.KEY_FILE)', { ACADEMY_GEMINI_ENV: join(tmp, 'key.env') }).out.trim()).toBe(join(tmp, 'key.env'));
  });
});

describe('recorded clips', () => {
  const phrases = JSON.parse(readFileSync(join(root, 'voice/phrases.json'), 'utf8'));
  const qa = JSON.parse(readFileSync(join(root, 'voice/qa.json'), 'utf8'));
  const clips = JSON.parse(readFileSync(join(root, 'src/core/clips.json'), 'utf8'));
  const HOW = 'Record it: python3 tools/gen_voice.py (paid service, the key is in ~/.config/academy/gemini.env).';

  it('every line of voice/phrases.json has a clip recorded from exactly its text and intonation', () => {
    const wrong = Object.entries(phrases).filter(([key, [text, style]]) =>
      !existsSync(join(root, 'public/voice', `${key}.mp3`)) || !clips.includes(key) || qa[key]?.text !== text || qa[key]?.style !== style)
      .map(([key]) => key);
    expect(wrong, `lines without an up-to-date clip: ${wrong.join(' ')}. ${HOW}`).toEqual([]);
  });

  it('every clip was heard back as its text (voice/qa.json has no score below 0.85)', () => {
    const low = Object.keys(phrases).filter((key) => !(qa[key]?.score >= 0.85)).map((key) => `${key} ${qa[key]?.score}`);
    expect(low, `clips that do not sound like their text: ${low.join(', ')}. ${HOW}`).toEqual([]);
  });

  it('src/core/clips.json lists exactly the files of public/voice', () => {
    const files = readdirSync(join(root, 'public/voice')).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort();
    expect(clips, 'clips.json and the .mp3 files of public/voice differ (python3 tools/gen_voice.py rewrites the list)').toEqual(files);
    expect(readdirSync(join(root, 'public/voice')).filter((f) => !f.endsWith('.mp3') || f.endsWith('.tmp.mp3')), 'stray files in public/voice').toEqual([]);
  });
});
