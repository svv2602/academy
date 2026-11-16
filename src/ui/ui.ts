import type { Save } from '../core/save';
import { lastDays } from '../game/playtime';
import { LEVELS, SKILLS, levelFor, withinLevels, type SkillId } from '../game/skills';
import type { BookInfo } from '../game/world';
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
export const DRESS = ['#ff7eb6', '#b388ff', '#5cc8ff', '#ffd54f', '#6ee7a8'];
export const HAIR = ['#8a5a3a', '#f5d16b', '#3b2a3a', '#ff8a5c', '#ff9ed2'];

export function initStart(sel: { dress: string; hair: string; name: string }, hasSave: boolean, onChange: () => void) {
  const applyText = () => {
    $('title').textContent = t('title'); $('subtitle').textContent = t('subtitle');
    $('loadingText').textContent = t('loading'); $('lblDress').textContent = t('dress');
    $('lblName').textContent = t('name'); $<HTMLInputElement>('name').placeholder = t('namePh'); $('lblHair').textContent = t('hair');
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

/**
 * Collection book + the parents' section behind an "adult" gate. The book shows what the world gives (`book`): its parts,
 * got or not, then its lines of figures.
 */
export function initBook(save: Save, book: BookInfo, on: { change(): void; reset(): void; open(isOpen: boolean): void; shop(): void }) {
  const bookCard = $('book'), parents = $('parents');
  const show = (node: HTMLElement, v: boolean) => { node.classList.toggle('hidden', !v); on.open(v); };
  const renderBook = () => {
    $('colTitle').textContent = t('col_title'); $('bookClose').textContent = t('close'); $('btnParents').textContent = t('parents');
    $('btnShop').textContent = `🛍️ ${t('shop')}`;
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
  $('btnBook').addEventListener('click', () => { renderBook(); show(bookCard, true); });
  $('bookClose').addEventListener('click', () => show(bookCard, false));
  // The shop and the fitting room (PLAY-04, PLAY-05): a screen of its own over the game, which stays paused.
  $('btnShop').addEventListener('click', () => { bookCard.classList.add('hidden'); on.shop(); });

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
  // The minutes of the last seven days (R33), today last; for the grown-ups only, nothing of it reaches the child.
  const timeBlock = () => {
    const days = lastDays(save), total = days.reduce((n, d) => n + d.minutes, 0);
    return `<div class="ptime"><div class="phead"><b>${t('p_time')}</b> · ${total ? `${t('p_total')}: ${tf('p_min', { n: total })}` : t('p_time_none')}</div>`
      + `<div class="pdays">${days.map((d) => `<span><b>${t(`p_wd${d.weekday}` as Key)}</b>${tf('p_min', { n: d.minutes })}</span>`).join('')}</div></div>`;
  };
  const renderParents = () => {
    $('pBody').innerHTML = `<div class="pskills">${skillTable(SKILLS.slice(0, 5))}${skillTable(SKILLS.slice(5))}</div>
      <div class="pside"><div class="pinfo">${timeBlock()}<p class="pnote"><b>${t('p_fix')}</b> · ${t('p_fix_note')}</p>
      <div id="pHard" class="phard" hidden><b>${t('p_hard')}</b> ${t('p_hard_none')}</div></div>
      <div class="pset"><div class="prow"><span>${t('p_quality')}</span><button id="pQuality" class="${save.pinTier === null ? '' : 'sel'}">${t(save.pinTier === null ? 'd0' : `q${save.pinTier}`)}</button></div>
      <div class="prow pvol">${(['music', 'sfx', 'voice'] as const).map((v) => `<label><span>${t(('p_' + v) as Key)}</span><input type="range" min="0" max="1" step="0.05" value="${save.vol[v]}" data-v="${v}"></label>`).join('')}</div>
      <div class="prow preset"><button id="pReset">${t('p_reset')}</button></div>
      <div id="pVersion">${t('p_version')}: <span id="pBuilt">${__BUILD_DATE__}</span> · <span id="pCommit">${__BUILD_COMMIT__}</span></div></div></div>`;
    $('pBody').querySelectorAll<HTMLElement>('[data-fix]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.fix as SkillId;
      save.fixed[k] = nextFixed(k, save.fixed[k] ?? 0); on.change(); renderParents();
    }));
    // Graphics quality (TECH-04): one button that steps through automatic, high, medium, plain - four buttons would not
    // fit the phone held sideways. A pinned tier applies at once and the game no longer lowers it by itself.
    $('pQuality').addEventListener('click', () => { save.pinTier = QUALITY_STEPS[(QUALITY_STEPS.indexOf(save.pinTier) + 1) % QUALITY_STEPS.length]; on.change(); renderParents(); });
    $('pBody').querySelectorAll<HTMLInputElement>('[data-v]').forEach((r) => r.addEventListener('input', () => { save.vol[r.dataset.v as 'music'] = Number(r.value); on.change(); }));
    const reset = $('pReset'); let armed = false;
    reset.addEventListener('click', () => { if (armed) on.reset(); else { armed = true; reset.textContent = t('p_reset_sure'); } });
  };
  // The gate (PLAY-14): every opening asks a new example, never the one asked last time.
  let gate: GateQuestion | null = null;
  $('btnParents').addEventListener('click', () => {
    bookCard.classList.add('hidden');
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
