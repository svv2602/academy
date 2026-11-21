// TECH-13: a new version is switched on at the start screen before "Play" (one reload, no other page of the game
// answers) or once every page is closed; never after "Play". The browser's parts are stand-ins here.
import { describe, expect, it } from 'vitest';
import { ASK_MS, CHECK_AFTER_HIDDEN_MS, TAKE_MS, createUpdater, type ChannelLike, type UpdateDeps, type WorkerLike } from './update';

class FakeWorker implements WorkerLike {
  sent: unknown[] = [];
  private fs: (() => void)[] = [];
  constructor(public state: string) {}
  postMessage(m: unknown) { this.sent.push(m); }
  addEventListener(_t: 'statechange', f: () => void) { this.fs.push(f); }
  to(s: string) { this.state = s; for (const f of this.fs) f(); }
}

/** A world of pages: each has a channel joined to the others (as BroadcastChannel: a page does not hear itself). */
function bus() {
  const all: ChannelLike[] = [];
  const make = () => {
    const c: ChannelLike = {
      onmessage: null,
      postMessage: (m) => { for (const o of all) if (o !== c) queueMicrotask(() => o.onmessage?.({ data: m })); },
    };
    all.push(c);
    return c;
  };
  /** The page is gone: its channel no longer hears or answers. */
  make.drop = (c: ChannelLike) => { all.splice(all.indexOf(c), 1); };
  return make;
}

function page(o: { bus?: ReturnType<typeof bus>; waiting?: FakeWorker | null; installing?: FakeWorker | null } = {}) {
  const timers: { at: number; f: () => void }[] = [];
  let now = 0;
  const changes: (() => void)[] = [];
  const found: (() => void)[] = [];
  const visible: ((ms: number) => void)[] = [];
  const leave: (() => void)[] = [];
  const store = new Map<string, string>();
  let mine: ChannelLike | null = null;
  const reg = {
    installing: o.installing ?? null, waiting: o.waiting ?? null, active: new FakeWorker('activated') as WorkerLike | null,
    updates: 0,
    update: async () => { reg.updates++; },
    addEventListener: (_t: 'updatefound', f: () => void) => { found.push(f); },
  };
  const s = { playing: false, reloads: 0, held: [] as boolean[] };
  const deps: UpdateDeps = {
    sw: { ready: Promise.resolve(reg), addEventListener: (_t, f) => { changes.push(f); } },
    channel: () => (mine = o.bus?.() ?? null),
    playing: () => s.playing,
    reload: () => { s.reloads++; },
    hold: (on) => { s.held.push(on); },
    session: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); }, removeItem: (k) => { store.delete(k); } },
    setTimeout: (f, ms) => { timers.push({ at: now + ms, f }); },
    onVisible: (f) => { visible.push(f); },
    onLeave: (f) => { leave.push(f); },
  };
  const u = createUpdater(deps);
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return {
    u, reg, s, store,
    /** Let time pass: microtasks first, then every timer due. */
    async pass(ms: number) {
      await flush();
      now += ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        due.f();
        await flush();
      }
    },
    /** The new worker took the page (clientsClaim after skipWaiting). */
    controllerchange() { for (const f of changes) f(); },
    updatefound(w: FakeWorker) { reg.installing = w; for (const f of found) f(); },
    show(ms: number) { for (const f of visible) f(ms); },
    leave() { for (const f of leave) f(); if (mine) o.bus?.drop(mine); },
  };
}
const SKIP = { type: 'SKIP_WAITING' };

describe('the start screen: a waiting new version is switched on with one reload', () => {
  it('a worker waiting at launch, no other page: SKIP_WAITING, "Play" held, and one reload when it has taken the page', async () => {
    const w = new FakeWorker('installed');
    const p = page({ bus: bus(), waiting: w });
    await p.pass(0);
    expect(p.u.state()).toBe('ready');
    expect(w.sent).toEqual([]);                 // first it asks whether another page of the game is open
    await p.pass(ASK_MS);
    expect(w.sent).toEqual([SKIP]);
    expect(p.s.held).toEqual([true]);
    expect(p.s.reloads).toBe(0);
    p.controllerchange();
    expect(p.s.reloads).toBe(1);
  });

  it('a new version that finishes installing while the start screen is on is switched on too', async () => {
    const p = page({ bus: bus() });
    await p.pass(0);
    expect(p.u.state()).toBe('none');
    const w = new FakeWorker('installing');
    p.updatefound(w);
    expect(p.u.state()).toBe('downloading');
    p.reg.installing = null; p.reg.waiting = w; w.to('installed');
    expect(p.u.state()).toBe('ready');
    await p.pass(ASK_MS);
    expect(w.sent).toEqual([SKIP]);
    p.controllerchange();
    expect(p.s.reloads).toBe(1);
  });

  it('another page that answers late (its frame took 2.5 s) still holds the update back; "Play" is free meanwhile', async () => {
    const b = bus(), w = new FakeWorker('installed');
    const other = b(), asked: unknown[] = [];
    other.onmessage = (e) => { asked.push(e.data); };
    const p = page({ bus: b, waiting: w });
    await p.pass(0);
    expect(asked).toEqual([{ t: 'who' }]);
    await p.pass(2500);
    expect(w.sent).toEqual([]);
    expect(p.s.held).toEqual([]);              // the child may press "Play" while the page asks
    other.postMessage({ t: 'here' });
    await p.pass(ASK_MS - 2500);
    expect(w.sent).toEqual([]);
    expect(p.u.held()).toBe('other-page');
    expect(p.s.reloads).toBe(0);
  });

  it('"Play" pressed while the page asks: the update waits for the next launch, no reload', async () => {
    const w = new FakeWorker('installed');
    const p = page({ bus: bus(), waiting: w });
    await p.pass(1000);
    p.s.playing = true;
    await p.pass(ASK_MS);
    expect(w.sent).toEqual([]);
    expect(p.u.held()).toBe('playing');
    expect(p.s.reloads).toBe(0);
  });

  it('the first worker taking the page (clientsClaim) is no update: no reload', async () => {
    const p = page({ bus: bus() });
    await p.pass(0);
    p.controllerchange();
    expect(p.s.reloads).toBe(0);
  });

  it('a worker that does not take the page in time: "Play" is given back, no reload, no second try in this tab', async () => {
    const w = new FakeWorker('installed');
    const p = page({ bus: bus(), waiting: w });
    await p.pass(ASK_MS);
    expect(w.sent).toEqual([SKIP]);
    await p.pass(TAKE_MS);
    expect(p.s.held).toEqual([true, false]);
    p.u.consider();
    await p.pass(ASK_MS);
    expect(w.sent).toEqual([SKIP]);
    expect(p.u.held()).toBe('tried');
    expect(p.s.reloads).toBe(0);
  });

  it('after the reload into the new version (nothing waits) the try of the tab is forgotten', async () => {
    const p = page({ bus: bus() });
    p.store.set('amw-update-tried', '1');
    await p.pass(0);
    expect(p.store.has('amw-update-tried')).toBe(false);
  });
});

describe('the game is played: the version of the page stays', () => {
  it('after "Play" a waiting worker is never asked to take over, the page is not reloaded', async () => {
    const p = page({ bus: bus() });
    await p.pass(0);
    p.s.playing = true;
    const w = new FakeWorker('installing');
    p.updatefound(w);
    p.reg.installing = null; p.reg.waiting = w; w.to('installed');
    await p.pass(ASK_MS + TAKE_MS);
    p.show(CHECK_AFTER_HIDDEN_MS);
    await p.pass(ASK_MS);
    expect(w.sent).toEqual([]);
    expect(p.u.state()).toBe('ready');
    expect(p.u.held()).toBe('playing');
    p.controllerchange();                         // another page's doing, or the browser's
    expect(p.s.reloads).toBe(0);
  });

  it('"Play" pressed while the other pages were asked: nothing is taken', async () => {
    const w = new FakeWorker('installed');
    const p = page({ bus: bus(), waiting: w });
    await p.pass(0);
    p.s.playing = true;
    await p.pass(ASK_MS);
    expect(w.sent).toEqual([]);
    expect(p.u.held()).toBe('playing');
  });

  it('"Play" pressed after SKIP_WAITING (it was held, but say it came through): no reload when the worker takes the page', async () => {
    const w = new FakeWorker('installed');
    const p = page({ bus: bus(), waiting: w });
    await p.pass(ASK_MS);
    p.s.playing = true;
    p.controllerchange();
    expect(p.s.reloads).toBe(0);
    expect(p.s.held).toEqual([true, false]);
  });
});

describe('another page of the game is open', () => {
  it('a page that answers holds the update back; when it goes away the start screen takes it', async () => {
    const b = bus();
    const playing = page({ bus: b });
    playing.s.playing = true;
    await playing.pass(0);
    const w = new FakeWorker('installed');
    const start = page({ bus: b, waiting: w });
    await start.pass(0); await playing.pass(0);
    await start.pass(ASK_MS);
    expect(w.sent).toEqual([]);
    expect(start.u.held()).toBe('other-page');
    expect(start.s.reloads).toBe(0);
    playing.leave();                               // pagehide: "bye"
    await start.pass(0);
    await start.pass(ASK_MS);
    expect(w.sent).toEqual([SKIP]);
    start.controllerchange();
    expect(start.s.reloads).toBe(1);
  });

  it('without a channel (an old browser) the waiting worker is taken at once', async () => {
    const w = new FakeWorker('installed');
    const p = page({ waiting: w });
    await p.pass(0);
    expect(w.sent).toEqual([SKIP]);
  });
});

describe('the state for the parents\' section, and a page open for long', () => {
  it('none -> downloading -> ready, every change told', async () => {
    const p = page({ bus: bus() });
    const seen: string[] = [];
    p.u.onState((s) => seen.push(s));
    await p.pass(0);
    p.s.playing = true;
    const w = new FakeWorker('installing');
    p.updatefound(w);
    p.reg.installing = null; p.reg.waiting = w; w.to('installed');
    expect(seen).toEqual(['none', 'downloading', 'ready']);
  });

  it('back after an hour in the background: a new version is asked for; after a short look away it is not', async () => {
    const p = page({ bus: bus() });
    await p.pass(0);
    p.show(1000);
    expect(p.reg.updates).toBe(0);
    p.show(CHECK_AFTER_HIDDEN_MS);
    expect(p.reg.updates).toBe(1);
  });

  it('without service workers nothing is done and the state stays "none"', async () => {
    const u = createUpdater({
      sw: undefined, channel: () => null, playing: () => false, reload: () => { throw new Error('no reload'); }, hold: () => {},
      session: null, setTimeout: () => {}, onVisible: () => {}, onLeave: () => {},
    });
    await Promise.resolve();
    expect(u.state()).toBe('none');
  });
});
