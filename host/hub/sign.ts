import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TUNING } from '../../shared/tuning.ts';
import { canvasTexture, type FaceInfo } from './faces.ts';

// The chosen side's name sign: a little wooden board on two posts at the back of that side, with the
// game's name painted in its colour. It springs up when the side has turned towards the camera.

export class FaceSign {
  readonly root = new THREE.Group();
  private readonly board = new THREE.Group();
  private readonly face: THREE.Mesh;
  private readonly textures = new Map<string, THREE.Texture>();
  private age = 0;
  private shown = false;

  constructor() {
    const wood = new THREE.MeshStandardMaterial({ color: '#c98e52', roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: '#8a5a2e', roughness: 0.9 });
    const plank = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.7, 0.12, 3, 0.05), wood);
    plank.castShadow = true;
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(2.26, 0.58), new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.9 }));
    this.face.position.z = 0.061;
    for (const x of [-0.85, 0.85]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.0, 10), dark);
      post.position.set(x, -0.5, -0.02);
      post.castShadow = true;
      this.board.add(post);
    }
    this.board.add(plank, this.face);
    this.board.position.y = 1.0;
    this.root.add(this.board);
    this.root.visible = false;
  }

  /** Moves the sign onto a side (or hides it with null). It springs up again each time. */
  show(face: FaceInfo | null, side: THREE.Object3D | null): void {
    this.shown = !!face && !!side;
    this.age = 0;
    this.root.visible = false;
    if (!face || !side) return;
    side.add(this.root);
    this.root.position.set(0, 0.1, -TUNING.hub.cubeSize / 2 + TUNING.hub.signInset);
    (this.face.material as THREE.MeshStandardMaterial).map = this.texture(face);
    (this.face.material as THREE.MeshStandardMaterial).needsUpdate = true;
  }

  /** `settled`: the chosen side has turned up, so the sign may pop up. */
  update(dt: number, settled: boolean, time: number): void {
    if (!this.shown || !settled) return;
    this.age += dt;
    this.root.visible = true;
    const t = Math.min(1, this.age / TUNING.hub.signPopSeconds);
    const s = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 2.5); // springs up with a wobble
    this.root.scale.set(1, Math.max(0.001, s), 1);
    this.board.rotation.z = Math.sin(time * 1.3) * 0.015;
  }

  private texture(face: FaceInfo): THREE.Texture {
    let texture = this.textures.get(face.id);
    if (texture) return texture;
    const title = face.status === 'soon' ? 'Coming soon' : face.title;
    const draw = (c: CanvasRenderingContext2D): void => {
      c.clearRect(0, 0, 1024, 256);
      c.fillStyle = '#ecd3a4';
      c.beginPath();
      c.roundRect(8, 8, 1008, 240, 36);
      c.fill();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `900 ${title.length > 10 ? 120 : 150}px "Nunito Sans", ui-rounded, system-ui, sans-serif`;
      c.lineWidth = 18;
      c.lineJoin = 'round';
      c.strokeStyle = '#ffffff';
      c.strokeText(title, 512, 136);
      c.fillStyle = shade(face.accent, 0.5);
      c.fillText(title, 512, 136);
    };
    texture = canvasTexture(1024, 256, draw);
    // Draw again once the game font has loaded, in case it wasn't ready the first time.
    const ready = texture;
    void document.fonts.load('900 150px "Nunito Sans"').then(() => {
      draw((ready.image as HTMLCanvasElement).getContext('2d')!);
      ready.needsUpdate = true;
    });
    this.textures.set(face.id, texture);
    return texture;
  }
}

/** The colour made darker (factor < 1), so light game colours still read on the pale board. */
function shade(colour: string, factor: number): string {
  return `#${new THREE.Color(colour).multiplyScalar(factor).getHexString()}`;
}
