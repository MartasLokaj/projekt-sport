import type { BadmintonSwing, PlayerInfo } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';

// Badminton Swing Lab on the big screen (phase B1): a test bench, not the game.
// A shuttle drops to the hit line again and again; players swing their phones when it gets there.
// Each player's card shows the last swing (overhead/underhand, power, timing) and a graph of the motion,
// so we can see on real phones whether the detection is right and tune it.

type SwingMsg = BadmintonSwing & { playerId: string; receivedAt: number };

type Card = {
  root: HTMLElement;
  name: HTMLElement;
  shot: HTMLElement;
  timing: HTMLElement;
  detail: HTMLElement;
  stats: HTMLElement;
  graph: HTMLCanvasElement;
  flash: number;
  swings: SwingMsg[];
  timings: number[];
};

export class Lab {
  private cards = new Map<string, Card>();
  private running = false;
  private readonly ctx: CanvasRenderingContext2D;
  /** The first shuttle's start time (host clock = server clock, both on this Mac). */
  private epoch = Date.now();

  constructor(
    private readonly drill: HTMLCanvasElement,
    private readonly cardsEl: HTMLElement,
  ) {
    this.ctx = drill.getContext('2d')!;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.epoch = Date.now();
    const loop = (): void => {
      if (!this.running) return;
      this.drawDrill();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }

  setPlayers(players: PlayerInfo[]): void {
    for (const p of players) {
      const card = this.cards.get(p.id) ?? this.makeCard(p.id);
      card.name.textContent = p.connected ? p.name : `${p.name} (away)`;
      card.name.style.setProperty('--colour', p.colour);
      card.root.classList.toggle('away', !p.connected);
    }
    for (const [id, card] of this.cards) {
      if (!players.some((p) => p.id === id)) {
        card.root.remove();
        this.cards.delete(id);
      }
    }
  }

  onSwing(msg: SwingMsg): void {
    const card = this.cards.get(msg.playerId);
    if (!card) return;
    const cfg = TUNING.badmintonSwing;
    if (msg.ignored) {
      card.detail.textContent = `Ignored a turn the other way (racket going back or up, ${msg.speed}°/s)`;
      return;
    }
    card.swings.push(msg);
    card.flash = performance.now();

    const band = msg.power < cfg.softBelow ? 'soft' : msg.power >= cfg.hardFrom ? 'hard' : 'medium';
    const shot = msg.kind === 'overhead' ? (band === 'hard' ? 'Smash' : 'Clear') : 'Lift';
    card.shot.textContent = `${msg.kind === 'overhead' ? 'OVERHEAD' : 'UNDERHAND'} · ${band} ${Math.round(msg.power)} % → ${shot}`;
    card.shot.className = `lab-shot ${msg.kind}`;

    const off = this.timingOf(msg.at);
    if (off === null) {
      card.timing.textContent = 'No shuttle near';
      card.timing.className = 'lab-timing';
    } else {
      card.timings.push(off);
      const lab = TUNING.badmintonLab;
      const size = Math.abs(Math.round(off));
      const verdict = size <= lab.perfectMs ? 'Perfect!' : size <= lab.goodMs ? 'Good' : off < 0 ? 'Early' : 'Late';
      const side = off < 0 ? 'early' : 'late';
      card.timing.textContent = `${verdict} · ${size} ms ${side}`;
      card.timing.className = `lab-timing ${size <= lab.perfectMs ? 'perfect' : size <= lab.goodMs ? 'good' : 'off'}`;
    }

    card.detail.textContent =
      `${msg.speed}°/s · top ${Math.abs(msg.tilt)}° ${msg.tilt >= 0 ? 'up' : 'down'} before the hit · ` +
      `arrived ${Math.max(0, msg.receivedAt - msg.at)} ms after the hit · ${msg.fused ? 'orientation sensor' : 'gravity only'}`;

    const overhead = card.swings.filter((s) => s.kind === 'overhead').length;
    const judged = card.timings.slice(-10);
    const avg = judged.length ? Math.round(judged.reduce((a, b) => a + Math.abs(b), 0) / judged.length) : null;
    card.stats.textContent =
      `${card.swings.length} swings · ${overhead} overhead · ${card.swings.length - overhead} underhand` +
      (avg === null ? '' : ` · timing off by ${avg} ms on average (last ${judged.length})`);
    this.drawGraph(card, msg);
  }

  /** Milliseconds from the nearest shuttle reaching the hit line to the swing (negative = early), or null. */
  private timingOf(at: number): number | null {
    const lab = TUNING.badmintonLab;
    const cycle = lab.fallMs + lab.pauseMs;
    const firstHit = this.epoch + lab.fallMs + lab.displayLatencyMs;
    const k = Math.round((at - firstHit) / cycle);
    if (k < 0) return null;
    const off = at - (firstHit + k * cycle);
    return Math.abs(off) <= lab.judgeWindowMs ? off : null;
  }

  private makeCard(id: string): Card {
    const root = document.createElement('div');
    root.className = 'lab-card';
    const make = (className: string): HTMLElement => {
      const el = document.createElement('div');
      el.className = className;
      root.append(el);
      return el;
    };
    const name = make('lab-name');
    const shot = make('lab-shot');
    shot.textContent = 'Waiting for a swing…';
    const timing = make('lab-timing');
    const detail = make('lab-detail');
    const graph = document.createElement('canvas');
    graph.className = 'lab-graph';
    graph.width = 560;
    graph.height = 150;
    root.append(graph);
    const stats = make('lab-stats');
    this.cardsEl.append(root);
    const card: Card = { root, name, shot, timing, detail, stats, graph, flash: 0, swings: [], timings: [] };
    this.cards.set(id, card);
    return card;
  }

  /** Speed (orange) and tilt of the top of the phone (blue) before the fastest moment (the dashed line). */
  private drawGraph(card: Card, msg: SwingMsg): void {
    const cfg = TUNING.badmintonSwing;
    const c = card.graph.getContext('2d')!;
    const { width: w, height: h } = card.graph;
    c.clearRect(0, 0, w, h);
    if (msg.trace.length < 2) return;
    const t0 = msg.trace[0][0];
    const t1 = Math.max(50, msg.trace.at(-1)![0]);
    const x = (t: number): number => ((t - t0) / (t1 - t0)) * w;
    const ySpeed = (s: number): number => h - (Math.min(s, cfg.maxSpeed * 1.25) / (cfg.maxSpeed * 1.25)) * h;
    const yTilt = (a: number): number => h / 2 - (a / 90) * (h / 2 - 4);

    c.lineWidth = 1;
    c.setLineDash([4, 4]);
    c.strokeStyle = 'rgba(31, 50, 71, 0.35)';
    c.beginPath();
    c.moveTo(x(0), 0);
    c.lineTo(x(0), h);
    c.moveTo(0, yTilt(cfg.overheadMinTilt));
    c.lineTo(w, yTilt(cfg.overheadMinTilt));
    c.moveTo(0, ySpeed(cfg.triggerSpeed));
    c.lineTo(w, ySpeed(cfg.triggerSpeed));
    c.stroke();
    c.setLineDash([]);

    const line = (colour: string, y: (p: number[]) => number): void => {
      c.strokeStyle = colour;
      c.lineWidth = 3;
      c.beginPath();
      msg.trace.forEach((p, i) => (i === 0 ? c.moveTo(x(p[0]), y(p)) : c.lineTo(x(p[0]), y(p))));
      c.stroke();
    };
    line('#ff8a3d', (p) => ySpeed(p[1]));
    line('#1971c2', (p) => yTilt(p[2]));
  }

  // ---------- The timing drill ----------

  private drawDrill(): void {
    const lab = TUNING.badmintonLab;
    const canvas = this.drill;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(canvas.clientWidth * dpr);
    const ch = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    c.clearRect(0, 0, w, h);

    const hitY = h * 0.5;
    const cycle = lab.fallMs + lab.pauseMs;
    const since = (Date.now() - this.epoch) % cycle;

    // Hit zone.
    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    c.fillRect(0, hitY - 26, w, 52);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(0, hitY);
    c.lineTo(w, hitY);
    c.stroke();
    c.fillStyle = '#1f3247';
    c.font = '800 22px ui-rounded, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('Swing at the line!', w / 2, hitY + 60);

    // Flash the line right at the moment to hit.
    const afterHit = since - lab.fallMs;
    if (afterHit >= 0 && afterHit < 180) {
      c.fillStyle = `rgba(255, 210, 63, ${1 - afterHit / 180})`;
      c.fillRect(0, hitY - 26, w, 52);
    }

    // The shuttle: falls with gentle easing, then fades below the line.
    if (since < lab.fallMs + 300) {
      const t = since / lab.fallMs;
      const y = 70 + (hitY - 70) * (t <= 1 ? t * t * 0.4 + t * 0.6 : 1 + (t - 1) * 0.6);
      c.globalAlpha = t <= 1 ? 1 : Math.max(0, 1 - (since - lab.fallMs) / 300);
      drawShuttle(c, w / 2, y);
      c.globalAlpha = 1;
    }

    // Cards light up briefly after a swing.
    const now = performance.now();
    for (const card of this.cards.values()) card.root.classList.toggle('flash', now - card.flash < 250);
  }
}

function drawShuttle(c: CanvasRenderingContext2D, x: number, y: number): void {
  // Cork at the bottom, feather skirt above it (the shuttle falls cork first).
  c.fillStyle = '#ffffff';
  c.strokeStyle = '#c9d6e2';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x - 9, y - 8);
  c.lineTo(x - 26, y - 58);
  c.lineTo(x + 26, y - 58);
  c.lineTo(x + 9, y - 8);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#ff8a3d';
  c.beginPath();
  c.arc(x, y, 12, 0, Math.PI * 2);
  c.fill();
}
