import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';
import { Character, type CharacterLook } from '../game/character.ts';
import type { Course } from './course.ts';

// One skier (SKI.md, phase S2a). RacerPhysics moves it down the run (no drawing, so it can be tested in Node);
// Racer adds the chibi on skis and its poses (tuck, crouch, flying, tumbling).
// Physics in short: gravity pulls along the skis' direction (so skiing across the slope is slower), snow friction
// and air drag slow it, turning hard brakes; the ground can fall away under a fast skier (rollers, kicker lips),
// and JUMP pops it up. Hitting a tree or rock fast is a crash: a tumble, then on again.

/** push: extra acceleration on the ground in m/s² (catching up, the computer's level; negative = held back). */
export type RacerInput = { steer: number; tuck: boolean; jump: boolean; push?: number };
export type RacerEvent = 'crash' | 'land' | 'land_big' | 'gate' | 'jump' | 'finish';

/** Keeps a skier from being pushed into an obstacle again right after a crash (metres of extra clearance). */
const CLEAR = 0.05;

export class RacerPhysics {
  /** Across the run (m), down the run (m), height (m). */
  x = 0;
  d = 0;
  y = 0;
  /** Where the skis point, degrees from straight downhill (+ = right). */
  heading = 0;
  /** Speed along the skis (m/s), and upwards speed while flying. */
  speed = 0;
  vy = 0;
  air = false;
  airTime = 0;
  /** Steering now (-1..1, follows the input smoothly), and how fast the skis turned this step (°/s). */
  steer = 0;
  turnRate = 0;
  tuck = false;
  /** Seconds JUMP has been held on the ground (the crouch). */
  crouch = 0;
  /** Seconds left of a crash tumble (0 = skiing), then seconds the skier passes through trees and rocks. */
  crashLeft = 0;
  ghostLeft = 0;
  finished = false;
  /** Seconds since the start, at the finish line. */
  finishTime: number | null = null;
  gatesPassed = 0;
  /** How fast the ground under the skis went up or down last step (m/s), and its height there. */
  private groundVy = 0;
  private lastGround = 0;
  private jumpHeld = false;

  /** Puts the skier at d on the run, standing still. */
  reset(course: Course, d: number, x = course.centre(d)): void {
    this.x = x;
    this.d = d;
    this.y = course.height(x, d);
    this.heading = course.direction(d, x) * TUNING.ski.alignToCourse;
    this.speed = this.vy = this.airTime = this.steer = this.turnRate = this.crouch = this.crashLeft = this.ghostLeft = 0;
    this.air = this.tuck = this.finished = this.jumpHeld = false;
    this.finishTime = null;
    this.gatesPassed = 0;
    this.groundVy = 0;
    this.lastGround = this.y;
  }

  /**
   * After being put somewhere already moving (a respawn): take the slope's fall at this speed as known, so the
   * skier glides on instead of flying off the spot as if the ground had dropped away.
   */
  settle(course: Course): void {
    const h = THREE.MathUtils.degToRad(this.heading);
    const rise = (course.height(this.x + Math.sin(h) * 0.5, this.d + Math.cos(h) * 0.5) - course.height(this.x, this.d)) / 0.5;
    this.groundVy = rise * this.speed;
  }

  /** One step of `dt` seconds. time = race clock (seconds since GO), for the finish time. */
  step(dt: number, input: RacerInput, course: Course, time: number, events: RacerEvent[]): void {
    const c = TUNING.ski;
    const p = c.physics;
    const g = p.gravity;
    this.steer += (input.steer - this.steer) * (1 - Math.exp(-c.steerFollow * dt));
    this.tuck = input.tuck && !this.finished && this.crashLeft <= 0;

    if (this.crashLeft > 0) {
      // Tumbling: slide to a stop, then get up facing down the run.
      this.crashLeft -= dt;
      this.speed = Math.max(0, this.speed - 12 * dt);
      this.move(dt, course);
      this.y = this.lastGround = course.height(this.x, this.d);
      this.air = false;
      this.vy = this.groundVy = 0;
      if (this.crashLeft <= 0) {
        this.crashLeft = 0;
        this.heading = course.direction(this.d, this.x) * c.alignToCourse;
        this.speed = p.getUpSpeed;
        this.ghostLeft = p.ghostSeconds;
      }
      this.jumpHeld = input.jump;
      return;
    }

    // Steering points the skis (a bit less when tucked, much slower in the air).
    const before = this.heading;
    const reach = c.maxHeadingDeg * (this.tuck ? p.tuckTurn : 1);
    const runDirection = course.direction(this.d, this.x);
    const target = this.finished ? runDirection : runDirection * c.alignToCourse + this.steer * reach;
    const response = c.headingResponse * (this.air ? p.airTurn : 1);
    this.heading += (target - this.heading) * (1 - Math.exp(-response * dt));
    this.turnRate = Math.abs(this.heading - before) / dt;

    const h = THREE.MathUtils.degToRad(this.heading);
    const dx = Math.sin(h);
    const dd = Math.cos(h);
    const drag = p.drag * (this.tuck ? p.tuckDrag : 1);
    if (!this.air) {
      // Gravity along the skis: the ground's rise per metre in the skis' direction.
      const rise = (course.height(this.x + dx * 0.5, this.d + dd * 0.5) - course.height(this.x, this.d)) / 0.5;
      const pull = (-rise / Math.sqrt(1 + rise * rise)) * g;
      const carve = p.carveBrake * (this.turnRate / 60) * this.speed;
      this.speed += (pull - p.friction * g - drag * this.speed * this.speed - carve + (this.finished ? 0 : (input.push ?? 0))) * dt;
      if (this.finished) this.speed -= p.finishBrake * dt;
      this.speed = Math.max(this.finished ? 0 : p.minSpeed, this.speed);
    } else {
      this.speed = Math.max(0, this.speed - drag * this.speed * this.speed * dt);
    }

    const beforeD = this.d;
    const clamped = this.move(dt, course);
    this.ghostLeft = Math.max(0, this.ghostLeft - dt);

    // Up and down: follow the ground, unless it falls away faster than gravity could pull the skier down.
    const ground = course.height(this.x, this.d);
    const groundVy = (ground - this.lastGround) / dt;
    this.lastGround = ground;
    if (this.air) {
      this.vy -= g * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      if (this.y <= ground) {
        this.y = ground;
        this.air = false;
        events.push(this.airTime > p.bigAirSeconds ? 'land_big' : 'land');
        if (this.airTime > 0.15) this.speed *= p.landKeep;
      }
      this.groundVy = groundVy;
    } else {
      if (groundVy - this.groundVy < -g * dt && this.speed > 4 && !clamped) {
        this.air = true;
        this.airTime = 0;
        this.vy = this.groundVy;
        this.y += this.vy * dt;
      } else this.y = ground;
      this.groundVy = groundVy;
    }

    // JUMP: hold to crouch, let go to pop.
    if (input.jump && !this.air) this.crouch = Math.min(p.crouchSeconds, this.crouch + dt);
    if (this.jumpHeld && !input.jump && !this.air && !this.finished) {
      const share = 0.6 + 0.4 * (this.crouch / p.crouchSeconds);
      this.air = true;
      this.airTime = 0;
      this.vy = this.groundVy + p.jumpSpeed * share; // (a jump up from the slope, which is itself going down)
      events.push('jump');
    }
    if (!input.jump || this.air) this.crouch = 0;
    this.jumpHeld = input.jump;

    if (this.ghostLeft <= 0) this.hitObstacles(course, events);

    for (const gate of course.gates) {
      if (beforeD < gate.d && this.d >= gate.d && Math.abs(this.x - gate.x) < gate.width / 2) {
        this.speed += p.gateBoost;
        this.gatesPassed++;
        events.push('gate');
      }
    }
    if (!this.finished && beforeD < course.length && this.d >= course.length) {
      this.finished = true;
      this.finishTime = time - (this.d - course.length) / Math.max(1, this.speed);
      events.push('finish');
    }
  }

  /** Moves along the skis; the run's walls stop the skier going too far out (then it returns true). */
  private move(dt: number, course: Course): boolean {
    const h = THREE.MathUtils.degToRad(this.heading);
    this.x += Math.sin(h) * this.speed * dt;
    this.d = Math.min(course.end, this.d + Math.cos(h) * this.speed * dt);
    const { lo, hi } = course.bounds(this.d);
    const limit = TUNING.ski.course.edgeLimit;
    if (this.x < lo - limit || this.x > hi + limit) {
      this.x = Math.min(hi + limit, Math.max(lo - limit, this.x));
      this.speed *= 0.97;
      return true;
    }
    return false;
  }

  private hitObstacles(course: Course, events: RacerEvent[]): void {
    const p = TUNING.ski.physics;
    for (const o of course.near(this.d, 3)) {
      const ox = this.x - o.x;
      const od = this.d - o.d;
      const distance = Math.hypot(ox, od);
      const reach = o.radius + p.skierRadius;
      if (distance >= reach || this.y - course.height(o.x, o.d) > o.height) continue;
      // Push out of the obstacle.
      const nx = distance > 1e-3 ? ox / distance : 1;
      const nd = distance > 1e-3 ? od / distance : 0;
      this.x = o.x + nx * (reach + CLEAR);
      this.d = o.d + nd * (reach + CLEAR);
      if (!this.air) this.y = this.lastGround = course.height(this.x, this.d);
      if (this.speed > p.crashSpeed && !this.finished) {
        this.crashLeft = p.crashSeconds;
        this.speed *= 0.35;
        this.air = false;
        events.push('crash');
      } else this.speed *= 0.5;
      return;
    }
  }
}

const DEFAULT_LOOK: CharacterLook = { shirt: '#ff8a3d', skin: '#f3c79a', handedness: 'right' };
/** The character model is 0.9 tall; on the run everything is in metres. */
const SKIER_SCALE = 2;

export class Racer {
  readonly body = new RacerPhysics();
  /** Placed at the skier's feet; turned to the skis' direction and tipped with the ground. */
  readonly group = new THREE.Group();
  private readonly leaner = new THREE.Group();
  private readonly posture = new THREE.Group();
  private readonly tumble = new THREE.Group();
  private readonly character = new Character(DEFAULT_LOOK, { putter: false });
  private readonly skis: THREE.Mesh[] = [];
  private lookKey = '';
  private pitch = 0;
  private spin = new THREE.Vector3();

  constructor() {
    this.group.rotation.order = 'YXZ';
    this.character.place(new THREE.Vector3(), Math.PI);
    const skiMaterial = new THREE.MeshStandardMaterial({ color: '#2b3a55', roughness: 0.5 });
    for (const side of [-1, 1]) {
      const ski = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.8), skiMaterial);
      ski.position.set(side * 0.09, 0.01, -0.06);
      ski.castShadow = true;
      this.skis.push(ski);
      this.tumble.add(ski);
    }
    // Poles: from each hand down and backwards, with a little basket near the tip.
    const poleMaterial = new THREE.MeshStandardMaterial({ color: TUNING.ski.outfit.poleColour, roughness: 0.4, metalness: 0.5 });
    const length = TUNING.ski.outfit.poleLength;
    for (const arm of [this.character.handArm, this.character.freeArm]) {
      const pole = new THREE.Group();
      pole.position.set(0, -0.17, 0);
      pole.rotation.x = -1.0; // (the arm reaches forwards; the pole trails back to the snow)
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, length, 6), poleMaterial);
      stick.position.y = -length / 2 + 0.04;
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 10), poleMaterial);
      basket.position.y = -length + 0.09;
      stick.castShadow = true;
      pole.add(stick, basket);
      arm.add(pole);
    }
    this.posture.add(this.character.root);
    this.tumble.add(this.posture);
    this.leaner.add(this.tumble);
    this.group.add(this.leaner);
    this.group.scale.setScalar(SKIER_SCALE);
  }

  /** Dresses the skier like this player (null = the default look). */
  setLook(look: CharacterLook | null): void {
    const key = look ? JSON.stringify(look) : '';
    if (key === this.lookKey) return;
    this.lookKey = key;
    const dressed = look ? { ...look, handedness: 'right' as const } : DEFAULT_LOOK;
    this.character.setLook(dressed);
    const o = TUNING.ski.outfit;
    const trousers = new THREE.Color(dressed.shirt).lerp(new THREE.Color(o.trousersBase), o.trousersShade);
    this.character.setOutfit({ top: 'jacket', bottoms: 'pants', bottomsColour: `#${trousers.getHexString()}`, feet: 'shoes', shoeColour: o.boots, gloves: o.gloves, helmet: true });
    this.character.root.traverse((part) => (part.castShadow = true));
  }

  /** Puts the drawing where the physics is, with the right pose. */
  update(dt: number, course: Course): void {
    const b = this.body;
    const c = TUNING.ski;
    this.group.position.set(b.x, b.y, -b.d);
    this.group.rotation.y = -THREE.MathUtils.degToRad(b.heading);
    // Tip with the ground along the skis (in the air, keep the take-off angle and level out slowly).
    const h = THREE.MathUtils.degToRad(b.heading);
    const rise = (course.height(b.x + Math.sin(h) * 0.6, b.d + Math.cos(h) * 0.6) - course.height(b.x - Math.sin(h) * 0.6, b.d - Math.cos(h) * 0.6)) / 1.2;
    const pitchTarget = b.air ? this.pitch * 0.98 : Math.atan(rise);
    this.pitch += (pitchTarget - this.pitch) * (1 - Math.exp(-12 * dt));
    this.group.rotation.x = this.pitch;
    this.leaner.rotation.z = -THREE.MathUtils.degToRad(c.leanDeg) * b.steer * (b.air ? 0.4 : 1);

    // Pose: tucked = low and far forward; crouching for a jump = low; in the air = knees up.
    const crouch = b.crouch / c.physics.crouchSeconds;
    const low = b.tuck ? 0.75 : 1 - 0.2 * crouch;
    this.posture.scale.y += (low - this.posture.scale.y) * (1 - Math.exp(-14 * dt));
    const lean = b.tuck ? -0.55 : -0.18 - 0.15 * crouch;
    this.posture.rotation.x += (lean - this.posture.rotation.x) * (1 - Math.exp(-10 * dt));
    this.character.legPose = b.air ? { left: -0.7, right: -0.7 } : { left: -0.25, right: -0.25 };
    // Arms: out and forwards with the poles; tucked = hands together in front, poles under the arms.
    this.character.armPose = b.tuck ? { x: -1.5, z: 0.1 } : b.air ? { x: -0.3, z: -0.9 } : { x: -0.55, z: -0.4 };
    this.character.freeArmPose = b.tuck ? { x: -1.5, z: -0.1 } : b.air ? { x: -0.3, z: 0.9 } : { x: -0.55, z: 0.4 };

    // Crash: tumble round, then stand up again.
    if (b.crashLeft > 0) {
      if (this.spin.lengthSq() === 0) this.spin.set(6 + Math.random() * 4, 0, (Math.random() - 0.5) * 8);
      this.tumble.rotation.x += this.spin.x * dt * Math.min(1, b.crashLeft);
      this.tumble.rotation.z += this.spin.z * dt * Math.min(1, b.crashLeft);
      this.tumble.position.y = 0.15;
    } else {
      this.spin.set(0, 0, 0);
      // Unwind by the short way round, then settle upright.
      this.tumble.rotation.x = wrapAngle(this.tumble.rotation.x) * Math.exp(-12 * dt);
      this.tumble.rotation.z = wrapAngle(this.tumble.rotation.z) * Math.exp(-12 * dt);
      this.tumble.position.y = 0;
    }
    this.character.update(dt);
  }
}

/** An angle in radians brought into -π..π. */
function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}
