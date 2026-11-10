import * as THREE from 'three';
import type { PlayerInfo } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { Character, lookOf, type CharacterLook } from '../game/character.ts';

// Skiing prototype (SKI.md, phase S1): only the steering. A plain white slope with a faint grid, grey boxes
// to steer round and one chibi on skis going downhill at a constant speed. The phone is held sideways like a
// steering wheel; its tilt (already turned into steering -1..1 on the phone) points the skis left or right
// of the straight line down. No crashes, no race yet: a touched box just turns red and is counted, so the
// player can judge how precise the steering is. A readout shows the tilt and the steering.
// Everything on the slope lives in one tilted group: x across, -z down the slope, in metres.
// Mac keyboard for testing: ← → steer.

export type SkiHud = {
  info: HTMLElement;
  debug: HTMLElement;
};

/** The last steering a phone sent. */
type Wheel = { playerId: string; steer: number; roll: number; ready: boolean; at: number };

const DEFAULT_LOOK: CharacterLook = { shirt: '#ff8a3d', skin: '#f3c79a', handedness: 'right' };
/** The character model is 0.9 tall; on the slope everything is in metres. */
const SKIER_SCALE = 2;
const GRID = 4;
const BOX_COLOUR = '#8d97a3';
const BOX_HIT_COLOUR = '#e5484d';

/** A steady pseudo-random number 0..1 for a whole number (the same boxes every run). */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class Ski {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  /** The tilted slope: x across, -z downhill. */
  private readonly slope = new THREE.Group();
  private readonly ground: THREE.Mesh;
  private readonly edges: THREE.Mesh[] = [];
  private readonly sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  /** The skier: `mover` turns with the skis, `leaner` tips into the turn. */
  private readonly mover = new THREE.Group();
  private readonly leaner = new THREE.Group();
  private readonly character = new Character(DEFAULT_LOOK, { putter: false });
  private readonly boxes: { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; key: string }[] = [];
  private readonly touched = new Set<string>();

  /** Where the skier is: metres across (+ = right) and metres down the slope. */
  private x = 0;
  private distance = 0;
  /** Steering now (-1..1, smoothed) and where the skis point (degrees right of straight down). */
  private steer = 0;
  private heading = 0;
  private keySteer = 0;
  private wheel: Wheel | null = null;
  private players: PlayerInfo[] = [];
  private lookKey = '';
  private readonly keys = new Set<string>();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly cameraLook = new THREE.Vector3();
  private introLeft = 0;
  private running = false;
  /** Smoothed time between frames and work per frame (milliseconds), for the readout. */
  private frameMs = 16.7;
  private workMs = 0;
  private lastDebug = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly hud: SkiHud,
  ) {
    const c = TUNING.ski;
    this.camera = new THREE.PerspectiveCamera(c.camera.fov, 1, 0.1, 400);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TUNING.scenery.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#cfe6ff');
    this.scene.fog = new THREE.Fog('#cfe6ff', 60, 190);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#9db8dd', 1.5));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const shadow = this.sun.shadow.camera;
    shadow.left = shadow.bottom = -30;
    shadow.right = shadow.top = 30;
    shadow.near = 1;
    shadow.far = 160;
    this.scene.add(this.sun, this.sun.target);

    this.slope.rotation.x = -THREE.MathUtils.degToRad(c.slopeDegrees);
    this.scene.add(this.slope);

    // Snow with a faint grid, so the speed and the turning can be seen. It moves with the skier in whole
    // grid steps, so the lines stay where they are.
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#c3d3e6';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const groundWidth = 240;
    const groundLength = 480;
    texture.repeat.set(groundWidth / GRID, groundLength / GRID);
    const groundGeometry = new THREE.PlaneGeometry(groundWidth, groundLength);
    groundGeometry.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
    this.ground.receiveShadow = true;
    this.slope.add(this.ground);

    // Blue lines at the slope's edges.
    for (const side of [-1, 1]) {
      const geometry = new THREE.PlaneGeometry(0.5, groundLength);
      geometry.rotateX(-Math.PI / 2);
      const edge = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#4d8fe0' }));
      edge.position.set(side * (c.halfWidth + 0.8), 0.02, 0);
      this.edges.push(edge);
      this.slope.add(edge);
    }

    // Two grey boxes per row; a row with one box hides the other.
    const boxGeometry = new THREE.BoxGeometry(c.boxSize, c.boxSize, c.boxSize);
    for (let i = 0; i < c.rowsAhead * 2; i++) {
      const material = new THREE.MeshStandardMaterial({ color: BOX_COLOUR, roughness: 0.8 });
      const mesh = new THREE.Mesh(boxGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.boxes.push({ mesh, material, key: '' });
      this.slope.add(mesh);
    }

    // The skier: the usual chibi, turned to face downhill, on two skis, leaning forwards a little.
    this.character.place(new THREE.Vector3(), Math.PI);
    this.character.legPose = { left: -0.25, right: -0.25 };
    this.character.armPose = { x: -0.5, z: 0.35 };
    const skiMaterial = new THREE.MeshStandardMaterial({ color: '#2b3a55', roughness: 0.5 });
    for (const side of [-1, 1]) {
      const ski = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.8), skiMaterial);
      ski.position.set(side * 0.09, 0.01, -0.06);
      ski.castShadow = true;
      this.leaner.add(ski);
    }
    const body = new THREE.Group();
    body.rotation.x = -0.18; // leaning forwards (downhill)
    body.position.y = 0.02;
    body.add(this.character.root);
    this.leaner.add(body);
    this.mover.add(this.leaner);
    this.mover.scale.setScalar(SKIER_SCALE);
    this.slope.add(this.mover);
  }

  // ---------- Public ----------

  /** Starts a fresh run from the top. */
  start(): void {
    this.x = 0;
    this.distance = 0;
    this.steer = this.heading = this.keySteer = 0;
    this.touched.clear();
    this.wheel = null;
    this.place();
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
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  setPlayers(players: PlayerInfo[]): void {
    this.players = players;
  }

  /**
   * A phone's steering (about 30 a second). One phone steers at a time: the one steering keeps the skier
   * until it goes silent, or until another phone is ready while this one is not.
   */
  onPhoneSteer(playerId: string, steer: number, roll: number, ready: boolean): void {
    const now = performance.now();
    const current = this.wheel;
    const free = !current || current.playerId === playerId || now - current.at > TUNING.ski.silentMs || (ready && !current.ready);
    if (free) this.wheel = { playerId, steer, roll, ready, at: now };
  }

  // ---------- Each frame ----------

  private frame(): void {
    const started = performance.now();
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    const c = TUNING.ski;
    this.frameMs += (raw * 1000 - this.frameMs) * 0.05;

    // Steering: the Mac keys while one is held (or still easing back), else the phone.
    const key = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    this.keySteer = moveTowards(this.keySteer, key, dt / c.keySeconds);
    const wheel = this.activeWheel();
    const target = key !== 0 || this.keySteer !== 0 ? this.keySteer : wheel?.ready ? wheel.steer : 0;
    this.steer += (target - this.steer) * (1 - Math.exp(-c.steerFollow * dt));
    this.heading += (this.steer * c.maxHeadingDeg - this.heading) * (1 - Math.exp(-c.headingResponse * dt));

    const h = THREE.MathUtils.degToRad(this.heading);
    this.x = THREE.MathUtils.clamp(this.x + Math.sin(h) * c.speed * dt, -c.halfWidth, c.halfWidth);
    this.distance += Math.cos(h) * c.speed * dt;

    this.updateLook(wheel);
    this.character.update(dt);
    this.place();
    this.placeBoxes();
    this.placeCamera(false, dt);
    this.renderer.render(this.scene, this.camera);
    this.workMs += (performance.now() - started - this.workMs) * 0.05;
    this.renderHud(wheel);
  }

  /** The phone that steers, or null if none sent anything lately. */
  private activeWheel(): Wheel | null {
    const wheel = this.wheel;
    return wheel && performance.now() - wheel.at <= TUNING.ski.silentMs ? wheel : null;
  }

  /** The skier looks like the player who steers. */
  private updateLook(wheel: Wheel | null): void {
    const player = wheel ? this.players.find((p) => p.id === wheel.playerId) : undefined;
    const key = player ? JSON.stringify([player.colour, player.skinTone, player.look]) : '';
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.character.setLook(player ? { ...lookOf(player), handedness: 'right' } : DEFAULT_LOOK);
    this.character.root.traverse((o) => (o.castShadow = true));
  }

  /** Puts the skier, the snow and the light where the skier is now. */
  private place(): void {
    const c = TUNING.ski;
    this.mover.position.set(this.x, 0, -this.distance);
    this.mover.rotation.y = -THREE.MathUtils.degToRad(this.heading);
    this.leaner.rotation.z = -THREE.MathUtils.degToRad(c.leanDeg) * this.steer;

    const z = -Math.round(this.distance / GRID) * GRID;
    this.ground.position.z = z - 150;
    for (const edge of this.edges) edge.position.z = z - 150;

    const at = this.mover.getWorldPosition(new THREE.Vector3());
    this.sun.target.position.copy(at);
    this.sun.position.copy(at).add(new THREE.Vector3(30, 50, 22));
  }

  /** The rows of boxes ahead (and just behind); each row is always in the same place. */
  private placeBoxes(): void {
    const c = TUNING.ski;
    const first = Math.max(0, Math.ceil((this.distance - 12 - c.firstRow) / c.rowSpacing));
    const reach = c.boxSize / 2 + 0.35;
    for (let row = first; row < first + c.rowsAhead; row++) {
      const along = c.firstRow + row * c.rowSpacing;
      const two = hash(row * 3 + 2) > 0.45;
      for (let k = 0; k < 2; k++) {
        const box = this.boxes[(row % c.rowsAhead) * 2 + k];
        const key = `${row}:${k}`;
        const across = (hash(row * 3 + k) * 2 - 1) * (c.halfWidth - 1);
        box.mesh.visible = k === 0 || two;
        box.mesh.position.set(across, c.boxSize / 2, -along);
        if (box.mesh.visible && Math.abs(this.x - across) < reach && Math.abs(this.distance - along) < reach) this.touched.add(key);
        if (box.key !== key) {
          box.key = key;
          box.material.color.set(BOX_COLOUR);
        }
        if (this.touched.has(key)) box.material.color.set(BOX_HIT_COLOUR);
      }
    }
  }

  /** Low and close behind the skier, looking down the slope; it stays level, so the slope looks downhill. */
  private placeCamera(snap: boolean, dt = 0): void {
    const cam = TUNING.ski.camera;
    const target = new THREE.Vector3(this.x * 0.85, cam.height, -this.distance + cam.back);
    const look = new THREE.Vector3(this.x, 1, -this.distance - cam.lookAhead);
    if (this.introLeft > 0) {
      this.introLeft = Math.max(0, this.introLeft - dt);
      const k = this.introLeft / TUNING.transition.swoopSeconds;
      const ease = k * k * (3 - 2 * k);
      target.y += TUNING.transition.swoopHeight * ease;
      target.z += TUNING.transition.swoopBack * ease;
    }
    this.slope.localToWorld(target);
    this.slope.localToWorld(look);
    // Down the slope the camera keeps up exactly; sideways it follows a little late, so turns can be felt.
    const blend = snap ? 1 : 1 - Math.exp(-cam.follow * dt);
    this.cameraPosition.x += (target.x - this.cameraPosition.x) * blend;
    this.cameraPosition.y = target.y;
    this.cameraPosition.z = target.z;
    this.cameraLook.x += (look.x - this.cameraLook.x) * blend;
    this.cameraLook.y = look.y;
    this.cameraLook.z = look.z;
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraLook);
  }

  private renderHud(wheel: Wheel | null): void {
    const now = performance.now();
    if (now - this.lastDebug < 100) return;
    this.lastDebug = now;
    const name = wheel ? (this.players.find((p) => p.id === wheel.playerId)?.name ?? 'Phone') : null;
    this.hud.info.textContent = !wheel
      ? 'Hold your phone sideways like a steering wheel and press Ready'
      : wheel.ready
        ? `${name} is steering`
        : `${name}: press Ready on the phone`;
    const signed = (n: number): string => `${n > 0 ? '+' : ''}${n}`;
    this.hud.debug.textContent = [
      `Phone tilt   ${wheel?.ready ? `${signed(Math.round(wheel.roll))}°` : '–'}`,
      `Steering     ${signed(Math.round(this.steer * 100))} %`,
      `Skis         ${signed(Math.round(this.heading))}°`,
      `Boxes hit    ${this.touched.size}`,
      `Frame        ${this.frameMs.toFixed(1)} ms (work ${this.workMs.toFixed(1)} ms)`,
    ].join('\n');
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      this.keys.add(e.key);
      e.preventDefault();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key);
  };

  private readonly onResize = (): void => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
}

/** Moves a value towards a target by at most `step`. */
function moveTowards(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}
