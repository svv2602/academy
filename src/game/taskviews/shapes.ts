/**
 * Simple figures for the logic tasks from level 4 on (odd by shape or size, two features, sorting by colour and shape):
 * a circle, a triangle or a square of one of the gem colours, drawn as inline SVG, so no style sheet is needed. The box
 * is always 1em: a small figure is drawn at half size inside the same box, so its button stays as big as the others
 * (at least 44 x 44) and the difference in size is seen, not guessed.
 */
import { figureOf, type FigColor, type FigShape } from '../tasks/odd';

/** The gem colours of `style.css` (`.gem.red` ...), a shade darker for the outline. */
export const FILL: Record<FigColor, [string, string]> = {
  red: ['#ff6b81', '#d9405a'], blue: ['#5cb8ff', '#2f86c9'], yellow: ['#ffd24d', '#d9a400'], green: ['#6fd68a', '#3aa857'],
};
const NS = 'http://www.w3.org/2000/svg';

/** The outline of a shape in a 100 x 100 box, scaled by `k` about the centre (1 = big, 0.5 = small). */
function path(shape: FigShape, k: number) {
  const r = 44 * k, c = 50;
  if (shape === 'circle') return `M${c - r},${c}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0z`;
  if (shape === 'square') return `M${c - r * 0.86},${c - r * 0.86}h${r * 1.72}v${r * 1.72}h${-r * 1.72}z`;
  return `M${c},${c - r}L${c + r},${c + r * 0.8}H${c - r}z`;
}

/** The figure of `key` ("red circle", "blue square small") as an SVG element, 1em square. */
export function shapeEl(key: string, size = '1em') {
  const { color, shape, small } = figureOf(key), [fill, line] = FILL[color];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.fig = key;
  svg.style.display = 'block';
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', path(shape, small ? 0.5 : 1));
  p.setAttribute('fill', fill); p.setAttribute('stroke', line); p.setAttribute('stroke-width', '6'); p.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(p);
  return svg;
}
