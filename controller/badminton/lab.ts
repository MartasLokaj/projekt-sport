import type { ClientMessage } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { BadmintonSwingDetector } from './swing.ts';

// The phone's Badminton Swing Lab screen (phase B1). Shown while the big screen has the lab open.
// The phone listens to its motion sensors all the time and reports every swing straight away,
// with the time of the hit in the server's clock (the phone and the server compare clocks regularly).

type MotionPermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

export type LabScreen = {
  setOpen: (open: boolean) => void;
  /** The player's swing sensitivity in percent (100 = normal). */
  setSensitivity: (percent: number) => void;
  onClockPong: (t: number, server: number) => void;
};

/** The phone's clock in milliseconds since 1970, with sub-millisecond steps. */
function phoneNow(): number {
  return performance.timeOrigin + performance.now();
}

/** An event's time on the phone's clock (most browsers count from page load, old ones from 1970). */
function eventTime(e: Event): number {
  return e.timeStamp > 1e12 ? e.timeStamp : performance.timeOrigin + e.timeStamp;
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

  // ---------- Where the top of the phone points ----------
  // Preferred: the orientation sensor (it combines gyroscope and accelerometer, so it stays right
  // during a fast swing). Fallback: the gravity direction from the accelerometer.

  let orientationTilt: { tilt: number; t: number } | null = null;
  window.addEventListener('deviceorientation', (e) => {
    if (e.beta === null) return;
    // The top of the phone rises sin(beta) above the horizon, whatever gamma and alpha are.
    orientationTilt = { tilt: (Math.asin(Math.sin((e.beta * Math.PI) / 180)) * 180) / Math.PI, t: eventTime(e) };
  });

  function gravityTilt(e: DeviceMotionEvent): number | null {
    const g = e.accelerationIncludingGravity;
    const a = e.acceleration;
    if (!g || g.x === null || g.y === null || g.z === null) return null;
    const v = a && a.x !== null && a.y !== null && a.z !== null ? [g.x - a.x, g.y - a.y, g.z! - a.z] : [g.x, g.y, g.z];
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1) return null;
    // Android reports the upward push (+y when the phone stands upright), iPhone the downward pull.
    const up = (isIos ? -v[1] : v[1]) / len;
    return (Math.asin(Math.max(-1, Math.min(1, up))) * 180) / Math.PI;
  }

  // ---------- Motion ----------

  window.addEventListener('devicemotion', (e) => {
    const r = e.rotationRate;
    if (!r || r.alpha === null || r.beta === null || r.gamma === null) return;
    sensorSeen = true;
    if (!open) return;
    const t = eventTime(e);
    const fused = orientationTilt !== null && Math.abs(t - orientationTilt.t) < 150;
    const tilt = fused ? orientationTilt!.tilt : gravityTilt(e);
    // rotationRate: beta turns around x, gamma around y, alpha around z.
    const swing = detector.sample({ t, rate: [r.beta, r.gamma, r.alpha], tilt });
    renderLive(tilt);
    if (!swing) return;

    const { at, ...rest } = swing;
    send({ type: 'badminton_swing', ...rest, at: Math.round(at + (offset ?? 0)), fused });
    if (swing.ignored) {
      detailEl.textContent = `Ignored: too slow for a hit (${swing.speed}°/s)`;
      return;
    }
    swings++;
    if ('vibrate' in navigator) navigator.vibrate(30); // not supported on iPhone
    kindEl.textContent = 'HIT!';
    powerEl.textContent = `${Math.round(swing.power)} %`;
    detailEl.textContent = `Swing ${swings} · ${swing.speed}°/s`;
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
      }
    },
    setSensitivity(percent) {
      detector.playerSensitivity = percent / 100;
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
