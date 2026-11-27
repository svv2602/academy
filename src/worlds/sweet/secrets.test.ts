/**
 * The secrets of the Sweet Land (./secrets.ts; PLAY-07, docs/worlds/world-4.md «Секреты»): four, each found once with
 * its stars; the box opens its lid; the cloud tosses her onto the roof of Imbir's house, where the lollipop is the find,
 * and she falls back down off its edge; the fountain splashes every time and the cat is glad; the machine has her blow a
 * bubble every time she comes; the cat's word of each the first time; all of them where she walks, off the ways and the
 * lines of sight.
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { GRAVITY, TUNING_DEFAULTS } from '../../core/tuning';
import { createWorldScope } from '../../game/scope';
import { OPEN_R } from './house';
import { CANDY_BOX, COTTON_CLOUD, EDGE, FOUNTAIN, GUM_MACHINE, HALF, HOUSE, HOUSE_FACADE, RIVER_HALF, SHRINE, TREE_ARCH, ZONES } from './layout';
import { buildScenery, SIGHT, sightLines } from './scenery';
import { BLOW_S, CHEST_FLAG, CLOUD_FLAG, GUM_FLAG, GUM_WAIT, LEMONADE_FLAG, SECRET_HOW, SPLASH_S, SWEET_SECRETS, TOSS_S, boxOf, createSweetSecrets, fountainOf, gumOf, propsGeometry, roofOf, swirlGeometry, lidGeometry, tossAt, CAVE_FLAG, ROOM_FLAG } from './secrets';
import { colliders, height, lineDist, pathDist, resolve, riverDist, support, tops } from './terrain';

/** A game of what the secrets read: the scene, the save, the heroine, the cat, the stars given. */
function game() {
  const scene = new THREE.Scene(), hero = { root: new THREE.Object3D(), heading: 0 };
  const stars: number[] = [], cat: string[] = [], said: string[] = [];
  const g = {
    scene, hero,
    cat: { once: (c: string) => { cat.push(c); } },
    ws: { flags: {} as Record<string, unknown> },
    addStars: (n: number) => { stars.push(n); },
    above: (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy),
    persist: () => {},
    sparks: { burst: () => {} },
    speech: { line: (k: string) => { said.push(k); return Promise.resolve(); } },
  };
  const scope = createWorldScope(scene);
  const s = createSweetSecrets(g as unknown as Parameters<typeof createSweetSecrets>[0], scope);
  return { g, s, stars, cat, said, scope, hp: hero.root.position, vy: 0 };
}
type T = ReturnType<typeof game>;
/** A frame of the game as src/game/player.ts walks her: resolve, the ground or a top under her feet, gravity; then the secrets. */
function frame(t: T, dt = 1 / 30, canMove = true) {
  const { hp } = t;
  resolve(hp, 0.4);
  const top = support(hp.x, hp.z, hp.y), ground = top ?? height(hp.x, hp.z);
  hp.y += t.vy * dt - 0.5 * GRAVITY * dt * dt; t.vy -= GRAVITY * dt;
  if (hp.y <= ground) { hp.y = ground; t.vy = 0; }
  t.s.update(dt, 0, canMove);
}
const run = (t: T, s: number, each?: () => void) => { for (let k = 0; k < s * 30; k++) { each?.(); frame(t); } };
const put = (t: T, p: { x: number; z: number }) => { t.hp.set(p.x, height(p.x, p.z), p.z); t.vy = 0; };
/** She walks to `p` herself, a step each frame. */
const walk = (t: T, p: { x: number; z: number }, frames = 30) => {
  const sx = t.hp.x, sz = t.hp.z;
  for (let k = 1; k <= frames; k++) { t.hp.x = sx + (p.x - sx) * k / frames; t.hp.z = sz + (p.z - sz) * k / frames; frame(t); }
};

describe('the secrets of the Sweet Land (PLAY-07)', () => {
  let made: T[] = [];
  const fresh = () => { const t = game(); made.push(t); return t; };
  afterEach(() => { for (const t of made) t.scope.dispose(); made = []; colliders.length = 0; tops.length = 0; });

  it('six, as the world description says: the box, the cloud, the lemonade, the gum, the cave and Imbir\'s room; the box, the fountain and the room\'s jar by the action, the others by walking', () => {
    expect([...SWEET_SECRETS]).toEqual(['candy_box', 'cotton_cloud', 'lemonade', 'bubble_gum', 'choco_cave', 'ginger_room']);
    expect(SECRET_HOW).toEqual({ candy_box: 'act', cotton_cloud: 'walk', lemonade: 'act', bubble_gum: 'walk', choco_cave: 'walk', ginger_room: 'act' });
  });

  it('they stand in the map, off the ways and the lines of sight, out of the chocolate; where each is done she can stand', () => {
    const things: [string, { x: number; z: number }, number][] = [['box', CANDY_BOX, 0.5], ['cloud', COTTON_CLOUD, 1.3], ['fountain', FOUNTAIN, FOUNTAIN.r + 0.2], ['gum', GUM_MACHINE, 0.45]];
    for (const [name, p, r] of things) {
      expect(Math.hypot(p.x, p.z) + r, name).toBeLessThan(HALF - EDGE);
      expect(pathDist(p.x, p.z), name).toBeGreaterThan(r + 1.5);
      expect(riverDist(p.x, p.z), name).toBeGreaterThan(RIVER_HALF + r);
      for (const l of sightLines()) expect(lineDist(l, p.x, p.z), name).toBeGreaterThan(SIGHT + r * 0.5);
    }
    // the box is under the bridge's end, on the market's bank, by its south side (downstream, away from the tiles)
    expect(CANDY_BOX.x).toBeLessThan(ZONES.bridge.x);
    expect(CANDY_BOX.z).toBeGreaterThan(ZONES.bridge.z);
    expect(Math.hypot(CANDY_BOX.x - ZONES.bridge.x, CANDY_BOX.z - ZONES.bridge.z)).toBeLessThan(6);
    // with the land's colliders and their own, where each is done is free: she stands there, nothing pushes her off
    buildScenery(new THREE.Scene());
    fresh();
    const t = made[0];
    for (const id of SWEET_SECRETS) {
      const p = { ...t.s.at[id] };
      resolve(p, 0.4);
      expect(Math.hypot(p.x - t.s.at[id].x, p.z - t.s.at[id].z), id).toBeLessThan(1e-6);
    }
    // the buttons of the box and the fountain are their own: no character, ruby, shrine or arch near them
    for (const p of [boxOf().front, fountainOf().front]) {
      for (const q of [SHRINE, TREE_ARCH, { x: ZONES.square.x + 2.5, z: ZONES.square.z - 3 }]) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(5.5);
      // and a walk along the ways does not show them
      expect(pathDist(p.x, p.z)).toBeGreaterThan(2.2);
    }
  });

  it('the box: opened once - 5 stars, its lid open; again nothing', () => {
    const t = fresh(), spot = t.s.spots.find((x) => x.label === 'open')!;
    expect(spot.on()).toBe(true);
    spot.run();
    expect(t.g.ws.flags[CHEST_FLAG]).toBe(true);
    expect(t.stars).toEqual([5]);
    expect(t.said).toEqual(['sweet_secret_box']);     // the cat's word as it opens
    run(t, 1);
    const lid = t.g.scene.getObjectByName('secret-lid')!;
    expect(lid.rotation.x).toBeLessThan(-1.5);
    expect(spot.on()).toBe(false);
    spot.run();
    expect(t.stars).toEqual([5]);
    expect(t.said).toEqual(['sweet_secret_box']);
  });

  it('the cloud: walked into, it tosses her onto the roof; the lollipop there is the find; off the edge she falls to the ground', () => {
    const t = fresh(), roof = roofOf();
    buildScenery(new THREE.Scene());
    put(t, { x: COTTON_CLOUD.x - 3, z: COTTON_CLOUD.z });
    walk(t, COTTON_CLOUD, 20);
    expect(t.s.active(CLOUD_FLAG)).toBe(true);
    expect(t.said).toEqual(['sweet_secret_cotton']);  // the cat's word as it tosses her up
    run(t, TOSS_S + 0.2);
    expect(t.s.active(CLOUD_FLAG)).toBe(false);
    expect(t.hp.y).toBeCloseTo(roof.top, 3);
    // she stays on top while she walks about on it, the house does not push her off
    walk(t, { x: roof.x, z: roof.z + 1 });
    expect(t.hp.y).toBeCloseTo(roof.top, 3);
    expect(Math.abs(t.hp.z - (roof.z + 1))).toBeLessThan(1e-6);
    expect(t.g.ws.flags[CLOUD_FLAG]).toBeUndefined();
    // to the lollipop: the find
    walk(t, roof.swirl);
    expect(t.g.ws.flags[CLOUD_FLAG]).toBe(true);
    expect(t.stars).toEqual([3]);
    expect(t.g.scene.getObjectByName('secret-swirl')!.visible).toBe(false);
    // off the west edge: she falls, lands on the ground, out of the house
    walk(t, { x: HOUSE.x - HOUSE.w / 2 - 1.5, z: HOUSE.z });
    run(t, 1);
    expect(t.hp.y).toBeCloseTo(height(t.hp.x, t.hp.z), 3);
    expect(Math.hypot(t.hp.x - HOUSE.x, t.hp.z - HOUSE.z)).toBeGreaterThanOrEqual(HOUSE.w / 2 + 0.6);
    // in again: tossed again, nothing more given
    put(t, { x: COTTON_CLOUD.x - 3, z: COTTON_CLOUD.z }); walk(t, COTTON_CLOUD, 20);
    expect(t.s.active(CLOUD_FLAG)).toBe(true);
    run(t, TOSS_S + 0.5);
    expect(t.stars).toEqual([3]);
    expect(t.said).toEqual(['sweet_secret_cotton']);  // said once
  });

  it('the roof: the toss goes up over it and comes down on it; from the ground her jump does not reach it and the house stops her', () => {
    const roof = roofOf(), from = new THREE.Vector3(COTTON_CLOUD.x, height(COTTON_CLOUD.x, COTTON_CLOUD.z), COTTON_CLOUD.z);
    expect(tossAt(TOSS_S / 2, from).y).toBeGreaterThan(roof.top + 1.5);
    expect(tossAt(TOSS_S, from).y).toBeCloseTo(roof.top, 6);
    expect(Math.hypot(tossAt(TOSS_S, from).x - roof.landing.x, tossAt(TOSS_S, from).z - roof.landing.z)).toBeLessThan(1e-6);
    // the heroine's jump: its top under the roof's edge (`under`), so she walks into the house's side
    const jumpTop = TUNING_DEFAULTS.jump ** 2 / (2 * GRAVITY), ground = height(HOUSE.x, HOUSE.z);
    expect(ground + jumpTop).toBeLessThan(roof.top - 0.5);
    expect(support(roof.x, roof.z, ground + jumpTop)).toBeNull();
    buildScenery(new THREE.Scene());
    const p = { x: HOUSE.x - 1, z: HOUSE.z, y: ground + jumpTop };
    resolve(p, 0.4);
    expect(Math.hypot(p.x - HOUSE.x, p.z - HOUSE.z)).toBeGreaterThanOrEqual(HOUSE.w / 2 + 0.6);
    // where she lands and where the lollipop stands are far from where the house's task opens (./house.ts, before its front)
    const before = { x: HOUSE_FACADE.x + 4.6, z: HOUSE_FACADE.z };
    for (const q of [roof.landing, roof.swirl]) expect(Math.hypot(q.x - before.x, q.z - before.z)).toBeGreaterThan(OPEN_R + 1);
  });

  it('the fountain: every press splashes it in a rainbow and the cat is glad; the stars the first time', () => {
    const t = fresh(), spot = t.s.spots.find((x) => x.label === 'sweet_lemonade')!;
    spot.run();
    expect(t.s.active(LEMONADE_FLAG)).toBe(true);
    expect(spot.on()).toBe(false);
    expect(t.g.ws.flags[LEMONADE_FLAG]).toBe(true);
    expect(t.stars).toEqual([3]);
    expect(t.cat).toEqual(['Yes']);
    expect(t.said).toEqual(['sweet_secret_lemonade']);
    run(t, SPLASH_S + 0.2);
    expect(t.s.active(LEMONADE_FLAG)).toBe(false);
    expect(spot.on()).toBe(true);
    spot.run();
    expect(t.cat).toEqual(['Yes', 'Yes']);
    expect(t.stars).toEqual([3]);
    expect(t.said).toEqual(['sweet_secret_lemonade']);   // the word the first time only
  });

  it('the machine: standing before it she blows a bubble, it pops; again only after she has left; the stars the first time', () => {
    const t = fresh(), { stand } = gumOf();
    put(t, stand);
    run(t, GUM_WAIT - 0.3);
    expect(t.s.active(GUM_FLAG)).toBe(false);
    run(t, 0.5);
    expect(t.s.active(GUM_FLAG)).toBe(true);
    // the bubble grows before her
    const sizes: number[] = [];
    run(t, BLOW_S - 0.3, () => { const b = t.s.debug.bubble(); if (b !== null) sizes.push(b); });
    expect(sizes.length).toBeGreaterThan(10);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    run(t, 0.6);
    expect(t.s.active(GUM_FLAG)).toBe(false);
    expect(t.s.debug.bubble()).toBeNull();
    expect(t.g.ws.flags[GUM_FLAG]).toBe(true);
    expect(t.stars).toEqual([3]);
    expect(t.said).toEqual(['sweet_secret_gum']);     // the cat's word as it pops
    // she stays: no second bubble
    run(t, GUM_WAIT + 1);
    expect(t.s.active(GUM_FLAG)).toBe(false);
    // away and back: she blows again, nothing more given
    put(t, { x: stand.x + 4, z: stand.z }); run(t, 0.2);
    put(t, stand); run(t, GUM_WAIT + 0.2);
    expect(t.s.active(GUM_FLAG)).toBe(true);
    run(t, BLOW_S + 0.3);
    expect(t.stars).toEqual([3]);
    expect(t.said).toEqual(['sweet_secret_gum']);
  });

  it('the walkthrough\'s moves find every walk and act secret from where the description puts them; the glimmer shows only those not found', () => {
    const t = fresh();
    buildScenery(new THREE.Scene());
    expect(t.s.glimmer()).toHaveLength(4);
    // as tools/world-pass.mjs does: she is put where the item is, then the action or the world's move
    put(t, t.s.at.candy_box); t.s.spots.find((x) => x.label === 'open')!.run();
    put(t, t.s.at.cotton_cloud); run(t, 0.1);
    expect(t.s.active(CLOUD_FLAG)).toBe(true);
    run(t, TOSS_S + 0.3);
    expect(t.s.cheat()).toBe('cloud'); frame(t);
    put(t, t.s.at.lemonade); t.s.spots.find((x) => x.label === 'sweet_lemonade')!.run();
    put(t, t.s.at.bubble_gum);
    expect(t.s.cheat()).toBe('gum');
    run(t, GUM_WAIT + BLOW_S + 0.5);
    // the secret places are found by their own modules (./cave.ts, ./room.ts) through `take`: once each
    const at = new THREE.Vector3();
    t.s.take(CAVE_FLAG, at); t.s.take(ROOM_FLAG, at); t.s.take(CAVE_FLAG, at);
    for (const id of SWEET_SECRETS) expect(t.g.ws.flags[id], id).toBe(true);
    expect(t.s.cheat()).toBe('');
    expect(t.s.glimmer()).toHaveLength(0);
    expect(t.stars.reduce((a, b) => a + b, 0)).toBe(5 + 5 * 3);
  });

  it('their shapes are light: four meshes at most, none casting a shadow; the bubble drawn only while it is blown', () => {
    const tris = [propsGeometry(), lidGeometry(), swirlGeometry()].reduce((n, g) => n + g.getAttribute('position').count / 3, 0);
    expect(tris).toBeLessThan(3000);
    const t = fresh(), meshes: THREE.Mesh[] = [];
    t.g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.map((m) => m.name).sort()).toEqual(['secret-bubble', 'secret-lid', 'secret-props', 'secret-swirl']);
    for (const m of meshes) expect(m.castShadow, m.name).toBe(false);
    expect(t.g.scene.getObjectByName('secret-bubble')!.visible).toBe(false);
    // and leaving the world takes them away
    t.scope.dispose(); made = [];
    expect(t.g.scene.getObjectByName('secret-props')).toBeUndefined();
    expect(tops).toHaveLength(0);
  });
});
