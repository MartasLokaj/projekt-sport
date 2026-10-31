import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Forest } from '../game/vegetation.ts';

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

export function buildFace(face: FaceInfo, kit: FaceKit, size: number): THREE.Group {
  if (face.id === 'minigolf') return minigolfWorld(kit, size);
  if (face.id === 'badminton') return badmintonWorld(size);
  return constructionWorld(FACES.indexOf(face), size);
}

/** The minigolf side: tiny islands in a cute sea, flags, a windmill and trees. */
function minigolfWorld(kit: FaceKit, size: number): THREE.Group {
  const g = new THREE.Group();
  const sea = new THREE.Mesh(
    new RoundedBoxGeometry(size - 0.5, 0.3, size - 0.5, 4, 0.14),
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
    const flag = kit.flag.scene.clone(true);
    flag.scale.setScalar(0.35);
    flag.position.set(x + Math.cos(0.6 + i) * r * 0.45, 0.33, z - Math.sin(0.6 + i) * r * 0.45);
    flag.traverse((o) => (o.castShadow = true));
    g.add(flag);
    plantRing(g, kit.forest, x, z, r, 5 + i * 2);
  });
  const windmill = kit.windmill.scene.clone(true);
  windmill.scale.setScalar(0.5);
  windmill.position.set(-1.0, 0.3, 0.7);
  windmill.rotation.y = 0.5;
  windmill.traverse((o) => (o.castShadow = true));
  g.add(windmill);
  return g;
}

/** A few trees and bushes around an island's edge. */
function plantRing(g: THREE.Group, forest: Forest, x: number, z: number, r: number, count: number): void {
  const names = ['Tree_1_A', 'Tree_3_A', 'Tree_4_A', 'Bush_1_B', 'Bush_2_A', 'Tree_2_A'];
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + 0.4;
    const name = names[k % names.length];
    const m = new THREE.Mesh(forest.geometries.get(name)!, forest.material);
    m.scale.setScalar(name.startsWith('Tree') ? 0.11 : 0.12);
    m.position.set(x + Math.cos(a) * r * 0.7, 0.28, z + Math.sin(a) * r * 0.7);
    m.rotation.y = a * 3;
    m.castShadow = true;
    g.add(m);
  }
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
  const question = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('?', '#ffe36b'), transparent: true }));
  question.scale.setScalar(1.6);
  question.position.set(0, 1.25, 0);
  question.name = 'glow';
  g.add(question);
  const fog = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 1, depthWrite: false });
  for (let k = 0; k < 7; k++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.4 + random() * 0.4, 16, 12), fog);
    puff.position.set(-2 + random() * 4, 0.25, -2 + random() * 4);
    puff.scale.y = 0.5;
    g.add(puff);
  }
  return g;
}

/** The next game, hinted: a badminton court with a net, and a big shuttlecock under a tarp. */
function badmintonWorld(size: number): THREE.Group {
  const g = new THREE.Group();
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
  // The tarp: a soft dome over the shuttlecock, its feathers peeking out.
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
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('Badminton', '#ffffff', 'prototype'), transparent: true }));
  sign.scale.set(2.4, 1.2, 1);
  sign.position.set(-1.2, 1.2, 0);
  g.add(sign);
  return g;
}

// ---------- Helpers ----------

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

function textTexture(text: string, colour: string, below?: string): THREE.Texture {
  return canvasTexture(512, 256, (c) => {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${below ? 86 : 220}px ui-rounded, system-ui, sans-serif`;
    c.shadowColor = colour;
    c.shadowBlur = 30;
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(30,40,70,0.55)';
    c.strokeText(text, 256, below ? 100 : 135);
    c.fillStyle = colour;
    c.fillText(text, 256, below ? 100 : 135);
    if (below) {
      c.font = '800 54px ui-rounded, system-ui, sans-serif';
      c.fillStyle = '#ffe36b';
      c.strokeText(below, 256, 190);
      c.fillText(below, 256, 190);
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
