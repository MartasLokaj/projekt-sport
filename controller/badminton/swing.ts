import { TUNING } from '../../shared/tuning.ts';

// Instant badminton swing detection. Unlike the minigolf putt there is no button and no waiting:
// the phone listens all the time and a fast enough turn is a swing.
//
// 1. A turn faster than `triggerSpeed` is looked at. Its fastest moment is remembered:
//    the time (for judging early/late) and the speed (power).
// 2. Slower than `minHitSpeed` it is no hit, just reaching for the shuttle or getting ready ("ignored").
// 3. A strong swing is sent as soon as the turn slows down. A softer one waits `confirmMs` first:
//    reaching back with the racket is often followed straight away by the real, faster swing,
//    which then replaces it.
// Overhead or underhand is not read from the phone: the game picks it from where the character stands.

export type BadmintonSample = {
  /** Phone clock, milliseconds since 1970. */
  t: number;
  /** Gyroscope, degrees per second, around the phone's x, y and z axes. */
  rate: [number, number, number];
  /** Angle of the top of the phone above the horizon (degrees), or null when unknown. Only logged. */
  tilt: number | null;
};

export type DetectedSwing = {
  /** True when it was too slow to be a hit (reaching for the shuttle, getting ready). */
  ignored: boolean;
  speed: number;
  power: number;
  /** Tilt of the top of the phone at the fastest moment (degrees). */
  tilt: number;
  /** Phone clock time of the fastest moment. */
  at: number;
  /** [ms relative to the fastest moment, speed, tilt, turn x, y, z] from before the swing until now. */
  trace: number[][];
};

type Point = { t: number; speed: number; tilt: number | null; rate: [number, number, number] };

export class BadmintonSwingDetector {
  /** This player's own sensitivity (1 = 100 %), set from their profile. */
  playerSensitivity = 1;
  private recent: Point[] = [];
  private swing: { start: number; peak: Point } | null = null;
  /** A finished softer swing waiting to see whether a faster one follows. */
  private candidate: { peak: Point; until: number } | null = null;
  private quietUntil = 0;

  /** Speed of the latest reading, for the live meter. */
  get liveSpeed(): number {
    return this.recent.at(-1)?.speed ?? 0;
  }

  sample(s: BadmintonSample): DetectedSwing | null {
    const cfg = TUNING.badmintonSwing;
    const point: Point = { t: s.t, speed: Math.hypot(...s.rate), tilt: s.tilt, rate: s.rate };
    this.recent.push(point);
    const keep = cfg.traceBeforeMs + cfg.maxSwingMs + cfg.confirmMs;
    while (this.recent.length > 0 && this.recent[0].t < s.t - keep) this.recent.shift();

    if (s.t < this.quietUntil) return null;

    if (this.candidate) {
      if (point.speed > this.candidate.peak.speed) {
        // A faster swing right after: that one is the real one.
        this.candidate = null;
        this.swing = { start: s.t, peak: point };
        return null;
      }
      if (s.t < this.candidate.until) return null;
      const peak = this.candidate.peak;
      this.candidate = null;
      return this.finish(peak, s.t);
    }

    if (!this.swing) {
      if (point.speed < cfg.triggerSpeed) return null;
      this.swing = { start: s.t, peak: point };
      return null;
    }

    if (point.speed > this.swing.peak.speed) this.swing.peak = point;
    const slowed = point.speed < this.swing.peak.speed * cfg.releaseRatio;
    if (!slowed && s.t - this.swing.start < cfg.maxSwingMs) return null;
    const peak = this.swing.peak;
    this.swing = null;
    if (peak.speed >= cfg.instantSpeed) return this.finish(peak, s.t);
    this.candidate = { peak, until: s.t + cfg.confirmMs };
    return null;
  }

  private finish(peak: Point, now: number): DetectedSwing {
    const cfg = TUNING.badmintonSwing;
    const ignored = peak.speed < cfg.minHitSpeed;
    if (!ignored) this.quietUntil = now + cfg.cooldownMs;
    const t = Math.min(1, Math.max(0, (peak.speed - cfg.minSpeed) / (cfg.maxSpeed - cfg.minSpeed)));
    const power = ignored ? 0 : Math.min(100, Math.max(1, Math.round(Math.pow(t, cfg.curveExponent) * this.playerSensitivity * 1000) / 10));
    return {
      ignored,
      speed: Math.round(peak.speed),
      power,
      tilt: Math.round(peak.tilt ?? 0),
      at: Math.round(peak.t),
      trace: this.recent
        .filter((p) => p.t >= peak.t - cfg.traceBeforeMs)
        .map((p) => [Math.round(p.t - peak.t), Math.round(p.speed), Math.round(p.tilt ?? 0), ...p.rate.map(Math.round)]),
    };
  }
}
