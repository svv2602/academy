import * as THREE from 'three';
import { sfx } from '../../core/audio';
import type { Game } from '../../game/context';
import { declared, marked, ready } from '../../game/describe';
import { flyoverOf, setTour, type Flyover, type FlyoverPath } from '../../game/flyover';
import type { Spot } from '../../game/player';
import type { Listenable, WorldScope } from '../../game/scope';
import { playScene, type Stage } from '../../game/stage';
import type { WorldItem } from '../../game/world';

/**
 * The points of the world template in the probe world (ARCH-16, R28): one of every kind a world writes itself - a
 * secret, a part of the artifact that lies in the world, a cutscene, the tour and the finale. The chain of its
 * character and its pet are not here: the shared code makes those two items of what the world declares
 * (src/game/describe.ts), and the pet itself is the game's (src/game/pets.ts).
 *
 * Each is the simplest thing that can really be done in the game, and its done mark is a flag of its own name in the
 * world's part of the save (the finale's is `final`): a description says what is there, it does nothing "for the
 * walkthrough". The tour is the shared one (src/game/flyover.ts) with a path of this meadow. The secret, the part,
 * the cutscene and the finale are stand-ins of this world only: a real world takes them from the shared modules once
 * those exist (the cutscenes of WORLD-13, the secrets and the hidden parts of WORLD-08). Nothing here is spoken.
 */

/** The flags of the world's part of the save that mark its items done; each is the id of its item. */
export const SECRET = 'hollow', PART = 'gem', SCENE = 'story', TOUR = 'toured', FINALE = 'final';
/** Where the part of the artifact lies once the secret is open, the altar of the finale, and where the pet waits (m). */
export const GEM = { x: 9, z: -7 }, ALTAR = { x: -8, z: 4 }, PET_AT = { x: -7, z: -9 };
/** m: the radius of the action spots of the secret, the cutscene and the altar; each covers the place of its item. */
export const SPOT_R = 2;
/** m: closer than this to the part, the heroine picks it up. */
export const TAKE_R = 0.9;
/** Seconds of game time: the cutscene (a tap ends it sooner) and the finale. */
export const STORY_SECONDS = 2, FINALE_SECONDS = 1.5;
/** m: the camera's distance for the cutscene - the picture of the signboard close up. */
const CLOSE = 4.2;

/**
 * The tour of the meadow (WORLD-11): the shortest the rules allow (`pathProblems`), around the meadow and back to the
 * heroine. Its line is a shared recorded one: the probe world has no spoken line of its own.
 */
export const PROBE_FLYOVER: FlyoverPath = {
  seconds: 10,
  line: 'welcome_back',
  points: [
    { pos: [0, 8, 22], look: [0, 1, 0] },
    { pos: [15, 7, 9], look: [5, 1, -2] },
    { pos: [9, 9, -15], look: [0, 1, -4] },
    { pos: [-13, 8, -11], look: [-4, 1, -3] },
    { pos: [-7, 5, 13], look: [0, 1.5, 6] },
  ],
};

/** What the items stand by: the stump the secret is in, the signboard the cutscene shows, and where taps come from. */
export interface ItemPlaces {
  stump: { x: number; z: number };
  /** The foot of the signboard and the middle of its picture. */
  sign: { x: number; z: number }; picture: THREE.Vector3;
  /** The target of the taps that end the cutscene (the window). */
  taps: Listenable;
}

export interface ProbeItems {
  /** The world's own items of its description, in the order they are done (BuiltWorld.items). */
  items(): readonly WorldItem[];
  /** The action spots of the secret, the cutscene and the finale. */
  spots: readonly Spot[];
  /** A frame: what shows and turns, the part picked up by walking into it, the time of a scene that is on. */
  update(dt: number, time: number, canMove: boolean): void;
  /** The player of the tour: its state, skip() and hold(i) (window.__game.flyoverPlayer). */
  tour: Flyover;
}

export function createItems(g: Game, stage: Stage, scope: WorldScope, at: ItemPlaces): ProbeItems {
  const { ws, scene } = g;
  const point = (p: { x: number; z: number }, y = 0) => new THREE.Vector3(p.x, g.groundY(p.x, p.z) + y, p.z);
  const stump = point(at.stump), sign = point(at.sign), gemAt = point(GEM), altar = point(ALTAR);
  const mark = (flag: string) => { ws.flags[flag] = true; g.persist(); };
  const glow = (color: string, emissive: string) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.9, roughness: 0.35 });

  // ----- what lies on the meadow -----
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), glow('#fff3b0', '#ffc94d'));          // the secret, not opened yet
  light.position.copy(stump).setY(stump.y + 0.85);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), glow('#9ae6ff', '#3aa8ff'));                // the part of the artifact
  gem.position.copy(gemAt).setY(gemAt.y + 0.7);
  const ring = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), glow('#e9d5ff', '#8a5cff'));                // the altar
  ring.rotation.x = -Math.PI / 2; ring.position.copy(altar).setY(altar.y + 0.03);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), glow('#ffd1f0', '#ff7ac8'));             // the artifact, returned
  crystal.position.copy(altar).setY(altar.y + 2.4);   // over the heroine's head: she stands on the altar
  scene.add(light, gem, ring, crystal);

  // ----- a scene that is on: the cutscene or the finale, timed in game time by the frame -----
  let on: typeof SCENE | typeof FINALE | null = null;
  let left = 0, tapped = false, end: (() => void) | null = null;
  const hold = (what: typeof SCENE | typeof FINALE, seconds: number) => new Promise<void>((done) => { on = what; left = seconds; tapped = false; end = done; });
  const stop = () => { on = null; end = null; g.camOverride = null; };
  // A tap anywhere ends the cutscene (WORLD-13); the finale plays to its end.
  scope.on(at.taps, 'pointerdown', () => { if (on === SCENE) tapped = true; });
  // Left in the middle of a scene: the camera gets back what the scene took (the scope stops the tap handler itself).
  scope.own(() => { if (on) { g.camOverride = null; g.cam.focus = null; } on = null; end = null; });

  // ----- the tour: the shared one, with the path of this meadow; visited = toured (the flag is the item's mark) -----
  const tour = setTour(g, { path: PROBE_FLYOVER, visited: () => ws.flags[TOUR] === true, mark: () => mark(TOUR) });

  // ----- the items: the id of each is the name of its mark -----
  const secret = marked(ws, { kind: 'secret', id: SECRET, how: 'act', at: { x: at.stump.x, z: at.stump.z + 1.4 } });
  const part = marked(ws, { kind: 'part', id: PART, how: 'walk', at: { ...GEM }, after: [SECRET] });
  const story = marked(ws, { kind: 'scene', id: SCENE, how: 'act', at: { x: at.sign.x, z: at.sign.z + 1.5 }, active: () => on === SCENE });
  const flyover = marked(ws, { kind: 'flyover', id: TOUR, how: 'auto', active: () => flyoverOf(g)?.active === true });
  const before = [...declared(g), flyover, secret, part, story];
  const finale = marked(ws, { kind: 'finale', id: FINALE, how: 'act', at: { ...ALTAR }, after: before.map((i) => i.id), active: () => on === FINALE });
  const own: readonly WorldItem[] = [flyover, secret, part, story, finale];
  const all = [...before, finale];

  function open() {
    if (secret.done()) return;
    mark(SECRET);
    sfx('good');
    g.sparks.burst(g.above(stump, 0.9), '#ffe066', 24, 3);
  }
  function take() {
    mark(PART);
    sfx('chime');
    g.sparks.burst(g.above(gemAt, 0.7), '#9ae6ff', 24, 3);
  }
  const watch = () => playScene(stage, 'probe story', async () => {
    g.cam.focus = at.picture; g.camOverride = CLOSE;
    await hold(SCENE, STORY_SECONDS);
    stop();
    mark(SCENE);
  });
  const restore = () => playScene(stage, 'probe finale', async () => {
    g.cam.focus = g.above(altar, 1);
    await hold(FINALE, FINALE_SECONDS);
    stop();
    ws.final = true; g.persist();
    sfx('fanfare');
    g.sparks.burst(g.above(altar, 2.4), '#ffd1f0', 40, 4);
  });

  return {
    items: () => own,
    spots: [
      { pos: stump, r: SPOT_R, label: 'open', on: () => !secret.done(), run: open },
      { pos: sign, r: SPOT_R, label: 'probe_look', on: () => true, run: () => { void watch(); } },
      // The finale waits for everything it comes after: the description and the game read the same list.
      { pos: altar, r: SPOT_R, label: 'place', on: () => !finale.done() && ready(finale, all), run: () => { void restore(); } },
    ],
    update(dt, time, canMove) {
      light.visible = !secret.done();
      gem.visible = ready(part, all) && !part.done();
      crystal.visible = finale.done();
      gem.rotation.y = crystal.rotation.y = time * 1.5;
      const hp = g.hero.root.position;
      if (canMove && gem.visible && Math.hypot(hp.x - gemAt.x, hp.z - gemAt.z) < TAKE_R) take();
      if (end) {
        left -= dt;
        // The scene goes on from here once, after this frame: until then it is still on.
        if (left <= 0 || tapped) { const done = end; end = null; done(); }
      }
    },
    tour,
  };
}
