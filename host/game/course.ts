import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TUNING } from '../../shared/tuning.ts';

// Holes built from Kenney Minigolf Kit pieces (CC0, in host/assets/minigolf).
// In the kit every piece is a 1 × 1 tile; we scale them up by tileSize so the kit's ball matches ours.
// Grid coordinates: x and z count tiles, z points down the first lane, "level" lifts a tile by one
// low-ramp step. Turning a piece: rot = number of quarter turns (rot 1 = 90°).
//
// Physics: all floor triangles of a hole become one connected surface and all wall triangles another,
// so the ball rolls smoothly over the seams between tiles. Hidden faces (each tile's underside and its
// edges, where it touches the next tile) are left out: the ball would catch on their edges. The kit's
// cup is very shallow, so under it we add a deeper pit the ball really drops into.

/** Measurements of the kit pieces, in kit units. */
const KIT_FLOOR = 0.063; // height of the floor surface
const KIT_RAMP_STEP = 0.1; // how much a "ramp-low" piece climbs
const KIT_CUP_RADIUS = 0.067; // radius of the cup in the "hole-…" pieces
const KIT_BLADE_LENGTH = 0.6; // windmill blades reach this far from their hub

export type Piece = { name: string; x: number; z: number; rot?: number; level?: number };

export type HoleDef = {
  number: number;
  par: number;
  pieces: Piece[];
  /** Tee position in grid coordinates, and the direction down the lane in degrees (0 = +z, 90 = +x). */
  tee: { x: number; z: number };
  teeYaw: number;
};

export const HOLES: HoleDef[] = [
  {
    // Hole 1: a simple bend to the right.
    number: 1,
    par: 3,
    tee: { x: 0, z: -0.2 },
    teeYaw: 0,
    pieces: [
      { name: 'end', x: 0, z: 0, rot: 2 },
      { name: 'straight', x: 0, z: 1 },
      { name: 'straight', x: 0, z: 2 },
      { name: 'round-corner-a', x: 0, z: 3 },
      { name: 'straight', x: -1, z: 3, rot: 1 },
      { name: 'hole-round', x: -2, z: 3, rot: 3 },
    ],
  },
  {
    // Hole 2: up a ramp, across a raised bridge and down again.
    number: 2,
    par: 3,
    tee: { x: 0, z: -0.2 },
    teeYaw: 0,
    pieces: [
      { name: 'end', x: 0, z: 0, rot: 2 },
      { name: 'ramp-low', x: 0, z: 1 },
      { name: 'straight', x: 0, z: 2, level: 1 },
      { name: 'ramp-low', x: 0, z: 3, rot: 2 },
      { name: 'hole-round', x: 0, z: 4 },
    ],
  },
  {
    // Hole 3: through the windmill while its blades sweep the lane.
    number: 3,
    par: 3,
    tee: { x: 0, z: -0.2 },
    teeYaw: 0,
    pieces: [
      { name: 'end', x: 0, z: 0, rot: 2 },
      { name: 'straight', x: 0, z: 1 },
      { name: 'windmill', x: 0, z: 2 },
      { name: 'straight', x: 0, z: 3 },
      { name: 'hole-round', x: 0, z: 4 },
    ],
  },
];

export type Kit = Map<string, GLTF>;

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
};

export async function loadKit(): Promise<Kit> {
  const names = new Set([...HOLES.flatMap((h) => h.pieces.map((p) => p.name)), 'flag-red']);
  const loader = new GLTFLoader();
  const loaded = await Promise.all(
    [...names].map(async (name) => [name, await loader.loadAsync(`/host/assets/minigolf/${name}.glb`)] as const),
  );
  return new Map(loaded);
}

/** True when the ball has dropped into the cup. */
export function isInCup(p: { x: number; y: number; z: number }, hole: BuiltHole): boolean {
  return (
    p.y < hole.cup.y - TUNING.ball.radius * 1.5 &&
    Math.hypot(p.x - hole.cup.x, p.z - hole.cup.z) < hole.cupRadius + TUNING.ball.radius
  );
}

/** Builds a hole at `origin`: its meshes (returned in a group) and its colliders in the physics world. */
export function buildHole(def: HoleDef, kit: Kit, origin: THREE.Vector3, world: RAPIER.World, R: typeof RAPIER): BuiltHole {
  const S = TUNING.course.tileSize;
  const group = new THREE.Group();
  const floor = new TriangleSoup();
  const walls = new TriangleSoup();
  let cup: THREE.Vector3 | null = null;
  const updates: ((dt: number) => void)[] = [];
  const occluders: THREE.Object3D[] = [];

  for (const piece of def.pieces) {
    const source = kit.get(piece.name);
    if (!source) throw new Error(`Missing kit piece ${piece.name}`);
    const model = source.scene.clone(true);
    model.scale.setScalar(S);
    model.rotation.y = ((piece.rot ?? 0) * Math.PI) / 2;
    model.position.set(
      origin.x + piece.x * S,
      origin.y + ((piece.level ?? 0) * KIT_RAMP_STEP - KIT_FLOOR) * S,
      origin.z + piece.z * S,
    );
    model.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    group.add(model);
    model.updateMatrixWorld(true);

    const pieceCup = piece.name.startsWith('hole-') ? model.localToWorld(new THREE.Vector3(0, KIT_FLOOR, 0)) : null;
    if (pieceCup) cup = pieceCup;

    const blades = model.getObjectByName('blades');
    collectTriangles(model, blades ?? null, (a, b, c, local) => {
      if (isHiddenFace(local)) return;
      // Leave out the shallow kit cup; the deeper pit below replaces it.
      if (pieceCup && [a, b, c].every((v) => v.y < pieceCup.y - 0.001 && horizontalDistance(v, pieceCup) < KIT_CUP_RADIUS * S * 1.05)) {
        return;
      }
      const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (normal.lengthSq() < 1e-10) return;
      (normal.normalize().y > 0.5 ? floor : walls).add(a, b, c);
    });

    if (blades) {
      updates.push(addWindmillBlades(model, blades, world, R));
      // Its own copies of the materials, so it can be faded out without fading the other pieces.
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = (o.material as THREE.Material).clone();
      });
      occluders.push(model);
      // A plain lane underneath, so the grass stays visible while the windmill is faded out.
      const lane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8 * S, S),
        new THREE.MeshStandardMaterial({ color: TUNING.course.laneColour, roughness: 0.9 }),
      );
      lane.rotation.x = -Math.PI / 2;
      lane.rotation.z = model.rotation.y;
      lane.position.set(model.position.x, model.position.y + (KIT_FLOOR - 0.002) * S, model.position.z);
      lane.receiveShadow = true;
      group.add(lane);
    }
  }
  if (!cup) throw new Error(`Hole ${def.number} has no cup`);

  const cfg = TUNING.course;
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
  const floorMesh = floor.build();
  const floorCollider = world.createCollider(
    R.ColliderDesc.trimesh(floorMesh.vertices, floorMesh.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(cfg.floorFriction)
      .setRestitution(0),
    fixed,
  );
  const wallMesh = walls.build();
  world.createCollider(
    R.ColliderDesc.trimesh(wallMesh.vertices, wallMesh.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(cfg.wallFriction)
      .setRestitution(cfg.wallBounce),
    fixed,
  );

  const cupRadius = KIT_CUP_RADIUS * S;
  addCupPit(group, cup, cupRadius, world, R);
  const flag = kit.get('flag-red')!.scene.clone(true);
  flag.scale.setScalar(S);
  flag.position.copy(cup);
  flag.traverse((o) => (o.castShadow = true));
  group.add(flag);

  const yaw = THREE.MathUtils.degToRad(def.teeYaw);
  return {
    def,
    group,
    tee: new THREE.Vector3(origin.x + def.tee.x * S, origin.y, origin.z + def.tee.z * S),
    teeYaw: yaw,
    cup,
    cupRadius,
    update: (dt) => updates.forEach((u) => u(dt)),
    floorCollider,
    occluders,
  };
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
  group.add(inside, bottom);
}

/**
 * Makes the windmill's blades long enough to sweep the lane and turns them.
 * They push the ball like a real obstacle (a "kinematic" body: moved by us, not by forces).
 */
function addWindmillBlades(
  model: THREE.Object3D,
  blades: THREE.Object3D,
  world: RAPIER.World,
  R: typeof RAPIER,
): (dt: number) => void {
  const cfg = TUNING.course;
  blades.scale.setScalar(cfg.bladeScale);
  model.updateMatrixWorld(true);
  const hub = blades.getWorldPosition(new THREE.Vector3());
  const baseRotation = model.getWorldQuaternion(new THREE.Quaternion());
  const scale = cfg.tileSize * cfg.bladeScale;
  const half = KIT_BLADE_LENGTH * scale;
  const width = 0.06 * scale;
  const thickness = 0.05 * scale;

  const body = world.createRigidBody(
    R.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(hub.x, hub.y, hub.z)
      .setRotation({ x: baseRotation.x, y: baseRotation.y, z: baseRotation.z, w: baseRotation.w }),
  );
  world.createCollider(R.ColliderDesc.cuboid(half, width, thickness).setFriction(0.2).setRestitution(0.5), body);
  world.createCollider(R.ColliderDesc.cuboid(width, half, thickness).setFriction(0.2).setRestitution(0.5), body);

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

/**
 * A tile's underside or one of its edges (lying in the tile's border, where it meets the next tile).
 * `local` holds the triangle's corners in kit units, relative to the piece.
 */
function isHiddenFace(local: THREE.Vector3[]): boolean {
  if (local.every((v) => v.y <= KIT_FLOOR + 0.001) && local.some((v) => v.y < KIT_FLOOR - 0.001)) return true;
  const onBorder = (axis: 'x' | 'z'): boolean =>
    local.every((v) => Math.abs(Math.abs(v[axis]) - 0.5) < 0.001 && Math.sign(v[axis]) === Math.sign(local[0][axis]));
  return onBorder('x') || onBorder('z');
}

/**
 * Calls `visit` with every triangle of the model's meshes, skipping `skip` and its children:
 * the corners in world coordinates, and in the piece's own (kit) coordinates.
 */
function collectTriangles(
  model: THREE.Object3D,
  skip: THREE.Object3D | null,
  visit: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, local: THREE.Vector3[]) => void,
): void {
  const skipped = new Set<THREE.Object3D>();
  skip?.traverse((o) => skipped.add(o));
  const toPiece = model.matrixWorld.clone().invert();
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || skipped.has(o)) return;
    const position = o.geometry.getAttribute('position');
    const index = o.geometry.getIndex();
    const count = index ? index.count : position.count;
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < count; i += 3) {
      for (let k = 0; k < 3; k++) {
        v[k].fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
      }
      visit(v[0], v[1], v[2], v.map((w) => w.clone().applyMatrix4(toPiece)));
    }
  });
}

function horizontalDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Triangles with shared corners merged, so neighbouring tiles form one seamless surface. */
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
