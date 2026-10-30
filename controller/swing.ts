import { TUNING } from '../shared/tuning.ts';

// Turns motion sensor readings into exactly one stroke, after the player taps the swing button.
//
// 1. After the tap the phone waits until it is held still, then locks that position as the
//    start point (the phone is "at the ball").
// 2. Adding up the gyroscope readings tells how far the phone has turned away from it.
//    The backswing sets the swing direction, so it does not matter how the phone is held
//    or which hand holds it.
// 3. The stroke fires when the phone swings forward through the start point again,
//    like a putter meeting the ball. Power = backswing length combined with the speed there.
// 4. A real putt swings the whole arm, so the phone travels on a wide arc. The accelerometer
//    tells how wide (the arc's radius); a flick of the wrist turns the phone almost on the spot
//    and does not count.
// 5. If the phone is turned left or right at impact compared to the start (like an open or
//    closed club face), the ball will curve. That turn is the "twist".

export type RotationRate = { alpha: number; beta: number; gamma: number };
export type Vec3 = { x: number; y: number; z: number };
export type MotionSample = {
  /** Gyroscope, degrees per second. */
  rate: RotationRate;
  /** Acceleration without gravity, m/s² (null if the phone does not report it). */
  acceleration: Vec3 | null;
  /** Gravity direction in phone coordinates (null if unknown). */
  gravity: Vec3 | null;
};

type Vec = [number, number, number];

export type SwingResult = {
  type: 'hit';
  /** 0..100, one decimal. */
  power: number;
  /** How far the phone turned back from the start point (degrees). */
  backswing: number;
  /** How fast the phone passed the start point (degrees per second). */
  speed: number;
  /** Radius of the swing arc in centimetres, or null when it could not be measured. */
  radius: number | null;
  /** Left/right turn of the phone at impact compared to the start (degrees), or null when unknown. */
  twist: number | null;
};
export type SwingRejected = { type: 'wrist'; radius: number };

export type SwingPhase = 'idle' | 'settling' | 'ready' | 'backswing' | 'forward' | 'done';

/** Maps a measured value to 0..100: deadzone below `min`, clamped at `max`, shaped by `exponent`. */
export function powerFromValue(value: number, min: number, max: number, exponent: number): number {
  const t = unit(value, min, max, exponent);
  return t === 0 ? 0 : Math.max(1, Math.round(t * 100));
}

export class SwingDetector {
  private state: SwingPhase = 'idle';
  private stillTime = 0;
  /** Rotation since the start point, in degrees around each phone axis (alpha, beta, gamma order). */
  private total: Vec = [0, 0, 0];
  /** Direction of the backswing (unit vector), locked when the forward swing starts. */
  private axis: Vec = [0, 0, 0];
  /** Gravity direction at the start point (unit vector, same axis order), for the twist. */
  private down: Vec | null = null;
  private maxBack = 0;
  private lastForwardSpeed = 0;
  /** Forward-swing samples for measuring the arc radius: squared turn speed (rad/s)² and acceleration. */
  private arc: { omega2: number; accel: number }[] = [];

  get phase(): SwingPhase {
    return this.state;
  }

  /** Backswing so far in degrees, for the live display. */
  get liveBackswing(): number {
    return Math.round(this.maxBack);
  }

  /** Rough power of the swing so far, assuming the forward swing matches the backswing. */
  get livePower(): number {
    const cfg = TUNING.swing;
    return round1(unit(this.maxBack, cfg.minBackswing, cfg.maxBackswing, cfg.curveExponent) * cfg.sensitivity * 100);
  }

  /** Call after the tap: wait for the phone to be still, then lock the start point. */
  arm(): void {
    this.state = 'settling';
    this.stillTime = 0;
  }

  cancel(): void {
    this.state = 'idle';
  }

  /** Feed one motion reading and the time since the last one (seconds). Returns the result once. */
  sample(m: MotionSample, dt: number): SwingResult | SwingRejected | null {
    const cfg = TUNING.swing;
    const r: Vec = [m.rate.alpha, m.rate.beta, m.rate.gamma];

    if (this.state === 'settling') {
      this.stillTime = length(r) < cfg.stillRate ? this.stillTime + dt : 0;
      if (this.stillTime * 1000 >= cfg.stillMs) this.lockStart(m);
      return null;
    }
    if (this.state !== 'ready' && this.state !== 'backswing' && this.state !== 'forward') return null;

    for (let i = 0; i < 3; i++) this.total[i] += r[i] * dt;

    if (this.state === 'ready') {
      if (length(this.total) < cfg.startAngle) return null;
      this.state = 'backswing';
    }

    if (this.state === 'backswing') {
      // The direction follows the backswing while it grows.
      this.axis = normalize(this.total);
      this.maxBack = Math.max(this.maxBack, length(this.total));
      if (dot(r, this.axis) < -cfg.reverseSpeed) this.state = 'forward';
      return null;
    }

    // Forward swing: how far the phone still is from the start point, along the backswing direction.
    const angle = dot(this.total, this.axis);
    this.maxBack = Math.max(this.maxBack, angle); // the backswing may continue after a small hesitation
    this.lastForwardSpeed = -dot(r, this.axis);
    if (m.acceleration) {
      const omega = (length(r) * Math.PI) / 180;
      const a = m.acceleration;
      this.arc.push({ omega2: omega * omega, accel: Math.hypot(a.x, a.y, a.z) });
    }
    if (angle > 0) return null;

    if (this.maxBack < cfg.minBackswing) {
      // Only a small twitch (e.g. a little forward press before the real backswing). Start again from here.
      this.restartFromHere();
      return null;
    }
    return this.finish();
  }

  private lockStart(m: MotionSample): void {
    this.state = 'ready';
    this.down = m.gravity ? normalize([m.gravity.z, m.gravity.x, m.gravity.y]) : null;
    this.restartFromHere();
  }

  private restartFromHere(): void {
    this.state = 'ready';
    this.total = [0, 0, 0];
    this.maxBack = 0;
    this.lastForwardSpeed = 0;
    this.arc = [];
  }

  private finish(): SwingResult | SwingRejected {
    const cfg = TUNING.swing;
    this.state = 'done';
    const speed = Math.max(0, this.lastForwardSpeed);
    const radius = this.arcRadius();
    if (radius !== null && speed >= cfg.armCheckMinSpeed && radius < cfg.minArmRadius) {
      return { type: 'wrist', radius: Math.round(radius * 100) };
    }
    const fromBackswing = unit(this.maxBack, cfg.minBackswing, cfg.maxBackswing, cfg.curveExponent);
    const fromSpeed = unit(speed, 0, cfg.maxSpeed, cfg.curveExponent);
    const mixed = cfg.backswingWeight * fromBackswing + (1 - cfg.backswingWeight) * fromSpeed;
    return {
      type: 'hit',
      power: Math.max(0.1, Math.min(100, round1(mixed * cfg.sensitivity * 100))),
      backswing: Math.round(this.maxBack),
      speed: Math.round(speed),
      radius: radius === null ? null : Math.round(radius * 100),
      twist: this.down ? round1(dot(this.total, this.down)) : null,
    };
  }

  /**
   * Radius of the swing arc in metres. Near the bottom of the swing the phone moves fastest
   * and its acceleration is mostly "centripetal": acceleration = radius × (turn speed)².
   * Uses the fastest part of the forward swing and a least-squares fit.
   */
  private arcRadius(): number | null {
    if (this.arc.length < 3) return null;
    const peak = Math.max(...this.arc.map((s) => s.omega2));
    const fast = this.arc.filter((s) => s.omega2 >= peak * 0.4);
    let num = 0;
    let den = 0;
    for (const s of fast) {
      num += s.accel * s.omega2;
      den += s.omega2 * s.omega2;
    }
    return den > 0 ? num / den : null;
  }
}

/** 0..1: zero below `min`, 1 at `max` and above, shaped by `exponent`. */
function unit(value: number, min: number, max: number, exponent: number): number {
  if (value < min) return 0;
  return Math.pow(Math.min(1, (value - min) / (max - min)), exponent);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
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
