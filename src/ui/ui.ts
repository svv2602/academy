import type { Save } from '../core/save';
import { CONTROL_IDS, CONTROL_STEPS, type ControlId, type ControlStep, type Controls } from '../core/tuning';
import type { UpdateState } from '../core/update';
import { fromCode, hasBefore, loadCode, restoreBefore, toCode, type Refusal } from '../core/savecode';
import { helpsOfWeek } from '../game/helpers';
import { lastDays } from '../game/playtime';
import { HELPER_IDS, dealOf } from '../game/shop';
import { breakMinutes } from '../game/session';
import { stopPoint } from '../game/stops';
import { hardest } from '../game/planner';
import { LEVELS, SKILLS, levelFor, withinLevels, type SkillId } from '../game/skills';
import type { BookInfo } from '../game/world';
import { bookView, setBookStories, type BookStory } from './book';
import { SUPPLY_LOOK } from './supplies';
import { gateOpens, gateQuestion, type GateQuestion } from './gate';
import { lang, setChildName, setLang, t, tf, type Key } from './strings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const el = {
  canvas: $<HTMLCanvasElement>('c'), hud: $('hud'), stars: $('stars'), crystals: $('crystals'), fps: $('fps'),
  bubble: $('bubble'), bubbleText: $('bubbleText'), answers: $('answers'), answersClose: $('answersClose'),
  joy: $('joy'), knob: $('knob'), btnJump: $('btnJump'), btnAct: $('btnAct'),
  fanfare: $('fanfare'), fanfareTitle: $('fanfareTitle'), fanfareText: $('fanfareText'), fanfareOk: $('fanfareOk'),
  start: $('start'), loading: $('loading'), bar: $('bar'), setup: $('setup'), play: $('play'), restart: $('restart'),
  notice: $('notice'), noticeText: $('noticeText'), retry: $('retry'),
};

/**
 * TECH-07, TECH-08: a message on the start screen in place of the loading bar - this device cannot run the game, or
 * the game did not load. It is for the grown-ups and is text only, never spoken. It follows the language buttons.
 * `onRetry` adds the "try again" button.
 */
let noticeKey: 'no_webgl' | 'load_failed' | null = null;
const renderNotice = () => {
  el.noticeText.textContent = noticeKey ? t(noticeKey) : '';
  el.retry.textContent = t('retry');
};
export function showNotice(key: 'no_webgl' | 'load_failed', onRetry?: () => void) {
  noticeKey = key;
  renderNotice();
  el.loading.classList.add('hidden'); el.setup.classList.add('hidden');
  el.retry.classList.toggle('hidden', !onRetry);
  el.retry.onclick = onRetry ?? null;
  el.notice.classList.remove('hidden');
}

let bubbleTimer = 0;
export function bubble(key: Key | null, holdMs = 0, speaker = '🐱', text?: string) {
  clearTimeout(bubbleTimer);
  if (!key) { el.bubble.classList.add('hidden'); return; }
  $('speaker').textContent = speaker;
  el.bubbleText.textContent = text ?? t(key);
  el.bubble.classList.remove('hidden');
  el.bubble.style.animation = 'none'; void el.bubble.offsetWidth; el.bubble.style.animation = '';
  if (holdMs) bubbleTimer = window.setTimeout(() => el.bubble.classList.add('hidden'), holdMs);
}

export function setCounter(which: 'stars' | 'crystals', text: string) {
  const node = el[which];
  if (node.textContent === text) return;
  node.textContent = text;
  const pill = node.parentElement!;
  pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
}

/** The number buttons of a task in the world, with a close button of their own (it lies outside the list of numbers). */
export function showAnswers(max: number, onPick: (n: number, btn: HTMLButtonElement) => void, onClose: () => void) {
  el.answers.innerHTML = '';
  for (let n = 1; n <= max; n++) {
    const b = document.createElement('button');
    b.textContent = String(n);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); onPick(n, b); });
    el.answers.appendChild(b);
  }
  el.answersClose.onclick = onClose;
  el.answers.classList.remove('hidden'); el.answersClose.classList.remove('hidden');
}
export const hideAnswers = () => { el.answers.classList.add('hidden'); el.answersClose.classList.add('hidden'); };
/**
 * The close button alone, for a task in the world that is answered by taps on the world itself (PLAY-02: every task
 * can be closed). `hideAnswers` hides it again.
 */
export function showClose(onClose: () => void) {
  el.answersClose.onclick = onClose;
  el.answersClose.classList.remove('hidden');
}

export function setAct(label: Key | null) {
  el.btnAct.classList.toggle('hidden', !label);
  if (label) el.btnAct.textContent = t(label);
}

export function fanfare(title: Key, text: string, gemColor = '#7fe3ff'): Promise<void> {
  el.fanfareTitle.textContent = t(title);
  el.fanfareText.textContent = text;
  (el.fanfare.querySelector('.gem') as HTMLElement).style.filter = `drop-shadow(0 0 22px ${gemColor})`;
  el.fanfareOk.textContent = t('ok');
  el.fanfare.classList.remove('hidden');
  return new Promise((res) => { el.fanfareOk.onclick = () => { el.fanfare.classList.add('hidden'); res(); }; });
}

/** The free colours of the dress and the hair (R15): the start screen and the shop's fitting room (src/ui/shop.ts) show them. */
/** TECH-13: the state of a new version for the version line of the parents' section (src/core/update.ts). */
let updateState: UpdateState = 'none';
export function showUpdate(s: UpdateState) {
  updateState = s;
  const e = document.getElementById('pUpdate');
  if (e) { e.dataset.state = s; e.textContent = s === 'none' ? '' : ` · ${t(s === 'ready' ? 'p_upd_ready' : 'p_upd_loading')}`; }
}

export const DRESS = ['#ff7eb6', '#b388ff', '#5cc8ff', '#ffd54f', '#6ee7a8'];
export const HAIR = ['#8a5a3a', '#f5d16b', '#3b2a3a', '#ff8a5c', '#ff9ed2'];

export function initStart(sel: { dress: string; hair: string; name: string }, hasSave: boolean, onChange: () => void) {
  const applyText = () => {
    $('title').textContent = t('title'); $('subtitle').textContent = t('subtitle');
    $('loadingText').textContent = t('loading'); $('lblDress').textContent = t('dress');
    $('lblName').textContent = t('name'); $<HTMLInputElement>('name').placeholder = t('namePh'); $('lblHair').textContent = t('hair'); $('lblLooks').textContent = t('looks');
    el.play.textContent = hasSave ? t('cont') : t('play'); el.restart.textContent = t('again');
    document.querySelectorAll<HTMLElement>('#langs button').forEach((b) => b.classList.toggle('sel', b.dataset.lang === lang));
    renderNotice();
  };
  applyText();
  const name = $<HTMLInputElement>('name');
  name.value = sel.name; setChildName(sel.name);
  name.addEventListener('input', () => { sel.name = name.value.trim().slice(0, 20); setChildName(sel.name); });
  document.querySelectorAll<HTMLElement>('#langs button').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang as 'uk' | 'ru'); applyText(); }));
  const fill = (id: string, colors: string[], key: 'dress' | 'hair') => {
    const box = $(id);
    for (const c of colors) {
      const b = document.createElement('button');
      b.style.background = c;
      b.classList.toggle('sel', sel[key] === c);
      b.addEventListener('click', () => {
        sel[key] = c;
        box.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
        onChange();
      });
      box.appendChild(b);
    }
  };
  fill('dress', DRESS, 'dress'); fill('hair', HAIR, 'hair');
  el.restart.classList.toggle('hidden', !hasSave);
}

/**
 * The level a skill's button of the parents' section fixes next (LEARN-15): automatic (0), then the skill's own levels
 * from its lowest to 5 (`LEVELS`: the composition of a number has 3 to 5), then automatic again. A level fixed outside
 * the skill's own (one level for every skill of an older save) steps on from the level it plays as.
 */
export function nextFixed(skill: SkillId, fixed: number) {
  const [min, max] = LEVELS[skill];
  if (!(fixed > 0)) return min;
  const now = withinLevels(skill, fixed);
  return now >= max ? 0 : now + 1;
}

/** The order the quality button of the parents' section steps through: automatic (null), then high to plain. */
const QUALITY_STEPS: Save['pinTier'][] = [null, 2, 1, 0];
/** The order the break button of the parents' section steps through (PLAY-20, R33): 10, 15, 20, 30 minutes, then off. */
export const BREAK_STEPS = [10, 15, 20, 30, 0] as const;
/** The break the parents' section shows for the save, and the one its button sets next. */
export const breakLabel = (m: number): Key => (m === 0 ? 'br_off' : (`br${m}` as Key));
export const nextBreak = (m: number): number => BREAK_STEPS[(BREAK_STEPS.indexOf(m as (typeof BREAK_STEPS)[number]) + 1) % BREAK_STEPS.length];

/**
 * Collection book + the parents' section behind an "adult" gate. The book shows what the world gives (`book`): its parts,
 * got or not, then its lines of figures; the profile around them (the shelf, secrets, pets, achievements) is src/ui/book.ts.
 */
export function initBook(save: Save, book: BookInfo, on: {
  change(): void; controls?(): void; reset(): void; open(isOpen: boolean): void; shop(): void; stories?(): readonly BookStory[];
}) {
  const bookCard = $('book'), parents = $('parents');
  const show = (node: HTMLElement, v: boolean) => { node.classList.toggle('hidden', !v); on.open(v); };
  const renderBook = () => {
    $('colTitle').textContent = t('col_title'); $('bookClose').textContent = t('close'); $('btnParents').textContent = t('parents');
    // the deal of the day not taken yet: a mark on the button (src/game/deal.ts)
    $('btnShop').innerHTML = `🛍️ ${t('shop')}${dealOf(save) ? ' <b class="dealmark">%</b>' : ''}`;
    $('shards').innerHTML = '';
    for (const p of book.parts()) {
      const d = document.createElement('div');
      d.className = 'shard' + (p.got ? ' got' : '');
      d.style.setProperty('--c', p.color);
      d.innerHTML = `<div class="gem"></div>${p.icon}`;
      $('shards').appendChild(d);
    }
    $('colStats').innerHTML = book.stats().map((s) => `<div>${s.icon} ${t(s.label)}: ${s.value}</div>`).join('');
  };
  // The profile (PLAY-07, PLAY-09, src/ui/book.ts): the heroine close up, the shelf, the secrets, the pets, the achievements.
  // the seen cut-scenes of the world (WORLD-13): the profile shows them again; a tap closes the book and plays one
  if (on.stories) setBookStories(on.stories, () => { bookView(false, save); show(bookCard, false); });
  $('btnBook').addEventListener('click', () => { renderBook(); bookView(true, save); show(bookCard, true); });
  $('bookClose').addEventListener('click', () => { bookView(false, save); show(bookCard, false); void stopPoint('book'); });
  // The shop and the fitting room (PLAY-04, PLAY-05): a screen of its own over the game, which stays paused.
  $('btnShop').addEventListener('click', () => { bookView(false, save); bookCard.classList.add('hidden'); on.shop(); });

  const gateA = $<HTMLInputElement>('gateA');
  // A skill's row (PLAY-15): its level - the fixed one, or "auto" and the adaptive one -, its tasks, the share of clean
  // solves. The level is also the button that fixes it (LEARN-15): one per skill, nine rows of five buttons would not fit.
  const skillRow = (k: SkillId) => {
    const s = save.skills[k], pinned = (save.fixed[k] ?? 0) > 0;
    return `<tr><td>${t(('sk_' + k) as Key)}</td><td><button class="pfix${pinned ? ' sel' : ''}" data-fix="${k}">${pinned ? '' : t('d0') + ' '}${levelFor(save, k)}</button></td>`
      + `<td>${s.tasks}</td><td>${s.tasks ? Math.round((s.first / s.tasks) * 100) + '%' : '–'}</td></tr>`;
  };
  // Two tables of the same columns (five skills and four): side by side on a phone held sideways, one under the other upright.
  const skillTable = (ks: readonly SkillId[]) => `<table class="ptab"><tr><th>${t('p_skill')}</th><th>${t('p_level')}</th><th>${t('p_tasks')}</th><th>${t('p_first')}</th></tr>${ks.map(skillRow).join('')}</table>`;
  // The helpers of a task taken in the last seven days (src/game/helpers.ts): the parents see how often she leans on
  // them. Under the version, in the corner it stands in: a line of the section's own would push it past a phone's window.
  const helpsLine = () => {
    const n = helpsOfWeek(save);
    return `<div id="pHelps" title="${HELPER_IDS.map((id) => t(`supn_${id}` as Key)).join(', ')}">${t('p_helps')}: ${HELPER_IDS.map((id) => `${SUPPLY_LOOK[id].icon} ${n[id]}`).join(' · ')}</div>`;
  };
  // The minutes of the last seven days (R33), today last; for the grown-ups only, nothing of it reaches the child.
  const timeBlock = () => {
    const days = lastDays(save), total = days.reduce((n, d) => n + d.minutes, 0);
    return `<div class="ptime"><div class="phead"><b>${t('p_time')}</b> · ${total ? `${t('p_total')}: ${tf('p_min', { n: total })}` : t('p_time_none')}</div>`
      + `<div class="pdays">${days.map((d) => `<span><b>${t(`p_wd${d.weekday}` as Key)}</b>${tf('p_min', { n: d.minutes })}</span>`).join('')}</div></div>`;
  };
  // The five hardest examples (PLAY-15, LEARN-11), in numbers ("8 + 5"), the most mistakes first; none yet - a line says so.
  const hardBlock = () => {
    const list = hardest(save);
    return `<p id="pHard" class="pnote phard"><b>${t('p_hard')}</b> · ${list.length ? list.join(' · ') : t('p_hard_none')}</p>`;
  };

  // TECH-13: a new version that downloads or waits for the next launch (src/core/update.ts) - a word for the grown-ups.
  const updateLine = () => `<span id="pUpdate" data-state="${updateState}">${updateState === 'none' ? '' : ` · ${t(updateState === 'ready' ? 'p_upd_ready' : 'p_upd_loading')}`}</span>`;
  const renderParents = () => {
    $('pBody').innerHTML = `<div class="pskills">${skillTable(SKILLS.slice(0, 5))}<div class="pcol">${skillTable(SKILLS.slice(5))}<div class="prow pcoderow"><button id="pCode" class="pcodebtn">${t('p_code')}</button><button id="pCtl" class="pctlbtn">${t('p_ctl')}</button></div></div></div>
      <div class="pside"><div class="pinfo">${timeBlock()}<p class="pnote"><b>${t('p_fix')}</b> · ${t('p_fix_note')}</p>
      ${hardBlock()}</div>
      <div class="pset"><div class="prow"><span>${t('p_quality')}</span><button id="pQuality" class="${save.pinTier === null ? '' : 'sel'}">${t(save.pinTier === null ? 'd0' : `q${save.pinTier}`)}</button></div>
      <div class="prow pbreak" title="${t('p_break_hint')}"><span>${t('p_break')}</span><button id="pBreak" class="${breakMinutes(save) === 0 ? '' : 'sel'}">${t(breakLabel(breakMinutes(save)))}</button></div>
      <div class="prow pvol">${(['music', 'sfx', 'voice'] as const).map((v) => `<label><span>${t(('p_' + v) as Key)}</span><input type="range" min="0" max="1" step="0.05" value="${save.vol[v]}" data-v="${v}"></label>`).join('')}</div>
      <div class="prow preset"><button id="pCodeUp" class="pcodebtn">${t('p_code')}</button><button id="pCtlUp" class="pctlbtn">${t('p_ctl')}</button><button id="pReset">${t('p_reset')}</button></div>
      <div id="pVersion">${t('p_version')}: <span id="pBuilt">${__BUILD_DATE__}</span> · <span id="pCommit">${__BUILD_COMMIT__}</span>${updateLine()}${helpsLine()}</div></div></div>`;
    $('pBody').querySelectorAll<HTMLElement>('[data-fix]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.fix as SkillId;
      save.fixed[k] = nextFixed(k, save.fixed[k] ?? 0); on.change(); renderParents();
    }));
    // Graphics quality (TECH-04): one button that steps through automatic, high, medium, plain - four buttons would not
    // fit the phone held sideways. A pinned tier applies at once and the game no longer lowers it by itself.
    $('pQuality').addEventListener('click', () => { save.pinTier = QUALITY_STEPS[(QUALITY_STEPS.indexOf(save.pinTier) + 1) % QUALITY_STEPS.length]; on.change(); renderParents(); });
    // The break (PLAY-20, R33): one button like the quality's - five buttons would not fit the phone held sideways.
    $('pBreak').addEventListener('click', () => { save.breakMin = nextBreak(breakMinutes(save)); on.change(); renderParents(); });
    $('pBody').querySelectorAll<HTMLInputElement>('[data-v]').forEach((r) => r.addEventListener('input', () => { save.vol[r.dataset.v as 'music'] = Number(r.value); on.change(); }));
    const reset = $('pReset'); let armed = false;
    reset.addEventListener('click', () => { if (armed) on.reset(); else { armed = true; reset.textContent = t('p_reset_sure'); } });
    // One "move the game" button is shown: under the second table, or beside "reset" on a phone held upright (style.css).
    $('pBody').querySelectorAll('.pcodebtn').forEach((b) => b.addEventListener('click', renderCode));
    $('pBody').querySelectorAll('.pctlbtn').forEach((b) => b.addEventListener('click', renderControls));
  };
  // The save as a code (PLAY-16): a view of its own in place of the section - the section has no room for two fields.
  // The code is made and copied at the adult's tap only; a pasted one is checked at the first tap of "load", written
  // at the second (the save it replaces kept: src/core/savecode.ts), then the page is reloaded and loadSave reads it.
  // The controls (PLAY-22): a view of its own in place of the section, like the code's - four lines of three buttons each
  // do not fit beside the tables. A tap applies the step at once and writes the save; "normal" is the game's own numbers.
  const renderControls = () => {
    const c = save.controls ?? {};
    const step = (id: ControlId) => (c[id] && CONTROL_STEPS.includes(c[id]) ? c[id] : 'normal');
    $('pBody').innerHTML = `<div class="pctl">${CONTROL_IDS.map((id) => `<div class="prow"><span>${t(`p_ctl_${id}` as Key)}</span>${CONTROL_STEPS.map((k) =>
      `<button data-ctl="${id}" data-step="${k}" class="${step(id) === k ? 'sel' : ''}">${t(`p_ctl_${id}_${k}` as Key)}</button>`).join('')}</div>`).join('')}
      <div class="pcfoot"><p class="pnote">${t('p_ctl_note')}</p><button id="pCtlBack">${t('p_code_back')}</button></div></div>`;
    $('pBody').querySelectorAll<HTMLElement>('[data-ctl]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.ctl as ControlId, k = b.dataset.step as ControlStep;
      const next: Controls = { ...(save.controls ?? {}) };
      if (k === 'normal') delete next[id]; else next[id] = k;
      save.controls = next;
      on.controls?.(); renderControls();
    }));
    $('pCtlBack').addEventListener('click', renderParents);
  };
  const renderCode = () => {
    $('pBody').innerHTML = `<div class="pcode"><p class="pnote">${t('p_code_note')}</p>
      <div class="pcrow"><button id="pCodeCopy">${t('p_code_copy')}</button><textarea id="pCodeOut" readonly rows="2" spellcheck="false"></textarea></div>
      <div class="pcrow"><button id="pCodeLoad">${t('p_code_load')}</button><textarea id="pCodeIn" rows="2" spellcheck="false" placeholder="${t('p_code_paste')}"></textarea></div>
      <div class="pcfoot"><p id="pCodeMsg" class="pnote" role="status"></p>${hasBefore() ? `<button id="pCodeRestore">${t('p_code_restore')}</button>` : ''}<button id="pCodeBack">${t('p_code_back')}</button></div></div>`;
    const out = $<HTMLTextAreaElement>('pCodeOut'), inp = $<HTMLTextAreaElement>('pCodeIn'), load = $('pCodeLoad');
    const say = (text: string, bad = false) => { const m = $('pCodeMsg'); m.textContent = text; m.classList.toggle('bad', bad); };
    const refused = (reason: Refusal) => { disarm(); say(t(`p_code_${reason}` as Key), true); };
    let armed = false;
    const disarm = () => { armed = false; load.textContent = t('p_code_load'); };
    $('pCodeCopy').addEventListener('click', async () => {
      out.value = await toCode(save);
      try { await navigator.clipboard.writeText(out.value); say(t('p_code_copied')); } catch { out.select(); say(t('p_code_select')); }
    });
    inp.addEventListener('input', () => { disarm(); say(''); });
    load.addEventListener('click', async () => {
      if (!armed) {
        const r = await fromCode(inp.value);
        if (!r.ok) return refused(r.reason);
        armed = true; load.textContent = t('p_code_sure'); say('');
        return;
      }
      const r = await loadCode(save, inp.value);
      if (!r.ok) return refused(r.reason);
      location.reload();
    });
    // The way back (decision of the lead, 2026-11-18): while the game a code replaced is kept, it can be given back - with
    // the same second tap; the game given back takes its place there, so the same button undoes it again.
    const restore = document.getElementById('pCodeRestore');
    let back = false;
    restore?.addEventListener('click', () => {
      if (!back) { back = true; disarm(); restore.textContent = t('p_code_restore_sure'); say(''); return; }
      const r = restoreBefore(save);
      if (!r.ok) { back = false; restore.textContent = t('p_code_restore'); return refused(r.reason); }
      location.reload();
    });
    inp.addEventListener('input', () => { if (back && restore) { back = false; restore.textContent = t('p_code_restore'); } });
    $('pCodeBack').addEventListener('click', renderParents);
  };
  // The gate (PLAY-14): every opening asks a new example, never the one asked last time.
  let gate: GateQuestion | null = null;
  $('btnParents').addEventListener('click', () => {
    bookView(false, save); bookCard.classList.add('hidden');
    gate = gateQuestion(gate);
    $('pTitle').textContent = t('p_title'); $('gateQ').textContent = tf('gate_q', { a: gate.a, b: gate.b }); $('parentsClose').textContent = t('close');
    gateA.value = ''; $('gate').classList.remove('hidden'); $('pBody').classList.add('hidden');
    show(parents, true);
  });
  gateA.addEventListener('input', () => {
    if (!gate || !gateOpens(gate, gateA.value)) return;
    gateA.blur(); $('gate').classList.add('hidden'); $('pBody').classList.remove('hidden'); renderParents();
  });
  $('parentsClose').addEventListener('click', () => show(parents, false));
}
