import type { BadmintonCue, ClientMessage } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { BadmintonSwingDetector } from './swing.ts';

// The phone's Badminton Swing Lab screen (phase B1). Shown while the big screen has the lab open.
// The phone listens to its motion sensors all the time and reports every swing straight away,
// with the time of the hit in the server's clock (the phone and the server compare clocks regularly).

type MotionPermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

export type LabScreen = {
  setOpen: (open: boolean) => void;
  /** Puts the SHORT button under the left- or right-handed player's thumb. */
  setHandedness: (hand: 'left' | 'right') => void;
  /** The player's swing sensitivity in percent (100 = normal). */
  setSensitivity: (percent: number) => void;
  onClockPong: (t: number, server: number) => void;
  /** A hint from the big screen, e.g. "Smash chance!". */
  onCue: (cue: BadmintonCue) => void;
};

/** The phone's clock in milliseconds since 1970, with sub-millisecond steps. */
function phoneNow(): number {
  return performance.timeOrigin + performance.now();
}

/** An event's time on the phone's clock (most browsers count from page load, old ones from 1970). */
function eventTime(e: Event): number {
  return e.timeStamp > 1e12 ? e.timeStamp : performance.timeOrigin + e.timeStamp;
}

/** "left 40 %", "straight", "right 25 %" (aim -1..1). */
export function aimText(aim: number): string {
  if (Math.abs(aim) < TUNING.badmintonSwing.aimDeadzone) return 'straight';
  return `${aim < 0 ? 'left' : 'right'} ${Math.round(Math.abs(aim) * 100)} %`;
}

export function initLabScreen(send: (msg: ClientMessage) => void): LabScreen {
  const kindEl = document.getElementById('lab-kind')!;
  const powerEl = document.getElementById('lab-power')!;
  const detailEl = document.getElementById('lab-detail')!;
  const liveFill = document.getElementById('lab-live-fill')!;
  const tiltEl = document.getElementById('lab-tilt')!;
  const clockEl = document.getElementById('lab-clock')!;
  const motionPanel = document.getElementById('lab-motion')!;
  const motionButton = document.getElementById('lab-motion-enable') as HTMLButtonElement;
  const shortButton = document.getElementById('lab-short')!;
  const shortLabel = document.getElementById('lab-short-label')!;
  const cfg = TUNING.badmintonSwing;

  const detector = new BadmintonSwingDetector();
  const isIos = typeof (window.DeviceMotionEvent as unknown as MotionPermissionApi | undefined)?.requestPermission === 'function';
  let open = false;
  let sensorSeen = false;
  let swings = 0;

  // ---------- Clock sync ----------
  // offset = server clock − phone clock, from the answer that came back fastest (least Wi-Fi jitter).

  let pongs: { rtt: number; offset: number }[] = [];
  let offset: number | null = null;
  let syncTimer: number | undefined;

  function ping(): void {
    send({ type: 'clock_ping', t: phoneNow() });
  }

  function startSync(): void {
    clearInterval(syncTimer);
    for (let i = 0; i < 5; i++) setTimeout(ping, i * 150);
    syncTimer = window.setInterval(ping, cfg.clockSyncIntervalMs);
  }

  // ---------- Which way is up, in the phone's own axes ----------
  // Needed for the tilt (only logged) and for aiming: the turn around the vertical axis tells whether
  // the swing went to the left or to the right. Preferred: the orientation sensor (it combines gyroscope
  // and accelerometer, so it stays right during a fast swing). Fallback: gravity from the accelerometer.

  let orientationUp: { up: [number, number, number]; t: number } | null = null;
  window.addEventListener('deviceorientation', (e) => {
    if (e.beta === null || e.gamma === null) return;
    const b = (e.beta * Math.PI) / 180;
    const g = (e.gamma * Math.PI) / 180;
    // The world's "up" seen from the phone (x right, y towards the top, z out of the screen).
    orientationUp = { up: [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)], t: eventTime(e) };
  });

  function gravityUp(e: DeviceMotionEvent): [number, number, number] | null {
    const g = e.accelerationIncludingGravity;
    const a = e.acceleration;
    if (!g || g.x === null || g.y === null || g.z === null) return null;
    const v = a && a.x !== null && a.y !== null && a.z !== null ? [g.x - a.x, g.y - a.y, g.z! - a.z] : [g.x, g.y, g.z];
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1) return null;
    // Android reports the upward push (+y when the phone stands upright), iPhone the downward pull.
    const sign = isIos ? -1 : 1;
    return [(sign * v[0]) / len, (sign * v[1]) / len, (sign * v[2]) / len];
  }

  // ---------- SHORT button ----------
  // Held with the thumb while swinging: the hit becomes a drop shot (or a short serve).
  // It counts if it was held at the hit, or let go at most shortGraceMs before it.

  const shortPointers = new Set<number>();
  let shortReleasedAt = -Infinity;

  function renderShort(): void {
    const held = shortPointers.size > 0;
    shortButton.classList.toggle('held', held);
    shortLabel.textContent = held ? 'SHORT ✓' : 'SHORT';
  }

  shortButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      shortButton.setPointerCapture(e.pointerId); // keeps it held even if the thumb slides off the button
    } catch {
      // Not a real pointer (or already gone): still count the press.
    }
    if (shortPointers.size === 0 && 'vibrate' in navigator) navigator.vibrate(12); // not supported on iPhone
    shortPointers.add(e.pointerId);
    renderShort();
  });
  const releaseShort = (e: PointerEvent): void => {
    if (!shortPointers.delete(e.pointerId)) return;
    if (shortPointers.size === 0) shortReleasedAt = phoneNow();
    renderShort();
  };
  shortButton.addEventListener('pointerup', releaseShort);
  shortButton.addEventListener('pointercancel', releaseShort);
  shortButton.addEventListener('contextmenu', (e) => e.preventDefault());

  /** Was SHORT held at this moment of the phone clock (or let go just before)? */
  function shortHeldAt(t: number): boolean {
    return shortPointers.size > 0 || t - shortReleasedAt <= cfg.shortGraceMs;
  }

  // ---------- Motion ----------

  window.addEventListener('devicemotion', (e) => {
    const r = e.rotationRate;
    if (!r || r.alpha === null || r.beta === null || r.gamma === null) return;
    sensorSeen = true;
    if (!open) return;
    const t = eventTime(e);
    const fused = orientationUp !== null && Math.abs(t - orientationUp.t) < 150;
    const up = fused ? orientationUp!.up : gravityUp(e);
    // rotationRate: beta turns around x, gamma around y, alpha around z.
    const swing = detector.sample({ t, rate: [r.beta, r.gamma, r.alpha], up });
    renderLive(up ? (Math.asin(Math.max(-1, Math.min(1, up[1]))) * 180) / Math.PI : null);
    if (!swing) return;

    const { at, ...rest } = swing;
    const short = shortHeldAt(at);
    send({ type: 'badminton_swing', ...rest, short, at: Math.round(at + (offset ?? 0)), fused });
    if (swing.ignored) {
      detailEl.textContent = `Ignored: too slow for a hit (${swing.speed}°/s)`;
      return;
    }
    swings++;
    if ('vibrate' in navigator) navigator.vibrate(30); // not supported on iPhone
    kindEl.textContent = short ? 'SHORT!' : 'HIT!';
    powerEl.textContent = `${Math.round(swing.power)} %`;
    detailEl.textContent = `Swing ${swings} · ${swing.speed}°/s · aim ${aimText(swing.aim)}`;
  });

  let lastLive = 0;
  function renderLive(tilt: number | null): void {
    const now = performance.now();
    if (now - lastLive < 50) return;
    lastLive = now;
    liveFill.style.width = `${Math.min(100, (detector.liveSpeed / cfg.maxSpeed) * 100)}%`;
    tiltEl.textContent = tilt === null ? 'Top of phone: unknown' : `Top of phone: ${Math.round(Math.abs(tilt))}° ${tilt >= 0 ? 'up' : 'down'}`;
  }

  // iPhone: motion needs permission, asked from a tap (once per page load).
  async function checkSensor(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, TUNING.swing.sensorProbeMs));
    motionPanel.hidden = sensorSeen || !isIos;
    if (!sensorSeen && !isIos) detailEl.textContent = 'This phone has no motion sensor, so the swing test cannot work.';
  }

  motionButton.addEventListener('click', async () => {
    try {
      const motion = window.DeviceMotionEvent as unknown as MotionPermissionApi;
      const orientation = window.DeviceOrientationEvent as unknown as MotionPermissionApi | undefined;
      await motion.requestPermission!();
      await orientation?.requestPermission?.();
    } catch {
      // Denied or failed: the check below shows the button again.
    }
    await checkSensor();
  });

  return {
    setOpen(next) {
      if (next === open) return;
      open = next;
      if (open) {
        startSync();
        void checkSensor();
      } else {
        clearInterval(syncTimer);
        shortPointers.clear();
        renderShort();
      }
    },
    setHandedness(hand) {
      shortButton.classList.toggle('left-handed', hand === 'left');
    },
    setSensitivity(percent) {
      detector.playerSensitivity = percent / 100;
    },
    onCue(cue) {
      if (cue !== 'smash_chance') return;
      kindEl.textContent = '⚡ Smash chance!';
      powerEl.textContent = '';
      detailEl.textContent = 'A wobbly shuttle is coming: smash it hard!';
      if ('vibrate' in navigator) navigator.vibrate([40, 60, 40]); // not supported on iPhone
    },
    onClockPong(t, server) {
      const now = phoneNow();
      pongs.push({ rtt: now - t, offset: server - (t + now) / 2 });
      pongs = pongs.slice(-8);
      const best = pongs.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      offset = best.offset;
      clockEl.textContent = `Clock synced (±${Math.round(best.rtt / 2)} ms)`;
    },
  };
}
