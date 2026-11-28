// @vitest-environment happy-dom
/**
 * Pip (Season 2, part G1): when he shows and is met, what his meeting writes, the order of its lines, and his figure -
 * turning to her within PIP_TURN m, back to his heading beyond it, gone with English off.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Rig } from '../core/assets';
import { defaultSave } from '../core/save';
import { EN } from '../s2/strings-en';
import { strings as pipStrings } from '../s2/strings-pip';
import { HUB_WORDS, MEETING, PIP_TURN, createPip, meetPip, meetsPip, pipShown } from './pip';

describe('when Pip is there', () => {
  it('in the worlds once met, English on; never with English off', () => {
    const s = defaultSave();
    expect(pipShown(s)).toBe(false);
    s.pip.met = true;
    expect(pipShown(s)).toBe(true);
    s.english = false;
    expect(pipShown(s)).toBe(false);
  });

  it('his meeting in the hub: after the first world, English on, once', () => {
    const s = defaultSave();
    expect(meetsPip(s, false)).toBe(false);
    expect(meetsPip(s, true)).toBe(true);
    s.english = false;
    expect(meetsPip(s, true)).toBe(false);
    s.english = true; s.pip.met = true;
    expect(meetsPip(s, true)).toBe(false);
  });
});

describe('his meeting', () => {
  it('writes him met and the five words of the hub into the book, each once', () => {
    const s = defaultSave();
    expect(HUB_WORDS).toEqual(['hello', 'goodbye', 'cat', 'bird', 'tree']);
    expect(meetPip(s)).toBe(5);
    expect(s.pip.met).toBe(true);
    expect(s.words).toEqual([...HUB_WORDS]);
    expect(meetPip(s)).toBe(0);
    expect(s.words).toHaveLength(5);
  });

  it('Pip speaks English, the cat translates after each of his lines; every line is a line of the game', () => {
    expect(MEETING.map((m) => ('pip' in m ? `P:${m.pip}` : `C:${m.cat}`))).toEqual([
      'P:pip_arrive', 'C:pip_cat_who', 'C:pip_cat_hello', 'P:pip_lost', 'C:pip_cat_lost', 'P:pip_map', 'C:pip_cat_map', 'P:pip_help', 'C:pip_cat_learn']);
    for (const m of MEETING) {
      if ('pip' in m) expect(EN.get(m.pip)?.voice, m.pip).toBe('Zephyr');
      else expect(Object.keys(pipStrings.spoken), m.cat).toContain(m.cat);
    }
    // after every line of his, a line of the cat's before the next of his
    MEETING.forEach((m, i) => { if ('pip' in m) expect('cat' in (MEETING[i + 1] ?? { cat: 'x' })).toBe(true); });
  });
});

/** A rig with no clips: enough for his figure (Actor plays nothing it does not have). */
function stubRig(): Rig {
  const root = new THREE.Group(), model = new THREE.Group();
  root.add(model);
  return { root, model, clips: new Map() };
}

describe('his figure', () => {
  it('stands on the ground at his place, turns to her within PIP_TURN m and back beyond, the mark over his head', () => {
    const scene = new THREE.Scene(), blocks: number[][] = [];
    const pip = createPip(scene, stubRig(), { x: 2, z: 3, heading: 0.5 }, () => 1.5, (x, z, r) => blocks.push([x, z, r]));
    expect([pip.pos.x, pip.pos.y, pip.pos.z]).toEqual([2, 1.5, 3]);
    expect(blocks).toEqual([[2, 3, 0.4]]);
    const near = new THREE.Vector3(2 + PIP_TURN - 1, 0, 3);
    for (let i = 0; i < 200; i++) pip.update(0.05, i * 0.05, near);
    expect(pip.actor.heading).toBeCloseTo(Math.PI / 2, 2);
    const far = new THREE.Vector3(2 + PIP_TURN + 5, 0, 3);
    for (let i = 0; i < 200; i++) pip.update(0.05, i * 0.05, far);
    expect(pip.actor.heading).toBeCloseTo(0.5, 2);
    expect(pip.mark.position.y).toBeGreaterThan(pip.pos.y);
  });

  it('hidden: no mark either; disposed: gone from the scene', () => {
    const scene = new THREE.Scene();
    const pip = createPip(scene, stubRig(), { x: 0, z: 0, heading: 0 }, () => 0);
    pip.mark.visible = true;
    pip.show(false);
    expect([pip.actor.root.visible, pip.mark.visible]).toEqual([false, false]);
    pip.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('without a shadow (the worlds): no mesh of his casts one - the loader makes every mesh cast', () => {
    const rig = stubRig();
    const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    body.castShadow = true;
    rig.model.add(body);
    createPip(new THREE.Scene(), rig, { x: 0, z: 0, heading: 0 }, () => 0, undefined, false);
    expect(body.castShadow).toBe(false);
  });
});
