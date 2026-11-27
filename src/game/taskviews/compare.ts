/**
 * The panel show of "compare" (ARCH-09): two groups to tap, and between them the wordless mark of the question.
 * From level 4 a group is a number written in digits (up to 20); its hint shows the number as dots, in rows of ten.
 */
import { compare, type CompareSpec } from '../tasks/compare';
import { el, items, pulseOf, tap, type PanelCtx } from './panel';
import { hintOf } from './flow';
import './twenty.css';
import { cpaOf } from '../tasks/cpa';
import { markStep } from './cpa';
import './cpa.css';

/** `n` dots in rows of ten, under the digits of a group: "count here and here" for numbers written as digits. */
function dots(n: number) {
  const row = el('span', 'dots');
  for (let k = 0; k < n; k++) row.appendChild(el('span'));
  return row;
}

export function compareView(spec: CompareSpec, c: PanelCtx) {
  const st = compare.start(spec), { thing, groups: sizes, tilt, more } = spec.body;
  // the step of the world (src/game/tasks/cpa.ts): 2 - the bigger number in small things, the smaller in big ones (the
  // number is compared, not the size); 3 - the numbers in digits, as from level 4
  const step = cpaOf(spec.level), digits = spec.body.digits || step === 3;
  markStep(c.stage, step);
  const groups = sizes.map((n, i) => {
    const g = el('button', digits ? 'group pickable digits' : 'group pickable');
    if (digits) g.appendChild(el('b', 'n', String(n))); else items(g, thing, tilt[i], 'still');
    if (step === 2 && !digits && sizes[0] !== sizes[1]) g.classList.add(n > sizes[1 - i] ? 'cpa-small' : 'cpa-big');
    c.stage.appendChild(g); return g;
  });
  // The question without words, from the start: a dot that keeps growing ("more") or shrinking ("less").
  // It sits between the groups and depends on the question alone, so it never points at the right group.
  const ask = el('span', 'ask ' + (more ? 'more' : 'less')); ask.setAttribute('aria-hidden', 'true'); ask.appendChild(el('b'));
  c.stage.insertBefore(ask, groups[1]);
  const right = compare.solution(spec, st)[0];
  groups.forEach((g, i) => tap(g, () => { if (compare.answer(spec, st, i as 0 | 1) === 'right') { g.classList.add('yes'); c.right(); } else { g.classList.add('no'); c.wrong(g); } }));
  c.cheat = () => groups[right].dispatchEvent(new PointerEvent('pointerdown'));
  // With the numbers, the right group does what the dot of the question does: its things grow or shrink.
  c.hint = hintOf(spec.hint, pulseOf(groups[right]), {
    showNumbers: () => groups.forEach((g, i) => {
      if (digits) { g.querySelector('.dots')?.remove(); g.appendChild(dots(sizes[i])); return; }
      g.querySelector('em')?.remove(); g.appendChild(el('em', '', String(sizes[i])));
    }),
    grow: () => groups[right].classList.add('grow'),
    shrink: () => groups[right].classList.add('shrink'),
  });
}
