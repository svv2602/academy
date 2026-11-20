/** Synthesized SFX and a soft generative music bed; the queue of spoken lines is in src/core/voice.ts (re-exported here). */
import type { MusicParams } from '../game/world';
import { pauseVoice, resumeVoice, voiceVolume } from './voice';

export {
  CLIP_RETRIES, beginTask, borrowed, clipFor, dropped, endTask, inTask, mayStart, say, setCast, speaking, stopVoice, voiceLog,
  willSay,
  type Priority, type Spoken,
} from './voice';

let ctx: AudioContext | null = null;
let musicGain: GainNode, sfxGain: GainNode;
/** The page is hidden (TECH-05): sound is paused; src/core/voice.ts holds the lines until it is shown again. */
let hidden = false;

export const volume = { music: 0.5, sfx: 0.8, voice: 1 };
voiceVolume(() => volume.voice);

/**
 * The page is hidden (another app, a locked screen): the music and the effects stop with the audio context, the clip
 * pauses where it is and the synthesizer pauses. The line is not ended: whoever awaits it keeps waiting (TECH-05).
 */
function hide() {
  if (hidden) return;
  hidden = true;
  void ctx?.suspend();
  pauseVoice();
}

/** The page is shown again: everything goes on from where it stopped. */
function show() {
  if (!hidden) return;
  hidden = false;
  void ctx?.resume();
  resumeVoice();
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); else show(); });

export function unlockAudio() {
  if (ctx) { void ctx.resume(); return; }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  musicGain = ctx.createGain(); musicGain.gain.value = volume.music * 0.22; musicGain.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = volume.sfx * 0.5; sfxGain.connect(ctx.destination);
  startMusic();
}

function tone(freq: number, t0: number, dur: number, type: OscillatorType, peak: number, out: AudioNode) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  o.connect(g); g.connect(out);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

export function sfx(kind: 'pop' | 'chime' | 'good' | 'soft' | 'fanfare' | 'jump') {
  if (!ctx || hidden) return;                      // a hidden game makes no sound, not even later (TECH-05)
  const t = ctx.currentTime;
  const seq: Record<string, [number, number, number][]> = {
    pop: [[660, 0, 0.12]],
    jump: [[392, 0, 0.1], [523, 0.05, 0.14]],
    chime: [[1047, 0, 0.5], [1319, 0.08, 0.5], [1568, 0.16, 0.7]],
    good: [[784, 0, 0.25], [988, 0.1, 0.25], [1175, 0.2, 0.5]],
    soft: [[440, 0, 0.3], [392, 0.14, 0.4]],
    fanfare: [[523, 0, 0.4], [659, 0.15, 0.4], [784, 0.3, 0.4], [1047, 0.45, 0.9], [1319, 0.75, 1.2], [1568, 0.9, 1.6]],
  };
  for (const [f, at, dur] of seq[kind]) {
    tone(f, t + at, dur, 'sine', 0.5, sfxGain);
    tone(f * 2, t + at, dur * 0.6, 'triangle', 0.12, sfxGain);
  }
}

/** One bell note of `freq` Hz, as the music box's (a tap on a mushroom of the hub's ring): the voice of the effects. */
export function note(freq: number) {
  if (!ctx || hidden) return;
  const t = ctx.currentTime;
  tone(freq, t, 1.1, 'sine', 0.45, sfxGain);
  tone(freq * 2, t, 0.5, 'triangle', 0.1, sfxGain);
  tone(freq * 3, t, 0.25, 'sine', 0.05, sfxGain);
}

/** The notes of the world's music (`WorldDef.music`); null = the world has none and the bed stays silent. */
let music: MusicParams | null = null;
/** Fades out and takes apart the bed that plays now; null in silence. */
let stopBed: (() => void) | null = null;
/**
 * The world's music (ARCH-06): src/main.ts sets it before the first tap starts the sound. TECH-15: a change of world
 * sets it again - the bed that plays fades out at once (null leaves silence, the frame is closed), and the notes of
 * the new world start a bed of their own.
 */
export function setMusic(p: MusicParams | null) { music = p; stopBed?.(); stopBed = null; startMusic(); }
/** The notes of the bed that plays now, null in silence (window.__game.music reads it). */
export const musicPlaying = (): MusicParams | null => (stopBed ? music : null);

/** Slow bells over a quiet pad, on the notes of the world: endless, never repeats exactly, costs nothing to ship. */
function startMusic() {
  if (!ctx || !music || stopBed) return;
  const c = ctx;
  // Every note of this bed goes through `bed`: the notes already scheduled ahead fall silent with it.
  const bed = c.createGain(); bed.connect(musicGain);
  const delay = c.createDelay(1); delay.delayTime.value = 0.42;
  const fb = c.createGain(); fb.gain.value = 0.35;
  delay.connect(fb); fb.connect(delay); delay.connect(bed);
  const { scale, chords } = music;
  let next = c.currentTime + 0.3, bar = 0, idx = 4;
  const schedule = () => {
    // A late timer (a page in the background, a busy phone) never plays the notes it missed all at once: the tune
    // goes on from now (TECH-05).
    if (next < c.currentTime) next = c.currentTime + 0.05;
    while (next < c.currentTime + 1.5) {
      if (bar % 8 === 0) {
        for (const f of chords[(bar / 8) % chords.length]) {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0, next);
          g.gain.linearRampToValueAtTime(0.16, next + 1.5);
          g.gain.linearRampToValueAtTime(0, next + 4.6);
          o.connect(g); g.connect(bed); o.start(next); o.stop(next + 4.7);
        }
      }
      if (Math.random() < 0.62) {
        idx = Math.max(0, Math.min(scale.length - 1, idx + Math.floor(Math.random() * 5) - 2));
        tone(scale[idx], next, 1.4, 'sine', 0.3, bed);
        tone(scale[idx], next, 1.4, 'sine', 0.18, delay);
      }
      next += 0.55; bar++;
    }
  };
  schedule();
  const timer = setInterval(schedule, 400);
  stopBed = () => {
    clearInterval(timer);
    bed.gain.setValueAtTime(bed.gain.value, c.currentTime);
    bed.gain.linearRampToValueAtTime(0, c.currentTime + 0.3);
    setTimeout(() => { bed.disconnect(); delay.disconnect(); fb.disconnect(); }, 600);
  };
}

export function setVolumes() {
  if (!ctx) return;
  musicGain.gain.value = volume.music * 0.22;
  sfxGain.gain.value = volume.sfx * 0.5;
}
