import { TUNING } from '../../shared/tuning.ts';
import type { CpuLevel } from '../hub/lobbyUi.ts';
import type { Course } from './course.ts';
import type { RacerInput, RacerPhysics } from './racer.ts';

// A computer racer (SKI.md, phase S2b). Every reactionMs it looks ahead (a level-dependent part of a second of
// travel), tries lines across the way it is on and picks the one that misses trees and rocks, going for gates a
// little. Its steering wobbles a bit (more on easy), it tucks on straights and jumps kickers by chance, and at a
// fork it takes the risky way with the level's chance. No knowledge the player lacks, except seeing round corners.

export class CpuDriver {
  private steer = 0;
  private nextThink = 0;
  private time = Math.random() * 10;
  private tucking = false;
  /** The way chosen at each fork (by the fork's start), 0 = safe, 1 = risky. */
  private readonly forkChoice = new Map<number, number>();
  /** Whether it will jump the kicker ahead (decided once per kicker). */
  private readonly jumpChoice = new Map<number, boolean>();

  constructor(private readonly level: CpuLevel) {}

  input(r: RacerPhysics, course: Course, dt: number): RacerInput {
    const cfg = TUNING.ski.cpu[this.level];
    const c = TUNING.ski;
    this.time += dt;
    this.nextThink -= dt * 1000;
    if (this.nextThink <= 0) {
      this.nextThink = cfg.reactionMs * (0.7 + Math.random() * 0.6);
      this.think(r, course);
    }
    const wobble = cfg.wobble * (Math.sin(this.time * 1.7) * 0.6 + Math.sin(this.time * 4.3) * 0.4);
    const steer = Math.max(-1, Math.min(1, this.steer + wobble));

    // Jump a kicker: hold while running up, let go at the lip.
    const kicker = course.kickers.find((k) => k.d + c.course.kickerLength > r.d && k.d < r.d + 8 && Math.abs(k.x - r.x) < c.course.kickerWidth / 2);
    let jump = false;
    if (kicker) {
      if (!this.jumpChoice.has(kicker.d)) this.jumpChoice.set(kicker.d, Math.random() < cfg.jump);
      jump = this.jumpChoice.get(kicker.d)! && r.d < kicker.d + c.course.kickerLength - 0.3;
    }
    return { steer, tuck: this.tucking, jump, push: cfg.push };
  }

  private think(r: RacerPhysics, course: Course): void {
    const cfg = TUNING.ski.cpu[this.level];
    const c = TUNING.ski;
    const reach = Math.max(12, r.speed * cfg.look);
    const ahead = r.d + reach;
    const lanes = course.lanes(ahead);
    let lane = lanes[0];
    if (lanes.length > 1) {
      const fork = course.forkAt(ahead)!.fork;
      if (!this.forkChoice.has(fork.from)) this.forkChoice.set(fork.from, Math.random() < cfg.risky ? 1 : 0);
      lane = lanes[this.forkChoice.get(fork.from)!];
    }
    const gate = course.gates.find((g) => g.d > r.d + 3 && g.d < ahead + 10);
    const near = course.near(r.d + reach / 2, reach / 2 + 3);
    let best = lane.c;
    let bestScore = Infinity;
    for (let off = -lane.hw + 1; off <= lane.hw - 1; off += 0.5) {
      const x = lane.c + off;
      let score = Math.abs(off) * 0.05;
      if (gate) score += Math.abs(x - gate.x) * cfg.gates;
      for (const o of near) {
        if (o.d < r.d) continue;
        const k = Math.min(1, Math.max(0, (o.d - r.d) / reach));
        if (Math.abs(o.x - (r.x + (x - r.x) * k)) < o.radius + 1.2) score += 100;
      }
      if (score < bestScore) {
        bestScore = score;
        best = x;
      }
    }
    const want = (Math.atan2(best - r.x, reach) * 180) / Math.PI;
    this.steer = Math.max(-1, Math.min(1, ((want - course.direction(r.d, r.x) * c.alignToCourse) / c.maxHeadingDeg) * 1.3));
    // Tuck on a straight (decided again now and then).
    if (Math.abs(this.steer) > 0.35) this.tucking = false;
    else if (!this.tucking && Math.random() < cfg.tuck * 0.15) this.tucking = true;
  }
}
