// @vitest-environment happy-dom
/**
 * Zheleyka, the pet of the Sweet Land (docs/worlds/world-4.md «Питомец мира», PLAY-09; src/game/pets.ts): Tyanuchka asks
 * for his little one after his chain, the baby hides between the lollipops of the candy garden, behind its tallest one
 * from the ways - in nothing of the world, no button of another there - and the finale never waits for him.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PET_SPOT_R, petProblems, petSpecies } from '../../game/pets';
import CLIPS from './clips.json';
import { sweetHabitat } from './creatures';
import { FRIENDS, ZHELEYKA, sweet } from './index';
import { COTTON_CLOUD, EDGE, HALF, LANDMARKS, ZONES } from './layout';
import { buildScenery, gardenTrees, placeSweets } from './scenery';
import { strings } from './strings';
import { voices } from './voices';
import { colliders, pathDist, resolve, riverDist } from './terrain';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed here
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

const dist = (p: { x: number; z: number }) => Math.hypot(p.x - ZHELEYKA.x, p.z - ZHELEYKA.z);

describe('Zheleyka, the pet of the Sweet Land (PLAY-09)', () => {
  afterEach(() => { colliders.length = 0; });

  it('the Sweet Land declares him: of its own, after Tyanuchka\'s chain, in the candy garden, with the cat\'s own words', () => {
    expect(sweet.pet).toEqual({ species: 'zheleyka', at: ZHELEYKA, after: 'tyanuchka', found: 'sweet_pet_found', follow: 'sweet_pet_follow' });
    expect(petProblems(sweet)).toEqual([]);
    // his big brother's model of the world's files, small and lighter, hopping on its Hop clip on the ground
    expect(petSpecies('zheleyka')).toMatchObject({ world: 'sweet', model: 'sweet/tyanuchka', own: true, height: 0.7, fly: { clip: 'Hop', height: 0 } });
    expect(petSpecies('zheleyka')!.lighter).toBeGreaterThan(0);
    // in the garden, past its tallest lollipop from the garden's middle (hidden behind it from the ways), inside the land
    const g = ZONES.garden, L = LANDMARKS.garden;
    expect(Math.hypot(ZHELEYKA.x - g.x, ZHELEYKA.z - g.z)).toBeLessThan(9);
    expect(Math.hypot(ZHELEYKA.x - g.x, ZHELEYKA.z - g.z)).toBeGreaterThan(Math.hypot(L.x - g.x, L.z - g.z));
    expect(dist(L)).toBeLessThan(5);
    expect(Math.hypot(ZHELEYKA.x, ZHELEYKA.z)).toBeLessThan(HALF - EDGE - 2);
  });

  it('Tyanuchka asks for him after his thanks, in his own voice; the cat\'s words of the find are recorded too', () => {
    const t = FRIENDS.find((c) => c.id === 'tyanuchka')!;
    expect(t.after).toBe('tyanuchka_pet_ask');
    // the other characters ask for nothing after theirs: the cat's "go on"
    expect(FRIENDS.filter((c) => c.after).map((c) => c.id)).toEqual(['tyanuchka']);
    const cast = voices.cast as Record<string, { voice: string }>;
    expect(CLIPS).toContain(`tyanuchka_pet_ask@${cast.tyanuchka.voice}`);
    for (const k of ['tyanuchka_pet_ask', 'sweet_pet_found', 'sweet_pet_follow']) expect(Object.hasOwn(strings.spoken, k), k).toBe(true);
    expect(CLIPS).toEqual(expect.arrayContaining(['sweet_pet_found', 'sweet_pet_follow']));
  });

  it('he is inside nothing and off the ways: off every collider, between the lollipops, past the bears and the leaves', () => {
    colliders.length = 0;
    buildScenery({ add: () => {} } as never);
    const q = { ...ZHELEYKA };
    resolve(q, 0.3);
    expect(dist(q), 'a collider pushes him').toBeLessThan(1e-6);
    // between the lollipop trees: the nearest one's stick within 2 m, none on him
    const trees = [...gardenTrees(), ...placeSweets().lollipops].map((t) => dist(t) - 0.5 * t.s);
    expect(Math.min(...trees)).toBeGreaterThan(0.6);
    expect(Math.min(...trees)).toBeLessThan(2);
    // off the ways and the river: found by looking, not by walking past
    expect(pathDist(ZHELEYKA.x, ZHELEYKA.z)).toBeGreaterThan(6);
    expect(riverDist(ZHELEYKA.x, ZHELEYKA.z)).toBeGreaterThan(6);
    const h = sweetHabitat();
    for (const p of [...h.bears, ...h.leaves]) expect(dist(p)).toBeGreaterThan(2);
  });

  it('at him his own button: no character\'s talk, no secret\'s spot reaches his', () => {
    const TALK_R = 3.0;   // ./index.ts: the spot "talk" of a character
    for (const c of FRIENDS) expect(dist(c), c.id).toBeGreaterThan(TALK_R + PET_SPOT_R);
    expect(dist(COTTON_CLOUD)).toBeGreaterThan(PET_SPOT_R + 3);
  });

  it('the finale waits for the chains, the tour and the rubies, never for him; the Sweet Land loads his model as a pet\'s', () => {
    const raw = Object.values(import.meta.glob('./index.ts', { query: '?raw', import: 'default', eager: true }))[0] as string;
    expect(raw).toMatch(/const before = \[\.\.\.declared\(g\)\.filter\(\(i\) => i\.kind !== 'pet'\), tourItem, \.\.\.rubyItems\];/);
    expect(raw).toMatch(/loadOwnPets\('sweet', \['zheleyka'\], scope\)/);
  });
});
