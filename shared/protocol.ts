// JSON messages sent over the WebSocket between server, host and phones.

export const WS_PATH = '/ws';

export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX_LENGTH = 12;
export const SHIRT_COLOURS = ['#ff5a5f', '#ffb400', '#3ec300', '#00a6ed', '#9b5cff', '#ff7ac6'] as const;

export type PlayerInfo = { id: string; name: string; colour: string; connected: boolean };

/** How the phone hits: swinging the phone, or pulling back a finger like a slingshot. */
export type ControlMode = 'swing' | 'slingshot';

/**
 * A hit from a phone.
 * angle: aim in degrees, 0 = straight ahead, positive = to the right (-180..180).
 * power: 0..100. peakRate and axis are measurements for tuning the swing (null for slingshot).
 */
export type Stroke = { power: number; angle: number; mode: ControlMode; peakRate: number | null; axis: string | null };

/** Why the server refused a phone. */
export type JoinError =
  | 'wrong_room' // a mistyped code, or an old QR code from a previous game
  | 'not_joined' // this phone has no seat yet, so show the join form
  | 'game_full'
  | 'colour_taken'
  | 'invalid'
  | 'replaced'; // the same player opened the game in another tab

/** Sent by the host page or a phone. */
export type ClientMessage =
  | { type: 'host_hello' }
  /** Sent by a phone on every (re)connect, to get its seat back if it has one. */
  | { type: 'rejoin'; room: string; playerId: string }
  | { type: 'join'; room: string; playerId: string; name: string; colour: string }
  /** Live aim while dragging, about 20 per second. */
  | { type: 'aim'; angle: number }
  | ({ type: 'stroke' } & Stroke);

/** Sent by the server. */
export type ServerMessage =
  /** joinUrl and qrDataUrl are null when the Mac is not on a network. */
  | { type: 'host_info'; room: string; joinUrl: string | null; qrDataUrl: string | null }
  | { type: 'lobby_state'; players: PlayerInfo[] }
  | { type: 'joined'; player: PlayerInfo }
  | { type: 'join_error'; reason: JoinError }
  /** Forwarded to the host page. */
  | { type: 'player_aim'; playerId: string; angle: number }
  | ({ type: 'player_stroke'; playerId: string } & Stroke);
