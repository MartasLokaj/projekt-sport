import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { SwingProgress } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { applyCurve, applyRollingResistance, createBall, curveFromTwist, shotSpeed } from './ball.ts';
import { buildCourse, HOLE_1, isInCup, type HoleDef } from './course.ts';
import { DistancePreview } from './preview.ts';

// Phase 2, step A: one graybox hole for one player. The host owns the ball physics.
// The phone's aim, live swing, practice swings and strokes come in through the onPhone… methods.
// Every shot starts aimed straight ahead, where the camera looks (at the tee: down the lane).
// The phone's aim angle turns it from there. A white line shows the aim; while the player swings,
// the gauge on the left climbs and a marker on the course shows roughly how far the ball would roll.
// Mac keyboard for testing: arrow keys aim, hold P for a practice swing, hold Space to hit, R resets the ball.

type State = 'aiming' | 'rolling' | 'holed';
type SwingKind = 'hit' | 'practice';

export type GameHud = {
  /** Hole, par and stroke count. */
  info: HTMLElement;
  /** Big message in the middle ("Hole in one!"). */
  message: HTMLElement;
  /** Swing gauge on the left: container, fill, moving knob and label. */
  gauge: HTMLElement;
  gaugeFill: HTMLElement;
  gaugeKnob: HTMLElement;
  gaugeLabel: HTMLElement;
};

const UP = new THREE.Vector3(0, 1, 0);

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
  private readonly world: RAPIER.World;
  private readonly ball: RAPIER.RigidBody;
  private readonly ballMesh: THREE.Mesh;
  private readonly aimLine = new THREE.Group();
  private readonly marker = new THREE.Group();
  private readonly distancePreview: DistancePreview;
  private readonly clock = new THREE.Clock();

  private hole: HoleDef = HOLE_1;
  private state: State = 'aiming';
  private strokes = 0;
  private lastRest = new THREE.Vector3();
  private restTime = 0;
  private stepAccumulator = 0;
  private messageTimer: number | undefined;
  /** Sideways pull on the rolling ball from a twisted swing (see ball.ts). */
  private curve = 0;

  /** Straight-ahead direction for this shot, set when the shot starts. */
  private baseYaw = 0;
  /** Aim angle from the phone (degrees). The phone resets it to 0 at the start of each shot. */
  private phoneAngle = 0;
  /** Extra aim from the Mac arrow keys (degrees). */
  private keyboardOffset = 0;
  private keysTurning = 0;
  private charging: { kind: SwingKind; amount: number } | null = null;

  /** Result of the last practice swing for this shot, shown until the next swing. */
  private practiceResult: { power: number; curve: number } | null = null;
  /** Where the marker sits relative to the ball, in "aim space" (x = left, z = forward). */
  private markerOffset: { x: number; z: number } | null = null;
  private markerFor = { power: -1, curve: 0 };

  /** Called at the start of every shot, so the phones can reset their aim. */
  onNewShot: (() => void) | null = null;

  private readonly cameraTarget = new THREE.Vector3();
  private readonly followDir = new THREE.Vector3(0, 0, 1);

  static async create(container: HTMLElement, hud: GameHud): Promise<Game> {
    await RAPIER.init();
    return new Game(container, hud);
  }

  private constructor(
    private readonly container: HTMLElement,
    private readonly hud: GameHud,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#9fd8ff');
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a9a7a', 1.6));
    const sun = new THREE.DirectionalLight('#fff3dd', 2.2);
    sun.position.set(-6, 12, -4);
    sun.target.position.set(4, 0, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
    this.scene.add(sun, sun.target);

    this.world = new RAPIER.World({ x: 0, y: -TUNING.physics.gravity, z: 0 });
    this.world.timestep = 1 / TUNING.physics.stepsPerSecond;
    this.scene.add(buildCourse(this.hole, this.world, RAPIER));
    this.distancePreview = new DistancePreview(RAPIER);

    // Ball
    const b = TUNING.ball;
    this.ball = createBall(this.world, RAPIER);
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(b.radius, 32, 16),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
    );
    this.ballMesh.castShadow = true;
    // A small dot on the ball, so you can see it roll.
    const dot = new THREE.Mesh(new THREE.SphereGeometry(b.radius * 0.3, 12, 8), new THREE.MeshStandardMaterial({ color: '#ff5a5f' }));
    dot.position.set(0, 0, b.radius * 0.85);
    this.ballMesh.add(dot);
    this.scene.add(this.ballMesh);

    // White aim line: a flat stripe from the ball straight ahead.
    const { length, width } = TUNING.aimLine;
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.012, b.radius * 1.6 + length / 2);
    this.aimLine.add(stripe);
    this.scene.add(this.aimLine);

    // "About this far" marker: a ring on the ground with a short post, so it shows above walls.
    const markerMaterial = new THREE.MeshBasicMaterial({ color: '#ffd23f', side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.22, 32), markerMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), markerMaterial);
    post.position.y = 0.25;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), markerMaterial);
    top.position.y = 0.52;
    this.marker.add(ring, post, top);
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.resetBall(new THREE.Vector3(this.hole.tee.x, 0, this.hole.tee.z));
    this.beginShot(true);
    this.snapCamera();
  }

  start(): void {
    this.onResize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  onPhoneAim(angle: number): void {
    this.phoneAngle = angle;
  }

  /** The phone is in the middle of a swing: move the gauge and the distance marker live. */
  onPhoneSwingProgress(progress: SwingProgress): void {
    if (this.state !== 'aiming') return;
    if (progress.phase === 'cancelled') {
      this.showPracticeResult();
      return;
    }
    const label = progress.practice ? 'Practice' : 'Swing';
    this.setGauge(progress.phase === 'ready' ? `${label}!` : label, progress.power);
    this.showMarker(progress.power, 0);
  }

  onPhonePractice(power: number, angle: number, twist: number | null): void {
    if (this.state !== 'aiming') return;
    this.phoneAngle = angle;
    this.practice(power, curveFromTwist(twist));
  }

  onPhoneStroke(power: number, angle: number, twist: number | null): void {
    if (this.state !== 'aiming') return;
    this.phoneAngle = angle;
    this.shoot(power, curveFromTwist(twist));
  }

  // ---------- Rules ----------

  /** A new shot: aim straight ahead (down the lane at the tee, otherwise where the camera looks). */
  private beginShot(fromTee = false): void {
    this.state = 'aiming';
    this.baseYaw = fromTee ? THREE.MathUtils.degToRad(this.hole.teeYaw) : this.cameraYaw();
    this.phoneAngle = 0;
    this.keyboardOffset = 0;
    this.practiceResult = null;
    this.marker.visible = false;
    this.hud.gauge.hidden = true;
    this.onNewShot?.();
    this.updateInfo();
  }

  private practice(power: number, curve: number): void {
    this.practiceResult = { power, curve };
    this.showPracticeResult();
  }

  private showPracticeResult(): void {
    if (this.practiceResult) {
      this.setGauge('Practice', this.practiceResult.power);
      this.showMarker(this.practiceResult.power, this.practiceResult.curve);
    } else {
      this.hud.gauge.hidden = true;
      this.marker.visible = false;
    }
  }

  private shoot(power: number, curve: number): void {
    const yaw = this.aimYaw();
    const speed = shotSpeed(power);
    this.ball.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true);
    this.followDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.curve = curve;
    this.strokes++;
    this.state = 'rolling';
    this.restTime = 0;
    this.marker.visible = false;
    this.setGauge('Hit', power);
    this.updateInfo();
  }

  private checkBall(dt: number): void {
    if (this.state !== 'rolling') return;
    const p = this.ball.translation();
    if (isInCup(p, this.hole)) {
      this.holed();
      return;
    }
    if (p.y < TUNING.physics.outOfBoundsY) {
      this.strokes++;
      this.showMessage('Out of bounds! +1', 1800);
      this.resetBall(this.lastRest);
      this.beginShot();
      return;
    }

    const v = this.ball.linvel();
    if (Math.hypot(v.x, v.y, v.z) < TUNING.ball.restSpeed) {
      this.restTime += dt * 1000;
      if (this.restTime >= TUNING.ball.restTimeMs) {
        this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.lastRest.set(p.x, 0, p.z);
        this.beginShot();
      }
    } else {
      this.restTime = 0;
    }
  }

  private holed(): void {
    this.state = 'holed';
    this.updateInfo();
    const diff = this.strokes - this.hole.par;
    const name =
      this.strokes === 1 ? 'HOLE IN ONE!' : ({ [-2]: 'Eagle!', [-1]: 'Birdie!', 0: 'Par', 1: 'Bogey' } as Record<number, string>)[diff];
    const strokesText = `${this.strokes} stroke${this.strokes === 1 ? '' : 's'}`;
    this.showMessage(name ? `${name}\n${strokesText}` : `In the hole!\n${strokesText}`, 3000);
    window.setTimeout(() => {
      // Practice: start the hole again.
      this.strokes = 0;
      this.resetBall(new THREE.Vector3(this.hole.tee.x, 0, this.hole.tee.z));
      this.beginShot(true);
    }, 3000);
  }

  private resetBall(at: THREE.Vector3): void {
    this.ball.setTranslation({ x: at.x, y: TUNING.ball.radius + 0.005, z: at.z }, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.curve = 0;
    this.lastRest.set(at.x, 0, at.z);
  }

  /** The direction the camera is looking, flat on the ground. */
  private cameraYaw(): number {
    const p = this.ball.translation();
    return Math.atan2(p.x - this.camera.position.x, p.z - this.camera.position.z);
  }

  /** Current aim direction. Positive phone angles turn the aim to the right. */
  private aimYaw(): number {
    const offset = this.phoneAngle + this.keyboardOffset;
    return this.baseYaw - THREE.MathUtils.degToRad(offset);
  }

  // ---------- Frame ----------

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.state === 'aiming') {
      this.keyboardOffset += this.keysTurning * TUNING.aimLine.keyboardDegreesPerSecond * dt;
      if (this.charging) {
        this.charging.amount = Math.min(1, this.charging.amount + dt / TUNING.aimLine.keyboardChargeTime);
        const power = Math.round(this.charging.amount * 100);
        this.setGauge(this.charging.kind === 'hit' ? 'Swing' : 'Practice', power);
        this.showMarker(power, 0);
      }
    }

    const step = this.world.timestep;
    this.stepAccumulator += dt;
    while (this.stepAccumulator >= step) {
      applyRollingResistance(this.ball, step);
      if (this.state === 'rolling') applyCurve(this.ball, this.curve, step);
      this.world.step();
      this.checkBall(step);
      this.stepAccumulator -= step;
    }

    const p = this.ball.translation();
    const q = this.ball.rotation();
    this.ballMesh.position.set(p.x, p.y, p.z);
    this.ballMesh.quaternion.set(q.x, q.y, q.z, q.w);

    this.updateAimLine();
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateAimLine(): void {
    const aiming = this.state === 'aiming';
    const yaw = this.aimYaw();
    this.aimLine.visible = aiming;
    this.aimLine.position.set(this.ballMesh.position.x, 0, this.ballMesh.position.z);
    this.aimLine.rotation.y = yaw;
    if (aiming && this.markerOffset && this.marker.visible) {
      // Turn the marker with the aim (x = left, z = forward in aim space).
      const { x, z } = this.markerOffset;
      this.marker.position.set(
        this.ballMesh.position.x + x * Math.cos(yaw) + z * Math.sin(yaw),
        0,
        this.ballMesh.position.z - x * Math.sin(yaw) + z * Math.cos(yaw),
      );
    }
  }

  /** Shows roughly where a shot with this power and curve would stop (on open ground, ignoring walls). */
  private showMarker(power: number, curve: number): void {
    if (Math.abs(power - this.markerFor.power) > 0.2 || curve !== this.markerFor.curve) {
      this.markerOffset = this.distancePreview.predict(power, curve);
      this.markerFor = { power, curve };
    }
    this.marker.visible = power > 0;
  }

  private desiredCamera(): { position: THREE.Vector3; look: THREE.Vector3 } {
    const c = TUNING.camera;
    const ball = this.ballMesh.position.clone();
    if (this.state === 'aiming') {
      const yaw = this.aimYaw();
      const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      return {
        position: ball.clone().addScaledVector(dir, -c.aimDistance).addScaledVector(UP, c.aimHeight),
        look: ball.clone().addScaledVector(dir, 1.5),
      };
    }
    // Follow the ball from behind its direction of travel, turning gently.
    const v = this.ball.linvel();
    const flat = new THREE.Vector3(v.x, 0, v.z);
    if (this.state === 'rolling' && flat.length() > 0.4) this.followDir.lerp(flat.normalize(), 0.03).normalize();
    return {
      position: ball.clone().addScaledVector(this.followDir, -c.followDistance).addScaledVector(UP, c.followHeight),
      look: ball,
    };
  }

  private updateCamera(dt: number): void {
    const { position, look } = this.desiredCamera();
    const k = 1 - Math.exp(-TUNING.camera.smoothing * dt);
    this.camera.position.lerp(position, k);
    this.cameraTarget.lerp(look, k);
    this.camera.lookAt(this.cameraTarget);
  }

  private snapCamera(): void {
    const { position, look } = this.desiredCamera();
    this.camera.position.copy(position);
    this.cameraTarget.copy(look);
    this.camera.lookAt(look);
  }

  // ---------- HUD and input ----------

  private updateInfo(): void {
    this.hud.info.textContent = `Hole ${this.hole.number} · Par ${this.hole.par} · Strokes ${this.strokes}`;
  }

  private setGauge(label: string, power: number): void {
    this.hud.gauge.hidden = false;
    this.hud.gauge.classList.toggle('practice', label.startsWith('Practice'));
    this.hud.gaugeFill.style.height = `${power}%`;
    this.hud.gaugeKnob.style.bottom = `${power}%`;
    this.hud.gaugeLabel.textContent = `${label}\n${Math.round(power)}%`;
  }

  private showMessage(text: string, ms: number): void {
    this.hud.message.textContent = text;
    this.hud.message.hidden = false;
    clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => (this.hud.message.hidden = true), ms);
  }

  private readonly onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft') this.keysTurning = -1;
    else if (e.key === 'ArrowRight') this.keysTurning = 1;
    else if ((e.key === ' ' || e.key === 'p' || e.key === 'P') && this.state === 'aiming') {
      e.preventDefault();
      this.charging = { kind: e.key === ' ' ? 'hit' : 'practice', amount: 0 };
    } else if ((e.key === 'r' || e.key === 'R') && this.state !== 'holed') {
      this.resetBall(this.lastRest);
      this.beginShot();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') this.keysTurning = 0;
    else if ((e.key === ' ' || e.key === 'p' || e.key === 'P') && this.charging) {
      const { kind, amount } = this.charging;
      this.charging = null;
      if (this.state !== 'aiming') return;
      const power = Math.max(1, Math.round(amount * 100));
      if (kind === 'hit') this.shoot(power, 0);
      else this.practice(power, 0);
    }
  };
}
