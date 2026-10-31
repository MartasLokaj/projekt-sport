import * as THREE from 'three';

// Building blocks for the beach venue, in a soft low-poly toon style: palms, a thatched hut (palapa)
// with tables and chairs, a wooden deck with a railing and closed umbrellas, feather flags, rocks.
// Static things are poured into one big mesh (one draw call) with a colour per part; things that move
// in the wind carry a "sway" value per corner (0 = stays put, 1 = moves the most) for windMaterial().

/** Collects many small shapes into one mesh: each part keeps its own colour and sway. */
export class Merger {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colours: number[] = [];
  private readonly sways: number[] = [];
  private readonly uvs: number[] = [];

  /**
   * Adds a shape, moved by `matrix`. `sway` gives each corner's wind movement from its position in the
   * shape's own coordinates (before moving); default: none.
   */
  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, colour: THREE.ColorRepresentation, sway?: (local: THREE.Vector3) => number): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const position = g.getAttribute('position');
    const normal = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const c = new THREE.Color(colour);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i);
      const s = sway ? sway(p) : 0;
      p.applyMatrix4(matrix);
      n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(n.x, n.y, n.z);
      this.colours.push(c.r, c.g, c.b);
      this.sways.push(s);
      this.uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colours, 3));
    geometry.setAttribute('sway', new THREE.Float32BufferAttribute(this.sways, 1));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Shared clock for everything that moves in the wind (seconds). */
export const wind = { time: { value: 0 }, strength: { value: 1 } };

/**
 * A material that bends in the wind: each corner moves by its "sway" value, in a gentle gust that
 * rolls across the beach (the phase comes from where the corner is in the world).
 */
export function windMaterial(material: THREE.MeshStandardMaterial, amount: number): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind.time;
    shader.uniforms.windStrength = wind.strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float windTime;\nuniform float windStrength;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 windSpot = (modelMatrix * vec4(position, 1.0)).xyz;
        float gust = sin(windTime * 1.7 + windSpot.x * 0.35 + windSpot.z * 0.25) + 0.5 * sin(windTime * 3.1 + windSpot.z * 0.9);
        transformed += vec3(0.8, 0.15 * sin(windTime * 2.3 + windSpot.x), 0.45) * gust * sway * ${amount.toFixed(3)} * windStrength;`,
      );
  };
  material.customProgramCacheKey = () => `wind-${amount}`;
  return material;
}

const m4 = (): THREE.Matrix4 => new THREE.Matrix4();
const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s: number | THREE.Vector3 = 1): THREE.Matrix4 =>
  m4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), typeof s === 'number' ? new THREE.Vector3(s, s, s) : s);

// ---------- Palms ----------

/**
 * A palm tree standing at `base`: a curved, ringed trunk leaning towards `leanDir` (radians around y),
 * a crown of drooping fronds and a few coconuts. Fronds sway a lot, the trunk a little.
 */
export function addPalm(merger: Merger, base: THREE.Vector3, height: number, lean: number, leanDir: number, random: () => number): void {
  const segments = 9;
  const dir = new THREE.Vector3(Math.cos(leanDir), 0, Math.sin(leanDir));
  // The trunk curves: it leans more and more towards the top.
  const spine: THREE.Vector3[] = [];
  for (let k = 0; k <= segments; k++) {
    const t = k / segments;
    spine.push(base.clone().addScaledVector(dir, lean * height * t * t).setY(base.y + height * t));
  }
  const bark = ['#8a6a48', '#7a5b3c'];
  for (let k = 0; k < segments; k++) {
    const a = spine[k];
    const b = spine[k + 1];
    const length = a.distanceTo(b);
    const radius = 0.2 * (1 - (k / segments) * 0.45);
    const ring = new THREE.CylinderGeometry(radius * 0.86, radius, length * 1.04, 7, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const matrix = m4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    merger.add(ring, matrix, bark[k % 2], () => (k / segments) ** 2 * 0.12);
  }
  const top = spine[segments];
  // Fronds: long leaves with a raised middle rib, drooping towards their tips.
  const fronds = 8;
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + random() * 0.4;
    const length = 2.3 + random() * 0.8;
    const lift = 0.35 + random() * 0.35;
    const leaf = frondGeometry(length, lift);
    const matrix = at(top.x, top.y, top.z, yaw, 0, 0);
    merger.add(leaf, matrix, f % 2 ? '#3f9a3a' : '#4bb043', (p) => 0.15 + (p.x / length) ** 1.5 * 0.85);
  }
  // Coconuts under the crown.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + random();
    merger.add(new THREE.IcosahedronGeometry(0.13, 0), at(top.x + Math.cos(a) * 0.18, top.y - 0.15, top.z + Math.sin(a) * 0.18), '#6b4a2a', () => 0.1);
  }
}

/** One frond along +x: a strip with a V-shaped cross-section, widest a third of the way out, curving up and then down. */
function frondGeometry(length: number, lift: number): THREE.BufferGeometry {
  const steps = 7;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const x = t * length;
    const y = lift * Math.sin(t * Math.PI * 0.7) - t * t * length * 0.55;
    const half = 0.38 * Math.sin(Math.min(1, t * 1.6 + 0.08) * Math.PI) * (1 - t * 0.6) + 0.02;
    // left edge, rib (a bit higher), right edge
    positions.push(x, y - half * 0.25, -half, x, y + 0.04, 0, x, y - half * 0.25, half);
    if (k < steps) {
      const a = k * 3;
      for (const [i, j] of [
        [0, 1],
        [1, 2],
      ]) {
        indices.push(a + i, a + j, a + 3 + i, a + j, a + 3 + j, a + 3 + i);
        indices.push(a + i, a + 3 + i, a + j, a + j, a + 3 + i, a + 3 + j); // both sides
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry.toNonIndexed();
}

// ---------- Palapa (thatched hut) ----------

/** A round thatched-roof hut on wooden posts, with two tables and chairs underneath. */
export function addPalapa(merger: Merger, x: number, z: number, radius: number, random: () => number): void {
  const wood = '#8b5e34';
  const posts = 6;
  for (let k = 0; k < posts; k++) {
    const a = (k / posts) * Math.PI * 2;
    merger.add(new THREE.CylinderGeometry(0.09, 0.11, 2.6, 6), at(x + Math.cos(a) * radius * 0.8, 1.3, z + Math.sin(a) * radius * 0.8), wood);
  }
  merger.add(new THREE.CylinderGeometry(0.14, 0.14, 3.4, 6), at(x, 1.7, z), wood);
  // The straw roof: a low cone, a shaggy fringe all around and a little knob on top.
  merger.add(new THREE.ConeGeometry(radius * 1.12, 1.9, 12, 3), at(x, 3.45, z, 0.2), '#c9a560');
  merger.add(new THREE.CylinderGeometry(radius * 1.12, radius * 1.16, 0.32, 12, 1, true), at(x, 2.42, z, 0.2), '#b58f4c');
  merger.add(new THREE.ConeGeometry(0.28, 0.5, 6), at(x, 4.5, z), '#a9843f');
  // Tables and chairs in the shade.
  for (const [tx, tz] of [
    [-0.9, -0.6],
    [1.0, 0.7],
  ]) {
    const cx = x + tx;
    const cz = z + tz;
    merger.add(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 10), at(cx, 0.75, cz), '#a8713f');
    merger.add(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 6), at(cx, 0.37, cz), '#6e4a28');
    for (let c = 0; c < 3; c++) {
      const a = (c / 3) * Math.PI * 2 + random();
      addChair(merger, cx + Math.cos(a) * 0.9, cz + Math.sin(a) * 0.9, -a + Math.PI / 2);
    }
  }
}

function addChair(merger: Merger, x: number, z: number, yaw: number): void {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const part = (geometry: THREE.BufferGeometry, lx: number, ly: number, lz: number, colour: string): void => {
    const p = new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(new THREE.Vector3(x, 0, z));
    merger.add(geometry, m4().compose(p, q, new THREE.Vector3(1, 1, 1)), colour);
  };
  part(new THREE.BoxGeometry(0.42, 0.05, 0.42), 0, 0.45, 0, '#b07a46');
  part(new THREE.BoxGeometry(0.42, 0.42, 0.05), 0, 0.68, -0.2, '#b07a46');
  for (const [lx, lz] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ])
    part(new THREE.BoxGeometry(0.04, 0.45, 0.04), lx, 0.22, lz, '#6e4a28');
}

// ---------- Deck with railing, umbrellas and benches ----------

/**
 * The low stone wall with a wooden deck on top, running along z at the sea's edge (the sand side is at
 * `sandX`, the deck reaches `width` towards the sea), a railing on the sea side, closed umbrellas and
 * benches. The wall goes down into the water.
 */
export function addDeck(merger: Merger, sandX: number, width: number, fromZ: number, toZ: number, height: number, umbrellaEvery: number): void {
  const length = toZ - fromZ;
  const midZ = (fromZ + toZ) / 2;
  const seaX = sandX - width;
  // Stone wall: a face towards the sand, and a tall one into the sea.
  merger.add(new THREE.BoxGeometry(width, height + 2.2, length), at(sandX - width / 2, (height - 2.2) / 2, midZ), '#b8ad98');
  merger.add(new THREE.BoxGeometry(width + 0.08, 0.08, length + 0.08), at(sandX - width / 2, height + 0.04, midZ), '#9e7448');
  // Deck planks: thin strips across the deck, alternately lighter and darker.
  for (let z = fromZ + 0.2; z < toZ; z += 0.4) {
    merger.add(new THREE.BoxGeometry(width - 0.05, 0.03, 0.36), at(sandX - width / 2, height + 0.095, z), Math.round(z / 0.4) % 2 ? '#b98552' : '#a9774a');
  }
  // Railing on the sea side: posts and two rails.
  for (let z = fromZ; z <= toZ + 0.01; z += 1.25) merger.add(new THREE.BoxGeometry(0.09, 0.95, 0.09), at(seaX + 0.12, height + 0.55, z), '#8b5e34');
  for (const y of [0.55, 0.98]) merger.add(new THREE.BoxGeometry(0.07, 0.07, length), at(seaX + 0.12, height + y, midZ), '#9b6a3c');
  // Closed patio umbrellas with a bench between each pair.
  for (let z = fromZ + umbrellaEvery / 2; z < toZ; z += umbrellaEvery) {
    addClosedUmbrella(merger, seaX + width * 0.55, height + 0.1, z);
    const bz = z + umbrellaEvery / 2;
    if (bz < toZ - 1) addBench(merger, seaX + width * 0.45, height + 0.1, bz);
  }
}

/** A closed patio umbrella: a pole on a heavy foot, the folded green canopy like a long teardrop. */
function addClosedUmbrella(merger: Merger, x: number, y: number, z: number): void {
  merger.add(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 10), at(x, y + 0.06, z), '#3d4a3f');
  merger.add(new THREE.CylinderGeometry(0.035, 0.035, 2.9, 6), at(x, y + 1.45, z), '#e8e2d6');
  const canopy = new THREE.LatheGeometry(
    [0, 0.12, 0.2, 0.22, 0.2, 0.12, 0.05, 0].map((r, k) => new THREE.Vector2(r, k * 0.27)),
    9,
  );
  merger.add(canopy, at(x, y + 1.15, z), '#2f6b46');
  merger.add(new THREE.ConeGeometry(0.05, 0.18, 6), at(x, y + 3.05, z), '#e8e2d6');
}

function addBench(merger: Merger, x: number, y: number, z: number): void {
  merger.add(new THREE.BoxGeometry(0.45, 0.06, 1.5), at(x, y + 0.45, z), '#a9743f');
  for (const dz of [-0.6, 0.6]) merger.add(new THREE.BoxGeometry(0.4, 0.45, 0.07), at(x, y + 0.22, z + dz), '#6e4a28');
}

// ---------- Rocks ----------

/** A dark, faceted lump of volcanic rock. */
export function addRock(merger: Merger, x: number, y: number, z: number, size: number, random: () => number): void {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const position = geometry.getAttribute('position');
  const moved = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
    let s = moved.get(key);
    if (s === undefined) moved.set(key, (s = 0.7 + random() * 0.5));
    position.setXYZ(i, position.getX(i) * s, position.getY(i) * s * 0.7, position.getZ(i) * s);
  }
  geometry.computeVertexNormals();
  const shade = 0.16 + random() * 0.08;
  merger.add(geometry, at(x, y + size * 0.2, z, random() * 6, 0, 0, new THREE.Vector3(size * (1 + random() * 0.4), size, size)), new THREE.Color(shade, shade * 0.95, shade * 1.05));
}

// ---------- Feather flags ----------

/**
 * A tall feather flag: a thin pole that bends over at the top and a long banner hanging from it. The
 * banner's free edge flutters (sway grows away from the pole). UVs map the banner onto the flag texture.
 */
export function featherFlag(height: number, width: number): THREE.BufferGeometry {
  const rows = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const sways: number[] = [];
  // The pole's line: straight up, then curving over to the side at the top.
  const pole = (t: number): THREE.Vector2 => {
    const y = 0.35 + t * (height - 0.35);
    const bend = Math.max(0, t - 0.7) / 0.3;
    return new THREE.Vector2(bend * bend * width * 0.9, y + (t > 0.7 ? -bend * bend * 0.15 : 0));
  };
  for (let k = 0; k <= rows; k++) {
    const t = k / rows;
    const p = pole(t);
    // Banner width: narrow at the bottom, full in the middle, rounded at the top.
    const w = width * (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.5)) * (t > 0.85 ? 1 - (t - 0.85) * 2.5 : 1);
    positions.push(p.x, p.y, 0, p.x + w, p.y - 0.05, 0);
    uvs.push(0, t, 1, t);
    sways.push(0.05 * t, 0.4 + 0.6 * t);
    if (k < rows) {
      const a = k * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('sway', new THREE.Float32BufferAttribute(sways, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Our own flag design: green with a lighter edge and a white shuttlecock icon (no real logos). */
export function flagTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const c = canvas.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, '#1f8a4c');
  g.addColorStop(1, '#2fb866');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 512);
  c.fillStyle = '#e9fff2';
  c.fillRect(0, 0, 10, 512);
  // A shuttlecock icon near the top of the banner (the banner's top, v = 1, is the canvas top).
  c.save();
  c.translate(66, 130);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(-26, -40);
  c.lineTo(26, -40);
  c.lineTo(12, 22);
  c.lineTo(-12, 22);
  c.closePath();
  c.fill();
  c.fillStyle = '#ff7a59';
  c.beginPath();
  c.arc(0, 32, 14, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // A little cube mark below it, our Cube World sign.
  c.save();
  c.translate(66, 250);
  c.rotate(0.3);
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.fillRect(-16, -16, 32, 32);
  c.fillStyle = '#2fb866';
  c.fillRect(-8, -8, 16, 16);
  c.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
