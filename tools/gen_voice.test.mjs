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

describe('tools/gen_voice.py: the service\'s rate limits (VOICE-14)', () => {
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

describe('tools/gen_voice.py: the voice and the model of a request (VOICE-10, R33)', () => {
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

describe('recorded clips', () => {
  const phrases = JSON.parse(readFileSync(join(root, 'voice/phrases.json'), 'utf8'));
  const qa = JSON.parse(readFileSync(join(root, 'voice/qa.json'), 'utf8'));
  const clips = JSON.parse(readFileSync(join(root, 'src/core/clips.json'), 'utf8'));
  const HOW = 'Record it: python3 tools/gen_voice.py (paid service, the key is in ~/.config/academy/gemini.env).';

  // A line's clip is in public/voice (the first load, listed in clips.json) or in public/bank (the bank of the old game,
  // VOICE-07: imported, marked `from` in voice/qa.json, never listed in clips.json - the game does not ask for it yet).
  const inBank = (key) => existsSync(join(root, 'public/bank', `${key}.mp3`));
  const hasClip = (key) => (inBank(key) ? !clips.includes(key) && !!qa[key]?.from : existsSync(join(root, 'public/voice', `${key}.mp3`)) && clips.includes(key));

  // VOICE-10: the voices of the characters are listed for recording (`<key>@<voice>`) before they are recorded. Until
  // the runner records a voice, its lines may lack their clip - while the cat's clip of the same key is up to date, so
  // the game plays that one (src/core/voice.ts `clipFor`). After the recording the runner empties this list; the
  // build for main (pages.yml) fails while anything is left in it.
  // Recorded 2026-11-17: Charon, Sulafat, Leda, Orus. A new voice of a later world waits here until it is recorded.
  const AWAITING = [];
  // VOICE-14: every clip says which model and which voice made it; the voice is the one its key names.
  const MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-tts'];
  const voiceOf = (key) => (key.includes('@') ? key.split('@')[1] : 'Puck');
  const upToDate = (key, text, style) => hasClip(key) && qa[key]?.text === text && qa[key]?.style === style
    && MODELS.includes(qa[key]?.model) && qa[key]?.voice === voiceOf(key);
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
    const low = Object.keys(phrases).filter((key) => !waits(key) && !(qa[key]?.score >= 0.85)).map((key) => `${key} ${qa[key]?.score}`);
    expect(low, `clips that do not sound like their text: ${low.join(', ')}. ${HOW}`).toEqual([]);
  });

  it('src/core/clips.json lists exactly the files of public/voice', () => {
    const files = readdirSync(join(root, 'public/voice')).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort();
    expect(clips, 'clips.json and the .mp3 files of public/voice differ (python3 tools/gen_voice.py rewrites the list)').toEqual(files);
    expect(readdirSync(join(root, 'public/voice')).filter((f) => !f.endsWith('.mp3') || f.endsWith('.tmp.mp3')), 'stray files in public/voice').toEqual([]);
  });
});
