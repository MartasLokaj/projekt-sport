import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';
import { applyRollingResistance, createBall, shotSpeed } from './ball.ts';
import { buildCourse, HOLE_1, type HoleDef } from './course.ts';

// Phase 2, step A: one graybox hole for one player. The host owns the ball physics.
// The phone's aim and strokes come in through onPhoneAim / onPhoneStroke.
// Mac keyboard for testing: arrow keys aim, hold Space to charge and release to hit, R resets the ball.

type State = 'aiming' | 'rolling' | 'holed';

export type GameHud = {
  /** Hole, par and stroke count. */
  info: HTMLElement;
  /** Big message in the middle ("Hole in one!"). */
  message: HTMLElement;
  /** Power of the last or charging hit. */
  power: HTMLElement;
};

const UP = new THREE.Vector3(0, 1, 0);

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
  private readonly world: RAPIER.World;
  private readonly ball: RAPIER.RigidBody;
  private readonly ballMesh: THREE.Mesh;
  private readonly aimDots: THREE.Mesh[] = [];
  private readonly clock = new THREE.Clock();

  private hole: HoleDef = HOLE_1;
  private state: State = 'aiming';
  private strokes = 0;
  private lastRest = new THREE.Vector3();
  private restTime = 0;
  private stepAccumulator = 0;
  private messageTimer: number | undefined;

  /** Aim straight towards the next aim point, set at the start of each shot. */
  private baseYaw = 0;
  /** Latest aim angle from the phone (degrees) and its value when the shot started. */
  private phoneAngle = 0;
  private phoneZero = 0;
  /** Extra aim from the Mac arrow keys (degrees). */
  private keyboardOffset = 0;
  private keysTurning = 0;
  private charging: number | null = null;

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

    // Dotted aim line
    const dotGeometry = new THREE.SphereGeometry(0.03, 10, 6);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true });
    for (let i = 0; i < TUNING.aimLine.dots; i++) {
      const aimDot = new THREE.Mesh(dotGeometry, dotMaterial.clone());
      (aimDot.material as THREE.MeshBasicMaterial).opacity = 1 - i / TUNING.aimLine.dots;
      this.aimDots.push(aimDot);
      this.scene.add(aimDot);
    }

    this.resetBall(new THREE.Vector3(this.hole.tee.x, 0, this.hole.tee.z));
    this.world.step(); // fills the physics world's lookup tables, so the first aim check can see the walls
    this.beginShot();
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

  onPhoneStroke(power: number, angle: number): void {
    if (this.state !== 'aiming') return;
    this.phoneAngle = angle;
    this.shoot(power);
  }

  // ---------- Rules ----------

  private beginShot(): void {
    this.state = 'aiming';
    this.baseYaw = this.findAimYaw();
    this.phoneZero = this.phoneAngle;
    this.keyboardOffset = 0;
    this.updateInfo();
  }

  private shoot(power: number): void {
    const yaw = this.aimYaw();
    const speed = shotSpeed(power);
    this.ball.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true);
    this.followDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.strokes++;
    this.state = 'rolling';
    this.restTime = 0;
    this.hud.power.textContent = `Power ${Math.round(power)}%`;
    this.updateInfo();
  }

  private checkBall(dt: number): void {
    if (this.state !== 'rolling') return;
    const p = this.ball.translation();
    const cup = this.hole.cup;
    const gap = TUNING.course.cupGap;

    if (p.y < -TUNING.ball.radius * 1.5 && Math.abs(p.x - cup.x) < gap && Math.abs(p.z - cup.z) < gap) {
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
      this.hud.power.textContent = '';
      this.resetBall(new THREE.Vector3(this.hole.tee.x, 0, this.hole.tee.z));
      this.beginShot();
    }, 3000);
  }

  private resetBall(at: THREE.Vector3): void {
    this.ball.setTranslation({ x: at.x, y: TUNING.ball.radius + 0.005, z: at.z }, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.lastRest.set(at.x, 0, at.z);
  }

  /** Points at the farthest aim point the ball can see (the cup if possible, else the corner). */
  private findAimYaw(): number {
    const p = this.ball.translation();
    const points = this.hole.aimPoints;
    for (let i = points.length - 1; i >= 0; i--) {
      const dx = points[i].x - p.x;
      const dz = points[i].z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.01) continue;
      const ray = new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, { x: dx / dist, y: 0, z: dz / dist });
      const hit = this.world.castRay(ray, dist, true, undefined, undefined, undefined, this.ball);
      if (!hit || i === 0) return Math.atan2(dx, dz);
    }
    return 0;
  }

  /** Current aim direction. Positive phone angles turn the aim to the right. */
  private aimYaw(): number {
    const offset = this.phoneAngle - this.phoneZero + this.keyboardOffset;
    return this.baseYaw - THREE.MathUtils.degToRad(offset);
  }

  // ---------- Frame ----------

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.state === 'aiming') {
      this.keyboardOffset += this.keysTurning * TUNING.aimLine.keyboardDegreesPerSecond * dt;
      if (this.charging !== null) {
        this.charging = Math.min(1, this.charging + dt / TUNING.aimLine.keyboardChargeTime);
        this.hud.power.textContent = `Power ${Math.round(this.charging * 100)}%`;
      }
    }

    const step = this.world.timestep;
    this.stepAccumulator += dt;
    while (this.stepAccumulator >= step) {
      applyRollingResistance(this.ball, step);
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
    const visible = this.state === 'aiming';
    const yaw = this.aimYaw();
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const start = this.ballMesh.position;
    const { length, dots } = TUNING.aimLine;
    this.aimDots.forEach((dot, i) => {
      dot.visible = visible;
      dot.position.copy(start).addScaledVector(dir, 0.25 + (i / dots) * length);
      dot.position.y = 0.04;
    });
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
    else if (e.key === ' ' && this.state === 'aiming') {
      e.preventDefault();
      this.charging = 0;
    } else if ((e.key === 'r' || e.key === 'R') && this.state !== 'holed') {
      this.resetBall(this.lastRest);
      this.beginShot();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') this.keysTurning = 0;
    else if (e.key === ' ' && this.charging !== null) {
      const power = Math.max(1, Math.round(this.charging * 100));
      this.charging = null;
      if (this.state === 'aiming') this.shoot(power);
    }
  };
}
