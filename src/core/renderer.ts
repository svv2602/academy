import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { startTier, type Tier } from './quality';
import { storeSave, type Save } from './save';
import { setDrawRange } from './instancing';
import { el } from '../ui/ui';
import { transition } from '../game/transition';

/**
 * The renderer, the scene and the camera. A factory, not module code: main.ts imports this before its WebGL2 check
 * (TECH-07), and a renderer made at import would throw on a browser without WebGL2.
 */
export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 600);
  return { renderer, scene, camera };
}

export interface Quality {
  readonly tier: Tier;
  /** Sizes the canvas and the camera, and sets up the shadows and the bloom of the current tier. */
  apply(): void;
  /** The parent pinned a tier (or went back to automatic): it applies at once, unless ?q= holds this page. */
  applyPin(): void;
  render(dt: number): void;
  /** The frame counter and the automatic fallback; call once a frame after `render`. */
  meter(dt: number, persist: () => void): void;
  /**
   * TECH-15: the sun of the world played from now on (a change of world; the sun of the world left is gone with its
   * scope). It casts the shadows of the current tier, and every later `apply()` sets up this one.
   */
  setSun(sun: THREE.DirectionalLight): void;
}

/**
 * The quality tiers. 2: bloom+shadows, 1: shadows, 0: plain. TECH-04: ?q= > the parent's pin > the tier the last session
 * ended on (every tenth launch one higher). A launch is a page load: the counter and the tier are stored at once.
 */
export function createQuality(o: {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; sun: THREE.DirectionalLight;
  save: Save; param: string | null; touch: boolean; debug: boolean;
}): Quality {
  const { renderer, scene, camera, save, touch, debug } = o;
  let sun = o.sun;
  const start = startTier({ param: o.param, pinned: save.pinTier, saved: save.tier, launches: save.launches });
  let tier: Tier = start.tier;
  const byParam = start.by === 'param';         // ?q= fixes the tier for this page and leaves the remembered one alone
  save.launches = start.launches;
  if (!byParam) save.tier = tier;
  storeSave(save);
  let composer: EffectComposer | null = null;
  let fpsT = 0, fpsN = 0, slow = 0, warm = 0;

  function apply() {
    const dpr = Math.min(devicePixelRatio, tier === 2 ? 2 : tier === 1 ? 1.5 : 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 1 ? 70 : 55;
    camera.updateProjectionMatrix();
    setDrawRange(tier === 2 ? 1 : tier === 1 ? 0.8 : 0.62);
    renderer.shadowMap.enabled = tier > 0;
    sun.castShadow = tier > 0;
    sun.shadow.mapSize.setScalar(tier === 2 ? 2048 : 1024);
    sun.shadow.map?.dispose(); sun.shadow.map = null;
    composer?.dispose(); composer = null;
    if (tier === 2) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: touch ? 2 : 4 });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.7, 0.9));
      composer.addPass(new OutputPass());
    }
    scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m)) m.needsUpdate = true; });
  }

  function applyPin() {
    if (byParam || save.pinTier === null || save.pinTier === tier) return;
    tier = save.pinTier; save.tier = tier; apply();
  }

  function render(dt: number) {
    renderer.info.reset();
    if (composer) composer.render(dt); else renderer.render(scene, camera);
    // The transition between worlds (TECH-15), over the finished frame of either path: straight into the canvas, after
    // the bloom and the tone curve. Outside a transition it draws nothing - the count of calls stays as it was.
    transition.render(renderer, dt);
  }

  // fps meter + automatic quality fallback. The frames are measured with or without ?debug: the fallback needs them.
  function meter(dt: number, persist: () => void) {
    fpsT += dt; fpsN++; warm += dt;
    // TECH-15: while the frame is closed for a change of world, a world is loaded and built behind it - slow frames
    // that say nothing of the tier. The fallback starts over: no slow second is carried into the new world.
    if (transition.active) { slow = 0; warm = 0; }
    if (fpsT >= 1) {
      const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
      if (debug) el.fps.textContent = `${fps.toFixed(0)} fps · q${tier} · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris · ${renderer.info.render.calls} calls`;
      if (warm > 4 && !byParam && save.pinTier === null && !document.hidden) {
        slow = fps < 34 ? slow + 1 : 0;
        // the lowered tier is saved at once: the next launch starts from it (TECH-04)
        if (slow >= 3 && tier > 0) { tier = (tier - 1) as Tier; slow = 0; warm = 0; apply(); save.tier = tier; persist(); }
      }
    }
  }

  function setSun(next: THREE.DirectionalLight) {
    sun = next;
    sun.castShadow = tier > 0;
    sun.shadow.mapSize.setScalar(tier === 2 ? 2048 : 1024);
  }

  return { get tier() { return tier; }, apply, applyPin, render, meter, setSun };
}
