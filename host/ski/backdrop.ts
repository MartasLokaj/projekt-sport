import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';

// The sky around the run (SKI.md, phase S3): a gradient sky dome, a soft sun glow, and a ring of jagged low-poly
// mountains with snowy tops far away. All of it moves along with the camera (it is "at infinity"), so it never
// comes closer. Colours come from the look preset (TUNING.ski.look).

export type LookPreset = (typeof TUNING.ski.look.presets)[keyof typeof TUNING.ski.look.presets];

/** Seeded random numbers 0..1 (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Backdrop {
  readonly group = new THREE.Group();
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly glow: THREE.Sprite;
  private readonly mountains: THREE.Mesh;
  /** Each mountain vertex: its height share (0 foot .. 1 peak), for colouring the snow line. */
  private readonly heightShare: Float32Array;
  private readonly sunDirection = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        sun: { value: new THREE.Color() },
        sunDirection: { value: this.sunDirection },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 sun;
        uniform vec3 sunDirection;
        varying vec3 vDirection;
        void main() {
          float up = clamp(vDirection.y, 0.0, 1.0);
          vec3 colour = mix(horizon, top, pow(up, 0.55));
          // A warm haze round the sun, strongest near the horizon.
          float toward = max(dot(normalize(vDirection), sunDirection), 0.0);
          colour = mix(colour, sun, pow(toward, 6.0) * 0.45 + pow(toward, 60.0) * 0.5);
          gl_FragColor = vec4(colour, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMaterial);
    sky.renderOrder = -10;
    this.group.add(sky);

    // The sun: a bright soft disc with a wide glow.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.08, 'rgba(255,255,250,1)');
    gradient.addColorStop(0.18, 'rgba(255,240,215,0.55)');
    gradient.addColorStop(1, 'rgba(255,230,200,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.glow.scale.setScalar(260);
    this.glow.renderOrder = -9;
    this.group.add(this.glow);

    // Mountains: jagged cones in a ring, with their feet hidden below the horizon.
    const c = TUNING.ski.look;
    const rand = random(11);
    const parts: { positions: number[]; shares: number[] } = { positions: [], shares: [] };
    for (let i = 0; i < c.mountains; i++) {
      const angle = (i / c.mountains) * Math.PI * 2 + rand() * 0.15;
      const distance = c.mountainDistance[0] + rand() * (c.mountainDistance[1] - c.mountainDistance[0]);
      const height = c.mountainHeight[0] + rand() * (c.mountainHeight[1] - c.mountainHeight[0]);
      const radius = height * (0.9 + rand() * 0.7);
      const cone = new THREE.ConeGeometry(radius, height, 5 + Math.floor(rand() * 3), 3).toNonIndexed();
      const position = cone.getAttribute('position');
      const jitter = new Map<string, [number, number, number]>();
      for (let k = 0; k < position.count; k++) {
        const key = `${position.getX(k).toFixed(2)},${position.getY(k).toFixed(2)},${position.getZ(k).toFixed(2)}`;
        if (!jitter.has(key)) jitter.set(key, [(rand() - 0.5) * radius * 0.35, (rand() - 0.5) * height * 0.18, (rand() - 0.5) * radius * 0.35]);
        const [jx, jy, jz] = jitter.get(key)!;
        const y = position.getY(k);
        const share = (y + height / 2) / height;
        const top = share > 0.99;
        parts.positions.push(
          Math.cos(angle) * distance + position.getX(k) + (top ? jx * 0.5 : jx),
          y + height / 2 - 40 + (top ? 0 : jy),
          Math.sin(angle) * distance + position.getZ(k) + (top ? jz * 0.5 : jz),
        );
        parts.shares.push(share);
      }
      cone.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(parts.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(parts.positions.length), 3));
    geometry.computeVertexNormals();
    this.heightShare = new Float32Array(parts.shares);
    this.mountains = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }));
    this.mountains.renderOrder = -8;
    this.group.add(this.mountains);
  }

  /** New colours and sun direction (dir = from the scene towards the sun). */
  applyLook(look: LookPreset, sunDirection: THREE.Vector3): void {
    const u = this.skyMaterial.uniforms;
    (u.top.value as THREE.Color).set(look.skyTop);
    (u.horizon.value as THREE.Color).set(look.skyHorizon);
    (u.sun.value as THREE.Color).set(look.sun);
    this.sunDirection.copy(sunDirection).normalize();
    this.glow.position.copy(this.sunDirection).multiplyScalar(800);
    this.glow.material.color.set(look.sun);
    // Mountains: rock below, snow above, both faded into the haze (they are far away).
    const colours = this.mountains.geometry.getAttribute('color') as THREE.BufferAttribute;
    const rock = new THREE.Color(look.mountain);
    const snow = new THREE.Color(look.mountainSnow);
    const haze = new THREE.Color(look.skyHorizon);
    const colour = new THREE.Color();
    for (let i = 0; i < colours.count; i++) {
      const face = Math.floor(i / 3) * 3; // flat colour per face: by its highest corner
      const share = Math.max(this.heightShare[face], this.heightShare[face + 1], this.heightShare[face + 2]);
      colour.copy(share > 0.55 ? snow : rock).lerp(haze, 0.5);
      colours.setXYZ(i, colour.r, colour.g, colour.b);
    }
    colours.needsUpdate = true;
  }

  /** Keeps everything centred on the camera (far away in every direction). */
  follow(camera: THREE.Camera): void {
    this.group.position.set(camera.position.x, camera.position.y - 60, camera.position.z);
  }
}
