import { TUNING } from '../../shared/tuning.ts';

// The coach studies each player's swings during badminton and quietly adapts the game to them:
// - Timing: a player who always swings a little early (or late) gets the right moment moved towards them,
//   by part of their usual offset and never more than a cap, so good timing still matters.
// - Power: a player who swings gently gets their swings scaled up, so their strong swing can still smash.
// - Aim: a player whose left/right swings are small gets them scaled up, so they can reach the side lines.
// - Wi-Fi delay: when a phone's swings arrive late, the game waits a little longer before calling a miss.
// It only starts adapting after TUNING.badminton.coach.minSwings, and learns from the last `memory` swings.
// Players are remembered by name while the server runs (a new match keeps what was learned).

type Profile = {
  /** Swing time minus the right moment (ms; negative = early), for swings at a shuttle that was coming. */
  offsets: number[];
  /** Power (0..100) and |aim| (0..1) of real hits, as the phone sent them. */
  powers: number[];
  aims: number[];
  /** How long swings took from the phone to this Mac (ms). */
  delays: number[];
};

export type CoachAdvice = {
  /** Move the right moment by this much (ms; negative = the player swings early). */
  timingShift: number;
  powerScale: number;
  aimScale: number;
  /** Extra wait before a miss is called (ms). */
  extraGrace: number;
  /** How many swings this is based on. */
  swings: number;
};

export class Coach {
  private readonly profiles = new Map<string, Profile>();

  /** A swing at a shuttle that was coming: how far off the right moment it was (before any correction). */
  noteTiming(player: string, offset: number): void {
    push(this.profile(player).offsets, offset);
  }

  /** A swing that hit the shuttle: its raw power and aim. */
  noteHit(player: string, power: number, aim: number): void {
    const p = this.profile(player);
    push(p.powers, power);
    push(p.aims, Math.abs(aim));
  }

  /** How long a swing took to arrive (ms). */
  noteDelay(player: string, delay: number): void {
    if (Number.isFinite(delay) && delay >= 0 && delay < 2000) push(this.profile(player).delays, delay);
  }

  advice(player: string): CoachAdvice {
    const cfg = TUNING.badminton.coach;
    const p = this.profiles.get(player);
    const none = { timingShift: 0, powerScale: 1, aimScale: 1, extraGrace: 0, swings: p?.offsets.length ?? 0 };
    if (!cfg.enabled || !p) return none;
    const advice = { ...none };
    if (p.offsets.length >= cfg.minSwings) {
      advice.timingShift = clamp(median(p.offsets) * cfg.timingShare, -cfg.maxTimingShift, cfg.maxTimingShift);
    }
    if (p.powers.length >= cfg.minSwings) {
      const strong = quantile(p.powers, 0.8);
      advice.powerScale = clamp(cfg.strongPower / Math.max(1, strong), cfg.powerScale[0], cfg.powerScale[1]);
    }
    if (p.aims.length >= cfg.minSwings) {
      const wide = quantile(p.aims, 0.8);
      advice.aimScale = clamp(cfg.wideAim / Math.max(0.05, wide), cfg.aimScale[0], cfg.aimScale[1]);
    }
    if (p.delays.length >= cfg.minSwings) {
      advice.extraGrace = clamp(quantile(p.delays, 0.9) - cfg.normalDelayMs, 0, cfg.maxExtraGraceMs);
    }
    return advice;
  }

  /** Everything learned so far, for the browser console (window.badminton.coach.report()). */
  report(): Record<string, CoachAdvice & { medianOffset: number; medianDelay: number }> {
    const out: ReturnType<Coach['report']> = {};
    for (const [name, p] of this.profiles) {
      out[name] = { ...this.advice(name), medianOffset: median(p.offsets), medianDelay: median(p.delays) };
    }
    return out;
  }

  forget(player?: string): void {
    if (player === undefined) this.profiles.clear();
    else this.profiles.delete(player);
  }

  private profile(player: string): Profile {
    let p = this.profiles.get(player);
    if (!p) {
      p = { offsets: [], powers: [], aims: [], delays: [] };
      this.profiles.set(player, p);
    }
    return p;
  }
}

function push(list: number[], value: number): void {
  list.push(value);
  const memory = TUNING.badminton.coach.memory;
  if (list.length > memory) list.splice(0, list.length - memory);
}

function quantile(list: number[], q: number): number {
  if (list.length === 0) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function median(list: number[]): number {
  return quantile(list, 0.5);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
