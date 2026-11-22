/**
 * The picture of a kind of find wherever it is shown (the book's collections, the cauldron): its emoji, gilded for a
 * golden kind (the feather of the Great Tree is a feather like the fairy world's, but golden - one picture a child knows,
 * not a sparkle she cannot read).
 */
import { COLLECT_KINDS, type CollectKind } from '../game/collections';
import './finds.css';

/**
 * The drawn pictures of the kinds that have no emoji (COLLECT_KINDS `svg`): an em high, as an emoji beside them.
 * A spruce cone: its scales in rows, darker at their edges, a short stalk.
 */
const DRAWN: Record<string, string> = {
  cone: '<svg viewBox="0 0 20 28" width="0.72em" height="1em" aria-hidden="true">'
    + '<path d="M10 1 L12 3.5 L8 3.5 Z" fill="#6b4122"/>'
    + '<ellipse cx="10" cy="15" rx="7.5" ry="12" fill="#a8683a"/>'
    + [6, 10, 14, 18, 22].map((y, i) => `<path d="M${3.5 + (i % 2)} ${y} Q10 ${y + 4} ${16.5 - (i % 2)} ${y}" fill="none" stroke="#6b4122" stroke-width="1.4"/>`).join('')
    + '<path d="M10 4 V26" stroke="#6b4122" stroke-width="0.8" opacity="0.5"/></svg>',
};

/** The markup of the picture of `kind`. */
export function findIcon(kind: CollectKind): string {
  const k = COLLECT_KINDS[kind] as { icon: string; svg?: string; gold?: boolean };
  return `<span class="find-ic${k.gold ? ' gold' : ''}">${k.svg ? DRAWN[k.svg] ?? '' : k.icon}</span>`;
}
