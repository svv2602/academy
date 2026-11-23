/**
 * The secrets of the sea (./secrets.ts; PLAY-07, docs/worlds/world-3.md «Секреты»): four, each found once with its stars
 * and the cat's word; the lift carries her onto its rock and she sinks back off it; the shells sing the tune once all
 * three were touched, in any order; the whale passes every time she stands on the lookout, out of the map; all of them
 * where she can swim, off the ways.
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import type { Actor } from '../../game/actor';
import { createWorldScope } from '../../game/scope';
import { EDGE, HALF, LIFT_ROCK, LOOKOUT, PATHS, SQUARE_ARCH } from './layout';
import { CHEST_FLAG, LIFT_FLAG, LIFT_S, SEA_SECRETS, SHELLS_FLAG, SWIM, WHALE_FLAG, WHALE_S, WHALE_WAIT, createSeaSecrets, liftAt, liftOf, restShells, rocksGeometry, secretTriangles, shellsOf, touchShell, tuneSeconds, whaleAt, whaleOf } from './secrets';
import { colliders, height, resolve, support, tops } from './terrain';

/** m: the distance from (x, z) to the nearest way of the map. */
function wayDist(x: number, z: number): number {
  let best = Infinity;
  for (const line of PATHS) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

/** A game of what the secrets read: the scene, the save, the heroine, the stars and the cat's words given. */
function game() {
  const scene = new THREE.Scene(), hero = { root: new THREE.Object3D() };
  const stars: number[] = [], said: string[] = [];
  const g = {
    scene, hero, busy: false, touch: true,
    ws: { flags: {} as Record<string, unknown> },
    addStars: (n: number) => { stars.push(n); },
    above: (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy),
    persist: () => {},
    sparks: { burst: () => {} },
    speech: { line: (k: string) => { said.push(k); return Promise.resolve(); } },
  };
  const chestRoot = new THREE.Object3D();
  chestRoot.position.set(10, height(10, 10), 10);
  const poses: string[] = [];
  const chest = { root: chestRoot, pose: (c: string) => poses.push(c), once: (c: string) => poses.push(c) } as unknown as Actor;
  const scope = createWorldScope(scene);
  const s = createSeaSecrets(g as unknown as Parameters<typeof createSeaSecrets>[0], scope, { chest });
  return { g, s, stars, said, poses, scope, hp: hero.root.position };
}
/** A frame of the game: the frame keeps her SWIM over what is under her (src/game/player.ts), then the secrets. */
function frame(t: ReturnType<typeof game>, dt = 1 / 30, canMove = true) {
  const { hp } = t;
  resolve(hp, 0.4);
  const relief = height(hp.x, hp.z), top = support(hp.x, hp.z, hp.y);
  hp.y = (top !== null && top > relief ? top : relief) + SWIM;
  t.s.update(dt, 0, canMove);
}
const run = (t: ReturnType<typeof game>, s: number, each?: () => void) => { for (let k = 0; k < s * 30; k++) { each?.(); frame(t); } };
const put = (t: ReturnType<typeof game>, p: { x: number; z: number }) => t.hp.set(p.x, height(p.x, p.z) + SWIM, p.z);

describe('the secrets of the sea (PLAY-07)', () => {
  let made: ReturnType<typeof game>[] = [];
  const fresh = () => { const t = game(); made.push(t); return t; };
  afterEach(() => { for (const t of made) t.scope.dispose(); made = []; colliders.length = 0; tops.length = 0; });

  it('four, as the world description says: the chest, the lift, the shells, the whale', () => {
    expect([...SEA_SECRETS]).toEqual(['ship_chest', 'bubble_lift', 'echo_shells', 'whale']);
  });

  it('they stand in the map, where she can swim, off the ways', () => {
    for (const [name, p, r] of [['lift', LIFT_ROCK, LIFT_ROCK.r + 1.5], ['lookout', LOOKOUT, LOOKOUT.r]] as const) {
      expect(Math.hypot(p.x, p.z) + r, name).toBeLessThan(HALF - EDGE);
      expect(wayDist(p.x, p.z), name).toBeGreaterThan(r + LOOKOUT.slope * (name === 'lookout' ? 1 : 0) + 1);
    }
    for (const p of shellsOf().at) expect(wayDist(p.x, p.z)).toBeGreaterThan(1);
    // the column she swims into is in the map too
    const { column } = liftOf();
    expect(Math.hypot(column.x, column.z)).toBeLessThan(HALF - EDGE);
  });

  it('the chest: opened once - 5 stars, the cat\'s word, its lid open; again nothing', () => {
    const t = fresh(), spot = t.s.spots.find((x) => x.label === 'open')!;
    expect(spot.on()).toBe(true);
    spot.run();
    expect(t.g.ws.flags[CHEST_FLAG]).toBe(true);
    expect(t.stars).toEqual([5]);
    expect(t.poses).toContain('Chest_Open');
    expect(spot.on()).toBe(false);
    spot.run();
    expect(t.stars).toEqual([5]);
  });

  it('the lift: the column carries her onto the rock\'s top, the starfish there is the find; off the edge she sinks to the floor', () => {
    const t = fresh(), { column, top, star } = liftOf();
    put(t, column);
    frame(t);
    expect(t.s.active(LIFT_FLAG)).toBe(true);
    run(t, LIFT_S + 0.2);
    expect(t.s.active(LIFT_FLAG)).toBe(false);
    expect(t.hp.y).toBeCloseTo(top + SWIM, 3);
    // she stays on top while she swims about on it, and does not slip through the rock
    run(t, 1);
    expect(t.hp.y).toBeCloseTo(top + SWIM, 3);
    expect(t.g.ws.flags[LIFT_FLAG]).toBeUndefined();
    // to the starfish: the find
    put(t, star); t.hp.y = top + SWIM;
    frame(t);
    expect(t.g.ws.flags[LIFT_FLAG]).toBe(true);
    expect(t.stars).toEqual([3]);
    // off the edge, away from the column: she sinks, no faster than SINK_SPEED, and reaches the floor
    const ox = LIFT_ROCK.x - (column.x - LIFT_ROCK.x), oz = LIFT_ROCK.z - (column.z - LIFT_ROCK.z);
    const d = Math.hypot(ox - LIFT_ROCK.x, oz - LIFT_ROCK.z), ux = (ox - LIFT_ROCK.x) / d, uz = (oz - LIFT_ROCK.z) / d;
    const off = { x: LIFT_ROCK.x + ux * (LIFT_ROCK.r + 1.2), z: LIFT_ROCK.z + uz * (LIFT_ROCK.r + 1.2) };
    // she swims there herself, a little each frame
    const sx = t.hp.x, sz = t.hp.z;
    for (let k = 1; k <= 30; k++) { t.hp.x = sx + (off.x - sx) * k / 30; t.hp.z = sz + (off.z - sz) * k / 30; frame(t); }
    expect(t.hp.y).toBeGreaterThan(top - 1.5);
    run(t, 4);
    expect(t.hp.y).toBeCloseTo(height(t.hp.x, t.hp.z) + SWIM, 3);
    expect(t.stars).toEqual([3]);
  });

  it('the rock\'s side stops her below its top; the lift takes her only from below', () => {
    const t = fresh();
    put(t, { x: LIFT_ROCK.x + 0.5, z: LIFT_ROCK.z });
    resolve(t.hp, 0.4);
    expect(Math.hypot(t.hp.x - LIFT_ROCK.x, t.hp.z - LIFT_ROCK.z)).toBeGreaterThanOrEqual(LIFT_ROCK.r);
    // the way up: liftAt goes up, never down, and ends on the top
    const { column, top } = liftOf(), from = new THREE.Vector3(column.x, height(column.x, column.z) + SWIM, column.z);
    let was = from.y;
    for (let s = 0; s <= LIFT_S; s += 0.1) { const p = liftAt(s, from); expect(p.y).toBeGreaterThanOrEqual(was - 1e-9); was = p.y; }
    expect(liftAt(LIFT_S, from).y).toBeCloseTo(top + SWIM, 6);
    // taken away while it carries her (a teleport), it lets her go
    put(t, column); frame(t);
    expect(t.s.active(LIFT_FLAG)).toBe(true);
    put(t, { x: column.x + 20, z: column.z }); frame(t);
    expect(t.s.active(LIFT_FLAG)).toBe(false);
    expect(t.hp.x).toBeCloseTo(column.x + 20, 6);
  });

  it('the rocks face out: their sides lit, not black inside out', () => {
    const g = rocksGeometry(), pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    // a side face of the pillar halfway up: its normal points away from the rock's middle
    let out = 0, inn = 0;
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - LIFT_ROCK.x, dz = pos.getZ(i) - LIFT_ROCK.z;
      // the side over the floor (its foot runs under the sand)
      if (Math.hypot(dx, dz) > 4 || Math.abs(nor.getY(i)) > 0.5 || pos.getY(i) < height(LIFT_ROCK.x, LIFT_ROCK.z) + 0.2) continue;
      if (Math.hypot(nor.getX(i), nor.getZ(i)) < 0.5) continue;   // the lathe's empty triangles at its axis
      if (dx * nor.getX(i) + dz * nor.getZ(i) > 0) out++; else inn++;
    }
    expect(out).toBeGreaterThan(0);
    expect(inn).toBe(0);
  });

  it('the shells: each touched sings, all three in any order begin the tune; the tune is the find, once', () => {
    let s = restShells();
    s = touchShell(s, 2); s = touchShell(s, 2); s = touchShell(s, 0);
    expect(s.tune).toBe(-1);
    s = touchShell(s, 1);
    expect(s.tune).toBe(0);
    expect(touchShell(s, 0)).toBe(s);
    const t = fresh(), { front } = shellsOf();
    put(t, front);
    for (let k = 0; k < 3; k++) expect(t.s.cheat()).toBe('shells');
    expect(t.s.active(SHELLS_FLAG)).toBe(true);
    run(t, tuneSeconds() + 1);
    expect(t.g.ws.flags[SHELLS_FLAG]).toBe(true);
    expect(t.stars).toEqual([3]);
    expect(t.said).toContain('sea_secret_shells');
    // again, touched on the screen: they sing the tune, nothing more is given
    const at = shellsOf().at;
    for (const i of [1, 2, 0]) expect(t.s.tap((p) => (Math.hypot(p.x - at[i].x, p.z - at[i].z) < 0.01 ? 1 : 999))).toBe(true);
    expect(t.s.active(SHELLS_FLAG)).toBe(true);
    run(t, tuneSeconds() + 1);
    expect(t.stars).toEqual([3]);
  });

  it('the whale: from the lookout\'s top it passes every time she comes up, out of the map; the stars the first time', () => {
    const t = fresh(), { top } = whaleOf();
    // she swims up the mound's side by herself, from its foot to its top
    const d = Math.hypot(LOOKOUT.x, LOOKOUT.z), ux = LOOKOUT.x / d, uz = LOOKOUT.z / d;
    put(t, { x: LOOKOUT.x - ux * (LOOKOUT.r + LOOKOUT.slope + 1), z: LOOKOUT.z - uz * (LOOKOUT.r + LOOKOUT.slope + 1) });
    run(t, 6, () => { t.hp.x += ux * 0.12; t.hp.z += uz * 0.12; if (Math.hypot(t.hp.x - LOOKOUT.x, t.hp.z - LOOKOUT.z) < 0.5) { t.hp.x = LOOKOUT.x; t.hp.z = LOOKOUT.z; } });
    expect(t.hp.y).toBeCloseTo(top + SWIM, 2);
    run(t, WHALE_WAIT + 0.2);
    expect(t.s.active(WHALE_FLAG)).toBe(true);
    expect(t.g.ws.flags[WHALE_FLAG]).toBe(true);
    expect(t.stars).toEqual([3]);
    // its whole way is far off from her, over the kelp and clear of the square's arch, in the map
    for (let s = 0; s <= WHALE_S; s += 0.5) {
      const w = whaleAt(s)!;
      expect(Math.hypot(w.pos.x - LOOKOUT.x, w.pos.z - LOOKOUT.z)).toBeGreaterThan(20);
      expect(w.pos.y - height(w.pos.x, w.pos.z)).toBeGreaterThan(4.5);   // over the kelp (3.2 m)
      expect(Math.hypot(w.pos.x - SQUARE_ARCH.x, w.pos.z - SQUARE_ARCH.z)).toBeGreaterThan(4);
      expect(Math.hypot(w.pos.x, w.pos.z)).toBeLessThan(HALF);
    }
    run(t, WHALE_S + 0.5);
    expect(t.s.active(WHALE_FLAG)).toBe(false);
    // down and up again: it comes again, no stars more
    put(t, { x: LOOKOUT.x - ux * (LOOKOUT.r + LOOKOUT.slope + 2), z: LOOKOUT.z - uz * (LOOKOUT.r + LOOKOUT.slope + 2) });
    run(t, 0.5);
    t.hp.set(LOOKOUT.x, top + SWIM, LOOKOUT.z);
    run(t, WHALE_WAIT + 0.5);
    expect(t.s.active(WHALE_FLAG)).toBe(true);
    expect(t.stars).toEqual([3]);
  });

  it('the walkthrough\'s moves find every walk and act secret; the glimmer shows only those not found', () => {
    const t = fresh();
    expect(t.s.glimmer()).toHaveLength(4);
    t.s.spots.find((x) => x.label === 'open')!.run();
    put(t, liftOf().column); run(t, LIFT_S + 0.5);
    expect(t.s.cheat()).toBe('lift'); frame(t);
    put(t, LOOKOUT); expect(t.s.cheat()).toBe('lookout'); run(t, WHALE_WAIT + 0.5);
    put(t, shellsOf().front); for (let k = 0; k < 20 && t.s.cheat() === 'shells' && !t.g.ws.flags[SHELLS_FLAG]; k++) run(t, 0.5);
    for (const id of SEA_SECRETS) expect(t.g.ws.flags[id], id).toBe(true);
    expect(t.s.glimmer()).toHaveLength(0);
    expect(t.stars.reduce((a, b) => a + b, 0)).toBe(5 + 3 * 3);
  });

  it('their shapes are light, and the rocks are one mesh with no shadow', () => {
    expect(secretTriangles()).toBeLessThan(2500);
    const t = fresh(), rocks = t.g.scene.getObjectByName('secret-rocks') as THREE.Mesh;
    expect(rocks.castShadow).toBe(false);
    // the whale is drawn only while it passes
    expect(t.g.scene.getObjectByName('secret-whale')!.visible).toBe(false);
  });
});
