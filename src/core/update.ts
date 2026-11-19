// A new version of the game (TECH-13): it is switched on at the next launch, never in the middle of a game.
// The service worker of a new build installs while the game is played and waits (vite.config.ts: registerType
// 'prompt', skipWaiting false). It becomes the active one either when every page of the game is closed (the browser
// does that), or here: while the start screen is on ("Play" not pressed yet) and no other page of the game answers,
// this page asks the waiting worker to take over (the message SKIP_WAITING, its listener is the one workbox writes into
// sw.js) and reloads itself once, when the new worker has taken it. After "Play" this page never does it.
//
// "Another page of the game" is one that answers on the channel below: a page frozen in the background by the browser
// does not answer and does not hold the update back - it is not played, and when it wakes it has the files it already
// loaded; a file it has not asked for yet is the new build's, just as without the service worker (the hosting keeps the
// last build only).
//
// The state is shown to the grown-ups in the version line of the parents' section (`onState`), not spoken: "none",
// "downloading" (a new worker installs), "ready" (it waits for the next launch).

export type UpdateState = 'none' | 'downloading' | 'ready';
/** Why the waiting worker was not asked to take over (for the walkthrough, `__game.update`). */
export type UpdateHeld = null | 'playing' | 'other-page' | 'tried';

/** The part of a worker and a registration this module uses (a stand-in in the unit test). */
export interface WorkerLike {
  state: string;
  postMessage(m: unknown): void;
  addEventListener(type: 'statechange', f: () => void): void;
}
export interface RegistrationLike {
  installing: WorkerLike | null;
  waiting: WorkerLike | null;
  active: WorkerLike | null;
  update(): Promise<unknown>;
  addEventListener(type: 'updatefound', f: () => void): void;
}
export interface ContainerLike {
  ready: Promise<RegistrationLike>;
  addEventListener(type: 'controllerchange', f: () => void): void;
}
export interface ChannelLike {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

export interface UpdateDeps {
  /** navigator.serviceWorker; undefined without service workers (the development server, an old browser). */
  sw: ContainerLike | undefined;
  /** A channel shared by every page of the game of this origin (BroadcastChannel). */
  channel: () => ChannelLike | null;
  /** True once "Play" was pressed in this page: from then on the version of this page stays. */
  playing: () => boolean;
  /** Reload this page (location.reload). */
  reload: () => void;
  /** Hold "Play" while the new worker takes over, so the game does not start a moment before the reload. */
  hold: (on: boolean) => void;
  /** sessionStorage of this page: one try per launch of a tab, a second reload into the same waiting worker is not made. */
  session: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } | null;
  setTimeout: (f: () => void, ms: number) => unknown;
  /** The page became visible again (document visibilitychange); `hiddenMs` is how long it was hidden. */
  onVisible: (f: (hiddenMs: number) => void) => void;
  /** The page goes away (pagehide). */
  onLeave: (f: () => void) => void;
}

export const CHANNEL = 'amw-pages';
/** How long a page waits for an answer of another page of the game before it takes the update. */
export const ASK_MS = 400;
/** How long the new worker gets to take the page after SKIP_WAITING; nothing happens if it does not. */
export const TAKE_MS = 5000;
/** A page hidden at least this long asks for a new version when it comes back (it may have been open for days). */
export const CHECK_AFTER_HIDDEN_MS = 60_000;
const TRIED = 'amw-update-tried';

export interface Updater {
  state(): UpdateState;
  held(): UpdateHeld;
  onState(f: (s: UpdateState) => void): void;
  /** Look again whether the waiting worker can take over (the start screen, a page of the game gone). */
  consider(): void;
}

export function createUpdater(d: UpdateDeps): Updater {
  let reg: RegistrationLike | null = null;
  let st: UpdateState = 'none';
  let why: UpdateHeld = null;
  let asking = false;
  let taking = false;
  const listeners: ((s: UpdateState) => void)[] = [];
  const set = (s: UpdateState) => { if (s === st) return; st = s; for (const f of listeners) f(s); };
  const channel = d.channel();
  let answers = 0;

  // Every page of the game answers the question "anybody here?" and says when it goes away.
  if (channel) {
    channel.onmessage = (e) => {
      const m = e.data as { t?: string } | null;
      if (m?.t === 'who') channel.postMessage({ t: 'here' });
      else if (m?.t === 'here') answers++;
      else if (m?.t === 'bye') consider();
    };
  }
  d.onLeave(() => { channel?.postMessage({ t: 'bye' }); });

  const watch = (w: WorkerLike | null) => {
    if (!w) return;
    w.addEventListener('statechange', () => { look(); });
  };
  function look() {
    if (!reg) return;
    if (reg.waiting) set('ready');
    else if (reg.installing) set('downloading');
    else set('none');
    if (reg.waiting) consider();
    else d.session?.removeItem(TRIED);
  }

  function consider() {
    const w = reg?.waiting;
    if (!w || asking || taking) return;
    if (d.playing()) { why = 'playing'; return; }
    if (d.session?.getItem(TRIED)) { why = 'tried'; return; }
    if (!channel) { take(w); return; }
    asking = true; answers = 0;
    channel.postMessage({ t: 'who' });
    d.setTimeout(() => {
      asking = false;
      if (answers > 0) { why = 'other-page'; return; }
      if (d.playing()) { why = 'playing'; return; }
      if (reg?.waiting === w) take(w);
    }, ASK_MS);
  }

  function take(w: WorkerLike) {
    taking = true; why = null;
    d.hold(true);
    d.session?.setItem(TRIED, '1');
    d.setTimeout(() => { if (taking) { taking = false; d.hold(false); } }, TAKE_MS);
    w.postMessage({ type: 'SKIP_WAITING' });
  }

  if (d.sw) {
    // Only the change asked for here reloads: the very first worker takes the page too (clientsClaim), and that is no update.
    d.sw.addEventListener('controllerchange', () => {
      if (!taking) return;
      taking = false;
      if (d.playing()) { d.hold(false); return; }
      d.reload();
    });
    void d.sw.ready.then((r) => {
      reg = r;
      r.addEventListener('updatefound', () => { watch(r.installing); look(); });
      watch(r.installing); watch(r.waiting);
      look();
    });
    d.onVisible((hiddenMs) => {
      if (!reg) return;
      if (hiddenMs >= CHECK_AFTER_HIDDEN_MS) void reg.update().catch(() => {});
      consider();
    });
  }

  return {
    state: () => st,
    held: () => why,
    onState: (f) => { listeners.push(f); f(st); },
    consider,
  };
}

/** The updater of the page: the browser's own service worker container, channel, session storage and events. */
export function startUpdater(o: { playing: () => boolean; hold: (on: boolean) => void }): Updater {
  let hiddenAt = 0;
  return createUpdater({
    sw: 'serviceWorker' in navigator ? (navigator.serviceWorker as unknown as ContainerLike) : undefined,
    channel: () => { try { return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) as unknown as ChannelLike : null; } catch { return null; } },
    playing: o.playing,
    reload: () => { location.reload(); },
    hold: o.hold,
    session: (() => { try { return sessionStorage; } catch { return null; } })(),
    setTimeout: (f, ms) => setTimeout(f, ms),
    onVisible: (f) => {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { hiddenAt = Date.now(); return; }
        f(hiddenAt ? Date.now() - hiddenAt : 0);
      });
    },
    onLeave: (f) => { addEventListener('pagehide', f); },
  });
}
