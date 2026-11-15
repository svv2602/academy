import { unlockAudio } from '../core/audio';
import { initInput } from '../core/input';
import { clearSave } from '../core/save';
import { el, initBook } from '../ui/ui';
import type { Game } from './context';
import type { WorldLines } from './world';

/**
 * The start screen, the menus and the page events (ARCH-05). Called once the world is built and before the first frame:
 * the listeners keep the order they always had - audio.ts registers its own visibilitychange at import, so it runs first.
 * `lines` are the world's: its welcome on a first launch.
 */
export function initStartScreen(g: Game, o: { applyVolume(): void; applyPin(): void; lines: WorldLines }): void {
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
    if (first) { if (o.lines.intro) await speech.line(o.lines.intro, 'story'); void speech.line('go_next', 'hint', 6000); }
    else await speech.line('welcome_back', 'hint', 5000);
  }, { once: true });
  initBook(save, {
    change: () => { o.applyVolume(); o.applyPin(); persist(); },
    reset: () => { clearSave(); location.reload(); },
    open: (v) => { g.paused = v; },
  });
  initInput(el.canvas, el.joy, el.knob, el.btnJump, el.btnAct);
  el.bubble.addEventListener('click', speech.repeat);
  setInterval(persist, 10000);
  addEventListener('pagehide', persist);
  // The voice, the music and the effects pause and resume by themselves (audio.ts, TECH-05): a hidden page only saves.
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
}
