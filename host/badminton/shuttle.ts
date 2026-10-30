import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';

// The shuttle's flight. Not real physics: each shot is a curve from the racket to its landing spot,
// shaped like a shuttle flies (shoots off fast, slows down, then drops steeply). Because the whole
// flight is known in advance, the characters can run to the right spot and the game knows the exact
// moment the racket must meet it.
//
// Court coordinates: net along x at z = 0, the player's half at z > 0, the computer's at z < 0.

export type ShotKind = 'serve' | 'clear' | 'lift' | 'drive' | 'smash';

export class Flight {
  constructor(
    readonly from: THREE.Vector3,
    /** Landing spot (on the ground). */
    readonly to: THREE.Vector3,
    /** Extra height of the arc in the middle (m). */
    readonly apex: number,
    /** Flight time (ms) and start time (host clock, ms since 1970). */
    readonly duration: number,
    readonly start: number,
    /** How much the shuttle slows down: 0 = steady, higher = shoots off fast, then hangs. */
    readonly drag: number,
    readonly kind: ShotKind,
  ) {}

  /** Share of the horizontal distance covered at progress u (0..1). */
  private across(u: number): number {
    return this.drag < 0.01 ? u : (1 - Math.exp(-this.drag * u)) / (1 - Math.exp(-this.drag));
  }

  heightAt(u: number): number {
    return this.from.y * (1 - u) + this.to.y * u + 4 * this.apex * u * (1 - u);
  }

  positionAt(u: number, out = new THREE.Vector3()): THREE.Vector3 {
    const k = this.across(Math.min(1, Math.max(0, u)));
    out.set(
      this.from.x + (this.to.x - this.from.x) * k,
      this.heightAt(Math.min(1, Math.max(0, u))),
      this.from.z + (this.to.z - this.from.z) * k,
    );
    return out;
  }

  /** Progress at a moment of the host clock (can be outside 0..1). */
  progressAt(time: number): number {
    return (time - this.start) / this.duration;
  }

  timeAt(u: number): number {
    return this.start + u * this.duration;
  }

  /** Progress where the shuttle comes down through `height` for the last time, or null if it never does. */
  descendingThrough(height: number): number | null {
    let previous = this.heightAt(1);
    if (previous > height) return null;
    for (let i = 199; i >= 0; i--) {
      const u = i / 200;
      const y = this.heightAt(u);
      if (y >= height && previous < height) return u + (1 / 200) * ((y - height) / (y - previous));
      previous = y;
    }
    return null;
  }

  /** Progress where the shuttle crosses the net (z = 0), or null. */
  netCrossing(): number | null {
    if (Math.sign(this.from.z) === Math.sign(this.to.z)) return null;
    const share = this.from.z / (this.from.z - this.to.z);
    if (this.drag < 0.01) return share;
    // Invert the across() curve.
    return -Math.log(1 - share * (1 - Math.exp(-this.drag))) / this.drag;
  }
}

/**
 * A new shot from `from` into the other half. side = the hitter's half (+1 player, -1 computer).
 * aim: -1 left … 1 right, from the hitter's point of view. power, quality: 0..1.
 * xRange: where it may land across the court (world x, default: the whole court); aim picks a spot in it.
 */
export function makeShot(
  kind: ShotKind,
  from: THREE.Vector3,
  side: number,
  aim: number,
  power: number,
  quality: number,
  start: number,
  xRange: [number, number] = [-TUNING.badminton.courtHalfWidth + 0.25, TUNING.badminton.courtHalfWidth - 0.25],
): Flight {
  const cfg = TUNING.badminton;
  const shot = cfg[kind];
  const depth = shot.depth[0] + (shot.depth[1] - shot.depth[0]) * power;
  // The hitter looks towards the other half: for the player (+z half, looking at -z) "right" is +x,
  // for the computer (looking at +z) "right" is -x.
  const scatter = (1 - quality) * cfg.scatter;
  const worldAim = side * aim * cfg.aimReach; // -1..1 across the court in world x
  const [lo, hi] = xRange;
  const x = lo + ((worldAim + 1) / 2) * (hi - lo) + (Math.random() * 2 - 1) * scatter;
  const z = -side * (depth + (Math.random() * 2 - 1) * scatter * 0.5);
  const to = new THREE.Vector3(
    THREE.MathUtils.clamp(x, lo, hi),
    0,
    THREE.MathUtils.clamp(z, -cfg.courtHalfLength + 0.25, cfg.courtHalfLength - 0.25),
  );
  let seconds = shot.seconds[0] + (shot.seconds[1] - shot.seconds[0]) * power;
  if (quality >= 1) seconds *= cfg.perfectSpeedup;

  let flight = new Flight(from.clone(), to, shot.apex, seconds * 1000, start, shot.drag, kind);
  // Make sure it clears the net: raise the arc until it does.
  const u = flight.netCrossing();
  if (u !== null) {
    const need = cfg.netHeight + cfg.netClearance - flight.heightAt(u);
    if (need > 0) {
      flight = new Flight(from.clone(), to, shot.apex + need / (4 * u * (1 - u)), seconds * 1000, start, shot.drag, kind);
    }
  }
  return flight;
}

export type Contact = {
  /** Where and when the racket meets the shuttle. */
  position: THREE.Vector3;
  time: number;
  /**
   * overhead = high in the back court (clear, or smash when hit hard); smash = high near the net;
   * drive = about chest height (a flat, fast shot); lift = low (underhand).
   */
  stroke: 'overhead' | 'smash' | 'drive' | 'lift';
};

/**
 * Where the receiver on `side`, now standing at `at`, meets this flight. Like real players it takes the
 * shuttle as early as it can: the first point in its half that is low enough to reach and that it can
 * get to in time at a normal run (so it does not dash at the net to block a smash). Failing that, the
 * first point it can reach at full sprint; failing that, just before the shuttle lands.
 */
export function findContact(flight: Flight, side: number, at: THREE.Vector3, now: number): Contact {
  const cfg = TUNING.badminton;
  const p = new THREE.Vector3();
  const earliest = (speed: number): number | null => {
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      flight.positionAt(u, p);
      if (Math.sign(p.z) !== side || p.y > cfg.reachHeight || p.y < cfg.lowestContact) continue;
      if (Math.abs(p.z) > cfg.courtHalfLength + 0.6 || Math.abs(p.x) > cfg.courtHalfWidth + 0.7) continue;
      const runSeconds = Math.hypot(p.x - at.x, p.z - at.z) / speed;
      if (flight.timeAt(u) - now >= cfg.reactionMs + runSeconds * 1000) return u;
    }
    return null;
  };
  const chosen = earliest(cfg.runSpeed) ?? earliest(cfg.maxRunSpeed) ?? 0.98;
  const position = flight.positionAt(chosen);
  const stroke =
    position.y >= cfg.overheadFrom
      ? Math.abs(position.z) < cfg.frontZone
        ? 'smash'
        : 'overhead'
      : position.y >= cfg.driveFrom
        ? 'drive'
        : 'lift';
  return { position, time: flight.timeAt(chosen), stroke };
}
