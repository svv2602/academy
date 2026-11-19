/**
 * The map of the hub (docs/worlds/hub.md, WORLD-01; the grey build of WORLD-12): one glade of about 40 x 40 m, the
 * Great Tree in its middle, five portal arches round it - one per world, in the order of the shelf (WorldDef.shelf) -
 * and a ring of trees and rocks that closes the edge (WORLD-10). Metres; the ground is flat.
 */

/** m: the radius of the glade a walker stays in; the closing ring stands just outside it. */
export const RADIUS = 20;
/** The Great Tree: the middle of its trunk, the radius and height of the trunk, the height of its crown. */
export const TREE = { x: 0, z: 0, r: 2.2, h: 13, crown: 15 };
/** m from the middle: where the arches stand. */
export const PORTAL_R = 12.5;

/** One arch per place of the shelf (0: the first world, the Fairy Kingdom - to the south, the side of arrival). */
export interface PortalPlace { shelf: number; x: number; z: number; /** the way it faces: out of the middle */ facing: number; colour: string; icon: string }
const COLOURS = ['#7fd8ff', '#6ee7a8', '#5cc8d8', '#ff9ed2', '#ffd95e'];   // the crystal, the forest, the sea, the sweets, the sky
const ICONS = ['💎', '💚', '🦪', '♦️', '🌟'];                                // as the places of the shelf (src/ui/book.ts)
export const PORTALS: readonly PortalPlace[] = COLOURS.map((colour, shelf) => {
  const a = (shelf / 5) * Math.PI * 2;   // 0: +z, the south of the glade
  return { shelf, x: Math.sin(a) * PORTAL_R, z: Math.cos(a) * PORTAL_R, facing: a, colour, icon: ICONS[shelf] };
});

/**
 * m inside an arch where she stands arriving from its world, toward the tree: the camera behind her stays a step
 * outside the arch and sees her through it.
 */
export const ARRIVE_IN = 4;
/** The five nests on the trunk: heights over the ground, round the trunk as the arches are. */
export const NESTS = PORTALS.map((p, i) => ({ shelf: p.shelf, a: p.facing, y: 4.2 + i * 1.6 }));

/** Where she stands arriving through the arch of the place `shelf`: inside it, facing the tree. */
export function arrivalAt(shelf: number): { x: number; z: number; facing: number } {
  const p = PORTALS[shelf], d = PORTAL_R - ARRIVE_IN;
  return { x: Math.sin(p.facing) * d, z: Math.cos(p.facing) * d, facing: p.facing + Math.PI };
}

/** The radius of the trunk at the height `y` (it narrows upward). */
export const trunkR = (y: number) => TREE.r * (1.3 - 0.5 * Math.min(1, Math.max(0, y / TREE.h)));
