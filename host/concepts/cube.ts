import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Character } from '../game/character.ts';
import { loadForest, type Forest } from '../game/vegetation.ts';

// Quick visual concepts for the Cube World hub (SPEC section 12), so the user can pick a direction.
// Three looks, chosen with ?v=sky | space | sunset. Throwaway prototype code, not the real hub.

type Variant = 'sky' | 'space' | 'sunset';
const variant = (new URLSearchParams(location.search).get('v') ?? 'sky') as Variant;
const LOOKS = {
  sky: {
    title: 'A · Dreamy sky — grassy block',
    top: '#2f8fe8', bottom: '#cfeaff', body: '#c99a63', edge: '#7fd35b', light: '#fff4dc', exposure: 1.0, bloom: 0.25,
  },
  space: {
    title: 'B · Starry space — toy planet',
    top: '#0b0f2e', bottom: '#3a1f5c', body: '#b9a6ff', edge: '#7ff3ff', light: '#e6e4ff', exposure: 1.05, bloom: 0.55,
  },
  sunset: {
    title: 'C · Sunset above the clouds — golden cube',
    top: '#7a5bd0', bottom: '#ff9f6b', body: '#fff4e0', edge: '#ffc35c', light: '#ffd9a8', exposure: 1.0, bloom: 0.35,
  },
}[variant];
document.getElementById('tag')!.textContent = LOOKS.title;

const SIZE = 6;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LOOKS.exposure;
document.getElementById('view')!.appendChild(renderer.domElement);

let stars: THREE.Points | null = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
camera.position.set(10.5, 9.5, 18.5);
camera.lookAt(0, 0.3, 0);

scene.add(makeBackdrop());
scene.add(new THREE.HemisphereLight(LOOKS.top, LOOKS.bottom, 1.1));
const sun = new THREE.DirectionalLight(LOOKS.light, 2.6);
sun.position.set(8, 14, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), LOOKS.bloom, 0.6, 0.85));
composer.addPass(new OutputPass());

const loader = new GLTFLoader();
const [windmill, flag, forest] = await Promise.all([
  loader.loadAsync('/host/assets/minigolf/windmill.glb'),
  loader.loadAsync('/host/assets/minigolf/flag-red.glb'),
  loadForest(),
]);

const front = new THREE.Vector3(0, 0, 1);
const top = new THREE.Vector3(0, 1, 0);
const right = new THREE.Vector3(1, 0, 0);

// The planet: one rounded cube, and a little world on each face.
const planet = new THREE.Group();
scene.add(planet);
const body = new THREE.Mesh(
  new RoundedBoxGeometry(SIZE, SIZE, SIZE, 6, 0.7),
  new THREE.MeshStandardMaterial({ color: LOOKS.body, roughness: variant === 'space' ? 0.35 : 0.8 }),
);
body.receiveShadow = true;
planet.add(body);
if (variant === 'sky') {
  // A grassy cap on every face, like a chunk of meadow cut out of the ground.
  for (const n of FACES()) {
    const cap = new THREE.Mesh(new RoundedBoxGeometry(SIZE + 0.08, 0.5, SIZE + 0.08, 4, 0.22), mat(LOOKS.edge, 0.9));
    onFace(cap, n, -0.2);
    cap.receiveShadow = true;
    planet.add(cap);
  }
}
if (variant === 'space') {
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(LOOKS.edge), transparent: true, depthWrite: false, opacity: 0.55 }));
  halo.scale.setScalar(SIZE * 3);
  halo.renderOrder = -1;
  scene.add(halo);
}

planet.add(onFace(minigolfWorld(), front));
planet.add(onFace(badmintonWorld(), right));
planet.add(onFace(constructionWorld(1), top));
planet.add(onFace(constructionWorld(2), new THREE.Vector3(-1, 0, 0)));
planet.add(onFace(constructionWorld(3), new THREE.Vector3(0, 0, -1)));

// Players who joined stand on top, waving.
const characters = [
  { shirt: '#2a6fdb', skin: '#8d5524' },
  { shirt: '#e2483d', skin: '#f1c27d' },
  { shirt: '#f2b632', skin: '#c68642' },
].map((look, i) => {
  const c = new Character({ ...look, handedness: 'right' });
  c.root.scale.setScalar(1.1);
  c.place(new THREE.Vector3(-1.5 + i * 1.1, SIZE / 2 + 0.2, 2.0), 0.25 - i * 0.2);
  c.root.traverse((o) => (o.castShadow = true));
  planet.add(c.root);
  return c;
});

function resize(): void {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let t = 0;
let nextWave = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  planet.rotation.y = Math.sin(t * 0.25) * 0.18;
  planet.position.y = Math.sin(t * 0.8) * 0.15;
  if (t > nextWave) {
    characters[Math.floor(Math.random() * characters.length)].play('cheer');
    nextWave = t + 1.2;
  }
  characters.forEach((c) => c.update(dt));
  stars?.rotateY(dt * 0.01);
  composer.render();
});
(window as unknown as { concept: unknown }).concept = { scene, camera, composer, planet };

// --- Face worlds (built flat, +y up, about 4.8 x 4.8) ---

/** The minigolf face: tiny islands in a cute sea, flags, a windmill and trees. */
function minigolfWorld(): THREE.Group {
  const g = new THREE.Group();
  const sea = new THREE.Mesh(
    new RoundedBoxGeometry(SIZE - 0.5, 0.3, SIZE - 0.5, 4, 0.14),
    new THREE.MeshStandardMaterial({ color: '#2c9be0', roughness: 0.25, emissive: '#0d4f8a', emissiveIntensity: 0.25 }),
  );
  sea.position.y = -0.05;
  sea.receiveShadow = true;
  g.add(sea);
  const islands: [number, number, number][] = [
    [-1.0, 0.7, 1.25],
    [1.35, -1.1, 0.95],
    [1.25, 1.35, 0.7],
  ];
  islands.forEach(([x, z, r], i) => {
    const sand = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), mat('#e9cf93', 0.9));
    sand.scale.y = 0.22;
    sand.position.set(x, 0.08, z);
    const grass = new THREE.Mesh(new THREE.SphereGeometry(r * 0.86, 32, 16), mat('#7ccf4a', 0.9));
    grass.scale.y = 0.24;
    grass.position.set(x, 0.14, z);
    const lane = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.16, r * 0.8, 6, 16), mat('#9be84a', 0.8));
    lane.rotation.set(Math.PI / 2, 0, 0.6 + i);
    lane.scale.z = 0.25;
    lane.position.set(x, 0.33, z);
    const rim = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.22, r * 0.8, 6, 16), mat('#2f8a3a', 0.95));
    rim.rotation.copy(lane.rotation);
    rim.scale.z = 0.3;
    rim.position.set(x, 0.3, z);
    for (const m of [sand, grass, lane, rim]) {
      m.castShadow = m !== sand;
      m.receiveShadow = true;
      g.add(m);
    }
    const f = flag.scene.clone(true);
    f.scale.setScalar(0.35);
    f.position.set(x + Math.cos(0.6 + i) * r * 0.45, 0.33, z - Math.sin(0.6 + i) * r * 0.45);
    f.traverse((o) => (o.castShadow = true));
    g.add(f);
    plant(g, forest, x, z, r, 5 + i * 2);
  });
  const w = windmill.scene.clone(true);
  w.scale.setScalar(0.5);
  w.position.set(-1.0, 0.3, 0.7);
  w.rotation.y = 0.5;
  w.traverse((o) => (o.castShadow = true));
  g.add(w);
  return g;
}

/** A few trees and bushes around an island's edge. */
function plant(g: THREE.Group, f: Forest, x: number, z: number, r: number, count: number): void {
  const names = ['Tree_1_A', 'Tree_3_A', 'Tree_4_A', 'Bush_1_B', 'Bush_2_A', 'Tree_2_A'];
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + 0.4;
    const name = names[k % names.length];
    const m = new THREE.Mesh(f.geometries.get(name)!, f.material);
    m.scale.setScalar(name.startsWith('Tree') ? 0.11 : 0.12);
    m.position.set(x + Math.cos(a) * r * 0.7, 0.28, z + Math.sin(a) * r * 0.7);
    m.rotation.y = a * 3;
    m.castShadow = true;
    g.add(m);
  }
}

/** "Coming soon": a cosy construction site with cones, crates, scaffolding, soft fog and a glowing "?". */
function constructionWorld(seed: number): THREE.Group {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new RoundedBoxGeometry(SIZE - 0.6, 0.2, SIZE - 0.6, 4, 0.1), mat('#e2c58f', 0.95));
  ground.receiveShadow = true;
  g.add(ground);
  const rnd = mulberry(seed);
  for (let k = 0; k < 6; k++) {
    const cone = new THREE.Group();
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 16), mat('#ff8a2a', 0.6));
    c.position.y = 0.32;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.08, 16), mat('#ffffff', 0.5));
    stripe.position.y = 0.32;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.38), mat('#ff8a2a', 0.6));
    foot.position.y = 0.12;
    cone.add(c, stripe, foot);
    const a = (k / 6) * Math.PI * 2;
    cone.position.set(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9);
    cone.traverse((o) => (o.castShadow = true));
    g.add(cone);
  }
  for (let k = 0; k < 4; k++) {
    const s = 0.35 + rnd() * 0.3;
    const crate = new THREE.Mesh(new RoundedBoxGeometry(s, s, s, 2, 0.04), mat('#b9783f', 0.85));
    crate.position.set(-1.5 + rnd() * 0.8, 0.1 + s / 2, 1.0 + rnd() * 0.6);
    crate.rotation.y = rnd() * 2;
    crate.castShadow = true;
    g.add(crate);
  }
  // Scaffolding: thin yellow poles in a little tower.
  const pole = mat('#f2c230', 0.6);
  for (const [px, pz] of [[0.9, -1.4], [1.7, -1.4], [0.9, -0.6], [1.7, -0.6]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 8), pole);
    p.position.set(px, 0.9, pz);
    p.castShadow = true;
    g.add(p);
  }
  for (const y of [0.5, 1.1, 1.65]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.95), mat('#c98e52', 0.85));
    plank.position.set(1.3, y, -1.0);
    plank.castShadow = true;
    g.add(plank);
  }
  const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('?', '#ffe36b'), transparent: true }));
  q.scale.setScalar(1.6);
  q.position.set(0, 1.25, 0);
  g.add(q);
  const fog = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 1, depthWrite: false });
  for (let k = 0; k < 7; k++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.4 + rnd() * 0.4, 16, 12), fog);
    puff.position.set(-2 + rnd() * 4, 0.25, -2 + rnd() * 4);
    puff.scale.y = 0.5;
    g.add(puff);
  }
  return g;
}

/** The next game, hinted: a badminton court with a net, and a shuttlecock under a tarp. */
function badmintonWorld(): THREE.Group {
  const g = new THREE.Group();
  const court = new THREE.Mesh(new RoundedBoxGeometry(SIZE - 0.6, 0.2, SIZE - 0.6, 4, 0.1), new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.8 }));
  court.receiveShadow = true;
  g.add(court);
  for (const z of [-1.9, 1.9]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 10), mat('#ffffff', 0.4));
    post.position.set(0, 0.65, z);
    post.castShadow = true;
    g.add(post);
  }
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 0.5),
    new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, roughness: 1 }),
  );
  net.rotation.y = Math.PI / 2;
  net.position.set(0, 0.95, 0);
  g.add(net);
  // The tarp: a soft dome over the big shuttlecock, its feathers peeking out.
  const tarp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('#3a6bd8', 0.9));
  tarp.scale.set(1, 0.75, 1.15);
  tarp.position.set(1.3, 0.1, 0.4);
  tarp.castShadow = true;
  g.add(tarp);
  const feathers = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 16, 1, true), mat('#ffffff', 0.6));
  feathers.rotation.z = Math.PI / 2 + 0.3;
  feathers.position.set(2.15, 0.35, 0.5);
  feathers.castShadow = true;
  g.add(feathers);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('Badminton', '#ffffff', 'soon'), transparent: true }));
  sign.scale.set(2.4, 1.2, 1);
  sign.position.set(-1.2, 1.2, 0);
  g.add(sign);
  return g;
}

// --- Helpers ---

function FACES(): THREE.Vector3[] {
  return [front, top, right, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0)];
}

/** Puts a flat world on the face with this outward normal (the world's +y points out of the face). */
function onFace<T extends THREE.Object3D>(object: T, normal: THREE.Vector3, offset = 0): T {
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  object.position.copy(normal).multiplyScalar(SIZE / 2 + 0.1 + offset);
  return object;
}

function mat(color: string, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function makeBackdrop(): THREE.Object3D {
  const g = new THREE.Group();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(LOOKS.top) }, bottom: { value: new THREE.Color(LOOKS.bottom) } },
      vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 p; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.9, 0.35, p.y)), 1.); }',
    }),
  );
  g.add(sky);
  const rnd = mulberry(7);
  if (variant === 'space') {
    const positions: number[] = [];
    for (let k = 0; k < 1500; k++) {
      const v = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(120 + rnd() * 60);
      positions.push(v.x, v.y, v.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#ffffff', size: 1.1, sizeAttenuation: true }));
    g.add(stars);
    const planetA = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 16), new THREE.MeshStandardMaterial({ color: '#ff9ad1', roughness: 0.6 }));
    planetA.position.set(-45, 18, -70);
    const planetB = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 16), new THREE.MeshStandardMaterial({ color: '#7ff3ff', roughness: 0.6 }));
    planetB.position.set(40, -12, -60);
    g.add(planetA, planetB);
  } else {
    // Puffy clouds: around the cube (sky) or a whole sea of clouds below it (sunset).
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: variant === 'sunset' ? '#ffb38a' : '#eaf4ff', emissiveIntensity: 0.35, roughness: 1 });
    const puff = new THREE.IcosahedronGeometry(1, 3);
    const count = variant === 'sunset' ? 140 : 18;
    for (let k = 0; k < count; k++) {
      const m = new THREE.Mesh(puff, cloudMat);
      if (variant === 'sunset') {
        const a = rnd() * Math.PI * 2;
        const d = 14 + rnd() * 60;
        m.position.set(Math.cos(a) * d, -14 - rnd() * 3, Math.sin(a) * d - 15);
        m.scale.set(3 + rnd() * 4, 1.5 + rnd() * 1.5, 3 + rnd() * 4);
      } else {
        const a = rnd() * Math.PI * 2;
        m.position.set(Math.cos(a) * (25 + rnd() * 30), -8 + rnd() * 22, Math.sin(a) * (25 + rnd() * 30) - 15);
        m.scale.set(3 + rnd() * 3, 2 + rnd() * 1.5, 2.5 + rnd() * 2);
      }
      g.add(m);
    }
    if (variant === 'sunset') {
      const sunDisk = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#fff2c4'), transparent: true, depthWrite: false }));
      sunDisk.scale.setScalar(40);
      sunDisk.position.set(-30, 2, -90);
      g.add(sunDisk);
    }
  }
  return g;
}

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture(color: string): THREE.Texture {
  return canvasTexture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, color);
    g.addColorStop(0.25, color + 'aa');
    g.addColorStop(1, color + '00');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

function textTexture(text: string, color: string, small?: string): THREE.Texture {
  return canvasTexture(512, 256, (c) => {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${small ? 86 : 220}px ui-rounded, system-ui, sans-serif`;
    c.shadowColor = color;
    c.shadowBlur = 30;
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(30,40,70,0.55)';
    c.strokeText(text, 256, small ? 100 : 135);
    c.fillStyle = color;
    c.fillText(text, 256, small ? 100 : 135);
    if (small) {
      c.font = '800 54px ui-rounded, system-ui, sans-serif';
      c.fillStyle = '#ffe36b';
      c.strokeText('coming soon', 256, 190);
      c.fillText('coming soon', 256, 190);
    }
  });
}

function courtTexture(): THREE.Texture {
  return canvasTexture(512, 512, (c) => {
    c.fillStyle = '#3fae6a';
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 8;
    c.strokeRect(60, 40, 392, 432);
    c.beginPath();
    c.moveTo(256, 40);
    c.lineTo(256, 472);
    c.moveTo(60, 256);
    c.lineTo(452, 256);
    c.stroke();
  });
}

function netTexture(): THREE.Texture {
  return canvasTexture(256, 64, (c) => {
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    for (let x = 0; x <= 256; x += 10) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 64);
      c.stroke();
    }
    for (let y = 0; y <= 64; y += 10) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(256, y);
      c.stroke();
    }
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 256, 6);
  });
}

function mulberry(seed: number): () => number {
  let a = seed * 1000 + 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
