/**
 * The picture of a kind of find wherever it is shown (the book's collections, the cauldron): its emoji, gilded for a
 * golden kind (the feather of the Great Tree is a feather like the fairy world's, but golden - one picture a child knows,
 * not a sparkle she cannot read).
 */
import { COLLECT_KINDS, type CollectKind } from '../game/collections';
import './finds.css';

/** The markup of the picture of `kind`. */
export function findIcon(kind: CollectKind): string {
  const k = COLLECT_KINDS[kind] as { icon: string; gold?: boolean };
  return `<span class="find-ic${k.gold ? ' gold' : ''}">${k.icon}</span>`;
}
