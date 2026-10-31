import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';

// The shuttle and the rackets. The court and everything around it (the venue) is built in venue/.

/**
 * The shuttle, built pointing along +y (cork at the origin, feathers above), so in flight it goes cork first.
 * Two looks (TUNING.badminton.shuttleStyle): 'classic' = white feather skirt and a coral cork, a thin dark outline
 * and a soft glow; 'red' = the glowing red shuttle, refined with the same shape.
 */
export function buildShuttle(): THREE.Group {
  const look = TUNING.badminton.shuttleLooks[TUNING.badminton.shuttleStyle];
  const shuttle = new THREE.Group();
  const corkMaterial = new THREE.MeshStandardMaterial({ color: look.cork, emissive: look.cork, emissiveIntensity: look.glow, roughness: 0.55 });
  const featherMaterial = new THREE.MeshStandardMaterial({
    color: look.feathers,
    emissive: look.feathers,
    emissiveIntensity: look.glow * 0.6,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  const ribMaterial = new THREE.MeshStandardMaterial({ color: look.ribs, roughness: 0.6 });
  const bandMaterial = new THREE.MeshStandardMaterial({ color: look.band, roughness: 0.5 });

  // Cork: a rounded nose (half a sphere) and a short base where the feathers start.
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), corkMaterial);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 16), corkMaterial);
  base.position.y = 0.015;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.01, 16), bandMaterial);
  band.position.y = 0.028;
  // Feather skirt: an open cone, scalloped at the rim (each feather tip), with a rib per feather.
  const feathers = 16;
  const skirtHeight = 0.13;
  const skirt = new THREE.Mesh(scallopedCone(0.032, 0.088, skirtHeight, feathers), featherMaterial);
  skirt.position.y = 0.03;
  shuttle.add(nose, base, band, skirt);
  const ribGeometry = new THREE.CylinderGeometry(0.0025, 0.0025, 1, 4);
  for (let i = 0; i < feathers; i++) {
    const angle = (i / feathers) * Math.PI * 2;
    const from = new THREE.Vector3(Math.cos(angle) * 0.032, 0.03, Math.sin(angle) * 0.032);
    const to = new THREE.Vector3(Math.cos(angle) * 0.09, 0.03 + skirtHeight, Math.sin(angle) * 0.09);
    const rib = new THREE.Mesh(ribGeometry, ribMaterial);
    rib.position.copy(from).lerp(to, 0.5);
    rib.scale.y = from.distanceTo(to);
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    shuttle.add(rib);
  }
  // Two thread rings holding the feathers together.
  for (const k of [0.35, 0.6]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032 + (0.088 - 0.032) * k, 0.0025, 4, 24), ribMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03 + skirtHeight * k;
    shuttle.add(ring);
  }
  shuttle.traverse((o) => (o.castShadow = true));

  // A thin dark outline (the inside of a slightly bigger copy), so it stands out against the sand and the sky.
  if (look.outline) {
    const outline = new THREE.MeshBasicMaterial({ color: look.outline, side: THREE.BackSide });
    const hull = new THREE.Group();
    const noseHull = new THREE.Mesh(nose.geometry, outline);
    const baseHull = new THREE.Mesh(base.geometry, outline);
    baseHull.position.copy(base.position);
    const skirtHull = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.032, skirtHeight, feathers, 1, true), outline);
    skirtHull.position.y = 0.03 + skirtHeight / 2;
    hull.add(noseHull, baseHull, skirtHull);
    hull.scale.setScalar(1.12);
    hull.position.y = -0.004;
    shuttle.add(hull);
  }
  // A soft glow around it.
  if (look.halo > 0) {
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: look.haloColour, transparent: true, opacity: look.halo, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.scale.setScalar(0.42);
    halo.position.y = 0.07;
    shuttle.add(halo);
  }
  return shuttle;
}

/**
 * A racket for a character's hand, in the arm's own coordinates (the arm hangs along -y, the hand is at
 * y = -0.17): grip tape in the player's colour, a thin shaft, the T-joint and an oval head with a string grid.
 * Sized for our chibis (about as long as before, from the hand); TUNING.badminton.racketScale makes it bigger or
 * smaller. The frame takes the player's colour too.
 * Named children: 'tip' (top of the head) and 'throat' (where the head starts), for the swing trail;
 * the materials named 'frame' and 'grip' can be recoloured (see setRacketColour).
 */
export function buildRacket(colour: string): THREE.Group {
  const racket = new THREE.Group();
  const s = TUNING.badminton.racketScale;
  const hand = -0.17;
  const frame = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.1, name: 'frame' });
  const grip = new THREE.MeshStandardMaterial({ map: gripTexture(), color: colour, roughness: 0.9, name: 'grip' });
  const metal = new THREE.MeshStandardMaterial({ color: '#d7dde4', roughness: 0.3, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.5 });

  // Along the racket (from the hand down): grip, cap, shaft, T-joint, head.
  const gripLength = 0.09 * s;
  const shaftLength = 0.1 * s;
  const headHalfHeight = 0.085 * s;
  const headHalfWidth = 0.068 * s;
  const gripTop = hand + 0.035 * s;
  const gripMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * s, 0.018 * s, gripLength, 10), grip);
  gripMesh.position.y = gripTop - gripLength / 2;
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.012 * s, 10), dark);
  butt.position.y = gripTop + 0.006 * s;
  const shaftTop = gripTop - gripLength;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * s, 0.006 * s, shaftLength, 6), metal);
  shaft.position.y = shaftTop - shaftLength / 2;
  const throatY = shaftTop - shaftLength;
  const joint = new THREE.Mesh(new THREE.ConeGeometry(0.018 * s, 0.035 * s, 8), frame);
  joint.position.y = throatY + 0.012 * s;
  const centreY = throatY - headHalfHeight;
  const head = new THREE.Mesh(new THREE.TorusGeometry(1, 0.085, 8, 36), frame);
  head.scale.set(headHalfWidth, headHalfHeight, 0.1 * s);
  head.position.y = centreY;
  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(1, 36),
    new THREE.MeshBasicMaterial({ map: stringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  strings.scale.set(headHalfWidth * 0.97, headHalfHeight * 0.97, 1);
  strings.position.y = centreY;
  racket.add(gripMesh, butt, shaft, joint, head, strings);
  racket.traverse((o) => (o.castShadow = true));
  strings.castShadow = false;

  const tip = new THREE.Object3D();
  tip.name = 'tip';
  tip.position.y = centreY - headHalfHeight;
  const throat = new THREE.Object3D();
  throat.name = 'throat';
  throat.position.y = throatY;
  racket.add(tip, throat);
  return racket;
}

/** Recolours a racket from buildRacket (frame and grip tape) in a player's colour. */
export function setRacketColour(racket: THREE.Object3D, colour: string): void {
  racket.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m instanceof THREE.MeshStandardMaterial && (m.name === 'frame' || m.name === 'grip')) m.color.set(colour);
  });
}

/** An open cone from radius r0 (bottom, y = 0) to r1 (top, y = height) whose rim dips between feather tips. */
function scallopedCone(r0: number, r1: number, height: number, feathers: number): THREE.BufferGeometry {
  const segments = feathers * 4;
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    // Rim height: full at each feather tip, a little lower between tips.
    const between = Math.abs(Math.sin((i / segments) * Math.PI * feathers));
    const top = height * (1 - 0.12 * between);
    const r = r0 + (r1 - r0) * (top / height);
    positions.push(Math.cos(angle) * r0, 0, Math.sin(angle) * r0, Math.cos(angle) * r, top, Math.sin(angle) * r);
    if (i < segments) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

let glow: THREE.Texture | null = null;
/** A soft round glow (white in the middle, fading out). */
function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

let stringGrid: THREE.Texture | null = null;
/** The racket's string grid: thin white lines on transparent. */
function stringTexture(): THREE.Texture {
  if (stringGrid) return stringGrid;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  for (let i = 8; i < 128; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  stringGrid = new THREE.CanvasTexture(canvas);
  stringGrid.colorSpace = THREE.SRGBColorSpace;
  stringGrid.anisotropy = 4;
  return stringGrid;
}

let wrap: THREE.Texture | null = null;
/** Grip tape: white with soft diagonal wrap lines (tinted by the material colour). */
function gripTexture(): THREE.Texture {
  if (wrap) return wrap;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 32, 64);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 3;
  for (let y = -32; y < 96; y += 12) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(32, y + 16);
    ctx.stroke();
  }
  wrap = new THREE.CanvasTexture(canvas);
  wrap.colorSpace = THREE.SRGBColorSpace;
  wrap.wrapS = wrap.wrapT = THREE.RepeatWrapping;
  wrap.repeat.set(1, 2);
  return wrap;
}
