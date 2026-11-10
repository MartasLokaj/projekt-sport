import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';
import type { LookPreset } from './backdrop.ts';
import type { Course } from './course.ts';
import type { RacerPhysics } from './racer.ts';

// The trail a skier leaves in the snow (SKI.md, phase S4): two deep grooves, one per ski, inside a wide soft
// wake of pushed snow. It is a flat ribbon lying on the ground, but it reads as a trench: the groove bottoms are
// tinted like shadow, and the lips on both sides have their normals tipped towards the groove, so one lip
// catches the sun and the other falls dark, like real walls would. Hard carving widens the grooves.
// No trail in the air or while tumbling. The oldest part fades out.

/** Across the trail at one point: 4 wake vertices, then 6 per ski (outer fade, lip, groove, groove, lip, outer fade). */
const PER_SAMPLE = 16;

type Sample = {
  /** PER_SAMPLE positions (x, y, z each). */
  positions: Float32Array;
  /** The ground's normal there, and the direction across the trail (world x, z). */
  normal: THREE.Vector3;
  acrossX: number;
  acrossZ: number;
  /** An invisible sample: the trail is broken here (take-off, landing, crash, put back). */
  gap: boolean;
};

export class SkiTrack {
  readonly mesh: THREE.Mesh;
  private readonly samples: Sample[] = [];
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly colours: Float32Array;
  private readonly groove = new THREE.Color();
  private readonly wake = new THREE.Color();
  private lastX = 0;
  private lastD = 0;
  private wasDown = false;

  constructor(private readonly course: Course) {
    const n = TUNING.ski.tracks.samples;
    this.positions = new Float32Array(n * PER_SAMPLE * 3);
    this.normals = new Float32Array(n * PER_SAMPLE * 3);
    this.colours = new Float32Array(n * PER_SAMPLE * 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colours, 4));
    // Strips between neighbouring samples: the wake first (it lies under the grooves), then both skis.
    const indices: number[] = [];
    const strips = [0, 1, 2, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14];
    for (let i = 0; i < n - 1; i++) {
      for (const k of strips) {
        const a = i * PER_SAMPLE + k;
        const b = a + PER_SAMPLE;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
  }

  applyLook(look: LookPreset): void {
    // The groove's bottom: snow tinted with the sky's shadow colour; the wake: a lighter touch of the same.
    const snow = new THREE.Color(look.snow);
    const sky = new THREE.Color(look.hemiSky);
    this.groove.copy(snow).lerp(sky, 0.75).multiplyScalar(0.62);
    this.wake.copy(snow).lerp(sky, 0.35).multiplyScalar(0.9);
    this.rebuild();
  }

  clear(): void {
    this.samples.length = 0;
    this.wasDown = false;
    this.rebuild();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  /** Called every frame with the skier's state: adds to the trail as the skier moves. */
  update(b: RacerPhysics): void {
    const cfg = TUNING.ski.tracks;
    const down = !b.air && b.crashLeft <= 0;
    const moved = Math.hypot(b.x - this.lastX, b.d - this.lastD);
    if (down && !this.wasDown) {
      // Touching down (or the very start): the trail begins here.
      this.add(b, true);
      this.add(b, false);
    } else if (down && moved > cfg.spacing * 6) {
      // Put somewhere else (back with the pack, a restart): break the trail.
      this.gapAtEnd();
      this.add(b, true);
      this.add(b, false);
    } else if (down && moved >= cfg.spacing) {
      this.add(b, false);
    } else if (!down && this.wasDown) {
      // Leaving the snow: the trail ends here.
      this.add(b, false);
      this.gapAtEnd();
    } else return;
    this.wasDown = down;
    this.rebuild();
  }

  /** Repeats the last sample as an invisible one, so nothing is drawn from it to the next sample. */
  private gapAtEnd(): void {
    const last = this.samples.at(-1);
    if (last && !last.gap) this.push({ ...last, gap: true });
  }

  private push(sample: Sample): void {
    this.samples.push(sample);
    if (this.samples.length > TUNING.ski.tracks.samples) this.samples.shift();
  }

  private add(b: RacerPhysics, gap: boolean): void {
    const cfg = TUNING.ski.tracks;
    this.lastX = b.x;
    this.lastD = b.d;
    const h = THREE.MathUtils.degToRad(b.heading);
    // Across the trail, in (x, d): to the skier's right.
    const ax = Math.cos(h);
    const ad = -Math.sin(h);
    const course = this.course;
    // Carving hard skids the skis: wider grooves.
    const half = (cfg.grooveWidth / 2) * (1 + Math.min(cfg.carveWiden, b.turnRate / 90));
    const lip = half + cfg.lipWidth;
    const fade = lip + cfg.lipFade;
    const s = cfg.skiApart / 2;
    const offsets = [
      -cfg.wakeWidth / 2, -cfg.wakeWidth * 0.28, cfg.wakeWidth * 0.28, cfg.wakeWidth / 2,
      -s - fade, -s - lip, -s - half, -s + half, -s + lip, -s + fade,
      s - fade, s - lip, s - half, s + half, s + lip, s + fade,
    ];
    const positions = new Float32Array(PER_SAMPLE * 3);
    offsets.forEach((o, k) => {
      const x = b.x + ax * o;
      const d = b.d + ad * o;
      positions[k * 3] = x;
      positions[k * 3 + 1] = course.height(x, d) + cfg.lift;
      positions[k * 3 + 2] = -d;
    });
    const here = course.height(b.x, b.d);
    const normal = new THREE.Vector3(-(course.height(b.x + 0.5, b.d) - here) / 0.5, 1, (course.height(b.x, b.d + 0.5) - here) / 0.5).normalize();
    this.push({ positions, normal, acrossX: ax, acrossZ: -ad, gap });
  }

  /** Writes the whole trail into the mesh (the oldest samples fade out). */
  private rebuild(): void {
    const cfg = TUNING.ski.tracks;
    const count = this.samples.length;
    const total = cfg.samples;
    const tilt = cfg.lipTilt;
    const n = new THREE.Vector3();
    this.samples.forEach((sample, i) => {
      this.positions.set(sample.positions, i * PER_SAMPLE * 3);
      // Old end fades over the first fifth of the buffer once it is full.
      const age = total - count + i;
      const life = sample.gap ? 0 : Math.min(1, age / (total * 0.25));
      for (let k = 0; k < PER_SAMPLE; k++) {
        const at = i * PER_SAMPLE + k;
        const inSki = k < 4 ? -1 : (k - 4) % 6; // 0 fade, 1 lip, 2–3 groove, 4 lip, 5 fade
        // Lips lean towards the groove (like its walls): left side leans right, right side leans left.
        const lean = inSki === 0 || inSki === 1 ? tilt : inSki === 4 || inSki === 5 ? -tilt : 0;
        n.set(sample.normal.x + sample.acrossX * lean, sample.normal.y, sample.normal.z + sample.acrossZ * lean).normalize();
        this.normals[at * 3] = n.x;
        this.normals[at * 3 + 1] = n.y;
        this.normals[at * 3 + 2] = n.z;
        let colour = this.wake;
        let alpha = 0;
        if (k < 4) alpha = k === 1 || k === 2 ? cfg.wakeAlpha : 0;
        else if (inSki === 2 || inSki === 3) {
          colour = this.groove;
          alpha = cfg.grooveAlpha;
        } else {
          colour = WHITE;
          alpha = inSki === 1 || inSki === 4 ? cfg.lipAlpha : 0;
        }
        this.colours[at * 4] = colour.r;
        this.colours[at * 4 + 1] = colour.g;
        this.colours[at * 4 + 2] = colour.b;
        this.colours[at * 4 + 3] = alpha * life;
      }
    });
    const geometry = this.mesh.geometry;
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('normal').needsUpdate = true;
    geometry.getAttribute('color').needsUpdate = true;
    geometry.setDrawRange(0, Math.max(0, count - 1) * 13 * 6);
  }
}

const WHITE = new THREE.Color('#ffffff');
