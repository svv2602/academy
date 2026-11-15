import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { gltf, type Rig } from '../core/assets';

/** The look the start screen picks. A hairstyle of an older save is ignored: the heroine has the one of her model (TECH-14). */
export interface Look { dress: string; hair: string; hairStyle?: string; }

/** Game animation names -> clips of the Universal Animation Library. */
const CLIPS: Record<string, string> = {
  Idle: 'Idle_Loop', Walk: 'Walk_Loop', Run: 'Jog_Fwd_Loop', Jump: 'Jump_Loop', Land: 'Jump_Land',
  Interact: 'Interact', Dance: 'Dance_Loop', Talk: 'Idle_Talking_Loop', Wave: 'Spell_Simple_Shoot',
};
/** Crown height of the heroine standing in Idle: the same as the adult-body heroine had before TECH-14 (R17). */
const HERO_TOP = 1.53;

const skinned = (root: THREE.Object3D) => {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh); });
  return out;
};
const boneMap = (root: THREE.Object3D) => {
  const bones: Record<string, THREE.Bone> = {};
  root.traverse((o) => { if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone; });
  return bones;
};
/** Copies of the game's clips that exist in `anims`, each passed through `edit`. */
function gameClips(anims: THREE.AnimationClip[], edit: (clip: THREE.AnimationClip) => void) {
  const clips = new Map<string, THREE.AnimationClip>();
  for (const [name, src] of Object.entries(CLIPS)) {
    const clip = anims.find((a) => a.name === src)?.clone();
    if (!clip) continue;
    edit(clip);
    clips.set(name, clip);
  }
  return clips;
}

/** Keeps only the triangles driven mostly by the given bones (cuts the head off the full base body). */
function keepBones(mesh: THREE.SkinnedMesh, names: string[]) {
  const ids = new Set<number>();
  mesh.skeleton.bones.forEach((b, i) => { if (names.includes(b.name)) ids.add(i); });
  const g = mesh.geometry, si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight'), idx = g.index!.array, out: number[] = [];
  const w = (v: number) => { let s = 0; for (let k = 0; k < 4; k++) if (ids.has(si.getComponent(v, k))) s += sw.getComponent(v, k); return s; };
  for (let i = 0; i < idx.length; i += 3) if (w(idx[i]) + w(idx[i + 1]) + w(idx[i + 2]) > 1.2) out.push(idx[i], idx[i + 1], idx[i + 2]);
  g.setIndex(out);
}

/**
 * An adult character of a world, assembled from separately rigged CC0 parts that share one 65-bone skeleton:
 * head of the base body + an outfit + the buns, all re-bound to the base skeleton so a single AnimationMixer drives
 * everything. This was the heroine before TECH-14; adult characters keep it (brief R15).
 */
export async function buildAdult(look: Look, height: number, headScale: number): Promise<Rig & { setLook(l: Look): void; headBone: THREE.Object3D }> {
  const [baseSrc, outfitSrc, anims, hairSrc] = await Promise.all([gltf('hero/base'), gltf('hero/ranger'), gltf('hero/anims'), gltf('hero/hair_buns')]);
  // Every character gets its own copy of the parts and materials, so several can coexist.
  const mats = new Map<THREE.Material, THREE.Material>();
  const copy = (src: THREE.Object3D) => {
    const c = cloneSkinned(src);
    c.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const orig = m.material as THREE.Material;
      if (!mats.has(orig)) mats.set(orig, orig.clone());
      m.material = mats.get(orig)!;
      if (m.geometry.index) m.geometry = m.geometry.clone();
    });
    return c;
  };
  const model = copy(baseSrc.scene), outfit = copy(outfitSrc.scene), hair = copy(hairSrc.scene);
  const bones = boneMap(model);
  const armature = model.getObjectByName('Armature')!;
  const adopt = (m: THREE.SkinnedMesh) => {
    m.bind(new THREE.Skeleton(m.skeleton.bones.map((b) => bones[b.name]), m.skeleton.boneInverses), m.bindMatrix);
    armature.add(m);
  };

  let skin: THREE.MeshStandardMaterial | null = null;
  for (const m of skinned(model)) if (m.name.startsWith('Superhero')) { keepBones(m, ['Head', 'neck_01']); skin = m.material as THREE.MeshStandardMaterial; }
  skin?.color.setRGB(1.3, 1.2, 1.16); // a touch lighter and rosier than the source texture

  let dressMat: THREE.MeshStandardMaterial | null = null;
  for (const m of skinned(outfit)) {
    adopt(m);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.name === 'MI_Ranger') dressMat = mat; else mat.color.setRGB(1.3, 1.2, 1.16);
  }
  const dressSource = dressMat!.map!.image as CanvasImageSource & { width: number; height: number };
  const dressTexture = dressMat!.map!;

  const hairMats: THREE.MeshStandardMaterial[] = [];
  for (const m of skinned(hair)) { adopt(m); hairMats.push(m.material as THREE.MeshStandardMaterial); }
  for (const m of skinned(model)) if (m.name === 'Eyebrows') hairMats.push(m.material = (m.material as THREE.MeshStandardMaterial).clone());

  for (const m of skinned(model)) { m.castShadow = true; m.frustumCulled = false; (m.material as THREE.MeshStandardMaterial).metalness = 0; }

  /** Re-paints every green texel of the outfit in the chosen dress colour, keeping the painted shading. */
  function paintDress(hex: string) {
    const target = { h: 0, s: 0, l: 0 }; new THREE.Color(hex).getHSL(target, THREE.SRGBColorSpace);
    const c = document.createElement('canvas'); c.width = dressSource.width; c.height = dressSource.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(dressSource, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
    for (let i = 0; i < p.length; i += 4) {
      col.setRGB(p[i] / 255, p[i + 1] / 255, p[i + 2] / 255, THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace);
      if (hsl.h > 0.19 && hsl.h < 0.48 && hsl.s > 0.18) {
        col.setHSL(target.h, Math.min(1, hsl.s * 1.05), Math.min(0.86, hsl.l * 2.3 + 0.16), THREE.SRGBColorSpace);
        const o = col.getHex(THREE.SRGBColorSpace);
        p[i] = o >> 16; p[i + 1] = (o >> 8) & 255; p[i + 2] = o & 255;
      }
    }
    g.putImageData(d, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = dressTexture.wrapS; tex.wrapT = dressTexture.wrapT; tex.anisotropy = 4;
    if (dressMat!.map !== dressTexture) dressMat!.map!.dispose();
    dressMat!.map = tex;
  }

  let painted = '';
  function setLook(l: Look) {
    if (l.dress !== painted) { paintDress(l.dress); painted = l.dress; }
    for (const m of hairMats) m.color.set(l.hair);
  }
  setLook(look);

  // Normalise height from the bind pose, then make the head a little bigger for storybook proportions.
  model.updateMatrixWorld(true);
  const top = new THREE.Vector3(); bones.Head.getWorldPosition(top);
  model.scale.setScalar(height / (top.y * 1.12));
  const baseHead = bones.Head.scale.clone();
  const root = new THREE.Group(); root.add(model);
  // The head keeps its enlarged scale: animations must not write to it.
  const clips = gameClips(anims.animations, (clip) => { clip.tracks = clip.tracks.filter((t) => !(t.name.startsWith('Head.') && t.name.endsWith('.scale'))); });
  bones.Head.scale.copy(baseHead).multiplyScalar(headScale);
  return { root, model, clips, setLook, headBone: bones.Head };
}

/** Texture regions the look re-paints: found by the colour of the texel (thresholds of the TECH-14 probe). */
const DRESS = 1, HAIR = 2;
function region(h: number, s: number, l: number) {
  if (h > 0.17 && h < 0.45 && s > 0.15 && l > 0.3) return DRESS;
  if (l < 0.36 && (h < 0.12 || h > 0.95) && !(l < 0.12 && s < 0.2)) return HAIR;   // hair and brows, not eyes and lashes
  return 0;
}

/**
 * The heroine (TECH-14): one child model with one texture on the 65-bone UAL skeleton of the game, so the clips of
 * hero/anims play on it unchanged except for the pelvis translation, scaled to her shorter legs. The dress and the hair
 * are re-painted in the texture; the hairstyle is the model's own.
 */
export async function buildHero(look: Look): Promise<Rig & { setLook(l: Look): void; headBone: THREE.Object3D; shoulder: number }> {
  const [src, anims] = await Promise.all([gltf('hero/child'), gltf('hero/anims')]);
  const model = cloneSkinned(src.scene);
  const [mesh] = skinned(model);
  const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
  mesh.material = mat;
  mat.metalness = 0;
  mesh.castShadow = true; mesh.frustumCulled = false;
  const bones = boneMap(model);

  // anims.glb is shared with the adult characters: the pelvis is scaled on this heroine's own copies of the clips. The ratio comes
  // from the rest poses of the two skeletons, so the clips put her pelvis where her legs reach.
  const restY = (root: THREE.Object3D) => { root.updateMatrixWorld(true); return root.getObjectByName('pelvis')!.getWorldPosition(new THREE.Vector3()).y; };
  const pelvis = restY(model) / restY(anims.scene);
  const clips = gameClips(anims.animations, (clip) => {
    for (const t of clip.tracks) if (t.name === 'pelvis.position') t.values = t.values.map((v) => v * pelvis);
  });

  // Height: the crown in the first frame of Idle at HERO_TOP; the wings are hung from the shoulders of that pose.
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clips.get('Idle')!).play();
  mixer.update(0);
  model.updateMatrixWorld(true);
  mesh.computeBoundingBox();
  const scale = HERO_TOP / mesh.boundingBox!.max.y;
  const shoulder = bones.upperarm_l.getWorldPosition(new THREE.Vector3()).y * scale;
  mixer.stopAllAction(); mixer.uncacheRoot(model);   // back to the rest pose
  model.scale.setScalar(scale);

  // The look: dress and hair texels are found once in the source texture; a new colour keeps each texel's shading
  // (its lightness against the mean of its region).
  const source = mat.map!;
  const img = source.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const orig = g.getImageData(0, 0, canvas.width, canvas.height);
  const n = orig.data.length / 4, regions = new Uint8Array(n), light = new Float32Array(n), mean = [0, 0, 0], count = [0, 0, 0];
  const col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < n; i++) {
    const p = orig.data;
    col.setRGB(p[4 * i] / 255, p[4 * i + 1] / 255, p[4 * i + 2] / 255, THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace);
    const r = region(hsl.h, hsl.s, hsl.l);
    regions[i] = r; light[i] = hsl.l; mean[r] += hsl.l; count[r]++;
  }
  for (const r of [DRESS, HAIR]) mean[r] /= Math.max(1, count[r]);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = source.wrapS; tex.wrapT = source.wrapT; tex.anisotropy = 4;
  mat.map = tex;

  function paint(dress: string, hair: string) {
    const out = g.createImageData(canvas.width, canvas.height), d = out.data, t = { h: 0, s: 0, l: 0 };
    d.set(orig.data);
    for (const [r, hex] of [[DRESS, dress], [HAIR, hair]] as const) {
      new THREE.Color(hex).getHSL(t, THREE.SRGBColorSpace);
      for (let i = 0; i < n; i++) if (regions[i] === r) {
        col.setHSL(t.h, t.s, Math.min(0.92, Math.max(0.04, t.l + (light[i] - mean[r]) * 1.2)), THREE.SRGBColorSpace);
        const o = col.getHex(THREE.SRGBColorSpace);
        d[4 * i] = o >> 16; d[4 * i + 1] = (o >> 8) & 255; d[4 * i + 2] = o & 255;
      }
    }
    g.putImageData(out, 0, 0);
    tex.needsUpdate = true;
  }
  let painted = '';
  function setLook(l: Look) {
    const key = l.dress + l.hair;
    if (key !== painted) { paint(l.dress, l.hair); painted = key; }   // a whole texture pass: only when a colour changes
  }
  setLook(look);

  const root = new THREE.Group(); root.add(model);
  return { root, model, clips, setLook, headBone: bones.Head, shoulder };
}
