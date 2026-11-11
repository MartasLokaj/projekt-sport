import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';

// Skiing: the little rescue helicopter. It swoops in over a racer who is stuck at the edge of the run (or far
// behind everyone), hooks them on a rope, carries them over the middle of the run and lets go. This file is only
// the drawing (body, spinning rotors, rope and hook); host/ski/Ski.ts flies it (`startRescue`, `updateRescues`).
// The nose points down the run (-z). Sizes and colours: TUNING.ski.rescue.heli.

export class RescueHeli {
  readonly group = new THREE.Group();
  /** The whole helicopter without the rope: it leans into its flight, the rope hangs straight down. */
  private readonly craft = new THREE.Group();
  private readonly rotor = new THREE.Group();
  private readonly tailRotor = new THREE.Group();
  private readonly rope: THREE.Mesh;
  private readonly hook: THREE.Mesh;

  constructor() {
    const h = TUNING.ski.rescue.heli;
    const paint = new THREE.MeshStandardMaterial({ color: h.colour, roughness: 0.45 });
    const trim = new THREE.MeshStandardMaterial({ color: h.trim, roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: h.glass, roughness: 0.15, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#27313f', roughness: 0.6 });

    // Cabin: a rounded egg with a glass nose and a white band.
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), paint);
    cabin.scale.set(0.9, 0.85, 1.25);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 12), glass);
    nose.scale.set(0.95, 0.8, 0.9);
    nose.position.set(0, 0.03, -0.36);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.455, 0.455, 0.14, 20), trim);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 1, 0.94);
    band.position.z = 0.22;
    // Tail: boom, fin and the small rotor.
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 1.1, 10), paint);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.1, 1.05);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.24), trim);
    fin.position.set(0, 0.26, 1.56);
    fin.rotation.x = -0.35;
    this.tailRotor.position.set(0.06, 0.14, 1.56);
    for (const turn of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.4, 0.05), dark);
      blade.rotation.x = turn;
      this.tailRotor.add(blade);
    }
    // Main rotor: mast, hub and two long blades.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), dark);
    mast.position.y = 0.5;
    this.rotor.position.y = 0.62;
    this.rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), dark));
    for (const turn of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.02, 0.13), dark);
      blade.rotation.y = turn;
      this.rotor.add(blade);
    }
    // Skids.
    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), dark);
      skid.rotation.x = Math.PI / 2;
      skid.position.set(side * 0.34, -0.56, -0.05);
      this.craft.add(skid);
      for (const along of [-0.3, 0.25]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6), dark);
        leg.position.set(side * 0.3, -0.46, along);
        leg.rotation.z = side * 0.35;
        this.craft.add(leg);
      }
    }
    this.craft.add(cabin, nose, band, boom, fin, this.tailRotor, mast, this.rotor);
    this.craft.traverse((part) => (part.castShadow = true));

    // Rope (1 m long here, stretched to its length) and the hook at its end.
    const ropeMaterial = new THREE.MeshStandardMaterial({ color: h.rope, roughness: 0.8 });
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), ropeMaterial);
    this.hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 14, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: h.hook, roughness: 0.35, metalness: 0.6 }));
    this.group.add(this.craft, this.rope, this.hook);
    this.group.scale.setScalar(h.size);
    this.group.visible = false;
    this.setRope(0);
  }

  /** Where the rope leaves the helicopter, below its middle (m, in the world). */
  get belly(): number {
    return 0.42 * TUNING.ski.rescue.heli.size;
  }

  /** Rope length below the belly in metres (0 = pulled in, nothing to see). */
  setRope(length: number): void {
    const size = TUNING.ski.rescue.heli.size;
    const local = Math.max(0, length) / size;
    this.rope.visible = this.hook.visible = local > 0.02;
    this.rope.scale.y = Math.max(0.001, local);
    this.rope.position.y = -0.42 - local / 2;
    this.hook.position.y = -0.42 - local - 0.07;
  }

  /** Leans the helicopter: forward = nose down (radians), bank = rolled to the right. */
  lean(forward: number, bank: number): void {
    this.craft.rotation.set(-forward, 0, -bank);
  }

  /** Spins the rotors. */
  update(dt: number): void {
    const spin = TUNING.ski.rescue.heli.rotorSpin;
    this.rotor.rotation.y += spin * dt;
    this.tailRotor.rotation.x += spin * 1.3 * dt;
  }
}
