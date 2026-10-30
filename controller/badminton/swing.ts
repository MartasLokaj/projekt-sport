import { TUNING } from '../../shared/tuning.ts';

// Instant badminton swing detection. Unlike the minigolf putt there is no button and no waiting:
// the phone listens all the time and a fast enough turn is a swing.
//
// 1. A swing starts when the phone turns faster than `triggerSpeed`.
// 2. The fastest moment is remembered: its time (for judging early/late), its speed (power)
//    and where the top of the phone pointed then (tilt).
// 3. As soon as the turn slows down past the fastest moment, the swing is reported. That is
//    only a few readings after the hit, so it feels instant.
// 4. Top of the phone pointing up at the fastest moment = overhead swing, otherwise underhand.
//    Left- and right-handed players work the same, because only the tilt and the speed count.

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
  speed: number;
  power: number;
  tilt: number;
  /** Phone clock time of the fastest moment. */
  at: number;
  /** [ms relative to the fastest moment, speed, tilt] from a little before the swing until now. */
  trace: [number, number, number][];
};

type Point = { t: number; speed: number; tilt: number | null };

export class BadmintonSwingDetector {
  /** This player's own sensitivity (1 = 100 %), set from their profile. */
  playerSensitivity = 1;
  private recent: Point[] = [];
  private swing: { start: number; peak: Point } | null = null;
  private quietUntil = 0;

  /** Speed of the latest reading, for the live meter. */
  get liveSpeed(): number {
    return this.recent.at(-1)?.speed ?? 0;
  }

  sample(s: BadmintonSample): DetectedSwing | null {
    const cfg = TUNING.badmintonSwing;
    const point: Point = { t: s.t, speed: Math.hypot(...s.rate), tilt: s.tilt };
    this.recent.push(point);
    while (this.recent.length > 0 && this.recent[0].t < s.t - cfg.traceBeforeMs - cfg.maxSwingMs) this.recent.shift();

    if (s.t < this.quietUntil) return null;

    if (!this.swing) {
      if (point.speed < cfg.triggerSpeed) return null;
      this.swing = { start: s.t, peak: point };
      return null;
    }

    if (point.speed > this.swing.peak.speed) this.swing.peak = point;
    const slowed = point.speed < this.swing.peak.speed * cfg.releaseRatio;
    if (!slowed && s.t - this.swing.start < cfg.maxSwingMs) return null;
    return this.finish(s.t);
  }

  private finish(now: number): DetectedSwing {
    const cfg = TUNING.badmintonSwing;
    const peak = this.swing!.peak;
    this.swing = null;
    this.quietUntil = now + cfg.cooldownMs;
    const tilt = peak.tilt ?? 0;
    const t = Math.min(1, Math.max(0, (peak.speed - cfg.minSpeed) / (cfg.maxSpeed - cfg.minSpeed)));
    const power = Math.min(100, Math.round(Math.pow(t, cfg.curveExponent) * this.playerSensitivity * 1000) / 10);
    return {
      kind: tilt >= cfg.overheadMinTilt ? 'overhead' : 'underhand',
      speed: Math.round(peak.speed),
      power,
      tilt: Math.round(tilt),
      at: Math.round(peak.t),
      trace: this.recent
        .filter((p) => p.t >= peak.t - cfg.traceBeforeMs)
        .map((p) => [Math.round(p.t - peak.t), Math.round(p.speed), Math.round(p.tilt ?? 0)]),
    };
  }
}
