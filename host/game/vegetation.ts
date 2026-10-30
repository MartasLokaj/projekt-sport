import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TUNING } from '../../shared/tuning.ts';
import type { BuiltHole } from './course.ts';

// Cute low-poly trees, bushes and grass tufts on the islands (KayKit Forest Nature Pack, CC0).
// Trees grow in little groves away from the lane, bushes sit at their feet and along the bumpers,
// grass tufts are sprinkled everywhere. Every model is drawn as one instanced mesh for all islands,
// so hundreds of plants cost only a few draw calls.

const TREES = ['Tree_1_A', 'Tree_1_B', 'Tree_2_A', 'Tree_2_B', 'Tree_3_A', 'Tree_3_B', 'Tree_4_A', 'Tree_4_B'];
/** Big trees, used only far from the lane. */
const BIG_TREES = ['Tree_1_C', 'Tree_2_C'];
const BUSHES = ['Bush_1_B', 'Bush_1_C', 'Bush_1_E', 'Bush_2_A', 'Bush_2_B', 'Bush_3_A', 'Bush_3_B', 'Bush_4_A', 'Bush_4_B', 'Bush_4_D'];
const GRASS = ['Grass_1_B', 'Grass_1_C', 'Grass_2_B', 'Grass_2_C'];

export type Forest = { geometries: Map<string, THREE.BufferGeometry>; material: THREE.MeshStandardMaterial };

export async function loadForest(): Promise<Forest> {
  const loader = new GLTFLoader();
  const names = [...TREES, ...BIG_TREES, ...BUSHES, ...GRASS];
  const geometries = new Map<string, THREE.BufferGeometry>();
  let material: THREE.MeshStandardMaterial | null = null;
  await Promise.all(
    names.map(async (name) => {
      const gltf = await loader.loadAsync(`/host/assets/forest/${name}_Color1.gltf`);
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        geometries.set(name, o.geometry);
        // All models share one small colour atlas, so one material serves them all.
        material ??= o.material as THREE.MeshStandardMaterial;
      });
    }),
  );
  const shared = material! as THREE.MeshStandardMaterial;
  const [r, g, b] = TUNING.vegetation.tint;
  shared.color.setRGB(r, g, b);
  shared.roughness = 0.85;
  return { geometries, material: shared };
}

/** Collects where every plant goes, then makes one instanced mesh per model. */
export class Planter {
  private readonly spots = new Map<string, THREE.Matrix4[]>();

  constructor(private readonly forest: Forest) {}

  add(name: string, position: THREE.Vector3, yaw: number, scale: number): void {
    const m = new THREE.Matrix4().compose(
      position,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(scale, scale, scale),
    );
    if (!this.spots.has(name)) this.spots.set(name, []);
    this.spots.get(name)!.push(m);
  }

  build(): THREE.InstancedMesh[] {
    return [...this.spots].map(([name, matrices]) => {
      const mesh = new THREE.InstancedMesh(this.forest.geometries.get(name)!, this.forest.material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.computeBoundingSphere();
      // Grass tufts are too small to need shadows of their own.
      mesh.castShadow = !name.startsWith('Grass');
      mesh.receiveShadow = true;
      return mesh;
    });
  }
}

export type IslandInfo = {
  hole: BuiltHole;
  centre: THREE.Vector3;
  radius: THREE.Vector2;
  /** 0 at the island's centre, 1 at the edge of its grassy top. */
  reach: (x: number, z: number) => number;
  /** Height of the island ground. */
  groundAt: (x: number, z: number) => number;
};

/** Plants groves of trees, bushes and grass on one island, keeping the lane and the camera's view free. */
export function plantIsland(planter: Planter, island: IslandInfo, random: () => number): void {
  const v = TUNING.vegetation;
  const { hole, centre, radius, reach, groundAt } = island;
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];
  const range = ([a, b]: readonly number[], t = random()): number => a + (b - a) * t;
  /** Distance from the foot of the bumpers' slope (negative = on the bumpers or the lane). */
  const gap = (x: number, z: number): number => {
    const n = hole.lane.nearest(x, z);
    return n.distance - n.width - hole.lane.outerEdge;
  };
  // The camera stands behind the tee at the start of every turn; keep that view open.
  const forward = new THREE.Vector2(Math.sin(hole.teeYaw), Math.cos(hole.teeYaw));
  const tee = new THREE.Vector2(hole.tee.x, hole.tee.z);
  const behind = tee.clone().addScaledVector(forward, -TUNING.camera.aimDistance - 1);
  const nearTeeView = (x: number, z: number): boolean => {
    const p = new THREE.Vector2(x, z);
    const seg = behind.clone().sub(tee);
    const t = THREE.MathUtils.clamp(p.clone().sub(tee).dot(seg) / seg.lengthSq(), 0, 1);
    return p.distanceTo(tee.clone().addScaledVector(seg, t)) < v.teeClearance;
  };
  const randomSpot = (maxReach: number): THREE.Vector2 | null => {
    for (let k = 0; k < 40; k++) {
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * maxReach;
      const x = centre.x + Math.cos(angle) * radius.x * r;
      const z = centre.z + Math.sin(angle) * radius.y * r;
      if (reach(x, z) < maxReach) return new THREE.Vector2(x, z);
    }
    return null;
  };
  const place = (name: string, x: number, z: number, scale: number): void => {
    planter.add(name, new THREE.Vector3(x, groundAt(x, z) - 0.02, z), random() * Math.PI * 2, scale);
  };

  // Groves: a few clearings away from the lane where the trees gather.
  const groves: THREE.Vector2[] = [];
  for (let k = 0; k < 200 && groves.length < v.grovesPerIsland; k++) {
    const spot = randomSpot(v.maxReach);
    if (spot && gap(spot.x, spot.y) > v.treeGap + 0.8 && !nearTeeView(spot.x, spot.y)) groves.push(spot);
  }

  const trees: THREE.Vector2[] = [];
  for (let k = 0; k < v.treesPerIsland * 30 && trees.length < v.treesPerIsland && groves.length > 0; k++) {
    const grove = pick(groves);
    const angle = random() * Math.PI * 2;
    const spread = 0.5 + random() * 2.6;
    const x = grove.x + Math.cos(angle) * spread;
    const z = grove.y + Math.sin(angle) * spread;
    const g = gap(x, z);
    if (g < v.treeGap || reach(x, z) > v.maxReach || nearTeeView(x, z)) continue;
    if (trees.some((t) => t.distanceTo(new THREE.Vector2(x, z)) < 1.3)) continue;
    // Small trees close to the lane, bigger ones further away.
    const far = THREE.MathUtils.smoothstep(g, v.treeGap, v.treeGap + 4);
    const name = far > 0.7 && random() < 0.3 ? pick(BIG_TREES) : pick(TREES);
    place(name, x, z, range(v.treeScale, far * 0.7 + random() * 0.3));
    trees.push(new THREE.Vector2(x, z));
  }

  // Bushes: half at the feet of trees, half along the bumpers.
  const bushes: THREE.Vector2[] = [];
  for (let k = 0; k < v.bushesPerIsland * 30 && bushes.length < v.bushesPerIsland; k++) {
    let x: number;
    let z: number;
    if (k % 2 === 0 && trees.length > 0) {
      const tree = pick(trees);
      const angle = random() * Math.PI * 2;
      const d = 0.6 + random() * 1.0;
      x = tree.x + Math.cos(angle) * d;
      z = tree.y + Math.sin(angle) * d;
    } else {
      const spot = randomSpot(v.maxReach + 0.04);
      if (!spot) continue;
      [x, z] = [spot.x, spot.y];
      if (gap(x, z) > v.bushGap + 1.4) continue;
    }
    if (gap(x, z) < v.bushGap || reach(x, z) > v.maxReach + 0.04 || nearTeeView(x, z)) continue;
    if (bushes.some((b) => b.distanceTo(new THREE.Vector2(x, z)) < 0.5)) continue;
    place(pick(BUSHES), x, z, range(v.bushScale));
    bushes.push(new THREE.Vector2(x, z));
  }

  // Grass tufts everywhere on the grass, a bit thicker around trees and bushes.
  const grassReach = TUNING.scenery.grassReach - 0.03;
  const hosts = [...trees, ...bushes];
  for (let placed = 0, k = 0; k < v.grassPerIsland * 10 && placed < v.grassPerIsland; k++) {
    let x: number;
    let z: number;
    if (k % 3 === 0 && hosts.length > 0) {
      const host = pick(hosts);
      const angle = random() * Math.PI * 2;
      const d = 0.3 + random() * 1.2;
      x = host.x + Math.cos(angle) * d;
      z = host.y + Math.sin(angle) * d;
    } else {
      const spot = randomSpot(grassReach);
      if (!spot) continue;
      [x, z] = [spot.x, spot.y];
    }
    if (gap(x, z) < 0.05 || reach(x, z) > grassReach) continue;
    place(pick(GRASS), x, z, range(v.grassScale));
    placed++;
  }
}
