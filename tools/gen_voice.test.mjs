// Runs in `npm test`. Two things are checked here.
// 1. The decisions tools/gen_voice.py makes before it pays for anything: which lines go to the voice service,
//    and that nothing is sent without a key or with a {placeholder} (the place of the child's name).
// 2. The recorded clips themselves: every line of voice/phrases.json has a clip that was recorded from exactly
//    this text with this intonation and was heard back correctly. A changed line fails here until it is re-recorded.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { installedWorlds, sourceWorlds } from './dist-size.mjs';

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

  it('a line with a text for the model (SAY_AS): the model reads that text, in every voice of the line; the clip is heard back against the line on the screen', () => {
    const QUESTION = 'Оце так! А складніше зможеш?', SAID = 'Оце так! А складніше — зможеш?';
    const r = py(`
sent = []
v.PACE = 0
v.post = lambda url, b, key: (sent.append(b['contents'][0]['parts'][0]['text']), {'candidates': [{'content': {'parts': [{'inlineData': {'data': ''}}]}}]})[1]
v.encode = lambda pcm, out: pathlib.Path(out).write_bytes(b'x')
audio = pathlib.Path(${JSON.stringify(join(tmp, 'say-as'))})
rec = v.Recorder(audio, 'k', v.MODELS['old'], lambda path: ${JSON.stringify(QUESTION)})
out = [rec.record(cid, ${JSON.stringify(QUESTION)}, 'warm', {}) for cid in ('npc_harder', 'npc_harder@Orus', 'npc_next')]
print(json.dumps({'sent': sent, 'out': out, 'say': v.SAY_AS, 'warm': v.STYLES['warm'],
                  'keys': [v.key_of('npc_harder'), v.key_of('npc_harder@Leda'), v.key_of('sky/npc_harder@Leda'), v.key_of('sky/cloud_hi')]}))`);
    expect(r.code, r.err).toBe(0);
    // the recorder prints a line per clip first: the answer is the last line
    const { sent, out, say, warm, keys } = JSON.parse(r.out.trim().split('\n').pop());
    expect(say.npc_harder).toBe(SAID);
    // the cat: its `warm` prompt, as every question of the game, and the text for the model after it
    expect(sent[0]).toBe(`${warm}\n\n${SAID}`);
    // a character: its own style, the same text for the model
    expect(sent[1]).toMatch(/гном/);
    expect(sent[1].endsWith(`\n\n${SAID}`)).toBe(true);
    // a line without such a text is read as it is shown
    expect(sent[2].endsWith(`\n\n${QUESTION}`)).toBe(true);
    // heard back as the line on the screen: the record keeps the line, and the text the model read next to it
    expect(out[0]).toEqual({ text: QUESTION, heard: QUESTION, score: 1, said: SAID, style: 'warm', voice: 'Puck', model: 'gemini-2.5-flash-preview-tts' });
    expect(out[1]).toMatchObject({ text: QUESTION, said: SAID, voice: 'Orus' });
    expect(Object.hasOwn(out[2], 'said')).toBe(false);
    expect(keys).toEqual(['npc_harder', 'npc_harder', 'npc_harder', 'cloud_hi']);
  });

  it('a clip of a line with a text for the model is fresh only while it was recorded from that text', () => {
    const dir = join(tmp, 'say-stale');
    mkdirSync(dir, { recursive: true });
    for (const name of ['npc_harder', 'npc_harder@Leda', 'npc_next']) writeFileSync(join(dir, `${name}.mp3`), 'x');
    const QUESTION = 'Оце так! А складніше зможеш?', SAID = 'Оце так! А складніше — зможеш?';
    const qa = { npc_harder: { text: QUESTION, said: SAID, style: 'warm', score: 1 }, 'npc_harder@Leda': { text: QUESTION, style: 'warm', score: 1 },
      npc_next: { text: 'Так!', style: 'joy', score: 1 } };
    const r = py(`
audio, qa = pathlib.Path(${JSON.stringify(dir)}), json.loads(${JSON.stringify(JSON.stringify(qa))})
q = ${JSON.stringify(QUESTION)}
out = [v.stale('npc_harder', q, 'warm', qa, audio), v.stale('npc_harder@Leda', q, 'warm', qa, audio), v.stale('npc_next', 'Так!', 'joy', qa, audio)]
v.SAY_AS['npc_harder'] = 'Оце так!.. А складніше зможеш?'
out.append(v.stale('npc_harder', q, 'warm', qa, audio))
del v.SAY_AS['npc_harder']
out += [v.stale('npc_harder', q, 'warm', qa, audio), v.stale('npc_harder@Leda', q, 'warm', qa, audio)]
print(json.dumps(out))`);
    expect(r.code, r.err).toBe(0);
    // recorded from the text for the model: fresh; recorded from the line itself: not; a line without such a text: as ever;
    // the text for the model changed, or taken away: the clip made from the old one is recorded anew
    expect(JSON.parse(r.out)).toEqual([false, true, false, true, true, false]);
  });

  it('a text for the model with other words than its line stops the run before anything is sent', () => {
    const run = (say, phrases) => py(`
v.SAY_AS.clear()
v.SAY_AS.update(json.loads(${JSON.stringify(JSON.stringify(say))}))
v.check_say_as(json.loads(${JSON.stringify(JSON.stringify(phrases))}))`);
    const phrases = { npc_harder: ['Оце так! А складніше зможеш?', 'warm', 'cat'] };
    expect(run({ npc_harder: 'Оце так! А складніше — зможеш?' }, phrases).code).toBe(0);
    expect(run({ npc_harder: 'Оце так!.. А СКЛАДНІШЕ, зможеш?' }, phrases).code).toBe(0);
    // a stress mark (U+0301) is no word of its own: «А́рка» is «Арка»
    expect(run({ doze: 'А\u0301рка ще дрімає!' }, { doze: ['Арка ще дрімає!', 'warm', 'cat'] }).code).toBe(0);
    const words = run({ npc_harder: 'Оце так! А важче — зможеш?' }, phrases);
    expect(words.code).not.toBe(0);
    expect(words.err).toContain('nothing was sent');
    expect(words.err).toContain('npc_harder');
    // a list of lines without the line (a tree of a test, a narrowed list) is not stopped: nothing of it is sent
    expect(run({ npc_gone: 'Оце так!' }, phrases).code).toBe(0);
    // the real table against the real lines, as main() checks it first
    const real = py(`v.check_say_as(json.loads((v.ROOT / 'voice' / 'phrases.json').read_text()))\nprint(len(v.SAY_AS))`);
    expect(real.code, real.err).toBe(0);
    expect(Number(real.out)).toBeGreaterThan(0);
  });

  it('the three intonations are all there is: a question is not an intonation of its own', () => {
    const r = py("print(json.dumps([sorted(v.STYLES), sorted(v.MOOD)]))");
    expect(JSON.parse(r.out)).toEqual([['calm', 'joy', 'warm'], ['calm', 'joy', 'warm']]);
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

  // --max-tries=N (the customer's limit of 2026-11-27: at most 2 paid requests a line): the plain prompt ceil(N/2) times,
  // the strict one the rest; the run counts what it sent. A stand-in takes the place of the service: nothing is sent.
  const tries = (maxTries, heard = () => '') => {
    const r = py(`
calls = []
v.synth = lambda text, style, voice, model, key, strict=False: (calls.append(strict), b'x')[1]
v.encode = lambda data, path: pathlib.Path(path).write_bytes(data)
answers = ${JSON.stringify([heard(0), heard(1), heard(2), heard(3), heard(4), heard(5)])}
rec = v.Recorder(pathlib.Path(${JSON.stringify(join(tmp, 'voice-tries'))}), 'k', v.MODELS['old'], lambda p: answers[len(calls) - 1], max_tries=${maxTries === null ? 'None' : maxTries})
res = rec.record('npc_next@Leda', 'Тепер повтори!', 'warm', {})
print(json.dumps({'calls': calls, 'sent': rec.sent, 'score': res['score']}))`);
    expect(r.code, r.err).toBe(0);
    return JSON.parse(r.out.trim().split('\n').at(-1));   // after the line the recorder prints of the clip
  };

  it('--max-tries=2: one request with the plain prompt, one with the strict, never more', () => {
    expect(tries(2)).toMatchObject({ calls: [false, true], sent: 2 });
    expect(tries(1)).toMatchObject({ calls: [false], sent: 1 });
    expect(tries(3)).toMatchObject({ calls: [false, false, true], sent: 3 });
    // without the limit, as ever: three and three
    expect(tries(null)).toMatchObject({ calls: [false, false, false, true, true, true], sent: 6 });
  });

  it('--max-tries: a clip that sounds like its text ends the line at once', () => {
    expect(tries(2, () => 'Тепер повтори!')).toMatchObject({ calls: [false], sent: 1, score: 1 });
  });

  it('--max-tries with --dry-run prints the most requests the lines can take, and sends nothing', () => {
    const r = execFileSync('python3', ['-I', '-B', join(root, 'tools/gen_voice.py'), '--dry-run', '--max-tries=2', '--only=sup_jump'],
      { encoding: 'utf8', env: { ...process.env, ACADEMY_GEMINI_ENV: join(tmp, 'no-such.env') } });
    expect(r).toMatch(/^requests: at most 2 \(1 lines x 2\)$/m);
    const en = execFileSync('python3', ['-I', '-B', join(root, 'tools/gen_voice.py'), '--en', '--dry-run', '--max-tries=2'],
      { encoding: 'utf8', env: { ...process.env, ACADEMY_GEMINI_ENV: join(tmp, 'no-such.env') } });
    expect(en).toMatch(/^requests: at most \d+ \(\d+ lines x 2\)$/m);
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

describe('tools/gen_voice.py: its arguments (2026-11-19: an unknown one recorded for real)', { timeout: 60_000 }, () => {
  const cli = (args) => spawnSync('python3', ['-I', '-B', join(root, 'tools/gen_voice.py'), ...args],
    { encoding: 'utf8', env: { ...process.env, ACADEMY_GEMINI_ENV: join(tmpdir(), 'gen-voice-no-such.env') } });

  it('an argument it does not know stops it before anything is read or sent', () => {
    for (const bad of [['--help-me'], ['--dryrun'], ['--only', 'sup_speed'], ['sup_speed'], ['--dry-run', '--forse'], ['--max-tries'], ['--max-tries', '2']]) {
      const r = cli(bad);
      expect(r.status, bad.join(' ')).not.toBe(0);
      expect(r.stderr, bad.join(' ')).toMatch(/^gen_voice: nothing was sent\. Unknown argument: /m);
      expect(r.stdout, bad.join(' ')).not.toMatch(/lines to record/);
    }
  });

  it('the check runs first in main(): no file is read, no key is asked, no request is made', () => {
    const r = py(`
seen = []
v.gemini_key = lambda *a: seen.append('key')
real = pathlib.Path.read_text
pathlib.Path.read_text = lambda self, *a, **k: (seen.append(str(self)), real(self, *a, **k))[1]
sys.argv = ['gen_voice.py', '--bogus']
try:
    v.main()
except SystemExit as e:
    print(json.dumps({'exit': str(e), 'seen': seen}))`);
    expect(r.code, r.err).toBe(0);
    const out = JSON.parse(r.out);
    expect(out.exit).toMatch(/^gen_voice: nothing was sent\. Unknown argument: --bogus/);
    expect(out.seen).toEqual([]);
  });

  it('--help and -h print the usage and send nothing, without a key', () => {
    for (const h of ['--help', '-h']) {
      const r = cli([h]);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/Run: python3 tools\/gen_voice\.py/);
      expect(r.stdout).not.toMatch(/lines to record/);
    }
  });

  it('the known arguments still pass the check', () => {
    expect(cli(['--dry-run', '--model=old', '--only=sup_jump']).status).toBe(0);
    expect(cli(['--dry-run', '--max-tries=2', '--only=sup_jump']).status).toBe(0);
  });

  it('--max-tries that is no whole number from 1 stops it before anything is read or sent', () => {
    for (const bad of ['0', 'x', '', '-1', '1.5']) {
      const r = cli(['--dry-run', `--max-tries=${bad}`]);
      expect(r.status, bad).not.toBe(0);
      expect(r.stderr, bad).toMatch(/^gen_voice: nothing was sent\. --max-tries is a whole number from 1/m);
      expect(r.stdout, bad).not.toMatch(/lines to record/);
    }
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

  it('a clip of a world is written into the folder of its world, outside public/; a clip of the core into public/voice as ever', () => {
    const dir = tree();
    const r = run(dir);
    expect(r.code, r.err).toBe(0);
    expect(r.lines[0]).toBe(`5 of 5 lines to record, model gemini-2.5-flash-preview-tts: ${NAMES.join(' ')}`);
    expect(r.sent).toEqual(['Привіт!', 'Ось і озеро!', 'Я чапля.', 'Я чапля.', 'Це проба.']);
    // a next world: worlds-data/<id>/voice/<id>/ (every build copies public/, only a build with the world takes this);
    // a test world: worlds-test/<id>/voice/<id>/
    expect(under(dir, 'public/voice')).toEqual(['hello.mp3']);
    expect(under(dir, 'worlds-data')).toEqual(['lake/voice/lake/heron_hi.mp3', 'lake/voice/lake/heron_hi@Leda.mp3', 'lake/voice/lake/lake_hi.mp3']);
    expect(under(dir, 'worlds-test/trial')).toEqual(['voice/trial/trial_hi.mp3']);
    expect(readFileSync(join(dir, 'worlds-data/lake/voice/lake/lake_hi.mp3'), 'utf8')).toBe('Ось і озеро!');
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
    const own = join(dir, 'worlds-data/lake/voice/lake');
    mkdirSync(own, { recursive: true });
    writeFileSync(join(own, 'lake_hi.mp3'), 'x');
    expect(stale({ lake_hi: rec })).toEqual([true, false]);
    expect(stale({ 'lake/lake_hi': rec })).toEqual([false, true]);
    // and the whole run agrees: with the core's clip and record there, the line of the world is still sent
    writeFileSync(join(dir, 'voice/qa.json'), JSON.stringify({ lake_hi: rec }));
    rmSync(own, { recursive: true });
    expect(run(dir, '--dry-run').lines[0]).toBe('1 of 1 lines to record, model gemini-2.5-flash-preview-tts: lake/lake_hi');
  });

  it('where a clip is looked for: the core in public/voice, a next world in worlds-data/<id>/voice/<id>/, a world of the installation in public/voice/<id>/, a test world in worlds-test/<id>/voice/<id>/', () => {
    const dir = tree();
    const where = () => py(`
audio = pathlib.Path(${JSON.stringify(join(dir, 'public/voice'))})
print(json.dumps([str(v.clip_file(audio, n).relative_to(audio.parent.parent)) for n in ['hello', 'lake/lake_hi', 'lake/heron_hi@Leda', 'trial/trial_hi', 'hub/hub_hi']]))`);
    const r = where();
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out)).toEqual(['public/voice/hello.mp3', 'worlds-data/lake/voice/lake/lake_hi.mp3', 'worlds-data/lake/voice/lake/heron_hi@Leda.mp3',
      'worlds-test/trial/voice/trial/trial_hi.mp3', 'worlds-data/hub/voice/hub/hub_hi.mp3']);
    // the hub listed in the installation (src/worlds/index.ts, as tools/dist-size.mjs reads it): its clips are the core's
    writeFileSync(join(dir, 'src/worlds/index.ts'), "export const DEFAULT_WORLD = 'fairy';\nexport const INSTALLED: readonly string[] = [DEFAULT_WORLD, 'hub'];\n");
    expect(JSON.parse(where().out).slice(-1)).toEqual(['public/voice/hub/hub_hi.mp3']);
  });

  it('--only takes <world>/<key> and the plain key alike (R75): the same line, the same clip', () => {
    for (const only of ['lake/lake_hi', 'lake_hi']) {
      const dir = tree();
      const r = run(dir, `--only=${only}`);
      expect(r.code, r.err).toBe(0);
      expect(r.lines[0], only).toBe('1 of 5 lines to record, model gemini-2.5-flash-preview-tts: lake/lake_hi');
      expect(r.sent, only).toEqual(['Ось і озеро!']);
      expect(under(dir, 'public/voice'), only).toEqual([]);
      expect(under(dir, 'worlds-data'), only).toEqual(['lake/voice/lake/lake_hi.mp3']);
      expect(Object.keys(json(dir, 'voice/qa.json')), only).toEqual(['lake/lake_hi']);
    }
    // several at once, of the core and of worlds, in either form; a voice of a character by its full name
    const dir = tree();
    const r = run(dir, '--only=hello,trial_hi,lake/heron_hi@Leda');
    expect(r.lines[0]).toBe('3 of 5 lines to record, model gemini-2.5-flash-preview-tts: hello lake/heron_hi@Leda trial/trial_hi');
    expect(r.lines).toContain('by voice (model gemini-2.5-flash-preview-tts): Puck 2, Leda 1');
  });

  it('--only of a key takes its lines in the characters\' voices too, and says so; <key>@<voice> takes that one alone', () => {
    // 2026-11-21: a dry run of one key showed one line where voice:sync had written five (<key>@<voice> with it)
    for (const only of ['heron_hi', 'lake/heron_hi']) {
      const dir = tree();
      const dry = run(dir, '--dry-run', `--only=${only}`);
      expect(dry.lines, only).toContain('also by voices: lake/heron_hi@Leda');
      expect(dry.lines.find((l) => l.includes('lines to record')), only).toBe('2 of 5 lines to record, model gemini-2.5-flash-preview-tts: lake/heron_hi lake/heron_hi@Leda');
      expect(dry.sent, only).toEqual([]);
      const real = run(dir, `--only=${only}`);
      expect(real.sent, only).toEqual(['Я чапля.', 'Я чапля.']);
      expect(under(dir, 'worlds-data/lake/voice/lake'), only).toEqual(['heron_hi.mp3', 'heron_hi@Leda.mp3']);
    }
    const one = run(tree(), '--dry-run', '--only=lake/heron_hi@Leda');
    expect(one.lines.some((l) => l.startsWith('also by voices'))).toBe(false);
    expect(one.lines[0]).toBe('1 of 5 lines to record, model gemini-2.5-flash-preview-tts: lake/heron_hi@Leda');
    // both asked for: each once, nothing added
    const both = run(tree(), '--dry-run', '--only=heron_hi,heron_hi@Leda');
    expect(both.lines.some((l) => l.startsWith('also by voices'))).toBe(false);
    expect(both.lines[0]).toBe('2 of 5 lines to record, model gemini-2.5-flash-preview-tts: lake/heron_hi lake/heron_hi@Leda');
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
    expect(under(dir, 'worlds-data')).toEqual([]);
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
    expect(under(dir, 'worlds-data')).toEqual([]);
    expect(under(dir, 'worlds-test')).toEqual([]);
    expect(under(dir, 'src')).toEqual([]);
    expect(existsSync(join(dir, 'voice/qa.json'))).toBe(false);
  });

  it('a line with a text for the model, through main(): that text is sent for each of its voices, kept in the record, and a second run sends nothing', () => {
    const QUESTION = 'Оце так! А складніше зможеш?', SAID = 'Оце так! А складніше — зможеш?';
    const dir = tree({ hello: ['Привіт!', 'joy', 'cat'], npc_harder: [QUESTION, 'warm', 'cat'], 'npc_harder@Leda': [QUESTION, 'warm', 'fox'] });
    const r = run(dir);
    expect(r.code, r.err).toBe(0);
    expect(r.sent).toEqual(['Привіт!', SAID, SAID]);
    const qa = json(dir, 'voice/qa.json');
    expect(qa.npc_harder).toMatchObject({ text: QUESTION, said: SAID, score: 1, style: 'warm', voice: 'Puck' });
    expect(qa['npc_harder@Leda']).toMatchObject({ text: QUESTION, said: SAID, score: 1, voice: 'Leda' });
    expect(Object.hasOwn(qa.hello, 'said')).toBe(false);
    expect(run(dir).sent).toEqual([]);
    // a clip made from the line itself (no `said` in its record) is recorded anew from the text for the model
    const before = json(dir, 'voice/qa.json');
    delete before['npc_harder@Leda'].said;
    writeFileSync(join(dir, 'voice/qa.json'), JSON.stringify(before));
    const again = run(dir);
    expect(again.lines[0]).toBe('1 of 3 lines to record, model gemini-2.5-flash-preview-tts: npc_harder@Leda');
    expect(again.sent).toEqual([SAID]);
  });

  it('a line whose words left its text for the model behind stops main() before anything is sent or written', () => {
    const dir = tree({ hello: ['Привіт!', 'joy', 'cat'], npc_harder: ['Оце так! А важче зможеш?', 'warm', 'cat'] });
    const r = run(dir);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain('gen_voice: nothing was sent. SAY_AS has a text for the model with other words than its line');
    expect(r.err).toContain('npc_harder');
    expect(r.sent).toEqual([]);
    expect(under(dir, 'public/voice')).toEqual([]);
    expect(existsSync(join(dir, 'voice/qa.json'))).toBe(false);
  });

  it('a command of the core says what it always said: the key alone, no folder', () => {
    // the real list of the repository; nothing is sent (--dry-run), no key is read
    const run = (...argv) => execFileSync('python3', ['-I', '-B', join(root, 'tools/gen_voice.py'), '--dry-run', ...argv],
      { encoding: 'utf8', env: { ...process.env, ACADEMY_GEMINI_ENV: join(tmp, 'no-such.env') } });
    const total = Object.keys(JSON.parse(readFileSync(join(root, 'voice/phrases.json'), 'utf8'))).length;
    expect(run('--only=welcome_back')).toBe(`1 of ${total} lines to record, model gemini-2.5-flash-preview-tts: welcome_back\nby voice (model gemini-2.5-flash-preview-tts): Puck 1\n`);
    // a key brings its lines in the characters' voices along, and the run names them
    const both = run('--only=npc_next@Leda,npc_again').split('\n');
    expect(both[0]).toBe(`6 of ${total} lines to record, model gemini-2.5-flash-preview-tts: npc_next@Leda npc_again npc_again@Sulafat npc_again@Leda npc_again@Orus npc_again@Charon`);
    expect(both[1]).toBe('also by voices: npc_again@Sulafat npc_again@Leda npc_again@Orus npc_again@Charon');
    // a key only the characters say (`only` of src/worlds/fairy/voices.ts) has no narrator's line: it names their voices
    expect(run('--only=unicorn_hi').split('\n')[0]).toBe(`1 of ${total} lines to record, model gemini-2.5-flash-preview-tts: unicorn_hi@Sulafat`);
  });
});

describe('recorded clips', () => {
  const phrases = JSON.parse(readFileSync(join(root, 'voice/phrases.json'), 'utf8'));
  const qa = JSON.parse(readFileSync(join(root, 'voice/qa.json'), 'utf8'));
  const clips = JSON.parse(readFileSync(join(root, 'src/core/clips.json'), 'utf8'));
  const HOW = 'Record it: python3 tools/gen_voice.py (paid service, the key is in ~/.config/academy/gemini.env).';

  // The voice of a next world (TECH-09): a row with a fourth field. Its clip is named `<world>/<key>` in voice/qa.json
  // and lies in the folder of its world: worlds-data/<world>/voice/<world>/ outside public/ (the build that has the world
  // puts it in at voice/<world>/, where the game asks for it), public/voice/<world>/ for a world of the installation (the
  // hub), worlds-test/<world>/voice/<world>/ for a test world; the game finds it by the world's own list,
  // src/worlds/<world>/clips.json.
  const worldOf = (key) => phrases[key]?.[3] ?? null;
  const nameOf = (key) => (worldOf(key) ? `${worldOf(key)}/${key}` : key);
  const installed = installedWorlds();
  const worldDir = (id) => (existsSync(join(root, 'worlds-test', id)) ? join(root, 'worlds-test', id, 'voice', id)
    : installed.includes(id) ? join(root, 'public/voice', id) : join(root, 'worlds-data', id, 'voice', id));
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
    // A line only the characters say (`only` of src/worlds/<id>/voices.ts) has no cat's clip by design: until its voice
    // is recorded the synthesizer says it - allowed off main, the test of main below wants every voice recorded.
    const bare = waiting.filter((k) => Object.hasOwn(phrases, k.split('@')[0]))
      .filter((k) => { const [text, style] = phrases[k]; return !upToDate(k.split('@')[0], text, style); });
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

  it('a line with a text for the model (SAY_AS of tools/gen_voice.py) has every recorded clip made from that text', () => {
    const say = JSON.parse(py('print(json.dumps(v.SAY_AS))').out);
    expect(Object.keys(say)).toContain('npc_harder');
    expect(Object.keys(say).filter((key) => !Object.hasOwn(phrases, key)), 'a text for the model of no line of the game').toEqual([]);
    const keyOf = (key) => key.split('@')[0];
    const mine = Object.keys(phrases).filter((key) => Object.hasOwn(say, keyOf(key)));
    expect(mine.length).toBeGreaterThanOrEqual(Object.keys(say).length);
    // a clip not recorded yet is named by the test above; here: no clip of such a line was made from the line itself
    const wrong = mine.filter((key) => hasClip(key) && qa[nameOf(key)]?.said !== say[keyOf(key)]);
    expect(wrong, `clips not recorded from the text for the model: ${wrong.join(' ')}. ${HOW}`).toEqual([]);
    expect(qa.npc_harder.said).toBe(say.npc_harder);
    // and no other clip claims a text of its own
    const stray = Object.keys(qa).filter((name) => qa[name].said !== undefined && !Object.hasOwn(say, keyOf(name.split('/').pop())));
    expect(stray, `records with a text for the model that SAY_AS does not have: ${stray.join(' ')}`).toEqual([]);
  }, 60_000);

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
    // Besides its clips public/voice holds only the folders of the worlds of the installation (the hub): public/ is
    // copied into every build, so a next world's voice there would ship with the published game and be precached with
    // the core (TECH-09). A next world's lies in worlds-data/<id>/voice/<id>/ (tools/gen_voice.py `world_audio`).
    const nextHere = here.filter((f) => f.isDirectory() && next.includes(f.name) && !installed.includes(f.name)).map((f) => f.name);
    expect(nextHere, 'the voice of a next world in public/voice: move it to worlds-data/<id>/voice/<id>/').toEqual([]);
    const stray = here.filter((f) => (f.isDirectory() ? !installed.includes(f.name) : !f.name.endsWith('.mp3') || f.name.endsWith('.tmp.mp3'))).map((f) => f.name);
    expect(stray, 'stray files in public/voice').toEqual([]);
    // every clip of the core is a line of voice/phrases.json: a clip nobody speaks (a narrator's copy of a line only the
    // characters say, `only` of src/worlds/<id>/voices.ts) would be dead weight of the installation
    expect(clips.filter((k) => !Object.hasOwn(phrases, k)), 'clips of public/voice that are no line of voice/phrases.json').toEqual([]);
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

// English (Season 2, part B): `--en` records Pip's lines of voice/phrases-en.json in Zephyr, the sixth voice, in British
// English; the book's Isabella (Kokoro, recorded free elsewhere) is never sent. The stand-in service answers with the
// text it was sent, and the stand-in transcription reads it back: no request leaves.
describe('tools/gen_voice.py --en: Pip in English (Zephyr)', { timeout: 60_000 }, () => {
  let n = 0;
  const EN = {
    wb_w_cat: ['Cat.', 'en', 'Isabella', 'hub'],
    pip_hi: ['Hello! I am Pip.', 'en', 'Zephyr', 'hub'],
    pip_red: ['Red!', 'en', 'Zephyr', 'fairy'],
  };
  function tree(phrases = EN) {
    const dir = join(tmp, `en-${++n}`);
    for (const d of ['voice', 'public/en', 'src/core']) mkdirSync(join(dir, d), { recursive: true });
    writeFileSync(join(dir, 'voice/phrases-en.json'), JSON.stringify(phrases));
    writeFileSync(join(dir, 'voice/phrases.json'), JSON.stringify({ hello: ['Привіт!', 'warm', '🐱'] }));
    writeFileSync(join(dir, 'public/en/wb_w_cat.mp3'), 'kokoro');
    writeFileSync(join(dir, 'key.env'), 'GEMINI_API_KEY=stand-in\n');
    return dir;
  }
  function run(dir, ...argv) {
    const r = py(`
import base64, types
v.ROOT = pathlib.Path(${JSON.stringify(dir)})
v.KEY_FILE = v.ROOT / 'key.env'
v.PACE = 0
sent = []
def post(url, body, key):
    sent.append({'text': body['contents'][0]['parts'][0]['text'], 'voice': body['generationConfig']['speechConfig']['voiceConfig']['prebuiltVoiceConfig']['voiceName'], 'style': body['generationConfig']['speechConfig'].get('style')})
    said = body['contents'][0]['parts'][0]['text'].split('\\n')[-1]
    return {'candidates': [{'content': {'parts': [{'inlineData': {'data': base64.b64encode(said.encode()).decode()}}]}}]}
v.post = post
v.encode = lambda pcm, out: pathlib.Path(out).write_bytes(pcm)
stand_in = types.ModuleType('gen_audio')
stand_in.transcribe = lambda path: 'українською'
stand_in.transcribe_en = lambda path: pathlib.Path(path).read_bytes().decode()
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

  it('the five Ukrainian voices stay five; Zephyr is the sixth, for English only', () => {
    const r = py('print(json.dumps([list(v.VOICES), list(v.EN_VOICES), list(v.EN_LOCAL), "British English" in v.EN_STYLE]))');
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out)).toEqual([['Puck', 'Charon', 'Sulafat', 'Leda', 'Orus'], ['Zephyr'], ['Isabella'], true]);
  });

  it('--dry-run counts the lines by voice, sends nothing, reads no key and writes nothing', () => {
    const dir = tree();
    rmSync(join(dir, 'key.env'));
    const r = run(dir, '--en', '--dry-run');
    expect(r.code, r.err).toBe(0);
    expect(r.lines[0]).toBe('2 of 2 English lines of Zephyr to record, model gemini-2.5-flash-preview-tts: pip_hi pip_red');
    expect(r.lines[1]).toBe("English lines by voice: Zephyr 2, Isabella 1 (Isabella is Kokoro's, never sent from here)");
    expect(r.sent).toEqual([]);
    expect(readdirSync(join(dir, 'public/en'))).toEqual(['wb_w_cat.mp3']);
    expect(existsSync(join(dir, 'voice/qa-en.json'))).toBe(false);
    expect(existsSync(join(dir, 'src/core/clips-en.json'))).toBe(false);
  });

  it('records only Zephyr, in British English, into public/en; hears it back in English; lists every clip of public/en', () => {
    const dir = tree();
    const r = run(dir, '--en');
    expect(r.code, r.err).toBe(0);
    expect(r.sent.map((s) => s.voice)).toEqual(['Zephyr', 'Zephyr']);
    for (const s of r.sent) expect(s.text).toMatch(/^Speak in clear, friendly British English[^\n]*\n\n/);
    expect(r.sent.map((s) => s.text.split('\n').at(-1))).toEqual(['Hello! I am Pip.', 'Red!']);
    expect(readFileSync(join(dir, 'public/en/wb_w_cat.mp3'), 'utf8'), 'the Kokoro clip is not touched').toBe('kokoro');
    expect(json(dir, 'src/core/clips-en.json')).toEqual(['pip_hi', 'pip_red', 'wb_w_cat']);
    const qa = json(dir, 'voice/qa-en.json');
    expect(Object.keys(qa)).toEqual(['pip_hi', 'pip_red']);
    expect(qa.pip_hi).toMatchObject({ text: 'Hello! I am Pip.', heard: 'Hello! I am Pip.', score: 1, style: 'en', voice: 'Zephyr' });
    // the Ukrainian list and its clips are not touched
    expect(existsSync(join(dir, 'public/voice'))).toBe(false);
    expect(existsSync(join(dir, 'voice/qa.json'))).toBe(false);
    // recorded once: a second run sends nothing
    expect(run(dir, '--en').sent).toEqual([]);
  });

  it('the new model takes the British style in a field of its own, not read aloud', () => {
    const r = run(tree(), '--en', '--model=new', '--only=pip_red');
    expect(r.code, r.err).toBe(0);
    expect(r.sent).toEqual([{ text: 'Red!', voice: 'Zephyr', style: expect.stringMatching(/^Speak in clear, friendly British English/) }]);
  });

  it('--only an Isabella line, an unknown line, or a voice that is neither: nothing is sent', () => {
    const local = run(tree(), '--en', '--only=wb_w_cat');
    expect(local.err).toContain('gen_voice: nothing was sent. These are lines of Isabella, recorded free with Kokoro, not here: wb_w_cat');
    const none = run(tree(), '--en', '--only=pip_whale');
    expect(none.err).toContain('gen_voice: nothing was sent. Not in voice/phrases-en.json: pip_whale');
    const puck = run(tree({ ...EN, odd: ['Hi.', 'en', 'Puck', 'hub'] }), '--en', '--dry-run');
    expect(puck.err).toContain('neither Zephyr nor Isabella: odd');
    for (const r of [local, none, puck]) { expect(r.code).not.toBe(0); expect(r.sent).toEqual([]); }
  });

  it('the real list: a dry run counts its lines by voice and reads no key (the paid Zephyr waits for the customer, R25)', () => {
    const out = execFileSync('python3', ['-I', '-B', join(root, 'tools/gen_voice.py'), '--en', '--dry-run'],
      { encoding: 'utf8', env: { ...process.env, ACADEMY_GEMINI_ENV: join(tmp, 'no-such.env') } });
    const rows = Object.values(JSON.parse(readFileSync(join(root, 'voice/phrases-en.json'), 'utf8')));
    const of = (v) => rows.filter((r) => r[2] === v).length;
    expect(of('Isabella')).toBeGreaterThan(0);
    expect(out.split('\n')[1]).toBe(`English lines by voice: Zephyr ${of('Zephyr')}, Isabella ${of('Isabella')} (Isabella is Kokoro's, never sent from here)`);
  });
});
