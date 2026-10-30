// JSON messages sent over the WebSocket between server, host and phones.

export const WS_PATH = '/ws';

export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX_LENGTH = 12;
export const SHIRT_COLOURS = ['#ff5a5f', '#ffb400', '#3ec300', '#00a6ed', '#9b5cff', '#ff7ac6'] as const;

export type PlayerInfo = { id: string; name: string; colour: string; connected: boolean };

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
  | { type: 'join'; room: string; playerId: string; name: string; colour: string };

/** Sent by the server. */
export type ServerMessage =
  /** joinUrl and qrDataUrl are null when the Mac is not on a network. */
  | { type: 'host_info'; room: string; joinUrl: string | null; qrDataUrl: string | null }
  | { type: 'lobby_state'; players: PlayerInfo[] }
  | { type: 'joined'; player: PlayerInfo }
  | { type: 'join_error'; reason: JoinError };
