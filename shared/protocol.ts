// JSON messages sent over the WebSocket between server, host and phones.

export const WS_PATH = '/ws';

export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX_LENGTH = 12;
export const SHIRT_COLOURS = ['#ff5a5f', '#ffb400', '#3ec300', '#00a6ed', '#9b5cff', '#ff7ac6'] as const;

/** Per-player swing sensitivity in percent: the swing's power is multiplied by it. */
export const SENSITIVITY_MIN = 50;
export const SENSITIVITY_MAX = 150;
export const SENSITIVITY_DEFAULT = 100;

export type Handedness = 'right' | 'left';

export type PlayerInfo = {
  id: string;
  name: string;
  colour: string;
  connected: boolean;
  /** Which way the player putts. Swing detection works the same for both; the character will stand mirrored (Phase 3). */
  handedness: Handedness;
  /** Swing sensitivity in percent (applied on the phone). */
  sensitivity: number;
};

/** How the phone hits: swinging the phone, or pulling back a finger like a slingshot. */
export type ControlMode = 'swing' | 'slingshot';

/**
 * A hit from a phone.
 * angle: aim in degrees, 0 = straight ahead, positive = to the right (-180..180).
 * power: 0..100 (one decimal).
 * twist: left/right turn of the phone at impact in degrees, which curves the ball (null = unknown or slingshot).
 * backswing (degrees), speed (degrees per second) and radius (swing arc, centimetres) are swing
 * measurements shown on the big screen for tuning (null for the slingshot).
 */
export type Stroke = {
  power: number;
  angle: number;
  mode: ControlMode;
  twist: number | null;
  backswing: number | null;
  speed: number | null;
  radius: number | null;
};

/** Live state of a swing on the phone, for the gauge on the big screen. */
export type SwingProgress = {
  practice: boolean;
  /** ready = start point locked, waiting for the swing; cancelled = no swing after all. */
  phase: 'ready' | 'swinging' | 'cancelled';
  /** Backswing so far (degrees) and the rough power it would give. */
  backswing: number;
  power: number;
};

/** What happened to the ball after a stroke, reported by the host. */
export type BallResult = 'rest' | 'holed' | 'out';

/** The match, decided by the server. */
export type GameState = {
  phase: 'lobby' | 'playing' | 'hole_end';
  /** The player who may start the game from their phone (the first connected one). */
  leaderId: string | null;
  /** Whose turn it is (null when nobody's). */
  current: string | null;
  /** Goes up by one at every new turn, so pages can tell a new turn from a repeat. */
  turn: number;
  /** Players taking part, in turn order. done: holed out or picked up after too many strokes. */
  players: { id: string; strokes: number; done: 'holed' | 'picked_up' | null; score: number }[];
};

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
  | {
      type: 'join';
      room: string;
      playerId: string;
      name: string;
      colour: string;
      handedness: Handedness;
      sensitivity: number;
    }
  /** Live aim while dragging, about 20 per second. */
  | { type: 'aim'; angle: number }
  | ({ type: 'stroke' } & Stroke)
  /** A practice swing: measured like a stroke, but the ball does not move. */
  | ({ type: 'practice' } & Stroke)
  | ({ type: 'swing_progress' } & SwingProgress)
  /** From the host, or from the leader's phone. */
  | { type: 'start_game' }
  /** From the host: back to the lobby. */
  | { type: 'end_game' }
  /** From the host: the current player's ball stopped, dropped in or went out of bounds. */
  | { type: 'ball_result'; result: BallResult }
  /** From the host: the current player hit with the Mac keyboard (for testing without a phone). */
  | { type: 'host_stroke' };

/** Sent by the server. */
export type ServerMessage =
  /** joinUrl and qrDataUrl are null when the Mac is not on a network. */
  | { type: 'host_info'; room: string; joinUrl: string | null; qrDataUrl: string | null }
  | { type: 'lobby_state'; players: PlayerInfo[] }
  | { type: 'joined'; player: PlayerInfo }
  | { type: 'join_error'; reason: JoinError }
  /** Forwarded to the host page. */
  | { type: 'player_aim'; playerId: string; angle: number }
  | ({ type: 'player_stroke'; playerId: string } & Stroke)
  | ({ type: 'player_practice'; playerId: string } & Stroke)
  | ({ type: 'player_swing_progress'; playerId: string } & SwingProgress)
  /** To everyone, whenever the match changes. */
  | ({ type: 'game_state' } & GameState);
