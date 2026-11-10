import type { ClientMessage, SkiCue } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { WheelSteer } from './steer.ts';

// The phone's Skiing screen (SKI.md, phases S1–S2a). Shown while the big screen has Skiing open.
// The player holds the phone sideways like a steering wheel and presses Ready: that position is
// "straight ahead". From then on the phone sends its steering about 30 times a second, plus the two thumb
// buttons: TUCK (hold = faster, wider turns) and JUMP (hold to crouch, let go to jump). A button change is sent
// at once, so a quick tap is never lost between two regular messages. The Ready button re-centres at any time.

type MotionPermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

export type SkiScreen = {
  setOpen: (open: boolean) => void;
  /** The player's sensitivity in percent (100 = normal). */
  setSensitivity: (percent: number) => void;
  /** Something happened in the race (vibration on Android; iPhone cannot vibrate). time = finish time in ms. */
  onCue: (cue: SkiCue, time?: number, place?: number) => void;
};

/** 72400 ms → "1:12.4". */
function formatTime(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const rest = (tenths % 600) / 10;
  return `${Math.floor(tenths / 600)}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

function buzz(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern); // not supported on iPhone
}

/** A button that counts as held while any finger is on it (even if the finger slides off). */
function holdButton(button: HTMLElement, onChange: (held: boolean) => void): { held: () => boolean; clear: () => void } {
  const pointers = new Set<number>();
  const render = (): void => {
    button.classList.toggle('held', pointers.size > 0);
  };
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      button.setPointerCapture(e.pointerId);
    } catch {
      // Not a real pointer (or already gone): still count the press.
    }
    const was = pointers.size > 0;
    pointers.add(e.pointerId);
    render();
    if (!was) onChange(true);
  });
  const release = (e: PointerEvent): void => {
    if (!pointers.delete(e.pointerId)) return;
    render();
    if (pointers.size === 0) onChange(false);
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  return {
    held: () => pointers.size > 0,
    clear: () => {
      pointers.clear();
      render();
    },
  };
}

export function initSkiScreen(send: (msg: ClientMessage) => void): SkiScreen {
  const inner = document.getElementById('ski-inner')!;
  const textEl = document.getElementById('ski-text')!;
  const knob = document.getElementById('ski-knob')!;
  const valueEl = document.getElementById('ski-value')!;
  const statusEl = document.getElementById('ski-status')!;
  const button = document.getElementById('ski-ready') as HTMLButtonElement;
  const againButton = document.getElementById('ski-again') as HTMLButtonElement;
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

  function sendSteer(): void {
    lastSent = performance.now();
    send({ type: 'ski_steer', steer: wheel.ready ? wheel.steer : 0, roll: wheel.roll, ready: wheel.ready, tuck: tuck.held(), jump: jump.held() });
  }

  const tuck = holdButton(document.getElementById('ski-tuck')!, (held) => {
    if (held) buzz(10);
    sendSteer();
  });
  const jump = holdButton(document.getElementById('ski-jump')!, (held) => {
    if (held) buzz(10);
    sendSteer();
  });

  function render(): void {
    const ready = wheel.ready;
    inner.classList.toggle('ready', ready);
    button.textContent = ready ? 'Re-centre' : 'Ready';
    textEl.textContent = ready
      ? 'Tilt to steer. Hold TUCK to go faster. Hold JUMP, let go to jump.'
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

    if (now - lastSent >= cfg.sendIntervalMs) sendSteer();
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
    buzz(20);
    render();
    sendSteer();
  });

  againButton.addEventListener('click', () => {
    againButton.hidden = true;
    statusEl.textContent = '';
    send({ type: 'ski_again' });
  });

  render();
  return {
    setOpen(next) {
      if (next === open) return;
      open = next;
      tuck.clear();
      jump.clear();
      if (open) {
        wheel.reset();
        noteEl.textContent = statusEl.textContent = '';
        againButton.hidden = true;
        knob.style.left = '50%';
        valueEl.textContent = '';
        render();
      }
    },
    setSensitivity(percent) {
      wheel.playerSensitivity = percent / 100;
    },
    onCue(cue, time, place) {
      switch (cue) {
        case 'go':
          statusEl.textContent = 'GO!';
          againButton.hidden = true;
          buzz(120);
          setTimeout(() => {
            if (statusEl.textContent === 'GO!') statusEl.textContent = '';
          }, 1200);
          break;
        case 'crash':
          buzz([60, 40, 140]);
          break;
        case 'land':
          buzz(25);
          break;
        case 'land_big':
          buzz(70);
          break;
        case 'gate':
          buzz(15);
          break;
        case 'respawn':
          statusEl.textContent = 'Back with the pack!';
          buzz([30, 30, 30]);
          setTimeout(() => {
            if (statusEl.textContent === 'Back with the pack!') statusEl.textContent = '';
          }, 1500);
          break;
        case 'carve':
          buzz(8);
          break;
        case 'finish':
          statusEl.textContent = `Finished${place ? ` ${['1st', '2nd', '3rd'][place - 1] ?? `${place}th`}` : ''}!${time === undefined ? '' : ` ${formatTime(time)}`}`;
          againButton.hidden = false;
          buzz([80, 60, 220]);
          break;
      }
    },
  };
}
