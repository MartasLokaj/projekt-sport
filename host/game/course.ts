import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TUNING } from '../../shared/tuning.ts';

// Holes with smooth, rounded lanes, like a real outdoor minigolf course.
// Each lane follows a curve through a few points; the lane is everything within its width of that
// curve, so the ends come out round and there are no corners anywhere. A wooden border runs all the
// way around the edge. The playing surface is freshly mowed turf in a two-green checker pattern that
// bends along the lane (drawn in a shader; the fine grass bumps come from a CC0 ambientCG texture).
// The windmill and the flag are Kenney Minigolf Kit models (CC0, host/assets/minigolf).
//
// Physics uses exactly the same shapes: the lane surface and the bumpers become two collision
// meshes. Under the cup there is a pit the ball really drops into.

/** Kenney kit measurements (kit units), for the windmill and the flag. */
const KIT_FLOOR = 0.063;
/** Each windmill blade lies along a diagonal (an X): from the hub to this far out, this wide each side, this thick each side. */
const KIT_BLADE_LENGTH = 0.773;
const KIT_BLADE_HALF_WIDTH = 0.104;
const KIT_BLADE_HALF_THICKNESS = 0.042;

/**
 * A point the lane passes through (local coordinates, z = forward from the tee), its floor height and half-width.
 * The flags say what the stretch of lane from the previous point up to this one is like:
 * - ramp: the height changes in a straight line (so a ramp still rises at its top edge and the ball takes off),
 *   instead of easing in and out softly;
 * - gap: there is no floor at all (a jump over water; a ball that falls in is out of bounds);
 * - tube: the lane runs through a pipe.
 */
export type PathPoint = { x: number; z: number; y?: number; w?: number; ramp?: boolean; gap?: boolean; tube?: boolean };

/** A stretch of the lane, in units along it from the tee end. */
export type Stretch = { from: number; to: number };

export type HoleDef = {
  number: number;
  par: number;
  /** Where the hole sits in the world (its own island in the sea) and which way it faces (degrees, 0 = +z). */
  place: { x: number; z: number; yaw: number };
  /** The lane goes from the tee (first point) to the cup (last point). */
  path: PathPoint[];
  /** A windmill over the lane, this far from the tee (in units along the lane). */
  windmill?: number;
};

export const HOLES: HoleDef[] = [
  {
    // Hole 1: a gentle bend to the right, opening out around the cup.
    number: 1,
    par: 3,
    place: { x: 0, z: 0, yaw: 0 },
    path: [
      { x: 0, z: 0, w: 1.05 },
      { x: 0.1, z: 3.5, w: 1.15 },
      { x: 0.4, z: 6.5, w: 1.35 },
      { x: -1.2, z: 9.2, w: 1.2 },
      { x: -4.2, z: 10.2, w: 1.05 },
      { x: -7, z: 9.6, w: 1.45 },
    ],
  },
  {
    // Hole 2: up a grassy hill, along a narrow ridge and down to the cup.
    number: 2,
    par: 3,
    place: { x: -34, z: 30, yaw: 90 },
    path: [
      { x: 0, z: 0, w: 1.05 },
      { x: 0, z: 2.8, y: 0, w: 1.15 },
      { x: 0.2, z: 5, y: 0.4, w: 1.0 },
      { x: -0.2, z: 7.8, y: 0.4, w: 0.85 },
      { x: 0, z: 10, y: 0, w: 1.1 },
      { x: 0.8, z: 12.8, w: 1.45 },
    ],
  },
  {
    // Hole 3: through the windmill while its blades sweep the lane.
    number: 3,
    par: 3,
    place: { x: 26, z: 52, yaw: 180 },
    windmill: 6.3,
    path: [
      { x: 0, z: 0, w: 1.05 },
      { x: 0, z: 3.5, w: 1.2 },
      { x: 0, z: 6.3, w: 1.2 },
      { x: 0.2, z: 9, w: 1.2 },
      { x: 1.6, z: 11.6, w: 1.45 },
    ],
  },
  {
    // Hole 4: the tee is on top of a grassy hill; the ball dives down a winding blue pipe and shoots out onto the green.
    number: 4,
    par: 3,
    place: { x: 40, z: 4, yaw: 0 },
    path: [
      { x: 0, z: 0, y: 1.8, w: 1.05 },
      { x: 0, z: 2.2, y: 1.8, w: 1.0 },
      { x: 0.1, z: 3.4, y: 1.8, w: 0.85 },
      { x: 0.7, z: 5.6, y: 1.2, w: 0.8, tube: true, ramp: true },
      { x: 0.6, z: 8, y: 0.6, w: 0.8, tube: true, ramp: true },
      { x: -0.2, z: 10.4, y: 0, w: 0.85, tube: true, ramp: true },
      { x: -0.6, z: 12.8, w: 1.3 },
      { x: 0.2, z: 15, w: 1.35 },
      { x: 1.9, z: 16.2, w: 1.45 },
    ],
  },
  {
    // Hole 5: a ski jump. Up the ramp and fly over the pond; too soft and the ball splashes into the water.
    number: 5,
    par: 3,
    place: { x: -30, z: -22, yaw: 0 },
    path: [
      { x: 0, z: 0, w: 1.05 },
      { x: 0, z: 2.6, w: 1.0 },
      { x: 0, z: 3.4, w: 0.95 },
      { x: 0, z: 4.9, y: 0.36, w: 0.95, ramp: true },
      { x: 0, z: 6.0, w: 1.25, gap: true },
      { x: 0.2, z: 8.2, w: 1.35 },
      { x: -1.2, z: 10.6, w: 1.2 },
      { x: -3.4, z: 11.6, w: 1.45 },
    ],
  },
];

export type Kit = Map<string, GLTF>;

/** Where a point is relative to the lane. */
export type LaneSpot = { distance: number; width: number; height: number; along: number };

export type BuiltHole = {
  def: HoleDef;
  group: THREE.Group;
  /** Tee on the floor (world coordinates) and the direction down the lane (radians). */
  tee: THREE.Vector3;
  teeYaw: number;
  /** Centre of the cup at floor level, and its radius. */
  cup: THREE.Vector3;
  cupRadius: number;
  /** Moves the obstacles (windmill blades). Call every physics step, before stepping the world. */
  update: (dt: number) => void;
  /** The floor's collider, for finding the ground height (e.g. to lay the aim line on a slope). */
  floorCollider: RAPIER.Collider;
  /** Big pieces that may hide the ball from the camera; the game fades them out when they do. */
  occluders: THREE.Object3D[];
  /** The lane's outline including the bumpers, so the island can be shaped around it. */
  lane: {
    bounds: THREE.Box3;
    nearest: (x: number, z: number) => LaneSpot;
    outerEdge: number;
    /** Stretches with no floor (jumps over water), so the island can have a pond there. */
    gaps: Stretch[];
    /** Height of the lane's lowest point (the island's flat top lies just below it). */
    lowest: number;
    /** True when (x, z) is over one of the gaps. */
    overGap: (x: number, z: number) => boolean;
  };
};

export async function loadKit(): Promise<Kit> {
  const loader = new GLTFLoader();
  const names = ['windmill', 'flag-red'];
  const loaded = await Promise.all(names.map(async (name) => [name, await loader.loadAsync(`/host/assets/minigolf/${name}.glb`)] as const));
  return new Map(loaded);
}

/** True when the ball has dropped into the cup. */
export function isInCup(p: { x: number; y: number; z: number }, hole: BuiltHole): boolean {
  return (
    p.y < hole.cup.y - TUNING.ball.radius * 1.5 &&
    Math.hypot(p.x - hole.cup.x, p.z - hole.cup.z) < hole.cupRadius + TUNING.ball.radius
  );
}

/** Builds a hole at its place: its meshes (returned in a group) and its colliders in the physics world. */
export function buildHole(def: HoleDef, kit: Kit, world: RAPIER.World, R: typeof RAPIER): BuiltHole {
  const cfg = TUNING.course;
  const group = new THREE.Group();
  const lane = new Lane(def);
  const cup = lane.points[lane.points.length - 1].clone();
  const cupRadius = cfg.cupRadius;

  // Lane surface: bright turf. One connected mesh, used for drawing and for physics.
  const floor = buildFloor(lane, cup, cupRadius);
  const turf = new THREE.Mesh(floor, turfMaterial());
  turf.receiveShadow = true;
  group.add(turf);
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
  const floorCollider = world.createCollider(
    R.ColliderDesc.trimesh(
      floor.getAttribute('position').array as Float32Array,
      floor.getIndex()!.array as Uint32Array,
      R.TriMeshFlags.FIX_INTERNAL_EDGES,
    )
      .setFriction(cfg.floorFriction)
      .setRestitution(0),
    fixed,
  );

  // A wooden border all around the edge.
  const bumper = buildBumper(lane);
  const bumperMesh = new THREE.Mesh(bumper, bumperMaterial());
  bumperMesh.castShadow = true;
  bumperMesh.receiveShadow = true;
  group.add(bumperMesh);
  const walls = new TriangleSoup();
  addMeshTriangles(bumper, walls);
  // Under both edges of every gap a wooden board goes down into the water (a ball that falls short hits it).
  for (const gap of lane.gaps) addGapBoards(group, lane, gap, world, R, fixed);

  addCupPit(group, cup, cupRadius, world, R);
  const flag = kit.get('flag-red')!.scene.clone(true);
  flag.scale.setScalar(cfg.tileSize);
  flag.position.copy(cup);
  flag.traverse((o) => (o.castShadow = true));
  group.add(flag);

  const updates: ((dt: number) => void)[] = [];
  const occluders: THREE.Object3D[] = [];
  if (def.windmill !== undefined) {
    const spot = lane.at(def.windmill);
    const model = kit.get('windmill')!.scene.clone(true);
    model.scale.setScalar(cfg.tileSize);
    model.rotation.y = Math.atan2(spot.tangent.x, spot.tangent.z);
    model.position.set(spot.point.x, spot.point.y - KIT_FLOOR * cfg.tileSize - 0.01, spot.point.z);
    // Its own copies of the materials, so it can be faded out without fading anything else.
    model.traverse((o) => {
      o.castShadow = true;
      if (o instanceof THREE.Mesh) o.material = (o.material as THREE.Material).clone();
    });
    group.add(model);
    model.updateMatrixWorld(true);
    const blades = model.getObjectByName('blades')!;
    // The windmill's building is solid; its own floor tile is replaced by our lane.
    addModelTriangles(model, blades, walls, (local, normal) => normal.y > 0.5 && local.every((v) => v.y < KIT_FLOOR + 0.01));
    updates.push(addWindmillBlades(model, blades, world, R));
    occluders.push(model);
  }

  // Pipes over the lane: they hold the ball in, and fade out like the windmill when they hide it.
  for (const stretch of lane.tubes) {
    const tube = buildTube(lane, stretch);
    group.add(tube.mesh);
    occluders.push(tube.mesh);
    const inside = tube.inside.build();
    world.createCollider(
      R.ColliderDesc.trimesh(inside.vertices, inside.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(cfg.wallFriction).setRestitution(0.3),
      fixed,
    );
  }

  const wallMesh = walls.build();
  world.createCollider(
    R.ColliderDesc.trimesh(wallMesh.vertices, wallMesh.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(cfg.wallFriction)
      .setRestitution(cfg.wallBounce),
    fixed,
  );

  const teeSpot = lane.at(cfg.teeDistance);
  const outerEdge = cfg.bumperWidth + 0.1;
  return {
    def,
    group,
    tee: teeSpot.point.clone(),
    teeYaw: Math.atan2(teeSpot.tangent.x, teeSpot.tangent.z),
    cup,
    cupRadius,
    update: (dt) => updates.forEach((u) => u(dt)),
    floorCollider,
    occluders,
    lane: {
      bounds: lane.bounds(outerEdge),
      nearest: (x, z) => {
        const n = lane.nearest(x, z);
        return { distance: n.distance, width: n.width, height: n.height, along: n.along };
      },
      outerEdge,
      gaps: lane.gaps,
      lowest: Math.min(...lane.points.map((q) => q.y)),
      overGap: (x, z) => {
        const n = lane.nearest(x, z);
        return n.distance < n.width + outerEdge && lane.gapAt(n.along) !== null;
      },
    },
  };
}

/** The lane's centre curve, sampled evenly, with the half-width and direction at every sample (world coordinates). */
class Lane {
  readonly points: THREE.Vector3[] = [];
  readonly widths: number[] = [];
  readonly tangents: THREE.Vector3[] = [];
  readonly spacing: number;
  /** Stretches with no floor, and stretches inside a pipe (units along the lane). */
  readonly gaps: Stretch[];
  readonly tubes: Stretch[];

  constructor(def: HoleDef) {
    const yaw = THREE.MathUtils.degToRad(def.place.yaw);
    const origin = new THREE.Vector3(def.place.x, 0, def.place.z);
    const toWorld = (p: PathPoint): THREE.Vector3 => new THREE.Vector3(p.x, 0, p.z).applyAxisAngle(UP, yaw).add(origin);
    const curve = new THREE.CatmullRomCurve3(def.path.map(toWorld), false, 'centripetal');
    const widen = TUNING.course.laneWidthScale;
    const widthCurve = new THREE.CatmullRomCurve3(def.path.map((p) => new THREE.Vector3((p.w ?? 1.1) * widen, 0, 0)));
    // Heights ease smoothly from point to point without overshooting (a curve would dip below the ground).
    // On a ramp they change in a straight line instead.
    /** Which stretch of the path (from point k to point k + 1) the curve is in at t. */
    const stretchAt = (t: number): number => Math.min(def.path.length - 2, Math.floor(t * (def.path.length - 1)));
    const heightAt = (t: number): number => {
      const k = stretchAt(t);
      const f = t * (def.path.length - 1) - k;
      const ease = def.path[k + 1].ramp ? THREE.MathUtils.clamp(f, 0, 1) : THREE.MathUtils.smoothstep(f, 0, 1);
      return THREE.MathUtils.lerp(def.path[k].y ?? 0, def.path[k + 1].y ?? 0, ease);
    };
    const count = Math.ceil(curve.getLength() / TUNING.course.laneSpacing);
    this.spacing = curve.getLength() / count;
    const stretches: number[] = [];
    for (let i = 0; i <= count; i++) {
      const t = curve.getUtoTmapping(i / count, 0);
      this.points.push(curve.getPoint(t).setY(heightAt(t)));
      this.widths.push(widthCurve.getPoint(t).x);
      this.tangents.push(curve.getTangent(t).setY(0).normalize());
      stretches.push(stretchAt(t));
    }
    /** The parts of the lane where the path's flag is set, as stretches along the lane. */
    const flagged = (flag: 'gap' | 'tube'): Stretch[] => {
      const result: Stretch[] = [];
      let start = -1;
      for (let i = 0; i <= count + 1; i++) {
        const on = i <= count && def.path[stretches[i] + 1][flag] === true;
        if (on && start < 0) start = i;
        if (!on && start >= 0) {
          result.push({ from: Math.max(0, start - 1) * this.spacing, to: (i - 1) * this.spacing });
          start = -1;
        }
      }
      return result;
    };
    this.gaps = flagged('gap');
    this.tubes = flagged('tube');
  }

  /** The gap at `along` units along the lane, or null. */
  gapAt(along: number): Stretch | null {
    return this.gaps.find((g) => along > g.from && along < g.to) ?? null;
  }

  /** Index of the sample closest to `distance` units along the lane. */
  index(distance: number): number {
    return Math.min(this.points.length - 1, Math.max(0, Math.round(distance / this.spacing)));
  }

  /** The direction to the left of the way the lane runs, at sample i. */
  left(i: number): THREE.Vector3 {
    return new THREE.Vector3(this.tangents[i].z, 0, -this.tangents[i].x);
  }

  /** The sample `distance` units along the lane from the start. */
  at(distance: number): { point: THREE.Vector3; tangent: THREE.Vector3; width: number } {
    const i = this.index(distance);
    return { point: this.points[i], tangent: this.tangents[i], width: this.widths[i] };
  }

  /** The closest point of the centre curve to (x, z): how far it is, and the lane's width and floor height there. */
  nearest(x: number, z: number): { distance: number; width: number; height: number; point: THREE.Vector3; along: number; side: number } {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const d = (this.points[i].x - x) ** 2 + (this.points[i].z - z) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    // Refine on the neighbouring segments, so the edge comes out smooth.
    let point = this.points[best];
    let width = this.widths[best];
    let along = best * this.spacing;
    let tangent = this.tangents[best];
    for (const j of [best - 1, best + 1]) {
      if (j < 0 || j >= this.points.length) continue;
      const i0 = Math.min(best, j);
      const a = this.points[i0];
      const b = this.points[i0 + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1)));
      const px = a.x + abx * t;
      const pz = a.z + abz * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        point = new THREE.Vector3(px, a.y + (b.y - a.y) * t, pz);
        width = this.widths[i0] + (this.widths[i0 + 1] - this.widths[i0]) * t;
        along = (i0 + t) * this.spacing;
        tangent = this.tangents[i0];
      }
    }
    // Past the round ends, keep counting along the lane (so the checker pattern carries on there too).
    if (best === 0 || best === this.points.length - 1) along += (x - point.x) * tangent.x + (z - point.z) * tangent.z;
    // Sideways from the centre line: positive to the left of the way the lane runs.
    const side = (x - point.x) * tangent.z - (z - point.z) * tangent.x;
    return { distance: Math.sqrt(bestDistance), width, height: point.y, point, along, side };
  }

  bounds(margin: number): THREE.Box3 {
    const box = new THREE.Box3().setFromPoints(this.points);
    return box.expandByScalar(Math.max(...this.widths) + margin);
  }
}

/**
 * The lane surface as a fine grid: every grid point within the lane's width of the centre curve,
 * at the floor height there. Grid points just outside are pulled onto the edge (and points inside
 * the cup onto the cup's rim), so the edge and the cup come out round instead of jagged.
 */
function buildFloor(lane: Lane, cup: THREE.Vector3, cupRadius: number): THREE.BufferGeometry {
  const cell = TUNING.course.floorCell;
  const overlap = 0.05; // the turf reaches a little under the bumpers
  const box = lane.bounds(0.3);
  const nx = Math.ceil((box.max.x - box.min.x) / cell);
  const nz = Math.ceil((box.max.z - box.min.z) / cell);
  type GridPoint = { inLane: boolean; inCup: boolean; position: THREE.Vector3; along: number; across: number };
  const grid: GridPoint[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = box.min.x + i * cell;
      const z = box.min.z + j * cell;
      const n = lane.nearest(x, z);
      const edge = n.width + overlap;
      const gap = lane.gapAt(n.along);
      let inLane = n.distance <= edge;
      const position = new THREE.Vector3(x, n.height, z);
      if (gap) {
        // Over a gap: pulled back onto the nearer edge of the gap, so the turf ends in a straight line there.
        inLane = false;
        const k = lane.index(n.along - gap.from < gap.to - n.along ? gap.from : gap.to);
        const reach = lane.widths[k] + overlap;
        position.copy(lane.points[k]).addScaledVector(lane.left(k), THREE.MathUtils.clamp(n.side, -reach, reach));
      } else if (!inLane) {
        const out = new THREE.Vector3(x - n.point.x, 0, z - n.point.z).normalize();
        position.set(n.point.x + out.x * edge, n.height, n.point.z + out.z * edge);
      }
      const toCup = Math.hypot(x - cup.x, z - cup.z);
      const inCup = toCup < cupRadius;
      if (inCup) {
        const dx = (x - cup.x) / (toCup || 1);
        const dz = (z - cup.z) / (toCup || 1);
        position.set(cup.x + dx * cupRadius, cup.y, cup.z + dz * cupRadius);
      }
      // Where the point is on the lane (distance along it, and -1..1 from one edge to the other), for the checker pattern.
      const moved = !inLane || inCup;
      const m = moved ? lane.nearest(position.x, position.z) : n;
      grid.push({ inLane, inCup, position, along: m.along, across: m.side / m.width });
    }
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const laneCoords: number[] = [];
  const indices: number[] = [];
  const used = new Map<number, number>();
  const size = TUNING.course.turfTextureSize;
  const vertex = (index: number): number => {
    let v = used.get(index);
    if (v === undefined) {
      const p = grid[index].position;
      v = positions.length / 3;
      positions.push(p.x, p.y, p.z);
      uvs.push(p.x / size, p.z / size);
      laneCoords.push(grid[index].along, grid[index].across);
      used.set(index, v);
    }
    return v;
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      const corners = [a, b, c, d].map((k) => grid[k]);
      if (!corners.some((g) => g.inLane) || corners.every((g) => g.inCup)) continue;
      indices.push(vertex(a), vertex(c), vertex(b), vertex(b), vertex(c), vertex(d)); // faces up
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('laneCoord', new THREE.Float32BufferAttribute(laneCoords, 2));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The wooden border: a thick plank standing all the way around the lane's edge (left side, round end
 * around the cup, right side, round end behind the tee). Its top edges are bevelled so they catch the
 * light, the top is lighter than the sides, and the outer side reaches down into the island ground.
 * Where the lane has a gap the border stops on both sides of it, with the plank's end closed off.
 */
function buildBumper(lane: Lane): THREE.BufferGeometry {
  const cfg = TUNING.course;
  const n = lane.points.length - 1;
  type EdgeSpot = { point: THREE.Vector3; out: THREE.Vector3 };
  const capSteps = 24;
  const leftSide = (from: number, to: number): EdgeSpot[] => {
    const spots: EdgeSpot[] = [];
    for (let i = from; i <= to; i++) spots.push({ point: lane.points[i].clone().addScaledVector(lane.left(i), lane.widths[i]), out: lane.left(i) });
    return spots;
  };
  const rightSide = (from: number, to: number): EdgeSpot[] => {
    const spots: EdgeSpot[] = [];
    for (let i = from; i >= to; i--) spots.push({ point: lane.points[i].clone().addScaledVector(lane.left(i), -lane.widths[i]), out: lane.left(i).negate() });
    return spots;
  };
  const cupEnd = (): EdgeSpot[] => {
    const spots: EdgeSpot[] = [];
    for (let k = 1; k < capSteps; k++) {
      const a = (k / capSteps) * Math.PI;
      const out = lane.left(n).multiplyScalar(Math.cos(a)).addScaledVector(lane.tangents[n], Math.sin(a));
      spots.push({ point: lane.points[n].clone().addScaledVector(out, lane.widths[n]), out });
    }
    return spots;
  };
  const teeEnd = (): EdgeSpot[] => {
    const spots: EdgeSpot[] = [];
    for (let k = 1; k < capSteps; k++) {
      const a = (k / capSteps) * Math.PI;
      const out = lane.left(0).multiplyScalar(-Math.cos(a)).addScaledVector(lane.tangents[0], -Math.sin(a));
      spots.push({ point: lane.points[0].clone().addScaledVector(out, lane.widths[0]), out });
    }
    return spots;
  };

  // The pieces of lane between the gaps (sample indices), and the border runs around them.
  const pieces: [number, number][] = [];
  let pieceStart = 0;
  for (const gap of lane.gaps) {
    pieces.push([pieceStart, lane.index(gap.from)]);
    pieceStart = lane.index(gap.to);
  }
  pieces.push([pieceStart, n]);
  const runs: { spots: EdgeSpot[]; closed: boolean }[] = [];
  if (pieces.length === 1) {
    runs.push({ spots: [...leftSide(0, n), ...cupEnd(), ...rightSide(n, 0), ...teeEnd()], closed: true });
  } else {
    for (const [a, b] of pieces) {
      if (b === n) runs.push({ spots: [...leftSide(a, n), ...cupEnd(), ...rightSide(n, a)], closed: false });
      else if (a === 0) runs.push({ spots: [...rightSide(b, 0), ...teeEnd(), ...leftSide(0, b)], closed: false });
      else runs.push({ spots: leftSide(a, b), closed: false }, { spots: rightSide(b, a), closed: false });
    }
  }

  // The plank's cross-section, one flat face after another: (distance outwards from the edge, height
  // above the floor) at both ends of the face, and how light that face is drawn.
  const w = cfg.bumperWidth;
  const h = cfg.bumperHeight;
  const b = cfg.woodBevel;
  const faces: { from: [number, number]; to: [number, number]; light: number }[] = [
    { from: [0, -0.15], to: [0, h - b], light: 0.92 }, // the side facing the lane
    { from: [0, h - b], to: [b, h], light: 1.18 }, // bevel
    { from: [b, h], to: [w - b, h], light: 1.12 }, // top
    { from: [w - b, h], to: [w, h - b], light: 1.0 }, // bevel
    { from: [w, h - b], to: [w, -cfg.bumperDepth], light: 0.78 }, // the outer side, down into the ground
  ];
  const outline: [number, number][] = [...faces.map((f) => f.from), faces[faces.length - 1].to];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  const plank = cfg.woodPlankLength;
  const p = (i: number): THREE.Vector3 => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const triangleNormal = (i: number): THREE.Vector3 =>
    new THREE.Vector3().subVectors(p(indices[i + 1]), p(indices[i])).cross(new THREE.Vector3().subVectors(p(indices[i + 2]), p(indices[i])));
  /** Turns the triangles from index `first` on round if the first one faces against `want`. */
  const orient = (first: number, want: THREE.Vector3): void => {
    if (triangleNormal(first).dot(want) >= 0) return;
    for (let i = first; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  };

  for (const run of runs) {
    const loop = run.spots;
    const count = run.closed ? loop.length + 1 : loop.length;
    const along: number[] = [0];
    for (let k = 1; k < count; k++) along.push(along[k - 1] + loop[k % loop.length].point.distanceTo(loop[k - 1].point));
    const runFirstIndex = indices.length;
    let around = 0;
    for (const face of faces) {
      const [o0, y0] = face.from;
      const [o1, y1] = face.to;
      const length = Math.hypot(o1 - o0, y1 - y0);
      // The face's normal in the cross-section (outwards, up). The faces go round the plank in order,
      // so turning each face's direction a quarter turn the same way always points away from the plank.
      const nx = -(y1 - y0);
      const ny = o1 - o0;
      const start = positions.length / 3;
      for (let k = 0; k < count; k++) {
        const spot = loop[k % loop.length];
        for (const [o, y, v] of [
          [o0, y0, around],
          [o1, y1, around + length],
        ]) {
          positions.push(spot.point.x + spot.out.x * o, spot.point.y + y, spot.point.z + spot.out.z * o);
          const normal = new THREE.Vector3(spot.out.x * nx, ny, spot.out.z * nx).normalize();
          normals.push(normal.x, normal.y, normal.z);
          uvs.push(along[k] / plank, v / plank);
          colours.push(face.light, face.light, face.light);
        }
      }
      for (let k = 0; k < count - 1; k++) {
        const a = start + k * 2;
        indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
      around += length;
    }
    // The side facing the lane must point back into the lane, against "out" (the physics needs this way round).
    orient(runFirstIndex, loop[0].out.clone().negate());

    // An open run ends in a flat cut through the plank, at both ends.
    if (run.closed) continue;
    for (const [k, away] of [
      [0, loop[0].point.clone().sub(loop[1].point)],
      [loop.length - 1, loop[loop.length - 1].point.clone().sub(loop[loop.length - 2].point)],
    ] as const) {
      const spot = loop[k];
      const start = positions.length / 3;
      const normal = away.clone().setY(0).normalize();
      for (const [o, y] of outline) {
        positions.push(spot.point.x + spot.out.x * o, spot.point.y + y, spot.point.z + spot.out.z * o);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(o / plank, y / plank);
        colours.push(0.85, 0.85, 0.85);
      }
      const first = indices.length;
      for (let j = 1; j < outline.length - 1; j++) indices.push(start, start + j, start + j + 1);
      orient(first, normal);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * The wooden boards under the two edges of a gap: from the turf's edge straight down into the water,
 * as wide as the lane and its borders. They are solid, so a ball that falls short bounces off them.
 */
function addGapBoards(group: THREE.Group, lane: Lane, gap: Stretch, world: RAPIER.World, R: typeof RAPIER, body: RAPIER.RigidBody): void {
  const cfg = TUNING.course;
  const bottom = TUNING.scenery.seaLevel - 0.5;
  // Each board stands just inside the gap (under the turf it would poke up through a sloping take-off).
  for (const [distance, back] of [
    [gap.from, 1],
    [gap.to, -1],
  ]) {
    const k = lane.index(distance);
    const top = lane.points[k].y - 0.006;
    const width = (lane.widths[k] + cfg.bumperWidth) * 2;
    const height = top - bottom;
    const thickness = cfg.gapBoardThickness;
    const centre = lane.points[k]
      .clone()
      .addScaledVector(lane.tangents[k], (back * thickness) / 2)
      .setY(top - height / 2);
    const yaw = Math.atan2(lane.tangents[k].x, lane.tangents[k].z);
    const board = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), plainWoodMaterial());
    board.position.copy(centre);
    board.rotation.y = yaw;
    board.castShadow = true;
    board.receiveShadow = true;
    group.add(board);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    world.createCollider(
      R.ColliderDesc.cuboid(width / 2, height / 2, thickness / 2)
        .setTranslation(centre.x, centre.y, centre.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setFriction(cfg.wallFriction)
        .setRestitution(cfg.wallBounce),
      body,
    );
  }
}

/**
 * A pipe over a stretch of the lane: a half-round shell resting on the wooden borders, painted in a
 * bright colour with white rims at both ends. Returns the mesh and its inner surface for the physics.
 */
function buildTube(lane: Lane, stretch: Stretch): { mesh: THREE.Mesh; inside: TriangleSoup } {
  const cfg = TUNING.course;
  const first = lane.index(stretch.from);
  const last = lane.index(stretch.to);
  const steps = 22;
  const thickness = cfg.tubeThickness;
  const colour = new THREE.Color(cfg.tubeColour);
  const rim = new THREE.Color('#ffffff');
  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  const inside = new TriangleSoup();
  /** A point on the arch at sample i, angle a (0 = left foot, PI = right foot), `extra` outside the inner surface. */
  const archPoint = (i: number, a: number, extra: number): THREE.Vector3 => {
    const radius = lane.widths[i] + cfg.bumperWidth * 0.5;
    return lane.points[i]
      .clone()
      .addScaledVector(lane.left(i), Math.cos(a) * (radius + extra))
      .setY(lane.points[i].y + cfg.bumperHeight + Math.sin(a) * (radius * cfg.tubeFlatten + extra));
  };
  const rimLength = cfg.tubeRimLength;
  const colourAt = (i: number, shade: number): THREE.Color => {
    const s = Math.min(i - first, last - i) * lane.spacing;
    return (s < rimLength ? rim.clone() : colour.clone()).multiplyScalar(shade);
  };
  /** One surface: a grid over (sample, angle). `extra` = how far outside the inner surface. */
  const surface = (extra: number, shade: number): number => {
    const start = positions.length / 3;
    for (let i = first; i <= last; i++) {
      const c = colourAt(i, shade);
      for (let j = 0; j <= steps; j++) {
        const p = archPoint(i, (j / steps) * Math.PI, extra);
        positions.push(p.x, p.y, p.z);
        colours.push(c.r, c.g, c.b);
      }
    }
    const firstIndex = indices.length;
    for (let i = 0; i < last - first; i++) {
      for (let j = 0; j < steps; j++) {
        const a = start + i * (steps + 1) + j;
        const b = a + steps + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return firstIndex;
  };
  const vertex = (k: number): THREE.Vector3 => new THREE.Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
  /** Turns triangles [from, to) round if the first one does not face along `want`. */
  const orient = (from: number, to: number, want: THREE.Vector3): void => {
    const n = new THREE.Vector3()
      .subVectors(vertex(indices[from + 1]), vertex(indices[from]))
      .cross(new THREE.Vector3().subVectors(vertex(indices[from + 2]), vertex(indices[from])));
    if (n.dot(want) >= 0) return;
    for (let i = from; i < to; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  };
  // Inner surface faces down towards the lane, the outer one faces up and out.
  const innerStart = surface(0, 0.62);
  orient(innerStart, indices.length, lane.left(first).negate()); // the first triangle sits at the left foot
  const innerEnd = indices.length;
  const outerStart = surface(thickness, 1);
  orient(outerStart, indices.length, lane.left(first));
  // Rings closing the shell at both ends.
  for (const [i, back] of [
    [first, -1],
    [last, 1],
  ]) {
    const start = positions.length / 3;
    for (let j = 0; j <= steps; j++) {
      for (const extra of [0, thickness]) {
        const p = archPoint(i, (j / steps) * Math.PI, extra);
        positions.push(p.x, p.y, p.z);
        colours.push(rim.r, rim.g, rim.b);
      }
    }
    const from = indices.length;
    for (let j = 0; j < steps; j++) {
      const a = start + j * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    orient(from, indices.length, lane.tangents[i].clone().multiplyScalar(back));
  }
  for (let t = innerStart; t < innerEnd; t += 3) inside.add(vertex(indices[t]), vertex(indices[t + 1]), vertex(indices[t + 2]));

  // Flat-shaded rims and smooth shell: separate vertices per surface, so normals can be computed per surface.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, inside };
}

/** A square pit under the cup, deep enough for the ball to drop in, with a dark inside so it looks deep. */
function addCupPit(group: THREE.Group, cup: THREE.Vector3, radius: number, world: RAPIER.World, R: typeof RAPIER): void {
  const depth = TUNING.course.cupDepth;
  const wall = 0.08;
  const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cup.x, cup.y, cup.z));
  const box = (hx: number, hy: number, hz: number, x: number, y: number, z: number): void => {
    world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.8), body);
  };
  box(radius + wall, wall / 2, radius + wall, 0, -depth - wall / 2, 0); // bottom
  for (const side of [-1, 1]) {
    box(wall / 2, depth / 2, radius + wall, side * (radius + wall / 2), -depth / 2, 0);
    box(radius + wall, depth / 2, wall / 2, 0, -depth / 2, side * (radius + wall / 2));
  }
  const inside = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.98, radius * 0.98, depth, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: '#1d2b22', side: THREE.BackSide }),
  );
  inside.position.set(cup.x, cup.y - depth / 2 - 0.002, cup.z);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ color: '#16211a' }));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.set(cup.x, cup.y - depth, cup.z);
  // A white rim around the cup, like a real green.
  const rim = new THREE.Mesh(new THREE.RingGeometry(radius, radius + TUNING.course.cupRimWidth, 40), new THREE.MeshStandardMaterial({ color: '#f4f4ee', roughness: 0.6 }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(cup.x, cup.y + 0.004, cup.z);
  rim.receiveShadow = true;
  group.add(inside, bottom, rim);
}

/**
 * Makes the windmill's blades long enough to sweep the lane and turns them.
 * They push the ball like a real obstacle (a "kinematic" body: moved by us, not by forces).
 */
function addWindmillBlades(model: THREE.Object3D, blades: THREE.Object3D, world: RAPIER.World, R: typeof RAPIER): (dt: number) => void {
  const cfg = TUNING.course;
  blades.scale.setScalar(cfg.bladeScale);
  model.updateMatrixWorld(true);
  const hub = blades.getWorldPosition(new THREE.Vector3());
  const baseRotation = model.getWorldQuaternion(new THREE.Quaternion());
  const scale = cfg.tileSize * cfg.bladeScale;
  // The hitbox is a little smaller than the drawn blade (bladeHitboxLength / bladeHitboxWidth), so the ball is
  // only stopped where it clearly touches a blade.
  const half = KIT_BLADE_LENGTH * scale * cfg.bladeHitboxLength;
  const width = KIT_BLADE_HALF_WIDTH * scale * cfg.bladeHitboxWidth;
  const thickness = KIT_BLADE_HALF_THICKNESS * scale;

  const body = world.createRigidBody(
    R.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(hub.x, hub.y, hub.z)
      .setRotation({ x: baseRotation.x, y: baseRotation.y, z: baseRotation.z, w: baseRotation.w }),
  );
  // Two long boxes through the hub make the X, turned 45° like the drawn blades.
  const diagonal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4);
  const r = { x: diagonal.x, y: diagonal.y, z: diagonal.z, w: diagonal.w };
  world.createCollider(R.ColliderDesc.cuboid(half, width, thickness).setRotation(r).setFriction(0.2).setRestitution(0.5), body);
  world.createCollider(R.ColliderDesc.cuboid(width, half, thickness).setRotation(r).setFriction(0.2).setRestitution(0.5), body);

  let angle = 0;
  const spin = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  return (dt) => {
    angle += THREE.MathUtils.degToRad(cfg.windmillDegreesPerSecond) * dt;
    blades.rotation.z = angle;
    const q = baseRotation.clone().multiply(spin.setFromAxisAngle(zAxis, angle));
    body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  };
}

/** Adds every triangle of an indexed geometry (already in world coordinates) to `soup`. */
function addMeshTriangles(geometry: THREE.BufferGeometry, soup: TriangleSoup): void {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex()!;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < index.count; i += 3) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(position, index.getX(i + k));
    soup.add(v[0], v[1], v[2]);
  }
}

/**
 * Adds a kit model's triangles (world coordinates) to `soup`, leaving out `skip` and its children,
 * and triangles for which `leaveOut` says so (it gets the corners in the model's own kit units and the normal).
 */
function addModelTriangles(
  model: THREE.Object3D,
  skip: THREE.Object3D,
  soup: TriangleSoup,
  leaveOut: (local: THREE.Vector3[], normal: THREE.Vector3) => boolean,
): void {
  const skipped = new Set<THREE.Object3D>();
  skip.traverse((o) => skipped.add(o));
  const toModel = model.matrixWorld.clone().invert();
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || skipped.has(o)) return;
    const position = o.geometry.getAttribute('position');
    const index = o.geometry.getIndex();
    const count = index ? index.count : position.count;
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < count; i += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
      const normal = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
      if (normal.lengthSq() < 1e-10) continue;
      if (leaveOut(v.map((w) => w.clone().applyMatrix4(toModel)), normal.normalize())) continue;
      soup.add(v[0], v[1], v[2]);
    }
  });
}

const UP = new THREE.Vector3(0, 1, 0);

let turfCache: THREE.MeshStandardMaterial | null = null;
let bumperCache: THREE.MeshStandardMaterial | null = null;

/**
 * Mowed turf: squares in two greens that follow the lane (from the floor's "laneCoord": distance along
 * the lane and -1..1 across it), with the fine grass bumps of the CC0 texture on top.
 */
function turfMaterial(): THREE.MeshStandardMaterial {
  if (turfCache) return turfCache;
  const cfg = TUNING.course;
  const material = new THREE.MeshStandardMaterial({
    normalMap: grassTexture('normalgl', false),
    normalScale: new THREE.Vector2(cfg.turfBumpiness, cfg.turfBumpiness),
    roughness: 1,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.turfLight = { value: new THREE.Color(cfg.turfLight) };
    shader.uniforms.turfDark = { value: new THREE.Color(cfg.turfDark) };
    shader.uniforms.checker = { value: new THREE.Vector2(cfg.checkerLength, cfg.checkerColumns / 2) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 laneCoord;\nvarying vec2 vLane;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLane = laneCoord;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 turfLight;\nuniform vec3 turfDark;\nuniform vec2 checker;\nvarying vec2 vLane;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Which square we are in, with soft edges (no flicker in the distance).
        vec2 cell = vec2(vLane.x / checker.x, vLane.y * checker.y);
        vec2 edge = fwidth(cell);
        vec2 wave = clamp(sin(cell * PI) / max(edge * PI, 0.001), -1.0, 1.0);
        float square = 0.5 + 0.5 * wave.x * wave.y;
        diffuseColor.rgb = mix(turfDark, turfLight, square);`,
      );
  };
  turfCache = material;
  return material;
}

/** Wood for the borders: planks with grain and joints, lighter on the top (from the geometry's colours). */
function bumperMaterial(): THREE.MeshStandardMaterial {
  bumperCache ??= new THREE.MeshStandardMaterial({ map: woodTexture(), vertexColors: true, roughness: 0.85 });
  return bumperCache;
}

let plainWoodCache: THREE.MeshStandardMaterial | null = null;

/** The same wood without the per-face shading (for simple boxes like the boards under a gap). */
function plainWoodMaterial(): THREE.MeshStandardMaterial {
  plainWoodCache ??= new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85, color: '#d8d0c8' });
  return plainWoodCache;
}

/** One plank's worth of wood (it repeats along the border): warm brown, long grain lines, a dark joint at the end. */
function woodTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = TUNING.course.woodColour;
  c.fillRect(0, 0, 512, 128);
  let seed = 7;
  const random = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Grain: thin wavy lines running along the plank, some lighter, some darker.
  for (let k = 0; k < 46; k++) {
    const y = random() * 128;
    c.strokeStyle = random() < 0.5 ? 'rgba(60,30,10,0.22)' : 'rgba(255,220,170,0.12)';
    c.lineWidth = 1 + random() * 2.5;
    c.beginPath();
    c.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) c.lineTo(x, y + Math.sin(x * 0.02 + k) * (1 + random() * 2));
    c.stroke();
  }
  // A knot or two.
  for (let k = 0; k < 2; k++) {
    const x = 80 + random() * 350;
    const y = 30 + random() * 70;
    c.fillStyle = 'rgba(70,35,12,0.35)';
    c.beginPath();
    c.ellipse(x, y, 10 + random() * 8, 4 + random() * 3, 0, 0, Math.PI * 2);
    c.fill();
  }
  // The joint between this plank and the next.
  c.fillStyle = 'rgba(40,20,8,0.7)';
  c.fillRect(0, 0, 4, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** The CC0 grass texture (colour and bumps), tinted and matte (shiny specks sparkle too much in the sun). Exported for the islands. */
export function grassMaterial(tint: readonly number[], bumpiness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: grassTexture('color', true),
    normalMap: grassTexture('normalgl', false),
    normalScale: new THREE.Vector2(bumpiness, bumpiness),
    roughness: 1,
    color: new THREE.Color(tint[0], tint[1], tint[2]),
  });
}

/** One of the CC0 grass texture's maps (colour or bumps), repeating. */
function grassTexture(map: string, colour: boolean): THREE.Texture {
  const texture = new THREE.TextureLoader().load(`/host/assets/textures/grass_${map}.jpg`);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (colour) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Triangles with shared corners merged, so a surface is seamless for the physics. */
class TriangleSoup {
  private readonly vertices: number[] = [];
  private readonly indices: number[] = [];
  private readonly lookup = new Map<string, number>();

  add(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    const ia = this.vertex(a);
    const ib = this.vertex(b);
    const ic = this.vertex(c);
    if (ia !== ib && ib !== ic && ia !== ic) this.indices.push(ia, ib, ic);
  }

  build(): { vertices: Float32Array; indices: Uint32Array } {
    return { vertices: new Float32Array(this.vertices), indices: new Uint32Array(this.indices) };
  }

  private vertex(v: THREE.Vector3): number {
    const key = `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)},${Math.round(v.z * 1000)}`;
    let index = this.lookup.get(key);
    if (index === undefined) {
      index = this.vertices.length / 3;
      this.vertices.push(v.x, v.y, v.z);
      this.lookup.set(key, index);
    }
    return index;
  }
}
