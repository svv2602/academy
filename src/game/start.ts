import { unlockAudio } from '../core/audio';
import { initInput } from '../core/input';
import { clearSave } from '../core/save';
import { initShop } from '../ui/shop';
import { el, initBook } from '../ui/ui';
import type { Game } from './context';
import { tour } from './flyover';
import { atPlay } from './stops';
import type { Gear } from './gear';
import type { BookInfo, WorldLines } from './world';

/**
 * The order of an entry into the world once "play" is pressed (R35): the opening scene of a new save, then the tour of
 * the world (src/game/flyover.ts: only for a world not visited yet - neither toured nor played in an earlier session),
 * then the game with the cat's first hint. The world's old welcome (`lines.intro`) is no longer said here.
 */
export async function enterWorld(g: Game, first: boolean): Promise<void> {
  // WORLD-13: the opening scene of a new save goes here, before the tour.
  await tour(g);
  if (first) void g.speech.line('go_next', 'hint', 6000);
  else await g.speech.line('welcome_back', 'hint', 5000);
}

/**
 * The start screen, the menus and the page events (ARCH-05). Called once the world is built and before the first frame:
 * the listeners keep the order they always had - audio.ts registers its own visibilitychange at import, so it runs first.
 * `lines`, `book` and `gear` are the world's: its welcome on a first launch, what the collection book shows, the
 * heroine's items (the shop screen of the book puts on what the save holds right here, before the first frame).
 * `applyLook` paints the save's dress and hair onto the heroine.
 */
export function initStartScreen(g: Game, o: {
  applyVolume(): void; applyPin(): void; applyLook(): void; lines: WorldLines; book: BookInfo; gear: Gear;
}): void {
  const { save, hero, cam, speech, persist, refreshHud } = g;
  el.loading.classList.add('hidden'); el.setup.classList.remove('hidden');
  el.restart.addEventListener('click', () => { clearSave(); location.reload(); });
  el.play.addEventListener('click', async () => {
    unlockAudio(); o.applyVolume();
    el.start.classList.add('hidden');
    el.hud.classList.remove('hidden'); el.btnJump.classList.remove('hidden');
    refreshHud();
    const first = !save.played;
    save.played = true; persist();
    cam.yaw = 0; cam.target.copy(hero.root.position);
    hero.once('Wave', 'Idle');
    await enterWorld(g, first);
    void atPlay(g);   // PLAY-08: the day of play is counted, then a stop point - at once, not when a chunk has loaded
  }, { once: true });
  // The shop and the fitting room (PLAY-04, PLAY-05): what she wears is the save's from the first frame on.
  const openShop = initShop(save, o.gear, {
    persist, refreshHud, applyLook: o.applyLook,
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
    reset: () => { clearSave(); location.reload(); },
    open: (v) => { g.paused = v; },
    shop: openShop,
  });
  initInput(el.canvas, el.joy, el.knob, el.btnJump, el.btnAct);
  el.bubble.addEventListener('click', speech.repeat);
  setInterval(persist, 10000);
  addEventListener('pagehide', persist);
  // The voice, the music and the effects pause and resume by themselves (audio.ts, TECH-05): a hidden page only saves.
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
}
