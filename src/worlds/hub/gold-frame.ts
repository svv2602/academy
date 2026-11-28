import * as THREE from 'three';
import type { Save } from '../../core/save';
import { knownWorlds, type ArtifactWorld } from '../../game/artifacts';
import { exploreOf, fullyExplored } from '../../game/explore';
import { NESTS, trunkR } from './layout';

/**
 * The gold frame of a world explored whole (the explorer's key, PLAY-36, src/game/explore.ts): a ring of gold round the
 * rim of its nest on the Great Tree, glowing a little by its own colour. Read from the save, as the keepsakes are
 * (./keepsakes.ts); one geometry drawn in the nests' call (./arch-look.ts `buildNestLook` extra) - no call of its own.
 */

/** The gold, and how much it glows by its own colour (the `glow` attribute of the nests' material). */
export const GOLD = '#ffc93a', GOLD_GLOW = 0.55;
/** m: the ring - its radius round the nest's middle (the nest's rim is 0.57 + 0.075), its tube, its height over the nest. */
export const FRAME = { r: 0.7, tube: 0.06, up: 0.16 } as const;

/** The shelves whose world is explored whole. */
export function goldShelves(save: Save, worlds: readonly ArtifactWorld[] = knownWorlds()): number[] {
  return worlds.filter((w) => w.shelf !== undefined && fullyExplored(exploreOf(save, w))).map((w) => w.shelf!).sort((a, b) => a - b);
}

/** The frames of those shelves as one geometry (position, normal, colour, glow); null - none. */
export function goldFrames(shelves: readonly number[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const c = new THREE.Color(GOLD), m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (const shelf of shelves) {
    const n = NESTS.find((k) => k.shelf === shelf);
    if (!n) continue;
    const r = trunkR(n.y) + 0.35, x = Math.sin(n.a) * r, z = Math.cos(n.a) * r;
    const g = new THREE.TorusGeometry(FRAME.r, FRAME.tube, 6, 24).toNonIndexed();
    g.deleteAttribute('uv');
    g.applyMatrix4(m.compose(new THREE.Vector3(x, n.y + FRAME.up, z), q, new THREE.Vector3(1, 1, 1)));
    const count = g.getAttribute('position').count, col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(count).fill(GOLD_GLOW), 1));
    parts.push(g);
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  // the same attributes in each: a plain concatenation
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'glow']) {
    const size = parts[0].getAttribute(name).itemSize, all = new Float32Array(parts.reduce((s, p) => s + p.getAttribute(name).array.length, 0));
    let at = 0;
    for (const p of parts) { all.set(p.getAttribute(name).array as Float32Array, at); at += p.getAttribute(name).array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(all, size));
  }
  for (const p of parts) p.dispose();
  return out;
}
