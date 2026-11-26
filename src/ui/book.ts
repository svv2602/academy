/**
 * The profile in the book of treasures (PLAY-07, the choice of a pet PLAY-09): the heroine close up on the free side of
 * the screen (R58, the same close-up as the shop's), the card with tabs by pictures - the magic shelf (R15, R59: five
 * places, one per world, which are also the "open lands"; no map), the secrets of the world played (R12), the pets with
 * their choice (R20), the collections of the world played (PLAY-25) and the achievements (R13). What is not found yet
 * is a silhouette (R14).
 *
 * Everything is read from the save and from the world being played at every opening: the game `g` is the one the
 * achievements are bound to (src/ui/achieve.ts), its `g.world` and `g.ws` are never kept here (the rule of the lead and
 * of P3). The shelf reads `save.worlds[<id>]` - the artifact restored (`final`) and the chains finished - and stores
 * nothing of its own (R16): a home of the worlds (PLAY-13) can show the same list.
 */
import type { Save, WorldState } from '../core/save';
import { findIcon } from './finds';
import { ACHIEVEMENTS } from '../game/achievements';
import { artifactBack, knownWorlds, type ArtifactWorld } from '../game/artifacts';
import type { WorldEntry } from '../game/context';
import { PETS, choosePet, foundPets } from '../game/pets';
import { foundOf, itemsOf, piecesOf, pictureDone, pictureSet, setCells, setDone, setKindsOf } from '../game/collections';
import { achGame } from './achieve';
import { showPicture } from './picture';
import { heroCloseup } from './shop';
import { say } from '../core/audio';
import { t, tf, voiceText, type Key, type SpokenKey } from './strings';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/**
 * A place of the shelf: the world whose artifact stands there (null: the world is not made yet), its picture, the name
 * of the artifact, the word of its parts (R41: only where the world's design names them) and the caption of its
 * silhouette.
 */
export interface ShelfPlace { world: string | null; icon: string; art: Key; parts: Key | null; wait: Key }
export const SHELF: readonly ShelfPlace[] = [
  { world: 'fairy', icon: '💎', art: 'art_1', parts: 'parts_1', wait: 'shelf_wait_1' },
  { world: null, icon: '💚', art: 'art_2', parts: null, wait: 'shelf_wait_2' },
  { world: null, icon: '🦪', art: 'art_3', parts: null, wait: 'shelf_wait_3' },
  { world: null, icon: '♦️', art: 'art_4', parts: null, wait: 'shelf_wait_4' },
  { world: null, icon: '🌟', art: 'art_5', parts: null, wait: 'shelf_wait_5' },
];

/**
 * The world of a place: the one of the registry that has this place (`WorldDef.shelf`, src/game/artifacts.ts), so a
 * world added to the registry takes its place by itself; with no registry known (a test of the shelf alone) - the
 * place's own.
 */
export function shelfWorld(p: ShelfPlace, i: number, worlds: readonly ArtifactWorld[] = knownWorlds()): string | null {
  if (!worlds.length) return p.world;
  return worlds.find((w) => w.shelf === i)?.id ?? null;
}

/** A place as the save has it: the artifact back (`found`), some of its parts (the world played only) or still waiting. */
export type PlaceState = { kind: 'found' } | { kind: 'parts'; n: number; of: number } | { kind: 'wait' };

/** The stored progress of a world, read without creating it (opening the book changes nothing). */
const stored = (save: Save, id: string): Partial<WorldState> => {
  const w = save.worlds[id] as unknown;
  return typeof w === 'object' && w !== null ? w as Partial<WorldState> : {};
};

/**
 * The state of each place of the shelf, from the save alone: `final` of its world, else - for the world played - the
 * number of its characters whose chain is finished, out of all of them.
 */
export function shelfState(save: Save, world: Pick<WorldEntry, 'id' | 'characters'> | null, worlds: readonly ArtifactWorld[] = knownWorlds()): PlaceState[] {
  return SHELF.map((p, i) => {
    const id = shelfWorld(p, i, worlds);
    if (!id) return { kind: 'wait' };
    const w = stored(save, id);
    if (artifactBack(save, id)) return { kind: 'found' };
    const chars = world && world.id === id ? world.characters ?? [] : [];
    const n = chars.filter((c) => (w.quests?.[c.id] ?? 0) >= c.steps.length).length;
    return n > 0 ? { kind: 'parts', n, of: chars.length } : { kind: 'wait' };
  });
}

/** The pictures of the pets (PETS, src/game/pets.ts) and of "no pet". */
export const PET_ICON: Record<string, string> = { fawn: '🦌', owlet: '🦉', bulchik: '🐲', zheleyka: '🧸', pushok: '🐑', none: '🚫' };
/** The pictures of a world's secrets: the chest has its own. */
const SECRET_ICON = '✨', CHEST_ICON = '🎁';

type Tab = 'shelf' | 'secrets' | 'collect' | 'picture' | 'pets' | 'ach';
const TABS: readonly { id: Tab; icon: string; label: Key }[] = [
  { id: 'shelf', icon: '🏆', label: 'shelf_title' }, { id: 'secrets', icon: '🗝️', label: 'book_secrets_t' },
  { id: 'collect', icon: '🦋', label: 'book_collect_t' }, { id: 'picture', icon: '🧩', label: 'book_pic_t' }, { id: 'pets', icon: '🐾', label: 'book_pets' }, { id: 'ach', icon: '🏅', label: 'ach_book' },
];

/** What window.__game reads of the book (src/game/debug.ts does not: the walkthrough reads the DOM and this). */
export const bookState = { opened: 0, firstSaid: false, tab: 'shelf' as Tab };


const button = (cls: string, html: string, on: (() => void) | null) => {
  const b = document.createElement('button');
  b.className = cls; b.innerHTML = html;
  if (on) b.addEventListener('click', on); else b.disabled = true;
  return b;
};

let tab: Tab = 'shelf';
let pickedPlace = -1;
let pickedAch: string | null = null;

/** The line of the cat on the free side, over the heroine: its text there and its clip (no bubble under the book). */
function sayLine(key: SpokenKey | null) {
  const box = $('bookSay');
  $('bookSayText').textContent = key ? t(key) : '';
  box.classList.toggle('quiet', !key);
  if (key) void say(key, voiceText(key), 'story');
}

function renderTabs(save: Save) {
  const box = $('bookTabs');
  box.innerHTML = '';
  for (const tb of TABS) {
    const b = button(tb.id === tab ? 'sel' : '', tb.icon, () => { tab = tb.id; renderProfile(save); });
    b.dataset.tab = tb.id; b.setAttribute('aria-label', t(tb.label)); b.title = t(tb.label);
    box.appendChild(b);
  }
  for (const [id, pane] of [['shelf', 'bookShelf'], ['secrets', 'bookSecrets'], ['collect', 'bookCollect'], ['picture', 'bookPicture'], ['pets', 'bookPets'], ['ach', 'bookAch']] as const) {
    $(pane).classList.toggle('hidden', id !== tab);
  }
  bookState.tab = tab;
}

function renderShelf(save: Save, world: WorldEntry | null) {
  const states = shelfState(save, world), box = $('shelf');
  if (pickedPlace < 0) pickedPlace = Math.max(0, SHELF.findIndex((p, i) => shelfWorld(p, i) === world?.id));
  const text = (p: ShelfPlace, s: PlaceState) => (s.kind === 'found' ? t('shelf_found')
    : s.kind === 'parts' && p.parts ? tf('shelf_parts', { n: s.n, of: s.of, parts: t(p.parts) }) : t(p.wait));
  box.innerHTML = '';
  SHELF.forEach((p, i) => {
    const s = states[i];
    const cap = s.kind === 'found' ? '✨' : s.kind === 'parts' ? `${s.n}/${s.of}` : '';
    const cls = 'place' + (s.kind === 'found' ? ' found' : s.kind === 'parts' ? ' parts' : ' sil') + (i === pickedPlace ? ' sel' : '');
    const b = button(cls, `<span class="ic">${p.icon}</span><span class="cap">${cap}</span>`, () => { pickedPlace = i; renderShelf(save, world); });
    const id = shelfWorld(p, i);
    b.dataset.place = String(i); b.dataset.state = s.kind; if (id) b.dataset.world = id;
    b.setAttribute('aria-label', t(p.art));
    box.appendChild(b);
  });
  const p = SHELF[pickedPlace];
  $('shelfSay').innerHTML = `<b>${t(p.art)}</b> · ${text(p, states[pickedPlace])}`;
}

function renderSecrets(world: WorldEntry | null, ws: { flags: Record<string, boolean> } | null) {
  const list = world?.secrets ?? [], box = $('secrets');
  box.innerHTML = '';
  let n = 0;
  for (const k of list) {
    const got = ws?.flags[k] === true;
    if (got) n++;
    const d = document.createElement('div');
    d.className = 'tile secret' + (got ? ' got' : ' sil');
    d.dataset.flag = k;
    d.innerHTML = `<span class="ic">${k === world?.chest ? CHEST_ICON : SECRET_ICON}</span>${got ? `<span class="cap">${t('found')}</span>` : ''}`;
    box.appendChild(d);
  }
  $('secretsSay').textContent = tf('book_secrets', { n, of: list.length });
}

/**
 * The collections of the world played (PLAY-25): a row a kind - its picture, its six finds (in colour when found, a
 * silhouette until then, R14) and how many of them; the line under the rows counts the whole sets.
 */
function renderCollect(world: WorldEntry | null, ws: WorldState | null) {
  const def = world?.collect, box = document.getElementById('collect');
  if (!box) return;
  box.innerHTML = '';
  const found = ws ? foundOf(ws) : [];
  const kinds = def ? setKindsOf(def) : [];        // the pieces of the picture are on their own tab
  for (const k of kinds) {
    const ids = itemsOf(def!, k), got = ids.filter((i) => found.includes(i)).length;
    const row = document.createElement('div');
    row.className = 'crow' + (got === ids.length ? ' whole' : '');
    row.dataset.kind = k; row.dataset.got = String(got);
    row.innerHTML = `<span class="cname">${t(`collect_${k}` as Key)}</span>`
      + ids.map((i) => `<span class="cell${found.includes(i) ? ' got' : ' sil'}" data-item="${i}">${findIcon(k)}</span>`).join('')
      + `<span class="cn">${tf('book_count', { n: got, of: ids.length })}</span>`;
    box.appendChild(row);
  }
  const whole = def ? kinds.filter((k) => setDone(def, k, found)).length : 0;
  $('collectSay').textContent = kinds.length ? tf('book_collect', { n: whole, of: kinds.length }) : t('book_collect_none');
}

/**
 * The picture of the world played (PLAY-29): its frame cut into cells; a piece found lies in its cell (the part of the
 * frame that is its), one not found is a silhouette (R14). Whole, a tap on it plays its scene again: it comes alive.
 */
function renderPicture(world: WorldEntry | null, ws: WorldState | null) {
  const def = world?.collect, pic = def?.picture, box = document.getElementById('picture');
  if (!box) return;
  box.innerHTML = '';
  if (!def || !pic) { $('pictureSay').textContent = t('book_pic_none'); return; }
  // with an easel (PLAY-29, src/game/easel.ts) a piece is in the frame once she has set it there; without one, once found
  const easel = !!world?.easel, flags = ws?.flags ?? {};
  const found = ws ? foundOf(ws) : [], ids = piecesOf(def);
  const shown = (id: number, cell: number) => (easel ? setCells(def, flags).includes(cell) : found.includes(id));
  const whole = easel ? pictureSet(def, flags) : pictureDone(def, found);
  const url = `${import.meta.env.BASE_URL}${pic.image}.webp`;
  box.style.setProperty('--cols', String(pic.cols)); box.style.setProperty('--rows', String(pic.rows));
  box.classList.toggle('whole', whole);
  ids.forEach((id, i) => {
    const c = document.createElement('span'), got = shown(id, i), col = i % pic.cols, row = Math.floor(i / pic.cols);
    c.className = 'pcell' + (got ? ' got' : ' sil');
    c.dataset.item = String(id); c.dataset.cell = String(i);
    if (got) {
      c.style.backgroundImage = `url("${url}")`;
      c.style.backgroundSize = `${pic.cols * 100}% ${pic.rows * 100}%`;
      c.style.backgroundPosition = `${pic.cols > 1 ? (col / (pic.cols - 1)) * 100 : 0}% ${pic.rows > 1 ? (row / (pic.rows - 1)) * 100 : 0}%`;
    } else c.innerHTML = findIcon('piece');
    box.appendChild(c);
  });
  box.onclick = whole ? () => showPicture(pic) : null;
  const got = ids.filter((id, i) => shown(id, i)).length;
  $('pictureSay').textContent = whole ? t('book_pic_done') : tf('book_pic', { n: got, of: ids.length });
}

function renderPets(save: Save, persist: () => void) {
  const found = foundPets(save), box = $('pets');
  box.innerHTML = '';
  // A pet chosen (not "none"): the cat says so - its line by the heroine, over the book.
  const pick = (id: string | null) => { if (choosePet(save, id)) { persist(); if (id) sayLine('pet_chosen'); } renderPets(save, persist); };
  for (const p of PETS) {
    const got = found.includes(p.id);
    const b = button('tile pet' + (got ? '' : ' sil') + (got && save.pet === p.id ? ' sel' : ''),
      `<span class="ic">${PET_ICON[p.id] ?? '❔'}</span><span class="cap">${got ? t(`pet_${p.id}` as Key) : t('ach_locked')}</span>`,
      got ? () => pick(p.id) : null);
    b.dataset.pet = p.id;
    box.appendChild(b);
  }
  // "No pet": only when there is one to leave at home.
  if (found.length) {
    const b = button('tile pet' + (save.pet == null ? ' sel' : ''), `<span class="ic">${PET_ICON.none}</span>`, () => pick(null));
    b.dataset.pet = 'none'; b.setAttribute('aria-label', t('book_no_pet'));
    box.appendChild(b);
  }
  $('petsSay').textContent = found.length ? t('book_pet_pick') : t('book_pet_none');
}

function renderAch(save: Save) {
  const box = $('achs');
  box.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const got = a.id in save.achievements;
    const b = button('ach' + (got ? ' got' : ' sil') + (pickedAch === a.id ? ' sel' : ''),
      `<span class="ic">${a.icon}</span><span class="cap">${got ? t(`ach_${a.id}_t` as Key) : t('ach_locked')}</span>`,
      () => { pickedAch = a.id; renderAch(save); });
    b.dataset.id = a.id; b.dataset.state = got ? 'got' : 'sil';
    box.appendChild(b);
  }
  const a = ACHIEVEMENTS.find((x) => x.id === pickedAch);
  $('achSay').innerHTML = a
    ? `<b>${a.id in save.achievements ? t(`ach_${a.id}_t` as Key) : t('ach_locked')}</b> · ${t(`ach_${a.id}_d` as Key)}`
    : `${t('ach_book')}: ${tf('book_count', { n: ACHIEVEMENTS.filter((x) => x.id in save.achievements).length, of: ACHIEVEMENTS.length })}`;
}

/** A seen cut-scene of the world (WORLD-13, src/game/story.ts): the book shows it again with a button of its own. */
export interface BookStory { id: string; icon: string; title: Key; play(): void }
let bookStories: () => readonly BookStory[] = () => [];
let closeForStory: () => void = () => {};
/** The scenes of the world played now, read at every opening (the start of the game sets it), and how the book closes for one. */
export function setBookStories(list: () => readonly BookStory[], close: () => void) { bookStories = list; closeForStory = close; }

function renderStories() {
  const box = document.getElementById('bookStories');
  if (!box) return;
  box.innerHTML = '';
  for (const st of bookStories()) {
    // a tap closes the book and plays the scene again; nothing is recorded
    const b = button('story-again', `▶ ${st.icon}`, () => { closeForStory(); st.play(); });
    b.dataset.story = st.id; b.setAttribute('aria-label', t(st.title)); b.title = t(st.title);
    box.appendChild(b);
  }
}

/**
 * Draws every section of the profile from `save` and the world played now (`achGame`, read at this call); `persist`
 * stores the save after the choice of a pet.
 */
export function renderProfile(save: Save, persist: () => void = () => achGame?.persist()) {
  const g = achGame, world = g?.world ?? null, ws = g?.ws ?? null;
  renderTabs(save);
  renderShelf(save, world);
  renderSecrets(world, ws);
  renderCollect(world, ws);
  renderPicture(world, ws);
  renderPets(save, persist);
  renderAch(save);
  renderStories();
}

/**
 * The book opens (true) or closes (false): the heroine close up on the free side, the shelf first; on the very first
 * opening the cat introduces the shelf (subtitle only).
 */
export function bookView(open: boolean, save: Save) {
  heroCloseup(open);
  // A page without the profile's markup (a unit test of the parents' section builds only its own ids): nothing to draw.
  if (!document.getElementById('bookTabs')) return;
  if (!open) { sayLine(null); return; }
  tab = 'shelf'; pickedPlace = -1; pickedAch = null;
  bookState.opened++;
  renderProfile(save);
  // The first opening is the save's (`shelfSeen`): "start again" clears it with everything else.
  if (!save.shelfSeen) { save.shelfSeen = true; bookState.firstSaid = true; sayLine('shelf_first'); } else sayLine(null);
}
