import type { ClientMessage, ControlMode, Stroke, SwingProgress } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';
import { powerFromValue, SwingDetector, type MotionSample, type SwingPhase } from './swing.ts';

// The play screen: drag to aim (0 = straight ahead, where the big screen's camera looks),
// try a practice swing, then swing for real. With the motion sensor: tap, hold still, swing.
// Without it: the slingshot (pull down with a finger and let go).

const MODE_KEY = 'minigolf.controlMode';

type MotionState = 'checking' | 'ready' | 'needs_permission' | 'denied' | 'unavailable';
type MotionPermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

export type PlayScreen = {
  onJoined: () => void;
  /** A new shot: aim straight ahead again. */
  resetAim: () => void;
  /** Stops a tapped swing (e.g. the turn moved on). */
  cancel: () => void;
  showStatus: (text: string) => void;
  /** The player's swing sensitivity in percent (100 = normal). */
  setSensitivity: (percent: number) => void;
};

export function initPlayScreen(send: (msg: ClientMessage) => void): PlayScreen {
  const aimPad = document.getElementById('aim-pad')!;
  const aimArrow = document.getElementById('aim-arrow')!;
  const aimValue = document.getElementById('aim-value')!;
  const powerFill = document.getElementById('power-fill')!;
  const powerText = document.getElementById('power-text')!;
  const swingButton = document.getElementById('swing-button')!;
  const swingLabel = document.getElementById('swing-label')!;
  const practiceButton = document.getElementById('practice-button')!;
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
  // Swing mode: tap a button, hold the phone still, then swing. The stroke fires by itself.
  // Slingshot mode: press a button, pull down and let go.
  // The swing button hits the ball, the practice button only shows the power and how far it would roll.

  /** The tapped (swing mode) or held (slingshot mode) button, or null. */
  let activeButton: HTMLElement | null = null;
  let practice = false;
  let armTimer: number | undefined;
  let lastProgressSent = 0;
  let lastPhase: SwingPhase = 'idle';
  let pullStartY = 0;
  let pullPower = 0;

  function setMeter(power: number): void {
    powerFill.style.width = `${power}%`;
    powerText.textContent = `${Math.round(power)}%`;
  }

  function setButtonLabel(button: HTMLElement, text: string): void {
    (button === swingButton ? swingLabel : practiceButton).textContent = text;
  }

  function idleLabels(): void {
    swingLabel.textContent = mode === 'swing' ? 'TAP TO SWING' : 'PULL DOWN & RELEASE';
    practiceButton.textContent = mode === 'swing' ? 'Tap for a practice swing' : 'Practice: pull down & release';
  }

  function sendProgress(phase: SwingProgress['phase'], force = false): void {
    const now = performance.now();
    if (!force && now - lastProgressSent < TUNING.swing.progressIntervalMs) return;
    lastProgressSent = now;
    send({ type: 'swing_progress', practice, phase, backswing: detector.liveBackswing, power: detector.livePower });
  }

  function hit(stroke: Omit<Stroke, 'angle' | 'mode'>): void {
    const full: Stroke = { ...stroke, angle: Math.round(angle * 10) / 10, mode };
    setMeter(stroke.power);
    if (practice) {
      send({ type: 'practice', ...full });
      statusEl.textContent = `Practice: ${Math.round(stroke.power)}%. Look at the big screen.`;
    } else {
      send({ type: 'stroke', ...full });
      statusEl.textContent = `Hit! ${Math.round(stroke.power)}%`;
      if ('vibrate' in navigator) navigator.vibrate(40); // not supported on iPhone
    }
  }

  function finishSwing(): void {
    clearTimeout(armTimer);
    if (activeButton) {
      activeButton.classList.remove('held');
      activeButton.style.setProperty('--pull', '0px');
    }
    activeButton = null;
    idleLabels();
  }

  /** Swing mode: the first tap arms the swing, a second tap cancels it. */
  function armSwing(button: HTMLElement): void {
    if (activeButton) {
      cancelSwing('Swing cancelled.');
      return;
    }
    activeButton = button;
    practice = button === practiceButton;
    button.classList.add('held');
    setButtonLabel(button, 'Hold still…');
    setMeter(0);
    statusEl.textContent = 'Hold the phone still at the ball.';
    lastPhase = 'settling';
    detector.arm();
    armTimer = window.setTimeout(() => cancelSwing('Too slow. Tap again to swing.'), TUNING.swing.armTimeoutMs);
  }

  function cancelSwing(message: string): void {
    if (!activeButton) return;
    detector.cancel();
    if (mode === 'swing' && lastPhase !== 'settling') sendProgress('cancelled', true);
    finishSwing();
    setMeter(0);
    statusEl.textContent = message;
  }

  let lastMotionTime = 0;

  window.addEventListener('devicemotion', (e) => {
    const r = e.rotationRate;
    if (!r || r.alpha === null || r.beta === null || r.gamma === null) return;
    sensorSeen = true;
    // Seconds since the previous reading (about 1/60), capped in case readings paused.
    const dt = lastMotionTime ? Math.min(0.05, Math.max(0, (e.timeStamp - lastMotionTime) / 1000)) : 1 / 60;
    lastMotionTime = e.timeStamp;
    if (!activeButton || mode !== 'swing') return;

    const result = detector.sample({ rate: { alpha: r.alpha, beta: r.beta, gamma: r.gamma }, ...readAccelerations(e) }, dt);
    const phase = detector.phase;
    if (phase === 'ready' && lastPhase === 'settling') {
      setButtonLabel(activeButton, 'Swing!');
      statusEl.textContent = 'Swing back, then forward through this point.';
      sendProgress('ready', true);
      if ('vibrate' in navigator) navigator.vibrate(15);
    }
    if (phase === 'ready' && (lastPhase === 'backswing' || lastPhase === 'forward')) {
      // Too small or too slow to be a stroke: still waiting for a real swing.
      setMeter(0);
      statusEl.textContent = 'Too small. Swing back, then forward through this point.';
      sendProgress('ready', true);
    }
    lastPhase = phase;

    if (result?.type === 'wrist') {
      cancelSwing(`Swing with your arms, not just your wrist (arc ${result.radius} cm).`);
    } else if (result) {
      const { type: _type, ...stroke } = result;
      finishSwing();
      hit(stroke);
    } else if (phase === 'backswing' || phase === 'forward') {
      setMeter(detector.livePower);
      statusEl.textContent = `Back ${detector.liveBackswing}°`;
      sendProgress('swinging');
    }
  });

  function startPull(button: HTMLElement, e: PointerEvent): void {
    if (activeButton) return;
    button.setPointerCapture(e.pointerId);
    activeButton = button;
    practice = button === practiceButton;
    button.classList.add('held');
    pullStartY = e.clientY;
    pullPower = 0;
    setMeter(0);
    statusEl.textContent = practice ? 'Practice: pull down, then let go!' : 'Pull down, then let go!';
  }

  function movePull(e: PointerEvent): void {
    if (!activeButton || mode !== 'slingshot') return;
    const pull = Math.max(0, e.clientY - pullStartY);
    const cfg = TUNING.slingshot;
    pullPower = Math.min(100, Math.round(powerFromValue(pull, cfg.minPullPx, cfg.maxPullPx, cfg.curveExponent) * detector.playerSensitivity));
    activeButton.style.setProperty('--pull', `${Math.min(pull, cfg.maxPullPx) * 0.3}px`);
    setMeter(pullPower);
  }

  function endPull(cancelled: boolean): void {
    if (!activeButton || mode !== 'slingshot') return;
    finishSwing();
    if (!cancelled && pullPower > 0) {
      hit({ power: pullPower, twist: null, backswing: null, speed: null, radius: null });
    } else {
      setMeter(0);
      statusEl.textContent = 'Pull further down to hit.';
    }
  }

  for (const button of [swingButton, practiceButton]) {
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (mode === 'swing') armSwing(button);
      else startPull(button, e);
    });
    button.addEventListener('pointermove', movePull);
    button.addEventListener('pointerup', () => endPull(false));
    button.addEventListener('pointercancel', () => endPull(true));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') return;
    cancelSwing('Swing cancelled.');
    endPull(true);
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
    cancelSwing('');
    endPull(true);
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
    practiceButton.hidden = !swingReady;
    motionPanel.hidden = swingReady;
    swingButton.classList.toggle('slingshot', mode === 'slingshot');
    practiceButton.classList.toggle('slingshot', mode === 'slingshot');
    if (!activeButton) idleLabels();
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
    resetAim: () => {
      cancelSwing('');
      angle = 0;
      renderAim();
      setMeter(0);
      statusEl.textContent = '';
      sendAim();
    },
    cancel: () => {
      cancelSwing('');
      endPull(true);
    },
    showStatus: (text) => {
      statusEl.textContent = text;
    },
    setSensitivity: (percent) => {
      detector.playerSensitivity = percent / 100;
    },
  };
}

/** Acceleration without gravity, and the gravity direction (both in phone coordinates). */
function readAccelerations(e: DeviceMotionEvent): Pick<MotionSample, 'acceleration' | 'gravity'> {
  const a = e.acceleration;
  const g = e.accelerationIncludingGravity;
  const acceleration = a && a.x !== null && a.y !== null && a.z !== null ? { x: a.x, y: a.y, z: a.z } : null;
  const withGravity = g && g.x !== null && g.y !== null && g.z !== null ? { x: g.x, y: g.y, z: g.z } : null;
  const gravity =
    withGravity && acceleration
      ? { x: withGravity.x - acceleration.x, y: withGravity.y - acceleration.y, z: withGravity.z - acceleration.z }
      : withGravity;
  return { acceleration, gravity };
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
