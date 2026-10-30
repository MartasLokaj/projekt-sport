import { TUNING } from '../shared/tuning.ts';

// Turns gyroscope readings taken while "HOLD & SWING" is held into exactly one stroke.
//
// The moment the button is pressed is the start point (the phone is "at the ball").
// Adding up the gyroscope readings tells how far the phone has turned away from it.
// The backswing sets the swing direction, so it does not matter how the phone is held
// or which hand holds it. The stroke fires when the phone swings forward through the
// start point again, like a putter meeting the ball.
// Power = backswing length combined with the speed at the start point.

export type RotationRate = { alpha: number; beta: number; gamma: number };
type Vec = [number, number, number];

export type SwingResult = {
  power: number;
  /** How far the phone turned back from the start point (degrees). */
  backswing: number;
  /** How fast the phone passed the start point (degrees per second). */
  speed: number;
};

/** Maps a measured value to 0..100 power: deadzone below `min`, clamped at `max`, soft curve. */
export function powerFromValue(value: number, min: number, max: number, exponent: number): number {
  const t = unit(value, min, max, exponent);
  return t === 0 ? 0 : Math.max(1, Math.round(t * 100));
}

export class SwingDetector {
  private phase: 'waiting' | 'backswing' | 'forward' | 'done' = 'waiting';
  /** Rotation since the start point, in degrees around each phone axis. */
  private total: Vec = [0, 0, 0];
  /** Direction of the backswing (unit vector), locked when the forward swing starts. */
  private axis: Vec = [0, 0, 0];
  private maxBack = 0;
  private lastForwardSpeed = 0;

  /** Backswing so far in degrees, for the live display. */
  get liveBackswing(): number {
    return Math.round(this.maxBack);
  }

  /** Why no stroke happened, for a hint on the phone. */
  get missReason(): 'too_short' | 'not_through' {
    return this.maxBack < TUNING.swing.minBackswing ? 'too_short' : 'not_through';
  }

  /** Call when the button is pressed: the current position becomes the start point. */
  start(): void {
    this.phase = 'waiting';
    this.total = [0, 0, 0];
    this.maxBack = 0;
    this.lastForwardSpeed = 0;
  }

  /** Feed one gyroscope reading (degrees per second) and the time since the last one (seconds). */
  sample(rate: RotationRate, dt: number): SwingResult | null {
    if (this.phase === 'done') return null;
    const cfg = TUNING.swing;
    const r: Vec = [rate.alpha, rate.beta, rate.gamma];
    for (let i = 0; i < 3; i++) this.total[i] += r[i] * dt;

    if (this.phase === 'waiting') {
      if (length(this.total) < cfg.startAngle) return null;
      this.phase = 'backswing';
    }

    if (this.phase === 'backswing') {
      // The direction follows the backswing while it grows.
      this.axis = normalize(this.total);
      this.maxBack = Math.max(this.maxBack, length(this.total));
      if (dot(r, this.axis) < -cfg.reverseSpeed) this.phase = 'forward';
      return null;
    }

    // Forward swing: how far the phone still is from the start point, along the backswing direction.
    const angle = dot(this.total, this.axis);
    this.maxBack = Math.max(this.maxBack, angle); // the backswing may continue after a small hesitation
    this.lastForwardSpeed = -dot(r, this.axis);
    if (angle > 0) return null;

    if (this.maxBack < cfg.minBackswing) {
      // Only a small twitch (e.g. a little forward press before the real backswing).
      // Start again from here.
      this.start();
      return null;
    }
    return this.finish(this.lastForwardSpeed);
  }

  /** Call when the button is released. A forward swing that has not reached the start point yet still counts. */
  release(): SwingResult | null {
    const swinging =
      this.phase === 'forward' &&
      this.maxBack >= TUNING.swing.minBackswing &&
      this.lastForwardSpeed > TUNING.swing.reverseSpeed;
    const result = swinging ? this.finish(this.lastForwardSpeed) : null;
    this.phase = 'done';
    return result;
  }

  private finish(speed: number): SwingResult {
    const cfg = TUNING.swing;
    this.phase = 'done';
    const fromBackswing = unit(this.maxBack, cfg.minBackswing, cfg.maxBackswing, cfg.curveExponent);
    const fromSpeed = unit(Math.max(0, speed), 0, cfg.maxSpeed, cfg.curveExponent);
    const mixed = cfg.backswingWeight * fromBackswing + (1 - cfg.backswingWeight) * fromSpeed;
    return {
      power: Math.max(1, Math.min(100, Math.round(mixed * cfg.sensitivity * 100))),
      backswing: Math.round(this.maxBack),
      speed: Math.round(Math.max(0, speed)),
    };
  }
}

/** 0..1: zero below `min`, 1 at `max` and above, shaped by `exponent`. */
function unit(value: number, min: number, max: number, exponent: number): number {
  if (value < min) return 0;
  return Math.pow(Math.min(1, (value - min) / (max - min)), exponent);
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(v: Vec): number {
  return Math.sqrt(dot(v, v));
}

function normalize(v: Vec): Vec {
  const len = length(v) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
