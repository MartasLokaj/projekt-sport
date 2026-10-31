import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Forest } from '../game/vegetation.ts';
import { TUNING } from '../../shared/tuning.ts';

// The little worlds on the cube's sides. Each is built flat (+y up, about 5 x 5 units) and the hub
// stands it on its side of the cube. Minigolf looks like our real course: tiny islands in a cute
// sea; the games that don't exist yet are cosy "coming soon" building sites.

export type FaceKit = { windmill: GLTF; flag: GLTF; forest: Forest };

type Vec = readonly [number, number, number];

/** Whether a game can be played: finished, a playable prototype, or not built yet. */
export type FaceStatus = 'ready' | 'prototype' | 'soon';

/** A way to play a game. `players` = how many phones it needs (the mode that matches the phones joined is shown as active). */
export type GameMode = { label: string; detail: string; players: readonly [number, number] };

export type FaceInfo = {
  id: string;
  title: string;
  description: string;
  status: FaceStatus;
  /** The game's own colour in the menu (its card, its dot, the glow on its side of the cube). */
  accent: string;
  icon: 'golf' | 'shuttle' | 'mystery';
  minPlayers: number;
  maxPlayers: number;
  /** One line on how you play with the phone. */
  controls: string;
  modes: readonly GameMode[];
  normal: Vec;
  forward: Vec;
};

const MYSTERY = {
  title: 'Mystery game',
  description: 'Something fun is being built on this side. Come back soon!',
  status: 'soon',
  accent: '#a597ff',
  icon: 'mystery',
  minPlayers: 0,
  maxPlayers: 0,
  controls: '',
  modes: [],
} as const;

/**
 * The games on the cube's six sides. normal: which way the side faces on the cube; forward: the
 * direction on that side that points towards the camera once the side has turned up.
 */
export const FACES: readonly FaceInfo[] = [
  {
    id: 'minigolf',
    title: 'Minigolf',
    description: 'Putt across tiny islands in the sea. Fewest strokes wins.',
    status: 'ready',
    accent: '#3ddc84',
    icon: 'golf',
    minPlayers: 1,
    maxPlayers: 4,
    controls: 'Swing like a putter',
    modes: [{ label: '3-hole course', detail: 'Take turns, lowest total wins', players: [1, 4] }],
    normal: [0, 0, 1],
    forward: [0, -1, 0],
  },
  {
    id: 'badminton',
    title: 'Badminton',
    description: 'Rally on the beach. Swing when the shuttle reaches you.',
    status: 'prototype',
    accent: '#ff7a59',
    icon: 'shuttle',
    minPlayers: 1,
    maxPlayers: 2,
    controls: 'Swing like a racket',
    modes: [
      { label: 'Versus CPU', detail: 'One phone · first to 4, win by 2', players: [0, 1] },
      { label: '1 v 1', detail: 'Two phones · split screen', players: [2, 4] },
    ],
    normal: [1, 0, 0],
    forward: [0, 0, 1],
  },
  { id: 'mystery-1', ...MYSTERY, normal: [0, 1, 0], forward: [0, 0, 1] },
  { id: 'mystery-2', ...MYSTERY, normal: [-1, 0, 0], forward: [0, 0, 1] },
  { id: 'mystery-3', ...MYSTERY, normal: [0, 0, -1], forward: [0, 1, 0] },
  { id: 'mystery-4', ...MYSTERY, normal: [0, -1, 0], forward: [0, 0, -1] },
];

/** Every frame the hub calls this on each side, so its little world can move (time in seconds). */
export type Tick = (time: number, dt: number) => void;

/** Builds a side's little world; animated worlds keep their per-frame update in `userData.tick`. */
export function buildFace(face: FaceInfo, kit: FaceKit, size: number): THREE.Group {
  if (face.id === 'minigolf') return minigolfWorld(kit, size);
  if (face.id === 'badminton') return badmintonWorld(kit, size);
  return constructionWorld(FACES.indexOf(face), size);
}

/** The minigolf side: tiny islands in a cute sea, flags, a windmill and trees. */
function minigolfWorld(kit: FaceKit, size: number): THREE.Group {
  const g = new THREE.Group();
  const basin = new THREE.Mesh(new RoundedBoxGeometry(size - 0.5, 0.26, size - 0.5, 4, 0.12), mat('#1d6fb8', 0.6));
  basin.position.y = -0.16;
  basin.receiveShadow = true;
  g.add(basin);
  const sea = new Sea(size - 0.62);
  g.add(sea.mesh);
  const swaying: THREE.Object3D[] = [];
  let ball: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3 } | null = null;
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
    // The lane runs along this direction (the capsule's long axis after its rotation).
    const along = new THREE.Vector3(-Math.sin(0.6 + i), 0, Math.cos(0.6 + i));
    const cup = new THREE.Vector3(x, 0.36, z).addScaledVector(along, r * 0.42);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16), mat('#16331f', 1));
    hole.rotation.x = -Math.PI / 2;
    hole.position.copy(cup).setY(0.385);
    g.add(hole);
    const flag = kit.flag.scene.clone(true);
    flag.scale.setScalar(0.35);
    flag.position.copy(cup).setY(0.33);
    flag.traverse((o) => (o.castShadow = true));
    g.add(flag);
    swaying.push(...plantRing(g, kit.forest, x, z, r, 5 + i * 2));
    if (i === 1) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), mat('#ffffff', 0.3));
      mesh.castShadow = true;
      g.add(mesh);
      ball = { mesh, from: new THREE.Vector3(x, 0.43, z).addScaledVector(along, -r * 0.42), to: cup.clone().setY(0.43) };
    }
  });
  const windmill = kit.windmill.scene.clone(true);
  windmill.scale.setScalar(0.5);
  windmill.position.set(-1.0, 0.3, 0.7);
  windmill.rotation.y = 0.5;
  windmill.traverse((o) => (o.castShadow = true));
  g.add(windmill);
  const blades = windmill.getObjectByName('blades');

  // Things that spill over the edges: trees leaning out over three sides, and a waterfall pouring
  // off the front edge of the sea, down past the cube and away into space.
  swaying.push(
    overhang(g, kit.forest, 'Tree_4_A', -2.5, -2.5, 0.17),
    overhang(g, kit.forest, 'Tree_1_A', 2.6, 0.2, 0.15),
    overhang(g, kit.forest, 'Tree_2_A', -2.6, 1.7, 0.14),
  );
  const waterfall = new Waterfall(size);
  g.add(waterfall.root);

  const phases = swaying.map((_, k) => k * 1.7);
  const tick: Tick = (time, dt) => {
    sea.update(time);
    waterfall.update(time);
    if (blades) blades.rotation.z -= dt * 1.4;
    sway(swaying, time, phases);
    if (ball) {
      // A putt every few seconds: roll, slow down, drop into the cup, pop back on the tee.
      const t = (time % 4.5) / 3;
      const roll = 1 - (1 - Math.min(1, t)) ** 2;
      ball.mesh.position.lerpVectors(ball.from, ball.to, roll);
      ball.mesh.position.y -= t > 1 ? Math.min(0.12, (t - 1) * 0.6) : 0;
      ball.mesh.scale.setScalar(t > 1.35 ? 0.001 : 1);
    }
  };
  g.userData.tick = tick;
  return g;
}

/** A small sea with soft rolling waves (a bumpy sheet moved every frame, cheap at this size). */
class Sea {
  readonly mesh: THREE.Mesh;
  private readonly base: Float32Array;

  constructor(width: number) {
    const geometry = new THREE.PlaneGeometry(width, width, 36, 36);
    geometry.rotateX(-Math.PI / 2);
    this.base = (geometry.attributes.position.array as Float32Array).slice();
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: '#2fa6ec', roughness: 0.18, metalness: 0.05, emissive: '#0d4f8a', emissiveIntensity: 0.3 }),
    );
    this.mesh.position.y = 0.06;
    this.mesh.receiveShadow = true;
  }

  update(time: number): void {
    const position = this.mesh.geometry.attributes.position;
    const array = position.array as Float32Array;
    for (let k = 0; k < array.length; k += 3) {
      const x = this.base[k];
      const z = this.base[k + 2];
      array[k + 1] = Math.sin(x * 3.1 + time * 1.6) * 0.018 + Math.sin(z * 2.3 - time * 1.2) * 0.016 + Math.sin((x + z) * 5 + time * 2.4) * 0.006;
    }
    position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

/** A soft breeze: every plant leans a little, each at its own moment. */
function sway(plants: readonly THREE.Object3D[], time: number, phases: readonly number[]): void {
  plants.forEach((plant, k) => {
    const phase = phases[k] ?? k * 1.7;
    plant.rotation.z = Math.sin(time * 1.3 + phase) * 0.05;
    plant.rotation.x = Math.sin(time * 0.9 + phase * 1.3) * 0.03;
  });
}

/**
 * A tree standing on a grassy knoll at the very edge of a side, leaning out so its crown hangs over
 * the edge into space. Returns the tree, so it can sway.
 */
function overhang(g: THREE.Group, forest: Forest, name: string, x: number, z: number, scale: number): THREE.Mesh {
  const out = new THREE.Vector3(x, 0, z).normalize();
  const knoll = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12), mat('#6fc244', 0.9));
  knoll.scale.y = 0.45;
  knoll.position.set(x, 0.12, z);
  knoll.castShadow = true;
  knoll.receiveShadow = true;
  g.add(knoll);
  const tree = new THREE.Mesh(forest.geometries.get(name)!, forest.material);
  tree.scale.setScalar(scale);
  tree.rotation.y = x * 3 + z;
  tree.castShadow = true;
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.24, z);
  // Lean the top outwards: turn around the line along the edge.
  pivot.quaternion.setFromAxisAngle(new THREE.Vector3(out.z, 0, -out.x), TUNING.hub.overhangLean);
  pivot.add(tree);
  g.add(pivot);
  return tree;
}

/**
 * Water spilling over the front edge of the minigolf sea: a ribbon that runs over the rim, then arcs
 * out and down past the cube, streaming and fading into space. A little spray where it tips over.
 */
class Waterfall {
  readonly root = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly spray: { sprite: THREE.Sprite; phase: number; x: number }[] = [];
  /** Where the water tips over the rim (distance from the side's middle). */
  private readonly lip: number;

  constructor(size: number) {
    const width = TUNING.hub.waterfallWidth;
    const centre = TUNING.hub.waterfallX;
    const lip = size / 2 - 0.25;
    const segments = 48;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let k = 0; k <= segments; k++) {
      const v = k / segments;
      // The first bit runs flat over the rim, then it falls in a curve that clears the cube's rounded edge.
      let y: number;
      let z: number;
      if (v < 0.08) {
        z = lip - 0.5 + (v / 0.08) * 0.5;
        y = 0.075 + (v / 0.08) * 0.05;
      } else {
        const u = (v - 0.08) / 0.92;
        z = lip + 1.8 * u + 0.6 * u * u;
        y = 0.125 - 1.1 * u - 6.2 * u * u;
      }
      const spread = width * (1 + Math.max(0, v - 0.08) * 1.2); // it fans out a little as it falls
      positions.push(centre - spread / 2, y, z, centre + spread / 2, y, z);
      uvs.push(0, v, 1, v);
      if (k < segments) {
        const a = k * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, brightness: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float time; uniform float brightness; varying vec2 vUv;
        float hash(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          // Streaks that run down the fall, faster lower down; white foam at the lip.
          float lane = floor(vUv.x * 14.0);
          float speed = 0.9 + hash(lane) * 0.6;
          float streak = fract(vUv.y * 5.0 - time * speed + hash(lane + 3.0));
          float bright = smoothstep(0.55, 1.0, streak) * 0.6;
          float foam = smoothstep(0.14, 0.06, vUv.y) * step(0.06, vUv.y);
          vec3 water = mix(vec3(0.33, 0.72, 0.98), vec3(1.0), clamp(bright + foam, 0.0, 1.0));
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          float fade = 1.0 - smoothstep(0.35, 0.9, vUv.y);
          gl_FragColor = vec4(water * brightness, (0.5 + bright * 0.35) * edge * fade);
        }`,
    });
    const sheet = new THREE.Mesh(geometry, this.material);
    sheet.renderOrder = 3;
    this.root.add(sheet);
    const puff = new THREE.SpriteMaterial({ map: dustPuffTexture(), color: '#e8f6ff', transparent: true, depthWrite: false, opacity: 0 });
    for (let k = 0; k < 6; k++) {
      const sprite = new THREE.Sprite(puff.clone());
      this.root.add(sprite);
      this.spray.push({ sprite, phase: k / 6, x: centre + (k / 5 - 0.5) * width });
    }
    this.lip = lip;
  }

  update(time: number): void {
    this.material.uniforms.time.value = time;
    for (const s of this.spray) {
      const life = (time * 0.6 + s.phase) % 1;
      s.sprite.position.set(s.x, 0.15 - life * 0.6, this.lip + 0.15 + life * 0.25);
      s.sprite.scale.setScalar(0.35 + life * 0.5);
      s.sprite.material.opacity = Math.sin(life * Math.PI) * 0.5;
    }
  }
}

/** A few trees and bushes around an island's edge (returned, so they can sway in the wind). */
function plantRing(g: THREE.Group, forest: Forest, x: number, z: number, r: number, count: number): THREE.Mesh[] {
  const plants: THREE.Mesh[] = [];
  const names = ['Tree_1_A', 'Tree_3_A', 'Tree_4_A', 'Bush_1_B', 'Bush_2_A', 'Tree_2_A'];
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + 0.4;
    const name = names[k % names.length];
    const m = new THREE.Mesh(forest.geometries.get(name)!, forest.material);
    m.scale.setScalar(name.startsWith('Tree') ? 0.11 : 0.12);
    m.position.set(x + Math.cos(a) * r * 0.7, 0.28, z + Math.sin(a) * r * 0.7);
    m.rotation.y = a * 3;
    m.castShadow = true;
    // A pivot at the plant's foot, so swaying bends it from the ground.
    const pivot = new THREE.Group();
    pivot.position.copy(m.position);
    m.position.set(0, 0, 0);
    pivot.add(m);
    g.add(pivot);
    plants.push(m);
  }
  return plants;
}

/** "Coming soon": a cosy building site with cones, crates, scaffolding, soft fog and a glowing "?". */
function constructionWorld(seed: number, size: number): THREE.Group {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new RoundedBoxGeometry(size - 0.6, 0.2, size - 0.6, 4, 0.1), mat('#e2c58f', 0.95));
  ground.receiveShadow = true;
  g.add(ground);
  const random = seededRandom(seed);
  for (let k = 0; k < 6; k++) {
    const cone = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 16), mat('#ff8a2a', 0.6));
    body.position.y = 0.32;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.08, 16), mat('#ffffff', 0.5));
    stripe.position.y = 0.32;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.38), mat('#ff8a2a', 0.6));
    foot.position.y = 0.12;
    cone.add(body, stripe, foot);
    const a = (k / 6) * Math.PI * 2 + seed;
    cone.position.set(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9);
    cone.traverse((o) => (o.castShadow = true));
    g.add(cone);
  }
  for (let k = 0; k < 4; k++) {
    const s = 0.35 + random() * 0.3;
    const crate = new THREE.Mesh(new RoundedBoxGeometry(s, s, s, 2, 0.04), mat('#b9783f', 0.85));
    crate.position.set(-1.5 + random() * 0.8, 0.1 + s / 2, 1.0 + random() * 0.6);
    crate.rotation.y = random() * 2;
    crate.castShadow = true;
    g.add(crate);
  }
  // Scaffolding: a little tower of yellow poles and wooden planks.
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
  const question = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('?', '#ffe36b'), transparent: true, depthWrite: false }));
  question.scale.setScalar(1.6);
  question.position.set(0, 1.25, 0);
  question.name = 'glow';
  g.add(question);
  // Building dust: soft sandy wisps that rise from the ground, swell and fade, one after another.
  const dustTexture = dustPuffTexture();
  const wisps: { sprite: THREE.Sprite; x: number; z: number; phase: number; size: number }[] = [];
  for (let k = 0; k < 12; k++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTexture, color: '#f3dfb8', transparent: true, depthWrite: false, opacity: 0 }));
    const x = -1.9 + random() * 3.8;
    const z = -1.9 + random() * 3.8;
    g.add(sprite);
    wisps.push({ sprite, x, z, phase: random(), size: 0.7 + random() * 0.6 });
  }
  const tick: Tick = (time) => {
    // The "?" floats and breathes.
    question.position.y = 1.25 + Math.sin(time * 1.6 + seed) * 0.12;
    question.scale.setScalar(1.6 + Math.sin(time * 2.2 + seed) * 0.06);
    for (const w of wisps) {
      const life = (time / 5 + w.phase) % 1; // each wisp lives 5 s
      w.sprite.position.set(w.x + Math.sin(time * 0.4 + w.phase * 9) * 0.15 + life * 0.3, 0.2 + life * 0.7, w.z);
      w.sprite.scale.setScalar(w.size * (0.5 + life * 0.8));
      w.sprite.material.opacity = Math.sin(life * Math.PI) * 0.45;
    }
  };
  g.userData.tick = tick;
  return g;
}

/** The next game, hinted: a badminton court with a net, and a big shuttlecock under a tarp. */
function badmintonWorld(kit: FaceKit, size: number): THREE.Group {
  const g = new THREE.Group();
  // Two trees at the back corners lean out over the edge.
  const swaying = [
    overhang(g, kit.forest, 'Tree_1_A', -2.55, -2.55, 0.17),
    overhang(g, kit.forest, 'Tree_3_A', 2.55, -2.5, 0.15),
  ];
  const court = new THREE.Mesh(
    new RoundedBoxGeometry(size - 0.6, 0.2, size - 0.6, 4, 0.1),
    new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.8 }),
  );
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
  // A rally that never ends: the shuttle loops over the net from one side to the other.
  const shuttle = new THREE.Group();
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide }));
  skirt.position.y = 0.1;
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: '#ff5b3a', emissive: '#ff3a1a', emissiveIntensity: 0.8 }));
  cork.position.y = -0.04;
  shuttle.add(skirt, cork);
  shuttle.traverse((o) => (o.castShadow = true));
  g.add(shuttle);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.105;
  g.add(shadow);
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const next = new THREE.Vector3();
  const phases = [0, 2.1];
  const shot = (t: number, k: number, out: THREE.Vector3): THREE.Vector3 => {
    // Shot k goes from one baseline to the other, a little left or right each time.
    const dir = k % 2 === 0 ? 1 : -1;
    from.set(-1.7 * dir, 0.5, Math.sin(k * 2.1) * 1.1);
    to.set(1.7 * dir, 0.45, Math.sin((k + 1) * 2.1) * 1.1);
    return out.lerpVectors(from, to, t).setY(THREE.MathUtils.lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * 1.5);
  };
  const flight = 1.5;
  const tick: Tick = (time) => {
    const k = Math.floor(time / flight);
    const t = (time % flight) / flight;
    shot(t, k, shuttle.position);
    shot(Math.min(1, t + 0.02), k, next);
    // Cork first, along the flight.
    shuttle.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), next.sub(shuttle.position).normalize());
    shadow.position.set(shuttle.position.x, 0.105, shuttle.position.z);
    sway(swaying, time, phases);
  };
  g.userData.tick = tick;
  return g;
}

// ---------- Helpers ----------

/** A soft, lumpy cloud of dust (a few overlapping round blurs), white so a material colour can tint it. */
function dustPuffTexture(): THREE.Texture {
  return canvasTexture(128, 128, (c) => {
    const random = seededRandom(5);
    for (let k = 0; k < 7; k++) {
      const x = 40 + random() * 48;
      const y = 44 + random() * 40;
      const r = 22 + random() * 22;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    }
  });
}

function mat(color: string, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

export function canvasTexture(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function textTexture(text: string, colour: string): THREE.Texture {
  return canvasTexture(512, 256, (c) => {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 220px ui-rounded, system-ui, sans-serif';
    c.shadowColor = colour;
    c.shadowBlur = 30;
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(30,40,70,0.55)';
    c.strokeText(text, 256, 135);
    c.fillStyle = colour;
    c.fillText(text, 256, 135);
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

export function seededRandom(seed: number): () => number {
  let a = seed * 1000 + 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
