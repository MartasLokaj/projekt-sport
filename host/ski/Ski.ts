import * as THREE from 'three';
import { SHIRT_COLOURS, type PlayerInfo, type SkiCue } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { lookOf, type CharacterLook } from '../game/character.ts';
import type { CpuLevel } from '../hub/lobbyUi.ts';
import type { PodiumShow } from '../results/Podium.ts';
import { Backdrop } from './backdrop.ts';
import { Course } from './course.ts';
import { CpuDriver } from './cpu.ts';
import { Racer, type RacerEvent, type RacerInput } from './racer.ts';
import { SkiTrack } from './tracks.ts';

// Skiing race (SKI.md, phases S2a–S2b). Up to 4 racers: every connected phone (in join order) steers one, the
// computer fills the rest (level from the lobby card). Phones are steering wheels (S1) with TUCK and JUMP.
// The race starts when every phone has pressed Ready (or a Mac key is pressed): 3-2-1-GO, then down the run
// with its forks, gates, kickers and obstacles. One shared camera follows the leading player; whoever falls far
// behind gets a push, and much further back (or out of sight too long) is put back just behind the leader, so
// nobody is out of the race for long. Computer racers far ahead of the players are held back a little.
// When every player has crossed the line the results come, then the podium (host/main.ts).
// Graybox look until S3. Mac keyboard for testing (steers racer 1): ← → steer, ↓ tuck, hold Space and let go to
// jump, Enter shows the results after the finish, R restarts, D shows/hides the readout, L next lighting preset.

export type SkiHud = {
  info: HTMLElement;
  debug: HTMLElement;
  timer: HTMLElement;
  big: HTMLElement;
  standings: HTMLElement;
  tags: HTMLElement;
};

/** The last steering a phone sent. */
type Wheel = { steer: number; roll: number; ready: boolean; tuck: boolean; jump: boolean; at: number };
type Phase = 'waiting' | 'countdown' | 'racing' | 'finished' | 'over';

type Entry = {
  racer: Racer;
  /** The phone's player, or null for the computer (or the Mac keyboard when no phone plays). */
  playerId: string | null;
  name: string;
  look: CharacterLook;
  cpu: CpuDriver | null;
  /** Seconds this racer has been far behind (for putting it back). */
  lostFor: number;
  lastCarveCue: number;
  tag: HTMLElement;
  /** The trail this racer leaves in the snow. */
  track: SkiTrack;
};

const STEP = 1 / 120;
/** The racers wait this far above the start gate. */
const START_D = -6;
const PLACE_TEXT = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

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

  constructor(scene: THREE.Scene, count = 64) {
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
  private readonly skyLight = new THREE.HemisphereLight('#ffffff', '#9db8dd', 1.5);
  private readonly fog = new THREE.Fog('#cfe6ff', 90, 330);
  private readonly backdrop = new Backdrop();
  /** From the scene towards the sun. */
  private readonly sunDirection = new THREE.Vector3(0.5, 0.7, 0.2).normalize();
  private lookName: keyof typeof TUNING.ski.look.presets = TUNING.ski.look.preset;
  private readonly course = new Course();
  private readonly puffs: Puffs;
  private entries: Entry[] = [];
  /** The racer the camera follows (the leading player). */
  private focus: Entry | null = null;

  private phase: Phase = 'waiting';
  /** Countdown seconds left, race seconds since GO, seconds until the results. */
  private countdown = 0;
  private raceTime = 0;
  private overIn = 0;
  private goShownFor = 0;
  private accumulator = 0;
  private keySteer = 0;
  private readonly wheels = new Map<string, Wheel>();
  private level: CpuLevel = 'normal';
  private readonly keys = new Set<string>();
  /** Camera: smoothed direction (degrees), height, and how far it has pulled back to show players behind (0..1). */
  private cameraYaw = 0;
  private cameraY = 0;
  private cameraWide = 0;
  private readonly cameraLook = new THREE.Vector3();
  private introLeft = 0;
  private running = false;
  private showDebug = true;
  private frameMs = 16.7;
  private workMs = 0;
  private lastHud = 0;

  /** A cue for a player's phone (vibration, "GO!", the finish time and place). */
  onCue: ((playerId: string, cue: SkiCue, time?: number, place?: number) => void) | null = null;
  /** Every player is through and the results are ready: host/main.ts shows the podium. */
  onRaceOver: (() => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly hud: SkiHud,
  ) {
    const c = TUNING.ski;
    this.camera = new THREE.PerspectiveCamera(c.camera.fov, 1, 0.1, 2500);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TUNING.scenery.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);
    this.scene.fog = this.fog;
    this.scene.add(this.skyLight, this.backdrop.group);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const shadow = this.sun.shadow.camera;
    shadow.left = shadow.bottom = -40;
    shadow.right = shadow.top = 40;
    shadow.near = 1;
    shadow.far = 200;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.course.build(this.renderer));
    this.puffs = new Puffs(this.scene);
    this.setLook(this.lookName);
  }

  /** Switches the lighting preset (TUNING.ski.look.presets; L on the Mac cycles them). */
  setLook(name: keyof typeof TUNING.ski.look.presets): void {
    const look = TUNING.ski.look.presets[name];
    this.lookName = name;
    const e = THREE.MathUtils.degToRad(look.sunElevation);
    const a = THREE.MathUtils.degToRad(look.sunAzimuth);
    this.sunDirection.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
    this.sun.color.set(look.sun);
    this.sun.intensity = look.sunIntensity;
    this.skyLight.color.set(look.hemiSky);
    this.skyLight.groundColor.set(look.hemiGround);
    this.skyLight.intensity = look.hemiIntensity;
    this.fog.color.set(look.fog);
    this.fog.near = look.fogNear;
    this.fog.far = look.fogFar;
    this.scene.background = new THREE.Color(look.skyHorizon);
    this.renderer.toneMappingExposure = look.exposure;
    this.course.applyLook(look);
    for (const e of this.entries) e.track.applyLook(look);
    this.backdrop.applyLook(look, this.sunDirection);
  }

  // ---------- Public ----------

  /**
   * A new race: these phones' players race (first 4), the computer fills up to TUNING.ski.racers at `level`.
   * With no phone, racer 1 is steered with the Mac keyboard.
   */
  start(players: PlayerInfo[], level: CpuLevel): void {
    this.level = level;
    this.setup(players.slice(0, TUNING.ski.racers));
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
    for (const entry of this.entries) entry.tag.hidden = true;
  }

  /** New names or looks (a player edited their character): the racers follow. */
  setPlayers(players: PlayerInfo[]): void {
    for (const entry of this.entries) {
      const player = players.find((p) => p.id === entry.playerId);
      if (!player) continue;
      entry.name = entry.tag.textContent = player.name;
      entry.look = lookOf(player);
      entry.racer.setLook(entry.look);
    }
  }

  /** A phone's steering (about 30 a second). */
  onPhoneSteer(playerId: string, steer: number, roll: number, ready: boolean, tuck: boolean, jump: boolean): void {
    this.wheels.set(playerId, { steer, roll, ready, tuck, jump, at: performance.now() });
  }

  /** The results for the podium: by finish time (racers still on the run get an estimated time). */
  podium(): PodiumShow {
    const ranked = this.ranking();
    const players = this.humans().length;
    return {
      game: 'ski',
      title: `${ranked[0].name} wins!`,
      subtitle: `Skiing · ${players} player${players === 1 ? '' : 's'} · CPU ${this.level}`,
      entries: ranked.map((e, i) => ({ name: e.name, look: e.look, place: i + 1, detail: formatTime(this.timeOf(e)) })),
    };
  }

  // ---------- Race ----------

  private setup(players: PlayerInfo[]): void {
    for (const entry of this.entries) {
      this.scene.remove(entry.racer.group, entry.track.mesh);
      entry.track.dispose();
      entry.tag.remove();
    }
    this.entries = [];
    const taken = new Set(players.map((p) => p.colour));
    const free = SHIRT_COLOURS.filter((colour) => !taken.has(colour));
    const skins = TUNING.ski.cpuSkins;
    const make = (playerId: string | null, name: string, look: CharacterLook, cpu: CpuDriver | null): void => {
      const racer = new Racer();
      racer.setLook(look);
      this.scene.add(racer.group);
      const tag = document.createElement('div');
      tag.className = 'ski-tag';
      tag.textContent = name;
      tag.style.borderColor = look.shirt;
      this.hud.tags.append(tag);
      const track = new SkiTrack(this.course);
      track.applyLook(TUNING.ski.look.presets[this.lookName]);
      this.scene.add(track.mesh);
      this.entries.push({ racer, playerId, name, look, cpu, lostFor: 0, lastCarveCue: 0, tag, track });
    };
    for (const player of players) make(player.id, player.name, lookOf(player), null);
    // With no phone the Mac keyboard steers racer 1.
    if (players.length === 0) make(null, 'You', { shirt: free.shift() ?? '#ff8a3d', skin: '#f3c79a', handedness: 'right' }, null);
    for (let n = 1; this.entries.length < TUNING.ski.racers; n++) {
      const look = { shirt: free.shift() ?? '#8d97a3', skin: skins[n % skins.length], handedness: 'right' as const };
      make(null, `CPU ${n}`, look, new CpuDriver(this.level));
    }
  }

  /** Everyone back at the start gate, side by side. */
  private reset(): void {
    const c = TUNING.ski;
    const n = this.entries.length;
    this.entries.forEach((e, i) => {
      const x = this.course.centre(START_D) + (i - (n - 1) / 2) * c.startSpacing;
      e.racer.body.reset(this.course, START_D, x);
      e.lostFor = 0;
      e.track.clear();
      if (e.cpu) e.cpu = new CpuDriver(this.level);
      e.racer.update(0, this.course);
    });
    this.phase = 'waiting';
    this.raceTime = 0;
    this.goShownFor = 0;
    this.accumulator = 0;
    this.overIn = 0;
    this.hud.big.hidden = true;
    for (const gate of this.course.gates) if (gate.flags) (gate.flags.userData.flag as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    this.focus = this.entries[0] ?? null;
    this.cameraYaw = this.course.direction(START_D);
    this.cameraY = (this.focus?.racer.body.y ?? 0) + c.camera.height;
    this.cameraWide = 0;
    this.placeCamera(true, 0);
  }

  private startCountdown(): void {
    if (this.phase !== 'waiting') return;
    this.phase = 'countdown';
    this.countdown = TUNING.ski.countdownSeconds;
  }

  /** Players (phones, or the Mac keyboard's racer). */
  private humans(): Entry[] {
    return this.entries.filter((e) => !e.cpu);
  }

  private wheelOf(e: Entry): Wheel | null {
    if (!e.playerId) return null;
    const wheel = this.wheels.get(e.playerId);
    return wheel && performance.now() - wheel.at <= TUNING.ski.silentMs ? wheel : null;
  }

  private cue(e: Entry, cue: SkiCue, time?: number, place?: number): void {
    if (e.playerId) this.onCue?.(e.playerId, cue, time, place);
  }

  /** A player's controls; the Mac keyboard also steers racer 1 while a key is held (or still easing back). */
  private input(e: Entry, index: number): RacerInput {
    const wheel = this.wheelOf(e);
    const key = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    const keyed = index === 0 && (key !== 0 || this.keySteer !== 0);
    return {
      steer: keyed ? this.keySteer : wheel?.ready ? wheel.steer : 0,
      tuck: (index === 0 && this.keys.has('ArrowDown')) || (wheel?.tuck ?? false),
      jump: (index === 0 && this.keys.has(' ')) || (wheel?.jump ?? false),
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

    // Start when every phone in the race is ready (a race of only the Mac keyboard waits for a key).
    const phones = this.entries.filter((e) => e.playerId);
    if (this.phase === 'waiting' && this.introLeft <= 0 && phones.length > 0 && phones.every((e) => this.wheelOf(e)?.ready)) this.startCountdown();
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.goShownFor = 0.8;
        for (const e of this.entries) this.cue(e, 'go');
      }
    }

    const events = new Map<Entry, RacerEvent[]>(this.entries.map((e) => [e, []]));
    if (this.phase === 'racing' || this.phase === 'finished' || this.phase === 'over') {
      this.accumulator += dt;
      const inputs = this.entries.map((e, i) => (e.cpu ? null : this.input(e, i)));
      while (this.accumulator >= STEP) {
        this.focus = this.pickFocus();
        this.entries.forEach((e, i) => {
          const input = e.cpu ? e.cpu.input(e.racer.body, this.course, STEP) : { ...inputs[i]! };
          input.push = (input.push ?? 0) + this.catchUp(e);
          e.racer.body.step(STEP, input, this.course, this.raceTime, events.get(e)!);
        });
        this.bump();
        if (this.phase === 'racing') this.raceTime += STEP;
        this.accumulator -= STEP;
      }
      this.keepTogether(dt);
    } else {
      // Waiting at the gate: the skis still turn with the steering, so each player sees it works.
      this.entries.forEach((e, i) => {
        if (!e.cpu) e.racer.body.steer = this.input(e, i).steer;
      });
    }
    for (const [e, list] of events) this.handleEvents(e, list);
    this.goShownFor = Math.max(0, this.goShownFor - dt);

    // Every player through: the results come a moment later.
    if (this.phase === 'racing' && this.humans().every((e) => e.racer.body.finished)) {
      this.phase = 'finished';
      this.overIn = c.resultsDelay;
    }
    if (this.phase === 'finished') {
      this.overIn -= dt;
      if (this.overIn <= 0) this.endRace();
    }

    for (const e of this.entries) {
      e.racer.update(dt, this.course);
      e.track.update(e.racer.body);
    }
    this.course.showAround(this.focus?.racer.body.d ?? 0);
    this.puffs.update(dt);
    this.fadeGates(dt);
    this.placeSun();
    this.placeCamera(false, dt);
    this.backdrop.follow(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.placeTags();
    this.workMs += (performance.now() - started - this.workMs) * 0.05;
    this.renderHud();
  }

  private endRace(): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.onRaceOver?.();
  }

  /** The leading player still racing (or the leading player once all are through). */
  private pickFocus(): Entry | null {
    const humans = this.humans();
    const racing = humans.filter((e) => !e.racer.body.finished);
    const pool = racing.length ? racing : humans.length ? humans : this.entries;
    return pool.reduce<Entry | null>((best, e) => (!best || e.racer.body.d > best.racer.body.d ? e : best), null);
  }

  /** Extra push (m/s²): catching up when far behind the leading player, held back when a CPU runs away. */
  private catchUp(e: Entry): number {
    const c = TUNING.ski;
    const focus = this.focus;
    if (!focus || e === focus || this.phase !== 'racing' || e.racer.body.finished) return 0;
    const gap = focus.racer.body.d - e.racer.body.d;
    if (gap > c.catchUpFrom) return Math.min(1, (gap - c.catchUpFrom) / (c.catchUpFull - c.catchUpFrom)) * c.catchUpPush;
    if (e.cpu && -gap > c.cpuLeadMax) return -Math.min(1, (-gap - c.cpuLeadMax) / c.cpuLeadMax) * c.cpuHoldBack;
    return 0;
  }

  /** Racers far behind (or a while out of sight behind) are put back just behind the leader, on the leader's way. */
  private keepTogether(dt: number): void {
    const c = TUNING.ski;
    const focus = this.focus;
    if (!focus || this.phase !== 'racing') return;
    const lead = focus.racer.body;
    for (const e of this.entries) {
      const b = e.racer.body;
      if (e === focus || b.finished || b.crashLeft > 0) {
        e.lostFor = 0;
        continue;
      }
      const gap = lead.d - b.d;
      e.lostFor = gap > c.respawnGap * 0.5 ? e.lostFor + dt : 0;
      if (gap <= c.respawnGap && e.lostFor < c.respawnSeconds) continue;
      const d = Math.max(0, lead.d - c.respawnBehind);
      const lanes = this.course.lanes(d);
      const lane = lanes[this.course.laneIndex(lead.x, d)] ?? lanes[0];
      const speed = lead.speed * 0.9;
      b.reset(this.course, d, lane.c + (Math.random() * 2 - 1) * lane.hw * 0.5);
      b.speed = speed;
      b.ghostLeft = 1.5;
      e.lostFor = 0;
      e.racer.update(0, this.course);
      this.puffs.burst(e.racer.group.position, 10, 1.2, 2.5);
      this.cue(e, 'respawn');
    }
  }

  /** Racers bump each other apart (no crash). */
  private bump(): void {
    const reach = TUNING.ski.bumpDistance;
    for (let i = 0; i < this.entries.length; i++) {
      for (let j = i + 1; j < this.entries.length; j++) {
        const a = this.entries[i].racer.body;
        const b = this.entries[j].racer.body;
        if (a.ghostLeft > 0 || b.ghostLeft > 0 || Math.abs(a.y - b.y) > 1) continue;
        const dx = b.x - a.x;
        const dd = b.d - a.d;
        const distance = Math.hypot(dx, dd);
        if (distance >= reach || distance < 1e-4) continue;
        const push = (reach - distance) / 2;
        a.x -= (dx / distance) * push;
        a.d -= (dd / distance) * push;
        b.x += (dx / distance) * push;
        b.d += (dd / distance) * push;
        const mean = (a.speed + b.speed) / 2;
        a.speed += (mean - a.speed) * 0.2;
        b.speed += (mean - b.speed) * 0.2;
      }
    }
  }

  private handleEvents(e: Entry, events: RacerEvent[]): void {
    const b = e.racer.body;
    const feet = e.racer.group.position;
    for (const event of events) {
      if (event === 'crash') {
        this.puffs.burst(feet, 14, 1.4, 4);
        this.cue(e, 'crash');
      } else if (event === 'land_big') {
        this.puffs.burst(feet, 10, 1.1, 3);
        this.cue(e, 'land_big');
      } else if (event === 'land') {
        this.puffs.burst(feet, 4, 0.7, 2);
      } else if (event === 'jump') {
        this.puffs.burst(feet, 4, 0.6, 1.5);
      } else if (event === 'gate') {
        const gate = this.course.gates.filter((g) => g.d <= b.d && Math.abs(g.x - b.x) < g.width).at(-1);
        if (gate?.flags) (gate.flags.userData.flag as THREE.MeshStandardMaterial).emissiveIntensity = 1;
        this.cue(e, 'gate');
      } else if (event === 'finish') {
        const time = b.finishTime ?? this.raceTime;
        const place = this.entries.filter((o) => o.racer.body.finishTime !== null && o.racer.body.finishTime <= time).length;
        this.cue(e, 'finish', Math.round(time * 1000), place);
      }
    }
    const now = performance.now();
    if (this.phase === 'racing' && !b.air && b.turnRate > TUNING.ski.carveCueRate && now - e.lastCarveCue > TUNING.ski.carveCueMs) {
      e.lastCarveCue = now;
      this.cue(e, 'carve');
    }
  }

  /** A racer's time: the finish time, or an estimate for one still on the run. */
  private timeOf(e: Entry): number {
    const b = e.racer.body;
    if (b.finishTime !== null) return b.finishTime;
    return this.raceTime + Math.max(0, this.course.length - b.d) / Math.max(10, b.speed);
  }

  /** Finished racers by time, then the others by how far down they are (by estimated time once it is over). */
  private ranking(): Entry[] {
    return [...this.entries].sort((a, b) => {
      const fa = a.racer.body.finished;
      const fb = b.racer.body.finished;
      if (fa && fb) return this.timeOf(a) - this.timeOf(b);
      if (fa !== fb) return fa ? -1 : 1;
      if (this.phase === 'over') return this.timeOf(a) - this.timeOf(b);
      return b.racer.body.d - a.racer.body.d;
    });
  }

  private fadeGates(dt: number): void {
    for (const gate of this.course.gates) {
      const flag = gate.flags?.userData.flag as THREE.MeshStandardMaterial | undefined;
      if (flag && flag.emissiveIntensity > 0) flag.emissiveIntensity = Math.max(0, flag.emissiveIntensity - dt * 1.5);
    }
  }

  /** The sun (and its shadow box) follows the camera's racer. */
  private placeSun(): void {
    const at = this.focus?.racer.group.position ?? new THREE.Vector3();
    this.sun.target.position.copy(at);
    this.sun.position.copy(at).addScaledVector(this.sunDirection, 90);
  }

  /**
   * Low behind the leading player, turning between the run's direction and the skis'; further back and wider at
   * speed, and further back and higher while another player is a little behind (so both are in the picture).
   */
  private placeCamera(snap: boolean, dt: number): void {
    const cam = TUNING.ski.camera;
    const focus = this.focus;
    if (!focus) return;
    const b = focus.racer.body;
    const run = this.course.direction(b.d, b.x);
    const yaw = run + (b.heading - run) * cam.followSkis;
    const blend = snap ? 1 : 1 - Math.exp(-cam.follow * dt);
    this.cameraYaw += (yaw - this.cameraYaw) * blend;
    let behind = 0;
    for (const e of this.humans()) {
      const gap = b.d - e.racer.body.d;
      if (e !== focus && !e.racer.body.finished && gap > 0 && gap < 40) behind = Math.max(behind, gap);
    }
    this.cameraWide += (Math.min(1, behind / 25) - this.cameraWide) * (snap ? 1 : 1 - Math.exp(-2 * dt));
    const a = THREE.MathUtils.degToRad(this.cameraYaw);
    const back = cam.back + cam.backPerSpeed * b.speed + this.cameraWide * 7;
    let x = b.x - Math.sin(a) * back;
    let d = b.d - Math.cos(a) * back;
    let height = cam.height + this.cameraWide * 3.5;
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
    const fov = cam.fov + cam.fovPerSpeed * b.speed + this.cameraWide * 6;
    if (Math.abs(fov - this.camera.fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Name tags above the racers (hidden when behind the camera or far away). */
  private placeTags(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const point = new THREE.Vector3();
    for (const e of this.entries) {
      point.copy(e.racer.group.position);
      point.y += 2.4;
      const distance = point.distanceTo(this.camera.position);
      point.project(this.camera);
      const shown = point.z < 1 && distance < 120 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1;
      e.tag.hidden = !shown;
      if (!shown) continue;
      const scale = Math.max(0.6, Math.min(1, 30 / distance));
      e.tag.style.transform = `translate(${((point.x + 1) / 2) * width}px, ${((1 - point.y) / 2) * height}px) translate(-50%, -100%) scale(${scale})`;
    }
  }

  private renderHud(): void {
    // The countdown and GO are shown every frame (they change quickly), the rest ten times a second.
    const big = this.phase === 'countdown' ? String(Math.ceil(this.countdown)) : this.goShownFor > 0 ? 'GO!' : '';
    this.hud.big.hidden = big === '';
    if (this.hud.big.textContent !== big) this.hud.big.textContent = big;
    const now = performance.now();
    if (now - this.lastHud < 100) return;
    this.lastHud = now;
    const focus = this.focus;
    this.hud.timer.textContent = formatTime(this.raceTime);

    const phones = this.entries.filter((e) => e.playerId);
    const waiting = phones.filter((e) => !this.wheelOf(e)?.ready).map((e) => e.name);
    const through = this.humans().filter((e) => e.racer.body.finished).length;
    this.hud.info.textContent =
      this.phase === 'waiting'
        ? phones.length === 0
          ? 'No phone: press Space to start (← → steer)'
          : waiting.length
            ? `Waiting for ${waiting.join(', ')} to press Ready`
            : 'Ready!'
        : this.phase === 'countdown'
          ? 'Get ready…'
          : this.phase === 'racing'
            ? `${through}/${this.humans().length} player${this.humans().length === 1 ? '' : 's'} through`
            : 'Results coming… (Enter)';

    this.hud.standings.replaceChildren(
      ...this.ranking().map((e, i) => {
        const row = document.createElement('div');
        row.className = 'ski-row';
        if (e === focus) row.classList.add('focus');
        const dot = document.createElement('span');
        dot.className = 'ski-dot';
        dot.style.background = e.look.shirt;
        const time = e.racer.body.finished ? ` · ${formatTime(this.timeOf(e))}` : '';
        row.append(`${PLACE_TEXT[i]} `, dot, ` ${e.name}${time}`);
        return row;
      }),
    );

    this.hud.debug.hidden = !this.showDebug;
    const b = focus?.racer.body;
    if (!this.showDebug || !b || !focus) return;
    const wheel = this.wheelOf(focus);
    const signed = (n: number): string => `${n > 0 ? '+' : ''}${n}`;
    this.hud.debug.textContent = [
      `Camera on    ${focus.name}`,
      `Speed        ${Math.round(b.speed * 3.6)} km/h`,
      `Phone tilt   ${wheel?.ready ? `${signed(Math.round(wheel.roll))}°` : '–'}`,
      `Steering     ${signed(Math.round(b.steer * 100))} %${b.tuck ? '  TUCK' : ''}${b.crouch > 0 ? '  JUMP…' : ''}`,
      `Gates        ${b.gatesPassed}/${this.course.gates.length}`,
      `Look         ${TUNING.ski.look.presets[this.lookName].label} · L next`,
      `Frame        ${this.frameMs.toFixed(1)} ms (work ${this.workMs.toFixed(1)} ms) · D hides`,
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
    } else if (e.key === 'Enter' && this.phase === 'finished') this.endRace();
    else if (e.key === 'r' || e.key === 'R') this.reset();
    else if (e.key === 'd' || e.key === 'D') this.showDebug = !this.showDebug;
    else if (e.key === 'l' || e.key === 'L') {
      const names = Object.keys(TUNING.ski.look.presets) as (keyof typeof TUNING.ski.look.presets)[];
      this.setLook(names[(names.indexOf(this.lookName) + 1) % names.length]);
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
