/**
 * The panel show of "pattern" (ARCH-09): the row of colours, a question mark, and the three colours to choose from.
 * Level 4 shows the row as groups (1, 2, 3 ...) and the choices as groups; level 5 draws figures (colour and shape).
 */
import { pattern, type PatternSpec } from '../tasks/pattern';
import { el, options, pulseOf, wait, type PanelCtx } from './panel';
import { hintOf } from './flow';
import { shapeEl } from './shapes';

/** The things of a growing row are smaller: a group of four still fits a phone held upright next to the others. */
const GROW_SIZE = 'clamp(22px, min(6vw, 9vh), 46px)';

export function patternView(spec: PatternSpec, c: PanelCtx) {
  const st = pattern.start(spec), { unit, row } = spec.body;
  if (spec.level === 4) return growingView(spec, c);
  if (spec.level >= 5) return twoView(spec, c);
  row.forEach((s, i) => { const x = el('span', 'it still', s); x.dataset.u = String(i % unit.length); c.stage.appendChild(x); });
  c.stage.appendChild(el('span', 'it still q', '?'));
  const ok = options(c, spec.body.options, (v) => pattern.answer(spec, st, v) === 'right');
  c.hint = hintOf(spec.hint, pulseOf(ok), { markUnits: () => { c.stage.classList.add('units'); } });
}

/** Level 4: each group of the row in its own box; rung 2 puts its number over each group in turn, none over the "?". */
function growingView(spec: PatternSpec, c: PanelCtx) {
  const st = pattern.start(spec);
  const groups = spec.body.row.map((g, i) => {
    const box = el('span', 'group'); box.dataset.u = String(i % 4);
    for (const t of [...g]) { const x = el('span', 'it still', t); x.style.fontSize = GROW_SIZE; box.appendChild(x); }
    c.stage.appendChild(box); return box;
  });
  c.stage.appendChild(el('span', 'it still q', '?'));
  const ok = options(c, spec.body.options, (v) => pattern.answer(spec, st, v) === 'right');
  const numbers = async () => {
    const round = c.wrongs;
    c.stage.classList.add('units');
    for (const [i, g] of groups.entries()) {
      if (!c.alive || c.wrongs !== round) return;
      g.querySelector('em')?.remove();
      const n = el('em', '', String(g.querySelectorAll('.it').length));
      n.style.cssText = 'right:auto;left:50%;top:-18px;transform:translateX(-50%)';
      g.appendChild(n); c.hooks.number(i + 1); await wait(750);
    }
  };
  c.hint = hintOf(spec.hint, pulseOf(ok), { showNumbers: () => { void numbers(); } });
}

/** Level 5: figures; rung 2 frames the links of the colour first, then the links of the shape. */
function twoView(spec: PatternSpec, c: PanelCtx) {
  const st = pattern.start(spec), [cu, su] = spec.body.unit.split('/');
  const shown = spec.body.row.map((key, i) => {
    const x = el('span', 'it still fig'); x.appendChild(shapeEl(key)); x.dataset.u = String(i % cu.length);
    c.stage.appendChild(x); return x;
  });
  c.stage.appendChild(el('span', 'it still q', '?'));
  const ok = options(c, spec.body.options, (v) => pattern.answer(spec, st, v) === 'right');
  [...c.opts.children].forEach((b, i) => { b.textContent = ''; b.appendChild(shapeEl(spec.body.options[i], '1.3em')); });
  const frames = async () => {
    const round = c.wrongs;
    shown.forEach((x, i) => { x.dataset.u = String(i % cu.length); });
    c.stage.classList.add('units');
    await wait(2200);
    if (!c.alive || c.wrongs !== round) return;
    shown.forEach((x, i) => { x.dataset.u = String(i % su.length); });
  };
  c.hint = hintOf(spec.hint, pulseOf(ok), { markUnits: () => { void frames(); } });
}
