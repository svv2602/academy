/**
 * Pip's notes in a world of step 2 (part G3): the rolled papers on the ground, the bookmark, their spots - the game's
 * side of ./notes-find.ts (what a note does: there, tested with stand-ins).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sfx } from '../core/audio';
import { facets, mat } from '../core/style';
import type { NoteId } from '../s2/strings-book';
import { createStage, type Game } from './context';
import { BOOKMARK_UP, NOTE_FACE, NOTE_SHOW, NOTE_SPOT_R, createNotes, notesOn, placesOf, type NotePlace, type Notes } from './notes-find';
import type { Spot } from './player';
import type { WorldScope } from './scope';
import { playScene, type Stage } from './stage';
import { showTask } from './taskviews/panel';

/** The colours of the shapes: the paper, its ribbon, the bookmark and its knot. */
const PAPER = '#fff0dc', RIBBON = '#e8505b', KNOT = '#ffd166';

const painted = (g: THREE.BufferGeometry, colour: string) => {
  const c = new THREE.Color(colour), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.deleteAttribute('uv');
};

/** A rolled paper lying on the ground, its ribbon round the middle: one geometry, painted (one material, one draw call). */
export function scrollGeometry(): THREE.BufferGeometry {
  const L = 0.5, R = 0.075, n = facets(2 * R);
  const paper = painted(new THREE.CylinderGeometry(R, R, L, n).rotateZ(Math.PI / 2), PAPER);
  const ribbon = painted(new THREE.CylinderGeometry(R * 1.12, R * 1.12, 0.07, n).rotateZ(Math.PI / 2), RIBBON);
  return mergeGeometries([paper, ribbon], false)!.translate(0, R * 1.12, 0);   // the ribbon on the ground
}

/** The bookmark: a ribbon with a golden knot on top, upright (it floats, or hangs on a branch). */
export function bookmarkGeometry(): THREE.BufferGeometry {
  const ribbon = painted(new THREE.BoxGeometry(0.12, 0.42, 0.02).toNonIndexed(), RIBBON);   // as the knot: unindexed, to merge
  const knot = painted(new THREE.OctahedronGeometry(0.08, 0).translate(0, 0.25, 0), KNOT);
  return mergeGeometries([ribbon, knot], false)!;
}

export interface WorldNotes {
  readonly notes: Notes;
  /** The action spot of each note (on while it lies there and no note is open). */
  readonly spots: readonly Spot[];
  /** Every frame: the near notes drawn, the bookmark waiting, found by walking up to it. */
  update(dt: number, time: number, canMove: boolean): void;
  /** The debug door (the world's `more.notes`). */
  debug(): NotesDebug;
}

export interface NotesDebug {
  shown: NoteId[]; found: string[]; waiting: NoteId | null; drawn: number;
  places: ReturnType<typeof placesOf>;
  /** A tap on note `id` (its panel task). */
  read(id: NoteId): void;
  /** She has come to the bookmark of `id`: false - none waits for it. */
  find(id: NoteId): boolean;
}

/**
 * The notes of `places` in the world: one instanced mesh for all of them (one draw call, only while one is near), the
 * bookmark a mesh of its own (a second call, only while it waits); neither casts a shadow. Built at every entry, shown
 * or not (the scene of a world is the same at each). `stage`: the world's, so its own end of a scene is kept.
 */
export function worldNotes(g: Game, places: readonly NotePlace[], scope: WorldScope, stage: Stage = createStage(g, () => {})): WorldNotes {
  // a stone or a bush of chance on the place: out of it, as the mysterious stars are (./mystery-stars.ts)
  const lay = places.map((p) => {
    const at = { x: p.x, z: p.z };
    g.ground.resolve(at, 0.5);
    const find = p.find && { x: p.find.x, z: p.find.z };
    if (find) g.ground.resolve(find, 0.6);
    return { ...p, x: at.x, z: at.z, ...(find ? { find: { ...p.find, ...find } } : {}) } as NotePlace;
  });
  const pos = (p: { x: number; z: number }, dy = 0) => new THREE.Vector3(p.x, g.groundY(p.x, p.z) + dy, p.z);
  const material = mat.own('glow', 'plaster', 0.18, { emissive: 'plaster', roughness: 0.9 });
  material.vertexColors = true;
  material.name = 'notes';
  const scroll = scrollGeometry(), mark = bookmarkGeometry();
  const mesh = new THREE.InstancedMesh(scroll, material, Math.max(1, lay.length));
  mesh.name = 'notes';
  mesh.count = 0; mesh.visible = false;
  mesh.castShadow = false; mesh.receiveShadow = true;
  g.scene.add(mesh);
  const bookmark = new THREE.Mesh(mark, material);
  bookmark.name = 'note-bookmark';
  bookmark.visible = false; bookmark.castShadow = false;
  g.scene.add(bookmark);
  scope.own(() => { g.scene.remove(mesh, bookmark); scroll.dispose(); mark.dispose(); material.dispose(); mesh.dispose(); });

  const notes = createNotes({
    save: g.save, places: lay, rng: g.rng,
    scene: async (name, p, body) => (await playScene(stage, name, async () => {
      g.cam.focus = g.above(pos(p), 0.3);
      await body();
    })) === 'done',
    panel: (spec) => g.task(async () => {
      const res = await showTask(spec, g.hooksFor(NOTE_FACE));
      g.plan.done(spec, res);       // its example kept on a mistake; №8 noted for adding (./planner.ts)
      return res;
    }),
    reward: (at) => {
      const p = pos(at, (at.up ?? 0) + 0.4);
      sfx('good');
      g.sparks.burst(p, '#ffd166', 30, 3);
      g.addStars(3, g.above(g.hero.root.position, 1.4));
    },
    persist: () => g.persist(),
  });

  const spots: Spot[] = lay.map((p) => ({
    pos: pos(p), r: NOTE_SPOT_R, label: 'open',
    on: () => !notes.opening() && notes.shown().includes(p.id),
    run: () => { void notes.open(p.id); },
  }));

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  let drawnKey = '';
  const byId = new Map(lay.map((p, i) => [p.id, { p, ground: spots[i].pos }]));
  return {
    notes, spots,
    update: (_dt, time, canMove) => {
      const hp = g.hero.root.position;
      notes.update(hp, canMove);
      // the near notes only, in one mesh whose bounds are theirs: far off, or out of the frame, it costs no call
      const near = notes.shown().filter((id) => { const p = byId.get(id)!.p; return Math.hypot(p.x - hp.x, p.z - hp.z) < NOTE_SHOW; });
      const key = near.join(',');
      if (key !== drawnKey) {
        drawnKey = key;
        near.forEach((id, i) => { const { p, ground } = byId.get(id)!; mesh.setMatrixAt(i, m4.compose(ground, q.setFromAxisAngle(up, p.heading), one)); });
        mesh.count = near.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.visible = near.length > 0;
      }
      material.emissiveIntensity = 0.18 + 0.12 * Math.sin(time * 2.5);
      const w = notes.waiting(), f = w ? byId.get(w)!.p.find : undefined;
      bookmark.visible = !!f && notesOn(g.save);
      if (f && bookmark.visible) {
        const hang = f.hang ?? f;
        at.copy(pos(hang, f.up ?? BOOKMARK_UP + Math.sin(time * 2) * 0.06));
        bookmark.position.copy(at);
        // up a tree it sways a little, its face out from the trunk; on the ground it turns round
        bookmark.rotation.y = f.hang ? Math.atan2(f.x - hang.x, f.z - hang.z) + Math.sin(time * 1.5) * 0.25 : time * 1.4;
      }
    },
    debug: () => ({
      shown: notes.shown(), found: [...g.save.notes], waiting: notes.waiting(), drawn: mesh.visible ? mesh.count : 0,
      places: placesOf(lay),
      read: (id) => { void notes.open(id); },
      find: (id) => notes.reach(id),
    }),
  };
}
