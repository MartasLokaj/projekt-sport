import { TUNING } from '../../shared/tuning.ts';

// Instant badminton swing detection. Unlike the minigolf putt there is no button and no waiting:
// the phone listens all the time and a fast enough turn is a swing.
//
// 1. A swing starts when the phone turns faster than `triggerSpeed`. Its fastest moment is remembered:
//    the time (for judging early/late), the speed (power) and which way the phone turned.
// 2. When the turn slows down, the swing waits `confirmMs`: reaching back with the racket is often
//    followed straight away by the real, faster swing, which then replaces it.
// 3. The phone learns which way this player's real swings turn (from their strong swings). A turn the
//    other way is the racket going back or up (reaching for the shuttle, the arm coming back): ignored.
// 4. Overhead = the top of the phone (the racket head) pointed high just before the fastest moment.
//    At the fastest moment itself the racket already swings forward, so that moment alone does not tell.

export type BadmintonSample = {
  /** Phone clock, milliseconds since 1970. */
  t: number;
  /** Gyroscope, degrees per second, around the phone's x, y and z axes. */
  rate: [number, number, number];
  /** Angle of the top of the phone above the horizon (degrees), or null when unknown. */
  tilt: number | null;
};

export type DetectedSwing = {
  kind: 'overhead' | 'underhand';
  /** True when it turned the wrong way (racket going back or up), so it is not a hit. */
  ignored: boolean;
  speed: number;
  power: number;
  /** Highest tilt of the top of the phone just before the fastest moment (degrees). */
  tilt: number;
  /** Phone clock time of the fastest moment. */
  at: number;
  /** [ms relative to the fastest moment, speed, tilt, turn x, y, z] from before the swing until now. */
  trace: number[][];
};

type Vec = [number, number, number];
type Point = { t: number; speed: number; tilt: number | null; rate: Vec };

export class BadmintonSwingDetector {
  /** This player's own sensitivity (1 = 100 %), set from their profile. */
  playerSensitivity = 1;
  private recent: Point[] = [];
  private swing: { start: number; peak: Point } | null = null;
  /** A finished swing waiting to see whether a faster one follows. */
  private candidate: { peak: Point; until: number } | null = null;
  /** Which way this player's real swings turn (unit vector), learned from strong swings. */
  private forward: Vec | null = null;
  private quietUntil = 0;

  /** Speed of the latest reading, for the live meter. */
  get liveSpeed(): number {
    return this.recent.at(-1)?.speed ?? 0;
  }

  /** True once the phone knows which way this player swings. */
  get learned(): boolean {
    return this.forward !== null;
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
    this.candidate = { peak: this.swing.peak, until: s.t + cfg.confirmMs };
    this.swing = null;
    return null;
  }

  private finish(peak: Point, now: number): DetectedSwing {
    const cfg = TUNING.badmintonSwing;
    const direction = normalize(peak.rate);
    const ignored = this.forward !== null && dot(direction, this.forward) < cfg.backwardDot;
    if (!ignored) {
      this.quietUntil = now + cfg.cooldownMs;
      if (peak.speed >= cfg.learnSpeed) {
        this.forward = this.forward ? normalize(mix(this.forward, direction, cfg.learnRate)) : direction;
      }
    }

    const before = this.recent.filter((p) => p.t >= peak.t - cfg.overheadLookbackMs && p.t <= peak.t && p.tilt !== null);
    const tilt = before.length ? Math.max(...before.map((p) => p.tilt!)) : 0;
    const t = Math.min(1, Math.max(0, (peak.speed - cfg.minSpeed) / (cfg.maxSpeed - cfg.minSpeed)));
    const power = Math.min(100, Math.round(Math.pow(t, cfg.curveExponent) * this.playerSensitivity * 1000) / 10);
    return {
      kind: tilt >= cfg.overheadMinTilt ? 'overhead' : 'underhand',
      ignored,
      speed: Math.round(peak.speed),
      power,
      tilt: Math.round(tilt),
      at: Math.round(peak.t),
      trace: this.recent
        .filter((p) => p.t >= peak.t - cfg.traceBeforeMs)
        .map((p) => [Math.round(p.t - peak.t), Math.round(p.speed), Math.round(p.tilt ?? 0), ...p.rate.map(Math.round)]),
    };
  }
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v: Vec): Vec {
  const len = Math.hypot(...v) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function mix(a: Vec, b: Vec, t: number): Vec {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
