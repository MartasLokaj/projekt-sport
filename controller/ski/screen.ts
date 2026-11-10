import type { ClientMessage } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { WheelSteer } from './steer.ts';

// The phone's Skiing screen (SKI.md, phase S1). Shown while the big screen has Skiing open.
// The player holds the phone sideways like a steering wheel and presses Ready: that position is
// "straight ahead". From then on the phone sends its steering about 30 times a second.
// The same button re-centres at any time.

type MotionPermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

export type SkiScreen = {
  setOpen: (open: boolean) => void;
  /** The player's sensitivity in percent (100 = normal). */
  setSensitivity: (percent: number) => void;
};

export function initSkiScreen(send: (msg: ClientMessage) => void): SkiScreen {
  const inner = document.getElementById('ski-inner')!;
  const textEl = document.getElementById('ski-text')!;
  const knob = document.getElementById('ski-knob')!;
  const valueEl = document.getElementById('ski-value')!;
  const button = document.getElementById('ski-ready') as HTMLButtonElement;
  const noteEl = document.getElementById('ski-note')!;
  const cfg = TUNING.ski.steer;

  const wheel = new WheelSteer();
  const motionApi = window.DeviceMotionEvent as unknown as MotionPermissionApi | undefined;
  const isIos = typeof motionApi?.requestPermission === 'function';
  const portraitPage = window.matchMedia('(orientation: portrait)');
  let open = false;
  let sensorSeen = false;
  let lastSent = 0;
  let lastDrawn = 0;

  function render(): void {
    const ready = wheel.ready;
    button.textContent = ready ? 'Re-centre' : 'Ready';
    textEl.textContent = ready
      ? 'Tilt the phone left and right to steer. Watch the big screen.'
      : 'Hold the phone sideways with both hands, like a steering wheel. Then press Ready.';
  }

  /**
   * A phone with the rotation lock on keeps the page upright while it is held sideways: turn the
   * content so it can still be read. up = the direction of "up" in the phone's own axes.
   */
  function turnContent(upX: number, upY: number): void {
    const sideways = portraitPage.matches && Math.abs(upX) > 0.75;
    const upright = !portraitPage.matches || Math.abs(upY) > 0.75;
    if (sideways) {
      inner.classList.toggle('turn-right', upX > 0);
      inner.classList.toggle('turn-left', upX < 0);
    } else if (upright) inner.classList.remove('turn-right', 'turn-left');
  }
  portraitPage.addEventListener('change', () => {
    if (!portraitPage.matches) inner.classList.remove('turn-right', 'turn-left');
  });

  window.addEventListener('devicemotion', (e) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x === null || g.y === null || g.z === null) return;
    sensorSeen = true;
    if (!open) return;
    // Gravity alone where the phone can tell it apart from the hands' own movement.
    const a = e.acceleration;
    const own = a && a.x !== null && a.y !== null && a.z !== null;
    const x = own ? g.x - a.x! : g.x;
    const y = own ? g.y - a.y! : g.y;
    const z = own ? g.z - a.z! : g.z;
    const now = performance.now();
    wheel.sample(x, y, z, now);

    if (now - lastSent >= cfg.sendIntervalMs) {
      lastSent = now;
      send({ type: 'ski_steer', steer: wheel.ready ? wheel.steer : 0, roll: wheel.roll, ready: wheel.ready });
    }
    if (now - lastDrawn >= 50) {
      lastDrawn = now;
      const length = Math.hypot(x, y, z) || 1;
      // Android reports the upward push, iPhone the downward pull.
      const sign = isIos ? -1 : 1;
      turnContent((sign * x) / length, (sign * y) / length);
      knob.style.left = `${50 + wheel.steer * 50}%`;
      valueEl.textContent = wheel.ready ? `${Math.round(wheel.roll)}°` : '';
      noteEl.textContent = wheel.flat ? 'Hold the phone more upright, screen towards you.' : '';
    }
  });

  // Ready / Re-centre. On an iPhone the first tap also asks for permission to use the motion sensor.
  button.addEventListener('click', async () => {
    if (!sensorSeen && isIos) {
      try {
        await motionApi!.requestPermission!();
      } catch {
        // Denied or failed: the check below tells the player.
      }
    }
    if (!sensorSeen) await new Promise((resolve) => setTimeout(resolve, TUNING.swing.sensorProbeMs));
    if (!sensorSeen) {
      noteEl.textContent = isIos
        ? 'Motion is not allowed. Close this tab, open the game again and tap Allow.'
        : 'This phone has no motion sensor, so it cannot steer.';
      return;
    }
    if (!wheel.calibrate()) {
      noteEl.textContent = 'Hold the phone more upright, screen towards you, and press again.';
      return;
    }
    if ('vibrate' in navigator) navigator.vibrate(20); // not supported on iPhone
    render();
  });

  render();
  return {
    setOpen(next) {
      if (next === open) return;
      open = next;
      if (open) {
        wheel.reset();
        noteEl.textContent = '';
        knob.style.left = '50%';
        valueEl.textContent = '';
        render();
      }
    },
    setSensitivity(percent) {
      wheel.playerSensitivity = percent / 100;
    },
  };
}
