import * as THREE from 'three';
import type { Handedness } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';

// A cute chibi golfer built from simple shapes, with animations computed in code (no skeleton).
// Our own design: big round head, small body, stubby arms and legs, a simple friendly face.
//
// The model is built about 0.9 units tall, facing +z, with its left hand side at +x.
// Two stances:
//   address - standing beside the ball, holding the putter with both hands; the putter swings
//             with the player's real swing (setSwing / strike).
//   stand   - waiting or reacting (idle, cheer, jump, slump, scratch, clap), putter in one hand.
// Left-handed players are the exact mirror image of right-handed ones.

export type CharacterLook = { shirt: string; skin: string; handedness: Handedness };
export type Mood = 'idle' | 'cheer' | 'jump' | 'slump' | 'scratch' | 'clap';

const MOOD_SECONDS: Record<Mood, number> = { idle: 0, cheer: 0.9, jump: 1.8, slump: 1.6, scratch: 1.6, clap: 1.6 };
const PANTS = '#2f3a56';
const HAIR = '#4a3426';

/** Ball position in the character's own coordinates while addressing it (just in front of the feet). */
export const ADDRESS_DISTANCE = 0.4;

export class Character {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly swingRig = new THREE.Group();
  private readonly standArms: THREE.Group[];
  private readonly skinMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  private readonly shirtMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75 });

  /**
   * Overrides the racket (or putter) arm while standing: turn around the shoulder in radians,
   * x = forwards/backwards (negative = forwards), z = out to the side. null = the usual animation.
   */
  armPose: { x: number; z: number } | null = null;

  /**
   * Overrides the legs: turn around each hip in radians (negative = foot forwards, positive = backwards).
   * right is the racket/putter side. null = legs straight down.
   */
  legPose: { left: number; right: number } | null = null;
  /** Hip pivots: [left, right]. */
  private readonly legs: THREE.Group[] = [];

  /** What the free hand holds while standing (see setGear). */
  private gear: THREE.Object3D | null = null;

  private stance: 'address' | 'stand' = 'stand';
  private mood: Mood = 'idle';
  private moodTime = 0;
  private time = Math.random() * 10;
  private handedness: Handedness = 'right';

  /** Putter swing angle in degrees: negative = back, positive = forward (towards the target). */
  private swingAngle = 0;
  private swingTarget = 0;
  private strikeTime = -1;
  private strikeTo = 0;

  /** Where the character wants to stand, and which way to face. */
  private readonly target = new THREE.Vector3();
  private targetYaw = 0;
  private hopPhase = 0;

  /** putter: false = no putter in the hand (other sports hold their own gear, see handArm). */
  constructor(look: CharacterLook, options: { putter?: boolean } = {}) {
    this.build();
    this.setLook(look);
    this.root.add(this.body);
    this.standArms = [this.makeArm(1), this.makeArm(-1)];
    this.torso.add(...this.standArms);
    if (options.putter !== false) this.setGear('putter');
    this.root.traverse((o) => (o.castShadow = true));
  }

  setLook(look: CharacterLook): void {
    this.skinMaterial.color.set(look.skin);
    this.shirtMaterial.color.set(look.shirt);
    this.handedness = look.handedness;
    this.applyScale();
  }

  /** The arm whose hand holds the putter (the character's right arm). Its hand is at (0, -0.17, 0). */
  get handArm(): THREE.Group {
    return this.standArms[1];
  }

  /** Puts the character somewhere right away (no hopping). */
  place(position: THREE.Vector3, yaw: number): void {
    this.setTarget(position, yaw);
    this.root.position.copy(position);
    this.root.rotation.y = yaw;
  }

  /** Where to stand. Far away = hop there, close by = shuffle there. */
  setTarget(position: THREE.Vector3, yaw: number): void {
    this.target.copy(position);
    this.targetYaw = yaw;
  }

  /** Address the ball (holding the putter with both hands) or stand. */
  setStance(stance: 'address' | 'stand'): void {
    if (stance === this.stance) return;
    this.stance = stance;
    this.swingAngle = this.swingTarget = 0;
    this.strikeTime = -1;
    this.mood = 'idle';
  }

  /** Live backswing from the phone, in degrees (0 = putter at the ball). */
  setSwing(backswingDegrees: number): void {
    if (this.strikeTime >= 0) return;
    this.swingTarget = -Math.min(TUNING.character.maxBackswing, backswingDegrees);
  }

  /** The real stroke: swing forward through the ball and follow through. */
  strike(power: number): void {
    this.strikeTime = 0;
    this.strikeTo = Math.min(TUNING.character.maxBackswing, 12 + power * 0.45);
  }

  play(mood: Mood): void {
    this.stance = 'stand';
    this.mood = mood;
    this.moodTime = 0;
  }

  update(dt: number): void {
    this.time += dt;
    this.updateMovement(dt);
    const [left, right] = this.legs;
    left.rotation.x = this.legPose?.left ?? 0;
    right.rotation.x = this.legPose?.right ?? 0;

    // Breathing and a gentle bob.
    const breath = Math.sin(this.time * 2.2);
    this.torso.scale.set(1 + breath * 0.012, 1 + breath * 0.02, 1 + breath * 0.012);
    this.body.position.y = Math.max(0, this.body.position.y);

    const address = this.stance === 'address';
    this.swingRig.visible = address;
    for (const arm of this.standArms) arm.visible = !address;
    if (address) this.updateSwing(dt);
    else this.updateMood(dt);
  }

  // ---------- Animation ----------

  private updateMovement(dt: number): void {
    const toTarget = new THREE.Vector3().subVectors(this.target, this.root.position).setY(0);
    const distance = toTarget.length();
    const c = TUNING.character;
    let hop = 0;
    if (distance > c.hopDistance) {
      // Hop over: little bounces while moving, facing the way we go.
      // Long trips go faster, so nobody is still hopping across the course when the next shot starts.
      const step = Math.min(distance, Math.max(c.hopSpeed, distance * 1.5) * dt);
      this.root.position.addScaledVector(toTarget.normalize(), step);
      this.hopPhase += dt * c.hopsPerSecond * Math.PI;
      hop = Math.abs(Math.sin(this.hopPhase)) * c.hopHeight;
      turnTowards(this.root, Math.atan2(toTarget.x, toTarget.z), dt * 12);
    } else {
      this.hopPhase = 0;
      this.root.position.lerp(this.target, 1 - Math.exp(-8 * dt));
      turnTowards(this.root, this.targetYaw, dt * 8);
    }
    this.body.position.y = hop;
  }

  private updateSwing(dt: number): void {
    if (this.strikeTime >= 0) {
      // Fast forward swing, hold the follow-through, then back to the ball.
      this.strikeTime += dt;
      const t = this.strikeTime;
      if (t < 0.12) this.swingAngle += (this.strikeTo - this.swingAngle) * Math.min(1, dt * 30);
      else if (t < 0.7) this.swingAngle = this.strikeTo;
      else this.swingAngle += (0 - this.swingAngle) * Math.min(1, dt * 4);
      if (t > 1.6) {
        this.strikeTime = -1;
        this.swingTarget = 0;
      }
    } else {
      this.swingAngle += (this.swingTarget - this.swingAngle) * Math.min(1, dt * 18);
    }
    this.swingRig.rotation.z = THREE.MathUtils.degToRad(this.swingAngle);
    // Look down at the ball, a little body turn with the swing.
    this.head.rotation.set(0.45, 0, 0);
    this.torso.rotation.set(0.12, THREE.MathUtils.degToRad(this.swingAngle) * 0.15, 0);
  }

  private updateMood(dt: number): void {
    const [left, right] = this.standArms;
    const t = (this.moodTime += dt);
    const restZ = 0.25;
    left.rotation.set(Math.sin(this.time * 1.3) * 0.05, 0, restZ);
    right.rotation.set(-Math.sin(this.time * 1.3) * 0.05, 0, -restZ);
    this.head.rotation.set(0.12, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    let jump = 0;

    switch (this.mood) {
      case 'jump': // hole in: happy jumps with both arms up
        jump = Math.abs(Math.sin(t * Math.PI * 2.2)) * 0.22;
        left.rotation.z = 2.7 + Math.sin(t * 14) * 0.15;
        right.rotation.z = -2.7 - Math.sin(t * 14) * 0.15;
        this.head.rotation.x = -0.25;
        break;
      case 'cheer': // good shot: one small hop, a fist in the air
        jump = t < 0.45 ? Math.sin((t / 0.45) * Math.PI) * 0.12 : 0;
        right.rotation.z = -2.6;
        this.head.rotation.x = -0.1;
        break;
      case 'slump': // poor shot: head down, arms hanging
        this.head.rotation.x = 0.55;
        this.torso.rotation.x = 0.18;
        left.rotation.set(0.15, 0, 0.05);
        right.rotation.set(0.15, 0, -0.05);
        break;
      case 'scratch': // out of bounds: scratching the head
        right.rotation.set(-0.4, 0, -2.4 + Math.sin(t * 16) * 0.12);
        this.head.rotation.set(0.1, 0, 0.18);
        break;
      case 'clap': // someone else holed it: clapping
        left.rotation.set(-1.25, 0, -0.35 - Math.max(0, Math.sin(t * 16)) * 0.3);
        right.rotation.set(-1.25, 0, 0.35 + Math.max(0, Math.sin(t * 16)) * 0.3);
        jump = Math.abs(Math.sin(t * Math.PI * 1.5)) * 0.04;
        break;
    }
    if (this.armPose) right.rotation.set(this.armPose.x, 0, this.armPose.z);
    this.body.position.y = Math.max(this.body.position.y, jump);
    if (this.mood !== 'idle' && t > MOOD_SECONDS[this.mood]) this.mood = 'idle';
  }

  private applyScale(): void {
    const s = TUNING.character.height / 0.9;
    // A left-handed golfer is the mirror image across the aim line (the character's own z axis).
    this.root.scale.set(s, s, this.handedness === 'left' ? -s : s);
  }

  // ---------- Model ----------

  private build(): void {
    const pants = new THREE.MeshStandardMaterial({ color: PANTS, roughness: 0.8 });
    const shoe = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });

    // Legs and shoes, each on a hip pivot (left = +x, right = -x, like the arms)
    const hipY = 0.15;
    for (const side of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.06, hipY, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.07, 4, 10), pants);
      leg.position.set(0, 0.1 - hipY, 0);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), shoe);
      foot.scale.set(1, 0.6, 1.4);
      foot.position.set(0, 0.03 - hipY, 0.02);
      hip.add(leg, foot);
      this.legs.push(hip);
      this.body.add(hip);
    }

    // Torso: shirt with shorts underneath
    this.torso.position.y = 0.17;
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.11, 0.09, 18), pants);
    shorts.position.y = 0.03;
    const shirt = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.12, 6, 18), this.shirtMaterial);
    shirt.position.y = 0.15;
    this.torso.add(shorts, shirt);
    this.body.add(this.torso);

    // Head: about half of the height
    this.head.position.y = 0.52 - 0.17; // relative to the torso
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 28, 20), this.skinMaterial);
    skull.position.y = 0.18;
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.218, 28, 14, 0, Math.PI * 2, 0, 1.15),
      new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 }),
    );
    hair.position.y = 0.18;
    hair.rotation.x = -0.45;
    this.head.add(skull, hair);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), this.skinMaterial);
      ear.position.set(side * 0.205, 0.17, 0);
      this.head.add(ear);
    }
    this.addFace();
    this.torso.add(this.head);

    // Arms holding the putter with both hands, for addressing the ball.
    // The rig turns around the shoulders about the character's z axis, so the putter
    // swings along the aim line (+x = towards the target).
    this.swingRig.position.set(0, 0.27, 0.04); // shoulders, relative to the torso
    const grip = new THREE.Vector3(0, -0.13, 0.1);
    for (const side of [-1, 1]) {
      const arm = this.makeArm(side);
      arm.position.set(side * 0.08, 0, 0);
      const toGrip = grip.clone().sub(arm.position).normalize();
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), toGrip);
      this.swingRig.add(arm);
    }
    // Putter from the hands to just behind the ball (the ball sits at z = ADDRESS_DISTANCE, y = 0.1).
    const shoulders = new THREE.Vector3(0, 0.17 + 0.27, 0.04);
    const head = new THREE.Vector3(-0.13, 0.04, ADDRESS_DISTANCE).sub(shoulders);
    this.swingRig.add(makePutter(grip, head));
    this.torso.add(this.swingRig);
  }

  private addFace(): void {
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#1b1f2a', roughness: 0.3 });
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const cheek = new THREE.MeshBasicMaterial({ color: '#ff8f9c', transparent: true, opacity: 0.55 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10), eyeMaterial);
      eye.scale.set(1, 1.4, 0.6);
      eye.position.set(side * 0.075, 0.19, 0.19);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), white);
      shine.position.set(side * 0.075 + 0.012, 0.207, 0.212);
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), cheek);
      blush.scale.set(1.2, 0.7, 0.3);
      blush.position.set(side * 0.125, 0.13, 0.168);
      this.head.add(eye, shine, blush);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 16, Math.PI), eyeMaterial);
    mouth.rotation.z = Math.PI; // the lower half of a ring: a smile
    mouth.position.set(0, 0.12, 0.2);
    this.head.add(mouth);
  }

  /** An arm hanging down from the shoulder: sleeve, forearm, hand. Turns around the shoulder. */
  private makeArm(side: number): THREE.Group {
    const arm = new THREE.Group();
    arm.position.set(side * 0.14, 0.27, 0); // shoulder, relative to the torso
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.05, 4, 10), this.shirtMaterial);
    sleeve.position.y = -0.045;
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.06, 4, 10), this.skinMaterial);
    forearm.position.y = -0.115;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), this.skinMaterial);
    hand.position.y = -0.17;
    hand.name = 'hand';
    arm.add(sleeve, forearm, hand);
    return arm;
  }

  /**
   * What the character holds in its right hand while standing: the putter (its head resting on the ground),
   * any other object (e.g. a badminton racket, built in the arm's own coordinates with the hand at
   * (0, -0.17, 0) and pointing down the arm), or nothing.
   */
  setGear(gear: 'putter' | THREE.Object3D | null): void {
    const arm = this.standArms[1];
    if (this.gear) arm.remove(this.gear);
    this.gear = gear === 'putter' ? makePutter(new THREE.Vector3(0, -0.17, 0), new THREE.Vector3(0.03, -0.42, 0.1)) : gear;
    if (this.gear) {
      this.gear.traverse((o) => (o.castShadow = true));
      arm.add(this.gear);
    }
  }
}

/** A putter from `grip` to `head` (both in the parent's coordinates). */
function makePutter(grip: THREE.Vector3, head: THREE.Vector3): THREE.Group {
  const putter = new THREE.Group();
  const shaftVector = head.clone().sub(grip);
  const length = shaftVector.length();
  const metal = new THREE.MeshStandardMaterial({ color: '#c9d1d9', metalness: 0.6, roughness: 0.35 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, length, 8), metal);
  shaft.position.copy(grip).addScaledVector(shaftVector, 0.5);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shaftVector.clone().normalize());
  const gripMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.017, 0.017, 0.09, 8),
    new THREE.MeshStandardMaterial({ color: '#222831', roughness: 0.9 }),
  );
  gripMesh.position.copy(grip).addScaledVector(shaftVector.clone().normalize(), 0.05);
  gripMesh.quaternion.copy(shaft.quaternion);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.13), metal);
  blade.position.copy(head);
  putter.add(shaft, gripMesh, blade);
  return putter;
}

/** Turns an object around y towards `yaw`, the short way round. */
function turnTowards(object: THREE.Object3D, yaw: number, rate: number): void {
  let diff = yaw - object.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  object.rotation.y += diff * Math.min(1, rate);
}
