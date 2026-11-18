// The gate of a world (docs/15-tech.md, TECH-09; decision Q14): may the heroine enter the world `id` now? A world is
// open when its files are in the cache or the network can bring them; at the portal of a world that is not downloaded,
// without network, the entry is refused - the portal stays closed, the play in the other worlds goes on.
// The gate only decides and tells: it says nothing, shows nothing and never holds the controls. Everything it needs of
// the page is handed in as functions (the status of the cache of worlds, src/core/worldcache.ts `status`; the
// network; what a refusal does), so it has no state of the page of its own and is tested on stand-ins.
// Two rules come from the walkthrough, which fails on any error in the console:
// - the status is not asked for a world that needs no download by definition (the default world, a registry of one
//   world): in a build without next worlds it would request a list that is not there, and a 404 is such an error;
// - no request leaves when the page says it is offline: a request that fails is such an error too. Only when the page
//   believes it is online one real request is made (`probe`), and only its success means "the network is there".

/**
 * What the cache of worlds tells of a world (src/core/worldcache.ts `WorldStatus`): 'core' - part of the installation,
 * 'ready' - downloaded in full, 'partial' - some of its files, 'none' - not one of them.
 */
export type GateStatus = 'core' | 'ready' | 'partial' | 'none';

/**
 * The answer of the gate. `from` tells where the world will come from: 'cache' - it is there already (or needs no
 * download), enter at once; 'network' - it is not downloaded (in full), the network answered: download it first
 * (src/core/worldcache.ts `download`), then enter. `enter: false` - refused, `refuse` has been called.
 */
export type GateAnswer = { enter: true; from: 'cache' | 'network' } | { enter: false };

/** What the gate needs of the page and of the game; the tests hand in stand-ins. */
export interface GateEnv {
  /** The ids of the worlds of the registry (src/worlds/index.ts `WORLDS`). */
  worlds: readonly string[];
  /** The world that is part of the installation (src/worlds/index.ts `DEFAULT_WORLD`). */
  defaultWorld: string;
  /** The status of the world in the cache. A rejection reads as "unknown" and is treated as 'none'. */
  status: (id: string) => Promise<GateStatus>;
  /** Does the page believe it is online (`navigator.onLine`)? Only an explicit false means "offline". */
  online: () => boolean;
  /**
   * The real check of the network, asked only for a world that is not downloaded and only when `online` does not say
   * no. True - the network answered; false, a rejection or an exception - it did not. It has to settle: the time limit
   * is its own (`probeNetwork` below always settles within its limit).
   */
  probe: () => Promise<boolean>;
  /** Called once per refusal: the line of the cat and whatever else the change of world shows at a closed portal. */
  refuse: () => void;
}

export interface Gate {
  /**
   * May the world `id` be entered now? Never rejects on a failure of the cache or of the network. While a check of a
   * world runs, asking about the same world again returns the same promise: one check, one refusal, however many
   * times the portal is knocked at. An ask after the answer is a new check (and, if refused, a new refusal).
   */
  canEnter(id: string): Promise<GateAnswer>;
}

const OPEN: GateAnswer = { enter: true, from: 'cache' };
const LOAD: GateAnswer = { enter: true, from: 'network' };
const CLOSED: GateAnswer = { enter: false };

export function createGate(env: GateEnv): Gate {
  /** The checks that run now, by world. */
  const checking = new Map<string, Promise<GateAnswer>>();

  async function check(id: string): Promise<GateAnswer> {
    let status: GateStatus;
    try { status = await env.status(id); } catch { status = 'none'; }
    if (status === 'core' || status === 'ready') return OPEN;
    let network = false;
    // No request when the page says it is offline; otherwise one real request decides.
    if (env.online() !== false) {
      try { network = await env.probe() === true; } catch { /* no answer: no network */ }
    }
    if (network) return LOAD;
    env.refuse();
    return CLOSED;
  }

  function canEnter(id: string): Promise<GateAnswer> {
    // Part of the installation by definition: the cache is not asked (see the head of the file).
    if (id === env.defaultWorld || env.worlds.length <= 1) return Promise.resolve(OPEN);
    const running = checking.get(id);
    if (running) return running;
    const mine = check(id);
    checking.set(id, mine);
    // Only this check can be under `id` while it runs: a later ask joins it instead of replacing it.
    const done = () => { checking.delete(id); };
    void mine.then(done, done);
    return mine;
  }

  return { canEnter };
}

/** The file the network is probed with: it is in every build (public/, the icon of the page). */
export const PROBE_FILE = 'icon.svg';
/** How long the probe waits for the answer, ms. Nothing shows this time to the child: it only bounds the request. */
export const PROBE_TIMEOUT_MS = 4000;

/** What the probe needs of the page; the tests hand in stand-ins. */
export interface ProbeEnv {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** The address the file is relative to: the page's. */
  base: string;
  /** A value no earlier request of this page had: it makes the address new for every probe. */
  stamp: () => string;
}

let probes = 0;

function pageProbeEnv(): ProbeEnv {
  return { fetch: (url, init) => fetch(url, init), base: document.baseURI, stamp: () => `${Date.now().toString(36)}-${probes++}` };
}

/**
 * The real check of the network for the page (`GateEnv.probe`): one HEAD request of a file of the build. The address
 * carries a parameter of its own every time and the request forbids the HTTP cache, so neither the files the service
 * worker installed nor a copy kept on the way can answer for the server. The answer is read to its end, though a HEAD
 * has no body: an answer left unread is reported by Chrome as an aborted request (net::ERR_ABORTED, seen 2026-11-18),
 * which the walkthroughs rightly count as a failed request. It is cut off after `timeoutMs`. Only a
 * successful answer is true; an error status, no answer, the time running out or an exception is false - it never
 * rejects. Call it only when the page believes it is online: a request that fails is an error in the console.
 */
export async function probeNetwork(timeoutMs: number = PROBE_TIMEOUT_MS, env: ProbeEnv = pageProbeEnv()): Promise<boolean> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The race, not only the abort: a request that does not honour the signal must not hold the answer either.
  const late = new Promise<boolean>((resolve) => { timer = setTimeout(() => { abort.abort(); resolve(false); }, timeoutMs); });
  try {
    const url = new URL(PROBE_FILE, env.base);
    url.searchParams.set('net', env.stamp());
    const asked = env.fetch(url.href, { method: 'HEAD', cache: 'no-store', signal: abort.signal }).then(async (res) => { await res.arrayBuffer(); return res.ok; });
    return await Promise.race([asked, late]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
