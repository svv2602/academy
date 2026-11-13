import { lang, setChildName, setLang, t, type Key } from './strings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const el = {
  canvas: $<HTMLCanvasElement>('c'), hud: $('hud'), stars: $('stars'), crystals: $('crystals'), fps: $('fps'),
  bubble: $('bubble'), bubbleText: $('bubbleText'), answers: $('answers'),
  joy: $('joy'), knob: $('knob'), btnJump: $('btnJump'), btnAct: $('btnAct'),
  fanfare: $('fanfare'), fanfareTitle: $('fanfareTitle'), fanfareText: $('fanfareText'), fanfareOk: $('fanfareOk'),
  start: $('start'), loading: $('loading'), bar: $('bar'), setup: $('setup'), play: $('play'), restart: $('restart'),
};

let bubbleTimer = 0;
export function bubble(key: Key | null, holdMs = 0) {
  clearTimeout(bubbleTimer);
  if (!key) { el.bubble.classList.add('hidden'); return; }
  el.bubbleText.textContent = t(key);
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

export function showAnswers(max: number, onPick: (n: number, btn: HTMLButtonElement) => void) {
  el.answers.innerHTML = '';
  for (let n = 1; n <= max; n++) {
    const b = document.createElement('button');
    b.textContent = String(n);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); onPick(n, b); });
    el.answers.appendChild(b);
  }
  el.answers.classList.remove('hidden');
}
export const hideAnswers = () => el.answers.classList.add('hidden');

export function setAct(label: Key | null) {
  el.btnAct.classList.toggle('hidden', !label);
  if (label) el.btnAct.textContent = t(label);
}

export function fanfare(title: Key, text: Key): Promise<void> {
  el.fanfareTitle.textContent = t(title);
  el.fanfareText.textContent = t(text);
  el.fanfareOk.textContent = t('ok');
  el.fanfare.classList.remove('hidden');
  return new Promise((res) => { el.fanfareOk.onclick = () => { el.fanfare.classList.add('hidden'); res(); }; });
}

const DRESS = ['#ff7eb6', '#b388ff', '#5cc8ff', '#ffd54f', '#6ee7a8'];
const HAIR = ['#8a5a3a', '#f5d16b', '#3b2a3a', '#ff8a5c', '#ff9ed2'];

export function initStart(sel: { dress: string; hair: string; name: string; hairStyle: string }, hasSave: boolean, onChange: () => void) {
  const applyText = () => {
    $('title').textContent = t('title'); $('subtitle').textContent = t('subtitle');
    $('loadingText').textContent = t('loading'); $('lblDress').textContent = t('dress'); $('lblStyle').textContent = t('style');
    document.querySelectorAll<HTMLElement>('#style button').forEach((b) => { b.textContent = t(('style_' + b.dataset.style) as Key); }); $('lblName').textContent = t('name'); $<HTMLInputElement>('name').placeholder = t('namePh'); $('lblHair').textContent = t('hair');
    el.play.textContent = hasSave ? t('cont') : t('play'); el.restart.textContent = t('again');
    document.querySelectorAll<HTMLElement>('#langs button').forEach((b) => b.classList.toggle('sel', b.dataset.lang === lang));
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
  const styles = $('style');
  for (const st of ['long', 'buns', 'simpleparted']) {
    const b = document.createElement('button');
    b.dataset.style = st; b.textContent = t(('style_' + st) as Key);
    b.classList.toggle('sel', sel.hairStyle === st);
    b.addEventListener('click', () => {
      sel.hairStyle = st;
      styles.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
      onChange();
    });
    styles.appendChild(b);
  }
  el.restart.classList.toggle('hidden', !hasSave);
}
