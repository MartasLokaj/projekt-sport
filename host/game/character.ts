import * as THREE from 'three';
import type { AvatarLook } from '../../shared/avatar.ts';
import { DEFAULT_LOOK } from '../../shared/avatar.ts';
import type { Handedness, PlayerInfo } from '../../shared/protocol.ts';
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
// Face, hair, hat, glasses and the putter colour come from the player's avatar (shared/avatar.ts).

/** look: the avatar's face, hair, hat, glasses and gear colours (missing = the default look). */
export type CharacterLook = { shirt: string; skin: string; handedness: Handedness; look?: AvatarLook };

/** A player's character look as the server sends it. */
export function lookOf(player: PlayerInfo): CharacterLook {
  return { shirt: player.colour, skin: player.skinTone, handedness: player.handedness, look: player.look };
}
export type Mood = 'idle' | 'cheer' | 'jump' | 'slump' | 'scratch' | 'clap';
/**
 * What the character wears (the face, hair and colours stay the same everywhere). Each game picks one, e.g. the
 * badminton beach look: tank top, shorts, bare feet, a sports headband.
 */
export type Outfit = {
  top: 'tee' | 'tank';
  bottoms: 'pants' | 'shorts';
  /** Colour of the trousers or shorts (default: dark blue). */
  bottomsColour?: string;
  feet: 'shoes' | 'bare';
  /** A sports headband in this colour, or none. */
  headband?: string | null;
};
export const DEFAULT_OUTFIT: Outfit = { top: 'tee', bottoms: 'pants', feet: 'shoes' };

const MOOD_SECONDS: Record<Mood, number> = { idle: 0, cheer: 0.9, jump: 1.8, slump: 1.6, scratch: 1.6, clap: 1.6 };
const PANTS = '#2f3a56';
const INK = '#1b1f2a';
const MOUTH_INSIDE = '#7a2e3a';

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
  private readonly pantsMaterial = new THREE.MeshStandardMaterial({ color: PANTS, roughness: 0.8 });
  private readonly shoeMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
  /** Outfit pieces: sleeves (every arm), leg capsules, feet and their soles, the shorts/trousers top, the headband. */
  private readonly sleeves: THREE.Mesh[] = [];
  private readonly legMeshes: THREE.Mesh[] = [];
  private readonly feet: THREE.Mesh[] = [];
  private readonly soles: THREE.Mesh[] = [];
  private shorts!: THREE.Mesh;
  private headband: THREE.Mesh | null = null;
  private readonly hairMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  /** Hats are in the player's colour (both sides, so the inside of an edge never looks see-through). */
  private readonly hatMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide });
  private readonly putterMaterial = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.3 });
  /** Hair, face, hat and glasses: rebuilt when the avatar changes. */
  private parts = new THREE.Group();
  private partsKey = '';

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
    this.hatMaterial.color.set(look.shirt);
    this.handedness = look.handedness;
    const avatar = look.look ?? DEFAULT_LOOK;
    this.hairMaterial.color.set(avatar.hairColour);
    this.putterMaterial.color.set(avatar.putterColour);
    const key = JSON.stringify(avatar);
    if (key !== this.partsKey) {
      this.partsKey = key;
      this.buildParts(avatar);
    }
    this.applyScale();
  }

  /** Dresses the character (see Outfit). */
  setOutfit(outfit: Outfit): void {
    const shorts = outfit.bottoms === 'shorts';
    for (const sleeve of this.sleeves) sleeve.material = outfit.top === 'tank' ? this.skinMaterial : this.shirtMaterial;
    this.pantsMaterial.color.set(outfit.bottomsColour ?? PANTS);
    // Shorts: bare legs and a longer, wider shorts top.
    for (const leg of this.legMeshes) leg.material = shorts ? this.skinMaterial : this.pantsMaterial;
    this.shorts.scale.set(shorts ? 1.06 : 1, shorts ? 1.7 : 1, shorts ? 1.06 : 1);
    this.shorts.position.y = shorts ? 0.005 : 0.03;
    const bare = outfit.feet === 'bare';
    for (const foot of this.feet) {
      foot.material = bare ? this.skinMaterial : this.shoeMaterial;
      foot.scale.set(bare ? 0.8 : 1, bare ? 0.45 : 0.68, bare ? 1.2 : 1.42);
      foot.position.y = (bare ? 0.03 : 0.04) - 0.15;
    }
    for (const sole of this.soles) sole.visible = !bare;
    if (this.headband) {
      this.head.remove(this.headband);
      (this.headband.material as THREE.Material).dispose();
      this.headband = null;
    }
    if (outfit.headband) {
      this.headband = new THREE.Mesh(
        new THREE.TorusGeometry(0.208, 0.02, 8, 32),
        new THREE.MeshStandardMaterial({ color: outfit.headband, roughness: 0.85 }),
      );
      // Round the head just above the eyebrows, tipped back like the hair line.
      this.headband.position.set(0, 0.232, -0.012);
      this.headband.rotation.x = Math.PI / 2 - 0.35;
      this.headband.castShadow = true;
      this.head.add(this.headband);
    }
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
    const restZ = TUNING.character.armRest;
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
    const pants = this.pantsMaterial;
    const shoe = this.shoeMaterial;

    // Legs and shoes, each on a hip pivot (left = +x, right = -x, like the arms)
    // Sturdy legs with chunky shoes (a white shoe on a grey sole).
    const sole = new THREE.MeshStandardMaterial({ color: '#c3cad6', roughness: 0.7 });
    const hipY = 0.15;
    for (const side of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.065, hipY, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.054, 0.06, 4, 12), pants);
      leg.position.set(0, 0.1 - hipY, 0);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.064, 16, 12), shoe);
      foot.scale.set(1, 0.68, 1.42);
      foot.position.set(0, 0.04 - hipY, 0.025);
      const footSole = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.022, 18), sole);
      footSole.scale.set(1, 1, 1.42);
      footSole.position.set(0, 0.011 - hipY, 0.025);
      hip.add(leg, foot, footSole);
      this.legMeshes.push(leg);
      this.feet.push(foot);
      this.soles.push(footSole);
      this.legs.push(hip);
      this.body.add(hip);
    }

    // Torso: shirt with shorts underneath
    this.torso.position.y = 0.17;
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.11, 0.09, 18), pants);
    shorts.position.y = 0.03;
    this.shorts = shorts;
    const shirt = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.12, 6, 18), this.shirtMaterial);
    shirt.position.y = 0.15;
    this.torso.add(shorts, shirt);
    this.body.add(this.torso);

    // Head: about half of the height
    this.head.position.y = 0.52 - 0.17; // relative to the torso
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 28, 20), this.skinMaterial);
    skull.position.y = 0.18;
    this.head.add(skull, this.parts);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), this.skinMaterial);
      ear.position.set(side * 0.205, 0.17, 0);
      this.head.add(ear);
    }
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
    this.swingRig.add(makePutter(grip, head, this.putterMaterial));
    this.torso.add(this.swingRig);
  }

  /** (Re)builds hair, face, hat and glasses for an avatar. Coordinates are the head's: skull centre (0, 0.18, 0), radius 0.21. */
  private buildParts(a: AvatarLook): void {
    this.head.remove(this.parts);
    this.parts.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.parts = new THREE.Group();
    // A cap or a beanie covers the top of the head: spikes, top curls and a bun are left out under it.
    const covered = a.hat === 'cap' || a.hat === 'beanie';
    this.parts.add(makeHair(a.hairStyle, covered, this.hairMaterial, this.hatMaterial));
    this.parts.add(makeEyes(a.eyes), makeMouth(a.mouth));
    if (a.blush) this.parts.add(makeBlush());
    if (a.hat !== 'none') this.parts.add(makeHat(a.hat, this.hatMaterial));
    if (a.glasses !== 'none') this.parts.add(makeGlasses(a.glasses));
    this.parts.traverse((o) => (o.castShadow = true));
    this.head.add(this.parts);
  }

  /** An arm hanging down from the shoulder: sleeve, forearm, hand. Turns around the shoulder. */
  private makeArm(side: number): THREE.Group {
    const arm = new THREE.Group();
    arm.position.set(side * 0.14, 0.27, 0); // shoulder, relative to the torso
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.05, 4, 10), this.shirtMaterial);
    sleeve.position.y = -0.045;
    this.sleeves.push(sleeve);
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.06, 4, 10), this.skinMaterial);
    forearm.position.y = -0.115;
    // A round mitten hand with a little thumb.
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 14, 12), this.skinMaterial);
    hand.scale.set(1, 1.05, 0.88);
    hand.position.y = -0.17;
    hand.name = 'hand';
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), this.skinMaterial);
    thumb.position.set(-side * 0.012, -0.152, 0.036);
    arm.add(sleeve, forearm, hand, thumb);
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
    this.gear =
      gear === 'putter'
        ? makePutter(new THREE.Vector3(0, -0.17, 0), new THREE.Vector3(0.03, -0.42, 0.1), this.putterMaterial)
        : gear;
    if (this.gear) {
      this.gear.traverse((o) => (o.castShadow = true));
      arm.add(this.gear);
    }
  }
}

/** A putter from `grip` to `head` (both in the parent's coordinates); grip and head in the player's putter colour. */
function makePutter(grip: THREE.Vector3, head: THREE.Vector3, colour: THREE.Material): THREE.Group {
  const putter = new THREE.Group();
  const shaftVector = head.clone().sub(grip);
  const length = shaftVector.length();
  const metal = new THREE.MeshStandardMaterial({ color: '#c9d1d9', metalness: 0.6, roughness: 0.35 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, length, 8), metal);
  shaft.position.copy(grip).addScaledVector(shaftVector, 0.5);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shaftVector.clone().normalize());
  const gripMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.09, 8), colour);
  gripMesh.position.copy(grip).addScaledVector(shaftVector.clone().normalize(), 0.05);
  gripMesh.quaternion.copy(shaft.quaternion);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.13), colour);
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

// ---------- Avatar parts (hair, face, hat, glasses) ----------
// All in the head's coordinates: skull centre at (0, SKULL_Y, 0), radius 0.21, the face looks towards +z.

const SKULL_Y = 0.18;
const ink = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.3 });
const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const mouthInside = new THREE.MeshStandardMaterial({ color: MOUTH_INSIDE, roughness: 0.6 });
const cheek = new THREE.MeshBasicMaterial({ color: '#ff8f9c', transparent: true, opacity: 0.55 });
const knit = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
const darkLens = new THREE.MeshStandardMaterial({ color: '#141824', roughness: 0.15, metalness: 0.4 });

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

/** A point at `distance` from the skull centre: yaw around the head (0 = front), pitch up from the eye line. */
function onHead(yaw: number, pitch: number, distance: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch) * distance,
    SKULL_Y + Math.sin(pitch) * distance,
    Math.cos(yaw) * Math.cos(pitch) * distance,
  );
}

/** The hair cap over the top and back of the head, open at the face (tilt < 0 lifts the front edge). */
function hairCap(radius: number, depth: number, tilt: number, material: THREE.Material): THREE.Mesh {
  const cap = mesh(new THREE.SphereGeometry(radius, 28, 14, 0, Math.PI * 2, 0, depth), material, 0, SKULL_Y, 0);
  cap.rotation.x = tilt;
  return cap;
}

function makeHair(style: AvatarLook['hairStyle'], covered: boolean, hair: THREE.Material, tie: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // Down to just above the ears at the sides and to the nape at the back; the front edge sits higher.
  g.add(hairCap(0.222, 1.5, -0.6, hair));
  const blob = (r: number, at: THREE.Vector3, sx = 1, sy = 1, sz = 1): THREE.Mesh => {
    const m = mesh(new THREE.SphereGeometry(r, 14, 10), hair, at.x, at.y, at.z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  switch (style) {
    case 'short': // a soft fringe over the forehead
      if (!covered) for (const yaw of [-0.38, 0, 0.38]) g.add(blob(0.055, onHead(yaw, 0.78, 0.2), 1.25, 0.7, 0.8));
      break;
    case 'spiky': {
      if (covered) break;
      const cone = new THREE.ConeGeometry(0.05, 0.13, 8);
      const up = new THREE.Vector3(0, 1, 0);
      const rows: [number, number[]][] = [
        [1.45, [0]],
        [1.0, [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]],
        [0.6, [-2.6, -1.9, -1.2, 1.2, 1.9, 2.6, Math.PI]],
      ];
      for (const [pitch, yaws] of rows) {
        for (const yaw of yaws) {
          const at = onHead(yaw, pitch, 0.205);
          const spike = mesh(cone, hair, at.x, at.y, at.z);
          spike.quaternion.setFromUnitVectors(up, at.clone().setY(at.y - SKULL_Y).normalize());
          g.add(spike);
        }
      }
      break;
    }
    case 'bob': {
      // Down to the chin all round, open at the face.
      const gap = 0.95;
      const shell = new THREE.SphereGeometry(0.232, 28, 16, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, 0.3, 1.8);
      g.add(mesh(shell, hair, 0, SKULL_Y, 0));
      if (!covered) for (const yaw of [-0.45, -0.15, 0.15, 0.45]) g.add(blob(0.05, onHead(yaw, 0.8, 0.205), 1.2, 0.7, 0.8));
      break;
    }
    case 'pony': {
      if (!covered) g.add(blob(0.055, onHead(0, 0.8, 0.2), 1.6, 0.7, 0.8));
      const base = onHead(Math.PI, 0.5, 0.235);
      g.add(blob(0.05, base));
      const band = mesh(new THREE.TorusGeometry(0.038, 0.013, 8, 16), tie, base.x, base.y - 0.03, base.z - 0.02);
      band.rotation.x = Math.PI / 2 - 0.5;
      g.add(band);
      const tail = blob(0.06, new THREE.Vector3(0, base.y - 0.13, base.z - 0.06), 0.85, 1.8, 0.85);
      tail.rotation.x = -0.35;
      g.add(tail);
      break;
    }
    case 'curly': {
      const curl = new THREE.SphereGeometry(0.058, 12, 10);
      const ring = (pitch: number, from: number, step: number, skipFront: number): void => {
        for (let yaw = from; yaw < Math.PI * 2 + from - 0.01; yaw += step) {
          const y = Math.atan2(Math.sin(yaw), Math.cos(yaw));
          if (Math.abs(y) < skipFront) continue;
          const at = onHead(y, pitch, 0.215);
          g.add(mesh(curl, hair, at.x, at.y, at.z));
        }
      };
      ring(0.3, 0, 0.55, 1.15); // sides and back
      if (!covered) {
        ring(0.8, 0.3, 0.6, 0); // all round, over the forehead too
        ring(1.25, 0, 1.05, 0);
        g.add(mesh(curl, hair, 0, SKULL_Y + 0.225, 0));
      }
      break;
    }
    case 'bun':
      if (covered) break;
      for (const yaw of [-0.3, 0.3]) g.add(blob(0.05, onHead(yaw, 0.82, 0.2), 1.3, 0.65, 0.8));
      g.add(blob(0.085, onHead(Math.PI, 1.1, 0.25)));
      break;
  }
  return g;
}

function makeEyes(eyes: AvatarLook['eyes']): THREE.Group {
  const g = new THREE.Group();
  const arc = new THREE.TorusGeometry(0.03, 0.009, 6, 14, Math.PI);
  for (const side of [-1, 1]) {
    const x = side * 0.075;
    // The wink closes the eye on the character's left (+x).
    const kind = eyes === 'wink' ? (side === 1 ? 'happy' : 'round') : eyes;
    if (kind === 'round' || kind === 'sparkle') {
      const big = kind === 'sparkle';
      const eye = mesh(new THREE.SphereGeometry(big ? 0.042 : 0.034, 14, 10), ink, x, 0.19, 0.19);
      eye.scale.set(1, big ? 1.35 : 1.4, 0.6);
      g.add(eye);
      g.add(mesh(new THREE.SphereGeometry(big ? 0.015 : 0.011, 8, 6), shine, x + 0.012, 0.207, big ? 0.215 : 0.212));
      if (big) g.add(mesh(new THREE.SphereGeometry(0.008, 8, 6), shine, x - 0.012, 0.172, 0.213));
    } else {
      // happy = ^ (closed, smiling), sleepy = ‿ (closed, relaxed)
      const sleepy = kind === 'sleepy';
      const lid = mesh(arc, ink, x, sleepy ? 0.198 : 0.182, 0.203);
      lid.rotation.set(0, side * 0.36, sleepy ? Math.PI : 0);
      g.add(lid);
    }
  }
  return g;
}

function makeMouth(mouth: AvatarLook['mouth']): THREE.Group {
  const g = new THREE.Group();
  switch (mouth) {
    case 'smile': {
      const m = mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 16, Math.PI), ink, 0, 0.12, 0.2);
      m.rotation.z = Math.PI; // the lower half of a ring
      g.add(m);
      break;
    }
    case 'grin': {
      const m = mesh(new THREE.CircleGeometry(0.042, 20, Math.PI, Math.PI), mouthInside, 0, 0.13, 0.208);
      m.rotation.x = 0.28;
      const teeth = mesh(new THREE.PlaneGeometry(0.062, 0.011), shine, 0, -0.0055, 0.001);
      m.add(teeth);
      g.add(m);
      break;
    }
    case 'oh': {
      const m = mesh(new THREE.CircleGeometry(0.022, 16), mouthInside, 0, 0.115, 0.206);
      m.scale.y = 1.3;
      m.rotation.x = 0.3;
      g.add(m);
      break;
    }
    case 'cat':
      for (const side of [-1, 1]) {
        const m = mesh(new THREE.TorusGeometry(0.018, 0.007, 6, 12, Math.PI), ink, side * 0.018, 0.125, 0.202);
        m.rotation.z = Math.PI;
        g.add(m);
      }
      break;
  }
  return g;
}

function makeBlush(): THREE.Group {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const blush = mesh(new THREE.SphereGeometry(0.03, 10, 8), cheek, side * 0.125, 0.13, 0.168);
    blush.scale.set(1.2, 0.7, 0.3);
    g.add(blush);
  }
  return g;
}

/** A cap's or visor's brim: half a disc sticking out over the forehead. */
function brim(material: THREE.Material, y: number): THREE.Mesh {
  const m = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 24, 1, false, -Math.PI / 2, Math.PI), material, 0, y, 0.1);
  m.scale.x = 0.75;
  m.rotation.x = 0.15;
  return m;
}

function makeHat(hat: AvatarLook['hat'], colour: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  if (hat === 'cap') {
    const dome = mesh(new THREE.SphereGeometry(0.238, 28, 12, 0, Math.PI * 2, 0, 1.2), colour, 0, SKULL_Y, 0);
    dome.rotation.x = -0.3;
    g.add(dome, brim(colour, SKULL_Y + 0.14));
    g.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), knit, 0, SKULL_Y + 0.227, -0.07));
  } else if (hat === 'visor') {
    const band = mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 32), colour, 0, SKULL_Y + 0.1, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band, brim(colour, SKULL_Y + 0.105));
  } else if (hat === 'beanie') {
    const tilted = new THREE.Group();
    tilted.position.y = SKULL_Y;
    tilted.rotation.x = -0.2;
    tilted.add(mesh(new THREE.SphereGeometry(0.242, 28, 12, 0, Math.PI * 2, 0, 1.35), colour));
    const cuff = mesh(new THREE.TorusGeometry(0.236, 0.034, 10, 32), knit, 0, 0.05, 0);
    cuff.rotation.x = Math.PI / 2;
    tilted.add(cuff, mesh(new THREE.SphereGeometry(0.055, 14, 10), knit, 0, 0.25, 0));
    g.add(tilted);
  }
  return g;
}

function makeGlasses(glasses: AvatarLook['glasses']): THREE.Group {
  const g = new THREE.Group();
  const sun = glasses === 'sun';
  const z = sun ? 0.222 : 0.215;
  for (const side of [-1, 1]) {
    const x = side * 0.075;
    if (sun) {
      const lens = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 20), darkLens, x, 0.19, z);
      lens.scale.set(1.2, 1, 0.85);
      lens.rotation.set(Math.PI / 2, side * 0.36, 0, 'YXZ'); // facing forward, turned with the face
      g.add(lens);
    } else {
      const rim = mesh(new THREE.TorusGeometry(0.048, 0.008, 8, 24), ink, x, 0.19, z);
      rim.rotation.y = side * 0.36;
      g.add(rim);
    }
    // The arm from the outer edge of the lens back to the ear.
    const from = new THREE.Vector3(side * 0.13, 0.195, z - 0.03);
    const to = new THREE.Vector3(side * 0.205, 0.2, 0.02);
    const length = from.distanceTo(to);
    const temple = mesh(new THREE.CylinderGeometry(0.006, 0.006, length, 6), ink);
    temple.position.copy(from).add(to).multiplyScalar(0.5);
    temple.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    g.add(temple);
  }
  const bridge = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.056, 6), ink, 0, 0.198, z + 0.004);
  bridge.rotation.z = Math.PI / 2;
  g.add(bridge);
  return g;
}
