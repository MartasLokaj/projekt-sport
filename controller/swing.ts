import { TUNING } from '../shared/tuning.ts';

// Turns gyroscope readings taken while "HOLD & SWING" is held into exactly one stroke.
//
// A putt is: backswing, then forward swing. With axis 'auto' the first clear movement
// is taken as the backswing, so the opposite direction is forward. That works no matter
// how the phone is held or which hand holds it. The stroke fires as soon as the forward
// swing has peaked and slowed down, so it feels instant.

export type RotationRate = { alpha: number; beta: number; gamma: number };
type Axis = keyof RotationRate;

export type SwingResult = { power: number; peakRate: number; axis: Axis };

/** Maps a measured value to 0..100 power: deadzone below `min`, clamped at `max`, soft curve. */
export function powerFromValue(value: number, min: number, max: number, exponent: number): number {
  if (value < min) return 0;
  const t = Math.min(1, (value - min) / (max - min));
  return Math.max(1, Math.round(Math.pow(t, exponent) * 100));
}

export class SwingDetector {
  private phase: 'waiting' | 'backswing' | 'forward' | 'done' = 'waiting';
  private axis: Axis = 'beta';
  private forwardSign = 1;
  private peak = 0;

  /** Power of the forward swing so far, for the live meter. */
  get livePower(): number {
    const cfg = TUNING.swing;
    return powerFromValue(this.peak, cfg.minPeakRate, cfg.maxPeakRate, cfg.curveExponent);
  }

  /** Call when the button is pressed. */
  start(): void {
    this.phase = 'waiting';
    this.peak = 0;
  }

  /** Feed one gyroscope reading. Returns the stroke once, at the end of the forward swing. */
  sample(rate: RotationRate): SwingResult | null {
    const cfg = TUNING.swing;
    if (this.phase === 'done') return null;

    if (this.phase === 'waiting') {
      const axis = cfg.axis === 'auto' ? dominantAxis(rate) : cfg.axis;
      const value = rate[axis];
      if (Math.abs(value) < cfg.startThreshold) return null;
      this.axis = axis;
      this.forwardSign = cfg.axis === 'auto' ? -Math.sign(value) : cfg.forwardSign;
      this.phase = 'backswing';
    }

    const forward = rate[this.axis] * this.forwardSign;

    if (this.phase === 'backswing') {
      if (forward < cfg.startThreshold) return null;
      this.phase = 'forward';
    }

    if (forward > this.peak) {
      this.peak = forward;
      return null;
    }
    if (this.peak >= cfg.minPeakRate && forward < this.peak * cfg.releaseFraction) return this.finish();
    if (this.peak < cfg.minPeakRate && forward < cfg.startThreshold) {
      // Just a tiny wiggle: forget it and wait for a real swing.
      this.start();
    }
    return null;
  }

  /** Call when the button is released. A forward swing still in progress counts. */
  release(): SwingResult | null {
    const result = this.phase === 'forward' && this.peak >= TUNING.swing.minPeakRate ? this.finish() : null;
    this.phase = 'done';
    return result;
  }

  private finish(): SwingResult {
    const cfg = TUNING.swing;
    this.phase = 'done';
    return {
      power: powerFromValue(this.peak, cfg.minPeakRate, cfg.maxPeakRate, cfg.curveExponent),
      peakRate: Math.round(this.peak),
      axis: this.axis,
    };
  }
}

function dominantAxis(rate: RotationRate): Axis {
  const a = Math.abs(rate.alpha);
  const b = Math.abs(rate.beta);
  const g = Math.abs(rate.gamma);
  if (a >= b && a >= g) return 'alpha';
  return b >= g ? 'beta' : 'gamma';
}
