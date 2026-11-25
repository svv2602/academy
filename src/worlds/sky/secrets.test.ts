/**
 * The secrets of the Sky Islands (./secrets.ts; PLAY-07, docs/worlds/world-5.md «Секреты»): four, each found once with
 * its stars; the chest on the tiny islet behind the dragon island, reached on foot by its deck, opens its lid; the
 * rainbow slide takes her down to the lower ledge, where the star is the find, and the ledge's action takes her back
 * up - never into the clouds; the little windmill turns the clouds into animals every time; the nest's little dragons
 * circle her every time she comes; all of them on their ground, off the ways and the lines of sight.
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRAVITY } from '../../core/tuning';
import { createWorldScope } from '../../game/scope';
import { BRIDGES, HALF, ISLANDS, NOOKS, NOOK_RAIL, RAIL, ZONES } from './layout';
import { buildScenery, SIGHT, sightLines } from './scenery';
import {
  CHEST_FLAG, CIRCLE_R, LIFT_S, NEST_FLAG, NEST_S, NEST_WAIT, SECRET_HOW, SHAPES_FLAG, SHAPES_S, SKY_SECRETS, SLIDE_FLAG, chestOf,
  createSkySecrets, drakeGeometry, lidGeometry, millOf, nestOf, propsGeometry, shapesGeometry, slideOf, starGeometry,
} from './secrets';
import { colliders, height, islandAt, lineDist, nookAt, nookWayAt, onGround, pathDist, resolve } from './terrain';

/** A game of what the secrets read: the scene, the save, the heroine, the cat, the stars given. */
function game() {
  const scene = new THREE.Scene(), hero = { root: new THREE.Object3D(), heading: 0 };
  const stars: number[] = [], cat: string[] = [];
  const g = {
    scene, hero,
    cat: { once: (c: string) => { cat.push(c); } },
    ws: { flags: {} as Record<string, unknown> },
    addStars: (n: number) => { stars.push(n); },
    above: (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy),
    persist: () => {},
    sparks: { burst: () => {} },
  };
  const scope = createWorldScope(scene);
  const s = createSkySecrets(g as unknown as Parameters<typeof createSkySecrets>[0], scope);
  return { g, s, stars, cat, scope, hp: hero.root.position, vy: 0, lowest: Infinity, off: 0 };
}
type T = ReturnType<typeof game>;
/** A frame of the game as src/game/player.ts walks her: resolve, the ground under her feet, gravity; then the secrets. */
function frame(t: T, dt = 1 / 30, canMove = true) {
  const { hp } = t;
  resolve(hp, 0.4);
  const ground = height(hp.x, hp.z);
  hp.y += t.vy * dt - 0.5 * GRAVITY * dt * dt; t.vy -= GRAVITY * dt;
  if (hp.y <= ground) { hp.y = ground; t.vy = 0; }
  t.s.update(dt, 0, canMove);
  // what she stands on after every frame: never the clouds
  t.lowest = Math.min(t.lowest, hp.y);
  if (!onGround(hp.x, hp.z)) t.off++;
}
const run = (t: T, s: number, each?: () => void) => { for (let k = 0; k < s * 30; k++) { each?.(); frame(t); } };
const put = (t: T, p: { x: number; z: number }) => { t.hp.set(p.x, height(p.x, p.z), p.z); t.vy = 0; };
/** She walks toward `p` herself, a step each frame. */
const walk = (t: T, p: { x: number; z: number }, frames = 30) => {
  for (let k = 0; k < frames; k++) {
    const left = frames - k;
    t.hp.x += (p.x - t.hp.x) / left; t.hp.z += (p.z - t.hp.z) / left;
    frame(t);
  }
};

describe('the secrets of the Sky Islands (PLAY-07)', () => {
  let made: T[] = [];
  const fresh = () => { const t = game(); made.push(t); return t; };
  afterEach(() => { for (const t of made) t.scope.dispose(); made = []; colliders.length = 0; });

  it('four, as the world description says: the chest, the slide, the clouds, the nest; the chest and the windmill by the action, the others by walking', () => {
    expect([...SKY_SECRETS]).toEqual(['sky_chest', 'rainbow_slide', 'cloud_shapes', 'dragon_nest']);
    expect(SECRET_HOW).toEqual({ sky_chest: 'act', rainbow_slide: 'walk', cloud_shapes: 'act', dragon_nest: 'walk' });
    expect(CHEST_FLAG).toBe('sky_chest');
  });

  it('the islet lies behind the dragon island, the ledge under the windmill island\'s edge; neither touches an island, both inside the map', () => {
    const { islet, ledge } = NOOKS, dragon = ISLANDS.dragon, mills = ISLANDS.mills;
    // behind the dragon island: farther west than it, seen from the castle
    expect(islet.x).toBeLessThan(dragon.x - dragon.r);
    expect(ledge.x).toBeGreaterThan(mills.x + mills.r * 0.5);
    expect(ledge.top).toBeLessThan(mills.top - 3);
    for (const n of [islet, ledge]) {
      expect(Math.hypot(n.x, n.z) + n.r).toBeLessThan(HALF);
      for (const [id, i] of Object.entries(ISLANDS)) expect(Math.hypot(n.x - i.x, n.z - i.z), id).toBeGreaterThan(n.r + i.r + 2);
      // off every bridge of the map and its measured ways
      expect(pathDist(n.x, n.z)).toBeGreaterThan(n.r + 5);
    }
    // the map the measurements read is the same: six zones, four bridges
    expect(Object.keys(ISLANDS)).toHaveLength(6);
    expect(BRIDGES).toHaveLength(4);
  });

  it('they stand on their ground, off the ways and the lines of sight; where each is done she can stand, nothing pushes her off', () => {
    const ch = chestOf(), sl = slideOf(), ml = millOf(), ns = nestOf();
    expect(nookAt(ch.at.x, ch.at.z)).toBe('islet');
    expect(nookAt(ch.front.x, ch.front.z)).toBe('islet');
    expect(islandAt(sl.top.x, sl.top.z)).toBe('mills');
    expect(nookAt(sl.land.x, sl.land.z)).toBe('ledge');
    expect(nookAt(sl.star.x, sl.star.z)).toBe('ledge');
    expect(islandAt(ml.at.x, ml.at.z)).toBe('mills');
    expect(islandAt(ns.at.x, ns.at.z)).toBe('dragon');
    for (const [name, p, r] of [['mill', ml.at, 0.6], ['nest', ns.at, 0.8]] as const) {
      expect(pathDist(p.x, p.z), name).toBeGreaterThan(r + 2.5);
      for (const l of sightLines()) expect(lineDist(l, p.x, p.z), name).toBeGreaterThan(SIGHT + r);
      expect(nookWayAt(p.x, p.z), name).toBeNull();
    }
    // no talk button of the island's character near the windmill's or the nest's place (./index.ts FRIENDS: Chirika,
    // Gromykhalo; ./index.ts is not loaded here, it draws on a canvas as it loads)
    const chirika = { x: ZONES.mills.x - 3, z: ZONES.mills.z + 3 }, gromykhalo = { x: ZONES.dragon.x + 3, z: ZONES.dragon.z + 2.5 };
    expect(Math.hypot(ml.front.x - chirika.x, ml.front.z - chirika.z)).toBeGreaterThan(4.5);
    expect(Math.hypot(ns.stand.x - gromykhalo.x, ns.stand.z - gromykhalo.z)).toBeGreaterThan(4.5);
    // with the islands' colliders (the trees, the mills, the castle) and their own, where each is done is free
    buildScenery(new THREE.Scene());
    const t = fresh();
    for (const id of SKY_SECRETS) {
      const p = { ...t.s.at[id] };
      resolve(p, 0.4);
      expect(Math.hypot(p.x - t.s.at[id].x, p.z - t.s.at[id].z), id).toBeLessThan(1e-6);
    }
  });

  it('the islet: she walks there from the dragon island\'s middle over its deck, and stops at its rail; the chest opens once - 5 stars', () => {
    buildScenery(new THREE.Scene());
    const t = fresh(), ch = chestOf(), islet = NOOKS.islet;
    put(t, ISLANDS.dragon);
    // straight toward the chest's front: round the nest's collider, along the deck
    const via = { x: ISLANDS.dragon.x - ISLANDS.dragon.r * 0.5 * Math.cos(0.35), z: ISLANDS.dragon.z + ISLANDS.dragon.r * 0.5 * Math.sin(0.35) };
    walk(t, via, 60); walk(t, ch.front, 120);
    expect(Math.hypot(t.hp.x - ch.front.x, t.hp.z - ch.front.z)).toBeLessThan(0.05);
    expect(t.hp.y).toBeCloseTo(islet.top, 3);
    // off the far edge: she stays on the islet, inside its rail
    walk(t, { x: islet.x - 20, z: islet.z + 5 }, 120);
    expect(nookAt(t.hp.x, t.hp.z)).toBe('islet');
    expect(Math.hypot(t.hp.x - islet.x, t.hp.z - islet.z)).toBeLessThanOrEqual(islet.r - NOOK_RAIL - 0.4 + 1e-6);
    expect(t.off).toBe(0);
    const spot = t.s.spots.find((x) => x.label === 'open')!;
    expect(spot.on()).toBe(true);
    spot.run();
    expect(t.g.ws.flags[CHEST_FLAG]).toBe(true);
    expect(t.stars).toEqual([5]);
    run(t, 1);
    expect(t.g.scene.getObjectByName('secret-lid')!.rotation.x).toBeLessThan(-1.5);
    expect(spot.on()).toBe(false);
    spot.run();
    expect(t.stars).toEqual([5]);
  });

  it('the slide: walked onto, it takes her down to the ledge; she cannot leave the ledge but by its action, which takes her back up; the star is the find', () => {
    const t = fresh(), sl = slideOf(), ledge = NOOKS.ledge, mills = ISLANDS.mills;
    put(t, mills);
    walk(t, sl.top, 60);
    expect(t.s.active(SLIDE_FLAG)).toBe(true);
    expect(t.s.debug.riding()).toBe('down');
    run(t, 3);
    expect(t.s.active(SLIDE_FLAG)).toBe(false);
    expect(nookAt(t.hp.x, t.hp.z)).toBe('ledge');
    expect(t.hp.y).toBeCloseTo(ledge.top, 3);
    // she walks out every way: the ledge's rail keeps her; up the slide it takes her back down
    for (const a of [0, 1.5, 3, 4.5]) { walk(t, { x: ledge.x + Math.cos(a) * 20, z: ledge.z + Math.sin(a) * 20 }, 60); run(t, 2); }
    walk(t, sl.point(mills.r + 1), 60); run(t, 2);
    expect(nookAt(t.hp.x, t.hp.z)).toBe('ledge');
    expect(t.g.ws.flags[SLIDE_FLAG]).toBeUndefined();
    // to the star: the find
    walk(t, sl.star, 40);
    expect(t.g.ws.flags[SLIDE_FLAG]).toBe(true);
    expect(t.stars).toEqual([3]);
    expect(t.g.scene.getObjectByName('secret-star')!.visible).toBe(false);
    // back up by the ledge's action
    const up = t.s.spots.find((x) => x.label === 'sky_secret_up')!;
    expect(up.on()).toBe(true);
    up.run();
    expect(t.s.debug.riding()).toBe('up');
    run(t, LIFT_S + 0.3);
    expect(t.s.active(SLIDE_FLAG)).toBe(false);
    expect(islandAt(t.hp.x, t.hp.z)).toBe('mills');
    expect(t.hp.y).toBeCloseTo(height(t.hp.x, t.hp.z), 3);
    expect(up.on()).toBe(false);
    // set down out of the slide's reach: it does not take her again until she walks onto it
    run(t, 1);
    expect(t.s.active(SLIDE_FLAG)).toBe(false);
    // never into the clouds: every frame on ground, never under the ledge
    expect(t.off).toBe(0);
    expect(t.lowest).toBeGreaterThan(ledge.top - 0.05);
    // down again: nothing more given
    walk(t, sl.top, 30); run(t, 3);
    expect(nookAt(t.hp.x, t.hp.z)).toBe('ledge');
    expect(t.stars).toEqual([3]);
  });

  it('the slide\'s ride lets her go when she is taken away meanwhile (the walkthrough, the arch)', () => {
    const t = fresh(), sl = slideOf();
    put(t, sl.top); frame(t);
    expect(t.s.active(SLIDE_FLAG)).toBe(true);
    put(t, ISLANDS.castle); frame(t);
    expect(t.s.active(SLIDE_FLAG)).toBe(false);
    expect(islandAt(t.hp.x, t.hp.z)).toBe('castle');
  });

  it('the windmill: every press turns the clouds into animals for a while; the stars the first time', () => {
    const t = fresh(), spot = t.s.spots.find((x) => x.label === 'sky_secret_mill')!;
    expect(t.g.scene.getObjectByName('secret-clouds')!.visible).toBe(false);
    spot.run();
    expect(t.s.active(SHAPES_FLAG)).toBe(true);
    expect(spot.on()).toBe(false);
    expect(t.g.ws.flags[SHAPES_FLAG]).toBe(true);
    expect(t.stars).toEqual([3]);
    const sizes: number[] = [];
    run(t, 2, () => { const s = t.s.debug.shapes(); if (s !== null) sizes.push(s); });
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    expect(sizes.at(-1)).toBeCloseTo(1, 3);
    run(t, SHAPES_S);
    expect(t.s.active(SHAPES_FLAG)).toBe(false);
    expect(t.s.debug.shapes()).toBeNull();
    expect(spot.on()).toBe(true);
    spot.run();
    expect(t.s.active(SHAPES_FLAG)).toBe(true);
    expect(t.stars).toEqual([3]);
  });

  it('the nest: standing by it, the little dragons fly out and circle her, then back; again only after she has left; the stars the first time', () => {
    const t = fresh(), { stand } = nestOf();
    put(t, stand);
    run(t, NEST_WAIT - 0.3);
    expect(t.s.active(NEST_FLAG)).toBe(false);
    run(t, 0.5);
    expect(t.s.active(NEST_FLAG)).toBe(true);
    expect(t.g.ws.flags[NEST_FLAG]).toBe(true);
    expect(t.stars).toEqual([3]);
    // mid-flight they circle round her, over her head
    run(t, NEST_S / 2);
    const d = t.s.debug.drakes()!;
    expect(d).toHaveLength(3);
    for (const p of d) {
      expect(Math.hypot(p.x - t.hp.x, p.z - t.hp.z)).toBeCloseTo(CIRCLE_R, 1);
      expect(p.y).toBeGreaterThan(t.hp.y + 1.5);
    }
    run(t, NEST_S / 2 + 0.3);
    expect(t.s.active(NEST_FLAG)).toBe(false);
    expect(t.s.debug.drakes()).toBeNull();
    // she stays: they do not fly again
    run(t, NEST_WAIT + 1);
    expect(t.s.active(NEST_FLAG)).toBe(false);
    // away and back: again, nothing more given
    put(t, { x: stand.x + 4, z: stand.z }); run(t, 0.2);
    put(t, stand); run(t, NEST_WAIT + 0.2);
    expect(t.s.active(NEST_FLAG)).toBe(true);
    expect(t.stars).toEqual([3]);
  });

  it('the walkthrough\'s moves find every secret from where the description puts them; the glimmer shows only those not found', () => {
    buildScenery(new THREE.Scene());
    const t = fresh();
    expect(t.s.glimmer()).toHaveLength(4);
    // as tools/world-pass.mjs does: she is put where the item is, then the action or the world's move
    put(t, t.s.at.sky_chest); t.s.spots.find((x) => x.label === 'open')!.run();
    put(t, t.s.at.rainbow_slide); run(t, 0.1);
    expect(t.s.active(SLIDE_FLAG)).toBe(true);
    run(t, 3);
    expect(t.s.cheat()).toBe('slide'); frame(t);
    put(t, t.s.at.cloud_shapes); t.s.spots.find((x) => x.label === 'sky_secret_mill')!.run();
    put(t, t.s.at.dragon_nest);
    expect(t.s.cheat()).toBe('nest');
    run(t, NEST_WAIT + 0.5);
    for (const id of SKY_SECRETS) expect(t.g.ws.flags[id], id).toBe(true);
    expect(t.s.cheat()).toBe('');
    expect(t.s.glimmer()).toHaveLength(0);
    expect(t.stars.reduce((a, b) => a + b, 0)).toBe(5 + 3 * 3);
  });

  it('their shapes are light: five meshes at most, none casting a shadow; the clouds and the dragons drawn only while they are shown', () => {
    const tris = [propsGeometry(), lidGeometry(), starGeometry(), shapesGeometry()].reduce((n, g) => n + g.getAttribute('position').count / 3, 0)
      + drakeGeometry().getAttribute('position').count;     // three of them
    expect(tris).toBeLessThan(8000);
    const t = fresh(), meshes: THREE.Mesh[] = [];
    t.g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.map((m) => m.name).sort()).toEqual(['secret-clouds', 'secret-drakes', 'secret-lid', 'secret-props', 'secret-star']);
    for (const m of meshes) expect(m.castShadow, m.name).toBe(false);
    expect(t.g.scene.getObjectByName('secret-clouds')!.visible).toBe(false);
    expect(t.g.scene.getObjectByName('secret-drakes')!.visible).toBe(false);
    // and leaving the world takes them away
    t.scope.dispose(); made = [];
    expect(t.g.scene.getObjectByName('secret-props')).toBeUndefined();
  });
});

describe('the ground of the secrets at another stretch of the map', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  for (const scale of [1, 3]) {
    it(`at ${scale}: the nooks inside the map, apart from the islands; the secrets' places on their ground, inside the rails`, async () => {
      vi.resetModules();
      vi.stubGlobal('location', { search: `?scale=${scale}` });
      const L = await import('./layout'), T = await import('./terrain'), S = await import('./secrets');
      expect(L.SCALE).toBe(scale);
      for (const n of Object.values(L.NOOKS)) {
        expect(Math.hypot(n.x, n.z) + n.r).toBeLessThan(L.HALF);
        for (const i of Object.values(L.ISLANDS)) expect(Math.hypot(n.x - i.x, n.z - i.z)).toBeGreaterThan(n.r + i.r + 2);
      }
      const sl = S.slideOf();
      const inside: [{ x: number; z: number }, keyof typeof L.ISLANDS][] = [[S.millOf().front, 'mills'], [S.millOf().at, 'mills'], [S.nestOf().stand, 'dragon'], [S.nestOf().at, 'dragon'], [sl.top, 'mills'], [sl.back, 'mills']];
      for (const [p, id] of inside) {
        const i = L.ISLANDS[id];
        expect(Math.hypot(p.x - i.x, p.z - i.z)).toBeLessThan(i.r - L.RAIL - 0.4);
      }
      expect(T.nookAt(sl.land.x, sl.land.z)).toBe('ledge');
      expect(T.nookAt(S.chestOf().front.x, S.chestOf().front.z)).toBe('islet');
      // the nest's stand stays out of Gromykhalo's talk
      const gro = { x: L.ZONES.dragon.x + 3, z: L.ZONES.dragon.z + 2.5 };
      expect(Math.hypot(S.nestOf().stand.x - gro.x, S.nestOf().stand.z - gro.z)).toBeGreaterThan(4.2);
      expect(RAIL).toBe(L.RAIL);
    });
  }
});
