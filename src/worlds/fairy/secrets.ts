import * as THREE from 'three';
import { sfx } from '../../core/audio';
import type { Game } from '../../game/context';
import { petPlace } from '../../game/pets';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { GLADE, HOUSE, ROOM } from './layout';

/**
 * The two secrets of the first world besides the chest (PLAY-10): optional, not needed by the story, each found once.
 *
 * - The glade behind the waterfall: a ring of rocks at the valley's south-east rim, closed but for a curtain of falling
 *   water that faces the valley; the heroine walks through the water, and walking into the middle of the glade finds it.
 * - The fairy house by the well: its door leads into a room (a closed floor far beyond the valley, ./terrain.ts walks it
 *   like the meadow, its walls hold her in); the fairy's music box on the table is the find; the door inside leads out.
 *
 * A find is the world's flag of its name (`glade`, `house`: also the ids of their items of the world description and
 * the names in WorldDef.secrets, which the book and the achievement "three secrets" read), 3 stars and the cat's line
 * once; coming back gives nothing again. Everything here is the world's and goes with it (`scope`).
 */
export const GLADE_FLAG = 'glade', HOUSE_FLAG = 'house';
/** m from the middle of the glade where walking in finds it. */
const FIND_R = 1.5;

export interface Secrets {
  readonly spots: readonly Spot[];
  /** Where the heroine stands for each find (the items of the description): the middle of the glade, before the music box. */
  readonly gladeAt: { x: number; z: number };
  readonly boxAt: { x: number; z: number };
  /** The door of the house outside, and inside the room. */
  readonly doorOut: THREE.Vector3;
  readonly doorIn: THREE.Vector3;
  /** Is the heroine in the room of the house now. */
  inRoom(): boolean;
  update(dt: number, time: number, canMove: boolean): void;
}

const ROCK = new THREE.MeshStandardMaterial({ color: '#b7a9c4', roughness: 0.95, flatShading: true });
const MOSS = new THREE.MeshStandardMaterial({ color: '#7cc46a', roughness: 1, flatShading: true });

/** A curtain of falling water: stripes that run down, lighter at the edges, never fully opaque. */
function waterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main() {
        float s = sin(vUv.x * 41.0 + sin(vUv.x * 13.0) * 2.0) * 0.5 + 0.5;
        float run = fract(vUv.y * 3.0 + uTime * 1.6 + s * 0.35);
        float streak = smoothstep(0.0, 0.25, run) * (1.0 - smoothstep(0.55, 1.0, run));
        vec3 col = mix(vec3(0.55, 0.82, 0.98), vec3(0.95, 0.99, 1.0), streak * 0.8 + (1.0 - vUv.y) * 0.25);
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        gl_FragColor = vec4(col, (0.55 + streak * 0.3) * edge);
      }`,
  });
}

export function createSecrets(g: Game, scope: WorldScope): Secrets {
  const { scene, ws, groundY, ground, hero, cat } = g;
  const { line } = g.speech;
  const group = new THREE.Group();
  scene.add(group);   // the world's scope clears the scene as the world is left: the group and all it holds are freed with it

  // ---------- the glade behind the waterfall ----------
  // The curtain faces the valley's middle; the ring of rocks closes the rest.
  const face = Math.atan2(-GLADE.x, -GLADE.z), R = GLADE.r + 1.4;
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, ROCK, 40);
  let nRock = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const rock = (x: number, z: number, r: number, h: number, spin: number) => {
    q.setFromEuler(new THREE.Euler(0, spin, 0.2 * Math.sin(spin * 3)));
    m4.compose(pv.set(x, groundY(x, z) + h * 0.45, z), q, sv.set(r, h, r));
    rocks.setMatrixAt(nRock++, m4);
    ground.block(x, z, r * 0.9);
  };
  const GAP = 0.42;   // half the angle of the entrance, rad
  for (let i = 0; i < 18; i++) {
    const a = face + GAP + (i / 17) * (Math.PI * 2 - GAP * 2);
    rock(GLADE.x + Math.sin(a) * R, GLADE.z + Math.cos(a) * R, 1.25 + (i % 3) * 0.25, 2.4 + ((i * 7) % 5) * 0.35, i * 1.7);
  }
  // the two pillars of the entrance and the stone over it the water falls from
  const side = (s: number) => face + s * (GAP + 0.08);
  for (const s of [-1, 1]) rock(GLADE.x + Math.sin(side(s)) * R, GLADE.z + Math.cos(side(s)) * R, 1.15, 4.2, s * 2);
  const ex = GLADE.x + Math.sin(face) * R, ez = GLADE.z + Math.cos(face) * R, ey = groundY(ex, ez);
  q.setFromEuler(new THREE.Euler(0, face, 0));
  m4.compose(pv.set(ex, ey + 4.1, ez), q, sv.set(2.6, 0.9, 1.3));
  rocks.setMatrixAt(nRock++, m4);
  rocks.count = nRock;
  rocks.castShadow = true; rocks.receiveShadow = true;
  group.add(rocks);
  // moss on the top of the lintel
  const moss = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), MOSS);
  moss.position.set(ex, ey + 4.55, ez); moss.scale.set(2.2, 0.35, 1.1); moss.rotation.y = face;
  group.add(moss);

  const water = waterMaterial();
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 4), water);
  curtain.position.set(ex, ey + 2, ez); curtain.rotation.y = face;
  curtain.renderOrder = 3;
  group.add(curtain);
  // the pool at its foot, and its foam
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.7, 20), new THREE.MeshStandardMaterial({ color: '#7cc8e8', roughness: 0.2, transparent: true, opacity: 0.85 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(ex + Math.sin(face) * 0.6, ey + 0.04, ez + Math.cos(face) * 0.6);
  group.add(pool);
  const foam = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.7, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(ex, ey + 0.07, ez);
  group.add(foam);

  // inside: a ring of glowing flowers around the middle
  const petal = new THREE.MeshStandardMaterial({ color: '#ffb3e6', emissive: '#ff7fd0', emissiveIntensity: 0.6, roughness: 0.6 });
  const stem = new THREE.MeshStandardMaterial({ color: '#4fae54', roughness: 1 });
  const flowers = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = 2.1 + (i % 2) * 0.5, x = GLADE.x + Math.sin(a) * r, z = GLADE.z + Math.cos(a) * r, y = groundY(x, z);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 5), stem);
    st.position.set(x, y + 0.3, z);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), petal);
    bloom.position.set(x, y + 0.66, z); bloom.userData.base = bloom.position.y; bloom.userData.k = i;
    flowers.add(st, bloom);
  }
  group.add(flowers);
  const gladeFound = () => ws.flags[GLADE_FLAG] === true;
  function findGlade() {
    ws.flags[GLADE_FLAG] = true;
    sfx('good');
    g.sparks.burst(g.above(hero.root.position, 1.2), '#ffb3e6', 30, 3);
    g.addStars(3, g.above(hero.root.position, 1.4));
    void line('secret_glade', 'hint', 5000);
  }

  // ---------- the fairy house and its room ----------
  const hx = Math.sin(HOUSE.rot), hz = Math.cos(HOUSE.rot);
  const outAt = { x: HOUSE.x + hx * 4.1, z: HOUSE.z + hz * 4.1 };
  const doorOut = new THREE.Vector3(outAt.x, groundY(outAt.x, outAt.z), outAt.z);
  const wall = new THREE.MeshStandardMaterial({ color: '#fff0dc', roughness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ color: '#b98560', roughness: 0.8 });
  const room = new THREE.Group();
  room.position.set(ROOM.x, ROOM.y, ROOM.z);
  const S = ROOM.half * 2, WALL_H = 3;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ color: '#d8a878', roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  // four walls facing in, seen from inside only: a camera behind one sees through it into the room; no ceiling
  const walls = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(S, WALL_H), wall), a = (i * Math.PI) / 2;
    w.position.set(-Math.sin(a) * ROOM.half, WALL_H / 2, -Math.cos(a) * ROOM.half); w.rotation.y = a;
    walls.add(w);
  }
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshStandardMaterial({ color: '#ff9ccf', roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.01;
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 20), wood);
  table.position.set(0, 0.75, -2.2);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.75, 8), wood);
  leg.position.set(0, 0.37, -2.2);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 2.2), new THREE.MeshStandardMaterial({ color: '#c79bff', roughness: 0.9 }));
  bed.position.set(-2.9, 0.25, 1.6);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 0.4), wood);
  shelf.position.set(2.9, 0.8, -ROOM.half + 0.25);
  // the find: the fairy's music box on the table, a small chest with a glowing lid
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.3), new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb84d', emissiveIntensity: 0.35, roughness: 0.4 }));
  box.position.set(0, 0.93, -2.2);
  // the door inside, a framed rectangle on the near wall
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.1), new THREE.MeshStandardMaterial({ color: '#9a6a4c', roughness: 0.8 }));
  door.position.set(0, 1.05, ROOM.half - 0.02); door.rotation.y = Math.PI;
  room.add(floor, walls, rug, table, leg, bed, shelf, box, door);
  for (const o of room.children) { o.receiveShadow = true; o.castShadow = o !== walls && o !== floor && o !== rug; }
  group.add(room);
  ground.block(ROOM.x, ROOM.z - 2.2, 0.9);          // the table
  ground.block(ROOM.x - 2.9, ROOM.z + 1.2, 0.8); ground.block(ROOM.x - 2.9, ROOM.z + 2.1, 0.8);   // the bed
  const doorIn = new THREE.Vector3(ROOM.x, ROOM.y, ROOM.z + ROOM.half - 1.1);
  const boxAt = { x: ROOM.x, z: ROOM.z - 2.2 + 1.3 };
  const houseFound = () => ws.flags[HOUSE_FLAG] === true;
  const inRoom = () => Math.abs(hero.root.position.x - ROOM.x) < ROOM.half + 2 && Math.abs(hero.root.position.z - ROOM.z) < ROOM.half + 2;

  // A short fade to and from white over the change of place (a style of its own: nothing shared changes for it).
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .25s;z-index:30';
  document.body.appendChild(veil);
  scope.own(() => { veil.remove(); });
  let moving = false;
  /** The heroine (the cat and the pet with her) to `to`, facing `facing`: under the fade, the camera behind her at once. */
  function moveTo(to: { x: number; z: number }, facing: number, inside: boolean) {
    if (moving) return;
    moving = true; g.busy = true;
    veil.style.opacity = '1';
    scope.timeout(() => {
      const y = groundY(to.x, to.z);
      hero.root.position.set(to.x, y, to.z); hero.heading = facing; hero.root.rotation.y = facing;
      cat.root.position.set(to.x + Math.cos(facing) * 0.9, y, to.z - Math.sin(facing) * 0.9);
      const pet = g.pets.follower;
      if (pet) pet.root.position.copy(petPlace(to, facing)).setY(y);
      g.cam.target.set(to.x, y + 1.5, to.z); g.cam.yaw = facing + Math.PI;
      g.camOverride = inside ? 4.2 : null;
      veil.style.opacity = '0';
      scope.timeout(() => { moving = false; g.busy = false; }, 250);
    }, 300);
  }
  scope.own(() => { if (g.camOverride === 4.2) g.camOverride = null; });

  function openBox() {
    ws.flags[HOUSE_FLAG] = true;
    sfx('chime');
    g.sparks.burst(g.above(box.getWorldPosition(new THREE.Vector3()), 0.3), '#ffd166', 26, 2);
    g.addStars(3, g.above(box.getWorldPosition(new THREE.Vector3()), 0.6));
    void line('secret_house', 'hint', 5000);
  }

  const spots: Spot[] = [
    { pos: doorOut, r: 2.0, label: 'house_in', on: () => !moving, run: () => moveTo(doorIn, Math.PI, true) },
    { pos: doorIn, r: 1.6, label: 'house_out', on: () => !moving, run: () => moveTo({ x: outAt.x + hx * 0.8, z: outAt.z + hz * 0.8 }, HOUSE.rot, false) },
    { pos: new THREE.Vector3(boxAt.x, ROOM.y, boxAt.z), r: 1.7, label: 'house_look', on: () => !houseFound(), run: openBox },
  ];

  return {
    spots, doorOut, doorIn, inRoom,
    gladeAt: { x: GLADE.x, z: GLADE.z }, boxAt,
    update(dt, time, canMove) {
      water.uniforms.uTime.value = time;
      foam.scale.setScalar(1 + Math.sin(time * 6) * 0.12);
      for (const f of flowers.children) if (f.userData.base !== undefined) f.position.y = f.userData.base + Math.sin(time * 2 + f.userData.k) * 0.05;
      (box.material as THREE.MeshStandardMaterial).emissiveIntensity = houseFound() ? 0.15 : 0.35 + Math.sin(time * 3) * 0.2;
      const hp = hero.root.position;
      if (canMove && !gladeFound() && Math.hypot(hp.x - GLADE.x, hp.z - GLADE.z) < FIND_R) findGlade();
      void dt;
    },
  };
}
