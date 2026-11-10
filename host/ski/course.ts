import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';

// The ski run (SKI.md, phase S2a): a winding valley from the start gate down to the finish, generated from a seed
// (the same run every time). Positions on the run: x = metres across (+ = right when looking downhill),
// d = metres down the run (0 = start gate). In the 3D world x stays x, z = -d and y is the height.
// The run has bends, steeper and flatter parts, rollers (bumps across the run), kickers (jumps), gates (pairs of
// flags that give a little speed), tree islands and rocks; outside its edges the ground rises into forested walls.
// Graybox look for now (S3 does the real look): white snow with a faint grid, green cone trees, grey rocks.

export type Obstacle = { x: number; d: number; radius: number; height: number; kind: 'tree' | 'rock'; size: number; turn: number };
export type Gate = { d: number; x: number; width: number; colour: string; flags: THREE.Group | null };
type Kicker = { d: number; x: number };
type Rollers = { from: number; to: number };

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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const BUCKET = 10;
const CHUNK = 100;
/** Before the start gate the run goes on uphill a little (the start area). */
const BEFORE_START = 40;

export class Course {
  readonly length: number;
  readonly end: number;
  readonly gates: Gate[] = [];
  readonly kickers: Kicker[] = [];
  readonly obstacles: Obstacle[] = [];
  private readonly rollers: Rollers[] = [];
  private readonly buckets = new Map<number, Obstacle[]>();
  /** Height of the run's middle every metre, from d = -BEFORE_START. */
  private readonly base: Float32Array;
  private readonly chunks: { from: number; group: THREE.Group }[] = [];

  constructor() {
    const c = TUNING.ski.course;
    this.length = c.length;
    this.end = c.length + c.runOut;
    const rand = random(c.seed);

    // Height of the middle: walk down the run adding up the steepness.
    const count = Math.ceil(this.end + BEFORE_START + 60);
    this.base = new Float32Array(count + 1);
    let h = 0;
    for (let i = 1; i <= count; i++) {
      const d = i - BEFORE_START;
      h -= Math.tan(THREE.MathUtils.degToRad(this.slopeAt(d)));
      this.base[i] = h;
    }
    const zero = this.base[BEFORE_START];
    for (let i = 0; i <= count; i++) this.base[i] -= zero;

    for (let d = c.kickerFirst; d < c.length - 150; d += c.kickerEvery) {
      const at = d + (rand() - 0.5) * 40;
      this.kickers.push({ d: at, x: this.centre(at) + (rand() - 0.5) * 0.6 * this.halfWidth(at) });
    }
    for (let d = c.rollerEvery * 0.6; d < c.length - c.rollerSection - 60; d += c.rollerEvery) {
      this.rollers.push({ from: d, to: d + c.rollerSection });
    }
    const nearKicker = (d: number, margin: number): boolean => this.kickers.some((k) => d > k.d - margin && d < k.d + c.kickerLength + margin);

    let side = 1;
    for (let d = c.gateFirst; d < c.length - 80; d += c.gateEvery) {
      let at = d;
      while (nearKicker(at, 25)) at += 10;
      side = -side;
      this.gates.push({ d: at, x: this.centre(at) + side * c.gateOffset * this.halfWidth(at), width: c.gateWidth, colour: side > 0 ? '#e5484d' : '#2f6fde', flags: null });
    }
    const nearGate = (d: number, margin: number): boolean => this.gates.some((g) => Math.abs(g.d - d) < margin);
    const busy = (d: number, margin: number): boolean => nearKicker(d, margin) || nearGate(d, margin) || d < 60 || Math.abs(d - c.length) < 40;

    // The forest along both edges (bigger trees further out).
    for (let d = -BEFORE_START; d < this.end + 40; d += c.treeSpacing) {
      for (const s of [-1, 1]) {
        for (let depth = 1.6; depth < c.forestDepth; depth += c.treeSpacing) {
          if (rand() > c.forestDensity) continue;
          const at = d + (rand() - 0.5) * c.treeSpacing * 0.8;
          const out = depth + (rand() - 0.5) * c.treeSpacing * 0.6;
          const size = 0.8 + Math.min(1, out / c.forestDepth) * 0.8 + rand() * 0.4;
          this.addObstacle({ x: this.centre(at) + s * (this.halfWidth(at) + Math.max(1.4, out)), d: at, radius: 0.55 * size, height: 4 * size, kind: 'tree', size, turn: rand() * 6.28 });
        }
      }
    }
    // Tree islands in the run.
    for (let d = 150; d < c.length - 60; d += c.islandEvery) {
      const at = d + (rand() - 0.5) * 40;
      if (busy(at, 22)) continue;
      const x = this.centre(at) + (rand() * 2 - 1) * 0.45 * this.halfWidth(at);
      const trees = 3 + Math.floor(rand() * 4);
      for (let i = 0; i < trees; i++) {
        const size = 0.8 + rand() * 0.5;
        this.addObstacle({ x: x + (rand() * 2 - 1) * 3.5, d: at + (rand() * 2 - 1) * 4, radius: 0.55 * size, height: 4 * size, kind: 'tree', size, turn: rand() * 6.28 });
      }
    }
    // Lone rocks.
    for (let d = 80; d < c.length - 40; d += c.rockEvery) {
      const at = d + (rand() - 0.5) * 20;
      if (busy(at, 12)) continue;
      const size = 0.6 + rand() * 0.7;
      const x = this.centre(at) + (rand() * 2 - 1) * 0.85 * this.halfWidth(at);
      this.addObstacle({ x, d: at, radius: size, height: size * 0.9, kind: 'rock', size, turn: rand() * 6.28 });
    }
  }

  // ---------- Shape ----------

  /** Steepness at d in degrees (positive = downhill). */
  private slopeAt(d: number): number {
    const c = TUNING.ski.course;
    const middle = c.slopeDeg + c.slopeChange * Math.sin(d / 170 + 0.7);
    const start = 6 + (middle - 6) * smoothstep(0, c.startStraight, d);
    if (d < c.length) return d < c.startStraight ? start : middle;
    return middle + (c.runOutSlopeDeg - middle) * smoothstep(c.length, c.length + 30, d);
  }

  /** How much the run bends at d (0 at the start and the finish, 1 in between). */
  private bendShare(d: number): number {
    const c = TUNING.ski.course;
    return smoothstep(c.startStraight, c.startStraight + 80, d) * (1 - smoothstep(c.length - 70, c.length, d));
  }

  /** The run's middle (x) at d. */
  centre(d: number): number {
    const c = TUNING.ski.course;
    return this.bendShare(d) * (c.bendSize * Math.sin(d / c.bendLength) + c.wiggleSize * Math.sin(d / c.wiggleLength + 1.3));
  }

  /** Which way the run goes at d, in degrees from straight downhill (+ = to the right). */
  direction(d: number): number {
    return THREE.MathUtils.radToDeg(Math.atan((this.centre(d + 1) - this.centre(d - 1)) / 2));
  }

  halfWidth(d: number): number {
    const c = TUNING.ski.course;
    return c.halfWidth + c.widthChange * Math.sin(d / 130 + 2);
  }

  /** Height of the middle line at d. */
  private baseHeight(d: number): number {
    const i = Math.min(this.base.length - 2, Math.max(0, d + BEFORE_START));
    const i0 = Math.floor(i);
    return this.base[i0] + (this.base[i0 + 1] - this.base[i0]) * (i - i0);
  }

  /** How far past the run's edge x is at d (0 inside the run). */
  outside(x: number, d: number): number {
    return Math.max(0, Math.abs(x - this.centre(d)) - this.halfWidth(d));
  }

  /** How much of a kicker is under x, d (0..1), so the ramp can be coloured and seen from afar. */
  kickerShare(x: number, d: number): number {
    const c = TUNING.ski.course;
    let share = 0;
    for (const k of this.kickers) {
      const u = d - k.d;
      if (u <= -1 || u >= c.kickerLength + 3) continue;
      share = Math.max(share, 1 - smoothstep(c.kickerWidth / 2 - 0.6, c.kickerWidth / 2 + 0.4, Math.abs(x - k.x)));
    }
    return share;
  }

  /** Height of the ground. */
  height(x: number, d: number): number {
    const c = TUNING.ski.course;
    const out = this.outside(x, d);
    let h = this.baseHeight(d) + c.wallHeight * smoothstep(0, c.wallWidth, out) + Math.max(0, out - c.wallWidth) * 0.5;
    const inRun = 1 - smoothstep(0, 3, out);
    if (inRun > 0) {
      for (const r of this.rollers) {
        if (d <= r.from || d >= r.to) continue;
        const u = d - r.from;
        h += inRun * c.rollerHeight * Math.sin((Math.PI * u) / (r.to - r.from)) * Math.sin((2 * Math.PI * u) / c.rollerLength);
      }
      for (const k of this.kickers) {
        const u = d - k.d;
        if (u <= 0 || u >= c.kickerLength + 3) continue;
        const across = 1 - smoothstep(c.kickerWidth / 2 - 1.2, c.kickerWidth / 2, Math.abs(x - k.x));
        const rise = u <= c.kickerLength ? (u / c.kickerLength) ** 2 : 1 - (u - c.kickerLength) / 3;
        h += inRun * across * c.kickerHeight * rise;
      }
    }
    return h;
  }

  // ---------- Obstacles ----------

  private addObstacle(o: Obstacle): void {
    this.obstacles.push(o);
    const key = Math.floor(o.d / BUCKET);
    const list = this.buckets.get(key);
    if (list) list.push(o);
    else this.buckets.set(key, [o]);
  }

  /** Obstacles within `reach` metres (along the run) of d. */
  near(d: number, reach: number): Obstacle[] {
    const found: Obstacle[] = [];
    for (let key = Math.floor((d - reach) / BUCKET); key <= Math.floor((d + reach) / BUCKET); key++) {
      const list = this.buckets.get(key);
      if (list) found.push(...list);
    }
    return found;
  }

  // ---------- 3D ----------

  /** Builds the run's meshes (in pieces of CHUNK metres, so only the part near the skier is drawn). */
  build(renderer: THREE.WebGLRenderer): THREE.Group {
    const root = new THREE.Group();
    const texture = gridTexture(renderer);
    const snow = new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 0.92 });
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: '#7fb0ee' });
    const foliage = new THREE.MeshStandardMaterial({ color: '#3f7d4f', roughness: 0.85, flatShading: true });
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.9 });
    const rockMaterial = new THREE.MeshStandardMaterial({ color: '#8d97a3', roughness: 0.85, flatShading: true });
    const foliageGeometry = treeGeometry();
    const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.16, 1, 6).translate(0, 0.5, 0);
    const rockGeometry = rockShape();

    for (let from = -BEFORE_START; from < this.end + 40; from += CHUNK) {
      const to = Math.min(from + CHUNK, this.end + 40);
      const group = new THREE.Group();
      const ground = new THREE.Mesh(this.groundGeometry(from, to), snow);
      ground.receiveShadow = true;
      group.add(ground);
      for (const s of [-1, 1]) group.add(new THREE.Mesh(this.edgeGeometry(from, to, s), edgeMaterial));

      const inChunk = this.obstacles.filter((o) => o.d >= from && o.d < to);
      const trees = inChunk.filter((o) => o.kind === 'tree');
      const rocks = inChunk.filter((o) => o.kind === 'rock');
      const matrix = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      if (trees.length) {
        const crowns = new THREE.InstancedMesh(foliageGeometry, foliage, trees.length);
        const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
        trees.forEach((t, i) => {
          const y = this.height(t.x, t.d);
          q.setFromAxisAngle(up, t.turn);
          crowns.setMatrixAt(i, matrix.compose(new THREE.Vector3(t.x, y + 0.6 * t.size, -t.d), q, new THREE.Vector3(t.size, t.size, t.size)));
          trunks.setMatrixAt(i, matrix.compose(new THREE.Vector3(t.x, y - 0.2, -t.d), q, new THREE.Vector3(t.size, t.size * 1.2, t.size)));
        });
        for (const mesh of [crowns, trunks]) {
          mesh.castShadow = true;
          mesh.computeBoundingSphere();
          group.add(mesh);
        }
      }
      if (rocks.length) {
        const mesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, rocks.length);
        rocks.forEach((r, i) => {
          q.setFromAxisAngle(up, r.turn);
          const y = this.height(r.x, r.d);
          mesh.setMatrixAt(i, matrix.compose(new THREE.Vector3(r.x, y + r.size * 0.25, -r.d), q, new THREE.Vector3(r.size, r.size * 0.9, r.size)));
        });
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
      this.chunks.push({ from, group });
      root.add(group);
    }

    for (const gate of this.gates) {
      gate.flags = gateFlags(gate.colour, gate.width);
      gate.flags.position.set(gate.x, this.height(gate.x, gate.d), -gate.d);
      gate.flags.rotation.y = -THREE.MathUtils.degToRad(this.direction(gate.d));
      root.add(gate.flags);
    }
    root.add(this.arch(0, 'START', '#2f6fde'), this.arch(this.length, 'FINISH', '#e5484d'));
    return root;
  }

  /** Shows only the pieces near d. */
  showAround(d: number): void {
    const c = TUNING.ski.course;
    for (const chunk of this.chunks) chunk.group.visible = chunk.from + CHUNK > d - c.drawBehind && chunk.from < d + c.drawAhead;
  }

  /**
   * The ground of one piece: rows every metre down the run, columns across it — close together inside the run
   * (for the kickers and rollers), wider apart on the valley walls.
   */
  private groundGeometry(from: number, to: number): THREE.BufferGeometry {
    const c = TUNING.ski.course;
    const columns = 84;
    const rows = Math.round(to - from);
    const positions: number[] = [];
    const colours: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const runColour = new THREE.Color('#ffffff');
    const wallColour = new THREE.Color('#e6eef8');
    const kickerColour = new THREE.Color('#ffb46b');
    const colour = new THREE.Color();
    for (let r = 0; r <= rows; r++) {
      const d = from + r;
      const centre = this.centre(d);
      const half = this.halfWidth(d) + 2;
      for (let k = 0; k <= columns; k++) {
        const t = (k / columns) * 2 - 1;
        const a = Math.abs(t);
        const off = Math.sign(t) * (a < 0.5 ? (a / 0.5) * half : half + ((a - 0.5) / 0.5) * (c.forestDepth + c.wallWidth + 10));
        const x = centre + off;
        positions.push(x, this.height(x, d), -d);
        uvs.push(x / 4, d / 4);
        colour.copy(runColour).lerp(wallColour, smoothstep(0, 4, this.outside(x, d))).lerp(kickerColour, this.kickerShare(x, d));
        colours.push(colour.r, colour.g, colour.b);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < columns; k++) {
        const a = r * (columns + 1) + k;
        const b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  /** A thin blue line along one edge of the run. */
  private edgeGeometry(from: number, to: number, side: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const rows = Math.round(to - from);
    for (let r = 0; r <= rows; r++) {
      const d = from + r;
      const edge = this.centre(d) + side * this.halfWidth(d);
      for (const w of [-0.25, 0.25]) positions.push(edge + w, this.height(edge + w, d) + 0.03, -d);
      if (r < rows) indices.push(r * 2, r * 2 + 1, r * 2 + 2, r * 2 + 1, r * 2 + 3, r * 2 + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  /** The start or finish arch: two posts and a banner across the whole run. */
  private arch(d: number, text: string, colour: string): THREE.Group {
    const group = new THREE.Group();
    const half = this.halfWidth(d) + 1;
    const x = this.centre(d);
    const y = this.baseHeight(d);
    const postMaterial = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6 });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8.5, 0.6), postMaterial);
      post.position.set(x + s * half, y + 4.25, -d);
      post.castShadow = true;
      group.add(post);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    if (text === 'FINISH') {
      for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#1f3247' : '#ffffff';
        ctx.fillRect(i * 32, j * 32, 32, 32);
      }
      ctx.fillStyle = 'rgba(229, 72, 77, 0.92)';
      ctx.fillRect(320, 0, 384, 128);
    } else {
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, 1024, 128);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 70);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 1.6), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    banner.position.set(x, y + 7.8, -d);
    group.add(banner);
    return group;
  }
}

/** White snow with a faint grid, so speed and turning can be seen. */
function gridTexture(renderer: THREE.WebGLRenderer): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#d3deec';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

/** A fir's crown: three stacked cones in one shape (about 4 m tall at size 1, starting 0.6 m above the ground). */
function treeGeometry(): THREE.BufferGeometry {
  const points = [
    [0, 0],
    [1.3, 0.2],
    [0.55, 1.2],
    [1.0, 1.3],
    [0.4, 2.3],
    [0.7, 2.4],
    [0, 3.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(points, 7);
}

/** A lumpy rock: an icosahedron with its corners pushed in and out (always the same lumps). */
function rockShape(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const position = geometry.getAttribute('position');
  const rand = random(3);
  const moved = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
    if (!moved.has(key)) moved.set(key, 0.75 + rand() * 0.45);
    const k = moved.get(key)!;
    position.setXYZ(i, position.getX(i) * k, position.getY(i) * k * 0.8, position.getZ(i) * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A gate: two thin poles with flags, `width` apart (the skier rides between them). */
function gateFlags(colour: string, width: number): THREE.Group {
  const group = new THREE.Group();
  const pole = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.5 });
  const flag = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, side: THREE.DoubleSide, emissive: colour, emissiveIntensity: 0 });
  for (const s of [-1, 1]) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 6), pole);
    stick.position.set((s * width) / 2, 1, 0);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), flag);
    cloth.position.set((s * width) / 2 - s * 0.45, 1.6, 0);
    stick.castShadow = cloth.castShadow = true;
    group.add(stick, cloth);
  }
  group.userData.flag = flag;
  return group;
}
