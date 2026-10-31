import * as THREE from 'three';
import { TUNING } from '../../../shared/tuning.ts';
import { addDeck, addPalapa, addPalm, addRock, featherFlag, flagTexture, Merger, wind, windMaterial } from './props.ts';
import { makeClouds, makeSea, makeSky } from './sea.ts';

// The beach venue: a sand court right on a tropical beach, in our soft low-poly style.
// The court runs along z (net at z = 0; the first player's camera looks north towards -z, the
// second's south towards +z). Around it:
//   west  (-x): a low stone wall with a wooden deck, railing, closed green umbrellas; the sea beyond
//   north (-z): the beach slopes into the sea: wet sand, foam, surf on the reef, the horizon
//   east  (+x): palms leaning over the court, a thatched hut (palapa) with tables, volcanic rocks
//   south (+z): a palm grove, rocks and green hills
// Feather flags stand by the net and at two corners. Everything static is one mesh; palms, flags and
// the net's top band sway in the wind. This is the only file (with its helpers) that builds the venue.

export type Venue = {
  group: THREE.Group;
  /** Call every frame (seconds since the last frame): wind and waves. */
  update: (dt: number) => void;
  /** Colour the far distance fades into (for the scene's fog). */
  horizon: THREE.Color;
};

export function buildBeach(sunDirection: THREE.Vector3): Venue {
  const cfg = TUNING.badminton;
  const c = cfg.beach;
  const random = seeded(c.seed);
  const group = new THREE.Group();

  // ---------- The shape of the land ----------
  const west = c.wallX - c.deckWidth; // the sea side of the deck's wall
  const north = c.northShoreZ;
  const R = 9; // the beach curves round from the wall to the north shore
  /** Signed distance to the waterline: negative on land, positive out at sea (metres). */
  const shore = (x: number, z: number): number => {
    const qx = x - (west + R);
    const qz = z - (north + R);
    if (qx < 0 && qz < 0) return Math.hypot(qx, qz) - R;
    return Math.max(west - x, north - z);
  };
  /** 1 where the wall runs along the beach, 0 north of its end. */
  const walled = (z: number): number => THREE.MathUtils.smoothstep(z, c.deckFromZ - 2, c.deckFromZ + 1);
  const groundAt = (x: number, z: number): number => {
    const d = shore(x, z);
    // Open beach: flat sand that slopes gently down into the sea.
    const beach = c.seaLevel * THREE.MathUtils.smoothstep(d, -c.beachSlope, 0) - Math.max(0, d) * 0.3;
    // Along the wall: flat right up to it, deep water on the other side.
    const wall = x > west + 0.2 ? 0 : -2.5;
    let y = THREE.MathUtils.lerp(beach, wall, walled(z));
    // Soft little dunes, flat on and around the court.
    const court = Math.max(Math.abs(x) / (cfg.courtHalfWidth + 2.5), Math.abs(z) / (cfg.courtHalfLength + 3));
    y += (Math.sin(x * 0.5 + 1.3) * Math.sin(z * 0.41) * 0.12 + Math.sin(x * 1.3) * Math.sin(z * 1.1 + 2) * 0.03) * THREE.MathUtils.smoothstep(court, 1, 1.6) * (y > c.seaLevel + 0.3 ? 1 : 0.3);
    return y;
  };

  // ---------- Sand ----------
  group.add(buildSand(groundAt));
  group.add(buildFootprints());

  // ---------- Sky, clouds, sea ----------
  const sky = makeSky(sunDirection);
  const clouds = makeClouds(random);
  const sea = makeSea(shore, new THREE.Vector3(0, 0, 0));
  group.add(sky, clouds, sea.mesh);

  // ---------- Court: rope lines and the net ----------
  group.add(buildCourtLines(random));
  const net = buildNet();
  group.add(net.group);

  // ---------- Everything that stands still: one mesh ----------
  const still = new Merger();
  addDeck(still, c.wallX, c.deckWidth, c.deckFromZ, c.deckToZ, c.deckHeight, c.umbrellaEvery);
  addPalapa(still, c.palapa[0], c.palapa[1], 3, random);
  for (const [x, z, size] of c.rocks) addRock(still, x, groundAt(x, z), z, size, random);
  // A cluster of rocks at the water's edge on the north-east, where the foam washes round them.
  for (let k = 0; k < 9; k++) {
    const x = 6 + random() * 10;
    const z = north + 1.5 + random() * 3;
    addRock(still, x, groundAt(x, z), z, 0.4 + random() * 0.8, random);
  }
  // Green hills far behind the south end and the east side, so no view ends in empty sand.
  for (const [x, z, sx, sy, sz] of c.hills) {
    still.add(new THREE.IcosahedronGeometry(1, 2), new THREE.Matrix4().compose(new THREE.Vector3(x, -sy * 0.25, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)), x > 30 ? '#4f9a46' : '#5aa84c');
  }
  // Flag poles (the banners are a separate, fluttering mesh).
  for (const [x, z] of c.flags) still.add(new THREE.CylinderGeometry(0.025, 0.03, c.flagHeight + 0.4, 6), new THREE.Matrix4().makeTranslation(x, (c.flagHeight + 0.4) / 2 - 0.4, z), '#d9d9d9');
  const stillMesh = new THREE.Mesh(still.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  stillMesh.castShadow = true;
  stillMesh.receiveShadow = true;
  group.add(stillMesh);

  // ---------- Palms: one mesh, swaying ----------
  const palms = new Merger();
  const palmAt = (x: number, z: number, height: number, lean: number, leanDir: number): void =>
    addPalm(palms, new THREE.Vector3(x, groundAt(x, z), z), height, lean, leanDir, random);
  // Along the east side of the court, leaning over its edge (towards -x).
  for (const z of c.courtPalmsZ) palmAt(c.courtPalmsX + random() * 0.8, z, 5.8 + random() * 1.2, 0.22 + random() * 0.08, Math.PI + (random() - 0.5) * 0.5);
  // Groves: north-east by the rocks, the south end, the east side, on the hills.
  for (const [x, z, count, spread] of c.groves) {
    for (let k = 0; k < count; k++) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * spread;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      // Lean away from the court, so no crown hangs into a camera's view from behind it.
      palmAt(px, pz, 5 + random() * 3, 0.1 + random() * 0.3, Math.atan2(pz, px) + (random() - 0.5) * 0.8);
    }
  }
  const palmMesh = new THREE.Mesh(palms.build(), windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, side: THREE.DoubleSide }), c.palmSway));
  palmMesh.castShadow = true;
  palmMesh.receiveShadow = true;
  group.add(palmMesh);

  // ---------- Feather flags ----------
  const banner = featherFlag(c.flagHeight, 0.62);
  const banners: THREE.BufferGeometry[] = [];
  for (const [x, z, yaw] of c.flags) banners.push(banner.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1))));
  const flagMesh = new THREE.Mesh(
    mergeAll(banners),
    windMaterial(new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.8, side: THREE.DoubleSide }), c.flagSway),
  );
  flagMesh.castShadow = true;
  group.add(flagMesh);

  let time = 0;
  return {
    group,
    horizon: new THREE.Color(c.skyHorizon),
    update: (dt) => {
      time += dt;
      wind.time.value = time;
      wind.strength.value = c.windStrength;
      sea.update(time);
      clouds.rotation.y = time * 0.004;
    },
  };
}

// ---------- Sand ----------

/** The beach ground: a big sheet that follows `groundAt`, coloured darker where the sand is wet. */
function buildSand(groundAt: (x: number, z: number) => number): THREE.Mesh {
  const c = TUNING.badminton.beach;
  const [x0, z0, x1, z1] = c.groundArea;
  const cell = c.groundCell;
  const nx = Math.ceil((x1 - x0) / cell);
  const nz = Math.ceil((z1 - z0) / cell);
  const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const position = geometry.getAttribute('position');
  const colours: number[] = [];
  const uvs = geometry.getAttribute('uv');
  const dry = new THREE.Color(c.sandDry);
  const wet = new THREE.Color(c.sandWet);
  const colour = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = groundAt(x, z);
    position.setY(i, y);
    uvs.setXY(i, x / c.sandTextureSize, z / c.sandTextureSize);
    // Wet just above the waterline, a hint lighter in sun-dried patches.
    const wetness = THREE.MathUtils.smoothstep(y, c.seaLevel + 0.35, c.seaLevel + 0.05);
    const patch = 0.97 + 0.05 * Math.sin(x * 0.23 + 1) * Math.sin(z * 0.19);
    colour.copy(dry).lerp(wet, wetness).multiplyScalar(patch);
    colours.push(colour.r, colour.g, colour.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const textures = sandTextures();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ map: textures.colour, bumpMap: textures.bump, bumpScale: c.sandBumpiness, vertexColors: true, roughness: 1 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

/** Fine sand: grains of slightly different shades, and soft little dimples (as colour and as bumps). */
function sandTextures(): { colour: THREE.Texture; bump: THREE.Texture } {
  const size = 512;
  const random = seeded(3);
  const colour = document.createElement('canvas');
  const bump = document.createElement('canvas');
  colour.width = colour.height = bump.width = bump.height = size;
  const cc = colour.getContext('2d')!;
  const bc = bump.getContext('2d')!;
  cc.fillStyle = '#f2f2f2';
  cc.fillRect(0, 0, size, size);
  bc.fillStyle = '#808080';
  bc.fillRect(0, 0, size, size);
  // Dimples: little hollows, drawn on all four sides of the edge too so the texture repeats seamlessly.
  const wrap = (draw: (x: number, y: number) => void, x: number, y: number): void => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(x + dx, y + dy);
  };
  for (let k = 0; k < 260; k++) {
    const x = random() * size;
    const y = random() * size;
    const r = 3 + random() * 7;
    wrap((px, py) => {
      const g = bc.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(70,70,70,0.4)');
      g.addColorStop(0.7, 'rgba(110,110,110,0.2)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      bc.fillStyle = g;
      bc.fillRect(px - r, py - r, r * 2, r * 2);
      const s = cc.createRadialGradient(px, py, 0, px, py, r);
      s.addColorStop(0, 'rgba(160,140,110,0.06)');
      s.addColorStop(1, 'rgba(150,130,100,0)');
      cc.fillStyle = s;
      cc.fillRect(px - r, py - r, r * 2, r * 2);
    }, x, y);
  }
  // Grains.
  for (let k = 0; k < 26000; k++) {
    const shade = 200 + Math.floor(random() * 55);
    cc.fillStyle = `rgba(${shade},${shade - 8},${shade - 25},0.5)`;
    const x = random() * size;
    const y = random() * size;
    cc.fillRect(x, y, 1.2, 1.2);
    const b = 100 + Math.floor(random() * 60);
    bc.fillStyle = `rgba(${b},${b},${b},0.5)`;
    bc.fillRect(x, y, 1.5, 1.5);
  }
  const make = (canvas: HTMLCanvasElement, srgb: boolean): THREE.Texture => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { colour: make(colour, true), bump: make(bump, false) };
}

/** Footprints all over the court and around it (people have been playing here all morning). */
function buildFootprints(): THREE.Mesh {
  const cfg = TUNING.badminton;
  const width = (cfg.courtHalfWidth + 3.5) * 2;
  const length = (cfg.courtHalfLength + 4) * 2;
  const px = 40; // pixels per metre
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * px);
  canvas.height = Math.round(length * px);
  const c = canvas.getContext('2d')!;
  const random = seeded(9);
  // A footprint: a darker hollow with a lighter rim on the sunny side, toes in front.
  const foot = (x: number, y: number, angle: number, left: boolean): void => {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.scale(left ? -1 : 1, 1);
    c.fillStyle = 'rgba(120,90,50,0.13)';
    c.beginPath();
    c.ellipse(0, 0, 3.6, 8.5, 0.1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,245,220,0.18)';
    c.beginPath();
    c.ellipse(1.4, 1.0, 2.8, 7, 0.1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(120,90,50,0.12)';
    for (let t = 0; t < 4; t++) {
      c.beginPath();
      c.arc(-2.5 + t * 1.8, -11 - Math.abs(t - 1.5) * 0.6, 1.3, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  };
  // Trails of steps wandering about, most of them on the court.
  for (let trail = 0; trail < 34; trail++) {
    const onCourt = random() < 0.8;
    let x = (onCourt ? (random() - 0.5) * cfg.courtHalfWidth * 2 : (random() - 0.5) * width) * px + canvas.width / 2;
    let y = (onCourt ? (random() - 0.5) * cfg.courtHalfLength * 2 : (random() - 0.5) * length) * px + canvas.height / 2;
    let heading = random() * Math.PI * 2;
    const steps = 4 + Math.floor(random() * 10);
    for (let s = 0; s < steps; s++) {
      heading += (random() - 0.5) * 0.9;
      const side = s % 2 ? 1 : -1;
      foot(x + Math.cos(heading) * side * 5, y + Math.sin(heading) * side * 5, heading + Math.PI / 2, side < 0);
      x += Math.sin(heading) * 26;
      y -= Math.cos(heading) * 26;
    }
  }
  // Scuffs where players slid and turned.
  for (let k = 0; k < 40; k++) {
    const x = canvas.width / 2 + (random() - 0.5) * cfg.courtHalfWidth * 2 * px;
    const y = canvas.height / 2 + (random() - 0.5) * cfg.courtHalfLength * 2 * px;
    const g = c.createRadialGradient(x, y, 0, x, y, 18 + random() * 20);
    g.addColorStop(0, 'rgba(130,100,60,0.16)');
    g.addColorStop(1, 'rgba(130,100,60,0)');
    c.fillStyle = g;
    c.fillRect(x - 40, y - 40, 80, 80);
  }
  // Fade out at the edges.
  const fade = c.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.35, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.55);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = fade;
  c.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length),
    new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.006;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- Court lines and net ----------

/** The court lines: dark rope lying on the sand, a little wavy, pinned with small pegs at the ends. */
function buildCourtLines(random: () => number): THREE.Mesh {
  const cfg = TUNING.badminton;
  const w = cfg.courtHalfWidth;
  const l = cfg.courtHalfLength;
  const s = cfg.shortServiceLine;
  const lines: [number, number, number, number][] = [
    [-w, -l, -w, l],
    [w, -l, w, l],
    [-w, -l, w, -l],
    [-w, l, w, l],
    [-w, -s, w, -s],
    [-w, s, w, s],
    [0, -l, 0, -s],
    [0, s, 0, l],
  ];
  const merger = new Merger();
  const radius = TUNING.badminton.beach.ropeRadius;
  for (const [ax, az, bx, bz] of lines) {
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(4, Math.round(length / 0.8));
    const across = new THREE.Vector3(-(bz - az) / length, 0, (bx - ax) / length);
    const points: THREE.Vector3[] = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const wobble = k === 0 || k === steps ? 0 : (random() - 0.5) * 0.06;
      points.push(new THREE.Vector3(ax + (bx - ax) * t, radius * 0.6, az + (bz - az) * t).addScaledVector(across, wobble));
    }
    merger.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps * 4, radius, 5), new THREE.Matrix4(), '#2a2c36');
    // Pegs at both ends.
    for (const [x, z] of [
      [ax, az],
      [bx, bz],
    ])
      merger.add(new THREE.CylinderGeometry(0.035, 0.025, 0.1, 6), new THREE.Matrix4().makeTranslation(x, 0.04, z), '#d9d4c7');
  }
  const mesh = new THREE.Mesh(merger.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/**
 * The portable net: thin dark-blue posts on little feet, black mesh that sags a bit in the middle,
 * and a bright orange band along the top that ripples in the wind.
 */
function buildNet(): { group: THREE.Group } {
  const cfg = TUNING.badminton;
  const c = cfg.beach;
  const group = new THREE.Group();
  const half = cfg.courtHalfWidth + 0.3;
  const top = cfg.netHeight;
  const depth = 0.76;
  const sag = (x: number): number => c.netSag * (1 - (x / half) ** 2);

  const still = new Merger();
  for (const side of [-1, 1]) {
    const x = side * half;
    still.add(new THREE.CylinderGeometry(0.035, 0.035, top + 0.05, 8), new THREE.Matrix4().makeTranslation(x, (top + 0.05) / 2, 0), '#23408f');
    // A T-shaped foot.
    still.add(new THREE.BoxGeometry(0.08, 0.05, 0.9), new THREE.Matrix4().makeTranslation(x, 0.025, 0), '#1c2f66');
    still.add(new THREE.BoxGeometry(0.5, 0.05, 0.08), new THREE.Matrix4().makeTranslation(x + side * 0.2, 0.025, 0), '#1c2f66');
    still.add(new THREE.SphereGeometry(0.05, 8, 6), new THREE.Matrix4().makeTranslation(x, top + 0.06, 0), '#ff8a2a');
  }
  const posts = new THREE.Mesh(still.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
  posts.castShadow = true;
  group.add(posts);

  // The mesh: a sheet whose top follows the sag; corners near the top ripple a little with the band.
  const columns = 24;
  const rows = 4;
  const mesh = new THREE.PlaneGeometry(half * 2, depth, columns, rows);
  const position = mesh.getAttribute('position');
  const sways: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const v = (position.getY(i) + depth / 2) / depth; // 0 bottom .. 1 top
    position.setY(i, top - depth + v * depth - sag(x) * (0.4 + 0.6 * v));
    sways.push(v * (1 - (x / half) ** 2) * 0.5);
  }
  mesh.setAttribute('sway', new THREE.Float32BufferAttribute(sways, 1));
  mesh.computeVertexNormals();
  const netMesh = new THREE.Mesh(
    mesh,
    windMaterial(new THREE.MeshStandardMaterial({ map: netTexture(half * 2, depth), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 }), c.netSway),
  );
  netMesh.castShadow = true;
  group.add(netMesh);

  // The orange band along the top.
  const band = new THREE.PlaneGeometry(half * 2, 0.07, columns, 1);
  const bp = band.getAttribute('position');
  const bandSway: number[] = [];
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    bp.setY(i, top - 0.035 + bp.getY(i) - sag(x));
    bandSway.push((1 - (x / half) ** 2) * 0.5);
  }
  band.setAttribute('sway', new THREE.Float32BufferAttribute(bandSway, 1));
  band.computeVertexNormals();
  const bandMesh = new THREE.Mesh(band, windMaterial(new THREE.MeshStandardMaterial({ color: '#ff7f1f', emissive: '#ff5a00', emissiveIntensity: 0.25, roughness: 0.6, side: THREE.DoubleSide }), c.netSway));
  bandMesh.position.z = 0.005;
  bandMesh.castShadow = true;
  group.add(bandMesh);
  return { group };
}

/** Black netting: a square grid of thin cords on transparency. */
function netTexture(width: number, height: number): THREE.Texture {
  const cell = 16;
  const mesh = TUNING.badminton.beach.netCell; // metres between cords
  const canvas = document.createElement('canvas');
  canvas.width = cell * 2;
  canvas.height = cell * 2;
  const c = canvas.getContext('2d')!;
  c.strokeStyle = 'rgba(20,22,28,1)';
  c.lineWidth = 3;
  for (let k = 0; k <= 2; k++) {
    c.beginPath();
    c.moveTo(k * cell, 0);
    c.lineTo(k * cell, cell * 2);
    c.moveTo(0, k * cell);
    c.lineTo(cell * 2, k * cell);
    c.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(width / mesh / 2, height / mesh / 2);
  texture.anisotropy = 8;
  return texture;
}

// ---------- Helpers ----------

function mergeAll(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  const attributes = ['position', 'normal', 'uv', 'sway'];
  const indices: number[] = [];
  let offset = 0;
  const data: Record<string, number[]> = { position: [], normal: [], uv: [], sway: [] };
  for (const g of geometries) {
    for (const name of attributes) data[name].push(...(g.getAttribute(name).array as Float32Array));
    for (const i of g.getIndex()!.array) indices.push(i + offset);
    offset += g.getAttribute('position').count;
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
  merged.setAttribute('sway', new THREE.Float32BufferAttribute(data.sway, 1));
  merged.setIndex(indices);
  return merged;
}

/** The same "random" numbers every time, so the beach always looks the same. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
