import * as THREE from 'three';
import { mulberry32 } from '../core/util';
import { height } from './terrain';
import { uTime } from './scenery';

interface Fly { home: THREE.Vector3; r: number; phase: number; speed: number; pos: THREE.Vector3; heading: number; scale: number; landed: boolean; }

/** All butterflies in one InstancedMesh; wings flap in the vertex shader. */
export class Butterflies {
  readonly mesh: THREE.InstancedMesh;
  readonly flies: Fly[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private rnd = mulberry32(31);

  constructor(scene: THREE.Scene, capacity: number) {
    // Two wings in the XZ plane, body along Z.
    const wing = [0, 0, -0.05, 0.22, 0, -0.2, 0.3, 0, 0.02, 0, 0, -0.05, 0.3, 0, 0.02, 0.18, 0, 0.2, 0, 0, -0.05, 0.18, 0, 0.2, 0, 0, 0.1];
    const v: number[] = [];
    for (const side of [1, -1]) for (let i = 0; i < wing.length; i += 3) v.push(wing[i] * side, 0, wing[i + 2]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
        float a = sin(uTime * 13.0 + ph) * 0.95 + 0.25;
        vec3 transformed = vec3(position.x * cos(a), abs(position.x) * sin(a), position.z);`);
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  add(x: number, z: number, roam: number, color: THREE.ColorRepresentation, scale = 1) {
    const i = this.flies.length;
    const home = new THREE.Vector3(x, height(x, z) + 0.9 + this.rnd() * 0.9, z);
    this.flies.push({ home, r: roam, phase: this.rnd() * 100, speed: 0.5 + this.rnd() * 0.5, pos: home.clone(), heading: 0, scale, landed: false });
    this.mesh.setColorAt(i, new THREE.Color(color));
    this.mesh.count = i + 1;
    this.mesh.instanceColor!.needsUpdate = true;
    return i;
  }

  setColor(i: number, color: THREE.ColorRepresentation) {
    this.mesh.setColorAt(i, new THREE.Color(color));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** Removes the last `n` butterflies (the task ones are always added last). */
  truncate(n: number) { this.flies.length -= n; this.mesh.count = this.flies.length; }

  update(t: number) {
    for (let i = 0; i < this.flies.length; i++) {
      const f = this.flies[i];
      if (!f.landed) {
        const a = t * f.speed + f.phase;
        const nx = f.home.x + Math.sin(a) * f.r + Math.sin(a * 2.3 + f.phase) * f.r * 0.4;
        const nz = f.home.z + Math.cos(a * 0.8) * f.r + Math.cos(a * 1.9) * f.r * 0.4;
        const ny = f.home.y + Math.sin(a * 3.1) * 0.35;
        f.heading = Math.atan2(nx - f.pos.x, nz - f.pos.z);
        f.pos.set(nx, ny, nz);
      }
      this.e.set(0.35, f.heading, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.m.compose(f.pos, this.q, new THREE.Vector3(f.scale, f.scale, f.scale));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
