import * as THREE from 'three';
import { gltf, type Rig } from '../core/assets';

export const HAIR_STYLES = ['long', 'buns', 'simpleparted'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export interface Look { dress: string; hair: string; hairStyle: HairStyle; }

/** Game animation names -> clips of the Universal Animation Library. */
const CLIPS: Record<string, string> = {
  Idle: 'Idle_Loop', Walk: 'Walk_Loop', Run: 'Jog_Fwd_Loop', Jump: 'Jump_Loop', Land: 'Jump_Land',
  Interact: 'Interact', Dance: 'Dance_Loop', Talk: 'Idle_Talking_Loop', Wave: 'Spell_Simple_Shoot',
};
const HEIGHT = 1.5, HEAD_SCALE = 1.2;

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
 * The heroine is assembled from separately rigged CC0 parts that share one 65-bone skeleton:
 * head of the base body + an outfit + one of several hairstyles, all re-bound to the base skeleton
 * so a single AnimationMixer drives everything.
 */
export async function buildHero(look: Look): Promise<Rig & { setLook(l: Look): void; headBone: THREE.Object3D }> {
  const [base, outfit, anims, ...hairs] = await Promise.all([
    gltf('hero/base'), gltf('hero/ranger'), gltf('hero/anims'), ...HAIR_STYLES.map((h) => gltf('hero/hair_' + h)),
  ]);
  const model = base.scene;
  const bones: Record<string, THREE.Bone> = {};
  model.traverse((o) => { if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone; });
  const armature = model.getObjectByName('Armature')!;
  const skinned = (root: THREE.Object3D) => { const out: THREE.SkinnedMesh[] = []; root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh); }); return out; };
  const adopt = (m: THREE.SkinnedMesh) => {
    m.bind(new THREE.Skeleton(m.skeleton.bones.map((b) => bones[b.name]), m.skeleton.boneInverses), m.bindMatrix);
    armature.add(m);
  };

  let skin: THREE.MeshStandardMaterial | null = null;
  for (const m of skinned(model)) if (m.name.startsWith('Superhero')) { keepBones(m, ['Head', 'neck_01']); skin = m.material as THREE.MeshStandardMaterial; }
  skin?.color.setRGB(1.3, 1.2, 1.16); // a touch lighter and rosier than the source texture

  let dressMat: THREE.MeshStandardMaterial | null = null;
  for (const m of skinned(outfit.scene)) {
    adopt(m);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.name === 'MI_Ranger') dressMat = mat; else mat.color.setRGB(1.3, 1.2, 1.16);
  }
  const dressSource = dressMat!.map!.image as CanvasImageSource & { width: number; height: number };
  const dressTexture = dressMat!.map!;

  const hairMeshes = new Map<HairStyle, THREE.SkinnedMesh>();
  const hairMats: THREE.MeshStandardMaterial[] = [];
  hairs.forEach((g, i) => {
    for (const m of skinned(g.scene)) { adopt(m); hairMeshes.set(HAIR_STYLES[i], m); hairMats.push(m.material as THREE.MeshStandardMaterial); }
  });
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
    for (const [style, mesh] of hairMeshes) mesh.visible = style === l.hairStyle;
  }
  setLook(look);

  // Normalise height from the bind pose, then make the head a little bigger for storybook proportions.
  model.updateMatrixWorld(true);
  const top = new THREE.Vector3(); bones.Head.getWorldPosition(top);
  model.scale.setScalar(HEIGHT / (top.y * 1.12));
  const baseHead = bones.Head.scale.clone();
  const root = new THREE.Group(); root.add(model);
  const clips = new Map<string, THREE.AnimationClip>();
  for (const [name, src] of Object.entries(CLIPS)) {
    const clip = anims.animations.find((a) => a.name === src);
    if (!clip) continue;
    // The head keeps its enlarged scale: animations must not write to it.
    clip.tracks = clip.tracks.filter((t) => !(t.name.startsWith('Head.') && t.name.endsWith('.scale')));
    clips.set(name, clip);
  }
  bones.Head.scale.copy(baseHead).multiplyScalar(HEAD_SCALE);
  return { root, model, clips, setLook, headBone: bones.Head };
}
