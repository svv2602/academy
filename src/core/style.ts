import * as THREE from 'three';

/**
 * The style of the shapes the game builds itself (docs/worlds/style.md): the named colours, five shared materials, the
 * rule of facets, and the small parts creatures and props are made of (eyes, ears, paws, caps). A world takes its
 * materials from here rather than making its own for every shape: one material per look, however many shapes wear
 * it - fewer programs, fewer switches, the same colours everywhere.
 *
 * Nothing here gives light: a glow is the material's own (`glow`), never a lamp.
 *
 * A world's scope frees the materials of its scene as it is left (src/core/dispose.ts); a shared one freed so is
 * uploaded again by three.js the next time it is drawn - it stays usable.
 */

/** The colours of the shapes, by name. A world may add its own beside them, never change these. */
export const PALETTE = {
  stone: '#b7a9c4',
  moss: '#7cc46a',
  leaf: '#4fae54',
  wood: '#b98560',
  woodDark: '#8f5f3e',
  door: '#9a6a4c',
  plaster: '#fff0dc',
  rose: '#ff9ccf',
  lilac: '#c79bff',
  petal: '#ffb3e6',
  petalGlow: '#ff7fd0',
  gold: '#ffd166',
  goldGlow: '#ffb84d',
  sky: '#9ad0ff',
  white: '#ffffff',
  ink: '#2b2233',
} as const;
export type Swatch = keyof typeof PALETTE;
type Colour = Swatch | `#${string}`;
const hex = (c: Colour) => (c.startsWith('#') ? c : PALETTE[c as Swatch]);

/** The five kinds: how each one is shaded. */
const KINDS = {
  /** rock, crystal clusters, cliffs: faceted, matte */
  stone: { roughness: 0.95, flatShading: true, base: 'stone' },
  /** moss, turf, hedges: faceted, fully matte */
  moss: { roughness: 1, flatShading: true, base: 'moss' },
  /** furniture, beams, doors, fences: smooth, a little sheen */
  wood: { roughness: 0.8, flatShading: false, base: 'wood' },
  /** rugs, bedding, walls, curtains, fur: smooth, matte */
  cloth: { roughness: 0.9, flatShading: false, base: 'plaster' },
} as const satisfies Record<string, { roughness: number; flatShading: boolean; base: Swatch }>;
export type Kind = keyof typeof KINDS | 'glow';

const cache = new Map<string, THREE.MeshStandardMaterial>();
const shared = (key: string, make: () => THREE.MeshStandardMaterial) => {
  let m = cache.get(key);
  if (!m) { m = make(); m.name = `style:${key}`; cache.set(key, m); }
  return m;
};
const plain = (kind: keyof typeof KINDS) => (colour: Colour = KINDS[kind].base) =>
  shared(`${kind}|${hex(colour)}`, () => new THREE.MeshStandardMaterial({ color: hex(colour), roughness: KINDS[kind].roughness, flatShading: KINDS[kind].flatShading }));

export interface GlowOptions {
  /** The colour of the glow, if not the surface's own. */
  emissive?: Colour;
  roughness?: number;
  flatShading?: boolean;
}
const glowParams = (colour: Colour, strength: number, o: GlowOptions = {}): THREE.MeshStandardMaterialParameters => ({
  color: hex(colour), emissive: hex(o.emissive ?? colour), emissiveIntensity: strength, roughness: o.roughness ?? 0.6, flatShading: o.flatShading ?? false,
});

/**
 * The shared materials. Same kind and colour - the same material, made once. A shape that changes its material as
 * it plays (a pulse of its glow, a fade) takes `own` instead: a material of the same look that is its alone.
 */
export const mat = {
  stone: plain('stone'),
  moss: plain('moss'),
  wood: plain('wood'),
  cloth: plain('cloth'),
  /** Lit from inside: a crystal, a flower, a flame, a window. `strength` 0.2 a hint - 1 bright - 2 a flame. */
  glow: (colour: Colour, strength = 0.6, o: GlowOptions = {}) => {
    const p = glowParams(colour, strength, o);
    return shared(`glow|${p.color}|${p.emissive}|${strength}|${p.roughness}|${p.flatShading}`, () => new THREE.MeshStandardMaterial(p));
  },
  /** A material of `kind`'s look that is the caller's alone, to change as it plays. */
  own: (kind: Kind, colour?: Colour, strength = 0.6, o: GlowOptions = {}) => {
    if (kind === 'glow') return new THREE.MeshStandardMaterial(glowParams(colour ?? 'gold', strength, o));
    const k = KINDS[kind];
    return new THREE.MeshStandardMaterial({ color: hex(colour ?? k.base), roughness: k.roughness, flatShading: k.flatShading });
  },
};

/**
 * The rule of facets: how many segments a round shape of `size` m (its largest extent) has around. Small things are
 * low-poly on purpose - the style is faceted, and a phone draws the whole world: 7 at 3 cm, 10 at 0.25 m, 13 at
 * 0.75 m, 16 at 1.5 m, never fewer than 6 nor more than 24. Rings and spheres take it around; spheres take half of it high.
 */
export function facets(size: number): number {
  return Math.max(6, Math.min(24, Math.round(6 + Math.sqrt(Math.max(0, size)) * 8)));
}

const geos = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geos.get(key);
  if (!g) { g = make(); geos.set(key, g); }
  return g;
};
/** A unit sphere of `n` facets around (shared; a mesh scales it). */
const ball = (n: number) => geo(`ball|${n}`, () => new THREE.SphereGeometry(1, n, Math.max(4, Math.round(n / 2))));
const dome = (n: number) => geo(`dome|${n}`, () => new THREE.SphereGeometry(1, n, Math.max(3, Math.round(n / 4)), 0, Math.PI * 2, 0, Math.PI / 2));
const cone = (n: number) => geo(`cone|${n}`, () => new THREE.ConeGeometry(1, 1, n).translate(0, 0.5, 0));

/**
 * The small parts. Each is a group standing at its own origin, facing +z (a creature's front), `size` m across;
 * its materials and geometries are the shared ones, so a hundred eyes cost what one does to build.
 */
export const parts = {
  /** An eye: white, a dark pupil looking forward, a spark of light. */
  eye(size = 0.08): THREE.Group {
    const g = new THREE.Group(), n = facets(size), r = size / 2;
    const white = new THREE.Mesh(ball(n), mat.cloth('white')); white.scale.setScalar(r);
    const pupil = new THREE.Mesh(ball(n), mat.cloth('ink')); pupil.scale.setScalar(r * 0.55); pupil.position.z = r * 0.55;
    const spark = new THREE.Mesh(ball(6), mat.glow('white', 0.8)); spark.scale.setScalar(r * 0.18); spark.position.set(r * 0.2, r * 0.25, r * 0.95);
    g.add(white, pupil, spark);
    g.name = 'eye';
    return g;
  },
  /** An ear: a cone leaning out, its inside a lighter colour. */
  ear(size = 0.12, colour: Colour = 'wood', inner: Colour = 'rose'): THREE.Group {
    const g = new THREE.Group(), n = Math.min(8, facets(size));
    const out = new THREE.Mesh(cone(n), mat.cloth(colour)); out.scale.set(size * 0.45, size, size * 0.25);
    const ins = new THREE.Mesh(cone(n), mat.cloth(inner)); ins.scale.set(size * 0.28, size * 0.75, size * 0.12); ins.position.z = size * 0.08;
    g.add(out, ins);
    g.name = 'ear';
    return g;
  },
  /** A paw: a squashed ball with three toe bumps at its front. */
  paw(size = 0.1, colour: Colour = 'wood'): THREE.Group {
    const g = new THREE.Group(), n = facets(size), m = mat.cloth(colour);
    const pad = new THREE.Mesh(ball(n), m); pad.scale.set(size * 0.5, size * 0.3, size * 0.55);
    g.add(pad);
    for (const x of [-1, 0, 1]) {
      const toe = new THREE.Mesh(ball(Math.max(6, n - 4)), m); toe.scale.setScalar(size * 0.16); toe.position.set(x * size * 0.22, -size * 0.02, size * 0.45);
      g.add(toe);
    }
    g.name = 'paw';
    return g;
  },
  /** A mushroom cap (or a hat): a dome with light spots; `glow` lights it from inside. */
  cap(size = 0.3, colour: Colour = 'rose', glow = 0): THREE.Group {
    const g = new THREE.Group(), n = facets(size), r = size / 2;
    const top = new THREE.Mesh(dome(n), glow > 0 ? mat.glow(colour, glow) : mat.cloth(colour)); top.scale.set(r, r * 0.7, r);
    g.add(top);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4, e = 0.55 + (i % 2) * 0.25;
      const spot = new THREE.Mesh(ball(6), mat.cloth('white')); spot.scale.setScalar(r * 0.14);
      spot.position.set(Math.sin(a) * r * Math.sin(e), r * 0.7 * Math.cos(e), Math.cos(a) * r * Math.sin(e));
      g.add(spot);
    }
    g.name = 'cap';
    return g;
  },
};
