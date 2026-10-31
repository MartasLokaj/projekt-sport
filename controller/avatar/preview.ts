import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';
import { Character, type CharacterLook, type Mood } from '../../host/game/character.ts';
import { chibiSvg } from './chibi2d.ts';

// The live 3D preview of the player's character on the phone: the same character code as the big screen.
// One small WebGL canvas, moved between the join screen and the editor. It only draws while it is on
// screen, at a capped frame rate and pixel ratio to save battery. Drag sideways to turn the character.
// If 3D cannot run on the phone (no WebGL 2, an error, or no frames drawn), a flat 2D drawing of the same
// character is shown instead, with a small note saying why (to help us find the cause).

export type AvatarPreview = {
  /** Shows the preview inside `holder` (it fills it). */
  mount(holder: HTMLElement): void;
  setLook(look: CharacterLook): void;
  play(mood: Mood): void;
  /** Turns the character back to face the camera. */
  faceFront(): void;
};

export function createAvatarPreview(look: CharacterLook): AvatarPreview {
  const cfg = TUNING.avatarEditor;
  const view = document.createElement('div');
  view.className = 'avatar-view';
  const canvas = document.createElement('canvas');
  canvas.className = 'avatar-canvas';
  const flat = document.createElement('div');
  flat.className = 'avatar-flat';
  flat.hidden = true;
  const note = document.createElement('div');
  note.className = 'avatar-note';
  note.hidden = true;
  view.append(canvas, flat, note);

  let current = look;
  let renderer: THREE.WebGLRenderer | null = null;
  /** Switches to the 2D drawing for good. */
  function fallBack(reason: string): void {
    if (flat.hidden === false) return;
    console.warn('3D preview off:', reason);
    renderer = null;
    canvas.hidden = true;
    flat.hidden = false;
    flat.innerHTML = chibiSvg(current);
    note.hidden = false;
    note.textContent = `2D preview (3D: ${reason})`;
  }
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, cfg.previewPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  } catch (err) {
    fallBack(err instanceof Error ? err.message : String(err));
  }
  canvas.addEventListener('webglcontextlost', () => fallBack('context lost'));

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#4b4f7a', 1.4));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  sun.position.set(1.5, 3, 2.5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  camera.position.set(0, 0.6, 2.35);
  camera.lookAt(0, 0.47, 0);

  const character = new Character(look);
  // A left-handed character is mirrored front to back (for putting from the other side of the ball): turn it round.
  let baseYaw = look.handedness === 'left' ? Math.PI : 0;
  character.place(new THREE.Vector3(), 0);
  const turntable = new THREE.Group();
  turntable.add(character.root);
  scene.add(turntable);

  // Drag to turn; let go and it slowly turns back to face the camera.
  let yaw = 0;
  let dragX: number | null = null;
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => {
    dragX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    yaw += (e.clientX - dragX) * cfg.dragTurn;
    dragX = e.clientX;
  });
  const release = (): void => {
    dragX = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  let last = 0;
  let frames = 0;
  /** How long the preview has been on screen without a single frame drawn (seconds). */
  let waited = 0;
  let lastTick = performance.now();
  function frame(): void {
    requestAnimationFrame(frame);
    const now = performance.now();
    const tick = Math.min((now - lastTick) / 1000, 0.5);
    lastTick = now;
    if (!renderer || !view.isConnected || view.offsetParent === null) return;
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      waited += tick;
      if (waited > 2 && frames === 0) fallBack(`no size ${canvas.clientWidth}x${canvas.clientHeight}`);
      return;
    }
    if (now - last < 1000 / cfg.previewFps - 2) return;
    const dt = last === 0 ? 0 : Math.min((now - last) / 1000, 0.1);
    last = now;
    if (dragX === null) yaw *= Math.exp(-2.5 * dt);
    turntable.rotation.y = baseYaw + yaw;
    character.update(dt);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    try {
      renderer.render(scene, camera);
      frames++;
    } catch (err) {
      fallBack(err instanceof Error ? err.message : String(err));
    }
  }
  requestAnimationFrame(frame);

  return {
    mount(holder) {
      if (view.parentElement !== holder) holder.append(view);
    },
    setLook(next) {
      current = next;
      character.setLook(next);
      if (!flat.hidden) flat.innerHTML = chibiSvg(next);
      baseYaw = next.handedness === 'left' ? Math.PI : 0;
    },
    play(mood) {
      character.play(mood);
    },
    faceFront() {
      yaw = 0;
    },
  };
}
