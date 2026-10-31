// JSON messages sent over the WebSocket between server, host and phones.

export const WS_PATH = '/ws';

export const MAX_PLAYERS = 4;
/** Number of holes on the whole course (the holes themselves are defined on the host, host/game/course.ts, HOLES). */
export const HOLE_COUNT = 9;
/** How many holes a game can have: a quick game picks this many at random, or the whole course. */
export const COURSE_SIZES = [3, HOLE_COUNT] as const;
export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX_LENGTH = 12;
export const SHIRT_COLOURS = ['#ff5a5f', '#ffb400', '#3ec300', '#00a6ed', '#9b5cff', '#ff7ac6'] as const;

export const SKIN_TONES = ['#ffe0c7', '#f3c79a', '#dba571', '#b67b4c', '#8d5a34', '#5e3b22'] as const;

/** Per-player swing sensitivity in percent: the swing's power is multiplied by it. */
export const SENSITIVITY_MIN = 50;
export const SENSITIVITY_MAX = 150;
export const SENSITIVITY_DEFAULT = 100;

export type Handedness = 'right' | 'left';

export type PlayerInfo = {
  id: string;
  name: string;
  colour: string;
  skinTone: string;
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

/**
 * Badminton swing (Swing Lab, phase B1). The phone detects it instantly, with no button.
 * speed: fastest turn of the phone (degrees per second). power: 0..100 from the speed and sensitivity.
 * tilt: angle of the top of the phone above the horizon at the fastest moment (degrees, -90..90), only logged.
 * aim: -1 = swung fully to the left, 0 = straight, 1 = fully to the right.
 * short: the SHORT button was held at the hit (a drop shot, or a short serve).
 * ignored: too slow to be a hit (reaching for the shuttle, getting ready); sent only for the lab and the log.
 * at: when the fastest moment happened, in the server's clock (milliseconds since 1970), so timing
 * can be judged without the Wi-Fi delay. trace: the last moments of motion, for the graph and the log.
 */
export type BadmintonSwing = {
  ignored: boolean;
  short: boolean;
  speed: number;
  power: number;
  aim: number;
  tilt: number;
  at: number;
  /** true when the tilt came from the fused orientation sensor, false when from gravity only. */
  fused: boolean;
  /** Samples: [ms relative to the fastest moment, speed deg/s, tilt deg, turn around x, y, z, turn around up (deg/s)]. */
  trace: number[][];
};

/** Hints from the big screen to one player's phone during badminton. */
export type BadmintonCue = 'smash_chance' | 'super_smash' | 'perfect';

/** What happened to the ball after a stroke, reported by the host. */
export type BallResult = 'rest' | 'holed' | 'out';

/** The match, decided by the server. */
export type GameState = {
  phase: 'lobby' | 'playing' | 'hole_end' | 'game_end';
  /** Current hole of this game, counting from 0 (course[hole] is which of the course's holes it is). */
  hole: number;
  /** How many holes this game has. */
  holeCount: number;
  /** The course's holes played in this game, in order (indices into HOLES, counting from 0). */
  course: number[];
  /** The player who may start the game from their phone (the first connected one). */
  leaderId: string | null;
  /** Whose turn it is (null when nobody's). */
  current: string | null;
  /** Goes up by one at every new turn, so pages can tell a new turn from a repeat. */
  turn: number;
  /**
   * Players taking part, in turn order. strokes/done/score are for the current hole (done: holed out or
   * picked up after too many strokes). holeScores has the finished holes; total is the score so far.
   */
  players: {
    id: string;
    strokes: number;
    done: 'holed' | 'picked_up' | null;
    score: number;
    holeScores: number[];
    total: number;
  }[];
};

/** Why the server refused a phone. */
export type JoinError =
  | 'wrong_room' // a mistyped code, or an old QR code from a previous game
  | 'not_joined' // this phone has no seat yet, so show the join form
  | 'game_full'
  | 'colour_taken'
  | 'invalid'
  | 'replaced' // the same player opened the game in another tab
  | 'kicked'; // the big screen removed this player (they may join again)

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
      skinTone: string;
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
  /** firstHole (0-based) is a testing shortcut: play from that hole to the end of the course (the host page's ?hole=N). */
  | { type: 'start_game'; firstHole?: number }
  /** From the host: how many holes the next games have (one of COURSE_SIZES; fewer than all = picked at random). */
  | { type: 'set_course'; size: number }
  /** From the host, or from the leader's phone, after a hole's scoreboard. */
  | { type: 'next_hole' }
  /** From the host: back to the lobby. */
  | { type: 'end_game' }
  /** From the host: the current player's ball stopped, dropped in or went out of bounds. */
  | { type: 'ball_result'; result: BallResult }
  /** From the host: the current player hit with the Mac keyboard (for testing without a phone). */
  | { type: 'host_stroke' }
  /** From the host, in the lobby: remove this player (their phone is told and may join again). */
  | { type: 'kick_player'; playerId: string }
  /** From the host: open or close the Badminton Swing Lab (phones switch to the swing test). */
  | { type: 'lab_mode'; on: boolean }
  /** From a phone: what time is it on the server? t = the phone's clock when sent. */
  | { type: 'clock_ping'; t: number }
  | ({ type: 'badminton_swing' } & BadmintonSwing)
  /** From the host: tell one player's phone something (it shows it and vibrates on Android). */
  | { type: 'badminton_cue'; playerId: string; cue: BadmintonCue };

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
  | ({ type: 'game_state' } & GameState)
  /** To everyone: whether the Badminton Swing Lab is open. */
  | { type: 'lab_state'; on: boolean }
  /** Answer to clock_ping: t = the phone's time it sent, server = the server's clock. */
  | { type: 'clock_pong'; t: number; server: number }
  /** Forwarded to the host page. receivedAt = server clock when it arrived (to show the delay). */
  | ({ type: 'player_badminton_swing'; playerId: string; receivedAt: number } & BadmintonSwing)
  /** To one phone, from the host. */
  | { type: 'badminton_cue'; cue: BadmintonCue };
