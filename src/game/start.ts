import { inTask, speaking, unlockAudio } from '../core/audio';
import { initInput } from '../core/input';
import { applyControls } from '../core/tuning';
import { clearSave } from '../core/save';
import '../ui/session';   // PLAY-20: the cat's offer of a break joins the stop points (its card and the sleeping cat)
import { initShop } from '../ui/shop';
import { wearPetGear, type PetGearId } from './petgear';
import { achState } from '../ui/achieve';
import { el, initBook } from '../ui/ui';
import { firstDay, meet } from '../ui/welcome';   // PLAY-21: the cat's meeting on a new day
import type { Game } from './context';
import { tour } from './flyover';
import { atPlay } from './stops';
import { playStory, seenStories } from './story';
import { setPuzzleWorld } from './tasks/puzzle';
import { setCpaWorld } from './tasks/cpa';
import type { Gear } from './gear';
import type { BookInfo, WorldLines } from './world';

/**
 * The order of an entry into the world once "play" is pressed (R35): the opening scene of a new save (WORLD-13,
 * src/game/story.ts: the world's `story_intro`, once - a save already played has none), then the tour of the world
 * (src/game/flyover.ts: only for a world not visited yet - neither toured nor played in an earlier session), then the
 * game with the cat's first hint - "run after the sparkles to a new friend", so only in a world with characters (the hub
 * has none, R5). The world's old welcome (`lines.intro`) is no longer said here.
 */
export async function enterWorld(g: Game, first: boolean, via: 'launch' | 'travel' = 'launch'): Promise<void> {
  if (first) await playStory(g, 'story_intro');
  await tour(g);
  if (first) {
    firstDay(g);   // PLAY-21: the first day is marked, no star
    if (g.world.characters?.length) void g.speech.line('go_next', 'hint', 6000);
  } else if (via === 'launch') await meet(g);   // PLAY-21: hello and the star of a new day, else welcome back (src/ui/welcome.ts)
  // Back from another world a moment ago (a change of world): no meeting, no "welcome back" - she has not been away.
  // The world's own word comes now; on a launch it waits for the stop point of "Play" (`sayLeft` after `atPlay`), or
  // an achievement's scene there would cut it off.
  else sayLeft(g);
}

/** How many frames at rest with no card `sayLeft` waits for silence at most (about 20 s); then a tap on the cat says it. */
export const LEFT_WAIT_FRAMES = 1200;
/** m: she has walked off on her own this far - the word comes too late, a tap on the cat still says it. */
export const LEFT_GONE_M = 2;

/** What `sayLeft` watches, each frame: an achievement's card or scene on screen, the game quiet, the heroine gone on. */
export interface LeftWatch { held(): boolean; quiet(): boolean; gone(): boolean }

/** The game's own: the card of an achievement (its scene), a line sounding or the game busy, she walked or a task opened. */
export function leftWatch(g: Game): LeftWatch {
  const at = g.hero.root.position.clone();
  return {
    held: () => achState.scene !== null || !el.fanfare.classList.contains('hidden'),
    quiet: () => !speaking() && !g.busy,
    gone: () => inTask() || g.hero.root.position.distanceTo(at) > LEFT_GONE_M,
  };
}

/**
 * The world's own word for where she stopped, as she comes in again (WorldDef.left; the first world: the Great Tree
 * calls, R28; the hub: the other worlds still sleep). None - nothing is said. It is a hint, and the planner turns a hint
 * away while another line sounds (src/core/voice.ts `willSay`): after the stop point of "Play" the line of an
 * achievement's card still sounded and "the Great Tree calls" was lost. So it waits, frame by frame: with no limit
 * while an achievement's card or scene is on screen (it ends when the child taps "Далі", however long that takes),
 * then for the game quiet - for LEFT_WAIT_FRAMES at most. It gives up when the child has gone on by herself (walked off
 * LEFT_GONE_M or a task opened): the word would come too late, and a tap on the cat says it.
 */
export function sayLeft(g: Game, watch: LeftWatch = leftWatch(g),
  next: (fn: () => void) => void = (fn) => { requestAnimationFrame(fn); }): void {
  const left = g.world.left?.(g.ws, g.save, 'entry');
  if (!left) return;
  let frames = 0;
  const go = () => {
    if (watch.gone()) return;
    if (watch.held()) { next(go); return; }
    if (watch.quiet()) { void g.speech.line(left, 'hint', 6000); return; }
    if (++frames < LEFT_WAIT_FRAMES) next(go);
  };
  go();
}

/**
 * The start screen, the menus and the page events (ARCH-05). Called once the world is built and before the first frame:
 * the listeners keep the order they always had - audio.ts registers its own visibilitychange at import, so it runs first.
 * `lines`, `book` and `gear` are the world's: its welcome on a first launch, what the collection book shows, the
 * heroine's items (the shop screen of the book puts on what the save holds right here, before the first frame).
 * `applyLook` paints the save's dress and hair onto the heroine. `launched` is the world the game was launched in
 * (src/main.ts, src/game/world.ts `launchWorld`): "play" makes it the one where she stopped (WORLD-01), and when the
 * world where she had stopped was refused at the launch, the cat says why once the entry is over (R17).
 */
export function initStartScreen(g: Game, o: {
  applyVolume(): void; applyPin(): void; applyLook(): void; lines: WorldLines; book: BookInfo; gear: Gear;
  launched: { world: string; refused: boolean; refuse(): void };
}): void {
  const { save, hero, cam, speech, persist, refreshHud } = g;
  // the puzzle cuts the frames of the world played, of a story only once she has seen it there (LEARN-19)
  setPuzzleWorld(() => g.world.id, (world, story) => g.save.worlds?.[world]?.flags?.[story] === true);
  // the number tasks are drawn by the step of the world played (things, picture, numbers: src/game/tasks/cpa.ts)
  setCpaWorld(() => g.world.id, () => Object.keys(g.save.worlds ?? {}));
  el.loading.classList.add('hidden'); el.setup.classList.remove('hidden');
  el.restart.addEventListener('click', () => { clearSave(); location.reload(); });
  el.play.addEventListener('click', async () => {
    unlockAudio(); o.applyVolume();
    el.start.classList.add('hidden');
    el.hud.classList.remove('hidden'); el.btnJump.classList.remove('hidden');
    refreshHud();
    const first = !save.played;
    save.played = true; save.lastWorld = o.launched.world; persist();
    cam.yaw = 0; cam.target.copy(hero.root.position);
    hero.once('Wave', 'Idle');
    await enterWorld(g, first);
    if (o.launched.refused) o.launched.refuse();
    // PLAY-08: the day of play is counted, then a stop point - at once, not when a chunk has loaded; the world's own word
    // for where she stopped after it, so an achievement's scene at the point does not cut it off
    void atPlay(g).then(() => { if (!first) sayLeft(g); });
  }, { once: true });
  // The shop and the fitting room (PLAY-04, PLAY-05): what she wears is the save's from the first frame on.
  const openShop = initShop(save, o.gear, {
    persist, refreshHud, applyLook: o.applyLook,
    // the things of the cat and the fawn (src/game/petgear.ts), hung under their bones
    wearPet: (pet, id) => wearPetGear(g.petGear, pet, id as PetGearId | null),
    // The cat's line of the game gives way to the shop's own (the card would cover its bubble).
    pause: (v) => { g.paused = v; if (v) g.speech.caption(null); },
    // Close up, and the picture moves over so that the heroine stands on the free side of the card: left of it, or
    // above it when the screen stands upright (the card then lies at the bottom).
    closeup: (d) => {
      g.camOverride = d;
      const { camera } = g, w = innerWidth, h = innerHeight;
      if (d === null) camera.clearViewOffset();
      else if (w > h * 1.25) camera.setViewOffset(w, h, w * 0.24, 0, w, h);
      else camera.setViewOffset(w, h, 0, h * 0.2, w, h);
    },
  });
  initBook(save, o.book, {
    change: () => { o.applyVolume(); o.applyPin(); persist(); },
    // PLAY-22: the controls the parent chose apply at once (what the debug panel changed gives way to them)
    controls: () => { applyControls(save.controls); persist(); },
    reset: () => { clearSave(); location.reload(); },
    open: (v) => { g.paused = v; },
    shop: openShop,
    // the world's cut-scenes already seen (WORLD-13): shown again from the book, nothing recorded
    stories: () => seenStories(g).map((s) => ({ id: s.id, icon: s.icon, title: s.title, play: () => { void playStory(g, s.id, { record: false }); } })),
  });
  initInput(el.canvas, el.joy, el.knob, el.btnJump, el.btnAct);
  el.bubble.addEventListener('click', speech.repeat);
  setInterval(persist, 10000);
  addEventListener('pagehide', persist);
  // The voice, the music and the effects pause and resume by themselves (audio.ts, TECH-05): a hidden page only saves.
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
}
