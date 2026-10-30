import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';
import type { BuiltHole } from './course.ts';

// Everything around the course, all built in code (original look, nothing downloaded):
// a sky with a soft gradient and drifting clouds, a grassy meadow, and around every hole
// trees, bushes, rocks, flowers and a small pond. Repeated things use "instancing"
// (one mesh drawn many times), so it all stays fast.

export class Scenery {
  readonly group = new THREE.Group();
  private readonly sky: THREE.Mesh;
  private readonly clouds: { cloud: THREE.Group; speed: number }[] = [];
  private readonly water: THREE.MeshStandardMaterial[] = [];
  private time = 0;

  constructor(holes: BuiltHole[]) {
    const c = TUNING.scenery;
    this.sky = makeSky();
    this.group.add(this.sky);
    this.group.add(makeMeadow(holes));

    const random = seededRandom(c.seed);
    for (const hole of holes) this.decorate(hole, random);
    this.addClouds(holes, random);
  }

  /** Call every frame: the sky follows the camera, clouds drift, water shimmers. */
  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    this.sky.position.copy(camera.position);
    for (const { cloud, speed } of this.clouds) {
      cloud.position.x += speed * dt;
      if (cloud.position.x > cloud.userData.maxX) cloud.position.x = cloud.userData.minX;
    }
    for (const material of this.water) material.emissiveIntensity = 0.12 + Math.sin(this.time * 1.5) * 0.04;
  }

  private decorate(hole: BuiltHole, random: () => number): void {
    const c = TUNING.scenery;
    const S = TUNING.course.tileSize;
    const box = new THREE.Box3().setFromPoints(hole.footprint).expandByScalar(S * 0.5 + c.decorationMargin);
    const groundY = hole.tee.y - c.groundDepth;
    const keepOff = S * 0.75 + 0.4; // distance from tile centres that is reserved for the course
    const taken: { x: number; z: number; r: number }[] = [];

    /** A random free spot around the hole, at least `radius` from the course and other things. */
    const spot = (radius: number): THREE.Vector3 | null => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = box.min.x + random() * (box.max.x - box.min.x);
        const z = box.min.z + random() * (box.max.z - box.min.z);
        const nearCourse = hole.footprint.some((t) => Math.max(Math.abs(t.x - x), Math.abs(t.z - z)) < keepOff + radius);
        const nearOther = taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + radius);
        if (!nearCourse && !nearOther) {
          taken.push({ x, z, r: radius });
          return new THREE.Vector3(x, groundY, z);
        }
      }
      return null;
    };

    // A pond first, as it needs the most room.
    const pondAt = spot(2.2);
    if (pondAt) this.addPond(pondAt, random);

    const trees: { at: THREE.Vector3; size: number; pine: boolean }[] = [];
    for (let i = 0; i < c.treesPerHole; i++) {
      const size = 0.8 + random() * 0.7;
      const at = spot(0.9 * size);
      if (at) trees.push({ at, size, pine: random() < 0.35 });
    }
    this.group.add(makeTrees(trees, random));

    const bushes: THREE.Vector3[] = [];
    for (let i = 0; i < c.bushesPerHole; i++) {
      const at = spot(0.5);
      if (at) bushes.push(at);
    }
    this.group.add(makeBushes(bushes, random));

    const rocks: THREE.Vector3[] = [];
    for (let i = 0; i < c.rocksPerHole; i++) {
      const at = spot(0.4);
      if (at) rocks.push(at);
    }
    this.group.add(makeRocks(rocks, random));

    const flowers: THREE.Vector3[] = [];
    for (let i = 0; i < c.flowersPerHole; i++) {
      const at = spot(0.12);
      if (at) flowers.push(at);
    }
    this.group.add(makeFlowers(flowers, random));
  }

  private addPond(at: THREE.Vector3, random: () => number): void {
    const material = new THREE.MeshStandardMaterial({
      color: '#4fb6e6',
      emissive: '#7fd4ff',
      emissiveIntensity: 0.12,
      roughness: 0.15,
      metalness: 0.1,
    });
    this.water.push(material);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), material);
    water.rotation.x = -Math.PI / 2;
    water.scale.set(1.6 + random() * 0.6, 1.1 + random() * 0.4, 1);
    water.position.set(at.x, at.y + 0.01, at.z);
    water.receiveShadow = true;
    // A sandy rim around it.
    const rim = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40), new THREE.MeshStandardMaterial({ color: '#e9d8a6', roughness: 1 }));
    rim.rotation.x = -Math.PI / 2;
    rim.scale.copy(water.scale);
    rim.position.set(at.x, at.y + 0.005, at.z);
    rim.receiveShadow = true;
    this.group.add(rim, water);
  }

  private addClouds(holes: BuiltHole[], random: () => number): void {
    const c = TUNING.scenery;
    const minX = holes[0].tee.x - 40;
    const maxX = holes[holes.length - 1].tee.x + 40;
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 1 });
    const puff = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < c.clouds; i++) {
      const cloud = new THREE.Group();
      const puffs = 4 + Math.floor(random() * 4);
      for (let k = 0; k < puffs; k++) {
        const mesh = new THREE.Mesh(puff, material);
        const size = 1.2 + random() * 1.6;
        mesh.scale.set(size * 1.3, size * 0.8, size);
        mesh.position.set((k - puffs / 2) * 1.5 + random(), random() * 0.8, random() * 1.5);
        cloud.add(mesh);
      }
      cloud.position.set(minX + random() * (maxX - minX), 16 + random() * 10, -30 + random() * 70);
      cloud.userData = { minX, maxX };
      this.clouds.push({ cloud, speed: 0.3 + random() * 0.5 });
      this.group.add(cloud);
    }
  }
}

/** A big dome with a soft gradient from deep blue at the top to a pale horizon. */
function makeSky(): THREE.Mesh {
  const c = TUNING.scenery;
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(c.skyTop) },
      horizon: { value: new THREE.Color(c.skyHorizon) },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 horizon;
      varying vec3 vDirection;
      void main() {
        float t = pow(clamp(vDirection.y, 0.0, 1.0), 0.6);
        gl_FragColor = vec4(mix(horizon, top, t), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), material);
  sky.renderOrder = -1;
  return sky;
}

/** One big grassy meadow under all the holes, with a hand-painted look from a small generated texture. */
function makeMeadow(holes: BuiltHole[]): THREE.Mesh {
  const c = TUNING.scenery;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = c.grass;
  ctx.fillRect(0, 0, 256, 256);
  const random = seededRandom(7);
  for (let i = 0; i < 260; i++) {
    // Soft lighter and darker patches, like mown stripes and clover.
    ctx.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(20,60,20,0.06)';
    ctx.beginPath();
    ctx.ellipse(random() * 256, random() * 256, 6 + random() * 22, 4 + random() * 14, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(60, 60);
  texture.colorSpace = THREE.SRGBColorSpace;
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
  meadow.rotation.x = -Math.PI / 2;
  const middle = (holes[0].tee.x + holes[holes.length - 1].tee.x) / 2;
  meadow.position.set(middle, holes[0].tee.y - c.groundDepth, 0);
  meadow.receiveShadow = true;
  return meadow;
}

/** Round leafy trees and pointy pines: trunks and crowns, each kind drawn as one instanced mesh. */
function makeTrees(trees: { at: THREE.Vector3; size: number; pine: boolean }[], random: () => number): THREE.Group {
  const group = new THREE.Group();
  const trunks = instanced(new THREE.CylinderGeometry(0.09, 0.13, 1, 7), '#8a5a3b', trees.length);
  const leafy = trees.filter((t) => !t.pine);
  const pines = trees.filter((t) => t.pine);
  const crowns = instanced(new THREE.IcosahedronGeometry(1, 1), '#ffffff', leafy.length * 2, true);
  const cones = instanced(new THREE.ConeGeometry(1, 1, 8), '#ffffff', pines.length * 2, true);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const leafColours = ['#5fb85a', '#6cc46a', '#4fa65a', '#86c95b'];
  const pineColours = ['#3f8f5a', '#4a9c63', '#357f4e'];

  trees.forEach((t, i) => {
    const trunkHeight = (t.pine ? 0.5 : 0.8) * t.size;
    m.compose(new THREE.Vector3(t.at.x, t.at.y + trunkHeight / 2, t.at.z), q, new THREE.Vector3(t.size, trunkHeight, t.size));
    trunks.setMatrixAt(i, m);
  });
  leafy.forEach((t, i) => {
    for (let k = 0; k < 2; k++) {
      const r = (k === 0 ? 0.75 : 0.5) * t.size;
      const y = t.at.y + 0.8 * t.size + (k === 0 ? r * 0.8 : r * 2.1);
      q.setFromEuler(new THREE.Euler(random(), random(), random()));
      m.compose(new THREE.Vector3(t.at.x + (k ? 0.15 : 0), y, t.at.z), q, new THREE.Vector3(r, r * 0.9, r));
      crowns.setMatrixAt(i * 2 + k, m);
      crowns.setColorAt(i * 2 + k, new THREE.Color(leafColours[Math.floor(random() * leafColours.length)]));
    }
  });
  q.identity();
  pines.forEach((t, i) => {
    for (let k = 0; k < 2; k++) {
      const r = (k === 0 ? 0.65 : 0.45) * t.size;
      const h = (k === 0 ? 1.0 : 0.8) * t.size;
      const y = t.at.y + 0.5 * t.size + (k === 0 ? h / 2 : h * 1.15);
      m.compose(new THREE.Vector3(t.at.x, y, t.at.z), q, new THREE.Vector3(r, h, r));
      cones.setMatrixAt(i * 2 + k, m);
      cones.setColorAt(i * 2 + k, new THREE.Color(pineColours[Math.floor(random() * pineColours.length)]));
    }
  });
  group.add(trunks, crowns, cones);
  return group;
}

function makeBushes(spots: THREE.Vector3[], random: () => number): THREE.InstancedMesh {
  const bushes = instanced(new THREE.IcosahedronGeometry(1, 1), '#ffffff', spots.length * 3, true);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const colours = ['#5bb35b', '#68bf5f', '#4ea85a'];
  spots.forEach((at, i) => {
    for (let k = 0; k < 3; k++) {
      const r = 0.22 + random() * 0.16;
      q.setFromEuler(new THREE.Euler(random(), random(), random()));
      m.compose(new THREE.Vector3(at.x + (k - 1) * 0.22, at.y + r * 0.7, at.z + (random() - 0.5) * 0.2), q, new THREE.Vector3(r, r * 0.85, r));
      bushes.setMatrixAt(i * 3 + k, m);
      bushes.setColorAt(i * 3 + k, new THREE.Color(colours[Math.floor(random() * colours.length)]));
    }
  });
  return bushes;
}

function makeRocks(spots: THREE.Vector3[], random: () => number): THREE.InstancedMesh {
  const rocks = instanced(new THREE.DodecahedronGeometry(1, 0), '#ffffff', spots.length, true);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((at, i) => {
    const r = 0.15 + random() * 0.25;
    q.setFromEuler(new THREE.Euler(random(), random() * 3, random()));
    m.compose(new THREE.Vector3(at.x, at.y + r * 0.35, at.z), q, new THREE.Vector3(r * 1.3, r * 0.75, r));
    rocks.setMatrixAt(i, m);
    rocks.setColorAt(i, new THREE.Color().setHSL(0.6, 0.06, 0.62 + random() * 0.12));
  });
  return rocks;
}

/** Little flowers: a bright blossom on a short green stem. */
function makeFlowers(spots: THREE.Vector3[], random: () => number): THREE.Group {
  const group = new THREE.Group();
  const stems = instanced(new THREE.CylinderGeometry(0.008, 0.008, 1, 4), '#4f9b45', spots.length);
  const blossoms = instanced(new THREE.IcosahedronGeometry(1, 0), '#ffffff', spots.length);
  blossoms.castShadow = false;
  const colours = ['#ff6b8a', '#ffd23f', '#ffffff', '#b98cff', '#ff9f43'];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((at, i) => {
    const height = 0.1 + random() * 0.08;
    m.compose(new THREE.Vector3(at.x, at.y + height / 2, at.z), q, new THREE.Vector3(1, height, 1));
    stems.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(at.x, at.y + height, at.z), q, new THREE.Vector3(0.04, 0.03, 0.04));
    blossoms.setMatrixAt(i, m);
    blossoms.setColorAt(i, new THREE.Color(colours[Math.floor(random() * colours.length)]));
  });
  group.add(stems, blossoms);
  return group;
}

function instanced(geometry: THREE.BufferGeometry, colour: string, count: number, flat = false): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85, flatShading: flat }),
    Math.max(1, count),
  );
  mesh.count = count;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The same "random" numbers every time, so the scenery always looks the same. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
