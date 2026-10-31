import * as THREE from 'three';

// Effects for badminton: a streak behind the shuttle, little sand puffs, seagulls and the racket swoosh.

/**
 * A streak behind the shuttle: a glowing ribbon along where it has just been, widest at the shuttle and thinning
 * and fading towards the tail. Two ribbons crossed (flat and upright), so it reads from any camera.
 */
export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly points: { position: THREE.Vector3; time: number }[] = [];
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  /** width = how wide the streak is at the shuttle (m). */
  constructor(private readonly count = 40, private readonly width = 0.22) {
    // Per sample: 2 vertices for the flat ribbon, 2 for the upright one.
    this.positions = new Float32Array(count * 4 * 3);
    this.alphas = new Float32Array(count * 4);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    const index: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      for (const o of [0, 2]) {
        const a = i * 4 + o;
        const b = (i + 1) * 4 + o;
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    this.geometry.setIndex(index);
    this.material = new THREE.ShaderMaterial({
      uniforms: { colour: { value: new THREE.Color('#ffffff') } },
      vertexShader: 'attribute float alpha; varying float vAlpha; void main() { vAlpha = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 colour; varying float vAlpha; void main() { gl_FragColor = vec4(colour, vAlpha); }',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Adds the shuttle's position (when visible == true) and redraws; lengthMs = how long the trail is. */
  update(position: THREE.Vector3, now: number, visible: boolean, colour: string, lengthMs: number): void {
    this.material.uniforms.colour.value.set(colour);
    if (visible) this.points.push({ position: position.clone(), time: now });
    while (this.points.length > 0 && (now - this.points[0].time > lengthMs || this.points.length > this.count)) this.points.shift();
    if (!visible) this.points.length = 0;
    const n = this.points.length;
    this.mesh.visible = n >= 2;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.count; i++) {
      // Newest sample first (at the shuttle), then back along the path; unused samples collapse onto the tail.
      const k = Math.min(i, n - 1);
      const p = this.points[n - 1 - k].position;
      const q = this.points[Math.max(0, n - 2 - k)].position;
      this.dir.subVectors(p, q);
      if (this.dir.lengthSq() < 1e-8) this.dir.set(0, 0, 1);
      this.dir.normalize();
      this.side.set(-this.dir.z, 0, this.dir.x);
      if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
      this.side.normalize();
      this.up.crossVectors(this.side, this.dir).normalize();
      const age = i < n ? (now - this.points[n - 1 - k].time) / lengthMs : 1;
      const fade = Math.max(0, 1 - age);
      const w = (this.width / 2) * fade;
      const o = i * 12;
      for (const [j, axis, sign] of [[0, this.side, -1], [1, this.side, 1], [2, this.up, -1], [3, this.up, 1]] as const) {
        this.positions[o + j * 3] = p.x + axis.x * w * sign;
        this.positions[o + j * 3 + 1] = p.y + axis.y * w * sign;
        this.positions[o + j * 3 + 2] = p.z + axis.z * w * sign;
        this.alphas[i * 4 + j] = fade * fade * 0.9;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
}

/** Little puffs of sand that burst and fade (where a character lands in the sand). */
export class SandPuffs {
  readonly group = new THREE.Group();
  private readonly puffs: { mesh: THREE.Mesh; start: number; velocity: THREE.Vector3; size: number }[] = [];
  private readonly geometry = new THREE.SphereGeometry(0.12, 8, 6);

  constructor(private readonly colour: string) {}

  /** size < 1 = smaller, slower puffs (footsteps). */
  burst(at: THREE.Vector3, now: number, amount = 10, size = 1): void {
    for (let i = 0; i < amount; i++) {
      const material = new THREE.MeshStandardMaterial({ color: this.colour, roughness: 1, transparent: true });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.position.copy(at).setY(0.1);
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.8 + Math.random() * 1.2) * size;
      const up = (1 + Math.random() * 1.2) * size;
      this.puffs.push({ mesh, start: now, velocity: new THREE.Vector3(Math.cos(angle) * speed, up, Math.sin(angle) * speed), size });
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
      p.mesh.scale.setScalar((1 + t * 1.5) * p.size);
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = 1 - t;
    }
  }
}

/** Seagulls circling high above the court during a long rally: simple white V shapes that flap. */
export class Birds {
  readonly group = new THREE.Group();
  private readonly birds: { root: THREE.Group; wings: THREE.Mesh[]; angle: number; radius: number; height: number; phase: number }[] = [];
  private shown = 0;
  private angleSpeed = 0.35;

  constructor(count: number) {
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide });
    const wing = new THREE.PlaneGeometry(0.7, 0.18);
    wing.translate(0.35, 0, 0); // hinge at the body
    for (let i = 0; i < count; i++) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), material);
      body.scale.set(1, 0.8, 2);
      const left = new THREE.Mesh(wing, material);
      const right = new THREE.Mesh(wing, material);
      right.scale.x = -1;
      left.rotation.x = right.rotation.x = -Math.PI / 2;
      root.add(body, left, right);
      root.visible = false;
      this.group.add(root);
      this.birds.push({
        root,
        wings: [left, right],
        angle: (i / count) * Math.PI * 2,
        radius: 4.5 + Math.random() * 4,
        height: 4.8 + Math.random() * 1.8,
        phase: Math.random() * 10,
      });
    }
  }

  /** active: the rally is long enough; excited: even longer (they circle faster). */
  update(dt: number, active: boolean, excited: boolean): void {
    this.shown = Math.max(0, Math.min(1, this.shown + (active ? dt : -dt) * 0.8));
    this.angleSpeed += ((excited ? 0.8 : 0.35) - this.angleSpeed) * Math.min(1, dt * 2);
    for (const b of this.birds) {
      b.root.visible = this.shown > 0.01;
      if (!b.root.visible) continue;
      b.angle += dt * this.angleSpeed * (8 / b.radius);
      b.phase += dt * (excited ? 14 : 9);
      // They fly in from far above and settle into their circle.
      const height = b.height + (1 - this.shown) * 12;
      b.root.position.set(Math.cos(b.angle) * b.radius, height + Math.sin(b.phase * 0.3) * 0.4, Math.sin(b.angle) * b.radius);
      b.root.rotation.y = -b.angle; // facing along the circle
      const flap = Math.sin(b.phase) * 0.6;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    }
  }
}

/** A swoosh behind the racket head during a swing: a ribbon between the head's tip and throat that fades out. */
export class Swoosh {
  readonly mesh: THREE.Mesh;
  private readonly samples: { tip: THREE.Vector3; throat: THREE.Vector3; time: number }[] = [];
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;

  constructor(private readonly count = 16) {
    this.positions = new Float32Array(count * 2 * 3);
    this.alphas = new Float32Array(count * 2);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    const index: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(index);
    this.material = new THREE.ShaderMaterial({
      uniforms: { colour: { value: new THREE.Color('#ffffff') }, opacity: { value: 0.5 } },
      vertexShader: 'attribute float alpha; varying float vAlpha; void main() { vAlpha = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 colour; uniform float opacity; varying float vAlpha; void main() { gl_FragColor = vec4(colour, vAlpha * opacity); }',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Adds where the racket head is now (while swinging) and redraws; lengthMs = how long the swoosh lasts. */
  update(tip: THREE.Vector3, throat: THREE.Vector3, now: number, swinging: boolean, colour: string, opacity: number, lengthMs: number): void {
    if (swinging) this.samples.push({ tip: tip.clone(), throat: throat.clone(), time: now });
    while (this.samples.length > 0 && (now - this.samples[0].time > lengthMs || this.samples.length > this.count)) this.samples.shift();
    this.mesh.visible = this.samples.length >= 2;
    if (!this.mesh.visible) return;
    this.material.uniforms.colour.value.set(colour);
    this.material.uniforms.opacity.value = opacity;
    for (let i = 0; i < this.count; i++) {
      const sample = this.samples[Math.min(i, this.samples.length - 1)];
      const fade = i < this.samples.length ? 1 - (now - sample.time) / lengthMs : 0;
      sample.tip.toArray(this.positions, i * 6);
      sample.throat.toArray(this.positions, i * 6 + 3);
      this.alphas[i * 2] = Math.max(0, fade);
      this.alphas[i * 2 + 1] = 0; // fades towards the throat
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
}
