/**
 * The panel show of a problem in two actions told in pictures (LEARN-27): three pictures in a row with an arrow
 * between them - how many there were; then the ones that came (a picture with a sparkle, lit) or the ones that went
 * away (greyed out and crossed, as in take away); then the other of the two. No example is written: the child reads
 * the story off the pictures. The things are pictures, not buttons. Drawn by `wide.css`.
 */
import { story, type StorySpec } from '../tasks/story';
import { el, options, pulseOf, type PanelCtx } from './panel';
import { tenFrames } from './tenframe';
import { runOn } from './chain';
import { hintOf } from './flow';
import './wide.css';

export function storyView(spec: StorySpec, c: PanelCtx) {
  const st = story.start(spec), { first, addsFirst, second, third, mid, thing, tilt } = spec.body;
  let at = 0;
  /** A picture of `n` things: what there was, what came, or what went away. */
  const scene = (n: number, kind: 'was' | 'came' | 'went') => {
    const box = el('div', `scene ${kind}`);
    const things = tilt.slice(at, at += n).map((r) => { const t = el('span', kind === 'went' ? 'it gone' : 'it', thing); t.style.setProperty('--r', `${r}deg`); return t; });
    tenFrames(box, things, true);
    return { box, things };
  };
  const scenes = [scene(first, 'was'), scene(second, addsFirst ? 'came' : 'went'), scene(third, addsFirst ? 'went' : 'came')];
  const then = () => el('span', 'then', '→');
  c.stage.append(scenes[0].box, then(), scenes[1].box, then(), scenes[2].box);
  const ok = options(c, spec.body.options, (v) => story.answer(spec, st, v) === 'right');
  let example: HTMLElement | null = null;
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    // Rung 2 (h2_chain), first: the story written out as an example in numbers, under the pictures
    showExample: () => {
      example?.remove(); c.stage.querySelector('.brk')?.remove();
      example = el('div', 'group example');
      const sign = (adds: boolean) => el('span', 'sign', adds ? '+' : '−');
      example.append(el('span', 'sign n', String(first)), sign(addsFirst), el('span', 'sign n', String(second)), sign(!addsFirst), el('span', 'sign n', String(third)));
      c.stage.append(el('span', 'brk'), example);
    },
    // then: the number after the first action over the example, the first two pictures marked as done, and the second
    // action on the things of the third picture, one by one, the number going on with it
    showMid: () => {
      if (!example) return;
      example.querySelector('em')?.remove();
      const em = el('em');
      example.appendChild(em);
      scenes[0].box.classList.add('done'); scenes[1].box.classList.add('done');
      void runOn(c, em, mid, !addsFirst, third, (i) => { scenes[2].things[i - 1].classList.add('hit'); });
    },
  });
}
