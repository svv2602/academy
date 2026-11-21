/**
 * The picture of a world's pieces come alive (PLAY-29, the customer's word of 2026-11-21: no stars for it - the picture
 * coming alive is the reward): over the game, the whole frame of the world's story in a golden frame, slowly moving in
 * as the story's frames move (a drift and a zoom, src/game/story.ts), little lights twinkling over it. A tap anywhere
 * closes it. Shown when the last piece is taken, and again from the book (its tab "Картинки").
 */
import type { Picture } from '../game/collections';
import './picture.css';

/** What the walkthrough reads (?debug): whether the picture is shown, and which. */
export const pictureView: { open: boolean; image: string | null } = { open: false, image: null };

/** Shows `pic` whole and alive; a tap closes it. */
export function showPicture(pic: Picture): void {
  let root = document.getElementById('pictureAlive');
  if (!root) { root = document.createElement('div'); root.id = 'pictureAlive'; document.body.appendChild(root); }
  root.className = '';
  root.innerHTML = '';
  const frame = document.createElement('div'), img = document.createElement('div');
  frame.className = 'pa-frame'; img.className = 'pa-img';
  img.style.backgroundImage = `url("${import.meta.env.BASE_URL}${pic.image}.webp")`;
  frame.appendChild(img);
  // the lights: a dozen, each at its place and pace (no chance: the same picture is the same every time)
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('i');
    s.style.left = `${8 + ((i * 37) % 84)}%`; s.style.top = `${10 + ((i * 53) % 76)}%`; s.style.animationDelay = `${(i % 6) * 0.35}s`;
    frame.appendChild(s);
  }
  root.appendChild(frame);
  pictureView.open = true; pictureView.image = pic.image;
  root.addEventListener('click', () => { root!.className = 'hidden'; root!.innerHTML = ''; pictureView.open = false; pictureView.image = null; }, { once: true });
}
