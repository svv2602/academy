// Runs in `npm test`. The loudness of the recorded voice (tools/voice_loudness.py, decision of the customer 2026-11-20):
// every clip of the repository at -18 LUFS within 1 LU, its true peak at most -1.5 dBTP.
// 1. Without ffmpeg: voice/loudness.json holds a measure for every clip and for nothing else, the measure is of the very
//    file (sha256), and it is within the range. A clip added or changed without levelling fails here, by its name.
// 2. With ffmpeg (skipped where it is not installed): the record is true to the files, and the levelling itself - a
//    line of the voice service levelled from its PCM, a clip levelled in place, a second run that changes nothing.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = -18, WITHIN = 1, PEAK = -1.5;
const FIX = 'Level it: python3 tools/voice_loudness.py --write --only=<path> (tools/gen_voice.py levels a new recording itself).';
const record = JSON.parse(readFileSync(join(root, 'voice/loudness.json'), 'utf8'));
const clips = [...new Set(['public/voice/**/*.mp3', 'public/bank/**/*.mp3', 'worlds-test/*/voice/**/*.mp3']
  .flatMap((p) => globSync(p, { cwd: root })).map((p) => p.split('\\').join('/')))].sort();
const sha = (path) => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
// One line in the log of every run: whether the measures were also checked against the files here.
console.log(`[voice-loudness] ffmpeg: ${ffmpeg ? 'yes, three clips measured again and the levelling tried' : 'no, the measuring again is skipped (the record and its hashes are checked)'}`);
const tmp = mkdtempSync(join(tmpdir(), 'loudness-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Python with tools/voice_loudness.py imported; prints what `code` prints. */
const py = (code) => execFileSync('python3', ['-I', '-B', '-c', `import sys, json\nsys.path.insert(0, ${JSON.stringify(join(root, 'tools'))})\nimport voice_loudness as L\n${code}`], { encoding: 'utf8' });

describe('voice/loudness.json: the measure of every clip', () => {
  it('lists every clip of public/voice, public/bank and the test worlds, and nothing else', () => {
    expect(clips.length).toBeGreaterThan(600);
    expect(Object.keys(record).filter((p) => !clips.includes(p)), 'measures of clips that are gone').toEqual([]);
    expect(clips.filter((p) => !(p in record)), `clips without a measure. ${FIX}`).toEqual([]);
  });

  it('each measure is of the file as it is now (sha256)', () => {
    expect(clips.filter((p) => record[p] && record[p].sha256 !== sha(p)), `clips changed since they were levelled. ${FIX}`).toEqual([]);
  });

  it(`every clip is at ${TARGET} LUFS within ${WITHIN} LU, its true peak at most ${PEAK} dBTP`, () => {
    const out = Object.entries(record).filter(([, m]) => Math.abs(m.lufs - TARGET) > WITHIN || m.tp > PEAK)
      .map(([p, m]) => `${p}: ${m.lufs} LUFS, ${m.tp} dBTP`);
    expect(out, FIX).toEqual([]);
  });
});

describe.skipIf(!ffmpeg)('the levelling itself (ffmpeg)', { timeout: 120_000 }, () => {
  it('the record is true: three clips measured again give their recorded numbers', () => {
    const some = [clips[0], clips[Math.floor(clips.length / 2)], clips.at(-1)];
    const got = JSON.parse(py(`print(json.dumps({p: L.levels(L.measure(L.ROOT / p)) for p in ${JSON.stringify(some)}}))`));
    for (const p of some) {
      expect(Math.abs(got[p][0] - record[p].lufs), p).toBeLessThan(0.05);
      expect(Math.abs(got[p][1] - record[p].tp), p).toBeLessThan(0.05);
    }
  });

  it('a quiet line with a sharp peak is levelled from its PCM, once into MP3; in place it is left as it is', () => {
    // two seconds of a quiet tone with one loud click of 3 ms
    const out = join(tmp, 'line.mp3');
    const r = JSON.parse(py(`
import subprocess
pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 'lavfi', '-i',
                      "aevalsrc='0.05*sin(2*PI*300*t)+0.9*between(t,1,1.003)*sin(2*PI*3000*t)':s=24000:d=2",
                      '-f', 's16le', '-ar', '24000', '-ac', '1', '-'], capture_output=True, check=True).stdout
before = L.levels(L.measure_raw(pcm))
after = L.levels(L.level_pcm(pcm, ${JSON.stringify(out)}))
again, m = L.level_file(${JSON.stringify(out)})
print(json.dumps({'before': before, 'after': after, 'again': again, 'rate': L.bitrate(${JSON.stringify(out)})}))`));
    // -26 LUFS with a click near 0 dBFS: one gain of +8 dB alone would put the click far over the peak
    expect(r.before[0]).toBeLessThan(-24);
    expect(r.before[1] + (TARGET - r.before[0])).toBeGreaterThan(PEAK + 5);
    expect(Math.abs(r.after[0] - TARGET)).toBeLessThanOrEqual(0.3);
    expect(r.after[1]).toBeLessThanOrEqual(PEAK);
    expect(r.again).toBe(false);          // a second run changes nothing
    expect(r.rate).toBe('32k');
  });

  it('tools/gen_voice.py encodes a recording through it: levelled, and noted for voice/loudness.json', () => {
    const out = join(tmp, 'rec.tmp.mp3');
    const r = JSON.parse(execFileSync('python3', ['-I', '-B', '-c', `import sys, json, subprocess
sys.path.insert(0, ${JSON.stringify(join(root, 'tools'))})
import gen_voice as v, voice_loudness as L
pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-af', 'volume=0.5',
                      '-f', 's16le', '-ar', '24000', '-ac', '1', '-'], capture_output=True, check=True).stdout
v.encode(pcm, ${JSON.stringify(out)})
print(json.dumps({'m': L.levels(L.measure(${JSON.stringify(out)})), 'noted': sorted(v.LEVELED)}))`], { encoding: 'utf8' }));
    expect(Math.abs(r.m[0] - TARGET)).toBeLessThanOrEqual(0.3);
    expect(r.m[1]).toBeLessThanOrEqual(PEAK);
    expect(r.noted).toEqual([join(tmp, 'rec')]);
  });
});
