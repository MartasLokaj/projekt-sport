import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';
import type { LookPreset } from './backdrop.ts';

// The ski run (SKI.md, phase S2a): a winding valley from the start gate down to the finish, generated from a seed
// (the same run every time). Positions on the run: x = metres across (+ = right when looking downhill),
// d = metres down the run (0 = start gate). In the 3D world x stays x, z = -d and y is the height.
// The run has bends, steeper and flatter parts, rollers (bumps across the run), kickers (jumps), gates (pairs of
// flags that give a little speed), tree islands and rocks; outside its edges the ground rises into forested walls.
// Forks (S2b): in places the run splits into two ways ("lanes") with a forested ridge between them: a short, narrow,
// risky way with rocks and a kicker, and a wider, winding, safe way with gates. They join again further down.
// Look (S3): soft snow, firs with snow on their branches, faceted ochre rocks with snow caps, big cliffs on the
// valley walls. Colours come from the look preset (applyLook).

export type Obstacle = { x: number; d: number; radius: number; height: number; kind: 'tree' | 'rock' | 'sign'; size: number; turn: number };
export type Gate = { d: number; x: number; width: number; colour: string; flags: THREE.Group | null };
/** One way down at some d: its middle (x) and half width. In a fork lane 1 is the risky way. */
export type Lane = { c: number; hw: number };
type Kicker = { d: number; x: number };
/** A fork from `from` to `to`; side = which way (−1 left, +1 right) the risky lane goes. */
export type Fork = { from: number; to: number; side: number; signAt: number };
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
  readonly forks: Fork[] = [];
  private readonly rollers: Rollers[] = [];
  private readonly buckets = new Map<number, Obstacle[]>();
  /** Height of the run's middle every metre, from d = -BEFORE_START. */
  private readonly base: Float32Array;
  private readonly chunks: { from: number; group: THREE.Group }[] = [];
  /** Materials whose colours come from the look preset. */
  private readonly materials = {
    snow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    capSnow: new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true, side: THREE.DoubleSide }),
    foliage: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
    trunk: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    rock: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    edge: new THREE.MeshBasicMaterial({ color: '#7fb0ee' }),
  };

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

    const f = c.forks;
    for (const at of f.at) {
      const from = Math.round(at * c.length);
      this.forks.push({ from, to: from + f.length, side: rand() < 0.5 ? -1 : 1, signAt: from });
    }
    const inFork = (d: number, margin: number): boolean => this.forks.some((k) => d > k.from - margin && d < k.to + margin);
    // The sign stands at the nose of the ridge, where the two ways are 3 m apart.
    for (const fork of this.forks) {
      for (let d = fork.from; d < fork.to; d += 0.5) {
        const [a, b] = this.lanes(d);
        if (b && Math.abs(b.c - a.c) - a.hw - b.hw > 3) {
          fork.signAt = d;
          break;
        }
      }
    }

    for (let d = c.kickerFirst; d < c.length - 150; d += c.kickerEvery) {
      const at = d + (rand() - 0.5) * 40;
      if (inFork(at, 30)) continue;
      this.kickers.push({ d: at, x: this.centre(at) + (rand() - 0.5) * 0.6 * this.halfWidth(at) });
    }
    // Each fork's risky way has its own kicker in the middle.
    for (const fork of this.forks) {
      const at = (fork.from + fork.to) / 2 - c.kickerLength / 2;
      this.kickers.push({ d: at, x: this.lanes(at)[1]?.c ?? this.centre(at) });
    }
    for (let d = c.rollerEvery * 0.6; d < c.length - c.rollerSection - 60; d += c.rollerEvery) {
      this.rollers.push({ from: d, to: d + c.rollerSection });
    }
    const nearKicker = (d: number, margin: number): boolean => this.kickers.some((k) => d > k.d - margin && d < k.d + c.kickerLength + margin);

    // Gates: alternating sides of the run; in a fork only on the safe way.
    let side = 1;
    for (let d = c.gateFirst; d < c.length - 80; d += c.gateEvery) {
      let at = d;
      while (nearKicker(at, 18) && !inFork(at, 0)) at += 8;
      side = -side;
      const lane = this.lanes(at)[0];
      this.gates.push({ d: at, x: lane.c + side * c.gateOffset * lane.hw, width: c.gateWidth, colour: side > 0 ? '#e5484d' : '#2f6fde', flags: null });
    }
    const nearGate = (d: number, margin: number): boolean => this.gates.some((g) => Math.abs(g.d - d) < margin);
    const busy = (d: number, margin: number): boolean =>
      nearKicker(d, margin + 4) || nearGate(d, margin) || inFork(d, 10) || d < 60 || Math.abs(d - c.length) < 40;

    // The forest: everywhere off the run (on the walls and on the ridges between forked ways), bigger further out.
    for (let d = -BEFORE_START; d < this.end + 40; d += c.treeSpacing) {
      const { lo, hi } = this.bounds(d);
      for (let x = lo - c.forestDepth; x < hi + c.forestDepth; x += c.treeSpacing) {
        if (rand() > c.forestDensity) continue;
        const at = d + (rand() - 0.5) * c.treeSpacing * 0.8;
        const tx = x + (rand() - 0.5) * c.treeSpacing * 0.6;
        const out = this.outside(tx, at);
        if (out < 1.4 || out > c.forestDepth) continue;
        const size = 0.8 + Math.min(1, out / c.forestDepth) * 0.8 + rand() * 0.4;
        this.addObstacle({ x: tx, d: at, radius: 0.55 * size, height: 4 * size, kind: 'tree', size, turn: rand() * 6.28 });
      }
    }
    // Tree islands in the run: on one side, so the other side stays open (keep the gates' openings clear).
    for (let d = 110; d < c.length - 60; d += c.islandEvery) {
      const at = d + (rand() - 0.5) * c.islandEvery * 0.5;
      if (busy(at, 9)) continue;
      const hw = this.halfWidth(at);
      const x = this.centre(at) + (rand() < 0.5 ? -1 : 1) * (0.3 + rand() * 0.3) * hw;
      const trees = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < trees; i++) {
        const size = 0.8 + rand() * 0.5;
        this.addObstacle({ x: x + (rand() * 2 - 1) * 2.2, d: at + (rand() * 2 - 1) * 3, radius: 0.55 * size, height: 4 * size, kind: 'tree', size, turn: rand() * 6.28 });
      }
    }
    // Lone rocks.
    for (let d = 70; d < c.length - 40; d += c.rockEvery) {
      const at = d + (rand() - 0.5) * c.rockEvery * 0.6;
      if (busy(at, 7)) continue;
      const size = 0.6 + rand() * 0.6;
      const x = this.centre(at) + (rand() * 2 - 1) * 0.85 * this.halfWidth(at);
      this.addObstacle({ x, d: at, radius: size, height: size * 0.9, kind: 'rock', size, turn: rand() * 6.28 });
    }
    // The risky way of each fork: rocks to weave between (not on its kicker).
    for (const fork of this.forks) {
      for (let d = fork.signAt + 15; d < fork.to - 25; d += f.riskyRockEvery) {
        const at = d + (rand() - 0.5) * 4;
        if (nearKicker(at, 4)) continue;
        const lane = this.lanes(at)[1];
        if (!lane) continue;
        const size = 0.5 + rand() * 0.4;
        this.addObstacle({ x: lane.c + (rand() * 2 - 1) * 0.6 * lane.hw, d: at, radius: size, height: size * 0.9, kind: 'rock', size, turn: rand() * 6.28 });
      }
      // The sign at the ridge's nose (it can be hit like a tree).
      this.addObstacle({ x: (this.lanes(fork.signAt)[0].c + this.lanes(fork.signAt)[1].c) / 2, d: fork.signAt, radius: 0.5, height: 3, kind: 'sign', size: 1, turn: 0 });
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

  /**
   * Which way the run goes at d, in degrees from straight downhill (+ = to the right). In a fork, the way
   * that x is on (or nearest to); without x, the main line.
   */
  direction(d: number, x?: number): number {
    const lane = x === undefined ? 0 : this.laneIndex(x, d);
    const ahead = this.lanes(d + 1);
    const behind = this.lanes(d - 1);
    const a = ahead[Math.min(lane, ahead.length - 1)].c;
    const b = behind[Math.min(lane, behind.length - 1)].c;
    return THREE.MathUtils.radToDeg(Math.atan((a - b) / 2));
  }

  /** The fork at d, and how far it has split (0 = one way, 1 = fully two ways). */
  forkAt(d: number): { fork: Fork; share: number } | null {
    const f = TUNING.ski.course.forks;
    for (const fork of this.forks) {
      if (d <= fork.from || d >= fork.to) continue;
      return { fork, share: smoothstep(fork.from, fork.from + f.ramp, d) * (1 - smoothstep(fork.to - f.ramp, fork.to, d)) };
    }
    return null;
  }

  /** The ways down at d: one, or two in a fork ([safe, risky]). */
  lanes(d: number): Lane[] {
    const c = TUNING.ski.course.forks;
    const centre = this.centre(d);
    const hw = this.halfWidth(d);
    const at = this.forkAt(d);
    if (!at || at.share <= 0) return [{ c: centre, hw }];
    const { fork, share } = at;
    const u = (d - fork.from) / (fork.to - fork.from);
    const apart = c.separation * share;
    return [
      { c: centre - fork.side * apart + c.safeWiggle * share * Math.sin(2 * Math.PI * u), hw: hw + (c.safeHalfWidth - hw) * share },
      { c: centre + fork.side * apart, hw: hw + (c.riskyHalfWidth - hw) * share },
    ];
  }

  /** Which way (lane index) x is on at d, or the nearest one. */
  laneIndex(x: number, d: number): number {
    const lanes = this.lanes(d);
    let best = 0;
    let bestOut = Infinity;
    lanes.forEach((lane, i) => {
      const out = Math.abs(x - lane.c) - lane.hw;
      if (out < bestOut) {
        bestOut = out;
        best = i;
      }
    });
    return best;
  }

  /** The leftmost and rightmost edge of the run at d (both ways of a fork together). */
  bounds(d: number): { lo: number; hi: number } {
    let lo = Infinity;
    let hi = -Infinity;
    for (const lane of this.lanes(d)) {
      lo = Math.min(lo, lane.c - lane.hw);
      hi = Math.max(hi, lane.c + lane.hw);
    }
    return { lo, hi };
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

  /** How far past the run's edge x is at d (0 inside the run; in a fork, from the nearest way). */
  outside(x: number, d: number): number {
    let out = Infinity;
    for (const lane of this.lanes(d)) out = Math.min(out, Math.abs(x - lane.c) - lane.hw);
    return Math.max(0, out);
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
    const m = this.materials;
    m.snow.map = snowTexture(renderer);
    m.edge.visible = TUNING.ski.look.edgeLines;
    const tree = treeGeometry();
    const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.16, 1, 6).translate(0, 0.5, 0);
    const rock = rockShape();
    const rand = random(TUNING.ski.course.seed + 100);
    const look = TUNING.ski.look;
    const c = TUNING.ski.course;
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    /** One instanced mesh per material for the same set of placements. */
    const place = (group: THREE.Group, parts: [THREE.BufferGeometry, THREE.Material][], matrices: THREE.Matrix4[]): void => {
      if (!matrices.length) return;
      for (const [geometry, material] of parts) {
        const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
        matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat));
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    };

    for (let from = -BEFORE_START; from < this.end + 40; from += CHUNK) {
      const to = Math.min(from + CHUNK, this.end + 40);
      const group = new THREE.Group();
      const ground = new THREE.Mesh(this.groundGeometry(from, to), m.snow);
      ground.receiveShadow = true;
      group.add(ground);
      for (const lane of [0, 1]) for (const s of [-1, 1]) group.add(new THREE.Mesh(this.edgeGeometry(from, to, lane, s), m.edge));

      const inChunk = this.obstacles.filter((o) => o.d >= from && o.d < to);
      const crowns: THREE.Matrix4[] = [];
      const trunks: THREE.Matrix4[] = [];
      const rocks: THREE.Matrix4[] = [];
      for (const o of inChunk) {
        const y = this.height(o.x, o.d);
        q.setFromAxisAngle(up, o.turn);
        if (o.kind === 'tree') {
          crowns.push(new THREE.Matrix4().compose(new THREE.Vector3(o.x, y + 0.6 * o.size, -o.d), q, new THREE.Vector3(o.size, o.size, o.size)));
          trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(o.x, y - 0.2, -o.d), q, new THREE.Vector3(o.size, o.size * 1.2, o.size)));
        } else if (o.kind === 'rock') {
          rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(o.x, y + o.size * 0.25, -o.d), q, new THREE.Vector3(o.size, o.size * 0.9, o.size)));
        }
      }
      // Cliffs: big rocks on the valley walls, beyond where a skier can get (only to look at).
      for (let d = from; d < to; d += look.cliffEvery) {
        for (const side of [-1, 1]) {
          if (rand() < 0.45) continue;
          const at = d + rand() * look.cliffEvery;
          const { lo, hi } = this.bounds(at);
          const out = c.edgeLimit + 5 + rand() * 16;
          const x = side < 0 ? lo - out : hi + out;
          const size = 3 + rand() * 5;
          q.setFromAxisAngle(up, rand() * 6.28);
          rocks.push(matrix.clone().compose(new THREE.Vector3(x, this.height(x, at) + size * 0.2, -at), q, new THREE.Vector3(size, size * (0.8 + rand() * 0.9), size)));
        }
      }
      place(group, [[tree.green, m.foliage], [tree.snow, m.capSnow]], crowns);
      place(group, [[trunkGeometry, m.trunk]], trunks);
      place(group, [[rock.rock, m.rock], [rock.snow, m.capSnow]], rocks);
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
    for (const fork of this.forks) root.add(this.forkSign(fork));
    return root;
  }

  /** Colours from the look preset. */
  applyLook(look: LookPreset): void {
    const m = this.materials;
    m.snow.color.set(look.snow);
    m.capSnow.color.set(look.snow);
    m.foliage.color.set(look.foliage);
    m.trunk.color.set(look.trunk);
    m.rock.color.set(look.rock);
  }

  /** Shows only the pieces near any of these places down the run (one per view in split screen). */
  showAround(ds: number[]): void {
    const c = TUNING.ski.course;
    for (const chunk of this.chunks) chunk.group.visible = ds.some((d) => chunk.from + CHUNK > d - c.drawBehind && chunk.from < d + c.drawAhead);
  }

  /**
   * The ground of one piece: rows every metre down the run, columns across it — close together inside the run
   * (for the kickers and rollers), wider apart on the valley walls.
   */
  private groundGeometry(from: number, to: number): THREE.BufferGeometry {
    const c = TUNING.ski.course;
    const columns = 100;
    const rows = Math.round(to - from);
    const positions: number[] = [];
    const colours: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const runColour = new THREE.Color('#ffffff');
    const wallColour = new THREE.Color('#eef3fa');
    const kickerColour = new THREE.Color('#ffc48a');
    const colour = new THREE.Color();
    for (let r = 0; r <= rows; r++) {
      const d = from + r;
      const { lo, hi } = this.bounds(d);
      const centre = (lo + hi) / 2;
      const half = (hi - lo) / 2 + 2;
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

  /** A thin blue line along one edge of one way of the run (lane 1 only exists in forks; hidden inside the other way). */
  private edgeGeometry(from: number, to: number, lane: number, side: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const rows = Math.round(to - from);
    let previous = -1;
    for (let r = 0; r <= rows; r++) {
      const d = from + r;
      const lanes = this.lanes(d);
      const way = lanes[lane];
      const edge = way ? way.c + side * way.hw : 0;
      const shown = !!way && lanes.every((other, i) => i === lane || Math.abs(edge - other.c) > other.hw);
      if (!shown) {
        previous = -1;
        continue;
      }
      const index = positions.length / 3;
      for (const w of [-0.25, 0.25]) positions.push(edge + w, this.height(edge + w, d) + 0.03, -d);
      if (previous >= 0) indices.push(previous, previous + 1, index, previous + 1, index + 1, index);
      previous = index;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  /** A signpost at a fork's ridge: an arrow to the fast, risky way and one to the safe way. */
  private forkSign(fork: Fork): THREE.Group {
    const group = new THREE.Group();
    const d = fork.signAt;
    const [safe, risky] = this.lanes(d);
    const x = (safe.c + risky.c) / 2;
    group.position.set(x, this.height(x, d), -d);
    group.rotation.y = -THREE.MathUtils.degToRad(this.direction(d));
    group.scale.setScalar(1.8); // big enough to read at speed
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), new THREE.MeshStandardMaterial({ color: '#6b4a32' }));
    post.position.y = 1.5;
    post.castShadow = true;
    group.add(post);
    const board = (text: string, colour: string, toRight: boolean, y: number): void => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = colour;
      ctx.beginPath();
      if (toRight) ctx.moveTo(0, 0), ctx.lineTo(448, 0), ctx.lineTo(512, 64), ctx.lineTo(448, 128), ctx.lineTo(0, 128);
      else ctx.moveTo(512, 0), ctx.lineTo(64, 0), ctx.lineTo(0, 64), ctx.lineTo(64, 128), ctx.lineTo(512, 128);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 64px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, toRight ? 230 : 282, 68);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
      mesh.position.set(toRight ? 0.9 : -0.9, y, 0.12); // (facing uphill, towards the skiers coming down)
      group.add(mesh);
    };
    const riskyRight = fork.side > 0;
    board('FAST', '#e5484d', riskyRight, 2.6);
    board('SAFE', '#2f6fde', !riskyRight, 1.95);
    return group;
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

/** Snow: white with faint soft bluish specks and streaks (repeats every 16 m), so speed and turning can be seen. */
function snowTexture(renderer: THREE.WebGLRenderer): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const rand = random(5);
  for (let i = 0; i < 260; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 3 + rand() * 14;
    // Drawn at the wrapped positions too, so the texture tiles without seams.
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, `rgba(150, 180, 220, ${0.05 + rand() * 0.09})`);
      g.addColorStop(1, 'rgba(150, 180, 220, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.25, 0.25);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

/** A geometry of loose triangles (flat shaded). */
function triangles(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A fir's crown: three stacked tiers (about 4 m tall at size 1, starting 0.6 m above the ground), in two shapes:
 * the green needles, and the snow lying on the upper part of most branches.
 */
function treeGeometry(): { green: THREE.BufferGeometry; snow: THREE.BufferGeometry } {
  // Each tier: underside, outer rim of the branches (always green), upper part (snow on most sides).
  const profile: [number, number, number, number, 'green' | 'top' | 'tip'][] = [
    [0, 0, 1.3, 0.2, 'green'],
    [1.3, 0.2, 1.0, 0.6, 'green'],
    [1.0, 0.6, 0.55, 1.2, 'top'],
    [0.55, 1.2, 1.0, 1.3, 'green'],
    [1.0, 1.3, 0.78, 1.67, 'green'],
    [0.78, 1.67, 0.4, 2.3, 'top'],
    [0.4, 2.3, 0.7, 2.4, 'green'],
    [0.7, 2.4, 0.45, 2.8, 'green'],
    [0.45, 2.8, 0, 3.5, 'tip'],
  ];
  const sides = 7;
  const rand = random(9);
  const green: number[] = [];
  const snow: number[] = [];
  for (const [r0, y0, r1, y1, kind] of profile) {
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const into = kind === 'tip' || (kind === 'top' && rand() < 0.7) ? snow : green;
      const A = [r0 * Math.cos(a0), y0, r0 * Math.sin(a0)];
      const B = [r0 * Math.cos(a1), y0, r0 * Math.sin(a1)];
      const C = [r1 * Math.cos(a0), y1, r1 * Math.sin(a0)];
      const D = [r1 * Math.cos(a1), y1, r1 * Math.sin(a1)];
      into.push(...A, ...C, ...B, ...B, ...C, ...D);
    }
  }
  return { green: triangles(green), snow: triangles(snow) };
}

/**
 * A lumpy rock: an icosahedron with its corners pushed in and out (always the same lumps), in two shapes:
 * the rock's sides, and the snow on the faces that look up.
 */
function rockShape(): { rock: THREE.BufferGeometry; snow: THREE.BufferGeometry } {
  const source = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const position = source.getAttribute('position');
  const rand = random(3);
  const moved = new Map<string, number>();
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
    if (!moved.has(key)) moved.set(key, 0.72 + rand() * 0.5);
    const k = moved.get(key)!;
    points.push(new THREE.Vector3(position.getX(i) * k, position.getY(i) * k * 0.8, position.getZ(i) * k));
  }
  source.dispose();
  const rock: number[] = [];
  const snow: number[] = [];
  const normal = new THREE.Vector3();
  const edge = new THREE.Vector3();
  for (let i = 0; i < points.length; i += 3) {
    normal.subVectors(points[i + 1], points[i]).cross(edge.subVectors(points[i + 2], points[i])).normalize();
    const into = normal.y > 0.6 ? snow : rock;
    for (let k = 0; k < 3; k++) into.push(points[i + k].x, points[i + k].y, points[i + k].z);
  }
  return { rock: triangles(rock), snow: triangles(snow) };
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
