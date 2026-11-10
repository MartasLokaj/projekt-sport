import { TUNING } from '../../shared/tuning.ts';

// Skiing: turns the phone's gravity readings into steering, as if the phone were a steering wheel.
// The phone is held sideways, screen towards the player. Tilting it turns gravity round inside the
// screen's plane; the angle of that turn, measured from the neutral position the player set with
// Ready, is the roll. Only the difference from neutral counts, so it works the same whichever way
// round the phone is held, and on phones that report gravity with the opposite sign.

/** Brings an angle in degrees into -180..180. */
function wrap(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/** Roll in degrees to steering -1..1: dead zone in the middle, then a curve up to full steering. */
export function steerFromRoll(roll: number, sensitivity = 1): number {
  const cfg = TUNING.ski.steer;
  const full = Math.max(cfg.deadZoneDeg + 1, cfg.maxRollDeg / sensitivity);
  const amount = (Math.abs(roll) - cfg.deadZoneDeg) / (full - cfg.deadZoneDeg);
  if (amount <= 0) return 0;
  return Math.sign(roll) * Math.min(1, amount) ** cfg.curveExponent;
}

export class WheelSteer {
  /** The player's sensitivity (1 = normal): higher = less tilt needed for a full turn. */
  playerSensitivity = 1;
  /** The phone lies too flat to tell the tilt (the last tilt is kept meanwhile). */
  flat = false;
  /** Smoothed gravity inside the screen's plane (x to the phone's right, y to its top), length 0..1. */
  private x = 0;
  private y = 0;
  private lastT: number | null = null;
  /** The wheel's angle now and at the neutral position (degrees), or null before the first reading / Ready. */
  private angle: number | null = null;
  private neutral: number | null = null;

  /** One gravity reading in the phone's own axes (any unit) at time t (milliseconds). */
  sample(gx: number, gy: number, gz: number, t: number): void {
    const length = Math.hypot(gx, gy, gz);
    if (length < 1e-6) return;
    const nx = gx / length;
    const ny = gy / length;
    const dt = this.lastT === null ? Infinity : Math.max(0, t - this.lastT);
    this.lastT = t;
    const blend = 1 - Math.exp(-dt / TUNING.ski.steer.smoothingMs);
    this.x += (nx - this.x) * blend;
    this.y += (ny - this.y) * blend;
    this.flat = Math.hypot(this.x, this.y) < TUNING.ski.steer.minUpright;
    if (!this.flat) this.angle = (Math.atan2(this.x, this.y) * 180) / Math.PI;
  }

  /** Sets the phone's position right now as "straight ahead". False if there is no usable reading yet. */
  calibrate(): boolean {
    if (this.angle === null || this.flat) return false;
    this.neutral = this.angle;
    return true;
  }

  /** Forgets the neutral position (the player must press Ready again). */
  reset(): void {
    this.neutral = null;
  }

  get ready(): boolean {
    return this.neutral !== null;
  }

  /** Tilt from neutral in degrees: + = turned clockwise (steering right). 0 before Ready. */
  get roll(): number {
    if (this.angle === null || this.neutral === null) return 0;
    return -wrap(this.angle - this.neutral);
  }

  /** Steering -1 (full left) .. 1 (full right). */
  get steer(): number {
    return steerFromRoll(this.roll, this.playerSensitivity);
  }
}
