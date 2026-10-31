import * as THREE from 'three';
import { SKIN_TONES, type PlayerInfo } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { sound } from '../audio/sound.ts';
import { Character } from '../game/character.ts';
import { buildRacket, buildShuttle, setRacketColour } from './court.ts';
import { buildBeach, type Venue } from './venue/beach.ts';
import { Birds, SandPuffs, Swoosh, Trail } from './effects.ts';
import { Coach } from './coach.ts';
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
// - Rally scoring: every rally gives a point, the winner serves; the match length (Quick / Normal / Long) is
//   chosen in the lobby. Long rallies escalate: a hit counter, seagulls, a fire trail, a "Rally ×N!" at the end.
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
  /** Which phone seat plays it: 0 / 2 = near side, 1 / 3 = far side (2 and 3 only in 2 v 2). */
  seat: number;
  /** A glowing ring on the sand under the teammate who goes for the shuttle (2 v 2). */
  ring: THREE.Mesh;
  /** A phone's player, or null for the computer. */
  human: boolean;
  name: string;
  /** Moves around the court and faces the net; bob makes the running bounce. */
  wrapper: THREE.Group;
  bob: THREE.Group;
  character: Character;
  camera: THREE.PerspectiveCamera;
  /** How high the camera looks now (m): it tips up a little to keep a high shuttle in view. */
  lookY: number;
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
  racket: THREE.Group;
  /** The swoosh behind the racket head while swinging. */
  swoosh: Swoosh;
  /** After a point: a happy jump and spin (won) or a sad slump and a kick in the sand (lost), until `until`. */
  reaction: { won: boolean; start: number; until: number } | null;
  glowUntil: number;
  /** The rally in which this player last got a tip, so tips stay rare. */
  lastTipRally: number;
  /** Footwork: split-step hop until then (host clock), body lean into the run, running bounce, lunge (0..1). */
  splitUntil: number;
  lean: { x: number; z: number };
  bounce: number;
  lunge: number;
  lungeUntil: number;
  /** Which way the lunge goes, in the character's own frame (radians, 0 = straight forward). */
  lungeYaw: number;
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
  /** The rally hit counter in the corner of each half (near, far). */
  rallyNear: HTMLElement;
  rallyFar: HTMLElement;
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
  private readonly venue: Venue;
  private readonly scene = new THREE.Scene();
  private readonly clock = new THREE.Clock();
  private readonly shuttle = buildShuttle();
  private readonly shadow: THREE.Mesh;
  /** All four seats (see Athlete.seat); near and far are seats 0 and 1, the team captains (camera, score, name). */
  private readonly seats: Athlete[];
  private readonly near: Athlete;
  private readonly far: Athlete;
  /** The athletes in play: seats 0–1, or all four in 2 v 2. */
  private athletes: Athlete[] = [];
  private doubles = false;
  private running = false;

  private phase: Phase = 'serve';
  private server: Side = 1;
  /** Who serves now, and who last served for each side (in 2 v 2 the team's server changes when it wins the serve back). */
  private serverAthlete!: Athlete;
  private lastServer = new Map<Side, Athlete>();
  /** The teammate going for the shuttle now (the one who can reach it first). */
  private receiverAthlete: Athlete | null = null;
  private flight: Flight | null = null;
  /** Who the shuttle is flying to, and where/when they meet it. */
  private receiver: Side = -1;
  private contact: Contact | null = null;
  /** The receiver's hit has been decided (hit, or missed). */
  private decided = false;
  /** Super Smashes so far in this rally (each next one is faster), and whether the last one's landing burst played. */
  private superChain = 0;
  /** Rallies played so far (for spacing out the tips), and hits in the rally now (the serve counts). */
  private rallies = 0;
  private hits = 0;
  /** The match length (chosen in the lobby). */
  private length: keyof typeof TUNING.badminton.matchLengths = TUNING.badminton.matchLength;
  /** The computer's difficulty (keys 1 / 2 / 3). */
  private level: keyof typeof TUNING.badminton.cpuLevels = TUNING.badminton.cpuLevel;
  private landedFx = false;
  private shakeUntil = 0;
  /** The last missed contact (who and when), so a very late swing arriving after the miss can still dive. */
  private missedContact: { athlete: Athlete; time: number } | null = null;
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
  /** The way in from the cube: until then the cameras glide down and nobody serves (see swoopIn). */
  private introEndsAt = 0;
  /** The landing sound of the current flight has played. */
  private landedSound = true;
  private readonly keys = new Set<string>();
  /** Scratch vectors for the racket head (swoosh). */
  private readonly headTip = new THREE.Vector3();
  private readonly headThroat = new THREE.Vector3();
  private readonly trail = new Trail();
  private readonly puffs = new SandPuffs(TUNING.badminton.sandColour);
  private readonly birds = new Birds(TUNING.badminton.birds);
  /** Tells the phone in this seat something (e.g. "Smash chance!"); set by host/main.ts. */
  onCue: ((seat: number, cue: BadmintonCue) => void) | null = null;
  /** How each judged swing went, for the outcome log (set by host/main.ts). */
  onOutcome: ((outcome: Record<string, unknown>) => void) | null = null;
  /** Learns each player's timing, power, aim and Wi-Fi delay and adapts the game to them. */
  readonly coach = new Coach();
  /** The swing being judged now (raw values from the phone), until its verdict is known. */
  private judging: { athlete: Athlete; outcome: Record<string, unknown> } | null = null;

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

    const sun = new THREE.DirectionalLight('#fff0d4', 2.4);
    sun.position.set(6, 14, 4);
    this.venue = buildBeach(sun.position);
    this.scene.fog = new THREE.Fog(this.venue.horizon, 70, 190);
    this.scene.add(new THREE.HemisphereLight('#e6f4ff', '#d9c08a', 1.3), this.venue.group);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 45 });
    this.scene.add(sun);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.09, 16),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shuttle.scale.setScalar(cfg.shuttleScale);
    this.shadow.scale.setScalar(cfg.shuttleScale);
    this.scene.add(this.shuttle, this.shadow, this.trail.mesh, this.puffs.group, this.birds.group);

    this.seats = [0, 1, 2, 3].map((seat) => {
      const side: Side = seat % 2 === 0 ? 1 : -1;
      return side === 1 ? this.makeAthlete(1, seat, hud.feedbackNear, hud.popNear) : this.makeAthlete(-1, seat, hud.feedbackFar, hud.popFar);
    });
    [this.near, this.far] = this.seats;
    this.serverAthlete = this.near;
  }

  // ---------- Public ----------

  /**
   * Starts a new match. players = the phones' players by seat (0 = near, 1 = far, 2 = near teammate, 3 = far
   * teammate); a missing one is the computer, which plays at `level` (chosen in the lobby; keys 1 2 3 still
   * change it during the match). Seat 0 is always a player (a phone, or the Mac keyboard). doubles = 2 v 2.
   */
  start(
    players: (PlayerInfo | null)[],
    level: keyof typeof TUNING.badminton.cpuLevels = this.level,
    length: keyof typeof TUNING.badminton.matchLengths = this.length,
    doubles = false,
  ): void {
    this.level = level;
    this.length = length;
    this.setPlayers(players, doubles);
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

  /** The way in from the cube: the cameras start high above and glide down; the first serve waits until they land. */
  swoopIn(): void {
    this.introEndsAt = Date.now() + TUNING.transition.swoopSeconds * 1000;
    this.cpuServeAt = Math.max(this.cpuServeAt, this.introEndsAt + TUNING.badminton.cpu.serveDelayMs);
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  /** The players' looks (colour, skin, hand) and names by seat, e.g. after someone edited their profile. */
  setPlayers(players: (PlayerInfo | null)[], doubles = this.doubles): void {
    this.doubles = doubles;
    this.athletes = doubles ? this.seats : this.seats.slice(0, 2);
    for (const a of this.seats) {
      const playing = this.athletes.includes(a);
      a.wrapper.visible = playing;
      a.swoosh.mesh.visible = false;
      a.ring.visible = false;
      if (playing) this.setLook(a, players[a.seat] ?? null, a.seat === 0 || players[a.seat] != null);
    }
    this.hud.screen.classList.toggle('split', this.split());
    this.hud.screen.classList.toggle('no-texts', !TUNING.badminton.screenTexts);
    this.onResize();
    this.renderScore();
  }

  /**
   * A swing from the phone playing `side`. at = the exact hit time (server clock = this Mac's clock),
   * power 0..100, aim -1..1, receivedAt = when the swing arrived here (for the coach's Wi-Fi delay).
   */
  onSwing(seat: number, at: number, power: number, aim: number, short = false, receivedAt?: number): void {
    const cfg = TUNING.badminton;
    const a = this.seats[seat];
    if (!a || !a.human || !this.athletes.includes(a)) return;
    const now = Date.now();
    if (now < this.introEndsAt) return;
    // The coach adapts the swing to this player (see coach.ts); the raw values go to the outcome log.
    if (receivedAt !== undefined) this.coach.noteDelay(a.name, receivedAt - at);
    const advice = this.coach.advice(a.name);
    const raw = { at, power, aim };
    power = Math.min(100, power * advice.powerScale);
    aim = THREE.MathUtils.clamp(aim * advice.aimScale, -1, 1);
    at -= advice.timingShift;
    const note = (offset: number): void => {
      this.coach.noteTiming(a.name, offset);
      this.judging = {
        athlete: a,
        outcome: {
          player: a.name, offsetMs: Math.round(offset), shiftMs: Math.round(advice.timingShift),
          powerRaw: raw.power, power: Math.round(power), aimRaw: raw.aim, aim: Number(aim.toFixed(2)),
          delayMs: receivedAt === undefined ? null : receivedAt - raw.at, short, swingsLearned: advice.swings,
          stroke: this.contact?.stroke ?? null, shot: this.flight?.kind ?? null,
        },
      };
    };
    if (this.phase === 'serve' && this.serverAthlete === a) {
      this.serve(a, now, power, aim, short);
      return;
    }
    if (now < a.busyUntil) return; // still lying in the sand
    // A swing that arrives after the miss was already called: if it was really late, the character still dives.
    const missed = this.missedContact;
    if (missed && missed.athlete === a && at - missed.time > cfg.veryLateMs && at - missed.time < 1200) {
      note(raw.at - missed.time);
      this.missedContact = null;
      this.lateMiss(a, now, at - missed.time);
      return;
    }
    // Only the teammate going for the shuttle can hit it.
    if (this.phase !== 'rally' || this.receiverAthlete !== a || this.decided || !this.contact || !this.flight) return;
    const contact = this.contact;
    const off = at - contact.time;
    const { early, late } = this.hitWindow();
    note(raw.at - contact.time);
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
      this.judged(a, 'Super Smash!', 'perfect');
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
    this.serverAthlete = this.near;
    this.lastServer.clear();
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
    this.hits = 0;
    this.renderRally();
    this.receiverAthlete = null;
    for (const a of this.athletes) {
      a.down = null;
      a.busyUntil = 0;
      a.bob.rotation.set(0, 0, 0);
      a.lunge = 0;
      a.lungeUntil = 0;
      a.splitUntil = 0;
    }
    const cfg = TUNING.badminton;
    const server = this.serverAthlete;
    this.lastServer.set(this.server, server);
    // Even score: serve from the right service court, odd: from the left (right = +x for the near side, -x for the far side).
    const x = this.server * (this.athlete(this.server).score % 2 === 0 ? 1 : -1) * 0.9;
    this.moveTo(server, new THREE.Vector3(x, 0, this.server * cfg.serveDepth), null);
    // The receiver stands diagonally across; in 2 v 2 the partners stand in the other half, a little further back.
    const receivers = this.team(-this.server as Side);
    this.moveTo(receivers[0], new THREE.Vector3(-x, 0, -this.server * cfg.homeDepth), null);
    if (receivers[1]) this.moveTo(receivers[1], new THREE.Vector3(x, 0, -this.server * (cfg.homeDepth + cfg.doubles.partnerBack)), null);
    const partner = this.partner(server);
    if (partner) this.moveTo(partner, new THREE.Vector3(-x, 0, this.server * (cfg.homeDepth + cfg.doubles.partnerBack)), null);
    this.cpuServeAt = Date.now() + TUNING.badminton.cpu.serveDelayMs;
    this.hud.message.textContent = server.human ? `${server.name}: swing to serve!` : `${server.name} serves`;
    this.hud.message.hidden = !TUNING.badminton.screenTexts;
  }

  /** short: the SHORT button was held, a low short serve just past the short service line. */
  private serve(server: Athlete, now: number, power: number, aim: number, short: boolean): void {
    const cfg = TUNING.badminton;
    const from = this.handPosition(server, cfg.serveHeight);
    server.swing = { stroke: 'serve', start: now };
    // Diagonally across: into the receiver's service court on the other side of the centre line.
    const across = -Math.sign(server.target.x || 1);
    const range: [number, number] = across > 0 ? [0.25, cfg.courtHalfWidth - 0.25] : [-cfg.courtHalfWidth + 0.25, -0.25];
    this.launch(makeShot(short ? 'shortServe' : 'serve', from, server.side, aim, power / 100, 0.7, now, range), server);
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
    if (kind === 'superSmash') {
      this.superSmashJuice(athlete);
      sound.play('jingle-super-smash');
    }
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
    this.launch(shot, p.athlete);
  }

  /** "SUPER SMASH!" in the hitter's half, a flash, and the hitter's phone buzzes. */
  private superSmashJuice(a: Athlete): void {
    this.showFeedback(a, this.superChain > 0 ? `SUPER SMASH ×${this.superChain + 1}!` : 'SUPER SMASH!', true);
    this.hud.flash.classList.remove('on');
    void this.hud.flash.offsetWidth; // restart the CSS animation
    this.hud.flash.classList.add('on');
    if (a.human) this.onCue?.(a.seat, 'super_smash');
  }

  /**
   * A new flight from the hitter: on the other side the teammate who can reach it first runs to meet it (the
   * other covers the rest of the court), the hitter's team goes back to its waiting spots.
   */
  private launch(flight: Flight, hitter: Athlete): void {
    const cfg = TUNING.badminton;
    this.flight = flight;
    this.landedFx = false;
    this.landedSound = false;
    const hard = flight.kind === 'smash' || flight.kind === 'superSmash';
    sound.play(hard ? 'shuttle-smash' : 'shuttle-hit', 1, hard ? 1 : 0.95 + Math.random() * 0.15);
    this.hits++;
    this.renderRally();
    this.receiver = -hitter.side as Side;
    if (flight.intoNet) {
      // Nothing to hit: it drops on the hitter's side and the point goes to the receiver.
      this.moveTo(hitter, new THREE.Vector3(0, 0, hitter.side * cfg.homeDepth), null);
      this.contact = null;
      this.receiverAthlete = null;
      this.decided = true;
      return;
    }
    const now = Date.now();
    const reactionOf = (a: Athlete): number => (a.human ? cfg.reactionMs : cfg.cpuLevels[this.level].reactionMs);
    // Each teammate works out where it could meet the shuttle; the one who gets there best and first goes
    // (nearly the same moment: the one with less running).
    const rank = { run: 0, dive: 1, none: 2 };
    const score = (a: Athlete, c: Contact): number =>
      rank[c.reach] * 1e6 + Math.round(c.time / 80) * 1000 + a.wrapper.position.distanceTo(c.position.clone().setY(0));
    let receiver: Athlete | null = null;
    let best = Infinity;
    for (const a of this.team(this.receiver)) {
      const c = findContact(flight, this.receiver, a.wrapper.position, Math.max(now, a.busyUntil), reactionOf(a));
      const s = score(a, c);
      if (s < best) {
        best = s;
        receiver = a;
        this.contact = c;
      }
    }
    receiver = receiver!;
    const contact = this.contact!;
    this.receiverAthlete = receiver;
    const reaction = reactionOf(receiver);
    this.decided = false;
    // The hitter's team heads for its waiting spots straight away (deeper if the other side must lift from the front).
    this.placeTeam(hitter.side, contact);
    // The receiver's partner covers the other half of the court.
    const cover = this.partner(receiver);
    if (cover) {
      const lane = contact.position.x >= 0 ? -cfg.doubles.laneOffset : cfg.doubles.laneOffset;
      this.moveTo(cover, new THREE.Vector3(lane, 0, this.receiver * cfg.homeDepth), null);
    }
    // In 2 v 2 the phone of the teammate who goes buzzes: "your shuttle!".
    if (this.doubles && receiver.human) this.onCue?.(receiver.seat, 'your_turn');
    // Split step: the receiver hops as the shuttle is hit, then runs.
    if (now >= receiver.busyUntil) receiver.splitUntil = now + reaction;
    if (flight.kind === 'wobble' && receiver.human) {
      this.showFeedback(receiver, '⚡ Smash chance!');
      this.onCue?.(receiver.seat, 'smash_chance');
    }
    const spot = contact.position.clone();
    spot.x -= receiver.handSign * cfg.reach[contact.stroke];
    spot.z += receiver.side * cfg.reachBack[contact.stroke]; // a little short of it, on its own side
    spot.y = 0;
    this.moveTo(receiver, spot, contact.time - cfg.jumpRiseMs - 60);
    // The computer jumps by itself; a player's character only jumps with the player's swing (see onSwing).
    const jump = contact.position.y - cfg.standingReach;
    receiver.jump = jump > 0 && !receiver.human ? { height: jump, peak: contact.time, rise: cfg.jumpRiseMs } : null;
  }

  /**
   * The team that just hit goes to its waiting spots for the return: alone, the base spot; two of them side by
   * side, each covering its half (the one on the left stays on the left), so they never run into each other.
   */
  private placeTeam(side: Side, contact: Contact): void {
    const base = this.basePosition(side, contact);
    const team = this.team(side).filter((a) => !a.down);
    if (team.length < 2) {
      for (const a of team) this.moveTo(a, base, null);
      return;
    }
    const lane = TUNING.badminton.doubles.laneOffset;
    const [left, right] = [...team].sort((a, b) => a.wrapper.position.x - b.wrapper.position.x);
    this.moveTo(left, new THREE.Vector3(base.x * 0.5 - lane, 0, base.z), null);
    this.moveTo(right, new THREE.Vector3(base.x * 0.5 + lane, 0, base.z), null);
  }

  /**
   * Where the hitter waits for the return. If the other side meets the shuttle near the net or low, it has to
   * lift, and a lift goes deep: wait deeper. Shifted a little towards the side the other player hits from.
   */
  private basePosition(side: Side, contact: Contact): THREE.Vector3 {
    const cfg = TUNING.badminton;
    const fw = cfg.footwork;
    const lifting = contact.stroke === 'lift' || Math.abs(contact.position.z) < fw.frontContactDepth;
    return new THREE.Vector3(contact.position.x * fw.baseFollowX, 0, side * (lifting ? fw.baseDepthVsNet : cfg.homeDepth));
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
    a.lunge = 0;
    a.lungeUntil = 0;
    a.splitUntil = 0;
    a.character.legPose = null;
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

  /** Extra wait before calling a miss: for a slow Wi-Fi, and for a player whose right moment the coach moved later. */
  private coachGrace(a: Athlete): number {
    const advice = this.coach.advice(a.name);
    return advice.extraGrace + Math.max(0, advice.timingShift);
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
    if (this.contact && this.receiverAthlete) this.missedContact = { athlete: this.receiverAthlete, time: this.contact.time };
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
    // The winners serve. Winning the serve back, the team's other player serves (2 v 2); else the same one again.
    if (this.server !== winner) {
      const last = this.lastServer.get(winner);
      this.serverAthlete = last ? (this.partner(last) ?? last) : w;
    }
    this.server = winner;
    this.renderScore();
    const cfg = TUNING.badminton;
    const m = cfg.matchLengths[this.length];
    const lead = w.score - loser.score;
    const won = w.score >= m.to && (lead >= m.winBy || (m.cap !== null && w.score >= m.cap));
    this.phase = won ? 'over' : 'point';
    sound.play(won ? 'jingle-win' : 'jingle-point');
    this.pointEndsAt = Date.now() + cfg.pointPauseMs;
    const gamePoint = w.score >= m.to - 1 && (lead >= m.winBy - 1 || (m.cap !== null && w.score >= m.cap - 1));
    const tied = lead === 0 && w.score >= m.to - 1;
    const lastPoint = tied && m.cap !== null && w.score === m.cap - 1;
    const rally = this.hits >= cfg.rallyThresholds.celebrate ? `\nRally ×${this.hits}!` : '';
    this.hud.message.textContent = won
      ? `${this.teamName(winner)} win${this.team(winner).length > 1 ? '' : 's'}! ${this.near.score} : ${this.far.score}${rally}\nEnter: play again · Esc: back to the cube`
      : `Point to ${this.teamName(winner)}!${rally}${lastPoint ? '\nNext point wins!' : tied ? '\nDeuce: win by 2' : gamePoint ? '\nGame point!' : ''}`;
    this.hud.message.classList.toggle('long-rally', rally !== '');
    // Between points nothing covers the game (unless screenTexts); the result at the end always shows.
    this.hud.message.hidden = !won && !cfg.screenTexts;
    // Beach reactions: the winner jumps and spins with both arms up, the loser slumps and kicks the sand.
    const now = Date.now();
    for (const a of this.team(winner)) {
      a.character.play('jump');
      a.reaction = { won: true, start: now, until: now + cfg.pointReactionMs.won };
    }
    for (const a of this.team(loser.side)) {
      if (a.down) continue;
      a.character.play('slump');
      a.reaction = { won: false, start: now, until: now + cfg.pointReactionMs.lost };
      const front = a.wrapper.position.clone().add(new THREE.Vector3(0, 0, -a.side * 0.5));
      this.puffs.burst(front, now, 5, 0.5);
    }
  }

  // ---------- Frame ----------

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = Date.now();
    const cfg = TUNING.badminton;

    const server = this.serverAthlete;
    if (this.phase === 'serve' && !server.human && now >= this.cpuServeAt) {
      const c = cfg.cpuLevels[this.level];
      const power = c.power[0] + Math.random() * (c.power[1] - c.power[0]);
      this.serve(server, now, power, (Math.random() * 2 - 1) * c.aimRange, Math.random() < cfg.cpu.shortServeChance);
    } else if (this.phase === 'rally' && this.flight) {
      if (this.pendingHit && now >= this.pendingHit.when) this.launchPendingHit();
      if (!this.decided && this.contact && this.receiverAthlete) {
        const receiver = this.receiverAthlete;
        if (!receiver.human && now >= this.contact.time && !this.pendingHit) {
          if (now < receiver.busyUntil) this.miss();
          else this.cpuTurn(receiver, now);
        }
        else if (receiver.human && now > this.contact.time + this.hitWindow().late + cfg.lateGraceMs + this.coachGrace(receiver)) {
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
    // Each shot has its own trail; in a fiery rally every shot except a wobble or a Super Smash burns.
    const kind = this.flight?.kind;
    const fiery = this.hits >= cfg.rallyThresholds.fire && kind !== 'wobble' && kind !== 'superSmash';
    const style = !kind ? cfg.trails.clear : fiery ? cfg.fireTrail : cfg.trails[kind];
    this.trail.update(this.shuttle.position, now, flying, style.colour, style.ms);
    const rallyOn = this.phase === 'rally' || this.phase === 'point';
    this.birds.update(dt, rallyOn && this.hits >= cfg.rallyThresholds.birds, this.hits >= cfg.rallyThresholds.fire);
    // A Super Smash landing: a big sand burst and a shake.
    if (this.flight?.kind === 'superSmash' && !this.landedFx && this.flight.progressAt(now) >= 1) {
      this.landedFx = true;
      this.puffs.burst(this.flight.to, now, cfg.sandBurst);
      this.shakeUntil = now + cfg.shakeMs;
    }
    // The shuttle lands: a soft thud in the sand, or it drops off the net.
    if (this.flight && !this.landedSound && this.flight.progressAt(now) >= 1 && !this.pendingHit) {
      this.landedSound = true;
      sound.play(this.flight.intoNet ? 'shuttle-net' : 'shuttle-sand');
    }
    this.puffs.update(now, dt);
    this.venue.update(dt);
    this.keepApart();
    for (const a of this.athletes) {
      this.updateAthlete(a, now, dt);
      this.updateGlow(a, now);
      if (now > a.feedbackUntil) a.feedback.hidden = true;
    }
    this.render(dt);
    this.placePops(now);
  }

  /** Teammates never stand inside each other: if they get too close, both step a little apart (sideways). */
  private keepApart(): void {
    if (!this.doubles) return;
    const gap = TUNING.badminton.doubles.minGap;
    for (const side of [1, -1] as const) {
      const [a, b] = this.team(side);
      if (!a || !b || a.down || b.down) continue;
      const d = a.wrapper.position.distanceTo(b.wrapper.position);
      if (d >= gap) continue;
      const push = (gap - d) / 2;
      const dir = Math.sign(a.wrapper.position.x - b.wrapper.position.x) || 1;
      a.wrapper.position.x += dir * push;
      b.wrapper.position.x -= dir * push;
    }
  }

  /** One player: full screen from behind the near player. Two: left half near player, right half far player. */
  private render(dt: number): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.updateCamera(this.near, dt);
    // The sun's shadows are the same for both halves: work them out once per frame.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    if (!this.split()) {
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
      position = this.handPosition(this.serverAthlete, TUNING.badminton.serveHeight);
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
    const fw = cfg.footwork;
    if (this.updateDown(a, now, dt)) return;
    // Run towards the target, fast enough to get there in time.
    const toTarget = a.target.clone().sub(a.wrapper.position).setY(0);
    const distance = toTarget.length();
    let stride = 0;
    let lean = { x: 0, z: 0 };
    if (now < a.splitUntil) {
      // Split step: a small hop on the spot as the other side hits.
      const k = 1 - (a.splitUntil - now) / Math.max(1, cfg.reactionMs);
      a.bounce = Math.sin(THREE.MathUtils.clamp(k, 0, 1) * Math.PI) * fw.splitHop;
    } else if (distance > 0.02) {
      const assist = 1 + cfg.reachAssist;
      // To the shuttle: just fast enough to be there a moment early (calm when there is time); elsewhere: a run.
      const timeLeft = a.deadline === null ? 1 : Math.max(0.05, ((a.deadline - now) / 1000) * fw.arriveShare);
      const least = a.deadline === null ? cfg.runSpeed * assist : fw.calmRunSpeed;
      const speed = Math.min(cfg.maxRunSpeed * assist, Math.max(least, distance / timeLeft));
      const dir = toTarget.normalize();
      a.wrapper.position.addScaledVector(dir, Math.min(distance, speed * dt));
      // Faster running = quicker, longer steps; a puff of sand at each step when really running.
      const before = Math.floor(a.runPhase / Math.PI);
      a.runPhase += dt * (8 + speed * 1.3);
      if (Math.floor(a.runPhase / Math.PI) !== before && speed >= fw.stepPuffSpeed) {
        this.puffs.burst(a.wrapper.position, now, 2, 0.35);
      }
      a.bounce = Math.abs(Math.sin(a.runPhase)) * 0.07;
      stride = Math.min(1.3, speed / cfg.runSpeed) * Math.min(1, distance / 0.3);
      // Lean into the run, in the character's own frame (it faces +z, possibly mirrored).
      const local = this.toLocal(a, dir);
      lean = { x: local.z > 0 ? local.z * fw.leanForward : local.z * fw.leanBack, z: -local.x * fw.leanSide };
      lean.x *= stride;
      lean.z *= stride;
    } else if (this.phase === 'rally' && this.receiverAthlete !== a) {
      // Ready on the toes while the other side plays.
      a.runPhase += dt * cfg.readyBouncesPerSecond * Math.PI;
      a.bounce = Math.abs(Math.sin(a.runPhase)) * cfg.readyBounce;
    } else {
      a.bounce *= 0.8;
    }
    const kl = Math.min(1, dt * 10);
    a.lean = { x: a.lean.x + (lean.x - a.lean.x) * kl, z: a.lean.z + (lean.z - a.lean.z) * kl };

    // Lunge: the last step to a shuttle taken below the head near the net (or a stretch) is a deep lunge, held a
    // moment after the hit.
    const c = this.contact;
    if (
      c && this.phase === 'rally' && this.receiverAthlete === a && !this.decided && c.stroke !== 'overhead' &&
      (Math.abs(c.position.z) < fw.lungeDepth || c.reach === 'dive') && c.time - now < fw.lungeLeadMs && distance < fw.lungeStartDistance
    ) {
      if (now >= a.lungeUntil) {
        const towards = this.toLocal(a, c.position.clone().sub(a.wrapper.position).setY(0).normalize());
        a.lungeYaw = THREE.MathUtils.clamp(Math.atan2(towards.x, towards.z), -1.2, 1.2);
      }
      a.lungeUntil = now + fw.lungeHoldMs;
    }
    const lungeWant = now < a.lungeUntil ? 1 : 0;
    a.lunge += (lungeWant - a.lunge) * Math.min(1, dt * (lungeWant ? 14 : 6));
    const L = a.lunge;
    const swing = Math.sin(a.runPhase) * fw.strideAngle * stride;
    a.character.legPose = {
      left: swing * (1 - L) + fw.lungeBackLeg * L,
      right: -swing * (1 - L) + fw.lungeFrontLeg * L,
    };
    a.bob.rotation.order = 'YXZ';
    a.bob.rotation.set(a.lean.x * (1 - L) + fw.lungeLean * L, a.lungeYaw * L, a.lean.z * (1 - L));
    a.bob.position.set(Math.sin(a.lungeYaw) * fw.lungeStep * L, a.bounce * (1 - L) - fw.lungeDrop * L, Math.cos(a.lungeYaw) * fw.lungeStep * L);
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
      const waiting = this.phase === 'rally' && !this.decided && this.contact && this.receiverAthlete === a;
      // Racket ready as the shuttle comes: the computer just before its hit, a player as soon as the shuttle
      // crosses into their half (so the racket does not give away the moment to swing).
      const coming = a.human ? Math.sign(this.shuttle.position.z) === a.side : this.contact !== null && this.contact.time - now < 600;
      if (waiting && coming) pose = WINDUP[this.contact!.stroke];
      else if (this.phase === 'serve' && this.serverAthlete === a) pose = { x: 0.9, z: -0.3 };
      const k = Math.min(1, dt * 12);
      a.pose = { x: a.pose.x + (pose.x - a.pose.x) * k, z: a.pose.z + (pose.z - a.pose.z) * k };
    }
    // After a point both arms are free for the happy jump or the sad slump.
    const reacting = a.reaction !== null && now < a.reaction.until;
    a.character.armPose = reacting ? null : a.pose;
    if (a.reaction && reacting) {
      const t = (now - a.reaction.start) / (a.reaction.until - a.reaction.start);
      // The winner spins round once while jumping.
      if (a.reaction.won) a.bob.rotation.y += Math.PI * 2 * easeOut(Math.min(1, t * 1.6));
    } else if (a.reaction) {
      a.reaction = null;
    }
    a.character.update(dt);
    const cfgSwoosh = cfg.swoosh;
    const swinging = a.swing !== null && now >= a.swing.start && now - a.swing.start < 200;
    a.racket.getObjectByName('tip')!.getWorldPosition(this.headTip);
    a.racket.getObjectByName('throat')!.getWorldPosition(this.headThroat);
    // 2 v 2: a ring in the player's colour under the teammate going for the shuttle.
    a.ring.visible = this.doubles && this.phase === 'rally' && !this.decided && this.receiverAthlete === a;
    if (a.ring.visible) a.ring.position.set(a.wrapper.position.x, 0.04, a.wrapper.position.z);
    a.swoosh.update(this.headTip, this.headThroat, now, swinging, now < a.glowUntil ? cfgSwoosh.perfectColour : cfgSwoosh.colour, cfgSwoosh.opacity, cfgSwoosh.ms);
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
    const split = this.split();
    for (const a of this.athletes) {
      const visible = a.human && now < a.popUntil;
      a.pop.hidden = !visible;
      if (!visible) continue;
      const half = split ? w / 2 : w;
      const left = split && a.side === -1 ? w / 2 : 0;
      const head = a.wrapper.position.clone().add(new THREE.Vector3(0, 2.1, 0)).project(this.athlete(a.side).camera);
      a.pop.style.left = `${left + ((head.x + 1) / 2) * half}px`;
      a.pop.style.top = `${((1 - head.y) / 2) * h}px`;
    }
  }

  /** Rides along behind the athlete's team, looking down the court over the net; keeps the players and the shuttle in view. */
  private updateCamera(a: Athlete, dt: number): void {
    const cfg = TUNING.badminton;
    const split = this.split();
    // Behind the team: one player, or the middle between two teammates.
    const team = this.team(a.side);
    const x = team.reduce((sum, t) => sum + t.wrapper.position.x, 0) / Math.max(1, team.length);
    const behind = split ? cfg.splitCameraBehind : cfg.cameraBehind;
    // Forwards / backwards with the team (its deepest player), so the player stays in the same spot in the picture.
    const depth = Math.max(...team.map((t) => Math.abs(t.wrapper.position.z)));
    const along = cfg.homeDepth + (depth - cfg.homeDepth) * cfg.cameraFollowZ;
    const want = new THREE.Vector3(x * cfg.cameraFollowX, cfg.cameraHeight, a.side * (along + behind));
    a.camera.position.lerp(want, Math.min(1, dt * cfg.cameraFollowSpeed));
    // A high clear climbs out of the top of the picture: tip up a little to follow it, then back down.
    const high = this.phase === 'rally' ? Math.max(0, this.shuttle.position.y - cfg.cameraTiltFrom) * cfg.cameraTiltFollow : 0;
    a.lookY += (cfg.cameraLookY + high - a.lookY) * Math.min(1, dt * cfg.cameraTiltSpeed);
    const intro = (this.introEndsAt - Date.now()) / (TUNING.transition.swoopSeconds * 1000);
    if (intro > 0) {
      // Coming in from the cube: high above and behind, gliding down (fast at first, a gentle landing).
      const s = TUNING.transition;
      const left = intro ** 3;
      a.camera.position.copy(want).add(new THREE.Vector3(0, s.swoopHeight * left, a.side * s.swoopBack * left));
    }
    // Look ahead of the camera down the court (the same way from wherever it is, so the picture does not swing).
    const p = a.camera.position;
    a.camera.lookAt(p.x * 0.5, a.lookY, p.z - a.side * (behind + cfg.cameraLookAhead));
    this.keepInView(a, team, split ? cfg.splitCameraFov : cfg.cameraFov, intro > 0 ? 0 : dt);
    const shake = (this.shakeUntil - Date.now()) / cfg.shakeMs;
    if (shake > 0) {
      const s = cfg.shakeStrength * shake;
      a.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0));
    }
  }

  /**
   * Widens the camera's view (from baseFov up to cameraFovMax) just enough to keep the team's players, feet to head,
   * and the shuttle inside the picture, then narrows back slowly. dt 0 = no change (the camera is gliding in).
   */
  private keepInView(a: Athlete, team: Athlete[], baseFov: number, dt: number): void {
    const cfg = TUNING.badminton;
    const camera = a.camera;
    if (dt === 0) {
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
      return;
    }
    camera.updateMatrixWorld();
    const points: THREE.Vector3[] = [];
    for (const t of team) {
      points.push(t.wrapper.position.clone(), t.wrapper.position.clone().setY(t.wrapper.position.y + 1.5));
    }
    if (this.shuttle.visible && (this.phase === 'rally' || this.phase === 'serve')) points.push(this.shuttle.position.clone());
    // How far out each point is, as the tangent of its angle from the middle of the picture (up / down and sideways).
    let need = Math.tan(THREE.MathUtils.degToRad(baseFov / 2));
    for (const point of points) {
      const v = point.applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -0.5) continue; // behind the camera
      const out = Math.max(Math.abs(v.y) / -v.z, Math.abs(v.x) / -v.z / camera.aspect) / (1 - cfg.cameraFrameMargin);
      need = Math.max(need, out);
    }
    const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(need)), baseFov, cfg.cameraFovMax);
    const speed = fov > camera.fov ? cfg.cameraWidenSpeed : cfg.cameraNarrowSpeed;
    const next = camera.fov + (fov - camera.fov) * Math.min(1, dt * speed);
    if (Math.abs(next - camera.fov) < 0.01) return;
    camera.fov = next;
    camera.updateProjectionMatrix();
  }

  // ---------- Helpers ----------

  private makeAthlete(side: Side, seat: number, feedback: HTMLElement, pop: HTMLElement): Athlete {
    const cfg = TUNING.badminton;
    const character = new Character({ shirt: '#9b5cff', skin: SKIN_TONES[3], handedness: 'right' }, { putter: false });
    const racket = buildRacket(side === 1 ? '#ff8a3d' : '#00a6ed');
    character.handArm.add(racket);
    // Only the frame glows gold after a Perfect hit.
    const racketMaterials: THREE.MeshStandardMaterial[] = [];
    racket.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m instanceof THREE.MeshStandardMaterial && m.name === 'frame' && !racketMaterials.includes(m)) racketMaterials.push(m);
    });
    const swoosh = new Swoosh();
    this.scene.add(swoosh.mesh);
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
    camera.position.set(0, cfg.cameraHeight, side * (cfg.homeDepth + cfg.cameraBehind));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.75, 32),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: cfg.doubles.ringOpacity, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.scene.add(ring);
    return {
      side,
      seat,
      ring,
      human: side === 1,
      name: side === 1 ? 'You' : 'CPU',
      wrapper,
      bob,
      character,
      camera,
      lookY: 1,
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
      racket,
      swoosh,
      reaction: null,
      glowUntil: 0,
      lastTipRally: -99,
      splitUntil: 0,
      lean: { x: 0, z: 0 },
      bounce: 0,
      lunge: 0,
      lungeUntil: 0,
      lungeYaw: 0,
    };
  }

  /** A phone's player (or the computer, when human is false) takes this side. */
  private setLook(a: Athlete, player: PlayerInfo | null, human: boolean): void {
    a.human = human;
    a.name = human ? (player?.name ?? (a.seat === 0 ? 'You' : `Player ${a.seat + 1}`)) : 'CPU';
    const handedness = human ? (player?.handedness ?? 'right') : 'right';
    const shirt = human ? (player?.colour ?? (a.side === 1 ? '#ff5a5f' : '#00a6ed')) : '#9b5cff';
    const skin = human ? (player?.skinTone ?? SKIN_TONES[1]) : SKIN_TONES[3];
    a.character.setLook({ shirt, skin, handedness: 'right', look: human ? player?.look : undefined });
    // The beach look: tank top in the player's colour, darker shorts, bare feet, a headband; racket in their colour.
    const outfit = TUNING.badminton.outfit;
    const shorts = new THREE.Color(shirt).lerp(new THREE.Color(outfit.shortsBase), outfit.shortsShade);
    a.character.setOutfit({
      top: outfit.top as 'tank' | 'tee',
      bottoms: outfit.bottoms as 'shorts' | 'pants',
      bottomsColour: `#${shorts.getHexString()}`,
      feet: outfit.feet as 'bare' | 'shoes',
      headband: outfit.headbandColour,
    });
    setRacketColour(a.racket, shirt);
    (a.ring.material as THREE.MeshBasicMaterial).color.set(shirt);
    // A left-handed player is the mirror image, so the racket hand is on the other side.
    // The character's right hand is on its local -x side: +x in the world when facing -z (near side),
    // -x when facing +z (far side).
    const s = TUNING.badminton.characterScale;
    const left = handedness === 'left';
    a.wrapper.scale.set(left ? -s : s, s, s);
    a.handSign = (a.side === 1 ? 1 : -1) * (left ? -1 : 1);
  }

  /** A flat world direction in the athlete's own frame (it faces +z; mirrored for left-handers). */
  private toLocal(a: Athlete, dir: THREE.Vector3): THREE.Vector3 {
    const local = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -a.wrapper.rotation.y);
    if (a.wrapper.scale.x < 0) local.x = -local.x;
    return local;
  }

  /** The side's captain (seat 0 or 1): its camera, score and half of the screen. */
  private athlete(side: Side): Athlete {
    return side === 1 ? this.near : this.far;
  }

  /** Everyone playing on this side (one, or two in 2 v 2). */
  private team(side: Side): Athlete[] {
    return this.athletes.filter((a) => a.side === side);
  }

  private partner(a: Athlete): Athlete | null {
    return this.athletes.find((t) => t.side === a.side && t !== a) ?? null;
  }

  /** Split screen when both sides have a player on a phone. */
  private split(): boolean {
    return this.team(-1).some((a) => a.human);
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
    for (const a of this.athletes) a.wrapper.position.copy(a.target);
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
    const tone = /Perfect/.test(text)
      ? 'perfect'
      : /Too|Way|Missed|missed|failed|Out of/.test(text)
        ? 'miss'
        : /Wobble|Stretch/.test(text)
          ? 'wobble'
          : 'good';
    this.judged(a, text, tone);
    if (!a.human || !TUNING.badminton.screenTexts) return;
    a.pop.textContent = text;
    a.pop.className = `badminton-pop ${tone}`;
    void a.pop.offsetWidth; // restart the pop animation
    a.pop.classList.add('on');
    a.popUntil = Date.now() + TUNING.badminton.popMs;
  }

  /** The verdict for the swing being judged: a hit teaches the coach its power and aim; log the outcome. */
  private judged(a: Athlete, verdict: string, tone: string): void {
    const j = this.judging;
    if (!j || j.athlete !== a) return;
    this.judging = null;
    const o = j.outcome;
    if (tone !== 'miss') this.coach.noteHit(a.name, o.powerRaw as number, o.aimRaw as number);
    this.onOutcome?.({ ...o, verdict, hit: tone !== 'miss', at: Date.now() });
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
    sound.play('sparkle', 0.7, 1.2);
    if (a.human) this.onCue?.(a.seat, 'perfect');
  }

  /** Text in the athlete's half; big = large, golden and bouncy (a Super Smash). */
  private showFeedback(a: Athlete, text: string, big = false): void {
    if (!TUNING.badminton.screenTexts) return;
    a.feedback.textContent = text;
    a.feedback.hidden = false;
    a.feedback.classList.toggle('super', big);
    a.feedbackUntil = Date.now() + (big ? 1800 : 1400);
  }

  /** "Rally 7" in the corner of each player's half, from rallyThresholds.show hits; hotter colours as it grows. */
  private renderRally(): void {
    const cfg = TUNING.badminton.rallyThresholds;
    for (const [el, show] of [
      [this.hud.rallyNear, true],
      [this.hud.rallyFar, this.split()],
    ] as const) {
      el.hidden = !show || this.hits < cfg.show;
      if (el.hidden) continue;
      el.textContent = this.hits >= cfg.fire ? `🔥 Rally ${this.hits}` : `Rally ${this.hits}`;
      el.className = `badminton-rally${this.hits >= cfg.fire ? ' fire' : this.hits >= cfg.birds ? ' hot' : ''}`;
      void el.offsetWidth; // restart the bump
      el.classList.add('bump');
    }
  }

  /** "Martas", or "Martas & Eva" in 2 v 2. */
  private teamName(side: Side): string {
    return this.team(side).map((a) => a.name).join(' & ');
  }

  private renderScore(): void {
    this.hud.score.textContent = `${this.teamName(1)} ${this.near.score} : ${this.far.score} ${this.teamName(-1)}`;
    const names = { easy: 'Easy', normal: 'Normal', pro: 'Pro' };
    this.hud.level.hidden = this.athletes.every((a) => a.human);
    this.hud.level.textContent = `CPU: ${names[this.level]} · keys 1 2 3`;
  }

  private readonly onResize = (): void => {
    const cfg = TUNING.badminton;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const split = this.split();
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
      this.onSwing(0, Date.now(), power, aim, e.shiftKey);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.onSwing(1, Date.now(), TUNING.badminton.keyPower, 0, e.shiftKey);
    } else if ((e.key === '1' || e.key === '2' || e.key === '3') && this.athletes.some((a) => !a.human)) {
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
