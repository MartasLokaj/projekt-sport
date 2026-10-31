import * as THREE from 'three';
import { SKIN_TONES, type PlayerInfo } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { Character } from '../game/character.ts';
import { buildCourt, buildRacket, buildShuttle } from './court.ts';
import { SandPuffs, Trail } from './effects.ts';
import type { BadmintonCue } from '../../shared/protocol.ts';
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
// - SHORT button on the phone (Shift on the Mac): a drop shot just over the net, or a short serve.
// - A bad hit (too weak, timing outside the Good part, or a stretch) becomes a slow, wobbly "wobble" shot with
//   a wavy trail: the other side's chance. Only a swing far too late makes the character dive and fall in the
//   sand; it needs recoveryMs to get up. (The computer falls when it misses.)
// - Super Smash: a strong, well-timed, high hit on a wobble, from anywhere. The fastest shot; a chain of them in
//   one rally gets faster; returning one has a tighter window. A strong but badly timed try makes you fall.
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
  /** Diving and lying in the sand: when it started and which way (world, flat). Can't move or hit until busyUntil. */
  down: { start: number; dir: THREE.Vector3; landed: boolean } | null;
  busyUntil: number;
  /** Timing text above the head, and until when it shows. */
  pop: HTMLElement;
  popUntil: number;
  /** The racket's materials (they glow gold after a Perfect hit) and until when it glows. */
  racketMaterials: THREE.MeshStandardMaterial[];
  glowUntil: number;
  /** The rally in which this player last got a tip, so tips stay rare. */
  lastTipRally: number;
};

export type BadmintonHud = {
  /** The whole badminton screen: gets the class "split" for two players. */
  screen: HTMLElement;
  score: HTMLElement;
  message: HTMLElement;
  /** Shot feedback for the near player (left half, or centre with one player) and the far player (right half). */
  feedbackNear: HTMLElement;
  feedbackFar: HTMLElement;
  /** A white flash over the whole screen (class "on" plays it), for a Super Smash. */
  flash: HTMLElement;
  /** Timing text that pops up above each player's own character (near, far). */
  popNear: HTMLElement;
  popFar: HTMLElement;
  /** "CPU: Normal" next to the score, in a match against the computer. */
  level: HTMLElement;
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
  /** Super Smashes so far in this rally (each next one is faster), and whether the last one's landing burst played. */
  private superChain = 0;
  /** Rallies played so far (for spacing out the tips). */
  private rallies = 0;
  /** The computer's difficulty (keys 1 / 2 / 3). */
  private level: keyof typeof TUNING.badminton.cpuLevels = TUNING.badminton.cpuLevel;
  private landedFx = false;
  private shakeUntil = 0;
  /** The last missed contact (who and when), so a very late swing arriving after the miss can still dive. */
  private missedContact: { side: Side; time: number } | null = null;
  /** A hit waiting for the top of the character's jump. */
  private pendingHit: {
    /** When the racket meets the shuttle; it shoots off at `when` (later for a Super Smash's hit-stop). */
    contactAt: number;
    when: number;
    athlete: Athlete;
    kind: ShotKind;
    power: number;
    aim: number;
    quality: number;
    extraScatter: number;
    netChance: number;
  } | null = null;
  private pointEndsAt = 0;
  private cpuServeAt = 0;
  private readonly keys = new Set<string>();
  private readonly trail = new Trail();
  private readonly puffs = new SandPuffs(TUNING.badminton.sandColour);
  /** Tells a phone something (e.g. "Smash chance!"); set by host/main.ts. */
  onCue: ((side: Side, cue: BadmintonCue) => void) | null = null;

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
    this.scene.add(this.shuttle, this.shadow, this.trail.mesh, this.puffs.group);

    this.near = this.makeAthlete(1, hud.feedbackNear, hud.popNear);
    this.far = this.makeAthlete(-1, hud.feedbackFar, hud.popFar);
  }

  // ---------- Public ----------

  /**
   * Starts a new match: near = the first phone's player, far = the second phone's player or null for the
   * computer, which plays at `level` (chosen in the lobby; keys 1 2 3 still change it during the match).
   */
  start(near: PlayerInfo | null, far: PlayerInfo | null, level: keyof typeof TUNING.badminton.cpuLevels = this.level): void {
    this.level = level;
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
  onSwing(side: Side, at: number, power: number, aim: number, short = false): void {
    const cfg = TUNING.badminton;
    const a = this.athlete(side);
    if (!a.human) return;
    const now = Date.now();
    if (this.phase === 'serve' && this.server === side) {
      this.serve(a, now, power, aim, short);
      return;
    }
    if (now < a.busyUntil) return; // still lying in the sand
    // A swing that arrives after the miss was already called: if it was really late, the character still dives.
    const missed = this.missedContact;
    if (missed && missed.side === side && at - missed.time > cfg.veryLateMs && at - missed.time < 1200) {
      this.missedContact = null;
      this.lateMiss(a, now, at - missed.time);
      return;
    }
    if (this.phase !== 'rally' || this.receiver !== side || this.decided || !this.contact || !this.flight) return;
    const contact = this.contact;
    const off = at - contact.time;
    const { early, late } = this.hitWindow();
    // A strong overhead swing at a wobble is a Super Smash try: badly timed, the character falls.
    const there = this.flight.positionAt(this.flight.progressAt(at));
    const superTry = this.flight.kind === 'wobble' && !short && power >= cfg.superSmashPower && strokeAt(there.y) === 'overhead';
    if (superTry && contact.reach !== 'dive' && (off < -early || off > late)) {
      this.showPop(a, `Super Smash missed! (${Math.round(Math.abs(off))} ms ${off < 0 ? 'early' : 'late'})`);
      this.tip(a, off < 0 ? 'early' : 'late');
      this.dive(a, now, contact.position);
      this.miss();
      return;
    }
    if (off < -(early + cfg.earlyWobbleMs)) {
      // Far too early: a swing at the air, then swing again.
      a.swing = { stroke: contact.stroke, start: now };
      this.showPop(a, `Too early! (${Math.round(-off)} ms)`);
      this.tip(a, 'early');
      return;
    }
    if (contact.reach === 'none') {
      this.showPop(a, 'Out of reach!');
      this.miss();
      return;
    }
    if (off > late) {
      this.lateMiss(a, now, off);
      return;
    }
    // Only just reachable, or a little too early: a stretch that just catches it, as a wobble shot.
    if (contact.reach === 'dive' || off < -early) {
      a.swing = { stroke: contact.stroke, start: now };
      this.hit(a, power, aim, 0.3, contact.stroke, now, false, true);
      this.showPop(a, contact.reach === 'dive' ? 'Stretch! · Wobble' : `Wobble · ${Math.round(-off)} ms early`);
      return;
    }
    // The character only jumps with the player's own swing, as high as the shuttle is at that moment:
    // swing early and it jumps (and may miss), swing late and the shuttle is lower, so it stays on the ground.
    const stroke = strokeAt(there.y);
    const jump = Math.min(cfg.reachHeight, there.y) - cfg.standingReach;
    a.jump = jump > 0 ? { height: jump, peak: now + cfg.swingJumpRiseMs, rise: cfg.swingJumpRiseMs } : null;
    a.swing = { stroke, start: now + (jump > 0 ? cfg.swingJumpRiseMs - 140 : 0) };
    const size = Math.abs(off);
    const window = off < 0 ? early : late;
    const perfect = Math.min(cfg.perfectMs, window * 0.6);
    const quality = size <= perfect ? 1 : 1 - (size - perfect) / (window - perfect);
    // A hit outside the Good part of the window, or a weak swing (not a drop), wobbles.
    const offGood = off < -Math.min(cfg.goodEarlyMs, early * 0.8) || off > Math.min(cfg.goodLateMs, late * 0.8);
    const weak = !short && power < cfg.wobblePower;
    const when = jump > 0 ? now + cfg.swingJumpRiseMs : now;
    if (superTry && offGood) {
      // A strong but badly timed Super Smash try: a weak wobble back, and a fall into the sand.
      this.hit(a, 30, aim, 0.3, stroke, when, false, true);
      this.dive(a, when, contact.position);
      this.showPop(a, `Super Smash failed! (${Math.round(size)} ms ${off < 0 ? 'early' : 'late'})`);
      this.tip(a, off < 0 ? 'early' : 'late');
      return;
    }
    if (superTry && there.y >= cfg.superSmashMinHeight) {
      this.hit(a, power, aim, quality, stroke, when, false, false, true);
      this.perfect(a);
      return;
    }
    const kind = this.hit(a, power, aim, quality, stroke, when, short, offGood || weak);
    const timing = quality >= 1 ? 'Perfect!' : `${Math.round(size)} ms ${off < 0 ? 'early' : 'late'}`;
    const verdict = kind === 'wobble' ? `Wobble · ${weak ? 'too soft' : timing}` : quality >= 1 ? 'Perfect!' : `Good · ${timing}`;
    this.showPop(a, kind === 'wobble' ? verdict : `${shotName(kind)} · ${verdict}`);
    if (quality >= 1 && kind !== 'wobble') this.perfect(a);
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
    this.superChain = 0;
    this.rallies++;
    for (const a of [this.near, this.far]) {
      a.down = null;
      a.busyUntil = 0;
      a.bob.rotation.set(0, 0, 0);
    }
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

  /** short: the SHORT button was held, a low short serve just past the short service line. */
  private serve(server: Athlete, now: number, power: number, aim: number, short: boolean): void {
    const cfg = TUNING.badminton;
    const from = this.handPosition(server, cfg.serveHeight);
    server.swing = { stroke: 'serve', start: now };
    // Diagonally across: into the receiver's service court on the other side of the centre line.
    const across = -Math.sign(server.target.x || 1);
    const range: [number, number] = across > 0 ? [0.25, cfg.courtHalfWidth - 0.25] : [-cfg.courtHalfWidth + 0.25, -0.25];
    this.launch(makeShot(short ? 'shortServe' : 'serve', from, server.side, aim, power / 100, 0.7, now, range), server.side);
    if (server.human && short) this.showPop(server, 'Short serve');
    this.hud.message.hidden = true;
    this.phase = 'rally';
  }

  /**
   * The athlete hits the shuttle with this stroke at time `when` (host clock; for a jump, at the top of it).
   * The return shot starts from wherever the shuttle is then: the shuttle never slows down to wait.
   * short: the SHORT button was held, a drop shot from any height (less precise from the back of the court).
   */
  private hit(
    athlete: Athlete,
    power: number,
    aim: number,
    quality: number,
    stroke: Stroke,
    when: number,
    short: boolean,
    wobble = false,
    superSmash = false,
  ): ShotKind {
    const cfg = TUNING.badminton;
    const there = this.flight!.positionAt(this.flight!.progressAt(when));
    // A smash only from the back of the court; elsewhere a hard overhead is a clear.
    const back = Math.abs(there.z) >= cfg.smashFromDepth;
    const kind: ShotKind = superSmash
      ? 'superSmash'
      : wobble
      ? 'wobble'
      : short
        ? 'drop'
        : stroke !== 'overhead'
          ? stroke
          : back && power >= cfg.smashPower
            ? 'smash'
            : 'clear';
    const extraScatter = short ? (back ? cfg.shortShotScatterBack : cfg.shortShotScatterMid) : 0;
    const netChance = short && back ? cfg.shortShotNetChanceBack : 0;
    this.decided = true;
    // A Super Smash stops the shuttle at the racket for a moment (hit-stop) before it shoots off.
    const launchAt = kind === 'superSmash' ? when + cfg.superSmashHitStopMs : when;
    this.pendingHit = { contactAt: when, when: launchAt, athlete, kind, power, aim, quality, extraScatter, netChance };
    if (kind === 'superSmash') this.superSmashJuice(athlete);
    if (launchAt <= Date.now()) this.launchPendingHit();
    return kind;
  }

  private launchPendingHit(): void {
    const cfg = TUNING.badminton;
    const p = this.pendingHit!;
    this.pendingHit = null;
    const from = this.flight!.positionAt(this.flight!.progressAt(p.contactAt));
    // Each further Super Smash in the same rally is faster, up to a limit.
    const speed = p.kind === 'superSmash' ? Math.min(cfg.superSmashMaxSpeed, Math.pow(1 + cfg.superSmashChainBoost, this.superChain++)) : 1;
    const shot = makeShot(p.kind, from, p.athlete.side, p.aim, p.power / 100, p.quality, p.when, undefined, p.extraScatter, p.netChance, speed);
    this.launch(shot, p.athlete.side);
  }

  /** "SUPER SMASH!" in the hitter's half, a flash, and the hitter's phone buzzes. */
  private superSmashJuice(a: Athlete): void {
    this.showFeedback(a, this.superChain > 0 ? `SUPER SMASH ×${this.superChain + 1}!` : 'SUPER SMASH!', true);
    this.hud.flash.classList.remove('on');
    void this.hud.flash.offsetWidth; // restart the CSS animation
    this.hud.flash.classList.add('on');
    if (a.human) this.onCue?.(a.side, 'super_smash');
  }

  /** A new flight from `hitter`'s side: the other side runs to meet it, the hitter goes back home. */
  private launch(flight: Flight, hitter: Side): void {
    const cfg = TUNING.badminton;
    this.flight = flight;
    this.landedFx = false;
    this.receiver = -hitter as Side;
    const receiver = this.athlete(this.receiver);
    this.moveTo(this.athlete(hitter), new THREE.Vector3(0, 0, hitter * cfg.homeDepth), null);
    if (flight.intoNet) {
      // Nothing to hit: it drops on the hitter's side and the point goes to the receiver.
      this.contact = null;
      this.decided = true;
      return;
    }
    const reaction = receiver.human ? cfg.reactionMs : cfg.cpuLevels[this.level].reactionMs;
    this.contact = findContact(flight, this.receiver, receiver.wrapper.position, Math.max(Date.now(), receiver.busyUntil), reaction);
    this.decided = false;
    if (flight.kind === 'wobble' && receiver.human) {
      this.showFeedback(receiver, '⚡ Smash chance!');
      this.onCue?.(receiver.side, 'smash_chance');
    }
    const spot = this.contact.position.clone();
    spot.x -= receiver.handSign * cfg.reach[this.contact.stroke];
    spot.y = 0;
    this.moveTo(receiver, spot, this.contact.time - cfg.jumpRiseMs - 60);
    // The computer jumps by itself; a player's character only jumps with the player's swing (see onSwing).
    const jump = this.contact.position.y - cfg.standingReach;
    receiver.jump = jump > 0 && !receiver.human ? { height: jump, peak: this.contact.time, rise: cfg.jumpRiseMs } : null;
  }

  /** The athlete dives towards `towards` (flat), lands in the sand and lies there for recoveryMs. */
  private dive(a: Athlete, now: number, towards: THREE.Vector3): void {
    const cfg = TUNING.badminton;
    const dir = towards.clone().sub(a.wrapper.position).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -a.side);
    a.down = { start: now, dir: dir.normalize(), landed: false };
    a.busyUntil = now + cfg.diveMs + cfg.recoveryMs;
    a.jump = null;
    a.swing = null;
    a.target.copy(a.wrapper.position).setY(0);
    a.deadline = null;
  }

  /**
   * Dive animation: a belly-flop along the dive direction, a little sand puff on landing, lying still,
   * then a quick scramble back up. Returns true while it is busy with it (no running or bouncing).
   */
  private updateDown(a: Athlete, now: number, dt: number): boolean {
    const cfg = TUNING.badminton;
    const d = a.down;
    if (!d) return false;
    const t = now - d.start;
    const getUp = 280;
    let pitch: number;
    if (t < cfg.diveMs) {
      const k = t / cfg.diveMs;
      pitch = 1.45 * easeOut(k);
      a.wrapper.position.addScaledVector(d.dir, (cfg.diveReach / (cfg.diveMs / 1000)) * dt);
      a.bob.position.y = Math.sin(k * Math.PI) * 0.35;
    } else {
      if (!d.landed) {
        d.landed = true;
        this.puffs.burst(a.wrapper.position.clone().addScaledVector(d.dir, 0.6), now);
      }
      a.bob.position.y = 0;
      const upFrom = a.busyUntil - getUp;
      pitch = now < upFrom ? 1.45 : 1.45 * (1 - Math.min(1, (now - upFrom) / getUp));
    }
    if (now >= a.busyUntil) {
      a.down = null;
      a.bob.rotation.set(0, 0, 0);
      a.target.copy(a.wrapper.position).setY(0);
      return false;
    }
    // Turn the body towards the dive (in the character's own, possibly mirrored, frame) and tip it forward.
    const local = d.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -a.wrapper.rotation.y);
    if (a.wrapper.scale.x < 0) local.x = -local.x;
    a.bob.rotation.order = 'YXZ';
    a.bob.rotation.set(pitch, Math.atan2(local.x, local.z), 0);
    a.pose = { x: -2.8, z: -0.4 }; // arms out in front, like a superhero
    a.character.armPose = a.pose;
    a.character.update(dt);
    a.wrapper.position.y = 0;
    return true;
  }

  /** The hit window for the shuttle now coming (ms early, ms late): tighter against a Super Smash. */
  private hitWindow(): { early: number; late: number } {
    const cfg = TUNING.badminton;
    return this.flight?.kind === 'superSmash'
      ? cfg.superSmashDefenseWindowMs
      : { early: cfg.hitWindowEarlyMs, late: cfg.hitWindowMs };
  }

  /** Nobody hits it: the shuttle just flies on and lands. */
  private miss(): void {
    if (this.contact) this.missedContact = { side: this.receiver, time: this.contact.time };
    this.decided = true;
    this.contact = null;
  }

  /** A swing after the hit window: a miss; really late, the character also dives into the sand. */
  private lateMiss(a: Athlete, now: number, off: number): void {
    const cfg = TUNING.badminton;
    if (off > cfg.veryLateMs) {
      this.showPop(a, `Way too late! (${Math.round(off)} ms)`);
      this.dive(a, now, this.shuttle.position);
    } else {
      this.showPop(a, `Too late! (${Math.round(off)} ms)`);
    }
    this.tip(a, 'late');
    if (!this.decided) this.miss();
  }

  private cpuTurn(cpu: Athlete, now: number): void {
    const cfg = TUNING.badminton.cpuLevels[this.level];
    const contact = this.contact!;
    const incomingSmash = this.flight?.kind === 'smash';
    if (now < cpu.busyUntil) return; // still getting up: the shuttle will just fall
    cpu.swing = { stroke: contact.stroke, start: now };
    const incomingSuper = this.flight?.kind === 'superSmash';
    const chance = incomingSuper ? cfg.superSmashReturnChance : incomingSmash ? cfg.smashReturnChance : cfg.hitChance;
    const hits = contact.reach !== 'none' && Math.random() <= chance;
    if (!hits) {
      this.dive(cpu, now, contact.position);
      this.miss();
      return;
    }
    if (contact.reach === 'dive') {
      this.hit(cpu, 40, 0, 0.3, contact.stroke, now, false, true);
      return;
    }
    // A high wobble: the computer goes for a Super Smash now and then.
    const superHigh = this.flight?.kind === 'wobble' && contact.stroke === 'overhead' && contact.position.y >= TUNING.badminton.superSmashMinHeight;
    if (superHigh && Math.random() < cfg.superSmashChance) {
      this.hit(cpu, 90, (Math.random() * 2 - 1) * cfg.aimRange, 1, contact.stroke, now, false, false, true);
      return;
    }
    let power = cfg.power[0] + Math.random() * (cfg.power[1] - cfg.power[0]);
    if (contact.stroke === 'overhead') {
      const smashPower = TUNING.badminton.smashPower;
      power = Math.random() < cfg.smashChance ? Math.max(power, smashPower + 5) : Math.min(power, smashPower - 5);
    }
    const short = Math.random() < cfg.dropChance;
    const wobble = Math.random() < cfg.wobbleChance;
    const quality = cfg.quality[0] + Math.random() * (cfg.quality[1] - cfg.quality[0]);
    this.hit(cpu, power, (Math.random() * 2 - 1) * cfg.aimRange, quality, contact.stroke, now, short, wobble);
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
      const c = cfg.cpuLevels[this.level];
      const power = c.power[0] + Math.random() * (c.power[1] - c.power[0]);
      this.serve(server, now, power, (Math.random() * 2 - 1) * c.aimRange, Math.random() < cfg.cpu.shortServeChance);
    } else if (this.phase === 'rally' && this.flight) {
      if (this.pendingHit && now >= this.pendingHit.when) this.launchPendingHit();
      if (!this.decided && this.contact) {
        const receiver = this.athlete(this.receiver);
        if (!receiver.human && now >= this.contact.time && !this.pendingHit) {
          if (now < receiver.busyUntil) this.miss();
          else this.cpuTurn(receiver, now);
        }
        else if (receiver.human && now > this.contact.time + this.hitWindow().late + cfg.lateGraceMs) {
          this.showPop(receiver, 'Missed!');
          this.tip(receiver, 'late');
          this.miss();
        }
      }
      // The shuttle hit the ground: the receiver missed it.
      if (this.decided && !this.contact && !this.pendingHit && this.flight.progressAt(now) >= 1) {
        this.pointTo(this.flight.intoNet ? this.receiver : (-this.receiver as Side));
      }
    } else if (this.phase === 'point' && now >= this.pointEndsAt) {
      this.startServe();
    }

    this.updateShuttle(now);
    const flying = this.phase === 'rally' && !!this.flight && this.flight.progressAt(now) < 1 && !this.pendingHit;
    const trailKind = flying ? this.flight!.kind : null;
    const trailColour = trailKind === 'superSmash' ? cfg.superSmashTrailColour : cfg.wobbleTrailColour;
    this.trail.update(this.shuttle.position, now, trailKind === 'wobble' || trailKind === 'superSmash', trailColour, cfg.trailMs);
    // A Super Smash landing: a big sand burst and a shake.
    if (this.flight?.kind === 'superSmash' && !this.landedFx && this.flight.progressAt(now) >= 1) {
      this.landedFx = true;
      this.puffs.burst(this.flight.to, now, cfg.sandBurst);
      this.shakeUntil = now + cfg.shakeMs;
    }
    this.puffs.update(now, dt);
    for (const a of [this.near, this.far]) {
      this.updateAthlete(a, now, dt);
      this.updateGlow(a, now);
      if (now > a.feedbackUntil) a.feedback.hidden = true;
    }
    this.render(dt);
    this.placePops(now);
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
      // During a Super Smash's hit-stop the shuttle waits at the racket.
      const held = this.pendingHit && now >= this.pendingHit.contactAt ? this.pendingHit.contactAt : now;
      const u = Math.min(1, this.flight.progressAt(held));
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
    if (this.updateDown(a, now, dt)) return;
    // Run towards the target, fast enough to get there in time.
    const toTarget = a.target.clone().sub(a.wrapper.position).setY(0);
    const distance = toTarget.length();
    if (distance > 0.02) {
      const timeLeft = a.deadline === null ? 1 : Math.max(0.05, (a.deadline - now) / 1000);
      const assist = 1 + cfg.reachAssist;
      const speed = Math.min(cfg.maxRunSpeed * assist, Math.max(cfg.runSpeed * assist, distance / timeLeft));
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

  /** The racket's gold glow after a Perfect hit, fading out. */
  private updateGlow(a: Athlete, now: number): void {
    const k = Math.max(0, (a.glowUntil - now) / TUNING.badminton.perfectGlowMs);
    for (const m of a.racketMaterials) {
      m.emissive.set('#ffc93d');
      m.emissiveIntensity = k * 1.6;
    }
  }

  /** Keeps each player's timing text just above their character's head, in their own half of the screen. */
  private placePops(now: number): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const split = this.far.human;
    for (const a of [this.near, this.far]) {
      const visible = a.human && now < a.popUntil;
      a.pop.hidden = !visible;
      if (!visible) continue;
      const half = split ? w / 2 : w;
      const left = split && a.side === -1 ? w / 2 : 0;
      const head = a.wrapper.position.clone().add(new THREE.Vector3(0, 2.1, 0)).project(a.camera);
      a.pop.style.left = `${left + ((head.x + 1) / 2) * half}px`;
      a.pop.style.top = `${((1 - head.y) / 2) * h}px`;
    }
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
    const shake = (this.shakeUntil - Date.now()) / cfg.shakeMs;
    if (shake > 0) {
      const s = cfg.shakeStrength * shake;
      a.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0));
    }
  }

  // ---------- Helpers ----------

  private makeAthlete(side: Side, feedback: HTMLElement, pop: HTMLElement): Athlete {
    const cfg = TUNING.badminton;
    const character = new Character({ shirt: '#9b5cff', skin: SKIN_TONES[3], handedness: 'right' }, { putter: false });
    const racket = buildRacket(side === 1 ? '#ff8a3d' : '#00a6ed');
    character.handArm.add(racket);
    const racketMaterials: THREE.MeshStandardMaterial[] = [];
    racket.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m instanceof THREE.MeshStandardMaterial) racketMaterials.push(m);
    });
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
      down: null,
      busyUntil: 0,
      pop,
      popUntil: 0,
      racketMaterials,
      glowUntil: 0,
      lastTipRally: -99,
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

  /**
   * Timing text popping up above the player's own character (Early / Perfect / Late …), coloured by how it went.
   * Only for players (not the computer).
   */
  private showPop(a: Athlete, text: string): void {
    if (!a.human) return;
    const tone = /Perfect/.test(text)
      ? 'perfect'
      : /Too|Way|Missed|missed|failed|Out of/.test(text)
        ? 'miss'
        : /Wobble|Stretch/.test(text)
          ? 'wobble'
          : 'good';
    a.pop.textContent = text;
    a.pop.className = `badminton-pop ${tone}`;
    void a.pop.offsetWidth; // restart the pop animation
    a.pop.classList.add('on');
    a.popUntil = Date.now() + TUNING.badminton.popMs;
  }

  /** After a miss, now and then a tip: "Wait for it!" (too early) or "Swing sooner!" (too late). */
  private tip(a: Athlete, how: 'early' | 'late'): void {
    if (!a.human || this.rallies - a.lastTipRally < TUNING.badminton.hintEveryRallies) return;
    a.lastTipRally = this.rallies;
    this.showFeedback(a, how === 'early' ? 'Tip: wait for it!' : 'Tip: swing sooner!');
  }

  /** A Perfect hit: the racket glows gold and the phone gives a short buzz. */
  private perfect(a: Athlete): void {
    a.glowUntil = Date.now() + TUNING.badminton.perfectGlowMs;
    if (a.human) this.onCue?.(a.side, 'perfect');
  }

  /** Text in the athlete's half; big = large, golden and bouncy (a Super Smash). */
  private showFeedback(a: Athlete, text: string, big = false): void {
    a.feedback.textContent = text;
    a.feedback.hidden = false;
    a.feedback.classList.toggle('super', big);
    a.feedbackUntil = Date.now() + (big ? 1800 : 1400);
  }

  private renderScore(): void {
    this.hud.score.textContent = `${this.near.name} ${this.near.score} : ${this.far.score} ${this.far.name}`;
    const names = { easy: 'Easy', normal: 'Normal', pro: 'Pro' };
    this.hud.level.hidden = this.far.human;
    this.hud.level.textContent = `CPU: ${names[this.level]} · keys 1 2 3`;
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
      const power = this.keys.has('w') || this.keys.has('W') ? TUNING.badminton.keyWeakPower : TUNING.badminton.keyPower;
      this.onSwing(1, Date.now(), power, aim, e.shiftKey);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.onSwing(-1, Date.now(), TUNING.badminton.keyPower, 0, e.shiftKey);
    } else if ((e.key === '1' || e.key === '2' || e.key === '3') && !this.far.human) {
      this.level = e.key === '1' ? 'easy' : e.key === '2' ? 'normal' : 'pro';
      this.renderScore();
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
  return { serve: 'Serve', shortServe: 'Short serve', clear: 'Clear', lift: 'Lift', drive: 'Drive', smash: 'Smash!', drop: 'Drop', wobble: 'Wobble', superSmash: 'SUPER SMASH!' }[kind];
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
