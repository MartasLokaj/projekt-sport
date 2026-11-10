import type { WebSocket } from 'ws';
import {
  HOLE_COUNT,
  MAX_PLAYERS,
  NAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  SENSITIVITY_DEFAULT,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  SHIRT_COLOURS,
  SKIN_TONES,
  type BadmintonSwing,
  type ClientMessage,
  type CourseId,
  type Handedness,
  type JoinError,
  type PlayerInfo,
  type ServerMessage,
  type Stroke,
} from '../shared/protocol.ts';
import { DEFAULT_LOOK, sanitizeLook, type AvatarLook } from '../shared/avatar.ts';
import { TUNING } from '../shared/tuning.ts';
import { Match } from './match.ts';

// The lobby owns the room code, the player seats and the match. A seat is kept while
// the server runs, so a phone that drops (screen lock, Wi-Fi blip) gets it back.
// During a match only the current player's aim, swings and strokes reach the host.

const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0

type Seat = {
  id: string;
  name: string;
  colour: string;
  skinTone: string;
  handedness: Handedness;
  sensitivity: number;
  look: AvatarLook;
  socket: WebSocket | null;
  lastStrokeAt: number;
};

/** The holes of a new game: all of them, or `holes` of them picked at random (kept in course order). */
export function pickCourse(id: CourseId): number[] {
  const all = Array.from({ length: HOLE_COUNT }, (_, i) => i);
  const count = Math.min(HOLE_COUNT, TUNING.rules.courses[id].holes);
  if (count >= HOLE_COUNT) return all;
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count).sort((a, b) => a - b);
}

export function makeRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_LETTERS[Math.floor(Math.random() * ROOM_LETTERS.length)];
  }
  return code;
}

export class Lobby {
  /** Seats in join order, by player id. */
  private seats = new Map<string, Seat>();
  private hosts = new Set<WebSocket>();
  /** Phones that know the right room code (joined or looking at the join form). */
  private phones = new Set<WebSocket>();
  private match = new Match();
  /** The minigolf course last chosen on the big screen (3 random holes or all of them). */
  private course: CourseId = 'short';
  /** Whether the Badminton Swing Lab is open (phones then show the swing test). */
  private lab = false;
  /** Whether Curling is open (phones then show the swing screen instead of "waiting for the game"). */
  private curling = false;
  /** Whether Skiing is open (phones then show the steering-wheel screen). */
  private ski = false;
  /** When each player's steering was last saved to the log (server clock). */
  private skiLoggedAt = new Map<string, number>();
  /** Called with a steering sample now and then, so the server can save it for tuning. */
  onSkiSteer: ((entry: object) => void) | null = null;
  /** Called for every badminton swing, so the server can save it for tuning. */
  onBadmintonSwing: ((entry: object) => void) | null = null;
  /** Called with how the host judged each badminton swing (saved to the outcome log). */
  onBadmintonOutcome: ((entry: object) => void) | null = null;
  private readonly isConnected = (id: string): boolean => this.seats.get(id)?.socket != null;

  /** Called when the big screen asks for a new room (host/main.ts → reset_room); index.ts makes the new code. */
  onResetRoom: (() => void) | null = null;

  constructor(
    private room: string,
    private hostInfo: ServerMessage,
  ) {}

  /** New address or QR code (the Mac moved to another network, or a new room): every big screen gets it. */
  setHostInfo(info: ServerMessage): void {
    this.hostInfo = info;
    for (const ws of this.hosts) send(ws, info);
  }

  /** A fresh room: new code, no seats, no match. Phones are told to join again with the new code. */
  resetRoom(room: string, info: ServerMessage): void {
    for (const ws of this.phones) refuse(ws, 'room_reset');
    this.phones.clear();
    this.seats.clear();
    this.match.end();
    this.lab = false;
    this.curling = false;
    this.ski = false;
    this.room = room;
    this.setHostInfo(info);
    this.broadcastLobby();
    this.broadcastGame();
    for (const ws of this.hosts) send(ws, { type: 'lab_state', on: false });
    for (const ws of this.hosts) send(ws, { type: 'curling_state', on: false });
    for (const ws of this.hosts) send(ws, { type: 'ski_state', on: false });
  }

  handle(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'host_hello':
        this.hosts.add(ws);
        send(ws, this.hostInfo);
        send(ws, this.lobbyState());
        send(ws, this.gameState());
        send(ws, { type: 'lab_state', on: this.lab });
        send(ws, { type: 'curling_state', on: this.curling });
        send(ws, { type: 'ski_state', on: this.ski });
        return;
      case 'rejoin':
        if (!this.checkRoom(ws, msg.room)) return;
        send(ws, this.lobbyState());
        if (typeof msg.playerId !== 'string') return refuse(ws, 'invalid');
        {
          const seat = this.seats.get(msg.playerId);
          if (seat) this.attach(ws, seat);
          else refuse(ws, 'not_joined');
        }
        return;
      case 'join':
        if (!this.checkRoom(ws, msg.room)) return;
        this.join(ws, msg);
        return;
      case 'set_look': {
        const seat = this.seatOf(ws);
        if (!seat || !this.match.canStart || typeof msg !== 'object') return;
        const colourTaken = [...this.seats.values()].some((s) => s.colour === msg.colour && s.id !== seat.id);
        if ((SHIRT_COLOURS as readonly string[]).includes(msg.colour) && !colourTaken) seat.colour = msg.colour;
        if ((SKIN_TONES as readonly string[]).includes(msg.skinTone)) seat.skinTone = msg.skinTone;
        seat.handedness = msg.handedness === 'left' ? 'left' : 'right';
        seat.look = sanitizeLook(msg.look);
        this.broadcastLobby();
        if (msg.saved === true) this.sendToHosts({ type: 'player_look_saved', playerId: seat.id });
        return;
      }
      case 'aim': {
        const seat = this.seatOf(ws);
        if (!seat || !this.mayAct(seat) || !Number.isFinite(msg.angle)) return;
        this.sendToHosts({ type: 'player_aim', playerId: seat.id, angle: clamp(msg.angle, -180, 180) });
        return;
      }
      case 'stroke': {
        const seat = this.seatOf(ws);
        const stroke = cleanStroke(msg);
        if (!seat || !stroke || !this.mayAct(seat)) return;
        // Safety net for "one swing = one stroke", even if a phone sends twice.
        const now = Date.now();
        if (now - seat.lastStrokeAt < TUNING.network.minStrokeIntervalMs) return;
        seat.lastStrokeAt = now;
        this.sendToHosts({ type: 'player_stroke', playerId: seat.id, ...stroke });
        if (this.match.playing) {
          this.match.stroke(seat.id);
          this.broadcastGame();
        }
        return;
      }
      case 'practice': {
        const seat = this.seatOf(ws);
        const stroke = cleanStroke(msg);
        if (seat && stroke && this.mayAct(seat)) this.sendToHosts({ type: 'player_practice', playerId: seat.id, ...stroke });
        return;
      }
      case 'swing_progress': {
        const seat = this.seatOf(ws);
        if (!seat || !this.mayAct(seat) || !Number.isFinite(msg.power) || !Number.isFinite(msg.backswing)) return;
        const phase = msg.phase === 'ready' || msg.phase === 'swinging' ? msg.phase : 'cancelled';
        this.sendToHosts({
          type: 'player_swing_progress',
          playerId: seat.id,
          practice: msg.practice === true,
          phase,
          backswing: clamp(msg.backswing, 0, 180),
          power: clamp(msg.power, 0, 100),
        });
        return;
      }
      case 'start_game': {
        const fromLeader = this.seatOf(ws)?.id === this.leaderId();
        if (!this.hosts.has(ws) && !fromLeader) return;
        if (!this.match.canStart || this.curling || this.ski) return;
        const players = [...this.seats.values()].filter((s) => s.socket).map((s) => s.id);
        if (players.length === 0) return;
        // The course chosen on the big screen; a start from the leader's phone (no course) plays the last one again.
        if (msg.course === 'short' || msg.course === 'full') this.course = msg.course;
        const firstHole = Math.max(0, Math.min(HOLE_COUNT - 1, Math.floor(Number(msg.firstHole) || 0)));
        // The testing shortcut (start at hole N) always plays the full course.
        this.match.start(players, this.isConnected, pickCourse(firstHole > 0 ? 'full' : this.course), firstHole);
        this.broadcastGame();
        return;
      }
      case 'next_hole': {
        const fromLeader = this.seatOf(ws)?.id === this.leaderId();
        if (!this.hosts.has(ws) && !fromLeader) return;
        this.match.nextHole(this.isConnected);
        this.broadcastGame();
        return;
      }
      case 'end_game':
        if (!this.hosts.has(ws)) return;
        this.match.end();
        this.broadcastGame();
        return;
      case 'ball_result':
        if (!this.hosts.has(ws) || !['rest', 'holed', 'out'].includes(msg.result)) return;
        this.match.ballResult(msg.result, this.isConnected);
        this.broadcastGame();
        return;
      case 'curling_mode':
        if (!this.hosts.has(ws) || this.match.playing || this.lab || this.ski) return;
        this.curling = msg.on === true;
        for (const socket of [...this.hosts, ...this.phones]) send(socket, { type: 'curling_state', on: this.curling });
        return;
      case 'lab_mode':
        if (!this.hosts.has(ws) || this.match.playing || this.curling || this.ski) return;
        this.lab = msg.on === true;
        for (const socket of [...this.hosts, ...this.phones]) send(socket, { type: 'lab_state', on: this.lab });
        return;
      case 'ski_mode':
        if (!this.hosts.has(ws) || this.match.playing || this.lab || this.curling) return;
        this.ski = msg.on === true;
        for (const socket of [...this.hosts, ...this.phones]) send(socket, { type: 'ski_state', on: this.ski });
        return;
      case 'ski_steer': {
        const seat = this.seatOf(ws);
        if (!seat || !this.ski || !Number.isFinite(msg.steer) || !Number.isFinite(msg.roll)) return;
        const steer = clamp(msg.steer, -1, 1);
        const roll = clamp(msg.roll, -180, 180);
        const ready = msg.ready === true;
        this.sendToHosts({ type: 'player_ski_steer', playerId: seat.id, steer, roll, ready });
        const now = Date.now();
        if (ready && now - (this.skiLoggedAt.get(seat.id) ?? 0) >= TUNING.ski.steer.logEveryMs) {
          this.skiLoggedAt.set(seat.id, now);
          this.onSkiSteer?.({ t: now, player: seat.name, sensitivity: seat.sensitivity, roll: Math.round(roll * 10) / 10, steer: Math.round(steer * 1000) / 1000 });
        }
        return;
      }
      case 'clock_ping':
        if (Number.isFinite(msg.t)) send(ws, { type: 'clock_pong', t: msg.t, server: Date.now() });
        return;
      case 'badminton_swing': {
        const seat = this.seatOf(ws);
        const swing = cleanBadmintonSwing(msg);
        if (!seat || !swing || !this.lab) return;
        const receivedAt = Date.now();
        this.sendToHosts({ type: 'player_badminton_swing', playerId: seat.id, receivedAt, ...swing });
        this.onBadmintonSwing?.({ player: seat.name, handedness: seat.handedness, sensitivity: seat.sensitivity, receivedAt, ...swing });
        return;
      }
      case 'badminton_cue': {
        if (!this.hosts.has(ws) || !['smash_chance', 'super_smash', 'perfect', 'your_turn'].includes(msg.cue)) return;
        const socket = this.seats.get(msg.playerId)?.socket;
        if (socket) send(socket, { type: 'badminton_cue', cue: msg.cue });
        return;
      }
      case 'badminton_outcome': {
        if (!this.hosts.has(ws) || typeof msg.outcome !== 'object' || msg.outcome === null) return;
        if (JSON.stringify(msg.outcome).length > 2000) return;
        this.onBadmintonOutcome?.(msg.outcome);
        return;
      }
      case 'reset_room':
        if (this.hosts.has(ws)) this.onResetRoom?.();
        return;
      case 'kick_player': {
        if (!this.hosts.has(ws) || this.match.playing || typeof msg.playerId !== 'string') return;
        const seat = this.seats.get(msg.playerId);
        if (!seat) return;
        this.seats.delete(seat.id);
        // The phone forgets the room code: to come back it must type the code (or scan the QR) again.
        if (seat.socket) {
          refuse(seat.socket, 'kicked');
          this.phones.delete(seat.socket);
        }
        this.broadcastLobby();
        this.broadcastGame(); // the leader may have changed
        return;
      }
      case 'host_stroke': {
        const current = this.match.currentPlayer;
        if (!this.hosts.has(ws) || current === null) return;
        this.match.stroke(current);
        this.broadcastGame();
        return;
      }
    }
  }

  /** In the lobby every phone may try its controls; during a match only the current player. */
  private mayAct(seat: Seat): boolean {
    return !this.match.playing || this.match.canAct(seat.id);
  }

  private leaderId(): string | null {
    for (const seat of this.seats.values()) if (seat.socket) return seat.id;
    return null;
  }

  private gameState(): ServerMessage {
    return { type: 'game_state', ...this.match.state(this.leaderId()) };
  }

  private broadcastGame(): void {
    const msg = this.gameState();
    for (const ws of [...this.hosts, ...this.phones]) send(ws, msg);
  }

  private seatOf(ws: WebSocket): Seat | undefined {
    for (const seat of this.seats.values()) if (seat.socket === ws) return seat;
    return undefined;
  }

  private sendToHosts(msg: ServerMessage): void {
    for (const ws of this.hosts) send(ws, msg);
  }

  handleClose(ws: WebSocket): void {
    this.hosts.delete(ws);
    this.phones.delete(ws);
    for (const seat of this.seats.values()) {
      if (seat.socket === ws) {
        seat.socket = null;
        this.broadcastLobby();
        this.match.skipIfAway(this.isConnected);
        this.broadcastGame();
      }
    }
  }

  private join(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join' }>): void {
    const name = typeof msg.name === 'string' ? msg.name.trim() : '';
    const colour = msg.colour;
    if (
      typeof msg.playerId !== 'string' ||
      name.length === 0 ||
      name.length > NAME_MAX_LENGTH ||
      !(SHIRT_COLOURS as readonly string[]).includes(colour)
    ) {
      return refuse(ws, 'invalid');
    }
    const colourTaken = [...this.seats.values()].some((s) => s.colour === colour && s.id !== msg.playerId);
    if (colourTaken) return refuse(ws, 'colour_taken');

    let seat = this.seats.get(msg.playerId);
    if (!seat) {
      if (this.seats.size >= MAX_PLAYERS) return refuse(ws, 'game_full');
      seat = {
        id: msg.playerId,
        name,
        colour,
        skinTone: SKIN_TONES[0],
        handedness: 'right',
        sensitivity: SENSITIVITY_DEFAULT,
        look: DEFAULT_LOOK,
        socket: null,
        lastStrokeAt: 0,
      };
      this.seats.set(seat.id, seat);
    }
    seat.name = name;
    seat.colour = colour;
    seat.skinTone = (SKIN_TONES as readonly string[]).includes(msg.skinTone) ? msg.skinTone : SKIN_TONES[0];
    seat.handedness = msg.handedness === 'left' ? 'left' : 'right';
    seat.sensitivity = Number.isFinite(msg.sensitivity)
      ? Math.round(clamp(msg.sensitivity, SENSITIVITY_MIN, SENSITIVITY_MAX))
      : SENSITIVITY_DEFAULT;
    seat.look = sanitizeLook(msg.look);
    this.attach(ws, seat);
  }

  private attach(ws: WebSocket, seat: Seat): void {
    const old = seat.socket;
    if (old && old !== ws) {
      send(old, { type: 'join_error', reason: 'replaced' });
      old.close();
    }
    seat.socket = ws;
    send(ws, { type: 'joined', player: toInfo(seat) });
    send(ws, { type: 'lab_state', on: this.lab });
    send(ws, { type: 'curling_state', on: this.curling });
    send(ws, { type: 'ski_state', on: this.ski });
    this.broadcastLobby();
    this.broadcastGame(); // the leader may have changed
  }

  private checkRoom(ws: WebSocket, room: unknown): boolean {
    if (typeof room !== 'string' || room.toUpperCase() !== this.room) {
      refuse(ws, 'wrong_room');
      return false;
    }
    this.phones.add(ws);
    return true;
  }

  private lobbyState(): ServerMessage {
    return { type: 'lobby_state', players: [...this.seats.values()].map(toInfo) };
  }

  private broadcastLobby(): void {
    const msg = this.lobbyState();
    for (const ws of [...this.hosts, ...this.phones]) send(ws, msg);
  }
}

/** Checks the numbers a phone sent for a stroke or practice swing. */
function cleanStroke(msg: Stroke): Stroke | null {
  if (!Number.isFinite(msg.power) || !Number.isFinite(msg.angle)) return null;
  return {
    power: clamp(msg.power, 0, 100),
    angle: clamp(msg.angle, -180, 180),
    mode: msg.mode === 'slingshot' ? 'slingshot' : 'swing',
    twist: Number.isFinite(msg.twist) ? clamp(msg.twist as number, -90, 90) : null,
    backswing: Number.isFinite(msg.backswing) ? msg.backswing : null,
    speed: Number.isFinite(msg.speed) ? msg.speed : null,
    radius: Number.isFinite(msg.radius) ? msg.radius : null,
  };
}

/** Checks the numbers a phone sent for a badminton swing. */
function cleanBadmintonSwing(msg: BadmintonSwing): BadmintonSwing | null {
  if (![msg.speed, msg.power, msg.aim, msg.tilt, msg.at].every(Number.isFinite)) return null;
  const trace = Array.isArray(msg.trace)
    ? msg.trace
        .slice(0, 200)
        .filter((p) => Array.isArray(p) && p.length >= 3 && p.length <= 8 && p.every(Number.isFinite))
    : [];
  return {
    ignored: msg.ignored === true,
    short: msg.short === true,
    speed: clamp(msg.speed, 0, 5000),
    power: clamp(msg.power, 0, 100),
    aim: clamp(msg.aim, -1, 1),
    tilt: clamp(msg.tilt, -90, 90),
    at: msg.at,
    fused: msg.fused === true,
    trace,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toInfo(seat: Seat): PlayerInfo {
  return {
    id: seat.id,
    name: seat.name,
    colour: seat.colour,
    skinTone: seat.skinTone,
    connected: seat.socket !== null,
    handedness: seat.handedness,
    sensitivity: seat.sensitivity,
    look: seat.look,
  };
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function refuse(ws: WebSocket, reason: JoinError): void {
  send(ws, { type: 'join_error', reason });
}
