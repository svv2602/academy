// @vitest-environment happy-dom
/**
 * Bulchik, the pet of the sea (docs/worlds/world-3.md «Питомец мира», PLAY-09; src/game/pets.ts): Bulk asks for his
 * little brother after his chain, the baby hides in the shell garden behind its great shell - in nothing of the world,
 * no button of another there - and the finale never waits for him.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PET_SPOT_R, petProblems, petSpecies } from '../../game/pets';
import CLIPS from './clips.json';
import { seaHabitat } from './creatures';
import { BULCHIK, FRIENDS, sea } from './index';
import { EDGE, HALF, LANDMARKS, LIFT_ROCK, LOOKOUT, ZONES } from './layout';
import { placeLife, buildScenery } from './scenery';
import { shellsOf } from './secrets';
import { strings } from './strings';
import { voices } from './voices';
import { colliders, resolve } from './terrain';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed here
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

const dist = (p: { x: number; z: number }) => Math.hypot(p.x - BULCHIK.x, p.z - BULCHIK.z);

describe('Bulchik, the pet of the sea (PLAY-09)', () => {
  afterEach(() => { colliders.length = 0; });

  it('the sea declares him: of its own, after Bulk\'s chain, behind the garden\'s great shell, with the cat\'s own words', () => {
    expect(sea.pet).toEqual({ species: 'bulchik', at: BULCHIK, after: 'bulk', found: 'sea_pet_found', follow: 'sea_pet_follow' });
    expect(petProblems(sea)).toEqual([]);
    expect(petSpecies('bulchik')).toMatchObject({ world: 'sea', model: 'sea/bulk' });
    // in the garden, past its great shell from the garden's middle (hidden behind it), in the water
    const g = ZONES.garden, L = LANDMARKS.garden;
    expect(Math.hypot(BULCHIK.x - g.x, BULCHIK.z - g.z)).toBeLessThan(9);
    expect(Math.hypot(BULCHIK.x - g.x, BULCHIK.z - g.z)).toBeGreaterThan(Math.hypot(L.x - g.x, L.z - g.z));
    expect(Math.hypot(BULCHIK.x, BULCHIK.z)).toBeLessThan(HALF - EDGE - 2);
  });

  it('Bulk asks for him after his thanks, in his own voice; the cat\'s words of the find are recorded too', () => {
    const bulk = FRIENDS.find((c) => c.id === 'bulk')!;
    expect(bulk.after).toBe('bulk_pet_ask');
    // the other characters ask for nothing after theirs: the cat's "go on"
    expect(FRIENDS.filter((c) => c.after).map((c) => c.id)).toEqual(['bulk']);
    const cast = voices.cast as Record<string, { voice: string }>;
    expect(CLIPS).toContain(`bulk_pet_ask@${cast.bulk.voice}`);
    for (const k of ['bulk_pet_ask', 'sea_pet_found', 'sea_pet_follow']) expect(Object.hasOwn(strings.spoken, k), k).toBe(true);
    expect(CLIPS).toEqual(expect.arrayContaining(['sea_pet_found', 'sea_pet_follow']));
  });

  it('he is inside nothing: off every collider of the scenery, past the ring of the small shells, the echo shells and the creatures', () => {
    colliders.length = 0;
    buildScenery({ add: () => {} } as never);
    const q = { ...BULCHIK };
    resolve(q, 0.3);
    expect(dist(q), 'a collider pushes him').toBeLessThan(1e-6);
    // the great shell (collider r 1.8) by less than 2 m: behind it, not in the open
    expect(dist(LANDMARKS.garden)).toBeLessThan(1.8 + 2);
    // the garden's small shells lie 3-6.2 m round its middle (./scenery.ts): he is past them
    expect(Math.hypot(BULCHIK.x - ZONES.garden.x, BULCHIK.z - ZONES.garden.z)).toBeGreaterThan(6.2 + 1);
    // no coral, kelp, rock or anemone on him (they have no collider)
    const life = placeLife();
    for (const [kind, list] of Object.entries(life)) for (const p of list) expect(dist(p), kind).toBeGreaterThan(1.2 * p.s + 0.5);
    // the echo shells (colliders r 0.8) and the creatures
    for (const p of shellsOf().at) expect(dist(p)).toBeGreaterThan(0.8 + 1.5);
    const h = seaHabitat();
    for (const p of [...h.jellies, ...h.crabs, ...h.starfish]) expect(dist(p)).toBeGreaterThan(2);
    for (const s of h.schools) expect(dist(s)).toBeGreaterThan(s.r + 2);
  });

  it('at him his own button: no character\'s talk, no secret\'s spot reaches his', () => {
    const TALK_R = 3.0;   // ./index.ts: the spot "talk" of a character
    for (const c of FRIENDS) expect(dist(c), c.id).toBeGreaterThan(TALK_R + PET_SPOT_R);
    // the echo shells' "listen" (r 2.6), the bubble lift's rock and the lookout
    expect(dist(shellsOf().front)).toBeGreaterThan(2.6 + PET_SPOT_R);
    for (const p of [LIFT_ROCK, LOOKOUT]) expect(dist(p)).toBeGreaterThan(p.r + PET_SPOT_R + 3);
  });

  it('the finale waits for the chains, the tour and the pearls, never for him; the sea loads his model as a pet\'s', () => {
    const raw = Object.values(import.meta.glob('./index.ts', { query: '?raw', import: 'default', eager: true }))[0] as string;
    expect(raw).toMatch(/const before = \[\.\.\.declared\(g\)\.filter\(\(i\) => i\.kind !== 'pet'\), tourItem, \.\.\.pearlItems\];/);
    expect(raw).toMatch(/loadOwnPets\('sea', \['bulchik'\], scope\)/);
  });
});
