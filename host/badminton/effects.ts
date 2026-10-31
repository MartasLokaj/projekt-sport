import * as THREE from 'three';

// Graybox effects for badminton: a trail of dots behind the shuttle and little sand puffs.
// The beautiful versions come in phase B5; keep them in this file.

/** A trail of shrinking dots along where the shuttle has just been. */
export class Trail {
  readonly mesh: THREE.InstancedMesh;
  private readonly points: { position: THREE.Vector3; time: number }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly material: THREE.MeshBasicMaterial;

  constructor(private readonly count = 40) {
    this.material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** Adds the shuttle's position (when visible == true) and redraws; lengthMs = how long the trail is. */
  update(position: THREE.Vector3, now: number, visible: boolean, colour: string, lengthMs: number): void {
    this.material.color.set(colour);
    if (visible) this.points.push({ position: position.clone(), time: now });
    while (this.points.length > 0 && (now - this.points[0].time > lengthMs || this.points.length > this.count)) this.points.shift();
    if (!visible) this.points.length = 0;
    this.mesh.count = this.points.length;
    this.points.forEach((p, i) => {
      const age = (now - p.time) / lengthMs;
      const s = Math.max(0.05, 1 - age);
      this.matrix.makeScale(s, s, s).setPosition(p.position);
      this.mesh.setMatrixAt(i, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Little puffs of sand that burst and fade (where a character lands in the sand). */
export class SandPuffs {
  readonly group = new THREE.Group();
  private readonly puffs: { mesh: THREE.Mesh; start: number; velocity: THREE.Vector3 }[] = [];
  private readonly geometry = new THREE.SphereGeometry(0.12, 8, 6);

  constructor(private readonly colour: string) {}

  burst(at: THREE.Vector3, now: number, amount = 10): void {
    for (let i = 0; i < amount; i++) {
      const material = new THREE.MeshStandardMaterial({ color: this.colour, roughness: 1, transparent: true });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.position.copy(at).setY(0.1);
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.2;
      this.puffs.push({ mesh, start: now, velocity: new THREE.Vector3(Math.cos(angle) * speed, 1 + Math.random() * 1.2, Math.sin(angle) * speed) });
      this.group.add(mesh);
    }
  }

  update(now: number, dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      const t = (now - p.start) / 700;
      if (t >= 1) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      p.velocity.y -= 4 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y);
      p.mesh.scale.setScalar(1 + t * 1.5);
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = 1 - t;
    }
  }
}
