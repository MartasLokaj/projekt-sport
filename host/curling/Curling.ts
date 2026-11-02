import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';
import { curveFromTwist } from '../game/ball.ts';

// Curling prototype (phase C1, SPEC §14): a plain ice sheet with the house (the target) at the far end.
// Any phone throws the next stone with the minigolf swing: aim by dragging, swing power = the stone's speed,
// a twisted swing makes the stone curl. Stones slide, slow down, curl more as they slow and knock each other
// away. A stone that slides off the side or past the back line is out; one that stops before the far hog
// line without touching another stone is taken away too. After all stones of an end the sheet is cleared.
// Simple 2D physics on the ice (x across, z along the sheet; the thrower at z = 0 throws towards -z).
// Mac keyboard for testing: ← → aim, hold Space and let go to throw, A / S / D curl left / none / right,
// R clears the sheet.

type Stone = {
  mesh: THREE.Group;
  team: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** +1 curls to the left, -1 to the right, 0 straight (only the thrown stone; a knocked stone just slides). */
  curl: number;
  /** Touched another stone (a thrown stone that stops short of the hog line stays if it did). */
  touched: boolean;
  /** Out of play: it fades away, then it is removed. */
  out: boolean;
  fade: number;
};

type Phase = 'aim' | 'sliding' | 'end';

export type CurlingHud = {
  info: HTMLElement;
  power: HTMLElement;
  powerFill: HTMLElement;
};

const STEP = 1 / 120;

export class Curling {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  private readonly clock = new THREE.Clock();
  private readonly aimLine: THREE.Mesh;
  private readonly cameraLook = new THREE.Vector3(0, 0, -10);
  private stones: Stone[] = [];
  /** The stone waiting at the start for the next throw (not in play yet). */
  private next: THREE.Group | null = null;
  private thrown = 0;
  private phase: Phase = 'aim';
  /** Degrees, + = to the right. */
  private aim = 0;
  /** Mac keyboard: the chosen curl, and the power while Space is held (0..100, or null). */
  private keyCurl = 0;
  private charge: number | null = null;
  /** The stone that was thrown last (the camera follows it while it slides). */
  private active: Stone | null = null;
  /** Seconds since everything stopped (for the house view and the next end). */
  private stillFor = 0;
  private accumulator = 0;
  private introLeft = 0;
  private running = false;
  private readonly keys = new Set<string>();

  constructor(
    private readonly container: HTMLElement,
    private readonly hud: CurlingHud,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TUNING.scenery.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#bfe3ff');
    this.scene.fog = new THREE.Fog('#bfe3ff', 40, 120);
    this.buildSheet();

    const aimMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false });
    const aimGeometry = new THREE.PlaneGeometry(0.05, 1);
    aimGeometry.rotateX(-Math.PI / 2);
    aimGeometry.translate(0, 0.006, -0.5);
    this.aimLine = new THREE.Mesh(aimGeometry, aimMaterial);
    this.scene.add(this.aimLine);
  }

  // ---------- Public ----------

  /** Starts with an empty sheet and the first stone ready. */
  start(): void {
    this.newEnd();
    this.placeCamera(true);
    if (this.running) return;
    this.running = true;
    this.onResize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** The way in from the cube: the camera starts high above and glides down. */
  swoopIn(): void {
    this.introLeft = TUNING.transition.swoopSeconds;
  }

  stop(): void {
    this.running = false;
    this.keys.clear();
    this.charge = null;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  /** A phone's aim (degrees, 0 = straight down the sheet). */
  onPhoneAim(angle: number): void {
    if (this.phase !== 'aim') return;
    const c = TUNING.curling;
    this.aim = THREE.MathUtils.clamp(angle * c.aimScale, -c.maxAimDegrees, c.maxAimDegrees);
  }

  /** A phone's swing: throws the next stone (ignored while stones are still sliding). */
  onPhoneStroke(power: number, angle: number, twist: number | null): void {
    this.onPhoneAim(angle);
    this.throwStone(power, Math.sign(curveFromTwist(twist)));
  }

  // ---------- Rules ----------

  private newEnd(): void {
    for (const stone of this.stones) this.scene.remove(stone.mesh);
    this.stones = [];
    this.thrown = 0;
    this.active = null;
    this.readyNext();
    this.stillFor = TUNING.curling.camera.houseSeconds; // a new end starts behind the thrower, not above the house
  }

  /** Puts the next stone at the start, in its team's colour. */
  private readyNext(): void {
    const c = TUNING.curling;
    if (this.next) this.scene.remove(this.next);
    this.next = null;
    this.stillFor = 0;
    if (this.thrown >= c.stonesPerEnd) {
      this.phase = 'end';
    } else {
      this.phase = 'aim';
      this.aim = 0;
      this.next = this.buildStone(this.thrown % 2);
      this.next.position.set(0, 0, -1);
      this.scene.add(this.next);
    }
    this.renderInfo();
  }

  private throwStone(power: number, curl: number): void {
    if (this.phase !== 'aim' || !this.next) return;
    const c = TUNING.curling;
    const t = THREE.MathUtils.clamp(power, 0, 100) / 100;
    const speed = c.minSpeed + (c.maxSpeed - c.minSpeed) * t;
    const a = THREE.MathUtils.degToRad(this.aim);
    const stone: Stone = {
      mesh: this.next,
      team: this.thrown % 2,
      x: 0,
      z: -1,
      vx: Math.sin(a) * speed,
      vz: -Math.cos(a) * speed,
      curl,
      touched: false,
      out: false,
      fade: 1,
    };
    this.next = null;
    this.stones.push(stone);
    this.active = stone;
    this.thrown++;
    this.phase = 'sliding';
    this.stillFor = 0;
    this.renderInfo();
  }

  /** Everything stopped: take away a short thrown stone, then get the next one ready (or end the end). */
  private settle(): void {
    const c = TUNING.curling;
    const hogZ = -(c.houseDistance - c.hogLineBeforeHouse);
    const shot = this.active;
    if (shot && !shot.out && !shot.touched && shot.z > hogZ) shot.out = true;
    this.active = null;
    this.readyNext();
  }

  // ---------- Physics ----------

  private step(dt: number): void {
    const c = TUNING.curling;
    const r = c.stoneRadius;
    for (const s of this.stones) {
      if (s.out) continue;
      const speed = Math.hypot(s.vx, s.vz);
      if (speed === 0) continue;
      const slow = c.friction * dt;
      if (speed <= slow) {
        s.vx = 0;
        s.vz = 0;
        continue;
      }
      // Curl: a sideways pull to the stone's left (+1) or right (-1), stronger as it slows down.
      if (s.curl !== 0) {
        const pull = Math.min(c.curlMax, c.curl / (speed + c.curlSoftening)) * s.curl * dt;
        const [vx, vz] = [s.vx, s.vz];
        s.vx += (vz / speed) * pull;
        s.vz += (-vx / speed) * pull;
      }
      const now = Math.hypot(s.vx, s.vz);
      const scale = Math.max(0, now - slow) / now;
      s.vx *= scale;
      s.vz *= scale;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
    }
    // Stones knocking into each other: equal weights, a little energy lost.
    for (let i = 0; i < this.stones.length; i++) {
      const a = this.stones[i];
      if (a.out) continue;
      for (let j = i + 1; j < this.stones.length; j++) {
        const b = this.stones[j];
        if (b.out) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= 2 * r || dist === 0) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const push = (2 * r - dist) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (closing <= 0) continue;
        const j2 = ((1 + c.restitution) * closing) / 2;
        a.vx -= j2 * nx;
        a.vz -= j2 * nz;
        b.vx += j2 * nx;
        b.vz += j2 * nz;
        a.touched = b.touched = true;
        // After a hit the stones just slide; only a clean slide keeps curling.
        a.curl = b.curl = 0;
      }
    }
    // Off the side of the ice, or past the back line: out.
    const backZ = -(c.houseDistance + c.ringRadii[0]) - r;
    for (const s of this.stones) {
      if (!s.out && (Math.abs(s.x) > c.sheetHalfWidth - r || s.z < backZ)) s.out = true;
    }
  }

  private moving(): boolean {
    return this.stones.some((s) => !s.out && (s.vx !== 0 || s.vz !== 0));
  }

  // ---------- Frame ----------

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    const c = TUNING.curling;
    this.updateKeys(dt);
    this.accumulator += dt;
    while (this.accumulator >= STEP) {
      this.step(STEP);
      this.accumulator -= STEP;
    }
    if (this.phase === 'sliding' && !this.moving()) this.settle();
    if (this.phase !== 'sliding') this.stillFor += dt;
    if (this.phase === 'end' && this.stillFor > c.nextEndDelay) this.newEnd();

    // Stones out of play fade away and then go.
    for (const s of this.stones) {
      s.mesh.position.set(s.x, 0, s.z);
      if (s.out) {
        s.fade = Math.max(0, s.fade - dt * 1.5);
        s.mesh.scale.setScalar(Math.max(0.001, s.fade));
      }
    }
    this.stones = this.stones.filter((s) => {
      if (s.fade > 0) return true;
      this.scene.remove(s.mesh);
      return false;
    });

    this.aimLine.visible = this.phase === 'aim';
    if (this.next) {
      this.aimLine.position.set(0, 0, -1);
      this.aimLine.rotation.y = -THREE.MathUtils.degToRad(this.aim);
      this.aimLine.scale.z = c.houseDistance + c.ringRadii[0] - 1;
    }
    this.placeCamera(false, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Behind the thrower while aiming, behind the sliding stone, then above the house once everything stopped. */
  private placeCamera(snap: boolean, dt = 0): void {
    const c = TUNING.curling;
    const cam = c.camera;
    const target = new THREE.Vector3();
    const look = new THREE.Vector3();
    const watching = this.active;
    if (this.phase === 'sliding' && watching) {
      target.set(watching.x * 0.5, cam.followHeight, watching.z + cam.followBack);
      look.set(watching.x, 0, watching.z - 6);
    } else if (this.phase === 'end' || this.stillFor < cam.houseSeconds) {
      target.set(0, cam.houseHeight, -c.houseDistance + cam.houseBack);
      look.set(0, 0, -c.houseDistance);
    } else {
      target.set(0, cam.height, cam.back);
      look.set(0, 0, -c.houseDistance * 0.6);
    }
    if (this.introLeft > 0) {
      this.introLeft = Math.max(0, this.introLeft - dt);
      const k = this.introLeft / TUNING.transition.swoopSeconds;
      const ease = k * k * (3 - 2 * k);
      target.y += TUNING.transition.swoopHeight * ease;
      target.z += TUNING.transition.swoopBack * ease;
    }
    const blend = snap ? 1 : 1 - Math.exp(-cam.smoothing * dt);
    this.camera.position.lerp(target, blend);
    this.cameraLook.lerp(look, blend);
    this.camera.lookAt(this.cameraLook);
  }

  private renderInfo(): void {
    const c = TUNING.curling;
    const team = this.thrown % 2 === 0 ? 'Red' : 'Yellow';
    const curl = this.keyCurl > 0 ? 'curl left' : this.keyCurl < 0 ? 'curl right' : 'no curl';
    this.hud.info.textContent =
      this.phase === 'end'
        ? 'End over · next end starts soon'
        : `Stone ${Math.min(this.thrown + 1, c.stonesPerEnd)} of ${c.stonesPerEnd} · ${team} · Mac: ${curl}`;
  }

  // ---------- Mac keyboard ----------

  private updateKeys(dt: number): void {
    const c = TUNING.curling;
    if (this.phase === 'aim') {
      const turn = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
      this.aim = THREE.MathUtils.clamp(this.aim + turn * c.keyAimSpeed * dt, -c.maxAimDegrees, c.maxAimDegrees);
    }
    if (this.charge !== null) this.charge = Math.min(100, this.charge + (100 / c.keyChargeSeconds) * dt);
    this.hud.power.hidden = this.charge === null;
    this.hud.powerFill.style.width = `${this.charge ?? 0}%`;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key);
    if (e.key === ' ' && !e.repeat && this.phase === 'aim') {
      e.preventDefault();
      this.charge = 0;
    } else if (e.key === 'a' || e.key === 'A' || e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D') {
      const k = e.key.toLowerCase();
      this.keyCurl = k === 'a' ? 1 : k === 'd' ? -1 : 0;
      this.renderInfo();
    } else if (e.key === 'r' || e.key === 'R') {
      this.newEnd();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key);
    if (e.key === ' ' && this.charge !== null) {
      const power = this.charge;
      this.charge = null;
      this.throwStone(power, this.keyCurl);
    }
  };

  private readonly onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ---------- Graybox look ----------

  private buildSheet(): void {
    const c = TUNING.curling;
    const sun = new THREE.DirectionalLight('#ffffff', 2);
    sun.position.set(6, 16, 4);
    sun.target.position.set(0, 0, -c.houseDistance / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
    this.scene.add(new THREE.HemisphereLight('#eaf6ff', '#c9d6e0', 1.4), sun, sun.target);

    const snow = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#f4f8fb', roughness: 1 }));
    snow.rotation.x = -Math.PI / 2;
    snow.position.y = -0.02;
    snow.receiveShadow = true;
    this.scene.add(snow);

    const w = c.sheetHalfWidth * 2;
    const ice = new THREE.Mesh(new THREE.PlaneGeometry(w, c.sheetLength + 3), new THREE.MeshStandardMaterial({ color: '#e6f3fb', roughness: 0.25 }));
    ice.rotation.x = -Math.PI / 2;
    ice.position.set(0, 0, 3 - (c.sheetLength + 3) / 2);
    ice.receiveShadow = true;
    this.scene.add(ice);

    const flat = (geometry: THREE.BufferGeometry, colour: string, y: number, z: number, x = 0): void => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.4 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    // The house: blue outer ring, red inner ring, white button.
    const [r12, r8, r4, button] = c.ringRadii;
    const hz = -c.houseDistance;
    flat(new THREE.RingGeometry(r8, r12, 64), '#3d7fd9', 0.002, hz);
    flat(new THREE.RingGeometry(button, r4, 48), '#e04848', 0.002, hz);
    // Lines: tee line and centre line, the far hog line, the back line.
    const line = (width: number, length: number, x: number, z: number, colour = '#5a6b7c'): void =>
      flat(new THREE.PlaneGeometry(width, length), colour, 0.003, z, x);
    line(w, 0.03, 0, hz);
    line(0.03, c.ringRadii[0] * 2 + 2, 0, hz);
    line(w, 0.08, 0, -(c.houseDistance - c.hogLineBeforeHouse), '#d94848');
    line(w, 0.03, 0, -(c.houseDistance + r12));

    // Low boards along the sides and at the far end.
    const board = new THREE.MeshStandardMaterial({ color: '#c8a27a', roughness: 0.8 });
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, c.sheetLength + 3), board);
      mesh.position.set(side * (c.sheetHalfWidth + 0.06), 0.075, 3 - (c.sheetLength + 3) / 2);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    const end = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, 0.15, 0.12), board);
    end.position.set(0, 0.075, -c.sheetLength - 0.06);
    end.castShadow = true;
    this.scene.add(end);

    // The hack: the foothold the thrower pushes off from.
    const hack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: '#2b2f36' }));
    hack.position.set(0, 0.02, 0);
    this.scene.add(hack);
  }

  /** A grey granite stone with a handle in the team's colour. */
  private buildStone(team: number): THREE.Group {
    const c = TUNING.curling;
    const r = c.stoneRadius;
    const g = new THREE.Group();
    const granite = new THREE.MeshStandardMaterial({ color: '#8a9099', roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, r * 0.55, 32), granite);
    body.position.y = r * 0.275;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.92, r * 0.18, 32), granite);
    top.position.y = r * 0.64;
    const colour = new THREE.MeshStandardMaterial({ color: c.teamColours[team], roughness: 0.35 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.5, r * 0.12, 24), colour);
    cap.position.y = r * 0.78;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(r * 0.25, r * 0.2, r * 0.9), colour);
    handle.position.set(0, r * 0.92, r * 0.15);
    for (const m of [body, top, cap, handle]) {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }
}
