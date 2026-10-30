import * as THREE from 'three';
import { SKIN_TONES, type PlayerInfo } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { Character } from '../game/character.ts';
import { buildCourt, buildRacket, buildShuttle } from './court.ts';
import { findContact, makeShot, type Contact, type Flight, type ShotKind } from './shuttle.ts';

// Badminton prototype (phase B2): one player against the computer, full screen, camera behind the player.
// The characters run to the shuttle by themselves; the player only swings the phone.
// - Timing: the swing must come within hitWindowMs of the moment the racket meets the shuttle
//   (judged with the phone's exact hit time, so Wi-Fi delay does not matter). Closer = better shot.
// - Aim: the direction of the swing (left / straight / right).
// - Shot type comes from where the character meets the shuttle: at the back overhead (a clear, or a
//   smash when hit hard), high at the front a smash, low an underhand lift.
// - Rally scoring: every rally gives a point, the winner serves, first to pointsToWin.
// Mac keyboard for testing: Space swings (hold ← or → to aim), Enter plays again after a match.

type Side = 1 | -1; // 1 = the player (near half, z > 0), -1 = the computer
type Stroke = Contact['stroke'];

type Athlete = {
  side: Side;
  /** Moves around the court and faces the net; bob makes the running bounce. */
  wrapper: THREE.Group;
  bob: THREE.Group;
  character: Character;
  target: THREE.Vector3;
  /** Must be at the target by then (host clock), or null for "no hurry". */
  deadline: number | null;
  /** World x of the racket hand relative to the body: +1 or -1. */
  handSign: number;
  runPhase: number;
  /** A jump to meet a high shuttle: how high (m) and when it peaks (host clock). */
  jump: { height: number; peak: number } | null;
  /** Swing animation: which stroke and when it started. */
  swing: { stroke: Stroke | 'serve'; start: number } | null;
  pose: { x: number; z: number };
};

export type BadmintonHud = {
  score: HTMLElement;
  message: HTMLElement;
  feedback: HTMLElement;
};

type Phase = 'serve' | 'rally' | 'point' | 'over';

const READY_POSE = { x: -0.5, z: -0.35 };
/** Racket arm while the shuttle comes: up and back for overhead, back and low for a lift, out to the side for a drive. */
const WINDUP: Record<Stroke, { x: number; z: number }> = {
  overhead: { x: -3.4, z: -0.3 },
  smash: { x: -3.4, z: -0.3 },
  drive: { x: 0.9, z: -1.3 },
  lift: { x: 1.0, z: -0.3 },
};

export class Badminton {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly shuttle = buildShuttle();
  private readonly shadow: THREE.Mesh;
  private readonly player: Athlete;
  private readonly cpu: Athlete;
  private playerName = 'You';
  private running = false;

  private phase: Phase = 'serve';
  private server: Side = 1;
  private score = { player: 0, cpu: 0 };
  private flight: Flight | null = null;
  /** Who the shuttle is flying to, and where/when they meet it. */
  private receiver: Side = -1;
  private contact: Contact | null = null;
  /** The receiver's hit has been decided (hit, or missed). */
  private decided = false;
  private pointEndsAt = 0;
  private cpuServeAt = 0;
  private feedbackUntil = 0;
  private readonly keys = new Set<string>();

  constructor(
    private readonly container: HTMLElement,
    private readonly hud: BadmintonHud,
  ) {
    const cfg = TUNING.badminton;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TUNING.scenery.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(cfg.skyColour);
    this.scene.fog = new THREE.Fog(cfg.skyColour, 30, 70);
    this.scene.add(new THREE.HemisphereLight('#e6f4ff', '#d9c08a', 1.3));
    const sun = new THREE.DirectionalLight('#fff0d4', 2.4);
    sun.position.set(6, 14, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
    this.scene.add(sun, buildCourt());

    this.camera = new THREE.PerspectiveCamera(cfg.cameraFov, 1, 0.1, 200);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.09, 16),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shuttle.scale.setScalar(cfg.shuttleScale);
    this.shadow.scale.setScalar(cfg.shuttleScale);
    this.scene.add(this.shuttle, this.shadow);

    this.player = this.makeAthlete(1, { shirt: '#ff5a5f', skin: SKIN_TONES[1], handedness: 'right' });
    this.cpu = this.makeAthlete(-1, { shirt: '#9b5cff', skin: SKIN_TONES[3], handedness: 'right' });
  }

  // ---------- Public ----------

  /** Starts a new match for this player (null = keyboard only). */
  start(player: PlayerInfo | null): void {
    this.setPlayer(player);
    this.score = { player: 0, cpu: 0 };
    this.server = 1;
    this.startServe();
    this.snapAthletes();
    if (this.running) return;
    this.running = true;
    this.onResize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  /** The player's look (colour, skin, hand) and name, e.g. after they edited their profile. */
  setPlayer(player: PlayerInfo | null): void {
    this.playerName = player?.name ?? 'You';
    const handedness = player?.handedness ?? 'right';
    this.player.character.setLook({ shirt: player?.colour ?? '#ff5a5f', skin: player?.skinTone ?? SKIN_TONES[1], handedness: 'right' });
    // A left-handed player is the mirror image; the racket hand then is on the other side.
    const s = TUNING.badminton.characterScale;
    this.player.wrapper.scale.set(handedness === 'left' ? -s : s, s, s);
    this.player.handSign = handedness === 'left' ? -1 : 1;
    this.renderScore();
  }

  /** A swing from the phone. at = the exact hit time (server clock = this Mac's clock), power 0..100, aim -1..1. */
  onSwing(at: number, power: number, aim: number): void {
    const cfg = TUNING.badminton;
    const now = Date.now();
    if (this.phase === 'serve' && this.server === 1) {
      this.serve(this.player, now, power, aim);
      return;
    }
    if (this.phase !== 'rally' || this.receiver !== 1 || this.decided || !this.contact) return;
    const off = at - this.contact.time;
    this.player.swing = { stroke: this.contact.stroke, start: now };
    if (off < -cfg.hitWindowEarlyMs) {
      this.showFeedback(`Too early! (${Math.round(-off)} ms)`);
      return;
    }
    if (off > cfg.hitWindowMs) {
      this.showFeedback(`Too late! (${Math.round(off)} ms)`);
      this.miss();
      return;
    }
    const size = Math.abs(off);
    const window = off < 0 ? cfg.hitWindowEarlyMs : cfg.hitWindowMs;
    const quality = size <= cfg.perfectMs ? 1 : 1 - (size - cfg.perfectMs) / (window - cfg.perfectMs);
    const kind = this.hit(this.player, power, aim, quality);
    const verdict = quality >= 1 ? 'Perfect!' : `Good · ${Math.round(size)} ms ${off < 0 ? 'early' : 'late'}`;
    this.showFeedback(`${shotName(kind)} · ${verdict}`);
  }

  // ---------- Rally ----------

  private startServe(): void {
    this.phase = 'serve';
    this.flight = null;
    this.contact = null;
    this.decided = false;
    const serverScore = this.server === 1 ? this.score.player : this.score.cpu;
    // Even score: serve from the right service court, odd: from the left (right = +x for the player, -x for the computer).
    const x = this.server * (serverScore % 2 === 0 ? 1 : -1) * 0.9;
    const server = this.athlete(this.server);
    const other = this.athlete(-this.server as Side);
    this.moveTo(server, new THREE.Vector3(x, 0, this.server * 2.6), null);
    this.moveTo(other, new THREE.Vector3(-x, 0, -this.server * TUNING.badminton.homeDepth), null);
    this.cpuServeAt = Date.now() + TUNING.badminton.cpu.serveDelayMs;
    this.hud.message.textContent = this.server === 1 ? 'Your serve: swing to serve!' : 'CPU serves';
    this.hud.message.hidden = false;
  }

  private serve(server: Athlete, now: number, power: number, aim: number): void {
    const cfg = TUNING.badminton;
    const from = this.handPosition(server, cfg.serveHeight);
    server.swing = { stroke: 'serve', start: now };
    // Diagonally across: into the receiver's service court on the other side of the centre line.
    const across = -Math.sign(server.target.x || 1);
    const range: [number, number] = across > 0 ? [0.25, cfg.courtHalfWidth - 0.25] : [-cfg.courtHalfWidth + 0.25, -0.25];
    this.launch(makeShot('serve', from, server.side, aim, power / 100, 0.7, now, range), server.side);
    this.hud.message.hidden = true;
    this.phase = 'rally';
  }

  /** The athlete meets the shuttle at the contact point. Returns the shot played. */
  private hit(athlete: Athlete, power: number, aim: number, quality: number): ShotKind {
    const cfg = TUNING.badminton;
    const contact = this.contact!;
    const kind: ShotKind =
      contact.stroke === 'lift' || contact.stroke === 'drive'
        ? contact.stroke
        : contact.stroke === 'smash' || power >= cfg.smashPower
          ? 'smash'
          : 'clear';
    this.decided = true;
    // The shuttle never slows down to wait for the phone: when the swing's message arrives a moment after
    // the hit, the return shot starts from where the shuttle is by then.
    const now = Date.now();
    const late = this.flight !== null && now > contact.time;
    const from = late ? this.flight!.positionAt(this.flight!.progressAt(now)) : contact.position;
    this.launch(makeShot(kind, from, athlete.side, aim, power / 100, quality, late ? now : contact.time), athlete.side);
    return kind;
  }

  /** A new flight from `hitter`'s side: the other side runs to meet it, the hitter goes back home. */
  private launch(flight: Flight, hitter: Side): void {
    const cfg = TUNING.badminton;
    this.flight = flight;
    this.receiver = -hitter as Side;
    const receiver = this.athlete(this.receiver);
    this.contact = findContact(flight, this.receiver, receiver.wrapper.position, Date.now());
    this.decided = false;
    const spot = this.contact.position.clone();
    spot.x -= receiver.handSign * cfg.reach[this.contact.stroke];
    spot.y = 0;
    this.moveTo(receiver, spot, this.contact.time - cfg.jumpRiseMs - 60);
    const jump = this.contact.position.y - cfg.standingReach;
    receiver.jump = jump > 0 ? { height: jump, peak: this.contact.time } : null;
    const hitterAthlete = this.athlete(hitter);
    this.moveTo(hitterAthlete, new THREE.Vector3(0, 0, hitter * cfg.homeDepth), null);
  }

  /** Nobody hits it: the shuttle just flies on and lands. */
  private miss(): void {
    this.decided = true;
    this.contact = null;
  }

  private cpuTurn(now: number): void {
    const cfg = TUNING.badminton.cpu;
    const contact = this.contact!;
    const incomingSmash = this.flight?.kind === 'smash';
    this.cpu.swing = { stroke: contact.stroke, start: now };
    if (Math.random() > (incomingSmash ? cfg.smashReturnChance : cfg.hitChance)) {
      this.miss();
      return;
    }
    let power = cfg.power[0] + Math.random() * (cfg.power[1] - cfg.power[0]);
    if (contact.stroke === 'overhead') power = Math.random() < cfg.smashChance ? Math.max(power, TUNING.badminton.smashPower + 5) : Math.min(power, TUNING.badminton.smashPower - 5);
    this.hit(this.cpu, power, Math.random() * 1.6 - 0.8, 0.5 + Math.random() * 0.5);
  }

  private pointTo(winner: Side): void {
    if (winner === 1) this.score.player++;
    else this.score.cpu++;
    this.server = winner;
    this.renderScore();
    const won = Math.max(this.score.player, this.score.cpu) >= TUNING.badminton.pointsToWin;
    this.phase = won ? 'over' : 'point';
    this.pointEndsAt = Date.now() + TUNING.badminton.pointPauseMs;
    this.hud.message.textContent = won
      ? `${winner === 1 ? `${this.playerName} wins!` : 'CPU wins!'} ${this.score.player} : ${this.score.cpu}\nEnter: play again · Esc: back to the cube`
      : winner === 1
        ? 'Point to you!'
        : 'Point to CPU';
    this.hud.message.hidden = false;
    this.athlete(winner).character.play('cheer');
    this.athlete(-winner as Side).character.play('slump');
  }

  // ---------- Frame ----------

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = Date.now();
    const cfg = TUNING.badminton;

    if (this.phase === 'serve' && this.server === -1 && now >= this.cpuServeAt) {
      const c = cfg.cpu;
      this.serve(this.cpu, now, c.power[0] + Math.random() * (c.power[1] - c.power[0]), Math.random() * 1.6 - 0.8);
    } else if (this.phase === 'rally' && this.flight) {
      if (!this.decided && this.contact) {
        if (this.receiver === -1 && now >= this.contact.time) this.cpuTurn(now);
        else if (this.receiver === 1 && now > this.contact.time + cfg.hitWindowMs + cfg.lateGraceMs) {
          this.showFeedback('Missed!');
          this.miss();
        }
      }
      // The shuttle hit the ground: the receiver missed it.
      if (this.decided && !this.contact && this.flight.progressAt(now) >= 1) this.pointTo(-this.receiver as Side);
    } else if (this.phase === 'point' && now >= this.pointEndsAt) {
      this.startServe();
    }

    this.updateShuttle(now);
    for (const a of [this.player, this.cpu]) this.updateAthlete(a, now, dt);
    this.updateCamera(dt);
    if (now > this.feedbackUntil) this.hud.feedback.hidden = true;
    this.renderer.render(this.scene, this.camera);
  }

  private updateShuttle(now: number): void {
    let position: THREE.Vector3;
    let direction: THREE.Vector3;
    if (this.phase === 'serve' || !this.flight) {
      position = this.handPosition(this.athlete(this.server), TUNING.badminton.serveHeight);
      direction = new THREE.Vector3(0, 1, 0);
    } else {
      const u = Math.min(1, this.flight.progressAt(now));
      position = this.flight.positionAt(u);
      direction = position.clone().sub(this.flight.positionAt(u - 0.01));
      if (u >= 1) direction.set(1, -0.2, 0); // lying on the sand
    }
    this.shuttle.position.copy(position);
    if (direction.lengthSq() > 1e-8) this.shuttle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize().negate());
    this.shadow.position.set(position.x, 0.02, position.z);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.3 / (1 + position.y * 0.5);
  }

  private updateAthlete(a: Athlete, now: number, dt: number): void {
    const cfg = TUNING.badminton;
    // Run towards the target, fast enough to get there in time.
    const toTarget = a.target.clone().sub(a.wrapper.position).setY(0);
    const distance = toTarget.length();
    if (distance > 0.02) {
      const timeLeft = a.deadline === null ? 1 : Math.max(0.05, (a.deadline - now) / 1000);
      const speed = Math.min(cfg.maxRunSpeed, Math.max(cfg.runSpeed, distance / timeLeft));
      a.wrapper.position.addScaledVector(toTarget.normalize(), Math.min(distance, speed * dt));
      a.runPhase += dt * 14;
      a.bob.position.y = Math.abs(Math.sin(a.runPhase)) * 0.07;
    } else {
      a.bob.position.y *= 0.8;
    }
    // Jumping up to meet a high shuttle: up, at the top when the racket meets it, then down.
    let lift = 0;
    if (a.jump) {
      const t = (now - a.jump.peak) / cfg.jumpRiseMs;
      if (t > 1) a.jump = null;
      else if (t > -1) lift = a.jump.height * (1 - t * t);
    }
    a.wrapper.position.y = lift;

    // Racket arm: swing animation, or winding up while the shuttle comes, or ready.
    let pose = READY_POSE;
    if (a.swing && now - a.swing.start < 450) {
      const t = Math.min(1, (now - a.swing.start) / 140);
      const stroke = a.swing.stroke;
      const [from, to] = stroke === 'lift' || stroke === 'serve' ? [1.0, -2.3] : stroke === 'drive' ? [0.9, -1.5] : [-3.4, -0.4];
      pose = { x: from + (to - from) * easeOut(t), z: stroke === 'drive' ? -1.3 : -0.3 };
      a.pose = pose;
    } else {
      if (a.swing) a.swing = null;
      const waiting = this.phase === 'rally' && !this.decided && this.contact && this.receiver === a.side;
      if (waiting && this.contact!.time - now < 600) pose = WINDUP[this.contact!.stroke];
      else if (this.phase === 'serve' && this.server === a.side) pose = { x: 0.9, z: -0.3 };
      const k = Math.min(1, dt * 12);
      a.pose = { x: a.pose.x + (pose.x - a.pose.x) * k, z: a.pose.z + (pose.z - a.pose.z) * k };
    }
    a.character.armPose = a.pose;
    a.character.update(dt);
  }

  private updateCamera(dt: number): void {
    const cfg = TUNING.badminton;
    const x = this.player.wrapper.position.x;
    const want = new THREE.Vector3(x * 0.5, cfg.cameraHeight, cfg.courtHalfLength + cfg.cameraBack);
    this.camera.position.lerp(want, Math.min(1, dt * 3));
    this.camera.lookAt(x * 0.25, 1, cfg.cameraLookAt);
  }

  // ---------- Helpers ----------

  private makeAthlete(side: Side, look: { shirt: string; skin: string; handedness: 'right' | 'left' }): Athlete {
    const s = TUNING.badminton.characterScale;
    const character = new Character(look, { putter: false });
    character.handArm.add(buildRacket(side === 1 ? '#ff8a3d' : '#00a6ed'));
    const bob = new THREE.Group();
    bob.add(character.root);
    const wrapper = new THREE.Group();
    wrapper.add(bob);
    wrapper.scale.setScalar(s);
    // The character model faces +z: the player turns round to face the net.
    wrapper.rotation.y = side === 1 ? Math.PI : 0;
    this.scene.add(wrapper);
    wrapper.traverse((o) => (o.castShadow = true));
    return {
      side,
      wrapper,
      bob,
      character,
      target: new THREE.Vector3(0, 0, side * TUNING.badminton.homeDepth),
      deadline: null,
      // The character's right hand is on its local -x side: +x in the world when facing -z, -x when facing +z.
      handSign: side === 1 ? 1 : -1,
      runPhase: 0,
      jump: null,
      swing: null,
      pose: { ...READY_POSE },
    };
  }

  private athlete(side: Side): Athlete {
    return side === 1 ? this.player : this.cpu;
  }

  private moveTo(a: Athlete, target: THREE.Vector3, deadline: number | null): void {
    const cfg = TUNING.badminton;
    a.target.set(
      THREE.MathUtils.clamp(target.x, -cfg.courtHalfWidth - 0.5, cfg.courtHalfWidth + 0.5),
      0,
      a.side * THREE.MathUtils.clamp(Math.abs(target.z), 0.6, cfg.courtHalfLength + 0.8),
    );
    a.deadline = deadline;
  }

  private snapAthletes(): void {
    for (const a of [this.player, this.cpu]) a.wrapper.position.copy(a.target);
  }

  /** Where the athlete's racket hand holds the shuttle (for serving). */
  private handPosition(a: Athlete, height: number): THREE.Vector3 {
    return a.wrapper.position.clone().add(new THREE.Vector3(a.handSign * 0.45, height, -a.side * 0.3));
  }

  private showFeedback(text: string): void {
    this.hud.feedback.textContent = text;
    this.hud.feedback.hidden = false;
    this.feedbackUntil = Date.now() + 1400;
  }

  private renderScore(): void {
    this.hud.score.textContent = `${this.playerName} ${this.score.player} : ${this.score.cpu} CPU`;
  }

  private readonly onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key);
    if (e.key === ' ' && !e.repeat) {
      e.preventDefault();
      const aim = (this.keys.has('ArrowRight') ? 0.7 : 0) - (this.keys.has('ArrowLeft') ? 0.7 : 0);
      this.onSwing(Date.now(), TUNING.badminton.keyPower, aim);
    } else if (e.key === 'Enter' && this.phase === 'over') {
      this.score = { player: 0, cpu: 0 };
      this.server = 1;
      this.renderScore();
      this.startServe();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key);
  };
}

function shotName(kind: ShotKind): string {
  return { serve: 'Serve', clear: 'Clear', lift: 'Lift', drive: 'Drive', smash: 'Smash!' }[kind];
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
