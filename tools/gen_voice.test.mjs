// Runs in `npm test`. Two things are checked here.
// 1. The decisions tools/gen_voice.py makes before it pays for anything: which lines go to the voice service,
//    and that nothing is sent without a key or with a {placeholder} (the place of the child's name).
// 2. The recorded clips themselves: every line of voice/phrases.json has a clip that was recorded from exactly
//    this text with this intonation and was heard back correctly. A changed line fails here until it is re-recorded.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { sourceWorlds } from './dist-size.mjs';

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

// Each test starts python3 once or more: on a loaded machine the default 5 s is not enough.
describe('tools/gen_voice.py: the service\'s rate limits (VOICE-14)', { timeout: 60_000 }, () => {
  it('waits as long as a 429 asks, and a spent daily quota stops the run instead of being asked again', () => {
    const r = py(`
out = [v.retry_delay(429, {}, '{"error": {"details": [{"retryDelay": "41s"}]}}'),
       v.retry_delay(503, {'Retry-After': '12'}, 'busy'),
       v.retry_delay(500, {}, 'oops')]
try:
    v.retry_delay(429, {}, '{"quotaId": "GenerateRequestsPerDayPerProjectPerModel"}')
    out.append('no stop')
except v.QuotaStop:
    out.append('stop')
print(json.dumps(out))`);
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out)).toEqual([41, 12, null, 'stop']);
  });

  it('a daily quota ends the whole run: no further line is sent', () => {
    const r = py(`
calls = []
def post(url, body, key):
    calls.append(1)
    import urllib.error, io
    raise urllib.error.HTTPError(url, 429, 'quota', {}, io.BytesIO(b'{"quotaId": "GenerateRequestsPerDayPerProjectPerModel"}'))
v.post, v.PACE = post, 0
try:
    v.synth('Привіт!', 'warm', 'Puck', v.MODELS['old'] if hasattr(v, 'MODELS') else 'm', 'k')
    print('no stop')
except v.QuotaStop:
    print(len(calls))`);
    expect(r.code, r.err).toBe(0);
    expect(r.out.trim()).toBe('1');
  });
});

describe('tools/gen_voice.py: what is sent to the paid voice service', { timeout: 60_000 }, () => {
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

  it('a clip of the bank of the old game (public/bank/) is found there and not recorded again', () => {
    const bank = join(tmp, 'bank');
    mkdirSync(bank, { recursive: true });
    writeFileSync(join(bank, 'q_add_1_2.mp3'), 'x');
    const qa = { q_add_1_2: { text: 'Скільки буде один плюс два?', style: 'warm', score: 1, from: 'old game' } };
    const r = py(`
audio, bank, qa = pathlib.Path(${JSON.stringify(join(tmp, 'voice-none'))}), pathlib.Path(${JSON.stringify(bank)}), json.loads(${JSON.stringify(JSON.stringify(qa))})
print(json.dumps([v.stale('q_add_1_2', 'Скільки буде один плюс два?', 'warm', qa, audio, bank),
                  v.stale('q_add_1_2', 'Скільки буде один плюс два?', 'warm', qa, audio),
                  v.stale('q_add_1_2', 'Скільки буде два плюс два?', 'warm', qa, audio, bank)]))`);
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out)).toEqual([false, true, true]);
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

describe('tools/gen_voice.py: the voice and the model of a request (VOICE-10, R33)', { timeout: 60_000 }, () => {
  /** Builds the request of one line; a stand-in replaces the network, so nothing is ever sent. */
  const request = (cid, text, style, model) => {
    const r = py(`
sent = []
v.post = lambda url, b, key: (sent.append((url, b)), {'candidates': [{'content': {'parts': [{'inlineData': {'data': ''}}]}}]})[1]
v.synth(${JSON.stringify(text)}, ${JSON.stringify(style)}, v.voice_of(${JSON.stringify(cid)}), v.MODELS[${JSON.stringify(model)}], 'k')
print(json.dumps({'url': sent[0][0], 'body': sent[0][1], 'styles': v.STYLES}))`);
    expect(r.code, r.err).toBe(0);
    return JSON.parse(r.out);
  };
  const LINE = 'Привіт! Я лисичка.';

  it('the old model, the default: the style prompt goes in front of the text, as every clip so far was recorded', () => {
    const { url, body, styles } = request('fox_hi', LINE, 'warm', 'old');
    expect(url).toContain('/models/gemini-2.5-flash-preview-tts:generateContent');
    expect(body.contents[0].parts[0].text).toBe(`${styles.warm}\n\n${LINE}`);
    expect(body.generationConfig.speechConfig).toEqual({ voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } });
    const calm = request('t_simon_watch', LINE, 'calm', 'old').body.contents[0].parts[0].text;
    expect(calm).toBe(`Say calmly and clearly, in the voice of a kind cartoon cat, in Ukrainian: ${LINE}`);
  });

  it('the new model: the text of the request is only the line, the style goes in a field of its own', () => {
    for (const style of ['warm', 'joy', 'calm']) {
      const { url, body } = request('fox_hi@Leda', LINE, style, 'new');
      expect(url).toContain('/models/gemini-3.8-flash-tts:generateContent');
      expect(body.contents[0].parts[0].text, style).toBe(LINE);
      expect(body.generationConfig.speechConfig.style, style).toMatch(/українською/);
      expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Leda');
    }
  });

  it('a line is recorded in the voice its key names, a character with its own style, not the cat\'s', () => {
    for (const [cid, voice] of [['npc_next@Charon', 'Charon'], ['npc_next@Sulafat', 'Sulafat'], ['npc_next@Orus', 'Orus'], ['npc_next', 'Puck']]) {
      const { body } = request(cid, LINE, 'joy', 'old');
      expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, cid).toBe(voice);
      expect(body.contents[0].parts[0].text.includes('котик'), cid).toBe(voice === 'Puck');
    }
    const sixth = py("v.voice_of('npc_next@Kore')");
    expect(sixth.code).not.toBe(0);
    expect(sixth.err).toContain('nothing was sent');
  });

  it('a clip is fresh for the model and the voice that recorded it; the other model keeps it, never records it again', () => {
    writeFileSync(join(tmp, 'm.mp3'), 'x');
    writeFileSync(join(tmp, 'm@Leda.mp3'), 'x');
    const old = 'gemini-2.5-flash-preview-tts', nu = 'gemini-3.8-flash-tts';
    const qa = { m: { text: 'Так!', style: 'joy', score: 1, model: old, voice: 'Puck' },
      'm@Leda': { text: 'Так!', style: 'joy', score: 1, model: old, voice: 'Puck' } };
    const r = py(`
audio, qa = pathlib.Path(${JSON.stringify(tmp)}), json.loads(${JSON.stringify(JSON.stringify(qa))})
print(json.dumps([v.stale('m', 'Так!', 'joy', qa, audio, model='${old}'), v.stale('m', 'Так!', 'joy', qa, audio, model='${nu}'),
                  v.stale('m@Leda', 'Так!', 'joy', qa, audio, model='${old}'), v.stale('m', 'Так!', 'joy', qa, audio)]))`);
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out)).toEqual([false, true, true, false]);
    // The cat's clips, all of the old model: --model new sends none of them, it only says they are kept.
    const run = execFileSync('python3', ['-I', '-B', join(root, 'tools/gen_voice.py'), '--dry-run', '--model=new'],
      { encoding: 'utf8', env: { ...process.env, ACADEMY_GEMINI_ENV: join(tmp, 'no-such.env') } });
    const listed = run.split('\n')[0].split(': ').slice(1).join(': ').split(' ');
    expect(listed.filter((k) => k && !k.includes('@'))).toEqual([]);
    expect(run).toMatch(/recorded clips are of another model or voice and are kept/);
  });

  it('a clip that does not sound like its text is tried once more with the prompt that says where the words begin', () => {
    const r = py(`
calls = []
class R(v.Recorder):
    def job(self, cid, text, style, strict=False):
        calls.append(strict)
        return {'text': text, 'heard': '', 'score': 0.3 if not strict else 0.9}
rec = R(pathlib.Path(${JSON.stringify(join(tmp, 'voice-none'))}), 'k', v.MODELS['old'], None)
res = rec.record('npc_next@Leda', 'Тепер повтори!', 'warm', {})
print(json.dumps({'calls': calls, 'res': res, 'strict': v.style_prompt('Leda', 'warm', True)}))`);
    expect(r.code, r.err).toBe(0);
    const out = JSON.parse(r.out);
    expect(out.calls).toEqual([false, true]);
    expect(out.res).toMatchObject({ score: 0.9, style: 'warm', voice: 'Leda', model: 'gemini-2.5-flash-preview-tts' });
    expect(out.strict.endsWith('Скажи лише ці слова:')).toBe(true);
  });

  it('--dry-run counts the lines by voice and model and sends nothing, without a key', () => {
    const r = execFileSync('python3', ['-I', '-B', join(root, 'tools/gen_voice.py'), '--dry-run', '--model=new'],
      { encoding: 'utf8', env: { ...process.env, ACADEMY_GEMINI_ENV: join(tmp, 'no-such.env') } });
    expect(r).toMatch(/^\d+ of \d+ lines to record, model gemini-3\.8-flash-tts/m);
    // the clips made by the other model are kept, never sent again; the count by voice is printed even when it is none
    expect(r).toMatch(/^\d+ recorded clips are of another model or voice and are kept \(not recorded again\)$/m);
    expect(r).toMatch(/^by voice \(model gemini-3\.8-flash-tts\): (none|(Puck|Charon|Sulafat|Leda|Orus) \d+(, (Puck|Charon|Sulafat|Leda|Orus) \d+)*)$/m);
  });
});

// TECH-09, R64-R80: the clips of a next world lie in the folder of their world, apart from the voice of the core, and
// are counted by the pair (world, key). Everything here runs on a made-up tree in a temporary folder, with a stand-in
// in place of the voice service and of the transcription: nothing is sent, nothing is paid for.
describe('tools/gen_voice.py: the voice of a next world (TECH-09)', { timeout: 60_000 }, () => {
  // A line of the core, two lines of the published world "lake" (one also in a character's voice), a line of the test
  // world "trial" (it has a folder worlds-test/trial/).
  const PHRASES = {
    hello: ['Привіт!', 'joy', 'cat'],
    lake_hi: ['Ось і озеро!', 'joy', 'cat', 'lake'],
    heron_hi: ['Я чапля.', 'warm', 'cat', 'lake'],
    'heron_hi@Leda': ['Я чапля.', 'warm', 'heron', 'lake'],
    trial_hi: ['Це проба.', 'warm', 'cat', 'trial'],
  };
  const NAMES = ['hello', 'lake/lake_hi', 'lake/heron_hi', 'lake/heron_hi@Leda', 'trial/trial_hi'];
  let n = 0;
  /** A made-up repository: the list of lines, the folders of the two worlds, an empty public/voice. */
  function tree(phrases = PHRASES) {
    const dir = join(tmp, `tree-${++n}`);
    for (const d of ['voice', 'public/voice', 'src/core', 'src/worlds/lake', 'src/worlds/trial', 'worlds-test/trial']) mkdirSync(join(dir, d), { recursive: true });
    writeFileSync(join(dir, 'voice/phrases.json'), JSON.stringify(phrases));
    writeFileSync(join(dir, 'key.env'), 'GEMINI_API_KEY=stand-in\n');
    return dir;
  }
  /**
   * Runs main() of tools/gen_voice.py on the tree `dir`. The voice service is a stand-in that answers with the text it
   * was sent, the "clip" is that text, and the transcription - a stand-in module - reads it back: no request leaves.
   */
  function run(dir, ...argv) { return runDeaf([], dir, ...argv); }
  /** The same, with a transcription that hears something else in the clips whose text has one of the words `deaf`. */
  function runDeaf(deaf, dir, ...argv) {
    const r = py(`
import base64, types
v.ROOT = pathlib.Path(${JSON.stringify(dir)})
v.KEY_FILE = v.ROOT / 'key.env'
v.PACE = 0
sent = []
def post(url, body, key):
    sent.append(body['contents'][0]['parts'][0]['text'].split('\\n')[-1])
    return {'candidates': [{'content': {'parts': [{'inlineData': {'data': base64.b64encode(sent[-1].encode()).decode()}}]}}]}
v.post = post
v.encode = lambda pcm, out: pathlib.Path(out).write_bytes(pcm)
stand_in = types.ModuleType('gen_audio')
deaf = json.loads(${JSON.stringify(JSON.stringify(deaf))})
heard = lambda text: 'зовсім інше' if any(w in text for w in deaf) else text
stand_in.transcribe = lambda path: heard(pathlib.Path(path).read_bytes().decode())
sys.modules['gen_audio'] = stand_in
sys.argv = ['gen_voice.py'] + json.loads(${JSON.stringify(JSON.stringify(argv))})
try:
    v.main()
finally:
    print('SENT ' + json.dumps(sent, ensure_ascii=False))`);
    const lines = r.out.split('\n');
    return { ...r, lines, sent: JSON.parse(lines.find((l) => l.startsWith('SENT '))?.slice(5) ?? '[]') };
  }
  const json = (dir, path) => JSON.parse(readFileSync(join(dir, path), 'utf8'));
  /** Every file under `dir`/`path`, with the folders inside it, sorted. */
  const under = (dir, path) => (existsSync(join(dir, path)) ? readdirSync(join(dir, path), { recursive: true, withFileTypes: true }).filter((f) => f.isFile())
    .map((f) => join(f.parentPath, f.name).slice(join(dir, path).length + 1)).sort() : []);

  it('a clip of a world is written into the folder of its world, a clip of the core into public/voice as ever', () => {
    const dir = tree();
    const r = run(dir);
    expect(r.code, r.err).toBe(0);
    expect(r.lines[0]).toBe(`5 of 5 lines to record, model gemini-2.5-flash-preview-tts: ${NAMES.join(' ')}`);
    expect(r.sent).toEqual(['Привіт!', 'Ось і озеро!', 'Я чапля.', 'Я чапля.', 'Це проба.']);
    // a published world: public/voice/<id>/; a test world: worlds-test/<id>/voice/<id>/
    expect(under(dir, 'public/voice')).toEqual(['hello.mp3', 'lake/heron_hi.mp3', 'lake/heron_hi@Leda.mp3', 'lake/lake_hi.mp3']);
    expect(under(dir, 'worlds-test/trial')).toEqual(['voice/trial/trial_hi.mp3']);
    expect(readFileSync(join(dir, 'public/voice/lake/lake_hi.mp3'), 'utf8')).toBe('Ось і озеро!');
  });

  it('the check record of a clip is kept under the name <world>/<key> (R72), in the voice its key names', () => {
    const dir = tree();
    run(dir);
    const qa = json(dir, 'voice/qa.json');
    expect(Object.keys(qa)).toEqual(NAMES);
    expect(qa['lake/lake_hi']).toEqual({ text: 'Ось і озеро!', heard: 'Ось і озеро!', score: 1, style: 'joy', voice: 'Puck', model: 'gemini-2.5-flash-preview-tts' });
    expect(qa['lake/heron_hi@Leda']).toMatchObject({ text: 'Я чапля.', style: 'warm', voice: 'Leda' });
    expect(qa.hello).toMatchObject({ text: 'Привіт!', voice: 'Puck' });
  });

  it('writes the list of the core and the list of every world that has a folder of clips: names without the folder, sorted', () => {
    const dir = tree();
    run(dir);
    expect(readFileSync(join(dir, 'src/core/clips.json'), 'utf8')).toBe('["hello"]');
    expect(readFileSync(join(dir, 'src/worlds/lake/clips.json'), 'utf8')).toBe('["heron_hi", "heron_hi@Leda", "lake_hi"]');
    expect(readFileSync(join(dir, 'src/worlds/trial/clips.json'), 'utf8')).toBe('["trial_hi"]');
    // a folder of clips that is no world of the sources gets no list, and the run says so
    mkdirSync(join(dir, 'public/voice/nowhere'), { recursive: true });
    writeFileSync(join(dir, 'public/voice/nowhere/x.mp3'), 'x');
    const again = run(dir);
    expect(again.code, again.err).toBe(0);
    expect(again.out).toContain('SKIP  public/voice/nowhere: there is no world src/worlds/nowhere');
    expect(existsSync(join(dir, 'src/worlds/nowhere'))).toBe(false);
    expect(json(dir, 'src/core/clips.json')).toEqual(['hello']);
  });

  it('a clip of a world that does not sound like its text is reported by its name, like a clip of the core', () => {
    const dir = tree();
    const r = runDeaf(['озеро', 'Привіт'], dir);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('LOW   0.');
    expect(r.out.split('\n').filter((l) => l.startsWith('LOW')).map((l) => l.split(' ').filter(Boolean)[2])).toEqual(['hello:', 'lake/lake_hi:']);
    expect(r.err).toContain('gen_voice: not recorded: none; do not sound like their text: hello lake/lake_hi. Run again with --only=<id>,<id>.');
    // the clips that were heard well are kept, and the lists are written all the same
    expect(json(dir, 'voice/qa.json')['lake/lake_hi'].score).toBeLessThan(0.85);
    expect(json(dir, 'src/worlds/lake/clips.json')).toEqual(['heron_hi', 'heron_hi@Leda', 'lake_hi']);
  });

  it('a second run sends nothing: every clip is found where it lies, by its own record', () => {
    const dir = tree();
    run(dir);
    const again = run(dir);
    expect(again.lines[0]).toBe('0 of 5 lines to record, model gemini-2.5-flash-preview-tts: ');
    expect(again.sent).toEqual([]);
    // a clip of a world that is gone is recorded again, alone
    rmSync(join(dir, 'worlds-test/trial/voice/trial/trial_hi.mp3'));
    const third = run(dir);
    expect(third.lines[0]).toBe('1 of 5 lines to record, model gemini-2.5-flash-preview-tts: trial/trial_hi');
    expect(third.sent).toEqual(['Це проба.']);
  });

  it('"recorded already?" goes by the pair: a clip of the core with the same key, and its record, is not the world\'s clip', () => {
    const dir = tree({ lake_hi: PHRASES.lake_hi });
    const audio = join(dir, 'public/voice');
    writeFileSync(join(audio, 'lake_hi.mp3'), 'the core has a clip of this name');
    const rec = { text: 'Ось і озеро!', style: 'joy', score: 1 };
    const stale = (qa) => {
      const r = py(`
audio, qa = pathlib.Path(${JSON.stringify(audio)}), json.loads(${JSON.stringify(JSON.stringify(qa))})
print(json.dumps([v.stale('lake/lake_hi', 'Ось і озеро!', 'joy', qa, audio), v.stale('lake_hi', 'Ось і озеро!', 'joy', qa, audio)]))`);
      expect(r.code, r.err).toBe(0);
      return JSON.parse(r.out);
    };
    // only the core's clip and record: the world's line is not recorded
    expect(stale({ lake_hi: rec })).toEqual([true, false]);
    // the world's record without its clip, and its clip without its record
    expect(stale({ 'lake/lake_hi': rec })).toEqual([true, true]);
    mkdirSync(join(audio, 'lake'), { recursive: true });
    writeFileSync(join(audio, 'lake/lake_hi.mp3'), 'x');
    expect(stale({ lake_hi: rec })).toEqual([true, false]);
    expect(stale({ 'lake/lake_hi': rec })).toEqual([false, true]);
    // and the whole run agrees: with the core's clip and record there, the line of the world is still sent
    writeFileSync(join(dir, 'voice/qa.json'), JSON.stringify({ lake_hi: rec }));
    rmSync(join(audio, 'lake'), { recursive: true });
    expect(run(dir, '--dry-run').lines[0]).toBe('1 of 1 lines to record, model gemini-2.5-flash-preview-tts: lake/lake_hi');
  });

  it('a clip of a test world is looked for in worlds-test/<id>/voice/<id>/, not in public/voice/<id>/', () => {
    const dir = tree();
    const r = py(`
audio = pathlib.Path(${JSON.stringify(join(dir, 'public/voice'))})
print(json.dumps([str(v.clip_file(audio, n).relative_to(audio.parent.parent)) for n in ['hello', 'lake/lake_hi', 'lake/heron_hi@Leda', 'trial/trial_hi']]))`);
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out)).toEqual(['public/voice/hello.mp3', 'public/voice/lake/lake_hi.mp3', 'public/voice/lake/heron_hi@Leda.mp3', 'worlds-test/trial/voice/trial/trial_hi.mp3']);
  });

  it('--only takes <world>/<key> and the plain key alike (R75): the same line, the same clip', () => {
    for (const only of ['lake/lake_hi', 'lake_hi']) {
      const dir = tree();
      const r = run(dir, `--only=${only}`);
      expect(r.code, r.err).toBe(0);
      expect(r.lines[0], only).toBe('1 of 5 lines to record, model gemini-2.5-flash-preview-tts: lake/lake_hi');
      expect(r.sent, only).toEqual(['Ось і озеро!']);
      expect(under(dir, 'public/voice'), only).toEqual(['lake/lake_hi.mp3']);
      expect(Object.keys(json(dir, 'voice/qa.json')), only).toEqual(['lake/lake_hi']);
    }
    // several at once, of the core and of worlds, in either form; a voice of a character by its full name
    const dir = tree();
    const r = run(dir, '--only=hello,trial_hi,lake/heron_hi@Leda');
    expect(r.lines[0]).toBe('3 of 5 lines to record, model gemini-2.5-flash-preview-tts: hello lake/heron_hi@Leda trial/trial_hi');
    expect(r.lines).toContain('by voice (model gemini-2.5-flash-preview-tts): Puck 2, Leda 1');
  });

  it('--only with the name of another world, or of no line, sends nothing and names the line', () => {
    const dir = tree();
    const wrong = run(dir, '--only=trial/lake_hi');
    expect(wrong.code).not.toBe(0);
    expect(wrong.err).toContain('gen_voice: nothing was sent. Not in voice/phrases.json: trial/lake_hi (it is lake/lake_hi)');
    const core = run(dir, '--only=lake/hello,nope');
    expect(core.err).toContain('gen_voice: nothing was sent. Not in voice/phrases.json: lake/hello (it is hello) nope');
    for (const r of [wrong, core]) expect(r.sent).toEqual([]);
    expect(under(dir, 'public/voice')).toEqual([]);
    expect(existsSync(join(dir, 'voice/qa.json'))).toBe(false);
  });

  it('--dry-run takes the same names, sends nothing and writes nothing - no clip, no record, no list', () => {
    const dir = tree();
    for (const [argv, first] of [[[], `5 of 5 lines to record, model gemini-2.5-flash-preview-tts: ${NAMES.join(' ')}`],
      [['--only=lake/lake_hi'], '1 of 5 lines to record, model gemini-2.5-flash-preview-tts: lake/lake_hi'],
      [['--only=trial_hi'], '1 of 5 lines to record, model gemini-2.5-flash-preview-tts: trial/trial_hi']]) {
      const r = run(dir, '--dry-run', ...argv);
      expect(r.code, r.err).toBe(0);
      expect(r.lines[0]).toBe(first);
      expect(r.sent).toEqual([]);
    }
    expect(under(dir, 'public/voice')).toEqual([]);
    expect(under(dir, 'worlds-test')).toEqual([]);
    expect(under(dir, 'src')).toEqual([]);
    expect(existsSync(join(dir, 'voice/qa.json'))).toBe(false);
  });

  it('a command of the core says what it always said: the key alone, no folder', () => {
    // the real list of the repository; nothing is sent (--dry-run), no key is read
    const run = (...argv) => execFileSync('python3', ['-I', '-B', join(root, 'tools/gen_voice.py'), '--dry-run', ...argv],
      { encoding: 'utf8', env: { ...process.env, ACADEMY_GEMINI_ENV: join(tmp, 'no-such.env') } });
    const total = Object.keys(JSON.parse(readFileSync(join(root, 'voice/phrases.json'), 'utf8'))).length;
    expect(run('--only=welcome_back')).toBe(`1 of ${total} lines to record, model gemini-2.5-flash-preview-tts: welcome_back\nby voice (model gemini-2.5-flash-preview-tts): Puck 1\n`);
    expect(run('--only=npc_next@Leda,unicorn_hi').split('\n')[0]).toBe(`2 of ${total} lines to record, model gemini-2.5-flash-preview-tts: npc_next@Leda unicorn_hi`);
  });
});

describe('recorded clips', () => {
  const phrases = JSON.parse(readFileSync(join(root, 'voice/phrases.json'), 'utf8'));
  const qa = JSON.parse(readFileSync(join(root, 'voice/qa.json'), 'utf8'));
  const clips = JSON.parse(readFileSync(join(root, 'src/core/clips.json'), 'utf8'));
  const HOW = 'Record it: python3 tools/gen_voice.py (paid service, the key is in ~/.config/academy/gemini.env).';

  // The voice of a next world (TECH-09): a row with a fourth field. Its clip is named `<world>/<key>` in voice/qa.json
  // and lies where the game asks for it: public/voice/<world>/, or worlds-test/<world>/voice/<world>/ for a test world;
  // the game finds it by the world's own list, src/worlds/<world>/clips.json.
  const worldOf = (key) => phrases[key]?.[3] ?? null;
  const nameOf = (key) => (worldOf(key) ? `${worldOf(key)}/${key}` : key);
  const worldDir = (id) => (existsSync(join(root, 'worlds-test', id)) ? join(root, 'worlds-test', id, 'voice', id) : join(root, 'public/voice', id));
  const worldList = (id) => (existsSync(join(root, 'src/worlds', id, 'clips.json')) ? JSON.parse(readFileSync(join(root, 'src/worlds', id, 'clips.json'), 'utf8')) : null);
  const inWorld = (key) => existsSync(join(worldDir(worldOf(key)), `${key}.mp3`)) && (worldList(worldOf(key)) ?? []).includes(key);
  // A line's clip is in public/voice (the first load, listed in clips.json) or in public/bank (the bank of the old game,
  // VOICE-07: imported, marked `from` in voice/qa.json, never listed in clips.json - the game does not ask for it yet).
  const inBank = (key) => existsSync(join(root, 'public/bank', `${key}.mp3`));
  const inCore = (key) => (inBank(key) ? !clips.includes(key) && !!qa[key]?.from : existsSync(join(root, 'public/voice', `${key}.mp3`)) && clips.includes(key));
  const hasClip = (key) => (worldOf(key) ? inWorld(key) : inCore(key));

  // VOICE-10: the voices of the characters are listed for recording (`<key>@<voice>`) before they are recorded. Until
  // the runner records a voice, its lines may lack their clip - while the cat's clip of the same key is up to date, so
  // the game plays that one (src/core/voice.ts `clipFor`). After the recording the runner empties this list; the
  // build for main (pages.yml) fails while anything is left in it.
  // Recorded 2026-11-17: Charon, Sulafat, Leda, Orus. A new voice of a later world waits here until it is recorded.
  const AWAITING = [];
  // VOICE-14: every clip says which model and which voice made it; the voice is the one its key names.
  const MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-tts'];
  const voiceOf = (key) => (key.includes('@') ? key.split('@')[1] : 'Puck');
  const upToDate = (key, text, style) => {
    const rec = qa[nameOf(key)];
    return hasClip(key) && rec?.text === text && rec?.style === style && MODELS.includes(rec?.model) && rec?.voice === voiceOf(key);
  };
  const waits = (key) => AWAITING.includes(key.split('@')[1]) && !upToDate(key, ...phrases[key]);

  it('every line of voice/phrases.json has a clip recorded from exactly its text and intonation', () => {
    const wrong = Object.entries(phrases).filter(([key, [text, style]]) => !upToDate(key, text, style) && !waits(key))
      .map(([key]) => key);
    expect(Object.keys(phrases).filter(inBank).length, 'the bank is checked too').toBeGreaterThan(300);
    expect(wrong, `lines without an up-to-date clip: ${wrong.join(' ')}. ${HOW}`).toEqual([]);
  });

  it.runIf(AWAITING.length > 0)('a line that waits for its voice has the cat\'s clip of the same text to play meanwhile', () => {
    const waiting = Object.keys(phrases).filter((k) => k.includes('@') && waits(k));
    expect(waiting.length, 'nothing waits: empty AWAITING').toBeGreaterThan(0);
    const bare = waiting.filter((k) => { const [text, style] = phrases[k]; return !upToDate(k.split('@')[0], text, style); });
    expect(bare, `lines whose voice is not recorded and that have no cat's clip either: ${bare.join(' ')}`).toEqual([]);
  });

  it('a voice that is recorded no longer waits (AWAITING is emptied after the recording)', () => {
    const done = AWAITING.filter((v) => {
      const mine = Object.keys(phrases).filter((k) => k.endsWith(`@${v}`));
      return mine.length > 0 && mine.every((k) => !waits(k));
    });
    expect(done, `recorded: take them out of AWAITING in tools/gen_voice.test.mjs: ${done.join(' ')}`).toEqual([]);
  });

  it.runIf(process.env.GITHUB_REF_NAME === 'main')('the game published from main has every voice recorded', () => {
    const waiting = Object.keys(phrases).filter(waits);
    expect(waiting, `lines not recorded in their voice yet: ${waiting.join(' ')}. ${HOW}`).toEqual([]);
  });

  it('every clip was heard back as its text (voice/qa.json has no score below 0.85)', () => {
    const low = Object.keys(phrases).filter((key) => !waits(key) && !(qa[nameOf(key)]?.score >= 0.85)).map((key) => `${nameOf(key)} ${qa[nameOf(key)]?.score}`);
    expect(low, `clips that do not sound like their text: ${low.join(', ')}. ${HOW}`).toEqual([]);
  });

  // The worlds of the sources (one folder each) and the first of them, as tools/dist-size.mjs reads them.
  const { first, worlds: next } = sourceWorlds();

  it('src/core/clips.json lists exactly the files of public/voice', () => {
    const here = readdirSync(join(root, 'public/voice'), { withFileTypes: true });
    const files = here.filter((f) => f.isFile() && f.name.endsWith('.mp3')).map((f) => f.name.slice(0, -4)).sort();
    expect(clips, 'clips.json and the .mp3 files of public/voice differ (python3 tools/gen_voice.py rewrites the list)').toEqual(files);
    expect(clips.filter((k) => k.includes('/')), 'the list of the core names no clip of a world').toEqual([]);
    // Besides its clips public/voice holds only the folders of the next worlds (voice/<id>/, TECH-09).
    const stray = here.filter((f) => (f.isDirectory() ? !next.includes(f.name) : !f.name.endsWith('.mp3') || f.name.endsWith('.tmp.mp3'))).map((f) => f.name);
    expect(stray, 'stray files in public/voice').toEqual([]);
  });

  it('every line of a next world has its clip in the folder of its world, and no line of the core or the first world has a world', () => {
    const withWorld = Object.keys(phrases).filter((k) => worldOf(k));
    expect(withWorld.filter((k) => !next.includes(worldOf(k))), 'lines of a world that is no next world of src/worlds').toEqual([]);
    expect(withWorld.filter((k) => worldOf(k) === first)).toEqual([]);
    expect(withWorld.filter((k) => !existsSync(join(worldDir(worldOf(k)), `${k}.mp3`))), `lines of a world without a clip in its folder. ${HOW}`).toEqual([]);
    // a clip of a world is no clip of the core: the installation does not bring it
    expect(withWorld.filter((k) => clips.includes(k) || existsSync(join(root, 'public/voice', `${k}.mp3`)))).toEqual([]);
    // not vacuous: the probe world has a line of its own
    expect(withWorld.length).toBeGreaterThan(0);
  });

  it('src/worlds/<id>/clips.json lists exactly the files of the folder of that world\'s clips', () => {
    let lists = 0;
    for (const id of next) {
      const dir = worldDir(id), list = worldList(id);
      const here = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [];
      if (list === null && !here.length) continue;          // a world with no voice of its own
      lists++;
      expect(list, `${id}: clips.json and the .mp3 files of its folder differ (python3 tools/gen_voice.py rewrites the list)`)
        .toEqual(here.filter((f) => f.isFile() && f.name.endsWith('.mp3') && !f.name.endsWith('.tmp.mp3')).map((f) => f.name.slice(0, -4)).sort());
      expect(list.filter((k) => k.includes('/')), `${id}: the names of its list carry no folder`).toEqual([]);
      expect(here.filter((f) => !f.isFile() || !f.name.endsWith('.mp3') || f.name.endsWith('.tmp.mp3')).map((f) => f.name), `stray files in the folder of the clips of ${id}`).toEqual([]);
      // every clip of the folder is a line of this world: a clip nobody speaks would be dead weight of its download
      expect(list.filter((k) => worldOf(k) !== id), `${id}: clips that are no line of this world in voice/phrases.json`).toEqual([]);
    }
    expect(lists, 'no next world has a list of clips: the check is blind').toBeGreaterThan(0);
    // the first world keeps its clips with the core: no list and no folder of its own
    expect(worldList(first)).toBeNull();
    expect(existsSync(join(root, 'public/voice', first))).toBe(false);
  });

  it('the clip of the probe world is a copy of the shared line it takes its text from: nothing was recorded for it (R79)', () => {
    const rec = qa['probe/probe_hi'];
    const donor = /^copy of ([a-z0-9_]+) \(public\/voice\/\1\.mp3\)$/.exec(rec?.from ?? '')?.[1];
    expect(donor, 'voice/qa.json: the record of probe/probe_hi says where the clip was taken from').toBeTruthy();
    // the donor is a shared line of the narrator, recorded and heard back well; the same text and intonation
    expect(phrases[donor]).toHaveLength(3);
    expect(donor.includes('@')).toBe(false);
    expect(phrases.probe_hi).toEqual([phrases[donor][0], phrases[donor][1], phrases[donor][2], 'probe']);
    expect(qa[donor].score).toBeGreaterThanOrEqual(0.85);
    const { from, ...copied } = rec;
    expect(copied, 'the record is the donor\'s, with `from` added').toEqual(qa[donor]);
    expect(from).toContain(donor);
    // byte for byte the donor's clip
    const clip = readFileSync(join(root, 'worlds-test/probe/voice/probe/probe_hi.mp3'));
    expect(clip.equals(readFileSync(join(root, 'public/voice', `${donor}.mp3`))), 'worlds-test/probe/README.md says how to make the copy again').toBe(true);
    expect(worldList('probe')).toEqual(['probe_hi']);
  });
});
