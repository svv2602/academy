import * as THREE from 'three';

/** Soft round sprite shared by all additive particles. */
export const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

/** Pooled burst particles (one Points object). */
export class Sparks {
  private n = 220; private pos = new Float32Array(this.n * 3); private col = new Float32Array(this.n * 3);
  private vel = new Float32Array(this.n * 3); private life = new Float32Array(this.n); private next = 0;
  private pts: THREE.Points;
  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, size: 0.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.pts.frustumCulled = false;
    this.pos.fill(-999);
    scene.add(this.pts);
  }
  burst(p: THREE.Vector3, color: string, count = 30, power = 4) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.next = (this.next + 1) % this.n;
      const a = Math.random() * 6.28, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u) * power * (0.4 + Math.random() * 0.6);
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.vel.set([Math.cos(a) * s, Math.abs(u) * power + 1.5, Math.sin(a) * s], i * 3);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.life[i] = 0.8 + Math.random() * 0.8;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 6 * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      for (let k = 0; k < 3; k++) this.col[i * 3 + k] *= 0.985;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

export function numberSprite(n: number) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 56, 0, 6.28); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#ff8fc4'; g.stroke();
  g.fillStyle = '#b0428a'; g.font = '800 78px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false, toneMapped: false }));
  s.scale.setScalar(0.8); s.renderOrder = 20;
  return s;
}
