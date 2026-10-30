import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { BallResult, GameState, PlayerInfo, SwingProgress } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { applyCurve, applyRollingResistance, createBall, curveFromTwist, shotSpeed } from './ball.ts';
import { ADDRESS_DISTANCE, Character } from './character.ts';
import { buildHole, HOLES, isInCup, loadKit, type BuiltHole, type Kit } from './course.ts';
import { DistancePreview } from './preview.ts';
import { Scenery } from './scenery.ts';

// Three holes built from the Kenney kit, for 1–4 players. The host owns the ball physics; the server decides
// whose turn it is and counts strokes (see syncState). Each player has their own ball: the current
// player's ball is the physical one, the others wait as see-through "ghost" balls.
// The current player's aim, live swing, practice swings and strokes come in through the onPhone… methods.
// Every player also has a chibi character: the current player addresses the ball and swings along
// with the real swing, the others watch from the side and react to the shot.
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
  character: Character;
  handedness: PlayerInfo['handedness'];
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

  private readonly holes: BuiltHole[];
  private hole: BuiltHole;
  private readonly sun: THREE.DirectionalLight;
  private readonly scenery: Scenery;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private state: State = 'waiting';
  private readonly players = new Map<string, PlayerBall>();
  /** Whose ball is on the course right now. */
  private active: string | null = null;
  private lastTurn = -1;
  private lastPhase: GameState['phase'] = 'lobby';
  /** Where the current turn's ball started, and the direction straight ahead then (for placing the watchers). */
  private readonly turnStart = new THREE.Vector3();
  private turnYaw = 0;
  /** Where the golfer stands while the ball rolls (frozen at the stroke). */
  private golferSpot: { position: THREE.Vector3; yaw: number } | null = null;
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
    const [kit] = await Promise.all([loadKit(), RAPIER.init()]);
    return new Game(container, hud, kit);
  }

  private constructor(
    private readonly container: HTMLElement,
    private readonly hud: GameHud,
    kit: Kit,
  ) {
    const look = TUNING.scenery;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, look.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // keeps colours bright and cheerful
    this.renderer.toneMappingExposure = look.exposure;
    container.appendChild(this.renderer.domElement);

    // Soft daylight: a sky-blue fill from above, warm sunshine with soft shadows, haze in the distance.
    this.scene.fog = new THREE.Fog(look.skyHorizon, look.fogNear, look.fogFar);
    this.scene.add(new THREE.HemisphereLight('#d6ecff', '#9fd6e0', 1.1));
    const sun = new THREE.DirectionalLight('#fff0d4', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    this.sun = sun;
    this.scene.add(sun, sun.target);

    this.world = new RAPIER.World({ x: 0, y: -TUNING.physics.gravity, z: 0 });
    this.world.timestep = 1 / TUNING.physics.stepsPerSecond;
    // All holes exist at once, each on its own island; the game moves between them.
    this.holes = HOLES.map((def) => {
      const built = buildHole(def, kit, this.world, RAPIER);
      this.scene.add(built.group);
      return built;
    });
    this.hole = this.holes[0];
    this.scenery = new Scenery(this.holes);
    this.scene.add(this.scenery.group);

    // Gentle glow on the brightest things (the ball, clouds, sunlit white), then colour correction.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), look.bloomStrength, look.bloomRadius, look.bloomThreshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
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

    // White aim line: a strip from the ball straight ahead, laid on the ground every frame (so it climbs ramps).
    const stripGeometry = new THREE.BufferGeometry();
    const segments = TUNING.aimLine.segments;
    stripGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segments + 1) * 2 * 3), 3));
    const stripIndices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      stripIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    stripGeometry.setIndex(stripIndices);
    this.aimStripe = new THREE.Mesh(
      stripGeometry,
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.aimStripe.frustumCulled = false;
    this.aimLine.add(this.aimStripe);
    this.scene.add(this.aimLine);

    this.setHole(0);
  }

  /** Moves the game to hole `index`: ball on the tee, sunlight over the hole, camera behind the tee. */
  private setHole(index: number): void {
    this.hole = this.holes[Math.min(index, this.holes.length - 1)];
    const box = new THREE.Box3().setFromObject(this.hole.group);
    const centre = box.getCenter(new THREE.Vector3());
    this.sun.target.position.copy(centre);
    const elevation = THREE.MathUtils.degToRad(TUNING.scenery.lightElevation);
    const lightDirection = Scenery.sunDirection().setY(0).normalize().multiplyScalar(Math.cos(elevation)).setY(Math.sin(elevation));
    this.sun.position.copy(centre).addScaledVector(lightDirection, 30);
    this.resetBall(this.teePosition());
    this.baseYaw = this.hole.teeYaw;
    this.followDir.set(Math.sin(this.baseYaw), 0, Math.cos(this.baseYaw));
    this.state = 'waiting';
    this.snapCamera();
    // Everyone appears next to the tee.
    let i = 0;
    for (const player of this.players.values()) {
      const side = new THREE.Vector3(Math.cos(this.baseYaw), 0, -Math.sin(this.baseYaw));
      player.character.place(this.teePosition().addScaledVector(side, 0.6 + 0.5 * i++), this.baseYaw);
    }
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
        const look = { shirt: info.colour, skin: info.skinTone, handedness: info.handedness };
        const character = new Character(look);
        character.place(this.teePosition().add(new THREE.Vector3(1, 0, -0.5)), 0);
        character.root.visible = false;
        this.scene.add(character.root);
        player = {
          name: info.name,
          colour: info.colour,
          strokes: 0,
          done: false,
          inMatch: false,
          pos: null,
          yaw: null,
          ghost,
          character,
          handedness: info.handedness,
        };
        this.players.set(info.id, player);
      }
      player.name = info.name;
      player.colour = info.colour;
      player.handedness = info.handedness;
      player.character.setLook({ shirt: info.colour, skin: info.skinTone, handedness: info.handedness });
      (player.ghost.material as THREE.MeshStandardMaterial).color.set(info.colour);
    }
    this.updateGhosts();
    this.updateInfo();
  }

  /** The match changed on the server: new round, new turn, strokes or finished players. */
  syncState(game: GameState): void {
    if (game.phase === 'playing' && this.lastPhase !== 'playing') this.resetRound(game.hole);
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

  /** Everyone back to the tee of hole `holeIndex`, before playing it. */
  private resetRound(holeIndex: number): void {
    for (const player of this.players.values()) {
      player.pos = null;
      player.yaw = null;
      player.done = false;
      player.strokes = 0;
    }
    this.active = null;
    this.setHole(holeIndex);
    this.updateGhosts();
  }

  private startTurn(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    this.active = id;
    this.resetBall(player.pos ?? this.teePosition());
    (this.ballMesh.material as THREE.MeshStandardMaterial).color.set(player.colour);
    this.ballMesh.visible = true;
    this.beginShot(player.yaw ?? this.hole.teeYaw);
    this.turnStart.copy(player.pos ?? this.teePosition());
    this.turnYaw = this.baseYaw;
    this.golferSpot = null;
    for (const [pid, other] of this.players) other.character.setStance(pid === id ? 'address' : 'stand');
  }

  // ---------- Characters ----------

  /** Where a golfer stands to address a ball at `ball`, aiming along `yaw`: beside the ball, side-on to the aim line. */
  private addressSpot(ball: THREE.Vector3, yaw: number, handedness: PlayerInfo['handedness']): { position: THREE.Vector3; yaw: number } {
    const scale = TUNING.character.height / 0.9;
    // The golfer faces across the aim line; right-handers have the target on their left.
    const face = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const side = handedness === 'left' ? 1 : -1;
    return {
      position: ball.clone().setY(ball.y - TUNING.ball.radius).addScaledVector(face, side * ADDRESS_DISTANCE * scale),
      yaw: Math.atan2(face.x, face.z),
    };
  }

  private updateCharacters(dt: number): void {
    const activePlayer = this.active ? this.players.get(this.active) : undefined;
    const watchers: PlayerBall[] = [];
    for (const [id, player] of this.players) {
      const show = player.inMatch && this.lastPhase !== 'lobby';
      player.character.root.visible = show;
      if (show && id !== this.active) watchers.push(player);
    }

    if (activePlayer) {
      if (this.state === 'aiming') {
        const spot = this.addressSpot(this.ballMesh.position, this.aimYaw(), activePlayer.handedness);
        activePlayer.character.setTarget(spot.position, spot.yaw);
      } else if (this.golferSpot) {
        activePlayer.character.setTarget(this.golferSpot.position, this.golferSpot.yaw);
      }
    }

    // Watchers line up beside and a little ahead of the ball, on the side away from the golfer, facing the ball.
    const c = TUNING.character;
    const ahead = new THREE.Vector3(Math.sin(this.turnYaw), 0, Math.cos(this.turnYaw));
    const awayFromGolfer = new THREE.Vector3(-Math.cos(this.turnYaw), 0, Math.sin(this.turnYaw));
    if (activePlayer?.handedness === 'left') awayFromGolfer.negate();
    watchers.forEach((player, i) => {
      const spot = this.turnStart
        .clone()
        .addScaledVector(awayFromGolfer, c.spectatorSide)
        .addScaledVector(ahead, c.spectatorAhead + i * c.spectatorSpacing);
      const look = this.state === 'rolling' || this.state === 'holed' ? this.ballMesh.position : this.turnStart;
      player.character.setTarget(spot, Math.atan2(look.x - spot.x, look.z - spot.z));
    });

    for (const player of this.players.values()) if (player.character.root.visible) player.character.update(dt);
  }

  /** How the golfer (and the others) react to where the ball ended up. */
  private react(result: BallResult): void {
    const golfer = this.active ? this.players.get(this.active)?.character : undefined;
    if (!golfer) return;
    if (result === 'holed') {
      golfer.play('jump');
      for (const [id, player] of this.players) if (id !== this.active && player.inMatch) player.character.play('clap');
    } else if (result === 'out') {
      golfer.play('scratch');
    } else {
      const p = this.ball.translation();
      const cup = this.hole.cup;
      const after = Math.hypot(cup.x - p.x, cup.z - p.z);
      const before = Math.hypot(cup.x - this.turnStart.x, cup.z - this.turnStart.z);
      if (after < TUNING.character.goodShotDistance) golfer.play('cheer');
      else if (after > before - 0.5) golfer.play('slump');
      else golfer.setStance('stand');
    }
  }

  private teePosition(): THREE.Vector3 {
    return this.hole.tee.clone();
  }

  /** See-through balls for everyone who is not playing right now and has not finished. */
  private updateGhosts(): void {
    for (const [id, player] of this.players) {
      const show = player.inMatch && this.lastPhase === 'playing' && id !== this.active && !player.done;
      player.ghost.visible = show;
      const at = player.pos ?? this.teePosition();
      player.ghost.position.set(at.x, at.y + TUNING.ball.radius, at.z);
    }
  }

  onPhoneAim(angle: number): void {
    this.phoneAngle = angle;
  }

  /** The phone is in the middle of a swing: move the gauge and the line's length live. */
  onPhoneSwingProgress(progress: SwingProgress): void {
    if (this.state !== 'aiming') return;
    this.golfer()?.setSwing(progress.phase === 'swinging' ? progress.backswing : 0);
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

  private golfer(): Character | undefined {
    return this.active ? this.players.get(this.active)?.character : undefined;
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
      player.pos = new THREE.Vector3(p.x, p.y - TUNING.ball.radius, p.z);
      player.yaw = this.cameraYaw();
    }
    if (result !== 'holed') this.react(result); // a hole-in reacts at once, see holed()
    this.state = 'waiting';
    this.hud.gauge.hidden = true;
    this.onBallResult?.(result);
  }

  private practice(power: number, curve: number): void {
    this.golfer()?.strike(power);
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
    const player = this.active ? this.players.get(this.active) : undefined;
    if (player) {
      this.golferSpot = this.addressSpot(this.ballMesh.position, yaw, player.handedness);
      player.character.strike(power);
    }
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
        this.lastRest.set(p.x, p.y - TUNING.ball.radius, p.z);
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
    const diff = strokes - this.hole.def.par;
    const name =
      strokes === 1 ? 'HOLE IN ONE!' : ({ [-2]: 'Eagle!', [-1]: 'Birdie!', 0: 'Par', 1: 'Bogey' } as Record<number, string>)[diff];
    const strokesText = `${strokes} stroke${strokes === 1 ? '' : 's'}`;
    const who = player ? `${player.name}: ` : '';
    this.showMessage(`${who}${name ?? 'In the hole!'}\n${strokesText}`, TUNING.rules.holedPauseMs);
    this.react('holed');
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
    this.ball.setTranslation({ x: at.x, y: at.y + TUNING.ball.radius + 0.005, z: at.z }, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.curve = 0;
    this.lastRest.copy(at);
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
        this.golfer()?.setSwing(this.charging.amount * 60);
      }
    }

    const step = this.world.timestep;
    this.stepAccumulator += dt;
    while (this.stepAccumulator >= step) {
      this.hole.update(step);
      applyRollingResistance(this.ball, this.world, RAPIER, step);
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
    this.updateCharacters(dt);
    this.updateOccluders(dt);
    this.scenery.update(dt, this.camera);
    this.updateCamera(dt);
    this.composer.render(dt);
  }

  private updateAimLine(): void {
    const aiming = this.state === 'aiming';
    const yaw = this.aimYaw();
    this.aimLine.visible = aiming;
    if (!aiming) return;
    const ball = this.ballMesh.position;
    const groundY = ball.y - TUNING.ball.radius;
    this.aimLine.position.set(ball.x, groundY, ball.z);
    this.aimLine.rotation.y = yaw;

    // The line starts just in front of the ball and is as long as the rough rolling distance.
    // Each point sits on the floor below it, so the line shows ramps and bumps.
    const { width, segments } = TUNING.aimLine;
    const start = TUNING.ball.radius * 1.6;
    const length = Math.max(0.05, (this.estimate ?? TUNING.aimLine.length) - start);
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    const positions = this.aimStripe.geometry.getAttribute('position') as THREE.BufferAttribute;
    let height = 0;
    for (let i = 0; i <= segments; i++) {
      const along = start + (length * i) / segments;
      const floor = this.floorHeight(ball.x + dirX * along, ball.z + dirZ * along, ball.y + 1.5);
      if (floor !== null) height = floor - groundY;
      positions.setXYZ(i * 2, -width / 2, height + 0.015, along);
      positions.setXYZ(i * 2 + 1, width / 2, height + 0.015, along);
    }
    positions.needsUpdate = true;
  }

  /** Height of the floor at (x, z), looking down from `fromY`, or null where there is no floor. */
  private floorHeight(x: number, z: number, fromY: number): number | null {
    const floor = this.hole.floorCollider;
    const ray = new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, fromY + 2, true, undefined, undefined, undefined, undefined, (c) => c === floor);
    return hit ? fromY - hit.timeOfImpact : null;
  }

  /** Fades out big pieces (the windmill) while they stand between the camera and the ball or the aim. */
  private updateOccluders(dt: number): void {
    const occluders = this.hole.occluders;
    if (occluders.length === 0) return;
    const targets = [this.ballMesh.position.clone()];
    if (this.state === 'aiming') {
      const yaw = this.aimYaw();
      const reach = Math.max(1.5, this.estimate ?? TUNING.aimLine.length);
      targets.push(this.ballMesh.position.clone().add(new THREE.Vector3(Math.sin(yaw) * reach, 0, Math.cos(yaw) * reach)));
    }
    const raycaster = new THREE.Raycaster();
    for (const occluder of occluders) {
      const blocking = targets.some((target) => {
        const toTarget = target.clone().sub(this.camera.position);
        raycaster.set(this.camera.position, toTarget.clone().normalize());
        raycaster.far = toTarget.length();
        return raycaster.intersectObject(occluder, true).length > 0;
      });
      const goal = blocking ? TUNING.aimLine.occluderOpacity : 1;
      occluder.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const material = o.material as THREE.MeshStandardMaterial;
        material.opacity += (goal - material.opacity) * Math.min(1, dt * 8);
        material.transparent = material.opacity < 0.99;
        material.depthWrite = !material.transparent;
      });
    }
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
      // Look slightly towards the golfer's side so the character is in the picture.
      const golferSide = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      if (this.active && this.players.get(this.active)?.handedness === 'left') golferSide.negate();
      return {
        position: ball.clone().addScaledVector(dir, -c.aimDistance).addScaledVector(UP, c.aimHeight),
        look: ball.clone().addScaledVector(dir, c.aimLookAhead).addScaledVector(golferSide, c.aimSideShift),
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
    this.hud.info.textContent = `Hole ${this.hole.def.number}/${this.holes.length} · Par ${this.hole.def.par}${turn}`;
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
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
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
