import type { ClientMessage, ControlMode } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';
import { powerFromValue, SwingDetector } from './swing.ts';

// The play screen: drag to aim, then "HOLD & SWING" with the phone,
// or the slingshot fallback (pull down with a finger and let go).

const MODE_KEY = 'minigolf.controlMode';

type MotionState = 'checking' | 'ready' | 'needs_permission' | 'denied' | 'unavailable';
type MotionPermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

export function initPlayScreen(send: (msg: ClientMessage) => void): { onJoined: () => void } {
  const aimPad = document.getElementById('aim-pad')!;
  const aimArrow = document.getElementById('aim-arrow')!;
  const aimValue = document.getElementById('aim-value')!;
  const powerFill = document.getElementById('power-fill')!;
  const powerText = document.getElementById('power-text')!;
  const swingButton = document.getElementById('swing-button')!;
  const swingLabel = document.getElementById('swing-label')!;
  const motionPanel = document.getElementById('motion-panel')!;
  const motionText = document.getElementById('motion-text')!;
  const motionEnable = document.getElementById('motion-enable') as HTMLButtonElement;
  const statusEl = document.getElementById('play-status')!;
  const modeToggle = document.getElementById('mode-toggle')!;

  const motionApi = window.DeviceMotionEvent as unknown as MotionPermissionApi | undefined;
  const detector = new SwingDetector();

  let mode: ControlMode = loadMode() ?? 'swing';
  let motion: MotionState = 'checking';
  let sensorSeen = false;
  let permissionDenied = false;
  let angle = 0;

  // ---------- Aim ----------

  let aimPointer: number | null = null;
  let aimLastX = 0;
  let aimLastSent = 0;
  let aimTimer: number | undefined;

  function renderAim(): void {
    aimArrow.style.transform = `rotate(${angle}deg)`;
    aimValue.textContent = `${Math.round(angle)}°`;
  }

  function sendAim(): void {
    clearTimeout(aimTimer);
    aimTimer = undefined;
    aimLastSent = performance.now();
    send({ type: 'aim', angle: Math.round(angle * 10) / 10 });
  }

  /** Sends at most one aim update per interval, always ending with the latest angle. */
  function queueAim(): void {
    const wait = aimLastSent + TUNING.aim.sendIntervalMs - performance.now();
    if (wait <= 0) sendAim();
    else if (aimTimer === undefined) aimTimer = window.setTimeout(sendAim, wait);
  }

  aimPad.addEventListener('pointerdown', (e) => {
    aimPointer = e.pointerId;
    aimLastX = e.clientX;
    aimPad.setPointerCapture(e.pointerId);
  });
  aimPad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== aimPointer) return;
    angle = wrapDegrees(angle + (e.clientX - aimLastX) * TUNING.aim.degreesPerPixel);
    aimLastX = e.clientX;
    renderAim();
    queueAim();
  });
  const endAim = (e: PointerEvent): void => {
    if (e.pointerId !== aimPointer) return;
    aimPointer = null;
    sendAim();
  };
  aimPad.addEventListener('pointerup', endAim);
  aimPad.addEventListener('pointercancel', endAim);

  // ---------- Hitting ----------

  let holding = false;
  let strokeSent = false;
  let pullStartY = 0;
  let pullPower = 0;

  function setMeter(power: number): void {
    powerFill.style.width = `${power}%`;
    powerText.textContent = `${power}%`;
  }

  function hit(power: number, peakRate: number | null, axis: string | null): void {
    strokeSent = true;
    send({ type: 'stroke', power, angle: Math.round(angle * 10) / 10, mode, peakRate, axis });
    setMeter(power);
    statusEl.textContent = `Hit! ${power}%`;
    if ('vibrate' in navigator) navigator.vibrate(40); // not supported on iPhone
  }

  window.addEventListener('devicemotion', (e) => {
    const r = e.rotationRate;
    if (!r || r.alpha === null || r.beta === null || r.gamma === null) return;
    sensorSeen = true;
    if (!holding || mode !== 'swing') return;
    const result = detector.sample({ alpha: r.alpha, beta: r.beta, gamma: r.gamma });
    if (result) hit(result.power, result.peakRate, result.axis);
    else if (!strokeSent) setMeter(detector.livePower);
  });

  swingButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (holding) return;
    swingButton.setPointerCapture(e.pointerId);
    holding = true;
    strokeSent = false;
    swingButton.classList.add('held');
    setMeter(0);
    if (mode === 'swing') {
      detector.start();
      statusEl.textContent = 'Swing back, then forward!';
    } else {
      pullStartY = e.clientY;
      pullPower = 0;
      statusEl.textContent = 'Pull down, then let go!';
    }
  });

  swingButton.addEventListener('pointermove', (e) => {
    if (!holding || mode !== 'slingshot') return;
    const pull = Math.max(0, e.clientY - pullStartY);
    const cfg = TUNING.slingshot;
    pullPower = powerFromValue(pull, cfg.minPullPx, cfg.maxPullPx, cfg.curveExponent);
    swingButton.style.setProperty('--pull', `${Math.min(pull, cfg.maxPullPx) * 0.3}px`);
    setMeter(pullPower);
  });

  function endHold(cancelled: boolean): void {
    if (!holding) return;
    holding = false;
    swingButton.classList.remove('held');
    swingButton.style.setProperty('--pull', '0px');
    if (mode === 'swing') {
      const result = detector.release();
      if (result && !cancelled) hit(result.power, result.peakRate, result.axis);
      if (!strokeSent) statusEl.textContent = 'No swing detected. Swing a little faster.';
    } else if (!cancelled && pullPower > 0) {
      hit(pullPower, null, null);
    } else {
      setMeter(0);
      statusEl.textContent = 'Pull further down to hit.';
    }
  }
  swingButton.addEventListener('pointerup', () => endHold(false));
  swingButton.addEventListener('pointercancel', () => endHold(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') endHold(true);
  });

  // ---------- Motion sensor and control mode ----------

  async function checkSensor(): Promise<void> {
    motion = 'checking';
    render();
    await new Promise((resolve) => setTimeout(resolve, TUNING.swing.sensorProbeMs));
    if (sensorSeen) motion = 'ready';
    else if (permissionDenied) motion = 'denied';
    else if (motionApi?.requestPermission) motion = 'needs_permission';
    else motion = 'unavailable';
    render();
  }

  motionEnable.addEventListener('click', async () => {
    if (motion === 'denied') {
      setMode('slingshot');
      return;
    }
    try {
      const answer = await motionApi!.requestPermission!(); // must be called from a tap
      if (answer === 'granted') {
        await checkSensor();
        return;
      }
    } catch {
      // Treated like a "Don't Allow" below.
    }
    permissionDenied = true;
    motion = 'denied';
    render();
  });

  modeToggle.addEventListener('click', () => {
    setMode(mode === 'swing' ? 'slingshot' : 'swing');
    if (mode === 'swing' && motion !== 'ready') void checkSensor();
  });

  function setMode(next: ControlMode): void {
    mode = next;
    saveMode(next);
    setMeter(0);
    render();
  }

  function render(): void {
    // Without a motion sensor the phone falls back to the slingshot automatically.
    if (mode === 'swing' && motion === 'unavailable') {
      mode = 'slingshot';
      statusEl.textContent = 'No motion sensor found, so you play with touch controls.';
    }
    const swingReady = mode === 'slingshot' || motion === 'ready';
    swingButton.hidden = !swingReady;
    motionPanel.hidden = swingReady;
    swingButton.classList.toggle('slingshot', mode === 'slingshot');
    swingLabel.textContent = mode === 'swing' ? 'HOLD & SWING' : 'PULL DOWN & RELEASE';
    modeToggle.textContent = mode === 'swing' ? 'Use touch controls instead' : 'Swing the phone instead';

    motionEnable.hidden = false;
    if (motion === 'checking') {
      motionText.textContent = 'Checking the motion sensor…';
      motionEnable.hidden = true;
    } else if (motion === 'needs_permission') {
      motionText.textContent = 'To swing your phone like a putter, the game needs the motion sensor.';
      motionEnable.textContent = 'Enable motion';
    } else if (motion === 'denied') {
      motionText.textContent =
        'Motion access was blocked. To fix it, close this tab, open the game address again and tap "Allow". Or play with touch controls.';
      motionEnable.textContent = 'Use touch controls';
    }
  }

  renderAim();
  setMeter(0);
  void checkSensor();

  return {
    onJoined: () => sendAim(),
  };
}

function wrapDegrees(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function loadMode(): ControlMode | null {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === 'swing' || saved === 'slingshot' ? saved : null;
  } catch {
    return null;
  }
}

function saveMode(mode: ControlMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Not saved, the phone just asks again next time.
  }
}
