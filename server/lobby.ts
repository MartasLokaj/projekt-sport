import type { WebSocket } from 'ws';
import {
  MAX_PLAYERS,
  NAME_MAX_LENGTH,
  SHIRT_COLOURS,
  type ClientMessage,
  type JoinError,
  type PlayerInfo,
  type ServerMessage,
} from '../shared/protocol.ts';

// The lobby owns the room code and the player seats. A seat is kept while
// the server runs, so a phone that drops (screen lock, Wi-Fi blip) gets it back.

const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0
const ROOM_CODE_LENGTH = 4;

type Seat = { id: string; name: string; colour: string; socket: WebSocket | null };

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

  constructor(
    readonly room: string,
    private hostInfo: ServerMessage,
  ) {}

  handle(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'host_hello':
        this.hosts.add(ws);
        send(ws, this.hostInfo);
        send(ws, this.lobbyState());
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
    }
  }

  handleClose(ws: WebSocket): void {
    this.hosts.delete(ws);
    this.phones.delete(ws);
    for (const seat of this.seats.values()) {
      if (seat.socket === ws) {
        seat.socket = null;
        this.broadcastLobby();
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
      seat = { id: msg.playerId, name, colour, socket: null };
      this.seats.set(seat.id, seat);
    }
    seat.name = name;
    seat.colour = colour;
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
    this.broadcastLobby();
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

function toInfo(seat: Seat): PlayerInfo {
  return { id: seat.id, name: seat.name, colour: seat.colour, connected: seat.socket !== null };
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function refuse(ws: WebSocket, reason: JoinError): void {
  send(ws, { type: 'join_error', reason });
}
