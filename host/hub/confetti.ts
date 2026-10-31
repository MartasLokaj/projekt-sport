import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';

// Confetti for happy moments in the hub (a player landing on the cube): little paper squares that
// shoot up, tumble, flutter down and fade. One instanced mesh for all of them, so it stays cheap.

type Piece = { position: THREE.Vector3; velocity: THREE.Vector3; spin: THREE.Vector3; rotation: THREE.Euler; age: number; life: number };

const PALETTE = ['#ffd84d', '#ff6b81', '#4da8ff', '#3ddc84', '#b9a6ff', '#ffffff'];

export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private readonly pieces: Piece[] = [];
  private next = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private active = 0;

  constructor() {
    const count = TUNING.hub.confettiPieces * 3;
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.14, 0.2),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }),
      count,
    );
    this.mesh.frustumCulled = false;
    for (let k = 0; k < count; k++) {
      this.pieces.push({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), spin: new THREE.Vector3(), rotation: new THREE.Euler(), age: 1, life: 0 });
      this.mesh.setMatrixAt(k, this.matrix.makeScale(0, 0, 0));
      this.mesh.setColorAt(k, new THREE.Color('#ffffff'));
    }
  }

  /** A burst at a point in the world, mostly in `colour` with some party colours mixed in. */
  burst(at: THREE.Vector3, colour: string, up: THREE.Vector3): void {
    const c = TUNING.hub;
    const side = new THREE.Vector3().crossVectors(up, Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const side2 = new THREE.Vector3().crossVectors(up, side);
    const tint = new THREE.Color();
    for (let k = 0; k < c.confettiPieces; k++) {
      const index = this.next;
      this.next = (this.next + 1) % this.pieces.length;
      const p = this.pieces[index];
      const angle = Math.random() * Math.PI * 2;
      const out = Math.random() * c.confettiSpread;
      p.position.copy(at);
      p.velocity
        .copy(up)
        .multiplyScalar(c.confettiSpeed * (0.6 + Math.random() * 0.6))
        .addScaledVector(side, Math.cos(angle) * out)
        .addScaledVector(side2, Math.sin(angle) * out);
      p.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      p.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.age = 0;
      p.life = c.confettiSeconds * (0.7 + Math.random() * 0.5);
      this.mesh.setColorAt(index, tint.set(Math.random() < 0.5 ? colour : PALETTE[Math.floor(Math.random() * PALETTE.length)]));
    }
    this.mesh.instanceColor!.needsUpdate = true;
    this.active = this.pieces.length;
  }

  update(dt: number, gravity: THREE.Vector3): void {
    if (this.active === 0) return;
    let alive = 0;
    this.pieces.forEach((p, k) => {
      if (p.age >= p.life) return;
      p.age += dt;
      // Falling paper: gravity, lots of air drag, a little flutter.
      p.velocity.addScaledVector(gravity, dt).multiplyScalar(Math.exp(-1.6 * dt));
      p.position.addScaledVector(p.velocity, dt);
      p.rotation.x += p.spin.x * dt;
      p.rotation.y += p.spin.y * dt;
      p.rotation.z += p.spin.z * dt;
      const left = 1 - p.age / p.life;
      const size = left <= 0 ? 0 : Math.min(1, left * 4);
      this.matrix.compose(p.position, this.quaternion.setFromEuler(p.rotation), this.scale.setScalar(size));
      this.mesh.setMatrixAt(k, this.matrix);
      if (left > 0) alive++;
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.active = alive;
  }
}
