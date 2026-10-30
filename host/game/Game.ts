import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { BallResult, GameState, PlayerInfo, SwingProgress } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { applyCurve, applyRollingResistance, createBall, curveFromTwist, shotSpeed } from './ball.ts';
import { buildCourse, HOLE_1, isInCup, type HoleDef } from './course.ts';
import { DistancePreview } from './preview.ts';

// Phase 2: one graybox hole for 1–4 players. The host owns the ball physics; the server decides
// whose turn it is and counts strokes (see syncState). Each player has their own ball: the current
// player's ball is the physical one, the others wait as see-through "ghost" balls.
// The current player's aim, live swing, practice swings and strokes come in through the onPhone… methods.
// Every shot starts aimed straight ahead, where the camera looks (at the tee: down the lane).
// The phone's aim angle turns it from there. A white line shows the aim; while the player swings,
// the gauge on the left climbs and the white line stretches to show roughly how far the ball would roll.
// Mac keyboard for testing: arrow keys aim, hold P for a practice swing, hold Space to hit.

/** waiting = between turns (nobody may hit). */
type State = 'waiting' | 'aiming' | 'rolling' | 'holed';

type PlayerBall = {
  name: string;
  colour: string;
  strokes: number;
  done: boolean;
  /** Taking part in the current match (people who joined later only watch). */
  inMatch: boolean;
  /** Where the ball rests (null = still on the tee) and which way the camera faced then. */
  pos: THREE.Vector3 | null;
  yaw: number | null;
  ghost: THREE.Mesh;
};
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
  private readonly aimStripe: THREE.Mesh;
  private readonly distancePreview: DistancePreview;
  private readonly clock = new THREE.Clock();

  private hole: HoleDef = HOLE_1;
  private state: State = 'waiting';
  private readonly players = new Map<string, PlayerBall>();
  /** Whose ball is on the course right now. */
  private active: string | null = null;
  private lastTurn = -1;
  private lastPhase: GameState['phase'] = 'lobby';
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
  /** Rough rolling distance of the current or practice swing, shown as the aim line's length (null = default length). */
  private estimate: number | null = null;
  private estimateCache = { power: -1, curve: 0, distance: 0 };

  /** Called when the current player's ball stopped, dropped in or went out of bounds. */
  onBallResult: ((result: BallResult) => void) | null = null;
  /** Called when the Mac keyboard hits (testing without a phone). */
  onLocalStroke: (() => void) | null = null;

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

    // White aim line: a flat stripe from the ball straight ahead. Its length is set every frame.
    this.aimStripe = new THREE.Mesh(
      new THREE.PlaneGeometry(TUNING.aimLine.width, 1),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }),
    );
    this.aimStripe.rotation.x = -Math.PI / 2;
    this.aimLine.add(this.aimStripe);
    this.scene.add(this.aimLine);

    this.resetBall(this.teePosition());
    this.baseYaw = THREE.MathUtils.degToRad(this.hole.teeYaw);
    this.followDir.set(Math.sin(this.baseYaw), 0, Math.cos(this.baseYaw));
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

  /** Names and colours of everyone who joined (from the lobby). */
  setPlayers(list: PlayerInfo[]): void {
    for (const info of list) {
      let player = this.players.get(info.id);
      if (!player) {
        const ghost = new THREE.Mesh(
          new THREE.SphereGeometry(TUNING.ball.radius, 24, 12),
          new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.55, roughness: 0.4 }),
        );
        ghost.visible = false;
        this.scene.add(ghost);
        player = { name: info.name, colour: info.colour, strokes: 0, done: false, inMatch: false, pos: null, yaw: null, ghost };
        this.players.set(info.id, player);
      }
      player.name = info.name;
      player.colour = info.colour;
      (player.ghost.material as THREE.MeshStandardMaterial).color.set(info.colour);
    }
    this.updateGhosts();
    this.updateInfo();
  }

  /** The match changed on the server: new round, new turn, strokes or finished players. */
  syncState(game: GameState): void {
    if (game.phase === 'playing' && this.lastPhase !== 'playing') this.resetRound();
    this.lastPhase = game.phase;
    for (const player of this.players.values()) player.inMatch = false;
    for (const entry of game.players) {
      const player = this.players.get(entry.id);
      if (!player) continue;
      player.inMatch = true;
      player.strokes = entry.strokes;
      player.done = entry.done !== null;
    }
    if (game.phase === 'playing' && game.turn !== this.lastTurn && game.current) {
      this.lastTurn = game.turn;
      this.startTurn(game.current);
    } else if (game.phase !== 'playing') {
      this.lastTurn = game.turn;
      this.state = 'waiting';
      this.active = null;
    }
    this.updateGhosts();
    this.updateInfo();
  }

  /** Everyone back to the tee, before a new round. */
  private resetRound(): void {
    for (const player of this.players.values()) {
      player.pos = null;
      player.yaw = null;
      player.done = false;
      player.strokes = 0;
    }
    this.active = null;
    this.state = 'waiting';
    this.resetBall(this.teePosition());
    this.updateGhosts();
  }

  private startTurn(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    this.active = id;
    this.resetBall(player.pos ?? this.teePosition());
    (this.ballMesh.material as THREE.MeshStandardMaterial).color.set(player.colour);
    this.ballMesh.visible = true;
    this.beginShot(player.yaw ?? THREE.MathUtils.degToRad(this.hole.teeYaw));
  }

  private teePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.hole.tee.x, 0, this.hole.tee.z);
  }

  /** See-through balls for everyone who is not playing right now and has not finished. */
  private updateGhosts(): void {
    for (const [id, player] of this.players) {
      const show = player.inMatch && this.lastPhase === 'playing' && id !== this.active && !player.done;
      player.ghost.visible = show;
      const at = player.pos ?? this.teePosition();
      player.ghost.position.set(at.x, TUNING.ball.radius, at.z);
    }
  }

  onPhoneAim(angle: number): void {
    this.phoneAngle = angle;
  }

  /** The phone is in the middle of a swing: move the gauge and the line's length live. */
  onPhoneSwingProgress(progress: SwingProgress): void {
    if (this.state !== 'aiming') return;
    if (progress.phase === 'cancelled') {
      this.showPracticeResult();
      return;
    }
    const label = progress.practice ? 'Practice' : 'Swing';
    this.setGauge(progress.phase === 'ready' ? `${label}!` : label, progress.power);
    this.showEstimate(progress.power, 0);
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

  /** A new shot, aimed straight ahead along `yaw` (down the lane at the tee, else where the camera last looked). */
  private beginShot(yaw: number): void {
    this.state = 'aiming';
    this.baseYaw = yaw;
    this.phoneAngle = 0;
    this.keyboardOffset = 0;
    this.practiceResult = null;
    this.estimate = null;
    this.hud.gauge.hidden = true;
    this.updateInfo();
  }

  /** The ball is done moving: remember where it is and tell the server. */
  private finishTurn(result: BallResult): void {
    const player = this.active ? this.players.get(this.active) : undefined;
    if (player && result !== 'holed') {
      const p = this.ball.translation();
      player.pos = new THREE.Vector3(p.x, 0, p.z);
      player.yaw = this.cameraYaw();
    }
    this.state = 'waiting';
    this.hud.gauge.hidden = true;
    this.onBallResult?.(result);
  }

  private practice(power: number, curve: number): void {
    this.practiceResult = { power, curve };
    this.showPracticeResult();
  }

  private showPracticeResult(): void {
    if (this.practiceResult) {
      this.setGauge('Practice', this.practiceResult.power);
      this.showEstimate(this.practiceResult.power, this.practiceResult.curve);
    } else {
      this.hud.gauge.hidden = true;
      this.estimate = null;
    }
  }

  private shoot(power: number, curve: number): void {
    const yaw = this.aimYaw();
    const speed = shotSpeed(power);
    this.ball.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true);
    this.followDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.curve = curve;
    this.state = 'rolling';
    this.restTime = 0;
    this.estimate = null;
    this.setGauge('Hit', power);
  }

  private checkBall(dt: number): void {
    if (this.state !== 'rolling') return;
    const p = this.ball.translation();
    if (isInCup(p, this.hole)) {
      this.holed();
      return;
    }
    if (p.y < TUNING.physics.outOfBoundsY) {
      this.showMessage('Out of bounds! +1', 1800);
      this.resetBall(this.lastRest);
      this.finishTurn('out');
      return;
    }

    const v = this.ball.linvel();
    const cup = this.hole.cup;
    const toCupX = cup.x - p.x;
    const toCupZ = cup.z - p.z;
    const toCup = Math.hypot(toCupX, toCupZ);
    if (p.y > 0 && toCup > 0.01 && toCup < TUNING.course.tapInRadius && Math.hypot(v.x, v.z) < TUNING.course.tapInSpeed) {
      // Extremely close and slow: steer it into the cup instead of stopping right at the edge.
      const speed = Math.max(0.5, Math.hypot(v.x, v.z));
      this.ball.setLinvel({ x: (toCupX / toCup) * speed, y: v.y, z: (toCupZ / toCup) * speed }, true);
      this.restTime = 0;
      return;
    }
    if (Math.hypot(v.x, v.y, v.z) < TUNING.ball.restSpeed) {
      this.restTime += dt * 1000;
      if (this.restTime >= TUNING.ball.restTimeMs) {
        this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.lastRest.set(p.x, 0, p.z);
        this.finishTurn('rest');
      }
    } else {
      this.restTime = 0;
    }
  }

  private holed(): void {
    this.state = 'holed';
    const player = this.active ? this.players.get(this.active) : undefined;
    const strokes = player?.strokes ?? 0;
    const diff = strokes - this.hole.par;
    const name =
      strokes === 1 ? 'HOLE IN ONE!' : ({ [-2]: 'Eagle!', [-1]: 'Birdie!', 0: 'Par', 1: 'Bogey' } as Record<number, string>)[diff];
    const strokesText = `${strokes} stroke${strokes === 1 ? '' : 's'}`;
    const who = player ? `${player.name}: ` : '';
    this.showMessage(`${who}${name ?? 'In the hole!'}\n${strokesText}`, TUNING.rules.holedPauseMs);
    window.setTimeout(() => {
      this.ballMesh.visible = false;
      this.finishTurn('holed');
    }, TUNING.rules.holedPauseMs);
  }

  /** Shows a short message, e.g. when the server picked up a player's ball. */
  announce(text: string): void {
    this.showMessage(text, 2000);
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
        this.showEstimate(power, 0);
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
    // The line starts just in front of the ball and is as long as the rough rolling distance.
    const start = TUNING.ball.radius * 1.6;
    const length = Math.max(0.05, (this.estimate ?? TUNING.aimLine.length) - start);
    this.aimStripe.scale.y = length;
    this.aimStripe.position.set(0, 0.012, start + length / 2);
  }

  /** Sets the aim line to roughly how far a shot with this power and curve would roll (on open ground, ignoring walls). */
  private showEstimate(power: number, curve: number): void {
    const cache = this.estimateCache;
    if (Math.abs(power - cache.power) > 0.2 || curve !== cache.curve) {
      const end = this.distancePreview.predict(power, curve);
      this.estimateCache = { power, curve, distance: Math.hypot(end.x, end.z) };
    }
    // At the very start of a swing (no power yet) the line shrinks, then grows with the backswing.
    this.estimate = power > 0 ? this.estimateCache.distance : 0;
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
    const player = this.active ? this.players.get(this.active) : undefined;
    const turn = player && this.state !== 'waiting' ? ` · ${player.name}: ${player.strokes} stroke${player.strokes === 1 ? '' : 's'}` : '';
    this.hud.info.textContent = `Hole ${this.hole.number} · Par ${this.hole.par}${turn}`;
    this.hud.info.style.borderLeft = player ? `10px solid ${player.colour}` : '';
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
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') this.keysTurning = 0;
    else if ((e.key === ' ' || e.key === 'p' || e.key === 'P') && this.charging) {
      const { kind, amount } = this.charging;
      this.charging = null;
      if (this.state !== 'aiming') return;
      const power = Math.max(1, Math.round(amount * 100));
      if (kind === 'hit') {
        this.onLocalStroke?.();
        this.shoot(power, 0);
      } else {
        this.practice(power, 0);
      }
    }
  };
}
