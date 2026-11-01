import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TUNING } from '../../shared/tuning.ts';
import { sound } from '../audio/sound.ts';
import { Character, type CharacterLook } from '../game/character.ts';
import { Confetti } from '../hub/confetti.ts';

// The podium after a match: the players' characters on a 1st / 2nd / 3rd step (shared places stand together,
// 4th and lower beside it on the ground), the winners jump and cheer under confetti, the others clap.
// Enter plays again, Esc goes back to the cube. Used by minigolf and badminton.

export type PodiumEntry = {
  name: string;
  look: CharacterLook;
  /** 1 = winner. Equal places share a step. */
  place: number;
  /** A short line under the name, e.g. "12 strokes". */
  detail: string;
};

export type PodiumShow = {
  game: 'minigolf' | 'badminton';
  title: string;
  subtitle: string;
  entries: PodiumEntry[];
};

type Standing = { character: Character; entry: PodiumEntry; nextCheer: number; jumpCount: number };
/** One name tag per place, above the characters standing there (e.g. "Martas & Tom"). */
type PlaceTag = { tag: HTMLElement; members: Character[] };

const GRAVITY = new THREE.Vector3(0, -9, 0);
const PLACE_TEXT = ['1st', '2nd', '3rd'];

export class Podium {
  /** Enter or the Play again button. */
  onPlayAgain: () => void = () => {};
  /** Esc or the Back to the cube button. */
  onBack: () => void = () => {};

  private readonly screen = document.createElement('div');
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(TUNING.podium.cameraFov, 1, 0.1, 100);
  private readonly world = new THREE.Group();
  private readonly confetti = new Confetti();
  /** A big round meadow or beach that fades into the sky far away (fog in the sky's lower colour). */
  private readonly ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ roughness: 0.95 }));
  private readonly title = document.createElement('h1');
  private readonly subtitle = document.createElement('p');
  private readonly tags = document.createElement('div');
  private readonly clock = new THREE.Clock();
  private standing: Standing[] = [];
  private placeTags: PlaceTag[] = [];
  private time = 0;
  private nextConfetti = 0;
  private running = false;

  constructor() {
    this.screen.id = 'podium-screen';
    this.screen.hidden = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TUNING.scenery.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const head = document.createElement('div');
    head.className = 'podium-head';
    head.append(this.title, this.subtitle);
    this.tags.className = 'podium-tags';
    const buttons = document.createElement('div');
    buttons.className = 'podium-buttons';
    const again = button('Play again', 'Enter', 'cw-btn cw-btn--play', () => this.onPlayAgain());
    const back = button('Back to the cube', 'Esc', 'cw-btn cw-btn--ghost', () => this.onBack());
    buttons.append(back, again);
    this.screen.append(this.renderer.domElement, this.tags, head, buttons);
    document.body.append(this.screen);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c9b28a', 1.3));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(4, 9, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -4, near: 1, far: 30 });
    this.scene.add(sun, this.world, this.confetti.mesh);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.buildSteps();

    window.addEventListener('resize', () => this.resize());
    // While the podium shows, Enter and Esc belong to it (caught before the games' own keys).
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.screen.hidden || e.repeat) return;
        if (e.key === 'Enter') this.onPlayAgain();
        else if (e.key === 'Escape') this.onBack();
        else return;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true,
    );
  }

  get visible(): boolean {
    return !this.screen.hidden;
  }

  show(show: PodiumShow): void {
    const p = TUNING.podium;
    const [top, bottom] = p.sky[show.game];
    this.screen.style.background = `linear-gradient(${top}, ${bottom})`;
    (this.ground.material as THREE.MeshStandardMaterial).color.set(p.ground[show.game]);
    this.scene.fog = new THREE.Fog(bottom, 14, 40);
    this.title.textContent = show.title;
    this.subtitle.textContent = show.subtitle;
    this.clear();
    this.placeCharacters(show.entries);
    this.screen.hidden = false;
    this.time = 0;
    this.nextConfetti = 0.5;
    sound.play('jingle-win');
    this.resize();
    this.clock.getDelta();
    if (!this.running) {
      this.running = true;
      this.renderer.setAnimationLoop(() => this.frame());
    }
  }

  hide(): void {
    this.screen.hidden = true;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.clear();
  }

  /** One frame. Public for checks in the browser console. */
  frame(dt = Math.min(this.clock.getDelta(), 0.05)): void {
    const p = TUNING.podium;
    this.time += dt;
    // The camera swoops down from high above, then sways gently from side to side.
    const k = Math.min(1, this.time / p.swoopSeconds);
    const ease = 1 - (1 - k) ** 3;
    const sway = Math.sin(this.time * 0.4) * p.sway * ease;
    this.camera.position.set(sway, p.cameraHeight + (1 - ease) * 6, p.cameraDistance + (1 - ease) * 6);
    this.camera.lookAt(0, p.lookHeight, 0);

    for (const s of this.standing) {
      if (this.time >= s.nextCheer) {
        // Winners alternate big jumps and cheers; everyone else claps for them.
        const mood = s.entry.place === 1 ? (s.jumpCount++ % 2 === 0 ? 'jump' : 'cheer') : 'clap';
        s.character.play(mood);
        s.nextCheer = this.time + between(p.cheerEvery);
      }
      s.character.update(dt);
    }
    if (this.time >= this.nextConfetti) {
      for (const s of this.standing.filter((w) => w.entry.place === 1)) {
        const at = s.character.root.getWorldPosition(new THREE.Vector3());
        at.y += TUNING.character.height * p.characterScale * 1.4;
        this.confetti.burst(at, s.entry.look.shirt, new THREE.Vector3(0, 1, 0), p.confettiPieces);
      }
      sound.play('sparkle', 0.4, 1.3);
      this.nextConfetti = this.time + between(p.confettiEvery);
    }
    this.confetti.update(dt, GRAVITY);
    this.renderer.render(this.scene, this.camera);
    this.positionTags();
  }

  /** Three steps: 2nd on the left, 1st in the middle (highest), 3rd on the right, each with its number. */
  private buildSteps(): void {
    const p = TUNING.podium;
    const xs = [0, -p.stepWidth, p.stepWidth];
    p.stepHeights.forEach((height, i) => {
      const step = new THREE.Mesh(
        new RoundedBoxGeometry(p.stepWidth - 0.05, height, p.stepDepth, 4, 0.08),
        new THREE.MeshStandardMaterial({ color: p.stepColours[i], roughness: 0.55 }),
      );
      step.position.set(xs[i], height / 2, 0);
      step.castShadow = step.receiveShadow = true;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ map: numberTexture(i + 1), transparent: true }));
      label.position.set(0, 0, p.stepDepth / 2 + 0.01);
      step.add(label);
      this.scene.add(step);
    });
  }

  /** Characters on their step: shared places stand side by side; 4th and lower stand on the ground to the right. */
  private placeCharacters(entries: PodiumEntry[]): void {
    const p = TUNING.podium;
    const xs = [0, -p.stepWidth, p.stepWidth];
    const groups = new Map<number, PodiumEntry[]>();
    for (const e of entries) groups.set(Math.min(e.place, 4), [...(groups.get(Math.min(e.place, 4)) ?? []), e]);
    for (const [place, group] of groups) {
      const members: Character[] = [];
      group.forEach((entry, i) => {
        const character = new Character(entry.look, { putter: false });
        character.root.scale.setScalar(p.characterScale);
        const spread = place <= 3 ? Math.min(1.0, (p.stepWidth - 0.3) / Math.max(1, group.length - 1)) : 0.9;
        const x = place <= 3 ? xs[place - 1] + (i - (group.length - 1) / 2) * spread : p.stepWidth * 1.75 + i * spread;
        const y = place <= 3 ? p.stepHeights[place - 1] : 0;
        character.place(new THREE.Vector3(x, y, place <= 3 ? 0.1 : 0.8), 0);
        character.root.traverse((o) => (o.castShadow = true));
        this.world.add(character.root);
        members.push(character);
        // Everyone starts celebrating a little after the podium appears, not all at once.
        this.standing.push({ character, entry, nextCheer: 0.6 + Math.random() * 0.6, jumpCount: 0 });
      });
      const tag = document.createElement('div');
      tag.className = `podium-tag${place === 1 ? ' is-winner' : ''}`;
      const placeText = place <= 3 ? PLACE_TEXT[place - 1] : `${place}th`;
      tag.innerHTML = '<b></b><span></span>';
      tag.querySelector('b')!.textContent = group.map((e) => e.name).join(' & ');
      tag.querySelector('span')!.textContent = group.every((e) => e.detail === group[0].detail)
        ? `${placeText} · ${group[0].detail}`
        : `${placeText} · ${group.map((e) => e.detail).join(' / ')}`;
      tag.style.setProperty('--colour', group[0].look.shirt);
      this.tags.append(tag);
      this.placeTags.push({ tag, members });
    }
  }

  private positionTags(): void {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const scale = TUNING.podium.characterScale;
    for (const { tag, members } of this.placeTags) {
      // Above the middle of the group, as high as its highest head (it follows a jump).
      const head = new THREE.Vector3();
      for (const m of members) head.x += m.root.position.x / members.length;
      head.y = Math.max(...members.map((m) => m.root.position.y)) + TUNING.character.height * scale + 0.35;
      head.z = members[0].root.position.z;
      head.project(this.camera);
      tag.style.left = `${((head.x + 1) / 2) * w}px`;
      tag.style.top = `${((1 - head.y) / 2) * h}px`;
    }
  }

  private clear(): void {
    for (const s of this.standing) this.world.remove(s.character.root);
    for (const t of this.placeTags) t.tag.remove();
    this.standing = [];
    this.placeTags = [];
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Narrow screens: see a little wider so all three steps fit.
    this.camera.fov = TUNING.podium.cameraFov * Math.max(1, 1.4 / this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }
}

function button(text: string, key: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.append(text);
  const kbd = document.createElement('kbd');
  kbd.textContent = key;
  b.append(kbd);
  b.addEventListener('click', onClick);
  return b;
}

function between([from, to]: readonly number[]): number {
  return from + Math.random() * (to - from);
}

/** A big step number ("1", "2", "3") drawn on a canvas, for the front of the step. */
function numberTexture(n: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '900 112px "Nunito Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = 'rgba(60, 40, 10, 0.35)';
  ctx.lineWidth = 8;
  ctx.strokeText(String(n), 96, 70);
  ctx.fillText(String(n), 96, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
