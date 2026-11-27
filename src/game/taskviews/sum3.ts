/**
 * The panel show of three addends (LEARN-27): three groups - each its number over its things in a small ten frame -
 * with "+" between them, then "=", "?" and the answer numbers. The things are pictures, not buttons: nothing of a
 * group takes a tap. Drawn by `wide.css`.
 */
import { sum3, type Sum3Spec } from '../tasks/sum3';
import { el, options, pulseOf, type PanelCtx } from './panel';
import { fillTen, tenFrames } from './tenframe';
import { hintOf } from './flow';
import './wide.css';

/**
 * The order the second rung goes through the groups (h2_add_cross: "first up to ten, then some more"): the frame it
 * fills up to ten, then the groups whose things move into it or are counted on. With two numbers that make ten - the
 * larger of the two, the other one (the frame is full: ten), then the third. Without such a pair - the largest number,
 * then the other two as they stand. Of two equal numbers the one that stands first.
 */
export function fillOrder(spec: Sum3Spec): [number, number, number] {
  const { parts, ten } = spec.body, places = [0, 1, 2];
  const larger = (among: readonly number[]) => among.reduce((best, i) => (parts[i] > parts[best] ? i : best));
  if (ten) { const first = larger(ten), second = ten[0] === first ? ten[1] : ten[0]; return [first, second, 3 - first - second]; }
  const first = larger(places), rest = places.filter((i) => i !== first);
  return [first, rest[0], rest[1]];
}

export function sum3View(spec: Sum3Spec, c: PanelCtx) {
  const st = sum3.start(spec), { parts, thing, tilt } = spec.body;
  const q = el('span', 'sign q', '?');
  let at = 0;
  const groups = parts.map((n) => {
    const box = el('div', 'group framed');
    const things = tilt.slice(at, at += n).map((r) => { const t = el('span', 'it', thing); t.style.setProperty('--r', `${r}deg`); return t; });
    box.appendChild(el('b', 'n', String(n)));
    tenFrames(box, things, true);
    return { box, things };
  });
  c.stage.append(groups[0].box, el('span', 'sign', '+'), groups[1].box, el('span', 'sign', '+'), groups[2].box, el('span', 'sign', '='), q);
  const ok = options(c, spec.body.options, (v) => sum3.answer(spec, st, v) === 'right', { at: () => q, row: () => [...c.stage.children] as HTMLElement[] });
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    fillTen: () => {
      const [first, second, third] = fillOrder(spec);
      const frame = groups[first].box.querySelector<HTMLElement>('.tf');
      if (frame) void fillTen(c, frame, parts[first], [...groups[second].things, ...groups[third].things]);
    },
  });
}
