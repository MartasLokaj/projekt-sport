import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';
import { Character, type CharacterLook, type Mood } from '../../host/game/character.ts';

// The live 3D preview of the player's character on the phone: the same character code as the big screen.
// One small WebGL canvas, moved between the join screen and the editor. It only draws while it is on
// screen, at a capped frame rate and pixel ratio to save battery. Drag sideways to turn the character.

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
  const canvas = document.createElement('canvas');
  canvas.className = 'avatar-canvas';
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, cfg.previewPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  } catch {
    // No WebGL on this phone: the editor still works, just without the 3D preview.
    canvas.hidden = true;
  }

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

  let last = performance.now();
  function frame(now: number): void {
    requestAnimationFrame(frame);
    if (!renderer || !canvas.isConnected || canvas.clientWidth === 0) return;
    if (now - last < 1000 / cfg.previewFps - 2) return;
    const dt = Math.min((now - last) / 1000, 0.1);
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
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    mount(holder) {
      if (canvas.parentElement !== holder) holder.append(canvas);
    },
    setLook(next) {
      character.setLook(next);
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
