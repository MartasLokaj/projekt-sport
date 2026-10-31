import * as THREE from 'three';
import {
  DEFAULT_LOOK,
  EYES,
  GLASSES,
  HAIR_COLOURS,
  HAIR_STYLES,
  HATS,
  MOUTHS,
  PRESETS,
  randomAvatar,
  type AvatarLook,
} from '../../shared/avatar.ts';
import { SHIRT_COLOURS, SKIN_TONES } from '../../shared/protocol.ts';
import { buildRacket } from '../badminton/court.ts';
import { Character, type CharacterLook, type Mood } from '../game/character.ts';

// Test page (Mac): every character option side by side, to check how each looks and that nothing pokes
// through anything while the characters swing and celebrate. Open https://localhost:8443/avatars

type Cell = { stage: HTMLElement; label: HTMLElement; spin: THREE.Group; character: Character; look: CharacterLook };

const BASE: CharacterLook = { shirt: '#00a6ed', skin: SKIN_TONES[1], handedness: 'right', look: DEFAULT_LOOK };
const with_ = (look: Partial<AvatarLook>, rest: Partial<CharacterLook> = {}): CharacterLook => ({
  ...BASE,
  ...rest,
  look: { ...DEFAULT_LOOK, ...look },
});

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setScissorTest(true);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#dfe8ff', '#4b4f7a', 1.4));
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
sun.position.set(1.5, 3, 2.5);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);

let turning = true;
let faceView = false;
let racket = false;
let swingTime = -1;

const cells: Cell[] = [];
const rowsEl = document.querySelector('#rows')!;

function addRow(title: string, items: { label: string; look: CharacterLook }[]): Cell[] {
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  rowsEl.append(h, row);
  return items.map(({ label, look }) => {
    const el = document.createElement('div');
    el.className = 'cell';
    const stage = document.createElement('div');
    stage.className = 'stage';
    const p = document.createElement('p');
    p.textContent = label;
    el.append(stage, p);
    row.append(el);
    const character = new Character(look);
    character.place(new THREE.Vector3(), 0);
    const spin = new THREE.Group();
    spin.add(character.root);
    spin.visible = false;
    scene.add(spin);
    const cell = { stage, label: p, spin, character, look };
    cells.push(cell);
    return cell;
  });
}

addRow('Ready-made characters', PRESETS.map((p) => ({ label: p.label, look: { shirt: p.colour, skin: p.skin, handedness: 'right' as const, look: p.look } })));
const randomCells = addRow('Random', Array.from({ length: 6 }, (_, i) => ({ label: `Random ${i + 1}`, look: BASE })));
addRow('Hair style', HAIR_STYLES.map((o) => ({ label: o.label, look: with_({ hairStyle: o.id }) })));
addRow('Hair colour', HAIR_COLOURS.map((o) => ({ label: o.label, look: with_({ hairStyle: 'bob', hairColour: o.id }) })));
addRow('Eyes', EYES.map((o) => ({ label: o.label, look: with_({ eyes: o.id }) })));
addRow('Mouth', MOUTHS.map((o) => ({ label: o.label, look: with_({ mouth: o.id }) })));
addRow('Cheeks', [
  { label: 'Blush', look: with_({ blush: true }) },
  { label: 'None', look: with_({ blush: false }) },
]);
addRow('Hat', HATS.map((o) => ({ label: o.label, look: with_({ hat: o.id }) })));
addRow('Glasses', GLASSES.map((o) => ({ label: o.label, look: with_({ glasses: o.id }) })));
addRow(
  'Every hat on every hair style',
  HATS.slice(1).flatMap((hat) =>
    HAIR_STYLES.map((hair) => ({ label: `${hat.label} + ${hair.label}`, look: with_({ hat: hat.id, hairStyle: hair.id }) })),
  ),
);
addRow('Skin', SKIN_TONES.map((skin, i) => ({ label: `Skin ${i + 1}`, look: with_({}, { skin }) })));
addRow('Your colour', SHIRT_COLOURS.map((shirt, i) => ({ label: `Colour ${i + 1}`, look: with_({ hat: 'cap' }, { shirt }) })));
addRow('Putter', SHIRT_COLOURS.map((c, i) => ({ label: `Putter ${i + 1}`, look: with_({ putterColour: c }) })));

function rollRandom(): void {
  for (const cell of randomCells) {
    const r = randomAvatar();
    cell.look = { shirt: r.colour, skin: r.skin, handedness: 'right', look: r.look };
    cell.character.setLook(cell.look);
    if (racket) cell.character.setGear(heldRacket(cell.look.shirt));
  }
}
rollRandom();

// ---------- Buttons ----------

function toggle(id: string, onChange: (on: boolean) => void): void {
  const button = document.querySelector<HTMLButtonElement>(id)!;
  button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    onChange(on);
  });
}
toggle('#turn', (on) => (turning = on));
toggle('#face', (on) => (faceView = on));
toggle('#racket', (on) => {
  racket = on;
  for (const c of cells) c.character.setGear(on ? heldRacket(c.look.shirt) : 'putter');
});
document.querySelector('#random')!.addEventListener('click', rollRandom);
document.querySelector('#swing')!.addEventListener('click', () => {
  swingTime = 0;
  for (const c of cells) c.character.setStance('address');
});
document.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((b) =>
  b.addEventListener('click', () => {
    swingTime = -1;
    for (const c of cells) c.character.play(b.dataset.mood as Mood);
  }),
);

/** A racket in the hand, as on the Badminton side of the cube. */
function heldRacket(colour: string): THREE.Group {
  const grip = new THREE.Group();
  grip.position.set(0, -0.17, 0);
  grip.rotation.x = -2.5;
  const r = buildRacket(colour);
  r.position.y = 0.17;
  grip.add(r);
  return grip;
}

// ---------- Drawing: one canvas, each cell drawn into its own rectangle ----------

const clock = new THREE.Clock();
let angle = 0;

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (turning) angle += dt * 0.6;

  // Swing demo: address the ball, take the putter back, hit, then stand up again.
  if (swingTime >= 0) {
    const before = swingTime;
    swingTime += dt;
    for (const c of cells) {
      if (before < 0.5 && swingTime >= 0.5) c.character.setSwing(45);
      if (before < 1.3 && swingTime >= 1.3) c.character.strike(70);
      if (swingTime >= 3.2) c.character.setStance('stand');
    }
    if (swingTime >= 3.2) swingTime = -1;
  }

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
  }
  renderer.setScissor(0, 0, width, height);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();

  if (faceView) {
    camera.position.set(0, 0.74, 1.35);
    camera.lookAt(0, 0.68, 0);
  } else {
    camera.position.set(0, 0.62, 2.7);
    camera.lookAt(0, 0.5, 0);
  }
  const headerBottom = document.querySelector('header')!.getBoundingClientRect().bottom;
  for (const cell of cells) {
    cell.character.update(dt);
    cell.spin.rotation.y = turning ? angle : 0;
    const rect = cell.stage.getBoundingClientRect();
    if (rect.bottom < headerBottom || rect.top > height || rect.width === 0) continue;
    const top = Math.max(rect.top, headerBottom);
    cell.spin.visible = true;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setViewport(rect.left, height - rect.bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, height - rect.bottom, rect.width, rect.bottom - top);
    renderer.render(scene, camera);
    cell.spin.visible = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
