/**
 * The picture of a kind of find wherever it is shown (the book's collections, the cauldron): its emoji, gilded for a
 * golden kind (the feather of the Great Tree is a feather like the fairy world's, but golden - one picture a child knows,
 * not a sparkle she cannot read).
 */
import { COLLECT_KINDS, type CollectKind } from '../game/collections';
import type { WordId } from '../s2/types';
import { PEBBLE, WORD_COLOUR, WORD_COUNT, WORD_EMOJI } from '../s2/word-pictures';
import './finds.css';

/**
 * The drawn pictures of the kinds that have no emoji (COLLECT_KINDS `svg`): an em high, as an emoji beside them.
 * A spruce cone: its scales in rows, darker at their edges, a short stalk. A jelly sweet: a green dome sugared with
 * white grains, a yellow one peeping from behind it.
 */
const DRAWN: Record<string, string> = {
  cone: '<svg viewBox="0 0 20 28" width="0.72em" height="1em" aria-hidden="true">'
    + '<path d="M10 1 L12 3.5 L8 3.5 Z" fill="#6b4122"/>'
    + '<ellipse cx="10" cy="15" rx="7.5" ry="12" fill="#a8683a"/>'
    + [6, 10, 14, 18, 22].map((y, i) => `<path d="M${3.5 + (i % 2)} ${y} Q10 ${y + 4} ${16.5 - (i % 2)} ${y}" fill="none" stroke="#6b4122" stroke-width="1.4"/>`).join('')
    + '<path d="M10 4 V26" stroke="#6b4122" stroke-width="0.8" opacity="0.5"/></svg>',
  marmalade: '<svg viewBox="0 0 28 24" width="1.15em" height="1em" aria-hidden="true">'
    + '<path d="M13 20 Q13 6 20.5 6 Q28 6 28 20 Z" fill="#ffd84a"/>'
    + '<path d="M1 22 Q1 4 11 4 Q21 4 21 22 Z" fill="#7bd36a"/>'
    + '<path d="M4 20 Q4.5 8 10 7" fill="none" stroke="#c8f2bd" stroke-width="1.6" stroke-linecap="round"/>'
    + [[8, 12], [13, 9], [15, 15], [9, 18], [17, 19]].map(([x, y]) => `<rect x="${x}" y="${y}" width="1.4" height="1.4" fill="#ffffff" opacity="0.9"/>`).join('')
    + '</svg>',
  // the apple of the Sweet Land's page (wordbook §1, the one word with no picture in the game): red, a leaf, a stalk
  apple: '<svg viewBox="0 0 24 26" width="0.92em" height="1em" aria-hidden="true">'
    + '<path d="M12 7 Q6 3 3 8 Q0 14 4 20 Q7 25 12 23 Q17 25 20 20 Q24 14 21 8 Q18 3 12 7 Z" fill="#e8413a"/>'
    + '<path d="M6 10 Q5 13 6 16" fill="none" stroke="#ff9a8f" stroke-width="1.6" stroke-linecap="round"/>'
    + '<path d="M12 7 Q12 3 14 1" fill="none" stroke="#6b4122" stroke-width="1.6" stroke-linecap="round"/>'
    + '<path d="M13 4 Q17 0 21 3 Q17 6 13 4 Z" fill="#5cbf4a"/></svg>',
};

/** The markup of the picture of `kind`. */
export function findIcon(kind: CollectKind): string {
  const k = COLLECT_KINDS[kind] as { icon: string; svg?: string; gold?: boolean };
  return `<span class="find-ic${k.gold ? ' gold' : ''}">${k.svg ? DRAWN[k.svg] ?? '' : k.icon}</span>`;
}

/** The markup of the picture of the word `id` of the book. */
export function wordIcon(id: WordId): string {
  if (id === 'apple') return `<span class="word-ic">${DRAWN.apple}</span>`;
  const colour = WORD_COLOUR[id];
  if (colour) return `<span class="word-ic patch" style="--c:${colour}"></span>`;
  const n = WORD_COUNT[id];
  if (n) return `<span class="word-ic many" data-n="${n}">${(n <= 3 ? PEBBLE : DRAWN.cone.replace('0.72em', '0.36em').replace('height="1em"', 'height="0.5em"')).repeat(n)}</span>`;
  return `<span class="word-ic">${WORD_EMOJI[id] ?? '❔'}</span>`;
}
