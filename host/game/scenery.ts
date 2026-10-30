import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';
import type { BuiltHole } from './course.ts';

// The world around the course, all built in code: a sunny sky with puffy clouds, a cute sea with
// rolling waves, sparkles and foam, and a little sandy island under every hole, so from one hole
// you can see the others across the water.

export type IslandShape = { centre: THREE.Vector2; radius: THREE.Vector2 };

export class Scenery {
  readonly group = new THREE.Group();
  private readonly sky: THREE.Mesh;
  private readonly sea: THREE.Mesh;
  private readonly seaMaterial: THREE.ShaderMaterial;
  private readonly clouds: { cloud: THREE.Group; speed: number; minX: number; maxX: number }[] = [];

  /** Direction towards the sun (unit vector). The game puts its sunlight here too. */
  static sunDirection(): THREE.Vector3 {
    const c = TUNING.scenery;
    const elevation = THREE.MathUtils.degToRad(c.sunElevation);
    const azimuth = THREE.MathUtils.degToRad(c.sunAzimuth);
    return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
  }

  constructor(holes: BuiltHole[]) {
    const random = seededRandom(TUNING.scenery.seed);
    const islands = holes.map((hole) => this.addIsland(hole, random));
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

  /** A soft sandy island under a hole: flat on top, a gentle beach sloping into the sea. */
  private addIsland(hole: BuiltHole, random: () => number): IslandShape {
    const c = TUNING.scenery;
    const S = TUNING.course.tileSize;
    const box = new THREE.Box3().setFromPoints(hole.footprint).expandByScalar(S * 0.5 + c.islandMargin);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = new THREE.Vector2(size.x / 2, size.z / 2).multiplyScalar(1.15);
    const top = hole.tee.y - c.groundDepth;
    const rings = 28;
    const segments = 96;
    const wobble = [random() * 6, random() * 6, random() * 6];
    const positions: number[] = [];
    const colours: number[] = [];
    const uvs: number[] = [];
    const sand = new THREE.Color(c.sand);
    const wetSand = new THREE.Color(c.wetSand);
    for (let ring = 0; ring <= rings; ring++) {
      const r = (ring / rings) * 1.35; // 0..1 flat top, 1..1.35 the beach
      for (let seg = 0; seg <= segments; seg++) {
        const angle = (seg / segments) * Math.PI * 2;
        const edge = 1 + 0.07 * Math.sin(angle * 3 + wobble[0]) + 0.05 * Math.sin(angle * 5 + wobble[1]) + 0.03 * Math.sin(angle * 9 + wobble[2]);
        const x = centre.x + Math.cos(angle) * radius.x * r * edge;
        const z = centre.z + Math.sin(angle) * radius.y * r * edge;
        const beach = THREE.MathUtils.smoothstep(r, 0.92, 1.35);
        const y = THREE.MathUtils.lerp(top, c.seaLevel - 0.9, beach);
        positions.push(x, y, z);
        uvs.push(x * 0.35, z * 0.35);
        const colour = sand.clone().lerp(wetSand, THREE.MathUtils.smoothstep(r, 1.0, 1.2));
        colours.push(colour.r, colour.g, colour.b);
      }
    }
    const indices: number[] = [];
    for (let ring = 0; ring < rings; ring++) {
      for (let seg = 0; seg < segments; seg++) {
        const a = ring * (segments + 1) + seg;
        const b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b); // counter-clockwise from above, so the surface faces up
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const island = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: sandTexture() }),
    );
    island.receiveShadow = true;
    this.group.add(island);
    this.addRocks(hole, centre, radius, top, random);
    return { centre: new THREE.Vector2(centre.x, centre.z), radius };
  }

  /** A few smooth pebbles and rocks on the beach. */
  private addRocks(hole: BuiltHole, centre: THREE.Vector3, radius: THREE.Vector2, top: number, random: () => number): void {
    const count = TUNING.scenery.rocksPerIsland;
    const rocks = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
      count,
    );
    const keepOff = TUNING.course.tileSize * 0.75 + 0.5;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let placed = 0;
    for (let attempt = 0; attempt < count * 20 && placed < count; attempt++) {
      const angle = random() * Math.PI * 2;
      const r = 0.55 + random() * 0.5;
      const x = centre.x + Math.cos(angle) * radius.x * r;
      const z = centre.z + Math.sin(angle) * radius.y * r;
      if (hole.footprint.some((t) => Math.max(Math.abs(t.x - x), Math.abs(t.z - z)) < keepOff)) continue;
      const size = 0.12 + random() * 0.3;
      q.setFromEuler(new THREE.Euler(random(), random() * 3, random()));
      m.compose(new THREE.Vector3(x, top + size * 0.3, z), q, new THREE.Vector3(size * 1.3, size * 0.8, size));
      rocks.setMatrixAt(placed, m);
      rocks.setColorAt(placed, new THREE.Color().setHSL(0.08, 0.12, 0.62 + random() * 0.15));
      placed++;
    }
    rocks.count = placed;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.group.add(rocks);
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
function makeSeaMaterial(islands: IslandShape[]): THREE.ShaderMaterial {
  const c = TUNING.scenery;
  const islandData = islands.slice(0, 4).map((i) => new THREE.Vector4(i.centre.x, i.centre.y, i.radius.x, i.radius.y));
  while (islandData.length < 4) islandData.push(new THREE.Vector4(1e5, 1e5, 1, 1));
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
      fogColour: { value: new THREE.Color(c.skyHorizon) },
      fogNear: { value: c.fogNear },
      fogFar: { value: c.fogFar },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      uniform float waveHeight;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vCrest;

      // One rounded wave: height and its slope along x and z.
      vec3 wave(vec2 p, vec2 direction, float length, float speed, float amount) {
        float k = 6.2831 / length;
        float phase = dot(direction, p) * k + time * speed;
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
      uniform vec4 islands[4];
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
        for (int i = 0; i < 4; i++) {
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
        float beachFoam = smoothstep(0.06, 0.0, abs(shore - ring)) + smoothstep(1.24, 1.12, shore) * 0.6;
        float caps = smoothstep(0.78, 0.95, vCrest) * 0.7;
        colour = mix(colour, foam, clamp(beachFoam + caps, 0.0, 1.0) * 0.9);

        float fog = smoothstep(fogNear, fogFar, distance(cameraPosition, vWorld));
        gl_FragColor = vec4(mix(colour, fogColour, fog), 1.0);
      }`,
  });
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
