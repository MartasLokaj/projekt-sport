import * as THREE from 'three';
import { SKIN_TONES, type PlayerInfo } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { Character } from '../game/character.ts';
import { buildCourt, buildRacket, buildShuttle } from './court.ts';
import { findContact, makeShot, type Contact, type Flight, type ShotKind } from './shuttle.ts';

// Badminton (phases B2–B3): two sides of the net, each played by a phone or by the computer.
// One phone: the player against the computer, full screen, camera behind the player.
// Two phones: split screen, the first player on the left half (near side of the net), the second on the
// right half (far side); each half has its own camera behind its own character, so the shuttle always
// flies towards the player looking at it.
// The characters run to the shuttle by themselves; the players only swing their phones.
// - Timing: the swing must come within the hit window around the moment the racket meets the shuttle
//   (judged with the phone's exact hit time, so Wi-Fi delay does not matter). Closer = better shot.
// - Aim: the direction of the swing (left / straight / right).
// - Shot type comes from where the character meets the shuttle (see findContact).
// - Rally scoring: every rally gives a point, the winner serves, first to pointsToWin.
// Mac keyboard for testing: Space swings for the near player (hold ← or → to aim), ↑ swings for the
// far player, Enter plays again after a match.

/** 1 = the near side of the net (z > 0), -1 = the far side. */
export type Side = 1 | -1;
type Stroke = Contact['stroke'];

type Athlete = {
  side: Side;
  /** A phone's player, or null for the computer. */
  human: boolean;
  name: string;
  /** Moves around the court and faces the net; bob makes the running bounce. */
  wrapper: THREE.Group;
  bob: THREE.Group;
  character: Character;
  camera: THREE.PerspectiveCamera;
  feedback: HTMLElement;
  feedbackUntil: number;
  target: THREE.Vector3;
  /** Must be at the target by then (host clock), or null for "no hurry". */
  deadline: number | null;
  /** World x of the racket hand relative to the body: +1 or -1. */
  handSign: number;
  runPhase: number;
  /** A jump to meet a high shuttle: how high (m), when it peaks (host clock) and how long it takes to go up (ms). */
  jump: { height: number; peak: number; rise: number } | null;
  /** Swing animation: which stroke and when it started. */
  swing: { stroke: Stroke | 'serve'; start: number } | null;
  pose: { x: number; z: number };
  score: number;
};

export type BadmintonHud = {
  /** The whole badminton screen: gets the class "split" for two players. */
  screen: HTMLElement;
  score: HTMLElement;
  message: HTMLElement;
  /** Shot feedback for the near player (left half, or centre with one player) and the far player (right half). */
  feedbackNear: HTMLElement;
  feedbackFar: HTMLElement;
};

type Phase = 'serve' | 'rally' | 'point' | 'over';

const READY_POSE = { x: -0.5, z: -0.35 };
/** Racket arm while the shuttle comes: up and back for overhead, back and low for a lift, out to the side for a drive. */
const WINDUP: Record<Stroke, { x: number; z: number }> = {
  overhead: { x: -3.4, z: -0.3 },
  drive: { x: 0.9, z: -1.3 },
  lift: { x: 1.0, z: -0.3 },
};

export class Badminton {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly clock = new THREE.Clock();
  private readonly shuttle = buildShuttle();
  private readonly shadow: THREE.Mesh;
  private readonly near: Athlete;
  private readonly far: Athlete;
  private running = false;

  private phase: Phase = 'serve';
  private server: Side = 1;
  private flight: Flight | null = null;
  /** Who the shuttle is flying to, and where/when they meet it. */
  private receiver: Side = -1;
  private contact: Contact | null = null;
  /** The receiver's hit has been decided (hit, or missed). */
  private decided = false;
  /** A hit waiting for the top of the character's jump. */
  private pendingHit: { when: number; athlete: Athlete; kind: ShotKind; power: number; aim: number; quality: number } | null = null;
  private pointEndsAt = 0;
  private cpuServeAt = 0;
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
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 45 });
    this.scene.add(sun, buildCourt());

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.09, 16),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shuttle.scale.setScalar(cfg.shuttleScale);
    this.shadow.scale.setScalar(cfg.shuttleScale);
    this.scene.add(this.shuttle, this.shadow);

    this.near = this.makeAthlete(1, hud.feedbackNear);
    this.far = this.makeAthlete(-1, hud.feedbackFar);
  }

  // ---------- Public ----------

  /** Starts a new match: near = the first phone's player, far = the second phone's player or null for the computer. */
  start(near: PlayerInfo | null, far: PlayerInfo | null): void {
    this.setPlayers(near, far);
    this.newMatch();
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

  /** The players' looks (colour, skin, hand) and names, e.g. after someone edited their profile. */
  setPlayers(near: PlayerInfo | null, far: PlayerInfo | null): void {
    this.setLook(this.near, near, true);
    this.setLook(this.far, far, far !== null);
    this.hud.screen.classList.toggle('split', this.far.human);
    this.onResize();
    this.renderScore();
  }

  /**
   * A swing from the phone playing `side`. at = the exact hit time (server clock = this Mac's clock),
   * power 0..100, aim -1..1.
   */
  onSwing(side: Side, at: number, power: number, aim: number): void {
    const cfg = TUNING.badminton;
    const a = this.athlete(side);
    if (!a.human) return;
    const now = Date.now();
    if (this.phase === 'serve' && this.server === side) {
      this.serve(a, now, power, aim);
      return;
    }
    if (this.phase !== 'rally' || this.receiver !== side || this.decided || !this.contact || !this.flight) return;
    const off = at - this.contact.time;
    // The character only jumps with the player's own swing, as high as the shuttle is at that moment:
    // swing early and it jumps (and may miss), swing late and the shuttle is lower, so it stays on the ground.
    const there = this.flight.positionAt(this.flight.progressAt(at));
    const stroke = strokeAt(there.y);
    const jump = Math.min(cfg.reachHeight, there.y) - cfg.standingReach;
    a.jump = jump > 0 ? { height: jump, peak: now + cfg.swingJumpRiseMs, rise: cfg.swingJumpRiseMs } : null;
    a.swing = { stroke, start: now + (jump > 0 ? cfg.swingJumpRiseMs - 140 : 0) };
    if (off < -cfg.hitWindowEarlyMs) {
      this.showFeedback(a, `Too early! (${Math.round(-off)} ms)`);
      return;
    }
    if (off > cfg.hitWindowMs) {
      this.showFeedback(a, `Too late! (${Math.round(off)} ms)`);
      this.miss();
      return;
    }
    const size = Math.abs(off);
    const window = off < 0 ? cfg.hitWindowEarlyMs : cfg.hitWindowMs;
    const quality = size <= cfg.perfectMs ? 1 : 1 - (size - cfg.perfectMs) / (window - cfg.perfectMs);
    const kind = this.hit(a, power, aim, quality, stroke, jump > 0 ? now + cfg.swingJumpRiseMs : now);
    const verdict = quality >= 1 ? 'Perfect!' : `Good · ${Math.round(size)} ms ${off < 0 ? 'early' : 'late'}`;
    this.showFeedback(a, `${shotName(kind)} · ${verdict}`);
  }

  // ---------- Rally ----------

  private newMatch(): void {
    this.near.score = 0;
    this.far.score = 0;
    this.server = 1;
    this.renderScore();
    this.startServe();
  }

  private startServe(): void {
    this.phase = 'serve';
    this.flight = null;
    this.contact = null;
    this.decided = false;
    this.pendingHit = null;
    const server = this.athlete(this.server);
    const other = this.athlete(-this.server as Side);
    // Even score: serve from the right service court, odd: from the left (right = +x for the near side, -x for the far side).
    const x = this.server * (server.score % 2 === 0 ? 1 : -1) * 0.9;
    this.moveTo(server, new THREE.Vector3(x, 0, this.server * TUNING.badminton.serveDepth), null);
    this.moveTo(other, new THREE.Vector3(-x, 0, -this.server * TUNING.badminton.homeDepth), null);
    this.cpuServeAt = Date.now() + TUNING.badminton.cpu.serveDelayMs;
    this.hud.message.textContent = server.human ? `${server.name}: swing to serve!` : `${server.name} serves`;
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

  /**
   * The athlete hits the shuttle with this stroke at time `when` (host clock; for a jump, at the top of it).
   * The return shot starts from wherever the shuttle is then: the shuttle never slows down to wait.
   */
  private hit(athlete: Athlete, power: number, aim: number, quality: number, stroke: Stroke, when: number): ShotKind {
    const cfg = TUNING.badminton;
    const there = this.flight!.positionAt(this.flight!.progressAt(when));
    // A smash only from the back of the court; elsewhere a hard overhead is a clear.
    const back = Math.abs(there.z) >= cfg.smashFromDepth;
    const kind: ShotKind = stroke !== 'overhead' ? stroke : back && power >= cfg.smashPower ? 'smash' : 'clear';
    this.decided = true;
    this.pendingHit = { when, athlete, kind, power, aim, quality };
    if (when <= Date.now()) this.launchPendingHit();
    return kind;
  }

  private launchPendingHit(): void {
    const p = this.pendingHit!;
    this.pendingHit = null;
    const from = this.flight!.positionAt(this.flight!.progressAt(p.when));
    this.launch(makeShot(p.kind, from, p.athlete.side, p.aim, p.power / 100, p.quality, p.when), p.athlete.side);
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
    // The computer jumps by itself; a player's character only jumps with the player's swing (see onSwing).
    const jump = this.contact.position.y - cfg.standingReach;
    receiver.jump = jump > 0 && !receiver.human ? { height: jump, peak: this.contact.time, rise: cfg.jumpRiseMs } : null;
    this.moveTo(this.athlete(hitter), new THREE.Vector3(0, 0, hitter * cfg.homeDepth), null);
  }

  /** Nobody hits it: the shuttle just flies on and lands. */
  private miss(): void {
    this.decided = true;
    this.contact = null;
  }

  private cpuTurn(cpu: Athlete, now: number): void {
    const cfg = TUNING.badminton.cpu;
    const contact = this.contact!;
    const incomingSmash = this.flight?.kind === 'smash';
    cpu.swing = { stroke: contact.stroke, start: now };
    if (Math.random() > (incomingSmash ? cfg.smashReturnChance : cfg.hitChance)) {
      this.miss();
      return;
    }
    let power = cfg.power[0] + Math.random() * (cfg.power[1] - cfg.power[0]);
    if (contact.stroke === 'overhead') {
      const smashPower = TUNING.badminton.smashPower;
      power = Math.random() < cfg.smashChance ? Math.max(power, smashPower + 5) : Math.min(power, smashPower - 5);
    }
    this.hit(cpu, power, (Math.random() * 2 - 1) * cfg.aimRange, 0.5 + Math.random() * 0.5, contact.stroke, now);
  }

  private pointTo(winner: Side): void {
    const w = this.athlete(winner);
    const loser = this.athlete(-winner as Side);
    w.score++;
    this.server = winner;
    this.renderScore();
    const cfg = TUNING.badminton;
    const won = w.score >= cfg.pointsToWin && w.score - loser.score >= cfg.winBy;
    this.phase = won ? 'over' : 'point';
    this.pointEndsAt = Date.now() + cfg.pointPauseMs;
    const gamePoint = w.score >= cfg.pointsToWin - 1 && w.score - loser.score >= cfg.winBy - 1;
    const tied = w.score === loser.score && w.score >= cfg.pointsToWin - 1;
    this.hud.message.textContent = won
      ? `${w.name} wins! ${this.near.score} : ${this.far.score}\nEnter: play again · Esc: back to the cube`
      : `Point to ${w.name}!${tied ? '\nDeuce: win by 2' : gamePoint ? '\nGame point!' : ''}`;
    this.hud.message.hidden = false;
    w.character.play('cheer');
    loser.character.play('slump');
  }

  // ---------- Frame ----------

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = Date.now();
    const cfg = TUNING.badminton;

    const server = this.athlete(this.server);
    if (this.phase === 'serve' && !server.human && now >= this.cpuServeAt) {
      const c = cfg.cpu;
      this.serve(server, now, c.power[0] + Math.random() * (c.power[1] - c.power[0]), (Math.random() * 2 - 1) * c.aimRange);
    } else if (this.phase === 'rally' && this.flight) {
      if (this.pendingHit && now >= this.pendingHit.when) this.launchPendingHit();
      if (!this.decided && this.contact) {
        const receiver = this.athlete(this.receiver);
        if (!receiver.human && now >= this.contact.time) this.cpuTurn(receiver, now);
        else if (receiver.human && now > this.contact.time + cfg.hitWindowMs + cfg.lateGraceMs) {
          this.showFeedback(receiver, 'Missed!');
          this.miss();
        }
      }
      // The shuttle hit the ground: the receiver missed it.
      if (this.decided && !this.contact && this.flight.progressAt(now) >= 1) this.pointTo(-this.receiver as Side);
    } else if (this.phase === 'point' && now >= this.pointEndsAt) {
      this.startServe();
    }

    this.updateShuttle(now);
    for (const a of [this.near, this.far]) {
      this.updateAthlete(a, now, dt);
      if (now > a.feedbackUntil) a.feedback.hidden = true;
    }
    this.render(dt);
  }

  /** One player: full screen from behind the near player. Two: left half near player, right half far player. */
  private render(dt: number): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.updateCamera(this.near, dt);
    if (!this.far.human) {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.render(this.scene, this.near.camera);
      return;
    }
    this.updateCamera(this.far, dt);
    const half = Math.floor(w / 2);
    this.renderer.setScissorTest(true);
    for (const [a, x, width] of [
      [this.near, 0, half],
      [this.far, half, w - half],
    ] as const) {
      this.renderer.setViewport(x, 0, width, h);
      this.renderer.setScissor(x, 0, width, h);
      this.renderer.render(this.scene, a.camera);
    }
    this.renderer.setScissorTest(false);
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
    } else if (this.phase === 'rally' && this.receiver !== a.side) {
      // Ready on the toes while the other side plays.
      a.runPhase += dt * cfg.readyBouncesPerSecond * Math.PI;
      a.bob.position.y = Math.abs(Math.sin(a.runPhase)) * cfg.readyBounce;
    } else {
      a.bob.position.y *= 0.8;
    }
    // Jumping up to meet a high shuttle: up, at the top when the racket meets it, then down.
    let lift = 0;
    if (a.jump) {
      const t = (now - a.jump.peak) / a.jump.rise;
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
      // Racket ready as the shuttle comes: the computer just before its hit, a player as soon as the shuttle
      // crosses into their half (so the racket does not give away the moment to swing).
      const coming = a.human ? Math.sign(this.shuttle.position.z) === a.side : this.contact !== null && this.contact.time - now < 600;
      if (waiting && coming) pose = WINDUP[this.contact!.stroke];
      else if (this.phase === 'serve' && this.server === a.side) pose = { x: 0.9, z: -0.3 };
      const k = Math.min(1, dt * 12);
      a.pose = { x: a.pose.x + (pose.x - a.pose.x) * k, z: a.pose.z + (pose.z - a.pose.z) * k };
    }
    a.character.armPose = a.pose;
    a.character.update(dt);
  }

  /** Behind the athlete's own baseline, looking down the court over the net. */
  private updateCamera(a: Athlete, dt: number): void {
    const cfg = TUNING.badminton;
    const split = this.far.human;
    const x = a.wrapper.position.x;
    const back = split ? cfg.splitCameraBack : cfg.cameraBack;
    const want = new THREE.Vector3(x * 0.5, cfg.cameraHeight, a.side * (cfg.courtHalfLength + back));
    a.camera.position.lerp(want, Math.min(1, dt * 3));
    a.camera.lookAt(x * 0.25, 1, a.side * cfg.cameraLookAt);
  }

  // ---------- Helpers ----------

  private makeAthlete(side: Side, feedback: HTMLElement): Athlete {
    const cfg = TUNING.badminton;
    const character = new Character({ shirt: '#9b5cff', skin: SKIN_TONES[3], handedness: 'right' }, { putter: false });
    character.handArm.add(buildRacket(side === 1 ? '#ff8a3d' : '#00a6ed'));
    const bob = new THREE.Group();
    bob.add(character.root);
    const wrapper = new THREE.Group();
    wrapper.add(bob);
    wrapper.scale.setScalar(cfg.characterScale);
    // The character model faces +z: the near player turns round to face the net.
    wrapper.rotation.y = side === 1 ? Math.PI : 0;
    this.scene.add(wrapper);
    wrapper.traverse((o) => (o.castShadow = true));
    const camera = new THREE.PerspectiveCamera(cfg.cameraFov, 1, 0.1, 200);
    camera.position.set(0, cfg.cameraHeight, side * (cfg.courtHalfLength + cfg.cameraBack));
    return {
      side,
      human: side === 1,
      name: side === 1 ? 'You' : 'CPU',
      wrapper,
      bob,
      character,
      camera,
      feedback,
      feedbackUntil: 0,
      target: new THREE.Vector3(0, 0, side * cfg.homeDepth),
      deadline: null,
      handSign: side === 1 ? 1 : -1,
      runPhase: 0,
      jump: null,
      swing: null,
      pose: { ...READY_POSE },
      score: 0,
    };
  }

  /** A phone's player (or the computer, when human is false) takes this side. */
  private setLook(a: Athlete, player: PlayerInfo | null, human: boolean): void {
    a.human = human;
    a.name = human ? (player?.name ?? (a.side === 1 ? 'You' : 'Player 2')) : 'CPU';
    const handedness = human ? (player?.handedness ?? 'right') : 'right';
    const shirt = human ? (player?.colour ?? (a.side === 1 ? '#ff5a5f' : '#00a6ed')) : '#9b5cff';
    const skin = human ? (player?.skinTone ?? SKIN_TONES[1]) : SKIN_TONES[3];
    a.character.setLook({ shirt, skin, handedness: 'right' });
    // A left-handed player is the mirror image, so the racket hand is on the other side.
    // The character's right hand is on its local -x side: +x in the world when facing -z (near side),
    // -x when facing +z (far side).
    const s = TUNING.badminton.characterScale;
    const left = handedness === 'left';
    a.wrapper.scale.set(left ? -s : s, s, s);
    a.handSign = (a.side === 1 ? 1 : -1) * (left ? -1 : 1);
  }

  private athlete(side: Side): Athlete {
    return side === 1 ? this.near : this.far;
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
    for (const a of [this.near, this.far]) a.wrapper.position.copy(a.target);
  }

  /** Where the athlete's racket hand holds the shuttle (for serving). */
  private handPosition(a: Athlete, height: number): THREE.Vector3 {
    return a.wrapper.position.clone().add(new THREE.Vector3(a.handSign * 0.45, height, -a.side * 0.3));
  }

  private showFeedback(a: Athlete, text: string): void {
    a.feedback.textContent = text;
    a.feedback.hidden = false;
    a.feedbackUntil = Date.now() + 1400;
  }

  private renderScore(): void {
    this.hud.score.textContent = `${this.near.name} ${this.near.score} : ${this.far.score} ${this.far.name}`;
  }

  private readonly onResize = (): void => {
    const cfg = TUNING.badminton;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const split = this.far.human;
    for (const a of [this.near, this.far]) {
      a.camera.aspect = (split ? w / 2 : w) / h;
      a.camera.fov = split ? cfg.splitCameraFov : cfg.cameraFov;
      a.camera.updateProjectionMatrix();
    }
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key);
    if (e.repeat) return;
    if (e.key === ' ') {
      e.preventDefault();
      const aim = (this.keys.has('ArrowRight') ? 0.7 : 0) - (this.keys.has('ArrowLeft') ? 0.7 : 0);
      this.onSwing(1, Date.now(), TUNING.badminton.keyPower, aim);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.onSwing(-1, Date.now(), TUNING.badminton.keyPower, 0);
    } else if (e.key === 'Enter' && this.phase === 'over') {
      this.newMatch();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key);
  };
}

/** Which stroke meets the shuttle at this height. */
function strokeAt(height: number): Stroke {
  const cfg = TUNING.badminton;
  return height >= cfg.overheadFrom ? 'overhead' : height >= cfg.driveFrom ? 'drive' : 'lift';
}

function shotName(kind: ShotKind): string {
  return { serve: 'Serve', clear: 'Clear', lift: 'Lift', drive: 'Drive', smash: 'Smash!' }[kind];
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
