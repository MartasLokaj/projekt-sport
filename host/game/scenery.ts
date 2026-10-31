import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';
import { grassMaterial, type BuiltHole } from './course.ts';
import { plantIsland, Planter, type Forest } from './vegetation.ts';

// The world around the course: a sunny sky with puffy clouds, a cute sea with rolling waves,
// sparkles and foam, and a grassy island with a sandy beach under every hole, so from one hole
// you can see the others across the water.

export type IslandShape = { centre: THREE.Vector2; radius: THREE.Vector2 };

export class Scenery {
  readonly group = new THREE.Group();
  private readonly sky: THREE.Mesh;
  private readonly sea: THREE.Mesh;
  private readonly seaMaterial: THREE.ShaderMaterial;
  private readonly clouds: { cloud: THREE.Group; speed: number; minX: number; maxX: number }[] = [];
  private readonly planter: Planter;

  /** Direction towards the sun (unit vector). The game puts its sunlight here too. */
  static sunDirection(): THREE.Vector3 {
    const c = TUNING.scenery;
    const elevation = THREE.MathUtils.degToRad(c.sunElevation);
    const azimuth = THREE.MathUtils.degToRad(c.sunAzimuth);
    return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
  }

  constructor(holes: BuiltHole[], forest: Forest) {
    const random = seededRandom(TUNING.scenery.seed);
    this.planter = new Planter(forest);
    const islands = holes.map((hole) => this.addIsland(hole, random));
    this.group.add(...this.planter.build());
    this.sky = makeSky();
    this.seaMaterial = makeSeaMaterial(islands);
    const centre = new THREE.Vector3();
    holes.forEach((h) => centre.add(h.tee));
    centre.divideScalar(holes.length);
    const c = TUNING.scenery;
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(c.seaSize, c.seaSize, c.seaDetail, c.seaDetail), this.seaMaterial);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.set(centre.x, c.seaLevel, centre.z);
    this.group.add(this.sky, this.sea);
    this.addClouds(centre, random);
  }

  /** Call every frame: the sky follows the camera, waves roll, clouds drift. */
  update(dt: number, camera: THREE.Camera): void {
    this.sky.position.copy(camera.position);
    this.seaMaterial.uniforms.time.value += dt;
    for (const c of this.clouds) {
      c.cloud.position.x += c.speed * dt;
      if (c.cloud.position.x > c.maxX) c.cloud.position.x = c.minX;
    }
  }

  /**
   * An island under a hole: grassy on top, a sandy beach sloping into the sea. Around the course the
   * ground follows the lane's height (so the hill on hole 2 is a real grassy hill) and lies just
   * below the turf, so the course sits in the island instead of on top of it.
   */
  private addIsland(hole: BuiltHole, random: () => number): IslandShape {
    const c = TUNING.scenery;
    const box = hole.lane.bounds.clone().expandByScalar(c.islandMargin);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = new THREE.Vector2(size.x / 2, size.z / 2).multiplyScalar(1.12);
    const top = hole.lane.lowest - c.groundDepth;
    const wobble = [random() * 6, random() * 6, random() * 6];
    /** 0 at the centre, 1 at the edge of the grassy top (with a wobbly, natural outline). */
    const reach = (x: number, z: number): number => {
      const dx = (x - centre.x) / radius.x;
      const dz = (z - centre.z) / radius.y;
      const angle = Math.atan2(dz, dx);
      const edge = 1 + 0.07 * Math.sin(angle * 3 + wobble[0]) + 0.05 * Math.sin(angle * 5 + wobble[1]) + 0.03 * Math.sin(angle * 9 + wobble[2]);
      return Math.hypot(dx, dz) / edge;
    };

    const cell = c.islandCell;
    const extent = 1.4;
    const nx = Math.ceil((radius.x * 2 * extent) / cell);
    const nz = Math.ceil((radius.y * 2 * extent) / cell);
    const x0 = centre.x - radius.x * extent;
    const z0 = centre.z - radius.y * extent;
    const positions: number[] = [];
    const uvs: number[] = [];
    const reaches: number[] = [];
    const bumpers = hole.lane.outerEdge;
    // A few soft grassy hills, placed away from the course (so they never block the view along the lane).
    const hills: { x: number; z: number; size: number; height: number }[] = [];
    for (let attempt = 0; attempt < 200 && hills.length < c.hillsPerIsland; attempt++) {
      const angle = random() * Math.PI * 2;
      const r = 0.35 + random() * 0.45;
      const x = centre.x + Math.cos(angle) * radius.x * r;
      const z = centre.z + Math.sin(angle) * radius.y * r;
      const spot = hole.lane.nearest(x, z);
      if (spot.distance - spot.width < c.hillClearance + 0.5) continue;
      hills.push({ x, z, size: c.hillSize[0] + random() * (c.hillSize[1] - c.hillSize[0]), height: c.hillHeight[0] + random() * (c.hillHeight[1] - c.hillHeight[0]) });
    }
    const groundAt = (x: number, z: number): number => {
      const r = reach(x, z);
      // Flat top, gentle beach down into the sea, small natural bumps on the grass.
      let y = THREE.MathUtils.lerp(top, c.seaLevel - 0.9, THREE.MathUtils.smoothstep(r, 0.9, 1.35));
      y += Math.sin(x * 0.9 + wobble[0]) * Math.sin(z * 0.7 + wobble[1]) * 0.06 * (1 - THREE.MathUtils.smoothstep(r, 0.6, 0.95));
      // Near the course the ground follows the lane (on a hill too); the bumpers' slopes sink into it.
      const spot = hole.lane.nearest(x, z);
      const fromEdge = spot.distance - spot.width;
      // The hills: round bumps that fade out towards the course and towards the beach.
      const away = THREE.MathUtils.smoothstep(fromEdge, c.hillClearance - 1.3, c.hillClearance) * (1 - THREE.MathUtils.smoothstep(r, 0.75, 0.95));
      for (const h of hills) {
        const d2 = ((x - h.x) ** 2 + (z - h.z) ** 2) / (h.size * h.size);
        if (d2 < 4) y += h.height * Math.exp(-d2 * 1.6) * away;
      }
      const blend = THREE.MathUtils.smoothstep(-fromEdge, -(bumpers + 1.6), -bumpers * 0.6);
      y = THREE.MathUtils.lerp(y, Math.max(y, spot.height - c.groundDepth), blend);
      // Under a jump the ground dips into a pond (the sea shows there), widening away from the lane.
      for (const gap of hole.lane.gaps) {
        const half = (gap.to - gap.from) / 2;
        const sideways = Math.max(0, fromEdge);
        const reachAlong = half + c.pondSpread * Math.sqrt(sideways);
        const along = Math.abs(spot.along - (gap.from + gap.to) / 2);
        const pond = (1 - THREE.MathUtils.smoothstep(along, reachAlong - c.pondSlope, reachAlong)) * (1 - THREE.MathUtils.smoothstep(fromEdge, c.pondWidth - 1, c.pondWidth));
        y = THREE.MathUtils.lerp(y, c.seaLevel - c.pondDepth, pond);
      }
      return y;
    };
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i * cell;
        const z = z0 + j * cell;
        const r = reach(x, z);
        const y = groundAt(x, z);
        positions.push(x, y, z);
        uvs.push(x, z); // scaled per material below
        reaches.push(r);
      }
    }
    const indices: number[] = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const cc = a + nx + 1;
        const d = cc + 1;
        if ((reaches[a] + reaches[b] + reaches[cc] + reaches[d]) / 4 > 1.38) continue;
        indices.push(a, cc, b, b, cc, d);
      }
    }
    // Grass where the island is high, fading softly into sand on the beach (with a wobbly line).
    const sandiness = reaches.map((r, k) => {
      const wiggle = Math.sin(positions[k * 3] * 1.7) * Math.sin(positions[k * 3 + 2] * 1.3) * 0.025;
      return THREE.MathUtils.smoothstep(r + wiggle, c.grassReach - 0.03, c.grassReach + 0.04);
    });
    // Patches of lighter and darker grass, like a meadow: 0 = darkest, 1 = lightest.
    const phase = [random() * 9, random() * 9, random() * 9, random() * 9];
    const meadow = reaches.map((_, k) => {
      const x = positions[k * 3] / c.meadowPatchSize;
      const z = positions[k * 3 + 2] / c.meadowPatchSize;
      const n =
        0.5 +
        0.3 * Math.sin(x * 1.3 + phase[0]) * Math.sin(z * 1.1 + phase[1]) +
        0.2 * Math.sin((x - z) * 2.1 + phase[2]) * Math.sin((x + z) * 1.7 + phase[3]);
      return THREE.MathUtils.smoothstep(n, 0.3, 0.7);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.map((v) => v / c.islandTextureSize), 2));
    geometry.setAttribute('sandiness', new THREE.Float32BufferAttribute(sandiness, 1));
    geometry.setAttribute('meadow', new THREE.Float32BufferAttribute(meadow, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const island = new THREE.Mesh(geometry, islandMaterial());
    island.receiveShadow = true;
    this.group.add(island);
    this.addRocks(hole, centre, radius, reach, top, random);
    this.addBoulders(hole, centre, radius, reach, groundAt, random);
    plantIsland(this.planter, { hole, centre, radius, reach, groundAt }, random);
    return { centre: new THREE.Vector2(centre.x, centre.z), radius: radius.clone().multiplyScalar(1.02) };
  }

  /** A few smooth rocks on the beach. */
  private addRocks(
    hole: BuiltHole,
    centre: THREE.Vector3,
    radius: THREE.Vector2,
    reach: (x: number, z: number) => number,
    top: number,
    random: () => number,
  ): void {
    const count = TUNING.scenery.rocksPerIsland;
    const rocks = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
      count,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let placed = 0;
    for (let attempt = 0; attempt < count * 30 && placed < count; attempt++) {
      const angle = random() * Math.PI * 2;
      const x = centre.x + Math.cos(angle) * radius.x * (0.85 + random() * 0.15);
      const z = centre.z + Math.sin(angle) * radius.y * (0.85 + random() * 0.15);
      const spot = hole.lane.nearest(x, z);
      if (spot.distance - spot.width < hole.lane.outerEdge + 0.6) continue;
      const r = reach(x, z);
      if (r > 1.05) continue;
      const size = 0.12 + random() * 0.3;
      q.setFromEuler(new THREE.Euler(random(), random() * 3, random()));
      m.compose(new THREE.Vector3(x, top + size * 0.2, z), q, new THREE.Vector3(size * 1.3, size * 0.8, size));
      rocks.setMatrixAt(placed, m);
      rocks.setColorAt(placed, new THREE.Color().setHSL(0.08, 0.12, 0.62 + random() * 0.15));
      placed++;
    }
    rocks.count = placed;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.group.add(rocks);
  }

  /**
   * Grey, chunky low-poly boulders lying in the grass in little groups (one big stone with a couple of
   * small ones), now and then, away from the course.
   */
  private addBoulders(
    hole: BuiltHole,
    centre: THREE.Vector3,
    radius: THREE.Vector2,
    reach: (x: number, z: number) => number,
    groundAt: (x: number, z: number) => number,
    random: () => number,
  ): void {
    const c = TUNING.scenery;
    const shapes = [0, 1, 2].map(() => boulderGeometry(random));
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
    const meshes = shapes.map((shape) => new THREE.InstancedMesh(shape, material, c.boulderGroups * 3));
    const counts = [0, 0, 0];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const add = (x: number, z: number, size: number): void => {
      const k = Math.floor(random() * shapes.length);
      q.setFromEuler(new THREE.Euler(random() * 0.4, random() * Math.PI * 2, random() * 0.4));
      m.compose(new THREE.Vector3(x, groundAt(x, z) + size * 0.15, z), q, new THREE.Vector3(size * (1 + random() * 0.4), size * (0.7 + random() * 0.3), size));
      meshes[k].setMatrixAt(counts[k], m);
      meshes[k].setColorAt(counts[k], new THREE.Color().setHSL(0.6, 0.04, 0.55 + random() * 0.15));
      counts[k]++;
    };
    let groups = 0;
    for (let attempt = 0; attempt < 300 && groups < c.boulderGroups; attempt++) {
      const angle = random() * Math.PI * 2;
      const r = 0.25 + random() * 0.6;
      const x = centre.x + Math.cos(angle) * radius.x * r;
      const z = centre.z + Math.sin(angle) * radius.y * r;
      const spot = hole.lane.nearest(x, z);
      if (spot.distance - spot.width < hole.lane.outerEdge + c.boulderClearance || reach(x, z) > 0.85) continue;
      const big = c.boulderSize[0] + random() * (c.boulderSize[1] - c.boulderSize[0]);
      add(x, z, big);
      // A couple of small stones next to the big one.
      const small = 1 + Math.floor(random() * 2);
      for (let s = 0; s < small; s++) {
        const a = random() * Math.PI * 2;
        add(x + Math.cos(a) * big * 1.3, z + Math.sin(a) * big * 1.3, big * (0.3 + random() * 0.25));
      }
      groups++;
    }
    meshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    });
  }

  /** Puffy cotton-ball clouds around the horizon, drifting slowly. */
  private addClouds(centre: THREE.Vector3, random: () => number): void {
    const c = TUNING.scenery;
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#eaf4ff',
      emissiveIntensity: 0.45,
      roughness: 1,
      fog: false,
    });
    const puff = new THREE.IcosahedronGeometry(1, 3);
    for (let i = 0; i < c.clouds; i++) {
      const cloud = new THREE.Group();
      const width = 3 + Math.floor(random() * 3);
      // A row of big puffs at the bottom (flattened underneath) and smaller ones heaped on top.
      for (let k = 0; k < width; k++) {
        const size = 2.2 + random() * 1.4;
        const mesh = new THREE.Mesh(puff, material);
        mesh.scale.set(size, size * 0.75, size);
        mesh.position.set((k - (width - 1) / 2) * 2.6, 0, random() * 1.2);
        cloud.add(mesh);
      }
      for (let k = 0; k < width - 1; k++) {
        const size = 1.8 + random() * 1.4;
        const mesh = new THREE.Mesh(puff, material);
        mesh.scale.setScalar(size);
        mesh.position.set((k - (width - 2) / 2) * 2.4 + random(), 1.8 + random() * 1.2, random());
        cloud.add(mesh);
      }
      const angle = random() * Math.PI * 2;
      const distance = 70 + random() * 55;
      cloud.position.set(centre.x + Math.cos(angle) * distance, 14 + random() * 22, centre.z + Math.sin(angle) * distance);
      cloud.lookAt(centre.x, cloud.position.y, centre.z);
      cloud.scale.setScalar(0.9 + random() * 0.8);
      this.clouds.push({ cloud, speed: 0.4 + random() * 0.6, minX: centre.x - 140, maxX: centre.x + 140 });
      this.group.add(cloud);
    }
  }
}

/** A dome with a soft gradient and a bright sun with a warm glow around it. */
function makeSky(): THREE.Mesh {
  const c = TUNING.scenery;
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(c.skyTop) },
      horizon: { value: new THREE.Color(c.skyHorizon) },
      sunColour: { value: new THREE.Color(c.sunColour) },
      sunDirection: { value: Scenery.sunDirection() },
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
      uniform vec3 sunColour;
      uniform vec3 sunDirection;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float t = pow(clamp(direction.y, 0.0, 1.0), 0.5);
        vec3 colour = mix(horizon, top, t);
        float towardsSun = max(dot(direction, sunDirection), 0.0);
        colour += sunColour * (smoothstep(0.9993, 0.9996, towardsSun) * 5.0 + pow(towardsSun, 60.0) * 0.35 + pow(towardsSun, 8.0) * 0.06);
        gl_FragColor = vec4(colour, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

/**
 * The sea: a few overlapping rounded waves move the surface; the colour goes from turquoise
 * near the islands to deep blue; the sun sparkles on the waves; white foam rings the beaches
 * and tops the highest waves.
 */
/** The sea shader knows where this many islands are (for the turquoise shallows and the foam). */
const MAX_ISLANDS = 12;

function makeSeaMaterial(islands: IslandShape[]): THREE.ShaderMaterial {
  const c = TUNING.scenery;
  const islandData = islands.slice(0, MAX_ISLANDS).map((i) => new THREE.Vector4(i.centre.x, i.centre.y, i.radius.x, i.radius.y));
  while (islandData.length < MAX_ISLANDS) islandData.push(new THREE.Vector4(1e5, 1e5, 1, 1));
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      deep: { value: new THREE.Color(c.seaDeep) },
      shallow: { value: new THREE.Color(c.seaShallow) },
      foam: { value: new THREE.Color('#ffffff') },
      sky: { value: new THREE.Color(c.skyHorizon) },
      sunDirection: { value: Scenery.sunDirection() },
      sunColour: { value: new THREE.Color(c.sunColour) },
      islands: { value: islandData },
      waveHeight: { value: c.waveHeight },
      waveSpeed: { value: c.waveSpeed },
      fogColour: { value: new THREE.Color(c.skyHorizon) },
      fogNear: { value: c.fogNear },
      fogFar: { value: c.fogFar },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      uniform float waveHeight;
      uniform float waveSpeed;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vCrest;

      // One rounded wave: height and its slope along x and z.
      vec3 wave(vec2 p, vec2 direction, float length, float speed, float amount) {
        float k = 6.2831 / length;
        float phase = dot(direction, p) * k + time * speed * waveSpeed;
        float h = sin(phase) * amount;
        float slope = cos(phase) * amount * k;
        return vec3(h, direction * slope);
      }

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec2 p = world.xz;
        vec3 w = wave(p, normalize(vec2(1.0, 0.35)), 9.0, 1.1, 1.0)
               + wave(p, normalize(vec2(-0.4, 1.0)), 6.0, 1.4, 0.6)
               + wave(p, normalize(vec2(0.8, -0.7)), 3.7, 1.9, 0.35)
               + wave(p, normalize(vec2(-1.0, -0.2)), 2.3, 2.4, 0.18);
        w *= waveHeight;
        world.y += w.x;
        vWorld = world.xyz;
        vNormal = normalize(vec3(-w.y, 1.0, -w.z));
        vCrest = w.x / (waveHeight * 2.1);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 deep;
      uniform vec3 shallow;
      uniform vec3 foam;
      uniform vec3 sky;
      uniform vec3 sunDirection;
      uniform vec3 sunColour;
      uniform vec4 islands[${MAX_ISLANDS}];
      uniform vec3 fogColour;
      uniform float fogNear;
      uniform float fogFar;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vCrest;

      void main() {
        // How close we are to an island's shore (1 = at the beach edge), and the angle around it.
        float shore = 10.0;
        float around = 0.0;
        for (int i = 0; i < ${MAX_ISLANDS}; i++) {
          vec2 d = (vWorld.xz - islands[i].xy) / islands[i].zw;
          float distanceToShore = length(d);
          if (distanceToShore < shore) { shore = distanceToShore; around = atan(d.y, d.x); }
        }

        vec3 normal = normalize(vNormal);
        vec3 toCamera = normalize(cameraPosition - vWorld);
        float near = smoothstep(1.9, 1.15, shore);
        vec3 colour = mix(deep, shallow, near * 0.85);

        // Sky reflected at grazing angles, and sparkles where the sun glints off the waves.
        float fresnel = pow(1.0 - max(dot(normal, toCamera), 0.0), 4.0);
        colour = mix(colour, sky, fresnel * 0.35);
        float glint = pow(max(dot(reflect(-sunDirection, normal), toCamera), 0.0), 180.0);
        colour += sunColour * glint * 1.6;

        // Foam: a wobbly ring hugging each beach, and little white caps on the highest waves.
        float ring = 1.17 + 0.035 * sin(around * 7.0 + time * 1.3) + 0.02 * sin(time * 2.1 + around * 3.0);
        // (no foam well inside an island: that is a calm pond under a jump)
        float beachFoam = (smoothstep(0.06, 0.0, abs(shore - ring)) + smoothstep(1.24, 1.12, shore) * 0.6) * smoothstep(0.9, 1.05, shore);
        float caps = smoothstep(0.78, 0.95, vCrest) * 0.7;
        colour = mix(colour, foam, clamp(beachFoam + caps, 0.0, 1.0) * 0.9);

        float fog = smoothstep(fogNear, fogFar, distance(cameraPosition, vWorld));
        gl_FragColor = vec4(mix(colour, fogColour, fog), 1.0);
      }`,
  });
}

let islandMaterialCache: THREE.MeshStandardMaterial | null = null;

/**
 * Island ground: the grass texture, blended into sand where the "sandiness" of the ground says so.
 * (A small change to three.js's standard material: after it reads the grass colour, mix in sand.)
 */
function islandMaterial(): THREE.MeshStandardMaterial {
  if (islandMaterialCache) return islandMaterialCache;
  const c = TUNING.scenery;
  const material = grassMaterial(c.islandGrassTint, 0.7);
  const sand = sandTexture();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sandMap = { value: sand };
    shader.uniforms.sandColour = { value: new THREE.Color(c.sand) };
    shader.uniforms.meadowDark = { value: new THREE.Vector3(...c.meadowDark) };
    shader.uniforms.meadowLight = { value: new THREE.Vector3(...c.meadowLight) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sandiness;\nattribute float meadow;\nvarying float vSandiness;\nvarying float vMeadow;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSandiness = sandiness;\nvMeadow = meadow;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D sandMap;\nuniform vec3 sandColour;\nuniform vec3 meadowDark;\nuniform vec3 meadowLight;\nvarying float vSandiness;\nvarying float vMeadow;',
      )
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\ndiffuseColor.rgb *= mix(meadowDark, meadowLight, vMeadow);\nvec3 sandSample = sandColour * texture2D(sandMap, vMapUv * 1.3).rgb;\ndiffuseColor.rgb = mix(diffuseColor.rgb, sandSample, vSandiness);',
      );
  };
  islandMaterialCache = material;
  return material;
}

/** A fine, sun-bleached sand texture (generated). */
function sandTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, 256, 256);
  const random = seededRandom(11);
  for (let i = 0; i < 9000; i++) {
    const shade = 150 + Math.floor(random() * 105);
    ctx.fillStyle = `rgba(${shade},${shade - 6},${shade - 18},0.45)`;
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 1.5, 1 + random() * 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A chunky, faceted stone: a rough ball with its corners pushed in and out a little. */
function boulderGeometry(random: () => number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const position = geometry.getAttribute('position');
  // Corners that share a spot must move together, or the stone would crack open.
  const moved = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
    let scale = moved.get(key);
    if (scale === undefined) {
      scale = 0.75 + random() * 0.45;
      moved.set(key, scale);
    }
    position.setXYZ(i, position.getX(i) * scale, position.getY(i) * scale * 0.8, position.getZ(i) * scale);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** The same "random" numbers every time, so the world always looks the same. */
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
