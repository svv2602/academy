/**
 * The potions and the compass in the game (src/game/supplies.ts holds their rules): the button of each drinks it, the
 * time of play runs their effects down, the tuning gets their factors, and the frame shows what acts.
 *
 * - speed: a trail of sparkles at her feet while she moves (the shared pool of sparks);
 * - glow: a halo around her (one sprite, additive: no light of its own - a light would be new shader variants of
 *   everything lit, decision of 2026-11-19), sparkles rising off her, and the mysterious stars and the finds within
 *   GLIMMER_R twinkle;
 * - tiny / giant: her size (her radius against the world and the camera follow it, src/game/player.ts, camera.ts);
 * - compass: an arrow lying at her feet points to the nearest mysterious star not solved yet.
 *
 * The objects here are the game's own (made once, inside the scope's `shared`): they stay through every change of world.
 */
import * as THREE from 'three';
import { applyEffects } from '../core/tuning';
import type { Game } from './context';
import { swimming } from './player';
import { SUPPLY_IDS, stock, type SupplyId } from './shop';
import { acting, drink, left, mysteriesLeft, refusal, sizeOf, tick, tuningOf, type EffectId, type Refusal } from './supplies';

/** m: how near a mysterious star or a find twinkles under the glow. */
export const GLIMMER_R = 25;
/** s: between two twinkles of the same place. */
const GLIMMER_EVERY = 0.5;

/**
 * The mysterious stars of the world played (src/game/mystery.ts, PLAY-24): read only through this, and anew every time
 * (a new day, a hold let go change them from one frame to the next). `today` - the stars of the day, solved ones too
 * (none: the world has no places, or they are held); `unsolved` - those still to find. Until PLAY-24 is in the game
 * there is no `g.mystery`: the compass is dimmed.
 */
interface MysteryView { readonly today?: readonly unknown[]; unsolved(): readonly THREE.Vector3[] }
const mysteryOf = (g: Game): MysteryView | null => (g as unknown as { mystery?: MysteryView | null }).mystery ?? null;
/** The finds of the collections not found yet (src/game/collect-items.ts, PLAY-25): they twinkle under the glow too. */
const collectOf = (g: Game): readonly THREE.Vector3[] => (g as unknown as { collect?: { unfound(): readonly THREE.Vector3[] } }).collect?.unfound() ?? [];

/** What the potions need of the world played (src/main.ts hands it over through the change of world). */
export interface SupplyWorld {
  /** The finds of the world not found yet (BuiltWorld.glimmer): they twinkle under the glow. */
  glimmer(): readonly THREE.Vector3[];
  /** She is in a cramped place now (BuiltWorld.cramped): a giant keeps her own size there. */
  cramped(): boolean;
}

/** One button of the screen (src/ui/supplies.ts): how many she has, the seconds left of its effect, and whether a tap would drink it. */
export interface SupplyButton { id: SupplyId; count: number; left: number; refusal: Refusal | null }

export interface Supplies {
  /** Drinks one `id` (a tap on its button): its effect, or why not. Stores the save. */
  drink(id: SupplyId): { effect: EffectId } | { refused: Refusal };
  /** The buttons to show: the supplies she has or whose effect acts, in the order of SUPPLY_IDS. */
  buttons(): SupplyButton[];
  /** The frame: the time runs while she can walk; the tuning, her size and the pictures follow what acts. */
  update(dt: number, time: number, canMove: boolean): void;
  /** What drinking said, for the screen: the cat's line of the effect. */
  onDrink(fn: (effect: EffectId) => void): void;
  /** Called at the end of every `update` with whether she can walk: the screen draws its buttons. */
  onFrame(fn: (canMove: boolean) => void): void;
}

const installed = new WeakMap<Game, Supplies>();
/** The potions of a game, once installed (src/main.ts); the loop updates them (src/game/loop.ts). */
export const suppliesOf = (g: Game): Supplies | undefined => installed.get(g);

/** A soft round spot of light for the halo; a plain white one where the page cannot draw (tests). */
function haloTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  if (x) {
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,250,220,0.9)'); grad.addColorStop(0.4, 'rgba(255,214,240,0.45)'); grad.addColorStop(1, 'rgba(255,214,240,0)');
    x.fillStyle = grad; x.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The arrow of the compass: a flat golden arrow lying on the ground, pointing along +z. */
function arrowMesh(): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(0, 1.1); s.lineTo(0.42, 0.45); s.lineTo(0.16, 0.45); s.lineTo(0.16, -0.1); s.lineTo(-0.16, -0.1); s.lineTo(-0.16, 0.45); s.lineTo(-0.42, 0.45); s.closePath();
  const geo = new THREE.ShapeGeometry(s);
  geo.rotateX(-Math.PI / 2);   // the shape's +y lies along -z: turned to point along +z below
  geo.rotateY(Math.PI);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.9, depthWrite: false }));
  mesh.name = 'compass arrow';
  mesh.visible = false; mesh.renderOrder = 2;
  return mesh;
}

/**
 * Installs the potions in the game: made once, inside the scope's `shared` (src/main.ts), so the halo and the arrow are
 * the game's. `world` answers for the world played at the moment of the question.
 */
export function installSupplies(g: Game, world: SupplyWorld): Supplies {
  const { save, hero, sparks } = g;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.name = 'glow halo';
  halo.position.set(0, 0.9, 0); halo.scale.set(2.4, 2.4, 1); halo.visible = false;
  hero.root.add(halo);
  const arrow = arrowMesh();
  g.scene.add(arrow);
  const drinkers: ((e: EffectId) => void)[] = [];
  const frames: ((canMove: boolean) => void)[] = [];
  let applied = '';
  let sinceTrail = 0, sinceGlow = 0, sinceGlimmer = 0, n = 0;
  const lastAt = hero.root.position.clone();
  const at = new THREE.Vector3();

  const place = () => {
    const m = mysteryOf(g);
    // no stars today at all: null (the compass is dimmed); stars, all solved: 0 (the cat says so)
    return { water: swimming(g), mysteries: mysteriesLeft(m) };
  };

  /** The tuning and her size for what acts now; only when that changed (the debug panel is not overwritten every frame). */
  const follow = () => {
    const now = acting(save), cramped = world.cramped();
    const key = `${now.join(',')}|${cramped}`;
    if (key !== applied) { applied = key; applyEffects(tuningOf(now, cramped)); }
    return { now, size: sizeOf(now, cramped) };
  };

  const nearest = (from: THREE.Vector3): THREE.Vector3 | null => {
    let best: THREE.Vector3 | null = null, d = Infinity;
    for (const p of mysteryOf(g)?.unsolved() ?? []) {
      const k = Math.hypot(p.x - from.x, p.z - from.z);
      if (k < d) { d = k; best = p; }
    }
    return best;
  };

  const api: Supplies = {
    drink(id) {
      const r = drink(save, id, { ...place(), random: Math.random });
      if ('effect' in r) {
        g.persist();
        follow();
        sparks.burst(g.above(hero.root.position, 1.2), '#c9a2ff', 26, 3);
        for (const fn of drinkers) fn(r.effect);
      }
      return r;
    },
    buttons() {
      const p = place();
      return SUPPLY_IDS
        .map((id) => ({ id, count: stock(save, id), left: id === 'funny' ? Math.max(left(save, 'tiny'), left(save, 'giant')) : left(save, id as EffectId), refusal: refusal(save, id, p) }))
        .filter((b) => b.count > 0 || b.left > 0);
    },
    update(dt, _time, canMove) {
      if (canMove && tick(save, dt).length) g.persist();
      const { now, size } = follow();
      // her size: grown and shrunk over a third of a second, the cat and the camera follow her
      const s = hero.root.scale.x;
      const next = Math.abs(size - s) < 0.01 ? size : s + (size - s) * Math.min(1, dt * 6);
      if (next !== s) hero.root.scale.setScalar(next);
      const hp = hero.root.position;
      const moved = Math.hypot(hp.x - lastAt.x, hp.z - lastAt.z);
      lastAt.copy(hp);
      // speed: a trail of sparkles while she moves
      if (now.includes('speed') && moved > 0.002 && (sinceTrail += dt) > 0.05) {
        sinceTrail = 0;
        at.set(hp.x + (Math.random() - 0.5) * 0.4, hp.y + 0.2, hp.z + (Math.random() - 0.5) * 0.4);
        sparks.burst(at, n++ % 2 ? '#7fe3ff' : '#ffe066', 3, 1);
      }
      // glow: the halo, sparkles rising off her, the places near her twinkle
      const glow = now.includes('glow');
      halo.visible = glow;
      if (glow) {
        if ((sinceGlow += dt) > 0.25) { sinceGlow = 0; sparks.burst(g.above(hp, 0.6 + Math.random() * 1.2), '#fff3b0', 2, 0.6); }
        if ((sinceGlimmer += dt) > GLIMMER_EVERY) {
          sinceGlimmer = 0;
          for (const p of [...(mysteryOf(g)?.unsolved() ?? []), ...world.glimmer(), ...collectOf(g)]) {
            if (Math.hypot(p.x - hp.x, p.z - hp.z) <= GLIMMER_R) sparks.burst(at.copy(p).setY(p.y + 0.4), '#fff6c8', 5, 1.2);
          }
        }
      }
      // compass: the arrow at her feet, to the nearest mysterious star not solved yet
      const to = now.includes('compass') ? nearest(hp) : null;
      arrow.visible = to !== null && g.started();
      if (to) {
        arrow.position.set(hp.x, hp.y + 0.06, hp.z);
        arrow.rotation.y = Math.atan2(to.x - hp.x, to.z - hp.z);
        arrow.scale.setScalar(hero.root.scale.x);
      }
      for (const fn of frames) fn(canMove);
    },
    onDrink(fn) { drinkers.push(fn); },
    onFrame(fn) { frames.push(fn); },
  };
  installed.set(g, api);
  // A reload in the middle of an effect: what acts is applied before the first frame.
  follow();
  hero.root.scale.setScalar(sizeOf(acting(save), world.cramped()));
  return api;
}
