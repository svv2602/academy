/** The panel show of "compare" (ARCH-09): two groups to tap, and between them the wordless mark of the question. */
import { compare, type CompareSpec } from '../tasks/compare';
import { el, items, pulseOf, tap, type PanelCtx } from './panel';
import { hintOf } from './flow';

export function compareView(spec: CompareSpec, c: PanelCtx) {
  const st = compare.start(spec), { thing, groups: sizes, tilt, more } = spec.body;
  const groups = sizes.map((_, i) => { const g = el('button', 'group pickable'); items(g, thing, tilt[i], 'still'); c.stage.appendChild(g); return g; });
  // The question without words, from the start: a dot that keeps growing ("more") or shrinking ("less").
  // It sits between the groups and depends on the question alone, so it never points at the right group.
  const ask = el('span', 'ask ' + (more ? 'more' : 'less')); ask.setAttribute('aria-hidden', 'true'); ask.appendChild(el('b'));
  c.stage.insertBefore(ask, groups[1]);
  const right = compare.solution(spec, st)[0];
  groups.forEach((g, i) => tap(g, () => { if (compare.answer(spec, st, i as 0 | 1) === 'right') { g.classList.add('yes'); c.right(); } else { g.classList.add('no'); c.wrong(g); } }));
  c.cheat = () => groups[right].dispatchEvent(new PointerEvent('pointerdown'));
  // With the numbers, the right group does what the dot of the question does: its things grow or shrink.
  c.hint = hintOf(spec.hint, pulseOf(groups[right]), {
    showNumbers: () => groups.forEach((g, i) => { g.querySelector('em')?.remove(); g.appendChild(el('em', '', String(sizes[i]))); }),
    grow: () => groups[right].classList.add('grow'),
    shrink: () => groups[right].classList.add('shrink'),
  });
}
