import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';

// Graybox holes made of plain boxes. Top view: x to the right, z forward, the floor surface is at y = 0.
// Later (Phase 4) the boxes are replaced with pieces from the Kenney Minigolf Kit.

/** A box seen from above: centre (x, z) and size (width along x, depth along z). */
type Rect = { x: number; z: number; w: number; d: number };
type Point = { x: number; z: number };

export type HoleDef = {
  number: number;
  par: number;
  tee: Point;
  cup: Point;
  /** Floor areas. The cup gap is cut out automatically. */
  floors: Rect[];
  walls: Rect[];
  /** Where the aim points at the start of a shot: the first point the ball can see, checked from the last. */
  aimPoints: Point[];
};

const WALL = 0.2; // wall thickness

/** Hole 1: a simple bend (to the left, seen from the tee). */
export const HOLE_1: HoleDef = {
  number: 1,
  par: 3,
  tee: { x: 0, z: 1 },
  cup: { x: 7, z: 8 },
  floors: [
    { x: 0, z: 4.5, w: 2, d: 9 }, // first lane, x -1..1, z 0..9
    { x: 4.5, z: 8, w: 7, d: 2 }, // second lane, x 1..8, z 7..9
  ],
  walls: [
    { x: -1 - WALL / 2, z: 4.5 + WALL / 2, w: WALL, d: 9 + WALL }, // left
    { x: 1 + WALL / 2, z: 3.5, w: WALL, d: 7 }, // right of the first lane
    { x: 0, z: -WALL / 2, w: 2 + 2 * WALL, d: WALL }, // behind the tee
    { x: 3.5, z: 9 + WALL / 2, w: 9 + 2 * WALL, d: WALL }, // far side
    { x: 4.5 + WALL / 2, z: 7 - WALL / 2, w: 7 + WALL, d: WALL }, // near side of the second lane
    { x: 8 + WALL / 2, z: 8, w: WALL, d: 2 }, // end
  ],
  aimPoints: [
    { x: 0, z: 7.8 }, // the corner
    { x: 7, z: 8 }, // the cup
  ],
};

/** Adds the hole's meshes to the scene and its colliders to the physics world. */
export function buildCourse(hole: HoleDef, world: RAPIER.World, R: typeof RAPIER): THREE.Group {
  const cfg = TUNING.course;
  const group = new THREE.Group();
  const floorMaterial = new THREE.MeshStandardMaterial({ color: cfg.floorColour, roughness: 0.9 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: cfg.wallColour, roughness: 0.8 });

  const addBox = (rect: Rect, yBottom: number, height: number, material: THREE.Material, isFloor: boolean, solid = true): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(rect.w, height, rect.d), material);
    mesh.position.set(rect.x, yBottom + height / 2, rect.z);
    mesh.castShadow = !isFloor;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!solid) return;

    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(rect.x, yBottom + height / 2, rect.z));
    world.createCollider(
      R.ColliderDesc.cuboid(rect.w / 2, height / 2, rect.d / 2)
        .setFriction(isFloor ? cfg.floorFriction : cfg.wallFriction)
        .setRestitution(isFloor ? 0 : cfg.wallBounce),
      body,
    );
  };

  // Floors, with a square gap for the cup. The boxes are only for looks: the ball rolls on one
  // connected surface, because a ball catches on the seam where two separate boxes meet.
  const gap = cfg.cupGap;
  for (const floor of hole.floors) {
    for (const piece of cutHole(floor, hole.cup, gap)) addBox(piece, -cfg.floorThickness, cfg.floorThickness, floorMaterial, true, false);
  }
  const surface = floorSurface(hole, gap);
  world.createCollider(
    R.ColliderDesc.trimesh(surface.vertices, surface.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(cfg.floorFriction).setRestitution(0),
    world.createRigidBody(R.RigidBodyDesc.fixed()),
  );

  // The cup: a pit under the gap, so the ball really drops in (and can lip out).
  const pitDepth = cfg.cupDepth;
  const cupMaterial = new THREE.MeshStandardMaterial({ color: '#2a2f35', roughness: 1 });
  addBox({ x: hole.cup.x, z: hole.cup.z, w: gap + 2 * WALL, d: gap + 2 * WALL }, -pitDepth - WALL, WALL, cupMaterial, true);
  for (const side of [-1, 1]) {
    addBox({ x: hole.cup.x + side * (gap / 2 + WALL / 2), z: hole.cup.z, w: WALL, d: gap }, -pitDepth, pitDepth, cupMaterial, false);
    addBox({ x: hole.cup.x, z: hole.cup.z + side * (gap / 2 + WALL / 2), w: gap + 2 * WALL, d: WALL }, -pitDepth, pitDepth, cupMaterial, false);
  }
  const cupRim = new THREE.Mesh(new THREE.CircleGeometry(gap / 2, 32), new THREE.MeshBasicMaterial({ color: '#1a1d21' }));
  cupRim.rotation.x = -Math.PI / 2;
  cupRim.position.set(hole.cup.x, 0.002, hole.cup.z);
  group.add(cupRim);

  for (const wall of hole.walls) addBox(wall, -cfg.floorThickness, cfg.floorThickness + cfg.wallHeight, wallMaterial, false);

  // Flag, so the cup is easy to find.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4), new THREE.MeshStandardMaterial({ color: '#f4f4f4' }));
  pole.position.set(hole.cup.x, 0.7, hole.cup.z);
  pole.castShadow = true;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.28), new THREE.MeshStandardMaterial({ color: '#ff5a5f', side: THREE.DoubleSide }));
  flag.position.set(hole.cup.x + 0.23, 1.25, hole.cup.z);
  flag.castShadow = true;
  group.add(pole, flag);

  return group;
}

/**
 * One connected floor surface at y = 0 for physics. All floor and cup edges become grid lines,
 * so neighbouring cells share their corners and the surface has no seams for the ball to catch on.
 */
function floorSurface(hole: HoleDef, gap: number): { vertices: Float32Array; indices: Uint32Array } {
  const g = gap / 2;
  const xs = new Set<number>([hole.cup.x - g, hole.cup.x + g]);
  const zs = new Set<number>([hole.cup.z - g, hole.cup.z + g]);
  for (const f of hole.floors) {
    xs.add(f.x - f.w / 2).add(f.x + f.w / 2);
    zs.add(f.z - f.d / 2).add(f.z + f.d / 2);
  }
  const xLines = [...xs].sort((a, b) => a - b);
  const zLines = [...zs].sort((a, b) => a - b);
  const inside = (x: number, z: number): boolean =>
    hole.floors.some((f) => Math.abs(x - f.x) < f.w / 2 && Math.abs(z - f.z) < f.d / 2) &&
    !(Math.abs(x - hole.cup.x) < g && Math.abs(z - hole.cup.z) < g);

  const vertices: number[] = [];
  const indices: number[] = [];
  const vertexIndex = new Map<string, number>();
  const vertex = (i: number, j: number): number => {
    const key = `${i},${j}`;
    let index = vertexIndex.get(key);
    if (index === undefined) {
      index = vertices.length / 3;
      vertices.push(xLines[i], 0, zLines[j]);
      vertexIndex.set(key, index);
    }
    return index;
  };
  for (let i = 0; i < xLines.length - 1; i++) {
    for (let j = 0; j < zLines.length - 1; j++) {
      if (!inside((xLines[i] + xLines[i + 1]) / 2, (zLines[j] + zLines[j + 1]) / 2)) continue;
      const a = vertex(i, j);
      const b = vertex(i + 1, j);
      const c = vertex(i + 1, j + 1);
      const d = vertex(i, j + 1);
      indices.push(a, c, b, a, d, c); // counter-clockwise seen from above, so the surface faces up
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/** Splits a floor rectangle into up to four pieces around a square gap at `cup`. */
function cutHole(rect: Rect, cup: Point, gap: number): Rect[] {
  const left = rect.x - rect.w / 2;
  const right = rect.x + rect.w / 2;
  const near = rect.z - rect.d / 2;
  const far = rect.z + rect.d / 2;
  const g = gap / 2;
  if (cup.x - g < left || cup.x + g > right || cup.z - g < near || cup.z + g > far) return [rect];

  const pieces: Rect[] = [];
  const add = (x0: number, x1: number, z0: number, z1: number): void => {
    if (x1 - x0 > 1e-6 && z1 - z0 > 1e-6) pieces.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
  };
  add(left, cup.x - g, near, far); // left strip
  add(cup.x + g, right, near, far); // right strip
  add(cup.x - g, cup.x + g, near, cup.z - g); // in front of the cup
  add(cup.x - g, cup.x + g, cup.z + g, far); // behind the cup
  return pieces;
}
