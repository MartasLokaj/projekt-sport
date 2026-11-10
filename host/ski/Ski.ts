import * as THREE from 'three';
import type { PlayerInfo, SkiCue } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { lookOf } from '../game/character.ts';
import { Course } from './course.ts';
import { Racer, type RacerEvent, type RacerInput } from './racer.ts';

// Skiing, phase S2a (SKI.md): one racer on a real run. The phone is a steering wheel (S1, approved) with TUCK and
// JUMP buttons. Start gate with a 3-2-1 countdown, a winding run with rollers, kickers, gates, tree islands and
// rocks, crashes, the finish line and the time (best time per player while the page is open).
// The race starts when the steering phone has pressed Ready (or a Mac key is pressed). Graybox look until S3.
// Mac keyboard for testing: ← → steer, ↓ tuck, hold Space and let go to jump, Enter races again, R restarts.

export type SkiHud = {
  info: HTMLElement;
  debug: HTMLElement;
  timer: HTMLElement;
  big: HTMLElement;
};

/** The last steering a phone sent. */
type Wheel = { playerId: string; steer: number; roll: number; ready: boolean; tuck: boolean; jump: boolean; at: number };
type Phase = 'waiting' | 'countdown' | 'racing' | 'finished';

const STEP = 1 / 120;
/** The racer waits this far above the start gate. */
const START_D = -6;

/** 72.4 → "1:12.4". */
export function formatTime(seconds: number): string {
  const tenths = Math.floor(seconds * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

/** Little white snow puffs (crash, landing, jump). */
class Puffs {
  private readonly items: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; size: number }[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, count = 48) {
    const geometry = new THREE.IcosahedronGeometry(0.5, 1);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, velocity: new THREE.Vector3(), life: 0, size: 1 });
    }
  }

  burst(at: THREE.Vector3, count: number, size: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const item = this.items[this.next++ % this.items.length];
      item.mesh.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * size, Math.random() * 0.3, (Math.random() - 0.5) * size));
      item.velocity.set((Math.random() - 0.5) * spread, 0.5 + Math.random() * spread * 0.6, (Math.random() - 0.5) * spread);
      item.life = 1;
      item.size = size * (0.6 + Math.random() * 0.6);
      item.mesh.visible = true;
    }
  }

  update(dt: number): void {
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= dt * 1.4;
      item.velocity.y -= 2 * dt;
      item.mesh.position.addScaledVector(item.velocity, dt);
      const material = item.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, item.life) * 0.85;
      item.mesh.scale.setScalar(item.size * (1.6 - item.life * 0.6));
      if (item.life <= 0) item.mesh.visible = false;
    }
  }
}

export class Ski {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  private readonly course = new Course();
  private readonly racer = new Racer();
  private readonly puffs: Puffs;

  private phase: Phase = 'waiting';
  /** Countdown seconds left, then race seconds since GO. */
  private countdown = 0;
  private raceTime = 0;
  private goShownFor = 0;
  private accumulator = 0;
  private keySteer = 0;
  private wheel: Wheel | null = null;
  private players: PlayerInfo[] = [];
  /** Best time per player name (while the page is open). */
  private readonly best = new Map<string, number>();
  private lastResult = '';
  private crashes = 0;
  private lastCarveCue = 0;
  private readonly keys = new Set<string>();
  /** Camera: smoothed direction (degrees) and height. */
  private cameraYaw = 0;
  private cameraY = 0;
  private readonly cameraLook = new THREE.Vector3();
  private introLeft = 0;
  private running = false;
  private frameMs = 16.7;
  private workMs = 0;
  private lastHud = 0;

  /** A cue for the steering player's phone (vibration, "GO!", the finish time). */
  onCue: ((playerId: string, cue: SkiCue, time?: number) => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly hud: SkiHud,
  ) {
    const c = TUNING.ski;
    this.camera = new THREE.PerspectiveCamera(c.camera.fov, 1, 0.1, 600);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TUNING.scenery.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#cfe6ff');
    this.scene.fog = new THREE.Fog('#cfe6ff', 90, 330);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#9db8dd', 1.5));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const shadow = this.sun.shadow.camera;
    shadow.left = shadow.bottom = -32;
    shadow.right = shadow.top = 32;
    shadow.near = 1;
    shadow.far = 200;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.course.build(this.renderer), this.racer.group);
    this.puffs = new Puffs(this.scene);
  }

  // ---------- Public ----------

  /** Opens the race: the racer waits at the start gate. */
  start(): void {
    this.reset();
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
  onPhoneSteer(playerId: string, steer: number, roll: number, ready: boolean, tuck: boolean, jump: boolean): void {
    const now = performance.now();
    const current = this.wheel;
    const free = !current || current.playerId === playerId || now - current.at > TUNING.ski.silentMs || (ready && !current.ready);
    if (free) this.wheel = { playerId, steer, roll, ready, tuck, jump, at: now };
  }

  /** "Race again" on a phone (only after the finish). */
  again(playerId: string): void {
    if (this.phase === 'finished' && this.wheel?.playerId === playerId) this.reset();
  }

  // ---------- Race ----------

  private reset(): void {
    this.racer.body.reset(this.course, START_D);
    this.phase = 'waiting';
    this.raceTime = 0;
    this.goShownFor = 0;
    this.crashes = 0;
    this.accumulator = 0;
    this.lastResult = '';
    this.hud.big.hidden = true;
    for (const gate of this.course.gates) if (gate.flags) (gate.flags.userData.flag as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    this.racer.update(0, this.course);
    this.cameraYaw = this.course.direction(START_D);
    this.cameraY = this.racer.body.y + TUNING.ski.camera.height;
    this.placeCamera(true, 0);
  }

  private startCountdown(): void {
    if (this.phase !== 'waiting') return;
    this.phase = 'countdown';
    this.countdown = TUNING.ski.countdownSeconds;
  }

  private cue(cue: SkiCue, time?: number): void {
    const id = this.activeWheel()?.playerId;
    if (id) this.onCue?.(id, cue, time);
  }

  private input(): RacerInput {
    const wheel = this.activeWheel();
    const key = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    const keyed = key !== 0 || this.keySteer !== 0;
    return {
      steer: keyed ? this.keySteer : wheel?.ready ? wheel.steer : 0,
      tuck: this.keys.has('ArrowDown') || (wheel?.tuck ?? false),
      jump: this.keys.has(' ') || (wheel?.jump ?? false),
    };
  }

  private frame(): void {
    const started = performance.now();
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    const c = TUNING.ski;
    this.frameMs += (raw * 1000 - this.frameMs) * 0.05;

    const key = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    this.keySteer = moveTowards(this.keySteer, key, dt / c.keySeconds);
    const wheel = this.activeWheel();
    const player = wheel ? this.players.find((p) => p.id === wheel.playerId) : undefined;
    this.racer.setLook(player ? lookOf(player) : null);

    if (this.phase === 'waiting' && wheel?.ready && this.introLeft <= 0) this.startCountdown();
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.goShownFor = 0.8;
        this.cue('go');
      }
    }

    const events: RacerEvent[] = [];
    if (this.phase === 'racing' || this.phase === 'finished') {
      const input = this.input();
      this.accumulator += dt;
      while (this.accumulator >= STEP) {
        this.racer.body.step(STEP, input, this.course, this.raceTime, events);
        if (this.phase === 'racing') this.raceTime += STEP;
        this.accumulator -= STEP;
      }
    } else {
      // Waiting at the gate: the skis still turn with the steering, so the player sees it works.
      this.racer.body.steer = this.input().steer;
    }
    this.handleEvents(events);
    this.goShownFor = Math.max(0, this.goShownFor - dt);

    this.racer.update(dt, this.course);
    this.course.showAround(this.racer.body.d);
    this.puffs.update(dt);
    this.fadeGates(dt);
    this.placeSun();
    this.placeCamera(false, dt);
    this.renderer.render(this.scene, this.camera);
    this.workMs += (performance.now() - started - this.workMs) * 0.05;
    this.renderHud(wheel, player?.name ?? null);
  }

  private handleEvents(events: RacerEvent[]): void {
    const b = this.racer.body;
    const feet = this.racer.group.position;
    for (const event of events) {
      if (event === 'crash') {
        this.crashes++;
        this.puffs.burst(feet, 14, 1.4, 4);
        this.cue('crash');
      } else if (event === 'land_big') {
        this.puffs.burst(feet, 10, 1.1, 3);
        this.cue('land_big');
      } else if (event === 'land') {
        this.puffs.burst(feet, 4, 0.7, 2);
      } else if (event === 'jump') {
        this.puffs.burst(feet, 4, 0.6, 1.5);
      } else if (event === 'gate') {
        const gate = this.course.gates.filter((g) => g.d <= b.d).at(-1);
        if (gate?.flags) (gate.flags.userData.flag as THREE.MeshStandardMaterial).emissiveIntensity = 1;
        this.cue('gate');
      } else if (event === 'finish') this.finish();
    }
    const now = performance.now();
    if (this.phase === 'racing' && !b.air && b.turnRate > TUNING.ski.carveCueRate && now - this.lastCarveCue > TUNING.ski.carveCueMs) {
      this.lastCarveCue = now;
      this.cue('carve');
    }
  }

  private finish(): void {
    const time = this.racer.body.finishTime ?? this.raceTime;
    this.phase = 'finished';
    const name = this.activeWheel() ? (this.players.find((p) => p.id === this.activeWheel()!.playerId)?.name ?? 'Phone') : 'Mac';
    const before = this.best.get(name);
    const record = before === undefined || time < before;
    if (record) this.best.set(name, time);
    this.lastResult = before === undefined ? `Finished! ${formatTime(time)}` : record ? `New best! ${formatTime(time)}` : `${formatTime(time)} · Best ${formatTime(before)}`;
    this.cue('finish', Math.round(time * 1000));
  }

  /** The phone steering now, or null if none sent anything lately. */
  private activeWheel(): Wheel | null {
    const wheel = this.wheel;
    return wheel && performance.now() - wheel.at <= TUNING.ski.silentMs ? wheel : null;
  }

  private fadeGates(dt: number): void {
    for (const gate of this.course.gates) {
      const flag = gate.flags?.userData.flag as THREE.MeshStandardMaterial | undefined;
      if (flag && flag.emissiveIntensity > 0) flag.emissiveIntensity = Math.max(0, flag.emissiveIntensity - dt * 1.5);
    }
  }

  /** The sun (and its shadow box) follows the skier. */
  private placeSun(): void {
    const at = this.racer.group.position;
    this.sun.target.position.copy(at);
    this.sun.position.copy(at).add(new THREE.Vector3(40, 55, 10));
  }

  /** Low behind the skier, turning between the run's direction and the skis'; further back and wider at speed. */
  private placeCamera(snap: boolean, dt: number): void {
    const cam = TUNING.ski.camera;
    const b = this.racer.body;
    const yaw = this.course.direction(b.d) + (b.heading - this.course.direction(b.d)) * cam.followSkis;
    const blend = snap ? 1 : 1 - Math.exp(-cam.follow * dt);
    this.cameraYaw += (yaw - this.cameraYaw) * blend;
    const a = THREE.MathUtils.degToRad(this.cameraYaw);
    const back = cam.back + cam.backPerSpeed * b.speed;
    let x = b.x - Math.sin(a) * back;
    let d = b.d - Math.cos(a) * back;
    let height = cam.height;
    if (this.introLeft > 0) {
      this.introLeft = Math.max(0, this.introLeft - dt);
      const k = this.introLeft / TUNING.transition.swoopSeconds;
      const ease = k * k * (3 - 2 * k);
      height += TUNING.transition.swoopHeight * ease;
      x -= Math.sin(a) * TUNING.transition.swoopBack * ease;
      d -= Math.cos(a) * TUNING.transition.swoopBack * ease;
    }
    // Follow the skier's height smoothly (not every bump), never below the ground.
    const yTarget = b.y + height;
    this.cameraY = snap ? yTarget : this.cameraY + (yTarget - this.cameraY) * (1 - Math.exp(-6 * dt));
    const y = Math.max(this.cameraY, this.course.height(x, d) + 1.2);
    this.camera.position.set(x, y, -d);
    const lx = b.x + Math.sin(a) * cam.lookAhead;
    const ld = b.d + Math.cos(a) * cam.lookAhead;
    this.cameraLook.set(lx, Math.min(b.y, this.course.height(lx, ld)) + 0.8, -ld);
    this.camera.lookAt(this.cameraLook);
    const fov = cam.fov + cam.fovPerSpeed * b.speed;
    if (Math.abs(fov - this.camera.fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private renderHud(wheel: Wheel | null, name: string | null): void {
    // The countdown and GO are shown every frame (they change quickly), the rest ten times a second.
    const big = this.phase === 'countdown' ? String(Math.ceil(this.countdown)) : this.goShownFor > 0 ? 'GO!' : this.phase === 'finished' ? this.lastResult : '';
    this.hud.big.hidden = big === '';
    if (this.hud.big.textContent !== big) this.hud.big.textContent = big;
    this.hud.big.classList.toggle('result', this.phase === 'finished');
    const now = performance.now();
    if (now - this.lastHud < 100) return;
    this.lastHud = now;
    const b = this.racer.body;
    this.hud.timer.textContent = formatTime(this.phase === 'finished' ? (b.finishTime ?? this.raceTime) : this.raceTime);
    this.hud.info.textContent =
      this.phase === 'waiting'
        ? !wheel
          ? 'Press Ready on your phone · Mac: Space'
          : wheel.ready
            ? `${name} is ready`
            : `${name}: press Ready on the phone`
        : this.phase === 'countdown'
          ? 'Get ready…'
          : this.phase === 'finished'
            ? `Race again: Enter or the phone's button`
            : `${name ?? 'Mac'} is racing`;
    const signed = (n: number): string => `${n > 0 ? '+' : ''}${n}`;
    this.hud.debug.textContent = [
      `Speed        ${Math.round(b.speed * 3.6)} km/h`,
      `Phone tilt   ${wheel?.ready ? `${signed(Math.round(wheel.roll))}°` : '–'}`,
      `Steering     ${signed(Math.round(b.steer * 100))} %${b.tuck ? '  TUCK' : ''}${b.crouch > 0 ? '  JUMP…' : ''}`,
      `Gates        ${b.gatesPassed}/${this.course.gates.length}`,
      `Crashes      ${this.crashes}`,
      `Frame        ${this.frameMs.toFixed(1)} ms (work ${this.workMs.toFixed(1)} ms)`,
    ].join('\n');
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
      if (e.repeat) return;
      if (this.phase === 'waiting' && this.introLeft <= 0) {
        this.startCountdown();
        if (e.key === ' ') return; // (Space started the race; it is not a jump)
      }
      this.keys.add(e.key);
    } else if (e.key === 'Enter' && this.phase === 'finished') this.reset();
    else if (e.key === 'r' || e.key === 'R') this.reset();
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
